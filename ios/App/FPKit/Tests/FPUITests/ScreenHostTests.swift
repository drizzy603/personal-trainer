#if os(iOS)
import Foundation
import SwiftUI
import UIKit
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// Stands in for UIKit's presentation in a test host with no window scene (where UIKit never finishes a presentation):
/// it records what goes up and finishes on the next turn of the main queue, as UIKit does.
@MainActor
final class StandInPresenting: ScreenPresenting {
    private(set) var shown: [UIViewController] = []
    private(set) var log: [String] = []

    func present(_ screen: UIViewController, from presenter: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        log.append("present style \(screen.modalPresentationStyle.rawValue) over \(type(of: presenter))")
        shown.append(screen)
        DispatchQueue.main.async { completion() }
    }

    func dismiss(_ screen: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        log.append("dismiss")
        shown.removeAll { $0 === screen }
        DispatchQueue.main.async { completion() }
    }
}

/// Stands in for UIKit refusing a presentation without a word (another controller's delayed presentation under way): the
/// completion never comes and no controller presents the screen.
@MainActor
final class SilentPresenting: ScreenPresenting {
    func present(_ screen: UIViewController, from presenter: UIViewController, animated: Bool, completion: @escaping () -> Void) {}

    func dismiss(_ screen: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        DispatchQueue.main.async { completion() }
    }
}

