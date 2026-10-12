// The native coach chat's page side (plan tasks C1, C2, C3; decision.md sections 6 and 9).
// - C1: coachSend(text, {seed, image, usePending, nonce}) is the one DOM-free way into the coach, and
//   every entry point uses it: with no #coach-input on screen (the native chat has none) each sends
//   exactly one user message and one API call, and a card's week stamp is written only with its
//   question; with the web composer on screen they still go through it (Send's path), as on next.
//   A card tapped while a reply is in flight waits in the composer (the web box, or the native chat's
//   draft) and keeps its label and stamp for the owner's Send of exactly its words.
//   A nonce sends once (the last 20 are remembered). coachPrefill drafts for the composer.
// - C2: messages carry ids in memory (never stored), and PLAN CHANGES Keep/Undo act by id, so a
//   Keep after the 60-message cap shifted every index retires the right card; _planChangeRows is raw
//   text and the HTML escapes it once; md() and _coachBlocksHTML() draw block models (_mdModel,
//   _cmbModel), and the HTML they draw equals the page's before the rebuild on every golden case
//   (tests/golden/coach-html.json), while the contract bodies equal FPCore's page-grammar fixtures.
// - C3: the screen bridge (shell contract v1), inert without the shell: hello negotiates v1 (an answer
//   outside v1..FP_CONTRACT is v0); with the chat on screen the page presents it natively, leaves an
//   element placeholder and no #coach-input, and pushes coach models (rev rising, no lone surrogate in
//   them or in forwarded toast, confirm and log text) whose labels and chips are the page's own;
//   FPScreens intents send once per nonce and act only where the page's own screen offers them now:
//   keep and undo by id after the cap while the card offers them (a model older than the page answers
//   stale), retry only on Try again, stop not in a turn's first half second; they forward the page's
//   confirms and toasts (and answer stale after a reload); the share photo and drafts reach the
//   composer, and a draft sent or changed is not offered again; setup shows Cancel and no Back; a tab
//   switch dismisses, uncovers the page and drops the speech line; FP_NATIVE, kt_native_off (the About
//   switch), screens.off, a refused present and a shell without the screen each bring back the web
//   chat; no programmatic focus while covered; the page's models are FPCore's golden fixtures. The
//   shell's flag without TrovoShell (build 60's store half, before task C5) is inert: no FPScreens, no
//   hello, the web chat.
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

serial('C1: with the web chat on screen the app\'s prompts still go through its composer (Send\'s path), as on next; the stamp only when the question went (a prompt that waits for a reply in flight keeps its label and stamp for the owner\'s Send)', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (COACH_API) => {
      eval(COACH_API);
      const r = {};
      window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 28 }];
      // a Send that sends nothing (a spec's stand-in): the words reached the box and Send, and no stamp
      const real = window.sendCoachMessage, seen = [];
      window.sendCoachMessage = (o) => { seen.push({ box: document.getElementById('coach-input').value, seed: o && o.seed }); };
      lsDel('kt_last_plateau_week'); switchTab('log');
      startPlateauFix(); await __wait(30);
      r.mocked = { seen, stamp: lsGet('kt_last_plateau_week'), view: coachView, tab: currentTab };
      window.sendCoachMessage = real;
      // the real Send: one seeded message, one API call, the stamp, and the box emptied
      lsDel('kt_last_plateau_week'); switchTab('log'); window.__turns = [];
      startPlateauFix(); await __idle();
      const users = coachMessages.filter((m) => m.role === 'user');
      r.sent = { users: users.length, seed: users[0] && users[0]._seed, turns: __turns.length, stamp: lsGet('kt_last_plateau_week'), week: currentWeek, box: document.getElementById('coach-input').value };
      // a reply in flight: the prompt waits in the box (as on next) and the card is not stamped
      lsDel('kt_last_plateau_week'); switchTab('log'); coachLoading = true;
      startPlateauFix(); await __wait(30);
      r.busy = { box: document.getElementById('coach-input').value, stamp: lsGet('kt_last_plateau_week'), users: coachMessages.filter((m) => m.role === 'user').length };
      coachLoading = false;
      // the reply has landed: the owner's Send takes the prompt as the app wrote it, with its label and its card's stamp
      window.__turns = [];
      sendCoachMessage(); await __idle();
      const u2 = coachMessages.filter((m) => m.role === 'user');
      r.later = { users: u2.length, seed: u2[u2.length - 1]._seed || null, turns: __turns.length, stamp: lsGet('kt_last_plateau_week'), box: document.getElementById('coach-input').value, due: _plateauFixDue() };
      // a waiting prompt the owner rewrites goes as their words: no label, no stamp, and the card stays
      lsDel('kt_last_plateau_week'); switchTab('log'); coachLoading = true;
      startPlateauFix(); await __wait(30);
      coachLoading = false;
      document.getElementById('coach-input').value += ' Keep it short.';
      sendCoachMessage(); await __idle();
      const u3 = coachMessages.filter((m) => m.role === 'user');
      r.edited = { users: u3.length, seed: u3[u3.length - 1]._seed || null, stamp: lsGet('kt_last_plateau_week'), due: _plateauFixDue() };
      // other words sent first (Today's Ask box) leave the prompt waiting in the box: sent later, it keeps its label and stamp
      lsDel('kt_last_plateau_week'); switchTab('log'); coachLoading = true;
      startPlateauFix(); await __wait(30);
      coachLoading = false; switchTab('log'); await __wait(20);
      handleCoachCardAsk({ key: 'Enter', target: { value: 'How was my week?' } }); await __idle();
      const box = document.getElementById('coach-input').value, s0 = lsGet('kt_last_plateau_week');
      sendCoachMessage(); await __idle();
      const u4 = coachMessages.filter((m) => m.role === 'user');
      r.otherFirst = { box: /^These lifts have plateaued/.test(box), stampBefore: s0, users: u4.length, other: u4[u4.length - 2].content, seed: u4[u4.length - 1]._seed || null, stamp: lsGet('kt_last_plateau_week'), due: _plateauFixDue() };
      return r;
    }, COACH_API);
    assert(out.mocked.seen.length === 1 && /^These lifts have plateaued/.test(out.mocked.seen[0].box) && out.mocked.seen[0].seed === 'Plateau check' && out.mocked.stamp == null &&
      out.mocked.view === 'chat' && out.mocked.tab === 'coach', 'the prompt goes into the composer and Send; nothing sent, nothing stamped: ' + JSON.stringify(out.mocked));
    assert(out.sent.users === 1 && out.sent.seed === 'Plateau check' && out.sent.turns === 1 && out.sent.stamp === out.sent.week && out.sent.box === '', 'sent through Send: one message, one call, the stamp: ' + JSON.stringify(out.sent));
    assert(/^These lifts have plateaued/.test(out.busy.box) && out.busy.stamp == null && out.busy.users === 1, 'busy: the prompt waits in the box, no stamp: ' + JSON.stringify(out.busy));
    assert(out.later.users === 2 && out.later.seed === 'Plateau check' && out.later.turns === 1 && out.later.stamp === out.sent.week && out.later.box === '' && out.later.due === false,
      'the waiting prompt sent later keeps its label and writes its card\'s stamp: ' + JSON.stringify(out.later));
    assert(out.edited.users === 3 && out.edited.seed === null && out.edited.stamp == null && out.edited.due === true, 'a rewritten prompt is the owner\'s message: no label, no stamp: ' + JSON.stringify(out.edited));
    assert(out.otherFirst.box && out.otherFirst.stampBefore == null && out.otherFirst.users === 5 && out.otherFirst.other === 'How was my week?' && out.otherFirst.seed === 'Plateau check' &&
      out.otherFirst.stamp === out.sent.week && out.otherFirst.due === false, 'other words sent first leave the prompt waiting; sent later it keeps its label and stamp: ' + JSON.stringify(out.otherFirst));
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
      const kept = _ledgerKeepId(id); await wait(30);
      r.keep = { kept, right: card._ledgerSeen === true, untouched: !wrong._ledgerSeen, html: !!document.querySelector('.kt-ledger-card'),
        saved: (lsGet('kt_coach_msgs')[58] || {})._ledgerSeen === true, gone: _ledgerKeepId('m0.gone') === 'gone' };
      // Undo by id after the cap: the confirm, then the restore retires the card on its own message
      card._ledgerSeen = false; saveCoachHistory(); render(); await wait(20);
      r.undoGone = _ledgerUndoId('m0.gone') === 'gone' && !document.querySelector('.kt-close-sheet');
      const asked = _ledgerUndoId(id); await wait(20);
      _pushCoach({ role: 'user', content: 'one more while the confirm is up' }); saveCoachHistory();   // shifts again
      const ok = document.querySelector('.kt-close-sheet [id$="ok"]'); if (ok) ok.click(); await wait(40);
      r.undo = { asked, sheet: !!ok, right: card._ledgerSeen === true, restored: getSessionExercises('Push')[0].weight === ex.weight };
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
    assert(out.keep.kept === '' && out.keep.right && out.keep.untouched && !out.keep.html && out.keep.saved && out.keep.gone, 'Keep by id after the cap retires the right card: ' + JSON.stringify(out.keep));
    assert(out.undoGone && out.undo.asked === '' && out.undo.sheet && out.undo.right && out.undo.restored, 'Undo by id asks, restores and retires the right card, though the cap shifted again under the confirm: ' + JSON.stringify([out.undoGone, out.undo]));
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

