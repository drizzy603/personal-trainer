// fp-spec: self-shelled
// 132: the pending photo kept on the device until it is sent or removed, and a shared photo's words before the chat's
// first paint (the owner's iPhone, 13 Nov 2026, build 61: a cold share with words, the app closed before Send, and the
// words came back in the native composer while the photo was gone: getPendingShare deletes the App Group's copy as it
// answers, and the photo lived only in the page's memory). Every boot names its shell; the coach API answers at once.
// - (a) A share, then the app closed and opened again (a new scene): the photo is back in the composer and the chat
//   opens after hello (a share under 30 minutes old): the web chat's preview (none, with a photo of a real size),
//   build 61's overlay chat (coach61) and the native Coach tab's pushed chat (tabs), whose composer.image fetches the
//   photo; the record is the share's {data, mediaType, at, src}. A reload under the native chat (WebContent ended, the
//   scene keeps the chat up) takes the chat over with the photo and presents nothing again. A share kept over 30
//   minutes, or a photo picked in the web composer, comes back with the chat left shut, and is there when it opens; so
//   does a share under 30 minutes when the launch was asked for somewhere else (the widget's Start parked, a touch on
//   the page while hello was still out), and a chat taken over before such a touch shows the photo.
// - (b) Sent (the web Send, coach.send usePending): the record goes, and the next launch has no photo.
// - (c) Removed (the web composer's remove button, coach.clearImage): the record goes, and the next launch has none.
// - (d) A record older than 24 h, or one the page cannot read, is deleted at boot and never comes back.
// - (e) IndexedDB missing, its open throwing or never answering, its write refused for the quota: the share lands at once
//   as it always did (photo, chat, words), the boot is untouched, nothing throws, nothing comes back after a relaunch.
// - (f) The words are in the first chat model pushed (coach61, tabs) and in the web composer (none) with the page's
//   clock paused: no timer runs between the read and the words.
// - (g) A new share replaces the kept photo; a share waiting in the App Group when a kept share comes back at boot
//   wins whichever is read first: its photo, one chat opened (one selectTab with the chat's intent), the kept one
//   never shown over it.
// - (h) No breadcrumb carries the words or the photo: sizes and states only, in the read line's own shape.
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const { boot, assert, run } = require('../lib/harness');

// One case at a time: each starts its own browser.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const MIN = 60000, HOUR = 3600000;

// In the page, before its scripts:
// - the coach API answering at once (each request's last user content in __turns), and __w(ms);
// - TrovoShare: the photo the extension left (__held), handed over once, as the plugin deletes what it returns, each read
//   recorded in __reads (whether it carried a photo); TrovoWidget.consumeDeepLink: the parked link (__parked), once;
// - __next (sessionStorage, set before a relaunch): what the next document starts with: a share waiting (held, parked),
//   hello's delay (the 61 mock's __fpShellHelloDelay), the parked link's answer held (linkDelay, ms) and gate (the
//   page's IndexedDB opens held until __idbRelease());
// - __idb(op, rec): the kept record through IndexedDB's own API ('get', 'put', 'delete'), taken before an init can
//   take IndexedDB away; __log(): kt_wch_log's lines without their time;
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
  window.__held = null; window.__reads = []; window.__parked = '';
  try {
    const n = JSON.parse(sessionStorage.getItem('__next') || 'null');
    sessionStorage.removeItem('__next');
    if (n) { window.__held = n.held || null; window.__parked = n.parked || ''; if (n.helloDelay) window.__fpShellHelloDelay = n.helloDelay; window.__linkDelay = n.linkDelay || 0; }
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
const HIDDEN = 'window.__vis = "visible"; Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__vis; } });';
// IndexedDB taken away three ways, or refusing the write for the quota (after INIT, which keeps the real one for __idb).
const NO_IDB = {
  missing: 'Object.defineProperty(window, "indexedDB", { configurable: true, get: function () { return undefined; } });',
  throws: 'IDBFactory.prototype.open = function () { throw new DOMException("refused by the spec", "SecurityError"); };',
  silent: 'IDBFactory.prototype.open = function () { return {}; };',   // a request whose events never come
  quota: 'IDBObjectStore.prototype.put = function () { throw new DOMException("full", "QuotaExceededError"); };',
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
// A share read by the page (the reader, as the deep link calls it), then its record kept.
const share = async (app, photo, words) => {
  const n = await ev(app, () => __log().filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0).length);
  const o = await ev(app, async (a) => {
    window.__held = { imageBase64: a.photo, comment: a.words || undefined };
    await checkPendingShare();
    const box = document.getElementById('coach-input');
    return { img: pendingImage ? pendingImage.data : null, tab: currentTab, view: coachView, box: box ? box.value : null };
  }, { photo, words });
  await app.page.waitForFunction((n) => __log().filter((l) => l === 'photo: kept' || l.indexOf('photo: not kept') === 0).length > n, n, { timeout: 15000 });
  o.kept = await ev(app, () => __idb('get'));
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
  return { img: pendingImage ? pendingImage.data : null, type: pendingImage ? pendingImage.mediaType : null, key: pendingImage ? pendingImage.key || null : null,
    tab: currentTab, view: coachView, photo: !!document.querySelector('#screen img[alt="Photo to send"]'), box: box ? box.value : null,
    comp: models.length ? models[models.length - 1].composer : null, shown: !!(window._fp && _fp.shown.coach),
    ops: S ? S.calls.filter((c) => c[0] === 'present' || c[0] === 'dismiss').map((c) => c[0] + ' ' + c[1].screen) : [],
    chats: S ? S.calls.filter((c) => c[0] === 'selectTab' && c[1] && c[1].intent === 'chat').length : 0,
    reads: __reads.slice(), log: __log(), kept: null };
}).then(async (m) => { m.kept = await ev(app, () => __idb('get')); return m; });
// (h) sizes and states only: no line carries the words, any stretch of a photo, or a data URL.
const NEEDLES = [WORDS, WORDS.slice(0, 12), PHOTO.slice(0, 12), PHOTO2.slice(0, 12), BIG.slice(0, 12), 'base64', 'data:'];
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

