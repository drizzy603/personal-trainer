#if os(iOS)
import Foundation
import UIKit
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// One scene of the tab root's cases, built as SceneDelegate builds it (H9): a ShellBridge of its own (its own folder and
/// defaults), `install(..., launch:)` deciding the root, then, for a tab root, a real RootTabController made, adopted and
/// set as the window's root inside the `tabs` section; else the web controller as the window's root. The web view is a
/// RecordingWebView (it logs every move out of its window), and VoiceOver's screen changes are recorded by what they
/// name, never holding it.
@available(iOS 26.0, *)
@MainActor
final class TabsScene {
    let bridge: ShellBridge
    let webView: RecordingWebView
    let web: StandInWebController
    let window: UIWindow
    /// The hub's stand-in (H10 gives N's): `setHome` turns the Coach tab NATIVE on it.
    let home = UIViewController()
    var installed = ShellInstall(screens: [], tabsRoot: false)
    var root: RootTabController?
    /// VoiceOver's screen changes: "web" (the web view), "top" (the Coach stack's top view), "view" (another), "nil".
    var posts: [String] = []

    init(bridge: ShellBridge) {
        self.bridge = bridge
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        webView = RecordingWebView(frame: frame)
        web = StandInWebController(webView: webView)
        web.loadViewIfNeeded()
        window = UIWindow(frame: frame)
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first { window.windowScene = scene }
        home.view.backgroundColor = .systemTeal
    }

    var binding: ShellBridge.Binding? { bridge.binding }

    func post(_ arg: Any?, root: RootTabController?) {
        guard let v = arg as? UIView else { return posts.append("nil") }
        if v === webView { return posts.append("web") }
        if let root, v === root.coachSlot.nav.topViewController?.view { return posts.append("top") }
        posts.append("view")
    }

    /// The scene goes (`sceneDidDisconnect`): the bridge lets go, then the window does. The web view's moves out of the
    /// window from here on are no fault.
    func letGo() {
        bridge.sceneDisconnected(webView: webView)
        webView.live = false
        window.isHidden = true
        window.rootViewController = nil
    }
}

/// A weak reference, for the teardown case.
private final class Weak {
    weak var object: AnyObject?
    init(_ o: AnyObject?) { object = o }
}

/// ShellBridge with a live tab root (11-shell.md H7; contract 3.1, 3.3, 3.4, 3.6, 3.7, 4.3, 4.4, 7.1, 8.1, 8.4, 9, 15.2,
/// 15.3; delta 14.1): a real window, a real RootTabController and a stand-in page whose `FPScreens.call` records every
/// intent and answers as each case sets (`window.__how`), and whose `window._trovoOpen` records its argument
/// (PageLinkTests' page is the model). The root decision, `selectTab` and its funnel (no echo, I3), the owner's taps,
/// re-taps and strays (one `tabs.select` each), the refusals, `sheets` per document, `tabs.select` and `tabs.bar` as
/// state (restated once the link is idle, never resent), the TabsModel and the interim `coachHome` drop, deep links (the
/// URL an argument, never source), covered, the breaker's attribution, a hidden page on a web tab, the teardown that
/// frees the root and the web view, VoiceOver's screen change after the page's answer, and a busy page against a dead
/// one (held timeouts, contract 4.4). The fallback that a trip or a decline starts is H8's: these cases stop at the link.
@available(iOS 26.0, *)
@MainActor
final class ShellBridgeTabsTests: XCTestCase {
    private var base: URL!
    private var suites: [String] = []
    private var scenes: [TabsScene] = []

    /// Every piece a page in tabs mode names (contract 3.2).
    nonisolated private static let all = ["coachHome", "coach", "tabs"]
    /// How much longer a bound on time is on CI (as ScreenHostTests).
    private static let slack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10

    /// The stand-in page. `FPScreens.call` records `{name, args}` in `window.__got` and keeps the page's view of the
    /// selection (`__tab`, `__seq`: a `tabs.select` with a newer seq switches it, contract 4.3); it answers as
    /// `window.__how[name]` says: `ok` (the default), `never`, `fail:<code>`, `refuse:<why>`, `late:<ms>`, or an array of
    /// those taken one per call (then `ok`); `window.__silent` leaves every call unanswered. An unanswered call's promise
    /// is kept in `window.__pending`: WebKit fails a call whose promise the page's garbage collector took ("Completion
    /// handler for function call is no longer reachable", a script error), where a page that does not answer must time
    /// out. `_trovoOpen` records its argument in `window.__opened`.
    static let page = """
        <!doctype html><meta charset="utf-8"><title>fp</title><script>
        window.__got = []; window.__opened = []; window.__how = {}; window.__silent = false; window.__pending = [];
        window.__never = function () { var p = new Promise(function () {}); window.__pending.push(p); return p; };
        window.__tab = 'log'; window.__seq = 0;
        window.FPScreens = { v: 1, call: function (name, args) {
          args = args || {};
          window.__got.push({ name: name, args: JSON.parse(JSON.stringify(args)) });
          if (name === 'tabs.select' && typeof args.seq === 'number' && args.seq > window.__seq) {
            window.__seq = args.seq; window.__tab = args.tab;
          }
          if (window.__silent) return window.__never();
          var plan = window.__how[name], how = 'ok';
          if (Array.isArray(plan)) { how = plan.length ? plan.shift() : 'ok'; } else if (typeof plan === 'string') { how = plan; }
          var reply = name === 'tabs.select' ? { ok: true, tab: window.__tab } : name === 'ping' ? { ok: true, v: 1 } : { ok: true };
          if (how === 'never') return window.__never();
          if (how.indexOf('fail:') === 0) return Promise.resolve({ ok: false, error: how.slice(5) });
          if (how.indexOf('refuse:') === 0) return Promise.resolve({ ok: false, error: how.slice(7) });
          if (how.indexOf('late:') === 0) {
            var ms = Number(how.slice(5));
            return new Promise(function (resolve) { setTimeout(function () { resolve(reply); }, ms); });
          }
          return Promise.resolve(reply);
        } };
        window._trovoOpen = function (url) { window.__opened.push(String(url)); return true; };
        </script>
        """

