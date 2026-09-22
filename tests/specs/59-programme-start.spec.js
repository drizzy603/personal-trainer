// A new programme's week 1 day 1 is a Monday. Built mid-week, it starts on the Monday ahead
// and nothing is due before then; built on a Monday, it starts that day. Continuing an
// existing plan — restores, the week stepper, the coach's set_current_week — still
// back-anchors to the Monday just gone, which is what keeps a live week where it is.
const { boot, assert, run } = require('../lib/harness');

run('a new programme starts on Monday; continuing one does not move', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_skips: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const anchor = () => localStorage.getItem('kt_week_monday');
      const dow = (new Date().getDay() + 6) % 7;                 // Monday = 0
      r.dow = dow;

      // _nextMonday: today when today is Monday, else the Monday ahead — always a Monday.
      const mon = _mostRecentMonday();
      r.nextMonday = {
        fromMon: _nextMonday(mon),
        fromTue: _nextMonday(addDays(mon, 1)),
        fromSun: _nextMonday(addDays(mon, 6)),
        mon: mon, monPlus7: addDays(mon, 7),
        allMondays: [_nextMonday(mon), _nextMonday(addDays(mon, 1)), _nextMonday(addDays(mon, 6))]
          .every(d => (new Date(d + 'T00:00:00').getDay() + 6) % 7 === 0),
      };

      // A new programme anchors forward. currentWeek is 1 either way; what changes is WHEN.
      currentWeek = 7; lsSet('kt_week', 7); localStorage.setItem('kt_week_monday', mon);
      _startProgramme();
      r.install = { week: currentWeek, anchor: anchor(), expected: _nextMonday(todayISO()),
        started: _programmeStarted(), todayIsMonday: dow === 0 };

      // Before the start the programme schedules nothing: a rest day, flagged pre-start.
      _todayActMemo = null;
      const act = getTodayActivity();
      r.preStartAct = { type: act.type, preStart: !!act.preStart, startsOn: act.startsOn || '' };
      r.quiet = { missed: _missedThisWeek(), wrap: _weekWrapDue() };

      // autoAdvanceWeek must not touch a future anchor, and must not advance ON the start
      // Monday either — that Monday IS week 1.
      autoAdvanceWeek();
      r.afterBoot = { week: currentWeek, anchor: anchor() };
      localStorage.setItem('kt_week_monday', mon);               // pretend it is the start Monday
      currentWeek = 1; lsSet('kt_week', 1);
      autoAdvanceWeek();
      r.onStartMonday = currentWeek;
      // A logged session, so the separate "nobody has trained this yet" guard in
      // autoAdvanceWeek does not pin the week on its own and mask the advance.
      lsSet('kt_sessions', [{ id: 1, date: addDays(mon, -5), week: 1, type: 'Push',
        exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100 }], prs: [] }]);
      localStorage.setItem('kt_week_monday', addDays(mon, -7));  // a week later
      autoAdvanceWeek();
      r.weekAfter = currentWeek;
      lsSet('kt_sessions', []);

      // Continuing an existing plan back-anchors, and a no-op step changes nothing.
      localStorage.setItem('kt_week_monday', _nextMonday(todayISO()));
      currentWeek = 1; lsSet('kt_week', 1);
      adjustWeek(-1);                                            // clamped: already week 1
      r.noopStep = { week: currentWeek, anchor: anchor(), untouched: anchor() === _nextMonday(todayISO()) };
      adjustWeek(1);                                             // a real step re-anchors
      r.realStep = { week: currentWeek, anchor: anchor(), backAnchored: anchor() === mon };

      // The coach's set_current_week must not re-anchor a pending start when it changes nothing.
      localStorage.setItem('kt_week_monday', _nextMonday(todayISO())); currentWeek = 1; lsSet('kt_week', 1);
      const noop = executeCoachTool('set_current_week', { week: 1 });
      r.coachNoop = { ok: noop && noop.ok, anchorKept: anchor() === _nextMonday(todayISO()) };
      // weekForDate: a date next week belongs to next week (it used to clamp to the current one).
      currentWeek = 3; lsSet('kt_week', 3); localStorage.setItem('kt_week_monday', mon);
      r.weekForDate = { next: weekForDate(addDays(mon, 7)), last: weekForDate(addDays(mon, -7)), thisWk: weekForDate(addDays(mon, 3)) };
      // The coach is told, in so many words, that a stated week is a request to set it.
      const sp = buildSystemPrompt();
      r.promptActs = /call set_current_week with that number in the SAME turn/.test(sp) && /never call it "just a label"/.test(sp) && /stepper under the week number/.test(sp);
      // The dead AI-install path is gone.
      r.deadGone = typeof confirmLoadRoutine === 'undefined';
      return r;
    });

    assert(out.nextMonday.allMondays, 'every _nextMonday result is a Monday: ' + JSON.stringify(out.nextMonday));
    assert(out.nextMonday.fromMon === out.nextMonday.mon, 'a Monday starts that same day: ' + JSON.stringify(out.nextMonday));
    assert(out.nextMonday.fromTue === out.nextMonday.monPlus7 && out.nextMonday.fromSun === out.nextMonday.monPlus7,
      'any other day starts on the Monday ahead: ' + JSON.stringify(out.nextMonday));
    assert(out.install.week === 1 && out.install.anchor === out.install.expected,
      'a new programme is week 1 anchored to the next Monday: ' + JSON.stringify(out.install));
    assert(out.install.started === out.install.todayIsMonday,
      'it has started only if today is Monday: ' + JSON.stringify(out.install));

    if (!out.install.todayIsMonday) {
      assert(out.preStartAct.type === 'rest' && out.preStartAct.preStart,
        'before the start today is a flagged rest day: ' + JSON.stringify(out.preStartAct));
      assert(out.quiet.missed === null && out.quiet.wrap === false,
        'nothing is missed or wrapped before the start: ' + JSON.stringify(out.quiet));
      assert(out.afterBoot.week === 1 && out.afterBoot.anchor === out.install.expected,
        'a boot before the start leaves week and anchor alone: ' + JSON.stringify(out.afterBoot));
      assert(out.noopStep.week === 1 && out.noopStep.untouched,
        'a clamped week step does not destroy the future anchor: ' + JSON.stringify(out.noopStep));
    }
    assert(out.onStartMonday === 1, 'the start Monday is week 1, not week 2: ' + out.onStartMonday);
    assert(out.weekAfter === 2, 'the Monday after that is week 2: ' + out.weekAfter);
    assert(out.realStep.week === 2 && out.realStep.backAnchored,
      'a real week step continues the plan and back-anchors: ' + JSON.stringify(out.realStep));
    assert(out.deadGone, 'confirmLoadRoutine (dead, threw on entry) is gone');
    assert(out.promptActs, 'the coach prompt tells it to set a stated week, not debate it');
    assert(out.weekForDate.next === 4 && out.weekForDate.last === 2 && out.weekForDate.thisWk === 3, 'weekForDate: next week is week+1, not clamped to this week: ' + JSON.stringify(out.weekForDate));
    assert(out.coachNoop.ok && out.coachNoop.anchorKept, 'set_current_week to the current week leaves a pending start alone: ' + JSON.stringify(out.coachNoop));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
