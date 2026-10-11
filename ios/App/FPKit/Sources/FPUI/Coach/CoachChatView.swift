#if os(iOS)
import SwiftUI
import UIKit
import FPCore

/// What the chat needs from whoever hosts it (plan tasks C6 and C7): where its intents go, the
/// photos it can show, and the owner's initial for the header. C7's CoachStore fills it from the
/// page link; previews and tests fill it from fixtures.
public struct CoachHost {
    /// Every tap the chat turns into a call to the page (FPCore's Intent): sends, chips, Stop,
    /// Undo/Keep by message id, the model switch, Back, Cancel, the empty chat's buttons, the
    /// composer's photo and draft, confirm answers, toast Undo.
    public var send: (Intent) -> Void
    /// A photo by key, if the host holds it: a message's (one Swift sent) or the page's pending
    /// photo (fetched with `coach.image {key}`). Without it the chat says Photo, as the web does
    /// after a relaunch.
    public var image: (String) -> UIImage?
    /// The owner's initial over the header (decorative). Nil draws none.
    public var avatar: String?

    public init(send: @escaping (Intent) -> Void, image: @escaping (String) -> UIImage? = { _ in nil }, avatar: String? = nil) {
        self.send = send
        self.image = image
        self.avatar = avatar
    }

    /// A host that does nothing (previews).
    public static let inert = CoachHost(send: { _ in })
}

/// How the chat lays out.
public struct CoachChatOptions: Equatable, Sendable {
    /// When set, the whole conversation at its natural height and this width, no scroll view
    /// (contact sheets, snapshots of a long chat).
    public var unscrolledWidth: CGFloat?

    public init(unscrolledWidth: CGFloat? = nil) {
        self.unscrolledWidth = unscrolledWidth
    }

    public var unscrolled: Bool { unscrolledWidth != nil }
}

/// The native Coach chat (plan task C6): FPCore's CoachModel drawn as the web chat draws it, in the
/// model's room (its tokens, compiled defaults under the page's overrides), at the system text size
/// clamped as the app's toggle says, in the room's appearance whatever the phone's setting. Every
/// control sends an Intent through the host; nothing here parses markdown, builds a label or decides
/// what a message says: the page does, and the model carries it.
///
/// One column: the header stays, the conversation is the only thing that scrolls (opening at its
/// newest message, a short chat hugging the composer), the photo waiting to be sent and the
/// composer sit below it. A forwarded toast shows 8 pt under the header; a forwarded confirm is a
/// sheet over everything.
public struct CoachChatView: View {
    let model: CoachModel
    let host: CoachHost
    @Binding var toast: ToastRequest?
    @Binding var confirm: ConfirmRequest?
    let options: CoachChatOptions

    @Environment(\.dynamicTypeSize) private var systemSize
    @State private var text: String
    @State private var picked: PickedPhoto?
    @State private var takenDraft: String?
    @State private var spoken: String?
    @State private var stopGuard: Date = .distantPast
    @State private var atEnd = true
    @FocusState private var focused: Bool

    public init(model: CoachModel, host: CoachHost, toast: Binding<ToastRequest?> = .constant(nil),
                confirm: Binding<ConfirmRequest?> = .constant(nil), options: CoachChatOptions = .init()) {
        self.model = model
        self.host = host
        _toast = toast
        _confirm = confirm
        self.options = options
        // the page's prefill (a shared photo's comment, Build day's question) is in the box from the
        // first frame; takeDraft() tells the page it was taken
        _text = State(initialValue: model.composer.draft?.text ?? "")
    }

    public var body: some View {
        let theme = RoomTheme(model: model, system: systemSize)
        Group {
            if let width = options.unscrolledWidth {
                screen(theme, width: width, height: nil)
            } else {
                GeometryReader { geo in screen(theme, width: geo.size.width, height: geo.size.height) }
            }
        }
        .background(theme.color(.bg).ignoresSafeArea())
        .overlay { confirmView(theme) }
        // outermost, so the confirm sheet (an overlay) is in the room too
        .environment(\.roomTheme, theme)
        .environment(\.colorScheme, theme.colorScheme)
        .dynamicTypeSize(ChatType.range(dynTypeOn: model.dynTypeOn))
        .onAppear {
            spoken = model.speech?.id
            takeDraft()
        }
        .onChange(of: model.composer.draft) { takeDraft() }
        .onChange(of: model.speech) { announce() }
        .onChange(of: model.loading) { _, now in
            if now { stopGuard = Date().addingTimeInterval(0.5) }
        }
    }

    /// The column: header, conversation, composer.
    private func screen(_ theme: RoomTheme, width: CGFloat, height: CGFloat?) -> some View {
        // the web's narrow-screen rules are media queries, which its Dynamic Type zoom does not
        // change: they read the screen's own width (a 320 pt Display Zoom phone), while the gutter
        // they pick scales with the text like every other length
        let gutter = theme.px(width <= 360 ? 16 : 20)
        let column = max(0, width - 2 * gutter)
        return VStack(spacing: 0) {
            CoachHeaderView(header: model.header, avatar: host.avatar, narrow: width <= 345, gutter: gutter, send: host.send)
            conversation(theme: theme, gutter: gutter, column: column)
                .overlay(alignment: .top) { toastView(theme) }
            CoachComposer(composer: model.composer, loading: model.loading, text: $text, picked: $picked,
                          pagePhoto: model.composer.image.flatMap { host.image($0.key) }, focused: $focused,
                          onSend: send, onStop: stop, onRemovePagePhoto: { host.send(.coachClearImage) })
                .padding(.horizontal, theme.flavor == .studio ? gutter - theme.px(6) : gutter)
                .padding(.bottom, theme.px(8))
        }
        .frame(width: width, height: height, alignment: .top)
    }

