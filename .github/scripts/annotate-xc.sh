#!/bin/bash
# Turns xcodebuild / swift test logs into GitHub annotations: a run's log needs a login, its annotations do not.
# GitHub keeps 10 error annotations a step, so the ten name failures, not a log's first ten error lines (CI run
# 40886265725 named 3 failing cases, seven of its ten lines from one case's sixteen; the same classes on iOS 26.5
# fail 7 cases on a Mac and give exactly those ten). First one line for each failed test case, in the order the log
# meets them (its first failure line, which says where and why; a case with none, lost in a crash or a hang or only
# listed under "Failing tests:", by the line that names it), then the lines that fail the run outside any case
# (compile errors, xcodebuild's own, the reasons under "Testing failed:", SwiftPM's line for a crashed test process),
# then the cases' other failure lines while room is left. Notices are counted apart from errors: one per test log says
# how many tests ran, failed (with their failure lines) and were skipped, and up to three more name the failed cases
# with their counts of failure lines (about 35 names fit; the last notice says how many more there are).
# A swift test log is read as SwiftPM wrote it: SwiftPM relays the test process's output in 4096-byte pieces and, when
# that process crashes, writes its own "error: Process '<xctest> <bundle>' exited with unexpected signal code N"
# between two of them, so in a 2>&1 log that line can start inside another, whose rest is the next line (SwiftPM 6.4.2:
# "Test Case '-[M.C testB_pa" then its line, and on the next "sses]' passed (0.000 seconds).").
# Usage: annotate-xc.sh LOG...  (a missing log is skipped; always exits 0)
# Test: bash .github/scripts/annotate-xc-test.sh
logs=()
for f in "$@"; do [ -f "$f" ] && [ -r "$f" ] && logs+=("$f"); done
[ ${#logs[@]} -gt 0 ] || exit 0

# awk prints "kind<US>title<US>text" lines (kind E = error, N = notice); the loop below formats them.
read -r -d '' pick <<'AWK'
# A case's key is Class.method, whichever way the log names it: -[Module.Class method], Module.Class/method(),
# Class.method() (with anything after it).
function key(s,   n, p, sp) {
  if (s ~ /^-\[/) {
    sub(/^-\[/, "", s); sub(/\].*$/, "", s)
    sp = index(s, " "); if (sp) s = substr(s, 1, sp - 1) "." substr(s, sp + 1)
  } else sub(/[ \t(].*$/, "", s)
  gsub(/\//, ".", s)
  n = split(s, p, ".")
  return n >= 2 ? p[n - 1] "." p[n] : s
}
function mark(k) { if (!(k in seen)) { seen[k] = 1; order[++nc] = k; cfile[k] = file } }
# Evidence that a case failed: its failed line, xcodebuild's list, a start with no end, a failure line naming it.
function failed(k, t) { mark(k); hard[k] = 1; if (!(k in named)) named[k] = t }
# A failure line of a case; one met inside a case without naming it (a fatal error) counts once the case fails.
function issue(k, t, definite) {
  mark(k); if (definite) hard[k] = 1
  if (!(k in first)) first[k] = t
  nis[k]++; line[++nl] = t; lcase[nl] = k
}
function lost(k) {
  if (k == "") return
  gone[k] = 1
  failed(k, "Test Case '" sname[k] "' started and never finished (a crash, a hang or the end of the log)")
}
function ran(k) { if (!(k in st)) { st[k] = 1; nran[file]++ } }
function run(t) { if (!(t in rseen)) { rseen[t] = 1; rl[++nr] = t } }
# Where SwiftPM's crash line starts in s (its last "error: Process '", which runs to the end of s), or 0.
function spm(s,   i, p) {
  p = 0
  while ((i = index(substr(s, p + 1), "error: Process '")) > 0) p += i
  return (p && substr(s, p) ~ /^error: Process '[^']*' exited with unexpected signal code [0-9]+$/) ? p : 0
}
function out(kind, title, text) { print kind US title US text }
function pl(n, word) { return n " " word (n == 1 ? "" : "s") }

BEGIN { US = sprintf("%c", 31); limit = 10 }
FNR == 1 {
  lost(cur); cur = ""; sect = ""; held = ""
  file = FILENAME; sub(/.*\//, "", file); fname[++nf] = file
}
{ gsub(/\r/, "") }
# SwiftPM's crash line is the run's wherever it lands, and a line it split is read whole.
held != "" { $0 = held $0; held = "" }
{ p = spm($0); if (p) { run(substr($0, p)); held = substr($0, 1, p - 1); next } }
/^Failing tests:[ \t]*$/ { sect = "listed"; tlog[file] = 1; next }
/^Testing failed:[ \t]*$/ { sect = "reasons"; tlog[file] = 1; next }
sect != "" && /^[ \t]+[^ \t]/ {
  t = $0; sub(/^[ \t]+/, "", t); sub(/[ \t]+$/, "", t)
  if (sect == "reasons") run("Testing failed: " t)
  else if (t !~ /:$/) failed(key(t), "Failing tests: " t)
  next
}
{ sect = "" }
/^Test Suite '/ || /^\*\* TEST / { tlog[file] = 1 }
/^Test Case '-\[[^]]+\]' / {
  match($0, /^Test Case '-\[[^]]+\]' /)
  name = substr($0, 12, RLENGTH - 13); k = key(name); rest = substr($0, RLENGTH + 1)
  tlog[file] = 1; ran(k)
  if (rest ~ /^started/) { if (cur != k) lost(cur); cur = k; sname[k] = name; next }
  if (rest ~ /^failed/) failed(k, $0)
  else if (rest ~ /^skipped/) nskip[file]++
  if (cur == k) cur = ""
  next
}
# A failure line that names no case counts for the case running: a crash's fatal error (xcodebuild prints it twice,
# the second with a timestamp) and xcodebuild's "Restarting after unexpected exit, crash, or test timeout; summary will
# include totals from previous launches." after it (Xcode 27.2's names no case: a real crash on iOS 26.5).
/(^|: )error: |xcodebuild: error|Fatal error|unexpected exit/ {
  if (match($0, /error: -\[[^]]+\]/)) issue(key(substr($0, RSTART + 7, RLENGTH - 7)), $0, 1)
  else if (cur != "") issue(cur, $0, 0)
  else run($0)
}
END {
  lost(cur)
  n = 0
  for (i = 1; i <= nc; i++) {
    k = order[i]; if (!(k in hard)) continue
    fc[++nfc] = k; fcases[cfile[k]]++; flines[cfile[k]] += nis[k]; if (k in gone) ngone[cfile[k]]++
    if (n < limit) { t = (k in first) ? first[k] : named[k]; out("E", "", t); used[t] = 1; n++ }
  }
  for (i = 1; i <= nr && n < limit; i++) if (!(rl[i] in used)) { out("E", "", rl[i]); used[rl[i]] = 1; n++ }
  for (i = 1; i <= nl && n < limit; i++) {
    t = line[i]; if (!(lcase[i] in hard) || (t in used)) continue
    out("E", "", t); used[t] = 1; n++
  }
  for (i = 1; i <= nf; i++) {
    f = fname[i]; if (!(f in tlog)) continue
    if (nran[f] + fcases[f] == 0) { out("N", "test counts", f ": no test ran"); continue }
    msg = f ": " pl(nran[f] + 0, "test") " ran, " (fcases[f] + 0) " failed (" pl(flines[f] + 0, "failure line") "), "
    msg = msg (nskip[f] + 0) " skipped"
    if (ngone[f]) msg = msg ", " ngone[f] " never finished"
    out("N", "test counts", msg)
  }
  if (!nfc) exit
  msg = pl(nfc, "failed test case") ", failure lines in brackets: "; sep = ""; notes = 0
  for (i = 1; i <= nfc; i++) {
    k = fc[i]
    item = k ((k in gone) ? " (never finished)" : (nis[k] ? " (" nis[k] ")" : ""))
    if (sep != "" && length(msg) + length(item) > 840) {
      if (++notes == 3) { msg = msg ", and " (nfc - i + 1) " more (the log names them)"; break }
      out("N", "failed test cases", msg); msg = "(more) "; sep = ""
    }
    msg = msg sep item; sep = ", "
  }
  out("N", "failed test cases", msg)
}
AWK

awk "$pick" "${logs[@]}" | while IFS=$'\037' read -r kind title text; do
  text=${text:0:900}
  text=${text//%/%25}
  case $kind in
    E) printf '::error::%s\n' "$text" ;;
    N) printf '::notice title=%s::%s\n' "$title" "$text" ;;
  esac
done
exit 0
