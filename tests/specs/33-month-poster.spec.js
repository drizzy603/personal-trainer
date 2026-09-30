// The Activity card (web 20260929-2): the monthly poster (M&M item 12, C1·D) and the Activity
// Calendar fused into one card in Progress › History. The month, its active days, every day as a
// block (workouts --blk-lift, runs --blk-run, activities --blk-sport, two kinds split on the
// diagonal, rest days blank), a legend, the month's volume, distance and PRs, the poster to share.
// A block opens the day sheet. The poster image is drawn the same way and exports through toBlob.
const { boot, assert, run } = require('../lib/harness');

run('activity card: real days as coloured blocks, one card, opens a day, exports', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      // With no logs at all Progress shows its empty state, not the card.
      switchTab('progress'); await wait(30);
      r.none = !document.querySelector('.kt-cal-card');
      // Two sessions + a run on one of those days + another run + an activity, last month.
      const mk = _wrapMonthKey();
      lsSet('kt_sessions', [
        { id: 1, date: mk + '-03', type: 'Push', week: 1, exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }], prs: ['Bench Press'] },
        { id: 2, date: mk + '-10', type: 'Pull', week: 2, exercises: [{ name: 'Barbell Row', sets: 3, reps: [8, 8, 8], weight: 90, isMain: true }], prs: [] },
      ]);
      lsSet('kt_runs', [
        { id: 3, date: mk + '-03', distance: 5, time: '30:00', note: '' },
        { id: 4, date: mk + '-17', distance: 3, time: '18:00', note: '' },
      ]);
      lsSet('kt_sports', [{ id: 5, date: mk + '-20', type: 'Yoga', duration: 30 }]);
      calYear = +mk.slice(0, 4); calMonth = +mk.slice(5, 7) - 1; render(); await wait(30);
      const card = document.querySelector('.kt-cal-card');
      const blk = d => card.querySelector('.cal-day[data-date="' + mk + '-' + d + '"]');
      const bgc = el => getComputedStyle(el).backgroundColor;
      const first = new Date(mk + '-01T00:00:00'), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      r.card = {
        num: card.querySelector('.kt-cal-num').textContent, lbl: card.querySelector('.kt-cal-lbl').textContent,
        blocks: card.querySelectorAll('.kt-cal-grid .cal-day').length, dim,
        acts: card.querySelectorAll('.kt-cal-grid .cal-day[data-act]').length,
        split: /linear-gradient/.test(blk('03').getAttribute('style') || '') && blk('03').classList.contains('w') && blk('03').classList.contains('r'),
        lift: bgc(blk('10')), run: bgc(blk('17')), sport: bgc(blk('20')), rest: blk('11').getAttribute('style'),
        foot: [...card.querySelectorAll('.kt-cal-stat')].map(e => e.querySelector('b').textContent + '|' + e.querySelector('span').textContent),
        share: (card.querySelector('.kt-cal-share') || {}).textContent,
        legend: card.querySelector('.kt-cal-legend').textContent,
        month: card.querySelector('.kt-cal-month').textContent,
      };
      // a block opens its day
      blk('10').click(); await wait(40);
      r.sheet = !!document.getElementById('calDayOverlay') && /Pull/.test(document.getElementById('cdBody').textContent);
      closeCalDay();
      // the month can't be stepped past this one
      const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth(); render(); await wait(20);
      const card0 = document.querySelector('.kt-cal-card');
      r.empty = { num: card0.querySelector('.kt-cal-num').textContent, share: !!card0.querySelector('.kt-cal-share'), cards: document.querySelectorAll('.kt-cal-card').length };
      const nextBtn = document.querySelector('.kt-cal-nav button[aria-label="Next month"]');
      r.nextOff = nextBtn.disabled; calNav(1); r.stayed = calMonth === now.getMonth() && calYear === now.getFullYear();
      const todayBlk = document.querySelector('.kt-cal-grid .cal-day.today');
      r.today = !!todayBlk && todayBlk.getAttribute('data-date') === todayISO();
      const fut = document.querySelector('.kt-cal-grid .cal-day.future');
      r.future = !fut || getComputedStyle(fut).opacity === '0.4';
      // sharing another month does not stamp last month's wrap; sharing last month does
      lsDel('kt_last_wrap');
      const other = mk.slice(0, 4) + '-' + (mk.slice(5, 7) === '01' ? '02' : '01');
      const orig = window._shareCardFonts; window._shareCardFonts = () => Promise.resolve();
      shareMonthlyCard(other); r.stampOther = lsGet('kt_last_wrap');
      shareMonthlyCard(mk); r.stampWrap = lsGet('kt_last_wrap'); r.mk = mk;
      window._shareCardFonts = orig;
      // the poster: drawn and exported (headless has no share sheet)
      await wait(300);
      const c = _drawWrapCard(mk, _monthStats(mk), '#c8ff00');
      r.poster = { w: c && c.width, h: c && c.height };
      await wait(800);
      const toast = document.getElementById('toast');
      r.exported = !!(toast && /^Saved as fitness-programmer-|^Sharing not supported here$/.test(toast.textContent));
      return r;
    });
    assert(out.none, 'no logs at all: the empty Progress, no card');
    assert(out.empty.num === '0' && !out.empty.share && out.empty.cards === 1, 'a month with no logs: 0 days, nothing to share, one card: ' + JSON.stringify(out.empty));
    const c = out.card;
    assert(c.num === '4' && c.lbl === 'ACTIVE DAYS' && c.blocks === c.dim && c.acts === 4, 'distinct real days, one block per day of the month: ' + JSON.stringify(c));
    assert(c.split, 'a day with a workout and a run is split on the diagonal');
    assert(c.lift === 'rgb(10, 67, 245)' && c.run === 'rgb(22, 163, 74)' && c.sport === 'rgb(124, 58, 237)' && c.rest === null, 'workouts blue, runs green, activities purple, rest days blank: ' + JSON.stringify(c));
    assert(JSON.stringify(c.foot) === JSON.stringify(['4.6k|VOLUME LB', '8|KM RUN', '1|PR']) && /Share the poster/.test(c.share || '') && /Workout/.test(c.legend) && /Run/.test(c.legend), 'footer, legend and share: ' + JSON.stringify(c));
    assert(out.sheet, 'a block opens its day sheet');
    assert(out.nextOff && out.stayed && out.today && out.future, 'no stepping past this month; today and the days ahead are marked: ' + JSON.stringify([out.nextOff, out.stayed, out.today, out.future]));
    assert(out.stampOther == null && String(out.stampWrap) === out.mk, 'only last month stamps the wrap card: ' + JSON.stringify([out.stampOther, out.stampWrap, out.mk]));
    assert(out.poster.w === 1080 && out.poster.h === 1350 && out.exported, 'the poster draws and exports: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
