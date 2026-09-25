import SwiftUI
import WatchConnectivity
import WatchKit
import HealthKit
import WidgetKit
import os.log

// Debug trace mirroring the phone plugin's — Console.app on the paired watch
// filtered on subsystem app.kt.trainer shows both sides of every hop.
private let wchLog = Logger(subsystem: "app.kt.trainer", category: "watch")

// Supero Watch — run today's session from the wrist. The iPhone pushes the
// day's plan via WatchConnectivity applicationContext; logged sessions go
// back with transferUserInfo (queued, guaranteed) and the phone app folds
// them into the training log on next open.

// MARK: - Theme (mirrors the phone's room)
// The phone sends its room tokens with every plan; the wrist paints actions in
// the accent (Heavyweight's blue, the green room's lime) and earned states in
// the earned colour. The base stays black: watchOS draws the clock in white
// and never flips to a light scheme, so paper would be unreadable here.
struct WatchTheme: Codable, Equatable {
    var room: String?
    var paper: Bool?
    var bg: String?
    var card: String?
    var card2: String?
    var text: String?
    var muted: String?
    var accent: String?
    var onAccent: String?
    var earned: String?
    var earnedInk: String?
    var red: String?
    // The Lime room's tokens as the page sends them (THEMES.dark since 2026-09-23): shown only
    // until the first themed plan arrives.
    static let lime = WatchTheme(room: "dark", paper: false, bg: "#0b0b0c", card: "#151517", card2: "#1e1e21",
                                 text: "#f4f4f1", muted: "#8c8c91", accent: "#d8ff63", onAccent: "#0b0b0c",
                                 earned: "#d8ff63", earnedInk: "#d8ff63", red: "#ff5d55")
    var isPaper: Bool { paper == true }
    var accentColor: Color { Color(hex: accent) ?? Color(red: 0.78, green: 1.0, blue: 0.0) }
    var earnedColor: Color { Color(hex: earned) ?? accentColor }
    var onAccentColor: Color { Color(hex: onAccent) ?? .black }
}
extension Color {
    init?(hex: String?) {
        guard var h = hex?.trimmingCharacters(in: .whitespaces), !h.isEmpty else { return nil }
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()
    @Published var theme: WatchTheme = .lime
    @Published var unit: String = "lb"   // the phone's display unit for weights ("lb" | "kg")
}
// `lime` keeps its name as the ACTION colour every view already uses.
private var lime: Color { ThemeStore.shared.theme.accentColor }
private var earned: Color { ThemeStore.shared.theme.earnedColor }
private var onAccent: Color { ThemeStore.shared.theme.onAccentColor }

// The plan payload's yyyy-MM-dd is Gregorian (JS todayISO) — pin the
// comparison formatter so Buddhist/Japanese device calendars can't make
// every plan read stale (or never stale). nil date = legacy cache, trusted.
private func planIsStale(_ plan: WatchPlan) -> Bool {
    // A plan with no date was cached by an older build — it cannot be
    // vouched for, so it is stale until a dated plan arrives.
    guard let d = plan.date else { return true }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return d != f.string(from: Date())
}

// Sets from a session that was never finished: say when it was, offer to
// drop it; the Finish button below sends it (the phone files it by its start).
private struct UnfinishedRow: View {
    @ObservedObject var runner: Runner
    var body: some View {
        HStack {
            Text("UNFINISHED · \(runner.startedLabel.uppercased())")
                .font(.system(size: 10, weight: .heavy, design: .monospaced))
                .foregroundColor(.orange)
            Spacer()
            Button { runner.reset(); WorkoutManager.shared.end() } label: {
                Text("Discard").font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
    }
}

// Orange "plan is old" row — tap pulls a fresh plan from the phone.
private struct StalePlanRow: View {
    let date: String?
    var body: some View {
        Button { Connectivity.shared.requestRefresh() } label: {
            HStack {
                Text("PLAN FROM \(date ?? "?") — SYNC")
                    .font(.system(size: 10, weight: .heavy, design: .monospaced))
                    .foregroundColor(.orange)
                Spacer()
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.orange)
            }
        }
    }
}

// Weights step in 2.5 lb — show the half only when it's there (145, 147.5).
private func fmtWeight(_ v: Double) -> String {
    guard v.isFinite, v.magnitude < 1e9 else { return v.isFinite ? String(format: "%.0f", v) : "0" }
    return v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(format: "%.1f", v)
}

// Weights live in lb on the wrist, as on the phone. A kg user sees and types kg, converted
// exactly as the page does it (wDisp rounds to 0.5 kg, wStore to 0.1 lb, wStepLb is 1.25 kg).
private let lbPerKg = 2.2046226218
private var isKg: Bool { ThemeStore.shared.unit == "kg" }
private var unitLabel: String { isKg ? "kg" : "lb" }
private func dispWeight(_ lb: Double) -> Double { isKg ? (lb / lbPerKg * 2).rounded() / 2 : lb }
private func fmtW(_ lb: Double) -> String { fmtWeight(dispWeight(lb)) }
private func storeWeight(_ typed: Double) -> Double { isKg ? (typed * lbPerKg * 10).rounded() / 10 : typed }
private var weightStepLb: Double { isKg ? 1.25 * lbPerKg : 2.5 }
private var weightStepLabel: String { isKg ? "1.25" : "2.5" }
// In kg, step in kg and store exactly as a typed kg value is stored, so one shown load
// is always one stored number (a stepped 102.5 kg was 226.02 lb, a typed one 226.0,
// which the phone counted as a new record).
private func stepWeight(_ lb: Double, by delta: Double) -> Double {
    if isKg {
        let kg = ((lb / lbPerKg + (delta > 0 ? 1.25 : -1.25)) * 4).rounded() / 4
        return max(0, storeWeight(max(0, kg)))
    }
    return max(0, ((lb + delta) * 100).rounded() / 100)
}

// MARK: - Plan model (mirrors the JSON the web app sends)

struct WatchExercise: Codable, Identifiable, Hashable {
    let name: String
    let sets: Int
    let reps: Int
    let weight: Double
    let rest: Int?              // seconds — phone resolves per-exercise/default
    let rpe: Int?               // target RPE from the programme (0/nil = none)
    var id: String { name }
}

struct WatchPlan: Codable, Equatable {
    let week: Int
    let date: String?           // yyyy-MM-dd the phone built this plan for
    let dayName: String
    let type: String            // "lift" | "run" | "sport" | "rest" | "none"
    let exercises: [WatchExercise]
    let hasPlan: Bool?          // false: the phone has no programme yet (older phones omit it)
    let theme: WatchTheme?      // the phone's room tokens (older phones omit it → lime on black)
    let slot: String?           // the day's slot id ("Push"); dayName is whatever the user named it (pages before 20260922 omit it)
    let short: String?          // dayName fitted to a complication ("C+B")
    var unit: String? = nil     // display unit for weights, "lb" | "kg" (pages before 20260924-7 omit it)

