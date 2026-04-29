import Foundation
import Capacitor
import HealthKit

@objc(TrovoHealthPlugin)
public class TrovoHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoHealthPlugin"
    public let jsName = "TrovoHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchRuns",   returnType: CAPPluginReturnPromise),
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

    @objc func fetchRuns(_ call: CAPPluginCall) {
        let sinceMs = call.getDouble("sinceMs") ?? 0
        let since = sinceMs > 0 ? Date(timeIntervalSince1970: sinceMs / 1000.0) : Date.distantPast
        reader.fetchRuns(since: since) { runs, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["runs": runs])
        }
    }
}
