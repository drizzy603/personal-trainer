// Hunt 3 (2026-10-04), coach group:
// - H01 update_routine_weeks converts only the lift days the call sent: a day it left out is
//   the stored one, already lb (a kg owner's kept days were multiplied by 2.2 on every rename or
//   one-day tweak; an lb owner's kept per-set loads were re-snapped to 2.5 lb).
const { boot, assert, run } = require('../lib/harness');

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
