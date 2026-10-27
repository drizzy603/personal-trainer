#if os(iOS)
import Combine
import Foundation
import UIKit
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// ShellBridge (plan task C5) on a real web view and the TrovoShell messages a page sends: crash markers found at launch
/// become verdicts through the link's book and turn the screen off for that shell and page build only (once: the file
/// is removed); hello negotiates through LinkState with ScreenGate; a screen up from the document before is named in the
/// next hello's answer (`up`) and stays up; a present the link does not allow, or with no model, is refused; the policy
/// file's "off" takes a screen down at once.
@MainActor
final class ShellBridgeTests: XCTestCase {
    private var folder: URL!
    private var defaults: UserDefaults!
    private var suite: String!
    private var window: UIWindow!
    private var root: UIViewController!
    private var webView: WKWebView!
    private var stand: StandInPresenting!

    override func setUp() async throws {
        try await WebKitWarmUp.ensure()
        stand = StandInPresenting()
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("fpshell-\(UUID().uuidString)", isDirectory: true)
        suite = "fp.shell.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        root = UIViewController()
        root.view = webView
        window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first { window.windowScene = scene }
        window.rootViewController = root
        window.makeKeyAndVisible()
    }

    override func tearDown() async throws {
        window?.isHidden = true
        window = nil
        defaults?.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: folder)
    }

    /// Build 60's bridge: the chat only.
    private func bridge() -> ShellBridge {
        ShellBridge(defaults: defaults, folder: folder, shellBuild: "60", binary: ["coach"])
    }

    /// Build 61's: coach, coachHome and tabs.
    private func bridge61() -> ShellBridge {
        ShellBridge(defaults: defaults, folder: folder, shellBuild: "61")
    }

    /// Loads PageLinkTests' stand-in page (window.FPScreens answering) after the bridge's document-start script is in.
    private func loadPage() async throws {
        webView.loadHTMLString(PageLinkTests.page, baseURL: URL(string: "https://fp.test/"))
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
            if !webView.isLoading, (try? await webView.evaluateJavaScript("typeof window.FPScreens")) as? String == "object" { return }
        }
        XCTFail("the stand-in page did not load")
    }

    private func message(_ b: ShellBridge, _ method: String, _ options: [String: Any]) async -> Result<[String: Any], Error> {
        await withCheckedContinuation { c in
            b.pageMessage(method, options: options, webView: webView) { c.resume(returning: $0) }
        }
    }

    /// The coach fixture as this boot's model JSON.
    private func modelJSON(boot: String, rev: Int) throws -> String {
        let url = CoachFixtures.coachDir.appendingPathComponent("heavyweight-chat.json")
        var o = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        o["boot"] = boot
        o["rev"] = rev
        return String(decoding: try JSONSerialization.data(withJSONObject: o), as: UTF8.self)
    }

    func testACrashMarkerTurnsTheScreenOffForItsShellAndPageBuildOnce() async throws {
        let markers = ScreenMarkers(folder: folder)
        markers.write("coach", page: "P1", shell: "60")
        let b = bridge()
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), [], "the verdict: no native coach for this pair")
        XCTAssertEqual(b.markersFound, ["presenting coach@P1 shell 60"])
        XCTAssertTrue(markers.found(defaultShell: "60").isEmpty, "the marker acts once")
        let book = ShellBridge.loadBook(folder: folder, defaults: defaults)
        XCTAssertEqual(book.disabled.map { "\($0.piece) \($0.shell) \($0.page)" }, ["coach 60 P1"], "kept in the book file")
        // hello from that page build: linked, no screen
        let r = await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"])
        XCTAssertEqual(try r.get()["screens"] as? [String], [])
        // the next launch (a new bridge on the same files) finds no marker, keeps the verdict, and a new page build is clean
        let next = bridge()
        XCTAssertEqual(next.install(webView: webView, presenter: root, pageBuild: "P1"), [])
        XCTAssertEqual(next.markersFound, [])
        let other = bridge()
        XCTAssertEqual(other.install(webView: webView, presenter: root, pageBuild: "P2"), ["coach"])
    }

    func testHelloNamesTheScreenStillUpAndTheShellResyncsWithoutResending() async throws {
        let b = bridge()
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        b.binding?.screens.presenting = stand   // the test host has no window scene for UIKit to present in
        try await loadPage()
        let hello = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"]).get()
        XCTAssertEqual(hello["v"] as? Int, 1)
        XCTAssertEqual(hello["screens"] as? [String], ["coach"])
        XCTAssertNil(hello["up"], "nothing up yet")
        // a present with no model is refused; with one it goes up
        if case .success = await message(b, "present", ["screen": "coach"]) { XCTFail("no model: refused") }
        _ = await message(b, "model", ["screen": "coach", "rev": 1, "json": try modelJSON(boot: "b1", rev: 1)])
        _ = try await message(b, "present", ["screen": "coach"]).get()
        let deadline = Date().addingTimeInterval(4)
        while stand.shown.last == nil, Date() < deadline { try await Task.sleep(nanoseconds: 30_000_000) }
        XCTAssertEqual(stand.shown.last?.modalPresentationStyle, .overFullScreen)
        // a reload: the next document's hello hears the chat is still up, and the chat stays
        let again = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b2"]).get()
        XCTAssertEqual(again["up"] as? [String], ["coach"])
        try await Task.sleep(nanoseconds: 600_000_000)
        XCTAssertNotNil(stand.shown.last, "the chat stays up for the page to take over")
        let records = try XCTUnwrap(b.binding?.pageLink.records)
        XCTAssertTrue(records.contains { $0.name == "coach.snapshot" && $0.boot == "b2" }, "resynced on the new boot: \(records.map { "\($0.name)@\($0.boot)" })")
        XCTAssertFalse(records.contains { $0.boot == "b2" && $0.name.hasPrefix("coach.") && $0.name != "coach.snapshot" }, "nothing of the old document sent again")
        // a page that cannot show it says dismiss, and the shell takes it down
        _ = await message(b, "dismiss", ["screen": "coach"])
        let gone = Date().addingTimeInterval(4)
        while stand.shown.last != nil, Date() < gone { try await Task.sleep(nanoseconds: 30_000_000) }
        XCTAssertNil(stand.shown.last)
    }

    func testThePolicyFilesOffTakesTheScreenDownAtOnceAndTellsThePage() async throws {
        let b = bridge()
        var policy = Policy.defaults
        b.environment.policy = { policy }
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        b.binding?.screens.presenting = stand   // the test host has no window scene for UIKit to present in
        try await loadPage()
        _ = await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"])
        _ = await message(b, "model", ["screen": "coach", "rev": 1, "json": try modelJSON(boot: "b1", rev: 1)])
        _ = await message(b, "present", ["screen": "coach"])
        let up = Date().addingTimeInterval(4)
        while stand.shown.last == nil, Date() < up { try await Task.sleep(nanoseconds: 30_000_000) }
        policy = Policy(screens: ["coach": .off])
        b.policyChanged(screens: ["coach"])
        let down = Date().addingTimeInterval(4)
        while stand.shown.last != nil, Date() < down { try await Task.sleep(nanoseconds: 30_000_000) }
        XCTAssertNil(stand.shown.last, "down at once")
        try await Task.sleep(nanoseconds: 300_000_000)
        let got = ((try? await webView.evaluateJavaScript("window.__got")) as? [String]) ?? []
        XCTAssertTrue(got.contains("screens.off"), "the page heard screens.off: \(got)")
        XCTAssertFalse(b.binding?.link.isLive("coach") ?? true, "off for the rest of the document")
        if case .success = await message(b, "present", ["screen": "coach"]) { XCTFail("a present after it is refused") }
    }

    /// A page that holds coach.send unanswered and answers coach.snapshot with `window.__snap` (the model JSON a test
    /// puts there).
    static let reloadPage = """
        <!doctype html><meta charset="utf-8"><title>fp</title><script>
        window.__got = [];
        window.FPScreens = { v: 1, call: function (name, args) {
          window.__got.push(name + (args && (args.nonce || args.id) ? ':' + (args.nonce || args.id) : ''));
          if (name === 'coach.send') return new Promise(function () {});
          if (name === 'coach.snapshot') return Promise.resolve(window.__snap ? { ok: true, json: window.__snap } : { ok: false, error: 'none' });
          return Promise.resolve({ ok: true });
        } };
        </script>
        """

    private func loadReloadPage(marking old: Bool) async throws {
        if old { _ = try? await webView.evaluateJavaScript("window.__fpOld = true; 0") }
        webView.loadHTMLString(Self.reloadPage, baseURL: URL(string: "https://fp.test/"))
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
            let ready = "typeof window.FPScreens === 'object' && typeof window.__fpOld === 'undefined'"
            if !webView.isLoading, (try? await webView.evaluateJavaScript(ready)) as? Bool == true { return }
        }
        XCTFail("the stand-in page did not load")
    }

    /// The live chat across a reload under it (plan task C7): the open confirm closes as stale, the message in flight ends
    /// with its document and is never sent again, the next document's hello takes the chat over and its snapshot is drawn
    /// (a new boot, whatever its rev), and the words the page never got are back in the composer.
    func testAReloadUnderTheLiveChatResyncsClosesTheConfirmAndPutsTheMessageBack() async throws {
        let b = bridge()
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        let screens = try XCTUnwrap(b.binding?.screens)
        screens.presenting = stand
        try await loadReloadPage(marking: false)
        _ = await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"])
        _ = await message(b, "model", ["screen": "coach", "rev": 5, "json": try modelJSON(boot: "b1", rev: 5)])
        _ = try await message(b, "present", ["screen": "coach"]).get()
        let up = Date().addingTimeInterval(4)
        while stand.shown.last == nil, Date() < up { try await Task.sleep(nanoseconds: 30_000_000) }
        _ = try await message(b, "confirm", ["id": "c1.b1", "title": "Restore previous programme?", "confirm": "Restore"]).get()
        XCTAssertEqual(screens.openConfirm, "c1.b1")
        screens.coach.draft.text = "Lost in the reload"
        XCTAssertTrue(screens.coach.sendComposer(nonce: "n-reload"))
        try await Task.sleep(nanoseconds: 300_000_000)
        let inPage = ((try? await webView.evaluateJavaScript("window.__got")) as? [String]) ?? []
        XCTAssertEqual(inPage.filter { $0.hasPrefix("coach.") }, ["coach.send:n-reload"], "in the page, unanswered: \(inPage)")
        // the reload: a new document under the chat
        try await loadReloadPage(marking: true)
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertNil(screens.openConfirm, "the open confirm closed as stale")
        XCTAssertEqual(screens.coach.echoes.map(\.phase), [.unsure], "its send ended with its document; the next model decides")
        _ = try await webView.evaluateJavaScript("window.__snap = \(Self.jsString(try modelJSON(boot: "b2", rev: 1))); 0")
        let hello = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b2"]).get()
        XCTAssertEqual(hello["up"] as? [String], ["coach"], "the next document takes the chat over")
        let drawn = Date().addingTimeInterval(4)
        while screens.coach.model?.boot != "b2", Date() < drawn { try await Task.sleep(nanoseconds: 30_000_000) }
        XCTAssertEqual(screens.coach.model?.boot, "b2", "the new boot's snapshot is drawn though its rev is lower")
        XCTAssertEqual(screens.coach.model?.rev, 1)
        XCTAssertEqual(screens.coach.restored, ["Lost in the reload"])
        XCTAssertEqual(screens.coach.draft.text, "Lost in the reload")
        XCTAssertNotNil(stand.shown.last, "the chat stayed up all along")
        let got = ((try? await webView.evaluateJavaScript("window.__got")) as? [String]) ?? []
        XCTAssertFalse(got.contains { $0.hasPrefix("coach.send") }, "never sent again: \(got)")
        XCTAssertTrue(got.contains("coach.snapshot"), "resynced: \(got)")
        screens.tearDown()
    }

    private static func jsString(_ s: String) -> String {
        String(decoding: try! JSONSerialization.data(withJSONObject: [s]), as: UTF8.self).dropFirst().dropLast().description
    }

    /// Settings > About (decision.md section 6: "Settings > About says why"): after a crash verdict the status still
    /// lists the chat, off, with the verdict's words, and "Try the native chat again" clears the verdict through the
    /// link's book (kept in the book file) for the next document; this document keeps what it negotiated.
    func testStatusSaysWhyTheChatIsOffAndResetTurnsItBackOnForTheNextDocument() async throws {
        ScreenMarkers(folder: folder).write("coach", page: "P1", shell: "60")
        let b = bridge()
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), [], "the verdict: off for this pair")
        _ = await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"])
        let st = try await message(b, "status", [:]).get()
        let coach = try XCTUnwrap((st["screens"] as? [String: Any])?["coach"] as? [String: Any])
        XCTAssertEqual(coach["off"] as? String, "crash")
        XCTAssertEqual(coach["on"] as? Bool, false)
        XCTAssertEqual(coach["live"] as? Bool, false)
        XCTAssertEqual(coach["canReset"] as? Bool, true)
        XCTAssertEqual(coach["why"] as? String, "crash marker: the app closed while the native coach screen was up")
        let counters = try XCTUnwrap(st["counters"] as? [String: Any])
        XCTAssertEqual((counters["markers"] as? [String: Any])?["launch"] as? Int, 1, "the marker this launch found counts")
        XCTAssertEqual((counters["markers"] as? [String: Any])?["found"] as? [String], ["presenting coach@P1 shell 60"])
        XCTAssertEqual((counters["markers"] as? [String: Any])?["total"] as? Int, 1)
        // reset: the verdict goes from the book file, the status says on for the next document, this one is unchanged
        let after = try await message(b, "reset", ["screen": "coach"]).get()
        let again = try XCTUnwrap((after["screens"] as? [String: Any])?["coach"] as? [String: Any])
        XCTAssertEqual(again["on"] as? Bool, true)
        XCTAssertEqual(again["live"] as? Bool, false, "this document keeps what it negotiated")
        XCTAssertTrue(ShellBridge.loadBook(folder: folder, defaults: defaults).disabled.isEmpty, "the book file has no verdict left")
        XCTAssertFalse(b.binding?.link.isLive("coach") ?? true)
        if case .success = await message(b, "reset", ["screen": "settings"]) { XCTFail("a screen this binary lacks is refused") }
        // the next launch (a new bridge on the same files): the chat is on, the totals kept
        let next = bridge()
        XCTAssertEqual(next.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        XCTAssertEqual(next.counters.markers.total, 1, "the totals are kept across launches")
        XCTAssertEqual(next.launchCounts.markers, 0)
    }

    /// The breaker's trip is named in the status, counted, and cleared by reset the same way.
    func testStatusNamesTheBreakersTripAndResetClearsIt() async throws {
        let b = bridge()
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        _ = await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"])
        let fx = try XCTUnwrap(b.binding).link.editBook { _ = $0.trip(screen: "coach", pageBuild: "P1", reason: .failures, detail: "3 in a row: timeout, timeout, timeout", at: Date()) }
        XCTAssertTrue(fx.contains(.bookChanged))
        let st = try await message(b, "status", [:]).get()
        let coach = try XCTUnwrap((st["screens"] as? [String: Any])?["coach"] as? [String: Any])
        XCTAssertEqual(coach["off"] as? String, "breaker")
        XCTAssertEqual(coach["trip"] as? String, "failures")
        XCTAssertEqual(coach["why"] as? String, "3 in a row: timeout, timeout, timeout")
        _ = try await message(b, "reset", ["screen": "coach"]).get()
        XCTAssertNil(b.binding?.link.book.screens["coach"], "the trip is gone from the link's book")
        XCTAssertNil(ShellBridge.loadBook(folder: folder, defaults: defaults).screens["coach"], "and from the book file")
        let st2 = try await message(b, "status", [:]).get()
        XCTAssertEqual(((st2["screens"] as? [String: Any])?["coach"] as? [String: Any])?["on"] as? Bool, true)
    }

    /// The page reports visibilitychange while a native screen covers it: a hidden page counts only while the app is in
    /// use, and only when it went hidden after the app last became active (leaving the app, or a report that arrives
    /// after coming back, is by design).
    func testAHiddenPageCountsOnlyWhileTheAppIsInUse() async throws {
        let b = bridge()
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        b.appActive = { true }
        let since = Date()
        b.activeSince = since
        var r = try await message(b, "visibility", ["state": "hidden", "at": (since.timeIntervalSince1970 + 1) * 1000]).get()
        XCTAssertEqual(r["counted"] as? Bool, true)
        r = try await message(b, "visibility", ["state": "visible", "at": (since.timeIntervalSince1970 + 2) * 1000]).get()
        XCTAssertEqual(r["counted"] as? Bool, false, "coming back into view is no fault")
        r = try await message(b, "visibility", ["state": "hidden", "at": (since.timeIntervalSince1970 - 5) * 1000]).get()
        XCTAssertEqual(r["counted"] as? Bool, false, "hidden before the app became active: the app left the screen")
        b.appActive = { false }
        r = try await message(b, "visibility", ["state": "hidden"]).get()
        XCTAssertEqual(r["counted"] as? Bool, false, "the app is going to the background")
        XCTAssertEqual(b.counters.hidden.total, 1)
        XCTAssertEqual(b.launchCounts.hidden, 1)
        let st = try await message(b, "status", [:]).get()
        XCTAssertEqual(((st["counters"] as? [String: Any])?["hidden"] as? [String: Any])?["total"] as? Int, 1)
        b.noteLeftWindow()
        XCTAssertEqual(b.counters.leftWindow.total, 1)
        XCTAssertEqual(ShellCounters.decoded(defaults.data(forKey: ShellBridge.countersKey)).hidden.total, 1, "kept in the defaults")
    }

    func testAMessageFromAnotherWebViewIsRefused() async throws {
        let b = bridge()
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        let stranger = WKWebView(frame: .zero)
        let r: Result<[String: Any], Error> = await withCheckedContinuation { c in
            b.pageMessage("hello", options: ["v": 1, "page": "P1", "screens": ["coach"]], webView: stranger) { c.resume(returning: $0) }
        }
        if case .success = r { XCTFail("another page's hello is refused") }
    }

    /// Contract 3.1's refusal codes (D31): every refusal new in 61 reads `<code>: <words>`, and build 60's keep theirs.
    func testRefusalsNewIn61StartWithTheirCode() {
        let new: [(ShellBridge.Refusal, String)] = [(.off, "off"), (.badTab("home"), "bad-tab"), (.noSwitch("coach"), "no-switch"),
                                                   (.notPresentable("tabs"), "not-presentable"), (.notPresentable("coachHome"), "not-presentable"),
                                                   (.notNative, "not-native")]
        for (r, code) in new {
            let text = String(describing: r)
            XCTAssertTrue(text.hasPrefix(code + ": "), text)
            XCTAssertEqual(text.split(separator: ":", maxSplits: 1).first.map(String.init), code, text)
            XCTAssertEqual(r.code, code)
        }
        XCTAssertEqual(String(describing: ShellBridge.Refusal.badTab("home")), "bad-tab: home is not one of log, progress, coach, settings")
        XCTAssertEqual(String(describing: ShellBridge.Refusal.notPresentable("tabs")), "not-presentable: tabs is never presented")
        // build 60's words, unchanged
        XCTAssertEqual(String(describing: ShellBridge.Refusal.notThisPage), "not the page the shell is bound to")
        XCTAssertEqual(String(describing: ShellBridge.Refusal.badMessage("x")), "bad message: x")
        XCTAssertEqual(String(describing: ShellBridge.Refusal.notLive("coach")), "the coach screen is not on for this document")
        XCTAssertEqual(String(describing: ShellBridge.Refusal.noModel("coach")), "no coach model to open on")
        XCTAssertNil(ShellBridge.Refusal.notLive("coach").code)
    }

    /// Build 61 with no tab root yet (H1's stubs): `selectTab` and `sheets` are refused `off`, `setSwitch` `no-switch`;
    /// `present tabs` and `present coachHome` are refused `not-presentable` before build 60's checks; `dismiss tabs` is
    /// answered and changes nothing; `status {refresh: true}` answers the status.
    func testBuild61sNewMessagesWithNoTabRoot() async throws {
        let b = bridge61()
        XCTAssertEqual(b.shell.screens, ["coach", "coachHome", "tabs"])
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        b.binding?.screens.presenting = stand
        try await loadPage()
        let hello = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"]).get()
        XCTAssertEqual(hello["screens"] as? [String], ["coach"])
        XCTAssertNil(hello["tabs"], "no tabs negotiated, no tabs in the reply")
        func refusal(_ method: String, _ options: [String: Any]) async -> String? {
            if case .failure(let e) = await message(b, method, options) { return String(describing: e) }
            return nil
        }
        var why = await refusal("selectTab", ["tab": "progress"])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal("selectTab", ["tab": "nowhere", "intent": "chat"])
        XCTAssertEqual(why, "off: no live tab root", "no root: off before the id")
        why = await refusal("sheets", ["open": true])
        XCTAssertEqual(why, "off: no live tab root")
        why = await refusal("setSwitch", ["screen": "coach", "on": false])
        XCTAssertEqual(why, "no-switch: this binary keeps no switch for coach")
        why = await refusal("present", ["screen": "tabs"])
        XCTAssertEqual(why, "not-presentable: tabs is never presented")
        why = await refusal("present", ["screen": "coachHome"])
        XCTAssertEqual(why, "not-presentable: coachHome needs a live tab root")
        why = await refusal("selectTab", [:])
        XCTAssertEqual(why?.hasPrefix("bad message: selectTab"), true, why ?? "")
        // dismiss tabs: ok, nothing changes
        let records = b.binding?.pageLink.records.count ?? -1
        _ = try await message(b, "dismiss", ["screen": "tabs"]).get()
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertEqual(b.binding?.screens.shown, [])
        XCTAssertEqual(b.binding?.pageLink.records.count, records, "nothing sent to the page")
        XCTAssertTrue(b.binding?.link.isLive("coach") ?? false, "the chat is still this document's")
        XCTAssertNil(stand.shown.last)
        // the status, plain and with refresh, lists all three pieces
        let plain = try await message(b, "status", [:]).get()
        XCTAssertEqual(Set(((plain["screens"] as? [String: Any]) ?? [:]).keys), ["coach", "coachHome", "tabs"])
        let fresh = try await message(b, "status", ["refresh": true]).get()
        XCTAssertEqual(Set(((fresh["screens"] as? [String: Any]) ?? [:]).keys), ["coach", "coachHome", "tabs"])
    }

    /// The iOS 26 floor (contract 2.2, 10.5, D39) reaches the gate through the bridge: below 26 the status says `tabs`
    /// is off `os` (no switch, no Try again) and the Coach tab needs it; the flag's screens and the hello give build 60's
    /// overlay chat alone, whatever the page names. From 26 the bar's own checks pass and it needs a tab root.
    func testBelowIOS26TheBarIsOffForTheOS() async throws {
        let b = bridge61()
        b.osMajor = { 18 }
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        try await loadPage()
        let hello = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coachHome", "coach", "tabs"], "boot": "b1"]).get()
        XCTAssertEqual(hello["screens"] as? [String], ["coach"])
        XCTAssertNil(hello["tabs"], "no tabs negotiated below iOS 26")
        let st = try await message(b, "status", [:]).get()
        let screens = try XCTUnwrap(st["screens"] as? [String: Any])
        let tabs = try XCTUnwrap(screens["tabs"] as? [String: Any])
        XCTAssertEqual(tabs["off"] as? String, "os")
        XCTAssertEqual(tabs["canReset"] as? Bool, false, "the binary's own rule: no Try again")
        XCTAssertNil(tabs["needs"])
        let home = try XCTUnwrap(screens["coachHome"] as? [String: Any])
        XCTAssertEqual(home["off"] as? String, "needs")
        XCTAssertEqual(home["needs"] as? [String], ["tabs"])
        let coach = try XCTUnwrap(screens["coach"] as? [String: Any])
        XCTAssertEqual(coach["on"] as? Bool, true)
        XCTAssertEqual(coach["live"] as? Bool, true, "60's overlay chat")
        b.osMajor = { 26 }
        let later = try await message(b, "status", [:]).get()
        let bar = try XCTUnwrap((later["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(bar["off"] as? String, "needs")
        XCTAssertEqual(bar["needs"] as? [String], ["root"], "iOS 26: its own checks pass, a classic root until one is adopted")
    }

    /// A page whose `shell.covered` never answers (a state intent stalled in the page) and whose `ping` answers, never
    /// answers (`window.__pingDead`), or starts a navigation that never commits (`window.__pingNavigates`, a URL).
    static let stallPage = """
        <!doctype html><meta charset="utf-8"><title>fp</title><script>
        window.__got = [];
        window.FPScreens = { v: 1, call: function (name, args) {
          window.__got.push(name);
          if (name === 'shell.covered') return new Promise(function () {});
          if (name === 'ping') {
            if (window.__pingNavigates) { location.href = window.__pingNavigates; return new Promise(function () {}); }
            return window.__pingDead ? new Promise(function () {}) : Promise.resolve({ ok: true, v: 1 });
          }
          return Promise.resolve({ ok: true });
        } };
        </script>
        """

    /// A build 61 bridge under a classic root (no tab root before H7), linked to the stall page with the chat live: the
    /// piece a shell intent counts for. Timeouts scaled by `scale`.
    private func stalledBridge(_ setup: String = "0", scale: Double = 0.1) async throws -> (ShellBridge, ShellBridge.Binding) {
        let b = bridge61()
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        let binding = try XCTUnwrap(b.binding)
        binding.pageLink.timeoutScale = scale
        webView.loadHTMLString(Self.stallPage, baseURL: URL(string: "https://fp.test/"))
        let deadline = Date().addingTimeInterval(10)
        var ready = false
        while !ready, Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
            if !webView.isLoading, (try? await webView.evaluateJavaScript("typeof window.FPScreens")) as? String == "object" { ready = true }
        }
        // stop here, not at a 10 s expectation timeout further on that blames the ping
        guard ready else { throw StallPageDidNotLoad() }
        _ = try await webView.evaluateJavaScript(setup + "; 0")
        _ = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"]).get()
        XCTAssertEqual(binding.link.liveScreens, ["coach"], "a classic root: 60's overlay chat")
        XCTAssertEqual(binding.pageLink.pending, 0, "nothing in the link before the test's own intents")
        return (b, binding)
    }

    /// Fulfils `exp` when a ping record ends with `outcome` (PageLink's word), after the probe's own record hook.
    private func onPing(_ binding: ShellBridge.Binding, ends outcome: String, _ exp: XCTestExpectation) {
        let earlier = binding.pageLink.onRecord
        binding.pageLink.onRecord = { r in
            earlier?(r)
            if r.name == "ping", r.outcome == outcome { exp.fulfill() }
        }
    }

    /// Contract 4.4 (D41) through the bridge: two timed-out `shell.covered` are held, the link asks for one ping, the
    /// bridge sends it after them, and its answer drops both uncounted (a busy page, not a broken one).
    func testHeldTimeoutsSendOnePingWhoseAnswerDropsThem() async throws {
        let (b, binding) = try await stalledBridge()
        let pinged = expectation(description: "one ping, answered")
        onPing(binding, ends: "done", pinged)
        let first = expectation(description: "the first shell.covered times out")
        let second = expectation(description: "the second shell.covered times out")
        b.sendCounted(.shellCovered(on: true)) { outcome in
            XCTAssertEqual(outcome, .answered(.failed(.timeout)))
            first.fulfill()
        }
        b.sendCounted(.shellCovered(on: false)) { outcome in
            XCTAssertEqual(outcome, .answered(.failed(.timeout)))
            second.fulfill()
        }
        await fulfillment(of: [first, second, pinged], timeout: 10, enforceOrder: true)
        let names = binding.pageLink.records.map(\.name)
        XCTAssertEqual(names, ["shell.covered", "shell.covered", "ping"], "two holds, then one ping at the end of the queue")
        XCTAssertEqual(binding.link.heldTimeouts, 0, "the ping's answer dropped them")
        XCTAssertEqual(binding.link.book.screens["coach"]?.failures ?? 0, 0, "nothing counted")
        XCTAssertTrue(binding.link.isLive("coach"))
    }

    /// The same page dead to the ping too: the ping's failure counts the held timeout, then itself, against the live
    /// chat (two in a row: no trip yet).
    func testAHeldTimeoutCountsWhenThePingFailsToo() async throws {
        let (b, binding) = try await stalledBridge("window.__pingDead = true")
        let pinged = expectation(description: "the ping times out")
        onPing(binding, ends: "failed timeout", pinged)
        let covered = expectation(description: "shell.covered times out")
        b.sendCounted(.shellCovered(on: true)) { outcome in
            XCTAssertEqual(outcome, .answered(.failed(.timeout)))
            covered.fulfill()
        }
        await fulfillment(of: [covered, pinged], timeout: 10, enforceOrder: true)
        XCTAssertEqual(binding.pageLink.records.map(\.name), ["shell.covered", "ping"])
        XCTAssertEqual(binding.link.book.screens["coach"]?.failures, 2, "the hold, then the ping")
        XCTAssertEqual(binding.link.book.screens["coach"]?.recent, ["timeout", "timeout"])
        XCTAssertEqual(binding.link.heldTimeouts, 0)
        XCTAssertTrue(binding.link.isLive("coach"), "two in a row: no trip yet")
    }

    /// A ping cut short with no answer: a navigation under way at its timeout ends it `documentGone`, though one that
    /// never commits leaves the document in place. The bridge tells the link (`pingLost`), so the next held timeout
    /// asks for a new ping instead of being held for good.
    func testALostPingLetsTheNextHoldAskAgain() async throws {
        // a web view whose fpwait:// loads never answer: a navigation there stays provisional until it is stopped
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(NeverAnswers(), forURLScheme: "fpwait")
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        root.view = webView
        let (b, binding) = try await stalledBridge("window.__pingNavigates = 'fpwait://hold'", scale: 0.5)
        let lost = expectation(description: "the first ping ends unanswered")
        onPing(binding, ends: "gone", lost)
        let covered = expectation(description: "shell.covered times out")
        b.sendCounted(.shellCovered(on: true)) { outcome in
            XCTAssertEqual(outcome, .answered(.failed(.timeout)))
            covered.fulfill()
        }
        await fulfillment(of: [covered, lost], timeout: 10, enforceOrder: true)
        XCTAssertTrue(webView.isLoading, "the navigation is still under way")
        let stopped = keyValueObservingExpectation(for: webView as Any, keyPath: "loading", expectedValue: false)
        webView.stopLoading()
        await fulfillment(of: [stopped], timeout: 5)
        _ = try await webView.evaluateJavaScript("window.__pingNavigates = null; 0")
        XCTAssertEqual(binding.link.link?.boot, "b1", "the same document, still linked")
        XCTAssertEqual(binding.link.heldTimeouts, 1, "the hold waits")
        let answered = expectation(description: "a second ping, answered")
        onPing(binding, ends: "done", answered)
        b.sendCounted(.shellCovered(on: false)) { _ in }
        await fulfillment(of: [answered], timeout: 10)
        XCTAssertEqual(binding.pageLink.records.filter { $0.name == "ping" }.map(\.outcome), ["gone", "done"])
        XCTAssertEqual(binding.link.heldTimeouts, 0, "the second ping's answer dropped both holds")
        XCTAssertEqual(binding.link.book.screens["coach"]?.failures ?? 0, 0)
    }

    // MARK: Build 61's short sections, model markers and the shell's switch file (11-shell.md H6)

    private func markerURL(_ name: String) -> URL { folder.appendingPathComponent(name) }
    private func stateByte(_ name: String) -> UInt8? { (try? Data(contentsOf: markerURL(name)))?.last }
    private func exists(_ name: String) -> Bool { FileManager.default.fileExists(atPath: markerURL(name).path) }
    private func text(_ name: String) throws -> String { String(decoding: try Data(contentsOf: markerURL(name)), as: UTF8.self) }

    /// The file a launch that died inside a section of `piece` leaves behind.
    private func leftOpen(_ piece: CrashMarker.Piece, shell: String = "61", page: String = "P1") throws {
        let m = try XCTUnwrap(SectionMarker(folder: folder, piece: piece))
        XCTAssertTrue(m.begin(shell: shell, page: page))
        m.enter()   // and the process dies here
    }

    /// Build 61's bridge on a system that builds tab roots (the bar's own checks can pass).
    private func bridge61(os: Int) -> ShellBridge {
        let b = bridge61()
        b.osMajor = { os }
        return b
    }

    /// Tests 1 and 3 (`tabs@`): a death inside the tab root's section leaves its file at 1; the next launch (a new bridge
    /// on the same folder) records one verdict, counted, for that shell and page build, and removes the file; the root
    /// decision then reads `tabs` off (H9 builds the classic root). The launch after finds nothing and keeps the verdict;
    /// another page build is clean; a section that ended (0) gives none.
    func testASectionLeftOpenGivesOneVerdictAtTheNextLaunchAndTheFileGoes() async throws {
        try leftOpen(.tabs)
        let b = bridge61(os: 27)
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"], "60's overlay chat on a classic root")
        XCTAssertEqual(b.markersFound, ["tabs@P1 shell 61"])
        XCTAssertFalse(exists("section.tabs.marker"), "the marker acts once")
        XCTAssertEqual(ShellBridge.loadBook(folder: folder, defaults: defaults).disabled.map { "\($0.piece) \($0.shell) \($0.page)" }, ["tabs 61 P1"])
        XCTAssertEqual(b.launchCounts.markers, 1)
        XCTAssertEqual(b.counters.markers.total, 1)
        let checks = b.ownChecks(page: "P1", book: try XCTUnwrap(b.binding).link.book)
        guard case .crashMarker(let d)? = checks.off["tabs"] else {
            return XCTFail("the root decision reads tabs off: \(checks.off)")
        }
        XCTAssertEqual(d.why, "crash marker: the app closed during a tab change")
        let st = try await message(b, "status", [:]).get()
        let tabs = try XCTUnwrap((st["screens"] as? [String: Any])?["tabs"] as? [String: Any])
        XCTAssertEqual(tabs["off"] as? String, "crash")
        XCTAssertEqual(tabs["canReset"] as? Bool, true)
        let markers = try XCTUnwrap((st["counters"] as? [String: Any])?["markers"] as? [String: Any])
        XCTAssertEqual(markers["found"] as? [String], ["tabs@P1 shell 61"])
        XCTAssertEqual(markers["launch"] as? Int, 1)
        // the next launch: no marker, no second verdict, the verdict kept for the pair
        let next = bridge61(os: 27)
        next.install(webView: webView, presenter: root, pageBuild: "P1")
        XCTAssertEqual(next.markersFound, [])
        XCTAssertEqual(next.launchCounts.markers, 0)
        XCTAssertEqual(next.counters.markers.total, 1, "the total is kept across launches")
        XCTAssertEqual(ShellBridge.loadBook(folder: folder, defaults: defaults).disabled.count, 1)
        if case .crashMarker? = next.ownChecks(page: "P1", book: try XCTUnwrap(next.binding).link.book).off["tabs"] {} else {
            XCTFail("the verdict holds for its pair")
        }
        // another page build: the bar's own checks pass (on a classic root it then needs a tab root)
        let other = bridge61(os: 27)
        other.install(webView: webView, presenter: root, pageBuild: "P2")
        XCTAssertEqual(other.ownChecks(page: "P2", book: try XCTUnwrap(other.binding).link.book).on, ["coach", "coachHome", "tabs"])
        // a section that ended leaves 0: no verdict at the next launch, and the file stays for that launch to rewrite
        do {
            let m = try XCTUnwrap(SectionMarker(folder: folder, piece: .tabs))
            m.begin(shell: "61", page: "P3")
            m.around {}
        }
        let after = bridge61(os: 27)
        after.install(webView: webView, presenter: root, pageBuild: "P3")
        XCTAssertEqual(after.markersFound, [])
        XCTAssertEqual(after.ownChecks(page: "P3", book: try XCTUnwrap(after.binding).link.book).on, ["coach", "coachHome", "tabs"])
        XCTAssertEqual(stateByte("section.tabs.marker"), SectionMarker.outside)
    }

    /// Test 3: a model marker left at 1 turns that piece off for its (shell, page) pair only: the chat for `model
    /// coach@P1 shell 61`, the Coach tab for `model coachHome@...`; another page build or shell build keeps it.
    func testAModelMarkerTurnsItsPieceOffForItsPairOnly() async throws {
        try leftOpen(.model("coach"))
        let b = bridge61(os: 27)
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), [], "no native chat for this pair")
        XCTAssertEqual(b.markersFound, ["model coach@P1 shell 61"])
        XCTAssertFalse(exists("model.coach.marker"), "the marker acts once")
        let hello = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"]).get()
        XCTAssertEqual(hello["screens"] as? [String], [])
        let st = try await message(b, "status", [:]).get()
        let screens = try XCTUnwrap(st["screens"] as? [String: Any])
        let coach = try XCTUnwrap(screens["coach"] as? [String: Any])
        XCTAssertEqual(coach["off"] as? String, "crash")
        XCTAssertEqual(coach["why"] as? String, "crash marker: the app closed while reading a native coach model")
        XCTAssertEqual(coach["canReset"] as? Bool, true)
        XCTAssertEqual((screens["coachHome"] as? [String: Any])?["needs"] as? [String], ["tabs", "coach"], "the Coach tab needs the chat")
        XCTAssertEqual((screens["tabs"] as? [String: Any])?["needs"] as? [String], ["root"], "the bar is not that piece")
        // another page build, or another shell build, on the same book: the chat is on
        XCTAssertEqual(bridge61(os: 27).install(webView: webView, presenter: root, pageBuild: "P2"), ["coach"])
        let shell62 = ShellBridge(defaults: defaults, folder: folder, shellBuild: "62")
        shell62.osMajor = { 27 }
        XCTAssertEqual(shell62.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        // a Coach tab model's marker turns the Coach tab off, and nothing else
        try leftOpen(.model("coachHome"), page: "P2")
        let home = bridge61(os: 27)
        home.install(webView: webView, presenter: root, pageBuild: "P2")
        XCTAssertEqual(home.markersFound, ["model coachHome@P2 shell 61"])
        let checks = home.ownChecks(page: "P2", book: try XCTUnwrap(home.binding).link.book)
        if case .crashMarker? = checks.off["coachHome"] {} else { XCTFail("coachHome off: \(checks.off)") }
        XCTAssertEqual(checks.on, ["coach", "tabs"])
    }

    #if DEBUG
    /// Test 5: `-fpIgnoreMarker` (the tools end the app with simctl terminate) reports the short sections' markers and
    /// records nothing: the lines are found, no verdict, no count, and the files still go.
    func testIgnoreMarkerReportsTheShortSectionsAndRecordsNothing() async throws {
        try leftOpen(.tabs)
        try leftOpen(.model("coachHome"))
        let b = bridge61(os: 27)
        b.launchArguments = { ["App", "-fpIgnoreMarker"] }
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        XCTAssertEqual(b.markersFound, ["model coachHome@P1 shell 61", "tabs@P1 shell 61"], "reported")
        XCTAssertTrue(ShellBridge.loadBook(folder: folder, defaults: defaults).disabled.isEmpty, "no verdict recorded")
        XCTAssertEqual(b.launchCounts.markers, 0)
        XCTAssertEqual(b.counters.markers.total, 0)
        XCTAssertFalse(exists("section.tabs.marker"))
        XCTAssertFalse(exists("model.coachHome.marker"))
        XCTAssertEqual(b.ownChecks(page: "P1", book: try XCTUnwrap(b.binding).link.book).on, ["coach", "coachHome", "tabs"])
        let st = try await message(b, "status", [:]).get()
        let markers = try XCTUnwrap((st["counters"] as? [String: Any])?["markers"] as? [String: Any])
        XCTAssertEqual(markers["found"] as? [String], ["model coachHome@P1 shell 61", "tabs@P1 shell 61"])
        XCTAssertEqual(markers["launch"] as? Int, 0)
    }
    #endif

    /// The gate's `deviceOff` is the shell's switch file (contract 3.5, D5): `{"tabs": false}` turns the bar off on this
    /// device (the root decision reads it; Settings > About says so) and the Coach tab with it, while the chat keeps
    /// 60's overlay. The UserDefaults copy counts only when the file does not read.
    func testTheShellsSwitchFileTurnsTheBarOffInTheGate() async throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data(#"{"tabs":false}"#.utf8).write(to: markerURL("switches.json"))
        defaults.set(Data(#"{"tabs":true}"#.utf8), forKey: ShellSwitches.defaultsKey)
        let b = bridge61(os: 27)
        XCTAssertEqual(b.install(webView: webView, presenter: root, pageBuild: "P1"), ["coach"])
        XCTAssertEqual(b.switches.deviceOff, ["tabs"])
        XCTAssertEqual(b.ownChecks(page: "P1", book: try XCTUnwrap(b.binding).link.book).off["tabs"], ScreenGate.Off.deviceSwitch, "the root decision reads it")
        let st = try await message(b, "status", [:]).get()
        let screens = try XCTUnwrap(st["screens"] as? [String: Any])
        XCTAssertEqual((screens["tabs"] as? [String: Any])?["off"] as? String, "device")
        XCTAssertEqual((screens["coachHome"] as? [String: Any])?["needs"] as? [String], ["tabs"])
        XCTAssertEqual((screens["coach"] as? [String: Any])?["on"] as? Bool, true)
        // no file: the copy (off here); a file that says on wins over a copy that says off
        try FileManager.default.removeItem(at: markerURL("switches.json"))
        defaults.set(Data(#"{"tabs":false}"#.utf8), forKey: ShellSwitches.defaultsKey)
        let copyOnly = bridge61(os: 27)
        copyOnly.install(webView: webView, presenter: root, pageBuild: "P1")
        XCTAssertEqual(copyOnly.ownChecks(page: "P1", book: try XCTUnwrap(copyOnly.binding).link.book).off["tabs"], ScreenGate.Off.deviceSwitch)
        try Data(#"{"tabs":true}"#.utf8).write(to: markerURL("switches.json"))
        let fileOn = bridge61(os: 27)
        fileOn.install(webView: webView, presenter: root, pageBuild: "P1")
        XCTAssertEqual(fileOn.ownChecks(page: "P1", book: try XCTUnwrap(fileOn.binding).link.book).on, ["coach", "coachHome", "tabs"])
    }

    /// `model()` decodes and applies every pushed model inside `model <screen>@<page> shell <n>` (contract 3.7, 10.2):
    /// when the chat's store takes the model the file reads 1, and 0 after; the line names the page build being served.
    /// A model for a screen this binary does not have is dropped unread, so its name never reaches a file.
    func testAModelIsDecodedAndAppliedInsideItsMarker() async throws {
        let b = bridge61(os: 27)
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        _ = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"]).get()
        let store = try XCTUnwrap(b.binding).screens.coach
        var during: [UInt8?] = []
        let watch = store.$model.dropFirst().sink { _ in during.append(self.stateByte("model.coach.marker")) }
        _ = try await message(b, "model", ["screen": "coach", "rev": 1, "json": try modelJSON(boot: "b1", rev: 1)]).get()
        watch.cancel()
        XCTAssertEqual(store.model?.rev, 1, "applied")
        XCTAssertEqual(during, [SectionMarker.inside], "applied inside its section")
        XCTAssertEqual(try text("model.coach.marker"), "model coach@P1 shell 61\n0")
        // a model that does not decode is read inside the same marker, which ends
        _ = try await message(b, "model", ["screen": "coach", "rev": 2, "json": #"{"not":"a model"}"#]).get()
        XCTAssertEqual(stateByte("model.coach.marker"), SectionMarker.outside)
        XCTAssertEqual(store.model?.rev, 1)
        // every screen of the binary has its own file (the bar's, not negotiated here: the link drops it after the read)
        _ = try await message(b, "model", ["screen": "tabs", "rev": 3, "json": "{}"]).get()
        XCTAssertEqual(try text("model.tabs.marker"), "model tabs@P1 shell 61\n0")
        // a screen this binary does not have: dropped, no file named after it
        for screen in ["settings", "../escape", "coach home"] {
            _ = try await message(b, "model", ["screen": screen, "rev": 4, "json": try modelJSON(boot: "b1", rev: 4)]).get()
        }
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path).filter { $0.hasSuffix(".marker") }.sorted()
        XCTAssertEqual(names, ["model.coach.marker", "model.tabs.marker"])
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.deletingLastPathComponent().appendingPathComponent("escape.marker").path))
        XCTAssertEqual(store.model?.rev, 1, "nothing else applied")
    }

    /// The resync's snapshot (a new document under the chat) is decoded and applied inside the chat's model marker too.
    func testTheResyncsSnapshotIsReadInsideTheModelMarker() async throws {
        let b = bridge61(os: 27)
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        let screens = try XCTUnwrap(b.binding?.screens)
        screens.presenting = stand
        try await loadReloadPage(marking: false)
        _ = await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b1"])
        _ = await message(b, "model", ["screen": "coach", "rev": 5, "json": try modelJSON(boot: "b1", rev: 5)])
        _ = try await message(b, "present", ["screen": "coach"]).get()
        let up = Date().addingTimeInterval(4)
        while stand.shown.last == nil, Date() < up { try await Task.sleep(nanoseconds: 30_000_000) }
        _ = try await webView.evaluateJavaScript("window.__snap = \(Self.jsString(try modelJSON(boot: "b2", rev: 1))); 0")
        var during: [UInt8?] = []
        let watch = screens.coach.$model.dropFirst().sink { m in
            if m?.boot == "b2" { during.append(self.stateByte("model.coach.marker")) }
        }
        // the next document says hello with the chat still up: the shell draws it from the page's snapshot
        let hello = try await message(b, "hello", ["v": 1, "page": "P1", "screens": ["coach"], "boot": "b2"]).get()
        XCTAssertEqual(hello["up"] as? [String], ["coach"])
        let drawn = Date().addingTimeInterval(4)
        while screens.coach.model?.boot != "b2", Date() < drawn { try await Task.sleep(nanoseconds: 30_000_000) }
        watch.cancel()
        XCTAssertEqual(screens.coach.model?.boot, "b2")
        XCTAssertEqual(during, [SectionMarker.inside], "the snapshot applied inside its section")
        XCTAssertEqual(stateByte("model.coach.marker"), SectionMarker.outside)
        screens.tearDown()
    }

    /// `section(_:_:)` (H9's construction) and `section(_:entering:)` (the root's hook, H7): the tab root's file holds 1
    /// while a section runs, nested sections hold it, and its line names the page build being served. A name that is no
    /// section's kind runs its body unmarked.
    func testTheTabsSectionHoldsItsMarkerWhileItRuns() throws {
        let b = bridge61(os: 27)
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        var inside: UInt8?
        let seven = b.section("tabs") { () -> Int in
            inside = stateByte("section.tabs.marker")
            return 7
        }
        XCTAssertEqual(seven, 7)
        XCTAssertEqual(inside, SectionMarker.inside)
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@P1 shell 61\n0")
        b.section("tabs", entering: true)
        b.section("tabs", entering: true)   // a bar change inside a funnel run
        b.section("tabs", entering: false)
        XCTAssertEqual(stateByte("section.tabs.marker"), SectionMarker.inside)
        b.section("tabs", entering: false)
        XCTAssertEqual(stateByte("section.tabs.marker"), SectionMarker.outside)
        XCTAssertEqual(b.section("sheets") { 3 }, 3)
        b.section("sheets", entering: true)
        XCTAssertFalse(exists("section.sheets.marker"))
    }

    /// The last launch's sections are read before this launch writes its own: a section that came before the first
    /// install (H9 installs first, but no order may lose a verdict) finds the stale file first.
    func testTheLastLaunchsSectionIsReadBeforeThisLaunchWritesItsOwn() throws {
        try leftOpen(.tabs)
        let b = bridge61(os: 27)
        b.section("tabs") {}
        XCTAssertEqual(b.markersFound, ["tabs@P1 shell 61"])
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@unknown shell 61\n0", "this launch's own file (no page known yet)")
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        if case .crashMarker? = b.ownChecks(page: "P1", book: try XCTUnwrap(b.binding).link.book).off["tabs"] {} else {
            XCTFail("the verdict reached the book")
        }
        XCTAssertEqual(b.launchCounts.markers, 1)
    }

    /// The shell's web view leaving its window while the app is active is a fault (contract I1, counted for Settings >
    /// About), except in a scene's teardown (H9): SceneDelegate sets `sceneEnding` before it lets go of the window and the
    /// page (the Debug replay of a reconnect runs while the app is active) and clears it as the next connection's first
    /// step, so a later move counts again.
    func testASceneTeardownLettingThePageGoIsNoFault() {
        let active = ShellWebView.appActive
        let note = ShellWebView.noteLeftWindow
        let stored = UserDefaults.standard.data(forKey: ShellBridge.countersKey)
        defer {
            ShellWebView.appActive = active
            ShellWebView.noteLeftWindow = note
            ShellWebView.sceneEnding = false
        }
        ShellWebView.appActive = { true }
        var noted = 0
        ShellWebView.noteLeftWindow = { noted += 1 }
        ShellWebView.sceneEnding = false
        let wv = ShellWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let n = ShellWebView.leftWindowWhileActive
        window.addSubview(wv)
        XCTAssertNotNil(wv.window)
        wv.removeFromSuperview()
        XCTAssertEqual(ShellWebView.leftWindowWhileActive, n + 1, "out of its window while the app is active: a fault")
        XCTAssertEqual(noted, 1, "and kept in About's totals")
        window.addSubview(wv)
        ShellWebView.sceneEnding = true
        wv.removeFromSuperview()
        XCTAssertEqual(ShellWebView.leftWindowWhileActive, n + 1, "the teardown letting the page go is not")
        ShellWebView.sceneEnding = false
        window.addSubview(wv)
        ShellWebView.appActive = { false }
        wv.removeFromSuperview()
        XCTAssertEqual(ShellWebView.leftWindowWhileActive, n + 1, "nor a move while the app is not in use")
        ShellWebView.appActive = { true }
        window.addSubview(wv)
        wv.removeFromSuperview()
        XCTAssertEqual(ShellWebView.leftWindowWhileActive, n + 2, "after the next connection's first step a move counts again")
        XCTAssertEqual(noted, 2, "each counted move reaches the totals once")
        XCTAssertEqual(UserDefaults.standard.data(forKey: ShellBridge.countersKey), stored,
                       "the shared bridge's counters, kept in the host's UserDefaults, are as the test found them")
    }
}

/// The stall page never came up (ShellBridgeTests.stalledBridge): the test fails there, saying so.
private struct StallPageDidNotLoad: Error, CustomStringConvertible {
    var description: String { "the stall page did not load within 10 s" }
}

/// A URL scheme handler that never answers: a load through it stays provisional until it is stopped.
@MainActor
private final class NeverAnswers: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {}
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

#endif
