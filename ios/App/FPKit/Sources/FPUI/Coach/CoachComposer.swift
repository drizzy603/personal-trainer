#if os(iOS)
import PhotosUI
import SwiftUI
import UIKit
import FPCore

/// A photo picked in the native composer, prepared for the coach (CoachPhoto), with its preview.
public struct PickedPhoto: Equatable {
    public var prepared: CoachPhoto.Prepared
    public var preview: UIImage

    public init(prepared: CoachPhoto.Prepared, preview: UIImage) {
        self.prepared = prepared
        self.preview = preview
    }
}

/// The composer as the web draws it (plan task C6; chatui's .coach-input-row): one field. The row
/// is the surface and carries the focus ring; the photo button and Send are 44 pt targets that stay
/// by the last line of a long draft; Send is disabled with nothing to send, and is Stop while a
/// reply is in flight (a reply cannot be sent and stopped at once). A photo waiting to be sent sits
/// above it on the room's card.
struct CoachComposer: View {
    let composer: Composer
    let loading: Bool
    @Binding var text: String
    @Binding var picked: PickedPhoto?
    /// The page's pending photo (a shared image) as the host holds it.
    let pagePhoto: UIImage?
    var focused: FocusState<Bool>.Binding
    let onSend: () -> Void
    let onStop: () -> Void
    let onRemovePagePhoto: () -> Void
    /// A picked photo that cannot be used (the picker handed nothing over, or no image the app or
    /// the coach can read): the chat says so.
    var onPhotoFailed: () -> Void = {}
    @Environment(\.roomTheme) private var t
    @State private var item: PhotosPickerItem?
    /// The software keyboard is up (`keysUp(end:in:)`): the pending photo takes less of the column.
    @State private var keysUp = false
    /// The face size the box last held the focus at (nil while it does not hold it): a field made anew
    /// for a new size gets the focus back only when the old one had it (`refocus`).
    @State private var focusedAt: CGFloat?

    /// More than this much of the window under the keyboard is the software keyboard up: the web's own
    /// threshold for `kb-open` (index.html's visualViewport cut of 120 px). A hardware keyboard's
    /// shortcut bar stays under it, so it is not "up", as on the web.
    static let keysUpCut: CGFloat = 120

    /// Whether a keyboard whose frame ends at `end` (screen coordinates) is up over `window`.
    static func keysUp(end: CGRect, in window: CGRect) -> Bool {
        let cut = end.intersection(window)
        return !cut.isNull && cut.height > keysUpCut
    }

    /// Whether the box gets the focus back: it held the focus at `focusedAt` (nil = it did not), the
    /// face is now `size` and the focus is now `focusedNow`. A text-size change makes the field anew
    /// (`.id(font.pointSize)`), which drops its focus and the keys with it; only a focus the owner had
    /// at the old size comes back, never one the owner did not have, and never a focus the owner left
    /// at the size the box still has.
    static func refocus(focusedAt: CGFloat?, size: CGFloat, focusedNow: Bool) -> Bool {
        guard let focusedAt, !focusedNow else { return false }
        return focusedAt != size
    }

