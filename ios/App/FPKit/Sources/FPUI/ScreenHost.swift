#if os(iOS)
import SwiftUI
import UIKit
import WebKit
import os.log
import FPCore

/// Where native screens go up over the page and come down again (plan task C5; decision.md section 7).
///
/// - **`.overFullScreen` only**, with a push-like slide (ScreenSlideTransition) and the owner's edge pan back: the page's web
///   view never leaves its window under a screen, so the page stays visible to itself (no `visibilitychange`, no leave
///   and return path, `_wristLive`'s window untouched). A `.fullScreen` presentation, a push of the bridge controller or
///   a second bridge would hide it; none is ever made here.
/// - **One transition at a time**: present and dismiss requests queue and run in order, each after the one before has
///   finished (UIKit refuses a presentation while another is under way); a dismissal queued right behind a present
///   that has not started cancels both.
/// - **The owner's dismissal is latched**: Back or the edge pan takes the screen down at once and the page hears
///   `coach.back`. The page's own dismiss that follows finds it gone. If the page did not leave the screen (Back
///   refused, or the bridge failed), it goes up again, since the page still shows its placeholder under it.
/// - **The shell owns focus**: before a screen covers the page, the page's focused field is blurred through the bridge
///   (`shell.covered {on:true}`) and editing ends in the web view, so UIKit has no keyboard to bring back when it hands
///   first responder to the web view after the dismissal; the descriptor's `hasInitialFocus` is false (AppDelegate).
/// - **VoiceOver** reads the screen alone: the web view is hidden from it while covered, and the screen is modal.
/// - **The room, not the phone**: every hosting controller and the toast window take `overrideUserInterfaceStyle` from
///   the model's `paper` (light for Heavyweight, dark for Lime), so the keyboard, the photo picker and menus match.
/// - **Crash markers**: while a screen is up, `presenting <screen>@<page build> shell <shell build>` sits in its marker
///   file, removed when the screen goes and whenever the app stops being active (written again when it comes back with
///   the screen still up), so only a death on screen leaves one. ShellBridge reads them at launch.
/// - **Toasts and confirms** the page forwards while covered show in a window above every screen (`ShellOverlay`), so
///   one outlives the screen it was shown over.
@MainActor
public final class ScreenHost: NSObject {
    /// What ScreenHost needs from the shell (ShellBridge).
    public struct Hooks {
        /// The owner's answer to a confirm, a toast's Undo. Back and the edge pan arrive as `userDismissed`.
        public var send: (Intent) -> Void = { _ in }
        /// An intent from a screen's control (Send, Undo, the model switch, ...) and how it ended: the chat's store
        /// follows what became of each message the owner sent (plan task C7).
        public var ask: (Intent, @escaping (PageLink.Outcome) -> Void) -> Void = { _, done in done(.notLinked) }
        /// The page is about to be covered: blur its field through the bridge (`shell.covered {on:true}`).
        public var willCover: () -> Void = {}
        /// Nothing native covers the page any more (`shell.covered {on:false}`).
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
    public var pageBuild: String?
    let markers: ScreenMarkers
    let overlay = ShellOverlay()

    /// A screen up or going up.
    final class Up {
        let name: String
        let host: ScreenHostingController
        var presented = false
        init(name: String, host: ScreenHostingController) {
            self.name = name
            self.host = host
        }
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
    /// Presentations and dismissals made (for the probe).
    public private(set) var transitions: [String] = []
    /// Slides in and out (the edge pan always animates).
    var animated = true
    /// How a screen's controller goes up and comes down: UIKit's presentation (tests without a window scene, where UIKit
    /// never finishes one, put a stand-in).
    var presenting: ScreenPresenting = UIKitPresenting()

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
        nc.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    /// The screens up now (presented or going up), in name order.
    public var shown: [String] { up.keys.sorted() }

    public func isUp(_ screen: String) -> Bool { up[screen] != nil }

    /// The model a screen shows (the page's newest).
    public func model(_ screen: String) -> CoachModel? { screen == "coach" ? coach.model : nil }

    // MARK: Requests from the page (through ShellBridge)

