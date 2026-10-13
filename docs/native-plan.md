# Decision: going native (judge's ruling, revised after two critiques)

Repo read at `next` 09773f6 (web 20261010-1, index.html 24,066 lines), read-only. `chatui/ui` is now 32
commits ahead of `next` (head 29960af, index.html 24,584 lines) and still moving; its line numbers below are
cited as `chatui@29960af:<line>`. Draft: `native-inputs/decision-draft.md`. Critiques: data safety and
platform/delivery (probes in `scratchpad/native/critic-datasafety/` and `scratchpad/native/critic-platform/`).
I re-ran the data-safety store probe and checked every cited line against the code (section 3).

## 1. Ruling

**The backbone stands: the strangler, with store-first's native store grafted onto its front, and
store-first's early flip rejected. The critiques changed how the store behaves in build 60, how and when
Swift may write, and how build 61 moves the web view. They did not change the order.**

- **Screens** go native one per TestFlight build: SwiftUI views of JSON models the page builds, sending
  named intents addressed by id back to the page, over one SuperoViewController per scene whose web view
  never leaves the window.
- **Build 60** puts the owner's data in a native SQLite store in shadow and ships the native Coach chat.
  **Changed:** in build 60 the store never writes WebKit on its own. It follows WebKit, records what it
  would have repaired, keeps every value it gave up, and offers **Put back** in Settings > About > Storage.
  Automatic repair stays off unless device evidence argues for it; the flip makes it moot.
- **The reconcile decides from the `kt_last_open` witness**, not from "a core key is missing". A witness the
  store has never seen means an older or facade-less build ran, so every difference is adopted, deletions
  included. The draft's "WebKit copy gone" heuristic would have refilled what build 59 deleted.
- **No native mode ships before the flip.** The flip build F (milestone 11) brings its own facade, sets
  `meta.minReader = F` so builds 60..F-1 behave exactly like store-less builds, and merges the five log keys
  three ways.
- **Swift never writes a key while any page writer of it remains.** Until then Swift computes and the page
  commits. The logging port therefore writes nothing and moves before the flip (milestone 10); the flip
  (11) comes right before the first Swift-owned key (12); the page-free watch drain moves to milestone 14.
- **Build 61** (the root change, alone) routes every tab selection through one funnel, lays the web view
  full-bleed under the floating bar, and has the page announce sheets and the runner itself.
- **Every native piece** gets crash markers, a device switch, a page constant and a policy file the shell
  fetches at launch and on foreground.
- **Valve kept:** the store half can ship alone as 60 if the chat slips.

## 2. Scores

Weights: data safety incl. downgrade 25, watch/widget/Live Activity/OTA risk 15, time to a native screen 15,
effort 10, testability 15, clean path to retiring the page 20.

| Criterion | Strangler | Store-first | Draft ruling (as claimed) | Revised ruling |
|---|---|---|---|---|
| Data safety | 9: moves nothing until m9; WebKit's lost-write window is real but measured under ~75 ms after a burst on iOS | 6.5: flip at 61 with no Swift writer; its "WebKit copy lost" rule refills an older build's deletions and flips to native; its journal rule cannot tell a missed mirror from lag | 9.5 (overstated: the critics found two high-severity flaws in its reconcile) | 9.5 |
| Satellites / OTA | 9 | 7.5 | 8.5 | 8.5: shell-owned facade under every write, but it cannot fail a write and 60 never writes WebKit; crash markers, policy file |
| Time to a native screen | 9 | 8 | 8.5 | 8: M1 grows by about a week |
| Effort | 6 | 7 | 6.5 | 6 |
| Testability | 9 | 9 | 9.5 | 9.5: automated downgrade and kill drills |
| Clean path to fully native | 7 | 8.5 | 8.5 | 8.5 |
| **Weighted** | **8.3** | **7.7** | 8.7 | **8.6** |

Why it still beats the strangler: it follows the owner's order (store first), starts months of device
evidence before the flip, keeps a crash-consistent native copy with Put back from day one, and gives native
screens first-frame data, at a store risk that is now bounded.

## 3. Claims checked against the code (file:line)

New in this revision (critique claims, verified):
- **Older builds really delete.** `resetCustomRoutine` -> `clearCustomRoutine` -> `lsDel('kt_routine')`
  (index.html:19900-19908, 3496) and `clearCoachHistory` -> `lsDel('kt_coach_msgs')` (17868);
  `startNewProgramme` also deletes `kt_routine_next` and `kt_round_intro` (3640-3650); a restore deletes every
  BACKUP key the file lacks (4776-4778) and drops `kt_hk_imported`/`kt_hk_last_sync` when the file has none
  (4803-4808), which is always so for the iCloud copy (`_sanitizeForICloud` deletes it, 23712). A round that
  starts and a cancel delete `kt_routine_next` too (12652, 12708), so a "zombie" copy would restart a round.
- **The prototype refills them.** KTStoreCore.swift: "an older build never deletes them" (194-195); the
  wkLost test runs before any per-key rule (200-213) and flips shadow to native (207). I ran the critic's
  probe on that code: Reset + Clear chat on 59 -> `rewrite [kt_coach_msgs, kt_routine]`, mode native; a
  REPLACE restore deleting 5 keys -> all 5 refilled.
- **Exact repeats are routine:** delete -> Undo -> delete writes identical `kt_sessions` (14086-14102 plus the
  sort at 3431-3438); kg -> lb -> kg restores exact loads by design (10638-10648). The prototype answers 'full'
  to any SQLite failure (KTStoreCore.swift:288-290), opens without busy_timeout (88-90), and its row loops
  stop at the first non-ROW result (123-137), so SQLITE_CORRUPT reads as "end of table". The probe shows a
  per-key journal rule classifies a missed mirror and true lag the same way.
- **Shadow cannot fail a page write**: WebKit first, then the mirror, then an async post on any non-ok
  (ktstore.js:99-105). So the drain clears the wrist queue whenever WebKit took the save (23583, 23606,
  23624-23631). **A kept queue entry brings back a session the owner deleted** (23562-23564), so "keep the
  queue" is not a safe fix.
- `lsGet` caches forever and callers mutate the cached array (3394-3408); `coachMessages` is parsed once at
  script-parse time (2094) and saved whole (19944-19988); `kt_sessions` has 11 page writers (keymap.txt:72).
- `saveCoachHistory` and `lsDel` swallow storage errors (19944-19988, 3409): a fail-closed native mode loses
  those writes silently.
- `kt_measurements` entries carry no id (`saveMeasurement` builds `{date}` plus fields, 15179-15190); `_uniqueLogIds` covers sessions, runs, sports and bw
  only, once per device (22544-22548).
- `kt_last_open` is stamped at boot (22356-22359) and on every return and departure (22619-22635) by every
  installable page, and is in neither `BACKUP_KEYS` nor `RAW_STRING_KEYS` (4458-4460). There is no erase-all
  function in the page (grep), so "WebKit has no `kt_last_open`" means a wiped or fresh WebKit.
- **render() returns from the coach branch before the OTA confirm** (6002 vs 6017), still so on
  chatui@29960af (6161 vs 6177). Harmless today because the first render is Log (`currentTab='log'`, 2076);
  not harmless once native screens paint first.
- **Capacitor 8.3.1 grabs first responder** in `viewDidAppear` unless `hasInitialFocus` is false
  (CAPBridgeViewController.swift:65-71; settable on the descriptor, CAPInstanceDescriptor.h:110, default YES
  at CAPInstanceDescriptor.m:44) and lets programmatic focus raise the keyboard (316). render() refocuses the
  remembered field when the route has not changed (6008-6011). The critic's screenshot shows a hidden web
  view keeping the keyboard over a blank screen.
- `webView(with:configuration:)` is `open` (CAPBridgeViewController.swift:154), so the shell can supply a
  WKWebView subclass that reports leaving the window.