// ── C3 ─────────────────────────────────────────────────────────────────────────
// Every boot below runs under a shell contract (tests/lib/harness.js opts.shell): 'coach' is build 60
// (the native Coach chat), 'inert' build 60's flag with no screen, 'none' every shell up to 59.
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/;
// A lone half anywhere in a parsed value, keys included. The raw JSON text cannot show one:
// JSON.stringify writes a lone half as the ASCII escape \udXXX, so LONE on the text always passed.
const loneIn = (v) => {
  if (typeof v === 'string') return LONE.test(v);
  if (Array.isArray(v)) return v.some(loneIn);
  if (v && typeof v === 'object') return Object.keys(v).some((k) => LONE.test(k) || loneIn(v[k]));
  return false;
};
const shellBoot = (shell, extra = {}) => boot(Object.assign({ native: true, shell, init: COACH_API },
  extra, { seed: Object.assign({ kt_apikey: 'sk-ant-test', kt_coach_msgs: '[]' }, extra.seed || {}) }));
// In the page: open the chat as the owner would, the last model the shell got, and its messages.
const IN_PAGE = `(() => {
  window.__open = async () => { switchTab('coach'); openCoachChat(); await __wait(30); };
  window.__model = () => { const ms = __fpShell.models(); return ms[ms.length - 1]; };
  window.__users = () => coachMessages.filter((m) => m.role === 'user').length;
})()`;

