#!/bin/bash
# Checks annotate-xc.sh on small logs shaped as xcodebuild and swift test print them. Most cases copy the kinds of line
# from FPKit runs on a Mac (xcodebuild on iOS 26.5 and 27.0, swift test), with names and numbers made up. None of those
# runs crashed, so the crash cases copy real crashes of scratch packages instead, with only their folders shortened:
# case 6 from xcodebuild test in Xcode 27.2 on an iOS 26.5 simulator, case 7 from swift test (SwiftPM 6.4.2, Xcode
# 27.2) on macOS. Exit 0 = every check passed, 1 = one failed.
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

# 6. Crashes under xcodebuild, copied from a real log (Xcode 27.2, "xcodebuild test -parallel-testing-enabled NO" on an
# iOS 26.5 simulator; a scratch package whose testF_unwraps unwraps nil and testC_traps calls fatalError). Each fatal
# error comes twice, the second with a timestamp, and xcodebuild's restart line names no case, so all three count for
# the case that was running; that case never finished, and each crashed case is named first by its fatal error.
cat > "$tmp/test.log" <<'EOF'
Test Suite 'All tests' started at 2026-11-03 20:17:10.196.
Test Suite 'XCProbeTests.xctest' started at 2026-11-03 20:17:10.196.
Test Suite 'ZZCrashProbeMoreTests' started at 2026-11-03 20:17:10.197.
Test Case '-[XCProbeTests.ZZCrashProbeMoreTests testF_unwraps]' started.
XCProbeTests/ZZCrashProbeTests.swift:12: Fatal error: Unexpectedly found nil while unwrapping an Optional value
2026-11-03 20:17:10.203151-0400 xctest[70846:4037934] XCProbeTests/ZZCrashProbeTests.swift:12: Fatal error: Unexpectedly found nil while unwrapping an Optional value

Restarting after unexpected exit, crash, or test timeout; summary will include totals from previous launches.

Test Suite 'Selected tests' started at 2026-11-03 20:17:32.658.
Test Suite 'XCProbeTests.xctest' started at 2026-11-03 20:17:32.660.
Test Suite 'ZZCrashProbeMoreTests' started at 2026-11-03 20:17:32.660.
Test Case '-[XCProbeTests.ZZCrashProbeMoreTests testG_last]' started.
Test Case '-[XCProbeTests.ZZCrashProbeMoreTests testG_last]' passed (0.001 seconds).
Test Suite 'ZZCrashProbeMoreTests' passed at 2026-11-03 20:17:32.663.
	 Executed 1 test, with 0 failures (0 unexpected) in 0.001 (0.003) seconds
Test Suite 'ZZCrashProbeTests' started at 2026-11-03 20:17:32.664.
Test Case '-[XCProbeTests.ZZCrashProbeTests testA_passes]' started.
Test Case '-[XCProbeTests.ZZCrashProbeTests testA_passes]' passed (0.003 seconds).
Test Case '-[XCProbeTests.ZZCrashProbeTests testB_fails]' started.
/tmp/xcprobe/Tests/XCProbeTests/ZZCrashProbeTests.swift:6: error: -[XCProbeTests.ZZCrashProbeTests testB_fails] : XCTAssertEqual failed: ("1") is not equal to ("2") - probe failure before the trap
Test Case '-[XCProbeTests.ZZCrashProbeTests testB_fails]' failed (0.360 seconds).
Test Case '-[XCProbeTests.ZZCrashProbeTests testC_traps]' started.
XCProbeTests/ZZCrashProbeTests.swift:7: Fatal error: probe trap
2026-11-03 20:17:33.029139-0400 xctest[71145:4040319] XCProbeTests/ZZCrashProbeTests.swift:7: Fatal error: probe trap

Restarting after unexpected exit, crash, or test timeout; summary will include totals from previous launches.

Test Suite 'Selected tests' started at 2026-11-03 20:17:50.195.
Test Suite 'XCProbeTests.xctest' started at 2026-11-03 20:17:50.196.
Test Suite 'ZZCrashProbeTests' started at 2026-11-03 20:17:50.197.
Test Case '-[XCProbeTests.ZZCrashProbeTests testD_after]' started.
Test Case '-[XCProbeTests.ZZCrashProbeTests testD_after]' passed (0.003 seconds).
Test Case '-[XCProbeTests.ZZCrashProbeTests testE_failsAfter]' started.
/tmp/xcprobe/Tests/XCProbeTests/ZZCrashProbeTests.swift:9: error: -[XCProbeTests.ZZCrashProbeTests testE_failsAfter] : failed - probe failure after the restart
Test Case '-[XCProbeTests.ZZCrashProbeTests testE_failsAfter]' failed (0.049 seconds).
Test Suite 'ZZCrashProbeTests' failed at 2026-11-03 20:17:50.266.
	 Executed 2 tests, with 1 failure (0 unexpected) in 0.051 (0.069) seconds
