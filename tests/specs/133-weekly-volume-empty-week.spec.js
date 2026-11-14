// 133: Progress › Weekly volume draws a week with no lifts as a dashed line on the baseline, as wide as the other
// weeks, with no fill and nothing on it, in both rooms, while the weeks with lifts keep their room's fill and the
// current week its accent and value (web 20261114-7). The page's empty-state rule (.empty: padding 52px 20px)
// matched the chart's .bar.empty too, so an empty week was a box 105 px tall (52 px of padding top and bottom, and
// its line) and 40 px wider than the others; in Heavyweight the room's fills outranked the bar's background:none, so
// it was a solid block taller than any real week, lime for a past week and blue for the current one (found on the
// owner's phone, 12 Nov); in Lime its line sat above the top of the chart. The seed's sessions are older than the
// chart's 8 weeks, so the seed's newest session is copied onto the Tuesday of six of them, leaving a past week (two
// Mondays back) and the current week empty, read in Heavyweight and in Lime; then a copy on this week's Monday (today
// or before it, never ahead) gives the current week lifts. Sizes are read from the layout box (offsetWidth and
// offsetHeight) after an explicit render(), so the bars' grow-in animation (a transform) is off; each room's colours
// are resolved on a probe element no .kt-bars rule reaches.
const { boot, assert, run } = require('../lib/harness');

run('a week with no lifts is a dashed line on the baseline, as wide as the other weeks, with no fill and nothing on it, in both rooms; weeks with lifts keep the room\'s fill and the current week its accent', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const mon = getMondayISO();
      const all = lsGet('kt_sessions') || [];
      const src = all.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).pop();
      const res = { srcVol: src ? calcVolume(src.exercises || []) : 0, rooms: {}, cur: {} };
      const copy = (k, d) => Object.assign(JSON.parse(JSON.stringify(src)), { id: 's133-' + k, date: d });
      const copies = [7, 6, 5, 4, 3, 1].map((k) => copy(k, addDays(mon, -7 * k + 1)));
      const resolve = (css) => { const p = document.createElement('div'); p.style.background = css; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; };
      const chartOf = () => [...document.querySelectorAll('#screen .kt-bars')].find((c) => c.querySelectorAll('.bar').length === 8);
      const read = (chart) => [...chart.querySelectorAll('.bar')].map((b) => {
        const cs = getComputedStyle(b);
        return { empty: b.classList.contains('empty'), cur: b.classList.contains('cur'), w: b.offsetWidth, h: b.offsetHeight,
          foot: b.offsetTop + b.offsetHeight, pad: cs.paddingTop + ' ' + cs.paddingLeft, bg: cs.backgroundColor, top: cs.borderTopStyle,
          topW: cs.borderTopWidth, topC: cs.borderTopColor, vis: cs.visibility, op: cs.opacity, tf: cs.transform, kids: b.children.length, txt: b.textContent };
      });
      const fills = () => ({ earned: resolve('var(--earned)'), accent: resolve('var(--accent)'),
        lime: resolve('color-mix(in srgb,var(--text) 36%,var(--card))'), base: resolve('color-mix(in srgb,var(--text) 13%,transparent)') });
      lsSet('kt_sessions', all.concat(copies));
      for (const room of ['heavyweight', 'dark']) {
        applyTheme(room); switchTab('progress'); render();
        const chart = chartOf();
        res.rooms[room] = chart ? Object.assign({ chart: true, bars: read(chart) }, fills()) : { chart: false, charts: document.querySelectorAll('#screen .kt-bars').length };
      }
      // the current week with lifts: a copy on this week's Monday
      lsSet('kt_sessions', all.concat(copies, [copy(0, mon)]));
      for (const room of ['heavyweight', 'dark']) {
        applyTheme(room); switchTab('progress'); render();
        const chart = chartOf(), cur = chart && chart.querySelector('.bar.cur');
        res.cur[room] = cur ? Object.assign({ empty: cur.classList.contains('empty'), bg: getComputedStyle(cur).backgroundColor, h: cur.offsetHeight,
          val: (cur.querySelector('.val') || {}).textContent || '' }, fills()) : null;
      }
      return res;
    });
    assert(out.srcVol > 0, 'the seed\'s newest session has volume to copy: ' + out.srcVol);
    const bad = [], hold = (c, m) => { if (!c) bad.push(m); };
    const alpha = (c) => { const m = /\/\s*([\d.]+)\s*\)$/.exec(c) || /rgba\([^)]*,\s*([\d.]+)\)$/.exec(c); return m ? +m[1] : 1; };
    const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    for (const room of ['heavyweight', 'dark']) {
      const r = out.rooms[room];
      if (!r.chart) { bad.push(room + ': no 8-week chart on Progress (' + r.charts + ' bar charts)'); continue; }
      const full = r.bars.filter((b) => !b.empty), empty = r.bars.filter((b) => b.empty);
      // the bars are siblings with one offsetParent, so their feet compare: the baseline is where the weeks with lifts stand
      const w = mid(full.map((b) => b.w)), base = mid(full.map((b) => b.foot));
      hold(empty.length >= 2 && empty.some((b) => b.cur) && empty.some((b) => !b.cur), room + ': the past week and the current week are empty: ' + JSON.stringify(r.bars.map((b) => (b.empty ? 'E' : '#') + (b.cur ? '*' : ''))));
      hold(full.length >= 3, room + ': weeks with lifts are drawn too: ' + full.length);
      for (const b of empty) {
        const which = room + ', the ' + (b.cur ? 'current' : 'past') + ' empty week: ';
        hold(b.h <= 1, which + 'a line, not a box (height ' + b.h + ' px, padding ' + b.pad + ')');
        hold(Math.abs(b.w - w) <= 1, which + 'as wide as the other weeks (' + b.w + ' px, the others ' + w + ' px)');
        hold(Math.abs(b.foot - base) <= 1, which + 'on the baseline the other weeks stand on (its foot at ' + b.foot + ', theirs at ' + base + ')');
        hold(b.bg === 'rgba(0, 0, 0, 0)', which + 'no fill (' + b.bg + ')');
        hold(b.top === 'dashed' && b.topW === '1px' && alpha(b.topC) > 0 && b.vis === 'visible' && b.op === '1', which + 'a dashed line that shows (' + b.top + ' ' + b.topW + ' ' + b.topC + ', ' + b.vis + ', opacity ' + b.op + ')');
        hold(b.tf === 'none', which + 'not moved by a transform (' + b.tf + ')');
        hold(b.kids === 0 && b.txt === '', which + 'nothing on it: no value or dot (' + b.kids + ' child(ren), ' + JSON.stringify(b.txt) + ')');
      }
      for (const b of full) {
        hold(b.h > 1, room + ': a week with lifts keeps its height (' + b.h + ' px)');
        const want = room === 'heavyweight' ? r.earned : r.lime;
        hold(b.bg === want, room + ': a week with lifts wears the room\'s fill (' + b.bg + ', the room\'s ' + want + '; the base grey is ' + r.base + ')');
      }
      const c = out.cur[room];
      hold(c && !c.empty && c.h > 1 && c.bg === c.accent && c.val !== '', room + ': the current week with lifts wears the accent and its value (' + JSON.stringify(c && { empty: c.empty, h: c.h, bg: c.bg, accent: c.accent, val: c.val }) + ')');
    }
    assert(bad.length === 0, bad.length + ' check(s) failed: ' + bad.join(' || '));
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
