#if os(iOS)
import SwiftUI
import UIKit
import WebKit
import os.log
import FPCore

/// What the Coach tab's navigation stack needs from the tab root, as closures (H7 fills them from RootTabController,
/// capturing it weakly), so ScreenHost needs none of the root's types: whether Coach is the selected tab; whether the
/// Coach tab is NATIVE (WAITING and WEB have no visible stack to push onto, contract 1.4); whether the root keeps the
/// tab blank for a push on its way (the hold, contract 8.1); and how to end that hold.
public struct StackState {
    public var selected: @MainActor () -> Bool
    public var native: @MainActor () -> Bool
    public var held: @MainActor () -> Bool
    /// Ends the hold. ScreenHost calls it right after a held push, so no frame of the home shows between the hold and
    /// the chat. The root posts no `.screenChanged` for a hold ended this way: ScreenHost posts the chat once UIKit has
    /// shown it, so VoiceOver hears the change once, when it is done (probe61: one post per change, on the op's
    /// completion). A hold the root ends itself (its 0.5 s) is the root's to announce.
    public var releaseHold: @MainActor () -> Void

    public init(selected: @escaping @MainActor () -> Bool, native: @escaping @MainActor () -> Bool,
                held: @escaping @MainActor () -> Bool, releaseHold: @escaping @MainActor () -> Void) {
        self.selected = selected
        self.native = native
        self.held = held
        self.releaseHold = releaseHold
    }
}

/// Where native screens go up and come down again (plan task C5; decision.md section 7), in one of two hosts: the Coach
/// tab's navigation stack while a live tab root has attached it (`attachStack`; build 61, contract 3.6 and 6.3), else
/// build 60's overlay over the page, unchanged (the classic root, and a tab root after its fallback, `detachStack`).
///
/// - **The overlay: `.overFullScreen` only**, with a push-like slide (ScreenSlideTransition) and the owner's edge pan
///   back: the page's web view never leaves its window under a screen, so the page stays visible to itself (no
///   `visibilitychange`, no leave and return path, `_wristLive`'s window untouched). A `.fullScreen` presentation, a push
///   of the bridge controller or a second bridge would hide it; none is ever made here.
/// - **The stack**: the chat is pushed on the Coach tab's UINavigationController (its system bar hidden: the chat draws
///   its own header) whether or not Coach is selected, never changing the selection (D18), with the tab bar left over it
///   (D9). A push or pop animates only while Coach is selected, the tab NATIVE, the root not held and no other transition
///   runs over the tab (UIKit drops an animated one asked meanwhile, without a word, and takes a still one at once), and
///   a held push releases the hold. A pop UIKit leaves undone all the same takes the chat off without animation at its
///   end, and a push UIKit never took is refused (the page shows its own), never the owner's Back. Nothing here
///   presents, covers or uncovers: the root owns the web view, its accessibility and `shell.covered` (contract 8.4), so a
///   pop never uncovers. While attached, ScreenHost is the stack's navigation delegate and its interactive pop's
///   delegate (the pop begins only where the edge pan would); iOS 26's content pop (a pan anywhere in the chat, which
///   would pop it in setup too) is off meanwhile, so the edge is the one interactive pop. UIKit's `didShow` comes late
///   (only once the Coach tab is in the window again), can come twice, and comes on every return to Coach with no push
///   or pop (H0 question 6): a push or pop is done at the first `didShow` of the controller it shows, at once while the
///   stack is out of the window or when `selectionChanged()` finds it left, or after `stackOpTimeout` with a log line,
///   and everything hung on `didShow` is idempotent. Only ScreenHost pushes or pops the chat: a pop it did not make (the
///   owner's interactive pop, anyone else's) is the owner's Back once it has finished, and nothing when it is
///   cancelled.
/// - **One transition at a time**: present and dismiss requests (pushes and pops in the stack) queue and run in order,
///   each after the one before has finished (UIKit refuses a presentation while another is under way); a dismissal
///   queued right behind a present that has not started cancels both.
/// - **The owner's dismissal is latched**: Back or the edge pan (the interactive pop) takes the screen down at once and
///   the page hears `coach.back`. The page's own dismiss that follows finds it gone. If the page did not leave the
///   screen (Back refused, or the bridge failed), it goes up again, since the page still shows its placeholder under it.
/// - **The shell owns focus**: before a screen covers the page, the page's focused field is blurred through the bridge
///   (`shell.covered {on:true}`) and editing ends in the web view, so UIKit has no keyboard to bring back when it hands
///   first responder to the web view after the dismissal; the descriptor's `hasInitialFocus` is false (AppDelegate). In
///   the stack, editing ends in the stack's view before a push (a focused native field on the hub).
/// - **VoiceOver** reads an overlay alone: the web view is hidden from it while covered, and the screen is modal. The
///   pushed chat is not modal (the tab bar stays reachable); VoiceOver hears `.screenChanged` with the stack's new top
///   after each push and pop while Coach is selected and NATIVE (entering the tab, turning it WEB and ending a hold by
///   its own time, the root posts its own; a hold a push ends, ScreenHost's post is the one).
/// - **The room, not the phone**: every hosting controller and the toast window take `overrideUserInterfaceStyle` from
///   the model's `paper` (light for Heavyweight, dark for Lime), so the keyboard, the photo picker and menus match.
/// - **Crash markers**: while an overlay is up and the app is active, `presenting <screen>@<page build> shell <shell
///   build>` sits in its marker file, removed when the screen goes and whenever the app stops being active or enters the
///   background (written again when it comes back with the screen still up; a screen that goes up while the app is away
///   writes none), so only a death on screen leaves one. ShellBridge reads them at launch. In the stack: at most one
///   Coach-tab marker, for the screen on top of the stack, only while the app is active, Coach is selected and the tab is
///   NATIVE (contract 10.2, D20).
/// - **A refused presentation** (UIKit's silence while another controller's presentation is delayed) is noticed by a
///   watchdog: the screen is not up, the page shows its own, and the queue goes on.
/// - **VoiceOver's escape** goes back (Cancel during setup), and the toast window follows the phone's text size live.
/// - **A hardware keyboard's Cmd+Return** sends from the chat (the controller's key command, ahead of the text view's
///   Return), as the web composer's Cmd/Ctrl+Enter does.
/// - **Toasts and confirms** the page forwards while covered show in a window above every screen (`ShellOverlay`), so
///   one outlives the screen it was shown over. A toast sits under the chat's header while the chat is up (in the stack:
///   on top of the selected Coach tab, not held), else under the status bar.
@MainActor
public final class ScreenHost: NSObject {
    /// What ScreenHost needs from the shell (ShellBridge).
    public struct Hooks {
        /// The owner's answer to a confirm, a toast's Undo. Back and the edge pan arrive as `userDismissed`.
        public var send: (Intent) -> Void = { _ in }
        /// An intent from a screen's control (Send, Undo, the model switch, ...) and how it ended: the chat's store
        /// follows what became of each message the owner sent (plan task C7).
        public var ask: (Intent, @escaping (PageLink.Outcome) -> Void) -> Void = { _, done in done(.notLinked) }
        /// The page is about to be covered: blur its field through the bridge (`shell.covered {on:true}`). Overlay only:
        /// in the stack the root sends covered.
        public var willCover: () -> Void = {}
        /// Nothing native covers the page any more (`shell.covered {on:false}`). Overlay only: a pop never uncovers.
        public var didUncover: () -> Void = {}
        /// The owner took the screen down (Back or the edge pan): tell the page (`coach.back`).
        public var userDismissed: (String) -> Void = { _ in }
        /// A screen could not be presented: the page shows its own (`screens.off`).
        public var failed: (String, String) -> Void = { _, _ in }
        public init() {}
    }

    static let log = Logger(subsystem: "app.kt.trainer", category: "screens")

    public private(set) weak var presenter: UIViewController?
    public private(set) weak var webView: WKWebView?
    public var hooks = Hooks()
    /// Shell and page builds for the crash marker line.
    public let shellBuild: String
    public var pageBuild: String? {
        // a pushed chat outlives its document (I13): its marker names the page build of the newest one
        didSet { if stack != nil, pageBuild != oldValue { refreshStackMarker() } }
    }
    let markers: ScreenMarkers
    let overlay = ShellOverlay()

    /// A screen up or going up: presented over the page, or pushed in the Coach tab's stack.
    final class Up {
        enum Kind { case overlay, stack }
        let name: String
        let host: ScreenHostingController
        let kind: Kind
        /// Presented, or pushed (the push done).
        var presented = false
        init(name: String, host: ScreenHostingController, kind: Kind = .overlay) {
            self.name = name
            self.host = host
            self.kind = kind
        }
    }

