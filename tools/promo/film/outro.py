"""
The OmniDx end card, added to the end of a finished vertical cut: the logo burns in from left to right on a violet
glow, lands on the beat with a flash, a light streak and a ring, "omnidx.net" rises in letter by letter over a line
that grows under it, a glint crosses the logo, and the card holds with a slow push-in while sparks drift. Its own
sound, in the bed's key (D minor, 100 BPM): a whoosh into a low hit, a chime on the address, a soft chord to the end.
The cut dissolves into it over the last half second.

    python3 tools/promo/film/outro.py in.mp4 out.mp4 [--logo studio/assets/logo/omnidx-logo.png] [--text omnidx.net]

FFMPEG (the ffmpeg binary) and FONTS (the folder with InterVariable.ttf) as for edit.py.
"""
import argparse, os, re, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FF = os.environ.get('FFMPEG', 'ffmpeg')
FONTS = os.environ.get('FONTS', '')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FPS = 30
SR = 48000
BEAT = 0.6
VIOLET = np.array([139, 92, 246], np.float32) / 255
PINK = np.array([217, 70, 239], np.float32) / 255


def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_io(x): x = clamp(x); return 3 * x * x - 2 * x * x * x


def probe(path):
    out = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out)
    s = re.search(r'Video: .*?, (\d{3,5})x(\d{3,5})', out)
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))
    return dur, int(s.group(1)), int(s.group(2))


