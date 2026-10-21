#if os(iOS)
import CoreText
import SwiftUI
import UIKit
import FPCore

// The native Coach tab's root (build 61; contract 6.2, 8.3, 15.2; plan task N7): FPCore's CoachHomeModel drawn as the
// web draws its Coach tab (renderCoach, index.html at 91708ae: 21074-21214), the hub with its groups of rows or the
// connect screen with the key field, in the model's room at the chat's clamped text size. Every string is the page's;
// nothing here decides what a row says, when it shows or whether a key is good (the page's `sk-ant-` check runs when
// `coachHome.setKey` arrives). The view sends actions, never intents: its host (N8's CoachHomeStore) maps them through
// CoachHomeModel's intent map (N6), so this file needs no intent case.
//
// The key the owner types lives only in the connect block's `@State` (contract 5, K5): never CoachComposerDraft,
// @AppStorage, @SceneStorage, UserDefaults or a file, and it leaves the view only inside `.connect(secret:)`, whose
// printed forms show it as •••.

/// What the hub or the connect screen asks of its host: a row, CONNECT (or Return in the key field) with what the
/// field holds, the starter link. Printed (`description`, `debugDescription`, `dump`, an XCTest failure message), the
/// secret shows as •••, as Intent prints it (contract 5, K4).
public enum CoachHomeAction: Equatable, Sendable {
    /// A hub row: the host sends its intent (`Row.Action.intent`, `coachHome.<do>`).
    case row(CoachHomeModel.Row.Action)
    /// CONNECT or Return in the key field: exactly what the field holds, untrimmed (the page trims and checks it,
    /// contract 5 K6). The host sends `coachHome.setKey {secret}` once.
    case connect(secret: String)
    /// The starter link ("No key? Build a starter plan instead →"): `coachHome.openStarter`.
    case starter
}

extension CoachHomeAction: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    static let redacted = "•••"

    public var description: String {
        switch self {
        case .row(let action): return "row(\(action.rawValue))"
        case .connect: return "connect(secret: \(Self.redacted))"
        case .starter: return "starter"
        }
    }

    public var debugDescription: String { "CoachHomeAction." + description }

    public var customMirror: Mirror {
        switch self {
        case .row(let action): return Mirror(self, children: ["row": action.rawValue], displayStyle: .enum)
        case .connect: return Mirror(self, children: ["connect": "secret: " + Self.redacted], displayStyle: .enum)
        case .starter: return Mirror(self, children: [Mirror.Child](), displayStyle: .enum)
        }
    }
}

/// What the hub needs from whoever hosts it (N8's CoachHomeStore; previews and tests fill it themselves).
public struct CoachHomeHost {
    /// Every press: a row, CONNECT (or Return), the starter link.
    public var act: (CoachHomeAction) -> Void
    /// A `coachHome.setKey` is out: CONNECT and Return do nothing until it is answered (no second key overlaps).
    public var connecting: Bool
    /// Whether the key field holds text, reported when that changes (true once typed into, false once emptied or
    /// once the model's route leaves the connect screen, which empties it) and when a field appears empty (a new one):
    /// a flag for the store's `describe()`, never the text. A field that appears holding text says nothing (it was
    /// reported when typed into). When the whole view goes (no model), nothing is reported: the store's own reset says
    /// the field is gone.
    public var fieldTyped: (Bool) -> Void
    /// The key field's generation: the connect block, and the field with what it holds, is made anew whenever it
    /// changes, as it is when the route changes. A host bumps it where the field must go though SwiftUI may never draw
    /// the model that took it away (the store: a hub model and the next connect model handled in one turn of the main
    /// queue are drawn as one, and K5's text must clear all the same); 0 for a host that never does (previews, tests).
    public var fieldGeneration: Int

    public init(act: @escaping (CoachHomeAction) -> Void, connecting: Bool = false, fieldTyped: @escaping (Bool) -> Void = { _ in },
                fieldGeneration: Int = 0) {
        self.act = act
        self.connecting = connecting
        self.fieldTyped = fieldTyped
        self.fieldGeneration = fieldGeneration
    }

    /// A host that does nothing (previews).
    public static let inert = CoachHomeHost(act: { _ in })
}

/// Where the hub's meta row ends, in global (window) coordinates (contract 8.3, N-G10): the host's toast goes under
/// it while the hub or the connect screen is on top, as it goes under the chat's header (`CoachHeaderBottomKey`). The
/// row scrolls with the hub, so the value follows it while the row's bottom lies at or below the safe area's top; once
/// the row has gone under the status bar the value is 0, never a point inside the status bar's band, so a host that
/// reads `y > 0 ? y : nil` (ScreenHost, for the chat's header) anchors under the status bar. Every scroll step inside
/// the band where the row is still on screen publishes a new value (the row moves).
public struct HubHeaderBottomKey: PreferenceKey {
    public static let defaultValue: CGFloat = 0
    public static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }

    /// What the meta row publishes: its bottom while it lies at or below `safeTop` (the safe area's top in window
    /// coordinates; nil for the unscrolled column, which never moves), else 0.
    static func value(bottom: CGFloat, safeTop: CGFloat?) -> CGFloat {
        guard let safeTop else { return max(0, bottom) }
        return bottom >= safeTop ? bottom : 0
    }
}

/// What VoiceOver hears on the hub and the connect screen (contract 6.2's names, which the tools press by, T-G11):
/// the page's own strings, exactly. A row is one button, label its title and value its sub; the CTA one button, label
/// its label and value its title; the key field is labelled with the field's label (the visible label above it is
/// hidden, so it is never read twice); the headline is one header that reads the greet, the title and the accent
/// together.
public enum CoachHomeSpeech {
    /// The meta row's label, as the page wrote it (Heavyweight draws it in caps).
    public static func meta(_ meta: CoachHomeModel.Meta) -> String { meta.label }

