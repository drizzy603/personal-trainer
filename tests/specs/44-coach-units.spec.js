// The coach speaks and writes the user's units. Storage stays lb / km.
const { boot, assert, run } = require('../lib/harness');

run('kg/mi user: prompts, tool schemas and tool writes are all in kg and miles; lb/km user unchanged', async () => {
  const app = await boot({ seed: { kt_runs: '[]', kt_bw: '[]', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      setUnitW('kg'); setUnitD('mi');
      setBenchGoal(220.5); setBWGoal(176.4); setRunGoal('5:00'); // stored lb / per-km
      r.prompt = buildSystemPrompt();
      r.intake = buildIntakeSystemPrompt();
      r.tools = JSON.stringify(_cachedCoachTools());
      r.setW = executeCoachTool('set_exercise_weight', { name: 'Bench Press', weight: 80 });
      r.storedW = getWeights()['Bench Press'];
      r.bench = executeCoachTool('set_bench_goal', { weight: 100 }); r.benchLb = getBenchGoal();
      r.run = executeCoachTool('log_run', { distance: 3.1, time: '25:00' }); r.runKm = getRuns()[0].distance;
      r.runMi = executeCoachTool('log_run', { distance_mi: 2, time: '16:00' }); r.runMiKm = getRuns()[0].distance;
      r.pace = executeCoachTool('set_run_goal', { pace: '8:00' }); r.paceStored = getRunGoal();
      r.bw = executeCoachTool('log_bodyweight', { weight: 84 }); r.bwLb = getBodyWeights()[0].weight;
      r.sess = executeCoachTool('log_session', { type: 'Push', exercises: [{ name: 'Incline Press', sets: 3, reps: 8, weight: 60 }] });
      const s = getSessions().find(x => x.exercises && x.exercises[0] && x.exercises[0].name === 'Incline Press');
      r.sessW = s ? s.exercises[0].weight : null;
      r.weeks = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4',
        push: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 81, rpe: 7 }], pull: [], legs: [], runs: { Tue: { mi: 3, type: 'easy' } } }] });
      const wk = getCustomRoutine().weeks[currentWeek - 1];
      r.wkW = wk.push[0].weight; r.wkRun = wk.runs && wk.runs.Tue;
      r.summary = { w: toolCallLabel({ name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 80 } }), pace: toolCallLabel({ name: 'set_run_goal', input: { pace: '8:00' } }), run: toolCallLabel({ name: 'log_run', input: { distance: 3.1, time: '25:00' } }) };
      setUnitW('lb'); setUnitD('km');
      r.lbSet = executeCoachTool('set_exercise_weight', { name: 'Row', weight: 101 }); r.lbStored = getWeights()['Row'];
      r.lbRun = executeCoachTool('log_run', { distance_km: 5, time: '25:00' }); r.lbRunKm = getRuns()[0].distance;
      r.lbPrompt = buildSystemPrompt();
      r.lbTools = JSON.stringify(_cachedCoachTools());
      return r;
    });
    // prompts
    assert(/UNITS: the user works in kg and mi/.test(out.prompt), 'system prompt carries the units line');
    assert(!/\blb\b/.test(out.prompt), 'kg prompt never says lb: ' + (out.prompt.match(/.{30}\blb\b.{10}/) || [''])[0]);
    assert(/multiple of 1\.25 kg/.test(out.prompt), 'plate rule in kg: ' + (out.prompt.match(/LOADS.{0,120}/) || [''])[0]);
    assert(/RUN PACE GOAL: 8:03 \/mi/.test(out.prompt), 'pace goal shown per mile: ' + (out.prompt.match(/RUN PACE GOAL.{0,20}/) || [''])[0]);
    assert(/CURRENT EXERCISE WEIGHTS \(kg\)/.test(out.prompt), 'working weights header in kg');
    assert(/Weights in kg/.test(out.intake) && /UNITS: the user works in kg and mi/.test(out.intake), 'intake prompt in kg');
    // schemas
    assert(/Weight in kg/.test(out.tools) && !/Weight in lb/.test(out.tools) && !/\{W\}/.test(out.tools), 'tool schemas unitized to kg');
    assert(/pace per mi/.test(out.tools) && /Distance in miles — the user/.test(out.tools), 'distance and pace descriptions in miles');
    // writes
    assert(Math.abs(out.storedW - 176.4) < 0.2 && /80 kg/.test(out.setW.message), '80 kg stores ~176.4 lb: ' + out.storedW + ' / ' + out.setW.message);
    assert(Math.abs(out.benchLb - 220.5) < 0.2 && /100 kg/.test(out.bench.message), 'bench goal 100 kg stores ~220.5 lb: ' + out.benchLb);
    assert(Math.abs(out.runKm - 4.99) < 0.03 && /3\.1 mi/.test(out.run.message), 'a 3.1 mi run stores ~4.99 km: ' + out.runKm + ' / ' + out.run.message);
    assert(Math.abs(out.runMiKm - 3.22) < 0.02, 'explicit distance_mi converts: ' + out.runMiKm);
    assert(out.paceStored === '4:58' && /8:00 \/mi/.test(out.pace.message), '8:00 /mi stores as 4:58 /km: ' + out.paceStored + ' / ' + out.pace.message);
    assert(Math.abs(out.bwLb - 185.2) < 0.2 && /84 kg/.test(out.bw.message), '84 kg body weight stores ~185.2 lb: ' + out.bwLb);
    assert(Math.abs(out.sessW - 132.3) < 0.2, 'logged 60 kg session stores ~132.3 lb: ' + out.sessW);
    assert(Math.abs(out.wkW - 179.1) < 0.3, 'programme load 81 kg snaps to 81.25 kg = ~179.1 lb: ' + out.wkW);
    assert(out.wkRun && Math.abs(out.wkRun.km - 4.83) < 0.02 && out.wkRun.mi === undefined, 'programme run {mi:3} stored as km: ' + JSON.stringify(out.wkRun));
    assert(/80 kg/.test(out.summary.w) && /8:00 \/mi/.test(out.summary.pace) && /3\.1 mi/.test(out.summary.run), 'tool pills read the model input in the user units: ' + JSON.stringify(out.summary));
    // lb / km unchanged
    assert(out.lbStored === 100 && /100 lb/.test(out.lbSet.message), 'lb user: 101 snaps to 100 lb: ' + out.lbStored);
    assert(out.lbRunKm === 5 && /5 km/.test(out.lbRun.message), 'lb/km user: distance_km stored as is: ' + out.lbRunKm);
    assert(/UNITS: the user works in lb and km/.test(out.lbPrompt) && /multiple of 2\.5 lb/.test(out.lbPrompt), 'lb prompt keeps the 2.5 lb plate rule');
    assert(/Weight in lb/.test(out.lbTools) && /Distance in kilometres — the user/.test(out.lbTools), 'lb/km tool schemas');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
