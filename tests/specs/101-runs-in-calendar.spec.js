// Runs in the Activity card (web 20260930-7): Progress › Runs no longer lists every run under the
// Activity card (the Run history list went the way Session history did in 20260929-1). Every run
// is a green block on the card and opens from its day sheet, which reads like the old rows: the
// run's own type, the time as m:ss, the pace in the owner's unit, Apple Health, and an Edit run
// that names the run. Older runs are a month back on the card or a ‹ away in the sheet; an edit
// from the sheet keeps it on the run's day and focus comes back to Edit run.
const { boot, assert, run } = require('../lib/harness');

run('runs live in the Activity card and its day sheet', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return _ymdLocal(d); };
      const T = todayISO(), MID = ago(40), OLD = ago(75);
      lsSet('kt_runs', [
        { id: 7001, date: T, distance: 5, time: '25:00', type: 'tempo', note: '' },
        { id: 7000, date: T, distance: 3.2, time: '19:12', type: 'easy', note: '' },
        { id: 7002, date: MID, dist: 8, time: '63:00', note: '' },                                   // legacy: no type, dist
        { id: 7003, date: OLD, distance: 5, time: '0:41:12', type: 'easy', hr: 150, note: 'From Apple Health' }]);
      const r = { gone: typeof renderRunHistory === 'undefined' && typeof showAllRunHist === 'undefined' };
      const items = () => [...document.querySelectorAll('#cdBody .kt-cd-item')];
      const read = it => {
        const e = it.querySelector('[id^="cal-edit-"]');
        return { ttl: txt(it.querySelector('.kt-cd-ttl')), sub: txt(it.querySelector('.kt-cd-sub')),
          stats: [...it.querySelectorAll('.kt-cd-stat b')].map(txt), edit: e && e.getAttribute('aria-label') };
      };
      // no run list on any Progress tab; nothing follows the Activity card
      switchTab('progress');
      r.noList = ['lifts', 'runs', 'sports'].map(t => {
        setProgressTab(t);
        const s = document.getElementById('screen'), card = s.querySelector('.kt-cal-card');
        const after = [...s.querySelectorAll('.chart-card')].filter(c => card && (card.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
        return !!card && !s.querySelector('.kt-run-hist') && !/Run history/.test(s.textContent) && after.length === 0;
      });
      setProgressTab('runs'); await wait(20);
      // today's runs are one green block; tapping it opens the day with both
      const blk = document.querySelector('#screen .cal-day[data-date="' + T + '"]');
      r.block = !!blk && blk.classList.contains('r') && !blk.classList.contains('w') && blk.getAttribute('data-act') === '1';
      blk.click(); await wait(30);
      r.today = { open: !!document.getElementById('calDayOverlay'), eyebrow: txt(document.querySelector('#cdBody .screen-eyebrow')), runs: items().map(read) };
      // ‹ steps back across months to the older runs; the card behind follows
      document.querySelector('#cdBody .kt-cd-nav button').click(); await wait(30);
      r.mid = { day: calSelectedDate === MID, runs: items().map(read) };
      document.querySelector('#cdBody .kt-cd-nav button').click(); await wait(30);
      r.old = { day: calSelectedDate === OLD, month: calMonth === Number(OLD.slice(5, 7)) - 1, runs: items().map(read) };
      closeCalDay(); await wait(20);
      const oldBlk = document.querySelector('#screen .cal-day[data-date="' + OLD + '"]');
      r.oldBlock = !!oldBlk && oldBlk.classList.contains('r');
      // miles
      localStorage.setItem('kt_unit_d', 'mi');
      openCalDay(T); await wait(20);
      r.mi = items().map(read)[1];
      closeCalDay();
      localStorage.setItem('kt_unit_d', 'km');
      // an edit from the sheet repaints it on the day and focus comes back to Edit run
      openCalDay(T); await wait(20);
      let e = document.getElementById('cal-edit-7001'); e.focus(); e.click();
      document.getElementById('re_dist').value = '6'; saveRunEdit(7001); await wait(30);
      r.edit = { open: !!document.getElementById('calDayOverlay'), day: calSelectedDate === T, stats: read(items()[1]).stats, focus: document.activeElement && document.activeElement.id };
      // a date change follows the run to its new day
      e = document.getElementById('cal-edit-7001'); e.focus(); e.click();
      document.getElementById('re_date').value = MID; saveRunEdit(7001); await wait(30);
      r.move = { open: !!document.getElementById('calDayOverlay'), day: calSelectedDate === MID, ttls: items().map(it => txt(it.querySelector('.kt-cd-ttl'))), focus: document.activeElement && document.activeElement.id };
      closeCalDay();
      return r;
    });
    assert(out.gone, 'the Run history renderer and its state are gone');
    assert(out.noList.every(Boolean), 'no run list under the Activity card on any tab: ' + JSON.stringify(out.noList));
    assert(out.block, 'today\'s runs are a green block');
    assert(out.today.open && out.today.eyebrow === '2 RUNS', 'the block opens the day: ' + JSON.stringify([out.today.open, out.today.eyebrow]));
    assert(JSON.stringify(out.today.runs) === JSON.stringify([
      { ttl: 'Easy run', sub: null, stats: ['3.2 km', '19:12', '6:00 /km'], edit: 'Edit run, Easy run, 3.2 km' },
      { ttl: 'Tempo run', sub: null, stats: ['5 km', '25:00', '5:00 /km'], edit: 'Edit run, Tempo run, 5 km' }]), 'the sheet reads like the old rows: ' + JSON.stringify(out.today.runs));
    assert(out.mid.day && JSON.stringify(out.mid.runs) === JSON.stringify([{ ttl: 'Run', sub: null, stats: ['8 km', '1:03:00', '7:53 /km'], edit: 'Edit run, Run, 8 km' }]), 'a legacy run (no type, dist) reads too: ' + JSON.stringify(out.mid));
    assert(out.old.day && out.old.month && JSON.stringify(out.old.runs) === JSON.stringify([{ ttl: 'Easy run', sub: 'Apple Health', stats: ['5 km', '41:12', '8:14 /km', '150'], edit: 'Edit run, Easy run, 5 km' }]), 'an Apple Health run a few months back: ' + JSON.stringify(out.old));
    assert(out.oldBlock, 'the card behind the sheet shows the older month with its run');
    assert(out.mi && out.mi.stats[0] === '3.11 mi' && out.mi.stats[2] === '8:03 /mi' && out.mi.edit === 'Edit run, Tempo run, 3.11 mi', 'miles: ' + JSON.stringify(out.mi));
    assert(out.edit.open && out.edit.day && out.edit.stats[0] === '6 km' && out.edit.focus === 'cal-edit-7001', 'an edit repaints the day and focus returns to Edit run: ' + JSON.stringify(out.edit));
    assert(out.move.open && out.move.day && out.move.ttls.indexOf('Tempo run') >= 0 && out.move.focus === 'cal-edit-7001', 'a date change follows the run: ' + JSON.stringify(out.move));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