serial('C3: hello negotiates v1; the chat goes native (a placeholder, no #coach-input); the model carries the page\'s labels and chips; a tab switch dismisses', async () => {
  const half = String.fromCharCode(0xd83d);
  const app = await shellBoot('coach', { seed: { kt_coach_msgs: JSON.stringify([{ role: 'user', content: 'Strong week ' + half, at: Date.now() - 90000 }, { role: 'assistant', content: '%%type: Week ' + half + '\nGood **work** ' + half + '\n%%action: Plan ' + half + ' | Plan my week', at: Date.now() - 80000 }]) } });
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30);
      r.hello = __fpShell.of('hello'); r.boot = _fpBoot; r.build = APP_BUILD; r.v = _fp.v; r.ping = await FPScreens.call('ping', {});
      switchTab('coach'); await __wait(20);
      r.hub = { present: __fpShell.of('present').length, open: /Open Chat/.test(document.getElementById('screen').innerText) };
      openCoachChat(); await __wait(30);
      r.chat = { present: __fpShell.of('present'), ph: !!document.querySelector('#screen > .kt-fp-ph[data-fp-screen="coach"]'), input: !!document.getElementById('coach-input'),
        body: !!document.querySelector('.coach-chat-body'), kt: document.documentElement.classList.contains('kt-chat'), models: __fpShell.of('model').length,
        firstBeforePresent: __fpShell.calls.findIndex((c) => c[0] === 'model') < __fpShell.calls.findIndex((c) => c[0] === 'present') };
      const m1 = __model();
      r.raw = JSON.stringify(_coachModel());   // the model before _nativeJSON mends it: the seeded halves are in it
      r.m1 = { v: m1.v, boot: m1.boot, room: m1.room, paper: m1.paper, msgs: m1.messages.length, ids: m1.messages.map((m) => m.id), chips: m1.messages[1].body.actions, eyebrow: m1.messages[1].eyebrow };
      // three renders in one tick: one model, its rev higher
      const n = __fpShell.of('model').length;
      render(); render(); render(); await __wait(30);
      const ms = __fpShell.models();
      r.coalesced = { added: ms.length - n, revs: ms.map((m) => m.rev) };
      // the empty chat: the page's suggestions and programme actions; tool pills as toolCallLabel says
      coachMessages = []; render(); await __wait(20);
      r.empty = { chips: __model().empty.chips, want: getCoachChips(), prog: __model().empty.programme };
      const ok = { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'DB Lateral Raise', action: 'swap', rename_to: 'Cable <Lateral> & Raise' }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
      const bad = { name: 'set_exercise_weight', input: { name: 'Deadlift', weight: 315 }, result: { ok: false }, units: { w: 'lb', d: 'km' } };
      coachMessages = _coachMids([{ role: 'user', content: 'Swap it' }, { role: 'assistant', content: 'Done.', _tools: [ok, bad] }]); render(); await __wait(20);
      r.pills = { got: __model().messages[1].pills, want: [{ label: toolCallLabel(ok), ok: true }, { label: 'Not applied · ' + toolCallLabel(bad), ok: false }] };
      // a snapshot: the model now, a higher rev, this boot
      const snap = await FPScreens.call('coach.snapshot', {});
      r.snap = { ok: snap.ok, rev: JSON.parse(snap.json).rev, last: __model().rev, boot: JSON.parse(snap.json).boot };
      r.jsons = __fpShell.of('model').map((c) => c.json).concat([snap.json]);
      // what else reaches the shell is cut in whole characters too: toast, confirm and log text
      const half = String.fromCharCode(0xd83d);
      showToast('Saved ' + half); showUndoToast('Removed ' + half, () => {});
      _ktConfirm({ title: 'Delete ' + half + '?', body: 'Gone ' + half, confirmLabel: 'Delete ' + half, onConfirm() {} });
      _fpLog('note ' + half);
      r.forwarded = { toasts: __fpShell.of('toast').slice(-2), confirm: __fpShell.of('confirm').slice(-1)[0], log: __fpShell.of('log').slice(-1)[0] };
      // another tab: dismissed, the web screen back
      switchTab('log'); await __wait(20);
      r.left = { dismiss: __fpShell.of('dismiss'), shown: !!_fp.shown.coach, covered: _fpCovered() };
      return r;
    }, IN_PAGE);
    assert(out.hello.length === 1 && out.hello[0].v === 1 && out.hello[0].page === out.build && JSON.stringify(out.hello[0].screens) === '["coach"]' && out.hello[0].boot === out.boot, 'hello: v1, the page build, the coach screen, the boot: ' + JSON.stringify(out.hello));
    assert(out.v === 1 && out.ping.ok && out.ping.v === 1, 'negotiated v1; ping answers: ' + JSON.stringify([out.v, out.ping]));
    assert(out.hub.present === 0 && out.hub.open, 'the Coach home stays web: ' + JSON.stringify(out.hub));
    assert(out.chat.present.length === 1 && out.chat.present[0].screen === 'coach' && out.chat.ph && !out.chat.input && !out.chat.body && !out.chat.kt && out.chat.firstBeforePresent,
      'present leaves an element placeholder and no web chat; the model goes first: ' + JSON.stringify(out.chat));
    assert(out.m1.v === 1 && out.m1.boot === out.boot && out.m1.room === 'heavyweight' && out.m1.paper === true && out.m1.msgs === 2 && out.m1.ids.every((x) => /^m\d+\./.test(x)) &&
      out.m1.chips.length === 1 && out.m1.chips[0].msg === 'Plan my week', 'the model: v1, this boot, the room, ids, the newest reply\'s chip: ' + JSON.stringify(out.m1));
    assert(out.coalesced.added === 1 && out.coalesced.revs.every((v, i, a) => i === 0 || v > a[i - 1]), 'renders in one tick push one model; revs rise: ' + JSON.stringify(out.coalesced));
    assert(JSON.stringify(out.empty.chips) === JSON.stringify(out.empty.want) && out.empty.chips.length >= 3 && out.empty.prog && out.empty.prog.actions.some((a) => a.do === 'regenerate'), 'chips are getCoachChips(): ' + JSON.stringify(out.empty));
    assert(JSON.stringify(out.pills.got) === JSON.stringify(out.pills.want), 'pills are toolCallLabel() as shown: ' + JSON.stringify(out.pills));
    assert(out.snap.ok && out.snap.rev > out.coalesced.revs[out.coalesced.revs.length - 1] && out.snap.boot === out.boot, 'coach.snapshot: the model now: ' + JSON.stringify(out.snap));
    assert(loneIn(JSON.parse(JSON.stringify({ t: 'a' + half }))) && !LONE.test(JSON.stringify({ t: 'a' + half })) && loneIn(JSON.parse(out.raw)), 'the check sees a lone half the raw JSON text hides, and the seeded ones reach the model before it is mended');
    assert(out.jsons.length >= 5 && out.jsons.every((j) => !loneIn(JSON.parse(j))) && out.jsons.every((j) => JSON.parse(j).v === 1), 'no lone surrogate in any model (' + out.jsons.length + ')');
    const fw = out.forwarded;
    assert(fw.toasts.length === 2 && fw.confirm && fw.log && !loneIn(fw) && fw.toasts[0].text === 'Saved ' && fw.toasts[1].text === 'Removed ' && fw.toasts[1].undo && fw.confirm.title === 'Delete ?' && fw.confirm.body === 'Gone ' && fw.confirm.confirm === 'Delete ' && fw.log.text === 'fp: note ',
      'toast, confirm and log text reach the shell in whole characters: ' + JSON.stringify(fw));
    assert(out.left.dismiss.length === 1 && out.left.dismiss[0].screen === 'coach' && !out.left.shown && !out.left.covered, 'switchTab(\'log\') dismisses: ' + JSON.stringify(out.left));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C3: under the native chat one send per nonce; chips and actions by id; the entry points each send one message and one API call', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30); await __open();
      const a = await FPScreens.call('coach.send', { text: 'Hello coach', nonce: 'n-1' }); await __idle();
      const b = await FPScreens.call('coach.send', { text: 'Hello coach', nonce: 'n-1' }); await __idle();
      r.nonce = { a, b, users: __users(), turns: __turns.length, model: __model().messages.filter((m) => m.role === 'user').map((m) => m.id) };
      r.speech = __model().speech;
      const c = await FPScreens.call('coach.chip', { text: 'How is my recovery looking?', nonce: 'n-2' }); await __idle();
      r.chip = { c, users: __users(), turns: __turns.length };
      // a reply with chips: only the newest reply's id sends
      coachMessages.push({ role: 'assistant', content: '%%type: Plan\nDo it.\n%%action: Plan week 7 | Plan my week 7', at: Date.now() }); saveCoachHistory(); render(); await __wait(20);
      const newest = __model().messages.slice(-1)[0];
      const old = __model().messages.find((m) => m.role === 'assistant' && m.id !== newest.id);
      r.action = { stale: await FPScreens.call('coach.action', { id: old.id, text: 'x' }), chips: newest.body.actions, ok: await FPScreens.call('coach.action', { id: newest.id, text: newest.body.actions[0].msg }) };
      await __idle();
      r.action.turns = __turns.length; r.action.last = __turns[__turns.length - 1];
      r.badArgs = [await FPScreens.call('coach.send', { text: 5, nonce: 'x' }), await FPScreens.call('coach.send', { text: 'x' }), await FPScreens.call('coach.keep', {}), await FPScreens.call('confirm', { id: 'c', yes: 'yes' })].map((x) => x.error);
      r.unknown = (await FPScreens.call('coach.dance', {})).error;
      // the entry points, the native chat up: each one message, one API call, no web composer
      window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 28 }];
      window._progressionLifts = () => [{ name: 'Bench Press', weight: 185, rpe: 7, sets: 3 }];
      lsSet('kt_readiness', { date: todayISO(), score: 40, parts: { sleep: 5 } });
      const chipEl = document.createElement('button'); chipEl.setAttribute('data-msg', 'Plan my week 8');
      const entries = [
        ['sendCoachChip', () => sendCoachChip('Am I progressing on track?'), 'chat'],
        ['coachBlockAction', () => coachBlockAction(chipEl), 'chat'],
        ['coachCardAction', () => coachCardAction('Swap squats for leg press today'), 'log'],
        ['startPlateauFix', () => startPlateauFix(), 'log'],
        ['startProgression', () => startProgression(), 'log'],
        ['startRecoveryAdjust', () => startRecoveryAdjust(), 'log'],
        ['startWeeklyReview', () => startWeeklyReview(), 'log'],
        ['handleCoachCardAsk', () => handleCoachCardAsk({ key: 'Enter', target: { value: 'How was my week?' } }), 'log'],
      ];
      r.entries = {};
      for (const [name, fn, where] of entries) {
        ['kt_last_plateau_week', 'kt_last_prog_week', 'kt_readiness_adj_seen', 'kt_last_review_week'].forEach((k) => lsDel(k));
        if (where === 'chat') { await __open(); } else { switchTab('log'); await __wait(20); }
        const u0 = __users(), t0 = __turns.length;
        fn(); await __idle();
        r.entries[name] = { users: __users() - u0, turns: __turns.length - t0, input: !!document.getElementById('coach-input'), shown: !!_fp.shown.coach, ph: !!document.querySelector('.kt-fp-ph') };
      }
      return r;
    }, IN_PAGE);
    assert(out.nonce.a.ok && !out.nonce.a.duplicate && out.nonce.b.ok && out.nonce.b.duplicate && out.nonce.a.id === out.nonce.b.id && out.nonce.users === 1 && out.nonce.turns === 1 &&
      out.nonce.model.indexOf(out.nonce.a.id) >= 0, 'one send per nonce, its message id in the answer and the model: ' + JSON.stringify(out.nonce));
    assert(out.speech && out.speech.id && /^Coach: On it\./.test(out.speech.text), 'the model says what VoiceOver hears: ' + JSON.stringify(out.speech));
    assert(out.chip.c.ok && out.chip.users === 2 && out.chip.turns === 2, 'coach.chip sends the chip: ' + JSON.stringify(out.chip));
    assert(out.action.stale.ok === false && out.action.stale.error === 'stale' && out.action.ok.ok && out.action.turns === 3 && out.action.last === 'Plan my week 7', 'coach.action: only the newest reply\'s chip sends: ' + JSON.stringify(out.action));
    assert(JSON.stringify(out.badArgs) === JSON.stringify(['bad-args', 'bad-args', 'bad-args', 'bad-args']) && out.unknown === 'unknown-intent', 'bad arguments and unknown intents are named: ' + JSON.stringify([out.badArgs, out.unknown]));
    for (const name of Object.keys(out.entries)) {
      const e = out.entries[name];
      assert(e.users === 1 && e.turns === 1 && !e.input && e.shown && e.ph, name + ': one message, one API call, the native chat up: ' + JSON.stringify(e));
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// A card tapped while a reply is in flight, under the native chat: coachSend answered busy and the
// question was dropped (the owner landed in the chat and it was not there). It waits as the
// composer's draft, the native chat's place for the web's box, with its label and its card's stamp.
serial('C3: under the native chat a card tapped while a reply is in flight waits as the composer\'s draft, and keeps its label and stamp for the owner\'s Send', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30); await __open();
      window._progressionLifts = () => [{ name: 'Bench Press', weight: 185, rpe: 7, sets: 3 }];
      lsDel('kt_last_prog_week'); switchTab('log'); await __wait(20);
      coachLoading = true;
      startProgression(); await __wait(30);
      const d = __model().composer.draft;
      r.busy = { shown: !!_fp.shown.coach, draft: d && d.text, users: __users(), stamp: lsGet('kt_last_prog_week'), due: _progressionDue() };
      coachLoading = false; render(); await __wait(20);
      const t0 = __turns.length;
      r.send = d ? await FPScreens.call('coach.send', { text: d.text, nonce: 'n-wait' }) : null; await __idle();
      const users = coachMessages.filter((m) => m.role === 'user');
      r.after = { users: users.length, seed: users.length ? users[users.length - 1]._seed || null : null, turns: __turns.length - t0, stamp: lsGet('kt_last_prog_week'), week: currentWeek,
        due: _progressionDue(), draft: __model().composer.draft, label: (__model().messages.filter((m) => m.role === 'user').slice(-1)[0] || {}).seed };
      return r;
    }, IN_PAGE);
    assert(out.busy.shown && /^Last week these main lifts/.test(out.busy.draft) && out.busy.users === 0 && out.busy.stamp == null && out.busy.due === true,
      'busy: the chat opens with the prompt as its composer\'s draft, nothing sent or stamped: ' + JSON.stringify(out.busy));
    assert(out.send && out.send.ok && out.after.users === 1 && out.after.seed === 'Progression check' && out.after.label === 'Progression check' && out.after.turns === 1 &&
      out.after.stamp === out.after.week && out.after.due === false && out.after.draft === null, 'the owner sends it: its label, its stamp, the draft spent: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C3: keep and undo by id after the cap; the restore confirm is forwarded, then the toast; Undo toasts and stale answers', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30);
      _snapshotRoutineForUndo('coach:t118c');
      const ex = getSessionExercises('Push')[0];
      const fill = [];
      for (let k = 0; k < 59; k++) fill.push(k % 2 ? { role: 'assistant', content: 'a' + k } : { role: 'user', content: 'q' + k });
      fill.push({ role: 'assistant', content: 'Done.', _undo: 'coach:t118c', _tools: [{ name: 'set_exercise_weight', input: { name: ex.name, weight: 100 }, result: { ok: true }, units: { w: 'lb', d: 'km' } }] });
      coachMessages = _coachMids(fill); saveCoachHistory();
      await __open();
      const card = __model().messages.find((m) => m.ledger);
      r.card = { id: card.id, canUndo: card.ledger.canUndo, actions: card.ledger.actions.map((a) => a.do) };
      // the next message lands (the cap drops the oldest): Keep by id still finds the card
      _pushCoach({ role: 'user', content: 'next' }); saveCoachHistory(); render(); await __wait(20);
      r.keep = await FPScreens.call('coach.keep', { id: card.id }); await __wait(20);
      r.keepModel = { ledger: (__model().messages.find((m) => m.id === card.id) || {}).ledger || null, any: __model().messages.some((m) => m.ledger), gone: await FPScreens.call('coach.keep', { id: 'm0.gone' }) };
      // Undo by id: the page's confirm goes to the shell, no web sheet; yes restores, the toast goes too
      coachMessages[_coachIdx(card.id)]._ledgerSeen = false; saveCoachHistory(); render(); await __wait(20);
      r.undo = await FPScreens.call('coach.undo', { id: card.id }); await __wait(20);
      const cf = __fpShell.of('confirm').slice(-1)[0];
      r.confirm = { cf, sheet: !!document.querySelector('.kt-close-sheet') };
      const t0 = __fpShell.of('toast').length;
      r.yes = await FPScreens.call('confirm', { id: cf.id, yes: true }); await __wait(30);
      r.after = { toasts: __fpShell.of('toast').slice(t0), web: document.getElementById('toast').classList.contains('show'), ledger: __model().messages.some((m) => m.ledger),
        weight: getSessionExercises('Push')[0].weight === ex.weight, again: await FPScreens.call('confirm', { id: cf.id, yes: true }) };
      // no previous programme: its toast goes to the shell; Reset asks (red), and No changes nothing
      lsDel('kt_routine_backup');
      const t1 = __fpShell.of('toast').length;
      r.noBackup = { answer: await FPScreens.call('coach.restorePrevious', {}), toasts: __fpShell.of('toast').slice(t1) };
      await FPScreens.call('coach.regenerate', {}); await __wait(10);
      const reset = __fpShell.of('confirm').slice(-1)[0];
      r.reset = { reset, no: await FPScreens.call('confirm', { id: reset.id, yes: false }), still: hasCustomRoutine() };
      // an Undo toast while the native chat is up: the shell shows it, toast.undo runs its function once
      let undone = 0;
      showUndoToast('Bench Press removed', () => { undone++; });
      const ut = __fpShell.of('toast').slice(-1)[0];
      r.undoToast = { ut, first: await FPScreens.call('toast.undo', { id: ut.undo }), second: await FPScreens.call('toast.undo', { id: ut.undo }), undone };
      // the model switch: the toast too
      const switched = await FPScreens.call('coach.model', { model: 'claude-haiku-4-5-20251001' }); await __wait(20);   // the model is pushed at the next tick
      r.model = { answer: switched, now: coachModel, toast: __fpShell.of('toast').slice(-1)[0], header: __model().header.model, odd: await FPScreens.call('coach.model', { model: 'gpt-9' }) };
      return r;
    }, IN_PAGE);
    assert(out.card.canUndo && out.card.actions.join() === 'undo,keep', 'the card on the newest programme change, with Undo: ' + JSON.stringify(out.card));
    assert(out.keep.ok && out.keepModel.ledger === null && !out.keepModel.any && out.keepModel.gone.error === 'gone', 'Keep by id after the cap retires that card: ' + JSON.stringify([out.keep, out.keepModel]));
    assert(out.undo.ok && out.confirm.cf && out.confirm.cf.title === 'Restore previous programme?' && out.confirm.cf.confirm === 'Restore' && out.confirm.cf.cancel === 'Cancel' && out.confirm.cf.tone === 'accent' &&
      /set aside/.test(out.confirm.cf.body) && !out.confirm.sheet, 'Undo forwards the page\'s confirm, no web sheet: ' + JSON.stringify(out.confirm));
    assert(out.yes.ok && out.after.toasts.length === 1 && out.after.toasts[0].text === 'Previous programme restored' && out.after.toasts[0].style === 'ok' && !out.after.web && !out.after.ledger && out.after.weight &&
      out.after.again.error === 'stale', 'yes restores, its toast is forwarded, the card retires, a second answer is stale: ' + JSON.stringify(out.after));
    assert(out.noBackup.answer.ok && out.noBackup.toasts.length === 1 && out.noBackup.toasts[0].text === 'No previous programme saved', 'with nothing to restore the toast says so natively: ' + JSON.stringify(out.noBackup));
    assert(out.reset.reset.title === 'Reset your programme?' && out.reset.reset.tone === 'danger' && out.reset.no.ok && out.reset.still, 'Reset asks in red; No keeps the programme: ' + JSON.stringify(out.reset));
    assert(out.undoToast.ut.undo && out.undoToast.first.ok && out.undoToast.second.error === 'stale' && out.undoToast.undone === 1, 'an Undo toast runs once through toast.undo: ' + JSON.stringify(out.undoToast));
    assert(out.model.answer.ok && out.model.now === 'claude-haiku-4-5-20251001' && /Haiku 4\.5/.test(out.model.toast.text) && out.model.header.label === 'Haiku 4.5' && out.model.odd.error === 'unknown-model', 'coach.model switches, says so, and refuses a model it does not know: ' + JSON.stringify(out.model));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// The shell's model can be older than the page: an Undo tapped on a card the page has since changed
