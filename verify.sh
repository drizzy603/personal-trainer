#!/bin/bash
# Alzo pre-commit / pre-archive check.
#
#   ./verify.sh          — static checks (fast, no dependencies beyond node+python3)
#
# The whole app is one HTML file: a single JS syntax error blanks every screen.
# This extracts all <script> blocks, syntax-checks the combined output, bans
# curly quotes in code (they have shipped a blank app before), and cross-checks
# every inline event handler against the functions that actually exist.
set -e
cd "$(dirname "$0")"

node -e "
var fs=require('fs');
var html=fs.readFileSync('index.html','utf8');
var re=/<script\b[^>]*>([\s\S]*?)<\/script>/gi, parts=[], m;
while((m=re.exec(html))!==null) parts.push(m[1]);
fs.writeFileSync('/tmp/alzo-verify.js', parts.join('\n'));
"
node --check /tmp/alzo-verify.js
echo "✓ script blocks parse"

node --check sw.js
echo "✓ sw.js parses"

# The native shell's OTA loader only applies the live page when its build
# stamp is strictly newer than the bundled one — an index.html change without
# a <meta build> bump is invisible to installed native apps forever.
if git rev-parse --verify HEAD >/dev/null 2>&1 && ! git diff --quiet HEAD -- index.html; then
  OLD_BUILD=$(git show HEAD:index.html | grep -oE '<meta name="build" content="[0-9-]+"' || true)
  NEW_BUILD=$(grep -oE '<meta name="build" content="[0-9-]+"' index.html || true)
  if [ "$OLD_BUILD" = "$NEW_BUILD" ]; then
    echo "FAIL: index.html changed but <meta build> was not bumped."
    echo "      Native apps only OTA-update on a strictly newer stamp."
    echo "      Set it to $(date +%Y%m%d)-N before committing."
    exit 1
  fi
  echo "✓ build stamp bumped (${NEW_BUILD#*content=})"
fi

python3 - <<'EOF'
import re, sys
html = open('index.html').read()
js = '\n'.join(re.findall(r'<script\b[^>]*>([\s\S]*?)</script>', html))

curly = re.findall(u'[‘’“”]', js)
if curly:
    sys.exit('FAIL: %d curly quote(s) in script blocks — use straight quotes or \\u escapes' % len(curly))
print('✓ no curly quotes in JS')

called = set(re.findall(r'on(?:click|input|change|keydown|blur|focus)="?\\?\'?\s*(?:\(function\(\)\{)?([A-Za-z_$][\w$]*)\s*\(', html))
defined = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', js))
defined |= set(re.findall(r'var\s+([A-Za-z_$][\w$]*)\s*=\s*function', js))
ok = {'document','window','localStorage','event','setTimeout','String','parseInt',
      'parseFloat','requestAnimationFrame','function','if'}
missing = sorted(n for n in called if n not in defined and n not in ok)
if missing:
    sys.exit('FAIL: inline handlers reference undefined functions: %s' % ', '.join(missing))
print('✓ all inline handlers resolve (%d checked)' % len(called))
EOF

echo "ALL CHECKS PASSED"
