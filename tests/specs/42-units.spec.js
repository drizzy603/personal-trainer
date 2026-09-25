// Unit preference: storage stays lb / km, display and inputs follow the choice.
const { boot, assert, run } = require('../lib/harness');

run('kg and miles convert on the way out and back; lb/km is byte-identical to before', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      setUnitW('lb'); setUnitD('km');
      r.lb = { w: fmtW(160), d: fmtD(5), pace: fmtPace(300), store: wStore(160), dstore: dStore(5), plate: _plateMath(135) };
      setUnitW('kg'); setUnitD('mi');
      r.kg = { w: fmtW(160), d: fmtD(5), pace: fmtPace(300), store: wStore(72.5), dstore: dStore(3.11), plate: _plateMath(135), ramp: _warmupRamp(220, true), paceStore: paceStore('8:03') };
      // runner shows kg, stepper stores lb
      openDeckRunner('Push'); const ex = runnerSession.exercises[0]; runnerWeights[ex.name] = 160; paintRunner();
      r.runnerTarget = (document.querySelector('.kt-r-target') || {}).textContent || '';
      runnerEngaged = true; paintRunner();
      const lbl = (document.querySelector('.kt-step-lbl') || {}).textContent || '';
      const inp = document.querySelector('.kt-step-input');
      r.stepLbl = lbl; r.stepVal = inp ? inp.value : null;
      runnerStepWeight(wStepLb()); r.afterStep = runnerWeights[ex.name];
      runnerSetWeight(wStore('75')); r.afterType = runnerWeights[ex.name];
      closeDeckRunner();
      // run form in miles stores km
      switchTab('log'); switchLogSub('run'); openRunLog();
      // typed into the form on screen (the Run tab renders it on every plan since 20260924-11)
      document.getElementById('kt-rlog-dist').value = '3.11'; document.getElementById('kt-rlog-time').value = '25:00'; saveInlineRun();
      r.runKm = getRuns()[0].distance;
      // body-weight goal typed in kg stored in lb
      setBWGoal(wStore(80)); r.bwGoalLb = getBWGoal();
      setUnitW('lb'); setUnitD('km');
      r.back = { w: fmtW(160), d: fmtD(5), settings: (function(){ switchTab('settings'); return !!document.querySelector('.kt-units-opt.on'); })() };
      return r;
    });
    assert(out.lb.w === '160 lb' && out.lb.d === '5 km' && out.lb.pace === '5:00 /km' && out.lb.store === 160 && out.lb.dstore === 5, 'lb/km untouched: ' + JSON.stringify(out.lb));
    assert(out.kg.w === '72.5 kg' && out.kg.d === '3.11 mi' && out.kg.pace === '8:03 /mi', 'kg/mi display: ' + JSON.stringify(out.kg));
    assert(Math.abs(out.kg.store - 159.8) < 0.2 && Math.abs(out.kg.dstore - 5.005) < 0.02, 'typed kg/mi store as lb/km: ' + out.kg.store + ' / ' + out.kg.dstore);
    assert(/\/ side|Empty bar|^$/.test(out.kg.plate) && !/45/.test(out.kg.plate), 'plate math uses the 20 kg bar: ' + out.kg.plate);
    assert(/bar/.test(out.kg.ramp) && !/\d{3}/.test(out.kg.ramp.split('·')[1] || ''), 'warm-up ramp rounds in kg: ' + out.kg.ramp);
    assert(out.kg.paceStore === '5:00', '8:03 /mi stores as 5:00 /km');
    assert(/72\.5/.test(out.runnerTarget) && /kg/i.test(out.runnerTarget), 'runner target in kg: ' + out.runnerTarget);
    assert(/KG/.test(out.stepLbl) && out.stepVal === '72.5', 'stepper labelled and valued in kg: ' + out.stepLbl + ' ' + out.stepVal);
    // 160 lb = 72.57 kg; +1.25 kg lands on 73.75 kg, stored as a typed 73.75 kg would be (162.6 lb).
    assert(out.afterStep === 162.6, 'stepper adds 1.25 kg and stores it like a typed kg value: ' + out.afterStep);
    assert(Math.abs(out.afterType - 165.3) < 0.2, 'typing 75 kg stores ~165.3 lb: ' + out.afterType);
    assert(Math.abs(out.runKm - 5.005) < 0.02, 'a 3.11 mi run stores as ~5 km: ' + out.runKm);
    assert(Math.abs(out.bwGoalLb - 176.4) < 0.2, '80 kg goal stores as ~176.4 lb: ' + out.bwGoalLb);
    assert(out.back.w === '160 lb' && out.back.d === '5 km' && out.back.settings, 'switching back restores lb/km and the Settings toggle renders');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
