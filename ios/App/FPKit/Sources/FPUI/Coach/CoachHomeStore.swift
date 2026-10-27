#if os(iOS)
import Foundation
import SwiftUI
import os.log
import FPCore

// The native Coach tab's store and root (build 61; contract 15.2, plan task N8): N's side of the seam between the
// shell, which hosts, and the tab's insides, which N draws. ScreenHost (H10) makes one CoachHomeStore per web view
// binding beside the chat's CoachStore, wires its hooks, hands it every coachHome model it decodes and hosts
// CoachHomeRoot once as the Coach stack's root. Nothing here sees PageLink (only the outcome its hooks hand back),
// ShellBridge, the root, the web view or a navigation controller, and nothing here decides a rule of the page's (when a
// row shows, whether a key is good, what Back does in setup): the store holds the page's newest model and sends what
// the owner pressed. Nothing here waits on a navigation callback either (UIKit's didShow comes late and twice, H0's
// probe): a model, a press and an answer each act at once.

/// The page's newest CoachHomeModel and where the hub's presses go, between the page's models and the owner's hands.
/// ScreenHost keeps one per web view binding, so it outlives every document and every visit to the Coach tab.
///
/// - **Models in order** (CoachStore's rule): within a document only a newer rev replaces the model drawn (an older or
///   equal one is stale and ignored); a model of another document (a reload, a WebContent restart) replaces it whatever
///   its rev: the new document's resync.
/// - **A document going** (`documentGone(keep:)`): while the tab is NATIVE the model stays drawn until the next
///   document's takeover and snapshot (contract 1.4, 8.3); otherwise it goes with its document.
/// - **Presses** (`handle`): a row sends its intent and the starter link `coachHome.openStarter`, through
///   CoachHomeModel's map (N6); CONNECT (or Return) sends `coachHome.setKey {secret}` once and nothing more until the
///   page has answered (`connecting`), so no second key can overlap the first (the page would answer `stale` anyway,
///   contract 4.1). A key that never reached the page (nothing linked, its document gone, the bridge failed) gives one
///   toast in the room's error style; the page's own refusals (`off`, `stale`, `invalid`) add nothing, since its own
///   toast comes forwarded while the tab covers it (contract 3.9, K6). Nothing is resent (contract 4.3).
/// - **The key** exists here only inside `handle` and in the intent handed to `hooks.ask` (contract 5, K1-K5): no
///   property, event, outcome, toast, `describe()` or log line holds it or any part of it. The key field reports only
///   whether it holds text (`keyFieldTyped`), never what.
/// - **The key field goes** when the route leaves the connect screen (K5: its text clears), with a document that goes
///   while the tab is not NATIVE, and at `tearDown`: the store bumps `keyFieldGeneration`, which the connect block's
///   identity carries, so the next field is new and empty whether or not SwiftUI drew the model in between (two models
///   handled in one turn of the main queue are drawn as one).
@MainActor
public final class CoachHomeStore: ObservableObject {
    static let log = Logger(subsystem: "app.kt.trainer", category: "coachHome")

    /// What the store asks of its host (ScreenHost, and through it ShellBridge's link and the overlay window).
    public struct Hooks {
        /// An intent for the page, and how it ended (unwired: nothing is linked).
        public var ask: (Intent, @escaping (PageLink.Outcome) -> Void) -> Void = { _, done in done(.notLinked) }
        /// A toast of the store's own, shown where the page's forwarded ones are.
        public var toast: (ToastRequest) -> Void = { _ in }
        public init() {}
    }

    /// The page's newest model (nil before the first, after a document that went while the tab was not NATIVE, and
    /// after `tearDown`).
    @Published public private(set) var model: CoachHomeModel?
    /// A `coachHome.setKey` is out: CONNECT and Return send nothing until the page answers it.
    @Published public private(set) var connecting = false
    /// Whether the key field holds text, as the field reports it (never the text): false with no field.
    public private(set) var keyFieldTyped = false
    /// The key field's generation (`CoachHomeHost.fieldGeneration`, which the connect block's identity carries): bumped
    /// wherever the field must be made anew, so the view makes a new, empty one even when SwiftUI never draws the model
    /// that took the old one away. It changes only with `model`, whose publishing redraws the root.
    private(set) var keyFieldGeneration = 0
    public var hooks = Hooks()

