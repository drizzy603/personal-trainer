import Foundation
import Capacitor
import WatchConnectivity
import WidgetKit
import os.log

// Debug trace for the watch bridge — `log stream` / Console.app filtered on
// subsystem app.kt.trainer shows every hop. Values are .public: day names and
// set counts, nothing sensitive.
private let wchLog = Logger(subsystem: "app.kt.trainer", category: "watch")

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
        // "live" carries the phone runner's in-progress state for mid-session
        // handoff; empty string means no session is running.
        var context: [String: Any] = ["plan": json]
        if let live = call.getString("live"), !live.isEmpty {
            context["live"] = live
        }
        // Cache BEFORE any bail-out: the watch's pull-refresh and the
        // activation-complete flush both serve from here, and the JS side
        // dedups — a payload dropped now would never be resent.
        UserDefaults.standard.set(context, forKey: Self.contextKey)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            wchLog.info("push deferred — session not activated yet (flushed on activation)")
            call.resolve(["sent": false, "reason": "session not activated"]); return
        }
        var sent = false
        do {
            try WCSession.default.updateApplicationContext(context)
            sent = true
        } catch {
            wchLog.error("updateApplicationContext failed: \(error.localizedDescription, privacy: .public)")
        }
        // applicationContext delivery is "eventual" — when the watch app is
        // frontmost, mirror the payload over the instant message channel too.
        let reachable = WCSession.default.isReachable
        if reachable {
            WCSession.default.sendMessage(context, replyHandler: nil, errorHandler: { err in
                wchLog.error("context sendMessage failed: \(err.localizedDescription, privacy: .public)")
            })
            sent = true
        }
        wchLog.info("push context (live: \(context["live"] != nil), reachable: \(reachable)) → sent \(sent)")
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
        // The wrist-done overlay is NOT cleared here: the drain runs before
        // the debounced summary write, and clearing early flashed the widget
        // back to "Start →". TrovoWidgetPlugin.updateSummary retires overlay
        // dates once the summary actually carries them as done.
        call.resolve()
    }

    // ── WCSessionDelegate ────────────────────────────────────────────────────

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Flush the cached context — a web push that raced activation would
        // otherwise be lost for good (the JS side dedups and won't resend).
        guard activationState == .activated,
              let cached = UserDefaults.standard.dictionary(forKey: Self.contextKey), !cached.isEmpty else { return }
        do {
            try session.updateApplicationContext(cached)
            wchLog.info("activation complete → cached context flushed")
        } catch {
            wchLog.error("activation flush failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let json = userInfo["session"] as? String else { return }
        wchLog.info("finished session arrived from watch")
        DispatchQueue.main.async {
            var arr = UserDefaults.standard.stringArray(forKey: Self.pendingKey) ?? []
            arr.append(json)
            UserDefaults.standard.set(arr, forKey: Self.pendingKey)
            // The Home Screen widget said "Start →" all day after a wrist
            // finish: pending sessions live in standard defaults where the
            // widget extension can't see them. Mirror just the DATE into the
            // App Group so lift days flip to done immediately.
            if let data = json.data(using: .utf8),
               let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
               let loggedAt = obj["loggedAt"] as? String {
                let iso = ISO8601DateFormatter()
                iso.formatOptions = [.withInternetDateTime]
                if let d = iso.date(from: loggedAt),
                   let shared = UserDefaults(suiteName: "group.app.kt.trainer") {
                    let fmt = DateFormatter()
                    // POSIX pin: device Buddhist/Japanese calendars would emit
                    // years that never match the JS-side Gregorian dates.
                    fmt.locale = Locale(identifier: "en_US_POSIX")
                    fmt.dateFormat = "yyyy-MM-dd"
                    var done = shared.stringArray(forKey: "pendingWatchDone") ?? []
                    let day = fmt.string(from: d)
                    if !done.contains(day) {
                        done.append(day)
                        shared.set(done, forKey: "pendingWatchDone")
                    }
                    if #available(iOS 14.0, *) {
                        WidgetCenter.shared.reloadTimelines(ofKind: "SuperoTodayWidget")
                    }
                }
            }
            // Nudge the web layer if it's live right now.
            self.notifyListeners("watchSession", data: [:])
        }
    }

    // Watch pull-refresh: reply with the cached plan/live context. Served
    // natively so it works even when the web layer isn't loaded yet.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if message["req"] as? String == "plan" {
            let cached = UserDefaults.standard.dictionary(forKey: Self.contextKey) ?? [:]
            wchLog.info("watch pulled plan → replying (cached: \(!cached.isEmpty))")
            replyHandler(cached)
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
        wchLog.info("wrist live state received (\(json.count) bytes)")
        lastLive = json
        DispatchQueue.main.async {
            self.notifyListeners("watchLive", data: ["json": json])
        }
    }
}
