#if os(iOS)
import Foundation
import XCTest
import FPCore
@testable import FPHost

/// FPPolicy over a local file (the Debug launch argument tests/native-store.sh uses): fetched at start, at most every
/// 15 minutes after, the last good copy kept across launches, a bad or missing file changing nothing.
@MainActor
final class PolicyFetchTests: XCTestCase {
    private var dir: URL!
    private var suite: String!
    private var defaults: UserDefaults!
    private var file: URL { dir.appendingPathComponent("policy.json") }

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
        let p = FPPolicy(defaults: defaults)
        p.start(arguments: ["App", "-fpPolicyFile", file.path])
        return p
    }

    func testDefaultsBeforeAnyFile() {
        let p = FPPolicy(defaults: defaults)
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
        let next = FPPolicy(defaults: defaults)
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
        let offline = FPPolicy(defaults: defaults)
        XCTAssertFalse(offline.effective.facadeOn, "the kept copy, before start")
        offline.start(arguments: ["App", "-fpOffline", "-devNav", "settings"])
        #if DEBUG
        XCTAssertEqual(offline.source, .offline)
        XCTAssertEqual(offline.fetches, 0, "nothing fetched")
        offline.fetchIfDue(force: true)
        XCTAssertEqual(offline.fetches, 0, "not even when forced")
        XCTAssertEqual(offline.effective, .defaults, "the app as built")
        let file = FPPolicy(defaults: defaults)
        file.start(arguments: ["App", "-fpOffline", "-fpPolicyFile", self.file.path])
        XCTAssertEqual(file.source, .file(self.file), "a policy file still wins")
        XCTAssertFalse(file.effective.facadeOn)
        #endif
    }

    func testTheIntervalArgumentInDebug() throws {
        try write(#"{"v":1}"#)
        let p = FPPolicy(defaults: defaults)
        p.start(arguments: ["App", "-fpPolicyFile", file.path, "-fpPolicyEvery", "0"])
        p.fetchIfDue()
        XCTAssertEqual(p.fetches, 2, "-fpPolicyEvery 0: every trigger fetches")
    }
}
#endif
