// Hunt 2026-09-25, units (web 20260925-5): body weight in kg keeps a tenth (it was rounded to the
// 0.5 kg plate grid: 80.3 read 80.5, a 0.2 kg/week trend read "−0 kg a week", and the Body goal band
// printed raw lb); a mile pace goal reads back what was typed (9:00 /mi came back 9:01); the coach
// ledger's pace; programme run days written as {km, type}; the progression chip and the starter in
// kg plates; the Heavyweight selected-day dots; the Runs 5k hint; the Compare tray for same-day pairs.
const { boot, assert, run } = require('../lib/harness');

run('kg + mi: body weight, pace goals, ledger, run days, kg chips and starter, tray', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg', kt_unit_d: 'mi' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const txt = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };
      const r = {}, today = todayISO();
      // body weight keeps a tenth of a kg everywhere
      lsSet('kt_bw', [{ id: 3, date: today, weight: wStore(79.6) }, { id: 2, date: addDays(today, -7), weight: wStore(79.8) }, { id: 1, date: addDays(today, -14), weight: wStore(80.3) }]);
      setBWGoal(wStore(75.2));
      switchTab('log'); switchLogSub('body'); await wait(30);
      r.hero = (document.querySelector('.kt-hero-headline') || {}).textContent + ' | ' + (document.querySelector('.kt-hero-body, .kt-hero-sub, #screen .kt-hero p') || {}).textContent;
      r.body = document.getElementById('screen').textContent;
      r.band = txt(renderBodySection());
      // pace goal typed in miles reads back as typed; the coach ledger agrees
      r.paces = ['9:00', '7:30', '6:30', '12:00', '5:00'].map(p => fmtPaceStr(paceStore(p)));
      r.ledger = _planChangeLedger ? txt(_planChangeLedger([{ name: 'set_run_goal', input: { pace: '9:00' } }]) || '') : '';
      // programme run days written as {km, type}
      const cr = getCustomRoutine(); cr.weeks.forEach(w => { w.runs = { Tue: { km: 8, type: 'easy', hr: 150, note: 'Z2' } }; }); setCustomRoutine(cr);
      r.runDay = txt(_renderWeekDetail(getWkData()));
      // the progression chip and the starter on kg plates
      lsSet('kt_sessions', [{ id: 9, date: addDays(today, -2), type: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: wStore(100), rpe: 7 }] }]);
      const chip = _overloadSuggestion({ name: 'Bench Press', reps: 8 });
      r.chip = chip && fmtW(chip.to);
      const st = buildStarterRoutine({ goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 1 });
      r.starter = st.weeks.slice(0, 6).map(w => (w.push || []).filter(e => e.weight > 0).map(e => wDisp(e.weight))).join('|');
      r.starterGrid = st.weeks.every(w => ['push', 'pull', 'legs'].every(k => (w[k] || []).every(e => !(e.weight > 0) || _onPlateGrid(e.weight))));
      // Progress > Runs 5k hint in miles
      lsSet('kt_runs', []); switchTab('progress'); setProgressTab('runs'); await wait(30);
      r.hint = /~3\.1 mi run to start tracking pace/.test(document.getElementById('screen').textContent);
      // the Compare tray tells a same-day pair apart
      const d0 = '2026-07-10';
      lsSet('kt_sessions', [{ id: 7001, date: d0, startedAt: new Date(d0 + 'T07:00:00').getTime(), type: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 1, reps: [8], weight: 100 }] },
                            { id: 7002, date: d0, startedAt: new Date(d0 + 'T18:00:00').getTime(), type: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 1, reps: [8], weight: 105 }] }]);
      cmpOn = true; cmpKind = 'lift'; cmpPicks = ['7001', '7002'];
      r.tray = txt(_cmpTrayHTML());
      _cmpExit();
      return r;
    });
    assert(/79\.6 kg/i.test(out.hero) && /−0\.[1-9] kg a week/.test(out.hero) && !/−0 kg/.test(out.hero), 'the Body hero keeps a tenth of a kg: ' + out.hero);
    assert(/80\.3 kg/.test(out.body) && /79\.8 kg/.test(out.body), 'history rows keep a tenth: ' + out.body.slice(0, 300));
    assert(/80\.3 ?Start/.test(out.band) && /79\.6 ?Now/.test(out.band) && /75\.2 ?Goal/.test(out.band), 'the goal band is in kg (it printed raw lb): ' + out.band);
    assert(JSON.stringify(out.paces) === JSON.stringify(['9:00 /mi', '7:30 /mi', '6:30 /mi', '12:00 /mi', '5:00 /mi']), 'mile paces read back as typed: ' + JSON.stringify(out.paces));
    assert(!out.ledger || /9:00 \/mi/.test(out.ledger), 'the coach ledger shows the pace that was set: ' + out.ledger);
    assert(/Easy run/.test(out.runDay) && /4\.97 mi/.test(out.runDay), 'a {km, type} run day shows its distance and type: ' + out.runDay.slice(0, 200));
    assert(out.chip === '102.5 kg', 'the progression chip steps a kg plate: ' + out.chip);
    assert(out.starterGrid && /42\.5/.test(out.starter), 'the starter builds kg loads on kg plates: ' + out.starter);
    assert(out.hint, 'the Runs 5k hint is in miles');
    assert(/Jul 10 · 7:00 AM vs 6:00 PM/.test(out.tray), 'a same-day pair is told apart in the tray: ' + out.tray);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Heavyweight: the selected day keeps its run and sport dots visible', async () => {
  const app = await boot({ seed: { kt_theme: 'heavyweight' } });
  try {
    const out = await app.page.evaluate(() => {
      switchTab('progress'); calYear = 2026; calMonth = 6; render();
      const day = [...document.querySelectorAll('.cal-day')].find(d => d.querySelector('.cal-dot-r'));
      selectCalDate(day.getAttribute('data-date'));
      const r = document.querySelector('.cal-day.sel .cal-dot-r');
      return r && getComputedStyle(r).boxShadow;
    });
    assert(/255, 255, 255/.test(out || ''), 'the run dot has a paper ring on the blue selected day: ' + out);
  } finally { await app.close(); }
});
