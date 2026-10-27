import Foundation

// The room tokens a native screen draws with (plan task C4; decision.md section 6, "Coach model v1").
//
// The page sends `tokens` in every model: colours, a type scale, spacing, radii and font families,
// so most polish ships by OTA. Every token has a compiled default for both rooms, taken from the
// page's THEMES and its room CSS (chatui/ui 02d710e; CLAUDE.md, "Look"): a model without tokens, or
// with a token missing or unreadable, still draws in the right room. Per-view layout metrics are not
// tokens (the decision rejected them): views keep their own geometry and read only these names.
//
// JSON (each group optional, each key optional; unknown keys are kept for a newer view, unreadable
// values are skipped and named in `rejected`):
//   "tokens": {
//     "color":  {"bg": "#f7f5ef", "accentSoft": "rgba(10,67,245,.10)", ...},   CSS colours
//     "type":   {"body": 15, ...},                                              points
//     "space":  {"gutter": 20, ...},                                            points
//     "radius": {"card": 14, ...},                                              points
//     "font":   {"body": "Archivo", ...}                                        family names
//   }

/// A room of the app: Heavyweight (paper, the default) or Lime (`dark` in the page). The rooms are
/// fixed in the page; an unknown id from a newer page draws on the defaults its `paper` flag names.
public enum Room: Equatable, Hashable, Sendable {
    case heavyweight
    case lime
    case other(String)

    /// From the page's room id (`kt_theme`): "heavyweight" or "dark".
    public init(id: String) {
        switch id {
        case "heavyweight": self = .heavyweight
        case "dark", "lime": self = .lime
        default: self = .other(id)
        }
    }

    /// The page's id for the room.
    public var id: String {
        switch self {
        case .heavyweight: return "heavyweight"
        case .lime: return "dark"
        case .other(let id): return id
        }
    }

    /// Heavyweight is the paper room (light); Lime is dark. Unknown rooms: nil, the model's
    /// `paper` decides.
    public var isPaper: Bool? {
        switch self {
        case .heavyweight: return true
        case .lime: return false
        case .other: return nil
        }
    }
}

/// The appearance the shell gives every native controller (`overrideUserInterfaceStyle`), from the
/// model's `paper`: keyboard, menus and pickers match the room, not the phone's setting.
public enum Appearance: String, Equatable, Sendable {
    case light
    case dark
}

/// An sRGB colour with alpha, each part 0...1. Reads the CSS the page writes.
public struct RGBA: Equatable, Hashable, Codable, Sendable {
    public var red: Double
    public var green: Double
    public var blue: Double
    public var alpha: Double

    public init(red: Double, green: Double, blue: Double, alpha: Double = 1) {
        self.red = Self.unit(red)
        self.green = Self.unit(green)
        self.blue = Self.unit(blue)
        self.alpha = Self.unit(alpha)
    }

    /// `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (commas or spaces, `/ alpha`,
    /// percentages), `color-mix(in srgb, a p%, b q%)`, `transparent`, `white`, `black`.
    /// Anything else (a `var(--x)` reference, another colour space) is nil.
    public init?(css raw: String) {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if s.hasPrefix("#") {
            guard let c = Self.hex(String(s.dropFirst())) else { return nil }
            self = c
        } else if s == "transparent" {
            self.init(red: 0, green: 0, blue: 0, alpha: 0)
        } else if s == "white" {
            self.init(red: 1, green: 1, blue: 1)
        } else if s == "black" {
            self.init(red: 0, green: 0, blue: 0)
        } else if let args = Self.call("rgba", s) ?? Self.call("rgb", s) {
            guard let c = Self.rgbFunction(args) else { return nil }
            self = c
        } else if let args = Self.call("color-mix", s) {
            guard let c = Self.colorMix(args) else { return nil }
            self = c
        } else {
            return nil
        }
    }

    /// `#rrggbb` when opaque, else `rgba(r,g,b,a)`.
    public var css: String {
        let r = Int((red * 255).rounded()), g = Int((green * 255).rounded()), b = Int((blue * 255).rounded())
        func hex2(_ v: Int) -> String { let s = String(v, radix: 16); return s.count < 2 ? "0" + s : s }
        if alpha >= 1 { return "#" + hex2(r) + hex2(g) + hex2(b) }
        let a = (alpha * 1000).rounded() / 1000
        return "rgba(\(r),\(g),\(b),\(a == a.rounded() ? String(Int(a)) : String(a)))"
    }

