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
    @Environment(\.roomTheme) private var t
    @State private var item: PhotosPickerItem?

    /// Something to send: words, or a photo.
    static func canSend(text: String, hasPhoto: Bool) -> Bool {
        hasPhoto || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var preview: UIImage? { picked?.preview ?? (composer.image != nil ? pagePhoto : nil) }
    private var hasPhoto: Bool { picked != nil || composer.image != nil }

    var body: some View {
        VStack(spacing: 0) {
            if hasPhoto {
                PendingPhotoView(image: preview) {
                    if picked != nil { picked = nil } else { onRemovePagePhoto() }
                }
                .padding(.bottom, t.px(8))
            }
            row
        }
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
                    if let prepared, let preview = UIImage(data: prepared.data) {
                        picked = PickedPhoto(prepared: prepared, preview: preview)
                    }
                    item = nil
                }
            }
        }
    }

    /// 16 px on a 22 px line: one line is 44 pt (the row 58), at most about five lines.
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
            TextField("", text: $text, axis: .vertical)
                .font(Font(font))
                .tracking(t.bodyTracking)
                .foregroundStyle(t.color(.text))
                .tint(t.color(.composerFocus))
                .lineLimit(1...4)
                .lineSpacing(max(0, line - font.lineHeight))
                .padding(.vertical, (t.px(44) - font.lineHeight) / 2)
                .padding(.leading, lead)
                .padding(.trailing, t.px(8))
                .focused(focused)
                .accessibilityLabel(composer.a11y)
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
    let onRemove: () -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.px(16), style: .circular)
        ZStack(alignment: .topTrailing) {
            Group {
                if let image {
                    // the web rounds the image's box (the column's width, 140 px tall at most) and
                    // fits the photo inside it, so a photo that does not fill the box keeps its corners
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity, maxHeight: t.px(140))
                        .clipShape(RoundedRectangle(cornerRadius: t.radius(.photo), style: .circular))
                        .accessibilityLabel("Photo to send")
                } else {
                    PlainText(text: "\u{1F4F7} Photo", style: InlineStyle(size: 13, weight: 500, color: .muted))
                        .frame(maxWidth: .infinity, minHeight: t.px(44))
                        .accessibilityLabel("Photo to send")
                }
            }
            .padding(t.px(8) + 1)   // + the CSS border
            Button(action: onRemove) {
                PlainText(text: "\u{2715}", style: InlineStyle(size: 14, weight: 700, color: .text), lineLimit: 1)
                    .frame(width: t.px(36), height: t.px(36))
                    .background(Circle().fill(t.color(.card)))
                    .overlay(Circle().strokeBorder(t.color(.border), lineWidth: 1))
                    .contentShape(Circle())
            }
            .buttonStyle(PressDim())
            .padding(t.px(6))
            .accessibilityLabel("Remove photo")
        }
        .background(shape.fill(t.color(.card)))
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
    }
}
#endif
