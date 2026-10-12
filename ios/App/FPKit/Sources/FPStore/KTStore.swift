import Foundation

/// FPStore's counters, by name, for Settings > About > Storage. Kept as a name-to-number map so later builds can
/// add counters without breaking how this build reads the stored copy.
public struct KTDiag: Codable, Equatable, Sendable {
    public enum Count: String, CaseIterable, Sendable {
        case hellos, inStep, migrate, wiped, olderBuild, gap, lag, unexplained, nowk, badHello
        case adopted, tombstoned, givenUp, wouldRepairKeys, putBacksLanded
        case writes, posts, postsApplied, postsStale
        case full, busy, err, passthrough, unknownEnc, badOps, putUnasked, putMismatch
        case putBacks, putBackDropped
    }

    public var counts: [String: Int] = [:]
    public var maxMs: [String: Double] = [:]

    public init() {}

    public subscript(_ c: Count) -> Int {
        get { counts[c.rawValue] ?? 0 }
        set { counts[c.rawValue] = newValue }
    }

    mutating func bump(_ c: Count, by n: Int = 1) { self[c] += n }

    mutating func time(_ name: String, _ ms: Double) { maxMs[name] = Swift.max(maxMs[name] ?? 0, ms) }
}

/// What the last document start found.
public struct KTHelloRecord: Codable, Equatable, Sendable {
    public var at: Int64
    public var boot: Int64
    /// 0 in step, 2 WebKit unreadable, 3...7 the rule that decided.
    public var rule: Int
    public var label: String
    /// Keys the store followed WebKit on, by reason.
    public var adopted: [String: [String]]
    /// Rule 6: keys a repair would write back.
    public var wouldRepair: [String]
}

/// Rule 3's offer: the store kept its set when WebKit came back empty; Put back of `snap` restores it.
public struct KTWipeOffer: Codable, Equatable, Sendable {
    public var at: Int64
    /// The snapshot of the kept set. nil: none could be written yet, and the follow-up gives nothing up (the
    /// facade stays off) until one is.
    public var snap: String?
    public var keys: Int
    public var seq: Int64
}

/// One value the store gave up (or a put-back replaced), kept 30 days.
public struct KTConflict: Codable, Equatable, Sendable {
    public var id: Int64
    public var at: Int64
    public var key: String
    /// "older build", "lag", "unexplained", "wiped", "putback".
    public var why: String
    /// The given-up value's hash ("-": the key was absent).
    public var h: String
    /// The hash of the value that replaced it.
    public var hnew: String
    /// The given-up value's size in UTF-16 code units (nil when absent).
    public var units: Int?
    /// The boot of the document start that gave it up (a Put back's: the document that wrote it). Every value one
    /// start gave up shares it, so Storage can put a whole start's loss back at once.
    public var boot: Int64?
}

/// Everything one document start found this iPhone had lost and the copy kept (rule 6's "lag" rows; a wipe's
/// follow-up, "wiped"), while Put back of it would still bring something back. Storage offers "Put back everything
/// this start lost" for it (one intent, `ids`) and its row keeps saying Put back until every key is back, changed
/// since, or no longer the copy's to put back.
public struct KTLoss: Codable, Equatable, Sendable {
    /// The start's boot (KTConflict.boot).
    public var boot: Int64
    /// When that start gave the values up.
    public var at: Int64
    /// "lag", or "wiped" when any of it is what a wipe took.
    public var why: String
    /// Every conflict that start gave up as lag or wiped: Put back of all of them is one intent.
    public var ids: [Int64]
    /// What Put back of `ids` would do now, the keys it would still write (or remove) only.
    public var items: [KTPutBackItem]
}

/// Everything Settings > About > Storage shows.
public struct KTStatus: Codable, Equatable, Sendable {
    /// "ready", "unreadable" or "refused".
    public var state: String
    public var why: String?
    public var build: Int
    public var schema: Int?
    public var minReader: Int?
    public var firstShell: Int?
    public var lastShell: Int?
    /// Live values and their size in bytes (UTF-16).
    public var keys: Int
    public var bytes: Int
    public var tombstones: Int
    public var unknownEnc: Int
    public var boot: Int64
    /// Conflicts kept (last 30 days).
    public var conflicts: Int
    public var lastHello: KTHelloRecord?
    public var counts: KTDiag
    public var wipeOffer: KTWipeOffer?
    public var putBackStaged: Bool
    public var putBackWaiting: Int
    public var lastPutBack: KTPutBackPlan?
    public var snaps: [String]
    /// The last document start found WebKit and the store in step (gap-note keys and confirmed Put back aside).
    public var inStep: Bool
    /// The losses still open, newest start first: only from `status(losses: true)` (resolving them reads the kept
    /// values, too slow for the status every hello reads); nil otherwise.
    public var losses: [KTLoss]?
}

/// What an async post did.
public enum KTPostResult: Equatable, Sendable {
    case applied
    /// Older than the key's last write: dropped.
    case stale
    case refused(String)
    case failed(String)
}

/// FPStore's native copy of every `kt_*` value, in the page's exact UTF-16 code units (plan task S2).
///
/// - `Application Support/FPStore/store.sqlite` (+ `-wal`, `-shm`) and `snaps/`. One connection on one serial
///   queue, `busy_timeout` 2 s: prompt answers, async posts, checkpoints, snapshots and plugin reads all run there.
/// - Open: `PRAGMA quick_check` first, and any step result other than ROW or DONE means unreadable, never empty.
///   An existing file is opened without SQLITE_OPEN_CREATE, and a file that cannot be read is never recreated or
///   overwritten: the store is off for the launch and Storage says why. `meta.minReader` above this build: off,
///   and nothing is written.
/// - WAL with `synchronous=NORMAL` (an app kill loses nothing committed); a transaction that writes one of the
///   five log keys commits with `synchronous=FULL`.
/// - Schema v1, additive forever: `kv(k, v BLOB or NULL tombstone, enc, h, seq, at, src, boot, pseq)`,
///   `journal(seq, k, h, hprev, at, src, boot, pseq)` with per-key caps (KTJournal), `meta`, `conflicts`
///   (values given up, 30 days) and `putback` (values handed to the facade, awaiting its confirmation).
/// - Shadow only (build 60): it follows WebKit, records what it would have repaired, keeps what it gave up and
///   stages Put back; it never writes WebKit by itself. `kt_apikey` never enters it.
public final class KTStore: @unchecked Sendable {
    public struct Config: Sendable {
        /// The store's folder (`Application Support/FPStore` in the app).
        public var directory: URL
        /// This binary's build number (CFBundleVersion), compared with `meta.minReader`.
        public var build: Int
        public var busyTimeoutMs: Int32 = 2000
        /// iOS: file protection `completeUntilFirstUserAuthentication`.
        public var protectFiles = true
        /// Daily snapshot names follow this time zone.
        public var timeZone: TimeZone = .current
        public var clock: @Sendable () -> Date = { Date() }

        public init(directory: URL, build: Int) {
            self.directory = directory
            self.build = build
        }
    }

    public enum State: Equatable, Sendable {
        case ready
        /// Rule 1: the file cannot be read (or not yet: before first unlock). Never recreated.
        case unreadable(String)
        /// Rule 1: a newer build raised `meta.minReader` above this one. Nothing is written.
        case refused(minReader: Int)
    }

    /// The schema this build creates and reads.
    public static let schema = 1
    /// The first build that reads schema 1: a new store's `minReader`.
    public static let firstReader = 60
    public static let fileName = "store.sqlite"
    static let conflictMs: Int64 = 30 * 86_400_000
    static let tables: Set<String> = ["kv", "journal", "meta", "conflicts", "putback"]

    public let config: Config
    public var fileURL: URL { config.directory.appendingPathComponent(KTStore.fileName) }
    public var snapsURL: URL { config.directory.appendingPathComponent("snaps", isDirectory: true) }

    private let queue = DispatchQueue(label: "app.kt.trainer.fpstore")
    private let queueKey = DispatchSpecificKey<UInt8>()
    private var sql: KTSQLite?
    private var stateValue: State = .unreadable("not opened")
    private var boot: Int64 = 0
    private var horizon: Int64 = 0
    private var lastAt: Int64 = 0
    private var pending: Pending?
    private var diag = KTDiag()
    private var lastHello: KTHelloRecord?
    private var lastPutBack: KTPutBackPlan?
    private var unsavedCounts = 0
    let snaps: KTSnaps

