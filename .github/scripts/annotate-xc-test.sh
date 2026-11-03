#!/bin/bash
# Checks annotate-xc.sh on small logs shaped as xcodebuild and swift test print them: the kinds of line are copied
# from FPKit runs on a Mac (xcodebuild on iOS 26.5 and 27.0, swift test), with names and numbers made up; none of
# those runs crashed, so the crash lines (a Swift fatal error, xcodebuild's restart line, SwiftPM's exit line) are
# written in the forms those tools print. Exit 0 = every check passed, 1 = one failed.
# Usage: bash .github/scripts/annotate-xc-test.sh [SCRIPT]   (SCRIPT: the annotator to check, annotate-xc.sh by default)
here=$(cd "$(dirname "$0")" && pwd)
script=${1:-$here/annotate-xc.sh}
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
checks=0
failures=0
T=/Users/runner/work/personal-trainer/personal-trainer/ios/App/FPKit/Tests

# One case as xcodebuild prints it: started, then its failure lines (from line $4 of its file on), then its end.
started() { echo "Test Case '-[FPUITests.$1 $2]' started."; }
failing() {
  local i
  started "$1" "$2"
  for ((i = 0; i < $3; i++)); do
    echo "$T/FPUITests/$1.swift:$(($4 + i)): error: -[FPUITests.$1 $2] : XCTAssertTrue failed - check $((i + 1)) of $3"
  done
  echo "Test Case '-[FPUITests.$1 $2]' failed ($3.517 seconds)."
}
passing() { started "$1" "$2"; echo "Test Case '-[FPUITests.$1 $2]' passed (0.969 seconds)."; }
skipping() {
  started "$1" "$2"
  echo "$T/FPUITests/$1.swift:628: -[FPUITests.$1 $2] : Test skipped - needs a window scene"
  echo "Test Case '-[FPUITests.$1 $2]' skipped (0.607 seconds)."
}
# A run's end: the totals, then xcodebuild's list, which (Xcode 27) names a case once per failure line.
ending() {
  local e i
  echo "Test Suite 'Selected tests' failed at 2026-11-02 22:34:04.063."
  echo "	 Executed 11 tests, with 2 tests skipped and 37 failures (0 unexpected) in 781.296 (782.692) seconds"
  echo
  echo "Failing tests:"
  for e in "$@"; do for ((i = 0; i < ${e#*:}; i++)); do echo "	${e%:*}()"; done; done
  echo
  echo "** TEST FAILED **"
}

annotate() { # LOG...: the errors go to err, the notices to note as title|text
  bash "$script" "$@" > "$tmp/out"
  status=$?
  sed -n 's/^::error:://p' "$tmp/out" > "$tmp/err"
  sed -n 's/^::notice title=\([^:]*\)::/\1|/p' "$tmp/out" > "$tmp/note"
}
check() { # what, command...
  local what=$1
  shift
  checks=$((checks + 1))
  "$@" && return 0
  failures=$((failures + 1))
  echo "FAIL $what"
  head -12 "$tmp/out" | cut -c1-200 | sed 's/^/    /'
}
is() { [ "$1" = "$2" ]; }
errors() { grep -c . "$tmp/err"; }
error() { sed -n "$1p" "$tmp/err"; }
starts() { case $(error "$1") in "$2"*) return 0 ;; esac; return 1; }
noted() { grep -qxF -- "$1" "$tmp/note"; }
notes() { grep -c "^$1|" "$tmp/note"; }

# 1. One case's sixteen failure lines hide no other case (CI's run 40886265725 showed 3 of 7 failing cases).
{
  failing CoachHomeStoreTests testTheKeyField 1 1211
  passing CoachHomeStoreTests testAPassingCase
  failing CoachHomeStoreTests testTheRootInTheStack 2 1132
  skipping ScreenHostTests testTheEdgePan
  failing ScreenHostTests testStackAnOpUIKitHolds 16 1872
  failing ScreenHostTests testStackAPushCutIn 12 1736
  passing ScreenHostTests testAnotherPassingCase
  failing ScreenHostTests testStackAPushWhileAway 1 1823
  failing ScreenHostTests testStackAPushWhoseSlotLeaves 2 1452
  skipping ScreenHostTests testTheToastWindow
  failing ScreenHostTests testStackLeavingTheStack 3 2303
  ending CoachHomeStoreTests.testTheKeyField:1 CoachHomeStoreTests.testTheRootInTheStack:2 \
    ScreenHostTests.testStackAnOpUIKitHolds:16 ScreenHostTests.testStackAPushCutIn:12 \
    ScreenHostTests.testStackAPushWhileAway:1 ScreenHostTests.testStackAPushWhoseSlotLeaves:2 \
    ScreenHostTests.testStackLeavingTheStack:3
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "noisy case: exit 0" is "$status" 0
check "noisy case: ten errors" is "$(errors)" 10
n=0
for e in CoachHomeStoreTests:testTheKeyField:1211 CoachHomeStoreTests:testTheRootInTheStack:1132 \
  ScreenHostTests:testStackAnOpUIKitHolds:1872 ScreenHostTests:testStackAPushCutIn:1736 \
  ScreenHostTests:testStackAPushWhileAway:1823 ScreenHostTests:testStackAPushWhoseSlotLeaves:1452 \
  ScreenHostTests:testStackLeavingTheStack:2303 CoachHomeStoreTests:testTheRootInTheStack:1133 \
  ScreenHostTests:testStackAnOpUIKitHolds:1873 ScreenHostTests:testStackAnOpUIKitHolds:1874; do
  n=$((n + 1))
  IFS=: read -r c m l <<< "$e"
  check "noisy case: error $n is $c.$m's line $l (one per failed case first, then the rest in log order)" \
    starts $n "$T/FPUITests/$c.swift:$l: error: -[FPUITests.$c $m] : "
done
check "noisy case: the counts" noted "test counts|test.log: 11 tests ran, 7 failed (37 failure lines), 2 skipped"
check "noisy case: every failed case by name" noted "failed test cases|7 failed test cases, failure lines in brackets: \
CoachHomeStoreTests.testTheKeyField (1), CoachHomeStoreTests.testTheRootInTheStack (2), \
ScreenHostTests.testStackAnOpUIKitHolds (16), ScreenHostTests.testStackAPushCutIn (12), \
ScreenHostTests.testStackAPushWhileAway (1), ScreenHostTests.testStackAPushWhoseSlotLeaves (2), \
ScreenHostTests.testStackLeavingTheStack (3)"

# 2. More failed cases than errors: the first ten cases one line each, the notice names all twelve.
{
  for i in 01 02 03 04 05 06 07 08 09 10 11 12; do failing ScreenHostTests testCase$i 1 $((100 + 10#$i)); done
  ending
} > "$tmp/twelve.log"
annotate "$tmp/twelve.log"
check "twelve cases: ten errors" is "$(errors)" 10
for i in 1 2 3 4 5 6 7 8 9 10; do
  check "twelve cases: error $i is case $i" starts $i "$T/FPUITests/ScreenHostTests.swift:$((100 + i)): error: "
done
names=""
for i in 01 02 03 04 05 06 07 08 09 10 11 12; do names="$names${names:+, }ScreenHostTests.testCase$i (1)"; done
check "twelve cases: every one named" noted "failed test cases|12 failed test cases, failure lines in brackets: $names"

# 3. Sixty failed cases: three notices at most, none past 900 characters, the last saying how many more.
{
  for i in $(seq 1 60); do
    failing ScreenHostTests testAVeryLongCaseNameThatTakesRoomInTheNoticeNumber$i 1 $((300 + i))
  done
} > "$tmp/sixty.log"
annotate "$tmp/sixty.log"
check "sixty cases: three case notices" is "$(notes 'failed test cases')" 3
check "sixty cases: no notice past 900 characters" is "$(awk 'length($0) > 900' "$tmp/out" | grep -c .)" 0
check "sixty cases: the first says how many" is "$(grep -c '^failed test cases|60 failed test cases, ' "$tmp/note")" 1
check "sixty cases: the next two go on" is "$(grep -c '^failed test cases|(more) ' "$tmp/note")" 2
named=$(grep '^failed test cases|' "$tmp/note" | grep -o 'NoticeNumber[0-9]*' | tr -d 'A-Za-z' | tr '\n' ' ')
more=$(sed -n 's/.*, and \([0-9]*\) more (the log names them)$/\1/p' "$tmp/note")
check "sixty cases: the named ones in order, then the count of the rest" \
  is "$named+$more" "$(seq -s ' ' 1 $((60 - ${more:-60})) | sed 's/ *$/ /')+${more:-none}"

# 4. A build that fails: the compile errors in order (not the shorter copies under "Testing failed:").
{
  for i in $(seq 1 12); do echo "$T/FPUITests/ScreenHostTests.swift:$i:5: error: cannot find 'x$i' in scope"; done
  echo
  echo "Testing failed:"
  for i in $(seq 1 12); do echo "	Cannot find 'x$i' in scope"; done
  echo "	Testing cancelled because the build failed."
  echo
  echo "** TEST FAILED **"
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "build fails: ten errors" is "$(errors)" 10
for i in 1 2 3 4 5 6 7 8 9 10; do
  check "build fails: error $i is compile error $i" is "$(error $i)" \
    "$T/FPUITests/ScreenHostTests.swift:$i:5: error: cannot find 'x$i' in scope"
done
check "build fails: no test ran" noted "test counts|test.log: no test ran"
{
  for i in 1 2 3; do echo "$T/FPUITests/ScreenHostTests.swift:$i:5: error: cannot find 'x$i' in scope"; done
  echo "** BUILD FAILED **"
} > "$tmp/build.log"
annotate "$tmp/build.log" "$tmp/missing-test.log"
check "build step fails: its three errors" is "$(errors)" 3
check "build step fails: error 3 is the third" is "$(error 3)" "$T/FPUITests/ScreenHostTests.swift:3:5: error: cannot find 'x3' in scope"
check "build step fails: a build log has no counts" is "$(grep -c . "$tmp/note")" 0

# 5. The simulator never boots: no case, so the reasons under "Testing failed:" are the errors.
{
  echo "Testing failed:"
  echo "	Unable to boot device due to insufficient system resources."
  echo "	xctest encountered an error (Failed to prepare device 'iPhone 17 Pro' for impending launch. (Underlying Error: Unable to boot device due to insufficient system resources.))"
  echo
  echo "** TEST FAILED **"
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "no boot: two errors" is "$(errors)" 2
check "no boot: the first reason" is "$(error 1)" "Testing failed: Unable to boot device due to insufficient system resources."
check "no boot: the second reason" starts 2 "Testing failed: xctest encountered an error (Failed to prepare device 'iPhone 17 Pro'"
check "no boot: no test ran" noted "test counts|test.log: no test ran"

# 6. A crash under xcodebuild: the fatal error names the case's first line, the restart line follows.
{
  started ScreenHostTests testACrash
  echo "FPUI/ScreenHost.swift:120: Fatal error: Unexpectedly found nil while unwrapping an Optional value"
  echo "Restarting after unexpected exit, crash, or test timeout in ScreenHostTests.testACrash(); summary will include totals from previous launches."
  passing ScreenHostTests testTheNextCase
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "crash: two errors" is "$(errors)" 2
check "crash: the fatal error first" is "$(error 1)" "FPUI/ScreenHost.swift:120: Fatal error: Unexpectedly found nil while unwrapping an Optional value"
check "crash: then the restart" starts 2 "Restarting after unexpected exit, crash, or test timeout in ScreenHostTests.testACrash()"
check "crash: the counts" noted "test counts|test.log: 2 tests ran, 1 failed (2 failure lines), 0 skipped"
check "crash: the case" noted "failed test cases|1 failed test case, failure lines in brackets: ScreenHostTests.testACrash (2)"

# 7. A crash that ends swift test's log, and a hang that ends xcodebuild's: the case that never finished fails.
{
  echo "Test Suite 'All tests' started at 2026-11-03 09:16:45.578."
  echo "Test Case '-[FPCoreTests.IntentTests testAPass]' started."
  echo "Test Case '-[FPCoreTests.IntentTests testAPass]' passed (0.001 seconds)."
  echo "Test Case '-[FPCoreTests.IntentTests testACrash]' started."
  echo "FPCore/Intents.swift:88: Fatal error: boom"
  echo "error: Exited with unexpected signal code 5"
} > "$tmp/fpkit.log"
annotate "$tmp/fpkit.log"
check "swift test crash: two errors" is "$(errors)" 2
check "swift test crash: the fatal error first" is "$(error 1)" "FPCore/Intents.swift:88: Fatal error: boom"
check "swift test crash: then SwiftPM's line" is "$(error 2)" "error: Exited with unexpected signal code 5"
check "swift test crash: the counts" noted "test counts|fpkit.log: 2 tests ran, 1 failed (2 failure lines), 0 skipped, 1 never finished"
check "swift test crash: the case" noted "failed test cases|1 failed test case, failure lines in brackets: IntentTests.testACrash (never finished)"
{ passing ScreenHostTests testAPass; started ScreenHostTests testAHang; } > "$tmp/test.log"
annotate "$tmp/test.log"
check "hang: one error" is "$(errors)" 1
check "hang: the case that never finished" is "$(error 1)" \
  "Test Case '-[FPUITests.ScreenHostTests testAHang]' started and never finished (a crash, a hang or the end of the log)"

# 8. A case only xcodebuild's list names (the runner hung): named by the list, then the reason.
{
  echo "Testing failed:"
  echo "	xctest (63702) encountered an error (The test runner hung before establishing connection.)"
  echo
  echo "Failing tests:"
  echo "	StoreTests.testATwoMegabyteSnapshotTakesUnder20ms()"
  echo
  echo "** TEST FAILED **"
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "listed only: two errors" is "$(errors)" 2
check "listed only: the case first" is "$(error 1)" "Failing tests: StoreTests.testATwoMegabyteSnapshotTakesUnder20ms()"
check "listed only: then the reason" is "$(error 2)" \
  "Testing failed: xctest (63702) encountered an error (The test runner hung before establishing connection.)"

# 9. Not failures: an error-looking line inside a case that passed, an expected failure, a skip.
{
  started ScreenHostTests testAPass
  echo "2026-11-02 22:34:04.234927-0400 xctest[98147:1195818] [network] nw_path: error: no route yet"
  echo "Test Case '-[FPUITests.ScreenHostTests testAPass]' passed (0.969 seconds)."
  echo "Test Case '-[FPCoreTests.IntentTests testTheSecretIsNeverPrinted]' started."
  echo "XCTExpectFailure: matcher accepted Assertion Failure at IntentTests.swift:190: XCTAssertEqual failed: (\"a\") is not equal to (\"b\")"
  echo "IntentTests.swift:190: Expected failure in -[FPCoreTests.IntentTests testTheSecretIsNeverPrinted]: XCTAssertEqual failed: (\"a\") is not equal to (\"b\")"
  echo "Test Case '-[FPCoreTests.IntentTests testTheSecretIsNeverPrinted]' passed (0.002 seconds)."
  skipping ScreenHostTests testTheEdgePan
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "no failure: no error" is "$(errors)" 0
check "no failure: the counts" noted "test counts|test.log: 3 tests ran, 0 failed (0 failure lines), 1 skipped"
check "no failure: no case notice" is "$(notes 'failed test cases')" 0

# 10. A line is cut at 900 characters, then its % escaped; a CR goes.
wide="$T/FPUITests/ScreenHostTests.swift:9: error: -[FPUITests.ScreenHostTests testAWideLine] : XCTAssertEqual failed - 100% $(printf 'x%.0s' $(seq 1 950))"
{ started ScreenHostTests testAWideLine; printf '%s\r\n' "$wide"; echo "Test Case '-[FPUITests.ScreenHostTests testAWideLine]' failed (0.1 seconds)."; } > "$tmp/test.log"
annotate "$tmp/test.log"
cut900=${wide:0:900}
check "wide line: cut, escaped, no CR" is "$(error 1)" "${cut900//%/%25}"

# 11. Missing logs are skipped.
annotate "$tmp/none.log"
check "missing log: exit 0" is "$status" 0
check "missing log: nothing printed" is "$(grep -c . "$tmp/out")" 0
annotate "$tmp/none.log" "$tmp/twelve.log"
check "missing log beside a real one: the real one's errors" is "$(errors)" 10

# 12. The list's other spellings (a target's heading, Module.Class/method()) are the same case.
{
  failing ScreenHostTests testX 1 50
  echo "Failing tests:"
  echo "	FPUITests:"
  echo "		FPUITests.ScreenHostTests/testX()"
  echo
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "spellings: one error" is "$(errors)" 1
check "spellings: one case" noted "failed test cases|1 failed test case, failure lines in brackets: ScreenHostTests.testX (1)"

# 13. Two test bundles in one log: the counts cover both.
{
  echo "Test Suite 'FPCoreTests.xctest' started at 2026-11-03 09:17:04.935."
  echo "Test Case '-[FPCoreTests.IntentTests testA]' started."
  echo "Test Case '-[FPCoreTests.IntentTests testA]' passed (0.001 seconds)."
  echo "Test Case '-[FPCoreTests.IntentTests testB]' started."
  echo "Test Case '-[FPCoreTests.IntentTests testB]' passed (0.001 seconds)."
  failing ScreenHostTests testC 2 70
  skipping ScreenHostTests testD
  passing ScreenHostTests testE
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "two bundles: the counts" noted "test counts|test.log: 5 tests ran, 1 failed (2 failure lines), 1 skipped"

# 14. xcodebuild's own error before any test.
{
  echo "xcodebuild: error: Unable to find a device matching the provided destination specifier:"
  echo "		{ id:E924359F-92BD-4A98-87A4-D3D77404C641 }"
} > "$tmp/test.log"
annotate "$tmp/test.log"
check "xcodebuild error: one error" is "$(errors)" 1
check "xcodebuild error: the line" is "$(error 1)" "xcodebuild: error: Unable to find a device matching the provided destination specifier:"

echo "annotate-xc-test: $checks checks, $failures failed ($script)"
[ "$failures" -eq 0 ]
