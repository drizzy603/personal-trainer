#if os(iOS)
import UIKit
import WebKit
import os.log
import FPCore

/// The tab root (build 61; contract 1.3, 1.4, 6.1, 7, 8; 11-shell.md H4 as delta section 14 changed it): the iPhone's
/// glass tab bar over Log, Progress, Coach and Settings, with one web view (the SuperoViewController's, one page, one
/// bridge per scene) moved between the slots and never out of the window.
///
/// - **One funnel** (contract 8.1, I2): `select(_:source:)` is the only thing that changes the selected tab. A tap reaches
///   it through `tabBarController(_:shouldSelect:)`, which answers false; a set of `selectedIndex` or
///   `selectedViewController` from anywhere else is a stray: counted, logged as a fault and redirected through the funnel
///   (every route H0 found goes through `shouldSelect`, so no stray is ever the owner's).
/// - **Park, select, place** (M1, delta 14.4): in one turn the web view goes into the parking view (in the window for the
///   root's whole life), the index changes inside `performWithoutAnimation`, the view goes into the destination's
///   container, and only then does the web controller's containment move (the other order traps in UIKit's hierarchy
///   check). `addSubview` only, never `removeFromSuperview`. Under M1 the web controller gets a lone `viewDidAppear` per
///   switch and no other appearance callback: nothing here relies on any (Capacitor's `hasInitialFocus` stays false).
/// - **Behind the native Coach tab** (contract 8.2): while Coach is selected and WAITING or NATIVE the web view waits in
///   the Coach slot, in the window, hidden and hidden from VoiceOver; the page still counts as visible. `covered` goes
///   to the page before the move into such a tab and after the move out of it (contract 8.4); editing ends first (8.5).
/// - **The hold** (contract 8.1, D34): entering a NATIVE Coach tab whose chat is not pushed, for a page selection that
///   will show the chat or setup, a warm share, or while the newest hub model says the chat resumes, keeps the home at
///   alpha 0 (the room's ground shows) until the chat's push ends it (`releaseHold()`, which posts nothing: ScreenHost
///   announces the chat) or 0.5 s pass (the home shows and VoiceOver hears it).
/// - **The bar** (contract 3.4, 7.1, 7.4; delta 14.1, 14.3, 14.5): hidden while a sheet is open on a web tab (a native
///   Coach tab keeps it) and for good after the fallback; `h` is 0 while hidden, else the bar frame's cover of the web
///   view's bottom edge (83 under the iOS 26+ glass bar), `safe` the window's bottom inset. No safe-area hold: nothing
///   touches the web controller's insets (UIKit ignores a negative one), and the Coach stack keeps the bar's cover as its
///   bottom inset. `tabBarMinimizeBehavior` is `.never` (the hub's scroll view would minimize the bar), and the web view's
///   bottom scroll-edge effect is hidden (it dimmed the page above the bar on iOS 26.5).
/// - **The room** (contract 6.1, D16): TabBarLook paints the bar and the Coach stack, never the window, this controller or
///   a slot.
/// - **The fallback** (contract 10.3): the bar hidden for good, the Coach tab WEB where it stands, and every later
///   selection answered with the current state.
///
/// It sends nothing to the page itself: everything goes out through `hooks`, which ShellBridge fills (H7). The web
/// controller stays the controller Capacitor presents from, always in the selected slot, so its presentations work on
/// every tab. iOS 26 and later only (H2's gate builds it nowhere else, D39).
@available(iOS 26.0, *)
@MainActor
public final class RootTabController: UITabBarController, UITabBarControllerDelegate {
    /// Where a selection came from (contract 8.1).
    public enum Source: Equatable, Sendable {
        /// The owner's tap (and every route UIKit takes through `shouldSelect`).
        case tap
        /// The page's `selectTab {tab, intent?}`.
        case page(intent: String?)
        /// `trovo://start` (`share: false`) or `trovo://share` (held).
        case deepLink(share: Bool)
        /// The first frame.
        case initial
        /// A set of the selection outside the funnel, redirected.
        case stray
        /// The scene's fallback: for completeness only, it changes no selection.
        case fallback

        public var word: String {
            switch self {
            case .tap: return "tap"
            case .page: return "page"
            case .deepLink: return "deepLink"
            case .initial: return "initial"
            case .stray: return "stray"
            case .fallback: return "fallback"
            }
        }
    }

    /// The Coach tab's modes, per scene (contract 1.4, I13): WAITING only from the scene's start until its first
    /// declaration; NATIVE with the home at the stack's root; WEB with the web view showing in the Coach slot.
    public enum CoachMode: String, Sendable {
        case waiting, native, web
    }

