# FPCore fixtures

Golden inputs for `swift test` (FPCoreTests). The test target copies this folder as a resource.

| Folder | What | Made by |
|---|---|---|
| `blocks/page-grammar.json` | Message bodies (contract v1 block models) for texts that use every part of the coach's grammar, each with the structure the page draws for it | `node ios/App/FPKit/Tools/blocks-fixtures.js <page> '<label>'`: the page's own `md()`, `_mdInline()` and `_coachBlocksHTML()`, from chatui/ui 02d710e |

Rules:
- Every JSON fixture is what the page hands Swift: built through `_nativeJSON`, so no lone surrogate,
  except files whose name says they carry one on purpose.
- When plan task C3 lands, `tests/golden/dump-coach.js` and `check.sh` write page-built coach models
  here, and the hand-written ones give way to them; `check.sh` fails on drift.
- Regenerate `blocks/page-grammar.json` whenever the page's chat grammar changes (md(), the `%%`
  markers); BlocksTests fails if the page draws something the fixtures do not cover.
