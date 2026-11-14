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
// - TrovoShare: the photo the extension left (__held), handed over once, as the plugin deletes what it returns, each read
//   recorded in __reads (whether it carried a photo); TrovoWidget.consumeDeepLink: the parked link (__parked), once;
// - __next (sessionStorage, set before a relaunch): what the next document starts with: a share waiting (held, parked),
//   hello's delay (the 61 mock's __fpShellHelloDelay), the parked link's answer held (linkDelay, ms), gate (the page's
//   IndexedDB opens held until __idbRelease()) and hidden (the page boots unseen: document.visibilityState reads
//   __vis, 'visible' unless so);
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
    if (n) { window.__held = n.held || null; window.__parked = n.parked || ''; if (n.helloDelay) window.__fpShellHelloDelay = n.helloDelay; window.__linkDelay = n.linkDelay || 0; if (n.hidden) window.__vis = 'hidden'; }
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
  P.TrovoShare = Object.assign(P.TrovoShare || {}, { getPendingShare: () => {
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
      const tx = db.transaction('photo', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('photo');
      if (op === 'get') { const g = st.get('pending'); g.onsuccess = () => { out = g.result === undefined ? null : g.result; }; }
      else if (op === 'put') st.put(rec, 'pending');
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
// A share read by the page (the reader, as the deep link calls it), then its record kept (or not).
const share = async (app, photo, words) => {
  const n = await ev(app, () => __log().filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0).length);
  const o = await ev(app, async (a) => {
    window.__held = { imageBase64: a.photo, comment: a.words || undefined };
    await checkPendingShare();
    const box = document.getElementById('coach-input');
    return { img: pendingImage ? pendingImage.data : null, tab: currentTab, view: coachView, box: box ? box.value : null };
  }, { photo, words });
  await app.page.waitForFunction((n) => __log().filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0).length > n, n, { timeout: 15000 });
  await settle(app, 30);   // render's watch (a timer) has seen the chat
  o.kept = await ev(app, () => __idb('get'));
  o.mark = await ev(app, () => __mark());
  return o;
};
// The app closed and opened again: a new scene for the 61 mock (its sessionStorage copy and fp_tab gone), next for the
// document it starts.
const relaunch = async (app, next) => {
  await ev(app, (next) => {
    sessionStorage.removeItem('__fpShellMock'); sessionStorage.removeItem('fp_tab');
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
const show = (app) => ev(app, () => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });

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
