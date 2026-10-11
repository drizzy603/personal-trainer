// The native coach chat's page side (plan tasks C1, C2, C3; decision.md sections 6 and 9).
// - C1: coachSend(text, {seed, image, usePending, nonce}) is the one DOM-free way into the coach, and
//   every entry point uses it: with no #coach-input on screen (the native chat has none) each sends
//   exactly one user message and one API call, and a card's week stamp is written only with its
//   question. A nonce sends once (the last 20 are remembered). coachPrefill drafts for the composer.
// - C2: messages carry ids in memory (never stored), and PLAN CHANGES Keep/Undo act by id, so a
//   Keep after the 60-message cap shifted every index retires the right card; _planChangeRows is raw
//   text and the HTML escapes it once; md() and _coachBlocksHTML() draw block models (_mdModel,
//   _cmbModel), and the HTML they draw equals the page's before the rebuild on every golden case
//   (tests/golden/coach-html.json), while the contract bodies equal FPCore's page-grammar fixtures.
const fs = require('fs');
const path = require('path');
const { boot, assert, run } = require('../lib/harness');
const GOLDEN = require('../golden/coach-cases');

// One browser at a time: the turns below wait on timers.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}

// In the page: a coach API that answers at once, counting chat turns (requests with tools: the
// morning card's Haiku call has none), and a way to wait for a turn to end.
const COACH_API = `(() => {
  window.__turns = [];
  window.fetch = async (url, o) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    const body = JSON.parse(o.body);
    if (body.tools) window.__turns.push(body.messages.slice(-1)[0].content);
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: body.tools ? 'On it.' : '{"message":"ok","actions":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__idle = async () => { for (let i = 0; i < 150 && coachLoading; i++) await __wait(20); await __wait(30); };
})()`;

