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

    private func bridge() -> ShellBridge {
        ShellBridge(defaults: defaults, folder: folder, shellBuild: "60")
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

    func testAMessageFromAnotherWebViewIsRefused() async throws {
        let b = bridge()
        b.install(webView: webView, presenter: root, pageBuild: "P1")
        let stranger = WKWebView(frame: .zero)
        let r: Result<[String: Any], Error> = await withCheckedContinuation { c in
            b.pageMessage("hello", options: ["v": 1, "page": "P1", "screens": ["coach"]], webView: stranger) { c.resume(returning: $0) }
        }
        if case .success = r { XCTFail("another page's hello is refused") }
    }
}
#endif
