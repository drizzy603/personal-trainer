import Capacitor
import Foundation

@objc(TrovoSharePlugin)
public class TrovoSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoSharePlugin"
    public let jsName = "TrovoShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToICloud",    returnType: CAPPluginReturnPromise),
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

    // Writes a text file into the app's iCloud Drive folder (Documents), so
    // backups survive a lost or dead phone. Resolves {saved:false, reason}
    // instead of rejecting when iCloud is off — callers treat it as best-effort.
    @objc public func saveToICloud(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let content = call.getString("content"),
              !name.contains("/"), !name.hasPrefix(".") else {
            call.reject("name/content required")
            return
        }
        // url(forUbiquityContainerIdentifier:) can block — never on main thread.
        DispatchQueue.global(qos: .utility).async {
            guard let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
                DispatchQueue.main.async { call.resolve(["saved": false, "reason": "icloud-unavailable"]) }
                return
            }
            let docs = container.appendingPathComponent("Documents", isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
                let url = docs.appendingPathComponent(name)
                try content.data(using: .utf8)?.write(to: url, options: .atomic)
                DispatchQueue.main.async { call.resolve(["saved": true]) }
            } catch {
                let reason = error.localizedDescription
                DispatchQueue.main.async { call.resolve(["saved": false, "reason": reason]) }
            }
        }
    }
}
