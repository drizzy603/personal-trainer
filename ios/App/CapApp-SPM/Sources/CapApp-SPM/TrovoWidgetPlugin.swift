import Foundation
import Capacitor
import WidgetKit

// Bridge for the Home Screen widget: the web app pushes a compact JSON summary
// (week, streak, 7-day plan) into the shared App Group, and we poke WidgetKit
// to rebuild timelines. The same summary is the read surface for any future
// watch app.
@objc(TrovoWidgetPlugin)
public class TrovoWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoWidgetPlugin"
    public let jsName = "TrovoWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateSummary", returnType: CAPPluginReturnPromise),
    ]

    @objc func updateSummary(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Missing json")
            return
        }
        guard let defaults = UserDefaults(suiteName: "group.app.kt.trainer") else {
            call.reject("App Group unavailable")
            return
        }
        defaults.set(json, forKey: "superoWidgetSummary")
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "SuperoTodayWidget")
        }
        call.resolve()
    }
}
