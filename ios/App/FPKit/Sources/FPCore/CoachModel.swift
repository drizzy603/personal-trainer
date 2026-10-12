import Foundation

// Coach model v1: everything the native chat draws, built by the page (plan tasks C3 and C4;
// decision.md section 6). The page sends it in `model {screen:'coach', rev, json}` with
// json = _nativeJSON(model), and answers `coach.snapshot` with it. About 22 KB for 60 messages.
//
// The page builds every label, row, chip and text, so the native chat and the web chat cannot
// disagree; Swift decodes and draws. Decoding is tolerant: only `v` is required (it must be 1); every
// other field has a default, unknown fields are ignored, a message that is not an object is skipped
// (counted in `skipped`), and unknown block kinds draw as text (Blocks.swift). The fields follow
// chatui/ui's stored chat fields (`at`, `_seed`, `_stopped`, `_errKind`, `_planChangeRows`).
//
//   {
//     "v": 1, "rev": 42, "boot": "b-…",        rev rises with every model of a boot
//     "intake": false, "loading": false,        loading: a reply is in flight (Thinking…, Stop)
//     "room": "heavyweight", "paper": true,     paper sets the native appearance (light/dark)
//     "dynTypeOn": true,                        the app's Dynamic Type toggle (kt_dyn_type)
//     "tokens": {…},                            Tokens.swift
//     "header": {"eyebrow": "COACH · ONLINE", "status": "online|intake|replying|offline",
//                "title": "Today's plan", "meta": "WK 06 · DAY 6" | null,
//                "model": {"label": "Sonnet 5.5", "name": "Sonnet", "version": "5.5",
//                          "next": "claude-haiku-4-5-20251001",
//                          "a11y": "Coach model: Sonnet 5.5. Switch to Haiku 4.5"} | null,
//                "back": true, "cancel": false},                    intake: Cancel, no Back
//     "empty": {"title": "Ask anything", "sub": "…",
//               "programme": {"label": "Custom programme active", "actions": [Action]} | null,
//               "chips": ["What should I focus on this week?", …]} | null,
//     "messages": [Message],
//     "running": [Pill],                        tool pills of the reply in flight
//     "composer": {"placeholder": "Message Coach…", "short": "Message…", "a11y": "Message the coach",
//                  "attach": true, "image": {"key": "…"} | null,     the page's pending photo
//                  "draft": {"text": "…", "nonce": "…"} | null},     text for the field, once
//     "speech": {"id": "…", "text": "Coach: …"} | null              announce once per id
//   }
//   Message {"id": "m12", "role": "user|assistant", "at": 1760000000000 | null,
//            "day": "Today" | null,             a day divider above it (first message of a day)
//            "seed": "Plateau check" | null,    a prompt the app wrote: a divider, not a bubble
//            "local": false, "error": false, "stopped": false, "errKind": "key|billing" | null,
//            "image": {"key": "…" | null} | null,    it carried a photo
//            "eyebrow": "COACH · Run analysis" | null,
//            "body": Body,                       Blocks.swift
//            "chip": "retry" | "settings" | Action | null,      on the trailing error or stop
//            "pills": [Pill], "ledger": Ledger | null, "a11y": "…" | null}
//   Pill    {"label": "Changed Bench Press · 170 lb", "ok": true}    the label as shown
//   Ledger  {"head": "PLAN CHANGES · WEEK 6", "rows": [["Bench Press", "→ 170 lb", "plan|goal"]],
//            "canUndo": true, "note": "…", "actions": [Action]}
//   Action  {"do": "undo|keep|gotIt|retry|settings|restorePrevious|regenerate", "label": "Undo",
//            "tone": "primary|neutral|plain"}

/// The model of the native coach chat.
public struct CoachModel: Equatable, Sendable {
    public static let version = 1

