import Foundation

/// FPCore's placeholder from the package skeleton (plan task S1).
///
/// FPCore is Foundation only, so `swift test` covers it on the Mac and every other FPKit module can build
/// on it. It will hold the shell contract and its negotiation, lone-surrogate mending, the coach model and
/// its tokens, blocks, intents, the link state, breakers and crash-marker policy (C4), and the policy
/// file's state (S7). Platform code belongs in FPHost or FPUI, SQLite in FPStore.
public enum FPCoreModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPCore"
}