// restored whatever backup was current (the owner's Routines edit undone, or the coach's next change
// mid-reply undone with the old reply's kept). The web rebuilds its buttons on every paint.
serial('C3: keep and undo act only while the page\'s own card offers them: after a Routines edit, after the coach\'s next change mid-reply, or on a message with no card they answer stale and ask nothing', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30);
      const name = getSessionExercises('Push')[0].name, wNow = () => getCustomRoutine().weeks[currentWeek - 1].push.find((x) => x.name === name).weight;
      const setW = (w, scope) => _commitRoutine((cr) => { cr.weeks[currentWeek - 1].push.find((x) => x.name === name).weight = w; }, { scope, noRender: true });
      const plan = (w) => [{ name: 'set_exercise_weight', input: { name, weight: w }, result: { ok: true }, units: { w: 'lb', d: 'km' } }];
      const card = () => { const c = __model().messages.find((m) => m.ledger); return c ? { id: c.id, canUndo: c.ledger.canUndo, actions: c.ledger.actions.map((a) => a.do) } : null; };
      const asks = () => __fpShell.of('confirm').length;
      // R1: the coach's reply set 170 under its own undo point; its card offers Undo
      setW(170, 'coach:r1');
      coachMessages = _coachMids([{ role: 'user', content: 'Bump it', at: Date.now() - 9000 }, { role: 'assistant', content: 'Done.', at: Date.now() - 8000, _undo: 'coach:r1', _tools: plan(170) }]);
      saveCoachHistory(); await __open();
      const r1 = card(); r.r1 = r1;
      const userId = __model().messages[0].id;
      // A: the owner edits the lift in Routines since (its own undo point): the page's card says Got it
      setW(180, 'routines:1'); render(); await __wait(20);
      let a0 = asks();
      r.a = { card: card(), undo: await FPScreens.call('coach.undo', { id: r1.id }) }; await __wait(20);
      r.a.asked = asks() - a0; r.a.sheet = !!document.querySelector('.kt-close-sheet'); r.a.weight = wNow(); r.a.scope = localStorage.getItem('kt_routine_backup_scope');
      // a message with no card: nothing to keep or undo
      r.a.userUndo = await FPScreens.call('coach.undo', { id: userId }); r.a.userKeep = await FPScreens.call('coach.keep', { id: userId }); await __wait(20);
      r.a.askedAfter = asks() - a0;
      // Got it still retires the card (it is up); once it is gone a second keep is stale
      r.a.keep = await FPScreens.call('coach.keep', { id: r1.id }); await __wait(20);
      r.a.keep2 = await FPScreens.call('coach.keep', { id: r1.id }); r.a.cardAfter = card();
      // I: R2's card offers Undo; the owner sends again and the coach's first tool call commits mid-reply
      setW(175, 'coach:r2');
      _pushCoach({ role: 'assistant', content: 'Set to 175.', _undo: 'coach:r2', _tools: plan(175) }); saveCoachHistory(); render(); await __wait(20);
      const r2 = card(); r.r2 = r2;
      let release, chat = 0; const held = new Promise((res) => { release = res; });
      const reply = (content, stop) => new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content, stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      window.fetch = async (url, o) => {
        const body = JSON.parse(o.body);
        if (!body.tools) return reply([{ type: 'text', text: '{"message":"ok","actions":[]}' }], 'end_turn');
        if (++chat === 1) return reply([{ type: 'tool_use', id: 'tu1', name: 'set_exercise_weight', input: { name, weight: 190 } }], 'tool_use');
        await held;
        return reply([{ type: 'text', text: 'Moved it to 190.' }], 'end_turn');
      };
      r.i = { send: await FPScreens.call('coach.send', { text: 'Make it 190', nonce: 'n-i' }) };
      for (let k = 0; k < 150 && wNow() !== 190; k++) await __wait(20);
      a0 = asks();
      r.i.mid = { weight: wNow(), loading: coachLoading, scope: localStorage.getItem('kt_routine_backup_scope'), card: card() };
      r.i.undo = await FPScreens.call('coach.undo', { id: r2.id }); await __wait(20);
      r.i.asked = asks() - a0; r.i.weight = wNow();
      release(); await __idle();
      // the new reply's card is the one that offers Undo now, and its Undo still asks
      const r3 = card(); r.r3 = r3;
      a0 = asks();
      r.r3.undo = await FPScreens.call('coach.undo', { id: r3.id }); await __wait(20);
      const cf = __fpShell.of('confirm').slice(-1)[0];
      r.r3.asked = asks() - a0; r.r3.title = cf && cf.title;
      r.r3.no = cf ? await FPScreens.call('confirm', { id: cf.id, yes: false }) : null; await __wait(20);
      r.r3.weight = wNow();
      return r;
    }, IN_PAGE);
    assert(out.r1 && out.r1.canUndo && out.r1.actions.join() === 'undo,keep', 'R1\'s card offers Undo: ' + JSON.stringify(out.r1));
    assert(out.a.card && out.a.card.id === out.r1.id && !out.a.card.canUndo && out.a.card.actions.join() === 'gotIt', 'after a Routines edit the page\'s card says Got it: ' + JSON.stringify(out.a.card));
    assert(out.a.undo.ok === false && out.a.undo.error === 'stale' && out.a.asked === 0 && !out.a.sheet && out.a.weight === 180 && out.a.scope === 'routines:1',
      'an Undo from an older model answers stale, asks nothing and keeps the owner\'s edit: ' + JSON.stringify(out.a));
    assert(out.a.userUndo.error === 'stale' && out.a.userKeep.error === 'stale' && out.a.askedAfter === 0, 'a message with no card: keep and undo are stale: ' + JSON.stringify(out.a));
    assert(out.a.keep.ok && out.a.keep2.error === 'stale' && out.a.cardAfter === null, 'Got it retires the card; a second keep is stale: ' + JSON.stringify(out.a));
    assert(out.r2 && out.r2.canUndo && out.i.send.ok, 'R2\'s card offers Undo, and the owner\'s next message goes: ' + JSON.stringify([out.r2, out.i.send]));
    assert(out.i.mid.weight === 190 && out.i.mid.loading && /^coach:\d+$/.test(out.i.mid.scope) && (!out.i.mid.card || !out.i.mid.card.canUndo),
      'mid-reply the coach\'s first change is saved under the reply\'s own undo point: ' + JSON.stringify(out.i.mid));
    assert(out.i.undo.ok === false && out.i.undo.error === 'stale' && out.i.asked === 0 && out.i.weight === 190, 'R2\'s Undo mid-reply answers stale and asks nothing: ' + JSON.stringify(out.i));
    assert(out.r3 && out.r3.id !== out.r2.id && out.r3.canUndo && out.r3.undo.ok && out.r3.asked === 1 && out.r3.title === 'Restore previous programme?' && out.r3.no.ok && out.r3.weight === 190,
      'the new reply\'s card offers Undo, and its Undo asks: ' + JSON.stringify(out.r3));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// The web's Try again exists only on a trailing failure, and its Stop ignores a press in a turn's
