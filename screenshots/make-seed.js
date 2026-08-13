// Build screenshots/out/store-seed.json — the localStorage dump shoot.py
// injects into the simulator before capturing App Store screenshots.
//
// Runs seed-demo.js inside the Playwright harness (so the dump matches what
// the app would actually write), then applies the store-shot fixups learned
// on the 2026-08-10 reshoot:
//   - today becomes a Pull day so the hero shot reads "Today is pull day."
//   - the week stays Run-primary so the Run tab shows the editorial segment
//   - kt_bw is stored newest-first (seed-demo writes oldest-first, which
//     reverses the chart axis and hands the hero the oldest weigh-in)
//   - a name, a fake API key (chat view renders), and a structured coach
//     conversation showing the message blocks
//
// Usage (repo root):  node screenshots/make-seed.js
const fs = require('fs');
const path = require('path');
const { boot } = require('../tests/lib/harness');

(async () => {
  const app = await boot({ seed: {} });
  try {
    const seedJs = fs.readFileSync(path.join(__dirname, 'seed-demo.js'), 'utf8');
    const dump = await app.page.evaluate((code) => {
      localStorage.clear();
      eval(code);
      // Today must be a lift day for the hero; keep Runs scheduled so the
      // Run tab stays on the editorial segment (Run-primary, no sports).
      const r = JSON.parse(localStorage.getItem('kt_routine'));
      r.weekPlan = ['Pull', 'Run', 'Push', 'Pull', 'Rest', 'Run', 'Legs'];
      r.weekPlan[(new Date().getDay() + 6) % 7] = 'Pull';
      localStorage.setItem('kt_routine', JSON.stringify(r));
      // App convention: newest weigh-in first.
      const bw = JSON.parse(localStorage.getItem('kt_bw'));
      bw.sort((a, b) => (a.date < b.date ? 1 : -1));
      localStorage.setItem('kt_bw', JSON.stringify(bw));
      localStorage.setItem('kt_user_name', 'Roberto');
      localStorage.setItem('kt_apikey', 'sk-ant-demo-screenshots-only');
      localStorage.setItem('kt_coach_msgs', JSON.stringify([
        { role: 'user', content: 'How was yesterday’s easy run?' },
        { role: 'assistant', content: [
          '%%type: Run analysis',
          'Good session. You ran it faster than the plan wanted, but your heart rate says it stayed easy.',
          '%%metric: PACE | 9:06 /km | vs 9:30 goal | -24s | good',
          '%%metric: AVG HR | 145 | vs cap 150 | -5 | good',
          '%%metric: DISTANCE | 5.0 km | | on plan | plain',
          '%%takeaway: Your aerobic base is improving — same pace, lower heart rate than three weeks ago.',
          '%%action: Set goal pace 9:00 | Set my run goal pace to 9:00/km',
          '%%action: Plan a tempo run | Add a tempo run to this week',
        ].join('\n') },
      ]));
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
      return out;
    }, seedJs);
    const outDir = path.join(__dirname, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const dest = path.join(outDir, 'store-seed.json');
    fs.writeFileSync(dest, JSON.stringify(dump));
    console.log('wrote', dest, '·', Object.keys(dump).length, 'keys');
  } finally { await app.close(); }
})();
