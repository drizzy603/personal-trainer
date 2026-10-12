#if os(iOS)
import SwiftUI
import UIKit
import FPCore

// A reply's body as the web draws it (plan task C6): md()'s blocks (.kt-cmb-para: paragraphs,
// lists with sub-items and numbered starts, headings, rules, tables that scroll inside their card)
// and the %% sections (.kt-cmb-metrics, .kt-cmb-take, .kt-cmb-chip). The page parses; these draw
// FPCore's block models. Vertical rhythm follows the web's CSS margins, which collapse between
// siblings (the larger of the two wins), so a heading after a paragraph sits 16 px under it, a list
// after a paragraph 10 px.

/// A child of a block flow with its CSS margins (px at the large size).
struct Spaced: Identifiable {
    let id: Int
    let top: CGFloat
    let bottom: CGFloat
}

/// The gap above child `i` of a flow whose margins collapse: the larger of the previous child's
/// bottom margin and this one's top; none above the first.
func collapsedGap(_ items: [Spaced], _ i: Int) -> CGFloat {
    i == 0 ? 0 : max(items[i - 1].bottom, items[i].top)
}

/// The paragraph text of a reply: 15 px on a 1.5 line, a hair tight.
let paraStyle = InlineStyle(size: 15, weight: 400, color: .text, tracking: -0.1)

/// md()'s blocks, as one .kt-cmb-para.
struct MarkdownBlocksView: View {
    let blocks: [MarkdownBlock]
    @Environment(\.roomTheme) private var t

    /// Each block's margins in the web (p and lists 0/10, heading 16/6 or 0 first, rule 14/14,
    /// table 0/10); the last child's bottom margin is 0.
    static func margins(_ blocks: [MarkdownBlock]) -> [Spaced] {
        blocks.enumerated().map { i, b in
            var top: CGFloat = 0, bottom: CGFloat = 10
            switch b {
            case .heading: top = i == 0 ? 0 : 16; bottom = 6
            case .rule: top = 14; bottom = 14
            default: break
            }
            if i == blocks.count - 1 { bottom = 0 }
            return Spaced(id: i, top: top, bottom: bottom)
        }
    }

