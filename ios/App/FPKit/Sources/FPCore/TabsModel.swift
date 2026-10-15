import Foundation

// Tabs model v1 (build 61, contract 6.1): what the native tab bar wears, built by the page
// (`_tabsModel(rev)`) and sent as `model {screen:'tabs', rev, json}` with json = _nativeJSON(model).
//
//   {
//     "v": 1, "rev": 12, "boot": "b1760…-ab12",
//     "room": "heavyweight", "paper": true,       paper: the bar's (and the Coach tab's) appearance
//     "tint": "#0a43f5",                          the selected item, as the web bar draws it
//     "idle": "#6b6b66",                          the room's --muted
//     "items": [{"id": "log", "title": "Log", "a11y": "Log"}, …]     the four fixed ids
//   }
//
// Decoding is tolerant, as CoachModel's (contract 6, D25): only `v` is required and must be 1 (the
// model's own version, never FP_CONTRACT); unknown fields are ignored (a later `items[].badge`
// included); an item with an unknown id, or one that is not an object, is dropped; a missing item
// keeps its compiled title and label; an unreadable colour keeps the room's compiled one. The order
// of the bar and its glyphs are the shell's, never the page's: `items` always holds the four ids in
// `TabsModel.ids` order. Each bar item's accessibility label is exactly its `a11y` (the tools find a
// tab by it, T-G11).

/// The model of the native tab bar.
public struct TabsModel: Equatable, Sendable {
    public static let version = 1

    /// The four tabs, in the bar's order (the web bar's, `index.html` `<nav id="tabs">`).
    public static let ids = ["log", "progress", "coach", "settings"]

    /// One bar item: its fixed id, its title under the glyph, and its accessibility label.
    public struct Item: Equatable, Sendable {
        public var id: String
        public var title: String
        public var a11y: String

        public init(id: String, title: String, a11y: String) {
            self.id = id
            self.title = title
            self.a11y = a11y
        }
    }

    public var v: Int
    /// Rises with every model the page builds in one boot: an older rev never replaces a newer one.
    public var rev: Int
    /// The page's boot id: a model from another boot (a reload) is stale.
    public var boot: String
    public var room: Room
    /// Sets `overrideUserInterfaceStyle` on the tab bar and the Coach tab's controllers only (6.1).
    public var paper: Bool
    /// The selected item's colour.
    public var tint: RGBA
    /// The other items' colour.
    public var idle: RGBA
    /// Always the four ids of `TabsModel.ids`, in that order.
    public var items: [Item]
    /// What the decode left out or replaced ("items[2]: unknown id", "tint"), for the log. Never shown.
    public var rejected: [String]

    public var appearance: Appearance { paper ? .light : .dark }

    /// The item with this id.
    public func item(_ id: String) -> Item? { items.first { $0.id == id } }

    public enum DecodeError: Error, Equatable, CustomStringConvertible {
        case notAnObject
        case version(Int?)

        public var description: String {
            switch self {
            case .notAnObject: return "the tabs model is not a JSON object"
            case .version(let v): return "tabs model v\(v.map(String.init) ?? "?") (this build reads v\(TabsModel.version))"
            }
        }
    }

    // MARK: Compiled defaults

    /// The web bar's titles and labels (`index.html` `<nav id="tabs">`: aria-label = the title).
    static let compiledTitles: [String: String] = [
        "log": "Log", "progress": "Progress", "coach": "Coach", "settings": "Settings",
    ]

    /// Heavyweight: the selected tab in `--accent` blue, the others `--muted`.
    public static let heavyweightTint = RGBA(css: "#0a43f5")!
    public static let heavyweightIdle = RGBA(css: "#6b6b66")!
    /// Lime: the neutral selection in `--text` (the lime is only the action and the earned state),
    /// the others `--muted`.
    public static let limeTint = RGBA(css: "#f4f4f1")!
    public static let limeIdle = RGBA(css: "#8c8c91")!

    /// The compiled items: the four ids with the web's titles and labels.
    public static var defaultItems: [Item] {
        ids.map { Item(id: $0, title: compiledTitles[$0]!, a11y: compiledTitles[$0]!) }
    }

    /// What the bar wears before the first model (the first frame, a reloaded document before its
    /// hello). An unknown room takes Heavyweight's colours unless `paper` is false, as Tokens does.
    public static func defaults(for room: Room, paper: Bool? = nil) -> TabsModel {
        let isPaper = paper ?? room.isPaper ?? true
        let lime: Bool
        switch room {
        case .heavyweight: lime = false
        case .lime: lime = true
        case .other: lime = !isPaper
        }
        return TabsModel(v: version, rev: 0, boot: "", room: room, paper: isPaper,
                         tint: lime ? limeTint : heavyweightTint, idle: lime ? limeIdle : heavyweightIdle,
                         items: defaultItems, rejected: [])
    }

    public init(v: Int, rev: Int, boot: String, room: Room, paper: Bool, tint: RGBA, idle: RGBA, items: [Item], rejected: [String]) {
        self.v = v
        self.rev = rev
        self.boot = boot
        self.room = room
        self.paper = paper
        self.tint = tint
        self.idle = idle
        self.items = items
        self.rejected = rejected
    }

    // MARK: Decoding

    /// From the JSON text the page sends (lone surrogates mended before decoding).
    public static func decode(_ text: String) throws -> TabsModel {
        try TabsModel(json: JSONText.parse(text))
    }

    /// From UTF-8 bytes (a fixture, a file).
    public static func decode(utf8 data: Data) throws -> TabsModel {
        try TabsModel(json: JSONText.parse(utf8: data))
    }

    public init(json: JSONValue) throws {
        guard json.object != nil else { throw DecodeError.notAnObject }
        guard let v = json["v"]?.int, v == TabsModel.version else { throw DecodeError.version(json["v"]?.int) }
        let room = Room(id: json["room"]?.string ?? "heavyweight")
        let base = TabsModel.defaults(for: room, paper: json["paper"]?.bool)
        var rejected: [String] = []

        func colour(_ key: String, _ fallback: RGBA) -> RGBA {
            guard let raw = json[key], !raw.isNull else { return fallback }
            if let s = raw.string, let c = RGBA(css: s) { return c }
            rejected.append(key)
            return fallback
        }

        let tint = colour("tint", base.tint)
        let idle = colour("idle", base.idle)
        var given: [String: Item] = [:]
        for (i, raw) in (json["items"]?.array ?? []).enumerated() {
            guard raw.object != nil else { rejected.append("items[\(i)]: not an object"); continue }
            guard let id = raw["id"]?.string, let compiled = TabsModel.compiledTitles[id] else {
                rejected.append("items[\(i)]: unknown id")
                continue
            }
            guard given[id] == nil else { rejected.append("items[\(i)]: \(id) again"); continue }
            let title = raw["title"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? compiled
            let a11y = raw["a11y"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? compiled
            given[id] = Item(id: id, title: title, a11y: a11y)
        }

        self.init(v: v, rev: json["rev"]?.int ?? 0, boot: json["boot"]?.string ?? "", room: room, paper: base.paper,
                  tint: tint, idle: idle,
                  items: base.items.map { given[$0.id] ?? $0 }, rejected: rejected)
    }
}
