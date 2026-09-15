// The exercise library: big, clean and consistent — unique names, every field present, cues on every
// entry, categories the filter knows, bodyweight detection intact, and the library screen renders it.
const { boot, assert, run } = require('../lib/harness');

run('library integrity and size', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const db = EXERCISE_DB;
      r.count = db.length;
      const norm = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
      const seen = {}; r.dupes = [];
      db.forEach(e => { const k = norm(e.name); if (seen[k]) r.dupes.push(e.name); seen[k] = 1; });
      const CATS = ['Push', 'Pull', 'Legs', 'Arms', 'Core'];
      r.badCat = db.filter(e => CATS.indexOf(e.cat) < 0).map(e => e.name);
      r.incomplete = db.filter(e => !e.name || !e.muscles || !e.equip || !e.desc || !Array.isArray(e.tips) || e.tips.length < 3).map(e => e.name);
      r.perCat = CATS.map(c => c + ':' + db.filter(e => e.cat === c).length).join(' ');
      r.bw = { pushUp: _isBodyweightLift('Push Up'), bench: _isBodyweightLift('Barbell Bench Press'), pullUp: _isBodyweightLift('Pull Up') };
      r.barbell = { bench: _isBarbellLift('Barbell Bench Press'), db: _isBarbellLift('DB Bench Press') };
      openExLib();
      const list = document.getElementById('exlibOverlay');
      r.screen = { open: !!list, rows: list ? list.querySelectorAll('[data-ex], .exlib-row, .exlib-item').length : 0, text: list ? list.innerText.length : 0 };
      setLibFilter('Arms'); r.armsText = document.getElementById('exlibOverlay').innerText;
      const el = document.getElementById('exlibOverlay'); if (el) el.remove();
      return r;
    });
    assert(out.count >= 230, 'library has at least 230 built-in exercises: ' + out.count + ' (' + out.perCat + ')');
    assert(out.dupes.length === 0, 'no duplicate names: ' + out.dupes.join(', '));
    assert(out.badCat.length === 0, 'every entry has a known category: ' + out.badCat.join(', '));
    assert(out.incomplete.length === 0, 'every entry has muscles, equipment, description and 3+ cues: ' + out.incomplete.slice(0, 8).join(', '));
    assert(out.bw.pushUp && out.bw.pullUp && !out.bw.bench && out.barbell.bench && !out.barbell.db, 'bodyweight and barbell detection intact: ' + JSON.stringify(out.bw) + ' ' + JSON.stringify(out.barbell));
    assert(out.screen.open && out.screen.text > 2000 && /Curl|Extension|Pushdown/.test(out.armsText), 'the library screen renders and the Arms filter shows arm work');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
