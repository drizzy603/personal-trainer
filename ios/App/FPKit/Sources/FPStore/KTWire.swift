import Foundation

/// The page's exact UTF-16 code units, as `localStorage` holds them: a lone surrogate (half an emoji cut by a
/// `.slice`), U+2028 and NUL included. FPStore never turns a value into a Swift `String` or SQLite TEXT, which
/// would damage exactly those units (datalayer probe6).
public typealias U16 = [UInt16]

/// A `localStorage` key, compared by its UTF-16 code units the way WebKit compares keys.
///
/// A Swift `String` compares by canonical equivalence (U+00E9 equals "e" + U+0301), so two keys WebKit keeps
/// apart would collide in a `[String: ...]`. Keys must be well-formed UTF-16: a key holding a lone surrogate cannot be
/// stored as SQLite TEXT exactly, so the store refuses it (no page code builds one).
public struct KTKey: Hashable, Comparable, Sendable, CustomStringConvertible, ExpressibleByStringLiteral {
    public let units: U16

    /// nil when `units` holds a lone surrogate.
    public init?(units: U16) {
        guard KTWire.isWellFormed(units) else { return nil }
        self.units = units
    }

    public init(_ string: String) { units = Array(string.utf16) }
    public init(stringLiteral value: String) { self.init(value) }

    /// The key as text (exact: a key is always well-formed).
    public var string: String { String(decoding: units, as: UTF16.self) }
    public var description: String { string }

    /// Code-unit order, which is JavaScript's string order.
    public static func < (a: KTKey, b: KTKey) -> Bool { a.units.lexicographicallyPrecedes(b.units) }

    public func hasPrefix(_ prefix: String) -> Bool { units.starts(with: prefix.utf16) }
}

/// The storage channel's wire format (proto 1): JSON string literals in exact UTF-16, and the value hash the
/// facade computes with the same arithmetic (`H()` in ktstore.js).
public enum KTWire {
    /// The hash of an absent value (a key WebKit does not hold, or a tombstone).
    public static let absent = "-"

    // MARK: Hash

    /// `len:fnv1a32:djb2` over the UTF-16 code units, lowercase hex without padding, exactly as ktstore.js's
    /// `H(s)` computes it (`Math.imul(a ^ c, 0x01000193) >>> 0` and `(Math.imul(b, 33) + c) >>> 0`). nil gives "-".
    public static func hash(_ u: U16?) -> String {
        guard let u else { return absent }
        return u.withUnsafeBufferPointer { hash($0) }
    }

    public static func hash(_ p: UnsafeBufferPointer<UInt16>) -> String {
        var a: UInt32 = 0x811c_9dc5, b: UInt32 = 5381
        if let base = p.baseAddress {
            var i = 0
            let n = p.count
            while i < n {
                let c = UInt32(base[i])
                a = (a ^ c) &* 0x0100_0193
                b = b &* 33 &+ c
                i += 1
            }
        }
        return "\(p.count):\(String(a, radix: 16)):\(String(b, radix: 16))"
    }

    // MARK: Well-formedness

    /// true when every surrogate half is part of a pair.
    public static func isWellFormed<C: Collection>(_ u: C) -> Bool where C.Element == UInt16 {
        var wantLow = false
        for c in u {
            if wantLow {
                guard c & 0xFC00 == 0xDC00 else { return false }
                wantLow = false
            } else if c & 0xFC00 == 0xD800 {
                wantLow = true
            } else if c & 0xFC00 == 0xDC00 {
                return false
            }
        }
        return !wantLow
    }

    // MARK: Literals

    /// One JSON string literal (quotes included) to its exact code units. A `\udXXX` escape gives back a lone
    /// surrogate (JSONSerialization and JSONDecoder reject those, probe6). nil when the literal is malformed.
    public static func unquote(_ lit: U16) -> U16? { lit.withUnsafeBufferPointer { unquote($0) } }

    public static func unquote(_ lit: ArraySlice<UInt16>) -> U16? { lit.withUnsafeBufferPointer { unquote($0) } }

