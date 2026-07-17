import ActivityKit
import WidgetKit
import SwiftUI

// Accent colour matching the app's lime (#C8FF00 ≈ rgb(0.78, 1.0, 0.0))
private let lime = Color(red: 0.78, green: 1.0, blue: 0.0)

struct TrovoTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrovoTimerAttributes.self) { context in
            // ── Lock Screen / StandBy banner ─────────────────────────────
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black)
                .activitySystemActionForegroundColor(lime)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded (long-press)
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text("REST")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(.secondary)
                    } icon: {
                        Image(systemName: "dumbbell.fill")
                            .foregroundColor(lime)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                        .font(.system(size: 22, weight: .bold, design: .monospaced))
                        .foregroundColor(lime)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.exerciseName)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("SET \(context.state.nextSet) OF \(context.state.totalSets)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .foregroundColor(lime)
                    .font(.system(size: 13))
            } compactTrailing: {
                Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundColor(lime)
                    .monospacedDigit()
                    .frame(width: 44)
            } minimal: {
                Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(lime)
                    .monospacedDigit()
            }
            .keylineTint(lime)
        }
    }
}

// ── Lock Screen view ─────────────────────────────────────────────────────────

struct LockScreenView: View {
    let context: ActivityViewContext<TrovoTimerAttributes>

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("REST TIMER")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
                Text(context.attributes.exerciseName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("SET \(context.state.nextSet) OF \(context.state.totalSets)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            Spacer()
            Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                .font(.system(size: 48, weight: .bold, design: .monospaced))
                .foregroundColor(lime)
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .frame(width: 110, alignment: .trailing)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }
}

// ── Home Screen widget: today's session at a glance ──────────────────────────
// Reads the JSON summary the app writes into the App Group via
// TrovoWidgetPlugin. Timeline entries are generated per midnight so the
// widget rolls over to the next day's plan without the app being opened.

struct SummaryDay: Decodable {
    let date: String       // yyyy-MM-dd (local)
    let type: String       // "Push" / "Rest" / "Run" / sport id
    let isRest: Bool
    let lifts: Int         // exercise count for lift days, else 0
    let done: Bool         // session already logged that day
}

struct WidgetSummary: Decodable {
    let week: Int
    let totalWeeks: Int
    let streak: Int
    let days: [SummaryDay]
}

func loadSummary() -> WidgetSummary? {
    guard let json = UserDefaults(suiteName: "group.app.kt.trainer")?
            .string(forKey: "superoWidgetSummary"),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetSummary.self, from: data)
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let summary: WidgetSummary?
    let dayIndex: Int      // which entry of summary.days this entry shows
}

struct SuperoTodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), summary: nil, dayIndex: 0)
    }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), summary: loadSummary(), dayIndex: 0))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let summary = loadSummary()
        var entries: [TodayEntry] = [TodayEntry(date: Date(), summary: summary, dayIndex: 0)]
        // One entry per upcoming midnight, showing that day's plan.
        if let s = summary {
            let cal = Calendar.current
            for i in 1..<min(s.days.count, 7) {
                if let midnight = cal.date(byAdding: .day, value: i,
                                           to: cal.startOfDay(for: Date())) {
                    entries.append(TodayEntry(date: midnight, summary: s, dayIndex: i))
                }
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct SuperoTodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry

    private var day: SummaryDay? {
        guard let s = entry.summary, entry.dayIndex < s.days.count else { return nil }
        return s.days[entry.dayIndex]
    }

    private var headline: String {
        guard let d = day else { return "Open Supero" }
        if d.done { return "\(d.type) done" }
        return d.isRest ? "Rest day" : "\(d.type) day"
    }

    private var subline: String {
        guard let d = day, let s = entry.summary else { return "to set up your plan" }
        if d.done { return "Nice work · Week \(s.week)" }
        if d.isRest { return "Recover well" }
        return d.lifts > 0 ? "\(d.lifts) lifts · ~\(d.lifts * 8) min" : "Log it when done"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                if let s = entry.summary {
                    Text("WK \(s.week)/\(s.totalWeeks)")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                } else {
                    Text("SUPERO")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                }
                Spacer()
                Image(systemName: day?.done == true ? "checkmark.circle.fill" : "dumbbell.fill")
                    .font(.system(size: 12))
                    .foregroundColor(lime)
            }
            Spacer(minLength: 0)
            Text(headline)
                .font(.system(size: family == .systemMedium ? 24 : 20, weight: .heavy))
                .foregroundColor((day?.isRest == true || day?.done == true) ? .white : lime)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(subline)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
                .lineLimit(1)
            if family == .systemMedium, let s = entry.summary {
                HStack(spacing: 10) {
                    ForEach(Array(s.days.enumerated().dropFirst(entry.dayIndex + 1).prefix(4)),
                            id: \.offset) { _, d in
                        VStack(spacing: 2) {
                            Text(shortDow(d.date))
                                .font(.system(size: 8, weight: .semibold, design: .monospaced))
                                .foregroundColor(.secondary)
                            Circle()
                                .fill(d.isRest ? Color.secondary.opacity(0.35) : lime)
                                .frame(width: 5, height: 5)
                        }
                    }
                    Spacer()
                    Text("STREAK \(s.streak)W")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
    }

    private func shortDow(_ iso: String) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: iso) else { return "" }
        let out = DateFormatter(); out.dateFormat = "EE"
        return out.string(from: d).uppercased()
    }
}

struct SuperoTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SuperoTodayWidget", provider: SuperoTodayProvider()) { entry in
            if #available(iOS 17.0, *) {
                SuperoTodayView(entry: entry)
                    .containerBackground(Color.black, for: .widget)
            } else {
                SuperoTodayView(entry: entry)
                    .background(Color.black)
            }
        }
        .configurationDisplayName("Today's Session")
        .description("Your next workout, week progress, and streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── Widget bundle entry point ────────────────────────────────────────────────

@main
struct TrovoTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        TrovoTimerLiveActivity()
        SuperoTodayWidget()
    }
}