    func with(exercises: [WatchExercise]) -> WatchPlan {
        WatchPlan(week: week, date: date, dayName: dayName, type: type, exercises: exercises,
                  hasPlan: hasPlan, theme: theme, slot: slot, short: short, unit: unit)
    }
}

// Same training day? Slot ids when both carry one, else the display names.
func samePlan(_ a: WatchPlan, _ b: WatchPlan) -> Bool {
    if let x = a.slot, let y = b.slot, !x.isEmpty, !y.isEmpty { return x == y }
    return a.dayName == b.dayName
}

// Is this live payload about the session the wrist is showing? Compare slot
// ids when both sides carry one: the display name is the user's and can change
// between a plan push and a live update (a rename mid-session broke the mirror
// on 2026-09-22). Older phones send names only — fall back to those.
func sameSession(_ live: LiveSession, _ plan: WatchPlan) -> Bool {
    if let a = live.slot, let b = plan.slot, !a.isEmpty, !b.isEmpty { return a == b }
    return live.dayName == plan.dayName
}

// In-progress phone runner state — merged live into the wrist runner.
struct LiveSession: Codable, Equatable {
    let dayName: String
    let slot: String?           // slot id when the phone sends one
    let startedAt: Double       // ms since epoch
    let reps: [String: [Int]]
    let weights: [String: Double]
    let ended: Bool?            // phone finished/closed the session
    let endedAt: Double?        // ms; when the phone finished (pages from 20260922-6)
    let discarded: Bool?        // the phone threw the session away: drop the wrist's copy too
    let own: [String: Double]?  // exercise → ms of an undo/edit on the phone: its log is the truth
    let wlog: [String: [Double]]?  // per-set weights, so finishing here keeps a top-set/back-off day
    let rlog: [String: [Int]]?     // per-set RPE (pages from 20260923-4)
    let lastAt: Double?         // ms of the phone's last set/edit (pages from 20260923-1); a draft resumed hours later is still live
    var setsDone: Int { reps.values.reduce(0) { $0 + $1.count } }
    var isFresh: Bool { Date().timeIntervalSince1970 - max(startedAt, lastAt ?? 0) / 1000 < 6 * 3600 }
}

// MARK: - Connectivity

final class Connectivity: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = Connectivity()
    @Published var plan: WatchPlan? = nil
    @Published var live: LiveSession? = nil
    // Finished sessions still queued in WatchConnectivity. "Synced" used to
    // show the instant transferUserInfo was CALLED — with the phone out of
    // range for a day the session hadn't gone anywhere yet.
    @Published var pendingUploads = 0
    // The phone mirrors pushes over context + message, so the same payload
    // often lands twice — skip the repeat (WidgetCenter reloads are budgeted).
    private var lastIngestSig = ""
    // The next days' plans (pages from 20260923-5). When a new day starts and
    // the phone app has not run, the wrist rolls over to that day's plan by
    // itself instead of showing yesterday's session as stale.
    private(set) var weekPlans: [WatchPlan] = []

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: "lastPlan"),
           let p = try? JSONDecoder().decode(WatchPlan.self, from: data) {
            plan = p
            ThemeStore.shared.theme = p.theme ?? .lime
            ThemeStore.shared.unit = p.unit ?? "lb"
        }
        if let wd = UserDefaults.standard.data(forKey: "weekPlans"),
           let wk = try? JSONDecoder().decode([WatchPlan].self, from: wd) {
            weekPlans = wk
        }
        rolloverIfNeeded()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func ingest(_ context: [String: Any]) {
        guard let json = context["plan"] as? String,
              let data = json.data(using: .utf8),
              let p = try? JSONDecoder().decode(WatchPlan.self, from: data) else {
            if !context.isEmpty { wchLog.error("ingest: payload had no decodable plan") }
            return
        }
        let weekJson = (context["week"] as? String) ?? ""
        let sig = json + "|" + ((context["live"] as? String) ?? "") + "|" + weekJson
        if sig == lastIngestSig { return }
        lastIngestSig = sig
        wchLog.info("ingest: plan \(p.dayName, privacy: .public)/\(p.type, privacy: .public) wk\(p.week) (live: \(context["live"] != nil))")
        var liveSession: LiveSession? = nil
        if let lj = context["live"] as? String, !lj.isEmpty,
           let ld = lj.data(using: .utf8),
           let l = try? JSONDecoder().decode(LiveSession.self, from: ld) {
            liveSession = l
        }
        var week: [WatchPlan]? = nil
        if !weekJson.isEmpty, let wd = weekJson.data(using: .utf8) {
            week = try? JSONDecoder().decode([WatchPlan].self, from: wd)
        }
        DispatchQueue.main.async {
            ThemeStore.shared.theme = p.theme ?? .lime
            ThemeStore.shared.unit = p.unit ?? "lb"
            self.plan = p
            self.live = liveSession
            UserDefaults.standard.set(data, forKey: "lastPlan")
            if let week = week {
                self.weekPlans = week
                if let wd = try? JSONEncoder().encode(week) { UserDefaults.standard.set(wd, forKey: "weekPlans") }
            } else if p.hasPlan == false {
                // No programme on the phone: no week ahead either (a page that sent '' left the old one).
                self.weekPlans = []
                UserDefaults.standard.removeObject(forKey: "weekPlans")
            }
            self.mirrorToFace(p)
            // A cold launch replays the last applicationContext, which can be yesterday's: roll
            // straight back to today from the stored week (a same-day push is left alone).
            self.rolloverIfNeeded()
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    // Today's plan from the stored week, when the one on the wrist is from
    // another day. Keeps the room's theme (week entries omit it). Called at
    // launch and every time the wrist is raised.
    func rolloverIfNeeded() {
        guard let cur = plan, planIsStale(cur) else { return }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let today = f.string(from: Date())
        guard let next = weekPlans.first(where: { $0.date == today }) else { return }
        let p = WatchPlan(week: next.week, date: next.date, dayName: next.dayName, type: next.type,
                          exercises: next.exercises, hasPlan: next.hasPlan, theme: next.theme ?? cur.theme,
                          slot: next.slot, short: next.short, unit: next.unit ?? cur.unit)
        wchLog.info("rollover: \(cur.date ?? "?", privacy: .public) → \(today, privacy: .public) \(p.dayName, privacy: .public)")
        plan = p
        if let data = try? JSONEncoder().encode(p) { UserDefaults.standard.set(data, forKey: "lastPlan") }
        mirrorToFace(p)
        WidgetCenter.shared.reloadAllTimelines()
    }

    // Mirror into the App Group for the watch-face complication: today's plan
    // and the days after it, so the face changes day at midnight by itself.
    private func mirrorToFace(_ p: WatchPlan) {
        if let shared = UserDefaults(suiteName: "group.app.kt.trainer") {
            // No programme: the face falls to its 'Open to sync' state
            // instead of 'No plan day' with the default cadence's glyph.
            let faceDay = (p.hasPlan == false || p.type == "none") ? "" : p.dayName
            shared.set(faceDay, forKey: "watchPlanDay")
            shared.set(faceDay.isEmpty ? "" : (p.short ?? p.dayName), forKey: "watchPlanShort")
            shared.set(p.type, forKey: "watchPlanType")
            shared.set(p.week, forKey: "watchPlanWeek")
            // The face shows this plan only on the day it was built for.
            if let d = p.date { shared.set(d, forKey: "watchPlanDate") } else { shared.removeObject(forKey: "watchPlanDate") }
            // The complication follows the phone's theme too.
            let t = p.theme ?? ThemeStore.shared.theme
            shared.set(t.accent, forKey: "watchThemeAccent")
            shared.set(t.earned, forKey: "watchThemeEarned")
            let days: [[String: Any]] = weekPlans.compactMap { d in
                guard let date = d.date else { return nil }
                let none = d.hasPlan == false || d.type == "none"
                return ["date": date, "day": none ? "" : d.dayName,
                        "short": none ? "" : (d.short ?? d.dayName), "type": d.type, "week": d.week]
            }
            if let jd = try? JSONSerialization.data(withJSONObject: days), let js = String(data: jd, encoding: .utf8) {
                shared.set(js, forKey: "watchWeek")
            }
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        wchLog.info("session activated (state: \(state.rawValue))")
        ingest(session.receivedApplicationContext)
        refreshPendingUploads()
        requestRefresh()
    }
    func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        if let e = error { wchLog.error("session transfer failed: \(e.localizedDescription, privacy: .public)") }
        else { wchLog.info("session transfer delivered to phone") }
        refreshPendingUploads()
    }
    private func refreshPendingUploads() {
        let n = WCSession.default.outstandingUserInfoTransfers.count
        DispatchQueue.main.async { self.pendingUploads = n }
    }
    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        ingest(context)
    }
    // Instant channel — the phone mirrors plan/live over sendMessage whenever
    // this app is frontmost, so changes land immediately instead of whenever
    // applicationContext feels like delivering.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        ingest(message)
    }
    // The phone came back into range: pull whatever changed while apart.
    // applicationContext is eventual; this is the instant path.
    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable { requestRefresh() }
    }

    // Pull the latest plan from the phone. sendMessage wakes the iOS app in
    // the background and its plugin replies from a native cache — the user no
    // longer has to open Supero on the phone first. Called on activation,
    // scene foreground, and the manual retry on the empty screen.
    func requestRefresh() {
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else {
            wchLog.info("refresh skipped (activated: \(s.activationState == .activated), reachable: \(s.isReachable))")
            return
        }
        wchLog.info("refresh: pulling plan from phone")
        s.sendMessage(["req": "plan"], replyHandler: { [weak self] reply in
            wchLog.info("refresh: reply received (\(reply.count) keys)")
            self?.ingest(reply)
        }, errorHandler: { err in
            wchLog.error("refresh failed: \(err.localizedDescription, privacy: .public)")
        })
    }

    // Best-effort real-time mirror of the wrist runner for the phone's Today
    // screen. Fire-and-forget; the finished session still goes through the
    // guaranteed transferUserInfo queue.
    func sendLive(_ json: String) {
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else {
            wchLog.info("live push skipped (phone unreachable)")
            return
        }
        s.sendMessage(["wlive": json], replyHandler: nil, errorHandler: { err in
            wchLog.error("live push failed: \(err.localizedDescription, privacy: .public)")
        })
    }

    func sendSession(dayName: String, slot: String? = nil, exercises: [[String: Any]], startedAt: Double = 0) {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        var payload: [String: Any] = [
            "dayName": dayName,
            "loggedAt": iso.string(from: Date()),
            "exercises": exercises,
        ]
        // The slot survives a rename the phone made while this session was on
        // the wrist; the name alone would file it under a day that no longer exists.
        if let slot = slot, !slot.isEmpty { payload["slot"] = slot }
        // The phone dates the ledger row by START — a session that crosses
        // midnight belongs to the evening it began.
        if startedAt > 0 { payload["startedAt"] = iso.string(from: Date(timeIntervalSince1970: startedAt / 1000)) }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        WCSession.default.transferUserInfo(["session": json])
        refreshPendingUploads()
    }
}

