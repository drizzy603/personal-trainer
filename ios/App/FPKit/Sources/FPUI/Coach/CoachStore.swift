#if os(iOS)
import Foundation
import SwiftUI
import UIKit
import os.log
import FPCore

/// The owner's composer, kept by its host across presents and launches (plan task C7; decision.md section 9, C7): the
/// words in UserDefaults under `fpDraft.coach`, a picked photo in memory. Only the composer observes it, so a keystroke
/// repaints the composer and never the conversation.
@MainActor
public final class CoachComposerDraft: ObservableObject {
    /// Where the words wait between presents and launches.
    public static let defaultsKey = "fpDraft.coach"

    /// The composer's words, as typed (an empty draft removes the key).
    @Published public var text: String {
        didSet { if text != oldValue { save() } }
    }
    /// A photo the owner picked and has not sent (not kept across launches).
    @Published public var picked: PickedPhoto?

    private let defaults: UserDefaults?

    /// `defaults` nil keeps the words in memory only (previews, tests).
    public init(defaults: UserDefaults? = .standard) {
        self.defaults = defaults
        text = defaults?.string(forKey: Self.defaultsKey) ?? ""
    }

    private func save() {
        guard let defaults else { return }
        if text.isEmpty { defaults.removeObject(forKey: Self.defaultsKey) } else { defaults.set(text, forKey: Self.defaultsKey) }
    }
}

/// The live native chat (plan task C7): what the chat draws and where its taps go, between the page's models and the
/// owner's hands. ScreenHost keeps one per web view binding, so it outlives every presentation of the chat.
///
/// - **Models in order.** The page's models replace each other by `rev` within a document; an older or equal rev is
///   stale and ignored (the link's LinkState drops them first; a snapshot's answer and a push can still cross). A model
///   of another document (a reload, a WebContent restart) replaces the one drawn whatever its rev: the new boot's resync.
/// - **The optimistic echo.** The owner's message (Send, an empty chat's suggestion) shows as their bubble at once, keyed
///   by the send's nonce, and gives way to the page's own message as soon as a model holds it: by the message id
///   `coach.send` answers with, or (when the model comes first) a message of the owner's with the same words or photo
///   said at or after the send. A send the page refuses (a reply in flight), or one that never reached it (no page
///   linked; no answer and the page's next model, or the next document's, does not have it), goes back in the composer
///   with a word to the owner. Never resent.
/// - **The composer** (`draft`) is the store's: the owner's words survive the chat going down and up again and a
///   relaunch (`fpDraft.coach`); the page's own draft (Build day's question, a shared photo's comment) goes in once per
///   nonce and the page hears `coach.draftTaken`, as its web composer fills from `coachPrefill`.
/// - **Photos.** The ones this chat sends ("n:<nonce>", as the page keys them) and the page's pending one (fetched once
///   with `coach.image`) are drawn by key; without one the chat says Photo, as the web does after a relaunch.
/// - **Toasts and confirms** go through the bridge: the page forwards its own while the chat covers it and the host
///   draws them above every screen; the chat's own (a photo that came to nothing, a message not sent) go to the same
///   place through `hooks.toast`. A confirm open when the page's document goes closes there as stale (ScreenHost).
@MainActor
public final class CoachStore: ObservableObject {
    static let log = Logger(subsystem: "app.kt.trainer", category: "coach")

    /// What the store asks of its host (ScreenHost, and through it ShellBridge's link).
    public struct Hooks {
        /// An intent for the page, and how it ended.
        public var ask: (Intent, @escaping (PageLink.Outcome) -> Void) -> Void = { _, done in done(.notLinked) }
        /// The owner's Back: the screen goes down here and now, and the host tells the page.
        public var back: () -> Void = {}
        /// A toast of the chat's own, shown where the page's forwarded ones are.
        public var toast: (ToastRequest) -> Void = { _ in }
        public init() {}
    }

