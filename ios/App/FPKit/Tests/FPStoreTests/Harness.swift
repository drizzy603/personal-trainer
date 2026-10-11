import Foundation
import SQLite3
import XCTest
@testable import FPStore

/// A fresh folder for one test's store, removed afterwards.
final class TempDir {
    let url: URL

    init() {
        url = FileManager.default.temporaryDirectory.appendingPathComponent("FPStoreTests-\(UUID().uuidString)",
                                                                           isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    deinit { try? FileManager.default.removeItem(at: url) }

    var store: URL { url.appendingPathComponent("FPStore", isDirectory: true) }
    var file: URL { store.appendingPathComponent(KTStore.fileName) }
}

/// A clock the test moves.
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    init(_ start: Date = Date(timeIntervalSince1970: 1_760_140_000)) { current = start }

    var now: Date {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    func advance(_ seconds: TimeInterval) {
        lock.lock()
        current += seconds
        lock.unlock()
    }

    var ms: Int64 { Int64((now.timeIntervalSince1970 * 1000).rounded()) }
}

func u(_ s: String) -> U16 { Array(s.utf16) }

/// A small seeded generator, so randomized tests repeat exactly.
struct SplitMix {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

func storeConfig(_ dir: URL, build: Int = 60, clock: TestClock? = nil, busyMs: Int32 = 2000) -> KTStore.Config {
    var c = KTStore.Config(directory: dir, build: build)
    c.busyTimeoutMs = busyMs
    c.timeZone = TimeZone(identifier: "UTC")!
    if let clock { c.clock = { clock.now } }
    return c
}

/// The page's WebKit storage plus a facade that behaves as ktstore.js does in build 60 (shadow only): WebKit
/// first, then the synchronous mirror; on any answer but `ok` a gap note in WebKit and an async post. Older
/// builds (and facade-less launches) write WebKit directly and stamp the witness at boot, as every page does.
final class FakeDevice {
    let dir: URL
    let clock: TestClock
    private(set) var store: KTStore
    /// WebKit's localStorage (the gap note included).
    var webkit: [KTKey: U16] = [:]
    var boot: Int64 = 0
    var seq: Int64 = 0
    var attached = false
    /// Mirrors that get no answer (the prompt never reached the store), as in a hard kill or a crash marker.
    var failMirror: Set<KTKey> = []
    /// The same for `localStorage.clear()`'s mirror.
    var failClear = false
    /// Posts sent to the `ktStore` handler and not yet delivered.
    var posts: [(head: String, payload: String?)] = []
    private var stamps = 0

    init(_ temp: TempDir, clock: TestClock = TestClock(), build: Int = 60) {
        dir = temp.store
        self.clock = clock
        store = KTStore.open(storeConfig(temp.store, build: build, clock: clock))
    }

    /// The app is killed and launched again.
    func relaunch(build: Int = 60) {
        store.close()
        store = KTStore.open(storeConfig(dir, build: build, clock: clock))
        attached = false
    }

    /// A unique `String(Date.now())` stamp.
    func nextStamp() -> U16 {
        stamps += 1
        clock.advance(1)
        return u(String(clock.ms + Int64(stamps)))
    }

    /// One document start: hello, the put it asks for, Put back if staged, then the page boots and stamps the
    /// witness (through the facade when it attached). Returns hello's answer.
    @discardableResult
    func launch(stamp: Bool = true) -> [String: Any] {
        let payload = KTProtocol.helloPayload(webkit: webkit, gapNote: webkit[KTProtocol.gapKey])
        let text = store.answer(head: "hello", payload: payload)
        let answer = (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]) ?? [:]
        attached = answer["mode"] as? String == "shadow"
        if attached {
            boot = (answer["boot"] as? NSNumber)?.int64Value ?? 0
            seq = 0
            let need = (answer["need"] as? [String] ?? []).map { KTKey($0) }
            var ok = true
            if !need.isEmpty {
                ok = store.answer(head: "put", payload: KTProtocol.pairsPayload(need.map { ($0, webkit[$0]) })) == "ok"
            }
            if ok {
                webkit[KTProtocol.gapKey] = nil  // the facade drops its note once hello's adoption is done
                if answer["putback"] as? Bool == true { putBack() }
            } else {
                attached = false  // a put not answered ok: nothing attaches for this document
            }
        }
        if stamp { set(KTProtocol.witnessKey, nextStamp()) }
        return answer
    }

    private func putBack() {
        let text = Array(store.answer(head: "pb", payload: nil).utf16)
        var wrote: [(KTKey, U16?)] = []
        for (k, r) in KTJSON.objectMembers(text) ?? [] {
            guard let key = KTKey(units: k) else { continue }
            let value = KTJSON.string(text, r)  // nil for null: remove
            webkit[key] = value
            wrote.append((key, value))
        }
        seq += 1
        _ = store.answer(head: "p \(boot):\(seq)", payload: KTProtocol.pairsPayload(wrote))
    }

    /// A page write through the facade.
    func set(_ key: KTKey, _ value: U16) {
        webkit[key] = value
        mirror("w", key, value)
    }

    func set(_ key: KTKey, _ value: String) { set(key, u(value)) }

    func remove(_ key: KTKey) {
        webkit[key] = nil
        mirror("d", key, nil)
    }

    /// `localStorage.clear()` through the facade: WebKit drops every key, the facade's note with them, then the
    /// mirror. A mirror not answered `ok` leaves a fresh note, written as the facade writes it
    /// (`JSON.stringify({v:1, at, k:{}, all:true, c:'B:S'})`, the clear's own stamp in `c`), and posts the clear.
    func clear() {
        webkit.removeAll()
        guard attached else { return }
        seq += 1
        let head = "c \(boot):\(seq)"
        let answer = failClear ? nil : store.answer(head: head, payload: nil)
        if answer != "ok" {
            webkit[KTProtocol.gapKey] = u("{\"v\":1,\"at\":\(clock.ms),\"k\":{},\"all\":true,\"c\":\"\(boot):\(seq)\"}")
            posts.append((head, nil))
        }
    }

    private func mirror(_ op: String, _ key: KTKey, _ value: U16?) {
        guard attached else { return }
        seq += 1
        let head = "\(op) \(boot):\(seq)"
        var payload = KTWire.quote(key)
        if let value { payload += "\n" + KTWire.quote(value) }
        let answer = failMirror.contains(key) ? nil : store.answer(head: head, payload: payload)
        if answer != "ok" {
            noteGap(key, value)
            posts.append((head, payload))
        }
    }

    private func noteGap(_ key: KTKey, _ value: U16?) {
        var note = webkit[KTProtocol.gapKey].flatMap { KTProtocol.GapNote.parse($0) } ?? KTProtocol.GapNote(keys: [:])
        note.keys[key] = KTWire.hash(value)
        note.stamps[key] = KTProtocol.BootSeq(boot: boot, seq: seq)
        note.at = clock.ms
        webkit[KTProtocol.gapKey] = note.json()
    }

    func deliverPosts() -> [KTPostResult] {
        defer { posts.removeAll() }
        return posts.map { store.post(head: $0.head, payload: $0.payload) }
    }

    /// An older build (or a launch without the facade): it changes WebKit directly and stamps the witness at boot.
    func olderBuild(_ change: (inout [KTKey: U16]) -> Void) {
        attached = false
        webkit[KTProtocol.witnessKey] = nextStamp()
        change(&webkit)
    }

    /// What the page reads, less the facade's own note: the store must equal this, less the API key.
    var pageView: [KTKey: U16] {
        webkit.filter { !KTProtocol.isReserved($0.key) }
    }

    /// Makes snapshots impossible to write (a file where `snaps/` was, which stops root too) until the returned
    /// closure puts the folder back.
    func blockSnaps() throws -> () throws -> Void {
        let fm = FileManager.default
        let snaps = dir.appendingPathComponent("snaps", isDirectory: true)
        let away = dir.appendingPathComponent("snaps.away", isDirectory: true)
        _ = store.snapNames()  // snapshots already queued are written first
        try fm.moveItem(at: snaps, to: away)
        try Data("not a folder".utf8).write(to: dir.appendingPathComponent("snaps"))
        return {
            try fm.removeItem(at: self.dir.appendingPathComponent("snaps"))
            try fm.moveItem(at: away, to: snaps)
        }
    }
}

/// A realistic WebKit copy: logs, a programme, a chat with half an emoji, Health ledgers, raw-string keys.
enum Seed {
    static let values: [KTKey: U16] = {
        var v: [KTKey: String] = [
            "kt_sessions": #"[{"id":1760000000002,"date":"2026-10-08","exercises":[{"name":"Bench","sets":[{"w":135,"r":5}]}],"wSet":{"Bench":[null,135]}},{"id":1760000000001,"date":"2026-10-01","exercises":[]}]"#,
            "kt_runs": #"[{"id":3,"date":"2026-10-07","km":5,"time":"25:00"}]"#,
            "kt_sports": #"[]"#,
            "kt_bw": #"[{"id":4,"date":"2026-10-06","lb":180}]"#,
            "kt_measurements": #"[{"date":"2026-09-30","waist":80}]"#,
            "kt_weights": #"{"Bench":135,"Squat":185}"#,
            "kt_prs": #"{"Bench":185}"#,
            "kt_week": "3",
            "kt_routine": #"{"name":"Kalani","weeks":[{"wk":1,"bName":"Base"},{"wk":2,"bName":"Build"}]}"#,
            "kt_routine_backup": #"{"name":"Kalani","weeks":[{"wk":1,"bName":"Base"}]}"#,
            "kt_routine_archive": #"[]"#,
            "kt_routine_next": #"{"startsOn":"2026-10-12"}"#,
            "kt_round_intro": #"{"cycle":2}"#,
            "kt_streak_days": #"{"2026-10-08":1}"#,
            "kt_hk_imported": #"["uuid-1","uuid-2"]"#,
            "kt_hk_last_sync": "1760000000000",
            "kt_theme": "heavyweight",
            "kt_unit_w": "lb",
            "kt_last_open": "1760100000000",
            "kt_apikey": "sk-ant-api03-never-in-the-store",
            "kt_wch_log": "watch: hello",
        ]
        v["kt_routine_archive"] = "[" + v["kt_routine"]! + "]"
        var out = v.mapValues { Array($0.utf16) }
        // A 60-message chat whose 8th message ends in half an emoji, as lsSet stores it: JSON.stringify writes the
        // lone high surrogate as the six characters \ud83d (spelled with \u{5C} here).
        var chat = u("[")
        for i in 0..<60 {
            if i > 0 { chat += u(",") }
            chat += u("{\"role\":\"\(i % 2 == 0 ? "user" : "assistant")\",\"content\":\"Message \(i) ")
            chat += [0xD83D, 0xDCAA]
            if i == 7 { chat += u(" half \u{5C}ud83d") }
            chat += u("\"}")
        }
        out["kt_coach_msgs"] = chat + u("]")
        // A raw-string key (RAW_STRING_KEYS) holding a real lone surrogate: a name cut by .slice.
        out["kt_user_name"] = u("Kal") + [0xD83D]
        return out
    }()
}

/// Raw SQL on a store file, for planting rows and checking what is on disk (never through the store).
final class RawDB {
    let db: OpaquePointer

    init(_ path: String) throws {
        var h: OpaquePointer?
        guard sqlite3_open_v2(path, &h, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK, let h else {
            sqlite3_close(h)
            throw NSError(domain: "RawDB", code: 1)
        }
        db = h
        sqlite3_busy_timeout(db, 5000)
    }

    deinit { sqlite3_close(db) }

    func exec(_ sql: String) throws {
        var err: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(db, sql, nil, nil, &err) == SQLITE_OK else {
            let msg = err.map { String(cString: $0) } ?? "?"
            sqlite3_free(err)
            throw NSError(domain: "RawDB", code: 2, userInfo: [NSLocalizedDescriptionKey: msg])
        }
    }

    func int(_ sql: String) throws -> Int64 {
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { throw NSError(domain: "RawDB", code: 3) }
        defer { sqlite3_finalize(st) }
        guard sqlite3_step(st) == SQLITE_ROW else { throw NSError(domain: "RawDB", code: 4) }
        return sqlite3_column_int64(st, 0)
    }

    func text(_ sql: String) throws -> String? {
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { throw NSError(domain: "RawDB", code: 3) }
        defer { sqlite3_finalize(st) }
        guard sqlite3_step(st) == SQLITE_ROW, let p = sqlite3_column_text(st, 0) else { return nil }
        return String(cString: p)
    }

    /// Plants a kv row in an encoding this build does not know.
    func plantUnknownEncoding(_ key: String, bytes: [UInt8]) throws {
        var st: OpaquePointer?
        let sql = "INSERT INTO kv(k, v, enc, h, seq, at, src) VALUES(?, ?, 'z16', 'opaque', 0, 0, 'later build')"
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { throw NSError(domain: "RawDB", code: 3) }
        defer { sqlite3_finalize(st) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        sqlite3_bind_text(st, 1, key, -1, transient)
        _ = bytes.withUnsafeBytes { sqlite3_bind_blob(st, 2, $0.baseAddress, Int32($0.count), transient) }
        guard sqlite3_step(st) == SQLITE_DONE else { throw NSError(domain: "RawDB", code: 5) }
    }

    func blob(_ sql: String) throws -> [UInt8]? {
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { throw NSError(domain: "RawDB", code: 3) }
        defer { sqlite3_finalize(st) }
        guard sqlite3_step(st) == SQLITE_ROW, sqlite3_column_type(st, 0) != SQLITE_NULL else { return nil }
        let p = sqlite3_column_blob(st, 0)
        let n = Int(sqlite3_column_bytes(st, 0))
        guard let p else { return [] }
        return Array(UnsafeRawBufferPointer(start: p, count: n))
    }
}

/// Every byte of the store's files (database, WAL, snapshots): where a secret must never appear.
func allStoreBytes(_ dir: URL) -> Data {
    var data = Data()
    let walk = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)
    while let f = walk?.nextObject() as? URL {
        if let d = try? Data(contentsOf: f) { data.append(d) }
    }
    return data
}