// MARK: - Workout session (live HR, ring credit, real Health workout)

// Runs an HKWorkoutSession around the wrist runner: starts when the first set
// is logged, streams heart rate into the UI, and finishes into Health as a
// strength workout (which credits the Activity rings). The phone never
// re-imports these — its isOwnWorkout guard covers the whole bundle family.
final class WorkoutManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    static let shared = WorkoutManager()
    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    @Published var heartRate: Int = 0
    @Published var active = false
    // No set for 90 minutes means the runner was abandoned mid-gym — end the
    // Health workout so a forgotten wrist session never writes a 6-hour lift
    // (and stops draining the battery keeping the sensors up).
    private var idleTimer: Timer?
    static let idleLimit: TimeInterval = 90 * 60
    // One Health prompt per launch: a dismissed dialog leaves the status
    // .notDetermined, and start() → ask → start() used to go round again.
    private var authAsked = false
    func touch() {
        idleTimer?.invalidate(); idleTimer = nil
        guard session != nil else { return }
        idleTimer = Timer.scheduledTimer(withTimeInterval: Self.idleLimit, repeats: false) { [weak self] _ in
            self?.end()
        }
    }

    func requestAuth(_ completion: (() -> Void)? = nil) {
        guard HKHealthStore.isHealthDataAvailable() else { completion?(); return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        var read: Set<HKObjectType> = []
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { read.insert(hr) }
        if let en = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { read.insert(en) }
        store.requestAuthorization(toShare: share, read: read) { _, _ in completion?() }
    }

    func start() {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return }
        // watchOS allows one live workout — starting ours would end a workout
        // already running in another app (e.g. Apple's Workout app). The
        // toggle in PlanView lets users who track elsewhere opt out.
        guard UserDefaults.standard.object(forKey: "autoWorkout") as? Bool ?? true else { return }
        // First workout on this watch: the Health dialog appears now, over the
        // set the user is about to log — not on a cold launch with no context.
        if store.authorizationStatus(for: HKObjectType.workoutType()) == .notDetermined {
            guard !authAsked else { return }
            authAsked = true
            requestAuth { [weak self] in DispatchQueue.main.async { self?.start() } }
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            let startDate = Date()
            s.startActivity(with: startDate)
            b.beginCollection(withStart: startDate) { _, _ in }
            DispatchQueue.main.async { self.active = true; self.touch() }
        } catch {
            // Health unavailable (auth denied, etc.) — the runner works without it.
        }
    }

    func end() {
        idleTimer?.invalidate(); idleTimer = nil
        guard let s = session, let b = builder else { return }
        session = nil
        builder = nil
        s.end()
        b.endCollection(withEnd: Date()) { _, _ in
            b.finishWorkout { _, _ in }
        }
        DispatchQueue.main.async { self.active = false; self.heartRate = 0 }
    }

    // MARK: HKWorkoutSessionDelegate
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { self.active = false }
        session = nil
        builder = nil
    }

    // MARK: HKLiveWorkoutBuilderDelegate
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(hrType),
              let stats = workoutBuilder.statistics(for: hrType),
              let bpm = stats.mostRecentQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        else { return }
        DispatchQueue.main.async { self.heartRate = Int(bpm.rounded()) }
    }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}

