import Foundation

// The link between the shell and one page document (plan task C4; decision.md section 6, "Breakers
// and switches").
//
// One LinkState per web view (kept, or handed the stored book again, when a scene reconnects). The host
// (FPHost, FPUI's PageLink) feeds it events and carries out the effects it returns; it does no I/O and
// reads no clock, so the tests drive it with plain dates. It holds the process's BreakerBook: every
// change to the book goes through it (`editBook` for the store breaker and crash markers), and
// `bookChanged` tells the host to store it.
//
// - A document starts (a load, a reload, a WebContent restart): the link waits for the page's hello.
//   Only time in the foreground counts toward the 15 s deadline, so a launch sent to the background
//   mid-boot never trips it. No hello in time turns every screen of this binary off for the page build
//   (a page from before the bridge never says hello; a broken one fails to).
// - The hello negotiates the version and the screens (Contract.swift). A hello later than the deadline
//   is a miss even when no tick caught it in time, and even when the page build was unknown until the
//   hello named it: the link forms with no screens.
// - Intents and models: 3 failures in a row of one kind on a live screen (an intent that timed out,
//   threw, or came back malformed or with a failure code; a model that did not decode) turn the screen
//   off for the page build. The page's own refusals (stale, busy) are answers, not failures. An answer
//   from a document that is gone, or for a screen already off, counts for nothing.
// - A new page build (named at a document start or by a hello) starts every breaker clean.
// - A screen that goes off (a trip, or the host withdrawing it for the policy file or the device switch)
//   stays off for the rest of the document: the page was told `screens.off` and shows its own until the
//   next hello negotiates again.
// - Nothing is ever resent: when a document goes, its pending intents fail and its open confirms close
//   as stale (effect `documentGone`); the new hello brings a resync.
//
// Build 61 (contract 2.2, 3.2, 4.4, 10.3):
// - The pieces depend on each other (ShellPieces): the hello applies the rule for the scene's root before
//   and after negotiating, and every way a piece goes off in a document (a trip, a withdraw, the book)
//   takes the live pieces that depend on it along, off `needs` for the rest of the document; a cascade is
//   never a trip. The `screenOff`s of one event come in the binary's order (coach, coachHome, tabs), the
//   order the page hears `screens.off` in.
// - `tabsRoot`: the root is a live tab root (the host's `adoptTabRoot()`, before the scene's first hello).
//   It falls back once per scene (`fellBackWhy`, latched: the classic rule from then on, whatever the host
//   says later), for a reason the link sees (a hello whose answer leaves `tabs` out: the page's decline, a
//   version refusal, the policy; no hello in time; a `tabs` trip; a `withdraw` of `tabs`, the policy file's
//   door) or one the host starts (`fallBack(_:pageAsked:)`: `dismiss tabs`, the device switch). Every
//   fallback's effects open with `fellBack(why)`, so the host hides the bar, shows the web view, pops the
//   chat and drops the native Coach tab before anything else; then every piece negotiated under the tab
//   root's rule goes off for the document (`coach` and `coachHome` with `needs`, `tabs` with the fallback's
//   own word unless the page knows already: it asked, or a hello's answer tells it). Later documents of the
//   scene negotiate on the classic rule. The page build's declines go in the book (a hello's, `dismiss tabs`).
// - Held timeouts (D41): a timeout of `tabs.select`, `tabs.bar` or `shell.covered` (sent on every tap and
//   every Coach entry and exit) counts for nothing at first; the link asks for a `ping` (`pingWhenIdle`).
//   The first answer after it, the ping's or any queued intent's, drops the holds uncounted (a busy page,
//   not a broken one); the ping's failure counts them and then itself, as one event (one fallback at most,
//   `fellBack` first), so a page that stopped answering still trips. A document start drops them. A ping
//   that ends with no answer at all (`pingLost`) lets the next hold ask again. Every other failure counts
//   as before.

