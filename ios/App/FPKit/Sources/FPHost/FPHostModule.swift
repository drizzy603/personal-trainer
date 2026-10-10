#if os(iOS)
import Foundation
import WebKit
import FPCore
import FPStore

/// FPHost's placeholder from the package skeleton (plan task S1).
///
/// FPHost is iOS only: it binds FPKit to the shell's web view. It will hold StoreAttach and KTUIProxy (S5),
/// the crash markers and the policy fetch (S7). Every source stays inside `#if os(iOS)`, so on the Mac
/// this target builds as an empty module and `swift test` still runs.
public enum FPHostModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPHost"

    /// The FPKit modules FPHost builds on.
    public static let builtOn = [FPCoreModule.name, FPStoreModule.name]
}
#endif
