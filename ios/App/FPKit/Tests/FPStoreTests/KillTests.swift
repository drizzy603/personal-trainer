#if os(macOS)
import Darwin
import Foundation
import XCTest
@testable import FPStore

/// Durability under a hard kill (plan task S2: "a SIGKILLed child keeps every committed write").
///
/// The child is this test binary, started again by the parent through the xctest runner with
/// `FPSTORE_KILL_DIR` set, so it needs no target of its own. It opens the store, says hello as the facade would,
/// stamps the witness and then writes and removes keys through the prompt channel (`w B:S`, `d B:S`) without
/// pause, a snapshot every 25 ops and a checkpoint every 37, appending each op number it was answered `ok` for to
/// a file. The parent SIGKILLs it at a different point each round (in a transaction, a snapshot, a checkpoint).
/// Afterwards the store must open ready, never unreadable; each key must hold exactly the value of its last
/// acknowledged op, or of the one op that can have committed in the instant before the kill and not yet been
/// acknowledged; kv and the journal must agree; and every snapshot file must be whole.
final class KillTests: XCTestCase {
    static let dirKey = "FPSTORE_KILL_DIR"
    static let roundKey = "FPSTORE_KILL_ROUND"
    static let ackKey = "FPSTORE_KILL_ACKS"

    /// The child's side. In an ordinary run it is skipped.
    func testKillChildWriter() throws {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env[Self.dirKey], let round = env[Self.roundKey].flatMap(Int.init), let acks = env[Self.ackKey] else {
            throw XCTSkip("runs only as KillTests' child process")
        }
        KillChild.run(directory: URL(fileURLWithPath: dir, isDirectory: true), round: round, ackPath: acks)
    }

