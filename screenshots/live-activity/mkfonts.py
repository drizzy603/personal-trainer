#!/usr/bin/env python3
"""Make the native fonts: static TTF faces for the rest Live Activity and the native Coach chat.

The web app ships its fonts as latin + latin-ext woff2 subsets in assets/fonts (Inter, JetBrains
Mono and Archivo are variable). Native code needs static TrueType files, so each face the views use
is instanced from both subsets at its weight, the two are merged into one file (so "Łydka" or
"Čučoriedka" stay in the face instead of dropping to SF mid-word), and the face is renamed
"<Family> FP" so it can never collide with a system or app font. Every file keeps its copyright
record and carries the SIL Open Font License 1.1 notice and URL (the web subsets drop them), which
is how OFL fonts may travel inside an app. Output is byte-for-byte reproducible.

Two sets, each face marked with where it goes:
  widget  the rest Live Activity (TrovoRestViews.swift's Faces): ios/App/TrovoTimerWidget/Fonts,
          listed in the extension's Info.plist UIAppFonts and its Xcode Resources.
  chat    the native Coach chat (FPKit's FPUI, Theme/Fonts.swift registers them at runtime):
          ios/App/FPKit/Sources/FPUI/Resources/Fonts. The web chat's body weights: Heavyweight is
          Archivo, Lime is Inter with JetBrains Mono eyebrows, figures and code. Neither family has
          an italic: the web synthesizes one, and so does Fonts.swift.

Usage: python3 mkfonts.py [widgetOutDir [chatOutDir]]
Needs: pip install fonttools brotli
After adding or removing a widget face, update the Xcode project (Resources of TrovoTimerWidget) and
the extension's Info.plist UIAppFonts to match. A chat face needs nothing else: SwiftPM copies the
folder, and Fonts.swift registers every .ttf in it.
"""
import os, sys, tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(REPO, 'assets', 'fonts')
OUT = {
    'widget': sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'ios', 'App', 'TrovoTimerWidget', 'Fonts'),
    'chat': sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, 'ios', 'App', 'FPKit', 'Sources', 'FPUI', 'Resources', 'Fonts'),
}

# (source woff2 stem, family, PostScript family, weight, style, sets);
# '<stem>-latin.woff2' and '<stem>-latin-ext.woff2' are merged into each
FACES = [
    # the rest Live Activity's six faces (and the chat's bold weights)
    ('anton',     'Anton',          'AntonFP',          400, 'Regular',   ('widget',)),
    ('archivo',   'Archivo',        'ArchivoFP',        700, 'Bold',      ('widget', 'chat')),
    ('jbm-var',   'JetBrains Mono', 'JetBrainsMonoFP',  250, 'Clock',     ('widget',)),   # the in-app rest clock weight
    ('jbm-var',   'JetBrains Mono', 'JetBrainsMonoFP',  700, 'Bold',      ('widget', 'chat')),
    ('inter-var', 'Inter',          'InterFP',          800, 'ExtraBold', ('widget', 'chat')),
    ('inter-var', 'Inter',          'InterFP',          700, 'Bold',      ('widget', 'chat')),
    # the chat's body weights: text 400, the owner's bubble and Back 500, chips, pills and buttons
    # 600, eyebrows and figures 800 (JetBrains Mono stops at 800)
    ('archivo',   'Archivo',        'ArchivoFP',        400, 'Regular',   ('chat',)),
    ('archivo',   'Archivo',        'ArchivoFP',        500, 'Medium',    ('chat',)),
    ('archivo',   'Archivo',        'ArchivoFP',        600, 'SemiBold',  ('chat',)),
    ('archivo',   'Archivo',        'ArchivoFP',        800, 'ExtraBold', ('chat',)),
    ('inter-var', 'Inter',          'InterFP',          400, 'Regular',   ('chat',)),
    ('inter-var', 'Inter',          'InterFP',          500, 'Medium',    ('chat',)),
    ('inter-var', 'Inter',          'InterFP',          600, 'SemiBold',  ('chat',)),
    ('jbm-var',   'JetBrains Mono', 'JetBrainsMonoFP',  400, 'Regular',   ('chat',)),
    ('jbm-var',   'JetBrains Mono', 'JetBrainsMonoFP',  600, 'SemiBold',  ('chat',)),
    ('jbm-var',   'JetBrains Mono', 'JetBrainsMonoFP',  800, 'ExtraBold', ('chat',)),
]

OFL = ('This Font Software is licensed under the SIL Open Font License, Version 1.1. '
       'This license is available with a FAQ at: https://openfontlicense.org')

def rename(f, family, style, ps):
    n = f['name']
    for rec in list(n.names):
        if rec.nameID in (1, 2, 4, 6, 13, 14, 16, 17, 25):
            n.removeNames(nameID=rec.nameID)
    full = family + ' ' + style
    legacy = family if style == 'Regular' else full
    for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
        n.setName(legacy, 1, pid, eid, lid)
        n.setName('Regular', 2, pid, eid, lid)
        n.setName(full, 4, pid, eid, lid)
        n.setName(ps, 6, pid, eid, lid)
        n.setName(family, 16, pid, eid, lid)
        n.setName(style, 17, pid, eid, lid)
        n.setName(OFL, 13, pid, eid, lid)
        n.setName('https://openfontlicense.org', 14, pid, eid, lid)

def static(path, weight):
    f = TTFont(path, recalcTimestamp=False)
    if 'fvar' in f:
        loc = {a.axisTag: a.defaultValue for a in f['fvar'].axes}
        loc['wght'] = weight
        f = instancer.instantiateVariableFont(f, loc)
    f.flavor = None
    for t in ('STAT', 'MVAR', 'HVAR', 'avar', 'fvar', 'gvar', 'cvar'):
        if t in f: del f[t]
    return f

for d in OUT.values():
    os.makedirs(d, exist_ok=True)
tmp = tempfile.mkdtemp()
for stem, family, psfam, weight, style, sets in FACES:
    parts = []
    for sub in ('latin', 'latin-ext'):
        p = os.path.join(tmp, '%s-%s-%d.ttf' % (stem, sub, weight))
        static(os.path.join(SRC, '%s-%s.woff2' % (stem, sub)), weight).save(p)
        parts.append(p)
    # latin first: where both subsets map a code point (space, digits), latin's glyph wins
    f = Merger().merge(parts)
    ps = psfam + '-' + style
    rename(f, family + ' FP', style, ps)
    f['OS/2'].usWeightClass = weight
    f['head'].modified = f['head'].created = 3_800_000_000   # fixed stamps: reproducible bytes
    f.recalcTimestamp = False
    for where in sets:
        path = os.path.join(OUT[where], ps + '.ttf')
        f.save(path)
        print(path, os.path.getsize(path))
