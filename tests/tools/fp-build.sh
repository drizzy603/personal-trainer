#!/bin/bash
# Builds that know their tree (plan 13-tests-release.md T14, D-T8): the one build path of the native tools
# (tests/native-shell.sh, tests/native-store.sh, test-native.sh).
#
#   tests/tools/fp-build.sh <tool>                  # build the App scheme (Debug, simulator) as build 61 at least
#   tests/tools/fp-build.sh <tool> --no-build       # reuse the last build: exit 1, naming what differs, unless it is
#                                                   # this tree's (HEAD, the dirty state, the page's stamp)
#   tests/tools/fp-build.sh <tool> --no-build=any   # reuse it whatever tree it came from, saying so first
#   tests/tools/fp-build.sh --self-test             # the stamp and its check on a scratch repository (no xcodebuild)
#
# <tool> names the folder: ~/Library/Caches/FPKit/<checkout>/dd-<tool>, where <checkout> is "main" for the main
# checkout and the worktree's folder name otherwise (the ios/App/FPKit/.build link's name). Never /tmp: the machine
# purges it, and one shared folder let a --no-build run test whichever worktree built last. The folder is printed on
# stdout (the app is Build/Products/Debug-iphonesimulator/App.app in it, the log build.log); everything else goes to
# stderr, so a tool reads it as DD=$(tests/tools/fp-build.sh shell).
#
# A build: one build of this checkout at a time (its www/ and ios/App/App/public are shared:
# ~/Library/Caches/FPKit/<checkout>/build.lock); a build slot (build.slot.1-2, tests/tools/simlock.sh) unless this run
# holds the paired simulators, where the build counts under that hold (20-order.md 1.5: nothing waits for a slot while
# holding sim.lock); build:web, cap copy, xcodebuild; Package.resolved put back when the build rewrote it from a clean
# copy (its originHash follows the checkout's path); the tree must not have changed meanwhile; the scene rule
# (tests/tools/scene-plist.sh) on the built app; then build-id.txt beside it:
#   head <HEAD>  ·  tree clean | tree dirty <hash of the diff from HEAD and the untracked files>  ·  page <the stamp of
#   the bundled public/index.html>  ·  build <CFBundleVersion>  ·  app <hash of every file in App.app>  ·  tool,
#   worktree, built (when).
# Untracked symlinks (the worktrees' node_modules links) are not part of the tree's state; untracked files are.
# --no-build compares head, tree and page with the tree it runs in, checks the app is still the one stamped (app), and
# runs the scene rule again; =any reports the same and goes on.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/simlock.sh"

say() { echo "$*" >&2; }
die() { echo "FAIL: $*" >&2; exit 1; }
APP_REL=Build/Products/Debug-iphonesimulator/App.app

# The stamp of a page file ("none" without one).
page_stamp() {
  local s
  s=$(grep -oE '<meta name="build" content="[^"]+"' "$1" 2>/dev/null | head -1 | sed 's/.*content="//; s/"$//' || true)
  echo "${s:-none}"
}

# The tree's state, for the repository in the current folder: "clean" or "dirty <hash>".
tree_state() {
  local f u="" changed=0
  git diff --quiet HEAD -- 2>/dev/null || changed=1
  while IFS= read -r -d '' f; do
    [ -L "$f" ] || [ ! -f "$f" ] && continue
    u="$u$(shasum -a 256 "$f")
"
  done < <(git ls-files -z --others --exclude-standard)
  if [ "$changed" = 0 ] && [ -z "$u" ]; then echo clean; return 0; fi
  echo "dirty $( { git -c core.quotepath=off diff --no-color --no-ext-diff --binary HEAD --; printf '%s' "$u"; } | shasum -a 256 | cut -c1-16)"
}

# The identity of the tree in the current folder, three lines: head, tree, page.
tree_id() {
  echo "head $(git rev-parse HEAD)"
  echo "tree $(tree_state)"
  echo "page $(page_stamp index.html)"
}

# A fingerprint of every file in the app.
app_print() {
  ( cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 ) | shasum -a 256 | cut -c1-16
}

# field <file> <name>: the value of one line of build-id.txt.
field() { sed -n "/^$2 /{s/^$2 //p;q;}" "$1" 2>/dev/null || true; }

