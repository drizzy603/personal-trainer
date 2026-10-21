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
    /// Every controller dismissed through it, in order.
    private(set) var dismissed: [UIViewController] = []

    func present(_ screen: UIViewController, from presenter: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        log.append("present style \(screen.modalPresentationStyle.rawValue) over \(type(of: presenter))")
        shown.append(screen)
        DispatchQueue.main.async { completion() }
    }

    func dismiss(_ screen: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        log.append("dismiss")
        dismissed.append(screen)
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

/// Stands in for UIKit's coordinator of the owner's interactive pop where a case orders UIKit's words itself (its end
/// before or after didShow, after the stack was left): ScreenHost follows the transition through it, and the case says
/// how it ends. StackPopDriver runs the pop with UIKit's own coordinator.
@MainActor
final class StandInCoordinator: NSObject, UIViewControllerTransitionCoordinator {
    private var ends: [(UIViewControllerTransitionCoordinatorContext) -> Void] = []
    private var cancelledEnd = false
    /// The owner's finger drives it (the interactive pop); false for a transition of UIKit's own that runs by itself.
    var byFinger = true

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
    var initiallyInteractive: Bool { byFinger }
    var isInterruptible: Bool { false }
    var isInteractive: Bool { byFinger }
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

/// The pop slide UIKit runs while a case drives the owner's interactive pop with UIKit's own coordinator (StackPopDriver).
final class StackPopSlide: NSObject, UIViewControllerAnimatedTransitioning {
    func transitionDuration(using ctx: UIViewControllerContextTransitioning?) -> TimeInterval { 0.35 }

    func animateTransition(using ctx: UIViewControllerContextTransitioning) {
        guard let from = ctx.view(forKey: .from), let to = ctx.view(forKey: .to),
              let toVC = ctx.viewController(forKey: .to) else { return ctx.completeTransition(false) }
        to.frame = ctx.finalFrame(for: toVC)
        ctx.containerView.insertSubview(to, belowSubview: from)
        let width = ctx.containerView.bounds.width
        UIView.animate(withDuration: 0.35, delay: 0, options: [.curveLinear], animations: {
            from.transform = CGAffineTransform(translationX: width, y: 0)
        }, completion: { _ in
            from.transform = .identity
            ctx.completeTransition(!ctx.transitionWasCancelled)
        })
    }
}

/// The owner's interactive pop with UIKit's own coordinator, without a finger: a percent-driven interaction drives the
/// pop as the finger drives the system's edge pop (UIKit's own is a UIPercentDrivenInteractiveTransition). It stands in
/// as the stack's delegate for the case, passing UIKit's words on to ScreenHost as they come.
@MainActor
final class StackPopDriver: NSObject, UINavigationControllerDelegate {
    weak var host: ScreenHost?
    let interaction = UIPercentDrivenInteractiveTransition()

    init(host: ScreenHost) {
        self.host = host
    }

    func navigationController(_ nav: UINavigationController, willShow vc: UIViewController, animated: Bool) {
        host?.navigationController(nav, willShow: vc, animated: animated)
    }

    func navigationController(_ nav: UINavigationController, didShow vc: UIViewController, animated: Bool) {
        host?.navigationController(nav, didShow: vc, animated: animated)
    }

    func navigationController(_ nav: UINavigationController, animationControllerFor operation: UINavigationController.Operation,
                              from fromVC: UIViewController, to toVC: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        operation == .pop ? StackPopSlide() : nil
    }

    func navigationController(_ nav: UINavigationController,
                              interactionControllerFor animator: UIViewControllerAnimatedTransitioning) -> UIViewControllerInteractiveTransitioning? {
        interaction
    }
}

/// A navigation controller that records how each push, pop and replacement was asked for (animated or still), and
/// whether a transition of UIKit's own reached the stack then.
@MainActor
final class StackRecordingNav: UINavigationController {
    private(set) var log: [String] = []
    /// For each entry of `log`: whether UIKit's own transition coordinator (never a stand-in's) was set when it was asked.
    private(set) var during: [Bool] = []
    var recording = false
    /// A coordinator standing in for UIKit's while a case makes the owner's interactive pop (StandInCoordinator).
    var standInCoordinator: UIViewControllerTransitionCoordinator?
    /// UIKit dropping a push or pop without a word (as it drops an animated one while another transition runs), stood
    /// in: the next one of that kind ("push", "pop") is recorded as dropped and never made.
    var dropNext: String?
    /// A UIKit that says willShow and didShow inside a still replacement of the array, stood in (iOS 27 says both on a
    /// later turn, ZP3 of the H5 review round's probes).
    var speaksInside = false
    /// A controller presented over the tab whose presentation is over (the chat's photo picker up, a share sheet up: no
    /// transition under way), stood in: this host has no window scene, so a presentation never ends here.
    var standInPresented: UIViewController?
    /// UIKit holding each push, pop and replacement asked while the stack is out of the window behind a transition of its
    /// own that it ends only in a window, stood in where ScreenHost's layout pass cannot end it: each is recorded as held
    /// and kept, with a transition standing in as under way, and all are made in order by `makeHeld()` (UIKit makes them
    /// once the stack is in a window again; this host sends the stack no appearance callback to hang that on).
    var holdsAway = false
    private var heldOps: [() -> Void] = []
    private lazy var heldTransition: StandInCoordinator = {
        let c = StandInCoordinator()
        c.byFinger = false
        return c
    }()

    override var transitionCoordinator: UIViewControllerTransitionCoordinator? {
        standInCoordinator ?? (heldOps.isEmpty ? super.transitionCoordinator : heldTransition)
    }

    override var presentedViewController: UIViewController? { standInPresented ?? super.presentedViewController }

    private func note(_ entry: String) {
        log.append(entry)
        during.append(super.transitionCoordinator != nil)
    }

    /// Whether UIKit holds this op (stood in): out of the window while `holdsAway`.
    private func held(_ entry: String, _ make: @escaping () -> Void) -> Bool {
        guard holdsAway, view.window == nil else { return false }
        note(entry + " held")
        heldOps.append { [weak self] in
            self?.note(entry + " made")
            make()
        }
        return true
    }

    private func superPush(_ vc: UIViewController, animated: Bool) { super.pushViewController(vc, animated: animated) }
    private func superPop(animated: Bool) { _ = super.popViewController(animated: animated) }
    private func superSet(_ vcs: [UIViewController], animated: Bool) { super.setViewControllers(vcs, animated: animated) }

    /// UIKit makes what it held, in order, the stack in a window again.
    func makeHeld() {
        let ops = heldOps
        heldOps = []
        ops.forEach { $0() }
    }

    /// UIKit never makes what it held.
    func forgetHeld() {
        heldOps = []
    }

    override func pushViewController(_ viewController: UIViewController, animated: Bool) {
        if dropNext == "push" {
            dropNext = nil
            note("push dropped")
            return
        }
        let entry = animated ? "push animated" : "push still"
        if held(entry, { [weak self] in self?.superPush(viewController, animated: animated) }) { return }
        if recording { note(entry) }
        super.pushViewController(viewController, animated: animated)
    }

    @discardableResult
    override func popViewController(animated: Bool) -> UIViewController? {
        if dropNext == "pop" {
            dropNext = nil
            note("pop dropped")
            return nil
        }
        let entry = animated ? "pop animated" : "pop still"
        if held(entry, { [weak self] in self?.superPop(animated: animated) }) { return nil }
        if recording { note(entry) }
        return super.popViewController(animated: animated)
    }

    override func setViewControllers(_ viewControllers: [UIViewController], animated: Bool) {
        let entry = animated ? "set animated" : "set still"
        if held(entry, { [weak self] in self?.superSet(viewControllers, animated: animated) }) { return }
        if recording { note(entry) }
        super.setViewControllers(viewControllers, animated: animated)
        if speaksInside, !animated, let top = topViewController {
            delegate?.navigationController?(self, willShow: top, animated: false)
            delegate?.navigationController?(self, didShow: top, animated: false)
        }
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
    /// The stack's top when the hold was last released.
    var topAtRelease: UIViewController?
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

    /// What the root answers: Coach selected, the tab NATIVE, the hold, its release (which posts nothing to VoiceOver:
    /// StackState's rule for a hold a push ends).
    var state: StackState {
        StackState(selected: { [weak self] in self?.tabs.selectedIndex == 1 },
                   native: { [weak self] in self?.native ?? false },
                   held: { [weak self] in self?.held ?? false },
                   releaseHold: { [weak self] in
                       self?.releases += 1
                       self?.held = false
                       self?.topAtRelease = self?.nav.topViewController
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
/// going idle, never on a fixed time. The owner's interactive pop takes a finger: a percent-driven interaction drives it
/// with UIKit's own coordinator (`StackPopDriver`), and where a case orders UIKit's words itself the coordinator is
/// stood in (`StandInCoordinator`) on a stack out of the window, where UIKit adds no word of its own. What this host
/// cannot make is stood in on the stack (`StackRecordingNav`): a presentation that has ended (none ends here), UIKit
/// dropping an op, and UIKit holding ops asked while the stack is away. Bounds on time stretch on CI (`slack`).
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

    /// How much longer a bound on time is on CI: GitHub's shared runners are several times slower and stall at random
    /// (GitHub Actions sets CI; xcodebuild hands TEST_RUNNER_CI to a simulator's test process as CI), as in StoreTests.
    private static let slack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10

    /// Whether a transition is under way (the queue is busy).
    private func busy() -> Bool { host.describe()["busy"] as? Bool ?? true }

    /// The stack's state as `describe()` reports it.
    private func stackState(_ key: String) -> Any? { (host.describe()["stack"] as? [String: Any])?[key] }

    /// Polls every 20 ms until `ok` holds; false if it never did within `timeout` (times the CI factor). A loaded machine
    /// only waits longer.
    private func until(_ timeout: Double = 6, _ ok: () -> Bool) async throws -> Bool {
        let end = Date().addingTimeInterval(timeout * Self.slack)
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

    /// A transition over the tab root under way in this turn, as the chat's photo picker or a share sheet makes, going up
    /// or down: UIKit's transition coordinator reaches the Coach stack while it runs. (This host has no window scene, so
    /// a presentation never ends and the first one stays under way; where one ends, its dismissal is the next.)
    private func transitionOverTheRoot(_ r: StackRig, line: UInt = #line) {
        if r.nav.transitionCoordinator == nil {
            if let shown = r.container.presentedViewController {
                shown.dismiss(animated: true)
            } else {
                r.container.present(UIViewController(), animated: true)
            }
        }
        XCTAssertNotNil(r.nav.transitionCoordinator, "a transition under way over the Coach tab", line: line)
    }

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

    /// A push or pop in the window ends on UIKit's own `didShow` for the controller it shows (delta 14.6), never on its
    /// wait: with the wait out of reach (300 s), each ends within seconds on the selected, unheld NATIVE tab, VoiceOver
    /// hears each once it is done, and the owner's pop may begin once the push has ended.
    func testStackAPushAndAPopEndOnUIKitsDidShow() async throws {
        let r = try await makeStack()
        host.stackOpTimeout = 300
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))
        XCTAssertTrue(busy(), "the push waits for UIKit's word")
        let pushed = try await until(5) { !self.busy() }
        XCTAssertTrue(pushed, "the push ended on UIKit's didShow for the chat, not on its wait")
        let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
        XCTAssertEqual(posts.count, 1)
        XCTAssertTrue(posts.last === chat.view, "VoiceOver hears the chat once it is shown")
        XCTAssertTrue(host.gestureRecognizerShouldBegin(try XCTUnwrap(r.nav.interactivePopGestureRecognizer)),
                      "the owner's pop may begin: nothing under way")
        host.dismiss("coach")
        XCTAssertTrue(busy(), "the pop waits for UIKit's word")
        let popped = try await until(5) { !self.busy() }
        XCTAssertTrue(popped, "the pop ended on UIKit's didShow for the controller below, not on its wait")
        XCTAssertEqual(r.nav.log, ["push animated", "pop animated"])
        XCTAssertEqual(posts.count, 2)
        XCTAssertTrue(posts.last === r.home.view, "VoiceOver hears the stack's new top once it is shown")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// Editing ends in the stack's view before a push (a focused native field on the hub: its keys go before the chat
    /// covers it; contract 8.5, no first responder in a hidden view) and in the chat before its pop (the composer's keys
    /// go with it), each in the op's own turn.
    func testStackEditingEndsBeforeAPushAndAPop() async throws {
        FPFonts.register()
        let r = try await makeStack()
        let field = UITextField(frame: CGRect(x: 20, y: 200, width: 300, height: 44))
        r.home.view.addSubview(field)
        window.makeKey()
        try XCTSkipUnless(field.becomeFirstResponder() && field.isFirstResponder, "this host gives no first responder")
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))
        XCTAssertFalse(field.isFirstResponder, "the hub's field resigned in the push's turn")
        try await idle()
        let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
        try await layOut(chat)
        let box = try XCTUnwrap(host.firstTextInput() as? UITextView, "the chat's composer")
        XCTAssertTrue(box.becomeFirstResponder(), "the owner's tap into the composer")
        host.dismiss("coach")
        XCTAssertFalse(box.isFirstResponder, "the composer resigned in the pop's turn")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// VoiceOver hears the stack's new top only while the owner sees the stack. coachHome going off with the chat up
    /// takes the chat's screen off first (its pop starts on the NATIVE tab), then turns the tab WEB (the root hides the
    /// stack and shows the web view, contract 8.3): that pop ends unheard, never announcing the hub from a hidden stack. A
    /// pop asked while the tab is WEB is made without animation (nothing shows it) and is not heard either.
    func testStackAPopUnderAWebTabIsNotHeardNorAnimated() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        XCTAssertEqual(posts.count, 1, "the push is heard")
        host.dismiss("coach")   // the chat's screen off: its pop starts on the NATIVE tab
        r.native = false        // then the tab turns WEB, the stack hidden as H4 draws WEB
        r.nav.view.isHidden = true
        host.selectionChanged()
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(posts.count, 1, "nothing posted into the hidden stack")
        // NATIVE again and the chat pushed; then the tab WEB with the chat still on its stack, and the page's dismiss
        r.native = true
        r.nav.view.isHidden = false
        host.selectionChanged()
        host.present("coach")
        try await idle()
        XCTAssertEqual(posts.count, 2, "the push is heard")
        r.native = false
        r.nav.view.isHidden = true
        host.selectionChanged()
        host.dismiss("coach")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(r.nav.log, ["push animated", "pop animated", "push animated", "pop still"], "the pop under WEB is still")
        XCTAssertEqual(posts.count, 2, "nothing posted")
        XCTAssertEqual(owner, [])
        XCTAssertEqual(markerLines(), [])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// An op queued right behind another in the window slides like any push or pop on the selected tab. It runs a turn
    /// after UIKit's didShow ended the one before, never inside it (UIKit's coordinator is still set there, and UIKit puts
    /// an animated op asked there off). And the stack's own push or pop under way is no transition over the tab: when a
    /// wait runs out before UIKit's didShow (a loaded machine; here a wait of 0 s), the op behind it is asked while that
    /// transition still runs, and UIKit takes it animated at once. Only a presentation over the tab makes an op still
    /// (testStackAPushOrPopDuringAnotherTransitionGoesWithoutAnimation).
    func testStackAnOpQueuedBehindAnotherSlides() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))   // the push under way, waiting for UIKit's didShow
        host.dismiss("coach")                  // right behind it: the push has started, so nothing is cancelled
        XCTAssertEqual(host.describe()["ops"] as? Int, 1, "queued behind the push")
        try await idle()
        XCTAssertEqual(r.nav.log, ["push animated", "pop animated"], "the page's dismiss behind a push slides")
        XCTAssertEqual(r.nav.viewControllers.count, 1, "UIKit took the pop")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertTrue(host.present("coach"))
        try await idle()
        host.dismiss("coach")                  // the pop under way
        XCTAssertTrue(host.present("coach"))   // right behind it
        try await idle()
        XCTAssertEqual(Array(r.nav.log.suffix(2)), ["pop animated", "push animated"], "a present behind a pop slides")
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController, "UIKit took the push")
        XCTAssertTrue(host.isUp("coach"))
        // each wait runs out at once: the op behind it is asked while the stack's own transition still runs
        host.stackOpTimeout = 0
        var midway: Set<String> = []
        for attempt in 1...4 where midway.count < 2 {   // a stalled machine can let UIKit's transition end first
            try await settle(0.8)                  // UIKit's own transitions over
            var n = r.nav.log.count
            host.dismiss("coach")
            XCTAssertTrue(host.present("coach"))   // behind the pop
            try await idle()
            XCTAssertEqual(Array(r.nav.log[n...]), ["pop animated", "push animated"], "attempt \(attempt): a present behind a pop")
            if r.nav.during.last == true { midway.insert("push") }
            host.dismiss("coach")
            try await idle()
            try await settle(0.8)
            n = r.nav.log.count
            XCTAssertTrue(host.present("coach"))
            host.dismiss("coach")                  // behind the push
            try await idle()
            XCTAssertEqual(Array(r.nav.log[n...]), ["push animated", "pop animated"], "attempt \(attempt): a dismiss behind a push")
            if r.nav.during.last == true { midway.insert("pop") }
            XCTAssertTrue(host.present("coach"))
            try await idle()
        }
        XCTAssertEqual(midway, ["push", "pop"], "each asked while the stack's own transition still ran")
        try await settle(0.8)
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 1, "ScreenHost and the stack agree")
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController)
        XCTAssertEqual(owner, [], "nobody's Back")
        XCTAssertEqual(failedScreens, [], "nothing refused")
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
    /// under way (never at the root); a pop ScreenHost did not make, once finished, is the owner's Back once; UIKit's
    /// word for another controller while the chat is still in the stack starts no pop. The cancelled pop is
    /// testStackTheOwnersInteractivePopWithUIKitsCoordinator's (let go in the window) and
    /// testStackTheOwnersInteractivePopEndsAsUIKitSays's (UIKit's words in either order): in UIKit's order the chat leaves
    /// the array before willShow, which this case's stack cannot stage without UIKit's own coordinator.
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
        // UIKit's willShow for the root while the chat is still in the stack (it never left the array: no pop began),
        // then the chat shown: nothing
        host.present("coach")
        try await idle()
        let chat = try XCTUnwrap(r.nav.topViewController)
        host.navigationController(r.nav, willShow: r.home, animated: true)
        XCTAssertTrue((host.describe()["stack"] as? [String: Any])?["foreignPop"] is NSNull, "no pop followed")
        XCTAssertFalse(busy())
        host.navigationController(r.nav, didShow: chat, animated: true)
        try await settle(0.1)
        XCTAssertEqual(owner, ["coach"], "no pop: the chat never left the stack")
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
        // finished: the coordinator's end first; a page's dismiss queued behind the finger closes the latch after it, a
        // turn later (never inside UIKit's word on the pop's end, as after every push and pop)
        (chat, c) = try beginPop()
        host.dismiss("coach")
        XCTAssertEqual(host.describe()["ops"] as? Int, 1, "queued behind the owner's finger")
        c.end(cancelled: false)
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(owner, ["coach"], "the owner's Back")
        XCTAssertEqual(host.transitions.last, "edge back coach")
        XCTAssertTrue(busy(), "the page's dismiss waits for the next turn")
        try await idle()
        XCTAssertEqual(host.latched, [], "the page's dismiss, queued meanwhile, closed the latch")
        XCTAssertEqual(host.transitions.last, "edge back coach", "and took nothing more down")
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

    /// H5 test 5 with UIKit's own coordinator (StackPopDriver): the owner's interactive pop holds the queue while it runs.
    /// Let go in the window, it is cancelled: nothing for the page, the chat stays on top with its marker, and the queue
    /// goes on. Cut by a selection mid-pop (a second finger on the bar, the page's selectTab, a deep link), UIKit ends it
    /// out of the window at once, as the owner lets go, as the pop finishes, or with no word (UIKit finishes it): the
    /// page's dismiss queued behind the finger then runs, and ScreenHost and the stack agree. Nothing waits for the owner
    /// to come back to Coach.
    func testStackTheOwnersInteractivePopWithUIKitsCoordinator() async throws {
        for how in ["let go", "cut, then let go", "cut, then finished", "cut, no word"] {
            let r = try await makeStack()
            host.update("coach", model: try model())
            XCTAssertTrue(host.present("coach"))
            try await idle()
            let driver = StackPopDriver(host: host)
            r.nav.delegate = driver
            r.nav.popViewController(animated: true)   // the finger's pop: UIKit begins it on a later turn
            let began = try await until { (self.host.describe()["stack"] as? [String: Any])?["foreignPop"] as? String == "interactive" }
            XCTAssertTrue(began, "\(how): the owner's pop is followed")
            driver.interaction.update(0.3)
            XCTAssertTrue(busy(), "\(how): the queue waits for the finger")
            XCTAssertTrue(host.isUp("coach"), "\(how): nothing decided while the finger is down")
            let cut = how.hasPrefix("cut")
            if cut {
                UIView.performWithoutAnimation { r.tabs.selectedIndex = 0 }   // the funnel's selection, mid-pop
                host.selectionChanged()
                host.dismiss("coach")   // the page left Coach: its dismiss waits behind the finger
                XCTAssertEqual(host.describe()["ops"] as? Int, 1, "\(how): queued behind the finger")
            }
            if how.hasSuffix("let go") { driver.interaction.cancel() }
            if how.hasSuffix("finished") { driver.interaction.finish() }
            let drained = try await until { !self.busy() && self.host.describe()["ops"] as? Int == 0 }
            XCTAssertTrue(drained, "\(how): UIKit ended the pop and the queue went on")
            let finished = host.transitions.contains("edge back coach")
            let chats = r.nav.viewControllers.filter { $0 is ScreenHostingController }.count
            XCTAssertEqual(chats, host.isUp("coach") ? 1 : 0, "\(how): ScreenHost and the stack agree")
            XCTAssertEqual(owner, finished ? ["coach"] : [], "\(how): the owner's Back only for a finished pop")
            XCTAssertEqual(host.latched, [], "\(how): the page's dismiss closed any latch")
            switch how {
            case "let go":
                XCTAssertFalse(finished)
                XCTAssertTrue(r.nav.topViewController is ScreenHostingController, "let go: the chat stays on top")
                XCTAssertEqual(host.transitions.last, "edge back cancelled coach")
                XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
                host.dismiss("coach")
                try await idle()
                XCTAssertFalse(host.isUp("coach"), "the queue goes on")
            case "cut, then let go":
                XCTAssertFalse(finished)
                XCTAssertEqual(Array(host.transitions.suffix(2)), ["edge back cancelled coach", "dismiss coach"])
            case "cut, then finished":
                XCTAssertTrue(finished)
            default:
                break   // UIKit's own end, either way (iOS 27 finishes it)
            }
            XCTAssertFalse(host.isUp("coach"), "\(how)")
            if cut { XCTAssertEqual(markerLines(), [], "\(how): Coach not selected") }
            r.nav.delegate = host
            owner = []
            XCTAssertEqual(r.webView.leftWindow, 0, "\(how)")
        }
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

    /// The page's dismiss while Coach is not selected pops without animation (nothing shows the stack) and is done at
    /// once. The case lets UIKit end its push first, so that only the selection decides, whatever UIKit's coordinator did.
    func testStackAPopWhileCoachIsAwayIsNotAnimated() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        select(coach: false)
        let over = try await until { r.nav.transitionCoordinator == nil }
        XCTAssertTrue(over, "UIKit's push over")
        host.dismiss("coach")
        XCTAssertFalse(busy(), "done at once: UIKit says nothing while the tab is away")
        XCTAssertEqual(r.nav.log, ["push animated", "pop still"], "no slide where nobody sees the stack")
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(posts.count, 1, "VoiceOver stays where the owner is: only the push on the selected tab was heard")
        XCTAssertEqual(markerLines(), [])
        XCTAssertEqual(owner, [])
        select(coach: true)
        XCTAssertTrue(r.nav.topViewController === r.home, "the home on top when Coach is back")
        XCTAssertEqual(markerLines(), [])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// A held push (Today's Ask, a resume, a warm share: the root keeps the home blank for it) is heard once, when UIKit
    /// has shown the chat: ScreenHost's post is the one (the root's release posts nothing: StackState's rule), and the
    /// hold ends right after the push, the chat already on top, so no frame of the home shows between.
    func testStackAHeldPushIsHeardOnceWhenItIsDone() async throws {
        let r = try await makeStack()
        var placed: [Bool] = []
        host.postScreenChanged = { [weak self] arg in
            self?.posts.append((arg as AnyObject?) ?? NSNull())
            placed.append((arg as? UIView)?.window != nil)
        }
        host.update("coach", model: try model())
        r.held = true
        XCTAssertTrue(host.present("coach"))
        XCTAssertEqual(r.releases, 1, "the push ends the hold")
        XCTAssertTrue(r.topAtRelease is ScreenHostingController, "the chat already on top when the hold ends")
        XCTAssertEqual(posts.count, 0, "nothing heard before UIKit has shown the chat")
        try await idle()
        let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
        XCTAssertEqual(posts.count, 1, "heard once")
        XCTAssertTrue(posts.first === chat.view, "the chat")
        XCTAssertEqual(placed, [true], "posted once UIKit has placed the chat in the window")
        host.navigationController(r.nav, didShow: chat, animated: false)   // UIKit's didShow again
        XCTAssertEqual(posts.count, 1)
        XCTAssertEqual(r.nav.log, ["push still"])
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

    /// H5 test 11: a push whose slot leaves the window before UIKit has shown it completes (after `stackOpTimeout` when
    /// nobody says so, at once when the root's selection is told) and the queue goes on, the pop behind it still (Coach is
    /// not selected) and taken at once (ScreenHost ends UIKit's push out of the window first); a dismissal queued behind a
    /// push not yet started cancels both, and a present queued behind a dismissal not yet started keeps the chat. The cut
    /// comes in the push's own turn, so UIKit never shows the chat first however late the case wakes (probe61 Q6: an
    /// animated push and a tab switch in one turn get no didShow while away), and the wait stretches on CI.
    func testStackAPushWhoseSlotLeavesTheWindowCompletes() async throws {
        let r = try await makeStack()
        host.stackOpTimeout = 2 * Self.slack
        host.update("coach", model: try model())
        host.present("coach")
        XCTAssertEqual(r.nav.log, ["push animated"])
        UIView.performWithoutAnimation { r.tabs.selectedIndex = 0 }   // the owner leaves in the push's turn, and nobody says so
        XCTAssertNotNil(r.nav.transitionCoordinator, "UIKit's push not begun: it waits for a layout in a window")
        host.dismiss("coach")      // the page's dismiss, queued behind the push
        let cut = Date()
        try await settle(0.3)
        if Date().timeIntervalSince(cut) < host.stackOpTimeout {   // a stalled wake-up may come after the wait ran out
            XCTAssertTrue(busy(), "still waiting: UIKit says nothing while the tab is away")
            XCTAssertTrue(host.isUp("coach"))
        }
        let went = try await until { !self.busy() && !self.host.isUp("coach") }
        XCTAssertTrue(went, "the push taken as done after the timeout, and the queued pop ran")
        XCTAssertEqual(r.nav.log, ["push animated", "pop still"])
        XCTAssertEqual(r.nav.viewControllers.count, 1, "UIKit took the pop at once out of the window")
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
    /// owner left in the push's own turn and nobody said so, and the chat went out of the window, where UIKit says
    /// nothing (the cut in the push's turn: UIKit never shows the chat first, however late the case wakes). Once the push
    /// is done the chat is gone, and the page hears the owner's Back, never a chat counted up that is not there.
    func testStackAChatTakenWhileItsPushWaitsIsTheOwnersBack() async throws {
        let r = try await makeStack()
        host.stackOpTimeout = 0.5 * Self.slack
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))   // in the window: waits for the chat's didShow
        UIView.performWithoutAnimation { r.tabs.selectedIndex = 0 }   // the owner leaves in the push's turn, and nobody says so
        XCTAssertNotNil(r.nav.transitionCoordinator, "UIKit's push not begun")
        XCTAssertTrue(busy(), "still waiting for UIKit")
        // another takes the chat, out of the window, once UIKit's push is over there (a layout pass ends it, as ScreenHost
        // ends it before an op of its own)
        r.nav.view.setNeedsLayout()
        r.nav.view.layoutIfNeeded()
        r.nav.setViewControllers([r.home], animated: false)
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

    /// A push whose slot leaves the window in its own turn, before UIKit began it (a tab tap or a deep link handled in the
    /// push's run-loop pass; told to ScreenHost or not): UIKit would hold every later push, pop and replacement of the
    /// stack behind that push until the tab is back, and play the push first there. ScreenHost ends it out of the window
    /// first, so the page's dismiss and the next present made while away are taken at once: one chat at most, ScreenHost
    /// and the stack agreeing at every step, nothing refused, nobody's Back, and the dismissed chat never in the window
    /// once Coach is back.
    func testStackAPushCutInItsOwnTurnHoldsNothingBack() async throws {
        for told in [true, false] {
            let r = try await makeStack()
            owner = []
            failedScreens = []
            host.update("coach", model: try model())
            func agree(_ step: String, line: UInt = #line) {
                let chats = r.nav.viewControllers.filter { $0 is ScreenHostingController }.count
                XCTAssertLessThanOrEqual(chats, 1, "told \(told), \(step): one chat at most", line: line)
                XCTAssertEqual(chats, host.isUp("coach") ? 1 : 0, "told \(told), \(step): ScreenHost and the stack agree", line: line)
            }
            XCTAssertTrue(host.present("coach"))
            let first = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
            if told { select(coach: false) } else { UIView.performWithoutAnimation { r.tabs.selectedIndex = 0 } }
            agree("the cut")
            host.dismiss("coach")   // the page left Coach
            try await idle()
            XCTAssertFalse(r.nav.viewControllers.contains(first), "told \(told): UIKit took the pop out of the window")
            XCTAssertFalse(host.isUp("coach"))
            agree("the dismiss")
            XCTAssertTrue(host.present("coach"))   // the chat again, while away
            try await idle()
            let second = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController, "told \(told): UIKit took the push")
            XCTAssertFalse(second === first)
            XCTAssertTrue(host.isUp("coach"))
            agree("the present while away")
            select(coach: true)
            for _ in 0..<60 {   // about a second of the tab back: UIKit plays nothing it held
                XCTAssertNil(first.viewIfLoaded?.window, "told \(told): the dismissed chat never in the window")
                agree("back on Coach")
                try await settle(0.02)
            }
            XCTAssertNotNil(second.view.window, "told \(told): the chat on screen")
            XCTAssertEqual(r.nav.log, ["push animated", "pop still", "push still"], "told \(told)")
            XCTAssertEqual(failedScreens, [], "told \(told): nothing refused")
            XCTAssertEqual(owner, [], "told \(told): nobody's Back")
            XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"], "told \(told)")
            XCTAssertEqual(r.webView.leftWindow, 0)
        }
    }

    /// UIKit holding an op asked out of the window all the same (stood in: a transition ScreenHost's layout pass cannot
    /// end): the op is not taken, so it is neither done nor refused while the tab is away. Its wait never runs out there
    /// (another word from the root while away changes nothing), no take-off runs and the ops behind it wait. Back on Coach
    /// UIKit makes it, its wait starts, and ScreenHost and the stack agree: nothing refused, nobody's Back, one chat at
    /// most. A held push, then a held pop.
    func testStackAnOpUIKitHoldsWhileAwayWaitsForTheTabsReturn() async throws {
        let r = try await makeStack(selected: false)
        host.update("coach", model: try model())
        host.stackOpTimeout = 0.3
        r.nav.holdsAway = true
        XCTAssertTrue(host.present("coach"))
        XCTAssertEqual(r.nav.log, ["push still held"])
        XCTAssertTrue(busy(), "waiting for UIKit, which holds the push until the stack is in a window")
        XCTAssertEqual(stackState("waitHeldByUIKit") as? Bool, true)
        try await settle(0.4)
        host.selectionChanged()   // the root's word while Coach is away (its mode, another tab): the push still waits
        try await settle(0.4)     // more than twice the wait: nothing runs out while the tab is away
        XCTAssertTrue(busy())
        XCTAssertEqual(failedScreens, [], "never refused while away")
        XCTAssertTrue(host.isUp("coach"), "up, as the page asked; UIKit makes it later")
        host.dismiss("coach")   // behind the held push
        XCTAssertEqual(host.describe()["ops"] as? Int, 1, "queued behind the held push")
        host.stackOpTimeout = 5 * Self.slack
        select(coach: true)     // the tab back: the held push's wait starts
        r.nav.makeHeld()        // UIKit makes it; the pop behind it then runs on the selected tab
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(r.nav.log, ["push still held", "push still made", "pop animated"])
        XCTAssertEqual(failedScreens, [])
        XCTAssertEqual(owner, [])
        // a held pop: no take-off while away, and a present behind it waits; back on Coach the chat is up again, once
        host.present("coach")
        try await idle()
        let before = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
        select(coach: false)
        host.stackOpTimeout = 0.3
        host.dismiss("coach")
        XCTAssertEqual(r.nav.log.last, "pop still held")
        XCTAssertTrue(busy())
        try await settle(0.4)
        host.selectionChanged()
        try await settle(0.4)
        XCTAssertTrue(busy(), "the held pop waits for the tab")
        XCTAssertFalse(r.nav.log.contains("set still"), "no take-off while away")
        XCTAssertTrue(host.isUp("coach"), "the chat stays counted up while UIKit holds its pop")
        XCTAssertTrue(r.nav.viewControllers.contains(before))
        XCTAssertTrue(host.present("coach"))   // the page wants it again: behind the held pop
        XCTAssertEqual(host.describe()["ops"] as? Int, 1)
        host.stackOpTimeout = 5 * Self.slack
        select(coach: true)
        r.nav.makeHeld()
        try await idle()
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 1, "one chat")
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController)
        XCTAssertFalse(r.nav.viewControllers.contains(before), "UIKit made the held pop")
        XCTAssertEqual(Array(r.nav.log.suffix(3)), ["pop still held", "pop still made", "push animated"])
        XCTAssertEqual(failedScreens, [])
        XCTAssertEqual(owner, [])
        // UIKit never making a push it held (stood in: the tab back and nothing made): its wait, started with the tab's
        // return, runs out, the push is refused (the page shows its own) and the queue goes on
        host.dismiss("coach")
        try await idle()
        select(coach: false)
        host.stackOpTimeout = 0.3 * Self.slack
        XCTAssertTrue(host.present("coach"))
        XCTAssertEqual(r.nav.log.last, "push still held")
        select(coach: true)
        r.nav.forgetHeld()
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(failedScreens, ["coach"], "refused once the wait that started with the tab's return ran out")
        XCTAssertEqual(owner, [])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// UIKit drops an animated push or pop asked while another transition runs over the Coach tab (a presentation going
    /// up or down: the chat's photo picker, a share sheet), without a word, and takes a still one at once. So each goes
    /// without animation then, and the stack and ScreenHost agree: no chat left on screen counted down (no marker, a
    /// dead Back, no edge pop, a second chat pushed over it), no push the page hears as the owner's Back.
    func testStackAPushOrPopDuringAnotherTransitionGoesWithoutAnimation() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        transitionOverTheRoot(r)
        host.dismiss("coach")   // the page's
        XCTAssertEqual(r.nav.log.last, "pop still")
        XCTAssertEqual(r.nav.viewControllers.count, 1, "the chat off the stack at once")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(markerLines(), [])
        XCTAssertEqual(owner, [])
        transitionOverTheRoot(r)
        XCTAssertTrue(host.present("coach"))
        XCTAssertEqual(r.nav.log.last, "push still")
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController, "pushed at once")
        try await idle()
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertEqual(owner, [], "nobody pressed Back")
        XCTAssertEqual(failedScreens, [])
        XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"])
        transitionOverTheRoot(r)
        host.coach.handle(.coachBack)   // the chat's own Back
        XCTAssertEqual(r.nav.log.last, "pop still")
        try await idle()
        XCTAssertEqual(r.nav.viewControllers.count, 1, "the chat off the stack")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(owner, ["coach"], "the page hears coach.back")
        XCTAssertEqual(host.latched, ["coach"])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// Something presented over the Coach tab once its presentation is over (the chat's photo picker up, a share sheet
    /// up: no transition under way any more; stood in, since this host never ends a presentation): UIKit drops an
    /// animated push or pop then, without a word, and takes a still one at once, so each goes without animation; the
    /// stack and ScreenHost agree, and nothing is refused or anybody's Back but the owner's own.
    func testStackAPushOrPopUnderAPresentedControllerGoesWithoutAnimation() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        r.nav.standInPresented = UIViewController()
        XCTAssertNil(r.nav.transitionCoordinator, "no transition under way")
        XCTAssertTrue(host.present("coach"))
        XCTAssertEqual(r.nav.log, ["push still"])
        try await idle()
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController)
        host.dismiss("coach")   // the page's
        XCTAssertEqual(r.nav.log.last, "pop still")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertTrue(host.present("coach"))
        try await idle()
        host.coach.handle(.coachBack)   // the chat's own Back
        XCTAssertEqual(r.nav.log.last, "pop still")
        try await idle()
        XCTAssertEqual(r.nav.log, ["push still", "pop still", "push still", "pop still"])
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertEqual(failedScreens, [], "nothing refused")
        XCTAssertEqual(owner, ["coach"], "only the owner's own Back")
        r.nav.standInPresented = nil   // the presentation gone: the chat slides again
        host.dismiss("coach")
        XCTAssertTrue(host.present("coach"))
        try await idle()
        XCTAssertEqual(r.nav.log.last, "push animated")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// A pop UIKit leaves undone all the same (stood in) still takes the chat off: at the wait's end the chat left in the
    /// stack comes off without animation, its record gone first, so UIKit's word on that change (inside the call, stood
    /// in, or after it, as iOS 27 says it) is nobody's Back; the owner's Back the same way is the owner's, once; the next
    /// chat goes up alone.
    func testStackAPopUIKitDropsStillTakesTheChatOff() async throws {
        let r = try await makeStack()
        host.stackOpTimeout = 0.3
        host.update("coach", model: try model())
        host.present("coach")
        try await idle()
        r.nav.dropNext = "pop"
        r.nav.speaksInside = true
        host.dismiss("coach")
        XCTAssertEqual(r.nav.viewControllers.count, 2, "UIKit made nothing of it")
        XCTAssertTrue(host.isUp("coach"), "until the wait ends")
        try await idle()
        r.nav.speaksInside = false
        try await settle(0.2)   // UIKit's own word on the change comes after it
        XCTAssertEqual(r.nav.log, ["push animated", "pop dropped", "set still"])
        XCTAssertEqual(r.nav.viewControllers.count, 1, "the chat taken off")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(owner, [], "the page's own dismiss: nobody's Back")
        XCTAssertEqual(host.latched, [])
        XCTAssertEqual(host.transitions, ["present coach", "dismiss coach"])
        XCTAssertEqual(markerLines(), [])
        XCTAssertTrue(posts.last === r.home.view, "VoiceOver hears the stack's new top")
        host.present("coach")
        try await idle()
        r.nav.dropNext = "pop"
        host.userBack("coach")
        try await idle()
        try await settle(0.2)
        XCTAssertEqual(r.nav.viewControllers.count, 1)
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(owner, ["coach"], "the owner's Back, once")
        XCTAssertEqual(host.latched, ["coach"])
        host.dismiss("coach")
        XCTAssertTrue(host.present("coach"))
        try await idle()
        XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 1, "one chat")
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// A present queued behind a pop UIKit dropped (stood in) goes up. The take-off's still change ends that pop, and the
    /// push runs a turn later, never in the same turn: UIKit drops an animated push asked in the turn of a still change of
    /// the stack, without a word, and the page would hear the chat could not go up (coach off for the document). UIKit's
    /// word on the take-off comes inside the change (stood in) or after it (iOS 27).
    func testStackAPresentQueuedBehindADroppedPopGoesUp() async throws {
        for inside in [false, true] {
            let r = try await makeStack()
            owner = []
            failedScreens = []
            host.stackOpTimeout = 0.3
            host.update("coach", model: try model())
            host.present("coach")
            try await idle()
            r.nav.dropNext = "pop"
            r.nav.speaksInside = inside
            host.dismiss("coach")                  // its pop dropped
            XCTAssertTrue(host.present("coach"))   // queued behind it
            XCTAssertEqual(host.describe()["ops"] as? Int, 1, "inside \(inside): queued behind the pop")
            try await idle()
            r.nav.speaksInside = false
            try await settle(0.2)   // UIKit's own word on the changes
            XCTAssertEqual(r.nav.log, ["push animated", "pop dropped", "set still", "push animated"], "inside \(inside)")
            XCTAssertTrue(host.isUp("coach"), "inside \(inside): the queued present went up")
            XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 1, "inside \(inside): one chat, in the stack")
            XCTAssertTrue(r.nav.topViewController is ScreenHostingController, "inside \(inside)")
            XCTAssertEqual(failedScreens, [], "inside \(inside): nothing refused")
            XCTAssertEqual(owner, [], "inside \(inside): nobody's Back")
            XCTAssertEqual(host.transitions, ["present coach", "dismiss coach", "present coach"], "inside \(inside)")
            XCTAssertEqual(markerLines(), ["presenting coach@P1 shell 61"], "inside \(inside)")
            XCTAssertEqual(r.webView.leftWindow, 0, "inside \(inside)")
        }
    }

    /// A push UIKit never takes (stood in) is refused, as an overlay UIKit refuses: not up, the page told it could not go
    /// up (it shows its own), and never the owner's Back; the queue goes on and the next present goes up. Out of the
    /// window, with no transition of UIKit's under way (none to hold it behind), the push is done at once, and refused at
    /// once (one UIKit holds is testStackAnOpUIKitHoldsWhileAwayWaitsForTheTabsReturn's).
    func testStackAPushUIKitDropsIsRefusedNotTheOwnersBack() async throws {
        let r = try await makeStack()
        host.stackOpTimeout = 0.3
        host.update("coach", model: try model())
        r.nav.dropNext = "push"
        XCTAssertTrue(host.present("coach"))
        XCTAssertTrue(busy(), "waiting for UIKit's word")
        try await idle()
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(failedScreens, ["coach"], "the page shows its own")
        XCTAssertEqual(owner, [], "nobody pressed Back")
        XCTAssertEqual(host.latched, [])
        XCTAssertEqual(host.transitions, ["present coach", "refused coach"])
        XCTAssertEqual(markerLines(), [])
        XCTAssertEqual(posts.count, 0)
        XCTAssertTrue(host.present("coach"))
        try await idle()
        XCTAssertTrue(host.isUp("coach"))
        XCTAssertTrue(r.nav.topViewController is ScreenHostingController)
        XCTAssertEqual(r.nav.log, ["push dropped", "push animated"])
        XCTAssertEqual(posts.count, 1, "VoiceOver hears the chat that went up")
        host.dismiss("coach")
        try await idle()
        select(coach: false)
        let over = try await until { r.nav.transitionCoordinator == nil }
        XCTAssertTrue(over, "UIKit's pop over")
        r.nav.dropNext = "push"
        XCTAssertTrue(host.present("coach"))
        XCTAssertFalse(busy(), "done at once out of the window")
        XCTAssertFalse(host.isUp("coach"))
        XCTAssertEqual(failedScreens, ["coach", "coach"])
        XCTAssertEqual(owner, [])
        XCTAssertEqual(r.webView.leftWindow, 0)
    }

    /// The chat leaving the stack takes along what it presented (its photo picker: SwiftUI asks the chat's controller and
    /// UIKit presents it from the tab root, so a pop alone left it over the next screen, where a photo picked reaches no
    /// chat), as build 60's overlay dismissal takes it along: at the page's dismiss, and at the fallback.
    func testStackTheChatLeavingTakesAlongWhatItPresented() async throws {
        for leave in ["dismiss", "detach"] {
            let r = try await makeStack()
            stand = StandInPresenting()
            host.presenting = stand
            host.update("coach", model: try model())
            XCTAssertTrue(host.present("coach"))
            try await idle()
            let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
            let picker = UIViewController()
            chat.present(picker, animated: false)   // the chat's photo picker, as SwiftUI asks for it
            XCTAssertTrue(chat.presentedByScreen === picker, "\(leave): the chat knows what it presented")
            XCTAssertNotNil(picker.presentingViewController, "\(leave): presented (from the tab root)")
            XCTAssertEqual(stand.dismissed.count, 0)
            if leave == "dismiss" {
                host.dismiss("coach")
                try await idle()
            } else {
                host.detachStack()
            }
            XCTAssertFalse(host.isUp("coach"), "\(leave)")
            XCTAssertEqual(r.nav.viewControllers.count, 1, "\(leave): the chat off the stack")
            XCTAssertEqual(stand.dismissed.count, 1, "\(leave): dismissed once")
            XCTAssertTrue(stand.dismissed.first === picker, "\(leave): the picker went with the chat")
            XCTAssertEqual(owner, [], "\(leave)")
            XCTAssertEqual(r.webView.leftWindow, 0, "\(leave)")
        }
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
        XCTAssertEqual(host.describe()["ops"] as? Int, 0, "nothing left in the queue for a later turn to run")
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

    /// The fallback, or the teardown, while the owner's interactive pop holds the queue frees it (every later present
    /// would otherwise wait for ever: a blank chat); UIKit's late word on that pop is nobody's Back, a let-go that puts
    /// the chat back in the stack's array (UIKit's cancel, stood in with the coordinator) takes it off again at once, and
    /// after the fallback the next chat goes up as build 60's overlay.
    func testStackLeavingTheStackDuringTheOwnersPopFreesTheQueue() async throws {
        for leave in ["detach", "teardown"] {
            for letGo in [false, true] {
                let r = try await makeStack(selected: false)
                stand = StandInPresenting()
                host.presenting = stand
                host.update("coach", model: try model())
                XCTAssertTrue(host.present("coach"))   // pushed at once out of the window
                let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
                // the owner's finger, in UIKit's order: the chat leaves the array, then willShow with its coordinator
                let c = StandInCoordinator()
                r.nav.setViewControllers([r.home], animated: false)
                r.nav.standInCoordinator = c
                host.navigationController(r.nav, willShow: r.home, animated: true)
                r.nav.standInCoordinator = nil
                XCTAssertTrue(busy(), "\(leave): the owner's finger holds the queue")
                if leave == "detach" { host.detachStack() } else { host.tearDown() }
                XCTAssertFalse(busy(), "\(leave): the queue is free")
                XCTAssertEqual(host.describe()["ops"] as? Int, 0)
                if letGo { r.nav.setViewControllers([r.home, chat], animated: false) }   // UIKit's cancel puts the chat back
                c.end(cancelled: letGo)   // UIKit's word on that pop, after the stack was left
                XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 0,
                               "\(leave), let go \(letGo): no chat left on the stack ScreenHost no longer knows")
                XCTAssertTrue(r.nav.topViewController === r.home)
                XCTAssertEqual(owner, [], "\(leave): nobody's Back")
                if leave == "detach" {
                    XCTAssertTrue(host.present("coach"))
                    try await settle(0.3)
                    XCTAssertEqual(stand.log, ["present style 5 over UIViewController"], "the next chat goes up as the overlay")
                    XCTAssertTrue(host.isUp("coach"))
                }
                XCTAssertEqual(r.webView.leftWindow, 0)
            }
        }
    }

    /// The same with UIKit's own coordinator, in the window (StackPopDriver: a percent-driven interaction stands in for the
    /// finger): the fallback or the teardown while the owner's pop is under way, then the owner lets go, and UIKit puts the
    /// chat back in the stack's array at the transition's end, after ScreenHost forgot it; it comes off again then (the
    /// stack emptied, contract 10.3). Finished, the chat is simply gone. Either way no chat ScreenHost no longer knows
    /// stays on the Coach tab or on screen, and nobody hears the owner's Back.
    func testStackLeavingTheStackDuringTheOwnersPopWithUIKitsCoordinatorLeavesNoChat() async throws {
        for leave in ["detach", "teardown"] {
            for end in ["let go", "finished"] {
                let r = try await makeStack()
                owner = []
                host.update("coach", model: try model())
                XCTAssertTrue(host.present("coach"))
                try await idle()
                let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
                let driver = StackPopDriver(host: host)
                r.nav.delegate = driver
                r.nav.popViewController(animated: true)   // the finger's pop: UIKit begins it on a later turn
                let began = try await until { self.stackState("foreignPop") as? String == "interactive" }
                XCTAssertTrue(began, "\(leave), \(end): the owner's pop is followed")
                driver.interaction.update(0.3)
                if leave == "detach" { host.detachStack() } else { host.tearDown() }
                XCTAssertFalse(busy(), "\(leave), \(end): the queue is free")
                if end == "let go" { driver.interaction.cancel() } else { driver.interaction.finish() }
                let over = try await until { r.nav.transitionCoordinator == nil }
                XCTAssertTrue(over, "\(leave), \(end): UIKit's transition ended")
                try await settle(0.3)
                XCTAssertFalse(r.nav.viewControllers.contains(chat), "\(leave), \(end): the chat off the stack")
                XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 0, "\(leave), \(end)")
                XCTAssertTrue(r.nav.topViewController === r.home, "\(leave), \(end)")
                XCTAssertNil(chat.viewIfLoaded?.window, "\(leave), \(end): the chat off screen")
                XCTAssertFalse(host.isUp("coach"))
                XCTAssertEqual(owner, [], "\(leave), \(end): nobody's Back")
                r.nav.delegate = nil
                XCTAssertEqual(r.webView.leftWindow, 0, "\(leave), \(end)")
            }
        }
    }

    /// The fallback in the turn between two ops (one over, the next due a turn later) frees the queue: nothing runs a turn
    /// later, and the next chat goes up as build 60's overlay (a queue left busy would keep every later present waiting).
    /// The push was cut in its own turn (the selection in the push's turn), before UIKit began it: ScreenHost ended it out
    /// of the window, so the chat comes off the stack at once, and back on Coach UIKit plays nothing it held (no chat).
    func testStackLeavingTheStackBetweenTwoOpsFreesTheQueue() async throws {
        let r = try await makeStack()
        host.update("coach", model: try model())
        XCTAssertTrue(host.present("coach"))   // in the window: waits for UIKit's didShow
        let chat = try XCTUnwrap(r.nav.topViewController as? ScreenHostingController)
        host.dismiss("coach")                  // queued behind it
        select(coach: false)                   // the push is done as the stack leaves the window; the pop is due a turn later
        XCTAssertTrue(busy(), "the pop waits for its turn")
        XCTAssertEqual(host.describe()["ops"] as? Int, 1)
        host.detachStack()
        XCTAssertFalse(busy(), "the queue is free")
        XCTAssertEqual(host.describe()["ops"] as? Int, 0)
        XCTAssertEqual(r.nav.viewControllers.count, 1, "the chat off the stack at once")
        try await settle(0.1)
        XCTAssertFalse(busy())
        XCTAssertEqual(r.nav.log, ["push animated", "set still"], "the chat dropped with the stack, and no pop a turn later")
        XCTAssertTrue(host.present("coach"))
        try await settle(0.3)
        XCTAssertEqual(stand.log, ["present style 5 over UIViewController"], "the next chat goes up as the overlay")
        XCTAssertTrue(host.isUp("coach"))
        r.tabs.selectedIndex = 1   // Coach again (the root fallen back: nothing tells ScreenHost)
        for _ in 0..<50 {          // about a second of the tab back
            XCTAssertEqual(r.nav.viewControllers.filter { $0 is ScreenHostingController }.count, 0, "no chat on the stack")
            XCTAssertNil(chat.viewIfLoaded?.window, "the dropped chat never on screen")
            try await settle(0.02)
        }
        XCTAssertTrue(r.nav.topViewController === r.home)
        XCTAssertEqual(r.webView.leftWindow, 0)
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
