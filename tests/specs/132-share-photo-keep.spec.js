// fp-spec: self-shelled
// 132: the pending photo kept on the device until it is sent or removed, and a shared photo's words before the chat's
// first paint (the owner's iPhone, 13 Nov 2026, build 61: a cold share with words, the app closed before Send, and the
// words came back in the native composer while the photo was gone: getPendingShare deletes the App Group's copy as it
// answers, and the photo lived only in the page's memory). Every boot names its shell; the coach API answers at once.
// The record is IndexedDB's (fp-photo); which record is the page's photo is said by the marker kt_photo_kept ({n, at},
// left:1 once the owner left its chat and 0 once they came back, gone:1 once the photo was sent or removed or could not
// be kept), the device's high-water mark: each kept photo takes the next n, the marker is written before IndexedDB is
// asked and never removed.
// - (a) A share, then the app closed and opened again (a new scene): the photo is back in the composer and the chat
//   opens after hello (a share under 30 minutes old): the web chat's preview (none, with a photo of a real size),
//   build 61's overlay chat (coach61) and the native Coach tab's pushed chat (tabs), whose composer.image fetches the
//   photo; the record is the share's {data, mediaType, at, src, n, words} and the marker names its number and stamp.
//   Under the web chat (none, tabsWeb) the share's words come back with its chat, once at every launch beside words a
//   native composer handed over that took them in (the key follows the box); under the native chat the page drafts
//   none (the native composer keeps its own). A reload under the native chat (WebContent ended, the scene keeps the
//   chat up) takes the chat over with the photo and presents nothing again. A share kept over 30 minutes, or a photo
//   picked in the web composer, comes back with the chat left shut, and is there when it opens; so does a share under
//   30 minutes when the launch was asked for somewhere else (the widget's Start parked, a touch on the page while hello
//   was still out), which then counts as leaving it, in the same line (the next launch leaves it shut too), and a chat
//   taken over before such a touch shows the photo and says it was already on screen (a touch on the chat itself is
//   not leaving it). A chat the owner left (Log on the bar, Back to the hub, Back then Log, Log in the web chat) stays
//   shut at a reload in the same scene and at a relaunch, the photo back where the owner was. At a boot nobody sees (a
//   background launch) the photo comes back and its chat waits for the page to show: it opens then, or stays shut
//   once the 30 minutes have run out meanwhile. A photo put back with its chat shut stays out of the app's own prompts
//   in the web chat (the weekly review, a Today card's action, a seeded prompt, one beside handed-over words) and goes
//   with the owner's own Send (none, inert61, tabsWeb); once the chat has shown it (reopened by itself, or opened by
//   the owner's hand) it goes along with a prompt as any photo does.
// - (b) Sent (the web Send, coach.send usePending): the record goes and the marker says gone; the next launch has no
//   photo.
// - (c) Removed (the web composer's remove button, coach.clearImage): the same. A send or a removal whose deletion
//   IndexedDB failed (its transaction aborted, the connection lost) never comes back: the marker says gone, so the next
//   launch drops the record (sent or removed).
// - (d) A record older than 24 h, one the page cannot read, one a newer photo replaced, one sent or removed, or one
//   dated ahead of the clock is deleted at boot, says why, and never comes back.
// - (e) IndexedDB missing, its open throwing or never answering, its write refused for the quota, or the marker refused:
//   the share lands at once as it always did (photo, chat, words), the boot is untouched, nothing throws, nothing comes
//   back after a relaunch. A newer photo IndexedDB could not keep (the quota, an aborted transaction, a lost
//   connection) never brings back the photo it replaced (replaced), nor one whose marker was refused (the record it
//   replaced deleted at once).
// - (f) The words are in the first chat model pushed (coach61, tabs) and in the web composer (none) with the page's
//   clock paused: no timer runs between the read and the words. They are a page draft written before the chat is
//   drawn: beside words a native composer handed over, the web composer shows those first and the share's after them,
//   and the native chat opens on the share's words while the handed-over ones wait in the key for their own offer at
//   the next paint (spec 123's rule for a page draft); nothing of either is lost.
// - (g) A new share replaces the kept photo; a share waiting in the App Group when a kept share comes back at boot
//   wins whichever is read first: its photo, one chat opened (one selectTab with the chat's intent), the kept one
//   never shown over it.
// - (h) No breadcrumb carries the words or the photo: sizes and states only, in the read line's own shape. A step that
//   repeats is one line for its run, whatever the watch bridge logs between (an empty read at each launch, a boot that
//   cannot read IndexedDB), and a photo's later leaves of its chat are never a line: a launch that brings it back
//   again adds only its back line.
// - (i) A marker that never reached the disk (localStorage commits in batches, IndexedDB at once: the page ended
//   between them) loses nothing: the record numbered above the marker comes back with its chat, the marker written
//   again, whether nothing was kept before it or it replaced a kept photo, one sent or one whose chat was left. A newer
//   share kept before a boot could read such a record takes its number under its own stamp: the record is the photo
//   that share replaced, and never comes back.
// - (j) A read of the kept copy that fails reads again (web 20261115-2; WebKit aborts IndexedDB transactions when it
//   suspends, with no error: the owner's iPhone logged "kept copy not read (aborted)" at the first boot of the fix): a
//   visible page reads again 0.3 s later (0.25-1 s), the second read brings the photo back and opens its chat, and no
//   third read comes; a page nobody sees (a background launch) reads nothing more until it shows, then 0.3 s after the
//   show the same, and a page hidden during its 0.3 s wait reads only once it shows again; reads that abort twice end
//   with the third, the last, bringing the photo back, and later shows read nothing more; a share whose chat the owner
//   left comes back on a later read with the chat shut, its line naming the read; a read failed another way (the
//   connection lost: InvalidStateError) reads again too; a newer photo that came before the second read (a share read
//   while hidden) stays the pending one, its record and marker kept; a touch on the page (also in the owner's order
//   after a background launch: the page shown, then touched inside the 0.3 s), or the native chat's Back or
//   Open Settings under a chat taken over at a reload, the Coach hub's starter link, or setup's Cancel answered yes
//   (its read held, or aborted and read again), before the photo is back leaves the chat shut, counted as left, nothing
//   presented again; when every read aborts the page reads three times and no more, the record and its marker stay, one
//   line says so, and the next launch brings the photo back.
// - (k) The owner's move the shell took while no document was linked (web 20261115-4): a Back (the chat no longer up
//   in hello's answer while the document before had it up, and the shell still offering it) or a bar tap (hello's
//   newer selection on another tab) during a WebContent restart, a tab tapped at a cold launch before hello answered,
//   and build 60's overlay chat taken down during a restart: the kept share comes back with its chat shut, counted as
//   left, nothing presented again; with nothing moved (the take-over) nothing counts, and a chat the shell no longer
//   offers (the policy turned it off during the restart) opens as the web chat. The mark says which root the chat stood
//   on (web 20261117-1: fp_chat is t on a tab root's Coach stack, 1 as the overlay): a tab root that fell back while no
//   document was linked took its chat down itself (the policy before the next document or at its hello, a page that
//   leaves tabs out of its hello), so nothing counts and the kept share's chat opens as it did; a refused hello offers
//   no chat; a fallback the document heard leaves no mark; after a fallback nobody saw, the overlay chat's Back during
//   a second restart still counts. Build 62 (web 20261119-4; the harness's __fpShellDoc knob gives hello's reply the
//   document's number in its scene, doc): a restart that lost the scene's marks (fp_tab, fp_chat, fp_seen) while the
//   scene lived, which 61's reply reads as a move to the shell's tab (asked elsewhere, pinned beside it), boots blind
//   under 62's: hello's tab adopted uncounted, the share's web chat or connect screen back as before, one 'booted
//   without the scene's marks' line; the native chat taken over either way; with the marks kept a bar tap during the
//   restart still counts, and so does a tab tapped before hello at a cold launch (doc 1); under the classic root a
//   blind restart is only logged and a Back during it stays uncounted (the miss, left for later); fp_seen is written
//   once per document at its hello under every shell, and never without one. With exactly one of the marks kept
//   (fp_seen alone: the owner never changed tab; fp_tab alone: the Networking process crashed under the live page,
//   then the owner changed tab) the document is not blind and a bar tap during the restart counts: each half of the
//   blind test is held by one case.
// - (l) Setup's chat is the chat on screen whatever coachView says (web 20261115-6; renderCoach draws it so): a setup
//   chat taken over at a reload has the kept share back in it, already on screen, nothing presented, the view left as
//   setup keeps it; a photo that came back with its chat shut is the composer's photo once setup's chat shows it, and
//   leaving that chat counts as leaving it. Setup with no key draws the connect screen: a photo back with its chat
//   shut stays unseen there and nothing is counted (web 20261117-1).
// - (m) With no key the place a share lands (the Coach tab on the chat view, where the connect screen stands) is still
//   its place (web 20261117-1; 20261115-6 asked for a key and never counted the leave): the owner who goes to Log has
//   left it, and the next launches within the 30 minutes leave them on Log (none, coach61, tabs at a relaunch and at a
//   reload).
// - (n) A photo is in front of the owner only once a chat has drawn it (web 20261117-2). With no key the connect
//   screen stands where its chat would be and shows no photo: a photo shared then, or put back then, stays back, so
//   once a key is connected somewhere else (Settings) the app's own prompt (a Today card's action) goes without it and
//   past the share's words, which stay in the box beside it; the chat that prompt opens shows it, and from there it is
//   the composer's photo (none, inert61, tabsWeb; a fresh share and a kept one). Before, the place cleared back by
//   itself and the prompt carried a photo no frame had shown. The same when the kept share's turn finds its place
//   already on screen (a tool's route into the chat view): one place clears back, _photoWatch, and only with a key.
// - (o) Build 62's TrovoShare keeps a share its extension wrote until the page clears it (INIT62's stand-in; every case
//   above runs on build 61's, which the page asks with no argument): the page asks getPendingShare({keep:true}) and
//   clears the share by its id once, after its record is kept, and a later read finds nothing; a share with no id
//   (build 61's extension's, read by 62) clears nothing. Read again before its clear (the keep held), it is nothing new:
//   one chat, one read line, one keep. The app closed before the keep committed: the next launch reads it again and
//   opens its chat with the photo and the words. A keep that fails (web 20261119-4; IndexedDB missing or throwing, the
//   quota, an aborted put, the marker refused) is kept again on _photoRetry's schedule, three keeps a document at most:
//   0.3 s after the failure while the page shows (each about 0.3 s after the one before, no fourth), else 0.3 s after
//   it next shows; a keep that commits clears the share and the next launch has the photo back from the page's own
//   copy; when the third fails the share is cleared as build 61 cleared it at its read (the photo pending in memory
//   only, its chat open, the marker gone, one line for the failed keeps and one for the clear) and the next launch has
//   nothing. A read of the same id while the keep waits starts it at once on a page that shows and leaves it waiting on
//   a hidden one. The photo sent or removed while the keep waits clears the share at once, a newer share read meanwhile
//   wrote over it (nothing cleared for the first, no line), and no keep of it follows. A document nobody saw that ends
//   with its keep failed leaves the share, which the next document reads as a fresh share. The owner leaving the
//   share's chat while its keep waits (the failure marked the photo gone, so the leave could not be marked) is carried
//   by the keep that commits: the next launch brings the photo back with its chat shut. The photo sent, removed or
//   picked over before its keep settled: one clear, at once, and none when the keep commits. A newer share written
//   between the read and the clear: one "not cleared (newer share waiting)" line, the newer share read next and
//   cleared in its turn. A clear that fails says so once and the next read of the id asks again.
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const { boot, assert, run } = require('../lib/harness');

// Three cases at a time, each in its own browser: the spec waits on the page's own timers far more than it computes
// (one at a time it took five minutes of a CI job's fifteen). The cases share nothing but the machine.
const LANES = 3;
let _free = LANES;
const _queue = [];
function serial(name, fn) {
  run(name, async () => {
    if (_free > 0) _free--; else await new Promise((r) => _queue.push(r));
    try { await fn(); } finally { const next = _queue.shift(); if (next) next(); else _free++; }
  });
}
const ev = (app, fn, arg) => app.page.evaluate(fn, arg);
const J = (x) => JSON.stringify(x);
const settle = (app, ms) => app.page.waitForTimeout(ms || 60);
const KEY = 'sk-ant-test';
// base64 that reads back as itself (no padding surprises), and words no breadcrumb may carry
const PHOTO = 'UEhPVE8tS0VQVC1JTi1JTkRFWEVEREItMTMy';
const PHOTO2 = 'QU5PVEhFUi1TSEFSRUQtUEhPVE8tMTMy';
const BIG = 'QkFTRTY0'.repeat(162500);   // 1.3 MB of base64, as a phone's photo is
const WORDS = 'Form check on this squat, depth ok?';
const HANDED = 'HANDED words typed natively';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const MIN = 60000, HOUR = 3600000;

// In the page, before its scripts:
// - the coach API answering at once (each request's last user content in __turns), and __w(ms);
// - TrovoShare: build 61's plugin: the photo the extension left (__held), handed over once, as the plugin deletes what it
//   returns, each read recorded in __reads (whether it carried a photo) and its argument in __readArgs (null: none; a
//   page that asks build 61's with one trips it: a page error and a refused read, as no case expects); build 62's is
//   INIT62's, below; TrovoWidget.consumeDeepLink: the parked link (__parked), once;
// - __next (sessionStorage, set before a relaunch): what the next document starts with: a share waiting (held, parked),
//   hello's delay (the 61 mock's __fpShellHelloDelay), the parked link's answer held (linkDelay, ms), gate (the page's
//   IndexedDB opens held until __idbRelease()), hidden (the page boots unseen: document.visibilityState reads
//   __vis, 'visible' unless so) and clearFail (INIT62's __clearFail from the document's start);
// - __idb(op, rec): the kept record through IndexedDB's own API ('get', 'put', 'delete'), taken before an init can
//   take IndexedDB away; __mark(): the marker kt_photo_kept as JSON; __plant(rec, o): a record (its n 1 unless it has
//   one) and the marker naming it (o.mark false: none; o.markN: another number; o.left: left:1; o.gone: gone:1), as a
//   document before this one kept it; __log(): kt_wch_log's lines without their time;
// - TrovoShell's hello and selectTab wrapped as the mock installs them (as spec 130's): __tap records each call with the
//   page's time and the time its answer came (seen).
const INIT = `(() => {
  window.__turns = [];
  window.fetch = async (url, o) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    const body = JSON.parse(o.body);
    if (body.tools) window.__turns.push(JSON.stringify(body.messages.slice(-1)[0].content));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: body.tools ? 'On it.' : '{"message":"ok","actions":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = window.Capacitor.Plugins;
  window.__held = null; window.__reads = []; window.__parked = ''; window.__vis = 'visible';
  try {
    const n = JSON.parse(sessionStorage.getItem('__next') || 'null');
    sessionStorage.removeItem('__next');
    if (n) { window.__held = n.held || null; window.__parked = n.parked || ''; if (n.helloDelay) window.__fpShellHelloDelay = n.helloDelay; window.__linkDelay = n.linkDelay || 0; if (n.hidden) window.__vis = 'hidden'; window.__nextClearFail = n.clearFail || 0; }
    // abortReads: the first N reads of the photo store this document makes abort their transaction with no error, as
    // WebKit aborts one under a page it suspends (the owner's iPhone, 14 Nov); __photoGets counts the page's reads, and
    // __idb's own reads pass by (__inIdb)
    window.__photoGets = 0; window.__abortedReads = 0; window.__photoGetAt = [];
    { let left = (n && n.abortReads) || 0; const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function () {
        const r = get.apply(this, arguments);
        if (this.name === 'photo' && !window.__inIdb) {
          window.__photoGets++; window.__photoGetAt.push(performance.now());
          if (left > 0) {
            left--; window.__abortedReads++; this.transaction.abort();
            // hideAfterAbort (ms): the page hidden that long after the abort, while the page waits for its next read
            if (n && n.hideAfterAbort) setTimeout(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); }, n.hideAfterAbort);
          }
        }
        return r;
      }; }
    // abortPuts: the next N puts of the photo store this document makes abort their transaction with no error (a keep
    // WebKit aborts under a page it suspends); a case may set window.__abortPuts later. __photoPuts counts the page's
    // puts and __photoPutAt their times; __idb's own pass by (__inIdb)
    window.__photoPuts = 0; window.__photoPutAt = []; window.__abortPuts = (n && n.abortPuts) || 0;
    { const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        const r = put.apply(this, arguments);
        if (this.name === 'photo' && !window.__inIdb) {
          window.__photoPuts++; window.__photoPutAt.push(performance.now());
          if (window.__abortPuts > 0) { window.__abortPuts--; this.transaction.abort(); }
        }
        return r;
      }; }
    // loseOnce: the first transaction this document asks of the photo store throws InvalidStateError (the connection
    // lost, as WebKit says for a closing one); __idb's own pass
    if (n && n.loseOnce) {
      const tr = IDBDatabase.prototype.transaction; let once = true;
      IDBDatabase.prototype.transaction = function (names) {
        if (once && !window.__inIdb && String(names) === 'photo') { once = false; throw new DOMException('The database connection is closing.', 'InvalidStateError'); }
        return tr.apply(this, arguments);
      };
    }
    // gate: the page's IndexedDB opens answer only once __idbRelease() is called (the boot's read held back)
    if (n && n.gate) {
      let go; const gate = new Promise((r) => { go = r; }); window.__idbRelease = go;
      const realOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function () {
        const rq = realOpen.apply(this, arguments);
        let h = null;
        rq.addEventListener('success', (e) => { gate.then(() => { if (h) h.call(rq, e); }); });
        Object.defineProperty(rq, 'onsuccess', { configurable: true, get: () => h, set: (f) => { h = f; } });
        return rq;
      };
    }
  } catch (e) {}
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return window.__vis; } });
  window.__readArgs = [];
  P.TrovoShare = Object.assign(P.TrovoShare || {}, { getPendingShare: function () {
    window.__readArgs.push(arguments.length ? JSON.stringify(arguments[0]) : null);
    if (arguments.length) {
      const asked = JSON.stringify(arguments[0]);
      setTimeout(() => { throw new Error("build 61's getPendingShare was asked with an argument: " + asked); });
      return Promise.reject(new Error('build 61 takes no argument'));
    }
    const r = window.__held; window.__held = null;
    window.__reads.push(!!(r && r.imageBase64));
    return Promise.resolve(r || {});
  } });
  P.TrovoWidget = Object.assign(P.TrovoWidget || {}, { consumeDeepLink: () => {
    const u = window.__parked; window.__parked = '';
    return window.__linkDelay > 0 ? new Promise((r) => setTimeout(() => r({ url: u }), window.__linkDelay)) : Promise.resolve({ url: u });
  } });
  const IDB = window.indexedDB, idbOpen = IDB.open.bind(IDB);
  window.__idb = (op, rec) => new Promise((res) => {
    let rq;
    try { rq = idbOpen('fp-photo', 1); } catch (e) { res({ error: 'open threw' }); return; }
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('photo')) rq.result.createObjectStore('photo'); };
    rq.onerror = () => res({ error: 'open' });
    rq.onsuccess = () => {
      const db = rq.result;
      let out = null;
      window.__inIdb = true; let tx; try { tx = db.transaction('photo', op === 'get' ? 'readonly' : 'readwrite'); } finally { window.__inIdb = false; } const st = tx.objectStore('photo');
      if (op === 'get') { let g; window.__inIdb = true; try { g = st.get('pending'); } finally { window.__inIdb = false; } g.onsuccess = () => { out = g.result === undefined ? null : g.result; }; }
      else if (op === 'put') { window.__inIdb = true; try { st.put(rec, 'pending'); } finally { window.__inIdb = false; } }
      else st.delete('pending');
      tx.oncomplete = () => { db.close(); res(out); };
      tx.onabort = () => { db.close(); res({ error: String(tx.error && tx.error.name) }); };
    };
  });
  window.__mark = () => { try { return JSON.parse(localStorage.getItem('kt_photo_kept') || 'null'); } catch (e) { return 'unreadable'; } };
  window.__plant = (rec, o) => {
    o = o || {};
    rec = Object.assign({ n: 1 }, rec);
    if (o.mark !== false) localStorage.setItem('kt_photo_kept', JSON.stringify(Object.assign({ n: o.markN !== undefined ? o.markN : rec.n, at: rec.at }, o.left ? { left: 1 } : {}, o.gone ? { gone: 1 } : {})));
    return window.__idb('put', rec);
  };
  window.__log = () => { try { return JSON.parse(localStorage.getItem('kt_wch_log') || '[]').map((l) => String(l).slice(15)); } catch (e) { return []; } };
  window.__tap = [];
  let ts;
  Object.defineProperty(P, 'TrovoShell', { configurable: true, enumerable: true, get: () => ts, set: (v) => {
    ts = v;
    if (!v || typeof v !== 'object') return;
    ['hello', 'selectTab'].forEach((name) => {
      let f;
      Object.defineProperty(v, name, { configurable: true, enumerable: true, get: () => f, set: (fn) => {
        f = function (a) {
          const e = { name, args: a === undefined ? null : JSON.parse(JSON.stringify(a)), at: performance.now(), seen: null };
          window.__tap.push(e);
          const p = fn.apply(this, arguments);
          Promise.resolve(p).then(() => { e.seen = performance.now(); }, () => {});
          return p;
        };
      } });
    });
  } });
})();`;
// IndexedDB taken away three ways, its write refused for the quota, or the marker refused (after INIT, which keeps the
// real IndexedDB for __idb).
const NO_IDB = {
  missing: 'Object.defineProperty(window, "indexedDB", { configurable: true, get: function () { return undefined; } });',
  throws: 'IDBFactory.prototype.open = function () { throw new DOMException("refused by the spec", "SecurityError"); };',
  silent: 'IDBFactory.prototype.open = function () { return {}; };',   // a request whose events never come
  quota: 'IDBObjectStore.prototype.put = function () { throw new DOMException("full", "QuotaExceededError"); };',
  marker: '(function (si) { Storage.prototype.setItem = function (k) { if (String(k) === "kt_photo_kept") throw new DOMException("full", "QuotaExceededError"); return si.apply(this, arguments); }; })(Storage.prototype.setItem);',
};
// IndexedDB failing under a page that has kept a photo, in the page (each once where it says so): a put refused for the
// quota, a put whose transaction aborts, a delete whose transaction aborts, the connection lost (db.transaction throws
// InvalidStateError, as WebKit does for a closing connection); or the marker refused for the quota.
const FAIL = {
  quota: () => { IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); }; },
  marker: () => { const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k) { if (String(k) === 'kt_photo_kept') throw new DOMException('full', 'QuotaExceededError'); return si.apply(this, arguments); }; },
  abortPut: () => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { const r = put.apply(this, arguments); this.transaction.abort(); return r; }; },
  abortDelete: () => { const del = IDBObjectStore.prototype.delete; let once = true; IDBObjectStore.prototype.delete = function () { const r = del.apply(this, arguments); if (once) { once = false; this.transaction.abort(); } return r; }; },
  lost: () => { const tr = IDBDatabase.prototype.transaction; let once = true; IDBDatabase.prototype.transaction = function () { if (once) { once = false; throw new DOMException('The database connection is closing.', 'InvalidStateError'); } return tr.apply(this, arguments); }; },
};