    /// What the root tells the shell (ShellBridge, H7); it sends nothing to the page itself.
    public struct Hooks {
        /// `shell.covered {on}`: before a move into a WAITING or NATIVE Coach tab, after a move out of one, and when the
        /// selected Coach tab turns NATIVE or WEB.
        public var covered: (Bool) -> Void = { _ in }
        /// A selection ran: the tab, its seq, the source, and whether it was the owner's re-tap (`again`).
        public var selected: (String, Int, Source, Bool) -> Void = { _, _, _, _ in }
        /// A stray was counted (the tab it asked for, or "index n" for none).
        public var stray: (String) -> Void = { _ in }
        /// The shell's own change of the bar's numbers (`tabs.bar`): a selection that hides or shows it, a safe-area or
        /// trait change that moves it. Not for `setSheets`, whose answer carries the numbers.
        public var barChanged: (BarMetrics) -> Void = { _ in }
        /// The `tabs` short section (contract 10.2): true as a funnel run, a bar hide or show, a mode change of the
        /// selected Coach tab or the fallback begins, false when it is done (a show when its animation is, `showSection`
        /// at most).
        public var section: (Bool) -> Void = { _ in }
        /// Whether Coach is selected and not WEB, after every selection, mode change and hold that ends by its time
        /// (ScreenHost's `selectionChanged()` follows it: markers, the toast's anchor, ops waiting on the stack).
        public var coachShown: (Bool) -> Void = { _ in }
        public init() {}
    }

    /// One selection (contract 15.3): `moved` is false for the owner's re-tap.
    public struct FunnelRun: Equatable, Sendable {
        public let source: Source
        public let from: String?
        public let to: String
        public let seq: Int
        public let moved: Bool
        /// Epoch milliseconds at the run's start and end.
        public let t0: Double
        public let t1: Double

        public var json: [String: Any] {
            var o: [String: Any] = ["source": source.word, "from": from ?? NSNull(), "to": to, "seq": seq, "moved": moved,
                                    "t0": t0, "t1": t1]
            switch source {
            case .page(let intent): o["intent"] = intent ?? NSNull()
            case .deepLink(let share): o["share"] = share
            default: break
            }
            if !moved { o["again"] = true }
            return o
        }
    }

    private struct BarNumbers: Equatable {
        let h: Int
        let safe: Int
    }

    /// The end of an animated show's section, said once by whichever comes first.
    @MainActor
    private final class SectionEnd {
        private var hooks: Hooks?
        init(_ hooks: Hooks) { self.hooks = hooks }
        func fire() {
            guard let h = hooks else { return }
            hooks = nil
            h.section(false)
        }
    }

    static let log = Logger(subsystem: "app.kt.trainer", category: "tabs")

    /// The SuperoViewController (FPUI cannot name its type). Its view is the web view.
    public let web: UIViewController
    public let webView: WKWebView
    public var hooks: Hooks
    public private(set) var look: TabsModel
    /// The room the root was built with: the first frame's, before any TabsModel (contract 6.1: SceneDelegate's Debug
    /// `-devTheme`, else the owner's room as the store holds it, else Heavyweight), as the page's room id.
    public let firstRoom: String
    /// The slots in the bar's order (contract 1.2): three WebSlotControllers and the CoachSlotController.
    let slots: [UIViewController]
    let coachSlot: CoachSlotController
    /// Where the web view passes through during a selection: full-bleed at index 0 of this controller's view, in the
    /// window for the root's whole life.
    let parking = UIView()

    /// The scene's selection counter (contract 8.1).
    public private(set) var seq = 0
    /// Selections made outside the funnel (counted and redirected).
    public private(set) var strays = 0
    /// The page's sheets state (contract 3.4): per document, reset at each document start.
    public private(set) var sheetsOpen = false
    /// Set once by `fallBack(why:at:)` (contract 10.3).
    public private(set) var fellBack: (why: FellBackWhy, at: Date)?
    public private(set) var coachMode: CoachMode = .waiting
    /// The newest hub model's `resume` (contract 6.2; H10 sets it, false until then): the hold for any entry.
    public var coachResume = false
    /// The home is kept blank for a push on its way (contract 8.1).
    public private(set) var held = false
    /// The revision of the bar's numbers: it rises with every change the root measures (the flag's guess is rev 0).
    public private(set) var barRev = 0
    /// The home's route for `describe()` (H10 sets it from the hub's model).
    public var homeRoute: () -> String = { "home" }
#if DEBUG
    /// Every funnel run, for the probe's `funnel` event (H11).
    public var onFunnelRun: ((FunnelRun) -> Void)?
#endif

