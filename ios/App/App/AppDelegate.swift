import UIKit
import Capacitor
import ActivityKit
import CapApp_SPM

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
            totalSets:  totalSets
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

    // MARK: - Capacitor / URL / UserActivity

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
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
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrovoHealthPlugin())
        bridge?.registerPluginInstance(TrovoTimerPlugin())
        bridge?.registerPluginInstance(TrovoSharePlugin())
        bridge?.registerPluginInstance(TrovoWidgetPlugin())
        bridge?.registerPluginInstance(TrovoSpeechPlugin())
    }
}
