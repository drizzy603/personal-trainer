#if os(iOS)
import SwiftUI
import UIKit
import FPCore

// The conversation's rows as the web draws them (plan task C6; chatui's renderCoach): a day divider
// over the first message of each day; a prompt the app wrote as a labelled rule (TODAY · PLATEAU
// CHECK), never a bubble; only the owner's words in a bubble; every coach reply full width under a
// COACH eyebrow; the app's own notes (Stopped, an error) muted with a dot; Try again or Open
// Settings under the trailing one; the reply's tool pills; PLAN CHANGES under the reply that changed
// the programme. 8 px between the parts of one reply, 20 px around the owner's turn.

/// One part of the conversation column.
struct ChatPart: Identifiable {
    enum Kind {
        case day(String)
        case seed(Message, day: String?)
        case bubble(Message)
        case reply(Message)
        case note(Message)
        case chip(Message, ModelAction)
        case pills([Pill])
        case ledger(Message, Ledger)
        case thinking([Pill])
    }

    /// "turn-m3", "reply-m4", "pills-m8": unique in the column (a message with no id, or one the
    /// page repeated, takes its place in the list as its key).
    let id: String
    let kind: Kind

    /// The owner's turn: a bubble or the app's prompt for them (20 px around it).
    var isTurn: Bool {
        switch kind {
        case .seed, .bubble: return true
        default: return false
        }
    }

    /// The parts of a conversation, in the web's order: per message its day, body, chip, pills and
    /// ledger; then the reply in flight (pills and Thinking) or pills left from a stopped one.
    static func parts(_ model: CoachModel) -> [ChatPart] {
        var out: [ChatPart] = []
        var keys = Set<String>()
        for (i, m) in model.messages.enumerated() {
            var key = m.id.isEmpty ? "i\(i)" : m.id
            if !keys.insert(key).inserted { key += "#\(i)"; keys.insert(key) }
            func add(_ prefix: String, _ kind: Kind) { out.append(ChatPart(id: prefix + key, kind: kind)) }
            switch m.look {
            case .seed:
                add("turn-", .seed(m, day: m.day))
            default:
                if let d = m.day { add("day-", .day(d)) }
                switch m.look {
                case .bubble:
                    if !bubbleText(m).isEmpty || m.image != nil { add("turn-", .bubble(m)) }
                case .reply: add("reply-", .reply(m))
                case .note:
                    if !m.body.plainText.isEmpty { add("note-", .note(m)) }
                case .seed: break
                }
            }
            if let chip = m.chip, !model.loading, chip.intent(messageID: m.id) != nil {
                add("chip-", .chip(m, chip))
            }
            if !m.pills.isEmpty { add("pills-", .pills(m.pills)) }
            if let l = m.ledger, !l.rows.isEmpty { add("ledger-", .ledger(m, l)) }
        }
        if model.loading {
            out.append(ChatPart(id: "thinking", kind: .thinking(model.running)))
        } else if !model.running.isEmpty {
            out.append(ChatPart(id: "pills-running", kind: .pills(model.running)))
        }
        return out
    }

    /// The owner's words as shown (a photo sent with no words shows none).
    static func bubbleText(_ m: Message) -> String {
        m.body.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The extra space above part `i` beyond the column's 8 px gap: 12 px around the owner's turn
    /// (`.coach-bubble.user:not(:first-child)`, `+ *`), 6 px over a day divider.
    static func extraTop(_ parts: [ChatPart], _ i: Int) -> CGFloat {
        // a day divider keeps its 6 px even first in the column (`.kt-chat-day{margin:6px 0 0}`)
        if case .day = parts[i].kind { return i > 0 && parts[i - 1].isTurn ? 12 : 6 }
        guard i > 0 else { return 0 }
        if parts[i].isTurn || parts[i - 1].isTurn { return 12 }
        return 0
    }
}

/// The column of parts.
struct MessageColumn: View {
    let model: CoachModel
    let columnWidth: CGFloat
    let host: CoachHost
    @Environment(\.roomTheme) private var t

