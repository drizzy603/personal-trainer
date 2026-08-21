// Pins for M&M item 12 (C1·D): the monthly poster — attendance grid of real
// active days in Progress for the last completed month, thin mono numeral,
// PRs-only gold footer, and the canvas export drawing through toBlob.
const { boot, assert, run } = require('../lib/harness');

run('monthly poster: real days only, lives in Progress, exports', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      // With no data the poster stays away.
      switchTab('progress');
      const t0 = document.getElementById('screen').textContent;
      const absent = t0.indexOf('ACTIVE DAYS') === -1;
      // Two sessions + one run in the last completed month, one day shared.
      const mk = _wrapMonthKey();
      lsSet('kt_sessions', [
        { id: 1, date: mk + '-03', type: 'Push', week: 1,
          exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }], prs: ['Bench Press'] },
        { id: 2, date: mk + '-10', type: 'Pull', week: 2,
          exercises: [{ name: 'Barbell Row', sets: 3, reps: [8, 8, 8], weight: 90, isMain: true }], prs: [] },
      ]);
      lsSet('kt_runs', [
        { id: 3, date: mk + '-03', distance: 5, time: '30:00', note: '' },
        { id: 4, date: mk + '-17', distance: 3, time: '18:00', note: '' },
      ]);
      const days = Object.keys(_monthActiveDays(mk));
      const distinct = days.length === 3; // 03 shared by run+session, 10, 17
      render();
      const el = document.getElementById('screen');
      const t1 = el.textContent;
      const shows = t1.indexOf('ACTIVE DAYS') > -1 && t1.indexOf('3') > -1
        && t1.indexOf('VOLUME LB') > -1 && t1.indexOf('Share the poster') > -1;
      // Grid draws one cell per real day of that month.
      const first = new Date(mk + '-01T00:00:00');
      const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const grid = el.querySelector('[style*="grid-template-columns:repeat(7,1fr)"]');
      const cellCount = grid ? grid.querySelectorAll('[style*="aspect-ratio"]').length : 0;
      // Export draws through toBlob (headless has no share sheet).
      _drawWrapCard(mk, _monthStats(mk), '#c8ff00');
      await new Promise(r => setTimeout(r, 800));
      const toast = document.getElementById('toast');
      const exported = toast && toast.textContent === 'Sharing not supported here';
      return { absent, distinct, shows, cellCount, dim, exported };
    });
    assert(out.absent, 'no data, no poster');
    assert(out.distinct, 'active days are distinct real days');
    assert(out.shows, 'poster lives in Progress with numeral, footer, share');
    assert(out.cellCount === out.dim, 'grid draws one cell per real day, got ' + out.cellCount + '/' + out.dim);
    assert(out.exported, 'canvas export completes, got: ' + out.exported);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
