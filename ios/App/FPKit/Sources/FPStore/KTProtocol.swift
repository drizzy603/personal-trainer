import Foundation

/// The storage channel, proto 1: what the shell-owned facade (`Resources/ktstore.js`, plan task S3) sends and
/// what the store answers. Build 60 is shadow only: WebKit's `localStorage` stays in charge, the facade writes
/// WebKit first and then mirrors the write here, and the store never writes WebKit by itself.
///
/// **Transport.** `prompt('\u0001KT1 ' + head, payload)`, answered synchronously by the shell's KTUIProxy, which
/// hands `head` and `payload` to `KTStore.answer(head:payload:)`. When an answer is anything but `ok` (or none
/// comes), the facade posts `{head, payload}` to the `ktStore` script-message handler, which hands them to
/// `KTStore.post(head:payload:)`. A payload is newline-joined lines, each a JSON string literal made by
/// `JSON.stringify` (a lone surrogate travels as an ASCII `\udXXX` escape) or the four characters `null`.
///
/// **Ops.**
/// - `hello` / `hello nowk` at every document start. Payload: line 0 is WebKit's gap note (the value of
///   `kt__store_gap` as a literal, or `null`), then one pair of lines per key WebKit holds: the key and
///   `H(value)` (`len:fnv1a32:djb2`, see `KTWire.hash`). `nowk` (WebKit unreadable) has no payload. Answer: a
///   JSON object, `{"mode":"shadow","boot":B,"need":[keys],"rule":R,"label":L,"putback":P}` or
///   `{"mode":"off","why":W}`. With mode off the facade attaches nothing and the page runs on WebKit as today.
/// - `put`: pairs of (key, value literal or `null`), WebKit's current values for the keys `need` named, sent
///   right after hello (and only when `need` is not empty: any other put is a bad op). Answer `ok`, `full`,
///   `busy` or `err`. On anything but `ok` the facade attaches nothing for this document, as for mode off; the
///   page's own boot stamp then reaches WebKit alone, and the next document start adopts everything (rule 4).
/// - `w B:S` (payload: key, value), `d B:S` (payload: key) and `c B:S` (no payload): a set, a remove or a
///   clear WebKit has just taken. B is the boot id from hello, S counts the document's ops from 1. Answer
///   `ok`, `full`, `busy` or `err`. The same heads arrive as async posts, applied only when (B, S) is newer
///   than the key's last write.
/// - `pb` (no payload), sent once after hello's adoption when hello answered `"putback":true`: the store answers
///   a JSON object of the values the owner staged in Settings > About > Storage, `{"key":"value" or null}`. The
///   facade writes each into WebKit (real Storage, `null` = remove) before the page's first script, then sends
///   `p B:S` with pairs (key, value or `null`) for the ones WebKit took; answer `ok` or `err`.
///
/// **The gap note** is the facade's own key in WebKit, `kt__store_gap`, written with the real Storage (never
/// mirrored): `JSON.stringify({v:1, at:<ms>, k:{<key>: H(<WebKit's value after the op>) or '-'},
/// s:{<key>: '<B>:<S>'}})`, merged on every op whose mirror was not answered `ok` (`s` holds that op's stamp);
/// a failed clear writes `all:true`. The facade removes it after a hello answered `shadow` and its `put` (if
/// any) answered `ok`.
///
/// Reserved keys never enter the store: `kt_apikey` (passthrough: it stays in WebKit; a Keychain copy comes
/// later) and every key starting `kt__store` (the facade's bookkeeping).
public enum KTProtocol {
    public static let version = 1

    /// What the facade puts before every head.
    public static let promptPrefix = "\u{1}KT1 "

    /// The witness: stamped with `String(Date.now())` at every boot, return and departure by every installable
    /// page (index.html `_stampVisit`), and in no backup. A value the store has never seen means an older or
    /// facade-less build ran.
    public static let witnessKey: KTKey = "kt_last_open"

    /// The facade's gap note.
    public static let gapKey: KTKey = "kt__store_gap"

    /// Keys starting with this belong to the facade and the store, never to the page.
    public static let reservedPrefix = "kt__store"

    /// Kept out of the store entirely (kv, journal, conflicts, snaps, exports).
    public static let passthroughKeys: Set<KTKey> = ["kt_apikey"]

    /// The five date-sorted logs (index.html `_DATE_SORTED_KEYS`). A transaction that writes one commits with
    /// `synchronous=FULL`, and Put back merges them record by record.
    public static let logKeys: Set<KTKey> = ["kt_sessions", "kt_runs", "kt_sports", "kt_bw", "kt_measurements"]

    /// true for keys the store never keeps: the API key and the facade's own keys.
    public static func isReserved(_ key: KTKey) -> Bool {
        passthroughKeys.contains(key) || key.hasPrefix(reservedPrefix)
    }

    // MARK: Answers

    public enum Answer: String, Sendable {
        case ok, full, busy, err
    }

    // MARK: Heads

