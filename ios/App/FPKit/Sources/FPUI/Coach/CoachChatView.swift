#if os(iOS)
import SwiftUI
import UIKit
import FPCore

/// What the chat needs from whoever hosts it (plan tasks C6 and C7): where its intents go, the
/// photos it can show, the owner's initial for the header, and the composer when the host keeps it.
/// C7's CoachStore fills it from the page link; previews and tests fill it from fixtures.
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
    /// The composer's words and photo when the host keeps them (CoachStore: across presents, the
    /// words in fpDraft.coach), and then the host takes the page's drafts too. Nil: the chat keeps its
    /// own, from the page's draft (previews, contact sheets).
    public var draft: CoachComposerDraft?

    public init(send: @escaping (Intent) -> Void, image: @escaping (String) -> UIImage? = { _ in nil }, avatar: String? = nil,
                draft: CoachComposerDraft? = nil) {
        self.send = send
        self.image = image
        self.avatar = avatar
        self.draft = draft
    }

    /// A host that does nothing (previews).
    public static let inert = CoachHost(send: { _ in })
}

/// How the chat lays out.
public struct CoachChatOptions: Equatable, Sendable {
    /// When set, the whole conversation at its natural height and this width, no scroll view
    /// (contact sheets, snapshots of a long chat).
    public var unscrolledWidth: CGFloat?
    /// The host draws the toast and the confirm (ScreenHost's window above every screen, plan task
    /// C5): the chat still sets its bindings (a photo that came to nothing) but draws neither, and
    /// reports where its header ends (`CoachHeaderBottomKey`) so the host's toast sits under it.
    public var hostDrawsOverlays: Bool

    public init(unscrolledWidth: CGFloat? = nil, hostDrawsOverlays: Bool = false) {
        self.unscrolledWidth = unscrolledWidth
        self.hostDrawsOverlays = hostDrawsOverlays
    }

    public var unscrolled: Bool { unscrolledWidth != nil }
}

