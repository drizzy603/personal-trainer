#if os(iOS)
import Foundation
import FPCore

/// `window.__FP_SHELL` for this binary (shell contract v1, FPCore `ShellFlag`), which SuperoViewController injects at
/// document start in the main frame. The page reads native capabilities from this flag and the plugins it finds, never
/// from build stamps.
///
/// - `screens`: build 60's store half draws no native screen, so it is empty until the native Coach chat fills it from
///   ScreenGate (plan task C5).
/// - `dev`: Debug builds only, the test tools' launch arguments `-devNav <route>` and `-devTheme <room>` (plan task S6).
///   The page's dev-nav hook routes to `dev.nav` once per launch and its first paint wears the room `dev.theme`
///   without saving it, so test-native.sh and screenshots/shoot.py no longer write `kt_dev_nav` into WebKit's file
///   behind the native copy.
public enum ShellFlagScript {
    /// The tools' launch arguments.
    public struct Dev: Equatable, Sendable {
        public var nav: String?
        public var theme: String?

        public init(nav: String? = nil, theme: String? = nil) {
            self.nav = nav
            self.theme = theme
        }

        /// `-devNav <route>` and `-devTheme <room>` as separate words; a missing or empty value, or one that is the
        /// next option, is none.
        public init(arguments a: [String]) {
            func value(_ name: String) -> String? {
                guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
                let v = a[i + 1]
                return v.isEmpty || v.hasPrefix("-") ? nil : v
            }
            self.init(nav: value("-devNav"), theme: value("-devTheme"))
        }
    }

    public static func flag(shell: String, screens: [String] = [], dev: Dev? = nil) -> ShellFlag {
        ShellFlag(contract: ShellContract(shell: shell, screens: screens), screens: screens, devNav: dev?.nav, devTheme: dev?.theme)
    }

    /// The document-start script for this process: the flag, with `dev` from the launch arguments in a Debug build.
    public static func script(shell: String, arguments: [String] = ProcessInfo.processInfo.arguments) -> String {
        #if DEBUG
        let dev: Dev? = Dev(arguments: arguments)
        #else
        let dev: Dev? = nil
        #endif
        return flag(shell: shell, dev: dev).script
    }
}
#endif