- **Programmatic `selectedIndex` does not call `shouldSelect`** (UIKit's documented behaviour; critic probe);
  shell probe B already funnels selection through one `select(tab)` (probeB/src/main.swift:143-149).
- The sheet observer watches only body childList (20825-20844); `#runner-root` is a persistent node toggled
  with `display` (1970), so the observer never sees the runner. The page avoids `env(safe-area-inset-bottom)`
  on purpose and uses constants (146-157).
- Main.storyboard instantiates SuperoViewController per scene connection (Main.storyboard:14, Info.plist:79-80).
- The rooms are fixed (22299-22303) and the page declares no `color-scheme`; `_watchThemeTokens` already
  carries `paper` (23143-23148). Dynamic Type is clamped 1.0-1.25 and re-read only on `visibilitychange`
  (22311-22331).
- The OTA check runs only at boot (22611); a staged page is served only at the next launch
  (TrovoOtaPlugin.swift:56-73). An OTA-delivered switch therefore takes two or three cold launches.
- datalayer probe8 ran on macOS (probe8/main.swift:6, `import AppKit`) and killed the moment the burst ended
  (41). The platform critic's iOS 27 simulator sweep lost writes only when the kill came within ~50 ms of a
  100-key burst (3 of 21 trials), never at 75 ms or later, never for a trickle: a human force-quit cannot land
  in that window.
- CI: ios-build.yml runs only on pushes to main and on PRs (3-17); tests.yml times out at 15 minutes (21);
  publish.sh gates on the classic suite only (29-32); the suite took 218 s locally (critic suite-timing.txt).
- `/tmp/supero-build/Build/Products/Debug-iphonesimulator/App.app` is CFBundleVersion 59 with
  `UISceneDelegateClassName` (plutil), usable for a downgrade drill; /tmp is purged, so the drill rebuilds
  build 59's simulator app from its commit.

Kept from the draft (still true): `lsSet` caches, retries after evicting the OTA cache, rolls back to what
is on disk and returns false (3431-3471); the page touches localStorage only through getItem, setItem,
removeItem, key and length, and its two prefix sweeps (3954, 6776) and storage meter (4505) enumerate with
key()/length; no alert/confirm/prompt in the page (9265); `RAW_STRING_KEYS` 4458, `BACKUP_KEYS` 4460;
privacy copy 24039 ("uninstalling the app deletes everything"); dev-nav hook 23780-23795; AppDelegate.swift:
`WatchSessionHub.shared.start()` (34), SuperoViewController (134), OTA `instanceDescriptor` (138-144),
`capacitorDidLoad` registrations (146-158), SceneDelegate (197-221); Info.plist scene manifest (66-84);
project.pbxproj objectVersion 60 (6), deployment targets 637/688 (project), 708/733 (App), 808/831 (widget),
887/911 (share); Capacitor sets the delegation handler as uiDelegate (CAPBridgeViewController.swift:320)
before `capacitorDidLoad`, and the handler implements alert, confirm, prompt and createWebViewWith
(WebViewDelegationHandler.swift:228-328); `getPendingShare` deletes what it returns
(TrovoSharePlugin.swift:24-38); the hub removes only drained entries (WatchSessionHub.swift:86-102).

## 4. Architecture

**Four roles.**
1. **Engine: the page.** index.html keeps every rule and every write until each is ported: `_commitRoutine`
   (11877) and the programme engine; logging, records, streak and rounds; `runCoachTurn` (19286) and the 17
   tools (`COACH_TOOLS` 18253); the satellite pushes (`_runNativeSync` 23642, `_pushWatchPlan` 23216); backups
   (`buildBackupJSON` 4461, `_autoBackupIfDue` 23673).
2. **Store: FPStore, from build 60.** A native SQLite copy of every kt_* value in exact UTF-16 bytes, kept in
   step by a facade the shell owns. Shadow (WebKit in charge, the store follows and never writes WebKit by
   itself) until the flip (milestone 11); then in charge, with WebKit dual-written for older builds.
3. **Glass: Swift.** SwiftUI screens drawn from page-built JSON models, sending named intents addressed by id.
   From milestone 9, Swift computes read models from FPStore and checks them against the page's.
4. **Bridge.** Page to Swift: the TrovoShell plugin. Swift to page: `window.FPScreens.call` via
   `callAsyncJavaScript` in the page world. Storage: the facade's synchronous prompt channel answered by a
   proxy uiDelegate. A policy file the shell fetches. Each channel is versioned.

**One web view per scene, never out of the window.**
- One SuperoViewController per scene connection (Main.storyboard:14 makes one per connection; UIKit may
  disconnect a background scene and connect a new one in the same process). StoreAttach, KTUIProxy,
  PageLink and ScreenHost bind to the web view instance by weak reference and rebind in
  `scene(_:willConnectTo:)` (AppDelegate.swift:200-203); nothing retains an old web view, so two pages never
  run at once (a second live page overwrites data through `_lsCache`, shell probe C). The store breaker is
  armed per document start.
- States: **front** (a web screen shows), **kept** (in the window behind a native screen, hidden or covered,
  so the page stays visible to itself and alive), **sheet-host** (non-opaque over a native screen, for flows
  not yet native).
- Forbidden, because they make the page hidden and run its leave/return path (22619-22635), which moves
  `_wristLive`'s window (23460) and re-runs drains: a `.fullScreen` presentation, pushing the bridge
  controller, a full-screen camera, a second bridge, and (from 61) any tab change that does not go through
  the select funnel. A WKWebView subclass (via the `open` factory, CAPBridgeViewController.swift:154) counts
  every time the web view leaves its window while the scene is foreground-active; Settings > About shows it.
- **The shell owns focus.** Before covering, hiding or re-homing the web view, ScreenHost blurs the page's
  active element through the bridge and calls `endEditing(true)`; the descriptor sets
  `hasInitialFocus = false`; the page skips programmatic focus while the shell says it is covered.

**Where the code lives.**
- `ios/App/FPKit`, a local Swift package (swift-tools 5.9, iOS 17 + macOS 14), wired like CapApp-SPM
  (project.pbxproj:1017-1030):
  - FPCore (Foundation only): contract, coach model, surrogate mend, intents, link, breaker and policy state.
  - FPStore (Foundation + SQLite3): KTStore, wire codec, reconcile, journal, snaps, `Resources/ktstore.js`.
  - FPHost (`#if os(iOS)`, WebKit): StoreAttach, KTUIProxy, crash markers, policy fetch.
  - FPUI (`#if os(iOS)`): ScreenHost, PageLink, theme tokens, fonts, the Coach views.
  - `swift test` on the Mac covers FPCore and FPStore; FPHost and FPUI are tested with `xcodebuild test`
    on an iOS simulator destination (the judge's package probe already guards FPHost with `#if os(iOS)`).
- Thin plugin classes (TrovoShellPlugin, TrovoStorePlugin) live in `ios/App/CapApp-SPM/Sources/CapApp-SPM/`
  beside the 7 Trovo plugins, each behind a host protocol the App target sets (CapApp-SPM's Package.swift is
  CLI-managed, so it cannot depend on FPKit).
- The App target keeps only SuperoViewController glue and host adapters in AppDelegate.swift (objectVersion
  60 means hand-edited file references, so no new App-target source files).

**Invariants.**
1. One page instance per scene, never out of the window; leaving it while active is a counted fault.
2. Nothing writes WebKit's file behind the facade: test tools use launch arguments, and shoot.py deletes the
   store whenever it seeds WebKit directly.
3. Native behaviour only from injected flags plus `_plug()` (22722), never from build stamps: older binaries
   serve newer staged pages (TrovoOtaPlugin.swift:56-73).
4. Every native piece can be switched off without a binary: page constant, device switch, policy file,
   crash markers (automatic), native breaker (automatic). The store has its own device switch and breaker.
5. One risky mechanism per build; when two ship together (build 60), each has its own switches and either can
   ship alone.
6. **One writer per key.** Swift writes a key only when every page writer of it is ported (keymap.txt);
   until then Swift computes and the page commits through a page operation.
7. **WebKit stays complete while any store-less build is installable.** Until the flip the store never
   writes WebKit on its own; after it the dual write keeps WebKit complete except the declared `wkExcluded`
   keys.
8. The shell owns focus (above).

**End state.** SwiftUI under the UIKit scene lifecycle (the scene delegate stays because of the iOS 27 rule);
FPEngine and FPStore with the same keys and JSON shapes; watch plan, widget summary, reminders, Live Activity
and backups computed natively; no WKWebView, Capacitor or OTA. GitHub Pages keeps a frozen final page (the
last page that speaks every installable shell's contract) for older shells and the PWA.

## 5. Data layer

**FPStore (build 60).**
- `Application Support/FPStore/store.sqlite` (+ -wal, -shm). Private container, never the App Group (a lock
  held there while suspended gets the app killed, 0xdead10cc). Included in device backups, unlike the OTA live
  folder (TrovoOtaPlugin.swift:108). File protection `completeUntilFirstUserAuthentication`.
- **Open:** `PRAGMA quick_check`; any step result other than ROW or DONE means "unreadable" (never "empty");
  an unreadable or not-yet-unlocked file is never recreated. Unreadable = the store is off for this launch
  and Storage says so; the page runs on WebKit as today.
- **Concurrency:** one connection on one serial queue, `busy_timeout` 2 s. Prompt answers, async posts,
  checkpoints, snaps, plugin reads and exportCopy all run on it.
- **Durability:** WAL, `synchronous=NORMAL` (survives an app kill); transactions that write one of the five
  log keys commit with `synchronous=FULL` (they precede destructive native operations such as the wrist-queue
  clear). Checkpoint when the app goes to the background.
- **Schema v1** (additive forever; every build from 60 must open any later store):
  - `kv(k, v BLOB exact UTF-16 or NULL tombstone, enc 'u16', h 'len:fnv1a32:djb2', seq, at, src)`. A row
    whose `enc` this build does not know is unreadable: never repaired, never deleted.
  - `journal(seq, k, h, hprev, at, src, boot)`: per key its last 32 writes, plus everything from the last 10
    minutes (a busy diagnostic key can no longer push a rarely edited programme out of history); `hprev`
    makes the lag test one backward walk.
  - `meta`: schema, `minReader` (a build below it attaches nothing), `wkExcluded` (keys deliberately absent
    from WebKit: never adopted, repaired or counted), policy, first/last shell, breaker, diagnostics.
  - `conflicts(at, k, value, why)`: every value the store gave up or a put-back replaced, kept 30 days.
- **Snaps** are separate atomic files, `FPStore/snaps/<date>.json`, 7 kept: a corrupt store.sqlite does not
  take them with it.
- **BLOB, never TEXT** (SQLite text16 corrupts half an emoji, datalayer probe6). Values exactly as the page
  stores them.
- **`kt_apikey`** never enters kv, the journal, snaps or exports; it stays in WebKit (a Keychain copy arrives
  in milestone 13).

**The facade in build 60 (`ktstore.js`, an FPKit resource, injected at document start after Capacitor's
script, shadow only).**
- Writes WebKit first, so `lsSet`'s false/rollback contract (3431-3471) is untouched; then mirrors
  synchronously, `prompt('\u0001KT1 w <boot>:<seq>', payload)` (about 0.1-0.5 ms on the simulator).
- On any answer other than `ok` (or none): writes a **gap note** into WebKit (`kt__store_gap`: keys and time)
  and posts the op asynchronously with its persistent (boot id, seq); the store applies a post only if it is
  newer than the key's last write. A native problem never fails or delays a page write beyond the prompt.
- `__ktStoreState` exposes counters, `acked(key)` (the key's last write was answered `ok`) and
  `remirror(key)` (send WebKit's current value again, synchronously).
- **No native mode.** It ships with the flip build's facade, not before.
- The flag is injected only after KTUIProxy is verified as the web view's uiDelegate; the facade never prompts
  without it (an old Capacitor shows unknown prompts as alerts, WebViewDelegationHandler.swift:307).
- verify.sh checks that index.html touches localStorage only through getItem, setItem, removeItem, key and
  length (the facade's premise).

**Reconcile at every document start** (hello carries WebKit's manifest of key hashes and the gap note). In
build 60 every outcome leaves kv equal to WebKit; what differs is what gets recorded. First rule that
applies wins:

| # | Situation | Build 60 does |
|---|---|---|
| 1 | Store unreadable, or `meta.minReader` above this build | Attach nothing. The page runs on WebKit as today. |
| 2 | WebKit unreadable (`hello nowk`) | Facade off for this launch; reconcile nothing; never read it as empty. |
| 3 | WebKit wiped: no `kt_last_open` and WebKit near-empty while the store holds a full set | Write a snap of the store first; adopt nothing; Storage offers Put back of the whole snap. |
| 4 | Witness unknown: WebKit's `kt_last_open` hash is neither in the store's history of that key nor named in the gap note | An older build or a facade-less launch wrote WebKit. Adopt every difference, deletions included (tombstones); each replaced store value goes to conflicts ("older build"). Nothing is refilled. |
| 5 | Witness known; key named in the gap note | The store missed that write: adopt WebKit's value. |
| 6 | Witness known; WebKit's whole manifest (less gap keys and `wkExcluded`) equals the store's state at one journal seq j | WebKit lost the suffix after j ("lag"). Record "would repair N keys" with names; keep the store's newer values in conflicts ("lag") for Put back; adopt WebKit. |
| 7 | Witness known; anything else | Adopt WebKit; replaced values to conflicts ("unexplained"); counted. |

- Keys present only in the store follow the same rules (absence is a value); they are never refilled in 60.
- Checked on a throwaway model of rules 3-7 (`scratchpad/native/judge/model/reconcile-model.js`): true lag ->
  rule 6; 59's Reset + Clear chat -> rule 4; a missed mirror of a repeated value with its gap note -> adopted,
  in step; WebKit wiped -> rule 3; a programme edit lost behind 5,000 diagnostic writes -> rule 6 (the per-key
  journal keeps its history). One residual: a missed mirror whose gap note is lost in the same kill still
  reads as lag. In 60 that only miscounts, and Put back names exactly what it would bring back.
- **Put back** (Storage) stages chosen conflict values (or the rule-3 snap); the shell reloads the page and
  the facade writes them into WebKit and the store at document start, before the page's first script,
  journaled as `putback`, the replaced values kept in conflicts so a put-back can itself be put back. Log keys
  are put back as a record merge by id (never dropping a record); other keys only while unchanged since.
- **Automatic repair** (rule 6 writing WebKit) stays off in build 60. The policy file can turn it on only if
  the owner's Storage row shows real lag events and zero unexplained mismatches over weeks; the flip makes it
  moot.

**Migration (first launch of 60).** The store is empty, so hello answers "need every key"; one put sends
everything in one transaction; a snap is written; the page boots on WebKit as today. Nothing is ever deleted
from WebKit. Measured: 24 keys / 267 KB in a 9.2 ms put, facade boot 17 ms (store-first probeS, iOS 27
simulator); the owner's data is about 176 KB.

**Downgrades.**
- 60+ to 59 or 48: WebKit is complete and in charge; the newest staged page runs classic (no flag). Back on
  60+, rule 4 adopts everything 59 did, deletions included. The automated drill covers Reset programme, Start
  new programme, Clear chat, a sparse REPLACE restore and a restore of the iCloud copy on 59.
- After the flip at build F: F sets `meta.minReader = F` at promotion, so builds 60..F-1 attach nothing and
  behave as store-less builds on the dual-written WebKit. Back on F: witness adopt with the three-way log merge.

**Backups.** The page's writers stay unchanged through milestone 13 (`buildBackupJSON` 4461, `exportData`
4519, `_autoBackupIfDue` 23673, the iCloud copy via `_sanitizeForICloud` 23708). A native writer arrives in
milestone 14, byte-compared with the page's and restoring to the same end state as `_applyImportedData`
(4724-4842) for every manifest era. `Supero/` and `supero-backup-*` keep their names.

**The flip (milestone 11).**
- **Trigger:** the first Swift-owned key (milestone 12, the programme engine) is ready. The logging port
  (milestone 10) computes in Swift but writes nothing, so it comes before the flip.
- **Preconditions:** at least 4 weeks "in step" with zero unexplained mismatches; pre-60 TestFlight builds
  expired or lapsed; the OTA banner live two weeks earlier; ids for `kt_measurements` shipped by OTA (a page
  migration, `_uniqueLogIds` extended to it).
- **F's facade, native mode:** reads from a Map seeded from the store at every document start; writes go to
  the store first. QuotaExceededError only for a definitive `full` (disk); one retry on busy; any other
  failure falls back, for that write, to WebKit-first plus a gap note, so no native failure is left to
  `lsDel`'s or `saveCoachHistory`'s swallowing catch (3409, 19944-19988). An `unloading` latch set at pagehide
  sends every later write of that document asynchronously (prompt answers null in pagehide and in the
  `visibilitychange` after it).
- **Reconcile in native mode:** repair on (the store is in charge, so WebKit's lag is rewritten from it);
  witness unknown -> a **three-way merge** of the five log keys (3424) against the base the store keeps for
  each (the value both copies last agreed on): records matched by id, colliding ids keep both, a record
  deleted on one side and unchanged on the other is deleted, `_uniqueLogIds(true)` after; never drops a
  record. Other keys: the older build's change wins, the store's value to conflicts. `wkExcluded` keys
  (`kt_pre_restore`, coach cards, logs) are never adopted, repaired or counted.
- **A breaker trip after the flip** boots without the facade on the dual-written WebKit, exactly like a
  downgrade, and the next facade launch reconciles as after one.
- Promotion is automatic at F's first launch when diagnostics are clean, else F stays shadow and says why.
- Milestone 15 stops the dual write once no store-less TestFlight build is installable and the banner has
  run 90 days; App Store 1.2 is the owner's call.

**Swift writers (milestones 10-14).**
- Swift never writes a key while any page writer of it remains. Until then Swift computes and hands the
  result to the page, which commits it through `lsSet` (caches and globals stay coherent), and the hub keeps a
  watch session in its queue until a page has committed it.
- Generic writers count: `_applyImportedData` writes and deletes every BACKUP key in a loop (4724-4842), so a
  key moving to Swift also moves its restore path (the page's restore calls Swift for owned keys, and the
  rollback with it); keymap.txt lists only literal writers.
- Before the first Swift-owned key: a `storeChanged(keys)` push (reseed the facade's Map, drop `_lsCache[k]`,
  bump `_logsVersion`, refresh parse-once globals such as `coachMessages` at 2094, render) and an ownership
  guard in the shell's facade that refuses page writes to Swift-owned keys from any page version.
- Differential shadow runs on a private in-memory copy (sqlite3_backup of the state before the page's
  operation), never a SAVEPOINT on the live connection, which would roll back page writes landing inside it.
- Until the WebKit dual write ends, a page-free drain keeps each drained entry in the hub, marked stored,
  until a page has written it to WebKit, so a downgrade still drains it.

## 6. Bridge API

**Storage channel, proto 1 (shell-owned).**
- Flag `window.__ktStore = {proto:1, shell:'60'}` (no mode field: build 60 is shadow only).
- Ops: `hello [nowk]` (WebKit's manifest and the gap note in; `{mode, need[]}` out), `put`, and
  `w`/`d`/`c <boot>:<seq>`, answered `ok`, `full`, `busy` or `err`. Build 60 sends no `rewrite`.
- Payload: newline-joined JSON string literals (a lone surrogate travels as an ASCII \udXXX escape); the store
  escapes every surrogate half in its answers.
- Async fallback handler `ktStore`, posts carrying (boot id, seq), applied only if newer.
- Page-facing: `__ktStoreState` with counters, `acked(key)`, `remirror(key)`.
- Later: native mode (the flip build's facade), `call <fn>` (page writers of Swift-owned keys), `opBegin`/
  `opEnd` (tag a page operation for differential shadow on a private copy), and the Swift-to-page
  `storeChanged(keys)` push.

**Shell contract v1.**
- Flag `window.__FP_SHELL = {v:1, min:1, shell:'60', screens:['coach'], dev:{nav, theme}}`. `screens` = this
  binary's screens minus the device switch, the policy file, a stale crash marker and the native breaker for
  the page build being served. Later builds only add keys (`tabs` in 61, `features:['stream']` in 62).
- Page to Swift (TrovoShell plugin; calls arrive off main and hop to main, as TrovoIconPlugin.swift:23):
  - `hello {v, page, screens}` -> negotiated `{v, screens}`.
  - `bootDone {page}` at the end of boot whatever painted: disarms the store breaker. The page also sends the
    OTA confirm here (today it is skipped when the first render is the coach route, 6002 vs 6017).
  - `present {screen}` / `dismiss {screen}`; `model {screen, rev, json}` with json = `_nativeJSON(model)`
    (22907); `toast {text, style, undo?}`; `confirm {id, title, body, confirm, cancel, tone}`; `log`.
  - Later: `selectTab {tab, intent}` (61, no echo back to the page), `sheets {open}` (61, announced when a
    sheet or the runner opens, awaited before the slide-in where a shared helper exists), `coachFetch
    {request, stream}` (62).
- Swift to page: `FPScreens.call(name, args)`, FIFO, 2 s timeout (5 s for snapshots), `{ok}` or
  `{ok:false, error}`:
  - `ping`, `shell.covered {on}` (the page skips programmatic focus while covered: render's refocus at
    6008-6011 and the sheet observer's focus return), `coach.snapshot`;
  - `coach.send {text, image?, usePending?, nonce}` (idempotent by nonce), `coach.chip`, `coach.action
    {id, text}`, `coach.stop` (20319), `coach.retry` (20338), `coach.keep {id}` / `coach.undo {id}` (by
    message id, wrapping `_ledgerKeep`/`_ledgerUndo` 19628/19630, because indexes go stale at the
    60-message cap), `coach.model` (17853), `coach.back`, `coach.cancelIntake`, `coach.restorePrevious`
    (19858), `coach.regenerate`, `coach.openSettings`, `coach.image` / `coach.clearImage`,
    `coach.draftTaken`;
  - `confirm {id, yes}` (answers `stale` after a reload), `toast.undo`, `screens.off`.
- **Coach model v1** (about 22 KB for 60 messages, built by the page): `v, rev, boot, intake, loading`;
  `room` and `paper` (the shell sets the native appearance from it); `dynTypeOn` (the app's toggle only:
  native views read the system text size and clamp it); `tokens` (colours, type scale, spacing, radii, all
  with compiled defaults, so most polish ships by OTA); `header` (model label and accessible name per spec
  114; Back, or Cancel during intake); `empty`; `messages[]` (`id, role, at, seed, local, error, stopped,
  errKind, image`; `body` = text, a `%%` block list or a markdown block list with bold/italic/code runs and no
  links; `chip`; `pills` from `toolCallLabel` 19631; `ledger` with raw rows, `canUndo` and actions);
  `running`; `composer` (placeholder, attach, image key, draft with nonce); `speech`. It matches chatui/ui's
  stored fields (`at`, `_seed`, `_stopped`, `_errKind`).
- Rules: one parser per grammar in the page (HTML is rebuilt on the models, so Swift never parses markdown);
  unknown block kinds render as text; Swift mends lone surrogates before decoding; never auto-resend (a draft
  is restored instead); additive within a version; the page speaks every contract an installable shell
  speaks.

**Breakers and switches.**
- Native breaker: no `hello` within 15 s, or 3 failed intents, turns that screen off for the page build.
- Crash markers: before presenting a native screen the shell writes `presenting <screen>@<page build>`;
  before each synchronous store answer it marks a store op in flight (a byte written to an open file, cleared
  after; it survives a process kill). A stale marker at launch turns that piece off for the (shell build, page
  build) pair, and Settings > About says why.
- Store breaker: armed per document start, disarmed by `bootDone`; a document that never finishes booting
  makes the next launch run without the facade (harmless in shadow).
- Switches: the `FP_NATIVE` page constant; `kt_native_off` (device, never in `BACKUP_KEYS` 4460 or
  `RAW_STRING_KEYS` 4458); Storage's "Native copy" switch (device); `policy.json` beside build.txt on Pages,
  fetched by the shell at launch and on foreground (at most every 15 minutes), last good copy kept: native
  screens follow it at once, the store at the next document start; a missing or bad file changes nothing.

## 7. Shell

**Build 60: no root change.**
- Untouched: Main.storyboard, the Info.plist scene manifest (`UIMainStoryboardFile` 64-65; manifest 66-84
  with `UISceneDelegateClassName` 77-78), the launch work (`WatchSessionHub.shared.start()` 34).
- SuperoViewController:
  - `instanceDescriptor()` (138-144) also sets `descriptor.hasInitialFocus = false`;
  - `webView(with:configuration:)` returns the WKWebView subclass that counts leaving the window while active;
  - `capacitorDidLoad` (146-162) gains `StoreAttach.install`, the `__FP_SHELL` script, ScreenHost, the
    policy fetch and two `registerPluginInstance` lines (TrovoShell, TrovoStore) beside 152-158.
- SceneDelegate `scene(_:willConnectTo:)` (200-203) rebinds FPKit to the new scene's web view.
- **The native chat:** presented `.overFullScreen` (the page stays visible to itself; strangler probe S1)
  with a push-like slide and an interactive edge-pan back; ScreenHost blurs the page's focused field and ends
  editing first (UIKit hands first responder back to WKContentView when an `.overFullScreen` screen is
  dismissed, critic probe), and tells the page it is covered; PhotosPicker as a sheet; toasts and confirms at
  window level; the web view `accessibilityElementsHidden` while covered; every hosting controller and the
  toast window get `overrideUserInterfaceStyle` from the model's `paper` flag (`.light` for Heavyweight,
  `.dark` for Lime), so keyboard, picker and menus match the room, not the phone's setting.
- The page's keyboard scroll guard (22436-22457) stays. A native field's keyboard shrinks the page's
  visualViewport behind the chat (critic probe, 778 to 484); the simulator shows the software keyboard, so
  this is automated, and stays on the device checklist too (the 2026-07-09 keyboard scroll bug was found and confirmed fixed on the device).

**Build settings.** FPKit targets iOS 17 (@Observable, PhotosPicker). Only the App target moves to 17.0
(project.pbxproj:708, 733); the project level (637, 688) stays 15.0 so `cap sync` keeps writing `.iOS(.v15)`
under swift-tools 5.9 into CapApp-SPM/Package.swift; the share extension (887, 911) stays 15.0 and the
widget (808, 831) 16.2. `MARKETING_VERSION` stays 1.3 in all 10 places (the train is open while TestFlight
only); release-ios.sh sets the build number.

**Build 61: the root change, alone** (shell option A, probes B/F/G/H).
- Drop `UIMainStoryboardFile` and `UISceneStoryboardFile`; keep `UISceneDelegateClassName`. SceneDelegate
  builds the window with a RootTabController (UITabBarController) and one eager SuperoViewController.
- **One `select(tab)` funnel** re-homes the web view before `selectedIndex` changes and is used by
  `shouldSelect` and by every programmatic path (`selectTab` from the page, `trovo://start`, `trovo://share`,
  `-devNav`); programmatic selection never calls `shouldSelect` (shell probe B, 143-149, already works this
  way). Behind the native Coach tab the web view stays in the window, hidden, after a blur and `endEditing`.
- **Full-bleed under the floating bar.** The web view is not pinned to the safe-area bottom (that resized the
  page, innerHeight 729 <-> 778, on every hide/show). The shell sets a CSS variable with the bar's height
  (`--fp-bar-h`, 0 while hidden) and the page uses it where `--tab-h`/`--tab-gap`/`--tab-bottom-clear`
  (148-157) sit today; hiding the bar changes a variable, not the viewport. The bar is the iOS 26 Liquid
  Glass capsule: presented to the owner as a design change.
- **The page announces sheets and the runner** (`sheets {open}`) from its sheet helpers and from
  `openDeckRunner`/`paintRunner` (the body observer at 20825-20844 never sees `#runner-root`, 1970), awaiting
  the shell's ack before the slide-in where a shared helper exists (budget 50 ms).
- The page's native-tabs mode ships by OTA first (inert without `tabs` in the flag): hide `#tabs`, the bar
  variable, `switchTab` (5768) and the 9 Coach entry points through `TrovoShell.selectTab`, the announcements.
- The root routes deep links: `trovo://start` selects Log, then `_trovoOpen`; `trovo://share` selects Coach,
  and the page stays the only share consumer (`getPendingShare` deletes what it returns,
  TrovoSharePlugin.swift:24-38).
- The bar's first-frame tint reads `kt_theme` from FPStore; `-devNav` reaches native tabs.
- Before hand-over: plutil on the archive and a launch on a real iOS 27 device.

**Later.** A SwiftUI root once most tabs are native. Capacitor, WKWebView and OTA go in milestone 15; the
UIKit scene lifecycle stays.

## 8. Roadmap

Each milestone's web half ships first by OTA, inert on older shells; its binary is one TestFlight build plus
the polish builds it needs (build numbers below are each area's first build and slide with polish builds or
the valve). Changed from the draft: polish rounds are budgeted; the logging port computes but writes nothing
and moves before the flip; the flip comes right before the first Swift-owned key; the page-free drain moves
to milestone 14.

| # | Build | Title | Size |
|---|---|---|---|
| 1 | 60 | Native copy of your data (shadow, observe-only) + native Coach chat | L (4-5 wk after chatui lands, polish included; store half ~2 wk, can ship alone) |
| 2 | 61 | Native tab bar + fully native Coach tab | L (3 wk, polish included) |
| 3 | 62 | Coach replies stream through a native transport | M (1-2 wk) |
| 4 | 63 | Native Settings; web flows float over native screens | L (3-4 wk incl. polish) |
| 5 | 64 | Native Progress (+ first Swift read slices in shadow) | L (4-5 wk incl. polish) |
| 6 | 65 | Native Today and the Run/Body/Sport forms | L (4-5 wk incl. polish) |
| 7 | 66 | Native workout runner over the page's runner state | XL (6-7 wk incl. polish) |
| 8 | 67 | Native editors; no web UI left in native mode | XL (7-9 wk incl. polish) |
| 9 | 68 | Swift read models from FPStore, proven in shadow | XL (5-6 wk, overlaps 5-8) |
| 10 | 69 | Logging, ingestion and satellites computed in Swift (the page still commits) | XL (5-6 wk) |
| 11 | 70 | The flip: the native store takes charge | L (2-3 wk) |
| 12 | 71 | Programme engine in Swift (first Swift-owned keys) | XL (6-8 wk) |
| 13 | 72 | Coach brain in Swift | XL (5-6 wk) |
| 14 | 73 | Native backups; Swift owns the logs; page-free drain and week | L (3-4 wk) |
| 15 | 74 | Retire the page | M (2 wk) |

Rough total for one implementer: about 8-9 months to "no web UI" (build 67), about 15 months to a
page-free app (read-slice and logging ports can overlap screen work on a second track).

**1 · Build 60.** Web half by OTA (gate: chatui/ui lands): `coachSend`/`coachPrefill` for every entry point;
message ids; raw `_planChangeRows`; `%%` and markdown block models; `FPScreens`, `_coachModel` (with `paper`,
`dynTypeOn`, `tokens`), `_fpSync` in `paintRunner`, element placeholder, toast/confirm forwarders, `hello`,
`bootDone` (with the OTA confirm moved there), the covered flag, off switches; the Storage row with Put back;
the drain's re-mirror before the wrist-queue clear; privacy copy; harness shell and store modes; specs
118-120; golden dump; `policy.json`. Swift half: FPKit (FPCore, FPStore + facade, FPHost, FPUI chat); thin
TrovoShell/TrovoStore plugins; AppDelegate glue; App target iOS 17; crash markers; the policy fetch; focus
ownership and appearance; tooling on launch arguments; `tests/native-store.sh` with the kill sweep and the
59 <-> 60 drill. Stays web: Coach hub, connect screen, Today's card. No Info.plist or storyboard change.
Done when: R1's checks (section 9).

**2 · Build 61.** OTA first: native-tabs mode (hide `#tabs`; `--fp-bar-h` in place of the tab geometry,
148-157; `switchTab` 5768 and the 9 Coach entry points through `TrovoShell.selectTab` with no echo; sheets
and the runner announced by the page). Shell: storyboard keys dropped, `UISceneDelegateClassName` kept,
RootTabController built in SceneDelegate, one SuperoViewController per scene, the select funnel for taps and
every programmatic path, full-bleed web view under the glass bar, blur + `endEditing` before re-homing or
hiding, hidden in the window behind the Coach tab; the root routes `trovo://start` and `trovo://share`; bar
tint from `kt_theme` in FPStore. Native Coach tab: hub and connect screen (setKey, disconnect, clearChat,
`startRoutineIntake` 18165, `openStarterIntake` 13354); the chat pushed in its stack (60's overlay retires).
Done when: plutil on the archive and a launch on a real iOS 27 device; a native test drives taps,
`selectTab`, `trovo://start`, `trovo://share` and `-devNav` with zero `visibilitychange` and zero
leave-window faults; opening a web sheet or the runner never changes `innerHeight` and the bar is gone before
the sheet's first frame where a helper awaits it; no keyboard survives a tab switch; the widget's Start opens
today's session; a shared photo lands in the native chat; tools drive every tab by launch argument; Storage
still "in step"; the owner accepts the glass bar as a design change.

**3 · Build 62.** `runCoachTurn` (19286-19555) stays the only loop; its fetch becomes a `_coachFetch` seam
that calls `TrovoShell.coachFetch` when the flag offers `stream`. Swift streams SSE over URLSession, draws
text deltas in the native chat and hands the page the exact non-streamed JSON (thinking with signature,
redacted_thinking, tool_use input, usage). Stop cancels the request; timeouts become real (today's
`Promise.race` leaves the fetch running, 19338-19352); **a page reboot mid-turn (a new boot id) cancels the
stream**. The buffered CapacitorHttp path stays as fallback; the key travels per request, in process. Done
when: replies stream on the phone; Stop cancels mid-reply; a WebContent kill mid-reply leaves no orphan
request; XCTest (the coach research's 33 checks) proves reassembled responses identical to non-streamed ones
on recorded fixtures; spec 114's request assertions pass with a mocked transport; the off switch returns to
the buffered path.

**4 · Build 63.** Native Settings from a page model (units, room, Dynamic Type, Health and Watch state,
reminders, backup and restore through page operations, programme rows, AI coach key/model/usage, About with
the error log, Storage with Put back, counters and the build). Sub-flows not yet native (Routines, Programme
History, profile, restore from file, How It Works, privacy) open in sheet-host mode (strangler probe S3).
Done when: every row works natively or opens its web flow over the native screen and returns; theme and unit
switches repaint both halves, the bar and the native appearance; the web view never stays stuck in front; a
restore round-trips on the phone.

**5 · Build 64.** Native Progress from page models (Activity card and calendar with THEMES block colours,
month stats, the share poster, the day sheet and its actions, RECORD HISTORY, COMPARE, exercise detail, week
recap, Swift Charts); edits through intents with a native 6 s Undo; share images from the page's canvas. The
first Swift read slices (units, calendar blocks, `_monthStats` 7854, `_prLedger` 4208) compute in shadow and
count mismatches. Done when: golden-seed parity in both rooms and both appearances; delete, Undo, date move
and share through intents; mismatch counts in Storage.

**6 · Build 65.** Native Today (hero, morning card with Ask through `coachSend`, carry forward, next round,
programme done, week strip, streak chip, make-up, BUILD YOUR DAY) and the Run/Body/Sport forms, which send
intents and show the page's validation (no future dates). START still opens the web runner through the sheet
host. Done when: Today matches the web on golden seeds; native logging updates the widget and the watch
through the page's own pushes.

**7 · Build 66.** Native runner over the page's `runner*` globals and `kt_runner_draft` (pre-session sheet,
deck, RPE chips, +1 set, Log all, 6 s Undos, edit/swap/skip, rest clock via `Text(timerInterval:)`, wrist
mirror, COMPLETE). The watch mirror, the rest Live Activity and draft recovery are unchanged. Done when: a
full workout with the watch merges sets, runs the Live Activity and files the same record as the web on
transition fixtures.

**8 · Build 67.** Native editors: Routines in every mode, Build day, Next round, the week ladder, the run
editor, Edit sets and the session editor, date moves, the starter intake, the exercise library and custom
exercises, the athlete profile, How It Works, privacy. Done when: a week of real use with the web view never
in front or in host mode; the classic suite still green for older shells and the PWA.

**9 · Build 68.** FPEngine read side with lossless records (raw JSON plus accessors, keeping `wSet`, `wk0`,
`hkOrig`, `rec`, `recOut`, `mainBy`, `_w`, `_clock`, `away`): units, dates, the week clock (`weekForDate` 3685,
`_planWeekFor` 22879, `_roundInfo` 12516), plan of the day, records, streak, calendar. Native screens build
their models from FPStore and compare with the page's on every paint; a slice switches after golden parity
and two weeks with zero mismatches. Reads only. Done when: every native screen paints from Swift models
before the page is ready, with the page as oracle.

**10 · Build 69.** Swift implements runner finish and set logging (`_setWorkingWeights` 4297, `wSet` stamps,
records, milestones, block stamps), the watch-drain merge (`drainWatchSessions` 23464, `_mergeWristExercises`
23055) and Health import, proven by differential shadow on a private in-memory copy of the state before each
page operation. When parity holds, Swift computes and the page commits through a page operation: `kt_sessions`
keeps 11 page writers (keymap.txt:72), so Swift writes none of it yet, and the watch session stays in the
hub's queue until a page has committed it. The satellites (widget summary, watch plan, reminders, the Live
Activity start with the same `.trovoTimerStart` payload) move wholly to Swift: they write no kt_* key, and the
page stops pushing them (one writer per App Group summary). Done when: transition fixtures from the runner,
watch and Health specs pass in Swift; two weeks of differential parity on the phone; widget and watch
payloads match `_runNativeSync` (23642) and `_pushWatchPlan` (23216) on golden dates.

**11 · Build 70.** The flip (section 5): F's facade with native mode (definitive `full` only, busy retried,
other failures fall back per write to WebKit-first plus a gap note, the `unloading` latch at pagehide);
promotion when diagnostics are clean; `meta.minReader = F`; repair on; witness adopt with the three-way merge
of the five log keys; `wkExcluded`; a breaker trip boots without the facade and reconciles as after a
downgrade; the 'native' marker that makes a store-aware page show the banner when it runs without the flag.
Preconditions: 4+ weeks in step with zero unexplained mismatches; pre-60 TestFlight builds expired or lapsed;
the banner live by OTA two weeks earlier (it reaches 59 and 1.2); `kt_measurements` ids shipped. Done when:
the suite passes in native store mode including the 12 full-disk specs; transient failures on
`lsDel('kt_runner_draft')` and on `kt_coach_msgs` lose nothing after a reload; automated downgrade drills
70 -> 69 -> 70 and 70 -> 59 -> 70 on real simulator builds keep every log (id-less measurements and colliding
ids included); the SIGKILL sweep loses nothing; promotion is refused with a reason when diagnostics are not
clean; a breaker trip keeps every write.

**12 · Build 71.** `_commitRoutine` (11877) and the `_prog*` family, carry forward, rounds and the week clock,
undo/backup scopes (`_w`, `_clock`, `away`), Programme History, the unit regrid. The routine keys become the
first Swift-owned keys (`kt_routine` is written only by `setCustomRoutine`, `clearCustomRoutine`,
`_loadUndoState` and `_commitRoutine`, plus the restore loop): the page's writers become synchronous calls into
Swift, the restore routes them too, `storeChanged` keeps the page coherent and the facade guard refuses direct
page writes. Done when: the engine specs' transition fixtures pass in Swift; Routines writes go through
Swift; Undo and Restore previous match the page on golden scenarios after two weeks of differential shadow; a
spec proves a Swift write behind a live page survives the page's next edit.

**13 · Build 72.** `buildSystemPrompt` (20002) and `buildIntakeSystemPrompt` (18100) byte-identical; the 17
tools over FPEngine; the turn loop; `kt_coach_msgs` Swift-owned, still written in today's shape; the morning
card (`fetchCoachCard` 6843); the API key into the Keychain (WebKit keeps a copy for older builds) with a
first-run sweep (a UserDefaults marker; a Keychain item left by an earlier install is deleted before it is
read) and the privacy copy (24039, privacy.html) made true. Done when: prompts byte-identical on golden seeds;
the tool fixtures pass; a full programme build runs in the native coach without the page; a reinstall finds
no API key.

**14 · Build 73.** A Swift backup writer (same JSON, manifest and iCloud sanitizing) and an all-or-nothing
restore; the remaining `kt_sessions`, `kt_runs`, `kt_sports` writers ported, so Swift owns the logs; the
page-free drain inside WatchSessionHub (until the dual write ends, each drained entry stays in the hub,
marked stored, until a page has written it to WebKit); the web view loaded only as a fallback. Done when: byte
parity with the page's backups on golden seeds; every historic backup restores to the same end state as
`_applyImportedData` for its manifest era (absent keys deleted 4776-4778, the Health ledger rule 4803-4808,
the week anchor, `_uniqueLogIds`, streak seeding by manifest date); a wrist session drains with the page never
loaded; seven days with zero page calls (os_log counter shown in About).

**15 · Build 74.** Remove WKWebView, Capacitor and OTA (keep the UIKit scene lifecycle); stop the WebKit dual
write once no store-less TestFlight build is installable and the banner has run 90 days (App Store 1.2 is the
owner's call); freeze the final page on Pages (shells 60-73 will stage it because its stamp beats their
bundles, TrovoOtaPlugin.swift:62-72, so it must speak all their contracts). Done when: no web view in the app;
the first launch after the update loses nothing; watch, widget, Live Activity, Health and backups verified on
the device.

## 9. Milestone 1 task list (order of work)

Two tracks. Track S (store) has no web prerequisite and starts now. Track C's Swift side (C4-C6) starts now on
hand-written fixtures; its page side (C1-C3) waits for G0. Every `index.html` commit: bump `<meta build>`,
stage `build.txt`, `./verify.sh`, `./tests/run.sh`, gate on exit codes, never on grep.

**G0. Gate: chatui/ui lands.** It merges into `next` and ships by OTA with its own verdict; the native
contract is built on its stored fields (`at`, `_seed`, `_stopped`, `_errKind`), `_planChangeRows` and its
markdown parser. Files: index.html, build.txt; tests/specs/117-coach-chat-ui.spec.js plus its edits to 14, 58
and 104. Acceptance: verify.sh and tests/run.sh exit 0; publish.sh sees Pages serve the new build.txt; CI
"Web regression tests" (UTC) green.

**S1. FPKit package and wiring.** Files: `ios/App/FPKit/Package.swift` (swift-tools 5.9; iOS 17, macOS 14;
FPCore, FPStore with resource ktstore.js, FPHost and FPUI guarded `#if os(iOS)`, test targets);
project.pbxproj (an XCLocalSwiftPackageReference beside 1017-1022, product dependencies on the App target like
1023-1030, `IPHONEOS_DEPLOYMENT_TARGET = 17.0` at 708 and 733 only); `.github/workflows/ios-build.yml`
(`swift test` for FPCore/FPStore, `xcodebuild test` for FPHost/FPUI on a simulator destination).
Acceptance: test-native.sh builds phone + watch and launches; `swift test --package-path ios/App/FPKit`
passes on the Mac; `xcodebuild test` passes on an iOS 26.x simulator; CapApp-SPM/Package.swift unchanged and
lines 637, 688, 808, 831, 887, 911 untouched.

**S2. KTStore core** (from native-inputs/store-first/KTStoreCore.swift, changed where the critiques found
faults): one connection on one serial queue with `busy_timeout`; `quick_check` at open and "any step result
other than ROW/DONE = unreadable"; never create over an unreadable file; WAL + NORMAL, FULL for log-key
transactions; schema v1 (`kv` with `enc`, `journal` with `hprev` and per-key caps, `meta` with `minReader`
and `wkExcluded`, `conflicts`); snaps as separate atomic files; the seven-rule reconcile in observe mode
(section 5); async posts applied by (boot, seq) only if newer; Put back staging (log keys merged by id, other
keys only while unchanged); `kt_apikey` passthrough. Files: `FPStore/{KTStore, KTWire, KTReconcile,
KTJournal, KTSnaps, KTProtocol}.swift`; `Tests/FPStoreTests/{Wire, Reconcile, Store, Kill}Tests.swift`;
`Vectors/vectors.json` from a new `tests/tools/ktstore-vectors.js`. Acceptance (`swift test`): the mactest
checks that still apply; reconcile rows "older build Reset / Start new programme / Clear chat -> tombstoned,
nothing refilled", "older build REPLACE restore of a sparse file -> adopted", "witness absent + near-empty ->
store kept, Put back offered", "missed mirror ABA with gap note -> adopt", "lost suffix -> would repair",
"missed boot stamp named in the gap note -> witness known", "rarely edited programme + busy diagnostic keys +
lost edit -> still detected", "minReader above this build -> attach nothing", "unknown enc -> untouched";
`kt_apikey` never stored; BLOBs exact across a reopen (\ud83d, U+2028, NUL, a 200k-char string); hashes equal
the JS vectors; a SIGKILLed child keeps every committed write; a garbled page reads as unreadable, never as
empty; a 2 MB snapshot under 20 ms.

**S3. The facade, shadow only** (from native-inputs/store-first/ktstore.js, native mode removed): WebKit
first, synchronous mirror, a gap note plus an async post with (boot, seq) on any non-ok; witness and gap note
in hello; `__ktStoreState` with `acked`/`remirror`; never prompts without the flag; `kt_apikey` passthrough.
Files: `FPStore/Resources/ktstore.js`; verify.sh (node --check, the curly-quote ban, and a check that
index.html uses localStorage only through getItem/setItem/removeItem/key/length). Acceptance: verify.sh passes
and fails on a planted `localStorage[...]`; a native `full`, `busy` or no answer never changes what `lsSet`
returns and leaves a gap note naming the key.

**S4. Playwright store matrix, running the shipped facade.** Files: `tests/lib/ktstore-mock.js` (from
native-inputs/store-first/pw, shadow only, mirroring the Swift reconcile table); `tests/lib/harness.js`
(`opts.store = 'shadow'` injects the flag, the shipped ktstore.js and the mock before the seed);
`tests/run.sh` (`STORE=shadow`); a drift check at browser close (store == WebKit == page reads);
`.github/workflows/tests.yml` (classic, shadow and inert as separate jobs); publish.sh (also runs
`STORE=shadow` when ktstore.js, the mock or the harness changed); new `tests/specs/119-store-handshake.spec.js`
(migration, reload re-seed, witness adopt vs would-repair, the four older-build deletion cases, WebKit
unreadable, WebKit wiped -> Put back offered and nothing written, half-emoji round trip, key passthrough,
observe mode writes nothing, Put back restores both copies) and `120-store-writes.spec.js` (a shadow native
failure is invisible to the page; a `full` on the re-delete then a reload rewrites nothing; the drain
re-mirrors `kt_sessions` before `clearPendingSessions` and never keeps a saved entry). Acceptance:
tests/run.sh green classic and `STORE=shadow` with identical per-spec pass counts; each CI job inside its
15-minute timeout.

**S5. StoreAttach and the scenario runner.** The flag only after KTUIProxy is verified as uiDelegate; KTUIProxy
forwards alert, confirm, prompt and createWebViewWith (WebViewDelegationHandler.swift:228-328) and answers
only main-frame `capacitor://` KT1 prompts; the async `ktStore` handler; everything bound to the web view
instance and rebound on scene connect; the store breaker armed per document start and disarmed by `bootDone`;
the store crash marker; background checkpoint; daily snap. Files: `FPHost/StoreAttach.swift`;
AppDelegate.swift (`StoreAttach.install` in `capacitorDidLoad` 146-162; rebind from SceneDelegate 200-203);
`tests/native-store.sh` (probeS promoted to the real App target; `--downgrade` builds the simulator app at
build 59's commit). Acceptance, on iOS 26.x and 27.0 simulators: migration; a write while hidden; background;
a WebContent kill (fresh re-seed); a SIGKILL sweep of at least 20 kills 0-50 ms after a burst (every
acknowledged write is in the store, WebKit's losses show as would-repair with the right keys, the store never
writes WebKit); a launch without the facade, then adopt; WebKit unreadable; WebKit wiped; a scene disconnect
and reconnect (one page at a time, store rebound); a checkpoint and a snap racing page writes (zero
fallbacks); a planted crash marker turns the facade off once and Storage says why; the 59 <-> 60 drill (Reset
programme, Start new programme, a sparse restore and an iCloud-copy restore on 59: nothing comes back); no
prompt ever shows as an alert; facade boot under 50 ms; CapacitorHttp still patched; an OTA test page staged,
served and confirmed; the watch still pulls its plan (test-native.sh 90-105).

**S6. TrovoStore plugin, the Storage row, the page's store hooks, tooling.** Files:
`CapApp-SPM/.../TrovoStorePlugin.swift` (status, conflicts, putBack, setSwitch, exportCopy; testKill in
TestFlight/Debug only) behind a host protocol; AppDelegate.swift (adapter, registration beside 152-158);
index.html: Settings > About > Storage row (only with `_plug('TrovoStore')`: "In step · N items · X KB",
counts for older-build adoptions, would-repair, unexplained, fallbacks, timings, breaker trips and crash
markers, Put back, the Native copy switch, Export a copy, "Test: quit after next save" on TestFlight);
`drainWatchSessions` (23464) asks `acked('kt_sessions')` and `remirror`s once before `clearPendingSessions`
(23630), clearing as today if the store still cannot take it (a kept entry brings back a deleted session,
23562-23564); `bootDone` at the end of boot with the OTA confirm moved there (6002 vs 6017); the privacy copy
(24039) and privacy.html true either way; the dev-nav hook (23780) reads `__FP_SHELL.dev`; test-native.sh
(67-79) and screenshots/shoot.py (113) pass `-devNav`/`-devTheme` as separate words; shoot.py deletes
`Library/Application Support/FPStore` whenever it seeds WebKit (95-109). Acceptance: a spec shows the row
absent without the plugin and the mocked status with it; a spec shows the OTA confirm sent when the first
render is the coach route; on the simulator the row reads "In step"; test-native.sh drives every route twice
on one container with the store attached; shoot.py's ten shots show the seed.

**S7. The policy file.** `policy.json` beside build.txt (`{v:1, store:{facade, repair}, screens:{coach}}`),
published by ./publish.sh; the shell fetches it at launch and on foreground (at most every 15 minutes), keeps
the last good copy and applies it (native screens at once, the store at the next document start); a missing
or bad file changes nothing; a Debug launch argument points it at a local file. Files: policy.json; verify.sh
(JSON check); `FPCore/Policy.swift`; FPHost glue. Acceptance: `swift test` covers parsing, defaults and
staleness; native-store.sh: `facade:"off"` turns the facade off at the next document start;
`screens.coach:"off"` brings back the web chat without a relaunch.

**C1. DOM-free `coachSend(text, {seed, image, usePending, nonce})`** (remembers the last 20 nonces) and
`coachPrefill`, used by every entry point. Files (chatui@29960af): `sendCoachMessage` (20551) delegates;
callers `sendCoachChip` (20617), `coachBlockAction` (18212), `coachCardAction` (6946), `startPlateauFix`
(7810), `startProgression` (7868), `startRecoveryAdjust` (7999), `startWeeklyReview` (16002),
`handleCoachCardAsk` (7114); `coachPrefill` for `_bdAskCoach` (12217) and the share comment in
`checkPendingShare` (9585). Acceptance: with `#coach-input` removed each entry point sends exactly one user
message and one API call, and no weekly stamp is written without its question; specs 14, 18, 19, 20, 58, 104,
112 and 117 unchanged.

**C2. Message ids, ledger by id, raw rows, block models.** Files (chatui@29960af): ids in `_pushCoach`
(18035) and at history load (`loadCoachHistory` 18037, the parse at 2094 on next); id wrappers around
`_ledgerKeep`/`_ledgerUndo` (19907/19909); `_planChangeRows` (19857) returns raw text and the HTML builder
escapes; `_cmbModel`/`_mdModel` under `_coachBlocksHTML` (18150) and `md` (18074). Acceptance: specs 14, 41,
104 (L39, L40, R09, R11), 105 and 117 green; HTML from the models equals today's on the golden fixtures; a Keep
after the 60-message cap shifts indexes retires the right card.

**C3. The screen bridge, inert without TrovoShell; then the OTA.** Files: index.html: `FPScreens` and
`_coachModel` (contract v1 with `paper`, `dynTypeOn`, `tokens`); `_fpSync` as the first statement of
`paintRunner` (chatui@29960af:10342), coalesced with rev; an element placeholder in `renderCoach` (20785), so
the resume reload at 22620-22622 never fires; `showToast` (18005) and `_ktConfirm` (9435) forwarders; `hello`;
the covered flag honoured by render's refocus and the sheet observer; `FP_NATIVE`; `kt_native_off`;
`screens.off`; an About switch. Tests: `tests/lib/harness.js` `opts.shell` with one variant per installable
contract; tests/run.sh `FP_SHELL_INERT=1`; `tests/specs/118-native-coach-bridge.spec.js`;
`tests/golden/dump-coach.js` and `check.sh` writing `ios/App/FPKit/Tests/FPCoreTests/Fixtures`. Acceptance:
the inert run is identical; spec 118 passes (hello negotiates v1; present leaves the placeholder and no
`#coach-input`; labels and chips equal `toolCallLabel` and `getCoachChips`; one send per nonce; keep and undo
by id after the cap; the restore confirm forwarded, then the toast; the seven entry points send; the share
image and draft reach the composer; intake shows Cancel and no Back; `switchTab('log')` dismisses; each switch
brings back the web chat; a reload starts a new boot and a stale confirm answers `stale`; no lone surrogate in
any model; no programmatic focus while covered); then verify.sh and the suite exit 0 and ./publish.sh ships
the page, inert on every shell up to 59.

**C4. FPCore.** Contract and negotiation; lone-surrogate mending before decoding; CoachModel with `paper`,
`dynTypeOn` and `tokens` (compiled defaults); blocks with an `.unknown(text)` fallback; the Intent enum;
LinkState (15 s hello deadline, 3-failure breaker); breaker and crash-marker policy. Files:
`FPCore/{Contract, JSONText, CoachModel, Tokens, Blocks, Intent, LinkState, Breaker}.swift`;
`Tests/FPCoreTests`. Acceptance: `swift test` decodes every golden fixture; intent names and arguments equal
intents.json; the link state machine covers the hello deadline, the breaker and a reset on a new page build.

**C5. TrovoShell plugin, ScreenHost and PageLink.** The plugin is thin and hops to main (TrovoIconPlugin.swift:23).
ScreenHost presents `.overFullScreen` only (push-like slide, interactive edge-pan back, queueing, a latch for
user dismissal); it owns focus (blur through the bridge and `endEditing(true)` before covering;
`descriptor.hasInitialFocus = false` in `instanceDescriptor` 138-144); it hides the web view from VoiceOver
while covered; it sets `overrideUserInterfaceStyle` from `paper` on every hosting controller and the toast
window; it writes the `presenting coach@<page build>` crash marker. PageLink calls `callAsyncJavaScript` in
the page world: FIFO, 2 s / 5 s timeouts, boot ids, a resync on a new hello, never a resend. All bound to the
web view instance. Files: `CapApp-SPM/.../TrovoShellPlugin.swift`; `FPUI/{ScreenHost, SlideTransition,
PageLink, ShellBridge}.swift`; AppDelegate.swift (the `__FP_SHELL` script, the web view subclass, the host
adapter, registration). Acceptance, on the simulator: a `-fpSmoke` launch logs "fp: ping ok v1" (subsystem
app.kt.trainer); no `visibilitychange` while the chat is up; a focused web field, then present and dismiss the
chat: no keyboard returns and the document is not scrolled; killing WebContent with the chat up resyncs on the
new boot without resending and closes an open confirm as stale; a planted crash marker brings back the web
chat once.

**C6. FPUI chat views and fonts.** Header with the model switch's label and accessible name (spec 114);
message list and rows; `%%` and markdown blocks; pills and PLAN CHANGES; empty state and intake; the Thinking
row with Stop in Send's place; the composer with PhotosPicker downscaling to 1568 px at JPEG 0.82; toast and
confirm; tokens with compiled defaults; text size from the system, clamped `.large ... .xxLarge` when
`dynTypeOn`, pinned `.large` when off. Files: `FPUI/Coach/*`, `FPUI/Theme/{RoomTheme, Fonts, Type}.swift`;
screenshots/live-activity/mkfonts.py (FACES 29-35) extended with the body weights, shipped as FPKit
resources. Acceptance: `xcodebuild test` renders every fixture in both rooms x light/dark x three text sizes
to PNG beside a Playwright shot of the web chat (a contact sheet), and a person reviews them; a Swift test
matches spec 20's downscale rule; inline bold survives and no link is ever created.

**C7. Live wiring and native smoke.** CoachStore (model pushes, optimistic echo by nonce, the `fpDraft.coach`
draft, confirms, toasts, reload handling). Files: `FPUI/Coach/CoachStore.swift`; test-native.sh (ROUTES gains
`coach/chat` by launch argument in both rooms x `xcrun simctl ui appearance light|dark` x `content_size`;
the keyboard sequences; store.sqlite compared with WebKit's localstorage.sqlite3; a `-fpSmoke` log grep).
Acceptance: test-native.sh passes and every screenshot is looked at; the watch-pull check still passes.

**R1. Release build 60.** release-ios.sh (`CURRENT_PROJECT_VERSION` 60, `MARKETING_VERSION` stays 1.3);
recreate /tmp/supero-export.plist before archiving; archive with `-project App.xcodeproj`. Acceptance before
upload: verify.sh; tests/run.sh classic, `STORE=shadow` and `FP_SHELL_INERT=1`; swift test; xcodebuild test;
tests/native-store.sh including the kill sweep and the 59 <-> 60 drill; test-native.sh with every screenshot
read; `plutil -p <archive>/Products/Applications/App.app/Info.plist | grep UISceneDelegateClassName` matches.
The owner's checklist on the phone is in section 13. Valve: if track C is not ready when track S is, 60 ships
the store alone.

## 10. Critique dispositions: what changed, what I rejected

**Data-safety critic.**
1. *Older builds' deletions read as "WebKit copy gone" and refilled (high).* **Adopted.** Verified: Reset
   (19900-19908), Start new programme (3640-3650), a REPLACE restore (4776-4778, 4803-4808, 23712) all delete
   for real, and the prototype's core/25% rule (KTStoreCore.swift:194-213) refills them; I re-ran the probe.
   The core-key and 25% heuristics are gone; the witness decides (rule 4 adopts deletions as tombstones); "WebKit
   wiped" needs `kt_last_open` itself absent plus a near-empty WebKit, and even then 60 only offers Put back.
   Specs 119, ReconcileTests rows and the automated 59 <-> 60 drill cover Reset, Start new programme, Clear
   chat, a sparse restore and an iCloud-copy restore.
2. *A missed mirror plus a repeated value reads as lag; repair reverts the newest change (high).* **Adopted.**
   One serial connection with `busy_timeout` for every operation; a gap note in WebKit on any non-ok mirror;
   lag only when WebKit's whole manifest equals the store's state at one journal seq (no per-key verdicts);
   persistent (boot, seq) on async posts. And repair is observe-only in 60, so a misjudgment can only miscount.
3. *The drain clears the wrist queue without knowing the store took the session (medium).* **Adopted in
   part.** The drain asks `acked('kt_sessions')` and re-mirrors once before clearing. Rejected: keeping the
   queue when the store still cannot take it: a kept entry brings back a session the owner deletes before the
   next foreground (the hazard the page's own comment records, 23562-23564), so it clears as today and Storage
   shows the failure.
4. *Swift writers (milestones 11-13) overwritten by page caches (high).* **Adopted.** Swift writes a key only
   when every page writer of it is ported (generic writers such as the restore loop included); until then Swift
   computes and the page commits; `storeChanged` and a facade ownership guard before the first Swift-owned
   key; differential shadow on a private in-memory copy. Consequences: the logging port writes nothing and
   moves before the flip (now milestone 10), the flip is 11, the first owned keys are the engine's (12), and
   the page-free drain moves to 14.
5. *Native mode in 60 loses writes on transient failures and breaker trips (medium).* **Adopted, stronger:**
   native mode is removed from 60's facade altogether and F sets `minReader`. F's facade throws only on a
   definitive `full`, retries busy, falls back per write to WebKit-first plus a gap note, and latches
   `unloading` at pagehide. **Rejected sub-point:** "a breaker trip after the flip boots read-only from the
   store". Read-only cannot escape a bug in the facade's own read path, which is what a breaker trip
   suspects, and it turns every save into an error. Instead the trip boots without the facade on the
   dual-written WebKit, and the next launch reconciles as after a downgrade (`wkExcluded` and the three-way
   merge cover the gaps the critic named).
6. *Merge by id cannot merge `kt_measurements` and drops records sharing an id (medium).* **Adopted, refined:**
   measurement ids by OTA before the flip and `_uniqueLogIds` extended; a three-way merge against the base the
   store keeps (a merge by id alone cannot tell an edit from a deletion); colliding ids keep both;
   `_uniqueLogIds(true)` after.
7. *Build 60 fixes forever how it reads later stores (medium).* **Adopted in part:** schema v1 carries
   `meta.minReader` (honoured from 60), `meta.wkExcluded` and a per-row `enc`. **Rejected:** "ship the log merge
   in build 60". With `minReader`, builds 60..F-1 never touch a native-mode store, so only F merges.
8. *The repair off switch arrives two launches late and nothing can put a repair back (medium).* **Adopted:**
   observe-only in 60, Put back (reversible, journaled), and a policy file the shell fetches at launch and on
   foreground instead of "a page that sets the policy reloads once".
9. *Safety copies inside the file they protect (low).* **Adopted:** snaps as separate atomic files,
   `quick_check` at open, any step result other than ROW/DONE means unreadable.
10. *A global journal cap turns lag on rarely written keys into adoption (low).* **Adopted:** per-key caps
    (last 32 per key plus the last 10 minutes) with `hprev`.
11. *The Keychain copy survives uninstall (low).* **Adopted** in milestone 13: first-run sweep, privacy copy.
- Missing items: concurrency model, async semantics, rule precedence and definitions (the seven-rule table),
  the downgrade-deletion drill, owner-visible Put back, invalidation and guard, backup end-state parity per
  manifest era, measurement ids: all **adopted**. `synchronous=FULL` before destructive operations:
  **adopted narrowly** (transactions that write the five log keys), not globally (an fsync on every
  synchronous page write would stall bursts for little gain).

**Platform/delivery critic.**
1. *The owner's force-quit check cannot land in WebKit's window; repair ships on with a slow off switch
   (high).* **Adopted:** the owner's force-quit checks are gone; repair is report-only; a TestFlight-only "Test:
   quit after next save"; native-store.sh runs at least 20 SIGKILLs 0-50 ms after a burst; the loss evidence is
   now described as macOS probes plus the iOS simulator sweep. **Modified:** the policy file is fetched by the
   shell, not the page, so it also works when the page is broken.
2. *Programmatic tab changes skip `shouldSelect` (high).* **Adopted:** one `select(tab)` funnel for taps and
   every programmatic path (shell probe B already had it; the draft lost it), a leave-window counter, a native
   test over every path.
3. *A hidden or covered web view keeps the keyboard; dismissal hands it back (medium).* **Adopted, and moved to
   build 60:** UIKit restores first responder after the 60 overlay too. ScreenHost owns focus;
   `hasInitialFocus = false`; the page skips programmatic focus while covered; both probe sequences automated.
4. *Pinning to the safe-area bottom resizes the page; the runner cannot be detected (medium).* **Adopted:**
   full-bleed web view, `--fp-bar-h` from the shell, the page announces sheets and the runner itself, the
   glass bar shown to the owner as a design change.
5. *Swift crashes bypass every breaker (medium).* **Adopted:** crash markers for native screens and store
   operations; a Native copy switch in Storage.
6. *Native views follow the phone's light/dark, not the room (medium).* **Adopted:**
   `overrideUserInterfaceStyle` from `paper`; renders and shots in both appearances.
7. *Native polish loses the OTA loop (medium).* **Adopted in part:** colours, type scale, spacing and radii
   ride in the model as tokens with compiled defaults; web/native contact sheets; one or two polish builds
   budgeted per screen (sizes and timeline grow). **Rejected:** arbitrary per-view layout metrics in the model.
   That turns every view into a lookup table, and the metrics would have to move back into Swift when the
   page goes.
8. *Milestone 11 has no store-to-page channel and no WebKit write without a page (medium).* **Adopted** (with
   data-safety 4): `storeChanged` before any Swift-owned key; the hub keeps drained entries until a page has
   written them to WebKit.
9. *Dynamic Type from `model.dynType` goes stale (low).* **Adopted:** system text size clamped `.large ...
   .xxLarge` (about 1.24x, the page's 1.25 cap) when the toggle is on, `.large` when off; the model carries
   the toggle only.
10. *Testability (low).* **Adopted:** FPHost/FPUI guarded and tested with xcodebuild; CI one job per mode;
    publish.sh runs the shadow mode when the facade, mock or harness changes; keyboard and downgrade checks
    automated; every shell assertion has a counter in Settings > About. Kept one keyboard check on the device
    (the 2026-07-09 keyboard scroll bug was found and confirmed fixed on the device).
11. *The store breaker inherits an OTA confirm only some renders send (low).* **Adopted:** `bootDone` at the end
    of boot disarms it and carries the OTA confirm, fixing a latent page gap (6002 vs 6017).
12. *Fail-closed blocks the `visibilitychange` after pagehide (low).* **Adopted** for the flip's facade.
13. *shoot.py's first launch creates the store before the seed (low).* **Adopted:** shoot.py deletes FPStore
    when it seeds.
14. *"Exactly one SuperoViewController" is not promisable (low).* **Adopted:** bind per web view, rebind on
    scene connect, arm the breaker per document start, test a disconnect and reconnect.
- Missing items: a `__FP_SHELL` variant per installable contract (adopted: bridge specs and a smoke subset per
  contract, the full suite for none and the newest), stream cancel on page reboot (adopted in 62), automated
  downgrade drills on real builds (adopted), appearance x room x Dynamic Type shots (adopted), owner-readable
  diagnostics (adopted), a remote policy file (adopted, shell-fetched).

**My own changes in this revision.** Scores corrected (the draft overstated its data score); sizes and
timeline grow (M1 4-5 weeks after chatui lands; no web UI about 8-9 months; page-free about 15 months);
generic writers (the restore loop) count before any key moves to Swift; native-mode tests move to the flip
(M1 runs classic, shadow and inert); verify.sh checks the facade's premise; chatui/ui line numbers re-cited
at 29960af (32 commits ahead of `next`).

## 11. Testing

The page stays the oracle at every layer.
1. **Classic gate.** tests/run.sh (116 spec files, 388 test blocks, plus chatui's 117) on every index.html
   commit and in CI (UTC). It guarantees older shells and the PWA until the page is retired.
2. **Contract runs.** `FP_SHELL_INERT=1` injects `__FP_SHELL {screens:[]}` and a TrovoShell mock into every
   native boot; results must be identical. One harness variant per installable contract (none, 60's coach,
   61's tabs, 62's stream, ...) runs the bridge specs and a smoke subset; the full suite runs for none and for
   the newest.
3. **Store matrix.** `STORE=shadow` loads the shipped ktstore.js plus `tests/lib/ktstore-mock.js` (a JS
   reference of the native side, backed by sessionStorage, mirroring the Swift reconcile table); a drift check
   at every browser close compares store, WebKit and the page's reads. CI runs classic, shadow and inert as
   separate jobs (the suite took 218 s locally; tests.yml has a 15-minute timeout); publish.sh adds the shadow
   run when the facade, the mock or the harness changed. Native mode and the 12 full-disk specs in native mode
   join at the flip (store-first's prototype already ran 116/116 in both modes).
4. **Bridge specs per native screen** (118 for the coach, one per later screen): hello, present and
   placeholder, model parity with page functions, nonces, id-addressed actions after the 60-message cap,
   forwarded confirms and toasts, reloads, the covered flag, the switches.
5. **Golden fixtures and contact sheets.** tests/golden/dump-*.js writes page-built models (later page-function
   outputs) into FPKit fixtures; check.sh fails on drift. Each fixture renders natively in both rooms x
   light/dark x three text sizes beside a Playwright shot of the web version, for a person to review.
6. **Swift.** `swift test` (FPCore, FPStore): contract, decoding, link, breaker and policy state; the reconcile
   truth table (older-build deletions, missed-mirror ABA with gap notes, prefix lag, per-key journal,
   `minReader`, unknown `enc`, wiped WebKit); JS-generated wire vectors; BLOB exactness; durability across a
   SIGKILLed child; corrupt and unreadable files. `xcodebuild test` on a simulator (FPHost, FPUI renders).
7. **tests/native-store.sh** on the real App target and page, iOS 26.x and 27.0 simulators: the probeS
   scenarios, the SIGKILL sweep (at least 20 kills 0-50 ms after a burst), a scene disconnect and reconnect,
   crash markers, a checkpoint and snap racing writes, the policy file, and the 59 <-> 60 downgrade drill on
   real simulator builds (later 69 <-> 70).
8. **test-native.sh** stays the "test it" flow: routes by launch argument (`coach/chat`; native tabs from 61) in
   both rooms x both appearances x text sizes; the keyboard sequences; store.sqlite against WebKit's file;
   `-fpSmoke`; the watch-pull check; every screenshot read.
9. **Device checklist per build** (10-15 minutes, the owner; section 13) plus plutil on the archive. The iOS 27
   scene rule is never trusted to the simulator. Every shell assertion the owner cannot see in os_log has a
   counter in Settings > About (leave-window while active, `visibilitychange` while a native screen is up,
   breaker trips, crash markers, would-repair, unexplained mismatches, fallbacks).
10. **Later.** Read-slice parity counted on the device for two weeks before each switch (5, 9); transition
    fixtures `{before, intent, after}` recorded from the existing specs with a frozen clock, plus on-device
    differential shadow on a private copy for every writer port (10, 12-14); the coach research's 33 turn-loop
    checks, stream cancel on reboot and request parity with spec 114 (3, 13); byte-identical prompts (13);
    backup byte parity and end-state parity per manifest era (14); downgrade drills to 69 and to 59 and back
    (11).

## 12. Risks and what contains them

| Risk | Mitigation |
|---|---|
| The root change hits the iOS 27 scene-lifecycle crash (builds 44/45); the simulator does not enforce the rule | 60 does not touch Info.plist, the storyboard or SceneDelegate's role; 61 changes them alone and keeps `UISceneDelegateClassName`; plutil on the archive and a real-device launch before hand-over. |
| The reconcile damages good data (an older build's deletions refilled; a missed mirror plus a repeated value read as lag) | Build 60 never writes WebKit on its own; the witness decides adopt (rule 4); gap notes and a whole-manifest prefix test decide lag (a gap note lost in the same kill can still look like lag: in 60 that only miscounts, and Put back shows what it would bring back); every value given up goes to conflicts with Put back; truth-table tests and the automated 59 <-> 60 drill. |
| A bug in the shell-owned facade cannot be fixed by OTA | Shadow cannot fail a page write (WebKit first, async fallback); crash markers and a breaker per document start; the Native copy switch on the device; the policy file reaches it at the next launch; the matrix and native-store.sh test the exact file that ships. |
| A Swift crash (store answer or native screen) loops on every launch | Crash markers turn that piece off for the (shell, page) pair; Settings > About says why. |
| The synchronous prompt channel is unproven on a real phone (main-thread coupling, background, suspension) | Not load-bearing in shadow; timings and fallbacks in Storage; native code never blocks the main thread waiting on the page; the flip waits for weeks of device evidence. |
| WebKit loses its last writes on a hard kill (datalayer probes on macOS; under ~75 ms after a burst on the iOS simulator), including the drain's save-then-clear | The store holds every acknowledged write; the drain re-mirrors before the clear; a loss shows as would-repair with Put back; the flip closes it. Optional page tweak for store-less shells: clear the wrist queue 250 ms after the save on shells whose bundled page is 20260923-1 or later (`_shellBuildRead` 9463), since older shells clear everything. |
| The web view leaves the window (a `.fullScreen` modal, a push, a programmatic tab change outside the funnel) and runs the leave/return path, moving `_wristLive`'s window (23460) | ScreenHost and the select funnel are the only code that moves it; a forbidden-presentation list; the leave-window counter; a native test over every tab path; the device check of a wrist workout finished during a chat. |
| Keyboard and focus leak across native and web (a hidden field keeps the keyboard; dismissal restores it; a background render refocuses) | The shell owns focus (blur + `endEditing`), `hasInitialFocus = false`, the covered flag; both sequences automated in the simulator and kept on the device checklist. |
| Native screens ignore the room (system light/dark) or Larger Text drifts | `overrideUserInterfaceStyle` from `paper`; system text size clamped as the page clamps; shots in every appearance and size. |
| Contract drift through OTA (a page renders, passes the OTA breaker, breaks the bridge) | Versions both ways; capability detection only; unknown blocks render as text; native breaker per page build; page constant, device switch and policy file; contract runs for every installable shell. |
| The page reloads behind a native screen when WebContent dies | Boot ids, resync on the new hello, stale confirms refused, never auto-resend; the placeholder is a real element so the resume check (22620-22622) never reloads; 62 cancels the stream on a new boot. |
| A scene reconnect makes a second SuperoViewController while singletons point at the first | Everything binds to the web view instance by weak reference and rebinds on scene connect; the breaker is armed per document start; a disconnect/reconnect scenario in native-store.sh. |
| Off switches arrive late (the OTA check runs only at boot, 22611; a staged page serves at the next launch) | The shell fetches the policy file at launch and on foreground; crash markers act on the next launch with no network; the device switches act at once. |
| Two chat UIs while older shells get OTA pages | The page builds labels, rows, chips and text models, so they cannot disagree; the classic suite keeps the web chat covered; chatui lands first. |
| Native polish needs binaries | Tokens in the model ship by OTA; contact sheets catch drift before a build; one or two polish builds budgeted per screen. |
| Swift writes behind a live page are overwritten by its caches (11 page writers of `kt_sessions`) | Swift writes only keys it fully owns (generic writers included); `storeChanged` plus the facade guard before the first owned key; Swift computes and the page commits until then. |
| Downgrades after the flip (TestFlight builds lapse after 90 days; App Store 1.2 never expires) | Dual write keeps WebKit complete (less `wkExcluded`); `minReader` makes 60..F-1 behave as store-less; witness adopt with a three-way log merge; measurement ids first; the banner two weeks earlier; pre-60 builds expired. |
| Lone surrogates break Foundation decoding or SQLite TEXT | BLOB storage, JSON-literal wire format, mending before decoding, `_nativeJSON` (22907) for every model, JS-generated vectors. |
| Swift writers drop fields or break newest-first order (3424-3438) | Raw-preserving records; transition fixtures; differential shadow before every switch. |
| The engine port is the bulk (the coach tools alone reach 199 functions, 2,651 lines) | One slice at a time; golden and transition fixtures; on-device differential shadow; the page stays oracle and fallback until 15. |
| The page kept alive behind native screens costs memory and CPU (simulator: about 181 MB, about 0.1% CPU) | Measured on the phone in 60; reload handling above; screens paint from Swift models from 9. |
| chatui/ui is still moving (32 commits ahead of `next` at 29960af) | Milestone 1's page work starts after it lands; the Swift chat works from fixtures meanwhile; the golden check catches drift. |
| Simulator-only timings (facade boot 4-17 ms, 0.1-0.5 ms per write, a 9 ms put) | Budget about 50 ms at cold start; measured on the phone through the Storage row before anything relies on them. |

## 13. Owner summary (plain words)

Your app becomes fully native one piece at a time, and you try every piece as a TestFlight build on your
phone. Your workouts and history stay safe the whole way. Until near the end, the storage the app uses today
stays complete and in charge, and the new native copy never overwrites it on its own. If a build misbehaves,
reinstall the previous one from TestFlight and everything is still there.

**Before any new build.** Two web updates arrive on their own, with nothing to install: the Coach chat
redesign being finished now, then groundwork you won't see (including a small fix so a live update is
confirmed even when the app opens straight into the Coach). Older builds don't change.

**Build 60: a native copy of your data, and a native Coach chat.**
- The first time you open it, the app copies everything into a native database. Settings > About > Storage
  says "In step". If the phone's own storage ever drops a change (it can only happen if the app is killed a
  split second after saving), Storage shows it and one tap puts it back. Nothing is changed for you
  automatically.
- Open Chat slides in a native screen with your same history: the iPhone's own keyboard and scrolling, the
  photo picker, VoiceOver, Larger Text, both looks. It matches the app's look even when your phone is set to
  the other light or dark mode. Replies still arrive in one piece; typing-out comes in build 62.
- The Coach home, the connect screen and Today's card stay as they are. A switch in Settings > About brings
  back the old chat.
- Please check:
  - Storage says "In step" after installing over 59;
  - a real question; a programme change once with Undo and once with Keep; a photo; Stop; Today's Ask;
  - type in a field, open the chat, come back: no stray keyboard, nothing shifted;
  - the chat with your phone in Light mode and in Dark mode;
  - finish a watch workout while the chat is open: it syncs;
  - the watch, the widget and the rest timer behave as before.
- Optional: install 59, reset your programme or restore a backup there, then install 60 again. What you
  deleted on 59 stays deleted, and Storage says it picked up 59's changes. Also optional: Storage > "Test:
  quit after next save", log a set, reopen, and read what Storage reports.
- If the chat isn't ready when the storage part is, 60 brings only the storage and the chat comes in 61;
  later numbers move up by one. Small polish builds may come in between.

**Build 61: the iPhone's own tab bar and a fully native Coach tab.** The bar is the new floating glass bar
of iOS 26, so it looks different from today's: judge it as a design change. The Coach tab is native
throughout (home, connect, chat); Log, Progress and Settings still show today's screens inside it. Check:
switching tabs any way never leaves a keyboard over an empty screen; sheets and the workout runner slide up
without the screen jumping; the widget's Start opens today's session; a shared photo lands in the chat.

**Build 62:** coach replies type out as they are written, and Stop stops at once.

**Builds 63 to 67:** one area per build: Settings, then Progress, then Today with the Run/Body/Sport forms,
then the workout runner, then the editors (Routines, programme, run and session edits, the starter plan, the
exercise library). Expect one or two small polish builds per area. Anything not yet native opens as a sheet
over the native screen. After 67 you shouldn't see a web screen.

**Build 68:** native screens work out what to show by themselves, so they open instantly; the old engine
double-checks them for a while.

**Build 69:** the rules for logging a workout, the watch sync and Health import run in Swift alongside the
old ones until they agree; the watch, widget and rest-timer feeds come from Swift.

**Build 70:** the native database takes charge, only after at least four weeks of "In step" on your phone.
Two weeks before, older builds start showing a note, and old TestFlight builds are retired. Going back to an
older build still works: your data keeps being copied to the old storage, and when you come back, changes
made on the older build are merged in, not lost.

**Builds 71 to 73:** the programme engine, the coach's brain and backups move into Swift (backups keep the
same files in the Supero folder). From 73, a watch workout is saved even if you never open the phone app.

**Build 74:** the web page is removed. The app is fully native.

The watch, the widget and the rest timer keep working in every build.

**Rough timing.** Build 60 about four to five weeks after the chat redesign ships; no web screens after
roughly eight to nine months; fully native after roughly fifteen months, most of it spent moving the app's
rules into Swift.
