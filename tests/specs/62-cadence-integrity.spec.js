// A training day cannot be silently deleted. An unrecognised cadence value keeps its own
// name instead of being renamed "Rest"; the coach's weekPlan is validated BEFORE the undo
// snapshot and rejected rather than coerced; and the Settings editor offers the list
// instead of overwriting a day it cannot cycle.
const { boot, assert, run } = require('../lib/harness');

run('an unrecognised day keeps its name; bad writes are rejected, not coerced', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};

      // 1. _planEntry preserves identity. It still renders rest-like so nothing throws.
      const known = _planEntry('Push'), lower = _planEntry('push'), sport = _planEntry('Cycling');
      const unknown = _planEntry('Upper');
      r.planEntry = {
        known: known.type, lower: lower.type, sport: sport.type,
        unknownType: unknown.type, unknownFlag: !!unknown.isUnknown, unknownRests: unknown.isRest,
      };
      r.knownPlanType = { push: _knownPlanType('Push'), legs2: _knownPlanType('Legs2'),
        cycling: _knownPlanType('Cycling'), upper: _knownPlanType('Upper') };
      r.validWeekPlan = {
        good: _validWeekPlan(['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Run', 'Rest']),
        bad: _validWeekPlan(['Push', 'Rest', 'Upper', 'Rest', 'Legs', 'Run', 'Rest']),
        short: _validWeekPlan(['Push', 'Rest']),
        badNames: _badPlanEntries(['Push', 'Upper', 'Chest+Back', 'Rest', 'Rest', 'Rest', 'Rest']),
      };

      // 2. the coach's write is rejected and changes nothing, including the undo point
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Run', 'Rest'];
      setCustomRoutine(cr);
      lsDel('kt_routine_backup');
      const before = JSON.stringify(getCustomRoutine().weekPlan);
      const res = executeCoachTool('update_routine_weeks', {
        weekPlan: ['Upper', 'Rest', 'Lower', 'Rest', 'Upper', 'Run', 'Rest'],
        weeks: [{ week: 1, bName: 'BASE', push: [{ name: 'Barbell Bench Press', sets: 3, reps: '8' }] }],
      });
      r.coach = {
        ok: res && res.ok, error: (res && res.error) || '',
        planUnchanged: JSON.stringify(getCustomRoutine().weekPlan) === before,
        undoNotBurned: !lsGet('kt_routine_backup'),
        logged: /weekPlan rejected/.test(JSON.stringify(lsGet('kt_err_log') || [])),
      };

      // a per-week override is checked too
      const res2 = executeCoachTool('update_routine_weeks', {
        weeks: [{ week: 1, bName: 'BASE', weekPlan: ['Push', 'Rest', 'Nonsense', 'Rest', 'Legs', 'Run', 'Rest'] }],
      });
      r.coachPerWeek = { ok: res2 && res2.ok, error: (res2 && res2.error) || '' };

      // a valid one still goes through
      const res3 = executeCoachTool('update_routine_weeks', {
        weekPlan: ['pull', 'Rest', 'Push', 'Rest', 'Legs', 'Run', 'Rest'],
        weeks: [{ week: 1, bName: 'BASE', pull: [{ name: 'Pull Up', sets: 3, reps: '8' }] }],
      });
      r.coachGood = { ok: res3 && res3.ok, err: (res3 && res3.error) || (res3 && res3.message) || '', plan: getCustomRoutine().weekPlan.slice(0, 1) };

      // 3. the Settings editor: a day it cannot cycle is offered, not overwritten
      const cr2 = getCustomRoutine();
      cr2.weekPlan = ['Upper', 'Rest', 'Pull', 'Rest', 'Legs', 'Run', 'Rest'];
      (cr2.weeks || []).forEach(w => { delete w.weekPlan; });
      setCustomRoutine(cr2);
      _schedEditDow = null;
      cycleWeekPlanDay(0);
      r.editor = {
        dayKept: getCustomRoutine().weekPlan[0],
        pickerOpened: _schedEditDow === 0,
      };
      // and an explicit pick still writes
      setWeekPlanDay(0, 'Push');
      r.editorForce = getCustomRoutine().weekPlan[0];
      // _schedTypes offers what the routine already uses
      const cr3 = getCustomRoutine();
      cr3.weekPlan = ['Push', 'Cycling', 'Pull', 'Rest', 'Legs', 'Run', 'Rest'];
      setCustomRoutine(cr3);
      r.schedTypes = _schedTypes();
      return r;
    });

    assert(out.planEntry.known === 'Push' && out.planEntry.lower === 'Push' && out.planEntry.sport === 'Cycling',
      'known types still resolve as before: ' + JSON.stringify(out.planEntry));
    assert(out.planEntry.unknownType === 'Upper' && out.planEntry.unknownFlag && out.planEntry.unknownRests,
      'an unknown day keeps its name and renders rest-like: ' + JSON.stringify(out.planEntry));
    assert(out.knownPlanType.push && out.knownPlanType.legs2 && out.knownPlanType.cycling && !out.knownPlanType.upper,
      '_knownPlanType knows lifts, Legs2 and sports: ' + JSON.stringify(out.knownPlanType));
    assert(out.validWeekPlan.good && !out.validWeekPlan.bad && !out.validWeekPlan.short &&
      out.validWeekPlan.badNames.join(',') === 'Upper,Chest+Back',
      '_validWeekPlan and _badPlanEntries: ' + JSON.stringify(out.validWeekPlan));

    assert(!out.coach.ok && /do not recognise/.test(out.coach.error), 'the coach write is rejected: ' + JSON.stringify(out.coach));
    assert(out.coach.planUnchanged, 'the routine is untouched by a rejected write');
    assert(out.coach.undoNotBurned, 'the undo snapshot is NOT taken for a rejected write');
    assert(out.coach.logged, 'the rejection is recorded in the error log');
    assert(!out.coachPerWeek.ok && /do not recognise/.test(out.coachPerWeek.error),
      'a per-week override is validated too: ' + JSON.stringify(out.coachPerWeek));
    assert(out.coachGood.plan[0] === 'Pull', 'a valid write still applies and canonicalises case ("pull" -> "Pull"): ' + JSON.stringify(out.coachGood));

    assert(out.editor.dayKept === 'Upper' && out.editor.pickerOpened,
      'tapping an unrecognised day opens the picker instead of renaming it: ' + JSON.stringify(out.editor));
    assert(out.editorForce === 'Push', 'an explicit pick still writes: ' + out.editorForce);
    assert(out.schedTypes.indexOf('Cycling') >= 0, 'the editor offers what the routine already uses: ' + JSON.stringify(out.schedTypes));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
