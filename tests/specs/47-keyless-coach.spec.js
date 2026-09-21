// The proactive coach works without an API key: progression and plateau fixes are
// applied on-device with Undo, the week review is a local sheet, the debrief card is
// the deterministic insight.
const { boot, assert, run } = require('../lib/harness');

function lastWeekDate(offset) {
  const d = new Date(); const dow = (d.getDay() + 6) % 7;         // Monday = 0
  d.setDate(d.getDate() - dow - 7 + offset); d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

run('keyless progression, plateau deload, week review sheet and debrief card', async () => {
  const clean = { id: 1, date: lastWeekDate(1), week: 1, type: 'Push', prs: [],
    exercises: [{ name: 'Bench Press', isMain: true, sets: 3, reps: [12, 12, 12], weight: 185, rpe: 7, rpeLog: [7, 7, 7] }] };
  const recent = { id: 2, date: daysAgo(1), week: 2, type: 'Pull', prs: ['Barbell Row'],
    exercises: [{ name: 'Barbell Row', isMain: true, sets: 3, reps: [8, 8, 8], weight: 160, rpe: 8 }] };
  const app = await boot({ seed: { kt_sessions: JSON.stringify([recent, clean]), kt_week: '2', kt_apikey: '', kt_coach_msgs: '[]',
    kt_weights: JSON.stringify({ 'Bench Press': 185, 'Barbell Row': 160 }) } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      localStorage.removeItem('kt_apikey'); lsDel('kt_last_prog_week'); lsDel('kt_last_plateau_week'); lsDel('kt_last_review_week');
      r.progLifts = _progressionLifts().map(x => x.name);
      r.progDue = _progressionDue();
      lsSet('kt_last_review_week', currentWeek);   // the review banner outranks progression in the slot; retire it for this check
      lsSet('kt_last_weekwrap', _mostRecentMonday()); // so does the week wrap, which is due on Sundays and Mondays; retire it too
      r.bannerHTML = (function(){ switchTab('log'); return document.getElementById('screen').innerHTML; })();
      lsDel('kt_last_review_week'); lsDel('kt_last_weekwrap');
      startProgression();
      r.afterApply = { w: getWeights()['Bench Press'], backup: !!lsGet('kt_routine_backup'), flagged: String(lsGet('kt_last_prog_week')), toast: document.getElementById('toast').textContent, coachTab: currentTab };
      _toastUndo();
      r.afterUndo = { w: getWeights()['Bench Press'], due: _progressionDue() };
      // plateau — stub the detector, real apply path
      window._plateauLifts = function(){ return [{ name: 'Barbell Row', e1rm: 200, days: 28 }]; };
      r.plateauDue = _plateauFixDue();
      startPlateauFix();
      r.afterDeload = { w: getWeights()['Barbell Row'], toast: document.getElementById('toast').textContent };
      _toastUndo();
      r.afterDeloadUndo = getWeights()['Barbell Row'];
      // week review as a local sheet
      r.reviewDue = _weekReviewDue();
      startWeeklyReview();
      const sheet = document.getElementById('weekReviewOverlay');
      r.review = { open: !!sheet, text: sheet ? sheet.innerText : '', flagged: String(lsGet('kt_last_review_week')), dueAfter: _weekReviewDue() };
      closeLocalWeekReview();
      // debrief card without a key
      const todayRec = Object.assign({}, getSessions()[0], { id: 999, date: todayISO() });   // the Today card only shows today's debrief
      openCompleteSheet({ rec: todayRec, planned: 3, startedAt: Date.now() - 60000 });
      const d = lsGet('kt_debrief');
      r.debrief = { stored: !!(d && d.text), forToday: d && d.date === todayISO(), card: _renderDebriefCard() };
      closeCompleteSheet();
      return r;
    });
    assert(out.progLifts.indexOf('Bench Press') >= 0 && out.progDue, 'a clean week earns progression without a key: ' + JSON.stringify(out.progLifts) + ' ' + out.progDue);
    assert(/PROGRESSION EARNED/.test(out.bannerHTML), 'the progression banner renders for a keyless user');
    assert(out.afterApply.w === 190 && out.afterApply.backup && out.afterApply.flagged === '2' && /\+5 lb on Bench Press/.test(out.afterApply.toast) && out.afterApply.coachTab !== 'coach', 'local apply writes +5 lb, snapshots, flags the week, offers Undo, stays off the Coach tab: ' + JSON.stringify(out.afterApply));
    assert(out.afterUndo.w === 185 && out.afterUndo.due, 'undo restores the weight and the banner: ' + JSON.stringify(out.afterUndo));
    assert(out.plateauDue && out.afterDeload.w === 145 && /deloaded to 145 lb/.test(out.afterDeload.toast), 'plateau deload takes 10% off on-device: ' + JSON.stringify(out.afterDeload));
    assert(out.afterDeloadUndo === 160, 'deload undo restores 160 lb: ' + out.afterDeloadUndo);
    assert(out.reviewDue && out.review.open && /WEEK 1 WRAPPED/.test(out.review.text) && /LIFT VOLUME/.test(out.review.text) && /RECORDS/.test(out.review.text) && out.review.flagged === '2' && !out.review.dueAfter, 'week review opens as a local sheet and retires the banner: ' + JSON.stringify({ due: out.reviewDue, flagged: out.review.flagged, dueAfter: out.review.dueAfter, open: out.review.open }));
    assert(out.debrief.stored && out.debrief.forToday && /SESSION DEBRIEF/.test(out.debrief.card) && !/COACH/.test(out.debrief.card), 'keyless debrief card carries the deterministic insight: ' + JSON.stringify({ stored: out.debrief.stored, forToday: out.debrief.forToday }));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
