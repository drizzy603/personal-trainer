import Foundation
import XCTest
import FPCore

/// The link state machine (C4 acceptance): the 15 s hello deadline, the 3-failure breaker, and the reset
/// on a new page build.
final class LinkStateTests: XCTestCase {
    private let shell = ShellContract(shell: "60", screens: ["coach"])
    private let t0 = Date(timeIntervalSince1970: 1_791_500_000)
    private let send = Intent.coachSend(text: "hi", image: nil, usePending: nil, nonce: "n1")
    private let ok = IntentOutcome.done(IntentReply(json: ["ok": true]))

    private func hello(_ page: String = "P1", boot: String? = "b1", v: Int = 1) -> HelloRequest {
        HelloRequest(v: v, page: page, screens: ["coach"], boot: boot)
    }

    private func linked(_ page: String = "P1", boot: String = "b1") -> LinkState {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: page, at: t0)
        _ = s.hello(hello(page, boot: boot), available: ["coach"], at: t0 + 1)
        return s
    }

    private func trips(_ fx: [LinkEffect]) -> [Trip] {
        fx.compactMap { if case .screenOff(_, .tripped(let t)) = $0 { return t } else { return nil } }
    }

    // MARK: The hello deadline

    func testHelloWithinTheDeadlineLinks() {
        var s = LinkState(shell: shell)
        XCTAssertEqual(s.phase, .idle)
        XCTAssertEqual(s.documentStarted(pageBuild: "P1", at: t0), [])
        XCTAssertEqual(s.phase, .awaitingHello)
        XCTAssertEqual(s.waitedForHello(at: t0 + 5), 5)
        XCTAssertEqual(s.helloDeadline(from: t0 + 5), t0 + 15)
        let (reply, fx) = s.hello(hello(), available: ["coach"], at: t0 + 2)
        XCTAssertEqual(reply, HelloReply(v: 1, screens: ["coach"]))
        let link = LinkState.Link(boot: "b1", bootFromPage: true, v: 1, page: "P1", screens: ["coach"])
        XCTAssertEqual(fx, [.linked(link)])
        XCTAssertEqual(s.link, link)
        XCTAssertTrue(s.isLive("coach"))
        XCTAssertEqual(s.liveScreens, ["coach"])
        XCTAssertNil(s.waitedForHello(at: t0 + 100))
        XCTAssertNil(s.helloDeadline(from: t0 + 100))
        XCTAssertEqual(s.tick(at: t0 + 100), [], "a linked document has no deadline")
    }

    func testNoHelloInFifteenSecondsTurnsTheScreensOffForThePageBuild() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(s.tick(at: t0 + 14.9), [])
        let fx = s.tick(at: t0 + 15)
        XCTAssertEqual(trips(fx).map(\.reason), [.noHello])
        XCTAssertEqual(fx.last, .bookChanged)
        XCTAssertEqual(s.phase, .unlinked(.noHello))
        XCTAssertEqual(s.book.trip(screen: "coach", pageBuild: "P1")?.detail, "no hello within 15 s")
        XCTAssertEqual(s.tick(at: t0 + 30), [], "once")
        // a hello after the trip forms the link with no screens
        let (reply, _) = s.hello(hello(), available: ["coach"], at: t0 + 20)
        XCTAssertEqual(reply.screens, [])
        XCTAssertEqual(reply.v, 1)
        XCTAssertFalse(s.isLive("coach"))
        XCTAssertEqual(s.link?.screens, [])
    }

    /// Only foreground time counts: a launch sent to the background mid-boot never trips it.
    func testOnlyForegroundTimeCounts() {
        var s = LinkState(shell: shell, foreground: false)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertNil(s.helloDeadline(from: t0))
        XCTAssertEqual(s.tick(at: t0 + 600), [], "ten minutes in the background")
        XCTAssertEqual(s.setForeground(true, at: t0 + 600), [])
        XCTAssertEqual(s.setForeground(true, at: t0 + 601), [], "no change, nothing to do")
        XCTAssertEqual(s.tick(at: t0 + 610), [])
        XCTAssertEqual(s.setForeground(false, at: t0 + 612), [])
        XCTAssertEqual(s.waitedForHello(at: t0 + 2000), 12)
        XCTAssertEqual(s.setForeground(true, at: t0 + 2000), [])
        XCTAssertEqual(s.helloDeadline(from: t0 + 2000), t0 + 2003)
        XCTAssertEqual(s.tick(at: t0 + 2002.5), [])
        XCTAssertEqual(trips(s.tick(at: t0 + 2003)).count, 1)
        // leaving the foreground past the deadline trips at that moment
        var t = LinkState(shell: shell)
        _ = t.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(trips(t.setForeground(false, at: t0 + 16)).count, 1)
        // a clock that goes back never counts as time waited
        var u = LinkState(shell: shell)
        _ = u.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(u.waitedForHello(at: t0 - 60), 0)
    }

    func testLateHelloIsAMissEvenWithoutATick() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        let (reply, fx) = s.hello(hello(), available: ["coach"], at: t0 + 16)
        XCTAssertEqual(trips(fx).map(\.reason), [.noHello])
        XCTAssertEqual(reply.screens, [])
        XCTAssertEqual(s.link?.screens, [])
        XCTAssertEqual(s.book.trip(screen: "coach", pageBuild: "P1")?.at, t0 + 16)
    }

    /// The shell could not tell the build at the document start: the trip is kept under no build, and
    /// the late hello that names the build trips again under it, rather than clearing it as a new build.
    func testLateHelloIsAMissWhenTheBuildWasUnknownAtTheStart() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: nil, at: t0)
        XCTAssertEqual(trips(s.tick(at: t0 + 15)).count, 1)
        XCTAssertNotNil(s.book.trip(screen: "coach", pageBuild: nil))
        let (reply, fx) = s.hello(hello("P1"), available: ["coach"], at: t0 + 16)
        XCTAssertEqual(reply.screens, [])
        XCTAssertFalse(fx.contains(.breakersReset(pageBuild: "P1")), "the page's own trip is not another build's")
        XCTAssertEqual(trips(fx).map(\.reason), [.noHello])
        XCTAssertEqual(fx.last, .bookChanged)
        XCTAssertEqual(s.book.trip(screen: "coach", pageBuild: "P1")?.reason, .noHello)
        XCTAssertFalse(s.isLive("coach"))
    }

    func testHelloBeforeAnyDocumentStartAndWithoutABoot() {
        var s = LinkState(shell: shell)
        let (reply, _) = s.hello(hello(boot: nil), available: ["coach"], at: t0)
        XCTAssertEqual(reply.screens, ["coach"])
        XCTAssertEqual(s.documents, 1)
        XCTAssertEqual(s.link?.boot, "doc-1")
        XCTAssertEqual(s.link?.bootFromPage, false)
        XCTAssertEqual(s.pageBuild, "P1")
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b-anything", decoded: true, at: t0).verdict, .apply,
                       "a link whose hello named no boot cannot tell a model's")
        XCTAssertEqual(s.documentStarted(pageBuild: "P1", at: t0 + 5), [.documentGone(boot: "doc-1")])
        XCTAssertEqual(s.hello(hello(boot: nil), available: ["coach"], at: t0 + 6).effects.last, .linked(LinkState.Link(
            boot: "doc-2", bootFromPage: false, v: 1, page: "P1", screens: ["coach"])))
    }

    func testRefusedContract() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        let (reply, fx) = s.hello(hello(v: 0), available: ["coach"], at: t0 + 1)
        XCTAssertEqual(reply, HelloReply(v: 0, screens: [], why: "no-version"))
        XCTAssertEqual(fx, [])
        XCTAssertEqual(s.phase, .unlinked(.refused(.noVersion)))
        XCTAssertFalse(s.isLive("coach"))
        XCTAssertNil(s.link)
        XCTAssertEqual(s.tick(at: t0 + 60), [], "a refused page is not a missing hello")
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b1", decoded: true, at: t0 + 2).verdict, .notLive)
        XCTAssertEqual(s.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + 2), [])
    }

    /// A reload while the page boots gives the new document its own 15 s; a document that ran out of
    /// time with no tick to see it is caught when the next one starts.
    func testEachDocumentHasItsOwnDeadline() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(s.documentStarted(pageBuild: "P1", at: t0 + 10), [])
        XCTAssertEqual(s.tick(at: t0 + 20), [])
        XCTAssertEqual(trips(s.tick(at: t0 + 25)).count, 1)

        var missed = LinkState(shell: shell)
        _ = missed.documentStarted(pageBuild: "P1", at: t0)
        let fx = missed.documentStarted(pageBuild: "P1", at: t0 + 20)
        XCTAssertEqual(trips(fx).map(\.reason), [.noHello])
        XCTAssertEqual(missed.phase, .awaitingHello)
        XCTAssertEqual(missed.hello(hello(boot: "b2"), available: ["coach"], at: t0 + 21).reply.screens, [], "the page build tripped")

        var custom = LinkState(shell: shell, config: LinkState.Config(helloDeadline: 0.5))
        _ = custom.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(trips(custom.tick(at: t0 + 0.5)).first?.detail, "no hello within 0.5 s")
    }

    // MARK: The breaker

    func testThreeFailedIntentsInARowTripTheScreen() {
        var s = linked()
        XCTAssertEqual(s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0 + 2), [.bookChanged])
        XCTAssertEqual(s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0 + 3), [.bookChanged])
        XCTAssertEqual(s.intentFinished(.coachStop, boot: "b1", outcome: ok, at: t0 + 4), [.bookChanged], "a success starts the count again")
        XCTAssertEqual(s.intentFinished(.coachStop, boot: "b1", outcome: ok, at: t0 + 4), [])
        _ = s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0 + 5)
        _ = s.intentFinished(.coachRetry, boot: "b1", outcome: .failed(.page("exception")), at: t0 + 6)
        XCTAssertTrue(s.isLive("coach"))
        let fx = s.intentFinished(.coachBack, boot: "b1", outcome: .failed(.javascript("FPScreens is undefined")), at: t0 + 7)
        let trip = trips(fx).first
        XCTAssertEqual(trip?.reason, .failures)
        XCTAssertEqual(trip?.detail, "3 in a row: timeout, page exception, script error: FPScreens is undefined")
        XCTAssertEqual(fx, [.screenOff(screen: "coach", reason: .tripped(trip!)), .bookChanged])
        XCTAssertFalse(s.isLive("coach"))
        XCTAssertEqual(s.liveScreens, [])
        XCTAssertEqual(s.book.trip(screen: "coach", pageBuild: "P1"), trip)
        XCTAssertEqual(s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0 + 8), [], "off already")
    }

    func testRefusalsAndAnswersFromAGoneDocumentNeverCount() {
        var s = linked()
        for _ in 0 ..< 5 { XCTAssertEqual(s.intentFinished(send, boot: "b1", outcome: .refused("busy"), at: t0), []) }
        for _ in 0 ..< 5 { XCTAssertEqual(s.intentFinished(.confirm(id: "c", yes: true), boot: "b0", outcome: .failed(.timeout), at: t0), []) }
        XCTAssertNil(s.book.screens["coach"])
        // the shell's own intents count against every live screen
        _ = s.intentFinished(.confirm(id: "c", yes: true), boot: "b1", outcome: .failed(.timeout), at: t0)
        XCTAssertEqual(s.book.screens["coach"]?.failures, 1)
        // and a refusal is an answer: the bridge works
        XCTAssertEqual(s.intentFinished(.confirm(id: "c", yes: true), boot: "b1", outcome: .refused("stale"), at: t0), [.bookChanged])
        XCTAssertEqual(s.book.screens["coach"]?.failures, 0)
    }

    /// A screen the host withdrew, or one that tripped, takes no more counts: a switch never leaves a
    /// trip behind that outlives it.
    func testIntentsForAScreenThatIsOffNeverCount() {
        var s = linked()
        _ = s.withdraw(["coach"])
        for _ in 0 ..< 4 {
            XCTAssertEqual(s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0), [])
            XCTAssertEqual(s.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0), [])
            XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: nil, decoded: false, at: t0).verdict, .notLive)
        }
        XCTAssertEqual(s.book, BreakerBook())
    }

    func testModelsUndecodableCountStaleRevsDrop() {
        var s = linked()
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b1", decoded: true, at: t0).verdict, .apply)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b1", decoded: true, at: t0).verdict, .stale)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 0, boot: "b1", decoded: true, at: t0).verdict, .stale)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 2, boot: "b1", decoded: true, at: t0).verdict, .apply)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 9, boot: "b0", decoded: true, at: t0).verdict, .otherBoot)
        XCTAssertEqual(s.modelReceived(screen: "settings", rev: 1, boot: "b1", decoded: true, at: t0).verdict, .notLive)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 3, boot: nil, decoded: false, at: t0).effects, [.bookChanged])
        _ = s.modelReceived(screen: "coach", rev: 4, boot: nil, decoded: false, at: t0)
        let third = s.modelReceived(screen: "coach", rev: 5, boot: nil, decoded: false, at: t0)
        XCTAssertEqual(third.verdict, .undecodable)
        XCTAssertEqual(trips(third.effects).first?.detail, "3 in a row: undecodable model rev 3, undecodable model rev 4, undecodable model rev 5")
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 6, boot: "b1", decoded: true, at: t0).verdict, .notLive)
    }

    /// Intents and models each keep their own run: sends that keep failing trip the screen even while
    /// models still arrive, and models that never decode trip it even while intents work.
    func testEachKindKeepsItsOwnRun() {
        var s = linked()
        _ = s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0)
        _ = s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0)
        let model = s.modelReceived(screen: "coach", rev: 1, boot: "b1", decoded: true, at: t0)
        XCTAssertEqual(model.verdict, .apply)
        XCTAssertEqual(model.effects, [])
        XCTAssertEqual(s.book.screens["coach"]?.failures, 2, "a model is not an answer to a send")
        XCTAssertEqual(trips(s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0)).first?.detail, "3 in a row: timeout, timeout, timeout")

        var m = linked()
        _ = m.modelReceived(screen: "coach", rev: 1, boot: nil, decoded: false, at: t0)
        _ = m.modelReceived(screen: "coach", rev: 2, boot: nil, decoded: false, at: t0)
        XCTAssertEqual(m.intentFinished(.coachStop, boot: "b1", outcome: ok, at: t0), [])
        XCTAssertEqual(m.book.screens["coach"]?.modelFailures, 2)
        XCTAssertEqual(m.modelReceived(screen: "coach", rev: 3, boot: "b1", decoded: true, at: t0).effects, [.bookChanged], "a model that decodes restarts the models' run")
        XCTAssertEqual(m.book.screens["coach"]?.modelFailures, 0)
        _ = m.modelReceived(screen: "coach", rev: 4, boot: nil, decoded: false, at: t0)
        _ = m.modelReceived(screen: "coach", rev: 5, boot: nil, decoded: false, at: t0)
        _ = m.intentFinished(.coachStop, boot: "b1", outcome: ok, at: t0)
        XCTAssertEqual(trips(m.modelReceived(screen: "coach", rev: 6, boot: nil, decoded: false, at: t0).effects).count, 1)
        XCTAssertFalse(m.isLive("coach"))
    }

    /// A trip holds across launches for its page build (the host keeps the book), and a new page build
    /// starts every breaker clean, from the document start or from the hello.
    func testTripHoldsAcrossLaunchesAndANewPageBuildResetsIt() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        _ = s.tick(at: t0 + 15)
        let saved = s.book.encoded()

        var relaunch = LinkState(shell: shell, book: BreakerBook.decoded(saved))
        XCTAssertEqual(relaunch.documentStarted(pageBuild: "P1", at: t0 + 100), [], "the same page build: the trip stays")
        XCTAssertEqual(relaunch.hello(hello(), available: ["coach"], at: t0 + 101).reply.screens, [])

        var update = LinkState(shell: shell, book: BreakerBook.decoded(saved))
        XCTAssertEqual(update.documentStarted(pageBuild: "P2", at: t0 + 200), [.breakersReset(pageBuild: "P2"), .bookChanged])
        XCTAssertEqual(update.hello(hello("P2"), available: ["coach"], at: t0 + 201).reply.screens, ["coach"])
        XCTAssertTrue(update.isLive("coach"))

        var unknownAtStart = LinkState(shell: shell, book: BreakerBook.decoded(saved))
        XCTAssertEqual(unknownAtStart.documentStarted(pageBuild: nil, at: t0 + 300), [], "an unknown build clears nothing")
        let (reply, fx) = unknownAtStart.hello(hello("P2"), available: ["coach"], at: t0 + 301)
        XCTAssertEqual(fx.first, .breakersReset(pageBuild: "P2"))
        XCTAssertEqual(fx.last, .bookChanged)
        XCTAssertEqual(reply.screens, ["coach"])
        XCTAssertEqual(unknownAtStart.pageBuild, "P2")

        // the failure counts reset with the build too, of either kind
        var counting = linked()
        _ = counting.intentFinished(.coachStop, boot: "b1", outcome: .failed(.timeout), at: t0)
        _ = counting.modelReceived(screen: "coach", rev: 1, boot: nil, decoded: false, at: t0)
        var next = LinkState(shell: shell, book: counting.book)
        XCTAssertEqual(next.documentStarted(pageBuild: "P3", at: t0), [.breakersReset(pageBuild: "P3"), .bookChanged])
        XCTAssertNil(next.book.screens["coach"])

        // a record with nothing in it goes quietly
        var clean = linked()
        _ = clean.intentFinished(.coachStop, boot: "b1", outcome: .failed(.timeout), at: t0)
        _ = clean.intentFinished(.coachStop, boot: "b1", outcome: ok, at: t0)
        XCTAssertNotNil(clean.book.screens["coach"])
        XCTAssertEqual(clean.documentStarted(pageBuild: "P4", at: t0), [.documentGone(boot: "b1"), .bookChanged])
        XCTAssertNil(clean.book.screens["coach"])
    }

    // MARK: Documents, boots, switches

    /// Nothing is resent: when a document goes, its pending intents fail and its confirms close as stale.
    func testDocumentGoneOnReloadAndOnANewBoot() {
        var s = linked()
        XCTAssertEqual(s.documentStarted(pageBuild: "P1", at: t0 + 10), [.documentGone(boot: "b1")])
        XCTAssertEqual(s.phase, .awaitingHello)
        XCTAssertFalse(s.isLive("coach"))
        _ = s.hello(hello(boot: "b2"), available: ["coach"], at: t0 + 11)
        XCTAssertEqual(s.intentFinished(.coachStop, boot: "b1", outcome: .failed(.timeout), at: t0 + 12), [], "the old document's answer")
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 99, boot: "b1", decoded: true, at: t0 + 12).verdict, .otherBoot)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b2", decoded: true, at: t0 + 12).verdict, .apply, "revs start again per boot")
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 7, boot: "b2", decoded: true, at: t0 + 12).verdict, .apply)
        // a new boot that came without a document start seen: a new document all the same
        let (_, fx) = s.hello(hello(boot: "b3"), available: ["coach"], at: t0 + 20)
        XCTAssertEqual(fx, [.documentGone(boot: "b2"), .linked(LinkState.Link(boot: "b3", bootFromPage: true, v: 1, page: "P1", screens: ["coach"]))])
        XCTAssertEqual(s.link?.boot, "b3")
        XCTAssertEqual(s.documents, 3)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b3", decoded: true, at: t0 + 21).verdict, .apply)
        // the same boot again is a resync, not a new document
        XCTAssertEqual(s.hello(hello(boot: "b3"), available: ["coach"], at: t0 + 22).effects.count, 1)
        XCTAssertEqual(s.documents, 3)
        XCTAssertEqual(s.modelReceived(screen: "coach", rev: 1, boot: "b3", decoded: true, at: t0 + 23).verdict, .stale)
    }

    func testWithdrawIsImmediateAndLastsForTheDocument() {
        var s = linked()
        XCTAssertEqual(s.withdraw(["coach"]), [.screenOff(screen: "coach", reason: .withdrawn)])
        XCTAssertFalse(s.isLive("coach"))
        XCTAssertEqual(s.withdraw(["coach"]), [])
        XCTAssertEqual(s.book, BreakerBook(), "a switch is not a fault")
        XCTAssertEqual(s.hello(hello(), available: ["coach"], at: t0 + 2).reply.screens, [], "not back within the document")
        _ = s.documentStarted(pageBuild: "P1", at: t0 + 10)
        XCTAssertEqual(s.hello(hello(boot: "b2"), available: ["coach"], at: t0 + 11).reply.screens, ["coach"])
        XCTAssertTrue(s.isLive("coach"))
        // withdrawing before the hello: the screen does not link in this document
        var early = LinkState(shell: shell)
        _ = early.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(early.withdraw(["coach"]), [], "nothing was live")
        XCTAssertEqual(early.hello(hello(), available: ["coach"], at: t0 + 1).reply.screens, [])
    }

    /// The page was told screens.off: the screen stays off for the document even when the book changes
    /// under it, and comes back at the next hello the book allows.
    func testAScreenOffStaysOffForTheDocument() {
        var s = linked()
        for _ in 0 ..< 3 { _ = s.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0) }
        XCTAssertFalse(s.isLive("coach"))
        XCTAssertEqual(s.editBook { $0.screens["coach"] = nil }, [.bookChanged])
        XCTAssertFalse(s.isLive("coach"))
        XCTAssertEqual(s.hello(hello(), available: ["coach"], at: t0 + 2).reply.screens, [])
        _ = s.documentStarted(pageBuild: "P1", at: t0 + 10)
        XCTAssertEqual(s.hello(hello(boot: "b2"), available: ["coach"], at: t0 + 11).reply.screens, ["coach"])
    }

    /// The store breaker and crash markers change the same book, through the link.
    func testEditBookCarriesTheStoreBreakerAndCrashMarkers() {
        var s = LinkState(shell: shell)
        XCTAssertEqual(s.editBook { _ = $0.store.launch(at: self.t0) }, [], "nothing armed, nothing changed")
        XCTAssertEqual(s.editBook { $0.store.documentStart(pageBuild: "P1", at: self.t0) }, [.bookChanged])
        XCTAssertNotNil(s.book.store.armed)
        XCTAssertEqual(s.editBook { $0.store.bootDone() }, [.bookChanged])
        XCTAssertNil(s.book.store.armed)
        let marker = CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60")
        XCTAssertEqual(s.editBook { $0.recordStaleMarkers([marker], at: self.t0) }, [.bookChanged])
        let gate = ScreenGate.evaluate(binary: shell.screens, deviceOff: [], policy: .defaults, book: s.book, shellBuild: shell.shell, pageBuild: "P1")
        XCTAssertEqual(gate.on, [])
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(s.hello(hello(), available: gate.on, at: t0 + 1).reply.screens, [])
        XCTAssertEqual(s.book.disabled.count, 1, "a crash verdict is not a page build's breaker record")
        _ = s.documentStarted(pageBuild: "P2", at: t0 + 10)
        XCTAssertEqual(s.book.disabled.count, 1, "and a new build leaves it alone: it names its own pair")
        // a crash verdict against a live screen waits for the next hello
        var live = linked()
        let other = CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60")
        XCTAssertEqual(live.editBook { $0.recordStaleMarkers([other], at: self.t0) }, [.bookChanged])
        XCTAssertTrue(live.isLive("coach"))
        // a trip for the page build being served turns the live screen off at once
        let fx = live.editBook { _ = $0.trip(screen: "coach", pageBuild: "P1", reason: .failures, detail: "set by hand", at: self.t0) }
        XCTAssertEqual(trips(fx).map(\.detail), ["set by hand"])
        XCTAssertEqual(fx.last, .bookChanged)
        XCTAssertFalse(live.isLive("coach"))
        // and one for another build changes nothing here
        var elsewhere = linked()
        XCTAssertEqual(elsewhere.editBook { _ = $0.trip(screen: "coach", pageBuild: "P0", reason: .failures, detail: "old", at: self.t0) }, [.bookChanged])
        XCTAssertTrue(elsewhere.isLive("coach"))
    }

    func testAvailableScreensComeFromTheGate() {
        var s = LinkState(shell: shell)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        let gate = ScreenGate.evaluate(binary: shell.screens, deviceOff: [], policy: Policy(screens: ["coach": .off]),
                                       book: s.book, shellBuild: shell.shell, pageBuild: "P1")
        XCTAssertEqual(s.hello(hello(), available: gate.on, at: t0 + 1).reply.screens, [])
        XCTAssertFalse(s.isLive("coach"))
    }

    /// What screens.off tells the page.
    func testScreenOffReasonCodes() {
        let noHello = ScreenOffReason.tripped(Trip(reason: .noHello, at: t0, detail: "no hello within 15 s"))
        let failures = ScreenOffReason.tripped(Trip(reason: .failures, at: t0, detail: "3 in a row: timeout, timeout, timeout"))
        XCTAssertEqual([noHello.code, failures.code, ScreenOffReason.withdrawn.code], ["no-hello", "failures", "withdrawn"])
        XCTAssertEqual(Intent.screensOff(screen: "coach", why: ScreenOffReason.withdrawn.code).arguments, ["screen": "coach", "why": "withdrawn"])
        XCTAssertEqual(ScreenOffReason.needs(["coachHome"]).code, "needs", "build 61: a piece it needs went off (contract 4.2)")
    }

    // MARK: Build 61: pieces that depend on each other (contract 2.2, 3.2, 10.3, I12)

    private let shell61 = ShellContract(shell: "61")
    private let all = ShellContract.binaryScreens
    private let select = Intent.tabsSelect(tab: "progress", seq: 1, again: nil)

    /// A document of build 61 linked under the root by a hello naming all three, with `base` passing its own checks.
    private func linked61(base: [String] = ShellContract.binaryScreens, tabsRoot: Bool = true) -> LinkState {
        var s = LinkState(shell: shell61)
        _ = s.setTabsRoot(tabsRoot)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        _ = s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b1"), available: base, at: t0 + 1)
        return s
    }

    private func offs(_ fx: [LinkEffect]) -> [NegotiationTable.Off] { fx.compactMap(NegotiationTable.Off.init) }

    private func fellBack(_ fx: [LinkEffect]) -> [FellBackWhy] {
        fx.compactMap { if case .fellBack(let w) = $0 { return w } else { return nil } }
    }

    private func tripped(_ s: LinkState) -> [String] { all.filter { s.book.trip(screen: $0, pageBuild: "P1") != nil } }

    /// Every hello row of negotiation.json through the link: the reply, the declines in the book, the fallback's effect
    /// and the rule after it, and the gate's `needs` on the link's book; under a live tab root coach and coachHome are
    /// both live or both off (I12), and a fallback at a hello turns nothing off (nothing was live yet).
    func testEveryHelloRowThroughTheLink() throws {
        for row in try NegotiationTable.rows("hello") {
            let tag = row["case"]?.string ?? "?"
            let base = NegotiationTable.strings(row["base"])
            let os = try XCTUnwrap(row["os"]?.int, tag)
            let root = try XCTUnwrap(row["root"]?.string, tag)
            let want = try XCTUnwrap(row["want"], tag)
            var s = LinkState(shell: shell61)
            _ = s.setTabsRoot(root == "tabs")
            _ = s.documentStarted(pageBuild: "P1", at: t0)
            let deviceOff = Set(all).subtracting(base)
            let gate = ScreenGate.base(binary: all, deviceOff: deviceOff, policy: .defaults, book: s.book, shellBuild: "61", pageBuild: "P1", os: os)
            let hello = HelloRequest(v: try XCTUnwrap(row["hello"]?["v"]?.int, tag), page: "P1",
                                     screens: NegotiationTable.strings(row["hello"]?["screens"]), boot: "b1")
            let (reply, fx) = s.hello(hello, available: gate.on, at: t0 + 1)
            XCTAssertEqual(reply.v, want["v"]?.int, "\(tag): v")
            XCTAssertEqual(reply.why, want["why"]?.string, "\(tag): why")
            XCTAssertEqual(reply.screens, NegotiationTable.strings(want["screens"]), "\(tag): screens")
            XCTAssertEqual(s.liveScreens, reply.screens, "\(tag): live")
            XCTAssertEqual(all.filter { s.book.declined(piece: $0, page: "P1") }, NegotiationTable.strings(want["declined"]), "\(tag): declined")
            XCTAssertEqual(fellBack(fx).map(\.rawValue), want["fellBack"]?.string.map { [$0] } ?? [], "\(tag): fellBack")
            XCTAssertEqual(s.tabsRoot, root == "tabs" && want["fellBack"]?.string == nil, "\(tag): the rule after the hello")
            XCTAssertEqual(offs(fx), [], "\(tag): nothing was live")
            if !NegotiationTable.strings(want["declined"]).isEmpty { XCTAssertEqual(fx.last, .bookChanged, "\(tag): the declines are kept") }
            if s.tabsRoot { XCTAssertEqual(s.isLive("coach"), s.isLive("coachHome"), "\(tag): joint (I12)") }
            let after = ScreenGate.evaluate(binary: all, deviceOff: deviceOff, policy: .defaults, book: s.book, shellBuild: "61", pageBuild: "P1",
                                            tabsRoot: s.tabsRoot, os: os)
            XCTAssertEqual(NegotiationTable.needs(of: after.off), NegotiationTable.needs(want["needs"]), "\(tag): needs")
        }
    }

    /// Every cascade row of negotiation.json: the pieces that go off with the event, in the order the page hears it,
    /// which of them carry a breaker record (a cascade never does), and the fallback the link starts.
    func testEveryCascadeRow() throws {
        for row in try NegotiationTable.rows("cascade") {
            let tag = row["case"]?.string ?? "?"
            let root = try XCTUnwrap(row["root"]?.string, tag)
            let live = NegotiationTable.strings(row["live"])
            let event = try XCTUnwrap(row["event"], tag)
            let want = try XCTUnwrap(row["want"], tag)
            var s = linked61(base: live, tabsRoot: root == "tabs")
            XCTAssertEqual(s.liveScreens, live, "\(tag): set up")
            var fx: [LinkEffect] = []
            if let piece = event["trip"]?.string {
                // three failures in a row of the piece's own intents (errors: counted at once)
                let own: Intent = piece == "tabs" ? select : piece == "coachHome" ? .coachHomeOpenChat : .coachStop
                XCTAssertEqual(own.screen, piece, tag)
                for i in 0 ..< 3 { fx += s.intentFinished(own, boot: "b1", outcome: .failed(.page("exception")), at: t0 + 2 + Double(i)) }
            } else if event["tripShell"]?.bool == true {
                for i in 0 ..< 3 { fx += s.intentFinished(.toastUndo(id: "t"), boot: "b1", outcome: .failed(.javascript("x")), at: t0 + 2 + Double(i)) }
            } else if let piece = event["withdraw"]?.string {
                fx = s.withdraw([piece])
            } else {
                XCTFail("\(tag): an event this test does not know: \(event)")
            }
            let gone = NegotiationTable.offs(want["off"])
            XCTAssertEqual(offs(fx), gone, "\(tag): off")
            XCTAssertEqual(tripped(s), NegotiationTable.strings(want["trips"]), "\(tag): trips")
            XCTAssertEqual(fellBack(fx).map(\.rawValue), want["fellBack"]?.string.map { [$0] } ?? [], "\(tag): fellBack")
            XCTAssertEqual(s.tabsRoot, root == "tabs" && want["fellBack"]?.string == nil, "\(tag): the rule after")
            for o in gone where o.why == "needs" { XCTAssertNil(s.book.trip(screen: o.screen, pageBuild: "P1"), "\(tag): \(o.screen) has no trip") }
            XCTAssertEqual(s.liveScreens, live.filter { p in !gone.contains { $0.screen == p } }, "\(tag): the rest stays live")
            // what went off stays off for the document, even for a second hello of it
            let again = s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b1"), available: live, at: t0 + 9).reply.screens
            XCTAssertEqual(again, live.filter { p in !gone.contains { $0.screen == p } }, "\(tag): not back within the document")
        }
    }

    /// Every root-change row of negotiation.json: the host's own fallback (`dismiss tabs`, the policy, the switch) turns
    /// off every piece negotiated under the tab root's rule, coach included, with `needs` (tabs silently, the host's to
    /// tell); before a link it changes only the rule; later documents negotiate on the classic rule.
    func testEveryRootChangeRow() throws {
        for row in try NegotiationTable.rows("rootChange") {
            let tag = row["case"]?.string ?? "?"
            let root = try XCTUnwrap(row["root"]?.string, tag)
            let base = NegotiationTable.strings(row["base"])
            let want = try XCTUnwrap(row["want"], tag)
            var s = LinkState(shell: shell61)
            _ = s.setTabsRoot(root == "tabs")
            _ = s.documentStarted(pageBuild: "P1", at: t0)
            let hello = HelloRequest(v: 1, page: "P1", screens: all, boot: "b1")
            if row["linked"]?.bool == true { _ = s.hello(hello, available: base, at: t0 + 1) }
            XCTAssertEqual(s.liveScreens, NegotiationTable.strings(row["live"]), "\(tag): set up")
            let before = s.book
            let fx = s.setTabsRoot(false)
            XCTAssertEqual(offs(fx), NegotiationTable.offs(want["off"]), "\(tag): off")
            XCTAssertEqual(fellBack(fx), [], "\(tag): the host's fallback: no fellBack from the link")
            XCTAssertFalse(s.tabsRoot, tag)
            XCTAssertEqual(s.book, before, "\(tag): a root change writes no record")
            if root == "tabs" { XCTAssertEqual(s.liveScreens, [], "\(tag): tabs went too, silently") }
            let same = s.hello(hello, available: base, at: t0 + 2).reply.screens
            XCTAssertEqual(same, NegotiationTable.strings(want["sameDocument"]), "\(tag): same document")
            _ = s.documentStarted(pageBuild: "P1", at: t0 + 10)
            let next = s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b2"), available: base, at: t0 + 11).reply.screens
            XCTAssertEqual(next, NegotiationTable.strings(want["nextDocument"]), "\(tag): next document")
        }
    }

    func testTheTabRootIsTheHostsToAdopt() {
        // false at init; a binary without tabs never has one
        var sixty = LinkState(shell: shell)
        XCTAssertFalse(sixty.tabsRoot)
        XCTAssertEqual(sixty.setTabsRoot(true), [])
        XCTAssertFalse(sixty.tabsRoot, "build 60's binary has no tab root")
        var s = LinkState(shell: shell61)
        XCTAssertFalse(s.tabsRoot)
        XCTAssertEqual(s.setTabsRoot(true), [])
        XCTAssertTrue(s.tabsRoot)
        XCTAssertEqual(s.setTabsRoot(true), [])
        XCTAssertEqual(s.setTabsRoot(false), [], "before a link only the rule changes")
        XCTAssertFalse(s.tabsRoot)
        XCTAssertEqual(s.setTabsRoot(false), [], "once")
        // the rule follows the root: classic from now on, for every later document of the scene
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        XCTAssertEqual(s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b1"), available: all, at: t0 + 1).reply.screens, ["coach"])
    }

    /// Three failed `tabs.select` trip `tabs` and nothing else: coach and coachHome go off with `needs` and no record of
    /// their own, the page hears them before the bar, and the root falls back; the next document is classic.
    func testThreeFailedTabsSelectTripTheBarAlone() throws {
        var s = linked61()
        var fx: [LinkEffect] = []
        for i in 0 ..< 3 { fx = s.intentFinished(select, boot: "b1", outcome: .failed(.page("exception")), at: t0 + 2 + Double(i)) }
        let trip = try XCTUnwrap(s.book.trip(screen: "tabs", pageBuild: "P1"))
        XCTAssertEqual(trip.detail, "3 in a row: page exception, page exception, page exception")
        XCTAssertEqual(fx, [.screenOff(screen: "coach", reason: .needs(["coachHome"])), .screenOff(screen: "coachHome", reason: .needs(["tabs"])),
                            .screenOff(screen: "tabs", reason: .tripped(trip)), .fellBack(.failures), .bookChanged])
        XCTAssertNil(s.book.screens["coach"], "a cascade writes no record")
        XCTAssertNil(s.book.screens["coachHome"])
        XCTAssertEqual(s.liveScreens, [])
        XCTAssertFalse(s.tabsRoot)
        XCTAssertEqual(s.intentFinished(.coachStop, boot: "b1", outcome: .failed(.timeout), at: t0 + 6), [], "off for the document: nothing counts")
        // the next document: tabs tripped for the page build, the classic rule: 60's overlay chat
        _ = s.documentStarted(pageBuild: "P1", at: t0 + 10)
        let gate = ScreenGate.base(binary: all, deviceOff: [], policy: .defaults, book: s.book, shellBuild: "61", pageBuild: "P1")
        XCTAssertEqual(gate.on, ["coach", "coachHome"])
        XCTAssertEqual(s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b2"), available: gate.on, at: t0 + 11).reply.screens, ["coach"])
    }

    /// Three failed `shell.covered` count against every live piece, `tabs` included (D13): all three trip.
    func testThreeFailedShellCoveredTripEveryLivePiece() {
        var s = linked61()
        var fx: [LinkEffect] = []
        for i in 0 ..< 3 { fx = s.intentFinished(.shellCovered(on: true), boot: "b1", outcome: .failed(.javascript("x")), at: t0 + 2 + Double(i)) }
        XCTAssertEqual(tripped(s), all)
        XCTAssertEqual(offs(fx).map(\.description), ["coach failures", "coachHome failures", "tabs failures"])
        XCTAssertEqual(fellBack(fx), [.failures])
    }

    /// No hello in time under a live tab root: every piece trips (no hello) and the root falls back, at a tick or at a
    /// late hello, once.
    func testNoHelloUnderATabRootFallsBack() {
        var s = LinkState(shell: shell61)
        _ = s.setTabsRoot(true)
        _ = s.documentStarted(pageBuild: "P1", at: t0)
        let fx = s.tick(at: t0 + 15)
        XCTAssertEqual(trips(fx).map(\.reason), [.noHello, .noHello, .noHello])
        XCTAssertEqual(offs(fx).map(\.screen), all)
        XCTAssertEqual(fx.suffix(2), [.fellBack(.noHello), .bookChanged])
        XCTAssertFalse(s.tabsRoot)
        XCTAssertEqual(s.tick(at: t0 + 30), [], "once")
        var late = LinkState(shell: shell61)
        _ = late.setTabsRoot(true)
        _ = late.documentStarted(pageBuild: "P1", at: t0)
        let (reply, lfx) = late.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b1"), available: all, at: t0 + 16)
        XCTAssertEqual(reply.screens, [])
        XCTAssertEqual(fellBack(lfx), [.noHello], "one fallback, with no hello's word")
        XCTAssertFalse(late.tabsRoot)
    }

    /// Three undecodable TabsModels trip the bar (contract 10.1), and a trip put in the book does the same.
    func testUndecodableTabsModelsAndABookTripFallBack() throws {
        var s = linked61()
        var r: (verdict: ModelVerdict, effects: [LinkEffect]) = (.apply, [])
        for rev in 1 ... 3 { r = s.modelReceived(screen: "tabs", rev: rev, boot: nil, decoded: false, at: t0 + 2) }
        XCTAssertEqual(r.verdict, .undecodable)
        XCTAssertEqual(s.book.trip(screen: "tabs", pageBuild: "P1")?.detail,
                       "3 in a row: undecodable model rev 1, undecodable model rev 2, undecodable model rev 3")
        XCTAssertEqual(offs(r.effects).map(\.description), ["coach needs [\"coachHome\"]", "coachHome needs [\"tabs\"]", "tabs failures"])
        XCTAssertEqual(fellBack(r.effects), [.failures])
        var e = linked61()
        let fx = e.editBook { _ = $0.trip(screen: "tabs", pageBuild: "P1", reason: .failures, detail: "set by hand", at: self.t0) }
        XCTAssertEqual(offs(fx).map(\.screen), all)
        XCTAssertEqual(fx.suffix(2), [.fellBack(.failures), .bookChanged])
        // a crash verdict or a decline put in the book waits for the next hello (ScreenGate reads them)
        var d = linked61()
        XCTAssertEqual(d.editBook { $0.decline(piece: "tabs", page: "P1") }, [.bookChanged])
        XCTAssertEqual(d.liveScreens, all)
        XCTAssertTrue(d.tabsRoot)
    }

    /// `withdraw` of tabs (the host calls setTabsRoot(false) for its fallbacks): the pieces that need it follow; the
    /// link starts no fallback of its own, since it cannot tell the host's word.
    func testWithdrawingTheBarTakesItsDependentsButStartsNoFallback() {
        var s = linked61()
        let fx = s.withdraw(["tabs"])
        XCTAssertEqual(offs(fx).map(\.description), ["coach needs [\"coachHome\"]", "coachHome needs [\"tabs\"]", "tabs withdrawn"])
        XCTAssertEqual(fellBack(fx), [])
        XCTAssertTrue(s.tabsRoot)
        XCTAssertEqual(s.book, BreakerBook())
    }

    // MARK: Build 61: held timeouts (contract 4.4, D41, I15)

    /// A busy page: three taps' `tabs.select` and a `shell.covered` time out while it is stalled. They are held, one ping
    /// is asked for, and the first answer drops them uncounted (a busy page, not a broken one).
    func testABusyPagesTimeoutsAreHeldAndAnAnswerDropsThem() {
        var s = linked61()
        XCTAssertEqual(s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 2), [.pingWhenIdle])
        XCTAssertEqual(s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 4), [], "asked once")
        XCTAssertEqual(s.intentFinished(.tabsBar(BarMetrics(h: 83, safe: 34, rev: 1)), boot: "b1", outcome: .failed(.timeout), at: t0 + 5), [])
        XCTAssertEqual(s.intentFinished(.shellCovered(on: true), boot: "b1", outcome: .failed(.timeout), at: t0 + 6), [])
        XCTAssertEqual(s.heldTimeouts, 4)
        XCTAssertEqual(s.book, BreakerBook(), "nothing counted yet")
        XCTAssertEqual(s.liveScreens, all)
        // the page is free at 6.5 s: the ping's answer drops every hold uncounted and counts as the success it is
        XCTAssertEqual(s.intentFinished(.ping, boot: "b1", outcome: ok, at: t0 + 6.5), [])
        XCTAssertEqual(s.heldTimeouts, 0)
        XCTAssertEqual(s.book, BreakerBook())
        // a later stall asks again; any queued intent's answer drops it too, a refusal included
        XCTAssertEqual(s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 10), [.pingWhenIdle])
        XCTAssertEqual(s.intentFinished(.coachHomeClearChat, boot: "b1", outcome: .refused("empty"), at: t0 + 11), [])
        XCTAssertEqual(s.heldTimeouts, 0)
        // the ping asked for still comes back: a hold meanwhile waits for it, with no second ask
        XCTAssertEqual(s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 12), [])
        XCTAssertEqual(s.intentFinished(.ping, boot: "b1", outcome: ok, at: t0 + 13), [])
        XCTAssertEqual(s.heldTimeouts, 0)
        XCTAssertEqual(s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 15), [.pingWhenIdle], "asked again after the ping came back")
        // an answer resets a run counted earlier, as before
        _ = s.intentFinished(select, boot: "b1", outcome: .failed(.page("exception")), at: t0 + 16)
        XCTAssertEqual(s.book.screens["tabs"]?.failures, 1)
        XCTAssertEqual(s.intentFinished(select, boot: "b1", outcome: ok, at: t0 + 17), [.bookChanged])
        XCTAssertEqual(s.book.screens["tabs"]?.failures, 0)
    }

    /// A page that stopped answering still trips: the ping's failure counts every held timeout, then itself, against
    /// every live piece (two holds and a failed ping trip the bar); one hold and a failed ping twice do too (about 8 s
    /// for a tap and its restate).
    func testThePingsFailureCountsTheHoldsThenItself() throws {
        var s = linked61()
        _ = s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 2)
        _ = s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 4)
        let fx = s.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + 6)
        let trip = try XCTUnwrap(s.book.trip(screen: "tabs", pageBuild: "P1"))
        XCTAssertEqual(trip.detail, "3 in a row: timeout, timeout, timeout")
        XCTAssertEqual(trip.at, t0 + 6)
        XCTAssertEqual(offs(fx).map(\.description), ["coach needs [\"coachHome\"]", "coachHome needs [\"tabs\"]", "tabs failures"])
        XCTAssertEqual(fx.suffix(2), [.fellBack(.failures), .bookChanged])
        XCTAssertEqual(s.book.screens["coach"]?.failures, 1, "the ping counted for coach before the bar took it along")
        XCTAssertNil(s.book.trip(screen: "coach", pageBuild: "P1"))
        XCTAssertEqual(s.heldTimeouts, 0)
        // a tap, then its restate, into a dead page
        var d = linked61()
        XCTAssertEqual(d.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 2), [.pingWhenIdle])
        XCTAssertEqual(d.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + 4), [.bookChanged])
        XCTAssertEqual(d.book.screens["tabs"]?.failures, 2)
        XCTAssertEqual(d.book.screens["coach"]?.failures, 1)
        XCTAssertEqual(d.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 6), [.pingWhenIdle], "the restate's own hold")
        let dead = d.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + 8)
        XCTAssertEqual(fellBack(dead), [.failures])
        XCTAssertEqual(tripped(d), ["tabs"], "the bar trips first; the others go with it")
    }

    /// A held `shell.covered` counts against every live piece, `tabs` included, when the ping fails.
    func testAHeldShellCoveredCountsForEveryLivePiece() {
        var s = linked61()
        XCTAssertEqual(s.intentFinished(.shellCovered(on: true), boot: "b1", outcome: .failed(.timeout), at: t0 + 2), [.pingWhenIdle])
        _ = s.intentFinished(.ping, boot: "b1", outcome: .failed(.javascript("stalled")), at: t0 + 4)
        for p in all {
            XCTAssertEqual(s.book.screens[p]?.failures, 2, p)
            XCTAssertEqual(s.book.screens[p]?.recent, ["timeout", "script error: stalled"], p)
        }
        // under a classic root, build 60's overlay: held for coach
        var c = linked61(base: ["coach"], tabsRoot: false)
        XCTAssertEqual(c.liveScreens, ["coach"])
        XCTAssertEqual(c.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 2), [], "tabs is not live: nothing to hold")
        XCTAssertEqual(c.heldTimeouts, 0)
        XCTAssertEqual(c.intentFinished(.shellCovered(on: false), boot: "b1", outcome: .failed(.timeout), at: t0 + 3), [.pingWhenIdle])
        XCTAssertEqual(c.book, BreakerBook())
    }

    /// Inside a stall every other failure counts as before: a thrown error, a malformed answer and `bad-args` at once;
    /// a timeout of `coach.*`, of the snapshots and of the ping itself at once (build 60's breaker scenario trips on
    /// three timed-out pings).
    func testEverythingElseCountsAtOnce() throws {
        var s = linked61()
        _ = s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 2)
        _ = s.intentFinished(select, boot: "b1", outcome: .failed(.javascript("x")), at: t0 + 3)
        _ = s.intentFinished(.tabsBar(BarMetrics(h: 83, safe: 34, rev: 2)), boot: "b1", outcome: .failed(.malformedReply("no ok")), at: t0 + 3.5)
        XCTAssertEqual(s.book.screens["tabs"]?.failures, 2)
        XCTAssertEqual(s.heldTimeouts, 1, "the hold still waits for an answer or the ping")
        let fx = s.intentFinished(select, boot: "b1", outcome: .failed(.page("bad-args")), at: t0 + 4)
        XCTAssertEqual(s.book.trip(screen: "tabs", pageBuild: "P1")?.detail, "3 in a row: script error: x, bad answer: no ok, page bad-args")
        XCTAssertEqual(fellBack(fx), [.failures])
        XCTAssertEqual(s.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + 6), [], "nothing live is left to count for")
        // coach.* keeps build 60's rule: three timeouts in a row trip coach (and the Coach tab goes with it)
        var c = linked61()
        var cfx: [LinkEffect] = []
        for i in 0 ..< 3 { cfx = c.intentFinished(send, boot: "b1", outcome: .failed(.timeout), at: t0 + Double(i)) }
        XCTAssertEqual(c.book.trip(screen: "coach", pageBuild: "P1")?.detail, "3 in a row: timeout, timeout, timeout")
        XCTAssertEqual(offs(cfx).map(\.description), ["coach failures", "coachHome needs [\"coach\"]"])
        XCTAssertFalse(cfx.contains(.pingWhenIdle))
        XCTAssertEqual(c.heldTimeouts, 0)
        var snap = linked61()
        for i in 0 ..< 3 { _ = snap.intentFinished(.coachHomeSnapshot, boot: "b1", outcome: .failed(.timeout), at: t0 + Double(i)) }
        XCTAssertNotNil(snap.book.trip(screen: "coachHome", pageBuild: "P1"))
        // three timed-out pings trip every live piece
        var p = linked61()
        var pfx: [LinkEffect] = []
        for i in 0 ..< 3 { pfx = p.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + Double(i)) }
        XCTAssertEqual(tripped(p), all)
        XCTAssertEqual(fellBack(pfx), [.failures])
        var sixty = linked()
        for i in 0 ..< 3 { _ = sixty.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + Double(i)) }
        XCTAssertEqual(sixty.book.trip(screen: "coach", pageBuild: "P1")?.detail, "3 in a row: timeout, timeout, timeout", "build 60's scenario")
    }

    /// Holds belong to their boot: a document start drops them uncounted, and the gone document's ping counts nothing.
    func testADocumentStartDropsTheHolds() {
        var s = linked61()
        _ = s.intentFinished(select, boot: "b1", outcome: .failed(.timeout), at: t0 + 2)
        _ = s.intentFinished(.shellCovered(on: true), boot: "b1", outcome: .failed(.timeout), at: t0 + 4)
        XCTAssertEqual(s.documentStarted(pageBuild: "P1", at: t0 + 5), [.documentGone(boot: "b1")])
        XCTAssertEqual(s.heldTimeouts, 0)
        XCTAssertEqual(s.intentFinished(.ping, boot: "b1", outcome: .failed(.timeout), at: t0 + 6), [], "the gone document's ping")
        XCTAssertEqual(s.book, BreakerBook())
        XCTAssertTrue(s.tabsRoot, "a document start changes no root")
        _ = s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b2"), available: all, at: t0 + 7)
        XCTAssertEqual(s.liveScreens, all)
        XCTAssertEqual(s.intentFinished(select, boot: "b2", outcome: .failed(.timeout), at: t0 + 9), [.pingWhenIdle], "the new document asks for its own")
        // a hello from a new boot with no document start seen drops them too
        _ = s.hello(HelloRequest(v: 1, page: "P1", screens: all, boot: "b3"), available: all, at: t0 + 10)
        XCTAssertEqual(s.heldTimeouts, 0)
    }
}

extension NegotiationTable.Off {
    /// A `screenOff` effect as a row of the table.
    init?(_ effect: LinkEffect) {
        guard case .screenOff(let s, let r) = effect else { return nil }
        if case .needs(let n) = r { self.init(screen: s, why: r.code, needs: n) } else { self.init(screen: s, why: r.code) }
    }
}
