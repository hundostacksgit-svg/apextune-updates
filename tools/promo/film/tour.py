"""
The OmniDx Edition preview, cut from the VM's recording (vm/director.py --edition):
a title, its setup at the first sign-in sped up (with its speed on screen), then
the look round after the restart in real time with the waits between steps cut
out, a line of words under each step. 1920 x 1080, the PC's own screen.

    python3 tools/promo/film/tour.py screen.mkv events.json out.mp4 [--wallpaper edition/assets/wallpaper.jpg]

Nothing on the screen is drawn over; the words sit in a band under it.
"""
import argparse, json, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FONTS = os.environ.get('FONTS', '')

# What each step shows, in the words under it.
WORDS = {
    'e01-welcome': 'First sign-in after setup: OmniDx Hub says hello',
    'e02-hub-home': 'OmniDx Hub: the PC live, Game Boost, the preset',
    'e03-hub-presets': 'Presets: Balanced, Competitive, Insane. Restore is one button',
    'e04-hub-games': 'Games: Steam, Epic, Riot, Battle.net, EA, Ubisoft, Roblox',
    'e05-hub-tune': 'The OmniDx tune, from inside the Hub',
    'e06-hub-about': 'The keys, and Remove OmniDx Edition',
    'e07-desktop': 'The desktop: the taskbar on the left, OmniDx pinned',
    'e08-start': 'Start, dark, in the OmniDx violet',
    'e09-search': 'Windows + S: OmniDx Search',
    'e10-search-display': 'Settings by the words you use',
    'e11-search-sum': 'Sums, as you type',
    'e12-search-boost': 'Game Boost: finer timer, performance plan, tabs asleep',
    'e13-browser-newtab': 'OmniDx Browser: a new tab that loads nothing',
    'e14-browser-omnidx': 'Trackers blocked, tabs asleep while you game',
    'e15-browser-youtube': 'Tabs in the title bar, the Edge engine inside',
    'e16-hub-boost': 'Game Boost on, in the Hub',
    'edition-count': 'Task Manager on OmniDx Edition',
    'e18-settings-about': 'Settings > About: OmniDx Edition',
    'e19-lock': 'The lock screen',
    'e20-sign-in': 'The sign-in picture',
    'e21-back': 'Back at the desktop',
}


def font(size, weight=700):
    f = ImageFont.truetype(os.path.join(FONTS, 'InterVariable.ttf'), size)
    try: f.set_variation_by_axes([32 if size >= 40 else 14, weight])
    except Exception: pass
    return f


def band(text, path, sub=None):
    """The words under the screen: a pill of violet-black, centred, near the bottom."""
    im = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(40, 700)
    w = d.textlength(text, font=f)
    x0, y0 = (1920 - w) / 2 - 34, 950
    d.rounded_rectangle((x0, y0, x0 + w + 68, y0 + 80), radius=40, fill=(14, 8, 26, 228), outline=(139, 92, 246, 255), width=3)
    d.text((1920 / 2, y0 + 40), text, font=f, fill=(241, 236, 255, 255), anchor='mm')
    if sub:
        fs = font(28, 600); ws = d.textlength(sub, font=fs)
        d.rounded_rectangle(((1920 - ws) / 2 - 20, 30, (1920 + ws) / 2 + 20, 84), radius=27, fill=(14, 8, 26, 220))
        d.text((1920 / 2, 57), sub, font=fs, fill=(192, 132, 252, 255), anchor='mm')
    im.save(path)


def title(path, wallpaper):
    bg = Image.open(wallpaper).convert('RGB').resize((1920, 1080)).filter(ImageFilter.GaussianBlur(3))
    dark = Image.new('RGB', bg.size, (0, 0, 0))
    im = Image.blend(bg, dark, 0.35)
    d = ImageDraw.Draw(im)
    d.text((960, 470), 'OmniDx Edition', font=font(120, 800), fill=(241, 236, 255), anchor='mm')
    d.text((960, 580), 'Genuine Windows 11, set up for games', font=font(44, 600), fill=(192, 132, 252), anchor='mm')
    d.text((960, 650), 'A clean install, recorded as it happened', font=font(30, 500), fill=(179, 168, 207), anchor='mm')
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('screen'); ap.add_argument('events'); ap.add_argument('out')
    ap.add_argument('--wallpaper', default='edition/assets/wallpaper.jpg')
    ap.add_argument('--setup-seconds', type=float, default=9)
    A = ap.parse_args()
    ev = json.load(open(A.events))
    at = {e['what']: e['t'] for e in ev}
    tmp = tempfile.mkdtemp()

    segs = []   # (from, to, speed, words, sub)
    if 'setup-running' in at and 'restarted' in at:
        a, b = at['setup-running'], at['restarted'] + 20
        sp = max(2, round((b - a) / A.setup_seconds))
        m = max(1, int(round((b - a) / 60)))
        segs.append((a, b, sp, 'Its setup at the first sign-in, then a restart', f'{m} minute{"" if m == 1 else "s"}, {sp}x speed'))
    steps = [e for e in ev if e['what'] in WORDS]
    prev_end = None
    for i, e in enumerate(steps):
        t = e['t']
        start = t - 4.5 if prev_end is None else max(prev_end, t - 4.5)
        end = t + 1.6
        if i + 1 < len(steps): end = min(end, steps[i + 1]['t'] - 0.2)
        if end - start < 1.5: continue
        segs.append((start, end, 1, WORDS[e['what']], None))
        prev_end = end

    parts, n = [], 0
    ttl = os.path.join(tmp, 'title.png'); title(ttl, A.wallpaper)
    t0 = os.path.join(tmp, 'p0.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-loop', '1', '-t', '3', '-i', ttl, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', t0], check=True)
    parts.append(t0)
    for a, b, sp, words, sub in segs:
        n += 1
        png = os.path.join(tmp, f'w{n}.png'); band(words, png, sub)
        out = os.path.join(tmp, f'p{n}.mp4')
        vf = f'[0:v]trim={a:.2f}:{b:.2f},setpts=(PTS-STARTPTS)/{sp},fps=30,scale=1920:1080[v];[v][1:v]overlay=0:0,format=yuv420p'
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', A.screen, '-i', png, '-filter_complex', vf, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out], check=True)
        parts.append(out)
    lst = os.path.join(tmp, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', A.out], check=True)
    total = 3 + sum((b - a) / sp for a, b, sp, _, _ in segs)
    print(f'{len(segs)} parts, {total:.1f} s -> {A.out}')


if __name__ == '__main__':
    main()
