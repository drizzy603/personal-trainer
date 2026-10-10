// The coach chat as one column (web 20261010-2 and later). The owner's screenshots showed the
// conversation through the band between the composer and the tab bar, an empty band above the
// composer with the keys up, the chat header gone and text under the clock while typing, and,
// with a reply in flight after the keys went down, no tab bar and the composer on the home
// indicator.
// - M1: html.kt-chat makes #screen a column: header, a conversation that scrolls on its own
//   (.coach-msgs-area, a 16px end gap), the photo preview and the composer in flow 8px above the
//   bar (Heavyweight) or the dock (Lime). A render keeps the reader's place; a toast in the chat
//   shows under the status bar.
// - M2: while the keys are up over the chat box (a visualViewport cut), #app is laid over the
//   visual viewport (html.kb-open, --vv-top/--vv-h): the header and the status-bar mask stay, the
//   composer sits 8px above the keys. Pinch zoom and small cuts never count; leaving the tab lets
//   #app go; the touchmove guard exists only while kb-open is on.
// - M3: on a touch screen the tab bar follows the keyboard, not focus; a reply never refocuses the
//   box by script there; the hidden bar leaves the accessibility tree; reduced motion fades it.
// - Larger Text: #app stays one screen tall under the Dynamic Type root zoom (--dt-z), so the
//   composer keeps its place above the bar or dock, and a focus with no keys is never a keyboard.
// Geometry is read once the column has settled (__settle: frames until two reads agree), not after
// a fixed wait alone: on a loaded runner the re-anchoring observer can land a frame late.
const { boot, assert, run, SEED } = require('../lib/harness');

// One run at a time: several of these read timers and transitions (the tab bar back within 400ms,
// the 1s keyboard wait, frames sampled while a reply lands), and a file's runs otherwise start
// together, each with its own browser, which starves those timers on a slow runner.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}

// A scriptable visualViewport standing in for WebKit's (iOS keeps the layout viewport and pans the
// visual one over it), and a count of the non-passive touchmove listeners on the document.
const FAKE_VV = `(() => {
  const et = new EventTarget();
  const st = { h: innerHeight, top: 0, scale: 1 };
  const fake = {
    get width(){ return innerWidth; }, get height(){ return st.h; }, get offsetTop(){ return st.top; }, get offsetLeft(){ return 0; },
    get pageTop(){ return st.top; }, get pageLeft(){ return 0; }, get scale(){ return st.scale; },
    addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et), dispatchEvent: et.dispatchEvent.bind(et),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, get(){ return fake; } });
  window.__vv = {
    set(h, top, scale){ st.h = h; st.top = top; st.scale = scale || 1; et.dispatchEvent(new Event('resize')); et.dispatchEvent(new Event('scroll')); },
    reset(){ st.h = innerHeight; st.top = 0; st.scale = 1; et.dispatchEvent(new Event('resize')); et.dispatchEvent(new Event('scroll')); },
  };
  window.__tm = 0;
  // Resolves once the boxes a probe reads stop moving: two frames, then until two reads agree. A
  // starved renderer (a loaded CI runner) can run the ResizeObserver that re-anchors the
  // conversation a frame or two after a fixed wait has already measured. Each wait is capped, so a
  // page with no frames still goes on.
  window.__settle = async (probe, max) => {
    const frames = () => new Promise((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => requestAnimationFrame(fin)); setTimeout(fin, 120); });
    let prev = null;
    for (let k = 0; k < (max || 12); k++) {
      await frames();
      const cur = JSON.stringify(probe());
      if (cur === prev) return;
      prev = cur;
    }
  };
  const add = Document.prototype.addEventListener, rem = Document.prototype.removeEventListener;
  const active = (o) => !(o && typeof o === 'object' && o.passive === true);
  Document.prototype.addEventListener = function (type, fn, o) { if (type === 'touchmove' && active(o)) window.__tm++; return add.apply(this, arguments); };
  Document.prototype.removeEventListener = function (type, fn, o) { if (type === 'touchmove' && active(o)) window.__tm--; return rem.apply(this, arguments); };
})();`;
const INSET = '#screen{padding-top:59px !important} body::before{height:59px !important}';
const TOUCH = { hasTouch: true, isMobile: true };

const LONG_REPLY = [
  "Here's where each plateau stands:",
  '',
  '- **Bench plateau: watching.** Two weeks into the new top set is too early to judge, so nothing has changed since it started.',
  '- **DB Lateral Raise plateau: changed.** Swapped to **Cable Lateral Raise** (constant tension through the full range), starting at 20 lb, building to 25 lb by week 12.',
  '',
  'Pull Up and Hammer Curl plateaus are already being addressed. Give those a couple more weeks before further changes.',
].join('\n');
const PROGRESS = [
  '%%type: Progress check',
  '%%metric: Bench Press | 225 lb x 4 | vs 230 x 6 target | -5 lb | warn',
  '%%metric: Latest run | 12:39/mi @ 171bpm | vs 11:00 goal | +1:39 | warn',
  '%%metric: Body weight | 221.6 lb | vs 205 goal | +16.6 | warn',
  '**Overall: solid consistency, with room to improve on the run side.**',
  "- **Lifting:** You're hitting your sessions and setting PRs on the accessories.",
  '- **Running:** Your last six runs range from 11:36 to 13:15/mi, with a heart rate of about 170 on each.',
  '- **Body weight:** It has crept from 215 to 221.6 lb since mid-September.',
  '- **Recovery:** Readiness is 70/100. HRV is down 13%, so keep the effort controlled.',
  '%%takeaway: Strength is on track. Running needs slower easy days.',
  '%%action: Lower my run intensity | Lower my run intensity for the next two weeks',
  '%%action: Log body weight | Log my body weight',
].join('\n');
const SWAP = { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'DB Lateral Raise', action: 'swap', rename_to: 'Cable Lateral Raise', weight: 20 }, result: { ok: true }, units: { w: 'lb', d: 'mi' } };
const LONG = [
  { role: 'user', content: 'Any plateaus I should deal with this week?' },
  { role: 'assistant', content: LONG_REPLY, _tools: [SWAP], _undo: 'coach:t117' },
  { role: 'user', content: 'How am i doing?' },
  { role: 'assistant', content: PROGRESS },
  { role: 'user', content: 'And my squat?' },
  { role: 'assistant', content: LONG_REPLY },
];
const SHORT = [{ role: 'user', content: 'How was my week?' }, { role: 'assistant', content: 'Four sessions, two PRs. Keep the same plan next week.' }];

// In the page: the boxes that matter, in CSS px of the viewport.
const GEO = `() => {
  const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; };
  const list = document.querySelector('.coach-msgs-area');
  let last = null;
  if (list) {
    const kids = [...list.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.height > 1 && b.width > 1; });
    if (kids.length) last = Math.max.apply(null, kids.map((e) => e.getBoundingClientRect().bottom));
  }
  const tabs = document.getElementById('tabs'), tcs = getComputedStyle(tabs), s = document.getElementById('screen');
  return {
    ih: innerHeight, iw: innerWidth, list: R(list), last, row: R(document.querySelector('.coach-input-row')),
    prev: R(document.querySelector('.coach-img-preview')), stick: R(document.querySelector('.coach-chat-stick')),
    app: R(document.getElementById('app')), tabs: R(tabs),
    tabsCs: { opacity: parseFloat(tcs.opacity), visibility: tcs.visibility, events: tcs.pointerEvents, transform: tcs.transform },
    scroll: list ? { top: list.scrollTop, max: list.scrollHeight - list.clientHeight, h: list.scrollHeight, ch: list.clientHeight } : null,
    screen: { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth },
    cls: ['kt-chat', 'chat-typing', 'kb-open'].filter((c) => document.documentElement.classList.contains(c)),
    appPos: getComputedStyle(document.getElementById('app')).position,
    vv: { h: visualViewport.height, top: visualViewport.offsetTop },
    active: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
  };
}`;
const near = (a, b, tol = 1) => a != null && b != null && Math.abs(a - b) <= tol;

async function bootChat(room, size, extra = {}) {
  const app = await boot(Object.assign({
    native: true,
    seed: Object.assign({ kt_theme: room, kt_apikey: 'sk-ant-test', kt_coach_msgs: JSON.stringify(LONG) }, extra.seed || {}),
    page: Object.assign({ viewport: size }, extra.touch ? TOUCH : {}),
    init: FAKE_VV + ';window.__LONG=' + JSON.stringify(LONG) + ';window.__SHORT=' + JSON.stringify(SHORT) + ';window.__SWAP=' + JSON.stringify(SWAP) + ';',
  }));
  await app.page.addStyleTag({ content: INSET });
  return app;
}
const open = (page) => page.evaluate(async () => {
  switchTab('coach'); coachView = 'chat'; render();
  await new Promise((r) => setTimeout(r, 160));
});

// ── M1 ─────────────────────────────────────────────────────────────────────────
serial('M1: the chat is one column; the composer sits 8px above the bar or dock and nothing shows through', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 700 }]) {
      const tag = room + ' ' + size.width + ': ';
      const app = await bootChat(room, size);
      try {
        await open(app.page);
        const out = await app.page.evaluate(async (GEO) => {
          const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const settle = () => window.__settle(g);   // after anything that resizes the column
          const r = {};
          await settle();
          r.long = g();
          const gy = (r.long.row.bottom + r.long.tabs.top) / 2;
          r.gapHits = [24, r.long.iw / 2, r.long.iw - 24].map((x) => document.elementsFromPoint(x, gy).some((e) => e.closest && e.closest('.coach-msgs-area')));
          // nothing of the conversation is painted below the scroller (behind the composer, the bar or the dock)
          r.belowList = document.elementsFromPoint(r.long.iw / 2, r.long.row.top + 4).some((e) => e.closest && e.closest('.coach-msgs-wrap'));
          r.dock = { l: r.long.tabs.left, r: r.long.tabs.right, rowL: r.long.row.left, rowR: r.long.row.right };
          // a 2-message chat does not scroll and hugs the composer
          coachMessages = JSON.parse(JSON.stringify(window.__SHORT)); render(); await wait(120); await settle();
          r.short = g();
          // the empty chat, an error with Try again, Thinking with live pills
          coachMessages = []; render(); await wait(120); await settle(); r.empty = g();
          coachMessages = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true }]; render(); await wait(120); await settle(); r.error = g();
          coachMessages = JSON.parse(JSON.stringify(window.__LONG)); coachLoading = true; _runningTools = [window.__SWAP]; render(); await wait(160); await settle(); r.thinking = g();
          coachLoading = false; _runningTools = []; render(); await wait(120);
          // a 6-line draft grows the composer: the newest message stays 16px above it
          const i = document.getElementById('coach-input');
          i.value = 'one\ntwo\nthree\nfour\nfive\nsix'; i.dispatchEvent(new Event('input', { bubbles: true })); await wait(160); await settle();
          r.grown = g();
          i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); await wait(120);
          // a photo: the conversation ends 16px above the preview, the preview 8px above the composer
          pendingImage = { data: 'x', mediaType: 'image/png', previewUrl: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#7a8fa6"/></svg>') };
          render(); await wait(200); await settle();
          r.photo = g();
          const pv = document.querySelector('.coach-img-preview');
          r.photoBg = pv && getComputedStyle(pv).backgroundColor;
          r.cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
          r.photoX = (() => { const b = document.querySelector('.coach-img-x'); return b && { name: b.getAttribute('aria-label'), alt: pv.querySelector('img').getAttribute('alt') }; })();
          pendingImage = null; render(); await wait(120);
          // intake
          _setIntakeMode(true); coachMessages = [{ role: 'user', content: 'I want to generate my training programme.' }, { role: 'assistant', content: 'What is your main goal?' }]; render(); await wait(120); await settle();
          r.intake = g();
          _setIntakeMode(false);
          return r;
        }, GEO).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        const L = out.long;
        if (room === 'heavyweight') {
          assert(near(L.row.bottom, L.ih - 86) && near(L.tabs.top, L.ih - 78), tag + 'the composer ends 8px above the flat bar: ' + JSON.stringify([L.row.bottom, L.tabs.top, L.ih]));
        } else {
          assert(near(L.row.bottom, L.ih - 94) && near(L.tabs.top, L.ih - 86), tag + 'the composer ends 8px above the dock: ' + JSON.stringify([L.row.bottom, L.tabs.top, L.ih]));
          assert(near(out.dock.rowL, out.dock.l) && near(out.dock.rowR, out.dock.r), tag + 'the composer takes the dock\'s edges: ' + JSON.stringify(out.dock));
        }
        assert(!out.gapHits.some(Boolean) && !out.belowList, tag + 'nothing of the conversation shows between the composer and the bar, or behind the composer: ' + JSON.stringify([out.gapHits, out.belowList]));
        assert(L.list.bottom <= L.row.top + 0.5, tag + 'the conversation ends at the composer: ' + JSON.stringify([L.list.bottom, L.row.top]));
        assert(near(L.scroll.top, L.scroll.max, 1) && near(L.last, L.row.top - 16), tag + 'a long chat opens at its end, 16px above the composer: ' + JSON.stringify([L.scroll, L.last, L.row.top]));
        for (const k of ['short', 'empty', 'error', 'thinking', 'grown', 'intake']) {
          assert(near(out[k].last, out[k].row.top - 16), tag + k + ': the last item ends 16px above the composer: ' + JSON.stringify([out[k].last, out[k].row.top]));
        }
        assert(out.short.scroll.h <= out.short.scroll.ch + 1 && out.short.screen.sh === out.short.screen.ch, tag + 'a 2-message chat does not scroll, nor does #screen: ' + JSON.stringify([out.short.scroll, out.short.screen]));
        assert(out.grown.row.h > L.row.h + 40, tag + 'the draft grew the composer: ' + JSON.stringify([L.row.h, out.grown.row.h]));
        const P = out.photo;
        assert(P.prev && near(P.last, P.prev.top - 16) && near(P.prev.bottom, P.row.top - 8), tag + 'a photo sits 8px above the composer, the conversation 16px above it: ' + JSON.stringify([P.last, P.prev, P.row.top]));
        assert(out.photoX && out.photoX.name === 'Remove photo' && out.photoX.alt === 'Photo to send', tag + 'the photo and its button are named: ' + JSON.stringify(out.photoX));
        assert(room === 'heavyweight' ? out.photoBg === 'rgb(255, 255, 255)' : out.photoBg === 'rgb(21, 21, 23)', tag + 'the preview is the room\'s card: ' + out.photoBg);
        assert(out.long.screen.sw <= out.long.screen.cw, tag + '#screen has no horizontal overflow: ' + JSON.stringify(out.long.screen));
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

