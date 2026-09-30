// Hunt 2026-09-26 "go" fixes, data safety (web 20260930-4):
// - Archiving reports failure and never duplicates the newest entry; a new programme, a restored
//   archive, the starter plan and the next round stop (or roll the archive back) instead of
//   replacing a programme that reached Programme History nowhere.
// - A restore is all or nothing: its undo copy must fit first, and a write that fails puts every
//   key back ("Restored N data items" over half of each dataset).
// - The demo-weights sweep also runs on restored data.
const { boot, assert, run } = require('../lib/harness');

const FULL = `(keys) => { const orig = Storage.prototype.setItem; window.__origSet = orig; Storage.prototype.setItem = function (k, v) { if (keys.indexOf(k) >= 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; }`;
const ROOM = `() => { if (window.__origSet) Storage.prototype.setItem = window.__origSet; }`;

run('a programme is never replaced without reaching Programme History', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([FULL, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const full = eval(FULL), room = eval(ROOM), r = {};
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const cur = () => localStorage.getItem('kt_routine');
      const hist = () => getRoutineArchive().length;
      // archiving the same programme twice adds one entry
      lsSet('kt_routine_archive', []);
      r.dedupe = [archiveCurrentRoutine(), archiveCurrentRoutine(), hist()];
      lsSet('kt_routine_archive', []);
      const before = cur();
      // a new programme with the archive full
      full(['kt_routine_archive']);
      startNewProgramme(); await wait(20); confirm(); await wait(30);
      room();
      r.newProg = { kept: cur() === before, hist: hist(), toast: (document.getElementById('toast') || {}).textContent };
      // the starter plan with the archive full
      full(['kt_routine_archive']);
      applyStarterRoutine({ goal: 'strength', days: 3, exp: 'intermediate', equip: 'full', focus: 'balanced' }); await wait(20);
      room();
      r.starter = cur() === before;
      // the next round: the routine write fails, the archive entry is taken back, a retry adds nothing new
      lsSet('kt_routine_next', { startsOn: todayISO(), at: todayISO() });
      full(['kt_routine']);
      const a1 = _applyNextRound(false), h1 = hist();
      const a2 = _applyNextRound(false), h2 = hist();
      room();
      r.round = { a1, a2, h1, h2, kept: cur() === before, still: !!_nextRoundSet() };
      lsDel('kt_routine_next');
      return r;
    }, [FULL, ROOM]);
    assert(out.dedupe[0] && out.dedupe[1] && out.dedupe[2] === 1, 'archiving the same programme twice adds one entry: ' + JSON.stringify(out.dedupe));
    assert(out.newProg.kept && out.newProg.hist === 0 && /out of space/.test(out.newProg.toast || ''), 'a new programme stops when the archive cannot be written: ' + JSON.stringify(out.newProg));
    assert(out.starter, 'the starter plan stops too');
    assert(out.round.a1 === null && out.round.a2 === null && out.round.h1 === 0 && out.round.h2 === 0 && out.round.kept && out.round.still, 'a failed round swap takes its archive entry back and stays set: ' + JSON.stringify(out.round));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a restore is all or nothing, and sweeps demo weights', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([FULL, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const full = eval(FULL), room = eval(ROOM), r = {};
      const backup = buildBackupJSON();
      backup.kt_runs = backup.kt_runs.slice(0, 1);
      backup.kt_sessions = backup.kt_sessions.concat(backup.kt_sessions.map(s => Object.assign({}, s, { id: s.id + 1 })));
      backup.kt_weights = Object.assign({}, backup.kt_weights || {}, { 'Cable Fly': 42.5, 'Hammer Curl': 30 });
      const runs0 = localStorage.getItem('kt_runs'), sess0 = localStorage.getItem('kt_sessions');
      // the big write fails half way: nothing changes
      full(['kt_sessions']);
      const res1 = _applyImportedData(JSON.parse(JSON.stringify(backup)));
      room();
      r.partial = { res: res1, runs: localStorage.getItem('kt_runs') === runs0, sess: localStorage.getItem('kt_sessions') === sess0, toast: (document.getElementById('toast') || {}).textContent, cacheRuns: getRuns().length };
      // no room for the undo copy: nothing is restored
      full(['kt_pre_restore']);
      const res2 = _applyImportedData(JSON.parse(JSON.stringify(backup)));
      room();
      r.noUndo = { res: res2, runs: localStorage.getItem('kt_runs') === runs0, toast: (document.getElementById('toast') || {}).textContent };
      // a restore that fits: applied, and the demo loads it carried are swept
      const res3 = _applyImportedData(JSON.parse(JSON.stringify(backup)));
      await wait(30);
      const w = getWeights();
      r.ok = { res: res3, runs: getRuns().length, demo: [w['Cable Fly'], w['Hammer Curl']] };
      return r;
    }, [FULL, ROOM]);
    assert(out.partial.res === false && out.partial.runs && out.partial.sess && /ran out of space/.test(out.partial.toast || ''), 'a failed write puts everything back: ' + JSON.stringify(out.partial));
    assert(out.noUndo.res === false && out.noUndo.runs && /undo copy/.test(out.noUndo.toast || ''), 'no room for the undo copy: nothing restored: ' + JSON.stringify(out.noUndo));
    assert(out.ok.res !== false && out.ok.runs === 1 && out.ok.demo[0] === undefined && out.ok.demo[1] === undefined, 'a restore that fits is applied and swept: ' + JSON.stringify(out.ok));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
