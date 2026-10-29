#!/bin/bash
# The scene rule (contract 12, "Root, built app"; plan T14): the one check of an Info.plist's scene manifest, run by
# verify.sh on the source, by every native tool on the app it built (tests/tools/fp-build.sh), by CI on its build and
# by the release on the archive (T28's gate G1).
#
#   tests/tools/scene-plist.sh <App.app/Info.plist>        # a built app (binary or XML plist)
#   tests/tools/scene-plist.sh --source <Info.plist>       # the source plist (ios/App/App/Info.plist)
#   tests/tools/scene-plist.sh --self-test                 # makes plists with plutil and checks every verdict
#
# Why: an app built against the iOS 26+ SDK is killed at launch on iOS 27 unless its scene manifest names a scene
# delegate, and the simulator does not enforce it (TestFlight builds 44 and 45). From build 61 SceneDelegate builds
# the window and its root in code, so a storyboard key would add a second root and a second page.
#
# The rule, every part checked and printed:
#   1. the first configuration of UIApplicationSceneManifest > UISceneConfigurations >
#      UIWindowSceneSessionRoleApplication names UISceneDelegateClassName App.SceneDelegate in a built app,
#      $(PRODUCT_MODULE_NAME).SceneDelegate in the source (an unresolved variable in a built app fails);
#   2. its UISceneConfigurationName is "Default Configuration" (what AppDelegate's configurationForConnecting returns);
#   3. UIApplicationSupportsMultipleScenes is false (absent reads as false, iOS's default);
#   4. neither UIMainStoryboardFile nor UISceneStoryboardFile, nor a platform- or device-qualified form of either
#      (Apple's <key>-<platform>~<device>: UIMainStoryboardFile~ipad, UIMainStoryboardFile-iphoneos), appears
#      anywhere: exact key names, never "Storyboard" (UILaunchStoryboardName stays, qualified or not);
#   5. no scene manifest key appears in a qualified form (UIApplicationSceneManifest~iphone, ...SupportsMultipleScenes~ipad):
#      iOS reads the qualified key in place of the plain one on that device, so rules 1-3, which read the plain keys,
#      would pass a manifest the phone never uses.
# Exit 0 when the plist keeps the rule, 1 when it breaks it (each reason on its own FAIL line), 2 on bad arguments or a
# file plutil cannot read.
set -u

DELEGATE_BUILT='App.SceneDelegate'
DELEGATE_SOURCE='$(PRODUCT_MODULE_NAME).SceneDelegate'
CONFIG='Default Configuration'
FIRST='UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0'
SCENE_KEYS='UIApplicationSceneManifest|UISceneConfigurations|UIWindowSceneSessionRoleApplication|UISceneDelegateClassName|UISceneConfigurationName|UIApplicationSupportsMultipleScenes'

usage() {
  echo "usage: $0 [--source] <Info.plist> | --self-test" >&2
  exit 2
}

