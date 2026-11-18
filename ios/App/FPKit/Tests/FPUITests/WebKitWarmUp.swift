#if os(iOS)
import Foundation
import WebKit
import XCTest

/// The first web view in a fresh simulator waits for WebKit's processes to start (about 30 s on a desk Mac's
/// never-booted device), and on a GitHub runner that first view can stay loading for good while later views load at
/// once. Every test class that drives a web view calls `ensure()` before making its own: once per process, throwaway
/// views load a page until one finishes (each given 60 s, five at most). A warm-up that fails ends its case (it throws).
/// The next call tries once more in full (a cold device once took longer than five views' time: KTUIProxyTests' first
/// page, 362 s), and after two failures every later call fails at once with their words, where each later setUp paid
/// the five minutes again (76 cases in CI's tabs part). A class that calls this in setUp must have a tearDown that
/// stands a setUp stopped here: nothing set after this call may be force-unwrapped there.
@MainActor
enum WebKitWarmUp {
    private static var warm = false
    /// The warm-ups that failed in this process, and why the last one did.
    private static var failures = 0
    private static var lastWhy = ""

    struct Failed: Error, CustomStringConvertible {
        let why: String
        var description: String { why }
    }

    static func ensure() async throws {
        if warm { return }
        if failures >= 2 {
            XCTFail("WebKit failed to warm up twice earlier in this process: \(lastWhy)")
            throw Failed(why: lastWhy)
        }
        let start = Date()
        for attempt in 1...5 {
            let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
            view.loadHTMLString("<!doctype html><title>warm</title>", baseURL: URL(string: "https://fp.test/"))
            let began = Date()
            while Date().timeIntervalSince(began) < 60 {
                try await Task.sleep(nanoseconds: 50_000_000)
                if !view.isLoading, await readyState(view) == "complete" {
                    warm = true
                    print("WebKitWarmUp: the first page loaded on view \(attempt) after \(Int(Date().timeIntervalSince(start))) s")
                    return
                }
            }
        }
        failures += 1
        lastWhy = "WebKit loaded no page in \(Int(Date().timeIntervalSince(start))) s (warm-up \(failures) of this process)"
        XCTFail(lastWhy)
        throw Failed(why: lastWhy)
    }

    /// The view's `document.readyState`, or nil when it has not answered in `seconds`: a WebKit process that is alive but
    /// never answers otherwise held the warm-up for good (its 60 s a view are checked between reads).
    private static func readyState(_ view: WKWebView, within seconds: Double = 10) async -> String? {
        await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
            var open = true   // the main thread's alone: the answer and the timer both come there
            view.evaluateJavaScript("document.readyState") { value, _ in
                guard open else { return }
                open = false
                c.resume(returning: value as? String)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
                guard open else { return }
                open = false
                c.resume(returning: nil)
            }
        }
    }
}
#endif