    /// The headline element: the greet, the title and the accent read together ("Hi Kalani. Coach ready."), the empty
    /// ones left out.
    public static func headline(_ hero: CoachHomeModel.Hero) -> String {
        [hero.greet, hero.title, hero.accent].filter { !$0.isEmpty }.joined(separator: " ")
    }

    public static func body(_ hero: CoachHomeModel.Hero) -> String { hero.body }

    /// A group's head (a header), as the page wrote it (drawn in caps).
    public static func groupHead(_ group: CoachHomeModel.Group) -> String { group.head }

    public static func rowLabel(_ row: CoachHomeModel.Row) -> String { row.title }

    /// The row's sub ("3 exchanges · Push day went well…"); nil when the row has none.
    public static func rowValue(_ row: CoachHomeModel.Row) -> String? { row.sub }

    /// The key field's label (the visible label above the field is hidden from VoiceOver).
    public static func field(_ connect: CoachHomeModel.Connect) -> String { connect.label }

    public static func ctaLabel(_ connect: CoachHomeModel.Connect) -> String { connect.cta.label }

    public static func ctaValue(_ connect: CoachHomeModel.Connect) -> String { connect.cta.title }

    /// The help: one element, both paragraphs (the "\n" between them read as a pause).
    public static func help(_ connect: CoachHomeModel.Connect) -> String { connect.help }

    public static func starter(_ starter: CoachHomeModel.Connect.Starter) -> String { starter.label }
}

extension RoomTheme {
    /// The coach home model's room at the system size, clamped as the app's toggle says: the chat's clamp
    /// (large...xxLarge with `dynTypeOn`, the web zoom's factor 1, 1.12, 1.24), as `RoomTheme(model:system:)` reads a
    /// CoachModel.
    public init(home model: CoachHomeModel, system: DynamicTypeSize) {
        let (size, _) = ChatType.clamp(system, dynTypeOn: model.dynTypeOn)
        self.init(tokens: model.tokens, paper: model.paper, textSize: size)
    }

    /// A `home*` size in CSS px at the large size (PlainText and `uiFont` scale it).
    func home(_ token: TypeToken) -> CGFloat { CGFloat(tokens.size(token)) }
}

/// How the hub lays out (tests and contact sheets; the tab always scrolls).
struct CoachHomeOptions: Equatable {
    /// When set, the whole column at its natural height and this width, with no scroll view: a full-page render, and
    /// the accessibility elements a test can walk (SwiftUI vends no elements inside a scroll view to a test host that
    /// has no accessibility client, while the column's own elements and their order are the same either way).
    var unscrolledWidth: CGFloat?
}

/// The native Coach tab's root: the hub (meta row, headline, groups of rows) or the connect screen (meta row,
/// headline, the key field, CONNECT, the help, the starter link), in the model's room whatever the phone's
/// appearance, at the system text size clamped as the app's toggle says. An unknown route (a newer page's) draws the
/// hub's layout with the connect block after the groups when the model has one (contract 6.2, N-G15). The hub shows no
/// model switch and no usage line (contract 4.1, D26).
///
/// One vertical scroll view on the room's ground: the content starts under the status bar and ends at the bottom
/// safe area (the tab bar), so it scrolls under the glass; the system's scroll-edge look stays (contract 7.4). Nothing
/// here takes the focus: only the owner's tap puts the keys on the key field.
///
/// VoiceOver reads the web's order (contract 6.2, D45): the meta label, the headline, the body, then each group's
/// head and its rows; on the connect screen the key field, CONNECT, the help and the starter link after the body. The
/// views are declared in that order and no sort priority is set anywhere (CoachHomeViewTests walks it).
public struct CoachHomeView: View {
    let model: CoachHomeModel
    let host: CoachHomeHost
    let options: CoachHomeOptions

    @Environment(\.dynamicTypeSize) private var systemSize

    public init(model: CoachHomeModel, host: CoachHomeHost) {
        self.init(model: model, host: host, options: CoachHomeOptions())
    }

    init(model: CoachHomeModel, host: CoachHomeHost, options: CoachHomeOptions) {
        self.model = model
        self.host = host
        self.options = options
    }

    public var body: some View {
        let theme = RoomTheme(home: model, system: systemSize)
        Group {
            if let width = options.unscrolledWidth {
                column(theme, width: width, safeTop: nil)
            } else {
                GeometryReader { geo in
                    // the safe area's top in window coordinates, where a meta row's bottom above it is under the status
                    // bar: the reader keeps the safe area, so its frame starts there (the scroll view reaches past it to
                    // the screen's edges and insets its content by as much; the proxy's safeAreaInsets repeats the
                    // inset its frame already starts below, probed on iOS 27.0 with window and padded safe areas alike)
                    let safeTop = geo.frame(in: .global).minY
                    ScrollView(.vertical) {
                        column(theme, width: geo.size.width, safeTop: safeTop)
                    }
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                }
            }
        }
        .background(theme.color(.bg).ignoresSafeArea())
        // outermost, so everything in the column draws in the room
        .environment(\.roomTheme, theme)
        .environment(\.colorScheme, theme.colorScheme)
        .dynamicTypeSize(ChatType.range(dynTypeOn: model.dynTypeOn))
        // the connect block is made anew when its route changes: the field it held is gone (a new one says it is empty
        // when it appears, as does one made anew for the host's next field generation)
        .onChange(of: Self.connectKey(model)) { old, _ in if old != nil { host.fieldTyped(false) } }
    }

    // MARK: Geometry (the web's media queries read the screen's own width; the lengths they pick scale with the text)

    /// The column's side gutter in points: 20 px, 16 px at widths of 360 pt or less (`index.html:1580-1581`).
    static func gutter(_ t: RoomTheme, width: CGFloat) -> CGFloat { t.px(width <= 360 ? 16 : 20) }

