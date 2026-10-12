import Foundation

// Shell contract v1 and its negotiation (plan task C4; decision.md section 6, "Shell contract v1").
//
// - The shell injects `window.__FP_SHELL = {v:1, min:1, shell:'60', screens:['coach'], dev:{nav, theme}}`
//   at document start. `screens` is this binary's screens less those the device switch, the policy
//   file, a stale crash marker or the native breaker turned off for the page build being served
//   (ScreenGate). Later builds only add keys (`tabs` in 61, `features: ['stream']` in 62).
// - The page answers with the TrovoShell plugin: `hello {v, page, screens, boot?}` gets the
//   negotiated `{v, screens, up?}` (`up`: a native screen still showing from the document before, which
//   the page takes over); then `bootDone`, `present`/`dismiss`, `model`, `toast`, `confirm` and `log`
//   (PageMessage). Plugin calls arrive off main; the plugin hops to main.
// - Native behaviour comes from this flag and the plugin's presence, never from build stamps: an
//   older binary serves a newer staged page.
// - Within a version, only additions; the page speaks every contract an installable shell speaks.

/// What this binary speaks.
public struct ShellContract: Equatable, Sendable {
    /// The newest contract version this binary speaks.
    public var v: Int
    /// The oldest it still speaks.
    public var min: Int
    /// This binary's build number (CFBundleVersion), "60".
    public var shell: String
    /// The native screens compiled into this binary.
    public var screens: [String]

    public init(v: Int = ShellContract.current, min: Int = 1, shell: String, screens: [String] = ShellContract.binaryScreens) {
        self.v = v
        self.min = min
        self.shell = shell
        self.screens = screens
    }

    /// Contract v1.
    public static let current = 1
    /// Build 60's native screens.
    public static let binaryScreens = ["coach"]
}

/// `window.__FP_SHELL`, injected at document start.
public struct ShellFlag: Equatable, Sendable {
    public var v: Int
    public var min: Int
    public var shell: String
    /// The screens the page may hand to Swift this document (ScreenGate's `on`).
    public var screens: [String]
    /// The native screens this binary has, on or off (`binary`, additive within v1): Settings > About keeps the row of
    /// every screen the binary offers and says why one is off (a crash verdict, the native breaker, the policy file),
    /// where a row shown only for a negotiated screen vanished exactly when it had something to say.
    public var binary: [String]
    /// Test tooling from launch arguments (-devNav, -devTheme, -fpApiBase); nil keys are left out.
    public var devNav: String?
    public var devTheme: String?
    /// `dev.api`: where the page sends its coach calls in a test launch (a stand-in for the Messages API on this device's
    /// loopback; the page takes nothing else).
    public var devAPI: String?

    public init(contract: ShellContract, screens: [String], devNav: String? = nil, devTheme: String? = nil, devAPI: String? = nil) {
        v = contract.v
        min = contract.min
        shell = contract.shell
        self.screens = screens
        binary = contract.screens
        self.devNav = devNav
        self.devTheme = devTheme
        self.devAPI = devAPI
    }

    public var json: JSONValue {
        var o: [String: JSONValue] = [
            "v": .number(Double(v)), "min": .number(Double(min)), "shell": .string(shell),
            "screens": .array(screens.map(JSONValue.string)), "binary": .array(binary.map(JSONValue.string)),
        ]
        var dev: [String: JSONValue] = [:]
        if let devNav { dev["nav"] = .string(devNav) }
        if let devTheme { dev["theme"] = .string(devTheme) }
        if let devAPI { dev["api"] = .string(devAPI) }
        if !dev.isEmpty { o["dev"] = .object(dev) }
        return .object(o)
    }

    /// The user script's source: `window.__FP_SHELL = {...};`. JSON with U+2028/U+2029 escaped, so it is
    /// a valid script whatever a dev argument holds.
    public var script: String {
        let text = json.jsonText
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "window.__FP_SHELL = \(text);"
    }
}

