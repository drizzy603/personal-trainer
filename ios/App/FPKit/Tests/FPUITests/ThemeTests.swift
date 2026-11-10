#if os(iOS)
import CoreText
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

final class ThemeTests: XCTestCase {
    func testTextSizeFollowsTheWebZoom() {
        // the page: round(body / 17 * 100) / 100 within 1...1.25 (17, 19, 21 pt bodies)
        XCTAssertEqual(ChatType.scale(for: .large), 1)
        XCTAssertEqual(ChatType.scale(for: .xLarge), 1.12)
        XCTAssertEqual(ChatType.scale(for: .xxLarge), 1.24)
        XCTAssertEqual(ChatType.scale(for: .xxxLarge), 1.25)
        XCTAssertEqual(ChatType.scale(for: .small), 1)
        // clamped .large ... .xxLarge with the toggle on, pinned at .large off
        XCTAssertEqual(ChatType.clamp(.xSmall, dynTypeOn: true).size, .large)
        XCTAssertEqual(ChatType.clamp(.xLarge, dynTypeOn: true).scale, 1.12)
        XCTAssertEqual(ChatType.clamp(.accessibility3, dynTypeOn: true).size, .xxLarge)
        XCTAssertEqual(ChatType.clamp(.accessibility3, dynTypeOn: true).scale, 1.24)
        XCTAssertEqual(ChatType.clamp(.xxLarge, dynTypeOn: false).size, .large)
        XCTAssertEqual(ChatType.clamp(.xxLarge, dynTypeOn: false).scale, 1)
        XCTAssertEqual(ChatType.range(dynTypeOn: true), DynamicTypeSize.large ... DynamicTypeSize.xxLarge)
        XCTAssertEqual(ChatType.range(dynTypeOn: false), DynamicTypeSize.large ... DynamicTypeSize.large)
        for d in DynamicTypeSize.allCases {
            XCTAssertEqual(ChatType.dynamicTypeSize(ChatType.textSize(d)), d)
        }
    }

    func testEveryBundledFaceRegisters() {
        let names = Set(FPFonts.register())
        let want: Set<String> = ["AntonFP-Regular",
                                 "ArchivoFP-Regular", "ArchivoFP-Medium", "ArchivoFP-SemiBold", "ArchivoFP-Bold", "ArchivoFP-ExtraBold",
                                 "InterFP-Regular", "InterFP-Medium", "InterFP-SemiBold", "InterFP-Bold", "InterFP-ExtraBold",
                                 "JetBrainsMonoFP-Regular", "JetBrainsMonoFP-SemiBold", "JetBrainsMonoFP-Bold", "JetBrainsMonoFP-ExtraBold"]
        XCTAssertEqual(names, want)
        XCTAssertEqual(Set(FPFonts.register()), want, "registering twice changes nothing")
        for ps in want { XCTAssertNotNil(UIFont(name: ps, size: 15), ps) }
    }

    func testFaceForFamilyAndWeight() {
        XCTAssertEqual(FPFonts.postScriptName(family: "Archivo", weight: 600), "ArchivoFP-SemiBold")
        XCTAssertEqual(FPFonts.postScriptName(family: "Inter", weight: 800), "InterFP-ExtraBold")
        XCTAssertEqual(FPFonts.postScriptName(family: "JetBrains Mono", weight: 500), "JetBrainsMonoFP-Regular", "CSS: 500 looks lighter first")
        XCTAssertEqual(FPFonts.postScriptName(family: "JetBrains Mono", weight: 900), "JetBrainsMonoFP-ExtraBold")
        XCTAssertEqual(FPFonts.postScriptName(family: "Inter", weight: 300), "InterFP-Regular")
        XCTAssertNil(FPFonts.postScriptName(family: "Helvetica Neue", weight: 400))
        // Anton has one weight: every weight asked of it draws it
        XCTAssertEqual(FPFonts.postScriptName(family: "Anton", weight: 800), "AntonFP-Regular")
        XCTAssertEqual(FPFonts.postScriptName(family: "Anton", weight: 400), "AntonFP-Regular")
        // a family a newer page names that is not bundled: the system face at that weight
        let sys = FPFonts.uiFont(family: "Helvetica Neue", weight: 700, size: 15)
        XCTAssertEqual(sys.pointSize, 15)
        XCTAssertFalse(sys.fontName.contains("FP"))
        let tab = FPFonts.uiFont(family: "Archivo", weight: 400, size: 13, tabular: true)
        let features = tab.fontDescriptor.object(forKey: .featureSettings) as? [[UIFontDescriptor.FeatureKey: Int]]
        XCTAssertEqual(features?.first?[.type], kNumberSpacingType)
        XCTAssertEqual(features?.first?[.selector], kMonospacedNumbersSelector)
    }