// MARK: - Runner state

final class Runner: ObservableObject {
    // Every mutation persists (didSet) — watchOS quietly terminates the app
    // mid-workout (long rest, wrist down, phone call) and a 40-minute session
    // used to come back as an empty runner. Restored in init() when < 6h old.
    @Published var repsDone: [String: [Int]] = [:] { didSet { persist() } }     // exercise → logged reps per set
    @Published var weights: [String: Double] = [:] { didSet { persist() } }
    // Per-set weight, so a top-set/back-off day reaches the phone ledger as
    // what was actually lifted, not one number for the whole exercise.
    @Published var weightLog: [String: [Double]] = [:] { didSet { persist() } }
    @Published var resting = false
    @Published var restLeft = 90
    @Published var synced = false
    // Wall-clock deadline: the 1s Timer suspends whenever the app loses
    // background runtime (workout tracking off / HK denied), freezing the
    // old tick-counted clock. Wrist-raise now derives from this date.
    @Published var restEndsAt: Date? = nil
    // Chosen RPE per exercise — without it, drained wrist sessions carried
    // rpe:'' and could never earn the +5 lb progression banner. Now only the
    // stepper's starting value; the record is rpeLog.
    var rpes: [String: Int] = [:] { didSet { persist() } }
    // RPE per logged set, parallel to repsDone. One number per exercise used
    // to stamp the LAST set's effort on every set — a 7-7-9 top set read 9-9-9.
    var rpeLog: [String: [Int]] = [:] { didSet { persist() } }
    // The session these sets belong to. Set at the first logged (or adopted)
    // set and kept until Finish, New session or reset: the phone's plan is
    // TODAY's, and a phone reopened mid-workout on another day's plan (today's
    // Rest, say) used to prune every logged set off the wrist.
    @Published var sessionPlan: WatchPlan? = nil { didSet { persist() } }
    // ms of the wrist's last logged set per exercise: an undo or edit on the
    // phone after it wins; one before it doesn't.
    var setAt: [String: Double] = [:]
    // Phone corrections this wrist has applied (exercise → the phone's stamp):
    // echoed as `ack` so the phone takes the log whole instead of guessing.
    var acked: [String: Double] = [:]
    private var restoredAt: Double = 0        // ms; when a restored session was last saved
    private var timer: Timer?
    private(set) var startedAt: Double = 0   // ms since epoch, set on first logged set
    private var restoring = false
    private static let stateKey = "runnerState"
    private static let syncedKey = "runnerSyncedAt"

    init() {
        restore()
        // "Synced" survives watchOS closing the app: it used to come back as
        // the plan with 0 sets, which reads like the workout was lost.
        let at = UserDefaults.standard.double(forKey: Self.syncedKey)
        synced = at > 0 && Date().timeIntervalSince1970 - at < 3 * 3600
        // A session written by build 49/50 carries no plan: pin the plan the
        // wrist was showing (cached), or its sets would hide under today's
        // Rest and file under whichever lift plan arrived first.
        if hasSets, sessionPlan == nil, let p = Connectivity.shared.plan, p.type == "lift" {
            sessionPlan = withLogged(p, from: nil)
        }
    }

    var hasSets: Bool { repsDone.values.contains { !$0.isEmpty } }
    // A session in progress: sets on the wrist and activity within 6 hours.
    // The START used to decide, so a runner opened at 17:30 and trained at
    // 23:40 lost every set to the midnight plan.
    var lastActivityMs: Double { max(setAt.values.max() ?? 0, startedAt, restoredAt) }
    var isLive: Bool { hasSets && Date().timeIntervalSince1970 * 1000 - lastActivityMs < 6 * 3600 * 1000 }
    // Sets from a session that was never finished: shown with its date, sent
    // on Finish (the phone files it by its start), never silently dropped.
    var isStale: Bool { hasSets && !isLive }
    var startedLabel: String {
        guard startedAt > 0 else { return "earlier" }
        let f = DateFormatter(); f.dateFormat = "EEE d MMM"
        return f.string(from: Date(timeIntervalSince1970: startedAt / 1000))
    }

    // What the wrist shows: its own session while one has sets, else the
    // phone's plan for today.
    func shownPlan(_ phone: WatchPlan?) -> WatchPlan? {
        guard hasSets, let own = sessionPlan else { return phone }
        return own
    }

    private func persist() {
        if restoring { return }
        let d = UserDefaults.standard
        if repsDone.values.allSatisfy({ $0.isEmpty }) { d.removeObject(forKey: Self.stateKey); return }
        var obj: [String: Any] = ["repsDone": repsDone, "weights": weights, "weightLog": weightLog,
                                  "rpes": rpes, "rpeLog": rpeLog, "startedAt": startedAt, "setAt": setAt, "acked": acked,
                                  "savedAt": Date().timeIntervalSince1970 * 1000]
        if let p = sessionPlan, let pd = try? JSONEncoder().encode(p), let ps = String(data: pd, encoding: .utf8) {
            obj["sessionPlan"] = ps
        }
        if let data = try? JSONSerialization.data(withJSONObject: obj) { d.set(data, forKey: Self.stateKey) }
    }

    private func restore() {
        guard let data = UserDefaults.standard.data(forKey: Self.stateKey),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let savedAt = obj["savedAt"] as? Double else {
            UserDefaults.standard.removeObject(forKey: Self.stateKey)
            return
        }
        // Older than 6 h: a session with its plan is kept as "unfinished" for
        // the user to send; one without (builds before 51) cannot be filed
        // and is dropped as before.
        if Date().timeIntervalSince1970 * 1000 - savedAt >= 6 * 3600 * 1000, obj["sessionPlan"] == nil {
            UserDefaults.standard.removeObject(forKey: Self.stateKey)
            return
        }
        restoring = true
        restoredAt = savedAt
        acked = (obj["acked"] as? [String: Double]) ?? [:]
        repsDone = (obj["repsDone"] as? [String: [Int]]) ?? [:]
        weights = (obj["weights"] as? [String: Double]) ?? [:]
        weightLog = (obj["weightLog"] as? [String: [Double]]) ?? [:]
        rpes = (obj["rpes"] as? [String: Int]) ?? [:]
        rpeLog = (obj["rpeLog"] as? [String: [Int]]) ?? [:]
        startedAt = (obj["startedAt"] as? Double) ?? 0
        setAt = (obj["setAt"] as? [String: Double]) ?? [:]
        if let ps = obj["sessionPlan"] as? String, let pd = ps.data(using: .utf8) {
            sessionPlan = try? JSONDecoder().decode(WatchPlan.self, from: pd)
        }
        restoring = false
    }

    func weight(for ex: WatchExercise) -> Double { weights[ex.name] ?? ex.weight }
    func done(_ ex: WatchExercise) -> Int { repsDone[ex.name]?.count ?? 0 }
    func isComplete(_ ex: WatchExercise) -> Bool { done(ex) >= ex.sets }

