// Hunt 2026-09-24, look: the selected calendar day keeps its workout dot in Heavyweight (it was
// accent on an accent cell) and in Lime; the empty-Progress promise never shows PR in lime.
const { boot, assert, run } = require('../lib/harness');

for (const room of ['heavyweight', 'dark']) {
  run('calendar dot and empty promise (' + room + ')', async () => {
    const app = await boot({ native: true, seed: { kt_theme: room } });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const r = {};
        switchTab('progress'); calYear = 2026; calMonth = 6; render();
        const day = getSessions().find(s => s.date >= '2026-07-01' && s.date <= '2026-07-31').date;
        selectCalDate(day); await wait(50);
        const cell = document.querySelector('.cal-day.sel'), dot = cell && cell.querySelector('.cal-dot-w');
        r.cell = cell && getComputedStyle(cell).backgroundColor;
        r.dot = dot && getComputedStyle(dot).backgroundColor;
        r.accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        // empty history: the promise line
        lsSet('kt_sessions', []); lsSet('kt_runs', []); lsSet('kt_sports', []);
        switchTab('progress'); render(); await wait(50);
        const body = [...document.querySelectorAll('.kt-empty-contract-body')].find(b => /PR/.test(b.textContent));
        const span = body && [...body.querySelectorAll('span')].find(s => s.textContent.trim() === 'PR');
        r.promise = body && span ? { body: getComputedStyle(span.parentElement).color, pr: getComputedStyle(span).color } : null;
        return r;
      });
      assert(out.dot && out.dot !== out.cell, 'the selected day keeps a visible workout dot: ' + JSON.stringify(out));
      if (room === 'dark') {
        assert(out.promise && out.promise.pr === out.promise.body, 'Lime: the empty promise shows PR in its line colour, not lime: ' + JSON.stringify(out.promise));
      } else {
        assert(out.dot === 'rgb(255, 255, 255)', 'Heavyweight: a white dot on the blue cell: ' + out.dot);
      }
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  });
}