    public static func unquote(_ lit: UnsafeBufferPointer<UInt16>) -> U16? {
        let n = lit.count
        guard n >= 2, let p = lit.baseAddress, p[0] == 0x22, p[n - 1] == 0x22 else { return nil }
        var out = U16()
        out.reserveCapacity(n - 2)
        var i = 1
        let end = n - 1
        while i < end {
            let c = p[i]
            if c == 0x22 { return nil }  // an unescaped quote inside the literal
            if c != 0x5C { out.append(c); i += 1; continue }
            i += 1
            guard i < end else { return nil }
            switch p[i] {
            case 0x22: out.append(0x22)
            case 0x5C: out.append(0x5C)
            case 0x2F: out.append(0x2F)
            case 0x62: out.append(0x08)
            case 0x66: out.append(0x0C)
            case 0x6E: out.append(0x0A)
            case 0x72: out.append(0x0D)
            case 0x74: out.append(0x09)
            case 0x75:
                guard i + 4 < end else { return nil }
                var x: UInt16 = 0
                for j in 1...4 {
                    guard let d = hexValue(p[i + j]) else { return nil }
                    x = x << 4 | d
                }
                out.append(x)
                i += 4
            default:
                return nil
            }
            i += 1
        }
        return out
    }

    /// Exact code units to a JSON string literal that `JSON.parse` turns back into the same units. It escapes
    /// what JSON.stringify escapes (quote, backslash, `\b \f \n \r \t`, other controls as `\u00xx`) and also every
    /// surrogate half (paired or not) and U+2028/U+2029, so the text holds only well-formed units and survives
    /// any transport, a Swift `String` included.
    public static func quote(_ u: U16) -> String { u.withUnsafeBufferPointer { quote($0) } }

    public static func quote(_ key: KTKey) -> String { quote(key.units) }

    public static func quote(_ p: UnsafeBufferPointer<UInt16>) -> String {
        var out = U16()
        out.reserveCapacity(p.count + 2)
        out.append(0x22)
        if let base = p.baseAddress {
            var i = 0
            let n = p.count
            while i < n {
                let c = base[i]
                switch escapeKind(c) {
                case 0: out.append(c)
                case 1: out.append(0x5C); out.append(shortEscape(c))
                default:
                    out.append(0x5C); out.append(0x75)
                    out.append(hexDigit(c >> 12)); out.append(hexDigit(c >> 8))
                    out.append(hexDigit(c >> 4)); out.append(hexDigit(c))
                }
                i += 1
            }
        }
        out.append(0x22)
        return String(decoding: out, as: UTF16.self)  // exact: every surrogate half was escaped
    }

    /// The same literal as `quote`, appended as UTF-8 bytes (snapshots and exports). Written with raw pointers so
    /// a 2 MB snapshot stays fast in a debug build too.
    public static func appendQuotedUTF8(_ p: UnsafeBufferPointer<UInt16>, to out: inout [UInt8]) {
        let n = p.count
        let start = out.count
        // Worst case: every unit as a 6-byte \uXXXX escape, plus the quotes.
        out.append(contentsOf: repeatElement(0, count: n * 6 + 2))
        var w = start
        out.withUnsafeMutableBufferPointer { buf in
            guard let o = buf.baseAddress else { return }
            o[w] = 0x22; w += 1
            if let base = p.baseAddress {
                var i = 0
                while i < n {
                    let c = base[i]
                    if c >= 0x20 && c < 0x80 && c != 0x22 && c != 0x5C {
                        o[w] = UInt8(truncatingIfNeeded: c); w += 1
                    } else {
                        switch escapeKind(c) {
                        case 0:
                            if c < 0x80 {
                                o[w] = UInt8(truncatingIfNeeded: c); w += 1
                            } else if c < 0x800 {
                                o[w] = UInt8(truncatingIfNeeded: 0xC0 | (c >> 6))
                                o[w + 1] = UInt8(truncatingIfNeeded: 0x80 | (c & 0x3F))
                                w += 2
                            } else {  // a BMP unit that is not a surrogate (escapeKind sends those to \u)
                                o[w] = UInt8(truncatingIfNeeded: 0xE0 | (c >> 12))
                                o[w + 1] = UInt8(truncatingIfNeeded: 0x80 | ((c >> 6) & 0x3F))
                                o[w + 2] = UInt8(truncatingIfNeeded: 0x80 | (c & 0x3F))
                                w += 3
                            }
                        case 1:
                            o[w] = 0x5C
                            o[w + 1] = UInt8(truncatingIfNeeded: shortEscape(c))
                            w += 2
                        default:
                            o[w] = 0x5C; o[w + 1] = 0x75
                            o[w + 2] = UInt8(truncatingIfNeeded: hexDigit(c >> 12))
                            o[w + 3] = UInt8(truncatingIfNeeded: hexDigit(c >> 8))
                            o[w + 4] = UInt8(truncatingIfNeeded: hexDigit(c >> 4))
                            o[w + 5] = UInt8(truncatingIfNeeded: hexDigit(c))
                            w += 6
                        }
                    }
                    i += 1
                }
            }
            o[w] = 0x22; w += 1
        }
        out.removeSubrange(w..<out.count)
    }

