import UIKit
import WebKit
import Capacitor
import ActivityKit
import CapApp_SPM
import FPCore
import FPHost
import FPUI
import ObjectiveC.runtime

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Stored as Any? because @available cannot annotate stored properties.
    private var _restActivityStorage: Any? = nil
    @available(iOS 16.2, *)
    private var restActivity: Activity<TrovoTimerAttributes>? {
        get { _restActivityStorage as? Activity<TrovoTimerAttributes> }
        set { _restActivityStorage = newValue }
    }

    // Kept alive for the app's lifetime so its HKObserverQuery stays registered.
    private let healthObserver = HealthKitReader()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NotificationCenter.default.addObserver(self, selector: #selector(handleTimerStart(_:)), name: .trovoTimerStart, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleTimerEnd),      name: .trovoTimerEnd,   object: nil)
        // HealthKit background delivery: iOS relaunches the app after a new
        // workout and expects the observer to be set up during launch.
        if HealthKitReader.backgroundSyncEnabled {
            healthObserver.startBackgroundObserver()
        }
        // WatchConnectivity from launch, not from the web view: the watch
        // waking this app in the background connects no scene, so the plugin
        // (and its session delegate) never loaded and the watch got no reply.
        WatchSessionHub.shared.start()
        // A rest Live Activity only had an in-memory handle: if the app was
        // killed mid-rest the banner lingered ('DONE') and the next rest
        // stacked a second one. Sweep survivors at launch.
        if #available(iOS 16.2, *) {
            Task {
                for act in Activity<TrovoTimerAttributes>.activities {
                    await act.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
        #if DEBUG
        // tests/native-store.sh's sceneCycle replays a scene connection through SceneDelegate's own teardown and
        // connection (contract 15.3), so the replay builds the root exactly as a real connection does.
        StoreProbe.sceneReplay = { scene in (scene.delegate as? SceneDelegate)?.replay(scene) }
        #endif
        return true
    }

    @objc private func handleTimerStart(_ note: Notification) {
        guard #available(iOS 16.2, *),
              ActivityAuthorizationInfo().areActivitiesEnabled,
              let info         = note.userInfo,
              let exerciseName = info["exerciseName"] as? String,
              let seconds      = info["seconds"]      as? Int,
              let nextSet      = info["nextSet"]      as? Int,
              let totalSets    = info["totalSets"]    as? Int
        else { return }

        endCurrentActivity()

        var theme: TimerTheme? = nil
        if let t = info["theme"] as? [String: Any],
           let data = try? JSONSerialization.data(withJSONObject: t) {
            theme = try? JSONDecoder().decode(TimerTheme.self, from: data)
        }
        // The bar drains over the rest granted so far (the page's total), never less than
        // what is left; pages before 20261001-1 send none, so the bar starts full now.
        let total = max(seconds, (info["total"] as? Int) ?? seconds)
        let end = Date().addingTimeInterval(TimeInterval(seconds))
        let attrs = TrovoTimerAttributes(exerciseName: exerciseName, theme: theme)
        let state = TrovoTimerAttributes.ContentState(
            endDate:    end,
            nextSet:    nextSet,
            totalSets:  totalSets,
            detail:     info["detail"] as? String,
            startDate:  end.addingTimeInterval(-TimeInterval(total))
        )
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(TimeInterval(seconds) + 5))
        do {
            restActivity = try Activity.request(attributes: attrs, content: content, pushType: nil)
        } catch {
            // Live Activities not supported on this device/OS — silent no-op.
        }
    }

    @objc private func handleTimerEnd() {
        guard #available(iOS 16.2, *) else { return }
        endCurrentActivity()
    }

    @available(iOS 16.2, *)
    private func endCurrentActivity() {
        guard let activity = restActivity else { return }
        let finalState = activity.content.state
        Task {
            await activity.end(ActivityContent(state: finalState, staleDate: nil), dismissalPolicy: .immediate)
        }
        restActivity = nil
    }

    // MARK: - Scene lifecycle
    // Apps linked against the iOS 27 SDK must use UIScene: without a scene
    // delegate UIKit aborts at launch on iOS 27 (builds 44/45 crashed on the
    // phone while the iOS 26 simulator hid it). The manifest in Info.plist
    // names SceneDelegate and no storyboard (build 61 dropped both storyboard
    // keys): SceneDelegate builds the window and its root at each connection;
    // this only hands back the named config.
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // MARK: - Capacitor / URL / UserActivity

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if url.scheme == "trovo" {
            // Widget / complication deep link. Parked for a cold start (the page
            // reads it through TrovoWidget.consumeDeepLink) and pushed live when
            // the page is already up (SceneDelegate's one observer, through
            // ShellBridge.deepLink).
            UserDefaults.standard.set(url.absoluteString, forKey: "pendingDeepLink")
            NotificationCenter.default.post(name: .trovoDeepLink, object: nil, userInfo: ["url": url.absoluteString])
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

// ── Plugin registration ───────────────────────────────────────────────────────
// Capacitor stops runtime-scanning for CAPPlugin subclasses once the generated
// capacitor.config.json carries a packageClassList (it appeared when the first
// npm plugins were added). The custom in-app plugins must therefore be
// registered programmatically. SceneDelegate makes one SuperoViewController per
// scene connection, sets its launch values and loads its view before it builds
// the window's root (the controller itself, or the tab root around it).
class SuperoViewController: CAPBridgeViewController {
    /// SceneDelegate's launch values (contract 2.2, 2.4), set before the view loads. Nil means a classic root: a
    /// controller made any other way never builds a tab root.
    var shellLaunch: ShellLaunch?
    /// ShellBridge.install's root decision for this web view (capacitorDidLoad): SceneDelegate builds the tab root iff
    /// it is true, and the flag carries `tabs` iff it is true.
    private(set) var tabsRoot = false

    // Live-page updates (TrovoOtaPlugin): a staged newer index.html + the
    // bundled web folder live in Application Support; serve it when its
    // build beats the bundle's, otherwise the bundle. See TrovoOta.
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let live = TrovoOta.launchLocation() {
            descriptor.appLocation = live
        }
        // The shell owns focus (FPKit ScreenHost): the web view becomes first
        // responder when the owner taps into it, never at its first appearance,
        // so nothing can hand a keyboard back to it after a native screen.
        descriptor.hasInitialFocus = false
        return descriptor
    }

    // The shell's WKWebView: it counts every time it leaves its window while the
    // app is active (native screens go over it, never in its place).
    override open func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        ShellWebView(frame: frame, configuration: configuration)
    }

    // The policy file's screen switches reach the native screens at once.
    private var policyObserver: NSObjectProtocol?

    deinit {
        if let policyObserver { NotificationCenter.default.removeObserver(policyObserver) }
    }

    override open func capacitorDidLoad() {
        if let webView {
            // FPKit's native screens (shell contract v1): bound to this web view
            // (a scene that reconnects binds its own), with the policy file (its
            // switches, its last check and About's forced fetch, in every
            // configuration) and the store's bootDone from FPHost. It decides the
            // scene's root from SceneDelegate's launch values (contract 2.2) and
            // says which screens the page being served may present under it
            // (ScreenGate), for the flag below.
            let shell = ShellBridge.shared
            shell.environment.policy = { FPPolicy.shared.effective }
            shell.environment.policyState = { FPPolicy.shared.state }
            shell.environment.fetchPolicy = { done in FPPolicy.shared.fetchIfDue(force: true, done: done) }
            shell.environment.bootDone = { page, from in StoreAttach.shared.bootDone(page: page, webView: from) }
            let page = (bridge?.config.appLocation).flatMap { StoreAttach.pageBuild(in: $0) }
            let decided = shell.install(webView: webView, presenter: self, pageBuild: page, launch: shellLaunch)
            tabsRoot = decided.tabsRoot
            // window.__FP_SHELL (shell contract v1) at document start: what this
            // binary offers the page, the first frame's tab and bar guess iff the
            // root is a tab root, and, in Debug builds, the test tools'
            // -devNav/-devTheme launch arguments.
            webView.configuration.userContentController.addUserScript(WKUserScript(
                source: ShellFlagScript.script(shell: StoreAttach.shared.shellBuild, screens: decided.screens,
                                               tabs: decided.tabsRoot ? shellLaunch?.flag : nil),
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
            // FPKit's native copy of the owner's data (shadow, build 60): KTUIProxy in
            // front of Capacitor's UI delegate, then the facade at document start.
            // Bound to this web view; a scene that reconnects binds its own.
            StoreAttach.shared.install(webView: webView, pageFolder: bridge?.config.appLocation)
            #if DEBUG
            ShellBridge.debugHooks["policy"] = { step in
                let url = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(step["file"] as? String ?? "fp-policy.json")
                if let text = step["json"] as? String { try? Data(text.utf8).write(to: url) } else { try? FileManager.default.removeItem(at: url) }
                FPPolicy.shared.fetchIfDue(force: true)
            }
            #endif
        }
        policyObserver = NotificationCenter.default.addObserver(forName: FPPolicy.changed, object: nil, queue: .main) { note in
            let screens = note.userInfo?["screens"] as? [String] ?? []
            MainActor.assumeIsolated { ShellBridge.shared.policyChanged(screens: screens) }
        }
        // Warm trovo:// links reach the page through SceneDelegate's one
        // observer (contract 9: one handler per scene, for either root).
        bridge?.registerPluginInstance(TrovoOtaPlugin())
        bridge?.registerPluginInstance(TrovoHealthPlugin())
        bridge?.registerPluginInstance(TrovoTimerPlugin())
        bridge?.registerPluginInstance(TrovoSharePlugin())
        bridge?.registerPluginInstance(TrovoWidgetPlugin())
        bridge?.registerPluginInstance(TrovoWatchPlugin())
        bridge?.registerPluginInstance(TrovoIconPlugin())
        // Settings > About > Storage reaches FPKit's native copy through its host.
        let storePlugin = TrovoStorePlugin()
        storePlugin.host = StoreHostAdapter()
        bridge?.registerPluginInstance(storePlugin)
        // The page's half of the screen bridge (hello, bootDone, present, dismiss,
        // model, toast, confirm, log) reaches FPKit's ShellBridge through its host.
        let shellPlugin = TrovoShellPlugin()
        shellPlugin.host = ShellHostAdapter()
        bridge?.registerPluginInstance(shellPlugin)
        hideKeyboardAccessoryBar()
        // WebKit can create its content view after this callback; try once more.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.hideKeyboardAccessoryBar() }
    }

    // The grey ⌃ ⌄ Done strip iOS adds above the keyboard for web forms. Nothing
    // in the app uses it, and in the Coach it costs a row of conversation.
    // WKWebView has no API to drop it; the established route is a runtime
    // subclass of WebKit's content view whose inputAccessoryView returns nil.
    private func hideKeyboardAccessoryBar() {
        guard let scroll = webView?.scrollView else { return }
        for sub in scroll.subviews {
            guard let cls = object_getClass(sub), NSStringFromClass(cls).hasPrefix("WKContent") else { continue }
            let name = NSStringFromClass(cls) + "_NoAccessory"
            if let existing = NSClassFromString(name) {
                if object_getClass(sub) != existing { object_setClass(sub, existing) }
                return
            }
            guard let newCls = objc_allocateClassPair(cls, name, 0) else { return }
            let sel = #selector(getter: UIResponder.inputAccessoryView)
            if let method = class_getInstanceMethod(cls, sel) {
                let block: @convention(block) (AnyObject) -> UIView? = { _ in nil }
                class_addMethod(newCls, sel, imp_implementationWithBlock(block), method_getTypeEncoding(method))
            }
            objc_registerClassPair(newCls)
            object_setClass(sub, newCls)
            return
        }
    }
}

extension Notification.Name {
    static let trovoDeepLink = Notification.Name("TrovoDeepLink")
}

// ── Hosts for the thin plugins in CapApp-SPM ──────────────────────────────────
// CapApp-SPM cannot depend on FPKit (the Capacitor CLI rewrites its
// Package.swift), so each plugin there reaches FPKit through a host protocol
// the App target implements here.

/// TrovoStore's host: Settings > About > Storage reads and acts on FPKit's
/// native copy (FPHost StoreAttach) through it.
final class StoreHostAdapter: TrovoStoreHost {
    func storeStatus() -> [String: Any] { StoreAttach.shared.statusJSON() }

    func storeConflicts(limit: Int) -> [[String: Any]] { StoreAttach.shared.conflictsJSON(limit: limit) }

    func storePutBack(conflicts: [Int64], snap: String?, wipe: Bool, preview: Bool) throws -> [String: Any] {
        try StoreAttach.shared.putBackJSON(conflicts: conflicts, snap: snap, wipe: wipe, preview: preview)
    }

    func storeSetSwitch(on: Bool) -> [String: Any] {
        StoreAttach.shared.setNativeCopy(on: on)
        return ["on": StoreAttach.shared.deviceSwitchOn]
    }

    func storeExport() throws -> (data: Data, keys: Int) { try StoreAttach.shared.exportCopy() }

    func storeArmTestQuit(_ on: Bool, keys: [String]) -> Bool {
        if on { return StoreAttach.shared.armTestQuit(keys: keys) }
        StoreAttach.shared.disarmTestQuit()
        return false
    }
}

/// TrovoShell's host: the page's messages for the native screens reach FPUI's
/// ShellBridge through it.
final class ShellHostAdapter: TrovoShellHost {
    func shellMessage(_ method: String, options: [String: Any], webView: WKWebView?, done: @escaping (Result<[String: Any], Error>) -> Void) {
        ShellBridge.shared.pageMessage(method, options: options, webView: webView, done: done)
    }
}

// ── The scene ─────────────────────────────────────────────────────────────────
// Info.plist's manifest names this delegate and no storyboard (the iOS 27 scene
// rule: never remove the manifest or this class). At each connection it builds
// the window and exactly one root around exactly one SuperoViewController
// (contract 1.3): the tab root when ShellBridge's gate leaves `tabs` on (iOS 26
// and later), else the classic root, the SuperoViewController itself as build
// 60 had it. URL opens and user activities arrive here under the UIScene
// lifecycle and go to the same handlers (Capacitor's proxy, the trovo:// deep
// link) the app delegate used before.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    /// The scene's page, held for the scene's life (a tab root holds it too) and let go at the teardown.
    private var web: SuperoViewController?
    /// The scene's one `.trovoDeepLink` observer (contract 9): either root, through ShellBridge.deepLink.
    private var deepLinkObserver: NSObjectProtocol?

    deinit {
        if let deepLinkObserver { NotificationCenter.default.removeObserver(deepLinkObserver) }
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        connect(windowScene, urls: connectionOptions.urlContexts.map(\.url), activity: connectionOptions.userActivities.first)
    }

    /// The connection (11-shell.md H9; contract 2.2, 2.4, 6.1, 9, 10.2), in this order.
    private func connect(_ windowScene: UIWindowScene, urls: [URL], activity: NSUserActivity?) {
        // 1. A teardown's moves were not faults; from here the web view's moves count again. The policy starts before
        //    anything reads the gate (a Debug -fpPolicyFile is read at once when a fetch is due, so a tool can pin the
        //    classic root), and the store is rebound to this scene (its web view binds when it loads, step 5).
        ShellWebView.sceneEnding = false
        FPPolicy.shared.start()
        StoreAttach.shared.sceneConnected()
        // 2. The connection's URLs, before any observer exists: parked for the page's boot read, and nothing runs
        //    _trovoOpen on a cold start. A Debug -fpOpenURL is one more such URL.
        var opened = urls
        #if DEBUG
        if let url = Self.debugOpenURL() { opened.append(url) }
        #endif
        for url in opened { open(url) }
        // 3. The first frame's tab: Coach for a cold trovo://share, else the Debug -devNav route's head, else Log.
        var devNav: String?
        #if DEBUG
        devNav = ShellFlagScript.Dev(arguments: ProcessInfo.processInfo.arguments).nav
        #endif
        let first = ShellTabs.firstTab(share: opened.contains(where: Self.isShare), devNav: devNav)
        // 4. The window, and the bar's guess from the screen alone (contract 2.2, delta 14.1: the iOS 26+ glass bar is
        //    83 pt over a 34 pt home inset on a screen taller than 2:1, none otherwise). Nothing is read from the window
        //    and it shows nothing before its root is set (step 7); hello's measurement corrects a wrong guess. Below
        //    iOS 26 no tab root is built (the gate's `os`), so there is no bar to guess.
        let window = UIWindow(windowScene: windowScene)
        var guess = (h: 0, safe: 0)
        if #available(iOS 26.0, *) { guess = RootTabController.predicted(screen: windowScene.screen.bounds.size) }
        // 5. One SuperoViewController per connection, its view loaded now: instanceDescriptor (TrovoOta's launch
        //    location, exactly once) and capacitorDidLoad (ShellBridge.install decides the root before the page loads
        //    and the flag says the same; the store opens and binds) run before the page starts.
        let web = SuperoViewController()
        web.shellLaunch = ShellLaunch(tabRootAllowed: true, first: first, barGuess: guess)
        web.loadViewIfNeeded()
        // 6. The first frame's room (contract 6.1): the Debug -devTheme, else the owner's room as the store holds it,
        //    else Heavyweight.
        var devRoom: String?
        #if DEBUG
        devRoom = Self.devTheme()
        #endif
        let room = devRoom ?? StoreAttach.shared.firstFrameRoom() ?? "heavyweight"
        // 7. The root, set once (no placeholder first), and only then makeKeyAndVisible. The tab root's construction,
        //    from its init to the end of its first layout pass, runs inside the `tabs` short section (contract 10.2):
        //    a death there gives the classic root at the next launch for this shell and page build. It ends here, never
        //    at the first viewDidAppear, which a scene connected in the background can wait long for. A classic root
        //    is no tab construction to blame: no section.
        if web.tabsRoot, let webView = web.webView, #available(iOS 26.0, *) {
            ShellBridge.shared.section("tabs") {
                let root = RootTabController(web: web, webView: webView, first: first, look: TabsModel.defaults(for: Room(id: room)))
                ShellBridge.shared.adopt(root: root)
                window.rootViewController = root
                window.makeKeyAndVisible()
                root.view.layoutIfNeeded()
            }
        } else {
            window.rootViewController = web
            window.makeKeyAndVisible()
        }
        // 8. The window and the page are held here; the scene's one deep-link observer (warm links only).
        self.window = window
        self.web = web
        deepLinkObserver = NotificationCenter.default.addObserver(forName: .trovoDeepLink, object: nil, queue: .main) { [weak self] note in
            guard let text = note.userInfo?["url"] as? String, let url = URL(string: text) else { return }
            MainActor.assumeIsolated {
                guard self != nil else { return }
                ShellBridge.shared.deepLink(url)
            }
        }
        // 9. The first user activity, as before.
        if let activity { continueActivity(activity) }
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        disconnect()
    }

    /// The teardown: UIKit may disconnect a background scene and connect a new one in the same process (Apple's rule:
    /// let go of what the scene holds). The old page lets go of the store and its native screens first (ShellBridge
    /// forgets the root), then the window and the page go, so nothing here keeps the old page alive: a live old web view
    /// would be a second page writing localStorage.
    private func disconnect() {
        let webView = web?.webView
        if let deepLinkObserver { NotificationCenter.default.removeObserver(deepLinkObserver) }
        deepLinkObserver = nil
        StoreAttach.shared.sceneDisconnected(webView: webView)
        ShellBridge.shared.sceneDisconnected(webView: webView)
        ShellWebView.sceneEnding = true
        window?.isHidden = true
        window = nil
        web = nil
    }

    /// A cold trovo://share (the share extension's open), by the rule ShellBridge.deepLink selects with.
    nonisolated private static func isShare(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "trovo" && url.host?.lowercased() == "share"
    }

    #if DEBUG
    /// StoreProbe's `sceneCycle` (contract 15.3): a reconnect inside the process, which UIKit never makes on an iPhone
    /// (it refuses to destroy the only scene): this scene's teardown, then its connection on the same window scene, with
    /// a new window, a new page and a new observer. Answers the new root's kind.
    func replay(_ windowScene: UIWindowScene) -> String {
        disconnect()
        connect(windowScene, urls: [], activity: nil)
        if #available(iOS 26.0, *), window?.rootViewController is RootTabController { return "tabs" }
        return "classic"
    }

    /// Whether the process's first connection has read -fpOpenURL.
    private static var openURLRead = false

    /// `-fpOpenURL <url>` (contract 9): one more connection URL for the process's first connection, as a cold
    /// trovo://start or trovo://share from the system brings (simctl openurl shows a system confirm). A later connection
    /// of the process (the replay) gets none, as a real one would not.
    private static func debugOpenURL() -> URL? {
        guard !openURLRead else { return nil }
        openURLRead = true
        return ShellFlagScript.Dev.openURL(arguments: ProcessInfo.processInfo.arguments)
    }

    /// `-devTheme <room>`: the first frame's room when it is one of the page's rooms (the page paints that room without
    /// saving it, and ignores any other value).
    private static func devTheme() -> String? {
        ShellFlagScript.Dev(arguments: ProcessInfo.processInfo.arguments).theme.flatMap { StoreAttach.room(fromTheme: Array($0.utf16)) }
    }
    #endif

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for ctx in URLContexts { open(ctx.url) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continueActivity(userActivity)
    }

    private func open(_ url: URL) {
        guard let app = UIApplication.shared.delegate as? AppDelegate else { return }
        _ = app.application(UIApplication.shared, open: url, options: [:])
    }

    private func continueActivity(_ activity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
}
