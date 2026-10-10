#if os(iOS)
import SwiftUI
import FPCore

/// FPUI's placeholder from the package skeleton (plan task S1).
///
/// FPUI is iOS only: the native screens. It will hold ScreenHost, PageLink and the slide transition (C5),
/// the room themes, fonts and the Coach views (C6, C7). Every source stays inside `#if os(iOS)`, so on the
/// Mac this target builds as an empty module and `swift test` still runs.
public enum FPUIModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPUI"

    /// The FPKit modules FPUI builds on.
    public static let builtOn = [FPCoreModule.name]
}
#endif