    /// The page's ordering stamp for one op: the boot id the store gave at hello and the op's number in that
    /// document.
    public struct BootSeq: Comparable, Hashable, Sendable, CustomStringConvertible {
        public var boot: Int64
        public var seq: Int64
        public init(boot: Int64, seq: Int64) { self.boot = boot; self.seq = seq }
        public static func < (a: BootSeq, b: BootSeq) -> Bool { (a.boot, a.seq) < (b.boot, b.seq) }
        public var description: String { "\(boot):\(seq)" }

        /// "B:S" with B >= 1 and S >= 0.
        init?(_ text: Substring) {
            let parts = text.split(separator: ":", omittingEmptySubsequences: false)
            guard parts.count == 2, let b = Int64(parts[0]), let s = Int64(parts[1]), b >= 1, s >= 0 else { return nil }
            boot = b
            seq = s
        }
    }

    public enum Op: Equatable, Sendable {
        case hello(nowk: Bool)
        case put
        case write(BootSeq)
        case remove(BootSeq)
        case clear(BootSeq)
        case putBackRequest
        case putBack(BootSeq)
    }

    public static func parseHead(_ head: String) -> Op? {
        let parts = head.split(separator: " ", omittingEmptySubsequences: false)
        guard let op = parts.first else { return nil }
        switch (op, parts.count) {
        case ("hello", 1): return .hello(nowk: false)
        case ("hello", 2) where parts[1] == "nowk": return .hello(nowk: true)
        case ("put", 1): return .put
        case ("pb", 1): return .putBackRequest
        case ("w", 2), ("d", 2), ("c", 2), ("p", 2):
            guard let bs = BootSeq(parts[1]) else { return nil }
            switch op {
            case "w": return .write(bs)
            case "d": return .remove(bs)
            case "c": return .clear(bs)
            default: return .putBack(bs)
            }
        default: return nil
        }
    }

    // MARK: Hello

    /// What the facade reported at document start.
    public struct Hello: Equatable, Sendable {
        /// WebKit's hash per key, every key WebKit holds (reserved keys included; the reconcile skips them).
        public var manifest: [KTKey: String]
        /// The gap note, when WebKit holds one the store can read.
        public var gap: GapNote?
        /// WebKit held a gap note the store could not read.
        public var badGap: Bool
        /// Keys the store cannot represent (a lone surrogate): skipped, never adopted.
        public var skippedKeys: Int

        public init(manifest: [KTKey: String], gap: GapNote? = nil, badGap: Bool = false, skippedKeys: Int = 0) {
            self.manifest = manifest
            self.gap = gap
            self.badGap = badGap
            self.skippedKeys = skippedKeys
        }
    }

    /// nil when the payload is malformed (the store then answers off and changes nothing).
    public static func parseHello(_ payload: String?) -> Hello? {
        let lines = KTWire.lines(payload)
        guard !lines.isEmpty, lines.count % 2 == 1 else { return nil }
        var hello = Hello(manifest: [:])
        if !KTWire.isNull(lines[0]) {
            guard let note = KTWire.unquote(lines[0]) else { return nil }
            if let gap = GapNote.parse(note) { hello.gap = gap } else { hello.badGap = true }
        }
        var i = 1
        while i + 1 < lines.count {
            guard let k = KTWire.unquote(lines[i]), let h = KTWire.unquote(lines[i + 1]) else { return nil }
            if let key = KTKey(units: k) {
                hello.manifest[key] = String(decoding: h, as: UTF16.self)
            } else {
                hello.skippedKeys += 1
            }
            i += 2
        }
        return hello
    }

    /// The facade's record of ops whose mirror was not answered `ok`.
    public struct GapNote: Equatable, Sendable {
        /// The hash WebKit held after each such op ("-" for a remove).
        public var keys: [KTKey: String]
        /// Each such op's (boot, seq), where the note says. A key whose last write in the store is newer than
        /// the op it missed is not explained by the note (the store holds a later write WebKit lost).
        public var stamps: [KTKey: BootSeq]
        /// A clear was not mirrored: every key counts as named.
        public var all: Bool
        /// When the last gap happened (ms), if the note says.
        public var at: Int64?

        public init(keys: [KTKey: String], stamps: [KTKey: BootSeq] = [:], all: Bool = false, at: Int64? = nil) {
            self.keys = keys
            self.stamps = stamps
            self.all = all
            self.at = at
        }

        public func names(_ key: KTKey) -> Bool { all || keys[key] != nil }