    var body: some View {
        let items = Self.margins(blocks)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(items) { item in
                if item.id > 0 { Color.clear.frame(height: t.px(collapsedGap(items, item.id))) }
                block(blocks[item.id])
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func block(_ b: MarkdownBlock) -> some View {
        switch b {
        case .paragraph(let runs):
            InlineText(runs: runs, style: paraStyle, lineHeight: 1.5)
        case .heading(let runs):
            InlineText(runs: runs, style: InlineStyle(size: 16, weight: 700, color: .text), lineHeight: 1.3)
        case .rule:
            Rectangle().fill(t.color(.border)).frame(height: 1).frame(maxWidth: .infinity)
        case .bullets(let items):
            ListBlockView(items: items, start: nil)
        case .numbered(let start, let items):
            ListBlockView(items: items, start: start)
        case .table(let rows):
            MarkdownTableView(rows: rows)
        case .unknown(let u):
            PlainText(text: u.text, style: paraStyle, lineHeight: 1.5)
        }
    }
}

/// A bullet or numbered list: markers outside a 20 px indent (+2 px), muted; sub-items 18 px further
/// in with a hollow bullet; 6 px between items.
struct ListBlockView: View {
    let items: [ListItem]
    /// The first number of a numbered list, nil for bullets.
    let start: Int?
    @Environment(\.roomTheme) private var t

    var body: some View {
        let font = CoachInline.baseFont(paraStyle, theme: t)
        let space = (" " as NSString).size(withAttributes: [.font: font]).width
        VStack(alignment: .leading, spacing: t.px(6)) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                let sub = item.sub && start == nil
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Group {
                        if let start {
                            // "3." ends a space before the item's box, as the browser sets it
                            PlainText(text: "\(start + i).", style: InlineStyle(size: 15, weight: 400, color: .muted, tracking: 0), lineHeight: 1.5, lineLimit: 1)
                                .fixedSize()
                                .padding(.trailing, space)
                                .frame(width: t.px(20), alignment: .trailing)
                        } else {
                            ListBullet(hollow: sub, font: font)
                                .frame(width: t.px(sub ? 38 : 20), alignment: .leading)
                        }
                    }
                    InlineText(runs: item.runs, style: paraStyle, lineHeight: 1.5)
                        .padding(.leading, t.px(2))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

/// A bullet as the browser draws `list-style: disc` (`circle` for a sub-item) outside the list's
/// 20 px indent: a dot a third of the face's ascent across (4.4 px at 15 px), its left edge 5 px into
/// the indent, its middle 4.5 px over the baseline; muted.
struct ListBullet: View {
    let hollow: Bool
    let font: UIFont
    @Environment(\.roomTheme) private var t

    var body: some View {
        let d = max(t.px(3), font.ascender / 3)
        let lift = t.px(4.5)
        Group {
            if hollow {
                Circle().strokeBorder(t.color(.muted), lineWidth: max(1, d / 5))
            } else {
                Circle().fill(t.color(.muted))
            }
        }
        .frame(width: d, height: d)
        .alignmentGuide(.firstTextBaseline) { g in g.height / 2 + lift }
        .padding(.leading, t.px(hollow ? 23 : 5))
        .accessibilityHidden(true)
    }
}

/// A pipe table: its own card (1 px hairline, 14 px corners); headers 10 px caps muted, cells 13 px
/// with tabular figures, 9/12 px padding, a hairline between rows. Wider than the column, it
/// scrolls sideways with a soft shade at each edge that has more beyond it (the web's scroll
/// shadows); narrower, it stretches to the column as `width:100%` does.
struct MarkdownTableView: View {
    let rows: [[Inline]]
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.table), style: .circular)
        ViewThatFits(in: .horizontal) {
            grid
            ScrollView(.horizontal, showsIndicators: false) {
                grid
                    .background(alignment: .leading) { cover(leading: true) }
                    .background(alignment: .trailing) { cover(leading: false) }
            }
            .background(alignment: .leading) { shade(leading: true) }
            .background(alignment: .trailing) { shade(leading: false) }
        }
        .padding(1)   // the CSS border takes its own pixel
        .background(t.color(.card))
        .clipShape(shape)
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.speech(rows))
    }

    /// The table as VoiceOver reads it: cells joined by commas, rows by full stops.
    static func speech(_ rows: [[Inline]]) -> String {
        rows.map { $0.map(\.plainText).joined(separator: ", ") }.joined(separator: ". ")
    }

    private var grid: some View {
        TableLayout(rowCounts: rows.map(\.count)) {
            ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                    cellView(cell, head: r == 0, last: r == rows.count - 1 && r > 0)
                }
            }
        }
    }

    /// A cell on the reply's 1.5 line (the table inherits .kt-cmb-para's line-height).
    private func cellView(_ cell: Inline, head: Bool, last: Bool) -> some View {
        Group {
            if head {
                PlainText(text: cell.plainText, style: InlineStyle(size: 10, weight: 700, color: .muted, tracking: 0.6), lineHeight: 1.5, uppercase: true, lineLimit: 1)
            } else {
                InlineText(runs: cell, style: InlineStyle(size: 13, weight: 400, color: .text, tabular: true), lineHeight: 1.5)
                    .lineLimit(1)
            }
        }
        .fixedSize()
        .padding(.vertical, t.px(9))
        .padding(.horizontal, t.px(12))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            if !last { Rectangle().fill(t.color(.border)).frame(height: 1) }
        }
    }

    /// Rides with the content: the card's colour over the shade at the content's own end.
    private func cover(leading: Bool) -> some View {
        let card = t.color(.card)
        return LinearGradient(stops: [.init(color: card, location: 0), .init(color: card, location: 0.5), .init(color: card.opacity(0), location: 1)],
                              startPoint: leading ? .leading : .trailing, endPoint: leading ? .trailing : .leading)
            .frame(width: t.px(32))
    }

    /// Stays at the card's edge: a soft shade (the text at 16%).
    private func shade(leading: Bool) -> some View {
        let ink = t.color(.text)
        return LinearGradient(colors: [ink.opacity(0.16), ink.opacity(0)], startPoint: leading ? .leading : .trailing, endPoint: leading ? .trailing : .leading)
            .frame(width: t.px(14))
    }
}

