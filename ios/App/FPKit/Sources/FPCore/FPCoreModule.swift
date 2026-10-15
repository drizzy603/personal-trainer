import Foundation

/// FPCore: the shared core of the native shell (plan task C4, and the Swift side of S7).
///
/// Foundation only, so `swift test` covers it on the Mac and every other FPKit module builds on it.
/// It does no I/O and reads no clock: the host (FPHost, FPUI) feeds it bytes, events and dates and
/// carries out what it returns. Platform code belongs in FPHost or FPUI, SQLite in FPStore.
///
/// - `Contract.swift`: shell contract v1. What this binary speaks (`ShellContract`), the
///   `window.__FP_SHELL` flag injected at document start (`ShellFlag`), the page's hello and its
///   negotiation, which screens are on for a page build (`ScreenGate`) and whether the store's facade
///   attaches (`StoreGate`), and the page's TrovoShell messages (`PageMessage`).
/// - `JSONText.swift`: lone-surrogate mending before any JSON is decoded (drop, as the page's
///   `_wellFormed` does, or U+FFFD), and `JSONValue`, the tolerant JSON every model and call goes through.
/// - `CoachModel.swift`: coach model v1, everything the native chat draws, built by the page: `paper`
///   (the native appearance), `dynTypeOn`, the room `tokens`, header, empty state, messages addressed by
///   id with chatui's stored fields, pills, PLAN CHANGES, composer and speech.
/// - `CoachHomeModel.swift`: coach home model v1 (contract 6.2, build 61), the native Coach tab's root built by
///   the page: the hub or the connect screen (`route`, an unknown one drawn as the hub), `resume` (the shell's
///   hold), meta, hero, the connect block, the hub's groups and rows; the room `tokens` with the hub's `home*`
///   sizes. Never the API key.
/// - `Tokens.swift`: the room tokens (colours, type, space, radii, fonts) with compiled Heavyweight and
///   Lime defaults from the page's THEMES, so most polish ships by OTA; the text size clamp.
/// - `Blocks.swift`: message bodies as the page's md() and %% grammar model them, with `.unknown(text)`
///   for any kind a newer page adds. Swift never parses markdown.
/// - `Intent.swift`: the named calls into the page (`FPScreens.call`), their arguments and timeouts,
///   and how an answer counts for the breaker. Tests/FPCoreTests/intents.json lists them.
/// - `LinkState.swift`: the link to one page document. The 15 s hello deadline (foreground time), the
///   3-failure breaker per direction, a reset on a new page build, boots and revs, nothing ever resent.
/// - `Breaker.swift`: the records the host keeps between launches (`BreakerBook`): the native breaker per
///   screen and page build, crash markers per (shell build, page build) pair, the store breaker.
/// - `ShellStatus.swift`: what Settings > About shows of the native screens (`ScreenStatus`: each screen on or
///   off and why, and whether the owner can try it again) and the shell's counters kept across launches
///   (`ShellCounters`: the web view leaving its window, the page hidden under a native screen, trips, markers).
/// - `Policy.swift`: `policy.json` (S7): parsing, safe defaults, the last good copy, at most one fetch
///   every 15 minutes; a missing or bad file changes nothing.
/// - `TabsModel.swift`: tabs model v1 (build 61), what the native tab bar wears, built by the page: room,
///   `paper`, the selected and idle colours, and each of the four fixed tabs' title and accessibility label;
///   compiled per-room defaults for the first frame. The bar's order and glyphs are the shell's.
public enum FPCoreModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPCore"
}
