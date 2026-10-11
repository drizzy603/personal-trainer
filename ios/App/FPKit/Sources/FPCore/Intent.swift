import Foundation

// Swift to page: the named intents of contract v1 (plan task C4; decision.md section 6).
//
// PageLink (C5) calls `window.FPScreens.call(name, args)` through `callAsyncJavaScript` in the page
// world, first in first out, with a timeout of 2 s (5 s for a snapshot); the page answers {ok: true,
// …} or {ok: false, error}. An intent is never resent: after a timeout or a reload, a draft is
// restored instead. Messages are addressed by id, never by index (indexes go stale at the 60-message
// cap). Tests/FPCoreTests/intents.json lists every name and argument; IntentTests holds this file to
// it, and the page's bridge spec (118) can hold FPScreens to the same file.

/// A photo the native composer picked, for `coach.send`: JPEG, downscaled by FPUI (1568 px, 0.82).
public struct CoachImage: Equatable, Sendable {
    public var mediaType: String
    /// Base64, no data: prefix.
    public var data: String

    public init(mediaType: String, data: String) {
        self.mediaType = mediaType
        self.data = data
    }

    var json: JSONValue { ["mediaType": .string(mediaType), "data": .string(data)] }

    init?(json: JSONValue) {
        guard let mediaType = json["mediaType"]?.string, let data = json["data"]?.string else { return nil }
        self.init(mediaType: mediaType, data: data)
    }
}

/// An intent: a named call into the page.
public enum Intent: Equatable, Sendable {
    /// Is the page there and on contract v1? (The -fpSmoke launch logs "fp: ping ok v1".)
    case ping
    /// The shell covers the page (a native screen is up): the page skips programmatic focus.
    case shellCovered(on: Bool)
    /// The coach model now (answers {ok, json}).
    case coachSnapshot
    /// Send the owner's message. Idempotent by nonce: the page remembers the last 20.
    /// `image`: a photo Swift picked; `usePending`: send with the page's pending (shared) photo.
    case coachSend(text: String, image: CoachImage?, usePending: Bool?, nonce: String)
    /// Send an empty-state suggestion chip's words.
    case coachChip(text: String, nonce: String)
    /// A %% reply's action chip: the page sends `text` if message `id` is still the newest reply.
    case coachAction(id: String, text: String)
    case coachStop
    case coachRetry
    /// PLAN CHANGES: Keep changes (or Got it) on message `id`.
    case coachKeep(id: String)
    /// PLAN CHANGES: Undo on message `id` (the page asks first, through a forwarded confirm).
    case coachUndo(id: String)
    /// Switch the coach model (the header's switch sends its `next`).
    case coachModel(model: String)
    /// Leave the chat for the Coach home.
    case coachBack
    /// Stop programme setup (the page asks first).
    case coachCancelIntake
    case coachRestorePrevious
    /// Reset programme (the empty chat's button; the page asks first).
    case coachRegenerate
    case coachOpenSettings
    /// The page's pending photo with this key (answers {ok, mediaType, data}).
    case coachImage(key: String)
    /// Drop the page's pending photo.
    case coachClearImage
    /// The native composer took the page's draft with this nonce.
    case coachDraftTaken(nonce: String)
    /// The owner's answer to a forwarded confirm (answers {ok: false, error: "stale"} after a reload).
    case confirm(id: String, yes: Bool)
    /// Undo on a forwarded toast.
    case toastUndo(id: String)
    /// A native screen is off for the rest of the document: the page shows its own again. `why` is
    /// LinkState's `ScreenOffReason.code`: no-hello, failures or withdrawn.
    case screensOff(screen: String, why: String?)

