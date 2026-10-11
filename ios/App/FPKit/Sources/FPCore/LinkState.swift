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
}

public enum ScreenOffReason: Equatable, Sendable {
    /// The native breaker tripped (kept for the page build).
    case tripped(Trip)
    /// The host turned it off for this document (the policy file, the device switch).
    case withdrawn

    /// What `screens.off` tells the page: "no-hello", "failures" or "withdrawn".
    public var code: String {
        switch self {
        case .tripped(let t): return t.reason.rawValue
        case .withdrawn: return "withdrawn"
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

    private var foregroundSince: Date?
    private var waited: TimeInterval = 0
    private var lastRev: [String: Int] = [:]
    /// Screens off for the rest of this document (withdrawn by the host, or tripped).
    private var offInDocument: Set<String> = []

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
    }

    private mutating func missHello(at now: Date) -> [LinkEffect] {
        phase = .unlinked(.noHello)
        var fx: [LinkEffect] = []
        let detail = "no hello within \(Self.seconds(config.helloDeadline)) s"
        for s in shell.screens {
            offInDocument.insert(s)
            if let t = book.trip(screen: s, pageBuild: pageBuild, reason: .noHello, detail: detail, at: now) {
                fx.append(.screenOff(screen: s, reason: .tripped(t)))
            }
        }
        if !fx.isEmpty { fx.append(.bookChanged) }
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

    /// The page's hello. `available`: ScreenGate's `on` for the hello's page build (the device switch,
    /// the policy file and crash markers applied).
    public mutating func hello(_ h: HelloRequest, available: [String], at now: Date) -> (reply: HelloReply, effects: [LinkEffect]) {
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
        if late { fx += missHello(at: now) }
        let live = available.filter { !offInDocument.contains($0) && book.trip(screen: $0, pageBuild: pageBuild) == nil }
        let n = Negotiation.negotiate(h, shell: shell, available: live)
        switch n {
        case .linked(let v, let screens):
            let l = Link(boot: boot, bootFromPage: h.boot != nil, v: v, page: h.page, screens: screens)
            phase = .linked(l)
            fx.append(.linked(l))
        case .refused(let r):
            phase = .unlinked(.refused(r))
        }
        return (HelloReply(n), Self.tidy(fx))
    }

    // MARK: Intents and models

    /// An intent sent under `boot` finished. A screen's own intents count for that screen; the shell's
    /// (ping, covered, confirm, toast, screens.off) for every live screen.
    public mutating func intentFinished(_ intent: Intent, boot: String, outcome: IntentOutcome, at now: Date) -> [LinkEffect] {
        guard let l = link, l.boot == boot else { return [] }
        let screens = (intent.screen.map { [$0] } ?? l.screens).filter(isLive)
        if case .failed(let f) = outcome { return Self.tidy(fail(screens, kind: .intent, detail: Self.describe(f), at: now)) }
        return Self.tidy(succeed(screens, kind: .intent))
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

    /// The host turned screens off for this document (the policy file, the device switch): not a fault,
    /// not kept; back on from the next document, if the gate allows it then.
    public mutating func withdraw(_ screens: [String]) -> [LinkEffect] {
        var fx: [LinkEffect] = []
        for s in screens where !offInDocument.contains(s) {
            let wasLive = isLive(s)
            offInDocument.insert(s)
            if wasLive { fx.append(.screenOff(screen: s, reason: .withdrawn)) }
        }
        return fx
    }

    /// Changes the book outside the link's own rules: the store breaker (launch, document start,
    /// bootDone), crash markers found at launch, the owner turning a piece back on in Settings > About.
    /// It changes nothing in the current document: a screen that went off stays off, and a verdict
    /// against a live screen takes effect at the next hello.
    public mutating func editBook(_ edit: (inout BreakerBook) -> Void) -> [LinkEffect] {
        let before = book
        edit(&book)
        return book == before ? [] : [.bookChanged]
    }

    private mutating func fail(_ screens: [String], kind: FailureKind, detail: String, at now: Date) -> [LinkEffect] {
        var fx: [LinkEffect] = []
        let before = book
        for s in screens {
            if let t = book.recordFailure(screen: s, pageBuild: pageBuild, kind: kind, detail: detail, at: now, limit: config.failureLimit) {
                offInDocument.insert(s)
                fx.append(.screenOff(screen: s, reason: .tripped(t)))
            }
        }
        if book != before { fx.append(.bookChanged) }
        return fx
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
