// Keyless starter programme: every pool exercise exists in the DB, the
// builder emits a valid 8-week kt_routine with correct progression math,
// the 5-tap overlay walk lands a working programme, and the bodyweight
// pool never prescribes gear.
const { boot, assert, run } = require('../lib/harness');

run('starter pools only reference real exercises', async () => {
  const app = await boot();
  try {
    const missing = await app.page.evaluate(() => {
      const names = {};
      getAllExercises().forEach(e => { names[e.name] = 1; });
      const out = [];
      Object.keys(STARTER_POOLS).forEach(equip => {
        Object.keys(STARTER_POOLS[equip]).forEach(day => {
          STARTER_POOLS[equip][day].forEach(n => { if (!names[n]) out.push(equip + '/' + day + '/' + n); });
        });
      });
      Object.keys(STARTER_W).forEach(n => { if (!names[n]) out.push('weights/' + n); });
      return out;
    });
    assert(missing.length === 0, 'unknown exercise names: ' + missing.join(', '));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('builder emits a valid programme with correct progression', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = buildStarterRoutine({ goal: 'muscle', days: 3, runs: 2, equip: 'full', exp: 1 });
      const counts = { lift: 0, run: 0, rest: 0 };
      r.weekPlan.forEach(t => {
        if (t === 'Run') counts.run++; else if (t === 'Rest') counts.rest++; else counts.lift++;
      });
      const wk = (n) => r.weeks[n - 1];
      const main = (n) => wk(n).push[0];
      return {
        weeks: r.weeks.length, planLen: r.weekPlan.length, counts,
        blocks: r.weeks.map(w => w.bName).join(','),
        w1: main(1).weight, w5: main(5).weight, w7: main(7).weight, w8: main(8).weight,
        baseReps: main(1).reps, buildReps: main(5).reps,
        isMain: main(1).isMain, accWeight: wk(1).push[1].weight,
        runKm: [wk(1).runs.Tue && wk(1).runs.Tue.km, wk(1).runs.Sat && wk(1).runs.Sat.km],
        deloadRun: wk(8).runs.Sat && wk(8).runs.Sat.km,
        name: r.name,
      };
    });
    assert(out.weeks === 8 && out.planLen === 7, '8 weeks, 7-day plan');
    assert(out.counts.lift === 3 && out.counts.run === 2, '3 lift days + 2 runs, got ' + JSON.stringify(out.counts));
    assert(out.blocks === 'BASE,BASE,BASE,BUILD,BUILD,BUILD,PEAK,DELOAD', 'block ladder: ' + out.blocks);
    // Bench tier 1 = 95: BASE 95, BUILD wk5 = 95+10, PEAK = 95+20, DELOAD = 60% of wk6 (110) → 65
    assert(out.w1 === 95 && out.w5 === 105 && out.w7 === 115 && out.w8 === 65,
      'progression math: ' + [out.w1, out.w5, out.w7, out.w8].join('/'));
    assert(out.baseReps === 10 && out.buildReps === 8, 'muscle scheme reps: ' + out.baseReps + '/' + out.buildReps);
    assert(out.isMain === true && out.accWeight === 0, 'main flagged, accessories start at 0');
    assert(out.runKm[0] === 3 && out.runKm[1] === 5, 'runs are 3km + 5km, got ' + out.runKm.join('/'));
    assert(out.deloadRun === 3, 'deload trims the long run to 3km');
    assert(out.name === 'Your starter block', 'routine name is placeholder-safe');
  } finally { await app.close(); }
});

run('five-tap walk lands a working programme', async () => {
  const app = await boot({ seed: { kt_routine: '', kt_apikey: '' } });
  try {
    const out = await app.page.evaluate(() => {
      const before = hasCustomRoutine();
      openStarterIntake();
      const overlayUp = !!document.getElementById('starterOverlay');
      const q1 = document.querySelector('#starterOverlay h1').textContent;
      ['strength', 4, 1, 'full', 2].forEach(v => _siPick(v));
      const readyCopy = document.querySelector('#starterOverlay h1').textContent;
      applyStarterIntake();
      return {
        before, overlayUp, q1, readyCopy,
        after: hasCustomRoutine(),
        overlayGone: !document.getElementById('starterOverlay'),
        pushCount: getSessionExercises('Push').length,
        week: currentWeek, tab: currentTab, sub: logSubTab,
        firstName: getUserFirstName(),
      };
    });
    assert(!out.before && out.after, 'walk creates the routine');
    assert(out.overlayUp && out.overlayGone, 'overlay opens and closes');
    assert(out.q1.indexOf('chasing') > -1, 'first question renders: ' + out.q1);
    // M&M F1·B: the reveal names the split instead of the block length.
    assert(out.readyCopy.indexOf('4 days a week') > -1, 'ready screen renders: ' + out.readyCopy);
    assert(out.pushCount >= 4, 'Push day has exercises, got ' + out.pushCount);
    assert(out.week === 1 && out.tab === 'log' && out.sub === 'workout', 'lands on Today, week 1');
    assert(out.firstName === '', 'starter name never leaks into greetings, got "' + out.firstName + '"');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('bodyweight pool prescribes no gear and no loads', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = buildStarterRoutine({ goal: 'moving', days: 5, runs: 0, equip: 'bw', exp: 0 });
      const bad = [];
      let loaded = 0;
      r.weeks.forEach(w => {
        ['push', 'pull', 'legs', 'arms', 'legs2'].forEach(k => {
          (w[k] || []).forEach(ex => {
            if (/barbell|cable|machine|leg press/i.test(ex.name)) bad.push(ex.name);
            if (ex.weight > 0) loaded++;
          });
        });
      });
      return { bad: bad.join(','), loaded, days: r.weekPlan.filter(t => t !== 'Rest').length };
    });
    assert(out.bad === '', 'no gear-bound exercises: ' + out.bad);
    assert(out.loaded === 0, 'bodyweight plan prescribes no loads, got ' + out.loaded);
    assert(out.days === 5, 'five training days, got ' + out.days);
  } finally { await app.close(); }
});
