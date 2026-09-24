import Foundation
import Capacitor
import WatchConnectivity

// Phone side of the Watch bridge, as seen by the web app: it pushes today's
// plan down (updateContext) and drains sessions the watch logged
// (getPendingSessions → kt_sessions on the JS side → clearPendingSessions).
// The WCSession itself lives in WatchSessionHub, started at app launch, so
// the watch is answered even when this plugin (and the web view) never
// loaded — a background wake by the watch connects no scene.
@objc(TrovoWatchPlugin)
public class TrovoWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoWatchPlugin"
    public let jsName = "TrovoWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateContext",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingSessions",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingSessions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPaired",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLiveState",         returnType: CAPPluginReturnPromise),
    ]

    private var hub: WatchSessionHub { WatchSessionHub.shared }

    override public func load() {
        hub.start()   // no-op when AppDelegate already did
        hub.onSessionArrived = { [weak self] in self?.notifyListeners("watchSession", data: [:]) }
        hub.onLive = { [weak self] json in self?.notifyListeners("watchLive", data: ["json": json]) }
        hub.onPlanRequest = { [weak self] in self?.notifyListeners("watchPlanRequest", data: [:]) }
    }

    @objc func isPaired(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { call.resolve(["paired": false]); return }
        let s = WCSession.default
        call.resolve(["paired": s.isPaired, "installed": s.isWatchAppInstalled])
    }

    @objc func updateContext(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("json required"); return }
        // "live" carries the phone runner's in-progress state for mid-session
        // handoff; empty string means no session is running.
        var context: [String: Any] = ["plan": json]
        if let live = call.getString("live"), !live.isEmpty {
            context["live"] = live
        }
        let r = hub.push(context: context)
        if let reason = r.reason { call.resolve(["sent": r.sent, "reason": reason]) }
        else { call.resolve(["sent": r.sent]) }
    }

    @objc func getLiveState(_ call: CAPPluginCall) {
        call.resolve(["json": hub.lastLive ?? ""])
    }

    @objc func getPendingSessions(_ call: CAPPluginCall) {
        call.resolve(["sessions": hub.pendingSessions()])
    }

    @objc func clearPendingSessions(_ call: CAPPluginCall) {
        // Only the sessions the page drained (pages from 20260923-1); an
        // older page passes nothing and clears the whole queue as before.
        hub.clearPending(call.getArray("sessions") as? [String])
        // The wrist-done overlay is NOT cleared here: the drain runs before
        // the debounced summary write, and clearing early flashed the widget
        // back to "Start →". TrovoWidgetPlugin.updateSummary retires overlay
        // dates once the page's summary has been written.
        call.resolve()
    }
}
