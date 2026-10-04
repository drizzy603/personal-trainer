// Hunt 3 (2026-10-04), coach group:
// - H01 update_routine_weeks converts only the lift days the call sent: a day it left out is
//   the stored one, already lb (a kg owner's kept days were multiplied by 2.2 on every rename or
//   one-day tweak; an lb owner's kept per-set loads were re-snapped to 2.5 lb).
// - H13 the prompt's RECENT SESSIONS / LOGGED RUNS / LOGGED SPORT SESSIONS are the newest by date
//   (the stores keep save order) and say how many of how many are listed and from which day; the
//   "not in this list = not saved" rule holds only from that day; log_run / log_sport refuse a
//   same-day twin (separate:true logs a real second one) and the pill says "Already logged".
// - M24 a programme the coach builds in the chat after "Start a new programme" starts like the
//   intake's: week 1 on the next Monday, the weekly cards re-armed (it kept the archive's anchor,
//   started in the past, and Monday read week 2); a rewrite of an existing one does not re-anchor.
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
  // 10 runs saved oldest first (the order an import or a restore can leave), two on one day at
  // the cut; 12 activities.
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