/// What the host does after an event, in order.
public enum LinkEffect: Equatable, Sendable {
    /// The page answered hello: the native screens in `screens` may show; resync (snapshot) any that
    /// are up.
    case linked(LinkState.Link)
    /// The linked document is gone: fail its pending intents without resending them, answer its open
    /// confirms `stale`, keep a draft for the composer, wait for the next hello.
    case documentGone(boot: String)
    /// A screen is off for the rest of the document: dismiss it if it is up and, while the link is up,
    /// send `screens.off` (`reason.code`) so the page shows its own. A page that never said hello learns
    /// it from the hello reply instead.
    case screenOff(screen: String, reason: ScreenOffReason)
    /// A new page build cleared earlier trips or failure counts (for the log).
    case breakersReset(pageBuild: String)
    /// The breaker book changed: store it (`BreakerBook.encoded()`).
    case bookChanged
    /// The live tab root fell back (contract 10.3), once per scene: the rule is the classic one from now on. It comes
    /// first among its event's effects, so the host runs the fallback in one turn inside the `tabs` section before
    /// anything else: the bar hidden for the rest of the scene, the web view shown, the chat popped without animation,
    /// the native Coach tab dropped. The `screenOff`s that follow (`coach` and `coachHome` with `needs`, then `tabs`
    /// with the fallback's word unless the page knows already) find nothing native left to take down and only tell the
    /// page, in contract 10.3's order. `why`: `page`, `refused` or `policy` at a hello (nothing live yet; the hello is
    /// negotiated on the classic rule), `no-hello`, `failures`, `policy` (a `withdraw` of `tabs`), or the word the host
    /// passed to `fallBack(_:pageAsked:)`.
    case fellBack(FellBackWhy)
    /// A timeout of `tabs.select`, `tabs.bar` or `shell.covered` is held (contract 4.4, D41): send `ping` once the
    /// link is idle. Its answer, or any answer before it, drops the hold uncounted; its failure counts the holds and
    /// then itself, as one event. Asked once until a ping's outcome comes back (`intentFinished`), or the host reports
    /// that the ping ended with no answer at all (`pingLost`).
    case pingWhenIdle
}

public enum ScreenOffReason: Equatable, Sendable {
    /// The native breaker tripped (kept for the page build).
    case tripped(Trip)
    /// The host turned it off for this document (the policy file, the device switch).
    case withdrawn
    /// A piece it needs went off (contract 2.2, 4.2): the pieces, as ShellPieces names them. Never a trip, kept for
    /// the rest of the document only.
    case needs([String])
    /// `tabs` alone: its tab root fell back for a reason that is no trip of its own (contract 4.2, 10.3), and
    /// `screens.off {screen: 'tabs', why}` carries the fallback's word (`policy`, `switch`). A trip keeps `tripped`,
    /// whose words (`failures`, `no-hello`) are the fallback's too. Never `withdrawn`: every off of `tabs` under a live
    /// tab root is the fallback (10.1).
    case fellBack(FellBackWhy)

    /// What `screens.off` tells the page: "no-hello", "failures", "withdrawn", "needs", or a fallback's word for `tabs`.
    public var code: String {
        switch self {
        case .tripped(let t): return t.reason.rawValue
        case .withdrawn: return "withdrawn"
        case .needs: return "needs"
        case .fellBack(let why): return why.rawValue
        }
    }
}

/// What to do with a model push.
public enum ModelVerdict: Equatable, Sendable {
    /// Draw it.
    case apply
    /// Not newer than the model on screen (rev): drop it.
    case stale
    /// From a document that is gone: drop it.
    case otherBoot
    /// The screen is not live (no link, not negotiated, or off): drop it.
    case notLive
    /// It did not decode: drop it; it counts as a failure.
    case undecodable
}

public struct LinkState: Equatable, Sendable {
    public struct Config: Equatable, Sendable {
        /// Seconds in the foreground a document has to say hello.
        public var helloDeadline: TimeInterval
        /// Failures of one kind in a row that turn a screen off.
        public var failureLimit: Int

        public init(helloDeadline: TimeInterval = 15, failureLimit: Int = 3) {
            self.helloDeadline = helloDeadline
            self.failureLimit = failureLimit
        }
    }