serial('C1: with no #coach-input each entry point sends one user message and one API call; stamps go only with their question', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (COACH_API) => {
      eval(COACH_API);
      // the chat without its composer, as under the native chat
      const rc = renderCoach;
      renderCoach = function () { return rc.apply(this, arguments).replace(/<textarea id="coach-input"[\s\S]*?<\/textarea>/, ''); };
      window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 28 }];
      window._progressionLifts = () => [{ name: 'Bench Press', weight: 185, rpe: 7, sets: 3 }];
      lsSet('kt_readiness', { date: todayISO(), score: 40, parts: { sleep: 5, hrvDelta: -12 } });
      const chip = document.createElement('button'); chip.setAttribute('data-msg', 'Plan my week 7');
      const STAMPS = ['kt_last_plateau_week', 'kt_last_prog_week', 'kt_readiness_adj_seen', 'kt_last_review_week'];
      // [name, call, its card's stamp, where it is tapped: the chat's own buttons in the chat, the rest on Today]
      const entries = [
        ['sendCoachChip', () => sendCoachChip('How is my recovery looking?'), null, 'chat'],
        ['coachBlockAction', () => coachBlockAction(chip), null, 'chat'],
        ['coachCardAction', () => coachCardAction('Swap squats for leg press today'), null, 'log'],
        ['startPlateauFix', () => startPlateauFix(), 'kt_last_plateau_week', 'log'],
        ['startProgression', () => startProgression(), 'kt_last_prog_week', 'log'],
        ['startRecoveryAdjust', () => startRecoveryAdjust(), 'kt_readiness_adj_seen', 'log'],
        ['startWeeklyReview', () => startWeeklyReview(), 'kt_last_review_week', 'log'],
        ['handleCoachCardAsk', () => handleCoachCardAsk({ key: 'Enter', target: { value: 'How was my week?' } }), null, 'log'],
      ];
      const from = (where) => { if (where === 'chat') { switchTab('coach'); coachView = 'chat'; render(); } else switchTab('log'); };
      const r = { sends: {}, busy: {}, composer: [] };
      // busy: a reply in flight takes nothing and stamps nothing
      for (const [name, fn, stamp, where] of entries) {
        STAMPS.forEach((k) => lsDel(k));
        coachMessages = []; saveCoachHistory(); from(where); window.__turns = [];
        coachLoading = true;
        try { fn(); } catch (e) { r.busy[name] = 'threw ' + e.message; continue; }
        await __wait(300);
        r.busy[name] = { users: coachMessages.filter((m) => m.role === 'user').length, turns: __turns.length, stamps: STAMPS.filter((k) => lsGet(k) != null) };
        coachLoading = false;
      }
      // each entry point, idle: one message, one turn, its stamp
      for (const [name, fn, stamp, where] of entries) {
        STAMPS.forEach((k) => lsDel(k));
        coachMessages = []; saveCoachHistory(); from(where); await __wait(20); window.__turns = [];
        fn(); await __idle();
        const users = coachMessages.filter((m) => m.role === 'user');
        r.sends[name] = { users: users.length, turns: __turns.length, tab: currentTab, view: coachView, seed: users[0] && users[0]._seed || null,
          stamp: stamp ? lsGet(stamp) : null, others: STAMPS.filter((k) => k !== stamp && lsGet(k) != null), input: !!document.getElementById('coach-input'),
          reply: (coachMessages[coachMessages.length - 1] || {}).content };
        r.composer.push(!!document.getElementById('coach-input'));
      }
      r.week = currentWeek; r.today = todayISO();
      return r;
    }, COACH_API);
    for (const name of Object.keys(out.busy)) {
      const b = out.busy[name];
      assert(b.users === 0 && b.turns === 0 && b.stamps.length === 0, name + ': a reply in flight takes nothing and stamps nothing: ' + JSON.stringify(b));
    }
    const SEEDS = { startPlateauFix: 'Plateau check', startProgression: 'Progression check', startRecoveryAdjust: 'Recovery check', startWeeklyReview: 'Weekly review' };
    for (const name of Object.keys(out.sends)) {
      const s = out.sends[name];
      assert(s.users === 1 && s.turns === 1, name + ': exactly one user message and one API call with no composer: ' + JSON.stringify(s));
      assert(s.tab === 'coach' && s.view === 'chat' && !s.input && s.reply === 'On it.', name + ': the chat shows the reply: ' + JSON.stringify(s));
      assert((s.seed || null) === (SEEDS[name] || null), name + ': the prompt the app wrote keeps its label: ' + JSON.stringify(s));
      assert(s.others.length === 0, name + ': no other card is stamped: ' + JSON.stringify(s));
    }
    assert(out.sends.startPlateauFix.stamp === out.week && out.sends.startProgression.stamp === out.week && out.sends.startWeeklyReview.stamp === out.week &&
      out.sends.startRecoveryAdjust.stamp === out.today, 'each card is stamped with its question: ' + JSON.stringify(out.sends));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C1: coachSend is idempotent by nonce (the last 20), sends a photo and the pending one; coachPrefill keeps a draft for the composer', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (COACH_API) => {
      eval(COACH_API);
      const r = {};
      switchTab('coach'); coachView = 'chat'; render();
      const a = coachSend('First', { nonce: 'n-a' }); await __idle();
      const again = coachSend('First', { nonce: 'n-a' }); await __idle();
      r.once = { first: a.ok, again: again, users: coachMessages.filter((m) => m.role === 'user').length, turns: __turns.length };
      // 20 more nonces push the first out of the window: it sends again; the newest still does not
      for (let i = 1; i <= 20; i++) { coachSend('Q' + i, { nonce: 'n-' + i }); await __idle(); }
      const n0 = coachMessages.length;
      const back = coachSend('First again', { nonce: 'n-a' }); await __idle();
      const dup = coachSend('Q20 again', { nonce: 'n-20' }); await __idle();
      r.window = { back: back.ok && !back.duplicate, added: coachMessages.length - n0, dup: dup.duplicate === true };
      // refusals: empty, busy
      r.empty = coachSend('   ', {});
      coachLoading = true; r.busy = coachSend('x', { nonce: 'n-busy' }); coachLoading = false;
      const retry = coachSend('x', { nonce: 'n-busy' }); await __idle();
      r.busyNonce = { retried: retry.ok && !retry.duplicate };
      // a photo the native composer picked, and the page's pending photo (a shared image)
      window.__turns = []; coachMessages = [];
      const pic = coachSend('', { image: { mediaType: 'image/jpeg', data: 'QUJD' } }); await __idle();
      const m1 = coachMessages.find((m) => m.role === 'user');
      r.image = { ok: pic.ok, auto: !!m1._auto, block: Array.isArray(m1.content) && m1.content[0].type === 'image' && m1.content[0].source.data === 'QUJD', preview: m1._preview, sent: JSON.stringify(__turns[0]).indexOf('QUJD') >= 0 };
      pendingImage = { data: 'UEVO', mediaType: 'image/jpeg', previewUrl: 'data:image/jpeg;base64,UEVO' };
      const keep = coachSend('Without the photo', {}); await __idle();
      r.keepPending = { ok: keep.ok, still: !!pendingImage, text: typeof coachMessages[coachMessages.length - 2].content === 'string' };
      const use = coachSend('With it', { usePending: true }); await __idle();
      r.usePending = { ok: use.ok, cleared: pendingImage === null, sent: JSON.stringify(__turns[__turns.length - 1]).indexOf('UEVO') >= 0 };
      // coachPrefill: no composer on screen keeps the draft; the chat's next paint puts it in the box
      switchTab('log'); await __wait(20);
      const ta = coachPrefill('Build my Arms day');
      r.prefill = { returned: ta, draft: _coachDraft.v, sent: coachMessages.length };
      switchTab('coach'); coachView = 'chat'; render(); await __wait(30);
      const box = document.getElementById('coach-input');
      r.prefill.box = box && box.value;
      r.prefill.web = !!coachPrefill('Typed into the box') && document.getElementById('coach-input').value === 'Typed into the box' && !document.getElementById('coach-send').disabled;
      return r;
    }, COACH_API);
    assert(out.once.first && out.once.again.ok && out.once.again.duplicate && out.once.users === 1 && out.once.turns === 1, 'one send per nonce: ' + JSON.stringify(out.once));
    assert(out.window.back && out.window.added === 2 && out.window.dup, 'the last 20 nonces are remembered: ' + JSON.stringify(out.window));
    assert(!out.empty.ok && out.empty.error === 'empty' && !out.busy.ok && out.busy.error === 'busy' && out.busyNonce.retried, 'refusals send nothing and remember no nonce: ' + JSON.stringify([out.empty, out.busy, out.busyNonce]));
    assert(out.image.ok && out.image.auto && out.image.block && out.image.preview === 'data:image/jpeg;base64,QUJD' && out.image.sent, 'a picked photo goes with no words: ' + JSON.stringify(out.image));
    assert(out.keepPending.ok && out.keepPending.still && out.keepPending.text && out.usePending.ok && out.usePending.cleared && out.usePending.sent, 'the pending photo goes only when asked for: ' + JSON.stringify([out.keepPending, out.usePending]));
    assert(out.prefill.returned === null && out.prefill.draft === 'Build my Arms day' && out.prefill.sent >= 0 && out.prefill.box === 'Build my Arms day' && out.prefill.web, 'coachPrefill drafts, never sends: ' + JSON.stringify(out.prefill));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── C2 ─────────────────────────────────────────────────────────────────────────
