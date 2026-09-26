"""
The OmniDx Edition series: short vertical videos cut from one recording of OmniDx Edition on a clean Windows 11 PC
(vm/director.py --edition: its screen.mkv and events.json), one thing each, rendered by edit.py like the restart
video: the PC's own screen in the middle, the words above it, the speed on anything sped up.

    python3 tools/promo/film/plan_edition.py events.json take.json outdir [--only name,name]

Writes outdir/<name>.json, one edit list per video; then, for each:

    python3 tools/promo/film/edit.py outdir/<name>.json screen.mkv <name>.mp4

take.json, read off this take's pictures (times are the director's clock unless "offset" says otherwise):
  {"offset": 0.0,
   "at_rest": 67,                  Task Manager's process count at "edition-count" (as it reads on screen)
   "boxes": {"hub": [x, y, w, h], "timer": [...], "search": [...], "browser": [...], "tm": [...], "tm_count": [...],
             "tabs": [...], "about": [...]}}

Real time for everything the person does, the waits between steps cut; setup, the tune and the restarts sped up and
labelled with their speed. A number sits under the screen only while the screen shows it.
"""
import argparse, json

SW, SH = 1920, 1080
FULL = [0, 0, SW, SH]
NOTE = 'Real run on a clean Windows 11 test PC · omnidx.net'

# What each step of the director's look round shows: (lead before its mark, time after it, words, box to zoom on).
# The mark comes just after the step's picture, so the action itself is in the lead.
STEPS = {
    'e01-welcome':         (3.5, 0.6, 'First sign-in: OmniDx Edition says hello', 'hub'),
    'e02-hub-home':        (4.4, 0.8, 'OmniDx Hub: the PC, live', 'hub'),
    'e03-hub-presets':     (2.6, 0.8, 'Balanced. Competitive. Insane.', 'hub'),
    'e04-hub-games':       (2.6, 0.6, 'Your games, found by themselves', 'hub'),
    'e05-hub-tune':        (2.6, 0.6, 'The OmniDx tune, built in', 'hub'),
    'e06-hub-about':       (2.6, 0.8, 'Take it all off: one button', 'hub'),
    'e07-desktop':         (1.8, 0.4, 'The taskbar on the left', None),
    'e08-start':           (2.2, 0.5, 'Start, in OmniDx violet', None),
    'e09-search':          (2.0, 0.5, 'Windows + S: OmniDx Search', 'search'),
    'e10-search-display':  (1.8, 0.8, 'Settings, by the words you use', 'search'),
    'e11-search-sum':      (2.0, 0.8, 'Sums as you type', 'search'),
    'e12-search-boost':    (2.6, 0.8, 'Type "boost". Game Boost is on', 'search'),
    'e13-browser-newtab':  (5.8, 0.6, 'Its own browser. The new tab loads nothing', 'browser'),
    'e14-browser-omnidx':  (8.6, 0.6, 'Trackers blocked. Tabs sleep while you play', 'browser'),
    'e15-browser-youtube': (10.8, 0.6, 'Ctrl + T: tabs in the title bar', 'browser'),
    'e16-hub-boost':       (3.6, 0.3, 'Game Boost on: the system timer at 1 ms', 'timer'),
    'e18-settings-about':  (6.0, 0.8, 'Settings > About: OmniDx Edition', 'about'),
    'e19-lock':            (4.4, 0.4, 'The lock screen', None),
    'e20-sign-in':         (3.4, 0.4, 'The sign-in', None),
    'e21-back':            (2.6, 0.6, 'Back in', None),
}

# How wide the camera is on each kind of window (it never gets narrower than the window itself).
ZOOM = {'hub': 1150, 'search': 760, 'browser': 1400, 'timer': 700, 'tm': 820, 'tm_count': 640, 'about': 1300}

# Between marks: (from this mark + a, to that mark - b, words, box). The search opening the browser, for one: the
# letters and Enter only, not the seconds the browser takes to start on this virtual PC.
BETWEEN = {
    'search-apps': ('e12-search-boost', 1.0, 'e12-search-boost', -3.9, 'Apps too: a few letters, Enter', 'search'),
}

# The series. Each: file name, the opening words (over the first step), the steps in order. A step is a name, or
# (name, words, box) to say it differently or look closer.
SERIES = [
    ('edition-01-my-own-os', 'I set Windows 11 up as my own gaming OS',
     ['setup', 'e01-welcome', 'e07-desktop', 'e08-start', 'e09-search', 'e13-browser-newtab', 'e16-hub-boost', 'e19-lock', 'count']),
    ('edition-02-search', 'I replaced Windows search. Windows + S is mine now',
     ['e09-search', 'e10-search-display', 'e11-search-sum', 'e12-search-boost', 'search-apps', ('e13-browser-newtab', 'Opened in OmniDx Browser', 'browser')]),
    ('edition-03-browser', 'A browser that runs nothing in the background',
     ['e13-browser-newtab', 'e14-browser-omnidx', 'e15-browser-youtube']),
    ('edition-04-game-boost', 'Game Boost: what a game gets the moment it opens',
     [('e02-hub-home', "Windows' own system timer: 15.6 ms", 'timer'), ('e12-search-boost', 'Game Boost on (it also turns on by itself in a game)', 'search'),
      ('e16-hub-boost', 'Now 1 ms, the performance plan, background tabs asleep', 'timer')]),
    ('edition-05-hub', 'One app for everything: OmniDx Hub',
     ['e01-welcome', 'e02-hub-home', 'e03-hub-presets', 'e04-hub-games', 'e05-hub-tune', 'e06-hub-about']),
    ('edition-06-install', 'Clean Windows 11 to OmniDx Edition. One restart',
     ['setup', 'tune', 'e01-welcome', 'e07-desktop', 'e08-start']),
    ('edition-07-processes', 'How many processes does my gaming OS run?',
     ['e07-desktop', 'count']),
    ('edition-08-the-look', 'Genuine Windows. Nothing of it looks stock',
     ['e07-desktop', 'e08-start', 'e18-settings-about', 'e19-lock', 'e20-sign-in', 'e21-back']),
]