    /// CSS `color-mix(in srgb, a p, b)` with p in 0...1: premultiplied, as browsers mix.
    public static func mix(_ a: RGBA, _ p: Double, _ b: RGBA) -> RGBA {
        let q = 1 - p
        let alpha = a.alpha * p + b.alpha * q
        guard alpha > 0 else { return RGBA(red: 0, green: 0, blue: 0, alpha: 0) }
        func ch(_ x: Double, _ y: Double) -> Double { (x * a.alpha * p + y * b.alpha * q) / alpha }
        return RGBA(red: ch(a.red, b.red), green: ch(a.green, b.green), blue: ch(a.blue, b.blue), alpha: alpha)
    }

    private static func unit(_ x: Double) -> Double { x.isFinite ? min(max(x, 0), 1) : 0 }

    private static func hex(_ h: String) -> RGBA? {
        guard [3, 4, 6, 8].contains(h.count), h.allSatisfy(\.isHexDigit) else { return nil }
        let digits = h.count <= 4 ? h.map { "\($0)\($0)" }.joined() : h
        guard let v = UInt64(digits, radix: 16) else { return nil }
        let n = digits.count / 2
        func byte(_ i: Int) -> Double { Double((v >> UInt64(8 * (n - 1 - i))) & 0xFF) / 255 }
        return RGBA(red: byte(0), green: byte(1), blue: byte(2), alpha: n == 4 ? byte(3) : 1)
    }

    /// The text inside `name( … )` when `s` is exactly that call.
    private static func call(_ name: String, _ s: String) -> String? {
        guard s.hasPrefix(name + "("), s.hasSuffix(")") else { return nil }
        return String(s.dropFirst(name.count + 1).dropLast())
    }

    private static func number(_ t: Substring, percentOf full: Double) -> Double? {
        let s = t.trimmingCharacters(in: .whitespaces)
        if s.hasSuffix("%") { return Double(s.dropLast()).map { $0 / 100 * full } }
        return Double(s)
    }

    private static func rgbFunction(_ args: String) -> RGBA? {
        var body = Substring(args)
        var alphaPart: Substring?
        if let slash = body.firstIndex(of: "/") {
            alphaPart = body[body.index(after: slash)...]
            body = body[..<slash]
        }
        var parts = body.split(whereSeparator: { $0 == "," || $0 == " " }).filter { !$0.isEmpty }
        if alphaPart == nil, parts.count == 4 { alphaPart = parts.removeLast() }
        guard parts.count == 3 else { return nil }
        guard let r = number(parts[0], percentOf: 255), let g = number(parts[1], percentOf: 255),
              let b = number(parts[2], percentOf: 255) else { return nil }
        var a = 1.0
        if let ap = alphaPart {
            guard let v = number(ap, percentOf: 1) else { return nil }
            a = v
        }
        return RGBA(red: r / 255, green: g / 255, blue: b / 255, alpha: a)
    }

    /// `in srgb, <colour> [p%], <colour> [q%]`, split at the top-level commas.
    private static func colorMix(_ args: String) -> RGBA? {
        var parts: [String] = []
        var depth = 0
        var cur = ""
        for ch in args {
            if ch == "(" { depth += 1 }
            if ch == ")" { depth -= 1 }
            if ch == ",", depth == 0 { parts.append(cur); cur = "" } else { cur.append(ch) }
        }
        parts.append(cur)
        guard parts.count == 3, parts[0].trimmingCharacters(in: .whitespaces) == "in srgb" else { return nil }
        func colourAndShare(_ p: String) -> (RGBA, Double?)? {
            let t = p.trimmingCharacters(in: .whitespaces)
            if let sp = t.lastIndex(of: " "), t[t.index(after: sp)...].hasSuffix("%"),
               let pct = Double(t[t.index(after: sp)...].dropLast()) {
                guard let c = RGBA(css: String(t[..<sp])) else { return nil }
                return (c, pct / 100)
            }
            guard let c = RGBA(css: t) else { return nil }
            return (c, nil)
        }
        guard let (a, pa) = colourAndShare(parts[1]), let (b, pb) = colourAndShare(parts[2]) else { return nil }
        // CSS: one share missing is the rest of 100%; both missing is half and half; shares that do
        // not add up to 100% are scaled to it, and a sum under 100% thins the result's alpha.
        let p1 = pa ?? (pb.map { 1 - $0 } ?? 0.5)
        let p2 = pb ?? (1 - p1)
        let sum = p1 + p2
        guard sum > 0, p1 >= 0, p2 >= 0 else { return nil }
        var mixed = mix(a, p1 / sum, b)
        if sum < 1 { mixed.alpha *= sum }
        return mixed
    }
}