Test Suite 'XCProbeTests.xctest' failed at 2026-11-03 20:17:50.266.
	 Executed 2 tests, with 1 failure (0 unexpected) in 0.051 (0.070) seconds
Test Suite 'Selected tests' failed at 2026-11-03 20:17:50.267.
	 Executed 2 tests, with 1 failure (0 unexpected) in 0.051 (0.072) seconds
2026-11-03 20:18:23.397 xcodebuild[70523:4035926] [MT] IDETestOperationsObserverDebug: 81.175 elapsed -- Testing started completed.
2026-11-03 20:18:23.397 xcodebuild[70523:4035926] [MT] IDETestOperationsObserverDebug: 0.000 sec, +0.000 sec -- start
2026-11-03 20:18:23.397 xcodebuild[70523:4035926] [MT] IDETestOperationsObserverDebug: 81.175 sec, +81.175 sec -- end

Test session results, code coverage, and logs:
	/tmp/dd/Logs/Test/Test-XCProbe-Package-2026.11.03_20-16-53--0400.xcresult

Failing tests:
	ZZCrashProbeMoreTests.testF_unwraps()
	ZZCrashProbeTests.testB_fails()
	ZZCrashProbeTests.testC_traps()
	ZZCrashProbeTests.testE_failsAfter()

** TEST FAILED **

Testing started
EOF
annotate "$tmp/test.log"
check "xcodebuild crash: seven errors" is "$(errors)" 7
check "xcodebuild crash: error 1 is the first crashed case's fatal error" is "$(error 1)" \
  "XCProbeTests/ZZCrashProbeTests.swift:12: Fatal error: Unexpectedly found nil while unwrapping an Optional value"
check "xcodebuild crash: error 2 is the case that failed between the crashes" \
  starts 2 "/tmp/xcprobe/Tests/XCProbeTests/ZZCrashProbeTests.swift:6: error: -[XCProbeTests.ZZCrashProbeTests testB_fails] : "
check "xcodebuild crash: error 3 is the second crashed case's fatal error" is "$(error 3)" \
  "XCProbeTests/ZZCrashProbeTests.swift:7: Fatal error: probe trap"
check "xcodebuild crash: error 4 is the case that failed after the last restart" \
  starts 4 "/tmp/xcprobe/Tests/XCProbeTests/ZZCrashProbeTests.swift:9: error: -[XCProbeTests.ZZCrashProbeTests testE_failsAfter] : "
check "xcodebuild crash: error 5 is the first fatal error's copy" \
  starts 5 "2026-11-03 20:17:10.203151-0400 xctest[70846:4037934] XCProbeTests/ZZCrashProbeTests.swift:12: Fatal error: "
check "xcodebuild crash: error 6 is the restart line, once" is "$(error 6)" \
  "Restarting after unexpected exit, crash, or test timeout; summary will include totals from previous launches."
check "xcodebuild crash: error 7 is the second fatal error's copy" \
  starts 7 "2026-11-03 20:17:33.029139-0400 xctest[71145:4040319] XCProbeTests/ZZCrashProbeTests.swift:7: Fatal error: "
check "xcodebuild crash: the counts" noted "test counts|test.log: 7 tests ran, 4 failed (8 failure lines), 0 skipped, 2 never finished"
check "xcodebuild crash: the cases" noted "failed test cases|4 failed test cases, failure lines in brackets: \
ZZCrashProbeMoreTests.testF_unwraps (never finished), ZZCrashProbeTests.testB_fails (1), \
ZZCrashProbeTests.testC_traps (never finished), ZZCrashProbeTests.testE_failsAfter (1)"

