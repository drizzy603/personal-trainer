import WidgetKit
import SwiftUI

// Supero watch-face complication: today's session at a glance, tap to open
// the watch app. The watch app mirrors the phone-pushed plan into the App
// Group whenever it changes and reloads these timelines.

private let lime = Color(red: 0.78, green: 1.0, blue: 0.0)

struct ComplicationEntry: TimelineEntry {
    let date: Date
    let day: String
    let type: String   // "lift" | "run" | "sport" | "rest" | ""
    let week: Int
}

private func loadEntry() -> ComplicationEntry {
    let d = UserDefaults(suiteName: "group.app.kt.trainer")
    return ComplicationEntry(
        date: Date(),
        day: d?.string(forKey: "watchPlanDay") ?? "Supero",
        type: d?.string(forKey: "watchPlanType") ?? "",
        week: d?.integer(forKey: "watchPlanWeek") ?? 0
    )
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: Date(), day: "Push", type: "lift", week: 6)
    }
    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(loadEntry())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        // The watch app reloads timelines whenever a new plan arrives.
        completion(Timeline(entries: [loadEntry()], policy: .never))
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
                Text("SUPERO")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
                Text(entry.type == "rest" ? "Rest day" : "\(entry.day) day")
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
            Text("Supero · \(entry.day)")
                .complicationBackground()
        case .accessoryCorner:
            Image(systemName: glyph(for: entry.type))
                .font(.system(size: 20, weight: .semibold))
                .widgetLabel { Text(entry.day) }
                .complicationBackground()
        default: // .accessoryCircular
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: glyph(for: entry.type))
                        .font(.system(size: 15, weight: .semibold))
                    Text(String(entry.day.prefix(5)).uppercased())
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
        .description("Today's Supero plan, one tap from the face.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryCorner, .accessoryInline])
    }
}
