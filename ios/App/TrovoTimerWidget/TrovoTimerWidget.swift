import ActivityKit
import WidgetKit
import SwiftUI

// The summary's top-level accent (the Lime for paper rooms): only the Home
// Screen widget's fallback for a summary without a `theme` (pages before
// 20260922-5). The rest Live Activity wears the room (TrovoRestViews.swift).
private let limeDefault = Color(red: 0.78, green: 1.0, blue: 0.0)
// Parsed once per distinct summary string: every view body read `lime`
// several times and each read re-parsed the whole summary JSON.
private var _limeCache: (json: String, color: Color)? = nil
private var lime: Color {
    guard let json = UserDefaults(suiteName: "group.app.kt.trainer")?
            .string(forKey: "superoWidgetSummary") else { return limeDefault }
    if let c = _limeCache, c.json == json { return c.color }
    var color = limeDefault
    if let data = json.data(using: .utf8),
       let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
       let hex = obj["accent"] as? String, let parsed = Color(hex: hex) {
        color = parsed
    }
    _limeCache = (json, color)
    return color
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

// Grey for the Home Screen widget's dark card (the Lime room). .secondary
// follows the phone's appearance, so in light mode it drew dark grey on black.
private let dimOnDark = Color(white: 0.62)

// The rest timer wears the phone's room (TrovoRestViews.swift draws it): the
// Lock Screen card in the room's colours and type, the Dynamic Island in the
// accent tuned for black. The room rides on the activity; a page before
// 20261001-1 sends none, so the Home Screen widget's summary decides, then Lime.
struct TrovoTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrovoTimerAttributes.self) { context in
            // ── Lock Screen / StandBy banner ─────────────────────────────
            let m = restModel(context), p = restPalette(context)
            RestLockScreen(m: m, p: p)
                .activityBackgroundTint(p.lockBackground)
                .activitySystemActionForegroundColor(p.lockActionForeground)
        } dynamicIsland: { context in
            let m = restModel(context), p = restPalette(context)
            return DynamicIsland {
                // Expanded (long-press)
                DynamicIslandExpandedRegion(.leading) { RestExpandedLeading(m: m, p: p) }
                DynamicIslandExpandedRegion(.trailing) { RestExpandedTrailing(m: m, p: p) }
                DynamicIslandExpandedRegion(.center) { RestExpandedCenter(m: m, p: p) }
                DynamicIslandExpandedRegion(.bottom) { RestExpandedBottom(m: m, p: p) }
            } compactLeading: {
                RestCompactLeading(m: m, p: p)
            } compactTrailing: {
                RestCompactTrailing(m: m, p: p)
            } minimal: {
                RestMinimal(m: m, p: p)
            }
            .keylineTint(p.keyline)
        }
    }
}

private func restModel(_ c: ActivityViewContext<TrovoTimerAttributes>) -> RestModel {
    let s = c.state
    // An activity started by a shell before build 57 has no start: assume the default 90 s rest.
    return RestModel(exerciseName: c.attributes.exerciseName, nextSet: s.nextSet, totalSets: s.totalSets,
                     detail: s.detail, start: s.startDate ?? s.endDate.addingTimeInterval(-90), end: s.endDate)
}

private func restPalette(_ c: ActivityViewContext<TrovoTimerAttributes>) -> RestPalette {
    RestPalette.of(c.attributes.theme ?? loadSummary()?.theme.map(TimerTheme.init(widget:)))
}

extension TimerTheme {
    // The Home Screen widget's copy of the room (pages from 20260922-5).
    init(widget t: WidgetTheme) {
        self.init(room: t.paper == true ? "heavyweight" : "dark", paper: t.paper, bg: t.bg, card: nil, text: t.text,
                  muted: t.muted, accent: t.accent, onAccent: t.onAccent, earned: nil, earnedInk: t.earnedInk, satAccent: nil)
    }
}

