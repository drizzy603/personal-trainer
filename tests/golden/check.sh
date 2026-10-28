#!/bin/bash
# The coach's golden checks (plan tasks C2 and C3; build 61's P6); exit 1 on any drift.
#
#   tests/golden/check.sh              the coach's HTML, the page-built models, and FPCore decoding them
#   SKIP_SWIFT=1 tests/golden/check.sh the page's checks only (no Swift toolchain)
#
# 1. coach-html.js: md(), the %% blocks, PLAN CHANGES, pills, whole chats, and the Coach hub and connect
#    screen draw what the page drew before they were rebuilt on models (coach-html.json).
# 2. dump-coach.js --check: the coach models the page builds now equal FPCore's fixtures
#    (ios/App/FPKit/Tests/FPCoreTests/Fixtures/coach); `node tests/golden/dump-coach.js` rewrites them.
# 3. dump-coach-home.js --check: the Coach home and tab bar models equal Fixtures/{coachHome,tabs}'s
#    page-built files (`node tests/golden/dump-coach-home.js` rewrites them), and the chat built under the
#    tabs shell equals Fixtures/coach (one CoachModel whichever host draws it).
# 4. swift test: CoachModelTests, BlocksTests, CoachHomeModelTests and TabsModelTests decode every fixture
#    with FPCore.
set -e
cd "$(dirname "$0")/../.."
if [ ! -d tests/node_modules/playwright ]; then (cd tests && npm install --no-fund --no-audit); fi
node tests/golden/coach-html.js
node tests/golden/dump-coach.js --check
node tests/golden/dump-coach-home.js --check
if [ "${SKIP_SWIFT:-}" = "1" ] || ! command -v swift >/dev/null 2>&1; then echo "swift: skipped"; exit 0; fi
flags=()
# Inside iCloud Drive SwiftPM cannot sign the test bundle unless .build lives outside it (FPKit README).
case "$PWD" in
  *"/Documents/"*|*"Mobile Documents"*) [ -L ios/App/FPKit/.build ] || flags+=(--disable-get-task-allow-entitlement) ;;
esac
swift test --package-path ios/App/FPKit --filter 'CoachModelTests|BlocksTests|CoachHomeModelTests|TabsModelTests' ${flags[@]+"${flags[@]}"}
echo "golden: the coach's HTML, the page's models and FPCore agree"
