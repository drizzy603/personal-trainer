// Hunt 3 fixes, calendar (the Activity card, its day sheet and the logs it acts on):
// - H04: logs sharing one id (the coach's log calls in one reply, before 2026-09-30) get their own
//   ids at boot and after a restore, so the day sheet's Edit sets, Share, Delete and Date act on the
//   log shown. Delete and Undo take and give back every record with an id (as deleteRun), and a
//   Date move takes only the log on the sheet's day.
// - H03: deleting a log (day sheet or the coach's delete_log) or moving it behind a later one takes
//   back the working weight it set: a 1,850 lb typo no longer stays Bench's working weight (the
//   coach was told it and the plateau deload wrote 1,665 into the programme). It follows the lift's
//   newest log left (or goes with the last one), comes back on Undo, and a load the coach wrote
//   after the log stays.
// - M38: a date typed into the day sheet's Date field (desktop) moves nothing while it is typed:
//   it commits on Enter or when the field loses focus, focus lands back in the sheet, Escape drops
//   it, a cleared field snaps back, and a picked date (iOS, a calendar) still moves at once.
// - M05: a reps-only fix in the history editor (Edit sets) no longer resets every lift in the
//   session to its logged load (undoing a +5 written since); a load fix or a rename moves only its
//   own lift's working weight, as the coach's edit_session does. lb and kg.
// - L03: a day-sheet move that cannot be saved (storage full) stays on its day: the run's and the
//   activity's Date fields show the stored date again, and a workout no longer closes the sheet.
// - L24: fixing an older log's date (day sheet, run editor) keeps its programme week (Wk 6 of the
//   round it was logged in no longer becomes Wk 1, there and back); a move into another week of
//   this round takes that week.
// - L25: a date changed in the activity editor takes the day sheet and the card's month along (as
//   the run editor does), and Undo of a run-editor date change brings them back with the run.
// - L26: leaving Progress closes the day sheet, so the widget's Start (trovo://start) no longer
//   opens the Log tab and the runner beneath it.
// - L27: the month's distance on the Activity card and the poster is rounded once, in the owner's
//   unit (5.05 km read 3.2 mi, not 3.1).
// - L28: leaving COMPARE (Done, or another tab) clears the day it filtered by, so no selection
//   ring is left on the card with no sheet open.
const { boot, assert, run: run1, SEED } = require('../lib/harness');

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
// One browser at a time: each run starts when the one before it has finished.
let queue = Promise.resolve();
const run = (name, fn) => { queue = queue.then(() => new Promise(done => run1(name, () => fn().finally(done)))); };

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

