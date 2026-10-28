#if os(iOS)
import Foundation
import UIKit
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// The Capacitor bridge controller's stand-in: its view is the web view, and its `viewDidAppear` takes focus while its own
/// `hasInitialFocus` is on, as CAPBridgeViewController's does unless the descriptor says false (AppDelegate keeps it
/// false; probe61 question 1: under the funnel UIKit sends it a lone `viewDidAppear` on every switch).
final class StandInWebController: UIViewController {
    let webView: WKWebView
    var hasInitialFocus = false
    private(set) var didAppear = 0

    init(webView: WKWebView) {
        self.webView = webView
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() { view = webView }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        didAppear += 1
        if hasInitialFocus { _ = webView.becomeFirstResponder() }
    }
}

/// A tab root in a real window (its scene set when the test host has one, as ShellBridgeTests does), its web
/// controller's stand-in over a RecordingWebView, a plain controller standing for the hub, and every hook recorded.
@available(iOS 26.0, *)
@MainActor
final class RootRig {
    let window: UIWindow
    let webView: RecordingWebView
    let web: StandInWebController
    let root: RootTabController
    /// The hub's stand-in (H10 gives the real one).
    let home = UIViewController()
    var covered: [Bool] = []
    var selections: [(tab: String, seq: Int, source: RootTabController.Source, again: Bool)] = []
    var strays: [String] = []
    var bars: [BarMetrics] = []
    var sections: [Bool] = []
    var shown: [Bool] = []
    /// VoiceOver's screen changes: the argument, NSNull for none.
    var posts: [AnyObject] = []
    var runs: [RootTabController.FunnelRun] = []
    /// Every hook in order ("covered on", "selected progress 3 tap", "section on", ...).
    var events: [String] = []
    var reduceMotion = false
    /// The last time the root did anything (a hook, a post): a rig still for more than a second is let go between cases.
    var lastActive = Date()

    init(first: String, look: TabsModel) {
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window = UIWindow(frame: frame)
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first { window.windowScene = scene }
        webView = RecordingWebView(frame: frame)
        web = StandInWebController(webView: webView)
        web.loadViewIfNeeded()
        home.view.backgroundColor = .systemTeal
        root = RootTabController(web: web, webView: webView, first: first, look: look)
        var h = RootTabController.Hooks()
        h.covered = { [weak self] on in
            self?.lastActive = Date()
            self?.covered.append(on)
            self?.events.append("covered \(on ? "on" : "off")")
        }
        h.selected = { [weak self] tab, seq, source, again in
            self?.lastActive = Date()
            self?.selections.append((tab, seq, source, again))
            self?.events.append("selected \(tab) \(seq) \(source.word)\(again ? " again" : "")")
        }
        h.stray = { [weak self] tab in
            self?.lastActive = Date()
            self?.strays.append(tab)
            self?.events.append("stray \(tab)")
        }
        h.barChanged = { [weak self] bar in
            self?.lastActive = Date()
            self?.bars.append(bar)
            self?.events.append("bar \(bar.h) \(bar.safe) \(bar.rev)")
        }
        h.section = { [weak self] on in
            self?.lastActive = Date()
            self?.sections.append(on)
            self?.events.append("section \(on ? "on" : "off")")
        }
        h.coachShown = { [weak self] on in
            self?.lastActive = Date()
            self?.shown.append(on)
            self?.events.append("coachShown \(on)")
        }
        root.hooks = h
        root.postScreenChanged = { [weak self] arg in
            self?.lastActive = Date()
            self?.posts.append((arg as AnyObject?) ?? NSNull())
            self?.events.append("post")
        }
        root.reduceMotion = { [weak self] in self?.reduceMotion ?? false }
        root.onFunnelRun = { [weak self] run in self?.runs.append(run) }
        window.rootViewController = root
        window.makeKeyAndVisible()
        root.view.layoutIfNeeded()
    }

    var nav: UINavigationController { root.coachSlot.nav }

    /// Forgets every recorded hook (the setup's own).
    func clear() {
        covered = []
        selections = []
        strays = []
        bars = []
        sections = []
        shown = []
        posts = []
        runs = []
        events = []
    }

    /// Open sections now (each `true` opens one, each `false` closes one).
    var openSections: Int { sections.reduce(0) { $0 + ($1 ? 1 : -1) } }

    func slot(_ tab: String) -> UIViewController { root.slots[ShellTabs.ids.firstIndex(of: tab)!] }

    /// The bar frame's cover of the web view's bottom edge, measured here (contract 7.1).
    func cover() -> Int {
        let f = root.tabBar.convert(root.tabBar.bounds, to: webView)
        return Int(max(0, webView.bounds.maxY - f.minY).rounded())
    }

    /// The owner's tap as UIKit makes it: `shouldSelect` on the tab's slot, which must answer false.
    @discardableResult
    func tap(_ tab: String, file: StaticString = #filePath, line: UInt = #line) -> Bool {
        let answer = root.tabBarController(root, shouldSelect: slot(tab))
        XCTAssertFalse(answer, "shouldSelect answers false for \(tab)", file: file, line: line)
        return answer
    }

    /// The controller that decides the status bar's style: the end of the `childForStatusBarStyle` chain.
    func statusController() -> UIViewController {
        var c: UIViewController = root
        while let next = c.childForStatusBarStyle { c = next }
        return c
    }

    /// Lets the web view go on purpose: its moves out of the window from now on are not faults.
    func letGo() {
        webView.live = false
        window.isHidden = true
        window.rootViewController = nil
    }
}

/// A view that is first responder somewhere under `v` (a web view's own content view included).
@MainActor
func firstResponderView(under v: UIView) -> UIView? {
    if v.isFirstResponder { return v }
    for s in v.subviews { if let r = firstResponderView(under: s) { return r } }
    return nil
}

/// Whether `v` or one of its superviews is hidden.
@MainActor
func inHiddenView(_ v: UIView) -> Bool {
    var c: UIView? = v
    while let x = c {
        if x.isHidden { return true }
        c = x.superview
    }
    return false
}

/// RootTabController (11-shell.md H4 as delta section 14 changed it) on a real UIWindow with a RecordingWebView standing
/// for the page: the funnel never takes the web view out of the window (I1, sampled for three run-loop turns after every
/// run, never for a fixed second), one funnel (I2), focus (I5), the bar against `Fixtures/shell/bar.json` (G25), the
/// room, the fallback, VoiceOver, the status bar, the hold, the modes per scene (I13) and `describe()`.
///
/// A rig stays alive and live (its window only hidden) until it has been still for more than a second, checked as each
/// case starts, and the class's last case waits one second for the rest, so a move out of the window that comes late
/// from any rig is still counted, with no wait per change; only then is a rig let go (each holds a WebContent process).
/// Tabs are driven as UIKit drives them: `shouldSelect` for a tap, and in case 9 the bar's own control through
/// `sendActions(for: .touchUpInside)` (never `accessibilityActivate()`, which returns false on the glass bar, delta 14.2).
@available(iOS 26.0, *)
@MainActor
final class RootTabControllerTests: XCTestCase {
    typealias Mode = RootTabController.CoachMode

    /// The rigs not let go yet: every rig of the running case, and those of earlier cases still within a second of
    /// their last change.
    static var kept: [RootRig] = []

    nonisolated private static let heavy = TabsModel.defaults(for: .heavyweight)
    nonisolated private static let lime = TabsModel.defaults(for: .lime)
    /// How much longer a bound on time is on CI (as ScreenHostTests).
    private static let slack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10

