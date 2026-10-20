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
        let gate = ScreenGate.evaluate(binary: ["coach"], deviceOff: deviceOff, policy: policy, book: book, shellBuild: "60", pageBuild: page, os: 27)
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

    private func ms(_ d: Date) -> JSONValue { .number(d.timeIntervalSince1970 * 1000) }

    private func status61(book: BreakerBook = BreakerBook(), deviceOff: Set<String> = [], tabsRoot: Bool = false, os: Int = 27,
                          live: [String] = [], root: ScreenStatus.Root = .classic, fellBack: FellBack? = nil,
                          switches: [String: Bool] = [:], policy: PolicyState? = nil) -> JSONValue {
        let all = ShellContract.binaryScreens
        let gate = ScreenGate.evaluate(binary: all, deviceOff: deviceOff, policy: .defaults, book: book, shellBuild: "61", pageBuild: "P1",
                                       tabsRoot: tabsRoot, os: os)
        return ScreenStatus.json(shell: "61", page: "P1", binary: all, gate: gate, live: live, book: book, counters: ShellCounters(),
                                 launch: LaunchCounts(), root: root, fellBack: fellBack, switches: switches, policy: policy)
    }

    /// Build 61's fields (contract 10.5): the pieces' new offs (`os`, `page`, `needs` with what is needed, `["root"]`
    /// included), the root built at scene connect (a fallen-back tab root stays "tabs"), the fallback in its fixed
    /// words, the shell's device switches and the policy file's last fetch.
    func testBuild61sFields() throws {
        // a classic root on iOS 27: the chat as 60, the bar needs the root, the Coach tab needs the bar
        var s = status61(live: ["coach"])
        XCTAssertEqual(s["root"], "classic")
        XCTAssertEqual(s["fellBack"], .null)
        XCTAssertEqual(s["switches"], [:])
        XCTAssertEqual(s["policy"], .null)
        XCTAssertEqual(s["screens"]?["coach"], ["on": true, "live": true, "off": nil, "trip": nil, "why": nil, "at": nil, "canReset": false],
                       "build 60's row, byte for byte: no needs key")
        XCTAssertEqual(s["screens"]?["tabs"], ["on": false, "live": false, "off": "needs", "needs": ["root"], "trip": nil, "why": nil, "at": nil,
                                               "canReset": false])
        XCTAssertEqual(s["screens"]?["coachHome"]?["off"], "needs")
        XCTAssertEqual(s["screens"]?["coachHome"]?["needs"], ["tabs"])
        // iOS 18: tabs off os, with nothing to switch or try again; the Coach tab needs it; the chat as 60
        s = status61(os: 18)
        XCTAssertEqual(s["screens"]?["tabs"], ["on": false, "live": false, "off": "os", "trip": nil, "why": nil, "at": nil, "canReset": false])
        XCTAssertEqual(s["screens"]?["coachHome"]?["needs"], ["tabs"])
        XCTAssertEqual(s["screens"]?["coach"]?["on"], true)
        // a live tab root, everything on and live
        let all = ShellContract.binaryScreens
        s = status61(tabsRoot: true, live: all, root: .tabs, switches: ["tabs": true])
        for p in all {
            XCTAssertEqual(s["screens"]?[p]?["on"], true, p)
            XCTAssertEqual(s["screens"]?[p]?["live"], true, p)
            XCTAssertEqual(s["screens"]?[p]?["off"], .null, p)
            XCTAssertNil(s["screens"]?[p]?["needs"], p)
        }
        XCTAssertEqual(s["root"], "tabs")
        XCTAssertEqual(s["switches"], ["tabs": true])
        // declined by the page build being served, fallen back: off page (Try again clears it), the root still "tabs"
        var book = BreakerBook()
        book.decline(piece: "tabs", page: "P1")
        s = status61(book: book, live: ["coach"], root: .tabs, fellBack: FellBack(why: .page, at: t0))
        XCTAssertEqual(s["root"], "tabs", "the root built at scene connect: a fallen-back tab root stays tabs")
        XCTAssertEqual(s["fellBack"], ["why": "page", "at": ms(t0)])
        XCTAssertEqual(s["screens"]?["tabs"]?["off"], "page")
        XCTAssertEqual(s["screens"]?["tabs"]?["canReset"], true)
        XCTAssertNil(s["screens"]?["tabs"]?["needs"], "off for its own reason: no needs")
        XCTAssertEqual(s["screens"]?["coachHome"]?["needs"], ["tabs"])
        // the Coach tab declined under a live tab root: the chat needs it (joint)
        var home = BreakerBook()
        home.decline(piece: "coachHome", page: "P1")
        s = status61(book: home, tabsRoot: true, live: ["tabs"], root: .tabs)
        XCTAssertEqual(s["screens"]?["coachHome"]?["off"], "page")
        XCTAssertEqual(s["screens"]?["coach"]?["off"], "needs")
        XCTAssertEqual(s["screens"]?["coach"]?["needs"], ["coachHome"])
        XCTAssertEqual(s["screens"]?["coach"]?["canReset"], false, "nothing of its own to clear")
        XCTAssertEqual(s["screens"]?["tabs"]?["on"], true)
        // the owner's switch: off device, the switch false, the fallback's word
        s = status61(deviceOff: ["tabs"], root: .tabs, fellBack: FellBack(why: .switch, at: t0 + 2), switches: ["tabs": false])
        XCTAssertEqual(s["screens"]?["tabs"]?["off"], "device")
        XCTAssertEqual(s["switches"], ["tabs": false])
        XCTAssertEqual(s["fellBack"], ["why": "switch", "at": ms(t0 + 2)])
        // fellBack's why: each of the six words, and nothing else can be written
        for why in FellBackWhy.allCases {
            XCTAssertEqual(status61(root: .tabs, fellBack: FellBack(why: why, at: t0))["fellBack"]?["why"]?.string, why.rawValue)
        }
        XCTAssertEqual(Set(FellBackWhy.allCases.map(\.rawValue)), ["page", "refused", "no-hello", "failures", "policy", "switch"])
        // the policy file's last fetch: its time and its result word
        var p = PolicyState()
        p.fetchStarted(at: t0)
        p.record(.notModified, at: t0 + 1)
        XCTAssertEqual(status61(policy: p)["policy"], ["at": ms(t0 + 1), "result": "unchanged"])
        XCTAssertEqual(status61(policy: PolicyState())["policy"], ["at": nil, "result": nil], "never fetched")
        XCTAssertEqual([ScreenStatus.Root.tabs.rawValue, ScreenStatus.Root.classic.rawValue], ["tabs", "classic"])
    }

    /// The two counters build 61 adds (contract 10.5; leftAny for the Release leave-window count): this launch's and in
    /// all, kept across launches, read from a build 60 file without them, tolerant of another build's.
    func testCountersWithAndWithoutStraysAndLeftAny() throws {
        var c = ShellCounters(since: t0)
        c.strays.add(at: t0 + 3)
        c.leftAny.add(at: t0 + 4)
        c.leftAny.add(at: t0 + 5)
        let s = status(counters: c, launch: LaunchCounts(strays: 1, leftAny: 2))
        let counters = try XCTUnwrap(s["counters"])
        XCTAssertEqual(counters["strays"], ["launch": 1, "total": 1, "last": ms(t0 + 3)])
        XCTAssertEqual(counters["leftAny"], ["launch": 2, "total": 2, "last": ms(t0 + 5)])
        XCTAssertEqual(ShellCounters.decoded(c.encoded()), c)
        // build 60's counters (none of the two) read whole, at zero
        let sixty = ShellCounters.decoded(Data(#"{"leftWindow":{"total":2,"last":1791500000000},"hidden":{"total":0},"trips":{"total":1},"markers":{"total":0},"since":1791400000000}"#.utf8))
        XCTAssertEqual(sixty.strays, ShellCounters.Count())
        XCTAssertEqual(sixty.leftAny, ShellCounters.Count())
        XCTAssertEqual(sixty.leftWindow.total, 2)
        XCTAssertEqual(sixty.trips.total, 1)
        // another build's: each field alone
        let odd = ShellCounters.decoded(Data(#"{"strays":"x","leftAny":{"total":-3},"trips":{"total":1}}"#.utf8))
        XCTAssertEqual(odd.strays.total, 0)
        XCTAssertEqual(odd.leftAny.total, 0)
        XCTAssertEqual(odd.trips.total, 1)
        // none yet
        let none = try XCTUnwrap(status()["counters"])
        XCTAssertEqual(none["strays"], ["launch": 0, "total": 0, "last": nil])
        XCTAssertEqual(none["leftAny"], ["launch": 0, "total": 0, "last": nil])
        XCTAssertEqual(LaunchCounts(), LaunchCounts(leftWindow: 0, hidden: 0, trips: 0, markersFound: [], markers: 0, strays: 0, leftAny: 0))
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
