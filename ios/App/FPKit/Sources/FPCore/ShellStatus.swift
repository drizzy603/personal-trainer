import Foundation

// What Settings > About shows of the native screens (decision.md section 6, "Settings > About says why"; section 11.9,
// "every shell assertion the owner cannot see in os_log has a counter in Settings > About").
//
// - `ScreenStatus` is the answer to the page's TrovoShell `status`: every native screen this binary has, whether the
//   next document may show it (ScreenGate for the page build being served), whether this document shows it now, why it
//   is off (the device switch, the policy file, a crash verdict for this shell and page build, the native breaker for
//   this page build) and whether the owner can try it again (a verdict or a trip to clear), with the shell's counters.
// - `ShellCounters` are the counters the host keeps across launches: the web view leaving its window while the app is
//   active, the page going hidden while a native screen covers it and the app is in use (neither ever happens by
//   design), breaker trips and crash markers. The host adds this launch's own counts.

/// The shell's counters, totals kept across launches (the host stores them, `encoded()`), each with its last time.
public struct ShellCounters: Codable, Equatable, Sendable {
    public struct Count: Codable, Equatable, Sendable {
        public var total: Int = 0
        public var last: Date?

        public init(total: Int = 0, last: Date? = nil) {
            self.total = total
            self.last = last
        }

        /// Tolerant, like the breaker book.
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            total = max(0, (try? c.decodeIfPresent(Int.self, forKey: .total)) ?? 0)
            last = (try? c.decodeIfPresent(Date.self, forKey: .last)) ?? nil
        }

        public mutating func add(at now: Date) {
            total += 1
            last = now
        }
    }

    /// The web view left its window while the app was active (FPUI's ShellWebView): a native screen goes over the page,
    /// never in its place, so this stays 0.
    public var leftWindow = Count()
    /// The page went hidden (visibilitychange) while a native screen covered it and the app was in use: stays 0.
    public var hidden = Count()
    /// The native breaker turned a screen off for a page build (no hello in time, or 3 failures in a row).
    public var trips = Count()
    /// Crash markers found at launch that turned a screen off for their (shell, page) pair.
    public var markers = Count()
    /// When the host started keeping these totals.
    public var since: Date?

    public init(since: Date? = nil) {
        self.since = since
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        leftWindow = (try? c.decodeIfPresent(Count.self, forKey: .leftWindow)) ?? Count()
        hidden = (try? c.decodeIfPresent(Count.self, forKey: .hidden)) ?? Count()
        trips = (try? c.decodeIfPresent(Count.self, forKey: .trips)) ?? Count()
        markers = (try? c.decodeIfPresent(Count.self, forKey: .markers)) ?? Count()
        since = (try? c.decodeIfPresent(Date.self, forKey: .since)) ?? nil
    }

    public func encoded() -> Data {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        e.outputFormatting = [.sortedKeys]
        return (try? e.encode(self)) ?? Data("{}".utf8)
    }

    /// Stored counters; fresh ones for nothing or for bytes that do not read.
    public static func decoded(_ data: Data?) -> ShellCounters {
        guard let data else { return ShellCounters() }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return (try? d.decode(ShellCounters.self, from: data)) ?? ShellCounters()
    }
}

/// This launch's own counts (the host keeps them in memory), beside the totals.
public struct LaunchCounts: Equatable, Sendable {
    public var leftWindow = 0
    public var hidden = 0
    public var trips = 0
    /// The crash markers this launch found (their lines), whether or not they gave a verdict.
    public var markersFound: [String] = []
    /// Of them, those that gave a verdict.
    public var markers = 0

    public init(leftWindow: Int = 0, hidden: Int = 0, trips: Int = 0, markersFound: [String] = [], markers: Int = 0) {
        self.leftWindow = leftWindow
        self.hidden = hidden
        self.trips = trips
        self.markersFound = markersFound
        self.markers = markers
    }
}

/// Settings > About's view of the native screens, the answer to TrovoShell `status` (and `reset`).
public enum ScreenStatus {
    /// - `binary`: this binary's screens; `gate`: ScreenGate for the page build being served; `live`: the screens this
    ///   document shows now (the link's); `book`: the breaker book (every crash verdict a screen holds is listed).
    public static func json(shell: String, page: String?, binary: [String], gate: (on: [String], off: [String: ScreenGate.Off]),
                            live: [String], book: BreakerBook, counters: ShellCounters, launch: LaunchCounts) -> JSONValue {
        var screens: [String: JSONValue] = [:]
        for s in binary {
            var o: [String: JSONValue] = ["on": .bool(gate.on.contains(s)), "live": .bool(live.contains(s)), "off": .null, "trip": .null,
                                          "why": .null, "at": .null, "canReset": false]
            switch gate.off[s] {
            case .deviceSwitch?:
                o["off"] = "device"
            case .policy?:
                o["off"] = "policy"
            case .crashMarker(let d)?:
                o["off"] = "crash"
                o["why"] = .string(d.why)
                o["at"] = ms(d.at)
                o["canReset"] = true
            case .breaker(let t)?:
                o["off"] = "breaker"
                o["trip"] = .string(t.reason.rawValue)
                o["why"] = .string(t.detail)
                o["at"] = ms(t.at)
                o["canReset"] = true
            case nil:
                break
            }
            screens[s] = .object(o)
        }
        let verdicts: [JSONValue] = book.disabled.filter { binary.contains($0.piece) }.map {
            ["piece": .string($0.piece), "shell": .string($0.shell), "page": .string($0.page), "why": .string($0.why), "at": ms($0.at)]
        }
        func count(_ c: ShellCounters.Count, _ launch: Int) -> JSONValue {
            ["launch": .number(Double(launch)), "total": .number(Double(c.total)), "last": c.last.map(ms) ?? .null]
        }
        var markers = count(counters.markers, launch.markers).object ?? [:]
        markers["found"] = .array(launch.markersFound.map(JSONValue.string))
        return [
            "v": 1, "shell": .string(shell), "page": page.map(JSONValue.string) ?? .null, "screens": .object(screens),
            "verdicts": .array(verdicts),
            "counters": [
                "since": counters.since.map(ms) ?? .null,
                "leftWindow": count(counters.leftWindow, launch.leftWindow),
                "hidden": count(counters.hidden, launch.hidden),
                "trips": count(counters.trips, launch.trips),
                "markers": .object(markers),
            ],
        ]
    }

    private static func ms(_ d: Date) -> JSONValue { .number((d.timeIntervalSince1970 * 1000).rounded()) }
}
