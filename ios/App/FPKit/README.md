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
puts back what never reached the page, and keeps the composer across presents and launches; test-native.sh drives it in
the real app, a coach turn included, on a stand-in for the Messages API. The published policy file keeps
`screens.coach` off, so phones online show the web chat until it is turned on.

## Targets

| Target | Builds on | Runs on | Will hold (plan tasks) |
|---|---|---|---|
| FPCore | Foundation only | iOS, macOS | The shell contract and its negotiation, lone-surrogate mending, the coach model and its tokens, blocks, intents, the link state, breakers and crash-marker policy (C4); the policy file's state (S7) |
| FPStore | FPCore, the system SQLite3 | iOS, macOS | KTStore: every `kt_*` value in exact UTF-16, the wire codec, the seven-rule reconcile (observe only in build 60), the journal, snaps and Put back (S2); the shadow facade `Resources/ktstore.js` (S3) |
| FPHost | FPCore, FPStore, WebKit | iOS only | StoreAttach and KTUIProxy (S5), crash markers, the policy fetch (S7), what Settings > About > Storage does and the shell flag (S6) |
| FPUI | FPCore, SwiftUI, WebKit | iOS only | ShellBridge, ScreenHost, PageLink and the slide transition (C5), room themes, fonts and the Coach views (C6, C7) |

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
| `Coach/CoachChatView.swift` | The screen and `CoachHost`: header, the conversation (opens at its end, a short chat hugs the composer, a reply lands at its question, the owner's own Send, Stop, chip or Try again brings the end into view wherever the reader was, a reader at the end stays there when the keys come up), composer (the host's draft when it keeps one, observed by the composer alone; `sendIntent`, the one builder of Send's `coach.send`), toast and confirm |
| `Coach/CoachStore.swift` | The live chat (C7): `CoachStore` and its `CoachComposerDraft`; see [The live chat](#the-live-chat-coachstore) |
| `Coach/CoachHeaderView.swift` | Back or Cancel, the avatar, the status eyebrow, title, WK/DAY and the model switch (spec 114's label and accessible name) |
| `Coach/CoachMessageViews.swift` | The column's parts in the web's order and rhythm: day dividers, seeds, the owner's bubble, replies, notes, Try again / Open Settings, tool pills, PLAN CHANGES, Thinking; what VoiceOver reads for a reply (`ReplySpeech`: one stop, its type first, a table cell by cell, metrics and the takeaway in words) |
| `Coach/CoachBlockViews.swift` | md()'s blocks (paragraphs, lists with sub-items and numbered starts, headings, rules, tables in a horizontal scroller) and the `%%` sections (metric cards, the takeaway, chips), with the web's collapsing margins |
| `Coach/CoachInline.swift` | Runs to text: bold, italic and code to their faces, never a link |
| `Coach/CoachComposer.swift`, `Coach/CoachPhoto.swift` | One field that grows to four whole lines, then scrolls inside them; 44 pt photo button and Send (disabled with nothing to send, Stop while a reply is in flight); PhotosPicker, the photo prepared as spec 20 says (1568 px long edge, JPEG 0.82) |
| `Coach/CoachEmptyState.swift`, `Coach/CoachOverlays.swift`, `Coach/CoachLayout.swift` | The empty chat; forwarded toasts and confirms; the flow and table layouts, `HeightCap` (the composer box: as tall as its draft up to four lines, never taller, where a frame with a max height grows to it), the page's icons, and `PressAreaButton` (a control drawn smaller than 44 pt, pressed as 44: the press shape goes inside the Button's label, never around the finished Button) |

FPUITests (`xcodebuild test` on an iOS simulator) read the coach fixtures from
`Tests/FPCoreTests/Fixtures/coach` in the source tree. `CoachRenderTests` renders every fixture, and
the variants it adds (`draft-4-lines`, `draft-6-lines`: a draft no fixture holds), in both rooms,
with the phone set to light and to dark (the two must be the same pixels: the chat wears its room,
not the phone's setting), on a 390 × 844 pt screen with a phone's safe areas. With
`TEST_RUNNER_FPUI_SHOTS=<dir>` it renders `.large`, `.xLarge` and `.xxLarge` and writes the PNGs there,
each whole conversation too (`TEST_RUNNER_FPUI_ONLY=a,b` limits it to some fixtures); without it,
`.large` only. `Tools/chat-contact/run.sh <simulator UDID> <shots dir> <sheets dir>` adds the web
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
`ShellHostAdapter` in `AppDelegate.swift`, since CapApp-SPM cannot depend on FPKit).

| File | Holds |
|---|---|
| `ShellBridge.swift` | `ShellBridge.shared`: bound to one web view (`install(webView:presenter:pageBuild:)` from `capacitorDidLoad`, which answers the screens the page being served may present, for the flag), with its LinkState (FPCore: the 15 s hello deadline in foreground time, negotiation, the 3-failure breaker), PageLink and ScreenHost. A document-start script posts `fpShell` at every main-frame document: the document before it is gone (its pending intents end unsent or unanswered and are never resent, its open confirm closes as stale; a screen it had up stays up). `hello` negotiates with ScreenGate for the hello's page build and names the screens still up from the document before (`up`, FPCore `HelloReply.takingOver`), which the page takes over; the shell then resyncs them (`shell.covered`, `coach.snapshot`). `bootDone` reaches the store breaker (FPHost `StoreAttach.bootDone`, through `environment`). The policy file's screen switches (FPHost `FPPolicy.changed`, through the App) take a screen down at once (`screens.off` "withdrawn"). Also `ShellWebView`, the app's WKWebView: it counts every time it leaves its window while the app is active (never by design) |
| `PageLink.swift` | Swift to page: `window.FPScreens.call(name, args)` through `callAsyncJavaScript` in the page world, one intent at a time, first in first out, 2 s (5 s for a snapshot); every intent carries its document's boot, and a document that goes takes its intents with it (`documentGone`, never sent again). An error answer a page whose process just died also gives waits 0.8 s to show its document went before it counts |
| `ScreenHost.swift` | Native screens over the page: `.overFullScreen` only (the web view never leaves its window: no `visibilitychange`, no leave and return path), one transition at a time (a dismissal right behind a present not yet started cancels both), the owner's Back and edge pan latched (the page hears `coach.back`; if it stays on the chat the screen goes up again), focus (the page's field blurred through `shell.covered` and editing ended before covering; the descriptor's `hasInitialFocus` is false), VoiceOver (the web view hidden while covered, the screen modal), `overrideUserInterfaceStyle` from the model's `paper` on every hosting controller and the toast window, the crash marker. The toast window (`ShellOverlay`): forwarded toasts 8 px under the chat's header (or the status bar), its strip only as tall as the toast; confirms over everything, the window key while one is open. The chat's `CoachStore` lives here, one per binding (C7): models go to it (`update`), the chat draws on it, its intents and their outcomes go through `Hooks.ask`, a document that goes reaches it (`forgetModels`) |
| `SlideTransition.swift` | `ScreenSlideTransition` (SwiftUI has a `SlideTransition` of its own): the push-like slide in from the trailing edge with the page dimmed under it, out the same way, interactive from the leading edge; a cross-fade with Reduce Motion |
| `ShellProbe.swift` | Debug builds only: the shell scenarios' hands inside the app (`-fpShellProbe <steps>`), for tests/native-shell.sh and tests/tools/native-chat.py (test-native.sh): JavaScript in the page world, intents through the link, the owner's Back and edge pan, taps on the toast window, keys on the native composer, Send, presses on the chat's controls through their own accessibility actions (it turns the simulator's accessibility runtime on for them and back off when done), the conversation scrolled to its top or end, and the web view taken out of its window and back (the fault Settings > About counts) |

**The breaker book and crash markers.** The screens' BreakerBook (the native breaker per screen and page build, and the
screens' crash verdicts) lives in the link, and every change goes through it (`editBook` for the markers found at launch
and the Debug clears); it is written to `Application Support/FPShell/breakers.json` (a copy in UserDefaults under
`fp.shell.breakers`, read only when the file does not) whenever the link says `bookChanged`. The store keeps its own
(`FPStore/breakers.json`). While a screen is up and the app active, `FPShell/presenting.<screen>.marker` holds
`presenting <screen>@<page build> shell <shell build>`; it goes when the screen goes and when the app stops being active
(written again when it comes back with the screen up), so only a death on screen leaves one. The next launch records the
verdict (that screen off for that shell and page build: the flag and every hello leave it out, so the page shows its web
screen; a new page or shell build is clean) and removes the file, so a marker acts once.