    func testSIGKILLedWriterKeepsEveryCommittedWrite() throws {
        guard let runner = Bundle.main.executablePath, (runner as NSString).lastPathComponent == "xctest" else {
            throw XCTSkip("the child is started through the xctest runner, which is not running this test")
        }
        let bundle = Bundle(for: KillTests.self).bundlePath
        let temp = TempDir()
        var rng = SplitMix(seed: 0x6b69_6c6c_6564)
        // What each key held after the last verified round: its hash.
        var held: [KTKey: String] = [:]
        var lastBoot: Int64 = 0
        var totalAcks = 0
        var checkedSnaps = Set<String>()
        let rounds = 5

        for round in 1...rounds {
            let ackPath = temp.url.appendingPathComponent("acks-\(round).txt").path
            let logURL = temp.url.appendingPathComponent("child-\(round).log")
            XCTAssertTrue(FileManager.default.createFile(atPath: logURL.path, contents: nil))
            let log = try FileHandle(forWritingTo: logURL)
            defer { try? log.close() }
            let child = Process()
            child.executableURL = URL(fileURLWithPath: runner)
            child.arguments = ["-XCTest", "FPStoreTests.KillTests/testKillChildWriter", bundle]
            var env = ProcessInfo.processInfo.environment
            env[Self.dirKey] = temp.store.path
            env[Self.roundKey] = String(round)
            env[Self.ackKey] = ackPath
            child.environment = env
            child.standardOutput = log
            child.standardError = log
            try child.run()

            // Let it run until it has a few dozen to two hundred acknowledged ops, then kill it at once or a
            // moment later: each round lands somewhere else in the store's work.
            let target = 30 + Int(rng.next() % 170)
            let started = Date()
            var acked = KillChild.Acks(path: ackPath)
            while acked.ops.count < target {
                guard child.isRunning else {
                    return XCTFail("round \(round): the child stopped by itself:\n\(childLog(logURL))")
                }
                guard Date().timeIntervalSince(started) < 60 else {
                    kill(child.processIdentifier, SIGKILL)
                    child.waitUntilExit()
                    return XCTFail("round \(round): no progress:\n\(childLog(logURL))")
                }
                usleep(1000)
                acked = KillChild.Acks(path: ackPath)
            }
            usleep(useconds_t(rng.next() % 4000))
            kill(child.processIdentifier, SIGKILL)
            child.waitUntilExit()
            XCTAssertEqual(child.terminationReason, .uncaughtSignal, "round \(round)")
            XCTAssertEqual(child.terminationStatus, SIGKILL, "round \(round)")

            // What the child was told: every op up to the last acknowledged one; op last + 1 may have committed too.
            acked = KillChild.Acks(path: ackPath)
            let boot = try XCTUnwrap(acked.boot, "round \(round): the child never said hello")
            XCTAssertGreaterThan(boot, lastBoot, "every document start takes a new boot id")
            lastBoot = boot
            let last = try XCTUnwrap(acked.ops.last)
            XCTAssertEqual(acked.ops, Array(1...last), "round \(round): ops acknowledged in order, none skipped")
            totalAcks += acked.ops.count
            var lastAck: [KTKey: Int64] = [:]
            for s in acked.ops { lastAck[KillChild.op(round: round, seq: s).key] = s }
            let inFlight = KillChild.op(round: round, seq: last + 1)

            let store = KTStore.open(storeConfig(temp.store))
            XCTAssertEqual(store.state, .ready, "round \(round): a kill never leaves the store unreadable")
            guard store.state == .ready else { return }
            for key in KillChild.allKeys {
                let row = try store.withConnection { try store.kvRow($0, key) }
                let newest = try store.withConnection { s -> String? in
                    try KTJournal.rows(s, key: key, after: 0).last?.h
                }
                if let s = lastAck[key] {
                    let r = try XCTUnwrap(row, "round \(round): \(key) lost its acknowledged op \(s)")
                    var allowed: Set<Int64> = [s]
                    if inFlight.key == key { allowed.insert(last + 1) }
                    XCTAssertEqual(r.boot, boot, "round \(round): \(key)")
                    XCTAssertTrue(allowed.contains(r.pseq),
                                  "round \(round): \(key) holds op \(r.pseq), acknowledged up to \(s) (allowed \(allowed.sorted()))")
                    let expected = KillChild.op(round: round, seq: r.pseq).value
                    XCTAssertEqual(store.value(key), expected, "round \(round): \(key) holds op \(r.pseq) exactly")
                    XCTAssertEqual(r.h, KTWire.hash(expected), "round \(round): \(key)'s hash")
                } else if inFlight.key == key, let r = row, r.boot == boot {
                    XCTAssertEqual(r.pseq, last + 1, "round \(round): \(key) holds only the op that can have committed")
                    XCTAssertEqual(store.value(key), inFlight.value)
                } else {
                    XCTAssertEqual(row?.h, held[key], "round \(round): \(key), untouched this round, is as it was")
                }
                XCTAssertEqual(newest, row?.h, "round \(round): \(key): kv and the journal agree")
                held[key] = row?.h
            }
            XCTAssertEqual(store.values().count, store.status().keys, "every value reads back, each against its hash")
            XCTAssertEqual(store.state, .ready)

            // Snapshots are written beside their name and renamed: a kill leaves a temporary file, never half a
            // snapshot.
            for name in store.snapNames() where !checkedSnaps.contains(name) {
                let data = try Data(contentsOf: store.snapsURL.appendingPathComponent(name))
                XCTAssertNoThrow(try KTSnaps.parse(data, name: name), "round \(round): \(name) is whole")
                checkedSnaps.insert(name)
            }
            store.close()
        }
        XCTAssertGreaterThanOrEqual(totalAcks, rounds * 30)
        XCTAssertTrue(checkedSnaps.contains { $0.contains("-manual") }, "snapshots were taken along the way: \(checkedSnaps)")
        print("kill test: \(rounds) rounds, \(totalAcks) acknowledged ops, last boot \(lastBoot)")
    }

    private func childLog(_ url: URL) -> String {
        String((try? String(contentsOf: url, encoding: .utf8))?.suffix(3000) ?? "(no log)")
    }
}