// Build 62's TrovoShare (CapApp/TrovoSharePlugin.swift), after INIT: the App Group's share (__held, now with its id)
// kept in the scene's sessionStorage (__appGroup), as the group's container outlives a document, so a relaunch's
// document reads what the one before left (a share __next names wins). getPendingShare(o): with o.keep and a share with
// an id it stays and the answer carries the id; anything else is read and deleted with no id (a share build 61's
// extension left). clearPendingShare({id}) removes it only while it is that id ({cleared}), recorded in __clears (the
// id, the share held then, and kept: whether the page's IndexedDB record held that share's photo, read once the call
// came); __clearFail (n) makes the next n clears reject.
const INIT62 = `(() => {
  const P = window.Capacitor.Plugins;
  let held = window.__held;
  if (!held) { try { held = JSON.parse(sessionStorage.getItem('__appGroup') || 'null'); } catch (e) { held = null; } }
  const save = () => { try { if (held) sessionStorage.setItem('__appGroup', JSON.stringify(held)); else sessionStorage.removeItem('__appGroup'); } catch (e) {} };
  save();
  Object.defineProperty(window, '__held', { configurable: true, get: () => held, set: (v) => { held = v || null; save(); } });
  window.__clears = []; window.__clearFail = window.__nextClearFail || 0;
  P.TrovoShare = Object.assign(P.TrovoShare || {}, {
    getPendingShare: function (o) {
      window.__readArgs.push(arguments.length ? JSON.stringify(o) : null);
      const r = held, keep = !!(o && o.keep) && !!r && !!r.id;
      if (!keep) window.__held = null;
      window.__reads.push(!!(r && r.imageBase64));
      if (!r) return Promise.resolve({});
      return Promise.resolve(keep ? { imageBase64: r.imageBase64, comment: r.comment || '', id: r.id } : { imageBase64: r.imageBase64, comment: r.comment });
    },
    clearPendingShare: function (o) {
      const id = o && o.id !== undefined ? o.id : null, photo = held ? held.imageBase64 : null;
      const e = { id, held: held ? held.id || null : null, kept: null };
      window.__clears.push(e);
      window.__idb('get').then((rec) => { e.kept = !!(rec && !rec.error && photo && rec.data === photo); });
      if (window.__clearFail > 0) { window.__clearFail--; return Promise.reject(new Error('refused by the spec')); }
      const ok = !!held && !!held.id && held.id === id;
      if (ok) window.__held = null;
      return Promise.resolve({ cleared: ok });
    },
  });
})();`;

const pageBoot = (shell, o) => {
  o = Object.assign({}, o || {});
  return boot(Object.assign({ native: true, shell }, o, { init: INIT + (o.init || ''),
    seed: Object.assign({ kt_apikey: KEY, kt_coach_msgs: '[]' }, o.seed || {}) }));
};
// Hello answered (under a flag), the morning card's fetch done and the boot's own share check (+2.5 s) read, so a case's
// share never meets it.
const ready = (app, flag) => app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && typeof coachCardLoading !== 'undefined'
  && !coachCardLoading && window.__reads.length > 0 && !_shareBusy, flag, { timeout: 15000 }).then(() => settle(app, 40));
const lines = (app) => ev(app, () => __log());
const waitLine = (app, test, label) => app.page.waitForFunction((src) => __log().some(new Function('l', 'return ' + src)), test, { timeout: 15000 })
  .catch(async (e) => { throw new Error((label || test) + ' never logged: ' + J(await lines(app).catch(() => null)) + ' ' + e.message); });
// A share read by the page (the reader, as the deep link calls it), then its record kept (or not); id: build 62's.
const share = async (app, photo, words, id) => {
  const n = await ev(app, () => __log().filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0).length);
  const o = await ev(app, async (a) => {
    window.__held = { imageBase64: a.photo, comment: a.words || undefined, id: a.id || undefined };
    await checkPendingShare();
    const box = document.getElementById('coach-input');
    return { img: pendingImage ? pendingImage.data : null, tab: currentTab, view: coachView, box: box ? box.value : null };
  }, { photo, words, id });
  await app.page.waitForFunction((n) => __log().filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0).length > n, n, { timeout: 15000 });
  await settle(app, 30);   // render's watch (a timer) has seen the chat
  o.kept = await ev(app, () => __idb('get'));
  o.mark = await ev(app, () => __mark());
  return o;
};
// The app closed and opened again: a new scene for the 61 mock (its sessionStorage copy, fp_tab, fp_chat and fp_seen
// gone, as a new web view's sessionStorage starts empty), next for the document it starts.
const relaunch = async (app, next) => {
  await ev(app, (next) => {
    sessionStorage.removeItem('__fpShellMock'); sessionStorage.removeItem('fp_tab'); sessionStorage.removeItem('fp_chat'); sessionStorage.removeItem('fp_seen');
    if (next) sessionStorage.setItem('__next', JSON.stringify(next)); else sessionStorage.removeItem('__next');
  }, next || null);
  await app.reload();
};
const look = (app) => ev(app, () => {
  const box = document.getElementById('coach-input'), S = window.__fpShell;
  const models = S ? S.calls.filter((c) => c[0] === 'model' && c[1].screen === 'coach').map((c) => JSON.parse(c[1].json)) : [];
  return { img: pendingImage ? pendingImage.data : null, type: pendingImage ? pendingImage.mediaType : null, key: pendingImage ? pendingImage.key || null : null, back: pendingImage ? pendingImage.back : null,
    tab: currentTab, view: coachView, photo: !!document.querySelector('#screen img[alt="Photo to send"]'), box: box ? box.value : null,
    comp: models.length ? models[models.length - 1].composer : null, shown: !!(window._fp && _fp.shown.coach),
    ops: S ? S.calls.filter((c) => c[0] === 'present' || c[0] === 'dismiss').map((c) => c[0] + ' ' + c[1].screen) : [],
    chats: S ? S.calls.filter((c) => c[0] === 'selectTab' && c[1] && c[1].intent === 'chat').length : 0,
    reads: __reads.slice(), log: __log(), mark: __mark(), kept: null };
}).then(async (m) => { m.kept = await ev(app, () => __idb('get')); return m; });
// The chat is not on screen and was not asked for in this document.
const shut = (m) => !(m.tab === 'coach' && m.view === 'chat') && m.chats === 0 && !m.ops.some((o) => o === 'present coach');
// The marker names the record (its number and stamp, nothing else); the marker says its photo is gone.
const names = (mark, kept) => !!mark && !!kept && typeof kept.n === 'number' && J(mark) === J({ n: kept.n, at: kept.at });
const gone = (mark) => !!mark && typeof mark.n === 'number' && mark.gone === 1;
// (h) sizes and states only: no line carries the words, any stretch of a photo, or a data URL.
const NEEDLES = [WORDS, WORDS.slice(0, 12), HANDED.slice(0, 12), PHOTO.slice(0, 12), PHOTO2.slice(0, 12), BIG.slice(0, 12), 'base64', 'data:'];
const clean = (log, more) => {
  const bad = log.filter((l) => NEEDLES.concat(more || []).some((x) => x && l.indexOf(x) >= 0));
  assert(bad.length === 0, 'no breadcrumb carries the words or the photo: ' + J(bad));
  log.filter((l) => l.indexOf('share: read') === 0).forEach((l) => assert(/^share: read \d+ KB, words \d+ chars, page (visible|hidden)$/.test(l), 'the read line\'s shape: ' + l));
};
const noErrors = (app) => assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
// Playwright's clock (the boot passed clock), paused once the page is up (as spec 130's pause).
const pause = async (app) => {
  for (let k = 0; ; k++) {
    const t = await ev(app, () => Date.now());
    try { await app.page.clock.pauseAt(t + 200); return; } catch (e) { if (k >= 20 || !/past/.test(String(e && e.message))) throw e; }
  }
};
// The page shows again (the app back in front): visibilityState visible and its event.
const show = (app) => ev(app, () => { window.__vis = 'visible'; window.__shownAt = performance.now(); document.dispatchEvent(new Event('visibilitychange')); });
// The page hidden (the app left): visibilityState hidden and its event.
const hide = (app) => ev(app, () => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });

// ── (a) the photo comes back ──────────────────────────────────────────────────────────────────────────────────────
serial('(a) a share, then the app closed and opened again: the photo is back in the composer and the chat opens after hello (a share under 30 minutes): the web chat\'s preview (none, a photo of a real size), build 61\'s overlay chat (coach61) and the native Coach tab\'s pushed chat (tabs), whose composer.image fetches the photo; the record is the share\'s and the marker names it', async () => {
  for (const shell of ['none', 'coach61', 'tabs']) {
    const photo = shell === 'none' ? BIG : PHOTO;
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, photo, WORDS);
      const now = Date.now();
      assert(s.img === photo && s.tab === 'coach' && s.view === 'chat' && s.kept && s.kept.data === photo && s.kept.mediaType === 'image/jpeg'
        && s.kept.src === 'share' && Math.abs(s.kept.at - now) < MIN && s.kept.n >= 1 && s.kept.words === WORDS
        && J(Object.keys(s.kept).sort()) === J(['at', 'data', 'mediaType', 'n', 'src', 'words']),
        shell + ': the share read, its record {data, mediaType, at, src, n, words} kept: ' + J(Object.assign({}, s, { img: !!s.img, kept: s.kept && { src: s.kept.src, at: s.kept.at, n: String(s.kept.data).length } })));
      assert(names(s.mark, s.kept), shell + ': the marker names the record\'s number and stamp: ' + J(s.mark));
      if (shell === 'none') assert(s.box === WORDS, 'none: the words in the web composer: ' + J(s.box));
      // the next launch, hello 600 ms late under the flags: the photo back, the chat opened after hello's answer
      await relaunch(app, shell === 'none' ? null : { helloDelay: 600 });
      await waitLine(app, '/^photo: back from/.test(l)', 'photo: back from');
      if (shell !== 'none') await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
      await settle(app, 150);
      const m = await look(app);
      assert(m.img === photo && m.type === 'image/jpeg' && m.tab === 'coach' && m.view === 'chat' && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
        shell + ': the photo back and the chat opened: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept })));
      assert(m.kept && m.kept.data === photo && m.kept.src === 'share' && names(m.mark, s.kept), shell + ': the record and the marker stay until the photo is sent or removed: ' + J(m.mark));
      assert(m.reads.length >= 1 && m.reads[0] === false, shell + ': the reader looked in the App Group first and found nothing: ' + J(m.reads));
      if (shell === 'none') {
        assert(m.photo && m.ops.length === 0, 'none: the web chat shows the photo: ' + J({ photo: m.photo, ops: m.ops }));
      } else {
        assert(J(m.ops) === J(shell === 'tabs' ? ['present coachHome', 'present coach'] : ['present coach']) && m.comp && m.comp.image && m.comp.image.key === m.key && !!m.key,
          shell + ': the chat presented on a model holding the photo\'s key: ' + J({ ops: m.ops, comp: m.comp, key: m.key }));
        const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), m.key);
        assert(img.ok === true && img.data === photo && img.mediaType === 'image/jpeg', shell + ': the native composer fetches the photo: ' + J({ ok: img.ok, n: String(img.data || '').length }));
        const t = await ev(app, () => __tap.map((e) => ({ name: e.name, args: e.args, at: e.at, seen: e.seen })));
        const h = t.find((e) => e.name === 'hello');
        if (shell === 'tabs') {
          const sel = t.filter((e) => e.name === 'selectTab' && e.args && e.args.intent === 'chat');
          assert(h && typeof h.seen === 'number' && h.seen - h.at >= 590 && sel.length === 1 && J(sel[0].args) === J({ tab: 'coach', intent: 'chat' }) && sel[0].at >= h.seen && m.chats === 1,
            'tabs: one selectTab {tab:\'coach\', intent:\'chat\'}, after hello\'s answer: ' + J(t));
        } else assert(h && typeof h.seen === 'number' && h.seen - h.at >= 590, 'coach61: hello answered late: ' + J(t));
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) a reload under the native chat (WebContent ended; the scene keeps the chat up): the take-over has the photo back, nothing presented again (tabs, coach61)', async () => {
  for (const shell of ['tabs', 'coach61']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      await app.reload();   // the same scene: hello's answer names the chat up
      await waitLine(app, '/^photo: back from/.test(l)', 'photo: back from');
      await settle(app, 150);
      const m = await look(app);
      const up = await ev(app, () => { const h = __tap.find((e) => e.name === 'hello'); return { shown: !!_fp.shown.coach, home: !!_fp.shown.coachHome, hello: !!_fp.hello, n: h ? 1 : 0 }; });
      assert(up.shown && m.ops.length === 0 && m.img === PHOTO && m.comp && m.comp.image && m.comp.image.key === m.key && m.tab === 'coach' && m.view === 'chat',
        shell + ': the chat taken over, its model with the photo, nothing presented: ' + J(Object.assign({}, m, { log: m.log.slice(0, 4), kept: !!m.kept }, up)));
      const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), m.key);
      assert(img.ok === true && img.data === PHOTO, shell + ': the native composer fetches the photo: ' + J({ ok: img.ok }));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) a share kept over 30 minutes, and a photo picked in the web composer: the photo comes back with the chat left shut, and is there when the chat opens', async () => {
  // a share 45 minutes old, under tabs
  let app = await pageBoot('tabs');
  try {
    await ready(app, true);
    await ev(app, (r) => __plant(r), { data: PHOTO2, mediaType: 'image/jpeg', at: Date.now() - 45 * MIN, src: 'share' });
    await relaunch(app);
    await waitLine(app, '/^photo: back from/.test(l)', 'photo: back from');
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await settle(app, 300);
    const m = await look(app);
    assert(m.img === PHOTO2 && m.tab === 'log' && m.chats === 0 && J(m.ops) === J(['present coachHome']) && m.log.indexOf('photo: back from 45 min') >= 0,
      'tabs: the photo back, the chat shut, on the boot\'s tab: ' + J(Object.assign({}, m, { kept: !!m.kept })));
    await ev(app, () => { switchTab('coach', { intent: 'chat' }); coachView = 'chat'; render(); });
    await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
    const n = await look(app);
    const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), n.key);
    assert(n.comp && n.comp.image && n.comp.image.key === n.key && img.ok && img.data === PHOTO2, 'tabs: the chat opened later has it: ' + J({ comp: n.comp, ok: img.ok }));
    clean(n.log);
    noErrors(app);
  } finally { await app.close(); }
  // a photo picked in the web composer (the real picker), under none
  app = await pageBoot('none');
  try {
    await ready(app, false);
    await ev(app, () => { switchTab('coach'); coachView = 'chat'; render(); });
    const [fc] = await Promise.all([app.page.waitForEvent('filechooser', { timeout: 10000 }), app.page.click('.coach-attach')]);
    await fc.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    await waitLine(app, 'l === "photo: kept"', 'photo: kept');
    const k = await ev(app, async () => ({ img: pendingImage && pendingImage.data, type: pendingImage && pendingImage.mediaType, kept: await __idb('get'), mark: __mark() }));
    assert(k.img && k.kept && k.kept.data === k.img && k.kept.src === 'pick' && k.kept.mediaType === k.type && /^image\//.test(k.type) && names(k.mark, k.kept) && k.kept.words === undefined,
      'none: the picked photo kept as a pick: ' + J({ type: k.type, src: k.kept && k.kept.src, mark: k.mark }));
    await relaunch(app);
    await waitLine(app, '/^photo: back from/.test(l)', 'photo: back from');
    await settle(app, 300);
    const m = await look(app);
    assert(m.img === k.img && m.tab === 'log' && !m.photo && m.log.indexOf('photo: back from 0 min') >= 0, 'none: the pick back, the chat shut: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept })));
    await ev(app, () => { switchTab('coach'); coachView = 'chat'; render(); });
    const n = await look(app);
    assert(n.photo && n.img === k.img, 'none: the chat opened later shows it: ' + J({ photo: n.photo }));
    clean(n.log, [k.img.slice(0, 12)]);
    noErrors(app);
  } finally { await app.close(); }
});