    // RPE a set gets when nothing was chosen: the exercise's last pick, then
    // the programme's target, then 7 (the phone's default).
    func defaultRpe(_ name: String, target: Int? = nil) -> Int {
        if let r = rpes[name] { return r }
        if let t = target, (5...10).contains(t) { return t }
        return 7
    }
    // The RPE log padded or trimmed to the rep log's length.
    func alignedRpe(_ name: String, count: Int, target: Int? = nil) -> [Int] {
        var rl = Array((rpeLog[name] ?? []).prefix(count))
        let fill = rl.last ?? defaultRpe(name, target: target)
        while rl.count < count { rl.append(fill) }
        return rl
    }

    func logSet(_ ex: WatchExercise, reps: Int, rpe: Int? = nil) {
        WorkoutManager.shared.start()   // no-op while a session is already live
        WorkoutManager.shared.touch()   // each set resets the abandonment clock
        if startedAt == 0 { startedAt = Date().timeIntervalSince1970 * 1000 }
        if sessionPlan == nil { sessionPlan = Connectivity.shared.plan }
        // Always after any phone edit already applied here, so a phone clock
        // running ahead can't make the same undo payload take this set back.
        setAt[ex.name] = max(Date().timeIntervalSince1970 * 1000, (setAt[ex.name] ?? 0) + 1)
        var arr = repsDone[ex.name] ?? []
        arr.append(reps)
        var wl = weightLog[ex.name] ?? []
        while wl.count < arr.count - 1 { wl.append(weight(for: ex)) }   // sets merged from the phone
        wl.append(weight(for: ex))
        weightLog[ex.name] = wl
        let effort = rpe ?? defaultRpe(ex.name, target: ex.rpe)
        rpes[ex.name] = effort
        var rl = alignedRpe(ex.name, count: arr.count - 1, target: ex.rpe)   // sets merged from the phone
        rl.append(effort)
        rpeLog[ex.name] = rl
        repsDone[ex.name] = arr
        WKInterfaceDevice.current().play(.success)
        pushLive()
        if arr.count < ex.sets { startRest(seconds: ex.rest ?? 90) }
    }

    // Mirror this session to the phone in real time — Today shows a live
    // "on watch" banner while the wrist logs sets.
    func pushLive(ended: Bool = false) {
        // A finished session is not re-announced: raising the wrist after
        // Finish used to put "LIVE ON WATCH" back on the phone.
        guard ended || !synced else { return }
        guard let plan = sessionPlan ?? Connectivity.shared.plan else { return }
        let day = plan.dayName
        let sets = repsDone.values.reduce(0) { $0 + $1.count }
        guard ended || sets > 0 else { return }
        var payload: [String: Any] = [
            "dayName": day,
            "startedAt": startedAt > 0 ? startedAt : Date().timeIntervalSince1970 * 1000,
            "reps": repsDone,
            "weights": weights,
            "rlog": rpeLog,
            "at": setAt,
            "ack": acked,
            "hk": WorkoutManager.shared.active,   // the phone skips its own Health write when the wrist runs the workout
            "ended": ended,
        ]
        if let slot = plan.slot, !slot.isEmpty { payload["slot"] = slot }   // the phone files by slot, not by name
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        Connectivity.shared.sendLive(json)
    }