    func testRoomThemeReadsTheTokens() throws {
        let hw = RoomTheme.defaults(.heavyweight)
        XCTAssertEqual(hw.flavor, .paper)
        XCTAssertEqual(hw.colorScheme, .light)
        XCTAssertEqual(hw.rgba(.accent).css, "#0a43f5")
        XCTAssertEqual(hw.family(.body), "Archivo")
        XCTAssertEqual(hw.family(.eyebrow), "Archivo")
        XCTAssertFalse(hw.isMonospace(.mono))
        XCTAssertEqual(hw.bodyTracking, 0)
        let lime = RoomTheme.defaults(.lime)
        XCTAssertEqual(lime.flavor, .studio)
        XCTAssertEqual(lime.colorScheme, .dark)
        XCTAssertEqual(lime.rgba(.accent).css, "#d8ff63")
        XCTAssertEqual(lime.family(.eyebrow), "JetBrains Mono")
        XCTAssertTrue(lime.isMonospace(.mono))
        XCTAssertEqual(lime.bodyTracking, -0.176, accuracy: 0.0001)
        // an unknown room draws on the defaults its paper flag names, with the page's overrides
        let fc = try CoachFixtures.model("forward-compat")
        let theme = RoomTheme(model: fc, system: .large)
        XCTAssertEqual(theme.flavor, .studio)
        XCTAssertEqual(theme.rgba(.accent).css, "#ff7a00")
        XCTAssertEqual(theme.type(.body), 17)
        // sizes scale with the text size
        let big = RoomTheme(tokens: Tokens.heavyweight, paper: true, textSize: .xxLarge)
        XCTAssertEqual(big.px(20), 24.8, accuracy: 0.0001)
        XCTAssertEqual(big.type(.body), 15 * 1.24, accuracy: 0.0001)
        XCTAssertTrue(big.largerText)
        XCTAssertFalse(hw.largerText)
        XCTAssertEqual(RoomFlavor(room: .other("x"), paper: true), .paper)
    }

    func testDisplayFaceIsAntonInHeavyweightAndInterInLime() {
        let hw = RoomTheme.defaults(.heavyweight)
        XCTAssertEqual(hw.family(.display), "Anton")
        XCTAssertEqual(hw.uiFont(.display, 74, 800).fontName, "AntonFP-Regular")
        XCTAssertFalse(hw.isMonospace(.display))
        let lime = RoomTheme.defaults(.lime)
        XCTAssertEqual(lime.family(.display), "Inter")
        XCTAssertEqual(lime.uiFont(.display, 56, 800).fontName, "InterFP-ExtraBold")
        // the chat's roles are untouched by the new one
        XCTAssertEqual(hw.family(.body), "Archivo")
        XCTAssertEqual(lime.family(.body), "Inter")
        // sizes scale with the text size, as every other face
        let big = RoomTheme(tokens: Tokens.heavyweight, paper: true, textSize: .xxLarge)
        XCTAssertEqual(big.uiFont(.display, 74, 800).pointSize, 74 * 1.24, accuracy: 0.0001)
    }