**Switches.** The page's own (`FP_NATIVE`, Settings > About's `kt_native_off`), the policy file's `screens.coach`, a
crash verdict, the native breaker (no hello within 15 s of foreground time, or 3 failed intents or undecodable models in
a row). The shell keeps no device switch of its own in build 60.

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
Debug `-fpClearVerdicts` could clear a verdict.

Debug launch arguments (besides FPHost's): `-fpSmoke` (after each hello a ping through the real link, logged as
`fp: ping ok v1`, subsystem `app.kt.trainer`), `-fpShellProbe <steps file>` with `-fpShellProbeLog <name>`; FPHost's
`-fpIgnoreMarker`, `-fpClearVerdicts` and `-fpClearBreaker` act on the screens' records too (the tools end the app with
`simctl terminate`, which can land with the chat up and leave a marker).

Tests: `PageLinkTests` (a real WKWebView and a stand-in `FPScreens`: order, one at a time, the answers as the breaker
counts them, timeouts, a late answer dropped, nothing sent unlinked, a document that goes, a new document, an outcome
that asks again), `ScreenHostTests` (over a stand-in page in a window, with a stand-in for UIKit's presentation, which
never finishes in a test host without a window scene: `.overFullScreen`, the queue, the latch, the marker and the app's
activity, the confirm, the toast strip; the edge pan and the toast window need a window scene and are skipped without
one) and `ShellBridgeTests` (markers to verdicts once, hello and `up`, the resync, the policy's off, another web view's
message refused). In the real app, `tests/native-shell.sh`.

