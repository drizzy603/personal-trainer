// Polish on the last batch: the Monday start is a default with a way out; an unrecognised
// day is named and fixable instead of passing as rest; the Progress bars cover every lift
// slot; and a chat tap dismisses the keyboard while a scroll does not.
const { boot, assert, run } = require('../lib/harness');

run('start-now override, visible unknown day, all-slot progress, tap-not-scroll', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_skips: '[]', kt_apikey: 'sk-ant-test-not-real', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      const dow = (new Date().getDay() + 6) % 7;
      const mon = _mostRecentMonday();

      // ── B. a plan built mid-week can start today ──────────────────────────
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
      (cr.weeks || []).forEach(w => { delete w.weekPlan; });
      setCustomRoutine(cr);
      _startProgramme();
      r.mon = mon;
      r.preStart = { started: _programmeStarted(), anchor: localStorage.getItem('kt_week_monday') };
      switchTab('log');
      const txt0 = document.getElementById('screen').innerText;
      r.offer = { shown: /Start week 1 today instead/.test(txt0), onlyWhenPending: dow !== 0 && dow !== 6 };   // Monday: already started; Sunday: tomorrow IS the start
      if (dow !== 0 && dow !== 6) {
        startProgrammeNow();
        r.now = {
          started: _programmeStarted(),
          anchor: localStorage.getItem('kt_week_monday'),
          week: currentWeek,
          skipsForPastDays: getSkips().length,
          missed: _missedThisWeek(),
          todayType: getTodayActivity().type,
        };
      }

      // ── C. an unrecognised day is visible and fixable ─────────────────────
      const cr2 = getCustomRoutine();
      const plan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']; plan[dow] = 'Upper';
      cr2.weekPlan = plan; (cr2.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr2);
      _todayActMemo = null;
      const act = getTodayActivity();
      switchTab('log');
      const txt = document.getElementById('screen').innerText;
      r.unknown = {
        actType: act.type, raw: act.unknown,
        heroSays: /Unrecognised day/i.test(txt) && /Upper/i.test(txt),     // the hero is uppercased by CSS
        ctaSays: /Choose what today is/.test(txt),
        notPlainRest: !/Rest day\./.test(txt),
      };
      _openCadenceFor(dow);
      r.fixRoute = { tab: currentTab, dowSelected: _schedEditDow === dow };
      _schedEditDow = null;

      // ── D. Progress bars cover every lift slot ─────────────────────────────
      // The Progress tab shows an empty state with zero sessions, so give it one.
      lsSet('kt_sessions', [{ id: 1, date: mon, week: currentWeek, type: 'Push', prs: [],
        exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: [8, 8, 8], weight: 185 }] }]);
      const cr3 = getCustomRoutine();
      const w = cr3.weeks[currentWeek - 1];
      w.legs2 = [{ name: 'Romanian Deadlift', sets: 3, reps: '8', weight: 185, isMain: true }];
      w.arms = [{ name: 'Barbell Curl', sets: 3, reps: '10', weight: 65, isMain: true }];
      setCustomRoutine(cr3);
      switchTab('progress');
      const ptxt = document.getElementById('screen').innerText;
      // The block-start week has no main lift in legs2/arms, so no gain may be claimed against a zero start.
      r.progress = { legsB: /Romanian Deadlift/.test(ptxt), arms: /Barbell Curl/.test(ptxt), noFabricatedGain: !/\+185|\+65 /.test(ptxt) };

      // ── A. chat: tap dismisses, scroll does not ───────────────────────────
      coachView = 'chat'; currentTab = 'coach'; render();
      const input = document.getElementById('coach-input');
      const msgs = document.querySelector('.coach-msgs-area');
      const fire = (type, x, y, target) => {
        const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
        target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
      };
      input.focus(); await wait(30);
      fire('touchstart', 100, 300, msgs); fire('touchend', 100, 120, msgs);      // a 180px drag
      await wait(30);
      r.scroll = { stillTyping: document.activeElement === input };
      fire('touchstart', 100, 300, msgs); fire('touchend', 103, 304, msgs);      // a tap
      await wait(30);
      r.tap = { dismissed: document.activeElement !== input };
      return r;
    });

    assert(out.offer.shown === out.offer.onlyWhenPending, 'the start-now offer shows exactly while the start is pending: ' + JSON.stringify(out.offer));
    if (out.now) {
      assert(out.now.started && out.now.week === 1 && out.now.anchor === out.mon,
        'start-now anchors week 1 to THIS Monday: ' + JSON.stringify(out.now));
      assert(out.now.missed === null, 'nothing is owed for the days before the start: ' + JSON.stringify(out.now));
      assert(out.now.todayType === 'lift', 'today\'s session is on the card: ' + JSON.stringify(out.now));
    }
    assert(out.unknown.actType === 'rest' && out.unknown.raw === 'Upper', 'the activity carries the raw value: ' + JSON.stringify(out.unknown));
    assert(out.unknown.heroSays && out.unknown.ctaSays && out.unknown.notPlainRest, 'the card names the unknown day and offers the fix: ' + JSON.stringify(out.unknown));
    assert(out.fixRoute.tab === 'settings' && out.fixRoute.dowSelected, 'the fix lands in the cadence editor on that day: ' + JSON.stringify(out.fixRoute));
    assert(out.progress.legsB && out.progress.arms, 'Progress bars cover Legs B and Arms: ' + JSON.stringify(out.progress));
    assert(out.progress.noFabricatedGain, 'no gain is fabricated against a slot the block did not start with: ' + JSON.stringify(out.progress));
    assert(out.scroll.stillTyping, 'a scroll on the conversation keeps the keyboard');
    assert(out.tap.dismissed, 'a tap on the conversation dismisses it');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

