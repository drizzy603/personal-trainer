# Supero regression tests

Playwright suites that boot `index.html` in headless Chromium against the demo
seed (`seed-dump.json`, generated from `screenshots/seed-demo.js`) and drive the
app through its JS globals. `lib/harness.js` serves the repo over local HTTP,
seeds localStorage before boot, and can mock the Capacitor bridge (`native:
true`) so watch/widget code paths run as they do inside the iOS shell. All
network traffic is blocked except the local server.

Run everything:

```sh
./tests/run.sh
```

First run installs Playwright into `tests/node_modules` (gitignored). Suites:

- `01-boot` — boot smoke, all four tabs render, no page errors, voice logging stays removed
- `02-runner` — engage a Push session, log a set, finish, entry lands in `kt_sessions`
- `03-watch-sync` — wrist sessions drain into the log; double-log guard in both directions
- `04-progress` — Progress tab charts, week dots, and history render
- `05-sheets` — all six overlay sheets mount on the shared R2 shell (surface, scrim, ✕, grabber)
- `06-today-slots` — Today slot system: one banner, chip promotion, dismissal drops chips
- `07-themes-visuals` — theme-room tokens, share-card draw path, editorial empty states

Run these before any commit that touches app logic in `index.html` (verify.sh
covers syntax; these cover behavior).

## The store matrix

```sh
STORE=shadow ./tests/run.sh
```

runs every spec as a build 60 shell runs the page: each document starts with the
flag `window.__ktStore`, `lib/ktstore-mock.js` (a JavaScript reference of FPStore's
native side, kept in sessionStorage so it survives a reload) answering the KT1
prompt channel, and the shipped facade
`ios/App/FPKit/Sources/FPStore/Resources/ktstore.js`, all before the seed and the
page. Every write goes to WebKit first and is mirrored to the mock store; each
`app.close()` checks that the store, WebKit and the page's reads hold the same
values (a difference fails the spec as `store drift`). Per-spec results must equal
the classic run's. CI runs it as its own mode (beside classic, the two inert modes and
shadow + inert61, each in two shards: `.github/workflows/tests.yml`); `publish.sh`
adds the shadow run when the facade, the mock or the harness changed, and the two
inert runs when the page's bridge to the shell or the harness changed.

`boot({store: 'shadow'})` turns it on for one boot whatever STORE says
(`store: 'classic'` turns it off). Specs 119 and 120 drive the mock through
`window.__ktMock`: `device({shell:false})` is a store-less build from the next
document on, `device({seed:false})` stops the harness re-seeding WebKit at each
load (a real relaunch does not), `next({wipe | restore | plant | unreadable})`
changes WebKit behind the facade at the next document start, `fail({...})` makes
the store answer full, busy, err or nothing, and `status()`, `values()`,
`conflicts()`, `stagePutBack()` read and act as Settings › About › Storage will
(`status(true)` with the losses still open, as the shell's Storage reads it).
Spec 120 also runs the page's own Storage sheet over the mock (a TrovoStore
plugin in front of `__ktMock`): a finish WebKit lost goes back in one Put back.

Spec 121 covers the page's side of Storage with a mocked TrovoStore plugin: the
row only with the shell's flag (`window.__FP_SHELL`) and the plugin, the sheet's
counts and actions (Put back after a preview, one Put back for everything a start
lost, Remove for a value kept as none, the Native copy switch, Export a copy, the
TestFlight-only test quit), `bootDone` and the OTA confirm at the end of boot
(also when the first render is the coach route), and the tools'
`dev.nav`/`dev.theme` in the flag.

## The shell contracts

```sh
./tests/run.sh; STORE=shadow ./tests/run.sh; FP_SHELL_INERT=1 ./tests/run.sh
STORE=shadow FP_SHELL_INERT=1 ./tests/run.sh; FP_SHELL_INERT=60 ./tests/run.sh   # the five modes
SHARD=1/2 ./tests/run.sh; SHARD=2/2 ./tests/run.sh                              # any mode in two halves
./tests/run.sh --list                                                           # what a run would run
```

