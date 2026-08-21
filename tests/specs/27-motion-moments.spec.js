// Pins for the Motion & Moments first release (spec items 1-4): the tab-entry
// motion gate, the rest state's draining bar + three equal wells, the M-06
// just-logged markers, and the day-zero honest empties on Today + Progress.
const { boot, assert, run } = require('../lib/harness');

run('tab-entry motion arms only when the route changes', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      switchTab('progress');
      const armed = document.getElementById('screen').classList.contains('kt-tab-in');
      render(); // same route — an in-tab repaint must NOT replay entry motion
      const disarmed = !document.getElementById('screen').classList.contains('kt-tab-in');
      switchTab('log');
      const rearmed = document.getElementById('screen').classList.contains('kt-tab-in');
      return { armed, disarmed, rearmed };
    });
    assert(out.armed, 'route change adds kt-tab-in');
    assert(out.disarmed, 'in-tab re-render removes kt-tab-in');
    assert(out.rearmed, 'next route change arms it again');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('rest state: draining bar, three equal wells, total tracks extensions', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0];
      ex.sets = 3;
      runnerEngaged = true;
      runnerCompleteSet(); // set 1 -> resting
      const resting = runnerResting === true;
      const totalSeeded = runnerRestTotal === runnerRestLeft && runnerRestTotal > 0;
      const root = document.getElementById('runner-root');
      const bar = root.querySelector('.kt-rest-bar-fill');
      const wells = root.querySelectorAll('.kt-rest-adj');
      const skipWell = root.querySelector('.kt-rest-adj.kt-rest-go');
      const dotFresh = !!root.querySelector('.kt-dot-new');
      const rowWashed = !!root.querySelector('.kt-row-wash');
      // Extend past the granted total — the denominator must follow.
      const before = runnerRestTotal;
      runnerAddRest(30);
      runnerAddRest(30);
      const grew = runnerRestTotal >= before + 30 && runnerRestTotal >= runnerRestLeft;
      // Skip resets the flight state.
      runnerSkipRest();
      const reset = runnerRestTotal === 0 && !runnerResting;
      closeDeckRunner();
      return { resting, totalSeeded, hasBar: !!bar, wellCount: wells.length,
        skipLabel: skipWell ? skipWell.textContent : '', dotFresh, rowWashed, grew, reset };
    });
    assert(out.resting, 'set 1 starts a rest');
    assert(out.totalSeeded, 'rest total seeds from the granted rest');
    assert(out.hasBar, 'rest card renders the draining bar');
    assert(out.wellCount === 3, 'three equal wells, got ' + out.wellCount);
    assert(out.skipLabel.indexOf('Skip') > -1, 'third well is Skip');
    assert(out.dotFresh, 'just-logged strip dot pulses (M-06)');
    assert(out.rowWashed, 'just-logged ledger row washes (M-06)');
    assert(out.grew, '+30s past the total grows the denominator');
    assert(out.reset, 'skip clears the rest flight');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('day zero: Today and Progress promise, never fake', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      // Force today to be a lift day so the Today contract branch renders.
      const cr = getCustomRoutine();
      const dow = (new Date().getDay() + 6) % 7;
      cr.weekPlan = cr.weekPlan || [];
      cr.weekPlan[dow] = 'Push';
      setCustomRoutine(cr);
      switchTab('log');
      const todayTxt = document.getElementById('screen').textContent;
      const contract = todayTxt.indexOf('THIS SPACE FILLS TONIGHT') > -1;
      switchTab('progress');
      const progTxt = document.getElementById('screen').textContent;
      const progHonest = progTxt.indexOf('Nothing yet.') > -1
        && progTxt.indexOf('AFTER WEEK 1') > -1;
      // With a plan, day-zero Progress earns no CTA.
      const noCta = progTxt.indexOf('Build a plan') === -1;
      // Once a session exists the contract retires.
      lsSet('kt_sessions', [{ id: 1, date: todayISO(), type: 'Push', week: 1,
        exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }] }]);
      switchTab('log');
      const after = document.getElementById('screen').textContent;
      const retired = after.indexOf('THIS SPACE FILLS TONIGHT') === -1;
      return { contract, progHonest, noCta, retired };
    });
    assert(out.contract, 'Today day zero shows the dashed contract');
    assert(out.progHonest, 'Progress day zero shows the honest ladder');
    assert(out.noCta, 'planned day zero earns no extra CTA');
    assert(out.retired, 'first session retires the contract');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
