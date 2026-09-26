// Next round (web 20260926-1): when a programme runs out, the counter used to park on its last
// week and repeat it (usually a deload) until someone noticed. Now the last week and the end are
// said on Today, and "Your next 12 weeks" rebuilds the same programme with every weighted lift
// re-based on this round's best (about 10% under it, at least a plate over this round's start,
// never above the best) and carried through the weeks by the engine. It is set for a start date
// and built on that morning; "Today" starts it now.
const { boot, assert, run } = require('../lib/harness');

// Sessions inside this round, plus one older than it that must not count.
const SEED_SESSIONS = `(() => {
  const mon = _mostRecentMonday();
  const X = (name, reps, w) => ({ name, sets: reps.length, reps, weight: w, weightLog: reps.map(() => w) });
  const S = (id, date, type, ex) => ({ id, date, type, label: type, week: 11, prs: [], exercises: ex });
  lsSet('kt_sessions', [
    S(9001, addDays(mon, -14), 'Push', [X('Bench Press', [8, 8, 8, 8], 172.5), X('Lateral Raise', [15, 15, 15], 17.5)]),
    S(9002, addDays(mon, -12), 'Pull', [X('Barbell Row', [5, 5, 5, 5], 170)]),
    S(9003, addDays(mon, -200), 'Push', [X('Bench Press', [8, 8], 200)]),
  ]);
})()`;

