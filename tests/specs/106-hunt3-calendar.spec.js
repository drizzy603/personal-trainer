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
