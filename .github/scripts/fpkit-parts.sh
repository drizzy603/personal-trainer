#!/bin/bash
# FPKit's iOS test parts (ios-build.yml, job fpkit-ios): the one place that names the classes a part runs, and the iOS
# runtime each part runs on.
#
# The suite is cut into four groups: renders, tabs and stack run the classes named below, rest runs every other test (it
# skips exactly the named classes, so a new test class always runs somewhere). Every group is two parts: GROUP on iOS
# 27.0, built by the Xcode the app ships with, and GROUP-26 on iOS 26.5, built by the newest Xcode 26 (the job's
# comment). The tab root and the native Coach tab support iOS 26 and later and FPKit iOS 17 and later, so the whole
# suite runs on both runtimes: the parts are made from the groups, and no group can be left on one runtime alone.
#
# The groups are the time budget (the job's comment): on a calm Mac, with H10's and H11's tests, renders takes about
# 200 s, tabs 230 s, stack 200 s and rest 95 s, and a GitHub runner's test step about 2.3 minutes of building plus 2.8
# times that (16ee484's parts). rest is kept the lightest because every new class lands there.
#
# Usage (from anywhere; the script finds the repo from its own path):
#   fpkit-parts.sh args PART           PART's xcodebuild -only-testing / -skip-testing arguments, on one line
#   fpkit-parts.sh check               every named class is declared in its test target and named once, and the job's
#                                      matrix has exactly the parts below, each on its runtime (a quoted MAJOR.MINOR,
#                                      which fpkit-sim.py takes exactly)
#   fpkit-parts.sh executed PART LOG   the xcodebuild log LOG executed a test, every class PART names ran in it, and
#                                      (rest, rest-26) none of the named classes did
#   fpkit-parts.sh list                every part, its runtime and its classes
# Problems are printed as GitHub annotations; exit 0 = fine, 1 = a problem, 2 = a usage error.
# Its own test: .github/scripts/fpkit-parts-test.sh.

RENDERS="FPUITests/CoachHomeRenderTests FPUITests/CoachRenderTests"
TABS="FPUITests/ShellBridgeTabsTests FPUITests/RootTabControllerTests"
STACK="FPUITests/ScreenHostTests FPUITests/CoachHomeStoreTests FPUITests/CoachHomeViewTests"
PART_GROUPS="renders tabs stack rest"
# The runtime of the parts named after their group: the one the Mac's gates run (the xcode-27 image also has 27.1).
IOS_27=27.0
# The runtime of the GROUP-26 parts: the newest iOS 26.x, the only 26.x on macos-26 that runs the iPhone 17 Pro.
IOS_26=26.5
PARTS=$PART_GROUPS
for g in $PART_GROUPS; do PARTS="$PARTS $g-26"; done

# The group PART runs (rest-26 runs rest); false for a part that does not exist.
group() {
  local p
  for p in $PARTS; do
    if [ "$p" = "$1" ]; then echo "${1%-26}"; return 0; fi
  done
  return 1
}

# The classes PART runs alone (nothing for rest and rest-26); false for a part that does not exist.
classes() {
  case "$(group "$1")" in
    renders) echo $RENDERS ;;
    tabs) echo $TABS ;;
    stack) echo $STACK ;;
    rest) ;;
    *) return 1 ;;
  esac
}

# The iOS runtime PART runs on (the matrix's `ios`).
runtime() {
  case "$1" in
    *-26) echo "$IOS_26" ;;
    *) echo "$IOS_27" ;;
  esac
}

part_or_die() {
  group "$1" > /dev/null && return 0
  echo "::error title=fpkit-ios split::no part '$1' in .github/scripts/fpkit-parts.sh (its parts: $PARTS)"
  exit 2
}

LOG_ARG=""
case "$1" in
  executed) [ -n "$3" ] && LOG_ARG=$(cd "$(dirname "$3")" 2>/dev/null && pwd)/$(basename "$3") ;;
esac
cd "$(dirname "$0")/../.." || exit 2
TESTS=ios/App/FPKit/Tests
WORKFLOW=.github/workflows/ios-build.yml

