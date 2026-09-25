// Run editor (web 20260924-10): Progress › Runs › Run history and the Run tab strips open the
// sheet; only touched fields are validated or written; miles, legacy records, validation,
// storage full, Undo (a real click), delete, and Apple Health identity (hkOrig) through an edit,
// a date move, Reset import and a re-import. Built from the reviewed spec (run-editor).
const { boot, assert, run } = require('../lib/harness');
const up = (opts) => boot(opts);

run('A: ways in + sheet + units + legacy + validation', async () => {
  const app = await up();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const set = (id, v) => { document.getElementById(id).value = v; };
      // Progress > Runs history on the demo seed (Cycling-primary, runs stored oldest-first)
      switchTab('progress'); setProgressTab('runs');
      const card = document.querySelector('#screen .kt-run-hist');
      const rows = card ? Array.from(card.querySelectorAll('.kt-run-hist-row')) : [];
      const want = getRuns().slice().sort(_cmpByDateDesc).slice(0, 6).map(x => 'openRunEditor(' + x.id + ')');
      r.hist = { has: !!card, head: card && card.querySelector('.chart-lbl').textContent, n: rows.length,
        order: rows.map(x => x.getAttribute('onclick')).join() === want.join(),
        roles: rows.every(x => x.getAttribute('role') === 'button' && x.getAttribute('tabindex') === '0'),
        firstSub: rows[0] && rows[0].textContent, noColor: !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(card.innerHTML) };
      card.querySelector('.kt-run-hist-more').click();
      r.hist.all = document.querySelectorAll('#screen .kt-run-hist-row').length;
      // open from the first row, focus title, Escape closes and returns focus
      const first = document.querySelector('#screen .kt-run-hist-row');
      first.focus(); first.click();
      const ov = document.getElementById('runEditOverlay');
      r.sheet = { open: !!ov, title: document.getElementById('reTitle').textContent, focused: document.activeElement && document.activeElement.id,
        dialog: ov.querySelector('.kt-sheet').getAttribute('role'), labels: Array.from(ov.querySelectorAll('input,select')).every(i => ov.querySelector('label[for="' + i.id + '"]')),
        noColor: !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(ov.innerHTML) };
      ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      r.sheet.escClosed = !document.getElementById('runEditOverlay');
      r.sheet.focusBack = document.activeElement && document.activeElement.id;
      // no-op save
      const before = localStorage.getItem('kt_runs');
      const id0 = getRuns().slice().sort(_cmpByDateDesc)[0].id;
      openRunEditor(id0); saveRunEdit(id0);
      r.noop = { same: localStorage.getItem('kt_runs') === before, closed: !document.getElementById('runEditOverlay'), undo: !!document.querySelector('#toast .kt-toast-undo') };
      // 5k best follows an edit; undo restores exactly
      const five = getRuns().slice().sort(_cmpByDateDesc).find(x => x.distance === 5);
      const pre = JSON.stringify(five);
      localStorage.setItem('kt_coach_card_x', '1');
      openRunEditor(five.id); set('re_time', '24:00'); saveRunEdit(five.id);
      r.best = { tc: document.getElementById('screen').textContent.indexOf('best 5k pace') >= 0, pace: document.getElementById('screen').textContent.indexOf('4:48 /km') >= 0,
        card: localStorage.getItem('kt_coach_card_x'), undoBtn: !!document.querySelector('#toast .kt-toast-undo'), focusBack: document.activeElement && document.activeElement.id };
      _toastUndo();
      r.best.restored = JSON.stringify(getRuns().find(x => x.id === five.id)) === pre;
      // miles
      localStorage.setItem('kt_unit_d', 'mi');
      lsSet('kt_runs', [{ id: 900, date: '2026-09-20', distance: 5, time: '25:00', type: 'easy', hr: 0, note: '', week: 1 }]);
      openRunEditor(900);
      r.mi = { lbl: document.querySelector('label[for=re_dist]').textContent, v: document.getElementById('re_dist').value, pace: document.getElementById('re_pace').textContent };
      saveRunEdit(900); r.mi.untouched = getRuns()[0].distance;
      openRunEditor(900); _reSetFeel(4); saveRunEdit(900); r.mi.feelOnly = [getRuns()[0].distance, getRuns()[0].feel];
      openRunEditor(900); set('re_dist', '3.110'); saveRunEdit(900); r.mi.sameNumber = getRuns()[0].distance;
      openRunEditor(900); set('re_dist', '6.2'); saveRunEdit(900); r.mi.typed = getRuns()[0].distance;
      localStorage.setItem('kt_unit_d', 'km');
      // legacy
      lsSet('kt_runs', [{ id: 901, date: '2026-07-01', dist: 8, time: '63:00', hr: 0, note: '', week: 2 }]);
      openRunEditor(901);
      r.leg = { d: document.getElementById('re_dist').value, t: document.getElementById('re_time').value, pace: document.getElementById('re_pace').textContent,
        typeVal: document.getElementById('re_type').value, typeLbl: document.getElementById('re_type').selectedOptions[0].textContent };
      _reSetFeel(2); saveRunEdit(901); r.leg.feel = JSON.stringify(getRuns()[0]);
      openRunEditor(901); set('re_dist', '8.5'); saveRunEdit(901); r.leg.d2 = JSON.stringify(getRuns()[0]);
      openRunEditor(901); set('re_time', '1h05'); saveRunEdit(901); r.leg.t2 = getRuns()[0].time;
      // race / Z2 preserved
      lsSet('kt_runs', [{ id: 902, date: '2026-09-01', distance: 10, time: '45:00', type: 'race' }, { id: 903, date: '2026-09-02', distance: 6, time: '36:00', type: 'Z2' }]);
      openRunEditor(902); r.race = document.getElementById('re_type').value; saveRunEdit(902);
      openRunEditor(903); r.z2 = [document.getElementById('re_type').value, document.getElementById('re_type').selectedOptions[0].textContent]; saveRunEdit(903);
      r.types = getRuns().map(x => x.type).join();
      // validation
      lsSet('kt_runs', [{ id: 904, date: '2026-09-10', distance: 5, time: '25:00', hr: 150, type: 'easy', note: '' }]);
      const plus2 = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return _ymdLocal(d); })();
      const cases = [['re_dist', '0', /distance/i, 're_dist'], ['re_dist', '-2', /distance/i, 're_dist'], ['re_dist', '', /distance/i, 're_dist'], ['re_dist', '999', /check the distance/, 're_dist'],
        ['re_time', 'abc', /28:30/, 're_time'], ['re_time', '', /Enter a time/, 're_time'], ['re_time', '0:30', /sprinter/, 're_time'], ['re_hr', '400', /Heart rate/, 're_hr'], ['re_date', plus2, /today or an earlier date/, 're_date']];
      const snap = localStorage.getItem('kt_runs');
      r.val = cases.map(([f, v, re, focus]) => {
        openRunEditor(904); set(f, v); saveRunEdit(904);
        const ok = !!document.getElementById('runEditOverlay') && re.test(document.getElementById('re_err').textContent) && document.activeElement.id === focus && localStorage.getItem('kt_runs') === snap
          && document.getElementById(focus).getAttribute('aria-invalid') === 'true';
        closeRunEditor();
        return ok ? 'ok' : f + '=' + v + ' -> ' + document.activeElement.id;
      });
      // untouched out-of-range legacy values do not block
      lsSet('kt_runs', [{ id: 905, date: '2026-09-10', distance: 50, time: '25:00', hr: 25, type: 'easy' }]);
      openRunEditor(905); _reSetFeel(5); saveRunEdit(905); r.glitch = [getRuns()[0].feel, !document.getElementById('runEditOverlay')];
      return r;
    });
    assert(out.hist.has && out.hist.n === 6 && out.hist.order && out.hist.roles && out.hist.all === 8 && out.hist.noColor, 'history');
    assert(out.sheet.open && out.sheet.focused === 'reTitle' && out.sheet.labels && out.sheet.escClosed && out.sheet.noColor, 'sheet');
    assert(out.noop.same && out.noop.closed && !out.noop.undo, 'noop');
    assert(out.best.tc && out.best.pace && out.best.card === null && out.best.undoBtn && out.best.restored, 'best');
    assert(out.mi.v === '3.11' && /\/MI/.test(out.mi.pace) && out.mi.untouched === 5 && out.mi.feelOnly[0] === 5 && out.mi.sameNumber === 5 && Math.abs(out.mi.typed - 9.978) < 0.01, 'mi');
    assert(out.val.every(x => x === 'ok'), 'validation ' + out.val.join());
    assert(app.errors.length === 0, 'errors ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('B: storage full, undo, delete, strip', async () => {
  const app = await up({ seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const set = (id, v) => { document.getElementById(id).value = v; };
      lsSet('kt_runs', [{ id: 777, date: todayISO(), distance: 5, time: '25:00', type: 'easy', hr: 0, note: '', week: currentWeek }]);
      localStorage.setItem('kt_log_tabs', JSON.stringify(['run', 'body'])); _lsCache = {};
      localStorage.setItem('kt_unit_d', 'mi');
      runLogConfirmed = { id: 777, km: 5, time: '25:00' };
      logSubTab = 'run'; switchTab('log'); logSubTab = 'run'; runLogConfirmed = { id: 777, km: 5, time: '25:00' }; render();
      const strip = document.querySelector('#screen .kt-rconfirm');
      r.strip = strip ? strip.textContent : null;
      r.stripBtns = strip ? Array.from(strip.querySelectorAll('button')).map(b => b.textContent) : [];
      localStorage.setItem('kt_unit_d', 'km');
      const realSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) { if (k === 'kt_runs') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return realSet(k, v); };
      openRunEditor(777); set('re_dist', '6');
      saveRunEdit(777);
      r.full = { open: !!document.getElementById('runEditOverlay'), typed: document.getElementById('re_dist').value, stored: getRuns()[0].distance,
        err: document.getElementById('re_err').textContent, toast: document.getElementById('toast').textContent, undo: !!document.querySelector('#toast .kt-toast-undo') };
      localStorage.setItem = realSet;
      saveRunEdit(777);
      r.full.second = [getRuns()[0].distance, !document.getElementById('runEditOverlay'), runLogConfirmed && runLogConfirmed.km];
      // undo after the run was removed by the strip's UNDO
      openRunEditor(777); set('re_hr', '150'); saveRunEdit(777);
      undoLastRun();
      _toastUndo();
      r.noResurrect = getRuns().length;
      // delete from the sheet
      lsSet('kt_runs', [{ id: 778, date: todayISO(), distance: 5, time: '25:00', type: 'easy' }]);
      runLogConfirmed = { id: 778, km: 5, time: '25:00' }; render();
      openRunEditor(778); _runEditDelete(778);
      r.del = { gone: getRuns().length === 0, conf: runLogConfirmed, strip: !!document.querySelector('#screen .kt-rconfirm'), closed: !document.getElementById('runEditOverlay') };
      _toastUndo(); _toastUndo();
      r.del.back = getRuns().length;
      return r;
    });
    assert(out.full.open && out.full.typed === '6' && out.full.stored === 5 && /storage/i.test(out.full.err) && /storage/i.test(out.full.toast) && !out.full.undo, 'full');
    assert(out.full.second[0] === 6 && out.full.second[1] && out.full.second[2] === 6, 'second');
    assert(out.noResurrect === 0, 'no resurrect');
    assert(out.del.gone && out.del.conf === null && out.del.closed && out.del.back === 1, 'delete');
    assert(app.errors.length === 0, 'errors ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('C: Apple Health identity', async () => {
  const D = '2026-09-20', D2 = '2026-09-18';
  const app = await up({ seed: {
    kt_runs: JSON.stringify([
      { id: 501, date: D, distance: 4.6, time: '27:36', week: 1, note: 'From Apple Health', hr: 150, type: 'easy' },
      { id: 502, date: D2, distance: 3, time: '20:00', week: 1, note: 'From Apple Health', hr: 140, type: 'easy' },
      { id: 503, date: '2026-09-15', distance: 8, time: '40:00', week: 1, note: 'Tempo', hr: 160, type: 'tempo' }]),
    kt_hk_imported: JSON.stringify(['hk-501', 'hk-502']) } });
  try {
    const out = await app.page.evaluate(async ([D, D2]) => {
      const r = {};
      const set = (id, v) => { document.getElementById(id).value = v; };
      window.Capacitor = { Plugins: { TrovoHealth: {
        isAvailable: () => Promise.resolve({ available: true }), requestAuth: () => Promise.resolve({}),
        fetchRuns: () => Promise.resolve({ runs: [
          { uuid: 'hk-501', type: 'run', startDate: D + 'T07:00:00', distanceKm: 4.6, durationSec: 1656, avgHr: 150 },
          { uuid: 'hk-502', type: 'run', startDate: D2 + 'T07:00:00', distanceKm: 3, durationSec: 1200, avgHr: 140 }] }) } } };
      openRunEditor(501);
      r.src = !!document.querySelector('#runEditOverlay .kt-re-src'); r.note = document.getElementById('re_note').value;
      set('re_dist', '5'); saveRunEdit(501);
      r.edited = getRuns().find(x => x.id === 501);
      r.ledger = lsGet('kt_hk_imported').join();
      r.dupeWithLedger = _manualRunDupe(D, 4.6, 1656);
      importFromHealth(); await new Promise(res => setTimeout(res, 300));
      r.afterSync = [getRuns().length, getRuns().find(x => x.id === 501).distance];
      resetHealthImport();
      document.querySelector('.kt-close-sheet button[id$="ok"]').click();
      r.afterReset = getRuns().map(x => x.id).join();
      importFromHealth(); await new Promise(res => setTimeout(res, 300));
      r.afterImport = { n: getRuns().length, fives: getRuns().filter(x => x.date === D).length, d2: getRuns().filter(x => x.date === D2).length, ledger: (lsGet('kt_hk_imported') || []).slice().sort().join() };
      openRunEditor(501); set('re_note', 'hilly'); saveRunEdit(501);
      r.health = _isHealthRun(getRuns().find(x => x.id === 501));
      const cloud = JSON.parse(_sanitizeForICloud(JSON.stringify(buildBackupJSON())));
      r.cloud = { hr501: cloud.kt_runs.find(x => x.id === 501).hr, hr503: cloud.kt_runs.find(x => x.id === 503).hr, hk: !!cloud.kt_runs.find(x => x.id === 501).hkOrig };
      switchTab('progress'); setProgressTab('runs');
      r.row = document.getElementById('rh-501').textContent;
      // moveRun stamps
      const newest502 = getRuns().find(x => x.date === D2);
      moveRun(newest502.id, '2026-09-17');
      r.moved = getRuns().find(x => x.id === newest502.id).hkOrig;
      return r;
    }, [D, D2]);
    assert(out.src && out.note === '' && out.edited.distance === 5 && out.edited.note === 'From Apple Health' && out.edited.hr === 150 && out.edited.hkOrig.km === 4.6 && out.edited.hkOrig.time === '27:36', 'edit');
    assert(out.dupeWithLedger === false, 'ledger gate');
    assert(out.afterSync[0] === 3 && out.afterSync[1] === 5, 'sync');
    assert(out.afterReset === '501,503', 'reset keeps edited: ' + out.afterReset);
    assert(out.afterImport.n === 3 && out.afterImport.fives === 1 && out.afterImport.d2 === 1 && out.afterImport.ledger === 'hk-501,hk-502', 'no twin');
    assert(out.health && out.cloud.hr501 === undefined && out.cloud.hr503 === 160 && /HEALTH/.test(out.row), 'identity');
    assert(out.moved && out.moved.date === D2, 'moveRun stamps');
    assert(app.errors.length === 0, 'errors ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('D: Undo by a real click restores the run exactly', async () => {
  const app = await boot();
  try {
    await app.page.evaluate(() => {
      switchTab('progress'); setProgressTab('runs');
      const five = getRuns().slice().sort(_cmpByDateDesc).find(x => x.distance === 5);
      window.__pre = JSON.stringify(five); window.__id = five.id;
      openRunEditor(five.id); document.getElementById('re_time').value = '24:00'; saveRunEdit(five.id);
    });
    const changed = await app.page.evaluate(() => getRuns().find(x => x.id === window.__id).time);
    await app.page.waitForTimeout(400);
    await app.page.click('#toast .kt-toast-undo', { timeout: 2000 });
    const back = await app.page.evaluate(() => JSON.stringify(getRuns().find(x => x.id === window.__id)) === window.__pre);
    assert(changed === '24:00' && back, 'a real tap on Undo restores the pre-edit record: ' + JSON.stringify([changed, back]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
