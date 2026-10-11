import Foundation

// Breakers and crash markers: how a native piece turns itself off (plan task C4; decision.md
// section 6, "Breakers and switches").
//
// - Native breaker, per screen and page build: no `hello` within 15 s of foreground time, or 3
//   failures in a row of one kind (intents into the page, or models from it that do not decode), turns
//   the screen off for that page build. Each kind keeps its own run, so a bridge broken one way is
//   caught even while the other way works. A new page build starts clean. LinkState.swift runs it; the
//   record lives here, in BreakerBook, which the host keeps (UserDefaults) so a trip holds across
//   launches.
// - Crash markers: before presenting a native screen the shell writes `presenting <screen>@<page
//   build> shell <shell build>`; before each synchronous store answer it sets a byte in an open
//   marker file and clears it after. A marker found at launch means the process died with that piece
//   mid-way: the piece is off for that (shell build, page build) pair, and Settings > About says why.
//   The screen marker is removed when the screen goes and whenever the scene leaves the foreground
//   (written again on return while the screen is up), so a background kill or a force quit from the
//   app switcher is never read as a crash; only a death on screen leaves one.
// - Store breaker: armed at each document start while the facade is attached, disarmed by `bootDone`.
//   A launch that finds it armed (a document never finished booting) runs without the facade, once
//   (harmless in shadow: the next facade launch reconciles what WebKit took meanwhile).

/// Why a native screen went off for a page build.
public enum TripReason: String, Codable, Equatable, Sendable {
    /// No hello within the deadline.
    case noHello = "no-hello"
    /// Failed intents (or undecodable models) in a row.
    case failures
}

public struct Trip: Codable, Equatable, Sendable {
    public var reason: TripReason
    public var at: Date
    /// For Settings > About: "no hello in 15 s", "3 in a row: timeout, timeout, page exception".
    public var detail: String

    public init(reason: TripReason, at: Date, detail: String) {
        self.reason = reason
        self.at = at
        self.detail = detail
    }
}

/// What failed. Each kind counts its own run: a success of one kind restarts only its own count, so
/// sends that keep failing trip the screen even while models still arrive, and the other way round.
public enum FailureKind: String, Codable, Equatable, Sendable {
    /// An intent (Swift to page): a timeout, a script error, a malformed answer, a failure code.
    case intent
    /// A model push (page to Swift) that did not decode.
    case model
}

/// One screen's breaker for one page build.
public struct ScreenBreaker: Codable, Equatable, Sendable {
    /// The page build the counts and the trip belong to.
    public var pageBuild: String?
    /// Failed intents in a row (an intent that works resets it).
    public var failures: Int = 0
    /// The failed intents behind the count, newest last (at most the limit).
    public var recent: [String] = []
    /// Undecodable models in a row (a model that decodes resets it).
    public var modelFailures: Int = 0
    /// The models behind that count, newest last (at most the limit).
    public var recentModels: [String] = []
    public var trip: Trip?

    public init(pageBuild: String?) {
        self.pageBuild = pageBuild
    }

    /// Tolerant: a field missing or unreadable (a record from another build) takes its default.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pageBuild = (try? c.decodeIfPresent(String.self, forKey: .pageBuild)) ?? nil
        failures = (try? c.decodeIfPresent(Int.self, forKey: .failures)) ?? 0
        recent = (try? c.decodeIfPresent([String].self, forKey: .recent)) ?? []
        modelFailures = (try? c.decodeIfPresent(Int.self, forKey: .modelFailures)) ?? 0
        recentModels = (try? c.decodeIfPresent([String].self, forKey: .recentModels)) ?? []
        trip = (try? c.decodeIfPresent(Trip.self, forKey: .trip)) ?? nil
    }

    /// Whether anything would be lost by starting clean: a count of either kind, or a trip.
    public var isDirty: Bool { failures > 0 || modelFailures > 0 || trip != nil }
}

/// A piece turned off by a crash marker, for one (shell build, page build) pair.
public struct DisabledPair: Codable, Equatable, Sendable {
    /// "coach", "store".
    public var piece: String
    public var shell: String
    public var page: String
    /// For Settings > About.
    public var why: String
    public var at: Date

    public init(piece: String, shell: String, page: String, why: String, at: Date) {
        self.piece = piece
        self.shell = shell
        self.page = page
        self.why = why
        self.at = at
    }
}

/// What a marker says was in progress.
public struct CrashMarker: Equatable, Hashable, Sendable {
    public enum Piece: Equatable, Hashable, Sendable {
        case screen(String)
        case store

        /// "coach", "store".
        public var name: String {
            switch self {
            case .screen(let s): return s
            case .store: return "store"
            }
        }
    }

    public var piece: Piece
    public var pageBuild: String
    public var shellBuild: String

    public init(piece: Piece, pageBuild: String, shellBuild: String) {
        self.piece = piece
        self.pageBuild = pageBuild
        self.shellBuild = shellBuild
    }