# 7. Crashes under swift test, copied from real logs (SwiftPM 6.4.2 in Xcode 27.2 on macOS, "swift test > log 2>&1"; a
# scratch package whose testC_crashes calls fatalError, its folder shortened to $P). SwiftPM relays the test output in
# 4096-byte pieces and writes its own line between two of them, so where that line lands moves with the output before
# it (the scratch testA_pads fails with a run of x's to move it): before the output (a), inside a case's end line (b: a
# passing case, c: a failing one), or at the start of a line inside a passing case (d) or inside the crashed case
# before its fatal error (e). Wherever it lands it is the run's line, named after the cases', and a line it split is
# read whole: the passing case passed and the failing one finished.
P=/tmp/probe
spm="error: Process '/Applications/Xcode.app/Contents/Developer/usr/bin/xctest $P/.build/out/Products/Debug/ProbeTests.xctest' exited with unexpected signal code 5"
fatal="ProbeTests/ZZAnnotProbeTests.swift:8: Fatal error: probe crash"
pc() { echo "Test Case '-[ProbeTests.ZZAnnotProbeTests $1]' $2"; } # a scratch case's line
suites() { # the suites' start lines, at $1 and $2
  echo "Test Suite 'All tests' started at 2026-11-03 $1."
  echo "Test Suite 'ProbeTests.xctest' started at 2026-11-03 $2."
  echo "Test Suite 'ZZAnnotProbeTests' started at 2026-11-03 $2."
}
pads() { # testA_pads failing with $1 x's, in $2 seconds
  pc testA_pads started.
  echo "$P/Tests/ProbeTests/ZZAnnotProbeTests.swift:6: error: -[ProbeTests.ZZAnnotProbeTests testA_pads] : failed - $(printf "%$1s" | tr ' ' x)"
  pc testA_pads "failed ($2 seconds)."
}
padline="$P/Tests/ProbeTests/ZZAnnotProbeTests.swift:6: error: -[ProbeTests.ZZAnnotProbeTests testA_pads] : failed - xxx"
after() { # what follows the crash: swift-testing's empty run, then SwiftPM's note
  printf '%s\n' "◇ Test run started." "↳ Testing Library Version: 2403" "↳ Target Platform: arm64e-apple-macos14.0" \
    "✔ Test run with 0 tests in 0 suites passed after 0.001 seconds." "Note: Some test targets reported failures:" \
    "  - ProbeTests (XCTest)"
}
noisy() { # a noisy failure line ($2: its % as logged, or as annotated)
  echo "$P/Tests/ProbeTests/ZZAnnotProbeTests.swift:7: error: -[ProbeTests.ZZAnnotProbeTests testB_noisy] : XCTAssertEqual failed: (\"$1\") is not equal to (\"-1\") - noisy $1 of 12, 100$2 sure"
}
{ # a: before the output, which was shorter than one piece
  echo "Building for debugging..."
  echo "Build complete! (0.17 sec)"
  echo "$spm"
  suites 19:29:40.104 19:29:40.104
  pc testA_pads started.; pc testA_pads "passed (0.001 seconds)."
  pc testB_passes started.; pc testB_passes "passed (0.000 seconds)."
  pc testC_crashes started.; echo "$fatal"
  after
} > "$tmp/fpkit.log"
annotate "$tmp/fpkit.log"
check "swift test crash a (SwiftPM's line before the output): two errors" is "$(errors)" 2
check "swift test crash a: the crashed case's fatal error first" is "$(error 1)" "$fatal"
check "swift test crash a: then SwiftPM's line" is "$(error 2)" "$spm"
check "swift test crash a: the counts" noted "test counts|fpkit.log: 3 tests ran, 1 failed (1 failure line), 0 skipped, 1 never finished"
check "swift test crash a: the case" noted "failed test cases|1 failed test case, failure lines in brackets: ZZAnnotProbeTests.testC_crashes (never finished)"
{ # b: inside a passing case's end line
  suites 19:30:19.543 19:30:19.543
  pads 3411 0.034
  pc testB_passes started.
  echo "Test Case '-[ProbeTests.ZZAnnotProbeTests testB_pa$spm"
  echo "sses]' passed (0.000 seconds)."
  pc testC_crashes started.; echo "$fatal"
  after
} > "$tmp/fpkit.log"
annotate "$tmp/fpkit.log"
check "swift test crash b (SwiftPM's line splits a passing case's name): three errors" is "$(errors)" 3
check "swift test crash b: the failed case first" starts 1 "$padline"
check "swift test crash b: then the crashed case's fatal error" is "$(error 2)" "$fatal"
check "swift test crash b: then SwiftPM's line" is "$(error 3)" "$spm"
check "swift test crash b: the split case passed" is "$(grep -c testB_passes "$tmp/out")" 0
check "swift test crash b: the counts" noted "test counts|fpkit.log: 3 tests ran, 2 failed (2 failure lines), 0 skipped, 1 never finished"
check "swift test crash b: the cases" noted "failed test cases|2 failed test cases, failure lines in brackets: \
ZZAnnotProbeTests.testA_pads (1), ZZAnnotProbeTests.testC_crashes (never finished)"
{ # c: inside a failing case's end line
  suites 19:27:17.309 19:27:17.311
  pc testA_passes started.; pc testA_passes "passed (0.001 seconds)."
  pc testB_noisy started.
  for i in $(seq 0 11); do noisy $i %; done
  echo "Test Case '-[ProbeTests.ZZAnnotProbeTests testB_noi$spm"
  echo "sy]' failed (0.091 seconds)."
  pc testC_one started.
  echo "$P/Tests/ProbeTests/ZZAnnotProbeTests.swift:8: error: -[ProbeTests.ZZAnnotProbeTests testC_one] : failed - one failure"
  pc testC_one "failed (0.000 seconds)."
  pc testD_skips started.
  echo "$P/Tests/ProbeTests/ZZAnnotProbeTests.swift:9: -[ProbeTests.ZZAnnotProbeTests testD_skips] : Test skipped - probe skip"
  pc testD_skips "skipped (0.001 seconds)."
  pc testE_crashes started.
  echo "ProbeTests/ZZAnnotProbeTests.swift:10: Fatal error: probe crash"
  after
} > "$tmp/fpkit.log"
annotate "$tmp/fpkit.log"
check "swift test crash c (SwiftPM's line splits a failing case's name): ten errors" is "$(errors)" 10
check "swift test crash c: error 1 is the split case's first failure line" is "$(error 1)" "$(noisy 0 %25)"
check "swift test crash c: error 2 is the next failed case's" is "$(error 2)" \
  "$P/Tests/ProbeTests/ZZAnnotProbeTests.swift:8: error: -[ProbeTests.ZZAnnotProbeTests testC_one] : failed - one failure"