    /// The headline's size in CSS px (scaled with the text like every length): Heavyweight clamp(homeTitleMin, 17vw,
    /// homeTitle) (`1905`); Lime clamp(homeTitleMin, 13.25vw, homeTitle), 41 px at widths of 360 pt or less (`1516`,
    /// `1585`). The viewport factors and the narrow size are view geometry, not tokens (contract 6.2).
    static func headlineSize(_ t: RoomTheme, width: CGFloat) -> CGFloat {
        if t.flavor == .studio, width <= 360 { return 41 }
        let vw = (t.flavor == .paper ? 0.17 : 0.1325) * width
        return min(max(t.home(.homeTitleMin), vw), t.home(.homeTitle))
    }

    /// The headline's tracking in CSS px: Anton's 0 (Heavyweight), Lime's -2.6 px, -2.1 px at widths of 360 pt or less.
    static func headlineTracking(_ t: RoomTheme, width: CGFloat) -> CGFloat {
        t.flavor == .paper ? 0 : (width <= 360 ? -2.1 : -2.6)
    }

    /// A headline part as the browser lays out the h1's lines (`white-space: normal`, `overflow-wrap: break-word`,
    /// `index.html:686`): its white space collapsed, broken at a space where the next word would pass `width`, inside
    /// a word only when that word alone is wider; measured in the face drawn (`font`) with its tracking in points
    /// (CSS letter-spacing, after every letter). The view stacks the lines one per text, so a wrapped part keeps the
    /// CSS line pitch (SwiftUI cannot set a line spacing below the face's own line). The web's `text-wrap: balance`
    /// (1516) changes nothing for the one- and two-word parts the page writes, so the break here is the greedy one.
    static func headlineLines(_ text: String, font: UIFont, tracking: CGFloat, width: CGFloat) -> [String] {
        // CSS white space (space, tab, line feed, carriage return, form feed) collapses to one space
        let collapsed = text.split(whereSeparator: { " \t\n\r\u{0C}".contains($0) }).joined(separator: " ")
        guard !collapsed.isEmpty else { return [] }
        var attributes: [NSAttributedString.Key: Any] = [.font: font]
        if tracking != 0 { attributes[.kern] = tracking }
        let setter = CTTypesetterCreateWithAttributedString(NSAttributedString(string: collapsed, attributes: attributes))
        let units = collapsed as NSString
        let room = Double(max(1, width))
        var lines: [String] = []
        var at = 0
        while at < units.length {
            var take = CTTypesetterSuggestLineBreak(setter, at, room)
            if take > 0 {
                // a word alone wider than the column: broken between its letters (overflow-wrap: break-word)
                let line = CTTypesetterCreateLine(setter, CFRange(location: at, length: take))
                if CTLineGetTypographicBounds(line, nil, nil, nil) - CTLineGetTrailingWhitespaceWidth(line) > room + 0.5 {
                    take = CTTypesetterSuggestClusterBreak(setter, at, room)
                }
            }
            if take <= 0 { take = units.rangeOfComposedCharacterSequence(at: at).length }   // one letter, at the least
            // the space a line ends on hangs (a no-break space is not white space to CSS: it stays)
            let line = units.substring(with: NSRange(location: at, length: take)).trimmingCharacters(in: Self.cssSpace)
            if !line.isEmpty { lines.append(line) }
            at += take
        }
        return lines
    }

    /// The space a collapsed headline line may end on.
    private static let cssSpace = CharacterSet(charactersIn: " ")

    /// The route part of the connect block's identity (`ConnectID`): a route that leaves the connect screen empties the
    /// key field. Nil where no block is drawn (no connect object, or the hub).
    static func connectKey(_ model: CoachHomeModel) -> String? {
        guard model.connect != nil else { return nil }
        switch model.route {
        case .hub: return nil
        case .connect: return "connect"
        case .other(let r): return "other:" + r
        }
    }

    /// The connect block's identity: its route (`connectKey`) and the host's field generation, so the block, and the
    /// key field with what it holds, is made anew when either changes, whether or not SwiftUI drew the models between.
    struct ConnectID: Hashable {
        let route: String
        let generation: Int
    }

    // MARK: The column

    private func column(_ t: RoomTheme, width: CGFloat, safeTop: CGFloat?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HomeMetaRow(meta: model.meta, safeTop: safeTop)
            HomeHero(hero: model.hero, width: width)
            switch model.route {
            case .hub:
                groups(t)
            case .connect:
                connectBlock
            case .other:
                // a newer page's route: the hub's layout, the connect block after the groups when the model has one
                groups(t)
                connectBlock
            }
        }
        .padding(.horizontal, Self.gutter(t, width: width))
        .padding(.bottom, t.px(24))
        .frame(width: width, alignment: .leading)
    }

    private func groups(_ t: RoomTheme) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(model.groups.enumerated()), id: \.offset) { _, group in
                // each group's 18 px margin, so a connect block after the groups (an unknown route) sits 18 px below
                HomeGroupCard(group: group, act: host.act)
                    .padding(.bottom, t.px(18))
            }
        }
    }

    @ViewBuilder private var connectBlock: some View {
        if let connect = model.connect, let key = Self.connectKey(model) {
            HomeConnectBlock(connect: connect, host: host)
                .id(ConnectID(route: key, generation: host.fieldGeneration))
        }
    }
}

// MARK: The meta row and the headline

/// The meta row (`.kt-meta-row`, `index.html:1504-1511`): the room's dot and the label ("COACH · WK 06 / 12 ·
/// STRENGTH": Lime's JetBrains Mono at .14em, Heavyweight's Archivo caps at .1em), the owner's initial on the right
/// (hidden from VoiceOver). It publishes its bottom for the host's toast (`HubHeaderBottomKey`), 0 once it has
/// scrolled under the status bar.
struct HomeMetaRow: View {
    let meta: CoachHomeModel.Meta
    /// The safe area's top in window coordinates while the hub scrolls; nil for the unscrolled column.
    var safeTop: CGFloat? = nil
    @Environment(\.roomTheme) private var t