# check <mode: built|source> <plist>
check() {
  local mode="$1" plist="$2" want val key found xml problems=0 parts=()
  if [ ! -f "$plist" ]; then echo "scene-plist: no file at $plist" >&2; return 2; fi
  if ! xml=$(plutil -convert xml1 -o - "$plist" 2>/dev/null); then
    echo "scene-plist: plutil cannot read $plist" >&2; return 2
  fi
  fail() { echo "  FAIL: $*"; problems=$((problems + 1)); }

  # 1. the delegate
  [ "$mode" = source ] && want="$DELEGATE_SOURCE" || want="$DELEGATE_BUILT"
  if val=$(plutil -extract "$FIRST.UISceneDelegateClassName" raw -expect string -o - "$plist" 2>/dev/null); then
    if [ "$val" = "$want" ]; then
      parts+=("UISceneDelegateClassName $val")
    elif [ "$mode" = built ] && [ "${val#*\$(}" != "$val" ]; then
      fail "UISceneDelegateClassName is \"$val\": a build variable left unresolved in a built app (want $want)"
    else
      fail "UISceneDelegateClassName is \"$val\", want $want"
    fi
  elif plutil -extract "$FIRST" raw -expect dictionary -o - "$plist" >/dev/null 2>&1; then
    fail "the first application scene configuration names no UISceneDelegateClassName string (iOS 27 kills the app at launch)"
  elif plutil -extract UIApplicationSceneManifest raw -expect dictionary -o - "$plist" >/dev/null 2>&1; then
    fail "UIApplicationSceneManifest has no UISceneConfigurations > UIWindowSceneSessionRoleApplication configuration (iOS 27 kills the app at launch)"
  else
    fail "no UIApplicationSceneManifest (iOS 27 kills the app at launch)"
  fi

  # 2. the configuration's name (when there is a configuration: its absence failed above)
  if val=$(plutil -extract "$FIRST.UISceneConfigurationName" raw -expect string -o - "$plist" 2>/dev/null); then
    if [ "$val" = "$CONFIG" ]; then parts+=("$CONFIG"); else fail "UISceneConfigurationName is \"$val\", want \"$CONFIG\" (AppDelegate asks for it by that name)"; fi
  elif plutil -extract "$FIRST" raw -expect dictionary -o - "$plist" >/dev/null 2>&1; then
    fail "the first application scene configuration has no UISceneConfigurationName string (want \"$CONFIG\")"
  fi

  # 3. one scene
  if val=$(plutil -extract UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes raw -o - "$plist" 2>/dev/null); then
    if [ "$val" = false ]; then parts+=("UIApplicationSupportsMultipleScenes false")
    else fail "UIApplicationSupportsMultipleScenes is $val, want false (one scene, one page)"; fi
  else
    parts+=("UIApplicationSupportsMultipleScenes absent (false)")
  fi

  # 4. no storyboard key anywhere, plain or qualified (XML keys are plain text: a value can never read as <key>...</key>)
  for key in UIMainStoryboardFile UISceneStoryboardFile; do
    found=$(printf '%s\n' "$xml" | grep -oE "<key>$key([-~][^<]*)?</key>" | sed 's/<[/]*key>//g' || true)
    if [ -n "$found" ]; then
      fail "$key appears $(printf '%s\n' "$found" | wc -l | tr -d ' ') time(s) ($(printf '%s\n' "$found" | sort -u | tr '\n' ' ' | sed 's/ $//')): a storyboard root, as build 60 and earlier had (from build 61 SceneDelegate builds the root in code, so a storyboard adds a second root and page)"
    fi
  done

  # 5. no qualified form of a scene manifest key, anywhere
  found=$(printf '%s\n' "$xml" | grep -oE "<key>($SCENE_KEYS)[-~][^<]*</key>" | sed 's/<[/]*key>//g' | sort -u || true)
  if [ -n "$found" ]; then
    fail "a platform- or device-qualified scene key appears ($(printf '%s' "$found" | tr '\n' ' ')): iOS reads it in place of the plain key on that device, so the plain manifest checked above would not be the one used"
  fi
  [ "$problems" = 0 ] && parts+=("no UIMainStoryboardFile or UISceneStoryboardFile" "no qualified scene key")

  if [ "$problems" = 0 ]; then
    local line="" p
    for p in "${parts[@]}"; do line="${line:+$line · }$p"; done
    echo "✓ scene-plist ($mode) $plist: $line"
    return 0
  fi
  echo "scene-plist ($mode) $plist: FAIL, $problems problem(s) above"
  return 1
}