    /// Hello's plan, waiting for the facade's `put`.
    private struct Pending {
        var boot: Int64
        var changes: [KTKey: KTChange]
        var migrate: Bool
    }

    /// A kv row without its value.
    struct KVRow {
        var h: String
        var enc: String
        var live: Bool
        var boot: Int64
        var pseq: Int64
        var stamp: KTProtocol.BootSeq { KTProtocol.BootSeq(boot: boot, seq: pseq) }
    }

    // MARK: - Open

    private init(_ config: Config) {
        self.config = config
        snaps = KTSnaps(dir: config.directory.appendingPathComponent("snaps", isDirectory: true),
                        timeZone: config.timeZone, protect: config.protectFiles)
        queue.setSpecific(key: queueKey, value: 1)
    }

    /// Opens (or creates) the store. Never throws: `state` says whether it is ready.
    public static func open(_ config: Config) -> KTStore {
        let store = KTStore(config)
        store.sync { store.openLocked() }
        return store
    }

    deinit { sql?.close() }

    private func openLocked() {
        let fm = FileManager.default
        let path = fileURL.path
        do {
            try fm.createDirectory(at: config.directory, withIntermediateDirectories: true)
        } catch {
            stateValue = .unreadable("cannot create \(config.directory.lastPathComponent): \(error.localizedDescription)")
            return
        }
        let exists = fm.fileExists(atPath: path)
        if !exists && (fm.fileExists(atPath: path + "-wal") || fm.fileExists(atPath: path + "-shm")) {
            stateValue = .unreadable("store.sqlite is missing beside its -wal: left as found")
            return
        }
        var opened: KTSQLite?
        do {
            let s = try KTSQLite.open(path: path, create: !exists, protect: config.protectFiles,
                                      busyTimeoutMs: config.busyTimeoutMs)
            opened = s
            // Integrity first, before anything is read or written.
            let check = try s.scalarText("PRAGMA quick_check")
            guard check == "ok" else { throw KTStoreError.unreadable("quick_check: \(check ?? "no answer")") }
            let tables = try tableNames(s)
            if tables.isEmpty {
                // A new file, or one whose creation never committed: there is nothing in it to lose.
                try createSchema(s)
            } else {
                guard KTStore.tables.isSubset(of: tables) else {
                    throw KTStoreError.unreadable("not a store: tables \(tables.sorted().joined(separator: ","))")
                }
                guard let schema = try meta(s, "schema").flatMap(Int.init), schema >= 1,
                      let minReader = try meta(s, "minReader").flatMap(Int.init) else {
                    throw KTStoreError.unreadable("no schema or minReader in meta")
                }
                if minReader > config.build {
                    // A later build owns this store's format: attach nothing, write nothing.
                    s.close()
                    opened = nil
                    stateValue = .refused(minReader: minReader)
                    return
                }
                if try s.scalarText("PRAGMA journal_mode")?.lowercased() != "wal" {
                    guard try s.scalarText("PRAGMA journal_mode=WAL")?.lowercased() == "wal" else {
                        throw KTStoreError.unreadable("cannot use WAL")
                    }
                }
            }
            try s.exec("PRAGMA synchronous=NORMAL")
            boot = try meta(s, "boot").flatMap(Int64.init) ?? 0
            horizon = try meta(s, "jhorizon").flatMap(Int64.init) ?? 0
            lastAt = try KTJournal.lastAt(s)
            if let d = try meta(s, "diag"), let decoded = try? JSONDecoder().decode(KTDiag.self, from: Data(d.utf8)) {
                diag = decoded
            }
            if let h = try meta(s, "lastHello") {
                lastHello = try? JSONDecoder().decode(KTHelloRecord.self, from: Data(h.utf8))
            }
            if try meta(s, "lastShell") != String(config.build) {
                try s.transaction(full: false) {
                    try setMeta(s, "lastShell", String(config.build))
                    if try meta(s, "firstShell") == nil { try setMeta(s, "firstShell", String(config.build)) }
                }
            }
            sql = s
            opened = nil
            stateValue = .ready
        } catch let e as KTStoreError {
            opened?.close()
            stateValue = .unreadable(e.description)
        } catch {
            opened?.close()
            stateValue = .unreadable("\(error)")
        }
    }

    private func tableNames(_ s: KTSQLite) throws -> Set<String> {
        let st = try s.statement("SELECT name FROM sqlite_master WHERE type = 'table'")
        defer { st.reset() }
        var out = Set<String>()
        while try st.step() { if let n = st.text(0) { out.insert(n) } }
        return out.subtracting(["sqlite_sequence"])
    }

    private func createSchema(_ s: KTSQLite) throws {
        guard try s.scalarText("PRAGMA journal_mode=WAL")?.lowercased() == "wal" else {
            throw KTStoreError.unreadable("cannot use WAL")
        }
        let now = nowMs()
        try s.transaction(full: true) {
            try s.exec("""
                CREATE TABLE kv(
                  k TEXT PRIMARY KEY NOT NULL,
                  v BLOB,
                  enc TEXT NOT NULL DEFAULT 'u16',
                  h TEXT NOT NULL,
                  seq INTEGER NOT NULL,
                  at INTEGER NOT NULL,
                  src TEXT NOT NULL,
                  boot INTEGER NOT NULL DEFAULT 0,
                  pseq INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE journal(
                  seq INTEGER PRIMARY KEY AUTOINCREMENT,
                  k TEXT NOT NULL,
                  h TEXT NOT NULL,
                  hprev TEXT NOT NULL,
                  at INTEGER NOT NULL,
                  src TEXT NOT NULL,
                  boot INTEGER NOT NULL DEFAULT 0,
                  pseq INTEGER NOT NULL DEFAULT 0);
                CREATE INDEX journal_k ON journal(k, seq);
                CREATE INDEX journal_at ON journal(at);
                CREATE TABLE meta(k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);
                CREATE TABLE conflicts(
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  at INTEGER NOT NULL,
                  k TEXT NOT NULL,
                  value BLOB,
                  enc TEXT NOT NULL DEFAULT 'u16',
                  h TEXT NOT NULL,
                  hnew TEXT NOT NULL,
                  why TEXT NOT NULL,
                  boot INTEGER NOT NULL DEFAULT 0);
                CREATE INDEX conflicts_at ON conflicts(at);
                CREATE TABLE putback(
                  k TEXT PRIMARY KEY NOT NULL,
                  v BLOB,
                  enc TEXT NOT NULL DEFAULT 'u16',
                  h TEXT NOT NULL,
                  hbase TEXT NOT NULL,
                  origin TEXT NOT NULL,
                  at INTEGER NOT NULL);
                """)
            let initial: [(String, String)] = [
                ("schema", String(KTStore.schema)), ("minReader", String(KTStore.firstReader)), ("wkExcluded", "[]"),
                ("created", String(now)), ("firstShell", String(config.build)), ("lastShell", String(config.build)),
                ("boot", "0"), ("jhorizon", "0"),
            ]
            for (k, v) in initial { try setMeta(s, k, v) }
        }
    }

    // MARK: - Queue

    @discardableResult
    private func sync<T>(_ body: () throws -> T) rethrows -> T {
        if DispatchQueue.getSpecific(key: queueKey) != nil { return try body() }
        return try queue.sync(execute: body)
    }

    public var state: State { sync { stateValue } }

    private func db() throws -> KTSQLite {
        guard case .ready = stateValue, let sql else { throw KTStoreError.failed("the store is off") }
        return sql
    }

    /// A store that finds its file damaged at run time turns itself off for the launch.
    private func fail(_ e: KTStoreError) {
        switch e {
        case .full: diag.bump(.full)
        case .busy: diag.bump(.busy)
        case .failed: diag.bump(.err)
        case .unreadable:
            diag.bump(.err)
            stateValue = .unreadable(e.description)
            pending = nil
            sql?.close()
            sql = nil
        }
    }

