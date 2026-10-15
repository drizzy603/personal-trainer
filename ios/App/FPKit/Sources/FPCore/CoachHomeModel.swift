import Foundation

// Coach home model v1: what the native Coach tab draws at its root, the hub or the connect screen, built
// by the page (contract 6.2; build 61). The page sends it in `model {screen:'coachHome', rev, json}` with
// json = _nativeJSON(_coachHomeModel(rev)), and answers `coachHome.snapshot` with it. A few KB.
//
// One model, two outputs: the page rebuilds its own web hub and connect HTML on the same model, so the web
// Coach tab and the native one cannot disagree. Swift decodes and draws; every string is the page's, raw
// (the web builder escapes when it makes HTML). The model never carries the API key, nor its masked form.
//
// Decoding is tolerant, as CoachModel's: only `v` is required and must be CoachHomeModel.version (the model's
// own version, never the shell contract's); every other field has a compiled default, unknown fields are
// ignored, an element that does not read is skipped (rows and groups are counted in `skipped`).
//
//   {
//     "v": 1, "rev": 13, "boot": "b-…",            rev rises with every model of a boot
//     "room": "heavyweight", "paper": true, "dynTypeOn": true,
//     "tokens": {…},                                the chat's tokens; `type` also carries the hub's
//                                                   `home*` sizes (Tokens.swift, TypeToken.home)
//     "route": "hub" | "connect" | <a newer page's>,  absent: connect when `connect` is an object, else hub
//     "resume": false,                              the page will push the chat when Coach is next selected
//     "meta": {"label": "COACH · WK 06 / 12 · STRENGTH", "avatar": "K"},
//     "hero": {"greet": "Hi Kalani.", "title": "Coach", "accent": "ready.", "body": "…"},
//     "connect": {"label": "Anthropic API Key", "placeholder": "sk-ant-...",
//                 "cta": {"label": "CONNECT", "title": "Save key & start coaching"},
//                 "help": "<paragraph>\n<paragraph>",
//                 "starter": {"label": "No key? Build a starter plan instead →"} | null} | null,
//     "groups": [{"head": "Conversation",
//                 "rows": [{"do": "openChat|startIntake|clearChat|disconnect", "title": "Open Chat",
//                           "sub": "3 exchanges · …" | null, "icon": "chat|programme|trash|disconnect"}]}]
//   }

/// The model of the native Coach tab's root: the hub, or the connect screen when no key is saved.
public struct CoachHomeModel: Equatable, Sendable {
    public static let version = 1

    public let v: Int
    /// Rises with every model the page builds in one boot: an older rev never replaces a newer one.
    public let rev: Int
    /// The page's boot id: a model from another boot (a reload) is stale.
    public let boot: String
    public let room: Room
    public let paper: Bool
    public let dynTypeOn: Bool
    public let tokens: Tokens

    /// The page's choice of root (`renderCoach`): the connect screen with no key, else the hub. The chat on
    /// top is the `coach` piece's present/dismiss, never a route.
    public enum Route: Equatable, Sendable {
        case hub, connect
        /// A newer page's route: drawn with the hub's layout (meta, hero, groups, and the connect block when
        /// one is present), so a newer page never blanks the tab.
        case other(String)
    }

    public let route: Route
    /// The page will push the chat when Coach is next selected (a key is saved and setup is running, or a
    /// reply is in flight with the chat open). The shell's hold reads it (contract 8.1).
    public let resume: Bool
    public let meta: Meta
    public let hero: Hero
    /// The key field, the CTA, the help and the starter link; nil on the hub.
    public let connect: Connect?
    public let groups: [Group]
    /// Rows and groups that were left out: a row that is not an object, has no title or an action this build
    /// does not know; a group that is not an object or is left with no rows.
    public let skipped: Int

    public var appearance: Appearance { paper ? .light : .dark }

    public enum DecodeError: Error, Equatable, CustomStringConvertible {
        case notAnObject
        case version(Int?)

        public var description: String {
            switch self {
            case .notAnObject: return "the coach home model is not a JSON object"
            case .version(let v):
                return "coach home model v\(v.map(String.init) ?? "?") (this build reads v\(CoachHomeModel.version))"
            }
        }
    }

    /// From the JSON text the page sends (mended before decoding).
    public static func decode(_ text: String) throws -> CoachHomeModel {
        try CoachHomeModel(json: JSONText.parse(text))
    }

    /// From UTF-8 bytes (a fixture, a file).
    public static func decode(utf8 data: Data) throws -> CoachHomeModel {
        try CoachHomeModel(json: JSONText.parse(utf8: data))
    }

