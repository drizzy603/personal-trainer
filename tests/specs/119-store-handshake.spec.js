// 119: the store handshake (plan task S4). Every case runs the shipped facade
// (ios/App/FPKit/Sources/FPStore/Resources/ktstore.js) at document start over tests/lib/ktstore-mock.js, the JS
// reference of FPStore's native side, whatever STORE says: migration, a reload, the witness deciding between
// adoption and would-repair, the four ways an older build really deletes, WebKit unreadable, WebKit wiped, half
// an emoji, the API key, observe mode and Put back.
//
// A "document" here is one page load; app.reload() is a relaunch. __ktMock.device({shell:false}) makes the next
// documents a store-less build (build 59: no flag, no facade), device({seed:false}) stops the harness re-seeding
// WebKit at each load (a real relaunch does not), and __ktMock.next({...}) changes WebKit behind the facade at
// the next document start.
const { boot, assert, run } = require('../lib/harness');

// One case at a time: each starts its own browser and relaunches it several times.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}

const start = (opts) => boot(Object.assign({ store: 'shadow' }, opts || {}));
const ev = (app, fn, arg) => app.page.evaluate(fn, arg);

// What this document's start did: hello's answer, the facade's state, WebKit before and after the facade.
const docInfo = (app) => ev(app, () => {
  const h = __ktMock.log.filter((e) => e.head.indexOf('hello') === 0)[0] || null;
  const st = window.__ktStoreState || null;
  const before = __ktMock.wkBefore || {}, after = __ktMock.wkAfter || {};
  const keys = Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
  return {
    head: h && h.head, answer: h && h.answer ? JSON.parse(h.answer) : null, payload: h && h.payload,
    mode: st ? st.mode : null, why: st ? st.why : null, boot: st ? st.boot : null,
    wrote: keys.filter((k) => before[k] !== after[k]).sort(),   // what the facade changed in WebKit
    beforeKeys: Object.keys(before).sort(), afterKeys: Object.keys(after).sort(), prompts: __ktMock.log.length,
  };
});
const status = (app) => ev(app, () => __ktMock.status());
const reasons = (app) => ev(app, () => { const o = {}; __ktMock.conflicts().slice().reverse().forEach((c) => { o[c.key] = c.why; }); return o; });
const check = (app) => ev(app, () => __ktMock.check());

// doc 1 shell on (the harness default), then the given device patch, then a relaunch.
async function relaunchWith(app, patch) {
  if (patch) await ev(app, (p) => __ktMock.device(p), patch);
  await app.reload();
}

