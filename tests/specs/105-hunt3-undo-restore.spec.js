// Hunt 3 fixes, undo and restore:
// - A new round retires the old round's undo state: an earlier coach reply's PLAN CHANGES card
//   (and its Undo) goes, Restore Previous holds round 1 as it was just before the swap, an open
//   scope snapshots the new round, and restoring the other round drops ROUND N · WEEK 1 (H11).
// - The reply's undo point survives a relaunch (M21).
// - A restore or an Undo last restore that runs out of space keeps the undo copy of what was
//   here (H07), and a restore that stops half way frees before it puts keys back, reads each one
//   back, and says so when one cannot be (it claimed "Nothing was changed" over a lost log) (H08).
// - Restore Previous restores the version before the last change: each Routines visit is its own
//   undo point, and a Restore Previous, a Programme History restore or the starter plan leaves no
//   scope open (the next edit took no snapshot); a history restore retires the old reply's card (M17).
// - Restore Previous (and the ledger Undo) on a full phone changes nothing and says nothing was
//   restored: the previous programme used to be lost from every key under "restored" (M18).
// - Undo after the coach extended the programme lands on the restored last week, still the final
//   week, not week 1 (M19).
// - Undo of the coach's set_exercise_weight puts the working weight back with the programme (the
//   snapshot notes it), unless a newer log set its own; Restore Previous again swaps it back; a
//   working-weight-only reply is an undo point too (M20).
// - Restore previous programme is a row in Settings › Programme whenever there is a previous
//   version (keyless owners included), and How It Works points there (M22). After a new
//   programme or a reset it holds the programme as it was, not a stale copy from before its last
//   edit (M17/M22 follow-up).
// - A restore (or Undo last restore) before a new programme has started keeps its start: the
//   backup carries kt_week_monday, and week 1 on a Monday still ahead is kept (M23).
// - Restoring from a full Programme History keeps the oldest entry (only the restored one leaves),
//   and a failed write changes nothing (M27).
// - PLAN CHANGES retires only once its Undo is done: Cancel, or an Undo that could not be saved,
//   keeps the card and its Undo (L37).
// - swap_cadence_days on a week the programme does not have is refused before the snapshot, so
//   the earlier change keeps its undo point (L38).
// - A restore's undo copy (kt_pre_restore) goes once its week is over: at launch, and before
//   lsSet's retry when a save needs the room; a copy inside its week is never dropped (L01).
// - The restore confirm names the local day the backup was exported, not the UTC one (L50).
// - A body-weight or measurement save that fails never reads as saved: no "logged · UNDO" strip,
//   no "Measurements saved" over the storage-full error, and the fields keep what was typed (L02).
const { boot, assert, run } = require('../lib/harness');

