#if os(iOS)
import Foundation
import WebKit
import FPStore

/// The web view's WKUIDelegate while the store is attached (plan task S5; decision.md section 6, "Storage channel").
///
/// It stands in front of the delegate Capacitor set (WebViewDelegationHandler, which answers Capacitor's own
/// synchronous prompts: the CapacitorHttp and CapacitorCookies checks) and forwards everything to it: alert, confirm,
/// prompt and createWebViewWith explicitly, every other WKUIDelegate method through `responds(to:)` and
/// `forwardingTarget(for:)` (WebKit reads which methods a delegate has when it is set, so the proxy reports the
/// inner delegate's). The one thing it keeps for itself is a prompt whose text starts with the facade's channel
/// prefix (`\u{1}KT1 `): from the main frame of a `capacitor://` page it is answered by StoreAttach; from anywhere
/// else, or once this proxy's web view has been detached, it is answered `nil` (the facade then falls back to its
/// gap note). A KT1 prompt is never forwarded, so Capacitor can never show one as an alert.
public final class KTUIProxy: NSObject, WKUIDelegate {
    /// What the proxy has seen, for Settings > About > Storage and the scenario runner.
    public struct Counts: Codable, Equatable, Sendable {
        /// KT1 prompts StoreAttach answered.
        public var kt1Answered = 0
        /// KT1 prompts StoreAttach left unanswered (no attached document, store off).
        public var kt1Unanswered = 0
        /// KT1 prompts refused here: not the main frame, not a capacitor:// page, or a detached web view.
        public var kt1Refused = 0
        /// Other prompts (Capacitor's own), forwarded.
        public var prompts = 0
        public var alerts = 0
        public var confirms = 0
        public var windows = 0
    }

    /// The delegate the proxy stands in front of (Capacitor's handler). Kept strongly: WKWebView holds its
    /// uiDelegate weakly, and the bridge already keeps the handler alive.
    public let inner: NSObject & WKUIDelegate
    /// Answers a KT1 prompt's head and payload for this web view; nil leaves it unanswered.
    let answer: (String, String?, WKWebView) -> String?
    /// Set when StoreAttach binds a newer web view: every KT1 prompt is refused from then on.
    public internal(set) var detached = false
    public private(set) var counts = Counts()

    static let channel = KTProtocol.promptPrefix
    private static let channelScalars = KTProtocol.promptPrefix.unicodeScalars.count

    init(inner: NSObject & WKUIDelegate, answer: @escaping (String, String?, WKWebView) -> String?) {
        self.inner = inner
        self.answer = answer
        super.init()
    }

    // MARK: Forwarding

    public override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || inner.responds(to: aSelector)
    }

    public override func forwardingTarget(for aSelector: Selector!) -> Any? {
        inner.responds(to: aSelector) ? inner : nil
    }

    // MARK: The four panels Capacitor's handler implements

    public func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        counts.alerts += 1
        guard inner.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))) else {
            completionHandler()
            return
        }
        inner.webView?(webView, runJavaScriptAlertPanelWithMessage: message, initiatedByFrame: frame,
                       completionHandler: completionHandler)
    }

    public func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        counts.confirms += 1
        guard inner.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))) else {
            completionHandler(false)
            return
        }
        inner.webView?(webView, runJavaScriptConfirmPanelWithMessage: message, initiatedByFrame: frame,
                       completionHandler: completionHandler)
    }

    public func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        if prompt.hasPrefix(Self.channel) {
            guard !detached, frame.isMainFrame, frame.securityOrigin.protocol == "capacitor" else {
                counts.kt1Refused += 1
                completionHandler(nil)
                return
            }
            let head = String(String.UnicodeScalarView(prompt.unicodeScalars.dropFirst(Self.channelScalars)))
            let reply = answer(head, defaultText, webView)
            if reply == nil { counts.kt1Unanswered += 1 } else { counts.kt1Answered += 1 }
            completionHandler(reply)
            return
        }
        counts.prompts += 1
        guard inner.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))) else {
            completionHandler(nil)
            return
        }
        inner.webView?(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText,
                       initiatedByFrame: frame, completionHandler: completionHandler)
    }

    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        counts.windows += 1
        return inner.webView?(webView, createWebViewWith: configuration, for: navigationAction, windowFeatures: windowFeatures)
    }
}
#endif
