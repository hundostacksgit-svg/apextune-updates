"""
The edit list for a filmed run through a restart (vm/director.py's
events.json): Task Manager before, the one line, Windows' administrator
prompt, the app, Run, the report, "Restart now", the boot, and Task Manager
three minutes after sign-in, the number that counts.

Real time for everything a person does, with the waits between cut out; the
long waits the machine does alone (reading the PC, the run, the boot, the
three minutes after sign-in) sped up, and labelled with their speed. A
number in the words is only on screen while the recording shows it.

    python3 tools/promo/film/plan_restart.py events.json take.json edl.json

take.json, all times in seconds of the recording:
  {"offset": 0.0,                          recording time = the director's clock + offset
   "screen": [1920, 1080],
   "skip": [[a, b], ...],                  waits cut out, inside the real-time stretches
   "before": {"n": 131, "at": [a, b]},      Task Manager's count before, and a stretch where it holds still
   "after":  {"n": 84, "at": [a, b]},       the same, three minutes after the sign-in that follows the restart
   "report": 812.4,                         when the report window appears
   "boxes": {"tm_count": [x, y, w, h], "ps": [...], "app_count": [...], "report": [...], "prompt": [...]},
   "run_seconds": 8}
"""
import json, sys


def main():
    events, take_path, out = sys.argv[1:4]
    take = json.load(open(take_path))
    SW, SH = take.get('screen', [1920, 1080])
    FULL = [0, 0, SW, SH]

    def fit(box, zoom_w):
        """A camera of the screen's shape, zoom_w wide, centred on box, kept inside the screen."""
        x, y, w, h = box
        cw = zoom_w; ch = cw * SH / SW
        cx = min(max(0, x + w / 2 - cw / 2), SW - cw)
        cy = min(max(0, y + h / 2 - ch / 2), SH - ch)
        return [round(cx), round(cy), round(cw), round(ch)]

    ev = {}
    for e in json.load(open(events, encoding='utf-8-sig')):
        ev.setdefault(e['what'], e)
    off = float(take.get('offset', 0))
    V = lambda k: ev[k]['t'] + off
    boxes = take.get('boxes', {})
    skips = sorted(take.get('skip', []))
    before, after = take['before'], take['after']
    report = float(take.get('report', V('done')))

    segs = []
    def stretch(a, b, speed=1):
        if speed == 1:
            for s0, s1 in skips:
                if a < s0 < b:
                    segs.append([a, s0, 1]); a = max(a, s1)
        if b > a: segs.append([a, b, speed])

    def sped(a, b, seconds):
        stretch(a, b, max(2, round((b - a) / seconds)))

    # The stretches, in order.
    stretch(V('task-manager-open') - 0.6, before['at'][1])                           # 1 Task Manager, before
    stretch(V('start-menu') - 0.3, V('command-entered') + 0.6)                       # 2 Start, powershell, the line
    stretch(V('command-entered') + 0.6, V('uac-yes') + 1.0)                          # 3 the prompt, Yes
    sped(V('uac-yes') + 1.0, V('app-read'), 3.5)                                     # 4 the app reads the PC
    stretch(V('app-read'), V('run') + 1.0)                                           # 5 the key, Run
    sped(V('run') + 1.0, report - 2.0, float(take.get('run_seconds', 8)))            # 6 the run
    stretch(report - 2.0, report + 4.0)                                              # 7 done, the report
    stretch(V('restart-asked') - 2.5, V('restart') + 1.0)                            # 8 Restart now, twice
    sped(V('restart') + 1.0, V('signed-in') + 2.0, 4.0)                              # 9 the boot and sign-in
    sped(V('signed-in') + 2.0, V('three-minutes'), 3.0)                              # 10 three minutes of Windows starting
    stretch(V('three-minutes'), after['at'][1])                                      # 11 Task Manager, after the restart

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
    zoom_count = lambda: fit(boxes['tm_count'], take.get('tm_zoom', 640))

    # 1. Task Manager, before.
    b0, b1 = before['at']
    hold(FULL, V('task-manager-open') - 0.6, b0 - 0.6)
    hold(zoom_count(), b0, b1)
    top.append({'from': 0, 'to': 3.8, 'text': 'Testing a $20 Windows optimizer on a clean Windows 11 PC', 'size': 66})
    say(b0 - 0.2, b1, 'Task Manager, before', 62)
    big(b0, b1, str(before['n']), 'processes running', '#ff6b7a')
    pops.append(round(O(b0), 2))

    # 2. The one line.
    s = V('start-menu') - 0.3
    whoosh.append(round(O(s), 2))
    hold(FULL, s, V('type-command') - 0.6)
    if 'ps' in boxes: hold(fit(boxes['ps'], take.get('ps_zoom', 1100)), V('type-command'), V('command-entered') + 0.6)
    say(s + 0.2, V('command-entered') + 0.6, 'One line in PowerShell')

    # 3. The prompt.
    hold(FULL, V('command-entered') + 0.6, V('uac-yes') + 1.0)
    say(V('command-entered') + 0.6, V('uac-yes') + 1.0, 'Windows asks first. Yes')

    # 4. The app reads the PC.
    hold(FULL, V('uac-yes') + 1.0, V('app-read'))
    say(V('uac-yes') + 1.0, V('app-read') + 2.4, 'It reads the PC first')

    # 5. The key, Run.
    if 'app_count' in boxes:
        hold(fit(boxes['app_count'], take.get('app_zoom', 900)), V('app-read'), V('app-read') + 2.2)
    hold(FULL, V('app-read') + 2.8, V('run') + 1.0)
    say(V('key-pasted') - 1.4, V('run') + 1.0, 'Key in. Run.')

    # 6. The run.
    hold(FULL, V('run') + 1.0, report - 2.0)
    say(V('run') + 1.0, report - 2.0, 'Restore point first. Then it cuts\nwhat this PC does not use', 58)

    # 7. Done, the report.
    say(report - 2.0, report, 'Done.')
    hold(FULL, report - 2.0, report + 0.4)
    if 'report' in boxes: hold(fit(boxes['report'], take.get('report_zoom', 1300)), report + 1.0, report + 4.0)
    say(report, report + 4.0, 'Its own report', 62)

    # 8. Restart now.
    whoosh.append(round(O(V('restart-asked') - 2.5), 2))
    hold(FULL, V('restart-asked') - 2.5, V('three-minutes') + 0.5)
    say(V('restart-asked') - 2.5, V('restart') + 1.0, 'Now the restart', 64)

    # 9, 10. The boot, the sign-in, three minutes.
    say(V('restart') + 1.0, V('signed-in') + 2.0, 'Restarting', 64)
    say(V('signed-in') + 2.0, V('three-minutes'), 'Signed in. Three minutes later', 60)

    # 11. Task Manager, after the restart.
    a0, a1 = after['at']
    whoosh.append(round(O(V('three-minutes')), 2))
    hold(zoom_count(), a0, a1)
    say(V('three-minutes'), a1, 'Task Manager, after the restart', 60)
    big(a0, a1, f"{before['n']} → {after['n']}", 'processes', '#35d07f')
    pops.append(round(O(a0), 2))

    cam.sort(key=lambda k: k['t'])
    edl = {'screen': [SW, SH],
           'segments': [{'from': round(a, 2), 'to': round(b, 2), 'speed': sp} for a, b, sp in segs],
           'camera': cam, 'top': top, 'bottom': bottom,
           'note': 'Real run on a clean Windows 11 test PC · omnidx.net', 'bed': {'pops': pops, 'whoosh': whoosh},
           'numbers': {'before': before['n'], 'after': after['n']}}
    json.dump(edl, open(out, 'w'), indent=1)
    print(f'{len(segs)} segments, {total:.1f} s; before {before["n"]}, after the restart {after["n"]}')
    for (a, b, sp), st in zip(segs, starts):
        print(f'  {st:6.2f}  {a:8.2f} -> {b:8.2f}  x{sp:g}')


if __name__ == '__main__':
    main()
