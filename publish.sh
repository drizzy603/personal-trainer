#!/bin/bash
# Publish the web app: fast-forward `main` to `next` and push.
#
# GitHub Pages serves `main`, and every installed app polls build.txt there at
# launch — so this IS the over-the-air release. It is deliberately narrow and
# refuses anything surprising:
#   - must be run from `next` with a clean tree and nothing unpushed
#   - `main` must be a strict ancestor of `next` (a pure fast-forward)
#   - the Playwright suite must be green (skip with --no-tests only if it just ran)
# It never force-pushes and never touches the native shell or the App Store.
#
#   ./publish.sh            # test, merge, push, confirm the live stamp
#   ./publish.sh --no-tests # skip the suite (it was just run)
set -euo pipefail
cd "$(dirname "$0")"

RED=$'\e[31m'; GRN=$'\e[32m'; DIM=$'\e[2m'; OFF=$'\e[0m'
die(){ echo "${RED}publish: $1${OFF}"; exit 1; }

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
fi

echo "${DIM}publish: fast-forwarding main by $AHEAD commit(s)…${OFF}"
git log --oneline origin/main..next | sed 's/^/  /'
git checkout main --quiet
git merge next --ff-only --quiet
git push origin main --quiet
git checkout next --quiet

STAMP=$(cat build.txt)
echo "${DIM}publish: waiting for GitHub Pages to serve $STAMP…${OFF}"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  LIVE=$(curl -s https://drizzy603.github.io/personal-trainer/build.txt | head -1)
  [ "$LIVE" = "$STAMP" ] && { echo "${GRN}publish: live — build.txt serves $LIVE${OFF}"; exit 0; }
  sleep 10
done
echo "${RED}publish: pushed, but Pages still serves $LIVE after 2 min — it usually catches up within a few minutes${OFF}"
