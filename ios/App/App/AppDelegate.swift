import UIKit
import Capacitor
import ActivityKit
import CapApp_SPM
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

        let attrs = TrovoTimerAttributes(exerciseName: exerciseName)
        let state = TrovoTimerAttributes.ContentState(
            endDate:    Date().addingTimeInterval(TimeInterval(seconds)),
            nextSet:    nextSet,
            totalSets:  totalSets,
            detail:     info["detail"] as? String
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
    // names SceneDelegate and the Main storyboard, so the scene instantiates
    // SuperoViewController itself; this only hands back the named config.
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // MARK: - Capacitor / URL / UserActivity

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if url.scheme == "trovo" {
            // Widget / complication deep link. Parked for a cold start (the page
            // reads it through TrovoWidget.consumeDeepLink) and pushed live when
            // the page is already up (SuperoViewController listens).
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
// registered programmatically. Main.storyboard's view controller points here.
class SuperoViewController: CAPBridgeViewController {
    // Live-page updates (TrovoOtaPlugin): a staged newer index.html + the
    // bundled web folder live in Application Support; serve it when its
    // build beats the bundle's, otherwise the bundle. See TrovoOta.
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let live = TrovoOta.launchLocation() {
            descriptor.appLocation = live
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        NotificationCenter.default.addObserver(forName: .trovoDeepLink, object: nil, queue: .main) { [weak self] note in
            guard let url = note.userInfo?["url"] as? String else { return }
            let safe = url.replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "\\", with: "")
            self?.webView?.evaluateJavaScript("window._trovoOpen && window._trovoOpen('\(safe)')", completionHandler: nil)
        }
        bridge?.registerPluginInstance(TrovoOtaPlugin())
        bridge?.registerPluginInstance(TrovoHealthPlugin())
        bridge?.registerPluginInstance(TrovoTimerPlugin())
        bridge?.registerPluginInstance(TrovoSharePlugin())
        bridge?.registerPluginInstance(TrovoWidgetPlugin())
        bridge?.registerPluginInstance(TrovoWatchPlugin())
        bridge?.registerPluginInstance(TrovoIconPlugin())
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

// URL opens and user activities arrive on the scene under the UIScene
// lifecycle; forward them to the same handlers (Capacitor's proxy, the
// trovo:// deep link) the app delegate used before.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        for ctx in connectionOptions.urlContexts { open(ctx.url) }
        if let activity = connectionOptions.userActivities.first { continueActivity(activity) }
    }

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
