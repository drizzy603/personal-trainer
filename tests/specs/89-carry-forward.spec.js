// Carry forward (web 20260925-8): a lift logged at least a plate above the plan, at the planned reps
// or more, is offered once (Today card, and the COMPLETE sheet) to carry forward; one tap moves the
// programme to climb from what was lifted, marked as the owner's edit, with Undo. Never automatic.
const { boot, assert, run } = require('../lib/harness');

run('carry forward: offered only when earned; one tap; not now; COMPLETE', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, today = todayISO(), c = currentWeek - 1;
      const X = (reps, w) => ({ name: 'Bench Press', sets: reps.length, reps, weight: w, weightLog: reps.map(() => w) });
      const sess = (id, ex) => ({ id, date: today, type: 'Push', label: 'Push', week: currentWeek, prs: [], exercises: [ex] });
      r.none = [_carryCandidates(sess(1, X([8, 8, 8, 8], 160))).length, _carryCandidates(sess(2, X([5, 5, 5], 185))).length];
      const s3 = sess(3, X([8, 8, 8, 8], 185));
      lsSet('kt_sessions', [s3].concat(getSessions()));
      r.cand = _carryCandidates(s3);
      switchTab('log'); switchLogSub('workout'); await wait(30);
      r.chip = [...document.querySelectorAll('#screen .kt-util-chip .lbl')].map(e => e.textContent);
      promoteTodayItem('carry'); await wait(30);
      const btn = [...document.querySelectorAll('#screen .kt-resume-cta')].find(b => /Carry it/.test(b.textContent));
      r.card = btn && btn.closest('.kt-resume-banner').textContent.replace(/\s+/g, ' ');
      btn.click(); await wait(60);
      const cr = getCustomRoutine();
      r.curve = cr.weeks.slice(c, c + 3).map(w => w.push.find(e => e.name === 'Bench Press').weight);
      r.marked = cr.weeks[c].push.find(e => e.name === 'Bench Press').rec !== undefined;
      r.gone = !/CARRY FORWARD/.test(document.getElementById('screen').textContent) && _carryCandidates(s3).length === 0;
      // Not now hides it for that session
      await wait(400); document.querySelector('#toast .kt-toast-undo') && document.querySelector('#toast .kt-toast-undo').click(); await wait(40);
      r.back = _carryCandidates(s3).length === 1;
      dismissCarry(3); await wait(30);
      r.dismissed = ![...document.querySelectorAll('#screen .kt-util-chip .lbl')].some(e => /CARRY/.test(e.textContent));
      // the COMPLETE sheet offers it after a runner session
      openDeckRunner('Push'); const A = runnerSession.exercises.find(e => e.name === 'Bench Press').name;
      runnerSession.exercises = runnerSession.exercises.filter(e => e.name === A);
      runnerRepsLog[A] = [8, 8]; runnerWeightsLog[A] = [190, 190]; runnerCompleted[A] = 2;
      runnerFinishSession(); await wait(150);
      r.complete = !!document.querySelector('#completeSheetOverlay .kt-carry-row button') && /Carry 190 lb forward on Bench Press/.test(document.getElementById('completeSheetOverlay').textContent);
      return r;
    });
    assert(JSON.stringify(out.none) === '[0,0]', 'at the plan, or heavier with fewer reps: nothing offered: ' + JSON.stringify(out.none));
    assert(out.cand.length === 1 && out.cand[0].to === 185 && out.cand[0].from === 160, 'a plate over at the planned reps is offered: ' + JSON.stringify(out.cand));
    assert(out.chip.indexOf('CARRY FORWARD') >= 0 || /Carry it/.test(out.card || ''), 'Today offers it: ' + JSON.stringify(out.chip));
    assert(/Bench Press went 185 lb — the plan said 160 lb/.test(out.card), 'the card says what happened: ' + out.card);
    assert(JSON.stringify(out.curve) === '[185,187.5,190]' && out.marked && out.gone, 'one tap carries it forward as the owner\'s edit: ' + JSON.stringify([out.curve, out.marked, out.gone]));
    assert(out.back && out.dismissed, 'Undo puts it back; Not now hides it');
    assert(out.complete, 'COMPLETE offers it after a runner session');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