/// The colours a native screen reads: the room palette (THEMES, camel-cased) and the chat's roles where
/// the two rooms paint one element differently (the room CSS), so OTA can repaint them too.
public enum ColorToken: String, CaseIterable, Sendable {
    // palette (THEMES)
    case bg, card, card2, border, text, muted, lite
    case accent, accentSoft, accentDim, accentInk, onAccent
    case earned, earnedInk, satAccent
    case green, yellow, red, orange, cyan, purple
    case sel, blkLift, blkRun, blkSport
    // chat roles
    case eyebrow             // COACH eyebrow over a reply
    case headDot             // the header's online dot
    case userBubble, onUserBubble
    case chipPrimary, chipPrimaryText, chipPrimaryBorder
    case pill, pillIcon      // tool pills (a failed pill is `red`)
    case takeEyebrow         // TAKEAWAY
    case ledgerHead          // PLAN CHANGES
    case deltaGood, deltaWarn
    case progAction          // the empty chat's programme buttons
    case composerFocus       // the composer's focus ring
}

/// The type scale, in points at the large (default) text size: the chat's 26 sizes (the same in both rooms)
/// and the Coach tab's 16 `home*` sizes (per room, contract 6.2). The page sends both in `tokens.type`: the
/// chat's in every model, the hub's only in CoachHomeModel (never in CoachModel, which stays byte-identical).
public enum TypeToken: String, CaseIterable, Sendable {
    // the chat (CoachModel)
    case title, headEyebrow, headMeta, model
    case body, bubble, heading, eyebrow
    case metricLabel, metricValue, metricRef, take
    case chip, pill, note, day
    case ledgerHead, ledgerRow, ledgerNote, button
    case table, tableHead, composer, thinking
    case emptyTitle, emptySub
    // the Coach tab's hub and connect screen (CoachHomeModel)
    case homeMeta, homeAvatar, homeGreet
    case homeTitle       // the headline clamp's max
    case homeTitleMin    // the headline clamp's min
    case homeBody, homeGroupHead, homeRowTitle, homeRowSub
    case homeFieldLabel, homeField, homeCtaLabel, homeCtaTitle, homeCtaArrow, homeHelp, homeLink

    /// The chat's sizes: the keys of the page's `_COACH_TOKENS.type` and of every CoachModel.
    public static let chat: [TypeToken] = allCases.filter { !$0.isHome }
    /// The hub's sizes: added to `tokens.type` in CoachHomeModel only.
    public static let home: [TypeToken] = allCases.filter(\.isHome)

    public var isHome: Bool { rawValue.hasPrefix("home") }
}

/// Spacing, in points.
public enum SpaceToken: String, CaseIterable, Sendable {
    case gutter, messageGap, turnGap, blockGap, sectionGap, paragraphGap, listItemGap
    case cardPadH, cardPadV, metricPadV, bubblePadH, bubblePadV
    case chipPadH, chipPadV, chipGap, pillGap, pillPadH, pillPadV, composerPad, hit
}

/// Corner radii, in points.
public enum RadiusToken: String, CaseIterable, Sendable {
    case card, bubble, bubbleTail, chip, pill, composer, send, button, code, photo, table
}

/// Font families by role (the faces FPUI registers): Heavyweight has no monospace, so `mono` is
/// Archivo there with tabular figures.
public enum FontToken: String, CaseIterable, Sendable {
    case body, eyebrow, display, mono
}

/// The tokens of one room: compiled defaults with the page's overrides on top.
public struct Tokens: Equatable, Sendable {
    public let room: Room
    public private(set) var colors: [String: RGBA]
    public private(set) var sizes: [String: Double]
    public private(set) var spaces: [String: Double]
    public private(set) var radii: [String: Double]
    public private(set) var fonts: [String: String]
    /// Overrides that were not applied ("color.bg: zz"), for the log. Never shown to the owner.
    public private(set) var rejected: [String] = []