    /// The hold's budget (tests shorten it).
    var holdBudget: TimeInterval = 0.5
    /// VoiceOver's screen change (tests record it).
    var postScreenChanged: (Any?) -> Void = { UIAccessibility.post(notification: .screenChanged, argument: $0) }
    /// Reduce Motion (tests inject it).
    var reduceMotion: () -> Bool = { UIAccessibility.isReduceMotionEnabled }
    /// Every hide and show the root asked of the bar, with its animation (tests read it).
    private(set) var barCalls: [(hidden: Bool, animated: Bool)] = []

    private var guardDown = false
    private var inRun = false
    private var inBarChange = false
    private var runs: [FunnelRun] = []
    private var lastBar: BarNumbers?
    private var holdWork: DispatchWorkItem?
    private weak var heldView: UIView?
    /// A destination whose slot was not in the window when the web view should have gone in (see `place(in:)`).
    private weak var pendingPlace: UIViewController?
    /// The newest moving run into a web destination that VoiceOver has not heard yet (contract 8.1 step 7).
    private var announce: (seq: Int, tab: String)?

    /// The first frame (contract 2.4, 8.1 `initial`): the views load, `first` is selected with the stray guard down and the
    /// web controller placed in its slot (hidden in the Coach slot when `first` is Coach: WAITING), so the first document
    /// starts in the window in the turn the root becomes the window's root.
    public init(web: UIViewController, webView: WKWebView, first: String, look: TabsModel, hooks: Hooks = Hooks()) {
        self.web = web
        self.webView = webView
        self.look = look
        firstRoom = look.room.id
        self.hooks = hooks
        let coach = CoachSlotController(background: TabBarLook.background(look), paper: look.paper)
        coachSlot = coach
        slots = ShellTabs.ids.map { $0 == "coach" ? coach : WebSlotController(tabId: $0) }
        super.init(nibName: nil, bundle: nil)
        for (i, id) in ShellTabs.ids.enumerated() { slots[i].tabBarItem = TabBarLook.item(id, look: look) }
        delegate = self
        tabBarMinimizeBehavior = .never
        webView.scrollView.bottomEdgeEffect.isHidden = true
        guardDown = true
        setViewControllers(slots, animated: false)
        guardDown = false
        loadViewIfNeeded()
        coachSlot.loadViewIfNeeded()
        apply(look)
        placeFirst(ShellTabs.isTab(first) ? first : "log")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    public override func viewDidLoad() {
        super.viewDidLoad()
        parking.frame = view.bounds
        parking.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        parking.isUserInteractionEnabled = false
        view.insertSubview(parking, at: 0)
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        paintBarContainer()
        if !inRun, let dest = pendingPlace, dest === super.selectedViewController {
            place(in: dest)
            applyWebVisibility()
        }
        noteBarChange()
    }

    /// The bar's guess before the window exists (contract 2.2; delta 14.1): the glass bar is 83 pt on every iPhone the tab
    /// root runs on, over a 34 pt home inset on a screen taller than 2:1 (every Face ID iPhone) and none otherwise.
    public static func predicted(screen: CGSize) -> (h: Int, safe: Int) {
        let long = max(screen.width, screen.height), short = min(screen.width, screen.height)
        return (83, short > 0 && long / short > 2 ? 34 : 0)
    }

    // MARK: The selection

    /// The selected tab's id.
    public var selected: String { ShellTabIndex.tab(super.selectedIndex) ?? ShellTabs.ids[0] }

    /// The funnel (contract 8.1): selects `tab` and answers the selection and its seq after the run. A fallen-back root,
    /// an unknown id or the `fallback` source move nothing and answer the current state; so does a page or deep-link
    /// selection of the selected tab, while the owner's re-tap takes the next seq and says `again`.
    @discardableResult
    public func select(_ tab: String, source: Source) -> (tab: String, seq: Int) {
        let from = selected
        guard fellBack == nil, ShellTabs.isTab(tab), source != .fallback else { return (from, seq) }
        guard !inRun else {
            Self.log.error("tabs: a selection of \(tab, privacy: .public) asked inside a funnel run: not run")
            return (from, seq)
        }
        guard tab != from else {
            guard source == .tap else { return (from, seq) }
            let t0 = Self.now()
            seq += 1
            hooks.selected(tab, seq, .tap, true)
            record(FunnelRun(source: .tap, from: from, to: tab, seq: seq, moved: false, t0: t0, t1: Self.now()))
            return (tab, seq)
        }
        return move(from: from, to: tab, source: source)
    }

    private func move(from: String, to tab: String, source: Source) -> (tab: String, seq: Int) {
        guard let i = ShellTabIndex.of(tab) else { return (from, seq) }
        let t0 = Self.now()
        inRun = true
        hooks.section(true)
        endEditing()
        let leavingStack = from == "coach" && coachMode != .web
        let enteringStack = tab == "coach" && coachMode != .web
        if enteringStack { hooks.covered(true) }
        if from == "coach" { endHold(post: false) }
        // Park, select, place (delta 14.4): the web view never leaves the window.
        let v = web.view!
        v.frame = parking.bounds
        parking.addSubview(v)
        guardDown = true
        UIView.performWithoutAnimation { super.selectedIndex = i }
        guardDown = false
        place(in: slots[i])
        applyWebVisibility()
        if leavingStack { hooks.covered(false) }
        if enteringStack, coachMode == .native, !chatPushed, holdWanted(source) { startHold() }
        seq += 1
        hooks.selected(tab, seq, source, false)
        let barBefore = barRev
        applyBar(animated: false)
        view.layoutIfNeeded()
        reportBar(since: barBefore)
        setNeedsStatusBarAppearanceUpdate()
        // VoiceOver (step 7): a WAITING or NATIVE Coach tab at once (a held one when its hold runs out); a web destination
        // once the page has drawn it, a page selection's at this run's end, never the first frame's
        let run = seq
        if enteringStack {
            announce = nil
            if !held { postScreenChanged(coachSlot.nav.topViewController?.view) }
        } else {
            announce = source == .initial ? nil : (run, tab)
            if case .page = source { announceWeb(seq: run) }
        }
        hooks.coachShown(tab == "coach" && coachMode != .web)
        record(FunnelRun(source: source, from: from, to: tab, seq: run, moved: true, t0: t0, t1: Self.now()))
        inRun = false
        hooks.section(false)
        return (tab, run)
    }

    /// The first frame: no hook (nothing is linked yet), no seq (the first run is 1).
    private func placeFirst(_ tab: String) {
        guard let i = ShellTabIndex.of(tab) else { return }
        let t0 = Self.now()
        guardDown = true
        UIView.performWithoutAnimation { super.selectedIndex = i }
        guardDown = false
        place(in: slots[i])
        applyWebVisibility()
        record(FunnelRun(source: .initial, from: nil, to: tab, seq: seq, moved: true, t0: t0, t1: Self.now()))
    }

    /// Puts the web view in the destination's container (it may come from the parking view, never from outside the
    /// window), then moves the web controller's containment: the view first, the order UIKit's hierarchy check allows.
    /// A destination UIKit has not put in the window yet (never seen: under `performWithoutAnimation` the selected slot
    /// is in the window when the set returns) keeps the web view parked until a layout pass has put it there.
    private func place(in dest: UIViewController) {
        let container: UIView = dest === coachSlot ? coachSlot.webArea : dest.view
        if view.window != nil, container.window == nil { view.layoutIfNeeded() }
        if view.window != nil, container.window == nil {
            Self.log.error("tabs: the selected slot is not in the window yet: the web view waits in the parking view")
            pendingPlace = dest
            return
        }
        pendingPlace = nil
        let v = web.view!
        if v.superview !== container {
            v.frame = container.bounds
            container.addSubview(v)
        } else if v.frame != container.bounds {
            v.frame = container.bounds
        }
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        if web.parent !== dest {
            if web.parent != nil {
                web.willMove(toParent: nil)
                web.removeFromParent()
            }
            dest.addChild(web)
            web.didMove(toParent: dest)
        }
    }

    /// Hidden (and hidden from VoiceOver) exactly while Coach is selected and its stack shows (contract 8.2).
    private func applyWebVisibility() {
        let hide = selected == "coach" && coachMode != .web
        let v = web.view!
        if v.isHidden != hide { v.isHidden = hide }
        if v.accessibilityElementsHidden != hide { v.accessibilityElementsHidden = hide }
        coachSlot.showStack(coachMode != .web)
    }

    private var chatPushed: Bool { coachSlot.nav.viewControllers.count > 1 }

    /// Step 1 (contract 8.1, 8.5): editing ends in the window (the web view's keys and any native field's), then once more
    /// inside the web view: a native field inside it hands first responder to WebKit's content view as it resigns
    /// (measured in RootTabControllerTests 4), which would otherwise go on holding it behind the native Coach tab.
    private func endEditing() {
        guard let window = view.window else { return }
        window.endEditing(true)
        if web.view.window === window { web.view.endEditing(true) }
    }

    /// A new seq for the current selection, for the bridge's resend after a failed `tabs.select` (contract 4.3, D12).
    public func restate() -> (tab: String, seq: Int) {
        seq += 1
        return (selected, seq)
    }

    /// The seq of the newest move into a web destination that VoiceOver has not heard yet, nil when none waits: a move
    /// whose `tabs.select` no document answered (sent before a hello, or its document went) is heard once the next
    /// hello's answer, which carries the selection, has reached the page (the bridge, contract 8.1 step 7).
    public var pendingWebAnnounce: Int? { announce?.seq }

    /// VoiceOver's screen change for a run into a web destination (contract 8.1 step 7, I17): posted with the web view
    /// once the page has drawn that tab (the bridge calls it when the run's `tabs.select` is answered or has failed, or
    /// after the hello that carried it; a page run calls it at its end), only while that run is the newest move and its
    /// tab is still a web destination. After the fallback too: it changes no selection, and the page still draws the tab
    /// its `tabs.select` went for (sent before the fallback's `screens.off`).
    public func announceWeb(seq s: Int) {
        guard let a = announce, a.seq == s else { return }
        announce = nil
        guard selected == a.tab, !(a.tab == "coach" && coachMode != .web), webView.window != nil else { return }
        postScreenChanged(webView)
    }

    // MARK: UIKit's routes in

    public func tabBarController(_ tabBarController: UITabBarController, shouldSelect viewController: UIViewController) -> Bool {
        if let i = slots.firstIndex(where: { $0 === viewController }), let tab = ShellTabIndex.tab(i) {
            select(tab, source: .tap)
        }
        return false
    }

    public override var selectedIndex: Int {
        get { super.selectedIndex }
        set {
            if guardDown { super.selectedIndex = newValue } else { stray(index: newValue) }
        }
    }

    public override var selectedViewController: UIViewController? {
        get { super.selectedViewController }
        set {
            if guardDown {
                super.selectedViewController = newValue
            } else {
                stray(index: newValue.flatMap { v in slots.firstIndex { $0 === v } } ?? -1)
            }
        }
    }

    private func stray(index i: Int) {
        let tab = ShellTabIndex.tab(i)
        strays += 1
        let name = tab ?? "index \(i)"
        Self.log.fault("tabs: a selection outside the funnel (\(name, privacy: .public)): counted, redirected")
        hooks.stray(name)
        if let tab { select(tab, source: .stray) }
    }

    // MARK: The Coach tab

    /// The Coach tab's mode (contract 1.4, I13): WAITING only ever leaves, NATIVE needs a home (`setHome`), and after the
    /// fallback the tab stays WEB. On the selected tab editing ends first, the page is covered when the tab turns NATIVE
    /// (from WEB or WAITING: `coachHome` presented while Coach is selected, contract 8.4, so the bridge sends no covered of
    /// its own for it) and uncovered when it turns WEB, the bar follows, and VoiceOver hears the new content (the hub, or
    /// the page); turning WEB drops any hold.
    public func setCoachMode(_ m: CoachMode) {
        guard m != coachMode else { return }
        guard m != .waiting else {
            Self.log.error("tabs: the Coach tab never turns WAITING again (it is \(self.coachMode.rawValue, privacy: .public))")
            return
        }
        guard fellBack == nil else { return }
        guard m != .native || coachSlot.home != nil else {
            Self.log.error("tabs: the Coach tab turns NATIVE only on a home (setHome)")
            return
        }
        let shown = selected == "coach"
        if shown {
            hooks.section(true)
            endEditing()
        }
        if m == .web { endHold(post: false) }
        if shown, m == .native { hooks.covered(true) }
        coachMode = m
        applyWebVisibility()
        if shown {
            if m == .web { hooks.covered(false) }
            let barBefore = barRev
            inBarChange = true
            applyBar(animated: false)
            view.layoutIfNeeded()
            inBarChange = false
            reportBar(since: barBefore)
            setNeedsStatusBarAppearanceUpdate()
            announce = nil
            if m == .web {
                postScreenChanged(webView)
            } else if !held {
                postScreenChanged(coachSlot.nav.topViewController?.view)
            }
        }
        hooks.coachShown(shown && m != .web)
        if shown { hooks.section(false) }
    }

    /// The NATIVE root (H10: N's hub in ScreenHost's host, made once and reused): it replaces the WAITING ground or an
    /// earlier home at the stack's bottom, and the tab turns NATIVE (from WAITING or WEB, contract 1.4).
    public func setHome(_ home: UIViewController) {
        guard fellBack == nil else { return }
        if held, let old = heldView, old !== home.view {
            old.alpha = 1
            home.view.alpha = 0
            heldView = home.view
        }
        coachSlot.install(home: home)
        setCoachMode(.native)
    }

    // MARK: The hold

    private func holdWanted(_ source: Source) -> Bool {
        if coachResume { return true }
        switch source {
        case .page(let intent): return intent == "chat" || intent == "intake"
        case .deepLink(let share): return share
        default: return false
        }
    }

    private func startHold() {
        holdWork?.cancel()
        held = true
        heldView = coachSlot.nav.viewControllers.first?.view
        heldView?.alpha = 0
        let work = DispatchWorkItem { [weak self] in
            MainActor.assumeIsolated { self?.endHold(post: true) }
        }
        holdWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + holdBudget, execute: work)
    }

