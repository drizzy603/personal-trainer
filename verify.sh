#!/bin/bash
# Supero pre-commit / pre-archive check.
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
fs.writeFileSync('/tmp/supero-verify.js', parts.join('\n'));
"
node --check /tmp/supero-verify.js
echo "✓ script blocks parse"

node --check sw.js
echo "✓ sw.js parses"

# The native shell's storage facade (FPStore, build 60+) is injected at document start and replaces
# window.localStorage with an object that has getItem, setItem, removeItem, clear, key and length. So the
# page may touch localStorage only through getItem, setItem, removeItem, key and length: an index, a named
# property, an assignment or an alias would miss the facade (a write lost from the native copy). Checked in
# script code and strings (inline handlers built as text) and in the page's own on*="" attributes; comments
# and prose are ignored. The facade itself must parse and carries no curly quotes either.
FACADE=ios/App/FPKit/Sources/FPStore/Resources/ktstore.js
node --check "$FACADE"
echo "✓ ktstore.js parses"
node - "$FACADE" <<'EOF'
var fs = require('fs');
var facade = fs.readFileSync(process.argv[2], 'utf8');
var CURLY = new RegExp('[' + String.fromCharCode(0x2018, 0x2019, 0x201c, 0x201d) + ']', 'g');
var cq = facade.match(CURLY);
if (cq) { console.error('FAIL: ' + cq.length + ' curly quote(s) in ' + process.argv[2] + ' (use straight quotes or escapes)'); process.exit(1); }
console.log('✓ no curly quotes in ktstore.js');

var html = fs.readFileSync('index.html', 'utf8');
// After `localStorage`: a call of getItem, setItem, removeItem or key, or a read of length.
var ALLOWED = /^\s*\.\s*(?:(?:getItem|setItem|removeItem|key)\s*\(|length\b(?!\s*(?:=(?!=)|\+\+|--|[-+*\/%&|^]=)))/;
var bad = [], uses = 0;
function lineAt(pos) { var n = 1; for (var i = 0; i < pos; i++) if (html.charCodeAt(i) === 10) n++; return n; }
function isId(c) { return !!c && (/[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) > 127); }
function isIdStart(c) { return /[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 127; }
// One `localStorage` at html[pos]: a method call or a read of .length, else a violation.
function checkOne(pos) {
  uses++;
  if (!ALLOWED.test(html.slice(pos + 12, pos + 80))) bad.push(pos);
}
// Every `localStorage` in html[from, to): a string's content, a regex, an attribute value.
function checkText(from, to) {
  var text = html.slice(from, to), re = /localStorage/g, m;
  while ((m = re.exec(text)) !== null) if (!isId(text[m.index - 1]) && !isId(text[m.index + 12])) checkOne(from + m.index);
}
// A small JS scanner over one script block, html[i, n): strings, templates, regex literals and comments are told
// apart, so comments are skipped, a `//` inside a string is not taken for one, and an inline handler built as text
// is still checked.
var KW = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
function scan(i, n) {
  var src = html, last = '', tpl = [], brace = 0;
  function readTemplate() {   // just past a backtick, or past the } closing a ${: to the closing backtick or the next ${
    var s = i;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { checkText(s, i); i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') { checkText(s, i); i += 2; tpl.push(brace); brace++; return; }
      i++;
    }
  }
  while (i < n) {
    var c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { var e = src.indexOf('*/', i + 2); i = e < 0 || e > n ? n : e + 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      var s = ++i;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      checkText(s, i); i++; last = 'str'; continue;
    }
    if (c === '`') { i++; readTemplate(); last = 'str'; continue; }
    if (c === '/') {
      var rx = !last || (last.charAt(0) === 'w' ? KW.test(last.slice(1)) : (last.charAt(0) === 'p' && last !== 'p)' && last !== 'p]'));
      if (rx) {
        var s2 = ++i, cls = false;
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break;
          i++;
        }
        checkText(s2, i); i++;
        while (i < n && isId(src[i])) i++;
        last = 'str'; continue;
      }
      i++; last = 'p/'; continue;
    }
    if (isIdStart(c)) {
      var w0 = i; while (i < n && isId(src[i])) i++;
      var word = src.slice(w0, i);
      if (word === 'localStorage') checkOne(w0);
      last = 'w' + word; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { while (i < n && /[0-9A-Za-z_.]/.test(src[i])) i++; last = 'n'; continue; }
    if (c === '{') brace++;
    if (c === '}') {
      if (tpl.length && tpl[tpl.length - 1] === brace - 1) { tpl.pop(); brace--; i++; readTemplate(); last = 'str'; continue; }
      brace--;
    }
    last = 'p' + c; i++;
  }
}
var re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi, m, blocks = [];
while ((m = re.exec(html)) !== null) {
  var body = m.index + m[0].indexOf('>') + 1;
  scan(body, body + m[1].length);
  blocks.push([m.index, m.index + m[0].length]);
}
// The page's own markup outside the scripts: inline handlers only (prose such as the privacy copy may say it).
var attr = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, a;
while ((a = attr.exec(html)) !== null) {
  var inScript = blocks.some(function (b) { return a.index >= b[0] && a.index < b[1]; });
  if (!inScript) checkText(a.index + a[0].length - a[1].length, a.index + a[0].length);
}
if (bad.length) {
  console.error('FAIL: index.html touches localStorage other than through getItem, setItem, removeItem, key and length');
  console.error('      (the storage facade sees only those; anything else is missed by the native copy):');
  bad.slice(0, 20).forEach(function (p) { console.error('      index.html:' + lineAt(p) + ': ' + html.slice(Math.max(0, p - 20), p + 50).replace(/\s+/g, ' ')); });
  process.exit(1);
}
console.log('✓ localStorage only through getItem/setItem/removeItem/key/length (' + uses + ' uses)');
EOF

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

# build.txt mirrors <meta build> — the native shell polls this 12-byte file
# instead of downloading the whole page to learn whether an update exists.
STAMP=$(grep -oE '<meta name="build" content="[0-9-]+"' index.html | grep -oE '[0-9]+-[0-9]+')
if [ "$(cat build.txt 2>/dev/null | tr -d '[:space:]')" != "$STAMP" ]; then
  echo "$STAMP" > build.txt
  echo "✓ build.txt synced to $STAMP — stage it with index.html"
fi