    /// An `Up` a closure can name before it exists (the chat's header reports into its own screen only).
    private final class UpRef {
        weak var up: Up?
    }

    private enum Op: Equatable {
        case present(String)
        case dismiss(String, user: Bool)
    }

    private var up: [String: Up] = [:]
    /// The live chat (plan task C7): the page's newest model (the chat opens on it), the owner's messages on their way,
    /// the composer. It outlives each presentation.
    public let coach: CoachStore
    private var ops: [Op] = []
    private var busy = false
    /// Screens the owner took down whose page has not yet said dismiss.
    public private(set) var latched: Set<String> = []
    /// The page's dismiss came while the owner's back was still queued: nothing to latch when it runs.
    private var acked: Set<String> = []
    private let slide = ScreenSlideTransition()
    private var interactive: (screen: String, transition: UIPercentDrivenInteractiveTransition)?
    /// Presentations and dismissals made (for the probe), pushes and pops in the stack under the same words: `present`,
    /// `dismiss` (the page's), `back` (the owner's), `edge back` and `edge back cancelled` (the edge pan, the interactive
    /// pop), `refused` (UIKit did not present or push it), `drop` (the stack left with the chat on it).
    public private(set) var transitions: [String] = []
    /// Slides in and out (the edge pan always animates). In the stack, pushes and pops animate only while Coach is selected
    /// and NATIVE, the root not held and no other transition under way.
    var animated = true
    /// VoiceOver's screen change (tests record it).
    var postScreenChanged: (Any?) -> Void = { UIAccessibility.post(notification: .screenChanged, argument: $0) }

    /// The Coach tab's stack while attached, with the root's answers and the delegates the stack had before.
    private final class Stack {
        weak var nav: UINavigationController?
        let state: StackState
        weak var navDelegateWas: UINavigationControllerDelegate?
        weak var popDelegateWas: UIGestureRecognizerDelegate?
        /// Whether iOS 26's content pop was on before ScreenHost turned it off (nil below iOS 26).
        var contentPopWas: Bool?
        init(nav: UINavigationController, state: StackState, navDelegateWas: UINavigationControllerDelegate?,
             popDelegateWas: UIGestureRecognizerDelegate?) {
            self.nav = nav
            self.state = state
            self.navDelegateWas = navDelegateWas
            self.popDelegateWas = popDelegateWas
        }
    }

    /// A push or pop of the stack under way: done at the first `didShow` of `expect`, at once while the stack is out of
    /// the window, or after `stackOpTimeout`.
    private struct StackWait {
        let token: Int
        weak var expect: UIViewController?
        let what: String
        let done: () -> Void
    }

    /// A pop of the chat ScreenHost did not make (the owner's interactive pop, or another's), followed to its end.
    private struct ForeignPop {
        let token: Int
        let interactive: Bool
        /// It took the queue (nothing else was under way): the queue goes on when it ends.
        let holdsQueue: Bool
    }

    /// The marker the stack keeps: the screen on top and the page build its line names.
    private struct MarkerKey: Equatable {
        let screen: String
        let page: String
    }

    private var stack: Stack?
    private var stackWait: StackWait?
    private var stackTimer: DispatchWorkItem?
    private var foreignPop: ForeignPop?
    private var stackToken = 0
    private var stackMarker: MarkerKey?
    /// Where the pushed chat's header ends, as it last reported (the toast's anchor while it is on top of the selected tab).
    private var chatHeaderBottom: CGFloat?
    /// The stack stands down for VoiceOver under a forwarded confirm.
    private var stackStoodDown = false
    /// The app stopped being active or went to the background (`willResignActive` comes while it still reads active).
    private var away = false
    /// How long a push or pop waits for UIKit's `didShow` before it counts as done (a stack whose slot left the window
    /// mid-push hears nothing until the tab is back, H0 question 6, and the queue must not stall on it).
    var stackOpTimeout: TimeInterval = 1
    /// How a screen's controller goes up and comes down: UIKit's presentation (tests without a window scene, where UIKit
    /// never finishes one, put a stand-in).
    var presenting: ScreenPresenting = UIKitPresenting()
    /// Whether the app is in use now (tests set their own). A crash marker is written only then: a present made while the
    /// app is not active (a background launch, the app sent away right after launch) wrote one, and a kill in the
    /// background (jetsam) then read as a crash at the next launch.
    var isActive: () -> Bool = { UIApplication.shared.applicationState == .active }
    /// How long a presentation may go without UIKit's completion while no controller presents the screen before it counts
    /// as refused (UIKit refuses one it cannot make now, a share sheet's delayed presentation under way, without a word).
    var refusalWatchdog: TimeInterval = 2
    /// The system text size the overlay's toasts are drawn at, as the last change of it said (nil: the trait collection's).
    private var textSize: DynamicTypeSize?

    /// `coach`: the chat's store (tests pass one with its own defaults; the app's keeps the composer in `fpDraft.coach`).
    public init(presenter: UIViewController, webView: WKWebView, shellBuild: String, pageBuild: String?, markerFolder: URL,
                coach: CoachStore? = nil) {
        self.presenter = presenter
        self.webView = webView
        self.shellBuild = shellBuild
        self.pageBuild = pageBuild
        markers = ScreenMarkers(folder: markerFolder)
        self.coach = coach ?? CoachStore()
        super.init()
        slide.ended = { [weak self] presenting, completed in self?.transitionEnded(presenting: presenting, completed: completed) }
        overlay.answer = { [weak self] confirm, yes in self?.answer(confirm, yes: yes) }
        overlay.undo = { [weak self] id in self?.hooks.send(.toastUndo(id: id)) }
        self.coach.hooks.ask = { [weak self] intent, done in
            guard let self else { return done(.notLinked) }
            self.hooks.ask(intent, done)
        }
        self.coach.hooks.back = { [weak self] in self?.userBack("coach") }
        self.coach.hooks.toast = { [weak self] t in self?.overlay.show(toast: t) }
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(willResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(willResignActive), name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(textSizeChanged(_:)), name: UIContentSizeCategory.didChangeNotification, object: nil)
    }

    /// The screens up now (presented or going up), in name order.
    public var shown: [String] { up.keys.sorted() }

    public func isUp(_ screen: String) -> Bool { up[screen] != nil }

    /// The model a screen shows (the page's newest).
    public func model(_ screen: String) -> CoachModel? { screen == "coach" ? coach.model : nil }

    // MARK: Requests from the page (through ShellBridge)

    /// The page's `present`. The model must have come first (the page pushes it before presenting). In the stack only onto
    /// a NATIVE Coach tab: WAITING and WEB have no visible stack to push onto (the bridge words that `not-native`).
    @discardableResult
    public func present(_ screen: String) -> Bool {
        guard model(screen) != nil else { return false }
        if let s = stack, !s.state.native() { return false }
        latched.remove(screen)   // the page went through its dismiss before asking again
        if let i = ops.lastIndex(of: .dismiss(screen, user: false)), i == ops.count - 1, up[screen] != nil {
            ops.remove(at: i)   // a dismissal that has not started, then this: the screen just stays
            return true
        }
        enqueue(.present(screen))
        return true
    }

    /// The page's `dismiss` (or the shell's own: the screen went off).
    public func dismiss(_ screen: String) {
        if up[screen] == nil, latched.remove(screen) != nil {
            Self.log.info("screens: \(screen, privacy: .public) already taken down by the owner; the page's dismiss closes the latch")
            return
        }
        if ops.contains(.dismiss(screen, user: true)) {
            acked.insert(screen)   // the owner's back is on its way down: the page has heard it already
            return
        }
        if let i = ops.lastIndex(of: .present(screen)), i == ops.count - 1 {
            ops.remove(at: i)   // a present that has not started: neither happens
            return
        }
        enqueue(.dismiss(screen, user: false))
    }

    /// A model the link accepted (newer, of this document, or the next document's resync): the chat's store draws it
    /// unless it is stale there too.
    public func update(_ screen: String, model: CoachModel) {
        guard screen == "coach", coach.apply(model) else { return }
        let theme = RoomTheme(model: model, system: textSize ?? Self.systemTextSize)
        overlay.setRoom(theme)
        if let u = up[screen] {
            u.host.paper = model.paper
            u.host.overrideUserInterfaceStyle = model.paper ? .light : .dark
        }
    }

    /// A toast the page forwarded while covered.
    public func toast(_ t: ToastRequest) {
        overlay.show(toast: t)
    }