    var body: some View {
        let size = t.home(.homeMeta)
        HStack(alignment: .center, spacing: 0) {
            if !meta.label.isEmpty {
                HStack(alignment: .center, spacing: t.px(9)) {
                    // the label's ::before: a 7 px disc, the action blue in Heavyweight, Lime's muted grey
                    Circle()
                        .fill(t.color(t.flavor == .paper ? .accent : .muted))
                        .frame(width: t.px(7), height: t.px(7))
                    PlainText(text: meta.label,
                              style: InlineStyle(face: .eyebrow, size: size, weight: 700, color: .lite,
                                                 tracking: (t.flavor == .paper ? 0.1 : 0.14) * size, tabular: t.flavor == .paper),
                              uppercase: t.flavor == .paper)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: CoachHomeSpeech.meta(meta)))
            }
            Spacer(minLength: t.px(12))
            if let avatar = meta.avatar {
                HomeAvatar(initial: avatar)
            }
        }
        .padding(.top, t.px(17))
        .padding(.bottom, t.px(27))
        .background(GeometryReader { g in
            Color.clear.preference(key: HubHeaderBottomKey.self,
                                   value: HubHeaderBottomKey.value(bottom: g.frame(in: .global).maxY, safeTop: safeTop))
        })
    }
}

/// The owner's initial on the meta row (`.kt-meta-ava`): a 38 px tile, Heavyweight's blue disc, Lime's grey tile on a
/// hairline. Decorative: hidden from VoiceOver.
struct HomeAvatar: View {
    let initial: String
    @Environment(\.roomTheme) private var t

    var body: some View {
        let side = t.px(38)
        PlainText(text: initial, style: InlineStyle(size: t.home(.homeAvatar), weight: 700, color: t.flavor == .paper ? .onAccent : .text),
                  lineLimit: 1)
            .frame(width: side, height: side)
            .background {
                if t.flavor == .paper {
                    Circle().fill(t.color(.accent))
                } else {
                    RoundedRectangle(cornerRadius: t.px(13), style: .circular).fill(t.color(.card2))
                        .overlay(RoundedRectangle(cornerRadius: t.px(13), style: .circular).strokeBorder(t.color(.border), lineWidth: 1))
                }
            }
            .accessibilityHidden(true)
    }
}

/// The headline block (`.kt-hero`): the greet over the headline, title then accent, both in `text` (Heavyweight:
/// Anton caps on a .9 line; Lime: Inter 800 on a .92 line, tracked in), every line on that pitch, a part that wraps
/// included (the h1's line-height holds each of its lines), then the body. The greet, the title and the accent are one
/// header element for VoiceOver; the body is the next.
struct HomeHero: View {
    let hero: CoachHomeModel.Hero
    /// The screen's width (the headline's viewport factor and the narrow rule read it).
    let width: CGFloat
    @Environment(\.roomTheme) private var t

    private var hasHeadline: Bool { !hero.greet.isEmpty || !hero.title.isEmpty || !hero.accent.isEmpty }

    var body: some View {
        if hasHeadline || !hero.body.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                if hasHeadline { headline }
                if !hero.body.isEmpty {
                    let size = t.home(.homeBody)
                    PlainText(text: hero.body, style: InlineStyle(size: size, weight: 400, color: .lite, tracking: -0.011 * size),
                              lineHeight: 1.58)
                        .frame(maxWidth: t.px(335), alignment: .leading)
                        .padding(.top, hasHeadline ? t.px(20) : 0)
                        .accessibilityLabel(Text(verbatim: CoachHomeSpeech.body(hero)))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, t.px(32))
        }
    }

    private var headline: some View {
        let greet = t.home(.homeGreet)
        let size = CoachHomeView.headlineSize(t, width: width)
        let paper = t.flavor == .paper
        let tracking = CoachHomeView.headlineTracking(t, width: width)
        let line = InlineStyle(face: .display, size: size, weight: paper ? 400 : 800, color: .text, tracking: tracking)
        let lineHeight: CGFloat = paper ? 0.9 : 0.92
        // each part broken at the column's width, then one text per line, each on the CSS line box: a part that
        // wraps keeps the pitch (one text of several lines would space them at the face's own line, Anton's 1.5 em)
        let font = CoachInline.baseFont(line, theme: t)
        let column = width - 2 * CoachHomeView.gutter(t, width: width)
        let lines = [hero.title, hero.accent].flatMap {
            CoachHomeView.headlineLines(paper ? $0.uppercased() : $0, font: font, tracking: t.px(tracking), width: column)
        }
        return VStack(alignment: .leading, spacing: 0) {
            if !hero.greet.isEmpty {
                PlainText(text: hero.greet, style: InlineStyle(size: greet, weight: 500, color: .lite, tracking: -0.011 * greet))
                    .padding(.bottom, (hero.title.isEmpty && hero.accent.isEmpty) ? 0 : t.px(paper ? 10 : 15))
            }
            ForEach(Array(lines.enumerated()), id: \.offset) { _, text in
                // its own width: the break above is the line, never re-wrapped or cut
                PlainText(text: text, style: line, lineHeight: lineHeight)
                    .fixedSize()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: CoachHomeSpeech.headline(hero)))
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: The hub's groups

/// A group of the hub (`.settings-group`): a flat card (Lime radius 24, Heavyweight 14) with its head (a header) and
/// its rows, a hairline above each row.
struct HomeGroupCard: View {
    let group: CoachHomeModel.Group
    let act: (CoachHomeAction) -> Void
    @Environment(\.roomTheme) private var t

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: t.px(t.flavor == .paper ? 14 : 24), style: .circular)
        VStack(alignment: .leading, spacing: 0) {
            if !group.head.isEmpty {
                let size = t.home(.homeGroupHead)
                PlainText(text: group.head,
                          style: InlineStyle(face: .eyebrow, size: size, weight: t.flavor == .paper ? 700 : 800,
                                             color: t.flavor == .paper ? .accent : .muted,
                                             tracking: (t.flavor == .paper ? 0.1 : 0.13) * size, tabular: t.flavor == .paper),
                          uppercase: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, t.px(17))
                    .padding(.horizontal, t.px(18))
                    .padding(.bottom, t.px(11))
                    .accessibilityLabel(Text(verbatim: CoachHomeSpeech.groupHead(group)))
                    .accessibilityAddTraits(.isHeader)
            }
            ForEach(Array(group.rows.enumerated()), id: \.offset) { _, row in
                // every row has its top border (the web's :first-of-type never matches a row: the head is the
                // group's first div), so a hairline also parts the head from the first row
                Rectangle().fill(t.color(.border)).frame(height: 1)
                HomeRowButton(row: row) { act(.row(row.action)) }
            }
        }
        .padding(1)   // the CSS border
        .background(shape.fill(t.color(.card)))
        .clipShape(shape)
        .overlay(shape.strokeBorder(t.color(.border), lineWidth: 1))
    }
}