serial('(a) a share under 30 minutes comes back with the chat left shut when the launch was asked for somewhere else: the widget\'s Start parked (tabs, none), a touch on the page while hello was still out (tabs), and that counts as leaving it, in the same line (the next launch leaves it shut too); a reload under the native chat touched before the open keeps the chat it took over, with the photo in front of the owner, says the chat was already on screen, and a touch on the chat itself is not leaving it (tabs)', async () => {
  for (const [shell, how] of [['tabs', 'start'], ['none', 'start'], ['tabs', 'touch'], ['tabs', 'takeover']]) {
    const tag = shell + ', ' + how + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      if (how === 'takeover') {
        // the chat taken over first (hello at once, the scene keeps it up), the photo back after it, and the parked link's
        // check held 1.5 s so the touch comes before the kept share's turn
        await share(app, PHOTO, WORDS);
        await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
        await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ linkDelay: 1500 })));
        await app.reload();
        await app.page.waitForFunction(() => window._fp && _fp.shown.coach && !!pendingImage, null, { timeout: 15000 });
        const t = await ev(app, () => { const r = { log: __log().filter((l) => /^photo: back from/.test(l)) }; document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return r; });
        assert(t.log.length === 0, tag + 'touched before the kept share\'s turn: ' + J(t));
        await waitLine(app, 'l === "photo: back from 0 min, chat already on screen"', 'chat already on screen');
        await settle(app, 100);
        const m = await look(app);
        const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), m.key);
        assert(m.shown && m.tab === 'coach' && m.view === 'chat' && m.ops.length === 0 && m.comp && m.comp.image && m.comp.image.key === m.key && img.ok && img.data === PHOTO && m.back === 0,
          tag + 'the chat it took over shows the photo, in front of the owner: ' + J({ shown: m.shown, tab: m.tab, view: m.view, ops: m.ops, comp: m.comp, ok: img.ok, back: m.back }));
        assert(!m.log.some((l) => /chat not opened/.test(l)), tag + 'no line says the chat was not opened: ' + J(m.log.slice(0, 4)));
        assert(m.mark && !m.mark.left && m.log.indexOf('photo: chat left') < 0, tag + 'a touch on the chat on screen is not leaving it: ' + J({ mark: m.mark, log: m.log.slice(0, 4) }));
        // so the next launch opens it again
        await relaunch(app);
        await waitLine(app, 'l === "photo: back from 0 min, chat opened"', 'chat opened');
        clean(m.log);
        noErrors(app);
        continue;
      }
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
      await relaunch(app, how === 'start' ? { parked: 'trovo://start' } : { helloDelay: 2500 });
      if (how === 'touch') {
        const t = await ev(app, () => { const h = !!(window._fp && _fp.hello); document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return { hello: h }; });
        assert(!t.hello, tag + 'touched before hello\'s answer: ' + J(t));
      }
      await waitLine(app, '/^photo: back from 2 min/.test(l)', 'photo: back from 2 min');
      await ready(app, shell !== 'none');
      await settle(app, 200);
      const m = await look(app);
      assert(m.img === PHOTO && m.tab === 'log' && m.view !== 'chat' && m.chats === 0 && !m.ops.some((o) => o === 'present coach')
        && m.log.indexOf('photo: back from 2 min, chat not opened (asked elsewhere), counted as left') >= 0,
        tag + 'the photo back, the chat shut, on Log: ' + J(Object.assign({}, m, { log: m.log.slice(0, 6), kept: !!m.kept })));
      assert(m.mark && m.mark.left === 1 && m.log.indexOf('photo: chat left') < 0, tag + 'the launch asked elsewhere counts as leaving the chat, said in the back line: ' + J({ mark: m.mark, log: m.log.slice(0, 4) }));
      // the next launch, asked for nowhere: the chat stays shut, the photo back
      await relaunch(app);
      await waitLine(app, '/^photo: back from [23] min, chat not opened \\(left earlier\\)$/.test(l)', 'left earlier');
      await ready(app, shell !== 'none');
      await settle(app, 100);
      const r = await look(app);
      assert(r.img === PHOTO && shut(r), tag + 'the next launch: the photo back, the chat shut: ' + J(Object.assign({}, r, { log: r.log.slice(0, 4), kept: !!r.kept })));
      // the owner opens the chat: the photo there, and the chat is the owner's place again (the marker's left goes), so
      // the launch after that opens it on its own
      await ev(app, () => { switchTab('coach', { intent: 'chat' }); coachView = 'chat'; render(); });
      if (shell === 'tabs') await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
      await settle(app, 60);
      const n = await look(app);
      assert((shell === 'none' ? n.photo : (n.comp && n.comp.image && n.comp.image.key === n.key)) && !!n.mark && J(n.mark) === J({ n: n.mark.n, at: n.mark.at, left: 0 }),
        tag + 'the chat opened later has the photo, and the marker\'s left 0 (came back): ' + J({ comp: n.comp, photo: n.photo, mark: n.mark }));
      await relaunch(app);
      await waitLine(app, '/^photo: back from [23] min, chat opened$/.test(l)', 'chat opened again');
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) a chat the owner left stays shut: after a share the owner went to Log on the bar or Back to the hub (tabs), Back then Log (coach61) or to Log (none); a reload in the same scene (WebContent ended) or a relaunch brings the photo back where the owner was, the chat not opened (left earlier)', async () => {
  for (const [shell, how, again] of [['tabs', 'bar-log', 'reload'], ['tabs', 'back-hub', 'reload'], ['coach61', 'back-then-log', 'reload'], ['none', 'log', 'relaunch'], ['tabs', 'bar-log', 'relaunch']]) {
    const tag = shell + ', ' + how + ', ' + again + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS);
      assert(s.view === 'chat' && names(s.mark, s.kept), tag + 'the share\'s chat, its marker: ' + J(s.mark));
      await ev(app, async (how) => {
        if (how === 'bar-log') await __fpShell.tap('log');
        else if (how === 'back-hub') await __fpShell.call('coach.back', {});
        else if (how === 'back-then-log') { await __fpShell.call('coach.back', {}); switchTab('log'); }
        else switchTab('log');
      }, how);
      await waitLine(app, 'l === "photo: chat left"', 'photo: chat left');
      const left = await ev(app, () => ({ mark: __mark(), tab: currentTab, view: coachView, img: !!pendingImage }));
      assert(left.img && left.mark && left.mark.at === s.kept.at && left.mark.left === 1, tag + 'left: the marker says so, the photo still pending: ' + J(left));
      if (again === 'reload') await app.reload(); else await relaunch(app);
      await waitLine(app, 'l === "photo: back from 0 min, chat not opened (left earlier)"', 'left earlier');
      await ready(app, shell !== 'none');
      await settle(app, 200);
      const m = await look(app);
      const where = again === 'relaunch' ? 'log' : { 'bar-log': 'log', 'back-hub': 'coach', 'back-then-log': 'log' }[how];
      assert(m.img === PHOTO && m.tab === where && shut(m) && !m.shown && m.kept && m.kept.data === PHOTO,
        tag + 'the photo back where the owner was, the chat shut: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5), kept: !!m.kept })));
      if (shell === 'tabs' && how === 'bar-log' && again === 'reload') {
        await ev(app, () => { switchTab('coach', { intent: 'chat' }); coachView = 'chat'; render(); });
        await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
        const n = await look(app);
        const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), n.key);
        assert(n.comp && n.comp.image && n.comp.image.key === n.key && img.ok && img.data === PHOTO, tag + 'the chat opened by the owner has it: ' + J(n.comp));
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) at a boot nobody sees (a background launch) the kept share comes back but its chat waits for the page to show: then it opens (tabs, none), or stays shut once the 30 minutes have run out meanwhile (tabs: the share\'s stamp 31 minutes back while hidden, as the clock moving on)', async () => {
  for (const [shell, late] of [['tabs', false], ['none', false], ['tabs', true]]) {
    const tag = shell + (late ? ', late' : '') + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
      await relaunch(app, { hidden: true });
      await waitLine(app, 'l === "photo: back from 2 min, chat waits for the page to show"', 'chat waits');
      await ready(app, shell !== 'none');   // the boot's +2.5 s check has read too, hidden: the chat still waits
      await settle(app, 200);
      const h = await look(app);
      assert(h.img === PHOTO && h.tab === 'log' && shut(h) && h.log.filter((l) => /chat waits/.test(l)).length === 1 && !h.log.some((l) => /chat (not )?opened/.test(l)),
        tag + 'hidden: the photo back, the chat waiting: ' + J(Object.assign({}, h, { log: h.log.slice(0, 5), kept: !!h.kept })));
      if (late) await ev(app, () => { _photoBack.at -= 31 * 60000; });
      await show(app);
      if (late) {
        await waitLine(app, '/^photo: back from 3[34] min, chat not opened \\(over 30 min\\)$/.test(l)', 'over 30 min');
        await settle(app, 200);
        const m = await look(app);
        assert(m.img === PHOTO && shut(m), tag + 'shown after the 30 minutes: the photo back, the chat shut: ' + J(Object.assign({}, m, { log: m.log.slice(0, 4), kept: !!m.kept })));
      } else {
        await waitLine(app, '/^photo: back from [23] min, chat opened$/.test(l)', 'chat opened');
        if (shell !== 'none') await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
        await settle(app, 100);
        const m = await look(app);
        assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && (shell === 'none' ? m.photo : (m.chats === 1 && m.comp && m.comp.image && m.comp.image.key === m.key)),
          tag + 'shown: the chat opens on the photo: ' + J(Object.assign({}, m, { log: m.log.slice(0, 4), kept: !!m.kept })));
      }
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) a photo put back with its chat shut (a pick kept 3 h) stays out of the app\'s own prompts in the web chat (the weekly review, a Today card\'s action, a seeded prompt, one beside handed-over words) and goes with the owner\'s own Send (none, inert61, tabsWeb); a kept share whose chat opened for the owner goes along with a prompt, as a photo set in this launch does (none)', async () => {
  for (const shell of ['none', 'inert61', 'tabsWeb']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 3 * HOUR, src: 'pick' });
      await relaunch(app);
      await waitLine(app, 'l === "photo: back from 180 min"', 'photo: back from 180 min');
      await ready(app, shell !== 'none');
      const r = await ev(app, async (PHOTO) => {
        // each prompt meets the photo as the boot put it back (back: no chat has shown it since), in the prompt's own
        // task: the chat the prompt before it opened has shown it, and from then it is the composer's photo (below)
        const turn = async (f) => {
          const n = __turns.length; if (pendingImage) pendingImage.back = 1; f();
          for (let i = 0; i < 200 && (coachLoading || __turns.length === n); i++) await __w(20);
          await __w(60);
          const t = __turns[__turns.length - 1] || '';
          return { sent: __turns.length > n, image: t.indexOf('"type":"image"') >= 0, pending: !!pendingImage && pendingImage.data === PHOTO };
        };
        const out = { before: { tab: currentTab, back: !!(pendingImage && pendingImage.back) } };
        out.review = await turn(() => startWeeklyReview());
        out.card = await turn(() => coachCardAction('Swap in dips'));
        out.seeded = await turn(() => _coachAsk('Propose ONE concrete programme change', { seed: 'Plateau check' }));
        // beside words a native composer handed over (the box held, _fpBoxHeld): straight to coachSend, still without it
        localStorage.setItem('kt_coach_handover', 'Typed natively'); document.getElementById('coach-input').value = 'Typed natively';
        out.held = await turn(() => _coachAsk('How was my week?', { seed: 'Weekly review' }));
        out.preview = !!document.querySelector('#screen img[alt="Photo to send"]');
        out.kept = !!(await __idb('get')); out.mark = __mark();
        // the owner's own Send takes it
        document.getElementById('coach-input').value = 'Form check please';
        out.own = await turn(() => document.getElementById('coach-send').click());
        out.after = { kept: await __idb('get'), mark: __mark(), log: __log().slice(0, 3) };
        return out;
      }, PHOTO);
      const app2 = [r.review, r.card, r.seeded, r.held];
      assert(r.before.tab === 'log' && r.before.back && app2.every((x) => x.sent && !x.image && x.pending) && r.preview && r.kept && r.mark && typeof r.mark.at === 'number',
        shell + ': the app\'s prompts went without the photo, which stays in the composer and kept: ' + J(r));
      assert(r.own.sent && r.own.image && !r.own.pending && r.after.kept === null && gone(r.after.mark) && r.after.log.indexOf('photo: sent') >= 0,
        shell + ': the owner\'s own Send takes it: ' + J({ own: r.own, after: r.after }));
      noErrors(app);
    } finally { await app.close(); }
  }
  // a kept share whose chat opened for the owner: the weekly review takes it along (as a share in this launch would)
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
    await relaunch(app);
    await waitLine(app, 'l === "photo: back from 2 min, chat opened"', 'chat opened');
    await ready(app, false);
    const r = await ev(app, async () => {
      const n = __turns.length; startWeeklyReview();
      for (let i = 0; i < 200 && (coachLoading || __turns.length === n); i++) await __w(20);
      await __w(60);
      const t = __turns[__turns.length - 1] || '';
      return { sent: __turns.length > n, image: t.indexOf('"type":"image"') >= 0, pending: !!pendingImage, mark: __mark(), log: __log().slice(0, 2) };
    });
    assert(r.sent && r.image && !r.pending && gone(r.mark) && r.log.indexOf('photo: sent') >= 0, 'none: the opened share went with the review: ' + J(r));
    noErrors(app);
  } finally { await app.close(); }
});

