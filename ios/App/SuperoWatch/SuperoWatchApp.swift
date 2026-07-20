import SwiftUI
import WatchConnectivity
import WatchKit

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

// MARK: - Connectivity

final class Connectivity: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = Connectivity()
    @Published var plan: WatchPlan? = nil

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
        DispatchQueue.main.async {
            self.plan = p
            UserDefaults.standard.set(data, forKey: "lastPlan")
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
        synced = true
        WKInterfaceDevice.current().play(.success)
    }

    func reset() {
        repsDone = [:]; weights = [:]; synced = false; resting = false
        timer?.invalidate()
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

    var body: some View {
        List {
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

@main
struct SuperoWatchApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