    func startRest(seconds: Int = 90) {
        resting = true
        restLeft = max(5, min(600, seconds))
        restEndsAt = Date().addingTimeInterval(Double(restLeft))
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] t in
            guard let self = self else { t.invalidate(); return }
            self.restLeft = max(0, Int((self.restEndsAt?.timeIntervalSinceNow ?? 0).rounded()))
            if self.restLeft <= 0 {
                t.invalidate()
                self.resting = false
                self.restEndsAt = nil
                WKInterfaceDevice.current().play(.notification)
            }
        }
    }

    // Wrist-raise after a suspension: fire the finish that the frozen timer
    // missed, or fall back in line with the wall clock.
    func resyncRest() {
        guard resting, let ends = restEndsAt else { return }
        restLeft = max(0, Int(ends.timeIntervalSinceNow.rounded()))
        if restLeft <= 0 {
            timer?.invalidate()
            resting = false
            restEndsAt = nil
            WKInterfaceDevice.current().play(.notification)
        }
    }

    func skipRest() {
        timer?.invalidate()
        resting = false
        restEndsAt = nil
    }

    func finish(plan: WatchPlan) {
        // Every exercise with sets goes, even one the passed plan lacks.
        let exs: [[String: Any]] = withLogged(plan, from: sessionPlan).exercises.compactMap { ex in
            guard let reps = repsDone[ex.name], !reps.isEmpty else { return nil }
            var wl = weightLog[ex.name] ?? []
            while wl.count < reps.count { wl.append(weight(for: ex)) }
            if wl.count > reps.count { wl = Array(wl.prefix(reps.count)) }
            // Per-set RPE, plus the rounded mean for phones that read one number.
            let rl = alignedRpe(ex.name, count: reps.count, target: ex.rpe)
            let mean = Int((Double(rl.reduce(0, +)) / Double(max(1, rl.count))).rounded())
            return ["name": ex.name, "weight": wl.max() ?? weight(for: ex), "reps": reps,
                    "weightLog": wl, "rpe": mean, "rpeLog": rl]
        }
        guard !exs.isEmpty else { return }
        Connectivity.shared.sendSession(dayName: plan.dayName, slot: plan.slot, exercises: exs, startedAt: startedAt)
        WorkoutManager.shared.end()
        pushLive(ended: true)
        // The session is in the transfer queue: the runner lets go of it, so
        // nothing re-sends it and New session starts from zero.
        clearSession()
        synced = true
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.syncedKey)
        WKInterfaceDevice.current().play(.success)
    }

    private func clearSession() {
        repsDone = [:]; weights = [:]; weightLog = [:]; rpes = [:]; rpeLog = [:]; setAt = [:]; acked = [:]
        sessionPlan = nil; resting = false
        startedAt = 0; restoredAt = 0
        timer?.invalidate()
        UserDefaults.standard.removeObject(forKey: Self.stateKey)
    }

    func reset() {
        clearSession()
        synced = false
        UserDefaults.standard.removeObject(forKey: Self.syncedKey)
    }

    // A plan from the phone while sets are on the wrist. The same day: take
    // its exercise list (edits and swaps made on the phone mid-workout) and
    // keep every exercise that already has sets. Another day (the phone
    // reopened on today's Rest, or tomorrow's plan): the wrist keeps its own.
    func adopt(_ plan: WatchPlan) {
        guard hasSets else {
            if sessionPlan != nil { sessionPlan = nil }
            prune(to: plan)
            return
        }
        if let cur = sessionPlan, !samePlan(cur, plan) {
            wchLog.info("plan \(plan.dayName, privacy: .public) arrived mid-session; the wrist keeps \(cur.dayName, privacy: .public)")
            return
        }
        guard plan.type == "lift" else { return }
        sessionPlan = withLogged(plan, from: sessionPlan)
    }

    // The plan plus any exercise that has sets but is missing from it, so a
    // logged exercise can never drop out of view or out of Finish.
    private func withLogged(_ plan: WatchPlan, from old: WatchPlan?) -> WatchPlan {
        let names = Set(plan.exercises.map { $0.name })
        var extra: [WatchExercise] = []
        for (name, reps) in repsDone where !reps.isEmpty && !names.contains(name) {
            if let e = old?.exercises.first(where: { $0.name == name }) { extra.append(e); continue }
            extra.append(WatchExercise(name: name, sets: reps.count, reps: reps.last ?? 8,
                                       weight: weights[name] ?? 0, rest: nil, rpe: nil))
        }
        return extra.isEmpty ? plan : plan.with(exercises: plan.exercises + extra.sorted { $0.name < $1.name })
    }

    // Sets the wrist holds that the phone's final log lacks. An empty log
    // (pages before 20260922-6) tells us nothing, so it never counts.
    func hasSetsBeyond(_ live: LiveSession) -> Bool {
        guard !live.reps.isEmpty else { return false }
        return repsDone.contains { name, reps in reps.count > (live.reps[name]?.count ?? 0) }
    }

    // A new plan may have renamed or swapped exercises mid-session — rows
    // keyed by names that no longer exist can never render or sync again,
    // and each one re-flagged localAhead on every merge. Drop them.
    // Never an exercise with sets: those belong to the session, not the plan.
    func prune(to plan: WatchPlan) {
        let names = Set(plan.exercises.map { $0.name })
        let logged = Set(repsDone.filter { !$0.value.isEmpty }.map { $0.key })
        let keep: (String) -> Bool = { names.contains($0) || logged.contains($0) }
        if repsDone.keys.contains(where: { !keep($0) }) { repsDone = repsDone.filter { keep($0.key) } }
        if weights.keys.contains(where: { !keep($0) }) { weights = weights.filter { keep($0.key) } }
        if weightLog.keys.contains(where: { !keep($0) }) { weightLog = weightLog.filter { keep($0.key) } }
        if rpes.keys.contains(where: { !keep($0) }) { rpes = rpes.filter { keep($0.key) } }
        if rpeLog.keys.contains(where: { !keep($0) }) { rpeLog = rpeLog.filter { keep($0.key) } }
    }

    // Live mirror: merge phone runner state into the wrist session. Monotone
    // — the longer per-exercise rep log wins — so repeated exchanges between
    // the two runners converge instead of ping-ponging. Runs on every live
    // payload the phone pushes, mid-session or not.
    func merge(_ live: LiveSession) {
        var changed = false
        var localAhead = false
        // An exercise the phone corrected to zero is absent from `reps` on
        // pages before 20260923-1; its `own` stamp still says it was edited.
        var incoming = live.reps
        for (name, _) in (live.own ?? [:]) where incoming[name] == nil { incoming[name] = [] }
        for (name, arr) in incoming {
            let local = repsDone[name] ?? []
            // An undo or edit on the phone after the wrist's last set for
            // this exercise: the phone's log is the truth, shorter or not.
            // Longest-wins used to put an undone set straight back.
            let phoneEdit = (live.own?[name] ?? 0) > (setAt[name] ?? 0) && arr != local
            if phoneEdit || arr.count > local.count {
                repsDone[name] = arr
                if let w = live.weights[name], w > 0 { weights[name] = w }
                if let wl = live.wlog?[name], wl.count == arr.count {
                    weightLog[name] = wl
                } else {
                    // Older phones send one weight per exercise; fill the
                    // adopted sets with it.
                    var wl = Array((weightLog[name] ?? []).prefix(arr.count))
                    let fill = (live.weights[name] ?? weights[name]) ?? 0
                    while wl.count < arr.count { wl.append(fill) }
                    weightLog[name] = wl
                }
                if let rl = live.rlog?[name], rl.count == arr.count {
                    rpeLog[name] = rl
                } else {
                    // Older pages send no per-set RPE: keep ours for the sets
                    // both sides have, pad the adopted ones.
                    rpeLog[name] = alignedRpe(name, count: arr.count)
                }
                if phoneEdit, let stamp = live.own?[name] { setAt[name] = stamp; acked[name] = stamp }
                changed = true
            } else if local.count > arr.count {
                localAhead = true
            }
        }
        if repsDone.contains(where: { !$0.value.isEmpty && incoming[$0.key] == nil }) {
            localAhead = true
        }
        // Adopt phone weights for lifts we haven't started.
        for (name, w) in live.weights where w > 0 && (repsDone[name]?.count ?? 0) == 0 && weights[name] == nil {
            weights[name] = w
        }
        if changed {
            if startedAt == 0 { startedAt = live.startedAt }
            if sessionPlan == nil, let p = Connectivity.shared.plan, p.type == "lift" { sessionPlan = withLogged(p, from: nil) }
            WKInterfaceDevice.current().play(.click)
        }
        // The phone is missing sets we have — send ours back once; its own
        // merge adopts them and the next exchange finds nothing to do.
        if localAhead { pushLive() }
    }
}

// MARK: - Views

struct RootView: View {
    @ObservedObject var conn = Connectivity.shared
    @ObservedObject var theme = ThemeStore.shared
    @StateObject var runner = Runner()
    @State private var lastPlanDate: String? = nil
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
          Group {
            if let plan = runner.shownPlan(conn.plan) {
                if runner.synced {
                    SyncedView(runner: runner)
                } else if plan.hasPlan == false {
                    NoPlanView(conn: conn)
                } else if plan.type == "lift" && !plan.exercises.isEmpty {
                    PlanView(plan: plan, runner: runner)
                } else {
                    OffDayView(plan: plan)
                }
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "iphone.and.arrow.forward")
                        .font(.title2).foregroundColor(lime)
                    Text("Syncing today's plan from your iPhone…")
                        .font(.footnote).multilineTextAlignment(.center)
                    Button("Sync now") { conn.requestRefresh() }
                        .buttonStyle(.bordered)
                }
            }
          }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            // A new day since the last plan: take it from the stored week
            // before asking the phone (which may be asleep or out of range).
            conn.rolloverIfNeeded()
            // Raising the wrist re-pulls the plan and re-broadcasts any
            // in-progress wrist session to the phone.
            conn.requestRefresh()
            runner.pushLive()
            runner.resyncRest()
        }
        // Fresh plan → drop wrist rows for exercises that no longer exist,
        // and a plan for a NEW DAY starts a clean runner: yesterday's logged
        // sets used to survive under reused exercise names and get re-sent.
        .onChange(of: conn.plan) { newPlan in
            guard let plan = newPlan else { return }
            // A plan for a new day starts a clean runner, unless a session is
            // in progress (sets logged in the last 6 hours): training across
            // midnight keeps its sets.
            if let d = plan.date, d != lastPlanDate {
                if lastPlanDate != nil && !runner.isLive {
                    // Sets from a session that was never finished go to the
                    // phone (filed by their start) instead of being discarded.
                    if runner.hasSets, let own = runner.shownPlan(plan) { runner.finish(plan: own) } else { runner.reset() }
                    WorkoutManager.shared.end()
                }
                lastPlanDate = d
            }
            runner.adopt(plan)
        }
        // Real-time mirror: every live payload from the phone merges straight
        // into the wrist runner — sets logged there tick here as they happen.
        // A phone 'ended' payload closes the wrist side too (the HKWorkout
        // session used to keep running until the user noticed).
        // Matched against the session the runner belongs to, not today's plan:
        // an off-schedule session finished on the phone used to leave the
        // wrist running because the phone had already moved on to Rest.
        .onChange(of: conn.live) { newLive in
            guard let live = newLive, let plan = runner.shownPlan(conn.plan), sameSession(live, plan) else { return }
            if live.ended == true {
                // An 'ended' from before this wrist session began is about an earlier one.
                if let endedAt = live.endedAt, runner.startedAt > endedAt { return }
                // Nothing on the wrist to close: 'Synced to iPhone' stays. A
                // phone finish or discard after the wrist's own Finish used to
                // drop it back to the plan at 0 sets.
                if runner.synced && !runner.hasSets { WorkoutManager.shared.end(); return }
                // Sets the phone never received (out of range) go to it as a
                // wrist session, which the phone merges, rather than vanish;
                // finish() leaves the Synced screen up, reset() would clear it.
                if live.discarded != true && runner.hasSetsBeyond(live) { runner.finish(plan: plan) } else { runner.reset() }
                WorkoutManager.shared.end(); return
            }
            guard live.isFresh, !runner.synced else { return }
            runner.merge(live)
        }
        .onAppear {
            if let live = conn.live, live.ended != true, let plan = runner.shownPlan(conn.plan),
               sameSession(live, plan), live.isFresh, !runner.synced {
                runner.merge(live)
            }
        }
    }
}