    /// The name `FPScreens.call` receives.
    public var name: String {
        switch self {
        case .ping: return "ping"
        case .shellCovered: return "shell.covered"
        case .coachSnapshot: return "coach.snapshot"
        case .coachSend: return "coach.send"
        case .coachChip: return "coach.chip"
        case .coachAction: return "coach.action"
        case .coachStop: return "coach.stop"
        case .coachRetry: return "coach.retry"
        case .coachKeep: return "coach.keep"
        case .coachUndo: return "coach.undo"
        case .coachModel: return "coach.model"
        case .coachBack: return "coach.back"
        case .coachCancelIntake: return "coach.cancelIntake"
        case .coachRestorePrevious: return "coach.restorePrevious"
        case .coachRegenerate: return "coach.regenerate"
        case .coachOpenSettings: return "coach.openSettings"
        case .coachImage: return "coach.image"
        case .coachClearImage: return "coach.clearImage"
        case .coachDraftTaken: return "coach.draftTaken"
        case .confirm: return "confirm"
        case .toastUndo: return "toast.undo"
        case .screensOff: return "screens.off"
        }
    }

    /// The arguments `FPScreens.call` receives (optional ones only when set).
    public var arguments: [String: JSONValue] {
        switch self {
        case .ping, .coachSnapshot, .coachStop, .coachRetry, .coachBack, .coachCancelIntake,
             .coachRestorePrevious, .coachRegenerate, .coachOpenSettings, .coachClearImage:
            return [:]
        case .shellCovered(let on): return ["on": .bool(on)]
        case .coachSend(let text, let image, let usePending, let nonce):
            var a: [String: JSONValue] = ["text": .string(text), "nonce": .string(nonce)]
            if let image { a["image"] = image.json }
            if let usePending { a["usePending"] = .bool(usePending) }
            return a
        case .coachChip(let text, let nonce): return ["text": .string(text), "nonce": .string(nonce)]
        case .coachAction(let id, let text): return ["id": .string(id), "text": .string(text)]
        case .coachKeep(let id), .coachUndo(let id): return ["id": .string(id)]
        case .coachModel(let model): return ["model": .string(model)]
        case .coachImage(let key): return ["key": .string(key)]
        case .coachDraftTaken(let nonce): return ["nonce": .string(nonce)]
        case .confirm(let id, let yes): return ["id": .string(id), "yes": .bool(yes)]
        case .toastUndo(let id): return ["id": .string(id)]
        case .screensOff(let screen, let why):
            var a: [String: JSONValue] = ["screen": .string(screen)]
            if let why { a["why"] = .string(why) }
            return a
        }
    }

    /// `callAsyncJavaScript`'s arguments for `return await window.FPScreens.call(name, args)`.
    public var callArguments: [String: Any] {
        ["name": name, "args": JSONValue.object(arguments).foundation]
    }

    /// The source `callAsyncJavaScript` runs with `callArguments`.
    public static let callSource = "return await window.FPScreens.call(name, args);"

    /// How long PageLink waits for the answer.
    public var timeout: TimeInterval { IntentSignature.named(name)?.timeout ?? 2 }

    /// The native screen it belongs to, for the breaker; nil for the shell's own (ping, covered,
    /// confirm, toast, screens.off), which count against every live screen.
    public var screen: String? { name.hasPrefix("coach.") ? "coach" : nil }

    /// A fresh nonce for a send.
    public static func nonce() -> String { "n" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(16) }

    public enum ParseError: Error, Equatable {
        case unknownName(String)
        case missing(String)
        case wrongType(String)
    }

