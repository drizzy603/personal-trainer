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

run('getTodayActivity is memoised per paint and hands out fresh copies', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const a = getTodayActivity(), b = getTodayActivity();
      const same = JSON.stringify(a) === JSON.stringify(b);
      const distinct = a !== b;
      a.type = 'mutated';
      const c = getTodayActivity();
      render();
      const d = getTodayActivity();
      return { same, distinct, cUnaffected: c.type !== 'mutated', dSame: JSON.stringify(d) === JSON.stringify(b),
        enterSends: !_coarsePointer() };
    });
    assert(out.same && out.distinct, 'memo returns equal content, distinct objects');
    assert(out.cUnaffected, 'a caller mutating its copy cannot poison the next caller');
    assert(out.dSame, 'render() clears the memo without changing the answer');
    assert(out.enterSends, 'headless (fine pointer) keeps Enter-to-send');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('the dock is exactly --tab-h tall, so every clearance built from the token is true', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const tabs = document.getElementById('tabs');
      const token = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h'));
      const r = tabs.getBoundingClientRect();
      const tabH = [...tabs.querySelectorAll('.tab')].map(t => Math.round(t.getBoundingClientRect().height));
      return { token, dock: Math.round(r.height), tabH, bottomGap: Math.round(window.innerHeight - r.bottom) };
    });
    assert(out.dock === out.token, 'dock height ' + out.dock + ' equals --tab-h ' + out.token);
    assert(out.tabH.every(h => h >= 44), 'every tab stays a 44pt target: ' + out.tabH.join(','));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('run times are read forgivingly and the form previews pace', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => ({
      a: _normRunTime('28:30'), b: _normRunTime('28.30'), c: _normRunTime('28 30'), d: _normRunTime('28m30s'),
      e: _normRunTime('1h02m'), f: _normRunTime('1:02:30'), g: _normRunTime('28'), h: _normRunTime('28.5'),
      bad1: _normRunTime('fast'), bad2: _normRunTime('28:75'),
      pace: _rlogPaceText('5', '25:00'), paceRead: _rlogPaceText('10', '50'),
    }));
    assert(out.a === '28:30' && out.b === '28:30' && out.c === '28:30' && out.d === '28:30', 'mm:ss variants normalise: ' + JSON.stringify(out));
    assert(out.e === '1:02:00' && out.f === '1:02:30', 'hours forms normalise');
    assert(out.g === '28:00' && out.h === '28:30', 'bare minutes and decimal minutes');
    assert(out.bad1 === null && out.bad2 === null, 'garbage and 75 seconds rejected');
    assert(/5:00 \/KM/.test(out.pace), 'pace preview: ' + out.pace);
    assert(/5:00 \/KM .* READ AS 50:00/.test(out.paceRead), 'preview says how a bare number was read: ' + out.paceRead);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Records pills carry the PR reps and date from the log', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const prs = getPRs(); const name = Object.keys(prs)[0];
      const meta = _prMeta(name, prs[name]);
      showAllPRs = true; switchTab('progress');
      const html = document.body.innerHTML;
      return { name, w: prs[name], meta, shown: meta ? html.indexOf(fmtDate(meta.date).toUpperCase()) > -1 : null };
    });
    assert(out.meta && out.meta.date, 'meta resolves a date for ' + out.name + ' @ ' + out.w + ': ' + JSON.stringify(out.meta));
    assert(out.shown, 'the pill shows that date');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