        /// `{"v":1,"at":ms,"k":{key: hash},"s":{key: "B:S"},"all":true}`; unknown members are ignored, and so is
        /// a stamp that is not "B:S". nil when unreadable.
        public static func parse(_ u: U16) -> GapNote? {
            guard let members = KTJSON.objectMembers(u) else { return nil }
            var note = GapNote(keys: [:])
            var version: String?
            for (name, range) in members {
                switch String(decoding: name, as: UTF16.self) {
                case "v":
                    version = KTJSON.ascii(u, range)
                case "at":
                    note.at = Int64(KTJSON.ascii(u, range)) ?? Double(KTJSON.ascii(u, range)).map { Int64($0) }
                case "all":
                    note.all = KTJSON.ascii(u, range) == "true"
                case "k":
                    guard let entries = KTJSON.objectMembers(u, range) else { return nil }
                    for (k, hr) in entries {
                        guard let key = KTKey(units: k), let h = KTJSON.string(u, hr) else { continue }
                        note.keys[key] = String(decoding: h, as: UTF16.self)
                    }
                case "s":
                    for (k, sr) in KTJSON.objectMembers(u, range) ?? [] {
                        guard let key = KTKey(units: k), let text = KTJSON.string(u, sr),
                              let stamp = BootSeq(Substring(String(decoding: text, as: UTF16.self))) else { continue }
                        note.stamps[key] = stamp
                    }
                default:
                    continue
                }
            }
            guard version == "1" else { return nil }
            note.stamps = note.stamps.filter { note.keys[$0.key] != nil }
            return note
        }

        /// The note as the facade writes it (tests build WebKit's copy with this).
        public func json() -> U16 {
            var s = "{\"v\":1"
            if let at { s += ",\"at\":\(at)" }
            s += ",\"k\":{"
            s += keys.keys.sorted().map { KTWire.quote($0) + ":" + KTWire.quote(Array(keys[$0]!.utf16)) }
                .joined(separator: ",")
            s += "}"
            if !stamps.isEmpty {
                s += ",\"s\":{"
                s += stamps.keys.sorted().map { KTWire.quote($0) + ":\"\(stamps[$0]!)\"" }.joined(separator: ",")
                s += "}"
            }
            if all { s += ",\"all\":true" }
            s += "}"
            return Array(s.utf16)
        }
    }

    /// The facade's hello payload for a WebKit copy (tests and tools; the facade builds the same in JavaScript).
    public static func helloPayload(webkit: [KTKey: U16], gapNote: U16?) -> String {
        var lines: [String] = [gapNote.map { KTWire.quote($0) } ?? "null"]
        for key in webkit.keys.sorted() {
            lines.append(KTWire.quote(key))
            lines.append(KTWire.quote(Array(KTWire.hash(webkit[key]).utf16)))
        }
        return lines.joined(separator: "\n")
    }

    // MARK: Pairs

    /// (key, value or nil) pairs of a `put` or `p` payload. nil when malformed or when a key holds a lone
    /// surrogate.
    public static func parsePairs(_ payload: String?) -> [(KTKey, U16?)]? {
        let lines = KTWire.lines(payload)
        guard lines.count % 2 == 0 else { return nil }
        var out: [(KTKey, U16?)] = []
        out.reserveCapacity(lines.count / 2)
        var i = 0
        while i + 1 < lines.count {
            guard let k = KTWire.unquote(lines[i]), let key = KTKey(units: k) else { return nil }
            if KTWire.isNull(lines[i + 1]) {
                out.append((key, nil))
            } else {
                guard let v = KTWire.unquote(lines[i + 1]) else { return nil }
                out.append((key, v))
            }
            i += 2
        }
        return out
    }

    public static func pairsPayload(_ pairs: [(KTKey, U16?)]) -> String {
        pairs.map { KTWire.quote($0.0) + "\n" + ($0.1.map { KTWire.quote($0) } ?? "null") }.joined(separator: "\n")
    }

    // MARK: Answers to hello and pb

    public static func offAnswer(_ why: String) -> String {
        "{\"mode\":\"off\",\"why\":" + KTWire.quote(Array(why.utf16)) + "}"
    }

    public static func helloAnswer(boot: Int64, need: [KTKey], rule: Int, label: String, putBack: Bool) -> String {
        var s = "{\"mode\":\"shadow\",\"boot\":\(boot),\"need\":["
        s += need.map { KTWire.quote($0) }.joined(separator: ",")
        s += "],\"rule\":\(rule),\"label\":" + KTWire.quote(Array(label.utf16))
        s += ",\"putback\":\(putBack ? "true" : "false")}"
        return s
    }

    public static func putBackAnswer(_ entries: [(KTKey, U16?)]) -> String {
        "{" + entries.map { KTWire.quote($0.0) + ":" + ($0.1.map { KTWire.quote($0) } ?? "null") }
            .joined(separator: ",") + "}"
    }

    // MARK: Async posts

    /// `{head, payload}` from the `ktStore` script-message handler (an NSDictionary of strings once WebKit hands
    /// it over), or a two-element array. nil for anything else.
    public static func parsePostBody(_ body: Any) -> (head: String, payload: String?)? {
        if let d = body as? [String: Any], let head = d["head"] as? String {
            return (head, d["payload"] as? String)
        }
        if let a = body as? [Any], let head = a.first as? String {
            return (head, a.count > 1 ? a[1] as? String : nil)
        }
        return nil
    }
}
