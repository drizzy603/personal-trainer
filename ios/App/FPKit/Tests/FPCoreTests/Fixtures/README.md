# FPCore fixtures

Golden inputs for `swift test` (FPCoreTests). The test target copies this folder as a resource.

| Folder | What | Made by |
|---|---|---|
| `draft/putback.json` | The one draft-merge rule (contract 4.2): composer and words in, the composer after. CoachStoreTests runs every case through `CoachStore.mergeDraft` (putBack and a page draft); the page's specs through its `screens.off {screen:'coach', draft}` handler. No FPCore test reads it | by hand (N4); a rule change edits this file first, then both sides |
| `blocks/page-grammar.json` | Message bodies (contract v1 block models) for texts that use every part of the coach's grammar, each with the structure the page draws for it | `node ios/App/FPKit/Tools/blocks-fixtures.js <page> '<label>'`: the page's own `md()`, `_mdInline()` and `_coachBlocksHTML()`, from chatui/ui 02d710e |
| `coach/{heavyweight-chat,lime-chat,intake,empty,errors,loading,sixty}.json` | Coach models v1 the page builds itself (`_coachModel`, plan task C3): both rooms, setup, the empty chat, errors and stops (offline), a reply in flight, 60 messages | `node tests/golden/dump-coach.js` (the page in Chromium on the test seed, UTC, a fixed clock, ids/boot/revs fixed); `tests/golden/check.sh` fails on drift |
| `coach/{forward-compat,lone-surrogates,minimal}.json` | What no page sends: a newer page's additions, an older page that skipped `_nativeJSON` (half emojis), the bare minimum | `node ios/App/FPKit/Tools/coach-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures`: by hand, bodies from `blocks/`, the palette from the page's THEMES |
| `shell/page-messages.json` | One call of every TrovoShell method (hello, bootDone, present, dismiss, model, toast, confirm, log) with the options the page sends | by hand, from decision.md section 6 and chatui's toasts and confirms |
| `policy/good`, `policy/bad` | Policy files (S7): what reads, and what changes nothing. `good/default.json` is the file to publish as `policy.json` beside build.txt | by hand |

Rules:
- Every JSON fixture is what the page hands Swift: built through `_nativeJSON`, so no lone surrogate,
  except files whose name says they carry one on purpose (`coach/lone-surrogates.json`).
- The page-built coach models are the page's (plan task C3): regenerate them with
  `node tests/golden/dump-coach.js` whenever `_coachModel` changes; `tests/golden/check.sh` (and spec
  118) fail on drift, and CoachModelTests reads their values.
- Regenerate `blocks/page-grammar.json` (then `coach/`) whenever the page's chat grammar changes
  (md(), the `%%` markers); BlocksTests fails if the page draws something the fixtures do not cover.
