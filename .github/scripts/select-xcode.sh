#!/bin/bash
# Selects Xcode VERSION on a GitHub macOS image and checks it is that Xcode (ios-build.yml's jobs run it first).
# GitHub's images keep each Xcode at /Applications/Xcode_<version>.app, and Xcode_X.Y.app follows the newest X.Y.Z, so
# a patch release is taken up and a missing Xcode fails here, naming the ones the image has.
# Usage: select-xcode.sh VERSION    (FPKIT_XCODE_APPS=<folder> looks there instead of /Applications and selects nothing:
#                                   a dry run against a folder of links)
v=$1
[ -n "$v" ] || { echo "usage: select-xcode.sh VERSION" >&2; exit 2; }
apps=${FPKIT_XCODE_APPS:-/Applications}
app="$apps/Xcode_$v.app"
if [ ! -d "$app" ]; then
  have=$(ls -d "$apps"/Xcode*.app 2>/dev/null | sed 's:.*/::' | tr '\n' ' ')
  echo "::error title=Xcode $v::this image has no $app (it has: ${have:-no Xcode})"
  exit 1
fi
got=$(DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -version 2>/dev/null | sed -n 's/^Xcode //p')
case "$got" in
  "$v"|"$v".*) ;;
  *) echo "::error title=Xcode $v::$app is Xcode ${got:-(no version)}, not $v"; exit 1 ;;
esac
if [ -n "$FPKIT_XCODE_APPS" ]; then
  echo "would run: sudo xcode-select -s $app"
else
  sudo xcode-select -s "$app" || exit 1
fi
DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -version