    /// "presenting coach@20261012-1 shell 60", "store@20261012-1 shell 60".
    public var line: String {
        switch piece {
        case .screen(let s): return "presenting \(s)@\(pageBuild) shell \(shellBuild)"
        case .store: return "store@\(pageBuild) shell \(shellBuild)"
        }
    }

    /// Reads a marker line. Without " shell <build>" (the plan's short form) the marker is taken to be
    /// this binary's: `defaultShell`, when given.
    public init?(line raw: String, defaultShell: String? = nil) {
        let words = raw.split(whereSeparator: \.isWhitespace).map(String.init)
        guard !words.isEmpty else { return nil }
        var rest = words[...]
        var shell = defaultShell
        if rest.count >= 2, rest[rest.endIndex - 2] == "shell" {
            shell = rest.last
            rest = rest.dropLast(2)
        }
        guard let markerShell = shell, !markerShell.isEmpty else { return nil }
        let target: String
        let isScreen: Bool
        if rest.count == 2, rest.first == "presenting" {
            target = rest.last!
            isScreen = true
        } else if rest.count == 1 {
            target = rest.first!
            isScreen = false
        } else {
            return nil
        }
        guard let at = target.firstIndex(of: "@") else { return nil }
        let name = String(target[..<at]), page = String(target[target.index(after: at)...])
        guard !name.isEmpty, !page.isEmpty else { return nil }
        if isScreen {
            piece = .screen(name)
        } else {
            guard name == "store" else { return nil }
            piece = .store
        }
        pageBuild = page
        self.shellBuild = markerShell
    }
}

/// The store's marker file: the marker line, a newline, then one state byte at a fixed offset:
/// "1" while a synchronous store answer is being made, "0" after (one `pwrite` each way, so it
/// survives a process kill).
public enum StoreOpMarker {
    public static let inFlight: UInt8 = 0x31
    public static let idle: UInt8 = 0x30

    public static func header(shell: String, page: String) -> Data {
        Data((CrashMarker(piece: .store, pageBuild: page, shellBuild: shell).line + "\n").utf8)
    }

    /// Where the state byte sits.
    public static func stateOffset(shell: String, page: String) -> Int {
        header(shell: shell, page: page).count
    }

    public static func file(shell: String, page: String, inFlight busy: Bool) -> Data {
        header(shell: shell, page: page) + Data([busy ? inFlight : idle])
    }

    /// The marker and whether an answer was in flight; nil for anything else.
    public static func read(_ data: Data) -> (marker: CrashMarker, inFlight: Bool)? {
        guard let nl = data.firstIndex(of: 0x0A), nl + 1 < data.endIndex else { return nil }
        let line = String(decoding: data[data.startIndex ..< nl], as: UTF8.self)
        guard let marker = CrashMarker(line: line), marker.piece == .store else { return nil }
        let state = data[nl + 1]
        guard state == inFlight || state == idle else { return nil }
        return (marker, state == inFlight)
    }
}

/// The store breaker: armed per document start, disarmed by bootDone.
public struct StoreBreaker: Codable, Equatable, Sendable {
    public struct Arm: Codable, Equatable, Sendable {
        public var page: String?
        public var at: Date
    }

    public var armed: Arm?
    /// Launches that ran without the facade because a document never finished booting.
    public var trips: Int = 0
    public var lastTrip: Date?
    /// This launch runs without the facade because of a trip.
    public var skipping: Bool = false

    public init() {}

    /// Tolerant, like the rest of the book.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        armed = (try? c.decodeIfPresent(Arm.self, forKey: .armed)) ?? nil
        trips = (try? c.decodeIfPresent(Int.self, forKey: .trips)) ?? 0
        lastTrip = (try? c.decodeIfPresent(Date.self, forKey: .lastTrip)) ?? nil
        skipping = (try? c.decodeIfPresent(Bool.self, forKey: .skipping)) ?? false
    }

    /// At process launch, before anything attaches: false means this launch runs without the facade,
    /// because the last document armed the breaker and never sent bootDone.
    public mutating func launch(at now: Date) -> Bool {
        if armed != nil {
            armed = nil
            trips += 1
            lastTrip = now
            skipping = true
            return false
        }
        skipping = false
        return true
    }

    /// A document started with the facade attached.
    public mutating func documentStart(pageBuild: String?, at now: Date) {
        guard !skipping else { return }
        armed = Arm(page: pageBuild, at: now)
    }

    /// The page finished booting.
    public mutating func bootDone() {
        armed = nil
    }
}

/// Every breaker record the host keeps between launches.
public struct BreakerBook: Codable, Equatable, Sendable {
    /// The native breaker, by screen.
    public var screens: [String: ScreenBreaker] = [:]
    /// Pieces turned off by crash markers, newest last.
    public var disabled: [DisabledPair] = []
    public var store = StoreBreaker()

    /// Crash verdicts kept for About (older ones belong to builds long gone).
    public static let keepDisabled = 20

    public init() {}