    /// The repository's root, from this file in the source tree (a simulator shares the Mac's disk).
    static let repo: URL = (0..<6).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }

    /// Every static face kerns as the web's own font does: each TTF the native chat and hub register
    /// (`FPUI/Resources/Fonts`) and the rest Live Activity bundles (`TrovoTimerWidget/Fonts`) sets pairs with a capital
    /// A, and the others, at the widths the web's latin woff2 sets them at that weight (the face the browser draws
    /// those letters from, `assets/fonts`), and still draws latin-ext's letters itself. mkfonts.py merges the latin
    /// and latin-ext subsets into each face; when the two shared a code point, fontTools' merger swapped latin's glyph
    /// for latin-ext's copy in every Latin run (a locl lookup to A.1), which no kerning pair names: "TA" set 8.4 pt
    /// wide of the web's at 100 pt in Archivo Bold, and Heavyweight's meta label broke where the web's did not.
    func testEveryFaceKernsAsTheWebsFontDoes() throws {
        let stems = ["AntonFP": "anton", "ArchivoFP": "archivo", "InterFP": "inter-var", "JetBrainsMonoFP": "jbm-var"]
        let weights = ["Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700, "ExtraBold": 800, "Clock": 250]
        let folders = ["ios/App/FPKit/Sources/FPUI/Resources/Fonts", "ios/App/TrovoTimerWidget/Fonts"]
        let runs = ["TA", "AT", "AV", "VA", "AY", "LA", "CA", "To", "Yo", "LT", "AVATAR", "COACH", "PLAN CHANGES", "WK 06 / 12"]
        func font(_ url: URL, weight: Int?) throws -> CTFont {
            let data = try Data(contentsOf: url)
            let all = CTFontManagerCreateFontDescriptorsFromData(data as CFData) as? [CTFontDescriptor] ?? []
            let d = try XCTUnwrap(all.first, "CoreText reads \(url.lastPathComponent)")
            let f = CTFontCreateWithFontDescriptor(d, 100, nil)
            let wght = 0x7767_6874   // 'wght'
            let axes = CTFontCopyVariationAxes(f) as? [[CFString: Any]] ?? []
            guard let weight, axes.contains(where: { ($0[kCTFontVariationAxisIdentifierKey] as? Int) == wght }) else { return f }
            return CTFontCreateWithFontDescriptor(CTFontDescriptorCreateCopyWithVariation(d, wght as CFNumber, CGFloat(weight)), 100, nil)
        }
        func width(_ s: String, _ f: CTFont) -> Double {
            let line = CTLineCreateWithAttributedString(NSAttributedString(string: s, attributes: [.font: f as UIFont]))
            return CTLineGetTypographicBounds(line, nil, nil, nil)
        }
        var faces = 0
        for folder in folders {
            let dir = Self.repo.appendingPathComponent(folder, isDirectory: true)
            let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil).filter { $0.pathExtension == "ttf" }
            XCTAssertFalse(files.isEmpty, folder)
            for url in files {
                let ps = url.deletingPathExtension().lastPathComponent
                let parts = ps.split(separator: "-").map(String.init)
                let stem = try XCTUnwrap(stems[parts[0]], "\(ps): a family mkfonts.py makes")
                let weight = try XCTUnwrap(weights[parts.last ?? ""], "\(ps): a style mkfonts.py makes")
                let face = try font(url, weight: nil)
                let web = try font(Self.repo.appendingPathComponent("assets/fonts/\(stem)-latin.woff2"), weight: weight)
                for run in runs {
                    // (a static face's advances are whole font units; the web's instance interpolates them: 0.23 pt
                    // apart at most over these runs, where a lost kerning pair is 2.5 to 8.8 pt)
                    XCTAssertEqual(width(run, face), width(run, web), accuracy: 0.5,
                                   "\(folder)/\(ps): \(run.debugDescription) is set at the web's width at 100 pt")
                }
                var chars = Array("Łydka Čučoriedka Ąę".utf16)
                var glyphs = [CGGlyph](repeating: 0, count: chars.count)
                XCTAssertTrue(CTFontGetGlyphsForCharacters(face, &chars, &glyphs, chars.count), "\(ps): latin-ext's letters are its own")
                faces += 1
            }
        }
        XCTAssertGreaterThanOrEqual(faces, 21, "every face of both sets")
    }

    func testAntonIsReallyDrawn() {
        // the face is really used, not the system fallback a missing family gets without a word
        // (Fonts.swift: an unbundled family draws the system face at the weight asked)
        let text = "COACH"
        func measure(_ f: UIFont) -> CGSize { (text as NSString).size(withAttributes: [.font: f]) }
        let anton = RoomTheme.defaults(.heavyweight).uiFont(.display, 74, 800)
        let system = UIFont.systemFont(ofSize: 74, weight: FPFonts.systemWeight(800))
        XCTAssertEqual(anton.fontName, "AntonFP-Regular")
        XCTAssertGreaterThan(abs(measure(anton).width - measure(system).width), 4, "Anton's run measures unlike the system face's")
        // Anton is a condensed display face: taller capitals than the system face at the same size
        XCTAssertGreaterThan(anton.capHeight, system.capHeight)
        // the face's own glyphs: every letter of the run maps to a glyph in Anton itself
        let ct = CTFontCreateWithName("AntonFP-Regular" as CFString, 74, nil)
        var chars = Array(text.utf16)
        var glyphs = [CGGlyph](repeating: 0, count: chars.count)
        XCTAssertTrue(CTFontGetGlyphsForCharacters(ct, &chars, &glyphs, chars.count))
        XCTAssertFalse(glyphs.contains(0))
    }
}
#endif
