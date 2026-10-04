// Calendar day sheet (web 20260929-1): Progress › Lifts no longer lists every session under the
// Activity Calendar; a tapped day opens a sheet with everything logged on it (workouts, runs,
// activities) and each one's actions (share card, edit, date, delete). Deletes and moves keep it in
// step (a move follows the log), ‹ › step between logged days, an empty day says so without a sheet,
// and COMPARE keeps its inline pick list.
const { boot, assert, run } = require('../lib/harness');

run('calendar day sheet: opens a day, keeps in step, steps between days', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const txt = q => { const e = document.querySelector(q); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
      const r = {};
      switchTab('progress'); progressTab = 'lifts'; render(); await wait(30);
      r.noList = !/Session history/.test(document.getElementById('screen').textContent) && /Tap a day to see what you did/.test(document.getElementById('screen').textContent);
      const s = getSessions().find(x => x.type === 'Push');
      const d = s.date;
      const runs = getRuns(); runs.unshift({ id: 4242, date: d, distance: 5, time: '25:00', type: 'tempo', note: '' }); lsSet('kt_runs', runs);
      const sp = getSportLogs(); sp.unshift({ id: 4343, date: d, type: 'Yoga', duration: 30 }); lsSet('kt_sports', sp);
      _calNavToDate(d); calSelectedDate = null; render(); await wait(30);
      document.querySelector('.cal-day[data-date="' + d + '"]').click(); await wait(40);
      r.open = !!document.getElementById('calDayOverlay') && calSelectedDate === d && !!document.querySelector('.cal-day.sel[data-date="' + d + '"]');
      r.title = txt('#cdTitle'); r.eyebrow = txt('#cdBody .screen-eyebrow');
      r.dayYear = Number(d.slice(0, 4)); r.nowYear = new Date().getFullYear();
      r.items = document.querySelectorAll('#cdBody .kt-cd-item').length;
      const acts = [...document.querySelectorAll('#cdBody .kt-cd-item')].map(it => [...it.querySelectorAll('.kt-cd-acts button, .kt-cd-acts input')].map(b => b.tagName === 'INPUT' ? 'date' : b.textContent.trim()));
      r.acts = acts;
      r.lifts = document.querySelectorAll('#cdBody .kt-cd-item')[0].querySelectorAll('.hist-ex-row').length === (s.exercises || []).length;
      // a render with nothing new keeps the sheet's nodes (an open date picker, focus and scroll survive)
      const node = document.querySelector('#cdBody .kt-cd-item'); render(); await wait(20);
      r.stable = document.querySelector('#cdBody .kt-cd-item') === node;
      // delete the run: the sheet stays on the day; undo puts it back
      deleteRun(4242); await wait(30);
      r.delRun = { open: !!document.getElementById('calDayOverlay'), items: document.querySelectorAll('#cdBody .kt-cd-item').length, day: calSelectedDate };
      const u = document.querySelector('#toast .kt-toast-undo'); if (u) u.click(); await wait(30);
      r.undo = document.querySelectorAll('#cdBody .kt-cd-item').length;
      // move the workout: the sheet and the calendar follow it
      moveSession(s.id, '2026-06-10'); await wait(40);
      r.move = { day: calSelectedDate, month: calMonth, title: txt('#cdTitle'), has: [...document.querySelectorAll('#cdBody .kt-cd-ttl')].some(t => /Push/.test(t.textContent)) };
      moveSession(s.id, d); await wait(40);
      // ‹ › step to the previous / next day with a log
      const days = _calActiveDays(), i = days.indexOf(calSelectedDate);
      const [prevB, nextB] = document.querySelectorAll('.kt-cd-nav button');
      r.navLabels = [prevB.textContent, nextB.textContent, nextB.disabled];
      if (!prevB.disabled) { prevB.click(); await wait(40); }
      r.prev = calSelectedDate === days[i - 1];
      // delete everything on a one-log day: the sheet closes itself
      const one = days.find(x => _calDayLogs(x).s.length + _calDayLogs(x).r.length + _calDayLogs(x).p.length === 1 && _calDayLogs(x).s.length === 1);
      if (one) {
        _calDayGo(one); await wait(40);
        deleteSession(_calDayLogs(one).s[0].id); await wait(40);
        r.lastGone = { sheet: !!document.getElementById('calDayOverlay'), sel: calSelectedDate };
      }
      // an empty day: a note, no sheet
      _calNavToDate('2026-07-01'); calSelectedDate = null; render(); await wait(20);
      const empty = [...document.querySelectorAll('.cal-day')].find(c => !c.getAttribute('data-act'));
      empty.click(); await wait(30);
      r.empty = { sheet: !!document.getElementById('calDayOverlay'), toast: txt('#toast') };
      // the close button clears the selection
      openCalDay(d); await wait(20);
      document.querySelector('#cdBody .kt-sheet-x').click(); await wait(20);
      r.closed = !document.getElementById('calDayOverlay') && calSelectedDate === null && !document.querySelector('.cal-day.sel');
      // COMPARE keeps the inline pick list, no sheet
      cmpToggle(); await wait(30);
      const act = document.querySelector('.cal-day[data-act="1"]'); act.click(); await wait(30);
      r.cmp = { sheet: !!document.getElementById('calDayOverlay'), picks: document.querySelectorAll('#cal-detail button.kt-vs-pick').length > 0 || /0 WORKOUTS|0 RUNS/.test(txt('#cal-detail') || ''), sel: calSelectedDate === act.getAttribute('data-date') };
      return r;
    });
    assert(out.noList, 'the Lifts tab ends at the calendar, with the hint');
    // The seed's day is in 2026: from another year on, the title names its year (_calDayName).
    const wantTitle = 'Tuesday, Jul 21' + (out.dayYear !== out.nowYear ? ', ' + out.dayYear : '');
    assert(out.open && out.title === wantTitle && /1 WORKOUT · 1 RUN · 1 ACTIVITY/.test(out.eyebrow) && out.items === 3, 'a tapped day opens its sheet: ' + JSON.stringify([out.title, out.eyebrow, out.items]));
    assert(JSON.stringify(out.acts) === JSON.stringify([['Share card', 'Edit sets', 'date', 'Delete'], ['Edit run', 'date', 'Delete'], ['Edit', 'date', 'Delete']]), 'every log keeps its actions: ' + JSON.stringify(out.acts));
    assert(out.lifts && out.stable, 'the workout lists its lifts, and a render with nothing new keeps the sheet as it is: ' + JSON.stringify([out.lifts, out.stable]));
    assert(out.delRun.open && out.delRun.items === 2 && out.undo === 3, 'a delete keeps the sheet on its day and Undo puts it back: ' + JSON.stringify([out.delRun, out.undo]));
    assert(out.move.day === '2026-06-10' && out.move.month === 5 && /Jun 10/.test(out.move.title) && out.move.has, 'a moved workout is followed to its new day: ' + JSON.stringify(out.move));
    assert(out.prev && /^‹ /.test(out.navLabels[0]), '‹ steps to the previous day with a log: ' + JSON.stringify(out.navLabels));
    if (out.lastGone) assert(!out.lastGone.sheet && out.lastGone.sel === null, 'the sheet closes when its day is empty: ' + JSON.stringify(out.lastGone));
    assert(!out.empty.sheet && /^Nothing logged on /.test(out.empty.toast || ''), 'an empty day says so, no sheet: ' + JSON.stringify(out.empty));
    assert(out.closed, 'closing clears the selection');
    assert(!out.cmp.sheet && out.cmp.sel, 'COMPARE filters inline, no sheet: ' + JSON.stringify(out.cmp));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('calendar day sheet: dev nav progress/day opens the newest logged day', async () => {
  const app = await boot({ native: true, seed: { kt_dev_nav: 'progress/day' } });
  try {
    const out = await app.page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 300));
      const days = _calActiveDays();
      return { open: !!document.getElementById('calDayOverlay'), day: calSelectedDate, newest: days[days.length - 1], tab: currentTab };
    });
    assert(out.open && out.day === out.newest && out.tab === 'progress', 'progress/day: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
