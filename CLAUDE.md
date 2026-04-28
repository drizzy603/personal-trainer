# Trovo App

A single-file progressive training app with an AI coach. No framework, no build step.

## Files
- `index.html` — the entire app (HTML + CSS + JS in one file, including the inlined "How It Works" overlay opened from Settings)
- `sw.js` — service worker for offline/PWA support
- `manifest.json` — PWA manifest

## Deployment
- GitHub repo: `drizzy603/personal-trainer`
- Live at: `https://drizzy603.github.io/personal-trainer/`
- GitHub Pages serves directly from `main` branch, root folder
- No build step — pushing to `main` deploys automatically

## Rules
- **Always commit and push after every change.** Do not wait to be asked.
- Never commit `.DS_Store` or other system files (already in `.gitignore`)
- Keep `.gitignore` clean — only `.vercel` and `.DS_Store` should be ignored

## App overview
- Four tabs: Log, Progress, Coach, Settings
- All data stored in browser `localStorage` — no server, no accounts
- AI Coach uses the Anthropic API (user supplies their own key in Settings)
- Coach supports: streaming responses, persistent chat history, intake flow to build a custom programme, smart suggestion cards
- Programme is AI-generated per user via an intake assessment — until generated, the Log tab shows an empty-state CTA pointing to the Coach
- Log tab reads exercises from `kt_routine` via `getSessionExercises()` / `getWkData()`. There is no built-in fallback programme.
- User name is dynamic (pulled from their AI-generated routine) — no hardcoded names anywhere

## Key localStorage keys
- `kt_sessions` — logged gym sessions
- `kt_runs` — run logs
- `kt_weights` — bodyweight entries
- `kt_prs` — personal records
- `kt_week` — current week number
- `kt_routine` — AI-generated programme (includes user name)
- `kt_apikey` — Anthropic API key
- `kt_theme` — selected theme