# The self-test: a good plist written once, every other case made from it with plutil, each verdict and reason checked.
# The cases run this script by its absolute path from the scratch folder, so the test holds from any folder and for
# any spelling of the script's path (`bash scene-plist.sh --self-test` from tests/tools included).
self_test() {
  local me dir good n=0 bad=0 out rc
  me="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  dir=$(mktemp -d "${TMPDIR:-/tmp}/scene-plist.XXXXXX") || exit 2
  SELF_TEST_DIR=$dir
  trap 'rm -rf "$SELF_TEST_DIR"' EXIT
  cd "$dir" || exit 2
  good="$dir/good.plist"
  cat > "$good" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleVersion</key>
	<string>61</string>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
		<false/>
		<key>UISceneConfigurations</key>
		<dict>
			<key>UIWindowSceneSessionRoleApplication</key>
			<array>
				<dict>
					<key>UISceneConfigurationName</key>
					<string>Default Configuration</string>
					<key>UISceneDelegateClassName</key>
					<string>App.SceneDelegate</string>
				</dict>
			</array>
		</dict>
	</dict>
</dict>
</plist>
PLIST
  plutil -lint -s "$good" || { echo "self-test: plutil rejects the good plist"; exit 1; }
  # variant <name> <plutil args...>: a copy of the good plist changed by one plutil command
  variant() { local f="$dir/$1.plist"; shift; cp "$good" "$f" && plutil "$@" "$f" || { echo "self-test: plutil $* failed"; exit 1; }; }
  # expect <0|1> <mode> <name> <text the output must hold>
  expect() {
    local want="$1" mode="$2" name="$3" text="$4"
    n=$((n + 1))
    if [ "$mode" = source ]; then out=$("$me" --source "$dir/$name.plist" 2>&1); rc=$?
    else out=$("$me" "$dir/$name.plist" 2>&1); rc=$?; fi
    if [ "$rc" = "$want" ] && printf '%s' "$out" | grep -qF -- "$text"; then
      echo "  ok   $name ($mode): exit $rc"
    else
      bad=$((bad + 1))
      echo "  BAD  $name ($mode): exit $rc, want $want and \"$text\""
      printf '%s\n' "$out" | sed 's/^/       /'
    fi
  }
  cp "$good" "$dir/good-xml.plist"
  variant good-binary -convert binary1
  variant no-delegate -remove "$FIRST.UISceneDelegateClassName"
  variant main-storyboard -insert UIMainStoryboardFile -string Main
  variant scene-storyboard -insert "$FIRST.UISceneStoryboardFile" -string Main
  variant unresolved -replace "$FIRST.UISceneDelegateClassName" -string '$(PRODUCT_MODULE_NAME).SceneDelegate'
  variant ipad-storyboard -insert 'UIMainStoryboardFile~ipad' -string Main
  variant deep-storyboard -insert UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.1 -xml \
    '<dict><key>UISceneConfigurationName</key><string>Other</string><key>UISceneStoryboardFile</key><string>Main</string></dict>'
  variant multiple -replace UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes -bool YES
  variant no-multiple-key -remove UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes
  variant other-config -replace "$FIRST.UISceneConfigurationName" -string 'Other Configuration'
  variant no-manifest -remove UIApplicationSceneManifest
  variant wrong-module -replace "$FIRST.UISceneDelegateClassName" -string 'Supero.SceneDelegate'
  # Apple's qualified keys (<key>-<platform>~<device>): iOS reads them in place of the plain key on that device
  variant platform-storyboard -insert UIMainStoryboardFile-iphoneos -string Main
  variant qualified-scene-storyboard -insert "$FIRST.UISceneStoryboardFile-iphoneos~iphone" -string Main
  variant iphone-manifest -insert 'UIApplicationSceneManifest~iphone' -xml '<dict><key>UIApplicationSupportsMultipleScenes</key><false/></dict>'
  variant ipad-multiple -insert 'UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes~ipad' -bool YES
  variant platform-delegate -insert "$FIRST.UISceneDelegateClassName-iphoneos" -string 'Other.SceneDelegate'
  variant qualified-launch -insert 'UILaunchStoryboardName~iphone' -string LaunchScreen
  cp "$dir/scene-storyboard.plist" "$dir/binary-storyboard.plist" && plutil -convert binary1 "$dir/binary-storyboard.plist" || exit 1
  cp "$dir/unresolved.plist" "$dir/source-good.plist"
  printf 'not a plist' > "$dir/garbage.plist"

  echo "scene-plist self-test (plutil: $(command -v plutil))"
  # the good plist keeps UILaunchStoryboardName: it passes, so no "Storyboard" substring is ever matched
  expect 0 built good-xml 'UISceneDelegateClassName App.SceneDelegate'
  expect 0 built good-xml 'no qualified scene key'
  expect 0 built good-binary 'no UIMainStoryboardFile or UISceneStoryboardFile'
  expect 1 built no-delegate 'names no UISceneDelegateClassName'
  expect 1 built main-storyboard 'UIMainStoryboardFile appears 1 time(s)'
  expect 1 built scene-storyboard 'UISceneStoryboardFile appears 1 time(s)'
  expect 1 built unresolved 'left unresolved in a built app'
  expect 1 built ipad-storyboard 'UIMainStoryboardFile appears 1 time(s)'
  expect 1 built deep-storyboard 'UISceneStoryboardFile appears 1 time(s)'
  expect 1 built binary-storyboard 'UISceneStoryboardFile appears 1 time(s)'
  expect 1 built multiple 'UIApplicationSupportsMultipleScenes is true'
  expect 0 built no-multiple-key 'UIApplicationSupportsMultipleScenes absent (false)'
  expect 1 built other-config 'UISceneConfigurationName is "Other Configuration"'
  expect 1 built no-manifest 'no UIApplicationSceneManifest'
  expect 1 built wrong-module 'UISceneDelegateClassName is "Supero.SceneDelegate", want App.SceneDelegate'
  expect 1 built platform-storyboard 'UIMainStoryboardFile appears 1 time(s) (UIMainStoryboardFile-iphoneos)'
  expect 1 built qualified-scene-storyboard 'UISceneStoryboardFile appears 1 time(s) (UISceneStoryboardFile-iphoneos~iphone)'
  expect 1 built iphone-manifest 'qualified scene key appears (UIApplicationSceneManifest~iphone)'
  expect 1 built ipad-multiple 'qualified scene key appears (UIApplicationSupportsMultipleScenes~ipad)'
  expect 1 built platform-delegate 'qualified scene key appears (UISceneDelegateClassName-iphoneos)'
  expect 0 built qualified-launch 'no UIMainStoryboardFile or UISceneStoryboardFile'
  expect 0 source source-good 'UISceneDelegateClassName $(PRODUCT_MODULE_NAME).SceneDelegate'
  expect 1 source good-xml 'UISceneDelegateClassName is "App.SceneDelegate", want $(PRODUCT_MODULE_NAME).SceneDelegate'
  expect 2 built garbage 'plutil cannot read'
  if [ "$bad" = 0 ]; then echo "scene-plist self-test: $n cases, every verdict as expected"; exit 0; fi
  echo "scene-plist self-test: $bad of $n cases wrong"; exit 1
}

case "${1:-}" in
  --self-test) [ $# = 1 ] || usage; self_test ;;
  --source) [ $# = 2 ] || usage; check source "$2"; exit $? ;;
  -*|'') usage ;;
  *) [ $# = 1 ] || usage; check built "$1"; exit $? ;;
esac
