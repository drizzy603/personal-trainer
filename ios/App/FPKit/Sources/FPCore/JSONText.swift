import Foundation

/// JSON text from the page, made safe for Foundation before it is decoded (plan task C4).
///
/// The page builds every model with `_nativeJSON` (index.html), which drops half an emoji from every
/// string, because Foundation's JSON parsers refuse a whole document over one lone surrogate escape
/// (`\ud83d` with no low half: "Missing low code point in surrogate pair", datalayer probe6). Swift
/// mends again before decoding, so a page that skips `_nativeJSON` somewhere (an older page, a new
/// field, a bug) costs half an emoji, never the whole model.
///
/// Mending works on the text's UTF-16 code units, inside and outside JSON string literals:
/// - a surrogate pair stays, written raw or as escapes, and even split between the two forms
///   (a raw high half then `\udc00`, as JavaScript would read it);
/// - a lone half, raw or escaped, is dropped (`.drop`, the default: what `_wellFormed` does in the
///   page, so a string reads the same whichever side mended it) or becomes U+FFFD (`.replace`);
/// - an escaped backslash (`\\ud83d`) is text, not an escape, and is left alone.
///
/// A Swift `String` bridged from an `NSString` already holds U+FFFD where the page had a raw lone
/// surrogate (Foundation repairs it while bridging), so raw halves only reach this code as code units,
/// through `mend(units:)`, or as UTF-8 that encodes a surrogate (`mend(utf8:)`).
public enum JSONText {
    public enum Mode: Sendable {
        /// Drop a lone half, as the page's `_wellFormed` does.
        case drop
        /// Put U+FFFD in its place.
        case replace
    }

    public enum Failure: Error, Equatable, CustomStringConvertible {
        case notJSON(String)
        case wrongShape(String)

        public var description: String {
            switch self {
            case .notJSON(let why): return "not JSON: \(why)"
            case .wrongShape(let why): return "unexpected JSON: \(why)"
            }
        }
    }

    // MARK: Mending

    /// The text with every lone surrogate mended. Text with none comes back as it is.
    public static func mend(_ text: String, mode: Mode = .drop) -> String {
        let units = Array(text.utf16)
        guard needsMending(units) else { return text }
        return String(decoding: mend(units: units, mode: mode), as: UTF16.self)
    }

    /// The same for UTF-16 code units, such as an `NSString`'s characters read before bridging.
    public static func mend(units: [UInt16], mode: Mode = .drop) -> [UInt16] {
        guard needsMending(units) else { return units }
        return mendCounting(units, mode: mode).units
    }

    /// The mended units and how many lone halves were dropped or replaced.
    private static func mendCounting(_ units: [UInt16], mode: Mode) -> (units: [UInt16], lone: Int) {
        var lone = 0
        var out: [UInt16] = []
        out.reserveCapacity(units.count)
        var i = 0
        var inString = false
        while i < units.count {
            let c = units[i]
            if c == quote {
                inString.toggle()
                out.append(c)
                i += 1
                continue
            }
            if inString && c == backslash && !isUnicodeEscape(units, at: i) {
                // \" \\ \/ \b \f \n \r \t (or a broken escape the parser will refuse): copy it whole, so
                // the quote or backslash it escapes is never read as structure.
                out.append(c)
                if i + 1 < units.count { out.append(units[i + 1]) }
                i += 2
                continue
            }
            guard let token = unit(units, at: i, inString: inString) else {
                out.append(c)
                i += 1
                continue
            }
            if isHigh(token.value), let next = unit(units, at: i + token.length, inString: inString), isLow(next.value) {
                if token.escaped || next.escaped {
                    appendEscape(token.value, to: &out)
                    appendEscape(next.value, to: &out)
                } else {
                    out.append(token.value)
                    out.append(next.value)
                }
                i += token.length + next.length
            } else if isHigh(token.value) || isLow(token.value) {
                lone += 1
                if mode == .replace {
                    if inString { appendEscape(0xFFFD, to: &out) } else { out.append(0xFFFD) }
                }
                i += token.length
            } else {
                out.append(contentsOf: units[i ..< i + token.length])
                i += token.length
            }
        }
        return (out, lone)
    }

