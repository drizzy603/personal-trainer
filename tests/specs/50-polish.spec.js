// First-run polish: an optional name on the starter reveal feeds the greeting and the coach,
// the empty state links the walkthrough, the Run tab renders without a programme, and one
// streak definition drives the chip, the milestone and the Progress hero — with an at-risk hint.
const { boot, assert, run } = require('../lib/harness');

run('name once, How-Supero-works link, Run tab before a plan, one streak with an at-risk hint', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_apikey: '' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      localStorage.removeItem('kt_apikey'); localStorage.removeItem('kt_user_name'); lsDel('kt_routine');
      // empty state links the walkthrough; Run tab renders with no programme
      switchTab('log'); switchLogSub('workout');
      r.emptyHasHow = /How Supero works/.test(document.getElementById('screen').innerText);
      switchLogSub('run');
      const runTxt = document.getElementById('screen').innerText;
      r.runTab = { cta: !!document.querySelector('#screen .kt-cta'), blankTargets: /Run Targets/.test(runTxt), hitRun: /Hit the Run tab/.test(runTxt) };
      // starter intake → reveal carries the optional name field
      openStarterIntake();
      let guard = 0;
      while (_si && _si.step < STARTER_QS.length && guard++ < 10) _siPick(STARTER_QS[_si.step].opts[1].v);
      const nameEl = document.getElementById('si-name');
      r.nameField = !!nameEl;
      if (nameEl) nameEl.value = 'Roberto Sosa';
      applyStarterIntake();
      r.afterApply = { first: getUserFirstName(), routine: hasCustomRoutine(), prompt: /for Roberto\./.test(buildSystemPrompt()), greet: /Roberto/.test(document.getElementById('screen').innerText) };
      // one streak: every day a lift day, two logged days behind today → at risk until logged
      const cr = getCustomRoutine(); cr.weekPlan = ['Push','Push','Push','Push','Push','Push','Push']; (cr.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr);
      const y1 = addDays(todayISO(), -1), y2 = addDays(todayISO(), -2);
      lsSet('kt_sessions', [{ id: 1, date: y1, week: 1, type: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100 }], prs: [] },
                            { id: 2, date: y2, week: 1, type: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100 }], prs: [] }]);
      r.streak = { days: calcStreakDays(), training: calcTrainingDayStreak(), chip: _streakChip() };
      lsSet('kt_sessions', getSessions().concat([{ id: 3, date: todayISO(), week: 1, type: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100 }], prs: [] }]));
      r.streakLogged = { days: calcStreakDays(), chip: _streakChip() };
      r.milestoneUsesStreak = MILESTONE_DEFS.some(m => m.k === 'streak' && m.value() === calcStreakDays());
      return r;
    });
    assert(out.emptyHasHow, 'the no-programme empty state links How Supero works');
    assert(out.runTab.cta && !out.runTab.blankTargets && !out.runTab.hitRun, 'the Run tab renders the editorial segment without a programme: ' + JSON.stringify(out.runTab));
    assert(out.nameField, 'the starter reveal carries an optional name field');
    assert(out.afterApply.first === 'Roberto' && out.afterApply.routine && out.afterApply.prompt && out.afterApply.greet, 'the name feeds the greeting and the coach prompt: ' + JSON.stringify(out.afterApply));
    assert(out.streak.days === 2 && out.streak.training === 2 && /2-DAY STREAK · TRAIN TODAY TO KEEP IT/.test(out.streak.chip), 'chip shows the training-day streak and the at-risk hint: ' + JSON.stringify(out.streak));
    assert(out.streakLogged.days === 3 && /3-DAY STREAK/.test(out.streakLogged.chip) && !/KEEP IT/.test(out.streakLogged.chip), 'once today is logged the hint goes and the streak counts today: ' + JSON.stringify(out.streakLogged));
    assert(out.milestoneUsesStreak, 'the streak milestone measures the same streak');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
