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

private let lime = Color(red: 0.78, green: 1.0, blue: 0.0)

// The plan payload's yyyy-MM-dd is Gregorian (JS todayISO) — pin the
// comparison formatter so Buddhist/Japanese device calendars can't make
// every plan read stale (or never stale). nil date = legacy cache, trusted.
private func planIsStale(_ plan: WatchPlan) -> Bool {
    guard let d = plan.date else { return false }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return d != f.string(from: Date())
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
    v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(format: "%.1f", v)
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
    let type: String            // "lift" | "run" | "sport" | "rest"
    let exercises: [WatchExercise]
}

// In-progress phone runner state — merged live into the wrist runner.
struct LiveSession: Codable, Equatable {
    let dayName: String
    let startedAt: Double       // ms since epoch
    let reps: [String: [Int]]
    let weights: [String: Double]
    var setsDone: Int { reps.values.reduce(0) { $0 + $1.count } }
    var isFresh: Bool { Date().timeIntervalSince1970 - startedAt / 1000 < 6 * 3600 }
}

// MARK: - Connectivity

final class Connectivity: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = Connectivity()
    @Published var plan: WatchPlan? = nil
    @Published var live: LiveSession? = nil
    // The phone mirrors pushes over context + message, so the same payload
    // often lands twice — skip the repeat (WidgetCenter reloads are budgeted).
    private var lastIngestSig = ""

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: "lastPlan"),
           let p = try? JSONDecoder().decode(WatchPlan.self, from: data) {
            plan = p
        }
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
        let sig = json + "|" + ((context["live"] as? String) ?? "")
        if sig == lastIngestSig { return }
        lastIngestSig = sig
        wchLog.info("ingest: plan \(p.dayName, privacy: .public)/\(p.type, privacy: .public) wk\(p.week) (live: \(context["live"] != nil))")
        var liveSession: LiveSession? = nil
        if let lj = context["live"] as? String, !lj.isEmpty,
           let ld = lj.data(using: .utf8),
           let l = try? JSONDecoder().decode(LiveSession.self, from: ld) {
            liveSession = l
        }
        DispatchQueue.main.async {
            self.plan = p
            self.live = liveSession
            UserDefaults.standard.set(data, forKey: "lastPlan")
            // Mirror into the App Group for the watch-face complication.
            if let shared = UserDefaults(suiteName: "group.app.kt.trainer") {
                shared.set(p.dayName, forKey: "watchPlanDay")
                shared.set(p.type, forKey: "watchPlanType")
                shared.set(p.week, forKey: "watchPlanWeek")
            }
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        wchLog.info("session activated (state: \(state.rawValue))")
        ingest(session.receivedApplicationContext)
        requestRefresh()
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

    func sendSession(dayName: String, exercises: [[String: Any]]) {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let payload: [String: Any] = [
            "dayName": dayName,
            "loggedAt": iso.string(from: Date()),
            "exercises": exercises,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        WCSession.default.transferUserInfo(["session": json])
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

    func requestAuth() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        var read: Set<HKObjectType> = []
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { read.insert(hr) }
        if let en = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { read.insert(en) }
        store.requestAuthorization(toShare: share, read: read) { _, _ in }
    }

    func start() {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return }
        // watchOS allows one live workout — starting ours would end a workout
        // already running in another app (e.g. Apple's Workout app). The
        // toggle in PlanView lets users who track elsewhere opt out.
        guard UserDefaults.standard.object(forKey: "autoWorkout") as? Bool ?? true else { return }
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
            DispatchQueue.main.async { self.active = true }
        } catch {
            // Health unavailable (auth denied, etc.) — the runner works without it.
        }
    }

    func end() {
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
    @Published var repsDone: [String: [Int]] = [:]     // exercise → logged reps per set
    @Published var weights: [String: Double] = [:]
    @Published var resting = false
    @Published var restLeft = 90
    @Published var synced = false
    // Wall-clock deadline: the 1s Timer suspends whenever the app loses
    // background runtime (workout tracking off / HK denied), freezing the
    // old tick-counted clock. Wrist-raise now derives from this date.
    @Published var restEndsAt: Date? = nil
    // Chosen RPE per exercise — without it, drained wrist sessions carried
    // rpe:'' and could never earn the +5 lb progression banner.
    var rpes: [String: Int] = [:]
    private var timer: Timer?
    private var startedAt: Double = 0   // ms since epoch, set on first logged set

    func weight(for ex: WatchExercise) -> Double { weights[ex.name] ?? ex.weight }
    func done(_ ex: WatchExercise) -> Int { repsDone[ex.name]?.count ?? 0 }
    func isComplete(_ ex: WatchExercise) -> Bool { done(ex) >= ex.sets }

    func logSet(_ ex: WatchExercise, reps: Int) {
        WorkoutManager.shared.start()   // no-op while a session is already live
        if startedAt == 0 { startedAt = Date().timeIntervalSince1970 * 1000 }
        var arr = repsDone[ex.name] ?? []
        arr.append(reps)
        repsDone[ex.name] = arr
        WKInterfaceDevice.current().play(.success)
        pushLive()
        if arr.count < ex.sets { startRest(seconds: ex.rest ?? 90) }
    }

    // Mirror this session to the phone in real time — Today shows a live
    // "on watch" banner while the wrist logs sets.
    func pushLive(ended: Bool = false) {
        guard let day = Connectivity.shared.plan?.dayName else { return }
        let sets = repsDone.values.reduce(0) { $0 + $1.count }
        guard ended || sets > 0 else { return }
        let payload: [String: Any] = [
            "dayName": day,
            "startedAt": startedAt > 0 ? startedAt : Date().timeIntervalSince1970 * 1000,
            "reps": repsDone,
            "weights": weights,
            "ended": ended,
        ]
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
        let exs: [[String: Any]] = plan.exercises.compactMap { ex in
            guard let reps = repsDone[ex.name], !reps.isEmpty else { return nil }
            return ["name": ex.name, "weight": weight(for: ex), "reps": reps,
                    "rpe": rpes[ex.name] ?? 0]
        }
        guard !exs.isEmpty else { return }
        Connectivity.shared.sendSession(dayName: plan.dayName, exercises: exs)
        WorkoutManager.shared.end()
        pushLive(ended: true)
        synced = true
        WKInterfaceDevice.current().play(.success)
    }

    func reset() {
        repsDone = [:]; weights = [:]; rpes = [:]; synced = false; resting = false
        startedAt = 0
        timer?.invalidate()
    }

    // A new plan may have renamed or swapped exercises mid-session — rows
    // keyed by names that no longer exist can never render or sync again,
    // and each one re-flagged localAhead on every merge. Drop them.
    func prune(to plan: WatchPlan) {
        let names = Set(plan.exercises.map { $0.name })
        let before = repsDone.count
        repsDone = repsDone.filter { names.contains($0.key) }
        weights = weights.filter { names.contains($0.key) }
        rpes = rpes.filter { names.contains($0.key) }
        if repsDone.count != before { pushLive() }
    }

    // Live mirror: merge phone runner state into the wrist session. Monotone
    // — the longer per-exercise rep log wins — so repeated exchanges between
    // the two runners converge instead of ping-ponging. Runs on every live
    // payload the phone pushes, mid-session or not.
    func merge(_ live: LiveSession) {
        var changed = false
        var localAhead = false
        for (name, arr) in live.reps {
            let localDone = repsDone[name]?.count ?? 0
            if arr.count > localDone {
                repsDone[name] = arr
                if let w = live.weights[name], w > 0 { weights[name] = w }
                changed = true
            } else if localDone > arr.count {
                localAhead = true
            }
        }
        if repsDone.contains(where: { !$0.value.isEmpty && live.reps[$0.key] == nil }) {
            localAhead = true
        }
        // Adopt phone weights for lifts we haven't started.
        for (name, w) in live.weights where w > 0 && (repsDone[name]?.count ?? 0) == 0 && weights[name] == nil {
            weights[name] = w
        }
        if changed {
            if startedAt == 0 { startedAt = live.startedAt }
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
    @StateObject var runner = Runner()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            if let plan = conn.plan {
                if plan.type == "lift" && !plan.exercises.isEmpty {
                    if runner.synced {
                        SyncedView(runner: runner)
                    } else {
                        PlanView(plan: plan, runner: runner)
                    }
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
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            // Raising the wrist re-pulls the plan and re-broadcasts any
            // in-progress wrist session to the phone.
            conn.requestRefresh()
            runner.pushLive()
            runner.resyncRest()
        }
        // Fresh plan → drop wrist rows for exercises that no longer exist.
        .onChange(of: conn.plan) { newPlan in
            if let plan = newPlan { runner.prune(to: plan) }
        }
        // Real-time mirror: every live payload from the phone merges straight
        // into the wrist runner — sets logged there tick here as they happen.
        .onChange(of: conn.live) { newLive in
            guard let live = newLive, let plan = conn.plan,
                  live.dayName == plan.dayName, live.isFresh else { return }
            runner.merge(live)
        }
        .onAppear {
            if let live = conn.live, let plan = conn.plan,
               live.dayName == plan.dayName, live.isFresh {
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
            if planIsStale(plan) {
                StalePlanRow(date: plan.date)
            }
            Section {
                // Rows push their POSITION, not a value copy: an exercise edited or
                // swapped on the phone mid-workout must re-render on the open
                // wrist screen, not freeze as whatever the link was tapped with.
                ForEach(Array(plan.exercises.enumerated()), id: \.element.id) { idx, ex in
                    NavigationLink(value: idx) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ex.name).font(.system(size: 14, weight: .bold)).lineLimit(2)
                                Text("\(runner.done(ex))/\(ex.sets) sets · \(fmtWeight(runner.weight(for: ex))) lb")
                                    .font(.system(size: 11, design: .monospaced)).foregroundColor(.secondary)
                            }
                            Spacer()
                            if runner.isComplete(ex) {
                                Image(systemName: "checkmark.circle.fill").foregroundColor(lime)
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
                .foregroundColor(.black)
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
        .navigationDestination(for: Int.self) { idx in
            ExerciseView(index: idx, runner: runner)
        }
        .navigationTitle("Supero")
    }
}

struct ExerciseView: View {
    let index: Int
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
        guard let p = conn.plan, p.exercises.indices.contains(index) else { return nil }
        return p.exercises[index]
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
                        Button { runner.weights[ex.name] = max(0, runner.weight(for: ex) - 2.5) } label: { Text("−2.5") }
                            .buttonStyle(.bordered)
                        // Tap the number to type an exact weight.
                        Button {
                            weightText = fmtWeight(runner.weight(for: ex))
                            editingWeight = true
                        } label: {
                            VStack(spacing: 0) {
                                Text(fmtWeight(runner.weight(for: ex)))
                                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                Text("LB").font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
                            }
                            .frame(minWidth: 44)
                        }
                        .buttonStyle(.plain)
                        Button { runner.weights[ex.name] = runner.weight(for: ex) + 2.5 } label: { Text("+2.5") }
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
                        runner.rpes[ex.name] = rpe
                        runner.logSet(ex, reps: reps)
                        if runner.isComplete(ex) { dismiss() }
                    } label: {
                        Text(runner.isComplete(ex) ? "Done ✓" : "Log set")
                            .font(.system(size: 15, weight: .bold))
                            .frame(maxWidth: .infinity)
                    }
                    .tint(lime)
                    .buttonStyle(.borderedProminent)
                    .foregroundColor(.black)
                    .disabled(runner.isComplete(ex))
                }
            }
            .navigationTitle(ex.name)
            .onAppear { seed(ex) }
            .onChange(of: ex) { newEx in seed(newEx) }
            .sheet(isPresented: $editingWeight) {
                VStack(spacing: 12) {
                    Text("WEIGHT · LB")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                    TextField("0", text: $weightText)
                        .multilineTextAlignment(.center)
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                    Button("Set") {
                        let cleaned = weightText.replacingOccurrences(of: ",", with: ".")
                            .trimmingCharacters(in: .whitespaces)
                        if let v = Double(cleaned), v >= 0, v <= 1995 {
                            runner.weights[ex.name] = v
                        }
                        editingWeight = false
                    }
                    .tint(lime)
                    .buttonStyle(.borderedProminent)
                    .foregroundColor(.black)
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
                Text(plan.type == "rest" ? "Recover well." : "Track it with your workout app — Supero picks it up from Health.")
                    .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
            .padding(.horizontal, 6)
        }
    }
}

struct SyncedView: View {
    @ObservedObject var runner: Runner
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40)).foregroundColor(lime)
            Text("Synced to iPhone").font(.system(size: 15, weight: .bold))
            Text("Session lands in your log next time Supero opens.")
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
                .onAppear {
                    #if !targetEnvironment(simulator)
                    WorkoutManager.shared.requestAuth()
                    #endif
                }
        }
    }
}
