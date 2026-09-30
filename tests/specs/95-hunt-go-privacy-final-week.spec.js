// Hunt 2026-09-26 "go" fixes, group A/B (web 20260929-4):
// A. kt_final_since is a raw 'YYYY-MM-DD' string: backups read it through lsGet (JSON), so every
//    final-week launch raised "Some saved data was unreadable" and the key was left out of every
//    backup (a restore then moved the programme's end). It is a raw-string key now, and the stray
//    kt_final_since_corrupt left by the old reads is cleared.
// B. Settings › Export wrote Apple Health heart rate, calories and the Health ledger to iCloud
//    Drive; the privacy policy says they stay out of the iCloud copy. Export's iCloud copy is
//    sanitised like the daily one.
const { boot, assert, run } = require('../lib/harness');

run('the final week backs up quietly and restores its end date', async () => {
  const app = await boot({ native: true, seed: { kt_final_since_corrupt: '2026-09-21' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      r.strayGone = localStorage.getItem('kt_final_since_corrupt') === null;
      _setWeek(12, '2026-09-21');
      const toasts = []; const o = window.showToast; window.showToast = function (m) { toasts.push(m); return o.apply(this, arguments); };
      const data = buildBackupJSON();
      window.showToast = o;
      r.inBackup = data.kt_final_since;
      r.noToast = !toasts.some(t => /unreadable/.test(t));
      r.noCorrupt = localStorage.getItem('kt_final_since_corrupt') === null;
      // a restore puts it back as the raw string the app reads
      localStorage.removeItem('kt_final_since');
      _applyImportedData(JSON.parse(JSON.stringify(data)));
      await wait(30);
      r.restored = localStorage.getItem('kt_final_since');
      // an older backup without it clears the phone's (it belongs to the programme restored)
      const old = JSON.parse(JSON.stringify(data)); delete old.kt_final_since;
      _applyImportedData(old); await wait(30);
      r.clearedByOld = localStorage.getItem('kt_final_since');
      return r;
    });
    assert(out.strayGone, 'the stray kt_final_since_corrupt is cleared at boot');
    assert(out.inBackup === '2026-09-21' && out.noToast && out.noCorrupt, 'the backup carries the raw date, with no unreadable-data toast: ' + JSON.stringify(out));
    assert(out.restored === '2026-09-21', 'a restore writes it back as the raw date: ' + out.restored);
    assert(out.clearedByOld !== '2026-09-21', 'an older backup without it does not keep the phone\'s old end date: ' + out.clearedByOld);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Export keeps Apple Health heart rate and calories out of iCloud', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const files = [], clouds = [];
      Capacitor.Plugins.Filesystem = { mkdir: () => Promise.resolve(), writeFile: (o) => { files.push(o.data); return Promise.resolve({}); } };
      Capacitor.Plugins.TrovoShare.saveToICloud = (o) => { clouds.push(o.content); return Promise.resolve({ saved: true }); };
      const runs = getRuns(); runs.unshift({ id: 777, date: todayISO(), distance: 5, time: '25:00', hr: 151, note: 'From Apple Health', startMs: Date.now() - 3600e3 }); lsSet('kt_runs', runs);
      const sp = getSportLogs(); sp.unshift({ id: 778, date: todayISO(), type: 'Cycling', duration: 40, notes: 'From Apple Health', data: { avgHR: 139, calories: 410, km: 18 } }); lsSet('kt_sports', sp);
      lsSet('kt_hk_imported', ['uuid-a', 'uuid-b']);
      exportData(); await wait(150);
      const file = JSON.parse(files[0]), cloud = JSON.parse(clouds[0]);
      const run = o => o.kt_runs.find(x => x.id === 777), ride = o => o.kt_sports.find(x => x.id === 778);
      return {
        file: { hr: run(file).hr, avg: ride(file).data.avgHR, kcal: ride(file).data.calories, ledger: !!file.kt_hk_imported },
        cloud: { hr: run(cloud).hr, avg: ride(cloud).data.avgHR, kcal: ride(cloud).data.calories, km: ride(cloud).data.km, ledger: !!cloud.kt_hk_imported },
      };
    });
    assert(out.file.hr === 151 && out.file.avg === 139 && out.file.kcal === 410 && out.file.ledger, 'the on-device Files copy is the full backup: ' + JSON.stringify(out.file));
    assert(out.cloud.hr === undefined && out.cloud.avg === undefined && out.cloud.kcal === undefined && !out.cloud.ledger && out.cloud.km === 18, 'the iCloud copy leaves Health HR, calories and the ledger out: ' + JSON.stringify(out.cloud));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