    /// A write transaction; on failure the cached counters are read back from the file.
    private func write<T>(full: Bool, _ body: (KTSQLite) throws -> T) throws -> T {
        let s = try db()
        do {
            return try s.transaction(full: full) { try body(s) }
        } catch {
            horizon = (try? meta(s, "jhorizon").flatMap(Int64.init)) ?? horizon
            boot = (try? meta(s, "boot").flatMap(Int64.init)) ?? boot
            throw error
        }
    }

    private func nowMs() -> Int64 { Int64((config.clock().timeIntervalSince1970 * 1000).rounded()) }

    /// The store's clock for `at`: never earlier than the newest row, so `at` order is seq order.
    private func tick() -> Int64 {
        lastAt = Swift.max(lastAt, nowMs())
        return lastAt
    }

    private static func ms(since start: UInt64) -> Double {
        Double(DispatchTime.now().uptimeNanoseconds &- start) / 1_000_000
    }

    // MARK: - Meta

    private func meta(_ s: KTSQLite, _ k: String) throws -> String? {
        let st = try s.statement("SELECT v FROM meta WHERE k = ?")
        defer { st.reset() }
        try st.bind(1, k)
        return try st.step() ? st.text(0) : nil
    }

    private func setMeta(_ s: KTSQLite, _ k: String, _ v: String) throws {
        let st = try s.statement("INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
        try st.bind(1, k)
        try st.bind(2, v)
        try st.run()
    }

    private func deleteMeta(_ s: KTSQLite, _ k: String) throws {
        let st = try s.statement("DELETE FROM meta WHERE k = ?")
        try st.bind(1, k)
        try st.run()
    }

    private func saveCounts(_ s: KTSQLite) {
        guard let data = try? JSONEncoder().encode(diag) else { return }
        try? setMeta(s, "diag", String(decoding: data, as: UTF8.self))
        if let lastHello, let h = try? JSONEncoder().encode(lastHello) {
            try? setMeta(s, "lastHello", String(decoding: h, as: UTF8.self))
        }
        unsavedCounts = 0
    }

    /// Counters reach the file at every hello and checkpoint, and every 64 ops in between.
    private func countersMaybeSave() {
        unsavedCounts += 1
        guard unsavedCounts >= 64, let s = sql else { return }
        saveCounts(s)
    }

    /// Values the shell keeps in `meta` beside the store's own (decision.md section 5): the last good policy file
    /// and the store breaker's record. Only these names can be written, so the shell can never change the
    /// store's own entries (schema, minReader, boot, ...).
    public enum ShellMetaKey: String, CaseIterable, Sendable {
        case policy, breaker
    }

    /// A shell value from `meta` (nil when unset or the store is off).
    public func shellMeta(_ key: ShellMetaKey) -> String? {
        sync { (try? db()).flatMap { (try? meta($0, key.rawValue)) ?? nil } }
    }

    /// Sets (nil: removes) a shell value in `meta`. false when the store is off or the write failed.
    @discardableResult
    public func setShellMeta(_ key: ShellMetaKey, _ value: String?) -> Bool {
        sync {
            do {
                try write(full: false) { s in
                    if let value { try setMeta(s, key.rawValue, value) } else { try deleteMeta(s, key.rawValue) }
                }
                return true
            } catch let e as KTStoreError {
                fail(e)
                return false
            } catch {
                return false
            }
        }
    }

    private func wkExcluded(_ s: KTSQLite) throws -> Set<KTKey> {
        guard let text = try meta(s, "wkExcluded"),
              let list = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String] else { return [] }
        return Set(list.map { KTKey($0) })
    }

    // MARK: - Rows

    func kvRow(_ s: KTSQLite, _ key: KTKey) throws -> KVRow? {
        let st = try s.statement("SELECT h, enc, v IS NOT NULL, boot, pseq FROM kv WHERE k = ?")
        defer { st.reset() }
        try st.bind(1, key)
        guard try st.step() else { return nil }
        guard let h = st.text(0), let enc = st.text(1) else { throw KTStoreError.unreadable("a kv row with no hash") }
        return KVRow(h: h, enc: enc, live: st.int64(2) != 0, boot: st.int64(3), pseq: st.int64(4))
    }

    /// The key's value, checked against its stored hash: a value that does not match is damage, never data.
    func kvValue(_ s: KTSQLite, _ key: KTKey) throws -> U16? {
        let st = try s.statement("SELECT v, h, enc FROM kv WHERE k = ?")
        defer { st.reset() }
        try st.bind(1, key)
        guard try st.step(), !st.isNull(0) else { return nil }
        guard st.text(2) == "u16" else { return nil }
        let v = try st.units(0)
        guard KTWire.hash(v) == st.text(1) else { throw KTStoreError.unreadable("\(key)'s value does not match its hash") }
        return v
    }

    /// Writes one key inside the open transaction: a journal row (with the hash it replaces), the kv row, and the
    /// key's journal pruning.
    private func record(_ s: KTSQLite, _ key: KTKey, _ value: U16?, src: String, stamp: KTProtocol.BootSeq?,
                        old: KVRow?) throws {
        let h = KTWire.hash(value)
        let at = tick()
        let seq = try KTJournal.append(s, key: key, h: h, hprev: old?.h ?? KTWire.absent, at: at, src: src,
                                       boot: stamp?.boot ?? 0, pseq: stamp?.seq ?? 0)
        let st = try s.statement("""
            INSERT INTO kv(k, v, enc, h, seq, at, src, boot, pseq) VALUES(?, ?, 'u16', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(k) DO UPDATE SET v = excluded.v, enc = excluded.enc, h = excluded.h, seq = excluded.seq,
              at = excluded.at, src = excluded.src, boot = excluded.boot, pseq = excluded.pseq
            """)
        try st.bind(1, key)
        try st.bind(2, units: value)
        try st.bind(3, h)
        try st.bind(4, seq)
        try st.bind(5, at)
        try st.bind(6, src)
        try st.bind(7, stamp?.boot ?? 0)
        try st.bind(8, stamp?.seq ?? 0)
        try st.run()
        if let dropped = try KTJournal.prune(s, key: key, now: at), dropped > horizon {
            horizon = dropped
            try setMeta(s, "jhorizon", String(dropped))
        }
    }

    /// Keeps a value the store gives up (nil: the key was absent), for Put back.
    private func keepGivenUp(_ s: KTSQLite, _ key: KTKey, old: KVRow?, hnew: String, why: KTReason,
                             boot: Int64) throws {
        let value = (old?.live ?? false) ? try kvValue(s, key) : nil
        let st = try s.statement(
            "INSERT INTO conflicts(at, k, value, enc, h, hnew, why, boot) VALUES(?, ?, ?, 'u16', ?, ?, ?, ?)")
        try st.bind(1, tick())
        try st.bind(2, key)
        try st.bind(3, units: value)
        try st.bind(4, value == nil ? KTWire.absent : (old?.h ?? KTWire.absent))
        try st.bind(5, hnew)
        try st.bind(6, why.rawValue)
        try st.bind(7, boot)
        try st.run()
        diag.bump(.givenUp)
    }

    private static func source(_ reason: KTReason) -> String {
        switch reason {
        case .migrate: return KTJournal.migrate
        case .putback: return KTJournal.putback
        default: return KTJournal.adopt(reason)
        }
    }

    // MARK: - The prompt channel

