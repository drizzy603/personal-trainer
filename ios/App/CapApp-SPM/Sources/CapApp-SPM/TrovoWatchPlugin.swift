import Foundation
import Capacitor
import WatchConnectivity

// Phone side of the Watch bridge. The web app pushes today's plan down
// (updateContext) and drains sessions the watch logged (getPendingSessions →
// kt_sessions on the JS side → clearPendingSessions).
@objc(TrovoWatchPlugin)
public class TrovoWatchPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "TrovoWatchPlugin"
    public let jsName = "TrovoWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateContext",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingSessions",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingSessions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPaired",             returnType: CAPPluginReturnPromise),
    ]

    private static let pendingKey = "pendingWatchSessions"

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @objc func isPaired(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { call.resolve(["paired": false]); return }
        let s = WCSession.default
        call.resolve(["paired": s.isPaired, "installed": s.isWatchAppInstalled])
    }

    @objc func updateContext(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("json required"); return }
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            call.resolve(["sent": false]); return
        }
        do {
            try WCSession.default.updateApplicationContext(["plan": json])
            call.resolve(["sent": true])
        } catch {
            call.resolve(["sent": false, "reason": error.localizedDescription])
        }
    }

    @objc func getPendingSessions(_ call: CAPPluginCall) {
        let arr = UserDefaults.standard.stringArray(forKey: Self.pendingKey) ?? []
        call.resolve(["sessions": arr])
    }

    @objc func clearPendingSessions(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: Self.pendingKey)
        call.resolve()
    }

    // ── WCSessionDelegate ────────────────────────────────────────────────────

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let json = userInfo["session"] as? String else { return }
        DispatchQueue.main.async {
            var arr = UserDefaults.standard.stringArray(forKey: Self.pendingKey) ?? []
            arr.append(json)
            UserDefaults.standard.set(arr, forKey: Self.pendingKey)
            // Nudge the web layer if it's live right now.
            self.notifyListeners("watchSession", data: [:])
        }
    }
}
