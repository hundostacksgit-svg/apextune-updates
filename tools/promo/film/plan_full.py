"""
The full film, one story in a minute and a bit: a clean Windows 11 install from Microsoft's own installer, OmniDx
Edition setting itself up at the first sign-in, a look round it, Task Manager, the one line in PowerShell, the run,
the restart, and Task Manager again. Cut from one take of vm/director.py --edition --edition-command (its
events.json, screen.mkv and the install's frames), rendered by edit.py like the restart video.

    python3 tools/promo/film/timelapse.py take/timelapse install.mp4
    python3 tools/promo/film/plan_full.py events.json take.json install.mp4 full.json
    python3 tools/promo/film/edit.py full.json screen.mkv omnidx-full.mp4

take.json, read off this take's pictures (the director's clock unless "offset" says otherwise):
  {"before": 118, "after": 58,               Task Manager's count before the command and after the restart
   "boxes": {"tm_count": [x, y, w, h], "ps": [...], "extreme": [...], "result": [...], "hub": [...], "search": [...],
             "browser": [...], "timer": [...]},
   "install": [from, to]}                    the part of install.mp4 worth showing (all of it by default)

Every cut lands on the music's beat (bed.py plays at 100 BPM): what the person does is real time, trimmed to the
beat; what the PC does alone is sped up to fit, and labelled with its speed. A number is under the screen only
while the screen shows it. Nothing on the screen is drawn over.
"""
import json, os, re, subprocess, sys

SW, SH = 1920, 1080
FULL = [0, 0, SW, SH]
BEAT = 0.6
NOTE = 'Real run on a clean Windows 11 test PC · omnidx.net'
ZOOM = {'hub': 1150, 'search': 760, 'browser': 1400, 'timer': 700, 'tm_count': 640, 'ps': 1100, 'extreme': 1300,
        'result': 800, 'about': 1300}


def beats(d, least=1):
    return max(least, round(d / BEAT)) * BEAT


def fit(box, zoom_w):
    x, y, w, h = box
    cw = max(zoom_w, w * 1.08, h * 1.08 * SW / SH); cw = min(cw, SW); ch = cw * SH / SW
    cx = min(max(0, x + w / 2 - cw / 2), SW - cw); cy = min(max(0, y + h / 2 - ch / 2), SH - ch)
    return [round(cx), round(cy), round(cw), round(ch)]