/// One hub row (`.settings-row`): the icon tile, the title over its sub (wrapping on its 1.4 line as the web's does:
/// `.settings-row-sub` has no nowrap, so Open Chat's "N exchanges · preview" takes two lines), the chevron where the
/// web draws one; one button for VoiceOver, its title the label and its sub the value. Pressed, it washes with 5 % of
/// `text`.
struct HomeRowButton: View {
    let row: CoachHomeModel.Row
    let action: () -> Void
    @Environment(\.roomTheme) private var t

    /// The web draws the chevron on the rows that open something (Open Chat, Build My Programme), none on Clear Chat
    /// History and Disconnect (`index.html:21171`, `21188`; the Account rows have none).
    static func chevron(_ action: CoachHomeModel.Row.Action) -> Bool {
        switch action {
        case .openChat, .startIntake: return true
        case .clearChat, .disconnect: return false
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: t.px(13)) {
                HomeRowIconTile(icon: row.icon)
                VStack(alignment: .leading, spacing: t.px(2)) {
                    PlainText(text: row.title, style: InlineStyle(size: t.home(.homeRowTitle), weight: 700, color: .text, tracking: -0.15))
                    if let sub = row.sub {
                        PlainText(text: sub, style: InlineStyle(size: t.home(.homeRowSub), weight: 500, color: .muted),
                                  lineHeight: 1.4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if Self.chevron(row.action) {
                    PlainText(text: "\u{203A}", style: InlineStyle(size: 16, weight: 400, color: .muted), lineLimit: 1)
                        .fixedSize()
                }
            }
            .padding(.vertical, t.px(16))
            .padding(.horizontal, t.px(18))
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(HomeRowPress(wash: t.color(.text).opacity(0.05)))
        .accessibilityLabel(Text(verbatim: CoachHomeSpeech.rowLabel(row)))
        .accessibilityValueIfAny(CoachHomeSpeech.rowValue(row))
    }
}

/// The row's pressed state (`.settings-row:active`): the row washes with 5 % of `text`, where buttons dim.
struct HomeRowPress: ButtonStyle {
    let wash: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? wash : Color.clear)
    }
}

/// The row's icon tile (`.settings-row-ic`): 34 px on `card2` (radius 11, Heavyweight 10), the glyph 17 px from the
/// web's own SVG path data, stroked Lime `lite` / Heavyweight `accent` (the room CSS, never the markup's inline hex).
/// An icon this build does not know draws an empty tile, so the rows stay aligned.
struct HomeRowIconTile: View {
    let icon: CoachHomeModel.Row.Icon?
    @Environment(\.roomTheme) private var t

    var body: some View {
        let side = t.px(34)
        let glyph = t.px(17)
        ZStack {
            if let icon {
                HomeGlyph(icon: icon)
                    .stroke(t.color(t.flavor == .paper ? .accent : .lite),
                            style: StrokeStyle(lineWidth: t.px(2) * 17 / 24, lineCap: .round, lineJoin: .round))
                    .frame(width: glyph, height: glyph)
            }
        }
        .frame(width: side, height: side)
        .background(RoundedRectangle(cornerRadius: t.px(t.flavor == .paper ? 10 : 11), style: .circular).fill(t.color(.card2)))
        .accessibilityHidden(true)
    }
}

/// The hub's row icons, from the web's SVG path data (`index.html:21163-21208`) in its 24-unit box.
struct HomeGlyph: Shape {
    let icon: CoachHomeModel.Row.Icon

    func path(in r: CGRect) -> Path {
        let k = min(r.width, r.height) / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * k, y: r.minY + y * k) }
        var path = Path()
        switch icon {
        case .chat:
            // M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z
            path.move(to: p(21, 15))
            path.addArc(tangent1End: p(21, 17), tangent2End: p(19, 17), radius: 2 * k)
            path.addLine(to: p(7, 17))
            path.addLine(to: p(3, 21))
            path.addLine(to: p(3, 5))
            path.addArc(tangent1End: p(3, 3), tangent2End: p(5, 3), radius: 2 * k)
            path.addLine(to: p(19, 3))
            path.addArc(tangent1End: p(21, 3), tangent2End: p(21, 5), radius: 2 * k)
            path.closeSubpath()
        case .programme:
            // polyline 22 12 18 12 15 21 9 3 6 12 2 12
            path.move(to: p(22, 12))
            for (x, y) in [(18, 12), (15, 21), (9, 3), (6, 12), (2, 12)] as [(CGFloat, CGFloat)] { path.addLine(to: p(x, y)) }
        case .trash:
            // polyline 3 6 5 6 21 6; M19 6l-1 14H6L5 6; M10 11v6; M14 11v6; M9 6V4h6v2
            path.move(to: p(3, 6))
            path.addLine(to: p(5, 6))
            path.addLine(to: p(21, 6))
            path.move(to: p(19, 6))
            path.addLine(to: p(18, 20))
            path.addLine(to: p(6, 20))
            path.addLine(to: p(5, 6))
            path.move(to: p(10, 11))
            path.addLine(to: p(10, 17))
            path.move(to: p(14, 11))
            path.addLine(to: p(14, 17))
            path.move(to: p(9, 6))
            path.addLine(to: p(9, 4))
            path.addLine(to: p(15, 4))
            path.addLine(to: p(15, 6))
        case .disconnect:
            // M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4; polyline 16 17 21 12 16 7; line 21 12 9 12
            path.move(to: p(9, 21))
            path.addLine(to: p(5, 21))
            path.addArc(tangent1End: p(3, 21), tangent2End: p(3, 19), radius: 2 * k)
            path.addLine(to: p(3, 5))
            path.addArc(tangent1End: p(3, 3), tangent2End: p(5, 3), radius: 2 * k)
            path.addLine(to: p(9, 3))
            path.move(to: p(16, 17))
            path.addLine(to: p(21, 12))
            path.addLine(to: p(16, 7))
            path.move(to: p(21, 12))
            path.addLine(to: p(9, 12))
        }
        return path
    }
}

