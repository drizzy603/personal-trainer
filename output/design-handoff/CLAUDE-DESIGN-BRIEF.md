# Supero consumer design implementation brief

## Assignment

Implement the design package in the existing Supero app after the owner explicitly asks you to begin coding. Until then, treat every file in this folder as a design specification only.

The intended result is a premium consumer fitness app that feels focused during training and calm between sessions. Preserve Supero's bold editorial character, but improve clarity, warmth, accessibility, and one-handed usability.

Read these handoff files before implementation:

1. `../pdf/Supero-Consumer-Design-Handoff.pdf` - visual source of truth.
2. `mockups.html` - inspectable high-fidelity screen compositions.
3. `screens/` - rendered reference images for the key states.
4. `supero-design-tokens.json` - exact visual and motion values.

The older `Design.pdf` is context only. When it conflicts with this package, this package wins.

## Product promise

Supero should answer three questions immediately on every screen:

1. Where am I?
2. What matters now?
3. What should I do next?

The visual language is "editorial performance": confident typography, warm neutral surfaces, one electric action color, restrained outcome highlights, and almost no decorative chrome.

## Non-negotiable implementation boundaries

- Preserve the four-tab information architecture: Log, Progress, Coach, Settings.
- Preserve all existing data behavior and `localStorage` keys.
- Do not introduce accounts, a server, analytics, or new external services.
- Do not replace or remove the AI Coach intake, persistent history, routine editing, image input, or non-streaming Anthropic request behavior.
- Preserve the empty-state behavior when no AI-generated programme exists.
- Preserve Apple Health import behavior in the iOS shell, including deduplication and read-only access.
- Preserve dynamic user naming from the AI-generated routine. Any names shown in mockups are illustrative content only.
- Do not remove the iOS keyboard scroll-offset guard in the boot section of `index.html`.
- Do not rename public functions or inline event handlers unless every reference is migrated and verified.
- Do not change application copy in a way that creates medical claims. Pain, injury, dizziness, or concerning symptoms require a caution state and conservative guidance.

## Visual direction

### Personality

- Premium, athletic, direct, composed.
- Bold enough to feel motivating without looking aggressive.
- Consumer-friendly rather than dashboard-heavy.
- iOS-native in spacing and control behavior, with a distinct Supero voice.

### Color semantics

- Ink: primary content, structure, and most icons.
- Warm canvas: the app's default background.
- White: cards and interactive surfaces.
- Blue: primary action, current state, focus, and the current chart period.
- Lime: completion, progress, PRs, and positive outcomes only.
- Red: destructive actions, blocking errors, and pain/injury cautions only.

Do not use blue and lime as interchangeable accents. Do not use lime for routine CTAs. Do not rely on color alone for selection or status.

### Typography

- Use the condensed display face only for short screen titles and large training metrics.
- Use the system UI stack for all controls, paragraphs, labels, and data.
- Prefer sentence case for controls and section headings.
- Keep editable fields at 16 px or larger to prevent iOS zoom.
- Support Dynamic Type where the shell allows it. At larger text sizes, stack rows instead of truncating essential values.

### Shape and elevation

- Cards use a 22 px radius and quiet 1 px borders.
- Controls use 14 px radii; chips are full pills.
- Prefer separation through spacing and tone before adding shadows.
- Reserve the floating shadow for fixed action docks, sheets, and transient overlays.

## Screen requirements

### Today / Log home

- Lead with the next relevant action, not a dashboard grid.
- Keep the date strip compact and horizontally scannable.
- The workout card shows workout name, week context, duration, exercise count, training focus, and one primary Start workout action.
- Below the primary card, show only the most useful weekly progress signal and the next scheduled item.
- Preserve empty-state behavior when no programme exists. Replace the workout card with a calm explanation and a single Build my programme action that opens Coach.

### Workout overview

- Show training intent before the exercise list.
- Display exercise order, set/rep targets, and current working weight.
- Keep Start workout fixed near the bottom safe area.
- Long exercise names wrap; values do not overlap.

### Active set

- Keep exercise, set number, and elapsed session time in one compact header.
- Make load and reps the dominant editable values.
- Minus and plus controls must remain attached to the field they change, use at least 44 px targets, and state the increment.
- Show the prior set as a compact ledger row.
- Ask for RPE after the set is logged; do not make RPE compete with load and reps before completion.
- Keep Log set fixed above the safe area and keyboard.

### Rest

- The countdown is the dominant element.
- Keep the next exercise/load/reps visible without scrolling.
- Time adjustments are compact secondary controls.
- Ready now is the only high-emphasis action.
- Use lime only after rest completes or for the Set logged confirmation.

### Workout complete

- Celebrate without a noisy confetti takeover.
- Show duration, volume, and completed sets, then one evidence-based highlight such as a PR or load increase.
- Keep edit and notes available as low-emphasis actions.
- Done returns to Today and preserves the completed session.