    var body: some View {
        let parts = ChatPart.parts(model)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(parts.enumerated()), id: \.element.id) { i, part in
                let gap = (i > 0 ? t.space(.messageGap) : 0) + t.px(ChatPart.extraTop(parts, i))
                if part.isTurn {
                    // a reply that lands opens with its question 12 pt under the header: the last
                    // 12 pt of the gap above a turn is its scroll mark
                    let mark = min(gap, t.px(12))
                    if gap > mark { Color.clear.frame(height: gap - mark) }
                    Color.clear.frame(height: mark).id("mark-" + part.id)
                } else if gap > 0 {
                    Color.clear.frame(height: gap)
                }
                view(part)
                    .id(part.id)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func view(_ part: ChatPart) -> some View {
        switch part.kind {
        case .day(let text):
            DayDivider(text: text)
        case .seed(let m, let day):
            SeedLine(seed: m.seed ?? "", day: day)
        case .bubble(let m):
            UserBubble(message: m, maxWidth: columnWidth * 0.84, image: m.image?.key.flatMap(host.image))
        case .reply(let m):
            ReplyView(message: m, send: host.send)
        case .note(let m):
            NoteView(text: m.body.plainText, error: m.error)
        case .chip(let m, let action):
            ChipView(label: action.label, primary: true, arrow: true) {
                if let intent = action.intent(messageID: m.id) { host.send(intent) }
            }
        case .pills(let pills):
            PillsView(pills: pills)
        case .ledger(let m, let ledger):
            PlanChangesCard(ledger: ledger, messageID: m.id, send: host.send)
        case .thinking(let running):
            ThinkingView(running: running)
        }
    }
}

/// TODAY, YESTERDAY, THU, OCT 1: centred caps over the first message of a day.
struct DayDivider: View {
    let text: String
    @Environment(\.roomTheme) private var t