    /// UTF-8 bytes mended the same way. Bytes that encode a surrogate (CESU-8 or WTF-8, as some
    /// encoders write half an emoji) are read as that surrogate, so a pair written that way is kept and
    /// a lone half is mended; any other invalid byte becomes U+FFFD.
    public static func mend(utf8 data: Data, mode: Mode = .drop) -> Data {
        if data.allSatisfy({ $0 < 0x80 }) {
            // ASCII only: only escapes can need mending
            let units = data.map { UInt16($0) }
            guard needsMending(units) else { return data }
            return Data(String(decoding: mend(units: units, mode: mode), as: UTF16.self).utf8)
        }
        let units = decodeLenientUTF8(data)
        return Data(String(decoding: mend(units: units, mode: mode), as: UTF16.self).utf8)
    }

    /// One string value (not JSON text) with any lone surrogate in its code units mended.
    public static func mendString(_ s: String, mode: Mode = .drop) -> String {
        let units = Array(s.utf16)
        guard units.contains(where: isSurrogate) else { return s }
        var out: [UInt16] = []
        out.reserveCapacity(units.count)
        var i = 0
        while i < units.count {
            let c = units[i]
            if isHigh(c), i + 1 < units.count, isLow(units[i + 1]) {
                out.append(c)
                out.append(units[i + 1])
                i += 2
            } else if isSurrogate(c) {
                if mode == .replace { out.append(0xFFFD) }
                i += 1
            } else {
                out.append(c)
                i += 1
            }
        }
        return String(decoding: out, as: UTF16.self)
    }

    /// How many lone surrogates the text holds, raw or escaped (what `mend` drops or replaces).
    public static func loneSurrogates(in text: String) -> Int {
        loneSurrogates(inUnits: Array(text.utf16))
    }

    /// The same for UTF-16 code units.
    public static func loneSurrogates(inUnits units: [UInt16]) -> Int {
        needsMending(units) ? mendCounting(units, mode: .drop).lone : 0
    }

    // MARK: Decoding

    /// The mended text parsed into a `JSONValue`.
    public static func parse(_ text: String, mode: Mode = .drop) throws -> JSONValue {
        try parseMended(Data(mend(text, mode: mode).utf8))
    }

    /// Mended UTF-8 bytes parsed into a `JSONValue`.
    public static func parse(utf8 data: Data, mode: Mode = .drop) throws -> JSONValue {
        try parseMended(mend(utf8: data, mode: mode))
    }

    /// The mended text decoded as `T`.
    public static func decode<T: Decodable>(_ type: T.Type, from text: String, mode: Mode = .drop) throws -> T {
        try JSONDecoder().decode(type, from: Data(mend(text, mode: mode).utf8))
    }

    /// Mended UTF-8 bytes decoded as `T`.
    public static func decode<T: Decodable>(_ type: T.Type, from data: Data, mode: Mode = .drop) throws -> T {
        try JSONDecoder().decode(type, from: mend(utf8: data, mode: mode))
    }

