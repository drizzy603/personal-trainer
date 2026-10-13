#if os(iOS)
import Foundation
import WebKit
import XCTest
import FPCore
@testable import FPUI

/// PageLink (plan task C5) against a real WKWebView whose page stands in for index.html's `window.FPScreens`: intents go
/// one at a time and in order, each with its timeout; answers are classified as the breaker counts them; whatever was
/// asked for under a document that went ends as gone and is never sent again; with no document linked nothing is sent.
@MainActor
final class PageLinkTests: XCTestCase {
    private var webView: WKWebView!
    private var link: PageLink!

    /// The stand-in page. Each intent name does one thing: ping answers, coach.keep answers after `id` ms, coach.stop
    /// never answers, coach.retry refuses, coach.back throws, coach.openSettings answers with no object, coach.model
    /// answers a failure code. `window.__got` lists what reached the page, `window.__busy`/`__peak` how many were in it.
    static let page = """
        <!doctype html><meta charset="utf-8"><title>fp</title><script>
        window.__got = []; window.__busy = 0; window.__peak = 0;
        window.FPScreens = { v: 1, call: function (name, args) {
          window.__got.push(name + (args && (args.nonce || args.id) ? ':' + (args.nonce || args.id) : ''));
          window.__busy++; window.__peak = Math.max(window.__peak, window.__busy);
          var done = function (v) { window.__busy--; return v; };
          if (name === 'ping') return Promise.resolve(done({ ok: true, v: 1 }));
          if (name === 'coach.keep') return new Promise(function (r) { setTimeout(function () { r(done({ ok: true, id: args.id })); }, Number(args.id)); });
          if (name === 'coach.stop') return new Promise(function () {});
          if (name === 'coach.retry') return Promise.resolve(done({ ok: false, error: 'stale' }));
          if (name === 'coach.back') { window.__busy--; throw new Error('boom'); }
          if (name === 'coach.openSettings') return Promise.resolve(done(42));
          if (name === 'coach.model') return Promise.resolve(done({ ok: false, error: 'bad-args' }));
          return Promise.resolve(done({ ok: true }));
        } };
        </script>
        """

    override func setUp() async throws {
        try await WebKitWarmUp.ensure()
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        try await load()
        link = PageLink(webView: webView)
        link.documentGrace = 0.05
        link.setBoot("b1")
    }

    override func tearDown() async throws {
        link = nil
        webView = nil
    }