// first half second (the second tap of a double tap on Send): the intents keep both rules.
serial('C3: coach.retry acts only where the chat offers Try again; coach.stop ignores a press in a turn\'s first half second, as the web\'s Stop does', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30); await __open();
      const at = Date.now() - 5000;
      const tail = (last) => { coachMessages = _coachMids([{ role: 'user', content: 'How is my week?', at }, last]); saveCoachHistory(); render(); };
      const chip = () => __model().messages.slice(-1)[0].chip;
      const tryIt = async (last) => {
        tail(last); await __wait(20);
        const t0 = __turns.length, n0 = coachMessages.length, c = chip();
        const a = await FPScreens.call('coach.retry', {}); await __idle();
        return { chip: c, a, turns: __turns.length - t0, added: coachMessages.length - n0, last: coachMessages[coachMessages.length - 1].content };
      };
      r.good = await tryIt({ role: 'assistant', content: 'A solid week.', at });
      r.key = await tryIt({ role: 'assistant', content: 'Coach didn\'t respond (401).', _error: true, _local: true, _errKind: 'key', at });
      r.billing = await tryIt({ role: 'assistant', content: 'Out of credit.', _error: true, _local: true, _errKind: 'billing', at });
      r.error = await tryIt({ role: 'assistant', content: 'Coach didn\'t respond (network error).', _error: true, _local: true, at });
      r.stopped = await tryIt({ role: 'assistant', content: 'Stopped.', _local: true, _stopped: true, at });
      // Stop: a reply held in flight; a press in its first half second is ignored, a later one stops it
      let release; const held = new Promise((res) => { release = res; });
      const api = window.fetch;
      window.fetch = async (url, o) => { const body = JSON.parse(o.body); if (body.tools) await held; return api(url, o); };
      tail({ role: 'assistant', content: 'A solid week.', at });
      r.send = await FPScreens.call('coach.send', { text: 'And next week?', nonce: 'n-stop' });
      r.early = await FPScreens.call('coach.stop', {});
      r.earlyLoading = coachLoading;
      await __wait(550);
      r.late = await FPScreens.call('coach.stop', {});
      r.lateState = { loading: coachLoading, last: coachMessages[coachMessages.length - 1].content };
      r.idle = await FPScreens.call('coach.stop', {});
      release(); await __wait(50);
      return r;
    }, IN_PAGE);
    assert(out.good.chip === null && out.good.a.ok === false && out.good.a.error === 'stale' && out.good.turns === 0 && out.good.added === 0,
      'after a good reply there is no Try again: retry is stale and calls nothing: ' + JSON.stringify(out.good));
    assert(out.key.chip === 'settings' && out.key.a.error === 'stale' && out.key.turns === 0, 'a key error offers Open Settings, not Try again: ' + JSON.stringify(out.key));
    assert(out.billing.chip === null && out.billing.a.error === 'stale' && out.billing.turns === 0, 'out of credit offers nothing to retry: ' + JSON.stringify(out.billing));
    assert(out.error.chip === 'retry' && out.error.a.ok && out.error.turns === 1 && out.error.last === 'On it.', 'a failed turn\'s Try again runs it again: ' + JSON.stringify(out.error));
    assert(out.stopped.chip === 'retry' && out.stopped.a.ok && out.stopped.turns === 1 && out.stopped.last === 'On it.', 'a stopped turn\'s Try again runs it again: ' + JSON.stringify(out.stopped));
    assert(out.send.ok && out.early.ok === false && out.early.error === 'just-sent' && out.earlyLoading, 'a Stop in the turn\'s first half second is ignored: ' + JSON.stringify([out.send, out.early, out.earlyLoading]));
    assert(out.late.ok && !out.lateState.loading && out.lateState.last === 'Stopped.' && out.idle.error === 'idle', 'a later Stop stops it; with nothing in flight it is idle: ' + JSON.stringify([out.late, out.lateState, out.idle]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C3: a shared photo and its comment reach the native composer; Build day drafts; setup shows Cancel and no Back', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      await __wait(30);
      Capacitor.Plugins.TrovoShare = { getPendingShare: () => Promise.resolve({ imageBase64: 'UEhPVE8=', comment: 'Form check on this one?' }) };
      await checkPendingShare(); await __wait(300);
      const c = __model().composer;
      r.share = { shown: !!_fp.shown.coach, image: c.image, draft: c.draft, input: !!document.getElementById('coach-input') };
      r.img = await FPScreens.call('coach.image', { key: c.image.key });
      r.gone = await FPScreens.call('coach.image', { key: 'p0.nope' });
      r.taken = await FPScreens.call('coach.draftTaken', { nonce: c.draft.nonce }); await __wait(20);
      r.takenModel = __model().composer.draft; r.takenWeb = _coachDraft.v; r.takenAgain = await FPScreens.call('coach.draftTaken', { nonce: c.draft.nonce });
      const sent = await FPScreens.call('coach.send', { text: 'Form check on this one?', usePending: true, nonce: 'n-photo' }); await __idle();
      const msg = __model().messages.find((m) => m.id === sent.id);
      r.sent = { ok: sent.ok, image: msg && msg.image, pending: __model().composer.image, api: JSON.stringify(__turns[0]).indexOf('UEhPVE8=') >= 0 };
      // a photo the native composer picked: its bubble keys the native copy by nonce
      const pic = await FPScreens.call('coach.send', { text: '', image: { mediaType: 'image/jpeg', data: 'TkFUSVZF' }, nonce: 'n-pic' }); await __idle();
      r.pic = (__model().messages.find((m) => m.id === pic.id) || {}).image;
      // Build day's Ask: a draft for the native composer, nothing sent
      const u = __users(); switchTab('log'); _bdSlot = 'Arms'; _bdAskCoach(); await __wait(300);
      r.build = { draft: __model().composer.draft, sent: __users() - u, shown: !!_fp.shown.coach };
      // setup: Cancel, no Back, no photo button; Back refused; Cancel asks first (forwarded)
      _setIntakeMode(true); coachMessages = []; _pushCoach({ role: 'user', content: 'I want to generate my training programme.', _seed: 'Programme setup' }); render(); await __wait(30);
      const im = __model();
      r.intake = { header: im.header, composer: im.composer, empty: im.empty, seed: im.messages[0].seed, back: await FPScreens.call('coach.back', {}) };
      await FPScreens.call('coach.cancelIntake', {}); await __wait(10);
      const cf = __fpShell.of('confirm').slice(-1)[0];
      r.cancel = { title: cf.title, label: cf.confirm, tone: cf.tone, yes: await FPScreens.call('confirm', { id: cf.id, yes: true }), intake: intakeMode, msgs: coachMessages.length };
      r.notIntake = await FPScreens.call('coach.cancelIntake', {});
      // Back leaves the chat (dismiss), Open Settings goes to Settings
      await __open(); const d0 = __fpShell.of('dismiss').length;
      r.back = { answer: await FPScreens.call('coach.back', {}), view: coachView, dismissed: __fpShell.of('dismiss').length - d0 };
      await __open(); r.settings = { answer: await FPScreens.call('coach.openSettings', {}), tab: currentTab, shown: !!_fp.shown.coach };
      return r;
    }, IN_PAGE);
    assert(out.share.shown && !out.share.input && out.share.image && /^p\d+\./.test(out.share.image.key) && out.share.draft && out.share.draft.text === 'Form check on this one?' && out.share.draft.nonce,
      'the shared photo and its comment are in the native composer\'s model: ' + JSON.stringify(out.share));
    assert(out.img.ok && out.img.data === 'UEhPVE8=' && out.img.mediaType === 'image/jpeg' && out.gone.error === 'gone', 'coach.image gives the pending photo by key: ' + JSON.stringify([out.img.ok, out.gone]));
    assert(out.taken.ok && out.takenModel === null && out.takenWeb === '' && out.takenAgain.error === 'stale', 'the draft is taken once (and is not the web composer\'s any more): ' + JSON.stringify([out.taken, out.takenModel, out.takenWeb, out.takenAgain]));
    assert(out.sent.ok && out.sent.image && out.sent.image.key === out.share.image.key && out.sent.pending === null && out.sent.api, 'sent with the pending photo, keyed: ' + JSON.stringify(out.sent));
    assert(out.pic && out.pic.key === 'n:n-pic', 'a picked photo is keyed by its nonce: ' + JSON.stringify(out.pic));
    assert(out.build.draft && /^Build my .+ day: /.test(out.build.draft.text) && out.build.sent === 0 && out.build.shown, 'Build day drafts for the native composer: ' + JSON.stringify(out.build));
    assert(out.intake.header.back === false && out.intake.header.cancel === true && out.intake.header.model === null && out.intake.header.title === 'Build your plan' &&
      out.intake.composer.attach === false && out.intake.composer.placeholder === 'Answer the Coach…' && out.intake.empty === null && out.intake.seed === 'Programme setup' &&
      out.intake.back.error === 'intake', 'setup: Cancel and no Back: ' + JSON.stringify(out.intake));
    assert(out.cancel.title === 'Stop programme setup?' && out.cancel.label === 'Stop setup' && out.cancel.yes.ok && !out.cancel.intake && out.cancel.msgs === 0 && out.notIntake.error === 'not-intake', 'Cancel asks, then ends setup: ' + JSON.stringify([out.cancel, out.notIntake]));
    assert(out.back.answer.ok && out.back.view === 'home' && out.back.dismissed === 1 && out.settings.answer.ok && out.settings.tab === 'settings' && !out.settings.shown, 'Back and Open Settings leave the chat: ' + JSON.stringify([out.back, out.settings]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C3: each switch brings back the web chat (FP_NATIVE, kt_native_off and the About switch, screens.off, a refused present, a shell without the screen)', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      const web = () => !!document.getElementById('coach-input') && !document.querySelector('.kt-fp-ph');
      await __wait(30); await __open();
      r.start = { shown: !!_fp.shown.coach, web: web() };
      // the page constant
      FP_NATIVE = false; render(); await __wait(20);
      r.constant = { shown: !!_fp.shown.coach, web: web(), dismissed: __fpShell.of('dismiss').length };
      FP_NATIVE = true; render(); await __wait(20);
      r.constantBack = { shown: !!_fp.shown.coach, web: web() };
      // a draft the native composer has not taken yet goes with the switch to the web composer
      coachPrefill('Draft for later'); await __wait(20);
      r.nativeDraft = __model().composer.draft && __model().composer.draft.text;
      // this device's switch, and its row in Settings > About
      switchTab('settings'); await __wait(20);
      r.rowOn = (document.getElementById('screen').innerText.match(/Native Coach chat[\s\S]{0,80}/) || [''])[0];
      toggleNativeChat(); await __wait(20);
      r.rowOff = (document.getElementById('screen').innerText.match(/Native Coach chat[\s\S]{0,80}/) || [''])[0];
      r.key = localStorage.getItem('kt_native_off');
      await __open();
      r.device = { shown: !!_fp.shown.coach, web: web(), draft: (document.getElementById('coach-input') || {}).value };
      document.getElementById('coach-input').value = ''; _coachDraft = { v: '', s: 0, e: 0, focus: false };
      switchTab('settings'); toggleNativeChat(); await __open();
      r.deviceBack = { shown: !!_fp.shown.coach, web: web(), key: localStorage.getItem('kt_native_off') };
      // the shell's screens.off: the web chat for the rest of the document
      FPScreens.call('shell.covered', { on: true });
      const off = await FPScreens.call('screens.off', { screen: 'coach', why: 'failures' }); await __wait(20);
      r.off = { off, shown: !!_fp.shown.coach, web: web(), covered: _fpCovered() };
      switchTab('log'); await __open();
      r.offStays = { shown: !!_fp.shown.coach, web: web() };
      return r;
    }, IN_PAGE);
    assert(out.start.shown && !out.start.web, 'the native chat is up: ' + JSON.stringify(out.start));
    assert(!out.constant.shown && out.constant.web && out.constant.dismissed === 1 && out.constantBack.shown && !out.constantBack.web, 'FP_NATIVE off brings the web chat back, on brings the native one: ' + JSON.stringify([out.constant, out.constantBack]));
    assert(/Native Coach chat[\s\S]*On/.test(out.rowOn) && /Off/.test(out.rowOff) && out.key === '1' && !out.device.shown && out.device.web, 'the About switch (kt_native_off) brings the web chat back: ' + JSON.stringify([out.rowOn, out.rowOff, out.device]));
    assert(out.nativeDraft === 'Draft for later' && out.device.draft === 'Draft for later', 'a draft the native composer had not taken is in the web composer: ' + JSON.stringify([out.nativeDraft, out.device]));
    assert(out.deviceBack.shown && !out.deviceBack.web && out.deviceBack.key === null, 'and turns the native chat on again: ' + JSON.stringify(out.deviceBack));
    assert(out.off.off.ok && !out.off.shown && out.off.web && !out.off.covered && !out.offStays.shown && out.offStays.web, 'screens.off: the web chat for the rest of the document: ' + JSON.stringify([out.off, out.offStays]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
  // the shell refuses to present: the web chat
  const refused = await shellBoot('coach');
  try {
    const out = await refused.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      await __wait(30); __fpShell.refuse.present = 'cannot present';
      await __open(); await __wait(40);
      return { off: _fp.off.coach, shown: !!_fp.shown.coach, web: !!document.getElementById('coach-input') };
    }, IN_PAGE);
    assert(out.off === 'present' && !out.shown && out.web, 'a present the shell refuses gives the web chat back: ' + JSON.stringify(out));
    assert(refused.errors.length === 0, 'no page errors: ' + refused.errors.join('|'));
  } finally { await refused.close(); }
  // a model the page cannot build (a page bug): never presented, the web chat, and the page goes on
  const broken = await shellBoot('coach');
  try {
    const out = await broken.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      await __wait(30);
      const real = _coachModel; _coachModel = () => { throw new Error('boom'); };
      await __open(); await __wait(40);
      const r = { off: _fp.off.coach, shown: !!_fp.shown.coach, present: __fpShell.of('present').length, web: !!document.getElementById('coach-input'),
        log: __fpShell.of('log').some((l) => /model failed: boom/.test(l.text)), snap: await FPScreens.call('coach.snapshot', {}) };
      _coachModel = real;
      return r;
    }, IN_PAGE);
    assert(out.off === 'model' && !out.shown && out.present === 0 && out.web && out.log && out.snap.error === 'exception', 'a model that throws keeps the web chat (and the shell hears why): ' + JSON.stringify(out));
    assert(broken.errors.length === 0, 'no page errors: ' + broken.errors.join('|'));
  } finally { await broken.close(); }
  // a hello answer outside the contracts this page speaks (a shell that does not negotiate, FPCore's
  // never answers above the page's v): no native screen, and the shell hears why
  const odd = await shellBoot('coach');
  try {
    const out = await odd.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      await __wait(30);
      const again = async (answer) => {
        Capacitor.Plugins.TrovoShell.hello = (a) => { __fpShell.calls.push(['hello', a]); return Promise.resolve(answer); };
        switchTab('log'); await __wait(20);
        const l0 = __fpShell.of('log').length;
        _fp.hello = null; _fp.v = 0; _fpHello(); await __wait(20);
        const p0 = __fpShell.of('present').length;
        await __open();
        return { v: _fp.v, live: _fpLive('coach'), present: __fpShell.of('present').length - p0, web: !!document.getElementById('coach-input'), logs: __fpShell.of('log').slice(l0).map((l) => l.text) };
      };
      return { v2: await again({ v: 2, screens: ['coach'] }), v0: await again({ v: 0, screens: ['coach'], why: 'page-too-old' }), v1: await again({ v: 1, screens: ['coach'] }) };
    }, IN_PAGE);
    assert(out.v2.v === 0 && !out.v2.live && out.v2.present === 0 && out.v2.web && out.v2.logs.some((t) => /hello v2/.test(t) && /v1/.test(t)), 'a hello answer of v2 is no contract this page speaks: the web chat: ' + JSON.stringify(out.v2));
    assert(out.v0.v === 0 && !out.v0.live && out.v0.present === 0 && out.v0.web, 'v0: the web chat: ' + JSON.stringify(out.v0));
    assert(out.v1.v === 1 && out.v1.live && out.v1.present === 1 && !out.v1.web, 'v1: the native chat: ' + JSON.stringify(out.v1));
    assert(odd.errors.length === 0, 'no page errors: ' + odd.errors.join('|'));
  } finally { await odd.close(); }
  // a shell whose flag has no coach screen (its policy file, its breaker): hello answers none
  for (const variant of ['inert', { v: 1, min: 1, shell: '60', screens: ['settings'] }]) {
    const tag = (typeof variant === 'string' ? variant : 'no coach') + ': ';
    const app2 = await shellBoot(variant);
    try {
      const out = await app2.page.evaluate(async (IN_PAGE) => {
        eval(IN_PAGE);
        await __wait(30); await __open();
        const toastBefore = __fpShell.of('toast').length; showToast('Saved');
        switchTab('settings'); await __wait(20);
        return { hello: __fpShell.of('hello'), v: _fp.v, live: _fpLive('coach'), present: __fpShell.of('present').length, models: __fpShell.of('model').length,
          toasts: __fpShell.of('toast').length - toastBefore, row: /Native Coach chat/.test(document.getElementById('screen').innerText) };
      }, IN_PAGE);
      assert(out.hello.length === 1 && out.v === 1 && !out.live && out.present === 0 && out.models === 0 && out.toasts === 0 && !out.row, tag + 'hello answers no screen: the web chat, nothing forwarded, no switch: ' + JSON.stringify(out));
      assert(app2.errors.length === 0, tag + 'no page errors: ' + app2.errors.join('|'));
    } finally { await app2.close(); }
  }
});

