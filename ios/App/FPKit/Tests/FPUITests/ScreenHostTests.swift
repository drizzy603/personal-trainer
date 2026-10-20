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

/// Stands in for UIKit's coordinator of the owner's interactive pop, which no unit test can make (it takes a finger):
/// ScreenHost follows the transition through it, and the case says how it ends.
@MainActor
final class StandInCoordinator: NSObject, UIViewControllerTransitionCoordinator {
    private var ends: [(UIViewControllerTransitionCoordinatorContext) -> Void] = []
    private var cancelledEnd = false

    /// The transition ends: finished, or cancelled (the owner let go early).
    func end(cancelled: Bool) {
        cancelledEnd = cancelled
        let e = ends
        ends = []
        e.forEach { $0(self) }
    }

    func animate(alongsideTransition animation: ((UIViewControllerTransitionCoordinatorContext) -> Void)?,
                 completion: ((UIViewControllerTransitionCoordinatorContext) -> Void)?) -> Bool {
        if let completion { ends.append(completion) }
        return true
    }

    func animateAlongsideTransition(in view: UIView?, animation: ((UIViewControllerTransitionCoordinatorContext) -> Void)?,
                                    completion: ((UIViewControllerTransitionCoordinatorContext) -> Void)?) -> Bool {
        if let completion { ends.append(completion) }
        return true
    }

    func notifyWhenInteractionEnds(_ handler: @escaping (UIViewControllerTransitionCoordinatorContext) -> Void) {}
    func notifyWhenInteractionChanges(_ handler: @escaping (UIViewControllerTransitionCoordinatorContext) -> Void) {}

    var isAnimated: Bool { true }
    var presentationStyle: UIModalPresentationStyle { .none }
    var initiallyInteractive: Bool { true }
    var isInterruptible: Bool { false }
    var isInteractive: Bool { true }
    var isCancelled: Bool { cancelledEnd }
    var transitionDuration: TimeInterval { 0.35 }
    var percentComplete: CGFloat { 0.5 }
    var completionVelocity: CGFloat { 1 }
    var completionCurve: UIView.AnimationCurve { .easeOut }
    func viewController(forKey key: UITransitionContextViewControllerKey) -> UIViewController? { nil }
    func view(forKey key: UITransitionContextViewKey) -> UIView? { nil }
    var containerView: UIView { UIView() }
    var targetTransform: CGAffineTransform { .identity }
}

/// A navigation controller that records how each push, pop and replacement was asked for (animated or still).
@MainActor
final class StackRecordingNav: UINavigationController {
    private(set) var log: [String] = []
    var recording = false
    /// A coordinator standing in for UIKit's while a case makes the owner's interactive pop (StandInCoordinator).
    var standInCoordinator: UIViewControllerTransitionCoordinator?

    override var transitionCoordinator: UIViewControllerTransitionCoordinator? {
        standInCoordinator ?? super.transitionCoordinator
    }

    override func pushViewController(_ viewController: UIViewController, animated: Bool) {
        if recording { log.append(animated ? "push animated" : "push still") }
        super.pushViewController(viewController, animated: animated)
    }

    @discardableResult
    override func popViewController(animated: Bool) -> UIViewController? {
        if recording { log.append(animated ? "pop animated" : "pop still") }
        return super.popViewController(animated: animated)
    }

    override func setViewControllers(_ viewControllers: [UIViewController], animated: Bool) {
        if recording { log.append(animated ? "set animated" : "set still") }
        super.setViewControllers(viewControllers, animated: animated)
    }
}

/// A web view that counts each move out of its window (contract I1: `ShellWebView` is final, so tests count their own).
final class StackCountingWebView: WKWebView {
    private(set) var leftWindow = 0

    override func willMove(toWindow newWindow: UIWindow?) {
        if newWindow == nil { leftWindow += 1 }
        super.willMove(toWindow: newWindow)
    }
}

/// The tab root's stand-in for the stack's cases: the page's web view in the window behind everything for the rig's
/// whole life (as the root's parking view keeps it), a UITabBarController (Log, Coach) whose Coach tab is a real
/// UINavigationController with its system bar hidden, and the answers the root gives as a StackState.
@MainActor
final class StackRig {
    let container = UIViewController()
    let web = UIViewController()
    let webView = StackCountingWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let tabs = UITabBarController()
    let log = UIViewController()
    let home = UIViewController()
    let nav: StackRecordingNav
    var native = true
    var held = false
    var releases = 0
    /// The interactive pop's delegate before ScreenHost took it.
    var popDelegateBefore: AnyObject?
    /// Whether iOS 26's content pop was on before ScreenHost turned it off (nil below iOS 26).
    var contentPopBefore: Bool?

    init() {
        web.view = webView
        home.view.backgroundColor = .systemBackground
        nav = StackRecordingNav(rootViewController: home)
        nav.setNavigationBarHidden(true, animated: false)
        log.tabBarItem = UITabBarItem(title: "Log", image: UIImage(systemName: "plus"), tag: 0)
        nav.tabBarItem = UITabBarItem(title: "Coach", image: UIImage(systemName: "bubble.left"), tag: 1)
        tabs.viewControllers = [log, nav]
        container.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        container.addChild(web)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.view.addSubview(webView)
        web.didMove(toParent: container)
        container.addChild(tabs)
        tabs.view.frame = container.view.bounds
        tabs.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.view.addSubview(tabs.view)
        tabs.didMove(toParent: container)
        nav.recording = true
    }

    /// What the root answers: Coach selected, the tab NATIVE, the hold, its release.
    var state: StackState {
        StackState(selected: { [weak self] in self?.tabs.selectedIndex == 1 },
                   native: { [weak self] in self?.native ?? false },
                   held: { [weak self] in self?.held ?? false },
                   releaseHold: { [weak self] in
                       self?.releases += 1
                       self?.held = false
                   })
    }
}