    /// An owner's message on its way to the page, drawn as their bubble until a model of the page's holds it.
    public struct Echo: Equatable {
        public enum Phase: String, Equatable {
            /// Asked; the page has not answered.
            case sending
            /// The page took it (`coach.send` done): it waits for the model that holds it.
            case sent
            /// No answer to rely on (a timeout, a broken bridge, its document gone): the page's next model decides.
            case unsure
        }

        public let nonce: String
        /// The words as sent (trimmed); empty for a photo sent alone.
        public let words: String
        /// The photo's key in the page's message: "n:<nonce>" for one this chat picked, the pending photo's own key.
        public let imageKey: String?
        /// When the owner sent it.
        public let at: Date
        public internal(set) var phase: Phase = .sending
        /// The page's message id (`coach.send`'s answer).
        public internal(set) var pageID: String?
        /// When it entered its phase.
        var since: Date
        /// Unsure: the document whose model was drawn when it became so. A model of another document, or of this one a
        /// while later, decides.
        var unsureOf: String?
        /// The photo to put back with the words if the message never reached the page.
        var picked: PickedPhoto?
    }

    /// The page's newest model (nil before the first, and once the document it came from went while the chat was down).
    @Published public private(set) var model: CoachModel?
    /// The owner's messages on their way, oldest first.
    @Published public private(set) var echoes: [Echo] = []
    @Published private var images: [String: UIImage] = [:]
    /// The composer's words and photo.
    public let draft: CoachComposerDraft
    public var hooks = Hooks()

    /// What happened, for the log and the probe (the last 80 lines).
    public private(set) var events: [String] = []
    /// The words of every message put back in the composer.
    public private(set) var restored: [String] = []
    /// The page's drafts taken, by nonce (the last 20).
    public private(set) var draftsTaken: [String] = []
    /// The toasts the store asked for (the probe's).
    public private(set) var toasts: [String] = []
    private var imageKeys: [String] = []
    private var fetching: Set<String> = []
    private var noImage: Set<String> = []

    /// How long a message the page took waits for a model that holds it before the echo goes without it (the page let
    /// it go: Clear chat).
    var sentGrace: TimeInterval = 5
    /// How long a message with no answer to rely on waits for the page's word before it goes back in the composer.
    var unsureGrace: TimeInterval = 8
    /// A model of the same document this long after the failure, without the message, says it never arrived.
    var unsureSettle: TimeInterval = 1.5
    var now: () -> Date = Date.init

    static let notSent = "Couldn\u{2019}t send that \u{2014} your message is back in the box"
    static let busy = "The coach is still replying \u{2014} your message is back in the box"

    /// `draft`: the composer to keep (nil: the app's, in `fpDraft.coach`).
    public init(draft: CoachComposerDraft? = nil) {
        self.draft = draft ?? CoachComposerDraft()
    }

    /// The chat's host: every control's intent through `handle`, the photos held here, the composer.
    public var host: CoachHost {
        CoachHost(send: { [weak self] in self?.handle($0) }, image: { [weak self] in self?.image($0) }, draft: draft)
    }

    /// What the chat draws: the page's model with the owner's messages still on their way after its own, each over a
    /// day divider where the page would put one.
    public var display: CoachModel? {
        guard var m = model else { return nil }
        let waiting = echoes.filter { !holds($0, m) }
        guard !waiting.isEmpty else { return m }
        let cal = Calendar.current
        var day = m.messages.last(where: { $0.at != nil })?.at.map { cal.startOfDay(for: $0) }
        for e in waiting {
            let d = cal.startOfDay(for: e.at)
            m.messages.append(Message(id: "echo-" + e.nonce, role: .user, at: e.at, day: day == d ? nil : "Today",
                                      body: .text(e.words), image: e.imageKey.map { MessageImage(key: $0) }))
            day = d
        }
        return m
    }

    /// A photo by key, if the store holds it.
    public func image(_ key: String) -> UIImage? { images[key] }