// A draft the owner already sent (or cleared) in the web composer came back in the native composer
// when the native chat did; the first model of a new presentation spoke the reply from before it.
serial('C3: a draft sent or changed in a composer is not offered again (one nobody touched is); a presentation starts with no speech from before it', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      const draft = () => { const d = __model().composer.draft; return d ? d.text : null; };
      const native = async (on) => { switchTab('settings'); if (_fpDeviceOff() === on) toggleNativeChat(); await __open(); };
      await __wait(30); await __open();
      // the native chat is offered a draft; the owner turns it off and sends the draft from the web composer
      coachPrefill('Draft A'); await __wait(20);
      r.offered = draft();
      await native(false);
      r.webA = (document.getElementById('coach-input') || {}).value;
      sendCoachMessage(); await __idle();
      await native(true);
      r.afterSend = draft();
      // the owner clears a draft in the web composer
      coachPrefill('Draft B'); await __wait(20);
      await native(false);
      const box = document.getElementById('coach-input'); r.webB = box.value; box.value = ''; render(); await __wait(20);
      await native(true);
      r.afterClear = draft();
      // the native composer sends the draft's words without taking it first
      coachPrefill('Draft C'); await __wait(20);
      r.offeredC = draft();
      await FPScreens.call('coach.send', { text: 'Draft C', nonce: 'n-c' }); await __idle();
      r.afterNativeSend = draft();
      // a draft nobody has touched survives leaving the chat and coming back
      coachPrefill('Draft D'); await __wait(20); switchTab('log'); await __wait(20); await __open();
      r.kept = draft();
      await FPScreens.call('coach.draftTaken', { nonce: __model().composer.draft.nonce });
      // a reply, then the chat is left and opened again: the new presentation's first model says nothing
      await FPScreens.call('coach.send', { text: 'Hi coach', nonce: 'n-k' }); await __idle();
      r.spoken = __model().speech;
      switchTab('log'); await __wait(20);
      let m0 = __fpShell.of('model').length;
      await __open();
      r.reopened = (__fpShell.models()[m0] || {}).speech;
      // a reply that lands while the chat is not up is not spoken when it opens either
      switchTab('log'); await __wait(20);
      coachSend('While away'); await __idle();
      m0 = __fpShell.of('model').length;
      await __open();
      r.away = { first: (__fpShell.models()[m0] || {}).speech, last: coachMessages[coachMessages.length - 1].content };
      return r;
    }, IN_PAGE);
    assert(out.offered === 'Draft A' && out.webA === 'Draft A', 'the draft is offered natively, and the web composer has it once the native chat is off: ' + JSON.stringify(out));
    assert(out.afterSend === null, 'a draft sent from the web composer is not offered again natively: ' + JSON.stringify(out));
    assert(out.webB === 'Draft B' && out.afterClear === null, 'a draft cleared in the web composer is not offered again natively: ' + JSON.stringify(out));
    assert(out.offeredC === 'Draft C' && out.afterNativeSend === null, 'a draft whose words were sent is not offered again: ' + JSON.stringify(out));
    assert(out.kept === 'Draft D', 'a draft nobody touched is still offered after leaving the chat: ' + JSON.stringify(out));
    assert(out.spoken && /^Coach: On it\./.test(out.spoken.text) && !out.reopened, 'the reply is spoken while the chat is up, and not again when it opens again: ' + JSON.stringify([out.spoken, out.reopened]));
    assert(out.away.last === 'On it.' && !out.away.first, 'a reply that landed while the chat was not up is not spoken when it opens: ' + JSON.stringify(out.away));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C3: a reload is a new boot (a stale confirm answers stale, old ids find nothing); no programmatic focus while covered', async () => {
  const app = await shellBoot('coach');
  try {
    const before = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      await __wait(30);
      lsSet('kt_routine_backup', getCustomRoutine());
      coachMessages = _coachMids([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }]); saveCoachHistory();
      await __open();
      await FPScreens.call('coach.restorePrevious', {}); await __wait(10);
      return { boot: _fpBoot, confirm: __fpShell.of('confirm').slice(-1)[0], id: __model().messages[1].id };
    }, IN_PAGE);
    await app.page.reload({ waitUntil: 'load' });
    await app.page.waitForFunction(() => typeof window.render === 'function');
    const after = await app.page.evaluate(async ({ IN_PAGE, before }) => {
      eval(IN_PAGE);
      await __wait(40);
      return { hello: __fpShell.of('hello'), boot: _fpBoot, stale: await FPScreens.call('confirm', { id: before.confirm.id, yes: true }), keep: await FPScreens.call('coach.keep', { id: before.id }), restored: hasRoutineBackup() };
    }, { IN_PAGE, before });
    assert(before.confirm && before.confirm.id.indexOf(before.boot) > 0, 'the confirm id names its boot: ' + JSON.stringify(before.confirm));
    assert(after.hello.length === 1 && after.hello[0].boot === after.boot && after.boot !== before.boot, 'a reload says hello again with a new boot: ' + JSON.stringify([after.hello, before.boot]));
    assert(after.stale.ok === false && after.stale.error === 'stale' && after.keep.error === 'gone', 'a confirm from before the reload answers stale; an old id finds nothing: ' + JSON.stringify(after));
    // covered: render, the sheet observer and the chat's draft move no focus; the shell's cover blurs
    const focus = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      switchTab('log'); switchLogSub('body'); await __wait(30);
      const field = () => document.getElementById('bwVal');   // Log > Body's weight: render keeps a field by its id
      const f0 = field(); f0.focus();
      await FPScreens.call('shell.covered', { on: true });
      r.blurred = document.activeElement !== f0;
      field().focus(); render(); await __wait(20);
      r.render = { covered: _fpCovered(), focused: document.activeElement === field() };
      await FPScreens.call('shell.covered', { on: false });
      field().focus(); render(); await __wait(20);
      r.renderUncovered = document.activeElement === field();
      // the sheet observer gives focus back when a sheet closes, but not while covered
      const btn = document.querySelector('#screen button'); btn.id = btn.id || 't118-opener';
      const sheet = () => { btn.focus(); const el = document.createElement('div'); el.className = 'kt-sheet-overlay'; document.body.appendChild(el); return el; };
      await FPScreens.call('shell.covered', { on: true });
      let s = sheet(); await __wait(10); document.activeElement.blur(); s.remove(); await __wait(30);
      r.sheetCovered = document.activeElement === btn;
      await FPScreens.call('shell.covered', { on: false });
      s = sheet(); await __wait(10); document.activeElement.blur(); s.remove(); await __wait(30);
      r.sheetUncovered = document.activeElement === btn;
      // the web chat's draft refocus: not while covered (the native chat off for this check)
      FP_NATIVE = false; await __open();
      const box = document.getElementById('coach-input'); box.value = 'draft'; box.focus();
      await FPScreens.call('shell.covered', { on: true });
      box.focus(); render(); await __wait(20);
      r.draft = { value: document.getElementById('coach-input').value, focused: document.activeElement === document.getElementById('coach-input') };
      await FPScreens.call('shell.covered', { on: false }); FP_NATIVE = true;
      return r;
    }, IN_PAGE);
    assert(focus.blurred, 'the shell\'s cover blurs the page\'s field');
    assert(focus.render.covered && !focus.render.focused && focus.renderUncovered, 'render() refocuses a field only when uncovered: ' + JSON.stringify(focus));
    assert(!focus.sheetCovered && focus.sheetUncovered, 'the sheet observer gives focus back only when uncovered: ' + JSON.stringify(focus));
    assert(focus.draft.value === 'draft' && !focus.draft.focused, 'the chat keeps its draft but moves no focus while covered: ' + JSON.stringify(focus.draft));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// covered is the shell's word, but a page that takes its last native screen down itself (another tab,