    /// A confirm the page forwarded while covered: over everything; the screen under it ends editing and stands down
    /// for VoiceOver until it is answered. In the stack, the stack's views do (the pushed chat, the hub): a confirm is
    /// forwarded only while the Coach tab covers the page, so the stack is the screen under it.
    public func confirm(_ c: ConfirmRequest) {
        for u in up.values where u.kind == .overlay {
            u.host.view.endEditing(true)
            u.host.view.accessibilityElementsHidden = true
        }
        if let nav = stack?.nav {
            nav.view.endEditing(true)
            nav.view.accessibilityElementsHidden = true
            stackStoodDown = true
        }
        overlay.show(confirm: c)
    }

    /// The document the open confirm came from is gone: it closes unanswered (the page would answer stale).
    public func closeConfirmAsStale() {
        guard let c = overlay.confirm else { return }
        Self.log.info("screens: confirm \(c.id, privacy: .public) closed: its document is gone (stale)")
        overlay.show(confirm: nil)
        standUp()
    }

    /// The open confirm's id, if one is open.
    public var openConfirm: String? { overlay.confirm?.id }
    public var shownToast: ToastRequest? { overlay.toast }

    private func answer(_ c: ConfirmRequest, yes: Bool) {
        overlay.show(confirm: nil)
        standUp()
        hooks.send(c.answer(yes))
    }

    /// The confirm went: the screens under it are read again.
    private func standUp() {
        for u in up.values where u.kind == .overlay { u.host.view.accessibilityElementsHidden = false }
        if stackStoodDown {
            stack?.nav?.view.accessibilityElementsHidden = false
            stackStoodDown = false
        }
    }

    /// The owner's Back (the header's button): the screen goes now, latched until the page has heard it.
    public func userBack(_ screen: String) {
        guard up[screen] != nil, !latched.contains(screen), !ops.contains(.dismiss(screen, user: true)) else { return }
        enqueue(.dismiss(screen, user: true))
    }

    /// The page did not leave the screen the owner took down (coach.back refused or failed): put it back, since the
    /// page still shows its placeholder.
    public func userBackRefused(_ screen: String) {
        guard latched.remove(screen) != nil, up[screen] == nil, model(screen) != nil else { return }
        Self.log.info("screens: the page kept \(screen, privacy: .public) after the owner's back: it goes up again")
        enqueue(.present(screen))
    }

    /// The messages put back in the chat's composer this launch (for the probe): the owner's words that never reached
    /// the page (its document went, no page was linked, the page refused them), never resent (CoachStore).
    public var restored: [String] { coach.restored }

    /// A document went: the model of a screen that is not up belongs to it and goes (a screen opens on its own
    /// document's model); a screen up keeps its model until the next document's resync, and the owner's messages on
    /// their way wait for that model (CoachStore).
    public func forgetModels(exceptUp: Bool) {
        coach.documentGone(chatUp: exceptUp && up["coach"] != nil)
    }

    /// Every screen down at once, with no animation (the scene is going; the link is gone for good). The owner's
    /// messages still on their way go back in the composer, kept for the next chat. In the stack the chat is popped and
    /// its marker removed first, and the web view's accessibility is left to the root (contract 8.4).
    public func tearDown() {
        let stacked = stack != nil
        leaveStack(why: "teardown")
        ops.removeAll()
        for u in up.values {
            markers.remove(u.name)
            u.host.presentingViewController?.dismiss(animated: false)
        }
        up.removeAll()
        latched.removeAll()
        overlay.show(confirm: nil)
        overlay.show(toast: nil)
        if !stacked { webView?.accessibilityElementsHidden = false }
        coach.tearDown()
    }

    // MARK: The queue

    private func enqueue(_ op: Op) {
        ops.append(op)
        runNext()
    }

    private func runNext() {
        guard !busy, !ops.isEmpty else { return }
        let op = ops.removeFirst()
        busy = true
        switch op {
        case .present(let s):
            if stack != nil { runPush(s) } else { runPresent(s) }
        case .dismiss(let s, let user):
            if up[s]?.kind == .stack { runPop(s, user: user) } else { runDismiss(s, user: user) }
        }
    }

    private func opDone() {
        busy = false
        runNext()
    }

    // MARK: Present

