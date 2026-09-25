// Hunt 2026-09-24, Compare and the watch payload: same-day pairs order by start time (Health
// batch imports and late wrist drains used to invert every delta), the tray keeps the two names
// on narrow and zoomed screens, a shared photo leaves compare before the chat opens, and the
// watch gets '[]' (not '') when there is no programme so it clears the archived week, plus the
// display unit for kg users.
const { boot, assert, run } = require('../lib/harness');

run('compare: same-day order, tray names, share exit; watch: week clears, unit rides along', async () => {
  const app = await boot({ native: true });
  const p = app.page;
  try {
    const out = await p.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const day = '2026-07-18';
      // Two Health runs imported in one batch: the evening run was saved first, so it has the smaller id.
      const am = new Date(day + 'T07:00:00').getTime(), pm = new Date(day + 'T18:30:00').getTime();
      const runs = getRuns().filter(x => x.date !== day);
      runs.unshift({ id: 5000, startMs: pm, date: day, distance: 10, time: '50:00', note: 'From Apple Health', type: 'easy' },
                   { id: 5001, startMs: am, date: day, distance: 5, time: '30:00', note: 'From Apple Health', type: 'easy' });
      lsSet('kt_runs', runs);
      const o = _cmpOrder(getRuns().find(x => x.id === 5000), getRuns().find(x => x.id === 5001));
      r.runOrder = o.map(x => x.id);
      r.runList = getRuns().filter(x => x.date === day).sort(_cmpByDateDesc).map(x => x.id);
      // A 07:00 wrist session drained after a 16:00 phone session (larger id): the wrist one is THEN.
      const phone = { id: new Date(day + 'T16:00:00').getTime(), startedAt: new Date(day + 'T16:00:00').getTime(), date: day, type: 'Push' };
      const wrist = { id: new Date(day + 'T20:00:00').getTime(), wristStartedAt: new Date(day + 'T07:00:00').toISOString(), date: day, type: 'Push' };
      r.liftOrder = _cmpOrder(phone, wrist).map(x => x === wrist ? 'wrist' : 'phone');
      // Health records written from now on carry their start time.
      _hkPendingRun = null;
      const rec = _logHealthRun({ uuid: 'u-1', startDate: new Date(day + 'T06:15:00').toISOString(), distanceKm: 3.3, durationSec: 1200, avgHr: 0 });
      r.logged = rec ? rec.startMs === new Date(day + 'T06:15:00').getTime() : 'no record';

      // Share intake while compare is open: the sheet goes, compare mode ends, the chat is on top.
      switchTab('progress'); calYear = 2026; calMonth = 6; render();
      cmpOn = true; cmpKind = 'run'; cmpPicks = ['5000', '5001']; openCompareSheet(); await wait(50);
      Capacitor.Plugins.TrovoShare = { getPendingShare: () => Promise.resolve({ imageBase64: 'AAAA' }) };
      await checkPendingShare(); await wait(50);
      r.share = { sheet: !!document.getElementById('cmpSheetOverlay'), cmpOn, tab: currentTab, view: coachView };
      pendingImage = null;

      // Watch: no programme sends week '[]', with and without a pending draft; the unit rides along.
      const W = Capacitor.Plugins.TrovoWatch; let ctx = null;
      W.updateContext = (x) => { ctx = x; return Promise.resolve({ sent: true }); };
      _lastWatchPlan = ''; _pushWatchPlan();
      r.unitLb = JSON.parse(ctx.json).unit; r.weekUnits = JSON.parse(ctx.week).map(d => d.unit);
      localStorage.setItem('kt_unit_w', 'kg'); _lastWatchPlan = ''; _pushWatchPlan();
      r.unitKg = JSON.parse(ctx.json).unit; localStorage.setItem('kt_unit_w', 'lb');
      openDeckRunner('Push'); const A = runnerSession.exercises[0].name; runnerCompleted[A] = 1; runnerRepsLog[A] = [8];
      _flushRunnerDraft(); runnerOpen = false; runnerResumePending = true;
      lsDel('kt_routine'); _lastWatchPlan = ''; _pushWatchPlan();
      r.draftNoPlan = ctx.week;
      runnerResumePending = false; runnerSession = null; localStorage.removeItem('kt_runner_draft');
      _lastWatchPlan = ''; _pushWatchPlan();
      r.noPlan = ctx.week;
      return r;
    });
    assert(JSON.stringify(out.runOrder) === '[5001,5000]', 'the 07:00 run is THEN, the 18:30 run NOW: ' + JSON.stringify(out.runOrder));
    assert(JSON.stringify(out.runList) === '[5000,5001]', 'the pick list shows the evening run above the morning run: ' + JSON.stringify(out.runList));
    assert(JSON.stringify(out.liftOrder) === '["wrist","phone"]', 'a late-drained 07:00 wrist session is THEN: ' + JSON.stringify(out.liftOrder));
    assert(out.logged === true, 'a Health run saved now stores its start time: ' + out.logged);
    assert(!out.share.sheet && !out.share.cmpOn && out.share.tab === 'coach' && out.share.view === 'chat', 'a shared photo closes compare first: ' + JSON.stringify(out.share));
    assert(out.unitLb === 'lb' && out.weekUnits.length === 6 && out.weekUnits.every(u => u === 'lb') && out.unitKg === 'kg', 'the plan and week carry the display unit: ' + JSON.stringify([out.unitLb, out.weekUnits, out.unitKg]));
    assert(out.draftNoPlan === '[]' && out.noPlan === '[]', 'no programme sends an empty week the watch can decode: ' + JSON.stringify([out.draftNoPlan, out.noPlan]));

    // The tray keeps the names: text column width at narrow and zoomed sizes.
    const sizes = [[390, 844, 1], [390, 844, 1.25], [375, 667, 1.25], [320, 568, 1], [320, 568, 1.25]];
    const widths = [];
    for (const [w, h, z] of sizes) {
      await p.setViewportSize({ width: w, height: h });
      widths.push(await p.evaluate(async (z) => {
        document.documentElement.style.zoom = String(z);
        switchTab('progress'); calYear = 2026; calMonth = 6; render();
        cmpOn = true; cmpKind = 'lift';
        const two = getSessions().filter(x => x.date >= '2026-07-01' && x.date <= '2026-07-31').slice(0, 2);
        cmpPicks = two.map(x => String(x.id)); render();
        const m = document.querySelector('.kt-vs-tray-main'), t = document.querySelector('.kt-vs-tray-t');
        const res = { w: m ? Math.round(m.getBoundingClientRect().width) : -1, clipped: t ? t.scrollWidth > t.clientWidth + 1 : true, z };
        _cmpExit(); document.documentElement.style.zoom = '';
        return res;
      }, z));
    }
    assert(widths.every(x => x.w >= 100 && !x.clipped), 'the tray names are never clipped: ' + JSON.stringify(widths));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('compare: only-on headers are unambiguous for same-day pairs and dates a year apart', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const X = (name, w) => ({ name, sets: 2, reps: [8, 8], weight: w, weightLog: [w, w] });
      const base = getSessions().filter(s => !String(s.id).startsWith('77'));
      const mk = (id, date, startedAt, exs) => ({ id, date, startedAt, type: 'Push', label: 'Push', week: 1, prs: [], exercises: exs });
      lsSet('kt_sessions', [
        mk(7701, '2026-07-10', new Date('2026-07-10T07:00:00').getTime(), [X('Bench Press', 150), X('Dips', 0)]),
        mk(7702, '2026-07-10', new Date('2026-07-10T18:00:00').getTime(), [X('Bench Press', 155), X('Cable Fly', 40)]),
        mk(7703, '2025-07-12', new Date('2025-07-12T07:00:00').getTime(), [X('Bench Press', 140), X('Dips', 0)]),
        mk(7704, '2026-07-12', new Date('2026-07-12T07:00:00').getTime(), [X('Bench Press', 160), X('Cable Fly', 45)])].concat(base));
      const heads = () => [...document.querySelectorAll('#cmpSheetOverlay .kt-vs-sec')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /^ONLY/.test(t));
      switchTab('progress');
      cmpOn = true; cmpKind = 'lift'; cmpPicks = ['7701', '7702']; openCompareSheet(); await wait(50);
      const same = heads();
      closeCompareSheet(true);
      cmpPicks = ['7703', '7704']; openCompareSheet(); await wait(50);
      const year = heads();
      _cmpExit();
      return { same, year };
    });
    assert(out.same.length === 2 && /^ONLY THEN/.test(out.same[0]) && /^ONLY NOW/.test(out.same[1]), 'a same-day pair says then and now: ' + JSON.stringify(out.same));
    assert(out.year.length === 2 && /2025/.test(out.year[0]) && /2026/.test(out.year[1]) && out.year[0] !== out.year[1], 'dates a year apart carry the year: ' + JSON.stringify(out.year));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
