import Foundation
import XCTest
import FPCore

/// Settings > About's view of the native screens (ScreenStatus, TrovoShell `status`): every screen this binary has stays
/// listed, on or off, with the reason in the shell's own terms (the device switch, the policy file, a crash verdict for
/// this shell and page build, the native breaker for this page build) and whether the owner can try it again; the
/// counters kept across launches beside this launch's. Before it, the page showed the row only for a negotiated screen,
/// so it vanished exactly when the chat was off for a reason the owner could not see.
final class ShellStatusTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_791_500_000)

    private func status(book: BreakerBook = BreakerBook(), policy: Policy = .defaults, deviceOff: Set<String> = [], page: String? = "P1",
                        live: [String] = [], counters: ShellCounters = ShellCounters(), launch: LaunchCounts = LaunchCounts()) -> JSONValue {
        let gate = ScreenGate.evaluate(binary: ["coach"], deviceOff: deviceOff, policy: policy, book: book, shellBuild: "60", pageBuild: page)
        return ScreenStatus.json(shell: "60", page: page, binary: ["coach"], gate: gate, live: live, book: book, counters: counters, launch: launch)
    }

    func testEveryScreenOfTheBinaryIsListedWithWhyItIsOff() throws {
        // on and live
        var s = status(live: ["coach"])
        XCTAssertEqual(s["screens"]?["coach"], ["on": true, "live": true, "off": nil, "trip": nil, "why": nil, "at": nil, "canReset": false])
        XCTAssertEqual(s["shell"], "60")
        XCTAssertEqual(s["page"], "P1")
        // the policy file: off, nothing for the owner to clear
        s = status(policy: Policy(screens: ["coach": .off]))
        XCTAssertEqual(s["screens"]?["coach"]?["off"], "policy")
        XCTAssertEqual(s["screens"]?["coach"]?["on"], false)
        XCTAssertEqual(s["screens"]?["coach"]?["canReset"], false)
        // a crash verdict for this pair: off, its words and time, and the owner can try again
        var book = BreakerBook()
        book.recordStaleMarkers([CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60")], at: t0)
        s = status(book: book)
        let crash = try XCTUnwrap(s["screens"]?["coach"])
        XCTAssertEqual(crash["off"], "crash")
        XCTAssertEqual(crash["why"], "crash marker: the app closed while the native coach screen was up")
        XCTAssertEqual(crash["at"]?.double, t0.timeIntervalSince1970 * 1000)
        XCTAssertEqual(crash["canReset"], true)
        XCTAssertEqual(s["verdicts"]?.array?.count, 1, "the verdicts the book holds are listed for the sheet")
        XCTAssertEqual(s["verdicts"]?[0]?["page"], "P1")
        // the same verdict under another page build: that page is clean (the verdict is still listed)
        let other = status(book: book, page: "P2")
        XCTAssertEqual(other["screens"]?["coach"]?["on"], true)
        XCTAssertEqual(other["screens"]?["coach"]?["off"], .null)
        XCTAssertEqual(other["verdicts"]?.array?.count, 1)
        // the native breaker: paused, the trip's reason and detail
        book.clearDisabled(piece: "coach")
        _ = book.trip(screen: "coach", pageBuild: "P1", reason: .noHello, detail: "no hello within 15 s", at: t0)
        s = status(book: book)
        XCTAssertEqual(s["screens"]?["coach"]?["off"], "breaker")
        XCTAssertEqual(s["screens"]?["coach"]?["trip"], "no-hello")
        XCTAssertEqual(s["screens"]?["coach"]?["why"], "no hello within 15 s")
        XCTAssertEqual(s["screens"]?["coach"]?["canReset"], true)
        // the device switch is named first, and is the owner's own switch (nothing to reset)
        s = status(book: book, deviceOff: ["coach"])
        XCTAssertEqual(s["screens"]?["coach"]?["off"], "device")
        XCTAssertEqual(s["screens"]?["coach"]?["canReset"], false)
    }

    /// "Try the native chat again" clears what turned the screen off for the owner (a verdict, a trip), and the status
    /// says it is on for the next document.
    func testTurnBackOnClearsTheVerdictsAndTheBreaker() {
        var book = BreakerBook()
        book.recordStaleMarkers([CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60"),
                                 CrashMarker(piece: .store, pageBuild: "P1", shellBuild: "60")], at: t0)
        _ = book.recordFailure(screen: "coach", pageBuild: "P1", detail: "timeout", at: t0, limit: 3)
        XCTAssertTrue(book.turnBackOn(screen: "coach"))
        XCTAssertNil(book.disabled(piece: "coach", shell: "60", page: "P1"))
        XCTAssertNotNil(book.disabled(piece: "store", shell: "60", page: "P1"), "the store's own verdict is Storage's to clear")
        XCTAssertNil(book.screens["coach"], "the breaker record goes too")
        XCTAssertFalse(book.turnBackOn(screen: "coach"), "nothing left: nothing changes")
        XCTAssertEqual(status(book: book)["screens"]?["coach"]?["on"], true)
    }

    func testCountersThisLaunchAndInAll() throws {
        var c = ShellCounters(since: t0)
        c.leftWindow.add(at: t0 + 5)
        c.hidden.add(at: t0 + 6)
        c.hidden.add(at: t0 + 7)
        c.trips.add(at: t0 + 8)
        c.markers.add(at: t0 + 9)
        let s = status(counters: c, launch: LaunchCounts(leftWindow: 1, hidden: 0, trips: 1, markersFound: ["presenting coach@P1 shell 60"], markers: 1))
        let counters = try XCTUnwrap(s["counters"])
        XCTAssertEqual(counters["since"]?.double, t0.timeIntervalSince1970 * 1000)
        XCTAssertEqual(counters["leftWindow"], ["launch": 1, "total": 1, "last": .number((t0 + 5).timeIntervalSince1970 * 1000)])
        XCTAssertEqual(counters["hidden"]?["launch"], 0)
        XCTAssertEqual(counters["hidden"]?["total"], 2)
        XCTAssertEqual(counters["trips"]?["total"], 1)
        XCTAssertEqual(counters["markers"]?["found"], ["presenting coach@P1 shell 60"])
        XCTAssertEqual(counters["markers"]?["launch"], 1)
        // kept across launches, tolerant of another build's record
        XCTAssertEqual(ShellCounters.decoded(c.encoded()), c)
        XCTAssertEqual(ShellCounters.decoded(Data(#"{"hidden":{"total":"x","last":5},"trips":{"total":3},"newer":1}"#.utf8)).trips.total, 3)
        XCTAssertEqual(ShellCounters.decoded(Data("not json".utf8)), ShellCounters())
        XCTAssertEqual(ShellCounters.decoded(nil), ShellCounters())
    }
}