// ── (a) the photo comes back ──────────────────────────────────────────────────────────────────────────────────────
serial('(a) a share, then the app closed and opened again: the photo is back in the composer and the chat opens after hello (a share under 30 minutes): the web chat\'s preview (none, a photo of a real size), build 61\'s overlay chat (coach61) and the native Coach tab\'s pushed chat (tabs), whose composer.image fetches the photo; the record is the share\'s', async () => {
  for (const shell of ['none', 'coach61', 'tabs']) {
    const photo = shell === 'none' ? BIG : PHOTO;
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, photo, WORDS);
      const now = Date.now();
      assert(s.img === photo && s.tab === 'coach' && s.view === 'chat' && s.kept && s.kept.data === photo && s.kept.mediaType === 'image/jpeg'
        && s.kept.src === 'share' && Math.abs(s.kept.at - now) < MIN && J(Object.keys(s.kept).sort()) === J(['at', 'data', 'mediaType', 'src']),
        shell + ': the share read, its record {data, mediaType, at, src} kept: ' + J(Object.assign({}, s, { img: !!s.img, kept: s.kept && { src: s.kept.src, at: s.kept.at, n: String(s.kept.data).length } })));
      if (shell === 'none') assert(s.box === WORDS, 'none: the words in the web composer: ' + J(s.box));
      // the next launch, hello 600 ms late under the flags: the photo back, the chat opened after hello's answer
      await relaunch(app, shell === 'none' ? null : { helloDelay: 600 });
      await waitLine(app, '/^photo: back from/.test(l)', 'photo: back from');
      if (shell !== 'none') await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
      await settle(app, 150);
      const m = await look(app);
      assert(m.img === photo && m.type === 'image/jpeg' && m.tab === 'coach' && m.view === 'chat' && m.log.indexOf('photo: back from 0 min, chat opened') >= 0,
        shell + ': the photo back and the chat opened: ' + J(Object.assign({}, m, { img: !!m.img, kept: !!m.kept })));
      assert(m.kept && m.kept.data === photo && m.kept.src === 'share', shell + ': the record stays until the photo is sent or removed');
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
    await ev(app, (r) => __idb('put', r), { data: PHOTO2, mediaType: 'image/jpeg', at: Date.now() - 45 * MIN, src: 'share' });
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
    const k = await ev(app, async () => ({ img: pendingImage && pendingImage.data, type: pendingImage && pendingImage.mediaType, kept: await __idb('get') }));
    assert(k.img && k.kept && k.kept.data === k.img && k.kept.src === 'pick' && k.kept.mediaType === k.type && /^image\//.test(k.type),
      'none: the picked photo kept as a pick: ' + J({ type: k.type, src: k.kept && k.kept.src }));
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

serial('(a) a share under 30 minutes comes back with the chat left shut when the launch was asked for somewhere else: the widget\'s Start parked (tabs, none), a touch on the page while hello was still out (tabs); a reload under the native chat touched before the open keeps the chat it took over, with the photo (tabs)', async () => {
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
        await waitLine(app, 'l === "photo: back from 0 min, chat not opened (asked elsewhere)"', 'asked elsewhere');
        await settle(app, 100);
        const m = await look(app);
        const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), m.key);
        assert(m.shown && m.tab === 'coach' && m.view === 'chat' && m.ops.length === 0 && m.comp && m.comp.image && m.comp.image.key === m.key && img.ok && img.data === PHOTO,
          tag + 'the chat it took over shows the photo: ' + J({ shown: m.shown, tab: m.tab, view: m.view, ops: m.ops, comp: m.comp, ok: img.ok }));
        clean(m.log);
        noErrors(app);
        continue;
      }
      await ev(app, (r) => __idb('put', r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
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
        && m.log.indexOf('photo: back from 2 min, chat not opened (asked elsewhere)') >= 0,
        tag + 'the photo back, the chat shut, on Log: ' + J(Object.assign({}, m, { log: m.log.slice(0, 6), kept: !!m.kept })));
      if (shell === 'tabs') {
        await ev(app, () => { switchTab('coach', { intent: 'chat' }); coachView = 'chat'; render(); });
        await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
        const n = await look(app);
        assert(n.comp && n.comp.image && n.comp.image.key === n.key, tag + 'the chat opened later has the photo: ' + J(n.comp));
      }
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (b) sent, (c) removed ─────────────────────────────────────────────────────────────────────────────────────────
serial('(b) sending the photo deletes its record (the web Send under none, coach.send usePending under tabs): the API got it, and the next launch has no photo', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      const s = await share(app, PHOTO, WORDS);
      assert(s.kept && s.kept.data === PHOTO, shell + ': kept before the send');
      const r = await ev(app, async (x) => {
        let a = null;
        if (x.shell === 'none') document.getElementById('coach-send').click();
        else a = await __fpShell.call('coach.send', { text: 'Form check please', usePending: true, nonce: 'n-132-send' });
        for (let i = 0; i < 150 && coachLoading; i++) await __w(20);
        await __w(80);
        return { a, pending: !!pendingImage, api: __turns.some((t) => t.indexOf(x.photo) >= 0), kept: await __idb('get'), log: __log() };
      }, { shell, photo: PHOTO });
      assert((shell === 'none' || (r.a && r.a.ok)) && !r.pending && r.api && r.kept === null && r.log.indexOf('photo: sent') >= 0,
        shell + ': sent with the photo, the record gone, "photo: sent": ' + J(Object.assign({}, r, { log: r.log.slice(0, 5) })));
      await relaunch(app);
      await ready(app, shell !== 'none');
      const m = await look(app);
      assert(m.img === null && m.kept === null && !m.log.some((l) => /^photo: back from/.test(l)), shell + ': the next launch has no photo: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      clean(m.log);
      noErrors(app);
    } finally { await app.close(); }
  }
});

