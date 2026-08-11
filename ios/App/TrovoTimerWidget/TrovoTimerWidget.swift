import ActivityKit
import WidgetKit
import SwiftUI

// App accent. The web app writes its applied theme's accent into the App
// Group summary (Light sends Lime — these surfaces render on dark). Falls
// back to the classic lime when no summary exists yet.
private let limeDefault = Color(red: 0.78, green: 1.0, blue: 0.0)
private var lime: Color {
    guard let json = UserDefaults(suiteName: "group.app.kt.trainer")?
            .string(forKey: "superoWidgetSummary"),
          let data = json.data(using: .utf8),
          let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let hex = obj["accent"] as? String else { return limeDefault }
    return Color(hex: hex) ?? limeDefault
}

extension Color {
    // #RRGGBB → Color; nil on anything else.
    init?(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt64(h, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xff) / 255,
                  green: Double((v >> 8) & 0xff) / 255,
                  blue: Double(v & 0xff) / 255)
    }
}

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
                Text("REST")
                    .font(.system(size: 9, weight: .heavy, design: .monospaced))
                    .kerning(1.0)
                    .foregroundColor(.secondary)
                Text(context.attributes.exerciseName)
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("NEXT · SET \(context.state.nextSet) OF \(context.state.totalSets)")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .kerning(0.5)
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
    let summary = try? JSONDecoder().decode(WidgetSummary.self, from: data)
    return summary.map(applyPendingWorkouts)
}

// Workouts harvested by background delivery but not yet drained by the app
// live in the App Group as pendingHealthWorkouts. Overlay them so a cardio
// day flips to "done" right after the watch workout ends, even if the app
// hasn't been opened since.
private func applyPendingWorkouts(_ summary: WidgetSummary) -> WidgetSummary {
    guard let data = UserDefaults(suiteName: "group.app.kt.trainer")?
            .data(forKey: "pendingHealthWorkouts"),
          let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
          !arr.isEmpty else { return summary }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime]
    let dayFmt = DateFormatter()
    dayFmt.dateFormat = "yyyy-MM-dd"
    let pendingDays = Set(arr.compactMap { entry -> String? in
        guard let s = entry["startDate"] as? String, let d = iso.date(from: s) else { return nil }
        return dayFmt.string(from: d)
    })
    guard !pendingDays.isEmpty else { return summary }
    let days = summary.days.map { d -> SummaryDay in
        // Only cardio days (not rest, no lifts planned) get auto-completed.
        guard !d.done, !d.isRest, d.lifts == 0, pendingDays.contains(d.date) else { return d }
        return SummaryDay(date: d.date, type: d.type, isRest: d.isRest, lifts: d.lifts, done: true)
    }
    return WidgetSummary(week: summary.week, totalWeeks: summary.totalWeeks,
                         streak: summary.streak, days: days)
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

    // Statement grammar (spec 09): the headline speaks in the app's voice —
    // "Pull day." — and the subline is a mono data line, not a sentence.
    private var headline: String {
        guard let d = day else { return "Open Supero." }
        if d.done { return "\(d.type), done." }
        return d.isRest ? "Rest day." : "\(d.type) day."
    }

    private var subline: String {
        guard let d = day, let s = entry.summary else { return "SET UP YOUR PLAN" }
        if d.done { return "NICE WORK · WK \(s.week)" }
        if d.isRest { return "RECOVER WELL" }
        return d.lifts > 0 ? "\(d.lifts) LIFTS · ~\(d.lifts * 8) MIN" : "LOG IT WHEN DONE"
    }

    private var metaLine: String {
        let f = DateFormatter(); f.dateFormat = "EEE"
        let dow = f.string(from: entry.date).uppercased()
        guard let s = entry.summary else { return "SUPERO" }
        return "\(dow) · WK \(s.week) / \(s.totalWeeks)"
    }

    // Lock Screen circular: glyph + compressed day label.
    private var circularLabel: String {
        guard let d = day else { return "—" }
        if d.done { return "DONE" }
        if d.isRest { return "REST" }
        return String(d.type.prefix(5)).uppercased()
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            VStack(spacing: 1) {
                Image(systemName: day?.done == true ? "checkmark" : "dumbbell.fill")
                    .font(.system(size: 13, weight: .bold))
                Text(circularLabel)
                    .font(.system(size: 9, weight: .heavy, design: .monospaced))
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.summary != nil ? "SUPERO · WK \(entry.summary!.week)" : "SUPERO")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
                Text(headline)
                    .font(.system(size: 14, weight: .heavy))
                Text(subline)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            homeBody
        }
    }

    private var homeBody: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(metaLine)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .kerning(0.8)
                    .foregroundColor(.secondary)
                Spacer()
                if day?.done == true {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(lime)
                } else {
                    Circle().fill(lime).frame(width: 6, height: 6)
                }
            }
            Spacer(minLength: 0)
            // One emphasis per surface: the statement stays white; lime is the
            // status dot and the Start capsule.
            Text(headline)
                .font(.system(size: family == .systemMedium ? 26 : 20, weight: .heavy))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(subline)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .kerning(0.5)
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
                    if let d = day, !d.done, !d.isRest {
                        Text("Start →")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundColor(.black)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(lime))
                    } else {
                        Text("STREAK \(s.streak)W")
                            .font(.system(size: 9, weight: .semibold, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
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

// Home-screen families get the black editorial card; Lock Screen accessories
// must stay clear so the system's vibrant material shows through.
struct SuperoTodayEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry

    private var isAccessory: Bool {
        family == .accessoryCircular || family == .accessoryRectangular
    }

    var body: some View {
        if #available(iOS 17.0, *) {
            SuperoTodayView(entry: entry)
                .containerBackground(for: .widget) {
                    if isAccessory { Color.clear } else { Color.black }
                }
        } else {
            SuperoTodayView(entry: entry)
                .background(isAccessory ? Color.clear : Color.black)
        }
    }
}

struct SuperoTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SuperoTodayWidget", provider: SuperoTodayProvider()) { entry in
            SuperoTodayEntryView(entry: entry)
        }
        .configurationDisplayName("Today's Session")
        .description("Your next workout, week progress, and streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
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
