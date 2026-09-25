// Web 20260924-13, the reviewers' leftovers: the coach's log_session / log_sport commit records
// only after the save and say so when storage is full; string reps add as numbers; a hole in
// the phone's per-set RPE never reaches the watch as null; an edited Apple Health sport log
// stays Health (iCloud still drops its HR and calories) and a failed edit leaves no trace;
// Heavyweight moves a toast above an open sheet; an undated session no longer blanks Progress.
const { boot, assert, run } = require('../lib/harness');

run('save safety and provenance leftovers', async () => {
  const app = await boot({ native: true, seed: { kt_theme: 'heavyweight',
    kt_sports: JSON.stringify([{ id: 801, date: '2026-09-20', type: 'Cycling', duration: 60, data: { distance: 25, avgHR: 131, calories: 600 }, notes: 'From Apple Health' }]) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const realSet = Storage.prototype.setItem;
      const full = key => { Storage.prototype.setItem = function (k, v) { if (k === key) throw new Error('QuotaExceededError'); return realSet.call(this, k, v); }; };
      const ok = () => { Storage.prototype.setItem = realSet; };

      // A. coach log_session on a full phone: an honest error, no records raised, no phantom
      const prsBefore = JSON.stringify(getPRs()), nBefore = getSessions().length;
      full('kt_sessions');
      const res = executeCoachTool('log_session', { type: 'Push', date: todayISO(), exercises: [{ name: 'Bench Press', sets: 1, reps: [3], weight: 400 }] });
      ok();
      r.full = { ok: res.ok, err: res.error, prs: JSON.stringify(getPRs()) === prsBefore, n: getSessions().length === nBefore };
      const res2 = executeCoachTool('log_session', { type: 'Push', date: todayISO(), exercises: [{ name: 'Bench Press', sets: 1, reps: [3], weight: 400 }] });
      r.saved = { ok: res2.ok, pr: getPRs()['Bench Press'], n: getSessions().length === nBefore + 1, prs: getSessions().find(s => s.exercises.some(e => e.weight === 400)).prs };
      full('kt_sports');
      const sp = executeCoachTool('log_sport', { type: 'Yoga', duration: 30 });
      ok();
      r.sport = { ok: sp.ok, none: !getSportLogs().some(l => l.type === 'Yoga') };

      // B. string reps are numbers
      r.vol = calcVolume([{ name: 'Row', sets: 3, reps: ['8', '8', '8'], weight: 100 }]);

      // C. a hole in the phone's RPE log never reaches the watch as null
      openDeckRunner('Push');
      const A = runnerSession.exercises[0].name;
      runnerRepsLog[A] = [8, 8, 8]; runnerWeightsLog[A] = [100, 100, 100]; runnerCompleted[A] = 3;
      runnerRpeLog[A] = []; runnerRpeLog[A][0] = 7; runnerRpeLog[A][2] = 8;   // index 1 is a hole
      const lv = _buildWatchLive();
      r.live = { rlog: lv.rlog && lv.rlog[A] };
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');

      // D. an edited Health sport log stays Health
      openSportLogEditor(801); await wait(30);
      r.notesPrefill = document.getElementById('sleNotes').value;
      r.banner = /Imported from Apple Health/.test(document.getElementById('sportLogEditOverlay').textContent);
      // the toast moves above the open sheet in Heavyweight
      showToast('Probe');
      await wait(50);
      const tr = document.getElementById('toast').getBoundingClientRect(), sh = document.querySelector('#sportLogEditOverlay .kt-sheet').getBoundingClientRect();
      r.toastAbove = tr.bottom <= sh.top + 1;
      document.getElementById('sleNotes').value = 'Hilly loop';
      // storage full: nothing changes, the sheet stays open
      full('kt_sports'); saveSportLogEdit(801); ok();
      r.failEdit = { open: !!document.getElementById('sportLogEditOverlay'), notes: getSportLogs().find(l => l.id === 801).notes, hk: !getSportLogs().find(l => l.id === 801).hkOrig };
      saveSportLogEdit(801);
      const ed = getSportLogs().find(l => l.id === 801);
      r.edited = { notes: ed.notes, hkOrig: ed.hkOrig, health: _isHealthSport(ed) };
      const ic = JSON.parse(_sanitizeForICloud(JSON.stringify(buildBackupJSON())));
      const icr = ic.kt_sports.find(l => l.id === 801);
      r.icloud = { hr: 'avgHR' in icr.data, kcal: 'calories' in icr.data, dist: icr.data.distance };
      lsDel('kt_hk_imported');
      r.dupe = _healthSportDupe({ startDate: '2026-09-20T09:00:00', durationSec: 3600 }, 'Cycling');

      // E. an undated session (old backup) no longer blanks Progress
      const s = getSessions().slice(); const c = JSON.parse(JSON.stringify(s.find(x => x.type === 'Push'))); delete c.date; c.id = 424242;
      lsSet('kt_sessions', [c].concat(s));
      let thrown = null; try { switchTab('progress'); setProgressTab('lifts'); } catch (e) { thrown = e.message; }
      r.dateless = { thrown, len: document.getElementById('screen').textContent.length };
      return r;
    });
    assert(out.full.ok === false && /Storage is full/.test(out.full.err) && out.full.prs && out.full.n, 'a failed coach log raises no record and says so: ' + JSON.stringify(out.full));
    assert(out.saved.ok && out.saved.pr === 400 && out.saved.n && JSON.stringify(out.saved.prs) === '["Bench Press"]', 'a saved coach log commits its record: ' + JSON.stringify(out.saved));
    assert(out.sport.ok === false && out.sport.none, 'a failed coach sport log says so and leaves nothing: ' + JSON.stringify(out.sport));
    assert(out.vol === 2400, 'string reps add as numbers: ' + out.vol);
    assert(out.live.rlog === undefined, 'a per-set RPE log with a hole is not sent: ' + JSON.stringify(out.live));
    assert(out.notesPrefill === '' && out.banner, 'the Health marker is not shown as the user\'s notes: ' + JSON.stringify([out.notesPrefill, out.banner]));
    assert(out.toastAbove, 'Heavyweight: the toast sits above an open sheet');
    assert(out.failEdit.open && out.failEdit.notes === 'From Apple Health' && out.failEdit.hk, 'a failed sport edit changes nothing: ' + JSON.stringify(out.failEdit));
    assert(out.edited.notes === 'Hilly loop' && out.edited.health && out.edited.hkOrig && out.edited.hkOrig.duration === 60 && out.edited.hkOrig.date === '2026-09-20',
      'an edited Health sport log keeps its identity: ' + JSON.stringify(out.edited));
    assert(!out.icloud.hr && !out.icloud.kcal && out.icloud.dist === 25, 'iCloud still drops its heart rate and calories: ' + JSON.stringify(out.icloud));
    assert(out.dupe === true, 'with no ledger, the edited ride still stands in for its workout');
    assert(out.dateless.thrown === null && out.dateless.len > 500, 'an undated session no longer blanks Progress: ' + JSON.stringify(out.dateless));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