serial('M1: a render keeps the reader\'s place; the end stays pinned; the hub opens at its top; a toast clears the composer', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
      const L = () => document.querySelector('html.kt-chat .coach-msgs-area');
      switchTab('coach'); coachView = 'home'; render(); await wait(60);
      r.hub = { chat: document.documentElement.classList.contains('kt-chat'), top: document.getElementById('screen').scrollTop };
      openCoachChat(); await wait(160);
      r.opened = { top: L().scrollTop, max: L().scrollHeight - L().clientHeight };
      // scrolled up: render, the model switch and Keep changes keep the place
      L().scrollTop = 120; await wait(60);
      render(); await wait(150); r.afterRender = L().scrollTop;
      setCoachModel(coachModel.indexOf('haiku') !== -1 ? 'claude-sonnet-5-5' : 'claude-haiku-4-5-20251001'); await wait(150); r.afterModel = L().scrollTop;
      const i = coachMessages.findIndex((m) => m._tools); _ledgerKeep(i); await wait(150);
      r.afterKeep = { top: L().scrollTop, max: L().scrollHeight - L().clientHeight };
      // within 80px of the end a render stays at the end, also when a message arrives
      L().scrollTop = L().scrollHeight - L().clientHeight - 50; await wait(60);
      coachMessages.push({ role: 'user', content: 'One more question' }); render(); await wait(150);
      r.pinned = { top: L().scrollTop, max: L().scrollHeight - L().clientHeight };
      // a toast in the chat shows under the status bar, never over the composer
      showToast('Coach model: Sonnet 5.5'); await wait(400);
      const t = document.getElementById('toast').getBoundingClientRect(), row = document.querySelector('.coach-input-row').getBoundingClientRect();
      r.toast = { top: t.top, bottom: t.bottom, rowTop: row.top };
      // back to the hub: #screen scrolls again
      coachView = 'home'; render(); await wait(60);
      r.hubAgain = { chat: document.documentElement.classList.contains('kt-chat'), overflow: getComputedStyle(document.getElementById('screen')).overflowY };
      return r;
    });
    assert(!out.hub.chat && out.hub.top === 0, 'the hub is not the chat column and opens at its top: ' + JSON.stringify(out.hub));
    assert(Math.abs(out.opened.top - out.opened.max) <= 1, 'opening the chat lands at its end: ' + JSON.stringify(out.opened));
    assert(Math.abs(out.afterRender - 120) <= 2 && Math.abs(out.afterModel - 120) <= 2, 'a render and the model switch keep the place: ' + JSON.stringify([out.afterRender, out.afterModel]));
    assert(Math.abs(out.afterKeep.top - 120) <= 2 || Math.abs(out.afterKeep.top - out.afterKeep.max) <= 2, 'Keep changes keeps the place (or the new end): ' + JSON.stringify(out.afterKeep));
    assert(Math.abs(out.pinned.top - out.pinned.max) <= 1, 'near the end, a render stays at the end: ' + JSON.stringify(out.pinned));
    assert(out.toast.top < 120 && out.toast.bottom < out.toast.rowTop, 'the toast shows under the status bar: ' + JSON.stringify(out.toast));
    assert(!out.hubAgain.chat && out.hubAgain.overflow === 'auto', 'the hub scrolls #screen: ' + JSON.stringify(out.hubAgain));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── M2 ─────────────────────────────────────────────────────────────────────────
serial('M2: with the keys up the chat is laid over the visual viewport; pinch zoom and small cuts never count', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const [size, kb] of [[{ width: 430, height: 932 }, 347], [{ width: 390, height: 844 }, 336], [{ width: 320, height: 700 }, 290]]) {
      const tag = room + ' ' + size.width + ': ';
      const app = await bootChat(room, size, { touch: true });
      try {
        await open(app.page);
        const out = await app.page.evaluate(async ({ GEO, kb }) => {
          const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = { pans: [] };
          r.tmIdle = window.__tm;
          document.getElementById('coach-input').focus(); await wait(80);
          for (const pan of [kb, Math.round(kb / 2), 0]) {
            __vv.set(innerHeight - kb, pan); await wait(120); await window.__settle(g);
            const x = g();
            const atTop = document.elementFromPoint(x.iw / 2, pan + 30);
            r.pans.push(Object.assign(x, { pan, maskTop: !(atTop && atTop.closest && atTop.closest('.coach-msgs-area')), tm: window.__tm,
              back: getComputedStyle(document.querySelector('.coach-chat-stick > .screen-hd')).display }));
          }
          // the Dynamic Type root zoom: #app still covers the visual viewport exactly
          applyDynamicType(1.25); __vv.set(innerHeight - kb, kb - 1); await wait(140); await window.__settle(g);
          r.zoom = g();
          applyDynamicType(1); __vv.set(innerHeight - kb, kb); await wait(140);
          // leaving the tab with the keys up lets #app go
          switchTab('log'); await wait(140);
          r.left = { cls: g().cls, pos: getComputedStyle(document.getElementById('app')).position, h: document.getElementById('app').getBoundingClientRect().height, tm: window.__tm };
          __vv.reset(); await wait(60);
          // pinch zoom (scale 1.5) and a 60px cut are not a keyboard
          switchTab('coach'); coachView = 'chat'; render(); await wait(120);
          document.getElementById('coach-input').focus(); await wait(60);
          __vv.set(innerHeight / 1.5, 100, 1.5); await wait(120); r.pinch = g().cls;
          __vv.set(innerHeight - 60, 60); await wait(120); r.small = g().cls;
          __vv.reset(); await wait(60);
          return r;
        }, { GEO, kb }).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        assert(out.tmIdle === 0, tag + 'no non-passive touchmove listener while the keys are down: ' + out.tmIdle);
        for (const p of out.pans) {
          const t = tag + 'pan ' + p.pan + ': ';
          assert(p.cls.indexOf('kb-open') >= 0 && p.appPos === 'fixed', t + 'kb-open lays #app over the visual viewport: ' + JSON.stringify([p.cls, p.appPos]));
          assert(near(p.app.top, p.vv.top) && near(p.app.h, p.vv.h), t + '#app covers the visual viewport: ' + JSON.stringify([p.app, p.vv]));
          assert(near(p.stick.top, p.pan + 59), t + 'the header stays under the status bar: ' + JSON.stringify([p.stick, p.pan]));
          assert(p.maskTop, t + 'the status-bar strip is masked, not conversation');
          assert(near(p.row.bottom, p.vv.top + p.vv.h - 8), t + 'the composer sits 8px above the keys: ' + JSON.stringify([p.row, p.vv]));
          assert(near(p.last, p.row.top - 16) && near(p.scroll.top, p.scroll.max, 1), t + 'the newest message stays 16px above the composer: ' + JSON.stringify([p.last, p.row.top, p.scroll]));
          assert(p.back === 'none', t + 'the Back row stands down while typing');
          assert(p.tm === 1, t + 'the touchmove guard is on only now: ' + p.tm);
        }
        assert(near(out.zoom.app.top, out.zoom.vv.top, 1.5) && near(out.zoom.app.h, out.zoom.vv.h, 1.5), tag + 'at root zoom 1.25 #app covers exactly the visual viewport: ' + JSON.stringify([out.zoom.app, out.zoom.vv]));
        assert(out.left.cls.indexOf('kb-open') < 0 && out.left.cls.indexOf('kt-chat') < 0 && out.left.pos === 'relative' && near(out.left.h, size.height) && out.left.tm === 0, tag + 'leaving the tab lets #app go: ' + JSON.stringify(out.left));
        assert(out.pinch.indexOf('kb-open') < 0 && out.small.indexOf('kb-open') < 0, tag + 'pinch zoom and a small cut are not a keyboard: ' + JSON.stringify([out.pinch, out.small]));
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

// ── Larger Text ────────────────────────────────────────────────────────────────
// The Dynamic Type root zoom scales 100dvh too: #app came out a quarter screen too tall at 125%, the
// in-flow composer sat under the bar (112%) or below the screen (125%), and the keyboard binding,
// scaling the layout height by the zoom, read a 211px keyboard on a focus with no keys that never
// went away (no tabs, no Back). #app divides its height by --dt-z; the binding compares CSS px.
serial('Larger Text: the column is one screen tall, the composer sits 8pt above the bar or dock, and a focus with no keys is not a keyboard', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const [size, kb] of [[{ width: 390, height: 844 }, 336], [{ width: 320, height: 700 }, 290]]) {
      const app = await bootChat(room, size, { touch: true });
      try {
        const out = await app.page.evaluate(async ({ GEO, kb }) => {
          const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms)), res = {};
          const settle = () => window.__settle(g);
          for (const zoom of [1.12, 1.25]) {
            const r = res[zoom] = {};
            applyDynamicType(zoom); switchTab('coach'); coachView = 'chat'; render(); await wait(160); await settle();
            r.idle = g();
            r.dtz = document.documentElement.style.getPropertyValue('--dt-z');
            // a focus with no keys behind it (VoiceOver, a hardware keyboard, a scripted focus)
            document.getElementById('coach-input').focus(); await wait(200);
            r.focus = g();
            // the keys come up, then go down while the box keeps focus, then the box lets go
            __vv.set(innerHeight - kb, kb); await wait(300); await settle(); r.up = g();
            __vv.reset(); await wait(400); r.downFocused = g();
            document.getElementById('coach-input').blur(); await wait(400); await settle(); r.down = g();
          }
          applyDynamicType(1); render(); await wait(120);
          res.back = { dtz: document.documentElement.style.getPropertyValue('--dt-z'), app: document.getElementById('app').getBoundingClientRect().height, ih: innerHeight };
          return res;
        }, { GEO, kb }).catch((e) => ({ err: String(e) }));
        assert(!out.err, room + ' ' + size.width + ': ' + out.err);
        for (const zoom of [1.12, 1.25]) {
          const tag = room + ' ' + size.width + ' zoom ' + zoom + ': ', r = out[zoom], I = r.idle;
          assert(r.dtz === String(zoom) && near(I.app.top, 0) && near(I.app.h, I.ih), tag + '#app is one screen tall: ' + JSON.stringify([r.dtz, I.app, I.ih]));
          assert(near(I.tabs.top - I.row.bottom, 8 * zoom, 1.5) && I.row.bottom <= I.ih, tag + 'the composer sits 8pt above the bar or dock: ' + JSON.stringify([I.row, I.tabs.top, I.ih]));
          if (room === 'dark') assert(near(I.row.left, I.tabs.left, 1.5) && near(I.row.right, I.tabs.right, 1.5), tag + 'the composer takes the dock\'s edges: ' + JSON.stringify([I.row, I.tabs]));
          assert(near(I.last, I.row.top - 16 * zoom, 1.5) && I.list.bottom <= I.row.top + 0.5, tag + 'the conversation ends 16pt above the composer: ' + JSON.stringify([I.last, I.row.top]));
          assert(r.focus.cls.indexOf('kb-open') < 0 && r.focus.appPos === 'relative', tag + 'a focus with no keys is not a keyboard: ' + JSON.stringify([r.focus.cls, r.focus.appPos]));
          assert(r.up.cls.indexOf('kb-open') >= 0 && near(r.up.app.top, r.up.vv.top, 1.5) && near(r.up.app.h, r.up.vv.h, 1.5) && near(r.up.row.bottom, r.up.vv.top + r.up.vv.h - 8 * zoom, 1.5), tag + 'keys up: #app covers the visual viewport, the composer on the keys: ' + JSON.stringify([r.up.cls, r.up.app, r.up.vv, r.up.row]));
          const D = r.downFocused;
          assert(D.cls.indexOf('kb-open') < 0 && D.cls.indexOf('chat-typing') < 0 && D.tabsCs.visibility === 'visible' && D.tabsCs.opacity === 1, tag + 'keys down with the box still focused: the tabs are back: ' + JSON.stringify([D.cls, D.tabsCs]));
          assert(r.down.cls.join() === 'kt-chat' && near(r.down.tabs.top - r.down.row.bottom, 8 * zoom, 1.5), tag + 'and the composer is back above the bar: ' + JSON.stringify([r.down.cls, r.down.row, r.down.tabs]));
        }
        assert(out.back.dtz === '' && near(out.back.app, out.back.ih), room + ' ' + size.width + ': back at 100% the column is the screen: ' + JSON.stringify(out.back));
        assert(app.errors.length === 0, room + ' ' + size.width + ': no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

// ── M3 ─────────────────────────────────────────────────────────────────────────
const MOCK_FETCH = `(delay) => {
  window.fetch = async (url) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    await new Promise((r) => setTimeout(r, delay));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Squat is moving well.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}`;
serial('M3: on a touch screen the tab bar follows the keyboard; a reply never refocuses the box', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 }, { touch: true });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async ({ GEO, MOCK_FETCH }) => {
        const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {}, KB = 336;
        r.coarse = _coarsePointer();
        eval(MOCK_FETCH)(900);
        const i = document.getElementById('coach-input');
        i.focus(); await wait(60);
        __vv.set(innerHeight - KB, KB); await wait(300);
        r.up = g();
        // Send, then the keys go down with the reply in flight
        i.value = 'And my squat?';
        const sent = sendCoachMessage();
        await wait(30);
        const i2 = document.getElementById('coach-input'); if (i2) i2.blur();
        __vv.reset(); await wait(400);
        r.inflight = g();
        await sent; await wait(200);
        r.landed = g();
        // focus with no keyboard behind it: the tabs are back within 1.3 s
        document.getElementById('coach-input').focus(); await wait(150);
        r.focus150 = g().cls;
        await wait(1150);
        r.focus1300 = g().cls;
        // the keys rise over the already-focused box (no focusin)
        __vv.set(innerHeight - KB, KB); await wait(300);   // visibility flips once the .22s slide is done
        r.rise = g();
        __vv.reset(); document.getElementById('coach-input').blur(); await wait(500);
        r.down = g();
        return r;
      }, { GEO, MOCK_FETCH }).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      assert(out.coarse, tag + 'the page sees a coarse pointer');
      assert(out.up.cls.indexOf('kb-open') >= 0 && out.up.cls.indexOf('chat-typing') >= 0 && out.up.tabsCs.visibility === 'hidden' && out.up.tabsCs.events === 'none', tag + 'keys up: the bar stands down and leaves the tree: ' + JSON.stringify([out.up.cls, out.up.tabsCs]));
      const F = out.inflight, bottom = room === 'heavyweight' ? F.ih - 86 : F.ih - 94;
      assert(F.cls.indexOf('chat-typing') < 0 && F.tabsCs.opacity === 1 && F.tabsCs.visibility === 'visible' && F.tabsCs.events !== 'none', tag + 'keys down mid-reply: the bar is back within 400ms: ' + JSON.stringify([F.cls, F.tabsCs]));
      assert(near(F.row.bottom, bottom), tag + 'the composer sits above the bar, not on the home indicator: ' + JSON.stringify([F.row.bottom, bottom]));
      assert(out.landed.active !== 'coach-input' && out.landed.cls.indexOf('chat-typing') < 0 && near(out.landed.row.bottom, bottom), tag + 'the reply lands without refocusing the box: ' + JSON.stringify([out.landed.active, out.landed.cls]));
      assert(out.focus150.indexOf('chat-typing') >= 0 && out.focus1300.indexOf('chat-typing') < 0, tag + 'a focus with no keys gives the tabs back: ' + JSON.stringify([out.focus150, out.focus1300]));
      assert(out.rise.cls.indexOf('kb-open') >= 0 && out.rise.cls.indexOf('chat-typing') >= 0 && out.rise.tabsCs.visibility === 'hidden', tag + 'keys rising over a focused box hide the bar: ' + JSON.stringify(out.rise.cls));
      assert(out.down.cls.length === 1 && out.down.tabsCs.visibility === 'visible', tag + 'and it all comes back: ' + JSON.stringify(out.down.cls));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// Every render gave a focused box its focus back by script. On a touch screen that raises no keys:
// with none up (a hardware keyboard's focus, or WebKit dropping the keys mid-reply) the tab bar went
// for a second on every render and the reply landed on a focused box with no keyboard.
serial('M3: on a touch screen a render gives focus back only while the keys are up or the box is being typed in, and never moves the bar', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 }, { touch: true });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async ({ GEO, MOCK_FETCH }) => {
        const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {}, KB = 336;
        const box = () => document.getElementById('coach-input');
        // every class list <html> wore while fn ran (sampled every 20ms)
        const watch = async (fn, tail) => { const seen = new Set(); const t = setInterval(() => seen.add(document.documentElement.className), 20); await fn(); await wait(tail); clearInterval(t); return [...seen]; };
        // a focus with no keys; once the tabs are back, three renders
        box().focus(); await wait(1300);
        r.settled = g().cls;
        r.renders = await watch(async () => { for (let k = 0; k < 3; k++) { render(); await wait(250); } }, 300);
        r.afterRenders = g();
        // keys up: a render keeps the box focused and the keys up
        box().focus(); __vv.set(innerHeight - KB, KB); await wait(300);
        render(); await wait(100); render(); await wait(200);
        r.keysUp = g();
        // a hardware keyboard (no keyboard-sized cut) typing into the box: a render keeps its focus, quietly
        __vv.reset(); await wait(300); box().blur(); await wait(400);
        box().focus(); await wait(1300);
        box().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        r.typing = await watch(async () => { render(); await wait(100); render(); }, 300);
        r.afterTyping = g();
        // a reply sent with the keys up; the keys go but the box keeps focus; renders while it is in flight
        box().blur(); await wait(300);
        eval(MOCK_FETCH)(1200);
        box().focus(); __vv.set(innerHeight - KB, KB); await wait(300);
        box().value = 'And my squat?';
        const sent = sendCoachMessage();
        await wait(60);
        __vv.reset(); await wait(300);
        r.reply = await watch(async () => { render(); await wait(250); render(); await wait(250); }, 50);
        r.midReply = g();
        await sent; await wait(250);
        r.landed = g();
        return r;
      }, { GEO, MOCK_FETCH }).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      const typing = (list) => list.some((c) => / chat-typing\b|^chat-typing\b/.test(c));
      assert(out.settled.indexOf('chat-typing') < 0, tag + 'a focus with no keys gives the tabs back: ' + JSON.stringify(out.settled));
      assert(!typing(out.renders) && out.afterRenders.active !== 'coach-input' && out.afterRenders.tabsCs.visibility === 'visible', tag + 'renders over a keyless focus neither hide the bar nor keep the focus: ' + JSON.stringify([out.renders, out.afterRenders.active]));
      assert(out.keysUp.active === 'coach-input' && out.keysUp.cls.indexOf('kb-open') >= 0 && out.keysUp.cls.indexOf('chat-typing') >= 0, tag + 'with the keys up a render keeps the box focused: ' + JSON.stringify([out.keysUp.active, out.keysUp.cls]));
      assert(!typing(out.typing) && out.afterTyping.active === 'coach-input' && out.afterTyping.tabsCs.visibility === 'visible', tag + 'a hardware keyboard keeps the box through a render, and the bar stays: ' + JSON.stringify([out.typing, out.afterTyping.active]));
      assert(!typing(out.reply) && out.midReply.active !== 'coach-input' && out.midReply.tabsCs.visibility === 'visible', tag + 'keys gone mid-reply: renders let the box go and the bar stays: ' + JSON.stringify([out.reply, out.midReply.active]));
      assert(out.landed.active !== 'coach-input' && out.landed.cls.indexOf('chat-typing') < 0 && out.landed.tabsCs.visibility === 'visible', tag + 'the reply lands on an unfocused box with the tabs up: ' + JSON.stringify([out.landed.active, out.landed.cls]));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