    // MARK: The conversation

    @ViewBuilder private func conversation(theme t: RoomTheme, gutter: CGFloat, column: CGFloat) -> some View {
        let content = VStack(spacing: 0) {
            if model.messages.isEmpty, let empty = model.empty, !model.intake {
                CoachEmptyStateView(empty: empty, send: host.send)
            } else {
                MessageColumn(model: model, columnWidth: column, host: host)
            }
        }
        .padding(.horizontal, gutter)
        .padding(.top, t.px(16))
        if options.unscrolled {
            VStack(spacing: 0) {
                content
                Color.clear.frame(height: t.px(16))
            }
        } else {
            GeometryReader { g in
                ScrollViewReader { proxy in
                    ScrollView(.vertical) {
                        VStack(spacing: 0) {
                            content
                            // the conversation's own 16 px end, the only gap above the composer
                            Color.clear.frame(height: t.px(16)).id(Self.endID)
                                .background(GeometryReader { e in
                                    Color.clear.preference(key: ChatEndKey.self, value: e.frame(in: .named(Self.space)).maxY)
                                })
                        }
                        .frame(maxWidth: .infinity, minHeight: g.size.height, alignment: .bottom)
                        .contentShape(Rectangle())
                        .onTapGesture { focused = false }
                    }
                    .coordinateSpace(name: Self.space)
                    .defaultScrollAnchor(.bottom)
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .onPreferenceChange(ChatEndKey.self) { endY in
                        // within 80 pt of the end, as the web's _chatAtEnd
                        atEnd = endY - g.size.height < 80
                    }
                    .onChange(of: landingKey) { old, new in land(proxy, from: old, to: new) }
                }
            }
        }
    }

    static let space = "fp.coach.scroll"

    static let endID = "end"

    /// What decides where the conversation lands: the newest message and whether a reply is in flight.
    private var landingKey: String { (model.messages.last?.id ?? "") + (model.loading ? "+thinking" : "") }

    /// A reply that lands while the reader is at the end opens at its start: the owner's question
    /// 12 pt under the header, the answer below it; one that fits still ends above the composer. A
    /// new question or Thinking keeps the end in view. A reader who scrolled up keeps their place.
    private func land(_ proxy: ScrollViewProxy, from old: String, to new: String) {
        guard atEnd, !options.unscrolled else { return }
        let replyLanded = old.hasSuffix("+thinking") && !model.loading && model.messages.last?.look == .reply
        if replyLanded, let turn = ChatPart.parts(model).last(where: \.isTurn) {
            proxy.scrollTo("mark-" + turn.id, anchor: .top)
        } else {
            proxy.scrollTo(Self.endID, anchor: .bottom)
        }
    }

    // MARK: Composer actions

    private func send() {
        let hasPhoto = picked != nil || model.composer.image != nil
        guard !model.loading, CoachComposer.canSend(text: text, hasPhoto: hasPhoto) else { return }
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let usePending: Bool? = picked == nil && model.composer.image != nil ? true : nil
        host.send(.coachSend(text: words, image: picked?.prepared.coachImage, usePending: usePending, nonce: Intent.nonce()))
        text = ""
        picked = nil
    }

    /// Stop, except in a turn's first half second (a double tap on Send must not stop the reply it sent).
    private func stop() {
        guard Date() >= stopGuard else { return }
        host.send(.coachStop)
    }

    /// The page's draft goes in the box once per nonce, and the page hears it was taken.
    private func takeDraft() {
        guard let d = model.composer.draft, d.nonce != takenDraft else { return }
        if takenDraft != nil || text.isEmpty || text == d.text { text = d.text }
        takenDraft = d.nonce
        host.send(.coachDraftTaken(nonce: d.nonce))
    }

    /// VoiceOver hears the coach (the page's _coachSay): once per speech id.
    private func announce() {
        guard let s = model.speech, s.id != spoken else { return }
        spoken = s.id
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: s.text)
        }
    }

    // MARK: Toast and confirm

    @ViewBuilder private func toastView(_ t: RoomTheme) -> some View {
        if let toast {
            CoachToastView(toast: toast) {
                if let id = toast.undo { host.send(.toastUndo(id: id)) }
                self.toast = nil
            }
            .padding(.horizontal, t.px(20))
            .padding(.top, t.px(8))
            .transition(.opacity)
            .task(id: toast) {
                if UIAccessibility.isVoiceOverRunning {
                    UIAccessibility.post(notification: .announcement, argument: toast.text)
                }
                try? await Task.sleep(nanoseconds: UInt64(toast.duration * 1_000_000_000))
                if self.toast == toast { self.toast = nil }
            }
        }
    }

    @ViewBuilder private func confirmView(_ t: RoomTheme) -> some View {
        if let confirm {
            CoachConfirmSheet(confirm: confirm) { yes in
                host.send(confirm.answer(yes))
                self.confirm = nil
            }
        }
    }
}

/// Where the conversation's end is in the scroll view (its bottom edge, in the scroll view's space).
private struct ChatEndKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
#endif
