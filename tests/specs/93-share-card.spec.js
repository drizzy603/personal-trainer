// The end-of-workout share image (web 20260928-1): drawn in the owner's room (Heavyweight paper,
// blue and lime in Anton/Archivo; Lime on its dark base), with the whole workout on it: the day,
// date, week and phase, duration, lifts/sets/RPE, volume, reps and the change against the last time
// this day was trained, every record with what it beat, and every lift with its sets, its top set and
// the change since last time. _shareCardModel is what it says; _paintShareCard draws it.
const { boot, assert, run } = require('../lib/harness');

const SETUP = `(() => {
  const X = (name, reps, wl, rpe) => ({ name, sets: reps.length, reps, weight: Math.max.apply(null, wl), weightLog: wl, rpeLog: rpe || reps.map(() => 8) });
  const mon = _mostRecentMonday(), now = Date.now();
  const prev = { id: now - 7 * 86400000, date: addDays(mon, -7), type: 'Pull', label: 'Pull', week: 6, prs: [],
    exercises: [X('Barbell Row', [8, 8, 8, 8], [150, 150, 150, 150]), X('Pull Up', [8, 8], [0, 0]), X('Face Pull', [15, 15, 15], [35, 35, 35])] };
  const s = { id: now, date: todayISO(), type: 'Pull', label: 'Pull', week: 7, startedAt: now - 64 * 60000, prs: ['Barbell Row'],
    exercises: [X('Barbell Row', [8, 8, 8, 8], [155, 155, 155, 155], [8, 8, 9, 9]), X('Pull Up', [10, 9, 8], [0, 0, 0]),
      X('Face Pull', [15, 15, 15], [35, 35, 35]), X('Lat Pulldown', [10, 10, 9], [135, 140, 140]), X('Hammer Curl', [12, 10], [30, 30])] };
  lsSet('kt_sessions', [s, prev].concat(getSessions().filter(o => o.type !== 'Pull')));
  return s;
})()`;

run('share card: says the whole workout, in the display units', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate((setup) => {
      const s = eval(setup);
      const m = _shareCardModel(s);
      localStorage.setItem('kt_unit_w', 'kg');
      const k = _shareCardModel(s);
      localStorage.setItem('kt_unit_w', 'lb');
      return { m, kgRow: k.rows[0], kgRec: k.records[0], kgUnit: k.unit };
    }, SETUP);
    const m = out.m, row = n => m.rows.find(r => r.name === n);
    assert(m.label === 'Pull' && m.week === 7 && m.duration === '1 h 4 min' && m.lifts === 5 && m.sets === 15, 'header facts: ' + JSON.stringify([m.label, m.week, m.duration, m.lifts, m.sets]));
    assert(m.reps === 32 + 27 + 45 + 29 + 22 && m.unit === 'lb' && m.rpe === 8.1, 'reps, unit and average RPE: ' + JSON.stringify([m.reps, m.unit, m.rpe]));
    assert(m.vsLast != null && m.vsLast > 0, 'volume against last Pull: ' + m.vsLast);
    assert(m.records.length === 1 && m.records[0].set === '155 lb × 8' && m.records[0].gain === '+5 lb', 'the record and what it beat: ' + JSON.stringify(m.records));
    const br = row('Barbell Row');
    assert(br.pr && br.scheme === '4 × 8 · 155 lb' && br.top === '155 lb × 8' && br.delta === '+5 lb' && br.up, 'uniform sets and a heavier top set: ' + JSON.stringify(br));
    const pu = row('Pull Up');
    assert(pu.scheme === 'bodyweight · 10, 9, 8 reps' && pu.top === '10 reps' && pu.delta === '+2 reps' && pu.up, 'a bodyweight lift reads in reps: ' + JSON.stringify(pu));
    assert(row('Face Pull').delta === 'same as last' && !row('Face Pull').up, 'same as last time: ' + JSON.stringify(row('Face Pull')));
    assert(row('Lat Pulldown').scheme === '135×10  140×10  140×9 lb' && row('Lat Pulldown').delta === 'first time', 'changing loads, and a first time: ' + JSON.stringify(row('Lat Pulldown')));
    assert(row('Hammer Curl').scheme === '30 lb · 12, 10 reps', 'same load, changing reps: ' + row('Hammer Curl').scheme);
    assert(out.kgUnit === 'kg' && /kg/.test(out.kgRow.scheme) && /kg/.test(out.kgRow.top) && /kg/.test(out.kgRec.set), 'a kg user reads kg everywhere: ' + JSON.stringify([out.kgRow, out.kgRec]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('share card: painted in the owner\'s room, every lift on it, shared as a PNG', async () => {
  for (const theme of ['heavyweight', 'dark']) {
    const app = await boot({ native: true, seed: { kt_theme: theme } });
    try {
      const out = await app.page.evaluate(async (setup) => {
        const s = eval(setup);
        const P = _shareCardPalette();
        await _shareCardFonts(P);
        const c = _paintShareCard(_shareCardModel(s), P);
        const px = c.getContext('2d').getImageData(4, 4, 1, 1).data;
        // a long workout still lists every lift
        const long = JSON.parse(JSON.stringify(s)); long.id = s.id + 1;
        for (let i = 0; i < 5; i++) long.exercises.push({ name: 'Extra Lift ' + i, sets: 3, reps: [10, 10, 10], weight: 50, weightLog: [50, 50, 50] });
        const c2 = _paintShareCard(_shareCardModel(long), P);
        let shared = null;
        const orig = window._shareFile; window._shareFile = f => { shared = { name: f.name, type: f.type, size: f.size }; };
        shareSessionCard(s.id);
        for (let i = 0; i < 50 && !shared; i++) await new Promise(r => setTimeout(r, 50));
        window._shareFile = orig;
        return { w: c.width, h: c.height, bg: [px[0], px[1], px[2]], rows: c.getAttribute('data-rows'), longRows: c2.getAttribute('data-rows'), anton: document.fonts.check('400 100px "Anton"'), shared, P };
      }, SETUP);
      assert(out.w === 1080 && out.h === 1350, 'a 1080x1350 card');
      const want = theme === 'heavyweight' ? [247, 245, 239] : [11, 11, 12];
      assert(JSON.stringify(out.bg) === JSON.stringify(want), theme + ': the room\'s own background: ' + JSON.stringify(out.bg));
      if (theme === 'heavyweight') assert(out.P.display === 'Anton' && out.P.body === 'Archivo' && out.anton && out.P.accent === '#0a43f5' && out.P.earned === '#b7f000', 'Heavyweight type and colours: ' + JSON.stringify(out.P));
      else assert(out.P.accent === '#d8ff63' && out.P.display === 'Inter', 'Lime keeps its own look: ' + JSON.stringify(out.P));
      assert(out.rows === '5' && out.longRows === '10', 'every lift has a row: ' + JSON.stringify([out.rows, out.longRows]));
      assert(out.shared && out.shared.type === 'image/png' && out.shared.size > 20000 && /^fitness-programmer-\d{4}-\d{2}-\d{2}\.png$/.test(out.shared.name), 'shared as a PNG: ' + JSON.stringify(out.shared));
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});