    override func setUp() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: 26, minorVersion: 0, patchVersion: 0)),
                          "the tab root exists only on iOS 26 and later (D39)")
        try await WebKitWarmUp.ensure()
        Self.releaseStill()
    }

    /// Lets go of the rigs still for more than a second: a late move out of the window would have come by then.
    private static func releaseStill() {
        let now = Date()
        kept.removeAll { r in
            guard now.timeIntervalSince(r.lastActive) > 1 else { return false }
            r.letGo()
            return true
        }
    }

    nonisolated override class func tearDown() {
        MainActor.assumeIsolated {
            for rig in kept { rig.letGo() }
            kept = []
        }
        super.tearDown()
    }

    // MARK: Helpers

    /// A new rig in `mode` (NATIVE through `setHome`, WEB through `setCoachMode`), its setup's hooks forgotten. The
    /// windows of earlier rigs are hidden (their views stay in them).
    private func rig(first: String = "log", mode: Mode = .waiting, look: TabsModel = RootTabControllerTests.heavy) -> RootRig {
        for r in Self.kept { r.window.isHidden = true }
        let r = RootRig(first: first, look: look)
        switch mode {
        case .waiting: break
        case .native: r.root.setHome(r.home)
        case .web: r.root.setCoachMode(.web)
        }
        r.root.view.layoutIfNeeded()
        r.clear()
        Self.kept.append(r)
        return r
    }

    /// Turns the main run loop `turns` times, sampling at every turn boundary (a run-loop observer) and after each turn
    /// whether the web view is in a window; the number of samples that found it out of one.
    private func outsideOverTurns(_ v: UIView, turns: Int = 3) -> Int {
        var outside = 0
        let observer = CFRunLoopObserverCreateWithHandler(kCFAllocatorDefault, CFRunLoopActivity.allActivities.rawValue, true, 0) { _, _ in
            MainActor.assumeIsolated { if v.window == nil { outside += 1 } }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
        for _ in 0..<turns {
            _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.004))
            if v.window == nil { outside += 1 }
        }
        CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes)
        return outside
    }

    /// I1 after one change: the web view in the window during the change (no move out of it logged) and for three turns
    /// after it, the window's root unchanged, the web controller in the selected tab's slot.
    private func checkInWindow(_ r: RootRig, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        let moves = RecordingWebView.nilMovesWhileLive(of: r.webView)
        XCTAssertNotNil(r.webView.window, "\(what): in the window when the change returns", file: file, line: line)
        XCTAssertEqual(outsideOverTurns(r.webView), 0, "\(what): in the window for three turns after it", file: file, line: line)
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(of: r.webView), moves, "\(what): no move out of the window after it", file: file, line: line)
        XCTAssertEqual(moves, 0, "\(what): no move out of the window", file: file, line: line)
        XCTAssertTrue(r.window.rootViewController === r.root, "\(what): the window's root unchanged", file: file, line: line)
        XCTAssertTrue(r.web.parent === r.slot(r.root.selected), "\(what): the web controller in \(r.root.selected)'s slot", file: file, line: line)
    }

    /// A colour as the page writes it (`#rrggbb`), nil for none.
    private func css(_ c: UIColor?) -> String? { c.flatMap { RGBA(uiColor: $0)?.css } }

    /// Polls every 20 ms until `ok` holds; false if it never did within `timeout` (times the CI factor).
    private func until(_ timeout: Double = 3, _ ok: () -> Bool) async throws -> Bool {
        let end = Date().addingTimeInterval(timeout * Self.slack)
        while !ok() {
            if Date() > end { return false }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        return true
    }

    /// The four ways a selection can come in, as the cases drive them.
    private enum Way: CaseIterable {
        case tap, page, deepLink, stray
    }

    private func drive(_ r: RootRig, _ way: Way, to tab: String) {
        switch way {
        case .tap: r.tap(tab)
        case .page: r.root.select(tab, source: .page(intent: nil))
        case .deepLink: r.root.select(tab, source: .deepLink(share: tab == "coach"))
        case .stray: r.root.selectedIndex = ShellTabs.ids.firstIndex(of: tab)!
        }
    }

    /// The bar's state table (contract 3.4, 10.3; G25), from FPCoreTests' fixtures in the source tree.
    private struct BarRow {
        let selected: String
        let coach: Mode
        let sheets: Bool
        let fellBack: Bool
        let hidden: Bool
        var name: String { "\(selected) coach=\(coach.rawValue) sheets=\(sheets) fellBack=\(fellBack)" }
    }

    private static let barFile: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("FPCoreTests/Fixtures/shell/bar.json")

    private func barRows() throws -> [BarRow] {
        let o = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.barFile)) as? [String: Any]
        XCTAssertEqual(o?["v"] as? Int, 1, "bar.json v")
        let rows = try XCTUnwrap(o?["rows"] as? [[String: Any]], "bar.json rows")
        return try rows.enumerated().map { i, row in
            guard let s = row["selected"] as? String, ShellTabs.isTab(s), let m = (row["coach"] as? String).flatMap(Mode.init(rawValue:)),
                  let sheets = row["sheets"] as? Bool, let fell = row["fellBack"] as? Bool, let hidden = row["hidden"] as? Bool
            else { throw CocoaError(.fileReadCorruptFile, userInfo: [NSDebugDescriptionErrorKey: "bar.json row \(i) does not read"]) }
            return BarRow(selected: s, coach: m, sheets: sheets, fellBack: fell, hidden: hidden)
        }
    }

    /// The UIControls under the tab bar that draw `title` (UIKit draws each item twice on iOS 26 and 27), found as the
    /// probe's `tapTab` finds them: by the label they draw, never by class name or their own label (delta 14.2).
    private func controls(_ r: RootRig, drawing title: String) -> [UIControl] {
        func draws(_ v: UIView) -> Bool {
            if let l = v as? UILabel, l.text == title { return true }
            return v.subviews.contains(where: draws)
        }
        var found: [UIControl] = []
        func walk(_ v: UIView) {
            if let c = v as? UIControl, draws(c) { found.append(c); return }
            v.subviews.forEach(walk)
        }
        walk(r.root.tabBar)
        return found
    }

    /// The item of `tabBar.items` whose label is the model's `a11y`, then the first control that draws its title.
    private func tabControl(_ r: RootRig, _ tab: String) -> UIControl? {
        guard let a11y = r.root.look.item(tab)?.a11y,
              let item = r.root.tabBar.items?.first(where: { $0.accessibilityLabel == a11y }),
              let title = item.title else { return nil }
        return controls(r, drawing: title).first
    }

    // MARK: 1. I1: never out of the window

    /// Every source (a tap through `shouldSelect` exactly as UIKit calls it, page, deep link, a stray) times every tab
    /// pair times Coach WAITING, NATIVE and WEB; the first frame on every tab (always WAITING: the mode starts there in
    /// every scene); every Coach mode change with Coach selected and not; the fallback with Coach selected in each mode.
    func test01NeverOutOfTheWindow() throws {
        var cases = 0
        var firstFrames: [String: RootRig] = [:]
        for first in ShellTabs.ids {
            let r = rig(first: first)
            firstFrames[first] = r
            checkInWindow(r, "initial \(first)")
            cases += 1
        }
        for mode in [Mode.waiting, .native, .web] {
            let r = rig(mode: mode)
            for way in Way.allCases {
                for from in ShellTabs.ids {
                    for to in ShellTabs.ids where to != from {
                        r.root.select(from, source: .page(intent: nil))
                        drive(r, way, to: to)
                        XCTAssertEqual(r.root.selected, to, "\(way) \(from) -> \(to), Coach \(mode.rawValue)")
                        checkInWindow(r, "\(way) \(from) -> \(to), Coach \(mode.rawValue)")
                        cases += 1
                    }
                }
            }
            XCTAssertEqual(r.root.strays, 12, "the strays were counted")
        }
        var onCoach: [Mode: RootRig] = [:]
        for coachSelected in [true, false] {
            for order in [[Mode.native, .web], [Mode.web, .native]] {
                // WAITING turns NATIVE or WEB, then the other way round on the same root
                let r = rig(first: coachSelected ? "coach" : "progress")
                for to in order {
                    let from = r.root.coachMode
                    if to == .native { r.root.setHome(r.home) } else { r.root.setCoachMode(to) }
                    XCTAssertEqual(r.root.coachMode, to)
                    checkInWindow(r, "Coach \(from.rawValue) -> \(to.rawValue), Coach selected: \(coachSelected)")
                    cases += 1
                }
                if coachSelected { onCoach[r.root.coachMode] = r }
            }
        }
        let fallbacks: [(Mode, RootRig?)] = [(.waiting, firstFrames["coach"]), (.native, onCoach[.native]), (.web, onCoach[.web])]
        for (mode, r) in fallbacks {
            let r = try XCTUnwrap(r)
            XCTAssertEqual(r.root.selected, "coach")
            XCTAssertEqual(r.root.coachMode, mode)
            r.root.fallBack(why: .failures, at: Date())
            checkInWindow(r, "fallback from Coach \(mode.rawValue)")
            cases += 1
        }
        XCTAssertEqual(cases, 4 + 3 * 4 * 12 + 8 + 3)
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(), 0, "no web view of the class left its window")
    }

    // MARK: 2. I2: one funnel

    func test02OneFunnel() throws {
        let r = rig(mode: .native)
        for tab in ["progress", "coach", "settings", "log"] {
            let runs = r.runs.count
            r.tap(tab)
            XCTAssertEqual(r.runs.count, runs + 1, "one run for a tap on \(tab)")
            XCTAssertEqual(r.runs.last?.source, .tap)
            XCTAssertEqual(r.root.selected, tab)
        }
        r.root.select("settings", source: .page(intent: nil))
        r.root.select("coach", source: .deepLink(share: false))
        XCTAssertEqual(r.root.strays, 0, "the setters saw sets from inside the funnel only")
        XCTAssertEqual(r.strays, [])

        // one run's order (contract 8.1 steps 1-7): covered before the move into a native Coach tab, after the move out of
        // it, then the seq, VoiceOver, and the shell told whether Coach shows, all inside one section
        r.tap("log")
        r.clear()
        r.tap("coach")
        let into = r.root.seq
        XCTAssertEqual(r.events, ["section on", "covered on", "selected coach \(into) tap", "post", "coachShown true", "section off"])
        r.clear()
        r.tap("progress")
        XCTAssertEqual(r.events, ["section on", "covered off", "selected progress \(into + 1) tap", "coachShown false", "section off"])
        r.clear()
        r.root.select("settings", source: .page(intent: nil))
        XCTAssertEqual(r.events, ["section on", "selected settings \(into + 2) page", "post", "coachShown false", "section off"])

        r.root.selectedIndex = 1
        XCTAssertEqual(r.root.strays, 1, "a stray is counted once")
        XCTAssertEqual(r.strays, ["progress"])
        XCTAssertEqual(r.root.selected, "progress", "and redirected through the funnel")
        XCTAssertEqual(r.runs.last?.source, .stray)
        XCTAssertEqual(r.selections.last?.source, .stray)

        r.root.selectedViewController = r.slot("settings")
        XCTAssertEqual(r.root.strays, 2)
        XCTAssertEqual(r.root.selected, "settings")
        XCTAssertEqual(r.strays, ["progress", "settings"])

        let runs = r.runs.count
        r.root.selectedIndex = 3
        XCTAssertEqual(r.root.strays, 3, "a stray to the selected tab is counted")
        XCTAssertEqual(r.runs.count, runs, "and moves nothing")
        r.root.selectedIndex = 9
        XCTAssertEqual(r.root.strays, 4, "a stray to no tab is counted")
        XCTAssertEqual(r.strays.last, "index 9")
        XCTAssertEqual(r.root.selected, "settings", "and moves nothing")
        checkInWindow(r, "after the strays")
    }

    // MARK: 3. Idempotence and again

    func test03IdempotenceAndAgain() throws {
        let r = rig(mode: .native)
        r.root.select("progress", source: .page(intent: nil))
        r.clear()
        let seq = r.root.seq
        for source in [RootTabController.Source.page(intent: nil), .page(intent: "chat"), .deepLink(share: false),
                       .deepLink(share: true), .initial, .fallback] {
            let answer = r.root.select("progress", source: source)
            XCTAssertEqual(answer.tab, "progress")
            XCTAssertEqual(answer.seq, seq, "\(source.word) to the selected tab answers the current seq")
        }
        XCTAssertTrue(r.selections.isEmpty, "and calls nothing")
        XCTAssertTrue(r.runs.isEmpty, "and records no run")
        XCTAssertTrue(r.covered.isEmpty)

        r.tap("progress")
        XCTAssertEqual(r.root.seq, seq + 1, "the owner's re-tap takes the next seq")
        XCTAssertEqual(r.selections.count, 1)
        XCTAssertEqual(r.selections.first?.tab, "progress")
        XCTAssertEqual(r.selections.first?.seq, seq + 1)
        XCTAssertEqual(r.selections.first?.source, .tap)
        XCTAssertEqual(r.selections.first?.again, true)
        XCTAssertEqual(r.runs.last?.moved, false)
        XCTAssertEqual(r.runs.last?.json["again"] as? Bool, true)
        XCTAssertTrue(r.posts.isEmpty, "a re-tap posts nothing of its own")
        XCTAssertEqual(r.sections, [], "a re-tap moves nothing")

        r.root.select("progress", source: .fallback)
        r.root.select("runner", source: .page(intent: nil))
        XCTAssertEqual(r.root.selected, "progress", "an unknown id moves nothing")
        XCTAssertEqual(r.root.seq, seq + 1)
    }

    // MARK: 4. I5: focus

    /// No first responder in a hidden view after a run: wherever focus sits, it is resigned before `covered(true)`.
    private func assertNoHiddenFocus(_ r: RootRig, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        if let fr = firstResponderView(under: r.window) {
            XCTAssertFalse(inHiddenView(fr), "\(what): no first responder in a hidden view (\(type(of: fr)))", file: file, line: line)
        }
    }

    /// The web view's own focus (WebKit's content view, as a focused web field holds it) and a native field inside the web
    /// view (a web field's stand-in) are both resigned before `covered(true)`: the field hands first responder to WebKit's
    /// content view as it resigns, so the funnel ends editing inside the web view once more. Then every run goes through
    /// the web controller's `viewDidAppear` (UIKit sends a lone one per switch in the app, probe61 question 1; where this
    /// host sends none, UIKit's appearance API drives it): with its focus flag off, as the app keeps it, no first
    /// responder ends up in a hidden view; with it on, the hidden web view takes focus, which is what the flag keeps out.
    func test04Focus() throws {
        let r = rig(mode: .native)
        _ = r.webView.becomeFirstResponder()
        try XCTSkipUnless(firstResponderView(under: r.webView) != nil, "this host gives the web view no first responder")
        var underWebAtCover: Bool?
        var fieldAtCover: Bool?
        r.root.hooks.covered = { on in if on { underWebAtCover = firstResponderView(under: r.webView) != nil } }
        r.tap("coach")
        XCTAssertEqual(underWebAtCover, false, "the web view's focus ended before covered(true)")
        assertNoHiddenFocus(r, "after the run into Coach")
        _ = outsideOverTurns(r.webView)
        assertNoHiddenFocus(r, "three turns later")

        r.tap("log")
        let field = UITextField(frame: CGRect(x: 20, y: 120, width: 200, height: 44))
        r.webView.addSubview(field)
        XCTAssertTrue(field.becomeFirstResponder() && field.isFirstResponder, "the field takes focus")
        underWebAtCover = nil
        r.root.hooks.covered = { on in
            if on {
                fieldAtCover = field.isFirstResponder
                underWebAtCover = firstResponderView(under: r.webView) != nil
            }
        }
        r.tap("coach")
        XCTAssertEqual(fieldAtCover, false, "the field resigned before covered(true)")
        XCTAssertEqual(underWebAtCover, false, "and nothing in the web view took over its focus")
        assertNoHiddenFocus(r, "after the run into Coach with a field")
        _ = outsideOverTurns(r.webView)
        assertNoHiddenFocus(r, "three turns later")
        field.removeFromSuperview()

        var hostSent = false
        func appear() {
            let before = r.web.didAppear
            _ = outsideOverTurns(r.webView)
            if r.web.didAppear > before { hostSent = true; return }
            r.web.beginAppearanceTransition(true, animated: false)
            r.web.endAppearanceTransition()
        }
        for tab in ["log", "coach", "progress", "coach", "settings", "coach", "log"] {
            let appeared = r.web.didAppear
            r.tap(tab)
            appear()
            XCTAssertGreaterThan(r.web.didAppear, appeared, "\(tab): the web controller's viewDidAppear ran")
            assertNoHiddenFocus(r, "after \(tab)")
        }
        print("RootTabControllerTests: UIKit sent the web controller's viewDidAppear itself: \(hostSent)")

        r.web.hasInitialFocus = true
        r.tap("coach")
        appear()
        let taken = firstResponderView(under: r.webView)
        XCTAssertTrue(taken.map(inHiddenView) ?? false, "the control: with the flag on, the hidden web view takes focus")
        r.web.hasInitialFocus = false
        r.webView.endEditing(true)
        r.tap("log")
    }

    // MARK: 5. Hidden behind the native Coach tab

    func test05HiddenBehindCoach() throws {
        let r = rig()
        for mode in [Mode.waiting, .native, .web] {
            if mode == .native { r.root.setHome(r.home) } else if mode == .web { r.root.setCoachMode(.web) }
            for tab in ShellTabs.ids + ["coach"] {
                r.root.select(tab, source: .page(intent: nil))
                let hidden = tab == "coach" && mode != .web
                XCTAssertEqual(r.webView.isHidden, hidden, "\(tab), Coach \(mode.rawValue): isHidden")
                XCTAssertEqual(r.webView.accessibilityElementsHidden, hidden, "\(tab), Coach \(mode.rawValue): hidden from VoiceOver")
                XCTAssertEqual(r.webView.convert(r.webView.bounds, to: nil), r.window.bounds,
                               "\(tab), Coach \(mode.rawValue): full-bleed (innerHeight constant)")
                if tab == "coach" {
                    XCTAssertTrue(r.webView.superview === r.root.coachSlot.webArea, "in the Coach slot's web area")
                    XCTAssertEqual(r.nav.view.isHidden, mode == .web, "the stack shows exactly while not WEB")
                }
            }
        }
    }

    // MARK: 6. The bar

    /// Every row of `Fixtures/shell/bar.json`. A live row is reached two ways, on one root per Coach mode: the tab first
    /// and then the sheets state, and the sheets state on another tab first and then a selection of the row's tab. The
    /// fallback rows take one root per tab (the fallback is for good), each sheets state set after it.
    func test06BarTable() throws {
        let rows = try barRows()
        XCTAssertEqual(rows.count, 32, "bar.json: 24 live rows and 8 after the fallback")
        var live: [Mode: RootRig] = [:]
        var fallen: [String: RootRig] = [:]
        for row in rows where row.fellBack {
            // after the fallback nothing selects any more: one root per tab, fallen back from NATIVE there, then each
            // sheets state on it
            let r: RootRig
            if let f = fallen[row.selected] {
                r = f
            } else {
                r = rig(mode: .native)
                r.root.select(row.selected, source: .page(intent: nil))
                r.root.fallBack(why: .policy, at: Date())
                fallen[row.selected] = r
            }
            r.root.setSheets(open: row.sheets)
            r.root.view.layoutIfNeeded()
            XCTAssertEqual(r.root.selected, row.selected, row.name)
            XCTAssertEqual(r.root.coachMode, row.coach, row.name)
            XCTAssertEqual(r.root.sheetsOpen, row.sheets, row.name)
            XCTAssertEqual(r.root.isTabBarHidden, row.hidden, row.name)
            XCTAssertEqual(r.root.barMetrics().h, row.hidden ? 0 : r.cover(), row.name)
        }
        for row in rows where !row.fellBack {
            for sheetsFirst in [false, true] {
                let what = "\(row.name), \(sheetsFirst ? "sheets first" : "tab first")"
                let r: RootRig
                if let shared = live[row.coach] {
                    r = shared
                    r.root.setSheets(open: false)
                } else {
                    r = rig(mode: row.coach)
                    live[row.coach] = r
                }
                if sheetsFirst {
                    let other = ShellTabs.ids.first { $0 != row.selected && $0 != "coach" }!
                    r.root.select(other, source: .page(intent: nil))
                    r.root.setSheets(open: row.sheets)
                    r.root.select(row.selected, source: .page(intent: nil))
                } else {
                    r.root.select(row.selected, source: .page(intent: nil))
                    r.root.setSheets(open: row.sheets)
                }
                r.root.view.layoutIfNeeded()
                XCTAssertEqual(r.root.selected, row.selected, what)
                XCTAssertEqual(r.root.coachMode, row.coach, what)
                XCTAssertEqual(r.root.sheetsOpen, row.sheets, what)
                XCTAssertEqual(r.root.isTabBarHidden, row.hidden, what)
                let m = r.root.barMetrics()
                if row.hidden {
                    XCTAssertEqual(m.h, 0, "\(what): h is 0 while hidden")
                } else {
                    XCTAssertGreaterThan(m.h, 0, what)
                    XCTAssertEqual(m.h, r.cover(), "\(what): h is the bar frame's cover")
                }
                XCTAssertEqual(m.safe, Int(r.window.safeAreaInsets.bottom.rounded()), "\(what): safe is the window's inset")
            }
        }
    }

    func test06BarSheetsAndMetrics() async throws {
        XCTAssertTrue(RootTabController.predicted(screen: CGSize(width: 390, height: 844)) == (83, 34))
        XCTAssertTrue(RootTabController.predicted(screen: CGSize(width: 375, height: 667)) == (83, 0))
        XCTAssertTrue(RootTabController.predicted(screen: CGSize(width: 844, height: 390)) == (83, 34))

        let r = rig(mode: .native)
        XCTAssertEqual(r.root.tabBarMinimizeBehavior, .never, "the bar never minimizes (delta 14.5)")
        XCTAssertTrue(r.webView.scrollView.bottomEdgeEffect.isHidden, "no scroll-edge effect over the web slots (delta 14.5)")
        let shown = r.root.barMetrics()
        XCTAssertFalse(r.root.isTabBarHidden)
        XCTAssertEqual(shown.h, r.cover(), "h is the bar frame's cover in the web view's coordinates")
        XCTAssertGreaterThan(shown.h, 0)
        print("RootTabControllerTests: the bar here: h \(shown.h), safe \(shown.safe), frame \(r.root.tabBar.frame)")

        // a sheet on a web tab hides the bar at once, and the answer carries the numbers with a newer rev
        let open = r.root.setSheets(open: true)
        XCTAssertTrue(r.root.isTabBarHidden, "hidden in the same turn")
        XCTAssertEqual(r.root.barCalls.last?.hidden, true)
        XCTAssertEqual(r.root.barCalls.last?.animated, false, "a hide is never animated")
        XCTAssertEqual(open.h, 0)
        XCTAssertGreaterThan(open.rev, shown.rev, "rev rises")
        XCTAssertTrue(r.bars.isEmpty, "the answer carries the numbers: no tabs.bar")
        XCTAssertEqual(r.openSections, 0)
        XCTAssertEqual(r.sections, [true, false], "the hide runs inside the section")

        // into a native Coach tab with the sheet still open: the bar shows (an overlay in the hidden page covers nothing)
        r.clear()
        r.tap("coach")
        XCTAssertFalse(r.root.isTabBarHidden, "a native Coach tab keeps its bar")
        XCTAssertEqual(r.bars.last?.h, r.cover(), "the shell's own change goes out as tabs.bar")
        XCTAssertGreaterThan(r.bars.last?.rev ?? 0, open.rev)
        let onCoach = r.root.setSheets(open: true)
        XCTAssertFalse(r.root.isTabBarHidden, "sheets on a native Coach tab do not hide it")
        XCTAssertGreaterThan(onCoach.h, 0)

        // back to a web tab with the state open: hidden, and barChanged
        r.clear()
        r.tap("progress")
        XCTAssertTrue(r.root.isTabBarHidden)
        XCTAssertEqual(r.bars.map(\.h), [0], "one tabs.bar with h 0")
        let revHidden = r.bars.last?.rev ?? 0

        // resetSheets (a document start) shows it again on a web tab
        let reset = r.root.resetSheets()
        XCTAssertFalse(r.root.isTabBarHidden)
        XCTAssertFalse(r.root.sheetsOpen)
        XCTAssertEqual(reset.h, r.cover())
        XCTAssertGreaterThan(reset.rev, revHidden)
        try await settleSections(r)

        // a safe-area change of the selected slot alone (the bar's frame unmoved) leaves h as it was
        let before = r.root.barMetrics()
        let barFrame = r.root.tabBar.frame
        r.clear()
        r.slot("progress").additionalSafeAreaInsets.bottom = 20
        r.root.view.setNeedsLayout()
        r.root.view.layoutIfNeeded()
        XCTAssertEqual(r.root.tabBar.frame, barFrame)
        let after = r.root.barMetrics()
        XCTAssertEqual(after.h, before.h, "h follows the bar's frame, not the slot's inset")
        XCTAssertEqual(after.rev, before.rev)
        XCTAssertTrue(r.bars.isEmpty, "nothing to tell the page")
        r.slot("progress").additionalSafeAreaInsets.bottom = 0
        r.root.view.layoutIfNeeded()

        // the show animates, its section open until the animation is done and never past RootTabController.showSection
        // (on iOS 26.5 the transaction carrying UIKit's fade never completes), except under Reduce Motion
        r.root.setSheets(open: true)
        r.root.setSheets(open: false)
        XCTAssertEqual(r.root.barCalls.last?.hidden, false)
        XCTAssertEqual(r.root.barCalls.last?.animated, true, "the show animates")
        XCTAssertEqual(r.openSections, 1, "the show's section is open while it animates")
        let shownAt = Date()
        try await settleSections(r)
        XCTAssertLessThan(Date().timeIntervalSince(shownAt), RootTabController.showSection + 0.5 * Self.slack, "and closed in time")
        XCTAssertEqual(r.sections.filter { !$0 }.count, r.sections.filter { $0 }.count, "once")
        r.reduceMotion = true
        r.root.setSheets(open: true)
        r.root.setSheets(open: false)
        XCTAssertEqual(r.root.barCalls.last?.hidden, false)
        XCTAssertEqual(r.root.barCalls.last?.animated, false, "no animation under Reduce Motion")
        XCTAssertEqual(r.openSections, 0, "a still show closes its section at once")
    }

    /// Waits for every open section to close (an animated show's ends at its animation's end).
    private func settleSections(_ r: RootRig, file: StaticString = #filePath, line: UInt = #line) async throws {
        let closed = try await until { r.openSections == 0 }
        XCTAssertTrue(closed, "every section closed", file: file, line: line)
    }

    /// No safe-area hold in build 61 (delta 14.3): nothing touches the web controller's insets, and the Coach stack's own
    /// bottom inset is the bar's cover, with the hub and with the chat pushed.
    func test06NoSafeAreaHold() throws {
        let r = rig(first: "coach", mode: .native)
        r.root.view.layoutIfNeeded()
        let h = r.root.barMetrics().h
        XCTAssertGreaterThan(h, 0)
        XCTAssertEqual(Int(r.nav.view.safeAreaInsets.bottom.rounded()), h, "the stack's bottom inset is the bar's cover (hub)")
        XCTAssertEqual(Int(r.home.view.safeAreaInsets.bottom.rounded()), h, "the hub's bottom inset is the bar's cover")
        let chat = UIViewController()
        chat.hidesBottomBarWhenPushed = false
        r.nav.pushViewController(chat, animated: false)
        r.root.view.layoutIfNeeded()
        XCTAssertFalse(r.root.isTabBarHidden, "the bar stays over the pushed chat (D9)")
        XCTAssertEqual(Int(r.nav.view.safeAreaInsets.bottom.rounded()), h, "the stack's bottom inset is the bar's cover (chat)")
        XCTAssertEqual(Int(chat.view.safeAreaInsets.bottom.rounded()), h, "the chat's bottom inset is the bar's cover")
        for tab in ["log", "coach", "settings"] {
            r.root.select(tab, source: .page(intent: nil))
            r.root.setSheets(open: true)
            r.root.setSheets(open: false)
            XCTAssertEqual(r.web.additionalSafeAreaInsets, .zero, "\(tab): no inset set on the web controller")
            for s in r.root.slots { XCTAssertEqual(s.additionalSafeAreaInsets, .zero, "\(tab): none on a slot") }
            XCTAssertEqual(r.nav.additionalSafeAreaInsets, .zero, "\(tab): none on the stack")
        }
    }

    // MARK: 7. The room

    /// Whether this runtime's glass gives its platter's content its ancestors' style, so that a test window shows the style
    /// UIKit draws the content in: iOS 27 and later. iOS 26.x's glass gives its content the style it reads from what is
    /// drawn under the bar, whatever any ancestor wears (the H9 review on 26.5: in a test window, which draws nothing, the
    /// content keeps the phone's style over any ground; in the app the room's own page under the bar gives the room's
    /// style and content unlike it flips the bar, renders in both rooms and both phone appearances; TabBarLook's doc).
    nonisolated private static let glassContentInherits = ProcessInfo.processInfo.isOperatingSystemAtLeast(
        OperatingSystemVersion(majorVersion: 27, minorVersion: 0, patchVersion: 0))

    /// The room's style on the bar and on its container whatever the phone's, on every runtime (found in H9's by-hand run on
    /// iOS 27.0: the bar's own override reached the bar but not its platter's content, which took the window's style, so
    /// Lime on a phone in light mode drew light glass with black items and its selected item all but unreadable, and
    /// Heavyweight on a phone in dark mode dark glass). The container is the bar's ancestor directly under the root's view
    /// and never holds the web view or a slot; the web view and the root keep the phone's style on every tab, and the root,
    /// the slots and the window carry no style of their own. The host's own appearance stands for the phone's (a window's
    /// override does not reach the root here), and one of the two rooms is always unlike it.
    func test07aTheBarAndItsContainerWearTheRoomWhateverThePhone() throws {
        try roomCase(glass: false)
    }

    /// Every view UIKit draws the glass bar with wears the room's style whatever the phone's, on every tab: the platter's
    /// content takes it from the bar's container (iOS 27 and later; with the bar's override alone it took the window's).
    /// iOS 26.x's glass reads its content's style from what is drawn under the bar, which a test window never draws.
    func test07bTheGlassWearsTheRoomWhateverThePhone() throws {
        try XCTSkipUnless(Self.glassContentInherits, "iOS 26.x: the glass gives its content the style it reads from what is drawn "
                          + "under the bar, not its ancestors' (a test window draws nothing); test07a holds the bar and its container here, "
                          + "and the H9 review's renders on 26.5 the glass over the room's page")
        try roomCase(glass: true)
    }

    /// test07a and test07b: each room on a rig of its own, every tab selected in turn; `glass` also walks every view UIKit
    /// draws the bar with.
    private func roomCase(glass: Bool) throws {
        var unlike = 0
        for look in [Self.lime, Self.heavy] {
            let r = rig(first: "progress", mode: .native, look: look)
            let room: UIUserInterfaceStyle = look.paper ? .light : .dark
            let phone = r.window.traitCollection.userInterfaceStyle
            if phone != room { unlike += 1 }
            let container = try XCTUnwrap(r.root.barContainer, "\(look.room.id): the bar sits in a container under the root's view")
            XCTAssertTrue(container.superview === r.root.view)
            XCTAssertFalse(r.webView.isDescendant(of: container), "the container never holds the web view")
            for s in r.root.slots { XCTAssertFalse(s.view.isDescendant(of: container), "nor a slot") }
            if container !== r.root.tabBar {
                XCTAssertEqual(container.overrideUserInterfaceStyle, room, "\(look.room.id): the container wears the room")
            }
            for tab in ShellTabs.ids {
                r.root.select(tab, source: .page(intent: nil))
                r.root.view.layoutIfNeeded()
                XCTAssertEqual(r.root.tabBar.traitCollection.userInterfaceStyle, room, "\(look.room.id) \(tab): the bar wears the room")
                XCTAssertEqual(container.traitCollection.userInterfaceStyle, room, "\(look.room.id) \(tab): so does its container")
                if glass {
                    var drawn: [UIView] = []
                    func walk(_ v: UIView) { drawn.append(v); v.subviews.forEach(walk) }
                    walk(r.root.tabBar)
                    XCTAssertGreaterThan(drawn.count, 4, "\(look.room.id): UIKit draws the bar with views of its own")
                    let off = drawn.filter { $0.traitCollection.userInterfaceStyle != room }.map { NSStringFromClass(type(of: $0)) }
                    XCTAssertEqual(off, [], "\(look.room.id) \(tab) on a phone in \(TabBarLook.word(phone)) mode: every view of the bar wears the room")
                }
                XCTAssertEqual(r.webView.traitCollection.userInterfaceStyle, phone, "\(look.room.id) \(tab): the web view keeps the phone's style")
                XCTAssertEqual(r.root.traitCollection.userInterfaceStyle, phone, "\(look.room.id) \(tab): so does the root")
            }
            XCTAssertEqual(r.root.overrideUserInterfaceStyle, .unspecified, "never the root")
            for s in r.root.slots { XCTAssertEqual(s.overrideUserInterfaceStyle, .unspecified, "never a slot") }
            XCTAssertEqual(r.window.overrideUserInterfaceStyle, .unspecified, "never the window")
        }
        XCTAssertEqual(unlike, 1, "one room is unlike the phone's appearance")
    }

    /// The room's style never stays on a container that holds a slot or the web view (contract 6.1: their traits, the web
    /// keyboards and the page's `prefers-color-scheme` are the phone's): a layout pass that finds one under the container
    /// it painted (UIKit hosting the bar anew) gives the container back the style it had, and once it holds none again
    /// the next pass paints it with the room.
    func test07cTheContainerGivesItsStyleBackOnceItHoldsASlotOrTheWebView() throws {
        let r = rig(first: "progress", mode: .native, look: Self.lime)
        let container = try XCTUnwrap(r.root.barContainer)
        try XCTSkipIf(container === r.root.tabBar, "the bar sits directly under the root's view here: no container is painted")
        XCTAssertEqual(container.overrideUserInterfaceStyle, .dark, "painted with the room")
        let phone = r.window.traitCollection.userInterfaceStyle
        func layout() {
            r.root.view.setNeedsLayout()
            r.root.view.layoutIfNeeded()
        }

        let slot = r.slot("settings")
        container.addSubview(slot.view)
        layout()
        XCTAssertEqual(container.overrideUserInterfaceStyle, .unspecified, "a slot under it: the style it had")
        XCTAssertEqual(slot.view.traitCollection.userInterfaceStyle, phone, "the slot keeps the phone's style")
        slot.view.removeFromSuperview()
        layout()
        XCTAssertEqual(container.overrideUserInterfaceStyle, .dark, "none under it: the room again")

        container.addSubview(r.webView)
        layout()
        XCTAssertEqual(container.overrideUserInterfaceStyle, .unspecified, "the web view under it: the style it had")
        XCTAssertEqual(r.webView.traitCollection.userInterfaceStyle, phone, "the web view keeps the phone's style")
        r.root.select("log", source: .page(intent: nil))
        layout()
        XCTAssertTrue(r.web.parent === r.slot("log"), "the funnel placed the page in Log's slot")
        XCTAssertFalse(r.webView.isDescendant(of: container))
        XCTAssertEqual(container.overrideUserInterfaceStyle, .dark, "the web view back in a slot: the room again")
        checkInWindow(r, "the page back through the funnel")
    }

    func test07Room() throws {
        var heavyRig: RootRig?
        for (look, style, tint) in [(Self.lime, UIUserInterfaceStyle.dark, "#f4f4f1"), (Self.heavy, .light, "#0a43f5")] {
            let r = rig(first: "coach", mode: .native, look: look)
            if look.paper { heavyRig = r }
            XCTAssertEqual(r.root.firstRoom, look.room.id, "\(look.room.id): the room the root was built with")
            XCTAssertEqual(r.root.describe()["firstRoom"] as? String, look.room.id, "\(look.room.id): describe() says it")
            XCTAssertEqual(r.root.tabBar.overrideUserInterfaceStyle, style, "\(look.room.id): the bar's style, set explicitly")
            XCTAssertEqual(r.nav.overrideUserInterfaceStyle, style, "\(look.room.id): the stack's style")
            XCTAssertEqual(css(r.root.tabBar.tintColor), tint, "\(look.room.id): tint")
            XCTAssertEqual(css(r.root.tabBar.unselectedItemTintColor), look.idle.css, "\(look.room.id): idle")
            XCTAssertEqual(r.window.overrideUserInterfaceStyle, .unspecified, "never the window")
            XCTAssertEqual(r.root.overrideUserInterfaceStyle, .unspecified, "never the root")
            for s in r.root.slots { XCTAssertEqual(s.overrideUserInterfaceStyle, .unspecified, "never a slot") }
            XCTAssertEqual(r.web.overrideUserInterfaceStyle, .unspecified)
            for tab in ShellTabs.ids {
                r.root.select(tab, source: .page(intent: nil))
                XCTAssertEqual(r.webView.traitCollection.userInterfaceStyle, r.window.traitCollection.userInterfaceStyle,
                               "\(look.room.id) \(tab): the web view's style is the window's")
            }
            XCTAssertEqual(css(r.root.coachSlot.waiting.view.backgroundColor), Tokens.defaults(for: look.room).color(.bg).css,
                           "the WAITING ground is the room's bg")
            XCTAssertEqual(css(r.nav.view.backgroundColor), Tokens.defaults(for: look.room).color(.bg).css,
                           "the stack's ground is the room's bg")
        }

        // a model's titles and labels: each item labelled exactly its a11y, each with its title (the Large Content
        // Viewer's words), the glyphs the shell's
        let json = ##"{"v":1,"rev":3,"boot":"b1","room":"heavyweight","paper":true,"tint":"#112233","idle":"#445566","items":[{"id":"settings","title":"Setup","a11y":"Setup tab"},{"id":"log","title":"Journal","a11y":"Journal tab"},{"id":"progress","title":"Gains","a11y":"Gains tab"},{"id":"coach","title":"Trainer","a11y":"Trainer tab"}]}"##
        let model = try TabsModel.decode(json)
        let r = try XCTUnwrap(heavyRig)
        r.root.apply(model)
        r.root.view.layoutIfNeeded()
        let items = try XCTUnwrap(r.root.tabBar.items)
        XCTAssertEqual(items.count, 4)
        for (i, id) in ShellTabs.ids.enumerated() {
            XCTAssertEqual(items[i].accessibilityLabel, model.item(id)?.a11y, "\(id): the label is exactly a11y")
            XCTAssertEqual(items[i].title, model.item(id)?.title, "\(id): the title")
            XCTAssertNotNil(items[i].image, "\(id): a glyph")
        }
        XCTAssertEqual(css(r.root.tabBar.tintColor), "#112233")
        XCTAssertEqual(css(r.root.tabBar.unselectedItemTintColor), "#445566")
        r.root.apply(Self.lime)
        XCTAssertEqual(r.root.tabBar.overrideUserInterfaceStyle, .dark, "a page's model in the other room")
        XCTAssertEqual(r.root.describe()["firstRoom"] as? String, "heavyweight", "the first frame's room stays what it was")
        r.root.apply(model)
        r.root.view.layoutIfNeeded()

        // the items keep UIKit's own traits (contract 6.1, I17): the root sets none on an item, and UIKit's selection, which
        // its accessibility reads as `.selected`, follows the funnel on both copies UIKit draws. The traits themselves are
        // read only where the accessibility runtime is loaded (in this host the controls are no accessibility elements; in
        // the app probe61 read them, and the device checklist's VoiceOver line hears them)
        r.root.select("progress", source: .page(intent: nil))
        r.root.view.layoutIfNeeded()
        _ = outsideOverTurns(r.webView)
        var axLoaded = false
        for (i, id) in ShellTabs.ids.enumerated() {
            XCTAssertEqual(items[i].accessibilityTraits, UITabBarItem().accessibilityTraits, "\(id): no trait of the root's on the item")
            let cs = controls(r, drawing: items[i].title ?? "")
            XCTAssertFalse(cs.isEmpty, "\(id): UIKit draws a control for the item")
            for c in cs {
                XCTAssertEqual(c.isSelected, id == "progress", "\(id): selected exactly when its tab is")
                guard c.isAccessibilityElement else { continue }
                axLoaded = true
                XCTAssertTrue(c.accessibilityTraits.contains(.button), "\(id): a button")
                XCTAssertEqual(c.accessibilityTraits.contains(.selected), id == "progress", "\(id): .selected exactly when selected")
            }
        }
        print("RootTabControllerTests: the bar's controls are accessibility elements here: \(axLoaded)")
    }

    // MARK: 8. The fallback

    func test08Fallback() throws {
        for mode in [Mode.waiting, .native, .web] {
            let r = rig(first: "coach", mode: mode)
            r.root.setSheets(open: false)
            r.clear()
            let seq = r.root.seq
            let at = Date()
            r.root.fallBack(why: .failures, at: at)
            XCTAssertTrue(r.root.isTabBarHidden, "the bar hidden")
            XCTAssertEqual(r.root.barCalls.last?.animated, false, "without animation")
            XCTAssertEqual(r.root.coachMode, .web, "the Coach tab WEB for the rest of the scene")
            XCTAssertTrue(r.webView.superview === r.root.coachSlot.webArea, "the web view shown where it was")
            XCTAssertFalse(r.webView.isHidden)
            XCTAssertFalse(r.webView.accessibilityElementsHidden)
            XCTAssertTrue(r.nav.view.isHidden)
            XCTAssertFalse(r.root.held)
            XCTAssertEqual(r.openSections, 0)
            XCTAssertEqual(r.sections.first, true, "inside the section")
            XCTAssertTrue(r.covered.isEmpty, "covered off is the bridge's (H8)")
            XCTAssertEqual(r.posts.count, mode == .web ? 0 : 1, "VoiceOver hears the page that replaced the stack")
            XCTAssertEqual(r.shown.last, false)

            // later selections, sheets, modes and a second fallback move nothing
            r.clear()
            XCTAssertTrue(r.root.select("log", source: .page(intent: nil)) == ("coach", seq))
            r.tap("progress")
            r.root.selectedIndex = 3
            XCTAssertEqual(r.root.selected, "coach")
            XCTAssertEqual(r.root.seq, seq)
            XCTAssertTrue(r.runs.isEmpty)
            XCTAssertTrue(r.selections.isEmpty)
            XCTAssertEqual(r.root.setSheets(open: false).h, 0)
            XCTAssertTrue(r.root.isTabBarHidden, "hidden for good")
            r.root.resetSheets()
            XCTAssertTrue(r.root.isTabBarHidden, "hidden for good after a document start too")
            r.root.setHome(r.home)
            r.root.setCoachMode(.native)
            XCTAssertEqual(r.root.coachMode, .web)
            r.root.fallBack(why: .policy, at: Date())
            XCTAssertEqual(r.root.fellBack?.why, .failures, "once")
            XCTAssertTrue(r.bars.isEmpty, "no tabs.bar after the fallback")
            let d = r.root.describe()["fellBack"] as? [String: Any]
            XCTAssertEqual(d?["why"] as? String, "failures")
            XCTAssertEqual(d?["at"] as? Double, (at.timeIntervalSince1970 * 1000).rounded())
            checkInWindow(r, "after the fallback from Coach \(mode.rawValue)")
        }

        // on a web tab: the web view stays in its slot, shown; the bar hidden
        let r = rig(first: "settings", mode: .native)
        r.root.fallBack(why: .switch, at: Date())
        XCTAssertTrue(r.webView.superview === r.slot("settings").view)
        XCTAssertFalse(r.webView.isHidden)
        XCTAssertTrue(r.root.isTabBarHidden)
        XCTAssertEqual(r.root.coachMode, .web)
        XCTAssertTrue(r.posts.isEmpty, "nothing changed under VoiceOver but the bar")
    }

    /// I5 at the fallback (contract 8.5, 10.3): a native field focused on the selected Coach tab's stack (the connect
    /// screen's key field, a hub field, a field of the pushed chat) resigns before the stack hides, as it does when the
    /// tab turns WEB: no first responder stays in a hidden view, so no keys stay up over the page and nothing typed goes
    /// into a hidden field. On a web tab nothing hides, and a field in the web view keeps its focus.
    func test08bTheFallbackEndsEditingBeforeTheStackHides() throws {
        for pushed in [false, true] {
            let what = pushed ? "a field of the pushed screen" : "a field of the home"
            let r = rig(first: "coach", mode: .native)
            var host = r.home
            if pushed {
                host = UIViewController()
                r.nav.pushViewController(host, animated: false)
                r.root.view.layoutIfNeeded()
            }
            let field = UITextField(frame: CGRect(x: 20, y: 120, width: 200, height: 44))
            host.view.addSubview(field)
            XCTAssertTrue(field.becomeFirstResponder() && field.isFirstResponder, "\(what) takes focus")
            r.root.fallBack(why: .policy, at: Date())
            XCTAssertTrue(r.nav.view.isHidden, "\(what): the stack hidden")
            XCTAssertFalse(field.isFirstResponder, "\(what): resigned")
            assertNoHiddenFocus(r, "\(what), after the fallback")
            _ = outsideOverTurns(r.webView)
            assertNoHiddenFocus(r, "\(what), three turns later")
            field.removeFromSuperview()
        }

        let w = rig(first: "settings", mode: .native)
        let field = UITextField(frame: CGRect(x: 20, y: 120, width: 200, height: 44))
        w.webView.addSubview(field)
        XCTAssertTrue(field.becomeFirstResponder() && field.isFirstResponder, "a web field takes focus")
        w.root.fallBack(why: .switch, at: Date())
        XCTAssertTrue(field.isFirstResponder, "a web tab: nothing hides, the page keeps its focus")
        assertNoHiddenFocus(w, "a web tab, after the fallback")
        field.resignFirstResponder()
        field.removeFromSuperview()
    }

    // MARK: 9. VoiceOver and the other routes in

    func test09RoutesIn() throws {
        let r = rig(mode: .native)
        guard let progress = tabControl(r, "progress") else {
            throw XCTSkip("this host draws no control for the bar's items (the probe's tapTab finds them in the app)")
        }
        XCTAssertFalse(progress.accessibilityActivate(), "accessibilityActivate() selects nothing on the glass bar (delta 14.2)")
        XCTAssertEqual(r.root.selected, "log")
        XCTAssertTrue(r.runs.isEmpty)
        progress.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.root.selected, "progress", "the control's own action runs the funnel")
        XCTAssertEqual(r.runs.count, 1, "once")
        XCTAssertEqual(r.runs.last?.source, .tap)
        XCTAssertEqual(r.root.strays, 0, "no stray")

        let coach = try XCTUnwrap(tabControl(r, "coach"))
        coach.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.root.selected, "coach")
        XCTAssertEqual(r.runs.count, 2)
        let again = try XCTUnwrap(tabControl(r, "coach"))
        again.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.runs.count, 3, "a re-tap through the control")
        XCTAssertEqual(r.selections.last?.again, true)
        XCTAssertEqual(r.root.strays, 0)
        checkInWindow(r, "the routes in")
    }

    func test09VoiceOver() async throws {
        let r = rig(mode: .native)
        // entering a NATIVE Coach tab posts at once, with the stack's top view
        r.tap("coach")
        XCTAssertEqual(r.posts.count, 1)
        XCTAssertTrue(r.posts.first === r.home.view, "the stack's top view")
        XCTAssertTrue(r.events.firstIndex(of: "post")! < r.events.lastIndex(of: "section off")!, "in the run's turn")

        // a tap to a web tab posts nothing in its own turn, then the web view at announceWeb(seq)
        r.clear()
        r.tap("progress")
        XCTAssertTrue(r.posts.isEmpty, "nothing until the page has drawn the tab")
        let s = r.root.seq
        r.root.announceWeb(seq: s)
        XCTAssertEqual(r.posts.count, 1)
        XCTAssertTrue(r.posts.first === r.webView)
        r.root.announceWeb(seq: s)
        XCTAssertEqual(r.posts.count, 1, "once")

        // an announceWeb for a seq a newer run replaced posts nothing
        r.clear()
        r.tap("settings")
        let s1 = r.root.seq
        r.root.select("log", source: .deepLink(share: false))
        let s2 = r.root.seq
        r.root.announceWeb(seq: s1)
        XCTAssertTrue(r.posts.isEmpty, "a newer run replaced it")
        r.tap("log")
        XCTAssertEqual(r.root.seq, s2 + 1, "a re-tap")
        r.root.announceWeb(seq: s2 + 1)
        XCTAssertTrue(r.posts.isEmpty, "a re-tap posts nothing of its own")
        r.root.announceWeb(seq: s2)
        XCTAssertEqual(r.posts.count, 1, "the deep link's run, still the newest move, is heard")

        // a page run to a web tab posts once at its end
        r.clear()
        r.root.select("settings", source: .page(intent: nil))
        XCTAssertEqual(r.posts.count, 1)
        XCTAssertTrue(r.posts.first === r.webView)
        r.root.announceWeb(seq: r.root.seq)
        XCTAssertEqual(r.posts.count, 1, "once")

        // a stray to a web tab waits for its tabs.select like a tap
        r.clear()
        r.root.selectedIndex = 1
        XCTAssertTrue(r.posts.isEmpty)
        r.root.announceWeb(seq: r.root.seq)
        XCTAssertEqual(r.posts.count, 1)

        // a held entry: nothing at the entry, the top view when the hold runs out
        r.clear()
        r.root.holdBudget = 0.2
        r.root.select("coach", source: .page(intent: "chat"))
        XCTAssertTrue(r.root.held)
        XCTAssertTrue(r.posts.isEmpty, "held: nothing yet")
        let ended = try await until { !r.root.held }
        XCTAssertTrue(ended)
        XCTAssertEqual(r.posts.count, 1, "heard when the hold ends")
        XCTAssertTrue(r.posts.first === r.home.view)
        XCTAssertEqual(r.shown.last, true, "ScreenHost follows (markers, anchor)")

        // a hold a push ends posts nothing of the root's (ScreenHost announces the chat)
        r.root.select("log", source: .page(intent: nil))
        r.clear()
        r.root.select("coach", source: .deepLink(share: true))
        XCTAssertTrue(r.root.held)
        r.root.releaseHold()
        XCTAssertFalse(r.root.held)
        XCTAssertTrue(r.posts.isEmpty, "releaseHold() posts nothing")

        // a WEB Coach tab is a web destination; a WAITING one posts its ground
        let w = rig(mode: .web)
        w.tap("coach")
        XCTAssertTrue(w.posts.isEmpty)
        w.root.announceWeb(seq: w.root.seq)
        XCTAssertTrue(w.posts.first === w.webView)
        let g = rig(mode: .waiting)
        g.tap("coach")
        XCTAssertEqual(g.posts.count, 1)
        XCTAssertTrue(g.posts.first === g.root.coachSlot.waiting.view, "the WAITING ground")
        // turning NATIVE on the selected tab posts the home, turning WEB the page
        g.clear()
        g.root.setHome(g.home)
        XCTAssertTrue(g.posts.last === g.home.view)
        g.root.setCoachMode(.web)
        XCTAssertTrue(g.posts.last === g.webView)
        XCTAssertEqual(g.posts.count, 2)
    }

    /// Contract 8.1 step 7, D45, I17: the newest move into a web tab that VoiceOver has not heard is `pendingWebAnnounce`
    /// (the bridge posts it after a hello for a run whose `tabs.select` no document answered); one that the scene's
    /// fallback overtakes is still heard once the page has drawn the tab (the fallback changes no selection), and once.
    func test09bAnUnheardWebMoveIsPendingAndSurvivesTheFallback() throws {
        let r = rig(mode: .native)
        XCTAssertNil(r.root.pendingWebAnnounce, "the first frame waits for nobody")
        r.tap("progress")
        let s = r.root.seq
        XCTAssertEqual(r.root.pendingWebAnnounce, s)
        r.root.announceWeb(seq: s)
        XCTAssertNil(r.root.pendingWebAnnounce, "heard")
        r.tap("settings")
        r.tap("coach")
        XCTAssertNil(r.root.pendingWebAnnounce, "a NATIVE Coach tab is heard at once: nothing waits")
        r.root.select("log", source: .page(intent: nil))
        XCTAssertNil(r.root.pendingWebAnnounce, "a page run is heard at its end")

        r.clear()
        r.tap("progress")
        let p = r.root.seq
        r.root.fallBack(why: .failures, at: Date())
        XCTAssertTrue(r.posts.isEmpty, "the page has not drawn Progress yet")
        XCTAssertEqual(r.root.pendingWebAnnounce, p, "still waiting after the fallback")
        r.root.announceWeb(seq: p)
        XCTAssertEqual(r.posts.count, 1, "heard once the page has drawn it")
        XCTAssertTrue(r.posts.first === r.webView)
        r.root.announceWeb(seq: p)
        XCTAssertEqual(r.posts.count, 1, "once")
        XCTAssertNil(r.root.pendingWebAnnounce)
    }

    // MARK: 10. The status bar

    func test10StatusBar() throws {
        for look in [Self.heavy, Self.lime] {
            let r = rig(first: "coach", look: look)
            XCTAssertTrue(r.statusController() === r.root.coachSlot.waiting, "WAITING: the ground decides")
            XCTAssertEqual(r.statusController().preferredStatusBarStyle, look.paper ? .darkContent : .lightContent, "the room's style")
            r.root.select("log", source: .page(intent: nil))
            XCTAssertTrue(r.statusController() === r.web, "a web slot: the web controller")
            r.root.setHome(r.home)
            r.root.select("coach", source: .page(intent: nil))
            XCTAssertTrue(r.statusController() === r.home, "NATIVE: the stack's top")
            let chat = UIViewController()
            r.nav.pushViewController(chat, animated: false)
            XCTAssertTrue(r.statusController() === chat, "the pushed chat")
            r.nav.popViewController(animated: false)
            r.root.setCoachMode(.web)
            XCTAssertTrue(r.statusController() === r.web, "WEB: the web controller")
        }
    }

    // MARK: 11. The hold

    func test11Hold() async throws {
        let r = rig(mode: .native)
        r.root.holdBudget = 0.25
        let entries: [(String, RootTabController.Source, Bool)] = [
            ("a page selection for the chat", .page(intent: "chat"), false),
            ("a page selection for setup", .page(intent: "intake"), false),
            ("a warm share", .deepLink(share: true), false),
            ("a tap while the model resumes", .tap, true),
            ("a deep link while the model resumes", .deepLink(share: false), true),
        ]
        for (name, source, resume) in entries {
            for ending in ["release", "time"] {
                r.tap("log")
                r.clear()
                r.root.coachResume = resume
                if source == .tap { r.tap("coach") } else { r.root.select("coach", source: source) }
                XCTAssertTrue(r.root.held, "\(name): held")
                XCTAssertEqual(r.home.view.alpha, 0, "\(name): no hub on top of the selected tab while held")
                XCTAssertEqual((r.root.describe()["coach"] as? [String: Any])?["held"] as? Bool, true)
                XCTAssertTrue(r.posts.isEmpty, "\(name): nothing heard while held")
                if ending == "release" {
                    r.root.releaseHold()
                    XCTAssertTrue(r.posts.isEmpty, "\(name): a hold the push ends is ScreenHost's to announce")
                } else {
                    let ended = try await until { !r.root.held }
                    XCTAssertTrue(ended, "\(name): the hold runs out")
                    XCTAssertTrue(r.posts.last === r.home.view, "\(name): the hub heard when the hold runs out")
                }
                XCTAssertFalse(r.root.held, "\(name), \(ending): the hold ended")
                XCTAssertEqual(r.home.view.alpha, 1, "\(name), \(ending): the hub shows")
                r.root.coachResume = false
            }
        }

        // nothing held: a plain tap, a start link, a page selection without intent
        let plain: [(String, RootTabController.Source)] = [("a tap", .tap), ("a start link", .deepLink(share: false)),
                                                           ("a page selection", .page(intent: nil))]
        for (name, source) in plain {
            r.tap("log")
            if source == .tap { r.tap("coach") } else { r.root.select("coach", source: source) }
            XCTAssertFalse(r.root.held, "\(name): nothing held")
            XCTAssertEqual(r.home.view.alpha, 1)
        }

        // nothing held with the chat pushed
        r.tap("log")
        let chat = UIViewController()
        r.nav.pushViewController(chat, animated: false)
        r.root.coachResume = true
        r.root.select("coach", source: .page(intent: "chat"))
        XCTAssertFalse(r.root.held, "the chat pushed: nothing held")
        r.root.coachResume = false
        r.nav.popViewController(animated: false)

        // nothing held on a WAITING or a WEB Coach tab
        for mode in [Mode.waiting, .web] {
            let w = rig(mode: mode)
            w.root.coachResume = true
            w.root.select("coach", source: .page(intent: "chat"))
            XCTAssertFalse(w.root.held, "Coach \(mode.rawValue): nothing held")
        }

        // leaving Coach, turning WEB and the fallback drop a hold, with no word to VoiceOver about the hub
        for drop in ["leave", "web", "fallback"] {
            r.tap("log")
            if r.root.coachMode == .web { r.root.setHome(r.home) }
            r.root.select("coach", source: .page(intent: "chat"))
            XCTAssertTrue(r.root.held, "\(drop): held first")
            r.clear()
            switch drop {
            case "leave": r.tap("log")
            case "web": r.root.setCoachMode(.web)
            default: r.root.fallBack(why: .page, at: Date())
            }
            XCTAssertFalse(r.root.held, "\(drop) drops the hold")
            XCTAssertEqual(r.home.view.alpha, 1)
            XCTAssertFalse(r.posts.contains { $0 === r.home.view }, "\(drop): the hub is not announced")
        }
        try await Task.sleep(nanoseconds: UInt64(0.5 * 1_000_000_000))
        XCTAssertFalse(r.posts.contains { $0 === r.home.view }, "a dropped hold's time runs out silently")
    }

    // MARK: 12. Stress

    /// 500 random funnel runs (taps, page and deep-link selections, strays), with Coach turning NATIVE and WEB and the
    /// sheets opening and closing among them: never out of the window, sampled as case 1 samples.
    func test12Stress() throws {
        let r = rig(mode: .native)
        var rng = SplitMix(seed: 61)
        var moved = 0
        for i in 0..<500 {
            let tab = ShellTabs.ids[Int(rng.next() % 4)]
            let way = Way.allCases[Int(rng.next() % 4)]
            switch rng.next() % 10 {
            case 0: r.root.setCoachMode(r.root.coachMode == .web ? .native : .web)
            case 1: r.root.setSheets(open: !r.root.sheetsOpen)
            default: break
            }
            if r.root.coachMode == .web, rng.next() % 3 == 0 { r.root.setHome(r.home) }
            let before = r.root.selected
            drive(r, way, to: tab)
            if before != tab { moved += 1 }
            XCTAssertEqual(r.root.selected, tab, "run \(i)")
            checkInWindow(r, "run \(i): \(way) \(before) -> \(tab)")
        }
        XCTAssertGreaterThan(moved, 300)
        XCTAssertEqual(r.openSections, 0)
    }

    // MARK: 13. The first frame on Coach

    func test13FirstFrameOnCoach() throws {
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let webView = RecordingWebView(frame: frame)
        let web = StandInWebController(webView: webView)
        web.loadViewIfNeeded()
        let root = RootTabController(web: web, webView: webView, first: "coach", look: Self.heavy)
        XCTAssertEqual(root.selected, "coach")
        XCTAssertEqual(root.coachMode, .waiting)
        XCTAssertTrue(webView.superview === root.coachSlot.webArea, "placed in the Coach slot at the end of init")
        XCTAssertTrue(web.parent === root.coachSlot)
        XCTAssertTrue(webView.isHidden)
        XCTAssertTrue(webView.accessibilityElementsHidden)
        XCTAssertEqual(root.funnelRuns.map(\.source), [.initial])
        XCTAssertEqual(root.seq, 0)

        let window = UIWindow(frame: frame)
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first { window.windowScene = scene }
        window.rootViewController = root
        window.makeKeyAndVisible()
        root.view.layoutIfNeeded()
        XCTAssertTrue(webView.window === window, "in the window in the turn the root became the window's root")
        XCTAssertTrue(webView.isHidden)
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(of: webView), 0)
        XCTAssertEqual(RecordingWebView.moves.filter { $0.view == webView.serial }.map(\.intoWindow), [true])
        webView.live = false
        window.isHidden = true
    }

    // MARK: 14. Modes per scene, describe

    func test14ModesPerScene() throws {
        let r = rig(first: "coach")
        XCTAssertEqual(r.root.coachMode, .waiting)
        XCTAssertEqual((r.root.describe()["coach"] as? [String: Any])?["root"] as? String, "waiting")
        r.root.setHome(r.home)
        XCTAssertEqual(r.root.coachMode, .native, "WAITING turns NATIVE")
        XCTAssertEqual(r.covered, [true], "the selected tab turning NATIVE covers the page")
        r.root.setCoachMode(.waiting)
        XCTAssertEqual(r.root.coachMode, .native, "and never back")
        r.root.setCoachMode(.web)
        XCTAssertEqual(r.root.coachMode, .web)
        XCTAssertEqual(r.covered, [true, false], "turning WEB uncovers it")
        XCTAssertFalse(r.webView.isHidden)
        r.root.setCoachMode(.waiting)
        XCTAssertEqual(r.root.coachMode, .web, "WEB never turns WAITING")
        r.root.homeRoute = { "hub" }
        r.root.setHome(r.home)
        XCTAssertEqual(r.root.coachMode, .native, "WEB turns NATIVE again on setHome")
        XCTAssertTrue(r.webView.isHidden)
        XCTAssertEqual((r.root.describe()["coach"] as? [String: Any])?["root"] as? String, "hub")
        XCTAssertEqual(r.nav.viewControllers.first, r.home)

        let w = rig()
        w.root.setCoachMode(.native)
        XCTAssertEqual(w.root.coachMode, .waiting, "NATIVE needs a home")
        w.root.setCoachMode(.web)
        XCTAssertEqual(w.root.coachMode, .web, "WAITING turns WEB")
        w.root.setCoachMode(.waiting)
        XCTAssertEqual(w.root.coachMode, .web)
        XCTAssertTrue(w.covered.isEmpty, "Coach not selected: nothing to cover")
        w.root.setHome(w.home)
        XCTAssertEqual(w.root.coachMode, .native)
        XCTAssertTrue(w.covered.isEmpty, "Coach not selected: nothing to cover")
        XCTAssertEqual(w.shown, [false, false], "ScreenHost hears every mode change (Coach not shown)")

        // describe: every field of contract 15.3, at most 50 runs, one onFunnelRun per run
        r.clear()
        var made = 0
        for i in 0..<60 {
            r.root.select(ShellTabs.ids[i % 4], source: i % 2 == 0 ? .tap : .page(intent: nil))
            made += 1
        }
        XCTAssertEqual(r.runs.count, made, "onFunnelRun once per run")
        let d = r.root.describe()
        XCTAssertTrue(JSONSerialization.isValidJSONObject(d), "describe() serialises")
        for key in ["kind", "fellBack", "selected", "seq", "web", "bar", "coach", "sheetsOpen", "strays", "runs"] {
            XCTAssertNotNil(d[key], "describe().\(key)")
        }
        XCTAssertEqual(d["kind"] as? String, "tabs")
        XCTAssertTrue(d["fellBack"] is NSNull)
        let web = try XCTUnwrap(d["web"] as? [String: Any])
        for key in ["slot", "inWindow", "hidden", "a11yHidden", "frame", "safeBottom"] { XCTAssertNotNil(web[key], "web.\(key)") }
        let bar = try XCTUnwrap(d["bar"] as? [String: Any])
        for key in ["hidden", "h", "safe", "rev", "frame", "slotInset", "tint", "style", "minimize"] { XCTAssertNotNil(bar[key], "bar.\(key)") }
        XCTAssertEqual(bar["minimize"] as? String, "never")
        XCTAssertEqual(bar["style"] as? String, "light")
        XCTAssertEqual(bar["tint"] as? String, Self.heavy.tint.css)
        let coach = try XCTUnwrap(d["coach"] as? [String: Any])
        for key in ["mode", "root", "pushed", "depth", "interactivePop", "held"] { XCTAssertNotNil(coach[key], "coach.\(key)") }
        let runs = try XCTUnwrap(d["runs"] as? [[String: Any]])
        XCTAssertEqual(runs.count, 50, "the last 50 runs")
        for key in ["source", "from", "to", "seq", "moved", "t0", "t1"] { XCTAssertNotNil(runs.last?[key], "runs[].\(key)") }
        XCTAssertEqual(runs.last?["seq"] as? Int, r.root.seq)
        XCTAssertEqual(d["seq"] as? Int, r.root.seq)
        XCTAssertEqual(web["slot"] as? String, r.root.selected)
    }

    // MARK: 99. The class's last word

    /// One wait at the end of the class: a move out of the window that came late from any rig still counts (I1).
    func test99NoLateMoveOutOfTheWindow() async throws {
        try await Task.sleep(nanoseconds: 1_000_000_000)
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(), 0, "no live web view of the class left its window, late or not")
    }
}

/// A small seeded generator, so the stress case runs the same 500 runs every time.
struct SplitMix {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

private extension RGBA {
    /// The sRGB colour a UIColor holds (nil for a pattern or another space it cannot give).
    init?(uiColor c: UIColor) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard c.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        self.init(red: Double(r), green: Double(g), blue: Double(b), alpha: Double(a))
    }
}
#endif