// MARK: The connect block

/// The newest render's host, for the presses. Return's submit action is one SwiftUI's text field keeps from an earlier
/// render, whose `host` is that render's: its `connecting` stale (a Return while a key was out still sent) and its
/// `act` perhaps another host's. This box lives in the block's state, so every render's closures reach the same box,
/// and each render puts its host in it: Return, like CONNECT, reads the current `connecting` and calls the current `act`.
final class HomeHostBox {
    private(set) var host: CoachHomeHost

    init(_ host: CoachHomeHost) { self.host = host }

    /// Called from `body` on every render (no SwiftUI state changes: the box is a plain reference).
    func keep(_ newest: CoachHomeHost) { host = newest }
}

/// The connect screen's controls (`index.html:21105-21121`): the field's label (hidden from VoiceOver: the field
/// carries it), the key field, CONNECT, the help, the starter link. Made anew for each route and each field generation
/// of its host (its `.id`, `CoachHomeView.ConnectID`), so the key typed here stays while a key is out and after the
/// page refuses it, and goes when the route leaves the connect screen, whether or not SwiftUI drew the model that left.
struct HomeConnectBlock: View {
    let connect: CoachHomeModel.Connect
    let host: CoachHomeHost
    @Environment(\.roomTheme) private var t
    /// The key as typed: the only native copy (contract 5, K5).
    @State private var secret = ""
    /// The newest render's host (see HomeHostBox): what every press reads.
    @State private var live: HomeHostBox
    @FocusState private var focused: Bool

    init(connect: CoachHomeModel.Connect, host: CoachHomeHost) {
        self.connect = connect
        self.host = host
        _live = State(initialValue: HomeHostBox(host))
    }