    public var v: Int
    /// Rises with every model the page builds in one boot: an older rev never replaces a newer one.
    public var rev: Int
    /// The page's boot id: a model from another boot (a reload) is stale.
    public var boot: String
    public var intake: Bool
    public var loading: Bool
    public var room: Room
    public var paper: Bool
    public var dynTypeOn: Bool
    public var tokens: Tokens
    public var header: Header
    public var empty: EmptyState?
    public var messages: [Message]
    public var running: [Pill]
    public var composer: Composer
    public var speech: Speech?
    /// Messages that were not objects and were left out.
    public var skipped: Int

    public var appearance: Appearance { paper ? .light : .dark }

    public enum DecodeError: Error, Equatable, CustomStringConvertible {
        case notAnObject
        case version(Int?)

        public var description: String {
            switch self {
            case .notAnObject: return "the coach model is not a JSON object"
            case .version(let v): return "coach model v\(v.map(String.init) ?? "?") (this build reads v\(CoachModel.version))"
            }
        }
    }

    /// From the JSON text the page sends (mended before decoding).
    public static func decode(_ text: String) throws -> CoachModel {
        try CoachModel(json: JSONText.parse(text))
    }

    /// From UTF-8 bytes (a fixture, a file).
    public static func decode(utf8 data: Data) throws -> CoachModel {
        try CoachModel(json: JSONText.parse(utf8: data))
    }

    public init(json: JSONValue) throws {
        guard json.object != nil else { throw DecodeError.notAnObject }
        guard let v = json["v"]?.int, v == CoachModel.version else { throw DecodeError.version(json["v"]?.int) }
        self.v = v
        rev = json["rev"]?.int ?? 0
        boot = json["boot"]?.string ?? ""
        intake = json["intake"]?.bool ?? false
        loading = json["loading"]?.bool ?? false
        room = Room(id: json["room"]?.string ?? "heavyweight")
        paper = json["paper"]?.bool ?? room.isPaper ?? true
        dynTypeOn = json["dynTypeOn"]?.bool ?? true
        tokens = Tokens(room: room, paper: paper, overrides: json["tokens"])
        header = Header(json: json["header"], intake: intake)
        empty = json["empty"].flatMap { $0.object == nil ? nil : EmptyState(json: $0) }
        let raw = json["messages"]?.array ?? []
        messages = raw.compactMap { $0.object == nil ? nil : Message(json: $0) }
        skipped = raw.count - messages.count
        running = (json["running"]?.array ?? []).compactMap(Pill.init(json:))
        composer = Composer(json: json["composer"], intake: intake)
        speech = Speech(json: json["speech"])
    }

    /// The message with this id.
    public func message(id: String) -> Message? {
        id.isEmpty ? nil : messages.first { $0.id == id }
    }
}

// MARK: Header

public struct Header: Equatable, Sendable {
    public enum Status: Equatable, Sendable {
        case online, intake, replying, offline
        case other(String)

        init(_ s: String?) {
            switch s {
            case nil, "online": self = .online
            case "intake": self = .intake
            case "replying": self = .replying
            case "offline": self = .offline
            case let x?: self = .other(x)
            }
        }
    }

    public var eyebrow: String
    /// The dot by the eyebrow: offline goes quiet.
    public var status: Status
    public var title: String
    /// "WK 06 · DAY 6": stands down on the narrowest screens and under Larger Text, as on the web.
    public var meta: String?
    public var model: ModelSwitch?
    public var back: Bool
    public var cancel: Bool
    /// The owner's initial over the header, as the web chat's `.screen-avatar` draws it (`_initialOf(getUserFirstName())`:
    /// the first grapheme, uppercased; "?" with no name). Additive within v1: a page that sends none draws none.
    public var avatar: String?