    /// Ends the hold now (ScreenHost's push calls it right after a held push, H5). It posts nothing: ScreenHost announces
    /// the chat once UIKit has shown it.
    public func releaseHold() {
        endHold(post: false)
    }

    private func endHold(post: Bool) {
        holdWork?.cancel()
        holdWork = nil
        guard held else { return }
        held = false
        heldView?.alpha = 1
        heldView = nil
        guard post, fellBack == nil, selected == "coach", coachMode == .native else { return }
        postScreenChanged(coachSlot.nav.topViewController?.view)
        hooks.coachShown(true)
    }

    // MARK: The bar

    /// Hidden after the fallback, and while a sheet is open unless the selected tab is a WAITING or NATIVE Coach tab
    /// (`Fixtures/shell/bar.json`).
    private var barShouldHide: Bool {
        if fellBack != nil { return true }
        return sheetsOpen && !(selected == "coach" && coachMode != .web)
    }

    /// Brings the bar to its state; a show animates only when asked and Reduce Motion is off, a hide never.
    @discardableResult
    private func applyBar(animated: Bool) -> Bool {
        let hide = barShouldHide
        guard hide != isTabBarHidden else { return false }
        setBar(hidden: hide, animated: animated && !hide && !reduceMotion())
        return true
    }

    private func setBar(hidden: Bool, animated: Bool) {
        barCalls.append((hidden, animated))
        setTabBarHidden(hidden, animated: animated)
    }