const MOCK = `(replies) => { let n = 0; window.fetch = async () => new Response(JSON.stringify(replies[Math.min(n++, replies.length - 1)]), { status: 200, headers: { 'content-type': 'application/json' } }); }`;
const OHP_REPLY = [
  { content: [{ type: 'tool_use', id: 't1', name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Overhead Press', action: 'change', weight: 110 } }], stop_reason: 'tool_use', usage: {} },
  { content: [{ type: 'text', text: 'Done: Overhead Press goes to 110 lb from this week.' }], stop_reason: 'end_turn', usage: {} },
];
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const thisMonday = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };

run('a new round retires the old round\'s Undo; Restore Previous brings back round 1 as it was', async () => {
  const app = await boot({ native: true, seed: { kt_week: '11', kt_apikey: 'sk-test' } });
  try {
    const out = await app.page.evaluate(async ([MOCK, OHP_REPLY]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, ohp = (cr, w) => cr.weeks[w - 1].push.find(e => e.name === 'Overhead Press').weight;
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const ledger = async () => { switchTab('coach'); coachView = 'chat'; render(); await wait(30); const c = document.querySelector('.kt-ledger-card'); return c ? { undo: [...c.querySelectorAll('button')].some(b => /Undo/.test(b.textContent)) } : null; };
      eval(MOCK)(OHP_REPLY);
      coachMessages.push({ role: 'user', content: 'Make my overhead press heavier' }); saveCoachHistory();
      await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
      r.before = await ledger();
      // M21: the undo point is saved with the chat, so a relaunch still offers Undo
      loadCoachHistory();
      r.relaunch = await ledger();
      // an open Routines-style scope from before the swap
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Lateral Raise', currentWeek - 1, 25, { markOwner: true }), { scope: 'routines' });
      const round1 = localStorage.getItem('kt_routine');
      // the snapshot's bookkeeping (_clock: the week it was on, R16; _w) is not the programme
      const bare = o => { const c = JSON.parse(JSON.stringify(o)); delete c._clock; delete c._w; return JSON.stringify(c); };
      lsSet('kt_routine_next', { startsOn: todayISO(), at: todayISO() });
      const nb = _applyNextRound(false);
      r.swap = { ok: !!nb, cycle: getCustomRoutine().cycle, week: currentWeek, scope: localStorage.getItem('kt_routine_backup_scope'),
        backupIsRound1: bare(lsGet('kt_routine_backup')) === round1, seen: coachMessages.filter(m => m._tools).every(m => m._ledgerSeen),
        stored: JSON.parse(localStorage.getItem('kt_coach_msgs')).filter(m => m._tools).every(m => m._ledgerSeen),
        scopeOpen: _routineScope };   // the 'routines' scope left open would take no snapshot of round 2
      r.after = await ledger();
      r.introBefore = !!lsGet('kt_round_intro');
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      const cr = getCustomRoutine();
      r.restored = { cycle: cr.cycle || 1, week: currentWeek, ohp11: ohp(cr, 11), intro: !!lsGet('kt_round_intro'), backupCycle: (lsGet('kt_routine_backup') || {}).cycle };
      return r;
    }, [MOCK, OHP_REPLY]);
    assert(out.before && out.before.undo, 'the reply offers Undo: ' + JSON.stringify(out.before));
    assert(out.relaunch && out.relaunch.undo, 'Undo survives a relaunch (M21): ' + JSON.stringify(out.relaunch));
    assert(out.swap.ok && out.swap.cycle === 2 && out.swap.week === 1 && out.swap.scope === 'round:2' && out.swap.backupIsRound1, 'the swap keeps round 1 as Restore Previous under its own scope: ' + JSON.stringify(out.swap));
    assert(out.swap.seen && out.swap.stored && out.after === null, 'the old round\'s PLAN CHANGES card retires: ' + JSON.stringify([out.swap, out.after]));
    assert(out.swap.scopeOpen === null, 'no scope stays open across the swap: ' + out.swap.scopeOpen);
    assert(out.introBefore && out.restored.cycle === 1 && out.restored.ohp11 === 110 && !out.restored.intro && out.restored.backupCycle === 2, 'restoring round 1 brings it back as it was and drops ROUND 2 · WEEK 1: ' + JSON.stringify(out.restored));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a round that swaps in at launch retires the stored PLAN CHANGES card', async () => {
  const mon = thisMonday();
  const msgs = [
    { role: 'user', content: 'Make my overhead press heavier' },
    { role: 'assistant', content: 'Done.', _tools: [{ name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Overhead Press', action: 'change', weight: 110 }, result: { ok: true }, units: { w: 'lb', d: 'km' } }], _undo: 'coach:1' },
  ];
  const app = await boot({ seed: { kt_week: '12', kt_week_monday: mon, kt_apikey: 'sk-test', kt_coach_msgs: JSON.stringify(msgs), kt_routine_backup_scope: 'coach:1',
    kt_routine_next: JSON.stringify({ startsOn: mon, at: mon }) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      switchTab('coach'); coachView = 'chat'; render(); await wait(30);
      return { cycle: getCustomRoutine().cycle, week: currentWeek, scope: localStorage.getItem('kt_routine_backup_scope'),
        card: !!document.querySelector('.kt-ledger-card'), stored: JSON.parse(localStorage.getItem('kt_coach_msgs'))[1]._ledgerSeen === true };
    });
    assert(out.cycle === 2 && out.week === 1 && out.scope === 'round:2', 'round 2 swapped in at launch: ' + JSON.stringify(out));
    assert(!out.card && out.stored, 'the stored card is retired: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// A storage quota measured like the browser's (a replaced value counts once): `room` characters
// above what is stored now.
const QUOTA = `(room) => { const orig = window.__origSet || Storage.prototype.setItem; window.__origSet = orig;
  const used = () => { let u = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); u += k.length + (localStorage.getItem(k) || '').length; } return u; };
  const limit = used() + room;
  Storage.prototype.setItem = function (k, v) { const old = this.getItem(k); const next = used() - (old == null ? 0 : k.length + old.length) + k.length + String(v).length;
    if (next > limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; }`;
const ROOM = `() => { if (window.__origSet) Storage.prototype.setItem = window.__origSet; }`;
const FULL = `(keys) => { const orig = window.__origSet || Storage.prototype.setItem; window.__origSet = orig; Storage.prototype.setItem = function (k, v) { if (keys.indexOf(k) >= 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; }`;

run('a restore or an undo that runs out of space keeps the undo copy of what was here', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([QUOTA, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const quota = eval(QUOTA), room = eval(ROOM), r = {};
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const toast = () => (document.getElementById('toast') || {}).textContent || '';
      const copy = () => { const s = JSON.parse(localStorage.getItem('kt_pre_restore') || 'null'); return s ? s.data.kt_sessions.length : null; };
      const clone = o => JSON.parse(JSON.stringify(o));
      const base = buildBackupJSON(), O = getSessions().length;
      const A = clone(base); A.kt_sessions = A.kt_sessions.slice(0, 3).map(s => Object.assign({}, s, { id: s.id + 7000000 }));
      const B = clone(base); B.kt_runs = []; for (let i = 0; i < 2000; i++) B.kt_runs.push(Object.assign({}, base.kt_runs[i % base.kt_runs.length], { id: 9000000 + i }));
      r.a = { res: _applyImportedData(clone(A)), sessions: getSessions().length, copy: copy() };
      // a second restore that cannot fit: nothing changes, and Undo still brings back what was here before the first
      quota(5000);
      const resB = _applyImportedData(clone(B));
      room();
      r.b = { res: resB, sessions: getSessions().length, copy: copy(), toast: toast() };
      // Undo on a nearly full phone: it stops, and the copy stays
      quota(500);
      _undoLastRestore(); await wait(20); confirm(); await wait(30);
      room();
      r.undoFull = { sessions: getSessions().length, copy: copy(), toast: toast() };
      // with room it brings the data back, and the copy goes
      _undoLastRestore(); await wait(20); confirm(); await wait(30);
      r.undo = { sessions: getSessions().length, copy: copy() };
      r.O = O;
      return r;
    }, [QUOTA, ROOM]);
    assert(out.a.res === true && out.a.sessions === 3 && out.a.copy === out.O, 'the first restore applies and keeps a copy: ' + JSON.stringify(out.a));
    assert(out.b.res === false && out.b.sessions === 3 && out.b.copy === out.O && /Nothing was changed/.test(out.b.toast), 'a stopped restore puts the earlier copy back: ' + JSON.stringify(out.b));
    assert(out.undoFull.sessions === 3 && out.undoFull.copy === out.O && /Undo stopped/.test(out.undoFull.toast), 'an undo that runs out of space keeps the copy: ' + JSON.stringify(out.undoFull));
    assert(out.undo.sessions === out.O && out.undo.copy === null, 'with room, Undo brings the data back and the copy goes: ' + JSON.stringify(out.undo));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a restore that stops half way puts every key back, or says so and keeps the copy', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([QUOTA, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const quota = eval(QUOTA), room = eval(ROOM), r = {};
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const toast = () => (document.getElementById('toast') || {}).textContent || '';
      const msgs = []; for (let i = 0; i < 6; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: 'message ' + i + ' ' + 'lorem ipsum '.repeat(40) });
      localStorage.setItem('kt_coach_msgs', JSON.stringify(msgs)); delete _lsCache['kt_coach_msgs'];
      const sess0 = localStorage.getItem('kt_sessions'), runs0 = localStorage.getItem('kt_runs'), chat0 = localStorage.getItem('kt_coach_msgs');
      // the backup: fewer sessions, more runs (fitting only in the room the sessions free) and a longer chat (the write that fails)
      const b = buildBackupJSON(); delete b._manifest;
      const S0 = JSON.stringify(b.kt_sessions).length;
      b.kt_sessions = b.kt_sessions.slice(0, 4);
      const S4 = JSON.stringify(b.kt_sessions).length, R0 = JSON.stringify(b.kt_runs).length;
      const extra = Object.assign({}, b.kt_runs[0], { id: 1700000000000, date: '2026-05-01', note: '' });
      b.kt_runs = b.kt_runs.concat([extra]);
      extra.note = 'n'.repeat(R0 + (S0 - S4) - 1000 - JSON.stringify(b.kt_runs).length);
      b.kt_coach_msgs = msgs.concat([{ role: 'user', content: 'z'.repeat(10000) }]);
      const snap = buildBackupJSON(); delete snap._manifest;
      quota('kt_pre_restore'.length + JSON.stringify({ at: Date.now(), data: snap }).length + 2000);
      const res = _applyImportedData(JSON.parse(JSON.stringify(b)));
      room();
      r.ordered = { res, sess: localStorage.getItem('kt_sessions') === sess0, runs: localStorage.getItem('kt_runs') === runs0, chat: localStorage.getItem('kt_coach_msgs') === chat0,
        copy: localStorage.getItem('kt_pre_restore') === null ? null : 'kept', toast: toast(), app: getSessions().length === JSON.parse(sess0).length };
      // a key that cannot be put back: the toast says so, and the copy holds what was here
      let n = 0; const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_coach_msgs' || (k === 'kt_sessions' && ++n > 1)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
      const res2 = _applyImportedData(JSON.parse(JSON.stringify(b)));
      Storage.prototype.setItem = orig;
      const c = JSON.parse(localStorage.getItem('kt_pre_restore') || 'null');
      r.stuck = { res: res2, toast: toast(), copy: !!c && JSON.stringify(c.data.kt_sessions) === sess0 };
      _undoLastRestore(); await wait(20); confirm(); await wait(30);
      r.back = { sess: localStorage.getItem('kt_sessions') === sess0, copy: localStorage.getItem('kt_pre_restore') === null ? null : 'kept' };
      return r;
    }, [QUOTA, ROOM]);
    assert(out.ordered.res === false && out.ordered.sess && out.ordered.runs && out.ordered.chat && out.ordered.app, 'every key is put back: ' + JSON.stringify(out.ordered));
    assert(/Nothing was changed/.test(out.ordered.toast) && out.ordered.copy === null, 'nothing changed, and no stray undo copy: ' + JSON.stringify(out.ordered));
    assert(out.stuck.res === false && /before everything could be put back/.test(out.stuck.toast) && out.stuck.copy, 'a key that cannot be put back is said, and the copy holds what was here: ' + JSON.stringify(out.stuck));
    assert(out.back.sess && out.back.copy === null, 'Undo last restore brings it back: ' + JSON.stringify(out.back));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Restore Previous restores the version before the last change', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test' } });
  try {
    const out = await app.page.evaluate(async ([MOCK, OHP_REPLY]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const w = name => getCustomRoutine().weeks[currentWeek - 1].push.find(e => e.name === name).weight;
      const edit = (name, lb) => _commitRoutine(cr => _progCarryLoad(cr, 'push', name, currentWeek - 1, lb, { markOwner: true }), { scope: 'routines' });
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(20); };
      const b0 = w('Bench Press'), o0 = w('Overhead Press');
      // one visit: Bench, Restore Previous, OHP, Restore Previous
      openRoutines(); await wait(20);
      edit('Bench Press', b0 + 25); await restorePrev();
      edit('Overhead Press', o0 + 10); await restorePrev();
      r.oneVisit = [w('Bench Press') - b0, w('Overhead Press') - o0];
      closeRoutines();
      // two visits: Restore Previous undoes the second
      openRoutines(); await wait(20); edit('Bench Press', b0 + 25); closeRoutines();
      openRoutines(); await wait(20); edit('Overhead Press', o0 + 15); closeRoutines();
      await restorePrev();
      r.twoVisits = [w('Bench Press') - b0, w('Overhead Press') - o0];
      // a Programme History restore, then an edit in the same kind of visit
      const B = JSON.parse(JSON.stringify(getCustomRoutine())); B.name = 'Programme B';
      lsSet('kt_routine_archive', [{ id: 42, archivedAt: todayISO(), routine: B }]);
      openRoutines(); await wait(20); edit('Bench Press', b0 + 30);
      restoreArchivedRoutine(42); await wait(20); confirm(); await wait(20);
      r.histBackup = { name: (lsGet('kt_routine_backup') || {}).name, scope: localStorage.getItem('kt_routine_backup_scope') };
      const bB = w('Bench Press');
      edit('Bench Press', bB + 20); closeRoutines();
      await restorePrev();
      r.history = { name: getCustomRoutine().name, bench: w('Bench Press') - bB };
      // a reply's PLAN CHANGES card retires when another programme is restored from history
      eval(MOCK)(OHP_REPLY);
      coachMessages = [{ role: 'user', content: 'ohp 110' }];
      await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      const C = JSON.parse(JSON.stringify(getCustomRoutine())); C.name = 'Programme C';
      lsSet('kt_routine_archive', [{ id: 43, archivedAt: todayISO(), routine: C }].concat(getRoutineArchive()));
      restoreArchivedRoutine(43); await wait(20); confirm(); await wait(20);
      switchTab('coach'); coachView = 'chat'; render(); await wait(30);
      r.card = !!document.querySelector('.kt-ledger-card');
      // the starter plan leaves no scope open either
      _routineScope = 'routines';
      applyStarterRoutine({ goal: 'strength', days: 3, exp: 'intermediate', equip: 'full', focus: 'balanced' }); await wait(20);
      r.starter = { scope: _routineScope, backup: (lsGet('kt_routine_backup') || {}).name };
      return r;
    }, [MOCK, OHP_REPLY]);
    assert(JSON.stringify(out.oneVisit) === '[0,0]', 'Restore Previous after Restore Previous undoes the later edit only: ' + JSON.stringify(out.oneVisit));
    assert(JSON.stringify(out.twoVisits) === '[25,0]', 'two visits are two undo points: ' + JSON.stringify(out.twoVisits));
    assert(/^history:/.test(out.histBackup.scope || '') && out.histBackup.name !== 'Programme B', 'a history restore keeps the programme it replaced as Restore Previous: ' + JSON.stringify(out.histBackup));
    assert(out.history.name === 'Programme B' && out.history.bench === 0, 'after a history restore and an edit, Restore Previous brings back the restored programme before the edit: ' + JSON.stringify(out.history));
    assert(out.card === false, 'the old reply\'s card retires with the programme it changed');
    assert(out.starter.scope === null && out.starter.backup === 'Programme C', 'the starter plan leaves no scope open and keeps the programme it replaced: ' + JSON.stringify(out.starter));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Restore Previous on a full phone changes nothing; past the restored end it lands on the last week', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([FULL, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const full = eval(FULL), room = eval(ROOM), r = {};
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const toast = () => (document.getElementById('toast') || {}).textContent || '';
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', currentWeek - 1, 185, { markOwner: true }), { scope: 'routines' });
      const curRaw = localStorage.getItem('kt_routine'), bakRaw = localStorage.getItem('kt_routine_backup');
      // the programme cannot be written, then the backup cannot
      for (const keys of [['kt_routine'], ['kt_routine_backup']]) {
        full(keys);
        restoreRoutineBackup(); await wait(20); confirm(); await wait(20);
        room();
        r[keys[0]] = { routine: localStorage.getItem('kt_routine') === curRaw, backup: localStorage.getItem('kt_routine_backup') === bakRaw, toast: toast() };
      }
      // M19: Undo after the coach added weeks 13-14 and moved to week 13
      _setWeek(12);
      _commitRoutine(cr => { const a = JSON.parse(JSON.stringify(cr.weeks[11])), b = JSON.parse(JSON.stringify(cr.weeks[11])); a.wk = 13; b.wk = 14; cr.weeks.push(a, b); return 2; }, { scope: 'coach:extend' });
      _setWeek(13);
      r.extended = { week: currentWeek, total: getTotalWeeks() };
      restoreRoutineBackup(); await wait(20); confirm(); await wait(20);
      r.undone = { week: currentWeek, total: getTotalWeeks(), finalSince: localStorage.getItem('kt_final_since'), stored: lsGet('kt_week') };
      return r;
    }, [FULL, ROOM]);
    for (const k of ['kt_routine', 'kt_routine_backup']) {
      const x = out[k];
      assert(x.routine && x.backup && /storage full/.test(x.toast) && !/restored/.test(x.toast), 'a failed write (' + k + ') leaves both versions where they were: ' + JSON.stringify(x));
    }
    assert(out.extended.week === 13 && out.extended.total === 14, 'the programme was extended: ' + JSON.stringify(out.extended));
    assert(out.undone.week === 12 && out.undone.stored === 12 && out.undone.total === 12 && !!out.undone.finalSince, 'Undo lands on the restored last week, still the final week: ' + JSON.stringify(out.undone));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Undo of the coach\'s set_exercise_weight puts the working weight back with the programme', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const c = currentWeek - 1, r = {};
      const ww = n => getWeights()[n] === undefined ? null : getWeights()[n];
      const st = () => ({ plan: getCustomRoutine().weeks[c].push.find(e => e.name === 'Bench Press').weight, working: ww('Bench Press'), zercher: ww('Zercher Squat'),
        prescribed: _prescribedLb('Bench Press'), leak: '_w' in getCustomRoutine() });
      const reply = async (tools) => {
        eval(MOCK)([{ content: tools.map((input, i) => ({ type: 'tool_use', id: 't' + i, name: 'set_exercise_weight', input })), stop_reason: 'tool_use', usage: {} },
          { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
        coachMessages.push({ role: 'user', content: 'change my loads' }); saveCoachHistory();
        await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
        switchTab('coach'); coachView = 'chat'; render(); await wait(30);
      };
      const undo = async () => { const b = [...document.querySelectorAll('.kt-ledger-card button')].find(x => /Undo/.test(x.textContent)); if (!b) return false; b.click(); await wait(20); confirm(); await wait(30); return true; };
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(30); };
      r.before = st();
      // one reply moves Bench twice; Undo puts back what was there before the reply (no working weight)
      await reply([{ name: 'Bench Press', weight: 185 }, { name: 'Bench Press', weight: 190 }]);
      r.reply = st();
      r.undone = await undo() && st();
      // Restore Previous again brings the reply's version back, working weight and all
      await restorePrev();
      r.again = st();
      await restorePrev();
      r.back = st();
      // a newer log after the reply keeps its own working weight
      _setWorkingWeights([{ name: 'Bench Press', weight: 150 }], todayISO());
      await reply([{ name: 'Bench Press', weight: 190 }]);
      _setWorkingWeights([{ name: 'Bench Press', weight: 175 }], todayISO());
      r.logged = await undo() && st();
      // a lift the programme does not hold: the reply is still an undo point for its working weight
      _setWorkingWeights([{ name: 'Zercher Squat', weight: 100 }], todayISO());
      await reply([{ name: 'Zercher Squat', weight: 120 }]);
      r.zReply = st();
      r.zUndone = await undo() && st();
      return r;
    }, MOCK);
    assert(out.before.working === null && out.before.plan === 160, 'seed: Bench plan 160, no working weight: ' + JSON.stringify(out.before));
    assert(out.reply.plan === 190 && out.reply.working === 190, 'the reply moved the plan and the working weight: ' + JSON.stringify(out.reply));
    assert(out.undone && out.undone.plan === 160 && out.undone.working === null && out.undone.prescribed === 160 && !out.undone.leak, 'Undo puts both back: ' + JSON.stringify(out.undone));
    assert(out.again.plan === 190 && out.again.working === 190 && !out.again.leak, 'Restore Previous again swaps both back: ' + JSON.stringify(out.again));
    assert(out.back.plan === 160 && out.back.working === null, 'and again: ' + JSON.stringify(out.back));
    assert(out.logged && out.logged.plan === 160 && out.logged.working === 175, 'a newer log keeps its working weight: ' + JSON.stringify(out.logged));
    assert(out.zReply.zercher === 120 && out.zUndone && out.zUndone.zercher === 100, 'a working-weight-only reply is undone too: ' + JSON.stringify([out.zReply, out.zUndone]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Restore previous programme is a Settings row, keyless too, where How It Works points', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const row = () => [...document.querySelectorAll('.settings-row')].find(x => /Restore previous programme/.test(x.textContent));
      const bench = () => getCustomRoutine().weeks[currentWeek - 1].push.find(e => e.name === 'Bench Press').weight;
      const r = { key: !!localStorage.getItem('kt_apikey') };
      switchTab('settings'); await wait(30);
      r.noBackup = !!row();
      const b0 = bench();
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', currentWeek - 1, b0 + 20, { markOwner: true }), { scope: 'routines' });
      switchTab('settings'); await wait(30);
      const el = row();
      r.shown = !!el && el.closest('.settings-group').querySelector('.settings-group-hd').textContent;
      if (el) { el.click(); await wait(20); r.body = (document.querySelector('.kt-close-sheet .kt-close-sheet-sub') || {}).textContent || ''; confirm(); await wait(30); }
      r.restored = bench() === b0;
      r.how = (document.querySelector('.wf-view') || document.body).innerHTML.indexOf('Settings → Programme → Restore previous programme') >= 0 &&
        document.documentElement.innerHTML.indexOf('Settings → Data → Restore Previous') < 0;
      return r;
    });
    assert(!out.key, 'a keyless owner');
    assert(!out.noBackup, 'no row without a previous version');
    assert(out.shown === 'Programme' && out.restored, 'the row sits under Programme and restores the previous version: ' + JSON.stringify(out));
    assert(/set aside/.test(out.body) && !/discarded/.test(out.body), 'the confirm says the current one is set aside (it swaps), not discarded: ' + out.body);
    assert(out.how, 'How It Works points at the row that exists');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('after a new programme or a reset, Restore Previous brings back the programme as it was', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(30); };
      const bench = o => o.weeks[0].push.find(e => e.name === 'Bench Press').weight;
      // the snapshot's bookkeeping (_clock: the week it was on, R16; _w) is not the programme
      const bare = raw => { const c = JSON.parse(raw); delete c._clock; delete c._w; return JSON.stringify(c); };
      const r = {};
      // an edit leaves a snapshot from before it
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', 0, bench(cr) + 30, { markOwner: true }), { scope: 'routines' });
      const edited = localStorage.getItem('kt_routine');
      startNewProgramme(); await wait(20); confirm(); await wait(30);
      r.newProg = { routine: getCustomRoutine(), backup: bare(localStorage.getItem('kt_routine_backup')) === edited, scope: localStorage.getItem('kt_routine_backup_scope') };
      applyStarterRoutine({ goal: 'strength', days: 3, exp: 'intermediate', equip: 'full', focus: 'balanced' }); await wait(20);
      r.starter = { name: getCustomRoutine().name, backup: bare(localStorage.getItem('kt_routine_backup')) === edited };
      await restorePrev();
      r.back = localStorage.getItem('kt_routine') === edited;
      resetCustomRoutine(); await wait(20); confirm(); await wait(30);
      r.reset = { routine: getCustomRoutine(), backup: bare(localStorage.getItem('kt_routine_backup')) === edited, scope: localStorage.getItem('kt_routine_backup_scope') };
      await restorePrev();
      r.backAgain = localStorage.getItem('kt_routine') === edited;
      return r;
    });
    assert(out.newProg.routine === null && out.newProg.backup && /^new:/.test(out.newProg.scope || ''), 'a new programme sets the old one aside as it was: ' + JSON.stringify(out.newProg));
    assert(out.starter.backup && out.back, 'the starter plan keeps it, and Restore Previous brings it back: ' + JSON.stringify([out.starter, out.back]));
    assert(out.reset.routine === null && out.reset.backup && /^reset:/.test(out.reset.scope || '') && out.backAgain, 'a reset sets it aside too: ' + JSON.stringify([out.reset, out.backAgain]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a restore (or its undo) before a new programme starts keeps its start', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const st = () => ({ anchor: localStorage.getItem('kt_week_monday'), started: _programmeStarted(), week: currentWeek });
      const start = _nextMonday(addDays(todayISO(), 1)), thisMon = _mostRecentMonday();
      _setWeek(1, start);
      const r = { start, thisMon, before: st() };
      const file = JSON.parse(JSON.stringify(buildBackupJSON()));
      r.carried = file.kt_week_monday === start;
      _applyImportedData(JSON.parse(JSON.stringify(file)));
      r.restored = st();
      // a file whose start has passed, one further out than a week, and a later week: this Monday, as before
      const f2 = JSON.parse(JSON.stringify(file)); f2.kt_week_monday = addDays(thisMon, -14);
      _applyImportedData(f2); r.past = st();
      const f3 = JSON.parse(JSON.stringify(file)); f3.kt_week_monday = addDays(start, 7);
      _applyImportedData(f3); r.far = st();
      const f4 = JSON.parse(JSON.stringify(file)); f4.kt_week = 5;
      _applyImportedData(f4); r.week5 = st();
      // Undo last restore brings back the programme that had not started
      _setWeek(1, start);
      _applyImportedData(JSON.parse(JSON.stringify(f4)));
      r.other = st();
      _undoLastRestore(); await wait(20); confirm(); await wait(30);
      r.undone = st();
      return r;
    });
    assert(out.before.anchor === out.start && !out.before.started, 'seed: week 1 starts on the coming Monday: ' + JSON.stringify(out.before));
    assert(out.carried, 'the backup carries the start');
    assert(out.restored.anchor === out.start && !out.restored.started && out.restored.week === 1, 'a restore keeps the start: ' + JSON.stringify(out.restored));
    for (const k of ['past', 'far', 'week5']) assert(out[k].anchor === out.thisMon && out[k].started, k + ': re-anchored on this Monday: ' + JSON.stringify(out[k]));
    assert(out.other.week === 5 && out.undone.anchor === out.start && !out.undone.started && out.undone.week === 1, 'Undo last restore keeps the start: ' + JSON.stringify([out.other, out.undone]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('restoring from a full Programme History keeps every other programme', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([FULL, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const full = eval(FULL), room = eval(ROOM);
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const base = getCustomRoutine(), arr = [];
      for (let i = 5; i >= 1; i--) { const p = JSON.parse(JSON.stringify(base)); p.name = 'Programme ' + i; arr.push({ id: 1000 + i, archivedAt: todayISO(), routine: p }); }
      lsSet('kt_routine_archive', arr);
      const names = () => getRoutineArchive().map(e => e.routine.name);
      const r = { current: getCustomRoutine().name };
      // storage full: the programme cannot be written, then the history cannot; nothing changes
      for (const k of ['kt_routine', 'kt_routine_archive']) {
        full([k]); restoreArchivedRoutine(1003); await wait(20); confirm(); await wait(30); room();
        r[k] = { names: names(), current: getCustomRoutine().name };
      }
      restoreArchivedRoutine(1003); await wait(20); confirm(); await wait(30);
      r.after = { names: names(), current: getCustomRoutine().name };
      return r;
    }, [FULL, ROOM]);
    const five = '["Programme 5","Programme 4","Programme 3","Programme 2","Programme 1"]';
    for (const k of ['kt_routine', 'kt_routine_archive']) assert(JSON.stringify(out[k].names) === five && out[k].current === out.current, 'a failed write (' + k + ') changes nothing: ' + JSON.stringify(out[k]));
    assert(out.after.current === 'Programme 3' && JSON.stringify(out.after.names) === JSON.stringify([out.current, 'Programme 5', 'Programme 4', 'Programme 2', 'Programme 1']),
      'the restored programme leaves history, the current one joins it, and the oldest stays: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('PLAN CHANGES stays until its Undo is done: Cancel or a full phone keeps the card', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async ([MOCK, FULL, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const full = eval(FULL), room = eval(ROOM);
      eval(MOCK)([{ content: [{ type: 'tool_use', id: 't1', name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 170 } }], stop_reason: 'tool_use', usage: {} },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages.push({ role: 'user', content: 'bench 170' }); saveCoachHistory();
      await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
      const show = async () => { switchTab('coach'); coachView = 'chat'; render(); await wait(30); };
      const card = () => { const c = document.querySelector('.kt-ledger-card'); return c ? { undo: [...c.querySelectorAll('button')].some(b => /Undo/.test(b.textContent)) } : null; };
      const tapUndo = async (ok) => { [...document.querySelectorAll('.kt-ledger-card button')].find(x => /Undo/.test(x.textContent)).click(); await wait(20);
        const b = [...document.querySelectorAll('.kt-close-sheet button')].find(x => ok ? /Restore/.test(x.textContent) : /Cancel/i.test(x.textContent)); if (b) b.click(); await wait(30); };
      const bench = () => getCustomRoutine().weeks[currentWeek - 1].push.find(e => e.name === 'Bench Press').weight;
      const r = {};
      await show(); r.before = card();
      await tapUndo(false); await show();
      r.cancel = { card: card(), bench: bench() };
      full(['kt_routine']); await tapUndo(true); room(); await show();
      r.fullPhone = { card: card(), bench: bench() };
      await tapUndo(true); await show();
      r.undone = { card: card(), bench: bench(), stored: JSON.parse(localStorage.getItem('kt_coach_msgs')).filter(m => m._tools).every(m => m._ledgerSeen) };
      return r;
    }, [MOCK, FULL, ROOM]);
    assert(out.before && out.before.undo, 'the reply offers Undo: ' + JSON.stringify(out.before));
    assert(out.cancel.card && out.cancel.card.undo && out.cancel.bench === 170, 'Cancel keeps the card and its Undo: ' + JSON.stringify(out.cancel));
    assert(out.fullPhone.card && out.fullPhone.card.undo && out.fullPhone.bench === 170, 'an Undo that could not be saved keeps the card: ' + JSON.stringify(out.fullPhone));
    assert(out.undone.card === null && out.undone.bench !== 170 && out.undone.stored, 'a done Undo retires the card: ' + JSON.stringify(out.undone));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a refused swap_cadence_days keeps the undo point of the earlier change', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const ohp = o => o.weeks[currentWeek - 1].push.find(e => e.name === 'Overhead Press').weight;
      const o0 = ohp(getCustomRoutine()), r = { o0 };
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Overhead Press', currentWeek - 1, o0 + 10, { markOwner: true }), { scope: 'routines' });
      const bk = () => ({ ohp: ohp(lsGet('kt_routine_backup')), scope: localStorage.getItem('kt_routine_backup_scope') });
      _coachTurnScope = 'coach:test-swap';
      r.refused = executeCoachTool('swap_cadence_days', { dayA: 'Mon', dayB: 'Tue', week: getTotalWeeks() + 1 });
      r.kept = bk();
      r.done = executeCoachTool('swap_cadence_days', { dayA: 'Mon', dayB: 'Tue', week: currentWeek });
      r.taken = bk();
      _coachTurnScope = null;
      return r;
    });
    assert(out.refused.ok === false && out.kept.ohp === out.o0 && out.kept.scope === 'routines', 'the refusal leaves the Routines edit\'s snapshot: ' + JSON.stringify([out.refused, out.kept]));
    assert(out.done.ok === true && out.taken.ohp === out.o0 + 10 && out.taken.scope === 'coach:test-swap', 'a swap that lands takes its own: ' + JSON.stringify([out.done, out.taken]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a restore\'s undo copy goes after its week: at launch, and when a save needs the room', async () => {
  const DAY = 86400000;
  const snap = (age, pad) => JSON.stringify({ at: Date.now() - age, data: { kt_sessions: [], kt_week: 1, note: 'x'.repeat(pad || 0) } });
  const app = await boot({ native: true, seed: { kt_pre_restore: snap(8 * DAY) } });
  try {
    const out = await app.page.evaluate(async ([QUOTA, ROOM, live, stale]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const quota = eval(QUOTA), room = eval(ROOM), r = {};
      const has = () => localStorage.getItem('kt_pre_restore') !== null;
      r.boot = has();
      // inside its week it stays, and Settings offers it
      localStorage.setItem('kt_pre_restore', live);
      r.liveDrop = _dropStalePreRestore();
      switchTab('settings'); await wait(30);
      r.liveRow = has() && [...document.querySelectorAll('.settings-row')].some(x => /Undo last restore/.test(x.textContent));
      // a save that fits only without the copy: a stale one goes, a live one stays (and the save fails)
      const big =[{ date: todayISO(), weight: 180, id: 1, note: 'y'.repeat(8000) }];
      for (const [k, v] of [['stale', stale], ['live', live]]) {
        localStorage.setItem('kt_pre_restore', v);
        quota(4000);
        const ok = lsSet('kt_measurements', big);
        room();
        r[k] = { ok, copy: has() };
        lsDel('kt_measurements');
      }
      return r;
    }, [QUOTA, ROOM, snap(6 * DAY, 20000), snap(8 * DAY, 20000)]);
    assert(out.boot === false, 'a copy past its week is gone at launch');
    assert(out.liveDrop === false && out.liveRow, 'inside its week it stays and Settings offers it: ' + JSON.stringify(out));
    assert(out.stale.ok === true && out.stale.copy === false, 'a save that needs the room drops a stale copy: ' + JSON.stringify(out.stale));
    assert(out.live.ok === false && out.live.copy === true, 'a live copy is never dropped for a save: ' + JSON.stringify(out.live));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('the restore confirm names the backup\'s local export day', async () => {
  const app = await boot({ native: true });
  try {
    const seen = [];
    // late evening and just after midnight, local: whichever side of UTC this runs on, one of them
    // falls on another UTC day (TZ=UTC checks the plain case)
    for (const at of [{ h: 23, m: 30 }, { h: 0, m: 30 }, { date: true }]) {
      const { file, expect } = await app.page.evaluate((at) => {
        const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(at.date ? 12 : at.h, at.date ? 0 : at.m, 0, 0);
        const f = buildBackupJSON(); f._manifest.exportedAt = at.date ? _ymdLocal(d) : d.toISOString();
        return { file: JSON.stringify(f), expect: fmtDate(_ymdLocal(d)) };
      }, at);
      const [fc] = await Promise.all([app.page.waitForEvent('filechooser'), app.page.evaluate(() => importData())]);
      await fc.setFiles({ name: 'supero-backup.json', mimeType: 'application/json', buffer: Buffer.from(file) });
      await app.page.waitForSelector('.kt-close-sheet');
      const body = await app.page.evaluate(() => { const s = document.querySelector('.kt-close-sheet .kt-close-sheet-sub'); const t = s ? s.textContent : ''; document.querySelectorAll('.kt-close-sheet').forEach(e => e.remove()); return t; });
      seen.push({ at, expect, ok: body.indexOf('Exported ' + expect + ' ') >= 0, body });
    }
    assert(seen.every(s => s.ok), 'the confirm says the local day it was exported: ' + JSON.stringify(seen));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a body-weight or measurement save that fails never reads as saved', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ([FULL, ROOM]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const full = eval(FULL), room = eval(ROOM), r = {};
      const toast = () => (document.getElementById('toast') || {}).textContent || '';
      const n = k => (JSON.parse(localStorage.getItem(k) || '[]') || []).length;
      logSubTab = 'body'; switchTab('log'); await wait(30);
      const bw0 = n('kt_bw'), ms0 = n('kt_measurements');
      // storage full
      document.getElementById('bwVal').value = '181.4';
      full(['kt_bw']); saveBodyWeight(); room(); await wait(30);
      r.bwFull = { saved: n('kt_bw') - bw0, strip: !!document.querySelector('.kt-rconfirm'), confirmed: !!bwLogConfirmed, toast: toast(), typed: document.getElementById('bwVal').value };
      document.getElementById('msWaist').value = '32';
      full(['kt_measurements']); saveMeasurement(); room(); await wait(30);
      r.msFull = { saved: n('kt_measurements') - ms0, toast: toast(), typed: document.getElementById('msWaist').value };
      // with room both save as before
      document.getElementById('bwVal').value = '181.4';
      saveBodyWeight(); await wait(30);
      r.bw = { saved: n('kt_bw') - bw0, strip: !!document.querySelector('.kt-rconfirm') };
      document.getElementById('msWaist').value = '32';
      saveMeasurement(); await wait(30);
      r.ms = { saved: n('kt_measurements') - ms0, toast: toast() };
      return r;
    }, [FULL, ROOM]);
    assert(out.bwFull.saved === 0 && !out.bwFull.strip && !out.bwFull.confirmed && /storage full/.test(out.bwFull.toast) && out.bwFull.typed === '181.4', 'a failed body-weight save shows no "logged" strip: ' + JSON.stringify(out.bwFull));
    assert(out.msFull.saved === 0 && /storage full/.test(out.msFull.toast) && out.msFull.typed === '32', 'a failed measurement save keeps the error: ' + JSON.stringify(out.msFull));
    assert(out.bw.saved === 1 && out.bw.strip, 'a body-weight save with room logs: ' + JSON.stringify(out.bw));
    assert(out.ms.saved === 1 && /Measurements saved/.test(out.ms.toast), 'a measurement save with room saves: ' + JSON.stringify(out.ms));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R13 (R10, R60 the same): _weightKeyFor folds a case variant into the programme's spelling, and the
// reply's undo point recorded no old value, so Undo deleted the working weight instead of putting
// it back. Each folded variant is noted with the change.
run('Undo of set_exercise_weight puts back a working weight saved under another spelling', async () => {
  const w0 = { 'bench press': 150, 'Face Pull': 40, 'face pull': 35 };
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]', kt_weights: JSON.stringify(w0) } });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const ws = () => { const w = getWeights(); return JSON.stringify(Object.keys(w).sort().reduce((o, k) => { o[k] = w[k]; return o; }, {})); };
      eval(MOCK)([{ content: [{ type: 'tool_use', id: 't0', name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 190 } },
        { type: 'tool_use', id: 't1', name: 'set_exercise_weight', input: { name: 'face pull', weight: 50 } }], stop_reason: 'tool_use', usage: {} },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages.push({ role: 'user', content: 'bench 190, face pulls 50' }); saveCoachHistory();
      await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
      switchTab('coach'); coachView = 'chat'; render(); await wait(30);
      const r = { reply: ws() };
      const b = [...document.querySelectorAll('.kt-ledger-card button')].find(x => /Undo/.test(x.textContent));
      if (b) { b.click(); await wait(20); confirm(); await wait(30); }
      r.undone = ws();
      r.prompt = /bench press: 150/.test(buildSystemPrompt());
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      r.again = ws();
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      r.back = ws();
      return r;
    }, MOCK);
    const before = JSON.stringify({ 'Face Pull': 40, 'bench press': 150, 'face pull': 35 }), reply = JSON.stringify({ 'Bench Press': 190, 'Face Pull': 50 });
    assert(out.reply === reply, 'the reply saved both under the programme\'s spelling: ' + out.reply);
    assert(out.undone === before && out.prompt, 'Undo puts every folded spelling back as it was: ' + JSON.stringify([out.undone, out.prompt]));
    assert(out.again === reply && out.back === before, 'Restore Previous swaps them back and forth: ' + JSON.stringify([out.again, out.back]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R16 (R61 the same): a programme replaced whole (the next round, a Programme History restore,
// the starter plan, a new programme, a reset) came back with Restore Previous on week 1: round 1
// lost its final week, a history restore's programme came back not started. The week clock goes
// aside with it (_clock) and comes back with it; the version set aside keeps its own.
run('Restore Previous after the next round brings round 1 back on its final week, ended as it was', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(30); };
      const st = () => { const cr = getCustomRoutine(), ri = _roundInfo();
        return { cycle: cr.cycle || 1, week: currentWeek, stored: lsGet('kt_week'), anchor: localStorage.getItem('kt_week_monday'), finalSince: localStorage.getItem('kt_final_since'),
          ended: !!(ri && ri.ended), bench: cr.weeks[currentWeek - 1].push.find(e => e.name === 'Bench Press').weight, streak: calcStreakDays() }; };
      // parked on week 12 since last Monday: the programme has ended; a run on every training day of the last four weeks
      _setWeek(12); const fin = addDays(_mostRecentMonday(), -7); localStorage.setItem('kt_final_since', fin);
      const due = _streakDueFn(), runs = getRuns().slice();
      for (let i = 1; i <= 28; i++) { const d = addDays(todayISO(), -i); if (due(d) === 1) runs.unshift({ id: 7100000 + i, date: d, km: 5, time: '25:00' }); }
      lsSet('kt_runs', runs);
      const r = { fin, mon: _mostRecentMonday(), before: st() };
      lsSet('kt_routine_next', { startsOn: todayISO(), at: todayISO() });
      _applyNextRound(true);
      r.round2 = st();
      await restorePrev();
      r.restored = st();
      await restorePrev();
      r.again = st();
      await restorePrev();
      r.back = st();
      return r;
    });
    assert(out.before.week === 12 && out.before.ended && out.before.bench === 175 && out.before.streak > 0, 'seed: round 1 on its final week, ended: ' + JSON.stringify(out.before));
    assert(out.round2.cycle === 2 && out.round2.week === 1 && out.round2.finalSince === null, 'round 2 started on week 1: ' + JSON.stringify(out.round2));
    const r1 = out.restored;
    assert(r1.cycle === 1 && r1.week === 12 && r1.stored === 12 && r1.finalSince === out.fin && r1.ended && r1.bench === 175 && r1.anchor === out.mon,
      'round 1 comes back on its final week, still ended, at its own loads: ' + JSON.stringify(r1));
    assert(r1.streak === out.before.streak, 'the streak is untouched: ' + JSON.stringify([out.before.streak, r1.streak]));
    assert(out.again.cycle === 2 && out.again.week === 1 && out.again.finalSince === null && out.again.bench === out.round2.bench, 'restoring again brings round 2 back on its week 1: ' + JSON.stringify(out.again));
    assert(out.back.cycle === 1 && out.back.week === 12 && out.back.finalSince === out.fin && out.back.ended, 'and round 1 again: ' + JSON.stringify(out.back));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Restore Previous after a history restore, the starter plan, a new programme or a reset brings it back on its week', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(30); };
      const st = () => ({ name: (getCustomRoutine() || {}).name || null, week: currentWeek, stored: lsGet('kt_week'), anchor: localStorage.getItem('kt_week_monday'), started: _programmeStarted(),
        leak: !!getCustomRoutine() && ('_clock' in getCustomRoutine() || '_w' in getCustomRoutine()) });
      const A = getCustomRoutine().name, r = { A, mon: _mostRecentMonday(), start: _nextMonday(todayISO()), before: st() };
      // a Programme History restore (week 1 starts on the next Monday), then back
      const B = JSON.parse(JSON.stringify(getCustomRoutine())); B.name = 'Programme B';
      lsSet('kt_routine_archive', [{ id: 42, archivedAt: todayISO(), routine: B }]);
      restoreArchivedRoutine(42); await wait(20); confirm(); await wait(30);
      r.history = st();
      await restorePrev(); r.historyBack = st();
      await restorePrev(); r.historyAgain = st();
      await restorePrev(); r.historyBack2 = st();
      // the starter plan, a new programme and a reset
      applyStarterRoutine({ goal: 'strength', days: 3, exp: 'intermediate', equip: 'full', focus: 'balanced' }); await wait(20);
      await restorePrev(); r.starterBack = st();
      startNewProgramme(); await wait(20); confirm(); await wait(30);
      await restorePrev(); r.newBack = st();
      resetCustomRoutine(); await wait(20); confirm(); await wait(30);
      await restorePrev(); r.resetBack = st();
      // an edit's undo point is the same programme on the same clock: the week stays where it is
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', currentWeek - 1, 200, { markOwner: true }), { scope: 'routines' });
      adjustWeek(1);
      await restorePrev(); r.edit = st();
      return r;
    });
    const atSix = (x, k) => assert(x.name === out.A && x.week === 6 && x.stored === 6 && x.anchor === out.mon && x.started && !x.leak, k + ': back on week 6, started this Monday: ' + JSON.stringify(x));
    assert(out.before.week === 6 && out.before.started, 'seed: week 6: ' + JSON.stringify(out.before));
    assert(out.history.name === 'Programme B' && out.history.week === 1 && out.history.anchor === out.start, 'the history restore starts B on week 1: ' + JSON.stringify(out.history));
    atSix(out.historyBack, 'after a history restore');
    assert(out.historyAgain.name === 'Programme B' && out.historyAgain.week === 1 && out.historyAgain.anchor === out.start && !out.historyAgain.leak, 'restoring again brings B back as it was, still starting on its Monday: ' + JSON.stringify(out.historyAgain));
    atSix(out.historyBack2, 'and A again');
    atSix(out.starterBack, 'after the starter plan');
    atSix(out.newBack, 'after a new programme');
    atSix(out.resetBack, 'after a reset');
    assert(out.edit.week === 7, 'an edit\'s undo point leaves the week alone: ' + JSON.stringify(out.edit));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R16 follow-up: a swap stamps the +5 and plateau offers for its week 1, so back on week 6 an offer
// already put off (or taken) that week was offered again (with a key, a second +5 from the coach).
// The week's offers go aside with the clock and come back with it.
run('Restore Previous after a swap keeps the week\'s +5 and plateau offers as they were answered', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(30); };
      // both main lifts went clean last week, and Bench has stalled
      const ex = (name, w) => ({ name, isMain: true, sets: 4, reps: [8, 8, 8, 8], weight: w, rpe: 7, rpeLog: [7, 7, 7, 7] });
      lsSet('kt_sessions', [{ id: 8800001, date: addDays(_mostRecentMonday(), -5), type: 'Push', exercises: [ex('Bench Press', 160), ex('Overhead Press', 100)] }].concat(getSessions()));
      window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 30 }];
      const st = () => ({ week: currentWeek, prog: _progressionDue(), plateau: _plateauFixDue() });
      const B = JSON.parse(JSON.stringify(getCustomRoutine())); B.name = 'Programme B';
      lsSet('kt_routine_archive', [{ id: 42, archivedAt: todayISO(), routine: B }]);
      const r = { seed: st() };
      // offers nobody answered yet are still offered after the round trip
      restoreArchivedRoutine(42); await wait(20); confirm(); await wait(30);
      r.onB = st();
      await restorePrev(); r.untouched = st();
      // put off this week: the starter plan, then back
      dismissProgression(); dismissPlateauFix(); r.dismissed = st();
      applyStarterRoutine({ goal: 'strength', days: 3, exp: 'intermediate', equip: 'full', focus: 'balanced' }); await wait(20);
      await restorePrev(); r.answered = st();
      return r;
    });
    assert(out.seed.week === 6 && out.seed.prog && out.seed.plateau, 'seed: week 6, both offers due: ' + JSON.stringify(out.seed));
    assert(out.onB.week === 1 && !out.onB.prog && !out.onB.plateau, 'the swapped-in programme starts on week 1 with no offer: ' + JSON.stringify(out.onB));
    assert(out.untouched.week === 6 && out.untouched.prog && out.untouched.plateau, 'back on week 6, unanswered offers stay offered: ' + JSON.stringify(out.untouched));
    assert(!out.dismissed.prog && !out.dismissed.plateau, 'both put off: ' + JSON.stringify(out.dismissed));
    assert(out.answered.week === 6 && !out.answered.prog && !out.answered.plateau, 'back on week 6, offers put off that week stay put off: ' + JSON.stringify(out.answered));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R17: the keyless +5 and the plateau deload wrote the working weight with no note on their undo
// point, so Restore previous programme put the plan back and left the new load as the working
// weight (the coach prompt listed it, and the next +5 said "Already progressed this week"). Each
// tap is one undo point that notes every working weight it moved.
run('Restore previous programme after the keyless +5 or deload puts the working weights back too', async () => {
  const app = await boot({ native: true, seed: { kt_weights: JSON.stringify({ 'Bench Press': 160, 'Overhead Press': 101 }) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const restorePrev = async () => { restoreRoutineBackup(); await wait(20); confirm(); await wait(30); };
      const toast = () => (document.getElementById('toast') || {}).textContent || '';
      const c = currentWeek - 1;
      const st = () => { const wk = getCustomRoutine().weeks[c].push, w = getWeights();
        return { bench: [wk.find(e => e.name === 'Bench Press').weight, w['Bench Press']], ohp: [wk.find(e => e.name === 'Overhead Press').weight, w['Overhead Press']], prescribed: _prescribedLb('Bench Press') }; };
      // both main lifts went clean last week
      const ex = (name, w) => ({ name, isMain: true, sets: 4, reps: [8, 8, 8, 8], weight: w, rpe: 7, rpeLog: [7, 7, 7, 7] });
      lsSet('kt_sessions', [{ id: 8800001, date: addDays(_mostRecentMonday(), -5), type: 'Push', exercises: [ex('Bench Press', 160), ex('Overhead Press', 101)] }].concat(getSessions()));
      const r = { before: st(), lifts: _progressionLifts().length };
      startProgression();   // keyless: the +5 on Today
      r.plus5 = st();
      await restorePrev();
      r.restored = st();
      r.prompt = /Bench Press: 160/.test(buildSystemPrompt());
      applyProgressionLocal();   // the earned +5 is offered again, and applies
      r.again = { st: st(), toast: toast() };
      await restorePrev();
      window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 30 }];
      applyPlateauFixLocal();
      r.deload = st();
      await restorePrev();
      r.deloadBack = st();
      return r;
    });
    const b0 = out.before.bench, o0 = out.before.ohp;
    assert(out.lifts === 2 && b0[0] === 160 && b0[1] === 160, 'seed: Bench 160 planned and working, two lifts earned +5: ' + JSON.stringify(out.before));
    assert(out.plus5.bench[0] === 165 && out.plus5.bench[1] === 165 && out.plus5.ohp[1] > o0[1], 'the +5 moved plan and working weight: ' + JSON.stringify(out.plus5));
    assert(JSON.stringify(out.restored) === JSON.stringify(out.before) && out.prompt, 'Restore previous programme puts both lifts\' plan and working weight back: ' + JSON.stringify([out.before, out.restored]));
    assert(out.again.st.bench[1] === 165 && !/Already progressed/.test(out.again.toast), 'the +5 is not "already progressed" after the restore: ' + JSON.stringify(out.again));
    assert(out.deload.bench[0] === 145 && out.deload.bench[1] === 145, 'the deload moved both: ' + JSON.stringify(out.deload));
    assert(JSON.stringify(out.deloadBack) === JSON.stringify(out.before), 'and Restore previous programme puts both back: ' + JSON.stringify(out.deloadBack));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R14: a reply's Undo is kept across a relaunch (M21), and a day rename took no snapshot, so the
// card's Undo restored the snapshot from before the reply and dropped the rename made since. A
// rename is its own undo point: the reply's Undo retires, and Restore previous programme takes back
// only the rename.
run('a day rename after a coach reply is its own undo point: the reply\'s Undo no longer drops it', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async ([MOCK, OHP_REPLY]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const ohp = () => getCustomRoutine().weeks[currentWeek - 1].push.find(e => e.name === 'Overhead Press').weight;
      const card = async () => { switchTab('coach'); coachView = 'chat'; render(); await wait(30); const c = document.querySelector('.kt-ledger-card'); return c ? [...c.querySelectorAll('button')].some(b => /Undo/.test(b.textContent)) : null; };
      eval(MOCK)(OHP_REPLY);
      coachMessages.push({ role: 'user', content: 'Make my overhead press heavier' }); saveCoachHistory();
      await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
      loadCoachHistory(); _routineScope = null;   // a relaunch: the reply still offers Undo
      const r = { relaunch: await card(), ohp: ohp() };
      setDayName('Push', 'Chest Day');   // Settings › Weekly schedule › NAME THIS DAY
      r.renamed = { label: _dayLabel('Push'), undo: await card() };
      setDayName('Push', 'Chest Day');   // the same name again changes nothing and keeps the undo point
      r.backupName = ((lsGet('kt_routine_backup') || {}).dayNames || {}).Push || null;
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      r.restored = { label: _dayLabel('Push'), ohp: ohp() };
      return r;
    }, [MOCK, OHP_REPLY]);
    assert(out.relaunch === true && out.ohp === 110, 'the reply changed OHP and offers Undo after a relaunch: ' + JSON.stringify(out));
    assert(out.renamed.label === 'Chest Day' && out.renamed.undo === false, 'after the rename the reply\'s Undo is gone (it would drop the rename): ' + JSON.stringify(out.renamed));
    assert(out.backupName === null, 'the undo point is the programme just before the rename: ' + out.backupName);
    assert(out.restored.label === 'Push' && out.restored.ohp === 110, 'Restore previous programme takes back the rename only: ' + JSON.stringify(out.restored));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R15: the undo point's working-weight note was compared by value only, so a workout done at the
// coach's new load matched it, and the reply's Undo put the old working weight back under the
// newest log (with no old one, it deleted it). A log that sets a lift's working weight drops the
// lift's note.
run('Undo of the coach\'s working weight keeps the load a newer workout logged, even the same one', async () => {
  for (const w0 of [{ 'Bench Press': 150 }, {}]) {
    const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]', kt_sessions: '[]', kt_weights: JSON.stringify(w0) } });
    try {
      const out = await app.page.evaluate(async (MOCK) => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
        const c = currentWeek - 1;
        const st = () => ({ working: getWeights()['Bench Press'] === undefined ? null : getWeights()['Bench Press'], plan: getCustomRoutine().weeks[c].push.find(e => e.name === 'Bench Press').weight });
        eval(MOCK)([{ content: [{ type: 'tool_use', id: 't0', name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 190 } }], stop_reason: 'tool_use', usage: {} },
          { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
        coachMessages.push({ role: 'user', content: 'bench 190' }); saveCoachHistory();
        await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
        const r = { reply: st() };
        // today's Push at the load Today now prescribes
        switchTab('log'); switchLogSub('workout'); await wait(20);
        openDeckRunner('Push'); await wait(20);
        r.card = [runnerSession.exercises[0].name, runnerWeights[runnerSession.exercises[0].name]];
        runnerEngaged = true; runnerSetWeight(190);
        [8, 8, 8].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
        runnerFinishSession(); await wait(250); closeCompleteSheet();
        r.logged = Object.assign(st(), { session: getSessions()[0].date === todayISO() && getSessions()[0].exercises[0].weight });
        switchTab('coach'); coachView = 'chat'; render(); await wait(30);
        const b = [...document.querySelectorAll('.kt-ledger-card button')].find(x => /Undo/.test(x.textContent));
        r.undoShown = !!b;
        if (b) { b.click(); await wait(20); confirm(); await wait(30); }
        r.undone = st();
        return r;
      }, MOCK);
      const tag = w0['Bench Press'] ? 'with an old working weight' : 'with none';
      assert(out.reply.working === 190 && out.reply.plan === 190, tag + ': the reply set Bench to 190: ' + JSON.stringify(out.reply));
      assert(out.logged.session === 190 && out.logged.working === 190, tag + ': today\'s workout logged 190: ' + JSON.stringify(out));
      assert(out.undoShown && out.undone.plan === 160 && out.undone.working === 190, tag + ': Undo takes the plan back and keeps the working weight the workout set: ' + JSON.stringify(out.undone));
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// R15, the edit path: correcting the newest log of a lift (Edit sets) sets its working weight like
// a new log does, so it drops the lift's note too. Fixing yesterday's Bench typo to the coach's
// 190 used to leave the note [150, 190] matching, and the reply's Undo put 150 back under it.
run('Undo of the coach\'s working weight keeps the load a corrected newest log sets', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]', kt_sessions: '[]', kt_weights: JSON.stringify({ 'Bench Press': 150 }) } });
  try {
    const out = await app.page.evaluate(async (MOCK) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const c = currentWeek - 1, Y = addDays(todayISO(), -1);
      const st = () => ({ working: getWeights()['Bench Press'] === undefined ? null : getWeights()['Bench Press'], plan: getCustomRoutine().weeks[c].push.find(e => e.name === 'Bench Press').weight });
      lsSet('kt_sessions', [{ id: 5559001, date: Y, week: weekForDate(Y), type: 'Push', label: 'Push', prs: [], exercises: [
        { name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 150, weightLog: [150, 150, 150], isMain: true }] }]);
      recomputePRs();
      eval(MOCK)([{ content: [{ type: 'tool_use', id: 't0', name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 190 } }], stop_reason: 'tool_use', usage: {} },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: {} }]);
      coachMessages.push({ role: 'user', content: 'bench 190' }); saveCoachHistory();
      await runCoachTurn(buildSystemPrompt(), coachModel, 16384);
      const r = { reply: st() };
      // yesterday's Bench was really 190: the owner fixes the typo in Edit sets
      openSessionEditor(5559001); await wait(30);
      ['0', '1', '2'].forEach(i => { document.getElementById('se_0_' + i + '_w').value = '190'; });
      saveSessionEdit(); await wait(30);
      r.edited = Object.assign(st(), { logged: getSessions()[0].exercises[0].weight });
      switchTab('coach'); coachView = 'chat'; render(); await wait(30);
      const b = [...document.querySelectorAll('.kt-ledger-card button')].find(x => /Undo/.test(x.textContent));
      r.undoShown = !!b;
      if (b) { b.click(); await wait(20); confirm(); await wait(30); }
      r.undone = st();
      return r;
    }, MOCK);
    assert(out.reply.working === 190 && out.reply.plan === 190, 'the reply set Bench to 190: ' + JSON.stringify(out.reply));
    assert(out.edited.logged === 190 && out.edited.working === 190, 'the corrected log reads 190 and so does the working weight: ' + JSON.stringify(out.edited));
    assert(out.undoShown && out.undone.plan === 160 && out.undone.working === 190, 'Undo takes the plan back and keeps the working weight the corrected log sets: ' + JSON.stringify(out.undone));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R18: the schedule editor's 'cadence' scope never closed, so Restore previous programme undid the
// changes of two Settings visits as one (M17 split Routines visits only). Each visit is its own
// undo point; the changes inside one visit stay one.
run('schedule changes in two Settings visits are two undo points', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const plan = () => getWeekPlanForWeek(currentWeek).map(p => p.type).join(',');
      const pick = async (dow, type) => { _schedPick(dow); await wait(10); const b = [...document.querySelectorAll('.kt-sched-pick')].find(x => x.textContent.trim().indexOf(type) === 0); if (b) b.click(); await wait(20); return !!b; };
      const r = { p0: plan() };
      switchTab('settings'); await wait(20);
      r.picked1 = await pick(4, 'Push');   // Friday
      r.p1 = plan();
      switchTab('log'); await wait(20);
      switchTab('settings'); await wait(20);
      r.picked2 = await pick(6, 'Rest') && await pick(0, 'Rest');   // Sunday, then Monday, in one visit
      r.p2 = plan();
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      r.restored = plan();
      return r;
    });
    assert(out.picked1 && out.picked2 && out.p1 !== out.p0 && out.p2 !== out.p1, 'the editor changed the schedule in both visits: ' + JSON.stringify(out));
    assert(out.restored === out.p1, 'Restore previous programme undoes the second visit only, both of its changes: ' + JSON.stringify([out.p0, out.p1, out.restored]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R19: a backup restore (and Undo last restore) left an edit scope open, so the next schedule edit
// took no snapshot and Restore previous programme brought back the file's own older programme; the
// device's scope key also survived, so a stored reply's Undo could point at the file's backup. The
// restore replaces the programme whole: no scope stays open and no reply owns the restored backup.
run('after a backup restore or its undo, the next edit is its own undo point', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const plan = () => getWeekPlanForWeek(currentWeek).map(p => p.type).join(',');
      const st = () => ({ name: getCustomRoutine().name, plan: plan(), backup: (lsGet('kt_routine_backup') || {}).name || null, scope: _routineScope, key: localStorage.getItem('kt_routine_backup_scope') });
      const r = {};
      switchTab('settings'); await wait(20);
      setWeekPlanDay(4, 'Push'); await wait(20);   // a schedule edit in this visit leaves 'cadence' open
      // a backup file: its programme 'File P', its own previous version 'File OLD', and a reply whose
      // undo point is the scope this device last took
      const file = buildBackupJSON(); delete file._manifest;
      const P = JSON.parse(JSON.stringify(getCustomRoutine())); P.name = 'File P';
      const OLD = JSON.parse(JSON.stringify(getCustomRoutine())); OLD.name = 'File OLD';
      file.kt_routine = P; file.kt_routine_backup = OLD;
      file.kt_coach_msgs = [{ role: 'user', content: 'bench 190' }, { role: 'assistant', content: 'Done.', _tools: [{ name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 190 }, result: { ok: true } }], _undo: 'cadence' }];
      r.ok = _applyImportedData(file); await wait(30);
      r.restored = Object.assign(st(), { replyUndo: _backupScopeIs('cadence') });
      const p1 = plan();
      setWeekPlanDay(6, 'Rest'); await wait(20);   // Sunday
      r.edit = st();
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      r.prev = Object.assign(st(), { back: plan() === p1 });
      // Undo last restore, after another edit opened 'cadence' again: the same holds
      setWeekPlanDay(5, 'Push'); await wait(20);
      r.undoOk = _applyImportedData(JSON.parse(localStorage.getItem('kt_pre_restore')).data, { undo: true }); await wait(30);
      r.undone = st();
      const p2 = plan();
      setWeekPlanDay(6, 'Rest'); await wait(20);
      restoreRoutineBackup(); await wait(20); confirm(); await wait(30);
      r.undonePrev = Object.assign(st(), { back: plan() === p2 });
      return r;
    });
    const x = out.restored;
    assert(out.ok && x.name === 'File P' && x.backup === 'File OLD' && x.scope === null && x.key === null && !x.replyUndo, 'the restore leaves no scope open and no reply owning its backup: ' + JSON.stringify(x));
    assert(out.edit.backup === 'File P' && out.edit.scope === 'cadence', 'the next edit snapshots the restored programme: ' + JSON.stringify(out.edit));
    assert(out.prev.name === 'File P' && out.prev.back, 'Restore previous programme brings back the restored programme as it was, not the file\'s older one: ' + JSON.stringify(out.prev));
    assert(out.undoOk && out.undone.scope === null && out.undone.key === null, 'Undo last restore leaves no scope open either: ' + JSON.stringify(out.undone));
    assert(out.undonePrev.back, 'and Restore previous programme takes back only the edit made after it: ' + JSON.stringify(out.undonePrev));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
