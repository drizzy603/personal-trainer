import Foundation
import XCTest
import FPCore

/// The link state machine (C4 acceptance): the 15 s hello deadline, the 3-failure breaker, and the reset
/// on a new page build.
final class LinkStateTests: XCTestCase {
    private let shell = ShellContract(shell: "60")
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
    }
}
