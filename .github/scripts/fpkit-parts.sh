#!/bin/bash
# FPKit's iOS test parts (ios-build.yml, job fpkit-ios): the one place that names the classes a part runs, and the iOS
# major each part runs on.
#
# renders, tabs and stack run the classes named below, rest runs every other test (it skips exactly the named classes,
# so a new test class always runs somewhere): all four on iOS 27, built by the Xcode the app ships with. tabs-26 and
# stack-26 run tabs' and stack's classes again on iOS 26.x, the floor of the tab root and the native Coach tab: the
# classes that drive UIKit's tab bar (tabs) and the Coach tab's navigation stack (stack), where the two runtimes differ.
#
# The groups are also the time budget (the job's comment): on a calm Mac, with H10's and H11's tests, renders takes
# about 200 s, tabs 230 s, stack 200 s and rest 95 s, and a GitHub runner's test step about 2.3 minutes of building
# plus 2.8 times that (16ee484's parts). A class that must run on iOS 26 too belongs to tabs or stack; rest is kept the
# lightest because every new class lands there.
#
# Usage (from anywhere; the script finds the repo from its own path):
#   fpkit-parts.sh args PART           PART's xcodebuild -only-testing / -skip-testing arguments, on one line
#   fpkit-parts.sh check               every named class is declared in its test target and named once, and the job's
#                                      matrix has exactly the parts below, each on its iOS major
#   fpkit-parts.sh executed PART LOG   the xcodebuild log LOG executed a test, every class PART names ran in it, and
#                                      (rest) none of the named classes did
#   fpkit-parts.sh list                every part, its iOS major and its classes
# Problems are printed as GitHub annotations; exit 0 = fine, 1 = a problem, 2 = a usage error.

RENDERS="FPUITests/CoachHomeRenderTests FPUITests/CoachRenderTests"
TABS="FPUITests/ShellBridgeTabsTests FPUITests/RootTabControllerTests"
STACK="FPUITests/ScreenHostTests FPUITests/CoachHomeStoreTests FPUITests/CoachHomeViewTests"
PARTS="renders tabs stack rest tabs-26 stack-26"

# The classes PART runs alone (nothing for rest); false for a part that does not exist.
classes() {
  case "$1" in
    renders) echo $RENDERS ;;
    tabs|tabs-26) echo $TABS ;;
    stack|stack-26) echo $STACK ;;
    rest) ;;
    *) return 1 ;;
  esac
}

# The iOS major PART runs on (the matrix's `ios`).
major() {
  case "$1" in
    *-26) echo 26 ;;
    *) echo 27 ;;
  esac
}

part_or_die() {
  classes "$1" > /dev/null && return 0
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
    if [ "$2" = rest ]; then
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
        echo "::error title=fpkit-ios split::$t is named twice in fpkit-parts.sh (a class belongs to one part)"; fail=1 ;;
      esac
      seen="$seen$t "
      # A declaration, not a mention: `final class X: XCTestCase` at a line's start (attributes allowed before it).
      if ! grep -rqE "^[[:space:]]*(@[A-Za-z]+(\([^)]*\))?[[:space:]]+)*((final|public|open|internal)[[:space:]]+)*class[[:space:]]+${cls}[[:space:]]*:" "$TESTS/$target" 2>/dev/null; then
        echo "::error title=fpkit-ios split::$t is named in fpkit-parts.sh but no class $cls is declared in $TESTS/$target"
        fail=1
      fi
    done
    # The job's matrix runs exactly these parts, each on its iOS major: a part left out of the matrix would leave its
    # classes nowhere (rest skips them), one on the wrong major would leave that runtime untested, and a matrix part this
    # file does not know would fail only on its own runner.
    err=$(mktemp)
    matrix=$(ruby -ryaml -e '
      w = YAML.safe_load(File.read(ARGV[0]), aliases: true)
      inc = (((w["jobs"] || {})["fpkit-ios"] || {})["strategy"] || {})["matrix"]
      inc = inc.is_a?(Hash) && inc["include"]
      abort("no jobs.fpkit-ios.strategy.matrix.include") unless inc.is_a?(Array)
      puts inc.map { |e| "#{e["part"]}@#{e["ios"]}" }.sort_by { |s| s.bytes }.join(" ")' "$WORKFLOW" 2> "$err") || {
      echo "::error title=fpkit-ios split::could not read the fpkit-ios matrix from $WORKFLOW: $(grep -v '^Ignoring ' "$err" | head -1)"
      rm -f "$err"; exit 1; }
    rm -f "$err"
    want=$(for p in $PARTS; do echo "$p@$(major "$p")"; done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
    if [ "$matrix" != "$want" ]; then
      echo "::error title=fpkit-ios split::the fpkit-ios matrix in $WORKFLOW runs [$matrix] (part@ios), fpkit-parts.sh has [$want]: one row per part, on its iOS major"
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
    if [ "$2" = rest ]; then
      for t in $RENDERS $TABS $STACK; do
        if grep -q "Test Suite '${t#*/}' started" "$LOG_ARG"; then
          echo "::error title=fpkit-ios split::part rest ran ${t#*/}, which it skips"
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
      if [ "$p" = rest ]; then
        echo "rest (iOS $(major "$p")): every other test"
      else
        echo "$p (iOS $(major "$p")): $(classes "$p")"
      fi
    done
    ;;

  *)
    echo "usage: fpkit-parts.sh args PART | check | executed PART LOG | list" >&2
    exit 2
    ;;
esac
