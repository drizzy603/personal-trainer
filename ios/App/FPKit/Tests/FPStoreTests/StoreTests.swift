import Foundation
import SQLite3
import XCTest
@testable import FPStore

/// GitHub's shared Macs run several times slower than a Mac on a desk and stall at random, so there a speed bound only
/// catches a collapse. GitHub Actions sets CI; xcodebuild hands TEST_RUNNER_CI to a simulator's test process as CI.
let ciSlack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10

/// KTStore itself: the file, the writes and their answers, the journal, snapshots, conflicts and Put back.
final class StoreTests: XCTestCase {
    /// A ready store after one document start on an empty WebKit (boot 1).
    func readyStore(_ temp: TempDir, clock: TestClock = TestClock(), busyMs: Int32 = 2000) -> KTStore {
        let store = KTStore.open(storeConfig(temp.store, clock: clock, busyMs: busyMs))
        XCTAssertEqual(store.state, .ready)
        let answer = store.answer(head: "hello", payload: "null")
        XCTAssertTrue(answer.hasPrefix(#"{"mode":"shadow","boot":"#), answer)
        return store
    }

    @discardableResult
    func w(_ store: KTStore, _ key: String, _ value: U16, boot: Int64 = 1, seq: Int64) -> String {
        store.answer(head: "w \(boot):\(seq)", payload: KTWire.quote(KTKey(key)) + "\n" + KTWire.quote(value))
    }

    func postW(_ store: KTStore, _ key: String, _ value: String, _ boot: Int64, _ seq: Int64) -> KTPostResult {
        store.post(head: "w \(boot):\(seq)", payload: KTWire.quote(KTKey(key)) + "\n" + KTWire.quote(u(value)))
    }

    // MARK: kt_apikey

    func testApiKeyIsPassedThroughAndNeverStored() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        let secret = "sk-ant-api03-SECRET-0123456789abcdef"
        XCTAssertEqual(w(store, "kt_apikey", u(secret), seq: 1), "ok", "ok, so the facade notes no gap")
        XCTAssertEqual(store.answer(head: "d 1:2", payload: KTWire.quote(KTKey("kt_apikey"))), "ok")
        XCTAssertEqual(w(store, "kt_apikey", u(secret), seq: 3), "ok")
        XCTAssertEqual(postW(store, "kt_apikey", secret, 1, 4), .applied)
        let webkit: [KTKey: U16] = ["kt_apikey": u(secret), "kt_theme": u("dark"), "kt_last_open": u("1")]
        let hello = store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: webkit, gapNote: nil))
        XCTAssertFalse(hello.contains("kt_apikey"), hello)
        XCTAssertEqual(store.answer(head: "put", payload: KTProtocol.pairsPayload(webkit.map { ($0.key, $0.value) })), "ok")
        _ = try store.writeSnap(kind: "manual")
        let export = try store.exportJSON()
        XCTAssertTrue(store.checkpoint())
        XCTAssertNil(store.value("kt_apikey"))
        XCTAssertNil(store.values()["kt_apikey"])
        XCTAssertGreaterThanOrEqual(store.status().counts[.passthrough], 4)
        store.close()

