import SwiftUI

// ── Rest Live Activity: the model, the live pieces and the views ────────────
// Pure SwiftUI (no ActivityKit / WidgetKit), so screenshots/live-activity can draw
// the same views on the Mac and inside the iOS simulator. TimerTheme lives in
// TrovoTimerAttributes.swift (the app needs it too); Color(hex:) in TrovoTimerWidget.swift.

// Everything a rest presentation shows.
struct RestModel {
    var exerciseName: String
    var nextSet: Int
    var totalSets: Int
    var detail: String?            // "77.5 lb × 10" (or "Overhead Press · 100 lb × 8"), in the user's units
    var start: Date                // when this rest's granted time began (end - total)
    var end: Date
    var isDone: Bool { end <= Date() }
}

// The two rooms' tokens, exactly as THEMES in index.html holds them: the fallbacks
// for a theme that leaves a token out (and for no theme at all: Lime).
enum Rooms {
    static let heavyweight = TimerTheme(room: "heavyweight", paper: true, bg: "#f7f5ef", card: "#ffffff", text: "#0f0f0f",
        muted: "#6b6b66", accent: "#0a43f5", onAccent: "#ffffff", earned: "#b7f000", earnedInk: "#4f7000", satAccent: "#4d7cff")
    static let lime = TimerTheme(room: "dark", paper: false, bg: "#0b0b0c", card: "#151517", text: "#f4f4f1",
        muted: "#8c8c91", accent: "#d8ff63", onAccent: "#0b0b0c", earned: "#d8ff63", earnedInk: "#d8ff63", satAccent: "#d8ff63")
}

// ── Live pieces ──────────────────────────────────────────────────────────────
// A Live Activity cannot run code once a second: only Text(timerInterval:) and
// ProgressView(timerInterval:) move by themselves. These wrappers are the ONLY
// moving parts the views may use. On iOS they are the system's live views; the
// macOS mockup renderer draws a still of the same moment.

// The remaining time, counting down. nil once the rest is over: a ClosedRange
// whose end has passed traps, so a stale render shows a done state instead.
func restCountdown(_ m: RestModel) -> Text? {
    let now = Date()
    guard m.end > now else { return nil }
    return Text(timerInterval: now...m.end, countsDown: true)
}

// Fraction of the granted rest still to go (1 → 0), for the stills.
func restRemaining(_ m: RestModel) -> Double {
    let total = m.end.timeIntervalSince(m.start)
    guard total > 0 else { return 0 }
    return max(0, min(1, m.end.timeIntervalSince(Date()) / total))
}

// The draining bar: full when the rest starts, empty at the end (like the
// in-app rest bar). On iOS the track is the system's own translucent grey and
// the bar is ~4 pt; `track` and `height` only shape the mockup still.
struct RestBar: View {
    let m: RestModel; let tint: Color; var track: Color = Color.gray.opacity(0.25); var height: CGFloat = 4
    var body: some View {
        #if os(iOS)
        if m.start < m.end && m.end > Date() {
            ProgressView(timerInterval: m.start...m.end, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear)
                .tint(tint)
        } else {
            Capsule().fill(track).frame(height: height)
        }
        #else
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(tint).frame(width: g.size.width * restRemaining(m))
            }
        }
        .frame(height: height)
        #endif
    }
}

// The draining ring (Dynamic Island): the same countdown as a circle.
struct RestRing: View {
    let m: RestModel; let tint: Color; var track: Color = Color.white.opacity(0.18); var lineWidth: CGFloat = 3
    var body: some View {
        #if os(iOS)
        if m.start < m.end && m.end > Date() {
            ProgressView(timerInterval: m.start...m.end, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.circular)
                .tint(tint)
        } else {
            Circle().stroke(track, lineWidth: lineWidth)
        }
        #else
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle().trim(from: 0, to: restRemaining(m)).stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        #endif
    }
}

