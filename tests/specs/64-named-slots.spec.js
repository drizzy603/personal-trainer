// A lift day keeps its slot id (Push/Pull/Legs/Legs2/Arms — which week array it reads, how
// history groups, how the runner walks it) and gains a NAME the user chose: "Chest + Back".
// weekPlan gains no new value, so nothing older can break. One read path, _dayLabel().
const { boot, assert, run } = require('../lib/harness');

run('named slots: label, reverse lookup, settings, history, watch round-trip, coach', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_skips: '[]', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Run', 'Pull', 'Rest', 'Arms', 'Rest', 'Rest'];
      (cr.weeks || []).forEach(w => { delete w.weekPlan; });
      delete cr.dayNames;
      setCustomRoutine(cr);

      // 1. defaults: no names -> the slot's stock label; _sessLabel follows
      r.defaults = { push: _dayLabel('Push'), legs2: _dayLabel('Legs2'), rest: _dayLabel('Rest'), sess: _sessLabel('Pull'), empty: _dayLabel('') };

      // 2. naming a slot: cleaned, capped, stock name clears it, weekPlan untouched
      setDayName('Push', '  Chest   +  Back  ');
      r.named = { label: _dayLabel('Push'), stored: JSON.stringify(getCustomRoutine().dayNames), plan0: getCustomRoutine().weekPlan[0], slotStill: _planEntry('Push').type };
      setDayName('Pull', 'x'.repeat(40));
      r.capped = _dayLabel('Pull').length;
      setDayName('Pull', 'Pull');                         // the stock name is not a rename
      r.stockCleared = getCustomRoutine().dayNames && getCustomRoutine().dayNames.Pull === undefined;
      setDayName('Bogus', 'Nope');                        // not a slot: ignored
      r.bogusIgnored = !(getCustomRoutine().dayNames || {}).Bogus;

      // 3. reverse lookup: id, user name (any case), stock label, unknown
      r.lookup = { id: _slotForLabel('Push'), name: _slotForLabel('chest + back'), stock: _slotForLabel('Legs B'), unknown: _slotForLabel('Upper'), rest: _slotForLabel('Rest'),
        viaExtra: _slotForLabel('Wings', { Pull: 'Wings' }) };

      // 4. the auto-label reads the slot's exercises
      const wk = cr.weeks[currentWeek - 1];
      wk.push = [{ name: 'Barbell Bench Press', sets: 3, reps: '8', weight: 185, isMain: true }, { name: 'Pull Up', sets: 3, reps: '8', weight: 0 }];
      setCustomRoutine(getCustomRoutine()); Object.assign(getCustomRoutine().weeks[currentWeek - 1], { push: wk.push }); setCustomRoutine(getCustomRoutine());
      r.auto = _autoDayLabel('Push');

      // 5. every surface reads the name: Settings editor, Today card, week strip chip, tomorrow label
      _schedEditDow = 0; switchTab('settings');
      const st = document.getElementById('screen').innerText;
      r.settings = { header: /CHEST \+ BACK/.test(st), field: !!document.querySelector('input[aria-label="Day name"]'), pick: /Chest \+ Back/.test(st) };
      _schedEditDow = null;
      const dow = (new Date().getDay() + 6) % 7;
      const cr2 = getCustomRoutine(); const plan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']; plan[dow] = 'Push'; cr2.weekPlan = plan; setCustomRoutine(cr2);
      _todayActMemo = null; switchTab('log');
      const lt = document.getElementById('screen').innerText;
      r.today = { hero: /Chest \+ Back/i.test(lt), slotIdHidden: !/\bPUSH\b/.test(lt.replace(/PUSH FOCUS/g, '')) };

      // 6. the session record carries the label; history reads label first, groups by slot
      runnerSession = { type: 'Push', dayName: 'Push', weekday: 'MON', exercises: [{ name: 'Barbell Bench Press', sets: 1, reps: 8, weight: 185, isMain: true }], startedAt: Date.now() };
      runnerExIdx = 0; runnerCompleted = { 'Barbell Bench Press': 1 }; runnerWeightsLog = { 'Barbell Bench Press': [185] }; runnerRepsLog = { 'Barbell Bench Press': [8] };
      runnerRpe = {}; runnerRpeLog = {}; _wristStamps = {}; runnerWeights = {}; runnerReps = {};
      const before = getSessions().length;
      try { runnerFinishSession(); } catch (e) { r.finishErr = String(e); }
      const rec = getSessions()[0];
      r.record = { added: getSessions().length === before + 1, type: rec && rec.type, label: rec && rec.label };

      // 7. the watch is told the NAME, and a wrist session coming back under that name maps to the slot
      Capacitor.Plugins.TrovoWatch = Capacitor.Plugins.TrovoWatch || {};
      Capacitor.Plugins.TrovoWatch.updateContext = (p) => { window._ctx = p; return Promise.resolve({ sent: true }); };
      runnerSession = null; runnerOpen = false; _lastWatchPlan = ''; _todayActMemo = null; _pushWatchPlan();
      const wp = JSON.parse(window._ctx.json);
      r.watch = { dayName: wp.dayName, type: wp.type };
      r.drainSlot = _slotForLabel(wp.dayName);

      // 8. the coach: names in the prompt, dayNames on the tool, a labelled weekPlan resolves to slots
      r.promptNames = /Day names/.test(buildSystemPrompt()) && /Push = "Chest \+ Back"/.test(buildSystemPrompt());
      const res = executeCoachTool('update_routine_weeks', {
        dayNames: { Pull: 'Back + Biceps', Arms: 'Arms' },
        weekPlan: ['Chest + Back', 'Run', 'Back + Biceps', 'Rest', 'Arms', 'Rest', 'Rest'],
        weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4', pull: [{ name: 'Pull Up', sets: 3, reps: '8' }] }],
      });
      const cr3 = getCustomRoutine();
      r.coach = { ok: !!(res && res.ok), err: (res && res.error) || '', plan: cr3.weekPlan, names: cr3.dayNames };
      return r;
    });

    assert(out.defaults.push === 'Push' && out.defaults.legs2 === 'Legs B' && out.defaults.rest === 'Rest' && out.defaults.sess === 'Pull' && out.defaults.empty === '',
      'without names, stock labels: ' + JSON.stringify(out.defaults));
    assert(out.named.label === 'Chest + Back' && out.named.stored === '{"Push":"Chest + Back"}' && out.named.plan0 === 'Push' && out.named.slotStill === 'Push',
      'naming cleans the text and leaves the slot id and weekPlan alone: ' + JSON.stringify(out.named));
    assert(out.capped === 24 && out.stockCleared && out.bogusIgnored, 'cap 24, stock name clears, non-slot ignored: ' + JSON.stringify({ capped: out.capped, cleared: out.stockCleared, bogus: out.bogusIgnored }));
    assert(out.lookup.id === 'Push' && out.lookup.name === 'Push' && out.lookup.stock === 'Legs2' && out.lookup.unknown === null && out.lookup.rest === null && out.lookup.viaExtra === 'Pull',
      'reverse lookup by id, user name, stock label, with extras: ' + JSON.stringify(out.lookup));
    assert(out.auto === 'Chest + Back', 'the auto-label reads the muscle groups of the slot: ' + out.auto);
    assert(out.settings.header && out.settings.field && out.settings.pick, 'the Settings editor shows the name and the field: ' + JSON.stringify(out.settings));
    assert(out.today.hero, 'the Today card calls the day by its name: ' + JSON.stringify(out.today));
    assert(!out.finishErr && out.record.added && out.record.type === 'Push' && out.record.label === 'Chest + Back',
      'the session record keeps type=slot and carries the label: ' + JSON.stringify(out.record) + (out.finishErr || ''));
    assert(out.watch.dayName === 'Chest + Back' && out.watch.type === 'lift' && out.drainSlot === 'Push',
      'the watch gets the name and it maps back to the slot: ' + JSON.stringify(out.watch));
    assert(out.promptNames, 'the coach prompt lists the day names');
    assert(out.coach.ok && out.coach.plan[0] === 'Push' && out.coach.plan[2] === 'Pull' && out.coach.names && out.coach.names.Pull === 'Back + Biceps' && out.coach.names.Arms === undefined,
      'the coach can name days and write a labelled weekPlan that resolves to slots: ' + JSON.stringify(out.coach));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
