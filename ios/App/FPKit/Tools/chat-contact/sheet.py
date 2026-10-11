#!/usr/bin/env python3
"""Contact sheets for the native Coach chat beside the web chat (plan task C6).

Reads <shots>/native/<fixture>/<room>-<light|dark>-<size>.png (FPUITests' CoachRenderTests) and
<shots>/web/<fixture>/<room>-<zoom>.png (web-shots.js) and writes, per room:

  <out>/contact-<room>.png        every fixture, one row each: web 1.0 | native large (phone light) |
                                  native large (phone dark) | web 1.12 | native xLarge | web 1.25 |
                                  native xxLarge, at half size
  <out>/<room>/<fixture>.png      the same row at full size, then the whole conversation: web 1.0
                                  beside native large, web 1.25 beside native xxLarge

Usage: python3 sheet.py <shots dir> <out dir>      Needs Pillow.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

SHOTS, OUT = sys.argv[1], sys.argv[2]
ROOMS = ['heavyweight', 'lime']
COLS = [('web', '{room}-z1.png', 'web 1.0'), ('native', '{room}-light-large.png', 'native large'),
        ('native', '{room}-dark-large.png', 'native large, phone dark'), ('web', '{room}-z112.png', 'web 1.12'),
        ('native', '{room}-light-xLarge.png', 'native xLarge'), ('web', '{room}-z125.png', 'web 1.25'),
        ('native', '{room}-light-xxLarge.png', 'native xxLarge')]
FULL = [('web', '{room}-full-z1.png', 'web 1.0, whole'), ('native', '{room}-full-large.png', 'native large, whole'),
        ('web', '{room}-full-z125.png', 'web 1.25, whole'), ('native', '{room}-full-xxLarge.png', 'native xxLarge, whole')]
CELL_W, CELL_H, GAP, LABEL = 390, 844, 14, 34


def font(size):
    for p in ('/System/Library/Fonts/SFNS.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def load(kind, fixture, pattern, room, width):
    p = os.path.join(SHOTS, kind, fixture, pattern.format(room=room))
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGB')
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def placeholder(w, h, text):
    im = Image.new('RGB', (w, h), (230, 230, 230))
    ImageDraw.Draw(im).text((12, 12), text, fill=(90, 90, 90), font=font(16))
    return im


def row(fixture, room, cols, width, height=None):
    ims = [load(k, fixture, pat, room, width) for k, pat, _ in cols]
    h = height or max([im.height for im in ims if im] + [100])
    canvas = Image.new('RGB', (len(cols) * width + (len(cols) + 1) * GAP, h + LABEL + GAP), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    for i, ((k, _, label), im) in enumerate(zip(cols, ims)):
        x = GAP + i * (width + GAP)
        d.text((x, 8), label, fill=(30, 30, 30) if k == 'native' else (10, 67, 245), font=font(18 if width >= 300 else 13))
        if im is None:
            im = placeholder(width, min(h, 200), 'not rendered')
        canvas.paste(im.crop((0, 0, width, min(im.height, h))), (x, LABEL))
    return canvas


def stack(images, title):
    w = max(im.width for im in images)
    h = sum(im.height for im in images) + 50
    canvas = Image.new('RGB', (w, h), (255, 255, 255))
    ImageDraw.Draw(canvas).text((GAP, 12), title, fill=(0, 0, 0), font=font(24))
    y = 50
    for im in images:
        canvas.paste(im, (0, y))
        y += im.height
    return canvas


fixtures = sorted(d for d in os.listdir(os.path.join(SHOTS, 'native')) if os.path.isdir(os.path.join(SHOTS, 'native', d)) and d not in ('overlays',))
os.makedirs(OUT, exist_ok=True)
for room in ROOMS:
    os.makedirs(os.path.join(OUT, room), exist_ok=True)
    half = []
    for fx in fixtures:
        screens = row(fx, room, COLS, CELL_W, CELL_H)
        whole = row(fx, room, FULL, CELL_W)
        stack([screens, whole], '%s · %s' % (fx, room)).save(os.path.join(OUT, room, fx + '.png'))
        small = row(fx, room, COLS, CELL_W // 2, CELL_H // 2)
        lbl = Image.new('RGB', (small.width, 30), (255, 255, 255))
        ImageDraw.Draw(lbl).text((GAP, 6), fx, fill=(0, 0, 0), font=font(18))
        half += [lbl, small]
    stack(half, 'Coach chat · %s · web (blue labels) beside native (black labels)' % room).save(os.path.join(OUT, 'contact-%s.png' % room))
    print('sheet', room, len(fixtures), 'fixtures')

# the forwarded toasts and confirm, both rooms
ov = os.path.join(SHOTS, 'native', 'overlays')
if os.path.isdir(ov):
    names = sorted(f for f in os.listdir(ov) if f.endswith('.png'))
    ims = [Image.open(os.path.join(ov, n)).convert('RGB').resize((CELL_W // 2 * 2 // 2, CELL_H // 2), Image.LANCZOS) for n in names]
    canvas = Image.new('RGB', (len(ims) * (CELL_W // 2 + GAP) + GAP, CELL_H // 2 + LABEL + GAP), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    for i, (n, im) in enumerate(zip(names, ims)):
        x = GAP + i * (CELL_W // 2 + GAP)
        d.text((x, 8), n[:-4], fill=(0, 0, 0), font=font(12))
        canvas.paste(im, (x, LABEL))
    canvas.save(os.path.join(OUT, 'overlays.png'))
    print('sheet overlays', len(names))