# write_id <dd> <tool> <tree id>: build-id.txt for the app in <dd>, built from the tree <tree id> names.
write_id() {
  local dd="$1" tool="$2" id="$3" app="$1/$APP_REL"
  {
    printf '%s\n' "$id" | sed -n '/^head /p; /^tree /p'
    echo "page $(page_stamp "$app/public/index.html")"
    echo "build $(plutil -extract CFBundleVersion raw -o - "$app/Info.plist" 2>/dev/null || echo unknown)"
    echo "app $(app_print "$app")"
    echo "tool $tool"
    echo "worktree $(fp_tree_name)"
    echo "built $(date '+%F %T')"
  } > "$dd/build-id.txt.new"
  mv "$dd/build-id.txt.new" "$dd/build-id.txt"
}

# The build's identity in one line.
id_line() {
  local f="$1"
  echo "head $(field "$f" head | cut -c1-7) · tree $(field "$f" tree) · page $(field "$f" page) · build $(field "$f" build) · built $(field "$f" built) by fp-build $(field "$f" tool) ($(field "$f" worktree))"
}

# check <dd> <check|any>: the build in <dd> against the tree in the current folder.
check() {
  local dd="$1" mode="$2" app="$1/$APP_REL" f="$1/build-id.txt" now diffs="" h1 h2
  [ -d "$app" ] || die "no app in $dd: nothing built there for this checkout yet (run without --no-build)"
  if [ ! -f "$f" ]; then
    [ "$mode" = any ] || die "$dd has no build-id.txt: a build no fp-build finished, from a tree unknown (run without --no-build, or --no-build=any)"
    say "fp-build: --no-build=any: $app has no build-id.txt, so its tree is unknown; running it as it is"
  else
    now=$(tree_id)
    h1=$(field "$f" head); h2=$(printf '%s\n' "$now" | sed -n 's/^head //p')
    [ "$h1" = "$h2" ] || diffs="$diffs
  head: built from ${h1:0:7}, this tree is at ${h2:0:7}"
    h1=$(field "$f" tree); h2=$(printf '%s\n' "$now" | sed -n 's/^tree //p')
    [ "$h1" = "$h2" ] || diffs="$diffs
  tree: built $h1, this tree is $h2"
    h1=$(field "$f" page); h2=$(printf '%s\n' "$now" | sed -n 's/^page //p')
    [ "$h1" = "$h2" ] || diffs="$diffs
  page: built with $h1, this tree's index.html is $h2"
    h1=$(field "$f" app); h2=$(app_print "$app")
    [ "$h1" = "$h2" ] || diffs="$diffs
  app: the app in $dd is not the one stamped (stamped $h1, now $h2: built again by something else)"
    if [ -n "$diffs" ]; then
      if [ "$mode" = any ]; then
        say "fp-build: --no-build=any: running another tree's build: $(id_line "$f")"
        say "fp-build: it differs from this tree:$diffs"
      else
        die "the build in $dd is not this tree's ($(id_line "$f")):$diffs
  Run without --no-build to build this tree, or pass --no-build=any to run that build anyway."
      fi
    else
      say "fp-build: --no-build: this tree's build: $(id_line "$f")"
    fi
  fi
  "$HERE/scene-plist.sh" "$app/Info.plist" >&2 || die "the app in $dd breaks the scene rule (above)"
}

RESOLVED=ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved

