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
        CAPPluginMethod(name: "consumeDeepLink", returnType: CAPPluginReturnPromise),
    ]

    // The URL the app was opened with (widget "Start →" = trovo://start).
    // AppDelegate parks it because on a cold start the page is not up yet;
    // the page consumes it once at boot and it is cleared here.
    @objc func consumeDeepLink(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        let url = d.string(forKey: "pendingDeepLink") ?? ""
        d.removeObject(forKey: "pendingDeepLink")
        call.resolve(["url": url])
    }

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
        // Retire wrist-done overlay dates the summary itself now marks done —
        // clearing them any earlier (e.g. at drain time) raced the debounced
        // summary write and flashed the widget back to "Start →".
        if var pending = defaults.stringArray(forKey: "pendingWatchDone"), !pending.isEmpty,
           let data = json.data(using: .utf8),
           let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           let days = obj["days"] as? [[String: Any]] {
            let doneDates = Set(days.compactMap { d -> String? in
                (d["done"] as? Bool) == true ? d["date"] as? String : nil
            })
            // Dates that fell off the summary window can never be retired by
            // it — drop them too, or the overlay list grows forever.
            let firstDate = days.compactMap { $0["date"] as? String }.min()
            pending.removeAll { d in doneDates.contains(d) || (firstDate != nil && d < firstDate!) }
            defaults.set(pending, forKey: "pendingWatchDone")
        }
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "SuperoTodayWidget")
        }
        call.resolve()
    }
}
