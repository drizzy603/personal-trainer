// Hunt 3 fixes, undo and restore:
// - A new round retires the old round's undo state: an earlier coach reply's PLAN CHANGES card
//   (and its Undo) goes, Restore Previous holds round 1 as it was just before the swap, an open
//   scope snapshots the new round, and restoring the other round drops ROUND N · WEEK 1 (H11).
// - The reply's undo point survives a relaunch (M21).
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
      lsSet('kt_routine_next', { startsOn: todayISO(), at: todayISO() });
      const nb = _applyNextRound(false);
      r.swap = { ok: !!nb, cycle: getCustomRoutine().cycle, week: currentWeek, scope: localStorage.getItem('kt_routine_backup_scope'),
        backupIsRound1: JSON.stringify(lsGet('kt_routine_backup')) === round1, seen: coachMessages.filter(m => m._tools).every(m => m._ledgerSeen),
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