    init(json: JSONValue?, intake: Bool) {
        let j = json ?? .null
        eyebrow = j["eyebrow"]?.string ?? (intake ? "COACH · INTAKE" : "COACH · ONLINE")
        status = Status(j["status"]?.string ?? (intake ? "intake" : nil))
        title = j["title"]?.string ?? ""
        meta = j["meta"]?.string
        model = j["model"].flatMap(ModelSwitch.init(json:))
        back = j["back"]?.bool ?? !intake
        cancel = j["cancel"]?.bool ?? intake
        avatar = j["avatar"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// The header's model switch (spec 114): its label, the label without the version for narrow
/// screens and Larger Text, the model it switches to, and its accessible name.
public struct ModelSwitch: Equatable, Sendable {
    public var label: String
    public var name: String
    public var version: String?
    public var next: String
    public var a11y: String

    init?(json: JSONValue) {
        guard let label = json["label"]?.string, let next = json["next"]?.string, !next.isEmpty else { return nil }
        self.label = label
        self.next = next
        a11y = json["a11y"]?.string ?? label
        if let name = json["name"]?.string {
            self.name = name
            version = json["version"]?.string
        } else if let sp = label.lastIndex(of: " "), label[label.index(after: sp)...].allSatisfy({ $0.isNumber || $0 == "." }),
                  label.index(after: sp) < label.endIndex {
            // the web drops " 5.5" the same way (`modelLabel.replace(/ [\d.]+$/, '')`)
            name = String(label[..<sp])
            version = String(label[label.index(after: sp)...])
        } else {
            name = label
            version = json["version"]?.string
        }
    }

    public var intent: Intent { .coachModel(model: next) }
}

// MARK: Empty state

public struct EmptyState: Equatable, Sendable {
    public var title: String
    public var sub: String
    public var programme: Programme?
    /// Suggestions; a tap sends the chip's words (`coach.chip`).
    public var chips: [String]

    init(json: JSONValue) {
        title = json["title"]?.string ?? ""
        sub = json["sub"]?.string ?? ""
        programme = json["programme"].flatMap { $0.object == nil ? nil : Programme(json: $0) }
        chips = (json["chips"]?.array ?? []).compactMap(\.string).filter { !$0.isEmpty }
    }
}

/// "Custom programme active" with Restore previous and Reset programme.
public struct Programme: Equatable, Sendable {
    public var label: String
    public var actions: [ModelAction]

    init(json: JSONValue) {
        label = json["label"]?.string ?? ""
        actions = (json["actions"]?.array ?? []).compactMap(ModelAction.init(json:))
    }
}

// MARK: Actions

/// A button the page labels and Swift turns into an intent.
public struct ModelAction: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case undo, keep, retry, settings, restorePrevious, regenerate
        case other(String)

        public init(_ s: String) {
            switch s {
            case "undo": self = .undo
            case "keep", "gotIt": self = .keep
            case "retry": self = .retry
            case "settings", "openSettings": self = .settings
            case "restorePrevious": self = .restorePrevious
            case "regenerate": self = .regenerate
            default: self = .other(s)
            }
        }
    }

    public enum Tone: String, Equatable, Sendable {
        case primary, neutral, plain
    }

    public var kind: Kind
    public var label: String
    public var tone: Tone

    public init(kind: Kind, label: String, tone: Tone) {
        self.kind = kind
        self.label = label
        self.tone = tone
    }

    init?(json: JSONValue) {
        guard let d = json["do"]?.string, let label = json["label"]?.string, !label.isEmpty else { return nil }
        kind = Kind(d)
        self.label = label
        tone = Tone(rawValue: json["tone"]?.string ?? "") ?? .neutral
    }

    /// The intent this button sends; undo and keep act on their message, by id. Nil for a kind this
    /// build does not know, or an undo/keep with no message id: the view leaves the button out.
    public func intent(messageID: String?) -> Intent? {
        switch kind {
        case .undo: return messageID.flatMap { $0.isEmpty ? nil : .coachUndo(id: $0) }
        case .keep: return messageID.flatMap { $0.isEmpty ? nil : .coachKeep(id: $0) }
        case .retry: return .coachRetry
        case .settings: return .coachOpenSettings
        case .restorePrevious: return .coachRestorePrevious
        case .regenerate: return .coachRegenerate
        case .other: return nil
        }
    }
}

// MARK: Messages

public struct Message: Equatable, Sendable, Identifiable {
    public enum Role: Equatable, Sendable {
        case user, assistant
        case other(String)

        init(_ s: String?) {
            switch s {
            case "user": self = .user
            case "assistant", nil: self = .assistant
            case let x?: self = .other(x)
            }
        }
    }