### Progress

- Start with a plain-language finding tied to a named comparison period.
- Put metric and time-range controls before the chart.
- Historical bars/lines are neutral, the current period is blue, and a goal/PR is lime.
- Every chart needs units, accessible labels, and a text summary.
- Records rows open the relevant exercise history and indicate date and whether the value is estimated.

### Coach

- Use one quick-start mechanism. Prefer goal chips; remove duplicate suggestion lists.
- The composer remains persistent, respects the keyboard safe area, and supports image attachment.
- Explain that Coach uses the user's API key without overwhelming the primary flow.
- Pain, injury, dizziness, or alarming symptom prompts trigger a distinct caution surface before the answer.
- Programme changes show Before, After, Reason, and Affected sessions before application.
- Applied changes remain reversible through visible history and Restore previous programme.

### Programme

- Open on the current week, not an exercise-library index.
- Show day cards in schedule order with completion and Up next states.
- Exercise details and the library are drill-down views.
- Show when the programme was generated or last changed and by whom: Coach or user.

### Settings

- Group rows by intent: Preferences, Training plan, Connections, and Data + privacy.
- Connection rows show status, data scope, and last sync when available.
- Keep theme selection compact and previewable.
- Put reset/delete actions in a separated danger zone with confirmation and recovery language.

### Run log

- Keep distance, duration, and pace as the dominant fields.
- Use a single Save run action.
- Imported Apple Health entries state their source and remain read-only where appropriate.

## Required component set

- `AppHeader`: brand/context, screen title, optional single trailing action.
- `BottomNav`: four existing destinations, label plus icon, safe-area aware.
- `PrimaryButton`: blue, full-width only for screen completion or progression.
- `SecondaryButton`: white or transparent with a quiet outline.
- `StatusPill`: display-only; lime for completed/positive, blue-soft for current state, red-soft for caution.
- `MetricField`: label, large tabular value, unit, attached increment controls, validation state.
- `WorkoutCard`: workout context, intent, metadata, one primary action.
- `SetLedgerRow`: set, load, reps, RPE, completion state.
- `InsightCard`: one finding, one comparison, optional chart reference.
- `ChartCard`: title, value/period, accessible chart, text summary.
- `ConnectionRow`: service, state, scope, last sync, single disclosure action.
- `PlanChangeCard`: before/after diff, reason, affected sessions, apply/keep actions.
- `BottomActionDock`: fixed above safe area and keyboard, one primary action plus at most one quiet secondary action.

## Motion and feedback

- Tap feedback: 120 ms scale/opacity response.
- Standard state transitions: 220 ms.
- Sheets: 320 ms with a decelerating curve.
- Completion celebration: up to 520 ms, then still.
- Never loop decorative motion.
- Honor `prefers-reduced-motion` and disable non-essential transitions.
- Use haptics only for completed set, rest complete, PR, and destructive confirmation where native support exists.

## Accessibility acceptance criteria

- Minimum tap target is 44 by 44 px.
- Body and control text meets WCAG AA contrast.
- Selected and completed states use more than color.
- Every icon-only control has an accessible name.
- Charts have a concise text alternative with units and comparison period.
- Essential actions remain visible with the iOS keyboard open.
- Screen layouts work at the smallest supported iPhone width without horizontal scrolling.
- Large text reflows without hiding actions or values.
- Error copy says what happened and what the user can do next.

## Suggested implementation order

1. Add tokens and shared primitives without changing screen behavior.
2. Implement AppHeader, BottomNav, buttons, cards, fields, and the bottom action dock.
3. Restyle Today, Workout overview, Active set, Rest, and Complete as one verified core loop.
4. Restyle Progress and chart components.
5. Restyle Coach and programme-change states.
6. Restyle Programme, Settings, Data/privacy, and auxiliary logging sheets.
7. Audit empty, loading, error, offline, keyboard, and large-text states.
8. Run the repository safety checks, compare against the reference images, commit, and push.

## Repository safety requirements

- `index.html` is the entire web app. Keep changes deliberate and localized.
- Bump `<meta name="build">` in every commit that changes `index.html`.
- Run `./verify.sh` before every commit touching `index.html` or `sw.js`.
- Preserve all existing inline handler/function relationships.
- Commit and push each completed change as required by the repository instructions.
- Do not change the iOS entitlement or HealthKit implementation for a visual redesign.

## Definition of done

- The end-to-end workout loop matches the visual intent in the handoff PDF.
- No existing logging, Coach, routine, backup, import, or navigation behavior regresses.
- All primary actions are singular and visually unambiguous.
- Blue/lime/red semantics are consistent across every screen.
- The app remains usable one-handed, with the keyboard open, and at large text sizes.
- The design feels like one consumer product rather than a collection of independently styled panels.
