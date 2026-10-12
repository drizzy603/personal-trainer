// A JavaScript reference of FPStore's native side, build 60 (shadow only), for the Playwright store matrix
// (plan task S4). It answers the shipped facade (ios/App/FPKit/Sources/FPStore/Resources/ktstore.js) over the KT1
// prompt channel KTUIProxy answers in the app, applies the facade's async posts, and follows the Swift code:
//   - KTProtocol.swift: heads, the hello payload and its gap note, answers, post bodies, reserved keys;
//   - KTReconcile.swift: the seven rules and the lag walk with the gap note's floors (a line-by-line port);
//   - KTStore.swift: boot ids, (boot, seq) stamps, posts applied only when newer, rule 3's wipe record and
//     snapshot, Put back staged and confirmed, conflicts kept 30 days, counters and status();
//   - KTJournal.swift: hprev, each key's last 32 rows plus everything from the last 10 minutes, the horizon;
//   - KTPutBack.swift: Put back of the five log keys as a record merge by id (ordered as index.html lsSet does).
//
// The store lives in sessionStorage: it survives a reload as the native store survives a page reload, and a new
// browser context starts empty like a new install. It is written with Storage methods captured when this file
// runs, before any spec patches Storage.prototype, so a spec that makes WebKit "full" never reaches the store (as
// SQLite never sees WebKit's quota). The store's clock is the real Date.now, captured the same way.
//
// tests/lib/harness.js (opts.store = 'shadow') injects three scripts at every document start, before the page's:
//   1. this file: loads the store, applies the device's directives for this document (WebKit wiped, rewritten
//      or unreadable behind the facade), and when the device's shell is on sets the flag
//      window.__ktStore = {proto:1, shell:'60'} and installs the prompt answerer and the ktStore post handler;
//   2. the shipped facade, unchanged;
//   3. window.__ktMock._afterFacade().
// Specs drive it through window.__ktMock (status, values, conflicts, Put back, device switches, failures).
(function () {
  'use strict';
  if (window.__ktMock) return;
  var SP = Storage.prototype;
  var sget = SP.getItem, sset = SP.setItem, sdel = SP.removeItem, skey = SP.key, sclear = SP.clear;
  var DATE_NOW = Date.now, RealDate = Date, setT = window.setTimeout;
  var SS = window.sessionStorage;
  var P = '\u0001ktm:';
  var ABSENT = '-', WITNESS = 'kt_last_open', GAPKEY = 'kt__store_gap', PROMPT = '\u0001KT1 ';
  var LOG_KEYS = { kt_sessions: 1, kt_runs: 1, kt_sports: 1, kt_bw: 1, kt_measurements: 1 };
  var CONFLICT_MS = 30 * 86400000, WINDOW_MS = 10 * 60 * 1000, PER_KEY_CAP = 32;
  var WIPED_MAX_WK = 2, WIPED_MIN_STORE = 5;
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // The real WebKit storage, captured before the facade replaces window.localStorage.
  var REAL = null;
  try { REAL = window.localStorage; } catch (e) { REAL = null; }

  function nowMs() { return DATE_NOW(); }
  function H(s) {
    if (s == null) return ABSENT;
    var a = 0x811c9dc5, b = 5381, i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; }
    return s.length + ':' + a.toString(16) + ':' + b.toString(16);
  }
  function isReserved(k) { return k === 'kt_apikey' || k.indexOf('kt__store') === 0; }
  function wellFormed(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { var d = s.charCodeAt(i + 1); if (!(d >= 0xdc00 && d <= 0xdfff)) return false; i++; }
      else if (c >= 0xdc00 && c <= 0xdfff) return false;
    }
    return true;
  }
  function sortKeys(o) { return Object.keys(o).sort(); }   // code-unit order, as KTKey compares
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  // ── stamps ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function parseStamp(text) {
    if (typeof text !== 'string') return null;
    var p = text.split(':');
    if (p.length !== 2 || !/^[+-]?\d+$/.test(p[0]) || !/^[+-]?\d+$/.test(p[1])) return null;
    var b = Number(p[0]), s = Number(p[1]);
    return b >= 1 && s >= 0 ? { boot: b, seq: s } : null;
  }
  function lt(a, b) { return a.boot < b.boot || (a.boot === b.boot && a.seq < b.seq); }
  function le(a, b) { return !lt(b, a); }
  function rowStamp(r) { return { boot: r.boot, seq: r.pseq }; }
  function stampText(s) { return s ? s.boot + ':' + s.seq : null; }

  // ── wire (KTWire / KTProtocol) ─────────────────────────────────────────────────────────────────────────────────
  function lines(payload) { return payload == null || payload === '' ? [] : String(payload).split('\n'); }
  function unquote(line) {
    if (typeof line !== 'string' || line.length < 2 || line[0] !== '"' || line[line.length - 1] !== '"') return null;
    try { var v = JSON.parse(line); return typeof v === 'string' ? v : null; } catch (e) { return null; }
  }
  function parseHead(head) {
    var p = String(head).split(' ');
    if (p[0] === 'hello' && p.length === 1) return { t: 'hello', nowk: false };
    if (p[0] === 'hello' && p.length === 2 && p[1] === 'nowk') return { t: 'hello', nowk: true };
    if (p[0] === 'put' && p.length === 1) return { t: 'put' };
    if (p[0] === 'pb' && p.length === 1) return { t: 'pb' };
    if ((p[0] === 'w' || p[0] === 'd' || p[0] === 'c' || p[0] === 'p') && p.length === 2) {
      var s = parseStamp(p[1]);
      return s ? { t: p[0], stamp: s } : null;
    }
    return null;
  }
  // KTProtocol.GapNote.parse: unknown members ignored; a stamp that is not "B:S" ignored; c only with all.
  function parseGap(text) {
    var n;
    try { n = JSON.parse(text); } catch (e) { return null; }
    if (!isObj(n) || n.v !== 1) return null;
    var g = { keys: {}, stamps: {}, all: n.all === true, clear: null, at: typeof n.at === 'number' ? n.at : null };
    if (hasOwn(n, 'k')) {
      if (!isObj(n.k)) return null;
      Object.keys(n.k).forEach(function (k) { if (wellFormed(k) && typeof n.k[k] === 'string') g.keys[k] = n.k[k]; });
    }
    if (isObj(n.s)) Object.keys(n.s).forEach(function (k) { var s = parseStamp(n.s[k]); if (wellFormed(k) && s && hasOwn(g.keys, k)) g.stamps[k] = s; });
    if (g.all && typeof n.c === 'string') g.clear = parseStamp(n.c);
    return g;
  }
  function parseHello(payload) {
    var L = lines(payload);
    if (!L.length || L.length % 2 !== 1) return null;
    var h = { manifest: {}, gap: null, badGap: false, skipped: 0 };
    if (L[0] !== 'null') {
      var note = unquote(L[0]);
      if (note == null) return null;
      h.gap = parseGap(note);
      if (!h.gap) h.badGap = true;
    }
    for (var i = 1; i + 1 < L.length; i += 2) {
      var k = unquote(L[i]), hh = unquote(L[i + 1]);
      if (k == null || hh == null) return null;
      if (wellFormed(k)) h.manifest[k] = hh; else h.skipped++;
    }
    return h;
  }
  function parsePairs(payload) {
    var L = lines(payload), out = [];
    if (L.length % 2 !== 0) return null;
    for (var i = 0; i + 1 < L.length; i += 2) {
      var k = unquote(L[i]);
      if (k == null || !wellFormed(k)) return null;
      if (L[i + 1] === 'null') out.push([k, null]);
      else { var v = unquote(L[i + 1]); if (v == null) return null; out.push([k, v]); }
    }
    return out;
  }
  function off(why) { return JSON.stringify({ mode: 'off', why: why }); }

  // ── KTReconcile.classify, line by line ─────────────────────────────────────────────────────────────────────────
  function explains(gap, key, storeStamp) {
    function noWriteAfter(missed) { return !missed || !storeStamp ? true : le(storeStamp, missed); }
    if (hasOwn(gap.keys, key) && noWriteAfter(gap.stamps[key])) return true;
    return gap.all && noWriteAfter(gap.clear);
  }
  function classify(I) {
    var skip = {};
    Object.keys(I.unknownEnc || {}).forEach(function (k) { skip[k] = 1; });
    (I.wkExcluded || []).forEach(function (k) { skip[k] = 1; });
    function takesPart(k) { return !isReserved(k) && !skip[k]; }
    var W = {}, S = {};
    Object.keys(I.manifest).forEach(function (k) { if (takesPart(k)) W[k] = I.manifest[k]; });
    Object.keys(I.store).forEach(function (k) { if (takesPart(k)) S[k] = I.store[k]; });
    function web(k) { return hasOwn(W, k) ? W[k] : ABSENT; }
    function kept(k) { return hasOwn(S, k) ? S[k] : ABSENT; }
    function differs(k) { return web(k) !== kept(k); }

    // Rule 3: WebKit wiped.
    var liveStore = Object.keys(S).filter(function (k) { return S[k] !== ABSENT; }).length;
    if (!hasOwn(W, WITNESS) && Object.keys(W).length <= WIPED_MAX_WK && liveStore >= WIPED_MIN_STORE) {
      return { rule: 3, label: 'wiped', attach: false, changes: {}, wouldRepair: [], lagSeq: null };
    }
    function reason(k, r) { return I.wipe && hasOwn(I.wipe, k) && I.wipe[k] === kept(k) ? 'wiped' : r; }
    var all = {};
    Object.keys(W).forEach(function (k) { all[k] = 1; });
    Object.keys(S).forEach(function (k) { all[k] = 1; });
    var allKeys = Object.keys(all);

    // Rule 4: the witness is unknown.
    var hw = web(WITNESS);
    var known = hw !== ABSENT && (hasOwn(I.witnessHistory, hw) || !!(I.gap && hasOwn(I.gap.keys, WITNESS) && I.gap.keys[WITNESS] === hw));
    var changes = {};
    if (!known) {
      var migrate = I.storeRows === 0;
      allKeys.forEach(function (k) { if (differs(k)) changes[k] = { target: web(k), reason: migrate ? 'migrate' : reason(k, 'older build') }; });
      return { rule: 4, label: migrate ? 'migrate' : 'older build', attach: true, changes: changes, wouldRepair: [], lagSeq: null };
    }
    var remaining = {};
    allKeys.forEach(function (k) { remaining[k] = 1; });
    // Put back the facade wrote into WebKit but never confirmed.
    Object.keys(I.putBack).forEach(function (k) {
      var pb = I.putBack[k];
      if (takesPart(k) && web(k) === pb.h && kept(k) === pb.hbase) {
        if (differs(k)) changes[k] = { target: pb.h, reason: 'putback' };
        delete remaining[k];
      }
    });
    // Rule 5: keys the gap note explains.
    if (I.gap) {
      Object.keys(remaining).forEach(function (k) {
        if (explains(I.gap, k, I.storeStamps[k])) {
          if (differs(k)) changes[k] = { target: web(k), reason: 'gap' };
          delete remaining[k];
        }
      });
    }
    var differing = Object.keys(remaining).filter(differs);
    if (!differing.length) {
      var gapOnly = Object.keys(changes).some(function (k) { return changes[k].reason === 'gap'; });
      return { rule: gapOnly ? 5 : 0, label: gapOnly ? 'gap' : 'in step', attach: true, changes: changes, wouldRepair: [], lagSeq: null };
    }
    // Where WebKit's history of each key left the store's: the last op on it the store missed.
    var floors = {};
    if (I.gap) {
      Object.keys(remaining).forEach(function (k) {
        if (hasOwn(I.gap.stamps, k) && hasOwn(I.gap.keys, k)) floors[k] = { stamp: I.gap.stamps[k], h: I.gap.keys[k] };
        if (I.gap.all && I.gap.clear && (!floors[k] || lt(floors[k].stamp, I.gap.clear))) floors[k] = { stamp: I.gap.clear, h: ABSENT };
      });
    }
    // Rule 6: WebKit lost a suffix of the store's writes.
    var lag = lagPoint(W, S, remaining, I.journal, floors);
    if (lag) {
      differing.forEach(function (k) { changes[k] = { target: web(k), reason: reason(k, 'lag') }; });
      return { rule: 6, label: 'lag', attach: true, changes: changes, wouldRepair: lag.wouldRepair, lagSeq: lag.seq };
    }
    // Rule 7.
    differing.forEach(function (k) { changes[k] = { target: web(k), reason: reason(k, 'unexplained') }; });
    return { rule: 7, label: 'unexplained', attach: true, changes: changes, wouldRepair: [], lagSeq: null };
  }
  function lagPoint(W, S, keys, journal, floors) {
    function web(k) { return hasOwn(W, k) ? W[k] : ABSENT; }
    var state = {}, differing = {}, nd = 0;
    Object.keys(keys).forEach(function (k) { state[k] = hasOwn(S, k) ? S[k] : ABSENT; if (web(k) !== state[k]) { differing[k] = 1; nd++; } });
    if (!nd) return null;
    var wouldRepair = Object.keys(differing).sort();
    var first = {};
    journal.forEach(function (row) {
      if (hasOwn(first, row.k)) return;
      var f = floors[row.k];
      if (f && hasOwn(keys, row.k) && lt(f.stamp, rowStamp(row))) first[row.k] = row.seq;
    });
    for (var i = journal.length - 1; i >= 0; i--) {
      var row = journal[i];
      if (!hasOwn(keys, row.k)) continue;
      var before = row.hprev, f = floors[row.k];
      if (f) {
        if (le(rowStamp(row), f.stamp)) continue;
        if (first[row.k] === row.seq) before = f.h;
      }
      if (state[row.k] !== row.h) return null;
      state[row.k] = before;
      if (web(row.k) === before) { if (differing[row.k]) { delete differing[row.k]; nd--; } }
      else if (!differing[row.k]) { differing[row.k] = 1; nd++; }
      if (!nd) return { seq: row.seq - 1, wouldRepair: wouldRepair };
    }
    return null;
  }

  // ── the store's persisted state ────────────────────────────────────────────────────────────────────────────────
  var COUNTS = ['hellos', 'inStep', 'migrate', 'wiped', 'olderBuild', 'gap', 'lag', 'unexplained', 'nowk', 'badHello',
    'adopted', 'tombstoned', 'givenUp', 'wouldRepairKeys', 'putBacksLanded', 'writes', 'posts', 'postsApplied', 'postsStale',
    'full', 'busy', 'err', 'passthrough', 'unknownEnc', 'badOps', 'putUnasked', 'putMismatch', 'putBacks', 'putBackDropped'];
  function fresh() {
    var t = nowMs();
    return {
      v: 1, created: t, firstShell: 60, lastShell: 60, minReader: 60, schema: 1,
      device: { shell: true, state: 'ready', why: '', build: 60, full: false, failSnaps: false, hold: false },
      boot: 0, jseq: 0, horizon: 0, lastAt: 0, cseq: 0, wkExcluded: [], wipe: null, intent: null, putback: {},
      counts: {}, maxMs: {}, lastHello: null, lastPutBack: null, journal: [], conflicts: [], snaps: {}, next: null, fails: []
    };
  }
  var S = null, KV = {}, D = { meta: false, kv: {}, cv: {}, sv: {} }, CV = {}, SV = {};
  function load() {
    var m = null;
    try { m = JSON.parse(sget.call(SS, P + 'meta')); } catch (e) { m = null; }
    S = isObj(m) && m.v === 1 ? m : fresh();
    KV = {};
    var n = SS.length, pre = P + 'kv:';
    for (var i = 0; i < n; i++) {
      var k = skey.call(SS, i);
      if (k && k.indexOf(pre) === 0) { try { KV[k.slice(pre.length)] = JSON.parse(sget.call(SS, k)); } catch (e) {} }
    }
  }
  function flush() {
    try {
      Object.keys(D.kv).forEach(function (k) { if (KV[k]) sset.call(SS, P + 'kv:' + k, JSON.stringify(KV[k])); else sdel.call(SS, P + 'kv:' + k); });
      Object.keys(D.cv).forEach(function (id) { if (hasOwn(CV, id)) sset.call(SS, P + 'cv:' + id, JSON.stringify(CV[id])); else sdel.call(SS, P + 'cv:' + id); });
      Object.keys(D.sv).forEach(function (nm) { if (hasOwn(SV, nm)) sset.call(SS, P + 'sv:' + nm, JSON.stringify(SV[nm])); else sdel.call(SS, P + 'sv:' + nm); });
      sset.call(SS, P + 'meta', JSON.stringify(S));
    } catch (e) {
      M.persistErrors.push(String(e && e.message || e));
    }
    D = { meta: false, kv: {}, cv: {}, sv: {} };
  }
  function bump(c, n) { S.counts[c] = (S.counts[c] || 0) + (n == null ? 1 : n); }
  function time(name, ms) { S.maxMs[name] = Math.max(S.maxMs[name] || 0, ms); }
  function tick() { S.lastAt = Math.max(S.lastAt, nowMs()); return S.lastAt; }
  function conflictValue(id) {
    if (hasOwn(CV, id)) return CV[id];
    try { var v = JSON.parse(sget.call(SS, P + 'cv:' + id)); CV[id] = v; return v; } catch (e) { return null; }
  }
  function snapValues(name) {
    if (hasOwn(SV, name)) return SV[name];
    try { var v = JSON.parse(sget.call(SS, P + 'sv:' + name)); if (isObj(v)) { SV[name] = v; return v; } } catch (e) {}
    return null;
  }
  function liveValues() {
    var o = {};
    sortKeys(KV).forEach(function (k) { var r = KV[k]; if (r.v != null && r.enc === 'u16' && !isReserved(k)) o[k] = r.v; });
    return o;
  }

  // ── KTJournal ──────────────────────────────────────────────────────────────────────────────────────────────────
  function prune(key, now) {
    var rows = S.journal.filter(function (r) { return r.k === key; });
    if (rows.length <= PER_KEY_CAP) return null;
    var capSeq = rows[rows.length - PER_KEY_CAP].seq, winSeq = Infinity;
    for (var i = 0; i < S.journal.length; i++) if (S.journal[i].at >= now - WINDOW_MS) { winSeq = S.journal[i].seq; break; }
    var cut = Math.min(capSeq, winSeq), dropped = null;
    S.journal = S.journal.filter(function (r) {
      if (r.k === key && r.seq < cut) { dropped = dropped == null ? r.seq : Math.max(dropped, r.seq); return false; }
      return true;
    });
    return dropped;
  }
  function record(key, value, src, stamp, old) {
    var h = H(value), at = tick(), seq = ++S.jseq;
    S.journal.push({ seq: seq, k: key, h: h, hprev: old ? old.h : ABSENT, at: at, src: src, boot: stamp ? stamp.boot : 0, pseq: stamp ? stamp.seq : 0 });
    KV[key] = { v: value, enc: 'u16', h: h, seq: seq, at: at, src: src, boot: stamp ? stamp.boot : 0, pseq: stamp ? stamp.seq : 0 };
    D.kv[key] = 1;
    var dropped = prune(key, at);
    if (dropped != null && dropped > S.horizon) S.horizon = dropped;
  }
  function keepGivenUp(key, old, hnew, why, boot) {
    var value = old && old.v != null ? old.v : null, id = ++S.cseq;
    S.conflicts.push({ id: id, at: tick(), k: key, enc: 'u16', h: value == null ? ABSENT : old.h, hnew: hnew, why: why, boot: boot, units: value == null ? null : value.length });
    CV[id] = value; D.cv[id] = 1;
    bump('givenUp');
  }
  function sourceFor(reason) { return reason === 'migrate' ? 'migrate' : reason === 'putback' ? 'putback' : 'adopt:' + reason; }
  function keepsGivenUp(reason) { return reason !== 'migrate' && reason !== 'gap'; }
  function isChange(src) { return src !== 'adopt:lag' && src !== 'adopt:wiped'; }

  // ── snapshots (KTSnaps) ────────────────────────────────────────────────────────────────────────────────────────
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function dayString(ms) { var d = new RealDate(ms); return pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
  function timeString(ms) { var d = new RealDate(ms); return pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2); }
  function writeSnap(kind) {
    if (S.device.failSnaps) throw new Error('snapshots cannot be written');
    var t = nowMs(), values = liveValues(), name;
    if (kind === 'daily') name = dayString(t) + '.json';
    else {
      name = dayString(t) + '-' + timeString(t) + '-' + kind + '.json';
      for (var n = 2; hasOwn(S.snaps, name); n++) name = dayString(t) + '-' + timeString(t) + '-' + kind + '-' + n + '.json';
    }
    var keys = Object.keys(values), bytes = 0;
    keys.forEach(function (k) { bytes += values[k].length * 2; });
    S.snaps[name] = { kind: kind, at: t, seq: S.jseq, keys: keys.length, bytes: bytes };
    SV[name] = values; D.sv[name] = 1;
    rotate(t);
    return { name: name, kind: kind, at: t, seq: S.jseq, keys: keys.length };
  }
  function rotate(t) {
    var keep = {};
    if (S.wipe && S.wipe.snap) keep[S.wipe.snap] = 1;
    if (S.intent && S.intent.snap) keep[S.intent.snap] = 1;
    var names = Object.keys(S.snaps).sort().reverse(), daily = 0, cutoff = dayString(t - 30 * 86400000);
    names.forEach(function (nm) {
      if (keep[nm]) return;
      var drop = nm.length === 'yyyy-MM-dd.json'.length ? ++daily > 7 : nm.slice(0, 10) < cutoff;
      if (drop) { delete S.snaps[nm]; delete SV[nm]; D.sv[nm] = 1; }
    });
  }
  function snapIfDue() {
    if (S.device.state !== 'ready' || hasOwn(S.snaps, dayString(nowMs()) + '.json')) return;
    try { writeSnap('daily'); } catch (e) {}
  }

  // ── writes (KTStore.writeKey / clearAll) ───────────────────────────────────────────────────────────────────────
  function writeKey(key, value, stamp, posted) {
    if (isReserved(key)) { if (key === 'kt_apikey') bump('passthrough'); return { ok: true }; }
    if (stamp.boot > S.boot) { bump('badOps'); return { refused: 'boot ' + stamp.boot + ' was never given' }; }
    var old = KV[key];
    if (old && old.enc !== 'u16') { bump('unknownEnc'); return { refused: key + ' is in an encoding this build does not read' }; }
    if (posted && old && le(stamp, rowStamp(old))) return { stale: true };
    if (S.device.full) { bump('full'); return { failed: 'full' }; }   // the transaction's first write fails
    record(key, value, posted ? 'post' : 'page', stamp, old);
    return { ok: true };
  }
  function clearAll(stamp, posted) {
    if (stamp.boot > S.boot) { bump('badOps'); return { refused: 'boot ' + stamp.boot + ' was never given' }; }
    var doomed = sortKeys(KV).filter(function (key) {
      var row = KV[key];
      return row.v != null && row.enc === 'u16' && !isReserved(key) && !(posted && le(stamp, rowStamp(row)));
    });
    if (doomed.length && S.device.full) { bump('full'); return { failed: 'full' }; }
    doomed.forEach(function (key) { record(key, null, posted ? 'post' : 'page', stamp, KV[key]); });
    return doomed.length === 0 && posted ? { stale: true } : { ok: true };
  }
  function answerFor(o) { return o.ok || o.stale ? 'ok' : o.refused ? 'err' : o.failed; }

  // ── hello and put (KTStore.hello / put) ────────────────────────────────────────────────────────────────────────
  var pending = null;
  function wipeRecord() {
    if (S.wipe && nowMs() - S.wipe.at > CONFLICT_MS) { S.wipe = null; }
    return S.wipe;
  }
  function reconcileInput(hello) {
    var store = {}, stamps = {}, unknown = {}, rows = 0;
    Object.keys(KV).forEach(function (k) {
      rows++;
      var r = KV[k];
      if (r.enc === 'u16') { store[k] = r.h; stamps[k] = rowStamp(r); } else unknown[k] = 1;
    });
    var witness = {};
    S.journal.forEach(function (r) { if (r.k === WITNESS) { witness[r.h] = 1; witness[r.hprev] = 1; } });
    if (hasOwn(store, WITNESS)) witness[store[WITNESS]] = 1;
    delete witness[ABSENT];
    var putBack = {};
    Object.keys(S.putback).forEach(function (k) { putBack[k] = { h: S.putback[k].h, hbase: S.putback[k].hbase }; });
    var w = wipeRecord();
    return {
      manifest: hello.manifest, gap: hello.gap, store: store, storeStamps: stamps, storeRows: rows, unknownEnc: unknown,
      wkExcluded: S.wkExcluded.slice(), witnessHistory: witness,
      journal: S.journal.filter(function (r) { return r.seq > S.horizon; }), putBack: putBack,
      wipe: w && !w.followedUp ? w.hashes : null
    };
  }
  function countHello(plan) {
    var adopted = {};
    Object.keys(plan.changes).forEach(function (k) { var r = plan.changes[k].reason; (adopted[r] = adopted[r] || []).push(k); });
    Object.keys(adopted).forEach(function (r) { adopted[r] = adopted[r].sort().slice(0, 50); });
    if (plan.rule === 0) bump('inStep');
    else if (plan.rule === 4) bump(plan.label === 'migrate' ? 'migrate' : 'olderBuild');
    else if (plan.rule === 5) bump('gap');
    else if (plan.rule === 6) { bump('lag'); bump('wouldRepairKeys', plan.wouldRepair.length); }
    else if (plan.rule === 7) bump('unexplained');
    S.lastHello = { at: nowMs(), boot: S.boot, rule: plan.rule, label: plan.label, adopted: adopted, wouldRepair: plan.wouldRepair.slice(0, 50) };
  }
  function wiped(input) {
    var head = S.jseq, earlier = wipeRecord(), info = null;
    try { info = writeSnap('wiped'); } catch (e) { info = null; }
    var snap = info ? info.name : (earlier && !earlier.followedUp && earlier.seq === head ? earlier.snap : null);
    var hashes = {};
    Object.keys(input.store).forEach(function (k) { if (input.store[k] !== ABSENT && !isReserved(k)) hashes[k] = input.store[k]; });
    S.wipe = { at: nowMs(), snap: snap, seq: head, followedUp: false, hashes: hashes };
    bump('wiped');
    S.lastHello = { at: nowMs(), boot: S.boot, rule: 3, label: 'wiped', adopted: {}, wouldRepair: [] };
    return off('wiped');
  }
  function applyStaged(key, old, stamp) {
    var pb = S.putback[key];
    if (!pb) return;
    keepGivenUp(key, old, H(pb.v), 'putback', stamp.boot);
    record(key, pb.v, 'putback', stamp, old);
    delete S.putback[key];
    bump('putBacks');
  }
  function hello(nowk, payload) {
    pending = null;
    bump('hellos');
    if (nowk) {
      bump('nowk');
      S.lastHello = { at: nowMs(), boot: S.boot, rule: 2, label: 'webkit unreadable', adopted: {}, wouldRepair: [] };
      return off('nowk');
    }
    var h = parseHello(payload);
    if (!h) { bump('badHello'); return off('bad hello'); }
    var input = reconcileInput(h), plan = classify(input);
    if (plan.rule === 3) return wiped(input);
    var rec = wipeRecord();
    if (input.wipe && Object.keys(plan.changes).length && rec && rec.snap == null) {
      var info = null;
      try { info = writeSnap('wiped'); } catch (e) { info = null; }
      if (!info) {
        S.lastHello = { at: nowMs(), boot: S.boot, rule: 3, label: 'wiped: no snapshot', adopted: {}, wouldRepair: [] };
        return off('wiped: no snapshot');
      }
      rec.snap = info.name;
    }
    var newBoot = S.boot + 1, wanted = {}, keys = sortKeys(plan.changes);
    // A full disk: hello's own writes (tombstones, conflicts, a Put back that landed) cannot be written.
    if (S.device.full && keys.some(function (k) { return plan.changes[k].reason === 'putback' || plan.changes[k].target === ABSENT; })) {
      bump('full');
      return off('full: database or disk is full');
    }
    keys.forEach(function (key) {
      var change = plan.changes[key], old = KV[key];
      if (old && old.enc !== 'u16') return;
      if (change.reason === 'putback') { applyStaged(key, old, { boot: newBoot, seq: 0 }); bump('putBacksLanded'); }
      else if (change.target === ABSENT) {
        if (keepsGivenUp(change.reason)) keepGivenUp(key, old, ABSENT, change.reason, newBoot);
        record(key, null, sourceFor(change.reason), { boot: newBoot, seq: 0 }, old);
        bump('tombstoned');
      } else wanted[key] = change;
    });
    var dropped = Object.keys(S.putback).length;
    if (dropped) { S.putback = {}; bump('putBackDropped', dropped); }
    if (input.wipe && S.wipe) S.wipe.followedUp = true;
    var cut = tick() - CONFLICT_MS;
    S.conflicts = S.conflicts.filter(function (c) { if (c.at < cut) { delete CV[c.id]; D.cv[c.id] = 1; return false; } return true; });
    S.boot = newBoot;
    pending = Object.keys(wanted).length ? { boot: newBoot, changes: wanted, migrate: plan.label === 'migrate' } : null;
    countHello(plan);
    var need = keys.filter(function (k) { return plan.changes[k].target !== ABSENT; });
    var answer = JSON.stringify({ mode: 'shadow', boot: newBoot, need: need, rule: plan.rule, label: plan.label, putback: S.intent != null });
    snapIfDue();
    return answer;
  }
  function put(payload) {
    if (!pending) { bump('badOps'); return 'err'; }
    var p = pending;
    pending = null;
    var pairs = parsePairs(payload);
    if (!pairs) { bump('badOps'); return 'err'; }
    var wanted = pairs.filter(function (pr) { return hasOwn(p.changes, pr[0]); });
    bump('putUnasked', pairs.length - wanted.length);
    if (S.device.full && wanted.length) { bump('full'); return 'full'; }
    wanted.forEach(function (pr) {
      var key = pr[0], value = pr[1], change = p.changes[key], old = KV[key];
      if (old && old.enc !== 'u16') return;
      var h = H(value);
      if (h !== change.target) bump('putMismatch');
      if (keepsGivenUp(change.reason)) keepGivenUp(key, old, h, change.reason, p.boot);
      record(key, value, sourceFor(change.reason), { boot: p.boot, seq: 0 }, old);
      bump('adopted');
    });
    if (p.migrate) { try { writeSnap('migrate'); } catch (e) {} }
    return 'ok';
  }

  // ── Put back (KTStore.resolve / putBackRequest / putBackConfirm, KTMerge.logs) ─────────────────────────────────
  // index.html lsSet's comparator: newest date first, then the larger id.
  function lsCmp(a, b) {
    var ad = String((a && a.date) || ''), bd = String((b && b.date) || '');
    if (ad !== bd) return ad < bd ? 1 : -1;
    return ((b && b.id) || 0) - ((a && a.id) || 0);
  }
  function idTok(r) { return isObj(r) && 'id' in r && r.id !== null ? JSON.stringify(r.id) : null; }
  function mergeLogs(current, extra) {
    var base, more;
    try { base = current == null ? [] : JSON.parse(current); more = JSON.parse(extra); } catch (e) { return null; }
    if (!Array.isArray(base) || !Array.isArray(more)) return null;
    var ids = {}, texts = {}, added = [];
    base.forEach(function (r) { var t = idTok(r); if (t !== null) ids[t] = 1; else texts[JSON.stringify(r)] = 1; });
    more.forEach(function (r) { var t = idTok(r); if (t !== null) { if (!ids[t]) added.push(r); } else if (!texts[JSON.stringify(r)]) added.push(r); });
    var all = base.concat(added);
    all.sort(lsCmp);   // stable since ES2019, as KTMerge's merge sort
    return { merged: JSON.stringify(all), added: added.length, records: added.map(recordName) };
  }
  // KTMerge.Record.summary: "<date> <name>", the name being the day's (label), else type, else sport.
  function recordName(r) {
    var d = String((r && r.date) || ''), pick = function (v) { return typeof v === 'string' && v ? v : null; };
    var n = isObj(r) ? (pick(r.label) || pick(r.type) || pick(r.sport)) : null;
    return n ? (d ? d + ' ' : '') + n : d;
  }
  function changedSince(key, seq) {
    var rows = S.journal.filter(function (r) { return r.k === key && r.seq > seq; });
    if (rows.some(function (r) { return isChange(r.src); })) return true;
    return S.horizon > seq && rows.length >= PER_KEY_CAP;
  }
  function resolve(intent) {
    var items = [], entries = [];
    function current(key) { var r = KV[key]; return { row: r, value: r && r.v != null ? r.v : null }; }
    if (intent.conflicts && intent.conflicts.length) {
      var byKey = {}, found = {};
      intent.conflicts.slice().sort(function (a, b) { return a - b; }).forEach(function (id) {
        var c = S.conflicts.filter(function (x) { return x.id === id; })[0];
        if (c && c.enc === 'u16') { (byKey[c.k] = byKey[c.k] || []).push({ id: id, value: conflictValue(id), h: c.h, hnew: c.hnew }); found[id] = 1; }
      });
      intent.conflicts.forEach(function (id) { if (!found[id]) items.push({ key: '', outcome: 'not found', origin: 'conflict:' + id }); });
      sortKeys(byKey).forEach(function (key) {
        if (isReserved(key)) return;
        var rows = byKey[key], origin = 'conflict:' + rows.map(function (r) { return r.id; }).join(','), cur = current(key);
        if (cur.row && cur.row.enc !== 'u16') { items.push({ key: key, outcome: 'untouched', origin: origin }); return; }
        var curH = cur.row ? cur.row.h : ABSENT;
        if (LOG_KEYS[key]) {
          var merged = cur.value, added = 0, bad = false, recs = [];
          rows.forEach(function (r) {
            if (bad || r.value == null) return;
            var m = mergeLogs(merged, r.value);
            if (!m) { bad = true; return; }
            merged = m.merged; added += m.added; recs = recs.concat(m.records);
          });
          if (bad) items.push({ key: key, outcome: 'unmergeable', origin: origin });
          else if (!added) items.push({ key: key, outcome: 'nothing to add', added: 0, origin: origin });
          else { items.push({ key: key, outcome: 'put back', added: added, origin: origin, records: recs.slice(0, 20) }); entries.push({ key: key, value: merged, hbase: curH, origin: origin }); }
        } else {
          var newest = rows[rows.length - 1];
          if (curH === newest.h) items.push({ key: key, outcome: 'nothing to add', origin: origin });
          else if (curH !== newest.hnew) items.push({ key: key, outcome: 'changed since', origin: origin });
          else {
            // A kept "no value" goes back as a removal, and the plan says so (KTPutBackItem.removes).
            var item = { key: key, outcome: 'put back', origin: origin };
            if (newest.value == null) item.removes = true;
            items.push(item);
            entries.push({ key: key, value: newest.value, hbase: curH, origin: origin });
          }
        }
      });
    }
    if (intent.snap) {
      var origin = 'snap:' + intent.snap, info = S.snaps[intent.snap], values = info ? snapValues(intent.snap) : null;
      if (!info || !values) { items.push({ key: '', outcome: 'not found', origin: origin }); return { plan: plan(items), entries: entries }; }
      sortKeys(values).forEach(function (key) {
        if (isReserved(key)) return;
        var snapValue = values[key], cur = current(key);
        if (cur.row && cur.row.enc !== 'u16') { items.push({ key: key, outcome: 'untouched', origin: origin }); return; }
        var curH = cur.row ? cur.row.h : ABSENT;
        if (LOG_KEYS[key]) {
          var m = mergeLogs(cur.value, snapValue);
          if (!m) items.push({ key: key, outcome: 'unmergeable', origin: origin });
          else if (!m.added) items.push({ key: key, outcome: 'nothing to add', added: 0, origin: origin });
          else { items.push({ key: key, outcome: 'put back', added: m.added, origin: origin, records: m.records.slice(0, 20) }); entries.push({ key: key, value: m.merged, hbase: curH, origin: origin }); }
        } else if (curH === H(snapValue)) items.push({ key: key, outcome: 'nothing to add', origin: origin });
        else if (changedSince(key, info.seq)) items.push({ key: key, outcome: 'changed since', origin: origin });
        else { items.push({ key: key, outcome: 'put back', origin: origin }); entries.push({ key: key, value: snapValue, hbase: curH, origin: origin }); }
      });
    }
    return { plan: plan(items), entries: entries };
  }
  function plan(items) { return { items: items, count: items.filter(function (i) { return i.outcome === 'put back'; }).length }; }
  // KTStore.losses(): the lag and wiped rows grouped by the start that gave them up, newest start first, kept while
  // Put back of the group would still write or remove something (at most 10).
  function losses() {
    var groups = {}, out = [];
    S.conflicts.forEach(function (c) {
      if (c.why !== 'lag' && c.why !== 'wiped') return;
      var g = groups[c.boot] || (groups[c.boot] = { boot: c.boot, at: c.at, why: c.why, ids: [], items: [] });
      g.ids.push(c.id);
      if (c.at > g.at) g.at = c.at;
      if (c.why === 'wiped') g.why = 'wiped';
    });
    Object.keys(groups).map(Number).sort(function (a, b) { return b - a; }).forEach(function (boot) {
      if (out.length >= 10) return;
      var g = groups[boot];
      g.items = resolve({ conflicts: g.ids }).plan.items.filter(function (i) { return i.outcome === 'put back'; });
      if (g.items.length) out.push(g);
    });
    return out;
  }
  function stage(intent) {
    var r = resolve(intent);
    if (r.plan.count > 0) { S.intent = { conflicts: (intent.conflicts || []).slice(), snap: intent.snap || null, at: nowMs() }; D.meta = true; flush(); }
    return r.plan;
  }
  function putBackRequest() {
    if (!S.intent) return '{}';
    var r = resolve(S.intent);
    S.putback = {};
    r.entries.forEach(function (e) { S.putback[e.key] = { v: e.value, h: H(e.value), hbase: e.hbase, origin: e.origin, at: tick() }; });
    S.intent = null;
    S.lastPutBack = r.plan;
    var o = {};
    r.entries.forEach(function (e) { o[e.key] = e.value; });
    return JSON.stringify(o);
  }
  function putBackConfirm(stamp, payload) {
    var pairs = parsePairs(payload);
    if (!pairs) { bump('badOps'); return 'err'; }
    pairs.forEach(function (pr) {
      var key = pr[0], value = pr[1], staged = S.putback[key];
      if (!staged || staged.h !== H(value)) { bump('badOps'); return; }
      var old = KV[key];
      if (old && old.enc !== 'u16') return;
      keepGivenUp(key, old, H(value), 'putback', stamp.boot);
      record(key, value, 'putback', stamp, old);
      delete S.putback[key];
      bump('putBacks');
    });
    return 'ok';
  }

  // ── the prompt channel and the async posts ─────────────────────────────────────────────────────────────────────
  function keyOf(op, payload) {
    if (op.t !== 'w' && op.t !== 'd' && op.t !== 'p' && op.t !== 'put') return null;
    return unquote(lines(payload)[0] || '');
  }
  function takeFail(kind, op, key) {
    for (var i = 0; i < S.fails.length; i++) {
      var f = S.fails[i];
      if (!!f.post !== (kind === 'post')) continue;
      if (f.op && f.op !== op) continue;
      if (f.key != null && f.key !== key) continue;
      if (f.times != null) { f.times--; if (f.times <= 0) S.fails.splice(i, 1); }
      return f;
    }
    return null;
  }
  function answer(head, payload) {
    var t0 = nowMs();
    var op = parseHead(head);
    if (!op) { bump('badOps'); return String(head).indexOf('hello') === 0 ? off('bad hello') : 'err'; }
    var f = takeFail('prompt', op.t, keyOf(op, payload));
    if (f && !f.apply) {
      if (f.answer === 'full' || f.answer === 'busy' || f.answer === 'err') bump(f.answer);
      return f.answer === undefined ? null : f.answer;
    }
    var out = run(op, payload);
    time(op.t, nowMs() - t0);
    return f ? (f.answer === undefined ? null : f.answer) : out;
  }
  function run(op, payload) {
    if (S.device.state !== 'ready') {
      if (op.t === 'hello') return off(S.device.state === 'refused' ? 'minReader' : 'unreadable');
      return 'err';
    }
    if (op.t === 'hello') return hello(op.nowk, payload);
    if (op.t === 'put') return put(payload);
    if (op.t === 'pb') return putBackRequest();
    if (op.t === 'p') return putBackConfirm(op.stamp, payload);
    if (op.t === 'c') { bump('writes'); return answerFor(clearAll(op.stamp, false)); }
    var L = lines(payload), isW = op.t === 'w';
    var k = L.length === (isW ? 2 : 1) ? unquote(L[0]) : null;
    if (k == null || !wellFormed(k)) { bump('badOps'); return 'err'; }
    var v = null;
    if (isW) { v = unquote(L[1]); if (v == null) { bump('badOps'); return 'err'; } }
    bump('writes');
    return answerFor(writeKey(k, v, op.stamp, false));
  }
  function applyPost(body) {
    var head = body && typeof body === 'object' ? (Array.isArray(body) ? body[0] : body.head) : null;
    var payload = body && typeof body === 'object' ? (Array.isArray(body) ? body[1] : body.payload) : null;
    if (typeof head !== 'string') return 'refused: malformed body';
    if (S.device.state !== 'ready') return 'refused: the store is off';
    bump('posts');
    var op = parseHead(head);
    var f = op ? takeFail('post', op.t, keyOf(op, payload)) : null;
    if (f) return 'failed: ' + (f.answer || 'injected');
    var o;
    if (op && (op.t === 'w' || op.t === 'd')) {
      var L = lines(payload), isW = op.t === 'w';
      var k = L.length === (isW ? 2 : 1) ? unquote(L[0]) : null;
      if (k == null || !wellFormed(k)) return 'refused: malformed payload';
      var v = null;
      if (isW) { v = unquote(L[1]); if (v == null) return 'refused: malformed value'; }
      o = writeKey(k, v, op.stamp, true);
    } else if (op && op.t === 'c') o = clearAll(op.stamp, true);
    else return 'refused: only w, d and c are posted';
    if (o.ok) { bump('postsApplied'); return 'applied'; }
    if (o.stale) { bump('postsStale'); return 'stale'; }
    return o.refused ? 'refused: ' + o.refused : 'failed: ' + o.failed;
  }

  // ── WebKit, seen from outside the facade ───────────────────────────────────────────────────────────────────────
  function wkContent() {
    if (!REAL) return null;
    var o = {}, n = REAL.length;
    for (var i = 0; i < n; i++) { var k = skey.call(REAL, i); if (k != null) o[k] = sget.call(REAL, k); }
    return o;
  }
  function pageContent() {
    var ls = window.localStorage, o = {}, n = ls.length;
    for (var i = 0; i < n; i++) { var k = ls.key(i); if (k != null) o[k] = ls.getItem(k); }
    return o;
  }
  function wkWrite(map, replace) {
    if (!REAL) return;
    if (replace) sclear.call(REAL);
    Object.keys(map).forEach(function (k) { if (map[k] == null) sdel.call(REAL, k); else sset.call(REAL, k, map[k]); });
  }

  // ── the mock's face, for the harness and the specs ─────────────────────────────────────────────────────────────
  var M = window.__ktMock = {
    log: [], posts: [], postResults: [], unflagged: 0, persistErrors: [], wkBefore: null, wkAfter: null, attached: false, shellOn: false,
    H: H,
    // The prompt channel: what KTUIProxy hands to KTStore.answer(head:payload:).
    handle: function (head, payload) {
      var a;
      try { a = answer(head, payload); } catch (e) { M.persistErrors.push('answer threw: ' + (e && e.stack || e)); a = null; }
      M.log.push({ head: head, payload: payload, answer: a });
      flush();
      return a;
    },
    // The ktStore script-message handler: posts land asynchronously, unless the device holds them (then a reload
    // loses them, as a kill does).
    post: function (body) {
      M.posts.push(body);
      if (!S.device.hold && !M._due) { M._due = true; setT.call(window, function () { M._due = false; if (!S.device.hold) M.deliver(); }, 0); }
    },
    deliver: function () {
      var out = [];
      while (M.posts.length) out.push(applyPost(M.posts.shift()));
      M.postResults = M.postResults.concat(out);
      flush();
      return out;
    },
    dropPosts: function () { var n = M.posts.length; M.posts = []; return n; },

    // What the store holds.
    values: function () { return liveValues(); },
    row: function (k) { var r = KV[k]; return r ? JSON.parse(JSON.stringify(r)) : null; },
    rows: function () { return JSON.parse(JSON.stringify(KV)); },
    journal: function () { return JSON.parse(JSON.stringify(S.journal)); },
    conflicts: function (limit) {
      return S.conflicts.slice().reverse().slice(0, limit || 500).map(function (c) {
        return { id: c.id, at: c.at, key: c.k, why: c.why, h: c.h, hnew: c.hnew, units: c.units, boot: c.boot };
      });
    },
    losses: function () { return losses(); },
    conflictValue: function (id) { return conflictValue(id); },
    snaps: function () { return Object.keys(S.snaps).sort().reverse(); },
    readSnap: function (name) { var v = snapValues(name); return v ? JSON.parse(JSON.stringify(v)) : null; },
    // KTStore.status(losses:): withLosses as the shell's Storage reads it (StoreAttach), else as every hello does.
    status: function (withLosses) {
      var st = {
        state: S.device.state === 'ready' ? 'ready' : S.device.state, why: S.device.state === 'refused' ? 'minReader' : (S.device.why || null),
        build: S.device.build, schema: S.schema, minReader: S.minReader, firstShell: S.firstShell, lastShell: S.lastShell,
        keys: 0, bytes: 0, tombstones: 0, unknownEnc: 0, boot: S.boot, conflicts: S.conflicts.length,
        lastHello: S.lastHello, counts: { counts: JSON.parse(JSON.stringify(S.counts)), maxMs: JSON.parse(JSON.stringify(S.maxMs)) },
        wipeOffer: null, putBackStaged: S.intent != null, putBackWaiting: Object.keys(S.putback).length,
        lastPutBack: S.lastPutBack, snaps: M.snaps(), inStep: false
      };
      Object.keys(KV).forEach(function (k) {
        var r = KV[k];
        if (r.enc !== 'u16') st.unknownEnc++;
        else if (r.v == null) st.tombstones++;
        else { st.keys++; st.bytes += r.v.length * 2; }
      });
      var w = wipeRecord();
      if (w) st.wipeOffer = { at: w.at, snap: w.snap, keys: Object.keys(w.hashes).length, seq: w.seq };
      if (S.lastHello) st.inStep = S.lastHello.rule === 0 || S.lastHello.rule === 5 || S.lastHello.label === 'migrate';
      if (withLosses) st.losses = losses();
      return st;
    },
    count: function (name) { return S.counts[name] || 0; },

    // Settings > About > Storage.
    previewPutBack: function (intent) { return resolve(intent).plan; },
    stagePutBack: function (intent) { return stage(intent); },
    cancelPutBack: function () { S.intent = null; S.putback = {}; flush(); },
    dismissWipe: function () { S.wipe = null; flush(); },
    writeSnap: function (kind) { var i = writeSnap(kind || 'manual'); flush(); return i; },

    // The device. shell: false is a store-less build (no flag, no channel) from the next document on; state
    // 'unreadable' or 'refused' (meta.minReader above this build) is rule 1; full: SQLite answers full to every
    // write; failSnaps: no snapshot can be written; hold: posts wait for deliver() and a reload loses them;
    // seed: false stops the harness re-seeding WebKit at each document start, as a real relaunch never does.
    device: function (patch) {
      if (patch) { Object.keys(patch).forEach(function (k) { S.device[k] = patch[k]; }); flush(); }
      return JSON.parse(JSON.stringify(S.device));
    },
    // One-shot changes to WebKit at the next document start, before the facade: wipe (WebKit lost everything),
    // restore {k: v} (WebKit holds exactly this, as after losing writes), plant {k: v or null} (a tool or another
    // build wrote WebKit's file), unreadable (window.localStorage throws until the facade has run).
    next: function (directives) { S.next = directives || null; flush(); },
    // An answer the store gives instead of doing the op: {op: 'w'|'d'|'c'|'hello'|'put'|'pb'|'p', key, answer:
    // 'full'|'busy'|'err'|null (no answer)|any text, times, post: true (fail the async post instead), apply: true
    // (do the op, then answer so)}.
    fail: function (rule) { S.fails.push(rule); flush(); },
    clearFails: function () { S.fails = []; flush(); },
    wkExclude: function (keys) { S.wkExcluded = keys.slice(); flush(); },
    // The boot id the next hello gives is n + 1 (to replay ktstore-vectors.js's note steps, made at boot 7).
    setBoot: function (n) { S.boot = n; flush(); },
    reset: function () {
      var n = SS.length, doomed = [];
      for (var i = 0; i < n; i++) { var k = skey.call(SS, i); if (k && k.indexOf(P) === 0) doomed.push(k); }
      doomed.forEach(function (k) { sdel.call(SS, k); });
      S = fresh(); KV = {}; CV = {}; SV = {}; pending = null; flush();
    },
    realStorage: function () { return REAL; },
    wk: function () { return wkContent(); },

    // store == WebKit == page reads (less what the gap note explains and the keys the store never keeps).
    check: function () {
      var st = window.__ktStoreState;
      if (M.unflagged) return { ok: false, bad: [M.unflagged + ' KT1 prompt(s) without the shell flag'], gapped: [] };
      if (!st) return { ok: true, skipped: M.shellOn ? 'facade did not run' : 'no shell flag' };
      if (st.mode !== 'shadow') return { ok: true, skipped: 'facade off: ' + st.why };
      if (!S.device.hold) M.deliver();
      var wkv = wkContent(), pg = pageContent(), store = liveValues(), bad = [], gapped = [];
      var note = wkv && wkv[GAPKEY] != null ? parseGap(wkv[GAPKEY]) : null, skip = {};
      S.wkExcluded.forEach(function (k) { skip[k] = 1; });
      Object.keys(KV).forEach(function (k) { if (KV[k].enc !== 'u16') skip[k] = 1; });
      var all = {};
      [wkv, pg, store].forEach(function (o) { Object.keys(o || {}).forEach(function (k) { all[k] = 1; }); });
      Object.keys(all).sort().forEach(function (k) {
        if (pg[k] !== wkv[k]) bad.push(k + ': the page reads ' + (pg[k] == null ? 'nothing' : H(pg[k])) + ', WebKit holds ' + (wkv[k] == null ? 'nothing' : H(wkv[k])));
        if (isReserved(k)) { if (hasOwn(KV, k)) bad.push(k + ': a reserved key reached the store'); return; }
        if (skip[k] || store[k] === wkv[k]) return;
        if (note && (note.all || hasOwn(note.keys, k))) { gapped.push(k); return; }
        bad.push(k + ': store ' + (store[k] == null ? 'nothing' : H(store[k])) + ', WebKit ' + (wkv[k] == null ? 'nothing' : H(wkv[k])));
      });
      if (M.unflagged) bad.push(M.unflagged + ' KT1 prompt(s) without the shell flag');
      if (M.persistErrors.length) bad.push('mock: ' + M.persistErrors.join(' | '));
      return { ok: !bad.length, bad: bad, gapped: gapped, writes: st.writes, fallbacks: st.fallbacks, posts: M.postResults.length };
    },

    // Run by the harness right after the facade: WebKit readable again, and what the facade left in WebKit.
    _afterFacade: function () {
      if (M._unreadable) { try { delete window.localStorage; } catch (e) {} if (M._lsDesc) { try { Object.defineProperty(window, 'localStorage', M._lsDesc); } catch (e) {} } M._unreadable = false; }
      try { M.wkAfter = wkContent(); } catch (e) { M.wkAfter = null; }
      M.attached = !!(window.__ktStoreState && window.__ktStoreState.mode === 'shadow');
    }
  };

  // ── document start ─────────────────────────────────────────────────────────────────────────────────────────────
  load();
  if (S.next) {
    var nx = S.next;
    S.next = null;
    try {
      if (nx.wipe && REAL) sclear.call(REAL);
      if (nx.restore) wkWrite(nx.restore, true);
      if (nx.plant) wkWrite(nx.plant, false);
    } catch (e) { M.persistErrors.push('directive: ' + e); }
    if (nx.unreadable) {
      M._lsDesc = Object.getOwnPropertyDescriptor(window, 'localStorage');
      M._unreadable = true;
      Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { var e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; } });
    }
    flush();
  }
  try { M.wkBefore = wkContent(); } catch (e) { M.wkBefore = null; }
  if (S.device.seed === false) window.__ktSkipSeed = true;   // the harness then leaves WebKit as the last document left it
  var nativePrompt = window.prompt;
  M.shellOn = S.device.shell !== false;
  if (M.shellOn) {
    window.__ktStore = { proto: 1, shell: String(S.device.build) };
    window.webkit = window.webkit || {};
    window.webkit.messageHandlers = window.webkit.messageHandlers || {};
    window.webkit.messageHandlers.ktStore = { postMessage: function (body) { M.post(body); } };
  }
  window.prompt = function (msg, def) {
    if (typeof msg === 'string' && msg.indexOf(PROMPT) === 0) {
      if (!M.shellOn) { M.unflagged++; return null; }
      return M.handle(msg.slice(PROMPT.length), def);
    }
    return nativePrompt.apply(this, arguments);
  };
})();
