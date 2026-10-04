// Leftovers of the 2026-09-25 hunt (web 20260926-2): no demo working weights read as the user's
// (and the ones the first session saved are taken back once); coach pills keep the units they ran
// in and the morning card goes with a unit switch; one coach reply = one undo point; a missing date
// reads as a dash; a quote in a custom exercise name no longer breaks the library; Escape closes
// the top sheet even when focus has left it.
const { boot, assert, run } = require('../lib/harness');

run('demo weights: never read as the user\'s; the saved ones are taken back once', async () => {
  const kw = { 'Hammer Curl': 30, 'Cable Fly': 42.5, 'Face Pull': 20, 'Seated Cable Row': 65, 'Bench Press': 160 };
  const app = await boot({ native: true, seed: { kt_weights: JSON.stringify(kw) } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const w = lsGet('kt_weights');
      r.after = Object.keys(w).sort();
      r.flag = localStorage.getItem('kt_demo_w_swept') === '1';
      lsDel('kt_weights');
      r.empty = JSON.stringify(getWeights()) === '{}';
      r.prompt = buildSystemPrompt().indexOf('Barbell Bench Press: 165') < 0;
      return r;
    });
    assert(JSON.stringify(out.after) === '["Bench Press","Face Pull","Seated Cable Row"]',
      'demo values for never-logged lifts go; a logged lift and a changed value stay: ' + JSON.stringify(out.after));
    assert(out.flag, 'the sweep runs once');
    assert(out.empty && out.prompt, 'with nothing saved there are no working weights, and the coach is not told demo ones');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('coach: pills keep their units; the card goes with a switch; one reply is one undo', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const tc = { name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 80 }, result: { ok: true }, units: { w: 'kg', d: 'km' } };
      r.pill = toolCallLabel(tc);
      r.legacy = toolCallLabel({ name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 185 }, result: { ok: true } });
      r.ledger = /→ 80 kg/.test(_planChangeLedger([tc], 0));
      r.unitAfter = _uW() === 'lb';
      localStorage.setItem('kt_coach_card_test', '{"message":"Bench 185 lb"}'); coachCard = { message: 'Bench 185 lb', actions: [] };
      setUnitW('kg');
      r.card = localStorage.getItem('kt_coach_card_test') === null && coachCard === null;
      setUnitW('lb');
      // one reply, two programme changes, one undo point
      // (the snapshot's _w notes the working weights the reply moved, spec 105: the programme is the rest)
      const prog = o => { const c = JSON.parse(JSON.stringify(o)); delete c._w; return JSON.stringify(c); };
      const before = localStorage.getItem('kt_routine');
      _coachTurnScope = 'coach:test-1';
      const a = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 170 });
      const b = executeCoachTool('set_exercise_weight', { name: 'Overhead Press', weight: 110 });
      r.ok = a.ok && b.ok;
      r.oneUndo = prog(lsGet('kt_routine_backup')) === JSON.stringify(JSON.parse(before));
      const mid = localStorage.getItem('kt_routine');
      _coachTurnScope = 'coach:test-2';
      executeCoachTool('set_exercise_weight', { name: 'Overhead Press', weight: 115 });
      r.nextReply = prog(lsGet('kt_routine_backup')) === JSON.stringify(JSON.parse(mid));
      return r;
    });
    assert(out.pill === 'Bench Press → 80 kg', 'a kg-era pill still says kg after switching to lb: ' + out.pill);
    assert(out.legacy === 'Bench Press → 185 lb' && out.ledger && out.unitAfter, 'old pills read as before; the ledger keeps its units; nothing leaks: ' + JSON.stringify([out.legacy, out.ledger, out.unitAfter]));
    assert(out.card, 'the cached morning card goes with a unit switch');
    assert(out.ok && out.oneUndo, 'Undo after a reply with two changes restores the programme before both: ' + JSON.stringify([out.ok, out.oneUndo]));
    assert(out.nextReply, 'the next reply gets its own undo point');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a dash for a missing date; quotes in a name; Escape after focus leaves a sheet', async () => {
  const app = await boot({ native: true });
  try {
    const r = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      r.dates = [fmtDate(undefined), fmtDate(''), fmtDate('2026-09-01T10:00:00Z'), fmtDate('2026-09-01')];
      const name = 'Bench "Paused" & <Close>';
      const cust = lsGet('kt_custom_ex') || []; cust.push({ name, cat: 'Push', equip: 'Barbell', muscles: 'Chest', _custom: true }); lsSet('kt_custom_ex', cust);
      openExLib(); await wait(50);
      _libSearch = 'Paused'; _libExpanded = ''; _updateExLibList();
      const row = [...document.querySelectorAll('#exlibList [data-n]')].find(d => d.dataset.n === name);
      r.row = !!row; if (row) { row.click(); await wait(20); }
      r.expanded = _libExpanded === name;
      const del = document.querySelector('#exlibList button[data-n]');
      r.del = !!del && del.dataset.n === name;
      return r;
    });
    await app.page.evaluate(() => { const m = document.getElementById('exlib-modal') || document.querySelector('.ex-modal-bg'); if (m) m.remove(); });
    const closed = {};
    const runId = await app.page.evaluate(() => getRuns()[0].id);
    for (const [open, id] of [['openRunEditor(' + runId + ')', 'runEditOverlay'], ['openRoutines()', 'routinesOverlay'], ['openNextRound()', 'nextRoundOverlay']]) {
      await app.page.evaluate((o) => { eval(o); document.activeElement && document.activeElement.blur(); }, open);
      await app.page.keyboard.press('Escape');
      closed[id] = await app.page.evaluate((i) => !document.getElementById(i), id);
    }
    await app.page.evaluate(() => { _ktConfirm({ title: 'Sure?', confirmLabel: 'Yes', onConfirm: function () {} }); document.activeElement && document.activeElement.blur(); });
    await app.page.keyboard.press('Escape');
    closed.confirm = await app.page.evaluate(() => !document.querySelector('.kt-close-sheet'));
    assert(r.dates[0] === '—' && r.dates[1] === '—' && r.dates[2] === 'Sep 1, 2026' && r.dates[3] === 'Sep 1, 2026', 'a missing date is a dash, a timestamp reads its day: ' + JSON.stringify(r.dates));
    assert(r.row && r.expanded && r.del, 'a custom name with quotes opens and deletes by its name: ' + JSON.stringify(r));
    assert(Object.values(closed).every(Boolean), 'Escape closes the top sheet with focus outside it: ' + JSON.stringify(closed));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a real coach reply with two programme changes is undone as one', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const before = localStorage.getItem('kt_routine');
      const replies = [
        { content: [
          { type: 'tool_use', id: 't1', name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 170 } },
          // a weeks rewrite after another change used to overwrite the undo point
          { type: 'tool_use', id: 't2', name: 'update_routine_weeks', input: { weeks: [{ wk: currentWeek, bName: 'REWRITTEN', bColor: '#ffffff' }] } },
        ], stop_reason: 'tool_use', usage: {} },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} },
      ];
      const realFetch = window.fetch; let n = 0;
      window.fetch = async () => new Response(JSON.stringify(replies[Math.min(n++, 1)]), { status: 200, headers: { 'content-type': 'application/json' } });
      try {
        localStorage.setItem('kt_apikey', 'sk-test');
        coachMessages = [{ role: 'user', content: 'bench 170 and ohp 110' }];
        await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      } finally { window.fetch = realFetch; }
      const now = getCustomRoutine(), c = currentWeek - 1;
      return {
        changed: now.weeks[c].push.find(e => e.name === 'Bench Press').weight === 170 && now.weeks[c].bName === 'REWRITTEN',
        oneUndo: JSON.stringify(lsGet('kt_routine_backup')) === JSON.stringify(JSON.parse(before)),
        scopeCleared: _coachTurnScope === null,
      };
    });
    assert(out.changed, 'the reply changed the programme');
    assert(out.oneUndo, 'the undo point is the programme before the whole reply');
    assert(out.scopeCleared, 'the reply\'s scope ends with it');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
