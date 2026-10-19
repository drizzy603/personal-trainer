#!/bin/bash
# Publish the web app: fast-forward `main` to `next` and push.
#
# GitHub Pages serves `main`, and every installed app polls build.txt there at
# launch — so this IS the over-the-air release. It is deliberately narrow and
# refuses anything surprising:
#   - must be run from `next` with a clean tree and nothing unpushed
#   - `main` must be a strict ancestor of `next` (a pure fast-forward)
#   - the Playwright suite must be green (skip with --no-tests only if it just ran), and when the shell's
#     storage facade, the mock native store or the harness changed, the store matrix too (STORE=shadow)
#   - when the page's bridge to the native shell changed since main (an index.html line naming its flags, plugin,
#     intents, models or --fp-* variables: BRIDGE below) or the harness did, the inert modes too, each green:
#     FP_SHELL_INERT=1 (build 61's flag, no native screen up), then FP_SHELL_INERT=60 (build 60's)
# It never force-pushes and never touches the native shell or the App Store.
#
#   ./publish.sh            # test, merge, push, confirm the live stamp
#   ./publish.sh --no-tests # skip the suites (they were just run)
set -euo pipefail
cd "$(dirname "$0")"
# Each run below names its own mode: a STORE, FP_SHELL_INERT or SHARD left in this shell would change what it runs
# (SHARD=1/2 runs half the specs and still says All suites passed).
unset STORE FP_SHELL_INERT SHARD

RED=$'\e[31m'; GRN=$'\e[32m'; DIM=$'\e[2m'; OFF=$'\e[0m'
die(){ echo "${RED}publish: $1${OFF}"; exit 1; }

# The page's bridge to the native shell: a changed line of index.html that names one of these.
BRIDGE='^[+-].*(FP_NATIVE|FP_TAB|FP_SCREENS|FP_CONTRACT|_FP_INTENTS|FPScreens|__FP_SHELL|TrovoShell|_fp[A-Z][A-Za-z]*|_coachHomeModel|_tabsModel|_coachModel|fp-tabs|fp-hold|--fp-(bar-up|bar-h|safe-b|sheet-b|clear))'
# True when the inert modes must run: the harness changed since main, or the bridge did. When git cannot tell, they
# run. The diff is read whole before grep sees it: piped into grep -q under pipefail, a long diff whose first bridge
# line comes early reads as no change (grep stops reading, git dies of SIGPIPE and the pipe's status is 141).
bridge_changed(){
  local d rc=0
  git diff --quiet origin/main next -- tests/lib/harness.js || return 0
  d=$(git diff --no-color --no-ext-diff origin/main next -- index.html) || return 0
  LC_ALL=C grep -qE "$BRIDGE" <<<"$d" || rc=$?
  [ "$rc" -ne 1 ]                                  # 0: a bridge line changed; 2: grep failed, so they run
}

[ "$(git branch --show-current)" = "next" ] || die "run this from branch next (you are on $(git branch --show-current))"
[ -z "$(git status --porcelain)" ]            || die "working tree is not clean — commit first"
git fetch origin --quiet
[ "$(git rev-list --count origin/next..next)" = "0" ] || die "next has unpushed commits — push next first"
git merge-base --is-ancestor origin/main next || die "main has commits next does not — not a fast-forward; look before merging"

AHEAD=$(git rev-list --count origin/main..next)
[ "$AHEAD" != "0" ] || { echo "${GRN}publish: main is already level with next — nothing to do${OFF}"; exit 0; }

if [ "${1:-}" != "--no-tests" ]; then
  echo "${DIM}publish: running the suite…${OFF}"
  ./tests/run.sh >/tmp/publish-tests.log 2>&1 || { tail -20 /tmp/publish-tests.log; die "suite is red — not publishing"; }
  grep -q 'All suites passed' /tmp/publish-tests.log || die "suite did not report a pass — not publishing"
  # The store matrix is made of the facade the shell injects, the mock native store and the harness: when any of
  # them changed since main, run every spec through them as well.
  if ! git diff --quiet origin/main next -- ios/App/FPKit/Sources/FPStore/Resources/ktstore.js tests/lib/ktstore-mock.js tests/lib/harness.js; then
    echo "${DIM}publish: the storage facade, the mock store or the harness changed — running the suite with STORE=shadow…${OFF}"
    STORE=shadow ./tests/run.sh >/tmp/publish-tests-shadow.log 2>&1 || { tail -20 /tmp/publish-tests-shadow.log; die "the store matrix (STORE=shadow) is red — not publishing"; }
    grep -q 'All suites passed' /tmp/publish-tests-shadow.log || die "the store matrix did not report a pass — not publishing"
  fi
  # The inert modes: every native boot that names no shell under build 61's flag, then build 60's, with no native
  # screen up. Per-spec results must equal the classic run's, so each must be green.
  if bridge_changed; then
    echo "${DIM}publish: the page's native bridge or the harness changed — running the suite with FP_SHELL_INERT=1…${OFF}"
    FP_SHELL_INERT=1 ./tests/run.sh >/tmp/publish-tests-inert61.log 2>&1 || { tail -20 /tmp/publish-tests-inert61.log; die "the inert run (FP_SHELL_INERT=1, build 61's flag) is red — not publishing"; }
    grep -q 'All suites passed' /tmp/publish-tests-inert61.log || die "the inert run (FP_SHELL_INERT=1) did not report a pass — not publishing"
    echo "${DIM}publish: … and with FP_SHELL_INERT=60 (build 60's flag)…${OFF}"
    FP_SHELL_INERT=60 ./tests/run.sh >/tmp/publish-tests-inert60.log 2>&1 || { tail -20 /tmp/publish-tests-inert60.log; die "the inert run (FP_SHELL_INERT=60, build 60's flag) is red — not publishing"; }
    grep -q 'All suites passed' /tmp/publish-tests-inert60.log || die "the inert run (FP_SHELL_INERT=60) did not report a pass — not publishing"
  fi
fi

echo "${DIM}publish: fast-forwarding main by ${AHEAD} commit(s)…${OFF}"
git log --oneline origin/main..next | sed 's/^/  /'
git checkout main --quiet
git merge next --ff-only --quiet
git push origin main --quiet
git checkout next --quiet

STAMP=$(cat build.txt)
echo "${DIM}publish: waiting for GitHub Pages to serve ${STAMP}…${OFF}"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  LIVE=$(curl -s https://drizzy603.github.io/personal-trainer/build.txt | head -1)
  [ "$LIVE" = "$STAMP" ] && { echo "${GRN}publish: live — build.txt serves ${LIVE}${OFF}"; exit 0; }
  sleep 10
done
echo "${RED}publish: pushed, but Pages still serves ${LIVE} after 2 min — it usually catches up within a few minutes${OFF}"
