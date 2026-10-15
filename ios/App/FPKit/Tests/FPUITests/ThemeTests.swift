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
