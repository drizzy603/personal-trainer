#if os(iOS)
import CoreText
import SwiftUI
import UIKit

/// The faces the native chat draws with (plan task C6).
///
/// `Resources/Fonts` holds static TrueType faces made from the web's own fonts
/// (`screenshots/live-activity/mkfonts.py`, set "chat"): Archivo for Heavyweight, Inter with
/// JetBrains Mono for Lime, at the weights the web chat uses (400, 500, 600, 700, 800; JetBrains
/// Mono 400, 600, 700, 800). Each is renamed "<Family> FP" (PostScript `ArchivoFP-SemiBold`), so it
/// can never collide with a system font. They are registered for the process at runtime, from the
/// package's resource bundle, so the App target needs no UIAppFonts entry.
///
/// Neither family has an italic: the web synthesizes one (WebKit slants the upright face 14°), and
/// so does `uiFont(...italic:)`. A family the page names that is not bundled (a newer page's) falls
/// back to the system face at the same weight, as a browser falls back for a font it lacks.
public enum FPFonts {
    /// The families bundled, by the name the page's tokens use, with their PostScript family.
    public static let families: [String: String] = [
        "Archivo": "ArchivoFP",
        "Inter": "InterFP",
        "JetBrains Mono": "JetBrainsMonoFP",
    ]

    /// The weights bundled per PostScript family.
    public static let weights: [String: [Int]] = [
        "ArchivoFP": [400, 500, 600, 700, 800],
        "InterFP": [400, 500, 600, 700, 800],
        "JetBrainsMonoFP": [400, 600, 700, 800],
    ]

    /// The style name in a face's PostScript name, by weight.
    static let styleNames: [Int: String] = [
        400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold",
    ]

    /// WebKit's synthetic oblique (SYNTHETIC_OBLIQUE_ANGLE).
    public static let syntheticObliqueDegrees: CGFloat = 14

    private static let lock = NSLock()
    nonisolated(unsafe) private static var done = false
    nonisolated(unsafe) private static var names: [String] = []

    /// Registers every bundled face for this process, once. Safe to call from any thread, any
    /// number of times. Returns the PostScript names now available.
    @discardableResult
    public static func register() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        if done { return names }
        done = true
        guard let dir = Bundle.module.url(forResource: "Fonts", withExtension: nil),
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return names }
        for url in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where url.pathExtension == "ttf" {
            let ps = url.deletingPathExtension().lastPathComponent
            if UIFont(name: ps, size: 12) == nil {
                var error: Unmanaged<CFError>?
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
            }
            if UIFont(name: ps, size: 12) != nil { names.append(ps) }
        }
        return names
    }

    /// The bundled weight nearest to `weight` (CSS's matching: at or below 500 look lighter first,
    /// above 500 heavier first).
    static func nearest(_ weight: Int, in available: [Int]) -> Int {
        if available.contains(weight) { return weight }
        let lighter = available.filter { $0 < weight }.sorted(by: >)
        let heavier = available.filter { $0 > weight }.sorted()
        if weight <= 500 { return lighter.first ?? heavier.first ?? weight }
        return heavier.first ?? lighter.first ?? weight
    }

    /// The PostScript name for a family the page names and a CSS weight, or nil when the family is
    /// not bundled.
    public static func postScriptName(family: String, weight: Int) -> String? {
        guard let ps = families[family], let available = weights[ps] else { return nil }
        let w = nearest(weight, in: available)
        guard let style = styleNames[w] else { return nil }
        return ps + "-" + style
    }

    /// A face at a size in points: the bundled one when the family is bundled, else the system
    /// face at that weight. `italic` slants it as WebKit does; `tabular` asks for tabular figures
    /// (`font-variant-numeric: tabular-nums`).
    public static func uiFont(family: String, weight: Int, size: CGFloat, italic: Bool = false, tabular: Bool = false) -> UIFont {
        register()
        var font: UIFont
        if let ps = postScriptName(family: family, weight: weight), let f = UIFont(name: ps, size: size) {
            font = f
        } else if family == "JetBrains Mono" || family.lowercased().contains("mono") {
            font = UIFont.monospacedSystemFont(ofSize: size, weight: systemWeight(weight))
        } else {
            font = UIFont.systemFont(ofSize: size, weight: systemWeight(weight))
        }
        var attributes: [UIFontDescriptor.AttributeName: Any] = [:]
        if font.fontName.hasSuffix("FP") || font.fontName.contains("FP-") {
            // a glyph the face lacks (→ ✓ ✕ ⇄ …) comes from the system face, as the web's stacks
            // say (-apple-system after Archivo or Inter, ui-monospace after JetBrains Mono)
            let mono = family.lowercased().contains("mono")
            let fallback = mono ? UIFont.monospacedSystemFont(ofSize: size, weight: systemWeight(weight))
                                : UIFont.systemFont(ofSize: size, weight: systemWeight(weight))
            attributes[.cascadeList] = [fallback.fontDescriptor]
        }
        if tabular {
            attributes[.featureSettings] = [[UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                                             UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector]]
        }
        if !attributes.isEmpty {
            font = UIFont(descriptor: font.fontDescriptor.addingAttributes(attributes), size: size)
        }
        if italic {
            // the slant rides on the CTFont's own matrix (a descriptor's matrix does not survive
            // UIFont(descriptor:size:)); UIFont and CTFont are the same object
            var slant = CGAffineTransform(a: 1, b: 0, c: tan(syntheticObliqueDegrees * .pi / 180), d: 1, tx: 0, ty: 0)
            font = CTFontCreateWithFontDescriptor(font.fontDescriptor as CTFontDescriptor, size, &slant) as UIFont
        }
        return font
    }

    /// The SwiftUI font for `uiFont(...)`.
    public static func font(family: String, weight: Int, size: CGFloat, italic: Bool = false, tabular: Bool = false) -> Font {
        Font(uiFont(family: family, weight: weight, size: size, italic: italic, tabular: tabular))
    }

    static func systemWeight(_ w: Int) -> UIFont.Weight {
        switch w {
        case ..<150: return .ultraLight
        case ..<250: return .thin
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        case ..<850: return .heavy
        default: return .black
        }
    }
}
#endif