serial('migration: the first launch with the facade copies every key in one put; a reload is in step on a new boot', async () => {
  const app = await start();
  try {
    // Build 59 first: no flag, so the facade does nothing and nothing crosses the channel.
    await relaunchWith(app, { shell: false });
    let d = await docInfo(app);
    assert(d.mode === null && d.prompts === 0, 'without the flag the facade never prompts: ' + JSON.stringify(d));
    const flagless = await ev(app, () => ({ real: localStorage instanceof Storage, state: typeof window.__ktStoreState, unflagged: __ktMock.unflagged }));
    assert(flagless.real && flagless.state === 'undefined' && flagless.unflagged === 0, 'the page runs on WebKit itself: ' + JSON.stringify(flagless));
    // The store is new (a fresh install of 60 over 59's WebKit), and 59 left an API key and half an emoji there.
    await ev(app, () => {
      __ktMock.reset();
      localStorage.setItem('kt_apikey', 'sk-ant-api03-migration-key');
      localStorage.setItem('kt_user_name', 'Kal' + String.fromCharCode(0xd83d));
    });
    await app.reload();

    d = await docInfo(app);
    const wk = await ev(app, () => __ktMock.wkBefore);
    const expectNeed = Object.keys(wk).filter((k) => k !== 'kt_apikey' && k.indexOf('kt__store') !== 0).sort();
    assert(d.mode === 'shadow' && d.answer.rule === 4 && d.answer.label === 'migrate', 'hello: migrate: ' + JSON.stringify(d.answer));
    assert(JSON.stringify(d.answer.need) === JSON.stringify(expectNeed), 'need: every key WebKit holds but the API key: ' + JSON.stringify(d.answer.need));
    assert(d.wrote.length === 0, 'the migration writes nothing into WebKit: ' + d.wrote);
    const after = await ev(app, () => {
      const put = __ktMock.log.filter((e) => e.head === 'put')[0];
      const snap = __ktMock.snaps().filter((n) => /-migrate\.json$/.test(n))[0];
      return { put: !!put && put.answer === 'ok', snap: snap ? __ktMock.readSnap(snap) : null, conflicts: __ktMock.conflicts().length,
        name: __ktMock.values().kt_user_name, nameH: __ktMock.H(__ktMock.values().kt_user_name || ''), wkName: localStorage.getItem('kt_user_name') };
    });
    assert(after.put, 'one put answered ok');
    const wkLessKey = Object.assign({}, wk); delete wkLessKey.kt_apikey;
    assert(after.snap && JSON.stringify(after.snap) === JSON.stringify(Object.keys(wkLessKey).sort().reduce((o, k) => { o[k] = wkLessKey[k]; return o; }, {})),
      'a migrate snapshot holds exactly what WebKit held, less the API key');
    assert(after.conflicts === 0, 'a migration gives nothing up');
    assert(after.name === after.wkName && after.name.length === 4 && after.name.charCodeAt(3) === 0xd83d, 'the lone surrogate survives the put exactly');
    assert((await check(app)).ok, 'store == WebKit == page reads');

    // A relaunch: a new document, a new boot id, ops counted from 1 again, the harness's re-seed mirrored.
    const boot1 = d.boot;
    await app.reload();
    d = await docInfo(app);
    assert(d.answer.rule === 0 && d.answer.label === 'in step' && d.answer.need.length === 0, 'the reload is in step: ' + JSON.stringify(d.answer));
    assert(d.boot === boot1 + 1, 'a new boot id: ' + boot1 + ' -> ' + d.boot);
    const ops = await ev(app, (b) => {
      localStorage.setItem('kt_theme', 'dark');
      const row = __ktMock.row('kt_theme');
      // A post the previous document sent and that arrives now: older than the key's last write, so dropped.
      __ktMock.post({ head: 'w ' + (b - 1) + ':999', payload: JSON.stringify('kt_theme') + '\n' + JSON.stringify('heavyweight') });
      const res = __ktMock.deliver();
      return { boot: row.boot, seq: row.pseq, firstSeq: __ktMock.journal().filter((r) => r.boot === b).map((r) => r.pseq).sort((x, y) => x - y)[0], res, theme: __ktMock.values().kt_theme };
    }, d.boot);
    assert(ops.boot === d.boot && ops.firstSeq === 1, 'this document\'s ops carry its boot and count from 1: ' + JSON.stringify(ops));
    assert(ops.res[0] === 'stale' && ops.theme === 'dark', 'a post from an earlier boot never overwrites a newer write: ' + JSON.stringify(ops));
    assert((await check(app)).ok, 'store == WebKit after the re-seed');
    const leaked = await ev(app, () => __ktMock.log.concat().some((e) => /kt_apikey|migration-key/.test(e.head + '\n' + (e.payload || ''))));
    assert(!leaked && !(await ev(app, () => 'kt_apikey' in __ktMock.rows())), 'the API key never crossed the channel');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

// A device on 60 that has migrated and launched once more without the harness's re-seed.
async function migrated(opts) {
  const app = await start(opts);
  await relaunchWith(app, { seed: false });
  const d = await docInfo(app);
  assert(d.answer && d.answer.rule === 0, 'in step before the case: ' + JSON.stringify(d.answer));
  return app;
}

serial('witness: WebKit behind the store is would-repair while the witness is known, adoption when an older build stamped it', async () => {
  const app = await migrated();
  try {
    // A finished workout and its departure stamp reach the store; then WebKit loses them in a hard kill.
    const J = await ev(app, () => __ktMock.wk());
    const newer = await ev(app, () => {
      const s = getSessions();
      s.unshift({ id: Date.now(), date: todayISO(), type: 'Push', week: 1, exercises: [{ name: 'Barbell Bench Press', isMain: true, sets: 1, reps: [5], weight: 185, weightLog: [185], rpe: 8 }], prs: [] });
      lsSet('kt_sessions', s);
      return localStorage.getItem('kt_sessions');
    });
    await ev(app, (J) => __ktMock.next({ restore: J }), J);
    await app.reload();
    let d = await docInfo(app);
    let st = await status(app);
    assert(d.answer.rule === 6 && d.answer.label === 'lag', 'rule 6 lag: ' + JSON.stringify(d.answer));
    assert(st.lastHello.wouldRepair.indexOf('kt_sessions') >= 0, 'kt_sessions would be repaired: ' + JSON.stringify(st.lastHello));
    assert(d.wrote.length === 0, 'observe mode: the store writes nothing into WebKit: ' + d.wrote);
    const lag = await ev(app, () => { const c = __ktMock.conflicts().filter((x) => x.key === 'kt_sessions')[0]; return c ? { why: c.why, value: __ktMock.conflictValue(c.id) } : null; });
    assert(lag && lag.why === 'lag' && lag.value === newer, 'the newer workout is kept for Put back: ' + JSON.stringify(lag && lag.why));
    const followed = await ev(app, (J) => __ktMock.values().kt_sessions === J.kt_sessions && localStorage.getItem('kt_sessions') === J.kt_sessions, J);
    assert(followed, 'build 60 follows WebKit');
    assert(st.counts.counts.lag === 1 && st.counts.counts.wouldRepairKeys >= 1, 'counted: ' + JSON.stringify(st.counts.counts));

    // The same WebKit-behind state, but stamped by an older build: the witness is unknown, so it is adopted.
    const J2 = await ev(app, () => __ktMock.wk());
    await ev(app, () => { const s = getSessions(); s.unshift({ id: Date.now(), date: todayISO(), type: 'Pull', week: 1, exercises: [], prs: [] }); lsSet('kt_sessions', s); });
    J2.kt_last_open = '1700000000000';
    await ev(app, (J2) => __ktMock.next({ restore: J2 }), J2);
    await app.reload();
    d = await docInfo(app);
    st = await status(app);
    const why = await reasons(app);
    assert(d.answer.rule === 4 && d.answer.label === 'older build', 'an unknown witness: rule 4: ' + JSON.stringify(d.answer));
    assert(st.lastHello.wouldRepair.length === 0 && why.kt_sessions === 'older build' && why.kt_last_open === 'older build', 'adopted, not would-repair: ' + JSON.stringify(why));
    assert(d.wrote.length === 0, 'nothing written into WebKit: ' + d.wrote);
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

// An older build deletes for real; the next launch with the facade adopts the deletions and refills nothing.
async function olderBuildDeletes(prepare, act, deleted) {
  const app = await migrated();
  try {
    if (prepare) await ev(app, prepare);
    const before = await ev(app, () => __ktMock.wk());
    deleted.forEach((k) => assert(before[k] != null, k + ' exists before the older build runs'));
    await relaunchWith(app, { shell: false });   // build 59
    await ev(app, act);
    await app.page.waitForTimeout(150);
    const on59 = await ev(app, () => __ktMock.wk());
    deleted.forEach((k) => assert(on59[k] == null, k + ' deleted on 59'));
    await relaunchWith(app, { shell: true });    // back on 60
    const d = await docInfo(app);
    assert(d.mode === 'shadow' && d.answer.rule === 4 && d.answer.label === 'older build', 'rule 4: ' + JSON.stringify(d.answer));
    assert(d.wrote.length === 0, 'nothing refilled in WebKit: ' + d.wrote);
    const out = await ev(app, (deleted) => deleted.map((k) => {
      const c = __ktMock.conflicts().filter((x) => x.key === k)[0];
      return { k, wk: localStorage.getItem(k), row: __ktMock.row(k), why: c && c.why, kept: c ? __ktMock.conflictValue(c.id) : undefined };
    }), deleted);
    out.forEach((o) => {
      assert(o.wk === null, o.k + ' stays deleted in WebKit');
      assert(o.row && o.row.v === null && o.row.src === 'adopt:older build', o.k + ' is a tombstone in the store: ' + JSON.stringify(o.row));
      assert(o.why === 'older build' && o.kept === before[o.k], o.k + ': the value given up is kept exactly, for Put back');
    });
    assert((await check(app)).ok, 'store == WebKit');
    await app.reload();
    const again = await docInfo(app);
    const still = await ev(app, (deleted) => deleted.filter((k) => localStorage.getItem(k) !== null || __ktMock.values()[k] != null), deleted);
    assert(again.answer.rule === 0 && still.length === 0, 'the next launch is in step and nothing came back: ' + JSON.stringify(again.answer) + ' ' + still);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
}
const confirmSheet = () => { const b = document.querySelector('.kt-close-sheet button[id$="ok"]'); if (!b) throw new Error('no confirm sheet'); b.click(); };
const chat = () => { lsSet('kt_coach_msgs', [{ role: 'user', content: 'Build me a plan', at: Date.now() }, { role: 'assistant', content: 'Here it is.', at: Date.now() }]); };

serial('older build 1/4: Reset programme deletes the programme and the chat; both are tombstoned, nothing refilled', async () => {
  await olderBuildDeletes(chat, () => { resetCustomRoutine(); (function () { const b = document.querySelector('.kt-close-sheet button[id$="ok"]'); b.click(); })(); }, ['kt_routine', 'kt_coach_msgs']);
});

serial('older build 2/4: Start new programme deletes the programme, the next round and its intro card, and the chat', async () => {
  await olderBuildDeletes(() => {
    lsSet('kt_coach_msgs', [{ role: 'user', content: 'hi', at: Date.now() }]);
    lsSet('kt_routine_next', { startsOn: _nextMonday(addDays(todayISO(), 60)), at: todayISO() });
    lsSet('kt_round_intro', { cycle: 2, top: [], until: addDays(todayISO(), 3) });
  }, () => { startNewProgramme(); document.querySelector('.kt-close-sheet button[id$="ok"]').click(); },
  ['kt_routine', 'kt_routine_next', 'kt_round_intro', 'kt_coach_msgs']);
});

serial('older build 3/4: Clear chat deletes the chat; it is tombstoned, not refilled', async () => {
  await olderBuildDeletes(chat, () => { clearCoachHistory(); }, ['kt_coach_msgs']);
});

serial('older build 4/4: a REPLACE restore of a sparse file deletes every key the file lacks, the Health ledger with it', async () => {
  await olderBuildDeletes(() => {
    lsSet('kt_hk_imported', ['uuid-1', 'uuid-2']);
    localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3600e3));
  }, () => {
    if (!_applyImportedData({ kt_sessions: [{ id: 1, date: addDays(todayISO(), -3), type: 'Push', week: 1, exercises: [], prs: [] }], kt_week: 1, kt_coach_msgs: [] })) throw new Error('restore refused');
  }, ['kt_routine', 'kt_runs', 'kt_bw', 'kt_bench_goal', 'kt_hk_imported', 'kt_hk_last_sync']);
});

serial('WebKit unreadable at document start: hello nowk, the facade stays off, the store keeps everything and changes nothing', async () => {
  const app = await migrated();
  try {
    const before = await ev(app, () => __ktMock.values());
    await ev(app, () => __ktMock.next({ unreadable: true }));
    await app.reload();
    const d = await docInfo(app);
    const st = await status(app);
    assert(d.head === 'hello nowk' && d.answer && d.answer.mode === 'off' && d.answer.why === 'nowk', 'hello nowk answered off: ' + JSON.stringify(d));
    assert(d.mode === 'off' && d.why === 'webkit unreadable' && d.prompts === 1, 'the facade attached nothing: ' + JSON.stringify(d));
    assert(st.lastHello.rule === 2 && st.counts.counts.nowk === 1, 'rule 2 recorded: ' + JSON.stringify(st.lastHello));
    // Never read as empty: the store still holds the last document's set (its departure stamp included).
    const kept = await ev(app, () => ({ values: JSON.stringify(__ktMock.values()), jlen: __ktMock.journal().length }));
    const was = JSON.parse(kept.values);
    assert(Object.keys(before).every((k) => k === 'kt_last_open' || was[k] === before[k]) && Object.keys(was).length >= Object.keys(before).length, 'the store kept every value');
    // The page runs on WebKit (readable again after the facade looked): its writes never reach the store.
    await ev(app, () => { localStorage.setItem('kt_theme', 'dark'); });
    const now = await ev(app, () => ({ values: JSON.stringify(__ktMock.values()), jlen: __ktMock.journal().length, real: localStorage instanceof Storage }));
    assert(now.values === kept.values && now.jlen === kept.jlen && now.real, 'nothing written: ' + (now.values === kept.values) + ' ' + now.jlen + '/' + kept.jlen);
    // The next launch with WebKit readable: the page stamped its visit without the facade, so it is adopted.
    await app.reload();
    const next = await docInfo(app);
    assert(next.answer.rule === 4 && (await ev(app, () => __ktMock.values().kt_theme)) === 'dark', 'the next start adopts what the page wrote meanwhile: ' + JSON.stringify(next.answer));
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('WebKit wiped: the store keeps its set, writes nothing into WebKit, offers Put back; Put back restores both copies', async () => {
  const app = await migrated();
  try {
    await ev(app, chat);
    const before = await ev(app, () => __ktMock.values());
    await ev(app, () => __ktMock.next({ wipe: true }));
    await app.reload();
    const d = await docInfo(app);
    assert(d.answer && d.answer.mode === 'off' && d.answer.why === 'wiped' && d.mode === 'off', 'rule 3 answers off: ' + JSON.stringify(d));
    assert(d.beforeKeys.length === 0 && d.afterKeys.length === 0, 'nothing written into the wiped WebKit: ' + d.afterKeys);
    const st = await status(app);
    assert(st.lastHello.rule === 3 && st.wipeOffer && /-wiped\.json$/.test(st.wipeOffer.snap), 'Put back offered from a snapshot: ' + JSON.stringify(st.wipeOffer));
    // The set as the last document left it (its departure stamp included): kept exactly, and in the snapshot.
    const kept = await ev(app, () => __ktMock.values());
    assert(Object.keys(before).every((k) => k === 'kt_last_open' || kept[k] === before[k]), 'nothing given up at the wipe');
    const snapOk = await ev(app, (kept) => JSON.stringify(__ktMock.readSnap(__ktMock.status().wipeOffer.snap)) === JSON.stringify(kept), kept);
    assert(snapOk, 'the snapshot holds the whole set');
    // The page booted fresh on the empty WebKit (no facade): the owner logs a workout there.
    const fresh = await ev(app, () => ({ routine: !!getCustomRoutine(), sessions: getSessions().length }));
    assert(!fresh.routine && fresh.sessions === 0, 'the page booted fresh: ' + JSON.stringify(fresh));
    // The follow-up launch adopts the fresh page (labelled "wiped"); then the owner puts the snapshot back.
    await app.reload();
    const follow = await docInfo(app);
    assert(follow.answer.rule === 4 && (await reasons(app)).kt_routine === 'wiped', 'the follow-up adopts, keeping each value as "wiped": ' + JSON.stringify(follow.answer));
    const newId = await ev(app, () => { const id = Date.now(); lsSet('kt_sessions', [{ id, date: todayISO(), type: 'Push', week: 1, exercises: [], prs: [] }]); return id; });
    const plan = await ev(app, () => __ktMock.stagePutBack({ snap: __ktMock.status().wipeOffer.snap }));
    const items = {}; plan.items.forEach((i) => { items[i.key] = i.outcome; });
    assert(plan.count >= 5 && items.kt_routine === 'put back' && items.kt_sessions === 'put back' && items.kt_coach_msgs === 'put back', 'Put back plan: ' + JSON.stringify(items));
    await app.reload();
    const pb = await docInfo(app);
    assert(pb.answer.putback === true && pb.wrote.indexOf('kt_routine') >= 0, 'the facade wrote the staged values at document start: ' + pb.wrote);
    const back = await ev(app, ({ kept, newId }) => {
      const sessions = JSON.parse(localStorage.getItem('kt_sessions'));
      return {
        routine: localStorage.getItem('kt_routine') === kept.kt_routine && __ktMock.values().kt_routine === kept.kt_routine,
        chat: localStorage.getItem('kt_coach_msgs') === kept.kt_coach_msgs && __ktMock.values().kt_coach_msgs === kept.kt_coach_msgs,
        merged: sessions[0].id === newId && JSON.parse(kept.kt_sessions).every((s) => sessions.some((x) => x.id === s.id)),
        sameSessions: __ktMock.values().kt_sessions === localStorage.getItem('kt_sessions'),
        pageReads: !!getCustomRoutine() && getSessions().length === sessions.length,
        putbackRows: __ktMock.conflicts().filter((c) => c.why === 'putback').length,
        staged: __ktMock.status().putBackStaged,
      };
    }, { kept, newId });
    assert(back.routine && back.chat, 'WebKit and the store hold the put-back values: ' + JSON.stringify(back));
    assert(back.merged && back.sameSessions, 'the log is merged by id (the new workout and every old one), alike in both copies');
    assert(back.pageReads, 'the page reads what was put back');
    assert(back.putbackRows >= 3 && !back.staged, 'what Put back replaced is kept, so it can be put back in turn: ' + back.putbackRows);
    assert((await check(app)).ok, 'store == WebKit');
    await app.reload();
    assert((await docInfo(app)).answer.rule === 0, 'in step after Put back');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('half an emoji: a lone surrogate in a value and a pair in a key travel and come back exactly', async () => {
  const app = await migrated();
  try {
    const out = await ev(app, () => {
      const HIGH = String.fromCharCode(0xd83d), PAIR = String.fromCharCode(0xd83d, 0xdcaa);
      const name = 'Kal' + HIGH, key = 'kt_emoji ' + PAIR;
      localStorage.setItem('kt_user_name', name);
      localStorage.setItem(key, 'pair ' + PAIR);
      lsSet('kt_coach_msgs', [{ role: 'user', content: 'Message ' + PAIR + ' half ' + HIGH }]);
      const w = __ktMock.log.filter((e) => e.head.charAt(0) === 'w').map((e) => e.payload).join('\n');
      return {
        name: __ktMock.values().kt_user_name === name, key: __ktMock.values()[key] === 'pair ' + PAIR,
        chat: __ktMock.values().kt_coach_msgs === localStorage.getItem('kt_coach_msgs'),
        hash: __ktMock.row('kt_user_name').h === __ktMock.H(name) && __ktMock.H(name) === '4:' + (function () { let a = 0x811c9dc5; for (const c of [75, 97, 108, 0xd83d]) a = Math.imul(a ^ c, 0x01000193) >>> 0; return a.toString(16); })() + ':' + (function () { let b = 5381; for (const c of [75, 97, 108, 0xd83d]) b = (Math.imul(b, 33) + c) >>> 0; return b.toString(16); })(),
        ascii: /\\ud83d/.test(w) && !/[\ud800-\udfff]/.test(w.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')),
      };
    });
    assert(out.name && out.key && out.chat, 'the store holds the exact code units: ' + JSON.stringify(out));
    assert(out.hash, 'hashed over code units as KTWire.hash does');
    assert(out.ascii, 'the lone surrogate crossed as an ASCII escape, never raw');
    await app.reload();
    const d = await docInfo(app);
    const again = await ev(app, () => __ktMock.values().kt_user_name.length === 4 && __ktMock.values().kt_user_name.charCodeAt(3) === 0xd83d);
    assert(d.answer.rule === 0 && again, 'in step across a relaunch, the half emoji intact: ' + JSON.stringify(d.answer));
    assert((await check(app)).ok, 'store == WebKit');
  } finally { await app.close(); }
});

serial('the API key passes through: WebKit keeps it, nothing about it crosses the channel or reaches the store', async () => {
  const app = await migrated();
  try {
    const KEY = 'sk-ant-api03-passthrough-' + 'x'.repeat(40);
    const out = await ev(app, (KEY) => {
      const n0 = __ktMock.log.length;
      setApiKey(KEY);
      return { ops: __ktMock.log.length - n0, wk: localStorage.getItem('kt_apikey'), getApiKey: getApiKey(), passthrough: __ktStoreState.passthrough, acked: __ktStoreState.acked('kt_apikey'), remirror: __ktStoreState.remirror('kt_apikey') };
    }, KEY);
    assert(out.ops === 0 && out.wk === KEY && out.getApiKey === KEY, 'written to WebKit only, no op sent: ' + JSON.stringify(out));
    assert(out.passthrough >= 1 && out.acked && out.remirror, 'counted as passthrough; acked and remirror have nothing to do');
    await app.reload();
    const d = await docInfo(app);
    const leak = await ev(app, (KEY) => {
      const text = __ktMock.log.map((e) => e.head + '\n' + (e.payload || '') + '\n' + (e.answer || '')).join('\n');
      return { inLog: text.indexOf('kt_apikey') >= 0 || text.indexOf(KEY) >= 0, inStore: 'kt_apikey' in __ktMock.rows(), inSnaps: __ktMock.snaps().some((n) => 'kt_apikey' in __ktMock.readSnap(n)),
        inConflicts: __ktMock.conflicts().some((c) => c.key === 'kt_apikey'), wk: localStorage.getItem('kt_apikey') };
    }, KEY);
    assert(d.answer.rule === 0, 'in step: ' + JSON.stringify(d.answer));
    assert(!leak.inLog, 'hello\'s manifest carries no API key entry, not even its hash');
    assert(!leak.inStore && !leak.inSnaps && !leak.inConflicts && leak.wk === KEY, 'never in the store, its snapshots or conflicts: ' + JSON.stringify(leak));
  } finally { await app.close(); }
});

serial('observe mode writes nothing: in step, older build, gap, lag and unexplained all leave WebKit as the facade found it', async () => {
  const app = await migrated();
  try {
    const seen = [];
    const step = async (label) => { const d = await docInfo(app); seen.push(label + ':' + d.answer.rule + (d.wrote.length ? '!' + d.wrote : '')); return d; };
    await app.reload(); await step('in step');
    // older build
    await relaunchWith(app, { shell: false });
    await ev(app, () => localStorage.setItem('kt_unit_w', 'kg'));
    await relaunchWith(app, { shell: true }); await step('older build');
    // gap: a mirror with no answer and its post lost; the note in WebKit explains it
    await ev(app, () => { __ktMock.device({ hold: true }); __ktMock.fail({ op: 'w', key: 'kt_unit_w', answer: null, times: 1 }); localStorage.setItem('kt_unit_w', 'lb'); });
    await app.reload();
    const g = await step('gap');
    assert(g.wrote.length === 1 && g.wrote[0] === 'kt__store_gap', 'the only change is the facade dropping its own note: ' + g.wrote);
    await ev(app, () => __ktMock.device({ hold: false }));
    // lag
    const J = await ev(app, () => __ktMock.wk());
    await ev(app, () => lsSet('kt_bench_goal', 315));
    await ev(app, (J) => __ktMock.next({ restore: J }), J);
    await app.reload(); await step('lag');
    // unexplained: WebKit changed behind the facade with the witness unchanged (a tool wrote WebKit's file)
    await ev(app, () => __ktMock.next({ plant: { kt_tool_note: 'written into WebKit\'s file' } }));
    await app.reload(); await step('unexplained');
    assert(JSON.stringify(seen) === JSON.stringify(['in step:0', 'older build:4', 'gap:5!kt__store_gap', 'lag:6', 'unexplained:7']), 'each rule, and WebKit untouched: ' + JSON.stringify(seen));
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('Put back of a value the store gave up writes it into WebKit and the store alike, at the next document start', async () => {
  const app = await migrated();
  try {
    // WebKit loses a programme edit (rule 6): the store keeps the edited programme for Put back.
    const J = await ev(app, () => __ktMock.wk());
    const edited = await ev(app, () => { const r = getCustomRoutine(); r.name = 'Edited programme'; setCustomRoutine(r); return localStorage.getItem('kt_routine'); });
    await ev(app, (J) => __ktMock.next({ restore: J }), J);
    await app.reload();
    assert((await docInfo(app)).answer.rule === 6, 'lag');
    const id = await ev(app, () => __ktMock.conflicts().filter((c) => c.key === 'kt_routine' && c.why === 'lag')[0].id);
    const plan = await ev(app, (id) => __ktMock.stagePutBack({ conflicts: [id] }), id);
    assert(plan.count === 1 && plan.items[0].outcome === 'put back', 'staged: ' + JSON.stringify(plan));
    await app.reload();
    const d = await docInfo(app);
    const out = await ev(app, () => ({ wk: localStorage.getItem('kt_routine'), store: __ktMock.values().kt_routine, name: getCustomRoutine().name,
      p: __ktMock.log.filter((e) => e.head.charAt(0) === 'p' && e.head.charAt(1) === ' ').map((e) => e.answer), replaced: __ktMock.conflicts().filter((c) => c.key === 'kt_routine' && c.why === 'putback').length }));
    assert(d.answer.putback === true && JSON.stringify(d.wrote) === '["kt_routine"]', 'the facade wrote it before the page\'s scripts: ' + d.wrote);
    assert(out.wk === edited && out.store === edited && out.name === 'Edited programme', 'both copies hold it and the page reads it: ' + out.name);
    assert(JSON.stringify(out.p) === '["ok"]' && out.replaced === 1, 'confirmed with p, the replaced value kept: ' + JSON.stringify(out));
    // A value changed since it was given up is left alone.
    const J2 = await ev(app, () => __ktMock.wk());
    await ev(app, () => lsSet('kt_squat_goal', 405));
    await ev(app, (J2) => __ktMock.next({ restore: J2 }), J2);
    await app.reload();
    const id2 = await ev(app, () => { lsSet('kt_squat_goal', 365); return __ktMock.conflicts().filter((c) => c.key === 'kt_squat_goal' && c.why === 'lag')[0].id; });
    const p2 = await ev(app, (id2) => __ktMock.previewPutBack({ conflicts: [id2] }), id2);
    assert(p2.count === 0 && p2.items[0].outcome === 'changed since', 'a key changed since is left alone: ' + JSON.stringify(p2));
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('Put back of a value the store held as none is a removal: the plan says so (removes), and the value it removes can come back', async () => {
  const app = await migrated();
  try {
    // Build 59 pins a Log tab: a key the store never held. Back on 60 the store adopts it and keeps "no value".
    await relaunchWith(app, { shell: false });
    await ev(app, () => localStorage.setItem('kt_log_tabs', '["run","body"]'));
    await relaunchWith(app, { shell: true });
    assert((await docInfo(app)).answer.rule === 4, 'rule 4');
    const c = await ev(app, () => __ktMock.conflicts().filter((x) => x.key === 'kt_log_tabs')[0]);
    assert(c && c.why === 'older build' && c.units == null, 'kept as no value: ' + JSON.stringify(c));
    const plan = await ev(app, (id) => __ktMock.previewPutBack({ conflicts: [id] }), c.id);
    assert(plan.count === 1 && plan.items[0].outcome === 'put back' && plan.items[0].removes === true, 'the plan marks the removal: ' + JSON.stringify(plan));
    // Staged: the facade removes it from WebKit, the store tombstones it, and what it removed is kept.
    await ev(app, (id) => __ktMock.stagePutBack({ conflicts: [id] }), c.id);
    await app.reload();
    const out = await ev(app, () => ({ wk: localStorage.getItem('kt_log_tabs'), row: __ktMock.row('kt_log_tabs'),
      kept: __ktMock.conflicts().filter((x) => x.key === 'kt_log_tabs' && x.why === 'putback').map((x) => ({ id: x.id, v: __ktMock.conflictValue(x.id) })) }));
    assert(out.wk === null && out.row && out.row.v === null && out.row.src === 'putback', 'removed from both copies: ' + JSON.stringify(out));
    assert(out.kept.length === 1 && out.kept[0].v === '["run","body"]', 'the removed value is kept: ' + JSON.stringify(out.kept));
    const back = await ev(app, (id) => __ktMock.stagePutBack({ conflicts: [id] }), out.kept[0].id);
    assert(back.count === 1 && !back.items[0].removes, 'putting it back is not a removal: ' + JSON.stringify(back));
    await app.reload();
    assert(await ev(app, () => localStorage.getItem('kt_log_tabs')) === '["run","body"]', 'it came back');
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
