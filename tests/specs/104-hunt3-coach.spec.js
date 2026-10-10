// Hunt 3 (2026-10-04), coach group:
// - H01 update_routine_weeks converts only the lift days the call sent: a day it left out is
//   the stored one, already lb (a kg owner's kept days were multiplied by 2.2 on every rename or
//   one-day tweak; an lb owner's kept per-set loads were re-snapped to 2.5 lb).
// - H13 the prompt's RECENT SESSIONS / LOGGED RUNS / LOGGED SPORT SESSIONS say how many of how
//   many saved they list and from which day (a whole day at the cut); the "not in this list = not
//   saved" rule holds only from that day; log_run / log_sport refuse a same-day twin
//   (separate:true logs a real second one) and the pill says "Already logged".
// - M24 a programme the coach builds in the chat after "Start a new programme" starts like the
//   intake's: week 1 on the next Monday, the weekly cards re-armed (it kept the archive's anchor,
//   started in the past, and Monday read week 2); a rewrite of an existing one does not re-anchor.
// - M52 Today's coach card is keyed on today's plan (the week and the main lift's load, sets,
//   reps, RPE), so a coach rewrite, Restore, set_current_week, the week stepper and a Routines
//   undo refresh it (it kept quoting the old load until the next day); one fetch per plan.
// - M53 the morning card sends a kg owner's per-set weightLog and legacy sets[] in kg (only the
//   top weight was converted; the rest went out in lb, labelled kg).
// - M54 the session debrief prompt reads every set from _exPairs: a previous session in the
//   legacy nested shape read "[object Object],…×[undefined] @ 0 lb", back-offs read as top sets;
//   the day goes by its name.
// - L35 the coach chips compare the last session's date with today and yesterday on the local
//   calendar (it was read as UTC midnight: after 20:00 west of UTC today's session was
//   "yesterday's", east of UTC the reverse) and name the day by its name (as written: R11).
// - L36 THIS WEEK'S PLAN prints each set's load when a top set and back-offs differ ("3×3,8,8 @
//   225 lb" hid 225/185/185), in the "[edited by the user; you had …]" mark too.
// - L39 a reply's text blocks from separate tool rounds are separate paragraphs ("On it.Bench is
//   …" ran together and a %% block glued to the line before it printed raw); the text that
//   carries on a reply cut off at max_tokens still joins it mid-word.
// - L40 pills and PLAN CHANGES say what was saved: a day swap has a label (it read
//   "swap_cadence_days"), a cadence change is named and gets its card and Undo ("No weeks
//   changed"), a call that failed after saving a week says which weeks it saved and which it did
//   not, with a card and Undo (a red "Weeks 6–15 updated" and no Undo), a call that saved
//   nothing says so; a logged session goes by its day's name.
// - L10 set_exercise_weight saves the working weight under the programme's spelling (else a saved
//   key's, else the library's) and folds case variants into it: "face pull" was saved beside
//   "Face Pull", reported as set, and the "your load" row on Today never showed it.
// Hunt 4 (2026-10-06), what the review of those fixes found:
// - R09 (L40 after a relaunch) a cadence change keeps its pill and its PLAN CHANGES card with Undo
//   when the app is opened again: the chat history keeps a call's result but not its weekPlan, so
//   it read "No weeks changed" with no card. The result says cadenceSaved; one stored before that
//   (an ok answer that wrote no week) reads as the cadence-only change it was.
// - R11 (L35) the chip names the day exactly as the owner wrote it: apostrophes and quotes were
//   stripped and & became +, though the chip carries any text (data-msg, escaped, no inline JS).
// - R12 (H13) log_session refuses a session already saved (same day and day slot, sharing a lift),
//   shows the coach what is saved and takes separate:true, as log_run and log_sport do: an older,
//   unlisted session the user mentioned was saved twice and its volume counted twice.
// Hunt 5 (2026-10-09), what the review of those fixes found:
// - T08 (R12) a session told again with a lift the saved one lacks was refused whole and the coach
//   told to say it was already logged: the refusal names the lift as not saved (so does the pill),
//   and log_session's add_to puts only the lifts a saved session lacks into it.
// Hunt 6 (2026-10-10), what the review of those fixes found:
// - U02 (T08) add_to kept only the first entry of a lift sent as a top set plus back-offs: the
//   back-offs were dropped and the coach told they were 'already in it, left as saved'.
const { boot, assert, run } = require('../lib/harness');

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const MOCK = `(replies) => { let n = 0; window.fetch = async () => new Response(JSON.stringify(replies[Math.min(n++, replies.length - 1)]), { status: 200, headers: { 'content-type': 'application/json' } }); }`;