    /// Tolerant: the host stores the book as JSON (UserDefaults); a field another build wrote
    /// differently, or not at all, starts at its default instead of losing the whole book.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        screens = (try? c.decodeIfPresent([String: ScreenBreaker].self, forKey: .screens)) ?? [:]
        disabled = (try? c.decodeIfPresent([DisabledPair].self, forKey: .disabled)) ?? []
        store = (try? c.decodeIfPresent(StoreBreaker.self, forKey: .store)) ?? StoreBreaker()
    }

    /// The book as the host stores it.
    public func encoded() -> Data {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        e.outputFormatting = [.sortedKeys]
        return (try? e.encode(self)) ?? Data("{}".utf8)
    }

    /// A stored book; a fresh one for nothing or for bytes that do not read.
    public static func decoded(_ data: Data?) -> BreakerBook {
        guard let data else { return BreakerBook() }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return (try? d.decode(BreakerBook.self, from: data)) ?? BreakerBook()
    }

    // MARK: Native breaker

    /// The screen's trip for this page build, if it tripped.
    public func trip(screen: String, pageBuild: String?) -> Trip? {
        guard let b = screens[screen], b.pageBuild == pageBuild else { return nil }
        return b.trip
    }

    /// Starts the screen clean when its record belongs to another page build. True when that cleared
    /// a trip or a count.
    @discardableResult
    public mutating func resetIfNewBuild(screen: String, pageBuild: String?) -> Bool {
        guard let b = screens[screen], b.pageBuild != pageBuild else { return false }
        screens[screen] = nil
        return b.isDirty
    }

    /// The screen's record for this page build (a fresh one when it has none for it).
    private func breaker(_ screen: String, _ pageBuild: String?) -> ScreenBreaker {
        if let b = screens[screen], b.pageBuild == pageBuild { return b }
        return ScreenBreaker(pageBuild: pageBuild)
    }

    /// A failure on the screen: the trip when this one brings its kind's run to the limit (nil
    /// otherwise, and nil when it had tripped already).
    public mutating func recordFailure(screen: String, pageBuild: String?, kind: FailureKind = .intent, detail: String,
                                       at now: Date, limit: Int) -> Trip? {
        var b = breaker(screen, pageBuild)
        guard b.trip == nil else { return nil }
        let keep = max(limit, 1)
        let run: [String]
        switch kind {
        case .intent:
            b.failures += 1
            b.recent = Array((b.recent + [detail]).suffix(keep))
            run = b.recent
        case .model:
            b.modelFailures += 1
            b.recentModels = Array((b.recentModels + [detail]).suffix(keep))
            run = b.recentModels
        }
        let count = kind == .intent ? b.failures : b.modelFailures
        var tripped: Trip?
        if count >= limit {
            tripped = Trip(reason: .failures, at: now, detail: "\(count) in a row: " + run.joined(separator: ", "))
            b.trip = tripped
        }
        screens[screen] = b
        return tripped
    }

    /// A success of this kind on the screen: that kind's count starts again (the other kind's and a
    /// trip stay). True if there was a count.
    @discardableResult
    public mutating func recordSuccess(screen: String, pageBuild: String?, kind: FailureKind = .intent) -> Bool {
        guard var b = screens[screen], b.pageBuild == pageBuild else { return false }
        switch kind {
        case .intent:
            guard b.failures > 0 else { return false }
            b.failures = 0
            b.recent = []
        case .model:
            guard b.modelFailures > 0 else { return false }
            b.modelFailures = 0
            b.recentModels = []
        }
        screens[screen] = b
        return true
    }

    /// Trips the screen for the page build (no hello). Nil when it had tripped already.
    public mutating func trip(screen: String, pageBuild: String?, reason: TripReason, detail: String, at now: Date) -> Trip? {
        var b = breaker(screen, pageBuild)
        guard b.trip == nil else { return nil }
        let t = Trip(reason: reason, at: now, detail: detail)
        b.trip = t
        screens[screen] = b
        return t
    }

    // MARK: Crash markers

    /// At launch, every marker found: each turns its piece off for its pair. Returns the new verdicts.
    @discardableResult
    public mutating func recordStaleMarkers(_ markers: [CrashMarker], at now: Date) -> [DisabledPair] {
        var added: [DisabledPair] = []
        for m in markers {
            let what: String
            switch m.piece {
            case .screen(let s): what = "the app closed while the native \(s) screen was up"
            case .store: what = "the app closed during a native copy save"
            }
            let pair = DisabledPair(piece: m.piece.name, shell: m.shellBuild, page: m.pageBuild, why: "crash marker: \(what)", at: now)
            disabled.removeAll { $0.piece == pair.piece && $0.shell == pair.shell && $0.page == pair.page }
            disabled.append(pair)
            added.append(pair)
        }
        if disabled.count > Self.keepDisabled { disabled.removeFirst(disabled.count - Self.keepDisabled) }
        return added
    }

    /// The verdict that turns this piece off for this pair, if any.
    public func disabled(piece: String, shell: String, page: String?) -> DisabledPair? {
        guard let page else { return nil }
        return disabled.last { $0.piece == piece && $0.shell == shell && $0.page == page }
    }

    /// The owner turns the piece back on (Settings > About): its verdicts go.
    public mutating func clearDisabled(piece: String) {
        disabled.removeAll { $0.piece == piece }
    }
}
