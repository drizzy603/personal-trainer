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
        var info: [String: Any] = [
            "exerciseName": exerciseName,
            "seconds":      seconds,
            "nextSet":      nextSet,
            "totalSets":    totalSets,
        ]
        if let detail = call.getString("detail"), !detail.isEmpty { info["detail"] = detail }
        // The rest granted so far (it grows with +30s), so the bar drains like the in-app one.
        if let total = call.getInt("total"), total > 0 { info["total"] = total }
        // The phone's room (Heavyweight paper/blue, Lime near-black/lime): only its strings and
        // the paper flag, so the userInfo stays plain property-list values.
        if let theme = call.getObject("theme") {
            var t: [String: Any] = [:]
            for (k, v) in theme {
                if let s = v as? String { t[k] = s } else if let b = v as? Bool { t[k] = b }
            }
            if !t.isEmpty { info["theme"] = t }
        }
        NotificationCenter.default.post(name: Notification.Name("TrovoTimerStart"), object: nil, userInfo: info)
        call.resolve()
    }

    @objc func endTimer(_ call: CAPPluginCall) {
        NotificationCenter.default.post(name: Notification.Name("TrovoTimerEnd"), object: nil)
        call.resolve()
    }
}
