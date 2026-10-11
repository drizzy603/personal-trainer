// The native coach chat's page side (plan tasks C1, C2, C3; decision.md sections 6 and 9).
// - C1: coachSend(text, {seed, image, usePending, nonce}) is the one DOM-free way into the coach, and
//   every entry point uses it: with no #coach-input on screen (the native chat has none) each sends
//   exactly one user message and one API call, and a card's week stamp is written only with its
//   question. A nonce sends once (the last 20 are remembered). coachPrefill drafts for the composer.
const { boot, assert, run } = require('../lib/harness');

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