    /// A linked document.
    public struct Link: Equatable, Sendable {
        /// The page's boot id, or "doc-<n>" when its hello carried none.
        public var boot: String
        /// The boot id came from the page (so a model's boot can be checked against it).
        public var bootFromPage: Bool
        /// The negotiated contract version.
        public var v: Int
        /// The page build that said hello.
        public var page: String
        /// The screens negotiated at hello (`isLive` says which are still on).
        public var screens: [String]

        public init(boot: String, bootFromPage: Bool, v: Int, page: String, screens: [String]) {
            self.boot = boot
            self.bootFromPage = bootFromPage
            self.v = v
            self.page = page
            self.screens = screens
        }
    }

    public enum Phase: Equatable, Sendable {
        /// No document yet.
        case idle
        /// A document started; its hello is awaited.
        case awaitingHello
        case linked(Link)
        /// This document drives no native screen.
        case unlinked(Unlinked)
    }

    public enum Unlinked: Equatable, Sendable {
        /// The hello's contract could not be negotiated.
        case refused(Negotiation.Refusal)
        /// No hello within the deadline.
        case noHello
    }

    public let config: Config
    public let shell: ShellContract
    public private(set) var phase: Phase = .idle
    /// The page build being served: the shell's at a document start (its OTA state), then the hello's.
    public private(set) var pageBuild: String?
    /// The breaker records: store them after `bookChanged`.
    public private(set) var book: BreakerBook
    /// Documents seen in this process (a hello from a new boot counts as one).
    public private(set) var documents = 0
    /// The scene is in the foreground.
    public private(set) var foreground: Bool
    /// The scene's root is a live tab root (contract 1.3, 2.2): false at init (a classic root) and from a fallback on.
    public private(set) var tabsRoot = false
    /// The scene's tab root fell back, and why (contract 1.3, 10.3): at most once per scene, and the classic rule from
    /// then on, whatever the host says later. Nil while it has not (or there was no tab root).
    public private(set) var fellBackWhy: FellBackWhy?

    private var foregroundSince: Date?
    private var waited: TimeInterval = 0
    private var lastRev: [String: Int] = [:]
    /// Screens off for the rest of this document (withdrawn by the host, tripped, or gone with a piece they need).
    private var offInDocument: Set<String> = []
    /// Held timeouts of this document (contract 4.4): the piece each would count for (nil: every live piece).
    private var held: [String?] = []
    /// A ping was asked for (`pingWhenIdle`) and its outcome has not come back.
    private var pingAsked = false

    /// The intents whose timeout is held (contract 4.4, D41): sent on every tap and every Coach entry and exit, and
    /// answered by the page in the task that runs them, so only a stalled page lets them time out.
    public static let heldOnTimeout: Set<String> = ["tabs.select", "tabs.bar", "shell.covered"]

    public init(shell: ShellContract, config: Config = Config(), book: BreakerBook = BreakerBook(), foreground: Bool = true) {
        self.shell = shell
        self.config = config
        self.book = book
        self.foreground = foreground
    }

    public var link: Link? {
        if case .linked(let l) = phase { return l }
        return nil
    }

    /// Whether a native screen may show now: negotiated at hello, and not off since.
    public func isLive(_ screen: String) -> Bool {
        guard let l = link else { return false }
        return l.screens.contains(screen) && !offInDocument.contains(screen) && book.trip(screen: screen, pageBuild: pageBuild) == nil
    }

    /// The negotiated screens still live.
    public var liveScreens: [String] { link?.screens.filter(isLive) ?? [] }

    /// Timeouts held in this document, waiting for an answer or the ping's failure (contract 4.4).
    public var heldTimeouts: Int { held.count }

    // MARK: The root

    /// The host adopted a tab root (contract 1.3, 2.2), before the scene's first hello: the hello negotiates on the tab
    /// root's rule. Ignored by a binary without `tabs`, while a document is linked (the rule never changes under live
    /// pieces except by a fallback), and once the scene has fallen back (a root falls back at most once per scene).
    public mutating func adoptTabRoot() {
        guard shell.screens.contains("tabs"), fellBackWhy == nil, link == nil else { return }
        tabsRoot = true
    }

