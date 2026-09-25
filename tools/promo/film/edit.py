"""
Cuts the filmed run (film.ps1's screen.mkv) into a 1080 x 1920 video for
TikTok, Reels and Shorts, from an edit list:

    python3 tools/promo/film/edit.py edl.json screen.mkv out.mp4

The edit list names the source segments and their speed (a sped-up segment
is labelled with its speed on screen), the camera (a window of the screen's
own shape onto it, eased between keyframes), and the words. Everything is
the recording itself: nothing on the screen is drawn over or replaced; the
words sit around it.

edl.json:
  {"segments": [{"from": 3.0, "to": 12.5, "speed": 1}, ...],
   "camera":   [{"t": 0, "rect": [0, 0, 1024, 768]}, {"t": 4.2, "rect": [600, 90, 340, 255], "hold": 2.5}, ...],
   "top":      [{"from": 0, "to": 3.5, "text": "...", "size": 74}, ...],
   "bottom":   [{"from": 3, "to": 9, "text": "...", "big": "142", "color": "#ff5d6c"}, ...],
   "note": "Real run on a Windows 11 test PC",
   "bed": {"pops": [3.1], "whoosh": [5.0]},
   "cursor": {"csv": "cursor.csv", "video_offset": 2.5}}
Times in "camera", "top" and "bottom" are output seconds.

"cursor" is for a machine with no mouse attached, where Windows moves the
pointer but does not draw it: the pointer is drawn where film.ps1's log says
it was at that moment (the log's clock plus video_offset is the recording's
time). Leave it out when the recording shows the pointer itself.
"""
import json, subprocess, sys, os, math
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FONTS = os.environ.get('FONTS', '')
OW, OH, FPS = 1080, 1920, 30
SW, SH = 1024, 768          # the recorded screen; "screen": [w, h] in the edit list for another size
BOX = (0, 540, 1080, 810)  # where the screen sits: x, y, w, h (full width, its own shape)


@lru_cache(maxsize=64)
def font(size, weight=800):
    f = ImageFont.truetype(os.path.join(FONTS, 'InterVariable.ttf'), size)
    # Inter's axes, in its own order: optical size (14-32), then weight (100-900).
    f.set_variation_by_axes([32 if size >= 40 else 14, max(100, min(900, weight))])
    return f


def ease(x):
    x = min(1, max(0, x)); return x * x * (3 - 2 * x)


