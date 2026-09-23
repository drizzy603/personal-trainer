import WidgetKit
import SwiftUI

// Fitness Programmer watch-face complication: today's session at a glance,
// tap to open the watch app. The watch app mirrors the phone-pushed plan — and
// the phone's theme colours — into the App Group whenever they change and
// reloads these timelines.

private func hexColor(_ hex: String?) -> Color? {
    guard var h = hex?.trimmingCharacters(in: .whitespaces), !h.isEmpty else { return nil }
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
    return Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
}
private let studioLime = Color(red: 0.78, green: 1.0, blue: 0.0)

struct ComplicationEntry: TimelineEntry {
    let date: Date
    let day: String    // the day's name as the user calls it; "" = nothing current
    let short: String  // the same, fitted to the circular face ("C+B")
    let type: String   // "lift" | "run" | "sport" | "rest" | ""
    let week: Int
    let accentHex: String?   // the phone theme's action colour
    var accent: Color { hexColor(accentHex) ?? studioLime }
    var hasDay: Bool { !day.isEmpty }
}

private func loadEntry() -> ComplicationEntry {
    let d = UserDefaults(suiteName: "group.app.kt.trainer")
    var day = d?.string(forKey: "watchPlanDay") ?? ""
    // The plan is one day's. A timeline rebuilt the next morning (reboot, a
    // budgeted reload) used to show yesterday's session as today's; watch
    // builds before 51 wrote no date, so a missing one is taken on trust.
    if let planDate = d?.string(forKey: "watchPlanDate") {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        if planDate != f.string(from: Date()) { day = "" }
    }
    return ComplicationEntry(
        date: Date(),
        day: day,
        short: day.isEmpty ? "" : (d?.string(forKey: "watchPlanShort") ?? day),
        type: day.isEmpty ? "" : (d?.string(forKey: "watchPlanType") ?? ""),
        week: d?.integer(forKey: "watchPlanWeek") ?? 0,
        accentHex: d?.string(forKey: "watchThemeAccent")
    )
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: Date(), day: "Push", short: "Push", type: "lift", week: 6, accentHex: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(loadEntry())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        // The watch app reloads timelines whenever a new plan arrives — but
        // the plan is a DAY's plan: at midnight it becomes yesterday's, so
        // roll the face to an honest 'open to sync' state until a new one lands.
        let now = Date()
        let cal = Calendar.current
        let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) ?? now.addingTimeInterval(86400)
        let today = loadEntry()
        let stale = ComplicationEntry(date: midnight, day: "", short: "", type: "", week: today.week, accentHex: today.accentHex)
        completion(Timeline(entries: [today, stale], policy: .after(midnight.addingTimeInterval(60))))
    }
}

extension View {
    // watchOS 10 requires a container background on accessory widgets;
    // watchOS 9 has no such API. One modifier, guarded.
    @ViewBuilder func complicationBackground() -> some View {
        if #available(watchOS 10.0, *) {
            self.containerBackground(.clear, for: .widget)
        } else {
            self
        }
    }
}

private func glyph(for type: String) -> String {
    switch type {
    case "run":  return "figure.run"
    case "rest": return "moon.zzz.fill"
    case "sport": return "figure.mixed.cardio"
    default:     return "dumbbell.fill"
    }
}

struct ComplicationView: View {
    @Environment(\.widgetFamily) var family
    let entry: ComplicationEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("FITNESS PROGRAMMER")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(entry.accent)
                    .lineLimit(1)
                Text(!entry.hasDay ? "Open to sync" : (entry.type == "rest" ? "Rest day" : "\(entry.day) day"))
                    .font(.system(size: 15, weight: .bold))
                    .lineLimit(1)
                if entry.week > 0 {
                    Text("Week \(entry.week)")
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .complicationBackground()
        case .accessoryInline:
            Text(entry.hasDay ? "FP · \(entry.day)" : "Fitness Programmer")
                .complicationBackground()
        case .accessoryCorner:
            Image(systemName: glyph(for: entry.type))
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(entry.accent)
                .widgetLabel { Text(entry.hasDay ? entry.day : "Open to sync") }
                .complicationBackground()
        default: // .accessoryCircular
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: glyph(for: entry.type))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(entry.accent)
                    Text(entry.hasDay ? String(entry.short.prefix(5)).uppercased() : "FP")
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                }
            }
            .complicationBackground()
        }
    }
}

@main
struct SuperoWatchWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SuperoComplication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
        }
        .configurationDisplayName("Today's session")
        .description("Today's Fitness Programmer plan, one tap from the face.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryCorner, .accessoryInline])
    }
}