    // MARK: Models

    /// A model the link accepted. Within a document only a newer rev replaces the one drawn (false: stale, ignored); a
    /// model of another document replaces it whatever its rev.
    @discardableResult
    public func apply(_ m: CoachModel) -> Bool {
        if let cur = model, cur.boot == m.boot, m.rev <= cur.rev {
            note("model rev \(m.rev) ignored: not newer than rev \(cur.rev)")
            return false
        }
        if let cur = model, cur.boot != m.boot { note("a new document's model (rev \(m.rev))") }
        model = m
        settle(m)
        takePageDraft(m)
        fetchPendingPhoto(m)
        return true
    }

    /// The document under the chat went (a reload, a WebContent restart): with the chat up the model stays drawn until
    /// the next document's resync; down, it goes with its document (the chat opens on its own document's model).
    /// Messages on their way wait for the next document's model: their sends end `documentGone`.
    public func documentGone(chatUp: Bool) {
        if !chatUp { model = nil }
        note("the page's document went" + (chatUp ? " (the chat stays up for the next one)" : ""))
    }

    /// The binding is going (its scene went): every message still on its way goes back in the composer (kept for the
    /// next chat in fpDraft.coach); no toast, no one is looking.
    public func tearDown() {
        let left = echoes
        echoes = []
        for e in left { putBack(e, why: "the chat went", toast: false) }
    }

    /// Whether the page's model holds this message: by the id the page answered with (ids carry their boot's tag), or a
    /// message of the owner's with the same photo or words, said at or after the send (a model can come before the
    /// answer, and the next document's ids are new). A photo sent with no words is held by a message of the owner's with a
    /// photo and no words: the page keeps no photo key across a reload, so the next document's message has none, and a
    /// photo-only send whose answer the reload lost went back in the composer although the page had it.
    func holds(_ e: Echo, _ m: CoachModel) -> Bool {
        if let id = e.pageID, m.message(id: id) != nil { return true }
        let floor = e.at.addingTimeInterval(-2)
        return m.messages.contains { msg in
            guard msg.role == .user, msg.seed == nil, let at = msg.at, at >= floor else { return false }
            if let k = e.imageKey, msg.image?.key == k { return true }
            if e.words.isEmpty { return e.imageKey != nil && msg.image != nil && ChatPart.bubbleText(msg).isEmpty }
            return ChatPart.bubbleText(msg) == e.words
        }
    }

    /// Each message on its way against a new model: the page's own replaces it. One with no answer to rely on that a model
    /// of another document, or of its own a while later, does not hold never arrived: back in the composer. One still
    /// being asked waits for its answer (the next document's resync can come before a send made right after a reload is
    /// taken, since intents go in order); one the page took waits for the model that holds it.
    private func settle(_ m: CoachModel) {
        guard !echoes.isEmpty else { return }
        let t = now()
        var keep: [Echo] = []
        var back: [Echo] = []
        for e in echoes {
            if holds(e, m) {
                note("echo \(e.nonce) replaced by the page's message")
            } else if e.phase == .unsure, m.boot != e.unsureOf || t.timeIntervalSince(e.since) >= unsureSettle {
                back.append(e)
            } else {
                keep.append(e)
            }
        }
        echoes = keep
        for e in back { putBack(e, why: "not in the page's model") }
    }

    // MARK: Intents

    /// Every control's intent: Back goes to the host; a message the owner sends is echoed and followed; the page's
    /// drafts are taken here, not by the chat; the rest goes to the page.
    public func handle(_ intent: Intent) {
        switch intent {
        case .coachBack:
            hooks.back()
        case .coachSend(let text, let image, let usePending, let nonce):
            send(intent, words: text, nonce: nonce, image: image, usePending: usePending == true)
        case .coachChip(let text, let nonce):
            send(intent, words: text, nonce: nonce, image: nil, usePending: true)
        case .coachDraftTaken:
            break
        default:
            hooks.ask(intent) { _ in }
        }
    }

