#!/bin/bash
# Supero JS regression tests. Installs Playwright on first run, then executes
# every spec in tests/specs/. Exit code is non-zero if any suite fails.
#
#   ./tests/run.sh               the classic run: the page as the browser, the PWA and every shell before 60 run it
#   STORE=shadow ./tests/run.sh  the store matrix: every document starts as in a build 60 shell (the flag, the
#                                shipped facade ios/App/FPKit/Sources/FPStore/Resources/ktstore.js and the mock
#                                native store tests/lib/ktstore-mock.js), and each browser close checks the store,
#                                WebKit and the page's reads for drift. Per-spec results must equal the classic run's.
set -e
cd "$(dirname "$0")"

case "${STORE:-}" in
  ''|classic) STORE=''; echo "Store: classic (no shell, no facade)" ;;
  shadow) echo "Store: shadow (the build 60 facade over a mock native store)" ;;
  *) echo "STORE=$STORE is not a store mode (shadow, or nothing for the classic run)"; exit 2 ;;
esac
export STORE

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
