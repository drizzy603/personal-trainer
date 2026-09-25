// The coach and the owner's edits (web 20260925-10): when the coach rewrites weeks, the owner's
// edited and added lifts are kept (the coach's new row becomes the "Coach:" original) and lifts they
// removed stay removed, and the coach is told; a lift day left out of a call keeps what is stored;
// edit_programme_exercise changes one exercise from a week on through the engine; the prompt shows
// the owner's edits and where each main lift is heading.
const { boot, assert, run } = require('../lib/harness');

run('coach: owner edits win, omitted days kept, one-exercise tool, prompt marks', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1, wk = currentWeek;
      const row = (i, slot, n) => (getCustomRoutine().weeks[i][slot] || []).find(e => e.name === n);
      // the owner edits Bench, adds Cable Fly, removes Lateral Raise (from this week on)
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', c, 185, { markOwner: true }));
      _commitRoutine(cr => _progAdd(cr, 'push', { name: 'Cable Fly', sets: 3, reps: 12, rpe: 8, weight: 40 }, c, null, {}));
      _commitRoutine(cr => _progRemove(cr, 'push', 'Lateral Raise', c));
      const pullBefore = JSON.stringify(getCustomRoutine().weeks[c].pull);
      // the prompt shows the owner's edits and the climb ahead
      const prompt = buildSystemPrompt ? buildSystemPrompt() : '';
      r.prompt = { edited: /Bench Press: .*\[edited by the user; you had 4×8 @ 160 lb\]/.test(prompt), added: /Cable Fly: .*\[added by the user\]/.test(prompt), ahead: /AHEAD Bench Press: to 197\.5 lb by wk 11/.test(prompt), rule: /edit_programme_exercise/.test(prompt) };
      // the coach rewrites this week's Push only (Pull/Legs left out) with its own numbers
      const res = executeCoachTool('update_routine_weeks', { weeks: [{ wk, bName: 'BUILD', bColor: '#0a43f5',
        push: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 165, isMain: true }, { name: 'Overhead Press', sets: 4, reps: 8, weight: 100 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 20 }] }] });
      r.res = { ok: res.ok, kept: res.keptUserEdits, msg: res.message };
      const b = row(c, 'push', 'Bench Press');
      r.bench = { w: b.weight, sets: b.sets, coachW: b.rec && b.rec.weight };
      r.fly = !!row(c, 'push', 'Cable Fly');
      r.lateralGone = !row(c, 'push', 'Lateral Raise') && !!((getCustomRoutine().weeks[c].recOut || {}).push || []).some(e => e.row.name === 'Lateral Raise');
      r.pullKept = JSON.stringify(getCustomRoutine().weeks[c].pull) === pullBefore;
      // the one-exercise tool: by day name, from this week on, marks cleared
      const e1 = executeCoachTool('edit_programme_exercise', { day: _dayLabel('Push'), exercise: 'bench press', action: 'change', weight: 190 });
      r.tool = { ok: e1.ok, series: e1.series && e1.series.slice(0, 2), marked: row(c, 'push', 'Bench Press').rec !== undefined, w7: row(c + 1, 'push', 'Bench Press').weight };
      const bad = [executeCoachTool('edit_programme_exercise', { day: 'Brunch', exercise: 'x', action: 'change' }).ok,
                   executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Nope Press', action: 'remove' }).ok,
                   executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 200, from_week: 1 }).ok];
      r.bad = bad;
      const sw = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'swap', rename_to: 'Arnold Press', weight: 50 });
      r.swap = { ok: sw.ok, name: !!row(c, 'push', 'Arnold Press') };
      return r;
    });
    assert(out.prompt.edited && out.prompt.added && out.prompt.ahead && out.prompt.rule, 'the prompt shows the owner\'s edits and the climb ahead: ' + JSON.stringify(out.prompt));
    assert(out.res.ok && out.res.kept.indexOf('Bench Press') >= 0 && out.res.kept.indexOf('Cable Fly') >= 0 && /their version wins/.test(out.res.msg), 'the coach is told what was kept: ' + JSON.stringify(out.res));
    assert(out.bench.w === 185 && out.bench.coachW === 165, 'the owner\'s Bench stays; the coach\'s new row is the original beside it: ' + JSON.stringify(out.bench));
    assert(out.fly && out.lateralGone, 'an added lift stays and a removed one stays removed');
    assert(out.pullKept, 'a day left out of the call keeps what is stored');
    assert(out.tool.ok && /190 lb/.test(out.tool.series[0]) && out.tool.w7 === 192.5 && !out.tool.marked, 'edit_programme_exercise carries forward and becomes the programme\'s version: ' + JSON.stringify(out.tool));
    assert(JSON.stringify(out.bad) === '[false,false,false]', 'bad day, missing lift and a past week are refused: ' + JSON.stringify(out.bad));
    assert(out.swap.ok && out.swap.name, 'swap works by the tool: ' + JSON.stringify(out.swap));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