    private func runPresent(_ screen: String) {
        guard up[screen] == nil else { return opDone() }
        guard let model = model(screen) else { return opDone() }
        guard let presenter, presenter.view.window != nil, presenter.isViewLoaded else {
            Self.log.error("screens: \(screen, privacy: .public) not presented: no window")
            hooks.failed(screen, "no window")
            return opDone()
        }
        // The shell owns focus: the page's field is blurred through the bridge and editing ends before anything covers
        // it, so the dismissal has no keyboard to bring back.
        hooks.willCover()
        webView?.endEditing(true)
        presenter.view.window?.endEditing(true)
        // only while the app is in use: didBecomeActive writes it for a screen that went up while the app was away
        if isActive() { markers.write(screen, page: pageBuild ?? "unknown", shell: shellBuild) }
        let u = makeUp(screen, model: model, kind: .overlay)
        let host = u.host
        host.modalPresentationStyle = .overFullScreen   // never .fullScreen: the page stays in its window
        host.modalPresentationCapturesStatusBarAppearance = true
        host.transitioningDelegate = slide
        host.view.accessibilityViewIsModal = true
        let pan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgePan(_:)))
        pan.edges = .left
        host.view.addGestureRecognizer(pan)
        up[screen] = u
        precondition(host.modalPresentationStyle == .overFullScreen, "a native screen is presented over the page, never instead of it")
        transitions.append("present " + screen)
        Self.log.info("screens: presenting \(screen, privacy: .public) (rev \(model.rev), \(model.paper ? "paper" : "dark", privacy: .public))")
        presenting.present(host, from: presenter, animated: animated) { [weak self, weak u] in
            guard let self, let u else { return }
            guard self.up[screen] === u else {
                // counted as refused already, and UIKit went on after all: nothing native is meant to be up
                u.host.presentingViewController?.dismiss(animated: false)
                return
            }
            u.presented = true
            self.webView?.accessibilityElementsHidden = true
            self.postScreenChanged(nil)
            self.opDone()
        }
        // UIKit refuses a presentation it cannot make now (another controller's delayed presentation, a share sheet's)
        // without a word: no completion ever comes, and the queue stopped for the rest of the process with the page
        // covered by nothing (a blank chat). A screen no controller presents when the watchdog fires was refused.
        DispatchQueue.main.asyncAfter(deadline: .now() + refusalWatchdog) { [weak self, weak u] in
            MainActor.assumeIsolated {
                guard let self, let u, self.up[screen] === u, !u.presented, u.host.presentingViewController == nil else { return }
                self.refused(screen)
            }
        }
    }

    /// A screen's controller and its record: the chat on the live store, VoiceOver's escape, Cmd+Return, the room. The
    /// chat's header reports where it ends: the toast's anchor (in the stack only while it is the screen up).
    private func makeUp(_ screen: String, model: CoachModel, kind: Up.Kind) -> Up {
        let ref = UpRef()
        let root = CoachScreenRoot(store: coach, overlay: overlay) { [weak self] y in
            guard let self else { return }
            switch kind {
            case .overlay: self.overlay.setAnchor(y > 0 ? y : nil)
            case .stack: self.stackHeaderBottom(y, from: ref.up)
            }
        }
        let host = ScreenHostingController(rootView: AnyView(root))
        host.escape = { [weak self] in
            guard let self else { return false }
            let took = self.escape(screen)
            // in the stack an escape the chat does not take goes no further: the navigation controller's own escape
            // would pop the chat where it offers no Back (setup), a pop the owner's Back rule forbids
            return took || kind == .stack
        }
        if screen == "coach" { host.commandReturn = { [weak self] in self?.coach.draft.sendAsked.send() } }
        host.paper = model.paper
        host.overrideUserInterfaceStyle = model.paper ? .light : .dark
        host.view.backgroundColor = .clear
        let u = Up(name: screen, host: host, kind: kind)
        ref.up = u
        return u
    }

    /// UIKit did not present the screen: it is not up, its marker goes, the page is uncovered and shows its own (the
    /// bridge's `screens.off`), and the queue goes on.
    private func refused(_ screen: String) {
        guard up.removeValue(forKey: screen) != nil else { return }
        markers.remove(screen)
        transitions.append("refused " + screen)
        Self.log.error("screens: UIKit refused to present \(screen, privacy: .public): the page shows its own")
        if up.isEmpty {
            webView?.accessibilityElementsHidden = false
            hooks.didUncover()
        }
        hooks.failed(screen, "UIKit refused the presentation")
        opDone()
    }

    // MARK: Dismiss

    private func runDismiss(_ screen: String, user: Bool) {
        guard let u = up[screen] else {
            if !user { latched.remove(screen) }   // the page's dismiss of a screen the owner already took down
            return opDone()
        }
        if user, acked.remove(screen) == nil { latched.insert(screen) }
        u.host.view.endEditing(true)   // the native composer's keys go down with the screen
        transitions.append((user ? "back " : "dismiss ") + screen)
        presenting.dismiss(u.host, animated: animated) { [weak self] in
            self?.removed(screen, user: user)
            self?.opDone()
        }
    }

    /// The screen is gone: its marker, the page uncovered once nothing covers it, the owner's back told to the page. A
    /// pop in the stack never uncovers and never touches the web view: the root owns both (contract 8.4), and the hub may
    /// still hide the page.
    private func removed(_ screen: String, user: Bool) {
        guard let u = up.removeValue(forKey: screen) else { return }
        if u.kind == .stack { return chatPopped(u, user: user) }
        markers.remove(screen)
        // a toast forwarded just before the chat went leaves the chat header's place (it sat over the next screen's
        // content there): under the status bar, where the overlay puts toasts with no chat up
        if screen == "coach" { overlay.setAnchor(nil) }
        if up.isEmpty {
            webView?.accessibilityElementsHidden = false
            hooks.didUncover()
        }
        postScreenChanged(nil)
        Self.log.info("screens: \(screen, privacy: .public) down (\(user ? "the owner's back" : "the page's dismiss", privacy: .public))")
        if user { hooks.userDismissed(screen) }
    }

    /// The pushed chat is off the stack and its record gone: the toast's anchor resets, the marker follows the new top,
    /// VoiceOver hears it, and the page hears the owner's back.
    private func chatPopped(_ u: Up, user: Bool) {
        chatHeaderBottom = nil   // the toast's anchor resets with the pop (contract 8.3)
        refreshStack()
        announceStackTop()
        Self.log.info("screens: \(u.name, privacy: .public) popped (\(user ? "the owner's back" : "the page's dismiss", privacy: .public))")
        if user { hooks.userDismissed(u.name) }
    }

    // MARK: The Coach tab's stack (build 61)

    /// Under a live tab root (H7 calls it when it adopts the root): the chat goes in the Coach tab's navigation stack from
    /// now on. ScreenHost becomes the stack's navigation delegate and its interactive pop's delegate, and turns iOS 26's
    /// content pop off (a leading pan anywhere in the content pops the top: in setup, with no Back, and mid-transition,
    /// where the edge pan's rule allows none); the delegates it had and the content pop's state come back when the stack
    /// is left. `state` answers for the root and must not keep it alive.
    public func attachStack(_ nav: UINavigationController, state: StackState) {
        if stack != nil { leaveStack(why: "another stack attached") }
        let pop = nav.interactivePopGestureRecognizer
        let s = Stack(nav: nav, state: state, navDelegateWas: nav.delegate === self ? nil : nav.delegate,
                      popDelegateWas: pop?.delegate === self ? nil : pop?.delegate)
        if #available(iOS 26.0, *), let content = nav.interactiveContentPopGestureRecognizer {
            s.contentPopWas = content.isEnabled
            content.isEnabled = false
        }
        stack = s
        nav.delegate = self
        pop?.delegate = self
        Self.log.info("screens: the chat goes in the Coach tab's stack (depth \(nav.viewControllers.count))")
        refreshStack()
    }

    /// The tab root fell back (contract 10.3): the chat is popped without animation, the pushes and pops still queued go
    /// (the fallback turns the chat off for this document: a queued push must not come back as the overlay), the marker
    /// goes, the stack gets its delegates back, and every later present is build 60's `.overFullScreen` overlay.
    public func detachStack() {
        leaveStack(why: "the tab root fell back")
    }

    /// Whether the chat goes in the Coach tab's stack rather than over the page.
    public var stackAttached: Bool { stack != nil }

    /// The root's selection or the Coach tab's mode changed (the bridge calls it from the root's `coachShown`): the marker
    /// and the toast's anchor follow, and a push or pop still waiting for UIKit is done now if the stack left the window
    /// (UIKit says nothing until the tab is back, H0 question 6).
    public func selectionChanged() {
        guard let s = stack else { return }
        if let w = stackWait, !stackShown(s) { finishStackWait(w.token, why: "the Coach tab left the window") }
        refreshStack()
    }

    /// The stack is on screen: Coach selected and its slot in the window.
    private func stackShown(_ s: Stack) -> Bool {
        guard let nav = s.nav else { return false }
        return s.state.selected() && nav.view.window != nil
    }

    private func runPush(_ screen: String) {
        guard up[screen] == nil else { return opDone() }
        guard let model = model(screen) else { return opDone() }
        guard let s = stack, let nav = s.nav else {
            Self.log.error("screens: \(screen, privacy: .public) not pushed: the Coach tab's stack is gone")
            hooks.failed(screen, "no stack")
            return opDone()
        }
        guard s.state.native() else {
            // accepted while the tab was NATIVE; it turned WAITING or WEB before the push could run
            Self.log.error("screens: \(screen, privacy: .public) not pushed: the Coach tab is not native")
            hooks.failed(screen, "the Coach tab is not native")
            return opDone()
        }
        let held = s.state.held(), shown = stackShown(s)
        nav.view.endEditing(true)   // a focused native field on the hub: its keys go before the chat covers it
        let u = makeUp(screen, model: model, kind: .stack)
        u.host.hidesBottomBarWhenPushed = false   // D9: the tab bar stays over the chat
        up[screen] = u
        // no animation while another transition runs over the tab (a presentation going up or down: the chat's photo
        // picker, a share sheet; or UIKit's own, still running when the last op's wait ran out): UIKit drops an animated
        // push then, without a word, and takes a still one at once
        let animate = animated && shown && !held && nav.transitionCoordinator == nil
        transitions.append("present " + screen)
        Self.log.info("screens: pushing \(screen, privacy: .public) (rev \(model.rev), \(model.paper ? "paper" : "dark", privacy: .public), \(animate ? "animated" : "without animation", privacy: .public)\(shown ? "" : ", Coach not shown", privacy: .public)\(held ? ", held" : "", privacy: .public))")
        var entered = false   // UIKit took the push: the chat was in the stack's array once the call returned
        let token = waitForStack(expect: u.host, what: "push " + screen) { [weak self, weak u] in
            guard let self else { return }
            if let u, self.up[screen] === u {
                if self.inStack(u) {
                    u.presented = true
                    self.announceStackTop()
                } else if entered {
                    // another pop took the chat before UIKit showed it (no willShow counts while a push waits): as every
                    // pop ScreenHost did not make, the owner's Back, so the page never thinks a chat is up that is gone
                    self.foreignPopped(u, interactive: false)
                } else {
                    self.pushRefused(u)
                }
            }
            self.refreshStack()
            self.opDone()
        }
        nav.pushViewController(u.host, animated: animate)
        entered = inStack(u)
        if held { s.state.releaseHold() }   // after the push: no frame of the home between the hold and the chat
        refreshStack()
        if !shown { finishStackWait(token, why: nil) }   // out of the window UIKit says nothing until the tab is back
    }

    private func runPop(_ screen: String, user: Bool, edge: Bool = false) {
        guard let u = up[screen] else {
            if !user { latched.remove(screen) }
            return opDone()
        }
        if user, acked.remove(screen) == nil { latched.insert(screen) }
        u.host.view.endEditing(true)   // the native composer's keys go down with the chat
        transitions.append((edge ? "edge back " : user ? "back " : "dismiss ") + screen)
        guard let s = stack, let nav = s.nav, let i = nav.viewControllers.firstIndex(where: { $0 === u.host }) else {
            removed(screen, user: user)   // it left its stack another way: gone already
            return opDone()
        }
        let onTop = i == nav.viewControllers.count - 1, shown = stackShown(s)
        let below = i > 0 ? nav.viewControllers[i - 1] : nil
        // animated only where the owner sees the stack (a WEB tab hides it: coachHome off with the chat up pops it) and
        // no other transition runs over the tab: UIKit drops an animated pop asked meanwhile, without a word, and takes a
        // still one at once
        let animate = animated && shown && onTop && s.state.native() && nav.transitionCoordinator == nil
        Self.log.info("screens: popping \(screen, privacy: .public) (\(animate ? "animated" : "without animation", privacy: .public)\(shown ? "" : ", Coach not shown", privacy: .public))")
        let token = waitForStack(expect: below, what: "pop " + screen) { [weak self, weak u] in
            guard let self else { return }
            if let u, self.up[screen] === u, self.inStack(u) {
                self.takeOff(u, user: user)   // UIKit left the pop undone
            } else {
                self.removed(screen, user: user)
            }
            self.opDone()
        }
        if onTop, below != nil {
            nav.popViewController(animated: animate)
        } else {
            var vcs = nav.viewControllers
            vcs.remove(at: i)
            nav.setViewControllers(vcs, animated: false)
        }
        refreshStack()
        // UIKit shows nothing new out of the window, or when the chat was not on top
        if !shown || !onTop || below == nil { finishStackWait(token, why: nil) }
    }

    /// Starts waiting for UIKit to show `expect` (its `didShow`); `stackOpTimeout` at most.
    private func waitForStack(expect: UIViewController?, what: String, done: @escaping () -> Void) -> Int {
        stackToken += 1
        let token = stackToken
        stackWait = StackWait(token: token, expect: expect, what: what, done: done)
        let seconds = stackOpTimeout
        let work = DispatchWorkItem { [weak self] in
            MainActor.assumeIsolated { self?.finishStackWait(token, why: "UIKit said nothing in \(seconds) s") }
        }
        stackTimer?.cancel()
        stackTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
        return token
    }

    /// The push or pop `token` is done (once: a second `didShow`, the timer after it, find nothing).
    private func finishStackWait(_ token: Int, why: String?) {
        guard let w = stackWait, w.token == token else { return }
        stackWait = nil
        stackTimer?.cancel()
        stackTimer = nil
        if let why { Self.log.notice("screens: \(w.what, privacy: .public) taken as done (\(why, privacy: .public))") }
        w.done()
    }

    /// A pop UIKit left undone (it drops an animated one asked while another transition runs over the tab, without a
    /// word): the chat comes off now without animation, so ScreenHost never counts down a chat the owner still sees (no
    /// marker, a dead Back, no edge pop, a second chat pushed over it later). Its record goes first, as at the stack's
    /// leaving: UIKit's word on this change, inside the call or after it, finds no chat to call the owner's.
    private func takeOff(_ u: Up, user: Bool) {
        guard up[u.name] === u else { return }
        up.removeValue(forKey: u.name)
        if let nav = stack?.nav, nav.viewControllers.contains(where: { $0 === u.host }) {
            Self.log.error("screens: UIKit left \(u.name, privacy: .public) in the Coach tab's stack after its pop: taken off without animation")
            nav.setViewControllers(nav.viewControllers.filter { $0 !== u.host }, animated: false)
        }
        chatPopped(u, user: user)
    }

    /// UIKit never took the push (it drops an animated one asked while another transition runs over the tab, without a
    /// word): the chat is not up and the page shows its own (the bridge's `screens.off`), as for a presentation UIKit
    /// refused. Nobody pressed Back, so the page never hears `coach.back` for it.
    private func pushRefused(_ u: Up) {
        guard up[u.name] === u else { return }
        up.removeValue(forKey: u.name)
        chatHeaderBottom = nil
        transitions.append("refused " + u.name)
        Self.log.error("screens: UIKit did not push \(u.name, privacy: .public): the page shows its own")
        hooks.failed(u.name, "UIKit refused the push")
    }

    /// VoiceOver hears the stack's new top after a push or pop, while the owner sees the stack: Coach selected, its slot
    /// in the window and the tab NATIVE (a WEB tab hides the stack and the root shows the web view; entering the tab, the
    /// root posts its own).
    private func announceStackTop() {
        guard let s = stack, stackShown(s), s.state.native(), let top = s.nav?.topViewController?.viewIfLoaded else { return }
        postScreenChanged(top)
    }

    /// The screen on top of the stack, when it is one of ScreenHost's (H10 adds the hub, `coachHome`).
    private func stackTop() -> String? {
        guard let nav = stack?.nav, let u = up["coach"], u.kind == .stack, nav.topViewController === u.host else { return nil }
        return "coach"
    }

    /// The marker and the toast's anchor from the stack as it stands (idempotent: a repeated `didShow` changes nothing).
    private func refreshStack() {
        refreshStackMarker()
        refreshStackAnchor()
    }

    /// At most one Coach-tab marker, for the screen on top of the stack, while the app is in use, Coach is selected and the
    /// tab is NATIVE (contract 10.2, D20): none in WAITING or WEB, while Coach is not selected, while the app is away, and
    /// once the stack is left.
    private func refreshStackMarker() {
        var want: MarkerKey?
        if let s = stack, !away, isActive(), s.state.selected(), s.state.native(), let top = stackTop() {
            want = MarkerKey(screen: top, page: pageBuild ?? "unknown")
        }
        guard want != stackMarker else { return }
        if let old = stackMarker, old.screen != want?.screen { markers.remove(old.screen) }
        if let want { markers.write(want.screen, page: want.page, shell: shellBuild) }
        stackMarker = want
    }

    /// The toast's anchor (contract 8.3): under the chat's header while it is on top of the selected NATIVE Coach tab and
    /// the root not held, else under the status bar (WAITING and WEB show no stack; held; Coach not selected).
    private func refreshStackAnchor() {
        guard let s = stack else { return }
        let chatShown = stackTop() == "coach" && s.state.selected() && s.state.native() && !s.state.held()
        overlay.setAnchor(chatShown ? chatHeaderBottom : nil)
    }

    /// The pushed chat's header reported where it ends.
    private func stackHeaderBottom(_ y: CGFloat, from u: Up?) {
        guard let u, up[u.name] === u else { return }   // a chat already popped reports nothing any more
        chatHeaderBottom = y > 0 ? y : nil
        refreshStackAnchor()
    }

    /// Whether the owner's interactive pop may begin now (the edge pan's rule): the chat on top and pushed, offering Back,
    /// not in setup, and nothing else under way. Never at the stack's root.
    func stackPopAllowed() -> Bool {
        guard let nav = stack?.nav, !busy, stackWait == nil, foreignPop == nil, nav.viewControllers.count > 1,
              let u = up["coach"], u.kind == .stack, u.presented, nav.topViewController === u.host,
              let m = model("coach"), m.header.back, !m.intake else { return false }
        return true
    }

    /// UIKit is about to show a controller: a pop of the chat that ScreenHost did not make starts here (the owner's
    /// finger, or another's pop); it is the owner's Back once it has finished, nothing if it is cancelled.
    fileprivate func stackWillShow(_ nav: UINavigationController) {
        guard let s = stack, nav === s.nav, stackWait == nil, foreignPop == nil,
              let u = up["coach"], u.kind == .stack, u.presented,
              !nav.viewControllers.contains(where: { $0 === u.host }) else { return }
        u.host.view.endEditing(true)   // the native composer's keys go down with the chat
        guard let coord = nav.transitionCoordinator else { return foreignPopped(u, interactive: false) }
        stackToken += 1
        let token = stackToken, holds = !busy
        if holds { busy = true }   // one transition at a time: the queue waits for the owner's finger
        foreignPop = ForeignPop(token: token, interactive: coord.isInteractive, holdsQueue: holds)
        let followed = coord.animate(alongsideTransition: nil) { [weak self] context in
            let cancelled = context.isCancelled
            MainActor.assumeIsolated { self?.foreignPopEnded(token, cancelled: cancelled) }
        }
        if !followed, !coord.isInteractive {
            // no word from the coordinator: didShow, or the wait every push and pop has
            let seconds = stackOpTimeout
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
                MainActor.assumeIsolated { self?.foreignPopEnded(token, cancelled: !(self?.chatLeftStack() ?? true)) }
            }
        }
    }

    /// UIKit showed a controller: the push or pop under way is done when it is the one it shows; a pop ScreenHost did not
    /// make ends; the marker and anchor follow. It comes late, twice, and with no push or pop at all: nothing here counts.
    fileprivate func stackDidShow(_ nav: UINavigationController, _ vc: UIViewController) {
        guard let s = stack, nav === s.nav else { return }
        if let w = stackWait {
            if w.expect === vc { finishStackWait(w.token, why: nil) }
        } else if let f = foreignPop {
            // the chat shown again is a cancelled pop, whatever the stack's array says by then (UIKit puts the chat back
            // as the cancel ends); another controller shown with the chat gone is a finished one
            let chatAgain = up["coach"].map { $0.host === vc } ?? false
            foreignPopEnded(f.token, cancelled: chatAgain || !chatLeftStack())
        } else if let u = up["coach"], u.kind == .stack, u.presented, chatLeftStack() {
            foreignPopped(u, interactive: false)
        }
        refreshStack()
    }

    /// Whether a screen's controller is in the stack now.
    private func inStack(_ u: Up) -> Bool {
        stack?.nav?.viewControllers.contains { $0 === u.host } ?? false
    }

    /// The pushed chat is no longer in the stack (or none is up).
    private func chatLeftStack() -> Bool {
        guard let u = up["coach"], u.kind == .stack else { return true }
        return !inStack(u)
    }

    private func foreignPopEnded(_ token: Int, cancelled: Bool) {
        guard let f = foreignPop, f.token == token else { return }
        foreignPop = nil
        if cancelled {
            transitions.append("edge back cancelled coach")
            Self.log.info("screens: the owner let go of the chat's pop: it stays")
        } else if let u = up["coach"] {
            foreignPopped(u, interactive: f.interactive)
        }
        refreshStack()
        if f.holdsQueue { opDone() }
    }

    /// The chat left the stack and ScreenHost did not take it: the owner's Back, latched.
    private func foreignPopped(_ u: Up, interactive: Bool) {
        guard up[u.name] === u else { return }
        if acked.remove(u.name) == nil { latched.insert(u.name) }
        transitions.append((interactive ? "edge back " : "back ") + u.name)
        Self.log.info("screens: \(u.name, privacy: .public) popped by the owner (\(interactive ? "the interactive pop" : "a pop ScreenHost did not make", privacy: .public))")
        removed(u.name, user: true)
    }

    /// The stack is left (the fallback, the teardown): the chat popped without animation, the queue emptied, the latch
    /// gone (a refused Back must not bring the chat back as the overlay), the marker removed, the delegates and the
    /// content pop's state given back.
    private func leaveStack(why: String) {
        guard let s = stack else { return }
        if stackWait != nil || foreignPop?.holdsQueue == true { busy = false }
        stackWait = nil
        stackTimer?.cancel()
        stackTimer = nil
        foreignPop = nil
        ops.removeAll()
        latched.removeAll()
        acked.removeAll()
        let nav = s.nav
        for (name, u) in up where u.kind == .stack {
            up.removeValue(forKey: name)   // first: UIKit's word on this pop finds no chat to call the owner's
            u.host.view.endEditing(true)
            if let nav, nav.viewControllers.contains(where: { $0 === u.host }) {
                nav.setViewControllers(nav.viewControllers.filter { $0 !== u.host }, animated: false)
            }
            transitions.append("drop " + name)
        }
        if let nav {
            if nav.delegate === self { nav.delegate = s.navDelegateWas }
            if let pop = nav.interactivePopGestureRecognizer, pop.delegate === self { pop.delegate = s.popDelegateWas }
            if #available(iOS 26.0, *), let was = s.contentPopWas, let content = nav.interactiveContentPopGestureRecognizer {
                content.isEnabled = was
            }
            if stackStoodDown { nav.view.accessibilityElementsHidden = false }
        }
        stackStoodDown = false
        if let m = stackMarker { markers.remove(m.screen) }
        stackMarker = nil
        chatHeaderBottom = nil
        stack = nil
        overlay.setAnchor(nil)
        Self.log.info("screens: the Coach tab's stack left (\(why, privacy: .public)): a later screen goes up over the page")
    }

    // MARK: The edge pan

    @objc private func edgePan(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let view = g.view else { return }
        let width = max(view.bounds.width, 1)
        let x = g.translation(in: view).x
        switch g.state {
        case .began:
            beginInteractiveBack(from: view)
        case .changed:
            interactive?.transition.update(min(max(x / width, 0), 1))
        case .ended:
            let p = x / width, v = g.velocity(in: view).x
            endInteractiveBack(finish: (p > 0.35 && v > -200) || v > 700)
        default:
            endInteractiveBack(finish: false)
        }
    }

    /// The owner's finger starts taking the screen down: only where the screen offers Back (not during setup) and no
    /// other transition is under way.
    @discardableResult
    func beginInteractiveBack(from view: UIView) -> Bool {
        guard !busy, interactive == nil, let u = up.values.first(where: { $0.host.view === view }), u.kind == .overlay,
              u.presented, let m = model(u.name), m.header.back, !m.intake else { return false }
        busy = true
        let t = UIPercentDrivenInteractiveTransition()
        t.completionCurve = .easeOut
        interactive = (u.name, t)
        slide.interaction = t
        u.host.view.endEditing(true)
        u.host.presentingViewController?.dismiss(animated: true)
        return true
    }

    func updateInteractiveBack(_ progress: CGFloat) {
        interactive?.transition.update(min(max(progress, 0), 1))
    }

    func endInteractiveBack(finish: Bool) {
        guard let i = interactive else { return }
        if finish { i.transition.finish() } else { i.transition.cancel() }
    }

    /// The probe's edge pan, without a finger: begin, follow to `progress`, then let go. In the stack it runs the finished
    /// interactive pop's path (the owner's Back, latched) or, let go early, nothing, where the interactive pop would begin.
    public func simulateEdgeBack(_ screen: String, progress: CGFloat, finish: Bool, done: @escaping (Bool) -> Void) {
        if let u = up[screen], u.kind == .stack {
            guard screen == "coach", stackPopAllowed() else { return done(false) }
            if finish {
                busy = true
                runPop(screen, user: true, edge: true)
            } else {
                transitions.append("edge back cancelled " + screen)
            }
            return done(true)
        }
        guard let u = up[screen], beginInteractiveBack(from: u.host.view) else { done(false); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            MainActor.assumeIsolated {
                self.updateInteractiveBack(progress)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                    MainActor.assumeIsolated {
                        self.endInteractiveBack(finish: finish)
                        done(true)
                    }
                }
            }
        }
    }

    private func transitionEnded(presenting: Bool, completed: Bool) {
        guard !presenting, let i = interactive else { return }
        interactive = nil
        slide.interaction = nil
        if completed {
            if acked.remove(i.screen) == nil { latched.insert(i.screen) }
            transitions.append("edge back " + i.screen)
            removed(i.screen, user: true)
        } else {
            transitions.append("edge back cancelled " + i.screen)
        }
        opDone()
    }

    // MARK: Markers follow the app's activity

    /// The app stops being active, or goes to the background: no marker while it is away (a kill there is no crash).
    @objc private func willResignActive() {
        away = true
        for (name, u) in up where u.kind == .overlay { markers.remove(name) }
        refreshStackMarker()
    }

    @objc private func didBecomeActive() {
        away = false
        for (name, u) in up where u.kind == .overlay { markers.write(name, page: pageBuild ?? "unknown", shell: shellBuild) }
        refreshStackMarker()
    }

    // MARK: VoiceOver's escape

    /// VoiceOver's escape (a two-finger scrub) on a native screen goes back, as a navigation stack's pops: Back where the
    /// screen offers it, Cancel during setup (the page asks first, its confirm forwarded). False where it offers neither.
    func escape(_ screen: String) -> Bool {
        guard let u = up[screen], u.presented, let m = model(screen) else { return false }
        if m.intake {
            guard m.header.cancel else { return false }
            hooks.send(.coachCancelIntake)
            return true
        }
        guard m.header.back else { return false }
        userBack(screen)
        return true
    }

    // MARK: The system text size

    /// The phone's text size changed with a screen or a toast up: the overlay's toasts follow it at once (the chat itself
    /// follows its traits), clamped by the model's toggle as the chat's are.
    @objc private func textSizeChanged(_ note: Notification) {
        let raw = note.userInfo?[UIContentSizeCategory.newValueUserInfoKey]
        let category = (raw as? UIContentSizeCategory) ?? (raw as? String).map(UIContentSizeCategory.init(rawValue:))
            ?? UIApplication.shared.preferredContentSizeCategory
        textSize = DynamicTypeSize(category) ?? .large
        if let m = coach.model { overlay.setRoom(RoomTheme(model: m, system: textSize ?? Self.systemTextSize)) }
    }

    /// The system text size the screens draw at (clamped by the model's toggle in RoomTheme).
    static var systemTextSize: DynamicTypeSize {
        DynamicTypeSize(UITraitCollection.current.preferredContentSizeCategory) ?? .large
    }

    // MARK: For the probe

    /// The view of a screen that is up (the probe's presses find its controls there).
    func hostView(_ screen: String) -> UIView? { up[screen]?.host.view }

    /// The first text field or view of the screen up (the probe's tap into the native composer); in the stack, of the
    /// screen on top of it (the pushed chat's composer, the hub's key field).
    func firstTextInput() -> UIView? {
        if let nav = stack?.nav { return nav.topViewController?.viewIfLoaded.flatMap(Self.textInput(in:)) }
        return up.values.first.flatMap { Self.textInput(in: $0.host.view) }
    }

    static func textInput(in v: UIView) -> UIView? {
        if v is UITextView || v is UITextField { return v }
        for s in v.subviews { if let f = textInput(in: s) { return f } }
        return nil
    }

    /// The chat's conversation (SwiftUI's ScrollView is a UIScrollView): the tallest scroll view of the screen up that is
    /// not a text view (the composer) and scrolls up and down (a table's own scrolls sideways).
    func conversationScroll() -> UIScrollView? {
        var best: UIScrollView?
        func walk(_ v: UIView) {
            if let s = v as? UIScrollView, !(s is UITextView), s.contentSize.width <= s.bounds.width + 1,
               s.bounds.height > (best?.bounds.height ?? 0) { best = s }
            v.subviews.forEach(walk)
        }
        if let u = up["coach"] { walk(u.host.view) }
        return best
    }

    /// Where the conversation is scrolled: from its top, and how far its end is below the visible part (0 at the end).
    func conversationScrollState() -> [String: Any]? {
        guard let s = conversationScroll() else { return nil }
        let inset = s.adjustedContentInset
        let visible = s.bounds.height - inset.top - inset.bottom
        let top = s.contentOffset.y + inset.top
        return ["offset": Double(top), "content": Double(s.contentSize.height), "visible": Double(visible),
                "fromEnd": Double(max(0, s.contentSize.height - visible - top)), "dragging": s.isDragging || s.isDecelerating]
    }

    /// What a state check reports: each screen's `host` (`stack` or `overlay`, contract 15.3), and the stack's state.
    public func describe() -> [String: Any] {
        var screens: [String: Any] = [:]
        for (name, u) in up {
            guard let m = name == "coach" ? coach.display : nil else { continue }
            let traits = u.host.view.traitCollection
            let input = Self.textInput(in: u.host.view)
            screens[name] = [
                "host": u.kind == .stack ? "stack" : "overlay",
                "presented": u.presented,
                "hidesBar": u.host.hidesBottomBarWhenPushed,
                "style": u.host.modalPresentationStyle.rawValue,
                "overFullScreen": u.host.modalPresentationStyle == .overFullScreen,
                "interfaceStyle": u.host.overrideUserInterfaceStyle.rawValue,
                "drawnStyle": traits.userInterfaceStyle.rawValue,
                "contentSize": traits.preferredContentSizeCategory.rawValue,
                "rev": m.rev,
                "boot": m.boot,
                "room": m.room.id,
                "dynTypeOn": m.dynTypeOn,
                "messages": m.messages.count,
                "loading": m.loading,
                "draft": coach.draft.text,
                "modelLabel": m.header.model?.label ?? NSNull(),
                "last": m.messages.last.map { $0.role == .user ? "user" : "coach" } ?? NSNull(),
                "modal": u.host.view.accessibilityViewIsModal,
                "inWindow": u.host.view.window != nil,
                "composerFrame": input.map { NSCoder.string(for: $0.convert($0.bounds, to: nil)) } ?? NSNull(),
                "composerFocused": input?.isFirstResponder ?? false,
                "scroll": conversationScrollState() ?? NSNull(),
            ] as [String: Any]
        }
        return [
            "up": shown, "screens": screens, "latched": latched.sorted(), "ops": ops.count, "busy": busy,
            "webViewInWindow": webView?.window != nil, "webViewA11yHidden": webView?.accessibilityElementsHidden ?? NSNull(),
            "overlay": overlay.describe(), "markers": markers.lines(), "transitions": transitions, "restored": restored,
            "coach": coach.describe(), "mode": stack != nil ? "stack" : "overlay", "stack": describeStack(),
        ]
    }

    /// The stack's state for the probe: `selected`, `held`, `depth`, `top` (`coach` with the chat on top, `root` for the
    /// stack's root), `interactivePop` (whether it would begin now), `contentPop` (iOS 26's content pop on: false while
    /// attached, null below iOS 26), and what is under way.
    private func describeStack() -> Any {
        guard let s = stack else { return NSNull() }
        let nav = s.nav
        var top: Any = NSNull()
        if let t = stackTop() { top = t } else if nav?.topViewController != nil { top = "root" }
        var contentPop: Any = NSNull()
        if #available(iOS 26.0, *), let content = nav?.interactiveContentPopGestureRecognizer { contentPop = content.isEnabled }
        return [
            "selected": s.state.selected(), "native": s.state.native(), "held": s.state.held(),
            "depth": nav?.viewControllers.count ?? 0, "top": top, "interactivePop": stackPopAllowed(),
            "contentPop": contentPop,
            "inWindow": nav?.view.window != nil, "waiting": stackWait?.what ?? NSNull(),
            "foreignPop": foreignPop.map { $0.interactive ? "interactive" : "pop" } ?? NSNull(),
            "standingDown": stackStoodDown,
        ] as [String: Any]
    }
}