    var body: some View {
        let _ = live.keep(host)
        VStack(alignment: .leading, spacing: 0) {
            fieldLabel
            field
            cta
                .padding(.top, t.px(14))
            if !connect.help.isEmpty {
                // the CTA's 24 px margin and the help's 14 px collapse into 24
                let size = t.home(.homeHelp)
                PlainText(text: connect.help, style: InlineStyle(size: size, weight: 400, color: .muted), lineHeight: 1.55,
                          alignment: .center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, t.px(24))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text(verbatim: CoachHomeSpeech.help(connect)))
            }
            if let starter = connect.starter {
                starterLink(starter)
                    .padding(.top, t.px(22))
            }
        }
        // a field that appears empty says so: a new one (the whole view gone and back, the tab returned to) holds
        // nothing, so the store's flag never stays "typed" over an empty field. One that appears holding text says
        // nothing: it is a field already reported, back in the window, or one on its way out, whose appearance UIKit
        // can deliver late (a stack that re-enters the window replays it before the newer model's update removes the
        // field: H0's probe, finding 6), when its text is no longer the store's to report
        .onAppear { if secret.isEmpty { live.host.fieldTyped(false) } }
        .onChange(of: secret.isEmpty) { _, empty in live.host.fieldTyped(!empty) }
    }

    /// CONNECT or Return: once per press, never while a key is out, with exactly what the field holds, to the newest
    /// render's host.
    private func connectPressed() {
        let newest = live.host
        guard !newest.connecting else { return }
        newest.act(.connect(secret: secret))
    }

    // .field label: Lime's JetBrains Mono at .1em, Heavyweight's Archivo caps at .06em, muted, 7 px above the field
    private var fieldLabel: some View {
        let size = t.home(.homeFieldLabel)
        let paper = t.flavor == .paper
        return PlainText(text: connect.label,
                         style: InlineStyle(face: .eyebrow, size: size, weight: paper ? 700 : 600, color: .muted,
                                            tracking: (paper ? 0.06 : 0.1) * size, tabular: paper),
                         uppercase: true, lineLimit: 1)
            .padding(.bottom, t.px(7))
            .accessibilityHidden(true)
    }

    /// The key field (`#coach-key-input`): a secure field at `homeField` (the web's inline `font-family: monospace`,
    /// the system monospace, in Lime; Heavyweight's room sets Archivo with tabular figures over it, `index.html:2065`,
    /// the board having no monospace), on Lime's `card2` (radius 16) or Heavyweight's `card` (radius 10); focused,
    /// Lime's edge turns `lite` and Heavyweight's the action blue with its 3 px `accentDim` ring. No autocorrection, no
    /// capitals, the ASCII keyboard, no content type at all (so iOS has no password to offer to save), marked private
    /// (`privacySensitive`: SwiftUI redacts it only where the privacy reason applies, a locked widget for one; on
    /// screen and in the app switcher's snapshot the secure field's own dots are what hide the key), Go on the keys.
    /// The whole drawn box focuses it, as the web's input owns its padding: a tap in the padding lands on
    /// `HomeFieldTapArea`, under the field, which gives the field the focus (the owner's tap).
    private var field: some View {
        let paper = t.flavor == .paper
        let font = paper ? t.uiFont(.mono, t.home(.homeField), 500)
                         : UIFont.monospacedSystemFont(ofSize: t.type(.homeField), weight: .medium)
        let radius = t.px(paper ? 10 : 16)
        let shape = RoundedRectangle(cornerRadius: radius, style: .circular)
        return SecureField(text: $secret, prompt: Text(verbatim: connect.placeholder).foregroundStyle(t.color(.muted))) {
            Text(verbatim: CoachHomeSpeech.field(connect))
        }
        .font(Font(font))
        .foregroundStyle(t.color(.text))
        .tint(t.color(.composerFocus))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.asciiCapable)
        .privacySensitive()
        .submitLabel(.go)
        .onSubmit(connectPressed)
        .focused($focused)
        .accessibilityLabel(Text(verbatim: CoachHomeSpeech.field(connect)))
        .padding(.vertical, t.px(13))
        .padding(.horizontal, t.px(14))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HomeFieldTapArea { focused = true }.accessibilityHidden(true))
        .background(shape.fill(t.color(paper ? .card : .card2)))
        .overlay(shape.strokeBorder(t.color(focused ? (paper ? .accent : .lite) : .border), lineWidth: 1).allowsHitTesting(false))
        .overlay {
            if focused && paper {
                // box-shadow: 0 0 0 3px var(--accent-dim), outside the border
                RoundedRectangle(cornerRadius: radius + 3, style: .circular)
                    .strokeBorder(t.color(.accentDim), lineWidth: 3)
                    .padding(-3)
                    .allowsHitTesting(false)
            }
        }
    }

    /// CONNECT (`.kt-cta`): the room's action colour (Lime radius 22, at least 80 tall; Heavyweight radius 12, at least
    /// 66), the label over the title on the left, the arrow tile on the right (hidden from VoiceOver); one button whose
    /// label is the CTA's label and value its title. Pressed, it dims and shrinks, or under Reduce Motion only dims
    /// (HomeCTAPress, which reads the system's setting itself).
    private var cta: some View {
        let paper = t.flavor == .paper
        let shape = RoundedRectangle(cornerRadius: t.px(paper ? 12 : 22), style: .circular)
        let labelSize = t.home(.homeCtaLabel)
        let arrowSide = t.px(40)
        return Button(action: connectPressed) {
            HStack(alignment: .center, spacing: t.px(12)) {
                VStack(alignment: .leading, spacing: t.px(4)) {
                    PlainText(text: connect.cta.label,
                              style: InlineStyle(face: .eyebrow, size: labelSize, weight: paper ? 700 : 800, color: .onAccent,
                                                 tracking: (paper ? 0.1 : 0.14) * labelSize, tabular: paper),
                              uppercase: paper, lineLimit: 1)
                        .opacity(paper ? 0.78 : 0.62)
                    PlainText(text: connect.cta.title, style: InlineStyle(size: t.home(.homeCtaTitle), weight: 800, color: .onAccent, tracking: -0.4))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PlainText(text: "\u{2192}", style: InlineStyle(size: t.home(.homeCtaArrow), weight: 600, color: .onAccent, tracking: 0), lineLimit: 1)
                    .fixedSize()
                    .frame(width: arrowSide, height: arrowSide)
                    .background(Circle().fill(paper ? Color.white.opacity(0.18) : t.color(.onAccent).opacity(0.10)))
                    .accessibilityHidden(true)
            }
            .padding(.vertical, t.px(18))
            .padding(.horizontal, t.px(20))
            .frame(maxWidth: .infinity, minHeight: t.px(paper ? 66 : 80))
            .background(shape.fill(t.color(.accent)))
            .contentShape(shape)
        }
        .buttonStyle(HomeCTAPress())
        .accessibilityLabel(Text(verbatim: CoachHomeSpeech.ctaLabel(connect)))
        .accessibilityValue(Text(verbatim: CoachHomeSpeech.ctaValue(connect)))
    }

    /// The starter link, only when the model has one (no programme yet): a hairline above it, centred, `homeLink` at
    /// 600; Heavyweight's `accentInk`, Lime's `text` underlined in `muted` (the room CSS: links are `text` in Lime,
    /// `index.html:1679-1681`). Its press reaches 44 pt though it is drawn smaller (`linkReach`), and pressed it
    /// draws as the web's plain button does (HomeLinkPress).
    private func starterLink(_ starter: CoachHomeModel.Connect.Starter) -> some View {
        let paper = t.flavor == .paper
        let font = Self.linkFont(t)
        let ink: ColorToken = paper ? .accentInk : .text
        return VStack(spacing: 0) {
            Rectangle().fill(t.color(.border)).frame(height: 1)
            HomeLinkButton(v: Self.linkReach(t), action: { host.act(.starter) }) {
                Text(verbatim: starter.label)
                    .font(Font(font))
                    .foregroundStyle(t.color(ink))
                    .underline(!paper, color: t.color(.muted))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(t.px(8))
            }
            .padding(.top, t.px(18))
            .accessibilityLabel(Text(verbatim: CoachHomeSpeech.starter(starter)))
        }
        .frame(maxWidth: .infinity)
    }

    /// The starter link's face: `homeLink` at 600.
    static func linkFont(_ t: RoomTheme) -> UIFont { t.uiFont(.body, t.home(.homeLink), 600) }

    /// How far the starter link's press reaches above and below its drawn box (one line between the web button's
    /// 8 px paddings), so it is pressed 44 pt tall.
    static func linkReach(_ t: RoomTheme) -> CGFloat {
        max(0, (t.px(44) - (linkFont(t).lineHeight + 2 * t.px(8))) / 2)
    }
}

/// The starter link's button: PressAreaButton's structure (its reach and its press shape inside the Button's label,
/// where SwiftUI reads a button's hit area, the layout given back outside it, so the link sits where it is drawn), with
/// the web's plain-button press (HomeLinkPress) where PressAreaButton dims alone. The reach is the same above and below
/// the drawn label, so the press's scale about the label's middle shrinks the drawn label about its own.
struct HomeLinkButton<Label: View>: View {
    let v: CGFloat
    let action: () -> Void
    let label: Label

    init(v: CGFloat, action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.v = v
        self.action = action
        self.label = label()
    }

    var body: some View {
        Button(action: action) {
            label
                .padding(.vertical, v)
                .contentShape(Rectangle())
        }
        .buttonStyle(HomeLinkPress())
        .padding(.vertical, -v)
    }
}