// ── Home Screen widget: today's session at a glance ──────────────────────────
// Reads the JSON summary the app writes into the App Group via
// TrovoWidgetPlugin. Timeline entries are generated per midnight so the
// widget rolls over to the next day's plan without the app being opened.

struct SummaryDay: Decodable {
    let date: String       // yyyy-MM-dd (local)
    let type: String       // slot id: "Push" / "Rest" / "Run" / sport id — identity, never shown
    let label: String?     // what the user calls the day ("Chest + Back"); pages before 20260921-6 omit it
    let short: String?     // the same, fitted to a chip ("C+B")
    let isRest: Bool
    let lifts: Int         // exercise count for lift days, else 0
    let done: Bool         // session already logged that day

    var name: String { label ?? type }
    var chip: String { short ?? String(type.prefix(5)) }
}

// The phone's room, as the page sends it: Heavyweight is paper/ink/blue,
// Lime is near-black/lime. Pages before 20260922-5 send none.
struct WidgetTheme: Decodable {
    let paper: Bool?
    let bg: String?
    let text: String?
    let muted: String?
    let accent: String?
    let onAccent: String?
    let earnedInk: String?
}

struct WidgetSummary: Decodable {
    let week: Int
    let totalWeeks: Int
    let streak: Int
    let streakDays: Int?       // THE streak (scheduled training days); older summaries omit it
    let days: [SummaryDay]
    let theme: WidgetTheme?

    func with(days: [SummaryDay]) -> WidgetSummary {
        WidgetSummary(week: week, totalWeeks: totalWeeks, streak: streak,
                      streakDays: streakDays, days: days, theme: theme)
    }
}

// Colours for the Home Screen card. Every colour is explicit: .secondary
// follows the phone's appearance, not the card, and vanished on the black
// card in light mode.
struct WidgetPalette {
    let bg: Color, text: Color, muted: Color, accent: Color, onAccent: Color, done: Color, faint: Color

    static func of(_ theme: WidgetTheme?) -> WidgetPalette {
        if let t = theme, t.paper == true {
            let ink = t.text.flatMap { Color(hex: $0) } ?? Color(red: 0.06, green: 0.06, blue: 0.06)
            return WidgetPalette(
                bg: t.bg.flatMap { Color(hex: $0) } ?? Color(red: 0.97, green: 0.96, blue: 0.94),
                text: ink,
                muted: t.muted.flatMap { Color(hex: $0) } ?? Color(red: 0.42, green: 0.42, blue: 0.4),
                accent: t.accent.flatMap { Color(hex: $0) } ?? Color(red: 0.04, green: 0.26, blue: 0.96),
                onAccent: t.onAccent.flatMap { Color(hex: $0) } ?? .white,
                done: t.earnedInk.flatMap { Color(hex: $0) } ?? Color(red: 0.31, green: 0.44, blue: 0),
                faint: ink.opacity(0.18))
        }
        let acc = theme?.accent.flatMap { Color(hex: $0) } ?? lime
        return WidgetPalette(
            bg: theme?.bg.flatMap { Color(hex: $0) } ?? .black,
            text: .white, muted: dimOnDark, accent: acc,
            onAccent: theme?.onAccent.flatMap { Color(hex: $0) } ?? .black,
            done: acc, faint: Color.white.opacity(0.25))
    }
}

func loadSummary() -> WidgetSummary? {
    guard let json = UserDefaults(suiteName: "group.app.kt.trainer")?
            .string(forKey: "superoWidgetSummary"),
          let data = json.data(using: .utf8) else { return nil }
    let summary = try? JSONDecoder().decode(WidgetSummary.self, from: data)
    return summary.map(applyPendingWorkouts).map(applyWatchDone)
}