/// A metric card: LABEL, then value, ref and · delta, one row each; every row puts its value under
/// its label once any row would not fit on one line (_metricsFit's .stack).
struct MetricsCardView: View {
    let rows: [MetricRow]
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.card), style: .circular)
        ViewThatFits(in: .horizontal) {
            card(stacked: false)
            card(stacked: true)
        }
        .padding(1)   // the CSS border takes its own pixel
        .background(t.color(.card))
        .clipShape(shape)
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
    }

    private func card(stacked: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                Group {
                    if stacked {
                        VStack(alignment: .leading, spacing: t.px(4)) {
                            label(row)
                            value(row).frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: t.px(10)) {
                            label(row).fixedSize()
                            Spacer(minLength: 0)
                            value(row).fixedSize()
                        }
                    }
                }
                .padding(.vertical, t.space(.metricPadV))
                .padding(.horizontal, t.space(.cardPadH))
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .bottom) {
                    if i < rows.count - 1 { Rectangle().fill(t.color(.border)).frame(height: 1) }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(MetricsCardView.speech(row))
            }
        }
    }

    private func label(_ row: MetricRow) -> some View {
        PlainText(text: row.label, style: InlineStyle(face: .mono, size: 10, weight: 700, color: .muted, tracking: 0.4))
    }

    /// value · ref · delta as one line of text that wraps only between its parts.
    private func value(_ row: MetricRow) -> some View {
        Text(MetricsCardView.valueText(row, theme: t))
            .multilineTextAlignment(.trailing)
            .fixedSize(horizontal: false, vertical: true)
    }

    static func valueText(_ row: MetricRow, theme t: RoomTheme) -> AttributedString {
        func part(_ s: String, size: CGFloat, weight: Int, color: ColorToken) -> AttributedString {
            var a = AttributedString(s.replacingOccurrences(of: " ", with: "\u{00A0}"))
            a.font = t.font(.mono, size, weight)
            a.foregroundColor = t.color(color)
            if t.bodyTracking != 0 { a.tracking = t.bodyTracking }
            return a
        }
        // the spaces between the parts are the value's own (a bare space would take the system
        // font and its taller line)
        func space() -> AttributedString {
            var s = AttributedString(" ")
            s.font = t.font(.mono, 13, 400)
            return s
        }
        var out = part(row.value, size: 13, weight: 400, color: .text)
        if !row.ref.isEmpty {
            out += space()
            out += part(row.ref, size: 12, weight: 400, color: .muted)
        }
        if !row.delta.isEmpty {
            out += space()
            switch row.tone {
            case .good: out += part("· " + row.delta, size: 13, weight: 800, color: .deltaGood)
            case .warn: out += part("· " + row.delta, size: 13, weight: 800, color: .deltaWarn)
            case .plain: out += part("· " + row.delta, size: 12, weight: 400, color: .muted)
            }
        }
        return out
    }

    /// "PACE: 8:07 vs 8:15 goal -8s" (the page's _coachSpeech reads a metric so).
    static func speech(_ row: MetricRow) -> String {
        ([row.label + ":", row.value, row.ref, row.delta].filter { !$0.isEmpty }).joined(separator: " ")
    }
}