serial('M3: reduced motion fades the bar without sliding it; a desktop send still refocuses the box', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 });
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await open(app.page);
    const out = await app.page.evaluate(async (MOCK_FETCH) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
      eval(MOCK_FETCH)(200);
      const i = document.getElementById('coach-input');
      i.focus(); await wait(300);
      const cs = getComputedStyle(document.getElementById('tabs'));
      r.hidden = { transform: cs.transform, opacity: cs.opacity, visibility: cs.visibility };
      i.value = 'Desktop question'; await sendCoachMessage(); await wait(200);
      r.refocused = document.activeElement && document.activeElement.id;
      return r;
    }, MOCK_FETCH);
    const m = /matrix\(([^)]+)\)/.exec(out.hidden.transform), ty = m ? parseFloat(m[1].split(',')[5]) : 0;
    assert(ty === 0 && out.hidden.opacity === '0' && out.hidden.visibility === 'hidden', 'the bar fades in place: ' + JSON.stringify(out.hidden));
    assert(out.refocused === 'coach-input', 'a fine pointer send from the box returns focus to it: ' + out.refocused);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── M4 ─────────────────────────────────────────────────────────────────────────
const rgbOf = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lumOf = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratioOf = (fg, bg) => { const a = lumOf(rgbOf(fg)), b = lumOf(rgbOf(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

serial('M4: the composer is one field with 44pt controls and an honest Send / Stop', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        const B = (el) => el.getBoundingClientRect();
        const i = document.getElementById('coach-input'), row = document.querySelector('.coach-input-row');
        const att = document.querySelector('.coach-attach'), send = () => document.getElementById('coach-send');
        r.rest = { rowH: B(row).height, att: [B(att).width, B(att).height], send: [B(send()).width, B(send()).height], font: getComputedStyle(i).fontSize,
          attName: att.getAttribute('aria-label'), boxName: i.getAttribute('aria-label') };
        // focused: no ring inside the composer; the row carries it
        i.focus(); await wait(60);
        const ics = getComputedStyle(i), rcs = getComputedStyle(row);
        r.focus = { outline: ics.outlineStyle, shadow: ics.boxShadow, bg: ics.backgroundColor, border: rcs.borderTopColor, ring: rcs.boxShadow, padL: parseFloat(ics.paddingLeft) };
        r.attColor = getComputedStyle(att).color; r.rowBg = rcs.backgroundColor;
        // Send: disabled on an empty box, enabled by one character or by a photo
        r.empty = { disabled: send().disabled, name: send().getAttribute('aria-label') };
        // how Send looks at rest (disabled) and with something to send
        const look = () => { const cs = getComputedStyle(send()), svg = send().querySelector('svg'); return { bg: cs.backgroundColor, color: svg ? getComputedStyle(svg).color : cs.color, opacity: cs.opacity }; };
        r.restLook = look();
        i.value = 'x'; i.dispatchEvent(new Event('input', { bubbles: true })); r.typed = send().disabled; r.readyLook = look();
        i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); r.cleared = send().disabled;
        pendingImage = { data: 'x', mediaType: 'image/gif', previewUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }; render(); await wait(60);
        r.photo = send().disabled; pendingImage = null; render(); await wait(60);
        // a 4-line draft: the buttons stay by the last line, 7px off the row's bottom
        const i2 = document.getElementById('coach-input');
        i2.value = 'one\ntwo\nthree\nfour'; i2.dispatchEvent(new Event('input', { bubbles: true })); await wait(60);
        const rb = B(document.querySelector('.coach-input-row')), sb = B(send());
        r.fourLine = { gap: rb.bottom - sb.bottom, rowH: rb.height };
        i2.value = ''; i2.dispatchEvent(new Event('input', { bubbles: true }));
        // in flight: Stop in Send's place and no button in the Thinking row; Stop stops
        coachLoading = true; render(); await wait(60);
        r.loading = { name: send().getAttribute('aria-label'), disabled: send().disabled, onclick: send().getAttribute('onclick'),
          thinkingButtons: document.querySelectorAll('.typing-wrap button').length };
        send().click(); await wait(60);
        r.stopped = { loading: coachLoading, last: coachMessages[coachMessages.length - 1].content, name: send().getAttribute('aria-label') };
        // keys: Enter mid-composition and Shift+Enter do not send; Enter, Cmd+Enter and Ctrl+Enter do
        const real = window.sendCoachMessage; let calls = 0; window.sendCoachMessage = () => { calls++; };
        const key = (o) => { const e = new KeyboardEvent('keydown', Object.assign({ key: 'Enter', bubbles: true, cancelable: true }, o)); document.getElementById('coach-input').dispatchEvent(e); return e.defaultPrevented; };
        r.keys = { composing: key({ isComposing: true }), shift: key({ shiftKey: true }), afterNoSend: calls };
        key({}); key({ metaKey: true }); key({ ctrlKey: true });
        r.keys.sent = calls; window.sendCoachMessage = real;
        // intake: no attach button, the text 14px+ inside the composer
        _setIntakeMode(true); render(); await wait(60);
        const ii = document.getElementById('coach-input'), ir = document.querySelector('.coach-input-row');
        r.intake = { attach: !!document.querySelector('.coach-attach'), inset: B(ii).left + parseFloat(getComputedStyle(ii).paddingLeft) - B(ir).left - 1, name: ii.getAttribute('aria-label') };
        _setIntakeMode(false); render();
        return r;
      }).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      assert(Math.abs(out.rest.rowH - 58) <= 1 && out.rest.att.every((v) => v === 44) && out.rest.send.every((v) => v === 44), tag + 'a one-line composer is 58px with 44pt attach and send: ' + JSON.stringify(out.rest));
      assert(out.rest.font === '16px' && out.rest.attName === 'Attach photo' && out.rest.boxName === 'Message the coach', tag + 'the box is 16px and named, attach is named: ' + JSON.stringify(out.rest));
      assert(out.focus.outline === 'none' && out.focus.shadow === 'none', tag + 'no ring is drawn inside the composer: ' + JSON.stringify(out.focus));
      const want = room === 'heavyweight' ? 'rgb(10, 67, 245)' : 'rgb(185, 185, 190)';
      assert(out.focus.border === want && /inset/.test(out.focus.ring) && /1px/.test(out.focus.ring), tag + 'the row carries the focus ring: ' + JSON.stringify([out.focus.border, out.focus.ring]));
      assert(out.focus.bg === 'rgba(0, 0, 0, 0)', tag + 'the box has no surface of its own: ' + out.focus.bg);
      assert(out.focus.padL >= 8, tag + 'the caret sits 8px+ inside the box: ' + out.focus.padL);
      if (room === 'heavyweight') assert(ratioOf(out.attColor, out.rowBg) >= 3, tag + 'the attach icon has 3:1 on the composer: ' + ratioOf(out.attColor, out.rowBg).toFixed(2));
      assert(out.empty.disabled && out.empty.name === 'Send message' && !out.typed && out.cleared && !out.photo, tag + 'Send is disabled only with nothing to send: ' + JSON.stringify([out.empty, out.typed, out.cleared, out.photo]));
      // Lime's resting Send was lime at 30% over near-black, an olive disc on every visit: it rests
      // neutral (the raised surface, a muted arrow) and turns lime with something to send.
      if (room === 'dark') {
        assert(out.restLook.opacity === '1' && out.restLook.bg === 'rgb(30, 30, 33)' && out.restLook.color === 'rgb(140, 140, 145)', tag + 'Send rests neutral, not dimmed lime: ' + JSON.stringify(out.restLook));
        assert(ratioOf(out.restLook.color, out.restLook.bg) >= 3, tag + 'its arrow still reads: ' + ratioOf(out.restLook.color, out.restLook.bg).toFixed(2));
        assert(out.readyLook.bg === 'rgb(216, 255, 99)' && out.readyLook.opacity === '1', tag + 'with something to send it is lime: ' + JSON.stringify(out.readyLook));
      } else {
        assert(out.restLook.bg === 'rgb(10, 67, 245)' && out.restLook.opacity === '0.3' && out.readyLook.opacity === '1', tag + 'Heavyweight keeps its pale blue rest: ' + JSON.stringify([out.restLook, out.readyLook]));
      }
      assert(Math.abs(out.fourLine.gap - 7) <= 1 && out.fourLine.rowH > 100, tag + 'with a 4-line draft Send stays by the last line: ' + JSON.stringify(out.fourLine));
      assert(out.loading.name === 'Stop the reply' && !out.loading.disabled && /coachStop\(\)/.test(out.loading.onclick) && out.loading.thinkingButtons === 0, tag + 'in flight the slot is an enabled Stop: ' + JSON.stringify(out.loading));
      assert(!out.stopped.loading && /^Stopped\./.test(out.stopped.last) && out.stopped.name === 'Send message', tag + 'Stop stops the turn: ' + JSON.stringify(out.stopped));
      assert(!out.keys.composing && !out.keys.shift && out.keys.afterNoSend === 0 && out.keys.sent === 3, tag + 'Enter sends, never mid-composition; Shift+Enter is a new line: ' + JSON.stringify(out.keys));
      assert(!out.intake.attach && out.intake.inset >= 14 && out.intake.name === 'Answer the coach', tag + 'intake: the text sits 14px+ inside the composer: ' + JSON.stringify(out.intake));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

serial('M4: on a touch screen Return is a new line and Cmd/Ctrl+Enter sends', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 }, { touch: true });
  try {
    await open(app.page);
    const out = await app.page.evaluate(() => {
      let calls = 0; const real = window.sendCoachMessage; window.sendCoachMessage = () => { calls++; };
      const key = (o) => document.getElementById('coach-input').dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: 'Enter', bubbles: true, cancelable: true }, o)));
      key({}); const plain = calls; key({ metaKey: true }); key({ ctrlKey: true });
      window.sendCoachMessage = real;
      return { coarse: _coarsePointer(), plain, total: calls };
    });
    assert(out.coarse && out.plain === 0 && out.total === 2, 'Return is a new line on touch; Cmd/Ctrl+Enter sends: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// Stop takes Send's place at once, and the page sets touch-action:manipulation (a double tap is two
// clicks): the second tap of a double tap on Send, or a double-click, stopped the reply it had just
// sent. The button ignores a press in a turn's first half second; after that Stop stops.
serial('M4: a double tap or double-click on Send does not stop the reply it sent; Stop still stops after that', async () => {
  for (const touch of [true, false]) {
    const tag = (touch ? 'double tap' : 'double-click') + ': ';
    const app = await bootChat('heavyweight', { width: 390, height: 844 }, { touch, seed: { kt_coach_msgs: JSON.stringify(SHORT) } });
    try {
      await open(app.page);
      const typeIt = () => app.page.evaluate((MOCK_FETCH) => {
        eval(MOCK_FETCH)(700);
        const i = document.getElementById('coach-input'); i.value = 'And my squat?'; i.dispatchEvent(new Event('input', { bubbles: true }));
      }, MOCK_FETCH);
      // where the button is now (the composer drops to the home-indicator line while the box has focus)
      const where = () => app.page.evaluate(() => { const b = document.getElementById('coach-send').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      const press = async (at) => { if (touch) await app.page.touchscreen.tap(at.x, at.y); else await app.page.mouse.click(at.x, at.y); };
      await typeIt();
      // both presses land on the same spot, as a finger's or a mouse's do (Stop is where Send was)
      const at = await where();
      if (touch) { await press(at); await app.page.waitForTimeout(90); await press(at); }
      else await app.page.mouse.dblclick(at.x, at.y);
      await app.page.waitForTimeout(1100);
      const first = await app.page.evaluate(() => ({ last: coachMessages[coachMessages.length - 1].content, stopped: coachMessages.some((m) => m._stopped), loading: coachLoading }));
      // a press on Stop once the turn is under way stops it
      await typeIt();
      await press(await where());
      await app.page.waitForTimeout(650);
      const name = await app.page.evaluate(() => document.getElementById('coach-send').getAttribute('aria-label'));
      await press(await where());
      await app.page.waitForTimeout(150);
      const second = await app.page.evaluate(() => ({ last: coachMessages[coachMessages.length - 1].content, loading: coachLoading }));
      assert(first.last === 'Squat is moving well.' && !first.stopped && !first.loading, tag + 'the reply lands: ' + JSON.stringify(first));
      assert(name === 'Stop the reply' && second.last === 'Stopped.' && !second.loading, tag + 'Stop stops a turn under way: ' + JSON.stringify([name, second]));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// ── M5 ─────────────────────────────────────────────────────────────────────────
serial('M5: PLAN CHANGES tells the truth once Undo is gone; a later log-only reply keeps the card; Restore previous retires it', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 }, { seed: { kt_coach_msgs: '[]' } });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async (SWAP) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        const card = () => {
          const c = document.querySelector('.kt-ledger-card'); if (!c) return null;
          const cb = c.getBoundingClientRect();
          return { rows: c.querySelectorAll('.kt-ledger-row').length, text: c.textContent, note: (c.querySelector('.kt-ledger-card-note') || {}).textContent,
            buttons: [...c.querySelectorAll('button')].map((b) => { const bb = b.getBoundingClientRect(); return { t: b.textContent, cls: b.className, h: bb.height, w: bb.width, rightGap: cb.right - bb.right }; }), cardW: cb.width };
        };
        const LOG = { name: 'log_bodyweight', input: { weight: 180 }, result: { ok: true }, units: { w: 'lb', d: 'mi' } };
        // (a) a fresh swap: rows, Undo, Keep changes, the Undo note
        _snapshotRoutineForUndo('coach:t117a');
        coachMessages = [{ role: 'user', content: 'swap my laterals' }, { role: 'assistant', content: 'Swapped.', _tools: [SWAP], _undo: 'coach:t117a' }];
        render(); await wait(60);
        r.fresh = card();
        // (d) a later reply that only logs body weight keeps the swap's card, with its Undo
        coachMessages.push({ role: 'user', content: 'log 180' }, { role: 'assistant', content: 'Logged.', _tools: [LOG] });
        render(); await wait(60);
        r.afterLog = card();
        // (b) a day rename takes the undo point: the rows stay, the note says so, Got it retires the card
        setDayName('Push', 'Chest Day'); render(); await wait(60);
        r.renamed = card();
        r.renamedPrimary = !!document.querySelector('.kt-ledger-card .kt-coach-btn.primary');
        const got = [...document.querySelectorAll('.kt-ledger-card button')].find((b) => b.textContent === 'Got it'); if (got) got.click(); await wait(60);
        r.gotIt = { card: !!document.querySelector('.kt-ledger-card'), seen: !!coachMessages[1]._ledgerSeen };
        // (c) a goal-only reply: its pill, no card
        coachMessages = [{ role: 'user', content: 'goal 225' }, { role: 'assistant', content: 'Goal set.', _tools: [{ name: 'set_bench_goal', input: { weight: 225 }, result: { ok: true }, units: { w: 'lb', d: 'mi' } }] }];
        render(); await wait(60);
        r.goal = { card: !!document.querySelector('.kt-ledger-card'), pill: /Bench goal/.test(document.querySelector('.coach-msgs-area').textContent) };
        // (e) Settings > Restore previous programme retires the card that said "Applied"
        _routineScope = null; _snapshotRoutineForUndo('coach:t117e');
        coachMessages = [{ role: 'user', content: 'swap' }, { role: 'assistant', content: 'Swapped.', _tools: [SWAP], _undo: 'coach:t117e' }];
        render(); await wait(60);
        r.beforeRestore = !!card();
        restoreRoutineBackup(); await wait(30);
        const ok = document.querySelector('.kt-close-sheet [id$="ok"]'); if (ok) ok.click(); await wait(60);
        switchTab('coach'); coachView = 'chat'; render(); await wait(60);
        r.afterRestore = { card: !!document.querySelector('.kt-ledger-card'), seen: !!coachMessages[1]._ledgerSeen };
        return r;
      }, SWAP).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      const F = out.fresh;
      assert(F && F.rows === 1 && F.buttons.map((b) => b.t).join('|') === 'Undo|Keep changes' && /Undo restores the previous version/.test(F.note), tag + 'a fresh change offers Undo and Keep changes: ' + JSON.stringify(F));
      assert(F.buttons.every((b) => b.h >= 44), tag + 'the card\'s buttons are 44px+ tall: ' + JSON.stringify(F.buttons));
      assert(out.afterLog && out.afterLog.buttons.some((b) => b.t === 'Undo') && /Cable Lateral Raise/.test(out.afterLog.text), tag + 'a later log-only reply leaves the swap its card and Undo: ' + JSON.stringify(out.afterLog));
      const R = out.renamed;
      assert(R && R.rows === 1 && R.note === 'Applied to your programme. It cannot be undone here any more.', tag + 'once Undo is gone the card says so: ' + JSON.stringify(R));
      assert(R.buttons.length === 1 && R.buttons[0].t === 'Got it' && /neutral/.test(R.buttons[0].cls) && !out.renamedPrimary, tag + 'with one neutral Got it and no blue button: ' + JSON.stringify(R.buttons));
      assert(R.buttons[0].h >= 44 && R.buttons[0].w < R.cardW / 2 && R.buttons[0].rightGap <= 16, tag + 'Got it is right-aligned, auto width, 44px+: ' + JSON.stringify([R.buttons[0], R.cardW]));
      assert(!out.gotIt.card && out.gotIt.seen, tag + 'Got it retires the card: ' + JSON.stringify(out.gotIt));
      assert(!out.goal.card && out.goal.pill, tag + 'a goal-only reply shows its pill and no card: ' + JSON.stringify(out.goal));
      assert(out.beforeRestore && !out.afterRestore.card && out.afterRestore.seen, tag + 'Restore previous programme retires the card: ' + JSON.stringify([out.beforeRestore, out.afterRestore]));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// ── S1 ─────────────────────────────────────────────────────────────────────────
// The owner's conversation: the swap reply with its pill and PLAN CHANGES, "How am i doing?", the
// %% progress check; then an error with Try again.
const OWNER = [
  { role: 'user', content: 'Any plateaus I should deal with this week?' },
  { role: 'assistant', content: LONG_REPLY, _tools: [SWAP], _undo: 'coach:t117' },
  { role: 'user', content: 'How am i doing?' },
  { role: 'assistant', content: PROGRESS },
  { role: 'user', content: 'And my squat?' },
  { role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true },
];
serial('S1: one left edge, one rhythm, one hairline under the header', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 700 }]) {
      const tag = room + ' ' + size.width + ': ';
      const app = await bootChat(room, size, { seed: { kt_coach_msgs: JSON.stringify(OWNER), kt_routine_backup: SEED.kt_routine, kt_routine_backup_scope: 'coach:t117' } });
      try {
        await open(app.page);
        const out = await app.page.evaluate(async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const B = (el) => el.getBoundingClientRect();
          const wrap = document.querySelector('.coach-msgs-wrap'), kids = [...wrap.children];
          const kind = (el) => el.classList.contains('user') ? 'user' : el.classList.contains('kt-tool-pills') ? 'pills' : el.classList.contains('kt-ledger-card') ? 'ledger'
            : el.classList.contains('kt-chat-retry') ? 'retry' : el.classList.contains('kt-cmb') ? 'block' : el.classList.contains('kt-cmb-note') ? 'note' : 'reply';
          const items = kids.map((el) => ({ k: kind(el), top: B(el).top, bottom: B(el).bottom, left: B(el).left, right: B(el).right }));
          const gaps = items.slice(1).map((it, i) => items[i].k + '>' + it.k + ':' + Math.round(it.top - items[i].bottom));
          const edges = {};
          ['.kt-tool-pills', '.kt-ledger-card', '.kt-cmb-metrics', '.kt-cmb-take', '.kt-cmb-actions', '.kt-chat-retry'].forEach((s) => { const el = document.querySelector(s); if (el) edges[s] = [Math.round(B(el).left), Math.round(B(el).right)]; });
          const st = document.querySelector('.coach-chat-stick'), head = document.querySelector('.coach-head');
          const s = document.getElementById('screen');
          return { gaps, edges, stickRule: getComputedStyle(st).borderBottomWidth, headRule: getComputedStyle(head).borderBottomStyle, sw: s.scrollWidth, cw: s.clientWidth };
        }).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        const L = size.width === 390 ? 20 : 16, R = size.width - L;
        for (const k of Object.keys(out.edges)) assert(Math.abs(out.edges[k][0] - L) <= 1 && Math.abs(out.edges[k][1] - R) <= 1, tag + k + ' spans the column: ' + JSON.stringify(out.edges[k]));
        const want = ['user>block:20', 'block>pills:8', 'pills>ledger:8', 'ledger>user:20', 'block>user:20', 'user>note:20', 'note>retry:8'];
        for (const w of want) assert(out.gaps.some((g) => Math.abs(parseFloat(g.split(':')[1]) - parseFloat(w.split(':')[1])) <= 1 && g.split(':')[0] === w.split(':')[0]), tag + 'gap ' + w + ' in ' + JSON.stringify(out.gaps));
        assert(out.stickRule === '1px' && out.headRule === 'none', tag + 'one rule under the header: ' + JSON.stringify([out.stickRule, out.headRule]));
        assert(out.sw <= out.cw, tag + 'no horizontal overflow: ' + JSON.stringify([out.sw, out.cw]));
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

// ── S2 ─────────────────────────────────────────────────────────────────────────
const LONG_METRIC = '%%type: Run check\n%%metric: Avg heart rate over the last six easy runs | 171 bpm | vs 150 cap | +21 | warn\n%%metric: Bench Press | 225 lb x 4 | vs 230 x 6 target | -5 lb | warn\n%%metric: Latest run | 12:39/mi @ 171bpm | vs 11:00 goal | +1:39 | warn\n%%metric: Pace | 8:07 | vs 8:15 | -8s | good\nShort note.\n%%action: Lower my run intensity | Lower it\n%%action: Log body weight | Log it';
const LONG_SWAP = { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'DB Lateral Raise', action: 'swap', rename_to: 'Single-Arm Cable Lateral Raise (Behind the Back)' }, result: { ok: true }, units: { w: 'lb', d: 'mi' } };
const BAD = { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 999 }, result: { ok: false, error: 'no' }, units: { w: 'lb', d: 'mi' } };
serial('S2: message parts wear the room\'s tokens; nothing runs off the column at 320pt or Larger Text', async () => {
  const colours = {};
  for (const room of ['heavyweight', 'dark']) {
    for (const zoom of [1, 1.25]) {
      const tag = room + ' 320 zoom ' + zoom + ': ';
      const msgs = [{ role: 'user', content: 'Check my runs' }, { role: 'assistant', content: LONG_METRIC, _tools: [LONG_SWAP, BAD], _undo: 'coach:t117' }];
      const app = await bootChat(room, { width: 320, height: 700 }, { seed: { kt_coach_msgs: JSON.stringify(msgs), kt_routine_backup: SEED.kt_routine, kt_routine_backup_scope: 'coach:t117' } });
      try {
        const out = await app.page.evaluate(async (zoom) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
          if (zoom !== 1) applyDynamicType(zoom);
          switchTab('coach'); coachView = 'chat'; render(); await wait(160);
          const list = document.querySelector('.coach-msgs-area'), lr = list.getBoundingClientRect();
          // nothing overflows its own box or the scroller
          r.over = [...list.querySelectorAll('*')].filter((e) => !e.classList.contains('kt-sr') && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto' && e.clientWidth > 0).map((e) => e.className || e.tagName).slice(0, 5);
          r.past = [...list.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > lr.right + 1; }).map((e) => e.className || e.tagName).slice(0, 5);
          // the long metric: label on its own line, the whole value under it, right-aligned
          const row = document.querySelector('.kt-cmb-mrow'), lab = row.querySelector('.kt-cmb-mlabel'), val = row.querySelector('.kt-cmb-mval');
          const rb = row.getBoundingClientRect(), lb = lab.getBoundingClientRect(), vb = val.getBoundingClientRect();
          const z = parseFloat(document.documentElement.style.zoom) || 1;   // computed lengths are unzoomed, boxes are zoomed
          r.metric = { under: vb.top >= lb.bottom - 1, right: Math.abs((rb.right - parseFloat(getComputedStyle(row).paddingRight) * z) - vb.right) <= 1.5, text: val.textContent };
          // a delta never splits across lines
          r.deltas = [...document.querySelectorAll('.kt-cmb-delta-warn,.kt-cmb-delta-good')].map((d) => { const rs = d.getClientRects(); return [d.textContent, rs.length]; });
          // the long ledger row wraps inside the card
          const card = document.querySelector('.kt-ledger-card').getBoundingClientRect(), b = document.querySelector('.kt-ledger-row b').getBoundingClientRect();
          r.ledger = { inside: b.right <= card.right + 0.5 && b.left >= card.left - 0.5, lines: Math.round(b.height / 16) };
          // chips are 44px+ targets
          r.chips = [...document.querySelectorAll('.kt-cmb-chip')].map((c) => Math.round(c.getBoundingClientRect().height));
          // colours
          const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p || 'color'] : null; };
          const bgOf = (sel) => cs(sel, 'backgroundColor');
          r.c = {
            okPill: cs('.kt-tool-pill:not(.bad)'), okPillBg: bgOf('.kt-tool-pill:not(.bad)'), tick: cs('.kt-tool-pill:not(.bad) .kt-tool-pill-ic'),
            badPill: cs('.kt-tool-pill.bad'), badPillBg: bgOf('.kt-tool-pill.bad'), badText: (document.querySelector('.kt-tool-pill.bad') || {}).textContent,
            good: cs('.kt-cmb-delta-good'), warn: cs('.kt-cmb-delta-warn'), ref: cs('.kt-cmb-mref'), refOpacity: cs('.kt-cmb-mref', 'opacity'), metricsBg: bgOf('.kt-cmb-metrics'),
            primary: [bgOf('.kt-cmb-chip.primary'), cs('.kt-cmb-chip.primary'), cs('.kt-cmb-chip.primary', 'borderTopColor')],
            secondary: [bgOf('.kt-cmb-chip:not(.primary)'), cs('.kt-cmb-chip:not(.primary)'), cs('.kt-cmb-chip:not(.primary)', 'borderTopColor')],
          };
          // a 60-character suggestion chip wraps inside the column
          window.getCoachChips = () => ['Can you look at my last three weeks of squats and tell me why?'];
          coachMessages = []; render(); await wait(100);
          const seed = document.querySelector('.kt-chat-seeds .kt-cmb-chip'), sb = seed.getBoundingClientRect(), l2 = document.querySelector('.coach-msgs-area').getBoundingClientRect();
          r.seed = { inside: sb.right <= l2.right + 0.5, h: sb.height, msg: seed.dataset.msg };
          return r;
        }, zoom).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        assert(!out.over.length && !out.past.length, tag + 'nothing overflows the column: ' + JSON.stringify([out.over, out.past]));
        assert(out.metric.under && out.metric.right && /171 bpm/.test(out.metric.text) && /\+21/.test(out.metric.text), tag + 'a long metric shows its whole value under the label, right-aligned: ' + JSON.stringify(out.metric));
        assert(out.deltas.length >= 3 && out.deltas.every((d) => d[1] === 1), tag + 'deltas never split: ' + JSON.stringify(out.deltas));
        assert(out.ledger.inside && out.ledger.lines >= 2, tag + 'a long ledger row wraps inside its card: ' + JSON.stringify(out.ledger));
        assert(out.chips.length >= 2 && out.chips.every((h) => h >= 44), tag + 'chips are 44px+: ' + JSON.stringify(out.chips));
        assert(out.seed.inside && out.seed.h > 50 && out.seed.h >= 44, tag + 'a long suggestion wraps inside the column: ' + JSON.stringify(out.seed));
        if (zoom === 1) colours[room] = out.c;
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
  const H = colours.heavyweight, D = colours.dark;
  assert(ratioOf(H.okPill, H.okPillBg) >= 4.5 && H.tick === 'rgb(79, 112, 0)', 'Heavyweight: the OK pill reads and its tick is earned ink: ' + JSON.stringify([H.okPill, H.okPillBg, H.tick, ratioOf(H.okPill, H.okPillBg).toFixed(2)]));
  assert(/^✕ Not applied · /.test(H.badText) && ratioOf(H.badPill, H.badPillBg) >= 4.5, 'Heavyweight: a failed pill says Not applied and reads: ' + JSON.stringify([H.badText, ratioOf(H.badPill, H.badPillBg).toFixed(2)]));
  assert(H.good === 'rgb(79, 112, 0)' && ratioOf(H.warn, H.metricsBg) >= 4.5 && ratioOf(H.ref, H.metricsBg) >= 4.5 && H.refOpacity === '1', 'Heavyweight: deltas and refs read: ' + JSON.stringify([H.good, H.warn, H.ref, H.refOpacity]));
  assert(H.primary[0] === 'rgb(10, 67, 245)' && H.primary[1] === 'rgb(255, 255, 255)' && H.secondary[0] === 'rgb(255, 255, 255)' && H.secondary[2] === 'rgba(15, 15, 15, 0.1)', 'Heavyweight: the primary chip is the action, the other white on a hairline: ' + JSON.stringify([H.primary, H.secondary]));
  // Lime keeps today's colours
  assert(D.okPill === 'rgb(185, 185, 190)' && D.okPillBg === 'rgb(30, 30, 33)' && D.badPill === 'rgb(255, 93, 85)', 'Lime: pills unchanged: ' + JSON.stringify([D.okPill, D.okPillBg, D.badPill]));
  assert(D.good === 'rgb(216, 255, 99)' && D.warn === 'rgb(255, 157, 92)' && D.primary[1] === 'rgb(244, 244, 241)', 'Lime: deltas and the neutral primary chip unchanged: ' + JSON.stringify([D.good, D.warn, D.primary]));
});

// ── S3 ─────────────────────────────────────────────────────────────────────────
serial('S3: coach replies have one presentation; notes, the owner\'s text, Thinking and stale chips follow it', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const [size, zoom] of [[{ width: 390, height: 844 }, 1], [{ width: 320, height: 700 }, 1.25]]) {
      const tag = room + ' ' + size.width + ' zoom ' + zoom + ': ';
      const msgs = [
        { role: 'user', content: 'Line one\nline two\nline three' },
        { role: 'assistant', content: 'A plain reply. **Bold** works.' },
        { role: 'user', content: 'How am i doing?' },
        { role: 'assistant', content: PROGRESS },
        { role: 'assistant', content: 'Stopped.', _local: true },
        { role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true },
      ];
      const app = await bootChat(room, size, { seed: { kt_coach_msgs: JSON.stringify(msgs) } });
      try {
        const out = await app.page.evaluate(async (zoom) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
          if (zoom !== 1) applyDynamicType(zoom);
          switchTab('coach'); coachView = 'chat'; render(); await wait(160);
          const z = parseFloat(document.documentElement.style.zoom) || 1;
          const blocks = [...document.querySelectorAll('.coach-msgs-wrap > .kt-cmb')];
          r.blocks = blocks.map((b) => { const bb = b.getBoundingClientRect(), eb = b.querySelector('.kt-cmb-eyebrow'), cs = getComputedStyle(eb);
            return { left: Math.round(bb.left), right: Math.round(bb.right), eyebrow: eb.textContent, color: cs.color, font: cs.fontFamily }; });
          const para = getComputedStyle(document.querySelector('.kt-cmb-para'));
          r.prose = [para.fontSize, para.lineHeight];
          r.assistantBubbles = document.querySelectorAll('.coach-bubble.assistant').length;
          const notes = [...document.querySelectorAll('.kt-cmb-note')];
          r.notes = notes.map((n) => ({ text: n.textContent, eyebrow: !!n.querySelector('.kt-cmb-eyebrow'), dot: getComputedStyle(n, '::before').backgroundColor, err: n.classList.contains('err') }));
          r.red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
          const ub = document.querySelector('.coach-bubble.user');
          r.user = { lines: Math.round(ub.querySelector('.kt-sr').nextSibling ? ub.getBoundingClientRect().height / (parseFloat(getComputedStyle(ub).lineHeight) * z) : 0), ws: getComputedStyle(ub).whiteSpace, sr: ub.querySelector('.kt-sr').textContent };
          // the newest real reply keeps its chips; once a newer one lands, the older loses them; none while one is in flight
          r.chipsNewest = document.querySelectorAll('.kt-cmb-actions .kt-cmb-chip').length;
          coachMessages.push({ role: 'user', content: 'ok' }, { role: 'assistant', content: 'Newer reply.' }); render(); await wait(60);
          r.chipsOlder = document.querySelectorAll('.kt-cmb-actions .kt-cmb-chip').length;
          coachMessages.splice(-2, 2); coachLoading = true; render(); await wait(60);
          r.chipsLoading = document.querySelectorAll('.kt-cmb-actions .kt-cmb-chip').length;
          const tw = document.querySelector('.kt-thinking .typing-wrap'), tcs = getComputedStyle(tw);
          r.thinking = { bg: tcs.backgroundColor, border: tcs.borderTopStyle, eyebrow: (document.querySelector('.kt-thinking .kt-cmb-eyebrow') || {}).textContent };
          coachLoading = false; render();
          return r;
        }, zoom).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        const L = (size.width === 390 ? 20 : 16) * zoom;   // the gutter, as boxes read it at the root zoom
        assert(out.blocks.length === 2 && out.blocks.every((b) => Math.abs(b.left - L) <= 1 && Math.abs(b.right - (size.width - L)) <= 1), tag + 'a plain reply and a %% reply are both blocks at the column\'s width: ' + JSON.stringify(out.blocks));
        assert(out.blocks[0].eyebrow === 'COACH' && /^COACH · /.test(out.blocks[1].eyebrow), tag + 'both carry a COACH eyebrow: ' + JSON.stringify(out.blocks.map((b) => b.eyebrow)));
        if (room === 'heavyweight') assert(out.blocks.every((b) => b.color === 'rgb(10, 67, 245)' && /Archivo/.test(b.font)), tag + 'the eyebrow is blue Archivo caps: ' + JSON.stringify(out.blocks));
        else assert(out.blocks.every((b) => b.color === 'rgb(140, 140, 145)' && /JetBrains/.test(b.font)), tag + 'the eyebrow is muted mono: ' + JSON.stringify(out.blocks));
        assert(out.prose[0] === '15px' && out.prose[1] === '22.5px', tag + 'prose is 15px on 1.5: ' + JSON.stringify(out.prose));
        assert(out.assistantBubbles === 0, tag + 'no coach reply is a bubble');
        assert(out.notes.length === 2 && out.notes.every((n) => !n.eyebrow) && out.notes[0].text === 'Stopped.', tag + 'Stopped and the error are notes without an eyebrow: ' + JSON.stringify(out.notes));
        const red = room === 'heavyweight' ? 'rgb(220, 38, 38)' : 'rgb(255, 93, 85)';
        assert(out.notes[1].err && out.notes[1].dot === red && out.notes[0].dot !== red, tag + 'an error\'s dot is red: ' + JSON.stringify(out.notes));
        assert(out.user.ws === 'pre-wrap' && out.user.lines >= 3 && out.user.sr === 'You: ', tag + 'a typed 3-line message keeps its lines and reads "You:": ' + JSON.stringify(out.user));
        assert(out.chipsNewest === 2 && out.chipsOlder === 0 && out.chipsLoading === 0, tag + 'chips act only on the newest reply, never mid-reply: ' + JSON.stringify([out.chipsNewest, out.chipsOlder, out.chipsLoading]));
        assert(out.thinking.bg === 'rgba(0, 0, 0, 0)' && out.thinking.border === 'none' && out.thinking.eyebrow === 'COACH', tag + 'Thinking has no box: ' + JSON.stringify(out.thinking));
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

// A photo sent with no words is the bubble itself: it sat in the bubble's mat (12/16px of blue, or
// Lime's grey, plus the image's own 6px foot), thicker at the bottom than the top. With words the
// bubble keeps its padding and the photo sits above the text.
serial('S3: a photo sent with no words shows only the photo, with no mat around it, also after a relaunch', async () => {
  const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#7a8fa6"/></svg>').toString('base64');
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 }, { seed: { kt_coach_msgs: '[]' } });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async ({ MOCK_FETCH, PHOTO }) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        eval(MOCK_FETCH)(20);
        pendingImage = { data: 'R0lGODlhAQABAAAAACw=', mediaType: 'image/gif', previewUrl: PHOTO }; render(); await wait(40);
        await sendCoachMessage(); await wait(60);
        const ub = () => document.querySelector('.coach-bubble.user');
        r.sent = { img: !!ub().querySelector('img'), alt: (ub().querySelector('img') || {}).alt, text: ub().textContent.trim(), api: JSON.stringify(_toApiMsg(coachMessages[0])).indexOf('Please look at this image') >= 0 };
        const bb = ub().getBoundingClientRect(), ib = ub().querySelector('img').getBoundingClientRect(), cs = getComputedStyle(ub());
        r.mat = { top: ib.top - bb.top, bottom: bb.bottom - ib.bottom, left: ib.left - bb.left, right: bb.right - ib.right, bg: cs.backgroundColor, w: ib.width, h: ib.height };
        // with words: the bubble keeps its padding, the photo above the text
        coachMessages.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'x' } }, { type: 'text', text: 'And this one?' }], _preview: PHOTO });
        render(); await wait(60);
        const wb = [...document.querySelectorAll('.coach-bubble.user')].pop(), wcs = getComputedStyle(wb);
        r.withWords = { photo: wb.classList.contains('photo'), pad: wcs.paddingTop, bg: wcs.backgroundColor, text: wb.textContent.trim(), imgAboveText: wb.querySelector('img').getBoundingClientRect().bottom <= wb.getBoundingClientRect().bottom - 16 };
        coachMessages.pop();
        loadCoachHistory(); render(); await wait(60);
        const lb = ub().getBoundingClientRect(), lab = ub().querySelector('.coach-photo-lbl').getBoundingClientRect();
        r.relaunch = { text: ub().textContent.trim(), img: !!ub().querySelector('img'), foot: Math.round(lb.bottom - lab.bottom), head: Math.round(lab.top - lb.top) };
        return r;
      }, { MOCK_FETCH, PHOTO });
      assert(out.sent.img && out.sent.alt === 'Photo you sent' && out.sent.text === '' && out.sent.api, tag + 'the photo alone shows; the default prompt still goes to the API: ' + JSON.stringify(out.sent));
      const M = out.mat;
      assert([M.top, M.bottom, M.left, M.right].every((v) => Math.abs(v) <= 0.5) && M.bg === 'rgba(0, 0, 0, 0)', tag + 'the photo is the bubble, with no mat: ' + JSON.stringify(M));
      assert(Math.abs(M.w - 240) <= 1 && Math.abs(M.h - 180) <= 1, tag + 'a 4:3 photo shows 240 x 180: ' + JSON.stringify(M));
      assert(!out.withWords.photo && out.withWords.pad === '12px' && out.withWords.bg !== 'rgba(0, 0, 0, 0)' && /And this one\?/.test(out.withWords.text) && out.withWords.imgAboveText, tag + 'with words the bubble keeps its padding, the photo above the text: ' + JSON.stringify(out.withWords));
      assert(out.relaunch.text.replace('\u{1F4F7}', '').trim() === 'Photo' && !out.relaunch.img && out.relaunch.foot === out.relaunch.head, tag + 'after a relaunch the label alone shows, as far from the foot as from the top: ' + JSON.stringify(out.relaunch));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// ── S4 ─────────────────────────────────────────────────────────────────────────