run('H01: a coach week rewrite leaves the days it did not send exactly as stored (kg and lb)', async () => {
  for (const unit of ['kg', 'lb']) {
    const app = await boot({ native: true, seed: { kt_unit_w: unit } });
    try {
      const out = await app.page.evaluate(() => {
        const c = currentWeek - 1, wk = currentWeek;
        const cr = getCustomRoutine();
        // off-grid stored loads (a kg plate grid, an older import) and a per-set row
        cr.weeks[c].pull[0].weight = 99.2;
        cr.weeks[c].legs[0].weight = 181.9; cr.weeks[c].legs[0].weights = [181.9, 154.3, 154.3];
        setCustomRoutine(cr);
        const loads = () => {
          const w = getCustomRoutine().weeks[c];
          return ['push', 'pull', 'legs'].map(k => (w[k] || []).map(e => e.name + '=' + e.weight + (e.weights ? JSON.stringify(e.weights) : '')).join(',')).join(' | ');
        };
        const before = loads(), hdr = { wk, bName: cr.weeks[c].bName, bColor: cr.weeks[c].bColor };
        // a rename (header-only week), twice
        const r1 = executeCoachTool('update_routine_weeks', { dayNames: { Push: 'Chest + Tris' }, weeks: [hdr] });
        const r2 = executeCoachTool('update_routine_weeks', { dayNames: { Pull: 'Back + Bis' }, weeks: [hdr] });
        const afterRenames = loads();
        // a one-day tweak: Push is sent in the owner's unit, Pull and Legs are left out
        const sent = _uW() === 'kg' ? 75 : 165;
        const push = getCustomRoutine().weeks[c].push.map((e, i) => ({ name: e.name, sets: e.sets, reps: e.reps, weight: i === 0 ? sent : wDisp(e.weight) }));
        const r3 = executeCoachTool('update_routine_weeks', { weeks: [Object.assign({ push }, hdr)] });
        const w = getCustomRoutine().weeks[c];
        const keptAfterTweak = ['pull', 'legs'].map(k => w[k].map(e => e.name + '=' + e.weight + (e.weights ? JSON.stringify(e.weights) : '')).join(',')).join(' | ');
        const keptBefore = before.split(' | ').slice(1).join(' | ');
        return { unit: _uW(), ok: [r1.ok, r2.ok, r3.ok], before, afterRenames, keptBefore, keptAfterTweak, bench: w.push[0].weight, benchDisp: fmtW(w.push[0].weight) };
      });
      assert(out.ok.every(Boolean), unit + ': every call saved: ' + JSON.stringify(out.ok));
      assert(out.afterRenames === out.before, unit + ': two renames leave every load as stored: ' + out.before + ' -> ' + out.afterRenames);
      assert(out.keptAfterTweak === out.keptBefore, unit + ': a Push tweak leaves Pull and Legs as stored: ' + out.keptBefore + ' -> ' + out.keptAfterTweak);
      if (unit === 'kg') assert(out.bench === 165.3 && /^75 kg$/.test(out.benchDisp), 'kg: the day that was sent is read in kg: ' + out.bench + ' / ' + out.benchDisp);
      else assert(out.bench === 165 && out.benchDisp === '165 lb', 'lb: the day that was sent is stored as sent: ' + out.bench);
      assert(app.errors.length === 0, unit + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('H13: the prompt says which logs it lists; the coach cannot log a saved run or activity twice', async () => {
  // 10 runs, two of them on the day of the cut; 12 activities.
  const runs = [], sports = [];
  [40, 30, 26, 22, 18, 14, 10, 6, 2].forEach((n, i) => runs.push({ id: 1780000000000 + i, date: iso(n), distance: 5 + i, time: (25 + i * 5) + ':00', type: 'easy', hr: 0, note: '' }));
  runs.push({ id: 1780000000100, date: iso(22), distance: 3, time: '15:00', type: 'easy', hr: 0, note: '' });
  for (let i = 0; i < 12; i++) sports.push({ id: 1789000000000 + i, date: iso(1 + i * 3), type: i % 2 ? 'Tennis' : 'Cycling', duration: 60, data: {}, notes: '' });
  const app = await boot({ native: true, seed: { kt_runs: JSON.stringify(runs), kt_sports: JSON.stringify(sports) } });
  try {
    const out = await app.page.evaluate(({ runs, sports }) => {
      const block = (p, head) => p.slice(p.indexOf(head), p.indexOf('\n\n', p.indexOf(head)));
      const p = buildSystemPrompt();
      const rb = block(p, 'LOGGED RUNS'), sb = block(p, 'LOGGED SPORT SESSIONS'), ss = block(p, 'RECENT SESSIONS');
      const listed = (b, list) => list.filter(x => b.indexOf('[id:' + x.id + ']') >= 0).map(x => x.id);
      const r = { rb, sb, ssHead: ss.split('\n')[0], runIds: listed(rb, runs), sportIds: listed(sb, sports), sessions: getSessions().length };
      // the coach is asked to log the oldest run (not listed) and an activity already saved
      const old = runs[0];
      r.dupRun = executeCoachTool('log_run', { distance: old.distance, time: old.time, date: old.date });
      r.dupRunPill = toolCallLabel({ name: 'log_run', input: { distance: old.distance, time: old.time }, result: r.dupRun });
      r.dupSport = executeCoachTool('log_sport', { type: 'cycling', duration: 55, date: sports[0].date });
      r.dupSportPill = toolCallLabel({ name: 'log_sport', input: { type: 'cycling', duration: 55 }, result: r.dupSport });
      r.counts1 = [getRuns().length, getSportLogs().length];
      // real second sessions still log: a different distance, a confirmed second run, another activity
      r.other = executeCoachTool('log_run', { distance: 12, time: '60:00', date: old.date }).ok;
      r.second = executeCoachTool('log_run', { distance: old.distance, time: old.time, date: old.date, separate: true }).ok;
      r.swim = executeCoachTool('log_sport', { type: 'Swimming', duration: 60, date: sports[0].date }).ok;
      r.counts2 = [getRuns().length, getSportLogs().length];
      // everything fits: no cut, and the plain rule
      lsSet('kt_runs', getRuns().slice(0, 3));
      r.allHead = block(buildSystemPrompt(), 'LOGGED RUNS');
      return r;
    }, { runs, sports });
    // runs: the 6 newest by date, plus the second run on the 6th one's day (iso(22))
    const want = runs.filter(x => x.date >= iso(22)).map(x => x.id).sort();
    assert(JSON.stringify(out.runIds.slice().sort()) === JSON.stringify(want), 'the newest runs by date are listed, ties included: ' + JSON.stringify(out.runIds));
    assert(out.rb.indexOf('the 7 most recent of 10 saved: every one from ' + iso(22) + ' on is listed') >= 0, 'the run list says what it holds: ' + out.rb.split('\n')[0]);
    assert(out.rb.indexOf('from ' + iso(22) + ' on is NOT in this list, it is NOT saved') >= 0 && out.rb.indexOf('A run from before ' + iso(22) + ' may already be saved') >= 0, 'the not-saved rule holds only from the cut: ' + out.rb.split('\n').slice(-1)[0]);
    assert(out.sportIds.length === 10 && out.sb.indexOf('the 10 most recent of 12 saved: every one from ' + iso(28) + ' on') >= 0, 'the activity list says what it holds: ' + out.sb.split('\n')[0]);
    assert(out.sessions <= 10 ? /RECENT SESSIONS \(all \d+ saved\)/.test(out.ssHead) : new RegExp('RECENT SESSIONS \\(the 1\\d most recent of ' + out.sessions + ' saved').test(out.ssHead), 'RECENT SESSIONS says what it holds: ' + out.ssHead);
    assert(out.dupRun.ok === false && out.dupRun.duplicate === runs[0].id && /Already saved/.test(out.dupRun.error), 'an older saved run is refused as a duplicate: ' + JSON.stringify(out.dupRun));
    assert(out.dupSport.ok === false && out.dupSport.duplicate === sports[0].id, 'a saved activity is refused as a duplicate: ' + JSON.stringify(out.dupSport));
    assert(/^Already logged/.test(out.dupRunPill) && /already logged/.test(out.dupSportPill), 'the pills say it was already there: ' + out.dupRunPill + ' / ' + out.dupSportPill);
    assert(out.counts1[0] === 10 && out.counts1[1] === 12, 'nothing was added: ' + out.counts1);
    assert(out.other && out.second && out.swim && out.counts2[0] === 12 && out.counts2[1] === 13, 'real second sessions still log: ' + JSON.stringify(out.counts2));
    assert(/LOGGED RUNS \(the ground truth: all 3 saved\)/.test(out.allHead) && /If a run the user mentions is NOT in this list, it is NOT saved/.test(out.allHead), 'a full list keeps the plain rule: ' + out.allHead);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M24: a programme built in the chat after "Start a new programme" starts on the next Monday', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const mock = eval(MOCK), r = {};
      const cr = getCustomRoutine(), c = currentWeek - 1;
      const weeks = cr.weeks.map(w => ({ wk: w.wk, bName: w.bName, bColor: w.bColor, push: w.push.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight })), pull: w.pull.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight })), legs: w.legs.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight })) }));
      // control: rewriting the running programme keeps its anchor
      localStorage.setItem('kt_week_monday', _mostRecentMonday());
      executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: cr.weeks[c].bName, bColor: cr.weeks[c].bColor }] });
      r.keptAnchor = localStorage.getItem('kt_week_monday') === _mostRecentMonday() && currentWeek === c + 1;
      // Settings › Start a new programme › Archive & start fresh, then the coach builds one in the chat
      startNewProgramme(); await wait(10);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
      r.archived = !hasCustomRoutine() && !intakeMode;
      mock([{ content: [{ type: 'text', text: 'Building it now.' }, { type: 'tool_use', id: 't1', name: 'update_routine_weeks', input: { weekPlan: ['Push', 'Run', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'], weeks } }], stop_reason: 'tool_use', usage: {} },
            { content: [{ type: 'text', text: 'Your new programme is ready.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages = [{ role: 'user', content: 'Build me a new 12-week push/pull/legs programme' }];
      await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      const tool = (coachMessages[coachMessages.length - 1]._tools || [])[0] || {};
      r.built = { weeks: getTotalWeeks(), week: currentWeek, anchor: localStorage.getItem('kt_week_monday'), want: _nextMonday(todayISO()),
        plateau: lsGet('kt_last_plateau_week'), prog: lsGet('kt_last_prog_week'), msg: tool.result && tool.result.message };
      // the coming Monday: the week moves only if today is already a Monday (a week has passed)
      const RealDate = Date, mon = _nextMonday(addDays(todayISO(), 1));
      const shift = new RealDate(mon + 'T09:00:00').getTime() - RealDate.now();
      window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + shift); } static now() { return RealDate.now() + shift; } };
      try { autoAdvanceWeek(); r.monday = { week: currentWeek, want: r.built.anchor === mon ? 1 : 2 }; } finally { window.Date = RealDate; }
      return r;
    }, MOCK);
    assert(out.keptAnchor, 'a rewrite of the running programme does not re-anchor it');
    assert(out.archived, 'the old programme was archived');
    assert(out.built.weeks === 12 && out.built.week === 1 && out.built.anchor === out.built.want, 'week 1 starts on the next Monday: ' + JSON.stringify(out.built));
    assert(out.built.plateau === 1 && out.built.prog === 1, 'the weekly cards are re-armed for week 1: ' + JSON.stringify(out.built));
    assert(/a new programme: week 1 starts (today|Monday \d{4}-\d{2}-\d{2})/.test(out.built.msg || ''), 'the coach is told when it starts: ' + out.built.msg);
    assert(out.monday.week === out.monday.want, 'the coming Monday reads the right week: ' + JSON.stringify(out.monday));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M52: Today\'s coach card follows the plan: coach rewrite, Restore, week changes, a Routines undo', async () => {
  for (const keyed of [true, false]) {
    const seed = { kt_coach_msgs: '[]' };
    if (keyed) seed.kt_apikey = 'sk-test';
    const app = await boot({ native: true, seed });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const r = {}, c = currentWeek - 1, wk = currentWeek;
        // every day is Push, so today is a lift day whatever the weekday
        const cr0 = getCustomRoutine(); cr0.weekPlan = ['Push', 'Push', 'Push', 'Push', 'Push', 'Push', 'Push']; cr0.weeks.forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr0);
        let calls = 0;
        window.fetch = async (url, opts) => {   // the card quotes the main lift it was sent
          calls++;
          const t = JSON.parse(JSON.parse(opts.body).messages[0].content.match(/Today: (.*)\n/)[1]);
          return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ message: t.mainLift.name + ' at ' + t.mainLift.weight + ' ' + t.mainLift.unit + ' today.', actions: [{ label: 'Got it', primary: false }, { label: 'Adjust', primary: true }] }) }] }), { status: 200 });
        };
        // the keyless card's progression / plateau lines depend on how old the demo logs are
        window._progressionLifts = () => []; window._plateauLifts = () => [];
        const card = async () => { switchTab('log'); logSubTab = 'workout'; render(); await wait(120); render(); await wait(60); const m = (coachCard && coachCard.message) || ''; const x = m.match(/(\d+(?:\.\d+)?) lb/); return x ? parseFloat(x[1]) : m; };
        const main = () => getWkData().push[0].weight;
        invalidateCoachCard(); coachCard = null; coachCardDismissed = false;
        r.first = [main(), await card()];
        // a cold boot with nothing changed reads the cached card; one cached for another plan is not served
        const n0 = calls; coachCard = null; loadCoachCardForToday(); r.coldCached = [!!coachCard, calls === n0];
        const w = getCustomRoutine().weeks[c];
        executeCoachTool('update_routine_weeks', { weeks: [{ wk, bName: w.bName, bColor: w.bColor, push: w.push.map((e, i) => ({ name: e.name, sets: e.sets, reps: e.reps, weight: i === 0 ? e.weight + 30 : e.weight, isMain: !!e.isMain })) }] });
        r.rewrite = [main(), await card()];
        restoreRoutineBackup(); await wait(10);
        document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
        r.restore = [main(), await card()];
        r.staleCache = loadCachedCoachCard() === null || loadCachedCoachCard().message.indexOf(String(main())) >= 0;
        executeCoachTool('set_current_week', { week: wk + 1 });
        r.setWeek = [main(), await card()];
        adjustWeek(-1);
        r.stepper = [main(), await card()];
        _commitRoutine(cr => _progCarryLoad(cr, 'push', cr.weeks[c].push[0].name, c, cr.weeks[c].push[0].weight + 10, { markOwner: true }), { scope: 'spec-104', undoLabel: 'Bench updated' });
        r.commit = [main(), await card()];
        document.querySelector('.kt-toast-undo').click();
        r.undo = [main(), await card()];
        r.calls = calls;
        return r;
      });
      const tag = keyed ? 'with a key' : 'keyless';
      ['first', 'rewrite', 'restore', 'setWeek', 'stepper', 'commit', 'undo'].forEach(k => {
        assert(out[k][0] === out[k][1], tag + ': after ' + k + ' the card quotes today\'s load: ' + JSON.stringify(out));
      });
      assert(out.rewrite[0] !== out.first[0] && out.setWeek[0] !== out.stepper[0] && out.commit[0] !== out.undo[0], tag + ': the plan really changed: ' + JSON.stringify(out));
      assert(out.staleCache, tag + ': a card cached for the replaced plan is not served');
      if (keyed) assert(out.coldCached[0] && out.coldCached[1] && out.calls === 7, 'with a key: one fetch per plan, none on a cold boot that changed nothing: ' + JSON.stringify([out.coldCached, out.calls]));
      assert(app.errors.length === 0, tag + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('M53: the morning card sends a kg owner\'s sessions in kg, set by set', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg', kt_apikey: 'sk-test' } });
  try {
    const out = await app.page.evaluate(async () => {
      // a runner-shaped session yesterday (top set 75 kg, back-offs 70) and a legacy-shaped one
      // (nested sets[], an old backup or import) the day before
      const s = getSessions().slice();
      s.push({ id: 900001, date: addDays(todayISO(), -1), type: 'Push', week: currentWeek, exercises: [
        { name: 'Bench Press', isMain: true, ss: false, sets: 3, reps: [5, 8, 8], weight: wStore(75), weightLog: [wStore(75), wStore(70), wStore(70)], rpe: 8, rpeLog: [8, 8, 8] }] });
      s.push({ id: 900002, date: addDays(todayISO(), -2), type: 'Pull', week: currentWeek, exercises: [
        { name: 'Barbell Row', sets: [{ reps: 8, weight: wStore(60), rpe: 8 }, { reps: 8, weight: wStore(60), rpe: 8 }] }] });
      lsSet('kt_sessions', s);
      invalidateCoachCard();
      let body = null;
      window.fetch = async (url, opts) => { body = JSON.parse(opts.body).messages[0].content; return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"message":"ok","actions":[{"label":"a","primary":false},{"label":"b","primary":true}]}' }] }), { status: 200 }); };
      await fetchCoachCard(getTodayActivity());
      const recent = JSON.parse(body.match(/Last 5 sessions: (.*)\n/)[1]);
      return { ids: recent.map(x => x.id), units: recent.map(x => x.unit), bench: recent[0].exercises[0], row: recent[1].exercises[0] };
    });
    assert(out.ids[0] === 900001 && out.ids[1] === 900002, 'the two newest sessions are sent: ' + JSON.stringify(out.ids));
    assert(out.units.every(u => u === 'kg'), 'every session is labelled kg');
    assert(out.bench.weight === 75 && JSON.stringify(out.bench.weightLog) === '[75,70,70]', 'the per-set loads are kg: ' + JSON.stringify(out.bench));
    assert(out.row.sets.every(st => st.weight === 60 && st.reps === 8), 'the legacy sets are kg: ' + JSON.stringify(out.row));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M54: the debrief prompt reads every set of either session shape, in the owner\'s unit', async () => {
  for (const unit of ['lb', 'kg']) {
    const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_unit_w: unit } });
    try {
      const out = await app.page.evaluate(async () => {
        const kg = _uW() === 'kg';
        setDayName('Push', 'Chest + Tris');
        // yesterday's Push in the legacy nested shape (an import, an old backup, the demo), then
        // today's in the runner's shape: a top set and two back-offs
        const s = getSessions().slice();
        s.push({ id: 900010, date: addDays(todayISO(), -1), type: 'Push', week: currentWeek, exercises: [
          { name: 'Bench Press', sets: [8, 8, 8, 8].map(reps => ({ reps, weight: wStore(kg ? 72.5 : 160), rpe: 9 })) }] });
        const sess = { id: 900011, date: todayISO(), type: 'Push', week: currentWeek, prs: [], exercises: [
          { name: 'Bench Press', isMain: true, ss: false, sets: 3, reps: [5, 8, 8], weight: wStore(kg ? 80 : 175), weightLog: [wStore(kg ? 80 : 175), wStore(kg ? 70 : 155), wStore(kg ? 70 : 155)], rpe: 8, rpeLog: [8, 8, 9] }] };
        s.push(sess); lsSet('kt_sessions', s);
        let body = '';
        window.fetch = async (url, opts) => { body = JSON.parse(opts.body).messages[0].content; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 }); };
        _requestDebrief(sess);
        await new Promise(res => setTimeout(res, 50));
        return { kg, yday: addDays(todayISO(), -1), session: (body.match(/Session: [^\n]*/) || [''])[0], prev: (body.match(/Previous [^\n]*/) || [''])[0], named: /just-finished Chest \+ Tris session/.test(body) };
      });
      const u = out.kg ? 'kg' : 'lb';
      assert(out.session === 'Session: Bench Press 3×[5,8,8] @ ' + (out.kg ? '80/70/70' : '175/155/155') + ' ' + u + ' RPE 8', u + ': today\'s back-off sets keep their own loads: ' + out.session);
      assert(out.prev.indexOf('Previous Chest + Tris (' + out.yday + '): Bench Press 4×[8,8,8,8] @ ' + (out.kg ? '72.5 kg' : '160 lb') + ' RPE 9') === 0, u + ': the legacy session reads as logged: ' + out.prev);
      assert(!/object Object|undefined/.test(out.prev), u + ': nothing unreadable: ' + out.prev);
      assert(out.named, u + ': the day goes by its name');
      assert(app.errors.length === 0, u + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('L35: the coach chips read today and yesterday on the local calendar and name the day', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const cdp = await app.page.context().newCDPSession(app.page);
    const clock = {};
    // west of UTC (a session read as UTC midnight turned into yesterday's at 20:00) and east of it
    for (const tz of ['America/Puerto_Rico', 'Asia/Tokyo']) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: tz });
      clock[tz] = await app.page.evaluate(() => {
        const RealDate = Date, r = {}, day = todayISO();
        const at = (t) => { const shift = new RealDate(day + 'T' + t + ':00').getTime() - RealDate.now(); window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + shift); } static now() { return RealDate.now() + shift; } }; };
        const chipFor = (n) => { const s = getSessions().filter(x => x.id !== 900020); s.push({ id: 900020, date: addDays(todayISO(), -n), type: 'Push', week: currentWeek, exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 165, weightLog: [165, 165, 165] }] }); lsSet('kt_sessions', s); return getCoachChips()[0]; };
        try {
          for (const t of ['08:00', '20:30', '23:30']) { at(t); r[t] = [chipFor(0), chipFor(1), chipFor(2)]; }
        } finally { window.Date = RealDate; }
        return r;
      });
    }
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' }).catch(() => {});
    const named = await app.page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const s = getSessions().filter(x => x.id !== 900020);
      s.push({ id: 900020, date: todayISO(), type: 'Push', week: currentWeek, exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 165, weightLog: [165, 165, 165] }] });
      lsSet('kt_sessions', s);
      setDayName('Push', 'Chest + Tris');
      const r = { plain: getCoachChips()[0] };
      // quotes, markup and an ampersand in the name (R11: carried as written)
      setDayName('Push', 'Mike\'s "A" <Day> & Co');
      r.odd = getCoachChips()[0];
      const sent = [];
      window.sendCoachMessage = () => { sent.push(document.getElementById('coach-input').value); };
      coachMessages = []; currentTab = 'coach'; coachView = 'chat'; render(); await wait(30);
      const chips = getCoachChips();
      const btns = [...document.querySelectorAll('#screen button')].filter(b => chips.indexOf(b.textContent) >= 0);
      r.rendered = btns.map(b => b.textContent);
      const first = btns.find(b => b.textContent === r.odd);
      if (first) first.click();
      r.sent = sent;
      return r;
    });
    for (const tz of Object.keys(clock)) {
      for (const t of Object.keys(clock[tz])) {
        const [today, yday, older] = clock[tz][t];
        assert(today === 'How did my Push session look?', tz + ' ' + t + ': today\'s session is today\'s: ' + today);
        assert(yday === 'Recovery tips after yesterday\'s Push?', tz + ' ' + t + ': yesterday\'s session is yesterday\'s: ' + yday);
        assert(!/Push/.test(older), tz + ' ' + t + ': an older session has no chip: ' + older);
      }
    }
    assert(named.plain === 'How did my Chest + Tris session look?', 'the chip names the day: ' + named.plain);
    assert(named.odd === 'How did my Mike\'s "A" <Day> & Co session look?', 'the chip carries the name as written (R11): ' + named.odd);
    assert(named.rendered[0] === named.odd && named.sent.length === 1 && named.sent[0] === named.odd, 'the chip renders and sends what it says: ' + JSON.stringify(named));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L36: THIS WEEK\'S PLAN prints a top set and its back-offs, in the coach\'s original too', async () => {
  for (const unit of ['lb', 'kg']) {
    const app = await boot({ native: true, seed: { kt_unit_w: unit } });
    try {
      const out = await app.page.evaluate(() => {
        const c = currentWeek - 1, wk = currentWeek, w = getCustomRoutine().weeks[c], kg = _uW() === 'kg';
        const top = w.push[0].name, acc = w.push[1].name, acc1 = wDisp(w.push[1].weight);
        const line = (n) => (buildSystemPrompt().match(new RegExp('\\n  ' + n + ': [^\\n]*')) || [''])[0].trim();
        // the coach writes a top set with back-offs, and an accessory with the same load every set
        const push = w.push.map((e, i) => i === 0 ? { name: top, sets: 3, reps: [3, 8, 8], weight: kg ? 100 : 225, weights: kg ? [100, 85, 85] : [225, 185, 185], rpe: 8, isMain: true }
          : i === 1 ? { name: acc, sets: 3, reps: [10, 10, 10], weight: acc1, weights: [acc1, acc1, acc1], rpe: 8 }
          : { name: e.name, sets: e.sets, reps: e.reps, weight: wDisp(e.weight) });
        const ok = executeCoachTool('update_routine_weeks', { weeks: [{ wk, bName: w.bName, bColor: w.bColor, push }] }).ok;
        const r = { kg, ok, acc1, split: line(top), uniform: line(acc) };
        // the owner sets the top set for this week on (the back-offs keep their share): the mark
        // quotes the coach's sets
        _commitRoutine(cr => _progCarryLoad(cr, 'push', top, c, wStore(kg ? 95 : 205), { markOwner: true }), { scope: 'spec-104-l36' });
        r.edited = line(top);
        return r;
      });
      const u = out.kg ? 'kg' : 'lb';
      assert(out.ok, u + ': the coach\'s week saved');
      assert(out.split === 'Bench Press: 3×3,8,8 @ ' + (out.kg ? '100/85/85' : '225/185/185') + ' ' + u + ' RPE8 (main)', u + ': each set\'s load: ' + out.split);
      assert(out.uniform.indexOf(' @ ' + out.acc1 + ' ' + u + ' RPE') > 0, u + ': one load when every set shares it: ' + out.uniform);
      assert(out.edited.indexOf('Bench Press: 3×3,8,8 @ ' + (out.kg ? '95/' : '205/')) === 0 && out.edited.indexOf('[edited by the user; you had 3×3,8,8 @ ' + (out.kg ? '100/85/85' : '225/185/185') + ' ' + u + ']') > 0, u + ': the coach\'s original keeps its back-offs: ' + out.edited);
      assert(app.errors.length === 0, u + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('L39: text from separate tool rounds is separate paragraphs; a cut-off reply carries on', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const mock = eval(MOCK), r = {};
      const turn = async (replies, ask) => { mock(replies); coachMessages.push({ role: 'user', content: ask }); await runCoachTurn('sys', 'claude-haiku-4-5', 512); return coachMessages[coachMessages.length - 1].content; };
      r.plain = await turn([{ content: [{ type: 'text', text: 'On it.' }, { type: 'tool_use', id: 't1', name: 'set_bench_goal', input: { weight: 250 } }], stop_reason: 'tool_use', usage: {} },
        { content: [{ type: 'text', text: 'Your bench goal is 250 lb.' }], stop_reason: 'end_turn', usage: {} }], 'Set my bench goal to 250');
      r.cut = await turn([{ content: [{ type: 'text', text: 'Your squat has climbed for three wee' }], stop_reason: 'max_tokens', usage: {} },
        { content: [{ type: 'text', text: 'ks straight, so hold the load this week.' }], stop_reason: 'end_turn', usage: {} }], 'How is my squat?');
      // a structured answer written after a tool round
      r.blocks = await turn([{ content: [{ type: 'text', text: 'Logging that run now.' }, { type: 'tool_use', id: 't2', name: 'log_run', input: { distance: 5, time: '25:00' } }], stop_reason: 'tool_use', usage: {} },
        { content: [{ type: 'text', text: '%%type: Run analysis\n%%metric: Distance | 5 km\nSolid steady effort.' }], stop_reason: 'end_turn', usage: {} }], 'I ran 5k in 25:00, log it');
      currentTab = 'coach'; coachView = 'chat'; render(); await wait(30);
      const screen = document.getElementById('screen');
      r.eyebrows = [...screen.querySelectorAll('.kt-cmb-eyebrow')].map(e => e.textContent);
      r.raw = screen.textContent.indexOf('%%') >= 0;
      return r;
    }, MOCK);
    assert(out.plain === 'On it.\n\nYour bench goal is 250 lb.', 'two rounds, two paragraphs: ' + JSON.stringify(out.plain));
    assert(out.cut === 'Your squat has climbed for three weeks straight, so hold the load this week.', 'a reply cut off at max_tokens carries on mid-word: ' + JSON.stringify(out.cut));
    assert(out.blocks.indexOf('Logging that run now.\n\n%%type: Run analysis') === 0, 'the %% block starts its own line: ' + JSON.stringify(out.blocks));
    assert(out.eyebrows.indexOf('COACH · Run analysis') >= 0 && !out.raw, 'the structured answer renders, no raw markers: ' + JSON.stringify(out.eyebrows));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L40: pills and PLAN CHANGES say what was saved: a day swap, a cadence change, a part-saved call, a named day', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const mock = eval(MOCK), r = {}, c = currentWeek - 1, wk = currentWeek;
      let n = 0;
      const turn = async (ask, tools) => {
        mock([{ content: tools.map(t => ({ type: 'tool_use', id: 'l40-' + (n++), name: t.name, input: t.input })), stop_reason: 'tool_use', usage: {} },
          { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
        coachMessages.push({ role: 'user', content: ask });
        await runCoachTurn('sys', 'claude-haiku-4-5', 512);
        currentTab = 'coach'; coachView = 'chat'; render(); await wait(20);
        const pills = [...document.querySelectorAll('#screen span')].map(s => s.textContent.trim()).filter(t => /^[✓✕] /.test(t));
        const led = document.querySelector('.kt-ledger-card');
        return { pill: pills[pills.length - 1], rows: led ? [...led.querySelectorAll('.kt-ledger-row')].map(x => x.textContent) : [], undo: !!(led && [...led.querySelectorAll('button')].some(b => b.textContent === 'Undo')) };
      };
      r.swap = await turn('do pull tomorrow and push today', [{ name: 'swap_cadence_days', input: { dayA: 'Wed', dayB: 'Thu' } }]);
      // the coach changes the cadence and sends a past week's header with it
      const w1 = getCustomRoutine().weeks[0];
      r.cadence = await turn('train legs on Fridays', [{ name: 'update_routine_weeks', input: { weekPlan: ['Push', 'Run', 'Pull', 'Rest', 'Legs', 'Run', 'Rest'], weeks: [{ wk: 1, bName: w1.bName, bColor: w1.bColor }] } }]);
      r.planSaved = getCustomRoutine().weekPlan.join(',') === 'Push,Run,Pull,Rest,Legs,Run,Rest';
      // this week is saved, then a week past the end fails
      const w = getCustomRoutine().weeks[c], before = w.push[0].sets + 'x' + w.push[0].reps, gap = getTotalWeeks() + 3;
      r.gap = gap;
      r.part = await turn('rewrite this week and a later one', [{ name: 'update_routine_weeks', input: { weeks: [{ wk, bName: w.bName, bColor: w.bColor, push: [{ name: w.push[0].name, sets: 5, reps: 5, weight: 185, isMain: true }] }, { wk: gap, bName: 'X', bColor: '#000000', push: [] }] } }]);
      r.partSaved = getCustomRoutine().weeks[c].push.length === 1 && getCustomRoutine().weeks[c].push[0].sets === 5;
      [...document.querySelectorAll('.kt-ledger-card button')].find(b => b.textContent === 'Undo').click(); await wait(10);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
      const back = getCustomRoutine().weeks[c].push[0];
      r.undone = back.sets + 'x' + back.reps === before && getCustomRoutine().weeks[c].push.length > 1;
      // a call that fails before saving anything
      r.none = await turn('rewrite this week', [{ name: 'update_routine_weeks', input: { weeks: [{ wk, bName: '', bColor: '' }] } }]);
      setDayName('Push', 'Chest + Tris');
      r.logged = await turn('log my chest day', [{ name: 'log_session', input: { type: 'Push', date: addDays(todayISO(), -1), exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 165 }] } }]);
      r.yday = addDays(todayISO(), -1); r.wk = wk;
      return r;
    }, MOCK);
    assert(out.swap.pill === '✓ Wed ⇄ Thu · this week' && out.swap.rows.length === 1 && out.swap.undo, 'a day swap is named: ' + JSON.stringify(out.swap));
    assert(out.planSaved && out.cadence.pill === '✓ Weekly cadence updated' && out.cadence.rows[0] === 'Weekly cadencechanged' && out.cadence.undo, 'a cadence change is named and can be undone: ' + JSON.stringify(out.cadence));
    assert(out.partSaved && out.part.pill === '✕ Week ' + out.wk + ' updated · week ' + out.gap + ' not saved', 'a part-saved call says what it saved: ' + JSON.stringify(out.part));
    assert(out.part.rows[0] === 'Week ' + out.wk + 'rewritten' && out.part.undo && out.undone, 'and its card undoes it: ' + JSON.stringify(out.part) + ' undone ' + out.undone);
    assert(out.none.pill === '✕ No weeks changed' && !out.none.rows.length, 'a call that saved nothing says so, with no card: ' + JSON.stringify(out.none));
    assert(out.logged.pill === '✓ Chest + Tris logged · ' + out.yday, 'a logged session goes by its day\'s name: ' + out.logged.pill);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L10: set_exercise_weight saves under the programme\'s spelling, whatever the casing', async () => {
  const app = await boot({ native: true, seed: { kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      // Face Pull as a "your load" row: Today shows the working weight saved under its name
      const cr = getCustomRoutine();
      cr.weeks.forEach(w => { (w.pull || []).forEach(e => { if (e.name === 'Face Pull') e.weight = 0; }); });
      setCustomRoutine(cr);
      const today = () => (_todayLiftExercises('Pull').find(e => e.name === 'Face Pull') || {}).weight;
      const keys = (re) => Object.keys(getWeights()).filter(k => re.test(k)).map(k => k + '=' + getWeights()[k]);
      r.before = today();
      r.face = executeCoachTool('set_exercise_weight', { name: 'face pull', weight: 40 });
      r.faceToday = today(); r.faceKeys = keys(/^face pull$/i);
      // a stray casing saved earlier folds into the programme's key
      const w = getWeights(); w['bench press'] = 150; lsSet('kt_weights', w);
      r.bench = executeCoachTool('set_exercise_weight', { name: 'BENCH PRESS', weight: 170 });
      r.benchKeys = keys(/^bench press$/i);
      // a library lift the programme does not hold, and a name nothing knows
      r.hip = executeCoachTool('set_exercise_weight', { name: 'hip thrust', weight: 200 }).message;
      r.odd = executeCoachTool('set_exercise_weight', { name: 'zercher carry deluxe', weight: 100 }).message;
      return r;
    });
    assert(!(out.before > 0) && out.face.ok && out.face.message === 'Face Pull = 40 lb', 'the coach is told the lift it set: ' + JSON.stringify(out.face));
    assert(out.faceToday === 40 && JSON.stringify(out.faceKeys) === '["Face Pull=40"]', 'Today shows it, under one key: ' + out.faceToday + ' ' + JSON.stringify(out.faceKeys));
    assert(out.bench.ok && JSON.stringify(out.benchKeys) === '["Bench Press=170"]', 'a stray casing folds into the programme\'s key: ' + JSON.stringify(out.benchKeys));
    assert(out.hip === 'Hip Thrust = 200 lb' && out.odd === 'zercher carry deluxe = 100 lb', 'the library\'s spelling, else the name as given: ' + out.hip + ' / ' + out.odd);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// A relaunch that keeps what the app saved: the harness re-seeds localStorage on every load, so
// the storage is carried across the reload in sessionStorage and put back after the seed.
const KEEP_STORAGE = () => { try { const s = sessionStorage.getItem('__ls'); if (s) { const o = JSON.parse(s); localStorage.clear(); Object.keys(o).forEach(k => localStorage.setItem(k, o[k])); sessionStorage.removeItem('__ls'); } } catch (e) {} };
async function relaunch(app) {
  await app.page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } sessionStorage.setItem('__ls', JSON.stringify(o)); });
  await app.page.reload({ waitUntil: 'load' });
  await app.page.waitForFunction(() => typeof window.render === 'function');
}

// R09: L40's pill and card for a cadence change lasted only until the app was closed.
run('R09: a coach cadence change keeps its pill, its PLAN CHANGES card and Undo after a relaunch', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  await app.page.addInitScript(KEEP_STORAGE);
  const PLAN = ['Push', 'Run', 'Pull', 'Rest', 'Legs', 'Run', 'Rest'];
  const turn = (input) => app.page.evaluate(async ({ MOCK, input }) => {
    eval(MOCK)([{ content: [{ type: 'tool_use', id: 'r09-' + coachMessages.length, name: 'update_routine_weeks', input }], stop_reason: 'tool_use', usage: {} },
      { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
    coachMessages.push({ role: 'user', content: 'change my week' });
    await runCoachTurn('sys', 'claude-haiku-4-5', 512);
  }, { MOCK, input });
  const chat = () => app.page.evaluate(async () => {
    currentTab = 'coach'; coachView = 'chat'; render(); await new Promise((res) => setTimeout(res, 20));
    const pills = [...document.querySelectorAll('#screen span')].map(s => s.textContent.trim()).filter(t => /^[✓✕] /.test(t));
    const led = document.querySelector('.kt-ledger-card');
    return { pill: pills[pills.length - 1], rows: led ? [...led.querySelectorAll('.kt-ledger-row')].map(x => x.textContent).join('|') : '', undo: !!(led && [...led.querySelectorAll('button')].some(b => b.textContent === 'Undo')), plan: getCustomRoutine().weekPlan.join(',') };
  });
  try {
    const s = await app.page.evaluate(() => { const w1 = getCustomRoutine().weeks[0], w = getCustomRoutine().weeks[currentWeek - 1];
      return { wk: currentWeek, plan0: getCustomRoutine().weekPlan.join(','), past: { wk: 1, bName: w1.bName, bColor: w1.bColor }, now: { wk: currentWeek, bName: w.bName, bColor: w.bColor } }; });
    assert(s.wk > 1 && s.plan0 !== PLAN.join(','), 'week 1 is behind us and the cadence will change: ' + JSON.stringify(s));
    const want = JSON.stringify({ pill: '✓ Weekly cadence updated', rows: 'Weekly cadencechanged', undo: true, plan: PLAN.join(',') });
    // the coach changes only the cadence (sending a past week's header with it)
    await turn({ weekPlan: PLAN, weeks: [s.past] });
    const inSession = await chat();
    await relaunch(app);
    const relaunched = await chat();
    assert(JSON.stringify(inSession) === want, 'in the session: ' + JSON.stringify(inSession));
    assert(JSON.stringify(relaunched) === want, 'after a relaunch it keeps its pill, card and Undo: ' + JSON.stringify(relaunched));
    // the same answer stored by a page from before the flag
    await app.page.evaluate(() => { const m = JSON.parse(localStorage.getItem('kt_coach_msgs')); m.forEach(x => (x._tools || []).forEach(t => { delete t.result.cadenceSaved; })); localStorage.setItem('kt_coach_msgs', JSON.stringify(m)); });
    await relaunch(app);
    const older = await chat();
    assert(JSON.stringify(older) === want, 'one stored before the flag reads the same: ' + JSON.stringify(older));
    // its Undo still puts the old cadence back
    await app.page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      [...document.querySelectorAll('.kt-ledger-card button')].find(b => b.textContent === 'Undo').click(); await wait(10);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
    });
    const undone = await app.page.evaluate(() => getCustomRoutine().weekPlan.join(','));
    assert(undone === s.plan0, 'Undo after the relaunch restores the cadence: ' + undone);
    // the cadence is saved, then a week fails
    await turn({ weekPlan: PLAN, weeks: [{ wk: s.wk, bName: '', bColor: '' }] });
    await relaunch(app);
    const part = await chat();
    assert(part.pill === '✕ Weekly cadence updated · week ' + s.wk + ' not saved' && part.rows === 'Weekly cadencechanged' && part.undo, 'a call that saved the cadence and then failed keeps its card: ' + JSON.stringify(part));
    // this week and the cadence together
    await turn({ weekPlan: ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Run', 'Rest'], weeks: [s.now] });
    await relaunch(app);
    const both = await chat();
    assert(both.pill === '✓ Week ' + s.wk + ' and the weekly cadence updated' && both.rows === 'Week ' + s.wk + 'rewritten|Weekly cadencechanged' && both.undo, 'a week with the cadence keeps both rows: ' + JSON.stringify(both));
    // a call that saved nothing still says so
    await turn({ weeks: [{ wk: s.wk, bName: '', bColor: '' }] });
    await relaunch(app);
    const none = await chat();
    assert(none.pill === '✕ No weeks changed' && none.rows === '' && !none.undo, 'a call that saved nothing has no card: ' + JSON.stringify(none));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R11: L35 mangled the owner's day name in the chip ("Kalanis Push + Pull").
run('R11: the coach chip names the day exactly as the owner wrote it, and nothing in the name runs', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const r = [];
      const sent = [];
      window.sendCoachMessage = () => { sent.push(document.getElementById('coach-input').value); };
      // today's session, then yesterday's: each chip names the day
      for (const [n, name] of [[0, 'Kalani\'s Push & Pull'], [1, '"Big" <i>One</i> `x` \\']]) {
        const s = getSessions().filter(x => x.id !== 900030);
        s.push({ id: 900030, date: addDays(todayISO(), -n), type: 'Push', week: currentWeek, exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 165, weightLog: [165, 165, 165] }] });
        lsSet('kt_sessions', s);
        setDayName('Push', name);
        coachMessages = []; currentTab = 'coach'; coachView = 'chat'; render(); await wait(30);
        const chip = getCoachChips()[0];
        const btn = [...document.querySelectorAll('#screen button[data-msg]')].find(b => b.dataset.msg === chip);
        const at = sent.length;
        if (btn) btn.click();
        r.push({ name: _dayLabel('Push'), chip, label: btn && btn.textContent, markup: !!(btn && btn.querySelector('i')), sent: sent.slice(at) });
      }
      return r;
    });
    const [today, yday] = out;
    assert(today.name === 'Kalani\'s Push & Pull' && today.chip === 'How did my Kalani\'s Push & Pull session look?', 'today\'s chip keeps the apostrophe and the ampersand: ' + JSON.stringify(today));
    assert(yday.name === '"Big" <i>One</i> `x` \\' && yday.chip === 'Recovery tips after yesterday\'s "Big" <i>One</i> `x` \\?', 'yesterday\'s chip keeps quotes, brackets and backslashes: ' + JSON.stringify(yday));
    out.forEach((c) => {
      assert(c.label === c.chip && !c.markup, 'the chip shows the name as text: ' + JSON.stringify(c));
      assert(c.sent.length === 1 && c.sent[0] === c.chip, 'a tap sends what the chip says: ' + JSON.stringify(c));
    });
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R12: H13 refused a saved run or activity in code, but a lift session only by the prompt's words.
run('R12: the coach cannot log a saved lift session twice; a real second session still logs', async () => {
  for (const unit of ['lb', 'kg']) {
    const app = await boot({ native: true, seed: { kt_unit_w: unit, kt_coach_msgs: '[]' } });
    try {
      const out = await app.page.evaluate(() => {
        const r = {}, n = () => getSessions().length, n0 = n();
        // the oldest saved session: RECENT SESSIONS lists only the newest
        const old = getSessions().slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id)[0];
        r.listed = buildSystemPrompt().indexOf('[id:' + old.id + ']') >= 0;
        const told = old.exercises.map(e => { const ps = _exPairs(e); return { name: e.name, sets: ps.length, reps: ps.map(x => x[0]), weight: wDisp(Math.max.apply(null, ps.map(x => x[1]))) }; });
        const e0 = old.exercises[0], ps0 = _exPairs(e0);
        r.want = { id: old.id, pill: _dayLabel(old.type) + ' already logged · ' + old.date, saved: e0.name + ' ' + ps0.length + '×(' + ps0.map(x => x[0]).join('/') + ')@' + _exLoadText(e0, ps0) };
        r.dup = executeCoachTool('log_session', { type: old.type, date: old.date, exercises: told });
        r.pill = toolCallLabel({ name: 'log_session', input: { type: old.type, date: old.date }, result: r.dup });
        // the same session told with other numbers (one lift, any case, another load) is a fix
        r.fix = executeCoachTool('log_session', { type: old.type, date: old.date, exercises: [{ name: told[0].name.toUpperCase(), sets: 2, reps: 5, weight: told[0].weight + 10 }] });
        r.added0 = n() - n0;
        // real second sessions still log: confirmed, other lifts that day, another day slot
        r.second = executeCoachTool('log_session', { type: old.type, date: old.date, exercises: told, separate: true }).ok;
        r.extra = executeCoachTool('log_session', { type: old.type, date: old.date, exercises: [{ name: 'Zercher Carry', sets: 2, reps: 20, weight: 0 }] }).ok;
        r.otherSlot = executeCoachTool('log_session', { type: LIFT_TYPES.find(t => t !== old.type), date: old.date, exercises: [told[0]] }).ok;
        r.added1 = n() - n0;
        r.schema = !!(_cachedCoachTools().find(t => t.name === 'log_session') || { input_schema: { properties: {} } }).input_schema.properties.separate;
        return r;
      });
      assert(!out.listed, unit + ': the oldest session is not in the prompt\'s list');
      assert(out.dup.ok === false && out.dup.duplicate === out.want.id && out.dup.error.indexOf('Already saved: [id:' + out.want.id + ']') === 0, unit + ': a saved session is refused as a duplicate: ' + JSON.stringify(out.dup));
      assert(out.dup.error.indexOf(out.want.saved) > 0 && out.want.saved.indexOf(' ' + unit) > 0, unit + ': the coach is shown what is saved, in the owner\'s unit: ' + out.want.saved + ' / ' + out.dup.error);
      assert(/edit_session/.test(out.dup.error) && /separate:true/.test(out.dup.error), unit + ': and told how to fix it or log a real second one: ' + out.dup.error);
      assert(out.pill === out.want.pill, unit + ': the pill says it was already there: ' + out.pill);
      assert(out.fix.ok === false && out.fix.duplicate === out.want.id && out.added0 === 0, unit + ': the same session with other numbers is refused too, nothing saved: ' + JSON.stringify([out.fix, out.added0]));
      assert(out.second && out.extra && out.otherSlot && out.added1 === 3, unit + ': real second sessions still log: ' + JSON.stringify(out));
      assert(out.schema, unit + ': the tool offers separate');
      assert(app.errors.length === 0, unit + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// T08 (hunt 5): R12 refused a session told again with a lift the saved one lacks ("I also did
// overhead press in that session", the model re-sending the whole session; an older, unlisted
// session told with a lift it never had) and told the coach to say it was already logged: the new
// lift was dropped and never named, and edit_session cannot add a lift. The refusal names it as not
// saved, the pill says so, and log_session's add_to puts only the lifts a saved session lacks into
// it (its date and day; records, working weights and the stamp as a log of that day).
run('T08: a re-told session with a lift the saved one lacks names it; add_to puts it into that session', async () => {
  for (const unit of ['lb', 'kg']) {
    const app = await boot({ native: true, seed: { kt_unit_w: unit, kt_apikey: 'sk-test', kt_coach_msgs: '[]', kt_coach_model: 'claude-haiku-4-5' } });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const sent = [], queue = [];
        window.fetch = async (u, o) => {
          if (String(u).indexOf('api.anthropic.com') < 0) return new Response('{}', { status: 404 });
          try { sent.push(JSON.parse(o.body)); } catch (e) {}
          return new Response(JSON.stringify(queue.shift() || { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        const tu = (id, name, input) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage: {} });
        const send = async (text, replies) => { queue.push(...replies); document.getElementById('coach-input').value = text; await sendCoachMessage(); await wait(40); };
        const toolResults = () => sent.map(b => b.messages[b.messages.length - 1]).filter(m => Array.isArray(m.content)).map(m => m.content.filter(x => x.type === 'tool_result').map(x => String(x.content)).join('')).filter(Boolean);
        const pills = () => [...document.querySelectorAll('#screen span')].map(s => s.textContent.trim()).filter(t => /^[✓✕] /.test(t));
        const T = todayISO(), r = {};
        // 1. the same chat: today's Push logged, then "I also did overhead press in that session"
        switchTab('coach'); coachView = 'chat'; render(); await wait(20);
        const bench = { name: 'Bench Press', sets: 3, reps: 5, weight: 80, isMain: true }, ohp = { name: 'Overhead Press', sets: 3, reps: 8, weight: 40, isMain: true };
        const n0 = getSessions().length;
        await send('Log my push from today: bench 3x5 at 80', [tu('t08a', 'log_session', { type: 'Push', exercises: [bench] })]);
        const sid = (getSessions().find(s => s.date === T && s.source === 'coach') || {}).id;
        await send('Oh, I also did overhead press 3x8 at 40 in that same session', [tu('t08b', 'log_session', { type: 'Push', exercises: [bench, ohp] }), tu('t08c', 'log_session', { type: 'Push', add_to: sid, exercises: [ohp] })]);
        const sys = (b => typeof b.system === 'string' ? b.system : (b.system || []).map(x => x.text).join(''))(sent[sent.length - 1]);
        const today = getSessions().filter(s => s.date === T);
        const rec = today[0] || { exercises: [] };
        render(); await wait(20);
        r.chat = { T, added: getSessions().length - n0, today: today.length, lifts: rec.exercises.map(e => e.name + (e.isMain ? '*' : '')).join(','), ohpW: rec.exercises.filter(e => e.name === 'Overhead Press').map(e => e.weight).join(','), want: wStore(40),
          ohpWorking: getWeights()['Overhead Press'], stamp: JSON.stringify((rec.wSet || {})['Overhead Press']), results: toolResults().slice(-2), pills: pills().slice(-3), sid,
          guide: /log_session with add_to set to that session's \[id:\.\.\.\]/.test(sys), listed: sys.indexOf('[id:' + sid + ']') >= 0 };
        // 2. an older session, not in RECENT SESSIONS, told again with a lift it never had
        const old = getSessions().filter(s => s.type === 'Push').slice(-1)[0];
        r.oldListed = buildSystemPrompt().indexOf('[id:' + old.id + ']') >= 0;
        const told = old.exercises.map(e => { const ps = _exPairs(e); return { name: e.name, sets: ps.length, reps: ps.map(p => p[0]), weight: wDisp(Math.max.apply(null, ps.map(p => p[1]))) }; });
        const fly = { name: 'Dumbbell Fly', sets: 3, reps: 12, weight: 12 }, n1 = getSessions().length, lifts0 = old.exercises.length;
        const call = (input) => { const res = executeCoachTool('log_session', input); return { res, pill: toolCallLabel({ name: 'log_session', input, result: res }) }; };
        r.retold = call({ type: 'Push', date: old.date, exercises: told.concat([fly]) });
        r.retoldSaved = getSessions().length - n1;
        r.addFly = call({ type: 'Push', date: old.date, add_to: old.id, exercises: [fly] });
        const after = getSessions().find(s => s.id === old.id);
        r.old = { date: old.date, lifts0, lifts: after.exercises.length, fly: (after.exercises.find(e => e.name === 'Dumbbell Fly') || {}).weight, want: wStore(12), sameDay: getSessions().filter(s => s.date === old.date).length, added: getSessions().length - n1,
          stamped: Object.prototype.hasOwnProperty.call(old, 'wSet') || Object.prototype.hasOwnProperty.call(after, 'wSet') };
        // told once more in full: every lift is in it now, so it is plainly already logged
        r.again = call({ type: 'Push', date: old.date, exercises: told.concat([fly]) });
        // 3. add_to's guards: an unknown id, another day, only lifts it has; nothing is saved
        const n2 = getSessions().length;
        r.unknown = call({ type: 'Push', add_to: 123, exercises: [fly] }).res;
        r.otherDay = call({ type: 'Pull', add_to: old.id, exercises: [{ name: 'Face Pull', sets: 3, reps: 15, weight: 20 }] }).res;
        r.otherDate = call({ type: 'Push', date: addDays(old.date, 1), add_to: old.id, exercises: [{ name: 'Cable Fly', sets: 3, reps: 15, weight: 20 }] }).res;
        r.allIn = call({ type: 'Push', date: old.date, add_to: old.id, exercises: [told[0]] });
        r.guarded = { saved: getSessions().length - n2, lifts: getSessions().find(s => s.id === old.id).exercises.length };
        // edit_session cannot add a lift: it says where that goes
        r.editAdd = executeCoachTool('edit_session', { id: old.id, exercise: 'Pec Deck', reps: [12, 12], weight: 30 });
        r.schema = !!(_cachedCoachTools().find(t => t.name === 'log_session') || { input_schema: { properties: {} } }).input_schema.properties.add_to;
        return r;
      });
      const c = out.chat, dayP = 'Push';
      assert(c.added === 1 && c.today === 1 && c.lifts === 'Bench Press*,Overhead Press' && c.ohpW === String(c.want), unit + ': one session with both lifts; the main stays Bench: ' + JSON.stringify(c));
      assert(c.ohpWorking === c.want && c.stamp === JSON.stringify([null, c.want]), unit + ': the added lift sets its working weight and the log\'s stamp says so: ' + JSON.stringify(c));
      assert(/It does not have Overhead Press/.test(c.results[0]) && /NOT logged/.test(c.results[0]) && /add_to:/.test(c.results[0]) && !/Tell the user it is already logged/.test(c.results[0]), unit + ': the coach is told the new lift is not saved and how to add it: ' + c.results[0]);
      assert(/"added":\["Overhead Press"\]/.test(c.results[1]) && /Added Overhead Press to the Push session of /.test(c.results[1]), unit + ': and that add_to added it: ' + c.results[1]);
      assert(JSON.stringify(c.pills) === JSON.stringify(['✓ ' + dayP + ' logged', '✕ ' + dayP + ': Overhead Press not saved', '✓ ' + dayP + ': Overhead Press added · ' + c.T]), unit + ': the pills say what happened: ' + JSON.stringify(c.pills));
      assert(c.guide && c.listed, unit + ': the prompt lists the saved session and says add_to adds to it: ' + JSON.stringify([c.guide, c.listed]));
      assert(!out.oldListed, unit + ': the older session is not in the prompt\'s list');
      const rt = out.retold;
      assert(rt.res.ok === false && rt.res.duplicate && JSON.stringify(rt.res.missing) === '["Dumbbell Fly"]' && out.retoldSaved === 0, unit + ': the re-told session is refused, naming the lift it lacks: ' + JSON.stringify(rt.res));
      assert(/It does not have Dumbbell Fly/.test(rt.res.error) && /NOT logged/.test(rt.res.error) && rt.res.error.indexOf('add_to:' + rt.res.duplicate) > 0 && !/Tell the user it is already logged/.test(rt.res.error) && rt.res.error.indexOf(' ' + unit) > 0, unit + ': the error says so, in the owner\'s unit: ' + rt.res.error);
      assert(rt.pill === dayP + ': Dumbbell Fly not saved · ' + out.old.date, unit + ': its pill does not say already logged: ' + rt.pill);
      assert(out.addFly.res.ok && out.addFly.pill === dayP + ': Dumbbell Fly added · ' + out.old.date, unit + ': add_to saves it: ' + JSON.stringify(out.addFly));
      assert(out.old.lifts === out.old.lifts0 + 1 && out.old.fly === out.old.want && out.old.sameDay === 1 && out.old.added === 0, unit + ': into the saved session, no new one: ' + JSON.stringify(out.old));
      assert(out.old.stamped === false, unit + ': a log from before the stamp stays unstamped: ' + JSON.stringify(out.old));
      assert(out.again.res.ok === false && !out.again.res.missing && out.again.pill === dayP + ' already logged · ' + out.old.date, unit + ': told again in full it is plainly already logged: ' + JSON.stringify(out.again));
      assert(out.unknown.ok === false && /not found/.test(out.unknown.error), unit + ': an unknown id: ' + JSON.stringify(out.unknown));
      assert(out.otherDay.ok === false && out.otherDate.ok === false, unit + ': another day or date is refused: ' + JSON.stringify([out.otherDay, out.otherDate]));
      assert(out.allIn.res.ok === false && out.allIn.res.duplicate && out.allIn.pill === dayP + ' already logged · ' + out.old.date, unit + ': only lifts it has: ' + JSON.stringify(out.allIn));
      assert(out.guarded.saved === 0 && out.guarded.lifts === out.old.lifts, unit + ': the guards save nothing: ' + JSON.stringify(out.guarded));
      assert(out.editAdd.ok === false && /log_session with add_to:/.test(out.editAdd.error), unit + ': edit_session points to add_to: ' + out.editAdd.error);
      assert(out.schema, unit + ': the tool offers add_to');
      assert(app.errors.length === 0, unit + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// U02 (incomplete T08): log_session takes one weight per exercise, so a lift done at two loads
// ("a top set of 5 at 135, then 3x8 at 115") goes in as two entries, as a plain log_session saves
// them. add_to judged each entry against the session as it grew: the first went in, the back-offs
// were left out and reported as already in it, and a retry with them alone was refused.
run('U02: add_to adds every entry of a lift the session lacks; only lifts it had are left as saved', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const T = todayISO(), r = {};
      const fmt = s => s.exercises.map(e => e.name + ' ' + (Array.isArray(e.reps) ? e.reps.join('/') : e.reps) + '@' + e.weight).join(' | ');
      const log = (input) => { const res = executeCoachTool('log_session', input); return { res, pill: toolCallLabel({ name: 'log_session', input, result: res }) }; };
      log({ type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 5, weight: 185 }] });
      const ohp = [{ name: 'Overhead Press', sets: 1, reps: 5, weight: 135 }, { name: 'Overhead Press', sets: 3, reps: 8, weight: 115 }];
      const twin = log({ type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 5, weight: 185 }].concat(ohp) }).res;
      r.twin = { ok: twin.ok, missing: twin.missing };
      const id = twin.duplicate, n0 = getSessions().length;
      r.add = log({ type: 'Push', date: T, add_to: id, exercises: ohp });
      r.saved = fmt(getSessions().find(s => s.id === id));
      // a lift it has stays as saved; a new lift beside it goes in whole
      r.add2 = log({ type: 'Push', date: T, add_to: id, exercises: [{ name: 'Bench Press', sets: 1, reps: 3, weight: 205 }, { name: 'Lateral Raise', sets: 2, reps: 15, weight: 20 }, { name: 'Lateral Raise', sets: 1, reps: 20, weight: 15 }] });
      r.saved2 = fmt(getSessions().find(s => s.id === id));
      r.sessions = getSessions().length - n0;
      return r;
    });
    assert(out.twin.ok === false && JSON.stringify(out.twin.missing) === '["Overhead Press"]', 'the re-told session names the lift it lacks once: ' + JSON.stringify(out.twin));
    assert(out.add.res.ok && JSON.stringify(out.add.res.added) === '["Overhead Press"]' && !/Already in it/.test(out.add.res.message) && /now 3 exercises/.test(out.add.res.message), 'add_to reports the lift added, nothing left out: ' + JSON.stringify(out.add.res));
    assert(out.saved === 'Bench Press 5/5/5@185 | Overhead Press 5@135 | Overhead Press 8/8/8@115', 'the top set and the back-offs are both saved: ' + out.saved);
    assert(/^Push: Overhead Press added · /.test(out.add.pill), 'the pill names the lift once: ' + out.add.pill);
    assert(out.add2.res.ok && JSON.stringify(out.add2.res.added) === '["Lateral Raise"]' && /Already in it, left as saved: Bench Press \(/.test(out.add2.res.message), 'only the lift it had is left as saved: ' + out.add2.res.message);
    assert(out.saved2 === out.saved + ' | Lateral Raise 15/15@20 | Lateral Raise 20@15' && out.sessions === 0, 'into the saved session: ' + JSON.stringify([out.saved2, out.sessions]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
