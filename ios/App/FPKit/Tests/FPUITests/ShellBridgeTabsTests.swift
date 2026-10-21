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
/// one (held timeouts, contract 4.4). From test 14 on, 11-shell.md H8 (contract 1.4, 2.3, 3.2, 3.5, 3.6, 3.10, 4.2, 10.1,
/// 10.3, 10.5, D17, D21, D32, I13, I14): hello with `tabs` and the declines, the fallback and each of its triggers, the
/// Coach tab's modes per scene, the shell's switch, the status, the composer's words handed over, `status {refresh}`.
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
    /// out. `throw` throws (a script error); `window.__took` makes `screens.off` with a `draft` answer `took: true`, as
    /// the page does once it holds the words durably. `_trovoOpen` records its argument in `window.__opened`.
    static let page = """
        <!doctype html><meta charset="utf-8"><title>fp</title><script>
        window.__got = []; window.__opened = []; window.__how = {}; window.__silent = false; window.__pending = []; window.__took = false;
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
          var reply = name === 'tabs.select' ? { ok: true, tab: window.__tab } : name === 'ping' ? { ok: true, v: 1 }
            : name === 'screens.off' && args.draft != null && window.__took ? { ok: true, took: true } : { ok: true };
          if (how === 'never') return window.__never();
          if (how === 'throw') throw new Error('thrown by the stand-in page');
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

    /// Where a bridge keeps its book, switches, counters and the composer's words: a new bridge on the same home is the
    /// next launch.
    private struct Home {
        let folder: URL
        let defaults: UserDefaults
    }

    private func makeHome() -> Home {
        let suite = "fp.shell.tabs.tests.\(UUID().uuidString)"
        suites.append(suite)
        return Home(folder: base.appendingPathComponent(UUID().uuidString, isDirectory: true), defaults: UserDefaults(suiteName: suite)!)
    }

    /// A build 61 bridge (a new home unless one is given), on iOS 27, the app in use. `net`: the WAITING Coach tab's net;
    /// a minute unless a case is about it (`ShellBridge.coachNetSeconds`, 3 s), since the stand-in page never declares
    /// `coachHome` and the cases before H8's would otherwise see the tab turn WEB under them.
    private func makeBridge(home: Home? = nil, linkConfig: LinkState.Config = LinkState.Config(), net: TimeInterval = 60) -> ShellBridge {
        let h = home ?? makeHome()
        let b = ShellBridge(defaults: h.defaults, folder: h.folder, shellBuild: "61", linkConfig: linkConfig)
        b.osMajor = { 27 }
        b.appActive = { true }
        b.coachNetSeconds = net
        return b
    }

    /// The root decision a scene connect makes for `page` (H9's install, no page loaded): whether it builds a tab root.
    private func decidesTabRoot(_ bridge: ShellBridge, page: String = "P1") -> Bool {
        let s = TabsScene(bridge: bridge)
        scenes.append(s)
        return bridge.install(webView: s.webView, presenter: s.web, pageBuild: page,
                              launch: ShellLaunch(tabRootAllowed: true, first: "log", barGuess: (83, 34))).tabsRoot
    }

    /// A scene as SceneDelegate builds it (H9), its page loaded and, unless `hello` is nil, linked with those screens.
    /// `flag`: the App's `window.__FP_SHELL` script goes in after the install, as `capacitorDidLoad` adds it.
    private func scene(first: String = "log", allowed: Bool = true, hello screens: [String]? = ShellBridgeTabsTests.all,
                       bridge: ShellBridge? = nil, flag: Bool = false) async throws -> TabsScene {
        let s = TabsScene(bridge: bridge ?? makeBridge())
        scenes.append(s)
        let launch = ShellLaunch(tabRootAllowed: allowed, first: first, barGuess: RootTabController.predicted(screen: s.window.bounds.size))
        s.installed = s.bridge.install(webView: s.webView, presenter: s.web, pageBuild: "P1", launch: launch)
        if flag {
            let f = ShellFlag(contract: s.bridge.shell, screens: s.installed.screens, tabs: s.installed.tabsRoot ? launch.flag : nil)
            s.webView.configuration.userContentController.addUserScript(WKUserScript(source: f.script, injectionTime: .atDocumentStart,
                                                                                     forMainFrameOnly: true))
        }
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
    /// tabs` answered under a classic root (under a live one it is the fallback: test 19).
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
        XCTAssertEqual(s.binding?.screens.shown, [], "nothing presented")

        // build 60's words for a piece not live: a new document whose hello names the bar alone
        try await load(s)
        let h = try await hello(s, ["tabs"], boot: "b2")
        XCTAssertEqual(h["screens"] as? [String], ["tabs"])
        why = await refusal(s, "present", ["screen": "coach"])
        XCTAssertEqual(why, "the coach screen is not on for this document", "build 60's words, no code")

        // a root that fell back on its own (its UI half alone, which the bridge runs for every fallback) is no live root
        root.fallBack(why: .switch, at: Date())
        why = await refusal(s, "selectTab", ["tab": "progress"])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal(s, "sheets", ["open": false])
        XCTAssertEqual(why, "off: no live tab root")
    }

    /// The link's fallback (a hello that leaves `tabs` out: the page's decline, contract 3.2) ends the live root too:
    /// the root falls back with it, and `selectTab` and `sheets` are refused `off` from then on.
    func test03bAfterTheLinksFallbackSelectTabAndSheetsAreRefusedOff() async throws {
        let s = try await scene(first: "log", hello: nil)
        _ = try await message(s, "selectTab", ["tab": "progress"]).get()   // live before the hello
        try await hello(s, ["coach"])
        XCTAssertEqual(s.binding?.link.fellBackWhy, .page)
        XCTAssertEqual(s.root?.fellBack?.why, .page, "the root's half ran with it")
        XCTAssertEqual(s.root?.isTabBarHidden, true)
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
    /// that do not decode trip `tabs` for the page build, and the scene falls back (`failures`).
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
        XCTAssertEqual(b.link.fellBackWhy, .failures, "the link fell back")
        XCTAssertEqual(root.fellBack?.why, .failures, "and the root with it")
        XCTAssertTrue(root.isTabBarHidden)
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
    /// every call trips `tabs` (`failures`) once the ping fails, and the scene falls back.
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
        XCTAssertEqual(root.fellBack?.why, .failures)
        XCTAssertFalse(b.link.isLive("tabs"))
    }

    // MARK: 14. Hello with tabs; a hello without them (H8 test 1)

    /// H8 test 1 (contract 3.2, 10.1, 10.3, D6): a hello naming `tabs` gets `tabs {selected, seq, bar}`: the shell's tab,
    /// the scene's seq and the bar as measured, and no `tabs.select`. A classic-mode page (`coach` alone) under a live tab
    /// root falls the scene back at its hello (`page`), records the decline for its page build (saved) and gets 60's
    /// overlay chat at once; the next launch decides the classic root for that page build and the tab root for another.
    func test14AHelloNamingTabsGetsTheSelectionAndTheBarAndOneWithoutFallsBackAndDeclines() async throws {
        let s = try await scene(first: "progress", hello: nil)
        let root = try XCTUnwrap(s.root)
        _ = try await message(s, "selectTab", ["tab": "settings"]).get()
        let h = try await hello(s)
        XCTAssertEqual(h["screens"] as? [String], ["coach", "coachHome", "tabs"])
        let tabs = try XCTUnwrap(h["tabs"] as? [String: Any], "tabs negotiated: the reply carries it")
        XCTAssertEqual(tabs["selected"] as? String, "settings")
        XCTAssertEqual(tabs["seq"] as? Int, 1)
        let bar = try XCTUnwrap(tabs["bar"] as? [String: Int])
        XCTAssertGreaterThan(bar["h"] ?? 0, 0)
        XCTAssertEqual(bar["h"], cover(s), "the bar frame's cover")
        XCTAssertEqual(bar["safe"], Int(s.window.safeAreaInsets.bottom.rounded()))
        XCTAssertEqual(bar["rev"], root.barRev)
        XCTAssertNil(root.fellBack)
        try await sleep(0.3)
        let selects = await calls(s, "tabs.select")
        XCTAssertEqual(selects.count, 0, "the reply carries the selection: no tabs.select")

        // a classic-mode page under a live tab root
        let home = makeHome()
        let c = try await scene(first: "log", hello: nil, bridge: makeBridge(home: home))
        let croot = try XCTUnwrap(c.root)
        let ch = try await hello(c, ["coach"])
        XCTAssertEqual(ch["screens"] as? [String], ["coach"], "negotiated on the classic rule: 60's overlay chat at once")
        XCTAssertNil(ch["tabs"])
        XCTAssertEqual(croot.fellBack?.why, .page)
        XCTAssertTrue(croot.isTabBarHidden)
        XCTAssertEqual(c.binding?.screens.stackAttached, false, "a present goes over the page from now on")
        XCTAssertEqual(c.binding?.link.book.declined["tabs"], "P1")
        XCTAssertEqual(ShellBridge.loadBook(folder: home.folder, defaults: home.defaults).declined["tabs"], "P1", "saved")
        XCTAssertFalse(decidesTabRoot(makeBridge(home: home)), "the next launch: the classic root for P1")
        XCTAssertTrue(decidesTabRoot(makeBridge(home: home), page: "P2"), "another page build: the tab root")
    }

    // MARK: 15. coachHome left out (H8 test 2)

    /// H8 test 2 (contract 1.4, 3.2): a page that names `coach` and `tabs` but not `coachHome` gets the bar alone, its page
    /// build declines `coachHome`, and the Coach tab turns WEB at once: the web view shown and, Coach being selected, the
    /// page uncovered; the resync covers nothing.
    func test15ATabsHelloWithoutCoachHomeGetsTheBarAloneAndTheCoachTabTurnsWeb() async throws {
        let s = try await scene(first: "coach", hello: nil)
        let root = try XCTUnwrap(s.root)
        XCTAssertEqual(root.coachMode, .waiting)
        XCTAssertTrue(s.webView.isHidden, "WAITING: the web view waits behind the room's ground")
        let h = try await hello(s, ["coach", "tabs"])
        XCTAssertEqual(h["screens"] as? [String], ["tabs"])
        XCTAssertNotNil(h["tabs"])
        XCTAssertEqual(s.binding?.link.book.declined["coachHome"], "P1")
        XCTAssertNil(s.binding?.link.book.declined["tabs"])
        XCTAssertEqual(root.coachMode, .web, "WEB at once")
        XCTAssertFalse(s.webView.isHidden)
        XCTAssertNil(root.fellBack, "the bar stays")
        XCTAssertNil(s.binding?.coachNet, "no net for a WEB tab")
        try await expect("covered off") { await self.calls(s, "shell.covered").map(\.on) == [false] }
        try await sleep(0.3)
        let covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.map(\.on), [false], "once")
    }

    // MARK: 16. A version refusal; the policy before the hello (H8 test 3)

    /// H8 test 3 (contract 3.2, 10.1, 10.3): a version refusal under a live tab root falls back (`refused`) and declines
    /// `tabs` for the page build (About: `off: page`); the policy file turning `tabs` off before the hello falls back with
    /// `policy`, declines nothing, and negotiates the classic rule (60's overlay chat).
    func test16AVersionRefusalDeclinesTabsAndThePolicyBeforeTheHelloFallsBackWithPolicy() async throws {
        let s = try await scene(first: "log", hello: nil)
        let h = try await message(s, "hello", ["v": 0, "page": "P1", "screens": Self.all, "boot": "b1"]).get()
        XCTAssertEqual(h["v"] as? Int, 0)
        XCTAssertEqual(h["why"] as? String, "no-version")
        XCTAssertNil(h["tabs"])
        XCTAssertEqual(s.root?.fellBack?.why, .refused)
        XCTAssertEqual(s.root?.isTabBarHidden, true)
        XCTAssertEqual(s.binding?.link.book.declined["tabs"], "P1")
        let st = try await message(s, "status", [:]).get()
        XCTAssertEqual((st["fellBack"] as? [String: Any])?["why"] as? String, "refused")
        XCTAssertEqual(((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])?["off"] as? String, "page")

        let p = try await scene(first: "log", hello: nil)
        p.bridge.environment.policy = { Policy(screens: ["tabs": .off]) }
        let ph = try await hello(p)
        XCTAssertEqual(ph["screens"] as? [String], ["coach"], "the classic rule: 60's overlay chat")
        XCTAssertNil(ph["tabs"])
        XCTAssertEqual(p.root?.fellBack?.why, .policy)
        XCTAssertEqual(p.root?.isTabBarHidden, true)
        XCTAssertNil(p.binding?.link.book.declined["tabs"], "the policy, not the page: no decline")
    }

    // MARK: 17. No hello (H8 test 4)

    /// H8 test 4 (contract 2.3, 10.3): no hello within the deadline (1 s here) falls the scene back (`no-hello`): the bar
    /// hidden, the WAITING Coach tab WEB with the web view shown, every piece tripped for the page build, and nothing sent
    /// (no link to send on). The page's failsafe `dismiss tabs` after it finds the scene fallen back: ok, nothing changes.
    func test17NoHelloWithinTheDeadlineFallsBackAndSendsNothing() async throws {
        let s = try await scene(first: "coach", hello: nil, bridge: makeBridge(linkConfig: LinkState.Config(helloDeadline: 1)))
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        XCTAssertEqual(root.coachMode, .waiting)
        try await expect("the no-hello fallback", within: 6) { root.fellBack != nil }
        XCTAssertEqual(root.fellBack?.why, .noHello)
        XCTAssertEqual(b.link.fellBackWhy, .noHello)
        XCTAssertTrue(root.isTabBarHidden)
        XCTAssertEqual(root.coachMode, .web)
        XCTAssertFalse(s.webView.isHidden)
        XCTAssertEqual(b.link.book.trip(screen: "tabs", pageBuild: "P1")?.reason, .noHello)
        XCTAssertFalse(b.screens.stackAttached)
        try await sleep(0.3)
        XCTAssertEqual(b.pageLink.records.count, 0, "no link: no screens.off, no covered")
        let inPage = await got(s)
        XCTAssertEqual(inPage.count, 0)
        _ = try await message(s, "dismiss", ["screen": "tabs"]).get()   // the page's failsafe
        XCTAssertEqual(root.fellBack?.why, .noHello, "nothing changes")
        XCTAssertNil(b.link.book.declined["tabs"])
        XCTAssertEqual(b.pageLink.records.count, 0)
        let st = try await message(s, "status", [:]).get()
        XCTAssertEqual((st["fellBack"] as? [String: Any])?["why"] as? String, "no-hello")
    }

    // MARK: 18. A tabs trip (H8 test 5)

    /// H8 test 5 (contract 4.2, 4.4, 10.3, D21): three failed `tabs.select` in a row (the owner's re-tap and its two
    /// restates, each answered `bad-args`) trip the bar and the scene falls back (`failures`) in one turn: the chat
    /// popped, the bar hidden, the web view shown. Then the page hears `screens.off` for `coach` (`needs`, with the
    /// composer's words), `coachHome` (`needs`) and `tabs` (`failures`), in that order, and `shell.covered {on:false}`
    /// (the NATIVE Coach tab was selected). It answers without `took`: the words stay native.
    func test18ThreeFailedTabsSelectsTripTheBarAndTheFallbackTellsThePageInOrder() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        root.setHome(s.home)   // NATIVE (H10 gives N's hub)
        _ = try await message(s, "model", ["screen": "coach", "rev": 1, "json": try coachModelJSON(rev: 1)]).get()
        _ = try await message(s, "selectTab", ["tab": "coach"]).get()
        _ = try await message(s, "present", ["screen": "coach"]).get()
        try await expect("the chat pushed") { root.coachSlot.nav.viewControllers.count == 2 }
        try await expect("the link idle") { b.pageLink.pending == 0 && b.screens.describe()["busy"] as? Bool == false }
        b.screens.coach.draft.text = "  Words the owner typed\n"
        await setHow(s, "tabs.select", "fail:bad-args")
        _ = await js(s, "window.__got = []; 0")
        tap(s, "coach")   // a re-tap: its tabs.select fails, and so do the two restates after it
        try await expect("the bar tripped and the root fell back") { root.fellBack != nil }
        XCTAssertEqual(root.fellBack?.why, .failures)
        XCTAssertEqual(b.link.book.trip(screen: "tabs", pageBuild: "P1")?.reason, .failures)
        XCTAssertEqual(root.coachSlot.nav.viewControllers.count, 1, "the chat popped")
        XCTAssertEqual(b.screens.shown, [])
        XCTAssertFalse(b.screens.stackAttached, "a later present is 60's overlay")
        XCTAssertTrue(root.isTabBarHidden)
        XCTAssertEqual(root.coachMode, .web)
        XCTAssertFalse(s.webView.isHidden)
        try await expect("the page told, then uncovered") { await self.calls(s, "shell.covered").count == 1 }
        try await expect("the link idle again") { b.pageLink.pending == 0 }
        let told = await got(s).filter { $0.name == "screens.off" || $0.name == "shell.covered" }
        XCTAssertEqual(told.map(\.name), ["screens.off", "screens.off", "screens.off", "shell.covered"])
        XCTAssertEqual(told.map { $0.args["screen"] as? String }, ["coach", "coachHome", "tabs", nil])
        XCTAssertEqual(told.map { $0.args["why"] as? String }, ["needs", "needs", "failures", nil])
        XCTAssertEqual(told.first?.args["draft"] as? String, "Words the owner typed", "the composer's words, trimmed")
        XCTAssertEqual(told.dropFirst().compactMap { $0.args["draft"] as? String }, [], "a draft goes with coach alone")
        XCTAssertEqual(told.last?.on, false)
        XCTAssertEqual(b.screens.coach.draft.text, "  Words the owner typed\n", "no took: the words stay native")
        let selects = await calls(s, "tabs.select")
        XCTAssertEqual(selects.count, 3, "the re-tap's and two restates; none after the fallback")
        XCTAssertEqual(RecordingWebView.nilMovesWhileLive(of: s.webView), 0)
    }

    // MARK: 19. dismiss tabs (H8 test 6)

    /// H8 test 6 (contract 2.3, 3.6, 10.3, D32, I14): the page's `dismiss {screen:'tabs'}` under a live tab root falls
    /// the scene back within that one message (`page`: never two bars), declines `tabs` for the page build, and the page
    /// hears `screens.off` for its live `coach` and `coachHome` (`needs`) but none for `tabs`; sent again (the page's
    /// failsafe), and under a classic root, it is answered and changes nothing.
    func test19DismissTabsFallsBackDeclinesAndSendsNoScreensOffForTabs() async throws {
        let s = try await scene(first: "settings")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        _ = try await message(s, "dismiss", ["screen": "tabs"]).get()
        XCTAssertEqual(root.fellBack?.why, .page)
        XCTAssertTrue(root.isTabBarHidden, "hidden by the answer: never two bars (I14)")
        XCTAssertEqual(b.link.fellBackWhy, .page)
        XCTAssertEqual(b.link.book.declined["tabs"], "P1")
        XCTAssertEqual(b.link.liveScreens, [])
        try await expect("the live pieces' screens.off") { await self.calls(s, "screens.off").count == 2 }
        _ = try await message(s, "dismiss", ["screen": "tabs"]).get()
        try await sleep(0.3)
        let offs = await calls(s, "screens.off")
        XCTAssertEqual(offs.map { $0.args["screen"] as? String }, ["coach", "coachHome"], "none for tabs, nothing for the second dismiss")
        XCTAssertEqual(offs.map { $0.args["why"] as? String }, ["needs", "needs"])
        let covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.count, 0, "Settings was selected: nothing to uncover")
        XCTAssertEqual(root.selected, "settings")

        let c = try await scene(allowed: false, hello: ["coach"])
        _ = try await message(c, "dismiss", ["screen": "tabs"]).get()
        XCTAssertEqual(c.binding?.link.liveScreens, ["coach"], "a classic root: nothing changes")
        XCTAssertNil(c.binding?.link.book.declined["tabs"])
        XCTAssertNil(c.binding?.link.fellBackWhy)
    }

    // MARK: 20. The policy file (H8 test 7)

    /// H8 test 7 (contract 8.3, 10.1, 10.3): the policy file turning `coachHome` off turns the Coach tab WEB at once (the
    /// web view shown and, Coach being selected, the page uncovered) and takes the chat with it (`needs`: joint), the bar
    /// staying; turning `tabs` off then falls the scene back at once (`policy`), with no decline.
    func test20ThePolicyTurnsTheCoachTabWebAndThenTheBarOff() async throws {
        let s = try await scene(first: "coach")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        var policy = Policy.defaults
        s.bridge.environment.policy = { policy }
        XCTAssertEqual(root.coachMode, .waiting)
        try await expect("covered on after the hello (a WAITING Coach tab)") { await self.calls(s, "shell.covered").map(\.on) == [true] }
        policy = Policy(screens: ["coachHome": .off])
        s.bridge.policyChanged(screens: ["coachHome"])
        XCTAssertEqual(root.coachMode, .web, "at once")
        XCTAssertFalse(s.webView.isHidden)
        XCTAssertNil(root.fellBack)
        XCTAssertTrue(b.link.isLive("tabs"), "the bar stays")
        XCTAssertFalse(b.link.isLive("coach"), "joint: the chat goes with the Coach tab")
        try await expect("covered off and the two offs") {
            let offs = await self.calls(s, "screens.off").count
            let covered = await self.calls(s, "shell.covered").count
            return offs == 2 && covered == 2
        }
        let covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.map(\.on), [true, false])
        let offs = await calls(s, "screens.off")
        XCTAssertEqual(offs.map { $0.args["screen"] as? String }, ["coach", "coachHome"])
        XCTAssertEqual(offs.map { $0.args["why"] as? String }, ["needs", "withdrawn"])

        policy = Policy(screens: ["coachHome": .off, "tabs": .off])
        s.bridge.policyChanged(screens: ["tabs"])
        XCTAssertEqual(root.fellBack?.why, .policy)
        XCTAssertTrue(root.isTabBarHidden)
        XCTAssertNil(b.link.book.declined["tabs"], "no decline: on again from the launch after the policy says so")
        try await expect("tabs off with the policy's word") { await self.calls(s, "screens.off").count == 3 }
        let last = await calls(s, "screens.off").last
        XCTAssertEqual(last?.args["screen"] as? String, "tabs")
        XCTAssertEqual(last?.args["why"] as? String, "policy")
        try await sleep(0.3)
        let after = await calls(s, "shell.covered")
        XCTAssertEqual(after.count, 2, "the Coach tab was WEB already: nothing more to uncover")
    }

    // MARK: 21. The shell's switch (H8 test 8)

    /// H8 test 8 (contract 3.5, 10.1, D5): `setSwitch {tabs, on:false}` falls the scene back now (`switch`), answers the
    /// status (`switches.tabs` false) and holds at the next launch (the classic root); under that classic root `on:true`
    /// is accepted, changes nothing in the launch (`needs: ["root"]`) and gives the tab root from the next launch;
    /// `no-switch` for any other piece.
    func test21SetSwitchOffFallsBackNowAndHoldsOnActsFromTheNextLaunch() async throws {
        let home = makeHome()
        let s = try await scene(first: "progress", bridge: makeBridge(home: home))
        let root = try XCTUnwrap(s.root)
        var why = await refusal(s, "setSwitch", ["screen": "coach", "on": false])
        XCTAssertEqual(why, "no-switch: this binary keeps no switch for coach")
        why = await refusal(s, "setSwitch", ["screen": "coachHome", "on": false])
        XCTAssertEqual(code(why), "no-switch")
        XCTAssertNil(root.fellBack)
        let st = try await message(s, "setSwitch", ["screen": "tabs", "on": false]).get()
        XCTAssertEqual(root.fellBack?.why, .switch)
        XCTAssertTrue(root.isTabBarHidden)
        XCTAssertEqual(st["switches"] as? [String: Bool], ["tabs": false])
        XCTAssertEqual(st["root"] as? String, "tabs")
        XCTAssertEqual((st["fellBack"] as? [String: Any])?["why"] as? String, "switch")
        XCTAssertEqual(((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])?["off"] as? String, "device")
        try await expect("tabs off with the switch's word") { await self.calls(s, "screens.off").last?.args["why"] as? String == "switch" }
        XCTAssertFalse(decidesTabRoot(makeBridge(home: home)), "the next launch: the classic root")

        let c = try await scene(hello: ["coach"], bridge: makeBridge(home: home))
        XCTAssertNil(c.root, "the switch holds: a classic root")
        let on = try await message(c, "setSwitch", ["screen": "tabs", "on": true]).get()
        XCTAssertEqual(on["switches"] as? [String: Bool], ["tabs": true])
        XCTAssertEqual(on["root"] as? String, "classic")
        XCTAssertTrue(on["fellBack"] is NSNull)
        let bar = try XCTUnwrap((on["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(bar["off"] as? String, "needs")
        XCTAssertEqual(bar["needs"] as? [String], ["root"], "on from the next launch")
        XCTAssertEqual(c.binding?.link.liveScreens, ["coach"], "nothing changes in this launch")
        XCTAssertTrue(decidesTabRoot(makeBridge(home: home)), "the next launch: the tab root")
    }

    // MARK: 22. After a fallback (H8 test 9)

    /// H8 test 9 (contract 2.3, 3.3, 3.4, 10.3, H-G3): after a fallback `selectTab` and `sheets` are refused `off`; the
    /// web view's user scripts hold the document-start script that deletes the flag's `tabs`, after the flag's own, so
    /// the scene's next document boots with no `tabs` in its flag (the rest of it kept); its hello gets the classic rule,
    /// `tabs` and `coachHome` left out, and no `tabs` in the reply.
    func test22AfterAFallbackLaterDocumentsHaveNoTabsAndHellosAreClassic() async throws {
        let s = try await scene(first: "log", flag: true)
        let root = try XCTUnwrap(s.root)
        let first = await js(s, "JSON.stringify(window.__FP_SHELL.tabs)") as? String
        XCTAssertEqual(first, #"{"bar":{"h":83,"safe":34},"selected":"log"}"#, "the tab root's flag")
        let ucc = s.webView.configuration.userContentController
        XCTAssertFalse(ucc.userScripts.contains { $0.source == ShellBridge.dropTabsScript })
        _ = try await message(s, "setSwitch", ["screen": "tabs", "on": false]).get()
        XCTAssertNotNil(root.fellBack)
        var why = await refusal(s, "selectTab", ["tab": "progress"])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal(s, "sheets", ["open": true])
        XCTAssertEqual(why, "off: no live tab root")
        let scripts = ucc.userScripts.map(\.source)
        let flagAt = try XCTUnwrap(scripts.firstIndex { $0.hasPrefix("window.__FP_SHELL = ") })
        let dropAt = try XCTUnwrap(scripts.firstIndex(of: ShellBridge.dropTabsScript), "the delete script is in")
        XCTAssertLessThan(flagAt, dropAt, "after the flag's")
        XCTAssertEqual(scripts.filter { $0 == ShellBridge.dropTabsScript }.count, 1)
        XCTAssertTrue(ucc.userScripts[dropAt].isForMainFrameOnly)
        XCTAssertEqual(ucc.userScripts[dropAt].injectionTime, .atDocumentStart)

        try await load(s)   // the scene's next document
        let tabs = await js(s, "typeof window.__FP_SHELL.tabs") as? String
        XCTAssertEqual(tabs, "undefined", "no tabs in its flag: the page boots classic")
        let binary = await js(s, "JSON.stringify(window.__FP_SHELL.binary)") as? String
        XCTAssertEqual(binary, #"["coach","coachHome","tabs"]"#, "the rest of the flag stays")
        let h = try await hello(s, Self.all, boot: "b2")
        XCTAssertEqual(h["screens"] as? [String], ["coach"], "tabs and coachHome left out: the classic rule (60's overlay chat)")
        XCTAssertNil(h["tabs"])
        XCTAssertEqual(s.binding?.screens.stackAttached, false)
        XCTAssertEqual(root.selected, "log", "the selection never moved")
    }

    // MARK: 23. The Coach tab's modes (H8 test 10)

    /// H8 test 10 (contract 1.4, 3.6, 8.3, D17, I13): the Coach tab's modes belong to the scene. A WAITING tab turns WEB
    /// 3 s after the hello's answer (not before), shows the web view and uncovers the page while selected, and stays WEB
    /// across a reload with no net; a WAITING tab turns WEB at once on `dismiss coachHome`, after which no reload brings
    /// WAITING or the net back; a NATIVE tab across a reload is named in `up`, taken over with no net, and stays NATIVE.
    func test23TheCoachTabsModesBelongToTheScene() async throws {
        XCTAssertEqual(ShellBridge.coachNetSeconds, 3)
        let w = try await scene(first: "coach", hello: nil, bridge: makeBridge(net: ShellBridge.coachNetSeconds))
        let wroot = try XCTUnwrap(w.root)
        try await hello(w)
        XCTAssertEqual(wroot.coachMode, .waiting)
        XCTAssertNotNil(w.binding?.coachNet, "the net runs")
        try await sleep(2.5)
        XCTAssertEqual(wroot.coachMode, .waiting, "not before 3 s")
        try await expect("WEB 3 s after the answer") { wroot.coachMode == .web }
        XCTAssertFalse(w.webView.isHidden, "the web view shows")
        XCTAssertNil(w.binding?.coachNet)
        try await expect("covered on after the hello, off when it turned WEB") { await self.calls(w, "shell.covered").map(\.on) == [true, false] }
        try await load(w)
        try await hello(w, Self.all, boot: "b2")
        XCTAssertEqual(wroot.coachMode, .web, "WEB stays WEB across a reload")
        XCTAssertNil(w.binding?.coachNet, "no net for a WEB tab")

        let d = try await scene(first: "coach", bridge: makeBridge(net: ShellBridge.coachNetSeconds))
        let droot = try XCTUnwrap(d.root)
        XCTAssertEqual(droot.coachMode, .waiting)
        _ = try await message(d, "dismiss", ["screen": "coachHome"]).get()
        XCTAssertEqual(droot.coachMode, .web, "at once")
        XCTAssertFalse(d.webView.isHidden)
        XCTAssertNil(d.binding?.coachNet, "the net went")
        try await expect("covered on, then off") { await self.calls(d, "shell.covered").map(\.on) == [true, false] }
        try await load(d)
        try await hello(d, Self.all, boot: "b2")
        XCTAssertEqual(droot.coachMode, .web, "after the scene's first declaration no reload brings WAITING back")
        XCTAssertNil(d.binding?.coachNet, "nor the net")
        droot.setCoachMode(.waiting)
        XCTAssertEqual(droot.coachMode, .web, "WAITING never returns in the scene")

        let n = try await scene(first: "coach", hello: nil, bridge: makeBridge(net: ShellBridge.coachNetSeconds))
        let nroot = try XCTUnwrap(n.root)
        nroot.setHome(n.home)   // NATIVE (from H10: the page's present coachHome)
        try await hello(n)
        XCTAssertNil(n.binding?.coachNet, "a NATIVE tab runs no net")
        try await load(n)
        let h = try await hello(n, Self.all, boot: "b2")
        XCTAssertEqual(h["up"] as? [String], ["coachHome"], "the NATIVE tab named in up: the new document takes it over")
        XCTAssertNil(n.binding?.coachNet, "taken over: no present, no net")
        try await sleep(3.3)
        XCTAssertEqual(nroot.coachMode, .native, "still NATIVE after 3 s")
        XCTAssertTrue(n.webView.isHidden)
        let covered = await calls(n, "shell.covered")
        XCTAssertEqual(covered.map(\.on), [true], "the new document is covered after its hello")
    }

    // MARK: 24. A reload on a NATIVE Coach tab (H8 test 11)

    /// H8 test 11 (contract 3.2, 4.3, I3): a reload with Coach selected, NATIVE and the chat pushed: the hello's `up`
    /// names both, the reply carries the selection, and the resync covers the page and asks for the chat's snapshot, with
    /// no `tabs.select`; the NATIVE tab and the chat stay for the page to take over.
    func test24AReloadOnANativeCoachTabCoversThePageAndSendsNoTabsSelect() async throws {
        let s = try await scene(first: "coach")
        let root = try XCTUnwrap(s.root)
        let b = try XCTUnwrap(s.binding)
        root.setHome(s.home)
        _ = try await message(s, "model", ["screen": "coach", "rev": 1, "json": try coachModelJSON(rev: 1)]).get()
        _ = try await message(s, "present", ["screen": "coach"]).get()
        try await expect("the chat pushed") { root.coachSlot.nav.viewControllers.count == 2 }
        try await expect("the link idle") { b.pageLink.pending == 0 && b.screens.describe()["busy"] as? Bool == false }
        try await load(s)
        let h = try await hello(s, Self.all, boot: "b2")
        XCTAssertEqual(h["up"] as? [String], ["coach", "coachHome"])
        XCTAssertEqual((h["tabs"] as? [String: Any])?["selected"] as? String, "coach")
        try await expect("covered on and the snapshot asked for") {
            let covered = await self.calls(s, "shell.covered").map(\.on)
            let snapshots = await self.calls(s, "coach.snapshot").count
            return covered == [true] && snapshots == 1
        }
        try await sleep(0.3)
        let selects = await calls(s, "tabs.select")
        XCTAssertEqual(selects.count, 0, "never tabs.select at the resync")
        let covered = await calls(s, "shell.covered")
        XCTAssertEqual(covered.count, 1)
        XCTAssertEqual(root.coachMode, .native)
        XCTAssertEqual(root.coachSlot.nav.viewControllers.count, 2, "the chat stays for the page to take over")
        XCTAssertEqual(b.screens.shown, ["coach"])
    }

    // MARK: 25. Status (H8 test 12)

    /// H8 test 12 (contract 3.10, 10.5): the status names the root built at scene connect (`tabs`, still after a
    /// fallback; `classic`), the fallback's word and time, the shell's switches, the policy file's last check, the strays
    /// and `leftAny` counters, and the pieces' offs: `page` for a decline (Try again clears it), `needs` with the pieces
    /// needed, `["root"]` for the bar whose checks pass with no live tab root.
    func test25TheStatusNamesTheRootTheFallbackTheSwitchesAndTheOffs() async throws {
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        var state = PolicyState()
        state.record(.body(Data(#"{"v":1}"#.utf8)), at: Date(timeIntervalSince1970: 1_700_000_000))
        s.bridge.environment.policyState = { state }
        var st = try await message(s, "status", [:]).get()
        XCTAssertEqual(st["root"] as? String, "tabs")
        XCTAssertTrue(st["fellBack"] is NSNull)
        XCTAssertEqual(st["switches"] as? [String: Bool], ["tabs": true])
        let policy = try XCTUnwrap(st["policy"] as? [String: Any])
        XCTAssertEqual((policy["at"] as? NSNumber)?.doubleValue, 1_700_000_000_000, "the last check, in ms")
        XCTAssertEqual(policy["result"] as? String, "unchanged", "its result (a file that leaves the defaults)")
        XCTAssertNotNil((st["counters"] as? [String: Any])?["leftAny"] as? [String: Any])
        XCTAssertEqual(((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])?["live"] as? Bool, true)
        root.selectedIndex = ShellTabs.ids.firstIndex(of: "progress")!   // a stray
        _ = try await message(s, "dismiss", ["screen": "tabs"]).get()
        st = try await message(s, "status", [:]).get()
        XCTAssertEqual(((st["counters"] as? [String: Any])?["strays"] as? [String: Any])?["launch"] as? Int, 1)
        XCTAssertEqual(st["root"] as? String, "tabs", "a fallen-back tab root stays tabs")
        let fell = try XCTUnwrap(st["fellBack"] as? [String: Any])
        XCTAssertEqual(fell["why"] as? String, "page")
        XCTAssertEqual((fell["at"] as? NSNumber)?.doubleValue ?? 0, Date().timeIntervalSince1970 * 1000, accuracy: 5000)
        let screens = try XCTUnwrap(st["screens"] as? [String: Any])
        let bar = try XCTUnwrap(screens["tabs"] as? [String: Any])
        XCTAssertEqual(bar["off"] as? String, "page")
        XCTAssertEqual(bar["canReset"] as? Bool, true)
        XCTAssertEqual(bar["live"] as? Bool, false)
        let home = try XCTUnwrap(screens["coachHome"] as? [String: Any])
        XCTAssertEqual(home["off"] as? String, "needs")
        XCTAssertEqual(home["needs"] as? [String], ["tabs"])
        let coach = try XCTUnwrap(screens["coach"] as? [String: Any])
        XCTAssertEqual(coach["on"] as? Bool, true, "the next document's: 60's overlay chat")
        XCTAssertEqual(coach["live"] as? Bool, false, "off for this document")
        // Try again clears the decline: the bar's own checks pass again and it needs a tab root (the next launch)
        let reset = try await message(s, "reset", ["screen": "tabs"]).get()
        let again = try XCTUnwrap((reset["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(again["off"] as? String, "needs")
        XCTAssertEqual(again["needs"] as? [String], ["root"])
        XCTAssertEqual((reset["fellBack"] as? [String: Any])?["why"] as? String, "page", "the scene's fallback stays")

        let c = try await scene(allowed: false, hello: ["coach"])
        let cst = try await message(c, "status", [:]).get()
        XCTAssertEqual(cst["root"] as? String, "classic")
        XCTAssertTrue(cst["fellBack"] is NSNull)
        XCTAssertEqual(cst["switches"] as? [String: Bool], ["tabs": true])
        XCTAssertTrue(cst["policy"] is NSNull, "no policy state from this host")
        let cbar = try XCTUnwrap((cst["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(cbar["off"] as? String, "needs")
        XCTAssertEqual(cbar["needs"] as? [String], ["root"])
    }

    // MARK: 26. The composer's words (H8 test 13)

    /// H8 test 13 (contract 4.2, D21, D38, G18): every `screens.off {screen:'coach'}` carries the native composer's
    /// unsent words, trimmed (here the policy file takes 60's overlay chat away under a classic root: any reason, any
    /// root). An answer with `took: true` empties the composer and `fpDraft.coach`; one without `took`, a refusal, a
    /// thrown error and a timeout each keep them; an empty composer sends no `draft`; the page's own `dismiss coach` sends
    /// no `screens.off` and hands nothing over.
    func test26TheComposersWordsGoToThePageOnlyWhenItTookThem() async throws {
        let home = makeHome()
        let s = try await scene(allowed: false, hello: nil, bridge: makeBridge(home: home))
        let b = try XCTUnwrap(s.binding)
        b.pageLink.timeoutScale = 0.25   // a timeout in 0.5 s
        var policy = Policy.defaults
        s.bridge.environment.policy = { policy }
        let draft = b.screens.coach.draft
        var round = 0
        /// A new document with the overlay chat live and `words` in the composer, linked; the page answers `screens.off`
        /// as `how` (with `took` when `took`).
        func linked(_ words: String, how: String = "ok", took: Bool = false) async throws {
            round += 1
            policy = .defaults
            if round > 1 { try await load(s) }
            try await hello(s, ["coach"], boot: "b\(round)")
            XCTAssertEqual(b.link.liveScreens, ["coach"], "round \(round)")
            draft.text = words
            await setHow(s, "screens.off", how)
            _ = await js(s, "window.__took = \(took); 0")
        }
        /// The policy file takes the chat away: the `screens.off` the page got, and how it ended.
        func takeAway() async throws -> (Call?, String?) {
            let before = b.pageLink.records.filter { $0.name == "screens.off" }.count
            policy = Policy(screens: ["coach": .off])
            s.bridge.policyChanged(screens: ["coach"])
            try await expect("round \(round): the screens.off ended", within: 6) {
                let offs = b.pageLink.records.filter { $0.name == "screens.off" }
                return offs.count == before + 1 && offs.last?.outcome != nil
            }
            let sent = await calls(s, "screens.off").last
            return (sent, b.pageLink.records.last { $0.name == "screens.off" }?.outcome)
        }
        try await linked("  The words I typed \n", took: true)
        var (off, outcome) = try await takeAway()
        XCTAssertEqual(off?.args["screen"] as? String, "coach")
        XCTAssertEqual(off?.args["why"] as? String, "withdrawn")
        XCTAssertEqual(off?.args["draft"] as? String, "The words I typed", "trimmed")
        XCTAssertEqual(outcome, "done")
        XCTAssertEqual(draft.text, "", "took: the composer empties")
        XCTAssertNil(home.defaults.string(forKey: CoachComposerDraft.defaultsKey), "and fpDraft.coach goes")
        for (how, words) in [("ok", "Answered without took"), ("refuse:busy", "Refused"), ("throw", "Thrown"), ("never", "Timed out")] {
            try await linked(words, how: how)
            (off, outcome) = try await takeAway()
            XCTAssertEqual(off?.args["draft"] as? String, words, how)
            XCTAssertEqual(draft.text, words, "\(how), \(outcome ?? "-"): the words stay native")
            XCTAssertEqual(home.defaults.string(forKey: CoachComposerDraft.defaultsKey), words, how)
        }
        let outcomes = b.pageLink.records.filter { $0.name == "screens.off" }.compactMap(\.outcome)
        XCTAssertEqual(outcomes.count, 5)
        XCTAssertEqual(Array(outcomes.prefix(3)), ["done", "done", "refused busy"])
        XCTAssertTrue(outcomes.count == 5 && outcomes[3].hasPrefix("failed script error"), "\(outcomes)")
        XCTAssertEqual(outcomes.last, "failed timeout")
        try await linked("  \n ", took: true)
        (off, outcome) = try await takeAway()
        XCTAssertNotNil(off)
        XCTAssertNil(off?.args["draft"], "an empty composer: no draft")
        // the page's own dismiss of the chat (D38): no screens.off, nothing handed over
        try await linked("Mine to keep")
        let offs = b.pageLink.records.filter { $0.name == "screens.off" }.count
        _ = try await message(s, "dismiss", ["screen": "coach"]).get()
        try await sleep(0.3)
        XCTAssertEqual(b.pageLink.records.filter { $0.name == "screens.off" }.count, offs)
        XCTAssertEqual(draft.text, "Mine to keep")
    }

    // MARK: 27. status {refresh} (H8 test 14)

    /// H8 test 14 (contract 3.10, 10.3, D43): `status {refresh: true}` asks `environment.fetchPolicy` once and answers
    /// once the fetch has ended, with what it changed acted on (a fetch that turns `tabs` off has fallen the scene back by
    /// then, `policy`); a plain `status` and a refresh inside the minute fetch nothing; a fetch that turns `tabs` on again
    /// changes nothing until the next launch (`needs: ["root"]`); a fetch that never ends is answered after the wait.
    func test27StatusRefreshFetchesThePolicyOnceAMinuteAndAnswersOnceItEnded() async throws {
        XCTAssertEqual(ShellBridge.refreshEvery, 60)
        XCTAssertEqual(ShellBridge.refreshWait, 10)
        final class Fetch {
            var count = 0
            var policy = Policy.defaults
            var next = Policy(screens: ["tabs": .off])
        }
        let s = try await scene(first: "log")
        let root = try XCTUnwrap(s.root)
        let bridge = s.bridge
        let f = Fetch()
        bridge.environment.policy = { f.policy }
        bridge.environment.fetchPolicy = { [weak bridge] done in
            f.count += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak bridge] in   // a fetch takes a moment
                MainActor.assumeIsolated {
                    f.policy = f.next
                    bridge?.policyChanged(screens: ["tabs"])
                    done()
                }
            }
        }
        _ = try await message(s, "status", [:]).get()
        XCTAssertEqual(f.count, 0, "a plain status fetches nothing")
        var st = try await message(s, "status", ["refresh": true]).get()
        XCTAssertEqual(f.count, 1)
        XCTAssertEqual(root.fellBack?.why, .policy, "the fetch's off acted before the answer")
        XCTAssertEqual((st["fellBack"] as? [String: Any])?["why"] as? String, "policy")
        XCTAssertEqual(((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])?["off"] as? String, "policy")
        st = try await message(s, "status", ["refresh": true]).get()
        XCTAssertEqual(f.count, 1, "inside the minute: the status as it stands")
        XCTAssertEqual((st["fellBack"] as? [String: Any])?["why"] as? String, "policy")

        bridge.refreshEvery = 0
        f.next = .defaults
        st = try await message(s, "status", ["refresh": true]).get()
        XCTAssertEqual(f.count, 2)
        let bar = try XCTUnwrap((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(bar["off"] as? String, "needs")
        XCTAssertEqual(bar["needs"] as? [String], ["root"], "on from the next launch")
        XCTAssertTrue(root.isTabBarHidden, "the scene stays fallen back")

        bridge.refreshWait = 0.5
        bridge.environment.fetchPolicy = { _ in f.count += 1 }   // a fetch that never ends
        let t0 = Date()
        _ = try await message(s, "status", ["refresh": true]).get()
        XCTAssertEqual(f.count, 3)
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(t0), 0.45, "answered after the wait")
    }
}

/// The stand-in page never came up: the case fails there, saying so.
private struct PageDidNotLoad: Error, CustomStringConvertible {
    var description: String { "the stand-in page did not load" }
}
#endif