run('H03: a deleted or moved log takes back the working weight it set; the coach\'s later load stays', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const T = todayISO(), d3 = addDays(T, -3), d10 = addDays(T, -10);
      const mk = (id, date, name, w) => ({ id, date, week: weekForDate(date), type: 'Push', label: 'Push', prs: [], exercises: [{ name, sets: 3, reps: [5, 5, 5], weight: w, weightLog: [w, w, w], isMain: true }] });
      lsSet('kt_sessions', [mk(101, d10, 'Bench Press', 180)]); recomputePRs();
      lsSet('kt_weights', { 'Bench Press': 180 });
      const W = n => getWeights()[n];
      const benchLine = () => (buildSystemPrompt().match(/CURRENT EXERCISE WEIGHTS[^\n]*\n(?:  [^\n]*\n)*/) || [''])[0].split('\n').filter(l => /Bench Press/.test(l)).join('|');
      const r = {};
      // the typo, logged today: it is the newest log, so it sets the working weight
      executeCoachTool('log_session', { type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 5, weight: 1850 }] });
      const typo = getSessions().find(s => s.date === T);
      r.logged = W('Bench Press');
      // deleted from the day sheet: back to the newest log left; Undo puts the typo's back
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(T); calSelectedDate = null; render(); await wait(30);
      document.querySelector('.cal-day[data-date="' + T + '"]').click(); await wait(40);
      [...document.querySelectorAll('#cdBody .kt-cd-acts button')].find(b => b.textContent.trim() === 'Delete').click(); await wait(40);
      r.deleted = { w: W('Bench Press'), line: benchLine(), prescribed: _prescribedLb('Bench Press') };
      const u = document.querySelector('#toast .kt-toast-undo'); if (u) u.click(); await wait(40);
      r.undone = { w: W('Bench Press'), back: getSessions().some(s => s.id === typo.id) };
      // the coach's delete_log follows the same rule
      const dl = executeCoachTool('delete_log', { store: 'session', id: typo.id });
      r.coachDel = { ok: dl.ok, w: W('Bench Press') };
      // a load the coach wrote after the log is the owner's plan: deleting the log keeps it
      executeCoachTool('log_session', { type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 5, weight: 185 }] });
      const real = getSessions().find(s => s.date === T);
      lsSet('kt_weights', Object.assign(getWeights(), { 'Bench Press': 190 }));
      deleteSession(real.id); await wait(20);
      r.override = W('Bench Press');
      lsSet('kt_weights', Object.assign(getWeights(), { 'Bench Press': 180 }));
      // the only log of a lift: its working weight goes with it
      executeCoachTool('log_session', { type: 'Push', date: d3, exercises: [{ name: 'Zercher Squat', sets: 3, reps: 5, weight: 135 }] });
      const only = getSessions().find(s => (s.exercises || []).some(e => e.name === 'Zercher Squat'));
      r.onlyLogged = W('Zercher Squat');
      deleteSession(only.id); await wait(20);
      r.onlyGone = Object.prototype.hasOwnProperty.call(getWeights(), 'Zercher Squat');
      // a move behind a later log hands the working weight to that log, and moving back takes it back
      lsSet('kt_sessions', [mk(102, T, 'Bench Press', 185), mk(103, d3, 'Bench Press', 180)].concat(getSessions())); lsSet('kt_weights', Object.assign(getWeights(), { 'Bench Press': 185 }));
      moveSession(102, addDays(T, -5)); await wait(20);
      r.movedBack = W('Bench Press');
      moveSession(102, T); await wait(20);
      r.movedFront = W('Bench Press');
      return r;
    });
    assert(out.logged === 1850, 'the typo is the newest log, so it set the working weight: ' + out.logged);
    assert(out.deleted.w === 180 && out.deleted.line === '  Bench Press: 180' && out.deleted.prescribed === 180, 'deleting it takes the working weight back to the newest log left: ' + JSON.stringify(out.deleted));
    assert(out.undone.w === 1850 && out.undone.back, 'Undo puts the log and its working weight back: ' + JSON.stringify(out.undone));
    assert(out.coachDel.ok && out.coachDel.w === 180, 'the coach\'s delete_log does the same: ' + JSON.stringify(out.coachDel));
    assert(out.override === 190, 'a load written after the log stays: ' + out.override);
    assert(out.onlyLogged === 135 && out.onlyGone === false, 'the last log of a lift takes its working weight with it: ' + JSON.stringify([out.onlyLogged, out.onlyGone]));
    assert(out.movedBack === 180 && out.movedFront === 185, 'a move behind a later log hands it the working weight; moving back takes it back: ' + JSON.stringify([out.movedBack, out.movedFront]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M38: a typed date moves nothing until Enter or leaving the field; Escape drops it; a picked date moves at once', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}' } });
  const page = app.page;
  try {
    const s = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const T = todayISO(), A = addDays(T, -5), B = addDays(T, -12);
      lsSet('kt_sessions', [{ id: 9090, date: A, week: weekForDate(A), type: 'Push', label: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 180, weightLog: [180, 180, 180], isMain: true }], prs: [] }]);
      window.__moves = [];
      const orig = window.moveSession; window.moveSession = function (id, d, f) { window.__moves.push(d); return orig(id, d, f); };
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(A); calSelectedDate = null; render(); await wait(30);
      document.querySelector('.cal-day[data-date="' + A + '"]').click(); await wait(40);
      // the field's parts follow the browser's locale (mm dd yyyy in en-US)
      const order = new Intl.DateTimeFormat(navigator.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(2026, 10, 22)).map(p => p.type).filter(t => t === 'year' || t === 'month' || t === 'day');
      return { A, B, order };
    });
    const keys = d => s.order.map(t => t === 'year' ? d.slice(0, 4) : t === 'month' ? d.slice(5, 7) : d.slice(8, 10)).join('');
    const field = () => page.locator('#cdBody .kt-cd-item').first().locator('input[type=date]');
    const state = () => page.evaluate(() => {
      const x = getSessions().find(y => y.id === 9090), f = document.querySelector('#cdBody .kt-cd-item input[type=date]'), a = document.activeElement;
      return { stored: x && x.date, field: f ? f.value : null, sheet: calSelectedDate, open: !!document.getElementById('calDayOverlay'), focus: a ? (a.id || a.tagName) : '', toast: (document.getElementById('toast') || {}).textContent || '', moves: window.__moves.length };
    });
    const r = {};
    // typing B over A, key by key: the log stays where it is and the field keeps focus
    await field().focus();
    r.typing = [];
    for (const k of keys(s.B)) { await page.keyboard.press(k); await page.waitForTimeout(25); const st = await state(); r.typing.push(st.stored + '|' + st.focus); }
    r.typed = await state();
    await page.keyboard.press('Enter'); await page.waitForTimeout(60);
    r.enter = await state();
    // typed back to A, then Tab out of the field: the move happens as it loses focus
    await field().focus();
    for (const k of keys(s.A)) { await page.keyboard.press(k); await page.waitForTimeout(15); }
    for (let i = 0; i < 6 && (await page.evaluate(() => (document.activeElement || {}).type === 'date')); i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(40); }
    r.tab = await state();
    // a cleared field moves nothing and shows the log's date again (no 'Invalid date')
    await field().focus();
    await page.keyboard.press('Backspace'); await page.waitForTimeout(25);
    r.cleared = await state();
    await page.evaluate(() => document.querySelector('#cdBody .kt-cd-item input[type=date]').blur()); await page.waitForTimeout(40);
    r.clearedBlur = await state();
    // Escape after a typed date: the sheet closes and nothing moves
    await field().focus();
    for (const k of keys(s.B)) { await page.keyboard.press(k); await page.waitForTimeout(15); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(60);
    r.escape = await state();
    // a picked date (no keys: the iOS wheel, a calendar) moves at once
    await page.evaluate(async A => { openCalDay(A); await new Promise(res => setTimeout(res, 40)); }, s.A);
    await page.evaluate(B => { const f = document.querySelector('#cdBody .kt-cd-item input[type=date]'); f.value = B; f.dispatchEvent(new Event('change', { bubbles: true })); }, s.B);
    await page.waitForTimeout(60);
    r.picked = await state();
    const { A, B } = s;
    assert(r.typing.every(x => x === A + '|INPUT') && r.typed.field === B && r.typed.moves === 0, 'nothing moves while the date is typed: ' + JSON.stringify([r.typing, r.typed]));
    assert(r.enter.stored === B && r.enter.sheet === B && r.enter.open && r.enter.moves === 1 && r.enter.focus === 'cdTitle', 'Enter moves it once, the sheet follows and focus lands on its title: ' + JSON.stringify(r.enter));
    assert(r.tab.stored === A && r.tab.sheet === A && r.tab.moves === 2 && r.tab.focus === 'cdTitle', 'leaving the field moves it: ' + JSON.stringify(r.tab));
    assert(r.cleared.field === '' && r.clearedBlur.stored === A && r.clearedBlur.field === A && r.clearedBlur.moves === 2 && !/Invalid date/.test(r.clearedBlur.toast), 'a cleared field moves nothing and snaps back: ' + JSON.stringify([r.cleared, r.clearedBlur]));
    assert(r.escape.stored === A && !r.escape.open && r.escape.moves === 2, 'Escape drops a typed date: ' + JSON.stringify(r.escape));
    assert(r.picked.stored === B && r.picked.sheet === B && r.picked.moves === 3, 'a picked date moves at once: ' + JSON.stringify(r.picked));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M05: a reps-only fix in Edit sets leaves every working weight alone; a load fix or a rename still moves its own', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const T = todayISO();
      lsSet('kt_sessions', [{ id: 5550001, date: T, week: weekForDate(T), type: 'Push', label: 'Push', prs: [], exercises: [
        { name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 185, weightLog: [185, 185, 185], isMain: true },
        { name: 'Overhead Press', sets: 3, reps: [8, 8, 8], weight: 95, weightLog: [95, 95, 95] }] }]);
      recomputePRs();
      // the coach (or keyless +5) raised Bench after the workout
      lsSet('kt_weights', { 'Bench Press': 190, 'Overhead Press': 95 });
      const W = () => Object.assign({}, getWeights());
      const benchLine = () => (buildSystemPrompt().match(/CURRENT EXERCISE WEIGHTS[^\n]*\n(?:  [^\n]*\n)*/) || [''])[0].split('\n').filter(l => /Bench Press/.test(l)).join('|');
      const edit = async (fn) => { openSessionEditor(5550001); await wait(30); fn(id => document.getElementById(id)); saveSessionEdit(); await wait(30); };
      const r = {};
      await edit(el => { el('se_1_2_r').value = '7'; });   // a reps typo on OHP
      r.reps = { w: W(), line: benchLine(), ohpReps: getSessions()[0].exercises[1].reps.join() };
      // kg: the prefilled loads are rounded, and an untouched one is still untouched
      setUnitW('kg'); await wait(20);
      await edit(el => { el('se_0_1_r').value = '4'; });
      r.kg = W();
      setUnitW('lb'); await wait(20);
      // a load fix on Bench moves Bench's working weight (this is its newest log), and only Bench's
      lsSet('kt_weights', Object.assign(getWeights(), { 'Overhead Press': 100 }));
      await edit(el => { ['0', '1', '2'].forEach(i => { el('se_0_' + i + '_w').value = '180'; }); });
      r.load = W();
      // a rename carries the lift's working weight to the new name
      await edit(el => { el('se_1_name').value = 'Seated Overhead Press'; });
      r.rename = W();
      return r;
    });
    assert(out.reps.w['Bench Press'] === 190 && out.reps.w['Overhead Press'] === 95 && out.reps.line === '  Bench Press: 190' && out.reps.ohpReps === '8,8,7', 'a reps-only fix keeps the +5 written since: ' + JSON.stringify(out.reps));
    assert(out.kg['Bench Press'] === 190 && out.kg['Overhead Press'] === 95, 'in kg too: ' + JSON.stringify(out.kg));
    assert(out.load['Bench Press'] === 180 && out.load['Overhead Press'] === 100, 'a load fix moves that lift\'s working weight only: ' + JSON.stringify(out.load));
    assert(out.rename['Seated Overhead Press'] > 0 && !('Overhead Press' in out.rename) && out.rename['Bench Press'] === 180, 'a rename carries the working weight to the new name: ' + JSON.stringify(out.rename));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L03: a day-sheet move that cannot be saved stays on its day, and the Date field shows the stored date', async () => {
  const D = daysAgo(20), N = daysAgo(25);
  const app = await boot({ native: true, seed: {
    kt_sessions: JSON.stringify([{ id: 7001, date: D, week: 3, type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 180, weightLog: [180, 180, 180], isMain: true }] }]),
    kt_runs: JSON.stringify([{ id: 7002, date: D, distance: 5, time: '25:00', type: 'easy', note: '' }]),
    kt_sports: JSON.stringify([{ id: 7003, date: D, type: 'Yoga', duration: 30, data: {}, notes: '' }]),
    kt_prs: '{}',
  } });
  try {
    const out = await app.page.evaluate(async ({ D, N }) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(D); calSelectedDate = null; render(); await wait(30);
      document.querySelector('.cal-day[data-date="' + D + '"]').click(); await wait(40);
      // storage is full for the logs from here on
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_runs' || k === 'kt_sessions' || k === 'kt_sports') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(this, k, v); };
      const field = re => { const it = [...document.querySelectorAll('#cdBody .kt-cd-item')].find(x => re.test(x.textContent)); return it && it.querySelector('input[type=date]'); };
      const pick = async re => {
        const f = field(re); f.value = N; f.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
        const f2 = field(re); return { field: f2 ? f2.value : null, sheet: calSelectedDate, open: !!document.getElementById('calDayOverlay') };
      };
      const r = {};
      try {
        r.run = await pick(/Edit run/); r.run.stored = getRuns()[0].date;
        r.sport = await pick(/Yoga/); r.sport.stored = getSportLogs()[0].date;
        r.session = await pick(/Edit sets/); r.session.stored = getSessions()[0].date;
        r.toast = (document.getElementById('toast') || {}).textContent || '';
      } finally { Storage.prototype.setItem = realSet; }
      return r;
    }, { D, N });
    ['run', 'sport', 'session'].forEach(k => {
      const x = out[k];
      assert(x.stored === D && x.field === D && x.open && x.sheet === D, k + ': a failed move stays on its day and the field shows the stored date: ' + JSON.stringify(x));
    });
    assert(out.toast.length > 0, 'the failed save says so: ' + out.toast);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L24: a date fix keeps an older log\'s programme week; a move into another week of this round takes that week', async () => {
  // week 2 of a round that began last Monday; the logs are week 6 of the round before
  const app = await boot({ native: true, seed: { kt_week: '2', kt_sessions: '[]', kt_runs: '[]', kt_prs: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const M = _mostRecentMonday(), O = addDays(M, -54);   // a Wednesday eight weeks back
      lsSet('kt_sessions', [{ id: 6601, date: O, week: 6, type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 180, weightLog: [180, 180, 180], isMain: true }] }]);
      lsSet('kt_runs', [{ id: 6602, date: O, week: 6, distance: 5, time: '25:00', type: 'easy', note: '' }]);
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(O); calSelectedDate = null; render(); await wait(30);
      openCalDay(O); await wait(40);
      const item = re => [...document.querySelectorAll('#cdBody .kt-cd-item')].find(x => re.test(x.textContent));
      const pick = async (re, d) => { const f = item(re).querySelector('input[type=date]'); f.value = d; f.dispatchEvent(new Event('change', { bubbles: true })); await wait(40); };
      const wk = () => getSessions()[0].week;
      const ttl = () => (item(/Edit sets/).querySelector('.kt-cd-ttl') || {}).textContent;
      const r = { roundStart: _roundStartISO() === addDays(M, -7) };
      await pick(/Edit sets/, addDays(O, 1)); r.sameWeek = [wk(), ttl()];
      await pick(/Edit sets/, addDays(O, -7)); r.earlierWeek = wk();
      await pick(/Edit sets/, O); r.back = wk();
      await pick(/Edit sets/, addDays(M, -5)); r.intoRoundWk1 = wk();
      await pick(/Edit sets/, M); r.intoRoundWk2 = wk();
      r.coach = (buildSystemPrompt().match(/\[id:6601\][^\n]*/) || [''])[0].indexOf('(Wk2)') > 0;
      // runs: the day sheet's Date field and the run editor follow the same rule
      openCalDay(O); await wait(40);
      await pick(/Edit run/, addDays(O, 1)); r.runSheet = getRuns()[0].week;
      closeCalDay();
      openRunEditor(6602); document.getElementById('re_date').value = addDays(O, -7); saveRunEdit(6602); await wait(30);
      r.runEditor = getRuns()[0].week;
      openRunEditor(6602); document.getElementById('re_date').value = addDays(M, -5); saveRunEdit(6602); await wait(30);
      r.runEditorIn = getRuns()[0].week;
      return r;
    });
    assert(out.roundStart, 'this round began last Monday');
    assert(out.sameWeek[0] === 6 && /Wk 6/.test(out.sameWeek[1]), 'a day later in the same week keeps Wk 6: ' + JSON.stringify(out.sameWeek));
    assert(out.earlierWeek === 6 && out.back === 6, 'before this round it keeps its own round\'s week, there and back: ' + JSON.stringify([out.earlierWeek, out.back]));
    assert(out.intoRoundWk1 === 1 && out.intoRoundWk2 === 2 && out.coach, 'moved into this round it takes that week: ' + JSON.stringify([out.intoRoundWk1, out.intoRoundWk2, out.coach]));
    assert(out.runSheet === 6 && out.runEditor === 6 && out.runEditorIn === 1, 'runs too, from the day sheet and the run editor: ' + JSON.stringify([out.runSheet, out.runEditor, out.runEditorIn]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L25: the activity editor\'s date change takes the day sheet along; Undo of a run-editor date change brings it back', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_prs: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const D = addDays(todayISO(), -40), NEW = addDays(D.slice(0, 8) + '01', -5);   // NEW: a day in the month before D's
      const view = () => ({ open: !!document.getElementById('calDayOverlay'), sel: calSelectedDate, month: calYear + '-' + String(calMonth + 1).padStart(2, '0'), block: !!document.querySelector('.cal-day[data-date="' + calSelectedDate + '"]') });
      const btn = label => [...document.querySelectorAll('#cdBody .kt-cd-acts button')].find(b => b.textContent.trim() === label);
      const openDay = async d => { switchTab('progress'); progressTab = 'lifts'; _calNavToDate(d); calSelectedDate = null; render(); await wait(30); document.querySelector('.cal-day[data-date="' + d + '"]').click(); await wait(40); };
      const r = { D, NEW };
      // a lone Yoga moved to the month before in its editor
      lsSet('kt_sports', [{ id: 5151, date: D, type: 'Yoga', duration: 30, data: {}, notes: '' }]);
      await openDay(D);
      btn('Edit').click(); await wait(40);
      document.getElementById('sleDate').value = NEW;
      [...document.querySelectorAll('#sportLogEditOverlay button')].find(b => /Save changes/.test(b.textContent)).click(); await wait(40);
      r.sport = Object.assign({ stored: getSportLogs()[0].date }, view());
      closeCalDay(); lsSet('kt_sports', []);
      // a run moved in the run editor, then Undo
      lsSet('kt_runs', [{ id: 6161, date: D, distance: 5, time: '25:00', type: 'easy', note: '' }]);
      await openDay(D);
      btn('Edit run').click(); await wait(40);
      document.getElementById('re_date').value = NEW;
      saveRunEdit(6161); await wait(40);
      r.run = Object.assign({ stored: getRuns()[0].date }, view());
      const u = document.querySelector('#toast .kt-toast-undo'); if (u) u.click(); await wait(40);
      r.runUndo = Object.assign({ stored: getRuns()[0].date }, view());
      return r;
    });
    const { D, NEW } = out;
    assert(out.sport.stored === NEW && out.sport.open && out.sport.sel === NEW && out.sport.month === NEW.slice(0, 7) && out.sport.block, 'the sheet and the card follow the activity: ' + JSON.stringify(out.sport));
    assert(out.run.stored === NEW && out.run.open && out.run.sel === NEW, 'the run editor already followed: ' + JSON.stringify(out.run));
    assert(out.runUndo.stored === D && out.runUndo.open && out.runUndo.sel === D && out.runUndo.month === D.slice(0, 7) && out.runUndo.block, 'Undo brings the sheet and the card back with the run: ' + JSON.stringify(out.runUndo));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L26: the widget\'s Start (trovo://start), or any other tab, closes an open day sheet', async () => {
  const D = daysAgo(3);
  const app = await boot({ native: true, seed: { kt_runs: JSON.stringify([{ id: 4401, date: D, distance: 5, time: '25:00', type: 'easy', note: '' }]) } });
  try {
    const out = await app.page.evaluate(async D => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const sheet = () => !!document.getElementById('calDayOverlay');
      const openDay = async () => { switchTab('progress'); progressTab = 'lifts'; _calNavToDate(D); calSelectedDate = null; render(); await wait(30); document.querySelector('.cal-day[data-date="' + D + '"]').click(); await wait(40); };
      const r = {};
      await openDay(); r.opened = sheet();
      switchTab('progress'); await wait(20); r.stays = sheet();   // Progress again: it stays
      window._trovoOpen('trovo://start'); await wait(400);
      r.link = { sheet: sheet(), tab: currentTab, sel: calSelectedDate, overlays: [...document.querySelectorAll('.kt-sheet-overlay')].map(o => o.id) };
      await openDay();
      switchTab('coach'); await wait(20); r.coach = { sheet: sheet(), sel: calSelectedDate };
      return r;
    }, D);
    assert(out.opened && out.stays, 'the sheet opens and stays on Progress: ' + JSON.stringify(out));
    assert(!out.link.sheet && out.link.tab === 'log' && out.link.sel === null && out.link.overlays.indexOf('calDayOverlay') < 0, 'Start closes the day sheet over the Log tab: ' + JSON.stringify(out.link));
    assert(!out.coach.sheet && out.coach.sel === null, 'another tab closes it too: ' + JSON.stringify(out.coach));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L27: the month\'s MI RUN on the Activity card and the poster is rounded once (5.05 km reads 3.1 mi)', async () => {
  const D = daysAgo(3);
  const app = await boot({ native: true, seed: { kt_unit_d: 'mi', kt_runs: JSON.stringify([{ id: 2701, date: D, distance: 5.05, time: '28:00', type: 'easy', note: '' }]) } });
  try {
    const out = await app.page.evaluate(async D => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(D); calSelectedDate = null; render(); await wait(30);
      r.foot = [...document.querySelectorAll('.kt-cal-foot .kt-cal-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).find(t => /MI RUN/.test(t));
      openCalDay(D); await wait(40);
      r.sheet = [...document.querySelectorAll('#cdBody .kt-cd-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).find(t => /dist/.test(t));
      closeCalDay();
      // the poster: what the canvas writes (its only decimal is the distance)
      const drawn = [], ft = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { drawn.push(String(t)); return ft.apply(this, arguments); };
      window._shareFile = function () {};
      try { shareMonthlyCard(D.slice(0, 7)); for (let i = 0; i < 40 && drawn.indexOf('MI RUN') < 0; i++) await wait(50); }
      finally { CanvasRenderingContext2D.prototype.fillText = ft; }
      r.poster = drawn.filter(t => /^\d+\.\d+$/.test(t));
      r.posterLabel = drawn.indexOf('MI RUN') >= 0;
      return r;
    }, D);
    assert(/^3\.1\s*MI RUN$/.test(out.foot || ''), 'the card reads 3.1 mi: ' + out.foot);
    assert(/3\.14 mi/.test(out.sheet || ''), 'as the day sheet\'s 3.14 mi: ' + out.sheet);
    assert(out.posterLabel && out.poster.join() === '3.1', 'the poster reads 3.1 mi: ' + JSON.stringify(out.poster));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L28: leaving COMPARE (Done, or another tab) clears the day it filtered by; no ring is left on the card', async () => {
  const D = daysAgo(3);
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async D => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      lsSet('kt_sessions', [{ id: 2801, date: D, week: weekForDate(D), type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 180, weightLog: [180, 180, 180], isMain: true }] }].concat(getSessions()));
      const ring = () => [...document.querySelectorAll('.cal-day.sel')].map(c => c.getAttribute('data-date'));
      const day = () => document.querySelector('.cal-day[data-date="' + D + '"]');
      const cmp = () => document.getElementById('cmp-btn');
      const r = {};
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(D); calSelectedDate = null; render(); await wait(30);
      cmp().click(); await wait(30);
      day().click(); await wait(30);
      r.inCmp = { cmpOn, ring: ring() };
      cmp().click(); await wait(30);   // Done
      r.done = { cmpOn, sel: calSelectedDate, ring: ring(), sheet: !!document.getElementById('calDayOverlay') };
      cmp().click(); await wait(30);
      day().click(); await wait(30);
      switchTab('log'); await wait(20); switchTab('progress'); await wait(30);
      r.tabs = { cmpOn, sel: calSelectedDate, ring: ring() };
      // outside COMPARE the day still opens its sheet, ringed
      day().click(); await wait(40);
      r.sheet = { open: !!document.getElementById('calDayOverlay'), ring: ring() };
      return r;
    }, D);
    assert(out.inCmp.cmpOn && out.inCmp.ring.join() === D, 'COMPARE filters by the tapped day: ' + JSON.stringify(out.inCmp));
    assert(!out.done.cmpOn && out.done.sel === null && out.done.ring.length === 0 && !out.done.sheet, 'Done leaves no ring: ' + JSON.stringify(out.done));
    assert(!out.tabs.cmpOn && out.tabs.sel === null && out.tabs.ring.length === 0, 'nor does leaving Progress: ' + JSON.stringify(out.tabs));
    assert(out.sheet.open && out.sheet.ring.join() === D, 'a day still opens its sheet: ' + JSON.stringify(out.sheet));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R20 (hunt 4): a workout logged at the load the plateau deload, the keyless +5 or the coach wrote,
// then deleted, put the older log's load back as the working weight (the coach was told 160 while
// the programme said 145). A log now carries what it set (wSet): one that met the working weight
// gives nothing back, a typo goes back to what it replaced (the coach's load included), and a log
// from before the stamp follows only when the programme did not prescribe its load.
run('R20: deleting a workout logged at the deload\'s, +5\'s or coach\'s load keeps that load; a typo still goes', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const T = todayISO(), d10 = addDays(T, -10), d3 = addDays(T, -3), cr0 = JSON.stringify(getCustomRoutine());
      const mk = (id, date, w) => ({ id, date, week: weekForDate(date), type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: w, weightLog: [w, w, w], isMain: true }] });
      const W = () => getWeights()['Bench Press'];
      const row = () => { const x = (getCustomRoutine().weeks[currentWeek - 1].push || []).find(e => e.name === 'Bench Press'); return x && x.weight; };
      const benchLine = () => (buildSystemPrompt().match(/CURRENT EXERCISE WEIGHTS[^\n]*\n(?:  [^\n]*\n)*/) || [''])[0].split('\n').filter(l => /Bench Press/.test(l)).join('|');
      const reset = () => { lsSet('kt_routine', JSON.parse(cr0)); lsSet('kt_sessions', [mk(101, d10, 160)]); recomputePRs(); lsSet('kt_weights', { 'Bench Press': 160 }); };
      const todays = () => getSessions().find(s => s.date === T);
      const delOnSheet = async () => {
        switchTab('progress'); progressTab = 'lifts'; _calNavToDate(T); calSelectedDate = null; render(); await wait(30);
        document.querySelector('.cal-day[data-date="' + T + '"]').click(); await wait(40);
        [...document.querySelectorAll('#cdBody .kt-cd-acts button')].find(b => b.textContent.trim() === 'Delete').click(); await wait(40);
        closeCalDay(); await wait(10);
      };
      const r = {};
      // today's Push through the runner, at what it prescribes, then deleted from the day sheet
      for (const k of ['deload', 'plus5', 'coach']) {
        reset();
        if (k === 'deload') _writeLoadLocal('Bench Press', 145);   // what applyPlateauFixLocal writes
        if (k === 'plus5') _writeLoadLocal('Bench Press', 165);    // what applyProgressionLocal writes
        if (k === 'coach') executeCoachTool('set_exercise_weight', { name: 'Bench Press', weight: 145 });
        switchTab('log'); switchLogSub('workout'); await wait(20);
        openDeckRunner('Push'); await wait(20);
        const presc = runnerWeights['Bench Press'];
        runnerGoTo(runnerSession.exercises.findIndex(e => e.name === 'Bench Press')); runnerEngaged = true; runnerLogAllAtTarget(); await wait(20);
        runnerFinishSession(); await wait(250); closeCompleteSheet(); await wait(20);
        const logged = { w: W(), stamp: JSON.stringify((todays() || {}).wSet) };
        await delOnSheet();
        r[k] = { presc, row: row(), logged, w: W(), line: benchLine(), prescribed: _prescribedLb('Bench Press'), gone: !todays() };
      }
      // a typo logged over the coach's 145 goes back to 145, not to the older log's 160
      reset();
      executeCoachTool('set_exercise_weight', { name: 'Bench Press', weight: 145 });
      executeCoachTool('log_session', { type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 1450 }] });
      r.typoLogged = W();
      await delOnSheet();
      r.typoGone = W();
      // logs from before the stamp: at the programme's load it stays, a typo follows the older log
      reset(); _writeLoadLocal('Bench Press', 145);
      lsSet('kt_sessions', [mk(102, T, 145)].concat(getSessions()));
      deleteSession(102); await wait(10);
      r.legacyAtPlan = W();
      reset();
      lsSet('kt_sessions', [mk(103, T, 1850)].concat(getSessions())); lsSet('kt_weights', { 'Bench Press': 1850 });
      deleteSession(103); await wait(10);
      r.legacyTypo = W();
      // a move behind an older log and back, then a delete
      reset();
      executeCoachTool('log_session', { type: 'Push', date: d3, exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 170 }] });
      executeCoachTool('log_session', { type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 175 }] });
      const mv = todays().id;
      moveSession(mv, addDays(T, -5)); await wait(10); r.movedBehind = W();
      moveSession(mv, T); await wait(10); r.movedFront = W();
      deleteSession(mv); await wait(10); r.movedDeleted = W();
      // a log that met the coach's 145, corrected to 150, then deleted: the coach's 145 again
      reset();
      executeCoachTool('set_exercise_weight', { name: 'Bench Press', weight: 145 });
      executeCoachTool('log_session', { type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 145 }] });
      executeCoachTool('edit_session', { id: todays().id, exercise: 'Bench Press', weight: 150 });
      r.edited = W();
      deleteSession(todays().id); await wait(10);
      r.editedGone = W();
      return r;
    });
    [['deload', 145], ['plus5', 165], ['coach', 145]].forEach(([k, L]) => {
      const x = out[k];
      assert(x.presc === L && x.logged.w === L && x.gone, k + ': the runner prescribed and logged ' + L + ': ' + JSON.stringify(x));
      assert(x.w === L && x.row === L && x.line === '  Bench Press: ' + L && x.prescribed === L, k + ': deleting that workout keeps ' + L + ' (the coach is told it, the +5 reads it): ' + JSON.stringify(x));
    });
    assert(out.typoLogged === 1450 && out.typoGone === 145, 'a typo over the coach\'s load goes back to that load: ' + JSON.stringify([out.typoLogged, out.typoGone]));
    assert(out.legacyAtPlan === 145 && out.legacyTypo === 160, 'logs from before the stamp: the plan\'s load stays, a typo follows: ' + JSON.stringify([out.legacyAtPlan, out.legacyTypo]));
    assert(out.movedBehind === 170 && out.movedFront === 175 && out.movedDeleted === 170, 'a move behind and back, then a delete: ' + JSON.stringify([out.movedBehind, out.movedFront, out.movedDeleted]));
    assert(out.edited === 150 && out.editedGone === 145, 'a corrected log gives back what it replaced: ' + JSON.stringify([out.edited, out.editedGone]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R21 (hunt 4): in Edit sets, a back-off set's load fix (the top set unchanged) still reset the
// lift's working weight to the logged top, undoing a +5 written since, and a rename wrote the
// logged top under the new name; the coach's edit_session did the same with a rename or a load
// restated as it was. Only a changed top set moves it now; a rename takes the old name's along.
run('R21: a back-off set\'s fix or a rename in Edit sets keeps the +5 written since; a top-set fix still moves it', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const T = todayISO(), O = addDays(T, -7);
      const seed = () => {
        lsSet('kt_sessions', [{ id: 5550101, date: T, week: weekForDate(T), type: 'Push', label: 'Push', prs: [], exercises: [
          { name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 185, weightLog: [185, 185, 180], isMain: true },
          { name: 'Overhead Press', sets: 3, reps: [8, 8, 8], weight: 95, weightLog: [95, 95, 95] }] }]);
        recomputePRs();
        lsSet('kt_weights', { 'Bench Press': 190, 'Overhead Press': 100 });   // the +5 (or the coach) since
      };
      const W = () => Object.assign({}, getWeights());
      const benchLine = () => (buildSystemPrompt().match(/CURRENT EXERCISE WEIGHTS[^\n]*\n(?:  [^\n]*\n)*/) || [''])[0].split('\n').filter(l => /Bench Press/.test(l)).join('|');
      const edit = async fn => { openSessionEditor(5550101); await wait(30); fn(id => document.getElementById(id)); saveSessionEdit(); await wait(30); };
      const r = {};
      seed(); await edit(el => { el('se_0_2_w').value = '175'; });
      r.backoff = { w: W(), line: benchLine(), log: getSessions()[0].exercises[0].weightLog.join() };
      seed(); await edit(el => { el('se_1_name').value = 'Seated Overhead Press'; });
      r.rename = W();
      seed(); executeCoachTool('edit_session', { id: 5550101, exercise: 'Overhead Press', rename_to: 'Seated Overhead Press' });
      r.coachRename = W();
      seed(); executeCoachTool('edit_session', { id: 5550101, exercise: 'Bench Press', reps: [5, 5, 4], weight: 185 });
      r.coachRestated = W();
      // the old name still has an older log: it keeps its working weight, the new name starts at this log's top
      seed();
      lsSet('kt_sessions', getSessions().concat([{ id: 5550100, date: O, week: weekForDate(O), type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Overhead Press', sets: 3, reps: [8, 8, 8], weight: 90, weightLog: [90, 90, 90] }] }]));
      await edit(el => { el('se_1_name').value = 'Seated Overhead Press'; });
      r.renameKept = W();
      // a fix of the top set moves the working weight (this is the lift's newest log)
      seed(); await edit(el => { el('se_0_0_w').value = '180'; el('se_0_1_w').value = '180'; });
      r.topFix = W();
      return r;
    });
    assert(out.backoff.w['Bench Press'] === 190 && out.backoff.line === '  Bench Press: 190' && out.backoff.log === '185,185,175', 'a back-off set\'s fix keeps the +5: ' + JSON.stringify(out.backoff));
    assert(out.rename['Seated Overhead Press'] === 100 && !('Overhead Press' in out.rename) && out.rename['Bench Press'] === 190, 'a rename takes the old name\'s working weight along: ' + JSON.stringify(out.rename));
    assert(out.coachRename['Seated Overhead Press'] === 100 && !('Overhead Press' in out.coachRename), 'the coach\'s rename too: ' + JSON.stringify(out.coachRename));
    assert(out.coachRestated['Bench Press'] === 190, 'a load restated as it was keeps the +5: ' + JSON.stringify(out.coachRestated));
    assert(out.renameKept['Overhead Press'] === 100 && out.renameKept['Seated Overhead Press'] === 95, 'with the old name still logged, the new one starts at this log\'s top: ' + JSON.stringify(out.renameKept));
    assert(out.topFix['Bench Press'] === 180 && out.topFix['Overhead Press'] === 100, 'a top-set fix still moves its own working weight: ' + JSON.stringify(out.topFix));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R26 (hunt 4): a lift whose older logs are imports in the nested shape ({sets:[{reps, weight}]},
// no weight of their own) lost its working weight when its newest log was deleted: the follow
// read weight alone, saw no log left, and the coach stopped being told the lift.
run('R26: deleting the newest log follows the lift\'s older nested-shape logs; the working weight stays', async () => {
  const nested = (id, date, w) => ({ id, date, week: 3, type: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: w }, { reps: 8, weight: w }, { reps: 8, weight: w }] }] });
  const app = await boot({ native: true, seed: { kt_sessions: JSON.stringify([nested(2601, daysAgo(7), 160), nested(2602, daysAgo(14), 155)]), kt_prs: '{}', kt_weights: JSON.stringify({ 'Bench Press': 160 }) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const T = todayISO();
      const W = () => getWeights()['Bench Press'];
      const benchLine = () => (buildSystemPrompt().match(/CURRENT EXERCISE WEIGHTS[^\n]*\n(?:  [^\n]*\n)*/) || [''])[0].split('\n').filter(l => /Bench Press/.test(l)).join('|');
      const r = { nested: getSessions().every(s => Array.isArray(s.exercises[0].sets)) };
      // a typo from before the stamp, deleted from the day sheet
      lsSet('kt_sessions', [{ id: 2603, date: T, week: weekForDate(T), type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 1650, weightLog: [1650, 1650, 1650], isMain: true }] }].concat(getSessions()));
      lsSet('kt_weights', { 'Bench Press': 1650 });
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(T); calSelectedDate = null; render(); await wait(30);
      document.querySelector('.cal-day[data-date="' + T + '"]').click(); await wait(40);
      [...document.querySelectorAll('#cdBody .kt-cd-acts button')].find(b => b.textContent.trim() === 'Delete').click(); await wait(40);
      closeCalDay(); await wait(10);
      r.legacy = { w: W(), line: benchLine() };
      // a correct log today (it set 165 over the nested 160), deleted by the coach
      executeCoachTool('log_session', { type: 'Push', date: T, exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 165 }] });
      const s = getSessions().find(x => x.date === T);
      r.logged = [W(), JSON.stringify(s.wSet)];
      executeCoachTool('delete_log', { store: 'session', id: s.id });
      r.coachDel = { w: W(), line: benchLine() };
      return r;
    });
    assert(out.nested, 'the imports are still nested after boot');
    assert(out.legacy.w === 160 && out.legacy.line === '  Bench Press: 160', 'the typo goes back to the newest nested log: ' + JSON.stringify(out.legacy));
    assert(out.logged[0] === 165 && out.logged[1] === '{"Bench Press":[null,165]}', 'the new log set 165 over the nested log\'s load: ' + JSON.stringify(out.logged));
    assert(out.coachDel.w === 160 && out.coachDel.line === '  Bench Press: 160', 'deleted, it gives the nested log\'s 160 back: ' + JSON.stringify(out.coachDel));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R22 (hunt 4): a photo shared into the app (Photos > Share > Fitness Programmer) opened the Coach
// chat under an open day sheet, its Delete buttons over the chat; L26 closed the sheet only in
// switchTab, and the share intake set the tab by hand (the tab bar kept Progress lit too).
run('R22: a shared photo closes the day sheet (and COMPARE) and opens the Coach chat with its tab lit', async () => {
  const D = daysAgo(3);
  const app = await boot({ native: true, seed: { kt_runs: JSON.stringify([{ id: 2201, date: D, distance: 5, time: '25:00', type: 'easy', note: '' }]) } });
  try {
    const out = await app.page.evaluate(async D => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const st = () => ({ sheet: !!document.getElementById('calDayOverlay'), tab: currentTab, view: coachView, sel: calSelectedDate, cmpOn,
        lit: [...document.querySelectorAll('.tab.active')].map(t => t.getAttribute('data-tab')).join(), img: !!pendingImage });
      const openDay = async () => { switchTab('progress'); progressTab = 'lifts'; _calNavToDate(D); calSelectedDate = null; render(); await wait(30); document.querySelector('.cal-day[data-date="' + D + '"]').click(); await wait(40); };
      // back in the foreground with a photo waiting: the shell's share hand-off
      const share = async () => {
        Capacitor.Plugins.TrovoShare.getPendingShare = () => { Capacitor.Plugins.TrovoShare.getPendingShare = () => Promise.resolve({}); return Promise.resolve({ imageBase64: 'iVBORw0KGgo=' }); };
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'));
        await wait(900);
      };
      const r = {};
      await openDay(); r.opened = st();
      await share(); r.shared = st();
      pendingImage = null;
      switchTab('progress'); render(); await wait(30);
      document.getElementById('cmp-btn').click(); await wait(30);
      r.cmp = st();
      await share(); r.cmpShared = st();
      return r;
    }, D);
    assert(out.opened.sheet && out.opened.lit === 'progress', 'the day sheet is open on Progress: ' + JSON.stringify(out.opened));
    assert(!out.shared.sheet && out.shared.sel === null && out.shared.tab === 'coach' && out.shared.view === 'chat' && out.shared.lit === 'coach' && out.shared.img, 'the photo lands in the Coach chat with the sheet closed and the Coach tab lit: ' + JSON.stringify(out.shared));
    assert(out.cmp.cmpOn && !out.cmpShared.cmpOn && out.cmpShared.tab === 'coach' && out.cmpShared.lit === 'coach', 'COMPARE is left as before: ' + JSON.stringify([out.cmp, out.cmpShared]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R23 (hunt 4): after a date typed into the day sheet (desktop, M38), the first press elsewhere in
// the sheet committed the move inside its mousedown: the repaint took the pressed button away and
// the click did nothing (✕ left the sheet open on the new day, another log's Delete or Edit sets
// did nothing, ‹ went nowhere). The move now lands at that press's click, before the button's own
// handler, however long the press is held.
run('R23: after a typed date, ✕, another log\'s Delete or Edit sets and ‹ still do what they say; the move lands too', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_prs: '{}', kt_runs: '[]', kt_sports: '[]' } });
  const page = app.page;
  try {
    const s = await page.evaluate(() => {
      const T = todayISO();
      // the field's parts follow the browser's locale (mm dd yyyy in en-US)
      const order = new Intl.DateTimeFormat(navigator.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => p.type).filter(t => t === 'year' || t === 'month' || t === 'day');
      return { A: addDays(T, -5), B: addDays(T, -12), C: addDays(T, -8), order };
    });
    const keys = d => s.order.map(t => t === 'year' ? d.slice(0, 4) : t === 'month' ? d.slice(5, 7) : d.slice(8, 10)).join('');
    // Push and Pull on A, Legs on B, a run on C (the logged day before A): the sheet opens on A
    const open = () => page.evaluate(async ({ A, B, C }) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      if (document.getElementById('calDayOverlay')) closeCalDay();
      const ex = (n, w) => [{ name: n, sets: 3, reps: [5, 5, 5], weight: w, weightLog: [w, w, w], isMain: true }];
      lsSet('kt_sessions', [
        { id: 9090, date: A, week: weekForDate(A), type: 'Push', label: 'Push', exercises: ex('Bench Press', 180), prs: [] },
        { id: 9091, date: A, week: weekForDate(A), type: 'Pull', label: 'Pull', exercises: ex('Barbell Row', 150), prs: [] },
        { id: 8080, date: B, week: weekForDate(B), type: 'Legs', label: 'Legs', exercises: ex('Squat', 225), prs: [] }]);
      lsSet('kt_runs', [{ id: 7070, date: C, distance: 5, time: '25:00', type: 'easy', note: '' }]);
      _sessEditId = null;
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(A); calSelectedDate = null; render(); await wait(30);
      openCalDay(A); await wait(40);
    }, s);
    const typeB = async () => {
      await page.locator('#cdBody .kt-cd-item').filter({ hasText: 'Push' }).locator('input[type=date]').focus();
      for (const k of keys(s.B)) { await page.keyboard.press(k); await page.waitForTimeout(15); }
    };
    // a real mouse press: down, held, up (the field loses focus at the down)
    const press = async (loc, hold) => {
      const b = await loc.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await page.waitForTimeout(hold || 0); await page.mouse.up();
      await page.waitForTimeout(80);
    };
    const state = () => page.evaluate(() => ({
      logs: getSessions().map(x => x.id + '@' + x.date).sort().join(' '), sheet: calSelectedDate, open: !!document.getElementById('calDayOverlay'),
      ring: [...document.querySelectorAll('.cal-day.sel')].map(e => e.getAttribute('data-date')).join(), editing: _sessEditId,
    }));
    const pull = () => page.locator('#cdBody .kt-cd-item').filter({ hasText: 'Pull' });
    const r = {};
    await open(); await typeB(); r.typed = await state();
    await press(page.locator('#cdBody .kt-sheet-x')); r.close = await state();
    await open(); await typeB(); await press(page.locator('#cdBody .kt-sheet-x'), 200); r.held = await state();
    await open(); await typeB(); await press(pull().locator('button.danger')); r.del = await state();
    await open(); await typeB(); await press(page.locator('#cdBody .kt-cd-nav button').first()); r.prev = await state();
    await open(); await typeB(); await press(pull().locator('button', { hasText: 'Edit sets' })); r.edit = await state();
    const { A, B, C } = s, moved = ['8080@' + B, '9090@' + B, '9091@' + A].sort().join(' ');
    assert(r.typed.logs === ['8080@' + B, '9090@' + A, '9091@' + A].sort().join(' ') && r.typed.sheet === A, 'nothing moves while the date is typed: ' + JSON.stringify(r.typed));
    assert(r.close.logs === moved && !r.close.open && r.close.sheet === null && r.close.ring === '', '✕ closes the sheet, the move lands and no ring is left: ' + JSON.stringify(r.close));
    assert(r.held.logs === moved && !r.held.open && r.held.ring === '', 'a press held on ✕ closes it too: ' + JSON.stringify(r.held));
    assert(r.del.logs === ['8080@' + B, '9090@' + B].join(' ') && r.del.open, 'another log\'s Delete deletes it, and the move lands: ' + JSON.stringify(r.del));
    assert(r.prev.logs === moved && r.prev.open && r.prev.sheet === C, '‹ goes to the day it names, and the move lands: ' + JSON.stringify(r.prev));
    assert(r.edit.logs === moved && r.edit.editing === 9091, 'another log\'s Edit sets opens its editor, and the move lands: ' + JSON.stringify(r.edit));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R24 (hunt 4): a log from the previous round's last week (Wk 12), nudged a day into this round
// (Wk 1, right) and moved back again, stayed Wk 1 (the sheet, the coach's (WkN), the share card):
// before this round a log keeps its stamp, and the first move had overwritten it. The move in now
// keeps the stamp it had (wk0) and the move back out restores it; a wk0 left from an earlier round
// is never given back.
run('R24: a log nudged from the previous round into this one and back is its own week again (sheet, runs, run editor)', async () => {
  // week 2 of a round that began last Monday; S is the Sunday before it, the previous round's Wk 12
  const app = await boot({ native: true, seed: { kt_week: '2', kt_sessions: '[]', kt_runs: '[]', kt_prs: '{}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const M = _mostRecentMonday(), R = addDays(M, -7), S = addDays(R, -1);
      lsSet('kt_sessions', [{ id: 7701, date: S, week: 12, type: 'Push', label: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 3, reps: [5, 5, 5], weight: 180, weightLog: [180, 180, 180], isMain: true }] }]);
      lsSet('kt_runs', [{ id: 7702, date: S, week: 12, distance: 5, time: '25:00', type: 'easy', note: '' }]);
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(S); calSelectedDate = null; render(); await wait(30);
      openCalDay(S); await wait(40);
      const item = re => [...document.querySelectorAll('#cdBody .kt-cd-item')].find(x => re.test(x.textContent));
      const pick = async (re, d) => { const f = item(re).querySelector('input[type=date]'); f.value = d; f.dispatchEvent(new Event('change', { bubbles: true })); await wait(40); };
      const ses = () => getSessions()[0].week, run = () => getRuns()[0].week;
      const r = { roundStart: _roundStartISO() === R };
      await pick(/Edit sets/, R); r.into = ses();
      await pick(/Edit sets/, M); r.intoWk2 = ses();
      await pick(/Edit sets/, S); r.back = ses(); r.clean = !('wk0' in getSessions()[0]);
      r.title = (item(/Edit sets/).querySelector('.kt-cd-ttl') || {}).textContent;
      r.coach = (buildSystemPrompt().match(/\[id:7701\][^\n]*/) || [''])[0].indexOf('(Wk12)') > 0;
      openCalDay(S); await wait(40);
      await pick(/Edit run/, R); r.runInto = run();
      await pick(/Edit run/, S); r.runBack = run();
      closeCalDay();
      openRunEditor(7702); document.getElementById('re_date').value = R; saveRunEdit(7702); await wait(30); r.edInto = run();
      openRunEditor(7702); document.getElementById('re_date').value = addDays(S, -3); saveRunEdit(7702); await wait(30); r.edBack = run();
      // in this round as Wk 1 (wk0 12), then a new round starts this Monday: a day's fix before it keeps Wk 1
      openCalDay(S); await wait(40);
      await pick(/Edit sets/, R); r.wk0 = getSessions()[0].wk0;
      _setWeek(1, M); render(); await wait(30);
      await pick(/Edit sets/, addDays(R, 1)); r.stale = [ses(), _roundStartISO() === M];
      return r;
    });
    assert(out.roundStart, 'this round began last Monday');
    assert(out.into === 1 && out.intoWk2 === 2, 'moved into this round it takes that week: ' + JSON.stringify([out.into, out.intoWk2]));
    assert(out.back === 12 && out.clean && /Wk 12/.test(out.title) && out.coach, 'moved back before this round it is Wk 12 again (sheet, coach): ' + JSON.stringify([out.back, out.clean, out.title, out.coach]));
    assert(out.runInto === 1 && out.runBack === 12 && out.edInto === 1 && out.edBack === 12, 'runs too, from the day sheet and the run editor: ' + JSON.stringify([out.runInto, out.runBack, out.edInto, out.edBack]));
    assert(out.wk0 === 12 && out.stale[0] === 1 && out.stale[1], 'a stamp kept from an earlier round is never given back: ' + JSON.stringify([out.wk0, out.stale]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R25 (hunt 4): the Sunday recap on Progress still rounded the week's distance twice (to 0.1 km,
// then in the owner's unit): a mi owner's 5.05 km week read 3.2 mi beside the Activity card's 3.1
// (L27 fixed only the card). It is rounded once, after dDisp; a week that rounds to 0 has no pill.
run('R25: the Sunday recap reads a 5.05 km week as 3.1 mi, as the Activity card beside it', async () => {
  const app = await boot({ native: true, seed: { kt_unit_d: 'mi', kt_sessions: '[]', kt_sports: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const T = todayISO(), r = {};
      // a Sunday whatever today is (the recap shows only then): its week is today and the six days before
      const sunday = fn => { const g = Date.prototype.getDay; Date.prototype.getDay = function () { return 0; }; try { return fn(); } finally { Date.prototype.getDay = g; } };
      const screen = () => {
        const recap = [...document.querySelectorAll('#screen .chart-card')].find(e => /this week, wrapped/.test(e.textContent));
        const foot = [...document.querySelectorAll('.kt-cal-foot .kt-cal-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).find(t => /RUN/.test(t));
        return { recap: recap ? recap.textContent.replace(/\s+/g, ' ').trim() : null, foot };
      };
      lsSet('kt_runs', [{ id: 2501, date: T, distance: 5.05, time: '28:00', type: 'easy', note: '' }]);
      switchTab('progress'); progressTab = 'lifts'; _calNavToDate(T); calSelectedDate = null;
      r.mi = sunday(() => { render(); return screen(); });
      lsSet('kt_unit_d', 'km');
      r.km = sunday(() => { render(); return screen(); });
      lsSet('kt_runs', [{ id: 2502, date: T, distance: 0.04, time: '0:20', type: 'easy', note: '' }]);
      r.tiny = sunday(() => { render(); return screen(); });
      return r;
    });
    assert(/3\.1\s*mi run/i.test(out.mi.recap || '') && /^3\.1\s*MI RUN$/.test(out.mi.foot || ''), 'the recap reads 3.1 mi, as the card: ' + JSON.stringify(out.mi));
    assert(/5\.1\s*km run/i.test(out.km.recap || '') && /^5\.1\s*KM RUN$/.test(out.km.foot || ''), 'km owners read 5.1 km in both: ' + JSON.stringify(out.km));
    assert(out.tiny.recap && !/run/i.test(out.tiny.recap), 'a week that rounds to 0 shows no distance pill: ' + JSON.stringify(out.tiny));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
