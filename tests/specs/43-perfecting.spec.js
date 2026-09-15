// 2026-09-14 "perfecting" batch: run editor, cheap update stamp, visible
// per-week cadence overrides, lift-identity goal matching, 10k best.
const { boot, assert, run } = require('../lib/harness');

run('run editor round-trips distance, time, date, type, feel and note', async () => {
  const app = await boot({ seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      lsSet('kt_runs', [{ id: 777, date: todayISO(), distance: 5, time: '25:00', type: 'easy', hr: 0, note: '' , week: currentWeek }]);
      openRunEditor(777);
      const ov = document.getElementById('runEditOverlay');
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; };
      set('re_dist', '6.2'); set('re_time', '31 05'); set('re_hr', '150'); set('re_note', 'hilly'); document.getElementById('re_type').value = 'tempo'; _reSetFeel(3);
      saveRunEdit(777);
      const r = getRuns().find(x => x.id === 777);
      return { opened: !!ov, closed: !document.getElementById('runEditOverlay'), r };
    });
    assert(out.opened && out.closed, 'editor opens and closes on save');
    assert(Math.abs(out.r.distance - 6.2) < 0.001 && out.r.time === '31:05' && out.r.hr === 150 && out.r.note === 'hilly' && out.r.type === 'tempo' && out.r.feel === 3, 'fields saved: ' + JSON.stringify(out.r));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('lift identity: bench and squat variants match the goal, others do not', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => ({
      b1: _isBenchLift('Bench Press'), b2: _isBenchLift('Barbell Bench Press'), b3: _isBenchLift('Paused Bench Press'),
      nb1: _isBenchLift('Incline Bench Press'), nb2: _isBenchLift('Close Grip Bench Press'), nb3: _isBenchLift('DB Bench Press'),
      s1: _isSquatLift('Back Squat'), s2: _isSquatLift('Barbell Back Squat'), s3: _isSquatLift('Low Bar Squat'),
      ns1: _isSquatLift('Front Squat'), ns2: _isSquatLift('Goblet Squat'), ns3: _isSquatLift('Bulgarian Split Squat'),
      stamp: typeof _fetchLivePage === 'function' && typeof checkForLiveUpdate === 'function',
    }));
    assert(out.b1 && out.b2 && out.b3 && !out.nb1 && !out.nb2 && !out.nb3, 'bench identity: ' + JSON.stringify(out));
    assert(out.s1 && out.s2 && out.s3 && !out.ns1 && !out.ns2 && !out.ns3, 'squat identity: ' + JSON.stringify(out));
    assert(out.stamp, 'update check split into stamp probe + page fetch');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a per-week cadence override is visible in the Programme modal and can be reset', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].weekPlan = ['Push','Rest','Rest','Rest','Rest','Rest','Rest'];
      setCustomRoutine(cr);
      openProgrammeModal();
      const row = document.getElementById('wk-row-' + currentWeek);
      const tag = row && row.querySelector('.wk-row-custom');
      const note = document.querySelector('#wk-detail-' + currentWeek + ' .wk-cadence');
      resetWeekCadence(currentWeek);
      const after = !!(getCustomRoutine().weeks[currentWeek - 1].weekPlan);
      const tag2 = document.querySelector('#wk-row-' + currentWeek + ' .wk-row-custom');
      closeProgrammeModal();
      return { tag: !!tag, note: !!note, after, tag2: !!tag2 };
    });
    assert(out.tag && out.note, 'override week is tagged and its cadence shown');
    assert(!out.after && !out.tag2, 'reset removes the override and the tag');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Runs bests include a 10k best when one exists', async () => {
  const app = await boot({ seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      lsSet('kt_runs', [{ id: 1, date: todayISO(), distance: 10.1, time: '52:30', type: 'long' }, { id: 2, date: todayISO(), distance: 5, time: '25:00', type: 'easy' }]);
      switchTab('progress'); setProgressTab('runs');
      const txt = document.body.textContent;
      return { has10k: /best 10k/i.test(txt), has5k: /best 5k pace/i.test(txt) };
    });
    assert(out.has10k && out.has5k, 'both bests render: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