// ── Rest Live Activity · "The Poster Clock" ──────────────────────────────────
// The countdown leads, as large as the card allows, in the room's clock face:
// Anton poster numerals in Heavyweight, the light JetBrains Mono clock in Lime.
// Beside it a quiet column (REST · the set, the lift, what is next) sits on
// the clock's cap line and baseline. The room's draining bar anchors the
// bottom edge, as on the in-app REST card: the one accent while the rest runs.
// The Dynamic Island repeats the same row on the system's black.
//
// Six faces, bundled in the widget extension (Font.custom falls back to SF
// without a word when one is missing): AntonFP-Regular and ArchivoFP-Bold for
// Heavyweight; JetBrainsMonoFP-Clock, JetBrainsMonoFP-Bold, InterFP-ExtraBold
// and InterFP-Bold for Lime.
//
// Only restCountdown / RestBar / RestRing move: no timers, no animation.

// MARK: - Faces

// A bundled face: its cap height and the advances a clock needs, in em,
// measured from the FP subsets. Lines are laid out by their cap box, the box
// these faces' ink actually fills, so the column can sit on the clock's cap
// line and baseline, and a clock's frame is worked out rather than guessed.
fileprivate struct RestFace {
    let name: String
    let cap: CGFloat
    let lsb: CGFloat        // the digits' left side bearing, for optical alignment
    let digit: CGFloat      // a digit's advance (Anton's 1 is narrower: `one`)
    let one: CGFloat
    let colon: CGFloat
    let go: CGFloat         // "GO", the done state
    func font(_ size: CGFloat) -> Font { .custom(name, fixedSize: size) }
    func capHeight(_ size: CGFloat) -> CGFloat { (cap * size).rounded(.up) }
}

private enum Faces {
    static let anton = RestFace(name: "AntonFP-Regular", cap: 1760.0 / 2048,
                                lsb: 0.02, digit: 0.494, one: 0.331, colon: 0.242, go: 0.971)
    static let archivo = RestFace(name: "ArchivoFP-Bold", cap: 0.686,
                                  lsb: 0.045, digit: 0.596, one: 0.596, colon: 0.335, go: 1.595)
    static let interExtraBold = RestFace(name: "InterFP-ExtraBold", cap: 1490.0 / 2048,
                                         lsb: 0.04, digit: 0.692, one: 0.441, colon: 0.353, go: 1.525)
    static let interBold = RestFace(name: "InterFP-Bold", cap: 1490.0 / 2048,
                                    lsb: 0.046, digit: 0.676, one: 0.431, colon: 0.334, go: 1.521)
    static let monoClock = RestFace(name: "JetBrainsMonoFP-Clock", cap: 0.73,
                                    lsb: 0.086, digit: 0.6, one: 0.6, colon: 0.6, go: 1.2)
    static let monoBold = RestFace(name: "JetBrainsMonoFP-Bold", cap: 0.73,
                                   lsb: 0.068, digit: 0.6, one: 0.6, colon: 0.6, go: 1.2)
}

fileprivate extension View {
    // One line of text laid out as its cap box: the line keeps its natural height
    // (fixedSize, so minimumScaleFactor only ever answers to width) and its
    // baseline is pinned to the bottom of a frame exactly as tall as the caps.
    func restCapBox(_ f: RestFace, _ size: CGFloat, alignment: HorizontalAlignment = .leading) -> some View {
        self.fixedSize(horizontal: false, vertical: true)
            .alignmentGuide(.bottom) { d in d[.lastTextBaseline] }
            .frame(height: f.capHeight(size), alignment: Alignment(horizontal: alignment, vertical: .bottom))
    }
}

// MARK: - Palette

// #RRGGBB as components, so derived tones are solid mixes (no opacity stacking).
private struct RGB {
    var r: Double, g: Double, b: Double
    init(_ r: Double, _ g: Double, _ b: Double) { self.r = r; self.g = g; self.b = b }
    init?(_ hex: String?) {
        guard var h = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt64(h, radix: 16) else { return nil }
        r = Double((v >> 16) & 0xff) / 255; g = Double((v >> 8) & 0xff) / 255; b = Double(v & 0xff) / 255
    }
    func mix(_ o: RGB, _ t: Double) -> RGB { RGB(r + (o.r - r) * t, g + (o.g - g) * t, b + (o.b - b) * t) }
    var color: Color { Color(red: r, green: g, blue: b) }
}

