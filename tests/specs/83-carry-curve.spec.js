// The programme engine (web 20260925-2): an edit made in week c is carried into every later week
// so the programme keeps its own climb from the new number (before, week 7 dropped back to the old
// curve). Pins the load rule (delta within ±25%, ratio beyond, deload share, e1RM for weeks that
// keep their own reps), replace-where-equal sets/reps, flat rows that climb on an owner edit,
// swap / add / remove (with restore), the rerouted writers (runner "Also update my programme",
// keyless progression, set_exercise_weight), the one write door with Undo, and the kg-safe sweep.
const fs = require('fs');
const path = require('path');
const { boot, assert, run } = require('../lib/harness');

run('carry the curve: load, scheme, flat rows, swap/add/remove, writers, undo', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, C = 5;   // week 6
      const orig = localStorage.getItem('kt_routine');
      const reset = () => { lsSet('kt_routine', JSON.parse(orig)); };
      const curve = (slot, name) => getCustomRoutine().weeks.map(w => { const x = (w[slot] || []).find(e => e.name === name); return x ? x.weight : null; });
      const row = (i, slot, name) => (getCustomRoutine().weeks[i][slot] || []).find(e => e.name === name);
      r.week = currentWeek;

      // A. Bench 160 -> 185 from week 6: +25 on every later week, the deload keeps its share
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', C, 185, { markOwner: true }));
      r.a = curve('push', 'Bench Press'); r.aRec = row(C, 'push', 'Bench Press').rec;
      reset();
      // B. 5x5 @ 185: every 4x8 working week takes 5x5; the 4x8 deload follows by estimated 1RM
      _commitRoutine(cr => { _progSetScheme(cr, 'push', 'Bench Press', C, 'sets', 5, {}); _progSetScheme(cr, 'push', 'Bench Press', C, 'reps', 5, {}); return _progCarryLoad(cr, 'push', 'Bench Press', C, 185, { repsOld: 8 }); });
      r.b = { w: curve('push', 'Bench Press'), s7: row(6, 'push', 'Bench Press').sets + 'x' + row(6, 'push', 'Bench Press').reps, dl: row(11, 'push', 'Bench Press').sets + 'x' + row(11, 'push', 'Bench Press').reps };
      reset();
      // C. this week only
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', C, 185, { onlyThisWeek: true }));
      r.c = curve('push', 'Bench Press').slice(5, 7);
      reset();
      // D. a big cut scales instead
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', C, 100, {}));
      r.d = curve('push', 'Bench Press').slice(5, 7);
      reset();
      // E. kg: loads land on the 1.25 kg grid
      localStorage.setItem('kt_unit_w', 'kg');
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', C, wStore(85), {}));
      r.e = { w: curve('push', 'Bench Press').slice(5), grid: curve('push', 'Bench Press').slice(5).every(x => _onPlateGrid(x)) };
      localStorage.setItem('kt_unit_w', 'lb');
      reset();
      // F. a row the coach held flat climbs like the day's accessories on an owner edit; Hold keeps it flat
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Lateral Raise', C, 20, { markOwner: true }));
      r.f = curve('push', 'Lateral Raise').slice(5);
      reset();
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Lateral Raise', C, 20, { markOwner: true, climb: 'hold' }));
      r.fHold = curve('push', 'Lateral Raise').slice(5);
      reset();
      // G. the keyless writers move a flat row as a flat row
      _commitRoutine(cr => _progCarryByName(cr, 'Face Pull', C, 40, {}));
      r.g = curve('pull', 'Face Pull').slice(4);
      reset();
      // H. swap keeps the old lift's shape at the new lift's level; a lift already on the day is refused
      _commitRoutine(cr => _progSwap(cr, 'push', 'Overhead Press', 'Arnold Press', C, 50, { markOwner: true }));
      r.h = { arnold: curve('push', 'Arnold Press').slice(5, 9), ohpBefore: row(4, 'push', 'Overhead Press').weight, ohpAfter: !!row(6, 'push', 'Overhead Press') };
      reset();
      r.hRefused = _commitRoutine(cr => _progSwap(cr, 'push', 'Overhead Press', 'Incline Dumbbell Press', C, 0, {}));
      // I. add borrows the day's curve; a duplicate is refused
      _commitRoutine(cr => _progAdd(cr, 'push', { name: 'Cable Fly', sets: 3, reps: 12, rpe: 8, weight: 40 }, C, 'Incline Dumbbell Press', {}));
      const cf = curve('push', 'Cable Fly');
      const at = getCustomRoutine().weeks[C].push.map(e => e.name).indexOf('Cable Fly');
      r.i = { before: cf.slice(0, 5).every(x => x === null), w5: cf[5], later: cf.slice(6).every(x => x >= 40 && _onPlateGrid(x)), pos: at, rec: row(C, 'push', 'Cable Fly').rec, main: row(C, 'push', 'Cable Fly').isMain };
      r.iDup = _commitRoutine(cr => _progAdd(cr, 'push', { name: 'Bench Press', sets: 3, reps: 8, weight: 100 }, C, null, {}));
      reset();
      // J. remove: superset opener unpaired, main passed on, coach row kept for restore
      _commitRoutine(cr => { cr.weeks.forEach(w => { if (w.push && w.push[0]) w.push[0].ss = true; }); return 1; });
      _commitRoutine(cr => _progRemove(cr, 'push', 'Overhead Press', C));
      r.j = { gone: !row(C, 'push', 'Overhead Press') && !row(11, 'push', 'Overhead Press'), kept: !!row(4, 'push', 'Overhead Press'), unpaired: row(C, 'push', 'Bench Press').ss === false, pairedBefore: row(4, 'push', 'Bench Press').ss === true };
      _commitRoutine(cr => _progRemove(cr, 'push', 'Bench Press', C));
      r.jMain = getCustomRoutine().weeks[C].push.filter(e => e.isMain).map(e => e.name);
      _commitRoutine(cr => _progAdd(cr, 'push', { name: 'Overhead Press', sets: 3, reps: 10, weight: 0 }, C, null, {}));
      r.jBack = { w: curve('push', 'Overhead Press').slice(5, 8), s: row(C, 'push', 'Overhead Press').sets + 'x' + row(C, 'push', 'Overhead Press').reps };
      reset();
      // K. keyless progression and L. the coach's set_exercise_weight carry from this week on
      _writeLoadLocal('Bench Press', 165);
      r.k = { w: curve('push', 'Bench Press').slice(4, 8), kw: getWeights()['Bench Press'] };
      reset();
      const sw = executeCoachTool('set_exercise_weight', { name: 'bench press', weight: 170 });
      r.l = { ok: sw.ok, w: curve('push', 'Bench Press').slice(5, 7) };
      reset();
      // M. the runner's "Also update my programme": weight-only edit keeps the scheme; off on every open; a rename onto a lift on the day is refused
      openDeckRunner('Push'); await wait(30);
      const bi = runnerSession.exercises.findIndex(e => e.name === 'Bench Press');
      openRunnerExEdit(bi); runnerExEditToggleApply(); _rExEditWeight = 185; saveRunnerExEdit(); await wait(30);
      r.m = { w: curve('push', 'Bench Press').slice(5, 8), scheme: row(6, 'push', 'Bench Press').sets + 'x' + row(6, 'push', 'Bench Press').reps };
      openRunnerExEdit(bi); r.mOff = _rExEditApply;
      const before = localStorage.getItem('kt_routine');
      runnerExEditToggleApply(); _rExEditName = 'Overhead Press'; saveRunnerExEdit(); await wait(30);
      r.mRefused = localStorage.getItem('kt_routine') === before;
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
      reset();
      // N. Undo restores the programme exactly
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', C, 185, {}), { undoLabel: 'Push updated from week 6 on' });
      await wait(400);
      document.querySelector('#toast .kt-toast-undo').click(); await wait(50);
      r.n = localStorage.getItem('kt_routine') === orig;
      return r;
    });
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    assert(out.week === 6, 'demo seed is in week 6');
    assert(eq(out.a, [147.5, 150, 152.5, 155, 157.5, 185, 187.5, 190, 192.5, 195, 197.5, 200]) && out.aRec && out.aRec.weight === 160,
      'Bench 160 -> 185 keeps the +2.5 steps; weeks 1-5 untouched; the coach row is kept: ' + JSON.stringify([out.a, out.aRec]));
    assert(eq(out.b.w.slice(5), [185, 187.5, 190, 192.5, 195, 197.5, 187.5]) && out.b.s7 === '5x5' && out.b.dl === '4x8',
      '5x5 @ 185 changes the 4x8 weeks; the 4x8 deload follows by 1RM, not the 5x5 load: ' + JSON.stringify(out.b));
    assert(eq(out.c, [185, 162.5]), 'this week only: ' + JSON.stringify(out.c));
    assert(eq(out.d, [100, 102.5]), 'a big cut scales: ' + JSON.stringify(out.d));
    assert(out.e.w[0] === 187.4 && out.e.w[1] === 190.1 && out.e.grid, 'kg loads land on the 1.25 kg grid: ' + JSON.stringify(out.e));
    assert(eq(out.f, [20, 20, 20, 22.5, 22.5, 22.5, 22.5]) && eq(out.fHold, [20, 20, 20, 20, 20, 20, 20]), 'a flat row climbs on an owner edit, Hold keeps it: ' + JSON.stringify([out.f, out.fHold]));
    assert(eq(out.g, [35, 40, 40, 40, 40, 40, 40, 40]), 'the keyless writers keep a flat row flat: ' + JSON.stringify(out.g));
    assert(eq(out.h.arnold, [50, 52.5, 52.5, 52.5]) && out.h.ohpBefore === 100 && !out.h.ohpAfter, 'swap keeps the shape at the new level: ' + JSON.stringify(out.h));
    assert(out.hRefused === -1 && out.iDup === -1, 'a lift already on the day is refused');
    assert(out.i.before && out.i.w5 === 40 && out.i.later && out.i.pos === 3 && out.i.rec === null && out.i.main === false, 'add borrows the day curve: ' + JSON.stringify(out.i));
    assert(out.j.gone && out.j.kept && out.j.unpaired && out.j.pairedBefore, 'remove from week 6 on, unpairing the superset: ' + JSON.stringify(out.j));
    assert(out.jMain.length === 1, 'a removed main lift passes the tag on: ' + JSON.stringify(out.jMain));
    assert(eq(out.jBack.w, [100, 102.5, 102.5]) && out.jBack.s === '4x8', 'adding a removed coach row back restores it exactly: ' + JSON.stringify(out.jBack));
    assert(eq(out.k.w, [157.5, 165, 167.5, 170]) && out.k.kw === 165, 'keyless progression carries forward: ' + JSON.stringify(out.k));
    assert(out.l.ok && eq(out.l.w, [170, 172.5]), 'set_exercise_weight carries forward: ' + JSON.stringify(out.l));
    assert(eq(out.m.w, [185, 187.5, 190]) && out.m.scheme === '4x8', 'the runner writes a weight edit forward and keeps the scheme: ' + JSON.stringify(out.m));
    assert(out.mOff === false && out.mRefused, 'the programme switch is off on every open; a rename onto a lift on the day is refused');
    assert(out.n, 'Undo restores the programme exactly');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('the startup plate sweep leaves kg-grid loads alone and still snaps odd ones', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed-dump.json'), 'utf8'));
  const cr = JSON.parse(seed.kt_routine);
  cr.weeks[5].push[0].weight = 176.4;   // 80 kg
  cr.weeks[5].push[1].weight = 151.3;   // no gym can rack it
  const app = await boot({ seed: { kt_unit_w: 'kg', kt_routine: JSON.stringify(cr) } });
  try {
    const out = await app.page.evaluate(() => { const w = getCustomRoutine().weeks[5].push; return [w[0].weight, w[1].weight]; });
    assert(out[0] === 176.4 && out[1] === 151.6, 'a kg user keeps 80 kg; 151.3 lb snaps to the kg grid (68.75 kg = 151.6 lb): ' + JSON.stringify(out));
  } finally { await app.close(); }
});