    /// A fallback the host starts (contract 10.3): the page's `dismiss {screen:'tabs'}` (`.page` with `pageAsked`: the
    /// page left tabs mode itself, so it hears no `screens.off` for `tabs`, and the page build being served declines
    /// `tabs`, D32, as a hello without `tabs` does), the device switch (`.switch`) or the policy file (`.policy`, as
    /// `withdraw(["tabs"])`). Only under a live tab root, once per scene; anything else returns nothing. The effects
    /// open with `fellBack(why)`; then, for the rest of the document, every piece negotiated under the tab root's rule
    /// goes off: `coach` and `coachHome` with `needs` (coach's stack is gone, though the classic rule alone would keep
    /// the chat), then `tabs` with `why` unless the page asked. Before a link only the rule changes (and `fellBack`
    /// says so): later documents of the scene negotiate on the classic rule.
    public mutating func fallBack(_ why: FellBackWhy, pageAsked: Bool = false) -> [LinkEffect] {
        guard tabsRoot else { return [] }
        var fx = withFallBack([:], why: why, tellTabs: !pageAsked)
        if pageAsked, let p = pageBuild, book.decline(piece: "tabs", page: p) { fx.append(.bookChanged) }
        return fx
    }

    // MARK: Documents and the hello deadline

    /// A document started: a load, a reload, a WebContent restart. `pageBuild`: the build the shell
    /// serves (the staged build or the bundle's build.txt); nil only when it cannot tell, and then the
    /// last known build stands until the hello names one.
    public mutating func documentStarted(pageBuild build: String?, at now: Date) -> [LinkEffect] {
        var fx = tick(at: now)  // the document before it may have run out of time with no tick to see it
        if let l = link { fx.append(.documentGone(boot: l.boot)) }
        beginDocument(at: now)
        fx += setPageBuild(build)
        return Self.tidy(fx)
    }

    /// The scene went to the foreground or left it.
    public mutating func setForeground(_ isForeground: Bool, at now: Date) -> [LinkEffect] {
        guard isForeground != foreground else { return [] }
        var fx: [LinkEffect] = []
        if !isForeground { fx = tick(at: now) }  // a deadline that fell while in the foreground counts
        if foreground, let since = foregroundSince { waited += max(0, now.timeIntervalSince(since)) }
        foreground = isForeground
        foregroundSince = isForeground ? now : nil
        return fx
    }

    /// Foreground time this document has waited for its hello; nil when none is awaited.
    public func waitedForHello(at now: Date) -> TimeInterval? {
        guard phase == .awaitingHello else { return nil }
        var w = waited
        if foreground, let since = foregroundSince { w += max(0, now.timeIntervalSince(since)) }
        return w
    }

    /// When the deadline falls if the scene stays in the foreground (schedule a tick then); nil when no
    /// hello is awaited or the scene is in the background.
    public func helloDeadline(from now: Date) -> Date? {
        guard foreground, let w = waitedForHello(at: now) else { return nil }
        return now.addingTimeInterval(max(0, config.helloDeadline - w))
    }

    /// Checks the deadline.
    public mutating func tick(at now: Date) -> [LinkEffect] {
        guard let w = waitedForHello(at: now), w >= config.helloDeadline else { return [] }
        return missHello(at: now)
    }

    private mutating func beginDocument(at now: Date) {
        documents += 1
        phase = .awaitingHello
        waited = 0
        foregroundSince = foreground ? now : nil
        lastRev = [:]
        offInDocument = []
        held = []          // holds belong to their boot: dropped uncounted
        pingAsked = false
    }