    override func setUp() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: 26, minorVersion: 0, patchVersion: 0)),
                          "the tab root exists only on iOS 26 and later (D39)")
        try await WebKitWarmUp.ensure()
        base = FileManager.default.temporaryDirectory.appendingPathComponent("fpshell-tabs-\(UUID().uuidString)", isDirectory: true)
        suites = []
        scenes = []
    }

    override func tearDown() async throws {
        for s in scenes { s.letGo() }
        scenes = []
        for suite in suites { UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite) }
        suites = []
        if let base { try? FileManager.default.removeItem(at: base) }
    }

    // MARK: Helpers

    /// A build 61 bridge with its own folder and defaults, on iOS 27, the app in use.
    private func makeBridge() -> ShellBridge {
        let suite = "fp.shell.tabs.tests.\(UUID().uuidString)"
        suites.append(suite)
        let b = ShellBridge(defaults: UserDefaults(suiteName: suite)!, folder: base.appendingPathComponent(UUID().uuidString, isDirectory: true),
                            shellBuild: "61")
        b.osMajor = { 27 }
        b.appActive = { true }
        return b
    }

    /// A scene as SceneDelegate builds it (H9), its page loaded and, unless `hello` is nil, linked with those screens.
    private func scene(first: String = "log", allowed: Bool = true, hello screens: [String]? = ShellBridgeTabsTests.all,
                       bridge: ShellBridge? = nil) async throws -> TabsScene {
        let s = TabsScene(bridge: bridge ?? makeBridge())
        scenes.append(s)
        s.installed = s.bridge.install(webView: s.webView, presenter: s.web, pageBuild: "P1",
                                       launch: ShellLaunch(tabRootAllowed: allowed, first: first,
                                                           barGuess: RootTabController.predicted(screen: s.window.bounds.size)))
        if s.installed.tabsRoot {
            s.bridge.section("tabs") {
                let root = RootTabController(web: s.web, webView: s.webView, first: first, look: TabsModel.defaults(for: .heavyweight))
                root.postScreenChanged = { [weak s, weak root] arg in s?.post(arg, root: root) }
                s.root = root
                s.bridge.adopt(root: root)
                s.window.rootViewController = root
                s.window.makeKeyAndVisible()
                root.view.layoutIfNeeded()
            }
        } else {
            s.window.rootViewController = s.web
            s.window.makeKeyAndVisible()
        }
        try await load(s)
        if let screens { try await hello(s, screens) }
        return s
    }

    /// Loads the stand-in page as a new document (the one before it, if any, is marked, so its FPScreens is not taken for
    /// the new one's).
    private func load(_ s: TabsScene) async throws {
        _ = try? await s.webView.evaluateJavaScript("window.__fpOld = true; 0")
        s.webView.loadHTMLString(Self.page, baseURL: URL(string: "https://fp.test/"))
        let deadline = Date().addingTimeInterval(10 * Self.slack)
        while Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
            let ready = "typeof window.FPScreens === 'object' && typeof window.__fpOld === 'undefined'"
            if !s.webView.isLoading, (try? await s.webView.evaluateJavaScript(ready)) as? Bool == true { return }
        }
        throw PageDidNotLoad()
    }

    @discardableResult
    private func hello(_ s: TabsScene, _ screens: [String] = ShellBridgeTabsTests.all, boot: String = "b1") async throws -> [String: Any] {
        try await message(s, "hello", ["v": 1, "page": "P1", "screens": screens, "boot": boot]).get()
    }

    private func message(_ s: TabsScene, _ method: String, _ options: [String: Any]) async -> Result<[String: Any], Error> {
        await withCheckedContinuation { c in
            s.bridge.pageMessage(method, options: options, webView: s.webView) { c.resume(returning: $0) }
        }
    }

    /// `sheets {open}`'s answered bar.
    private func sheets(_ s: TabsScene, open: Bool, file: StaticString = #filePath, line: UInt = #line) async throws -> [String: Int] {
        let answer = try await message(s, "sheets", ["open": open]).get()
        return try XCTUnwrap(answer["bar"] as? [String: Int], "sheets' answer carries the bar", file: file, line: line)
    }

    /// Keeps the page's main thread busy for `ms` from now: the script goes to the page before anything asked after this
    /// returns (a synchronous call, so it is sent at once).
    private func busy(_ s: TabsScene, ms: Int) {
        s.webView.evaluateJavaScript("(function () { var end = Date.now() + \(ms); while (Date.now() < end) {} })(); 0", completionHandler: nil)
    }

    /// The refusal's words, or nil when the message was answered.
    private func refusal(_ s: TabsScene, _ method: String, _ options: [String: Any]) async -> String? {
        if case .failure(let e) = await message(s, method, options) { return String(describing: e) }
        return nil
    }

    /// The code the page reads: the text before the first `:` (contract 3.1).
    private func code(_ refusal: String?) -> String? {
        refusal.flatMap { $0.split(separator: ":", maxSplits: 1).first.map(String.init) }
    }

    /// One `FPScreens.call` the page received.
    private struct Call {
        let name: String
        let args: [String: Any]
        var tab: String? { args["tab"] as? String }
        var seq: Int? { (args["seq"] as? NSNumber)?.intValue }
        var again: Bool? { args["again"] as? Bool }
        var on: Bool? { args["on"] as? Bool }
        var h: Int? { (args["h"] as? NSNumber)?.intValue }
        var safe: Int? { (args["safe"] as? NSNumber)?.intValue }
        var rev: Int? { (args["rev"] as? NSNumber)?.intValue }
    }

    private func got(_ s: TabsScene) async -> [Call] {
        guard let text = (try? await s.webView.evaluateJavaScript("JSON.stringify(window.__got || [])")) as? String,
              let list = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [[String: Any]] else { return [] }
        return list.map { Call(name: $0["name"] as? String ?? "", args: $0["args"] as? [String: Any] ?? [:]) }
    }

    private func calls(_ s: TabsScene, _ name: String) async -> [Call] { await got(s).filter { $0.name == name } }

    private func opened(_ s: TabsScene) async -> [String] {
        ((try? await s.webView.evaluateJavaScript("window.__opened")) as? [String]) ?? []
    }

    private func js(_ s: TabsScene, _ expression: String) async -> Any? {
        try? await s.webView.evaluateJavaScript(expression)
    }

    /// How the page answers `name` from now on: one word, or one per call.
    private func setHow(_ s: TabsScene, _ name: String, _ how: Any) async {
        let data = try! JSONSerialization.data(withJSONObject: [how])
        let json = String(decoding: data, as: UTF8.self).dropFirst().dropLast()
        _ = await js(s, "window.__how[\(Self.jsString(name))] = \(json); 0")
    }

    private static func jsString(_ s: String) -> String {
        String(decoding: try! JSONSerialization.data(withJSONObject: [s]), as: UTF8.self).dropFirst().dropLast().description
    }

    /// Polls every 20 ms until `ok` holds; false if it never did within `timeout` (times the CI factor).
    private func until(_ timeout: Double = 4, _ ok: () async -> Bool) async throws -> Bool {
        let end = Date().addingTimeInterval(timeout * Self.slack)
        while !(await ok()) {
            if Date() > end { return false }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        return true
    }

    private func sleep(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    /// The owner's tap as UIKit makes it: `shouldSelect` on the tab's slot, which answers false.
    private func tap(_ s: TabsScene, _ tab: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let root = s.root, let i = ShellTabs.ids.firstIndex(of: tab) else { return XCTFail("no tab root", file: file, line: line) }
        XCTAssertFalse(root.tabBarController(root, shouldSelect: root.slots[i]), "shouldSelect answers false", file: file, line: line)
    }

    /// The bar frame's cover of the web view's bottom edge, measured here (contract 7.1).
    private func cover(_ s: TabsScene) -> Int {
        guard let root = s.root else { return 0 }
        let f = root.tabBar.convert(root.tabBar.bounds, to: s.webView)
        return Int(max(0, s.webView.bounds.maxY - f.minY).rounded())
    }

    private func failures(_ s: TabsScene, _ piece: String) -> Int { s.binding?.link.book.screens[piece]?.failures ?? 0 }

    /// The coach fixture as this boot's model JSON.
    private func coachModelJSON(boot: String = "b1", rev: Int) throws -> String {
        let url = CoachFixtures.coachDir.appendingPathComponent("heavyweight-chat.json")
        var o = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        o["boot"] = boot
        o["rev"] = rev
        return String(decoding: try JSONSerialization.data(withJSONObject: o), as: UTF8.self)
    }

    /// A TabsModel as the page builds it (contract 6.1).
    private func tabsModelJSON(rev: Int, room: String, paper: Bool, tint: String, idle: String, titles: [String: String]) -> String {
        let items: [[String: Any]] = ShellTabs.ids.map { id in
            let t = titles[id] ?? id.capitalized
            return ["id": id, "title": t, "a11y": t + " tab"]
        }
        let o: [String: Any] = ["v": 1, "rev": rev, "boot": "b1", "room": room, "paper": paper, "tint": tint, "idle": idle, "items": items]
        return String(decoding: try! JSONSerialization.data(withJSONObject: o), as: UTF8.self)
    }

    /// A colour as the page writes it (`#rrggbb`).
    private func css(_ c: UIColor?) -> String? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard let c, c.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        func hex(_ v: CGFloat) -> String { String(format: "%02x", Int((max(0, min(1, v)) * 255).rounded())) }
        return "#" + hex(r) + hex(g) + hex(b)
    }

    /// Waits until `ok` holds; fails the case with `what` (read then) when it never did in time.
    @discardableResult
    private func expect(_ what: @autoclosure () -> String, within timeout: Double = 4, file: StaticString = #filePath, line: UInt = #line,
                        _ ok: () async -> Bool) async throws -> Bool {
        let done = try await until(timeout, ok)
        if !done { XCTFail("never: " + what(), file: file, line: line) }
        return done
    }

    // MARK: 0. The root decision

    /// `install(..., launch:)` decides the root before the page loads (contract 2.2): a tab root iff the scene allows one
    /// and `tabs` passes its own checks (the OS, the shell's switch, the policy), with the tab root's screens; else the
    /// classic root and 60's overlay chat. `adopt` binds only a tab-root decision, attaches the Coach tab's stack and
    /// gives `describe()` the root.
    func test00InstallDecidesTheRootAndAdoptTakesOnlyATabRootDecision() async throws {
        let launch = ShellLaunch(tabRootAllowed: true, first: "progress", barGuess: (83, 34))
        XCTAssertEqual(launch.flag, TabsFlag(selected: "progress", h: 83, safe: 34), "the flag's tabs for H9")
        /// A new bridge (set up by `setUp`) installed on a scene's web view, no window root, no page.
        func decide(_ l: ShellLaunch?, _ setUp: (ShellBridge) throws -> Void) throws -> (ShellInstall, TabsScene) {
            let b = makeBridge()
            try setUp(b)
            let s = TabsScene(bridge: b)
            scenes.append(s)
            return (b.install(webView: s.webView, presenter: s.web, pageBuild: "P1", launch: l), s)
        }
        XCTAssertEqual(try decide(launch) { _ in }.0, ShellInstall(screens: ["coach", "coachHome", "tabs"], tabsRoot: true))
        let classic = ShellInstall(screens: ["coach"], tabsRoot: false)
        XCTAssertEqual(try decide(ShellLaunch(tabRootAllowed: false, first: "log", barGuess: (83, 34))) { _ in }.0, classic, "not allowed")
        XCTAssertEqual(try decide(nil) { _ in }.0, classic, "no launch values")
        XCTAssertEqual(try decide(launch) { $0.osMajor = { 18 } }.0, classic, "iOS 18 (D39)")
        XCTAssertEqual(try decide(launch) { b in
            try FileManager.default.createDirectory(at: b.folder, withIntermediateDirectories: true)
            try Data(#"{"tabs":false}"#.utf8).write(to: b.folder.appendingPathComponent("switches.json"))
        }.0, classic, "the shell's switch")
        XCTAssertEqual(try decide(launch) { $0.environment.policy = { Policy(screens: ["tabs": .off]) } }.0, classic, "the policy")
        let old = makeBridge()
        let os = TabsScene(bridge: old)
        scenes.append(os)
        XCTAssertEqual(old.install(webView: os.webView, presenter: os.web, pageBuild: "P1"), ["coach"], "the three-argument install: classic")

        // a classic decision is never adopted (its flag has no tabs): the root made over its web view (no window) is not
        let (decided, c) = try decide(nil) { _ in }
        XCTAssertFalse(decided.tabsRoot)
        let unwanted = RootTabController(web: c.web, webView: c.webView, first: "log", look: TabsModel.defaults(for: .heavyweight))
        c.bridge.adopt(root: unwanted)
        XCTAssertEqual(c.binding?.link.tabsRoot, false)
        XCTAssertNil(c.binding?.tabRoot)
        XCTAssertEqual(c.binding?.screens.stackAttached, false)
        XCTAssertEqual((c.bridge.describe()["root"] as? [String: Any])?["kind"] as? String, "classic")
        let off = await refusal(c, "selectTab", ["tab": "progress"])
        XCTAssertEqual(off, "off: no live tab root")

        // a tab-root decision: adopted, the link on the tab root's rule, the chat's host the Coach tab's stack
        let s = try await scene(first: "settings", hello: nil)
        let root = try XCTUnwrap(s.root)
        XCTAssertEqual(s.installed, ShellInstall(screens: ["coach", "coachHome", "tabs"], tabsRoot: true))
        XCTAssertEqual(s.binding?.link.tabsRoot, true)
        XCTAssertEqual(s.binding?.screens.stackAttached, true)
        let d = try XCTUnwrap(s.bridge.describe()["root"] as? [String: Any])
        XCTAssertEqual(d["kind"] as? String, "tabs")
        XCTAssertEqual(d["selected"] as? String, "settings")
        XCTAssertEqual(root.selected, "settings")
        // a second root for the same web view is not adopted
        let second = RootTabController(web: UIViewController(), webView: s.webView, first: "log", look: TabsModel.defaults(for: .lime))
        s.bridge.adopt(root: second)
        XCTAssertTrue(s.binding?.tabRoot === root)
        // hello negotiates on the tab root's rule; the status's gate reads the live root
        let h = try await hello(s)
        XCTAssertEqual(h["screens"] as? [String], ["coach", "coachHome", "tabs"])
        let st = try await message(s, "status", [:]).get()
        let tabs = try XCTUnwrap((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(tabs["on"] as? Bool, true)
        XCTAssertEqual(tabs["live"] as? Bool, true)
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(of: s.webView), 0, "the web view never left its window")
    }

    // MARK: 1. selectTab

    /// Contract 3.3, I3: `selectTab` runs the funnel at once and answers `{tab, seq}`, from the document's start (before
    /// hello) on; the selected tab moves nothing and answers the current seq; nothing goes back to the page for it.
    func test01SelectTabRunsTheFunnelAnswersTabAndSeqAndSendsNothingBack() async throws {
        let s = try await scene(first: "log", hello: nil)
        let root = try XCTUnwrap(s.root)
        var a = try await message(s, "selectTab", ["tab": "progress"]).get()
        XCTAssertEqual(a["tab"] as? String, "progress")
        XCTAssertEqual(a["seq"] as? Int, 1)
        XCTAssertEqual(root.selected, "progress", "before hello")
        XCTAssertEqual(root.funnelRuns.last?.source, .page(intent: nil))
        a = try await message(s, "selectTab", ["tab": "coach", "intent": "chat"]).get()
        XCTAssertEqual(a["tab"] as? String, "coach")
        XCTAssertEqual(a["seq"] as? Int, 2)
        XCTAssertEqual(root.funnelRuns.last?.source, .page(intent: "chat"), "the intent reaches the funnel (the hold's hint)")
        try await hello(s)
        a = try await message(s, "selectTab", ["tab": "log"]).get()
        XCTAssertEqual(a["tab"] as? String, "log")
        XCTAssertEqual(a["seq"] as? Int, 3)
        let runs = root.funnelRuns.count
        a = try await message(s, "selectTab", ["tab": "log"]).get()
        XCTAssertEqual(a["tab"] as? String, "log", "the selected tab: nothing moves")
        XCTAssertEqual(a["seq"] as? Int, 3, "and the current seq")
        XCTAssertEqual(root.funnelRuns.count, runs)
        try await sleep(0.3)
        let selects = await calls(s, "tabs.select")
        XCTAssertEqual(selects.count, 0, "no tabs.select for a page selection (I3)")
        XCTAssertEqual(s.binding?.pageLink.records.filter { $0.name == "tabs.select" }.count, 0)
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(of: s.webView), 0)
    }

    // MARK: 2. Taps, re-taps, strays

    /// Contract 8.1 step 5, T-G12: a tap sends one `tabs.select {tab, seq}`; a re-tap the next seq with `again: true`; a
    /// stray one (counted for About); the page's own selection none.
    func test02ATapARetapAndAStraySendOneTabsSelectEachAndAPageSelectionNone() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        tap(s, "progress")
        try await expect("the tap's tabs.select") { await self.calls(s, "tabs.select").count == 1 }
        tap(s, "progress")
        try await expect("the re-tap's tabs.select") { await self.calls(s, "tabs.select").count == 2 }
        root.selectedIndex = ShellTabs.ids.firstIndex(of: "settings")!   // a stray: counted, redirected
        try await expect("the stray's tabs.select") { await self.calls(s, "tabs.select").count == 3 }
        let a = try await message(s, "selectTab", ["tab": "log"]).get()
        XCTAssertEqual(a["seq"] as? Int, 4)
        try await sleep(0.3)
        let sel = await calls(s, "tabs.select")
        XCTAssertEqual(sel.map(\.tab), ["progress", "progress", "settings"], "one per tap, re-tap and stray; none for the page's")
        XCTAssertEqual(sel.map(\.seq), [1, 2, 3])
        XCTAssertEqual(sel.map(\.again), [nil, true, nil], "again only on the re-tap")
        XCTAssertEqual(root.selected, "log")
        XCTAssertEqual(root.strays, 1)
        XCTAssertEqual(s.bridge.launchCounts.strays, 1, "the stray counted for About")
        XCTAssertEqual(s.bridge.counters.strays.total, 1)
        let st = try await message(s, "status", [:]).get()
        let strays = (st["counters"] as? [String: Any])?["strays"] as? [String: Any]
        XCTAssertEqual(strays?["launch"] as? Int, 1)
        XCTAssertEqual(strays?["total"] as? Int, 1)
        XCTAssertEqual(s.binding?.pageLink.records.filter { $0.name == "tabs.select" }.map(\.outcome), ["done", "done", "done"], "each sent once")
    }

    // MARK: 3. Refusals

    /// Contract 3.1, 3.6: every refusal new in 61 reads `<code>: <words>`: `off` with no live tab root, `bad-tab`,
    /// `not-presentable` for the bar and (without a live root, and in the interim before H10 with one) the Coach tab,
    /// `not-native` for the chat off a NATIVE Coach tab (WAITING or WEB); build 60's words for a piece not live; `dismiss
    /// tabs` answered.
    func test03RefusalsCarryTheirCode() async throws {
        // a classic root
        let c = try await scene(allowed: false, hello: ["coach"])
        XCTAssertNil(c.root)
        var why = await refusal(c, "selectTab", ["tab": "progress"])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal(c, "sheets", ["open": true])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal(c, "present", ["screen": "tabs"])
        XCTAssertEqual(why, "not-presentable: tabs is never presented")
        why = await refusal(c, "present", ["screen": "coachHome"])
        XCTAssertEqual(why, "not-presentable: coachHome needs a live tab root")
        _ = try await message(c, "dismiss", ["screen": "tabs"]).get()
        XCTAssertEqual(c.binding?.link.liveScreens, ["coach"], "dismiss tabs changes nothing under a classic root")

        // a live tab root
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        why = await refusal(s, "selectTab", ["tab": "home"])
        XCTAssertEqual(why, "bad-tab: home is not one of log, progress, coach, settings")
        XCTAssertEqual(root.selected, "log")
        why = await refusal(s, "present", ["screen": "tabs"])
        XCTAssertEqual(why, "not-presentable: tabs is never presented")
        why = await refusal(s, "present", ["screen": "coachHome"])
        XCTAssertEqual(code(why), "not-presentable", "the interim before H10 (contract 15.2): \(why ?? "answered")")
        _ = try await message(s, "model", ["screen": "coach", "rev": 1, "json": try coachModelJSON(rev: 1)]).get()
        XCTAssertEqual(root.coachMode, .waiting)
        why = await refusal(s, "present", ["screen": "coach"])
        XCTAssertEqual(why, "not-native: the Coach tab is not native", "WAITING")
        root.setCoachMode(.web)
        why = await refusal(s, "present", ["screen": "coach"])
        XCTAssertEqual(why, "not-native: the Coach tab is not native", "WEB")
        _ = try await message(s, "dismiss", ["screen": "tabs"]).get()
        XCTAssertEqual(s.binding?.screens.shown, [], "nothing presented")

        // build 60's words for a piece not live: a new document whose hello names the bar alone
        try await load(s)
        let h = try await hello(s, ["tabs"], boot: "b2")
        XCTAssertEqual(h["screens"] as? [String], ["tabs"])
        why = await refusal(s, "present", ["screen": "coach"])
        XCTAssertEqual(why, "the coach screen is not on for this document", "build 60's words, no code")

        // after the root's own fallback (its UI half; H8 runs it): off
        root.fallBack(why: .switch, at: Date())
        why = await refusal(s, "selectTab", ["tab": "progress"])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal(s, "sheets", ["open": false])
        XCTAssertEqual(why, "off: no live tab root")
    }

    /// The link's fallback (a hello that leaves `tabs` out: the page's decline, contract 3.2) ends the live root too:
    /// `selectTab` and `sheets` are refused `off` from then on.
    func test03bAfterTheLinksFallbackSelectTabAndSheetsAreRefusedOff() async throws {
        let s = try await scene(first: "log", hello: nil)
        _ = try await message(s, "selectTab", ["tab": "progress"]).get()   // live before the hello
        try await hello(s, ["coach"])
        XCTAssertEqual(s.binding?.link.fellBackWhy, .page)
        var why = await refusal(s, "selectTab", ["tab": "log"])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal(s, "sheets", ["open": true])
        XCTAssertEqual(why, "off: no live tab root")
        XCTAssertEqual(s.root?.selected, "progress")
    }

    // MARK: 4. Sheets

    /// Contract 3.4: on a web tab `sheets {open:true}` hides the bar at once and answers `h: 0`; closed answers the shown
    /// bar (the frame's cover, delta 14.1); a NATIVE Coach tab keeps its bar; back on a web tab with the state open the
    /// bar hides and the page hears `tabs.bar`; a document start resets the state (the bar shows again).
    func test04SheetsHideTheBarOnAWebTabKeepItOnANativeCoachTabAndEndWithTheDocument() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        let safe = Int(s.window.safeAreaInsets.bottom.rounded())
        var bar = try await sheets(s, open: true)
        XCTAssertTrue(root.isTabBarHidden, "hidden at once")
        XCTAssertEqual(bar["h"], 0)
        XCTAssertEqual(bar["safe"], safe)
        let hiddenRev = try XCTUnwrap(bar["rev"])
        bar = try await sheets(s, open: false)
        XCTAssertFalse(root.isTabBarHidden)
        XCTAssertGreaterThan(bar["h"] ?? 0, 0)
        XCTAssertEqual(bar["h"], cover(s), "h is the bar frame's cover")
        XCTAssertEqual(bar["safe"], safe)
        XCTAssertGreaterThan(bar["rev"] ?? 0, hiddenRev, "rev rises")
        // a NATIVE Coach tab keeps its bar, and the answer says so
        root.setHome(s.home)
        _ = try await message(s, "selectTab", ["tab": "coach"]).get()
        bar = try await sheets(s, open: true)
        XCTAssertFalse(root.isTabBarHidden)
        XCTAssertTrue(root.sheetsOpen)
        XCTAssertGreaterThan(bar["h"] ?? 0, 0)
        XCTAssertEqual(bar["h"], cover(s))
        // back to a web tab with the state open: hidden, and told as the shell's own change
        tap(s, "log")
        XCTAssertTrue(root.isTabBarHidden)
        try await expect("tabs.bar for the hide") { await self.calls(s, "tabs.bar").count == 1 }
        let told = await calls(s, "tabs.bar")
        XCTAssertEqual(told.first?.h, 0)
        XCTAssertEqual(told.first?.safe, safe)
        XCTAssertEqual(told.first?.rev, root.barRev)
        // a document start: the new document's state is closed
        try await load(s)
        try await expect("the bar shown again at the document start") { !root.isTabBarHidden && !root.sheetsOpen }
    }

    // MARK: 5. State, not replay

    /// Contract 4.3, D12: a `tabs.select` the page lets time out is never resent; once the link is idle (after the held
    /// timeout's ping, 4.4) one `tabs.select` with the current tab and a newer seq goes. A failed `tabs.bar` the same, with
    /// a new rev. Nothing counts: a busy page is not a broken one.
    func test05AFailedTabsSelectOrTabsBarIsRestatedOnceTheLinkIsIdleNeverResent() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        b.pageLink.timeoutScale = 0.1   // 2 s -> 0.2 s
        await setHow(s, "tabs.select", ["never"])
        tap(s, "progress")
        try await expect("the restate, answered") { await self.calls(s, "tabs.select").count == 2 && b.pageLink.pending == 0 }
        let names = await got(s).map(\.name).filter { $0 == "tabs.select" || $0 == "ping" }
        XCTAssertEqual(names, ["tabs.select", "ping", "tabs.select"], "the failed one, its ping, the restate")
        let sel = await calls(s, "tabs.select")
        XCTAssertEqual(sel.map(\.tab), ["progress", "progress"])
        XCTAssertEqual(sel.map(\.seq), [1, 2], "the restate takes a new seq; seq 1 never goes again")
        XCTAssertEqual(sel.map(\.again), [nil, nil])
        XCTAssertEqual(root.seq, 2)
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "tabs.select" }.map(\.outcome), ["failed timeout", "done"])
        XCTAssertEqual(failures(s, "tabs"), 0, "held, then dropped by the ping's answer")
        XCTAssertEqual(b.link.heldTimeouts, 0)

        // a failed tabs.select with a newer one queued behind it: nothing goes before the link is idle, and the newer
        // one's answer leaves nothing to restate (the page has the newest selection)
        await setHow(s, "tabs.select", ["never", "ok"])
        tap(s, "settings")
        tap(s, "log")
        try await expect("both taps' tabs.select and the second ping ended") {
            b.pageLink.pending == 0 && b.pageLink.records.filter { $0.name == "ping" }.count == 2
        }
        try await sleep(0.3)
        let queued = await calls(s, "tabs.select")
        XCTAssertEqual(queued.map(\.tab), ["progress", "progress", "settings", "log"], "no restate after the newer answer")
        XCTAssertEqual(queued.map(\.seq), [1, 2, 3, 4])
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "tabs.select" }.map(\.outcome), ["failed timeout", "done", "failed timeout", "done"])
        XCTAssertEqual(root.seq, 4)
        XCTAssertEqual(failures(s, "tabs"), 0)

        // the bar: on a NATIVE Coach tab with a sheet open, then back to Log, the root hides it and says so
        root.setHome(s.home)
        _ = try await message(s, "selectTab", ["tab": "coach"]).get()
        _ = try await message(s, "sheets", ["open": true]).get()
        await setHow(s, "tabs.bar", ["never"])
        tap(s, "log")
        try await expect("the bar's restate, answered") { await self.calls(s, "tabs.bar").count == 2 && b.pageLink.pending == 0 }
        let bars = await calls(s, "tabs.bar")
        XCTAssertEqual(bars.map(\.h), [0, 0])
        XCTAssertEqual(bars.map(\.safe), [bars[0].safe, bars[0].safe])
        XCTAssertEqual(bars[1].rev, (bars[0].rev ?? 0) + 1, "the restate takes a new rev")
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "tabs.bar" }.map(\.outcome), ["failed timeout", "done"])
        let selects = await calls(s, "tabs.select")
        XCTAssertEqual(selects.count, 5, "the tap's own tabs.select went once and was answered: no restate for it")
        XCTAssertEqual(failures(s, "tabs"), 0)
        XCTAssertTrue(b.link.isLive("tabs"))
    }

    // MARK: 6. TabsModel

    /// Contract 3.7, 6.1, 15.2: a TabsModel repaints the bar (tint, idle, titles, labels, style) inside `model tabs@`;
    /// a stale rev is dropped; `coachHome` models are dropped unread and uncounted until H10, whatever their number; three
    /// that do not decode trip `tabs` for the page build (the fallback that follows is H8's).
    func test06ATabsModelRepaintsTheBarAndUndecodableOnesTripTheBar() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        let titles = ["log": "Journal", "progress": "Stats", "coach": "Trainer", "settings": "Setup"]
        let model = tabsModelJSON(rev: 2, room: "heavyweight", paper: true, tint: "#ff3b30", idle: "#34c759", titles: titles)
        _ = try await message(s, "model", ["screen": "tabs", "rev": 2, "json": model]).get()
        XCTAssertEqual(css(root.tabBar.tintColor), "#ff3b30")
        XCTAssertEqual(css(root.tabBar.unselectedItemTintColor), "#34c759")
        XCTAssertEqual(root.tabBar.items?.map(\.title), ShellTabs.ids.map { titles[$0] })
        XCTAssertEqual(root.tabBar.items?.map(\.accessibilityLabel), ShellTabs.ids.map { Optional(titles[$0]! + " tab") })
        XCTAssertEqual(root.tabBar.overrideUserInterfaceStyle, .light)
        XCTAssertEqual(root.look.rev, 2)
        let folder = s.bridge.folder
        XCTAssertEqual(String(decoding: try Data(contentsOf: folder.appendingPathComponent("model.tabs.marker")), as: UTF8.self),
                       "model tabs@P1 shell 61\n0", "decoded and applied inside its marker, which ended")
        // a stale rev is dropped; Lime's model darkens the bar and the Coach stack
        let lime2 = tabsModelJSON(rev: 2, room: "dark", paper: false, tint: "#f4f4f1", idle: "#8c8c91", titles: [:])
        _ = try await message(s, "model", ["screen": "tabs", "rev": 2, "json": lime2]).get()
        XCTAssertEqual(css(root.tabBar.tintColor), "#ff3b30", "stale: dropped")
        let lime3 = tabsModelJSON(rev: 3, room: "dark", paper: false, tint: "#f4f4f1", idle: "#8c8c91", titles: [:])
        _ = try await message(s, "model", ["screen": "tabs", "rev": 3, "json": lime3]).get()
        XCTAssertEqual(css(root.tabBar.tintColor), "#f4f4f1")
        XCTAssertEqual(root.tabBar.overrideUserInterfaceStyle, .dark)
        XCTAssertEqual(root.coachSlot.nav.overrideUserInterfaceStyle, .dark)
        XCTAssertEqual(root.tabBar.items?.map(\.title), ["Log", "Progress", "Coach", "Settings"])
        // coachHome models: dropped unread and uncounted
        for rev in 10..<16 {
            _ = try await message(s, "model", ["screen": "coachHome", "rev": rev, "json": "not a model"]).get()
        }
        XCTAssertNil(b.link.book.screens["coachHome"], "nothing counted")
        XCTAssertTrue(b.link.isLive("coachHome"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.appendingPathComponent("model.coachHome.marker").path), "unread")
        XCTAssertEqual(b.link.book.screens["tabs"]?.modelFailures ?? 0, 0)
        // three that do not decode: the bar trips for the page build
        for rev in 20..<23 {
            _ = try await message(s, "model", ["screen": "tabs", "rev": rev, "json": #"{"v":2}"#]).get()
            if rev < 22 { XCTAssertTrue(b.link.isLive("tabs"), "not yet at rev \(rev)") }
        }
        let trip = try XCTUnwrap(b.link.book.trip(screen: "tabs", pageBuild: "P1"))
        XCTAssertEqual(trip.reason, .failures)
        XCTAssertFalse(b.link.isLive("tabs"))
        XCTAssertEqual(b.link.fellBackWhy, .failures, "the link fell back (the root's half is H8's)")
        XCTAssertEqual(css(root.tabBar.tintColor), "#f4f4f1", "nothing undecodable applied")
    }

    // MARK: 7. Deep links

    /// Contract 9, D24, H-G7: under a live tab root `trovo://start` selects Log, `trovo://share` selects Coach (held on a
    /// NATIVE tab), then `_trovoOpen` gets the URL as its argument; any other `trovo://` URL goes to `_trovoOpen` alone;
    /// a URL that would break out of a string literal reaches the page whole; a classic root only runs `_trovoOpen`.
    func test07DeepLinksSelectFirstThenTrovoOpenGetsTheURLAsItsArgument() async throws {
        let s = try await scene(first: "settings")
        let root = try XCTUnwrap(s.root)
        s.bridge.deepLink(URL(string: "trovo://start")!)
        XCTAssertEqual(root.selected, "log", "selected in the call, before _trovoOpen")
        XCTAssertEqual(root.funnelRuns.filter { $0.source == .deepLink(share: false) }.count, 1)
        try await expect("_trovoOpen(trovo://start)") { await self.opened(s) == ["trovo://start"] }
        try await expect("its tabs.select") { await self.calls(s, "tabs.select").count == 1 }
        let first = await calls(s, "tabs.select")
        XCTAssertEqual(first.first?.tab, "log")
        // share: Coach, the NATIVE tab held for the chat's push
        root.setHome(s.home)
        s.bridge.deepLink(URL(string: "trovo://share")!)
        XCTAssertEqual(root.selected, "coach")
        XCTAssertTrue(root.held, "held (contract 8.1)")
        XCTAssertEqual(root.funnelRuns.last?.source, .deepLink(share: true))
        try await expect("_trovoOpen(trovo://share)") { await self.opened(s).last == "trovo://share" }
        // another trovo URL: no selection
        let seq = root.seq
        s.bridge.deepLink(URL(string: "trovo://elsewhere")!)
        XCTAssertEqual(root.seq, seq)
        try await expect("_trovoOpen(trovo://elsewhere)") { await self.opened(s).last == "trovo://elsewhere" }
        // the URL is an argument, never part of the script's source
        let odd = try XCTUnwrap(URL(string: "trovo://share?x=');window.__pwned=1;('"))
        s.bridge.deepLink(odd)
        try await expect("the page got the URL whole") { await self.opened(s).last == odd.absoluteString }
        let pwned = await js(s, "typeof window.__pwned") as? String
        XCTAssertEqual(pwned, "undefined")
        XCTAssertFalse(ShellBridge.trovoOpenSource.contains("trovo:"))
        let all = await opened(s)
        XCTAssertEqual(all.count, 4, "\(all)")
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(of: s.webView), 0)
        // a classic root: _trovoOpen alone
        let c = try await scene(allowed: false, hello: ["coach"])
        c.bridge.deepLink(URL(string: "trovo://start")!)
        try await expect("_trovoOpen under a classic root") { await self.opened(c) == ["trovo://start"] }
        try await sleep(0.2)
        let none = await calls(c, "tabs.select")
        XCTAssertEqual(none.count, 0)
    }

    // MARK: 8. Covered

    /// Contract 8.1 steps 2 and 4, 8.4: entering a WAITING (or NATIVE) Coach tab sends `shell.covered {on:true}` before
    /// its `tabs.select`, leaving it `{on:false}`; the chat's push and pop send nothing (ScreenHost is silent in the stack).
    func test08CoveredFollowsTheCoachTabAndAChatPopSendsNothing() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        tap(s, "coach")
        try await expect("the tap's tabs.select") { await self.calls(s, "tabs.select").count == 1 }
        let order = await got(s).map(\.name).filter { $0 == "shell.covered" || $0 == "tabs.select" }
        XCTAssertEqual(order, ["shell.covered", "tabs.select"], "covered first (step 2)")
        var covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.map(\.on), [true])
        tap(s, "log")
        try await expect("the second tap's tabs.select") { await self.calls(s, "tabs.select").count == 2 }
        covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.map(\.on), [true, false])
        // NATIVE: entered by the page, the chat pushed and popped
        root.setHome(s.home)
        _ = try await message(s, "model", ["screen": "coach", "rev": 1, "json": try coachModelJSON(rev: 1)]).get()
        _ = try await message(s, "selectTab", ["tab": "coach"]).get()
        try await expect("covered on entering the NATIVE tab") { await self.calls(s, "shell.covered").count == 3 }
        _ = try await message(s, "present", ["screen": "coach"]).get()
        try await expect("the chat pushed") { root.coachSlot.nav.viewControllers.count == 2 }
        try await expect("the push done") { s.binding?.screens.describe()["busy"] as? Bool == false }
        _ = try await message(s, "dismiss", ["screen": "coach"]).get()
        try await expect("the chat popped") { root.coachSlot.nav.viewControllers.count == 1 }
        try await sleep(0.4)
        covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.map(\.on), [true, false, true], "the push and the pop sent nothing")
        let selects = await calls(s, "tabs.select")
        XCTAssertEqual(selects.count, 2, "none for the page's selection")
    }

    // MARK: 9. Attribution

    /// Contract 4.4, D13: a failing `tabs.select` counts for `tabs` alone; a failing `shell.covered` for every live
    /// piece, the bar included.
    func test09ATabsSelectCountsForTheBarAloneAndShellCoveredForEveryLivePiece() async throws {
        let s = try await scene(first: "log")
        let b = try XCTUnwrap(s.binding)
        func counts() -> [Int] { [failures(s, "coach"), failures(s, "coachHome"), failures(s, "tabs")] }
        // covered fails on the way into the WAITING Coach tab (its tabs.select answers late)
        await setHow(s, "shell.covered", "fail:bad-args")
        await setHow(s, "tabs.select", ["late:1500"])
        tap(s, "coach")
        try await expect("covered's failure counted, now \(counts())") { self.failures(s, "coach") == 1 }
        XCTAssertEqual(counts(), [1, 1, 1], "one failure for each live piece, while the tabs.select is still out")
        try await expect("the late tabs.select answered") { b.pageLink.pending == 0 }
        XCTAssertEqual(counts(), [1, 1, 0], "the tabs.select's answer is the bar's success alone")
        // a tabs.select that fails (an error: no ping, its restate at once, answered late here)
        await setHow(s, "shell.covered", "ok")
        await setHow(s, "tabs.select", ["ok", "fail:bad-args", "late:1500"])
        tap(s, "log")   // covered off (answered: every live piece clean again), its tabs.select answered
        try await expect("covered off and the tabs.select answered, now \(counts())") { b.pageLink.pending == 0 && self.failures(s, "coach") == 0 }
        tap(s, "progress")
        try await expect("the tabs.select's failure counted, now \(counts())") { self.failures(s, "tabs") == 1 }
        XCTAssertEqual(counts(), [0, 0, 1], "the bar alone")
        try await expect("the restate answered") { b.pageLink.pending == 0 }
        let sel = await calls(s, "tabs.select")
        XCTAssertEqual(sel.suffix(2).map(\.tab), ["progress", "progress"], "the failed one, then the restate")
        XCTAssertEqual(failures(s, "tabs"), 0, "the restate's answer")
    }

    // MARK: 10. Visibility

    /// I4's shell side (contract 3.8): in tabs mode the page sends every change; a hidden page on a web tab while the app
    /// is active is counted.
    func test10AHiddenPageOnAWebTabWhileTheAppIsActiveIsCounted() async throws {
        let s = try await scene(first: "progress")
        s.bridge.appActive = { true }
        s.bridge.activeSince = Date().addingTimeInterval(-5)
        XCTAssertEqual(s.root?.selected, "progress")
        let r = try await message(s, "visibility", ["state": "hidden", "at": Date().timeIntervalSince1970 * 1000]).get()
        XCTAssertEqual(r["counted"] as? Bool, true)
        XCTAssertEqual(s.bridge.launchCounts.hidden, 1)
    }

    // MARK: 11. Teardown

    /// H7's weak references (maps/lessons.md:29): after the adoption, a few funnel runs, a pushed chat, `detachStack()` and
    /// `sceneDisconnected(webView:)`, nothing the bridge keeps (the binding, ScreenHost, the stack state, the root's hooks)
    /// holds the root, its slots, the web controller or the web view: they go once the window lets them go, while the
    /// bridge itself lives on (the app's is a singleton).
    func test11ATeardownFreesTheRootItsSlotsTheWebControllerAndTheWebView() async throws {
        let bridge = makeBridge()
        let refs = try await sceneTornDown(bridge)
        let freed = try await until(6) { refs.allSatisfy { $0.1.object == nil } }
        XCTAssertTrue(freed, "still alive: \(refs.filter { $0.1.object != nil }.map(\.0))")
        XCTAssertNil(bridge.binding)
    }

    /// Test 11's scene, driven and torn down; nothing of it outlives this call but weak references.
    private func sceneTornDown(_ bridge: ShellBridge) async throws -> [(String, Weak)] {
        let s = try await scene(first: "log", bridge: bridge)
        let root = try XCTUnwrap(s.root)
        let refs: [(String, Weak)] = [("root", Weak(root)), ("nav", Weak(root.coachSlot.nav))]
            + root.slots.enumerated().map { ("slot \($0.offset)", Weak($0.element)) }
            + [("web controller", Weak(s.web)), ("web view", Weak(s.webView)), ("home", Weak(s.home))]
        tap(s, "progress")
        _ = try await message(s, "selectTab", ["tab": "settings"]).get()
        root.selectedIndex = 0   // a stray
        root.setHome(s.home)
        _ = try await message(s, "model", ["screen": "coach", "rev": 1, "json": try coachModelJSON(rev: 1)]).get()
        _ = try await message(s, "selectTab", ["tab": "coach"]).get()
        _ = try await message(s, "present", ["screen": "coach"]).get()
        try await expect("the chat pushed") { root.coachSlot.nav.viewControllers.count == 2 }
        try await expect("the link idle") { bridge.binding?.pageLink.pending == 0 && bridge.binding?.screens.describe()["busy"] as? Bool == false }
        try XCTUnwrap(bridge.binding).screens.detachStack()
        XCTAssertEqual(root.coachSlot.nav.viewControllers.count, 1, "the chat popped with the stack")
        bridge.sceneDisconnected(webView: s.webView)
        XCTAssertNil(bridge.binding)
        autoreleasepool {
            s.webView.live = false
            s.window.isHidden = true
            s.window.rootViewController = nil
            scenes.removeAll { $0 === s }
        }
        return refs
    }

    /// The same holds while the binding lives on: a window that lets the root go before any `sceneDisconnected` (nothing
    /// tore the stack down or reset the root's hooks) frees the root, its slots, the web controller and the web view,
    /// so no strong capture in the stack state or the root's hooks (a cycle with the root) can hide behind the teardown.
    func test11bWithTheBindingAliveNothingTheBridgeKeepsHoldsTheRoot() async throws {
        let bridge = makeBridge()
        let refs = try await sceneLetGoWithoutTeardown(bridge)
        let freed = try await until(6) { refs.allSatisfy { $0.1.object == nil } }
        XCTAssertTrue(freed, "still alive: \(refs.filter { $0.1.object != nil }.map(\.0))")
        XCTAssertNotNil(bridge.binding, "the binding outlived them")
        XCTAssertEqual(bridge.binding?.screens.stackAttached, true, "the stack was never detached")
        bridge.sceneDisconnected(webView: nil)
        XCTAssertNil(bridge.binding)
    }

    /// Test 11b's scene: driven (the chat pushed), then let go by the window alone.
    private func sceneLetGoWithoutTeardown(_ bridge: ShellBridge) async throws -> [(String, Weak)] {
        let s = try await scene(first: "log", bridge: bridge)
        let root = try XCTUnwrap(s.root)
        let refs: [(String, Weak)] = [("root", Weak(root)), ("nav", Weak(root.coachSlot.nav))]
            + root.slots.enumerated().map { ("slot \($0.offset)", Weak($0.element)) }
            + [("web controller", Weak(s.web)), ("web view", Weak(s.webView))]
        tap(s, "progress")
        root.setHome(s.home)
        _ = try await message(s, "model", ["screen": "coach", "rev": 1, "json": try coachModelJSON(rev: 1)]).get()
        _ = try await message(s, "selectTab", ["tab": "coach"]).get()
        _ = try await message(s, "present", ["screen": "coach"]).get()
        try await expect("the chat pushed") { root.coachSlot.nav.viewControllers.count == 2 }
        try await expect("the link idle") { bridge.binding?.pageLink.pending == 0 && bridge.binding?.screens.describe()["busy"] as? Bool == false }
        autoreleasepool {
            s.webView.live = false
            s.window.isHidden = true
            s.window.rootViewController = nil
            scenes.removeAll { $0 === s }
        }
        return refs
    }

    // MARK: 12. VoiceOver

    /// Contract 8.1 step 7, I17, G22: a tap to a web tab posts `.screenChanged` with the web view only once the page has
    /// answered its `tabs.select`, or once it has failed when it never does; a page selection posts once, at its run's
    /// end; entering a NATIVE Coach tab posts at once, with the stack's top.
    func test12VoiceOverHearsAWebTabOnceThePageHasDrawnIt() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        b.pageLink.timeoutScale = 0.5   // 2 s -> 1 s: every "not yet" below has most of a second to spare
        await setHow(s, "tabs.select", ["late:1000", "never"])
        tap(s, "progress")
        XCTAssertEqual(s.posts, [], "nothing in the funnel's turn")
        try await sleep(0.15)
        XCTAssertEqual(s.posts, [], "nothing before the page answers")
        try await expect("the web view once answered: \(s.posts)") { s.posts == ["web"] }
        tap(s, "log")
        try await sleep(0.15)
        XCTAssertEqual(s.posts, ["web"], "nothing while it is out")
        try await expect("the web view once it timed out: \(s.posts)") { s.posts == ["web", "web"] }
        try await expect("the restate went and was answered") { await self.calls(s, "tabs.select").count == 3 && b.pageLink.pending == 0 }
        XCTAssertEqual(s.posts.count, 2, "the restate is no move: nothing heard")
        _ = try await message(s, "selectTab", ["tab": "settings"]).get()
        XCTAssertEqual(s.posts, ["web", "web", "web"], "a page selection: at its run's end")
        try await sleep(0.3)
        XCTAssertEqual(s.posts.count, 3, "once")
        root.setHome(s.home)
        tap(s, "coach")
        XCTAssertEqual(s.posts.last, "top", "a NATIVE Coach tab at once, with the stack's top")
        XCTAssertEqual(s.posts.count, 4)
    }

    // MARK: 13. Busy, not broken

    /// G17 as contract 4.4 (D41) settled it, I15: a page busy for 5.25 s while three taps queue (timeouts scaled to
    /// 1.5 s): the three `tabs.select` time out and are held, the ping sent after them is answered once the page is free,
    /// nothing counts, nothing trips, and the restate leaves page and shell on the last tapped tab; the same page dead to
    /// every call trips `tabs` (`failures`) once the ping fails (the fallback that follows is H8's).
    func test13ABusyPageNeverTripsTheBarAndADeadOneDoes() async throws {
        let s = try await scene(first: "settings")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        b.pageLink.timeoutScale = 0.75   // 2 s -> 1.5 s: the timeouts at 1.5, 3 and 4.5 s, the ping's at 6 s
        busy(s, ms: 5250)
        tap(s, "progress")
        tap(s, "log")
        tap(s, "progress")
        try await expect("the three taps and the restate: \(b.pageLink.records.map { "\($0.name) \($0.outcome ?? "-")" })", within: 14) {
            b.pageLink.pending == 0 && b.pageLink.records.filter { $0.name == "tabs.select" }.count == 4
        }
        try await expect("the page got the restate") { await self.calls(s, "tabs.select").count == 4 }
        let sel = await calls(s, "tabs.select")
        XCTAssertEqual(sel.map(\.seq), [1, 2, 3, 4], "each once, then the restate")
        XCTAssertEqual(sel.map(\.tab), ["progress", "log", "progress", "progress"])
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "tabs.select" }.map(\.outcome),
                       ["failed timeout", "failed timeout", "failed timeout", "done"])
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "ping" }.map(\.outcome), ["done"], "one ping, answered")
        XCTAssertEqual(root.selected, "progress")
        let pageTab = await js(s, "window.__tab") as? String
        let pageSeq = await js(s, "window.__seq") as? Int
        XCTAssertEqual(pageTab, "progress", "page and shell on the last tapped tab")
        XCTAssertEqual(pageSeq, 4)
        XCTAssertEqual(failures(s, "tabs"), 0, "busy is not broken")
        XCTAssertNil(b.link.book.trip(screen: "tabs", pageBuild: "P1"))
        XCTAssertTrue(b.link.isLive("tabs"))
        XCTAssertNil(b.link.fellBackWhy)
        // the same page, dead to every call: three held timeouts, the ping's failure counts them, the bar trips
        b.pageLink.timeoutScale = 0.5
        _ = await js(s, "window.__silent = true; 0")
        tap(s, "log")
        tap(s, "settings")
        tap(s, "progress")
        try await expect("the bar tripped", within: 16) { b.link.book.trip(screen: "tabs", pageBuild: "P1") != nil }
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "tabs.select" }.suffix(3).map(\.outcome),
                       ["failed timeout", "failed timeout", "failed timeout"], "held until the ping")
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "ping" }.map(\.outcome), ["done", "failed timeout"], "the second ping failed")
        XCTAssertEqual(b.link.book.trip(screen: "tabs", pageBuild: "P1")?.reason, .failures)
        XCTAssertEqual(b.link.fellBackWhy, .failures)
        XCTAssertFalse(b.link.isLive("tabs"))
    }
}

/// The stand-in page never came up: the case fails there, saying so.
private struct PageDidNotLoad: Error, CustomStringConvertible {
    var description: String { "the stand-in page did not load" }
}
#endif
