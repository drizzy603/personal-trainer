// kg + mi users see their own units everywhere the 2026-09-24 hunt (and the sweep after it)
// found raw lb or km: the Sunday recap and week wrap, all three posters (whose numbers were lb
// under a KG label), the exercise library, run surfaces, the Health ride card, sport fields
// (typed in the user's unit, stored in km), cycling totals, the Body headline and volume chart.
const { boot, assert, run } = require('../lib/harness');

run('kg + mi: totals, posters, library, runs and sport fields follow the unit setting', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg', kt_unit_d: 'mi' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const txt = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; };
      const LEAK = /(^|[^a-z])(lbs?|km|km\/h)(?![a-z])/i;
      const today = todayISO();
      // Today 3 x 8 at 100 lb = 2,400 lb = 1,089 kg (rounded); ten days ago 90 lb.
      lsSet('kt_sessions', [
        { id: Date.now(), date: today, type: 'Push', label: _dayLabel('Push'), week: currentWeek, prs: [],
          exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, weightLog: [100, 100, 100] }] },
        { id: Date.now() - 864e6, date: addDays(today, -10), type: 'Push', label: _dayLabel('Push'), week: currentWeek, prs: [],
          exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: [8, 8, 8], weight: 90, weightLog: [90, 90, 90] }] },
      ]);
      lsSet('kt_prs', { 'Barbell Bench Press': 100 });
      lsSet('kt_runs', [{ id: Date.now(), date: today, distance: 8, time: '40:00', week: currentWeek, type: 'easy' }]);
      r.volKg = Math.round(wDisp(2400)).toLocaleString();

      // ── Sunday: recap pills, body-weight line, the Today week wrap ──
      const realGetDay = Date.prototype.getDay;
      Date.prototype.getDay = function () { return 0; };
      try {
        lsSet('kt_bw', [{ date: today, weight: 184.4 }, { date: today, weight: 180 }]);
        r.recap = txt(renderWeekRecap(getSessions(), getRuns()));
        lsSet('kt_bw', [{ date: today, weight: 180.1 }, { date: today, weight: 180 }]);   // 0.1 lb is 0 kg: no line
        r.recapTiny = txt(renderWeekRecap(getSessions(), getRuns()));
        lsDel('kt_last_weekwrap');
        switchTab('log'); switchLogSub('workout');
        promoteTodayItem('weekwrap'); await wait(80);
        const lbl = [...document.querySelectorAll('.kt-statband-lbl')].find(e => /^Volume/.test(e.textContent));
        r.wrap = lbl ? { lbl: lbl.textContent, val: lbl.previousElementSibling.textContent } : null;
      } finally { Date.prototype.getDay = realGetDay; }

      // ── posters: capture every string drawn ──
      const drawn = [];
      const rf = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { drawn.push(String(t)); return rf.apply(this, arguments); };
      const grab = fn => { drawn.length = 0; try { fn(); } catch (e) { drawn.push('ERR ' + e); } return drawn.slice(); };
      const pv = lb => ({ kg: Math.round(wDisp(lb)).toLocaleString(), lb: Number(lb).toLocaleString() });
      const wst = _weekStats(); r.weekVol = pv(wst.volume);
      r.week = grab(() => _drawWeekCard(wst, '#d8ff63'));
      const mk = today.slice(0, 7), mst = _monthStats(mk); r.monthVol = pv(mst.volume);
      r.month = grab(() => _drawWrapCard(mk, mst, '#d8ff63'));
      r.share = grab(() => _drawShareCard(getSessions()[0], '#d8ff63', '#000', '#fff', '#888', '#999', '#222', '#fd0'));
      CanvasRenderingContext2D.prototype.fillText = rf;

      // ── exercise library ──
      openExLib('Barbell Bench Press'); await wait(80);
      const lib = document.getElementById('exlibOverlay');
      r.lib = lib ? lib.innerText : '';
      closeExLib();

      // ── runs: milestone, saved strip, today's logged run, Health ride card, pace lines ──
      r.milestone = MILESTONE_DEFS.find(d => d.k === 'km').label(10);
      runLogConfirmed = { km: 8, time: '40:00', id: 1 };
      r.saved = txt(renderRunSavedStrip()); runLogConfirmed = null;
      runLogOpen = false;
      r.runTab = txt(renderRunSegment());   // the demo programme pins Bike, not Run: render the segment directly
      _hkPendingRun = { type: 'ride', distanceKm: 32, durationSec: 3600, startDate: new Date().toISOString(), avgHr: 140 };
      r.ride = txt(renderHealthQuickLog(false)); _hkPendingRun = null;

      // ── sport fields: typed in miles and mph, stored in km ──
      logSportType = 'Cycling';
      sportLogDraft = { duration: '60', notes: '', date: today, f: { distance: '10', avgSpeed: '15' } };
      saveSportEditorial();
      const rec = getSportLogs().find(l => l.type === 'Cycling');
      r.sportStored = rec && rec.data;
      r.sportSummary = rec && buildSportSummary(rec);
      openSportLogEditor(rec.id); await wait(50);
      const dEl = document.getElementById('sle_distance');
      r.editorVal = dEl && dEl.value;
      r.editorLbl = dEl && dEl.parentElement.querySelector('label').textContent;
      saveSportLogEdit(rec.id);
      r.afterEdit = getSportLogs().find(l => l.id === rec.id).data.distance;
      r.cycling = txt(renderSportProgress());

      // ── Body headline, Progress volume chart ──
      lsSet('kt_bw', [{ date: today, weight: 180 }]);
      switchTab('log'); switchLogSub('body'); await wait(80);
      const hl = document.querySelector('.kt-hero-headline');
      r.body = hl ? hl.textContent : '';
      switchTab('progress'); await wait(80);
      r.progress = document.getElementById('screen').innerText;
      return r;
    });
    const L = /(^|[^a-z])(lbs?|km|km\/h)(?![a-z])/i;
    assert(/1,089\s*kg volume/i.test(out.recap) && /5\s*mi run/i.test(out.recap) && /up 2 kg/.test(out.recap) && !L.test(out.recap),
      'the Sunday recap is in kg and mi: ' + out.recap);
    assert(!/Body weight/.test(out.recapTiny), 'a change that rounds to 0 kg writes no body-weight line: ' + out.recapTiny);
    assert(out.wrap && out.wrap.lbl === 'Volume kg' && /^1\.1k$/.test(out.wrap.val), 'the Today week wrap: ' + JSON.stringify(out.wrap));
    assert(out.week.includes(out.weekVol.kg) && out.week.includes('KG VOLUME') && !out.week.includes(out.weekVol.lb), 'the week poster: ' + JSON.stringify([out.weekVol, out.week]));
    assert(out.month.includes(out.monthVol.kg) && out.month.includes('VOLUME KG') && !out.month.includes(out.monthVol.lb), 'the monthly poster (the lb total was labelled KG): ' + JSON.stringify([out.monthVol, out.month]));
    assert(out.share.includes(out.volKg) && out.share.includes('KG VOLUME') && !out.share.includes('2,400'), 'the session poster: ' + JSON.stringify(out.share));
    assert(!out.week.concat(out.month, out.share).some(t => L.test(t)), 'no poster draws lb or km');
    assert(/45\.5 KG/.test(out.lib) && /\+4\.5 KG · 2 SESSIONS/.test(out.lib) && /PR · 45\.5 kg/.test(out.lib) && !L.test(out.lib),
      'the exercise library row, hero, chip and PR are in kg: ' + out.lib.replace(/\s+/g, ' ').slice(0, 400));
    assert(out.milestone === '6.21 mi run all-time', 'the distance milestone: ' + out.milestone);
    assert(/Run saved · 4\.97 mi in 40:00/.test(out.saved), 'the saved-run strip: ' + out.saved);
    assert(/Run logged · 4\.97 mi in 40:00/.test(out.runTab), 'today\'s logged run: ' + out.runTab.replace(/\s+/g, ' ').slice(0, 300));
    assert(/19\.9 mph/.test(out.ride) && !L.test(out.ride), 'the Health ride card speed: ' + out.ride);
    assert(out.sportStored && out.sportStored.distance === 16.09 && out.sportStored.avgSpeed === 24.14, 'sport fields are typed in mi/mph and stored in km: ' + JSON.stringify(out.sportStored));
    assert(out.sportSummary === '10 mi · 15 mph', 'the sport summary reads back what was typed: ' + out.sportSummary);
    assert(out.editorVal === '10' && /\(mi\)/.test(out.editorLbl) && out.afterEdit === 16.09, 'the log editor shows and keeps miles: ' + JSON.stringify([out.editorVal, out.editorLbl, out.afterEdit]));
    assert(/10\s*mi/.test(out.cycling) && !/16/.test(out.cycling.replace(/\d{4}-\d\d-\d\d/g, '')), 'cycling totals are in miles: ' + out.cycling.replace(/\s+/g, ' '));
    assert(/^81\.5 kg,/.test(out.body), 'the Body headline: ' + out.body);
    assert(/total kg per session/.test(out.progress) && !/total lb/.test(out.progress), 'the volume chart label');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
