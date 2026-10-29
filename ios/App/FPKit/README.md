# FPKit

The native half of Fitness Programmer's move from the Capacitor web view to SwiftUI, one screen at a time.
The approved plan for going native (decision.md, section 4 "Where the code lives") puts the native code in
this local Swift package. The page (`index.html`) stays the engine: it keeps every rule and every write
until each one is ported, and FPKit grows around it. Build 60 brings the first two pieces: a native copy of
the owner's data that follows WebKit and never writes it (FPStore, in shadow), and the native Coach chat.

**Status.** The package skeleton (plan task S1, package part) gave each target a placeholder,
`<Target>Module.swift`, naming the module (a ready category for its log lines under the app's
`app.kt.trainer` subsystem); later tasks add their files beside them. FPCore holds the shell contract,
the coach model and the rest of C4, and the policy file's state (S7). FPStore holds the native store
(plan task S2, see [FPStore](#fpstore-the-native-store) below). The App target links all four products
(the rest of S1, see [In the app](#in-the-app)). FPHost attaches the store to the app's web view, fetches
the policy file and serves Settings > About > Storage through the TrovoStore plugin (S5, S6, S7; see
[FPHost](#fphost-the-store-in-the-app) below): the app calls it from `AppDelegate.swift`, which also injects
`window.__FP_SHELL`. FPUI holds the SwiftUI Coach chat (C6, see [FPUI](#fpui-the-native-coach-chat)
below) and the shell's side of the screen bridge (C5, see [The screen bridge](#the-screen-bridge-in-the-app)
below): the TrovoShell plugin brings the page's messages to `ShellBridge`, `ScreenHost` puts the chat up over
the page on the page's own model, and `PageLink` carries the chat's intents back; the page side is in
`index.html` (C1-C3 and C5's take-over: `coachSend`, message ids and block models, `FPScreens`, the coach
model, inert without the flag and a TrovoShell plugin). The live chat (C7, see [The live chat](#the-live-chat-coachstore)
below): `CoachStore` keeps the page's models in order, echoes the owner's message until the page's own takes its place,
puts back what never reached the page, and keeps the composer across presents and launches; test-native.sh drove it in
build 60's app, a coach turn included, on a stand-in for the Messages API (build 61's code: below). The published
policy file has had `screens.coach` on since 2026-10-13 (after the owner checked build 60's store on the phone); a phone
takes it at its next policy fetch (a cold launch or a return to the foreground, at most every 15 minutes) and shows the
native chat from the next launch.

Build 61 adds the native tab bar and the native Coach tab. So far this package holds the shell's side and the models
both sides share: FPCore's pieces and the tabs and coach home models (see
[FPCore](#fpcore-the-contract-the-pieces-and-the-models)), the tab root (which the App target's SceneDelegate builds
around the page in code, see [In the app](#in-the-app)), the bridge's tabs half, the shell's short-section markers and
its tab bar switch (see [The screen bridge](#the-screen-bridge-in-the-app)); and the Coach tab's view and store (see
[The native Coach tab](#the-native-coach-tab-coachhomeview-and-coachhomestore)), which the shell does not host yet, so
the page shows its web Coach under the native bar. The published policy file keeps `screens.coachHome` and
`screens.tabs` off until build 61 is checked. As the tools launch it, a build of this tree cannot pass test-native.sh's
live chat or tests/native-shell.sh's scenarios: on an iOS 26+ simulator it takes the tab root, where the native chat
never shows (see [tests/native-shell.sh](#testsnative-shellsh)).

## Targets

| Target | Builds on | Runs on | Will hold (plan tasks) |
|---|---|---|---|
| FPCore | Foundation only | iOS, macOS | The shell contract and its negotiation, lone-surrogate mending, the coach model and its tokens, blocks, intents, the link state, breakers and crash-marker policy (C4); the policy file's state (S7); build 61's pieces (`ShellPieces`), the tabs model and the coach home model (H1-H3, N2) |
| FPStore | FPCore, the system SQLite3 | iOS, macOS | KTStore: every `kt_*` value in exact UTF-16, the wire codec, the seven-rule reconcile (observe only in build 60), the journal, snaps and Put back (S2); the shadow facade `Resources/ktstore.js` (S3) |
| FPHost | FPCore, FPStore, WebKit | iOS only | StoreAttach and KTUIProxy (S5), crash markers, the policy fetch (S7), what Settings > About > Storage does and the shell flag (S6); the first frame's room (H9) |
| FPUI | FPCore, SwiftUI, WebKit | iOS only | ShellBridge, ScreenHost, PageLink and the slide transition (C5), room themes, fonts and the Coach views (C6, C7); build 61's tab root, ScreenHost's stack mode, the bridge's tabs half, the shell's markers and switch (H4-H8), the Coach tab's view and store (N7, N8) |

Test targets: FPCoreTests and FPStoreTests, run by `swift test` on the Mac; FPHostTests and FPUITests (iOS
only), run by `xcodebuild test` on an iOS simulator.

## Rules

- swift-tools-version 5.9, Swift 5 language mode. iOS 17 is the app's floor (`@Observable`, PhotosPicker);
  macOS 14 lets `swift test` run on the Mac.
- FPCore imports Foundation only. FPCoreTests reads its sources and fails on any other import, because
  the Mac compiler accepts WebKit, SwiftUI and SQLite3 there without complaint.
- FPHost and FPUI keep every source inside `#if os(iOS)`. On the Mac they build as empty modules, so
  `swift test` never compiles their code: use the iOS build below.
- FPStore keeps values as BLOBs of the page's UTF-16 code units, never TEXT (TEXT corrupts half an emoji).
  `kt_apikey` never enters the store.
- Each target has its own block in `Package.swift`. A branch changes only its own target's block.
- Only the App target links FPKit. CapApp-SPM cannot depend on it (the Capacitor CLI rewrites its
  `Package.swift`), so the thin plugin classes there will reach FPKit through host protocols the App target
  sets.

## FPCore: the contract, the pieces and the models

What the shell and the page agree on, held as data both sides' tests read (`FPCoreModule.swift` lists every file).
`Tests/FPCoreTests/intents.json` lists contract v1's 31 intents (Swift to page, through `FPScreens.call`) and the page's
14 TrovoShell messages (`messages`, in the plugin's order); IntentTests and ContractTests read it, and spec 122 holds
TrovoShellPlugin's `pluginMethods`, the harness's `SHELL_METHODS['61']` and the page's `_FP_INTENTS` to it.

Build 61 has three native pieces (`ShellContract.binaryScreens`): `coach` (the chat), `coachHome` (the native Coach tab)
and `tabs` (the native tab bar root), and they depend on each other. `ShellPieces` (`Pieces.swift`) is the one rule for
the gate at scene connect, every hello, every cascade inside a document and the status Settings > About shows: `tabs` is
on iff its own checks pass and the scene's root is a live tab root; `coachHome` iff its own checks pass, `tabs` is on
and `coach`'s own checks pass; `coach` is joint with `coachHome` under a live tab root (the Coach tab's stack is its
only host there) and alone under a classic root (60's overlay); a piece off only because of another reports what it
`needs`. A hello under a live tab root whose answer leaves `tabs` out falls the scene back first: `page` (the hello left
`tabs` out) or `policy` (its own checks no longer pass) is then negotiated on the classic rule, so `coach` alone may
come back at once, and a version refusal (`refused`) is answered as the refusal. The page build declines `tabs` for
`page` and `refused` (and for `dismiss tabs`), and `coachHome` for a hello that names `tabs` without it while it was on
offer; `coach` is never declined, and nothing is declined under a classic root or after the fallback.
`Fixtures/shell/negotiation.json` holds the rule as a table (resolve, hello, cascade and root-change rows), which
PiecesTests and LinkStateTests read, and `Fixtures/shell/bar.json` the bar's hidden state per selected tab, Coach mode
and sheets (RootTabControllerTests); spec 122 holds the page's mock (`tests/lib/harness.js` `MOCK_RULES`) to both. A
rule change edits the table first, then the Swift side, then the mock.

The page builds two more models, decoded as tolerantly as CoachModel (only `v` is required): `TabsModel` (contract 6.1),
what the bar wears (room, `paper`, the selected and idle colours, each tab's title and accessibility label; the bar's
order and glyphs are the shell's; compiled per-room defaults for the first frame), and `CoachHomeModel` (contract 6.2),
the Coach tab's root (the hub or the connect screen, `resume` for the shell's hold, meta, hero, the connect block, the
hub's groups of rows, the room's tokens with the hub's `home*` sizes; never the key). Their fixtures are in
`Fixtures/tabs` and `Fixtures/coachHome`: the page-built ones from `node tests/golden/dump-coach-home.js`, the hand-made
ones from `Tools/tabs-fixtures.js` and `Tools/coach-home-fixtures.js` (see `Tests/FPCoreTests/Fixtures/README.md`).

`CoachHomeModelTests` reads both kinds. Each page-built `Fixtures/coachHome` file (P6) is read as the page's whole
model, contract 6.2's keys in their JSON types (rev, boot, room, paper, dynTypeOn, route and resume as sent; meta, hero,
connect and groups key by key; the room's whole palette, every token its compiled one), and the eight scenarios against
the web's rules (route, meta, hero, the connect block, rows, Open Chat's sub, the 65-character preview cut whole,
`resume` true in `hub-resume` alone). `tests/golden/check.sh` runs it, with CoachModelTests, BlocksTests and
TabsModelTests, after the page's own checks.

## FPUI: the native Coach chat

The SwiftUI chat (plan task C6), drawn from FPCore's `CoachModel` and sending FPCore's `Intent`s
through a `CoachHost` (C7's CoachStore fills it from the page link, its composer included; tests and previews from
fixtures, and then the chat keeps its own composer).
The page keeps every rule: it parses markdown and `%%` markers, builds every label, pill, chip and
PLAN CHANGES row, and decides what a message says; the views only draw the model. Nothing ever makes a
link from model text: runs go in verbatim with explicit faces, never through
`AttributedString(markdown:)`.

| File | Holds |
|---|---|
| `Theme/RoomTheme.swift` | The room a view draws in: the model's tokens as colours and faces, the room's flavour (paper or studio) for the few shapes the rooms draw differently, the text size and its factor |
| `Theme/Fonts.swift` | The faces in `Resources/Fonts` (made by `screenshots/live-activity/mkfonts.py`, set "chat"), registered at runtime; family + weight to a face, the system face for glyphs a face lacks (as the web's font stacks), WebKit's 14° synthetic italic, tabular figures |
| `Theme/Type.swift` | The text size: the system size clamped `.large...xxLarge` with the app's toggle on, `.large` off, and the web zoom's factor (1, 1.12, 1.24) every size scales by; CSS line boxes |
| `Coach/CoachChatView.swift` | The screen and `CoachHost`: header (the page's initial in it), the conversation (opens at its end, a short chat hugs the composer, a reply lands at its question, the owner's own Send, Stop, chip or Try again brings the end into view wherever the reader was, a reader at the end stays there when the keys come up), composer (the host's draft when it keeps one, observed by the composer alone; `sendIntent`, the one builder of Send's `coach.send`), toast and confirm |
| `Coach/CoachStore.swift` | The live chat (C7): `CoachStore` and its `CoachComposerDraft`; see [The live chat](#the-live-chat-coachstore) |
| `Coach/CoachHeaderView.swift` | Back or Cancel, the avatar, the status eyebrow, title, WK/DAY and the model switch (spec 114's label and accessible name) |
| `Coach/CoachMessageViews.swift` | The column's parts in the web's order and rhythm: day dividers, seeds, the owner's bubble, replies, notes, Try again / Open Settings, tool pills, PLAN CHANGES, Thinking; what VoiceOver reads for a reply (`ReplySpeech`: one stop, its type first, a table cell by cell, metrics and the takeaway in words) |
| `Coach/CoachBlockViews.swift` | md()'s blocks (paragraphs, lists with sub-items and numbered starts, headings, rules, tables in a horizontal scroller) and the `%%` sections (metric cards, the takeaway, chips), with the web's collapsing margins |
| `Coach/CoachInline.swift` | Runs to text: bold, italic and code to their faces, never a link |
| `Coach/CoachComposer.swift`, `Coach/CoachPhoto.swift` | One field that grows to four whole lines, then scrolls inside them, made anew whenever its face changes size (an empty one kept the line height it was made at); 44 pt photo button and Send (disabled with nothing to send, Stop while a reply is in flight); PhotosPicker, the photo prepared as spec 20 says (1568 px long edge, JPEG 0.82) |
| `Coach/CoachEmptyState.swift`, `Coach/CoachOverlays.swift`, `Coach/CoachLayout.swift` | The empty chat; forwarded toasts and confirms; the flow and table layouts, `HeightCap` (the composer box: as tall as its draft up to four lines, never taller, where a frame with a max height grows to it), the page's icons, and `PressAreaButton` (a control drawn smaller than 44 pt, pressed as 44: the press shape goes inside the Button's label, never around the finished Button) |

FPUITests (`xcodebuild test` on an iOS simulator) read the coach fixtures from
`Tests/FPCoreTests/Fixtures/coach` in the source tree. `CoachRenderTests` renders every fixture, and
the variants it adds (`draft-4-lines`, `draft-6-lines`: a draft no fixture holds), in both rooms,
with the phone set to light and to dark (the two must be the same pixels: the chat wears its room,
not the phone's setting), on a 390 × 844 pt screen with a phone's safe areas. With
`TEST_RUNNER_FPUI_SHOTS=<dir>` it renders `.large`, `.xLarge` and `.xxLarge` and writes the PNGs there,
each whole conversation too (`TEST_RUNNER_FPUI_ONLY=a,b` limits it to some fixtures); without it,
`.large` only. Three of them (`heavyweight-chat`, `intake`, `empty`) render again over the 83 pt glass tab bar, as the
chat pushed in the Coach tab sits (build 61), the composer's bottom edge at least 8 pt above the bar (`-bar83.png`
beside the others). `Tools/chat-contact/run.sh <simulator UDID> <shots dir> <sheets dir>` adds the web
chat drawn for the same fixtures and variants by Playwright (`web-shots.js`, through `tests/lib/harness.js`, at
the web's zooms 1, 1.12 and 1.25) and builds one contact sheet per room, native beside web
(`sheet.py`). Use a simulator of your own, never the paired iPhone + Watch.

FPUITests alone (in this folder):

```sh
xcodebuild test -scheme FPKit-Package -destination 'platform=iOS Simulator,id=<UDID>' -only-testing:FPUITests
```

## The screen bridge in the app

Plan task C5 (decision.md sections 6 and 7): the shell's side of contract v1, in FPUI, with the thin TrovoShell plugin
in `ios/App/CapApp-SPM/Sources/CapApp-SPM/TrovoShellPlugin.swift` (calls hop to main and reach `ShellBridge` through
`ShellHostAdapter` in `AppDelegate.swift`, since CapApp-SPM cannot depend on FPKit). Build 61 (plan tasks H1-H9) adds the
tab root: the plugin's `selectTab`, `sheets` and `setSwitch` (14 methods, `intents.json`'s `messages`), the
RootTabController SceneDelegate builds around the page, ScreenHost's stack mode and the bridge's tabs half.

| File | Holds |
|---|---|
| `ShellBridge.swift` | `ShellBridge.shared`: bound to one web view (`install(webView:presenter:pageBuild:launch:)` from `capacitorDidLoad`, which decides the scene's root and answers the screens the page being served may present, for the flag: `ShellInstall`), with its LinkState (FPCore: the 15 s hello deadline in foreground time, negotiation, the 3-failure breaker, per piece from build 61, its held timeouts confirmed by a `ping` that ShellBridge sends: see Switches), PageLink and ScreenHost. A document-start script posts `fpShell` at every main-frame document: the document before it is gone (its pending intents end unsent or unanswered and are never resent, its open confirm closes as stale; a screen it had up stays up). `hello` negotiates with ScreenGate for the hello's page build and names the screens still up from the document before (`up`, FPCore `HelloReply.takingOver`), which the page takes over; the shell then resyncs them (`shell.covered`, `coach.snapshot`). `bootDone` reaches the store breaker (FPHost `StoreAttach.bootDone`, through `environment`). The policy file's screen switches (FPHost `FPPolicy.changed`, through the App) take a screen down at once (`screens.off` "withdrawn"). Also `ShellWebView`, the app's WKWebView: it counts every time it leaves its window while the app is active (never by design), except during a scene's teardown (`ShellWebView.sceneEnding`, which SceneDelegate sets before it lets go of the window and the page and clears at the next connection). Build 61's tabs half (H7, H8): SceneDelegate's `ShellLaunch` lets `install` make the root a tab root iff `tabs` passes its own checks (the OS, the shell's switch, the policy, a crash verdict, the breaker, a decline), so the flag's `tabs` and the root agree, and `adopt(root:)` binds the RootTabController built for that decision (the link on the tab root's rule, ScreenHost's stack attached, the root's hooks to the page through weak captures; its log line names the selected tab, the Coach tab's mode and the root's first room). Hello's reply carries `tabs {selected, seq, bar}`, records the page build's declines and sets the Coach tab's mode (WEB when the reply leaves `coachHome` out; a WAITING tab's 3 s net). `selectTab` and `sheets` drive the root, `setSwitch` sets the shell's switch. `tabs.select` goes for the owner's taps, deep links and strays, never for a page selection, and `tabs.bar` for the shell's own bar changes; both are state, never resent: after a failed one the current selection or bar goes once the link is idle, with a new seq or rev, at most `restateLimit` (3) restates of a kind in a row, counted again from the page's next answer of that kind or the next document. A move into a web tab whose `tabs.select` no document answered is heard by VoiceOver after the next hello's answer has reached the page (`announceAfterHello`, the root's `pendingWebAnnounce`). The fallback, once per scene on the link's `fellBack` (a hello without `tabs`, `dismiss tabs`, no hello, a `tabs` trip, the policy, `setSwitch`): the root's half, ScreenHost out of the Coach tab's stack, `screens.off` for what the tab root's rule had negotiated (the chat's with the native composer's words, which leave it only on `took: true`), `shell.covered {on:false}` when the Coach tab covered the page, and a document-start script deleting the flag's `tabs` for the scene's later documents. `deepLink(_:)` is the one warm `trovo://` entry for both roots: under a live tab root it selects Log (`start`) or Coach (`share`) first; the URL is `_trovoOpen`'s argument, never script source. Until the native Coach tab is wired (H10), `present coachHome` under a live tab root is refused `not-presentable` and coachHome models are dropped unread, so the page shows its web Coach under the native bar |
| `PageLink.swift` | Swift to page: `window.FPScreens.call(name, args)` through `callAsyncJavaScript` in the page world, one intent at a time, first in first out, 2 s (5 s for a snapshot); every intent carries its document's boot, and a document that goes takes its intents with it (`documentGone`, never sent again). An error answer a page whose process just died also gives waits 0.8 s to show its document went before it counts |
| `ScreenHost.swift` | Native screens over the page: `.overFullScreen` only (the web view never leaves its window: no `visibilitychange`, no leave and return path), one transition at a time (a dismissal right behind a present not yet started cancels both), the owner's Back and edge pan latched (the page hears `coach.back`; if it stays on the chat the screen goes up again), focus (the page's field blurred through `shell.covered` and editing ended before covering; the descriptor's `hasInitialFocus` is false), VoiceOver (the web view hidden while covered, the screen modal), `overrideUserInterfaceStyle` from the model's `paper` on every hosting controller and the toast window, the crash marker. The toast window (`ShellOverlay`): forwarded toasts 8 px under the chat's header (or the status bar), its strip only as tall as the toast; confirms over everything, the window key while one is open. The chat's `CoachStore` lives here, one per binding (C7): models go to it (`update`), the chat draws on it, its intents and their outcomes go through `Hooks.ask`, a document that goes reaches it (`forgetModels`). A presentation UIKit refuses without a word (another controller's delayed presentation: no completion and no presenting controller after 2 s) is not up: the page shows its own and the queue goes on. A toast still showing when the chat goes moves under the status bar. VoiceOver's escape on a screen goes back (Cancel during setup). The toast window follows a live change of the phone's text size. A hardware keyboard's Cmd+Return sends from the chat: the controller's own key command, ahead of the text view's Return (`CoachComposerDraft.sendAsked`, which the chat answers as its Send; the simulator's software keyboard drops modified keys, so a real key is a device check). Build 61's stack mode (H5): under a live tab root ShellBridge attaches the Coach tab's navigation stack (`attachStack`, the root's answers as a `StackState`), and the chat is pushed there, never presented: only while the Coach tab is NATIVE (`present coach` is refused `not-native` otherwise), never changing the selection, the bar left over it, animated only while Coach is selected, the tab not held and nothing presented over it; one push or pop at a time against UIKit's late and repeated `didShow` (out of the window an op is done once UIKit has taken it, after `settle`, a layout pass, ends a transition a tab switch cut); iOS 26's content pop off while attached, so the edge pan is the one interactive pop; at most one Coach-tab marker, for the screen on top while the app is active, Coach selected and the tab NATIVE. The overlay stays for a classic root and after the fallback (`detachStack`) |
| `SlideTransition.swift` | `ScreenSlideTransition` (SwiftUI has a `SlideTransition` of its own): the push-like slide in from the trailing edge with the page dimmed under it, out the same way, interactive from the leading edge; a cross-fade with Reduce Motion |
| `ShellProbe.swift` | Debug builds only: the shell scenarios' hands inside the app (`-fpShellProbe <steps>`), for tests/native-shell.sh and tests/tools/native-chat.py (test-native.sh): JavaScript in the page world, intents through the link, the owner's Back and edge pan, taps on the toast window, keys on the native composer, Send, presses on the chat's controls through their own accessibility actions (it turns the simulator's accessibility runtime on for them and back off when done), the conversation scrolled to its top or end, and the web view taken out of its window and back (the fault Settings > About counts) |
| `Tabs/RootTabController.swift` | The tab root (build 61, H4; iOS 26 and later): UIKit's glass tab bar over Log, Progress, Coach and Settings, with the one web view moved between the slots by one funnel (`select(_:source:)`: parked, selected without animation, placed, never out of the window; a selection set any other way is a stray, counted and redirected), the hold (a NATIVE Coach tab's home kept blank for a push on its way, until `releaseHold()` or 0.5 s), the bar's numbers (`h` 0 while hidden: a sheet open on a web tab, and for good after the fallback, as `Fixtures/shell/bar.json` has it; `predicted(screen:)` for the first frame), the Coach tab's modes per scene (WAITING, NATIVE, WEB; while Coach is selected and not WEB the web view waits hidden in the Coach slot), the fallback's UI half (`fallBack(why:at:)`: the bar hidden for good, the Coach tab WEB, editing ended first when the Coach stack hides, so no native field keeps the keys up over the page), VoiceOver's screen change for a run into a web tab once the page has drawn it (`announceWeb(seq:)`; `pendingWebAnnounce` names a run no document answered), the room's style on the bar's container (`paintBarContainer`, only while that container holds neither the web view nor a slot, its own style given back otherwise: iOS 27 draws the glass's content in the container's style) and `describe()` (the probe's `root` block: `firstRoom`, the bar with its `containerStyle`, the Coach stack, the funnel's runs). It sends nothing to the page: its `hooks` go through ShellBridge |
| `Tabs/TabSlots.swift` | The slots: `WebSlotController`, a plain full-bleed container for Log, Progress and Settings, and `CoachSlotController`, the Coach tab's: its `webArea`, where the web view waits hidden behind the stack or shows while the tab is WEB, and above it `CoachNavigationController` (its system bar hidden, never presenting), rooted on the WAITING ground in the room's background. No slot pins the web view to the safe area or carries the room's style |
| `Tabs/TabBarLook.swift` | What the bar wears (contract 6.1, D16): TabsModel's tint, idle colour, titles and accessibility labels (exactly `a11y`; before the first model the compiled defaults of the room read at launch) on UIKit's bar, with the shell's glyphs and order; the room's style (`paper`: light, else dark) on the bar, the Coach tab's navigation controller and the bar's container, never on the window, the root or a slot, so the web view's traits, its keyboards and the page's `prefers-color-scheme` stay the phone's. The glass differs by runtime: iOS 27 draws its content in the container's style, so the bar wears the room whatever lies under it; iOS 26.x takes the style of what is drawn under the bar (right over the room's own page, flipped over content unlike it). On iOS 27.0 the glass bar draws unselected items in its own colour whatever `idle` says |
| `ShellMarkers.swift` | `SectionMarker` (build 61, H6; contract 10.2): the short-section crash markers, one file per kind in `Application Support/FPShell` beside build 60's `presenting.<screen>.marker`: `section.tabs.marker` (`tabs@<page> shell <n>`: the tab root's construction, each funnel run, each bar hide or show, the fallback) and `model.<screen>.marker` (`model <screen>@<page> shell <n>`: every model's decode and apply). A state byte, `1` inside a section and `0` outside, flipped by one `pwrite` each way on a descriptor kept open, as the store's marker is; nested sections hold it until the last one ends; written whatever the app's state. Build 60 never reads these files |
| `ShellSwitches.swift` | The shell's own device switches (build 61, H6; contract 3.5): `tabs` alone, the native tab bar's, set by TrovoShell `setSwitch` (Settings > About > Native tab bar). `Application Support/FPShell/switches.json` (`{"tabs": false}`), written atomically and read first, with a copy in UserDefaults `fp.shell.switches` read only when the file does not: the copy is written first, and a file that could not be written while protected data is available is removed, so the next launch reads the copy. Off acts at once (the scene falls back, `switch`) and at every launch after; on from the next launch. The Native Coach chat's switch stays the page's `kt_native_off` |

**The breaker book and crash markers.** The screens' BreakerBook (the native breaker per screen and page build, and the
screens' crash verdicts) lives in the link, and every change goes through it (`editBook` for the markers found at launch
and the Debug clears); it is written to `Application Support/FPShell/breakers.json` (a copy in UserDefaults under
`fp.shell.breakers`, read only when the file does not) whenever the link says `bookChanged`. The store keeps its own
(`FPStore/breakers.json`). While a screen is up and the app active, `FPShell/presenting.<screen>.marker` holds
`presenting <screen>@<page build> shell <shell build>`; it goes when the screen goes and when the app stops being active
or enters the background (written again when it comes back with the screen up; a screen that goes up while the app is
away writes none, so a kill in the background is no crash), so only a death on screen leaves one. The next launch records the
verdict (that screen off for that shell and page build: the flag and every hello leave it out, so the page shows its web
screen; a new page or shell build is clean) and removes the file, so a marker acts once. Build 61 adds the short sections
(contract 10.2, `ShellMarkers.swift`), written whatever the app's state: `section.tabs.marker` around the tab root's
construction (inside SceneDelegate's build, to the end of its first layout pass) and its own sections, and
`model.<screen>.marker` around every model's decode and apply. A death inside one gives, at the next launch, the classic
root (`tabs`) or that piece off (`model`) for the (shell build, page build) pair; `-fpIgnoreMarker` covers these too. The
book also keeps each piece a page build declined (`declined`: a hello that left `tabs` out, a version refusal,
`dismiss tabs`, or `coachHome` left out beside `tabs`), and `breakers.json` keeps build 60's write rule: a failed write
leaves the older file in place.

**Switches.** The page's own (`FP_NATIVE`, Settings > About's `kt_native_off`), the policy file's `screens.coach`, a
crash verdict, the native breaker (no hello within 15 s of foreground time, or 3 failed intents or undecodable models in
a row). From build 61 an intent counts against its own piece (`coach.*`, `coachHome.*`, `tabs.*`: FPCore
`Intent.screen`) and the shell's own (`ping`, `shell.covered`, `confirm`, `toast.undo`, `screens.off`) against every
live piece, as a model counts against its screen. A timeout of `tabs.select`, `tabs.bar` or `shell.covered`
(`LinkState.heldOnTimeout`) is held: the link asks for a `ping` once it is idle (`pingWhenIdle`, which ShellBridge sends
at the end of the queue); any answer drops the holds uncounted (a busy page, not a broken one), the ping's failure
counts them and then itself, a ping that ends with no answer at all (`pingLost`) lets the next hold ask again, and a
document start drops them (D41). The shell keeps no device switch of its own in build 60. Build 61 adds the tab bar's
own (`ShellSwitches`, `FPShell/switches.json`: TrovoShell `setSwitch {screen: 'tabs', on}` from Settings > About >
Native tab bar; any other piece is refused `no-switch`), the policy file's `screens.coachHome` and `screens.tabs` (a
`tabs` off falls the scene back at once, a `coachHome` off turns the Coach tab WEB), the iOS 26 floor of `tabs` (`os`),
a page build's decline (`page`), the short sections' verdicts and the page's `FP_TABS`; a piece whose own checks pass
may still be off for another's (`needs`, FPCore's `ShellPieces`).

**Settings > About says why** (decision.md section 6; section 11.9's counters). The flag names every screen the binary
has (`binary`), so the page keeps the Native Coach chat row whether the chat is on or off; TrovoShell `status` (FPCore
`ScreenStatus`) says, per screen, whether the next document may show it, whether this one does, and why not: `device`,
`policy`, `crash` (the verdict's words and time) or `breaker` (`no-hello` or `failures`, with the trip's detail). The row
reads "Off: the app closed with it open", "Paused: no hello", "Paused: calls kept failing" or "Off by the policy file", and
its sheet offers "Try the native chat again" where a verdict or a trip holds: TrovoShell `reset` clears the screen's crash
verdicts and its breaker record through the link's book (saved), for the next document; the one on screen keeps what it
negotiated. The sheet lists the shell's counters, kept across launches in UserDefaults `fp.shell.counters` (FPCore
`ShellCounters`) beside this launch's: the web view leaving its window while the app is active (ShellWebView), the page
going hidden while a native screen covers it and the app is in use (the page's TrovoShell `visibility`, sent on every
visibilitychange while covered; the shell counts a hidden page only while the app is active and only one that went hidden
after the app last became active, so leaving the app or a report that arrives on the way back is not counted), breaker
trips and crash markers. Before, the row needed a negotiated chat: it vanished exactly when the chat was off, and only the
Debug `-fpClearVerdicts` could clear a verdict. Build 61's status adds the reasons `os`, `page` and `needs` (with what the
piece needs), the root built at scene connect, the fallback (`fellBack {why, at}`), the shell's switches, the policy
file's last check (`status {refresh: true}`, About's "Check the switches now", fetches it first, at most once a minute)
and the strays counter (selections made outside the funnel); `reset` also forgets the piece's decline.

Debug launch arguments (besides FPHost's): `-fpSmoke` (after each hello a ping through the real link, logged as
`fp: ping ok v1`, subsystem `app.kt.trainer`), `-fpShellProbe <steps file>` with `-fpShellProbeLog <name>`; FPHost's
`-fpIgnoreMarker`, `-fpClearVerdicts` and `-fpClearBreaker` act on the screens' records too (the tools end the app with
`simctl terminate`, which can land with the chat up and leave a marker). From build 61 SceneDelegate reads, in a Debug
build only: `-fpOpenURL <url>`, one more connection URL for the process's first connection, parked for the page's boot
read as a cold `trovo://start` or `trovo://share` from the system is (`ShellFlagScript.Dev.openURL(arguments:)`: none
when the value is missing, empty or the next option, or has no scheme; a replayed connection gets none);
`-devTheme <room>` for the first frame's room when it names one of the page's rooms (`heavyweight`, `dark`; any other
value counts as none); and `-devNav <route>`'s head for the first frame's tab (`ShellTabs.firstTab`: Coach for a cold
`trovo://share`, `-fpOpenURL`'s included, else the route's head when it is Progress, Coach or Settings, else Log). The
policy starts at the process's first connection, before the gate decides the root (`FPPolicy.shared.start()` acts once
per process, so a replayed connection reads nothing new), and reads `-fpPolicyFile <path>` there whenever a fetch is due
(every launch with `-fpPolicyEvery 0`; a relative path is read from the app's home, its data container, and the file
wins over `-fpOffline` for the policy). A launch with a file naming `screens.tabs` off
(`{"v":1,"screens":{"tabs":"off"}}`) and `-fpPolicyEvery 0` gets the classic root; `-fpOffline` alone gives the compiled
defaults, every piece on, so the tab root on iOS 26+ unless the phone's own data turns `tabs` off (the shell's switch, a
verdict, a trip or a decline for the page build). FPHost's StoreProbe step `sceneCycle` replays a reconnect through the
App's `StoreProbe.sceneReplay` (SceneDelegate's own teardown, then its connection on the same window scene: a new
window, page and deep-link observer), its event naming the new root, `tabs` or `classic`.

Tests: `PageLinkTests` (a real WKWebView and a stand-in `FPScreens`: order, one at a time, the answers as the breaker
counts them, timeouts, a late answer dropped, nothing sent unlinked, a document that goes, a new document, an outcome
that asks again), `ScreenHostTests` (over a stand-in page in a window, with a stand-in for UIKit's presentation, which
never finishes in a test host without a window scene: `.overFullScreen`, the queue, the latch, the marker and the app's
activity, the confirm, the toast strip; the edge pan and the toast window need a window scene and are skipped without
one; from build 61 the `testStack...` cases, on a real UINavigationController as a tab of a UITabBarController in the
window with a stand-in StackState, each waiting on the queue going idle, never on a fixed time) and `ShellBridgeTests`
(markers to verdicts once, hello and `up`, the resync, the policy's off, another web view's message refused; from build
61 the refusals' codes, the new messages with no tab root, the iOS 26 floor, held timeouts and their ping answered,
failed or lost, a section left open giving one verdict at the next launch, a model marker turning off its piece for its
pair only, `-fpIgnoreMarker` reporting the short sections and recording nothing, the last launch's section read before
this launch writes its own, the `tabs` section holding its marker while it runs, models and the resync's snapshot read
inside their markers, the switch file in the gate, and a scene teardown that counts no fault). Build 61's:
`RootTabControllerTests` (a real RootTabController on a real window, a RecordingWebView standing for the page: the
funnel never takes the web view out of the window, one funnel and its strays, focus, the bar against
`Fixtures/shell/bar.json`, the room on the bar and its container, the fallback, VoiceOver, the status bar, the hold, the
modes per scene and `describe()`), `ShellBridgeTabsTests` (ShellBridge with a live tab root built as SceneDelegate
builds it, over a stand-in page whose `FPScreens.call` answers as each case sets and keeps unanswered promises
reachable, since WebKit fails a call whose promise the page's garbage collector took: the root decision, `selectTab` and
its funnel, taps, re-taps and strays, `sheets`, `tabs.select` and `tabs.bar` as state, the interim `coachHome` drop,
deep links, covered, the teardown that frees the root and the web view, VoiceOver after the page's answer, a busy page
against a dead one; then hello with `tabs` and the declines, the fallback and each of its triggers, the Coach tab's
modes, the switch, the status, the composer's words handed over, `status {refresh}`) and `ShellMarkersTests` (the
section markers' state byte across a process that dies inside a section, the switch file read before its UserDefaults
copy). The Coach tab's own are under [The native Coach tab](#the-native-coach-tab-coachhomeview-and-coachhomestore). In
the real app, `tests/native-shell.sh`.

### tests/native-shell.sh

The screen bridge in the real app on the real page, on the first paired iPhone + Watch of a runtime (iOS 26.x by
default; `--os 27`), scenario by scenario through `ShellProbe` and `tests/tools/native-shell.py`: `smoke` (`-fpSmoke`
logs `fp: ping ok v1`; v1 negotiated with the coach), `chat` (the chat presented `.overFullScreen` on the page's model,
a message sent and answered, the model switch, a forwarded confirm and an Undo toast round-tripping, Back, no
`visibilitychange`, Heavyweight light and Lime dark), `focus` (a tap into the page and a focused field low enough that
WebKit scrolls to it, then present and dismiss by the page, by Back and by the edge pan: no keyboard comes back and the
document is not scrolled; an edge pan let go early leaves the chat up; the simulator's software keyboard is turned on
for the scenario, since it counts a hardware keyboard as attached), `wckill` (WebContent killed with the chat up and a
send in flight: the new document takes the chat over, the shell resyncs on its boot, nothing is resent, the words go
back in the composer, the open confirm closes as stale), `marker` (a planted crash marker brings back the web chat,
once; Settings > About keeps the row and says why, its sheet lists the counters, and the owner's "Try the native chat
again" brings the native chat back at the next launch), `policy` (`screens.coach` "off" takes the chat down at once, and
About says so), `breaker` (three timeouts turn it off for the page build; About says it is paused; Try again brings it
back), `counters` (the web view taken out of its window with the chat up: the leave-window and hidden-page counts go up,
and About's sheet lists them) and `inactive` (the app sent to the background right after launch, so the page presents
the chat while it is not active: no crash marker is written while it is away, so a kill there gives no verdict at the
next launch). Shots in `screenshots/out/native-shell/`.

**On this branch these are build 60's scenarios, and a build of this tree has build 61's three pieces.** `smoke` reads
build 60's flag (`binary` `["coach"]`) and `chat` wants no marker file left after Back, where build 61 keeps its section
and model markers at rest (state 0): both fail on either root. Every scenario that puts the chat up also needs the
classic root, and the tool does not ask for it: its launches pass `-fpOffline` (only `policy` passes a policy file,
`{"v":1}`: the defaults), so on an iOS 26+ phone whose app data turns nothing off the scene takes the tab root, where
`present coachHome` is refused (the native Coach tab is not wired yet), the Coach tab turns web and the chat, joint with
it there, never shows. A phone gives the classic root with the Native tab bar switch off (`{"tabs": false}` in the app
container's `Library/Application Support/FPShell/switches.json`) or with a decline of `tabs` for the bundled page's
build: build 60's page (91708ae's `index.html` and `build.txt`, bundled by hand and run with `--no-build`) declines it
at its first hello, so every later launch of that build is classic.

## The live chat: CoachStore

Plan task C7 (`Sources/FPUI/Coach/CoachStore.swift`): what the native chat draws and where its taps go, between the page's
models and the owner's hands. ScreenHost keeps one per web view binding, so it outlives every presentation of the chat.

- **Models in order.** Within a document a model replaces the one drawn only when its `rev` is newer; an older or equal
  rev is stale and ignored (LinkState drops most of them first, but a snapshot's answer and a push can cross). A model of
  another document (the resync after a reload or a WebContent restart) replaces it whatever its rev. While the chat is up
  across a reload it keeps drawing the old document's model until the new one's arrives; down, the model goes with its
  document, so the chat never opens on a gone document's model.
- **The optimistic echo.** Send (and an empty chat's suggestion) shows the owner's message at once as their bubble,
  keyed by the send's nonce, over a day divider where the page would put one (`display`: the page's model with the
  messages on their way after its own). It gives way to the page's message when a model holds it: by the message id
  `coach.send` answers with, or, when the page's push overtakes that answer (pushes go through the plugin's queue), by a
  message of the owner's with the same words or photo said at or after the send. Never resent: a send the page refuses
  (`busy`, a reply in flight) or that never reached it (nothing linked) goes back in the composer at once, in front of
  anything typed since, with a toast in the room's error style ("Couldn't send that: your message is back in the box");
  one with no answer to rely on (a timeout, a broken bridge, its document gone) waits for the page's next model (the
  next document's, or the same document's 1.5 s on) and goes back only if that model does not hold it, or after 8 s with
  no word at all; one the page took but no model shows after 5 s (Clear chat) goes quietly. A send still being asked
  waits for its answer whatever models come meanwhile (one made right after a reload reaches the new page after the
  shell's resync snapshot, whose model cannot hold it yet). The scene going puts everything still on its way back in the
  composer, without a toast.
- **The composer** (`CoachComposerDraft`) is the store's: the owner's words survive the chat going down and up again and a
  relaunch (UserDefaults `fpDraft.coach`, removed when the box is empty); a picked photo survives a dismissal in memory.
  Only the composer observes it, so typing never repaints the conversation. The page's own draft (Build day's question,
  a shared photo's comment) goes in once per nonce, filling the box as the web composer fills from `coachPrefill`, and the
  page hears `coach.draftTaken`; a chat drawn on the store never sends its own.
- **Photos** by key: those this chat sends (`n:<nonce>`, as the page keys them, so the page's message draws the same
  photo as the echo did) and the page's pending one (a shared image), fetched once with `coach.image` (one the page will
  not give is not asked for again, and the chat says Photo). A photo sent with no words is held by a message of the
  owner's with a photo and no words said at or after it: the page keeps no photo key across a reload, so one whose answer
  a reload lost went back in the composer although the page had it.
- **Toasts and confirms** go through the bridge: the page forwards its own while the chat covers it and ScreenHost's
  window draws them; the store's own (a message not sent) go to the same window. A confirm open when its document goes
  closes there as stale.

Tests: `CoachStoreTests` (rev order and the next document's model, the echo by id and by words and time, a duplicate,
refused and unlinked sends back at once, a timeout decided by the next model, no word at all, taken but never shown, a
reload's resync putting back what the next document lacks and not what it saved, a send right after a reload waiting
for its answer, the binding going, the composer across presents and launches and drawn in the chat's box, the page's
draft once per nonce, Back to the host, a suggestion's echo, photos by key), plus
`ScreenHostTests` and `ShellBridgeTests` cases for a reload under the live chat (the confirm closes stale, the send ends
with its document and is never sent again, the new boot's snapshot is drawn at rev 1, the words come back).

### The coach's API base in a test launch

A real coach turn needs Anthropic's API and a key; a Debug build's `-fpApiBase http://127.0.0.1:<port>` hands the page
a stand-in instead (FPHost `ShellFlagScript.Dev.api`, FPCore `ShellFlag.devAPI`, `window.__FP_SHELL.dev.api`). The page's
`_coachApiURL()` takes it only when it is an http(s) origin on this device's loopback, else every coach call goes to
Anthropic as always, so a Release shell (no `dev` in its flag), an older shell, the PWA and the browser never change
(spec 121). In the simulator the page's fetch (CapacitorHttp, through URLSession) reaches the Mac's loopback with no ATS
exception. `tests/tools/coach-stub.py` is the stand-in: it answers `POST /v1/messages` as the API does (its shapes and
status codes; 401 without `x-api-key`, 400 without `anthropic-version` or with an unknown `tool_use_id`) from a script
of turns (a question's words to its opening text, tool call and closing words, with an optional delay), answers the
one-shot calls (Today's card, a debrief, the key check) with the JSON their callers parse, and records every request
(never the key itself).

### test-native.sh and the live chat

After its routes, `test-native.sh` runs `tests/tools/native-chat.py` on the same phone and app container: `prepare` (every
localStorage value kept to put back, as base64 of its UTF-16 code units since a value can hold half an emoji; a probe key
only if the container has none; the composer emptied), `smoke` (`-fpSmoke` logs `fp: ping ok v1`), `keys` (with the
simulator's software keyboard turned on: the native composer takes the keys and sits above them, typed words reach the
store, Back with the keys up leaves none and nothing scrolled, the words kept across a present and a relaunch, a web
field's keys gone when the chat covers it, the page's own dismiss with the native keys up, a six-message chat at its end
keeping its newest message in view as the keys come up), `live` (a coach turn on
`coach-stub.py`: the echo shot before the page has it (its `coach.send` held 1.4 s in the page world, under the link's
2 s), Thinking with Stop, the reply with a tool pill and PLAN CHANGES, Undo through the forwarded confirm and Restore,
a second turn's Keep changes, Send while scrolled to the top bringing the end into view with the owner's message and the
reply (the probe moves the conversation as a finger's drag does, between the drag's own callbacks, and presses the
chat's own Send: a press that fell back to the store's send skipped what the chat does on the owner's action), Stop
while scrolled to the top bringing it into view with the question and the note that says it stopped, a reader who scrolls up while a reply is on its way keeping their place, a third card left for the next shots; every press through the control's own accessibility action), `combos` (`coach/chat` by launch argument in both rooms x `simctl ui appearance light|dark` x `content_size
large|extra-extra-large`: native, over the page, drawn in the room's appearance whatever the phone says, at the phone's
text size; the phone's settings put back), `textoff` (the app's Larger Text off and the phone at extra-extra-large: the empty
composer as tall as at Large) and `restore` (only the values that changed put back, the page reloaded, the
chat, programme, weights, key and room compared). Every launch takes `-fpIgnoreMarker`. Shots in
`screenshots/out/native/` (`coach-chat-*`, `keys-*`, `live-*`).

On this branch `native-chat.py` still expects build 60's overlay chat (`negotiated` `["coach"]`, the chat presented
`.overFullScreen`), which a build of this tree does not show under the tab root it takes on an iOS 26+ simulator (see
[tests/native-shell.sh](#testsnative-shellsh)): test-native.sh's routes, store check and watch still run, under the
native bar, and the run exits 1 on the chat.

## The native Coach tab: CoachHomeView and CoachHomeStore

Build 61's Coach tab root (plan tasks N7, N8 and N12), in FPUI beside the chat: FPCore's `CoachHomeModel` drawn as the
web draws its Coach tab, the owner's presses sent as `coachHome.*` intents. Neither is hosted yet: ScreenHost makes no
CoachHomeStore and nothing installs the home (`RootTabController.setHome(_:)`), so the Coach tab never turns NATIVE
until H10 wires them; meanwhile ShellBridge refuses `present coachHome` under a live tab root and drops coachHome models
unread, and the page shows its web Coach under the native bar.

| File | Holds |
|---|---|
| `Coach/CoachHomeView.swift` | The native Coach tab's root as the web draws its Coach tab (build 61, N7; contract 6.2, 8.3): FPCore's CoachHomeModel as the hub (its groups of rows) or the connect screen (the key field, CONNECT, the starter link), in the model's room at the chat's clamped text size, every string the page's. It sends `CoachHomeAction`s to a `CoachHomeHost`, never intents. The key lives only in the connect block's `@State` and leaves the view only inside `.connect(secret:)`, whose printed forms show it as ••• |
| `Coach/CoachHomeStore.swift` | The Coach tab's store and root (build 61, N8; contract 15.2): `CoachHomeStore` holds the page's newest model (CoachStore's rev rule; a document that goes takes the model with it unless the tab is NATIVE) and sends the presses as `coachHome.*` intents through its hooks (CONNECT's `coachHome.setKey {secret}` once, nothing more until the page answers; the key in no property, event, outcome, toast, `describe()` or log line); `CoachHomeRoot` draws the first frame's ground until a model, then the hub, fading in (0.2 s, at once under Reduce Motion) |

Tests (FPUITests): `CoachHomeViewTests` (every coachHome fixture laid out in both rooms, VoiceOver's order and traits,
the key field secure, autocorrecting nothing and taking no focus by itself, one action per press, a typed canary leaving
no trace), `CoachHomeStoreTests` (models in rev order, a document going, the presses as intents, the key sent once,
`describe()`, CoachHomeRoot in a window and as a Coach stack's root) and `CoachHomeRenderTests`, which draws every
`Fixtures/coachHome` file and the `built-connect` variant in both rooms, light and dark, at `.large`, `.xLarge` and
`.xxLarge`, on 390 × 844 and 320 × 568 over the 83 pt bar, and holds Larger Text's growth and cap, the column's exact
end, and every string the model shows read back off the render by Vision (`DrawnText`; the avatar by its tile). With
`TEST_RUNNER_FPUI_SHOTS` it writes `native/home/<fixture>/...`, from which no contact sheet is made yet
(`Tools/chat-contact/run.sh` runs CoachRenderTests alone).

## FPStore: the native store

A native copy of every `kt_*` value WebKit's `localStorage` holds, in the page's exact UTF-16 code units,
kept in step by the shell-owned facade (`Resources/ktstore.js`, plan task S3). Build 60 is **shadow only**:
WebKit stays in charge, the store follows it, records what it would have repaired, keeps every value it gave
up, and never writes WebKit by itself. The facade's protocol (KT1) is written out in `KTProtocol.swift`.

| File | Holds |
|---|---|
| `KTWire.swift` | `U16` and `KTKey` (code units, never `String`), the value hash `len:fnv1a32:djb2` (the facade's `H()`), JSON string literals both ways, the one-pass snapshot encoder, an exact JSON scanner |
| `KTProtocol.swift` | KT1: heads (`hello [nowk]`, `put`, `w`/`d`/`c B:S`, `pb`, `p B:S`), the hello payload and gap note, answers, async post bodies, reserved keys |
| `KTStore.swift` | The store: open, the prompt channel, async posts, hello and put, rule 3, Put back, snapshots, status for Settings > About > Storage, shell values in `meta` |
| `KTSQLite.swift` | The one connection: exact binding, and any step result other than ROW or DONE as an error, never "the end of the table" |
| `KTJournal.swift` | `journal` with `hprev`, kept per key: its last 32 writes plus everything from the last 10 minutes |
| `KTReconcile.swift` | The seven rules (below), a pure function of the hello and the store's state |
| `KTSnaps.swift` | `snaps/` files written beside their name and renamed: daily (7 kept), `migrate`, `wiped`, `manual` (30 days) |
| `KTPutBack.swift` | Put back's plan, and the record merge by id for the five log keys |
| `Resources/ktstore.js` | The page facade the shell injects at document start (shadow only): WebKit first, then the synchronous mirror; on any answer but `ok` the gap note in WebKit and an async post with (boot, seq); the witness and the gap note in hello; `window.__ktStoreState` with `acked(key)` and `remirror(key)`; never a prompt without the flag; `kt_apikey` never crosses |
| `KTFacade.swift` | The facade's source from `Bundle.module`, and the flag script StoreAttach injects before it (`window.__ktStore = {proto:1, shell}`) |

On disk: `Application Support/FPStore/store.sqlite` (+ `-wal`, `-shm`) and `snaps/`. One connection on one
serial queue, `busy_timeout` 2 s; WAL with `synchronous=NORMAL`, `FULL` for a transaction that writes
`kt_sessions`, `kt_runs`, `kt_sports`, `kt_bw` or `kt_measurements`. Schema v1, additive forever: `kv(k, v
BLOB or NULL tombstone, enc, h, seq, at, src, boot, pseq)`, `journal`, `meta` (`schema`, `minReader`,
`wkExcluded`, first/last shell, diagnostics, the shell's `policy` and `breaker`), `conflicts` (30 days) and
`putback`.

Rules the store keeps:
- Values are BLOBs of exact UTF-16LE, never TEXT: a lone surrogate, U+2028, NUL and 200k-character values
  survive. `kt_apikey` and the facade's own `kt__store*` keys never enter kv, the journal, snaps or exports.
- `PRAGMA quick_check` at open. A file that cannot be read (damaged, not a store, not yet unlocked, a WAL
  without its database) is never read as empty, recreated or overwritten: the store is off for the launch
  and `status()` says why. `meta.minReader` above this build: off, nothing written. A row whose `enc` this
  build does not know is never adopted, repaired or deleted.
- Async posts apply only when their (boot, seq) is newer than the key's last write.
- Put back is staged in Storage and written by the facade at the next document start (log keys merged by
  id, other keys only while unchanged since); the values it replaces go to `conflicts`, so it can be put
  back in turn. A kept "no value" (an older build created the key, a loss took back a removal) goes back as a
  removal, and its plan item says so (`removes: true`), so Storage asks "Remove ...?" instead of promising
  that nothing is removed; a log is merged, never removed, and its item names the records it adds (`records`,
  "<date> <day name or type>", at most 20): a merge is undone only by deleting them again.
- Every value given up names the start that gave it up (`boot`). `status(losses: true)` (what Storage reads;
  the status each hello reads leaves it out) groups each start's "lag" and "wiped" rows into one loss, kept
  while Put back of it would still write or remove something: Storage offers "Put back everything this start
  lost" as one intent, and its row says Put back until each key is back or changed since.

The reconcile at every document start decides from the `kt_last_open` witness. Every outcome but rule 3
leaves kv equal to WebKit:

| # | Situation | The store |
|---|---|---|
| 1 | store unreadable, or `minReader` above this build | attaches nothing |
| 2 | WebKit unreadable (`hello nowk`) | facade off; reconciles nothing |
| 3 | no witness in WebKit, WebKit near-empty, the store holds a full set | snapshot first, adopt nothing, offer Put back of the snapshot; the follow-up gives nothing up (facade off) until a snapshot exists |
| 4 | witness neither in the store's history nor vouched for by the gap note | an older or facade-less build ran: adopt every difference, deletions included (conflicts "older build"); nothing refilled |
| 5 | witness known; the gap note names a missed op on the key (or a missed clear), and the store took no write of the key after it | the store missed that write: adopt |
| 6 | witness known; WebKit's whole manifest equals the store's state at one journal seq (a key the store wrote after an op it missed is read from that op on) | WebKit lost a suffix: would-repair counted, newer values to conflicts ("lag"), adopt |
| 7 | anything else | adopt; conflicts "unexplained"; counted |

Tests (`Tests/FPStoreTests`): `WireTests` (the facade's literals, hashes, hello and gap notes from
`Vectors/vectors.json`, and the gap note op by op as the facade must write it, each missed op's stamp `s`
and a missed clear's `c` included), `ReconcileTests` (every S2 reconcile row through the protocol on a fake
device, and the classifier on its own), `StoreTests` (the file, answers, journal, snapshots, conflicts, Put
back, timing), `FacadeTests` (the shipped `ktstore.js` run by JavaScriptCore against this store: no prompt
without the flag, migration, exact writes, native failures and the gap note, the repeated delete, the witness,
WebKit wiped and unreadable, Put back) and `KillTests` (a writer SIGKILLed mid-burst keeps every acknowledged
write). The Playwright store matrix runs the same `ktstore.js` in Chromium over `tests/lib/ktstore-mock.js`, a
JavaScript reference of this module: `STORE=shadow ./tests/run.sh`, and specs 119 and 120. KillTests starts
this test binary again through the `xctest` runner with `FPSTORE_KILL_DIR` set; in an ordinary run its child
test is skipped. The vectors come from JavaScript itself (the facade, plan task S3, must write its gap notes
as `noteAfter()` there does); after changing the facade's hash, literals or note:

```sh
node tests/tools/ktstore-vectors.js           # rewrite Vectors/vectors.json
node tests/tools/ktstore-vectors.js --check   # exit 1 if the committed file is stale
```

## FPHost: the store in the app

FPHost binds the store to the shell's web view (plan task S5) and fetches the policy file (S7, the shell half).
Everything runs on the main thread, where WebKit calls the UI delegate and the message handler; store work the
page does not wait on goes to a utility queue.

| File | Holds |
|---|---|
| `StoreAttach.swift` | `StoreAttach.shared`: `install(webView:pageFolder:)` (from `capacitorDidLoad`) puts KTUIProxy in front of Capacitor's UI delegate and checks it is the delegate; only then does it add the facade's two document-start scripts (the flag, then `ktstore.js`, main frame only) and the async `ktStore` handler. At each document start (the facade's `hello`) the gate decides first: Storage's Native copy switch (`fp.store.off`), the policy file's `store.facade`, a store crash verdict for this (shell build, page build) pair, a launch after a document that never finished booting (`StoreGate`); off means hello is answered off without touching the store. Otherwise the store breaker is armed and the store answers; `bootDone` disarms it. The breaker and the crash verdicts are one record, `FPStore/breakers.json`, written atomically at every change before the page goes on (a copy in UserDefaults is read only when the file does not: UserDefaults reaches its disk later, through cfprefsd, and an app killed and installed again soon after came back to an older record there). Bound to the web view by weak reference: a newer web view takes over and the older one is detached (`sceneConnected`, `sceneDisconnected`). A checkpoint and the day's snapshot when the app goes to the background. `status()` is what Storage shows. From build 61 `firstFrameRoom()` gives SceneDelegate the first frame's room: the owner's `kt_theme` as the store holds it (`heavyweight` or `dark` exactly, read once inside the store's marker, nothing written), nil while the store is not ready, no page is bound or StoreGate is off for the page being served (the store may lag WebKit then). |
| `KTUIProxy.swift` | The UI delegate proxy: forwards alert, confirm, prompt and createWebViewWith (and, through `responds(to:)`/`forwardingTarget(for:)`, every other method) to Capacitor's handler, so Capacitor's own synchronous prompts (the CapacitorHttp check) still work; answers a `\u0001KT1 ` prompt only from the main frame of a `capacitor://` page, and never forwards one (Capacitor would show it as an alert) |
| `StoreMarker.swift` | The store's crash marker, `FPStore/store.marker`: a state byte set around every store operation with `pwrite` on a descriptor kept open, so a process that dies inside one leaves it set; the next launch turns the facade off for that pair (and leaves the store closed) until a new shell or page build, or the owner clears it |
| `PolicyFetch.swift` | `FPPolicy.shared`: `policy.json` from GitHub Pages (beside build.txt) at launch (`start()`, from SceneDelegate's connection) and on foreground, at most every 15 minutes; posts `FPPolicy.changed` (native screens follow at once; the store reads `effective` at each document start). From build 61 the last good copy and the fetch stamps live in `Application Support/FPShell/policy-state.json`, written atomically and read first, with a copy in UserDefaults `fp.policy` (build 60 reads only this one) read only when the file does not; a file that could not be written while protected data is available is removed, so the next launch reads the copy. `fetchIfDue(force:done:)` serves About's "Check the switches now" (ShellBridge's `status {refresh: true}`) |
| `StoreProbe.swift` | Debug builds only: the scenario runner's hands inside the app (`-fpProbe <steps>`), for tests/native-store.sh. From build 61 its `sceneCycle` step replays a reconnect through `StoreProbe.sceneReplay`, which the App sets to SceneDelegate's own teardown and connection |
| `StoreTestQuit.swift` | Storage's "Test: quit after next save" (TestFlight and Debug builds): the arm (a write or remove of one of the keys the page names, within ten minutes) and the record kept beside the store across the quit (`FPStore/testquit.json`), which the next launch's first document start completes with what it found (in step, or the keys WebKit lost that the store kept) |
| `ShellFlagScript.swift` | `window.__FP_SHELL` for this binary (FPCore `ShellFlag`): `screens` as FPUI's ShellBridge works them out from ScreenGate when the web view is set up (the page never reads it; each hello's answer is what counts) and, in a Debug build, `dev` from the test tools' `-devNav <route>`, `-devTheme <room>` and `-fpApiBase <origin>` (the coach's stand-in API). From build 61 the flag carries `tabs` (the first frame's tab and the bar's guess, `ShellLaunch.flag`) only when the scene's root is a tab root, and `Dev.openURL(arguments:)` reads SceneDelegate's `-fpOpenURL`. Every Debug reader (`Dev(arguments:)` included) sits inside `#if DEBUG` itself: an unused function is not stripped from a Release build, whose strings would carry its launch arguments |

**Settings > About > Storage** (plan task S6). The page reads and acts on the store through the TrovoStore plugin
(`ios/App/CapApp-SPM/Sources/CapApp-SPM/TrovoStorePlugin.swift`), which reaches StoreAttach through
`StoreHostAdapter` in `AppDelegate.swift` (CapApp-SPM cannot depend on FPKit): `status()` (StoreAttach's status
plus whether the test is offered), `conflicts({limit})`, `putBack({conflicts | snap | wipe, preview})` (staged Put
back makes the plugin reload the page, so the facade writes the values into WebKit before the page's first script),
`setSwitch({on})` (the Native copy switch; on also clears the store's crash verdicts), `exportCopy()` (the store as
one JSON file, handed to the share sheet; never a `supero-backup-*` name) and, where `TrovoStorePlugin.testKillAllowed`
(a Debug build, or a TestFlight install's sandbox receipt), `testKill({arm, keys})`. The page shows the row only with
the shell's flag and the plugin.

The page's `bootDone` (the end of its boot, whatever painted first; it also sends the OTA confirm when the first
render was the coach route) reaches StoreAttach through the TrovoShell plugin (plan task C5: `ShellBridge` hands it to
`environment.bootDone`, which `AppDelegate.swift` points at `StoreAttach.bootDone`). The OTA confirm no longer stands in
for it (`.trovoOtaConfirmed` is still posted, and nothing listens): a document that paints but never finishes its boot
now arms the store breaker as the plan says.

A new store gets `minReader` 60, so a build numbered below 60 refuses its own store from its second launch
(attach nothing, "minReader"). Release builds get 60 from release-ios.sh; tests/native-store.sh builds with
`CURRENT_PROJECT_VERSION=60` while the project still says 59.

Debug launch arguments (never read by a Release build): `-fpStoreSwitch on|off`, `-fpClearVerdicts`,
`-fpClearBreaker`, `-fpBreakProxy`, `-fpIgnoreBootDone`, `-fpIgnoreMarker`, `-fpNoWebKit`, `-fpOffline`,
`-fpProbe <steps file>` with `-fpProbeLog <name>`, `-fpPolicyFile <path>`, `-fpPolicyEvery <seconds>`, and the
tools' `-devNav <route>` / `-devTheme <room>` (into `window.__FP_SHELL.dev`: test-native.sh and
screenshots/shoot.py drive the page's dev-nav hook with them instead of writing `kt_dev_nav` into WebKit's file) and
`-fpApiBase <origin>` (`dev.api`: the coach's stand-in for the Messages API on the loopback, see
[The coach's API base](#the-coachs-api-base-in-a-test-launch)).
`-fpOffline` keeps the page's own update check off and, without `-fpPolicyFile`, fetches no policy file either:
the compiled defaults are in force for the launch (every piece on, whatever the phone's last good copy says), so from
build 61 an iOS 26+ phone takes the tab root unless its own data turns `tabs` off. From build 61 `-fpPolicyFile`,
`-devTheme` and `-devNav` also act at the scene's connection, before the root is decided, beside SceneDelegate's own
`-fpOpenURL`: see the screen bridge's Debug launch arguments above.

**A background launch can boot the page.** A watch message or a Health delivery can launch the phone app with no one
looking. The hub answers the watch from its cache either way, and the web view may never load; but UIKit can also
connect the scene in the background, and then the page boots and says hello (seen on the iOS 26.5 simulator after a
watch wake with the app killed: the store attached, in step, the breaker disarmed at bootDone, the marker idle). Both
cases happen (CLAUDE.md's watch bullet says so too). The device checklist should cover a watch wake and a Health
delivery with the app killed, then Storage for breaker trips and crash markers.

### tests/native-store.sh

The store on the real App target and the real page, scenario by scenario, on the iOS 26.x and 27.0
simulators (the phone of each runtime's first paired iPhone + Watch, by UDID): migration, a write while the
web view is out of the window, background and back, a WebContent kill, a launch without the facade, WebKit
unreadable, a checkpoint and snapshots racing page writes, the policy file, the store breaker, a planted
crash marker, no flag without a verified proxy, a scene disconnect and reconnect, an OTA page staged and
served, WebKit wiped and Put back, Settings > About > Storage through the real TrovoStore plugin (Put back of a
value an older build replaced, the test quit and its report, the Native copy switch across launches, the sheet and
Export a copy), the SIGKILL sweep, and with `--downgrade` the 59 <-> 60 drill on build 59 built at its own commit. `tests/tools/native-store.py` reads WebKit's and the store's SQLite files and
decides. See the header of `tests/native-store.sh` for its options.

## In the app

`App.xcodeproj` references this folder as a local package (an `XCLocalSwiftPackageReference` beside CapApp-SPM's), and
the App target depends on FPCore, FPStore, FPHost and FPUI, linked statically into the app like CapApp-SPM. Only the App
target's two configurations moved to iOS 17.0. The project level stays at 15.0 because `cap sync` writes CapApp-SPM's
`.iOS(.v15)` from the first `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj`; the widget (16.2), the share extension
(15.0) and the watch targets keep theirs. `AppDelegate.swift` imports FPCore, FPHost and FPUI and holds the App target's
whole side (objectVersion 60 means hand-edited file references, so no new App-target source files):
`instanceDescriptor()` sets `hasInitialFocus = false` (the shell owns focus), `webView(with:configuration:)` returns
`ShellWebView`, and `capacitorDidLoad` binds `ShellBridge` (the root decision and the flag's `screens` and `tabs` from
it), installs StoreAttach, registers TrovoShell and TrovoStore through their host adapters and forwards
`FPPolicy.changed` to the native screens; the SceneDelegate starts the policy fetch and lets the store and the screens
go when a scene disconnects.

From build 61 `Info.plist` names no main or scene storyboard (`UIMainStoryboardFile` and `UISceneStoryboardFile` are
gone; `UILaunchStoryboardName` stays; `Main.storyboard` is still compiled, and nothing references it; never put either
key back, or UIKit makes Main.storyboard's SuperoViewController too) and the SceneDelegate builds the window and its
root in code at each connection (CLAUDE.md, "Scene lifecycle"): it starts the policy (once per process: a replayed
connection's start does nothing) and rebinds the store, parks the connection's URLs for the page's boot read, makes the
one SuperoViewController with its `ShellLaunch` (the first frame's tab, `ShellTabs.firstTab`, and the bar's guess,
`RootTabController.predicted(screen:)`) and loads its view, so `ShellBridge.install(..., launch:)` decides the root
before the page loads; it reads the first frame's room (a Debug `-devTheme`, else `StoreAttach.firstFrameRoom()`, else
Heavyweight), builds the tab root inside the `tabs` short section and hands it to `ShellBridge.adopt(root:)` (or keeps
build 60's classic root, the SuperoViewController itself), sets the root once and only then calls `makeKeyAndVisible()`.
Its one `.trovoDeepLink` observer hands warm links to `ShellBridge.deepLink`; the teardown removes it, lets the store
and ShellBridge go, sets `ShellWebView.sceneEnding` and lets go of the window and the page.

Adding the package changed `originHash` in
`App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`, and Xcode then re-resolved every
pin, moving `ion-ios-filesystem` (the Filesystem plugin's library, `from: "1.1.1"`) from 1.1.2 to 1.1.4.
The committed file keeps the pins as they were under the new hash. If a later change to the package graph
rewrites the file again, keep the pins unless that change means to move them. The hash also depends on the
checkout's path: a build in another worktree or checkout rewrites `originHash` (and Xcode may move
`ion-ios-filesystem` to 1.1.4 with it), so put the file back with `git checkout` before committing there, and
at the merge resolve once in the main checkout and commit that file with the `ion-ios-filesystem` pin chosen
deliberately (a dirty tree stops ./publish.sh).

## Testing

From the repo root:

```sh
swift test --package-path ios/App/FPKit
```

**Inside iCloud Drive** (this repo lives in `~/Documents`), that stops at CodeSign with "resource fork,
Finder information, or similar detritus not allowed". iCloud flags every `*.xctest` folder as a package,
and SwiftPM signs Mac debug test bundles to give them the debugger entitlement. Either keep the build
folder outside iCloud, once per checkout:

```sh
rm -rf ios/App/FPKit/.build
mkdir -p ~/Library/Caches/FPKit/"$(basename "$PWD")"
ln -s ~/Library/Caches/FPKit/"$(basename "$PWD")" ios/App/FPKit/.build
```

or skip that signing step:

```sh
swift test --package-path ios/App/FPKit --disable-get-task-allow-entitlement
```

CI runners are not in iCloud and need neither. If the link's folder is ever deleted, SwiftPM fails with
"couldn't be saved in the folder": run the three lines again.

The iOS build of every target, which compiles FPHost and FPUI (no simulator boots; run it in this folder):

```sh
xcodebuild -scheme FPKit-Package -destination 'generic/platform=iOS Simulator' build
```

Every test target on an iOS simulator (FPCoreTests, FPStoreTests less KillTests, which is macOS only,
FPHostTests: KTUIProxy in a real WKWebView, the crash marker, the policy fetch and its file, StoreAttach's first frame's
room; and FPUITests: the chat's views, renders, composer, photo and press areas on the coach fixtures, the screen bridge,
the tab root and the bridge under it, the shell's markers and switch, and the Coach tab's view, store and renders on the
coachHome fixtures):

```sh
xcodebuild -scheme FPKit-Package -destination 'platform=iOS Simulator,id=<udid>' \
  -parallel-testing-enabled NO test
```

CI (`.github/workflows/ios-build.yml`) runs `swift test` on macOS (job `fpkit-mac`) and both commands above
on the newest iOS runtime's first iPhone (job `fpkit-ios`), beside the app build.

`.build` (SwiftPM's build folder, or the link to it) is ignored by the root `.gitignore`. xcodebuild leaves
an empty `.swiftpm/` folder here, which git does not see.
