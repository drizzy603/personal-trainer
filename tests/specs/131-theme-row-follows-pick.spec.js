// 131: a look picked in Settings › About › Theme shows at once (web 20261114-2).
// applyTheme() let _paintTheme() render before it saved kt_theme and set currentTheme, so the pick's own render drew
// Settings' Theme row (its line "Lime · two looks" and its pill, which are the row's VoiceOver name too) and the open
// sheet's tick and filled card from the look just left: after a tap on Lime the room, currentTheme and kt_theme were
// Lime while the row and the tick still said Heavyweight, until some later render reached them (web 20260909-1 to
// 20261113-5, on every shell). The pick is on record before the paint now.
// - The sheet's own swatch is clicked and everything is read inside the click's task, so no render but the pick's own
//   can have put the row or the tick right; a pick is still one render.
// - A name that is no look changes nothing and paints nothing. A pick that cannot be saved (a full store) changes
//   nothing either: the look, the row, the tick and the store stay together, and the error surfaces as it did (the old
//   order painted the look first and then threw).
const { boot, assert, run } = require('../lib/harness');

run('a look picked in the Theme sheet: Settings\' Theme row, its pill and the sheet\'s tick name it in the pick\'s own paint; one render a pick; no such look or a failed save changes nothing', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      let renders = 0;
      const r0 = window.render; window.render = function () { renders++; return r0.apply(this, arguments); };
      // What the owner reads (the Theme row's line and pill, the sheet's tick and filled card) beside what the page holds.
      const look = () => {
        const row = document.querySelector('#screen .settings-row[onclick="openThemeSheet()"]');
        const cards = [...document.querySelectorAll('#themeSheetList button')];
        return {
          room: document.documentElement.getAttribute('data-room'), cur: currentTheme, stored: localStorage.getItem('kt_theme'),
          sub: row.querySelector('.settings-row-sub').textContent, pill: row.lastElementChild.textContent,
          ticked: cards.filter((b) => b.textContent.indexOf('✓') >= 0).map((b) => b.getAttribute('onclick')),
          filled: cards.filter((b) => b.style.background.indexOf('accent-soft') >= 0).map((b) => b.getAttribute('onclick')),
        };
      };
      // A tap on the sheet's swatch, read before the task ends: no render but the pick's own.
      const pick = (id) => { const n = renders; document.querySelector('#themeSheetList button[onclick="applyTheme(\'' + id + '\')"]').click(); return Object.assign(look(), { renders: renders - n }); };
      switchTab('settings'); openThemeSheet();
      const r = { open: look(), cards: document.querySelectorAll('#themeSheetList button').length };
      r.lime = pick('dark');
      r.heavy = pick('heavyweight');
      let n = renders; applyTheme('midnight'); applyTheme('');   // no such look
      r.unknown = Object.assign(look(), { renders: renders - n });
      // a store that takes no write: the pick is not saved, so nothing is held or painted
      n = renders;
      const realSet = Storage.prototype.setItem;
      let threw = false;
      Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
      try { applyTheme('dark'); } catch (e) { threw = true; } finally { Storage.prototype.setItem = realSet; }
      r.full = Object.assign(look(), { renders: renders - n, threw });
      window.render = r0;
      return r;
    });
    const J = JSON.stringify, tick = (id) => J(["applyTheme('" + id + "')"]);
    const same = (a, b) => J(Object.assign({}, a, { renders: 0, threw: 0 })) === J(Object.assign({}, b, { renders: 0, threw: 0 }));
    // One snapshot, every check: a failure names each thing that did not follow the pick, not only the first.
    const bad = [];
    let held = 0;
    const hold = (cond, msg) => { held++; if (!cond) bad.push(msg); };
    hold(out.cards === 2 && out.open.room === 'heavyweight' && out.open.sub === 'Heavyweight · two looks' && out.open.pill === 'Heavyweight'
      && J(out.open.ticked) === tick('heavyweight') && J(out.open.filled) === tick('heavyweight'), 'the sheet opens on the look in use: ' + J(out.open));
    hold(out.lime.room === 'dark' && out.lime.cur === 'dark' && out.lime.stored === 'dark', 'Lime is painted, held and saved: ' + J(out.lime));
    hold(out.lime.sub === 'Lime · two looks' && out.lime.pill === 'Lime', 'the Theme row\'s line and pill name Lime in the pick\'s own paint: ' + J([out.lime.sub, out.lime.pill]));
    hold(J(out.lime.ticked) === tick('dark') && J(out.lime.filled) === tick('dark'), 'the sheet\'s one tick and its filled card are Lime\'s: ' + J([out.lime.ticked, out.lime.filled]));
    hold(out.lime.renders === 1, 'one render for the pick: ' + out.lime.renders);
    hold(out.heavy.room === 'heavyweight' && out.heavy.cur === 'heavyweight' && out.heavy.stored === 'heavyweight', 'Heavyweight is painted, held and saved on the way back: ' + J(out.heavy));
    hold(out.heavy.sub === 'Heavyweight · two looks' && out.heavy.pill === 'Heavyweight' && J(out.heavy.ticked) === tick('heavyweight') && J(out.heavy.filled) === tick('heavyweight'),
      'the row, the pill, the tick and the filled card name Heavyweight on the way back: ' + J([out.heavy.sub, out.heavy.pill, out.heavy.ticked, out.heavy.filled]));
    hold(out.heavy.renders === 1, 'one render for the pick back: ' + out.heavy.renders);
    hold(out.unknown.renders === 0 && same(out.unknown, out.heavy), 'a name that is no look changes nothing and paints nothing: ' + J(out.unknown));
    hold(out.full.threw === true && out.full.renders === 0 && same(out.full, out.heavy), 'a pick that cannot be saved changes nothing (the look, the row and the tick stay with the store) and its error surfaces: ' + J(out.full));
    assert(bad.length === 0, bad.length + ' of ' + held + ' checks failed: ' + bad.join(' || '));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