### tests/native-shell.sh

The screen bridge in the real app on the real page, on the first paired iPhone + Watch of a runtime (iOS 26.x by default;
`--os 27`), scenario by scenario through `ShellProbe` and `tests/tools/native-shell.py`: `smoke` (`-fpSmoke` logs
`fp: ping ok v1`; v1 negotiated with the coach), `chat` (the chat presented `.overFullScreen` on the page's model, a
message sent and answered, the model switch, a forwarded confirm and an Undo toast round-tripping, Back, no
`visibilitychange`, Heavyweight light and Lime dark), `focus` (a tap into the page and a focused field low enough that
WebKit scrolls to it, then present and dismiss by the page, by Back and by the edge pan: no keyboard comes back and the
document is not scrolled; an edge pan let go early leaves the chat up; the simulator's software keyboard is turned on for
the scenario, since it counts a hardware keyboard as attached), `wckill` (WebContent killed with the chat up and a send in
flight: the new document takes the chat over, the shell resyncs on its boot, nothing is resent, the words go back in the
composer, the open confirm closes as stale), `marker` (a planted crash marker brings back the web chat, once; Settings >
About keeps the row and says why, its sheet lists the counters, and the owner's "Try the native chat again" brings the
native chat back at the next launch), `policy` (`screens.coach` "off" takes the chat down at once, and About says so),
`breaker` (three timeouts turn it off for the page build; About says it is paused; Try again brings it back) and
`counters` (the web view taken out of its window with the chat up: the leave-window and hidden-page counts go up, and
About's sheet lists them). Shots in `screenshots/out/native-shell/`.

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
  not give is not asked for again, and the chat says Photo).
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
text size; the phone's settings put back) and `restore` (only the values that changed put back, the page reloaded, the
chat, programme, weights, key and room compared). Every launch takes `-fpIgnoreMarker`. Shots in
`screenshots/out/native/` (`coach-chat-*`, `keys-*`, `live-*`).

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
| `StoreAttach.swift` | `StoreAttach.shared`: `install(webView:pageFolder:)` (from `capacitorDidLoad`) puts KTUIProxy in front of Capacitor's UI delegate and checks it is the delegate; only then does it add the facade's two document-start scripts (the flag, then `ktstore.js`, main frame only) and the async `ktStore` handler. At each document start (the facade's `hello`) the gate decides first: Storage's Native copy switch (`fp.store.off`), the policy file's `store.facade`, a store crash verdict for this (shell build, page build) pair, a launch after a document that never finished booting (`StoreGate`); off means hello is answered off without touching the store. Otherwise the store breaker is armed and the store answers; `bootDone` disarms it. The breaker and the crash verdicts are one record, `FPStore/breakers.json`, written atomically at every change before the page goes on (a copy in UserDefaults is read only when the file does not: UserDefaults reaches its disk later, through cfprefsd, and an app killed and installed again soon after came back to an older record there). Bound to the web view by weak reference: a newer web view takes over and the older one is detached (`sceneConnected`, `sceneDisconnected`). A checkpoint and the day's snapshot when the app goes to the background. `status()` is what Storage shows. |
| `KTUIProxy.swift` | The UI delegate proxy: forwards alert, confirm, prompt and createWebViewWith (and, through `responds(to:)`/`forwardingTarget(for:)`, every other method) to Capacitor's handler, so Capacitor's own synchronous prompts (the CapacitorHttp check) still work; answers a `\u0001KT1 ` prompt only from the main frame of a `capacitor://` page, and never forwards one (Capacitor would show it as an alert) |
| `StoreMarker.swift` | The store's crash marker, `FPStore/store.marker`: a state byte set around every store operation with `pwrite` on a descriptor kept open, so a process that dies inside one leaves it set; the next launch turns the facade off for that pair (and leaves the store closed) until a new shell or page build, or the owner clears it |
| `PolicyFetch.swift` | `FPPolicy.shared`: `policy.json` from GitHub Pages (beside build.txt) at launch and on foreground, at most every 15 minutes, the last good copy kept in UserDefaults; posts `FPPolicy.changed` (native screens follow at once; the store reads `effective` at each document start) |
| `StoreProbe.swift` | Debug builds only: the scenario runner's hands inside the app (`-fpProbe <steps>`), for tests/native-store.sh |
| `StoreTestQuit.swift` | Storage's "Test: quit after next save" (TestFlight and Debug builds): the arm (a write or remove of one of the keys the page names, within ten minutes) and the record kept beside the store across the quit (`FPStore/testquit.json`), which the next launch's first document start completes with what it found (in step, or the keys WebKit lost that the store kept) |
| `ShellFlagScript.swift` | `window.__FP_SHELL` for this binary (FPCore `ShellFlag`): `screens` as FPUI's ShellBridge works them out from ScreenGate when the web view is set up (the page never reads it; each hello's answer is what counts) and, in a Debug build, `dev` from the test tools' `-devNav <route>`, `-devTheme <room>` and `-fpApiBase <origin>` (the coach's stand-in API) |

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
the compiled defaults are in force for the launch, so the tools test the app as built.