struct PlanView: View {
    let plan: WatchPlan
    @ObservedObject var runner: Runner
    @AppStorage("autoWorkout") private var autoWorkout = true

    private var anyLogged: Bool {
        plan.exercises.contains { runner.done($0) > 0 }
    }

    var body: some View {
        List {
            if runner.isStale {
                UnfinishedRow(runner: runner)
            } else if !runner.hasSets && planIsStale(plan) {
                // Mid-session the pinned plan's date is history, not a warning.
                StalePlanRow(date: plan.date)
            }
            Section {
                // Rows push their POSITION, not a value copy: an exercise edited or
                // swapped on the phone mid-workout must re-render on the open
                // wrist screen, not freeze as whatever the link was tapped with.
                // Rows navigate by NAME: a phone-side reorder (superset pairing)
                // or removal used to leave the open wrist screen on a different
                // exercise, and Log set wrote to it.
                ForEach(plan.exercises) { ex in
                    NavigationLink(value: ex.name) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ex.name).font(.system(size: 14, weight: .bold)).lineLimit(2)
                                Text("\(runner.done(ex))/\(ex.sets) sets · \(fmtW(runner.weight(for: ex))) \(unitLabel)")
                                    .font(.system(size: 11, design: .monospaced)).foregroundColor(.secondary)
                            }
                            Spacer()
                            if runner.isComplete(ex) {
                                Image(systemName: "checkmark.circle.fill").foregroundColor(earned)
                            }
                        }
                    }
                }
            } header: {
                // Statement grammar: the day is the lime mono eyebrow.
                Text("\(plan.dayName.uppercased()) · WK \(plan.week)")
                    .font(.system(size: 11, weight: .heavy, design: .monospaced))
                    .kerning(0.8)
                    .foregroundColor(lime)
            }
            if anyLogged {
                Button {
                    runner.finish(plan: plan)
                } label: {
                    Text("Finish & sync").font(.system(size: 14, weight: .bold))
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(RoundedRectangle(cornerRadius: 10).fill(lime))
                .foregroundColor(onAccent)
            }
            // Opt-out for people who track lifts with another workout app —
            // our HKWorkoutSession would end theirs (watchOS allows one live).
            Section {
                Toggle(isOn: $autoWorkout) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Workout tracking")
                            .font(.system(size: 13, weight: .semibold))
                        Text(autoWorkout ? "Live HR + ring credit" : "Won't interrupt other workout apps")
                            .font(.system(size: 10)).foregroundColor(.secondary)
                    }
                }
                .tint(lime)
            }
        }
        .navigationDestination(for: String.self) { name in
            ExerciseView(name: name, runner: runner)
        }
        .navigationTitle("Fitness Programmer")
    }
}

struct ExerciseView: View {
    let name: String
    @ObservedObject var runner: Runner
    @ObservedObject private var conn = Connectivity.shared
    @State private var reps: Int = 0
    @State private var rpe: Int = 7
    @State private var editingWeight = false
    @State private var weightText = ""
    // The exercise the steppers were last seeded for — a phone-side swap
    // reseeds them and flags the change on screen.
    @State private var seeded: WatchExercise? = nil
    @State private var changedOnPhone = false
    @Environment(\.dismiss) private var dismiss

    // Resolved live from the current plan by position. The phone pushes its
    // in-session exercise list on every runner edit (Cues/Edit sheet, swaps),
    // so this re-renders with the new name/sets/reps/weight as it lands.
    private var ex: WatchExercise? {
        runner.shownPlan(conn.plan)?.exercises.first { $0.name == name }
    }

    var body: some View {
        if let ex = ex {
            content(ex)
        } else {
            // The slot vanished — exercise removed on the phone, or the day
            // changed under us. Nothing to log here any more.
            VStack(spacing: 8) {
                Image(systemName: "iphone").foregroundColor(.secondary)
                Text("Changed on iPhone").font(.footnote).foregroundColor(.secondary)
            }
            .onAppear { dismiss() }
        }
    }

    private func seed(_ ex: WatchExercise) {
        if let prev = seeded, prev != ex {
            // Swapped or edited on the phone while this screen was open:
            // adopt the new targets and say so — silently changing the
            // lift under the user's wrist would be worse than a banner.
            reps = ex.reps
            rpe = runner.rpes[ex.name] ?? { let t = ex.rpe ?? 7; return (5...10).contains(t) ? t : 7 }()
            changedOnPhone = prev.name != ex.name || prev.sets != ex.sets || prev.reps != ex.reps
            if changedOnPhone { WKInterfaceDevice.current().play(.notification) }
        } else if seeded == nil {
            if reps == 0 { reps = ex.reps }
            rpe = runner.rpes[ex.name] ?? { let t = ex.rpe ?? 7; return (5...10).contains(t) ? t : 7 }()
        }
        seeded = ex
    }

