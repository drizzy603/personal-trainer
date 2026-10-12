#if os(iOS)
import SwiftUI
import FPCore

/// FPUI: the native screens (iOS only).
///
/// Every source stays inside `#if os(iOS)`, so on the Mac this target builds as an empty module and
/// `swift test` still runs; FPUITests run with `xcodebuild test` on an iOS simulator.
///
/// - `Theme/RoomTheme.swift`: the room a screen draws in: FPCore's tokens as SwiftUI colours and
///   faces, the room's structural flavour (paper or studio), the clamped text size and its factor.
/// - `Theme/Fonts.swift`: the bundled faces (`Resources/Fonts`, made by mkfonts.py), registered at
///   runtime; family + weight to a face, WebKit's synthetic italic, tabular figures.
/// - `Theme/Type.swift`: the text size clamp and the web zoom's factor (1, 1.12, 1.24); CSS line boxes.
/// - `Coach/` (plan task C6): the native Coach chat. `CoachChatView` is the screen: header
///   (`CoachHeaderView`, the model switch per spec 114), the conversation (`CoachMessageViews`,
///   `CoachBlockViews`, `CoachInline`, `CoachEmptyState`), the composer (`CoachComposer`, photos
///   prepared by `CoachPhoto` as spec 20's rule says), forwarded toasts and confirms
///   (`CoachOverlays`). `CoachHost` is what it needs from its host (C7's CoachStore).
/// - The screen bridge (plan task C5): `ShellBridge` (the page's TrovoShell messages, the link per web view, the
///   breaker book, crash markers, `ShellWebView`), `PageLink` (intents into the page), `ScreenHost` (screens over the
///   page `.overFullScreen`, the toast window), `SlideTransition.swift` (the slide and the edge pan), `ShellProbe`
///   (Debug: tests/native-shell.sh).
///
/// Later: CoachStore (C7).
public enum FPUIModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPUI"

    /// The FPKit modules FPUI builds on.
    public static let builtOn = [FPCoreModule.name]
}
#endif