const PLATEAU = [
  "Here's where each plateau stands:",
  '',
  '- **Bench plateau: watching.** Too early to judge.',
  '- **DB Lateral Raise plateau: changed.** Swapped to **Cable Lateral Raise**.',
  '',
  'Pull Up and Hammer Curl plateaus are already being addressed.',
].join('\n');
serial('S4: md() renders what the coach writes: one list per list, headings, numbered steps, tables, no blank line after a list', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 }, { seed: { kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const count = (h, re) => (h.match(re) || []).length;
      const r = {};
      const a = md('- a\n- b\n\nNext');
      r.list = { ul: count(a, /<ul>/g), li: count(a, /<li>/g), brAfter: /<\/ul>\s*<br>/.test(a), p: /<\/ul><p>Next<\/p>/.test(a) };
      r.ol = /<ol start="1">/.test(md('1. x\n2. y')) && /<ol start="3">/.test(md('3) x\n4) y'));
      r.h = /<div class="kt-md-h">Plan<\/div>/.test(md('### Plan'));
      const t = md('| Lift | Load |\n|---|---|\n| Bench | 225 |');
      r.table = { table: /<table class="kt-md-table">/.test(t), th: count(t, /<th>/g), sep: /---/.test(t), td: count(t, /<td>/g) };
      r.star = { bullet: /<ul><li>item<\/li><\/ul>/.test(md('* item')), math: md('3*5') === '<p>3*5</p>', em: /<em>soft<\/em>/.test(md('a *soft* b')) };
      r.link = md('[guide](https://x.y)');
      // parsed, the output holds no element but md()'s own, and no attribute but its class names (and ol start)
      r.xss = [md('<img src=x onerror=alert(1)>'), md('[x](javascript:alert(1))'), md('**<script>bad()</script>**'), md('`<b onclick=x>`')].map((h) => {
        const d = document.createElement('div'); d.innerHTML = h;
        const bad = [...d.querySelectorAll('*')].filter((e) => !/^(P|STRONG|EM|CODE|UL|OL|LI|BR|DIV|TABLE|TR|TH|TD|HR)$/.test(e.tagName) || [...e.attributes].some((a) => a.name !== 'class' && a.name !== 'start'));
        return { h, bad: bad.map((e) => e.outerHTML) };
      });
      r.sub = /<li class="sub">two<\/li>/.test(md('- one\n  - two'));
      r.gap = /<li>a<\/li><li>b<\/li>/.test(md('- a\n\n- b'));   // a blank line between items keeps one list
      const blocks = _coachBlocksHTML('%%type: Plan\n- one\n- two\n- three\n- four');
      r.blocks = { paras: count(blocks, /kt-cmb-para/g), ul: count(blocks, /<ul>/g) };
      r.indented = _hasCoachBlocks('Text\n  %%metric: Pace | 8:07 | | |') && /kt-cmb-mrow/.test(_coachBlocksHTML('  %%metric: Pace | 8:07 | | |'));
      r.take = /<strong>Keep<\/strong>/.test(_coachBlocksHTML('%%takeaway: **Keep** the plan'));
      return r;
    });
    assert(out.list.ul === 1 && out.list.li === 2 && !out.list.brAfter && out.list.p, 'one list of two items, no break after it: ' + JSON.stringify(out.list));
    assert(out.ol && out.h, 'numbered steps keep their start; headings render: ' + JSON.stringify([out.ol, out.h]));
    assert(out.table.table && out.table.th === 2 && !out.table.sep && out.table.td === 2, 'a pipe table is a table with a head row and no separator: ' + JSON.stringify(out.table));
    assert(out.star.bullet && out.star.math && out.star.em, '* is a bullet or emphasis, never in 3*5: ' + JSON.stringify(out.star));
    assert(out.link === '<p>guide</p>', 'a link is its text alone: ' + out.link);
    assert(out.xss.every((x) => !x.bad.length), 'model text never becomes a tag or an attribute: ' + JSON.stringify(out.xss));
    assert(out.sub && out.gap, 'sub-items and loose lists: ' + JSON.stringify([out.sub, out.gap]));
    assert(out.blocks.paras === 1 && out.blocks.ul === 1, 'four bullets in a block are one paragraph block with one list: ' + JSON.stringify(out.blocks));
    assert(out.indented && out.take, 'an indented marker is still a marker; a takeaway reads markdown: ' + JSON.stringify([out.indented, out.take]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('S4: on screen, no blank line under a list, bullets 6px apart, a table scrolls inside its card', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const [size, zoom] of [[{ width: 390, height: 844 }, 1], [{ width: 320, height: 700 }, 1.25]]) {
      const tag = room + ' ' + size.width + ' zoom ' + zoom + ': ';
      const msgs = [
        { role: 'user', content: 'Plateaus?' },
        { role: 'assistant', content: PLATEAU },
        { role: 'user', content: 'Table?' },
        { role: 'assistant', content: '| Week | Bench | Squat | Deadlift | Overhead press |\n|---|---|---|---|---|\n| 1 | 185 lb x 5 | 245 lb x 5 | 315 lb x 5 | 115 lb x 5 |\n| 2 | 190 lb x 5 | 250 lb x 5 | 320 lb x 5 | 117.5 lb x 5 |' },
      ];
      const app = await bootChat(room, size, { seed: { kt_coach_msgs: JSON.stringify(msgs) } });
      try {
        const out = await app.page.evaluate(async (zoom) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
          if (zoom !== 1) applyDynamicType(zoom);
          switchTab('coach'); coachView = 'chat'; render(); await wait(160);
          const z = parseFloat(document.documentElement.style.zoom) || 1;
          const para = document.querySelector('.kt-cmb-para'), ul = para.querySelector('ul'), ps = para.querySelectorAll('p');
          const after = ps[ps.length - 1].getBoundingClientRect().top - ul.getBoundingClientRect().bottom;
          const lis = ul.querySelectorAll('li');
          r.gap = after / z; r.liGap = (lis[1].getBoundingClientRect().top - lis[0].getBoundingClientRect().bottom) / z;
          const w = document.querySelector('.kt-md-tablewrap'), s = document.getElementById('screen');
          r.table = { scrolls: w.scrollWidth > w.clientWidth, overflow: getComputedStyle(w).overflowX, sw: s.scrollWidth, cw: s.clientWidth,
            inside: w.getBoundingClientRect().right <= document.querySelector('.coach-msgs-area').getBoundingClientRect().right + 0.5 };
          return r;
        }, zoom).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        assert(out.gap <= 12 && out.gap >= 6, tag + 'one paragraph gap under the list, no blank line: ' + out.gap);
        assert(Math.abs(out.liGap - 6) <= 1, tag + 'bullets sit 6px apart: ' + out.liGap);
        assert(out.table.overflow === 'auto' && out.table.scrolls && out.table.inside && out.table.sw <= out.table.cw, tag + 'a wide table scrolls inside its card: ' + JSON.stringify(out.table));
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

// ── S5 ─────────────────────────────────────────────────────────────────────────
const REPLY_FETCH = `(text, delay) => {
  window.fetch = async (url) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    await new Promise((r) => setTimeout(r, delay));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}`;
const LONG_ANSWER = Array.from({ length: 30 }, (_, i) => '- **Point ' + (i + 1) + ':** a full sentence of advice that wraps onto a second line on a phone.').join('\n');
serial('S5: a long reply lands at its start; a short one at the end; a reader who scrolled up keeps their place', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async ({ REPLY_FETCH, LONG_ANSWER }) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        const L = () => document.querySelector('.coach-msgs-area');
        const send = async (q) => { document.getElementById('coach-input').value = q; return sendCoachMessage(); };
        // a long reply, sent from the end: sample every frame
        eval(REPLY_FETCH)(LONG_ANSWER, 150);
        const frames = []; let on = true;
        (function loop() { const l = L(); if (l) frames.push({ top: l.scrollTop, max: l.scrollHeight - l.clientHeight, loading: coachLoading }); if (on) requestAnimationFrame(loop); })();
        await send('Give me everything');
        const atLand = { top: L().scrollTop, max: L().scrollHeight - L().clientHeight };
        await wait(120); const at100 = L().scrollTop;
        await wait(200); const at300 = L().scrollTop;
        on = false;
        const ts = L().querySelectorAll('.kt-turn'), u = ts[ts.length - 1];
        r.long = { atLand, at100, at300, userOffset: u.getBoundingClientRect().top - L().getBoundingClientRect().top,
          firstAfter: frames.slice(frames.findIndex((f) => f.loading)).filter((f) => !f.loading)[0], replyTop: u.nextElementSibling.getBoundingClientRect().top < L().getBoundingClientRect().bottom };
        // a short reply lands at the end, 16px above the composer
        eval(REPLY_FETCH)('Done.', 60);
        await send('Short one?'); await wait(150);
        await window.__settle(() => [L().scrollTop, L().scrollHeight, document.querySelector('.coach-input-row').getBoundingClientRect().top]);
        const row = document.querySelector('.coach-input-row').getBoundingClientRect();
        const kids = [...L().querySelectorAll('*')].filter((e) => e.getBoundingClientRect().height > 1);
        r.short = { top: L().scrollTop, max: L().scrollHeight - L().clientHeight, gap: row.top - Math.max.apply(null, kids.map((e) => e.getBoundingClientRect().bottom)) };
        // a reader who scrolls up while waiting keeps their place
        eval(REPLY_FETCH)(LONG_ANSWER, 300);
        const p = send('And again'); await wait(80);
        L().scrollTop = 200; await wait(60);
        await p; await wait(150);
        r.kept = L().scrollTop;
        return r;
      }, { REPLY_FETCH, LONG_ANSWER }).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      const Lg = out.long;
      assert(Math.abs(Lg.userOffset - 12) <= 2 && Lg.replyTop, tag + 'the question sits 12px under the header with the answer below it: ' + JSON.stringify(Lg));
      assert(Lg.atLand.top < Lg.atLand.max - 100 && Math.abs(Lg.at100 - Lg.atLand.top) <= 1 && Math.abs(Lg.at300 - Lg.atLand.top) <= 1, tag + 'it stays there; the 80ms pin does not pull it to the end: ' + JSON.stringify(Lg));
      assert(Lg.firstAfter && Math.abs(Lg.firstAfter.top - Lg.atLand.top) <= 1, tag + 'no frame shows the end first: ' + JSON.stringify(Lg.firstAfter));
      assert(Math.abs(out.short.top - out.short.max) <= 1 && Math.abs(out.short.gap - 16) <= 1, tag + 'a reply that fits lands at the end: ' + JSON.stringify(out.short));
      assert(Math.abs(out.kept - 200) <= 2, tag + 'a reader who scrolled up keeps their place: ' + out.kept);
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// ── S6 ─────────────────────────────────────────────────────────────────────────
serial('S6: the chat header fits on one line, its controls take a 44pt press, and its status is honest', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const [size, zoom] of [[{ width: 320, height: 700 }, 1], [{ width: 390, height: 844 }, 1.25], [{ width: 375, height: 667 }, 1.25]]) {
      const tag = room + ' ' + size.width + ' zoom ' + zoom + ': ';
      const app = await bootChat(room, size);
      try {
        const out = await app.page.evaluate(async (zoom) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
          if (zoom !== 1) applyDynamicType(zoom);
          switchTab('coach'); coachView = 'chat'; render(); await wait(120);
          const z = parseFloat(document.documentElement.style.zoom) || 1;
          const B = (el) => el.getBoundingClientRect();
          const title = document.querySelector('.coach-head-title'), eb = document.querySelector('.coach-head-eyebrow'), meta = document.querySelector('.coach-head-meta');
          const lh = (el) => parseFloat(getComputedStyle(el).fontSize) * 1.4 * z;
          r.lines = { title: B(title).height <= lh(title), eyebrow: B(eb).height <= lh(eb), meta: getComputedStyle(meta).display === 'none' || B(meta).height <= lh(meta), role: title.getAttribute('role') + ':' + title.getAttribute('aria-level') };
          r.stickH = B(document.querySelector('.coach-chat-stick')).height / z;
          const back = [...document.querySelectorAll('.coach-chat-stick .screen-hd button')].find((b) => /Back/.test(b.textContent));
          r.backH = back ? B(back).height / z : 0;
          r.avatarHidden = document.querySelector('.coach-chat-stick .screen-avatar').getAttribute('aria-hidden');
          // the model pill takes a press 8px above and below its drawn edges
          const pill = [...document.querySelectorAll('.coach-head button')].find((b) => /setCoachModel/.test(b.getAttribute('onclick') || ''));
          const pb = B(pill), cx = pb.left + pb.width / 2;
          const hit = (x, y, el) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
          r.pillHit = [hit(cx, pb.top - 8 * z, pill), hit(cx, pb.bottom + 8 * z, pill), Math.max(pb.height / z, 0)];
          pill.click(); await wait(80);
          r.toast = document.getElementById('toast').textContent;
          // replying, offline
          coachLoading = true; render(); await wait(40); r.replying = document.querySelector('.coach-head-eyebrow').textContent;
          coachLoading = false;
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); render(); await wait(40);
          const off = document.querySelector('.coach-head-eyebrow'); r.offline = [off.textContent, off.classList.contains('off')];
          delete navigator.onLine;
          // intake: Cancel, no Back; Cancel takes a 44pt press
          _setIntakeMode(true); render(); await wait(60);
          const cancel = [...document.querySelectorAll('.coach-head button')].find((b) => b.textContent === 'Cancel');
          const cb = B(cancel), ccx = cb.left + cb.width / 2, ccy = cb.top + cb.height / 2;
          r.intake = { back: [...document.querySelectorAll('.coach-chat-stick button')].some((b) => /Back/.test(b.textContent)), cancel: !!cancel,
            hit: [hit(ccx, ccy - 20 * z, cancel), hit(ccx, ccy + 20 * z, cancel)] };
          _setIntakeMode(false); render();
          return r;
        }, zoom).catch((e) => ({ err: String(e) }));
        assert(!out.err, tag + out.err);
        assert(out.lines.title && out.lines.eyebrow && out.lines.meta && out.lines.role === 'heading:1', tag + 'title, eyebrow and meta take one line each; the title is a heading: ' + JSON.stringify(out.lines));
        assert(out.stickH < 135, tag + 'the header is no taller than its one-line self: ' + out.stickH);
        assert(out.backH >= 44 && out.avatarHidden === 'true', tag + 'Back is a 44pt target; the avatar is decoration: ' + JSON.stringify([out.backH, out.avatarHidden]));
        assert(out.pillHit[0] && out.pillHit[1], tag + 'the model pill takes a press outside its drawn edges: ' + JSON.stringify(out.pillHit));
        assert(/^Coach model: (Haiku|Sonnet) [\d.]+$/.test(out.toast), tag + 'the switch says which model now runs: ' + out.toast);
        assert(out.replying === 'COACH · REPLYING' && out.offline[0] === 'COACH · OFFLINE' && out.offline[1], tag + 'the eyebrow says replying and offline: ' + JSON.stringify([out.replying, out.offline]));
        assert(!out.intake.back && out.intake.cancel && out.intake.hit.every(Boolean), tag + 'setup shows Cancel (a 44pt press) and no Back: ' + JSON.stringify(out.intake));
        assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
      } finally { await app.close(); }
    }
  }
});