# build <tool> <dd>
build() {
  local tool="$1" dd="$2" app="$2/$APP_REL" root proj n id0 id1 rclean=0
  root=$(dirname "$dd")
  fp_lock "$root/build.lock" "fp-build $tool" "this checkout's builds ($root/build.lock)"
  if fp_simlock_held; then
    say "fp-build: this run holds the paired simulators, so the build counts under that hold (no build slot)"
  else
    fp_slot "$FP_LOCKS_ROOT/build.slot" 2 "fp-build $tool" "a build slot ($FP_LOCKS_ROOT/build.slot)"
    say "fp-build: building in build slot $FP_SLOT ($FP_LOCKS_ROOT/build.slot.$FP_SLOT)"
  fi
  proj=$(grep -m1 'CURRENT_PROJECT_VERSION = ' ios/App/App.xcodeproj/project.pbxproj | sed 's/[^0-9]//g')
  n=$(( proj >= 61 ? proj : 61 ))
  git diff --quiet HEAD -- "$RESOLVED" 2>/dev/null && rclean=1
  id0=$(tree_id)
  mkdir -p "$dd"
  rm -f "$dd/build-id.txt"
  say "── fp-build $tool: refreshing www/ and building the App scheme as build $n (Debug, simulator) into $dd"
  npm run --silent build:web >&2 || die "npm run build:web failed"
  npx cap copy ios >/dev/null || die "npx cap copy ios failed"
  if ( cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
        -destination 'generic/platform=iOS Simulator' -derivedDataPath "$dd" build CODE_SIGNING_ALLOWED=NO \
        CURRENT_PROJECT_VERSION="$n" ) >"$dd/build.log" 2>&1 && grep -q '\*\* BUILD SUCCEEDED \*\*' "$dd/build.log"; then
    say "   build succeeded ($dd/build.log)"
  else
    [ "$rclean" = 1 ] && git checkout -- "$RESOLVED" 2>/dev/null
    grep -E 'error:|BUILD FAILED' "$dd/build.log" | head -20 >&2 || true
    die "the build failed (whole log: $dd/build.log)"
  fi
  if [ "$rclean" = 1 ] && ! git diff --quiet HEAD -- "$RESOLVED" 2>/dev/null; then
    git checkout -- "$RESOLVED" && say "   Package.resolved put back (xcodebuild rewrote it)"
  fi
  id1=$(tree_id)
  [ "$id0" = "$id1" ] || die "the tree changed while it was being built, so the build is not stamped: build again
  before: $(printf '%s' "$id0" | tr '\n' ' ')
  after:  $(printf '%s' "$id1" | tr '\n' ' ')"
  "$HERE/scene-plist.sh" "$app/Info.plist" >&2 || die "the built app breaks the scene rule (above), so it is not stamped"
  write_id "$dd" "$tool" "$id0"
  say "   build-id.txt: $(id_line "$dd/build-id.txt")"
}

