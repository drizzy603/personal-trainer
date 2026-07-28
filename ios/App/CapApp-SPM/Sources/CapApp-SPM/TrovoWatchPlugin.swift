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
        CAPPluginMethod(name: "getLiveState",         returnType: CAPPluginReturnPromise),
    ]

    private static let pendingKey = "pendingWatchSessions"
    private static let contextKey = "lastWatchContext"
    // Latest in-progress state from the wrist runner (raw JSON). In-memory
    // only — the watch re-pushes on every set, and the finished session still
    // arrives through the guaranteed pending queue.
    private var lastLive: String?

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
        // "live" carries the phone runner's in-progress state for mid-session
        // handoff; empty string means no session is running.
        var context: [String: Any] = ["plan": json]
        if let live = call.getString("live"), !live.isEmpty {
            context["live"] = live
        }
        // Cache natively so the watch's pull-refresh can be answered even
        // before the web layer has booted (WCSession wakes this app in the
        // background to serve the reply).
        UserDefaults.standard.set(context, forKey: Self.contextKey)
        var sent = false
        do {
            try WCSession.default.updateApplicationContext(context)
            sent = true
        } catch {}
        // applicationContext delivery is "eventual" — when the watch app is
        // frontmost, mirror the payload over the instant message channel too.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(context, replyHandler: nil, errorHandler: nil)
            sent = true
        }
        call.resolve(["sent": sent])
    }

    @objc func getLiveState(_ call: CAPPluginCall) {
        call.resolve(["json": lastLive ?? ""])
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

    // Watch pull-refresh: reply with the cached plan/live context. Served
    // natively so it works even when the web layer isn't loaded yet.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if message["req"] as? String == "plan" {
            replyHandler(UserDefaults.standard.dictionary(forKey: Self.contextKey) ?? [:])
            return
        }
        handleLive(message)
        replyHandler([:])
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleLive(message)
    }

    // Per-set state from the wrist runner — cached for the web layer's boot
    // pull and forwarded live so Today can mirror the watch in real time.
    private func handleLive(_ message: [String: Any]) {
        guard let json = message["wlive"] as? String else { return }
        lastLive = json
        DispatchQueue.main.async {
            self.notifyListeners("watchLive", data: ["json": json])
        }
    }
}