    /// The composer's Send (the chat's button and the probe alike): what the composer holds goes to the page once,
    /// echoed at once, and the composer empties. False with nothing to send or a reply in flight.
    @discardableResult
    public func sendComposer(nonce: String = Intent.nonce()) -> Bool {
        guard let m = display, let intent = CoachChatView.sendIntent(text: draft.text, picked: draft.picked, model: m, nonce: nonce) else {
            return false
        }
        handle(intent)
        draft.text = ""
        draft.picked = nil
        return true
    }

    private func send(_ intent: Intent, words: String, nonce: String, image: CoachImage?, usePending: Bool) {
        guard let m = model else {
            hooks.ask(intent) { _ in }
            return
        }
        var key: String?
        var picked: PickedPhoto?
        if let image {
            key = "n:" + nonce
            picked = draft.picked
            if let p = picked { remember(key!, p.preview) } else if let data = Data(base64Encoded: image.data), let ui = UIImage(data: data) { remember(key!, ui) }
        } else if usePending, let k = m.composer.image?.key {
            key = k
        }
        let t = now()
        let e = Echo(nonce: nonce, words: words.trimmingCharacters(in: .whitespacesAndNewlines), imageKey: key, at: t, since: t, picked: picked)
        echoes.append(e)
        note("echo \(nonce) shown")
        hooks.ask(intent) { [weak self] outcome in self?.answered(nonce, outcome) }
    }

    private func answered(_ nonce: String, _ outcome: PageLink.Outcome) {
        guard let i = echoes.firstIndex(where: { $0.nonce == nonce }) else { return }
        var e = echoes[i]
        e.since = now()
        switch outcome {
        case .answered(.done(let reply)):
            if reply.value["duplicate"]?.bool == true {
                echoes.remove(at: i)
                note("echo \(nonce): the page had it already")
                return
            }
            e.pageID = reply.value["id"]?.string
            e.phase = .sent
            if let m = model, holds(e, m) {
                echoes.remove(at: i)
                note("echo \(nonce) replaced by the page's message")
                return
            }
            echoes[i] = e
            note("echo \(nonce) taken by the page as \(e.pageID ?? "a message with no id")")
            later(sentGrace) { $0.expire(nonce, .sent) }
        case .answered(.refused(let why)):
            echoes.remove(at: i)
            putBack(e, why: why)
        case .answered(.failed), .documentGone:
            e.phase = .unsure
            e.unsureOf = model?.boot
            echoes[i] = e
            note("echo \(nonce): \(outcome.word), the page's next model decides")
            later(unsureGrace) { $0.expire(nonce, .unsure) }
        case .notLinked:
            echoes.remove(at: i)
            putBack(e, why: "no page linked")
        }
    }

    /// A message still waiting after its grace: one the page took goes without its model (the page let it go); one with
    /// no answer to rely on goes back in the composer.
    private func expire(_ nonce: String, _ phase: Echo.Phase) {
        guard let i = echoes.firstIndex(where: { $0.nonce == nonce }), echoes[i].phase == phase else { return }
        let e = echoes.remove(at: i)
        if phase == .sent {
            note("echo \(nonce) went: no model held it \(Int(sentGrace)) s after the page took it")
        } else {
            putBack(e, why: "no word from the page")
        }
    }