def font(size, weight=800):
    f = ImageFont.truetype(os.path.join(FONTS, 'InterVariable.ttf'), size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f


class Card:
    def __init__(self, W, H, logo_path, text, dur, t_hit):
        self.W, self.H, self.dur, self.hit = W, H, dur, t_hit
        self.text = text
        rng = np.random.default_rng(7)
        # The ground: black at the edges, a deep violet bloom behind the logo, as on the site.
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        cx, cy = W / 2, H * 0.44
        r = np.sqrt(((xx - cx) / (W * 0.9)) ** 2 + ((yy - cy) / (H * 0.55)) ** 2)
        glow = np.exp(-r * r * 3.2)[..., None]
        self.bg = (np.array([4, 2, 9], np.float32) / 255 + glow * np.array([46, 16, 84], np.float32) / 255).astype(np.float32)
        # Sparks: slow, drifting up, twinkling.
        n = 90
        self.sparks = dict(x=rng.random(n) * W, y=rng.random(n) * H, v=12 + rng.random(n) * 38, s=0.8 + rng.random(n) * 2.2,
                           ph=rng.random(n) * 6.28, f=0.6 + rng.random(n) * 1.6, a=0.25 + rng.random(n) * 0.6)
        # The logo, full size once; the glow is a blur of it.
        self.logo = Image.open(logo_path).convert('RGBA')
        self.lw = int(W * 0.86)
        self.lh = round(self.lw * self.logo.height / self.logo.width)
        self.lcy = int(H * 0.43)
        # The address, one glyph at a time.
        self.f = font(int(W * 0.097), 800)
        self.track = int(W * 0.004)
        widths = [self.f.getlength(c) for c in text]
        self.tw = sum(widths) + self.track * (len(text) - 1)
        self.glyph_x = np.cumsum([0] + [w + self.track for w in widths[:-1]])
        self.ty = self.lcy + self.lh // 2 + int(H * 0.055)
        self.t_text = t_hit + 0.25

    def logo_at(self, sc):
        w, h = max(2, int(self.lw * sc)), max(2, int(self.lh * sc))
        im = self.logo.resize((w, h), Image.LANCZOS)
        a = np.asarray(im, np.float32) / 255
        return a

    def frame(self, t):
        W, H = self.W, self.H
        out = self.bg.copy()
        # Ground fades up out of black while the cut dissolves in.
        out *= ease_io(t / 0.45)
        # Sparks.
        sp = self.sparks
        img = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(img)
        for i in range(len(sp['x'])):
            y = (sp['y'][i] - sp['v'][i] * t) % H
            a = sp['a'][i] * (0.55 + 0.45 * np.sin(sp['ph'][i] + t * sp['f'][i] * 6.28)) * ease_io(t / 0.8)
            r = sp['s'][i]
            d.ellipse([sp['x'][i] - r, y - r, sp['x'][i] + r, y + r], fill=int(255 * a))
        spark = np.asarray(img.filter(ImageFilter.GaussianBlur(1.2)), np.float32)[..., None] / 255
        out = out + spark * (VIOLET * 0.8 + 0.2)

        hit = self.hit
        # The logo: grows in a touch while a burning edge reveals it from left to right, landing on the beat.
        p = ease_io((t - (hit - 0.62)) / 0.62)
        sc = 1.08 - 0.08 * ease_out((t - (hit - 0.7)) / 0.9)
        after = t - hit
        shake = (np.sin(after * 90) * 7 * np.exp(-after / 0.12)) if after > 0 else 0.0
        L = self.logo_at(sc)
        lh, lw = L.shape[:2]
        x0 = (W - lw) // 2 + int(shake)
        y0 = self.lcy - lh // 2
        u = np.linspace(0, 1, lw, dtype=np.float32)[None, :]
        v = np.linspace(0, 1, lh, dtype=np.float32)[:, None]
        edge = -0.12 + 1.24 * p
        reveal = np.clip((edge - u) / 0.07 + 0.5, 0, 1)
        a = L[..., 3] * reveal
        rgb = L[..., :3].copy()
        if 0 < p < 1:
            burn = np.exp(-((u - edge) / 0.025) ** 2)
            rgb = np.clip(rgb + burn[..., None] * (0.55 + 0.45 * VIOLET), 0, 1)
            a = np.clip(a + burn * L[..., 3] * 0.9, 0, 1)
        # The glint that crosses it once, after the address is up.
        q = (t - (hit + 1.15)) / 0.7
        if 0 < q < 1:
            band = np.exp(-(((u + 0.35 * v) - (-0.3 + 1.7 * q)) / 0.045) ** 2)
            luma = rgb.mean(axis=2)
            rgb = np.clip(rgb + (band * (0.25 + luma) * 0.65)[..., None], 0, 1)
        # Glow under the logo: builds with the reveal, flashes on the beat, then breathes.
        gi = 0.28 * p
        if after > 0: gi = 0.28 + 1.25 * np.exp(-after / 0.22)
        gi *= 1 + 0.08 * np.sin(max(0.0, after) * 5.2)
        pad = 60
        gimg = Image.fromarray((np.dstack([L[..., :3], a]) * 255).astype(np.uint8), 'RGBA')
        big = Image.new('RGBA', (lw + 2 * pad, lh + 2 * pad), (0, 0, 0, 0)); big.paste(gimg, (pad, pad))
        g = np.asarray(big.filter(ImageFilter.GaussianBlur(26)), np.float32) / 255
        self._add(out, x0 - pad, y0 - pad, g[..., :3] * 0.6 + VIOLET * 0.4, g[..., 3] * gi)
        self._over(out, x0, y0, rgb, a)

        # On the beat: a streak through the logo and a ring going out.
        if 0 <= after < 0.9:
            streak = Image.new('L', (W, 40), 0); ImageDraw.Draw(streak).ellipse([-W * 0.2, 16, W * 1.2, 24], fill=255)
            s = np.asarray(streak.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
            k = np.exp(-after / 0.16)
            self._add(out, 0, self.lcy + int(lh * 0.12) - 20, np.broadcast_to(0.7 + 0.3 * VIOLET, s.shape + (3,)), s * k * 1.2)
            ring = Image.new('L', (W, H), 0)
            rr = 60 + 1500 * ease_out(after / 0.9)
            ImageDraw.Draw(ring).ellipse([W / 2 - rr, self.lcy - rr, W / 2 + rr, self.lcy + rr], outline=255, width=max(1, int(7 * (1 - after / 0.9))))
            rg = np.asarray(ring.filter(ImageFilter.GaussianBlur(2)), np.float32) / 255
            out += rg[..., None] * VIOLET * 0.6 * (1 - after / 0.9)

        # The address: each letter rises and fades in, over a line that grows from the middle.
        tt = t - self.t_text
        if tt > 0:
            layer = Image.new('RGBA', (W, int(self.f.size * 1.6)), (0, 0, 0, 0))
            dl = ImageDraw.Draw(layer)
            left = (W - self.tw) / 2
            for i, ch in enumerate(self.text):
                e = ease_out((tt - i * 0.035) / 0.32)
                if e <= 0: continue
                dy = (1 - e) * self.f.size * 0.35
                dl.text((left + self.glyph_x[i], self.f.size * 0.2 + dy), ch, font=self.f, fill=(255, 255, 255, int(255 * e)))
            la = np.asarray(layer, np.float32) / 255
            glow = np.asarray(layer.filter(ImageFilter.GaussianBlur(16)), np.float32) / 255
            top = self.ty - int(self.f.size * 0.2)
            self._add(out, 0, top, np.broadcast_to(VIOLET, glow.shape[:2] + (3,)), glow[..., 3] * 1.1)
            self._over(out, 0, top, la[..., :3], la[..., 3])
            # The line under it.
            b = ease_out((tt - 0.18) / 0.45)
            if b > 0:
                bw = int((self.tw + W * 0.06) * b); bh = max(3, int(H * 0.0028))
                by = top + int(self.f.size * 1.42)
                if bw > 2:
                    grad = np.linspace(0, 1, bw, dtype=np.float32)[None, :, None]
                    col = VIOLET * (1 - grad) + PINK * grad
                    col = np.repeat(col, bh, axis=0)
                    self._over(out, (W - bw) // 2, by, col, np.ones((bh, bw), np.float32))
                    halo = Image.new('L', (W, 60), 0); ImageDraw.Draw(halo).rectangle([(W - bw) // 2, 28, (W + bw) // 2, 28 + bh], fill=255)
                    hg = np.asarray(halo.filter(ImageFilter.GaussianBlur(9)), np.float32) / 255
                    self._add(out, 0, by - 28, np.broadcast_to(VIOLET, hg.shape + (3,)), hg * 0.9)

        # A slow push-in over the whole card.
        z = 1 + 0.035 * ease_io(t / self.dur)
        im = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
        if z > 1.0005:
            cw, ch = W / z, H / z
            im = im.resize((W, H), Image.BICUBIC, box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))
        return im

    def _region(self, out, x, y, h, w):
        H, W = out.shape[:2]
        x1, y1, x2, y2 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if x2 <= x1 or y2 <= y1: return None
        return (slice(y1, y2), slice(x1, x2)), (slice(y1 - y, y2 - y), slice(x1 - x, x2 - x))

    def _over(self, out, x, y, rgb, a):
        r = self._region(out, x, y, *a.shape[:2])
        if not r: return
        o, s = r
        aa = a[s][..., None]
        out[o] = out[o] * (1 - aa) + rgb[s] * aa

    def _add(self, out, x, y, rgb, a):
        r = self._region(out, x, y, *a.shape[:2])
        if not r: return
        o, s = r
        out[o] = out[o] + rgb[s] * a[s][..., None]


def sound(dur, t_hit, t_chime, rng):
    n = int(dur * SR); t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)

    def lp(x, cut):
        cut = np.broadcast_to(np.asarray(cut, np.float64), x.shape)
        a = np.exp(-2 * np.pi * cut / SR); y = np.empty_like(x); s = 0.0
        for i in range(len(x)): s = (1 - a[i]) * x[i] + a[i] * s; y[i] = s
        return y

    # Whoosh: noise opening up into the hit, panned left to right with the reveal.
    w0 = t_hit - 0.75
    m = (t >= w0) & (t < t_hit + 0.05)
    k = np.clip((t[m] - w0) / 0.8, 0, 1)
    wn = lp(rng.standard_normal(m.sum()), 300 + 6000 * k ** 2) * (k ** 2.2) * 0.9
    L[m] += wn * (1 - k * 0.7); R[m] += wn * (0.3 + k * 0.7)
    # The hit: a falling sub, a thump of low noise, a click.
    m = t >= t_hit; th = t[m] - t_hit
    f = 38 + 34 * np.exp(-th / 0.09)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-th / 0.55) * 0.95
    thump = lp(rng.standard_normal(m.sum()), 180) * np.exp(-th / 0.18) * 2.2
    click = rng.standard_normal(m.sum()) * np.exp(-th / 0.004) * 0.35
    L[m] += sub + thump + click; R[m] += sub + thump + click
    # The chime on the address: a few bright partials, a little wider on the right.
    m = t >= t_chime; tc = t[m] - t_chime
    ch = sum(np.sin(2 * np.pi * fr * tc) * a * np.exp(-tc / dcy) for fr, a, dcy in
             ((1174.66, 0.16, 1.1), (1760.0, 0.11, 0.9), (2349.3, 0.07, 0.6), (3520.0, 0.035, 0.35)))
    L[m] += ch * 0.85; R[m] += np.concatenate([np.zeros(min(len(ch), 480)), ch[:max(0, len(ch) - 480)]])
    # A soft D minor (add 9) under the rest, rounded off.
    m = t >= t_hit; tp = t[m] - t_hit
    pad = np.zeros(m.sum())
    for midi, a in ((38, 0.5), (45, 0.4), (50, 0.35), (53, 0.3), (57, 0.25), (64, 0.18)):
        fr = 440 * 2 ** ((midi - 69) / 12)
        for dt in (-0.003, 0.003):
            pad += sum(np.sin(2 * np.pi * fr * (1 + dt) * h * tp + rng.random() * 6.28) / h ** 1.7 for h in range(1, 5)) * a
    pad = lp(pad, 1400) * np.minimum(1, tp / 0.08) * (0.55 + 0.45 * np.exp(-tp / 1.6)) * 0.05
    L[m] += pad; R[m] += pad
    st = np.stack([L, R], 1)
    fade = np.minimum(1, (dur - t) / 0.45)[:, None]
    st *= np.clip(fade, 0, 1)
    st *= 0.7 / max(1e-6, np.abs(st).max())
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--logo', default=os.path.join(ROOT, 'studio', 'assets', 'logo', 'omnidx-logo.png'))
    ap.add_argument('--text', default='omnidx.net')
    ap.add_argument('--dur', type=float, default=4.5)
    ap.add_argument('--overlap', type=float, default=0.5)
    a = ap.parse_args()
    if not os.path.exists(os.path.join(FONTS, 'InterVariable.ttf')): sys.exit('FONTS must be the folder with InterVariable.ttf')
    src_dur, W, H = probe(a.src)
    start = src_dur - a.overlap
    # The hit lands on the bed's beat (cuts are on the beat from 0).
    t_hit = round((start + 1.1) / BEAT) * BEAT - start
    card = Card(W, H, a.logo, a.text, a.dur, t_hit)
    tmp = tempfile.mkdtemp(prefix='omnidx-outro-')
    vid = os.path.join(tmp, 'card.mp4'); wav = os.path.join(tmp, 'card.wav')
    frames = int(round(a.dur * FPS))
    enc = subprocess.Popen([FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                            '-i', '-', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', vid], stdin=subprocess.PIPE)
    for i in range(frames):
        enc.stdin.write(card.frame(i / FPS).tobytes())
        if i % 30 == 0: print(f'  card frame {i}/{frames}', flush=True)
    enc.stdin.close(); enc.wait()
    st = sound(a.dur, t_hit, card.t_text + 0.35, np.random.default_rng(11))
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype('<i2').tobytes())
    fc = (f'[0:v]fps={FPS},format=yuv420p,settb=AVTB[a0];[1:v]fps={FPS},format=yuv420p,settb=AVTB[b0];'
          f'[a0][b0]xfade=transition=fade:duration={a.overlap}:offset={start:.3f}[v];'
          f'[0:a]aformat=sample_rates={SR}:channel_layouts=stereo[aa];[2:a]aformat=sample_rates={SR}:channel_layouts=stereo[ab];'
          f'[aa][ab]acrossfade=d={a.overlap}:c1=tri:c2=tri[au]')
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', a.src, '-i', vid, '-i', wav, '-filter_complex', fc,
                    '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', a.out], check=True)
    print(f'{a.out}: {src_dur:.1f} s + a {a.dur:.1f} s end card (hit at {start + t_hit:.2f} s, on the beat)')


if __name__ == '__main__':
    main()