struct RestPalette {
    let paper: Bool                 // Heavyweight's grammar (Anton + Archivo) or Lime's (JetBrains Mono + Inter)

    // Lock Screen card
    let lockBackground: Color       // activityBackgroundTint: Heavyweight's paper, Lime's rest card
    let ink: Color                  // clock, lift, load
    let label: Color                // REST: ink on paper (the app's REST at full opacity), muted in Lime
    let meta: Color                 // UP NEXT · SET n OF m: --lite on paper, muted in Lime
    let lite: Color                 // a superset partner's name
    let action: Color               // the draining bar and GO: the room's action colour
    let track: Color                // the bar's track (mockup still only; iOS draws its own)

    // Dynamic Island: always on the system's black
    let isText: Color
    let isLabel: Color
    let isMeta: Color
    let isLite: Color
    let isAccent: Color             // satellite blue (Heavyweight) / lime (Lime)
    let isTrack: Color

    var lockActionForeground: Color { action }
    var keyline: Color { isAccent }

    // Type roles
    fileprivate var clockFace: RestFace { paper ? Faces.anton : Faces.monoClock }
    fileprivate var clockTrack: CGFloat { paper ? 0.01 : -0.035 }          // em, as the in-app clock
    fileprivate var nameFace: RestFace { paper ? Faces.anton : Faces.interExtraBold }
    fileprivate var nameTrack: CGFloat { paper ? 0 : -0.035 }
    fileprivate var eyebrowFace: RestFace { paper ? Faces.archivo : Faces.monoBold }
    fileprivate var eyebrowTrack: CGFloat { paper ? 0.1 : 0.12 }
    fileprivate var valueFace: RestFace { paper ? Faces.archivo : Faces.interBold }
    // The island's small numerals: Anton reads at any size; the 250-weight clock
    // is too thin at status-bar sizes, so Lime steps up to Bold there.
    fileprivate var smallClockFace: RestFace { paper ? Faces.anton : Faces.monoBold }
    fileprivate var smallClockTrack: CGFloat { paper ? 0.012 : -0.02 }

    static func of(_ t: TimerTheme?) -> RestPalette {
        // nil theme = a page from before the redesign: the Lime room. The Home
        // Screen summary's copy of the room has no card, earned or satAccent:
        // the room's own values stand in.
        let paper = t?.room == "heavyweight" || (t?.room != "dark" && t?.paper == true)
        let d = paper ? Rooms.heavyweight : Rooms.lime
        func tok(_ v: String?, _ fallback: String?) -> RGB { RGB(v) ?? RGB(fallback) ?? RGB(0.5, 0.5, 0.5) }
        let bg = tok(t?.bg, d.bg), card = tok(t?.card, d.card)
        let text = tok(t?.text, d.text), muted = tok(t?.muted, d.muted)
        let accent = tok(t?.accent, d.accent)
        let sat = RGB(t?.satAccent) ?? (paper ? tok(nil, d.satAccent) : accent)
        let lite = text.mix(muted, 0.5)                         // the app's --lite, in both rooms
        let black = RGB(0, 0, 0)
        if paper {
            return RestPalette(
                paper: true,
                lockBackground: bg.color, ink: text.color, label: text.color, meta: lite.color, lite: lite.color,
                action: accent.color, track: text.mix(bg, 0.9).color,
                isText: bg.color, isLabel: bg.color, isMeta: bg.mix(black, 0.42).color, isLite: bg.mix(black, 0.22).color,
                isAccent: sat.color, isTrack: Color.white.opacity(0.18))
        }
        return RestPalette(
            paper: false,
            lockBackground: card.color, ink: text.color, label: muted.color, meta: muted.color, lite: lite.color,
            action: accent.color, track: text.mix(card, 0.86).color,
            isText: text.color, isLabel: muted.color, isMeta: muted.color, isLite: lite.color,
            isAccent: sat.color, isTrack: Color.white.opacity(0.18))
    }
}