    /// What happened, for the log and the probe (the last 80 lines).
    public private(set) var events: [String] = []
    /// The last outcome of each intent sent, by intent name (PageLink's word: done, refused <why>, failed <why>, gone,
    /// not linked).
    public private(set) var outcomes: [String: String] = [:]
    /// The toasts the store asked for, the last 20 (the probe's; the store lives as long as its binding).
    public private(set) var toasts: [String] = []
    /// Bumped by `tearDown`: an answer to an intent sent before it is ignored.
    private var era = 0

    /// The toast for a key that never reached the page, in the voice of the chat's own (`CoachStore.notSent`).
    static let notSaved = "Couldn\u{2019}t save the key \u{2014} try again"

    public init() {}

    /// The hub's host: every press through `handle`, whether a key is out, the key field's flag and its generation.
    public var host: CoachHomeHost {
        CoachHomeHost(act: { [weak self] in self?.handle($0) }, connecting: connecting,
                      fieldTyped: { [weak self] in self?.fieldTyped($0) }, fieldGeneration: keyFieldGeneration)
    }

    // MARK: Models

    /// A model the link accepted. Within a document only a newer rev replaces the one drawn (false: stale, ignored); a
    /// model of another document replaces it whatever its rev.
    @discardableResult
    public func apply(_ m: CoachHomeModel) -> Bool {
        if let cur = model, cur.boot == m.boot, m.rev <= cur.rev {
            note("model rev \(m.rev) ignored: not newer than rev \(cur.rev)")
            return false
        }
        if let cur = model, cur.boot != m.boot { note("a new document's model (rev \(m.rev))") }
        // the route's connect block changes (it leaves the connect screen, K5): the field goes. A new generation goes
        // into the block's identity, so the view makes a new, empty field even when SwiftUI never draws this model (a
        // hub model and the next connect model handled in one turn are drawn as one), and the flag follows it
        if model.flatMap(CoachHomeView.connectKey) != CoachHomeView.connectKey(m) {
            keyFieldGeneration += 1
            if keyFieldTyped {
                keyFieldTyped = false
                note("the key field went with its route")
            }
        }
        model = m
        note("model rev \(m.rev): \(Self.word(m.route))\(m.resume ? ", resume" : "")")
        return true
    }

    /// The page's document went (a reload, a WebContent restart). `keep` (the tab is NATIVE): the model stays drawn
    /// until the next document's takeover and snapshot; otherwise it goes with its document, and the hub with its key
    /// field (a new generation: the next connect model's field is new, whether or not SwiftUI draws the ground in
    /// between). An answer still on its way ends as `documentGone` (PageLink): see `handle`.
    public func documentGone(keep: Bool) {
        if keep {
            note("the page's document went: its model stays drawn until the next one's (the tab is native)")
            return
        }
        model = nil
        keyFieldTyped = false
        keyFieldGeneration += 1
        note("the page's document went: its model goes with it")
    }

    /// The binding is going (its scene went, or the scene fell back to the classic root): the model goes with the key
    /// field (a new generation, as `documentGone`), no key is out any more, and an answer still on its way is ignored
    /// (no toast: no one is looking).
    public func tearDown() {
        era += 1
        model = nil
        connecting = false
        keyFieldTyped = false
        keyFieldGeneration += 1
        note("torn down: the model gone, answers still on their way ignored")
    }

    // MARK: Presses