/// The child's work, and the parent's copy of what it does: both sides compute op `seq` of a round the same way.
enum KillChild {
    static let keys: [KTKey] = ["kt_sessions", "kt_bw", "kt_routine", "kt_coach_msgs", "kt_weights", "kt_wch_log",
                                "kt_theme", "kt_measurements"]
    static var allKeys: [KTKey] { keys + [KTProtocol.witnessKey] }

    /// Bodies from a few bytes to 40 KB of UTF-16 (a value spans many pages), with the units a text path would
    /// damage.
    static let bodies: [U16] = [8, 200, 3000, 20000].map { size in
        var out = U16()
        out.reserveCapacity(size)
        var i = 0
        while out.count < size {
            switch i % 29 {
            case 3: out.append(0xD83D)  // half an emoji
            case 7: out += [0xD83D, 0xDCAA]
            case 11: out.append(0x2028)
            case 13: out.append(0)
            case 17: out.append(0x22)
            default: out.append(UInt16(0x20 + (i * 7) % 90))
            }
            i += 1
        }
        return out
    }

    /// Op `seq` of `round`: a key and its new value (nil: a remove). Op 1 stamps the witness, as a page does at boot.
    static func op(round: Int, seq: Int64) -> (key: KTKey, value: U16?) {
        if seq == 1 { return (KTProtocol.witnessKey, Array(String(1_760_000_000_000 + Int64(round)).utf16)) }
        let key = keys[Int(seq % Int64(keys.count))]
        if seq % 9 == 0 { return (key, nil) }
        return (key, Array("round \(round) op \(seq) ".utf16) + bodies[Int((seq / 3) % Int64(bodies.count))])
    }

    /// The child's acknowledgements: `boot B`, then one op number per line.
    struct Acks {
        var boot: Int64?
        var ops: [Int64] = []

        init(path: String) {
            guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { return }
            // Only whole lines: each is one write(2), but a line is not counted until its newline is there.
            var lines = text.split(separator: "\n", omittingEmptySubsequences: false)
            lines.removeLast()
            for line in lines {
                if line.hasPrefix("boot ") { boot = Int64(line.dropFirst(5)) } else if let s = Int64(line) { ops.append(s) }
            }
        }
    }

    /// Writes until killed (or a minute passes).
    static func run(directory: URL, round: Int, ackPath: String) -> Never {
        let store = KTStore.open(storeConfig(directory))
        guard store.state == .ready else { fatalError("child: the store is \(store.state)") }
        let fd = open(ackPath, O_WRONLY | O_CREAT | O_APPEND, 0o644)
        guard fd >= 0 else { fatalError("child: cannot open \(ackPath)") }
        func ack(_ line: String) {
            let bytes = Array((line + "\n").utf8)
            let n = bytes.withUnsafeBytes { write(fd, $0.baseAddress, $0.count) }
            guard n == bytes.count else { fatalError("child: ack write \(n)") }
        }
        // WebKit, as far as this child's page knows, holds what the store holds: the hello is in step.
        let answer = store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: store.values(), gapNote: nil))
        guard let obj = try? JSONSerialization.jsonObject(with: Data(answer.utf8)) as? [String: Any],
              obj["mode"] as? String == "shadow", let boot = (obj["boot"] as? NSNumber)?.int64Value else {
            fatalError("child: hello answered \(answer)")
        }
        ack("boot \(boot)")
        var seq: Int64 = 0
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline {
            seq += 1
            let (key, value) = op(round: round, seq: seq)
            var payload = KTWire.quote(key)
            if let value { payload += "\n" + KTWire.quote(value) }
            let reply = store.answer(head: "\(value == nil ? "d" : "w") \(boot):\(seq)", payload: payload)
            guard reply == "ok" else { fatalError("child: op \(seq) answered \(reply)") }
            ack(String(seq))
            if seq % 25 == 0 { _ = try? store.writeSnap(kind: "manual") }
            if seq % 37 == 0 { _ = store.checkpoint() }
        }
        exit(0)
    }
}
#endif