    @ViewBuilder private func content(_ ex: WatchExercise) -> some View {
        if runner.resting {
            RestView(runner: runner)
        } else {
            ScrollView {
                VStack(spacing: 10) {
                    Text("SET \(min(runner.done(ex) + 1, ex.sets)) OF \(ex.sets)")
                        .font(.system(size: 11, weight: .heavy, design: .monospaced))
                        .kerning(0.8)
                        .foregroundColor(.secondary)
                    if changedOnPhone {
                        Text("UPDATED FROM IPHONE")
                            .font(.system(size: 9, weight: .heavy, design: .monospaced))
                            .kerning(0.8)
                            .foregroundColor(lime)
                    }
                    LiveHRChip()
                    HStack(spacing: 8) {
                        Button { runner.weights[ex.name] = stepWeight(runner.weight(for: ex), by: -weightStepLb) } label: { Text("−" + weightStepLabel) }
                            .buttonStyle(.bordered)
                        // Tap the number to type an exact weight.
                        Button {
                            weightText = fmtW(runner.weight(for: ex))
                            editingWeight = true
                        } label: {
                            VStack(spacing: 0) {
                                Text(fmtW(runner.weight(for: ex)))
                                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                Text(unitLabel.uppercased()).font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
                            }
                            .frame(minWidth: 44)
                        }
                        .buttonStyle(.plain)
                        Button { runner.weights[ex.name] = stepWeight(runner.weight(for: ex), by: weightStepLb) } label: { Text("+" + weightStepLabel) }
                            .buttonStyle(.bordered)
                    }
                    Stepper(value: $reps, in: 0...50) {
                        Text("\(reps) reps").font(.system(size: 15, weight: .semibold))
                    }
                    // RPE from the wrist — without it, watch-logged weeks
                    // could never earn the +5 lb progression banner.
                    Stepper(value: $rpe, in: 5...10) {
                        Text("RPE \(rpe)").font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                    Button {
                        runner.logSet(ex, reps: reps, rpe: rpe)
                        if runner.isComplete(ex) { dismiss() }
                    } label: {
                        Text(runner.isComplete(ex) ? "Done ✓" : "Log set")
                            .font(.system(size: 15, weight: .bold))
                            .frame(maxWidth: .infinity)
                    }
                    .tint(lime)
                    .buttonStyle(.borderedProminent)
                    .foregroundColor(onAccent)
                    .disabled(runner.isComplete(ex))
                }
            }
            .navigationTitle(ex.name)
            .onAppear { seed(ex) }
            .onChange(of: ex) { newEx in seed(newEx) }
            .sheet(isPresented: $editingWeight) {
                VStack(spacing: 12) {
                    Text("WEIGHT · " + unitLabel.uppercased())
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                    TextField("0", text: $weightText)
                        .multilineTextAlignment(.center)
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                    Button("Set") {
                        let cleaned = weightText.replacingOccurrences(of: ",", with: ".")
                            .trimmingCharacters(in: .whitespaces)
                        if let v = Double(cleaned), v >= 0, storeWeight(v) <= 1995 {
                            runner.weights[ex.name] = storeWeight(v)
                        }
                        editingWeight = false
                    }
                    .tint(lime)
                    .buttonStyle(.borderedProminent)
                    .foregroundColor(onAccent)
                }
                .padding(.horizontal, 8)
            }
        }
    }
}

struct RestView: View {
    @ObservedObject var runner: Runner

    var body: some View {
        VStack(spacing: 12) {
            Text("REST")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.secondary)
            if let ends = runner.restEndsAt, ends > .now {
                // Wall-clock text stays correct on wrist-raise even while the
                // 1s timer was suspended.
                Text(timerInterval: Date.now...ends, countsDown: true)
                    .font(.system(size: 40, weight: .heavy, design: .monospaced))
                    .foregroundColor(lime)
                    .multilineTextAlignment(.center)
            } else {
                Text("\(runner.restLeft / 60):\(String(format: "%02d", runner.restLeft % 60))")
                    .font(.system(size: 40, weight: .heavy, design: .monospaced))
                    .foregroundColor(lime)
            }
            LiveHRChip()
            Button("Skip") { runner.skipRest() }
                .buttonStyle(.bordered)
        }
    }
}

// The phone has no programme: tell the wrist what to do, not "Syncing…".
struct NoPlanView: View {
    @ObservedObject var conn: Connectivity
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "iphone").font(.title2).foregroundColor(lime)
            Text("No programme yet").font(.headline)
            Text("Build one in Fitness Programmer on your iPhone — five taps, no account. It lands here.")
                .font(.footnote).multilineTextAlignment(.center).foregroundColor(.secondary)
            Button("Sync now") { conn.requestRefresh() }.buttonStyle(.bordered)
        }
        .padding()
    }
}

struct OffDayView: View {
    let plan: WatchPlan

    // Match the emoji to the day — a Cycling day showing a runner reads wrong.
    private var emoji: String {
        if plan.type == "rest" { return "😴" }
        let n = plan.dayName.lowercased()
        if n.contains("cycl") || n.contains("bike") || n.contains("ride") { return "🚴" }
        if n.contains("swim") { return "🏊" }
        if n.contains("row") { return "🚣" }
        if n.contains("yoga") { return "🧘" }
        if n.contains("box") { return "🥊" }
        if n.contains("climb") { return "🧗" }
        if n.contains("hik") { return "🥾" }
        if n.contains("golf") { return "⛳️" }
        if n.contains("tennis") || n.contains("pickle") { return "🎾" }
        if n.contains("basket") { return "🏀" }
        if n.contains("soccer") || n.contains("futbol") { return "⚽️" }
        if n.contains("run") || plan.type == "run" { return "🏃" }
        return "🏅"
    }

    var body: some View {
        // A stale rest/run plan masquerading as today is exactly as wrong as
        // a stale lift plan — same banner, same one-tap sync.
        ScrollView {
            VStack(spacing: 8) {
                if planIsStale(plan) {
                    StalePlanRow(date: plan.date)
                        .padding(.bottom, 4)
                }
                Text(emoji)
                    .font(.system(size: 34))
                Text(plan.type == "rest" ? "Rest day" : "\(plan.dayName) day")
                    .font(.system(size: 17, weight: .heavy))
                Text(plan.type == "rest" ? "Recover well." : "Track it with your workout app — Fitness Programmer picks it up from Health.")
                    .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
            .padding(.horizontal, 6)
        }
    }
}

struct SyncedView: View {
    @ObservedObject var runner: Runner
    @ObservedObject var conn = Connectivity.shared
    var body: some View {
        let delivered = conn.pendingUploads == 0
        VStack(spacing: 10) {
            Image(systemName: delivered ? "checkmark.circle.fill" : "arrow.up.circle")
                .font(.system(size: 40)).foregroundColor(delivered ? earned : .secondary)
            Text(delivered ? "Synced to iPhone" : "Saved on watch").font(.system(size: 15, weight: .bold))
            Text(delivered ? "Session lands in your log next time Fitness Programmer opens."
                           : "Sends to your iPhone when it\u{2019}s back in range.")
                .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            Button("New session") { runner.reset() }
                .buttonStyle(.bordered)
        }
        .padding(.horizontal, 6)
    }
}

// Small live heart-rate readout — hidden until the workout session streams data.
struct LiveHRChip: View {
    @ObservedObject var wm = WorkoutManager.shared
    var body: some View {
        if wm.active && wm.heartRate > 0 {
            HStack(spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 11)).foregroundColor(.red)
                Text("\(wm.heartRate)")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                Text("BPM")
                    .font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
            }
        }
    }
}

@main
struct SuperoWatchApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