def camera_at(cam, t):
    """The camera rect at output time t: held at each keyframe for its "hold", eased to the next."""
    cam = sorted(cam, key=lambda k: k['t'])
    keys = []
    for i, k in enumerate(cam):
        keys.append((k['t'], k['rect']))
        # A hold ends where the next keyframe starts at the latest: rounding (7.07 + 3.8 = 10.870000000000001)
        # must not put its end after that keyframe, or the camera eases the wrong way across the whole gap.
        nxt = cam[i + 1]['t'] if i + 1 < len(cam) else float('inf')
        if k.get('hold'): keys.append((min(k['t'] + k['hold'], nxt), k['rect']))
    if t <= keys[0][0]: return keys[0][1]
    for (t0, r0), (t1, r1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            e = ease((t - t0) / max(1e-6, t1 - t0))
            return [r0[i] + (r1[i] - r0[i]) * e for i in range(4)]
    return keys[-1][1]


def wrap(draw, text, f, width):
    """Lines no wider than width, as even as the same number of lines allows (no lone last word)."""
    def greedy(wd):
        lines, line = [], ''
        for w in text.split(' '):
            test = (line + ' ' + w).strip()
            if draw.textlength(test, font=f) <= wd or not line: line = test
            else: lines.append(line); line = w
        if line: lines.append(line)
        return lines
    lines = greedy(width)
    lo, hi = max(draw.textlength(w, font=f) for w in text.split(' ')), width
    while hi - lo > 4:
        mid = (lo + hi) / 2
        if len(greedy(mid)) <= len(lines): hi = mid
        else: lo = mid
    return greedy(hi)


@lru_cache(maxsize=256)
def caption_layer(text, size, color, stroke, weight, pop_q):
    """The words drawn once onto a transparent strip, cached per animation step."""
    f = font(int(size * (0.86 + 0.14 * pop_q / 8)), weight)
    probe = ImageDraw.Draw(Image.new('RGBA', (8, 8)))
    lines = [ln for part in text.split('\n') for ln in wrap(probe, part, f, OW - 120)]  # a \n in the words forces a line
    lh = int(f.size * 1.16)
    layer = Image.new('RGBA', (OW, lh * len(lines) + stroke * 2 + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, ln in enumerate(lines):
        w = d.textlength(ln, font=f)
        d.text(((OW - w) / 2, stroke + i * lh), ln, font=f, fill=color, stroke_width=stroke, stroke_fill='#000000')
    return layer, len(lines) * lh


def caption(img, text, y, size, color='#ffffff', stroke=7, weight=850, alpha=1.0, pop=1.0):
    """TikTok-style words: heavy, white, a black outline, centred; `pop` scales in from 0.86."""
    layer, height = caption_layer(text, size, color, stroke, weight, int(round(pop * 8)))
    if alpha < 1:
        layer = layer.copy(); layer.putalpha(layer.getchannel('A').point(lambda a: int(a * alpha)))
    img.alpha_composite(layer, (0, int(y) - stroke))
    return y + height


def pill(img, text, x, y, size=34, fill=(0, 0, 0, 170), color='#ffffff', anchor='lt'):
    """A rounded label, blended over the picture (drawn on its own layer so its see-through fill stays see-through)."""
    f = font(size, 750)
    probe = ImageDraw.Draw(Image.new('RGBA', (8, 8)))
    w = probe.textlength(text, font=f); h = size * 1.3
    if anchor == 'rt': x = x - w - 36
    if anchor == 'ct': x = x - (w + 36) / 2
    layer = Image.new('RGBA', (int(w + 40), int(h + 14)), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([0, 0, w + 36, h + 10], radius=(h + 10) / 2, fill=fill)
    d.text((18, 5 + size * 0.05), text, font=f, fill=color)
    img.alpha_composite(layer, (int(x), int(y)))


def arrow(scale):
    """The standard Windows arrow pointer, white with a black edge, its tip at (2, 2)."""
    k = 4 * scale
    pts = [(0, 0), (0, 17), (4, 13), (7, 20), (10, 19), (7, 12), (12, 12)]
    big = Image.new('RGBA', (int(16 * k) + 8, int(24 * k) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.polygon([(4 + x * k, 4 + y * k) for x, y in pts], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=max(2, int(k)))
    return big.resize((big.width // 4, big.height // 4), Image.LANCZOS)


class Pointer:
    """Where the pointer was, from film.ps1's cursor log, in the cut's output time."""
    def __init__(self, cfg, spans_src):
        rows = [ln.split(',') for ln in open(cfg['csv'], encoding='utf-8-sig').read().split('\n')[1:] if ln.count(',') >= 2]
        self.t = np.array([float(r[0]) for r in rows]); self.x = np.array([float(r[1]) for r in rows]); self.y = np.array([float(r[2]) for r in rows])
        self.vo = float(cfg.get('video_offset', 0)); self.spans = spans_src; self.sprites = {}

    def at(self, t):
        for (a, z, sp, frm) in self.spans:
            if a <= t < z:
                clock = frm + (t - a) * sp - self.vo
                if clock < self.t[0] or clock > self.t[-1]: return None
                return float(np.interp(clock, self.t, self.x)), float(np.interp(clock, self.t, self.y))
        return None

    def sprite(self, zoom):
        q = round(zoom * 4) / 4
        if q not in self.sprites: self.sprites[q] = arrow(q)
        return self.sprites[q]


def build_cut(edl, src, cut):
    """The segments, at their speeds, as one 30 fps clip at the screen's size."""
    parts, labels = [], []
    for i, s in enumerate(edl['segments']):
        sp = float(s.get('speed', 1))
        parts.append(f"[0:v]trim=start={s['from']}:end={s['to']},setpts=(PTS-STARTPTS)/{sp},fps={FPS}[v{i}]")
        labels.append(f"[v{i}]")
    graph = ';'.join(parts) + ';' + ''.join(labels) + f"concat=n={len(labels)}:v=1:a=0,format=rgb24[out]"
    subprocess.run([FFMPEG, '-nostdin', '-y', '-loglevel', 'error', '-i', src, '-filter_complex', graph, '-map', '[out]',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv444p', cut], check=True)
    # Where each segment lands in output time, and at what speed, for the on-screen speed label.
    spans, t = [], 0.0
    for s in edl['segments']:
        d = (s['to'] - s['from']) / float(s.get('speed', 1)); spans.append((t, t + d, float(s.get('speed', 1)))); t += d
    return spans, t


def main():
    global SW, SH, BOX
    edl_path, src, out = sys.argv[1:4]
    edl = json.load(open(edl_path))
    if edl.get('screen'):
        SW, SH = (int(v) for v in edl['screen'])
        BOX = (0, 540, OW, int(round(OW * SH / SW)))
    work = os.path.dirname(os.path.abspath(out))
    cut = os.path.join(work, 'cut.mp4')
    spans, dur = build_cut(edl, src, cut)
    n = int(round(dur * FPS))
    pointer = None
    if edl.get('cursor'):
        spans_src = [(a, z, sp, float(s['from'])) for (a, z, sp), s in zip(spans, edl['segments'])]
        pointer = Pointer(edl['cursor'], spans_src)
    print(f'{len(spans)} segments, {dur:.1f} s, {n} frames')

    bed = os.path.join(work, 'bed.wav')
    b = edl.get('bed', {})
    subprocess.run([sys.executable, os.path.join(HERE, 'bed.py'), bed, f'{dur:.3f}',
                    '--pops', ','.join(str(x) for x in b.get('pops', [])), '--whoosh', ','.join(str(x) for x in b.get('whoosh', []))], check=True)

    reader = subprocess.Popen([FFMPEG, '-nostdin', '-loglevel', 'error', '-i', cut, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    writer = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
                               '-i', bed, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-profile:v', 'high',
                               '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-af', 'loudnorm=I=-14:TP=-1.2:LRA=8', '-ar', '48000', '-shortest',
                               '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    bx, by, bw, bh = BOX
    mask = Image.new('L', (bw, bh), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=26, fill=255)
    shadow = Image.new('RGBA', (OW, OH), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([bx + 6, by + 16, bx + bw - 6, by + bh + 20], radius=30, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    note = edl.get('note', '')
    dim = Image.new('RGBA', (OW, OH), (6, 4, 12, 150))
    for i in range(n):
        raw = reader.stdout.read(SW * SH * 3)
        if len(raw) < SW * SH * 3: break
        t = i / FPS
        frame = Image.frombuffer('RGB', (SW, SH), raw, 'raw', 'RGB', 0, 1)
        # Behind everything: the same frame, blurred and dimmed, filling the tall frame.
        bg = frame.resize((SW // 8, SH // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3))
        bg = bg.resize((int(OH * SW / SH), OH), Image.BILINEAR)
        left = (bg.width - OW) // 2
        img = bg.crop((left, 0, left + OW, OH)).convert('RGBA')
        img.alpha_composite(dim)
        img.alpha_composite(shadow)
        # The screen, through the camera.
        cx, cy, cw, ch = camera_at(edl['camera'], t)
        view = frame.resize((bw, bh), Image.LANCZOS, box=(cx, cy, cx + cw, cy + ch))
        if pointer:
            p = pointer.at(t)
            if p:
                zoom = bw / cw
                spr = pointer.sprite(zoom)
                px, py = int((p[0] - cx) * zoom) - 1, int((p[1] - cy) * zoom) - 1
                if -spr.width < px < bw and -spr.height < py < bh:
                    view.paste(spr, (px, py), spr)
        img.paste(view, (bx, by), mask)
        # Speed, when it is not real time.
        for (a, z, sp) in spans:
            if a <= t < z and sp > 1.01:
                pill(img, f'{sp:g}x speed', bx + bw - 24, by + 22, 32, anchor='rt')
        for c in edl.get('top', []):
            if c['from'] <= t < c['to']:
                k = min(1, (t - c['from']) / 0.18)
                caption(img, c['text'], c.get('y', 150), c.get('size', 70), c.get('color', '#ffffff'), pop=k, alpha=min(1, k * 1.5))
        for c in edl.get('bottom', []):
            if c['from'] <= t < c['to']:
                k = min(1, (t - c['from']) / 0.18)
                y = by + bh + 50
                if c.get('big'):
                    y = caption(img, c['big'], y, c.get('bigsize', 150), c.get('color', '#ffffff'), stroke=9, weight=900, pop=k)
                if c.get('text'):
                    caption(img, c['text'], y + 6, c.get('size', 50), '#ffffff', stroke=6, weight=800, pop=k)
        if note:
            pill(img, note, OW / 2, OH - 150, 28, fill=(0, 0, 0, 150), color='#d8d2e8', anchor='ct')
        writer.stdin.write(img.tobytes())
        if i % 150 == 0 or i == n - 1: print(f'  frame {i + 1}/{n}')
    writer.stdin.close(); writer.wait()
    reader.stdout.close(); reader.kill(); reader.wait()  # it may hold a frame or two past the end; it is not waited on for them
    print(out)


if __name__ == '__main__':
    main()
