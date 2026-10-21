#if os(iOS)
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
