#if os(iOS)
import Foundation
import WebKit
import XCTest
@testable import FPHost

/// Stands in for Capacitor's WebViewDelegationHandler: answers prompts itself (as it answers the CapacitorHttp and
/// CapacitorCookies checks) and records every panel it is handed.
final class FakeCapacitorDelegate: NSObject, WKUIDelegate {
    var prompts: [String] = []
    var alerts: [String] = []
    var confirms: [String] = []
    var closed = 0

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        prompts.append(prompt)
        completionHandler("inner:" + prompt)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        alerts.append(message)
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        confirms.append(message)
        completionHandler(true)
    }

    func webViewDidClose(_ webView: WKWebView) {
        closed += 1
    }
}

/// Serves pages under capacitor://localhost, as Capacitor's asset handler serves the app.
final class CapacitorScheme: NSObject, WKURLSchemeHandler {
    var pages: [String: String] = [:]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let path = task.request.url?.path ?? "/"
        let body = Data((pages[path] ?? "<!doctype html><title>404</title>").utf8)
        let response = HTTPURLResponse(url: task.request.url!, statusCode: pages[path] == nil ? 404 : 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/html; charset=utf-8"])!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// KTUIProxy in a real WKWebView: KT1 prompts are answered only for the main frame of a capacitor:// page and are never
/// handed to the inner delegate (Capacitor would show one as an alert); everything else reaches the inner delegate.
@MainActor
final class KTUIProxyTests: XCTestCase {
    private var webView: WKWebView!
    private var inner: FakeCapacitorDelegate!
    private var proxy: KTUIProxy!
    private var scheme: CapacitorScheme!
    private var asked: [(head: String, payload: String?)] = []

    override func setUp() async throws {
        scheme = CapacitorScheme()
        inner = FakeCapacitorDelegate()
        asked = []
        proxy = KTUIProxy(inner: inner) { [weak self] head, payload, _ in
            self?.asked.append((head, payload))
            return head.hasPrefix("hello") ? "{\"mode\":\"off\",\"why\":\"test\"}" : "ok"
        }
        webView = makeWebView()
    }

    override func tearDown() async throws {
        webView = nil
        proxy = nil
        inner = nil
    }

    /// A web view serving the scheme, with Capacitor's delegate set first and the proxy put in its place, as the app does.
    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: "capacitor")
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), configuration: config)
        view.uiDelegate = inner
        view.uiDelegate = proxy
        return view
    }

    /// Whether a page has loaded in this process yet.
    private static var warm = false

    /// The first web view in a fresh simulator waits for WebKit's processes to start: 34 s on this Mac's never-booted
    /// device. On a GitHub runner that first view never finished its page at all (still loading after 180 s), while every
    /// later view loaded at once. So until a page has loaded in this process, a view that has not finished in 60 s is
    /// replaced by a new one, five times at most; after that a page gets 20 s.
    private func load(_ url: String) async throws {
        try await loadPage(url) { $0.load(URLRequest(url: URL(string: url)!)) }
    }

    private func loadPage(_ what: String, _ begin: (WKWebView) -> Void) async throws {
        let start = Date()
        var last = "nothing yet"
        for attempt in 1...(Self.warm ? 1 : 5) {
            if attempt > 1 { webView = makeWebView() }
            begin(webView)
            let began = Date()
            while Date().timeIntervalSince(began) < (Self.warm ? 20 : 60) {
                try await Task.sleep(nanoseconds: 50_000_000)
                if webView.isLoading { last = "still loading"; continue }
                do {
                    let state = try await webView.evaluateJavaScript("document.readyState") as? String
                    if state == "complete" {
                        if !Self.warm { print("KTUIProxyTests: the first page loaded on view \(attempt) after \(Int(Date().timeIntervalSince(start))) s") }
                        Self.warm = true
                        return
                    }
                    last = "readyState " + (state ?? "nil")
                } catch {
                    last = "\(error)"
                }
            }
        }
        XCTFail("the page never loaded in \(Int(Date().timeIntervalSince(start))) s (\(what); last: \(last))")
    }

    private func js(_ src: String) async throws -> Any? {
        try await webView.callAsyncJavaScript(src, arguments: [:], in: nil, contentWorld: .page)
    }

    func testTheProxyIsTheDelegateAndRespondsLikeTheInnerOne() {
        XCTAssertTrue(webView.uiDelegate === proxy)
        XCTAssertTrue(proxy.responds(to: #selector(WKUIDelegate.webViewDidClose(_:))), "a method only the inner delegate has")
        XCTAssertTrue(proxy.forwardingTarget(for: #selector(WKUIDelegate.webViewDidClose(_:))) as AnyObject === inner)
        XCTAssertFalse(proxy.responds(to: NSSelectorFromString("noSuchSelector:")))
    }

    func testMainFrameKT1PromptsAreAnsweredHereAndNeverForwarded() async throws {
        scheme.pages["/index.html"] = "<!doctype html><body>main</body>"
        try await load("capacitor://localhost/index.html")
        let r = try await js("return [prompt('\\u0001KT1 hello', 'line0'), prompt('\\u0001KT1 w 3:1', '\"k\"\\n\"v\"')];") as? [Any]
        XCTAssertEqual(r?.first as? String, "{\"mode\":\"off\",\"why\":\"test\"}")
        XCTAssertEqual(r?.last as? String, "ok")
        XCTAssertEqual(asked.map(\.head), ["hello", "w 3:1"])
        XCTAssertEqual(asked.first?.payload, "line0")
        XCTAssertTrue(inner.prompts.isEmpty, "a KT1 prompt never reaches the inner delegate")
        XCTAssertEqual(proxy.counts.kt1Answered, 2)
    }

    func testCapacitorsOwnPromptsAndThePanelsReachTheInnerDelegate() async throws {
        scheme.pages["/index.html"] = "<!doctype html><body>main</body>"
        try await load("capacitor://localhost/index.html")
        let r = try await js("""
            var a = prompt(JSON.stringify({type: 'CapacitorHttp'}));
            alert('hi'); var c = confirm('sure?');
            return [a, c];
            """) as? [Any]
        XCTAssertEqual(r?.first as? String, "inner:{\"type\":\"CapacitorHttp\"}")
        XCTAssertEqual(r?.last as? Bool, true)
        XCTAssertEqual(inner.prompts, ["{\"type\":\"CapacitorHttp\"}"])
        XCTAssertEqual(inner.alerts, ["hi"])
        XCTAssertEqual(inner.confirms, ["sure?"])
        XCTAssertTrue(asked.isEmpty)
        XCTAssertEqual(proxy.counts.prompts, 1)
        XCTAssertEqual(proxy.counts.alerts, 1)
        XCTAssertEqual(proxy.counts.confirms, 1)
    }

    func testKT1FromAnIframeIsRefused() async throws {
        scheme.pages["/index.html"] = "<!doctype html><body><iframe src='capacitor://localhost/frame.html'></iframe></body>"
        scheme.pages["/frame.html"] = "<!doctype html><script>window.__r = prompt('\\u0001KT1 hello', '');</script>"
        try await load("capacitor://localhost/index.html")
        var r: Any?
        for _ in 0..<60 {
            r = try await js("var f = document.querySelector('iframe').contentWindow; return f && ('__r' in f) ? String(f.__r) : 'pending';")
            if (r as? String) != "pending" { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(r as? String, "null", "an iframe's KT1 prompt is answered nil")
        XCTAssertTrue(asked.isEmpty)
        XCTAssertTrue(inner.prompts.isEmpty, "and never shown by the inner delegate")
        XCTAssertEqual(proxy.counts.kt1Refused, 1)
    }

    func testKT1FromAnotherOriginIsRefused() async throws {
        try await loadPage("https://example.com/") {
            $0.loadHTMLString("<!doctype html><body>web</body>", baseURL: URL(string: "https://example.com/"))
        }
        let r = try await js("return String(prompt('\\u0001KT1 hello', ''));")
        XCTAssertEqual(r as? String, "null")
        XCTAssertTrue(asked.isEmpty)
        XCTAssertTrue(inner.prompts.isEmpty)
        XCTAssertEqual(proxy.counts.kt1Refused, 1)
    }

    func testADetachedProxyRefusesKT1() async throws {
        scheme.pages["/index.html"] = "<!doctype html><body>main</body>"
        try await load("capacitor://localhost/index.html")
        proxy.detached = true
        let r = try await js("return [String(prompt('\\u0001KT1 w 3:2', '\"k\"\\n\"v\"')), prompt('plain')];") as? [Any]
        XCTAssertEqual(r?.first as? String, "null")
        XCTAssertEqual(r?.last as? String, "inner:plain", "other prompts still reach the inner delegate")
        XCTAssertTrue(asked.isEmpty)
        XCTAssertEqual(proxy.counts.kt1Refused, 1)
    }
}
#endif