    public init(json: JSONValue) throws {
        guard json.object != nil else { throw DecodeError.notAnObject }
        guard let v = json["v"]?.int, v == CoachHomeModel.version else { throw DecodeError.version(json["v"]?.int) }
        self.v = v
        rev = json["rev"]?.int ?? 0
        boot = json["boot"]?.string ?? ""
        room = Room(id: json["room"]?.string ?? "heavyweight")
        paper = json["paper"]?.bool ?? room.isPaper ?? true
        dynTypeOn = json["dynTypeOn"]?.bool ?? true
        tokens = Tokens(room: room, paper: paper, overrides: json["tokens"])
        let connect = json["connect"].flatMap { $0.object == nil ? nil : Connect(json: $0) }
        self.connect = connect
        switch json["route"]?.string {
        case "hub": route = .hub
        case "connect": route = .connect
        case let r?: route = .other(r)
        case nil: route = connect == nil ? .hub : .connect
        }
        resume = json["resume"]?.bool ?? false
        meta = Meta(json: json["meta"])
        hero = Hero(json: json["hero"])
        var dropped = 0
        var groups: [Group] = []
        for raw in json["groups"]?.array ?? [] {
            guard raw.object != nil else { dropped += 1; continue }
            let rows = raw["rows"]?.array ?? []
            let kept = rows.compactMap(Row.init(json:))
            dropped += rows.count - kept.count
            guard !kept.isEmpty else { dropped += 1; continue }
            groups.append(Group(head: raw["head"]?.string ?? "", rows: kept))
        }
        self.groups = groups
        skipped = dropped
    }

    // MARK: Parts

    /// The meta row: "COACH · WK 06 / 12 · STRENGTH" and the owner's initial (nil when empty).
    public struct Meta: Equatable, Sendable {
        public let label: String
        public let avatar: String?

        init(json: JSONValue?) {
            label = json?["label"]?.string ?? ""
            avatar = json?["avatar"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        }
    }

    /// The headline block: greet, the title and its accent line (read together), the body.
    public struct Hero: Equatable, Sendable {
        public let greet: String
        public let title: String
        public let accent: String
        public let body: String

        init(json: JSONValue?) {
            greet = json?["greet"]?.string ?? ""
            title = json?["title"]?.string ?? ""
            accent = json?["accent"]?.string ?? ""
            body = json?["body"]?.string ?? ""
        }
    }

    /// The connect screen's controls. A missing string takes the web's own words, so a part a page leaves
    /// out never draws as an empty control.
    public struct Connect: Equatable, Sendable {
        /// The CTA: its label is the accessibility label, its title the value.
        public struct CTA: Equatable, Sendable {
            public let label: String
            public let title: String

            public init(label: String, title: String) {
                self.label = label
                self.title = title
            }
        }

        public struct Starter: Equatable, Sendable {
            public let label: String

            public init(label: String) { self.label = label }
        }

        /// The key field's label (its accessibility label too).
        public let label: String
        public let placeholder: String
        public let cta: CTA
        /// The web's two paragraphs joined by one "\n".
        public let help: String
        /// "No key? Build a starter plan instead →", only without a programme.
        public let starter: Starter?

        init(json: JSONValue) {
            label = json["label"]?.string ?? "Anthropic API Key"
            placeholder = json["placeholder"]?.string ?? "sk-ant-..."
            let cta = json["cta"]
            self.cta = CTA(label: cta?["label"]?.string ?? "CONNECT", title: cta?["title"]?.string ?? "Save key & start coaching")
            help = json["help"]?.string ?? ""
            starter = json["starter"].flatMap {
                $0.object == nil ? nil : Starter(label: $0["label"]?.string ?? "No key? Build a starter plan instead →")
            }
        }
    }

    /// A settings-style group of the hub: its head ("Conversation") and its rows.
    public struct Group: Equatable, Sendable {
        public let head: String
        public let rows: [Row]
    }

    /// One hub row. Its accessibility label is `title` and its value `sub`.
    public struct Row: Equatable, Sendable {
        public enum Action: String, Equatable, Sendable, CaseIterable {
            case openChat, startIntake, clearChat, disconnect
        }

        /// The row's glyph, drawn in the room's tokens; an icon this build does not know is nil (no glyph).
        public enum Icon: String, Equatable, Sendable, CaseIterable {
            case chat, programme, trash, disconnect
        }

        public let action: Action
        public let title: String
        public let sub: String?
        public let icon: Icon?

        /// Nil for a row that is not an object, has no title, or an action this build does not know.
        init?(json: JSONValue) {
            guard json.object != nil, let act = json["do"]?.string.flatMap(Action.init(rawValue:)),
                  let title = json["title"]?.string, !title.isEmpty else { return nil }
            action = act
            self.title = title
            sub = json["sub"]?.string.flatMap { $0.isEmpty ? nil : $0 }
            icon = json["icon"]?.string.flatMap(Icon.init(rawValue:))
        }
    }
}