serial('C2: md(), the %% blocks, PLAN CHANGES, pills and whole chats draw the golden HTML; the contract bodies equal FPCore\'s fixtures', async () => {
  const app = await boot({ page: { timezoneId: 'UTC' }, init: GOLDEN.CLOCK_INIT, seed: { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]' } });
  try {
    const want = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'golden', 'coach-html.json'), 'utf8')).cases;
    const got = await app.page.evaluate(GOLDEN.capture, GOLDEN.asciiJSON({ TEXTS: GOLDEN.TEXTS, TOOLS: GOLDEN.TOOLS }));
    const bad = [];
    for (const g of Object.keys(want)) for (const n of Object.keys(want[g])) if (JSON.stringify(want[g][n]) !== JSON.stringify((got[g] || {})[n])) bad.push(g + '/' + n);
    const total = Object.values(want).reduce((s, g) => s + Object.keys(g).length, 0);
    assert(total >= 150 && bad.length === 0, 'the page draws the golden HTML (' + total + ' cases): differs for ' + bad.join(', '));
    // the bodies the native chat reads are FPCore's page-grammar fixtures (the texts with their half emoji, as written)
    const grammar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures', 'blocks', 'page-grammar.json'), 'utf8'));
    const texts = Object.fromEntries(GOLDEN.TEXTS);
    const bodies = await app.page.evaluate((json) => JSON.parse(json).map(([name, text]) => [name, _nativeJSON(_coachBodyV1(text, false))]),
      GOLDEN.asciiJSON(grammar.cases.map((c) => [c.name, texts[c.name]])));
    for (const [name, json] of bodies) {
      const c = grammar.cases.find((x) => x.name === name);
      assert(json === JSON.stringify({ eyebrow: c.eyebrow, body: c.body }), name + ': the contract body is FPCore\'s fixture: ' + json.slice(0, 400));
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C2: ids live in memory only; Keep and Undo by id retire the right card after the 60-message cap; rows are raw text', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-test', kt_coach_msgs: JSON.stringify([{ role: 'user', content: 'Stored question' }, { role: 'assistant', content: 'Stored answer' }]) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), r = {};
      // history load gives ids; _pushCoach gives ids; a message added another way gets one when asked
      r.loaded = coachMessages.map((m) => m._mid);
      const pushed = _pushCoach({ role: 'user', content: 'Pushed' });
      const loose = { role: 'assistant', content: 'Loose' }; coachMessages.push(loose);
      r.pushed = pushed._mid; r.loose = _coachMid(loose); r.again = _coachMid(loose);
      saveCoachHistory();
      r.stored = localStorage.getItem('kt_coach_msgs').indexOf('_mid') < 0 && JSON.stringify(lsGet('kt_coach_msgs')).indexOf('_mid') < 0;
      r.idx = _coachIdx(r.loose) === coachMessages.length - 1 && _coachIdx('m999.nope') === -1 && _coachIdx('') === -1;
      // 60 messages, the newest a programme change with a current undo point: the card is on it
      _snapshotRoutineForUndo('coach:t118');
      const ex = getSessionExercises('Push')[0];
      const fill = [];
      for (let k = 0; k < 59; k++) fill.push(k % 2 ? { role: 'assistant', content: 'a' + k } : { role: 'user', content: 'q' + k });
      fill.push({ role: 'assistant', content: 'Done.', _undo: 'coach:t118', _tools: [{ name: 'set_exercise_weight', input: { name: ex.name, weight: 100 }, result: { ok: true }, units: { w: 'lb', d: 'km' } }] });
      coachMessages = _coachMids(fill); saveCoachHistory();
      currentTab = 'coach'; coachView = 'chat'; render(); await wait(30);
      const card = coachMessages[59], id = card._mid;
      r.cardBefore = { at: _coachIdx(id), html: !!document.querySelector('.kt-ledger-card') };
      // the next message lands while a model holding index 59 is on screen: the cap shifts every index
      _pushCoach({ role: 'user', content: 'next question' }); saveCoachHistory();
      r.shift = { length: coachMessages.length, at: _coachIdx(id) };
      const wrong = coachMessages[59];   // what index 59 is now: the new question
      _ledgerKeepId(id); await wait(30);
      r.keep = { right: card._ledgerSeen === true, untouched: !wrong._ledgerSeen, html: !!document.querySelector('.kt-ledger-card'),
        saved: (lsGet('kt_coach_msgs')[58] || {})._ledgerSeen === true, gone: _ledgerKeepId('m0.gone') === false };
      // Undo by id after the cap: the confirm, then the restore retires the card on its own message
      card._ledgerSeen = false; saveCoachHistory(); render(); await wait(20);
      r.undoGone = _ledgerUndoId('m0.gone') === false && !document.querySelector('.kt-close-sheet');
      _ledgerUndoId(id); await wait(20);
      _pushCoach({ role: 'user', content: 'one more while the confirm is up' }); saveCoachHistory();   // shifts again
      const ok = document.querySelector('.kt-close-sheet [id$="ok"]'); if (ok) ok.click(); await wait(40);
      r.undo = { sheet: !!ok, right: card._ledgerSeen === true, restored: getSessionExercises('Push')[0].weight === ex.weight };
      // a reload: new ids (another boot's tag), so an id from before it finds nothing
      r.before = coachMessages[coachMessages.length - 1]._mid;
      // raw rows, escaped once in the HTML
      const odd = 'Mike\'s "A" <Press> & Co';
      const tools = [{ name: 'set_exercise_weight', input: { name: odd, weight: 100 }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
        { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Dips', action: 'swap', rename_to: '<b>Ring</b> & dips' }, result: { ok: true }, units: { w: 'lb', d: 'km' } }];
      const rows = _planChangeRows(tools);
      _snapshotRoutineForUndo('coach:t118b');
      coachMessages = _coachMids([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y', _undo: 'coach:t118b', _tools: tools }]);
      const html = _planChangeLedger(tools, 1), model = _planChangeModel(tools, 1);
      r.rows = { raw: rows[0][0] === odd && rows[1][1] === '→ <b>Ring</b> & dips', once: html.indexOf('Mike&#39;s &quot;A&quot; &lt;Press&gt; &amp; Co') >= 0 && html.indexOf('&amp;amp;') < 0 && html.indexOf('&lt;b&gt;Ring&lt;/b&gt; &amp; dips') >= 0,
        model: model && model.canUndo && model.rows.length === 2 && model.actions.map((a) => a.do).join() === 'undo,keep' && /^PLAN CHANGES/.test(model.head) };
      r.pill = _toolPillModel({ name: 'set_exercise_weight', input: { name: odd, weight: 100 }, result: { ok: false } }).label;
      return r;
    });
    const re = /^m\d+\.[a-z0-9]+$/;
    assert(out.loaded.length === 2 && out.loaded.every((x) => re.test(x)) && out.loaded[0] !== out.loaded[1], 'history load gives each message an id: ' + JSON.stringify(out.loaded));
    assert(re.test(out.pushed) && re.test(out.loose) && out.loose === out.again && out.pushed !== out.loose, '_pushCoach gives an id, a loose message gets one when asked, and keeps it: ' + JSON.stringify(out));
    assert(out.stored && out.idx, 'ids are never stored, and find their message: ' + JSON.stringify([out.stored, out.idx]));
    assert(out.cardBefore.at === 59 && out.cardBefore.html && out.shift.length === 60 && out.shift.at === 58, 'the cap shifts the card to index 58: ' + JSON.stringify([out.cardBefore, out.shift]));
    assert(out.keep.right && out.keep.untouched && !out.keep.html && out.keep.saved && out.keep.gone, 'Keep by id after the cap retires the right card: ' + JSON.stringify(out.keep));
    assert(out.undoGone && out.undo.sheet && out.undo.right && out.undo.restored, 'Undo by id asks, restores and retires the right card, though the cap shifted again under the confirm: ' + JSON.stringify([out.undoGone, out.undo]));
    assert(out.rows.raw && out.rows.once && out.rows.model, 'PLAN CHANGES rows are raw text, escaped once in the HTML: ' + JSON.stringify(out.rows));
    assert(out.pill === 'Not applied · Mike\'s "A" <Press> & Co → 100 lb', 'a pill\'s label is raw text as shown: ' + out.pill);
    // a reload: the same history, other ids
    await app.page.reload({ waitUntil: 'load' });
    await app.page.waitForFunction(() => typeof window.render === 'function');
    const after = await app.page.evaluate((before) => ({ ids: coachMessages.map((m) => m._mid), stale: _coachIdx(before) }), out.before);
    assert(after.ids.length > 0 && after.ids.every((x) => re.test(x)) && after.stale === -1, 'after a reload the ids are new and an old one finds nothing: ' + JSON.stringify(after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