// ── S7 ─────────────────────────────────────────────────────────────────────────
serial('S7: VoiceOver hears the coach, and every chat control has a name', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 }, { seed: { kt_coach_msgs: JSON.stringify(OWNER.slice(0, 4)), kt_routine_backup: SEED.kt_routine, kt_routine_backup_scope: 'coach:t117' } });
    try {
      await open(app.page);
      const live = await app.page.evaluate(async ({ REPLY_FETCH, PROGRESS }) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        const L = () => document.getElementById('coach-live').textContent;
        r.outside = !document.getElementById('screen').contains(document.getElementById('coach-live'));
        eval(REPLY_FETCH)(PROGRESS, 250);
        document.getElementById('coach-input').value = 'How am i doing?';
        const p = sendCoachMessage(); await wait(120);
        r.thinking = L();
        await p; await wait(120);
        r.reply = L();
        // Stop
        eval(REPLY_FETCH)('late', 2000);
        document.getElementById('coach-input').value = 'Another';
        sendCoachMessage(); await wait(80);
        coachStop(); await wait(120);
        r.stopped = L();
        r.unit = _coachSpeech({ role: 'assistant', content: '%%type: Check\n## Plan\n%%metric: Pace | 8:07 | vs 8:15 | -8s | good\n| a | b |\n%%takeaway: **Keep** it\n%%action: Go | go' });
        return r;
      }, { REPLY_FETCH, PROGRESS }).catch((e) => ({ err: String(e) }));
      assert(!live.err, tag + live.err);
      assert(live.outside && live.thinking === 'Coach is thinking', tag + 'a turn starts with "Coach is thinking", outside #screen: ' + JSON.stringify(live));
      assert(/^Coach: Bench Press: 225 lb x 4 vs 230 x 6 target -5 lb\. /.test(live.reply) && !/%%|\*\*|\||warn/.test(live.reply) && live.reply.length <= 420, tag + 'the reply is read as speech, first line first: ' + live.reply);
      assert(live.unit === 'Coach: Plan Pace: 8:07 vs 8:15 -8s. a b Takeaway: Keep it', tag + 'markers read as words; the type tag and the chips are not read: ' + live.unit);
      assert(live.stopped === 'Stopped', tag + 'Stop says Stopped: ' + live.stopped);
      // names, in the accessibility tree
      await app.page.evaluate(async () => {
        pendingImage = { data: 'x', mediaType: 'image/gif', previewUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
        coachMessages.push({ role: 'user', content: [{ type: 'text', text: 'Look' }], _preview: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
        render(); await new Promise((r) => setTimeout(r, 120));
      });
      const ax = await app.page.locator('#screen').ariaSnapshot();
      assert(/button "Send message"/.test(ax) && /textbox "Message the coach"/.test(ax) && /button "Remove photo"/.test(ax) && /button "Attach photo"/.test(ax), tag + 'the composer\'s controls are named: ' + ax.slice(0, 400));
      assert(/img "Photo to send"/.test(ax) && /img "Photo you sent"/.test(ax), tag + 'both images have alt text');
      assert(/You: How am i doing\?/.test(ax), tag + 'the owner\'s bubbles read "You:"');
      await app.page.evaluate(async () => { coachLoading = true; render(); await new Promise((r) => setTimeout(r, 60)); });
      const axLoading = await app.page.locator('#screen').ariaSnapshot();
      assert(/button "Stop the reply"/.test(axLoading), tag + 'Stop is named while a reply is in flight');
      // the hidden tab bar is not in the tree while typing
      await app.page.evaluate(async () => { coachLoading = false; pendingImage = null; render(); document.getElementById('coach-input').focus(); await new Promise((r) => setTimeout(r, 300)); });
      const axTyping = await app.page.locator('body').ariaSnapshot();
      assert(!/button "Log"/.test(axTyping) && !/button "Settings"/.test(axTyping), tag + 'the hidden tab bar leaves the tree while typing');
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// ── C1 ─────────────────────────────────────────────────────────────────────────
const STATUS_FETCH = `(status, message) => {
  window.fetch = async (url) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    if (status === 0) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ type: 'error', error: { type: 'x', message } }), { status, headers: { 'content-type': 'application/json' } });
  };
}`;
serial('C1: no dead ends after Stop or an error that retrying cannot fix', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 }, { seed: { kt_coach_msgs: '[]' } });
  try {
    await open(app.page);
    const out = await app.page.evaluate(async ({ STATUS_FETCH, REPLY_FETCH }) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
      const chip = () => { const b = document.querySelector('.kt-chat-retry button'); return b ? b.textContent : null; };
      const ask = async (q) => { document.getElementById('coach-input').value = q; await sendCoachMessage(); await wait(40); };
      // Stop with nothing done: the note and Try again, which runs the turn again
      eval(REPLY_FETCH)('late', 3000);
      document.getElementById('coach-input').value = 'Plan my week'; sendCoachMessage(); await wait(60);
      coachStop(); await wait(40);
      r.stop = { chip: chip(), last: coachMessages[coachMessages.length - 1].content };
      loadCoachHistory(); render(); await wait(40); r.stopRelaunch = chip();
      eval(REPLY_FETCH)('Here is your week.', 30);
      document.querySelector('.kt-chat-retry button').click(); await wait(200);
      r.retried = coachMessages.map((m) => m.content).slice(-2);
      // Stop after a tool ran: the note and its pills, no Try again
      coachLoading = true; _runningTools = [{ name: 'set_current_week', input: { week: 4 }, result: { ok: true } }]; render();
      coachStop(); await wait(40);
      r.stopTools = { chip: chip(), pills: document.querySelectorAll('.kt-tool-pill').length > 0 };
      // a rejected key: the fix, and a way to it
      eval(STATUS_FETCH)(401, 'invalid x-api-key');
      await ask('hello');
      r.key = { text: coachMessages[coachMessages.length - 1].content, chip: chip() };
      loadCoachHistory(); render(); await wait(40); r.keyRelaunch = chip();
      document.querySelector('.kt-chat-retry button').click(); await wait(40);
      r.keyLands = currentTab;
      switchTab('coach'); coachView = 'chat'; render(); await wait(40);
      // an empty balance: what to do, and no chip (trying again cannot work)
      eval(STATUS_FETCH)(400, 'Your credit balance is too low to access the Anthropic API.');
      await ask('hello again');
      r.billing = { text: coachMessages[coachMessages.length - 1].content, chip: chip() };
      // a network error keeps Try again
      eval(STATUS_FETCH)(0, '');
      await ask('and again');
      r.net = { text: coachMessages[coachMessages.length - 1].content, chip: chip() };
      return r;
    }, { STATUS_FETCH, REPLY_FETCH }).catch((e) => ({ err: String(e) }));
    assert(!out.err, out.err);
    assert(out.stop.last === 'Stopped.' && out.stop.chip === 'Try again →' && out.stopRelaunch === 'Try again →', 'Stop with nothing done offers Try again, also after a relaunch: ' + JSON.stringify([out.stop, out.stopRelaunch]));
    assert(out.retried[1] === 'Here is your week.' && out.retried[0] === 'Plan my week', 'Try again runs the stopped turn: ' + JSON.stringify(out.retried));
    assert(out.stopTools.chip === null && out.stopTools.pills, 'Stop after a change keeps its pills and offers no Try again: ' + JSON.stringify(out.stopTools));
    assert(/did not accept your API key/.test(out.key.text) && out.key.chip === 'Open Settings →' && out.keyRelaunch === 'Open Settings →' && out.keyLands === 'settings', 'a rejected key names the fix and opens Settings: ' + JSON.stringify([out.key, out.keyRelaunch, out.keyLands]));
    assert(/out of credit/.test(out.billing.text) && out.billing.chip === null, 'an empty balance says so, with no chip: ' + JSON.stringify(out.billing));
    assert(/Could not connect/.test(out.net.text) && out.net.chip === 'Try again →', 'a network error keeps Try again: ' + JSON.stringify(out.net));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── C4 ─────────────────────────────────────────────────────────────────────────
serial('C4: coming back to the Coach tab mid-reply shows the chat; once it has landed the tab opens on the hub', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 });
  try {
    await open(app.page);
    const out = await app.page.evaluate(async (REPLY_FETCH) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
      eval(REPLY_FETCH)('Here it is, <b>bold</b>.', 600);
      document.getElementById('coach-input').value = 'A question';
      const p = sendCoachMessage(); await wait(60);
      switchTab('log'); await wait(40);
      switchTab('coach'); await wait(60);
      r.mid = { view: coachView, thinking: !!document.querySelector('.kt-thinking') };
      coachView = 'home'; render(); await wait(40);
      r.hubSub = (document.querySelector('.settings-row-sub') || {}).textContent;
      await p; await wait(60);
      switchTab('log'); await wait(40); switchTab('coach'); await wait(40);
      r.after = coachView;
      r.preview = { text: (document.querySelector('.settings-row-sub') || {}).textContent, injected: !!document.querySelector('.settings-row-sub b') };
      return r;
    }, REPLY_FETCH);
    assert(out.mid.view === 'chat' && out.mid.thinking, 'mid-reply the Coach tab shows the chat and Thinking: ' + JSON.stringify(out.mid));
    assert(out.hubSub === 'Coach is replying…', 'the hub says a reply is on its way: ' + out.hubSub);
    assert(out.after === 'home', 'once the reply has landed the tab opens on the hub again: ' + out.after);
    assert(!out.preview.injected, 'the hub preview reads message text as text: ' + JSON.stringify(out.preview));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── C2 ─────────────────────────────────────────────────────────────────────────
serial('C2: day dividers say when advice was given; unstamped history shows none; the API never sees the stamp', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const tag = room + ': ';
    const app = await bootChat(room, { width: 390, height: 844 }, { seed: { kt_coach_msgs: '[]' } });
    try {
      await open(app.page);
      const out = await app.page.evaluate(async (REPLY_FETCH) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        const at = (iso, h) => new Date(iso + 'T' + (h || '10') + ':00:00').getTime();
        const days = () => [...document.querySelectorAll('.kt-chat-day')].map((d) => d.textContent);
        const t = todayISO(), y = addDays(t, -1), old = addDays(t, -400);
        coachMessages = [
          { role: 'user', content: 'An old question', at: at(old) }, { role: 'assistant', content: 'An old answer.', at: at(old, '11') },
          { role: 'user', content: 'Yesterday', at: at(y) }, { role: 'assistant', content: 'Yesterday\'s answer.', at: at(y, '11') },
          { role: 'user', content: 'Today', at: at(t, '08') }, { role: 'assistant', content: 'Today\'s answer.', at: at(t, '09') },
        ];
        render(); await wait(60);
        r.days = days();
        r.oldLabel = _calDayName(old);
        r.upper = getComputedStyle(document.querySelector('.kt-chat-day')).textTransform;
        coachMessages = [{ role: 'user', content: 'Unstamped' }, { role: 'assistant', content: 'From an older page.' }];
        render(); await wait(40);
        r.unstamped = days().length;
        // a new message is stamped, the stamp is saved, and the API payload carries none
        window.__bodies = [];
        const real = window.fetch; eval(REPLY_FETCH)('Stamped.', 20); const f = window.fetch;
        window.fetch = async (u, o) => { if (String(u).includes('anthropic')) window.__bodies.push(JSON.parse(o.body)); return f(u, o); };
        document.getElementById('coach-input').value = 'New today'; await sendCoachMessage(); await wait(60);
        r.stored = JSON.parse(localStorage.getItem('kt_coach_msgs')).slice(-2).map((m) => typeof m.at === 'number');
        r.apiAt = JSON.stringify(window.__bodies.map((b) => b.messages)).indexOf('"at"') >= 0;
        r.after = days();
        window.fetch = real;
        return r;
      }, REPLY_FETCH).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      assert(JSON.stringify(out.days) === JSON.stringify([out.oldLabel, 'Yesterday', 'Today']) && /\d{4}/.test(out.oldLabel) && out.upper === 'uppercase', tag + 'dividers: an old date with its year, Yesterday, Today: ' + JSON.stringify([out.days, out.upper]));
      assert(out.unstamped === 0, tag + 'unstamped history shows no divider');
      assert(out.stored.every(Boolean) && !out.apiAt && JSON.stringify(out.after) === JSON.stringify(['Today']), tag + 'a new message is stamped and saved; the API never sees it: ' + JSON.stringify([out.stored, out.apiAt, out.after]));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// ── C3 ─────────────────────────────────────────────────────────────────────────
serial('C3: prompts the app writes for the owner read as what they are; programme setup asks before it clears the chat', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 });
  try {
    await open(app.page);
    const out = await app.page.evaluate(async (REPLY_FETCH) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
      const bodies = [];
      eval(REPLY_FETCH)(Array.from({ length: 24 }, (_, i) => '- Step ' + (i + 1) + ': a line of advice long enough to wrap on a phone screen.').join('\n'), 40);
      const f = window.fetch; window.fetch = async (u, o) => { if (String(u).includes('anthropic')) bodies.push(JSON.parse(o.body)); return f(u, o); };
      // a plateau tap: the long prompt is a labelled rule, not the owner's words; the API gets the prompt
      window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 28 }];
      startPlateauFix(); await wait(600);
      const seed = document.querySelector('.kt-chat-seed');
      const last = [...document.querySelectorAll('.coach-bubble.user')].pop();
      r.seed = { label: seed && seed.textContent, upper: seed && getComputedStyle(seed).textTransform, turn: seed && seed.classList.contains('kt-turn'),
        bubble: last ? /plateaued/.test(last.textContent) : false, api: JSON.stringify(bodies.map((b) => b.messages)).indexOf('These lifts have plateaued') >= 0 };
      // S5 lands the reply under the label
      const L = document.querySelector('.coach-msgs-area');
      r.landed = seed.getBoundingClientRect().top - L.getBoundingClientRect().top;
      r.saved = JSON.parse(localStorage.getItem('kt_coach_msgs')).some((m) => m._seed === 'Plateau check');
      // programme setup over an existing chat asks first; Cancel keeps the chat
      const n = coachMessages.length;
      startRoutineIntake(); await wait(60);
      r.asked = { sheet: !!document.querySelector('.kt-close-sheet'), intake: intakeMode };
      const cancel = [...document.querySelectorAll('.kt-close-sheet button')].find((b) => /Cancel/i.test(b.textContent)); if (cancel) cancel.click(); await wait(60);
      r.kept = { n: coachMessages.length === n, intake: intakeMode };
      eval(REPLY_FETCH)('What is your main goal?', 1500);   // read setup before its first answer lands (with a programme already saved, setup ends after one turn)
      startRoutineIntake(); await wait(60);
      const ok = document.querySelector('.kt-close-sheet [id$="ok"]'); if (ok) ok.click(); await wait(200);
      r.started = { intake: intakeMode, first: coachMessages[0] && coachMessages[0]._seed, label: (document.querySelector('.kt-chat-seed') || {}).textContent };
      _setIntakeMode(false);
      return r;
    }, REPLY_FETCH).catch((e) => ({ err: String(e) }));
    assert(!out.err, out.err);
    assert(out.seed.label === 'Plateau check' && out.seed.upper === 'uppercase' && out.seed.turn && !out.seed.bubble && out.seed.api, 'a plateau tap reads as PLATEAU CHECK; the API still gets the prompt: ' + JSON.stringify(out.seed));
    assert(Math.abs(out.landed - 12) <= 2 && out.saved, 'the reply lands under the label, and the label is saved: ' + JSON.stringify([out.landed, out.saved]));
    assert(out.asked.sheet && !out.asked.intake && out.kept.n && !out.kept.intake, 'setup over a chat asks first; Cancel keeps the chat: ' + JSON.stringify([out.asked, out.kept]));
    assert(out.started.intake && out.started.first === 'Programme setup' && out.started.label === 'Programme setup', 'confirmed, setup starts under a PROGRAMME SETUP label: ' + JSON.stringify(out.started));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── The share sheet's photo and comment land in the composer as typed ───────────