    private mutating func missHello(at now: Date) -> [LinkEffect] {
        phase = .unlinked(.noHello)
        var offs: [String: ScreenOffReason] = [:]
        let detail = "no hello within \(Self.seconds(config.helloDeadline)) s"
        for s in shell.screens {
            offInDocument.insert(s)
            if let t = book.trip(screen: s, pageBuild: pageBuild, reason: .noHello, detail: detail, at: now) {
                offs[s] = .tripped(t)
            }
        }
        var fx = withFallBack(offs, why: .noHello, tellTabs: true)   // under a live tab root: nothing linked, nothing to tell
        if !offs.isEmpty { fx.append(.bookChanged) }
        return fx
    }

    /// A build named at a document start or by a hello: records of other builds go. Breakers reset only
    /// for records of a known build: one kept under an unknown build is this page's own (a hello late
    /// for it trips again under the build it names).
    private mutating func setPageBuild(_ build: String?) -> [LinkEffect] {
        guard let build, !build.isEmpty else { return [] }
        pageBuild = build
        let before = book
        var cleared = false
        for s in book.screens.keys.sorted() {
            let known = book.screens[s]?.pageBuild != nil
            if book.resetIfNewBuild(screen: s, pageBuild: build), known { cleared = true }
        }
        var fx: [LinkEffect] = []
        if cleared { fx.append(.breakersReset(pageBuild: build)) }
        if book != before { fx.append(.bookChanged) }
        return fx
    }

    // MARK: Hello

    /// The page's hello. `ownChecks`: `ScreenGate.base` for the hello's page build, the pieces whose own checks pass
    /// (the OS, the device switch, the policy file, crash verdicts, the breaker, declines), never `evaluate`'s answer:
    /// the link takes out those off in this document and applies the dependency rule itself, for the root as this hello
    /// leaves it, before and after negotiating (contract 3.2). So under a live tab root an answer that leaves `tabs` out
    /// falls back first (`fellBack`) and is then negotiated on the classic rule, which can bring back a piece the tab
    /// root's rule kept off (60's overlay chat at once, contract 10.3); `evaluate`'s answer would have lost it. The
    /// page build's declines are recorded in the book.
    public mutating func hello(_ h: HelloRequest, ownChecks: ScreenGate.Base, at now: Date) -> (reply: HelloReply, effects: [LinkEffect]) {
        var fx: [LinkEffect] = []
        if phase == .idle {
            fx += documentStarted(pageBuild: nil, at: now)
        } else if let l = link, l.boot != (h.boot ?? "doc-\(documents)") {
            // a new boot with no document start seen (a reload the host missed): a new document all the same
            fx.append(.documentGone(boot: l.boot))
            beginDocument(at: now)
        }
        let boot = h.boot ?? "doc-\(documents)"
        let late: Bool
        if case .unlinked(.noHello) = phase { late = true } else { late = (waitedForHello(at: now) ?? 0) >= config.helloDeadline }
        fx += setPageBuild(h.page)
        if late { fx += missHello(at: now) }   // under a live tab root that is the no-hello fallback
        let live = ownChecks.on.filter { !offInDocument.contains($0) && book.trip(screen: $0, pageBuild: pageBuild) == nil }
        let o = ShellPieces.hello(h, shell: shell, available: live, tabsRoot: tabsRoot)
        var declined = false
        if !h.page.isEmpty {
            for p in o.declined where book.decline(piece: p, page: h.page) { declined = true }
        }
        var n = o.negotiation
        if let why = o.fellBack {
            // the answer tells the page about tabs; a first hello finds nothing live, a second one of a linked document
            // takes its live pieces off for the document
            fx += withFallBack([:], why: why, tellTabs: false)
            if case .linked(let v, let screens) = n { n = .linked(v: v, screens: screens.filter { !offInDocument.contains($0) }) }
        }
        switch n {
        case .linked(let v, let screens):
            let l = Link(boot: boot, bootFromPage: h.boot != nil, v: v, page: h.page, screens: screens)
            phase = .linked(l)
            fx.append(.linked(l))
        case .refused(let r):
            phase = .unlinked(.refused(r))
        }
        if declined { fx.append(.bookChanged) }
        return (HelloReply(n), Self.tidy(fx))
    }

