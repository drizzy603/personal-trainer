// Hunt 2026-09-26 "go" fixes, coach group (web 20260930-1):
// - update_routine_weeks keeps what the call left out of a week: its runs, its note and the
//   lifts the owner removed (a one-day tweak or a day rename wiped them).
// - PLAN CHANGES Undo is offered only while the backup is still the one this reply took (it
//   restored an older programme under goal-only replies, and the snapshot of a later Routines
//   edit under an earlier reply); a single-exercise edit gets its ledger row.
// - Several log calls in one reply get distinct ids (delete_log removed all of them).
// - edit_session keeps the corrected logged load exact (22 kg stayed 22.5 kg).
// - RECENT SESSIONS reads the legacy nested set shape ("[object Object]×(undefined)@BW").
const { boot, assert, run } = require('../lib/harness');

const reply = (content, stop) => ({ content, stop_reason: stop || 'end_turn', usage: {} });
const MOCK = `(replies) => { let n = 0; window.fetch = async () => new Response(JSON.stringify(replies[Math.min(n++, replies.length - 1)]), { status: 200, headers: { 'content-type': 'application/json' } }); }`;

run('a coach week rewrite keeps runs, the note and removed lifts', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const c = currentWeek - 1, wk = currentWeek;
      const cr = getCustomRoutine();
      cr.weeks[c].runs = { Tue: { km: 5, type: 'easy' } }; cr.weeks[c].wkNote = 'Heavy day: top set of 3';
      const gone = cr.weeks[c].push.splice(4, 1)[0];   // the owner removed the last push lift
      cr.weeks[c].recOut = { push: [{ at: 4, row: gone }] };
      setCustomRoutine(cr);
      // the coach rewrites Push only (the rest of the week is left out)
      const push = cr.weeks[c].push.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight }));
      const res = executeCoachTool('update_routine_weeks', { weeks: [{ wk, bName: cr.weeks[c].bName, bColor: cr.weeks[c].bColor, push }] });
      const w = getCustomRoutine().weeks[c];
      // a header-only call (the path a day rename takes)
      executeCoachTool('update_routine_weeks', { weeks: [{ wk, bName: w.bName, bColor: w.bColor }], dayNames: { Push: 'Chest + Tris' } });
      const w2 = getCustomRoutine().weeks[c];
      return { ok: res.ok, runs: JSON.stringify(w2.runs), note: w2.wkNote, recOut: w2.recOut && w2.recOut.push && w2.recOut.push.map(x => x.row.name), goneName: gone.name, stillOut: !w2.push.some(e => e.name === gone.name), name: _dayLabel('Push') };
    });
    assert(out.ok && out.runs === JSON.stringify({ Tue: { km: 5, type: 'easy' } }) && out.note === 'Heavy day: top set of 3', 'the run plan and the note stay: ' + JSON.stringify(out));
    assert(JSON.stringify(out.recOut) === JSON.stringify([out.goneName]) && out.stillOut, 'a removed lift stays removed and restorable: ' + JSON.stringify(out));
    assert(out.name === 'Chest + Tris', 'the rename took: ' + out.name);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Undo belongs to the reply that took the snapshot; ids are unique; logged loads exact; legacy sets read', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const r = {}, mock = eval(MOCK), real = window.fetch;
      localStorage.setItem('kt_apikey', 'sk-test');
      const last = () => coachMessages[coachMessages.length - 1];
      const ledgerUndo = () => /_ledgerUndo\(/.test(_planChangeLedger(last()._tools || [], coachMessages.length - 1));
      // reply 1 changes the programme
      mock([{ content: [{ type: 'tool_use', id: 't1', name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 170 } }], stop_reason: 'tool_use', usage: {} },
            { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages = [{ role: 'user', content: 'bench 170' }];
      await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      r.reply1 = { undo: ledgerUndo(), row: /Bench Press/.test(_planChangeLedger(last()._tools, coachMessages.length - 1)) };
      const idx1 = coachMessages.length - 1;
      // the owner edits in Routines: reply 1's Undo would now restore the wrong snapshot
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Overhead Press', currentWeek - 1, 110, { markOwner: true }), { scope: 'routines' });
      r.afterRoutines = /_ledgerUndo\(/.test(_planChangeLedger(coachMessages[idx1]._tools, idx1));
      // reply 2 only sets a goal: no Undo
      mock([{ content: [{ type: 'tool_use', id: 't2', name: 'set_bench_goal', input: { weight: 225 } }], stop_reason: 'tool_use', usage: {} },
            { content: [{ type: 'text', text: 'Goal set.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages.push({ role: 'user', content: 'goal 225' });
      await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      r.goalOnly = { undo: ledgerUndo(), hasCard: !!_planChangeLedger(last()._tools || [], coachMessages.length - 1) };
      // two runs logged in one reply: distinct ids, one delete removes one
      mock([{ content: [{ type: 'tool_use', id: 'a', name: 'log_run', input: { distance: 5, time: '25:00', date: todayISO() } }, { type: 'tool_use', id: 'b', name: 'log_run', input: { distance: 3, time: '15:00', date: todayISO() } }], stop_reason: 'tool_use', usage: {} },
            { content: [{ type: 'text', text: 'Logged both.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages.push({ role: 'user', content: 'two runs' });
      await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      const two = getRuns().filter(x => x.date === todayISO()).slice(0, 2);
      r.ids = [two.length, two[0] && two[1] && two[0].id !== two[1].id];
      executeCoachTool('delete_log', { store: 'run', id: two[0].id });
      r.afterDelete = getRuns().filter(x => x.date === todayISO()).length;
      window.fetch = real;
      // edit_session keeps 22 kg exactly
      localStorage.setItem('kt_unit_w', 'kg');
      const s = getSessions().find(x => (x.exercises || []).some(e => e.name === 'Incline Dumbbell Press'));
      const res = executeCoachTool('edit_session', { id: s.id, exercise: 'Incline Dumbbell Press', reps: [8, 8, 8], weight: 22 });
      const e = getSessions().find(x => x.id === s.id).exercises.find(e => e.name === 'Incline Dumbbell Press');
      r.exact = [res.ok, (e.weightLog || []).map(v => Math.round(wDisp(v) * 100) / 100), Math.round(e.weight / 2.20462 * 100) / 100];
      localStorage.setItem('kt_unit_w', 'lb');
      // RECENT SESSIONS reads the legacy nested shape
      const ss = getSessions(); ss.unshift({ id: 1, date: todayISO(), type: 'Push', week: currentWeek, prs: [], exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: 160, rpe: 9 }, { reps: 8, weight: 160, rpe: 9 }, { reps: 6, weight: 165, rpe: 9.5 }] }] });
      lsSet('kt_sessions', ss);
      const p = buildSystemPrompt();
      r.prompt = (p.match(/\[id:1\][^\n]*/) || [''])[0];
      return r;
    }, MOCK);
    assert(out.reply1.undo && out.reply1.row, 'a reply that changed the programme offers Undo and lists the edit: ' + JSON.stringify(out.reply1));
    assert(!out.afterRoutines, 'after a later Routines edit the earlier reply no longer offers Undo');
    assert(!out.goalOnly.undo, 'a goal-only reply offers no Undo: ' + JSON.stringify(out.goalOnly));
    assert(out.ids[0] === 2 && out.ids[1] && out.afterDelete === 1, 'two logs in one reply get two ids; one delete removes one: ' + JSON.stringify([out.ids, out.afterDelete]));
    assert(out.exact[0] && out.exact[1].every(v => v === 22), 'the corrected load stays 22 kg: ' + JSON.stringify(out.exact));
    assert(/Bench Press 3×\(8\/8\/6\)@160\/160\/165 lb RPE9/.test(out.prompt) && !/object Object/.test(out.prompt), 'legacy sets read as sets: ' + out.prompt);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