serial('a shared photo with a comment lands in the composer at the composer\'s own size, Send ready', async () => {
  const app = await bootChat('heavyweight', { width: 390, height: 844 }, { seed: { kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const comment = Array.from({ length: 9 }, (_, i) => 'Line ' + (i + 1) + ' of what I want to ask about this photo').join('\n');
      Capacitor.Plugins.TrovoShare = { getPendingShare: () => Promise.resolve({ imageBase64: 'R0lGODlhAQABAAAAACw=', comment }) };
      await checkPendingShare(); await wait(350);
      const i = document.getElementById('coach-input'), b = document.getElementById('coach-send');
      return { chat: document.documentElement.classList.contains('kt-chat'), value: i.value === comment, h: parseFloat(i.style.height), send: b && !b.disabled, preview: !!document.querySelector('.coach-img-preview img') };
    });
    assert(out.chat && out.value && out.preview && out.send && out.h <= 120 && out.h > 100, 'the comment fills the composer up to its 120px cap and Send is ready: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// Build day's "Ask the coach to build it" drafts its prompt in the composer. Writing .value fired no
// input event, so Send stayed disabled (and greyed) next to the full box until the owner edited it.
serial('Build day: "Ask the coach to build it" drafts the prompt with Send ready; a touch screen gets no scripted focus', async () => {
  for (const touch of [false, true]) {
    const tag = (touch ? 'touch' : 'desktop') + ': ';
    const app = await bootChat('heavyweight', { width: 390, height: 844 }, { touch, seed: { kt_coach_msgs: '[]' } });
    try {
      const out = await app.page.evaluate(async (MOCK_FETCH) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
        eval(MOCK_FETCH)(80);
        switchTab('log'); await wait(60);
        _bdSlot = 'Arms'; _bdAskCoach(); await wait(300);
        const i = document.getElementById('coach-input'), b = document.getElementById('coach-send');
        r.draft = { value: i.value, disabled: b.disabled, h: i.getBoundingClientRect().height, focused: document.activeElement === i, cls: document.documentElement.className };
        const before = coachMessages.length;
        b.click(); await wait(40);
        r.sent = { added: coachMessages.length - before, text: String((coachMessages[before] || {}).content || '') };
        await wait(400);
        r.landed = String((coachMessages[coachMessages.length - 1] || {}).content || '');
        return r;
      }, MOCK_FETCH).catch((e) => ({ err: String(e) }));
      assert(!out.err, tag + out.err);
      assert(/^Build my .+ day: /.test(out.draft.value) && out.draft.disabled === false, tag + 'the drafted prompt has Send ready: ' + JSON.stringify(out.draft));
      assert(out.draft.h > 44 && out.draft.h <= 120, tag + 'the box is sized to the draft: ' + out.draft.h);
      assert(touch ? !out.draft.focused && out.draft.cls.indexOf('chat-typing') < 0 : out.draft.focused, tag + (touch ? 'no scripted focus (no keys would come), the tabs stay: ' : 'a desktop keyboard gets the box: ') + JSON.stringify(out.draft));
      assert(out.sent.added >= 1 && /^Build my /.test(out.sent.text) && out.landed === 'Squat is moving well.', tag + 'a tap on Send sends it and the reply lands: ' + JSON.stringify([out.sent, out.landed]));
      assert(app.errors.length === 0, tag + 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});
