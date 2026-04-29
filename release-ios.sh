#!/usr/bin/env bash
# Pre-flight before an Xcode archive:
#   1. Bump <meta build> in index.html (drives the in-app updater)
#   2. Bump CURRENT_PROJECT_VERSION (App Store Connect rejects duplicate build numbers)
#   3. Refresh www/ from the repo-root sources
#   4. Sync web assets into the iOS bundle via Capacitor
# Then archive in Xcode.

set -euo pipefail
cd "$(dirname "$0")"

PROJ="ios/App/App.xcodeproj/project.pbxproj"
INDEX="index.html"

# 1. Bump <meta build="YYYYMMDD-N">. If today already has builds, increment N;
# otherwise start at 1 for the new day.
TODAY=$(date +%Y%m%d)
CUR_BUILD=$(grep -oE 'meta name="build" content="[0-9]+-[0-9]+"' "$INDEX" | grep -oE '[0-9]+-[0-9]+')
CUR_DATE=${CUR_BUILD%-*}
CUR_N=${CUR_BUILD#*-}
if [ "$CUR_DATE" = "$TODAY" ]; then
  NEXT_N=$((CUR_N + 1))
else
  NEXT_N=1
fi
NEW_BUILD="${TODAY}-${NEXT_N}"
sed -i.bak -E "s|<meta name=\"build\" content=\"[0-9]+-[0-9]+\"/>|<meta name=\"build\" content=\"${NEW_BUILD}\"/>|" "$INDEX"
rm "${INDEX}.bak"
echo "Web build:    ${CUR_BUILD} → ${NEW_BUILD}"

# 2. Bump iOS CFBundleVersion.
CURRENT=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PROJ" | grep -oE '[0-9]+')
NEXT=$((CURRENT + 1))
sed -i.bak -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${NEXT};/g" "$PROJ"
rm "${PROJ}.bak"
echo "iOS build:    ${CURRENT} → ${NEXT}"

# 3 + 4. Refresh www/ from repo-root sources, then sync into the iOS bundle.
npm run --silent build:web
npx cap copy ios

cat <<EOF

Ready to archive in Xcode:
  • Destination: Any iOS Device (arm64)
  • Product → Archive
  • Distribute App → App Store Connect → Upload
EOF
