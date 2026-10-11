#if os(iOS)
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// The chat's controls drawn smaller than 44 pt take a 44 pt press (plan task C6; the third UI
/// review found the model switch and the toast's Undo pressed only where drawn).
/// Each is a PressAreaButton, whose press shape sits inside the Button's label, where SwiftUI reads
/// a button's hit area: a content shape wrapped around the finished Button widened only the frame
/// VoiceOver reported.
///
/// No touch reaches a control in this test host (it has no window scene: a made touch reaches
/// neither a SwiftUI Button nor a plain UIButton), so the taps themselves are probed on the Mac, on
/// this same source text (native-m1/chat-ui-fix/press: the old chain takes a click only on the
/// drawn pill, PressAreaButton takes it up to its reach and not past it). These tests hold the
/// structure that probe showed works, and the reach.
@MainActor
final class PressAreaTests: XCTestCase {
    /// The generic argument of the first `Button<…>` in a view type's name (SwiftUI's Button, not a
    /// type whose name ends in Button): the Button's label.
    static func buttonLabel(in typeName: String) -> String? {
        var from = typeName.startIndex
        var found: Range<String.Index>?
        while let r = typeName.range(of: "Button<", range: from..<typeName.endIndex) {
            if r.lowerBound == typeName.startIndex || !typeName[typeName.index(before: r.lowerBound)].isLetter { found = r; break }
            from = r.upperBound
        }
        guard let start = found else { return nil }
        var depth = 1
        var i = start.upperBound
        while i < typeName.endIndex {
            switch typeName[i] {
            case "<": depth += 1
            case ">":
                depth -= 1
                if depth == 0 { return String(typeName[start.upperBound..<i]) }
            default: break
            }
            i = typeName.index(after: i)
        }
        return nil
    }

    static func modelSwitch() throws -> ModelSwitch {
        try XCTUnwrap(CoachFixtures.model("heavyweight-chat").header.model)
    }

    /// The type of a view's body as SwiftUI would build it (the environment at its defaults).
    static func bodyType<V: View>(_ v: V) -> String { String(describing: type(of: v.body)) }

    func testTheSmallControlsAreBuiltOnPressAreaButton() throws {
        XCTAssertEqual(Self.buttonLabel(in: "A<PressAreaButton<X, Rectangle>, Button<Y<Z>>>"), "Y<Z>", "the reader skips other types named …Button")
        let toggle = Self.bodyType(ModelSwitchButton(model: try Self.modelSwitch(), short: false, send: { _ in }))
        XCTAssertTrue(toggle.contains("PressAreaButton<"), "the model switch takes its press through PressAreaButton: \(toggle)")
        let toast = Self.bodyType(CoachToastView(toast: ToastRequest(text: "Bench Press removed", style: "ok", undo: "t-1"), onUndo: {}))
        XCTAssertTrue(toast.contains("PressAreaButton<"), "the toast's Undo takes its press through PressAreaButton: \(toast)")
    }

    func testPressAreaButtonPutsItsPressShapeInsideTheButtonsLabel() throws {
        let rect = Self.bodyType(PressAreaButton(h: 4, v: 11, action: {}) { Color.red.frame(width: 76, height: 22) })
        let rectLabel = try XCTUnwrap(Self.buttonLabel(in: rect), rect)
        XCTAssertTrue(rectLabel.contains("_ContentShapeModifier<Rectangle>"), "the press shape is the Button's label's: \(rect)")
        XCTAssertTrue(rectLabel.hasSuffix("_ContentShapeModifier<Rectangle>>"), "and outermost in it, around the padding: \(rect)")
        let circle = Self.bodyType(PressAreaButton(h: 4, v: 4, shape: Circle(), action: {}) { Color.red.frame(width: 36, height: 36) })
        XCTAssertTrue(try XCTUnwrap(Self.buttonLabel(in: circle), circle).hasSuffix("_ContentShapeModifier<Circle>>"), circle)
    }

    func testThePressReachesFortyFourPointsInBothRoomsAtEverySize() throws {
        FPFonts.register()
        let m = try Self.modelSwitch()
        for (roomName, room) in CoachRenderTests.rooms {
            for (sizeName, size) in CoachRenderTests.sizes {
                let theme = RoomTheme(model: CoachFixtures.model(try CoachFixtures.model("heavyweight-chat"), in: room), system: size)
                let what = "\(roomName) \(sizeName)"
                // the model switch: the drawn pill (its layout, given back by the press padding) plus the reach
                let host = UIHostingController(rootView: ModelSwitchButton(model: m, short: false, send: { _ in })
                    .environment(\.roomTheme, theme))
                let drawn = host.sizeThatFits(in: CGSize(width: 400, height: 400))
                let reach = ModelSwitchButton.pressReach(theme)
                XCTAssertGreaterThanOrEqual(drawn.height + 2 * reach.v, 44, "\(what): the model switch is pressed 44 pt tall (drawn \(drawn))")
                XCTAssertGreaterThanOrEqual(drawn.width + 2 * reach.h, 44, "\(what): and at least 44 wide")
                XCTAssertLessThan(drawn.height, 30, "\(what): the pill itself stays small (drawn \(drawn))")
                // Undo: 12 px of text on its own line between 6 px paddings, plus the reach
                let undoDrawn = theme.uiFont(.body, 12, 800).lineHeight + 2 * theme.px(6)
                XCTAssertGreaterThanOrEqual(undoDrawn + 2 * CoachToastView.undoReach(theme).v, 44, "\(what): Undo is pressed 44 pt tall")
            }
        }
    }
}
#endif
