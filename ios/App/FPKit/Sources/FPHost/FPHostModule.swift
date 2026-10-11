#if os(iOS)
import Foundation
import WebKit
import FPCore
import FPStore

/// FPHost binds FPKit to the shell's web view. iOS only: every source stays inside `#if os(iOS)`, so on the Mac
/// this target builds as an empty module and `swift test` still runs.
///
/// - `StoreAttach.swift` (plan task S5): the store's attachment to the web view: KTUIProxy in front of Capacitor's
///   UI delegate, the facade's flag and script once the proxy is verified, the `ktStore` message handler, the gate
///   and the store breaker per document start, one page at a time, the background checkpoint and the daily snap,
///   and the status Settings > About > Storage shows. `DebugOptions` (Debug builds only) reads the launch arguments
///   tests/native-store.sh uses.
/// - `KTUIProxy.swift` (S5): the WKUIDelegate proxy that answers only main-frame `capacitor://` KT1 prompts and
///   forwards everything else (alert, confirm, prompt, createWebViewWith and the rest) to Capacitor's handler.
/// - `StoreMarker.swift` (S5): the store's crash marker file, a state byte set around every store operation.
/// - `PolicyFetch.swift` (S7, the shell half): `FPPolicy`, the policy file fetched at launch and on foreground at
///   most every 15 minutes, the last good copy kept; `-fpPolicyFile` points it at a local file in Debug builds.
/// - `StoreProbe.swift` (Debug builds only): the native scenario runner's steps inside the app.
public enum FPHostModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPHost"

    /// The FPKit modules FPHost builds on.
    public static let builtOn = [FPCoreModule.name, FPStoreModule.name]
}
#endif