    public enum ErrorKind: Equatable, Sendable {
        /// The API refused the key: the chip opens Settings.
        case key
        /// The account is out of credit: no chip.
        case billing
        case other(String)
    }

    /// How the web draws it.
    public enum Look: Equatable, Sendable {
        /// The app's prompt (a plateau check, programme setup): a divider with the day and the seed.
        case seed
        /// The owner's words (and photo) in a bubble.
        case bubble
        /// A reply: full width under its eyebrow.
        case reply
        /// The app's own note (Stopped, an error): muted, a dot, no eyebrow.
        case note(error: Bool)
    }

    /// The page's message id: undo, keep and chips address messages by it, never by index.
    public var id: String
    public var role: Role
    public var at: Date?
    public var day: String?
    public var seed: String?
    public var local: Bool
    public var error: Bool
    public var stopped: Bool
    public var errorKind: ErrorKind?
    public var image: MessageImage?
    public var eyebrow: String?
    public var body: MessageBody
    public var chip: ModelAction?
    public var pills: [Pill]
    public var ledger: Ledger?
    /// The page's VoiceOver text for it (`_coachSpeech`), when it sends one.
    public var a11y: String?

    /// A message Swift draws before the page has it: the native chat's echo of the owner's words on their way to the
    /// page (plan task C7, FPUI CoachStore), replaced by the page's own message once a model holds it. Every field not
    /// given takes the value a message with no such field decodes to.
    public init(id: String, role: Role, at: Date? = nil, day: String? = nil, body: MessageBody, image: MessageImage? = nil) {
        self.id = id
        self.role = role
        self.at = at
        self.day = day
        seed = nil
        local = false
        error = false
        stopped = false
        errorKind = nil
        self.image = image
        eyebrow = nil
        self.body = body
        chip = nil
        pills = []
        ledger = nil
        a11y = nil
    }

