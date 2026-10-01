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

// Review fixes (web 20260930-9): a legacy time reads the way the run editor reads it ('25.50' is
// 25:50, '45 min' is 45:00) and 59.6 s carries into the minute; the pace is worked from the
// exact seconds; a run dated in a later month stays reachable (› goes to the last month holding
// a log), and the Log › Run form and the coach's log_run refuse a future date like the editor
// does; closing the sheet after an edit re-rendered the card lands on the day's block.
run('review fixes: legacy times, exact pace, a later month, future dates, focus after close', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_sports: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      const stats = id => { const e = document.getElementById('cal-edit-' + id); return e ? [...e.closest('.kt-cd-item').querySelectorAll('.kt-cd-stat b')].map(txt) : null; };
      const toMonth = () => { calMonth = new Date().getMonth(); calYear = new Date().getFullYear(); render(); };
      const T = todayISO(), r = {};
      r.carry = [_fmtRunSecs(1559.6), _fmtRunSecs(59.6), _fmtRunSecs(3599.5)];
      // legacy time strings, and a pace the old per-km rounding got a second wrong in miles
      lsSet('kt_runs', [
        { id: 8101, date: T, distance: 5, time: '25.50', type: 'easy' },
        { id: 8102, date: T, distance: 5, time: '25:59.6', type: 'easy' },
        { id: 8103, date: T, distance: 5, time: '45 min', type: 'easy' },
        { id: 8104, date: T, distance: 5, time: '26:42', type: 'easy' }]);
      switchTab('progress'); setProgressTab('runs'); await wait(20);
      openCalDay(T); await wait(20);
      r.legacy = [stats(8101), stats(8102), stats(8103)];
      openRunEditor(8101); r.editor = [document.getElementById('re_time').value, txt(document.getElementById('re_pace'))]; closeRunEditor();
      closeCalDay();
      localStorage.setItem('kt_unit_d', 'mi');
      openCalDay(T); await wait(20); r.mi = stats(8104); closeCalDay();
      localStorage.setItem('kt_unit_d', 'km');
      // a run in a later month, as the only log
      const nx = new Date(); nx.setDate(1); nx.setMonth(nx.getMonth() + 1); nx.setDate(5);
      const F = _ymdLocal(nx);
      lsSet('kt_runs', [{ id: 8201, date: F, distance: 4, time: '22:00', type: 'easy' }]);
      toMonth(); await wait(20);
      const next = () => document.querySelector('#screen .kt-cal-nav button[aria-label="Next month"]');
      r.future = { enabled: !!next() && !next().disabled };
      next().click(); await wait(20);
      const fb = document.querySelector('#screen .cal-day[data-date="' + F + '"]');
      r.future.block = !!fb && fb.classList.contains('r');
      r.future.stops = !!next() && next().disabled;
      fb.click(); await wait(20);
      r.future.sheet = !!document.getElementById('cal-edit-8201');
      closeCalDay();
      // the Log > Run form and the coach refuse a future date
      const tm = new Date(); tm.setDate(tm.getDate() + 1); const TM = _ymdLocal(tm);
      lsSet('kt_runs', []);
      localStorage.setItem('kt_log_tabs', JSON.stringify(['run', 'body'])); _lsCache = {};
      switchTab('log'); switchLogSub('run'); openRunLog(); await wait(20);
      const di = document.getElementById('kt-rlog-date');
      r.form = { max: !!di && di.getAttribute('max') === T };
      document.getElementById('kt-rlog-dist').value = '5'; document.getElementById('kt-rlog-time').value = '25:00'; di.value = TM;
      saveInlineRun(); await wait(20);
      r.form.refused = getRuns().length === 0 && /today or an earlier date/.test(txt(document.getElementById('toast')) || '');
      document.getElementById('kt-rlog-date').value = T;
      saveInlineRun(); await wait(20);
      r.form.today = getRuns().length === 1 && getRuns()[0].date === T;
      const c1 = executeCoachTool('log_run', { distance: 5, time: '25:00', date: TM });
      const c2 = executeCoachTool('log_run', { distance: 5, time: '25:00', date: T });
      r.coach = { future: c1.ok === false && /future/.test(c1.error || ''), today: !!c2.ok, n: getRuns().length };
      // focus after an edit and a close
      lsSet('kt_runs', [{ id: 8301, date: T, distance: 5, time: '25:00', type: 'easy' }]);
      switchTab('progress'); setProgressTab('runs'); toMonth(); await wait(20);
      const tb = document.querySelector('#screen .cal-day[data-date="' + T + '"]'); tb.focus(); tb.click(); await wait(20);
      const ce = document.getElementById('cal-edit-8301'); ce.focus(); ce.click();
      document.getElementById('re_dist').value = '6'; saveRunEdit(8301); await wait(20);
      document.getElementById('calDayOverlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const a = document.activeElement;
      r.focus = { closed: !document.getElementById('calDayOverlay'), onBlock: !!a && !!a.classList && a.classList.contains('cal-day') && a.getAttribute('data-date') === T };
      return r;
    });
    assert(JSON.stringify(out.carry) === JSON.stringify(['26:00', '1:00', '1:00:00']), '59.6 s carries into the minute: ' + JSON.stringify(out.carry));
    assert(JSON.stringify(out.legacy) === JSON.stringify([['5 km', '25:50', '5:10 /km'], ['5 km', '26:00', '5:12 /km'], ['5 km', '45:00', '9:00 /km']]), 'legacy times read like the editor reads them: ' + JSON.stringify(out.legacy));
    assert(out.editor[0] === '25:50' && /5:10/.test(out.editor[1] || ''), 'the editor agrees: ' + JSON.stringify(out.editor));
    assert(JSON.stringify(out.mi) === JSON.stringify(['3.11 mi', '26:42', '8:36 /mi']), 'the pace is worked from the exact seconds: ' + JSON.stringify(out.mi));
    assert(out.future.enabled && out.future.block && out.future.stops && out.future.sheet, 'a later month holding the only run is reachable: ' + JSON.stringify(out.future));
    assert(out.form.max && out.form.refused && out.form.today, 'the Log > Run form refuses a future date: ' + JSON.stringify(out.form));
    assert(out.coach.future && out.coach.today && out.coach.n === 2, 'the coach refuses a future date: ' + JSON.stringify(out.coach));
    assert(out.focus.closed && out.focus.onBlock, 'closing after an edit lands on the day\'s block: ' + JSON.stringify(out.focus));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
