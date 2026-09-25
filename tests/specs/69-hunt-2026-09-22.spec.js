// Pins from the 2026-09-22 pre-emptive bug hunt (page side). Each block is one finding:
// a restored draft's sets survive a wrist finish; a second session of the same slot stays its own
// record; main-lift flags come from the session's own day; a phone undo reaches the wrist even at
// zero sets and an OLD watch's later sets are still taken; a stale 'ended' stops once the wrist has
// moved on; the LIVE banner is suppressed by identity only; a discard is flushed at once; the widget
// deep link opens the run log on run days; next week's counts; storage-full honesty in the coach
// tools and history editor; only the corrected exercise's working weight follows; rpeLog resized;
// default cadence read back; absurd loads bounded; PRs/weights written only after a successful save.
const { boot, assert, run } = require('../lib/harness');

run('bug hunt 2026-09-22: page-side pins', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // 'A few minutes ago', but never before 00:01 today: sessions file by their start, so a run
      // just after midnight would otherwise land on yesterday and miss the today-based lookups.
      const recent = m => Math.min(Date.now() - 1000, Math.max(new Date().setHours(0, 1, 0, 0), Date.now() - m * 60000));   // never in the future (00:00-00:01)
      const W = Capacitor.Plugins.TrovoWatch;
      let cleared = [], pending = [], ctx = null, pushes = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = (o) => { cleared.push(o && o.sessions ? o.sessions.length : 'all'); pending = []; return Promise.resolve({}); };
      W.updateContext = (p) => { ctx = p; pushes.push(p); return Promise.resolve({ sent: true }); };
      const today = todayISO();
      const pushName = _dayLabel('Push'), pullName = _dayLabel('Pull');
      const isoOf = ms => new Date(ms).toISOString();
      const toasts = []; const realToast = window.showToast; window.showToast = (m, k) => { toasts.push([m, k]); };

      // ── A. a restored draft's phone-only sets survive the wrist's finish ──
      openDeckRunner('Push');
      const A = runnerSession.exercises[0].name;
      runnerRepsLog[A] = [8, 8, 8]; runnerWeightsLog[A] = [100, 100, 100]; runnerRpeLog[A] = [8, 9, 9]; runnerCompleted[A] = 3;
      _flushRunnerDraft();
      runnerOpen = false; runnerResumePending = true;   // cold launch: draft restored, runner closed
      pending = [JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: isoOf(recent(20)), loggedAt: isoOf(Date.now()),
        exercises: [{ name: 'Overhead Press', reps: [10, 10], weight: 60 }] })];
      drainWatchSessions(); await wait(300);
      const recA = getSessions().filter(x => x.date === today && x.type === 'Push');
      r.draft = { count: recA.length, names: recA[0] && recA[0].exercises.map(e => e.name + ':' + e.reps.join('/')), gone: !localStorage.getItem('kt_runner_draft'), pending: runnerResumePending, cleared: cleared.slice() };
      const foldA = recA[0] && recA[0].exercises.find(e => e.name === A);
      r.draftRpe = foldA && { rpe: foldA.rpe, rpeLog: foldA.rpeLog };
      runnerSession = null;

      // ── B. a second Push in the evening is its own record; the same session merges ──
      lsSet('kt_sessions', [{ id: Date.now() - 3 * 3600000, date: today, type: 'Push', label: pushName, week: currentWeek, note: '', prs: [],
        startedAt: Date.now() - 4 * 3600000, exercises: [{ name: A, sets: 3, reps: [8, 8, 8], weight: 100, weightLog: [100, 100, 100] }] }]);
      const eveStart = isoOf(recent(20));
      pending = [JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: eveStart, loggedAt: isoOf(Date.now()),
        exercises: [{ name: A, reps: [8, 8, 8], weight: 105 }, { name: 'Curl', reps: [12], weight: 30 }] })];
      drainWatchSessions(); await wait(300);
      const recB = getSessions().filter(x => x.date === today && x.type === 'Push');
      r.second = { count: recB.length, evening: recB.map(x => (x.exercises.find(e => e.name === A) || {}).weight).sort() };
      // the same wrist session drained again merges (nothing new)
      const before = JSON.stringify(getSessions());
      pending = [JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: eveStart, loggedAt: isoOf(Date.now()),
        exercises: [{ name: A, reps: [8, 8, 8], weight: 105 }, { name: 'Curl', reps: [12], weight: 30 }] })];
      drainWatchSessions(); await wait(300);
      r.second.redrainSame = JSON.stringify(getSessions()) === before && getSessions().length === 2;

      // ── C. main-lift flags from the session's own day (today is not Push) ──
      const cr = getCustomRoutine(); cr.weekPlan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']; (cr.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr);
      lsSet('kt_sessions', []);
      const pullMain = getSessionExercises('Pull').filter(e => e.isMain).map(e => e.name);
      pending = [JSON.stringify({ dayName: pullName, slot: 'Pull', startedAt: isoOf(recent(30)), loggedAt: isoOf(Date.now()),
        exercises: pullMain.slice(0, 1).map(n => ({ name: n, reps: [5, 5], weight: 200 })) })];
      drainWatchSessions(); await wait(300);
      const recC = getSessions()[0];
      r.isMain = { expect: pullMain.length > 0, got: !!(recC && recC.exercises[0] && recC.exercises[0].isMain), pr: recC && recC.prs, kw: getWeights()[pullMain[0]] };

      // ── D. undo to zero reaches the wrist; an old watch's LATER sets are taken, its stale ones are not ──
      lsSet('kt_sessions', []);
      openDeckRunner('Push');
      runnerRepsLog[A] = [8]; runnerWeightsLog[A] = [100]; runnerCompleted[A] = 1;
      const l1 = {}; l1[A] = [8]; _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: l1, weights: {} });   // wrist held 1
      runnerUndoSet(A, 0);
      const lv = _buildWatchLive();
      r.undoZero = { repsHasA: !!(lv.reps && Array.isArray(lv.reps[A])), len: lv.reps && lv.reps[A] && lv.reps[A].length, own: !!(lv.own && lv.own[A]), lastAt: typeof lv.lastAt === 'number' };
      const l2 = {}; l2[A] = [8, 10, 10]; const w2 = {}; w2[A] = 105;
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: l2, weights: w2 });   // build 49/50: no `at`
      r.oldWatch = { log: runnerRepsLog[A].slice(0, runnerCompleted[A]), w: runnerWeightsLog[A].slice(0, runnerCompleted[A]) };
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: l2, weights: w2 });   // same payload again: nothing doubles
      r.oldWatch.again = runnerRepsLog[A].slice(0, runnerCompleted[A]);
      // build 52 ack: the wrist adopted the correction, its log is taken whole
      const own = runnerSession.ownAt[A]; const l3 = {}; l3[A] = [10, 10, 9]; const ack = {}; ack[A] = own;
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: l3, weights: w2, ack: ack });
      r.ack = runnerRepsLog[A].slice(0, runnerCompleted[A]);

      // ── E. finishing: PRs judged on the merged record, committed after the save ──
      lsSet('kt_prs', {}); lsSet('kt_weights', {});
      const s0 = getSessions();
      s0.unshift({ id: Date.now() - 1000, date: today, type: 'Push', label: pushName, week: currentWeek, note: 'From Apple Watch', prs: [], wristStartedAt: isoOf(runnerSession.startedAt),
        exercises: [{ name: 'Wrist Curl', sets: 2, reps: [12, 12], weight: 30, weightLog: [30, 30] }] });
      lsSet('kt_sessions', s0);
      runnerFinishSession(); await wait(150);
      const recE = getSessions().find(x => x.date === today && x.type === 'Push' && x.note === '');
      r.finish = { prs: recE && recE.prs.slice().sort(), curl: !!(recE && recE.exercises.find(e => e.name === 'Wrist Curl')), kprs: Object.keys(getPRs()).sort(), ownLen: recE && recE.phoneOwnedLen };
      document.querySelectorAll('.kt-complete-sheet, #kt-complete-sheet').forEach(e => e.remove());

      // ── F. a stale 'ended' stops riding the context once the wrist moved on; banner identity ──
      r.endedBefore = !!_buildWatchLive();
      const lf = {}; lf[A] = [8];
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now() + 5000, reps: lf, weights: {} });   // a new wrist session after the finish
      r.endedAfter = !!_buildWatchLive();
      r.bannerNew = _watchLive && _watchLive.dayName;
      _watchLive = null;
      // the finished session re-announced by an old watch: suppressed by identity
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: recE.startedAt, reps: lf, weights: {} });
      r.bannerFiled = _watchLive;
      // a manual entry logged during a live wrist session does not hide it
      const sm = getSessions(); sm.unshift({ id: Date.now() + 1, date: today, type: 'Pull', label: pullName, week: currentWeek, note: '', prs: [], exercises: [{ name: 'Row', sets: 1, reps: [8], weight: 50 }] }); lsSet('kt_sessions', sm);
      _onWatchLive({ dayName: pullName, slot: 'Pull', startedAt: recent(30), reps: { Row: [8] }, weights: {} });
      r.bannerManual = _watchLive && _watchLive.dayName;
      _watchLive = null;

      // ── G. a discard is flushed before START can replace it ──
      openDeckRunner('Pull');
      const P0 = runnerSession.exercises[0].name;
      runnerRepsLog[P0] = [8]; runnerWeightsLog[P0] = [80]; runnerCompleted[P0] = 1;
      pushes = [];
      discardDeckRunner();
      openDeckRunner('Pull');
      const disc = pushes.map(p => { try { return JSON.parse(p.live || 'null'); } catch (e) { return null; } }).filter(Boolean);
      r.discard = { sent: disc.some(p => p && p.discarded), ended: _watchEndedPayload };
      closeDeckRunner(); runnerSession = null;

      // ── H. the widget deep link on a run day opens the run log ──
      const cr2 = getCustomRoutine(); cr2.weekPlan = ['Run', 'Run', 'Run', 'Run', 'Run', 'Run', 'Run']; setCustomRoutine(cr2);
      localStorage.removeItem('kt_runner_draft'); runnerResumePending = false;
      toasts.length = 0;
      r.deep = { handled: _handleDeepLink('trovo://start') };
      await wait(400);
      r.deep.tab = currentTab + '/' + logSubTab; r.deep.runLog = !!runLogOpen; r.deep.errToast = toasts.some(t => /No lift session/.test(t[0]));
      runLogOpen = false;

      // ── I. next week's rows count next week's exercises ──
      const cr3 = getCustomRoutine(); cr3.weekPlan = ['Push', 'Push', 'Push', 'Push', 'Push', 'Push', 'Push'];
      const wkNow = currentWeek, wkNext = Math.min(getTotalWeeks(), wkNow + 1);
      cr3.weeks[wkNow - 1].push = cr3.weeks[wkNow - 1].push.slice(0, 3);
      if (wkNext > wkNow) cr3.weeks[wkNext - 1].push = cr3.weeks[wkNow - 1].push.concat([{ name: 'Extra A', sets: 3, reps: '8' }, { name: 'Extra B', sets: 3, reps: '8' }]);
      setCustomRoutine(cr3);
      const days = _nativeSummaryDays(14);
      const nextRow = days.find(d => weekForDate(d.date) === wkNext && d.type === 'Push');
      r.counts = { now: days[0].lifts, next: nextRow && nextRow.lifts, expectNext: wkNext > wkNow ? 5 : 3 };

      // ── J. storage-full honesty: coach routine write, edit_session, history editor ──
      const realSetItem = Storage.prototype.setItem;
      const block = key => { Storage.prototype.setItem = function (k, v) { if (k === key) throw new Error('QuotaExceededError'); return realSetItem.call(this, k, v); }; };
      const unblock = () => { Storage.prototype.setItem = realSetItem; };
      block('kt_routine');
      const rw = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BASE', bColor: '#06b6d4', push: [{ name: 'Brand New Lift', sets: 3, reps: '8' }] }] });
      unblock();
      r.routineFull = { ok: rw.ok, err: rw.error || '', onDisk: !/Brand New Lift/.test(localStorage.getItem('kt_routine') || '') };
      lsSet('kt_sessions', [{ id: 777, date: '2026-09-18', week: 1, type: 'Pull', prs: [], exercises: [{ name: 'Bar', sets: 3, reps: [21, 21, 21], weight: 40, weightLog: [40, 40, 40], rpeLog: [8, 8, 9] }, { name: 'Pull Up', sets: 3, reps: [8, 8, 8], weight: 0 }] }]);
      lsSet('kt_weights', { 'Bar': 40, 'Pull Up': 0 }); lsSet('kt_ex_notes', { 'Bar': { text: 'slow', date: '2026-09-18' } });
      block('kt_sessions');
      const es = executeCoachTool('edit_session', { id: 777, exercise: 'Bar', rename_to: 'Barbell Curl (21s)' });
      unblock();
      r.editFull = { ok: es.ok, err: es.error || '', diskName: JSON.parse(localStorage.getItem('kt_sessions'))[0].exercises[0].name, weightsBar: getWeights()['Bar'], note: !!(lsGet('kt_ex_notes') || {})['Bar'] };
      // history editor: a failed save keeps the sheet open and moves nothing
      openSessionEditor(777); await wait(50);
      const nEl = document.getElementById('se_0_name'); if (nEl) nEl.value = 'Barbell Curl (21s)';
      block('kt_sessions'); toasts.length = 0;
      saveSessionEdit();
      unblock();
      r.editorFull = { open: !!document.getElementById('se_0_name'), diskName: JSON.parse(localStorage.getItem('kt_sessions'))[0].exercises[0].name, updatedToast: toasts.some(t => /Updated/.test(t[0])), weightsBar: getWeights()['Bar'] };
      closeSessionEditor();

      // ── K. edit_session touches only the corrected lift's working weight; rpeLog resized ──
      lsSet('kt_weights', { 'Bar': 40, 'Pull Up': 0, 'Other': 1 });
      const es2 = executeCoachTool('edit_session', { id: 777, exercise: 'Pull Up', reps: [8, 8], weight: 25 });
      lsSet('kt_weights', Object.assign(getWeights(), { 'Bar': 55 }));   // the user bumped Bar afterwards
      const es3 = executeCoachTool('edit_session', { id: 777, exercise: 'Pull Up', reps: [8] });
      const recK = getSessions().find(x => x.id === 777);
      const barK = recK.exercises.find(e => e.name === 'Bar');
      const es4 = executeCoachTool('edit_session', { id: 777, exercise: 'Bar', reps: [21] });
      const barK2 = getSessions().find(x => x.id === 777).exercises.find(e => e.name === 'Bar');
      r.only = { ok: es2.ok && es3.ok && es4.ok, barWeightKept: getWeights()['Bar'], rpeAfter: barK2.rpeLog, setsAfter: barK2.sets };

      // ── L. default cadence reads back as the real cadence ──
      const cr4 = getCustomRoutine(); delete cr4.weekPlan; (cr4.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr4);
      const rb = _routineReadback([currentWeek]);
      r.cadence = rb.cadence;

      // ── M. absurd loads are bounded ──
      openDeckRunner('Push');
      let threw = false; try { runnerSetWeight('100000000000000000000'); } catch (e) { threw = true; }
      r.load = { threw, w: runnerWeights[runnerSession.exercises[0].name], plate: _plateMath(1e15) };
      closeDeckRunner(); runnerSession = null;

      // ── N. a failed drain save leaves PRs and weights untouched; the retry awards the PR ──
      lsSet('kt_sessions', []); lsSet('kt_prs', { 'Squat': 100 }); lsSet('kt_weights', { 'Squat': 100 });
      pending = [JSON.stringify({ dayName: pullName, slot: 'Pull', startedAt: isoOf(recent(30)), loggedAt: isoOf(Date.now()), exercises: [{ name: 'Squat', reps: [5], weight: 140 }] })];
      cleared = [];
      block('kt_sessions');
      drainWatchSessions(); await wait(300);
      unblock();
      r.drainFull = { pr: getPRs()['Squat'], w: getWeights()['Squat'], cleared: cleared.slice(), pending: pending.length };
      drainWatchSessions(); await wait(300);
      const recN = getSessions()[0];
      r.drainFull.retryPrs = recN && recN.prs; r.drainFull.retryPr = getPRs()['Squat'];

      window.showToast = realToast;
      return r;
    });
    assert(out.draft.count === 1 && out.draft.names.some(n => /^Overhead Press:10\/10$/.test(n)) && out.draft.names.some(n => /:8\/8\/8$/.test(n)) && out.draft.gone && !out.draft.pending,
      'a restored draft folds into the wrist record instead of vanishing: ' + JSON.stringify(out.draft));
    assert(out.draftRpe && JSON.stringify(out.draftRpe.rpeLog) === '[8,9,9]' && out.draftRpe.rpe === 9, 'the folded draft keeps its per-set RPE and files the mean: ' + JSON.stringify(out.draftRpe));
    assert(out.draft.cleared.length === 1 && out.draft.cleared[0] === 1, 'the drain clears exactly what it drained: ' + JSON.stringify(out.draft.cleared));
    assert(out.second.count === 2 && out.second.evening.join(',') === '100,105' && out.second.redrainSame, 'an evening session of the same slot is its own record; re-draining it changes nothing: ' + JSON.stringify(out.second));
    assert(out.isMain.expect && out.isMain.got && out.isMain.pr && out.isMain.pr.length === 1 && out.isMain.kw === 200, 'main-lift flag, PR and weight follow the session\'s own day: ' + JSON.stringify(out.isMain));
    assert(out.undoZero.repsHasA && out.undoZero.len === 0 && out.undoZero.own && out.undoZero.lastAt, 'an undo to zero is reported to the wrist: ' + JSON.stringify(out.undoZero));
    assert(JSON.stringify(out.oldWatch.log) === '[10,10]' && JSON.stringify(out.oldWatch.w) === '[105,105]' && JSON.stringify(out.oldWatch.again) === '[10,10]',
      'an old watch\'s later sets are taken once, its undone set is not: ' + JSON.stringify(out.oldWatch));
    assert(JSON.stringify(out.ack) === '[10,10,9]', 'an acknowledged correction takes the wrist log whole: ' + JSON.stringify(out.ack));
    assert(out.finish.curl && out.finish.kprs.indexOf('Wrist Curl') >= 0 && out.finish.prs.indexOf('Wrist Curl') >= 0, 'PRs are judged on the merged record and committed after the save: ' + JSON.stringify(out.finish));
    assert(out.endedBefore && !out.endedAfter && out.bannerNew === 'Push', 'a stale ended stops riding the context once the wrist moved on: ' + JSON.stringify([out.endedBefore, out.endedAfter, out.bannerNew]));
    assert(out.bannerFiled === null && out.bannerManual === 'Pull', 'the LIVE banner is suppressed by identity only: ' + JSON.stringify([out.bannerFiled, out.bannerManual]));
    assert(out.discard.sent, 'a discard is flushed before START can replace it: ' + JSON.stringify(out.discard));
    assert(out.deep.handled && out.deep.tab === 'log/run' && out.deep.runLog && !out.deep.errToast, 'the widget deep link opens the run log on a run day: ' + JSON.stringify(out.deep));
    assert(out.counts.now === 3 && out.counts.next === out.counts.expectNext, 'next week\'s rows count next week\'s exercises: ' + JSON.stringify(out.counts));
    assert(!out.routineFull.ok && /storage is full/.test(out.routineFull.err) && out.routineFull.onDisk, 'a failed routine save is reported as a failure: ' + JSON.stringify(out.routineFull));
    assert(!out.editFull.ok && /storage is full/.test(out.editFull.err) && out.editFull.diskName === 'Bar' && out.editFull.weightsBar === 40 && out.editFull.note, 'a failed edit_session changes nothing: ' + JSON.stringify(out.editFull));
    assert(out.editorFull.open && out.editorFull.diskName === 'Bar' && !out.editorFull.updatedToast && out.editorFull.weightsBar === 40, 'a failed history edit keeps the sheet open and moves nothing: ' + JSON.stringify(out.editorFull));
    assert(out.only.ok && out.only.barWeightKept === 55 && JSON.stringify(out.only.rpeAfter) === '[8]' && out.only.setsAfter === 1, 'only the corrected lift\'s weight follows; rpeLog is resized: ' + JSON.stringify(out.only));
    assert(/Mon=Push \[Push\]/.test(out.cadence) && /default cadence/.test(out.cadence) && !/=\?/.test(out.cadence), 'the default cadence reads back as the real one: ' + out.cadence);
    assert(!out.load.threw && out.load.w === 5000 && out.load.plate === '', 'absurd loads are bounded: ' + JSON.stringify(out.load));
    assert(out.drainFull.pr === 100 && out.drainFull.w === 100 && out.drainFull.cleared.length === 0 && out.drainFull.pending === 1 && JSON.stringify(out.drainFull.retryPrs) === '["Squat"]' && out.drainFull.retryPr === 140,
      'a failed drain save leaves PRs/weights untouched and the retry awards the PR: ' + JSON.stringify(out.drainFull));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