    public func color(_ token: ColorToken) -> RGBA { colors[token.rawValue] ?? Self.fallback.colors[token.rawValue]! }
    /// Points at the large text size; views scale it with the clamped system size (TextSize).
    public func size(_ token: TypeToken) -> Double { sizes[token.rawValue] ?? Self.fallback.sizes[token.rawValue]! }
    public func space(_ token: SpaceToken) -> Double { spaces[token.rawValue] ?? Self.fallback.spaces[token.rawValue]! }
    public func radius(_ token: RadiusToken) -> Double { radii[token.rawValue] ?? Self.fallback.radii[token.rawValue]! }
    public func font(_ token: FontToken) -> String { fonts[token.rawValue] ?? Self.fallback.fonts[token.rawValue]! }

    /// The compiled defaults of a room. An unknown room takes Heavyweight's unless `paper` is false.
    public static func defaults(for room: Room, paper: Bool? = nil) -> Tokens {
        let base: Tokens
        switch room {
        case .heavyweight: base = heavyweight
        case .lime: base = lime
        case .other: base = (paper ?? true) ? heavyweight : lime
        }
        return Tokens(room: room, colors: base.colors, sizes: base.sizes, spaces: base.spaces, radii: base.radii, fonts: base.fonts)
    }

    /// The room's defaults with the model's `tokens` object applied.
    public init(room: Room, paper: Bool? = nil, overrides: JSONValue?) {
        self = Tokens.defaults(for: room, paper: paper)
        guard let overrides else { return }
        guard let groups = overrides.object else {
            if !overrides.isNull { rejected.append("tokens: not an object") }
            return
        }
        for (group, value) in groups.sorted(by: { $0.key < $1.key }) {
            guard let entries = value.object else {
                if ["color", "type", "space", "radius", "font"].contains(group) { rejected.append("\(group): not an object") }
                continue
            }
            for (key, v) in entries.sorted(by: { $0.key < $1.key }) {
                switch group {
                case "color":
                    if let s = v.string, let c = RGBA(css: s) { colors[key] = c } else { rejected.append("color.\(key)") }
                case "type":
                    if let n = v.double, (4...96).contains(n) { sizes[key] = n } else { rejected.append("type.\(key)") }
                case "space":
                    if let n = v.double, (0...200).contains(n) { spaces[key] = n } else { rejected.append("space.\(key)") }
                case "radius":
                    if let n = v.double, (0...200).contains(n) { radii[key] = n } else { rejected.append("radius.\(key)") }
                case "font":
                    if let s = v.string?.trimmingCharacters(in: .whitespaces), !s.isEmpty, s.count <= 80 { fonts[key] = s } else { rejected.append("font.\(key)") }
                default:
                    break   // a group a newer page added: nothing here reads it
                }
            }
        }
    }

    private init(room: Room, colors: [String: RGBA], sizes: [String: Double], spaces: [String: Double],
                 radii: [String: Double], fonts: [String: String]) {
        self.room = room
        self.colors = colors
        self.sizes = sizes
        self.spaces = spaces
        self.radii = radii
        self.fonts = fonts
    }

    // MARK: Compiled defaults

    private static func table(_ pairs: [ColorToken: String]) -> [String: RGBA] {
        var out: [String: RGBA] = [:]
        for (k, css) in pairs { out[k.rawValue] = RGBA(css: css)! }
        return out
    }

    /// The chat's type scale: the same in both rooms (chatui's CSS sizes).
    private static let typeScale: [String: Double] = [
        TypeToken.title: 22, .headEyebrow: 10, .headMeta: 10, .model: 11,
        .body: 15, .bubble: 15, .heading: 16, .eyebrow: 9,
        .metricLabel: 10, .metricValue: 13, .metricRef: 12, .take: 14,
        .chip: 13, .pill: 12, .note: 13, .day: 10,
        .ledgerHead: 9, .ledgerRow: 13, .ledgerNote: 11, .button: 13,
        .table: 13, .tableHead: 10, .composer: 16, .thinking: 13,
        .emptyTitle: 22, .emptySub: 14,
    ].reduce(into: [:]) { $0[$1.key.rawValue] = $1.value }

