#if os(iOS)
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
        let want: Set<String> = ["ArchivoFP-Regular", "ArchivoFP-Medium", "ArchivoFP-SemiBold", "ArchivoFP-Bold", "ArchivoFP-ExtraBold",
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
}
#endif
