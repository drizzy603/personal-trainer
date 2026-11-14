// 133: Progress › Weekly volume draws a week with no lifts as a dashed line on the baseline, as wide as the other
// weeks and with no fill, in both rooms (web 20261114-6). The page's empty-state rule (.empty: padding 52px 20px)
// matched the chart's .bar.empty too, so an empty week was a box 104 px tall and 40 px wider than the others; in
// Heavyweight the room's fill outranked the bar's background:none, so it was a solid lime block taller than any real
// week (found on the owner's phone, 12 Nov). The seed's sessions are older than the chart's 8 weeks, so the seed's
// newest session is copied onto the Tuesday of six of them, leaving a past week with no lifts (two Mondays back) and
// an empty current week; each is read in Heavyweight and in Lime. Sizes are read from the layout box
// (offsetWidth/offsetHeight), which the bars' grow-in animation (a transform) does not change.
const { boot, assert, run } = require('../lib/harness');

run('a week with no lifts is a dashed line on the baseline, as wide as the other weeks, with no fill, in both rooms', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const mon = getMondayISO();
      const all = lsGet('kt_sessions') || [];
      const src = all.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).pop();
      const res = { srcVol: src ? calcVolume(src.exercises || []) : 0, rooms: {} };
      const copies = [7, 6, 5, 4, 3, 1].map((k) => Object.assign(JSON.parse(JSON.stringify(src)), { id: 's133-' + k, date: addDays(mon, -7 * k + 1) }));
      lsSet('kt_sessions', all.concat(copies));
      for (const room of ['heavyweight', 'dark']) {
        applyTheme(room);
        switchTab('progress');
        render();
        const charts = [...document.querySelectorAll('#screen .kt-bars')];
        const chart = charts.find((c) => c.querySelectorAll('.bar').length === 8);
        if (!chart) { res.rooms[room] = { chart: false, charts: charts.length }; continue; }
        const bars = [...chart.querySelectorAll('.bar')].map((b) => {
          const cs = getComputedStyle(b);
          return { empty: b.classList.contains('empty'), cur: b.classList.contains('cur'), w: b.offsetWidth, h: b.offsetHeight,
            foot: b.offsetTop + b.offsetHeight, pad: cs.paddingTop + ' ' + cs.paddingLeft, bg: cs.backgroundColor, top: cs.borderTopStyle };
        });
        res.rooms[room] = { chart: true, bars };
      }
      return res;
    });
    assert(out.srcVol > 0, 'the seed\'s newest session has volume to copy: ' + out.srcVol);
    const bad = [], hold = (c, m) => { if (!c) bad.push(m); };
    for (const room of ['heavyweight', 'dark']) {
      const r = out.rooms[room];
      if (!r.chart) { bad.push(room + ': no 8-week chart on Progress (' + r.charts + ' bar charts)'); continue; }
      const full = r.bars.filter((b) => !b.empty), empty = r.bars.filter((b) => b.empty);
      const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
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
        hold(b.top === 'dashed', which + 'a dashed line (' + b.top + ')');
      }
      for (const b of full) hold(b.bg !== 'rgba(0, 0, 0, 0)' && b.h > 1, room + ': a week with lifts keeps its fill and height (' + b.bg + ', ' + b.h + ' px)');
    }
    assert(bad.length === 0, bad.length + ' check(s) failed: ' + bad.join(' || '));
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
