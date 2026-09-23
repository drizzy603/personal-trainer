import Foundation
import Capacitor
import UIKit

// The Home Screen icon follows the app's theme room: Heavyweight is the primary
// icon (the blue FP), Lime is the alternate "AppIcon-Lime" (the black FP).
// iOS shows its own one-line "You have changed the icon" alert on every switch;
// there is no public way to suppress it, so the page only calls this when the
// icon actually differs from the room.
@objc(TrovoIconPlugin)
public class TrovoIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoIconPlugin"
    public let jsName = "TrovoIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    ]

    // name: "AppIcon-Lime" for the alternate, "" (or absent) for the primary.
    @objc func set(_ call: CAPPluginCall) {
        let requested = call.getString("name") ?? ""
        let target: String? = requested.isEmpty ? nil : requested
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else {
                call.resolve(["changed": false, "reason": "unsupported"])
                return
            }
            if app.alternateIconName == target {
                call.resolve(["changed": false, "current": target ?? ""])
                return
            }
            // iOS refuses the change unless the app is frontmost.
            guard app.applicationState == .active else {
                call.resolve(["changed": false, "reason": "inactive"])
                return
            }
            app.setAlternateIconName(target) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["changed": true, "current": target ?? ""])
                }
            }
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let app = UIApplication.shared
            call.resolve(["current": app.alternateIconName ?? "", "supported": app.supportsAlternateIcons])
        }
    }
}
