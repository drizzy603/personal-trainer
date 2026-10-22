#if os(iOS)
import Foundation
import UIKit
import os.log
import FPCore

/// The policy file's fetch (plan task S7, the shell half; decision.md section 6, "Breakers and switches").
///
/// `policy.json` sits beside build.txt on GitHub Pages (`{"v":1, "store":{"facade","repair"}, "screens":{...}}`,
/// read by `Policy`). The shell fetches it at launch (`start()`, from the scene's connection) and whenever the app
/// comes to the foreground, at most every 15 minutes (`PolicyState.shouldFetch`, failures included), and keeps the
/// last good copy across launches (device only). A missing or bad file changes nothing. What a good file changes is
/// posted as `FPPolicy.changed`: native screens follow it at once; the store reads `effective` at every document start
/// (StoreAttach's hello), so it follows at the next one.
///
/// Where the copy lives (build 61; contract 10.6, D44; 11-shell.md H6, G20): the whole `PolicyState` (the last good
/// copy and the fetch stamps) is written atomically to `Application Support/FPShell/policy-state.json`, beside the
/// shell's `breakers.json` and `switches.json`, and read first; UserDefaults `fp.policy` keeps a copy, read only when
/// the file does not read. UserDefaults reaches its disk later, through cfprefsd, and came back stale after a kill and
/// a quick reinstall on iOS 27; 61's tab root is decided at scene connect from this copy. Every save writes both, so a
/// downgrade to 60 (which reads only `fp.policy`) still finds its copy; a file that could not be written while the device
/// was unlocked is removed, so the next launch reads the newer `fp.policy`, never the file's older state. 61's first
/// launch after 60 finds no file: it reads 60's copy there and writes the file at once.
///
/// In a Debug build `-fpPolicyFile <path>` points the fetch at a local file (a path relative to the app's home
/// folder, or absolute) and `-fpPolicyEvery <seconds>` changes the 15-minute limit, for tests/native-store.sh; the
/// tools' `-fpOffline` without a policy file fetches nothing and keeps the compiled defaults in force for the launch
/// (the app as built: a file published on Pages, or a copy an earlier launch kept, never changes what they test).
@MainActor
public final class FPPolicy {
    public static let shared = FPPolicy()

    /// Beside build.txt on GitHub Pages (the page's update channel).
    public static let remoteURL = URL(string: "https://drizzy603.github.io/personal-trainer/policy.json")!
    /// Posted on the main thread when a fetch changed the switches in force: userInfo `screens` ([String], the
    /// native screens whose switch moved) and `store` (Bool: the store follows at the next document start).
    public static let changed = Notification.Name("FPPolicyChanged")
    static let stateKey = "fp.policy"
    /// The copy's file in the shell's folder (`Application Support/FPShell`).
    static let stateFileName = "policy-state.json"
    static let log = Logger(subsystem: "app.kt.trainer", category: "policy")

    public enum Source: Equatable, Sendable {
        case remote(URL)
        /// Debug: a local file.
        case file(URL)
        /// Debug: `-fpOffline` without `-fpPolicyFile`: no fetch, the compiled defaults in force.
        case offline
    }