/// The page's `hello`.
public struct HelloRequest: Equatable, Sendable {
    /// The newest contract the page speaks (it speaks every older one an installable shell speaks).
    public var v: Int
    /// The page's build stamp (`<meta build>`), "20261012-1".
    public var page: String
    /// The screens the page can hand to Swift.
    public var screens: [String]
    /// The page's boot id, when it sends one (one per document).
    public var boot: String?

    public init(v: Int, page: String, screens: [String], boot: String? = nil) {
        self.v = v
        self.page = page
        self.screens = screens
        self.boot = boot
    }

    public init(json: JSONValue) {
        v = json["v"]?.int ?? 0
        page = json["page"]?.string ?? ""
        screens = (json["screens"]?.array ?? []).compactMap(\.string)
        boot = json["boot"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// The shell's answer to `hello`.
public struct HelloReply: Equatable, Sendable {
    /// The negotiated version; 0 when refused.
    public var v: Int
    /// The screens the page may present this document.
    public var screens: [String]
    /// The screens the shell shows now from an earlier document of this web view (the page reloaded under a native
    /// screen: WebContent died, a Put back reload): the page takes each over where it can show it (the screen is up,
    /// with no present; its models follow from this boot) and dismisses the others. Always among `screens`; left out
    /// of the JSON when none (plan task C5, additive within v1).
    public var up: [String]
    /// Why the shell refused (refused replies only).
    public var why: String?

    public var json: JSONValue {
        var o: [String: JSONValue] = ["v": .number(Double(v)), "screens": .array(screens.map(JSONValue.string))]
        if !up.isEmpty { o["up"] = .array(up.map(JSONValue.string)) }
        if let why { o["why"] = .string(why) }
        return .object(o)
    }

    public init(v: Int, screens: [String], up: [String] = [], why: String? = nil) {
        self.v = v
        self.screens = screens
        self.up = up
        self.why = why
    }

    public init(_ n: Negotiation) {
        switch n {
        case .linked(let v, let screens): self.init(v: v, screens: screens)
        case .refused(let r): self.init(v: 0, screens: [], why: r.rawValue)
        }
    }

    /// This reply naming the screens the shell still shows (`shown`, in its order) that the page may take over: those
    /// negotiated now. Refused replies take none.
    public func takingOver(_ shown: [String]) -> HelloReply {
        var r = self
        r.up = v >= 1 ? shown.filter { screens.contains($0) } : []
        return r
    }
}

/// The outcome of a hello.
public enum Negotiation: Equatable, Sendable {
    /// Both speak `v`; the page may present `screens` (possibly none).
    case linked(v: Int, screens: [String])
    case refused(Refusal)

    public enum Refusal: String, Equatable, Sendable {
        /// The hello names no contract version.
        case noVersion = "no-version"
        /// The page speaks only versions older than this binary's oldest.
        case pageTooOld = "page-too-old"
    }

    /// Negotiates a hello: the newest version both speak, and the screens both have that are on now.
    public static func negotiate(_ hello: HelloRequest, shell: ShellContract, available: [String]) -> Negotiation {
        guard hello.v >= 1 else { return .refused(.noVersion) }
        let v = Swift.min(hello.v, shell.v)
        guard v >= shell.min else { return .refused(.pageTooOld) }
        let screens = available.filter { shell.screens.contains($0) && hello.screens.contains($0) }
        return .linked(v: v, screens: screens)
    }
}

/// Which of this binary's screens are on for a page build, and why the others are off.
public enum ScreenGate {
    public enum Off: Equatable, Sendable {
        /// The device switch (Settings > About).
        case deviceSwitch
        /// The policy file.
        case policy
        /// A crash marker turned it off for this (shell, page) pair.
        case crashMarker(DisabledPair)
        /// The native breaker tripped for this page build.
        case breaker(Trip)
    }

    public static func evaluate(binary: [String], deviceOff: Set<String>, policy: Policy, book: BreakerBook,
                                shellBuild: String, pageBuild: String?) -> (on: [String], off: [String: Off]) {
        var on: [String] = []
        var off: [String: Off] = [:]
        for s in binary {
            if deviceOff.contains(s) { off[s] = .deviceSwitch }
            else if !policy.screenOn(s) { off[s] = .policy }
            else if let d = book.disabled(piece: s, shell: shellBuild, page: pageBuild) { off[s] = .crashMarker(d) }
            else if let t = book.trip(screen: s, pageBuild: pageBuild) { off[s] = .breaker(t) }
            else { on.append(s) }
        }
        return (on, off)
    }
}

/// Whether the store's facade attaches at a document start, and why not.
public enum StoreGate {
    public enum Off: Equatable, Sendable {
        /// Storage's Native copy switch.
        case deviceSwitch
        /// The policy file (`store.facade: "off"`).
        case policy
        /// A store crash marker for this (shell, page) pair.
        case crashMarker(DisabledPair)
        /// The last document never finished booting: this launch runs without the facade.
        case unfinishedBoot
    }

    /// Nil when the facade may attach. Call after `book.store.launch(at:)` for this process.
    public static func evaluate(deviceOff: Bool, policy: Policy, book: BreakerBook, shellBuild: String, pageBuild: String?) -> Off? {
        if deviceOff { return .deviceSwitch }
        if !policy.facadeOn { return .policy }
        if let d = book.disabled(piece: CrashMarker.Piece.store.name, shell: shellBuild, page: pageBuild) { return .crashMarker(d) }
        if book.store.skipping { return .unfinishedBoot }
        return nil
    }
}

// MARK: Page to Swift

/// A call from the page through the TrovoShell plugin.
public enum PageMessage: Equatable, Sendable {
    case hello(HelloRequest)
    /// The end of boot, whatever painted: disarms the store breaker (and carries the OTA confirm).
    case bootDone(page: String)
    case present(screen: String)
    case dismiss(screen: String)
    case model(ModelPush)
    case toast(ToastRequest)
    case confirm(ConfirmRequest)
    case log(LogLine)
    /// Settings > About: every screen of this binary, on or off and why, and the shell's counters (`ScreenStatus`).
    case status
    /// Settings > About's "Try the native chat again": the screen's crash verdicts and native breaker record go, so the
    /// next document may show it again (this one keeps what it negotiated). Answers the status after.
    case reset(screen: String)
    /// The page went hidden or visible while a native screen covered it (it sends nothing otherwise): the shell counts a
    /// hidden page while the app is in use, which a native screen over the page never causes by design.
    case visibility(VisibilityReport)

    /// The plugin's methods.
    public static let methods = ["hello", "bootDone", "present", "dismiss", "model", "toast", "confirm", "log", "status", "reset", "visibility"]

    public enum DecodeError: Error, Equatable {
        case unknownMethod(String)
        case missing(String)
    }

    /// From a plugin method's name and its options (`JSONValue(foundation: call.options)`).
    public init(method: String, options o: JSONValue) throws {
        func str(_ k: String) throws -> String {
            guard let s = o[k]?.string else { throw DecodeError.missing(k) }
            return s
        }
        switch method {
        case "hello":
            guard o["v"]?.int != nil else { throw DecodeError.missing("v") }
            self = .hello(HelloRequest(json: o))
        case "bootDone": self = .bootDone(page: try str("page"))
        case "present": self = .present(screen: try str("screen"))
        case "dismiss": self = .dismiss(screen: try str("screen"))
        case "model":
            guard let rev = o["rev"]?.int else { throw DecodeError.missing("rev") }
            self = .model(ModelPush(screen: try str("screen"), rev: rev, json: try str("json")))
        case "toast": self = .toast(ToastRequest(text: try str("text"), style: o["style"]?.string, undo: o["undo"]?.string))
        case "confirm":
            self = .confirm(ConfirmRequest(id: try str("id"), title: try str("title"), body: o["body"]?.string,
                                           confirm: o["confirm"]?.string, cancel: o["cancel"]?.string, tone: o["tone"]?.string))
        case "log": self = .log(LogLine(text: try str("text"), level: o["level"]?.string))
        case "status": self = .status
        case "reset": self = .reset(screen: try str("screen"))
        case "visibility":
            let at = o["at"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) }
            self = .visibility(VisibilityReport(state: try str("state"), at: at))
        default: throw DecodeError.unknownMethod(method)
        }
    }
}

/// `visibility {state, at?}`: what the page's visibilitychange said while a native screen covered it.
public struct VisibilityReport: Equatable, Sendable {
    /// `document.visibilityState`: "hidden" or "visible".
    public var state: String
    /// When the page saw it (its `Date.now()`); nil when it sent none.
    public var at: Date?

    public init(state: String, at: Date? = nil) {
        self.state = state
        self.at = at
    }

    public var hidden: Bool { state == "hidden" }
}

/// `model {screen, rev, json}`: json is `_nativeJSON(model)`.
public struct ModelPush: Equatable, Sendable {
    public var screen: String
    public var rev: Int
    public var json: String

    public init(screen: String, rev: Int, json: String) {
        self.screen = screen
        self.rev = rev
        self.json = json
    }
}

/// A page toast, forwarded while a native screen covers the page.
public struct ToastRequest: Equatable, Sendable {
    public enum Style: Equatable, Sendable {
        /// The default: done (green in Lime).
        case ok
        /// A record: gold, a beat longer.
        case pr
        /// A failure: red, longer, announced at once.
        case err
        case other(String)
    }

    public var text: String
    public var style: Style
    /// The id `toast.undo` answers with: the toast offers Undo.
    public var undo: String?

    public init(text: String, style: String?, undo: String?) {
        self.text = text
        switch style {
        case nil, "", "ok": self.style = .ok
        case "pr": self.style = .pr
        case "err": self.style = .err
        case let s?: self.style = .other(s)
        }
        self.undo = undo.flatMap { $0.isEmpty ? nil : $0 }
    }

    /// How long it shows, as the page's showToast and showUndoToast time it.
    public var duration: TimeInterval {
        if undo != nil { return 6 }
        switch style {
        case .pr, .err: return 3.5
        case .ok, .other: return 2.2
        }
    }

    /// VoiceOver says it at once (assertive) rather than when idle.
    public var assertive: Bool { style == .err }
}

/// A page confirm (`_ktConfirm`), forwarded while a native screen covers the page.
public struct ConfirmRequest: Equatable, Sendable {
    public enum Tone: Equatable, Sendable {
        /// Red: the page's default confirm style.
        case danger
        case accent
        case neutral
        case other(String)
    }

    public var id: String
    public var title: String
    public var body: String?
    public var confirm: String
    public var cancel: String
    public var tone: Tone

    public init(id: String, title: String, body: String?, confirm: String?, cancel: String?, tone: String?) {
        self.id = id
        self.title = title
        self.body = body.flatMap { $0.isEmpty ? nil : $0 }
        self.confirm = confirm.flatMap { $0.isEmpty ? nil : $0 } ?? "Confirm"
        self.cancel = cancel.flatMap { $0.isEmpty ? nil : $0 } ?? "Cancel"
        switch tone {
        case nil, "", "danger": self.tone = .danger
        case "accent": self.tone = .accent
        case "neutral": self.tone = .neutral
        case let t?: self.tone = .other(t)
        }
    }

    public func answer(_ yes: Bool) -> Intent { .confirm(id: id, yes: yes) }
}

/// A line for the shell's log (subsystem app.kt.trainer).
public struct LogLine: Equatable, Sendable {
    public var text: String
    public var level: String?

    public init(text: String, level: String?) {
        self.text = text
        self.level = level
    }
}