// MARK: - Words

// "SET 2 OF 3"; past the plan (the runner's +1 set) just "SET 4"; nothing
// when the page sends no set.
private func setOf(_ m: RestModel) -> (caps: String, words: String)? {
    guard m.nextSet > 0 else { return nil }
    if m.nextSet <= m.totalSets { return ("SET \(m.nextSet) OF \(m.totalSets)", "Set \(m.nextSet) of \(m.totalSets)") }
    return ("SET \(m.nextSet)", "Set \(m.nextSet)")
}

// The next set's load as sent, or nil (older pages send none; blank is none).
private func cleanDetail(_ m: RestModel) -> String? {
    guard let d = m.detail?.trimmingCharacters(in: .whitespacesAndNewlines), !d.isEmpty else { return nil }
    return d
}

// "Overhead Press · 100 lb × 8" (an older page's superset partner) → the
// partner and the load. A load alone, or a load with a suffix, stays whole.
private func splitDetail(_ d: String) -> (partner: String?, load: String) {
    if let r = d.range(of: " · ") {
        let a = d[..<r.lowerBound].trimmingCharacters(in: .whitespaces)
        let b = d[r.upperBound...].trimmingCharacters(in: .whitespaces)
        if !a.isEmpty && !b.isEmpty && !a.contains("×") { return (a, b) }
    }
    return (nil, d)
}

// What the column says. The set rides in the eyebrow ("REST · SET 2 OF 3")
// only while the load has the NEXT line; with no load the set takes the
// load's place there ("NEXT  Set 3 of 3"), so it is never said twice. With
// neither there is no NEXT line.
private struct RestWords {
    let eyebrowSet: String?     // "SET 2 OF 3"
    let partner: String?        // an older page's superset partner
    let value: String?          // the load, or the set in words
}

private func restWords(_ m: RestModel) -> RestWords {
    let set = setOf(m)
    if let d = cleanDetail(m) {
        let parts = splitDetail(d)
        return RestWords(eyebrowSet: set?.caps, partner: parts.partner, value: parts.load)
    }
    return RestWords(eyebrowSet: nil, partner: nil, value: set?.words)
}

// What VoiceOver reads for the column, in the lift's own case (Heavyweight
// sets it in caps): "Rest. Tricep Pushdown. Up next, set 2 of 3, 77.5 lb × 10".
private func spoken(_ m: RestModel, done: Bool, withRest: Bool) -> String {
    var parts: [String] = []
    if withRest { parts.append(done ? "Rest done" : "Rest") }
    parts.append(m.exerciseName)
    var next: [String] = []
    if let s = setOf(m) { next.append(s.words.lowercased()) }
    if let d = cleanDetail(m) { next.append(d) }
    if !next.isEmpty { parts.append((done ? "Up now, " : "Up next, ") + next.joined(separator: ", ")) }
    return parts.joined(separator: ". ")
}

// MARK: - Clock

// The widest the countdown can read from now to its end, in em (tracking
// aside), and its length. It only counts down, so a frame that fits now fits
// every later value; the reverse is not true: Anton's 1 is narrow, so the
// 0:59 that follows 1:00 is wider.
private func clockMeasure(_ m: RestModel, _ f: RestFace) -> (em: CGFloat, chars: Int) {
    // Rounded up: iOS first draws a fresh 10:00 rest with 599.9 s to go, and it reads 10:00.
    let left = max(0, m.end.timeIntervalSince(Date())).rounded(.up)
    if left >= 3600 { return (5 * f.digit + 2 * f.colon, 7) }        // h:mm:ss (never, in practice)
    if left >= 1200 { return (4 * f.digit + f.colon, 5) }
    if left >= 600 { return (f.one + 3 * f.digit + f.colon, 5) }
    return (3 * f.digit + f.colon, 4)
}

