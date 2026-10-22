#if os(iOS)
import Foundation
import XCTest
import FPCore
@testable import FPHost

/// FPPolicy over a local file (the Debug launch argument tests/native-store.sh uses): fetched at start, at most every
/// 15 minutes after, the last good copy kept across launches, a bad or missing file changing nothing. From build 61 the
/// copy lives in `FPShell/policy-state.json`, read first, with `fp.policy` read only when that file does not read
/// (11-shell.md H6 test 6): each test passes its own folder, so none touches the host's Application Support.
@MainActor
final class PolicyFetchTests: XCTestCase {
    private var dir: URL!
    private var suite: String!
    private var defaults: UserDefaults!
    private var file: URL { dir.appendingPathComponent("policy.json") }
    /// The shell's folder for these tests (`Application Support/FPShell` in the app).
    private var shell: URL { dir.appendingPathComponent("FPShell", isDirectory: true) }
    private var stateFile: URL { shell.appendingPathComponent("policy-state.json") }

    override func setUp() async throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("PolicyFetchTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        suite = "PolicyFetchTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: dir)
    }

    private func write(_ text: String) throws { try Data(text.utf8).write(to: file) }

    private func started() -> FPPolicy {
        let p = FPPolicy(defaults: defaults, folder: shell)
        p.start(arguments: ["App", "-fpPolicyFile", file.path])
        return p
    }

    func testDefaultsBeforeAnyFile() {
        let p = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertEqual(p.effective, .defaults)
        XCTAssertEqual(p.source, .remote(FPPolicy.remoteURL))
        XCTAssertEqual(FPPolicy.remoteURL.absoluteString, "https://drizzy603.github.io/personal-trainer/policy.json",
                       "beside build.txt on GitHub Pages")
    }

    func testTheRepoFileShapeIsReadAndKeptAcrossLaunches() throws {
        try write(#"{"v":1,"store":{"facade":"on","repair":"off"},"screens":{"coach":"off"}}"#)
        let p = started()
        XCTAssertEqual(p.source, .file(file))
        XCTAssertTrue(p.effective.facadeOn)
        XCTAssertFalse(p.effective.repairOn)
        XCTAssertFalse(p.effective.screenOn("coach"))
        XCTAssertEqual(p.fetches, 1, "fetched at launch")
        // The next launch, before (or without) any fetch: the last good copy is in force.
        let next = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertFalse(next.effective.screenOn("coach"))
        XCTAssertTrue(next.lastGoodJSON?.contains("coach") ?? false, next.lastGoodJSON ?? "-")
    }

    func testAtMostEveryFifteenMinutes() throws {
        try write(#"{"v":1}"#)
        let p = started()
        XCTAssertEqual(p.fetches, 1)
        p.fetchIfDue()
        XCTAssertEqual(p.fetches, 1, "not due again for 15 minutes")
        XCTAssertEqual(p.interval, 15 * 60)
        p.fetchIfDue(force: true)
        XCTAssertEqual(p.fetches, 2)
    }

    func testABadOrMissingFileChangesNothing() throws {
        try write(#"{"v":1,"store":{"facade":"off"}}"#)
        let p = started()
        XCTAssertFalse(p.effective.facadeOn)
        try write("<html>404</html>")
        p.fetchIfDue(force: true)
        XCTAssertFalse(p.effective.facadeOn, "a bad file keeps the last good copy")
        XCTAssertTrue(p.state.lastResult?.hasPrefix("bad file") ?? false, p.state.lastResult ?? "-")
        try FileManager.default.removeItem(at: file)
        p.fetchIfDue(force: true)
        XCTAssertFalse(p.effective.facadeOn, "so does a missing one")
        XCTAssertEqual(p.state.lastResult, "no file, nothing changed")
    }

    func testAChangePostsWhatMoved() throws {
        try write(#"{"v":1}"#)
        let p = started()
        let posted = expectation(forNotification: FPPolicy.changed, object: p) { note in
            (note.userInfo?["store"] as? Bool) == true && (note.userInfo?["screens"] as? [String]) == ["coach"]
        }
        try write(#"{"v":1,"store":{"facade":"off"},"screens":{"coach":"off"}}"#)
        p.fetchIfDue(force: true)
        wait(for: [posted], timeout: 2)
        XCTAssertFalse(p.effective.facadeOn)
    }

    /// The tools' -fpOffline (test-native.sh, shoot.py, native-store.sh) isolates the policy too: no fetch from Pages and
    /// the compiled defaults in force, whatever an earlier launch kept, so a published "off" never silently stops the
    /// tools testing the attached copy. -fpPolicyFile still wins.
    func testOfflineInDebugFetchesNothingAndUsesTheDefaults() throws {
        try write(#"{"v":1,"store":{"facade":"off"},"screens":{"coach":"off"}}"#)
        _ = started()  // an earlier launch kept an "off" copy
        let offline = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertFalse(offline.effective.facadeOn, "the kept copy, before start")
        offline.start(arguments: ["App", "-fpOffline", "-devNav", "settings"])
        #if DEBUG
        XCTAssertEqual(offline.source, .offline)
        XCTAssertEqual(offline.fetches, 0, "nothing fetched")
        offline.fetchIfDue(force: true)
        XCTAssertEqual(offline.fetches, 0, "not even when forced")
        XCTAssertEqual(offline.effective, .defaults, "the app as built")
        let file = FPPolicy(defaults: defaults, folder: shell)
        file.start(arguments: ["App", "-fpOffline", "-fpPolicyFile", self.file.path])
        XCTAssertEqual(file.source, .file(self.file), "a policy file still wins")
        XCTAssertFalse(file.effective.facadeOn)
        #endif
    }

    func testTheIntervalArgumentInDebug() throws {
        try write(#"{"v":1}"#)
        let p = FPPolicy(defaults: defaults, folder: shell)
        p.start(arguments: ["App", "-fpPolicyFile", file.path, "-fpPolicyEvery", "0"])
        p.fetchIfDue()
        XCTAssertEqual(p.fetches, 2, "-fpPolicyEvery 0: every trigger fetches")
    }

    // MARK: Where the copy lives (build 61; 11-shell.md H6 test 6, contract 10.6, D44)

    /// A state as a fetch of `body` leaves it at `at`, stored as build 60 stores it (JSON, dates in milliseconds).
    private func stored(_ body: String, at: Date) -> Data {
        var s = PolicyState()
        s.fetchStarted(at: at)
        s.record(.body(Data(body.utf8)), at: at)
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        return try! e.encode(s)
    }

    private func plantFile(_ data: Data) throws {
        try FileManager.default.createDirectory(at: shell, withIntermediateDirectories: true)
        try data.write(to: stateFile)
    }

    /// The file wins over a different UserDefaults copy (the copy came back stale after a kill and a quick reinstall),
    /// both ways round.
    func testTheCopysFileWinsOverADifferentUserDefaultsCopy() throws {
        let now = Date()
        try plantFile(stored(#"{"v":1,"screens":{"tabs":"off","coachHome":"off"}}"#, at: now))
        defaults.set(stored(#"{"v":1}"#, at: now.addingTimeInterval(-3600)), forKey: FPPolicy.stateKey)
        var p = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertFalse(p.effective.screenOn("tabs"))
        XCTAssertFalse(p.effective.screenOn("coachHome"))
        XCTAssertEqual(p.state.lastResult, "applied")
        try plantFile(stored(#"{"v":1}"#, at: now))
        defaults.set(stored(#"{"v":1,"screens":{"tabs":"off"}}"#, at: now), forKey: FPPolicy.stateKey)
        p = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertTrue(p.effective.screenOn("tabs"), "the file, though the copy says off")
    }

    /// A missing file (61's first launch after 60, which wrote only UserDefaults) or one that does not read falls back
    /// to the UserDefaults copy, and the file is written from it at once.
    func testAMissingOrGarbledFileFallsBackToTheUserDefaultsCopy() throws {
        let sixty = stored(#"{"v":1,"store":{"facade":"on","repair":"off"},"screens":{"coach":"on","coachHome":"off","tabs":"off"}}"#,
                           at: Date().addingTimeInterval(-60))
        defaults.set(sixty, forKey: FPPolicy.stateKey)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stateFile.path))
        let p = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertFalse(p.effective.screenOn("tabs"), "60's copy: the offs published before 61")
        XCTAssertFalse(p.effective.screenOn("coachHome"))
        XCTAssertTrue(p.effective.screenOn("coach"))
        // the file holds the copy: the same switches, result and stamp
        func fileHoldsTheCopy(_ why: String) throws {
            let held = try XCTUnwrap(FPPolicy.decoded(try Data(contentsOf: stateFile)), why)
            XCTAssertEqual(held.effective, p.effective, why)
            XCTAssertEqual(held.lastResult, p.state.lastResult, why)
            let a = try XCTUnwrap(held.lastAttemptAt, why), b = try XCTUnwrap(p.state.lastAttemptAt, why)
            XCTAssertEqual(a.timeIntervalSince1970, b.timeIntervalSince1970, accuracy: 0.002, why)
        }
        try fileHoldsTheCopy("written to the file at once")
        for garbled in ["<html>404</html>", "", "[]", #"{"lastGood":7}"#, #"{"lastAttemptAt":"yesterday"}"#] {
            try plantFile(Data(garbled.utf8))
            let q = FPPolicy(defaults: defaults, folder: shell)
            XCTAssertFalse(q.effective.screenOn("tabs"), garbled)
            XCTAssertEqual(q.state, p.state, garbled)
            try fileHoldsTheCopy("\(garbled): replaced by the copy")
        }
        // neither reads: the defaults, and no file made up
        try FileManager.default.removeItem(at: stateFile)
        defaults.set(Data("garbage".utf8), forKey: FPPolicy.stateKey)
        XCTAssertEqual(FPPolicy(defaults: defaults, folder: shell).effective, .defaults)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stateFile.path))
    }

    /// Every save writes both: the file (atomically: a new file renamed over the old one) and `fp.policy`, which build
    /// 60 reads after a downgrade.
    func testEverySaveWritesBoth() throws {
        try write(#"{"v":1,"screens":{"tabs":"off"}}"#)
        let p = started()
        XCTAssertEqual(try Data(contentsOf: stateFile), defaults.data(forKey: FPPolicy.stateKey))
        XCTAssertEqual(FPPolicy.decoded(try Data(contentsOf: stateFile))?.effective, p.effective)
        let inode = try FileManager.default.attributesOfItem(atPath: stateFile.path)[.systemFileNumber] as? Int
        try write(#"{"v":1}"#)
        p.fetchIfDue(force: true)
        XCTAssertTrue(p.effective.screenOn("tabs"))
        let saved = try Data(contentsOf: stateFile)
        XCTAssertEqual(saved, defaults.data(forKey: FPPolicy.stateKey))
        XCTAssertEqual(FPPolicy.decoded(saved)?.effective, .defaults)
        XCTAssertEqual(FPPolicy.decoded(saved)?.lastResult, "applied")
        let after = try FileManager.default.attributesOfItem(atPath: stateFile.path)[.systemFileNumber] as? Int
        XCTAssertNotNil(inode)
        XCTAssertNotEqual(inode, after, "renamed over, never written in place")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: shell.path), ["policy-state.json"], "nothing half-written beside it")
        // a downgrade to 60 reads fp.policy alone: the same copy
        let sixtyReads = try XCTUnwrap(FPPolicy.decoded(try XCTUnwrap(defaults.data(forKey: FPPolicy.stateKey))))
        XCTAssertEqual(sixtyReads.effective, p.effective)
    }

    /// A new FPPolicy on the same folder with UserDefaults emptied (the copy lost in a kill and reinstall) keeps the last
    /// good copy and the 15-minute stamp: no fetch until it is due.
    func testTheFileKeepsTheCopyAndTheStampWithoutUserDefaults() throws {
        try write(#"{"v":1,"screens":{"tabs":"off","coachHome":"off"}}"#)
        let p = started()
        XCTAssertEqual(p.fetches, 1)
        let stamp = try XCTUnwrap(p.state.lastAttemptAt)
        defaults.removePersistentDomain(forName: suite)
        XCTAssertNil(defaults.data(forKey: FPPolicy.stateKey))
        let next = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertFalse(next.effective.screenOn("tabs"), "the last good copy")
        XCTAssertFalse(next.effective.screenOn("coachHome"))
        let kept = try XCTUnwrap(next.state.lastAttemptAt)
        XCTAssertEqual(kept.timeIntervalSince1970, stamp.timeIntervalSince1970, accuracy: 0.002, "the stamp")
        XCTAssertNotNil(next.state.lastGoodAt)
        XCTAssertFalse(next.state.shouldFetch(at: Date()))
        next.start(arguments: ["App", "-fpPolicyFile", file.path])
        XCTAssertEqual(next.fetches, 0, "not due: the stamp came back from the file")
        XCTAssertFalse(next.effective.screenOn("tabs"))
    }

    /// A save whose file cannot be written while the device is unlocked (a full disk, an I/O error): the older file goes,
    /// so the next launch reads `fp.policy`, which holds the newer state (and writes the file from it), never the file's
    /// older copy. Before the first unlock (protected data unavailable) the file stays as it was.
    func testAFailedSaveOverAnOlderFileLeavesTheNextLaunchToTheCopy() throws {
        try write(#"{"v":1}"#)
        let p = started()   // the file and the copy: tabs on
        XCTAssertTrue(p.effective.screenOn("tabs"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: stateFile.path))
        p.writeData = { _, _ in throw CocoaError(.fileWriteOutOfSpace) }
        p.protectedDataAvailable = { true }
        try write(#"{"v":1,"screens":{"tabs":"off"}}"#)
        p.fetchIfDue(force: true)
        XCTAssertFalse(p.effective.screenOn("tabs"), "in force for this launch")
        XCTAssertFalse(try XCTUnwrap(FPPolicy.decoded(try XCTUnwrap(defaults.data(forKey: FPPolicy.stateKey)))).effective.screenOn("tabs"),
                       "the copy holds it")
        XCTAssertFalse(FileManager.default.fileExists(atPath: stateFile.path), "the older file went")
        let next = FPPolicy(defaults: defaults, folder: shell)
        XCTAssertFalse(next.effective.screenOn("tabs"), "the next launch reads the copy: off")
        XCTAssertEqual(FPPolicy.decoded(try Data(contentsOf: stateFile))?.effective, next.effective, "and writes the file from it")

        next.start(arguments: ["App", "-fpPolicyFile", file.path, "-fpPolicyEvery", "0"])   // the file and the copy: tabs off
        next.writeData = { _, _ in throw CocoaError(.fileWriteNoPermission) }
        next.protectedDataAvailable = { false }
        try write(#"{"v":1}"#)
        next.fetchIfDue(force: true)
        XCTAssertTrue(next.effective.screenOn("tabs"))
        XCTAssertEqual(FPPolicy.decoded(try Data(contentsOf: stateFile))?.effective.screenOn("tabs"), false,
                       "before the first unlock the file stays as it was")
    }

    /// `fetchIfDue(force:done:)` for ShellBridge's `status {refresh: true}` (contract 3.10; 11-shell.md H8): `done` runs
    /// once the fetch has ended, after its `changed` (so the bridge's `policyChanged` has run when the status is read);
    /// at once when no fetch is made (not due; `-fpOffline`); for a fetch that changes nothing too.
    func testDoneRunsOnceTheFetchHasEndedAfterItsChange() throws {
        final class Order: @unchecked Sendable { var items: [String] = [] }   // read and written on the main thread only
        try write(#"{"v":1}"#)
        let p = started()
        let order = Order()
        let token = NotificationCenter.default.addObserver(forName: FPPolicy.changed, object: p, queue: nil) { _ in
            order.items.append("changed")
        }
        defer { NotificationCenter.default.removeObserver(token) }
        try write(#"{"v":1,"screens":{"tabs":"off"}}"#)
        p.fetchIfDue(force: true) { order.items.append("done") }
        XCTAssertEqual(order.items, ["changed", "done"], "a local file is read at once: its change, then done")
        XCTAssertFalse(p.effective.screenOn("tabs"))
        XCTAssertEqual(p.fetches, 2)
        p.fetchIfDue { order.items.append("not due") }
        XCTAssertEqual(order.items, ["changed", "done", "not due"], "no fetch: done at once")
        XCTAssertEqual(p.fetches, 2)
        p.fetchIfDue(force: true) { order.items.append("unchanged") }
        XCTAssertEqual(order.items, ["changed", "done", "not due", "unchanged"], "a fetch that changes nothing ends too")
        XCTAssertEqual(p.fetches, 3)
        #if DEBUG
        let offline = FPPolicy(defaults: defaults, folder: shell)
        offline.start(arguments: ["App", "-fpOffline"])
        var ran = false
        offline.fetchIfDue(force: true) { ran = true }
        XCTAssertTrue(ran, "-fpOffline: nothing fetched, done at once")
        XCTAssertEqual(offline.fetches, 0)
        #endif
    }
}
#endif