    /// The intent with this name and these arguments (the inverse of `name` and `arguments`).
    public init(name: String, arguments a: [String: JSONValue]) throws {
        func str(_ k: String) throws -> String {
            guard let v = a[k] else { throw ParseError.missing(k) }
            guard let s = v.string else { throw ParseError.wrongType(k) }
            return s
        }
        func flag(_ k: String) throws -> Bool {
            guard let v = a[k] else { throw ParseError.missing(k) }
            guard let b = v.bool else { throw ParseError.wrongType(k) }
            return b
        }
        func optionalFlag(_ k: String) throws -> Bool? {
            guard let v = a[k], !v.isNull else { return nil }
            guard let b = v.bool else { throw ParseError.wrongType(k) }
            return b
        }
        func optionalStr(_ k: String) throws -> String? {
            guard let v = a[k], !v.isNull else { return nil }
            guard let s = v.string else { throw ParseError.wrongType(k) }
            return s
        }
        switch name {
        case "ping": self = .ping
        case "shell.covered": self = .shellCovered(on: try flag("on"))
        case "coach.snapshot": self = .coachSnapshot
        case "coach.send":
            var image: CoachImage?
            if let v = a["image"], !v.isNull {
                guard let i = CoachImage(json: v) else { throw ParseError.wrongType("image") }
                image = i
            }
            self = .coachSend(text: try str("text"), image: image, usePending: try optionalFlag("usePending"), nonce: try str("nonce"))
        case "coach.chip": self = .coachChip(text: try str("text"), nonce: try str("nonce"))
        case "coach.action": self = .coachAction(id: try str("id"), text: try str("text"))
        case "coach.stop": self = .coachStop
        case "coach.retry": self = .coachRetry
        case "coach.keep": self = .coachKeep(id: try str("id"))
        case "coach.undo": self = .coachUndo(id: try str("id"))
        case "coach.model": self = .coachModel(model: try str("model"))
        case "coach.back": self = .coachBack
        case "coach.cancelIntake": self = .coachCancelIntake
        case "coach.restorePrevious": self = .coachRestorePrevious
        case "coach.regenerate": self = .coachRegenerate
        case "coach.openSettings": self = .coachOpenSettings
        case "coach.image": self = .coachImage(key: try str("key"))
        case "coach.clearImage": self = .coachClearImage
        case "coach.draftTaken": self = .coachDraftTaken(nonce: try str("nonce"))
        case "confirm": self = .confirm(id: try str("id"), yes: try flag("yes"))
        case "toast.undo": self = .toastUndo(id: try str("id"))
        case "screens.off": self = .screensOff(screen: try str("screen"), why: try optionalStr("why"))
        default: throw ParseError.unknownName(name)
        }
    }
}

/// An intent's name, arguments and timeout, as intents.json writes them.
public struct IntentSignature: Equatable, Sendable {
    public enum ArgType: String, Equatable, Sendable {
        case string, bool, int, image
        case strings = "[string]"
    }

    public struct Arg: Equatable, Sendable {
        public var name: String
        public var type: ArgType
        public var optional: Bool

        /// "text" + "string?" -> text, string, optional.
        public init?(name: String, spec: String) {
            let optional = spec.hasSuffix("?")
            guard let type = ArgType(rawValue: optional ? String(spec.dropLast()) : spec) else { return nil }
            self.name = name
            self.type = type
            self.optional = optional
        }

        public var spec: String { type.rawValue + (optional ? "?" : "") }

        /// Whether a value is of this argument's type.
        public func accepts(_ v: JSONValue) -> Bool {
            switch type {
            case .string: return v.string != nil
            case .bool: return v.bool != nil
            case .int: return v.int != nil
            case .image: return CoachImage(json: v) != nil
            case .strings: return v.array?.allSatisfy { $0.string != nil } ?? false
            }
        }
    }

    public var name: String
    public var args: [Arg]
    public var timeout: TimeInterval

    init(_ name: String, _ args: KeyValuePairs<String, String> = [:], timeout: TimeInterval = 2) {
        self.name = name
        self.args = args.map { Arg(name: $0.key, spec: $0.value)! }
        self.timeout = timeout
    }