/// The key field's drawn box behind the field (`.field input{padding:13px 14px}`: on the web the padding is the
/// input's own, so a tap anywhere in the box focuses it). SwiftUI's padding lies outside the field's text view, where a
/// tap would reach nothing; this view fills the box under the field, so a tap there lands here and gives the field the
/// focus, while the field's own taps (the caret, a selection) go to the field and never reach this view. A UIKit view
/// with a plain tap recogniser, hidden from VoiceOver (the field is the element).
struct HomeFieldTapArea: UIViewRepresentable {
    let tap: () -> Void

    final class TapView: UIView {
        var tap: () -> Void = {}
        let recognizer = UITapGestureRecognizer()

        override init(frame: CGRect) {
            super.init(frame: frame)
            backgroundColor = .clear
            isAccessibilityElement = false
            accessibilityElementsHidden = true
            recognizer.addTarget(self, action: #selector(tapped))
            addGestureRecognizer(recognizer)
        }

        required init?(coder: NSCoder) { return nil }

        /// The recogniser's action: the owner tapped the box.
        @objc func tapped() { tap() }
    }

    func makeUIView(context: Context) -> TapView { TapView(frame: .zero) }

    func updateUIView(_ view: TapView, context: Context) { view.tap = tap }
}

/// CONNECT's pressed state (`.kt-cta:active`): opacity .9 and a .985 scale over .15 s; under Reduce Motion the
/// opacity alone. The pressed look reads Reduce Motion from the environment itself (HomePressed), so no caller can
/// hand the style another setting than the system's.
struct HomeCTAPress: ButtonStyle {
    static func scale(pressed: Bool, reduceMotion: Bool) -> CGFloat { pressed && !reduceMotion ? 0.985 : 1 }
    static func opacity(pressed: Bool) -> Double { pressed ? 0.9 : 1 }

    func makeBody(configuration: Configuration) -> some View {
        HomePressed(.cta, pressed: configuration.isPressed) { configuration.label }
    }
}

/// The starter link's pressed state: the web's plain `<button>` (its markup sets no class of its own), so the page's
/// universal press (`button:active{opacity:.7}` and the press-down `button:active{transform:scale(.97)}`, the scale
/// over `--t-tap` 120 ms on `--ease-settle`, `index.html:169, 1042-1043`); under Reduce Motion
/// `button:active{transform:none;opacity:.85}` (1067). The pressed look reads Reduce Motion itself (HomePressed).
struct HomeLinkPress: ButtonStyle {
    static func scale(pressed: Bool, reduceMotion: Bool) -> CGFloat { pressed && !reduceMotion ? 0.97 : 1 }
    static func opacity(pressed: Bool, reduceMotion: Bool) -> Double { pressed ? (reduceMotion ? 0.85 : 0.7) : 1 }

    func makeBody(configuration: Configuration) -> some View {
        HomePressed(.link, pressed: configuration.isPressed) { configuration.label }
    }
}

/// The connect screen's drawn buttons, by how a press draws them: CONNECT (`.kt-cta:active`) and the starter link (the
/// web's plain button).
enum HomePress: Hashable, CaseIterable, Sendable {
    case cta, link

    /// What a press draws: the scale about the button's middle and the opacity.
    struct Look: Equatable, Sendable {
        var scale: CGFloat
        var opacity: Double
    }

    func look(pressed: Bool, reduceMotion: Bool) -> Look {
        switch self {
        case .cta:
            return Look(scale: HomeCTAPress.scale(pressed: pressed, reduceMotion: reduceMotion),
                        opacity: HomeCTAPress.opacity(pressed: pressed))
        case .link:
            return Look(scale: HomeLinkPress.scale(pressed: pressed, reduceMotion: reduceMotion),
                        opacity: HomeLinkPress.opacity(pressed: pressed, reduceMotion: reduceMotion))
        }
    }
}

/// What a press of each of the screen's drawn buttons draws under Reduce Motion as it reaches the button (the system's
/// setting), published by each button's pressed look whether or not it is pressed: what a finger would see, readable
/// where no finger can press (CoachHomeViewTests holds it in both rooms: CONNECT keeps its size under Reduce Motion).
struct HomePressKey: PreferenceKey {
    static let defaultValue: [HomePress: HomePress.Look] = [:]
    static func reduce(value: inout [HomePress: HomePress.Look], nextValue: () -> [HomePress: HomePress.Look]) {
        value.merge(nextValue()) { first, _ in first }
    }
}

/// A drawn button's label as pressed or not, Reduce Motion read from the environment (the system's setting): CONNECT
/// dims and shrinks together over .15 s (`.kt-cta{transition:transform .15s,opacity .15s}`); the starter link shrinks
/// over 120 ms on the settle curve and dims at once (a plain button's transition is its transform's alone).
struct HomePressed<Label: View>: View {
    let press: HomePress
    let pressed: Bool
    let label: Label
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(_ press: HomePress, pressed: Bool, @ViewBuilder label: () -> Label) {
        self.press = press
        self.pressed = pressed
        self.label = label()
    }

    var body: some View {
        let now = press.look(pressed: pressed, reduceMotion: reduceMotion)
        Group {
            switch press {
            case .cta:
                label
                    .opacity(now.opacity)
                    .scaleEffect(now.scale)
                    .animation(.easeOut(duration: 0.15), value: pressed)
            case .link:
                // the opacity outside the animation: it changes at once
                label
                    .scaleEffect(now.scale)
                    .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.12), value: pressed)
                    .opacity(now.opacity)
            }
        }
        .preference(key: HomePressKey.self, value: [press: press.look(pressed: true, reduceMotion: reduceMotion)])
    }
}

extension View {
    /// An accessibility value when there is one (a row without a sub has none).
    @ViewBuilder func accessibilityValueIfAny(_ value: String?) -> some View {
        if let value, !value.isEmpty {
            accessibilityValue(Text(verbatim: value))
        } else {
            self
        }
    }
}
#endif
