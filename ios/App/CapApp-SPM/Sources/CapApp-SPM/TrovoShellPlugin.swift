import Foundation
import Capacitor
import UIKit
import WebKit

// Page to Swift for the native screens (build 60+, plan task C5; shell contract v1, decision.md section 6): the page's
// half of the screen bridge reaches FPKit's ShellBridge through this plugin. It is thin on purpose: every call hops to
// the main thread (as TrovoIconPlugin's do) and goes, with the web view it came from, to a host the App target sets (an
// adapter over FPUI's ShellBridge in AppDelegate.swift), because CapApp-SPM cannot depend on FPKit: the Capacitor CLI
// rewrites its Package.swift.
//
// Methods (the page sends them only with window.__FP_SHELL and this plugin both; FPCore PageMessage reads them):
//   hello({v, page, screens, boot})         -> {v, screens, up?} (v 0 and why when refused)
//   bootDone({page})                        the end of the page's boot (disarms the store breaker)
//   present({screen}) / dismiss({screen})   rejects a present the shell will not make (the page shows its own)
//   model({screen, rev, json})              json = _nativeJSON(model)
//   toast({text, style, undo?})             while a native screen covers the page
//   confirm({id, title, body, confirm, cancel, tone})
//   log({text, level?})

/// What the TrovoShell plugin needs from FPKit. Called on the main thread.
@MainActor
public protocol TrovoShellHost: AnyObject {
    /// One page message (`method`, its options) from the page in `webView`; `done` resolves or rejects the call.
    func shellMessage(_ method: String, options: [String: Any], webView: WKWebView?, done: @escaping (Result<[String: Any], Error>) -> Void)
}

@objc(TrovoShellPlugin)
public class TrovoShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoShellPlugin"
    public let jsName = "TrovoShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "hello", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bootDone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "model", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "toast", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "log", returnType: CAPPluginReturnPromise),
    ]

    /// Set by the App target before registration.
    public var host: TrovoShellHost?

    @objc func hello(_ call: CAPPluginCall) { forward("hello", call) }
    @objc func bootDone(_ call: CAPPluginCall) { forward("bootDone", call) }
    @objc func present(_ call: CAPPluginCall) { forward("present", call) }
    @objc func dismiss(_ call: CAPPluginCall) { forward("dismiss", call) }
    @objc func model(_ call: CAPPluginCall) { forward("model", call) }
    @objc func toast(_ call: CAPPluginCall) { forward("toast", call) }
    @objc func confirm(_ call: CAPPluginCall) { forward("confirm", call) }
    @objc func log(_ call: CAPPluginCall) { forward("log", call) }

    /// Calls arrive off the main thread, in the order the page made them; one hop to main keeps that order.
    private func forward(_ method: String, _ call: CAPPluginCall) {
        var options: [String: Any] = [:]
        for (k, v) in call.options ?? [:] {
            if let key = k as? String { options[key] = v }
        }
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                guard let self, let host = self.host else {
                    call.reject("the native screens are not available")
                    return
                }
                host.shellMessage(method, options: options, webView: self.bridge?.webView) { result in
                    switch result {
                    case .success(let value): call.resolve(value)
                    case .failure(let error): call.reject(String(describing: error))
                    }
                }
            }
        }
    }
}