// Workouts harvested by background delivery but not yet drained by the app
// live in the App Group as pendingHealthWorkouts. Overlay them so a cardio
// day flips to "done" right after the watch workout ends, even if the app
// hasn't been opened since.
// Wrist-finished lift sessions land in standard defaults (invisible here)
// until the phone app drains them — the plugin mirrors their DATES into the
// App Group so lift days flip to done immediately.
private func applyWatchDone(_ summary: WidgetSummary) -> WidgetSummary {
    guard let done = UserDefaults(suiteName: "group.app.kt.trainer")?
            .stringArray(forKey: "pendingWatchDone"), !done.isEmpty else { return summary }
    // Only a scheduled lift day flips — a wrist session on a Run or Rest day
    // used to render "Run, done." until the next day's summary.
    let days = summary.days.map { d -> SummaryDay in
        guard !d.done, !d.isRest, d.lifts > 0, done.contains(d.date) else { return d }
        return SummaryDay(date: d.date, type: d.type, label: d.label, short: d.short, isRest: d.isRest, lifts: d.lifts, done: true)
    }
    return summary.with(days: days)
}
private func applyPendingWorkouts(_ summary: WidgetSummary) -> WidgetSummary {
    guard let data = UserDefaults(suiteName: "group.app.kt.trainer")?
            .data(forKey: "pendingHealthWorkouts"),
          let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
          !arr.isEmpty else { return summary }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime]
    let dayFmt = DateFormatter()
    dayFmt.locale = Locale(identifier: "en_US_POSIX")
    dayFmt.dateFormat = "yyyy-MM-dd"
    let pendingDays = Set(arr.compactMap { entry -> String? in
        guard let s = entry["startDate"] as? String, let d = iso.date(from: s) else { return nil }
        return dayFmt.string(from: d)
    })
    guard !pendingDays.isEmpty else { return summary }
    let days = summary.days.map { d -> SummaryDay in
        // Only cardio days (not rest, no lifts planned) get auto-completed.
        guard !d.done, !d.isRest, d.lifts == 0, pendingDays.contains(d.date) else { return d }
        return SummaryDay(date: d.date, type: d.type, label: d.label, short: d.short, isRest: d.isRest, lifts: d.lifts, done: true)
    }
    return summary.with(days: days)
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let summary: WidgetSummary?
    let dayIndex: Int      // which entry of summary.days this entry shows
    // The room, kept even when the summary does not cover today (the card
    // then says "Open Fitness Programmer." but stays paper in Heavyweight).
    var theme: WidgetTheme? = nil
    var palette: WidgetPalette { WidgetPalette.of(summary?.theme ?? theme) }
}

