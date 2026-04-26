#!/usr/bin/env bash
# Pre-flight before an Xcode archive:
#   1. Bump CURRENT_PROJECT_VERSION (App Store Connect rejects duplicate build numbers)
#   2. Sync web assets into the iOS bundle via Capacitor
# Then archive in Xcode.

set -euo pipefail
cd "$(dirname "$0")"

PROJ="ios/App/App.xcodeproj/project.pbxproj"

CURRENT=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PROJ" | grep -oE '[0-9]+')
NEXT=$((CURRENT + 1))

sed -i.bak -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${NEXT};/g" "$PROJ"
rm "${PROJ}.bak"

echo "Build number: ${CURRENT} → ${NEXT}"

npx cap copy ios

cat <<EOF

Ready to archive in Xcode:
  • Destination: Any iOS Device (arm64)
  • Product → Archive
  • Distribute App → App Store Connect → Upload
EOF