    var body: some View {
        PlainText(text: text, style: InlineStyle(face: .eyebrow, size: 10, weight: 700, color: .muted, tracking: 1), uppercase: true, lineLimit: 1)
            .frame(maxWidth: .infinity)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A prompt the app wrote for the owner: a rule with its label (and the day, when it opens one).
struct SeedLine: View {
    let seed: String
    let day: String?
    @Environment(\.roomTheme) private var t

    var body: some View {
        let label = (day.map { $0 + " \u{00B7} " } ?? "") + seed
        HStack(spacing: t.px(10)) {
            Rectangle().fill(t.color(.border)).frame(height: 1)
            PlainText(text: label, style: InlineStyle(face: .eyebrow, size: 10, weight: 700, color: .muted, tracking: 1), uppercase: true)
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
            Rectangle().fill(t.color(.border)).frame(height: 1)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}

/// The owner's words (and photo) in the room's bubble, right-aligned, at most 84% of the column.
/// A photo sent with no words is the bubble itself.
struct UserBubble: View {
    let message: Message
    let maxWidth: CGFloat
    let image: UIImage?
    @Environment(\.roomTheme) private var t

    var body: some View {
        let text = ChatPart.bubbleText(message)
        let shape = UnevenRoundedRectangle(topLeadingRadius: t.radius(.bubble), bottomLeadingRadius: t.radius(.bubble),
                                           bottomTrailingRadius: t.radius(.bubbleTail), topTrailingRadius: t.radius(.bubble), style: .circular)
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            Group {
                if let image, text.isEmpty {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: min(t.px(240), maxWidth), maxHeight: t.px(180))
                        .clipShape(shape)
                        .accessibilityLabel("Photo you sent")
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        if message.image != nil {
                            if let image {
                                Image(uiImage: image)
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .frame(maxWidth: t.px(200), maxHeight: t.px(150))
                                    .clipShape(RoundedRectangle(cornerRadius: t.radius(.photo), style: .circular))
                                    .padding(.bottom, text.isEmpty ? 0 : t.px(6))
                                    .accessibilityLabel("Photo you sent")
                            } else {
                                PlainText(text: "\u{1F4F7} Photo", style: InlineStyle(size: 12, weight: 500, color: .onUserBubble, tracking: -0.1))
                                    .padding(.bottom, text.isEmpty ? 0 : t.px(4))
                                    .accessibilityLabel("Photo")
                            }
                        }
                        if !text.isEmpty {
                            PlainText(text: text, style: InlineStyle(size: 15, weight: 500, color: .onUserBubble, tracking: -0.1), lineHeight: 1.4)
                                .textSelection(.enabled)   // as the web page lets text be copied
                                .accessibilityLabel("You: " + text)
                        }
                    }
                    .padding(.vertical, t.space(.bubblePadV))
                    .padding(.horizontal, t.space(.bubblePadH))
                    .background(shape.fill(t.color(.userBubble)))
                }
            }
            .frame(maxWidth: maxWidth, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A coach reply: COACH (and its type) over the body; a %% reply's chips after it.
struct ReplyView: View {
    let message: Message
    let send: (Intent) -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                PlainText(text: message.eyebrow ?? "COACH", style: InlineStyle(face: .eyebrow, size: 9, weight: 800, color: .eyebrow, tracking: 0.9), uppercase: true)
                    .padding(.bottom, t.px(8))
                content
            }
            .accessibilityElement(children: .ignore)
            .textSelection(.enabled)   // as the web page lets text be copied
            .accessibilityLabel(message.a11y ?? ("Coach: " + message.body.plainText))
            let actions = message.body.actions
            if !actions.isEmpty {
                // .kt-cmb-actions: 2 px over the chips, collapsed with the section before (10/12 px)
                Color.clear.frame(height: t.px(contentBottomGap))
                ChipRow(chips: actions.map { a in ChipItem(label: a.label, primary: a.primary, arrow: a.primary, action: { send(.coachAction(id: message.id, text: a.msg)) }) })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var content: some View {
        switch message.body {
        case .text(let s):
            MarkdownBlocksView(blocks: [.paragraph([Run(s)])])
        case .markdown(let blocks):
            MarkdownBlocksView(blocks: blocks)
        case .coach(let sections, _):
            CoachSectionsView(sections: sections, actions: [], onAction: { _ in })
        case .unknown(let u):
            PlainText(text: u.text, style: paraStyle, lineHeight: 1.5)
        }
    }

    /// The gap between the reply's last section and its chips: the section's bottom margin (a
    /// paragraph 12 px, a card 10 px) against the chips' 2 px.
    private var contentBottomGap: CGFloat {
        if case .coach(let sections, _) = message.body, let last = sections.last {
            switch last {
            case .metrics, .takeaway: return 10
            default: return 12
            }
        }
        return 12
    }
}

/// What the app says itself (Stopped, an error): muted, after a dot; an error reads in the text
/// colour after a red dot.
struct NoteView: View {
    let text: String
    let error: Bool
    @Environment(\.roomTheme) private var t

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: t.px(8)) {
            Circle()
                .fill(t.color(error ? .red : .muted))
                .frame(width: t.px(6), height: t.px(6))
                .alignmentGuide(.firstTextBaseline) { d in d.height + t.px(1) }
            PlainText(text: text, style: InlineStyle(size: 13, weight: 400, color: error ? .text : .muted), lineHeight: 1.4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// What a reply's tools did, in the page's words: ✓ label, or ✕ in red.
struct PillsView: View {
    let pills: [Pill]
    @Environment(\.roomTheme) private var t

    var body: some View {
        FlowLayout(spacing: t.space(.pillGap), lineSpacing: t.space(.pillGap)) {
            ForEach(Array(pills.enumerated()), id: \.offset) { _, p in
                PillView(pill: p)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PillView: View {
    let pill: Pill
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.pill), style: .circular)
        let ink: ColorToken = pill.ok ? .lite : .red
        HStack(alignment: .firstTextBaseline, spacing: t.px(6)) {
            PlainText(text: pill.ok ? "\u{2713}" : "\u{2715}",
                      style: InlineStyle(size: 12, weight: 600, color: pill.ok ? .pillIcon : .red), lineHeight: 1.35, lineLimit: 1)
                .fixedSize()
                .accessibilityHidden(true)
            PlainText(text: pill.label, style: InlineStyle(size: 12, weight: 600, color: ink), lineHeight: 1.35)
        }
        .padding(.vertical, t.space(.pillPadV))
        .padding(.horizontal, t.space(.pillPadH))
        .background(shape.fill(t.color(.pill)))
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// PLAN CHANGES: what the newest programme-changing reply did, with Undo and Keep changes while its
/// undo point stands; then "Applied to your programme. It cannot be undone here any more." and Got it.
struct PlanChangesCard: View {
    let ledger: Ledger
    let messageID: String
    let send: (Intent) -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.card), style: .circular)
        VStack(alignment: .leading, spacing: 0) {
            PlainText(text: ledger.head, style: InlineStyle(face: .eyebrow, size: 9, weight: 800, color: .ledgerHead, tracking: 1.08), lineLimit: 2)
                .padding(.bottom, t.px(6))
                .accessibilityAddTraits(.isHeader)
            ForEach(Array(ledger.rows.enumerated()), id: \.offset) { _, row in
                ledgerRow(row)
            }
            if ledger.canUndo {
                actions(end: false).padding(.top, t.px(10))
                note.padding(.top, t.px(8))
            } else {
                note.padding(.top, t.px(8))
                actions(end: true).padding(.top, t.px(10))
            }
        }
        .padding(.vertical, t.space(.cardPadV) + 1)   // + the CSS border
        .padding(.horizontal, t.space(.cardPadH) + 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(t.color(.card)))
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
    }

    private func ledgerRow(_ row: Ledger.Row) -> some View {
        let label = PlainText(text: row.label, style: InlineStyle(size: 13, weight: 400, color: .text))
        let value = PlainText(text: row.value, style: InlineStyle(size: 13, weight: 700, color: .text), alignment: .trailing)
        return ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: t.px(12)) {
                label.fixedSize()
                Spacer(minLength: 0)
                value.fixedSize()
            }
            VStack(alignment: .leading, spacing: t.px(2)) {
                label
                value.frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.vertical, t.px(7))
        .hairline(t.color(.border))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var note: some View {
        if let n = ledger.note, !n.isEmpty {
            PlainText(text: n, style: InlineStyle(size: 11, weight: 400, color: .muted))
        }
    }

    @ViewBuilder private func actions(end: Bool) -> some View {
        let buttons = ledger.actions.filter { $0.intent(messageID: messageID) != nil }
        if !buttons.isEmpty {
            HStack(spacing: t.px(8)) {
                if end { Spacer(minLength: 0) }
                ForEach(Array(buttons.enumerated()), id: \.offset) { _, a in
                    LedgerButton(action: a, fill: !end) {
                        if let intent = a.intent(messageID: messageID) { send(intent) }
                    }
                }
            }
        }
    }
}

/// A PLAN CHANGES button (.kt-coach-btn): the action filled, the other on the card (Heavyweight on a
/// hairline); 44 pt tall, 12 px corners; shared width, or its own (Got it).
struct LedgerButton: View {
    let action: ModelAction
    let fill: Bool
    let tap: () -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.button), style: .circular)
        let primary = action.tone == .primary
        Button(action: tap) {
            PlainText(text: action.label, style: InlineStyle(size: 13, weight: 600, color: primary ? .onAccent : .text), alignment: .center)
                .padding(.vertical, t.px(11))
                .padding(.horizontal, fill ? t.px(11) : t.px(20))
                .frame(maxWidth: fill ? .infinity : nil, minHeight: t.px(44))
                .background {
                    if primary {
                        shape.fill(t.color(.accent))
                    } else if t.flavor == .paper {
                        shape.fill(t.color(.card)).overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
                    } else {
                        shape.fill(t.color(.card2))
                    }
                }
                .contentShape(shape)
        }
        .buttonStyle(PressDim())
    }
}

/// The coach's place while a reply is in flight: COACH, the tools it has run, Thinking… and dots.
/// Stop is the composer's Send meanwhile.
struct ThinkingView: View {
    let running: [Pill]
    @Environment(\.roomTheme) private var t
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlainText(text: "COACH", style: InlineStyle(face: .eyebrow, size: 9, weight: 800, color: .eyebrow, tracking: 0.9), lineLimit: 1)
                .padding(.bottom, t.px(8))
            if !running.isEmpty {
                PillsView(pills: running).padding(.bottom, t.px(8))
            }
            HStack(spacing: t.px(5)) {
                PlainText(text: "Thinking\u{2026}", style: InlineStyle(size: 13, weight: 400, color: .lite), lineLimit: 1)
                    .padding(.trailing, t.px(8))
                TypingDots(animate: !reduceMotion)
            }
            .padding(.vertical, t.px(2))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Coach is thinking")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Three dots that pulse in turn (the web's tdot: 1.2 s, .2 s apart).
struct TypingDots: View {
    let animate: Bool
    @Environment(\.roomTheme) private var t

    var body: some View {
        if animate {
            TimelineView(.animation) { ctx in
                dots(phase: ctx.date.timeIntervalSinceReferenceDate)
            }
        } else {
            dots(phase: nil)
        }
    }

    private func dots(phase: TimeInterval?) -> some View {
        HStack(spacing: t.px(5)) {
            ForEach(0..<3, id: \.self) { i in
                let k = phase.map { Self.pulse(($0 - Double(i) * 0.2).truncatingRemainder(dividingBy: 1.2) / 1.2) } ?? 1
                Circle()
                    .fill(t.color(.muted))
                    .frame(width: t.px(7), height: t.px(7))
                    .scaleEffect(0.8 + 0.2 * k)
                    .opacity(0.15 + 0.85 * k)
            }
        }
    }

    /// 0 at 0%, 1 at 40%, 0 again from 80% (keyframes 0%,80%,100% {.15, .8}; 40% {1, 1}).
    static func pulse(_ x: Double) -> Double {
        let p = x < 0 ? x + 1 : x
        if p < 0.4 { return p / 0.4 }
        if p < 0.8 { return 1 - (p - 0.4) / 0.4 }
        return 0
    }
}
#endif