    /// Answers one `\u{1}KT1 <head>` prompt (synchronously; KTUIProxy calls it from the main thread).
    public func answer(head: String, payload: String?) -> String {
        sync {
            let start = DispatchTime.now().uptimeNanoseconds
            guard let op = KTProtocol.parseHead(head) else {
                diag.bump(.badOps)
                return head.hasPrefix("hello") ? KTProtocol.offAnswer("bad hello") : KTProtocol.Answer.err.rawValue
            }
            switch stateValue {
            case .ready: break
            case .unreadable:
                if case .hello = op { return KTProtocol.offAnswer("unreadable") }
                return KTProtocol.Answer.err.rawValue
            case .refused:
                if case .hello = op { return KTProtocol.offAnswer("minReader") }
                return KTProtocol.Answer.err.rawValue
            }
            switch op {
            case .hello(let nowk):
                let out = hello(nowk: nowk, payload: payload)
                diag.time("hello", KTStore.ms(since: start))
                return out
            case .put:
                let out = put(payload)
                diag.time("put", KTStore.ms(since: start))
                return out
            case .write(let stamp), .remove(let stamp):
                let lines = KTWire.lines(payload)
                let isWrite: Bool
                if case .write = op { isWrite = true } else { isWrite = false }
                guard lines.count == (isWrite ? 2 : 1), let k = KTWire.unquote(lines[0]),
                      let key = KTKey(units: k) else { diag.bump(.badOps); return KTProtocol.Answer.err.rawValue }
                var value: U16?
                if isWrite {
                    guard let v = KTWire.unquote(lines[1]) else { diag.bump(.badOps); return KTProtocol.Answer.err.rawValue }
                    value = v
                }
                diag.bump(.writes)
                let out = answerFor(writeKey(key, value, stamp: stamp, posted: false))
                diag.time("write", KTStore.ms(since: start))
                countersMaybeSave()
                return out
            case .clear(let stamp):
                diag.bump(.writes)
                return answerFor(clearAll(stamp: stamp, posted: false))
            case .putBackRequest:
                return putBackRequest()
            case .putBack(let stamp):
                return putBackConfirm(stamp: stamp, payload: payload)
            }
        }
    }

    /// Applies a post from the `ktStore` script-message handler: a `w`, `d` or `c` whose prompt was not answered
    /// `ok`, applied only when its (boot, seq) is newer than the key's last write.
    public func post(head: String, payload: String?) -> KTPostResult {
        sync {
            guard case .ready = stateValue else { return .refused("the store is off") }
            diag.bump(.posts)
            let result: Outcome
            switch KTProtocol.parseHead(head) {
            case .write(let stamp)?, .remove(let stamp)?:
                let lines = KTWire.lines(payload)
                let isWrite = head.hasPrefix("w ")
                guard lines.count == (isWrite ? 2 : 1), let k = KTWire.unquote(lines[0]),
                      let key = KTKey(units: k) else { return .refused("malformed payload") }
                var value: U16?
                if isWrite {
                    guard let v = KTWire.unquote(lines[1]) else { return .refused("malformed value") }
                    value = v
                }
                result = writeKey(key, value, stamp: stamp, posted: true)
            case .clear(let stamp)?:
                result = clearAll(stamp: stamp, posted: true)
            default:
                return .refused("only w, d and c are posted")
            }
            countersMaybeSave()
            switch result {
            case .ok: diag.bump(.postsApplied); return .applied
            case .stale: diag.bump(.postsStale); return .stale
            case .refused(let why): return .refused(why)
            case .failed(let e): return .failed(e.description)
            }
        }
    }

    /// The post-body form: `{head, payload}` as WebKit hands it over.
    public func post(body: Any) -> KTPostResult {
        guard let (head, payload) = KTProtocol.parsePostBody(body) else { return .refused("malformed body") }
        return post(head: head, payload: payload)
    }

    private enum Outcome {
        case ok, stale
        case refused(String)
        case failed(KTStoreError)
    }

    private func answerFor(_ o: Outcome) -> String {
        switch o {
        case .ok, .stale: return KTProtocol.Answer.ok.rawValue
        case .refused: return KTProtocol.Answer.err.rawValue
        case .failed(let e): return e.answer.rawValue
        }
    }

    // MARK: Writes

    private func writeKey(_ key: KTKey, _ value: U16?, stamp: KTProtocol.BootSeq, posted: Bool) -> Outcome {
        if KTProtocol.isReserved(key) {
            if KTProtocol.passthroughKeys.contains(key) { diag.bump(.passthrough) }
            return .ok  // the store does not keep it, by design
        }
        guard stamp.boot <= boot else { diag.bump(.badOps); return .refused("boot \(stamp.boot) was never given") }
        do {
            return try write(full: KTProtocol.logKeys.contains(key)) { s in
                let old = try kvRow(s, key)
                if let old, old.enc != "u16" {
                    diag.bump(.unknownEnc)
                    return .refused("\(key) is in an encoding this build does not read")
                }
                if posted, let old, old.stamp >= stamp { return .stale }
                try record(s, key, value, src: posted ? KTJournal.post : KTJournal.page, stamp: stamp, old: old)
                return .ok
            }
        } catch let e as KTStoreError {
            fail(e)
            return .failed(e)
        } catch {
            return .failed(.failed("\(error)"))
        }
    }

    private func clearAll(stamp: KTProtocol.BootSeq, posted: Bool) -> Outcome {
        guard stamp.boot <= boot else { diag.bump(.badOps); return .refused("boot \(stamp.boot) was never given") }
        do {
            return try write(full: true) { s in
                let st = try s.statement("SELECT k, h, enc, v IS NOT NULL, boot, pseq FROM kv WHERE v IS NOT NULL")
                var rows: [(KTKey, KVRow)] = []
                while try st.step() {
                    guard let key = st.key(0), let h = st.text(1), let enc = st.text(2) else { continue }
                    rows.append((key, KVRow(h: h, enc: enc, live: true, boot: st.int64(4), pseq: st.int64(5))))
                }
                st.reset()
                var applied = 0
                for (key, row) in rows where row.enc == "u16" && !KTProtocol.isReserved(key) {
                    if posted && row.stamp >= stamp { continue }
                    try record(s, key, nil, src: posted ? KTJournal.post : KTJournal.page, stamp: stamp, old: row)
                    applied += 1
                }
                return applied == 0 && posted ? .stale : .ok
            }
        } catch let e as KTStoreError {
            fail(e)
            return .failed(e)
        } catch {
            return .failed(.failed("\(error)"))
        }
    }

    // MARK: Hello and put

    private func hello(nowk: Bool, payload: String?) -> String {
        pending = nil
        diag.bump(.hellos)
        defer { if let s = sql { saveCounts(s) } }
        if nowk {
            // Rule 2: WebKit unreadable. Never read as empty; reconcile nothing.
            diag.bump(.nowk)
            lastHello = KTHelloRecord(at: nowMs(), boot: boot, rule: 2, label: "webkit unreadable", adopted: [:],
                                      wouldRepair: [])
            return KTProtocol.offAnswer("nowk")
        }
        guard let hello = KTProtocol.parseHello(payload) else {
            diag.bump(.badHello)
            return KTProtocol.offAnswer("bad hello")
        }
        do {
            let s = try db()
            var input = try reconcileInput(s, hello)
            var plan = KTReconcile.classify(input)
            if plan.rule == 7 {  // only the journal tells lag from unexplained: read it when it matters
                input.journal = try KTJournal.rows(s, above: horizon)
                plan = KTReconcile.classify(input)
            }
            if plan.rule == 3 { return try wiped(s, input) }
            // Rule 3's follow-up gives the wiped set up only once a snapshot of it exists. Until one can be written
            // the store keeps the set as it is and the facade stays off; the record's 30 days bound the wait.
            if input.wipe != nil, !plan.changes.isEmpty, var record = try wipeRecord(s), record.snap == nil {
                guard let info = try? writeSnapLocked(kind: "wiped") else {
                    lastHello = KTHelloRecord(at: nowMs(), boot: boot, rule: 3, label: "wiped: no snapshot", adopted: [:],
                                              wouldRepair: [])
                    return KTProtocol.offAnswer("wiped: no snapshot")
                }
                record.snap = info.name
                try write(full: false) { try setMeta($0, "wipe", record.json()) }
            }

            let newBoot = boot + 1
            let full = plan.changes.keys.contains { KTProtocol.logKeys.contains($0) }
            let wanted: [KTKey: KTChange] = try write(full: full) { s in
                try setMeta(s, "boot", String(newBoot))
                var wanted: [KTKey: KTChange] = [:]
                for key in plan.changes.keys.sorted() {
                    let change = plan.changes[key]!
                    let old = try kvRow(s, key)
                    if let old, old.enc != "u16" { continue }
                    if change.reason == .putback {
                        try applyStaged(s, key, old: old, stamp: KTProtocol.BootSeq(boot: newBoot, seq: 0))
                        diag.bump(.putBacksLanded)
                    } else if change.target == KTWire.absent {
                        if change.reason.keepsGivenUp {
                            try keepGivenUp(s, key, old: old, hnew: KTWire.absent, why: change.reason, boot: newBoot)
                        }
                        try record(s, key, nil, src: KTStore.source(change.reason),
                                   stamp: KTProtocol.BootSeq(boot: newBoot, seq: 0), old: old)
                        diag.bump(.tombstoned)
                    } else {
                        wanted[key] = change
                    }
                }
                // Put back handed out at an earlier start that never landed in WebKit: dropped.
                let dropped = try s.scalarInt("SELECT COUNT(*) FROM putback") ?? 0
                if dropped > 0 {
                    try s.exec("DELETE FROM putback")
                    diag.bump(.putBackDropped, by: Int(dropped))
                }
                if input.wipe != nil { try markWipeFollowedUp(s) }
                let cut = tick() - KTStore.conflictMs
                let del = try s.statement("DELETE FROM conflicts WHERE at < ?")
                try del.bind(1, cut)
                try del.run()
                return wanted
            }
            boot = newBoot
            // A put is expected only when hello named keys (`need`); any other put is a bad op.
            pending = wanted.isEmpty ? nil : Pending(boot: newBoot, changes: wanted, migrate: plan.label == "migrate")
            countHello(plan)
            let staged = try meta(s, "putbackIntent") != nil
            let answer = KTProtocol.helloAnswer(boot: newBoot, need: plan.need, rule: plan.rule, label: plan.label,
                                                putBack: staged)
            queue.async { [weak self] in _ = self?.snapIfDueLocked() }
            return answer
        } catch let e as KTStoreError {
            fail(e)
            return KTProtocol.offAnswer(e.description)
        } catch {
            return KTProtocol.offAnswer("\(error)")
        }
    }

