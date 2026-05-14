import Capacitor
import Foundation

@objc(TrovoSharePlugin)
public class TrovoSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoSharePlugin"
    public let jsName = "TrovoShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise)
    ]

    @objc public func getPendingShare(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: "group.app.kt.trainer"),
              let base64 = defaults.string(forKey: "pendingShareImage") else {
            call.resolve(["imageBase64": NSNull(), "comment": ""])
            return
        }
        let comment = defaults.string(forKey: "pendingShareComment") ?? ""
        defaults.removeObject(forKey: "pendingShareImage")
        defaults.removeObject(forKey: "pendingShareComment")
        defaults.synchronize()
        call.resolve(["imageBase64": base64, "comment": comment])
    }
}