/// Where the chat's header ends, in global (window) coordinates: the host's toast goes 8 px under
/// it, as the web chat's does (`--toast-head`).
public struct CoachHeaderBottomKey: PreferenceKey {
    public static let defaultValue: CGFloat = 0
    public static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
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
    /// Until when the owner's own action (Send, Stop, a chip, Try again) asks for the conversation's end.
    @State private var pinnedUntil: Date = .distantPast
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
        .overlay { if !options.hostDrawsOverlays { confirmView(theme) } }
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
            // the page's own initial (header.avatar), else the host's (previews)
            CoachHeaderView(header: model.header, avatar: model.header.avatar ?? host.avatar, narrow: width <= 345, gutter: gutter, send: host.send)
                .background(GeometryReader { g in
                    Color.clear.preference(key: CoachHeaderBottomKey.self, value: g.frame(in: .global).maxY)
                })
            conversation(theme: theme, gutter: gutter, column: column)
                .overlay(alignment: .top) { if !options.hostDrawsOverlays { toastView(theme) } }
            Group {
                if let d = host.draft {
                    HostDraftComposer(draft: d) { text, picked in composer(text: text, picked: picked) }
                } else {
                    composer(text: $text, picked: $picked)
                }
            }
            .padding(.horizontal, theme.flavor == .studio ? gutter - theme.px(6) : gutter)
            .padding(.bottom, theme.px(8))
        }
        .frame(width: width, height: height, alignment: .top)
    }

    private func composer(text: Binding<String>, picked: Binding<PickedPhoto?>) -> CoachComposer {
        CoachComposer(composer: model.composer, loading: model.loading, text: text, picked: picked,
                      pagePhoto: model.composer.image.flatMap { host.image($0.key) }, focused: $focused,
                      onSend: send, onStop: stop, onRemovePagePhoto: { host.send(.coachClearImage) },
                      onPhotoFailed: { toast = Self.photoFailedToast })
    }

    // MARK: The conversation

    @ViewBuilder private func conversation(theme t: RoomTheme, gutter: CGFloat, column: CGFloat) -> some View {
        let owner = ownerHost
        let content = VStack(spacing: 0) {
            if model.messages.isEmpty, let empty = model.empty, !model.intake {
                CoachEmptyStateView(empty: empty, send: owner.send)
            } else {
                MessageColumn(model: model, columnWidth: column, host: owner)
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
                    // the keys coming up (or going) change the conversation's height: a reader at the end stays there,
                    // as the web's _chatAnchor holds the distance from the bottom (the default anchor sets only the first
                    // offset, so a chat a little taller than the space above the keys showed its top, the newest message
                    // under the composer)
                    .onChange(of: g.size.height) { _, _ in
                        guard atEnd, !options.unscrolled else { return }
                        proxy.scrollTo(Self.endID, anchor: .bottom)
                    }
                }
            }
        }
    }

    static let space = "fp.coach.scroll"

    static let endID = "end"

    /// What decides where the conversation lands: the newest message and whether a reply is in flight.
    private var landingKey: String { (model.messages.last?.id ?? "") + (model.loading ? "+thinking" : "") }

    /// Where the conversation goes when its landing key changes.
    enum Landing: Equatable {
        /// The reader scrolled up: they keep their place.
        case stay
        /// The end in view (a new question, Thinking, a note).
        case end
        /// A reply landed: it opens at its question, this scroll mark 12 pt under the header.
        case turn(String)
    }

    /// A reply that lands while the reader is at the end opens at its start: the owner's question
    /// 12 pt under the header, the answer below it; one that fits still ends above the composer. A
    /// new question or Thinking keeps the end in view. A reader who scrolled up keeps their place,
    /// unless the change is the owner's own doing (`pinned`: Send, Stop, a chip, Try again), which
    /// brings the end into view as the web chat's coachSend, coachStop and coachRetryLast scroll to
    /// it: a message sent while scrolled up stayed out of view, and so did its reply.
    static func landing(atEnd: Bool, pinned: Bool, from old: String, model: CoachModel, unscrolled: Bool) -> Landing {
        guard !unscrolled, atEnd || pinned else { return .stay }
        let replyLanded = old.hasSuffix("+thinking") && !model.loading && model.messages.last?.look == .reply
        if replyLanded, let turn = ChatPart.parts(model).last(where: \.isTurn) { return .turn("mark-" + turn.id) }
        return .end
    }

    /// The owner's own actions that ask for the conversation's end (the web chat scrolls to its end on each).
    static func asksForEnd(_ intent: Intent) -> Bool {
        switch intent {
        case .coachSend, .coachChip, .coachAction, .coachStop, .coachRetry: return true
        default: return false
        }
    }

    /// How long an owner's action waits for the change it asks for (the echo shows at once; the page's answer to a Stop
    /// or a chip within the link's timeouts).
    static let pinWindow: TimeInterval = 5

    private func land(_ proxy: ScrollViewProxy, from old: String, to new: String) {
        let pinned = Date() < pinnedUntil
        switch Self.landing(atEnd: atEnd, pinned: pinned, from: old, model: model, unscrolled: options.unscrolled) {
        case .stay:
            return
        case .end:
            proxy.scrollTo(Self.endID, anchor: .bottom)
        case .turn(let mark):
            proxy.scrollTo(mark, anchor: .top)
        }
        pinnedUntil = .distantPast   // spent: a reader who scrolls up from here keeps their place
    }

    /// The owner acted: the next landing brings the end into view, wherever the reader was.
    private func pinEnd() {
        pinnedUntil = Date().addingTimeInterval(Self.pinWindow)
    }

    /// The host the conversation's own controls use (a chip, Try again, the empty chat's suggestions): the owner's
    /// actions pin the end first.
    private var ownerHost: CoachHost {
        var h = host
        let send = host.send
        let pinned = $pinnedUntil
        h.send = { intent in
            if Self.asksForEnd(intent) { pinned.wrappedValue = Date().addingTimeInterval(Self.pinWindow) }
            send(intent)
        }
        return h
    }

    // MARK: Composer actions

    /// What Send sends: the composer's words and photo (or the page's pending one, which the
    /// composer shows) as one `coach.send` with its own nonce; nil with nothing to send or a reply
    /// in flight. The chat's Send and CoachStore's (the probe's hands) both build it here.
    static func sendIntent(text: String, picked: PickedPhoto?, model: CoachModel, nonce: String = Intent.nonce()) -> Intent? {
        let hasPhoto = picked != nil || model.composer.image != nil
        guard !model.loading, CoachComposer.canSend(text: text, hasPhoto: hasPhoto) else { return nil }
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let usePending: Bool? = picked == nil && model.composer.image != nil ? true : nil
        return .coachSend(text: words, image: picked?.prepared.coachImage, usePending: usePending, nonce: nonce)
    }

    private func send() {
        if let d = host.draft {
            // the host's composer: it echoes the message and keeps what the page never got
            guard let intent = Self.sendIntent(text: d.text, picked: d.picked, model: model) else { return }
            pinEnd()
            host.send(intent)
            d.text = ""
            d.picked = nil
            return
        }
        guard let intent = Self.sendIntent(text: text, picked: picked, model: model) else { return }
        pinEnd()
        host.send(intent)
        text = ""
        picked = nil
    }

    /// Stop, except in a turn's first half second (a double tap on Send must not stop the reply it sent).
    private func stop() {
        guard Date() >= stopGuard else { return }
        pinEnd()
        host.send(.coachStop)
    }

    /// The page's draft goes in the box once per nonce, and the page hears it was taken. A host
    /// that keeps the composer (CoachStore) takes the page's drafts itself.
    private func takeDraft() {
        guard host.draft == nil, let d = model.composer.draft, d.nonce != takenDraft else { return }
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

    /// What the chat says when a picked photo comes to nothing (the picker handed nothing over, or
    /// no image the app or the coach can read): a failure toast in the page's words and style, where
    /// a pick that did nothing left the owner guessing.
    static let photoFailedToast = ToastRequest(text: "Couldn\u{2019}t load that photo", style: "err", undo: nil)

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

/// The composer on the host's draft (CoachStore): only this view observes it, so a keystroke
/// repaints the composer and never the conversation, and words the host puts back (a message that
/// never reached the page, the page's own draft) show at once.
private struct HostDraftComposer: View {
    @ObservedObject var draft: CoachComposerDraft
    let make: (Binding<String>, Binding<PickedPhoto?>) -> CoachComposer

    var body: some View { make($draft.text, $draft.picked) }
}

/// Where the conversation's end is in the scroll view (its bottom edge, in the scroll view's space).
private struct ChatEndKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
#endif