// Back, Open Settings, a model it cannot build, a present refused) is uncovered then, as screens.off
// already did: it stayed covered (its toasts went to a shell showing nothing, no refocus) until the
// shell said covered:false.
serial('C3: once the page has taken its last native screen down it is no longer covered (its own dismiss, a broken model, a refused present), as after screens.off', async () => {
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      const r = {};
      const cover = async () => { await __open(); await FPScreens.call('shell.covered', { on: true }); return _fpCovered() && !!_fp.shown.coach; };
      await __wait(30);
      r.up = await cover();
      // another tab: dismissed and uncovered; a toast is the web's, and render refocuses again
      const d0 = __fpShell.of('dismiss').length;
      switchTab('log'); switchLogSub('body'); await __wait(30);
      const t0 = __fpShell.of('toast').length;
      showToast('Saved');
      const field = () => document.getElementById('bwVal'); field().focus(); render(); await __wait(20);
      r.tab = { dismissed: __fpShell.of('dismiss').length - d0, covered: _fpCovered(), toShell: __fpShell.of('toast').length - t0,
        web: document.getElementById('toast').classList.contains('show'), refocus: document.activeElement === field() };
      // Back and Open Settings, as the native chat sends them
      r.backUp = await cover(); await FPScreens.call('coach.back', {}); await __wait(20);
      r.back = { covered: _fpCovered(), view: coachView };
      r.settingsUp = await cover(); await FPScreens.call('coach.openSettings', {}); await __wait(20);
      r.settings = { covered: _fpCovered(), tab: currentTab };
      // a model the page cannot build takes the screen down
      r.brokenUp = await cover();
      const real = _coachModel; _coachModel = () => { throw new Error('boom'); };
      render(); await __wait(30);
      r.broken = { covered: _fpCovered(), shown: !!_fp.shown.coach, off: _fp.off.coach };
      _coachModel = real;
      return r;
    }, IN_PAGE);
    assert(out.up, 'the native chat is up and the shell says covered');
    assert(out.tab.dismissed === 1 && !out.tab.covered && out.tab.toShell === 0 && out.tab.web && out.tab.refocus, 'another tab: dismissed, uncovered, the web\'s toast, refocus again: ' + JSON.stringify(out.tab));
    assert(out.backUp && !out.back.covered && out.back.view === 'home', 'Back: uncovered: ' + JSON.stringify(out.back));
    assert(out.settingsUp && !out.settings.covered && out.settings.tab === 'settings', 'Open Settings: uncovered: ' + JSON.stringify(out.settings));
    assert(out.brokenUp && !out.broken.covered && !out.broken.shown && out.broken.off === 'model', 'a model that throws: down and uncovered: ' + JSON.stringify(out.broken));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
  // the shell said covered, then would not present
  const refused = await shellBoot('coach');
  try {
    const out = await refused.page.evaluate(async (IN_PAGE) => {
      eval(IN_PAGE);
      await __wait(30); __fpShell.refuse.present = 'cannot present';
      await FPScreens.call('shell.covered', { on: true });
      await __open(); await __wait(40);
      return { off: _fp.off.coach, covered: _fpCovered(), web: !!document.getElementById('coach-input') };
    }, IN_PAGE);
    assert(out.off === 'present' && !out.covered && out.web, 'a refused present: the web chat, uncovered: ' + JSON.stringify(out));
    assert(refused.errors.length === 0, 'no page errors: ' + refused.errors.join('|'));
  } finally { await refused.close(); }
});

