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

    /// The box is as tall as its draft and never taller: empty or one line, the row is 58 pt and
    /// its text sits on the row's one line; with more, the box grows up to four lines. Wherever the
    /// draft stands, the text ends on the row's last line, the composer's padding and the line's
    /// own padding over the composer's foot. (A frame with the four-line max height grew to it
    /// whatever the draft: the empty box and every shorter draft sat in a four-line box, the text
    /// floating in its middle. The text view itself kept its own height, so the test above missed it.)
    func testTheBoxIsAsTallAsItsDraftAndNoTaller() throws {
        FPFonts.register()
        let base = try CoachFixtures.model("heavyweight-chat")
        var report: [String] = []
        for (roomName, room) in CoachRenderTests.rooms {
            for (sizeName, size) in CoachRenderTests.sizes {
                let theme = RoomTheme(model: CoachFixtures.model(base, in: room), system: size)
                let font = theme.uiFont(.body, 16, 400)
                let linePad = (theme.px(44) - font.lineHeight) / 2
                // the composer's foot: the screen less the home indicator's area and the 8 px under it
                let foot = CoachRenderTests.screen.height - CoachRenderTests.safeBottom - theme.px(8)
                let lastLineEnds = foot - (theme.space(.composerPad) + 1) - linePad
                for n in 0...6 {
                    var m = CoachFixtures.model(base, in: room)
                    m.composer.draft = n == 0 ? nil : Draft(text: Self.draft(n), nonce: "fit-\(n)")
                    let what = "\(roomName) \(sizeName), " + (n == 0 ? "no draft" : "a \(n)-line draft")
                    try Self.withTextView(m, size: size) { tv in
                        let frame = tv.convert(tv.bounds, to: nil)
                        report.append(String(format: "%@ %@ lines=%d text %.1f...%.1f, the last line ends at %.1f", roomName, sizeName, n, frame.minY, frame.maxY, lastLineEnds))
                        XCTAssertEqual(frame.maxY, lastLineEnds, accuracy: 1, "\(what): the text ends on the row's last line (the box no taller than its text)")
                    }
                }
            }
        }
        if let dir = ProcessInfo.processInfo.environment["FPUI_SHOTS"], !dir.isEmpty {
            let url = URL(fileURLWithPath: dir, isDirectory: true).appendingPathComponent("composer-fit.txt")
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try report.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
        }
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

    // MARK: The photo with the keys up, the focus across a text-size change (N5)

    /// The pending photo is capped at 140 px, and at 96 px while the keys are up, as the web caps
    /// `.coach-img-preview img` under `html.kb-open`, at every size in both rooms.
    func testTheImageCapIs96WithTheKeysUpAnd140Otherwise() throws {
        let base = try CoachFixtures.model("heavyweight-chat")
        for (roomName, room) in CoachRenderTests.rooms {
            for (sizeName, size) in CoachRenderTests.sizes {
                let theme = RoomTheme(model: CoachFixtures.model(base, in: room), system: size)
                XCTAssertEqual(PendingPhotoView.imageCap(keysUp: true, theme: theme), theme.px(96), "\(roomName) \(sizeName): keys up")
                XCTAssertEqual(PendingPhotoView.imageCap(keysUp: false, theme: theme), theme.px(140), "\(roomName) \(sizeName): keys down")
            }
        }
    }

    /// A tall photo fills the cap and no more: the card is the cap plus its chrome (the 8 px padding
    /// and the 1 px border, each side), 96 px with the keys up, 140 px with them down.
    func testAPendingTallPhotoIsCappedLowerWithTheKeysUp() throws {
        FPFonts.register()
        let base = try CoachFixtures.model("heavyweight-chat")
        let tall = UIGraphicsImageRenderer(size: CGSize(width: 300, height: 2000)).image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 300, height: 2000))
        }
        for (roomName, room) in CoachRenderTests.rooms {
            for (sizeName, size) in CoachRenderTests.sizes {
                let theme = RoomTheme(model: CoachFixtures.model(base, in: room), system: size)
                let chrome = 2 * (theme.px(8) + 1)
                for keysUp in [true, false] {
                    let host = UIHostingController(rootView: PendingPhotoView(image: tall, keysUp: keysUp, onRemove: {})
                        .environment(\.roomTheme, theme))
                    let drawn = host.sizeThatFits(in: CGSize(width: 350, height: 2000))
                    let cap = PendingPhotoView.imageCap(keysUp: keysUp, theme: theme)
                    let what = "\(roomName) \(sizeName), keys \(keysUp ? "up" : "down")"
                    XCTAssertLessThanOrEqual(drawn.height, cap + chrome + 0.5, "\(what): the card is at most the cap plus its chrome (\(drawn))")
                    XCTAssertGreaterThanOrEqual(drawn.height, cap + chrome - 1, "\(what): a tall photo fills the cap (\(drawn))")
                }
            }
        }
    }

    /// The software keyboard is up when its end frame covers more than 120 pt of the window (the
    /// web's `kb-open` threshold); a hardware keyboard's shortcut bar, or keys moved off screen, are not.
    func testTheKeysAreUpOnlyPastTheWebsThreshold() {
        let window = CGRect(x: 0, y: 0, width: 390, height: 844)
        XCTAssertTrue(CoachComposer.keysUp(end: CGRect(x: 0, y: 844 - 336, width: 390, height: 336), in: window), "the software keyboard")
        XCTAssertFalse(CoachComposer.keysUp(end: CGRect(x: 0, y: 844 - 55, width: 390, height: 55), in: window), "a hardware keyboard's shortcut bar")
        XCTAssertFalse(CoachComposer.keysUp(end: CGRect(x: 0, y: 844 - 120, width: 390, height: 120), in: window), "120 pt is not past the threshold")
        XCTAssertTrue(CoachComposer.keysUp(end: CGRect(x: 0, y: 844 - 121, width: 390, height: 121), in: window), "121 pt is")
        XCTAssertFalse(CoachComposer.keysUp(end: CGRect(x: 0, y: 844, width: 390, height: 336), in: window), "keys moved below the window (hidden)")
        XCTAssertFalse(CoachComposer.keysUp(end: .zero, in: window), "no frame")
        XCTAssertTrue(CoachComposer.keysUp(end: CGRect(x: 0, y: 1194 - 400, width: 834, height: 400), in: CGRect(x: 0, y: 0, width: 834, height: 1194)), "an iPad's keys")
    }

    /// The field made anew for a new face size gets the focus back only when the owner had it at the
    /// old size: never a focus the owner did not have, and never one left at the size the box still has.
    func testTheFocusComesBackAfterATextSizeChangeOnlyWhenTheOwnerHadIt() {
        XCTAssertTrue(CoachComposer.refocus(focusedAt: 16, size: 17.9, focusedNow: false), "focused at the old size, dropped by the new field: back")
        XCTAssertFalse(CoachComposer.refocus(focusedAt: 16, size: 17.9, focusedNow: true), "still focused: nothing to give back")
        XCTAssertFalse(CoachComposer.refocus(focusedAt: nil, size: 17.9, focusedNow: false), "not focused before the change: no focus")
        XCTAssertFalse(CoachComposer.refocus(focusedAt: 16, size: 16, focusedNow: false), "the owner left the box at the same size: no focus")
        XCTAssertFalse(CoachComposer.refocus(focusedAt: nil, size: 16, focusedNow: false), "nothing at all")
    }
}
#endif
