// The coach can correct a logged session (the owner's "Bar" that should have been
// "Barbell Curl (21s)"), its routine writes read back what was stored so it can check its
// own work, and a past-week lock tells it what to do instead of stonewalling.
const { boot, assert, run } = require('../lib/harness');

run('edit_session, routine readback, and actionable week locks', async () => {
  const bar = { id: 555, date: '2026-09-18', week: 1, type: 'Pull', prs: ['Bar'],
    exercises: [{ name: 'Pull Up', sets: 3, reps: [8, 8, 8], weight: 0 }, { name: 'Bar', sets: 3, reps: [21, 21, 21], weight: 40, weightLog: [40, 40, 40] }] };
  const curl = { id: 444, date: '2026-09-10', week: 1, type: 'Pull', prs: [],
    exercises: [{ name: 'Barbell Curl (21s)', sets: 3, reps: [21, 21, 21], weight: 40, weightLog: [40, 40, 40] }] };
  const app = await boot({ seed: { kt_sessions: JSON.stringify([bar, curl]), kt_weights: JSON.stringify({ 'Bar': 40, 'Barbell Curl (21s)': 40 }),
    kt_prs: JSON.stringify({ 'Bar': 40, 'Barbell Curl (21s)': 40 }), kt_ex_notes: JSON.stringify({ 'Bar': { text: 'slow eccentric', date: '2026-09-18' } }) } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      // 1. rename the stray entry
      const res = executeCoachTool('edit_session', { id: 555, exercise: 'bar', rename_to: 'Barbell Curl (21s)' });
      const s = getSessions().find(x => x.id === 555);
      r.rename = { ok: res && res.ok, msg: res && res.message, names: s.exercises.map(e => e.name),
        pr: JSON.stringify(s.prs), weightsBar: getWeights()['Bar'], prsBar: getPRs()['Bar'],
        note: (lsGet('kt_ex_notes') || {})['Barbell Curl (21s)'] ? 'moved' : 'lost', stored: res && res.stored };
      // 2. fix reps and load
      const res2 = executeCoachTool('edit_session', { id: 555, exercise: 'Pull Up', reps: [8, 8, 6], weight: 25 });
      const pu = getSessions().find(x => x.id === 555).exercises.find(e => e.name === 'Pull Up');
      r.fix = { ok: res2 && res2.ok, reps: pu.reps, sets: pu.sets, w: pu.weight };
      // 3. refusals change nothing
      const before = JSON.stringify(getSessions());
      r.refusals = [
        executeCoachTool('edit_session', { id: 999, exercise: 'Pull Up', rename_to: 'X' }),
        executeCoachTool('edit_session', { id: 555, exercise: 'Squat', rename_to: 'X' }),
        executeCoachTool('edit_session', { id: 555, exercise: 'Pull Up' }),
      ].map(x => ({ ok: x.ok, err: x.error }));
      r.unchanged = JSON.stringify(getSessions()) === before;
      r.label = toolCallLabel({ name: 'edit_session', input: { exercise: 'Bar', rename_to: 'Barbell Curl (21s)' } });
      r.promptLine = /edit_session with the session id/.test(buildSystemPrompt());
      r.promptWeek = /NOT derived from logged sessions/.test(buildSystemPrompt());

      // 4. a routine write reads back what it stored
      const cr = getCustomRoutine(); cr.dayNames = { Push: 'Chest + Back' }; setCustomRoutine(cr);
      const w = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4',
        push: [{ name: 'Barbell Bench Press', sets: 3, reps: '6' }, { name: 'Pull Up', sets: 3, reps: '8' }] }] });
      const wk = w && w.stored && w.stored.weeks && w.stored.weeks[currentWeek];
      r.readback = { ok: w && w.ok, cadence: w && w.stored && w.stored.cadence, week: wk, check: !!(w && w.check) };

      // 5. a past-week lock says what to do
      currentWeek = 3; lsSet('kt_week', 3);
      const lock = executeCoachTool('update_routine_weeks', { weeks: [{ wk: 1, bName: 'BASE', bColor: '#06b6d4', push: [{ name: 'X', sets: 3, reps: '8' }] }] });
      r.lock = { ok: lock.ok, err: lock.error || '' };
      return r;
    });
    assert(out.rename.ok && out.rename.names[1] === 'Barbell Curl (21s)' && out.rename.pr === '["Barbell Curl (21s)"]',
      'the stray entry is renamed and its session PR follows: ' + JSON.stringify(out.rename));
    assert(out.rename.weightsBar === undefined && out.rename.prsBar === undefined && out.rename.note === 'moved',
      'no working weight, PR or note is left under the wrong name: ' + JSON.stringify(out.rename));
    assert(out.rename.stored && out.rename.stored.exercise === 'Barbell Curl (21s)', 'the tool reports what it stored');
    assert(out.fix.ok && out.fix.reps.join(',') === '8,8,6' && out.fix.sets === 3 && out.fix.w === 25, 'reps and load are corrected: ' + JSON.stringify(out.fix));
    assert(out.refusals.every(x => !x.ok) && /not found/.test(out.refusals[0].err) && /it has:/.test(out.refusals[1].err) && /nothing to change/.test(out.refusals[2].err),
      'bad calls are refused with a reason: ' + JSON.stringify(out.refusals));
    assert(out.unchanged, 'a refused edit changes nothing');
    assert(/Bar .* Barbell Curl/.test(out.label), 'the chat pill names the rename: ' + out.label);
    assert(out.promptLine && out.promptWeek, 'the prompt tells the coach to use edit_session and how the week counter works');
    assert(out.readback.ok && out.readback.check && /Chest \+ Back \[Push\]/.test(JSON.stringify(out.readback.week)) && /Barbell Bench Press/.test(JSON.stringify(out.readback.week)),
      'a routine write reads back the stored exercises under the day names: ' + JSON.stringify(out.readback));
    assert(!out.lock.ok && /call set_current_week with that week first/.test(out.lock.err), 'a past-week lock says what to do: ' + JSON.stringify(out.lock));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