struct SuperoTodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), summary: nil, dayIndex: 0)
    }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        // Aligned on today like the timeline is: the gallery preview used to
        // show days[0] (the day the app last ran) under today's weekday.
        let s = loadSummary()
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let todayKey = f.string(from: Date())
        if let s = s, let i = s.days.firstIndex(where: { $0.date == todayKey }) {
            completion(TodayEntry(date: Date(), summary: s, dayIndex: i))
        } else {
            completion(TodayEntry(date: Date(), summary: nil, dayIndex: 0, theme: s?.theme))
        }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let summary = loadSummary()
        let cal = Calendar.current
        let now = Date()
        // Align on the CALENDAR date, not array position: days[0] is the day
        // the app last wrote the summary, so a timeline rebuilt on a later
        // day (reboot, re-add, budgeted reload) used to show a shifted plan
        // under a correct weekday label.
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let todayKey = f.string(from: now)
        guard let s = summary, let start = s.days.firstIndex(where: { $0.date == todayKey }) else {
            // Nothing the app wrote covers today — say so rather than guess,
            // and ask again at midnight.
            let nextMidnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) ?? now.addingTimeInterval(3600)
            completion(Timeline(entries: [TodayEntry(date: now, summary: nil, dayIndex: 0, theme: summary?.theme)], policy: .after(nextMidnight)))
            return
        }
        var entries: [TodayEntry] = [TodayEntry(date: now, summary: s, dayIndex: start)]
        // One entry per upcoming midnight, showing that day's plan.
        for i in (start + 1)..<min(s.days.count, start + 7) {
            if let midnight = cal.date(byAdding: .day, value: i - start, to: cal.startOfDay(for: now)) {
                entries.append(TodayEntry(date: midnight, summary: s, dayIndex: i))
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
    private var pal: WidgetPalette { entry.palette }
    // iOS 17+ already insets widget content by the system margin; padding on
    // top of it left the small card ~110 pt wide and cut "Chest + Back day."
    // to "Chest + Back…". iOS 16 has no system margin, so pad there only.
    private var ownPadding: CGFloat {
        if #available(iOS 17.0, *) { return 0 }
        return 14
    }

    // Statement grammar (spec 09): the headline speaks in the app's voice —
    // "Pull day." — and the subline is a mono data line, not a sentence.
    private var headline: String {
        guard let d = day else { return "Open Fitness Programmer." }
        if d.done { return "\(d.name), done." }
        return d.isRest ? "Rest day." : "\(d.name) day."
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
        guard let s = entry.summary else { return "FITNESS PROGRAMMER" }
        return "\(dow) · WK \(s.week) / \(s.totalWeeks)"
    }

    // Lock Screen circular: glyph + compressed day label.
    private var circularLabel: String {
        guard let d = day else { return "—" }
        if d.done { return "DONE" }
        if d.isRest { return "REST" }
        return d.chip.uppercased()
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
                Text(metaLine)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Text(headline)
                    .font(.system(size: 14, weight: .heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(subline)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
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
                    .foregroundColor(pal.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                if day?.done == true {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(pal.done)
                } else {
                    Circle().fill(pal.accent).frame(width: 6, height: 6)
                }
            }
            Spacer(minLength: 0)
            // One emphasis per surface: the statement stays in the text colour;
            // the accent is the status dot and the Start capsule. The small card
            // gives a day name two lines rather than an ellipsis.
            Text(headline)
                .font(.system(size: family == .systemMedium ? 26 : 22, weight: .heavy))
                .foregroundColor(pal.text)
                .lineLimit(family == .systemMedium ? 1 : 2)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
            Text(subline)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .kerning(0.5)
                .foregroundColor(pal.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            if family == .systemMedium, let s = entry.summary {
                HStack(spacing: 10) {
                    ForEach(Array(s.days.enumerated().dropFirst(entry.dayIndex + 1).prefix(4)),
                            id: \.offset) { _, d in
                        VStack(spacing: 2) {
                            Text(shortDow(d.date))
                                .font(.system(size: 8, weight: .semibold, design: .monospaced))
                                .foregroundColor(pal.muted)
                            Circle()
                                .fill(d.isRest ? pal.faint : pal.accent)
                                .frame(width: 5, height: 5)
                        }
                    }
                    Spacer()
                    // Start means the runner: only a lift day offers it. A Run
                    // day's capsule used to land on "No lift session scheduled".
                    if let d = day, !d.done, !d.isRest, d.lifts > 0 {
                        Text("Start →")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundColor(pal.onAccent)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(pal.accent))
                    } else {
                        Text(s.streakDays != nil ? "STREAK \(s.streakDays!)D" : "STREAK \(s.streak)W")
                            .font(.system(size: 9, weight: .semibold, design: .monospaced))
                            .foregroundColor(pal.muted)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(ownPadding)
        // "Start →" means start: the whole widget deep-links into today's session.
        .widgetURL(URL(string: "trovo://start"))
    }

    private func shortDow(_ iso: String) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: iso) else { return "" }
        let out = DateFormatter(); out.dateFormat = "EE"
        return out.string(from: d).uppercased()
    }
}

// Home-screen families get the editorial card in the phone's room (paper for
// Heavyweight, near-black for Lime); Lock Screen accessories must stay clear so
// the system's vibrant material shows through.
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
                    if isAccessory { Color.clear } else { entry.palette.bg }
                }
        } else {
            SuperoTodayView(entry: entry)
                .background(isAccessory ? Color.clear : entry.palette.bg)
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