    /// The hub's sizes at the large text size, from the room CSS (contract 6.2's table; index.html at 91708ae):
    /// meta 1505 (Heavyweight's face 1922), avatar 683, greet 1914 / 1515, the headline clamp 1905 / 1516, body
    /// 1915 / 1522, group head 1561, rows 1563-1564, field label 1549, the field's inline 16 px 21107, the CTA
    /// 1545-1547, help and link inline 21116 / 21119. Heavyweight's group head and CTA label are 10, not 1561's and
    /// 1545's 9: a later top-level rule of the room, 2045-2046 (`.settings-group-hd`, `.kt-cta-label` 10 px), which
    /// contract 6.2's table left out; its field label stays 9 (no rule of the room sizes `.field label`). The
    /// headline's viewport factor (17 % / 13.25 %), Lime's 41 pt headline at <= 360 pt and its 16 pt gutter there are
    /// view geometry, not tokens.
    private static let homeScaleHeavyweight: [String: Double] = [
        TypeToken.homeMeta: 10, .homeAvatar: 13, .homeGreet: 15, .homeTitle: 74, .homeTitleMin: 54, .homeBody: 15,
        .homeGroupHead: 10, .homeRowTitle: 14, .homeRowSub: 11.5, .homeFieldLabel: 9, .homeField: 16,
        .homeCtaLabel: 10, .homeCtaTitle: 18, .homeCtaArrow: 22, .homeHelp: 12, .homeLink: 14,
    ].reduce(into: [:]) { $0[$1.key.rawValue] = $1.value }

    private static let homeScaleLime: [String: Double] = [
        TypeToken.homeMeta: 10, .homeAvatar: 13, .homeGreet: 14, .homeTitle: 56, .homeTitleMin: 43, .homeBody: 14,
        .homeGroupHead: 9, .homeRowTitle: 14, .homeRowSub: 11.5, .homeFieldLabel: 9, .homeField: 16,
        .homeCtaLabel: 9, .homeCtaTitle: 18, .homeCtaArrow: 22, .homeHelp: 12, .homeLink: 14,
    ].reduce(into: [:]) { $0[$1.key.rawValue] = $1.value }

    private static let spacing: [String: Double] = [
        SpaceToken.gutter: 20, .messageGap: 8, .turnGap: 20, .blockGap: 10, .sectionGap: 12, .paragraphGap: 10, .listItemGap: 6,
        .cardPadH: 14, .cardPadV: 12, .metricPadV: 10, .bubblePadH: 16, .bubblePadV: 12,
        .chipPadH: 16, .chipPadV: 10, .chipGap: 8, .pillGap: 6, .pillPadH: 10, .pillPadV: 5, .composerPad: 6, .hit: 44,
    ].reduce(into: [:]) { $0[$1.key.rawValue] = $1.value }

    private static func radiusTable(composer: Double, send: Double) -> [String: Double] {
        [RadiusToken.card: 14, .bubble: 16, .bubbleTail: 5, .chip: 22, .pill: 12, .composer: composer, .send: send,
         .button: 12, .code: 5, .photo: 10, .table: 14].reduce(into: [:]) { $0[$1.key.rawValue] = $1.value }
    }

    /// Heavyweight: paper #f7f5ef, blue #0a43f5 the action, lime #b7f000 / ink #4f7000 the earned
    /// state, Anton display and Archivo body on flat white cards.
    public static let heavyweight = Tokens(
        room: .heavyweight,
        colors: table([
            .bg: "#f7f5ef", .card: "#ffffff", .card2: "#efece4", .border: "rgba(15,15,15,.10)",
            .text: "#0f0f0f", .muted: "#6b6b66", .lite: "#3f3f3a",
            .accent: "#0a43f5", .accentSoft: "rgba(10,67,245,.10)", .accentDim: "rgba(10,67,245,.06)",
            .accentInk: "#0a43f5", .onAccent: "#ffffff",
            .earned: "#b7f000", .earnedInk: "#4f7000", .satAccent: "#4d7cff",
            .green: "#4f7000", .yellow: "#4f7000", .red: "#dc2626", .orange: "#ea580c", .cyan: "#0a43f5", .purple: "#0a43f5",
            .sel: "rgba(10,67,245,.10)", .blkLift: "#0a43f5", .blkRun: "#16a34a", .blkSport: "#7c3aed",
            .eyebrow: "#0a43f5", .headDot: "#0a43f5",
            .userBubble: "#0a43f5", .onUserBubble: "#ffffff",
            .chipPrimary: "#0a43f5", .chipPrimaryText: "#ffffff", .chipPrimaryBorder: "#0a43f5",
            .pill: "#ffffff", .pillIcon: "#4f7000",
            .takeEyebrow: "#0a43f5", .ledgerHead: "#0a43f5",
            .deltaGood: "#4f7000", .deltaWarn: "color-mix(in srgb, #ea580c 80%, #0f0f0f)",
            .progAction: "#0a43f5", .composerFocus: "#0a43f5",
        ]),
        sizes: typeScale.merging(homeScaleHeavyweight) { $1 },
        spaces: spacing,
        radii: radiusTable(composer: 16, send: 12),
        fonts: [FontToken.body.rawValue: "Archivo", FontToken.eyebrow.rawValue: "Archivo",
                FontToken.display.rawValue: "Anton", FontToken.mono.rawValue: "Archivo"])

