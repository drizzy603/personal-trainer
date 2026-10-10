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
const { boot, assert, run } = require('../lib/harness');

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
run('M1: the chat is one column; the composer sits 8px above the bar or dock and nothing shows through', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 700 }]) {
      const tag = room + ' ' + size.width + ': ';
      const app = await bootChat(room, size);
      try {
        await open(app.page);
        const out = await app.page.evaluate(async (GEO) => {
          const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const r = {};
          r.long = g();
          const gy = (r.long.row.bottom + r.long.tabs.top) / 2;
          r.gapHits = [24, r.long.iw / 2, r.long.iw - 24].map((x) => document.elementsFromPoint(x, gy).some((e) => e.closest && e.closest('.coach-msgs-area')));
          // nothing of the conversation is painted below the scroller (behind the composer, the bar or the dock)
          r.belowList = document.elementsFromPoint(r.long.iw / 2, r.long.row.top + 4).some((e) => e.closest && e.closest('.coach-msgs-wrap'));
          r.dock = { l: r.long.tabs.left, r: r.long.tabs.right, rowL: r.long.row.left, rowR: r.long.row.right };
          // a 2-message chat does not scroll and hugs the composer
          coachMessages = JSON.parse(JSON.stringify(window.__SHORT)); render(); await wait(120);
          r.short = g();
          // the empty chat, an error with Try again, Thinking with live pills
          coachMessages = []; render(); await wait(120); r.empty = g();
          coachMessages = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true }]; render(); await wait(120); r.error = g();
          coachMessages = JSON.parse(JSON.stringify(window.__LONG)); coachLoading = true; _runningTools = [window.__SWAP]; render(); await wait(160); r.thinking = g();
          coachLoading = false; _runningTools = []; render(); await wait(120);
          // a 6-line draft grows the composer: the newest message stays 16px above it
          const i = document.getElementById('coach-input');
          i.value = 'one\ntwo\nthree\nfour\nfive\nsix'; i.dispatchEvent(new Event('input', { bubbles: true })); await wait(160);
          r.grown = g();
          i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); await wait(120);
          // a photo: the conversation ends 16px above the preview, the preview 8px above the composer
          pendingImage = { data: 'x', mediaType: 'image/png', previewUrl: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#7a8fa6"/></svg>') };
          render(); await wait(200);
          r.photo = g();
          const pv = document.querySelector('.coach-img-preview');
          r.photoBg = pv && getComputedStyle(pv).backgroundColor;
          r.cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
          r.photoX = (() => { const b = document.querySelector('.coach-img-x'); return b && { name: b.getAttribute('aria-label'), alt: pv.querySelector('img').getAttribute('alt') }; })();
          pendingImage = null; render(); await wait(120);
          // intake
          _setIntakeMode(true); coachMessages = [{ role: 'user', content: 'I want to generate my training programme.' }, { role: 'assistant', content: 'What is your main goal?' }]; render(); await wait(120);
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

run('M1: a render keeps the reader\'s place; the end stays pinned; the hub opens at its top; a toast clears the composer', async () => {
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
run('M2: with the keys up the chat is laid over the visual viewport; pinch zoom and small cuts never count', async () => {
  for (const room of ['heavyweight', 'dark']) {
    for (const [size, kb] of [[{ width: 390, height: 844 }, 336], [{ width: 320, height: 700 }, 290]]) {
      const tag = room + ' ' + size.width + ': ';
      const app = await bootChat(room, size, { touch: true });
      try {
        await open(app.page);
        const out = await app.page.evaluate(async ({ GEO, kb }) => {
          const g = eval(GEO), wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = { pans: [] };
          r.tmIdle = window.__tm;
          document.getElementById('coach-input').focus(); await wait(80);
          for (const pan of [kb, Math.round(kb / 2), 0]) {
            __vv.set(innerHeight - kb, pan); await wait(120);
            const x = g();
            const atTop = document.elementFromPoint(x.iw / 2, pan + 30);
            r.pans.push(Object.assign(x, { pan, maskTop: !(atTop && atTop.closest && atTop.closest('.coach-msgs-area')), tm: window.__tm,
              back: getComputedStyle(document.querySelector('.coach-chat-stick > .screen-hd')).display }));
          }
          // the Dynamic Type root zoom: #app still covers the visual viewport exactly
          applyDynamicType(1.25); __vv.set(innerHeight - kb, kb - 1); await wait(140);
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

// ── M3 ─────────────────────────────────────────────────────────────────────────
const MOCK_FETCH = `(delay) => {
  window.fetch = async (url) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    await new Promise((r) => setTimeout(r, delay));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Squat is moving well.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}`;
run('M3: on a touch screen the tab bar follows the keyboard; a reply never refocuses the box', async () => {
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

run('M3: reduced motion fades the bar without sliding it; a desktop send still refocuses the box', async () => {
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
