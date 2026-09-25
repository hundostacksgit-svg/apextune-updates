"""
The edit list for one filmed run, from the run's own events (film.ps1's
events.json): which stretches of the recording play, how fast, where the
camera looks, and the words. Real time for everything a person does (the
count before, the typing, the key, the result, the count after); the run
itself sped up to fit, and labelled with its speed. Numbers on screen are
the ones the run recorded.

    python3 tools/promo/film/plan.py events.json edl.json [--offset 0.0] [--boxes boxes.json]

--offset: seconds between the script's clock and the recording's first frame.
--boxes: where things are on the 1024 x 768 screen, as found in the footage:
  {"tm_count": [x, y, w, h], "app_count": [...], "log": [...], "result": [...], "ps": [...]}
"""
import json, argparse

FULL = [0, 0, 1024, 768]


def fit(box, zoom_w):
    """A 4:3 camera of width zoom_w centred on box, kept inside the screen."""
    x, y, w, h = box
    cw = zoom_w; ch = cw * 3 / 4
    cx = min(max(0, x + w / 2 - cw / 2), 1024 - cw)
    cy = min(max(0, y + h / 2 - ch / 2), 768 - ch)
    return [round(cx), round(cy), round(cw), round(ch)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('events'); ap.add_argument('out')
    ap.add_argument('--offset', type=float, default=0.0)
    ap.add_argument('--boxes', default='')
    ap.add_argument('--run-seconds', type=float, default=9.0, help='how long the sped-up run lasts on screen')
    a = ap.parse_args()
    ev = {}
    for e in json.load(open(a.events, encoding='utf-8-sig')):
        ev.setdefault(e['what'], e)
    T = lambda k: ev[k]['t'] - a.offset
    boxes = json.load(open(a.boxes)) if a.boxes else {}

    before = ev['before-count']['processes']
    after = ev.get('after-count', ev.get('end'))['processes']
    segs, cam, top, bottom, pops, whoosh = [], [], [], [], [], []
    t = 0.0

    def seg(frm, to, speed=1.0):
        nonlocal t
        start = t
        segs.append({'from': round(frm, 2), 'to': round(to, 2), 'speed': round(speed, 2)})
        t += (to - frm) / speed
        return start, t

    # 1. Task Manager, the number before (real time).
    s0, s1 = seg(T('task-manager-open') - 0.6, T('before-count') + 3.0)
    cam.append({'t': 0, 'rect': FULL, 'hold': max(0.1, T('before-count') - T('task-manager-open') - 0.2)})
    if 'tm_count' in boxes:
        cam.append({'t': s1 - 3.2, 'rect': fit(boxes['tm_count'], 420), 'hold': 2.6})
    top.append({'from': 0, 'to': 3.6, 'text': 'Testing a $20 Windows optimizer on a Windows 11 PC', 'size': 68})
    top.append({'from': s1 - 3.4, 'to': s1, 'text': 'Task Manager, before', 'size': 62})
    bottom.append({'from': s1 - 3.2, 'to': s1, 'big': str(before), 'text': 'processes running', 'color': '#ff6b7a'})
    pops.append(round(s1 - 3.2, 2))

    # 2. Start, "powershell", the line (real time: the typing is the point).
    s0, s1 = seg(T('start-menu') - 0.3, T('command-entered') + 1.2)
    whoosh.append(round(s0, 2))
    cam.append({'t': s0, 'rect': FULL, 'hold': 0.1})
    if 'ps' in boxes:
        cam.append({'t': s0 + (T('type-command') - T('start-menu')) - 0.4, 'rect': fit(boxes['ps'], 640), 'hold': (T('command-entered') - T('type-command')) + 1.0})
    top.append({'from': s0 + 0.2, 'to': s1, 'text': 'One line in PowerShell', 'size': 64})

    # 3. The script fetched, the app opens and reads the PC (sped up).
    gap = T('app-read') - (T('command-entered') + 1.2)
    sp = max(1.0, round(gap / 3.5, 1))
    s0, s1 = seg(T('command-entered') + 1.2, T('app-read'), sp)
    cam.append({'t': s0, 'rect': FULL, 'hold': s1 - s0})
    top.append({'from': s0, 'to': s1 + 2.4, 'text': 'It reads the PC first', 'size': 64})

    # 4. The count in the app, the key, Run (real time).
    s0, s1 = seg(T('app-read'), T('run') + 1.0)
    if 'app_count' in boxes:
        cam.append({'t': s0, 'rect': fit(boxes['app_count'], 520), 'hold': 2.2})
    cam.append({'t': s0 + 3.0, 'rect': FULL, 'hold': 0.1})
    top.append({'from': s1 - (T('run') + 1.0 - T('key-pasted')) - 0.6, 'to': s1, 'text': 'Key in. Run.', 'size': 64})

    # 5. The run, sped up to fit.
    run_len = T('done') - (T('run') + 1.0)
    sp = max(1.0, round(run_len / a.run_seconds))
    s0, s1 = seg(T('run') + 1.0, T('done'), sp)
    if 'log' in boxes:
        cam.append({'t': s0 + 0.6, 'rect': fit(boxes['log'], 760), 'hold': max(0.1, s1 - s0 - 1.2)})
    top.append({'from': s0, 'to': s1, 'text': 'Restore point first. Then it cuts what this PC does not use', 'size': 58})

    # 6. The result line (real time).
    s0, s1 = seg(T('done'), T('done') + 4.2)
    if 'result' in boxes:
        cam.append({'t': s0 + 0.3, 'rect': fit(boxes['result'], 560), 'hold': 3.4})
    top.append({'from': s0, 'to': s1, 'text': 'Done. Its own count, right after the run', 'size': 60})

    # 7. Task Manager again, the number after (real time).
    s0, s1 = seg(T('task-manager-again') - 0.3, T('after-count') + 3.5)
    whoosh.append(round(s0, 2))
    cam.append({'t': s0, 'rect': FULL, 'hold': max(0.1, T('after-count') - T('task-manager-again'))})
    if 'tm_count' in boxes:
        cam.append({'t': s1 - 3.4, 'rect': fit(boxes['tm_count'], 420), 'hold': 3.0})
    top.append({'from': s1 - 3.6, 'to': s1, 'text': 'Task Manager, after. No restart yet', 'size': 60})
    bottom.append({'from': s1 - 3.4, 'to': s1, 'big': f'{before} → {after}', 'text': 'processes', 'color': '#35d07f'})
    pops.append(round(s1 - 3.4, 2))

    edl = {'segments': segs, 'camera': cam, 'top': top, 'bottom': bottom,
           'note': 'Real run on a Windows 11 test PC · omnidx.net', 'bed': {'pops': pops, 'whoosh': whoosh},
           'numbers': {'before': before, 'after': after}}
    json.dump(edl, open(a.out, 'w'), indent=1)
    print(f'{len(segs)} segments, {t:.1f} s; before {before}, after {after}')


if __name__ == '__main__':
    main()
