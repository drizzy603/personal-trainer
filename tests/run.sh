#!/bin/bash
# Supero JS regression tests. Installs Playwright on first run, then executes
# every spec in tests/specs/. Exit code is non-zero if any suite fails.
#
#   ./tests/run.sh                   the classic run: the page as the browser, the PWA and every shell before 60 run it
#   STORE=shadow ./tests/run.sh      the store matrix: every document starts with build 60's storage (the store's flag
#                                    window.__ktStore, the shipped facade ios/App/FPKit/Sources/FPStore/Resources/ktstore.js
#                                    and the mock native store tests/lib/ktstore-mock.js), and each browser close checks
#                                    the store, WebKit and the page's reads for drift
#   FP_SHELL_INERT=1 ./tests/run.sh  the contract run: every native boot that names no shell runs under build 60's shell
#                                    flag with no native screen (window.__FP_SHELL {v:1, screens:[]} and a TrovoShell
#                                    mock: tests/lib/harness.js opts.shell)
#   STORE=shadow FP_SHELL_INERT=1 ./tests/run.sh
#                                    both at once: build 60 with no native screen up (the native copy in shadow under
#                                    the shell's flag and TrovoShell)
# Per-spec results in every mode must equal the classic run's.
set -e
cd "$(dirname "$0")"

case "${STORE:-}" in
  ''|classic) STORE=''; echo "Store: classic (no facade)" ;;
  shadow) echo "Store: shadow (the build 60 facade over a mock native store)" ;;
  *) echo "STORE=$STORE is not a store mode (shadow, or nothing for the classic run)"; exit 2 ;;
esac
export STORE
case "${FP_SHELL_INERT:-}" in
  ''|0) FP_SHELL_INERT=''; echo "Shell: none, unless a spec names one (no flag)" ;;
  1) echo "Shell: inert (the build 60 flag with no native screen on every native boot)" ;;
  *) echo "FP_SHELL_INERT=$FP_SHELL_INERT is not a shell mode (1, or nothing for no flag)"; exit 2 ;;
esac
export FP_SHELL_INERT

if [ ! -d node_modules/playwright ]; then
  echo "Installing Playwright (first run)…"
  npm install --no-fund --no-audit
fi
# No-op when the browser is already in ~/Library/Caches/ms-playwright.
npx playwright install chromium >/dev/null 2>&1 || true

fail=0
for spec in specs/*.spec.js; do
  echo "── $spec"
  node "$spec" || fail=1
done

if [ $fail -eq 0 ]; then echo "All suites passed."; else echo "FAILURES above."; fi
exit $fail
