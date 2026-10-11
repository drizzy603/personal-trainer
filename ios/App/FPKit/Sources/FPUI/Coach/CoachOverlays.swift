#if os(iOS)
import SwiftUI
import UIKit
import FPCore

// The page's toasts and confirms while the native chat covers it (plan task C6; decision.md
// section 7): forwarded as `toast {text, style, undo?}` and `confirm {id, title, body, confirm,
// cancel, tone}` and drawn here in the room, as the web draws #toast and _ktConfirm's sheet. C5's
// ScreenHost may host them at window level; the look is the same.

/// A toast as the web draws it in the chat: under the header, across the column, 14 px corners,
/// 13 px bold centred. Done is Heavyweight's earned lime (Lime: neutral grey), a record the earned
/// colour, a failure red; a toast with Undo is neutral with the action button after the words.
public struct CoachToastView: View {
    let toast: ToastRequest
    let onUndo: () -> Void
    @Environment(\.roomTheme) private var t

    public init(toast: ToastRequest, onUndo: @escaping () -> Void) {
        self.toast = toast
        self.onUndo = onUndo
    }

    /// How far Undo's press reaches past its drawn button, in points at this size.
    static func undoReach(_ t: RoomTheme) -> (h: CGFloat, v: CGFloat) { (0, t.px(10)) }

    /// The toast's surface and ink in this room.
    static func colors(_ toast: ToastRequest, flavor: RoomFlavor) -> (fill: ColorToken, ink: ColorToken) {
        if toast.undo != nil { return (.card2, .text) }
        switch toast.style {
        case .err: return (.red, .onAccent)
        case .pr: return (.earned, flavor == .paper ? .text : .onAccent)
        case .ok, .other: return flavor == .paper ? (.earned, .text) : (.card2, .text)
        }
    }

    public var body: some View {
        let c = Self.colors(toast, flavor: t.flavor)
        let shape = RoundedRectangle(cornerRadius: t.px(14), style: .circular)
        HStack(spacing: t.px(12)) {
            PlainText(text: toast.text, style: InlineStyle(size: 13, weight: 700, color: c.ink), lineHeight: 1.4, alignment: .center)
            if toast.undo != nil {
                // drawn about 25 pt tall (the web's 6/12 px padding), pressed 45: the toast's own
                // 15 pt above and below holds the reach
                let reach = Self.undoReach(t)
                PressAreaButton(h: reach.h, v: reach.v, action: onUndo) {
                    PlainText(text: "Undo", style: InlineStyle(size: 12, weight: 800, color: .onAccent, tracking: 0.24), lineLimit: 1)
                        .fixedSize()
                        .padding(.vertical, t.px(6))
                        .padding(.horizontal, t.px(12))
                        .background(RoundedRectangle(cornerRadius: t.px(9), style: .circular).fill(t.color(.accent)))
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, t.px(14) + 1)   // + the CSS border
        .padding(.horizontal, t.px(20) + 1)
        .background(shape.fill(t.color(c.fill)))
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
    }
}

/// A forwarded confirm as _ktConfirm's sheet: the title, the body, Cancel and the confirm button
/// (red unless the page names another tone), over a dimmed screen; a tap outside cancels.
public struct CoachConfirmSheet: View {
    let confirm: ConfirmRequest
    let answer: (Bool) -> Void
    @Environment(\.roomTheme) private var t

    public init(confirm: ConfirmRequest, answer: @escaping (Bool) -> Void) {
        self.confirm = confirm
        self.answer = answer
    }

    private var confirmFill: ColorToken {
        switch confirm.tone {
        case .accent: return .accent
        case .neutral: return .card2
        case .danger, .other: return .red
        }
    }

    public var body: some View {
        let top = t.flavor == .paper ? t.px(14) : t.px(24)
        let shape = UnevenRoundedRectangle(topLeadingRadius: top, bottomLeadingRadius: t.flavor == .paper ? top : 0,
                                           bottomTrailingRadius: t.flavor == .paper ? top : 0, topTrailingRadius: top, style: .circular)
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture { answer(false) }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                PlainText(text: confirm.title, style: InlineStyle(size: 19, weight: 800, color: .text, tracking: -0.5))
                    .padding(.bottom, t.px(6))
                    .accessibilityAddTraits(.isHeader)
                if let body = confirm.body {
                    PlainText(text: body, style: InlineStyle(size: 13, weight: 400, color: .muted))
                        .padding(.bottom, t.px(24))
                } else {
                    Color.clear.frame(height: t.px(18))
                }
                sheetButton(confirm.cancel, fill: .card2, ink: .text) { answer(false) }
                    .padding(.bottom, t.px(10))
                sheetButton(confirm.confirm, fill: confirmFill, ink: confirmFill == .card2 ? .text : .onAccent) { answer(true) }
            }
            .padding(.horizontal, t.px(20))
            .padding(.top, t.px(20))
            .padding(.bottom, t.px(8))
            .frame(maxWidth: .infinity)
            .background(shape.fill(t.color(.card)).ignoresSafeArea(edges: .bottom))
            .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1).ignoresSafeArea(edges: .bottom))
            .accessibilityAddTraits(.isModal)
        }
    }

    private func sheetButton(_ label: String, fill: ColorToken, ink: ColorToken, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            PlainText(text: label, style: InlineStyle(size: 15, weight: 800, color: ink), alignment: .center)
                .frame(maxWidth: .infinity)
                .padding(t.px(14))
                .background(RoundedRectangle(cornerRadius: t.px(14), style: .circular).fill(t.color(fill)))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressDim())
    }
}
#endif
