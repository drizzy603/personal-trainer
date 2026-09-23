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

      // 9. two more slots, Day6/Day7: lifts with no stock meaning, offered only when a week uses them
      r.slots = { count: LIFT_TYPES.length, keys: LIFT_KEYS.length, isLift: _planEntry('Day6').isLift && _planEntry('Day7').isLift,
        stock: _dayLabel('Day6'), known: _knownPlanType('Day7'), offeredBefore: _schedTypes().indexOf('Day6') >= 0 };
      const res6 = executeCoachTool('update_routine_weeks', {
        dayNames: { Day6: 'Shoulders' },
        weekPlan: ['Push', 'Run', 'Pull', 'Rest', 'Arms', 'Shoulders', 'Rest'],
        weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4', day6: [{ name: 'Machine Shoulder Press', sets: 3, reps: '10', isMain: true }] }],
      });
      const cr6 = getCustomRoutine();
      r.day6 = { ok: !!(res6 && res6.ok), err: (res6 && res6.error) || '', plan5: cr6.weekPlan[5], label: _dayLabel('Day6'),
        exercises: getSessionExercises('Day6').length, offeredNow: _schedTypes().indexOf('Day6') >= 0 };

      // 10. the wrist round-trip: every payload carries the NAME, and what comes back merges by slot
      const seedRunner = (slot, exName) => {
        runnerSession = { type: slot, dayName: slot, weekday: 'MON', exercises: [{ name: exName, sets: 3, reps: 8, weight: 185 }], startedAt: Date.now() };
        runnerOpen = true; runnerExIdx = 0; runnerCompleted = {}; runnerRepsLog = {}; runnerWeightsLog = {}; runnerWeights = {}; runnerReps = {}; runnerRpe = {}; runnerRpeLog = {}; _wristStamps = {};
        runnerCompleted[exName] = 1; runnerRepsLog[exName] = [8]; runnerWeightsLog[exName] = [185];
      };
      seedRunner('Push', 'Barbell Bench Press');                     // Push is named 'Chest + Back' (section 2)
      const live = _buildWatchLive();
      r.live = { dayName: live && live.dayName, slot: live && live.slot };
      try { _onWatchLive(JSON.stringify({ dayName: 'Chest + Back', startedAt: Date.now(), reps: { 'Barbell Bench Press': [8, 8, 8] } })); } catch (e) { r.liveErr = String(e); }
      r.merged = { sets: (runnerRepsLog['Barbell Bench Press'] || []).length, noBanner: _watchLive === null };
      seedRunner('Legs2', 'Romanian Deadlift');                      // stock Legs B: label != id, no rename at all
      try { _onWatchLive(JSON.stringify({ dayName: 'Legs B', startedAt: Date.now(), reps: { 'Romanian Deadlift': [8, 8] } })); } catch (e) { r.liveErr2 = String(e); }
      r.legsB = { sets: (runnerRepsLog['Romanian Deadlift'] || []).length };
      runnerOpen = false; runnerSession = null; _watchLive = null;

      // 11. a name may not collide with another day; the auto-suggest never proposes one
      setDayName('Legs2', 'Legs');
      r.collide = { legs2: (getCustomRoutine().dayNames || {}).Legs2, toast: document.getElementById('toast').textContent };
      const badName = executeCoachTool('update_routine_weeks', { dayNames: { Arms: 'Rest' }, weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4', pull: [{ name: 'Pull Up', sets: 3, reps: '8' }] }] });
      r.collideCoach = { ok: !!(badName && badName.ok), err: (badName && badName.error) || '', arms: (getCustomRoutine().dayNames || {}).Arms };
      const badKey = executeCoachTool('update_routine_weeks', { dayNames: { Upper: 'X' }, weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4' }] });
      r.badKey = { ok: !!(badKey && badKey.ok), err: (badKey && badKey.error) || '' };
      const wkL = getCustomRoutine().weeks[currentWeek - 1]; wkL.legs2 = [{ name: 'Barbell Back Squat', sets: 3, reps: '8', weight: 200, isMain: true }]; setCustomRoutine(getCustomRoutine());
      r.autoLegs2 = _autoDayLabel('Legs2');
      setDayName('Push', 'Push');                                     // typing the slot id clears the name
      r.idClears = (getCustomRoutine().dayNames || {}).Push === undefined;

      // 12. a wrist session under a name the phone no longer holds is filed under a real slot
      Capacitor.Plugins.TrovoWatch.getPendingSessions = () => Promise.resolve({ sessions: [JSON.stringify({ dayName: 'Upper', startedAt: Date.now(), exercises: [{ name: 'Barbell Bench Press', reps: [8, 8], weights: [185, 185] }] })] });
      Capacitor.Plugins.TrovoWatch.clearPendingSessions = () => Promise.resolve({});
      return new Promise(resolve => {
        lsSet('kt_sessions', []);   // section 6 logged a Push today; the drain's same-day dedupe would skip this one
        const before = getSessions().length;
        try { drainWatchSessions(); } catch (e) { r.drainErr = String(e); }
        setTimeout(() => {
          const rec = getSessions()[0];
          r.drain = { added: getSessions().length === before + 1, type: rec && rec.type, isSlot: !!(rec && LIFT_TYPES.indexOf(rec.type) >= 0) };
          resolve(r);
        }, 400);
      });
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
    assert(out.slots.count === 7 && out.slots.keys === 7 && out.slots.isLift && out.slots.stock === 'Day 6' && out.slots.known && !out.slots.offeredBefore,
      'Day6/Day7 are lift slots, stock-named, not offered until used: ' + JSON.stringify(out.slots));
    assert(out.day6.ok && out.day6.plan5 === 'Day6' && out.day6.label === 'Shoulders' && out.day6.exercises === 1 && out.day6.offeredNow,
      'the coach can programme a sixth session by its name: ' + JSON.stringify(out.day6));
    assert(!out.liveErr && out.live.dayName === 'Chest + Back' && out.live.slot === 'Push', 'the live payload carries the NAME and the slot: ' + JSON.stringify(out.live) + (out.liveErr || ''));
    assert(out.merged.sets === 3 && out.merged.noBanner, 'a wrist echo under the name merges into the open runner: ' + JSON.stringify(out.merged));
    assert(!out.liveErr2 && out.legsB.sets === 2, 'the stock Legs B day (label != id) merges too: ' + JSON.stringify(out.legsB) + (out.liveErr2 || ''));
    assert(out.collide.legs2 === undefined && /Legs day/.test(out.collide.toast), 'naming Legs B "Legs" is refused: ' + JSON.stringify(out.collide));
    assert(!out.collideCoach.ok && /cadence value/.test(out.collideCoach.err) && out.collideCoach.arms === undefined, 'the coach may not name a day "Rest": ' + JSON.stringify(out.collideCoach));
    assert(!out.badKey.ok && /slot ids/.test(out.badKey.err), 'the coach may not name a non-slot: ' + JSON.stringify(out.badKey));
    assert(out.autoLegs2 === '', 'the auto-suggest never proposes another day\'s name: ' + JSON.stringify(out.autoLegs2));
    assert(out.idClears, 'typing the slot id as the name clears it');
    assert(!out.drainErr && out.drain.added && out.drain.isSlot, 'an unresolvable wrist name is filed under a real slot: ' + JSON.stringify(out.drain) + (out.drainErr || ''));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