    /// What a hub control sends (H11's probe may call it too, and then says `via: "model"`): a row its intent, the
    /// starter link `coachHome.openStarter`, CONNECT `coachHome.setKey {secret}` once, never while a key is out.
    public func handle(_ action: CoachHomeAction) {
        switch action {
        case .row(let row):
            ask(row.intent)
        case .starter:
            ask(model?.connect?.openStarter ?? .coachHomeOpenStarter)
        case .connect(let secret):
            guard !connecting else {
                note("CONNECT ignored: a key is out")
                return
            }
            connecting = true
            // the secret goes into this intent and nowhere else; the answer's closure never sees it
            ask(model?.connect?.setKey(secret: secret) ?? .coachHomeSetKey(secret: secret)) { [weak self] outcome in
                self?.keyAnswered(outcome)
            }
        }
    }

    /// The key field says whether it holds text (when that changes, and when a field appears empty). While the model
    /// draws no field (none, or a route without a connect block), a field that says it holds text is one on its way
    /// out, reporting late (an appearance UIKit replays as the Coach stack comes back into the window, before the
    /// newer model's update removes the field): ignored, so the flag never says "typed" over the hub or the ground.
    func fieldTyped(_ typed: Bool) {
        guard typed != keyFieldTyped else { return }
        if typed, !connectDrawn {
            note("a key field on its way out says it holds text: ignored, no field is drawn")
            return
        }
        keyFieldTyped = typed
        note(typed ? "the key field holds text" : "the key field is empty")
    }

    /// Sends an intent once and records how it ended (an answer to an intent sent before `tearDown` is ignored). The
    /// answer's closure holds the intent's name, never the intent: a key's never outlives `hooks.ask`.
    private func ask(_ intent: Intent, then: ((PageLink.Outcome) -> Void)? = nil) {
        let name = intent.name
        let era = self.era
        note(name + " sent")
        hooks.ask(intent) { [weak self] outcome in
            guard let self else { return }
            guard era == self.era else {
                self.note("\(name): \(outcome.word), after the store was torn down: ignored")
                return
            }
            self.outcomes[name] = outcome.word
            self.note("\(name): \(outcome.word)")
            then?(outcome)
        }
    }

    /// The page's answer to a key: CONNECT works again. One that never reached the page gives one toast; the page's
    /// refusal adds nothing (its own toast comes forwarded); a key the page took is its own to announce.
    private func keyAnswered(_ outcome: PageLink.Outcome) {
        connecting = false
        switch outcome {
        case .answered(.done), .answered(.refused):
            break
        case .answered(.failed), .documentGone, .notLinked:
            let t = ToastRequest(text: Self.notSaved, style: "err", undo: nil)
            toasts.append(t.text)
            if toasts.count > 20 { toasts.removeFirst(toasts.count - 20) }
            note("the key never reached the page: a toast")
            hooks.toast(t)
        }
    }

    // MARK: Helpers

    /// The page's word for a route ("hub", "connect", or a newer page's own).
    static func word(_ route: CoachHomeModel.Route) -> String {
        switch route {
        case .hub: return "hub"
        case .connect: return "connect"
        case .other(let r): return r
        }
    }

    private func note(_ line: String) {
        events.append(line)
        if events.count > 80 { events.removeFirst(events.count - 80) }
        Self.log.info("coachHome: \(line, privacy: .public)")
    }

    /// Whether the model draws a connect block, and so the key field: CoachHomeView draws one only where `connectKey`
    /// names it (the connect screen, or a newer page's route that carries a connect object), never on the hub, whatever
    /// its model carries.
    private var connectDrawn: Bool { model.flatMap(CoachHomeView.connectKey) != nil }

    /// The actions of the rows CoachHomeView draws: the groups' on the hub and on a newer page's route, none on the
    /// connect screen, whatever groups its model carries (`CoachHomeView.drawsGroups`).
    private var drawnRows: [String] {
        guard let model, CoachHomeView.drawsGroups(model) else { return [] }
        return model.groups.flatMap { $0.rows.map(\.action.rawValue) }
    }

