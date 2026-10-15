#!/usr/bin/env node
// tabs-fixtures.js: the tabs models (TabsModel v1, contract 6.1) for FPCore that the page cannot build.
//
//   node ios/App/FPKit/Tools/tabs-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures
//
// The page builds its own tabs models (_tabsModel, plan task P6), and tests/golden/dump-coach-home.js
// writes them into Fixtures/tabs (heavyweight.json, lime.json). This script writes the three no page
// sends, by hand from what the contract describes (TabsModel.swift):
//   - forward-compat.json: what a newer page could add (unknown fields, a badge, an unknown id, a room);
//   - lone-surrogates.json: an older page that skipped _nativeJSON (it keeps its half emoji);
//   - minimal.json: {v:1}, every default.
// The colours come from the page's THEMES, the titles and labels from its <nav id="tabs">.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [pagePath, outDir] = process.argv.slice(2);
if (!pagePath || !outDir) { console.error('usage: node tabs-fixtures.js <page index.html> <Fixtures dir>'); process.exit(2); }
const html = fs.readFileSync(pagePath, 'utf8');
const scripts = []; const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
const src = scripts.join('\n');
function grabFrom(start) {
  if (start < 0) throw new Error('not found in the page');
  let d = 0;
  for (let k = src.indexOf('{', start); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(start, k + 1); }
  }
  throw new Error('unbalanced');
}
const page = {};
vm.createContext(page);
vm.runInContext([grabFrom(src.indexOf('function _chars(')), grabFrom(src.indexOf('function _wellFormed(')),
  grabFrom(src.indexOf('var THEMES = {')) + ';', 'this.THEMES = THEMES;'].join('\n'), page);

// The web bar's items: data-tab and aria-label of each button in <nav id="tabs">.
const nav = (html.match(/<nav id="tabs">([\s\S]*?)<\/nav>/) || [])[1];
if (!nav) throw new Error('no <nav id="tabs"> in the page');
const items = [];
const bre = /<button\b[^>]*\bdata-tab="([^"]+)"[^>]*\baria-label="([^"]+)"/g;
while ((m = bre.exec(nav)) !== null) items.push({ id: m[1], title: m[2], a11y: m[2] });
if (items.map(i => i.id).join() !== 'log,progress,coach,settings') throw new Error('the web bar is not Log, Progress, Coach, Settings: ' + items.map(i => i.id));

const hw = page.THEMES.heavyweight, lime = page.THEMES.dark;

function forwardCompat() {
  // Lime, as a newer page might send it: new top-level fields, a badge, an item this build does not
  // know, items out of the shell's order, a title missing, and a colour in a space RGBA cannot read.
  return {
    v: 1, rev: 7, boot: 'b1760000800000-7ab5', room: 'dark', paper: false,
    tint: lime.text, idle: 'oklch(62% 0.01 270)', glass: { style: 'clear' }, haptics: true,
    items: [
      { id: 'coach', title: 'Coach', a11y: 'Coach', badge: { count: 2, a11y: '2 new replies' } },
      { id: 'log', title: 'Log', a11y: 'Log', glyph: 'plus.circle' },
      { id: 'runs', title: 'Runs', a11y: 'Runs' },
      { id: 'progress', a11y: 'Progress' },
      { id: 'settings', title: 'Settings', a11y: 'Settings' },
    ],
  };
}

function lonely() {
  // an older page that skipped _nativeJSON: half an emoji in a title, a label and the boot id
  const half = String.fromCharCode(0xD83D), low = String.fromCharCode(0xDE00);
  return {
    v: 1, rev: 3, boot: 'b1760000900000-' + half, room: 'heavyweight', paper: true, tint: hw.accent, idle: hw.muted,
    items: items.map(i => i.id === 'coach' ? { id: 'coach', title: 'Coach ' + half, a11y: 'Coach' + low }
      : i.id === 'log' ? { id: 'log', title: 'Log', a11y: half + 'Log' } : i),
  };
}

function minimal() { return { v: 1 }; }

const write = (name, model, keepHalves) => {
  const text = JSON.stringify(model, (k, v) => (typeof v === 'string' && !keepHalves ? page._wellFormed(v) : v), 1);
  fs.mkdirSync(path.join(outDir, 'tabs'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tabs', name + '.json'), text + '\n');
};
write('forward-compat', forwardCompat());
write('lone-surrogates', lonely(), true);
write('minimal', minimal());