// The countdown, or GO once the rest is over, in a room face. Its frame is
// always explicit (Text(timerInterval:) can claim extra width on iOS) and is
// worked out from the face's real advances, so the time draws at the size
// asked for and never leans on minimumScaleFactor (kept only as a backstop).
// With a `slot`, a longer time (a rest of ten minutes or more) steps down in
// size to keep the same width, so the layout never moves; `maxWidth` caps a
// clock that hugs its time. A leading clock is pulled left by its side
// bearing, so its ink starts on the edge the bar starts on.
private struct RestClock: View {
    let m: RestModel
    let face: RestFace
    let size: CGFloat
    let track: CGFloat                  // em
    var slot: CGFloat? = nil            // width kept while the rest runs; nil hugs the time
    var maxWidth: CGFloat? = nil
    let alignment: HorizontalAlignment
    let color: Color
    let doneColor: Color
    var slack: CGFloat = 4
    var doneSpoken: String? = "Rest done"   // what VoiceOver says for GO; nil when a neighbour already says it

    // Width per point of size for a string of `chars` characters `em` wide.
    // Kerning is budgeted the safe way for its sign: all of a positive
    // tracking (in case the last letter keeps its own), none of the last
    // letter's negative tracking (in case it does not).
    static func perPoint(_ em: CGFloat, _ chars: Int, _ track: CGFloat) -> CGFloat {
        em + CGFloat(track > 0 ? chars : max(0, chars - 1)) * track
    }

    // The slot for an m:ss clock at full size.
    static func slot(_ f: RestFace, _ size: CGFloat, _ track: CGFloat, slack: CGFloat = 4) -> CGFloat {
        (perPoint(3 * f.digit + f.colon, 4, track) * size + slack).rounded(.up)
    }

