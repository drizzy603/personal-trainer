// The programme is a library, not a contract. The off-schedule picker offers every lift
// session the current week CONTAINS — including one the cadence never schedules, which is
// how a user ends up with a populated legs array and no way to reach it — and leaves out
// the ones with nothing in them. On a lift day it offers the alternatives to today.
const { boot, assert, run } = require('../lib/harness');

run('off-schedule picker offers what the week contains, not what it schedules', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_skips: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const pills = () => Array.from(document.querySelectorAll('.kt-adhoc-pill')).map(b => b.textContent.trim());
      const label = () => { const el = document.querySelector('.kt-adhoc-lbl'); return el ? el.textContent.trim() : ''; };
      const r = {};
      const dow = (new Date().getDay() + 6) % 7;
      const cr = getCustomRoutine();
      const wk = cr.weeks[currentWeek - 1];
      const ex = n => ({ name: n, sets: 3, reps: '8-10', rpe: 7, weight: 100 });

      // Four lift arrays populated; the cadence names only Pull and Legs2. Legs is the
      // owner's real case: exercises sitting in the week that no day schedules.
      wk.push = [ex('Barbell Bench Press')];
      wk.pull = [ex('Pull Up'), ex('Cable Row')];
      wk.legs = [ex('Barbell Back Squat'), ex('Leg Press')];
      wk.legs2 = [];                                   // scheduled below, but empty
      wk.arms = [ex('Barbell Curl')];

      const plan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'];
      plan[(dow + 1) % 7] = 'Pull';
      plan[(dow + 2) % 7] = 'Legs2';
      wk.weekPlan = plan;                              // today = Rest
      cr.weekPlan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'];  // routine level names nothing
      setCustomRoutine(cr);

      switchTab('log');
      r.rest = { pills: pills(), label: label() };

      // On a lift day the picker becomes the alternatives to today.
      const plan2 = plan.slice(); plan2[dow] = 'Pull';
      wk.weekPlan = plan2; setCustomRoutine(cr);
      switchTab('log');
      r.lift = { pills: pills(), label: label() };

      // A finished session shows no picker — no nagging for an extra workout.
      lsSet('kt_sessions', [{ id: 1, date: todayISO(), week: currentWeek, type: 'Pull',
        exercises: [{ name: 'Pull Up', sets: 3, reps: [8, 8, 8], weight: 100 }], prs: [] }]);
      switchTab('log');
      r.done = { pills: pills() };
      return r;
    });

    // The whole point: Legs is in the week and in nobody's cadence, and it still shows up.
    assert(out.rest.pills.indexOf('Legs') >= 0, 'an unscheduled but populated Legs day is offered: ' + JSON.stringify(out.rest.pills));
    assert(out.rest.pills.indexOf('Push') >= 0 && out.rest.pills.indexOf('Pull') >= 0 && out.rest.pills.indexOf('Arms') >= 0,
      'every populated lift type is offered: ' + JSON.stringify(out.rest.pills));
    assert(out.rest.pills.indexOf('Legs B') < 0, 'a scheduled but empty type is not offered: ' + JSON.stringify(out.rest.pills));
    assert(out.rest.pills.length === 4, 'each type appears exactly once: ' + JSON.stringify(out.rest.pills));
    assert(/LOG A WORKOUT ANYWAY/.test(out.rest.label), 'rest-day label: ' + out.rest.label);

    assert(out.lift.pills.indexOf('Pull') < 0, 'today\'s own session is not offered as an alternative: ' + JSON.stringify(out.lift.pills));
    assert(out.lift.pills.indexOf('Legs') >= 0 && out.lift.pills.indexOf('Push') >= 0,
      'a lift day still offers the rest of the week\'s work: ' + JSON.stringify(out.lift.pills));
    assert(/TRAIN SOMETHING ELSE/.test(out.lift.label), 'lift-day label: ' + out.lift.label);

    assert(out.done.pills.length === 0, 'a finished day offers nothing extra: ' + JSON.stringify(out.done.pills));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
