#if os(iOS)
import SwiftUI
import FPCore

/// The empty chat (plan task C6; chatui's empty state): Ask anything, the programme's status line
/// with its two quiet text buttons (Restore previous, Reset programme: both ask first in the page),
/// and the suggestions as chips. It hugs the composer, as the web's does.
struct CoachEmptyStateView: View {
    let empty: EmptyState
    let send: (Intent) -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: t.px(4)) {
                PlainText(text: empty.title, style: InlineStyle(size: 22, weight: 700, color: .text, tracking: -0.4))
                    .accessibilityAddTraits(.isHeader)
                if !empty.sub.isEmpty {
                    PlainText(text: empty.sub, style: InlineStyle(size: 14, weight: 400, color: .lite))
                }
            }
            .padding(.top, t.px(20))
            .padding(.bottom, t.px(12))
            if let prog = empty.programme {
                VStack(alignment: .leading, spacing: t.px(2)) {
                    PlainText(text: prog.label, style: InlineStyle(face: .eyebrow, size: 9, weight: 800, color: .muted, tracking: 0.9), uppercase: true)
                    FlowLayout(spacing: t.px(20), lineSpacing: 0) {
                        ForEach(Array(prog.actions.enumerated()), id: \.offset) { _, a in
                            if let intent = a.intent(messageID: nil) {
                                ProgrammeButton(label: a.label) { send(intent) }
                            }
                        }
                    }
                }
                .padding(.bottom, t.px(8))
            }
            if !empty.chips.isEmpty {
                ChipRow(chips: empty.chips.map { chip in
                    ChipItem(label: chip, primary: false, arrow: false, action: { send(.coachChip(text: chip, nonce: Intent.nonce())) })
                })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The programme's housekeeping: a quiet text button, 44 pt tall, its text on the column's edge
/// (Heavyweight's action blue; Lime's lite, underlined).
struct ProgrammeButton: View {
    let label: String
    let action: () -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        Button(action: action) {
            Text(verbatim: label)
                .font(t.font(.body, 13, 600))
                .tracking(t.bodyTracking)
                .foregroundStyle(t.color(.progAction))
                .underline(t.flavor == .studio, color: t.color(.progAction).opacity(0.45))
                .frame(minHeight: t.px(44))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressDim(opacity: 0.6))
    }
}
#endif