        let raw = try RawDB(temp.file.path)
        for table in ["kv", "journal", "conflicts", "putback"] {
            XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM \(table) WHERE k = 'kt_apikey'"), 0, table)
        }
        let bytes = allStoreBytes(temp.store) + export
        XCTAssertNil(bytes.range(of: Data(secret.utf8)), "not in any file as UTF-8")
        var utf16le = Data()
        for c in secret.utf16 { utf16le.append(contentsOf: [UInt8(c & 0xFF), UInt8(c >> 8)]) }
        XCTAssertNil(bytes.range(of: utf16le), "not in any file as UTF-16")
        XCTAssertNil(bytes.range(of: Data(KTWire.hash(u(secret)).utf8)), "not even its hash")
    }

    func testReservedFacadeKeysNeverEnterTheStore() {
        let temp = TempDir()
        let store = readyStore(temp)
        XCTAssertEqual(w(store, "kt__store_gap", u("{}"), seq: 1), "ok")
        XCTAssertEqual(w(store, "kt__store_anything", u("x"), seq: 2), "ok")
        XCTAssertTrue(store.values().isEmpty)
    }

    // MARK: Exact values

    func testValuesStayExactAcrossAReopen() throws {
        let temp = TempDir()
        let values: [String: U16] = [
            "kt_lone_high": u("cut ") + [0xD83D],
            "kt_lone_low": [0xDC4D] + u(" first"),
            "kt_reversed_pair": [0xDC4D, 0xD83D],
            "kt_line_separators": u("a") + [0x2028, 0x2029] + u("b"),
            "kt_nul": [0x0000, 0x0061, 0x0000],
            "kt_empty": [],
            "kt_200k": (0..<200_000).map { UInt16(32 + ($0 * 7919) % 60000) },
            "kt_every_unit": (0..<65536).map { UInt16($0) },
        ]
        let store = readyStore(temp)
        var seq: Int64 = 0
        for (k, v) in values.sorted(by: { $0.key < $1.key }) {
            seq += 1
            XCTAssertEqual(w(store, k, v, seq: seq), "ok", k)
        }
        store.close()

        let again = KTStore.open(storeConfig(temp.store))
        XCTAssertEqual(again.state, .ready)
        for (k, v) in values {
            XCTAssertEqual(again.value(KTKey(k)), v, "\(k) exact after a reopen")
        }
        let raw = try RawDB(temp.file.path)
        XCTAssertEqual(try raw.text("SELECT typeof(v) FROM kv WHERE k = 'kt_lone_high'"), "blob")
        XCTAssertEqual(try raw.text("SELECT typeof(v) FROM kv WHERE k = 'kt_empty'"), "blob", "empty is a value, not NULL")
        XCTAssertEqual(try raw.int("SELECT length(v) FROM kv WHERE k = 'kt_200k'"), 400_000)
        XCTAssertEqual(try raw.text("SELECT enc FROM kv WHERE k = 'kt_nul'"), "u16")
        XCTAssertEqual(try raw.text("SELECT h FROM kv WHERE k = 'kt_200k'"), KTWire.hash(values["kt_200k"]))
        // And through a snapshot file.
        let snap = try again.writeSnap(kind: "manual")
        let read = try again.readSnap(snap.name)
        for (k, v) in values { XCTAssertEqual(read[KTKey(k)], v, "\(k) exact through a snapshot") }
    }

    // MARK: Unreadable is never empty

    func testGarbledFileReadsAsUnreadableAndIsLeftAsFound() throws {
        // Random bytes where the store should be.
        do {
            let temp = TempDir()
            try FileManager.default.createDirectory(at: temp.store, withIntermediateDirectories: true)
            var garbage = [UInt8](repeating: 0, count: 16384)
            for i in garbage.indices { garbage[i] = UInt8(truncatingIfNeeded: i &* 2654435761 >> 7) }
            try Data(garbage).write(to: temp.file)
            let store = KTStore.open(storeConfig(temp.store))
            guard case .unreadable = store.state else { return XCTFail("garbage opened as \(store.state)") }
            XCTAssertEqual(store.answer(head: "hello", payload: "null"), #"{"mode":"off","why":"unreadable"}"#)
            XCTAssertEqual(w(store, "kt_a", u("x"), seq: 1), "err")
            XCTAssertTrue(store.values().isEmpty)
            XCTAssertEqual(store.status().state, "unreadable")
            store.close()
            XCTAssertEqual(try Data(contentsOf: temp.file), Data(garbage), "never recreated or overwritten")
        }
        // A real store with one damaged page in the middle, and a truncated one.
        for damage in ["page", "truncate"] {
            let temp = TempDir()
            let store = readyStore(temp)
            for i in 0..<60 { w(store, "kt_k\(i)", U16(repeating: UInt16(0x41 + i % 26), count: 1500), seq: Int64(i + 1)) }
            XCTAssertTrue(store.checkpoint())
            store.close()
            var bytes = try Data(contentsOf: temp.file)
            XCTAssertGreaterThan(bytes.count, 4096 * 12)
            if damage == "page" {
                for i in (4096 * 6)..<(4096 * 7) { bytes[i] = UInt8(truncatingIfNeeded: i * 31) }
            } else {
                bytes = bytes.prefix(bytes.count / 2)
            }
            try bytes.write(to: temp.file)
            let again = KTStore.open(storeConfig(temp.store))
            guard case .unreadable(let why) = again.state else { return XCTFail("\(damage): opened as \(again.state)") }
            XCTAssertFalse(why.isEmpty)
            XCTAssertTrue(again.values().isEmpty)
            again.close()
            XCTAssertEqual(try Data(contentsOf: temp.file), bytes, "\(damage): never recreated or overwritten")
        }
    }

    /// The prototype's loops stopped at the first non-ROW result, so SQLITE_CORRUPT read as "the end of the table".
    func testADamagedPageMidScanThrowsInsteadOfEndingTheScan() throws {
        let temp = TempDir()
        let path = temp.url.appendingPathComponent("plain.sqlite").path
        do {
            let s = try KTSQLite.open(path: path, create: true, protect: false, busyTimeoutMs: 100)
            try s.exec("CREATE TABLE t(k INTEGER PRIMARY KEY, v BLOB)")
            try s.transaction(full: false) {
                for i in 0..<400 {
                    let st = try s.statement("INSERT INTO t(k, v) VALUES(?, ?)")
                    try st.bind(1, Int64(i))
                    try st.bind(2, units: U16(repeating: 0x42, count: 400))
                    try st.run()
                }
            }
            s.close()
        }
        var bytes = try Data(contentsOf: URL(fileURLWithPath: path))
        let leaf = 4096 * 20  // a leaf page well inside the table
        for i in leaf..<(leaf + 4096) { bytes[i] = 0xFF }
        try bytes.write(to: URL(fileURLWithPath: path))
        let s = try KTSQLite.open(path: path, create: false, protect: false, busyTimeoutMs: 100)
        defer { s.close() }
        let st = try s.statement("SELECT k, v FROM t ORDER BY k")
        var rows = 0
        XCTAssertThrowsError(try { while try st.step() { rows += 1 } }()) { error in
            guard case KTStoreError.unreadable = error else { return XCTFail("\(error)") }
        }
        XCTAssertLessThan(rows, 400, "the scan stopped at the damage, and said so")
    }

    func testMissingMainFileBesideItsWALIsLeftAsFound() throws {
        let temp = TempDir()
        try FileManager.default.createDirectory(at: temp.store, withIntermediateDirectories: true)
        let wal = URL(fileURLWithPath: temp.file.path + "-wal")
        try Data([1, 2, 3, 4]).write(to: wal)
        let store = KTStore.open(storeConfig(temp.store))
        guard case .unreadable = store.state else { return XCTFail("\(store.state)") }
        XCTAssertFalse(FileManager.default.fileExists(atPath: temp.file.path), "no store created over it")
        XCTAssertEqual(try Data(contentsOf: wal), Data([1, 2, 3, 4]))
    }

    func testFilesThatAreNotStoresAreUnreadableAndEmptyFilesBecomeStores() throws {
        let other = TempDir()
        try FileManager.default.createDirectory(at: other.store, withIntermediateDirectories: true)
        do {
            let s = try KTSQLite.open(path: other.file.path, create: true, protect: false, busyTimeoutMs: 100)
            try s.exec("CREATE TABLE notes(x TEXT); INSERT INTO notes VALUES('mine')")
            s.close()
        }
        let refused = KTStore.open(storeConfig(other.store))
        guard case .unreadable(let why) = refused.state else { return XCTFail("\(refused.state)") }
        XCTAssertTrue(why.contains("not a store"), why)
        refused.close()
        XCTAssertEqual(try RawDB(other.file.path).text("SELECT x FROM notes"), "mine")

        // A zero-byte file (a creation killed before its schema committed) holds nothing to lose.
        let empty = TempDir()
        try FileManager.default.createDirectory(at: empty.store, withIntermediateDirectories: true)
        try Data().write(to: empty.file)
        let store = KTStore.open(storeConfig(empty.store))
        XCTAssertEqual(store.state, .ready)
        let raw = try RawDB(empty.file.path)
        XCTAssertEqual(try raw.text("SELECT v FROM meta WHERE k = 'schema'"), "1")
        XCTAssertEqual(try raw.text("SELECT v FROM meta WHERE k = 'minReader'"), "60")
        XCTAssertEqual(try raw.text("SELECT v FROM meta WHERE k = 'wkExcluded'"), "[]")
        XCTAssertEqual(try raw.text("PRAGMA journal_mode"), "wal")
        for (table, column) in [("kv", "enc"), ("journal", "hprev"), ("conflicts", "hnew"), ("putback", "hbase")] {
            XCTAssertNoThrow(try raw.exec("SELECT \(column) FROM \(table) LIMIT 0"), "\(table).\(column)")
        }
    }

    // MARK: Writes and answers

    func testAsyncPostsApplyOnlyWhenNewer() {
        let temp = TempDir()
        let store = readyStore(temp)  // boot 1
        XCTAssertEqual(w(store, "kt_a", u("v5"), seq: 5), "ok")
        XCTAssertEqual(postW(store, "kt_a", "v4", 1, 4), .stale)
        XCTAssertEqual(store.value("kt_a"), u("v5"))
        XCTAssertEqual(postW(store, "kt_a", "v6", 1, 6), .applied)
        XCTAssertEqual(store.value("kt_a"), u("v6"))
        XCTAssertEqual(store.post(head: "d 1:7", payload: KTWire.quote(KTKey("kt_a"))), .applied)
        XCTAssertNil(store.value("kt_a"))
        XCTAssertEqual(postW(store, "kt_a", "same stamp", 1, 7), .stale, "a tombstone keeps its stamp")

        // A document start adopts kt_b at (2, 0): a post from boot 1 is older than that.
        let webkit: [KTKey: U16] = ["kt_b": u("B"), "kt_last_open": u("2")]
        _ = store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: webkit, gapNote: nil))
        XCTAssertEqual(store.answer(head: "put", payload: KTProtocol.pairsPayload(webkit.map { ($0.key, $0.value) })), "ok")
        XCTAssertEqual(postW(store, "kt_b", "late from boot 1", 1, 99), .stale)
        XCTAssertEqual(postW(store, "kt_b", "boot 2", 2, 1), .applied)
        XCTAssertEqual(store.value("kt_b"), u("boot 2"))
        XCTAssertEqual(postW(store, "kt_b", "boot 3 was never given", 3, 1), .refused("boot 3 was never given"))
        XCTAssertEqual(store.post(body: ["head": "w 2:2", "payload": KTWire.quote(KTKey("kt_c")) + "\n\"C\""]), .applied)
        XCTAssertEqual(store.post(head: "c 2:3", payload: nil), .applied)
        XCTAssertTrue(store.values().isEmpty)
        XCTAssertEqual(store.post(head: "hello", payload: "null"), .refused("only w, d and c are posted"))
        XCTAssertEqual(store.post(body: 42), .refused("malformed body"))
        let counts = store.status().counts
        XCTAssertEqual(counts[.postsStale], 3)
        XCTAssertEqual(counts[.postsApplied], 5)
    }

    func testFullDiskAnswersFullAndLeavesNothingHalfWritten() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        XCTAssertEqual(w(store, "kt_a", u("small"), seq: 1), "ok")
        let journal = try store.withConnection { try $0.scalarInt("SELECT COUNT(*) FROM journal") }
        try store.withConnection { s in
            let pages = try s.scalarInt("PRAGMA page_count") ?? 0
            _ = try s.scalarInt("PRAGMA max_page_count = \(pages)")
        }
        let big = U16(repeating: 0x41, count: 200_000)
        XCTAssertEqual(w(store, "kt_big", big, seq: 2), "full")
        XCTAssertEqual(w(store, "kt_sessions", big, seq: 3), "full", "a log key's FULL-sync transaction too")
        XCTAssertEqual(store.state, .ready, "a full disk is not damage")
        XCTAssertNil(store.value("kt_big"))
        XCTAssertNil(store.value("kt_sessions"))
        XCTAssertEqual(store.value("kt_a"), u("small"))
        XCTAssertEqual(try store.withConnection { try $0.scalarInt("SELECT COUNT(*) FROM journal") }, journal,
                       "no journal row without its value")
        XCTAssertEqual(store.status().counts[.full], 2)
    }

    func testAnotherWriterPastBusyTimeoutAnswersBusy() throws {
        let temp = TempDir()
        let store = readyStore(temp, busyMs: 50)
        let other = try RawDB(temp.file.path)
        try other.exec("BEGIN IMMEDIATE")
        XCTAssertEqual(w(store, "kt_a", u("x"), seq: 1), "busy")
        try other.exec("ROLLBACK")
        XCTAssertEqual(w(store, "kt_a", u("x"), seq: 2), "ok")
        XCTAssertEqual(store.state, .ready)
        XCTAssertEqual(store.status().counts[.busy], 1)
    }

    func testLogKeyTransactionsCommitWithFullSync() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        let start = store.fullSyncCommits
        XCTAssertEqual(w(store, "kt_theme", u("dark"), seq: 1), "ok")
        XCTAssertEqual(store.fullSyncCommits, start, "NORMAL for an ordinary key")
        var seq: Int64 = 1
        for key in ["kt_sessions", "kt_runs", "kt_sports", "kt_bw", "kt_measurements"] {
            seq += 1
            XCTAssertEqual(w(store, key, u("[]"), seq: seq), "ok")
        }
        XCTAssertEqual(store.fullSyncCommits, start + 5)
        XCTAssertEqual(store.answer(head: "d 1:9", payload: KTWire.quote(KTKey("kt_bw"))), "ok")
        XCTAssertEqual(store.fullSyncCommits, start + 6)
        XCTAssertEqual(try store.withConnection { try $0.scalarInt("PRAGMA synchronous") }, 1, "back to NORMAL")
        XCTAssertEqual(try store.withConnection { try $0.scalarText("PRAGMA journal_mode") }, "wal")
    }

    func testBadOpsAnswerErrAndChangeNothing() {
        let temp = TempDir()
        let store = readyStore(temp)
        XCTAssertEqual(store.answer(head: "w 1:1", payload: "\"kt_a\""), "err", "no value")
        XCTAssertEqual(store.answer(head: "w 1:1", payload: "kt_a\n\"v\""), "err", "not a literal")
        XCTAssertEqual(store.answer(head: "w 1:1", payload: "\"kt_\u{5C}ud83d\"\n\"v\""), "err", "a lone-surrogate key")
        XCTAssertEqual(store.answer(head: "w 7:1", payload: "\"kt_a\"\n\"v\""), "err", "a boot never given")
        XCTAssertEqual(store.answer(head: "put", payload: "\"kt_a\"\n\"v\""), "err", "a put hello did not ask for")
        XCTAssertEqual(store.answer(head: "rewrite", payload: nil), "err")
        XCTAssertEqual(store.answer(head: "snap", payload: nil), "err")
        XCTAssertTrue(store.values().isEmpty)
        XCTAssertGreaterThanOrEqual(store.status().counts[.badOps], 6)
    }

    func testClearTombstonesEveryLiveKey() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        w(store, "kt_a", u("a"), seq: 1)
        w(store, "kt_b", u("b"), seq: 2)
        XCTAssertEqual(store.answer(head: "c 1:3", payload: nil), "ok")
        XCTAssertTrue(store.values().isEmpty)
        XCTAssertEqual(store.status().tombstones, 2)
        XCTAssertEqual(try RawDB(temp.file.path).int("SELECT COUNT(*) FROM journal WHERE h = '-'"), 2)
    }

    func testOneConnectionOnOneQueueTakesConcurrentCalls() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        let failures = NSLock()
        var bad = 0
        DispatchQueue.concurrentPerform(iterations: 8) { t in
            for i in 0..<100 {
                let answer = store.answer(head: "w 1:\(t * 1000 + i + 1)",
                                          payload: KTWire.quote(KTKey("kt_t\(t)")) + "\n" + KTWire.quote(u("\(i)")))
                if answer != "ok" { failures.lock(); bad += 1; failures.unlock() }
                if i % 25 == 0 { _ = store.status(); _ = store.values() }
            }
        }
        XCTAssertEqual(bad, 0)
        XCTAssertEqual(store.state, .ready)
        for t in 0..<8 { XCTAssertEqual(store.value(KTKey("kt_t\(t)")), u("99")) }
        XCTAssertEqual(try store.withConnection { try $0.scalarInt("SELECT COUNT(*) FROM journal") }, 800)
    }

    // MARK: Journal

    func testJournalKeepsTheLast32WritesPerKeyAndEverythingFromTheLastTenMinutes() throws {
        let temp = TempDir()
        let clock = TestClock()
        let store = readyStore(temp, clock: clock)
        var seq: Int64 = 0
        func write(_ k: String, _ v: String) {
            seq += 1
            XCTAssertEqual(w(store, k, u(v), seq: seq), "ok")
        }
        write("kt_rare", "the programme")
        for i in 0..<100 {  // one a minute for 100 minutes
            write("kt_busy", "line \(i)")
            clock.advance(60)
        }
        let raw = try RawDB(temp.file.path)
        XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM journal WHERE k = 'kt_busy'"), 32)
        XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM journal WHERE k = 'kt_rare'"), 1, "a rare key keeps its history")
        let newestPruned = try raw.int("SELECT MIN(seq) FROM journal WHERE k = 'kt_busy'") - 1
        XCTAssertEqual(store.journalHorizon, newestPruned)
        XCTAssertEqual(try raw.text("SELECT hprev FROM journal WHERE k = 'kt_busy' ORDER BY seq DESC LIMIT 1"),
                       KTWire.hash(u("line 98")))

        // A burst inside ten minutes stays whole; ten minutes later the key falls back to its last 32.
        for i in 0..<100 { write("kt_burst", "b\(i)") }
        XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM journal WHERE k = 'kt_burst'"), 100)
        clock.advance(11 * 60)
        write("kt_burst", "after")
        XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM journal WHERE k = 'kt_burst'"), 32)
    }

    // MARK: Snapshots

    func testSnapshotsAreAtomicFilesKeptSevenDailyAndThirtyDaysForEvents() throws {
        let temp = TempDir()
        let clock = TestClock()
        let store = readyStore(temp, clock: clock)
        w(store, "kt_lone", u("x") + [0xD83D], seq: 1)
        let manual = try store.writeSnap(kind: "manual")
        XCTAssertTrue(manual.name.hasSuffix("-manual.json"))
        XCTAssertEqual(manual.keys, 1)
        for _ in 0..<10 {
            clock.advance(86_400)
            XCTAssertNotNil(store.snapIfDue())
            XCTAssertNil(store.snapIfDue(), "one a day")
        }
        var names = store.snapNames()
        XCTAssertEqual(names.filter { KTSnaps.isDaily($0) }.count, 7)
        XCTAssertTrue(names.contains(manual.name))
        clock.advance(31 * 86_400)
        _ = store.snapIfDue()
        names = store.snapNames()
        XCTAssertFalse(names.contains(manual.name), "an event snapshot is kept 30 days")
        let leftovers = try FileManager.default.contentsOfDirectory(atPath: store.snapsURL.path).filter { $0.hasPrefix(".") }
        XCTAssertEqual(leftovers, [], "no temporary file left behind")
        let newest = try XCTUnwrap(names.first)
        XCTAssertEqual(try store.readSnap(newest)["kt_lone"], u("x") + [0xD83D])
        let text = try String(contentsOf: store.snapsURL.appendingPathComponent(newest), encoding: .utf8)
        XCTAssertTrue(text.hasPrefix(#"{"v":1,"kind":"daily","at":"#), text)
        XCTAssertTrue(text.contains(#""kt_lone":"x\ud83d""#), "every surrogate half escaped in the file")
    }

    func testSnapshotsSurviveADamagedStoreFile() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        w(store, "kt_routine", u(#"{"weeks":[1,2,3]}"#), seq: 1)
        w(store, "kt_name", u("Kal") + [0xD83D], seq: 2)
        let snap = try store.writeSnap(kind: "manual")
        store.close()
        try Data(repeating: 0xAB, count: 8192).write(to: temp.file)
        let broken = KTStore.open(storeConfig(temp.store))
        guard case .unreadable = broken.state else { return XCTFail("\(broken.state)") }
        let read = try broken.readSnap(snap.name)
        XCTAssertEqual(read["kt_routine"], u(#"{"weeks":[1,2,3]}"#))
        XCTAssertEqual(read["kt_name"], u("Kal") + [0xD83D])
    }

    func testATwoMegabyteSnapshotTakesUnder20ms() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        // About 2 MB of the page's kind of data: JSON records with quotes to escape, an emoji, some Latin.
        let record = u(#"{"id":1760000000000,"date":"2026-10-10","exercises":[{"name":"Bench Pr\#u{e9}ss","#)
            + [0xD83D, 0xDCAA] + u(#"","sets":[{"w":135,"r":5},{"w":145,"r":3}]}],"wSet":{"Bench":[null,135]}},"#)
        var value = U16()
        while value.count < 100_000 { value += record }
        for i in 0..<20 { XCTAssertEqual(w(store, "kt_big\(i)", value, seq: Int64(i + 1)), "ok") }
        var times: [Double] = []
        var size = 0
        for _ in 0..<5 {
            let start = DispatchTime.now().uptimeNanoseconds
            let info = try store.writeSnap(kind: "manual")
            times.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
            size = info.bytes
        }
        times.sort()
        let median = times[2]
        print(String(format: "snapshot: %d bytes, median %.2f ms (best %.2f ms)", size, median, times[0]))
        XCTAssertGreaterThanOrEqual(size, 2_000_000)
        XCTAssertLessThan(median, 20 * ciSlack, "a 2 MB snapshot takes under 20 ms (median of 5: \(times))")
    }

    // MARK: Conflicts and Put back

    func testConflictsAreKeptThirtyDays() {
        let temp = TempDir()
        let clock = TestClock()
        let dev = FakeDevice(temp, clock: clock)
        dev.webkit = Seed.values
        dev.launch()
        dev.olderBuild { $0["kt_theme"] = u("dark") }
        dev.launch()
        XCTAssertEqual(dev.store.conflicts().filter { $0.key == "kt_theme" }.count, 1)
        clock.advance(31 * 86_400)
        dev.olderBuild { $0["kt_unit_w"] = u("kg") }
        dev.launch()
        let keys = dev.store.conflicts().map(\.key)
        XCTAssertFalse(keys.contains("kt_theme"), "older than 30 days")
        XCTAssertTrue(keys.contains("kt_unit_w"))
    }

    func testPutBackOfConflictsWhileUnchangedAndAPutBackCanBePutBack() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = Seed.values
        dev.launch()
        dev.olderBuild { wk in
            wk["kt_theme"] = u("dark")
            wk["kt_routine"] = u(#"{"name":"from 59"}"#)
        }
        dev.launch()
        dev.set("kt_routine", #"{"name":"from 59","edited on 60":true}"#)  // the owner edits it afterwards
        let theme = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_theme" })
        let routine = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_routine" })
        let preview = dev.store.previewPutBack(conflicts: [theme.id, routine.id, 999_999])
        XCTAssertEqual(preview.items.first { $0.key == "kt_theme" }?.outcome, .putBack)
        XCTAssertEqual(preview.items.first { $0.key == "kt_routine" }?.outcome, .changedSince)
        XCTAssertEqual(preview.items.first { $0.origin == "conflict:999999" }?.outcome, .notFound)
        XCTAssertFalse(dev.store.status().putBackStaged, "a preview stages nothing")

        dev.store.stagePutBack(conflicts: [theme.id, routine.id])
        XCTAssertTrue(dev.store.status().putBackStaged)
        dev.launch()
        XCTAssertEqual(dev.webkit["kt_theme"], u("heavyweight"))
        XCTAssertEqual(dev.webkit["kt_routine"], u(#"{"name":"from 59","edited on 60":true}"#), "left alone")
        XCTAssertEqual(dev.store.values(), dev.pageView, "WebKit and the store got the same values")
        XCTAssertEqual(dev.store.status().counts[.putBacks], 1)
        XCTAssertEqual(dev.store.status().lastPutBack?.count, 1)

        // The value Put back replaced is kept too, so it can itself be put back.
        let replaced = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_theme" && $0.why == "putback" })
        XCTAssertEqual(dev.store.conflictValue(id: replaced.id), u("dark"))
        dev.store.stagePutBack(conflicts: [replaced.id])
        dev.launch()
        XCTAssertEqual(dev.webkit["kt_theme"], u("dark"))
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// A value the copy kept as "no value" (the key did not exist then) goes back as a removal: the plan says so
    /// (`removes`), so Storage can ask "Remove ...?" instead of promising that nothing is removed. Seen on the iOS 27
    /// simulator: an older build's kt_streak_days row, "had no value", previewed as a plain "put back" and deleted
    /// the key (its value came back only through the putback row it left).
    func testPutBackOfAValueTheCopyHeldAsNoneIsARemovalAndThePlanSaysSo() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = Seed.values.filter { $0.key != "kt_streak_days" }
        dev.launch()
        let streak = u(#"{"2026-10-07":1,"2026-10-08":1,"2026-10-09":2}"#)
        dev.olderBuild { wk in
            wk["kt_streak_days"] = streak  // build 59 wrote a key the copy never held
            wk["kt_theme"] = u("dark")
        }
        dev.launch()
        let none = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_streak_days" })
        XCTAssertNil(none.units, "the copy held no value for it")
        let theme = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_theme" })

        // What the plugin hands the page (StoreAttach.putBackJSON encodes the items exactly so).
        func items(_ plan: KTPutBackPlan) throws -> [String: [String: Any]] {
            let obj = try JSONSerialization.jsonObject(with: try JSONEncoder().encode(plan)) as? [String: Any]
            var out: [String: [String: Any]] = [:]
            for item in (obj?["items"] as? [[String: Any]]) ?? [] { out[item["key"] as? String ?? ""] = item }
            return out
        }
        let preview = try items(dev.store.previewPutBack(conflicts: [none.id, theme.id]))
        XCTAssertEqual(preview["kt_streak_days"]?["outcome"] as? String, "put back")
        XCTAssertEqual(preview["kt_streak_days"]?["removes"] as? Bool, true, "a removal is marked: \(preview)")
        XCTAssertEqual(preview["kt_theme"]?["outcome"] as? String, "put back")
        XCTAssertNil(preview["kt_theme"]?["removes"], "a value that goes back is not a removal: \(preview)")

        // A log key the copy held as none never removes anything: there is nothing to add.
        dev.olderBuild { $0["kt_sports"] = nil }
        dev.launch()
        dev.olderBuild { $0["kt_sports"] = u(#"[{"id":9,"date":"2026-10-09","type":"Tennis"}]"#) }
        dev.launch()
        let noLog = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_sports" && $0.units == nil })
        let logPlan = try items(dev.store.previewPutBack(conflicts: [noLog.id]))
        XCTAssertEqual(logPlan["kt_sports"]?["outcome"] as? String, "nothing to add")
        XCTAssertNil(logPlan["kt_sports"]?["removes"])

        // Staged, it deletes the key from WebKit and the store; the value it removed is kept, so it can come back.
        dev.store.stagePutBack(conflicts: [none.id])
        dev.launch()
        XCTAssertNil(dev.webkit["kt_streak_days"], "removed from WebKit")
        XCTAssertNil(dev.store.value("kt_streak_days"), "and from the store")
        XCTAssertEqual(dev.store.values(), dev.pageView)
        let removed = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_streak_days" && $0.why == "putback" })
        XCTAssertEqual(dev.store.conflictValue(id: removed.id), streak)
        let back = try items(dev.store.stagePutBack(conflicts: [removed.id]))
        XCTAssertNil(back["kt_streak_days"]?["removes"], "putting the removed value back is not a removal")
        dev.launch()
        XCTAssertEqual(dev.webkit["kt_streak_days"], streak)
        XCTAssertEqual(dev.store.values(), dev.pageView)
    }

    /// Put back of a log names the records it brings back (date and day or type), so the owner sees that a workout
    /// they deleted would come back, and which: a merge only adds, so it is undone by deleting those records again.
    func testPutBackOfALogNamesTheRecordsItBringsBack() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        var seed = Seed.values
        seed["kt_sessions"] = u(#"[{"id":3,"date":"2026-10-09","type":"Pull","label":"Back + Biceps"},{"id":2,"date":"2026-10-08","type":"Push"},{"id":1,"date":"2026-10-01"}]"#)
        seed["kt_runs"] = u(#"[{"id":7,"date":"2026-10-07","distance":5,"type":"easy"}]"#)
        dev.webkit = seed
        dev.launch()
        // An older build deletes two workouts and the run; back on 60 the copy keeps what it held.
        dev.olderBuild { wk in
            wk["kt_sessions"] = u(#"[{"id":1,"date":"2026-10-01"}]"#)
            wk["kt_runs"] = u("[]")
        }
        dev.launch()
        let sessions = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_sessions" })
        let runs = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_runs" })
        // What the plugin hands the page (StoreAttach.putBackJSON encodes the items exactly so).
        func items(_ plan: KTPutBackPlan) throws -> [String: [String: Any]] {
            let obj = try JSONSerialization.jsonObject(with: try JSONEncoder().encode(plan)) as? [String: Any]
            var out: [String: [String: Any]] = [:]
            for item in (obj?["items"] as? [[String: Any]]) ?? [] { out[item["key"] as? String ?? ""] = item }
            return out
        }
        let plan = try items(dev.store.previewPutBack(conflicts: [sessions.id, runs.id]))
        XCTAssertEqual(plan["kt_sessions"]?["added"] as? Int, 2)
        XCTAssertEqual(plan["kt_sessions"]?["records"] as? [String], ["2026-10-09 Back + Biceps", "2026-10-08 Push"],
                       "the day's name when it has one, else its type: \(plan)")
        XCTAssertEqual(plan["kt_runs"]?["records"] as? [String], ["2026-10-07 easy"])
        // A value key never lists records.
        dev.olderBuild { $0["kt_theme"] = u("dark") }
        dev.launch()
        let theme = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_theme" })
        XCTAssertNil(try items(dev.store.previewPutBack(conflicts: [theme.id]))["kt_theme"]?["records"])
    }

    func testPutBackMergesALogByIdAndNeverDropsARecord() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = Seed.values
        dev.launch()
        // An older build's restore of an old file leaves one record of three.
        dev.olderBuild { $0["kt_sessions"] = u(#"[{"id":1759000000000,"date":"2026-09-20"}]"#) }
        dev.launch()
        let given = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_sessions" })
        dev.set("kt_sessions", #"[{"id":1760300000000,"date":"2026-10-12"},{"id":1759000000000,"date":"2026-09-20"}]"#)
        let plan = dev.store.stagePutBack(conflicts: [given.id])
        XCTAssertEqual(plan.items.first?.outcome, .putBack)
        XCTAssertEqual(plan.items.first?.added, 2)
        dev.launch()
        let sessions = String(decoding: try XCTUnwrap(dev.webkit["kt_sessions"]), as: UTF16.self)
        let ids = sessions.components(separatedBy: #"{"id":"#).dropFirst().map { String($0.prefix(13)) }
        XCTAssertEqual(ids, ["1760300000000", "1760000000002", "1760000000001", "1759000000000"], "newest first, none dropped")
        XCTAssertTrue(sessions.contains(#""wSet":{"Bench":[null,135]}"#), "fields the store does not model survive")
        XCTAssertEqual(dev.store.values(), dev.pageView)
    }

    func testMergeMatchesTheJavaScriptVectors() throws {
        let merges = try XCTUnwrap(WireTests.vectors()["merges"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(merges.count, 12)
        for m in merges {
            let name = try XCTUnwrap(m["name"] as? String)
            let base = (m["base"] as? String).map(u)
            let extra = u(try XCTUnwrap(m["extra"] as? String))
            let result = try XCTUnwrap(KTMerge.logs(current: base, extra: extra), name)
            XCTAssertEqual(String(decoding: result.merged, as: UTF16.self), m["expected"] as? String, name)
            XCTAssertEqual(result.added, m["added"] as? Int, name)
        }
        XCTAssertNil(KTMerge.logs(current: u("{}"), extra: u("[]")), "not an array")
        XCTAssertNil(KTMerge.logs(current: nil, extra: u("[1,")))
    }

    func testPutBackThatLandedWithoutItsConfirmationIsRecognised() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = Seed.values
        dev.launch()
        dev.olderBuild { $0["kt_theme"] = u("dark") }
        dev.launch()
        let theme = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_theme" })
        dev.store.stagePutBack(conflicts: [theme.id])
        // A document start where the facade writes WebKit and is killed before it confirms.
        let hello = dev.store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: dev.webkit, gapNote: nil))
        XCTAssertTrue(hello.contains(#""putback":true"#), hello)
        let values = Array(dev.store.answer(head: "pb", payload: nil).utf16)
        for (k, r) in try XCTUnwrap(KTJSON.objectMembers(values)) { dev.webkit[KTKey(units: k)!] = KTJSON.string(values, r) }
        XCTAssertEqual(dev.webkit["kt_theme"], u("heavyweight"))
        XCTAssertEqual(dev.store.status().putBackWaiting, 1)
        dev.relaunch()
        let next = dev.launch()
        XCTAssertEqual(next["rule"] as? Int, 0, "recognised, not unexplained")
        XCTAssertEqual(dev.store.value("kt_theme"), u("heavyweight"))
        XCTAssertEqual(dev.store.status().counts[.putBacksLanded], 1)
        XCTAssertEqual(dev.store.status().putBackWaiting, 0)
        XCTAssertTrue(dev.store.conflicts().contains { $0.key == "kt_theme" && $0.why == "putback" })
    }

    func testPutBackThatWebKitNeverTookIsDropped() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = Seed.values
        dev.launch()
        dev.olderBuild { $0["kt_theme"] = u("dark") }
        dev.launch()
        let theme = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_theme" })
        dev.store.stagePutBack(conflicts: [theme.id])
        _ = dev.store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: dev.webkit, gapNote: nil))
        _ = dev.store.answer(head: "pb", payload: nil)  // handed out; WebKit never took it
        dev.relaunch()
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
        XCTAssertEqual(dev.store.value("kt_theme"), u("dark"), "WebKit is followed")
        XCTAssertEqual(dev.store.status().counts[.putBackDropped], 1)
        XCTAssertFalse(dev.store.status().putBackStaged)
    }

    // MARK: Shell values in meta

    func testShellMetaKeepsPolicyAndBreakerAndNothingElse() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        XCTAssertNil(store.shellMeta(.policy))
        XCTAssertTrue(store.setShellMeta(.policy, #"{"v":1,"store":{"facade":"on"}}"#))
        XCTAssertTrue(store.setShellMeta(.breaker, "store@20261010-1 shell 60"))
        store.close()
        let again = KTStore.open(storeConfig(temp.store))
        XCTAssertEqual(again.shellMeta(.policy), #"{"v":1,"store":{"facade":"on"}}"#)
        XCTAssertEqual(again.shellMeta(.breaker), "store@20261010-1 shell 60")
        XCTAssertTrue(again.setShellMeta(.breaker, nil))
        XCTAssertNil(again.shellMeta(.breaker))
        XCTAssertEqual(again.status().minReader, 60, "the store's own entries are out of reach")
        XCTAssertEqual(again.status().schema, 1)
        again.close()

        // A store this build may not touch takes no shell values either.
        try RawDB(temp.file.path).exec("UPDATE meta SET v = '61' WHERE k = 'minReader'")
        let refused = KTStore.open(storeConfig(temp.store))
        XCTAssertNil(refused.shellMeta(.policy))
        XCTAssertFalse(refused.setShellMeta(.policy, "{}"))
        refused.close()
        XCTAssertEqual(try RawDB(temp.file.path).text("SELECT v FROM meta WHERE k = 'policy'"),
                       #"{"v":1,"store":{"facade":"on"}}"#)
    }

    // MARK: Speed of the synchronous channel

    /// The prototype's mactest timed a 150k-character write. The facade blocks the page for each one, so a
    /// regression shows here first: a loose bound for a debug build (on the simulator a release build answers in
    /// well under a millisecond).
    func testA150kCharacterWriteIsAnsweredQuickly() {
        let temp = TempDir()
        let store = readyStore(temp)
        let value = (0..<150_000).map { UInt16(32 + $0 % 90) }
        var times: [Double] = []
        for seq in 1...5 {
            let payload = KTWire.quote(KTKey("kt_big")) + "\n" + KTWire.quote(value + [UInt16(seq)])
            let start = DispatchTime.now().uptimeNanoseconds
            XCTAssertEqual(store.answer(head: "w 1:\(seq)", payload: payload), "ok")
            times.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
        }
        times.sort()
        print(String(format: "150k-character write: median %.2f ms (best %.2f ms)", times[2], times[0]))
        XCTAssertLessThan(times[2], 50 * ciSlack, "\(times)")
        XCTAssertEqual(store.value("kt_big"), value + [5])
    }

    // MARK: Checkpoint and status

    func testCheckpointEmptiesTheWALAndStatusDescribesTheStore() throws {
        let temp = TempDir()
        let store = readyStore(temp)
        w(store, "kt_a", u("abc"), seq: 1)
        w(store, "kt_b", u("de"), seq: 2)
        XCTAssertEqual(store.answer(head: "d 1:3", payload: KTWire.quote(KTKey("kt_b"))), "ok")
        XCTAssertTrue(store.checkpoint())
        let wal = try FileManager.default.attributesOfItem(atPath: temp.file.path + "-wal")[.size] as? Int
        XCTAssertEqual(wal, 0)
        let status = store.status()
        XCTAssertEqual(status.state, "ready")
        XCTAssertEqual(status.schema, 1)
        XCTAssertEqual(status.minReader, 60)
        XCTAssertEqual(status.firstShell, 60)
        XCTAssertEqual(status.lastShell, 60)
        XCTAssertEqual(status.keys, 1)
        XCTAssertEqual(status.bytes, 6)
        XCTAssertEqual(status.tombstones, 1)
        XCTAssertEqual(status.boot, 1)
        XCTAssertEqual(status.lastHello?.label, "migrate")
        XCTAssertTrue(status.inStep)
        XCTAssertNoThrow(try JSONEncoder().encode(status), "the plugin hands it to the page as JSON")
        store.close()
        let later = KTStore.open(storeConfig(temp.store, build: 61))
        XCTAssertEqual(later.status().firstShell, 60)
        XCTAssertEqual(later.status().lastShell, 61)
        XCTAssertEqual(later.status().counts[.writes], status.counts[.writes], "counters survive a relaunch")
    }
}
