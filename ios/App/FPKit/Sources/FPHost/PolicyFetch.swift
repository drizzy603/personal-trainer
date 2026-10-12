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
/// last good copy across launches (UserDefaults, device only). A missing or bad file changes nothing. What a good
/// file changes is posted as `FPPolicy.changed`: native screens follow it at once; the store reads `effective` at
/// every document start (StoreAttach's hello), so it follows at the next one.
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
    private let defaults: UserDefaults
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        c.timeoutIntervalForRequest = 15
        c.timeoutIntervalForResource = 20
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        state = Self.load(defaults)
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

    /// Fetches when 15 minutes have passed since the last attempt (or `force`). A local file is read at once.
    public func fetchIfDue(force: Bool = false) {
        if source == .offline { return }
        let now = Date()
        guard !fetching, force || state.shouldFetch(at: now, interval: interval) else { return }
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
        guard change.any else { return }
        NotificationCenter.default.post(name: Self.changed, object: self,
                                        userInfo: ["screens": change.screens, "store": change.store])
    }

    /// The last good file as JSON (for the store's meta and Storage), nil before any.
    public var lastGoodJSON: String? {
        guard let p = state.lastGood else { return nil }
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return (try? e.encode(p)).map { String(decoding: $0, as: UTF8.self) }
    }

    private func save() {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        if let data = try? e.encode(state) { defaults.set(data, forKey: Self.stateKey) }
    }

    private static func load(_ defaults: UserDefaults) -> PolicyState {
        guard let data = defaults.data(forKey: stateKey) else { return PolicyState() }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return (try? d.decode(PolicyState.self, from: data)) ?? PolicyState()
    }

    static func argument(_ name: String, in args: [String]) -> String? {
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
}
#endif