    private static func parseMended(_ data: Data) throws -> JSONValue {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        } catch {
            throw Failure.notJSON((error as NSError).localizedDescription)
        }
        return try JSONValue(foundation: object)
    }

    // MARK: Code units

    private static let quote: UInt16 = 0x22
    private static let backslash: UInt16 = 0x5C
    private static let letterU: UInt16 = 0x75

    static func isHigh(_ u: UInt16) -> Bool { u >= 0xD800 && u <= 0xDBFF }
    static func isLow(_ u: UInt16) -> Bool { u >= 0xDC00 && u <= 0xDFFF }
    static func isSurrogate(_ u: UInt16) -> Bool { u >= 0xD800 && u <= 0xDFFF }

    /// A cheap first pass: any raw surrogate, or any `\u` escape of one (`\ud…`/`\uD…`, 8-f after).
    private static func needsMending(_ units: [UInt16]) -> Bool {
        var i = 0
        while i < units.count {
            let c = units[i]
            if isSurrogate(c) { return true }
            if c == backslash, i + 2 < units.count, units[i + 1] == letterU, units[i + 2] | 0x20 == 0x64 { return true }
            i += 1
        }
        return false
    }

    private static func isUnicodeEscape(_ units: [UInt16], at i: Int) -> Bool {
        hex4(units, at: i + 2) != nil && i + 1 < units.count && units[i + 1] == letterU
    }

    /// The code unit at `i`: a raw unit (length 1) or, inside a string, a `\uXXXX` escape (length 6).
    /// Nil for a quote, a backslash that starts any other escape, or the end.
    private static func unit(_ units: [UInt16], at i: Int, inString: Bool) -> (value: UInt16, length: Int, escaped: Bool)? {
        guard i < units.count else { return nil }
        let c = units[i]
        if c == quote { return nil }
        if c == backslash {
            guard inString, i + 1 < units.count, units[i + 1] == letterU, let v = hex4(units, at: i + 2) else { return nil }
            return (v, 6, true)
        }
        return (c, 1, false)
    }

    private static func hex4(_ units: [UInt16], at i: Int) -> UInt16? {
        guard i >= 0, i + 4 <= units.count else { return nil }
        var v: UInt16 = 0
        for d in units[i ..< i + 4] {
            let n: UInt16
            switch d {
            case 0x30...0x39: n = d - 0x30
            case 0x41...0x46: n = d - 0x37
            case 0x61...0x66: n = d - 0x57
            default: return nil
            }
            v = v << 4 | n
        }
        return v
    }

    private static func appendEscape(_ u: UInt16, to out: inout [UInt16]) {
        let hex = Array("0123456789abcdef".utf16)
        out.append(backslash)
        out.append(letterU)
        out.append(hex[Int(u >> 12) & 15])
        out.append(hex[Int(u >> 8) & 15])
        out.append(hex[Int(u >> 4) & 15])
        out.append(hex[Int(u) & 15])
    }

    /// UTF-8 to UTF-16 code units, keeping a 3-byte encoded surrogate (ED A0..BF xx) as that unit.
    static func decodeLenientUTF8(_ data: Data) -> [UInt16] {
        let b = [UInt8](data)
        var out: [UInt16] = []
        out.reserveCapacity(b.count)
        func cont(_ i: Int) -> Bool { i < b.count && b[i] & 0xC0 == 0x80 }
        var i = 0
        while i < b.count {
            let b0 = b[i]
            if b0 < 0x80 {
                out.append(UInt16(b0)); i += 1
            } else if b0 >= 0xC2 && b0 <= 0xDF && cont(i + 1) {
                out.append(UInt16(b0 & 0x1F) << 6 | UInt16(b[i + 1] & 0x3F)); i += 2
            } else if b0 >= 0xE0 && b0 <= 0xEF && cont(i + 1) && cont(i + 2) && !(b0 == 0xE0 && b[i + 1] < 0xA0) {
                out.append(UInt16(b0 & 0x0F) << 12 | UInt16(b[i + 1] & 0x3F) << 6 | UInt16(b[i + 2] & 0x3F)); i += 3
            } else if b0 >= 0xF0 && b0 <= 0xF4 && cont(i + 1) && cont(i + 2) && cont(i + 3)
                        && !(b0 == 0xF0 && b[i + 1] < 0x90) && !(b0 == 0xF4 && b[i + 1] > 0x8F) {
                let cp = UInt32(b0 & 0x07) << 18 | UInt32(b[i + 1] & 0x3F) << 12 | UInt32(b[i + 2] & 0x3F) << 6 | UInt32(b[i + 3] & 0x3F)
                let v = cp - 0x10000
                out.append(UInt16(0xD800 + (v >> 10)))
                out.append(UInt16(0xDC00 + (v & 0x3FF)))
                i += 4
            } else {
                out.append(0xFFFD); i += 1
            }
        }
        return out
    }
}