serial('(c) removing the photo deletes its record (the web composer\'s remove button under none, coach.clearImage under tabs), and the next launch has none', async () => {
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
      const r = await ev(app, async () => { await __w(80); return { pending: !!pendingImage, preview: !!document.querySelector('#screen img[alt="Photo to send"]'), kept: await __idb('get') }; });
      assert(!r.pending && !r.preview && r.kept === null, shell + ': the photo and its record gone: ' + J(r));
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

// ── (d) old or unreadable ─────────────────────────────────────────────────────────────────────────────────────────
serial('(d) a record older than 24 h, or one the page cannot read, is deleted at boot and never comes back (tabs, none)', async () => {
  for (const [shell, rec, line] of [
    ['tabs', { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 25 * HOUR, src: 'share' }, 'photo: kept copy dropped (25 h old)'],
    ['none', { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 24 * HOUR - MIN, src: 'pick' }, 'photo: kept copy dropped (24 h old)'],
    ['none', { data: 'not base64!', mediaType: 'image/jpeg', at: Date.now(), src: 'share' }, 'photo: kept copy dropped (unreadable)'],
    ['none', { data: PHOTO, mediaType: 'text/html', at: Date.now(), src: 'share' }, 'photo: kept copy dropped (unreadable)'],
  ]) {
    const app = await pageBoot(shell);
    try {
      await ready(app, shell !== 'none');
      await ev(app, (r) => __idb('put', r), rec);
      await relaunch(app);
      await waitLine(app, 'l === ' + J(line), line);
      await ready(app, shell !== 'none');
      const m = await look(app);
      assert(m.img === null && m.kept === null && m.tab === 'log' && m.chats === 0 && !m.ops.some((o) => o === 'present coach') && !m.log.some((l) => /^photo: back from/.test(l)),
        shell + ': deleted at boot, nothing back, no chat: ' + J(Object.assign({}, m, { log: m.log.slice(0, 5) })));
      noErrors(app);
    } finally { await app.close(); }
  }
});

// ── (e) no IndexedDB ──────────────────────────────────────────────────────────────────────────────────────────────
serial('(e) IndexedDB missing, its open throwing or never answering, or its write refused for the quota: the share lands at once as it always did (the photo, the chat, the words), the boot is untouched, nothing throws, and nothing comes back after a relaunch', async () => {
  for (const [shell, how, line] of [
    ['none', 'missing', 'photo: not kept (no IndexedDB)'], ['none', 'throws', 'photo: not kept (SecurityError)'], ['none', 'silent', 'photo: not kept (open timed out)'],
    ['none', 'quota', 'photo: not kept (quota)'], ['tabs', 'missing', 'photo: not kept (no IndexedDB)'], ['tabs', 'silent', 'photo: not kept (open timed out)'],
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
      await relaunch(app);
      await ready(app, shell !== 'none');
      await settle(app, how === 'silent' ? 4300 : 200);   // a silent open's 4 s run out at boot too
      const m = await look(app);
      assert(m.img === null && m.tab === 'log' && m.chats === 0 && !m.log.some((l) => /^photo: back from/.test(l)), tag + 'nothing comes back: ' + J(Object.assign({}, m, { log: m.log.slice(0, 6), kept: !!m.kept })));
      if (how === 'missing' || how === 'quota') assert(!m.log.some((l) => /^photo: kept copy/.test(l)), tag + 'no line at boot (no IndexedDB, or nothing kept): ' + J(m.log.slice(0, 6)));
      else assert(m.log.some((l) => /^photo: kept copy not read \((SecurityError|open timed out)\)$/.test(l)), tag + 'the boot\'s read says why it read nothing: ' + J(m.log.slice(0, 6)));
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

// ── (g) a new share wins ──────────────────────────────────────────────────────────────────────────────────────────
serial('(g) a new share replaces the kept photo: two shares, then a relaunch, bring back the second (tabs)', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app, true);
    await share(app, PHOTO, WORDS);
    const s = await share(app, PHOTO2, '');
    assert(s.img === PHOTO2 && s.kept && s.kept.data === PHOTO2, 'the second share is the record: ' + J({ img: s.img, kept: s.kept && s.kept.data }));
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
      await ev(app, (r) => __idb('put', r), { data: PHOTO, mediaType: 'image/jpeg', at: Date.now() - 2 * MIN, src: 'share' });
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
      assert(m.img === PHOTO2 && m.tab === 'coach' && m.view === 'chat' && m.kept && m.kept.data === PHOTO2 && m.reads.filter((r) => r).length === 1,
        shell + ': the new share\'s photo, and its record: ' + J(Object.assign({}, m, { kept: m.kept && m.kept.data, fresh })));
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
serial('(h) the breadcrumbs say sizes and states only: the read (KB, the words\' length, the page hidden), an empty read once for a run of them, kept, back, removed, sent; never the words or the photo', async () => {
  const app = await pageBoot('none', { init: HIDDEN });
  try {
    await ready(app, false);
    await ev(app, () => { window.__vis = 'hidden'; });
    await share(app, BIG, WORDS);
    await ev(app, async () => { window.__vis = 'visible'; await checkPendingShare(); await checkPendingShare(); await __w(50); });
    const a = await lines(app);
    assert(a[0] === 'share: nothing waiting' && a[1] === 'photo: kept' && a[2] === 'share: read 952 KB, words ' + WORDS.length + ' chars, page hidden',
      'the read, kept, then one line for two empty reads: ' + J(a.slice(0, 4)));
    await ev(app, () => clearPendingImage());
    await waitLine(app, 'l === "photo: removed"', 'photo: removed');
    await share(app, PHOTO, '');
    await ev(app, async () => { document.getElementById('coach-send').click(); for (let i = 0; i < 150 && coachLoading; i++) await __w(20); await __w(80); });
    const b = await lines(app);
    assert(b[0] === 'photo: sent' && b.indexOf('share: read 0 KB, words 0 chars, page visible') >= 0 && b.indexOf('photo: removed') >= 0,
      'removed, the second read with no words, sent: ' + J(b.slice(0, 6)));
    clean(b);
    noErrors(app);
  } finally { await app.close(); }
});
