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

        #if DEBUG
        /// `-devNav <route>`, `-devTheme <room>` and `-fpApiBase <origin>` as separate words; a missing or empty value,
        /// or one that is the next option, is none. Debug builds only (contract 12 "Release": no Debug launch argument
        /// in a Release binary, where nothing reads these and an unused function is not stripped).
        public init(arguments a: [String]) {
            self.init(nav: Self.value("-devNav", in: a), theme: Self.value("-devTheme", in: a), api: Self.value("-fpApiBase", in: a))
        }

        /// The word after `name` in the launch arguments: none when it is missing, empty or the next option.
        static func value(_ name: String, in a: [String]) -> String? {
            guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
            let v = a[i + 1]
            return v.isEmpty || v.hasPrefix("-") ? nil : v
        }

        /// `-fpOpenURL <url>` (contract 9, 15.3): the URL SceneDelegate takes as one more connection URL, by the same rule
        /// as the flag's words, and only a URL with a scheme, as every URL a connection brings has. Nothing for an option
        /// in its place (`-fpOpenURL -devNav progress` parks no "-devNav").
        public static func openURL(arguments a: [String]) -> URL? {
            guard let v = value("-fpOpenURL", in: a), let url = URL(string: v), url.scheme != nil else { return nil }
            return url
        }
        #endif
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
