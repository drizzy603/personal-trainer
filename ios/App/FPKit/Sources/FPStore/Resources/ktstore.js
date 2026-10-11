/* FPStore storage facade, KT1 (protocol 1). Build 60: shadow only.
 *
 * Shell-owned (plan tasks S3 and S5). StoreAttach injects this file at document start, in the main frame, right
 * after its flag script
 *   window.__ktStore = {proto:1, shell:'60'}
 * which it injects only once KTUIProxy is verified as the web view's uiDelegate. Without that flag this file does
 * nothing at all: no prompt, no state, and the page runs on WebKit exactly as on every shell before 60 (an older
 * Capacitor shows an unknown prompt as an alert).
 *
 * Shadow: WebKit's localStorage stays in charge. Every page write goes to WebKit first, exactly as today (a throw
 * from WebKit reaches the page, so lsSet's false/rollback contract is untouched), then it is mirrored
 * synchronously to the native store over the prompt channel. An answer other than `ok` (or none) never fails or
 * delays the page's write: the facade notes the gap in WebKit (`kt__store_gap`, never mirrored) and posts the op
 * to the `ktStore` script-message handler with its (boot, seq), which the store applies only if it is newer than
 * the key's last write. The store never writes WebKit by itself: the only WebKit writes made here are the facade's
 * own note and the owner's Put back, at document start.
 *
 * Wire (ios/App/FPKit/Sources/FPStore/KTProtocol.swift): prompt('\u0001KT1 ' + head, payload). A payload is
 * newline-joined lines, each a JSON.stringify literal (a lone surrogate travels as an ASCII \udXXX escape) or the
 * four characters null.
 *   hello [nowk]   line 0 the gap note (or null), then key and H(value) for each key WebKit holds.
 *                  Answer {"mode":"shadow","boot":B,"need":[...],"rule":R,"label":L,"putback":P} or {"mode":"off"}.
 *   put            key and value (or null) for each key `need` named. Anything but ok: nothing attaches.
 *   w|d|c B:S      a set (key, value), a remove (key) or a clear WebKit has just taken; S counts the document's ops.
 *   pb, p B:S      Put back staged in Settings: the values to write into WebKit, then the ones WebKit took.
 * Never sent: kt_apikey (it stays in WebKit alone: no value, no hash, no op) and the facade's own kt__store* keys.
 *
 * The gap note is JSON.stringify({v:1, at, k:{key: H(WebKit's value after the op) or '-'}, s:{key: 'B:S'}}),
 * merged op by op on every mirror not answered ok; a clear not answered ok empties WebKit (the note with it), so a
 * fresh note {v:1, at, k:{}, all:true, c:'B:S'} follows, into which later misses merge. That is exactly what
 * tests/tools/ktstore-vectors.js noteAfter() builds, and what FPStore's reconcile (rule 5) reads.
 *
 * Page-facing: window.__ktStoreState = {mode, why, boot, seq, counters..., acked(key), remirror(key)}.
 */