def fit(box, zoom_w):
    """A camera of the screen's shape, zoom_w wide, centred on box, kept inside the screen."""
    x, y, w, h = box
    cw = max(zoom_w, w * 1.08, h * 1.08 * SW / SH); cw = min(cw, SW); ch = cw * SH / SW
    cx = min(max(0, x + w / 2 - cw / 2), SW - cw)
    cy = min(max(0, y + h / 2 - ch / 2), SH - ch)
    return [round(cx), round(cy), round(cw), round(ch)]


def plan(name, title, steps, ev, take):
    off = float(take.get('offset', 0))
    boxes = take.get('boxes', {})
    V = lambda k: ev[k]['t'] + off
    segs, cam, top, bottom, pops, whoosh = [], [], [], [], [], []
    t = 0.0

    def add(a, b, sp, rect, words, size=62, big=None):
        nonlocal t
        if b <= a: return
        d = (b - a) / sp
        segs.append({'from': round(a, 2), 'to': round(b, 2), 'speed': sp})
        cam.append({'t': round(t, 2), 'rect': rect, 'hold': round(max(0.05, d - 0.45), 2)})
        if words: top.append({'from': round(t, 2), 'to': round(t + d, 2), 'text': words, 'size': size})
        if big:
            lead = min(d * 0.35, 1.6)
            bottom.append({'from': round(t + lead, 2), 'to': round(t + d, 2), 'big': big[0], 'text': big[1], 'color': big[2]})
            pops.append(round(t + lead, 2))
        whoosh.append(round(t, 2))
        t += d

    def sped(a, b, seconds, words):
        sp = max(2, round((b - a) / seconds))
        add(a, b, sp, FULL, words, 58)

    tune_after = 'restarted' in ev and 'welcome' in ev and V('welcome') - V('restarted') > 90
    for i, s in enumerate(steps):
        over = None
        if isinstance(s, (tuple, list)): s, over = s[0], (s[1], s[2])
        if s == 'setup':
            if 'setup-running' not in ev or 'restarted' not in ev: continue
            sped(V('setup-running') + 1.0, V('restarted') + (2.0 if tune_after else 12.0), 7.0,
                 'Setup runs by itself at the first sign-in' if i else title)
        elif s == 'tune':
            if not tune_after: continue
            sped(V('restarted') + 2.0, V('welcome') + 1.0, 8.0, 'Then the OmniDx tune in Extreme, and a restart')
        elif s == 'count':
            if 'edition-count' not in ev: continue
            c = V('edition-count')
            n = take.get('at_rest')
            zoom = fit(boxes['tm_count'], ZOOM['tm_count']) if 'tm_count' in boxes else FULL
            add(c - 6.0, c - 2.2, 1, fit(boxes['tm'], ZOOM['tm']) if 'tm' in boxes else FULL, 'Task Manager, at rest')
            add(c - 2.2, c + 4.2, 1, zoom, 'Task Manager, at rest',
                big=(str(n), 'processes' + (' (the target: 80 or fewer)' if n and n <= 80 else ''), '#35d07f' if n and n <= 80 else '#ffb020') if n else None)
        elif s in BETWEEN:
            m0, da, m1, db, words, box = BETWEEN[s]
            if m0 in ev and m1 in ev:
                add(V(m0) + da, V(m1) - db, 1, fit(boxes[box], ZOOM.get(box, 1180)) if box in boxes else FULL, words)
        elif s in STEPS and s in ev:
            lead, tail, words, box = STEPS[s]
            if over: words, box = over
            if i == 0: words = title
            a, b = V(s) - lead, V(s) + tail
            rect = fit(boxes[box], ZOOM.get(box, 1180)) if box and box in boxes else FULL
            add(a, b, 1, rect, words, 64 if i else 66)

    return {'screen': [SW, SH], 'segments': segs, 'camera': cam, 'top': top, 'bottom': bottom,
            'note': NOTE, 'bed': {'pops': pops, 'whoosh': whoosh[1:]}, 'seconds': round(t, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('events'); ap.add_argument('take'); ap.add_argument('outdir')
    ap.add_argument('--only', default='')
    A = ap.parse_args()
    ev = {}
    for e in json.load(open(A.events, encoding='utf-8-sig')):
        ev.setdefault(e['what'], e)
    take = json.load(open(A.take))
    only = set(x for x in A.only.split(',') if x)
    import os
    os.makedirs(A.outdir, exist_ok=True)
    for name, title, steps in SERIES:
        if only and name not in only: continue
        edl = plan(name, title, steps, ev, take)
        if not edl['segments']: print(f'{name}: nothing in this take'); continue
        json.dump(edl, open(os.path.join(A.outdir, name + '.json'), 'w'), indent=1)
        print(f"{name}: {len(edl['segments'])} parts, {edl['seconds']} s")


if __name__ == '__main__':
    main()