    var body: some View {
        let t = restCountdown(m)
        let fixed = t == nil ? nil : slot           // GO hugs its two letters
        let measure = t == nil ? (em: face.go, chars: 2) : clockMeasure(m, face)
        let perPoint = RestClock.perPoint(measure.em, measure.chars, track)
        var fitted = size
        if let s = fixed { fitted = min(fitted, (s - slack) / perPoint) }
        if let mw = maxWidth { fitted = min(fitted, (mw - slack) / perPoint) }
        let width = fixed ?? min((perPoint * fitted + slack).rounded(.up), maxWidth ?? .greatestFiniteMagnitude)
        return Group {
            if let t = t {
                t.font(face.font(fitted)).kerning(track * fitted).foregroundColor(color)
            } else {
                Text("GO").font(face.font(fitted)).kerning(track * fitted).foregroundColor(doneColor)
                    .accessibilityLabel(Text(doneSpoken ?? ""))
                    .accessibilityHidden(doneSpoken == nil)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .multilineTextAlignment(alignment == .trailing ? .trailing : (alignment == .center ? .center : .leading))
        .frame(width: width, alignment: Alignment(horizontal: alignment, vertical: .center))
        .offset(x: alignment == .leading ? -face.lsb * fitted : 0)
        .restCapBox(face, fitted, alignment: alignment)
    }
}

// MARK: - Column pieces

// An eyebrow: tracked caps, one line.
private func eyebrow(_ s: String, _ p: RestPalette, size: CGFloat, color: Color) -> some View {
    Text(s.uppercased())
        .font(p.eyebrowFace.font(size))
        .kerning(p.eyebrowTrack * size)
        .foregroundColor(color)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .restCapBox(p.eyebrowFace, size)
}

// The lift's name. One line at full size when it fits, then a step smaller,
// then two balanced lines set tight like the in-app poster heads (SwiftUI
// cannot tighten Anton's loose line gap, so the lines are stacked by hand).
private struct RestName: View {
    let name: String
    let p: RestPalette
    let size: CGFloat           // one line
    let size2: CGFloat          // each of two lines
    let color: Color

    private var shown: String { p.paper ? name.uppercased() : name }

    private func line(_ s: String, _ sz: CGFloat) -> some View {
        Text(s)
            .font(p.nameFace.font(sz))
            .kerning(p.nameTrack * sz)
            .foregroundColor(color)
            .lineLimit(1)
            .minimumScaleFactor(0.62)
            .restCapBox(p.nameFace, sz)
    }

    // The most balanced break: at a space, or after a hyphen when a long
    // single word has one (a space wins a tie). A tie in length puts the longer
    // line first.
    private var halves: (String, String)? {
        let s = shown
        var best: (String, String)? = nil
        var bestScore = Int.max
        var i = s.startIndex
        while i < s.endIndex {
            let ch = s[i], next = s.index(after: i)
            if ch == " " || ch == "-" {
                let a = String(ch == " " ? s[..<i] : s[..<next])
                let b = String(s[next...]).trimmingCharacters(in: .whitespaces)
                if !a.trimmingCharacters(in: .whitespaces).isEmpty && !b.isEmpty {
                    let score = max(a.count, b.count) * 2 + (b.count > a.count ? 1 : 0) + (ch == "-" ? 2 : 0)
                    if score < bestScore { bestScore = score; best = (a, b) }
                }
            }
            i = next
        }
        return best
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            line(shown, size).fixedSize(horizontal: true, vertical: false)
            line(shown, size * 0.85).fixedSize(horizontal: true, vertical: false)
            if let h = halves {
                VStack(alignment: .leading, spacing: size2 * (p.paper ? 0.17 : 0.3)) {
                    line(h.0, size2)
                    line(h.1, size2)
                }
            } else {
                line(shown, size2)
            }
        }
    }
}

// REST (REST DONE once it is over), then " · SET 2 OF 3" in the meta colour:
// the app's REST label is ink at full opacity, its secondary labels --lite.
private func restEyebrow(done: Bool, set: String?, _ p: RestPalette, size: CGFloat, color: Color, setColor: Color) -> some View {
    let f = p.eyebrowFace.font(size), k = p.eyebrowTrack * size
    let rest = Text(done ? "REST DONE" : "REST").font(f).kerning(k).foregroundColor(color)
    let line = set.map { s in Text("\(rest)\(Text(" · " + s).font(f).kerning(k).foregroundColor(setColor))") } ?? rest
    return line.lineLimit(1).minimumScaleFactor(0.8).restCapBox(p.eyebrowFace, size)
}

// "NEXT  77.5 lb × 10": a small tracked label, then the value in the body
// face. One line at full size when it fits, then smaller. Past that an older
// page's superset partner takes a line of its own and the load the line under
// it, so the load is never the part that gets cut.
private struct RestNextLine: View {
    let label: String
    let partner: String?
    let value: String
    let p: RestPalette
    let labelSize: CGFloat
    let size: CGFloat
    let labelColor: Color
    let partnerColor: Color
    let color: Color

    private func labelText(_ ls: CGFloat) -> Text {
        Text(label + (p.paper ? "\u{00A0}\u{00A0}" : "\u{00A0}"))
            .font(p.eyebrowFace.font(ls)).kerning(p.eyebrowTrack * ls).foregroundColor(labelColor)
    }
    private func valueText(_ s: String, _ sz: CGFloat, _ c: Color) -> Text {
        Text(s).font(p.valueFace.font(sz)).foregroundColor(c)
    }
    private func oneLine(_ scale: CGFloat) -> some View {
        let sz = size * scale
        let load = valueText(value, sz, color)
        let v = partner.map { Text("\(valueText($0 + " · ", sz, partnerColor))\(load)") } ?? load
        return Text("\(labelText(labelSize * scale))\(v)")
            .lineLimit(1).fixedSize(horizontal: true, vertical: false).restCapBox(p.valueFace, sz)
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            oneLine(1)
            oneLine(0.88)
            // A partner's line is long: rather than shrink the load further, the
            // partner takes the line above it.
            if partner == nil { oneLine(0.78) }
            if let partner = partner {
                let sz = size * 0.88
                VStack(alignment: .leading, spacing: sz * 0.42) {
                    Text("\(labelText(labelSize * 0.88))\(valueText(partner, sz, partnerColor))")
                        .lineLimit(1).minimumScaleFactor(0.75).restCapBox(p.valueFace, sz)
                    valueText(value, sz, color)
                        .lineLimit(1).minimumScaleFactor(0.7).restCapBox(p.valueFace, sz)
                }
            } else {
                Text("\(labelText(labelSize * 0.78))\(valueText(value, size * 0.78, color))")
                    .lineLimit(1).minimumScaleFactor(0.7).restCapBox(p.valueFace, size * 0.78)
            }
        }
    }
}