/// ScreenHost (plan task C5) over a web view standing in for the page: only `.overFullScreen` (the web view stays in
/// its window), one transition at a time with a dismissal that cancels a present not yet started, the owner's back
/// latched, the web view hidden from VoiceOver while covered, the room's appearance whatever the phone's, the crash
/// marker only while a screen is up, and the toast strip sized to the toast it shows. UIKit's slide and edge pan run in
/// the app (tests/native-shell.sh), and here only where the host has a window scene.
@MainActor
final class ScreenHostTests: XCTestCase {
    private var window: UIWindow!
    private var root: UIViewController!
    private var webView: WKWebView!
    private var host: ScreenHost!
    private var stand: StandInPresenting!
    private var folder: URL!
    private var sent: [Intent] = []
    private var asked: [Intent] = []
    private var answers: [(PageLink.Outcome) -> Void] = []
    private var covered: [Bool] = []
    private var owner: [String] = []

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("fpshell-\(UUID().uuidString)", isDirectory: true)
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        root = UIViewController()
        root.view = webView   // the page is the presenter's view, as in Capacitor's controller
        window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first { window.windowScene = scene }
        window.rootViewController = root
        window.makeKeyAndVisible()
        host = ScreenHost(presenter: root, webView: webView, shellBuild: "60", pageBuild: "P1", markerFolder: folder,
                          coach: CoachStore(draft: CoachComposerDraft(defaults: nil)))
        stand = StandInPresenting()
        host.presenting = stand
        host.isActive = { true }   // the app in use (a test host's own state varies)
        var hooks = ScreenHost.Hooks()
        hooks.send = { [weak self] in self?.sent.append($0) }
        hooks.ask = { [weak self] intent, done in
            self?.asked.append(intent)
            self?.answers.append(done)
        }
        hooks.willCover = { [weak self] in self?.covered.append(true) }
        hooks.didUncover = { [weak self] in self?.covered.append(false) }
        hooks.userDismissed = { [weak self] in self?.owner.append($0) }
        host.hooks = hooks
        sent = []
        asked = []
        answers = []
        covered = []
        owner = []
    }

    override func tearDown() async throws {
        host?.tearDown()
        window?.isHidden = true
        window = nil
        try? FileManager.default.removeItem(at: folder)
    }

    private func model(_ name: String = "heavyweight-chat") throws -> CoachModel {
        try CoachFixtures.model(name)
    }

    /// Lets the queued transitions finish.
    private func settle(_ seconds: Double = 0.2) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    private var up: UIViewController? { stand.shown.last }

    func testAScreenGoesOverThePageNeverInsteadOfIt() async throws {
        XCTAssertFalse(host.present("coach"), "no model yet: nothing to open on")
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))
        try await settle()
        let p = try XCTUnwrap(up)
        XCTAssertEqual(p.modalPresentationStyle, .overFullScreen)
        XCTAssertTrue(p.transitioningDelegate is ScreenSlideTransition, "the push-like slide")
        XCTAssertEqual(stand.log, ["present style 5 over UIViewController"], "over the page's controller")
        XCTAssertNotNil(webView.window, "the page stays in its window under the screen")
        XCTAssertTrue(webView.accessibilityElementsHidden, "VoiceOver reads the screen alone")
        XCTAssertTrue(p.view.accessibilityViewIsModal)
        XCTAssertEqual(covered, [true], "the page heard it is covered before the screen went up")
        XCTAssertEqual(p.overrideUserInterfaceStyle, .light, "Heavyweight is paper: light whatever the phone says")
        XCTAssertEqual(p.preferredStatusBarStyle, .darkContent)
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), ["presenting coach@P1 shell 60"])
        // a newer model in the other room turns the screen dark (an older or equal rev of the document is stale: the
        // chat's store keeps the one it draws, and so does the screen)
        var lime = try model("lime-chat")
        host.update("coach", model: lime)
        XCTAssertEqual(p.overrideUserInterfaceStyle, .light, "rev 42 again: stale")
        lime.rev = 43
        host.update("coach", model: lime)
        XCTAssertEqual(p.overrideUserInterfaceStyle, .dark)
        XCTAssertEqual(p.preferredStatusBarStyle, .lightContent)
        host.dismiss("coach")
        try await settle()
        XCTAssertNil(up)
        XCTAssertTrue(host.shown.isEmpty)
        XCTAssertFalse(webView.accessibilityElementsHidden)
        XCTAssertEqual(covered, [true, false])
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), [], "the marker goes with the screen")
        XCTAssertEqual(host.transitions, ["present coach", "dismiss coach"])
    }

    /// Review 4 (platform low): a present made while the app was not active (sent away right after launch, a background
    /// launch) wrote the crash marker, and nothing took it away before a kill in the background (willResignActive had gone
    /// by), so the next launch read a crash and turned the chat off.
    func testNoMarkerWhileTheAppIsAway() async throws {
        host.isActive = { false }
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        XCTAssertNotNil(up, "the screen goes up all the same")
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), [], "no marker while the app is away: a kill there is no crash")
        host.isActive = { true }
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), ["presenting coach@P1 shell 60"], "in use with the screen up: the marker")
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), [], "the background takes it away too")
    }

    /// Review 4 (platform low): UIKit refuses a presentation it cannot make now (a share sheet's delayed presentation)
    /// without a word: no completion ever came, the queue stayed busy for the rest of the process and the page showed its
    /// placeholder under nothing (a blank chat). The watchdog notices: the page shows its own, the queue goes on.
    func testARefusedPresentationDoesNotStopTheQueue() async throws {
        var failed: [String] = []
        host.hooks.failed = { screen, _ in failed.append(screen) }
        host.presenting = SilentPresenting()
        host.update("coach", model: try model())
        host.present("coach")
        try await settle(2.6)
        XCTAssertEqual(failed, ["coach"], "the page hears it could not go up and shows its own chat")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(host.describe()["busy"] as? Bool, false, "the queue goes on")
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), [])
        XCTAssertEqual(covered, [true, false], "the page is uncovered again")
        XCTAssertFalse(webView.accessibilityElementsHidden)
        host.presenting = stand
        XCTAssertTrue(host.present("coach"))
        try await settle()
        XCTAssertEqual(stand.shown.last?.modalPresentationStyle, .overFullScreen, "a later present goes up")
    }

    /// Review 4 (chat low): a toast the page forwarded just before the chat closed (intake's "Programme saved", then the
    /// Log tab) stayed at the chat header's place, over the next screen's pills.
    func testAToastLeftWhenTheChatGoesLeavesTheChatHeadersPlace() async throws {
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        host.overlay.setAnchor(163)   // where the chat's header ends, as the chat reports it
        host.toast(ToastRequest(text: "Programme saved", style: nil, undo: nil))
        host.dismiss("coach")
        try await settle()
        XCTAssertNil(host.overlay.anchor, "under the status bar, where the overlay puts toasts with no chat up")
        XCTAssertEqual(host.shownToast?.text, "Programme saved", "the toast itself stays its time")
    }

    /// Review 4 (platform low): VoiceOver's escape (a two-finger scrub) did nothing on the chat; a native screen over the
    /// page goes back on it, as a navigation stack's escape pops (Cancel during setup: the page asks first).
    func testVoiceOversEscapeGoesBack() async throws {
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        let p = try XCTUnwrap(up)
        XCTAssertTrue(p.accessibilityPerformEscape(), "escape goes back")
        try await settle()
        XCTAssertNil(up)
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        var intake = try model("intake")
        intake.boot = "intake-boot"
        host.update("coach", model: intake)
        host.present("coach")
        try await settle()
        XCTAssertTrue(try XCTUnwrap(up).accessibilityPerformEscape(), "escape during setup is Cancel")
        XCTAssertEqual(sent.last, .coachCancelIntake, "the page asks first (its confirm, forwarded)")
        XCTAssertNotNil(up, "the chat stays until the page says")
    }

    /// Review 4 (platform low): forwarded toasts kept the text size the overlay last saw at a model push, so a toast right
    /// after the phone's text size changed was drawn at the old scale while the chat had re-laid out.
    func testToastsFollowTheTextSizeLive() throws {
        let m = try model()
        XCTAssertTrue(m.dynTypeOn)
        host.update("coach", model: m)
        let before = host.overlay.theme
        NotificationCenter.default.post(name: UIContentSizeCategory.didChangeNotification, object: nil,
                                        userInfo: [UIContentSizeCategory.newValueUserInfoKey: UIContentSizeCategory.extraExtraLarge])
        XCTAssertEqual(host.overlay.theme, RoomTheme(model: m, system: .xxLarge))
        XCTAssertNotEqual(host.overlay.theme, before)
    }

    func testTheMarkerFollowsTheAppsActivity() async throws {
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), [], "a kill from the app switcher is no crash")
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertEqual(ScreenMarkers(folder: folder).lines(), ["presenting coach@P1 shell 60"], "back with the screen up")
    }

    func testTransitionsQueueAndADismissalCancelsAPresentNotYetStarted() async throws {
        host.update("coach", model: try model())
        host.present("coach")        // starts at once
        host.dismiss("coach")        // queued behind it
        host.present("coach")        // cancels the queued dismissal: the screen just stays
        try await settle()
        XCTAssertEqual(host.transitions, ["present coach"])
        XCTAssertNotNil(up)
        host.dismiss("coach")        // under way at once
        host.present("coach")        // queued behind it
        host.dismiss("coach")        // cancels that present, which never started
        try await settle()
        XCTAssertEqual(host.transitions, ["present coach", "dismiss coach"])
        XCTAssertNil(up)
        XCTAssertEqual(stand.log.count, 2, "two transitions, one at a time: \(stand.log)")
    }

    func testTheOwnersBackIsLatchedUntilThePageSaysDismiss() async throws {
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        host.userBack("coach")
        try await settle()
        XCTAssertNil(up)
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        XCTAssertEqual(host.latched, ["coach"])
        XCTAssertEqual(covered, [true, false])
        host.dismiss("coach")   // the page's own dismiss, after coach.back
        XCTAssertEqual(host.latched, [], "the page's dismiss closes the latch")
        try await settle()
        XCTAssertEqual(host.transitions, ["present coach", "back coach"], "and moves nothing")
        // the chat's own Back control takes the same way
        host.present("coach")
        try await settle()
        XCTAssertNotNil(up)
        // Back the page refused (it stayed on the chat): the screen goes up again over its placeholder
        host.userBack("coach")
        try await settle()
        XCTAssertNil(up)
        host.userBackRefused("coach")
        try await settle()
        XCTAssertNotNil(up, "back up")
        XCTAssertEqual(host.latched, [])
        // the page's dismiss arriving while the owner's back is still queued: no latch left behind
        host.userBack("coach")
        host.dismiss("coach")
        try await settle()
        XCTAssertNil(up)
        XCTAssertEqual(host.latched, [])
    }

    func testTheEdgePanTakesTheScreenDownOrLetsItStay() async throws {
        try XCTSkipIf(UIApplication.shared.connectedScenes.isEmpty, "the edge pan animates in UIKit: it needs a window scene (tests/native-shell.sh drives it in the app)")
        host.presenting = UIKitPresenting()
        host.update("coach", model: try model())
        host.present("coach")
        try await settle(0.6)
        var started = false
        host.simulateEdgeBack("coach", progress: 0.15, finish: false) { started = $0 }
        try await settle(1.0)
        XCTAssertTrue(started)
        XCTAssertNotNil(root.presentedViewController, "let go early: the screen stays")
        XCTAssertEqual(owner, [])
        host.simulateEdgeBack("coach", progress: 0.6, finish: true) { started = $0 }
        try await settle(1.0)
        XCTAssertNil(root.presentedViewController)
        XCTAssertEqual(owner, ["coach"])
        XCTAssertEqual(host.transitions.suffix(2), ["edge back cancelled coach", "edge back coach"])
    }

    func testNoEdgePanBackDuringSetup() async throws {
        host.update("coach", model: try model("intake"))
        host.present("coach")
        try await settle()
        let view = try XCTUnwrap(up?.view)
        XCTAssertFalse(host.beginInteractiveBack(from: view), "setup offers Cancel, never Back")
        XCTAssertNotNil(up)
    }

    func testAForwardedConfirmIsAnsweredOrClosesAsStale() async throws {
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        let c = ConfirmRequest(id: "c1.b1", title: "Restore previous programme?", body: "Puts back the programme before the coach's change.",
                               confirm: "Restore", cancel: nil, tone: nil)
        host.confirm(c)
        XCTAssertEqual(host.openConfirm, "c1.b1")
        XCTAssertTrue(try XCTUnwrap(up).view.accessibilityElementsHidden, "the screen stands down for VoiceOver under the confirm")
        XCTAssertTrue(host.overlay.tapConfirm(true))
        XCTAssertEqual(sent, [.confirm(id: "c1.b1", yes: true)])
        XCTAssertNil(host.openConfirm)
        XCTAssertFalse(try XCTUnwrap(up).view.accessibilityElementsHidden)
        host.confirm(ConfirmRequest(id: "c2.b1", title: "Stop setup?", body: nil, confirm: nil, cancel: nil, tone: "accent"))
        host.closeConfirmAsStale()
        XCTAssertNil(host.openConfirm)
        XCTAssertEqual(sent, [.confirm(id: "c1.b1", yes: true)], "a stale confirm closes unanswered")
    }

    /// The toast window is only as tall as the toast it shows, measured for that toast (a hosting controller reused across
    /// toasts measured the one before it: a strip of no height once drew a toast centred on its top edge, over the chat's
    /// header), in each room and at each text size.
    func testTheToastStripFitsTheToastItShows() throws {
        for room in [Room.heavyweight, .lime] {
            for size in [TextSize.large, .xxLarge] {
                let theme = RoomTheme.defaults(room, textSize: size)
                let short = ShellOverlay.toastHeight(ToastRequest(text: "Saved", style: nil, undo: nil), theme: theme, width: 390)
                let undo = ShellOverlay.toastHeight(ToastRequest(text: "Removed", style: nil, undo: "t1"), theme: theme, width: 390)
                let long = ShellOverlay.toastHeight(ToastRequest(text: String(repeating: "A long forwarded toast ", count: 8), style: "err", undo: nil),
                                                    theme: theme, width: 390)
                XCTAssertGreaterThan(short, 40, "\(room) \(size)")
                XCTAssertGreaterThanOrEqual(undo, short, "\(room) \(size)")
                XCTAssertGreaterThan(long, short + 30, "a toast of several lines gets a taller strip: \(room) \(size)")
            }
        }
    }

    /// In a window scene: the toast 8 px under the header, its strip its own height after a confirm, its Undo to the page.
    func testTheToastWindowSitsUnderTheHeaderAndUndoGoesToThePage() throws {
        try XCTSkipIf(UIApplication.shared.connectedScenes.isEmpty, "the toast window needs a window scene (tests/native-shell.sh checks it in the app)")
        host.update("coach", model: try model())
        host.confirm(ConfirmRequest(id: "c1", title: "Sure?", body: nil, confirm: nil, cancel: nil, tone: nil))
        host.overlay.setAnchor(170)
        XCTAssertTrue(host.overlay.tapConfirm(false))
        host.toast(ToastRequest(text: "Removed", style: nil, undo: "t1"))
        let r = NSCoder.cgRect(for: try XCTUnwrap(host.overlay.describe()["frame"] as? String))
        XCTAssertEqual(r.minY, 178, accuracy: 0.5, "8 px under the header")
        XCTAssertGreaterThan(r.height, 40)
        XCTAssertTrue(host.overlay.tapUndo())
        XCTAssertEqual(sent.last, .toastUndo(id: "t1"))
        XCTAssertNil(host.shownToast)
    }

    /// The chat's store lives with the host (plan task C7): its Back is the host's, its intents and their outcomes go
    /// through `ask`; a reload with the chat up keeps it drawn until the next document's model, and a message that never
    /// reached the page comes back in the composer once, the chat still up, its toast in the host's window.
    func testTheChatsStoreFollowsAReloadWithTheChatUp() async throws {
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        host.coach.draft.text = "Never sent"
        XCTAssertTrue(host.coach.sendComposer(nonce: "n1"))
        XCTAssertEqual(asked, [.coachSend(text: "Never sent", image: nil, usePending: nil, nonce: "n1")])
        XCTAssertEqual(host.coach.display?.messages.last?.id, "echo-n1")
        // the page's document goes with the send in it
        answers.removeFirst()(.documentGone)
        host.forgetModels(exceptUp: true)
        XCTAssertNotNil(host.model("coach"), "up: drawn until the next document's resync")
        XCTAssertEqual(host.restored, [])
        var next = try model()
        next.boot = "b-next"
        next.rev = 1
        host.update("coach", model: next)
        XCTAssertEqual(host.model("coach")?.boot, "b-next")
        XCTAssertEqual(host.restored, ["Never sent"])
        XCTAssertEqual(host.coach.draft.text, "Never sent", "back in the composer, never resent")
        XCTAssertEqual(asked.filter { $0.name == "coach.send" }.count, 1)
        XCTAssertNotNil(up, "the chat stayed up")
        // the chat's Back is the host's own (latched), never an intent of the chat's
        host.coach.handle(.coachBack)
        try await settle()
        XCTAssertNil(up)
        XCTAssertEqual(owner, ["coach"])
        // a model of a document gone while the chat is down goes with it: no present until the next document's
        host.forgetModels(exceptUp: true)
        XCTAssertNil(host.model("coach"))
        XCTAssertFalse(host.present("coach"))
    }

    func testMarkersFoundAtLaunchAreRead() throws {
        let m = ScreenMarkers(folder: folder)
        m.write("coach", page: "P9", shell: "60")
        let found = m.found(defaultShell: "61")
        XCTAssertEqual(found.count, 1)
        XCTAssertEqual(found.first?.marker, CrashMarker(piece: .screen("coach"), pageBuild: "P9", shellBuild: "60"))
        m.remove("coach")
        XCTAssertTrue(m.found(defaultShell: "60").isEmpty)
    }
}
#endif