check "swift test crash c: error 3 is the crashed case's fatal error" is "$(error 3)" "ProbeTests/ZZAnnotProbeTests.swift:10: Fatal error: probe crash"
check "swift test crash c: error 4 is SwiftPM's line" is "$(error 4)" "$spm"
check "swift test crash c: error 5 goes on with the split case's lines" is "$(error 5)" "$(noisy 1 %25)"
check "swift test crash c: the counts" noted "test counts|fpkit.log: 5 tests ran, 3 failed (14 failure lines), 1 skipped, 1 never finished"
check "swift test crash c: the split case finished" noted "failed test cases|3 failed test cases, failure lines in brackets: \
ZZAnnotProbeTests.testB_noisy (12), ZZAnnotProbeTests.testC_one (1), ZZAnnotProbeTests.testE_crashes (never finished)"
{ # d: at the start of a line inside a passing case
  suites 20:16:15.044 20:16:15.047
  pads 3461 0.332
  pc testB_passes started.
  echo "$spm"
  pc testB_passes "passed (0.000 seconds)."
  pc testC_crashes started.; echo "$fatal"
  after
} > "$tmp/fpkit.log"
annotate "$tmp/fpkit.log"
check "swift test crash d (SwiftPM's line inside a passing case): three errors" is "$(errors)" 3
check "swift test crash d: the crashed case's fatal error second" is "$(error 2)" "$fatal"
check "swift test crash d: SwiftPM's line third" is "$(error 3)" "$spm"
check "swift test crash d: the counts" noted "test counts|fpkit.log: 3 tests ran, 2 failed (2 failure lines), 0 skipped, 1 never finished"
{ # e: at the start of a line inside the crashed case, before its fatal error
  suites 20:16:18.800 20:16:18.802
  pads 3313 0.228
  pc testB_passes started.; pc testB_passes "passed (0.000 seconds)."
  pc testC_crashes started.
  echo "$spm"
  echo "$fatal"
  after
} > "$tmp/fpkit.log"
annotate "$tmp/fpkit.log"
check "swift test crash e (SwiftPM's line inside the crashed case): three errors" is "$(errors)" 3
check "swift test crash e: the crashed case by its fatal error" is "$(error 2)" "$fatal"
check "swift test crash e: then SwiftPM's line" is "$(error 3)" "$spm"
check "swift test crash e: the counts" noted "test counts|fpkit.log: 3 tests ran, 2 failed (2 failure lines), 0 skipped, 1 never finished"

# A hang that ends xcodebuild's log (the job's time limit stops it): the case that never finished fails.
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
