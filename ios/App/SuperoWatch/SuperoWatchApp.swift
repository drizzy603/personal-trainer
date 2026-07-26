import SwiftUI
import WatchConnectivity
import WatchKit
import HealthKit
import WidgetKit

// Supero Watch — run today's session from the wrist. The iPhone pushes the
// day's plan via WatchConnectivity applicationContext; logged sessions go
// back with transferUserInfo (queued, guaranteed) and the phone app folds
// them into the training log on next open.

private let lime = Color(red: 0.78, green: 1.0, blue: 0.0)

// MARK: - Plan model (mirrors the JSON the web app sends)

struct WatchExercise: Codable, Identifiable, Hashable {
    let name: String
    let sets: Int
    let reps: Int
    let weight: Double
    var id: String { name }
}

struct WatchPlan: Codable {
    let week: Int
    let dayName: String
    let type: String            // "lift" | "run" | "sport" | "rest"
    let exercises: [WatchExercise]
}

// In-progress phone runner state — offered as "Continue from iPhone".
struct LiveSession: Codable {
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
              let p = try? JSONDecoder().decode(WatchPlan.self, from: data) else { return }
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
        ingest(session.receivedApplicationContext)
    }
    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        ingest(context)
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
    private var timer: Timer?

    func weight(for ex: WatchExercise) -> Double { weights[ex.name] ?? ex.weight }
    func done(_ ex: WatchExercise) -> Int { repsDone[ex.name]?.count ?? 0 }
    func isComplete(_ ex: WatchExercise) -> Bool { done(ex) >= ex.sets }

    func logSet(_ ex: WatchExercise, reps: Int) {
        WorkoutManager.shared.start()   // no-op while a session is already live
        var arr = repsDone[ex.name] ?? []
        arr.append(reps)
        repsDone[ex.name] = arr
        WKInterfaceDevice.current().play(.success)
        if arr.count < ex.sets { startRest() }
    }

    func startRest() {
        resting = true
        restLeft = 90
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] t in
            guard let self = self else { t.invalidate(); return }
            self.restLeft -= 1
            if self.restLeft <= 0 {
                t.invalidate()
                self.resting = false
                WKInterfaceDevice.current().play(.notification)
            }
        }
    }

    func skipRest() {
        timer?.invalidate()
        resting = false
    }

    func finish(plan: WatchPlan) {
        let exs: [[String: Any]] = plan.exercises.compactMap { ex in
            guard let reps = repsDone[ex.name], !reps.isEmpty else { return nil }
            return ["name": ex.name, "weight": weight(for: ex), "reps": reps]
        }
        guard !exs.isEmpty else { return }
        Connectivity.shared.sendSession(dayName: plan.dayName, exercises: exs)
        WorkoutManager.shared.end()
        synced = true
        WKInterfaceDevice.current().play(.success)
    }

    func reset() {
        repsDone = [:]; weights = [:]; synced = false; resting = false
        timer?.invalidate()
    }

    // Mid-session handoff: pick up exactly where the phone runner left off.
    func adopt(_ live: LiveSession) {
        repsDone = live.reps
        weights = live.weights
        WKInterfaceDevice.current().play(.success)
    }
}

// MARK: - Views

struct RootView: View {
    @ObservedObject var conn = Connectivity.shared
    @StateObject var runner = Runner()

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
                VStack(spacing: 8) {
                    Image(systemName: "iphone.and.arrow.forward")
                        .font(.title2).foregroundColor(lime)
                    Text("Open Supero on your iPhone to sync today's plan.")
                        .font(.footnote).multilineTextAlignment(.center)
                }
            }
        }
    }
}

struct PlanView: View {
    let plan: WatchPlan
    @ObservedObject var runner: Runner

    private var anyLogged: Bool {
        plan.exercises.contains { runner.done($0) > 0 }
    }

    private var handoff: LiveSession? {
        guard let live = Connectivity.shared.live,
              live.dayName == plan.dayName, live.isFresh, live.setsDone > 0,
              !anyLogged else { return nil }
        return live
    }

    var body: some View {
        List {
            if let live = handoff {
                Button {
                    runner.adopt(live)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Continue from iPhone")
                            .font(.system(size: 14, weight: .bold))
                        Text("\(live.setsDone) set\(live.setsDone == 1 ? "" : "s") already in")
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .listRowBackground(RoundedRectangle(cornerRadius: 10).fill(lime.opacity(0.18)))
            }
            Section {
                ForEach(plan.exercises) { ex in
                    NavigationLink(value: ex) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ex.name).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                                Text("\(runner.done(ex))/\(ex.sets) sets · \(Int(runner.weight(for: ex))) lb")
                                    .font(.system(size: 11)).foregroundColor(.secondary)
                            }
                            Spacer()
                            if runner.isComplete(ex) {
                                Image(systemName: "checkmark.circle.fill").foregroundColor(lime)
                            }
                        }
                    }
                }
            } header: {
                Text("\(plan.dayName) · WK \(plan.week)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
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
        }
        .navigationDestination(for: WatchExercise.self) { ex in
            ExerciseView(ex: ex, runner: runner)
        }
        .navigationTitle("Supero")
    }
}

struct ExerciseView: View {
    let ex: WatchExercise
    @ObservedObject var runner: Runner
    @State private var reps: Int = 0
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if runner.resting {
            RestView(runner: runner)
        } else {
            ScrollView {
                VStack(spacing: 10) {
                    Text("SET \(min(runner.done(ex) + 1, ex.sets)) OF \(ex.sets)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                    LiveHRChip()
                    HStack(spacing: 12) {
                        Button { runner.weights[ex.name] = max(0, runner.weight(for: ex) - 5) } label: { Text("−5") }
                            .buttonStyle(.bordered)
                        VStack(spacing: 0) {
                            Text("\(Int(runner.weight(for: ex)))")
                                .font(.system(size: 26, weight: .heavy, design: .rounded))
                            Text("LB").font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
                        }
                        Button { runner.weights[ex.name] = runner.weight(for: ex) + 5 } label: { Text("+5") }
                            .buttonStyle(.bordered)
                    }
                    Stepper(value: $reps, in: 0...50) {
                        Text("\(reps) reps").font(.system(size: 15, weight: .semibold))
                    }
                    Button {
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
            .onAppear { if reps == 0 { reps = ex.reps } }
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
            Text("\(runner.restLeft / 60):\(String(format: "%02d", runner.restLeft % 60))")
                .font(.system(size: 40, weight: .heavy, design: .monospaced))
                .foregroundColor(lime)
            LiveHRChip()
            Button("Skip") { runner.skipRest() }
                .buttonStyle(.bordered)
        }
    }
}

struct OffDayView: View {
    let plan: WatchPlan
    var body: some View {
        VStack(spacing: 8) {
            Text(plan.type == "rest" ? "😴" : "🏃")
                .font(.system(size: 34))
            Text(plan.type == "rest" ? "Rest day" : "\(plan.dayName) day")
                .font(.system(size: 17, weight: .heavy))
            Text(plan.type == "rest" ? "Recover well." : "Track it with your workout app — Supero picks it up from Health.")
                .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
        }
        .padding(.horizontal, 6)
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
                .onAppear { WorkoutManager.shared.requestAuth() }
        }
    }
}