    init(json: JSONValue) {
        id = json["id"]?.string ?? ""
        role = Role(json["role"]?.string)
        at = json["at"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) }
        day = json["day"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        seed = json["seed"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        local = json["local"]?.bool ?? false
        error = json["error"]?.bool ?? false
        stopped = json["stopped"]?.bool ?? false
        switch json["errKind"]?.string {
        case nil, "": errorKind = nil
        case "key": errorKind = .key
        case "billing": errorKind = .billing
        case let x?: errorKind = .other(x)
        }
        image = MessageImage(json: json["image"])
        eyebrow = json["eyebrow"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        body = MessageBody(json: json["body"])
        chip = Message.chip(json["chip"])
        pills = (json["pills"]?.array ?? []).compactMap(Pill.init(json:))
        ledger = json["ledger"].flatMap { $0.object == nil ? nil : Ledger(json: $0) }
        a11y = json["a11y"]?.string
    }

    private static func chip(_ json: JSONValue?) -> ModelAction? {
        guard let json else { return nil }
        switch json.string {
        case "retry": return ModelAction(kind: .retry, label: "Try again", tone: .primary)
        case "settings": return ModelAction(kind: .settings, label: "Open Settings", tone: .primary)
        case .some: return nil
        case nil: return json.object == nil ? nil : ModelAction(json: json)
        }
    }

    public var look: Look {
        switch role {
        case .user: return seed != nil ? .seed : .bubble
        case .assistant, .other: return local ? .note(error: error) : .reply
        }
    }
}

/// A photo the message carried. `key` names a copy Swift may hold (one it sent, or the page's pending
/// photo it fetched); without it the view says Photo, as the web does after a relaunch.
public struct MessageImage: Equatable, Sendable {
    public var key: String?

    public init(key: String?) {
        self.key = key
    }

    init?(json: JSONValue?) {
        guard let json, !json.isNull else { return nil }
        if let b = json.bool { if !b { return nil }; key = nil; return }
        if let s = json.string { key = s.isEmpty ? nil : s; return }
        guard json.object != nil else { return nil }
        key = json["key"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// A tool pill: what a coach tool did, in the page's words.
public struct Pill: Equatable, Sendable {
    public var label: String
    public var ok: Bool

    init?(json: JSONValue) {
        guard let label = json["label"]?.string else { return nil }
        self.label = label
        ok = json["ok"]?.bool ?? true
    }
}

/// PLAN CHANGES under the newest reply that changed the programme.
public struct Ledger: Equatable, Sendable {
    public struct Row: Equatable, Sendable {
        public enum Kind: Equatable, Sendable {
            case plan, goal
            case other(String)
        }

        public var label: String
        public var value: String
        public var kind: Kind

        init?(json: JSONValue) {
            let label: String?, value: String?, kind: String?
            if let a = json.array {
                label = a.first?.string
                value = a.count > 1 ? a[1].string : nil
                kind = a.count > 2 ? a[2].string : nil
            } else {
                label = json["label"]?.string
                value = json["value"]?.string
                kind = json["kind"]?.string
            }
            guard let label else { return nil }
            self.label = label
            self.value = value ?? ""
            switch kind {
            case nil, "plan": self.kind = .plan
            case "goal": self.kind = .goal
            case let x?: self.kind = .other(x)
            }
        }
    }

    public var head: String
    public var rows: [Row]
    /// The reply's undo point is still current (`_backupScopeIs(m._undo)`).
    public var canUndo: Bool
    public var note: String?
    public var actions: [ModelAction]

    init(json: JSONValue) {
        head = json["head"]?.string ?? ""
        rows = (json["rows"]?.array ?? []).compactMap(Row.init(json:))
        canUndo = json["canUndo"]?.bool ?? false
        note = json["note"]?.string
        let given = (json["actions"]?.array ?? []).compactMap(ModelAction.init(json:))
        if json["actions"] != nil {
            actions = given
        } else if canUndo {
            actions = [ModelAction(kind: .undo, label: "Undo", tone: .neutral), ModelAction(kind: .keep, label: "Keep changes", tone: .primary)]
        } else {
            actions = [ModelAction(kind: .keep, label: "Got it", tone: .neutral)]
        }
    }
}

// MARK: Composer and speech

public struct Composer: Equatable, Sendable {
    public var placeholder: String
    /// The placeholder where the whole one would be cut (narrow screens with Larger Text).
    public var short: String?
    public var a11y: String
    /// The photo button (not during intake).
    public var attach: Bool
    /// The page's pending photo (a shared image): fetch it with `coach.image {key}`.
    public var image: ComposerImage?
    /// Text the page put in the composer (a prefill): Swift takes it once, then `coach.draftTaken`.
    public var draft: Draft?

    init(json: JSONValue?, intake: Bool) {
        let j = json ?? .null
        placeholder = j["placeholder"]?.string ?? (intake ? "Answer the Coach…" : "Message Coach…")
        short = j["short"]?.string
        a11y = j["a11y"]?.string ?? (intake ? "Answer the coach" : "Message the coach")
        attach = j["attach"]?.bool ?? !intake
        image = j["image"].flatMap { v in v["key"]?.string.flatMap { $0.isEmpty ? nil : ComposerImage(key: $0) } }
        draft = j["draft"].flatMap { v in
            guard let text = v["text"]?.string, let nonce = v["nonce"]?.string, !nonce.isEmpty else { return nil }
            return Draft(text: text, nonce: nonce)
        }
    }
}

public struct ComposerImage: Equatable, Sendable {
    public var key: String

    public init(key: String) {
        self.key = key
    }
}

public struct Draft: Equatable, Sendable {
    public var text: String
    public var nonce: String

    public init(text: String, nonce: String) {
        self.text = text
        self.nonce = nonce
    }
}

/// What VoiceOver announces (the page's _coachSay): once per id.
public struct Speech: Equatable, Sendable {
    public var id: String
    public var text: String

    public init(id: String, text: String) {
        self.id = id
        self.text = text
    }

    init?(json: JSONValue?) {
        guard let json else { return nil }
        if let s = json.string {
            guard !s.isEmpty else { return nil }
            id = s
            text = s
            return
        }
        guard let text = json["text"]?.string, !text.isEmpty else { return nil }
        self.text = text
        id = json["id"]?.string ?? text
    }
}