    // MARK: Intents and models

    /// An intent sent under `boot` finished. A piece's own intents count for that piece (`Intent.screen`: `coach.*`,
    /// `coachHome.*`, `tabs.*`); the shell's (ping, covered, confirm, toast, screens.off) for every live piece, `tabs`
    /// included. A timeout of `heldOnTimeout`'s intents is held until an answer or the ping's failure (contract 4.4).
    public mutating func intentFinished(_ intent: Intent, boot: String, outcome: IntentOutcome, at now: Date) -> [LinkEffect] {
        guard let l = link, l.boot == boot else { return [] }
        let screens = (intent.screen.map { [$0] } ?? l.screens).filter(isLive)
        let isPing = intent == .ping
        switch outcome {
        case .failed(.timeout) where Self.heldOnTimeout.contains(intent.name):
            guard !screens.isEmpty else { return [] }
            held.append(intent.screen)
            guard !pingAsked else { return [] }
            pingAsked = true
            return [.pingWhenIdle]
        case .failed(let f):
            guard isPing else { return Self.tidy(fail(screens, kind: .intent, detail: Self.describe(f), at: now)) }
            // the confirming ping failed (or a ping of the host's own): every held timeout counts, then the ping, in turn
            // (a piece an earlier count took off counts nothing more), and what they turn off goes out as one event: one
            // fallback at most, `fellBack` before every `screenOff`, the offs in the binary's order
            pingAsked = false
            let holds = held
            held = []
            let before = book
            var offs: [String: ScreenOffReason] = [:]
            for piece in holds {
                offs.merge(count(liveScreens(for: piece), kind: .intent, detail: Self.describe(.timeout), at: now)) { first, _ in first }
            }
            offs.merge(count(liveScreens(for: nil), kind: .intent, detail: Self.describe(f), at: now)) { first, _ in first }
            return Self.tidy(failed(offs, since: before))
        case .done, .refused:
            // an answer: the page is busy, not broken; the holds go uncounted
            if isPing { pingAsked = false }
            held = []
            return Self.tidy(succeed(screens, kind: .intent))
        }
    }

    /// The ping asked for (`pingWhenIdle`) ended under `boot` with no answer at all: its document went, or none was
    /// linked when it was sent (PageLink's `documentGone` or `notLinked`, which never reach `intentFinished`). Nothing
    /// counts, and the next held timeout asks again; the holds wait as before for an answer or a ping's failure. A
    /// document start does the same and more (it drops the holds); this covers a ping cut short while its document
    /// stayed (a navigation that never committed). Not asking again here keeps a host whose link went out of step from
    /// looping on pings that can never be sent.
    public mutating func pingLost(boot: String) {
        guard link?.boot == boot else { return }
        pingAsked = false
    }

    /// The live pieces an intent of `piece` counts for (nil: the shell's own, every live piece).
    private func liveScreens(for piece: String?) -> [String] {
        (piece.map { [$0] } ?? link?.screens ?? []).filter(isLive)
    }

    /// A model push. `boot` is the decoded model's boot (nil when it did not decode).
    public mutating func modelReceived(screen: String, rev: Int, boot: String?, decoded: Bool, at now: Date) -> (verdict: ModelVerdict, effects: [LinkEffect]) {
        guard let l = link else { return (.notLive, []) }
        // A model names its boot; a link whose hello named none cannot tell, and takes it.
        if let boot, !boot.isEmpty, l.bootFromPage, boot != l.boot { return (.otherBoot, []) }
        guard isLive(screen) else { return (.notLive, []) }
        guard decoded else { return (.undecodable, Self.tidy(fail([screen], kind: .model, detail: "undecodable model rev \(rev)", at: now))) }
        let effects = Self.tidy(succeed([screen], kind: .model))
        if let last = lastRev[screen], rev <= last { return (.stale, effects) }
        lastRev[screen] = rev
        return (.apply, effects)
    }

