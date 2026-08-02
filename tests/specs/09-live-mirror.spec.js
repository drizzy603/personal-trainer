// Live mirror: wrist per-set state merges into the open phone runner in real
// time, a local lead is pushed back over the debounced channel, stale wrist
// payloads never shrink local state, and a wrist "ended" closes the phone
// runner so the queued session can't double-log.
const { boot, assert, run } = require('../lib/harness');

run('wrist live state merges into the open phone runner', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0].name;
      const fire = (payload) => {
        window.__mock.listeners.filter(l => l.name === 'watchLive')
          .forEach(l => l.fn({ json: JSON.stringify(payload) }));
      };
      // Watch is two sets in at 100 lb — the open runner must adopt them.
      const reps = {}; reps[ex] = [8, 8];
      const weights = {}; weights[ex] = 100;
      fire({ dayName: 'Push', startedAt: Date.now(), reps, weights });
      const merged = {
        done: runnerCompleted[ex] || 0,
        log: (runnerRepsLog[ex] || []).join(','),
        weight: runnerWeights[ex],
      };
      // Phone logs a third set — the debounced push must carry all three.
      runnerCompleteSet();
      window.__mock.updateContext.length = 0;
      await new Promise(r => setTimeout(r, 1100));
      const pushes = window.__mock.updateContext;
      let pushedReps = -1;
      if (pushes.length && pushes[pushes.length - 1].live) {
        const live = JSON.parse(pushes[pushes.length - 1].live);
        pushedReps = (live.reps[ex] || []).length;
      }
      // Re-firing the now-stale wrist state must not shrink local progress.
      fire({ dayName: 'Push', startedAt: Date.now(), reps, weights });
      const afterStale = runnerCompleted[ex];
      // Wrist finishes the session — the phone runner closes.
      fire({ dayName: 'Push', startedAt: Date.now(), reps, weights, ended: true });
      return { merged, pushedReps, afterStale, closed: !runnerOpen };
    });
    assert(out.merged.done === 2, 'adopts both wrist sets, got ' + out.merged.done);
    assert(out.merged.log === '8,8', 'rep log mirrors the wrist: ' + out.merged.log);
    assert(out.merged.weight === 100, 'adopts the wrist weight, got ' + out.merged.weight);
    assert(out.pushedReps === 3, 'push after the local set carries 3 reps, got ' + out.pushedReps);
    assert(out.afterStale === 3, 'stale wrist state never shrinks local, got ' + out.afterStale);
    assert(out.closed, 'wrist finish closes the phone runner');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('wrist banner still shows when the phone runner is closed', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const fire = (payload) => {
        window.__mock.listeners.filter(l => l.name === 'watchLive')
          .forEach(l => l.fn({ json: JSON.stringify(payload) }));
      };
      fire({ dayName: 'Push', startedAt: Date.now(), reps: { 'Bench Press': [8] }, weights: {} });
      return { banner: _watchLive ? _watchLive.sets : -1, open: runnerOpen };
    });
    assert(!out.open, 'runner stays closed');
    assert(out.banner === 1, 'live banner tracks wrist sets, got ' + out.banner);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
