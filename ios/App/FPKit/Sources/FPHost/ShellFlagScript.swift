#if os(iOS)
import Foundation
import FPCore

/// `window.__FP_SHELL` for this binary (shell contract v1, FPCore `ShellFlag`), which SuperoViewController injects at
/// document start in the main frame. The page reads native capabilities from this flag and the plugins it finds, never
/// from build stamps.
///
/// - `screens`: the native screens this binary may show the page being served, as FPUI's ShellBridge works them out
///   from ScreenGate when the web view is set up (the policy file, a crash verdict for this shell and page build, the
///   native breaker; plan task C5). The page never reads it: its hello's answer is what counts, document by document.
/// - `binary`: every native screen compiled into this binary, on or off. Settings > About keeps a row for each and
///   says why one is off (TrovoShell `status`), where a row shown only for a negotiated screen vanished when it was off.
/// - `dev`: Debug builds only, the test tools' launch arguments `-devNav <route>` and `-devTheme <room>` (plan task S6).
///   The page's dev-nav hook routes to `dev.nav` once per launch and its first paint wears the room `dev.theme`
///   without saving it, so test-native.sh and screenshots/shoot.py no longer write `kt_dev_nav` into WebKit's file
///   behind the native copy. `-fpApiBase <origin>` (plan task C7) points the page's coach calls at a stand-in for the
///   Messages API on this device's loopback (`dev.api`; the page takes nothing else), so test-native.sh drives a real
///   coach turn with no key and no network.
public enum ShellFlagScript {
    /// The tools' launch arguments.
    public struct Dev: Equatable, Sendable {
        public var nav: String?
        public var theme: String?
        public var api: String?

        public init(nav: String? = nil, theme: String? = nil, api: String? = nil) {
            self.nav = nav
            self.theme = theme
            self.api = api
        }

        /// `-devNav <route>`, `-devTheme <room>` and `-fpApiBase <origin>` as separate words; a missing or empty value,
        /// or one that is the next option, is none.
        public init(arguments a: [String]) {
            func value(_ name: String) -> String? {
                guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
                let v = a[i + 1]
                return v.isEmpty || v.hasPrefix("-") ? nil : v
            }
            self.init(nav: value("-devNav"), theme: value("-devTheme"), api: value("-fpApiBase"))
        }
    }

    /// `binary`: the native screens compiled into this binary (FPCore `ShellContract.binaryScreens`), on or off, so the
    /// page keeps their Settings > About rows and says why one is off.
    /// `tabs`: the selection and bar prediction, only under a live tab root (contract 2.2).
    public static func flag(shell: String, screens: [String] = [], binary: [String] = ShellContract.binaryScreens, dev: Dev? = nil,
                            tabs: TabsFlag? = nil) -> ShellFlag {
        ShellFlag(contract: ShellContract(shell: shell, screens: binary), screens: screens, devNav: dev?.nav, devTheme: dev?.theme,
                  devAPI: dev?.api, tabs: tabs)
    }

    /// The document-start script for this process: the flag with `screens`, and `dev` from the launch arguments in a
    /// Debug build.
    public static func script(shell: String, screens: [String] = [], tabs: TabsFlag? = nil,
                              arguments: [String] = ProcessInfo.processInfo.arguments) -> String {
        #if DEBUG
        let dev: Dev? = Dev(arguments: arguments)
        #else
        let dev: Dev? = nil
        #endif
        return flag(shell: shell, screens: screens, dev: dev, tabs: tabs).script
    }
}
#endif