    /// The host turned screens off for this document (the policy file; a native screen that could not go up):
    /// not a fault, not kept; back on from the next document, if the gate allows it then. The live pieces
    /// that need them go too (`needs`). Every off of `tabs` under a live tab root is the fallback (contract
    /// 10.1, 10.3), whether or not a document is linked: this is the policy file's door, so its word is
    /// `policy` (`fellBack(.policy)` first, then the other pieces withdrawn, the rest of the tab root's with
    /// `needs`, and `tabs` with `policy`, never `withdrawn`); the host's other triggers call
    /// `fallBack(_:pageAsked:)` with their own words.
    public mutating func withdraw(_ screens: [String]) -> [LinkEffect] {
        let rootFalls = tabsRoot && screens.contains("tabs")
        var offs: [String: ScreenOffReason] = [:]
        for s in screens where !offInDocument.contains(s) && !(rootFalls && s == "tabs") {
            let wasLive = isLive(s)
            offInDocument.insert(s)
            if wasLive { offs[s] = .withdrawn }
        }
        if rootFalls { return withFallBack(offs, why: .policy, tellTabs: true) }
        if !offs.isEmpty { offs.merge(cascade()) { own, _ in own } }
        return ordered(offs)
    }

    /// Changes the book outside the link's own rules: the store breaker (launch, document start,
    /// bootDone), crash markers found at launch, the owner turning a piece back on in Settings > About.
    /// A trip it adds for the page build turns that live screen off at once (`screenOff`, the pieces that
    /// need it along, and for `tabs` under a live tab root the fallback, `fellBack` first); anything else
    /// waits for the next hello: a crash verdict or a decline is read by ScreenGate then, and a screen that
    /// went off stays off for the document even when its trip is cleared. (A hello's declines and
    /// `dismiss tabs`'s are recorded by `hello` and `fallBack(_:pageAsked:)`.)
    public mutating func editBook(_ edit: (inout BreakerBook) -> Void) -> [LinkEffect] {
        let before = book
        let wasLive = liveScreens
        edit(&book)
        var offs: [String: ScreenOffReason] = [:]
        var tabsTrip: Trip?
        for s in wasLive where !isLive(s) {
            offInDocument.insert(s)
            if let t = book.trip(screen: s, pageBuild: pageBuild) {
                offs[s] = .tripped(t)
                if s == "tabs" { tabsTrip = t }
            }
        }
        if !offs.isEmpty { offs.merge(cascade()) { own, _ in own } }
        var fx = withFallBack(offs, why: tabsTrip.map { $0.reason == .noHello ? .noHello : .failures }, tellTabs: true)
        if book != before { fx.append(.bookChanged) }
        return fx
    }

    /// One failure of `kind` for each of `screens`, as one event.
    private mutating func fail(_ screens: [String], kind: FailureKind, detail: String, at now: Date) -> [LinkEffect] {
        let before = book
        return failed(count(screens, kind: kind, detail: detail, at: now), since: before)
    }

    /// Counts one failure of `kind` for each of `screens`: a piece that trips goes off for the document, and the live
    /// pieces that need it go with it (`needs`), so a later count of the same event finds them off. Returns what went
    /// off; the event's effects come from `failed`, once, whatever the number of counts.
    private mutating func count(_ screens: [String], kind: FailureKind, detail: String, at now: Date) -> [String: ScreenOffReason] {
        var offs: [String: ScreenOffReason] = [:]
        for s in screens {
            if let t = book.recordFailure(screen: s, pageBuild: pageBuild, kind: kind, detail: detail, at: now, limit: config.failureLimit) {
                offInDocument.insert(s)
                offs[s] = .tripped(t)
            }
        }
        if !offs.isEmpty { offs.merge(cascade()) { own, _ in own } }
        return offs
    }

    /// The effects of one event's failures: under a live tab root a `tabs` trip falls the root back (`fellBack(.failures)`
    /// before every `screenOff`), then what went off in the binary's order; `bookChanged` when the book moved since
    /// `before`.
    private mutating func failed(_ offs: [String: ScreenOffReason], since before: BreakerBook) -> [LinkEffect] {
        var fx = withFallBack(offs, why: offs["tabs"] != nil ? .failures : nil, tellTabs: true)
        if book != before { fx.append(.bookChanged) }
        return fx
    }