    /// Something to send: words, or a photo.
    static func canSend(text: String, hasPhoto: Bool) -> Bool {
        hasPhoto || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// What a pick comes to: the photo ready to send with its preview, or nil when there is nothing
    /// to show and send (no bytes from the picker, bytes CoachPhoto cannot prepare, or a prepared
    /// original no preview can be drawn from).
    static func picked(_ prepared: CoachPhoto.Prepared?) -> PickedPhoto? {
        guard let prepared, let preview = UIImage(data: prepared.data) else { return nil }
        return PickedPhoto(prepared: prepared, preview: preview)
    }

    private var preview: UIImage? { picked?.preview ?? (composer.image != nil ? pagePhoto : nil) }
    private var hasPhoto: Bool { picked != nil || composer.image != nil }

    var body: some View {
        VStack(spacing: 0) {
            if hasPhoto {
                PendingPhotoView(image: preview, keysUp: keysUp) {
                    if picked != nil { picked = nil } else { onRemovePagePhoto() }
                }
                .padding(.bottom, t.px(8))
            }
            row
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            keysUp = Self.keysUp(note)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keysUp = false
        }
    }

    /// The keys' state a frame change leaves: its end frame against the window it covers (the
    /// notification's screen, else the key window's).
    private static func keysUp(_ note: Notification) -> Bool {
        guard let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return false }
        let window = (note.object as? UIScreen)?.bounds
            ?? UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.frame }.first
        guard let window else { return false }
        return keysUp(end: end, in: window)
    }

    /// The focus moved (`now`) with the face at `size`: notes the size the box holds the focus at, and
    /// gives it back to a field made anew for a new size (`refocus`).
    private func focusChanged(_ now: Bool, size: CGFloat) {
        if Self.refocus(focusedAt: focusedAt, size: size, focusedNow: now) {
            giveFocusBack()
        } else if now {
            focusedAt = size
        } else if focusedAt == size {
            focusedAt = nil
        }
    }

    /// The face changed size: a field that lost the focus with its old size gets it back. One that
    /// still holds it is waited on (it drops it as it is made anew, through `focusChanged`); if it
    /// keeps it past the next turn, the focus is noted at the new size.
    private func sizeChanged(_ size: CGFloat) {
        let now = focused.wrappedValue
        if Self.refocus(focusedAt: focusedAt, size: size, focusedNow: now) {
            giveFocusBack()
        } else if now, focusedAt != nil {
            let focus = focused, at = $focusedAt
            DispatchQueue.main.async { if focus.wrappedValue { at.wrappedValue = size } }
        }
    }

    /// The focus back to the box on the next turn, once the new field is in place (only a focus the
    /// owner had: `refocus` decided).
    private func giveFocusBack() {
        focusedAt = nil
        let focus = focused
        DispatchQueue.main.async { if !focus.wrappedValue { focus.wrappedValue = true } }
    }

    private var row: some View {
        let shape = RoundedRectangle(cornerRadius: t.radius(.composer), style: .circular)
        let isFocused = focused.wrappedValue
        return HStack(alignment: .bottom, spacing: t.px(4)) {
            if composer.attach { attachButton }
            field
            sendButton
        }
        .padding(t.space(.composerPad) + 1)   // + the CSS border
        .background(shape.fill(t.color(.card)))
        .overlay(shape.strokeBorder(t.color(isFocused ? .composerFocus : .border), lineWidth: isFocused ? 2 : 1))
        .contentShape(shape)
        .onTapGesture { focused.wrappedValue = true }
    }

    private var attachButton: some View {
        PhotosPicker(selection: $item, matching: .images, photoLibrary: .shared()) {
            ChatGlyph.Photo()
                .stroke(t.color(hasPhoto ? .text : .muted), style: StrokeStyle(lineWidth: t.px(2) * 22 / 24, lineCap: .round, lineJoin: .round))
                .frame(width: t.px(22), height: t.px(22))
                .frame(width: t.px(44), height: t.px(44))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressDim())
        .accessibilityLabel("Attach photo")
        .onChange(of: item) { _, newItem in
            guard let newItem else { return }
            Task {
                let data = try? await newItem.loadTransferable(type: Data.self)
                let prepared = await Task.detached(priority: .userInitiated) { data.flatMap(CoachPhoto.prepare) }.value
                await MainActor.run {
                    // a pick that comes to nothing is said, never silently dropped
                    if let photo = Self.picked(prepared) { picked = photo } else { onPhotoFailed() }
                    item = nil
                }
            }
        }
    }

    /// The most lines the box shows before it scrolls.
    static let maxLines = 4

    /// The height of `lines` whole lines of `font` laid out on a `line`-point pitch: the last line
    /// ends at the face's own height (the pitch's extra is between lines), rounded up to the whole
    /// point the text view rounds its content to.
    static func textHeight(lines: Int, line: CGFloat, font: UIFont) -> CGFloat {
        guard lines > 0 else { return 0 }
        return (CGFloat(lines) * line - max(0, line - font.lineHeight)).rounded(.up)
    }

    /// 16 px on a 22 px line: one line is 44 pt (the row 58). The box is as tall as the draft up to
    /// four whole lines, then holds there and scrolls inside them, the newest line in view while
    /// typing (the web's box grows to its 120 px cap). The cap is four 22 px lines held by
    /// HeightCap: SwiftUI's own line limit counts lines of the face's height (17.4 pt at 16 pt), not
    /// the 22 px pitch this field lays them out on, and cut the fourth line of a four-line draft
    /// through its letters; a frame with that max height grew to it and sat every shorter draft
    /// (and the empty box) in a four-line box.
    private var field: some View {
        let font = t.uiFont(.body, 16, 400)
        let line = t.px(22)
        let lead = composer.attach ? t.px(8) : t.px(14)
        return ZStack(alignment: .topLeading) {
            if text.isEmpty {
                placeholder(font: font)
                    .padding(.leading, lead)
                    .padding(.trailing, t.px(2))
                    .padding(.top, (t.px(44) - font.lineHeight) / 2)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            HeightCap(max: Self.textHeight(lines: Self.maxLines, line: line, font: font)) {
                TextField("", text: $text, axis: .vertical)
                    .font(Font(font))
                    .tracking(t.bodyTracking)
                    .foregroundStyle(t.color(.text))
                    .tint(t.color(.composerFocus))
                    .lineLimit(1...)
                    .lineSpacing(max(0, line - font.lineHeight))
                    .focused(focused)
                    .accessibilityLabel(composer.a11y)
                    // a new field whenever its face changes size (the phone's text size, the app's Larger Text): an
                    // empty field kept the line height of the size it was made at (22 pt against 18 at Large, the
                    // placeholder riding high) until a key was typed
                    .id(font.pointSize)
            }
            .onChange(of: focused.wrappedValue) { _, now in focusChanged(now, size: font.pointSize) }
            .onChange(of: font.pointSize) { _, size in sizeChanged(size) }
            .padding(.vertical, (t.px(44) - font.lineHeight) / 2)
            .padding(.leading, lead)
            .padding(.trailing, t.px(8))
        }
        .frame(maxWidth: .infinity, minHeight: t.px(44), alignment: .topLeading)
    }

    /// "Message Coach…", or the short "Message…" where the whole one would be cut (_fitPlaceholder).
    private func placeholder(font: UIFont) -> some View {
        let style = InlineStyle(size: 16, weight: 400, color: .muted)
        return ViewThatFits(in: .horizontal) {
            PlainText(text: composer.placeholder, style: style, lineLimit: 1).fixedSize()
            PlainText(text: composer.short ?? composer.placeholder, style: style, lineLimit: 1)
        }
    }

    @ViewBuilder private var sendButton: some View {
        let side = t.px(44)
        let canSend = Self.canSend(text: text, hasPhoto: hasPhoto)
        if loading {
            Button(action: onStop) {
                RoundedRectangle(cornerRadius: t.px(3), style: .circular)
                    .fill(t.color(.onAccent))
                    .frame(width: t.px(12), height: t.px(12))
                    .frame(width: side, height: side)
                    .background(sendShape.fill(t.color(.accent)))
                    .contentShape(sendShape)
            }
            .buttonStyle(PressDim())
            .accessibilityLabel("Stop the reply")
        } else {
            Button(action: onSend) {
                ChatGlyph.Send()
                    .fill(t.color(canSend || t.flavor == .paper ? .onAccent : .muted))
                    .frame(width: t.px(16), height: t.px(16))
                    .frame(width: side, height: side)
                    .background {
                        if canSend || t.flavor == .paper {
                            sendShape.fill(t.color(.accent))
                        } else {
                            // Lime: Send at rest is the composer's own grey, not a muddy olive disc
                            sendShape.fill(t.color(.card2)).overlay(sendShape.strokeBorder(t.color(.border), lineWidth: 1))
                        }
                    }
                    .opacity(!canSend && t.flavor == .paper ? 0.3 : 1)
                    .contentShape(sendShape)
            }
            .buttonStyle(PressDim())
            .disabled(!canSend)
            .accessibilityLabel("Send message")
        }
    }

    private var sendShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: t.radius(.send), style: .circular)
    }
}