/// A JSON value: what a model, an intent's arguments or a plugin call's options hold before they are
/// read into Swift types. Reading is tolerant (`string`, `int`, … answer nil for another type), so a
/// newer page's extra fields and a missing optional field never fail a decode.
public enum JSONValue: Equatable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    // MARK: Reading

    public subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    public subscript(index: Int) -> JSONValue? {
        if case .array(let a) = self, a.indices.contains(index) { return a[index] }
        return nil
    }

    public var isNull: Bool { self == .null }

    public var string: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    public var bool: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }

    public var double: Double? {
        if case .number(let n) = self, n.isFinite { return n }
        return nil
    }

    /// The number as an Int when it is a whole number in Int's range.
    public var int: Int? {
        guard let n = double, n == n.rounded(), abs(n) < 9.007_199_254_740_992e15 else { return nil }
        return Int(n)
    }

    public var array: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }

    public var object: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }

    /// Every string in the value, depth first, objects in key order: the readable text of a block
    /// this build does not know, when it carries no `text` of its own.
    public func strings(skippingKeys skip: Set<String> = []) -> [String] {
        switch self {
        case .string(let s): return [s]
        case .array(let a): return a.flatMap { $0.strings(skippingKeys: skip) }
        case .object(let o):
            return o.keys.sorted().filter { !skip.contains($0) }.flatMap { o[$0]!.strings(skippingKeys: skip) }
        default: return []
        }
    }

    // MARK: Foundation

    /// From what JSONSerialization, a Capacitor plugin call's options or `callAsyncJavaScript` hand
    /// over: NSNull, NSNumber (a boolean stays a Bool), String, arrays, string-keyed dictionaries.
    public init(foundation object: Any) throws {
        switch object {
        case is NSNull:
            self = .null
        case let n as NSNumber:
            if CFGetTypeID(n) == CFBooleanGetTypeID() { self = .bool(n.boolValue) } else { self = .number(n.doubleValue) }
        case let s as String:
            self = .string(JSONText.mendString(s))
        case let a as [Any]:
            self = .array(try a.map { try JSONValue(foundation: $0) })
        case let d as [String: Any]:
            var o: [String: JSONValue] = [:]
            for (k, v) in d { o[JSONText.mendString(k)] = try JSONValue(foundation: v) }
            self = .object(o)
        case let d as [AnyHashable: Any]:
            var o: [String: JSONValue] = [:]
            for (k, v) in d {
                guard let key = k.base as? String else { throw JSONText.Failure.wrongShape("a non-string key \(k)") }
                o[JSONText.mendString(key)] = try JSONValue(foundation: v)
            }
            self = .object(o)
        default:
            throw JSONText.Failure.wrongShape("a \(type(of: object)) is not a JSON value")
        }
    }

    /// For `callAsyncJavaScript(arguments:)` and JSONSerialization: NSNull, Bool, Int or Double,
    /// String, [Any], [String: Any].
    public var foundation: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let b): return b
        case .number(let n): return int.map { $0 as Any } ?? n
        case .string(let s): return s
        case .array(let a): return a.map { $0.foundation }
        case .object(let o): return o.mapValues { $0.foundation }
        }
    }

    /// Compact JSON text, keys sorted (for logs, fixtures and comparisons).
    public var jsonText: String {
        let data = (try? JSONSerialization.data(withJSONObject: foundation, options: [.fragmentsAllowed, .sortedKeys, .withoutEscapingSlashes])) ?? Data("null".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}

extension JSONValue: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { throw DecodingError.dataCorruptedError(in: c, debugDescription: "not a JSON value") }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): if let i = int { try c.encode(i) } else { try c.encode(n) }
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral,
                     ExpressibleByFloatLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
    public init(floatLiteral value: Double) { self = .number(value) }
    public init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, JSONValue)...) {
        self = .object(Dictionary(elements, uniquingKeysWith: { _, last in last }))
    }
    public init(nilLiteral: ()) { self = .null }
}