    // MARK: Dependencies

    /// The live pieces the dependency rule takes off now, for the scene's root (contract 2.2): `needs`, never a trip,
    /// for the rest of the document.
    private mutating func cascade() -> [String: ScreenOffReason] {
        let live = liveScreens
        let r = ShellPieces.resolve(live, tabsRoot: tabsRoot)
        var offs: [String: ScreenOffReason] = [:]
        for s in live where !r.on.contains(s) {
            offInDocument.insert(s)
            offs[s] = .needs(r.needs[s] ?? [])
        }
        return offs
    }

    /// The root is no longer a live tab root, for good in this scene (`fellBackWhy` latched): every piece still live that
    /// was negotiated under its rule goes off for the document, `coachHome` and `coach` with what they needed under that
    /// rule (`coachHome` needs `tabs`, `coach` needs `coachHome`), never by the classic rule, which would keep the chat
    /// (contract 2.2, 10.3), and `tabs` with the fallback's word when the page has to be told (`tellTabs`).
    private mutating func rootChange(_ why: FellBackWhy, tellTabs: Bool) -> [String: ScreenOffReason] {
        tabsRoot = false
        fellBackWhy = why
        let live = liveScreens.filter(ShellPieces.all.contains)
        for s in live { offInDocument.insert(s) }
        let r = ShellPieces.resolve(live.filter { $0 != "tabs" }, tabsRoot: true)
        var offs: [String: ScreenOffReason] = [:]
        for s in live where s != "tabs" { offs[s] = .needs(r.needs[s] ?? []) }
        if tellTabs, live.contains("tabs") { offs["tabs"] = .fellBack(why) }
        return offs
    }

    /// One event's effects, with the tab root's fallback when `why` is given under a live tab root: `fellBack(why)`
    /// first (the host hides the bar, shows the web view and pops the chat before it tells the page anything), then the
    /// event's own offs and the root change's together, in the binary's order. Without a fallback, the event's offs.
    private mutating func withFallBack(_ own: [String: ScreenOffReason], why: FellBackWhy?, tellTabs: Bool) -> [LinkEffect] {
        guard let why, tabsRoot else { return ordered(own) }
        var offs = own
        offs.merge(rootChange(why, tellTabs: tellTabs)) { own, _ in own }
        return [.fellBack(why)] + ordered(offs)
    }

    /// One event's `screenOff`s in the binary's order (the order the page hears `screens.off` in).
    private func ordered(_ offs: [String: ScreenOffReason]) -> [LinkEffect] {
        func rank(_ s: String) -> Int { shell.screens.firstIndex(of: s) ?? shell.screens.count }
        return offs.keys.sorted { (rank($0), $0) < (rank($1), $1) }.map { .screenOff(screen: $0, reason: offs[$0]!) }
    }

    private mutating func succeed(_ screens: [String], kind: FailureKind) -> [LinkEffect] {
        var changed = false
        for s in screens where book.recordSuccess(screen: s, pageBuild: pageBuild, kind: kind) { changed = true }
        return changed ? [.bookChanged] : []
    }

    /// One `bookChanged`, last.
    private static func tidy(_ fx: [LinkEffect]) -> [LinkEffect] {
        let rest = fx.filter { $0 != .bookChanged }
        return rest.count == fx.count ? fx : rest + [.bookChanged]
    }

    static func describe(_ f: IntentFailure) -> String {
        switch f {
        case .timeout: return "timeout"
        case .javascript(let m): return "script error: " + String(m.prefix(60))
        case .malformedReply(let m): return "bad answer: " + String(m.prefix(40))
        case .page(let code): return "page " + code
        }
    }

    /// 15 -> "15", 0.5 -> "0.5".
    private static func seconds(_ t: TimeInterval) -> String {
        t == t.rounded() && abs(t) < 1e9 ? String(Int(t)) : String(t)
    }
}
