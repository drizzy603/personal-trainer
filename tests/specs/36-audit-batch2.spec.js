// Audit batch 2 pins: Auto theme survives repaints, the Runs goal bar renders,
// 5k bests use a +/-10% window normalised to 5 km, "this week" is calendar-
// anchored, old-session edits don't regress working weights, lsSet rolls back
// on a failed write, and the volume chart shows gaps instead of hiding them.
const { boot, assert, run } = require('../lib/harness');

run('Auto theme stays Auto across paint and system flips', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      setAutoTheme();
      const stored1 = localStorage.getItem('kt_theme'), cur1 = currentTheme;
      _paintTheme('light');           // what the sunset listener does
      const stored2 = localStorage.getItem('kt_theme'), cur2 = currentTheme;
      applyTheme('midnight');         // explicit pick persists
      const stored3 = localStorage.getItem('kt_theme');
      applyTheme('dark');
      return { stored1, cur1, stored2, cur2, stored3 };
    });
    assert(out.stored1 === 'auto' && out.cur1 === 'auto', 'setAutoTheme persists auto');
    assert(out.stored2 === 'auto' && out.cur2 === 'auto', 'a system repaint keeps auto');
    assert(out.stored3 === 'midnight', 'an explicit pick persists');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('Runs: pace goal bar renders and 5k best is honest', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      // Only 10 km runs at 5:00/km → no 5k best; then a 5.2 km run qualifies, normalised.
      lsSet('kt_runs', [
        { id: 1, date: todayISO(), distance: 10, time: '50:00', note: '' },
      ]);
      localStorage.setItem('kt_run_goal', '6:00');
      progressTab = 'runs';
      switchTab('progress');
      const t1 = document.getElementById('screen').textContent;
      const noFake5k = t1.indexOf('5k Time') === -1;
      const paceBar = t1.indexOf('/km / 6:00/km') > -1 || t1.indexOf('Avg pace') > -1;
      lsSet('kt_runs', [
        { id: 1, date: todayISO(), distance: 10, time: '50:00', note: '' },
        { id: 2, date: todayISO(), distance: 5.2, time: '26:00', note: '' },
      ]);
      render();
      const t2 = document.getElementById('screen').textContent;
      // 26:00 over 5.2 km normalises to 5:00/km for 5 km; the raw /5 read
      // would print 5:12/km as the 'best 5k pace'.
      const normalised = t2.indexOf('5k') > -1 && t2.indexOf('5:12/km') === -1;
      return { noFake5k, paceBar, normalised };
    });
    assert(out.noFake5k, 'a 10 km run is not a 5k time');
    assert(out.paceBar, 'avg pace goal bar renders');
    assert(out.normalised, '5k best normalises a 5.2 km run to 5 km');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('this-week numbers follow the calendar, not the programme week', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const lastMonth = new Date(Date.now() - 28 * 86400000);
      const oldISO = lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0') + '-' + String(lastMonth.getDate()).padStart(2, '0');
      // Both stamped with the CURRENT programme week (what a finished plan does).
      lsSet('kt_sessions', [
        { id: 1, date: todayISO(), type: 'Push', week: currentWeek,
          exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }] },
        { id: 2, date: oldISO, type: 'Push', week: currentWeek,
          exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }] },
      ]);
      return { inWeek: [_inThisCalWeek({ date: todayISO() }), _inThisCalWeek({ date: oldISO })],
        weekVol: (function(){ var v = 0; getSessions().forEach(function(s){ if(_inThisCalWeek(s)) v += calcVolume(s.exercises); }); return v; })() };
    });
    assert(out.inWeek[0] === true && out.inWeek[1] === false, 'calendar membership');
    assert(out.weekVol === 2400, 'this-week volume counts only this calendar week, got ' + out.weekVol);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('old-session edits keep the working weight; lsSet rolls back on failure', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const old = new Date(Date.now() - 42 * 86400000);
      const oldISO = old.getFullYear() + '-' + String(old.getMonth() + 1).padStart(2, '0') + '-' + String(old.getDate()).padStart(2, '0');
      lsSet('kt_sessions', [
        { id: 1, date: todayISO(), type: 'Push', week: 2, exercises: [{ name: 'Bench Press', sets: 1, reps: [5], weight: 205, weightLog: [205], isMain: true }] },
        { id: 2, date: oldISO, type: 'Push', week: 1, exercises: [{ name: 'Bench Press', sets: 1, reps: [5], weight: 1850, weightLog: [1850], isMain: true }] },
      ]);
      const w = getWeights(); w['Bench Press'] = 205; lsSet('kt_weights', w);
      // Edit the OLD session's typo via the editor.
      openSessionEditor(2);
      const wEl = document.getElementById('se_0_0_w'); if (wEl) wEl.value = '185';
      saveSessionEdit(2);
      const kept = getWeights()['Bench Press'] === 205;
      const fixed = getSessions().find(s => s.id === 2).exercises[0].weight === 185;
      // lsSet rollback: simulate a quota failure.
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(){ throw new Error('QuotaExceededError'); };
      let ok;
      try { ok = lsSet('kt_bw', [{ date: todayISO(), weight: 999 }]); }
      finally { Storage.prototype.setItem = realSet; }
      const phantom = (lsGet('kt_bw') || []).some(b => b.weight === 999);
      return { kept, fixed, ok, phantom };
    });
    assert(out.fixed, 'the old session itself is corrected');
    assert(out.kept, 'working weight stays at the newest session');
    assert(out.ok === false && !out.phantom, 'failed write leaves no phantom in the cache');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('volume chart shows a gap instead of hiding it', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const ago = n => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
      const ex = [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }];
      // Two training weeks a month ago, nothing since.
      lsSet('kt_sessions', [
        { id: 1, date: ago(35), type: 'Push', week: 1, exercises: ex },
        { id: 2, date: ago(28), type: 'Push', week: 2, exercises: ex },
      ]);
      progressTab = 'lifts';
      switchTab('progress');
      const el = document.getElementById('screen');
      const bars = el.querySelectorAll('.kt-bars .bar').length;
      const empties = el.querySelectorAll('.kt-bars .bar.empty').length;
      const t = el.textContent;
      return { bars, empties, honestFooter: t.indexOf('LAST · WK OF') > -1, noThisWk: t.indexOf('THIS WK') === -1 };
    });
    assert(out.bars === 8, 'eight calendar weeks, got ' + out.bars);
    assert(out.empties >= 3, 'gap weeks render as empty ticks, got ' + out.empties);
    assert(out.honestFooter && out.noThisWk, 'footer names the last data week');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