run('next round: re-based on this round\'s best, the climb kept, marks dropped', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (seedJs) => {
      const r = {};
      _setWeek(12);
      eval(seedJs);
      const cr = getCustomRoutine();
      cr.weeks[0].push[0].rec = { name: 'Bench Press', sets: 4, reps: 8, weight: 145 };
      cr.weeks[3].recOut = { push: [{ name: 'Dips' }] };
      setCustomRoutine(cr);
      const nb = _nextRoundBuild(getCustomRoutine());
      const W = nb.routine.weeks, row = (w, k, n) => (w[k] || []).find(e => e.name === n);
      r.bench = W.map(w => row(w, 'push', 'Bench Press').weight);
      r.lat = W.map(w => row(w, 'push', 'Lateral Raise').weight);
      r.row1 = row(W[0], 'pull', 'Barbell Row').weight;
      const it = n => nb.rows.find(x => x.name === n);
      r.items = ['Bench Press', 'Lateral Raise', 'Overhead Press'].map(n => { const x = it(n); return x && [x.from, x.to, Math.round(x.best * 10) / 10]; });
      r.cycle = nb.routine.cycle;
      r.marks = JSON.stringify(nb.routine).indexOf('"rec"') < 0 && W.every(w => !w.recOut);
      r.oldKept = getCustomRoutine().weeks[0].push[0].weight === 147.5;   // building it changes nothing
      return r;
    }, SEED_SESSIONS);
    assert(JSON.stringify(out.bench) === '[155,157.5,160,162.5,165,167.5,170,172.5,175,177.5,180,182.5]',
      'bench starts 10% under 172.5 x 8 and keeps the programme\'s +2.5 a week: ' + JSON.stringify(out.bench));
    assert(out.lat.every(w => w === 17.5), 'a lift not past its start stays where it is: ' + JSON.stringify(out.lat));
    assert(out.row1 === 140, 'a 5-rep best is read at the lift\'s own 8 reps (170 x 5 -> about 157 x 8 -> 140): ' + out.row1);
    assert(JSON.stringify(out.items[0]) === '[147.5,155,172.5]', 'the 200 lb bench from before this round does not count: ' + JSON.stringify(out.items));
    assert(out.items[2] && out.items[2][0] === out.items[2][1] && out.items[2][2] === 0, 'a lift not logged this round stays: ' + JSON.stringify(out.items[2]));
    assert(out.cycle === 2 && out.marks && out.oldKept, 'round 2, no edit marks, the current round untouched: ' + JSON.stringify([out.cycle, out.marks, out.oldKept]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('next round: Today says the last week and the end; set it, cancel, undo, not now', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (seedJs) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, mon = _mostRecentMonday();
      const txt = () => document.getElementById('screen').textContent.replace(/\s+/g, ' ');
      const chips = () => [...document.querySelectorAll('#screen .kt-util-chip .lbl')].map(e => e.textContent);
      eval(seedJs);
      r.before = _roundInfo() === null && !/LAST WEEK/.test(txt());
      _setWeek(12);
      r.since = localStorage.getItem('kt_final_since') === mon;
      switchTab('log'); switchLogSub('workout'); await wait(30);
      promoteTodayItem('round'); await wait(30);
      r.last = /LAST WEEK OF THE PROGRAMME/.test(txt()) && txt().indexOf('It ends ' + _nrDay(addDays(mon, 6))) >= 0;
      r.prompt = /the LAST week of the programme/.test(buildSystemPrompt());
      openNextRound(); await wait(30);
      const sh = document.getElementById('nrSheet');
      r.sheet = sh && /Your next 12 weeks/.test(sh.textContent) && /Bench Press.*147\.5 lb → 155 lb/.test(sh.textContent.replace(/\s+/g, ' '));
      r.monChip = sh && sh.querySelector('.kt-rt-chip.on').textContent === _nrDay(addDays(mon, 7));
      setNextRound('monday'); await wait(30);
      r.set = (lsGet('kt_routine_next') || {}).startsOn === addDays(mon, 7) && !document.getElementById('nrSheet');
      promoteTodayItem('round'); await wait(30);
      r.setCard = /YOUR NEXT 12 WEEKS ARE SET/.test(txt()) && getCustomRoutine().cycle === undefined;
      r.promptSet = /set the next round to start/.test(buildSystemPrompt());
      openNextRound(); await wait(20);
      r.keep = /Keep it for/.test(document.getElementById('nrGo').textContent);
      cancelNextRound(); await wait(30);
      r.cancelled = _nextRoundSet() === null;
      const undo = document.querySelector('#toast .kt-toast-undo'); if (undo) undo.click(); await wait(30);
      r.undone = !!_nextRoundSet();
      lsDel('kt_routine_next');
      // ended: the final week began two Mondays ago
      localStorage.setItem('kt_final_since', addDays(mon, -14));
      todayBannerOverride = null; render(); await wait(30);
      r.ended = _roundInfo().ended && /PROGRAMME DONE/.test(txt()) && /Week 12 repeats/.test(txt());
      r.endedFirst = chips().indexOf('PROGRAMME DONE') < 0;   // it holds the top slot, not a chip
      openNextRound(); await wait(20);
      const sun = ((new Date().getDay() + 6) % 7) === 6;
      r.defaultToday = sun ? !/Today/.test(document.getElementById('nrSheet').textContent) : /Start round 2 today/.test(document.getElementById('nrGo').textContent);
      closeNextRound();
      snoozeNextRound(); await wait(20);
      r.snoozed = !/PROGRAMME DONE/.test(txt()) && chips().indexOf('PROGRAMME DONE') < 0;
      return r;
    }, SEED_SESSIONS);
    assert(out.before, 'no card before the final week');
    assert(out.since, 'setting the final week keeps the Monday it began');
    assert(out.last, 'Today says the last week and the day it ends');
    assert(out.prompt, 'the coach is told it is the last week');
    assert(out.sheet && out.monChip, 'the sheet shows each lift\'s new start and defaults to the Monday after the final week: ' + JSON.stringify([out.sheet, out.monChip]));
    assert(out.set && out.setCard && out.promptSet, 'setting it keeps this round until then and says so: ' + JSON.stringify([out.set, out.setCard, out.promptSet]));
    assert(out.keep && out.cancelled && out.undone, 'a set round can be kept, cancelled and undone: ' + JSON.stringify([out.keep, out.cancelled, out.undone]));
    assert(out.ended && out.endedFirst, 'after the end Today leads with PROGRAMME DONE: ' + JSON.stringify([out.ended, out.endedFirst]));
    assert(out.defaultToday, 'after the end the sheet offers today first (never on a Sunday)');
    assert(out.snoozed, 'Not now hides it for the week');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('next round: starts on its morning; week 1, archive, intro; old sessions are not carried', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (seedJs) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, mon = _mostRecentMonday();
      eval(seedJs);
      _setWeek(12, addDays(mon, -7));   // the final week was last week
      lsSet('kt_routine_next', { startsOn: mon, at: addDays(mon, -2) });
      const archived = getRoutineArchive().length;
      autoAdvanceWeek();
      const cr = getCustomRoutine();
      r.swapped = cr.cycle === 2 && currentWeek === 1 && localStorage.getItem('kt_week_monday') === mon && _programmeStarted();
      r.bench1 = cr.weeks[0].push.find(e => e.name === 'Bench Press').weight;
      r.archived = getRoutineArchive().length === archived + 1 && getRoutineArchive()[0].routine.cycle === undefined;
      r.cleared = _nextRoundSet() === null && localStorage.getItem('kt_final_since') === null && _roundInfo() === null;
      r.noCarry = _carryCandidates(getSessions().find(s => s.id === 9001)).length === 0;
      switchTab('log'); switchLogSub('workout'); await wait(30);
      promoteTodayItem('roundintro'); await wait(30);
      const t = document.getElementById('screen').textContent.replace(/\s+/g, ' ');
      r.intro = /ROUND 2 · WEEK 1/.test(t) && /Bench Press 155 lb/.test(t);
      r.prompt = /round 2 of this programme/.test(buildSystemPrompt());
      openRoutines(); await wait(20);
      r.routines = /Round 2 of your programme/.test(document.getElementById('rtSheet').textContent);
      closeRoutines();
      // a second boot the same day does nothing more
      autoAdvanceWeek();
      r.once = getCustomRoutine().cycle === 2 && getRoutineArchive().length === archived + 1;
      return r;
    }, SEED_SESSIONS);
    assert(out.swapped, 'the set round is swapped in on its Monday as week 1');
    assert(out.bench1 === 155, 'built from this round\'s best: ' + out.bench1);
    assert(out.archived && out.cleared, 'the old round is archived; the set round and the final-week marker are cleared: ' + JSON.stringify([out.archived, out.cleared]));
    assert(out.noCarry, 'a session from the old round is not offered as Carry forward against the new, lower start');
    assert(out.intro && out.prompt && out.routines, 'Today, the coach and Routines say round 2: ' + JSON.stringify([out.intro, out.prompt, out.routines]));
    assert(out.once, 'it happens once');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('next round: today, kg plates, and the final week found by the week clock', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async (seedJs) => {
      const r = {}, mon = _mostRecentMonday();
      eval(seedJs);
      // the clock walks into the final week: the Monday it began is kept
      lsSet('kt_week', 10); currentWeek = 10; localStorage.setItem('kt_week_monday', addDays(mon, -14));
      autoAdvanceWeek();
      r.walk = currentWeek === 12 && localStorage.getItem('kt_final_since') === mon;
      lsSet('kt_week', 10); currentWeek = 10; localStorage.setItem('kt_week_monday', addDays(mon, -21));
      autoAdvanceWeek();
      r.walkPast = currentWeek === 12 && localStorage.getItem('kt_final_since') === addDays(mon, -7) && _roundInfo().ended;
      _setWeek(12);
      const nb = _nextRoundBuild(getCustomRoutine());
      const b = nb.rows.find(x => x.name === 'Bench Press');
      r.kg = [Math.round(wDisp(b.to) * 100) / 100, _onPlateGrid(b.to)];
      r.sunday = ((new Date().getDay() + 6) % 7) === 6;
      if (!r.sunday) {
        r.today = setNextRound('today');
        r.started = getCustomRoutine().cycle === 2 && currentWeek === 1 && localStorage.getItem('kt_week_monday') === mon && _programmeStarted();
      }
      return r;
    }, SEED_SESSIONS);
    assert(out.walk && out.walkPast, 'the final week\'s Monday is found by the clock, also when it walked past it: ' + JSON.stringify([out.walk, out.walkPast]));
    assert(out.kg[0] === 70 && out.kg[1], 'a kg user gets a 1.25 kg plate start (70 kg): ' + JSON.stringify(out.kg));
    if (!out.sunday) assert(out.today && out.started, 'Today starts round 2 now, as this week: ' + JSON.stringify([out.today, out.started]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