// MARK: - The stack's delegates

/// While attached, ScreenHost is the Coach tab's navigation delegate (UIKit's word on pushes and pops) and its interactive
/// pop's delegate (where the owner's finger may begin).
extension ScreenHost: UINavigationControllerDelegate, UIGestureRecognizerDelegate {
    public func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController,
                                     animated: Bool) {
        stackWillShow(navigationController)
    }

    public func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController,
                                     animated: Bool) {
        stackDidShow(navigationController, viewController)
    }

    /// The interactive pop begins only where the edge pan's rule allows it (never at the stack's root).
    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let nav = stack?.nav, gestureRecognizer === nav.interactivePopGestureRecognizer else { return true }
        return stackPopAllowed()
    }
}

// MARK: - Presenting

/// How a native screen's controller goes over the page and comes off it.
@MainActor
protocol ScreenPresenting: AnyObject {
    func present(_ screen: UIViewController, from presenter: UIViewController, animated: Bool, completion: @escaping () -> Void)
    func dismiss(_ screen: UIViewController, animated: Bool, completion: @escaping () -> Void)
}

/// UIKit's presentation, from the top of whatever the page's controller already presents (a share sheet, say).
@MainActor
final class UIKitPresenting: ScreenPresenting {
    func present(_ screen: UIViewController, from presenter: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        var top = presenter
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        top.present(screen, animated: animated, completion: completion)
    }