case "$1" in
  args)
    part_or_die "$2"
    if [ "$(group "$2")" = rest ]; then
      for t in $RENDERS $TABS $STACK; do printf -- '-skip-testing:%s ' "$t"; done
    else
      for t in $(classes "$2"); do printf -- '-only-testing:%s ' "$t"; done
    fi
    echo
    ;;

  check)
    fail=0
    seen=" "
    for t in $RENDERS $TABS $STACK; do
      target=${t%%/*}; cls=${t#*/}
      case "$seen" in *" $t "*)
        echo "::error title=fpkit-ios split::$t is named twice in fpkit-parts.sh (a class belongs to one group)"; fail=1 ;;
      esac
      seen="$seen$t "
      # A declaration, not a mention: `final class X: XCTestCase` at a line's start (attributes allowed before it).
      if ! grep -rqE "^[[:space:]]*(@[A-Za-z]+(\([^)]*\))?[[:space:]]+)*((final|public|open|internal)[[:space:]]+)*class[[:space:]]+${cls}[[:space:]]*:" "$TESTS/$target" 2>/dev/null; then
        echo "::error title=fpkit-ios split::$t is named in fpkit-parts.sh but no class $cls is declared in $TESTS/$target"
        fail=1
      fi
    done
    # The job's matrix runs exactly these parts, each on its runtime: a part left out of the matrix would leave its group
    # on one runtime (or, for rest, its classes nowhere), one on another runtime would leave this one untested, and a
    # matrix part this file does not know would fail only on its own runner. The runtime must be a YAML string: GitHub
    # reads an unquoted 27.0 as the number 27, and fpkit-sim.py would then take the newest 27.x.
    err=$(mktemp)
    matrix=$(ruby -ryaml -e '
      w = YAML.safe_load(File.read(ARGV[0]), aliases: true)
      inc = (((w["jobs"] || {})["fpkit-ios"] || {})["strategy"] || {})["matrix"]
      inc = inc.is_a?(Hash) && inc["include"]
      abort("no jobs.fpkit-ios.strategy.matrix.include") unless inc.is_a?(Array)
      puts inc.map { |e| v = e["ios"]; "#{e["part"]}@#{v.is_a?(String) ? v : "#{v.inspect}(unquoted)"}" }
        .sort_by { |s| s.bytes }.join(" ")' "$WORKFLOW" 2> "$err") || {
      echo "::error title=fpkit-ios split::could not read the fpkit-ios matrix from $WORKFLOW: $(grep -v '^Ignoring ' "$err" | head -1)"
      rm -f "$err"; exit 1; }
    rm -f "$err"
    want=$(for p in $PARTS; do echo "$p@$(runtime "$p")"; done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
    if [ "$matrix" != "$want" ]; then
      echo "::error title=fpkit-ios split::the fpkit-ios matrix in $WORKFLOW runs [$matrix] (part@ios), fpkit-parts.sh has [$want]: one row per part, on its runtime, quoted"
      fail=1
    fi
    [ $fail -eq 0 ] && echo "fpkit-parts: ok ($(echo $RENDERS $TABS $STACK | wc -w | tr -d ' ') named classes; parts: $want)"
    exit $fail
    ;;

  executed)
    part_or_die "$2"
    [ -f "$LOG_ARG" ] || { echo "::error title=fpkit-ios split::no test log at '$3'"; exit 2; }
    fail=0
    if ! grep -qE "Executed [1-9][0-9]* tests?," "$LOG_ARG"; then
      echo "::error title=fpkit-ios split::part $2 executed no test"
      fail=1
    fi
    if [ "$(group "$2")" = rest ]; then
      for t in $RENDERS $TABS $STACK; do
        if grep -q "Test Suite '${t#*/}' started" "$LOG_ARG"; then
          echo "::error title=fpkit-ios split::part $2 ran ${t#*/}, which it skips"
          fail=1
        fi
      done
    else
      for t in $(classes "$2"); do
        if ! grep -q "Test Suite '${t#*/}' started" "$LOG_ARG"; then
          echo "::error title=fpkit-ios split::part $2 names $t, which ran no test"
          fail=1
        fi
      done
    fi
    exit $fail
    ;;

  list)
    for p in $PARTS; do
      if [ "$(group "$p")" = rest ]; then
        echo "$p (iOS $(runtime "$p")): every other test"
      else
        echo "$p (iOS $(runtime "$p")): $(classes "$p")"
      fi
    done
    ;;

  *)
    echo "usage: fpkit-parts.sh args PART | check | executed PART LOG | list" >&2
    exit 2
    ;;
esac
