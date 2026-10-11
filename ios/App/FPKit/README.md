# FPKit

The native half of Fitness Programmer's move from the Capacitor web view to SwiftUI, one screen at a time.
The approved plan for going native (decision.md, section 4 "Where the code lives") puts the native code in
this local Swift package. The page (`index.html`) stays the engine: it keeps every rule and every write
until each one is ported, and FPKit grows around it. Build 60 brings the first two pieces: a native copy of
the owner's data that follows WebKit and never writes it (FPStore, in shadow), and the native Coach chat.

**Status.** The package skeleton (plan task S1, package part) gave each target a placeholder,
`<Target>Module.swift`, naming the module (a ready category for its log lines under the app's
`app.kt.trainer` subsystem); later tasks add their files beside them. FPStore holds the native store
(plan task S2, see [FPStore](#fpstore-the-native-store) below). Not wired into the app yet: the package
reference and product dependencies in `App.xcodeproj`, the App target's iOS 17 deployment target and the
CI job are the rest of S1.

## Targets

| Target | Builds on | Runs on | Will hold (plan tasks) |
|---|---|---|---|
| FPCore | Foundation only | iOS, macOS | The shell contract and its negotiation, lone-surrogate mending, the coach model and its tokens, blocks, intents, the link state, breakers and crash-marker policy (C4); the policy file's state (S7) |
| FPStore | FPCore, the system SQLite3 | iOS, macOS | KTStore: every `kt_*` value in exact UTF-16, the wire codec, the seven-rule reconcile (observe only in build 60), the journal, snaps and Put back (S2); the shadow facade `Resources/ktstore.js` (S3) |
| FPHost | FPCore, FPStore, WebKit | iOS only | StoreAttach and KTUIProxy (S5), crash markers, the policy fetch (S7) |
| FPUI | FPCore, SwiftUI | iOS only | ScreenHost, PageLink and the slide transition (C5), room themes, fonts and the Coach views (C6, C7) |

Test targets: FPCoreTests and FPStoreTests, run by `swift test` on the Mac. FPHost and FPUI get theirs with
the tasks that fill them, run by `xcodebuild test` on an iOS simulator.

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
  back in turn.

The reconcile at every document start decides from the `kt_last_open` witness. Every outcome but rule 3
leaves kv equal to WebKit:

| # | Situation | The store |
|---|---|---|
| 1 | store unreadable, or `minReader` above this build | attaches nothing |
| 2 | WebKit unreadable (`hello nowk`) | facade off; reconciles nothing |
| 3 | no witness in WebKit, WebKit near-empty, the store holds a full set | snapshot first, adopt nothing, offer Put back of the snapshot |
| 4 | witness neither in the store's history nor vouched for by the gap note | an older or facade-less build ran: adopt every difference, deletions included (conflicts "older build"); nothing refilled |
| 5 | witness known; the gap note names a missed op on the key (or a missed clear), and the store took no write of the key after it | the store missed that write: adopt |
| 6 | witness known; WebKit's whole manifest equals the store's state at one journal seq (a key the store wrote after an op it missed is read from that op on) | WebKit lost a suffix: would-repair counted, newer values to conflicts ("lag"), adopt |
| 7 | anything else | adopt; conflicts "unexplained"; counted |

Tests (`Tests/FPStoreTests`): `WireTests` (the facade's literals, hashes, hello and gap notes from
`Vectors/vectors.json`, and the gap note op by op as the facade must write it, each missed op's stamp `s`
and a missed clear's `c` included), `ReconcileTests` (every S2 reconcile row through the protocol on a fake
device, and the classifier on its own), `StoreTests` (the file, answers, journal, snapshots, conflicts, Put
back, timing) and `KillTests` (a writer SIGKILLed mid-burst keeps every acknowledged write). KillTests starts
this test binary again through the `xctest` runner with `FPSTORE_KILL_DIR` set; in an ordinary run its child
test is skipped. The vectors come from JavaScript itself (the facade, plan task S3, must write its gap notes
as `noteAfter()` there does); after changing the facade's hash, literals or note:

```sh
node tests/tools/ktstore-vectors.js           # rewrite Vectors/vectors.json
node tests/tools/ktstore-vectors.js --check   # exit 1 if the committed file is stale
```

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

`.build` (SwiftPM's build folder, or the link to it) is ignored by the root `.gitignore`.