    /// The page's `sheets {open}` (contract 3.4): the state is kept; on a web tab (Coach WEB counts as one) open hides the
    /// bar at once and closed shows it (animated unless Reduce Motion is on); a WAITING or NATIVE Coach tab keeps its bar.
    /// The numbers are measured after a layout pass in the same turn and answered; the page hears them from the answer.
    @discardableResult
    public func setSheets(open: Bool) -> BarMetrics {
        sheetsOpen = open
        changeBar(animated: true)
        return barMetrics()
    }

    /// Every document start (contract 3.4, P-5): the state back to closed, the bar shown on a web tab.
    @discardableResult
    public func resetSheets() -> BarMetrics {
        sheetsOpen = false
        changeBar(animated: true)
        return barMetrics()
    }

    /// How long an animated show keeps the `tabs` section open at most. UIKit's show is a fade of the bar's opacity, at
    /// 95 % after 0.25 s and whole after about 0.4 s on iOS 26.5 and 27.0 (measured on the simulators); the transaction
    /// that carries it completes after about 1 s on 27.0 and never on 26.5, where the glass lens adds an animation of
    /// infinite duration to it. A section must never stay open past its window (any later crash would be blamed on the
    /// bar), so it ends at the transaction's completion or after this, whichever comes first.
    static let showSection: TimeInterval = 0.5

