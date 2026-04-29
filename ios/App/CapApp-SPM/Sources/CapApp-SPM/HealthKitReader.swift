import Foundation
import HealthKit

// Reads running workouts and their average HR from HealthKit.
// Read-only. Never writes back to HealthKit.
final class HealthKitReader {
    private let store = HKHealthStore()

    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { s.insert(hr) }
        if let dist = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { s.insert(dist) }
        return s
    }

    func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, nil)
            return
        }
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            DispatchQueue.main.async { completion(success, error) }
        }
    }

    func fetchRuns(since: Date, completion: @escaping ([[String: Any]], Error?) -> Void) {
        let workoutType = HKObjectType.workoutType()
        let activityPredicate = HKQuery.predicateForWorkouts(with: .running)
        let datePredicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [activityPredicate, datePredicate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(sampleType: workoutType,
                                  predicate: predicate,
                                  limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [sort]) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async { completion([], error) }
                return
            }
            let workouts = (samples as? [HKWorkout]) ?? []
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
        for workout in workouts {
            group.enter()
            avgHeartRate(for: workout) { bpm in
                out.append(self.serialize(workout: workout, avgHr: bpm))
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
        let distKm = distMeters / 1000.0
        var dict: [String: Any] = [
            "uuid": workout.uuid.uuidString,
            "startDate": isoFormatter.string(from: workout.startDate),
            "distanceKm": distKm,
            "durationSec": Int(workout.duration.rounded()),
        ]
        if let hr = avgHr { dict["avgHr"] = hr }
        return dict
    }
}
