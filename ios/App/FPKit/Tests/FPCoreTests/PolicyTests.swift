import Foundation
import XCTest
import FPCore

final class PolicyTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_791_500_000)

    private func file(_ path: String) throws -> Data { try FixtureFiles.data("policy/\(path)") }

    private func parse(_ path: String) throws -> Result<Policy, Policy.ParseError> { Policy.parse(try file(path)) }

    func testSafeDefaults() {
        let p = Policy.defaults
        XCTAssertTrue(p.facadeOn)
        XCTAssertFalse(p.repairOn, "build 60 is observe only")
        XCTAssertTrue(p.screenOn("coach"))
        XCTAssertTrue(p.screenOn("anything"), "a screen not named is on")
        XCTAssertEqual(PolicyState().effective, .defaults, "before any good file, the defaults")
    }

    func testGoodFiles() throws {
        XCTAssertEqual(try parse("good/default.json").get(), .defaults)
        XCTAssertEqual(try parse("good/empty.json").get(), .defaults)
        XCTAssertEqual(try parse("good/nulls.json").get(), .defaults, "null is the default")
        XCTAssertEqual(try parse("good/coach-off.json").get(), Policy(screens: ["coach": .off]))
        XCTAssertEqual(try parse("good/facade-off.json").get(), Policy(facade: .off))
        XCTAssertEqual(try parse("good/booleans.json").get(), Policy(facade: .off, repair: .on, screens: ["coach": .off]))
        // additive within v1: unknown keys are ignored, a screen this build lacks keeps a readable switch
        let newer = try parse("good/newer-keys.json").get()
        XCTAssertEqual(newer.facade, .on)
        XCTAssertTrue(newer.screenOn("coach"))
        XCTAssertFalse(newer.screenOn("settings"))
        XCTAssertNil(newer.screens["tabs"], "a screen this build lacks, with a value it cannot read: ignored")
    }

    /// A bad file changes nothing: not a half-applied one, not the defaults.
    func testBadFilesChangeNothing() throws {
        let bad = FixtureFiles.files(in: "policy/bad")
        XCTAssertGreaterThanOrEqual(bad.count, 10)
        for url in bad {
            let data = try Data(contentsOf: url)
            guard case .failure = Policy.parse(data) else { XCTFail("\(url.lastPathComponent) read as good"); continue }
            var state = PolicyState()
            state.record(.body(try file("good/coach-off.json")), at: t0)
            let change = state.record(.body(data), at: t0 + 1)
            XCTAssertFalse(change.any, url.lastPathComponent)
            XCTAssertFalse(state.effective.screenOn("coach"), "\(url.lastPathComponent): the last good copy stays in force")
            XCTAssertTrue(state.lastResult?.hasPrefix("bad file, ignored") ?? false, state.lastResult ?? "")
        }
        XCTAssertEqual(try parse("bad/version-2.json").failureValue, .version(2))
        XCTAssertEqual(try parse("bad/no-version.json").failureValue, .version(nil))
        XCTAssertEqual(try parse("bad/coach-maybe.json").failureValue, .badValue("screens.coach"))
        XCTAssertEqual(try parse("bad/facade-unknown.json").failureValue, .badValue("store.facade"))
        XCTAssertEqual(try parse("bad/store-not-object.json").failureValue, .badValue("store"))
        XCTAssertEqual(try parse("bad/array.json").failureValue, .notAnObject)
        XCTAssertEqual(Policy.parse(Data(repeating: 0x20, count: Policy.maxBytes + 1)).failureValue, .tooLarge(Policy.maxBytes + 1))
    }

    func testMissingOrFailedFetchChangesNothing() throws {
        var state = PolicyState()
        state.record(.body(try file("good/facade-off.json")), at: t0)
        let kept = state.effective
        for result in [PolicyState.FetchResult.missing, .failed("offline"), .notModified] {
            XCTAssertFalse(state.record(result, at: t0 + 2).any)
            XCTAssertEqual(state.effective, kept, "\(result)")
        }
        XCTAssertEqual(state.lastGoodAt, t0)
        XCTAssertEqual(PolicyState().effective, .defaults)
        var fresh = PolicyState()
        fresh.record(.missing, at: t0)
        XCTAssertEqual(fresh.effective, .defaults, "no file ever: the defaults")
        XCTAssertEqual(fresh.lastResult, "no file, nothing changed")
    }

    /// A good file replaces the last good copy whole, and says what moved: screens follow at once,
    /// the store at the next document start.
    func testGoodFileReplacesTheCopyAndSaysWhatChanged() throws {
        var state = PolicyState()
        var change = state.record(.body(try file("good/coach-off.json")), at: t0)
        XCTAssertEqual(change.screens, ["coach"])
        XCTAssertFalse(change.store)
        XCTAssertEqual(state.lastResult, "applied")
        change = state.record(.body(try file("good/coach-off.json")), at: t0 + 1)
        XCTAssertFalse(change.any)
        XCTAssertEqual(state.lastResult, "unchanged")
        change = state.record(.body(try file("good/empty.json")), at: t0 + 2)
        XCTAssertEqual(change.screens, ["coach"], "a switch the file leaves out goes back to its default")
        XCTAssertTrue(state.effective.screenOn("coach"))
        change = state.record(.body(try file("good/facade-off.json")), at: t0 + 3)
        XCTAssertTrue(change.store)
        XCTAssertEqual(change.screens, [])
        XCTAssertFalse(state.effective.facadeOn)
    }

    func testRefetchAtMostEveryFifteenMinutes() {
        var state = PolicyState()
        XCTAssertTrue(state.shouldFetch(at: t0), "never fetched")
        state.fetchStarted(at: t0)
        XCTAssertFalse(state.shouldFetch(at: t0 + 60))
        XCTAssertFalse(state.shouldFetch(at: t0 + 15 * 60 - 1))
        XCTAssertTrue(state.shouldFetch(at: t0 + 15 * 60))
        XCTAssertTrue(state.shouldFetch(at: t0 - 3600), "a clock that went back")
        state.record(.failed("offline"), at: t0 + 20 * 60)
        XCTAssertFalse(state.shouldFetch(at: t0 + 21 * 60), "a failed fetch counts too")
        XCTAssertTrue(state.shouldFetch(at: t0 + 35 * 60))
        XCTAssertEqual(PolicyState.refetchInterval, 900)
    }

    func testStateIsKeptBetweenLaunches() throws {
        var state = PolicyState()
        state.fetchStarted(at: t0)
        state.record(.body(try file("good/booleans.json")), at: t0 + 1)
        let data = try JSONEncoder().encode(state)
        let back = try JSONDecoder().decode(PolicyState.self, from: data)
        XCTAssertEqual(back, state)
        XCTAssertEqual(back.effective, Policy(facade: .off, repair: .on, screens: ["coach": .off]))
    }
}

private extension Result {
    var failureValue: Failure? {
        if case .failure(let e) = self { return e }
        return nil
    }
}
