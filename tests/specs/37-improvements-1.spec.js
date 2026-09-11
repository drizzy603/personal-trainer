// Improvements batch 1 (2026-09-10): Epley rep cap, zero-rep guard, honest
// LAST pairing, backup manifest + pre-restore undo, storage meter, training-day
// streak, error toasts.
const { boot, assert, run } = require('../lib/harness');

run('Epley caps reps; LAST pairs the heaviest set with its own reps', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => ({
      e20: _epley(100, 20), e10: _epley(100, 10), e5: _epley(100, 5),
      top: _lastPair({ weight: 175, reps: [8, 6, 3], weightLog: [135, 155, 175] }),
      flat: _lastPair({ weight: 160, reps: [8, 8, 7] }),
      legacy: _lastPair({ weight: 100, reps: 5 }),
    }));
    assert(out.e20 === out.e10, 'a 20-rep set scores like a 10-rep set, got ' + out.e20 + ' vs ' + out.e10);
    assert(Math.abs(out.e5 - 100 * (1 + 5 / 30)) < 1e-9, 'Epley intact under the cap');
    assert(out.top.w === 175 && out.top.r === 3, 'top set pairs 175 × 3, got ' + JSON.stringify(out.top));
    assert(out.flat.w === 160 && out.flat.r === 8, 'straight sets keep first-set reps');
    assert(out.legacy.w === 100 && out.legacy.r === 5, 'scalar reps survive');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a 0-rep set is refused with an error toast', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0].name;
      runnerReps[ex] = 0;
      runnerCompleteSet();
      const t = document.getElementById('toast');
      const refused = { done: runnerCompleted[ex] || 0, log: (runnerRepsLog[ex] || []).length,
        toast: t.textContent, live: t.getAttribute('aria-live'), bg: t.style.background };
      runnerReps[ex] = 8;
      runnerCompleteSet();
      return { refused, after: runnerCompleted[ex] || 0 };
    });
    assert(out.refused.done === 0 && out.refused.log === 0, 'nothing logged at 0 reps');
    assert(/0-rep/.test(out.refused.toast), 'toast names the problem: ' + out.refused.toast);
    assert(out.refused.live === 'assertive' && /--red/.test(out.refused.bg), 'error toast is red + assertive');
    assert(out.after === 1, 'a real set still logs');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('backup carries a manifest; restore keeps an undo snapshot; Settings shows storage', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const bk = buildBackupJSON();
      const before = getSessions().length;
      _applyImportedData(bk);
      const snap = JSON.parse(localStorage.getItem('kt_pre_restore') || 'null');
      switchTab('settings');
      const txt = document.body.textContent;
      const st = _storageBytes();
      return {
        manifest: bk._manifest, before, after: getSessions().length,
        snapSessions: snap && snap.data && (snap.data.kt_sessions || []).length,
        snapHasManifest: !!(snap && snap.data && snap.data._manifest),
        undoRow: txt.indexOf('Undo last restore') > -1,
        storageRow: txt.indexOf('Storage') > -1 && txt.indexOf('tap for a breakdown') > -1,
        bytes: st.total, mb: _fmtMB(st.total),
      };
    });
    assert(out.manifest && out.manifest.app === 'Supero' && out.manifest.build === '2' + out.manifest.build.slice(1), 'manifest names the app + build');
    assert(out.manifest.counts.sessions === out.before, 'manifest counts sessions');
    assert(out.after === out.before, 'round-trip restore keeps the data');
    assert(out.snapSessions === out.before && !out.snapHasManifest, 'pre-restore snapshot holds the old data, no manifest');
    assert(out.undoRow, 'Settings offers Undo last restore');
    assert(out.storageRow && out.bytes > 0, 'storage row renders with a real size: ' + out.mb);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('week streak counts runs and sports as training days', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      lsSet('kt_runs', [{ date: todayISO(), distance: 5, time: '25:00' }]);
      return { lifts: calcStreak(getSessions()), all: calcStreak(_trainingDays()) };
    });
    assert(out.lifts === 0, 'no gym sessions → lift-only streak is 0');
    assert(out.all === 1, 'a run this week keeps the streak alive, got ' + out.all);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
