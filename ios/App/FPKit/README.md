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
`window.__FP_SHELL`. FPUI holds the SwiftUI Coach chat, drawn from fixtures so far (C6, see
[FPUI](#fpui-the-native-coach-chat) below); the page side of the bridge it will be driven by is in
`index.html` (C1-C3: `coachSend`, message ids and block models, `FPScreens` and the coach model, inert
without the flag and a TrovoShell plugin). Not built yet: the TrovoShell plugin, ScreenHost and PageLink
(C5) and the live wiring (C7), so the app still shows the web chat and the flag's `screens` stays empty.

## Targets

| Target | Builds on | Runs on | Will hold (plan tasks) |
|---|---|---|---|
| FPCore | Foundation only | iOS, macOS | The shell contract and its negotiation, lone-surrogate mending, the coach model and its tokens, blocks, intents, the link state, breakers and crash-marker policy (C4); the policy file's state (S7) |
| FPStore | FPCore, the system SQLite3 | iOS, macOS | KTStore: every `kt_*` value in exact UTF-16, the wire codec, the seven-rule reconcile (observe only in build 60), the journal, snaps and Put back (S2); the shadow facade `Resources/ktstore.js` (S3) |
| FPHost | FPCore, FPStore, WebKit | iOS only | StoreAttach and KTUIProxy (S5), crash markers, the policy fetch (S7), what Settings > About > Storage does and the shell flag (S6) |
| FPUI | FPCore, SwiftUI | iOS only | ScreenHost, PageLink and the slide transition (C5), room themes, fonts and the Coach views (C6, C7) |

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
through a `CoachHost` (C7's CoachStore fills it from the page link; tests and previews from fixtures).
The page keeps every rule: it parses markdown and `%%` markers, builds every label, pill, chip and
PLAN CHANGES row, and decides what a message says; the views only draw the model. Nothing ever makes a
link from model text: runs go in verbatim with explicit faces, never through
`AttributedString(markdown:)`.

| File | Holds |
|---|---|
| `Theme/RoomTheme.swift` | The room a view draws in: the model's tokens as colours and faces, the room's flavour (paper or studio) for the few shapes the rooms draw differently, the text size and its factor |
| `Theme/Fonts.swift` | The faces in `Resources/Fonts` (made by `screenshots/live-activity/mkfonts.py`, set "chat"), registered at runtime; family + weight to a face, the system face for glyphs a face lacks (as the web's font stacks), WebKit's 14° synthetic italic, tabular figures |
| `Theme/Type.swift` | The text size: the system size clamped `.large...xxLarge` with the app's toggle on, `.large` off, and the web zoom's factor (1, 1.12, 1.24) every size scales by; CSS line boxes |
| `Coach/CoachChatView.swift` | The screen and `CoachHost`: header, the conversation (opens at its end, a short chat hugs the composer, a reply lands at its question), composer, toast and confirm |
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
| `ShellFlagScript.swift` | `window.__FP_SHELL` for this binary (FPCore `ShellFlag`): no native screen in the store half (`screens` stays empty until the native chat's ScreenGate fills it, task C5) and, in a Debug build, `dev` from the test tools' `-devNav <route>` and `-devTheme <room>` |

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
render was the coach route) reaches StoreAttach through the TrovoShell plugin once a shell carries it (plan task
C5). Until then the OTA confirm every page sends stands in for it: `TrovoOtaPlugin.confirm` posts
`.trovoOtaConfirmed` with its web view, and `AppDelegate.swift` hands it to `StoreAttach.bootDone`.

A new store gets `minReader` 60, so a build numbered below 60 refuses its own store from its second launch
(attach nothing, "minReader"). Release builds get 60 from release-ios.sh; tests/native-store.sh builds with
`CURRENT_PROJECT_VERSION=60` while the project still says 59.

Debug launch arguments (never read by a Release build): `-fpStoreSwitch on|off`, `-fpClearVerdicts`,
`-fpClearBreaker`, `-fpBreakProxy`, `-fpIgnoreBootDone`, `-fpIgnoreMarker`, `-fpNoWebKit`, `-fpOffline`,
`-fpProbe <steps file>` with `-fpProbeLog <name>`, `-fpPolicyFile <path>`, `-fpPolicyEvery <seconds>`, and the
tools' `-devNav <route>` / `-devTheme <room>` (into `window.__FP_SHELL.dev`: test-native.sh and
screenshots/shoot.py drive the page's dev-nav hook with them instead of writing `kt_dev_nav` into WebKit's file).
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
`AppDelegate.swift` imports FPHost (objectVersion 60 means no new App-target files): `capacitorDidLoad`
installs StoreAttach and forwards the OTA confirm as bootDone, and the SceneDelegate starts the policy fetch and
rebinds the store when a scene connects or disconnects.

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
