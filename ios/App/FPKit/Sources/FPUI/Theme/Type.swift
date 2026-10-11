#if os(iOS)
import SwiftUI
import UIKit
import FPCore

/// The chat's text size (plan task C6; decision.md section 10, platform critic 9).
///
/// The web scales the whole page with a root zoom read from the system body size (17 pt at the
/// default size; `_dynTypeScale`: round(px / 17 × 100) / 100, kept within 1.0...1.25) when the
/// app's Dynamic Type toggle is on, and not at all when it is off. The native chat reads the
/// system size, clamps it as FPCore's `TextSize.clamped(dynTypeOn:)` says (large...xxLarge when on,
/// large when off), and scales every size it draws by the same factor the web would use at that
/// size: 1.0 at large, 1.12 at xLarge (19 pt body), 1.24 at xxLarge (21 pt body). Sizes, spacing,
/// radii and the chat's own geometry scale together, as under the web's zoom, so a larger size
/// reads as the same design, larger.
public enum ChatType {
    /// The system body size in points at each step (UIKit's -apple-system-body).
    static func bodyPoints(_ size: TextSize) -> CGFloat {
        switch size {
        case .xSmall: return 14
        case .small: return 15
        case .medium: return 16
        case .large: return 17
        case .xLarge: return 19
        case .xxLarge: return 21
        case .xxxLarge: return 23
        case .accessibility1: return 28
        case .accessibility2: return 33
        case .accessibility3: return 40
        case .accessibility4: return 47
        case .accessibility5: return 53
        }
    }

    /// The factor the web's zoom would use at this size: round(body / 17 × 100) / 100 in 1...1.25.
    public static func scale(for size: TextSize) -> CGFloat {
        let raw = (bodyPoints(size) / 17 * 100).rounded() / 100
        return min(1.25, max(1, raw))
    }

    /// The chat's size and factor for a system size and the app's toggle.
    public static func clamp(_ system: DynamicTypeSize, dynTypeOn: Bool) -> (size: TextSize, scale: CGFloat) {
        let size = textSize(system).clamped(dynTypeOn: dynTypeOn)
        return (size, scale(for: size))
    }

    /// SwiftUI's size as FPCore's TextSize.
    public static func textSize(_ d: DynamicTypeSize) -> TextSize {
        switch d {
        case .xSmall: return .xSmall
        case .small: return .small
        case .medium: return .medium
        case .large: return .large
        case .xLarge: return .xLarge
        case .xxLarge: return .xxLarge
        case .xxxLarge: return .xxxLarge
        case .accessibility1: return .accessibility1
        case .accessibility2: return .accessibility2
        case .accessibility3: return .accessibility3
        case .accessibility4: return .accessibility4
        case .accessibility5: return .accessibility5
        @unknown default: return .large
        }
    }

    /// FPCore's TextSize as SwiftUI's size.
    public static func dynamicTypeSize(_ t: TextSize) -> DynamicTypeSize {
        switch t {
        case .xSmall: return .xSmall
        case .small: return .small
        case .medium: return .medium
        case .large: return .large
        case .xLarge: return .xLarge
        case .xxLarge: return .xxLarge
        case .xxxLarge: return .xxxLarge
        case .accessibility1: return .accessibility1
        case .accessibility2: return .accessibility2
        case .accessibility3: return .accessibility3
        case .accessibility4: return .accessibility4
        case .accessibility5: return .accessibility5
        }
    }

    /// The range the chat lets its children see: large...xxLarge with the toggle on, large off.
    public static func range(dynTypeOn: Bool) -> ClosedRange<DynamicTypeSize> {
        dynTypeOn ? DynamicTypeSize.large ... DynamicTypeSize.xxLarge : DynamicTypeSize.large ... DynamicTypeSize.large
    }
}

/// CSS's line box for SwiftUI text: a `line-height` taller than the face's own line puts half the
/// difference above the first line and below the last (half-leading), and the rest between lines.
/// Every face the chat bundles has no line gap, so the face's line is its ascent plus descent, as
/// in the browser.
struct CSSLineHeight: ViewModifier {
    let font: UIFont
    let lineHeight: CGFloat

    func body(content: Content) -> some View {
        let extra = lineHeight - font.lineHeight
        return content
            .lineSpacing(max(0, extra))
            .padding(.vertical, extra / 2)
    }
}

extension View {
    /// Lays text out on CSS line boxes of `lineHeight` points for `font`.
    func cssLineHeight(_ lineHeight: CGFloat, font: UIFont) -> some View {
        modifier(CSSLineHeight(font: font, lineHeight: lineHeight))
    }
}
#endif