    func dismiss(_ screen: UIViewController, animated: Bool, completion: @escaping () -> Void) {
        guard let presenting = screen.presentingViewController else {
            completion()
            return
        }
        presenting.dismiss(animated: animated, completion: completion)
    }
}

// MARK: - The hosting controller

/// A native screen's controller: the room's status bar, VoiceOver's escape (ScreenHost: Back, or Cancel in setup), and
/// a hardware keyboard's Cmd+Return (the chat: Send).
final class ScreenHostingController: UIHostingController<AnyView> {
    var paper = true {
        didSet { if paper != oldValue { setNeedsStatusBarAppearanceUpdate() } }
    }
    /// What VoiceOver's escape does (UIKit asks the focused element, then its ancestors up to this controller).
    var escape: () -> Bool = { false }
    /// What a hardware keyboard's Cmd+Return does on this screen (the chat: Send, as the web composer's Cmd/Ctrl+Enter
    /// sends from anywhere); nil offers none.
    var commandReturn: (() -> Void)?

    override var preferredStatusBarStyle: UIStatusBarStyle { paper ? .darkContent : .lightContent }

    override func accessibilityPerformEscape() -> Bool { escape() }

    /// UIKit's own key command, on the controller the composer's text view answers to: it runs ahead of the text view's
    /// handling of Return (`wantsPriorityOverSystemBehavior`), so the words go rather than a new line.
    override var keyCommands: [UIKeyCommand]? {
        guard commandReturn != nil else { return super.keyCommands }
        let send = UIKeyCommand(title: "Send message", action: #selector(commandReturnPressed(_:)), input: "\r", modifierFlags: .command)
        send.wantsPriorityOverSystemBehavior = true
        return (super.keyCommands ?? []) + [send]
    }

    @objc func commandReturnPressed(_ sender: UIKeyCommand) { commandReturn?() }
}

// MARK: - The coach screen

/// The SwiftUI chat (FPUI Coach, plan task C6) on the live store (C7): the page's model with the owner's messages on
/// their way, the composer the store keeps; its toast and confirm go to ScreenHost's window, and where its header ends
/// goes to ScreenHost (the toast's anchor).
struct CoachScreenRoot: View {
    @ObservedObject var store: CoachStore
    let overlay: ShellOverlay
    /// Where the chat's header ends, in window coordinates, each time it changes (0: not laid out).
    let headerBottom: (CGFloat) -> Void

