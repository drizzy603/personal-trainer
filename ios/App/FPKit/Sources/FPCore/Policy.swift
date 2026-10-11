import Foundation

// The policy file: remote switches the shell fetches (plan task S7, Swift side; decision.md section 6).
//
// `policy.json` sits beside build.txt on GitHub Pages:
//     {"v": 1, "store": {"facade": "on", "repair": "off"}, "screens": {"coach": "on"}}
// The shell fetches it at launch and on foreground, at most every 15 minutes, keeps the last good copy
// and applies it: native screens at once, the store at the next document start. A missing or bad
// file changes nothing (the last good copy stays in force; before any good copy, the defaults).
//
// Reading:
// - a good file is a JSON object with "v": 1, at most 64 KB; any other "v" is a format this build does
//   not read, so the file is bad;
// - a switch is "on" or "off" (true and false too; null or absent is the default): facade on, repair
//   off, every screen on;
// - unknown keys are ignored (additive within v1), so a newer file still reaches an older shell; a
//   known key with a value this build does not read makes the file bad, never half-applied (new values
//   belong under new keys);
// - a good file replaces the last good copy whole: a switch the file leaves out goes back to its
//   default (delete "coach": "off" to bring the native chat back).
// Policy.swift only reads and remembers; FPHost fetches (a Debug launch argument can point it at a
// local file) and applies.

/// The switches a policy file sets.
public struct Policy: Codable, Equatable, Sendable {
    public enum Switch: String, Codable, Equatable, Sendable {
        case on, off

        /// "on"/"off" or a boolean; nil for anything else.
        init?(json: JSONValue) {
            if let b = json.bool { self = b ? .on : .off; return }
            guard let s = json.string, let v = Switch(rawValue: s) else { return nil }
            self = v
        }
    }

    public static let version = 1
    /// A file larger than this is bad.
    public static let maxBytes = 64 * 1024
    /// The screens this build reads switches for.
    public static let knownScreens = ["coach"]

    /// The store's facade (shadow mirroring); off: no facade from the next document start.
    public var facade: Switch
    /// Automatic repair (rule 6 writing WebKit); build 60 is observe only and reads it for the record.
    public var repair: Switch
    /// The screens a file turned off (a screen not named, or named "on", is on: only offs are kept, so
    /// two files that mean the same compare equal).
    public var screens: [String: Switch]

    public init(facade: Switch = .on, repair: Switch = .off, screens: [String: Switch] = [:]) {
        self.facade = facade
        self.repair = repair
        self.screens = screens.filter { $0.value == .off }
    }

    public static let defaults = Policy()

    public var facadeOn: Bool { facade == .on }
    public var repairOn: Bool { repair == .on }
    public func screenOn(_ screen: String) -> Bool { screens[screen] != .off }

    public enum ParseError: Error, Equatable, CustomStringConvertible {
        case tooLarge(Int)
        case notJSON(String)
        case notAnObject
        case version(Int?)
        case badValue(String)

        public var description: String {
            switch self {
            case .tooLarge(let n): return "\(n) bytes (over \(Policy.maxBytes))"
            case .notJSON(let why): return "not JSON (\(why))"
            case .notAnObject: return "not a JSON object"
            case .version(let v): return "version \(v.map(String.init) ?? "missing") (reads \(Policy.version))"
            case .badValue(let key): return "bad value for \(key)"
            }
        }
    }

    /// Reads a policy file.
    public static func parse(_ data: Data) -> Result<Policy, ParseError> {
        guard data.count <= maxBytes else { return .failure(.tooLarge(data.count)) }
        let json: JSONValue
        do {
            json = try JSONText.parse(utf8: data)
        } catch {
            return .failure(.notJSON("\(error)"))
        }
        guard json.object != nil else { return .failure(.notAnObject) }
        guard let v = json["v"]?.int, v == version else { return .failure(.version(json["v"]?.int)) }
        var p = Policy()
        if let store = json["store"], !store.isNull {
            guard store.object != nil else { return .failure(.badValue("store")) }
            for (key, path) in [("facade", \Policy.facade), ("repair", \Policy.repair)] {
                guard let raw = store[key], !raw.isNull else { continue }
                guard let s = Switch(json: raw) else { return .failure(.badValue("store.\(key)")) }
                p[keyPath: path] = s
            }
        }
        if let screens = json["screens"], !screens.isNull {
            guard let entries = screens.object else { return .failure(.badValue("screens")) }
            for (name, raw) in entries where !raw.isNull {
                if let s = Switch(json: raw) {
                    if s == .off { p.screens[name] = .off }
                } else if knownScreens.contains(name) {
                    return .failure(.badValue("screens.\(name)"))
                }
                // a screen this build does not have, with a value it cannot read: ignored
            }
        }
        return .success(p)
    }
}

/// What the shell remembers about the policy file between fetches and launches.
public struct PolicyState: Codable, Equatable, Sendable {
    public static let refetchInterval: TimeInterval = 15 * 60

    /// The last good file, in force until a good one replaces it.
    public private(set) var lastGood: Policy?
    public private(set) var lastGoodAt: Date?
    /// The last fetch started (or ended): what the 15-minute limit counts from.
    public private(set) var lastAttemptAt: Date?
    /// The last fetch's result in words, for Settings > About.
    public private(set) var lastResult: String?

    public init() {}

    /// The switches in force.
    public var effective: Policy { lastGood ?? .defaults }

    /// Whether a fetch may start now: never fetched, 15 minutes since the last attempt, or a clock
    /// that went back.
    public func shouldFetch(at now: Date, interval: TimeInterval = PolicyState.refetchInterval) -> Bool {
        guard let last = lastAttemptAt else { return true }
        if now < last { return true }
        return now.timeIntervalSince(last) >= interval
    }

    /// A fetch starts (so a second trigger meanwhile waits its turn).
    public mutating func fetchStarted(at now: Date) {
        lastAttemptAt = now
    }

    public enum FetchResult: Equatable, Sendable {
        /// The file's bytes (HTTP 200, or a local file).
        case body(Data)
        /// HTTP 304: the copy kept is current.
        case notModified
        /// HTTP 404, or no local file.
        case missing
        /// No answer: offline, a timeout, a server error.
        case failed(String)
    }

    /// What a recorded fetch changed in the switches in force.
    public struct Change: Equatable, Sendable {
        /// Native screens follow at once.
        public var screens: [String]
        /// The store follows at the next document start.
        public var store: Bool

        public var any: Bool { store || !screens.isEmpty }
    }

    /// Records a fetch's result and says what changed.
    @discardableResult
    public mutating func record(_ result: FetchResult, at now: Date) -> Change {
        if lastAttemptAt == nil || lastAttemptAt! < now { lastAttemptAt = now }
        let before = effective
        switch result {
        case .body(let data):
            switch Policy.parse(data) {
            case .success(let p):
                lastGood = p
                lastGoodAt = now
                lastResult = p == before ? "unchanged" : "applied"
            case .failure(let e):
                lastResult = "bad file, ignored: \(e)"
            }
        case .notModified:
            lastResult = "unchanged"
        case .missing:
            lastResult = "no file, nothing changed"
        case .failed(let why):
            lastResult = "fetch failed, nothing changed: \(why)"
        }
        let after = effective
        let names = Set(before.screens.keys).union(after.screens.keys).union(Policy.knownScreens)
        let screens = names.sorted().filter { before.screenOn($0) != after.screenOn($0) }
        return Change(screens: screens, store: before.facade != after.facade || before.repair != after.repair)
    }
}
