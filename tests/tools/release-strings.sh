#!/bin/bash
# RELEASE-STRINGS (plan 20-order 4.1; contract delta 16.6, 17.3): no Debug-only code in a Release binary, on every slice.
#
#   tests/tools/release-strings.sh <Release App.app> <Debug App.app>
#   tests/tools/release-strings.sh --archive <App.xcarchive | its Products/Applications/App.app> <Debug App.app>
#   tests/tools/release-strings.sh --archive <App.app with App.app.dSYM beside it> <Debug App.app>
#
# The gate's first form grepped the Release binary for the Debug launch arguments and probe names (-fpShellProbe,
# -fpOpenURL, -devNav, tapTab, sceneReplay). Swift keeps a literal of 15 UTF-8 bytes or fewer as an immediate (a small
# string) in optimized code, never as a C string, so on arm64 that grep sees a token only where it happens to sit inside
# a longer literal, and on x86_64 only some of the rest (the H11 review: a Release build with the Debug code compiled in
# read 2 lines on arm64, StoreProbe's "no sceneReplay: ..." and "-fpShellProbeLog", and none for the -devNav reader).
# This checks each slice of the Release binary for:
#   1. the type names only Debug code defines, in the binary's strings (Swift's type metadata keeps them in every build);
#   2. one long literal (16 bytes or more: a C string in every build) from each Debug-only area;
#   3. Debug-only members by their demangled symbol names (a Release `build` keeps its symbol table; an archive strips it,
#      and --archive reads its dSYM instead; symbols that cannot be read, for want of the Release members named in
#      VISIBLE, fail here);
#   4. the old short tokens, as a supplement.
# It proves it can see 1 to 3 by finding each of them in the same slice of the Debug build (Xcode's App.debug.dylib,
# where a Debug build keeps the app's code, or the app's binary when there is none). A name or literal renamed in the code
# fails that Debug half: update the lists below with the code. And it ties the two builds together, so a clean answer
# cannot come from the wrong binary (an older archive, a build of something else): each slice of the Release binary must
# carry build 61's shell (WITNESS: type names every Release build of it keeps, found in the Debug build too), and both
# apps must bundle the same page (public/index.html's <meta build>: a Debug build of the same commit stages the same
# page). Both apps' CFBundleVersion are printed; they may differ (tests/tools/fp-build.sh builds as 61 at least). Exit 0
# when every slice is clean and every check could see; 1 otherwise; 2 on bad arguments.
#
# --archive (T28's archive check, delta 17.3): an archive's binary is stripped (the Release configuration strips the
# installed product), so layer 3 reads the archive's dSYM instead (Release is dwarf-with-dsym: dSYMs/App.app.dSYM keeps
# the full symbol table under the binary's UUID), after checking that each slice's UUID is the binary's; a missing or
# mismatched dSYM fails. Give it the .xcarchive (its Products/Applications/App.app and dSYMs/App.app.dSYM are read), or
# that App.app (the dSYM is the archive's, three folders up), or an App.app with App.app.dSYM beside it (a build's
# products), and a Debug build of the same commit: a simulator build will do, since slices are matched by architecture
# name (the archive's arm64 against the simulator build's arm64) and Swift's type names, C-string literals and symbol
# names do not differ between the two platforms.
set -u
ARCHIVE=0
if [ "${1:-}" = --archive ]; then ARCHIVE=1; shift; fi
REL=${1:-}
DBG=${2:-}
case "$REL" in *.xcarchive|*.xcarchive/) REL="${REL%/}/Products/Applications/App.app" ;; esac
if [ $# -ne 2 ] || [ ! -d "$REL" ] || [ ! -d "$DBG" ]; then
  echo "usage: $0 [--archive] <Release App.app | with --archive, an .xcarchive or an App.app with its dSYM> <Debug App.app>" >&2
  exit 2
fi
REL=${REL%/}
RBIN="$REL/App"
DBIN="$DBG/App.debug.dylib"
[ -f "$DBIN" ] || DBIN="$DBG/App"
for f in "$RBIN" "$DBIN"; do [ -f "$f" ] || { echo "no binary at $f" >&2; exit 2; }; done
# --archive: the symbols are the dSYM's (the archive's, else one beside the App.app); the full form reads the binary's own
SBIN="$RBIN"
if [ "$ARCHIVE" = 1 ]; then
  SBIN=""
  for d in "$(dirname "$(dirname "$(dirname "$REL")")")/dSYMs/App.app.dSYM" "$REL.dSYM"; do
    [ -f "$d/Contents/Resources/DWARF/App" ] && { SBIN="$d/Contents/Resources/DWARF/App"; break; }
  done
fi

# 1. Types only Debug code defines (FPUI ShellProbe, FPHost StoreProbe, FPUI ShellBridge's launch options).
TYPES=('ShellProbe' 'StoreProbe' 'ShellDebug')
# 2. One long literal per Debug-only area.
LONG=("the scene's delegate cannot replay a connection"   # App: the sceneCycle hook (and StoreProbe's)
      'no JPEG at Documents/fp-probe/'                    # App: the share hook
      'no App Group container in this build'              # App: the share hook
      'no url with a scheme'                              # App: openURL, openURLOnActive
      "no tab root (the scene's root is classic)"         # FPUI ShellProbe
      'the key field does not hold the keys'              # FPUI ShellProbe: type
      '-fpShellProbeLog'                                  # FPUI ShellProbe: its launch argument (16 bytes)
      'ignored (-fpIgnoreMarker)'                         # FPUI ShellBridge: the Debug launch options
      'no sceneReplay: the App set no root factory'       # FPHost StoreProbe
      'answeredInBackground'                              # FPHost StoreAttach: the probe's event
      '__fpRealLS'                                        # FPHost StoreAttach: the Debug document-start script
      'policy: -fpOffline, nothing fetched')              # FPHost PolicyFetch: -fpOffline
# 3. Debug-only members, by demangled name (internal or public ones: a private member demangles as "(name in _hash)");
#    VISIBLE are Release members that prove the symbol table can be read.
SYMS=('ShellFlagScript.Dev.init(arguments:'               # FPHost: the -devNav, -devTheme, -fpApiBase reader
      'ShellFlagScript.Dev.openURL(arguments:'            # FPHost: -fpOpenURL
      'RootTabController.onFunnelRun'                     # FPUI: the probe's funnel callback
      'RootTabController.onScreenChanged'                 # FPUI: the probe's screen-change callback
      'ShellBridge.debugHooks'                            # FPUI: the App's hooks table
      'ShellBridge.probeEvent('                           # FPUI: the hooks' events to the probe
      'AppDelegate.installProbeHooks('                    # App: the hooks
      'AppDelegate.fireArmedOpen('                        # App: openURLOnActive
      'SceneDelegate.replay(')                            # App: sceneCycle
VISIBLE=('ShellBridge.deepLink(' 'AppDelegate.application(')
# 4. The gate's first tokens.
TOKENS='-fp(ShellProbe|Probe|OpenURL)|tapTab|sceneReplay|-devNav'
# Build 61's shell in Release: types every Release build of it keeps (FPUI's tab root, web view, bridge and page link),
# so a binary without them (an older archive, a build of something else) is not the one to judge.
WITNESS=('RootTabController' 'ShellWebView' 'ShellBridge' 'PageLink')

fail=0
row() { printf '%-4s %-7s release %-4s debug %-4s %s\n' "$1" "$2" "$3" "$4" "$5"; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# The two builds: their build numbers (said) and their bundled pages (the same page, or they are not of one commit).
page() { [ -f "$1/public/index.html" ] && sed -n 's/.*<meta name="build" content="\([0-9]\{8\}-[0-9][0-9]*\)".*/\1/p' "$1/public/index.html" | head -1; }
vers() { /usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$1/Info.plist" 2>/dev/null || echo '?'; }
rp=$(page "$REL"); dp=$(page "$DBG")
echo "release: build $(vers "$REL"), page ${rp:-none} ($REL)"
echo "debug:   build $(vers "$DBG"), page ${dp:-none} ($DBG)"
if [ -n "$rp" ] && [ "$rp" = "$dp" ]; then row ok - - - "both apps bundle page $rp (one commit's builds)"
else row FAIL - - - "the bundled pages differ (release ${rp:-none}, debug ${dp:-none}): give a Debug build of the Release build's commit"; fail=1; fi
if [ "$ARCHIVE" = 1 ] && [ -z "$SBIN" ]; then
  row FAIL - - - "no dSYM for the symbol layer (the archive's dSYMs/App.app.dSYM, or App.app.dSYM beside $REL)"; fail=1
fi
for arch in $(lipo -archs "$RBIN"); do
  rs="$TMP/rel-$arch.strings"; ds="$TMP/dbg-$arch.strings"; ry="$TMP/rel-$arch.syms"; dy="$TMP/dbg-$arch.syms"
  strings -a -arch "$arch" "$RBIN" > "$rs"
  if lipo -archs "$DBIN" | tr ' ' '\n' | grep -qx "$arch"; then
    strings -a -arch "$arch" "$DBIN" > "$ds"
    nm -arch "$arch" "$DBIN" 2>/dev/null | xcrun swift-demangle > "$dy"
  else
    echo "FAIL $arch: the Debug build has no $arch slice, so nothing proves this slice's checks can see" ; fail=1
    : > "$ds"; : > "$dy"
  fi
  : > "$ry"
  if [ -n "$SBIN" ] && [ "$SBIN" != "$RBIN" ]; then
    # the dSYM must be this binary's: the same UUID, slice by slice
    bu=$(dwarfdump --uuid -arch "$arch" "$RBIN" 2>/dev/null | awk '/^UUID:/ {print $2; exit}')
    su=$(dwarfdump --uuid -arch "$arch" "$SBIN" 2>/dev/null | awk '/^UUID:/ {print $2; exit}')
    if [ -n "$bu" ] && [ "$bu" = "$su" ]; then
      row ok "$arch" - - "the dSYM is this binary's (UUID $bu)"
      nm -arch "$arch" "$SBIN" 2>/dev/null | xcrun swift-demangle > "$ry"
    else
      row FAIL "$arch" - - "the dSYM is not this binary's (binary ${bu:-no UUID}, dSYM ${su:-no $arch slice}): ${SBIN%/Contents/*}"; fail=1
    fi
  elif [ -n "$SBIN" ]; then
    nm -arch "$arch" "$SBIN" 2>/dev/null | xcrun swift-demangle > "$ry"
  fi
  for n in "${WITNESS[@]}"; do
    r=$(grep -cF -- "$n" "$rs"); d=$(grep -cF -- "$n" "$ds")
    if [ "$r" != 0 ] && [ "$d" != 0 ]; then row ok "$arch" "$r" "$d" "build 61's shell is here: $n"
    else row FAIL "$arch" "$r" "$d" "build 61's shell is here: $n (missing: not a build 61 Release binary)"; fail=1; fi
  done
  for n in "${TYPES[@]}" "${LONG[@]}"; do
    r=$(grep -cF -- "$n" "$rs"); d=$(grep -cF -- "$n" "$ds")
    if [ "$r" = 0 ] && [ "$d" != 0 ]; then row ok "$arch" "$r" "$d" "$n"; else row FAIL "$arch" "$r" "$d" "$n"; fail=1; fi
  done
  where=$([ "$ARCHIVE" = 1 ] && echo "the dSYM's" || echo "the binary's")
  hint=$([ "$ARCHIVE" = 1 ] && echo "" || echo " (stripped? an archive's binary is: pass --archive, which reads its dSYM)")
  for n in "${VISIBLE[@]}"; do
    r=$(grep -cF -- "$n" "$ry")
    if [ "$r" != 0 ]; then row ok "$arch" "$r" - "symbols readable ($where): $n"; else row FAIL "$arch" "$r" - "symbols readable ($where): $n$hint"; fail=1; fi
  done
  for n in "${SYMS[@]}"; do
    r=$(grep -cF -- "$n" "$ry"); d=$(grep -cF -- "$n" "$dy")
    if [ "$r" = 0 ] && [ "$d" != 0 ]; then row ok "$arch" "$r" "$d" "symbol $n"; else row FAIL "$arch" "$r" "$d" "symbol $n"; fail=1; fi
  done
  t=$(grep -cE -- "$TOKENS" "$rs")
  if [ "$t" = 0 ]; then row ok "$arch" "$t" - "the first gate's tokens (a supplement)"; else row FAIL "$arch" "$t" - "the first gate's tokens"; fail=1; fi
done
echo "RELEASE-STRINGS: $([ $fail = 0 ] && echo clean || echo FAILED) ($(lipo -archs "$RBIN")$([ "$ARCHIVE" = 1 ] && echo "; --archive: the symbols from ${SBIN:-no dSYM}"))"
exit $fail