/// ScreenHost (plan task C5) over a web view standing in for the page: only `.overFullScreen` (the web view stays in
/// its window), one transition at a time with a dismissal that cancels a present not yet started, the owner's back
/// latched, the web view hidden from VoiceOver while covered, the room's appearance whatever the phone's, the crash
/// marker only while a screen is up, and the toast strip sized to the toast it shows. UIKit's slide and edge pan run in
/// the app (tests/native-shell.sh), and here only where the host has a window scene.
///
/// The stack's cases (`testStack...`, 11-shell.md H5 tests 1-14) run on a real UINavigationController as a tab of a
/// UITabBarController in the window (`StackRig`), with a stand-in StackState: UIKit's own pushes and pops complete in
/// this host, and its didShow comes late or not at all exactly as H0's probe measured, so every case waits on the queue
/// going idle, never on a fixed time. The owner's interactive pop takes a finger, so its coordinator is stood in
/// (`StandInCoordinator`) on a stack out of the window, where UIKit adds no word of its own.
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
    /// The stack's cases: the tab root's stand-in, VoiceOver's screen changes (NSNull for none), the screens that failed.
    private var rig: StackRig?
    private var posts: [AnyObject] = []
    private var failedScreens: [String] = []

    override func setUp() async throws {
        try await WebKitWarmUp.ensure()
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
        host.hooks = recordingHooks()
        sent = []
        asked = []
        answers = []
        covered = []
        owner = []
        posts = []
        failedScreens = []
    }

    override func tearDown() async throws {
        host?.tearDown()
        rig = nil
        window?.isHidden = true
        window = nil
        try? FileManager.default.removeItem(at: folder)
    }

    /// The hooks every case records through.
    private func recordingHooks() -> ScreenHost.Hooks {
        var hooks = ScreenHost.Hooks()
        hooks.send = { [weak self] in self?.sent.append($0) }
        hooks.ask = { [weak self] intent, done in
            self?.asked.append(intent)
            self?.answers.append(done)
        }
        hooks.willCover = { [weak self] in self?.covered.append(true) }
        hooks.didUncover = { [weak self] in self?.covered.append(false) }
        hooks.userDismissed = { [weak self] in self?.owner.append($0) }
        hooks.failed = { [weak self] screen, _ in self?.failedScreens.append(screen) }
        return hooks
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

    /// Review 4 (chat low): a hardware keyboard's Cmd+Return did not send from the native composer, where the web
    /// composer's Cmd/Ctrl+Enter sends from anywhere. The chat's controller offers it as UIKit's own key command, ahead of
    /// the text view's Return, and it sends what the composer holds as Send does. (A real key reaches UIKit only from a
    /// hardware keyboard: the simulator's software keyboard drops modified keys, Cmd+A included, so a phone with a
    /// keyboard checks the key itself.)
    func testCommandReturnSendsWhatTheComposerHolds() async throws {
        FPFonts.register()
        host.update("coach", model: try model())
        host.present("coach")
        try await settle()
        let p = try XCTUnwrap(up)
        let key = try XCTUnwrap(p.keyCommands?.first { $0.input == "\r" && $0.modifierFlags == .command }, "the chat offers Cmd+Return")
        XCTAssertTrue(key.wantsPriorityOverSystemBehavior, "ahead of the text view's own Return (a new line)")
        // the chat drawn, as it is when presented
        let shown = UIWindow(frame: window.frame)
        shown.windowScene = window.windowScene
        shown.rootViewController = p
        shown.makeKeyAndVisible()
        defer {
            shown.isHidden = true
            shown.rootViewController = nil
        }
        host.coach.draft.text = "Sent from the keys"
        for _ in 0..<10 {
            p.view.setNeedsLayout()
            p.view.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.03))
        }
        _ = p.perform(try XCTUnwrap(key.action), with: key)
        try await settle()
        guard case .coachSend(let text, _, _, _)? = asked.last(where: { $0.name == "coach.send" }) else {
            return XCTFail("no coach.send: \(asked)")
        }
        XCTAssertEqual(text, "Sent from the keys")
        XCTAssertEqual(host.coach.draft.text, "", "the composer empties, as after Send")
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

    // MARK: - Stack mode (build 61): the chat pushed in the Coach tab's stack (11-shell.md H5)

    /// The stack's world: the rig as the window's root, a ScreenHost over its web view with the hooks every case records
    /// through, attached to the Coach tab's stack; Coach selected unless asked otherwise.
    @discardableResult
    private func makeStack(selected: Bool = true) async throws -> StackRig {
        host.tearDown()
        let r = StackRig()
        window.rootViewController = r.container
        r.tabs.selectedIndex = selected ? 1 : 0
        window.layoutIfNeeded()
        let h = ScreenHost(presenter: r.web, webView: r.webView, shellBuild: "61", pageBuild: "P1", markerFolder: folder,
                           coach: CoachStore(draft: CoachComposerDraft(defaults: nil)))
        h.presenting = stand
        h.isActive = { true }
        h.postScreenChanged = { [weak self] in self?.posts.append(($0 as AnyObject?) ?? NSNull()) }
        h.hooks = recordingHooks()
        r.popDelegateBefore = r.nav.interactivePopGestureRecognizer?.delegate
        if #available(iOS 26.0, *) { r.contentPopBefore = r.nav.interactiveContentPopGestureRecognizer?.isEnabled }
        h.attachStack(r.nav, state: r.state)
        host = h
        rig = r
        try await settle(0.1)
        posts = []
        return r
    }

    /// Whether a transition is under way (the queue is busy).
    private func busy() -> Bool { host.describe()["busy"] as? Bool ?? true }

    /// Polls every 20 ms until `ok` holds; false if it never did within `timeout`. A loaded machine only waits longer.
    private func until(_ timeout: Double = 6, _ ok: () -> Bool) async throws -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while !ok() {
            if Date() > end { return false }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        return true
    }

    /// Lets every queued push and pop finish.
    private func idle(_ why: String = "the transitions finish", line: UInt = #line) async throws {
        let done = try await until { !self.busy() }
        XCTAssertTrue(done, why, line: line)
    }

    /// A few layout passes, so SwiftUI draws the pushed chat and reports its header.
    private func layOut(_ vc: UIViewController) async throws {
        for _ in 0..<10 {
            vc.view.setNeedsLayout()
            vc.view.layoutIfNeeded()
            try await Task.sleep(nanoseconds: 30_000_000)
        }
    }

    /// The root's selection, then the bridge's word to ScreenHost (from the root's `coachShown`).
    private func select(coach: Bool) {
        rig?.tabs.selectedIndex = coach ? 1 : 0
        host.selectionChanged()
    }

    private func markerLines() -> [String] { ScreenMarkers(folder: folder).lines() }

    /// How many accessibility elements in the window carry each label, SwiftUI's own included (the probe's accessibility
    /// runtime is on meanwhile, as in the app: SwiftUI vends its elements only then).
    private func axCounts(_ labels: [String], after vc: UIViewController) async throws -> [String: Int] {
        ShellProbe.enableAccessibility()
        defer { ShellProbe.restoreAccessibility() }
        try await layOut(vc)
        var counts: [String: Int] = [:]
        for label in labels { counts[label] = Self.axCount(label, in: window) }
        return counts
    }

    private static func axCount(_ label: String, in root: NSObject, depth: Int = 0) -> Int {
        guard depth < 64 else { return 0 }
        var n = root.isAccessibilityElement && root.accessibilityLabel == label ? 1 : 0
        var kids: [Any] = []
        if let els = root.accessibilityElements {
            kids += els
        } else {
            let c = root.accessibilityElementCount()
            if c > 0, c != NSNotFound { for i in 0..<c { if let e = root.accessibilityElement(at: i) { kids.append(e) } } }
        }
        if let v = root as? UIView { kids += v.subviews.filter { !$0.isHidden && !$0.accessibilityElementsHidden } }
        for k in kids { if let o = k as? NSObject, o !== root { n += axCount(label, in: o, depth: depth + 1) } }
        return n
    }

    /// The visible controls under `v` (the bar's items: UIKit draws each twice, and their classes are private).
    private static func controls(in v: UIView) -> [UIView] {
        guard !v.isHidden, v.alpha > 0.01 else { return [] }
        var out: [UIView] = v is UIControl && v.bounds.width > 0 && v.bounds.height > 0 ? [v] : []
        for s in v.subviews { out += controls(in: s) }
        return out
    }

    /// H5 test 1: the chat is pushed, never presented: nothing through UIKit's presentation, no covered hook (the root
    /// sends covered), not modal, the tab bar left over it (D9), host `stack`; on a selected tab not held the push is
    /// animated, its marker written, and VoiceOver hears the chat once however often UIKit says didShow.
    func testStackTheChatIsPushedNeverPresented() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))
        host.navigationController(r.nav, didShow: r.home, animated: true)   // another controller's didShow: not the push's
        XCTAssertTrue(busy(), "the push waits for the chat's own didShow")
        try await idle()
        let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController, "the chat on top of the stack")
        XCTAssertEqual(r.nav.viewControllers.count, 2)
        XCTAssertEqual(r.nav.log, ["push animated"], "Coach selected and not held: animated")
        XCTAssertEqual(stand.log, [], "never presented")
        XCTAssertNil(chat.presentingViewController)
        XCTAssertNotEqual(chat.modalPresentationStyle, .overFullScreen)
        XCTAssertEqual(covered, [], "no covered hook: the root owns covered")
        XCTAssertFalse(chat.view.accessibilityViewIsModal, "not modal: the bar stays reachable")
        XCTAssertFalse(chat.hidesBottomBarWhenPushed, "D9: the bar stays over the chat")
        XCTAssertFalse(r.tabs.tabBar.isHidden)
        if #available(iOS 18.0, *) { XCTAssertFalse(r.tabs.isTabBarHidden) }
        XCTAssertEqual(r.tabs.selectedIndex, 1)
        XCTAssertEqual(chat.overrideUserInterfaceStyle, .light, "Heavyweight is paper")
        XCTAssertEqual(chat.preferredStatusBarStyle, .darkContent)
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(host.shown, ["coach"], "pushed is up: hello's up names it")
        XCTAssertTrue(host.hostView("coach") === chat.view)
        XCTAssertEqual(host.transitions, ["present coach"])
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
        XCTAssertFalse(r.webView.accessibilityElementsHidden, "the web view's accessibility is the root's")
        XCTAssertEqual(posts.count, 1)
        XCTAssertTrue(posts.last === chat.view, "VoiceOver hears the chat")
        host.navigationController(r.nav, didShow: chat, animated: false)   // UIKit's didShow again
        host.navigationController(r.nav, didShow: chat, animated: false)
        XCTAssertEqual(posts.count, 1, "once per push")
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
        let d = host.describe()
        XCTAssertEqual(d["mode"] as? String, "stack")
        let screens = try XCTUnwrap(d["screens"] as? [String: Any])
        let c = try XCTUnwrap(screens["coach"] as? [String: Any])
        XCTAssertEqual(c["host"] as? String, "stack")
        XCTAssertEqual(c["presented"] as? Bool, true)
        XCTAssertEqual(c["hidesBar"] as? Bool, false)
        XCTAssertEqual(c["modal"] as? Bool, false)
        let s = try XCTUnwrap(d["stack"] as? [String: Any])
        XCTAssertEqual(s["depth"] as? Int, 2)
        XCTAssertEqual(s["top"] as? String, "coach")
        XCTAssertEqual(s["selected"] as? Bool, true)
        XCTAssertEqual(s["held"] as? Bool, false)
        XCTAssertEqual(s["interactivePop"] as? Bool, true)
        if #available(iOS 26.0, *) { XCTAssertEqual(s["contentPop"] as? Bool, false) }
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 2: no push onto a Coach tab that is not NATIVE (WAITING or WEB: nothing visible to push onto; the bridge
    /// words it not-native) nor without a model; one accepted while NATIVE whose turn comes after the tab turned WEB is
    /// not pushed and the page shows its own.
    func testStackAPushNeedsANativeTabAndAModel() async throws {
        let r = try await makeStack()
        XCTAssertFalse(host.present("coach"), "no model yet")
        host.update("coach", model: try model())
        r.native = false
        XCTAssertFalse(host.present("coach"), "WAITING or WEB")
        try await settle(0.1)
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(r.nav.log, [])
        XCTAssertEqual(host.transitions, [])
        r.native = true
        XCTAssertTrue(host.present("coach"))
        try await idle()
        host.dismiss("coach")                  // the pop under way
        XCTAssertTrue(host.present("coach"))   // queued behind it, accepted while NATIVE
        r.native = false                       // the tab turned WEB before its turn
        try await idle()
        XCTAssertEqual(failedScreens, ["coach"], "the page hears it could not go up and shows its own")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(markerLines(), [])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 3: the page's dismiss pops the chat and never uncovers (the hub may still hide the page) nor touches the
    /// web view; VoiceOver hears the stack's new top.
    func testStackThePagesDismissPopsAndNeverUncovers() async throws {
        let r = try await makeStack()
        r.webView.accessibilityElementsHidden = true   // the root hides the page behind a native Coach tab
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        host.dismiss("coach")
        try await idle()
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertTrue(r.nav.topViewController === r.home)
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(covered, [], "a pop never uncovers")
        XCTAssertTrue(r.webView.accessibilityElementsHidden, "and never touches the web view")
        XCTAssertEqual(owner, [], "the page's own dismiss is no Back")
        XCTAssertEqual(host.transitions, ["present coach", "dismiss coach"])
        XCTAssertEqual(r.nav.log, ["push animated", "pop animated"])
        XCTAssertEqual(markerLines(), [], "the marker goes with the chat")
        XCTAssertEqual(posts.count, 2)
        XCTAssertTrue(posts.last === r.home.view, "VoiceOver hears the stack's new top")
        XCTAssertNil(host.firstTextInput(), "the stack's top has no text input now")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 4: the owner's Back pops, latched: the page hears coach.back once; its dismiss then closes the latch; a
    /// refusal pushes the chat again; the chat's own Back control takes the same way. Exactly one control is labelled
    /// "Back" with the chat on top (the system bar is hidden), none in setup, where Cancel stands in its place.
    func testStackTheOwnersBackPopsLatchedAndOneBackIsOffered() async throws {
        FPFonts.register()
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        let counts = try await axCounts(["Back", "Cancel"], after: try XCTUnwrap(r.nav.topViewController))
        XCTAssertEqual(counts["Back"], 1, "exactly one control labelled Back: the chat's own")
        XCTAssertEqual(counts["Cancel"], 0)
        host.userBack("coach")
        try await idle()
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        XCTAssertEqual(host.latched, ["coach"])
        XCTAssertEqual(covered, [])
        host.dismiss("coach")   // the page's own dismiss, after coach.back
        XCTAssertEqual(host.latched, [], "the page's dismiss closes the latch")
        try await idle()
        XCTAssertEqual(host.transitions, ["present coach", "back coach"], "and moves nothing")
        // a Back the page refused: the chat is pushed again
        host.present("coach")
        try await idle()
        host.userBack("coach")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        host.userBackRefused("coach")
        let back = try await until { self.host.isUp("coach") && !self.busy() }
        XCTAssertTrue(back, "pushed again")
        XCTAssertEqual(r.nav.viewControllers.count, 2)
        XCTAssertEqual(host.latched, [])
        XCTAssertEqual(owner, ["coach", "coach"])
        // the chat's own Back control takes the same way, once however often UIKit says didShow
        host.coach.handle(.coachBack)
        try await idle()
        host.navigationController(r.nav, didShow: r.home, animated: false)
        XCTAssertEqual(owner, ["coach", "coach", "coach"])
        XCTAssertEqual(host.latched, ["coach"])
        host.dismiss("coach")
        // setup: Cancel, no Back
        var intake = try model("intake")
        intake.boot = "intake-boot"
        host.update("coach", model: intake)
        host.present("coach")
        try await idle()
        let setup = try await axCounts(["Back", "Cancel"], after: try XCTUnwrap(r.nav.topViewController))
        XCTAssertEqual(setup["Back"], 0, "none in setup")
        XCTAssertEqual(setup["Cancel"], 1, "Cancel stands in its place")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 5: the interactive pop begins only with the chat pushed on top, offering Back, not in setup and nothing
    /// under way (never at the root); a pop ScreenHost did not make, once finished, is the owner's Back once; a cancelled
    /// one (the chat still on top when UIKit is done) is nothing.
    func testStackTheInteractivePopFollowsTheEdgePansRule() async throws {
        let r = try await makeStack()
        let pop = try XCTUnwrap(r.nav.interactivePopGestureRecognizer)
        XCTAssertTrue(pop.delegate === host, "ScreenHost decides where the owner's finger may begin")
        XCTAssertTrue(r.nav.delegate === host)
        if #available(iOS 26.0, *) {
            // a leading pan anywhere in the content would pop the chat in setup and mid-transition too
            let content = try XCTUnwrap(r.nav.interactiveContentPopGestureRecognizer, "iOS 26's content pop")
            XCTAssertEqual(r.contentPopBefore, true, "on in a navigation controller of its own")
            XCTAssertFalse(content.isEnabled, "off while attached: the edge is the one interactive pop")
        }
        XCTAssertFalse(host.gestureRecognizerShouldBegin(pop), "never at the stack's root")
        var intake = try model("intake")
        intake.boot = "b-intake"
        host.update("coach", model: intake)
        host.present("coach")
        try await idle()
        XCTAssertFalse(host.gestureRecognizerShouldBegin(pop), "not in setup")
        host.dismiss("coach")
        try await idle()
        var noBack = try model()
        noBack.boot = "b-noback"
        noBack.header.back = false
        host.update("coach", model: noBack)
        host.present("coach")
        try await idle()
        XCTAssertFalse(host.gestureRecognizerShouldBegin(pop), "not without Back")
        host.dismiss("coach")
        try await idle()
        var withBack = try model()
        withBack.boot = "b-back"
        host.update("coach", model: withBack)
        host.present("coach")
        XCTAssertFalse(host.gestureRecognizerShouldBegin(pop), "not while the push is under way")
        try await idle()
        XCTAssertTrue(host.gestureRecognizerShouldBegin(pop), "the chat on top, Back offered, nothing under way")
        // a pop ScreenHost did not make, finished: the owner's Back, once
        r.nav.popViewController(animated: true)
        let popped = try await until { !self.host.isUp("coach") && !self.busy() }
        XCTAssertTrue(popped)
        XCTAssertEqual(owner, ["coach"])
        XCTAssertEqual(host.latched, ["coach"])
        XCTAssertEqual(host.transitions.last, "back coach")
        host.navigationController(r.nav, didShow: r.home, animated: true)   // UIKit's didShow again
        try await settle(0.1)
        XCTAssertEqual(owner, ["coach"], "once")
        host.dismiss("coach")
        XCTAssertEqual(host.latched, [], "the page's dismiss after coach.back closes the latch")
        // a cancelled pop: UIKit's willShow for the root, then the chat still on top
        host.present("coach")
        try await idle()
        let chat = try XCTUnwrap(r.nav.topViewController)
        host.navigationController(r.nav, willShow: r.home, animated: true)
        host.navigationController(r.nav, didShow: chat, animated: true)
        try await settle(0.1)
        XCTAssertEqual(owner, ["coach"], "nothing for a cancelled pop")
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 2)
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 5, the owner's finger: an interactive pop ScreenHost did not make (UIKit's coordinator stands in, since no
    /// unit test has a finger; the stack is out of the window so UIKit adds no word of its own) holds the queue while it
    /// runs and ends as UIKit says, whichever word comes first, the coordinator's end or `didShow`: finished, it is the
    /// owner's Back once (a page's dismiss queued meanwhile then closes the latch); cancelled, nothing, also when the
    /// chat's `didShow` comes before UIKit has put the chat back in the stack's array.
    func testStackTheOwnersInteractivePopEndsAsUIKitSays() async throws {
        let r = try await makeStack(selected: false)
        let pop = try XCTUnwrap(r.nav.interactivePopGestureRecognizer)
        host.update("coach", model: try model())
        /// UIKit's order for the owner's pop: the chat leaves the array, then willShow with an interactive coordinator
        /// (stood in only for that call, so UIKit's own work on the array never reads it).
        func beginPop() throws -> (chat: UIViewController, coordinator: StandInCoordinator) {
            let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController, "the chat on top")
            let c = StandInCoordinator()
            r.nav.setViewControllers([r.home], animated: false)
            r.nav.standInCoordinator = c
            host.navigationController(r.nav, willShow: r.home, animated: true)
            r.nav.standInCoordinator = nil
            XCTAssertTrue(busy(), "the queue waits for the owner's finger")
            XCTAssertTrue(host.isUp("coach"), "nothing decided while the finger is down")
            XCTAssertFalse(host.gestureRecognizerShouldBegin(pop), "one pop at a time")
            XCTAssertEqual((host.describe()["stack"] as? [String: Any])?["foreignPop"] as? String, "interactive")
            return (chat, c)
        }
        XCTAssertTrue(host.present("coach"))
        XCTAssertFalse(busy(), "pushed at once out of the window")
        // cancelled: the chat's didShow first, before UIKit has put it back in the array; the coordinator's end after
        var (chat, c) = try beginPop()
        host.navigationController(r.nav, didShow: chat, animated: true)
        XCTAssertFalse(busy(), "ended: the queue goes on")
        XCTAssertEqual(host.transitions.last, "edge back cancelled coach")
        XCTAssertEqual(owner, [])
        XCTAssertTrue(host.isUp("coach"))
        r.nav.setViewControllers([r.home, chat], animated: false)
        c.end(cancelled: true)
        XCTAssertEqual(owner, [], "nothing more")
        // cancelled: the coordinator's word alone, UIKit's didShow after it
        (chat, c) = try beginPop()
        r.nav.setViewControllers([r.home, chat], animated: false)
        c.end(cancelled: true)
        XCTAssertFalse(busy())
        host.navigationController(r.nav, didShow: chat, animated: true)
        XCTAssertEqual(owner, [])
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(host.transitions.filter { $0 == "edge back cancelled coach" }.count, 2)
        // finished: the coordinator's end first; a page's dismiss queued behind the finger closes the latch after it
        (chat, c) = try beginPop()
        host.dismiss("coach")
        XCTAssertEqual(host.describe()["ops"] as? Int, 1, "queued behind the owner's finger")
        c.end(cancelled: false)
        XCTAssertFalse(busy())
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(owner, ["coach"], "the owner's Back")
        XCTAssertEqual(host.transitions.last, "edge back coach")
        XCTAssertEqual(host.latched, [], "the page's dismiss, queued meanwhile, closed the latch")
        host.navigationController(r.nav, didShow: r.home, animated: true)
        host.navigationController(r.nav, didShow: r.home, animated: true)
        XCTAssertEqual(owner, ["coach"], "once")
        // finished: didShow of the controller below first, the coordinator's end after
        XCTAssertTrue(host.present("coach"))
        XCTAssertFalse(busy())
        (chat, c) = try beginPop()
        host.navigationController(r.nav, didShow: r.home, animated: true)
        XCTAssertFalse(busy())
        XCTAssertEqual(owner, ["coach", "coach"])
        XCTAssertEqual(host.latched, ["coach"])
        c.end(cancelled: false)
        XCTAssertEqual(owner, ["coach", "coach"], "once")
        XCTAssertEqual(markerLines(), [], "Coach not selected: never a marker")
        XCTAssertEqual(r.tabs.selectedIndex, 0)
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 6: the probe's edge pan has no finger: in the stack it runs the finished pop's path (the owner's Back,
    /// latched), or nothing when let go early, and only where the interactive pop would begin.
    func testStackTheProbesEdgeBackRunsTheOwnersBack() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        var started: Bool?
        host.simulateEdgeBack("coach", progress: 0.15, finish: false) { started = $0 }
        XCTAssertEqual(started, true)
        try await settle(0.1)
        XCTAssertTrue(host.isUp("coach"), "let go early: the chat stays")
        XCTAssertEqual(owner, [])
        XCTAssertEqual(host.transitions.last, "edge back cancelled coach")
        started = nil
        host.simulateEdgeBack("coach", progress: 0.6, finish: true) { started = $0 }
        XCTAssertEqual(started, true)
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        XCTAssertEqual(host.latched, ["coach"])
        XCTAssertEqual(Array(host.transitions.suffix(2)), ["edge back cancelled coach", "edge back coach"])
        host.dismiss("coach")
        var intake = try model("intake")
        intake.boot = "b-intake"
        host.update("coach", model: intake)
        host.present("coach")
        try await idle()
        started = nil
        host.simulateEdgeBack("coach", progress: 0.6, finish: true) { started = $0 }
        XCTAssertEqual(started, false, "setup offers no Back")
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 7: a push while Coach is not selected, and one while the root is held, go without animation and change no
    /// selection (D18); the held one ends the hold; no marker while Coach is not selected; on a selected tab not held the
    /// push animates.
    func testStackAPushWhileCoachIsAwayOrHeldIsNotAnimated() async throws {
        let r = try await makeStack(selected: false)
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))
        XCTAssertFalse(busy(), "done at once: UIKit says nothing while the tab is away")
        XCTAssertEqual(r.nav.log, ["push still"])
        XCTAssertEqual(r.tabs.selectedIndex, 0, "the selection is not changed for it")
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 2)
        XCTAssertEqual(markerLines(), [], "no marker while Coach is not selected")
        XCTAssertEqual(posts.count, 0, "VoiceOver stays where the owner is")
        XCTAssertEqual(r.releases, 0)
        select(coach: true)
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"], "Coach selected: the chat on top has its marker")
        try await settle(0.1)
        host.dismiss("coach")
        try await idle()
        r.held = true
        XCTAssertTrue(host.present("coach"))
        try await idle()
        XCTAssertEqual(r.releases, 1, "the push ends the hold")
        XCTAssertFalse(r.held)
        XCTAssertEqual(r.tabs.selectedIndex, 1)
        host.dismiss("coach")
        try await idle()
        host.present("coach")
        try await idle()
        XCTAssertEqual(r.nav.log, ["push still", "pop animated", "push still", "pop animated", "push animated"])
        XCTAssertEqual(r.releases, 1)
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 8: every sequence of select, push, pop, deselect, resign, become active, WEB, NATIVE, then teardown or
    /// detach leaves zero or one marker file, and the right one: the chat on top of the selected NATIVE stack while the
    /// app is active, and none once the stack is gone.
    func testStackKeepsAtMostOneMarkerThroughEverySequence() async throws {
        let steps = ["select", "deselect", "push", "pop", "resign", "active", "web", "native"]
        for seed in [UInt64(7), 61, 2026] {
            var rng = seed
            func next(_ n: Int) -> Int {
                rng = rng &* 6364136223846793005 &+ 1442695040888963407
                return Int((rng >> 33) % UInt64(n))
            }
            let r = try await makeStack(selected: next(2) == 0)
            host.animated = false   // the order is what counts here, not the slide
            var active = true
            host.isActive = { active }
            host.update("coach", model: try model())
            var trail: [String] = []
            // a fixed start that meets every rule once (WEB with the chat on top of the selected tab, away, back), then
            // thirty random steps
            let fixed = ["select", "push", "web", "native", "deselect", "select", "resign", "active", "pop", "push"]
            for step in fixed + (0..<30).map({ _ in steps[next(steps.count)] }) {
                trail.append(step)
                switch step {
                case "select": select(coach: true)
                case "deselect": select(coach: false)
                case "push": _ = host.present("coach")
                case "pop": host.dismiss("coach")
                case "resign":
                    active = false
                    NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
                case "active":
                    active = true
                    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
                case "web":
                    r.native = false
                    host.selectionChanged()
                default:
                    r.native = true
                    host.selectionChanged()
                }
                try await idle("seed \(seed): \(trail)")
                let chatOnTop = r.nav.topViewController is ScreenHostingController
                let want = active && r.tabs.selectedIndex == 1 && r.native && chatOnTop ? ["presenting coach@P1 shell 61"] : []
                XCTAssertEqual(markerLines(), want, "seed \(seed): \(trail)")
            }
            r.webView.accessibilityElementsHidden = true   // as the root leaves it behind a native Coach tab
            if (seed == 7 ? 0 : seed == 61 ? 1 : next(2)) == 0 {   // one seed ends each way, the last at random
                host.tearDown()
                trail.append("teardown")
            } else {
                host.detachStack()
                trail.append("detach")
            }
            XCTAssertTrue(r.webView.accessibilityElementsHidden, "the web view's accessibility stays the root's: seed \(seed)")
            XCTAssertEqual(markerLines(), [], "seed \(seed): \(trail)")
            XCTAssertFalse(r.nav.topViewController is ScreenHostingController, "the chat popped: seed \(seed)")
            active = true
            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            r.tabs.selectedIndex = 1
            host.selectionChanged()
            XCTAssertEqual(markerLines(), [], "none comes back: seed \(seed): \(trail)")
            XCTAssertEqual(r.webView.leftWindow, 0, "seed \(seed)")
        }
    }

    /// The marker follows the app's activity in the stack too: `willResignActive` comes while the app still reads active,
    /// and a kill from the app switcher is no crash; back in use with the chat on top, the marker is back.
    func testStackTheMarkerFollowsTheAppsActivity() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertEqual(markerLines(), [], "resigning: no marker (the app still reads active then)")
        select(coach: false)
        select(coach: true)
        XCTAssertEqual(markerLines(), [], "still away: a selection writes none")
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"], "back with the chat on top")
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        XCTAssertEqual(markerLines(), [], "the background takes it away too")
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        r.native = false   // the Coach tab turned WEB with the chat still on the stack
        host.selectionChanged()
        XCTAssertEqual(markerLines(), [], "none in WEB")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// VoiceOver's escape on the pushed chat goes back as the overlay's does (Back, latched; Cancel in setup, the page
    /// asking first), and an escape the chat does not take goes no further: the navigation controller's own would pop a
    /// chat that offers no Back.
    func testStackVoiceOversEscapeGoesBackAndNoFurther() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        XCTAssertTrue(try XCTUnwrap(r.nav.topViewController).accessibilityPerformEscape(), "escape goes back")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        XCTAssertEqual(host.latched, ["coach"])
        host.dismiss("coach")
        var intake = try model("intake")
        intake.boot = "b-intake"
        host.update("coach", model: intake)
        host.present("coach")
        try await idle()
        XCTAssertTrue(try XCTUnwrap(r.nav.topViewController).accessibilityPerformEscape(), "escape during setup is Cancel")
        XCTAssertEqual(sent.last, .coachCancelIntake, "the page asks first")
        try await settle(0.1)
        XCTAssertTrue(host.isUp("coach"), "the chat stays until the page says")
        host.dismiss("coach")
        try await idle()
        var neither = try model()
        neither.boot = "b-neither"
        neither.header.back = false
        neither.header.cancel = false
        host.update("coach", model: neither)
        host.present("coach")
        try await idle()
        let before = sent.count
        XCTAssertTrue(try XCTUnwrap(r.nav.topViewController).accessibilityPerformEscape(), "taken, and nothing more")
        try await settle(0.2)
        XCTAssertTrue(host.isUp("coach"), "no Back offered: the chat stays")
        XCTAssertEqual(r.nav.viewControllers.count, 2)
        XCTAssertEqual(owner, ["coach"])
        XCTAssertEqual(sent.count, before)
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 9: the toast's anchor is the chat header's bottom while the chat is on top of the selected, unheld Coach
    /// tab and the status bar otherwise, reset at the pop; a forwarded confirm stands the stack down for VoiceOver until
    /// it is answered or closed stale.
    func testStackTheToastAnchorFollowsTheHeaderAndAConfirmStandsTheStackDown() async throws {
        FPFonts.register()
        let r = try await makeStack()
        XCTAssertNil(host.overlay.anchor, "no chat: under the status bar")
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        try await layOut(try XCTUnwrap(r.nav.topViewController))
        let reported = try await until { self.host.overlay.anchor != nil }
        XCTAssertTrue(reported, "the chat's header reports where it ends")
        let a = try XCTUnwrap(host.overlay.anchor)
        XCTAssertGreaterThan(a, 0)
        select(coach: false)
        XCTAssertNil(host.overlay.anchor, "Coach not selected: under the status bar")
        select(coach: true)
        XCTAssertEqual(host.overlay.anchor, a, "on top of the selected tab again: under the header")
        r.held = true
        host.selectionChanged()
        XCTAssertNil(host.overlay.anchor, "held: under the status bar")
        r.held = false
        host.selectionChanged()
        XCTAssertEqual(host.overlay.anchor, a)
        r.native = false   // the tab turned WEB with the chat still on the stack: no stack shows
        host.selectionChanged()
        XCTAssertNil(host.overlay.anchor, "WEB: under the status bar")
        r.native = true
        host.selectionChanged()
        XCTAssertEqual(host.overlay.anchor, a)
        let c = ConfirmRequest(id: "c1.b1", title: "Restore previous programme?", body: nil, confirm: "Restore", cancel: nil, tone: nil)
        host.confirm(c)
        XCTAssertTrue(r.nav.view.accessibilityElementsHidden, "the stack stands down under the confirm")
        XCTAssertTrue(host.overlay.tapConfirm(true))
        XCTAssertEqual(sent, [.confirm(id: "c1.b1", yes: true)])
        XCTAssertFalse(r.nav.view.accessibilityElementsHidden, "answered: read again")
        host.confirm(ConfirmRequest(id: "c2.b1", title: "Stop setup?", body: nil, confirm: nil, cancel: nil, tone: "accent"))
        XCTAssertTrue(r.nav.view.accessibilityElementsHidden)
        host.closeConfirmAsStale()
        XCTAssertFalse(r.nav.view.accessibilityElementsHidden, "closed stale: read again")
        XCTAssertEqual(sent, [.confirm(id: "c1.b1", yes: true)], "a stale confirm closes unanswered")
        host.dismiss("coach")
        try await idle()
        XCTAssertNil(host.overlay.anchor, "reset at the pop")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 10 (I13): a document start keeps the pushed chat on its model until the next document's, and hello's up
    /// names it; its marker follows the newest page build; popped, a document start lets the model go.
    func testStackADocumentStartKeepsThePushedChat() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        let chat = r.nav.topViewController
        host.forgetModels(exceptUp: true)   // a reload under the pushed chat
        XCTAssertNotNil(host.model("coach"), "drawn until the next document's resync")
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(host.shown, ["coach"])
        XCTAssertTrue(r.nav.topViewController === chat, "the chat stays on its stack")
        var next = try model()
        next.boot = "b-next"
        next.rev = 1
        host.update("coach", model: next)
        XCTAssertEqual(host.model("coach")?.boot, "b-next")
        XCTAssertTrue(r.nav.topViewController === chat)
        XCTAssertEqual(host.transitions, ["present coach"], "nothing popped or pushed")
        host.pageBuild = "P2"   // the next document is a newer page (an OTA)
        XCTAssertEqual(markerLines(), ["presenting coach@P2 shell 61"])
        host.dismiss("coach")
        try await idle()
        host.forgetModels(exceptUp: true)
        XCTAssertNil(host.model("coach"))
        XCTAssertFalse(host.present("coach"))
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 11: a push whose slot leaves the window mid-animation completes (after `stackOpTimeout` when nobody says
    /// so, at once when the root's selection is told) and the queue goes on; a dismissal queued behind a push not yet
    /// started cancels both, and a present queued behind a dismissal not yet started keeps the chat.
    func testStackAPushWhoseSlotLeavesTheWindowCompletes() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        XCTAssertEqual(r.nav.log, ["push animated"])
        try await settle(0.05)
        r.tabs.selectedIndex = 0   // the owner leaves mid-push and nobody says so
        host.dismiss("coach")      // the page's dismiss, queued behind the push
        try await settle(0.3)
        XCTAssertTrue(busy(), "still waiting: UIKit says nothing while the tab is away")
        XCTAssertTrue(host.isUp("coach"))
        let went = try await until { !self.busy() && !self.host.isUp("coach") }
        XCTAssertTrue(went, "the push taken as done after the timeout, and the queued pop ran")
        XCTAssertEqual(r.nav.log, ["push animated", "pop still"])
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        // told that the tab left (the root's coachShown): done at once
        select(coach: true)
        try await settle(0.1)
        host.present("coach")
        XCTAssertTrue(busy())
        select(coach: false)
        XCTAssertFalse(busy(), "the push is done the moment the stack leaves the window")
        XCTAssertTrue(host.isUp("coach"))
        select(coach: true)
        try await settle(0.1)
        host.dismiss("coach")   // under way
        host.present("coach")   // queued behind it
        host.dismiss("coach")   // cancels that present, which never started
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        let n = r.nav.log.count
        host.present("coach")   // under way
        host.dismiss("coach")   // queued behind it
        host.present("coach")   // cancels the queued dismissal: the chat just stays
        try await idle()
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(Array(r.nav.log[n...]), ["push animated"], "one push, nothing else")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// A pop ScreenHost did not make takes the chat while its push still waits for UIKit (no willShow counts then): the
    /// owner left mid-push and nobody said so, and the chat went out of the window, where UIKit says nothing. Once the
    /// push is done the chat is gone, and the page hears the owner's Back, never a chat counted up that is not there.
    func testStackAChatTakenWhileItsPushWaitsIsTheOwnersBack() async throws {
        let r = try await makeStack()
        host.stackOpTimeout = 0.5
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))   // in the window: waits for the chat's didShow
        try await settle(0.05)
        r.tabs.selectedIndex = 0   // the owner leaves mid-push, and nobody says so
        XCTAssertTrue(busy(), "still waiting for UIKit")
        r.nav.setViewControllers([r.home], animated: false)   // another takes the chat, out of the window
        XCTAssertEqual(r.nav.viewControllers.count, 1, "out of the window the stack changes at once")
        try await idle()
        XCTAssertFalse(host.isUp("coach"), "gone, as the stack says")
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        XCTAssertEqual(host.latched, ["coach"])
        XCTAssertEqual(host.transitions, ["present coach", "back coach"])
        XCTAssertEqual(markerLines(), [], "the marker goes with it")
        host.dismiss("coach")
        XCTAssertEqual(host.latched, [], "the page's dismiss closes the latch")
        XCTAssertTrue(host.present("coach"), "and the chat can go up again")
        try await idle()
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController)
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 12: leaving the stack (the fallback) pops the chat without animation, gives the stack its delegates back
    /// and leaves no marker; the next present is build 60's `.overFullScreen` overlay.
    func testStackDetachPopsAndTheNextChatIsTheOverlay() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
        host.detachStack()
        XCTAssertEqual(r.nav.viewControllers.count, 1, "the chat popped")
        XCTAssertEqual(r.nav.log.last, "set still", "without animation")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(markerLines(), [], "no marker left")
        XCTAssertNil(r.nav.delegate, "the stack's delegates given back")
        XCTAssertTrue(r.nav.interactivePopGestureRecognizer?.delegate === r.popDelegateBefore)
        if #available(iOS 26.0, *) {
            XCTAssertEqual(r.nav.interactiveContentPopGestureRecognizer?.isEnabled, r.contentPopBefore, "the content pop as it was")
        }
        XCTAssertFalse(host.stackAttached)
        XCTAssertEqual(host.describe()["mode"] as? String, "overlay")
        XCTAssertEqual(owner, [], "no Back for the page: the bridge's screens.off tells it")
        XCTAssertEqual(host.transitions.last, "drop coach")
        XCTAssertTrue(host.present("coach"))
        try await settle()
        XCTAssertEqual(stand.log, ["present style 5 over UIViewController"], "a later chat goes up .overFullScreen")
        XCTAssertEqual(stand.shown.last?.modalPresentationStyle, .overFullScreen)
        XCTAssertEqual(covered, [true], "the overlay's own covered hook again")
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// The fallback drops what was queued: a push still waiting does not come back as the overlay, and a Back the page
    /// refuses after the fallback brings nothing back (the fallback turns the chat off for the document).
    func testStackNothingQueuedSurvivesTheDetach() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        host.dismiss("coach")                  // the pop under way
        XCTAssertTrue(host.present("coach"))   // queued behind it
        host.detachStack()
        try await settle()
        XCTAssertEqual(stand.log, [], "the queued push did not come back as the overlay")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertFalse(busy())
        XCTAssertEqual(r.webView.leftWindow, 0)
        let r2 = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        host.userBack("coach")
        try await idle()
        XCTAssertEqual(host.latched, ["coach"])
        host.detachStack()
        XCTAssertEqual(host.latched, [])
        host.userBackRefused("coach")
        try await settle()
        XCTAssertEqual(stand.log, [], "a refused Back after the fallback brings nothing back")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r2.webView.leftWindow, 0)
    }

    /// H5 test 13 (D9): in a 390 x 844 window the pushed chat's composer ends at least 8 pt above the tab bar's top, and
    /// the bar's items stay hit-testable over the chat.
    func testStackTheComposerSitsAboveTheBarAndTheBarStaysReachable() async throws {
        FPFonts.register()
        let r = try await makeStack()
        XCTAssertEqual(window.bounds.size, CGSize(width: 390, height: 844))
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        let chat = try XCTUnwrap(r.nav.topViewController)
        try await layOut(chat)
        let input = try XCTUnwrap(host.firstTextInput(), "the composer, on top of the stack")
        XCTAssertTrue(input.isDescendant(of: chat.view))
        let f = input.convert(input.bounds, to: nil)
        let bar = r.tabs.tabBar.convert(r.tabs.tabBar.bounds, to: nil)
        XCTAssertGreaterThan(bar.height, 0)
        XCTAssertLessThanOrEqual(f.maxY, bar.minY - 8, "the composer \(f) ends 8 pt or more above the bar \(bar)")
        XCTAssertNotNil(host.conversationScroll(), "the pushed chat's conversation")
        let items = Self.controls(in: r.tabs.tabBar)
        XCTAssertGreaterThanOrEqual(items.count, 2, "the bar's items")
        for item in items {
            let p = item.convert(CGPoint(x: item.bounds.midX, y: item.bounds.midY), to: nil)
            let hit = window.hitTest(p, with: nil)
            XCTAssertTrue(hit?.isDescendant(of: r.tabs.tabBar) == true,
                          "\(type(of: item)) at \(p) hits \(hit.map { String(describing: type(of: $0)) } ?? "nothing")")
        }
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// H5 test 14 (I1): through every kind of push, pop, selection, hold, Back, refusal, edge back, foreign pop, document
    /// start, confirm, detach and the overlay after it, the page's web view never leaves its window.
    func testStackTheWebViewNeverLeavesItsWindow() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        select(coach: false)
        select(coach: true)
        host.userBack("coach")
        try await idle()
        host.userBackRefused("coach")
        try await idle()
        host.simulateEdgeBack("coach", progress: 0.6, finish: true) { _ in }
        try await idle()
        host.dismiss("coach")
        select(coach: false)
        host.present("coach")
        try await idle()
        r.held = true
        select(coach: true)
        host.dismiss("coach")
        try await idle()
        host.present("coach")
        try await idle()
        host.forgetModels(exceptUp: true)
        host.confirm(ConfirmRequest(id: "c1", title: "Sure?", body: nil, confirm: nil, cancel: nil, tone: nil))
        _ = host.overlay.tapConfirm(false)
        r.nav.popViewController(animated: true)
        try await idle()
        host.dismiss("coach")
        host.present("coach")
        try await idle()
        host.detachStack()
        host.present("coach")
        try await settle()
        host.dismiss("coach")
        try await settle()
        XCTAssertEqual(r.webView.leftWindow, 0, "the page's web view never left its window")
        XCTAssertNotNil(r.webView.window)
    }
}
#endif