    /// What the probe reports (ScreenHost's `describe()` carries it): the model's rev, boot, route, `resume`, the
    /// actions of the rows drawn, whether a connect block and its starter link are drawn, `connecting`, the key field's
    /// flag ("empty" or "typed", never its text), the last outcome per intent name, the last 20 toasts asked for and the
    /// last 40 events.
    public func describe() -> [String: Any] {
        [
            "rev": model?.rev ?? NSNull(), "boot": model?.boot ?? NSNull(),
            "route": model.map { Self.word($0.route) } ?? NSNull(), "resume": model?.resume ?? NSNull(),
            "rows": drawnRows,
            "connect": connectDrawn, "starter": connectDrawn && model?.connect?.starter != nil,
            "connecting": connecting, "keyField": keyFieldTyped ? "typed" : "empty",
            "outcomes": outcomes, "toasts": toasts, "events": Array(events.suffix(40)),
        ]
    }
}

/// The native Coach tab's root (contract 8.3, 15.2): the room's ground until the page's first model, then CoachHomeView
/// on the store's newest model, in that model's own room, with the store's host. ScreenHost hosts it once as the Coach
/// stack's root (H10) and reads `HubHeaderBottomKey` for its toast anchor: the hub's meta row publishes it, the ground
/// publishes none, so the anchor falls under the status bar until the hub draws.
///
/// The ground is the first frame's room (`room`, `paper`: what the shell read before any model, contract 6.1), drawn
/// edge to edge. The hub fades in over it in 0.2 s, at once under Reduce Motion. The root holds nothing back for the
/// hold (the shell keeps its view at alpha 0, H4), presents nothing, takes no focus and sets no
/// `overrideUserInterfaceStyle` (the shell puts the room's on the Coach stack's navigation controller): the hub draws its
/// room through the environment alone.
public struct CoachHomeRoot: View {
    @ObservedObject var store: CoachHomeStore
    let room: Room
    let paper: Bool
    /// Reduce Motion as a test sets it (nil: the system's).
    let reduceMotion: Bool?
    /// The fade's length: `fadeSeconds`, or a test's (stretched by CI's slack, so a render can land inside it on a
    /// slow machine).
    let fadeSeconds: TimeInterval
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion

    /// `room`, `paper`: the first frame's (contract 6.1), for the ground before the page's first model.
    public init(store: CoachHomeStore, room: Room, paper: Bool) {
        self.init(store: store, room: room, paper: paper, reduceMotion: nil)
    }

    init(store: CoachHomeStore, room: Room, paper: Bool, reduceMotion: Bool?,
         fadeSeconds: TimeInterval = CoachHomeRoot.fadeSeconds) {
        self.store = store
        self.room = room
        self.paper = paper
        self.reduceMotion = reduceMotion
        self.fadeSeconds = fadeSeconds
    }

    /// The ground: the room's background, from its compiled defaults (no model has come to override them).
    static func ground(room: Room, paper: Bool) -> RGBA { Tokens.defaults(for: room, paper: paper).color(.bg) }

    /// The hub's cross-fade over the ground, in seconds.
    static let fadeSeconds: TimeInterval = 0.2

    /// How the hub comes in over the ground (and goes, should its model go): a cross-fade of `seconds` (0.2 s), none
    /// under Reduce Motion.
    static func fade(reduceMotion: Bool, seconds: TimeInterval = CoachHomeRoot.fadeSeconds) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: seconds)
    }

    public var body: some View {
        ZStack {
            Color(rgba: Self.ground(room: room, paper: paper)).ignoresSafeArea()
            if let model = store.model {
                CoachHomeView(model: model, host: store.host)
                    .transition(.opacity)
            }
        }
        // only the hub's coming and going fades: a newer model of a hub already drawn changes at once
        .animation(Self.fade(reduceMotion: reduceMotion ?? systemReduceMotion, seconds: fadeSeconds), value: store.model != nil)
    }
}
#endif