Shell contracts (plan tasks C3 and P1): `boot({shell})` runs a boot under one contract an installable
shell speaks. Build 60's, byte for byte (a build 60 phone keeps getting OTA pages): `'none'` (no flag,
every shell up to 59 and the PWA; the default), `'inert'` (60's `window.__FP_SHELL` with no native
screen on: its binary has the chat, which the policy file keeps off, so Settings › About shows the row
saying so) and `'coach'` (60's native Coach chat). Build 61's, each `JSON.parse` of contract 2.1's
canonical string (the strings FPCore's ContractTests hold): `'inert61'` (classic root, nothing native),
`'coach61'` (classic root, 60's overlay chat), `'tabs'` (tab root, everything on) and `'tabsWeb'` (tab
root, the native Coach tab off). A flag object works too. `SHELL_METHODS` (exported) is what each
binary registers on TrovoShell: `'60'` the 11 of today, `'61'` contract 3.1's 14 (its first 11 are
60's); a flag whose `binary` names `tabs` gets the 61 list, any other the 60 list, and
`opts.shellMethods` overrides either (a 60 TrovoShell under a 61 flag).

**The five modes.** `FP_SHELL_INERT` runs every native boot that names no shell under an inert flag:
`1` is `'inert61'` (the newest installable one), `60` is build 60's `'inert'`; `''` or `0` none;
anything else exits 2. Classic, `STORE=shadow`, `FP_SHELL_INERT=1`, both at once and
`FP_SHELL_INERT=60` must give identical per-spec results; no mode runs the suite with tabs negotiated
(specs that measure the page's own bar would change), so tabs mode is held by specs that name their
shells. `SHARD=i/n` runs the i-th of every n specs of the sorted list (round robin, for CI's jobs);
`--list` prints the run's specs, the skip and the shard applied, and exits 0.

**Self-shelled specs.** A spec whose every native boot names its shell says `// fp-spec: self-shelled`
in its first five lines: `run.sh` skips it whenever `FP_SHELL_INERT` is set (printing why: its classic
and shadow runs cover those modes), and the harness throws on any native boot of it that names no
shell. A spec that builds its own flag or TrovoShell in `opts.init` (sets `window.__FP_SHELL`, a
TrovoShell or a TrovoStore itself, as 120 and 121 do) names `shell: 'none'`, so an inert run never
paints the harness's flag and mock over its own.

**The mock.** Under 60's flags it is the C3 mock: hello negotiates as FPCore does, `status` is a
spec's `window.__fpShellStatus` or the flag's binary screens on or off by the policy file, `reset`,
and every call recorded in `window.__fpShell` (`calls`, `of(name)`, `models()`, `call(name, args)`, a
spec's direct `FPScreens.call`; `refuse[name]` rejects a method with a spec's message). Under 61's
flags it models the shell (contract 2-4, 8, 10.3, 15.3):
- **The scene** outlives the document (sessionStorage `__fpShellMock`; a new browser is a new scene):
  `root` (`tabs` iff the scene's first flag has `tabs`), `fellBack` (`{why, at}`: `page`, `refused`,
  `no-hello`, `failures`, `policy`, `switch`), `selected`, `seq`, `rev`, `bar`, the Coach tab's mode
  (`waiting` until the scene's first `coachHome` declaration or 3 s after a hello with none, `native`,
  `web`), the pushed chat, the last `coachHome` model, `switches`, `declined`, `strays`, `policy`. A
  document in a fallen-back scene starts with no `tabs` in its flag. Per document: the sheets state
  (closed at every start), the negotiated set, covered.
- **The rules** are one self-contained function, `MOCK_RULES` (exported): the dependency rule, hello's
  negotiation with the fallback at hello and its declines, the bar's height per tab, Coach mode and
  sheets, the funnel's messages, the fallback's messages (none to a document that has not said hello:
  only its rule changes). The page's mock runs the same source. Spec 122 holds both to the shared
  tables the Swift tests read, `Fixtures/shell/negotiation.json` and `bar.json` (P13): every row in
  Node, and through the page's mock every row but the cascades whose event takes `coach` or
  `coachHome` on its own (their trip or withdrawal, three failed shell intents while they are live).
  The mock has no door for those (it keeps no breaker and withdraws nothing mid-document), so the spec
  names them on every run, pins them, and sends their `screens.off` to `index.html` itself. A decline
  the mock records before the document's hello (`dismiss tabs` first) carries no page build, since it
  learns the build at the hello (FPCore records the build it serves); the spec names that row too.
- **hello** answers `{v, screens, up?, why?, tabs?}`, then (next task) the resync: `shell.covered` for
  the selected tab's mode and the snapshots of what is up; never `tabs.select`. `selectTab` runs the
  funnel and answers `{tab, seq}` (`off`, `bad-tab`); `sheets` answers `{bar}` 16 ms later; `setSwitch`
  (`no-switch` but for `tabs`; off falls back `switch`); `present`/`dismiss` (`coachHome` declares the
  Coach tab, `coach` pushes, `dismiss tabs` falls back `page` with no `screens.off tabs`); `status` adds
  `root`, `fellBack`, `switches`, `policy`, `counters.strays`, `counters.leftAny` (always 0: the
  mock's web view never leaves its window) and `off` `os`/`device`/`page`/`needs`
  (each piece's own reason first, then what it needs as FPCore's `Pieces.resolve` names it);
  `status {refresh: true}` stamps the policy check. Refusals read `<code>: <words>`.
- **Shell to page** messages go through one FIFO queue, one at a time, never resent, each recorded in
  `__fpShell.sent` as `[name, args, answer, t0, t1]`. `__fpShell.composer` stands for the native
  composer's words: a shell-side `screens.off {screen:'coach'}` carries them as `draft`, cleared only
  by an answer with `took: true`.
- **Helpers**: `__fpShell.tap(tab)` (the owner's tap; a re-tap sends `again: true`),
  `select(tab, 'deepLink' | 'stray')`, `bar(h, safe)`, `fallBack(why, draft)`, `state()`.
- **Knobs** (`opts.init`): `__fpShellHelloSilent`, `__fpShellHelloDelay` (ms), `__fpShellPre {selected,
  seq}`, `__fpShellHelloTabs` (the reply's `tabs` replaced; `null` drops it), `__fpShellOff` (pieces off
  before this hello), `__fpShellBar {h, safe}`, `__fpShellThrow` (methods that throw synchronously),
  `__fpShellUp`, `__fpShellStatus`, `__fpShellCross` (a tap crosses the next `selectTab`),
  `__fpShellSheetsDelay`, `__fpShellSheetsSilent`, `__fpShellRefreshDelay`, `__fpShellIOS` (below 26:
  `tabs` off `os`).

**Boot options** for build 61: `opts.html` (another page text served as `/index.html`: a string or a
function of the page's own, such as an OTA switch or a page whose main script throws), `BASE_PAGE()`
(91708ae's `index.html` through `git show`, pinned for good: the page before the tabs half; CI checks
out with `fetch-depth: 0`), `opts.clock` (`{time}`: Playwright's clock installed before the page loads,
for the 16 s failsafe), `opts.shellMethods`, and `opts.pageErrors`: under a 61 flag `close()` throws
when the page threw, unless the boot passed `pageErrors: 'allow'` (an error only tabs mode throws could
stop a 61 phone's boot before the OTA confirm, and the breaker would reject the staged page for good).

**Both at once.** `STORE=shadow FP_SHELL_INERT=1 ./tests/run.sh` is build 61 with no native screen
up: every document starts with the native copy in shadow, and every native boot runs under the
shell's flag and TrovoShell with no screen negotiated. `boot({store: 'shadow', shell: 'inert61'})`
does the same for one boot (the store's scripts first, then the seed and the native mock,
`opts.init`, and the shell's flag and TrovoShell last). Spec 118 drives the bridge
(`window.FPScreens.call`); spec 122 holds the harness's own cases; `tests/golden/check.sh` holds the
chat's HTML, the page's coach models and FPCore's fixtures together.

## The native store on a simulator

```sh
./tests/native-store.sh               # build as build 61 at least, every scenario on iOS 26.x and 27.0
./tests/native-store.sh --downgrade   # also build 59 at its own commit: the 59 <-> 60 drill
```

runs the same facade in the real app: StoreAttach (FPHost) in the real Capacitor
shell, the real page and FPStore, on the iPhone of each runtime's first paired
iPhone + Watch. The app's Debug build takes each scenario's steps from launch
arguments (`-fpProbe`), so nothing writes WebKit's file behind the facade, and
`tools/native-store.py` reads WebKit's `localstorage.sqlite3` and the store's
`store.sqlite` itself to decide (migration, writes while hidden and in the
background, a WebContent kill, the SIGKILL sweep, WebKit unreadable or wiped and
Put back, the policy file, the store breaker, a crash marker, a scene reconnect,
an OTA page, Settings › About › Storage through the real TrovoStore plugin). It
reinstalls the app on that phone and leaves it with the scenario seed.

`../test-native.sh` (the "test it" flow) drives its routes with launch arguments
too (`-devNav <route>`, `-devTheme <room>`), builds as build 61 at least so the
native copy stays attached (a new store's minReader is 60), runs every route once
per room on one app container, and checks the native copy against WebKit's file
before the watch step.

The three tools (`native-store.sh`, `native-shell.sh`, `../test-native.sh`) hold
the paired simulators for the whole run: each takes `~/Library/Caches/FPKit/sim.lock`
first (`tools/simlock.sh`: it waits as long as a live holder holds, naming it every
10 minutes, and breaks a lock whose holder is gone, or one naming no holder once it
is 2 hours old; an agent's `fplock sim.lock` around a tool counts as the tool's
hold). Each then builds through `tools/fp-build.sh` into
`~/Library/Caches/FPKit/<checkout>/dd-<tool>` (`dd-store`, `dd-shell`, `dd-native`;
`<checkout>` is `main` or the worktree's folder name, never `/tmp`), checks the
scene rule on the built app (`tools/scene-plist.sh`) and writes `build-id.txt`
beside it: HEAD, the tree's state, the bundled page's stamp, the build number.
The one exception is `native-store.sh --downgrade`'s second app, build 59 built
at its own commit into `/tmp/supero-build59` by the script's own xcodebuild,
with no `build-id.txt` and no scene check: build 59 predates the rule (it still
names its storyboards).
`--no-build` runs that build only when it is this tree's and the page staged in
`ios/App/App/public` is the one it bundled, else exits 1 naming the difference;
`--no-build=any` runs it anyway, its identity first.

## The native screens on a simulator

```sh
./tests/native-shell.sh               # build as build 61 at least, every scenario on iOS 26.x
./tests/native-shell.sh --os 27 --only chat,wckill
```

runs the screen bridge (plan task C5: the TrovoShell plugin, FPUI's ShellBridge,
ScreenHost and PageLink) in the real app on the real page: the app's Debug build
takes each scenario's steps from launch arguments (`-fpShellProbe`), and
`tools/native-shell.py` decides from what it reports. `-fpSmoke` logging
`fp: ping ok v1`; the native chat presented `.overFullScreen` on the page's model,
with a message, the model switch, a forwarded confirm and Undo toast round-tripping
and Back; no `visibilitychange` while it is up; a focused web field (with the
simulator's software keyboard turned on for the scenario) and then present and
dismiss by the page, Back and the edge pan: no keyboard comes back and the document
is not scrolled; WebContent killed with the chat up: taken over by the new
document, resynced on its boot, nothing resent, the open confirm closed as stale;
a planted crash marker bringing back the web chat once; the policy file's
`screens.coach` "off"; the breaker; Settings › About keeping the Native Coach
chat row and saying why it is off in each case, and the owner's "Try the native
chat again" bringing it back at the next launch; the shell's counters (the web
view taken out of its window with the chat up). Spec 118 holds the page's half
(its C5 cases: the take-over after a reload, and the About row, its sheet,
TrovoShell `status`/`reset` and the `visibility` report on the mock).

These are build 60's scenarios. On an iOS 26+ phone whose app data turns nothing
off the scene takes the tab root, where only `smoke` holds: there the chat is
pushed in the Coach tab's stack rather than presented over the page, so `chat`
and every other scenario that puts the chat up need the classic root, which the
Native tab bar switch off gives (`{"tabs": false}` in the app container's
`Library/Application Support/FPShell/switches.json`), as does build 60's page
bundled (it declines `tabs`; FPKit README, "tests/native-shell.sh").

## The live native chat in test-native.sh

`../test-native.sh` drives the live chat (plan task C7) after its routes, through
`tools/native-chat.py` on the same phone and container: `-fpSmoke`'s ping; the
keyboard sequences (the simulator's software keyboard turned on for them: the
native composer on the keys, typed words in the chat's store, Back with the keys
up, the composer's words kept across a present and a relaunch, a web field's keys
gone when the chat covers it, a short chat's newest message in view as the keys
come up); a real coach turn from the native composer on
`tools/coach-stub.py`, a stand-in for Anthropic's Messages API on the Mac's
loopback (the Debug argument `-fpApiBase` hands it to the page as
`window.__FP_SHELL.dev.api`; spec 121 holds the page to taking only a loopback
origin): the echo, Thinking, the reply with a tool pill and PLAN CHANGES, Undo
through the forwarded confirm, Keep changes, Send and Stop while scrolled to the
top each bringing the end into view, a reader scrolled up keeping their place; then
`coach/chat` by launch argument in both rooms x `simctl ui appearance light|dark`
x `content_size large|extra-extra-large`; the app's Larger Text off keeping the empty composer at its Large
height. It puts back what it changed in the container and the
phone's settings. `python3 tools/coach-stub.py --script FILE` serves the stand-in
on its own (one JSON line per request).

On an iOS 26+ phone the launches (`-fpOffline`, no policy file) take the tab root
the same way, where `native-chat.py`, written for 60's chat over the page, fails,
and `../test-native.sh` exits 1 after the routes, the store check and the watch;
the classic root comes with the same `{"tabs": false}` switch file.

## The probe's self-test and the Release strings check

```sh
DD=$(tests/tools/fp-build.sh selftest)    # the Debug app, built as 61 at least
python3 tests/tools/probe-selftest.py --phone <paired iPhone, iOS 26 or 27> --app "$DD"/Build/Products/Debug-iphonesimulator/App.app
tests/tools/release-strings.sh <Release App.app> <Debug App.app>                 # a Release `build`
tests/tools/release-strings.sh --archive <App.xcarchive> <Debug App.app>        # an archive (stripped; its dSYM read)
```

`tools/probe-selftest.py` proves FPUI's ShellProbe (`-fpShellProbe`) before the
shell scenarios lean on it (plan task T15, contract 15.3): one launch per step on
the tab root (`tapTab`, `retapTab`, `stray`, `waitTab`, `press {where: hub}`,
`navPop`, `back`, `edgeBack`, `waitCoach`, `type` and `nativeFocus` into the
composer and the key field, the App's `openURL`, `openURLOnActive`, `share` and
`sceneCycle` hooks, `-fpOpenURL`, `sceneDestroy`, `blockPage` with its confirming
`ping`), each event's fields and types and each step's error form (a tab that is not
one, a bar a sheet hides, the shell's confirm over the bar and the hub); setup's
chat (Cancel, no control named Back); the classic root a device switch pins
({kind: classic}, every tab-root step an error); every state's reports
(`shell.root`, each screen's `host`, `leftWindowAny`, `input`, `replaced`, a key
window, the page's tabs-mode fields) and every event kind's fields (`funnel`,
`screenChanged` in contract 8.1's words, page messages with their receipt time,
`intent` records with no argument, `type`, `draft` and `share` with no field
beyond their own (lengths, never the words), `trovoOpen`, `ping`, `fellBack` in
contract 10.3's words); the shell's counters moving only where a step moves them; and a
canary (`sk-ant-test-` and 16 random characters) typed into the native key field
and saved by CONNECT, found in no probe log (each log read after the app ended).
The page's coach calls go to a closed loopback port (`-fpApiBase`), so the canary
never leaves the Mac. A phone holding a key that is not the probe's fails the
`typeKey` launch, which then types nothing: remove the key first. The run keeps what
the container holds (never the key's value), the shell's folder and its UserDefaults
copies (`fp.shell.switches`, `fp.shell.breakers`, `fp.shell.counters`, read through
the simulator's cfprefsd stopped first), turns a remembered decline of the tab bar
back on through About's Try again (the paired phones hold one for page build
20261012-2), and puts all of it back at the end, proven by one more launch that
reads it. It holds the paired simulators itself (`sim.lock`) unless its caller
does, and exits 1 naming every check that failed; `--no-install` runs only the app
the phone holds, which must be `--app` (else exit 2: install it first).
`tools/release-strings.sh` is RELEASE-STRINGS: each slice of a Release binary has
none of the Debug-only type names, long literals and members (by demangled symbol),
each first found in the same slice of the Debug build; and the two are tied together
(every Release slice carries build 61's shell types, both apps bundle the same page).
`--archive` reads the symbols from the archive's `dSYMs/App.app.dSYM` (its UUID
checked against the binary, slice by slice), since an archive's binary is stripped;
a simulator Debug build of the same commit will do (slices match by architecture).

## The glass bar, read from the app's pixels

```sh
DD=$(tests/tools/fp-build.sh glass)       # the Debug app, built as 61 at least
python3 tests/tools/tab-glass.py --phone <an iPhone 17 Pro or Pro Max simulator, iOS 26 or 27> --app "$DD"/Build/Products/Debug-iphonesimulator/App.app
```

`tools/tab-glass.py` reads the selected Coach tab under the native glass bar from
screenshots of the real app (plan task H9 fix-1, contract 6.1): the Coach tab's
WAITING ground (held for a launch by a staged page that never says hello), the
connect screen, the hub, the pushed chat with and without the page's toast, Coach
WEB (a policy file turning `screens.coachHome` off), and a round trip inside one
scene (the owner's Native Coach switch off and on again, as the page flips it):
Coach WEB over the hidden stack that still holds the hub, the hub again and the
chat pushed over it; all of it in each room and each phone appearance. The selected
item must stand 3:1 at least (`--min`) against its capsule and against the platter,
and a shot is read only when the probe's state just before it shows the screen it
claims. iOS 26.x draws the glass from what a scroll view under the bar shows and in
the phone's style where none lies there, iOS 27 in the bar container's style (FPUI
`TabBarLook`). FPKit's test host draws no window, so `TabBarGroundTests` holds what
26.x reads (the stack's ground under every Coach screen, out of the view tree in
WEB) and this tool what it draws: with the ground taken away (H9's code) the run
fails on iOS 26.5, Lime on a light phone at 1.36:1 and Heavyweight on a dark phone
at 1.04:1 on WAITING, the chat and the chat under a toast (as the run stood before
the round trip), and with the ground not put back after WEB (a scratch change) on
the chat pushed after the round trip alone, at the same two numbers. The platter's
numbers cover the iPhone 17 Pro's bar (402 x 83 pt, the runs here) and the Pro
Max's (440 x 83 pt, read in frames of both paired phones); a bar of another size
ends the run with exit 2: measure its platter and add it to `PLATTERS`. The run
replaces the app and its data on the phone (never point it at a phone whose data is
wanted; `--no-install` runs the app the phone holds, which must be `--app`), puts
the phone's appearance back, holds the paired simulators itself (`sim.lock`) unless
its caller does, and writes the frames, `sheet.png` and `results.json` to `--out`
(default `screenshots/out/tab-glass/<runtime>`). Exit 1 names every failed check; 2
is bad arguments, an OS below 26, a bar with no numbers, another app under
`--no-install`, or no Pillow. Nothing runs it on its own yet (wiring it into the
simulator tools waits for plan task T24, after build 61's TestFlight build). Until
then it is a gate by hand: run it on an iOS 26.5 and an iOS 27.0 simulator after a
change to the tab root, the Coach stack or the bar's look, and on the merged tree
before an archive.
