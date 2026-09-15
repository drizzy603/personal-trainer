// Board features shipped for every room (2026-09-14): Complete sheet after a
// session, week strip + glance tiles on Today, pre-session overview, schedule
// picker, average RPE, run feel, and the coach plan-change ledger.
const { boot, assert, run } = require('../lib/harness');

run('finishing a session opens the Complete sheet with the session numbers', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0];
      for (let i = 0; i < ex.sets; i++) runnerCompleteSet();
      runnerFinishSession();
      await new Promise(r => setTimeout(r, 300));
      const ov = document.getElementById('completeSheetOverlay');
      const txt = ov ? ov.textContent : '';
      const rec = getSessions()[0];
      const vol = Math.round(calcVolume(rec.exercises)).toLocaleString();
      closeCompleteSheet();
      return { open: !!ov, hasTitle: /COMPLETE/.test(txt) && /done/.test(txt), hasVol: txt.indexOf(vol) > -1, hasDur: /Duration/.test(txt),
        hasEx: /Exercises/.test(txt), insight: /COACH INSIGHT/.test(txt), closed: !document.getElementById('completeSheetOverlay'), runnerClosed: !runnerOpen };
    });
    assert(out.open && out.hasTitle, 'Complete sheet opens with the title');
    assert(out.hasVol && out.hasDur && out.hasEx && out.insight, 'summary quartet + coach line present');
    assert(out.closed && out.runnerClosed, 'Done closes the sheet; the runner is already closed');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Today shows the week strip and the glance tiles', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      switchTab('log'); switchLogSub('workout');
      const chips = [...document.querySelectorAll('.kt-wkstrip-chip')];
      const series = _weeklyVolumeSeries(8);
      return { chips: chips.length, today: chips.filter(c => c.classList.contains('today')).length,
        tiles: document.querySelectorAll('.kt-glance-tile').length, ring: !!document.querySelector('.kt-glance-tile svg circle'),
        seriesLen: series.length, seriesLast: series[series.length - 1] };
    });
    assert(out.chips === 7 && out.today === 1, 'seven day chips, exactly one today');
    assert(out.tiles === 2 && out.ring, 'sessions ring + volume tile');
    assert(out.seriesLen === 8 && typeof out.seriesLast === 'number', 'weekly volume series is 8 weeks long');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('pre-session overview lists the session and Begin opens the runner', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const exs = getSessionExercises('Push');
      openSessionOverview({ type: 'lift', dayName: 'Push', exercises: exs, weekday: 'MON' });
      const ov = document.getElementById('sessionOverviewOverlay');
      const rows = ov ? ov.querySelectorAll('.kt-ov-row').length : 0;
      const first = ov ? ov.querySelector('.kt-ov-row.first .kt-ov-first') : null;
      closeSessionOverview(); openDeckRunner('Push');
      return { rows, exs: exs.length, upFirst: first ? first.textContent : null, gone: !document.getElementById('sessionOverviewOverlay'), runner: runnerOpen };
    });
    assert(out.rows === out.exs && out.rows > 0, 'one row per exercise');
    assert(out.upFirst === 'UP FIRST', 'first exercise is marked up first');
    assert(out.gone && out.runner, 'Begin closes the overview and opens the runner');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('schedule editor: tap a day, pick what it holds', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      switchTab('settings');
      _schedPick(1);
      const ed = document.querySelector('.kt-sched-editor');
      const picks = ed ? ed.querySelectorAll('.kt-sched-pick').length : 0;
      setWeekPlanDay(1, 'Rest');
      const plan = getWeekPlan();
      return { picks, editing: !!ed, rest: !!plan[1].isRest, closed: !document.querySelector('.kt-sched-editor'), avg: _avgRpe(3650) };
    });
    assert(out.editing && out.picks >= 5, 'picker opens with the routine types');
    assert(out.rest && out.closed, 'picking Rest applies and closes the editor');
    assert(typeof out.avg === 'number' && out.avg > 0 && out.avg <= 10, 'average RPE computes: ' + out.avg);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('run log stores how it felt; coach ledger shows plan changes with Keep / Undo', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      switchTab('log'); switchLogSub('run'); openRunLog();
      _setRunFeel(4);
      runLogDraft.dist = '5'; runLogDraft.time = '25:00';
      saveInlineRun();
      const feel = getRuns()[0].feel;
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');
      lsSet('kt_routine_backup', JSON.parse(JSON.stringify(getCustomRoutine())));
      const ex = getSessionExercises('Push')[0];
      coachMessages.push({ role: 'user', content: 'Drop my bench a bit' });
      coachMessages.push({ role: 'assistant', content: 'Done.', _tools: [{ name: 'set_exercise_weight', input: { name: ex.name, weight: 100 }, result: { ok: true } }] });
      coachView = 'chat'; currentTab = 'coach'; render();
      const card = document.querySelector('.kt-ledger-card');
      const txt = card ? card.textContent : '';
      const idx = coachMessages.length - 1;
      _ledgerKeep(idx);
      return { feel, card: !!card, hasName: txt.indexOf(ex.name) > -1, hasW: /100 lb/.test(txt), undo: /Undo/.test(txt), keep: /Keep changes/.test(txt),
        gone: !document.querySelector('.kt-ledger-card'), seen: !!coachMessages[idx]._ledgerSeen };
    });
    assert(out.feel === 4, 'feel saved on the run');
    assert(out.card && out.hasName && out.hasW && out.undo && out.keep, 'ledger names the change with Undo + Keep: ' + JSON.stringify(out));
    assert(out.gone && out.seen, 'Keep retires the card and persists the flag');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
