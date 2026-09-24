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
        // Retire wrist-done overlay dates the summary now covers. The overlay
        // bridges the gap between a wrist finish and the next time the page
        // runs; once the page has written a summary, that summary is the
        // truth (a session is only "done" for the day it was scheduled on).
        // Retiring only dates the summary marked done left an off-schedule
        // wrist session saying "Run, done." for the rest of the day; clearing
        // at drain time raced the debounced write and flashed "Start →".
        if var pending = defaults.stringArray(forKey: "pendingWatchDone"), !pending.isEmpty,
           let data = json.data(using: .utf8),
           let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           let days = obj["days"] as? [[String: Any]] {
            let dates = days.compactMap { $0["date"] as? String }
            let firstDate = dates.min(), lastDate = dates.max()
            pending.removeAll { d in
                (firstDate != nil && d < firstDate!) || (firstDate != nil && lastDate != nil && d >= firstDate! && d <= lastDate!)
            }
            defaults.set(pending, forKey: "pendingWatchDone")
        }
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "SuperoTodayWidget")
        }
        call.resolve()
    }
}
