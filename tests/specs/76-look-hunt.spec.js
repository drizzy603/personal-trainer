// Hunt 2026-09-24, look: the selected calendar day keeps its workout colour in both rooms (since
// 20260929-2 a day is a block: workouts --blk-lift, selection a --text ring); the empty-Progress
// promise never shows PR in lime.
const { boot, assert, run } = require('../lib/harness');

for (const room of ['heavyweight', 'dark']) {
  run('calendar dot and empty promise (' + room + ')', async () => {
    const app = await boot({ native: true, seed: { kt_theme: room } });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const r = {};
        switchTab('progress'); calYear = 2026; calMonth = 6; render();
        const blk = document.querySelector('.kt-cal-grid .cal-day.w:not(.r):not(.s)');
        const day = blk.getAttribute('data-date');
        selectCalDate(day); await wait(50);
        const cell = document.querySelector('.cal-day.sel[data-date="' + day + '"]');
        r.cell = cell && getComputedStyle(cell).backgroundColor;
        r.ring = cell && [getComputedStyle(cell).outlineStyle, getComputedStyle(cell).outlineColor];
        r.text = getComputedStyle(document.body).color;
        r.lift = getComputedStyle(document.documentElement).getPropertyValue('--blk-lift').trim();
        closeCalDay();
        // empty history: the promise line
        lsSet('kt_sessions', []); lsSet('kt_runs', []); lsSet('kt_sports', []);
        switchTab('progress'); render(); await wait(50);
        const body = [...document.querySelectorAll('.kt-empty-contract-body')].find(b => /PR/.test(b.textContent));
        const span = body && [...body.querySelectorAll('span')].find(s => s.textContent.trim() === 'PR');
        r.promise = body && span ? { body: getComputedStyle(span.parentElement).color, pr: getComputedStyle(span).color } : null;
        return r;
      });
      assert(out.ring && out.ring[0] === 'solid' && out.ring[1] === out.text, 'the selected day is a ring in the text colour: ' + JSON.stringify(out));
      if (room === 'dark') {
        assert(out.cell === 'rgb(77, 124, 255)' && out.lift === '#4d7cff', 'Lime: a workout day stays blue when selected, never lime: ' + JSON.stringify(out));
        assert(out.promise && out.promise.pr === out.promise.body, 'Lime: the empty promise shows PR in its line colour, not lime: ' + JSON.stringify(out.promise));
      } else {
        assert(out.cell === 'rgb(10, 67, 245)' && out.lift === '#0a43f5', 'Heavyweight: a workout day stays blue when selected: ' + JSON.stringify(out));
      }
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  });
}