/// The photo waiting to be sent, on the room's card, with a remove button.
struct PendingPhotoView: View {
    let image: UIImage?
    /// The software keyboard is up: the image is capped lower (`imageCap`).
    var keysUp = false
    let onRemove: () -> Void
    @Environment(\.roomTheme) private var t

    /// The tallest the image is drawn: 140 px, or 96 px while the keys are up, as the web caps
    /// `.coach-img-preview img` under `html.kb-open` (140 left ~34 pt of conversation on a 667 pt phone).
    static func imageCap(keysUp: Bool, theme t: RoomTheme) -> CGFloat { t.px(keysUp ? 96 : 140) }

    /// How far Remove's press reaches past its drawn circle, in points at this size (a 44 pt circle
    /// at every size: 36 + 2 × 4 at large, and both scale together).
    static func removeReach(_ t: RoomTheme) -> CGFloat { t.px(4) }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.px(16), style: .circular)
        ZStack(alignment: .topTrailing) {
            Group {
                if let image {
                    // the web rounds the image's box (the column's width, 140 px tall at most, 96 with the keys up) and
                    // fits the photo inside it, so a photo that does not fill the box keeps its corners
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity, maxHeight: Self.imageCap(keysUp: keysUp, theme: t))
                        .clipShape(RoundedRectangle(cornerRadius: t.radius(.photo), style: .circular))
                        .accessibilityLabel("Photo to send")
                } else {
                    PlainText(text: "\u{1F4F7} Photo", style: InlineStyle(size: 13, weight: 500, color: .muted))
                        .frame(maxWidth: .infinity, minHeight: t.px(44))
                        .accessibilityLabel("Photo to send")
                }
            }
            .padding(t.px(8) + 1)   // + the CSS border
            // drawn as the web's 36 px circle, pressed as a 44 pt one (the photo's 6 px margin and
            // padding hold the reach)
            let reach = Self.removeReach(t)
            PressAreaButton(h: reach, v: reach, shape: Circle(), action: onRemove) {
                PlainText(text: "\u{2715}", style: InlineStyle(size: 14, weight: 700, color: .text), lineLimit: 1)
                    .frame(width: t.px(36), height: t.px(36))
                    .background(Circle().fill(t.color(.card)))
                    .overlay(Circle().strokeBorder(t.color(.border), lineWidth: 1))
            }
            .padding(t.px(6))
            .accessibilityLabel("Remove photo")
        }
        .background(shape.fill(t.color(.card)))
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
    }
}
#endif
