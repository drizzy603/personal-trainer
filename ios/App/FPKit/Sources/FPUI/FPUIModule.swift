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
/// - `Coach/CoachHomeView.swift`, `Coach/CoachHomeStore.swift` (build 61, plan tasks N7, N8; contract 15.2): the
///   native Coach tab's root, which the shell hosts and N draws. `CoachHomeView` draws FPCore's CoachHomeModel (the
///   hub's groups of rows, or the connect screen with the key field) and sends `CoachHomeAction`s to its
///   `CoachHomeHost`; `CoachHomeStore` (one per web view binding, beside CoachStore) holds the page's newest model and
///   sends the presses as `coachHome.*` intents through its hooks, the key once as `setKey {secret}` and kept nowhere;
///   `CoachHomeRoot` is the view ScreenHost hosts as the Coach stack's root (the room's ground until a model, then the
///   hub), and `HubHeaderBottomKey` the meta row's bottom, for the toast anchor.
/// - The screen bridge (plan task C5): `ShellBridge` (the page's TrovoShell messages, the link per web view, the
///   breaker book, crash markers, `ShellWebView`), `PageLink` (intents into the page), `ScreenHost` (screens over the
///   page `.overFullScreen`, the toast window), `SlideTransition.swift` (the slide and the edge pan), `ShellProbe`
///   (Debug: tests/native-shell.sh).
/// - `Tabs/` (build 61, H4; iOS 26 and later): `RootTabController`, the tab root: the glass bar over Log, Progress, Coach
///   and Settings, one web view moved between the slots by one funnel (`select`) and never out of the window, strays
///   counted and redirected, the hold, the bar's state and numbers (`Tests/FPCoreTests/Fixtures/shell/bar.json`), the
///   Coach tab's modes per scene and the fallback's UI half; `TabSlots` (the web slots, the Coach slot with its web area,
///   its navigation controller and the WAITING ground); `TabBarLook` (the room on the bar and the Coach stack only).
/// - ScreenHost's stack mode (build 61, H5): under a live tab root the chat is pushed in the Coach tab's navigation
///   stack (`attachStack`, the root's answers as a `StackState`), never presented; the overlay stays for a classic root
///   and after the fallback (`detachStack`).
/// - `ShellMarkers.swift` (build 61, H6): `SectionMarker`, the short-section crash markers in `Application
///   Support/FPShell` beside 60's `presenting.<screen>.marker`: `section.tabs.marker` (the tab root's construction and
///   its own sections) and `model.<screen>.marker` (every model's decode and apply), a state byte flipped by `pwrite`
///   around each section, read at the next launch. `ShellSwitches.swift`: the shell's own device switches (the tab
///   bar's), `switches.json` read first and a UserDefaults copy.
/// - ShellBridge's tab root (build 61, H7): `install(..., launch:)` decides the scene's root before the page loads
///   (`ShellLaunch`, `ShellInstall`); `adopt(root:)` binds the RootTabController (the Coach tab's stack attached, the
///   root's hooks to the page through weak captures); `selectTab` and `sheets` drive it; `tabs.select` and `tabs.bar`
///   are restated once the link is idle, never resent; the TabsModel decodes inside `model tabs@`; `deepLink(_:)` is the
///   one warm deep-link entry for both roots (the URL an argument of `_trovoOpen`).
/// - ShellBridge II (build 61, H8): hello's `tabs {selected, seq, bar}`, the declines and the Coach tab's modes per scene
///   (WEB, the 3 s WAITING net, a NATIVE tab taken over); the fallback on the link's `fellBack` (the root's half, the
///   stack left, `screens.off` in order, covered off, `dropTabsScript` for the scene's later documents) from each trigger
///   (a hello, `dismiss tabs`, no hello, a trip, the policy, `setSwitch`); the status's root, fallback, switches and
///   policy check, `status {refresh}`; the composer's words on every `screens.off` for the chat, cleared on `took`.
///
/// Later: CoachStore (C7).
public enum FPUIModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPUI"

    /// The FPKit modules FPUI builds on.
    public static let builtOn = [FPCoreModule.name]
}
#endif
