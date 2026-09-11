// Audit batch A remainder (2026-09-10): coach log_run time validation, blank
// sport logs refused, corrupt JSON parked instead of discarded, coach-card
// buttons route somewhere real.
const { boot, assert, run } = require('../lib/harness');

run('log_run rejects unparseable times; blank sport logs are refused', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const before = getRuns().length;
      const bad = executeCoachTool('log_run', { distance_km: 5, time: 'fast' });
      const good = executeCoachTool('log_run', { distance_km: 5, time: '25:00' });
      // Human phrasing is normalised, not refused.
      const mins = executeCoachTool('log_run', { distance_km: 5, time: '25 min' });
      const minsTime = getRuns()[0].time;
      const runsAfter = getRuns().length;
      switchTab('log'); switchLogSub('sport');
      pickSport('Yoga');
      const sportsBefore = getSportLogs().length;
      ['spDuration', 'spNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      saveSportLog();
      const toast = document.getElementById('toast').textContent;
      return { badOk: bad.ok, badErr: bad.error, goodOk: good.ok, minsOk: mins.ok, minsTime, runsAdded: runsAfter - before,
        sportsAdded: getSportLogs().length - sportsBefore, toast };
    });
    assert(out.badOk === false && /MM:SS/.test(out.badErr), '"fast" refused: ' + out.badErr);
    assert(out.goodOk === true && out.minsOk === true && out.minsTime === '25:00' && out.runsAdded === 2, 'MM:SS accepted; "25 min" stored as 25:00');
    assert(out.sportsAdded === 0 && /duration or a detail/.test(out.toast), 'empty sport log refused with a toast: ' + out.toast);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('corrupt JSON is parked under <key>_corrupt, never overwritten', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      localStorage.setItem('kt_probe', '{not json');
      delete _lsCache['kt_probe'];
      const read = lsGet('kt_probe');
      lsSet('kt_probe', { ok: true });
      return { read, parked: localStorage.getItem('kt_probe_corrupt'), now: localStorage.getItem('kt_probe') };
    });
    assert(out.read === null, 'unreadable value reads as null');
    assert(out.parked === '{not json', 'raw text preserved in kt_probe_corrupt');
    assert(out.now === '{"ok":true}', 'the key itself stays writable');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('coach-card buttons route: acknowledge dismisses, See pace opens Runs, AI labels become a chat turn', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      window.__sent = null;
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');   // the chat composer only renders with a key
      window.sendCoachMessage = function () { window.__sent = document.getElementById('coach-input').value; };
      switchTab('log'); switchLogSub('workout');
      coachCardAction('Got it');
      const afterAck = { tab: currentTab, dismissed: coachCardDismissed };
      coachCardDismissed = false;
      coachCardAction('See pace');
      const afterPace = { tab: currentTab, sub: logSubTab };
      coachCardDismissed = false;
      coachCardAction('Swap squats for leg press today');
      await new Promise(r => setTimeout(r, 500));
      return { afterAck, afterPace, chat: { tab: currentTab, view: coachView, sent: window.__sent } };
    });
    assert(out.afterAck.dismissed === true && out.afterAck.tab === 'log', 'Got it only dismisses');
    assert(out.afterPace.tab === 'log' && out.afterPace.sub === 'run', 'See pace lands on the Run tab');
    assert(out.chat.tab === 'coach' && out.chat.view === 'chat' && out.chat.sent === 'Swap squats for leg press today', 'AI label is sent to the coach: ' + JSON.stringify(out.chat));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('deletes are immediate with a 6s Undo; the hero speaks in the past tense once logged', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const before = getSessions().length, id = getSessions()[0].id;
      deleteSession(id);
      const afterDelete = getSessions().length;
      const t = document.getElementById('toast');
      const hasUndo = !!t.querySelector('.kt-toast-undo') && /deleted/.test(t.textContent);
      _toastUndo();
      const restored = getSessions().length;
      const backOnTop = getSessions().some(s => s.id === id);
      // Hero past tense: log a session for today's lift day and re-render.
      const act = getTodayActivity();
      let hero = null;
      if (act.type === 'lift') {
        const ss = getSessions(); ss.unshift({ id: Date.now(), date: todayISO(), type: act.dayName, week: currentWeek,
          exercises: [{ name: act.exercises[0].name, sets: 3, reps: [8, 8, 8], weight: 100, weightLog: [100, 100, 100], rpe: 7 }] });
        lsSet('kt_sessions', ss);
        switchTab('log'); switchLogSub('workout');
        hero = document.querySelector('.kt-hero') ? document.querySelector('.kt-hero').textContent : document.body.textContent;
      }
      return { before, afterDelete, hasUndo, restored, backOnTop, liftDay: act.type === 'lift', hero };
    });
    assert(out.afterDelete === out.before - 1 && out.hasUndo, 'delete is immediate and offers Undo');
    assert(out.restored === out.before && out.backOnTop, 'Undo brings the session back');
    if (out.liftDay) assert(/done\./.test(out.hero) && /Nothing left to do today/.test(out.hero), 'hero turns past tense: ' + (out.hero || '').slice(0, 160));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
