// Pins for M&M item 9 (R1·E): when the wrist logs into the open runner, the
// phone card becomes a passive ledger — ON WRIST live dot, MIRRORING meta,
// ⌚ stamps on arrived rows — until the user takes over or navigates.
const { boot, assert, run } = require('../lib/harness');

run('wrist arrivals turn the runner into a passive mirror', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0];
      ex.sets = 3;
      const root = document.getElementById('runner-root');
      // A set arrives from the watch while the phone card is idle.
      const reps = {}; reps[ex.name] = [8];
      const weights = {}; weights[ex.name] = 60;
      _onWatchLive({ dayName: 'Push', startedAt: Date.now(), reps: reps, weights: weights });
      const merged = (runnerCompleted[ex.name] || 0) === 1;
      const mirrorOn = !!_wristMirror;
      const dot = !!root.querySelector('.kt-live-dot');
      const meta = root.textContent.indexOf('MIRRORING') > -1;
      const stamp = root.textContent.indexOf('⌚ JUST NOW') > -1;
      const takeOverBtn = root.textContent.indexOf('TAKE OVER ON PHONE') > -1;
      const washed = !!root.querySelector('.kt-row-wash');
      // Take over: the mirror dies and the steppers wake.
      _takeOverPhone();
      const steppersAwake = runnerEngaged === true && !_wristMirror
        && !!root.querySelector('.kt-step-input');
      const dotGone = !root.querySelector('.kt-live-dot');
      // A second arrival while ENGAGED must not hijack the card.
      reps[ex.name] = [8, 8];
      _onWatchLive({ dayName: 'Push', startedAt: Date.now(), reps: reps, weights: weights });
      const merged2 = (runnerCompleted[ex.name] || 0) === 2;
      const stillEngaged = runnerEngaged === true && !_wristMirror;
      // Navigation kills a fresh mirror too.
      runnerEngaged = false;
      _onWatchLive({ dayName: 'Push', startedAt: Date.now(),
        reps: (function(){ const r = {}; r[ex.name] = [8, 8, 8]; return r; })(), weights: weights });
      const mirrorAgain = !!_wristMirror;
      runnerGoTo(1);
      const killedByNav = !_wristMirror;
      closeDeckRunner();
      return { merged, mirrorOn, dot, meta, stamp, takeOverBtn, washed,
        steppersAwake, dotGone, merged2, stillEngaged, mirrorAgain, killedByNav };
    });
    assert(out.merged, 'wrist set merges into the open runner');
    assert(out.mirrorOn && out.dot, 'mirror arms with the ON WRIST live dot');
    assert(out.meta && out.takeOverBtn, 'MIRRORING meta + take-over affordance render');
    assert(out.stamp, 'arrived row carries the ⌚ JUST NOW stamp');
    assert(out.washed, 'newest wrist row washes (M-06)');
    assert(out.steppersAwake && out.dotGone, 'take-over wakes the steppers and drops the dot');
    assert(out.merged2 && out.stillEngaged, 'arrivals while engaged merge without hijacking');
    assert(out.mirrorAgain && out.killedByNav, 'navigation kills the mirror');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