serial('(a) a photo put back with its chat shut is the composer\'s photo as any other once the chat has shown it: the owner opens the chat by hand and sees it, goes to Log, and a Today card\'s action takes it along, as for one whose chat reopened by itself (none, tabsWeb)', async () => {
  for (const shell of ['none', 'tabsWeb']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __plant(r, { left: true }), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
      await relaunch(app);
      await waitLine(app, 'l === "photo: back from 2 min, chat not opened (left earlier)"', 'left earlier');
      await ready(app, shell !== 'none');
      const r = await ev(app, async () => {
        const out = { shut: { back: pendingImage && pendingImage.back, tab: currentTab, view: coachView } };
        switchTab('coach', { intent: 'chat' }); openCoachChat();
        await __w(60);
        out.seen = { back: pendingImage && pendingImage.back, preview: !!document.querySelector('#screen img[alt="Photo to send"]') };
        switchTab('log'); await __w(40);
        const n = __turns.length; coachCardAction('Swap in dips');
        for (let i = 0; i < 200 && (coachLoading || __turns.length === n); i++) await __w(20);
        await __w(60);
        const t = __turns[__turns.length - 1] || '';
        Object.assign(out, { sent: __turns.length > n, image: t.indexOf('"type":"image"') >= 0, pending: !!pendingImage });
        return out;
      });
      assert(r.shut.back === 1 && r.shut.view !== 'chat' && r.seen.preview && r.seen.back === 0, shell + ': back until the chat the owner opened showed it: ' + J(r));
      assert(r.sent && r.image && !r.pending, shell + ': the card\'s action took the photo the owner had seen: ' + J(r));
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) under the web chat a kept share\'s words come back with its chat, before it is drawn, as a fresh share\'s do (none, tabsWeb); under the native chat the page drafts none, the native composer keeping its own (tabs)', async () => {
  for (const shell of ['none', 'tabsWeb', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS);
      assert(s.kept && s.kept.data === PHOTO && (shell === 'tabs' || s.box === WORDS), shell + ': the share kept, its words in the web composer: ' + J({ box: s.box }));
      await relaunch(app);
      await waitLine(app, 'l === "photo: back from 0 min, chat opened"', 'chat opened');
      if (shell === 'tabs') await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
      await settle(app, 150);
      const m = await look(app);
      if (shell === 'tabs') {
        assert(m.view === 'chat' && m.comp && m.comp.image && m.comp.image.key === m.key && !m.comp.draft, 'tabs: the native chat on the photo, no page draft over the native composer\'s own words: ' + J(m.comp));
      } else assert(m.view === 'chat' && m.photo && m.box === WORDS, shell + ': the web chat with the photo and the share\'s words: ' + J({ view: m.view, photo: m.photo, box: m.box }));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(a) under the web chat a kept share\'s words come back once beside words a native composer handed over, whether the key took them in (kt_coach_handover follows the box: two launches after a share over a hand-over) or not (the key holds the handed-over words alone, as a page that ended before it followed the box leaves it) (none, tabsWeb)', async () => {
  const HW = HANDED + '\n' + WORDS;
  for (const shell of ['none', 'tabsWeb']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      // a hand-over the page took, written here: the harness writes its seed again at every load
      await ev(app, (h) => localStorage.setItem('kt_coach_handover', h), HANDED);
      const s = await share(app, PHOTO, WORDS);
      const k = await ev(app, async () => { render(); await __w(20); return localStorage.getItem('kt_coach_handover'); });
      assert(s.box === HW && k === HW, shell + ': the handed-over words, then the share\'s, in the box and the key: ' + J({ box: s.box, key: k }));
      for (let n = 1; n <= 2; n++) {
        await relaunch(app);
        await app.page.waitForFunction((n) => __log().filter((l) => l === 'photo: back from 0 min, chat opened').length >= n, n, { timeout: 15000 });
        await settle(app, 150);
        const m = await look(app);
        const key = await ev(app, async () => { render(); await __w(20); return localStorage.getItem('kt_coach_handover'); });
        assert(m.view === 'chat' && m.photo && m.box === HW && key === HW,
          shell + ', launch ' + n + ': the photo, and the share\'s words once beside the handed-over ones: ' + J({ view: m.view, photo: m.photo, box: m.box, key }));
      }
      clean(await lines(app));
      noErrors(app);
    } finally { await app.close(); }
  }
  // The key holding the handed-over words alone (the seed's, written again at every load: a page that ended before the
  // key followed the box leaves it so): the share's words come back once, after the handed-over ones.
  for (const shell of ['none', 'tabsWeb']) {
    const app = await pageBoot(shell, { seed: { kt_coach_handover: HANDED } });
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS);
      assert(s.box === HW, shell + ', a key without the share\'s words: both in the box after the share: ' + J({ box: s.box }));
      await relaunch(app);
      await waitLine(app, 'l === "photo: back from 0 min, chat opened"', 'chat opened');
      await settle(app, 150);
      const m = await look(app);
      assert(m.view === 'chat' && m.photo && m.box === HW,
        shell + ', a key without the share\'s words: the photo, and the share\'s words once after the handed-over ones: ' + J({ view: m.view, photo: m.photo, box: m.box }));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (b) sent, (c) removed ─────────────────────────────────────────────────────────────────────────────────────────
serial('(b) sending the photo deletes its record and its marker says gone (the web Send under none, coach.send usePending under tabs): the API got it, and the next launch has no photo', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS);
      assert(s.kept && s.kept.data === PHOTO && s.mark && s.mark.at === s.kept.at, shell + ': kept before the send');
      const r = await ev(app, async (x) => {
        let a = null;
        if (x.shell === 'none') document.getElementById('coach-send').click();
        else a = await __fpShell.call('coach.send', { text: 'Form check please', usePending: true, nonce: 'n-132-send' });
        for (let i = 0; i < 150 && coachLoading; i++) await __w(20);
        await __w(80);
        return { a, pending: !!pendingImage, api: __turns.some((t) => t.indexOf(x.photo) >= 0), kept: await __idb('get'), mark: __mark(), log: __log() };
      }, { shell, photo: PHOTO });
      assert((shell === 'none' || (r.a && r.a.ok)) && !r.pending && r.api && r.kept === null && gone(r.mark) && r.mark.at === s.kept.at && r.log.indexOf('photo: sent') >= 0,
        shell + ': sent with the photo, the record gone and the marker saying so, "photo: sent": ' + J(Object.assign({}, r, { log: r.log.slice(0, 5) })));
      await relaunch(app);
      await ready(app, shell !== 'none');
      const m = await look(app);
      assert(m.img === null && m.kept === null && gone(m.mark) && !m.log.some((l) => /^photo: back from/.test(l)), shell + ': the next launch has no photo: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(c) removing the photo deletes its record and its marker says gone (the web composer\'s remove button under none, coach.clearImage under tabs), and the next launch has none', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await share(app, PHOTO, WORDS);
      if (shell === 'none') await ev(app, () => document.querySelector('#screen .coach-img-x').click());   // the button's own handler
      else {
        const a = await ev(app, () => __fpShell.call('coach.clearImage', {}));
        assert(a.ok === true, 'tabs: coach.clearImage answered: ' + J(a));
      }
      await waitLine(app, 'l === "photo: removed"', 'photo: removed');
      const r = await ev(app, async () => { await __w(80); return { pending: !!pendingImage, preview: !!document.querySelector('#screen img[alt="Photo to send"]'), kept: await __idb('get'), mark: __mark() }; });
      assert(!r.pending && !r.preview && r.kept === null && gone(r.mark), shell + ': the photo and its record gone, the marker saying so: ' + J(r));
      if (shell === 'tabs') {
        await settle(app, 60);
        const c = (await look(app)).comp;
        assert(c && c.image === null, 'tabs: the next model shows no photo: ' + J(c));
      }
      await relaunch(app);
      await ready(app, shell !== 'none');
      const m = await look(app);
      assert(m.img === null && m.kept === null && m.tab === 'log' && !m.log.some((l) => /^photo: back from/.test(l)), shell + ': the next launch has none: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(c) a photo sent or removed whose kept copy IndexedDB could not delete (the transaction aborted, the connection lost) never comes back: the marker says gone, so the next launch drops the record (none, tabs)', async () => {
  for (const [shell, what, how] of [['none', 'remove', 'abortDelete'], ['tabs', 'clearImage', 'abortDelete'], ['tabs', 'send', 'abortDelete'], ['tabs', 'clearImage', 'lost'], ['none', 'send', 'lost']]) {
    const tag = shell + ', ' + what + ', ' + how + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await share(app, PHOTO, WORDS);
      await ev(app, '(' + FAIL[how].toString() + ')()');
      const r = await ev(app, async (what) => {
        if (what === 'remove') document.querySelector('#screen .coach-img-x').click();
        else if (what === 'clearImage') await __fpShell.call('coach.clearImage', {});
        else if (window.__fpShell) await __fpShell.call('coach.send', { text: 'Form check please', usePending: true, nonce: 'n-132-fail' });
        else document.getElementById('coach-send').click();
        for (let i = 0; i < 150 && coachLoading; i++) await __w(20);
        for (let i = 0; i < 100 && !__log().some((l) => l.indexOf('photo: kept copy not deleted') === 0); i++) await __w(20);
        return { pending: !!pendingImage, kept: await __idb('get'), mark: __mark(), log: __log().slice(0, 4) };
      }, what);
      assert(!r.pending && r.kept && r.kept.data === PHOTO && gone(r.mark) && r.mark.n === r.kept.n && r.log.some((l) => /^photo: kept copy not deleted \((aborted|InvalidStateError)\)$/.test(l)),
        tag + 'the photo gone, its marker saying so, the record still there: ' + J(Object.assign({}, r, { kept: !!r.kept })));
      await relaunch(app);
      await waitLine(app, 'l === "photo: kept copy dropped (sent or removed)"', 'sent or removed');
      await ready(app, shell !== 'none');
      await settle(app, 200);
      const m = await look(app);
      assert(m.img === null && m.kept === null && gone(m.mark) && shut(m) && !m.log.some((l) => /^photo: back from/.test(l)),
        tag + 'the next launch drops it: nothing back, no chat: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (d) old, unreadable, replaced, sent or removed, dated ahead ───────────────────────────────────────────────────
serial('(d) a record older than 24 h, one the page cannot read, one a newer photo replaced (numbered below the marker), one sent or removed (the marker\'s own, marked gone), or one dated ahead of the clock is deleted at boot, says why, and never comes back (tabs, none)', async () => {
  const now = Date.now();
  for (const [shell, rec, line, o] of [
    ['tabs', { data: PHOTO, mediaType: 'image/jpeg', at: now - 25 * HOUR, src: 'share' }, 'photo: kept copy dropped (25 h old)'],
    ['none', { data: PHOTO, mediaType: 'image/jpeg', at: now - 24 * HOUR - MIN, src: 'pick' }, 'photo: kept copy dropped (24 h old)'],
    ['none', { data: 'not base64!', mediaType: 'image/jpeg', at: now, src: 'share' }, 'photo: kept copy dropped (unreadable)'],
    ['none', { data: PHOTO, mediaType: 'text/html', at: now, src: 'share' }, 'photo: kept copy dropped (unreadable)'],
    ['none', { data: PHOTO, mediaType: 'image/jpeg', at: now - 2 * MIN, src: 'share' }, 'photo: kept copy dropped (unreadable)', { n: 'one' }],
    ['tabs', { data: PHOTO, mediaType: 'image/jpeg', at: now - 2 * MIN, src: 'share', n: 3 }, 'photo: kept copy dropped (replaced)', { markN: 4 }],
    ['none', { data: PHOTO, mediaType: 'image/jpeg', at: now - 2 * MIN, src: 'share', n: 3 }, 'photo: kept copy dropped (sent or removed)', { gone: true }],
    ['tabs', { data: PHOTO, mediaType: 'image/jpeg', at: now + 2 * HOUR, src: 'share' }, 'photo: kept copy dropped (dated ahead of the clock)'],
  ]) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await ev(app, (a) => __plant(a.o.n !== undefined ? Object.assign({}, a.rec, { n: a.o.n }) : a.rec, a.o), { rec, o: o || {} });
      await relaunch(app);
      await waitLine(app, 'l === ' + J(line), line);
      await ready(app, shell !== 'none');
      const m = await look(app);
      assert(m.img === null && m.kept === null && m.tab === 'log' && m.chats === 0 && !m.ops.some((o) => o === 'present coach') && !m.log.some((l) => /^photo: back from/.test(l)),
        shell + ', ' + line + ': deleted at boot, nothing back, no chat: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (e) no IndexedDB ──────────────────────────────────────────────────────────────────────────────────────────────
serial('(e) IndexedDB missing, its open throwing or never answering, its write refused for the quota, or the marker refused: the share lands at once as it always did (the photo, the chat, the words), the boot is untouched, nothing throws, and nothing comes back after a relaunch', async () => {
  for (const [shell, how, line] of [
    ['none', 'missing', 'photo: not kept (no IndexedDB)'], ['none', 'throws', 'photo: not kept (SecurityError)'], ['none', 'silent', 'photo: not kept (open timed out)'],
    ['none', 'quota', 'photo: not kept (quota)'], ['tabs', 'missing', 'photo: not kept (no IndexedDB)'], ['tabs', 'silent', 'photo: not kept (open timed out)'],
    ['none', 'marker', 'photo: not kept (quota)'],
  ]) {
    const tag = shell + ', ' + how + ': ';
    const app = await pageBoot(shell, { init: NO_IDB[how] });
    try {
      const b = await ev(app, () => ({ kids: document.getElementById('screen').children.length, tab: currentTab }));
      assert(b.kids > 0, tag + 'the first paint is there: ' + J(b));
      await ready(app, shell !== 'none');
      const i = await ev(app, () => (window.__fpShell ? __fpShell.calls.length : 0));
      // the share at once: nothing in it waits on IndexedDB
      const s = await ev(app, async (a) => {
        window.__held = { imageBase64: a.photo, comment: a.words };
        await checkPendingShare();
        const box = document.getElementById('coach-input');
        return { img: pendingImage ? pendingImage.data : null, tab: currentTab, view: coachView, box: box ? box.value : null,
          photo: !!document.querySelector('#screen img[alt="Photo to send"]') };
      }, { photo: PHOTO, words: WORDS });
      assert(s.img === PHOTO && s.tab === 'coach' && s.view === 'chat', tag + 'the photo pending and the chat open at once: ' + J(s));
      if (shell === 'none') assert(s.photo && s.box === WORDS, tag + 'the web chat with the photo and the words: ' + J(s));
      else {
        await settle(app, 100);
        const c = await ev(app, (i) => __fpShell.calls.slice(i).filter((c) => c[0] === 'present' || (c[0] === 'model' && c[1].screen === 'coach'))
          .map((c) => (c[0] === 'model' ? JSON.parse(c[1].json).composer : c[1].screen)), i);
        assert(c.indexOf('coach') >= 0 && c.some((x) => x && x.image && x.draft && x.draft.text === WORDS), tag + 'the native chat with the photo and the words: ' + J(c));
      }
      await waitLine(app, 'l === ' + J(line), line);
      const k = await ev(app, async () => ({ mark: __mark(), kept: window.indexedDB ? await __idb('get') : 'none' }));
      assert(how === 'marker' ? k.mark === null && k.kept === null : gone(k.mark), tag + 'the marker says the photo was not kept (with the marker refused: none, and nothing put): ' + J(k));
      await relaunch(app);
      await ready(app, shell !== 'none');
      await settle(app, how === 'silent' ? 4300 : 200);   // a silent open's 4 s run out at boot too
      const m = await look(app);
      assert(m.img === null && m.tab === 'log' && m.chats === 0 && !m.log.some((l) => /^photo: back from/.test(l)), tag + 'nothing comes back: ' + J(Object.assign({}, m, { log: m.log.slice(0, 6), kept: !!m.kept })));
      if (how === 'missing' || how === 'quota' || how === 'marker') assert(!m.log.some((l) => /^photo: kept copy/.test(l)), tag + 'no line at boot (no IndexedDB, or nothing kept): ' + J(m.log.slice(0, 6)));
      else assert(m.log.some((l) => /^photo: kept copy not read \((SecurityError|open timed out)\)$/.test(l)), tag + 'the boot\'s read says why it read nothing: ' + J(m.log.slice(0, 6)));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(e) a newer photo IndexedDB could not keep (its put refused for the quota, its transaction aborted, the connection lost) never brings back the photo it replaced: the marker took the newer one\'s number and says gone, so the next launch drops the older record (replaced) (none, tabs); with its marker refused, nothing is put and the older record is deleted at once (none)', async () => {
  for (const [shell, how, why] of [['none', 'quota', 'quota'], ['tabs', 'quota', 'quota'], ['tabs', 'abortPut', 'aborted'], ['tabs', 'lost', 'InvalidStateError'], ['none', 'marker', 'quota']]) {
    const tag = shell + ', ' + how + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const a = await share(app, PHOTO, WORDS);
      assert(a.kept && a.kept.data === PHOTO && names(a.mark, a.kept), tag + 'the first share kept');
      await ev(app, '(' + FAIL[how].toString() + ')()');
      const b = await share(app, PHOTO2, '');
      const bl = await lines(app);
      if (how === 'marker') {
        assert(b.img === PHOTO2 && b.kept === null && names(b.mark, a.kept) && bl.indexOf('photo: not kept (quota)') >= 0,
          tag + 'the second share pending, its marker refused: nothing put, the first record deleted, the marker still the first\'s: ' + J(Object.assign({}, b, { kept: b.kept && b.kept.data === PHOTO ? 'first' : b.kept, log: bl.slice(0, 3) })));
        await relaunch(app);
        await ready(app, shell !== 'none');
        await settle(app, 200);
        const m = await look(app);
        assert(m.img === null && m.kept === null && shut(m) && !m.log.some((l) => /^photo: (back from|kept copy)/.test(l)),
          tag + 'the replaced photo never comes back: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
        clean(m.log);
        noErrors(app);
        continue;
      }
      assert(b.img === PHOTO2 && b.kept && b.kept.data === PHOTO && gone(b.mark) && b.mark.n === a.kept.n + 1 && bl.indexOf('photo: not kept (' + why + ')') >= 0,
        tag + 'the second share pending, its keep failed, the marker its number marked gone, the record still the first: ' + J(Object.assign({}, b, { kept: b.kept && b.kept.data === PHOTO ? 'first' : b.kept, log: bl.slice(0, 3) })));
      await relaunch(app);
      await waitLine(app, 'l === "photo: kept copy dropped (replaced)"', 'replaced');
      await ready(app, shell !== 'none');
      await settle(app, 200);
      const m = await look(app);
      assert(m.img === null && m.kept === null && gone(m.mark) && shut(m) && !m.log.some((l) => /^photo: back from/.test(l)),
        tag + 'the replaced photo never comes back: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (f) the words before the first paint ──────────────────────────────────────────────────────────────────────────
serial('(f) the words are in the first chat model pushed (coach61, tabs) and in the web composer (none) with the page\'s clock paused: no timer runs between the read and the words', async () => {
  for (const shell of ['none', 'coach61', 'tabs']) {
    const app = await pageBoot(shell, { clock: { time: Date.now() } });
    try {
      await ready(app, shell !== 'none');
      await pause(app);
      const i = await ev(app, () => (window.__fpShell ? __fpShell.calls.length : 0));
      const o = await ev(app, async (a) => {
        window.__held = { imageBase64: a.photo, comment: a.words };
        await checkPendingShare();
        const box = document.getElementById('coach-input');
        return { box: box ? box.value : null, img: !!pendingImage, view: coachView, tab: currentTab };
      }, { photo: PHOTO, words: WORDS });
      assert(o.img && o.view === 'chat' && o.tab === 'coach', shell + ': the photo and the chat: ' + J(o));
      if (shell === 'none') assert(o.box === WORDS, 'none: the words in the web composer with no timer run: ' + J(o));
      else {
        const m = await ev(app, (i) => {
          const c = __fpShell.calls.slice(i);
          const first = c.find((x) => x[0] === 'model' && x[1].screen === 'coach');
          return { first: first ? JSON.parse(first[1].json).composer : null, present: c.findIndex((x) => x[0] === 'present' && x[1].screen === 'coach'),
            at: c.findIndex((x) => x[0] === 'model' && x[1].screen === 'coach') };
        }, i);
        assert(m.first && m.first.draft && m.first.draft.text === WORDS && m.first.image && m.first.image.key && m.at >= 0 && m.present > m.at,
          shell + ': the chat\'s first model (the one it is presented on) has the words and the photo: ' + J(m));
      }
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(f) the share\'s words are a page draft written before the chat is drawn: beside words a native composer handed over (kt_coach_handover) the web composer shows those first, then the share\'s (none); the native chat opens on the share\'s words with the photo, the handed-over words waiting in the key for their own offer at the next paint, then taken (tabs, coach61): nothing of either is lost', async () => {
  let app = await pageBoot('none', { seed: { kt_coach_handover: HANDED } });
  try {
    await ready(app, false);
    const s = await share(app, PHOTO, WORDS);
    const k = await ev(app, async () => { render(); await __w(20); return { box: document.getElementById('coach-input').value, key: localStorage.getItem('kt_coach_handover') }; });
    const HW = HANDED + '\n' + WORDS;
    assert(s.box === HW && k.box === HW && k.key === HW && s.img === PHOTO, 'none: the handed-over words, then the share\'s, in the box and the key: ' + J({ s: s.box, k }));
    noErrors(app);
  } finally { await app.close(); }
  for (const shell of ['tabs', 'coach61']) {
    app = await pageBoot(shell, { seed: { kt_coach_handover: HANDED } });
    try {
      await ready(app, true);
      const i = await ev(app, () => __fpShell.calls.length);
      await share(app, PHOTO, WORDS);
      const r = await ev(app, async (i) => {
        const drafts = () => __fpShell.calls.slice(i).filter((c) => c[0] === 'model' && c[1].screen === 'coach').map((c) => JSON.parse(c[1].json).composer);
        const out = { first: drafts()[0], key1: localStorage.getItem('kt_coach_handover') };
        out.took1 = await __fpShell.call('coach.draftTaken', { nonce: out.first.draft.nonce });
        render(); await __w(60);
        const d = drafts().filter((c) => c.draft).pop();
        out.next = d && d.draft;
        out.took2 = d ? await __fpShell.call('coach.draftTaken', { nonce: d.draft.nonce }) : null;
        out.key2 = localStorage.getItem('kt_coach_handover');
        return out;
      }, i);
      assert(r.first && r.first.draft && r.first.draft.text === WORDS && r.first.image && r.key1 === HANDED && r.took1 && r.took1.ok,
        shell + ': the chat opens on the share\'s words and the photo, the handed-over words in the key: ' + J(r));
      assert(r.next && r.next.text === HANDED && r.took2 && r.took2.ok && r.key2 === null, shell + ': the handed-over words at their own next offer, then taken: ' + J(r));
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (g) a new share wins ──────────────────────────────────────────────────────────────────────────────────────────
serial('(g) a new share replaces the kept photo: two shares, then a relaunch, bring back the second (tabs)', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app, true);
    await share(app, PHOTO, WORDS);
    const s = await share(app, PHOTO2, '');
    assert(s.img === PHOTO2 && s.kept && s.kept.data === PHOTO2 && s.mark && s.mark.at === s.kept.at, 'the second share is the record and the marker\'s: ' + J({ img: s.img, kept: s.kept && s.kept.data, mark: s.mark }));
    await relaunch(app);
    await waitLine(app, '/^photo: back from/.test(l)', 'photo: back from');
    await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
    const m = await look(app);
    assert(m.img === PHOTO2 && m.view === 'chat' && m.chats === 1, 'the second photo back: ' + J(Object.assign({}, m, { kept: !!m.kept })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

serial('(g) a share waiting in the App Group when a kept share comes back at boot wins (the parked link\'s, a cold share), whichever comes first: its photo, one chat opened, the kept one never shown over it (tabs, none; tabs with the kept one\'s read held until the share is in)', async () => {
  for (const [shell, gate] of [['tabs', false], ['none', false], ['tabs', true]]) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
      await relaunch(app, { held: { imageBase64: PHOTO2, comment: WORDS }, parked: 'trovo://share', gate });
      await waitLine(app, '/^share: read/.test(l)', 'share: read');
      if (gate) {
        const held = await ev(app, () => ({ img: pendingImage && pendingImage.data, log: __log().filter((l) => /^photo: /.test(l)) }));
        assert(held.img === PHOTO2 && held.log.length === 0, 'gate: the share in before the kept one was read: ' + J(held));
        await ev(app, () => __idbRelease());
        await waitLine(app, 'l === "photo: kept copy not put back (a newer photo)"', 'photo: kept copy not put back (a newer photo)');
      }
      await ready(app, shell !== 'none');   // the boot's +2.5 s check has read too
      await app.page.waitForFunction(() => __log().some((l) => l === 'photo: kept'), null, { timeout: 15000 });
      const m = await look(app);
      const fresh = m.log.indexOf('share: read') >= 0;
      assert(m.img === PHOTO2 && m.tab === 'coach' && m.view === 'chat' && m.kept && m.kept.data === PHOTO2 && m.mark && m.mark.at === m.kept.at && m.reads.filter((r) => r).length === 1,
        shell + ': the new share\'s photo, and its record and marker: ' + J(Object.assign({}, m, { kept: m.kept && m.kept.data, fresh })));
      assert(!m.log.some((l) => /^photo: back from \d+ min, chat opened$/.test(l)) && m.log.some((l) => (!gate && l === 'photo: back from 2 min, chat not opened (a new share)') || l === 'photo: kept copy not put back (a newer photo)'),
        shell + ': the kept share stood down: ' + J(m.log.slice(0, 8)));
      if (shell === 'tabs') {
        assert(m.chats === 1 && J(m.ops) === J(['present coachHome', 'present coach']) && m.comp && m.comp.image && m.comp.image.key === m.key && m.comp.draft && m.comp.draft.text === WORDS,
          'tabs: one chat opened, on the new photo and its words: ' + J({ chats: m.chats, ops: m.ops, comp: m.comp }));
        const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), m.key);
        assert(img.ok && img.data === PHOTO2, 'tabs: the native composer fetches the new photo');
      } else assert(m.photo && m.box === WORDS, 'none: the web chat with the new photo and its words: ' + J({ photo: m.photo, box: m.box }));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (h) breadcrumbs ───────────────────────────────────────────────────────────────────────────────────────────────
serial('(h) the breadcrumbs say sizes and states only: the read (KB, the words\' length, the page hidden), an empty read once for a run of them, kept, back, left, removed, sent; never the words or the photo', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await ev(app, () => { window.__vis = 'hidden'; });
    await share(app, BIG, WORDS);
    await ev(app, async () => { window.__vis = 'visible'; await checkPendingShare(); await checkPendingShare(); await __w(50); });
    const a = await lines(app);
    assert(a[0] === 'share: nothing waiting' && a[1] === 'photo: kept' && a[2] === 'share: read 952 KB, words ' + WORDS.length + ' chars, page hidden',
      'the read, kept, then one line for two empty reads: ' + J(a.slice(0, 4)));
    await ev(app, async () => { switchTab('log'); await __w(40); });
    await waitLine(app, 'l === "photo: chat left"', 'photo: chat left');
    await ev(app, () => clearPendingImage());
    await waitLine(app, 'l === "photo: removed"', 'photo: removed');
    await share(app, PHOTO, '');
    await ev(app, async () => { document.getElementById('coach-send').click(); for (let i = 0; i < 150 && coachLoading; i++) await __w(20); await __w(80); });
    const b = await lines(app);
    assert(b[0] === 'photo: sent' && b.indexOf('share: read 0 KB, words 0 chars, page visible') >= 0 && b.indexOf('photo: removed') >= 0 && b.indexOf('photo: chat left') >= 0,
      'left, removed, the second read with no words, sent: ' + J(b.slice(0, 7)));
    clean(b);
    noErrors(app);
  } finally { await app.close(); }
});

serial('(h) a step that repeats is one line for its run, whatever the watch bridge logs between: an empty read at three launches (none, tabs), the owner leaving the kept photo\'s chat five times, and again at two launches that bring it back (none: one line for the leaves, each later launch only its back line), a boot that cannot read IndexedDB at three launches, its empty reads between (none)', async () => {
  for (const [shell, init] of [['none', ''], ['tabs', ''], ['none', NO_IDB.throws]]) {
    const tag = shell + (init ? ', IndexedDB throws' : '') + ': ';
    const app = await pageBoot(shell, { init });
    try {
      await ready(app, shell !== 'none');
      for (let k = 0; k < 2; k++) { await relaunch(app); await ready(app, shell !== 'none'); }
      const l = await lines(app);
      const count = (x) => l.filter((y) => y === x).length;
      assert(count('share: nothing waiting') === 1 && l.some((y) => !/^(share|photo): /.test(y)), tag + 'one empty read line for three launches, the watch bridge\'s lines between: ' + J(l.slice(0, 12)));
      if (init) assert(count('photo: kept copy not read (SecurityError)') === 1, tag + 'one line for three boots that could not read: ' + J(l.slice(0, 12)));
      if (shell === 'none' && !init) {
        await share(app, PHOTO, WORDS);
        await ev(app, async () => { for (let k = 0; k < 5; k++) { switchTab('log'); await __w(30); switchTab('coach'); coachView = 'chat'; render(); await __w(30); } switchTab('log'); await __w(40); });
        const n = await lines(app);
        assert(n.filter((y) => y === 'photo: chat left').length === 1, tag + 'one line for five leaves: ' + J(n.slice(0, 6)));
        // two launches bring it back (its chat left earlier); the owner looks at it and leaves again each time
        const per = [];
        for (let k = 0; k < 2; k++) {
          const before = (await lines(app)).length;
          await relaunch(app);
          await app.page.waitForFunction((k) => __log().filter((l) => l === 'photo: back from 0 min, chat not opened (left earlier)').length > k, k, { timeout: 15000 });
          await ready(app, false);
          await ev(app, async () => { switchTab('coach'); coachView = 'chat'; render(); await __w(30); switchTab('log'); await __w(40); });
          const all = await lines(app);
          per.push(all.slice(0, all.length - before).filter((y) => /^(share|photo): /.test(y)));
        }
        const end = await lines(app);
        assert(end.filter((y) => y === 'photo: chat left').length === 1 && J(per[1]) === J(['photo: back from 0 min, chat not opened (left earlier)']),
          tag + 'a photo\'s first leave is its one line, and a later launch adds only its back line: ' + J({ per, end: end.slice(0, 10) }));
      }
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (i) the marker lost on its way to the disk ────────────────────────────────────────────────────────────────────
serial('(i) a kept photo whose marker never reached the disk (localStorage commits in batches, IndexedDB at once: the page ended between them) comes back at the next launch with its chat and its marker written again: a share with nothing kept before it (tabs, none), one that replaced a kept photo, one sent or one whose chat was left (none: the record the newer one, the marker still the older one\'s)', async () => {
  for (const [shell, over] of [['tabs', false], ['none', false], ['none', 'kept'], ['none', 'sent'], ['none', 'left']]) {
    const tag = shell + (over ? ', over a ' + over + ' photo' : '') + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      if (over) await share(app, PHOTO2, '');
      if (over === 'sent') await ev(app, async () => { document.getElementById('coach-send').click(); for (let i = 0; i < 150 && coachLoading; i++) await __w(20); await __w(80); });
      if (over === 'left') await ev(app, async () => { switchTab('log'); await __w(60); });
      if (over === 'sent' || over === 'left') { const o = await ev(app, () => __mark()); assert(o && (over === 'sent' ? o.gone === 1 : o.left === 1), tag + 'the older photo\'s marker says so: ' + J(o)); }
      const before = await ev(app, () => localStorage.getItem('kt_photo_kept'));
      const s = await share(app, PHOTO, WORDS);
      assert(s.kept && s.kept.data === PHOTO && s.mark && s.mark.at === s.kept.at, tag + 'the share kept, its marker: ' + J(s.mark));
      // the batch the marker was in never reached the disk: the marker as it stood before the share, the record kept
      await ev(app, (v) => { if (v === null) localStorage.removeItem('kt_photo_kept'); else localStorage.setItem('kt_photo_kept', v); }, before);
      await relaunch(app);
      await waitLine(app, 'l === "photo: back from 0 min (its marker was not saved), chat opened"', 'its marker was not saved');
      if (shell === 'tabs') await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
      await settle(app, 150);
      const m = await look(app);
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.kept && m.kept.data === PHOTO && names(m.mark, s.kept) && (shell === 'none' ? m.photo && m.box === WORDS : m.comp && m.comp.image),
        tag + 'the photo back with its chat, the marker written again: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5), kept: !!m.kept })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(i) a newer share kept before a boot could read a record whose marker never reached the disk takes that record\'s number under its own stamp (a cold share read while the boot\'s read waits on IndexedDB): the app ending before the share\'s put leaves the older record, which the launch after drops as the photo the share replaced (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    const a = await share(app, PHOTO, WORDS);
    assert(a.kept && a.kept.data === PHOTO && names(a.mark, a.kept), 'the first share kept: ' + J(a.mark));
    // its marker never reached the disk; the next launch reads a cold share while its IndexedDB opens are held
    await ev(app, () => localStorage.removeItem('kt_photo_kept'));
    await relaunch(app, { held: { imageBase64: PHOTO2, comment: '' }, parked: 'trovo://share', gate: true });
    await app.page.waitForFunction(() => __reads.some((r) => r) && !_shareBusy, null, { timeout: 15000 });
    const b = await ev(app, () => ({ img: pendingImage ? pendingImage.data : null, mark: __mark() }));
    assert(b.img === PHOTO2 && b.mark && b.mark.n === a.kept.n && b.mark.at !== a.kept.at, 'the share took the record\'s number under its own stamp: ' + J({ b, a: a.mark }));
    // the app ends while the share's put waits on the held open: the older record stays, under the share's marker
    await relaunch(app);
    await waitLine(app, 'l === "photo: kept copy dropped (replaced)"', 'replaced');
    await ready(app, false);
    await settle(app, 200);
    const m = await look(app);
    assert(m.img === null && m.kept === null && shut(m) && !m.log.some((l) => /^photo: back from/.test(l)),
      'the photo the share replaced never comes back: ' + J(Object.assign({}, m, { log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

// ── (j) a read that fails reads again ───────────────────────────────────────────────────────────────────────────
const ABORTED = 'l === "photo: kept copy not read (aborted)"';
const chatUp = (app, shell) => shell === 'none' ? Promise.resolve()
  : app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
// The wait before a later read: 0.3 s, held to 0.25-1 s so a load-slowed run passes and a read at once, or one a second
// or more late (the 1.5 s this replaced), does not.
const WAITED = (ms) => ms >= 250 && ms <= 1000;
serial('(j) a boot whose read of the kept copy aborts (as WebKit aborts a transaction when it suspends, with no error) reads again 0.3 s later while the page shows: the second read brings the photo back and opens its chat, and no third read comes (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS);
      assert(s.kept && s.kept.data === PHOTO, shell + ': the share kept: ' + J(!!s.kept));
      await relaunch(app, { abortReads: 1 });
      await waitLine(app, ABORTED, 'the aborted read');
      const first = await ev(app, () => ({ img: !!pendingImage, gets: __photoGets, aborted: __abortedReads }));
      assert(!first.img && first.gets === 1 && first.aborted === 1, shell + ': the boot read aborted and the photo is not back yet: ' + J(first));
      await waitLine(app, 'l.indexOf("photo: back from 0 min (read 2)") === 0', 'the second read');
      await chatUp(app, shell);
      await settle(app, 1200);   // a third read would come 0.3 s after the second
      const m = await look(app);
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.log.indexOf('photo: back from 0 min (read 2), chat opened') >= 0,
        shell + ': the second read brought the photo back and opened its chat: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      const g = await ev(app, () => ({ gets: __photoGets, aborted: __abortedReads, at: __photoGetAt }));
      assert(g.gets === 2 && g.aborted === 1, shell + ': two reads and no third: ' + J(g));
      assert(WAITED(g.at[1] - g.at[0]), shell + ': the second read came about 0.3 s after the first: ' + Math.round(g.at[1] - g.at[0]) + ' ms');
      assert(m.kept && m.kept.data === PHOTO && names(m.mark, s.kept), shell + ': the record and its marker stay until the photo is sent or removed: ' + J(m.mark));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});
serial('(j) at a boot nobody sees (a background launch) whose read aborts, nothing reads again until the page shows: 0.3 s after it shows the second read brings the photo back and opens its chat (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await share(app, PHOTO, WORDS);
      await relaunch(app, { hidden: true, abortReads: 1 });
      await waitLine(app, ABORTED, 'the aborted read');
      await settle(app, 1500);   // longer than a visible page waits for its second read
      const h = await ev(app, () => ({ img: !!pendingImage, gets: __photoGets, log: __log().filter((l) => /^photo: back from/.test(l)) }));
      assert(!h.img && h.gets === 1 && h.log.length === 0, shell + ': hidden, no second read: ' + J(h));
      await show(app);
      await waitLine(app, 'l.indexOf("photo: back from 0 min (read 2)") === 0', 'the second read after the page showed');
      await chatUp(app, shell);
      await settle(app, 150);
      const m = await look(app);
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.log.indexOf('photo: back from 0 min (read 2), chat opened') >= 0,
        shell + ': shown, the second read brought the photo back and opened its chat: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      const t = await ev(app, () => ({ at: __photoGetAt, shown: __shownAt }));
      assert(t.at.length === 2 && WAITED(t.at[1] - t.shown), shell + ': the second read came about 0.3 s after the page showed: ' + Math.round(t.at[1] - t.shown) + ' ms');
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});
serial('(j) at a boot nobody sees whose reads abort twice, the third read (the last) brings the photo back after the page shows; the page shown and hidden again reads nothing more, and one line says the reads failed (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await share(app, PHOTO, WORDS);
    await relaunch(app, { hidden: true, abortReads: 2 });
    await waitLine(app, ABORTED, 'the aborted read');
    await show(app);
    await waitLine(app, 'l.indexOf("photo: back from 0 min (read 3)") === 0', 'the third read');
    await settle(app, 150);
    const m = await look(app);
    assert(m.img === PHOTO && m.view === 'chat' && m.log.indexOf('photo: back from 0 min (read 3), chat opened') >= 0,
      'the third read brought the photo back and opened its chat: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    for (let k = 0; k < 3; k++) { await hide(app); await settle(app, 100); await show(app); await settle(app, 700); }
    const g = await ev(app, () => ({ gets: __photoGets, aborted: __abortedReads, fails: __log().filter((l) => l === 'photo: kept copy not read (aborted)').length }));
    assert(g.gets === 3 && g.aborted === 2 && g.fails === 1, 'three reads in all, none at the later shows, one failure line: ' + J(g));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) a read that failed another way (the connection lost: its transaction refused with InvalidStateError) reads again too: the second read, on a new connection, brings the photo back (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await share(app, PHOTO, WORDS);
    await relaunch(app, { loseOnce: true });
    await waitLine(app, 'l === "photo: kept copy not read (InvalidStateError)"', 'the lost connection');
    await waitLine(app, 'l.indexOf("photo: back from 0 min (read 2)") === 0', 'the second read');
    await settle(app, 150);
    const m = await look(app);
    assert(m.img === PHOTO && m.view === 'chat' && m.log.indexOf('photo: back from 0 min (read 2), chat opened') >= 0,
      'the second read brought the photo back: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) a newer photo that comes before the second read (a share read while the page was hidden) stays the pending one: the second read leaves it as it is, its record and marker the new photo\'s (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await share(app, PHOTO, WORDS);
    await relaunch(app, { hidden: true, abortReads: 1 });
    await waitLine(app, ABORTED, 'the aborted read');
    const s2 = await share(app, PHOTO2, '');
    assert(s2.img === PHOTO2 && s2.kept && s2.kept.data === PHOTO2, 'the newer share read and kept while hidden: ' + J({ img: !!s2.img, kept: !!s2.kept }));
    await show(app);
    await waitLine(app, 'l === "photo: kept copy not put back (a newer photo)"', 'the second read');
    await settle(app, 150);
    const m = await look(app);
    assert(m.img === PHOTO2 && m.back !== 1 && m.kept && m.kept.data === PHOTO2 && names(m.mark, s2.kept) && !m.log.some((l) => /^photo: back from/.test(l)),
      'the newer photo stays pending and not marked back, its record and marker kept: ' + J(Object.assign({}, m, { img: m.img === PHOTO2 ? 'PHOTO2' : !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) a touch on the page before the second read: the photo comes back with its chat shut, counted as left (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await share(app, PHOTO, WORDS);
      await relaunch(app, { hidden: true, abortReads: 1 });   // hidden: the touch comes before the read 0.3 s after the show
      await waitLine(app, ABORTED, 'the aborted read');
      await ev(app, () => document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await show(app);
      await waitLine(app, 'l.indexOf("photo: back from 0 min (read 2)") === 0', 'the second read');
      await settle(app, 300);
      const m = await look(app);
      assert(m.img === PHOTO && shut(m) && m.log.indexOf('photo: back from 0 min (read 2), chat not opened (asked elsewhere), counted as left') >= 0,
        shell + ': the photo back, the chat shut and counted as left: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});
serial('(j) a background launch whose read aborted, then the app opened and touched at once (the page shown, a touch inside the 0.3 s before the second read): the photo comes back with its chat shut, counted as left (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await share(app, PHOTO, WORDS);
      await relaunch(app, { hidden: true, abortReads: 1 });
      await waitLine(app, ABORTED, 'the aborted read');
      // the owner's order: the page shows, then a touch on it, in one task so no read can come between
      await ev(app, () => {
        window.__vis = 'visible'; window.__shownAt = performance.now(); document.dispatchEvent(new Event('visibilitychange'));
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      await waitLine(app, 'l.indexOf("photo: back from 0 min (read 2)") === 0', 'the second read');
      await settle(app, 300);
      const m = await look(app), g = await ev(app, () => ({ at: __photoGetAt, shown: window.__shownAt }));
      assert(m.img === PHOTO && shut(m) && m.log.indexOf('photo: back from 0 min (read 2), chat not opened (asked elsewhere), counted as left') >= 0,
        shell + ': the photo back, the chat shut and counted as left: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      assert(g.at.length === 2 && WAITED(g.at[1] - g.shown), shell + ': the second read came about 0.3 s after the show: ' + J(g));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});
serial('(j) a native chat taken over at a reload whose read is late (held, or aborted and read again): the owner\'s Back or Open Settings before the photo is back leaves the chat shut, counted as left, nothing presented again (tabs, coach61)', async () => {
  for (const [shell, late, how] of [['tabs', 'held', 'coach.back'], ['tabs', 'aborted', 'coach.back'], ['coach61', 'held', 'coach.back'], ['tabs', 'held', 'coach.openSettings'], ['coach61', 'aborted', 'coach.openSettings']]) {
    const tag = shell + ', ' + late + ', ' + how + ': ';
    const app = await pageBoot(shell);
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      await ev(app, (late) => sessionStorage.setItem('__next', JSON.stringify(late === 'held' ? { gate: true } : { gate: true, abortReads: 1 })), late);
      await app.reload();   // the same scene: the chat taken over, the read held back
      await app.page.waitForFunction(() => window._fp && _fp.hello && _fp.shown.coach, null, { timeout: 15000 });
      const back = await ev(app, (how) => __fpShell.call(how, {}), how);
      assert(back && back.ok === true, tag + 'the native chat answered: ' + J(back));
      await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app);
      const want = 'photo: back from 0 min' + (late === 'aborted' ? ' (read 2)' : '') + ', chat not opened (asked elsewhere), counted as left';
      const opens = await ev(app, () => __fpShell.calls.filter((c) => c[0] === 'present' && c[1].screen === 'coach').length);
      assert(m.img === PHOTO && m.log.indexOf(want) >= 0 && opens === 0 && m.mark && m.mark.left === 1 && (how !== 'coach.openSettings' || m.tab === 'settings'),
        tag + 'the photo back with the chat shut, counted as left, nothing presented (Open Settings: on Settings): ' + J(Object.assign({ opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});
serial('(j) when every read aborts the page reads three times and no more: the record and its marker stay, one line says so, and the next launch brings the photo back (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    const s = await share(app, PHOTO, WORDS);
    await relaunch(app, { abortReads: 3 });
    await app.page.waitForFunction(() => window.__abortedReads >= 3, null, { timeout: 15000 });
    await settle(app, 1500);   // a fourth read would have come 0.3 s after the third
    const m = await look(app);
    const g = await ev(app, () => ({ gets: __photoGets, aborted: __abortedReads }));
    assert(g.gets === 3 && g.aborted === 3 && !m.img, 'three reads, each aborted, none after them, no photo: ' + J(Object.assign({ img: !!m.img }, g)));
    assert(m.log.filter((l) => l === 'photo: kept copy not read (aborted)').length === 1, 'one line for the three reads: ' + J(m.log.slice(0, 6)));
    assert(m.kept && m.kept.data === PHOTO && names(m.mark, s.kept), 'the record and its marker stay: ' + J(m.mark));
    await relaunch(app, null);
    await waitLine(app, 'l === "photo: back from 0 min, chat opened"', 'the next launch');
    await settle(app, 150);
    const n = await look(app);
    assert(n.img === PHOTO && n.tab === 'coach' && n.view === 'chat', 'the next launch brought the photo back with its chat: ' + J(Object.assign({}, n, { img: !!n.img, kept: !!n.kept, log: n.log.slice(0, 6) })));
    clean(n.log);
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) a kept share whose chat the owner left, brought back by a later read: the photo back with its chat shut, its line naming the read (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await ev(app, (r) => __plant(r, { left: true }), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share', words: 'x' });
    await relaunch(app, { abortReads: 1 });
    await waitLine(app, ABORTED, 'the aborted read');
    await waitLine(app, 'l.indexOf("photo: back from 2 min (read 2)") === 0', 'the second read');
    await settle(app, 150);
    const m = await look(app);
    assert(m.img === PHOTO && shut(m) && m.log.indexOf('photo: back from 2 min (read 2), chat not opened (left earlier)') >= 0,
      'the photo back, the chat left shut, the line naming the read: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) a page hidden while it waits for the second read reads only once it shows again: 0.3 s after the show the second read brings the photo back (none)', async () => {
  const app = await pageBoot('none');
  try {
    await ready(app, false);
    await share(app, PHOTO, WORDS);
    await relaunch(app, { abortReads: 1, hideAfterAbort: 100 });   // hidden 0.1 s into the 0.3 s wait
    await waitLine(app, ABORTED, 'the aborted read');
    await settle(app, 1200);
    const h = await ev(app, () => ({ gets: __photoGets, vis: document.visibilityState, img: !!pendingImage }));
    assert(h.vis === 'hidden' && h.gets === 1 && !h.img, 'hidden during the wait: no read while hidden: ' + J(h));
    // shown and hidden again inside each 0.3 s wait after a show: the wait's end finds the page hidden, and reads nothing
    await ev(app, async () => { for (let k = 0; k < 2; k++) { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await __w(50); window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); await __w(50); } });
    await settle(app, 1200);
    const h2 = await ev(app, () => ({ gets: __photoGets, vis: document.visibilityState, img: !!pendingImage }));
    assert(h2.vis === 'hidden' && h2.gets === 1 && !h2.img, 'shown and hidden again inside the wait after each show: no read: ' + J(h2));
    await show(app);
    await waitLine(app, 'l.indexOf("photo: back from 0 min (read 2)") === 0', 'the second read after the show');
    await settle(app, 150);
    const m = await look(app);
    const t = await ev(app, () => ({ at: __photoGetAt, shown: __shownAt }));
    assert(m.img === PHOTO && m.view === 'chat' && t.at.length === 2 && WAITED(t.at[1] - t.shown),
      'shown again, the second read brought the photo back 0.3 s after the show: ' + J(Object.assign({ wait: Math.round(t.at[1] - t.shown) }, { img: !!m.img, view: m.view, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) the Coach hub\'s starter link (no key, no programme) before a late read: the owner on Log with the starter, the kept share\'s chat shut (tabs)', async () => {
  const app = await pageBoot('tabs', { init: "localStorage.removeItem('kt_apikey'); localStorage.removeItem('kt_routine');" });
  try {
    await ready(app, true);
    await share(app, PHOTO, WORDS);
    await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ gate: true })));
    await app.reload();   // the same scene, the Coach tab native, the read held
    await app.page.waitForFunction(() => window._fp && _fp.hello && _fp.shown.coachHome, null, { timeout: 15000 });
    const ans = await ev(app, () => __fpShell.call('coachHome.openStarter', {}));
    await settle(app, 100);
    const mid = await ev(app, () => ({ tab: currentTab, starter: !!document.getElementById('starterOverlay') }));
    assert(ans && ans.ok === true && mid.tab === 'log' && mid.starter, 'the starter opened on Log: ' + J({ ans, mid }));
    await ev(app, () => __idbRelease());
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await settle(app, 600);
    const m = await look(app);
    assert(m.img === PHOTO && m.tab === 'log' && m.chats === 0 && m.log.indexOf('photo: back from 0 min, chat not opened (asked elsewhere), counted as left') >= 0,
      'the owner went to Log for the starter: the kept share\'s chat stays shut, counted as left: ' + J({ tab: m.tab, chats: m.chats, log: m.log.slice(0, 6) }));
    noErrors(app);
  } finally { await app.close(); }
});
serial('(j) setup\'s Cancel answered yes before a late read: the kept share\'s chat stays shut, nothing presented again (tabs)', async () => {
  const app = await pageBoot('tabs', { init: "localStorage.removeItem('kt_routine'); localStorage.setItem('kt_intake','1');" });
  try {
    await ready(app, true);
    await share(app, PHOTO, WORDS);
    await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
    await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ gate: true })));
    await app.reload();   // the setup chat taken over, the read held
    await app.page.waitForFunction(() => window._fp && _fp.hello && _fp.shown.coach, null, { timeout: 15000 });
    const ans = await ev(app, () => __fpShell.call('coach.cancelIntake', {}));
    const id = await ev(app, () => { const c = __fpShell.calls.filter((x) => x[0] === 'confirm').pop(); return c ? c[1].id : null; });
    await ev(app, (id) => __fpShell.call('confirm', { id, yes: true }), id);
    await settle(app, 150);
    const mid = await ev(app, () => ({ intake: !!intakeMode, asked: _photoAsked }));
    assert(ans && ans.ok === true && !mid.intake && mid.asked > 0, 'setup cancelled, the leave counted: ' + J({ ans, mid }));
    await ev(app, () => __idbRelease());
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await settle(app, 600);
    const m = await look(app);
    const opens = await ev(app, () => __fpShell.calls.filter((c) => c[0] === 'present' && c[1].screen === 'coach').length);
    assert(m.img === PHOTO && opens === 0 && m.log.indexOf('photo: back from 0 min, chat not opened (asked elsewhere), counted as left') >= 0,
      'setup cancelled to the hub: the chat stays shut, nothing presented again: ' + J({ opens, log: m.log.slice(0, 6) }));
    noErrors(app);
  } finally { await app.close(); }
});

// ── (k) the owner's move the shell took while no document was linked ─────────────────────────────────────────────
// A WebContent restart (the same scene) or a cold launch before hello answered: the shell handles a Back or a bar tap on
// its own (PageLink ends the intent unsent), and the next document learns of it only from hello's answer. The mock's
// scene (__fpShellMock) is edited before the reload to stand for the move; a cold launch's tap is __fpShellPre, build
// 60's chat __fpShellUp and the pieces the policy turned off __fpShellOff, each handed to the next document through
// sessionStorage.
// __kFlag (sessionStorage, once): a source run on the next document's flag as the mock sets it ('flag.min = 9;': its
// hello is refused for its version; 'flag.tabs.bar = null;': the page's tabs test fails, so its hello leaves tabs out).
const K_INIT = "try{ ['Pre','Up','Off'].forEach(function(k){ var v=sessionStorage.getItem('__k'+k); if(v){ sessionStorage.removeItem('__k'+k); window['__fpShell'+k]=JSON.parse(v); } }); }catch(e){}"
  + "try{ var kf=sessionStorage.getItem('__kFlag'); if(kf){ sessionStorage.removeItem('__kFlag'); var kv; Object.defineProperty(window,'__FP_SHELL',{configurable:true,enumerable:true,get:function(){ return kv; },set:function(x){ kv=x; try{ (new Function('flag', kf))(kv); }catch(_){} }}); } }catch(e){}";
const K_ASKED = (min) => 'photo: back from ' + min + ' min, chat not opened (asked elsewhere), counted as left';
const kNext = (app, k, v) => ev(app, (a) => sessionStorage.setItem('__k' + a.k, JSON.stringify(a.v)), { k, v });
const kScene = (app, src) => ev(app, (src) => {
  const s = JSON.parse(sessionStorage.getItem('__fpShellMock'));
  (new Function('scene', src))(s);
  sessionStorage.setItem('__fpShellMock', JSON.stringify(s));
}, src);
const kAsked = (app) => ev(app, () => _photoAsked);
const kMark = (app) => ev(app, () => sessionStorage.getItem('fp_chat'));
const kOpens = (app) => ev(app, () => window.__fpShell.calls.filter((c) => c[0] === 'present' && c[1].screen === 'coach').length);

serial('(k) a Back the shell took while the WebContent restarted (the chat down, no document to tell): hello no longer names the chat up, and the kept share\'s chat stays shut, counted as left, nothing presented again; with the chat kept up (the take-over) nothing counts (tabs, coach61; the read at once and held)', async () => {
  for (const [shell, how, gate] of [['tabs', 'back', false], ['tabs', 'back', true], ['coach61', 'back', false], ['coach61', 'back', true], ['tabs', 'none', true], ['coach61', 'none', false]]) {
    const tag = shell + ', ' + how + (gate ? ', read held' : '') + ': ';
    const app = await pageBoot(shell, { init: K_INIT });
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      const before = await kMark(app), letter = shell === 'tabs' ? 't' : '1';
      assert(before === letter, tag + 'the chat up is kept in the scene (fp_chat: t on a tab root\'s stack, 1 as the overlay): ' + J(before));
      if (how === 'back') await kScene(app, 'scene.pushed = false;');
      if (gate) await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ gate: true })));
      await app.reload();   // the same scene: a WebContent restart
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const asked = await kAsked(app);
      if (gate) await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app), opens = await kOpens(app), after = await kMark(app);
      const say = J(Object.assign({ asked, opens, after }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) }));
      if (how === 'back') {
        assert(asked > 0 && m.img === PHOTO && shut(m) && opens === 0 && m.log.indexOf(K_ASKED(0)) >= 0 && m.mark && m.mark.left === 1
          && (shell !== 'tabs' || (m.tab === 'coach' && m.view === 'home')) && after === null,
          tag + 'counted at hello, the photo back with its chat shut (tabs: on the Coach tab\'s hub), counted as left, the scene\'s mark gone: ' + say);
      } else {
        assert(asked === 0 && m.img === PHOTO && m.ops.length === 0 && m.tab === 'coach' && m.view === 'chat' && after === letter
          && m.log.indexOf('photo: back from 0 min, chat already on screen') >= 0,
          tag + 'nothing counted: the chat taken over with the photo, already on screen, the mark kept: ' + say);
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) a chat the shell no longer offers after the restart (the policy turned it off meanwhile) is not the owner\'s Back: nothing counts, and the kept share\'s chat opens as the web chat (coach61, tabs)', async () => {
  for (const shell of ['coach61', 'tabs']) {
    const app = await pageBoot(shell, { init: K_INIT });
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      await kNext(app, 'Off', ['coach']);
      await app.reload();
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const asked = await kAsked(app), offered = await ev(app, () => _fp.hello.screens.indexOf('coach') >= 0);
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app), opens = await kOpens(app);
      assert(!offered && asked === 0 && opens === 0 && m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.photo
        && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
        shell + ': the chat not offered, nothing counted, the web chat open with the photo: ' + J(Object.assign({ offered, asked, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) a bar tap the shell took while the WebContent restarted: hello\'s newer selection moves the page to Log, and the kept share\'s chat stays shut there, counted as left (tabs; the read at once and held)', async () => {
  for (const gate of [false, true]) {
    const tag = 'tabs, tap' + (gate ? ', read held' : '') + ': ';
    const app = await pageBoot('tabs', { init: K_INIT });
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      await kScene(app, "scene.selected = 'log'; scene.seq = scene.seq + 1;");
      if (gate) await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ gate: true })));
      await app.reload();
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const hello = await ev(app, () => ({ asked: _photoAsked, tab: currentTab }));
      if (gate) await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app), opens = await kOpens(app);
      assert(hello.asked > 0 && hello.tab === 'log' && m.tab === 'log' && shut(m) && opens === 0 && m.img === PHOTO
        && m.log.indexOf(K_ASKED(0)) >= 0 && m.mark && m.mark.left === 1,
        tag + 'on Log at hello, counted, the photo back with its chat shut, counted as left: ' + J(Object.assign({ hello, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) a cold launch on which the owner tapped a tab before hello answered (hello\'s selection newer, on another tab): the kept share\'s chat stays shut on that tab, counted as left; with no tap it opens (tabs)', async () => {
  for (const pre of [null, { selected: 'progress', seq: 1 }]) {
    const tag = 'tabs, cold, ' + (pre ? 'a tap on Progress' : 'no tap') + ': ';
    const app = await pageBoot('tabs', { init: K_INIT });
    try {
      await ready(app, true);
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
      if (pre) await kNext(app, 'Pre', pre);
      await relaunch(app, { helloDelay: 800, gate: true });
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const asked = await kAsked(app);
      await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 2 min/.test(l)', 'the photo back');
      await settle(app, 800);
      const m = await look(app);
      const say = J(Object.assign({ asked }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) }));
      if (pre) {
        assert(asked > 0 && m.tab === 'progress' && shut(m) && m.img === PHOTO && m.log.indexOf(K_ASKED(2)) >= 0 && m.mark && m.mark.left === 1,
          tag + 'on Progress, counted, the chat shut, counted as left: ' + say);
      } else {
        assert(asked === 0 && m.tab === 'coach' && m.view === 'chat' && m.chats === 1 && m.img === PHOTO
          && m.log.indexOf('photo: back from 2 min, chat opened') >= 0,
          tag + 'nothing counted, the chat opened once with the photo: ' + say);
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) build 60\'s overlay chat taken down while the WebContent restarted (hello\'s up without it, the chat still offered): the kept share\'s chat stays shut, counted as left; kept up (the take-over) it is already on screen and nothing counts (coach)', async () => {
  for (const up of [[], ['coach']]) {
    const tag = 'coach (60), up ' + J(up) + ': ';
    const app = await pageBoot('coach', { init: K_INIT });
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
      const before = await kMark(app);
      await kNext(app, 'Up', up);
      await app.reload();
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const asked = await kAsked(app);
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app), opens = await kOpens(app);
      const say = J(Object.assign({ before, asked, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) }));
      assert(before === '1', tag + 'the overlay chat up is kept in sessionStorage (fp_chat): ' + say);
      if (!up.length) {
        assert(asked > 0 && shut(m) && opens === 0 && m.img === PHOTO && m.log.indexOf(K_ASKED(0)) >= 0 && m.mark && m.mark.left === 1,
          tag + 'counted, the photo back with its chat shut, counted as left: ' + say);
      } else {
        assert(asked === 0 && opens === 0 && m.img === PHOTO && m.tab === 'coach' && m.view === 'chat'
          && m.log.indexOf('photo: back from 0 min, chat already on screen') >= 0,
          tag + 'nothing counted, the chat taken over, already on screen: ' + say);
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// A tab root that fell back took the pushed chat down with it: no move of the owner's (web 20261117-1). The fallback is
// played as the mock keeps it: before the next document started (the scene says fellBack, the Coach tab WEB, the chat
// popped), at its hello (the policy's tabs off, read then), a page whose hello leaves tabs out, or a refused hello.
const kStart = async () => {
  const app = await pageBoot('tabs', { init: K_INIT });
  await ready(app, true);
  await share(app, PHOTO, WORDS);
  await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
  return app;
};
const K_FELL = "scene.fellBack = { why: 'policy', at: Date.now() }; scene.coach = 'web'; scene.pushed = false;";
serial('(k) a tab root that fell back while no document was linked took its chat down itself: nothing counts and the kept share\'s chat opens as it did (the policy before the next document started or at its hello, a page that leaves tabs out of its hello; the read at once and held); a refused hello offers no chat (tabs)', async () => {
  for (const [how, gate] of [['before', false], ['before', true], ['hello', false], ['hello', true], ['page', false], ['refused', false]]) {
    const tag = 'tabs, fell back (' + how + ')' + (gate ? ', read held' : '') + ': ';
    const app = await kStart();
    try {
      const before = await kMark(app);
      if (how === 'before') await kScene(app, K_FELL);
      else if (how === 'hello') await kNext(app, 'Off', ['tabs']);
      else await ev(app, (src) => sessionStorage.setItem('__kFlag', src), how === 'page' ? 'flag.tabs.bar = null;' : 'flag.min = 9;');
      if (gate) await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ gate: true })));
      await app.reload();   // the same scene: a WebContent restart
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const hello = await ev(app, () => ({ asked: _photoAsked, screens: _fp.hello.screens.slice(), tabs: !!_fp.tabs.mode && !_fp.tabs.left }));
      if (gate) await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 500);
      const m = await look(app);
      assert(before === 't' && hello.asked === 0 && !hello.tabs && (how === 'refused' ? hello.screens.length === 0 : hello.screens.indexOf('coach') >= 0)
        && m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.log.indexOf('photo: back from 0 min, chat opened') >= 0 && !(m.mark && m.mark.left),
        tag + 'a tab root\'s chat by its mark, a reply that names no tabs: nothing counted, the chat opened: ' + J(Object.assign({ before, hello }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) a fallback the document heard (screens.off) leaves no mark behind; after a fallback nobody saw, the overlay chat\'s Back during a second restart still counts (tabs)', async () => {
  let app = await kStart();
  try {
    await ev(app, () => { window.__fpShell.fallBack('policy'); });
    await app.page.waitForFunction(() => window._fp && _fp.tabs.left === true, null, { timeout: 15000 });
    await settle(app, 200);
    const mid = await kMark(app);
    await app.reload();
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await settle(app, 150);
    const asked = await kAsked(app);
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await settle(app, 500);
    const m = await look(app);
    assert(mid === null && asked === 0 && m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
      'a fallback heard: the mark gone before the restart, nothing counted, the chat opened: ' + J(Object.assign({ mid, asked }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    noErrors(app);
  } finally { await app.close(); }

  app = await kStart();
  try {
    await kScene(app, K_FELL);
    await app.reload();   // the fallback nobody saw: the chat opens again, as the overlay now
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true && currentTab === 'coach' && coachView === 'chat', null, { timeout: 15000 });
    await settle(app, 200);
    const mid = await kMark(app);
    await kScene(app, 'scene.pushed = false;');   // the owner's Back on the overlay, no document linked
    const n0 = await ev(app, () => __log().filter((l) => /^photo: back from/.test(l)).length);
    await app.reload();
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await settle(app, 150);
    const asked = await kAsked(app);
    await app.page.waitForFunction((n0) => __log().filter((l) => /^photo: back from/.test(l)).length > n0, n0, { timeout: 15000 });
    await settle(app, 500);
    const m = await look(app), opens = await kOpens(app);
    assert(mid === '1' && asked > 0 && opens === 0 && shut(m) && m.img === PHOTO && m.log.indexOf(K_ASKED(0)) >= 0 && m.mark && m.mark.left === 1,
      'the overlay\'s mark is 1, and its Back during the second restart counts: the chat shut, counted as left: ' + J(Object.assign({ mid, asked, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

// ── (k) build 62: hello numbers the document in its scene (the harness's __fpShellDoc knob) ────────────────────────
// A restart that loses WebKit's sessionStorage while the scene lives (the Networking process with the WebContent, which
// tests/tools/shellscen/a_restart.py makes on the simulator): the page's marks go (fp_tab, fp_chat, fp_seen) and the
// mock's scene, kept in the same sessionStorage under its own key, stays. Under 61's reply (no doc) the next document
// boots on the scene's first tab and counts hello's selection, where the owner already was (F1, pinned beside 62's);
// under 62's (doc 2, none of the scene's marks) it boots blind: hello's tab adopted uncounted, one line saying so.
const K_DOC = 'window.__fpShellDoc = true;';
const K_BLIND = (n) => 'shell: document ' + n + ' booted without the scene\'s marks';
const kLose = (app) => ev(app, () => { ['fp_tab', 'fp_chat', 'fp_seen'].forEach((k) => sessionStorage.removeItem(k)); });
const kBlinds = (m) => m.log.filter((l) => /^shell: document \d+ booted without/.test(l));
const kHello = (app) => ev(app, () => ({ asked: _photoAsked, doc: _fp.hello.doc === undefined ? null : _fp.hello.doc, tab: currentTab,
  seen: sessionStorage.getItem('fp_seen') }));

serial('(k) 62: a restart that lost the scene\'s marks (the scene kept) under the share\'s web chat (a key) or connect screen (none) on Coach, the scene\'s first tab Log: 61\'s reply counts hello\'s selection (asked elsewhere: F1, pinned); 62\'s boots blind, Coach adopted uncounted, the chat back as before, one line (tabsWeb)', async () => {
  for (const [key, ver] of [[true, 62], [true, 61], [false, 62], [false, 61]]) {
    const tag = 'tabsWeb, ' + (key ? 'a key' : 'no key') + ', ' + ver + '\'s reply: ';
    const app = await pageBoot('tabsWeb', { init: (key ? '' : "localStorage.removeItem('kt_apikey');") + K_INIT + (ver === 62 ? K_DOC : '') });
    try {
      await ready(app, true);
      const o = await share(app, PHOTO, WORDS);
      const before = await ev(app, () => ({ fpTab: sessionStorage.getItem('fp_tab'), seen: sessionStorage.getItem('fp_seen'),
        scene: window.__fpShell.state().scene.selected, seq: window.__fpShell.state().scene.seq, key: !!getApiKey() }));
      assert(o.tab === 'coach' && o.view === 'chat' && before.fpTab === 'coach' && before.scene === 'coach' && before.seq >= 1 && before.seen === '1'
        && before.key === key, tag + 'the share landed on Coach, the shell there too, the scene marked: ' + J({ o: { tab: o.tab, view: o.view }, before }));
      await kLose(app);
      await app.reload();   // the same scene, its marks gone
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const hello = await kHello(app);
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 500);
      const m = await look(app);
      const say = J(Object.assign({ hello }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) }));
      if (ver === 62) {
        assert(hello.doc === 2 && hello.asked === 0 && hello.tab === 'coach' && hello.seen === '1' && m.tab === 'coach' && m.view === 'chat'
          && m.img === PHOTO && J(kBlinds(m)) === J([K_BLIND(2)]) && !(m.mark && m.mark.left) && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
          tag + 'blind: Coach adopted uncounted, the chat back with the photo, one line: ' + say);
      } else {
        assert(hello.doc === null && hello.asked > 0 && hello.tab === 'coach' && kBlinds(m).length === 0 && !(m.tab === 'coach' && m.view === 'chat')
          && m.img === PHOTO && m.log.indexOf(K_ASKED(0)) >= 0 && m.mark && m.mark.left === 1,
          tag + '61 counts hello\'s selection: the chat not opened, asked elsewhere, counted as left: ' + say);
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) 62: the native chat pushed when the restart lost the scene\'s marks: 61\'s reply counts hello\'s selection and 62\'s does not (blind, one line); the chat is taken over and already on screen either way, so the owner sees no change (tabs)', async () => {
  for (const ver of [62, 61]) {
    const tag = 'tabs, ' + ver + '\'s reply: ';
    const app = await pageBoot('tabs', { init: K_INIT + (ver === 62 ? K_DOC : '') });
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      await kLose(app);
      await app.reload();
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const hello = await kHello(app);
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app), opens = await kOpens(app);
      const say = J(Object.assign({ hello, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) }));
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && opens === 0 && m.log.indexOf('photo: back from 0 min, chat already on screen') >= 0
        && (ver === 62 ? hello.doc === 2 && hello.asked === 0 && J(kBlinds(m)) === J([K_BLIND(2)]) : hello.doc === null && hello.asked > 0 && kBlinds(m).length === 0),
        tag + 'the chat taken over, already on screen; counted only under 61: ' + say);
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) 62: the scene\'s marks kept and a bar tap the shell took during the restart: hello\'s newer selection still counts (doc 2, not blind), the kept share\'s chat stays shut on Log, counted as left (tabs)', async () => {
  const app = await pageBoot('tabs', { init: K_INIT + K_DOC });
  try {
    await ready(app, true);
    await share(app, PHOTO, WORDS);
    await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
    await kScene(app, "scene.selected = 'log'; scene.seq = scene.seq + 1;");
    await app.reload();
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await settle(app, 150);
    const hello = await kHello(app);
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await settle(app, 400);
    const m = await look(app), opens = await kOpens(app);
    assert(hello.doc === 2 && hello.asked > 0 && hello.tab === 'log' && m.tab === 'log' && shut(m) && opens === 0 && m.img === PHOTO
      && m.log.indexOf(K_ASKED(0)) >= 0 && m.mark && m.mark.left === 1 && kBlinds(m).length === 0,
      'the marks kept: counted on Log, the chat shut, counted as left, no blind line: ' + J(Object.assign({ hello, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

// Exactly one of the scene's marks kept (the review's R2): fp_seen alone is any tab-root scene whose owner never changed
// tab (the page writes fp_tab only at a switch); fp_tab alone follows the Networking process crashing under a live page
// (its sessionStorage reads empty at once: a_restart's wckill-crash) and the owner changing tab after. Either mark says
// the scene's marks were not lost, so the document is not blind and a bar tap the shell took during the restart counts:
// each half of the page's blind test (!fp_seen, !fp_tab) is held by one of these cases.
const kOneMark = async (mark) => {
  const tag = 'tabs, 62, ' + (mark === 'seen' ? 'fp_seen kept without fp_tab' : 'fp_tab kept without fp_seen') + ': ';
  const app = await pageBoot('tabs', { init: K_INIT + K_DOC });
  try {
    await ready(app, true);
    if (mark === 'tab') {
      await kLose(app);   // the Networking process crashed: the live page's sessionStorage reads empty, the scene lives
      await ev(app, () => __fpShell.tap('progress'));   // then the owner taps Progress on the bar
      await app.page.waitForFunction(() => currentTab === 'progress', null, { timeout: 15000 });
      await settle(app, 100);
    }
    const before = await ev(app, () => ({ seen: sessionStorage.getItem('fp_seen'), tab: sessionStorage.getItem('fp_tab'), on: currentTab }));
    assert(mark === 'seen' ? before.seen === '1' && before.tab === null && before.on === 'log' : before.seen === null && before.tab === 'progress' && before.on === 'progress',
      tag + 'the one mark the scene keeps: ' + J(before));
    // a share kept 2 minutes ago, then a tap on another tab the shell took while the WebContent restarted
    await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
    const to = mark === 'seen' ? 'progress' : 'log';
    await kScene(app, "scene.selected = '" + to + "'; scene.seq = scene.seq + 1;");
    await app.reload();   // the same scene, its one mark kept
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await settle(app, 150);
    const hello = await kHello(app);
    await waitLine(app, '/^photo: back from 2 min/.test(l)', 'the photo back');
    await settle(app, 400);
    const m = await look(app);
    assert(hello.doc === 2 && hello.asked > 0 && hello.tab === to && m.tab === to && shut(m) && m.img === PHOTO && m.log.indexOf(K_ASKED(2)) >= 0
      && m.mark && m.mark.left === 1 && kBlinds(m).length === 0,
      tag + 'not blind: the tap counted, the kept share\'s chat shut on ' + to + ', counted as left, no blind line: '
      + J(Object.assign({ hello }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
};
serial('(k) 62: fp_seen kept without fp_tab (the owner never changed tab) and a bar tap the shell took during the restart: not blind (doc 2), the tap counts, the kept share\'s chat stays shut on Progress, counted as left, no blind line (tabs)', () => kOneMark('seen'));
serial('(k) 62: fp_tab kept without fp_seen (the Networking process crashed under the live page, then the owner changed tab) and a bar tap the shell took during the restart: not blind (doc 2), the tap counts, the kept share\'s chat stays shut on Log, counted as left, no blind line (tabs)', () => kOneMark('tab'));

serial('(k) 62: a cold launch (doc 1, no marks by construction) still counts a tab tapped before hello answered, and with no tap the kept share\'s chat opens (tabs)', async () => {
  for (const pre of [null, { selected: 'progress', seq: 1 }]) {
    const tag = 'tabs, 62, cold, ' + (pre ? 'a tap on Progress' : 'no tap') + ': ';
    const app = await pageBoot('tabs', { init: K_INIT + K_DOC });
    try {
      await ready(app, true);
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
      if (pre) await kNext(app, 'Pre', pre);
      await relaunch(app, { helloDelay: 800, gate: true });
      await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
      await settle(app, 150);
      const hello = await kHello(app);
      await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 2 min/.test(l)', 'the photo back');
      await settle(app, 800);
      const m = await look(app);
      const say = J(Object.assign({ hello }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) }));
      if (pre) {
        assert(hello.doc === 1 && hello.asked > 0 && m.tab === 'progress' && shut(m) && m.img === PHOTO && m.log.indexOf(K_ASKED(2)) >= 0
          && m.mark && m.mark.left === 1 && kBlinds(m).length === 0, tag + 'counted on Progress, the chat shut, counted as left: ' + say);
      } else {
        assert(hello.doc === 1 && hello.asked === 0 && m.tab === 'coach' && m.view === 'chat' && m.chats === 1 && m.img === PHOTO
          && m.log.indexOf('photo: back from 2 min, chat opened') >= 0 && kBlinds(m).length === 0, tag + 'nothing counted, the chat opened once with the photo: ' + say);
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(k) 62 under the classic root: a restart that lost the scene\'s marks is only logged (doc 2, blind); a Back the shell took meanwhile stays uncounted once the chat\'s mark is gone, so the kept share\'s chat opens again (the miss half, left for a later build; coach61)', async () => {
  const app = await pageBoot('coach61', { init: K_INIT + K_DOC });
  try {
    await ready(app, true);
    await share(app, PHOTO, WORDS);
    await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
    await kScene(app, 'scene.pushed = false;');   // the owner's Back on the overlay, no document linked
    await kLose(app);
    await app.reload();
    await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
    await settle(app, 150);
    const hello = await kHello(app);
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await settle(app, 400);
    const m = await look(app), opens = await kOpens(app);
    assert(hello.doc === 2 && hello.asked === 0 && J(kBlinds(m)) === J([K_BLIND(2)]) && m.img === PHOTO && m.tab === 'coach' && m.view === 'chat'
      && opens === 1 && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
      'blind under the classic root: logged, the Back missed, the chat opened again: ' + J(Object.assign({ hello, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

// fp_seen's writes, counted in the page before its scripts run (one init per document)
const SEEN_WRITES = "(function (si) { window.__seenWrites = 0; Storage.prototype.setItem = function (k) { if (String(k) === 'fp_seen') window.__seenWrites++; return si.apply(this, arguments); }; })(Storage.prototype.setItem);";
serial('(k) 62: fp_seen, the scene\'s mark, is written once per document, at its hello, under every shell, and never without one (none, inert, coach, inert61, coach61, tabs, tabsWeb; two documents each)', async () => {
  for (const shell of ['none', 'inert', 'coach', 'inert61', 'coach61', 'tabs', 'tabsWeb']) {
    const app = await pageBoot(shell, { init: SEEN_WRITES });
    try {
      for (const d of [1, 2]) {
        await ready(app, shell !== 'none');
        const s = await ev(app, () => ({ writes: window.__seenWrites, seen: sessionStorage.getItem('fp_seen'), hello: !!(window._fp && _fp.hello) }));
        assert(shell === 'none' ? s.writes === 0 && s.seen === null && !s.hello : s.writes === 1 && s.seen === '1' && s.hello,
          shell + ', document ' + d + ': ' + J(s));
        if (d === 1) await app.reload();
      }
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (l) setup's chat is the chat on screen ──────────────────────────────────────────────────────────────────────────
const SETUP = "localStorage.removeItem('kt_routine'); localStorage.setItem('kt_intake','1');";
serial('(l) a setup chat taken over at a reload is the chat on screen: the kept share comes back into it, already on screen, nothing presented again, the view left as setup keeps it (tabs, coach61)', async () => {
  for (const shell of ['tabs', 'coach61']) {
    const app = await pageBoot(shell, { init: SETUP });
    try {
      await ready(app, true);
      await share(app, PHOTO, WORDS);
      await app.page.waitForFunction(() => window.__fpShell.state().scene.pushed === true, null, { timeout: 15000 });
      await ev(app, () => sessionStorage.setItem('__next', JSON.stringify({ gate: true })));
      await app.reload();   // the setup chat taken over, the read held until then
      await app.page.waitForFunction(() => window._fp && _fp.hello && _fp.shown.coach, null, { timeout: 15000 });
      const before = await ev(app, () => ({ intake: !!intakeMode, view: coachView }));   // the take-over's (setup keeps the new document's view)
      await ev(app, () => __idbRelease());
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 400);
      const m = await look(app), opens = await kOpens(app), st = await ev(app, () => ({ intake: !!intakeMode, view: coachView, asked: _photoAsked }));
      assert(before.intake && st.intake && st.view === before.view && st.asked === 0 && m.img === PHOTO && m.back === 0 && opens === 0 && m.chats === 0
        && m.log.indexOf('photo: back from 0 min, chat already on screen') >= 0,
        shell + ': the photo back in the setup chat, already on screen, nothing presented, the view kept: ' + J(Object.assign({ before, st, opens }, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(l) a share kept over 30 minutes comes back with its chat shut; once setup\'s chat shows it, it is the composer\'s photo, and leaving that chat counts as leaving it (none)', async () => {
  const app = await pageBoot('none', { init: SETUP });
  try {
    await ready(app, false);
    await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 40 * MIN, src: 'share' });
    await relaunch(app);
    await waitLine(app, '/^photo: back from 40 min$/.test(l)', 'the photo back');
    await settle(app, 100);
    const shut = await look(app);
    assert(shut.img === PHOTO && shut.back === 1 && shut.tab !== 'coach', 'back with its chat shut, not yet seen: ' + J({ back: shut.back, tab: shut.tab }));
    await ev(app, () => switchTab('coach'));
    await settle(app, 150);
    const seen = await look(app), st = await ev(app, () => ({ intake: !!intakeMode, view: coachView }));
    assert(st.intake && seen.tab === 'coach' && seen.photo && seen.back === 0, 'setup\'s chat shows the photo: the composer\'s photo now: ' + J(Object.assign({ st }, { back: seen.back, photo: seen.photo, tab: seen.tab, view: seen.view })));
    await ev(app, () => switchTab('log'));
    await settle(app, 150);
    const left = await look(app);
    assert(left.mark && left.mark.left === 1 && left.img === PHOTO, 'leaving setup\'s chat counts as leaving it: ' + J({ mark: left.mark, img: !!left.img }));
    clean(left.log);
    noErrors(app);
  } finally { await app.close(); }
});

// ── (m) with no key the share's place is still its place ─────────────────────────────────────────────────────────
// The owner's way to another tab: the native bar's tap under a tab root, the page's own bar otherwise.
const mGo = async (app, shell, tab) => {
  await ev(app, async (a) => { if (a.native) await __fpShell.tap(a.tab); else switchTab(a.tab); }, { native: shell === 'tabs' || shell === 'tabsWeb', tab });
  await settle(app, 200);
};
// What the kept photo's bookkeeping says, and what stands on the Coach tab (the connect screen: the web field, or the
// native Coach tab's connect route).
const mSee = (app) => ev(app, () => {
  const S = window.__fpShell, hm = S ? S.calls.filter((c) => c[0] === 'model' && c[1].screen === 'coachHome').map((c) => JSON.parse(c[1].json)) : [];
  return { tab: currentTab, view: coachView, key: !!getApiKey(), img: !!pendingImage, on: pendingImage ? (pendingImage.on || 0) : null,
    back: pendingImage ? (pendingImage.back === undefined ? null : pendingImage.back) : null, mark: __mark(),
    connect: !!document.getElementById('coach-key-input') || (hm.length > 0 && hm[hm.length - 1].route === 'connect'),
    chat: !!document.getElementById('coach-input'),
    chats: S ? S.calls.filter((c) => c[0] === 'selectTab' && c[1] && c[1].intent === 'chat').length : 0,
    log: __log().filter((l) => /^(photo|share): /.test(l)) };
});
serial('(l) setup with no key draws the connect screen, not its chat: a share kept over 30 minutes stays unseen there (back) and nothing is counted, on the Coach tab or after it (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell, { init: "localStorage.removeItem('kt_apikey');" + SETUP });
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 40 * MIN, src: 'share' });
      await relaunch(app);
      await waitLine(app, '/^photo: back from 40 min$/.test(l)', 'the photo back');
      await ready(app, shell !== 'none');
      await settle(app, 200);
      const st = await ev(app, () => ({ intake: !!intakeMode, key: !!getApiKey() }));
      await mGo(app, shell, 'coach');
      const on = await mSee(app);
      await mGo(app, shell, 'log');
      const off = await mSee(app);
      assert(st.intake && !st.key && on.tab === 'coach' && on.connect && on.on === 0 && on.back === 1 && off.tab === 'log' && off.back === 1 && !(off.mark && off.mark.left)
        && off.log.indexOf('photo: chat left') < 0,
        shell + ': the connect screen in setup is no chat: the photo still back, nothing left: ' + J({ st, on, off }));
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(m) a share with no key lands on the Coach tab\'s connect screen; the owner who goes to Log has left its place: the marker says left, and the next two launches inside the 30 minutes leave them on Log (none, coach61, tabs at a relaunch and at a reload)', async () => {
  for (const [shell, again] of [['none', 'relaunch'], ['coach61', 'relaunch'], ['tabs', 'relaunch'], ['tabs', 'reload']]) {
    const tag = shell + ', ' + again + ': ';
    const app = await pageBoot(shell, { init: "localStorage.removeItem('kt_apikey');" });
    try {
      await ready(app, shell !== 'none');
      await share(app, PHOTO, WORDS);
      await settle(app, 150);
      const s1 = await mSee(app);
      assert(!s1.key && s1.img && s1.tab === 'coach' && s1.view === 'chat' && s1.connect && !s1.chat && s1.on === 1,
        tag + 'the share landed on the Coach tab, view chat, where the connect screen stands; its place is marked: ' + J(s1));
      await mGo(app, shell, 'log');
      const s2 = await mSee(app);
      assert(s2.tab === 'log' && s2.mark && s2.mark.left === 1 && s2.log.indexOf('photo: chat left') >= 0, tag + 'going to Log is leaving it: ' + J(s2));
      for (let k = 1; k <= 2; k++) {
        if (again === 'reload') await app.reload(); else await relaunch(app);
        await waitLine(app, '/^photo: back from/.test(l)', 'the photo back');
        await ready(app, shell !== 'none');
        await settle(app, 400);
        const r = await mSee(app);
        assert(r.img && r.tab === 'log' && r.chats === 0 && r.back === 1 && r.log.indexOf('photo: back from 0 min, chat not opened (left earlier)') >= 0,
          tag + 'launch ' + k + ' leaves the owner on Log, the photo back with its chat shut: ' + J(r));
      }
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (n) a photo is in front of the owner only once a chat has drawn it ─────────────────────────────────────────────
// Frames in which the composer's photo row was in #screen (what a paint would have shown), counted from document start.
const N_FRAMES = "window.__photoFrames = 0; (function loop(){ try { if (document.querySelector('#screen img[alt=\"Photo to send\"]')) window.__photoFrames++; } catch (e) {} requestAnimationFrame(loop); })();";
// The key connected in Settings > AI Coach (the field, Save), away from the Coach tab.
const nConnect = async (app, shell) => {
  await mGo(app, shell, 'settings');
  const ok = await ev(app, () => { const el = document.getElementById('settingsApiKeyInput'); if (!el) return false; el.value = 'sk-ant-connected-in-settings'; saveApiKeyFromSettings(); return !!getApiKey(); });
  await settle(app, 250);
  return ok;
};
// A Today card's action, as the (a) cases call it: what the API got, and what stands after.
const nCard = (app) => ev(app, async () => {
  const n = __turns.length, f0 = window.__photoFrames;
  coachCardAction('Swap in dips');
  for (let i = 0; i < 250 && (coachLoading || __turns.length === n); i++) await __w(20);
  await __w(80);
  const t = __turns[__turns.length - 1] || '';
  return { sent: __turns.length > n, image: t.indexOf('"type":"image"') >= 0, pending: !!pendingImage, back: pendingImage ? pendingImage.back : null,
    framesBefore: f0, preview: !!document.querySelector('#screen img[alt="Photo to send"]'), tab: currentTab, view: coachView, kept: !!(await __idb('get')), mark: __mark(),
    box: (document.getElementById('coach-input') || {}).value };
});
serial('(n) with no key the connect screen shows no photo, so a photo shared or put back there stays unseen (back): the key connected in Settings, then a Today card\'s action goes without it and leaves its words in the box, and the chat that prompt opens makes it the composer\'s photo (none, inert61, tabsWeb; a fresh share and a kept one)', async () => {
  for (const shell of ['none', 'inert61', 'tabsWeb']) {
    for (const origin of ['fresh', 'kept']) {
      const tag = shell + ', ' + origin + ': ';
      const app = await pageBoot(shell, { init: "localStorage.removeItem('kt_apikey');" + N_FRAMES });
      try {
        await ready(app, shell !== 'none');
        if (origin === 'kept') {
          await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share', words: WORDS });
          await relaunch(app);
          await waitLine(app, '/^photo: back from 2 min, chat opened$/.test(l)', 'the photo back at its place');
          await ready(app, shell !== 'none');
        } else await share(app, PHOTO, WORDS);
        await settle(app, 400);
        const s1 = await mSee(app), f1 = await ev(app, () => window.__photoFrames);
        assert(!s1.key && s1.img && s1.tab === 'coach' && s1.view === 'chat' && s1.connect && !s1.chat && f1 === 0 && s1.on === 1 && s1.back === 1,
          tag + 'at its place stands the connect screen, no frame showed the photo: still back: ' + J(Object.assign({ frames: f1 }, s1)));
        assert(await nConnect(app, shell), tag + 'the key connected in Settings');
        await mGo(app, shell, 'log');
        const s2 = await mSee(app), f2 = await ev(app, () => window.__photoFrames);
        assert(s2.key && s2.tab === 'log' && s2.back === 1 && f2 === 0, tag + 'on Log with a key, the photo never shown, still back: ' + J(Object.assign({ frames: f2 }, s2)));
        const r = await nCard(app);
        assert(r.sent && !r.image && r.pending && r.kept && r.framesBefore === 0, tag + 'the card\'s prompt went without the photo, which stays pending and kept: ' + J(r));
        await settle(app, 250);
        const s3 = await mSee(app), box = await ev(app, () => (document.getElementById('coach-input') || {}).value);
        assert(s3.tab === 'coach' && s3.chat && s3.back === 0 && await ev(app, () => !!document.querySelector('#screen img[alt="Photo to send"]')),
          tag + 'the chat the prompt opened shows it: the composer\'s photo from here: ' + J(s3));
        assert(box === WORDS, tag + 'the share\'s words still wait in the box beside their photo: ' + J({ box, atSend: r.box }));
        noErrors(app);
      } finally { await app.close(); }
    }
  }
});
serial('(n) under the native chat the app\'s own prompt does not take the page\'s pending photo (it never did): a kept share with no key, the key in Settings, a Today card\'s action (tabs, coach61)', async () => {
  for (const shell of ['tabs', 'coach61']) {
    const app = await pageBoot(shell, { init: "localStorage.removeItem('kt_apikey');" + N_FRAMES });
    try {
      await ready(app, true);
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share', words: WORDS });
      await relaunch(app);
      await waitLine(app, '/^photo: back from 2 min/.test(l)', 'the photo back');
      await ready(app, true);
      await settle(app, 400);
      assert(await nConnect(app, shell), shell + ': the key connected in Settings');
      await ev(app, async (native) => { if (native && window.__fpShell.state().live) await __fpShell.tap('log'); else switchTab('log'); }, shell === 'tabs');
      await settle(app, 200);
      const r = await nCard(app);
      assert(r.sent && !r.image && r.pending, shell + ': the prompt went without the page\'s pending photo: ' + J(r));
      noErrors(app);
    } finally { await app.close(); }
  }
});
serial('(n) the kept share\'s turn finds its place already on screen with no key (a tool\'s route into the chat view): the connect screen stands there, back stays, and the card\'s prompt after a key goes without the photo (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell, { init: "localStorage.removeItem('kt_apikey');" + N_FRAMES });
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __plant(r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share', words: WORDS });
      await ev(app, () => localStorage.setItem('kt_dev_nav', 'coach/chat'));
      await relaunch(app);
      await waitLine(app, '/^photo: back from 2 min, chat already on screen$/.test(l)', 'the turn finding its place on screen');
      await ready(app, shell !== 'none');
      await settle(app, 400);
      const s1 = await mSee(app), f1 = await ev(app, () => window.__photoFrames);
      assert(!s1.key && s1.tab === 'coach' && s1.view === 'chat' && s1.connect && !s1.chat && f1 === 0 && s1.back === 1,
        shell + ': the connect screen stands at the place, no frame showed the photo, still back: ' + J(Object.assign({ frames: f1 }, s1)));
      assert(await nConnect(app, shell), shell + ': the key connected in Settings');
      await mGo(app, shell, 'log');
      const r = await nCard(app);
      assert(r.sent && !r.image && r.pending, shell + ': the card\'s prompt went without the photo: ' + J(r));
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (o) build 62's TrovoShare keeps the share until the page clears it ────────────────────────────────────────────
// What the App Group holds now (INIT62's __held), and the page's share state.
const held62 = (app) => ev(app, () => ({ held: window.__held ? window.__held.id || 'no id' : null, clears: __clears.slice(), args: __readArgs.slice(),
  sid: typeof _shareSid === 'string' ? _shareSid : null, img: pendingImage ? pendingImage.data : null, log: __log() }));
// The relaunched document has read (its boot's own share check, after hello under a flag) and the reader is free.
const readDone = (app, flag) => app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && window.__reads.length > 0 && !_shareBusy,
  flag, { timeout: 15000 }).then(() => settle(app, 60));
const keepLines = (log) => log.filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0);
const notCleared = (log) => log.filter((l) => l.indexOf('share: not cleared') === 0);

serial('(o) build 62\'s TrovoShare is asked getPendingShare({keep:true}) and build 61\'s with no argument (every case above runs on 61\'s, which trips on one); a share the page took is cleared once, by its id, after its record is kept, and a later read finds nothing; a share with no id (build 61\'s extension\'s, read by 62) is read once and clears nothing (none, tabs)', async () => {
  let app = await pageBoot('none');
  try {
    await ready(app, false);
    await share(app, PHOTO, WORDS);
    const a = await ev(app, () => __readArgs.slice());
    assert(a.length >= 2 && a.every((x) => x === null), 'build 61\'s getPendingShare asked with no argument: ' + J(a));
    noErrors(app);
  } finally { await app.close(); }
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS, 'sid-o1');
      await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
      await settle(app, 100);
      const o = await ev(app, async () => {
        const n = __reads.length, k = window.__fpShell ? __fpShell.calls.length : 0;
        await checkPendingShare();   // a later read (a return's check)
        await __w(60);
        return { reads: __reads.slice(n), ops: window.__fpShell ? __fpShell.calls.slice(k).filter((c) => c[0] === 'present' || c[0] === 'selectTab').length : 0 };
      });
      const h = await held62(app);
      assert(h.args.length >= 3 && h.args.every((x) => x === '{"keep":true}'), tag + 'every read asks keep (the boot\'s, the share\'s, the return\'s): ' + J(h.args));
      assert(s.img === PHOTO && s.tab === 'coach' && s.view === 'chat' && s.kept && s.kept.data === PHOTO && s.kept.words === WORDS && names(s.mark, s.kept)
        && (shell !== 'none' || s.box === WORDS), tag + 'the share lands and is kept as before: ' + J(Object.assign({}, s, { kept: !!s.kept })));
      assert(h.clears.length === 1 && h.clears[0].id === 'sid-o1' && h.clears[0].held === 'sid-o1' && h.clears[0].kept === true && h.held === null,
        tag + 'one clear, by its id, once its record was kept; the App Group empty: ' + J(h.clears));
      assert(J(o.reads) === J([false]) && o.ops === 0 && h.img === PHOTO, tag + 'the later read finds nothing and opens nothing; the photo stays pending: ' + J(o));
      assert(notCleared(h.log).length === 0 && h.log.filter((l) => /^share: read/.test(l)).length === 1 && keepLines(h.log).length === 1,
        tag + 'one read line, one keep, no clear line: ' + J(h.log.slice(0, 6)));
      // a share with no id (written by build 61's extension before the update), over it: read and deleted, nothing cleared
      const t = await share(app, PHOTO2, '', null);
      await settle(app, 150);
      const q = await held62(app);
      assert(t.img === PHOTO2 && t.kept && t.kept.data === PHOTO2 && q.clears.length === 1 && q.held === null && q.sid === '',
        tag + 'a share with no id: read once, kept, no clear: ' + J(Object.assign({}, q, { log: q.log.slice(0, 4), img: !!q.img })));
      clean(q.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) the share read again before its clear (its keep held: the page\'s IndexedDB opens gated) is nothing new: one chat, one read line, one keep, the words in once; the clear comes once the keep commits (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { gate: true, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o3' } });
      await readDone(app, shell !== 'none');
      const before = await held62(app);
      assert(before.img === PHOTO && before.held === 'sid-o3' && before.clears.length === 0, tag + 'read, its keep held, nothing cleared: ' + J(Object.assign({}, before, { log: before.log.slice(0, 4) })));
      await ev(app, async () => { await checkPendingShare(); await __w(60); });
      const m = await ev(app, () => {
        const box = document.getElementById('coach-input'), S = window.__fpShell;
        return { reads: __reads.slice(), box: box ? box.value : null, chats: S ? S.calls.filter((c) => c[0] === 'selectTab' && c[1] && c[1].intent === 'chat').length : 0,
          presents: S ? S.calls.filter((c) => c[0] === 'present' && c[1].screen === 'coach').length : 0, n: _photoN };
      });
      assert(J(m.reads) === J([true, true]) && m.n === 1 && (shell === 'none' ? m.box === WORDS : m.chats === 1 && m.presents === 1),
        tag + 'the second read of the same id is nothing new (one chat, one keep, the words once): ' + J(m));
      await ev(app, () => __idbRelease());
      await app.page.waitForFunction(() => __clears.length > 0, null, { timeout: 15000 });
      await settle(app, 150);
      const h = await held62(app);
      const idle = (log) => log.filter((l) => l === 'share: nothing waiting').length;
      assert(h.clears.length === 1 && h.clears[0].id === 'sid-o3' && h.held === null && h.log.filter((l) => /^share: read/.test(l)).length === 1
        && keepLines(h.log).length === 1 && idle(h.log) === idle(before.log), tag + 'one read line and one keep, no line for the second read; the clear once the keep committed: '
        + J(Object.assign({}, h, { log: h.log.slice(0, 5) })));
      clean(h.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) the app closed after the read, its keep held: the next launch reads the share again and opens its chat with the photo and the words, then clears it (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { gate: true, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o4' } });
      await readDone(app, shell !== 'none');
      const a = await held62(app);
      assert(a.img === PHOTO && a.held === 'sid-o4' && a.clears.length === 0, tag + 'read, its keep never committed: ' + J(Object.assign({}, a, { log: a.log.slice(0, 3) })));
      await relaunch(app);
      await ready(app, shell !== 'none');
      await app.page.waitForFunction(() => __clears.length > 0, null, { timeout: 15000 });
      await settle(app, 200);
      const m = await look(app);
      const h = await held62(app);
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.kept && m.kept.data === PHOTO && m.kept.words === WORDS
        && (shell === 'none' ? m.box === WORDS : m.chats === 1 && m.comp && m.comp.image && m.comp.draft && m.comp.draft.text === WORDS),
        tag + 'the next launch read it again: the photo, its chat and its words, kept: ' + J(Object.assign({}, m, { kept: !!m.kept, log: m.log.slice(0, 5) })));
      assert(h.clears.length === 1 && h.clears[0].id === 'sid-o4' && h.held === null, tag + 'then cleared: ' + J(h.clears));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// Build 62's share whose keep fails (web 20261119-4, the review's S2): the page keeps it again on _photoRetry's schedule,
// three keeps of it a document at most; when the third fails it clears the share as build 61's plugin did at its read,
// the photo pending in memory only, with one line.
const LOST62 = 'share: cleared after 3 failed keeps (photo in memory only)';
const KEPT = (k) => 'photo: kept (keep ' + k + ')';
const FAILED_KEEP = 'l === "photo: not kept (aborted)"';
// The page's puts of its photo record so far, and when each came (INIT's hook).
const puts62 = (app) => ev(app, () => ({ puts: __photoPuts, at: __photoPutAt.slice() }));
const gaps = (at) => at.slice(1).map((t, i) => Math.round(t - at[i]));
// A keep that committed (a first keep, or one tried again); 'photo: kept copy not read' is a read's line, not a keep's.
const keptLine = (l) => l === 'photo: kept' || /^photo: kept \(keep \d+\)$/.test(l);
serial('(o) a keep that fails on a page that shows (IndexedDB missing or its open throwing, its put refused for the quota or aborted, the marker refused) is kept again 0.3 s later, three keeps at most: when the third fails the share is cleared as build 61 cleared it at its read (the photo pending in memory only, its chat open, one line) and the next launch reads nothing and has no photo back; a put aborted once is kept by the second keep, which clears the share, and the next launch brings the photo back (none, tabs)', async () => {
  for (const [shell, how, line] of [['none', 'missing', 'photo: not kept (no IndexedDB)'], ['none', 'throws', 'photo: not kept (SecurityError)'],
    ['none', 'quota', 'photo: not kept (quota)'], ['tabs', 'abortPut', 'photo: not kept (aborted)'], ['none', 'marker', 'photo: not kept (quota)'],
    ['tabs', 'once', 'photo: not kept (aborted)']]) {
    const tag = shell + ', ' + how + ': ';
    const always = how === 'missing' || how === 'throws' || how === 'marker';   // every document of the boot; else this one alone
    const app = await pageBoot(shell, { init: INIT62 + (always ? NO_IDB[how] : '') });
    try {
      await ready(app, shell !== 'none');
      if (how === 'once') await ev(app, () => { window.__abortPuts = 1; });
      else if (!always) await ev(app, '(' + FAIL[how].toString() + ')()');
      const s = await share(app, PHOTO, WORDS, 'sid-o5');
      assert(s.img === PHOTO && s.tab === 'coach' && s.view === 'chat' && (shell !== 'none' || s.box === WORDS),
        tag + 'the share lands at once as it always did: ' + J(Object.assign({}, s, { img: !!s.img, kept: !!s.kept })));
      if (how === 'once') {
        await waitLine(app, 'l === ' + J(KEPT(2)), 'the second keep');
        await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
        await settle(app, 150);
        const h = await held62(app);
        const k = await ev(app, () => __idb('get')), mk = await ev(app, () => __mark());
        assert(h.log.indexOf(line) >= 0 && h.clears.length === 1 && h.clears[0].id === 'sid-o5' && h.clears[0].kept === true && h.held === null
          && k && k.data === PHOTO && k.words === WORDS && names(mk, k) && h.log.indexOf(LOST62) < 0,
          tag + 'the first keep failed, the second kept it and cleared the share: ' + J(Object.assign({}, h, { log: h.log.slice(0, 5), img: !!h.img, mark: mk })));
      } else {
        await waitLine(app, 'l === ' + J(LOST62), 'the share cleared after three keeps');
        await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
        await settle(app, 150);
        const h = await held62(app), m = await look(app);
        assert(h.clears.length === 1 && h.clears[0].id === 'sid-o5' && h.clears[0].kept === false && h.held === null,
          tag + 'cleared by its id, with no copy kept: ' + J(h.clears));
        assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && (how === 'marker' ? m.mark === null : gone(m.mark)) && !m.kept && (shell !== 'none' || m.box === WORDS),
          tag + 'build 61\'s state: the photo pending in memory only, its chat open, the marker gone (none written when refused): ' + J(Object.assign({}, m, { img: !!m.img, log: m.log.slice(0, 5) })));
        assert(h.log.filter((l) => l === line).length === 1 && h.log.filter((l) => l === LOST62).length === 1 && !h.log.some(keptLine) && notCleared(h.log).length === 0,
          tag + 'one line for the failed keeps, one for the clear: ' + J(h.log.slice(0, 6)));
      }
      await relaunch(app);
      await ready(app, shell !== 'none');
      if (how === 'once') await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await settle(app, 300);
      const n = await look(app);
      const say = J(Object.assign({}, n, { img: !!n.img, kept: !!n.kept, log: n.log.slice(0, 5) }));
      if (how === 'once') {
        assert(n.img === PHOTO && n.tab === 'coach' && n.view === 'chat' && n.reads.every((x) => x === false) && n.log.indexOf('photo: back from 0 min, chat opened') >= 0,
          tag + 'the next launch: nothing waiting in the App Group, the photo back from the page\'s own copy with its chat: ' + say);
      } else {
        assert(!n.img && n.reads.length >= 1 && n.reads.every((x) => x === false) && !n.log.some((l) => /^photo: back from/.test(l)) && !(n.tab === 'coach' && n.view === 'chat'),
          tag + 'the next launch: nothing waiting and no photo back (build 61\'s state): ' + say);
      }
      clean(n.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) three keeps that fail on a page that shows (each put aborted with no error, as WebKit aborts under a suspended page): kept again about 0.3 s after each failure, three keeps and no fourth (a fourth would have committed); then the share is cleared as build 61 cleared it at its read: the photo pending in memory only, its chat open with the words, the marker gone, one line for the failures and one for the clear (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { abortPuts: 3, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o11' } });
      await waitLine(app, 'l === ' + J(LOST62), 'the share cleared after three keeps');
      await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
      await settle(app, 1200);   // a fourth keep would come 0.3 s after the third failed
      const h = await held62(app), p = await puts62(app), m = await look(app);
      assert(p.puts === 3 && gaps(p.at).every(WAITED), tag + 'three keeps, each about 0.3 s after the one before failed, and no fourth: ' + J({ puts: p.puts, gaps: gaps(p.at) }));
      assert(h.clears.length === 1 && h.clears[0].id === 'sid-o11' && h.clears[0].kept === false && h.held === null && h.sid === 'sid-o11',
        tag + 'the share cleared by its id once, with no copy kept: ' + J(Object.assign({}, h, { log: h.log.slice(0, 5), img: !!h.img })));
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && gone(m.mark) && !m.kept
        && (shell === 'none' ? m.box === WORDS : m.chats === 1 && m.comp && m.comp.image && m.comp.draft && m.comp.draft.text === WORDS),
        tag + 'the photo pending in memory, its chat open with the words, the marker gone: ' + J(Object.assign({}, m, { img: !!m.img, log: m.log.slice(0, 5) })));
      assert(h.log.filter((l) => l === 'photo: not kept (aborted)').length === 1 && h.log.filter((l) => l === LOST62).length === 1
        && !h.log.some(keptLine) && notCleared(h.log).length === 0 && h.log.filter((l) => /^share: read/.test(l)).length === 1,
        tag + 'one read line, one line for the three failed keeps, one for the clear: ' + J(h.log.slice(0, 6)));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) a keep that fails at a boot nobody sees (a background launch; its put aborted) is not kept again while the page is hidden; 0.3 s after the page shows it is, and the keep that commits clears the share; the next launch brings the photo back from the page\'s own copy (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { hidden: true, abortPuts: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o10' } });
      await waitLine(app, FAILED_KEEP, 'the failed keep');
      await settle(app, 1500);   // longer than a page that shows waits for its next keep
      const a = await held62(app), pa = await puts62(app);
      assert(a.img === PHOTO && a.held === 'sid-o10' && a.clears.length === 0 && pa.puts === 1 && a.log.some((l) => /^share: read .*, page hidden$/.test(l)),
        tag + 'hidden: read, its keep failed and not tried again, nothing cleared: ' + J(Object.assign({}, a, pa, { log: a.log.slice(0, 4), img: !!a.img })));
      await show(app);
      await waitLine(app, 'l === ' + J(KEPT(2)), 'the second keep');
      await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
      await settle(app, 100);
      const b = await held62(app), pb = await puts62(app), shown = await ev(app, () => window.__shownAt);
      const k = await ev(app, () => __idb('get')), mk = await ev(app, () => __mark());
      assert(pb.puts === 2 && WAITED(pb.at[1] - shown), tag + 'the second keep came about 0.3 s after the page showed: ' + J({ puts: pb.puts, ms: Math.round(pb.at[1] - shown) }));
      assert(b.clears.length === 1 && b.clears[0].id === 'sid-o10' && b.clears[0].kept === true && b.held === null && b.img === PHOTO
        && k && k.data === PHOTO && k.words === WORDS && names(mk, k) && b.log.indexOf(LOST62) < 0,
        tag + 'kept, then cleared by its id; the record and the marker the share\'s: ' + J(Object.assign({}, b, { log: b.log.slice(0, 5), img: !!b.img, mark: mk })));
      await relaunch(app);
      await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
      await chatUp(app, shell);
      await settle(app, 300);
      const m = await look(app);
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.reads.every((x) => x === false) && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
        tag + 'the next launch: nothing in the App Group, the photo back with its chat: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 5) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) a read of the same id while the share\'s keep waits to be tried again: on a hidden page it leaves the keep waiting; on a page that shows it starts the keep at once (the show\'s event held back from the waiting keep, so only the read can start it), which commits and clears the share; one read line (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { hidden: true, abortPuts: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o12' } });
      await waitLine(app, FAILED_KEEP, 'the failed keep');
      await settle(app, 100);
      await ev(app, async () => { await checkPendingShare(); await __w(500); });   // read again while hidden
      const a = await puts62(app), ha = await held62(app);
      assert(a.puts === 1 && ha.clears.length === 0 && ha.held === 'sid-o12', tag + 'a read while hidden: the keep still waits for the page to show: ' + J(Object.assign({}, a, { clears: ha.clears })));
      await ev(app, () => { window.__vis = 'visible'; });   // shown, its event never reaching the waiting keep
      await settle(app, 600);
      const b = await puts62(app);
      assert(b.puts === 1, tag + 'shown with no event: the keep still waits: ' + J(b));
      await ev(app, () => checkPendingShare());   // the same id read again (a return's check): nothing else can start the keep now
      await app.page.waitForFunction(() => __photoPuts > 1, null, { timeout: 5000 }).catch(() => {});
      const c = await puts62(app);
      assert(c.puts === 2, tag + 'the read started the waiting keep: ' + J(c));
      await waitLine(app, 'l === ' + J(KEPT(2)), 'the second keep');
      await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
      await settle(app, 150);
      const h = await held62(app), m = await look(app);
      assert(h.clears.length === 1 && h.clears[0].id === 'sid-o12' && h.clears[0].kept === true && h.held === null && h.log.filter((l) => /^share: read/.test(l)).length === 1
        && m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && (shell === 'none' ? m.box === WORDS : m.chats === 1),
        tag + 'kept and cleared; nothing new shown, one read line: ' + J(Object.assign({}, h, { log: h.log.slice(0, 5), img: !!h.img })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) the photo sent or removed while its share\'s keep waits to be tried again (a page nobody sees): the share is cleared at once and no keep of it follows once the page shows; a newer share read meanwhile wrote over it: nothing is cleared for the first and no line says so, the newer one kept and cleared in its turn (none, tabs)', async () => {
  for (const [shell, what] of [['none', 'send'], ['tabs', 'send'], ['none', 'remove'], ['tabs', 'remove'], ['none', 'newer'], ['tabs', 'newer']]) {
    const tag = shell + ', ' + what + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { hidden: true, abortPuts: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o13' } });
      await waitLine(app, FAILED_KEEP, 'the failed keep');
      await settle(app, 100);
      const a = await held62(app);
      assert(a.img === PHOTO && a.clears.length === 0 && a.held === 'sid-o13', tag + 'read, its keep failed and waits: ' + J(a.clears));
      if (what === 'send') {
        await ev(app, async (native) => {
          if (native) await __fpShell.call('coach.send', { text: 'Form check please', usePending: true, nonce: 'n-132-o13' });
          else document.getElementById('coach-send').click();
          for (let i = 0; i < 150 && coachLoading; i++) await __w(20);
          await __w(60);
        }, shell !== 'none');
      } else if (what === 'remove') {
        if (shell === 'none') await ev(app, () => document.querySelector('#screen .coach-img-x').click());
        else await ev(app, () => __fpShell.call('coach.clearImage', {}));
        await settle(app, 60);
      } else await share(app, PHOTO2, 'And this one?', 'sid-o13b');
      await settle(app, 150);
      const b = await held62(app);
      if (what === 'newer') {
        assert(b.clears.length === 1 && b.clears[0].id === 'sid-o13b' && b.clears[0].kept === true && b.held === null && b.img === PHOTO2 && b.sid === 'sid-o13b',
          tag + 'the newer share kept and cleared; nothing asked for the first: ' + J(Object.assign({}, b, { log: b.log.slice(0, 5), img: !!b.img })));
      } else {
        assert(b.clears.length === 1 && b.clears[0].id === 'sid-o13' && b.clears[0].kept === false && b.held === null && b.sid === '' && b.img !== PHOTO,
          tag + 'the share cleared at once, its keep never committed: ' + J(Object.assign({}, b, { log: b.log.slice(0, 5), img: !!b.img })));
      }
      await show(app);
      await settle(app, 1200);   // the first share's keep would come 0.3 s after the show
      const c = await held62(app), p = await puts62(app);
      assert(p.puts === (what === 'newer' ? 2 : 1) && c.clears.length === 1 && notCleared(c.log).length === 0
        && !c.log.some((l) => l === LOST62 || /^photo: kept \(keep/.test(l)),
        tag + 'no keep of the first share followed, one clear in all, no not-cleared line: ' + J(Object.assign({}, p, { clears: c.clears, log: c.log.slice(0, 6) })));
      clean(c.log, ['TkVXRVItU0hB', 'And this one', String(c.img || '').slice(0, 12)]);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) a document nobody saw that ends with its share\'s keep failed (a background launch the app never showed) leaves the share in the App Group: the next document reads it as a fresh share, opens its chat with the photo and the words, keeps it and clears it (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { hidden: true, abortPuts: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o14' } });
      await waitLine(app, FAILED_KEEP, 'the failed keep');
      await settle(app, 600);
      const a = await held62(app);
      assert(a.img === PHOTO && a.held === 'sid-o14' && a.clears.length === 0, tag + 'hidden: its keep failed, the App Group keeps it: ' + J(Object.assign({}, a, { log: a.log.slice(0, 4), img: !!a.img })));
      await relaunch(app);   // the document ends unseen; the next one shows
      await ready(app, shell !== 'none');
      await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
      await settle(app, 200);
      const m = await look(app), h = await held62(app);
      assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.kept && m.kept.data === PHOTO && m.kept.words === WORDS
        && (shell === 'none' ? m.box === WORDS : m.chats === 1 && m.comp && m.comp.image && m.comp.draft && m.comp.draft.text === WORDS)
        && m.log.filter((l) => /^share: read .*, page visible$/.test(l)).length === 1,
        tag + 'the next document read it as a fresh share: its chat, photo and words, kept: ' + J(Object.assign({}, m, { kept: !!m.kept, log: m.log.slice(0, 5) })));
      assert(h.clears.length === 1 && h.clears[0].id === 'sid-o14' && h.clears[0].kept === true && h.held === null, tag + 'then cleared: ' + J(h.clears));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) the owner leaves the share\'s chat while its keep waits to be tried again (the failed keep marked the photo gone, so the leave could not be marked): the keep that commits carries the leave, and the next launch brings the photo back with its chat shut (none)', async () => {
  const app = await pageBoot('none', { init: INIT62 });
  try {
    await ready(app, false);
    await relaunch(app, { hidden: true, abortPuts: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o15' } });
    await waitLine(app, FAILED_KEEP, 'the failed keep');
    await settle(app, 100);
    await ev(app, () => { window.__vis = 'visible'; });   // the app in front, the show's event held back from the waiting keep
    await ev(app, () => switchTab('log'));                 // and the owner on Log before the keep is tried again
    await settle(app, 100);
    const a = await ev(app, () => ({ tab: currentTab, mark: __mark() }));
    assert(a.tab === 'log' && gone(a.mark), 'the leave not marked: the marker says gone: ' + J(a));
    await show(app);
    await waitLine(app, 'l === ' + J(KEPT(2)), 'the second keep');
    await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
    await settle(app, 100);
    const mk = await ev(app, () => __mark()), k = await ev(app, () => __idb('get'));
    assert(mk && mk.left === 1 && !mk.gone && k && mk.n === k.n && mk.at === k.at, 'the keep that committed carries the leave: ' + J(mk));
    await relaunch(app);
    await waitLine(app, '/^photo: back from 0 min/.test(l)', 'the photo back');
    await settle(app, 300);
    const m = await look(app);
    assert(m.img === PHOTO && shut(m) && m.log.indexOf('photo: back from 0 min, chat not opened (left earlier)') >= 0 && m.reads.every((x) => x === false),
      'the next launch: the photo back with its chat shut: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 5) })));
    assert(m.log.filter((l) => l === 'photo: chat left').length === 1,
      'the leave the keep carried has its one line (review round 2, P2): ' + J(m.log.slice(0, 8)));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

serial('(o) the owner leaves the share\'s chat while its keep waits to be tried again and comes back to it before the keep is tried: the keep that commits marks no leave (the marker names its record and nothing more), and the next launch opens the photo\'s chat (none)', async () => {
  const app = await pageBoot('none', { init: INIT62 });
  try {
    await ready(app, false);
    await relaunch(app, { hidden: true, abortPuts: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o18' } });
    await waitLine(app, FAILED_KEEP, 'the failed keep');
    await settle(app, 100);
    await ev(app, () => { window.__vis = 'visible'; });   // the app in front, the show's event held back from the waiting keep
    await ev(app, () => switchTab('log'));                 // the owner leaves the chat
    await settle(app, 100);
    await ev(app, () => { switchTab('coach', { intent: 'chat' }); coachView = 'chat'; render(); });   // and comes back to it
    await settle(app, 100);
    const a = await ev(app, () => ({ tab: currentTab, view: coachView, mark: __mark() }));
    assert(a.tab === 'coach' && a.view === 'chat' && gone(a.mark), 'back on the chat before the keep is tried again, the marker still gone: ' + J(a));
    await show(app);
    await waitLine(app, 'l === ' + J(KEPT(2)), 'the second keep');
    await app.page.waitForFunction(() => __clears.length > 0 && __clears[0].kept !== null, null, { timeout: 15000 });
    await settle(app, 100);
    const mk = await ev(app, () => __mark()), k = await ev(app, () => __idb('get'));
    assert(names(mk, k), 'the keep that committed marks no leave: the marker names its record and nothing more: ' + J({ mk, k: k && { n: k.n, at: k.at } }));
    await relaunch(app);
    await waitLine(app, 'l === "photo: back from 0 min, chat opened"', 'chat opened');
    await settle(app, 300);
    const m = await look(app);
    assert(m.img === PHOTO && m.tab === 'coach' && m.view === 'chat' && m.log.filter((l) => l === 'photo: chat left').length === 0,
      'the next launch opens the photo\'s chat; no leave line was ever written: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

serial('(o) the photo sent or removed before its keep settled (the web Send and the remove button under none; coach.send usePending and coach.clearImage under tabs) clears the share once, at once; a pick in the web composer over a held share clears it too (none)', async () => {
  for (const [shell, what] of [['none', 'send'], ['tabs', 'send'], ['none', 'remove'], ['tabs', 'remove'], ['none', 'pick']]) {
    const tag = shell + ', ' + what + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { gate: true, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o6' } });
      await readDone(app, shell !== 'none');
      const a = await held62(app);
      assert(a.img === PHOTO && a.clears.length === 0, tag + 'read, its keep held: ' + J(a.clears));
      if (what === 'send') {
        await ev(app, async (native) => {
          if (native) await __fpShell.call('coach.send', { text: 'Form check please', usePending: true, nonce: 'n-132-o6' });
          else document.getElementById('coach-send').click();
          for (let i = 0; i < 150 && coachLoading; i++) await __w(20);
          await __w(60);
        }, shell !== 'none');
      } else if (what === 'remove') {
        if (shell === 'none') await ev(app, () => document.querySelector('#screen .coach-img-x').click());
        else await ev(app, () => __fpShell.call('coach.clearImage', {}));
        await settle(app, 60);
      } else {
        const [fc] = await Promise.all([app.page.waitForEvent('filechooser', { timeout: 10000 }), app.page.click('.coach-attach')]);
        await fc.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
        await app.page.waitForFunction((p) => pendingImage && pendingImage.data !== p, PHOTO, { timeout: 10000 });
        await settle(app, 60);
      }
      const b = await held62(app);
      assert(b.clears.length === 1 && b.clears[0].id === 'sid-o6' && b.held === null && b.sid === '' && b.img !== PHOTO,
        tag + 'the share cleared at once, before its keep settled: ' + J(Object.assign({}, b, { log: b.log.slice(0, 4), img: !!b.img })));
      await ev(app, () => __idbRelease());
      await app.page.waitForFunction(() => __log().some((l) => l === 'photo: kept'), null, { timeout: 15000 });
      await settle(app, 200);
      const c = await held62(app);
      assert(c.clears.length === 1 && notCleared(c.log).length === 0, tag + 'its keep committing later clears nothing more: ' + J(Object.assign({}, c, { log: c.log.slice(0, 5), img: !!c.img })));
      clean(c.log, what === 'pick' ? [String(c.img || '').slice(0, 12)] : []);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) a newer share written between the read and the clear: the clear does not clear (one line), the newer share is read next, its chat open with its photo and words, and cleared in its turn (none, tabs)', async () => {
  for (const shell of ['none', 'tabs']) {
    const tag = shell + ': ';
    const app = await pageBoot(shell, { init: INIT62 });
    try {
      await ready(app, shell !== 'none');
      await relaunch(app, { gate: true, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o8a' } });
      await readDone(app, shell !== 'none');
      await ev(app, () => { window.__held = { imageBase64: 'TkVXRVItU0hBUkUtMTMy', comment: 'And this one?', id: 'sid-o8b' }; __idbRelease(); });
      await waitLine(app, 'l === "share: not cleared (newer share waiting)"', 'not cleared');
      const a = await held62(app);
      assert(a.clears.length === 1 && a.clears[0].id === 'sid-o8a' && a.clears[0].held === 'sid-o8b' && a.held === 'sid-o8b' && a.img === PHOTO,
        tag + 'the clear found the newer share and left it: ' + J(Object.assign({}, a, { log: a.log.slice(0, 4), img: !!a.img })));
      await ev(app, async () => { await checkPendingShare(); await __w(60); });
      await app.page.waitForFunction(() => __clears.length > 1, null, { timeout: 15000 });
      await settle(app, 150);
      const m = await look(app);
      const h = await held62(app);
      assert(m.img === 'TkVXRVItU0hBUkUtMTMy' && m.tab === 'coach' && m.view === 'chat' && (shell === 'none' ? m.box.indexOf('And this one?') >= 0 : m.comp && m.comp.image),
        tag + 'the newer share read next, its chat with its photo and words: ' + J(Object.assign({}, m, { kept: !!m.kept, log: m.log.slice(0, 5) })));
      assert(h.clears.length === 2 && h.clears[1].id === 'sid-o8b' && h.held === null && notCleared(h.log).length === 1,
        tag + 'cleared in its turn; one not-cleared line: ' + J(Object.assign({}, h, { log: h.log.slice(0, 6), img: !!h.img })));
      clean(h.log, ['TkVXRVItU0hB', 'And this one']);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(o) three keeps that fail, then a clear that fails: each says so once, and the next read of that id (a return\'s check) asks the clear again, which clears it; the photo stays pending in memory and the next launch reads nothing (none)', async () => {
  const app = await pageBoot('none', { init: INIT62 });
  try {
    await ready(app, false);
    await relaunch(app, { abortPuts: 3, clearFail: 1, held: { imageBase64: PHOTO, comment: WORDS, id: 'sid-o19' } });
    await waitLine(app, 'l === ' + J(LOST62), 'the share given up after three keeps');
    await waitLine(app, 'l === "share: not cleared (error)"', 'the clear refused');
    await settle(app, 100);
    const a = await held62(app);
    assert(a.clears.length === 1 && a.clears[0].id === 'sid-o19' && a.held === 'sid-o19' && a.img === PHOTO,
      'the clear after the third keep refused: the App Group keeps the share: ' + J(Object.assign({}, a, { log: a.log.slice(0, 6), img: !!a.img })));
    await ev(app, async () => { await checkPendingShare(); await __w(60); });
    await settle(app, 100);
    const b = await held62(app);
    assert(b.clears.length === 2 && b.clears[1].id === 'sid-o19' && b.held === null && b.img === PHOTO && notCleared(b.log).length === 1
      && b.log.filter((l) => /^share: read/.test(l)).length === 1,
      'the read of the same id asked the clear again and cleared it, nothing new shown: ' + J(Object.assign({}, b, { log: b.log.slice(0, 6), img: !!b.img })));
    await relaunch(app);
    await settle(app, 3000);   // the boot's check and the kept photo's read have come and gone
    const m = await look(app);
    assert(m.img === null && m.reads.every((x) => x === false) && !m.kept,
      'the next launch reads nothing: no share in the App Group, no kept copy: ' + J(Object.assign({}, m, { kept: !!m.kept, log: m.log.slice(0, 6) })));
    clean(m.log);
    noErrors(app);
  } finally { await app.close(); }
});

serial('(o) a clear that fails says so once, and the next read of that id (a return\'s check) asks again, which clears it; the photo stays pending throughout (none)', async () => {
  const app = await pageBoot('none', { init: INIT62 });
  try {
    await ready(app, false);
    await ev(app, () => { window.__clearFail = 1; });
    await share(app, PHOTO, WORDS, 'sid-o9');
    await waitLine(app, 'l === "share: not cleared (error)"', 'not cleared (error)');
    const a = await held62(app);
    assert(a.clears.length === 1 && a.held === 'sid-o9' && a.img === PHOTO, 'the clear refused: the App Group keeps it: ' + J(Object.assign({}, a, { log: a.log.slice(0, 4), img: !!a.img })));
    await ev(app, async () => { await checkPendingShare(); await __w(60); });
    await settle(app, 100);
    const b = await held62(app);
    const m = await look(app);
    assert(b.clears.length === 2 && b.clears[1].id === 'sid-o9' && b.held === null && b.img === PHOTO && notCleared(b.log).length === 1
      && b.log.filter((l) => /^share: read/.test(l)).length === 1 && m.box === WORDS, 'the next read of the id asked again and cleared it, nothing new shown: ' + J(Object.assign({}, b, { log: b.log.slice(0, 5), img: !!b.img })));
    clean(b.log);
    noErrors(app);
  } finally { await app.close(); }
});
