"""
Short cuts of the one command, from the filmed restart run (vm/director.py's events.json and the take.json that
plan_restart.py reads), rendered by edit.py like the restart video:

  command-01-30-seconds   Task Manager, the line, the run, the restart and Task Manager again, in half a minute
  command-02-one-line     all it takes: Start, PowerShell, the line, Windows' prompt, and the app reading the PC

    python3 tools/promo/film/plan_command.py events.json take.json outdir

Real time for what the person does; what the PC does alone sped up and labelled. A number is under the screen only
while the screen shows it.
"""
import json, os, sys

NOTE = 'Real run on a clean Windows 11 test PC · omnidx.net'


def main():
    events, take_path, outdir = sys.argv[1:4]
    take = json.load(open(take_path))
    SW, SH = take.get('screen', [1920, 1080])
    FULL = [0, 0, SW, SH]
    ev = {}
    for e in json.load(open(events, encoding='utf-8-sig')):
        ev.setdefault(e['what'], e)
    off = float(take.get('offset', 0))
    V = lambda k: ev[k]['t'] + off
    boxes = take.get('boxes', {})
    before, after = take['before'], take['after']
    done_at = float(take.get('done', V('done')))
    skips = sorted(take.get('skip', []))

    def fit(box, zoom_w):
        x, y, w, h = box
        cw = zoom_w; ch = cw * SH / SW
        cx = min(max(0, x + w / 2 - cw / 2), SW - cw); cy = min(max(0, y + h / 2 - ch / 2), SH - ch)
        return [round(cx), round(cy), round(cw), round(ch)]

    def video():
        v = {'segs': [], 'cam': [], 'top': [], 'bottom': [], 'pops': [], 'whoosh': [], 't': 0.0}

        def add(a, b, sp, rect, words=None, size=62, big=None, pop_at=0.3):
            # The take's waits are cut out of anything in real time (a wait inside a stretch splits it).
            parts = [[a, b]]
            if sp == 1:
                for s0, s1 in skips:
                    nxt = []
                    for x, y in parts:
                        if s1 <= x or s0 >= y: nxt.append([x, y]); continue
                        if x < s0: nxt.append([x, s0])
                        if s1 < y: nxt.append([s1, y])
                    parts = nxt
            parts = [p for p in parts if p[1] - p[0] > 0.05]
            if not parts: return
            d = sum(y - x for x, y in parts) / sp
            for x, y in parts: v['segs'].append({'from': round(x, 2), 'to': round(y, 2), 'speed': sp})
            v['cam'].append({'t': round(v['t'], 2), 'rect': rect, 'hold': round(max(0.05, d - 0.35), 2)})
            if words: v['top'].append({'from': round(v['t'], 2), 'to': round(v['t'] + d, 2), 'text': words, 'size': size})
            if big:
                v['bottom'].append({'from': round(v['t'] + pop_at, 2), 'to': round(v['t'] + d, 2), 'big': big[0], 'text': big[1], 'color': big[2]})
                v['pops'].append(round(v['t'] + pop_at, 2))
            if v['t'] > 0: v['whoosh'].append(round(v['t'], 2))
            v['t'] += d
        v['add'] = add
        return v

    def fast(v, a, b, seconds, words, size=58):
        v['add'](a, b, max(2, round((b - a) / seconds)), FULL, words, size)

    def edl(v):
        return {'screen': [SW, SH], 'segments': v['segs'], 'camera': v['cam'], 'top': v['top'], 'bottom': v['bottom'],
                'note': NOTE, 'bed': {'pops': v['pops'], 'whoosh': v['whoosh']}, 'seconds': round(v['t'], 1)}

    zoom_count = fit(boxes['tm_count'], take.get('tm_zoom', 600))
    out = {}

    # 1. Half a minute, all of it.
    v = video(); add = v['add']
    b0, b1 = before['at']
    add(b0, b1, 1, zoom_count, 'A clean Windows 11 PC. Task Manager:', 60, (str(before['n']), 'processes', '#ff6b7a'), 0.4)
    add(V('type-command') - 0.4, V('command-entered') + 0.6, 1, fit(boxes['ps'], take.get('ps_zoom', 1100)), 'One line in PowerShell')
    add(V('uac-yes') - 0.8, V('uac-yes') + 0.8, 1, FULL, 'Windows asks. Yes')
    fast(v, V('uac-yes') + 0.8, V('app-read'), 1.8, 'It reads the PC first')
    if 'extreme-ticked' in ev and 'extreme' in boxes:
        add(V('extreme-ticked') - 1.0, V('extreme-ticked') + 0.9, 1, fit(boxes['extreme'], take.get('extreme_zoom', 1300)), 'Extreme mode on')
    add(V('key-pasted') - 0.6, V('run') + 0.8, 1, FULL, 'Key in. Run.')
    fast(v, V('run') + 0.8, done_at - 1.0, 3.2, 'Restore point first, then the cut')
    add(done_at - 1.0, done_at + 1.2, 1, fit(boxes['result'], take.get('result_zoom', 800)) if 'result' in boxes else FULL, 'Done')
    fast(v, V('restart') - 0.5, V('three-minutes'), 3.0, 'Restart. Signed in. Three minutes later')
    a0, a1 = after['at']
    add(a0 - 0.6, a1, 1, zoom_count, 'Task Manager, after the restart', 60, (f"{before['n']} → {after['n']}", 'processes', '#35d07f'), 0.9)
    out['command-01-30-seconds'] = edl(v)

    # 2. The one line, and what happens first.
    v = video(); add = v['add']
    add(V('start-menu') - 0.3, V('type-command') - 0.4, 1, FULL, 'All it takes is one line', 66)
    add(V('type-command') - 0.4, V('command-entered') + 0.8, 1, fit(boxes['ps'], take.get('ps_zoom', 1100)), 'irm omnidx.net/go.ps1 | iex', 60)
    add(V('uac-yes') - 1.2, V('uac-yes') + 0.8, 1, FULL, 'Windows asks first. Yes')
    fast(v, V('uac-yes') + 0.8, V('app-read'), 3.5, 'Nothing changes yet: it reads the PC first')
    add(V('app-read'), V('key-pasted') - 0.3, 1, FULL, 'You choose what it does. The undo is one file', 58)
    out['command-02-one-line'] = edl(v)

    os.makedirs(outdir, exist_ok=True)
    for name, e in out.items():
        json.dump(e, open(os.path.join(outdir, name + '.json'), 'w'), indent=1)
        print(f"{name}: {len(e['segments'])} parts, {e['seconds']} s")


if __name__ == '__main__':
    main()
