import Foundation
import WatchConnectivity
import WidgetKit
import os.log

private let hubLog = Logger(subsystem: "app.kt.trainer", category: "watch")

// Owns the phone's WCSession from app launch. The session used to be
// activated by TrovoWatchPlugin.load(), which only runs once the storyboard
// view controller has created its web view — and under the UIScene lifecycle
// a launch caused by the watch (sendMessage / transferUserInfo waking the app
// in the background) connects no scene, so the plugin never loaded, the
// watch's plan request went unanswered and a finished session had nowhere to
// land. Everything here works without the web layer: the cached context
// answers the watch, finished sessions queue in UserDefaults, and the plugin
// (when the page is up) just attaches listeners.
public final class WatchSessionHub: NSObject, WCSessionDelegate {
    public static let shared = WatchSessionHub()

    static let pendingKey = "pendingWatchSessions"
    static let contextKey = "lastWatchContext"

    // Latest in-progress state from the wrist runner (raw JSON). In-memory
    // only — the watch re-pushes on every set, and the finished session still
    // arrives through the guaranteed pending queue.
    private(set) var lastLive: String?
    private var started = false

    // Set by TrovoWatchPlugin while the web layer is loaded.
    var onSessionArrived: (() -> Void)?
    var onLive: ((String) -> Void)?
    var onPlanRequest: (() -> Void)?

    // Idempotent: AppDelegate calls it at launch, the plugin again on load.
    public func start() {
        guard !started, WCSession.isSupported() else { return }
        started = true
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // ── Used by the plugin ───────────────────────────────────────────────────

    func push(context: [String: Any]) -> (sent: Bool, reason: String?) {
        // Cache BEFORE any bail-out: the watch's pull-refresh and the
        // activation-complete flush both serve from here, and the JS side
        // dedups — a payload dropped now would never be resent.
        UserDefaults.standard.set(context, forKey: Self.contextKey)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            hubLog.info("push deferred — session not activated yet (flushed on activation)")
            return (false, "session not activated")
        }
        var sent = false
        do {
            try WCSession.default.updateApplicationContext(context)
            sent = true
        } catch {
            hubLog.error("updateApplicationContext failed: \(error.localizedDescription, privacy: .public)")
        }
        // applicationContext delivery is "eventual" — when the watch app is
        // frontmost, mirror the payload over the instant message channel too.
        let reachable = WCSession.default.isReachable
        if reachable {
            WCSession.default.sendMessage(context, replyHandler: nil, errorHandler: { err in
                hubLog.error("context sendMessage failed: \(err.localizedDescription, privacy: .public)")
            })
            sent = true
        }
        hubLog.info("push context (live: \(context["live"] != nil), reachable: \(reachable)) → sent \(sent)")
        return (sent, nil)
    }

    func pendingSessions() -> [String] {
        UserDefaults.standard.stringArray(forKey: Self.pendingKey) ?? []
    }

    // Removes only what the page drained. A blanket clear used to delete a
    // session that arrived between getPendingSessions and the clear — the
    // watch had already shown "Synced to iPhone", so the workout was gone.
    // Pages before 20260923-1 pass nothing: clear all, as before.
    func clearPending(_ drained: [String]?) {
        if let drained = drained {
            var arr = pendingSessions()
            let n = arr.count
            for d in drained {
                if let i = arr.firstIndex(of: d) { arr.remove(at: i) }
            }
            if arr.isEmpty { UserDefaults.standard.removeObject(forKey: Self.pendingKey) }
            else { UserDefaults.standard.set(arr, forKey: Self.pendingKey) }
            hubLog.info("pending queue: \(n) → \(arr.count) after draining \(drained.count)")
        } else {
            UserDefaults.standard.removeObject(forKey: Self.pendingKey)
        }
        // The drained sessions supersede any live snapshot still cached here.
        lastLive = nil
    }

    // ── WCSessionDelegate ────────────────────────────────────────────────────

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Flush the cached context — a web push that raced activation would
        // otherwise be lost for good (the JS side dedups and won't resend).
        guard activationState == .activated,
              let cached = UserDefaults.standard.dictionary(forKey: Self.contextKey), !cached.isEmpty else { return }
        do {
            try session.updateApplicationContext(cached)
            hubLog.info("activation complete → cached context flushed")
        } catch {
            hubLog.error("activation flush failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let json = userInfo["session"] as? String else { return }
        hubLog.info("finished session arrived from watch")
        DispatchQueue.main.async {
            // A finished session makes the in-progress snapshot stale: the web
            // layer's boot pull otherwise resurrected a "live" wrist banner
            // for a workout that ended hours ago.
            self.lastLive = nil
            var arr = UserDefaults.standard.stringArray(forKey: Self.pendingKey) ?? []
            arr.append(json)
            UserDefaults.standard.set(arr, forKey: Self.pendingKey)
            // The Home Screen widget said "Start →" all day after a wrist
            // finish: pending sessions live in standard defaults where the
            // widget extension can't see them. Mirror just the DATE into the
            // App Group so lift days flip to done immediately. The date is the
            // session's START — the page files it that way too, so a session
            // finished after midnight no longer marks the new day done.
            if let data = json.data(using: .utf8),
               let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
               let stamp = (obj["startedAt"] as? String) ?? (obj["loggedAt"] as? String) {
                let iso = ISO8601DateFormatter()
                iso.formatOptions = [.withInternetDateTime]
                if let d = iso.date(from: stamp),
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
            self.onSessionArrived?()
        }
    }

    // Watch pull-refresh: reply with the cached plan/live context. Served
    // natively so it works even when the web layer isn't loaded yet.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if message["req"] as? String == "plan" {
            let cached = UserDefaults.standard.dictionary(forKey: Self.contextKey) ?? [:]
            hubLog.info("watch pulled plan → replying (cached: \(!cached.isEmpty))")
            replyHandler(cached)
            // The cache is whatever the web layer last pushed — possibly
            // yesterday's plan. Ask it to recompute and push a fresh one.
            DispatchQueue.main.async { self.onPlanRequest?() }
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
        hubLog.info("wrist live state received (\(json.count) bytes)")
        // An 'ended' payload is a one-shot signal, not state to replay later.
        lastLive = json.contains("\"ended\":true") ? nil : json
        DispatchQueue.main.async {
            self.onLive?(json)
        }
    }
}
