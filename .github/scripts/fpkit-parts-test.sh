#!/bin/bash
# Checks fpkit-parts.sh: the parts it makes (every group on iOS 27.0 and, as GROUP-26, on iOS 26.5), each part's
# xcodebuild arguments, its executed check on small logs shaped as xcodebuild prints them, and its check of the job's
# matrix and the named classes, on this repo's workflow and on copies with one slip each. Exit 0 = every check passed,
# 1 = one failed.
# Usage: bash .github/scripts/fpkit-parts-test.sh [SCRIPT]   (SCRIPT: the fpkit-parts.sh to check, the one beside this
#                                                             file by default)
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
src=${1:-$here/fpkit-parts.sh}
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
checks=0
failures=0

# layout DIR: the repo's layout as fpkit-parts.sh reads it (the script finds the repo from its own path): a copy of the
# script and of the workflow, which a case may edit, and the test sources linked.
layout() {
  mkdir -p "$1/.github/scripts" "$1/.github/workflows" "$1/ios/App/FPKit" || exit 2
  cp "$src" "$1/.github/scripts/fpkit-parts.sh" || exit 2
  cp "$repo/.github/workflows/ios-build.yml" "$1/.github/workflows/ios-build.yml" || exit 2
  ln -s "$repo/ios/App/FPKit/Tests" "$1/ios/App/FPKit/Tests" || exit 2
}

# run DIR ARGS...: that layout's fpkit-parts.sh with ARGS; sets out (stdout and stderr) and code.
run() {
  local d=$1
  shift
  out=$(bash "$d/.github/scripts/fpkit-parts.sh" "$@" 2>&1)
  code=$?
}

ok() { checks=$((checks + 1)); }
bad() { checks=$((checks + 1)); failures=$((failures + 1)); echo "FAIL: $1"; }

# expect WHAT CODE [TEXT]: the last run exited CODE and, when TEXT is given, printed it.
expect() {
  if [ "$code" != "$2" ]; then
    bad "$1: exit $code, wanted $2 ($(printf '%s' "$out" | head -2 | tr '\n' ' '))"
  elif [ -n "$3" ] && ! printf '%s\n' "$out" | grep -qF -- "$3"; then
    bad "$1: no '$3' in: $(printf '%s' "$out" | head -2 | tr '\n' ' ')"
  else
    ok
  fi
}

base=$tmp/base
layout "$base"

# This repo's matrix and named classes pass.
run "$base" check
expect "check on this repo" 0 "fpkit-parts: ok"

# Every group is two parts, GROUP on iOS 27.0 and GROUP-26 on iOS 26.5, and there is no other part.
run "$base" list
expect "list" 0
parts=$(printf '%s\n' "$out" | sed -n 's/^\([^ ]*\) (iOS \([0-9.]*\)):.*/\1@\2/p')
[ "$(printf '%s\n' "$parts" | grep -c @)" -ge 8 ] && ok || bad "list printed $(printf '%s\n' "$parts" | grep -c @) parts, wanted 8 or more"
for pr in $parts; do
  p=${pr%@*}
  v=${pr#*@}
  case "$p" in
    *-26)
      [ "$v" = 26.5 ] && ok || bad "$p runs on iOS $v, not 26.5"
      printf '%s\n' $parts | grep -qx "${p%-26}@27.0" && ok || bad "$p has no ${p%-26} on iOS 27.0" ;;
    *)
      [ "$v" = 27.0 ] && ok || bad "$p runs on iOS $v, not 27.0"
      printf '%s\n' $parts | grep -qx "$p-26@26.5" && ok || bad "$p has no $p-26 on iOS 26.5" ;;
  esac
done
for g in renders tabs stack rest; do
  printf '%s\n' $parts | grep -qx "$g@27.0" && ok || bad "no part $g on iOS 27.0"
done

# A GROUP-26 part runs exactly its group's tests; rest and rest-26 skip every named class and name none to run.
for g in renders tabs stack rest; do
  run "$base" args "$g"
  a=$out
  c=$code
  run "$base" args "$g-26"
  if [ "$c" = 0 ] && [ "$code" = 0 ] && [ -n "$a" ] && [ "$out" = "$a" ]; then ok; else
    bad "args $g-26 ($code: $out) is not args $g ($c: $a)"
  fi