(function () {
  'use strict';
  var cfg = window.__ktStore;
  if (!cfg || cfg.proto !== 1 || window.__ktStoreState) return;
  try { if (window.top !== window) return; } catch (e) { return; }

  var CH = '\u0001KT1 ', GAP = 'kt__store_gap', MINE = 'kt__store';
  var SP = Storage.prototype, ask = window.prompt, own = { getItem: SP.getItem, setItem: SP.setItem, removeItem: SP.removeItem, key: SP.key };
  var clock = (window.performance && typeof performance.now === 'function') ? function () { return performance.now(); } : function () { return Date.now(); };
  var t0 = clock(), real = null, wk = true;
  // WebKit's storage can be unreadable at document start (seen on a cold simulator: a SecurityError). Never read
  // that as empty: say so (hello nowk) and attach nothing.
  try { real = window.localStorage; own.key.call(real, 0); } catch (e) { wk = false; }

  var ack = Object.create(null), ackRest = true;   // ack[key]: the key's last mirror was answered ok; ackRest: keys not written since the last clear
  var st = window.__ktStoreState = {
    proto: 1, shell: String(cfg.shell || ''), mode: 'off', why: '', boot: 0, seq: 0, rule: -1, label: '', need: 0, putBack: 0,
    writes: 0, acks: 0, fallbacks: 0, full: 0, busy: 0, err: 0, none: 0, other: 0,
    posts: 0, postFails: 0, noteFails: 0, wkFails: 0, passthrough: 0, keys: 0, ms: 0, maxMs: 0, bootMs: 0,
    // true when the key's last write in this document reached the store (no mirror waiting on a post).
    acked: function (key) {
      if (st.mode !== 'shadow') return false;
      key = String(key);
      if (reserved(key)) return true;
      return Object.prototype.hasOwnProperty.call(ack, key) ? ack[key] : ackRest;
    },
    // Sends WebKit's current value of the key again, synchronously. true when the store took it.
    remirror: function (key) {
      if (st.mode !== 'shadow') return false;
      key = String(key);
      if (reserved(key)) return true;
      var v = null;
      try { v = own.getItem.call(real, key); } catch (e) { return false; }
      return v == null ? mirror('d', key, null) : mirror('w', key, v);
    }
  };

  function reserved(k) { return k === 'kt_apikey' || k.indexOf(MINE) === 0; }
  function q(s) { return JSON.stringify(String(s)); }
  // length + FNV-1a 32 + djb2 32 over UTF-16 code units (KTWire.hash computes the same over the store's BLOB).
  function H(s) {
    var a = 0x811c9dc5, b = 5381, i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; }
    return s.length + ':' + a.toString(16) + ':' + b.toString(16);
  }
  function call(head, payload) {
    var t = clock(), r = null, ms;
    try { r = ask.call(window, CH + head, payload); } catch (e) { r = null; }
    ms = clock() - t; st.ms += ms; if (ms > st.maxMs) st.maxMs = ms;
    return r;
  }
  function parse(text) { try { return text ? JSON.parse(text) : null; } catch (e) { return null; } }
  function isObject(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  // The gap note after one op whose mirror was not answered ok (ktstore-vectors.js noteAfter(), op by op).
  function note(op, key, val, stamp) {
    var at = Date.now(), n = null;
    if (op === 'c') n = { v: 1, at: at, k: {}, all: true, c: stamp };
    else {
      try { n = JSON.parse(own.getItem.call(real, GAP)); } catch (e) { n = null; }
      if (!isObject(n) || n.v !== 1 || !isObject(n.k)) n = { v: 1, at: at, k: {} };
      n.at = at;
      n.k[key] = op === 'd' ? '-' : H(val);
      if (!isObject(n.s)) n.s = {};
      n.s[key] = stamp;
    }
    try { own.setItem.call(real, GAP, JSON.stringify(n)); } catch (e) { st.noteFails++; }
  }
  function post(head, payload) {
    try { window.webkit.messageHandlers.ktStore.postMessage({ head: head, payload: payload }); st.posts++; }
    catch (e) { st.postFails++; }
  }
  // One op WebKit has just taken: the synchronous mirror, else the gap note and the async post. Never throws.
  function mirror(op, key, val) {
    var stamp = st.boot + ':' + (++st.seq), head = op + ' ' + stamp, payload = null, a = null;
    try {
      payload = op === 'c' ? '' : (op === 'd' ? q(key) : q(key) + '\n' + q(val));
      st.writes++;
      a = call(head, payload);
    } catch (e) { a = null; }
    if (a === 'ok') {
      st.acks++;
      if (op === 'c') { ack = Object.create(null); ackRest = true; } else ack[key] = true;
      return true;
    }
    st.fallbacks++;
    if (a == null) st.none++; else if (a === 'full' || a === 'busy' || a === 'err') st[a]++; else st.other++;
    if (op === 'c') { ack = Object.create(null); ackRest = false; } else ack[key] = false;
    try { note(op, key, val, stamp); } catch (e) { st.noteFails++; }
    if (payload != null) post(head, payload);
    return false;
  }

  // -- document start: WebKit's manifest and the gap note, then hello ------------------------------------------
  var lines = [], gap = null, i, n, k, v, r, res;
  if (wk) {
    try {
      gap = own.getItem.call(real, GAP);
      lines.push(gap == null ? 'null' : q(gap));
      for (i = 0, n = real.length; i < n; i++) {
        k = own.key.call(real, i);
        if (k == null || k === 'kt_apikey') continue;
        v = own.getItem.call(real, k);
        if (v != null) lines.push(q(k), q(H(v)));
      }
    } catch (e) { wk = false; }
  }
  if (!wk) {
    call('hello nowk', '');   // the store records it and reconciles nothing
    st.why = 'webkit unreadable';
    return;
  }
  res = call('hello', lines.join('\n'));
  r = parse(res);
  if (!isObject(r) || r.mode !== 'shadow' || !(r.boot >= 1) || !Array.isArray(r.need)) {
    st.why = isObject(r) && r.mode === 'off' ? 'store: ' + String(r.why || '') : (res == null ? 'no answer' : 'hello: ' + String(res).slice(0, 80));
    return;
  }
  st.boot = r.boot; st.rule = typeof r.rule === 'number' ? r.rule : -1; st.label = String(r.label || '');
  if (r.need.length) {
    // WebKit's values for the keys the store asked for (everything on the first launch; later only what an older
    // build, or a tool writing WebKit's file, changed behind the facade).
    var put = [];
    try {
      for (i = 0; i < r.need.length; i++) {
        k = String(r.need[i]);
        if (reserved(k)) continue;
        v = own.getItem.call(real, k);
        put.push(q(k), v == null ? 'null' : q(v));
      }
    } catch (e) { st.why = 'put: webkit unreadable'; return; }
    var pr = call('put', put.join('\n'));
    if (pr !== 'ok') { st.why = 'put: ' + pr; return; }
    st.need = r.need.length;
  }
  // Hello's adoption is done: the store has read the note.
  if (gap != null) { try { own.removeItem.call(real, GAP); } catch (e) { st.wkFails++; } }

  // Put back the owner staged in Settings > About > Storage: written into WebKit before the page's first script.
  if (r.putback === true) {
    var pb = parse(call('pb', '')), took = [];
    if (isObject(pb)) {
      Object.keys(pb).forEach(function (key) {
        var val = pb[key];
        if (reserved(key) || (val !== null && typeof val !== 'string')) return;
        try {
          if (val === null) own.removeItem.call(real, key); else own.setItem.call(real, key, val);
          took.push(q(key), val === null ? 'null' : q(val));
        } catch (e) { st.wkFails++; }
      });
    }
    if (took.length) { st.putBack = took.length / 2; call('p ' + st.boot + ':' + (++st.seq), took.join('\n')); }
  }

  // -- the page's localStorage from here on --------------------------------------------------------------------
  // Page-facing methods look Storage.prototype up at call time and pass the page's own arguments, so WebKit's
  // errors and coercions reach the page exactly as before.
  var facade = {
    getItem: function () { return SP.getItem.apply(real, arguments); },
    setItem: function (key, val) {
      SP.setItem.apply(real, arguments);
      key = String(key);
      if (reserved(key)) { st.passthrough++; return; }
      mirror('w', key, String(val));
    },
    removeItem: function (key) {
      SP.removeItem.apply(real, arguments);
      key = String(key);
      if (reserved(key)) { st.passthrough++; return; }
      mirror('d', key, null);
    },
    clear: function () { SP.clear.apply(real, arguments); mirror('c', null, null); },
    key: function () { return SP.key.apply(real, arguments); },
    get length() { return real.length; }
  };
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: function () { return facade; } });
  } catch (e) { st.why = 'install: ' + String(e && e.message || e); return; }
  st.mode = 'shadow';
  st.keys = real.length;
  st.bootMs = clock() - t0;
})();
