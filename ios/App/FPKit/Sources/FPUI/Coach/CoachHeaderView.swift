#if os(iOS)
import SwiftUI
import FPCore

/// What the header's model switch says (spec 114): "Sonnet 5.5", or "Sonnet" where the header
/// would not keep one line (320 pt Display Zoom, Larger Text); its accessible name always says the
/// model running and the one it switches to ("Coach model: Sonnet 5.5. Switch to Haiku 4.5").
public enum ModelSwitchText {
    public static func title(_ m: ModelSwitch, short: Bool) -> String {
        guard !short, let v = m.version, !v.isEmpty else { return m.name }
        return m.name + " " + v
    }

    public static func accessibilityLabel(_ m: ModelSwitch) -> String { m.a11y }
}

/// The chat's header (the web's .coach-chat-stick): Back, or Cancel during programme setup, with the
/// owner's initial; the status eyebrow and title; WK/DAY and the model switch; one hairline under it.
struct CoachHeaderView: View {
    let header: Header
    let avatar: String?
    /// The narrowest screens (≤ 345 pt): the meta and the model's version stand down.
    let narrow: Bool
    let gutter: CGFloat
    let send: (Intent) -> Void
    @Environment(\.roomTheme) private var t

    private var short: Bool { narrow || t.largerText }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                backRow
                head
            }
            .padding(.horizontal, gutter)
            // the stick's full-width rule, under the header (a CSS border takes its own pixel)
            Rectangle().fill(t.color(.border)).frame(height: 1)
        }
        .background(t.color(.bg))
    }

    // .screen-hd: Back (or Cancel) and the avatar, 44 pt tall, 4 px above the head
    private var backRow: some View {
        HStack(spacing: 0) {
            if header.cancel {
                Button { send(.coachCancelIntake) } label: {
                    PlainText(text: "Cancel", style: InlineStyle(size: 14, weight: 500, color: backColor))
                        .padding(.trailing, t.px(12))
                        .frame(minHeight: t.px(44))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressDim())
            } else if header.back {
                Button { send(.coachBack) } label: {
                    HStack(spacing: t.px(4)) {
                        ChatGlyph.Chevron()
                            .stroke(t.color(backColor), style: StrokeStyle(lineWidth: t.px(2.5) * 16 / 24, lineCap: .round, lineJoin: .round))
                            .frame(width: t.px(16), height: t.px(16))
                        PlainText(text: "Back", style: InlineStyle(size: 14, weight: 500, color: backColor))
                    }
                    .padding(.trailing, t.px(12))
                    .frame(minHeight: t.px(44))
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressDim())
                .accessibilityLabel("Back")
            }
            Spacer(minLength: 0)
            if let avatar, !avatar.isEmpty {
                AvatarView(initial: avatar)
            }
        }
        .frame(minHeight: t.px(44))
        .padding(.bottom, t.px(4))
    }

    /// Back and Cancel: the action colour in Heavyweight; Lime's are text (an action, not the lime).
    private var backColor: ColorToken { t.flavor == .paper ? .accent : .text }

    // .coach-head: eyebrow over the title on the left, WK/DAY and the switch on the right, bottoms aligned
    private var head: some View {
        HStack(alignment: .bottom, spacing: t.px(10)) {
            VStack(alignment: .leading, spacing: t.px(4)) {
                HStack(spacing: t.px(8)) {
                    Circle()
                        .fill(t.color(header.status == .offline ? .muted : .headDot))
                        .frame(width: t.px(8), height: t.px(8))
                    PlainText(text: header.eyebrow,
                              style: InlineStyle(face: .eyebrow, size: 10, weight: 600, color: .muted,
                                                 tracking: t.headTrackingPx(em: 0.12, of: 10), tabular: t.flavor == .paper),
                              uppercase: true, lineLimit: 1)
                }
                .accessibilityElement(children: .combine)
                PlainText(text: header.title.isEmpty ? "\u{00A0}" : header.title,   // an empty title keeps its line
                          style: InlineStyle(size: 22, weight: 700, color: .text, tracking: -0.6),
                          lineLimit: 1)
                    .truncationMode(.tail)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: t.px(8)) {
                if let meta = header.meta, !meta.isEmpty, !short {
                    PlainText(text: meta,
                              style: InlineStyle(face: .eyebrow, size: 10, weight: 400, color: .muted,
                                                 tracking: t.headTrackingPx(em: 0.10, of: 10), tabular: t.flavor == .paper),
                              lineLimit: 1)
                        .fixedSize()
                }
                if let m = header.model {
                    ModelSwitchButton(model: m, short: short, send: send)
                }
            }
            .fixedSize()
        }
        .padding(.top, t.px(6))
        .padding(.bottom, t.px(14))
    }
}

/// The header's model switch: a pill reading the model running; its accessible name names the
/// model it switches to; it takes a 44 pt press though drawn smaller (4 px past the pill at each
/// side, 11 px above and below, as the web's .kt-hit).
struct ModelSwitchButton: View {
    let model: ModelSwitch
    let short: Bool
    let send: (Intent) -> Void
    @Environment(\.roomTheme) private var t

    /// How far the press reaches past the drawn pill, in points at this size.
    static func pressReach(_ t: RoomTheme) -> (h: CGFloat, v: CGFloat) { (t.px(4), t.px(11)) }

    var body: some View {
        let reach = Self.pressReach(t)
        PressAreaButton(h: reach.h, v: reach.v, action: { send(model.intent) }) {
            PlainText(text: ModelSwitchText.title(model, short: short),
                      style: InlineStyle(size: 11, weight: 500, color: .lite), lineLimit: 1)
                .fixedSize()
                .padding(.horizontal, t.px(10) + 1)   // + the CSS border
                .padding(.vertical, t.px(4) + 1)
                .background(RoundedRectangle(cornerRadius: 999, style: .circular).fill(t.color(t.flavor == .paper ? .card : .card2)))
                .overlay(RoundedRectangle(cornerRadius: 999, style: .circular).strokeBorder(t.color(.border), lineWidth: 1))
        }
        .accessibilityLabel(ModelSwitchText.accessibilityLabel(model))
    }
}

/// The owner's initial (decorative): Heavyweight's blue disc, Lime's grey tile on a hairline.
struct AvatarView: View {
    let initial: String
    @Environment(\.roomTheme) private var t

    var body: some View {
        let side = t.px(40)
        PlainText(text: initial, style: InlineStyle(size: 14, weight: 700, color: t.flavor == .paper ? .onAccent : .text), lineLimit: 1)
            .frame(width: side, height: side)
            .background {
                if t.flavor == .paper {
                    Circle().fill(t.color(.accent))
                } else {
                    RoundedRectangle(cornerRadius: t.px(13), style: .circular).fill(t.color(.card2))
                        .overlay(RoundedRectangle(cornerRadius: t.px(13), style: .circular).strokeBorder(t.color(.border), lineWidth: 1))
                }
            }
            .accessibilityHidden(true)
    }
}

/// The web's universal pressed state (`button:active{opacity:.7}`).
struct PressDim: ButtonStyle {
    var opacity: Double = 0.7

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? opacity : 1)
    }
}
#endif
