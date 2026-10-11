#if os(iOS)
import Foundation

/// Storage's "Test: quit after next save" (plan task S6; TestFlight and Debug builds only, the TrovoStore plugin decides
/// who may arm it). The owner arms it in Settings > About > Storage; the next page save of a training key that the
/// store acknowledges ends the process right after the page has its answer, inside the window in which WebKit can still
/// lose a write it took. The record of what happened is kept beside the store (`FPStore/testquit.json`) across the
/// quit, and the next launch's first document start adds what it found: in step (WebKit kept the save), or the keys
/// WebKit lost that the store kept (rule 6, which Put back can bring back).
public struct StoreTestQuit: Codable, Equatable, Sendable {
    public var armedAt: Date
    public var firedAt: Date
    /// The key whose save ended the process, and its op (`w` a set, `d` a remove).
    public var key: String
    public var op: String
    public var shell: String
    public var page: String?
    /// What the next launch's first document start found; nil until it has run.
    public var after: After?

    public struct After: Codable, Equatable, Sendable {
        public var at: Date
        /// The store's rule (0 in step, 4 to 7 as in the reconcile table), or -1 when the facade was off at that start.
        public var rule: Int
        public var label: String
        /// Rule 6: the keys WebKit lost that the store kept.
        public var wouldRepair: [String]
        /// Keys the store followed WebKit on, by reason.
        public var adopted: [String: [String]]

        public init(at: Date, rule: Int, label: String, wouldRepair: [String] = [], adopted: [String: [String]] = [:]) {
            self.at = at
            self.rule = rule
            self.label = label
            self.wouldRepair = wouldRepair
            self.adopted = adopted
        }
    }

    public init(armedAt: Date, firedAt: Date, key: String, op: String, shell: String, page: String?, after: After? = nil) {
        self.armedAt = armedAt
        self.firedAt = firedAt
        self.key = key
        self.op = op
        self.shell = shell
        self.page = page
        self.after = after
    }

    /// How long an armed test waits for a save before it disarms itself.
    public static let armSeconds: TimeInterval = 600

    /// What the arm waits for: a write (`w`) or remove (`d`) of one of `keys` (any key when empty), within
    /// `armSeconds` of arming.
    public struct Arm: Equatable, Sendable {
        public var at: Date
        public var keys: Set<String>

        public init(at: Date, keys: Set<String>) {
            self.at = at
            self.keys = keys
        }

        public func expired(at now: Date) -> Bool { now.timeIntervalSince(at) > StoreTestQuit.armSeconds }

        public func fires(op: String, key: String?, at now: Date) -> Bool {
            guard op == "w" || op == "d", let key, !expired(at: now) else { return false }
            return keys.isEmpty || keys.contains(key)
        }
    }
}

/// The record's file: written whole (a temporary file renamed over it) before the process ends, read at the next launch.
struct StoreTestQuitFile {
    let url: URL

    func read() -> StoreTestQuit? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return try? d.decode(StoreTestQuit.self, from: data)
    }

    @discardableResult
    func write(_ record: StoreTestQuit) -> Bool {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        e.outputFormatting = [.sortedKeys]
        guard let data = try? e.encode(record) else { return false }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        do {
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }
}
#endif