/// TAKEAWAY: the one line to remember, on a card.
struct TakeawayView: View {
    let runs: Inline
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.card), style: .circular)
        VStack(alignment: .leading, spacing: t.px(5)) {
            PlainText(text: "TAKEAWAY", style: InlineStyle(face: .eyebrow, size: 9, weight: 800, color: .takeEyebrow, tracking: 0.9), lineLimit: 1)
            InlineText(runs: runs, style: InlineStyle(size: 14, weight: 400, color: .text), lineHeight: 1.5)
        }
        .padding(.vertical, t.space(.cardPadV) + 1)   // + the CSS border
        .padding(.horizontal, t.space(.cardPadH) + 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(t.color(.card)))
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// A suggestion or action chip (.kt-cmb-chip): 44 pt tall at least, 22 px corners; the first of a
/// reply's chips (and Try again) is the room's primary, with an arrow.
struct ChipView: View {
    let label: String
    let primary: Bool
    var arrow = false
    let action: () -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.chip), style: .circular)
        Button(action: action) {
            PlainText(text: label + (arrow ? " \u{2192}" : ""),
                      style: InlineStyle(size: 13, weight: primary ? 700 : 600, color: primary ? .chipPrimaryText : .text),
                      lineHeight: 1.3)
                .padding(.vertical, t.space(.chipPadV) + 1)   // + the CSS border
                .padding(.horizontal, t.space(.chipPadH) + 1)
                .frame(minHeight: t.px(44))
                .background(shape.fill(t.color(primary ? .chipPrimary : .card)))
                .overlay(shape.strokeBorder(t.color(primary ? .chipPrimaryBorder : .border), lineWidth: 1))
                .contentShape(shape)
        }
        .buttonStyle(PressDim())
        .accessibilityLabel(label)
    }
}

/// A chip of a row: its words, whether it is the primary one (filled, with an arrow), its tap.
struct ChipItem {
    var label: String
    var primary: Bool
    var arrow: Bool
    var action: () -> Void
}

/// A row of chips that wraps (gap 8).
struct ChipRow: View {
    let chips: [ChipItem]
    @Environment(\.roomTheme) private var t

    var body: some View {
        FlowLayout(spacing: t.space(.chipGap), lineSpacing: t.space(.chipGap)) {
            ForEach(Array(chips.enumerated()), id: \.offset) { _, c in
                ChipView(label: c.label, primary: c.primary, arrow: c.arrow, action: c.action)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A %% reply's sections with the web's margins: paragraphs 12 px under, cards 10 px, chips 2 px
/// over (collapsed with the section before).
struct CoachSectionsView: View {
    let sections: [CoachSection]
    let actions: [CoachAction]
    let onAction: (CoachAction) -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        let items = margins()
        VStack(alignment: .leading, spacing: 0) {
            ForEach(items) { item in
                if item.id > 0 { Color.clear.frame(height: t.px(collapsedGap(items, item.id))) }
                if item.id < sections.count {
                    section(sections[item.id])
                } else {
                    ChipRow(chips: actions.map { a in ChipItem(label: a.label, primary: a.primary, arrow: a.primary, action: { onAction(a) }) })
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func margins() -> [Spaced] {
        var out: [Spaced] = sections.enumerated().map { i, s in
            switch s {
            case .markdown(let blocks):
                // a para's first child's top margin collapses through it (a rule's 14 px)
                return Spaced(id: i, top: MarkdownBlocksView.margins(blocks).first?.top ?? 0, bottom: 12)
            case .metrics, .takeaway: return Spaced(id: i, top: 0, bottom: 10)
            case .unknown: return Spaced(id: i, top: 0, bottom: 12)
            }
        }
        if !actions.isEmpty { out.append(Spaced(id: sections.count, top: 2, bottom: 0)) }
        if let last = out.indices.last { out[last] = Spaced(id: out[last].id, top: out[last].top, bottom: 0) }
        return out
    }

    @ViewBuilder private func section(_ s: CoachSection) -> some View {
        switch s {
        case .markdown(let blocks): MarkdownBlocksView(blocks: blocks)
        case .metrics(let rows): MetricsCardView(rows: rows)
        case .takeaway(let runs): TakeawayView(runs: runs)
        case .unknown(let u): PlainText(text: u.text, style: paraStyle, lineHeight: 1.5)
        }
    }
}
#endif
