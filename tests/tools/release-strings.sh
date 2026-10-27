#!/bin/bash
# RELEASE-STRINGS (plan 20-order 4.1; contract delta 16.6): no Debug-only code in a Release binary, on every slice.
#
#   tests/tools/release-strings.sh <Release App.app> <Debug App.app>
#
# The gate's first form grepped the Release binary for the Debug launch arguments and probe names (-fpShellProbe,
# -fpOpenURL, -devNav, tapTab, sceneReplay). Swift keeps a literal of 15 UTF-8 bytes or fewer as an immediate (a small
# string) in optimized code, never as a C string, so on arm64 that grep finds nothing whatever the binary holds, and on
# x86_64 only some of them (the H11 review). This checks each slice of the Release binary for:
#   1. the type names only Debug code defines, in the binary's strings (Swift's type metadata keeps them in every build);
#   2. one long literal (16 bytes or more: a C string in every build) from each Debug-only area;
#   3. Debug-only members by their demangled symbol names (a Release `build` keeps its symbol table; an archive strips it,
#      so a binary whose symbols cannot be read, for want of the Release members named in VISIBLE, fails here);
#   4. the old short tokens, as a supplement.
# It proves it can see 1 to 3 by finding each of them in the same slice of the Debug build (Xcode's App.debug.dylib,
# where a Debug build keeps the app's code, or the app's binary when there is none). A name or literal renamed in the code
# fails that Debug half: update the lists below with the code. Exit 0 when every slice is clean and every check could
# see; 1 otherwise; 2 on bad arguments.
set -u
REL=${1:-}
DBG=${2:-}
if [ -z "$REL" ] || [ -z "$DBG" ] || [ ! -d "$REL" ] || [ ! -d "$DBG" ]; then
  echo "usage: $0 <Release App.app> <Debug App.app>" >&2
  exit 2
fi
RBIN="$REL/App"
DBIN="$DBG/App.debug.dylib"
[ -f "$DBIN" ] || DBIN="$DBG/App"
for f in "$RBIN" "$DBIN"; do [ -f "$f" ] || { echo "no binary at $f" >&2; exit 2; }; done

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

fail=0
row() { printf '%-4s %-7s release %-4s debug %-4s %s\n' "$1" "$2" "$3" "$4" "$5"; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
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
  nm -arch "$arch" "$RBIN" 2>/dev/null | xcrun swift-demangle > "$ry"
  for n in "${TYPES[@]}" "${LONG[@]}"; do
    r=$(grep -cF -- "$n" "$rs"); d=$(grep -cF -- "$n" "$ds")
    if [ "$r" = 0 ] && [ "$d" != 0 ]; then row ok "$arch" "$r" "$d" "$n"; else row FAIL "$arch" "$r" "$d" "$n"; fail=1; fi
  done
  for n in "${VISIBLE[@]}"; do
    r=$(grep -cF -- "$n" "$ry")
    if [ "$r" != 0 ]; then row ok "$arch" "$r" - "symbols readable: $n"; else row FAIL "$arch" "$r" - "symbols readable: $n (stripped?)"; fail=1; fi
  done
  for n in "${SYMS[@]}"; do
    r=$(grep -cF -- "$n" "$ry"); d=$(grep -cF -- "$n" "$dy")
    if [ "$r" = 0 ] && [ "$d" != 0 ]; then row ok "$arch" "$r" "$d" "symbol $n"; else row FAIL "$arch" "$r" "$d" "symbol $n"; fail=1; fi
  done
  t=$(grep -cE -- "$TOKENS" "$rs")
  if [ "$t" = 0 ]; then row ok "$arch" "$t" - "the first gate's tokens (a supplement)"; else row FAIL "$arch" "$t" - "the first gate's tokens"; fail=1; fi
done
echo "RELEASE-STRINGS: $([ $fail = 0 ] && echo clean || echo FAILED) ($(lipo -archs "$RBIN"))"
exit $fail