    /// Loads the stand-in page as a new document (the one before it, if any, is marked, so its FPScreens is not taken for
    /// the new one's).
    private func load() async throws {
        _ = try? await webView.evaluateJavaScript("window.__fpOld = true; 0")
        webView.loadHTMLString(Self.page, baseURL: URL(string: "https://fp.test/"))
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
            let ready = "typeof window.FPScreens === 'object' && typeof window.__fpOld === 'undefined'"
            if !webView.isLoading, (try? await webView.evaluateJavaScript(ready)) as? Bool == true { return }
        }
        XCTFail("the stand-in page did not load")
    }

    /// Sends and waits for the outcome.
    private func send(_ intent: Intent, timeout: TimeInterval = 5) async -> PageLink.Outcome? {
        await withCheckedContinuation { (c: CheckedContinuation<PageLink.Outcome?, Never>) in
            var once = false
            link.send(intent) { o in
                guard !once else { return }
                once = true
                c.resume(returning: o)
            }
        }
    }

    private func got() async -> [String] {
        ((try? await webView.evaluateJavaScript("window.__got")) as? [String]) ?? []
    }

    func testIntentsGoOneAtATimeInOrderAndAreAnswered() async throws {
        var outcomes: [String] = []
        let all = expectation(description: "three answers")
        all.expectedFulfillmentCount = 3
        link.send(.coachKeep(id: "300")) { outcomes.append("keep " + $0.word); all.fulfill() }
        link.send(.ping) { outcomes.append("ping " + $0.word); all.fulfill() }
        link.send(.coachSend(text: "hi", image: nil, usePending: nil, nonce: "n1")) { outcomes.append("send " + $0.word); all.fulfill() }
        XCTAssertEqual(link.pending, 3)
        await fulfillment(of: [all], timeout: 5)
        XCTAssertEqual(outcomes, ["keep done", "ping done", "send done"], "answered first in, first out")
        let order = await got()
        XCTAssertEqual(order, ["coach.keep:300", "ping", "coach.send:n1"])
        let peak = (try? await webView.evaluateJavaScript("window.__peak")) as? Int
        XCTAssertEqual(peak, 1, "one intent in the page at a time: the ping waited for the slow keep")
        XCTAssertEqual(link.records.map(\.boot), ["b1", "b1", "b1"])
        XCTAssertEqual(link.records.map(\.key), ["300", nil, "n1"])
    }

    func testAnswersAreClassifiedAsTheBreakerCountsThem() async throws {
        link.timeoutScale = 0.1   // 2 s -> 0.2 s
        let refused = await send(.coachRetry)
        XCTAssertEqual(refused, .answered(.refused("stale")), "the page's own refusal is an answer")
        let timedOut = await send(.coachStop)
        XCTAssertEqual(timedOut, .answered(.failed(.timeout)))
        let threw = await send(.coachBack)
        guard case .answered(.failed(.javascript))? = threw else { return XCTFail("a script error: \(String(describing: threw))") }
        let malformed = await send(.coachOpenSettings)
        guard case .answered(.failed(.malformedReply))? = malformed else { return XCTFail("no object: \(String(describing: malformed))") }
        let code = await send(.coachModel(model: "x"))
        XCTAssertEqual(code, .answered(.failed(.page("bad-args"))))
        let ping = await send(.ping)
        guard case .answered(.done(let reply))? = ping else { return XCTFail("ping") }
        XCTAssertEqual(reply.value["v"]?.int, 1)
        XCTAssertEqual(link.pending, 0)
    }

    func testAnAnswerAfterItsTimeoutIsDropped() async throws {
        link.timeoutScale = 0.1
        var outcomes: [PageLink.Outcome] = []
        link.send(.coachKeep(id: "600")) { outcomes.append($0) }   // its timeout: 0.2 s
        try await Task.sleep(nanoseconds: 1_200_000_000)
        XCTAssertEqual(outcomes, [.answered(.failed(.timeout))], "one outcome: the timeout; the answer at 600 ms is dropped")
    }

    func testNothingIsSentWithNoDocumentLinked() async throws {
        link.setBoot(nil)
        let o = await send(.coachSend(text: "x", image: nil, usePending: nil, nonce: "n9"))
        XCTAssertEqual(o, .notLinked)
        try await Task.sleep(nanoseconds: 200_000_000)
        let order = await got()
        XCTAssertEqual(order, [], "nothing reached the page")
    }

    /// A new document: what was queued or in the page for the old one ends as gone and is never sent again, to the new
    /// document or anyone; the new document's intents go as usual.
    func testADocumentThatGoesTakesItsIntentsWithItAndNothingIsResent() async throws {
        var outcomes: [String] = []
        link.send(.coachKeep(id: "800")) { outcomes.append("keep " + $0.word) }                                       // in the page
        link.send(.coachSend(text: "x", image: nil, usePending: nil, nonce: "old")) { outcomes.append("send " + $0.word) }   // queued
        try await Task.sleep(nanoseconds: 100_000_000)
        link.setBoot(nil)   // the document started over (its hello is awaited)
        XCTAssertEqual(outcomes, ["keep gone", "send gone"])
        link.setBoot("b2")
        let o = await send(.coachSend(text: "y", image: nil, usePending: nil, nonce: "new"))
        XCTAssertEqual(o, .answered(.done(IntentReply(json: ["ok": true]))))
        try await Task.sleep(nanoseconds: 1_000_000_000)   // the old keep's answer comes and is dropped
        let order = await got()
        XCTAssertEqual(order, ["coach.keep:800", "coach.send:new"], "the queued send never reached any page")
        XCTAssertEqual(outcomes, ["keep gone", "send gone"], "each ends once")
        XCTAssertEqual(link.records.filter { $0.key == "old" }.map(\.sent), [false])
    }

    /// A new document (a reload) with an intent in the page: WebKit never answers it, and the new document's start (which
    /// ShellBridge sees through its document-start script) ends it as gone: no failure of the bridge, never resent.
    func testANewDocumentWithAnIntentInThePageEndsItAsGone() async throws {
        var outcomes: [PageLink.Outcome] = []
        link.send(.coachStop) { outcomes.append($0) }   // never answers
        try await Task.sleep(nanoseconds: 150_000_000)
        let before = await got()
        XCTAssertEqual(before, ["coach.stop"], "it is in the page")
        try await load()
        link.setBoot(nil)   // the new document started (its hello is awaited)
        XCTAssertEqual(outcomes, [.documentGone], "a reload is no failure of the bridge")
        link.setBoot("b2")
        try await Task.sleep(nanoseconds: 2_500_000_000)   // past the old intent's timeout
        XCTAssertEqual(outcomes, [.documentGone], "it ends once")
        let order = await got()
        XCTAssertEqual(order, [], "the new document never got it")
    }

    /// A caller told of an outcome may ask again at once: still one intent in the page at a time, in order.
    func testAnIntentAskedForFromAnOutcomeStillWaitsItsTurn() async throws {
        var order: [String] = []
        let all = expectation(description: "the two asked again")
        all.expectedFulfillmentCount = 2
        link.send(.coachKeep(id: "300")) { [weak self] o in
            order.append("A " + o.word)
            self?.link.send(.coachKeep(id: "200")) { order.append("C " + $0.word); all.fulfill() }
        }
        link.send(.ping) { [weak self] o in
            order.append("B " + o.word)
            self?.link.send(.coachKeep(id: "100")) { order.append("D " + $0.word); all.fulfill() }
        }
        try await Task.sleep(nanoseconds: 50_000_000)
        link.setBoot("b2")   // A (in the page) and B (queued) go with their document
        await fulfillment(of: [all], timeout: 5)
        // D answers in 100 ms and C in 200: D after C means D went into the page only once C had answered
        XCTAssertEqual(order, ["A gone", "B gone", "C done", "D done"], "one at a time, in order")
        let got = await got()
        XCTAssertEqual(got, ["coach.keep:300", "coach.keep:200", "coach.keep:100"], "B never reached the page")
    }

    func testDocumentWentAwayReadsWebKitsCodes() {
        XCTAssertTrue(PageLink.documentWentAway(NSError(domain: WKError.errorDomain, code: WKError.webContentProcessTerminated.rawValue)))
        XCTAssertTrue(PageLink.documentWentAway(NSError(domain: WKError.errorDomain, code: WKError.webViewInvalidated.rawValue)))
        XCTAssertTrue(PageLink.documentWentAway(NSError(domain: WKError.errorDomain, code: WKError.javaScriptInvalidFrameTarget.rawValue)))
        XCTAssertFalse(PageLink.documentWentAway(NSError(domain: WKError.errorDomain, code: WKError.javaScriptExceptionOccurred.rawValue,
                                                         userInfo: [NSLocalizedDescriptionKey: "A JavaScript exception occurred"])))
    }
}
#endif