    private func reconcileInput(_ s: KTSQLite, _ hello: KTProtocol.Hello) throws -> KTReconcileInput {
        var store: [KTKey: String] = [:]
        var stamps: [KTKey: KTProtocol.BootSeq] = [:]
        var unknown = Set<KTKey>()
        var rows = 0
        let st = try s.statement("SELECT k, h, enc, boot, pseq FROM kv")
        while try st.step() {
            rows += 1
            guard let key = st.key(0), let h = st.text(1), let enc = st.text(2) else {
                st.reset()
                throw KTStoreError.unreadable("a kv row with a missing column")
            }
            if enc == "u16" {
                store[key] = h
                stamps[key] = KTProtocol.BootSeq(boot: st.int64(3), seq: st.int64(4))
            } else {
                unknown.insert(key)
            }
        }
        st.reset()
        var witness = try KTJournal.history(s, key: KTProtocol.witnessKey)
        if let h = store[KTProtocol.witnessKey] { witness.insert(h) }
        witness.remove(KTWire.absent)
        var putBack: [KTKey: (h: String, hbase: String)] = [:]
        let pb = try s.statement("SELECT k, h, hbase FROM putback")
        while try pb.step() {
            if let key = pb.key(0), let h = pb.text(1), let base = pb.text(2) { putBack[key] = (h, base) }
        }
        pb.reset()
        let wipe = try wipeRecord(s)
        return KTReconcileInput(manifest: hello.manifest, gap: hello.gap, store: store, storeStamps: stamps, storeRows: rows,
                                unknownEnc: unknown, wkExcluded: try wkExcluded(s), witnessHistory: witness,
                                journal: [], putBack: putBack,
                                wipe: (wipe?.followedUp ?? true) ? nil : wipe?.hashes)
    }

    private func countHello(_ plan: KTReconcilePlan) {
        var adopted: [String: [String]] = [:]
        for (key, change) in plan.changes { adopted[change.reason.rawValue, default: []].append(key.string) }
        for k in adopted.keys { adopted[k] = Array(adopted[k]!.sorted().prefix(50)) }
        switch plan.rule {
        case 0: diag.bump(.inStep)
        case 4: diag.bump(plan.label == "migrate" ? .migrate : .olderBuild)
        case 5: diag.bump(.gap)
        case 6: diag.bump(.lag); diag.bump(.wouldRepairKeys, by: plan.wouldRepair.count)
        case 7: diag.bump(.unexplained)
        default: break
        }
        lastHello = KTHelloRecord(at: nowMs(), boot: boot, rule: plan.rule, label: plan.label, adopted: adopted,
                                  wouldRepair: plan.wouldRepair.prefix(50).map(\.string))
    }

    private func put(_ payload: String?) -> String {
        guard let pending else { diag.bump(.badOps); return KTProtocol.Answer.err.rawValue }
        self.pending = nil
        guard let pairs = KTProtocol.parsePairs(payload) else { diag.bump(.badOps); return KTProtocol.Answer.err.rawValue }
        let wanted = pairs.filter { pending.changes[$0.0] != nil }
        diag.bump(.putUnasked, by: pairs.count - wanted.count)
        let full = wanted.contains { KTProtocol.logKeys.contains($0.0) }
        do {
            try write(full: full) { s in
                for (key, value) in wanted {
                    let change = pending.changes[key]!
                    let old = try kvRow(s, key)
                    if let old, old.enc != "u16" { continue }
                    let h = KTWire.hash(value)
                    if h != change.target { diag.bump(.putMismatch) }
                    if change.reason.keepsGivenUp {
                        try keepGivenUp(s, key, old: old, hnew: h, why: change.reason, boot: pending.boot)
                    }
                    try record(s, key, value, src: KTStore.source(change.reason),
                               stamp: KTProtocol.BootSeq(boot: pending.boot, seq: 0), old: old)
                    diag.bump(.adopted)
                }
            }
            if pending.migrate {
                queue.async { [weak self] in _ = try? self?.writeSnapLocked(kind: "migrate") }
            }
            return KTProtocol.Answer.ok.rawValue
        } catch let e as KTStoreError {
            fail(e)
            return e.answer.rawValue
        } catch {
            return KTProtocol.Answer.err.rawValue
        }
    }

    // MARK: Rule 3

    struct WipeRecord {
        var at: Int64
        var snap: String?
        var seq: Int64
        var followedUp: Bool
        var hashes: [KTKey: String]

        func json() -> String {
            var s = "{\"at\":\(at),\"seq\":\(seq),\"followedUp\":\(followedUp)"
            if let snap { s += ",\"snap\":" + KTWire.quote(Array(snap.utf16)) }
            s += ",\"hashes\":{"
            s += hashes.keys.sorted().map { KTWire.quote($0) + ":" + KTWire.quote(Array(hashes[$0]!.utf16)) }
                .joined(separator: ",")
            return s + "}}"
        }

        static func parse(_ text: String) -> WipeRecord? {
            let u = Array(text.utf16)
            guard let members = KTJSON.objectMembers(u) else { return nil }
            var r = WipeRecord(at: 0, snap: nil, seq: 0, followedUp: false, hashes: [:])
            for (name, range) in members {
                switch String(decoding: name, as: UTF16.self) {
                case "at": r.at = Int64(KTJSON.ascii(u, range)) ?? 0
                case "seq": r.seq = Int64(KTJSON.ascii(u, range)) ?? 0
                case "followedUp": r.followedUp = KTJSON.ascii(u, range) == "true"
                case "snap": r.snap = KTJSON.string(u, range).map { String(decoding: $0, as: UTF16.self) }
                case "hashes":
                    for (k, hr) in KTJSON.objectMembers(u, range) ?? [] {
                        if let key = KTKey(units: k), let h = KTJSON.string(u, hr) {
                            r.hashes[key] = String(decoding: h, as: UTF16.self)
                        }
                    }
                default: continue
                }
            }
            return r
        }
    }

    private func wipeRecord(_ s: KTSQLite) throws -> WipeRecord? {
        guard let text = try meta(s, "wipe"), let r = WipeRecord.parse(text) else { return nil }
        if nowMs() - r.at > KTStore.conflictMs {  // the offer lasts 30 days
            try? write(full: false) { try deleteMeta($0, "wipe") }
            return nil
        }
        return r
    }

    private func markWipeFollowedUp(_ s: KTSQLite) throws {
        guard var r = try meta(s, "wipe").flatMap(WipeRecord.parse) else { return }
        r.followedUp = true
        try setMeta(s, "wipe", r.json())
    }