    public static func appendQuotedUTF8(_ u: U16, to out: inout [UInt8]) {
        u.withUnsafeBufferPointer { appendQuotedUTF8($0, to: &out) }
    }

    /// 0: as is; 1: a two-character escape; 2: `\uXXXX`.
    @inline(__always)
    static func escapeKind(_ c: UInt16) -> Int {
        switch c {
        case 0x22, 0x5C, 0x08, 0x0C, 0x0A, 0x0D, 0x09: return 1
        case 0..<0x20, 0xD800...0xDFFF, 0x2028, 0x2029: return 2
        default: return 0
        }
    }

    @inline(__always)
    static func shortEscape(_ c: UInt16) -> UInt16 {
        switch c {
        case 0x22: return 0x22
        case 0x5C: return 0x5C
        case 0x08: return 0x62
        case 0x0C: return 0x66
        case 0x0A: return 0x6E
        case 0x0D: return 0x72
        default: return 0x74  // tab
        }
    }

    @inline(__always)
    static func hexDigit(_ v: UInt16) -> UInt16 {
        let d = v & 0xF
        return d < 10 ? 0x30 + d : 0x57 + d  // lowercase, like JSON.stringify
    }

    @inline(__always)
    static func hexValue(_ d: UInt16) -> UInt16? {
        switch d {
        case 0x30...0x39: return d - 0x30
        case 0x41...0x46: return d - 0x37
        case 0x61...0x66: return d - 0x57
        default: return nil
        }
    }

    // MARK: Payloads

    /// A payload is newline-joined JSON literals; JSON.stringify never emits a raw newline. An empty payload has
    /// no lines.
    public static func lines(_ s: String?) -> [ArraySlice<UInt16>] {
        guard let s, !s.isEmpty else { return [] }
        let u = Array(s.utf16)
        return u.split(separator: 0x0A, omittingEmptySubsequences: false)
    }

    /// The four characters `null`: an absent value in a `put` or `p` pair.
    public static func isNull(_ line: ArraySlice<UInt16>) -> Bool {
        line.elementsEqual("null".utf16)
    }
}

// MARK: - Exact JSON scanning

/// A small JSON scanner over exact UTF-16 that never re-serializes: it finds the code-unit ranges of a value's
/// parts, so records keep every field and every byte (wSet, wk0, hkOrig, rec, recOut, mainBy, _w, _clock, away)
/// and lone-surrogate escapes stay as they are. Used for the gap note, snapshot files and Put back's merge.
enum KTJSON {
    @inline(__always)
    static func isSpace(_ c: UInt16) -> Bool { c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D }

    static func skipSpace(_ u: U16, _ i: Int, _ end: Int) -> Int {
        var i = i
        while i < end, isSpace(u[i]) { i += 1 }
        return i
    }

    /// The end of the string literal starting at `i` (one past its closing quote).
    static func skipString(_ u: U16, _ i: Int, _ end: Int) -> Int? {
        guard i < end, u[i] == 0x22 else { return nil }
        var j = i + 1
        while j < end {
            let c = u[j]
            if c == 0x5C { j += 2; continue }
            if c == 0x22 { return j + 1 }
            j += 1
        }
        return nil
    }