serial('C3: every intent of contract v1 (FPCore intents.json) is known, and refuses missing arguments; no shell, no bridge', async () => {
  const intents = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'intents.json'), 'utf8')).intents;
  const app = await shellBoot('coach');
  try {
    const out = await app.page.evaluate(async ({ IN_PAGE, intents }) => {
      eval(IN_PAGE);
      await __wait(30); await __open();
      const r = [];
      for (const it of intents) {
        const required = Object.keys(it.args).filter((k) => !/\?$/.test(it.args[k]));
        const a = await FPScreens.call(it.name, {});
        r.push({ name: it.name, required, ok: a.ok, error: a.error || null });
        await __wait(5);
      }
      return r;
    }, { IN_PAGE, intents });
    for (const x of out) {
      assert(x.error !== 'unknown-intent', x.name + ': the page knows it');
      if (x.required.length) assert(x.ok === false && x.error === 'bad-args', x.name + ': missing ' + x.required.join(', ') + ' is bad-args: ' + JSON.stringify(x));
      else assert(x.error === null || ['idle', 'busy', 'not-intake', 'intake', 'stale', 'gone'].indexOf(x.error) >= 0, x.name + ': answers ok or with the page\'s reason: ' + JSON.stringify(x));
    }
    assert(out.length === intents.length && intents.length >= 22, 'every intent was called: ' + out.length);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
  // no shell (every shell up to 59, the PWA): no flag, no plugin, no bridge, the web chat
  const none = await shellBoot('none');
  try {
    const out = await none.page.evaluate(async (IN_PAGE) => {
      await new Promise((r) => setTimeout(r, 30));
      switchTab('coach'); openCoachChat(); await new Promise((r) => setTimeout(r, 30));
      return { flag: typeof window.__FP_SHELL, bridge: typeof window.FPScreens, mock: typeof window.__fpShell, hello: _fp.hello, web: !!document.getElementById('coach-input'), ph: !!document.querySelector('.kt-fp-ph') };
    }, IN_PAGE);
    assert(out.flag === 'undefined' && out.bridge === 'undefined' && out.mock === 'undefined' && out.hello === null && out.web && !out.ph, 'without the shell nothing is native: ' + JSON.stringify(out));
    assert(none.errors.length === 0, 'no page errors: ' + none.errors.join('|'));
  } finally { await none.close(); }
});

// Build 60's store half (plan task S6) injects the shell's flag before any shell carries TrovoShell (task C5):
// with the flag alone the bridge stays out (no FPScreens, no hello) and the chat is the web chat.
serial('C3 with S6: the shell\'s flag without TrovoShell (build 60 before the native chat) is inert: no bridge, no hello, the web chat', async () => {
  const app = await boot({ native: true, shell: 'none', init: 'window.__FP_SHELL = {v:1, min:1, shell:"60", screens:[]};',
    seed: { kt_apikey: 'sk-ant-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 30));
      switchTab('coach'); openCoachChat(); await new Promise((r) => setTimeout(r, 30));
      return { flag: !!_fpShellFlag(), plugin: _fpPlugin() == null, bridge: typeof window.FPScreens, hello: _fp.hello,
        web: !!document.getElementById('coach-input'), ph: !!document.querySelector('.kt-fp-ph') };
    });
    assert(out.flag && out.plugin && out.bridge === 'undefined' && out.hello === null && out.web && !out.ph, 'the flag alone is inert: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('C3: the coach models the page builds are FPCore\'s fixtures (tests/golden/dump-coach.js)', async () => {
  const bad = await require('../golden/dump-coach').drift();
  assert(bad.length === 0, 'the page builds different coach models for ' + bad.join(', ') + ': run node tests/golden/dump-coach.js, then swift test');
});
