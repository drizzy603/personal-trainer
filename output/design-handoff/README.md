# Supero design handoff

This folder is a design-only implementation package. It does not modify Supero's app code.

## Start here

- `../pdf/Supero-Consumer-Design-Handoff.pdf` - polished visual handoff deck.
- `CLAUDE-DESIGN-BRIEF.md` - implementation instructions and acceptance criteria for Claude Design.
- `mockups.html` - inspectable standalone screen comps.
- `supero-design-tokens.json` - colors, typography, spacing, shape, motion, and semantics.
- `screens/` - rendered screen references for visual comparison.

## Intended workflow

1. Give Claude Design the PDF and this folder.
2. Ask Claude to read the brief and tokens before editing the app.
3. Implement the shared visual primitives first.
4. Update the core workout loop before secondary screens.
5. Preserve all product behavior and repository safety rules described in the brief.

The original `Design.pdf` is background context. This package is the newer source of truth.
