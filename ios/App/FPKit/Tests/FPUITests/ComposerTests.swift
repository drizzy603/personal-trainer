#if os(iOS)
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// The composer's box with a long draft (plan task C6; the third UI review found a four-line
/// draft lost its fourth line): it grows with the draft to four whole 22 px lines, every one of
/// them in view, then holds there and scrolls inside them, as the web's box grows to its cap.
@MainActor
final class ComposerTests: XCTestCase {
    /// Lines short enough to keep to one line each at every size the chat draws at.
    static let lines = ["Squats hurt.", "Drop the load,", "swap to box,", "or rest a week?", "And Legs 2?", "Thanks!"]

    /// A draft of `n` lines (Return makes a new line in the box).
    static func draft(_ n: Int) -> String { lines.prefix(n).joined(separator: "\n") }

    /// The chat with `model`'s draft in the box, laid out in a window at the phone's size; hands
    /// the box's text view to `body`.
    static func withTextView(_ model: CoachModel, size: DynamicTypeSize, _ body: (UITextView) throws -> Void) throws {
        let host = UIHostingController(rootView: CoachRenderTests.Phone(model: model, size: size))
        host.safeAreaRegions = []
        let window = UIWindow(frame: CGRect(origin: .zero, size: CoachRenderTests.screen))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        func find(_ v: UIView) -> UITextView? {
            if let t = v as? UITextView { return t }
            for s in v.subviews { if let t = find(s) { return t } }
            return nil
        }
        // the text view lays a draft out a pass late: lay out until its size holds
        var last = CGSize(width: -1, height: -1)
        for _ in 0..<30 {
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.03))
            guard let tv = find(host.view) else { continue }
            let now = CGSize(width: tv.bounds.height, height: tv.contentSize.height)
            if now == last { break }
            last = now
        }
        try body(try XCTUnwrap(find(host.view), "the composer's box"))
    }

    func testTheBoxShowsEveryLineUpToFourThenScrollsInsideFourWholeLines() throws {
        FPFonts.register()
        let base = try CoachFixtures.model("heavyweight-chat")
        var report: [String] = []
        for (roomName, room) in CoachRenderTests.rooms {
            for (sizeName, size) in CoachRenderTests.sizes {
                let theme = RoomTheme(model: CoachFixtures.model(base, in: room), system: size)
                let font = theme.uiFont(.body, 16, 400)
                let line = theme.px(22)
                // four lines on the 22 px pitch: the last ends at the face's own height
                let fourLines = (4 * line - (line - font.lineHeight)).rounded(.up)
                for n in 1...6 {
                    var m = CoachFixtures.model(base, in: room)
                    m.composer.draft = Draft(text: Self.draft(n), nonce: "lines-\(n)")
                    let what = "\(roomName) \(sizeName), a \(n)-line draft"
                    try Self.withTextView(m, size: size) { tv in
                        let shown = tv.bounds.height, content = tv.contentSize.height
                        report.append(String(format: "%@ %@ lines=%d box=%.1f content=%.1f offset=%.1f cap=%.1f", roomName, sizeName, n, shown, content, tv.contentOffset.y, fourLines))
                        XCTAssertEqual(tv.text, Self.draft(n), what)
                        if n <= 4 {
                            // every line in view: the box is as tall as its text (the text view
                            // rounds its content up to a whole point)
                            XCTAssertGreaterThanOrEqual(shown, content - 1, "\(what): every line shows")
                            XCTAssertEqual(tv.contentOffset.y, 0, accuracy: 0.5, "\(what): nothing scrolled away")
                        } else {
                            // four whole lines, the rest a scroll away (a line's worth or more)
                            XCTAssertEqual(shown, fourLines, accuracy: 1, "\(what): the box holds at four whole lines")
                            XCTAssertGreaterThan(content - shown, line * CGFloat(n - 4) - 1, "\(what): the lines past four scroll")
                            // the box scrolls (the text view follows the caret while typing: this
                            // host has no window scene, so nothing here can take the keyboard),
                            // and scrolled to its end it shows the newest line whole under three
                            // whole lines: it has scrolled by whole lines of the pitch
                            XCTAssertTrue(tv.isScrollEnabled, "\(what): the box scrolls")
                            tv.setContentOffset(CGPoint(x: 0, y: content - shown), animated: false)
                            let y = tv.contentOffset.y
                            let caret = tv.caretRect(for: tv.endOfDocument)
                            report.append(String(format: "   at its end: offset=%.1f, the last line %.1f...%.1f", y, caret.minY, caret.maxY))
                            XCTAssertEqual(y, content - shown, accuracy: 0.5, "\(what): the box scrolls to its end")
                            // (the caret stands up to two thirds of a point past its line)
                            XCTAssertLessThanOrEqual(caret.maxY, y + shown + 1, "\(what): the newest line shows whole at the end")
                            XCTAssertEqual(y, (y / line).rounded() * line, accuracy: 1, "\(what): scrolled by whole lines")
                        }
                    }
                }
            }
        }
        if let dir = ProcessInfo.processInfo.environment["FPUI_SHOTS"], !dir.isEmpty {
            let url = URL(fileURLWithPath: dir, isDirectory: true).appendingPathComponent("composer-measure.txt")
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try report.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
        }
    }
}
#endif