    /// A message that never reached the page: its words go back in the composer, in front of anything typed since, and
    /// its photo too; the owner is told. Never resent.
    private func putBack(_ e: Echo, why: String, toast: Bool = true) {
        if !e.words.isEmpty {
            let cur = draft.text
            if cur.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draft.text = e.words
            } else if !cur.contains(e.words) {
                draft.text = e.words + "\n" + cur
            }
        }
        if let p = e.picked, draft.picked == nil { draft.picked = p }
        restored.append(e.words)
        note("echo \(e.nonce) back in the composer (\(why))")
        if toast {
            let t = ToastRequest(text: why == "busy" ? Self.busy : Self.notSent, style: "err", undo: nil)
            toasts.append(t.text)
            hooks.toast(t)
        }
    }

    // MARK: The page's draft and photo

    /// The page's draft goes in the composer once per nonce, as the web composer fills from `coachPrefill`: the owner
    /// asked for it (Build day's question, a shared photo's comment). The page hears `coach.draftTaken`.
    private func takePageDraft(_ m: CoachModel) {
        guard let d = m.composer.draft, !draftsTaken.contains(d.nonce) else { return }
        draftsTaken.append(d.nonce)
        if draftsTaken.count > 20 { draftsTaken.removeFirst(draftsTaken.count - 20) }
        draft.text = d.text
        note("the page's draft \(d.nonce) is in the composer")
        hooks.ask(.coachDraftTaken(nonce: d.nonce)) { _ in }
    }

    /// The page's pending photo (a shared image), fetched once by its key (one the page would not give, or that is no
    /// image, is not asked for again: the chat says Photo).
    private func fetchPendingPhoto(_ m: CoachModel) {
        guard let key = m.composer.image?.key, images[key] == nil, !fetching.contains(key), !noImage.contains(key) else { return }
        fetching.insert(key)
        hooks.ask(.coachImage(key: key)) { [weak self] outcome in
            guard let self else { return }
            self.fetching.remove(key)
            guard case .answered(.done(let r)) = outcome, let b64 = r.value["data"]?.string, let data = Data(base64Encoded: b64),
                  let ui = UIImage(data: data) else {
                if case .answered(.failed) = outcome {} else { self.noImage.insert(key) }   // a broken bridge may answer next time
                self.note("the page's photo \(key) did not come (\(outcome.word))")
                return
            }
            self.remember(key, ui)
        }
    }

    private func remember(_ key: String, _ image: UIImage) {
        images[key] = image
        imageKeys.removeAll { $0 == key }
        imageKeys.append(key)
        while imageKeys.count > 12 { images[imageKeys.removeFirst()] = nil }
    }

    // MARK: Helpers

    private func later(_ seconds: TimeInterval, _ body: @escaping (CoachStore) -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            MainActor.assumeIsolated {
                guard let self else { return }
                body(self)
            }
        }
    }

    private func note(_ line: String) {
        events.append(line)
        if events.count > 80 { events.removeFirst(events.count - 80) }
        Self.log.info("coach: \(line, privacy: .public)")
    }

    /// What the probe reports.
    public func describe() -> [String: Any] {
        var out: [String: Any] = [
            "rev": model?.rev ?? NSNull(), "boot": model?.boot ?? NSNull(),
            "echoes": echoes.map { ["nonce": $0.nonce, "words": $0.words, "phase": $0.phase.rawValue, "pageID": $0.pageID ?? NSNull()] as [String: Any] },
            "draft": draft.text, "picked": draft.picked != nil, "restored": restored, "draftsTaken": draftsTaken,
            "toasts": toasts, "images": imageKeys, "events": Array(events.suffix(40)),
        ]
        if let d = display {
            out["tail"] = d.messages.suffix(4).map { m -> [String: Any] in
                var o: [String: Any] = ["id": m.id, "role": m.role == .user ? "user" : "assistant", "text": String(m.body.plainText.prefix(120)),
                                        "pills": m.pills.map(\.label)]
                if let l = m.ledger {
                    o["ledger"] = ["head": l.head, "rows": l.rows.map { [$0.label, $0.value] }, "canUndo": l.canUndo,
                                   "actions": l.actions.map(\.label), "note": l.note ?? NSNull()] as [String: Any]
                }
                return o
            }
            out["loading"] = d.loading
            out["running"] = d.running.map(\.label)
        }
        return out
    }
}
#endif