    /// A hide or show of the bar inside the `tabs` section, a show until its animation is done (contract 10.2).
    private func changeBar(animated: Bool) {
        let hide = barShouldHide
        guard hide != isTabBarHidden else { return }
        inBarChange = true
        defer { inBarChange = false }
        let animate = animated && !hide && !reduceMotion()
        hooks.section(true)
        if animate {
            let end = SectionEnd(hooks)
            CATransaction.begin()
            CATransaction.setCompletionBlock { MainActor.assumeIsolated { end.fire() } }
            setBar(hidden: false, animated: true)
            CATransaction.commit()
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.showSection) { MainActor.assumeIsolated { end.fire() } }
        } else {
            setBar(hidden: hide, animated: false)
        }
        view.layoutIfNeeded()
        if !animate { hooks.section(false) }
    }

    /// The bar's numbers now (contract 7.1), whole points; `rev` rises when they differ from the last measured.
    public func barMetrics() -> BarMetrics {
        let n = measure()
        if n != lastBar {
            barRev += 1
            lastBar = n
        }
        return BarMetrics(h: n.h, safe: n.safe, rev: barRev)
    }

    /// The bar's numbers now with a new rev, for the bridge's resend after a failed `tabs.bar` (contract 4.3, D12): the
    /// page applies only a newer rev, and a restate is one.
    public func restateBar() -> BarMetrics {
        let n = measure()
        lastBar = n
        barRev += 1
        return BarMetrics(h: n.h, safe: n.safe, rev: barRev)
    }

    /// After the root's own change of the bar: `tabs.bar` when the numbers moved since `before`. The first measurement
    /// only sets the baseline (hello's answer carries it), and a fallen-back root tells nothing (the page has left tabs
    /// mode).
    private func reportBar(since before: Int) {
        let bar = barMetrics()
        if bar.rev != before, before > 0, fellBack == nil { hooks.barChanged(bar) }
    }

    private func measure() -> BarNumbers {
        let safe = view.window?.safeAreaInsets.bottom ?? view.safeAreaInsets.bottom
        var h: CGFloat = 0
        if !isTabBarHidden {
            let f = tabBar.convert(tabBar.bounds, to: webView)
            h = min(max(0, webView.bounds.maxY - f.minY), webView.bounds.height)
        }
        return BarNumbers(h: Int(h.rounded()), safe: Int(safe.rounded()))
    }

    /// A layout pass that moved the numbers outside the root's own changes (a safe-area or trait change) is the shell's
    /// own change: `tabs.bar`. The first measurement in a window sets the baseline quietly.
    private func noteBarChange() {
        guard !inRun, !inBarChange, view.window != nil else { return }
        reportBar(since: barRev)
    }

    // MARK: The room

    /// The page's TabsModel (contract 6.1): tint, idle, titles and labels on the bar, the style on the bar and the Coach
    /// stack only, the room's ground under the Coach stack.
    public func apply(_ look: TabsModel) {
        self.look = look
        TabBarLook.paint(tabBar, look: look)
        paintBarContainer()
        for (i, id) in ShellTabs.ids.enumerated() { TabBarLook.dress(slots[i].tabBarItem, tab: id, look: look) }
        let bg = TabBarLook.background(look)
        coachSlot.nav.overrideUserInterfaceStyle = TabBarLook.style(look)
        coachSlot.nav.view.backgroundColor = bg
        coachSlot.view.backgroundColor = bg
        coachSlot.waiting.background = bg
        coachSlot.waiting.paper = look.paper
        setNeedsStatusBarAppearanceUpdate()
    }

    /// The view UIKit draws the glass bar in: the bar's ancestor directly under this controller's view (iOS 26's tab
    /// container), or the bar itself when it sits there; nil while the bar is not under this view.
    var barContainer: UIView? {
        var v: UIView = tabBar
        while let s = v.superview {
            if s === view { return v }
            v = s
        }
        return nil
    }

    /// The room's style on the bar's container (delta 14.7; found by H9's by-hand run on iOS 27.0). The bar's own override
    /// reaches the bar but not its glass platter's content, which takes its style from the container: without this, Lime
    /// on a phone in light mode drew light glass with black items and its selected item all but unreadable, and
    /// Heavyweight on a phone in dark mode dark glass. The container never holds the web view or a slot (checked each time),
    /// so their traits, the web keyboards and the page's `prefers-color-scheme` stay the phone's. Again at every layout
    /// pass, in case UIKit hosts the bar anew.
    private func paintBarContainer() {
        guard let c = barContainer, c !== tabBar, !webView.isDescendant(of: c),
              !slots.contains(where: { $0.viewIfLoaded?.isDescendant(of: c) == true }) else { return }
        let style = TabBarLook.style(look)
        if c.overrideUserInterfaceStyle != style { c.overrideUserInterfaceStyle = style }
    }

    // MARK: The fallback

    /// The UI half of the fallback (contract 10.3), once: the bar hidden for good without animation, any hold dropped, a
    /// WAITING or NATIVE Coach tab turned WEB for the rest of the scene with the web view shown where it is; from then on
    /// `select` moves nothing. When the selected Coach tab's stack hides, editing ends first, as when the tab turns WEB
    /// (contract 8.5, I5): a native field focused there (the connect screen's key field, a hub field, the pushed chat's)
    /// resigns, so no first responder stays in the hidden stack and no keys stay up over the page. The bridge does the rest
    /// (H8): ScreenHost's `detachStack()`, the cascade, `shell.covered {on:false}`. VoiceOver hears the web view when it
    /// replaced the selected Coach tab's stack; a move into a web tab that VoiceOver has not heard yet stays pending and
    /// is heard once the page has drawn it (`announceWeb(seq:)`).
    public func fallBack(why: FellBackWhy, at: Date) {
        guard fellBack == nil else { return }
        hooks.section(true)
        fellBack = (why, at)
        endHold(post: false)
        let stackShown = selected == "coach" && coachMode != .web
        if stackShown { endEditing() }
        coachMode = .web
        applyWebVisibility()
        inBarChange = true
        if !isTabBarHidden { setBar(hidden: true, animated: false) }
        view.layoutIfNeeded()
        inBarChange = false
        _ = barMetrics()
        setNeedsStatusBarAppearanceUpdate()
        if stackShown { postScreenChanged(webView) }
        hooks.coachShown(false)
        hooks.section(false)
        Self.log.info("tabs: the tab root fell back (\(why.rawValue, privacy: .public)): the bar is hidden for this scene")
    }

    // MARK: Status bar

    public override var childForStatusBarStyle: UIViewController? { selectedViewController }
    public override var childForStatusBarHidden: UIViewController? { selectedViewController }

    // MARK: Introspection

    private func record(_ run: FunnelRun) {
        runs.append(run)
        if runs.count > 50 { runs.removeFirst(runs.count - 50) }
#if DEBUG
        onFunnelRun?(run)
#endif
    }

    /// The last 50 funnel runs, oldest first.
    public var funnelRuns: [FunnelRun] { runs }

    private static func now() -> Double { (Date().timeIntervalSince1970 * 10_000).rounded() / 10 }

    private static func rect(_ r: CGRect) -> [String: Double] {
        ["x": Double(r.minX), "y": Double(r.minY), "w": Double(r.width), "h": Double(r.height)]
    }

    private var minimizeWord: String {
        switch tabBarMinimizeBehavior {
        case .never: return "never"
        case .automatic: return "automatic"
        case .onScrollDown: return "onScrollDown"
        case .onScrollUp: return "onScrollUp"
        @unknown default: return "unknown \(tabBarMinimizeBehavior.rawValue)"
        }
    }

    /// The tab whose slot holds the web controller, or "parking" between its moves.
    private var webSlot: String {
        if web.view.superview === parking { return "parking" }
        if let p = web.parent, let i = slots.firstIndex(where: { $0 === p }), let tab = ShellTabIndex.tab(i) { return tab }
        return "none"
    }

    /// Contract 15.3's `root` block (the probe's `describe().root`, H7 and H11). Reading it changes nothing.
    public func describe() -> [String: Any] {
        let n = measure()
        let nav = coachSlot.nav
        let pop = nav.interactivePopGestureRecognizer
        let popAllowed = pop.map { $0.isEnabled && ($0.delegate?.gestureRecognizerShouldBegin?($0) ?? true) } ?? false
        let wv = web.view!
        return [
            "kind": "tabs",
            "fellBack": fellBack.map { ["why": $0.why.rawValue, "at": ($0.at.timeIntervalSince1970 * 1000).rounded()] as [String: Any] }
                ?? NSNull(),
            "selected": selected,
            "seq": seq,
            "firstRoom": firstRoom,
            "web": [
                "slot": webSlot,
                "inWindow": webView.window != nil,
                "hidden": wv.isHidden,
                "a11yHidden": wv.accessibilityElementsHidden,
                "frame": Self.rect(wv.convert(wv.bounds, to: nil)),
                "safeBottom": Double(webView.safeAreaInsets.bottom),
            ] as [String: Any],
            "bar": [
                "hidden": isTabBarHidden,
                "h": n.h,
                "safe": n.safe,
                "rev": barRev,
                "frame": Self.rect(tabBar.frame),
                "slotInset": Double(selectedViewController?.viewIfLoaded?.safeAreaInsets.bottom ?? 0),
                "tint": look.tint.css,
                "style": TabBarLook.word(tabBar.overrideUserInterfaceStyle),
                "containerStyle": barContainer.map { TabBarLook.word($0.overrideUserInterfaceStyle) } ?? NSNull(),
                "minimize": minimizeWord,
            ] as [String: Any],
            "coach": [
                "mode": coachMode.rawValue,
                "root": nav.viewControllers.first === coachSlot.waiting ? "waiting" : homeRoute(),
                "pushed": nav.viewControllers.count > 1,
                "depth": nav.viewControllers.count,
                "interactivePop": popAllowed,
                "held": held,
            ] as [String: Any],
            "sheetsOpen": sheetsOpen,
            "strays": strays,
            "runs": runs.map(\.json),
        ]
    }
}
#endif
