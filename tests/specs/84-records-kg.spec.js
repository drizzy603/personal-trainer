// Hunt 2026-09-25, records (web 20260925-3): in kg the stepper stores what a typed value would
// (a stepped 102.5 kg was a "new record" over a typed 102.5 kg), and a record must beat the old
// one by more than rounding; the history and set editors keep a load nobody touched; a bodyweight
// set from the wrist stays 0; a live record beat is re-checked when the lift is renamed; COMPLETE
// shows a record the way RECORD HISTORY does; an old backup's array kt_prs is not "corrupt".
const { boot, assert, run } = require('../lib/harness');
const X = (name, reps, wl) => ({ name, sets: reps.length, reps, weight: Math.max.apply(null, wl), weightLog: wl });

run('kg: the same shown load is never a new record', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}', kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      openDeckRunner('Push'); const ex = _runnerEx();
      runnerSetWeight(wStore('102.5')); r.typed = runnerWeights[ex.name]; runnerCompleteSet();
      runnerSessionDate = addDays(todayISO(), -1); runnerFinishSession(); await wait(150); closeCompleteSheet();
      openDeckRunner('Push'); runnerSetWeight(wStore('100')); runnerStepWeight(wStepLb()); runnerStepWeight(wStepLb());
      r.stepped = runnerWeights[ex.name]; runnerCompleteSet();
      r.beat = !!_runnerPrBeat;
      runnerFinishSession(); await wait(150); closeCompleteSheet();
      r.prs = getSessions()[0].prs; r.chain = (_prChain(ex.name) || []).length;
      // a real step up is still a record
      openDeckRunner('Push'); runnerSetWeight(wStore('102.5')); runnerStepWeight(wStepLb()); r.up = fmtW(runnerWeights[ex.name]); runnerCompleteSet();
      r.upBeat = !!_runnerPrBeat;
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
      return r;
    });
    assert(out.typed === out.stepped, 'typing and stepping to 102.5 kg store the same number: ' + JSON.stringify(out));
    assert(!out.beat && out.prs.length === 0 && out.chain === 1, 'no fake record for the same load: ' + JSON.stringify(out));
    assert(out.up === '103.75 kg' || out.up === '104 kg' || out.up === '103.5 kg', 'the step is 1.25 kg: ' + out.up);
    assert(out.upBeat, 'a real step up is still a record');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('editors keep a load nobody touched (kg)', async () => {
  const S = [{ id: 1, date: '2026-09-01', type: 'Push', prs: ['Bench Press'], exercises: [X('Bench Press', [5, 5], [225, 225]), X('Incline Press', [8], [223.26])] },
             { id: 2, date: '2026-09-08', type: 'Push', prs: [], exercises: [X('Bench Press', [3], [225]), X('Incline Press', [8], [223.2])] }];
  const app = await boot({ native: true, seed: { kt_sessions: JSON.stringify(S), kt_prs: '{}', kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async () => {
      openSessionEditor(1);
      document.getElementById('se_0_1_r').value = '4'; saveSessionEdit();
      const s1 = getSessions().find(s => s.id === 1);
      return { loads: s1.exercises.map(e => e.weightLog), reps: s1.exercises[0].reps, benchChain: (_prChain('Bench Press') || []).map(e => e.w + '@' + e.date), inclinePr: getPRs()['Incline Press'] };
    });
    assert(JSON.stringify(out.loads) === '[[225,225],[223.26]]' && JSON.stringify(out.reps) === '[5,4]', 'a reps fix keeps every load: ' + JSON.stringify(out));
    assert(JSON.stringify(out.benchChain) === '["225@2026-09-01"]' && out.inclinePr === 223.26, 'records do not move: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('wrist bodyweight sets stay 0; COMPLETE matches RECORD HISTORY; a renamed lift re-checks its beat', async () => {
  const start = new Date(); start.setHours(7, 0, 0, 0);
  const payload = JSON.stringify({ dayName: 'Pull', slot: 'Pull', loggedAt: new Date().toISOString(), startedAt: start.toISOString(),
    exercises: [{ name: 'Pull Up', weight: 25, reps: [12, 5], weightLog: [0, 25], rpe: 8, rpeLog: [7, 9] }] });
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' }, watchPending: [payload] });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      drainWatchSessions(); await wait(300);
      const pu = getSessions()[0].exercises.find(e => e.name === 'Pull Up');
      r.wrist = { wl: pu.weightLog, head: _prSetTxt('Pull Up', _prHead('Pull Up')) };
      // COMPLETE rows read like RECORD HISTORY
      lsSet('kt_prs', { 'Bench Press': 200 });
      openDeckRunner('Pull');
      runnerSession.exercises = [{ name: 'Bench Press', sets: 3, reps: 5, weight: 205 }, { name: 'Barbell Row', sets: 3, reps: 8, weight: 100 }];
      runnerExIdx = 0; paintRunner();
      runnerSetWeight(205); runnerSetReps(2); runnerCompleteSet();
      runnerSetWeight(205); runnerSetReps(5); runnerCompleteSet();
      // a live beat does not follow a rename onto a lift with a heavier record
      lsSet('kt_prs', Object.assign({}, getPRs(), { 'Incline Press': 250 }));
      r.beatBefore = !!_runnerPrBeat;
      openRunnerExEdit(0); _rExEditName = 'Incline Press'; saveRunnerExEdit();
      r.beatAfter = _runnerPrBeat;
      openRunnerExEdit(0); _rExEditName = 'Bench Press'; saveRunnerExEdit();
      lsSet('kt_prs', { 'Bench Press': 200 });
      runnerFinishSession(); await wait(200);
      r.complete = Array.from(document.querySelectorAll('#completeSheetOverlay .kt-cmp-pr')).map(e => e.textContent.replace(/\s+/g, ' ').trim());
      closeCompleteSheet();
      r.ledger = _prSetTxt('Bench Press', _prHead('Bench Press'));
      return r;
    });
    assert(JSON.stringify(out.wrist.wl) === '[0,25]' && out.wrist.head === '+25 lb × 5', 'a bodyweight set from the wrist stays 0: ' + JSON.stringify(out.wrist));
    assert(out.beatBefore && out.beatAfter === null, 'a beat does not survive a rename onto a heavier record: ' + JSON.stringify([out.beatBefore, out.beatAfter]));
    assert(out.complete.some(t => t.indexOf('205 lb × 5') >= 0 && t.indexOf('best at this weight') < 0) && out.ledger === '205 lb × 5',
      'COMPLETE shows the record like RECORD HISTORY: ' + JSON.stringify([out.complete, out.ledger]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('an old backup with an array kt_prs restores without a corrupt warning', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const toasts = []; const o = window.showToast; window.showToast = (m, k) => { toasts.push(m); };
      _applyImportedData({ kt_sessions: [{ id: 5, date: '2026-09-01', type: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 1, reps: [3], weight: 195, weightLog: [195] }] }],
        kt_prs: [{ name: 'Bench Press', weight: 180 }] });
      window.showToast = o;
      return { toasts, prs: getPRs() };
    });
    assert(!out.toasts.some(t => /corrupt/i.test(t)) && out.prs['Bench Press'] === 195, 'no corrupt warning; records rebuilt from the sessions: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
