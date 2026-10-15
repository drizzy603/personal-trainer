#!/bin/bash
# Supero JS regression tests. Installs Playwright on first run, then executes
# every spec in tests/specs/. Exit code is non-zero if any suite fails.
#
#   ./tests/run.sh                   the classic run: the page as the browser, the PWA and every shell before 60 run it
#   STORE=shadow ./tests/run.sh      the store matrix: every document starts with build 60's storage (the store's flag
#                                    window.__ktStore, the shipped facade ios/App/FPKit/Sources/FPStore/Resources/ktstore.js
#                                    and the mock native store tests/lib/ktstore-mock.js), and each browser close checks
#                                    the store, WebKit and the page's reads for drift
#   FP_SHELL_INERT=1 ./tests/run.sh  the contract run: every native boot that names no shell runs under build 61's shell
#                                    flag with no native screen ('inert61': window.__FP_SHELL {v:1, screens:[], binary:
#                                    [coach, coachHome, tabs]} and a TrovoShell mock: tests/lib/harness.js opts.shell)
#   STORE=shadow FP_SHELL_INERT=1 ./tests/run.sh
#                                    both at once: build 61 with no native screen up (the native copy in shadow under
#                                    the shell's flag and TrovoShell)
#   FP_SHELL_INERT=60 ./tests/run.sh build 60's flag with no native screen ('inert'), while a build 60 can be installed
# Those are the five modes. Per-spec results in every mode must equal the classic run's.
# With FP_SHELL_INERT set, a spec marked `// fp-spec: self-shelled` in its first five lines is skipped: it names its
# shell on every native boot (the harness enforces it), so its classic and shadow runs already cover the inert modes.
#   SHARD=i/n ./tests/run.sh         runs the i-th of every n specs of the sorted list (round robin), for CI's shards
#   ./tests/run.sh --list            prints what the run would run (the skip and the shard applied), one specs/<file> a
#                                    line, and exits 0
set -e
cd "$(dirname "$0")"

list=0
for a in "$@"; do
  case "$a" in
    --list) list=1 ;;
    *) echo "unknown argument $a (--list)"; exit 2 ;;
  esac
done
say() { [ $list -eq 1 ] || echo "$@"; }

case "${STORE:-}" in
  ''|classic) STORE=''; say "Store: classic (no facade)" ;;
  shadow) say "Store: shadow (the build 60 facade over a mock native store)" ;;
  *) echo "STORE=$STORE is not a store mode (shadow, or nothing for the classic run)"; exit 2 ;;
esac
export STORE
case "${FP_SHELL_INERT:-}" in
  ''|0) FP_SHELL_INERT=''; say "Shell: none, unless a spec names one (no flag)" ;;
  1) say "Shell: inert61 (the build 61 flag with no native screen on every native boot)" ;;
  60) say "Shell: inert (the build 60 flag with no native screen on every native boot)" ;;
  *) echo "FP_SHELL_INERT=$FP_SHELL_INERT is not a shell mode (1, 60, or nothing for no flag)"; exit 2 ;;
esac
export FP_SHELL_INERT
shard_i=1; shard_n=1
if [ -n "${SHARD:-}" ]; then
  if [[ "$SHARD" =~ ^([0-9]+)/([0-9]+)$ ]] && [ "${BASH_REMATCH[2]}" -ge 1 ] && [ "${BASH_REMATCH[1]}" -ge 1 ] \
     && [ "${BASH_REMATCH[1]}" -le "${BASH_REMATCH[2]}" ]; then
    shard_i=${BASH_REMATCH[1]}; shard_n=${BASH_REMATCH[2]}; say "Shard: $shard_i of $shard_n"
  else
    echo "SHARD=$SHARD is not a shard (i/n with 1 <= i <= n)"; exit 2
  fi
fi

# The specs this run takes: the sorted list, the shard's share, less the self-shelled ones in an inert mode.
specs=()
k=0
while IFS= read -r spec; do
  k=$((k + 1))
  [ $(( (k - 1) % shard_n )) -eq $((shard_i - 1)) ] || continue
  if [ -n "$FP_SHELL_INERT" ] && head -5 "$spec" | grep -q 'fp-spec: self-shelled'; then
    say "── $spec skipped: names its own shells (its classic and shadow runs cover this mode)"
    continue
  fi
  specs+=("$spec")
done < <(ls specs/*.spec.js | LC_ALL=C sort)
if [ $list -eq 1 ]; then
  for spec in "${specs[@]}"; do echo "$spec"; done
  exit 0
fi

if [ ! -d node_modules/playwright ]; then
  echo "Installing Playwright (first run)…"
  npm install --no-fund --no-audit
fi
# No-op when the browser is already in ~/Library/Caches/ms-playwright.
npx playwright install chromium >/dev/null 2>&1 || true

fail=0
for spec in "${specs[@]}"; do
  echo "── $spec"
  node "$spec" || fail=1
done

if [ $fail -eq 0 ]; then echo "All suites passed."; else echo "FAILURES above."; fi
exit $fail
