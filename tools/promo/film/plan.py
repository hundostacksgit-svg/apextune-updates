"""
The edit list for one filmed run, from the run's own events (film.ps1's
events.json) and a few facts read off the recording (take.json): which
stretches of the recording play, how fast, where the camera looks, and the
words.

Real time for everything a person does (the count before, the typing, the
key, the result, the count after), with the waits between them cut out; the
two long waits the machine does on its own (reading the PC, the run) sped up
and labelled with their speed. A number in the words is only on screen while
the recording shows that same number.

    python3 tools/promo/film/plan.py events.json take.json edl.json

take.json, all times in seconds of the recording:
  {"offset": 2.65,                       recording time = the script's clock + offset
   "skip": [[14.0, 19.8], ...],          waits cut out (jump cuts), inside the real-time stretches
   "before": {"n": 173, "at": [23.4, 25.3]},   Task Manager's count, and a stretch where it holds still
   "after":  {"n": 156, "at": [298.7, 301.7]},
   "report": 246.97,                     when the report window appears (else the "done" event)
   "boxes": {"tm_count": [x, y, w, h], "ps": [...], "app_count": [...], "report": [...]},
   "run_seconds": 9,                     how long the sped-up run lasts on screen
   "cursor": "cursor.csv"}               only for a recording where Windows did not draw the pointer
Boxes are on the 1024 x 768 screen, as found in the footage.
"""
import json, sys

FULL = [0, 0, 1024, 768]


def fit(box, zoom_w):
    """A 4:3 camera of width zoom_w centred on box, kept inside the screen."""
    x, y, w, h = box
    cw = zoom_w; ch = cw * 3 / 4
    cx = min(max(0, x + w / 2 - cw / 2), 1024 - cw)
    cy = min(max(0, y + h / 2 - ch / 2), 768 - ch)
    return [round(cx), round(cy), round(cw), round(ch)]


def main():
    events, take_path, out = sys.argv[1:4]
    take = json.load(open(take_path))
    ev = {}
    for e in json.load(open(events, encoding='utf-8-sig')):
        ev.setdefault(e['what'], e)
    off = float(take.get('offset', 0))
    V = lambda k: ev[k]['t'] + off
    boxes = take.get('boxes', {})
    skips = sorted(take.get('skip', []))
    before, after = take['before'], take['after']
    report = float(take.get('report', V('done')))

    # Segments in recording time; a real-time stretch loses the skipped waits inside it.
    segs = []
    def stretch(a, b, speed=1):
        if speed == 1:
            for s0, s1 in skips:
                if a < s0 < b:
                    segs.append([a, s0, 1]); a = max(a, s1)
        segs.append([a, b, speed])

    run_end = report - 2.0
    gap = V('app-read') - (V('command-entered') + 1.2)
    run_len = run_end - (V('run') + 1.0)
    stretch(V('task-manager-open') - 0.6, before['at'][1])
    stretch(V('start-menu') - 0.3, V('command-entered') + 1.2)
    stretch(V('command-entered') + 1.2, V('app-read'), max(2, round(gap / 3.8)))
    stretch(V('app-read'), V('run') + 1.0)
    stretch(V('run') + 1.0, run_end, max(2, round(run_len / float(take.get('run_seconds', 9)))))
    stretch(run_end, after['at'][1])

    # Output time for a recording time (a time inside a cut-out wait lands where the cut lands).
    starts, t = [], 0.0
    for a, b, sp in segs:
        starts.append(t); t += (b - a) / sp
    total = t
    def O(v):
        for (a, b, sp), s in zip(segs, starts):
            if v < a: return s
            if v <= b: return s + (v - a) / sp
        return total

    cam, top, bottom, pops, whoosh = [], [], [], [], []
    def hold(rect, v0, v1): cam.append({'t': round(O(v0), 2), 'rect': rect, 'hold': round(max(0.05, O(v1) - O(v0)), 2)})
    def say(v0, v1, text, size=64): top.append({'from': round(O(v0), 2), 'to': round(O(v1), 2), 'text': text, 'size': size})
    def big(v0, v1, n, text, color): bottom.append({'from': round(O(v0), 2), 'to': round(O(v1), 2), 'big': n, 'text': text, 'color': color})

    # 1. Task Manager, the number before.
    b0, b1 = before['at']
    hold(FULL, V('task-manager-open') - 0.6, b0 - 0.6)
    hold(fit(boxes['tm_count'], 380), b0, b1)
    top.append({'from': 0, 'to': 3.6, 'text': 'Testing a $20 Windows optimizer on a Windows 11 PC', 'size': 68})
    say(b0 - 0.2, b1, 'Task Manager, before', 62)
    big(b0, b1, str(before['n']), 'processes running', '#ff6b7a')
    pops.append(round(O(b0), 2))

    # 2. Start, "powershell", the line.
    s = V('start-menu') - 0.3
    whoosh.append(round(O(s), 2))
    hold(FULL, s, V('type-command') - 0.6)
    hold(fit(boxes['ps'], 600), V('type-command'), V('command-entered') + 1.2)
    say(s + 0.2, V('command-entered') + 1.2, 'One line in PowerShell')

    # 3. The script fetched, the app opens and reads the PC (sped up).
    hold(FULL, V('command-entered') + 1.2, V('app-read'))
    say(V('command-entered') + 1.2, V('app-read') + 2.6, 'It reads the PC first')

    # 4. The count in the app, the key, Run.
    hold(fit(boxes['app_count'], 480), V('app-read'), V('app-read') + 2.4)
    hold(FULL, V('app-read') + 3.0, V('run') + 1.0)
    say(V('key-pasted') - 1.4, V('run') + 1.0, 'Key in. Run.')

    # 5. The run (sped up).
    hold(FULL, V('run') + 1.0, run_end)
    say(V('run') + 1.0, run_end, 'Restore point first. Then it cuts what this PC does not use', 58)

    # 6. Done, and the report it opens by itself.
    say(run_end, report, 'Done.')
    hold(FULL, run_end, report + 0.4)
    if 'report' in boxes:
        hold(fit(boxes['report'], 700), report + 1.0, report + 3.6)
    say(report, V('task-manager-again') - 0.6, 'Its own report, straight after the run', 60)

    # 7. Task Manager again, the number after.
    a0, a1 = after['at']
    whoosh.append(round(O(V('task-manager-again') - 0.3), 2))
    hold(FULL, report + 4.2, a0 - 0.6)
    hold(fit(boxes['tm_count'], 380), a0, a1)
    say(V('task-manager-again') - 0.3, a1, 'Task Manager, after. No restart yet', 60)
    big(a0, a1, f"{before['n']} → {after['n']}", 'processes', '#35d07f')
    pops.append(round(O(a0), 2))

    cam.sort(key=lambda k: k['t'])
    edl = {'segments': [{'from': round(a, 2), 'to': round(b, 2), 'speed': sp} for a, b, sp in segs],
           'camera': cam, 'top': top, 'bottom': bottom,
           'note': 'Real run on a Windows 11 test PC · omnidx.net', 'bed': {'pops': pops, 'whoosh': whoosh},
           'numbers': {'before': before['n'], 'after': after['n']}}
    if take.get('cursor'):
        edl['cursor'] = {'csv': take['cursor'], 'video_offset': off}
    json.dump(edl, open(out, 'w'), indent=1)
    print(f'{len(segs)} segments, {total:.1f} s; before {before["n"]}, after {after["n"]}')
    for (a, b, sp), st in zip(segs, starts):
        print(f'  {st:6.2f}  {a:7.2f} -> {b:7.2f}  x{sp:g}')


if __name__ == '__main__':
    main()