    public private(set) var state: PolicyState
    public private(set) var source: Source = .remote(FPPolicy.remoteURL)
    public private(set) var interval: TimeInterval = PolicyState.refetchInterval
    public private(set) var fetches = 0
    private var started = false
    private var fetching = false
    /// The `done`s of `fetchIfDue` calls waiting for the fetch under way to end.
    private var waiting: [() -> Void] = []
    private let defaults: UserDefaults
    /// The folder the copy's file lives in: `Application Support/FPShell` (tests pass their own).
    let folder: URL
    var stateFile: URL { folder.appendingPathComponent(Self.stateFileName) }
    /// Writes the copy's file: atomically (a new file renamed over the old one), protected until the first unlock (tests
    /// fail it).
    var writeData: (Data, URL) throws -> Void = { data, url in
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    /// Whether the device's protected data can be read and written now (tests set their own).
    var protectedDataAvailable: () -> Bool = { MainActor.assumeIsolated { UIApplication.shared.isProtectedDataAvailable } }
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        c.timeoutIntervalForRequest = 15
        c.timeoutIntervalForResource = 20
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    /// `folder`: where the copy's file lives, `Application Support/FPShell` when nil (tests pass their own).
    init(defaults: UserDefaults = .standard, folder: URL? = nil) {
        self.defaults = defaults
        self.folder = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FPShell", isDirectory: true)
        let (loaded, from) = Self.load(file: self.folder.appendingPathComponent(Self.stateFileName), defaults: defaults)
        state = loaded
        // the first launch after 60 (no file yet, 60's copy in UserDefaults): from now on the file holds it
        if from == .defaults { writeFile(Self.encoded(loaded)) }
    }

    /// The switches in force now.
    public var effective: Policy { source == .offline ? .defaults : state.effective }

    /// At launch: the Debug overrides, the foreground observer, and a fetch when one is due. Safe to call again.
    public func start(arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard !started else { return }
        started = true
        #if DEBUG
        if let path = Self.argument("-fpPolicyFile", in: arguments), !path.isEmpty {
            source = .file(path.hasPrefix("/") ? URL(fileURLWithPath: path)
                                               : URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(path))
        } else if arguments.contains("-fpOffline") {
            source = .offline
            Self.log.info("policy: -fpOffline, nothing fetched; the defaults are in force")
        }
        if let s = Self.argument("-fpPolicyEvery", in: arguments), let t = TimeInterval(s), t >= 0 { interval = t }
        #endif
        NotificationCenter.default.addObserver(self, selector: #selector(willEnterForeground),
                                               name: UIApplication.willEnterForegroundNotification, object: nil)
        fetchIfDue()
    }

    @objc private func willEnterForeground() {
        fetchIfDue()
    }

    /// Fetches when 15 minutes have passed since the last attempt (or `force`). A local file is read at once. `done` runs
    /// once this call's fetch has ended (after `changed`, when it changed anything), at once when none is made, or with
    /// the fetch already under way: Settings > About's "Check the switches now" answers with the status after it
    /// (ShellBridge's `status {refresh: true}`, contract 3.10).
    public func fetchIfDue(force: Bool = false, done: (() -> Void)? = nil) {
        if source == .offline { done?(); return }
        if fetching {
            if let done { waiting.append(done) }
            return
        }
        let now = Date()
        guard force || state.shouldFetch(at: now, interval: interval) else { done?(); return }
        if let done { waiting.append(done) }
        state.fetchStarted(at: now)
        save()
        fetching = true
        fetches += 1
        switch source {
        case .offline:  // returned above
            fetching = false
        case .file(let url):
            let result: PolicyState.FetchResult
            if let data = try? Data(contentsOf: url) { result = .body(data) } else { result = .missing }
            finish(result)
        case .remote(let url):
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            comps?.queryItems = [URLQueryItem(name: "_", value: String(Int64(now.timeIntervalSince1970 * 1000)))]
            var req = URLRequest(url: comps?.url ?? url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 15)
            req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            session.dataTask(with: req) { data, response, error in
                let result: PolicyState.FetchResult
                if let error {
                    result = .failed(error.localizedDescription)
                } else if let http = response as? HTTPURLResponse {
                    switch http.statusCode {
                    case 200: result = .body(data ?? Data())
                    case 304: result = .notModified
                    case 404, 410: result = .missing
                    default: result = .failed("HTTP \(http.statusCode)")
                    }
                } else {
                    result = .failed("no response")
                }
                DispatchQueue.main.async { MainActor.assumeIsolated { self.finish(result) } }
            }.resume()
        }
    }

    private func finish(_ result: PolicyState.FetchResult) {
        fetching = false
        let change = state.record(result, at: Date())
        save()
        let p = state.effective
        Self.log.info("policy: \(self.state.lastResult ?? "-", privacy: .public); facade \(p.facade.rawValue, privacy: .public), repair \(p.repair.rawValue, privacy: .public), screens off \(p.screens.keys.sorted().joined(separator: ","), privacy: .public)")
        if change.any {
            NotificationCenter.default.post(name: Self.changed, object: self,
                                            userInfo: ["screens": change.screens, "store": change.store])
        }
        let ended = waiting
        waiting = []
        for d in ended { d() }
    }

    /// The last good file as JSON (for the store's meta and Storage), nil before any.
    public var lastGoodJSON: String? {
        guard let p = state.lastGood else { return nil }
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return (try? e.encode(p)).map { String(decoding: $0, as: UTF8.self) }
    }

    /// Both copies, on every save: UserDefaults `fp.policy` (build 60 reads only this one), then the file, atomically.
    private func save() {
        guard let data = Self.encoded(state) else { return }
        defaults.set(data, forKey: Self.stateKey)
        writeFile(data)
    }

    /// The file, written atomically (a new file renamed over the old one, never a half-written one). After a failed
    /// write the UserDefaults copy holds the state, and a file already there holds an older one: while the device is
    /// unlocked (a full disk, an I/O error) it is removed, so the next launch reads the copy and writes the file from it;
    /// while protected data is unavailable it stays as it was (a write refused before the first unlock must not take a
    /// good copy away, and the UserDefaults copy cannot be read then either).
    private func writeFile(_ data: Data?) {
        guard let data else { return }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try writeData(data, stateFile)
        } catch {
            if protectedDataAvailable() {
                try? FileManager.default.removeItem(at: stateFile)
                Self.log.error("policy: \(Self.stateFileName, privacy: .public) could not be written: the older file went, UserDefaults keeps the copy")
            } else {
                Self.log.error("policy: \(Self.stateFileName, privacy: .public) could not be written while protected data is unavailable (UserDefaults keeps the copy)")
            }
        }
    }

    /// Where a launch's copy came from.
    enum CopySource: Equatable {
        case file
        case defaults
        case none
    }

    /// The file when it reads (a whole `PolicyState`), else the UserDefaults copy, else a fresh state.
    static func load(file: URL, defaults: UserDefaults) -> (state: PolicyState, from: CopySource) {
        if let data = try? Data(contentsOf: file), let s = decoded(data) { return (s, .file) }
        if let data = defaults.data(forKey: stateKey), let s = decoded(data) { return (s, .defaults) }
        return (PolicyState(), .none)
    }

    static func encoded(_ state: PolicyState) -> Data? {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        return try? e.encode(state)
    }

    static func decoded(_ data: Data) -> PolicyState? {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return try? d.decode(PolicyState.self, from: data)
    }

    static func argument(_ name: String, in args: [String]) -> String? {
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
}
#endif
