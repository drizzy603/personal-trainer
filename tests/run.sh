#!/bin/bash
# Supero JS regression tests. Installs Playwright on first run, then executes
# every spec in tests/specs/. Exit code is non-zero if any suite fails.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules/playwright ]; then
  echo "Installing Playwright (first run)…"
  npm install --no-fund --no-audit
fi
# No-op when the browser is already in ~/Library/Caches/ms-playwright.
npx playwright install chromium >/dev/null 2>&1 || true

# FP_SHELL_INERT=1 ./tests/run.sh: every native boot runs under build 60's shell flag with no native
# screen (window.__FP_SHELL {v:1, screens:[]} and a TrovoShell mock: tests/lib/harness.js opts.shell).
# The page must behave exactly as with no shell: per-spec results equal the classic run's.
if [ "${FP_SHELL_INERT:-}" = "1" ]; then echo "Shell: inert (the build 60 flag with no native screen on every native boot)"; export FP_SHELL_INERT; fi

fail=0
for spec in specs/*.spec.js; do
  echo "── $spec"
  node "$spec" || fail=1
done

if [ $fail -eq 0 ]; then echo "All suites passed."; else echo "FAILURES above."; fi
exit $fail
