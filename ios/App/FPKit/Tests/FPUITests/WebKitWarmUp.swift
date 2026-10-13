#if os(iOS)
import Foundation
import WebKit
import XCTest

/// The first web view in a fresh simulator waits for WebKit's processes to start (about 30 s on a desk Mac's
/// never-booted device), and on a GitHub runner that first view can stay loading for good while later views load at
/// once. Every test class that drives a web view calls `ensure()` before making its own: once per process, throwaway
/// views load a page until one finishes (each given 60 s, five at most).
@MainActor
enum WebKitWarmUp {
    private static var warm = false

    static func ensure() async throws {
        if warm { return }
        let start = Date()
        for attempt in 1...5 {
            let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
            view.loadHTMLString("<!doctype html><title>warm</title>", baseURL: URL(string: "https://fp.test/"))
            let began = Date()
            while Date().timeIntervalSince(began) < 60 {
                try await Task.sleep(nanoseconds: 50_000_000)
                if !view.isLoading, (try? await view.evaluateJavaScript("document.readyState")) as? String == "complete" {
                    warm = true
                    print("WebKitWarmUp: the first page loaded on view \(attempt) after \(Int(Date().timeIntervalSince(start))) s")
                    return
                }
            }
        }
        XCTFail("WebKit loaded no page in \(Int(Date().timeIntervalSince(start))) s")
    }
}
#endif
