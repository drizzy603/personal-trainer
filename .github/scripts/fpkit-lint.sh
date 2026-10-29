#!/bin/bash
# The WebKit warm-up rule for FPKit's iOS tests (ios-build.yml runs it before fpkit-ios's tests).
#
# The first web view in a fresh simulator can stay loading for good on a GitHub runner while later views load at once
# (the cold-WebKit flake that broke CI after build 60). So:
#   - a file under Tests/FPUITests that constructs a web view (WKWebView(, ShellWebView(, or a WKWebView subclass the
#     test targets declare, e.g. `final class RecordingWebView: WKWebView`) must call WebKitWarmUp.ensure() first;
#     WebKitWarmUp.swift itself is the warm-up and is exempt;
#   - a file under Tests/FPHostTests (which cannot see FPUITests' WebKitWarmUp) may construct one only when it is on the
#     reviewed list below, i.e. it carries its own warm-up loop (KTUIProxyTests replaces a first view that never loads)
#     or never loads a page in one (StoreAttachTests binds web views as capacitorDidLoad does and loads nothing).
# One annotation per offending file, at its first construction. Exit 0 = clean, 1 = a file breaks the rule.
# Usage: bash .github/scripts/fpkit-lint.sh   (from anywhere; it finds the repo from its own path)

HOST_REVIEWED="KTUIProxyTests.swift StoreAttachTests.swift"

cd "$(dirname "$0")/../.." || exit 2
TESTS=ios/App/FPKit/Tests
[ -d "$TESTS/FPUITests" ] || { echo "fpkit-lint: no $TESTS/FPUITests here ($(pwd))" >&2; exit 2; }

# Comments out (a construction in a comment or doc comment is not one); line numbers kept.
strip() { sed -e 's://.*$::' "$1"; }

# Web view classes: the two the app has, plus every subclass declared in any test target, to a fixed point.
names="WKWebView ShellWebView"
while :; do
  alt=$(echo $names | tr ' ' '|')
  more=$(find "$TESTS" -name '*.swift' -print0 | xargs -0 sed -e 's://.*$::' \
    | sed -nE "s/.*class[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*:[[:space:]]*($alt)([^A-Za-z0-9_].*)?$/\1/p" \
    | sort -u)
  grown="$names"
  for n in $more; do
    case " $grown " in *" $n "*) ;; *) grown="$grown $n" ;; esac
  done
  [ "$grown" = "$names" ] && break
  names="$grown"
done
alt=$(echo $names | tr ' ' '|')
ctor="(^|[^A-Za-z0-9_.])($alt)(\\.init)?[[:space:]]*\\("

fail=0
report() { # file line message
  echo "::error file=$1,line=$2,title=WebKit warm-up::$3"
  fail=1
}

while IFS= read -r f; do
  base=${f##*/}
  hit=$(strip "$f" | grep -nE "$ctor" | head -1)
  [ -n "$hit" ] || continue
  line=${hit%%:*}
  what=$(echo "${hit#*:}" | grep -oE "$ctor" | head -1 | sed -E 's/^[^A-Za-z_]*//; s/[[:space:]]*\($//')
  case "$f" in
    */FPUITests/*)
      [ "$base" = "WebKitWarmUp.swift" ] && continue
      strip "$f" | grep -qE 'WebKitWarmUp\.ensure\(\)' && continue
      report "$f" "$line" "$base constructs $what( without calling WebKitWarmUp.ensure() first (try await WebKitWarmUp.ensure() in setUp, before the first web view)"
      ;;
    */FPHostTests/*)
      case " $HOST_REVIEWED " in *" $base "*) continue ;; esac
      report "$f" "$line" "$base constructs $what( and is not on fpkit-lint.sh's reviewed list for FPHostTests (FPHostTests cannot see WebKitWarmUp: give it a warm-up loop like KTUIProxyTests', then add it to HOST_REVIEWED)"
      ;;
  esac
done < <(find "$TESTS/FPUITests" "$TESTS/FPHostTests" -name '*.swift' 2>/dev/null | sort)

if [ $fail -eq 0 ]; then
  echo "fpkit-lint: ok (web view classes: $names)"
fi
exit $fail