# ---------------------------------------------------------------------------------------------------------------------
# The self-test: a scratch repository and a stand-in app (no xcodebuild); every refusal and what it names.
self_test() {
  local t repo dd app n=0 bad=0 out rc
  t=$(mktemp -d "${TMPDIR:-/tmp}/fp-build.XXXXXX")
  FPB_ST=$t
  trap 'rm -rf "$FPB_ST"' EXIT
  repo="$t/repo"; dd="$t/dd-test"; app="$dd/$APP_REL"
  mkdir -p "$repo" "$app/public"
  cd "$repo"
  git init -q . && git config user.email t@t && git config user.name t
  printf '<html><head><meta name="build" content="20990101-1"/></head></html>\n' > index.html
  printf 'one\n' > other.txt
  git add index.html other.txt && git commit -q -m one
  ln -s /tmp node_modules   # a worktree's link: never part of the tree's state
  cp index.html "$app/public/index.html"
  cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleVersion</key><string>61</string>
<key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><false/>
<key>UISceneConfigurations</key><dict><key>UIWindowSceneSessionRoleApplication</key><array><dict>
<key>UISceneConfigurationName</key><string>Default Configuration</string>
<key>UISceneDelegateClassName</key><string>App.SceneDelegate</string></dict></array></dict></dict></dict></plist>
PLIST
  printf 'binary\n' > "$app/App"
  stamp() { write_id "$dd" test "$(tree_id)"; }
  # run <want exit> <mode> <label> <text...>: the check in a subshell; its exit code and every text in its output
  run() {
    local want="$1" mode="$2" label="$3" t; shift 3
    n=$((n + 1))
    rc=0; out=$( (check "$dd" "$mode") 2>&1 ) || rc=$?
    local okk=1; [ "$rc" = "$want" ] || okk=0
    for t in "$@"; do grep -qF -- "$t" <<<"$out" || okk=0; done
    if [ "$okk" = 1 ]; then echo "  ok   $label"; else bad=$((bad + 1)); echo "  BAD  $label (exit $rc, want $want)"; printf '%s\n' "$out" | sed 's/^/       /'; fi
  }
  echo "fp-build self-test (scratch repository in $repo)"
  stamp
  if [ "$(field "$dd/build-id.txt" head)" = "$(git rev-parse HEAD)" ] && [ "$(field "$dd/build-id.txt" tree)" = clean ] \
     && [ "$(field "$dd/build-id.txt" page)" = 20990101-1 ] && [ "$(field "$dd/build-id.txt" build)" = 61 ]; then
    n=$((n + 1)); echo "  ok   build-id.txt: head, tree clean (the node_modules link ignored), page, build"
  else n=$((n + 1)); bad=$((bad + 1)); echo "  BAD  build-id.txt"; sed 's/^/       /' "$dd/build-id.txt"; fi
  run 0 check "this tree's build is taken" "this tree's build" "✓ scene-plist"
  # another commit
  printf 'two\n' > other.txt; git commit -qam two
  run 1 check "another commit is refused, naming head" "head: built from" "Run without --no-build"
  run 0 any "--no-build=any runs it, saying whose and what differs" "running another tree's build" "head: built from"
  stamp
  # an edit, a page stamp, an untracked file
  printf 'three\n' > other.txt
  run 1 check "an edit is refused, naming the tree" "tree: built clean, this tree is dirty"
  git checkout -q -- other.txt
  sed -i '' 's/20990101-1/20990101-2/' index.html
  run 1 check "another page stamp is refused, naming tree and page" "tree: built clean" "page: built with 20990101-1, this tree's index.html is 20990101-2"
  git checkout -q -- index.html
  printf 'x\n' > new.swift
  run 1 check "an untracked file is refused, naming the tree" "tree: built clean, this tree is dirty"
  # a dirty build: the same dirty state is taken, another is refused
  stamp
  run 0 check "a dirty tree's own build is taken" "this tree's build" "tree dirty"
  printf 'y\n' > new.swift
  run 1 check "another dirty state is refused" "tree: built dirty"
  rm new.swift
  stamp
  # the acceptance's line: build-id.txt edited to name another HEAD
  sed -i '' 's/^head .*/head 0000000/' "$dd/build-id.txt"
  run 1 check "a build-id.txt naming another HEAD is refused" "head: built from 0000000"
  stamp
  # the app built again behind the stamp
  printf 'rebuilt\n' > "$app/App"
  run 1 check "an app changed since its stamp is refused, naming app" "app: the app in"
  stamp
  # the scene rule on --no-build
  plutil -insert UIMainStoryboardFile -string Main "$app/Info.plist"
  stamp
  run 1 check "an app breaking the scene rule is refused even when its stamp matches" "UIMainStoryboardFile appears 1 time(s)" "breaks the scene rule"
  plutil -remove UIMainStoryboardFile "$app/Info.plist"
  # no stamp at all
  rm "$dd/build-id.txt"
  run 1 check "no build-id.txt is refused" "has no build-id.txt"
  run 0 any "--no-build=any runs an unstamped app, saying its tree is unknown" "its tree is unknown"
  rm -rf "$app"
  run 1 any "no app at all is refused, even with =any" "no app in"
  if [ "$bad" = 0 ]; then echo "fp-build self-test: $n cases, every verdict as expected"; return 0; fi
  echo "fp-build self-test: $bad of $n cases wrong"; return 1
}

usage() { echo "usage: $0 <tool> [--no-build | --no-build=any] | --self-test" >&2; exit 2; }

[ $# -ge 1 ] || usage
if [ "$1" = --self-test ]; then [ $# = 1 ] || usage; self_test; exit $?; fi
TOOL="$1"; shift
case "$TOOL" in ''|*[!a-z0-9-]*) usage ;; esac
MODE=build
case "${1:-}" in
  '') ;;
  --no-build) MODE=check ;;
  --no-build=any) MODE=any ;;
  *) usage ;;
esac
[ $# -le 1 ] || usage

cd "$HERE/../.."
DD="$FP_LOCKS_ROOT/$(fp_tree_name)/dd-$TOOL"
if [ "$MODE" = build ]; then build "$TOOL" "$DD"; else check "$DD" "$MODE"; fi
printf '%s\n' "$DD"