**A background launch can boot the page.** A watch message or a Health delivery can launch the phone app with no
one looking. The hub answers the watch from its cache either way, and the web view may never load; but UIKit can
also connect the scene in the background, and then the page boots and says hello (seen on the iOS 26.5 simulator
after a watch wake with the app killed: the store attached, in step, the breaker disarmed at bootDone, the marker
idle). Both cases happen. The device checklist should cover a watch wake and a Health delivery with the app killed,
then Storage for breaker trips and crash markers. (CLAUDE.md's "no scene, so the plugin and the web view never load"
needs the same correction at the merge.)

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

`App.xcodeproj` references this folder as a local package (an `XCLocalSwiftPackageReference` beside
CapApp-SPM's), and the App target depends on FPCore, FPStore, FPHost and FPUI, linked statically into the
app like CapApp-SPM. Only the App target's two configurations moved to iOS 17.0. The project level stays at
15.0 because `cap sync` writes CapApp-SPM's `.iOS(.v15)` from the first `IPHONEOS_DEPLOYMENT_TARGET` in
`project.pbxproj`; the widget (16.2), the share extension (15.0) and the watch targets keep theirs.
`AppDelegate.swift` imports FPHost and FPUI (objectVersion 60 means no new App-target files):
`instanceDescriptor()` sets `hasInitialFocus = false` (the shell owns focus), `webView(with:configuration:)` returns
`ShellWebView`, and `capacitorDidLoad` binds `ShellBridge` (the flag's `screens` from it), installs StoreAttach,
registers TrovoShell and TrovoStore through their host adapters and forwards `FPPolicy.changed` to the native
screens; the SceneDelegate starts the policy fetch and lets the store and the screens go when a scene disconnects.

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
FPHostTests: KTUIProxy in a real WKWebView, the crash marker, the policy fetch; and FPUITests: the chat's views,
renders, composer, photo and press areas on the coach fixtures):

```sh
xcodebuild -scheme FPKit-Package -destination 'platform=iOS Simulator,id=<udid>' \
  -parallel-testing-enabled NO test
```

CI (`.github/workflows/ios-build.yml`) runs `swift test` on macOS (job `fpkit-mac`) and both commands above
on the newest iOS runtime's first iPhone (job `fpkit-ios`), beside the app build.

`.build` (SwiftPM's build folder, or the link to it) is ignored by the root `.gitignore`. xcodebuild leaves
an empty `.swiftpm/` folder here, which git does not see.