// One presentation's column sizes.
private struct ColumnType {
    let eyebrow: CGFloat
    let name: CGFloat           // one line
    let name2: CGFloat          // each of two lines
    let value: CGFloat
    let gap: CGFloat            // the least room between the column's lines
}

// The column beside the clock: the eyebrow on the clock's cap line, the next
// set on its baseline, the lift between. It spreads to the clock's height and
// grows past it only when a long name or a partner needs the room.
private struct RestColumn: View {
    let m: RestModel
    let p: RestPalette
    let onIsland: Bool
    let showEyebrow: Bool
    let k: ColumnType

    var body: some View {
        let done = restCountdown(m) == nil
        let w = restWords(m)
        VStack(alignment: .leading, spacing: 0) {
            if showEyebrow {
                restEyebrow(done: done, set: w.eyebrowSet, p, size: k.eyebrow,
                            color: onIsland ? p.isLabel : p.label, setColor: onIsland ? p.isMeta : p.meta)
                Spacer(minLength: k.gap)
            }
            RestName(name: m.exerciseName, p: p, size: k.name, size2: k.name2, color: onIsland ? p.isText : p.ink)
            if let v = w.value {
                Spacer(minLength: k.gap)
                RestNextLine(label: done ? "NOW" : "NEXT", partner: w.partner, value: v, p: p,
                             labelSize: k.eyebrow, size: k.value,
                             labelColor: onIsland ? p.isMeta : p.meta, partnerColor: onIsland ? p.isLite : p.lite,
                             color: onIsland ? p.isText : p.ink)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // One element, read as a sentence in the lift's own case.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(spoken(m, done: done, withRest: showEyebrow && !done)))   // GO says "Rest done"
    }
}

// Clock + column as one row, baselines locked: the row is as tall as the
// taller of the two (the fixedSize below) and the column stretches to it.
private struct RestPosterRow: View {
    let m: RestModel
    let p: RestPalette
    let onIsland: Bool
    let clockSize: CGFloat
    let gap: CGFloat
    let showEyebrow: Bool
    let k: ColumnType

    var body: some View {
        HStack(alignment: .bottom, spacing: gap) {
            RestClock(m: m, face: p.clockFace, size: clockSize, track: p.clockTrack,
                      slot: RestClock.slot(p.clockFace, clockSize, p.clockTrack),
                      alignment: .leading, color: onIsland ? p.isText : p.ink,
                      doneColor: onIsland ? p.isAccent : p.action,
                      doneSpoken: onIsland ? nil : "Rest done")        // on the island REST DONE is beside the camera
            RestColumn(m: m, p: p, onIsland: onIsland, showEyebrow: showEyebrow, k: k)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Lock Screen

struct RestLockScreen: View {
    let m: RestModel
    let p: RestPalette

    private func row(_ clock: CGFloat, _ gap: CGFloat) -> some View {
        RestPosterRow(m: m, p: p, onIsland: false, clockSize: clock, gap: gap, showEyebrow: true,
                      k: p.paper
                        ? ColumnType(eyebrow: 10.5, name: 24, name2: 19, value: 15, gap: 7)
                        : ColumnType(eyebrow: 10, name: 20, name2: 16, value: 14, gap: 7))
    }

    var body: some View {
        let big: CGFloat = p.paper ? 88 : 70, gap: CGFloat = p.paper ? 16 : 12
        VStack(alignment: .leading, spacing: 14) {
            // A narrow card (Display Zoom on a small phone leaves ~300 pt) steps the clock down so
            // the column keeps ~110 pt and "REST · SET 2 OF 3" is not cut. The big row states that
            // need as its ideal width, so ViewThatFits ignores the column's own (often long) text.
            ViewThatFits(in: .horizontal) {
                row(big, gap).frame(idealWidth: RestClock.slot(p.clockFace, big, p.clockTrack) + gap + 110)
                row(p.paper ? 66 : 52, p.paper ? 13 : 10)
            }
            RestBar(m: m, tint: p.action, track: p.track, height: 4)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 18)
        // The system draws the bar's track for the phone's appearance: pin it
        // to the card's, so a paper card never gets dark-mode chrome.
        .environment(\.colorScheme, p.paper ? .light : .dark)
        // One stop for VoiceOver: the live countdown, then the sentence.
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Dynamic Island (always the system's black: never paint a background)

// Compact: the draining ring beside the camera, the time on the far side.
struct RestCompactLeading: View {
    let m: RestModel
    let p: RestPalette
    var body: some View {
        RestRing(m: m, tint: p.isAccent, track: p.isTrack, lineWidth: 3)
            .frame(width: 19, height: 19)
            .padding(.leading, 2)
            .environment(\.colorScheme, .dark)
            .accessibilityHidden(true)
    }
}

// The time alone, its frame hugging the digits so the pill hugs the camera.
struct RestCompactTrailing: View {
    let m: RestModel
    let p: RestPalette
    var body: some View {
        RestClock(m: m, face: p.smallClockFace, size: p.paper ? 17 : 14.5, track: p.smallClockTrack,
                  alignment: .trailing, color: p.isText, doneColor: p.isAccent, slack: 2)
            .environment(\.colorScheme, .dark)
    }
}

// Minimal: what the island shows while another activity (music) shares it, so
// it is the time alone, as large as the circle allows.
struct RestMinimal: View {
    let m: RestModel
    let p: RestPalette
    var body: some View {
        let face = p.smallClockFace
        let five = clockMeasure(m, face).chars >= 5
        RestClock(m: m, face: face, size: p.paper ? 15 : 12, track: p.smallClockTrack,
                  maxWidth: five ? 27 : 30, alignment: .center, color: p.isText, doneColor: p.isAccent, slack: 2)
            .environment(\.colorScheme, .dark)
    }
}

// Expanded: the Lock Screen's eyebrow split around the camera (REST on the
// left, the set on the right), then its clock row across the bottom.
struct RestExpandedLeading: View {
    let m: RestModel
    let p: RestPalette
    var body: some View {
        eyebrow(restCountdown(m) == nil ? "REST DONE" : "REST", p, size: 11, color: p.isLabel)
            .padding(.leading, 6)
            .padding(.top, 6)
    }
}

struct RestExpandedTrailing: View {
    let m: RestModel
    let p: RestPalette
    var body: some View {
        // With no load the set is on the NEXT line below: said once.
        if let s = restWords(m).eyebrowSet {
            eyebrow(s, p, size: 11, color: p.isMeta)
                .padding(.trailing, 6 - p.eyebrowTrack * 11)     // the last letter's tracking hangs past the ink
                .padding(.top, 6)
        }
    }
}

struct RestExpandedCenter: View {
    let m: RestModel
    let p: RestPalette
    var body: some View { EmptyView() }
}

struct RestExpandedBottom: View {
    let m: RestModel
    let p: RestPalette
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            RestPosterRow(m: m, p: p, onIsland: true,
                          clockSize: p.paper ? 58 : 46,
                          gap: p.paper ? 14 : 10,
                          showEyebrow: false,
                          k: p.paper
                            ? ColumnType(eyebrow: 9.5, name: 20, name2: 15, value: 13.5, gap: 7)
                            : ColumnType(eyebrow: 9.5, name: 16, name2: 13, value: 13, gap: 7))
            RestBar(m: m, tint: p.isAccent, track: p.isTrack, height: 4)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 6)
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .combine)
    }
}
