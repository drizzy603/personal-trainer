#if os(iOS) && DEBUG
import Foundation
import UIKit
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// ShellProbe's parts that need no running probe (11-shell.md H11; contract 15.3 as delta 14.2 and 14.10 changed it), on
/// a real window: `tapTab`'s control (the bar item labelled with TabsModel's `a11y`, then the control that draws its
/// title), whose `.touchUpInside` runs the funnel once from a tap and, on the selected tab, says `again`; the text
/// input's report (its kind, whether it holds the keys and text, the label VoiceOver reads, never its text); `axFindAll`
/// (each element once, its first `axFind`'s); and the page-state script's tabs-mode fields. The steps themselves run in
/// the app (H11's scratch steps file, T15's self-test).
@MainActor
final class ShellProbeTests: XCTestCase {
    override func setUp() async throws {
        try await WebKitWarmUp.ensure()
    }

    /// Turns the run loop for `seconds`, laying the root out at each turn (UIKit lays the bar's buttons out over the
    /// first passes after the window shows).
    @available(iOS 26.0, *)
    private func settle(_ r: RootRig, _ seconds: Double = 0.5) {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            r.root.view.layoutIfNeeded()
        }
    }

    /// `tapTab` (delta 14.2): the item whose accessibility label is the model's `a11y`, then the controls under the bar
    /// that draw the item's title, never a control's own label or class, then the copy a finger at their centre lands in.
    /// Labels that differ from the titles, as a page's model may send them, prove the two lookups; `.touchUpInside` on the
    /// control is the owner's tap: one funnel run from a tap, no stray, and on the selected tab the re-tap (`again`).
    func testTapTabFindsTheControlThroughTheItemsLabelAndTitle() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("the tab root exists only on iOS 26 and later (D39)") }
        var look = TabsModel.defaults(for: .heavyweight)
        look.items = look.items.map { TabsModel.Item(id: $0.id, title: $0.title, a11y: "Open " + $0.title) }
        let r = RootRig(first: "log", look: look)
        defer { r.letGo() }
        settle(r)
        r.clear()

        func controls(_ v: UIView) -> Int { (v is UIControl ? 1 : 0) + v.subviews.reduce(0) { $0 + controls($1) } }
        guard controls(r.root.tabBar) > 0 else {
            throw XCTSkip("this host draws no control under the bar (the probe's tapTab finds them in the app)")
        }
        let found = ShellProbe.tabControls(r.root, "progress")
        XCTAssertNil(found.why)
        XCTAssertFalse(found.controls.isEmpty, "the controls that draw Progress")
        XCTAssertTrue(found.controls.allSatisfy { c in Self.draws(c, "Progress") }, "every control found draws the item's title")
        let target = ShellProbe.tapTarget(r.root, "progress")
        XCTAssertNil(target.why)
        XCTAssertEqual(target.copies, found.controls.count)
        let control = try XCTUnwrap(target.control, "the copy a finger on Progress lands in")
        XCTAssertTrue(found.controls.contains { $0 === control })
        let centre = control.convert(CGPoint(x: control.bounds.midX, y: control.bounds.midY), to: r.window)
        XCTAssertTrue(r.window.hitTest(centre, with: nil)?.isDescendant(of: control) == true, "where a finger lands")
        control.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.root.selected, "progress", "the control's own action runs the funnel")
        XCTAssertEqual(r.runs.count, 1)
        XCTAssertEqual(r.runs.last?.source, .tap)
        XCTAssertEqual(r.runs.last?.moved, true)

        // the selected tab again: the owner's re-tap
        settle(r, 0.2)
        let again = try XCTUnwrap(ShellProbe.tapTarget(r.root, "progress").control)
        again.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.runs.count, 2)
        XCTAssertEqual(r.runs.last?.source, .tap)
        XCTAssertEqual(r.runs.last?.moved, false, "a re-tap moves nothing")
        XCTAssertEqual(r.runs.last?.json["again"] as? Bool, true)
        XCTAssertEqual(r.root.strays, 0, "no stray: the tap went through shouldSelect")

        // the item is found by its label: a model label no item carries finds nothing (no fallback to the title)
        XCTAssertEqual(ShellProbe.tabControls(r.root, "nope").why, "the tab model has no item nope")
        r.root.tabBar.items?[1].accessibilityLabel = "Progress"
        let lost = ShellProbe.tabControls(r.root, "progress")
        XCTAssertTrue(lost.controls.isEmpty)
        XCTAssertEqual(lost.why, "no bar item labelled Open Progress")
    }

    /// Whether `v` draws `title` (a UILabel with that text under it).
    private static func draws(_ v: UIView, _ title: String) -> Bool {
        if let l = v as? UILabel, l.text == title { return true }
        return v.subviews.contains { draws($0, title) }
    }

    /// `tapTab` taps only what a finger could (the H11 review, uikit lens): `sendActions` skips hit-testing, so a bar a
    /// web sheet has hidden, or one a view covers inside the window, would still have run a "tap" through the funnel, a
    /// selection the owner cannot make. Neither gives a control (nothing is tapped, the selection stays); the bar shown
    /// and uncovered again does.
    func testTapTabTapsNothingAFingerCouldNotReach() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("the tab root exists only on iOS 26 and later (D39)") }
        let r = RootRig(first: "log", look: TabsModel.defaults(for: .heavyweight))
        defer { r.letGo() }
        settle(r)
        guard !ShellProbe.tabControls(r.root, "progress").controls.isEmpty else {
            throw XCTSkip("this host draws no control under the bar (the probe's tapTab finds them in the app)")
        }
        XCTAssertNotNil(ShellProbe.tapTarget(r.root, "progress").control, "the bar shown: a finger reaches Progress")

        // a web sheet hides the bar (contract 3.4): no finger can tap it
        _ = r.root.setSheets(open: true)
        settle(r)
        XCTAssertTrue(r.root.isTabBarHidden)
        r.clear()
        let hidden = ShellProbe.tapTarget(r.root, "progress")
        XCTAssertNil(hidden.control, "a hidden bar is tapped by no one")
        XCTAssertEqual(hidden.why, "the bar is hidden (a sheet is open, or the root fell back): no finger can tap progress")
        XCTAssertGreaterThan(hidden.copies, 0, "the controls are still there: only a finger cannot reach them")
        XCTAssertEqual(r.root.selected, "log")
        XCTAssertTrue(r.runs.isEmpty)

        // shown again, then covered inside the window (as a presented controller covers it): nothing either
        _ = r.root.setSheets(open: false)
        settle(r, 0.8)
        XCTAssertFalse(r.root.isTabBarHidden)
        XCTAssertNotNil(ShellProbe.tapTarget(r.root, "progress").control, "shown again")
        let cover = UIView(frame: r.window.bounds)
        cover.backgroundColor = .systemBackground
        r.window.addSubview(cover)
        let covered = ShellProbe.tapTarget(r.root, "progress")
        XCTAssertNil(covered.control, "a finger lands on what covers the bar")
        XCTAssertEqual(covered.why?.hasPrefix("a finger on progress lands outside the bar"), true, covered.why ?? "nil")
        cover.removeFromSuperview()
        let back = try XCTUnwrap(ShellProbe.tapTarget(r.root, "progress").control, "uncovered: a finger reaches it again")
        back.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.root.selected, "progress")
        XCTAssertEqual(r.runs.map(\.source), [.tap])
    }

    /// The state's `input` (contract 5 K1, K4; 15.3; delta 14.10): the key field is the secure input, the composer any
    /// other; it says whether the input holds the keys and text and the label VoiceOver reads, and never any part of the
    /// text, whatever the field holds.
    func testTheInputReportNamesTheKindAndNeverTheText() throws {
        let canary = "sk-ant-test-" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.isHidden = false
        defer { window.isHidden = true }
        let key = UITextField(frame: CGRect(x: 20, y: 100, width: 300, height: 44))
        key.isSecureTextEntry = true
        key.accessibilityLabel = "Anthropic API Key"
        key.text = canary
        window.addSubview(key)
        let report = try XCTUnwrap(ShellProbe.inputReport(key) as? [String: Any])
        XCTAssertEqual(report["kind"] as? String, "key")
        XCTAssertEqual(report["hasText"] as? Bool, true)
        XCTAssertEqual(report["focused"] as? Bool, false)
        XCTAssertEqual(report["inWindow"] as? Bool, true)
        XCTAssertEqual(report["a11yLabel"] as? String, "Anthropic API Key", "the label VoiceOver reads")
        XCTAssertEqual(report["a11yOn"] as? Bool, true)
        let quiet = try XCTUnwrap(ShellProbe.inputReport(key, spoken: false) as? [String: Any])
        XCTAssertTrue(quiet["a11yLabel"] is NSNull, "no label read while the accessibility runtime is off")
        XCTAssertEqual(quiet["a11yOn"] as? Bool, false)
        let line = String(decoding: try JSONSerialization.data(withJSONObject: ShellProbe.jsonSafe(report)), as: UTF8.self)
        for start in 0...(canary.count - 6) {
            let piece = String(canary.dropFirst(start).prefix(6))
            XCTAssertFalse(line.contains(piece), "no 6-character piece of the key: \(line)")
        }

        let composer = UITextView(frame: CGRect(x: 20, y: 200, width: 300, height: 80))
        composer.accessibilityLabel = "Message the coach"
        let empty = try XCTUnwrap(ShellProbe.inputReport(composer) as? [String: Any])
        XCTAssertEqual(empty["kind"] as? String, "composer")
        XCTAssertEqual(empty["hasText"] as? Bool, false)
        XCTAssertEqual(empty["inWindow"] as? Bool, false)
        XCTAssertEqual(ShellProbe.inputKind(UITextField()), "composer", "only a secure field is the key field")
        XCTAssertTrue(ShellProbe.inputReport(nil) is NSNull, "no input: null")
    }

    /// `press`'s count (12-coach.md section 5, N15: one match): every element carrying the label, each once though the
    /// walk reaches it twice (in `accessibilityElements` and as a subview); its first is the one `axFind` presses.
    func testAxFindAllCountsEachElementOnce() {
        // plain views made elements by hand: a UIButton is one only while the accessibility runtime is on
        func element(_ label: String) -> UIView {
            let v = UIView()
            v.isAccessibilityElement = true
            v.accessibilityLabel = label
            return v
        }
        let root = UIView()
        let back = element("Back")
        let inner = UIView()
        let second = element("Back")
        inner.addSubview(second)
        let send = element("Send message")
        root.addSubview(back)
        root.addSubview(inner)
        root.addSubview(send)
        root.accessibilityElements = [back, inner, send]
        let found = ShellProbe.axFindAll("Back", in: root)
        XCTAssertEqual(found.count, 2)
        XCTAssertTrue(found.first === ShellProbe.axFind("Back", in: root), "the first is the one a press activates")
        XCTAssertEqual(ShellProbe.axFindAll("Send message", in: root).count, 1)
        XCTAssertTrue(ShellProbe.axFindAll("Nothing", in: root).isEmpty)
    }

    /// The page fields the tools read in every state (10-page.md section 8's names): tabs mode, the class, `#tabs`'
    /// display, the bar variables in CSS px, the zoom, the visit's clocks, the Coach tab's placeholder and mode, the seq
    /// seen, the open sheets and holds, and the scene's `fp_tab`.
    func testThePageStateScriptReadsTheTabsModeFields() async throws {
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let html = """
            <!doctype html><html class="fp-tabs" style="--fp-bar-h:66px;--fp-safe-b:34px;--fp-clear:107px;--fp-bar-up:83px;\
            --fp-sheet-b:42px;zoom:1.12"><body><nav id="tabs" style="display:none"></nav>
            <div id="screen"><div class="kt-fp-ph" data-fp-screen="coachHome"></div></div>
            <div class="kt-sheet-overlay fp-hold"></div>
            <script>
            var _fp = {hello: {v: 1}, shown: {coachHome: true}, covered: true, off: {}, v: 1,
                       tabs: {mode: true, left: false, why: '', seq: 7}};
            var _SHEETS_SEL = '.kt-sheet-overlay, .kt-close-sheet';
            var currentTab = 'coach', _visitFrom = 111, _awayFrom = 222;
            function _fpCoachMode() { return 'native'; }
            try { localStorage.setItem('kt_last_open', '333'); sessionStorage.setItem('fp_tab', 'coach'); } catch (e) {}
            window.__ready = true;
            </script></body></html>
            """
        wv.loadHTMLString(html, baseURL: URL(string: "https://fp.test/"))
        let deadline = Date().addingTimeInterval(10)
        while (try? await wv.evaluateJavaScript("window.__ready === true")) as? Bool != true {
            guard Date() < deadline else { return XCTFail("the stand-in page did not load") }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        let raw = try await wv.callAsyncJavaScript("return JSON.stringify((function () { \(ShellProbe.pageStateJS) })());",
                                                   arguments: [:], in: nil, contentWorld: .page)
        let text = try XCTUnwrap(raw as? String)
        let s = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
        XCTAssertEqual(s["tabsMode"] as? Bool, true)
        XCTAssertEqual(s["tabsLeft"] as? Bool, false)
        XCTAssertEqual(s["fpTabsClass"] as? Bool, true)
        XCTAssertEqual(s["tabsDisplay"] as? String, "none")
        let vars = try XCTUnwrap(s["vars"] as? [String: Any])
        XCTAssertEqual((vars["barH"] as? NSNumber)?.doubleValue, 66, "each variable read from its own (all differ here)")
        XCTAssertEqual((vars["safeB"] as? NSNumber)?.doubleValue, 34)
        XCTAssertEqual((vars["clear"] as? NSNumber)?.doubleValue, 107)
        XCTAssertEqual((vars["barUp"] as? NSNumber)?.doubleValue, 83)
        XCTAssertEqual((vars["sheetB"] as? NSNumber)?.doubleValue, 42)
        XCTAssertEqual((s["zoom"] as? NSNumber)?.doubleValue ?? 0, 1.12, accuracy: 0.0001)
        XCTAssertEqual((s["lastOpen"] as? NSNumber)?.intValue, 333)
        XCTAssertEqual((s["visitFrom"] as? NSNumber)?.intValue, 111)
        XCTAssertEqual((s["awayFrom"] as? NSNumber)?.intValue, 222)
        XCTAssertEqual(s["screenChild"] as? Bool, true)
        XCTAssertEqual(s["phScreen"] as? String, "coachHome")
        XCTAssertEqual((s["seqSeen"] as? NSNumber)?.intValue, 7)
        XCTAssertEqual(s["coachMode"] as? String, "native")
        XCTAssertEqual((s["sheetsOpen"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((s["holds"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual(s["fpTab"] as? String, "coach")
        XCTAssertEqual(s["tab"] as? String, "coach")
    }
}
#endif
