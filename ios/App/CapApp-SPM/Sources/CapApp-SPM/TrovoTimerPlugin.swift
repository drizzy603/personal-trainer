import Foundation
import Capacitor

@objc(TrovoTimerPlugin)
public class TrovoTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoTimerPlugin"
    public let jsName = "TrovoTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endTimer",   returnType: CAPPluginReturnPromise),
    ]

    @objc func startTimer(_ call: CAPPluginCall) {
        guard let exerciseName = call.getString("exerciseName"),
              let seconds      = call.getInt("seconds"),
              let nextSet      = call.getInt("nextSet"),
              let totalSets    = call.getInt("totalSets") else {
            call.reject("Missing parameters")
            return
        }
        NotificationCenter.default.post(
            name: Notification.Name("TrovoTimerStart"),
            object: nil,
            userInfo: [
                "exerciseName": exerciseName,
                "seconds":      seconds,
                "nextSet":      nextSet,
                "totalSets":    totalSets,
            ]
        )
        call.resolve()
    }

    @objc func endTimer(_ call: CAPPluginCall) {
        NotificationCenter.default.post(name: Notification.Name("TrovoTimerEnd"), object: nil)
        call.resolve()
    }
}