    /// Every intent of contract v1.
    public static let all: [IntentSignature] = [
        .init("ping"),
        .init("shell.covered", ["on": "bool"]),
        .init("coach.snapshot", timeout: 5),
        .init("coach.send", ["text": "string", "image": "image?", "usePending": "bool?", "nonce": "string"]),
        .init("coach.chip", ["text": "string", "nonce": "string"]),
        .init("coach.action", ["id": "string", "text": "string"]),
        .init("coach.stop"),
        .init("coach.retry"),
        .init("coach.keep", ["id": "string"]),
        .init("coach.undo", ["id": "string"]),
        .init("coach.model", ["model": "string"]),
        .init("coach.back"),
        .init("coach.cancelIntake"),
        .init("coach.restorePrevious"),
        .init("coach.regenerate"),
        .init("coach.openSettings"),
        .init("coach.image", ["key": "string"]),
        .init("coach.clearImage"),
        .init("coach.draftTaken", ["nonce": "string"]),
        .init("confirm", ["id": "string", "yes": "bool"]),
        .init("toast.undo", ["id": "string"]),
        .init("screens.off", ["screen": "string", "why": "string?"]),
    ]

    public static func named(_ name: String) -> IntentSignature? { all.first { $0.name == name } }

    /// Problems with these arguments for this intent: a missing required one, a wrong type, an extra.
    public func problems(with a: [String: JSONValue]) -> [String] {
        var out: [String] = []
        for arg in args {
            guard let v = a[arg.name], !v.isNull else {
                if !arg.optional { out.append("\(name): missing \(arg.name)") }
                continue
            }
            if !arg.accepts(v) { out.append("\(name): \(arg.name) is not \(arg.spec)") }
        }
        for k in a.keys.sorted() where !args.contains(where: { $0.name == k }) { out.append("\(name): extra \(k)") }
        return out
    }
}

/// The page's answer to an intent.
public struct IntentReply: Equatable, Sendable {
    public var ok: Bool
    public var error: String?
    /// The whole answer (a snapshot's json, an image's data).
    public var value: JSONValue

    public init(json: JSONValue) {
        value = json
        ok = json["ok"]?.bool ?? false
        error = json["error"]?.string
    }
}

/// What came of an intent, as the link breaker counts it.
public enum IntentOutcome: Equatable, Sendable {
    /// {ok: true}.
    case done(IntentReply)
    /// {ok: false} with the page's own reason (stale, busy, loading, gone, …): the bridge works.
    case refused(String)
    /// The bridge did not work: counted toward the 3-failure breaker.
    case failed(IntentFailure)

    /// Failure codes a page answers with when the bridge, not the request, is at fault.
    public static let failureCodes: Set<String> = ["unknown-intent", "bad-args", "exception"]

    /// From `callAsyncJavaScript`'s result or error, or nil for a timeout.
    public static func classify(result: Any?, error: Error?, timedOut: Bool = false) -> IntentOutcome {
        if timedOut { return .failed(.timeout) }
        if let error { return .failed(.javascript((error as NSError).localizedDescription)) }
        guard let result, let json = try? JSONValue(foundation: result), json.object != nil else {
            return .failed(.malformedReply(result.map { "\(type(of: $0))" } ?? "nothing"))
        }
        return classify(reply: IntentReply(json: json))
    }

    public static func classify(reply: IntentReply) -> IntentOutcome {
        if reply.value["ok"]?.bool == nil { return .failed(.malformedReply("no ok")) }
        if reply.ok { return .done(reply) }
        let code = reply.error ?? ""
        if failureCodes.contains(code) { return .failed(.page(code)) }
        return .refused(code)
    }

    public var countsAsFailure: Bool {
        if case .failed = self { return true }
        return false
    }
}

public enum IntentFailure: Equatable, Sendable {
    /// No answer within the intent's timeout.
    case timeout
    /// The call threw: no FPScreens, an exception in the page, a web view gone.
    case javascript(String)
    /// An answer that is not {ok, …}.
    case malformedReply(String)
    /// {ok: false} with a failure code (unknown-intent, bad-args, exception).
    case page(String)
}
