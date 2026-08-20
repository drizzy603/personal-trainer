// Coach capability & cost: log_session records off-app lift work with PRs
// and the weight cache, previews strip %%-markers, tool schemas carry the
// prompt-cache breakpoint, and images downscale to the API's useful ceiling.
const { boot, assert, run } = require('../lib/harness');

run('log_session tool records a lift session end to end', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = executeCoachTool('log_session', {
        type: 'Push', date: '2026-08-15',
        exercises: [
          { name: 'Barbell Bench Press', sets: 3, reps: [8, 8, 6], weight: 185, rpe: 8, isMain: true },
          { name: 'Push Up', sets: 2, reps: 15, weight: 0 },
        ],
        note: 'Hotel gym',
      });
      const s = getSessions()[0];
      const bad = executeCoachTool('log_session', { type: 'Cardio', exercises: [{ name: 'X', sets: 1, reps: 5 }] });
      return {
        ok: r.ok, msg: r.message,
        type: s.type, date: s.date, week: s.week,
        benchReps: s.exercises[0].reps, pushReps: s.exercises[1].reps,
        pr: (s.prs || []).indexOf('Barbell Bench Press') !== -1,
        cachedW: getWeights()['Barbell Bench Press'],
        badRejected: bad.ok === false,
        labeled: toolCallLabel({ name: 'log_session', input: { type: 'Push', date: '2026-08-15' } }),
      };
    });
    assert(out.ok && out.type === 'Push' && out.date === '2026-08-15', 'session lands with type + date');
    assert(String(out.benchReps) === '8,8,6', 'rep arrays persist per set, got ' + out.benchReps);
    assert(String(out.pushReps) === '15,15', 'integer reps expand across sets, got ' + out.pushReps);
    assert(out.pr && out.cachedW === 185, 'PRs and weight cache update, got ' + out.cachedW);
    assert(out.badRejected, 'invalid session type is rejected');
    assert(out.labeled.indexOf('Push logged') === 0, 'pill label reads, got ' + out.labeled);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('previews strip markers, tools carry cache breakpoint, images downscale', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      // Coach-home preview must not leak the %%-grammar.
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');
      coachMessages = [{ role: 'assistant', content: '%%type: Run analysis\nGood session overall.\n%%takeaway: Base is building.' }];
      switchTab('coach'); coachView = 'home'; render();
      const home = document.getElementById('screen').textContent;
      const previewClean = home.indexOf('%%type') === -1 && home.indexOf('Good session overall.') !== -1;
      // Cache breakpoint rides the last tool schema only.
      const tools = _cachedCoachTools();
      const lastCached = !!tools[tools.length - 1].cache_control;
      const othersClean = tools.slice(0, -1).every(t => !t.cache_control);
      const originalClean = !COACH_TOOLS[COACH_TOOLS.length - 1].cache_control;
      // 4000x3000 synthetic image downscales to <=1568 long edge, JPEG.
      const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#c8ff00'; ctx.fillRect(0, 0, 4000, 3000);
      const big = c.toDataURL('image/png');
      const scaled = await new Promise(res => _downscaleImage(big, (url, mt) => res({ url, mt })));
      const img = new Image();
      await new Promise(res => { img.onload = res; img.src = scaled.url; });
      return { previewClean, lastCached, othersClean, originalClean,
        mt: scaled.mt, w: img.naturalWidth, h: img.naturalHeight,
        smaller: scaled.url.length < big.length };
    });
    assert(out.previewClean, 'conversation preview strips %%-marker lines');
    assert(out.lastCached && out.othersClean && out.originalClean, 'cache_control on last tool copy only, source untouched');
    assert(out.w === 1568 && out.h === 1176 && out.mt === 'image/jpeg', 'downscaled to 1568-long-edge JPEG, got ' + out.w + 'x' + out.h);
    assert(out.smaller, 'downscale actually shrinks the payload');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