    /// Lime (`dark`): the green-and-black Studio; neutral greys, the lime only for the action and the
    /// earned state, selections in `sel`.
    public static let lime = Tokens(
        room: .lime,
        colors: table([
            .bg: "#0b0b0c", .card: "#151517", .card2: "#1e1e21", .border: "rgba(255,255,255,.08)",
            .text: "#f4f4f1", .muted: "#8c8c91", .lite: "#b9b9be",
            .accent: "#d8ff63", .accentSoft: "rgba(216,255,99,.12)", .accentDim: "rgba(216,255,99,.06)",
            .accentInk: "#d8ff63", .onAccent: "#0b0b0c",
            .earned: "#d8ff63", .earnedInk: "#d8ff63", .satAccent: "#d8ff63",
            .green: "#d8ff63", .yellow: "#ffd65a", .red: "#ff5d55", .orange: "#ff9d5c", .cyan: "#69cfff", .purple: "#ad92ff",
            .sel: "color-mix(in srgb, #f4f4f1 15%, #151517)", .blkLift: "#4d7cff", .blkRun: "#22a55a", .blkSport: "#8b5cf6",
            .eyebrow: "#8c8c91", .headDot: "#8c8c91",
            .userBubble: "color-mix(in srgb, #f4f4f1 15%, #151517)", .onUserBubble: "#f4f4f1",
            .chipPrimary: "#1e1e21", .chipPrimaryText: "#f4f4f1", .chipPrimaryBorder: "rgba(255,255,255,.08)",
            .pill: "#1e1e21", .pillIcon: "#b9b9be",
            .takeEyebrow: "#8c8c91", .ledgerHead: "#8c8c91",
            .deltaGood: "#d8ff63", .deltaWarn: "#ff9d5c",
            .progAction: "#b9b9be", .composerFocus: "#b9b9be",
        ]),
        sizes: typeScale.merging(homeScaleLime) { $1 },
        spaces: spacing,
        radii: radiusTable(composer: 20, send: 22),
        fonts: [FontToken.body.rawValue: "Inter", FontToken.eyebrow.rawValue: "JetBrains Mono",
                FontToken.display.rawValue: "Inter", FontToken.mono.rawValue: "JetBrains Mono"])

    /// Where a subscript looks when a token is missing from a room's tables (never, for the known ones).
    private static let fallback = heavyweight
}

/// The system text size, as SwiftUI's DynamicTypeSize steps, and the chat's clamp: with the app's
/// Dynamic Type toggle on (`dynTypeOn`) the system size within large...xxLarge (about 1.24x, the
/// page's 125% cap), with it off always large (decision.md section 10, platform critic 9).
public enum TextSize: Int, CaseIterable, Comparable, Sendable {
    case xSmall, small, medium, large, xLarge, xxLarge, xxxLarge
    case accessibility1, accessibility2, accessibility3, accessibility4, accessibility5

    public static func < (a: TextSize, b: TextSize) -> Bool { a.rawValue < b.rawValue }

    /// The size the chat draws at for this system size.
    public func clamped(dynTypeOn: Bool) -> TextSize {
        dynTypeOn ? min(max(self, .large), .xxLarge) : .large
    }

    /// From a UIContentSizeCategory raw value ("UICTContentSizeCategoryL").
    public init?(contentSizeCategory raw: String) {
        let names: [String: TextSize] = [
            "XS": .xSmall, "S": .small, "M": .medium, "L": .large, "XL": .xLarge, "XXL": .xxLarge, "XXXL": .xxxLarge,
            "AccessibilityM": .accessibility1, "AccessibilityL": .accessibility2, "AccessibilityXL": .accessibility3,
            "AccessibilityXXL": .accessibility4, "AccessibilityXXXL": .accessibility5,
        ]
        let prefix = "UICTContentSizeCategory"
        guard raw.hasPrefix(prefix), let size = names[String(raw.dropFirst(prefix.count))] else { return nil }
        self = size
    }
}