    /// The page's `present`. The model must have come first (the page pushes it before presenting).
    @discardableResult
    public func present(_ screen: String) -> Bool {
        guard model(screen) != nil else { return false }
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
        let theme = RoomTheme(model: model, system: Self.systemTextSize)
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
    /// for VoiceOver until it is answered.
    public func confirm(_ c: ConfirmRequest) {
        for u in up.values {
            u.host.view.endEditing(true)
            u.host.view.accessibilityElementsHidden = true
        }
        overlay.show(confirm: c)
    }

    /// The document the open confirm came from is gone: it closes unanswered (the page would answer stale).
    public func closeConfirmAsStale() {
        guard let c = overlay.confirm else { return }
        Self.log.info("screens: confirm \(c.id, privacy: .public) closed: its document is gone (stale)")
        overlay.show(confirm: nil)
        for u in up.values { u.host.view.accessibilityElementsHidden = false }
    }

    /// The open confirm's id, if one is open.
    public var openConfirm: String? { overlay.confirm?.id }
    public var shownToast: ToastRequest? { overlay.toast }

    private func answer(_ c: ConfirmRequest, yes: Bool) {
        overlay.show(confirm: nil)
        for u in up.values { u.host.view.accessibilityElementsHidden = false }
        hooks.send(c.answer(yes))
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
    /// messages still on their way go back in the composer, kept for the next chat.
    public func tearDown() {
        ops.removeAll()
        for u in up.values {
            markers.remove(u.name)
            u.host.presentingViewController?.dismiss(animated: false)
        }
        up.removeAll()
        latched.removeAll()
        overlay.show(confirm: nil)
        overlay.show(toast: nil)
        webView?.accessibilityElementsHidden = false
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
        case .present(let s): runPresent(s)
        case .dismiss(let s, let user): runDismiss(s, user: user)
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
        markers.write(screen, page: pageBuild ?? "unknown", shell: shellBuild)
        let root = CoachScreenRoot(store: coach, overlay: overlay)
        let host = ScreenHostingController(rootView: AnyView(root))
        host.paper = model.paper
        host.modalPresentationStyle = .overFullScreen   // never .fullScreen: the page stays in its window
        host.modalPresentationCapturesStatusBarAppearance = true
        host.transitioningDelegate = slide
        host.overrideUserInterfaceStyle = model.paper ? .light : .dark
        host.view.backgroundColor = .clear
        host.view.accessibilityViewIsModal = true
        let pan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgePan(_:)))
        pan.edges = .left
        host.view.addGestureRecognizer(pan)
        let u = Up(name: screen, host: host)
        up[screen] = u
        precondition(host.modalPresentationStyle == .overFullScreen, "a native screen is presented over the page, never instead of it")
        transitions.append("present " + screen)
        Self.log.info("screens: presenting \(screen, privacy: .public) (rev \(model.rev), \(model.paper ? "paper" : "dark", privacy: .public))")
        presenting.present(host, from: presenter, animated: animated) { [weak self, weak u] in
            guard let self, let u else { return }
            u.presented = true
            self.webView?.accessibilityElementsHidden = true
            UIAccessibility.post(notification: .screenChanged, argument: nil)
            self.opDone()
        }
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

    /// The screen is gone: its marker, the page uncovered once nothing covers it, the owner's back told to the page.
    private func removed(_ screen: String, user: Bool) {
        guard up.removeValue(forKey: screen) != nil else { return }
        markers.remove(screen)
        if up.isEmpty {
            webView?.accessibilityElementsHidden = false
            hooks.didUncover()
        }
        UIAccessibility.post(notification: .screenChanged, argument: nil)
        Self.log.info("screens: \(screen, privacy: .public) down (\(user ? "the owner's back" : "the page's dismiss", privacy: .public))")
        if user { hooks.userDismissed(screen) }
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
        guard !busy, interactive == nil, let u = up.values.first(where: { $0.host.view === view }), u.presented,
              let m = model(u.name), m.header.back, !m.intake else { return false }
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

    /// The probe's edge pan, without a finger: begin, follow to `progress`, then let go.
    public func simulateEdgeBack(_ screen: String, progress: CGFloat, finish: Bool, done: @escaping (Bool) -> Void) {
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

    @objc private func willResignActive() {
        for name in up.keys { markers.remove(name) }
    }

    @objc private func didBecomeActive() {
        for name in up.keys { markers.write(name, page: pageBuild ?? "unknown", shell: shellBuild) }
    }

    /// The system text size the screens draw at (clamped by the model's toggle in RoomTheme).
    static var systemTextSize: DynamicTypeSize {
        DynamicTypeSize(UITraitCollection.current.preferredContentSizeCategory) ?? .large
    }

    // MARK: For the probe

    /// The view of a screen that is up (the probe's presses find its controls there).
    func hostView(_ screen: String) -> UIView? { up[screen]?.host.view }

    /// The first text field or view of the screen up (the probe's tap into the native composer).
    func firstTextInput() -> UIView? {
        func find(_ v: UIView) -> UIView? {
            if v is UITextView || v is UITextField { return v }
            for s in v.subviews { if let f = find(s) { return f } }
            return nil
        }
        return up.values.first.flatMap { find($0.host.view) }
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

    /// What a state check reports.
    public func describe() -> [String: Any] {
        var screens: [String: Any] = [:]
        for (name, u) in up {
            guard let m = name == "coach" ? coach.display : nil else { continue }
            let traits = u.host.view.traitCollection
            screens[name] = [
                "presented": u.presented,
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
                "composerFrame": firstTextInput().map { NSCoder.string(for: $0.convert($0.bounds, to: nil)) } ?? NSNull(),
                "composerFocused": firstTextInput()?.isFirstResponder ?? false,
                "scroll": conversationScrollState() ?? NSNull(),
            ] as [String: Any]
        }
        return [
            "up": shown, "screens": screens, "latched": latched.sorted(), "ops": ops.count, "busy": busy,
            "webViewInWindow": webView?.window != nil, "webViewA11yHidden": webView?.accessibilityElementsHidden ?? NSNull(),
            "overlay": overlay.describe(), "markers": markers.lines(), "transitions": transitions, "restored": restored,
            "coach": coach.describe(),
        ]
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

/// A native screen's controller: the room's status bar.
final class ScreenHostingController: UIHostingController<AnyView> {
    var paper = true {
        didSet { if paper != oldValue { setNeedsStatusBarAppearanceUpdate() } }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { paper ? .darkContent : .lightContent }
}

// MARK: - The coach screen

/// The SwiftUI chat (FPUI Coach, plan task C6) on the live store (C7): the page's model with the owner's messages on
/// their way, the composer the store keeps; its toast and confirm go to ScreenHost's window.
struct CoachScreenRoot: View {
    @ObservedObject var store: CoachStore
    let overlay: ShellOverlay

    var body: some View {
        if let model = store.display {
            CoachChatView(model: model, host: store.host,
                          toast: Binding(get: { overlay.toast }, set: { overlay.show(toast: $0) }),
                          confirm: .constant(nil), options: CoachChatOptions(hostDrawsOverlays: true))
                .onPreferenceChange(CoachHeaderBottomKey.self) { y in
                    MainActor.assumeIsolated { overlay.setAnchor(y > 0 ? y : nil) }
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