    /// The end of the JSON value starting at `i` (after whitespace), or nil when it is malformed. Containers are
    /// walked with an explicit stack, so deep nesting cannot overflow the call stack.
    static func skipValue(_ u: U16, _ i: Int, _ end: Int) -> Int? {
        var j = skipSpace(u, i, end)
        guard j < end else { return nil }
        let c = u[j]
        if c == 0x22 { return skipString(u, j, end) }
        if c == 0x7B || c == 0x5B {
            var closers: [UInt16] = []
            while j < end {
                let d = u[j]
                switch d {
                case 0x22:
                    guard let k = skipString(u, j, end) else { return nil }
                    j = k
                    continue
                case 0x7B: closers.append(0x7D)
                case 0x5B: closers.append(0x5D)
                case 0x7D, 0x5D:
                    guard closers.last == d else { return nil }
                    closers.removeLast()
                    if closers.isEmpty { return j + 1 }
                default: break
                }
                j += 1
            }
            return nil
        }
        // A number, true, false or null: up to the next delimiter.
        let start = j
        while j < end {
            let d = u[j]
            if d == 0x2C || d == 0x5D || d == 0x7D || isSpace(d) { break }
            j += 1
        }
        return j > start ? j : nil
    }

    /// The element ranges of the JSON array that spans all of `u` (whitespace aside). nil when `u` is not one.
    static func arrayElements(_ u: U16) -> [Range<Int>]? {
        let end = u.count
        var i = skipSpace(u, 0, end)
        guard i < end, u[i] == 0x5B else { return nil }
        i += 1
        var out: [Range<Int>] = []
        i = skipSpace(u, i, end)
        if i < end, u[i] == 0x5D {
            return skipSpace(u, i + 1, end) == end ? out : nil
        }
        while i < end {
            let s = skipSpace(u, i, end)
            guard let e = skipValue(u, s, end) else { return nil }
            out.append(s..<e)
            i = skipSpace(u, e, end)
            guard i < end else { return nil }
            if u[i] == 0x2C { i += 1; continue }
            if u[i] == 0x5D { return skipSpace(u, i + 1, end) == end ? out : nil }
            return nil
        }
        return nil
    }

    /// The members of the JSON object in `range`: each key (unescaped) and its value's range. nil when the
    /// range does not hold exactly one object.
    static func objectMembers(_ u: U16, _ range: Range<Int>) -> [(key: U16, value: Range<Int>)]? {
        let end = range.upperBound
        var i = skipSpace(u, range.lowerBound, end)
        guard i < end, u[i] == 0x7B else { return nil }
        i = skipSpace(u, i + 1, end)
        var out: [(key: U16, value: Range<Int>)] = []
        if i < end, u[i] == 0x7D {
            return skipSpace(u, i + 1, end) == end ? out : nil
        }
        while i < end {
            guard let ke = skipString(u, i, end), let key = KTWire.unquote(u[i..<ke]) else { return nil }
            i = skipSpace(u, ke, end)
            guard i < end, u[i] == 0x3A else { return nil }
            let vs = skipSpace(u, i + 1, end)
            guard let ve = skipValue(u, vs, end) else { return nil }
            out.append((key, vs..<ve))
            i = skipSpace(u, ve, end)
            guard i < end else { return nil }
            if u[i] == 0x2C { i = skipSpace(u, i + 1, end); continue }
            if u[i] == 0x7D { return skipSpace(u, i + 1, end) == end ? out : nil }
            return nil
        }
        return nil
    }

    static func objectMembers(_ u: U16) -> [(key: U16, value: Range<Int>)]? { objectMembers(u, 0..<u.count) }

    /// The string a string token holds, or nil when the token is not a string.
    static func string(_ u: U16, _ range: Range<Int>) -> U16? {
        guard range.count >= 2, u[range.lowerBound] == 0x22 else { return nil }
        return KTWire.unquote(u[range])
    }

    /// A number token (or a short ASCII token) as text.
    static func ascii(_ u: U16, _ range: Range<Int>) -> String {
        String(decoding: u[range], as: UTF16.self)
    }
}
