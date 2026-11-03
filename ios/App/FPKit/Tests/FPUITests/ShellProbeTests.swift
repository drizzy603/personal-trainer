#if os(iOS) && DEBUG
import Foundation
import UIKit
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// ShellProbe's parts that need no running probe (11-shell.md H11; contract 15.3 as delta 14.2 and 14.10 changed it), on
/// a real window: `tapTab`'s control (the bar item labelled with TabsModel's `a11y`, then the controls that draw its
/// title, then the one a finger at their centre lands in), whose `.touchUpInside` runs the funnel once from a tap and, on
/// the selected tab, says `again`, and none while no finger could tap the bar (hidden, covered in its window or by a
/// window over it, as the shell's confirm covers it); the hub a `press
/// {where: hub}` may press (only while the owner sees it: never under the shell's confirm); `type`'s rule (keys only into a field that holds them, never
/// a draft for the key field, never the text in the event); the text input's report (its kind, whether it holds the
/// keys and text, the label VoiceOver reads, never its text); `axFindAll` (each element once, its first `axFind`'s);
/// and the page-state script's tabs-mode fields. The steps themselves run through the bridge in ShellBridgeTabsTests
/// (the tests' probe) and in the app (H11's scratch steps file, T15's self-test).
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

    /// `tapTab` under the shell's own forwarded confirm (the H11 review, round 2): ShellOverlay's window sits over the
    /// root's (level normal + 1) and a confirm fills the screen, its Cancel and confirm buttons over the bar's place and a
    /// dimmed backdrop that cancels on a tap, so a finger on a tab lands on the confirm, where the root window's own hit
    /// test sees an uncovered bar. The package host has no window scene for ShellOverlay (ScreenHost's toast-window cases
    /// skip for it), so a stand-in window over the root's plays it (the app's own is H11's in-app steps'): over the whole
    /// screen it takes the finger (nothing tapped, the selection stays), as it does over the item's place alone (the point
    /// is carried into the window's own space); a toast's strip under the status bar, or the window hidden, takes none,
    /// and the bar is tapped.
    func testTapTabTapsNothingUnderTheShellsConfirm() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("the tab root exists only on iOS 26 and later (D39)") }
        let r = RootRig(first: "log", look: TabsModel.defaults(for: .heavyweight))
        defer { r.letGo() }
        settle(r)
        let found = ShellProbe.tabControls(r.root, "progress")
        guard let item = found.controls.first else {
            throw XCTSkip("this host draws no control under the bar (the probe's tapTab finds them in the app)")
        }
        XCTAssertNotNil(ShellProbe.tapTarget(r.root, "progress").control, "the root's window alone: a finger reaches Progress")

        // the confirm's window: over the root's, the whole screen, the dimmed backdrop in it
        let shell = UIWindow(frame: r.window.frame)
        shell.windowScene = r.window.windowScene
        shell.windowLevel = .normal + 1
        let backdrop = UIView(frame: shell.bounds)
        backdrop.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shell.addSubview(backdrop)
        shell.isHidden = false
        defer { shell.isHidden = true }
        r.clear()
        let confirm = [(window: shell, name: "the shell's confirm")]
        let covered = ShellProbe.tapTarget(r.root, "progress", over: confirm)
        XCTAssertNil(covered.control, "a finger on Progress lands on the confirm")
        XCTAssertEqual(covered.why, "a finger on progress lands on the shell's confirm over the bar (on UIView)")
        XCTAssertEqual(covered.copies, found.controls.count, "the controls are still there: only a finger cannot reach them")
        XCTAssertNotNil(ShellProbe.tapTarget(r.root, "progress").control, "the root's window still sees an uncovered bar")
        XCTAssertEqual(r.root.selected, "log")
        XCTAssertTrue(r.runs.isEmpty, "nothing tapped")

        // over the item's own place alone: the point in the window's own space lands in it
        shell.frame = item.convert(item.bounds, to: r.window).insetBy(dx: -4, dy: -4)
        XCTAssertNil(ShellProbe.tapTarget(r.root, "progress", over: confirm).control, "a window over the item takes the finger")
        // a toast's strip under the status bar: no finger at the bar lands in it
        shell.frame = CGRect(x: 0, y: 62, width: r.window.bounds.width, height: 64)
        let toast = ShellProbe.tapTarget(r.root, "progress", over: [(window: shell, name: "the shell's toast")])
        XCTAssertNotNil(toast.control, toast.why ?? "nil")

        // the whole screen again, then hidden (the confirm answered, no toast): the bar is tapped
        shell.frame = r.window.frame
        XCTAssertNil(ShellProbe.tapTarget(r.root, "progress", over: confirm).control)
        shell.isHidden = true
        let tap = try XCTUnwrap(ShellProbe.tapTarget(r.root, "progress", over: confirm).control, "hidden: a finger reaches the bar")
        XCTAssertTrue(found.controls.contains { $0 === tap })
        tap.sendActions(for: .touchUpInside)
        XCTAssertEqual(r.root.selected, "progress")
        XCTAssertEqual(r.runs.map(\.source), [.tap])
    }

    /// `press {where: hub}` presses only a hub the owner sees (the H11 review, uikit lens): the Coach tab NATIVE and
    /// selected, not held blank, the hub the stack's top (not under the pushed chat), shown. Each other case says why.
    func testTheHubIsPressedOnlyWhileTheOwnerSeesIt() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("the tab root exists only on iOS 26 and later (D39)") }
        let r = RootRig(first: "log", look: TabsModel.defaults(for: .heavyweight))
        defer { r.letGo() }
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "no hub: the Coach tab is waiting, not native")
        r.root.setHome(r.home)
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is not on screen: log is selected")
        r.tap("coach")
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: nil).view === r.home.view, "the hub, on screen")
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: r.home.view).view === r.home.view, "H10's host: the same view")

        // held blank for a push on its way
        r.tap("log")
        r.root.holdBudget = 30
        r.root.select("coach", source: .page(intent: "chat"))
        XCTAssertTrue(r.root.held)
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is not on screen: the Coach tab is held blank for a push")
        r.root.releaseHold()

        // the chat pushed over it
        r.nav.pushViewController(UIViewController(), animated: false)
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is covered: the chat is pushed over it")
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: r.home.view).why, "the hub is covered: the chat is pushed over it")
        r.nav.popViewController(animated: false)
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: nil).view === r.home.view, "the chat popped: the hub again")

        // hidden, then the tab turned WEB, then the fallback
        r.home.view.isHidden = true
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is not on screen: hidden")
        r.home.view.isHidden = false
        r.root.setCoachMode(.web)
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "no hub: the Coach tab is web, not native")
        r.root.fallBack(why: .page, at: Date())
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "no hub: the tab root fell back")
    }

    /// `press {where: hub}` on a hub the owner would otherwise see (delta 17.13): not while the shell's confirm is open
    /// over it (the toast window fills the screen and ScreenHost hides the stack from VoiceOver, so neither a finger nor
    /// VoiceOver reaches it, though the accessibility walk would); not while any view up to the window is hidden or
    /// transparent (the walk goes past the hub's own view: the stack's, the slot's); not out of its window. Each says why;
    /// with none of them the hub is pressed again.
    func testTheHubIsPressedNeitherUnderTheShellsConfirmNorHiddenNorOutOfItsWindow() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("the tab root exists only on iOS 26 and later (D39)") }
        let r = RootRig(first: "coach", look: TabsModel.defaults(for: .heavyweight))
        defer { r.letGo() }
        r.root.setHome(r.home)
        settle(r, 0.3)
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: nil).view === r.home.view, "the hub, on screen")

        // the shell's confirm over it
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil, confirmOpen: true).why, "the hub is covered: the shell's confirm is open")
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: r.home.view, confirmOpen: true).why,
                       "the hub is covered: the shell's confirm is open", "H10's host: the same")
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: nil, confirmOpen: false).view === r.home.view, "answered: the hub again")

        // an ancestor hidden, then one transparent: the walk reaches past the hub's own view
        r.nav.view.isHidden = true
        XCTAssertFalse(r.home.view.isHidden)
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is not on screen: hidden", "the stack's view hidden")
        r.nav.view.isHidden = false
        r.root.coachSlot.view.alpha = 0
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is not on screen: hidden", "the slot transparent")
        r.root.coachSlot.view.alpha = 1
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: nil).view === r.home.view)

        // out of its window: the stack's view leaves it, nothing on the way up hidden (the web view stays where it is)
        let slotView = try XCTUnwrap(r.nav.view.superview)
        r.nav.view.removeFromSuperview()
        XCTAssertNil(r.home.view.window)
        XCTAssertEqual(ShellProbe.hubCheck(r.root, hosted: nil).why, "the hub is not on screen: out of its window")
        slotView.addSubview(r.nav.view)
        XCTAssertTrue(ShellProbe.hubCheck(r.root, hosted: nil).view === r.home.view, "back in the window")
        XCTAssertNotNil(r.webView.window)
    }

    /// `type {text}` (contract 5 K4, D47; the H11 review): into the key field only while it holds the keys, through UIKit's
    /// text input; otherwise an error event that types nothing and writes no draft (a canary typed at the connect screen
    /// must never land in `fpDraft.coach`); the composer not holding the keys gets the words in its own draft while the
    /// chat is up; no event carries any part of the text.
    func testTypeIntoTheKeyFieldOnlyWhileItHoldsTheKeysAndNeverIntoADraft() throws {
        let canary = "sk-ant-test-" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first { window.windowScene = scene }
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let key = UITextField(frame: CGRect(x: 20, y: 100, width: 300, height: 44))
        key.isSecureTextEntry = true
        window.addSubview(key)
        let store = CoachStore(draft: CoachComposerDraft(defaults: nil))
        func leaks(_ o: [String: Any]) -> String? {
            let line = String(decoding: try! JSONSerialization.data(withJSONObject: ShellProbe.jsonSafe(o)), as: UTF8.self)
            for start in 0...(canary.count - 6) {
                let piece = String(canary.dropFirst(start).prefix(6))
                if line.contains(piece) { return line }
            }
            return nil
        }

        // the key field without the keys: an error, nothing typed, no draft, whatever the chat
        for chatUp in [false, true] {
            let refused = ShellProbe.typeKeys(canary, into: key, chatUp: chatUp, composer: store)
            XCTAssertEqual(refused["error"] as? String, "the key field does not hold the keys: nothing typed")
            XCTAssertNil(refused["via"])
            XCTAssertEqual(refused["kind"] as? String, "key")
            XCTAssertEqual(refused["length"] as? Int, canary.count)
            XCTAssertEqual(key.text ?? "", "", "nothing typed into the field")
            XCTAssertEqual(store.draft.text, "", "no draft written (it would be saved as fpDraft.coach)")
            XCTAssertNil(leaks(refused))
        }

        // holding the keys: typed through UIKit's text input, and only the length said
        XCTAssertTrue(key.becomeFirstResponder(), "the field takes the keys (the scenario's nativeFocus)")
        defer { key.resignFirstResponder() }
        let typed = ShellProbe.typeKeys(canary, into: key, chatUp: false, composer: store)
        XCTAssertEqual(typed["via"] as? String, "keys")
        XCTAssertEqual(typed["kind"] as? String, "key")
        XCTAssertEqual(typed["length"] as? Int, canary.count)
        XCTAssertNil(typed["error"])
        XCTAssertEqual(key.text, canary, "typed as the keyboard types")
        XCTAssertEqual(store.draft.text, "")
        XCTAssertNil(leaks(typed))
        key.resignFirstResponder()

        // the composer without the keys: its own draft while the chat is up (its words are no secret); with no input and
        // no chat up, nothing
        let composer = UITextView(frame: CGRect(x: 20, y: 200, width: 300, height: 80))
        window.addSubview(composer)
        let drafted = ShellProbe.typeKeys("Bench felt heavy", into: composer, chatUp: true, composer: store)
        XCTAssertEqual(drafted["via"] as? String, "draft")
        XCTAssertEqual(drafted["kind"] as? String, "composer")
        XCTAssertEqual(store.draft.text, "Bench felt heavy")
        XCTAssertNil(drafted["text"])
        let none = ShellProbe.typeKeys("more", into: nil, chatUp: false, composer: store)
        XCTAssertEqual(none["error"] as? String, "no text input on the top screen: nothing typed")
        XCTAssertEqual(store.draft.text, "Bench felt heavy")
        XCTAssertEqual(ShellProbe.typeKeys("x", into: nil, chatUp: true, composer: nil)["error"] as? String, "no binding: nothing typed")
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
