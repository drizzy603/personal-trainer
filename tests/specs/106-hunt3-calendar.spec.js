// Hunt 3 fixes, calendar (the Activity card, its day sheet and the logs it acts on):
// - H04: logs sharing one id (the coach's log calls in one reply, before 2026-09-30) get their own
//   ids at boot and after a restore, so the day sheet's Edit sets, Share, Delete and Date act on the
//   log shown. Delete and Undo take and give back every record with an id (as deleteRun), and a
//   Date move takes only the log on the sheet's day.
const { boot, assert, run, SEED } = require('../lib/harness');

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

run('H04: shared-id twins get their own ids; the day sheet acts on the log shown; Undo brings back every twin', async () => {
  const X = 1791131648911, A = daysAgo(30), B = daysAgo(29);
  const push = { id: X, date: A, week: 3, source: 'coach', type: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 155, isMain: true }], note: '', prs: [] };
  const pull = { id: X, date: B, week: 3, source: 'coach', type: 'Pull', exercises: [{ name: 'Barbell Row', sets: 3, reps: [8, 8, 8], weight: 135, isMain: true }], note: '', prs: [] };
  const noId = { date: B, week: 3, type: 'Legs', exercises: [{ name: 'Squat', sets: 3, reps: [5, 5, 5], weight: 225 }], prs: [] };
  const seed = {
    kt_sessions: JSON.stringify([pull, push, noId].concat(JSON.parse(SEED.kt_sessions))),
    kt_sports: JSON.stringify([{ id: X, date: B, type: 'Cycling', duration: 40, data: {}, notes: '' }, { id: X, date: A, type: 'Yoga', duration: 30, data: {}, notes: '' }]),
    kt_runs: JSON.stringify([{ id: X, date: B, distance: 5, time: '25:00', type: 'easy', note: '' }, { id: X, date: A, distance: 8, time: '45:00', type: 'easy', note: '' }]),
    kt_bw: JSON.stringify([{ id: X, date: B, weight: 180 }, { id: X, date: A, weight: 181 }]),
  };
  const app = await boot({ native: true, seed });
  try {
    const out = await app.page.evaluate(async ({ X, A, B, push, pull }) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const txt = q => { const e = document.querySelector(q); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
      const dupes = list => { const seen = {}, d = []; list.forEach(x => { const k = typeof x.id === 'number' ? String(x.id) : 'bad:' + x.id; if (seen[k]) d.push(k); seen[k] = 1; }); return d; };
      const near = list => list.filter(x => x.date >= A && x.date <= B).map(x => x.date + ' ' + x.type);
      const r = {};
      r.flag = localStorage.getItem('kt_ids_unique');
      r.dupes = [dupes(getSessions()), dupes(getRuns()), dupes(getSportLogs()), dupes(getBodyWeights())].map(d => d.length);
      // a twin keeps its place: the id next to the original (ids double as save times)
      r.twinIds = getSessions().filter(s => s.type === 'Push' || s.type === 'Pull').filter(s => s.date >= A).map(s => s.id - X).sort();
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(A); calSelectedDate = null; render(); await wait(40);
      document.querySelector('.cal-day[data-date="' + A + '"]').click(); await wait(40);
      const items = () => [...document.querySelectorAll('#cdBody .kt-cd-item')];
      const btn = (it, label) => [...it.querySelectorAll('.kt-cd-acts button')].find(b => b.textContent.trim() === label);
      btn(items()[0], 'Edit sets').click(); await wait(40);
      r.editor = (document.getElementById('se_0_name') || {}).value;
      closeSessionEditor(); await wait(20);
      let shared = null; const model = window._shareCardModel;
      window._shareCardModel = function (s) { shared = s.type; return model(s); };
      window._shareFile = function () {};
      btn(items()[0], 'Share card').click(); await wait(400);
      window._shareCardModel = model;
      r.shared = shared;
      btn(items()[0], 'Delete').click(); await wait(40);
      r.del = { left: near(getSessions()), toast: txt('#toast') };
      const u = document.querySelector('#toast .kt-toast-undo'); if (u) u.click(); await wait(40);
      r.undo = near(getSessions());
      const y = items().find(it => /Yoga/.test(it.textContent));
      btn(y, 'Delete').click(); await wait(40);
      r.yoga = { left: getSportLogs().map(s => s.type), toast: txt('#toast') };
      closeCalDay(); await wait(20);
      // an older backup carrying twins is fixed again by the restore
      _applyImportedData({ kt_sessions: [{ id: X, date: B, type: 'Pull', exercises: [], prs: [] }, { id: X, date: A, type: 'Push', exercises: [], prs: [] }], kt_week: 3 });
      await wait(40);
      r.restored = dupes(getSessions()).length;
      // twins that reach the log anyway (no migration in between): Delete takes both, Undo gives
      // both back, and a Date move on the sheet takes only the log on that day
      lsSet('kt_sessions', [JSON.parse(JSON.stringify(pull)), JSON.parse(JSON.stringify(push))]);
      lsSet('kt_sports', [{ id: X, date: B, type: 'Cycling', duration: 40, data: {}, notes: '' }, { id: X, date: A, type: 'Yoga', duration: 30, data: {}, notes: '' }]);
      _calNavToDate(A); render(); await wait(20);
      openCalDay(A); await wait(40);
      btn(items()[0], 'Delete').click(); await wait(40);
      r.twinDel = { left: getSessions().length, toast: txt('#toast') };
      const u2 = document.querySelector('#toast .kt-toast-undo'); if (u2) u2.click(); await wait(40);
      r.twinUndo = near(getSessions()).sort();
      const sp = items().find(it => /Yoga/.test(it.textContent));
      btn(sp, 'Delete').click(); await wait(40);
      r.twinSport = { left: getSportLogs().length, toast: txt('#toast') };
      const u3 = document.querySelector('#toast .kt-toast-undo'); if (u3) u3.click(); await wait(40);
      r.twinSportUndo = getSportLogs().map(s => s.type).sort();
      const C = addDays(B, 1);
      const inp = items()[0].querySelector('input[type=date]');
      inp.value = C; inp.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
      r.twinMove = getSessions().map(s => s.date + ' ' + s.type).sort();
      return r;
    }, { X, A, B, push, pull });
    assert(out.flag === '1' && out.dupes.join() === '0,0,0,0', 'every log has its own id after boot: ' + JSON.stringify([out.flag, out.dupes]));
    assert(out.twinIds.join() === '0,1', 'the twin takes the id beside the original: ' + out.twinIds);
    assert(out.editor === 'Bench Press' && out.shared === 'Push', 'Edit sets and Share open the log shown: ' + JSON.stringify([out.editor, out.shared]));
    assert(out.del.left.sort().join() === [B + ' Legs', B + ' Pull'].join() && /^Session deleted/.test(out.del.toast), 'Delete takes only the log shown: ' + JSON.stringify(out.del));
    assert(out.undo.length === 3, 'Undo brings it back: ' + JSON.stringify(out.undo));
    assert(out.yoga.left.join() === 'Cycling' && /^Yoga deleted/.test(out.yoga.toast), 'an activity twin: Delete takes Yoga only and says so: ' + JSON.stringify(out.yoga));
    assert(out.restored === 0, 'a restored backup gets its own ids again');
    assert(out.twinDel.left === 0 && /^2 sessions deleted/.test(out.twinDel.toast) && out.twinUndo.join() === [A + ' Push', B + ' Pull'].join(), 'twins left in the log: Delete takes both and Undo gives both back: ' + JSON.stringify([out.twinDel, out.twinUndo]));
    assert(out.twinSport.left === 0 && /^2 activities deleted/.test(out.twinSport.toast) && out.twinSportUndo.join() === 'Cycling,Yoga', 'activity twins: both go, the toast names no single one, Undo gives both back: ' + JSON.stringify([out.twinSport, out.twinSportUndo]));
    assert(out.twinMove.length === 2 && out.twinMove.indexOf(B + ' Pull') >= 0 && !out.twinMove.some(x => x.slice(0, 10) === A), 'a Date move takes only the log on the sheet\'s day: ' + JSON.stringify(out.twinMove));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
