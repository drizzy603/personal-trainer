import Foundation
import Capacitor
import HealthKit

@objc(TrovoHealthPlugin)
public class TrovoHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoHealthPlugin"
    public let jsName = "TrovoHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuth",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestWriteAuth",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchRuns",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveLift",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackgroundSync",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingWorkouts",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingWorkouts", returnType: CAPPluginReturnPromise),
    ]

    private let reader = HealthKitReader()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuth(_ call: CAPPluginCall) {
        reader.requestAuthorization { granted, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": granted])
        }
    }

    @objc func requestWriteAuth(_ call: CAPPluginCall) {
        reader.requestWriteAuthorization { granted, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": granted])
        }
    }

    // Returns running AND cycling workouts; each entry carries
    // type: "run" | "ride". Name kept for backward compat with older web builds.
    @objc func fetchRuns(_ call: CAPPluginCall) {
        let sinceMs = call.getDouble("sinceMs") ?? 0
        let since = sinceMs > 0 ? Date(timeIntervalSince1970: sinceMs / 1000.0) : Date.distantPast
        reader.fetchWorkouts(since: since) { runs, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["runs": runs])
        }
    }

    @objc func saveLift(_ call: CAPPluginCall) {
        guard let startMs = call.getDouble("startMs"),
              let endMs = call.getDouble("endMs"), endMs > startMs else {
            call.reject("startMs/endMs required")
            return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000.0)
        let end = Date(timeIntervalSince1970: endMs / 1000.0)
        let kcal = call.getDouble("kcal")
        reader.saveLift(start: start, end: end, kcal: kcal) { saved, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["saved": saved])
        }
    }

    @objc func setBackgroundSync(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        reader.setBackgroundSync(enabled: enabled)
        call.resolve(["enabled": enabled])
    }

    @objc func getPendingWorkouts(_ call: CAPPluginCall) {
        call.resolve(["workouts": HealthKitReader.readPending()])
    }

    @objc func clearPendingWorkouts(_ call: CAPPluginCall) {
        HealthKitReader.clearPending()
        call.resolve()
    }
}