done
run "$base" args renders-26
expect "args renders-26" 0 "-only-testing:FPUITests/CoachHomeRenderTests -only-testing:FPUITests/CoachRenderTests"
run "$base" args rest-26
expect "args rest-26" 0 "-skip-testing:FPUITests/CoachHomeRenderTests -skip-testing:FPUITests/CoachRenderTests -skip-testing:FPUITests/ShellBridgeTabsTests"
case "$out" in *-only-testing*) bad "args rest-26 names a class to run: $out" ;; *) ok ;; esac
for p in nope rest-27 rest-26-26 -26 26 ""; do
  run "$base" args "$p"
  expect "args '$p'" 2 "no part '$p'"
done

# executed, on logs shaped as xcodebuild prints them.
suite() { echo "Test Suite '$1' started at 2026-11-03 19:00:00.000."; }
ran() { printf '\t Executed %s tests, with 0 failures (0 unexpected) in 1.000 (1.000) seconds\n' "$1"; }
{ suite "All tests"; suite FPHostTests.xctest; suite KTUIProxyTests; ran 3; } > "$tmp/rest.log"
{ suite "All tests"; suite FPUITests.xctest; suite CoachHomeRenderTests; suite CoachRenderTests; ran 5; } > "$tmp/renders.log"
{ suite "All tests"; suite KTUIProxyTests; ran 0; } > "$tmp/zero.log"
for p in rest rest-26; do
  run "$base" executed "$p" "$tmp/rest.log"
  expect "executed $p on a rest log" 0
  run "$base" executed "$p" "$tmp/renders.log"
  expect "executed $p on a renders log" 1 "part $p ran CoachHomeRenderTests, which it skips"
done
for p in renders renders-26; do
  run "$base" executed "$p" "$tmp/renders.log"
  expect "executed $p on a renders log" 0
  run "$base" executed "$p" "$tmp/rest.log"
  expect "executed $p on a rest log" 1 "part $p names FPUITests/CoachHomeRenderTests, which ran no test"
done
run "$base" executed tabs-26 "$tmp/renders.log"
expect "executed tabs-26 on a renders log" 1 "part tabs-26 names FPUITests/ShellBridgeTabsTests, which ran no test"
run "$base" executed rest-26 "$tmp/zero.log"
expect "executed rest-26 on a log that ran nothing" 1 "part rest-26 executed no test"
run "$base" executed rest-26 "$tmp/none.log"
expect "executed rest-26 with no log" 2 "no test log"

# check fails on each slip, made with sed in a copy of the layout: slip WHAT FILE EDIT TEXT (FILE: workflow or script;
# TEXT: what the failure must say).
n=0
slip() {
  local d f
  n=$((n + 1))
  d=$tmp/slip$n
  layout "$d"
  case "$2" in
    workflow) f=.github/workflows/ios-build.yml ;;
    *) f=.github/scripts/fpkit-parts.sh ;;
  esac
  sed -e "$3" "$d/$f" > "$d/$f.new" && mv "$d/$f.new" "$d/$f"
  if cmp -s "$d/$f" "$base/$f"; then
    bad "$1: the edit changed nothing in $f"
    return
  fi
  run "$d" check
  expect "check with $1" 1 "$4"
}
slip "rest-26's row left out" workflow "/part: rest-26,/d" "fpkit-parts.sh has ["
slip "rest-26 on an unquoted 26.5" workflow "/part: rest-26,/s/ios: '26.5'/ios: 26.5/" "rest-26@26.5(unquoted)"
slip "renders on iOS 27.1" workflow "/part: renders,/s/ios: '27.0'/ios: '27.1'/" "renders@27.1"
slip "tabs on any iOS 27" workflow "/part: tabs,/s/ios: '27.0'/ios: '27'/" "tabs@27]"
slip "a part the script does not know" workflow "/part: rest-26,/{p;s/part: rest-26,/part: rest-27,/;}" "rest-27@26.5"
slip "a named class not declared" script 's#FPUITests/CoachRenderTests"#FPUITests/CoachRenderTestz"#' "no class CoachRenderTestz is declared"
slip "a class named in two groups" script 's#^TABS="\(.*\)"$#TABS="\1 FPUITests/ScreenHostTests"#' "FPUITests/ScreenHostTests is named twice"
slip "the GROUP-26 parts no longer made" script '/^for g in .PART_GROUPS; do PARTS=/d' "fpkit-parts.sh has ["
slip "the 26 parts on iOS 26.4" script 's/^IOS_26=26\.5$/IOS_26=26.4/' "rest-26@26.4"

echo "fpkit-parts-test: $checks checks, $failures failed"
[ "$failures" -eq 0 ]