    /// Rule 3: WebKit came back without the witness and near-empty while the store holds a full set. Snapshot
    /// first, adopt nothing, and keep the facade off for this document, so kv keeps the set exactly; the next
    /// document start sees the fresh page's stamp as unknown (rule 4) and labels each value it replaces
    /// "wiped", and Put back of the snapshot can restore every one of them.
    ///
    /// When the snapshot cannot be written, an earlier wipe whose follow-up has not run keeps its own (nothing was
    /// adopted since, so it holds this same set); with none at all, the follow-up waits for one (`hello`).
    private func wiped(_ s: KTSQLite, _ input: KTReconcileInput) throws -> String {
        let head = try KTJournal.head(s)
        let earlier = try wipeRecord(s)
        let info = try? writeSnapLocked(kind: "wiped")
        let snap = info?.name ?? earlier.flatMap { !$0.followedUp && $0.seq == head ? $0.snap : nil }
        var hashes: [KTKey: String] = [:]
        for (k, h) in input.store where h != KTWire.absent && !KTProtocol.isReserved(k) { hashes[k] = h }
        let record = WipeRecord(at: nowMs(), snap: snap, seq: head, followedUp: false, hashes: hashes)
        try write(full: false) { try setMeta($0, "wipe", record.json()) }
        diag.bump(.wiped)
        lastHello = KTHelloRecord(at: nowMs(), boot: boot, rule: 3, label: "wiped", adopted: [:], wouldRepair: [])
        return KTProtocol.offAnswer("wiped")
    }

    /// The offer Storage shows while WebKit's wipe is less than 30 days old and not dismissed.
    public func dismissWipeOffer() {
        sync { _ = try? write(full: false) { try deleteMeta($0, "wipe") } }
    }

    // MARK: - Put back

    private struct Intent: Equatable {
        var conflicts: [Int64]
        var snap: String?
    }

    private struct Resolved {
        var key: KTKey
        var value: U16?
        var hbase: String
        var origin: String
    }

