// Hunt 3 fixes, undo and restore:
// - A new round retires the old round's undo state: an earlier coach reply's PLAN CHANGES card
//   (and its Undo) goes, Restore Previous holds round 1 as it was just before the swap, an open
//   scope snapshots the new round, and restoring the other round drops ROUND N · WEEK 1 (H11).
// - The reply's undo point survives a relaunch (M21).
const { boot, assert, run } = require('../lib/harness');

const MOCK = `(replies) => { let n = 0; window.fetch = async () => new Response(JSON.stringify(replies[Math.min(n++, replies.length - 1)]), { status: 200, headers: { 'content-type': 'application/json' } }); }`;
const OHP_REPLY = [
  { content: [{ type: 'tool_use', id: 't1', name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Overhead Press', action: 'change', weight: 110 } }], stop_reason: 'tool_use', usage: {} },
  { content: [{ type: 'text', text: 'Done: Overhead Press goes to 110 lb from this week.' }], stop_reason: 'end_turn', usage: {} },
];
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const thisMonday = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };

run('a new round retires the old round\'s Undo; Restore Previous brings back round 1 as it was', async () => {
  const app = await boot({ native: true, seed: { kt_week: '11', kt_apikey: 'sk-test' } });
  try {
    const out = await app.page.evaluate(async ([MOCK, OHP_REPLY]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, ohp = (cr, w) => cr.weeks[w - 1].push.find(e => e.name === 'Overhead Press').weight;
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const ledger = async () => { switchTab('coach'); coachView = 'chat'; render(); await wait(30); const c = document.querySelector('.kt-ledger-card'); return c ? { undo: [...c.querySelectorAll('button')].some(b => /Undo/.test(b.textContent)) } : null; };
      eval(MOCK)(OHP_REPLY);
      coachMessages.push({ role: 'user', content: 'Make my overhead press heavier' }); saveCoachHistory();
      await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
      r.before = await ledger();
      // M21: the undo point is saved with the chat, so a relaunch still offers Undo
      loadCoachHistory();
      r.relaunch = await ledger();
      // an open Routines-style scope from before the swap
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Lateral Raise', currentWeek - 1, 25, { markOwner: true }), { scope: 'routines' });
      const round1 = localStorage.getItem('kt_routine');
      lsSet('kt_routine_next', { startsOn: todayISO(), at: todayISO() });
      const nb = _applyNextRound(false);
      r.swap = { ok: !!nb, cycle: getCustomRoutine().cycle, week: currentWeek, scope: localStorage.getItem('kt_routine_backup_scope'),
        backupIsRound1: JSON.stringify(lsGet('kt_routine_backup')) === round1, seen: coachMessages.filter(m => m._tools).every(m => m._ledgerSeen),
        stored: JSON.parse(localStorage.getItem('kt_coach_msgs')).filter(m => m._tools).every(m => m._ledgerSeen),
        scopeOpen: _routineScope };   // the 'routines' scope left open would take no snapshot of round 2
      r.after = await ledger();
      r.introBefore = !!lsGet('kt_round_intro');
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      const cr = getCustomRoutine();
      r.restored = { cycle: cr.cycle || 1, week: currentWeek, ohp11: ohp(cr, 11), intro: !!lsGet('kt_round_intro'), backupCycle: (lsGet('kt_routine_backup') || {}).cycle };
      return r;
    }, [MOCK, OHP_REPLY]);
    assert(out.before && out.before.undo, 'the reply offers Undo: ' + JSON.stringify(out.before));
    assert(out.relaunch && out.relaunch.undo, 'Undo survives a relaunch (M21): ' + JSON.stringify(out.relaunch));
    assert(out.swap.ok && out.swap.cycle === 2 && out.swap.week === 1 && out.swap.scope === 'round:2' && out.swap.backupIsRound1, 'the swap keeps round 1 as Restore Previous under its own scope: ' + JSON.stringify(out.swap));
    assert(out.swap.seen && out.swap.stored && out.after === null, 'the old round\'s PLAN CHANGES card retires: ' + JSON.stringify([out.swap, out.after]));
    assert(out.swap.scopeOpen === null, 'no scope stays open across the swap: ' + out.swap.scopeOpen);
    assert(out.introBefore && out.restored.cycle === 1 && out.restored.ohp11 === 110 && !out.restored.intro && out.restored.backupCycle === 2, 'restoring round 1 brings it back as it was and drops ROUND 2 · WEEK 1: ' + JSON.stringify(out.restored));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a round that swaps in at launch retires the stored PLAN CHANGES card', async () => {
  const mon = thisMonday();
  const msgs = [
    { role: 'user', content: 'Make my overhead press heavier' },
    { role: 'assistant', content: 'Done.', _tools: [{ name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Overhead Press', action: 'change', weight: 110 }, result: { ok: true }, units: { w: 'lb', d: 'km' } }], _undo: 'coach:1' },
  ];
  const app = await boot({ seed: { kt_week: '12', kt_week_monday: mon, kt_apikey: 'sk-test', kt_coach_msgs: JSON.stringify(msgs), kt_routine_backup_scope: 'coach:1',
    kt_routine_next: JSON.stringify({ startsOn: mon, at: mon }) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      switchTab('coach'); coachView = 'chat'; render(); await wait(30);
      return { cycle: getCustomRoutine().cycle, week: currentWeek, scope: localStorage.getItem('kt_routine_backup_scope'),
        card: !!document.querySelector('.kt-ledger-card'), stored: JSON.parse(localStorage.getItem('kt_coach_msgs'))[1]._ledgerSeen === true };
    });
    assert(out.cycle === 2 && out.week === 1 && out.scope === 'round:2', 'round 2 swapped in at launch: ' + JSON.stringify(out));
    assert(!out.card && out.stored, 'the stored card is retired: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