def duration(path):
    """A video's length in seconds, as ffmpeg reports it."""
    err = subprocess.run([os.environ.get('FFMPEG', 'ffmpeg'), '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0


def main():
    events, take_path, install, out = sys.argv[1:5]
    take = json.load(open(take_path))
    boxes = take.get('boxes', {})
    ev, allev = {}, {}
    for e in json.load(open(events, encoding='utf-8-sig')):
        ev.setdefault(e['what'], e); allev.setdefault(e['what'], []).append(e)
    off = float(take.get('offset', 0))
    V = lambda k: ev[k]['t'] + off
    # Windows' restarts as QEMU saw them (the director marks each a little after it happens and says how long after):
    # the cut skips from the restart to the sign-in, past the helper being started by hand when it was.
    resets = [e['t'] - float(e.get('ago', 0)) + off for e in allev.get('reset', [])]
    after = lambda t0: next((r for r in resets if r > t0), None)
    has = lambda *ks: all(k in ev for k in ks)
    cam = lambda box: fit(boxes[box], ZOOM.get(box, 1180)) if box in boxes else FULL

    segs, camera, top, bottom, chapters, pops, whoosh = [], [], [], [], [], [], []
    t = 0.0

    def add(a, b, sp, rect, words, size=62, big=None, roll=None, src=None, lead=0.35):
        """A stretch of the take from a to b at speed sp, its output length on the beat."""
        nonlocal t
        if b <= a: return
        if sp == 1:
            b = a + beats(b - a)
            d = b - a
        else:
            # A whole-number speed, as an editor would set it (the label reads "80x", not "79.278x"); the stretch is
            # trimmed or let run by the fraction that takes, so its length on screen stays on the beat.
            d = beats((b - a) / sp)
            sp = max(2, round((b - a) / d))
            b = a + sp * d
        s = {'from': round(a, 3), 'to': round(b, 3), 'speed': round(sp, 3)}
        if src: s['src'] = src
        segs.append(s)
        camera.append({'t': round(t, 3), 'rect': rect, 'hold': round(max(0.05, d - 0.45), 3)})
        if words: top.append({'from': round(t, 3), 'to': round(t + d, 3), 'text': words, 'size': size})
        if big or roll:
            k = {'from': round(t + lead, 3), 'to': round(t + d, 3), 'text': (big or roll)[1], 'color': (big or roll)[2]}
            if roll: k['roll'] = roll[0]; k['roll_s'] = 1.2
            else: k['big'] = big[0]
            bottom.append(k); pops.append(round(t + lead, 3))
        if t > 0: whoosh.append(round(t, 3))
        t += d

    def fast(a, b, seconds, rect, words, size=58):
        """What the PC does alone, a to b, sped up to about `seconds` on screen (on the beat), at least twice as fast."""
        if b > a: add(a, b, max(2.0, (b - a) / beats(seconds)), rect, words, size)

    def chapter(text, start):
        chapters.append({'from': round(start, 3), 'to': round(t, 3), 'text': text})

    def step(name, lead, tail, words, box=None, size=62):
        if name in ev: add(V(name) - lead, V(name) + tail, 1, cam(box) if box else FULL, words, size)

    n0, n1 = take.get('before'), take.get('after')
    # 0. The payoff first, two seconds of it: where this ends up. Then back to the start.
    if 'after-restart-count' in ev and n1:
        a = V('after-restart-count')
        add(a - 0.3, a + 1.5, 1, cam('tm_count'), 'Clean Windows 11 to this, in one video', 64,
            big=(str(n1), 'processes', '#35d07f'), lead=0.2)

    # 1. The install, from Microsoft's own installer, sped up.
    c0 = t
    dur = duration(install) if os.path.exists(install) else 0
    i0, i1 = take.get('install', [0, dur])
    if i1 > i0:
        add(i0, i1, max(2.0, (i1 - i0) / beats(7.2)), FULL, 'Clean Windows 11, from Microsoft’s own installer', 64, src='install')
    chapter('1 · Install', c0)

    # 2. OmniDx Edition: setup at the first sign-in, one restart, and what it is now.
    c0 = t
    r1 = after(V('setup-running')) if 'setup-running' in ev else None
    if has('setup-running', 'restarted'):
        add(V('setup-running') + 2.0, V('setup-running') + 4.4, 1, FULL, 'First sign-in: OmniDx Edition sets itself up', 60)
        fast(V('setup-running') + 4.4, r1 if r1 else V('restarted') + 10.0, 5.4, FULL, 'Its apps, its look, the lean settings. By itself', 58)
    if r1:
        fast(r1, r1 + 110, 3.0, FULL, 'One restart', 64)
    elif has('restarted', 'welcome'):
        fast(V('restarted') + 10.0, V('welcome') - 2.4, 3.0, FULL, 'One restart', 64)
    step('e01-welcome', 2.4, 0.6, 'And this is my Windows now', 'hub', 64)
    step('e07-desktop', 1.4, 0.4, 'Taskbar on the left')
    step('e08-start', 1.8, 0.6, 'Start, in OmniDx violet')
    step('e12-search-boost', 2.2, 0.6, 'Windows + S: its own search', 'search')
    step('e13-browser-newtab', 2.0, 0.6, 'Its own browser. Nothing in the background', 'browser', 58)
    step('e03-hub-presets', 2.0, 0.6, 'Balanced. Competitive. Insane.', 'hub')
    step('e16-hub-boost', 2.2, 0.4, 'Game Boost: the system timer at 1 ms', 'timer')
    step('e18-settings-about', 2.0, 0.4, 'Still genuine Windows underneath', 'about')
    step('e19-lock', 2.0, 0.4, 'Down to the lock screen')
    chapter('2 · OmniDx Edition', c0)

    # 3. The one line, by hand, and the number after a restart.
    c0 = t
    if 'before-count' in ev:
        add(V('before-count') - 0.6, V('before-count') + 2.4, 1, cam('tm_count'), 'Task Manager, before the tune', 60,
            big=(str(n0), 'processes', '#ffb020') if n0 else None)
    if has('start-menu', 'command-entered'):
        add(V('start-menu') - 0.3, V('command-entered') + 0.6, 1, cam('ps'), 'Now the one line: irm omnidx.net/go.ps1 | iex', 56)
    if 'uac-yes' in ev:
        add(V('uac-yes') - 1.0, V('uac-yes') + 0.8, 1, FULL, 'Windows asks. Yes')
    if has('uac-yes', 'app-read'):
        fast(V('uac-yes') + 0.8, V('app-read'), 2.4, FULL, 'It reads the PC before it changes anything', 56)
    if 'extreme-ticked' in ev:
        add(V('extreme-ticked') - 1.0, V('extreme-ticked') + 0.8, 1, cam('extreme'), 'Extreme')
    if has('key-pasted', 'run'):
        add(V('key-pasted') - 0.6, V('run') + 0.6, 1, FULL, 'Key in. Run.')
    if has('run', 'done'):
        fast(V('run') + 0.6, V('done') - 1.0, 3.6, FULL, 'A restore point first, then the cut', 58)
        add(V('done') - 1.0, V('done') + 1.4, 1, cam('result'), 'Done')
    if 'report' in ev:
        add(V('report') + 0.4, V('report') + 2.8, 1, FULL, 'And a report of every change, with the undo', 58)
    if has('restart', 'three-minutes'):
        r2 = after(V('restart'))
        if r2 and 'signed-in' in ev:
            fast(V('restart') - 0.5, r2 + 110, 2.4, FULL, 'Restart', 64)
            fast(max(V('signed-in'), r2 + 110), V('three-minutes'), 2.4, FULL, 'Signed in. Three minutes later', 58)
        else:
            fast(V('restart') - 0.5, V('three-minutes'), 3.0, FULL, 'Restart. Signed in. Three minutes later', 58)
    if 'after-restart-count' in ev:
        a = V('after-restart-count')
        add(a - 0.6, a + 3.0, 1, cam('tm_count'), 'Task Manager, after', 64,
            roll=([n0, n1], f'processes (was {n0})', '#35d07f') if n0 and n1 else None, lead=0.5)
        add(a + 3.0, a + 4.4, 1, cam('tm_count'), 'Would you run it?', 70)
    chapter('3 · The command', c0)

    edl = {'screen': [SW, SH], 'segments': segs, 'camera': camera, 'top': top, 'bottom': bottom, 'chapters': chapters,
           'note': NOTE, 'sources': {'install': os.path.abspath(install)}, 'bed': {'pops': pops, 'whoosh': whoosh},
           'punch': True, 'progress': True,
           'seconds': round(t, 1)}
    json.dump(edl, open(out, 'w'), indent=1)
    print(f'{len(segs)} parts, {t:.1f} s')


if __name__ == '__main__':
    main()
