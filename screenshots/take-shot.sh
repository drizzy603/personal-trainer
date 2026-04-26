#!/usr/bin/env bash
# Capture a screenshot from the booted iOS simulator into screenshots/out/.
#
# Usage:
#   ./screenshots/take-shot.sh log         # → screenshots/out/log.png
#   ./screenshots/take-shot.sh progress
#   ./screenshots/take-shot.sh coach
#   ./screenshots/take-shot.sh library
#   ./screenshots/take-shot.sh settings

set -euo pipefail
cd "$(dirname "$0")"

NAME="${1:-shot-$(date +%Y%m%d-%H%M%S)}"
mkdir -p out
xcrun simctl io booted screenshot "out/${NAME}.png"
echo "Saved: screenshots/out/${NAME}.png"
