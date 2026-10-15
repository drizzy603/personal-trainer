# FPCore fixtures

Golden inputs for `swift test` (FPCoreTests). The test target copies this folder as a resource.

| Folder | What | Made by |
|---|---|---|
| `draft/putback.json` | The one draft-merge rule (contract 4.2): composer and words in, the composer after. CoachStoreTests runs every case through `CoachStore.mergeDraft` (putBack and a page draft); the page's specs through its `screens.off {screen:'coach', draft}` handler. No FPCore test reads it | by hand (N4); a rule change edits this file first, then both sides |
| `blocks/page-grammar.json` | Message bodies (contract v1 block models) for texts that use every part of the coach's grammar, each with the structure the page draws for it | `node ios/App/FPKit/Tools/blocks-fixtures.js <page> '<label>'`: the page's own `md()`, `_mdInline()` and `_coachBlocksHTML()`, from chatui/ui 02d710e |
| `coachHome/{forward-compat,lone-surrogates,minimal}.json` | Coach home models v1 (contract 6.2) no page sends: a newer page's additions (a route, a row action, an icon, a token group; a row with no title, an emptied group, an unreadable colour), an older page that skipped `_nativeJSON` (half emojis in the greet, the title and a preview), the bare minimum | `node ios/App/FPKit/Tools/coach-home-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures`: by hand, the palette from the page's THEMES, the hub's sizes from contract 6.2 |
| `coach/{heavyweight-chat,lime-chat,intake,empty,errors,loading,sixty}.json` | Coach models v1 the page builds itself (`_coachModel`, plan task C3): both rooms, setup, the empty chat, errors and stops (offline), a reply in flight, 60 messages | `node tests/golden/dump-coach.js` (the page in Chromium on the test seed, UTC, a fixed clock, ids/boot/revs fixed); `tests/golden/check.sh` fails on drift |
| `coach/{forward-compat,lone-surrogates,minimal}.json` | What no page sends: a newer page's additions, an older page that skipped `_nativeJSON` (half emojis), the bare minimum | `node ios/App/FPKit/Tools/coach-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures`: by hand, bodies from `blocks/`, the palette from the page's THEMES |
| `shell/page-messages.json` | One call of every TrovoShell method, all 14 of contract 3.1 (hello, bootDone, present, dismiss, model, toast, confirm, log, status, reset, visibility, selectTab, sheets, setSwitch; `status` also with `refresh: true`) with the options the page sends | by hand, from decision.md section 6, chatui's toasts and confirms, and build 61's contract 3.1-3.5 and 3.10 |
| `policy/good`, `policy/bad` | Policy files (S7): what reads, and what changes nothing. `good/default.json` is the file to publish as `policy.json` beside build.txt | by hand |
| `tabs/{forward-compat,lone-surrogates,minimal}.json` | Tabs models v1 (contract 6.1) no page sends: a newer page's additions (a badge, an unknown id, items out of order, an unreadable colour), an older page that skipped `_nativeJSON` (half emojis), the bare minimum. The page-built `tabs/{heavyweight,lime}.json` come from `tests/golden/dump-coach-home.js` (P6) | `node ios/App/FPKit/Tools/tabs-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures`: by hand, colours from the page's THEMES, titles and labels from its `<nav id="tabs">` |

Rules:
- Every JSON fixture is what the page hands Swift: built through `_nativeJSON`, so no lone surrogate,
  except files whose name says they carry one on purpose (`coach/lone-surrogates.json`).
- The page-built coach models are the page's (plan task C3): regenerate them with
  `node tests/golden/dump-coach.js` whenever `_coachModel` changes; `tests/golden/check.sh` (and spec
  118) fail on drift, and CoachModelTests reads their values.
- Regenerate `blocks/page-grammar.json` (then `coach/`) whenever the page's chat grammar changes
  (md(), the `%%` markers); BlocksTests fails if the page draws something the fixtures do not cover.
- `policy/good/m2-before-upload.json` and `policy/good/m2-on.json` are byte for byte the two `policy.json` files
  build 61's rollout publishes (contract 10.6); `policy/bad/tabs-maybe.json` and `policy/bad/coachHome-maybe.json`
  hold values build 61 cannot read for its pieces. PolicyTests reads all four.