    var body: some View {
        if let model = store.display {
            CoachChatView(model: model, host: store.host,
                          toast: Binding(get: { overlay.toast }, set: { overlay.show(toast: $0) }),
                          confirm: .constant(nil), options: CoachChatOptions(hostDrawsOverlays: true))
                .onPreferenceChange(CoachHeaderBottomKey.self) { y in
                    MainActor.assumeIsolated { headerBottom(y) }
                }
        }
    }
}

// MARK: - Crash markers

/// One file per screen up, `Application Support/FPShell/presenting.<screen>.marker`, holding the marker line.
struct ScreenMarkers {
    let folder: URL

    func url(_ screen: String) -> URL { folder.appendingPathComponent("presenting.\(screen).marker") }

    func write(_ screen: String, page: String, shell: String) {
        let line = CrashMarker(piece: .screen(screen), pageBuild: page, shellBuild: shell).line + "\n"
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? Data(line.utf8).write(to: url(screen), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func remove(_ screen: String) {
        try? FileManager.default.removeItem(at: url(screen))
    }

    /// The marker files there now (what the last launch left, read at launch).
    func found(defaultShell: String) -> [(url: URL, marker: CrashMarker?)] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        return names.filter { $0.hasPrefix("presenting.") && $0.hasSuffix(".marker") }.sorted().map { name in
            let u = folder.appendingPathComponent(name)
            let text = (try? String(contentsOf: u, encoding: .utf8)) ?? ""
            let line = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
            return (u, CrashMarker(line: line, defaultShell: defaultShell))
        }
    }

    func lines() -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        return names.filter { $0.hasSuffix(".marker") }.sorted().compactMap {
            (try? String(contentsOf: folder.appendingPathComponent($0), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }
}

// MARK: - The toast window

/// The window above every screen where forwarded toasts and confirms show (decision.md section 7: "toasts and confirms
/// at window level"), in the room of the newest model, `overrideUserInterfaceStyle` from its `paper`. A toast sits 8 px
/// under the chat's header while the chat is up (the web chat's place), else under the status bar; the window is only
/// as big as the toast, so the rest of the screen takes touches as before. A confirm fills the screen (dimmed, a tap
/// outside cancels), and the window is key while it is open, so VoiceOver and the keyboard stay with it.
@MainActor
final class ShellOverlay {
    private(set) var toast: ToastRequest?
    private(set) var confirm: ConfirmRequest?
    private(set) var theme = RoomTheme.defaults(.heavyweight)
    /// The chat header's bottom in window coordinates, while the chat is up.
    private(set) var anchor: CGFloat?
    var answer: (ConfirmRequest, Bool) -> Void = { _, _ in }
    var undo: (String) -> Void = { _ in }

    private var window: OverlayWindow?
    private var host: UIHostingController<OverlayRoot>?
    /// The window while it shows something (the probe's presses find the confirm's buttons there).
    var windowView: UIView? { window.flatMap { $0.isHidden ? nil : $0 } }
    private var hideToast: DispatchWorkItem?
    private weak var previousKey: UIWindow?

    func setRoom(_ t: RoomTheme) {
        guard t != theme else { return }
        theme = t
        layout()
    }

    func setAnchor(_ y: CGFloat?) {
        guard y != anchor else { return }
        anchor = y
        layout()
    }

    func show(toast t: ToastRequest?) {
        hideToast?.cancel()
        hideToast = nil
        toast = t
        if let t {
            if UIAccessibility.isVoiceOverRunning {
                UIAccessibility.post(notification: .announcement, argument: t.text)
            }
            let work = DispatchWorkItem { [weak self] in
                MainActor.assumeIsolated { if self?.toast == t { self?.show(toast: nil) } }
            }
            hideToast = work
            DispatchQueue.main.asyncAfter(deadline: .now() + t.duration, execute: work)
        }
        layout()
    }

    func show(confirm c: ConfirmRequest?) {
        let was = confirm
        confirm = c
        layout()
        if c != nil, was == nil, let window {
            previousKey = window.windowScene?.windows.first { $0.isKeyWindow && $0 !== window }
            window.makeKey()
            UIAccessibility.post(notification: .screenChanged, argument: host?.view)
        } else if c == nil, was != nil {
            previousKey?.makeKey()
            previousKey = nil
            UIAccessibility.post(notification: .screenChanged, argument: nil)
        }
    }

    private func scene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }

    private func content(toast: ToastRequest?, confirm: ConfirmRequest?) -> OverlayRoot {
        OverlayRoot(toast: toast, confirm: confirm, theme: theme, anchor: anchor,
                    answer: { [weak self] c, yes in self?.answer(c, yes) },
                    undo: { [weak self] t in
                        if let id = t.undo { self?.undo(id) }
                        self?.show(toast: nil)
                    })
    }

    /// The window's frame: the whole screen for a confirm, the toast's own strip for a toast, hidden for neither. The
    /// toast is measured on a controller of its own, so the strip fits the toast being shown, not the one before it.
    private func layout() {
        guard toast != nil || confirm != nil else {
            window?.isHidden = true
            return
        }
        if window == nil {
            guard let scene = scene() else { return }
            let w = OverlayWindow(windowScene: scene)
            w.windowLevel = .normal + 1
            w.backgroundColor = .clear
            let h = UIHostingController(rootView: content(toast: toast, confirm: confirm))
            h.view.backgroundColor = .clear
            h.safeAreaRegions = []
            w.rootViewController = h
            window = w
            host = h
        }
        guard let window, let host else { return }
        window.overrideUserInterfaceStyle = theme.interfaceStyle
        host.overrideUserInterfaceStyle = theme.interfaceStyle
        host.rootView = content(toast: toast, confirm: confirm)
        let screen = window.windowScene?.screen.bounds ?? UIScreen.main.bounds
        if confirm != nil {
            window.frame = screen
        } else {
            let top = anchor ?? (window.windowScene?.windows.first { $0.isKeyWindow && $0 !== window }?.safeAreaInsets.top ?? 47)
            let height = toast.map { Self.toastHeight($0, theme: theme, width: screen.width) } ?? 0
            window.frame = CGRect(x: 0, y: top + theme.px(8), width: screen.width, height: height)
        }
        window.isHidden = false
    }

    /// The toast's strip at this width: the toast measured on a controller of its own, so it is the toast being shown
    /// (a hosting controller reused across toasts measured the one before it: a strip of no height once drew a toast
    /// centred on its top edge, over the chat's header).
    static func toastHeight(_ toast: ToastRequest, theme: RoomTheme, width: CGFloat) -> CGFloat {
        let root = OverlayRoot(toast: toast, confirm: nil, theme: theme, anchor: nil, answer: { _, _ in }, undo: { _ in })
        let measure = UIHostingController(rootView: root)
        measure.safeAreaRegions = []
        return ceil(measure.sizeThatFits(in: CGSize(width: width, height: 2000)).height)
    }

    func describe() -> [String: Any] {
        [
            "toast": toast?.text ?? NSNull(), "toastUndo": toast?.undo ?? NSNull(), "confirm": confirm?.id ?? NSNull(),
            "interfaceStyle": window?.overrideUserInterfaceStyle.rawValue ?? NSNull(), "visible": window.map { !$0.isHidden } ?? false,
            "key": window?.isKeyWindow ?? false, "frame": window.map { NSCoder.string(for: $0.frame) } ?? NSNull(),
            "anchor": anchor.map { Double($0) } ?? NSNull(),
        ]
    }

    /// The probe answers the open confirm as a tap would.
    func tapConfirm(_ yes: Bool) -> Bool {
        guard let c = confirm else { return false }
        answer(c, yes)
        return true
    }

    /// The probe taps the toast's Undo.
    func tapUndo() -> Bool {
        guard let t = toast, let id = t.undo else { return false }
        undo(id)
        show(toast: nil)
        return true
    }
}

/// The overlay's window: only its content takes touches (a confirm's whole screen, a toast's strip).
final class OverlayWindow: UIWindow {}

/// What the toast window draws: the confirm sheet over a dimmed screen, the toast in its strip (or over the confirm at
/// the toast's place), in the room.
struct OverlayRoot: View {
    let toast: ToastRequest?
    let confirm: ConfirmRequest?
    let theme: RoomTheme
    let anchor: CGFloat?
    let answer: (ConfirmRequest, Bool) -> Void
    let undo: (ToastRequest) -> Void

    var body: some View {
        let t = theme
        ZStack(alignment: .top) {
            if let c = confirm {
                CoachConfirmSheet(confirm: c) { yes in answer(c, yes) }
            }
            if let toast {
                CoachToastView(toast: toast) { undo(toast) }
                    .padding(.horizontal, t.px(20))
                    .padding(.top, confirm != nil ? (anchor ?? 47) + t.px(8) : 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: confirm != nil ? .infinity : nil, alignment: .top)
        .environment(\.roomTheme, t)
        .environment(\.colorScheme, t.colorScheme)
    }
}
#endif
