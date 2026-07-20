import Foundation
import HealthKit
#if canImport(WidgetKit)
import WidgetKit
#endif

// Reads running + cycling workouts (with avg HR) from HealthKit, optionally
// writes finished lifting sessions back, and — when enabled — observes new
// workouts in the background, queueing them in the App Group for the app to
// drain on next launch and for the widget to overlay onto the week plan.
public final class HealthKitReader {
    public init() {}

    private let store = HKHealthStore()
    private static let appGroup = "group.app.kt.trainer"
    private static let pendingKey = "pendingHealthWorkouts"
    private static let anchorKey = "hkAnchor"
    public static let observerFlagKey = "hkObserverOn"

    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { s.insert(hr) }
        if let dist = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { s.insert(dist) }
        if let cyc = HKObjectType.quantityType(forIdentifier: .distanceCycling) { s.insert(cyc) }
        // Readiness inputs — last night's sleep + HRV/resting-HR vs baseline.
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(sleep) }
        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { s.insert(hrv) }
        if let rhr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { s.insert(rhr) }
        return s
    }

    private var shareTypes: Set<HKSampleType> {
        var s: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let kcal = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { s.insert(kcal) }
        return s
    }

    // Watch activity types Supero can register, mapped to the web app's ids.
    // "run"/"ride" are legacy names the JS side already understands; the rest
    // match SPORTS ids in index.html exactly.
    private static let typeMap: [(HKWorkoutActivityType, String)] = [
        (.running, "run"),
        (.cycling, "ride"),
        (.swimming, "Swimming"),
        (.tennis, "Tennis"),
        (.basketball, "Basketball"),
        (.soccer, "Soccer"),
        (.rowing, "Rowing"),
        (.boxing, "Boxing"),
        (.golf, "Golf"),
        (.yoga, "Yoga"),
        (.hiking, "Hiking"),
        (.climbing, "Climbing"),
        (.pickleball, "Pickleball"),
        (.crossTraining, "CrossFit"),
    ]

    private static var workoutPredicate: NSPredicate {
        NSCompoundPredicate(orPredicateWithSubpredicates:
            typeMap.map { HKQuery.predicateForWorkouts(with: $0.0) })
    }

    // Workouts Supero itself wrote to Health (saveLift) must never round-trip
    // back in as imports.
    private static func isOwnWorkout(_ w: HKWorkout) -> Bool {
        w.sourceRevision.source.bundleIdentifier == Bundle.main.bundleIdentifier
    }

    // MARK: - Authorization

    public func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, nil)
            return
        }
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            DispatchQueue.main.async { completion(success, error) }
        }
    }

    public func requestWriteAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, nil)
            return
        }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { success, error in
            DispatchQueue.main.async { completion(success, error) }
        }
    }

    // MARK: - Reading (runs + rides)

    public func fetchWorkouts(since: Date, completion: @escaping ([[String: Any]], Error?) -> Void) {
        let datePredicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [Self.workoutPredicate, datePredicate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(),
                                  predicate: predicate,
                                  limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [sort]) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async { completion([], error) }
                return
            }
            let workouts = ((samples as? [HKWorkout]) ?? []).filter { !Self.isOwnWorkout($0) }
            self.enrich(workouts: workouts) { runs in
                DispatchQueue.main.async { completion(runs, nil) }
            }
        }
        store.execute(query)
    }

    // For each workout, compute the avg HR over its time range. Done sequentially
    // — these are typically a handful of recent workouts, not thousands.
    private func enrich(workouts: [HKWorkout], completion: @escaping ([[String: Any]]) -> Void) {
        guard !workouts.isEmpty else { completion([]); return }
        var out: [[String: Any]] = []
        let group = DispatchGroup()
        // HKStatisticsQuery completions fire on arbitrary background threads;
        // serialise all appends through this queue to avoid a data race on `out`.
        let serialQ = DispatchQueue(label: "trovo.enrich.serial")
        for workout in workouts {
            group.enter()
            avgHeartRate(for: workout) { bpm in
                let entry = self.serialize(workout: workout, avgHr: bpm)
                serialQ.sync { out.append(entry) }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            // Preserve original (newest-first) order from the parent query.
            let order = Dictionary(uniqueKeysWithValues: workouts.enumerated().map { ($1.uuid.uuidString, $0) })
            let sorted = out.sorted { (a, b) -> Bool in
                let ai = order[a["uuid"] as? String ?? ""] ?? 0
                let bi = order[b["uuid"] as? String ?? ""] ?? 0
                return ai < bi
            }
            completion(sorted)
        }
    }

    private func avgHeartRate(for workout: HKWorkout, completion: @escaping (Int?) -> Void) {
        guard let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            completion(nil); return
        }
        let predicate = HKQuery.predicateForSamples(withStart: workout.startDate,
                                                    end: workout.endDate,
                                                    options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: hrType,
                                      quantitySamplePredicate: predicate,
                                      options: .discreteAverage) { _, stats, _ in
            let unit = HKUnit.count().unitDivided(by: .minute())
            let bpm = stats?.averageQuantity()?.doubleValue(for: unit)
            completion(bpm.map { Int($0.rounded()) })
        }
        store.execute(query)
    }

    private func serialize(workout: HKWorkout, avgHr: Int?) -> [String: Any] {
        let distMeters = workout.totalDistance?.doubleValue(for: .meter()) ?? 0
        let type = Self.typeMap.first(where: { $0.0 == workout.workoutActivityType })?.1 ?? "run"
        var dict: [String: Any] = [
            "uuid": workout.uuid.uuidString,
            "startDate": isoFormatter.string(from: workout.startDate),
            "distanceKm": distMeters / 1000.0,
            "durationSec": Int(workout.duration.rounded()),
            "type": type,
        ]
        if let hr = avgHr { dict["avgHr"] = hr }
        if let kcal = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()), kcal > 0 {
            dict["kcal"] = Int(kcal.rounded())
        }
        return dict
    }

    // MARK: - Readiness (sleep + HRV + resting HR)

    // Returns whatever is available: sleepHours (last night), hrv + hrvBaseline
    // (ms, latest vs 30-day mean), rhr + rhrBaseline (bpm). Keys are omitted
    // when Health has no data, so the JS side can degrade gracefully.
    public func fetchReadiness(completion: @escaping ([String: Any]) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else { completion([:]); return }
        var out: [String: Any] = [:]
        let outQ = DispatchQueue(label: "trovo.readiness.serial")
        let group = DispatchGroup()
        let now = Date()
        let cal = Calendar.current

        // Last night's asleep time: samples from yesterday 15:00 → now.
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let windowStart = cal.date(byAdding: .hour, value: -33, to: now)!
            let pred = HKQuery.predicateForSamples(withStart: windowStart, end: now, options: [])
            let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                defer { group.leave() }
                guard let cats = samples as? [HKCategorySample], !cats.isEmpty else { return }
                var asleepValues: Set<Int> = [HKCategoryValueSleepAnalysis.asleep.rawValue]
                if #available(iOS 16.0, *) {
                    asleepValues.insert(HKCategoryValueSleepAnalysis.asleepCore.rawValue)
                    asleepValues.insert(HKCategoryValueSleepAnalysis.asleepDeep.rawValue)
                    asleepValues.insert(HKCategoryValueSleepAnalysis.asleepREM.rawValue)
                }
                // Merge overlapping intervals (watch + phone often both record).
                let intervals = cats.filter { asleepValues.contains($0.value) }
                    .map { ($0.startDate, $0.endDate) }
                    .sorted { $0.0 < $1.0 }
                var total: TimeInterval = 0
                var curStart: Date? = nil, curEnd: Date? = nil
                for iv in intervals {
                    if let e = curEnd, iv.0 <= e {
                        if iv.1 > e { curEnd = iv.1 }
                    } else {
                        if let s0 = curStart, let e0 = curEnd { total += e0.timeIntervalSince(s0) }
                        curStart = iv.0; curEnd = iv.1
                    }
                }
                if let s0 = curStart, let e0 = curEnd { total += e0.timeIntervalSince(s0) }
                if total > 0 {
                    let hours = (total / 3600.0 * 10).rounded() / 10
                    outQ.sync { out["sleepHours"] = hours }
                }
            }
            store.execute(q)
        }

        func latestAndBaseline(_ id: HKQuantityTypeIdentifier, unit: HKUnit, latestKey: String, baseKey: String) {
            guard let t = HKObjectType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let pred = HKQuery.predicateForSamples(withStart: cal.date(byAdding: .day, value: -30, to: now), end: now, options: [])
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            let q = HKSampleQuery(sampleType: t, predicate: pred, limit: 200, sortDescriptors: [sort]) { _, samples, _ in
                defer { group.leave() }
                guard let qs = samples as? [HKQuantitySample], !qs.isEmpty else { return }
                let vals = qs.map { $0.quantity.doubleValue(for: unit) }
                let latest = vals[0]
                let base = vals.reduce(0, +) / Double(vals.count)
                outQ.sync {
                    out[latestKey] = (latest * 10).rounded() / 10
                    out[baseKey] = (base * 10).rounded() / 10
                }
            }
            store.execute(q)
        }
        latestAndBaseline(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli), latestKey: "hrv", baseKey: "hrvBaseline")
        latestAndBaseline(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), latestKey: "rhr", baseKey: "rhrBaseline")

        group.notify(queue: .main) {
            outQ.sync { completion(out) }
        }
    }

    // MARK: - Writing (lifting sessions)

    public func saveLift(start: Date, end: Date, kcal: Double?, completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(), end > start else {
            completion(false, nil)
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        let finish: () -> Void = {
            builder.endCollection(withEnd: end) { ok, err in
                guard ok else { DispatchQueue.main.async { completion(false, err) }; return }
                builder.finishWorkout { workout, err2 in
                    DispatchQueue.main.async { completion(workout != nil, err2) }
                }
            }
        }
        builder.beginCollection(withStart: start) { ok, err in
            guard ok else { DispatchQueue.main.async { completion(false, err) }; return }
            if let kcal = kcal, kcal > 0,
               let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
                let sample = HKCumulativeQuantitySample(type: t,
                    quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                    start: start, end: end)
                builder.add([sample]) { _, _ in finish() }
            } else {
                finish()
            }
        }
    }

    // MARK: - Background delivery
    // The observer must be re-registered on every app launch — iOS relaunches
    // the app in the background after a new workout and expects the query to
    // already exist. AppDelegate calls startBackgroundObserver() at launch
    // whenever the app-group flag says the user opted in.

    public static var backgroundSyncEnabled: Bool {
        UserDefaults(suiteName: appGroup)?.bool(forKey: observerFlagKey) ?? false
    }

    public func setBackgroundSync(enabled: Bool) {
        UserDefaults(suiteName: Self.appGroup)?.set(enabled, forKey: Self.observerFlagKey)
        if enabled {
            startBackgroundObserver()
        } else {
            store.disableAllBackgroundDelivery { _, _ in }
        }
    }

    public func startBackgroundObserver() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let type = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: type, predicate: Self.workoutPredicate) { [weak self] _, completionHandler, _ in
            self?.harvestNewWorkouts { completionHandler() }
        }
        store.execute(query)
        store.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
    }

    // Anchored query picks up whatever arrived since the stored anchor and
    // appends it to the pending queue (App Group), then pokes the widget.
    // No HR enrichment here — background time is scarce; the app re-fetches
    // enriched entries when it drains the queue.
    private func harvestNewWorkouts(completion: @escaping () -> Void) {
        let defaults = UserDefaults(suiteName: Self.appGroup)
        var anchor: HKQueryAnchor? = nil
        if let data = defaults?.data(forKey: Self.anchorKey) {
            anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
        }
        let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(),
                                          predicate: Self.workoutPredicate,
                                          anchor: anchor,
                                          limit: HKObjectQueryNoLimit) { [weak self] _, samples, _, newAnchor, _ in
            defer { completion() }
            guard let self = self else { return }
            if let newAnchor = newAnchor,
               let data = try? NSKeyedArchiver.archivedData(withRootObject: newAnchor, requiringSecureCoding: true) {
                defaults?.set(data, forKey: Self.anchorKey)
            }
            let workouts = ((samples as? [HKWorkout]) ?? []).filter { !Self.isOwnWorkout($0) }
            guard !workouts.isEmpty else { return }
            var pending = Self.readPending()
            let known = Set(pending.compactMap { $0["uuid"] as? String })
            for w in workouts where !known.contains(w.uuid.uuidString) {
                pending.append(self.serialize(workout: w, avgHr: nil))
            }
            Self.writePending(pending)
            DispatchQueue.main.async {
                #if canImport(WidgetKit)
                if #available(iOS 14.0, *) {
                    WidgetCenter.shared.reloadTimelines(ofKind: "SuperoTodayWidget")
                }
                #endif
            }
        }
        store.execute(query)
    }

    public static func readPending() -> [[String: Any]] {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: pendingKey),
              let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return arr
    }

    private static func writePending(_ pending: [[String: Any]]) {
        if let data = try? JSONSerialization.data(withJSONObject: pending) {
            UserDefaults(suiteName: appGroup)?.set(data, forKey: pendingKey)
        }
    }

    public static func clearPending() {
        UserDefaults(suiteName: appGroup)?.removeObject(forKey: pendingKey)
    }
}