    private func intent(_ s: KTSQLite) throws -> Intent? {
        guard let text = try meta(s, "putbackIntent"),
              let obj = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return nil }
        let ids = (obj["conflicts"] as? [NSNumber])?.map(\.int64Value) ?? []
        return Intent(conflicts: ids, snap: obj["snap"] as? String)
    }

    /// What Put back of these conflicts would do now, without staging it.
    public func previewPutBack(conflicts ids: [Int64]) -> KTPutBackPlan {
        sync { (try? resolve(Intent(conflicts: ids, snap: nil)).plan) ?? KTPutBackPlan(items: []) }
    }

    /// What Put back of this snapshot would do now, without staging it.
    public func previewPutBack(snap name: String) -> KTPutBackPlan {
        sync { (try? resolve(Intent(conflicts: [], snap: name)).plan) ?? KTPutBackPlan(items: []) }
    }

    /// Stages Put back of the chosen conflicts. The shell then reloads the page; at the next document start the
    /// facade asks for the values (`pb`), writes them into WebKit and confirms (`p`). Returns the preview.
    @discardableResult
    public func stagePutBack(conflicts ids: [Int64]) -> KTPutBackPlan { stage(Intent(conflicts: ids, snap: nil)) }

    /// Stages Put back of a whole snapshot (rule 3's offer, or any kept snapshot).
    @discardableResult
    public func stagePutBack(snap name: String) -> KTPutBackPlan { stage(Intent(conflicts: [], snap: name)) }

    public func cancelPutBack() {
        sync {
            _ = try? write(full: false) { s in
                try deleteMeta(s, "putbackIntent")
                try s.exec("DELETE FROM putback")
            }
        }
    }

    private func stage(_ intent: Intent) -> KTPutBackPlan {
        sync {
            guard let resolved = try? resolve(intent) else { return KTPutBackPlan(items: []) }
            guard resolved.plan.count > 0 else { return resolved.plan }
            var obj: [String: Any] = ["conflicts": intent.conflicts, "at": nowMs()]
            if let snap = intent.snap { obj["snap"] = snap }
            guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return resolved.plan }
            _ = try? write(full: false) { try setMeta($0, "putbackIntent", String(decoding: data, as: UTF8.self)) }
            return resolved.plan
        }
    }

    /// Resolves an intent against the store as it is now (after hello's adoption, kv equals WebKit).
    private func resolve(_ intent: Intent) throws -> (plan: KTPutBackPlan, entries: [Resolved]) {
        let s = try db()
        var items: [KTPutBackItem] = []
        var entries: [Resolved] = []

        func current(_ key: KTKey) throws -> (row: KVRow?, value: U16?) {
            let row = try kvRow(s, key)
            return (row, row?.live == true ? try kvValue(s, key) : nil)
        }

        if !intent.conflicts.isEmpty {
            var byKey: [KTKey: [(id: Int64, value: U16?, h: String, hnew: String)]] = [:]
            var found = Set<Int64>()
            let st = try s.statement("SELECT id, k, value, h, hnew, enc FROM conflicts WHERE id = ?")
            for id in intent.conflicts.sorted() {
                try st.bind(1, id)
                if try st.step(), let key = st.key(1), let h = st.text(3), let hnew = st.text(4), st.text(5) == "u16" {
                    let v = try st.units(2)
                    if KTWire.hash(v) != h { st.reset(); throw KTStoreError.unreadable("conflict \(id) does not match its hash") }
                    byKey[key, default: []].append((id, v, h, hnew))
                    found.insert(id)
                }
                st.reset()
            }
            for id in intent.conflicts where !found.contains(id) {
                items.append(KTPutBackItem(key: "", outcome: .notFound, origin: "conflict:\(id)"))
            }
            for key in byKey.keys.sorted() where !KTProtocol.isReserved(key) {
                let rows = byKey[key]!
                let origin = "conflict:" + rows.map { String($0.id) }.joined(separator: ",")
                let (row, value) = try current(key)
                if let row, row.enc != "u16" {
                    items.append(KTPutBackItem(key: key.string, outcome: .untouched, origin: origin))
                    continue
                }
                let curH = row?.h ?? KTWire.absent
                if KTProtocol.logKeys.contains(key) {
                    var merged = value
                    var added = 0
                    var bad = false
                    for r in rows {
                        guard let extra = r.value else { continue }
                        guard let m = KTMerge.logs(current: merged, extra: extra) else { bad = true; break }
                        merged = m.merged
                        added += m.added
                    }
                    if bad {
                        items.append(KTPutBackItem(key: key.string, outcome: .unmergeable, origin: origin))
                    } else if added == 0 {
                        items.append(KTPutBackItem(key: key.string, outcome: .nothingToAdd, added: 0, origin: origin))
                    } else {
                        items.append(KTPutBackItem(key: key.string, outcome: .putBack, added: added, origin: origin))
                        entries.append(Resolved(key: key, value: merged, hbase: curH, origin: origin))
                    }
                } else {
                    let newest = rows.last!
                    if curH == newest.h {
                        items.append(KTPutBackItem(key: key.string, outcome: .nothingToAdd, origin: origin))
                    } else if curH != newest.hnew {
                        items.append(KTPutBackItem(key: key.string, outcome: .changedSince, origin: origin))
                    } else {
                        // A kept "no value" goes back as a removal: the plan says so (Storage asks "Remove ...?").
                        items.append(KTPutBackItem(key: key.string, outcome: .putBack, origin: origin,
                                                   removes: newest.value == nil ? true : nil))
                        entries.append(Resolved(key: key, value: newest.value, hbase: curH, origin: origin))
                    }
                }
            }
        }

        if let name = intent.snap {
            let origin = "snap:\(name)"
            guard let (info, values) = try? snaps.read(name) else {
                items.append(KTPutBackItem(key: "", outcome: .notFound, origin: origin))
                return (KTPutBackPlan(items: items), entries)
            }
            for key in values.keys.sorted() where !KTProtocol.isReserved(key) {
                let snapValue = values[key]!
                let (row, value) = try current(key)
                if let row, row.enc != "u16" {
                    items.append(KTPutBackItem(key: key.string, outcome: .untouched, origin: origin))
                    continue
                }
                let curH = row?.h ?? KTWire.absent
                if KTProtocol.logKeys.contains(key) {
                    guard let m = KTMerge.logs(current: value, extra: snapValue) else {
                        items.append(KTPutBackItem(key: key.string, outcome: .unmergeable, origin: origin))
                        continue
                    }
                    if m.added == 0 {
                        items.append(KTPutBackItem(key: key.string, outcome: .nothingToAdd, added: 0, origin: origin))
                    } else {
                        items.append(KTPutBackItem(key: key.string, outcome: .putBack, added: m.added, origin: origin))
                        entries.append(Resolved(key: key, value: m.merged, hbase: curH, origin: origin))
                    }
                } else if curH == KTWire.hash(snapValue) {
                    items.append(KTPutBackItem(key: key.string, outcome: .nothingToAdd, origin: origin))
                } else if try changedSince(s, key, after: info.seq) {
                    items.append(KTPutBackItem(key: key.string, outcome: .changedSince, origin: origin))
                } else {
                    items.append(KTPutBackItem(key: key.string, outcome: .putBack, origin: origin))
                    entries.append(Resolved(key: key, value: snapValue, hbase: curH, origin: origin))
                }
            }
        }
        return (KTPutBackPlan(items: items), entries)
    }

    /// Whether the page changed the key after journal seq `seq` (a page write, an older build's change, ...),
    /// as opposed to the store only following a loss. When the key's retained rows may not reach back that far,
    /// it counts as changed.
    private func changedSince(_ s: KTSQLite, _ key: KTKey, after seq: Int64) throws -> Bool {
        let rows = try KTJournal.rows(s, key: key, after: seq)
        if rows.contains(where: { KTJournal.isChange($0.src) }) { return true }
        return horizon > seq && rows.count >= KTJournal.perKeyCap
    }

    /// `pb`: resolves the staged intent now that kv equals WebKit, records what it hands out and answers the values.
    private func putBackRequest() -> String {
        do {
            let s = try db()
            guard let intent = try intent(s) else { return KTProtocol.putBackAnswer([]) }
            let resolved = try resolve(intent)
            try write(full: false) { s in
                try s.exec("DELETE FROM putback")
                let st = try s.statement(
                    "INSERT INTO putback(k, v, enc, h, hbase, origin, at) VALUES(?, ?, 'u16', ?, ?, ?, ?)")
                for e in resolved.entries {
                    try st.bind(1, e.key)
                    try st.bind(2, units: e.value)
                    try st.bind(3, KTWire.hash(e.value))
                    try st.bind(4, e.hbase)
                    try st.bind(5, e.origin)
                    try st.bind(6, tick())
                    try st.run()
                }
                try deleteMeta(s, "putbackIntent")
            }
            lastPutBack = resolved.plan
            return KTProtocol.putBackAnswer(resolved.entries.map { ($0.key, $0.value) })
        } catch let e as KTStoreError {
            fail(e)
            return KTProtocol.putBackAnswer([])
        } catch {
            return KTProtocol.putBackAnswer([])
        }
    }

    /// `p B:S`: the values the facade wrote into WebKit. Each must be the one handed out; the value it replaces is
    /// kept (why "putback"), so a put-back can itself be put back.
    private func putBackConfirm(stamp: KTProtocol.BootSeq, payload: String?) -> String {
        guard let pairs = KTProtocol.parsePairs(payload) else { diag.bump(.badOps); return KTProtocol.Answer.err.rawValue }
        do {
            try write(full: pairs.contains { KTProtocol.logKeys.contains($0.0) }) { s in
                for (key, value) in pairs {
                    let st = try s.statement("SELECT h FROM putback WHERE k = ?")
                    try st.bind(1, key)
                    let staged = try st.step() ? st.text(0) : nil
                    st.reset()
                    guard staged == KTWire.hash(value) else { diag.bump(.badOps); continue }
                    let old = try kvRow(s, key)
                    if let old, old.enc != "u16" { continue }
                    try keepGivenUp(s, key, old: old, hnew: KTWire.hash(value), why: .putback, boot: stamp.boot)
                    try record(s, key, value, src: KTJournal.putback, stamp: stamp, old: old)
                    let del = try s.statement("DELETE FROM putback WHERE k = ?")
                    try del.bind(1, key)
                    try del.run()
                    diag.bump(.putBacks)
                }
            }
            return KTProtocol.Answer.ok.rawValue
        } catch let e as KTStoreError {
            fail(e)
            return e.answer.rawValue
        } catch {
            return KTProtocol.Answer.err.rawValue
        }
    }

    /// A Put back that landed in WebKit without its confirmation, found at the next document start.
    private func applyStaged(_ s: KTSQLite, _ key: KTKey, old: KVRow?, stamp: KTProtocol.BootSeq) throws {
        let st = try s.statement("SELECT v, h FROM putback WHERE k = ?")
        try st.bind(1, key)
        guard try st.step() else { st.reset(); return }
        let value = try st.units(0)
        let h = st.text(1)
        st.reset()
        guard KTWire.hash(value) == h else { throw KTStoreError.unreadable("staged \(key) does not match its hash") }
        try keepGivenUp(s, key, old: old, hnew: KTWire.hash(value), why: .putback, boot: stamp.boot)
        try record(s, key, value, src: KTJournal.putback, stamp: stamp, old: old)
        let del = try s.statement("DELETE FROM putback WHERE k = ?")
        try del.bind(1, key)
        try del.run()
        diag.bump(.putBacks)
    }

    // MARK: - Snapshots, checkpoint, export

    /// Writes a snapshot of every live value now (`daily`, `manual`, ...). Throws when the store is off.
    @discardableResult
    public func writeSnap(kind: String = "manual") throws -> KTSnapInfo { try sync { try writeSnapLocked(kind: kind) } }

    /// A daily snapshot when today has none (the store also calls this after each hello).
    @discardableResult
    public func snapIfDue() -> KTSnapInfo? { sync { snapIfDueLocked() } }

    private func snapIfDueLocked() -> KTSnapInfo? {
        guard case .ready = stateValue, !snaps.hasDaily(config.clock()) else { return nil }
        return try? writeSnapLocked(kind: "daily")
    }

    public func snapNames() -> [String] { sync { snaps.list() } }

    /// Reads a snapshot's values back, exact.
    public func readSnap(_ name: String) throws -> [KTKey: U16] { try sync { try snaps.read(name).values } }

    private func writeSnapLocked(kind: String) throws -> KTSnapInfo {
        let now = config.clock()
        let (bytes, count, seq) = try snapshotBytes(kind: kind, at: now)
        let name = kind == "daily" ? snaps.dailyName(now) : snaps.eventName(kind, now)
        try snaps.write(bytes, name: name)
        snaps.rotate(now: now, keep: try protectedSnaps())
        return KTSnapInfo(name: name, kind: kind, at: Int64((now.timeIntervalSince1970 * 1000).rounded()), seq: seq,
                          keys: count, bytes: bytes.count)
    }

    /// Every live value as snapshot JSON, each checked against its stored hash on the way out, so damage never
    /// spreads into a safety copy (it turns the store off instead).
    private func snapshotBytes(kind: String, at now: Date) throws -> (Data, Int, Int64) {
        let s = try db()
        do {
            let seq = try KTJournal.head(s)
            let size = try s.scalarInt("SELECT SUM(length(v)) FROM kv WHERE v IS NOT NULL") ?? 0
            let w = try KTSnapWriter(kind: kind, at: Int64((now.timeIntervalSince1970 * 1000).rounded()),
                                     build: config.build, seq: seq, capacity: Int(size / 2 + size / 8))
            let st = try s.statement("SELECT k, v, h FROM kv WHERE v IS NOT NULL AND enc = 'u16' ORDER BY k")
            defer { st.reset() }
            while try st.step() {
                guard let key = st.key(0), !KTProtocol.isReserved(key) else { continue }
                let h = st.text(2)
                let got = try st.withBlob(1) { try w.add(key, utf16le: $0) }
                guard got == h else { throw KTStoreError.unreadable("\(key)'s value does not match its hash") }
            }
            return (try w.finish(), w.count, seq)
        } catch let e as KTStoreError {
            if case .unreadable = e { fail(e) }
            throw e
        }
    }

    private func protectedSnaps() throws -> Set<String> {
        var keep = Set<String>()
        if let s = sql {
            if let snap = try wipeRecord(s)?.snap { keep.insert(snap) }
            if let snap = try intent(s)?.snap { keep.insert(snap) }
        }
        return keep
    }

    /// The store as one JSON document (Settings > Storage > Export a copy). `kt_apikey` is never in the store.
    public func exportJSON() throws -> Data {
        try sync { try snapshotBytes(kind: "export", at: config.clock()).0 }
    }

    /// Moves the WAL into the database file (the app calls this when it goes to the background).
    @discardableResult
    public func checkpoint() -> Bool {
        sync {
            guard let s = try? db() else { return false }
            saveCounts(s)
            do {
                try s.exec("PRAGMA wal_checkpoint(TRUNCATE)")
                return true
            } catch let e as KTStoreError {
                fail(e)
                return false
            } catch {
                return false
            }
        }
    }

    public func close() {
        sync {
            if let s = sql { saveCounts(s) }
            sql?.close()
            sql = nil
            if case .ready = stateValue { stateValue = .unreadable("closed") }
        }
    }

    // MARK: - Status

    /// What Storage shows. `losses: true` also resolves the losses still open (Settings reads it; every hello's own
    /// reads leave them out).
    public func status(losses withLosses: Bool = false) -> KTStatus {
        sync {
            var st = KTStatus(state: "ready", why: nil, build: config.build, schema: nil, minReader: nil,
                              firstShell: nil, lastShell: nil, keys: 0, bytes: 0, tombstones: 0, unknownEnc: 0,
                              boot: boot, conflicts: 0, lastHello: lastHello, counts: diag, wipeOffer: nil,
                              putBackStaged: false, putBackWaiting: 0, lastPutBack: lastPutBack, snaps: snaps.list(),
                              inStep: false)
            switch stateValue {
            case .ready: break
            case .unreadable(let why): st.state = "unreadable"; st.why = why; return st
            case .refused(let minReader): st.state = "refused"; st.minReader = minReader; st.why = "minReader"; return st
            }
            guard let s = sql else { return st }
            st.schema = (try? meta(s, "schema"))?.flatMap(Int.init)
            st.minReader = (try? meta(s, "minReader"))?.flatMap(Int.init)
            st.firstShell = (try? meta(s, "firstShell"))?.flatMap(Int.init)
            st.lastShell = (try? meta(s, "lastShell"))?.flatMap(Int.init)
            st.keys = Int((try? s.scalarInt("SELECT COUNT(*) FROM kv WHERE v IS NOT NULL AND enc = 'u16'")) ?? 0)
            st.bytes = Int((try? s.scalarInt("SELECT SUM(length(v)) FROM kv WHERE v IS NOT NULL AND enc = 'u16'")) ?? 0)
            st.tombstones = Int((try? s.scalarInt("SELECT COUNT(*) FROM kv WHERE v IS NULL")) ?? 0)
            st.unknownEnc = Int((try? s.scalarInt("SELECT COUNT(*) FROM kv WHERE enc <> 'u16'")) ?? 0)
            st.conflicts = Int((try? s.scalarInt("SELECT COUNT(*) FROM conflicts")) ?? 0)
            st.putBackStaged = (try? meta(s, "putbackIntent")) != nil
            st.putBackWaiting = Int((try? s.scalarInt("SELECT COUNT(*) FROM putback")) ?? 0)
            if let w = try? wipeRecord(s) {
                st.wipeOffer = KTWipeOffer(at: w.at, snap: w.snap, keys: w.hashes.count, seq: w.seq)
            }
            if let h = lastHello { st.inStep = h.rule == 0 || h.rule == 5 || h.label == "migrate" }
            if withLosses { st.losses = lossesLocked() }
            return st
        }
    }

    /// The losses still open (KTLoss), newest start first.
    public func losses() -> [KTLoss] { sync { lossesLocked() } }

    /// Groups the "lag" and "wiped" rows of the last 30 days by the start that gave them up, and keeps the starts
    /// whose Put back would still write or remove something now (resolved against the store as it is: a key already
    /// back, or changed since, no longer counts). At most `limit` starts, newest first.
    private func lossesLocked(limit: Int = 10) -> [KTLoss] {
        guard case .ready = stateValue, let s = try? db(), let st = try? s.statement(
            "SELECT id, at, why, boot FROM conflicts WHERE why IN ('lag', 'wiped') ORDER BY id") else { return [] }
        var groups: [Int64: KTLoss] = [:]
        do {
            while try st.step() {
                let id = st.int64(0), at = st.int64(1), why = st.text(2) ?? "", boot = st.int64(3)
                var g = groups[boot] ?? KTLoss(boot: boot, at: at, why: why, ids: [], items: [])
                g.ids.append(id)
                g.at = max(g.at, at)
                if why == KTReason.wiped.rawValue { g.why = why }
                groups[boot] = g
            }
            st.reset()
        } catch let e as KTStoreError {
            st.reset()
            fail(e)
            return []
        } catch {
            st.reset()
            return []
        }
        var out: [KTLoss] = []
        for boot in groups.keys.sorted(by: >) {
            guard out.count < limit else { break }
            guard var g = groups[boot], let plan = try? resolve(Intent(conflicts: g.ids, snap: nil)).plan else { continue }
            g.items = plan.items.filter { $0.outcome == .putBack }
            if !g.items.isEmpty { out.append(g) }
        }
        return out
    }

    /// The values given up in the last 30 days, newest first.
    public func conflicts(limit: Int = 500) -> [KTConflict] {
        sync {
            guard let s = try? db(), let st = try? s.statement(
                "SELECT id, at, k, why, h, hnew, length(value), boot FROM conflicts ORDER BY id DESC LIMIT ?") else { return [] }
            defer { st.reset() }
            var out: [KTConflict] = []
            do {
                try st.bind(1, Int64(limit))
                while try st.step() {
                    out.append(KTConflict(id: st.int64(0), at: st.int64(1), key: st.text(2) ?? "", why: st.text(3) ?? "",
                                          h: st.text(4) ?? "", hnew: st.text(5) ?? "",
                                          units: st.isNull(6) ? nil : Int(st.int64(6) / 2), boot: st.int64(7)))
                }
            } catch let e as KTStoreError {
                fail(e)
            } catch {}
            return out
        }
    }

    /// One conflict's value (nil: absent, or no such row).
    public func conflictValue(id: Int64) -> U16? {
        sync {
            guard let s = try? db(), let st = try? s.statement("SELECT value FROM conflicts WHERE id = ?") else { return nil }
            defer { st.reset() }
            guard (try? st.bind(1, id)) != nil, (try? st.step()) == true else { return nil }
            return try? st.units(0)
        }
    }

    // MARK: - Reads for the shell and for tests

    /// A live value (nil when absent, a tombstone, or in an encoding this build does not read).
    public func value(_ key: KTKey) -> U16? {
        sync { (try? db()).flatMap { try? kvValue($0, key) } }
    }

    /// Every live value this build reads.
    public func values() -> [KTKey: U16] {
        sync {
            guard let s = try? db(), let st = try? s.statement("SELECT k, v, h FROM kv WHERE v IS NOT NULL AND enc = 'u16'") else {
                return [:]
            }
            defer { st.reset() }
            var out: [KTKey: U16] = [:]
            do {
                while try st.step() {
                    guard let key = st.key(0), let v = try st.units(1) else { continue }
                    guard KTWire.hash(v) == st.text(2) else { throw KTStoreError.unreadable("\(key)'s value does not match its hash") }
                    out[key] = v
                }
            } catch let e as KTStoreError {
                fail(e)
                return [:]
            } catch {
                return [:]
            }
            return out
        }
    }

    /// Runs `body` on the store's queue with its connection (tests and diagnostics).
    func withConnection<T>(_ body: (KTSQLite) throws -> T) throws -> T {
        try sync { try body(try db()) }
    }

    var fullSyncCommits: Int { sync { sql?.fullSyncCommits ?? 0 } }
    var journalHorizon: Int64 { sync { horizon } }
}
