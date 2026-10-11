#if os(iOS)
import SwiftUI
import UIKit
import FPCore

/// How a room draws the chat beyond its tokens: the room CSS's structural rules (the web's
/// `html[data-room=…]` blocks) that are not a colour, a size or a family. Per-view geometry is not a
/// token (decision.md section 6), so the views read this for the few places the rooms differ in
/// shape: the avatar, the model switch's surface, the composer's edges, the eyebrows' tracking.
public enum RoomFlavor: Equatable, Sendable {
    /// Heavyweight: paper, flat white cards on hairlines, the blue action, Archivo throughout.
    case paper
    /// Lime (`dark`): near-black, neutral greys, the lime only for the action and the earned
    /// state, Inter with JetBrains Mono eyebrows and figures.
    case studio

    public init(room: Room, paper: Bool) {
        switch room {
        case .heavyweight: self = .paper
        case .lime: self = .studio
        case .other: self = paper ? .paper : .studio
        }
    }
}

/// The room the chat draws in: the model's tokens (compiled defaults with the page's overrides),
/// its appearance and the clamped text size. Every size a view draws goes through `px`, so the
/// chat scales as the web does under its Dynamic Type zoom.
public struct RoomTheme: Equatable {
    public let tokens: Tokens
    public let paper: Bool
    public let flavor: RoomFlavor
    /// The clamped text size the chat draws at.
    public let textSize: TextSize
    /// The web zoom's factor at that size (ChatType.scale).
    public let scale: CGFloat

    public init(tokens: Tokens, paper: Bool, textSize: TextSize) {
        self.tokens = tokens
        self.paper = paper
        flavor = RoomFlavor(room: tokens.room, paper: paper)
        self.textSize = textSize
        scale = ChatType.scale(for: textSize)
    }

    /// The model's room at the system size, clamped as the app's toggle says.
    public init(model: CoachModel, system: DynamicTypeSize) {
        let (size, _) = ChatType.clamp(system, dynTypeOn: model.dynTypeOn)
        self.init(tokens: model.tokens, paper: model.paper, textSize: size)
    }

    /// The compiled defaults of a room (previews, the toast window before a model arrives).
    public static func defaults(_ room: Room, paper: Bool? = nil, textSize: TextSize = .large) -> RoomTheme {
        let p = paper ?? room.isPaper ?? true
        return RoomTheme(tokens: Tokens.defaults(for: room, paper: p), paper: p, textSize: textSize)
    }

    /// Larger Text is on (the web's `data-dyn-type` other than 1): the header's meta and the model
    /// switch's version stand down so the header keeps one line.
    public var largerText: Bool { scale != 1 }

    /// The appearance every native control in the chat takes (keyboard, menus, picker).
    public var colorScheme: ColorScheme { paper ? .light : .dark }
    public var interfaceStyle: UIUserInterfaceStyle { paper ? .light : .dark }

    // MARK: Colours

    public func color(_ t: ColorToken) -> Color { Color(rgba: tokens.color(t)) }
    public func uiColor(_ t: ColorToken) -> UIColor { UIColor(rgba: tokens.color(t)) }
    public func rgba(_ t: ColorToken) -> RGBA { tokens.color(t) }

    // MARK: Sizes

    /// A length in CSS px at the large size, in points at this size.
    public func px(_ v: CGFloat) -> CGFloat { v * scale }
    public func type(_ t: TypeToken) -> CGFloat { CGFloat(tokens.size(t)) * scale }
    public func space(_ t: SpaceToken) -> CGFloat { CGFloat(tokens.space(t)) * scale }
    public func radius(_ t: RadiusToken) -> CGFloat { CGFloat(tokens.radius(t)) * scale }

    // MARK: Faces

    /// A face role: the body text, the eyebrows (caps labels), and figures (metrics, code).
    public enum Face: Sendable {
        case body, eyebrow, mono
    }

    public func family(_ f: Face) -> String {
        switch f {
        case .body: return tokens.font(.body)
        case .eyebrow: return tokens.font(.eyebrow)
        case .mono: return tokens.font(.mono)
        }
    }

    /// Whether a role's family is a monospace (Lime's JetBrains Mono). Heavyweight has no monospace:
    /// its figures are Archivo with tabular figures, as the room CSS writes them.
    public func isMonospace(_ f: Face) -> Bool { family(f).lowercased().contains("mono") }

    /// A face at a CSS size (unscaled px) and weight. Figures in a proportional family get tabular
    /// figures unless `tabular` says otherwise.
    public func uiFont(_ f: Face, _ cssSize: CGFloat, _ weight: Int, italic: Bool = false, tabular: Bool? = nil) -> UIFont {
        let tab = tabular ?? (f == .mono && !isMonospace(.mono))
        return FPFonts.uiFont(family: family(f), weight: weight, size: px(cssSize), italic: italic, tabular: tab)
    }

    public func font(_ f: Face, _ cssSize: CGFloat, _ weight: Int, italic: Bool = false, tabular: Bool? = nil) -> Font {
        Font(uiFont(f, cssSize, weight, italic: italic, tabular: tabular))
    }

    /// CSS `letter-spacing` in em of a CSS size, in points at this size.
    public func tracking(em: CGFloat, of cssSize: CGFloat) -> CGFloat { em * px(cssSize) }

    /// The text's default tracking: Lime inherits `letter-spacing: -.011em` of the root's 16 px
    /// (-0.176 px); Heavyweight's body sets 0.
    public var bodyTracking: CGFloat { flavor == .studio ? px(-0.176) : 0 }

    /// The tracking of the header's caps labels (eyebrow, meta) in CSS px at the large size:
    /// Heavyweight's Archivo takes .06em, Lime's monospace the base CSS's `em`.
    public func headTrackingPx(em: CGFloat, of cssSize: CGFloat) -> CGFloat {
        (flavor == .paper ? 0.06 : em) * cssSize
    }
}

extension Color {
    /// An sRGB colour from FPCore's RGBA (what the page's CSS names).
    public init(rgba c: RGBA) {
        self.init(.sRGB, red: c.red, green: c.green, blue: c.blue, opacity: c.alpha)
    }
}

extension UIColor {
    public convenience init(rgba c: RGBA) {
        self.init(red: CGFloat(c.red), green: CGFloat(c.green), blue: CGFloat(c.blue), alpha: CGFloat(c.alpha))
    }
}

private struct RoomThemeKey: EnvironmentKey {
    static let defaultValue = RoomTheme.defaults(.heavyweight)
}

extension EnvironmentValues {
    /// The room the chat draws in (set once by CoachChatView).
    public var roomTheme: RoomTheme {
        get { self[RoomThemeKey.self] }
        set { self[RoomThemeKey.self] = newValue }
    }
}
#endif
