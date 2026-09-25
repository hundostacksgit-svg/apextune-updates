"""
Uses the test PC the way a person at its desk does, from outside it: the
mouse and keyboard are the virtual machine's own USB tablet and keyboard,
driven through QEMU's control socket (QMP) along human paths and rhythms
(the same model as ../Human.cs). Because the input is hardware input, it
reaches everything a person's hands reach, including Windows' administrator
prompt (UAC) on its secure desktop, which it answers Yes as a person does.

The recording is made here too, of the machine's screen, so it runs on
through the restart: Task Manager before, the one line, the app, the key,
Run, the report, Task Manager with no restart, "Restart now", the boot, the
sign-in, and Task Manager again three minutes after sign-in, when the tune's
own after-restart count is also taken.

agent.ps1 inside the PC answers where things are on screen (UI Automation);
it never clicks or types.

    python3 director.py --qmp qmp.sock --out DIR --key KEY [--extreme] [--display :99]
"""
import argparse, json, math, os, random, socket, subprocess, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

A = None  # arguments
LOG = None
T0 = None  # monotonic time of the recording's start
EVENTS = []


def note(t):
    line = time.strftime('%H:%M:%S') + f'.{int(time.time() * 1000) % 1000:03d} ' + t
    print(line, flush=True)
    LOG.write(line + '\n'); LOG.flush()


# ------------------------------------------------------------------ QMP
class QMP:
    def __init__(self, path):
        for _ in range(300):
            try:
                self.s = socket.socket(socket.AF_UNIX); self.s.connect(path); break
            except OSError:
                time.sleep(1)
        self.f = self.s.makefile('rw')
        self.lock = threading.Lock()
        json.loads(self.f.readline())
        self.cmd('qmp_capabilities')

    def cmd(self, execute, **args):
        with self.lock:
            self.f.write(json.dumps({'execute': execute, 'arguments': args} if args else {'execute': execute}) + '\n'); self.f.flush()
            while True:
                r = json.loads(self.f.readline())
                if 'return' in r: return r['return']
                if 'error' in r: raise RuntimeError(f"{execute}: {r['error']}")


Q = None
W, H = 1920, 1080
POS = [W // 2, H // 2]


def gauss(): return random.gauss(0, 1)


def _abs(x, y):
    return [{'type': 'abs', 'data': {'axis': 'x', 'value': int(round(max(0, min(W - 1, x)) * 32767 / (W - 1)))}},
            {'type': 'abs', 'data': {'axis': 'y', 'value': int(round(max(0, min(H - 1, y)) * 32767 / (H - 1)))}}]


def set_pos(x, y):
    POS[0], POS[1] = int(round(x)), int(round(y))
    Q.cmd('input-send-event', events=_abs(*POS))


def move_to(x, y, ms=0):
    """A bent path, fast in the middle, a small overshoot on long moves, then settle."""
    ax, ay = POS
    dx, dy = x - ax, y - ay
    dist = math.hypot(dx, dy)
    if dist < 2: return
    if ms <= 0: ms = int(260 + 110 * math.log(1 + dist / 18) + random.randint(0, 90))
    side = random.choice((-1, 1)) * dist * (0.08 + 0.12 * random.random())
    cx, cy = ax + dx * 0.45 - dy / dist * side, ay + dy * 0.45 + dx / dist * side
    over = dist > 250
    ox = x + (dx / dist * (4 + random.randint(0, 8)) if over else 0)
    oy = y + (dy / dist * (3 + random.randint(0, 6)) if over else 0)
    steps = max(8, ms // 8)
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * t * (10 - 15 * t + 6 * t * t)
        bx = (1 - e) ** 2 * ax + 2 * (1 - e) * e * cx + e * e * ox
        by = (1 - e) ** 2 * ay + 2 * (1 - e) * e * cy + e * e * oy
        shake = (1 - t) * 0.6
        set_pos(bx + gauss() * shake, by + gauss() * shake)
        time.sleep(0.008)
    if over:
        time.sleep(0.04 + random.random() * 0.05)
        bx0, by0 = POS; n = 10 + random.randint(0, 5)
        for i in range(1, n + 1):
            e = 1 - (1 - i / n) ** 3
            set_pos(bx0 + (x - bx0) * e, by0 + (y - by0) * e); time.sleep(0.01)
    set_pos(x, y)


def nudge():
    """A pixel there and back: enough for Windows to count the PC as in use, and keep the screen on."""
    x, y = POS
    set_pos(x + 1, y); time.sleep(0.05); set_pos(x, y)


def drift(sec):
    """The hand resting on the mouse while reading: a few pixels of wander."""
    ax, ay = POS; px = py = 0.0
    for _ in range(int(sec / 0.016)):
        px = (px + gauss() * 0.35) * 0.96; py = (py + gauss() * 0.3) * 0.96
        Q.cmd('input-send-event', events=_abs(ax + round(px * 3), ay + round(py * 3)))
        time.sleep(0.016)
    POS[0], POS[1] = ax, ay


def button(name, down): Q.cmd('input-send-event', events=[{'type': 'btn', 'data': {'down': down, 'button': name}}])


def click():
    button('left', True); time.sleep(0.055 + random.random() * 0.06); button('left', False)


def click_at(x, y):
    move_to(x, y); time.sleep(0.09 + random.random() * 0.14); click()


def double_click_at(x, y):
    move_to(x, y); time.sleep(0.12 + random.random() * 0.12); click(); time.sleep(0.07 + random.random() * 0.04); click()


def wheel(notches):
    for _ in range(abs(notches)):
        b = 'wheel-down' if notches < 0 else 'wheel-up'
        button(b, True); button(b, False); time.sleep(0.045 + random.random() * 0.06)


def key(code, down): Q.cmd('input-send-event', events=[{'type': 'key', 'data': {'down': down, 'key': {'type': 'qcode', 'data': code}}}])


def press(*codes):
    for c in codes: key(c, True); time.sleep(0.028 + random.random() * 0.03)
    for c in reversed(codes): key(c, False); time.sleep(0.018 + random.random() * 0.02)


PLAIN = {' ': 'spc', '.': 'dot', '/': 'slash', '-': 'minus', '=': 'equal', ';': 'semicolon', "'": 'apostrophe', ',': 'comma', '\\': 'backslash'}
SHIFTED = {'|': 'backslash', ':': 'semicolon', '_': 'minus', '$': '4', '"': 'apostrophe', '?': 'slash', '!': '1', '*': '8', '+': 'equal', '(': '9', ')': '0', '>': 'dot'}


def char(c):
    if c.isalpha(): return press('shift', c.lower()) if c.isupper() else press(c)
    if c.isdigit(): return press(c)
    if c in PLAIN: return press(PLAIN[c])
    if c in SHIFTED: return press('shift', SHIFTED[c])
    raise ValueError(c)


def type_text(text, pace=1.0, slip_after=None):
    """Like a person who knows the line: bursts, a beat after spaces and symbols, now and then a slip put right."""
    slip_at = text.index(slip_after) + len(slip_after) if slip_after else -1
    for i, c in enumerate(text):
        if i == slip_at:
            char('z'); time.sleep(0.42 * pace); press('backspace'); time.sleep(0.14 * pace)
        char(c)
        d = 70 + abs(gauss()) * 55
        if c == ' ': d += 60 + random.randint(0, 90)
        if c in "|./-'$=;": d += 90 + random.randint(0, 120)
        if i > 0 and c.isalpha() and text[i - 1].isalpha() and random.random() < 0.35: d *= 0.6
        time.sleep(d * pace / 1000)


def pause(a, b): time.sleep(random.uniform(a, b))


# ------------------------------------------------------------------ the agent inside the PC
class Agent:
    def __init__(self):
        self.cv = threading.Condition()
        self.queue = []  # (id, command)
        self.results = {}
        self.next_id = 1
        self.boot = None; self.boots = []; self.seen = 0.0

    def ask(self, op, timeout=25, **kw):
        with self.cv:
            i = self.next_id; self.next_id += 1
            self.queue.append((i, dict(kw, qid=i, op=op))); self.cv.notify_all()
            end = time.time() + timeout
            while i not in self.results:
                left = end - time.time()
                if left <= 0: return None
                self.cv.wait(left)
            return self.results.pop(i)

    def wait_boot(self, not_this=None, timeout=3600):
        end = time.time() + timeout
        with self.cv:
            while (self.boot is None or self.boot == not_this) and time.time() < end:
                self.cv.wait(5)
            return self.boot if self.boot != not_this else None


AG = Agent()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body=b'', ctype='application/json'):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers()
        if body: self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path != '/next': return self._send(404)
        after = int(q.get('after', ['0'])[0]); boot = q.get('boot', [''])[0]
        with AG.cv:
            AG.seen = time.time()
            if boot and boot != AG.boot:
                AG.boot = boot; AG.boots.append(boot); AG.cv.notify_all()
                note(f'agent: signed in (boot {boot})')
            end = time.time() + 15
            while True:
                cmd = next((c for i, c in AG.queue if i > after), None)
                if cmd or time.time() >= end: break
                AG.cv.wait(end - time.time())
            if cmd: AG.queue = [(i, c) for i, c in AG.queue if i != cmd['qid']]
        self._send(200, json.dumps(cmd or {}).encode())

    def do_POST(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        n = int(self.headers.get('Content-Length') or 0); body = self.rfile.read(n)
        if u.path == '/done':
            d = json.loads(body.decode('utf-8-sig'))
            with AG.cv: AG.results[int(d['qid'])] = d.get('result'); AG.cv.notify_all()
            return self._send(200, b'{}')
        if u.path == '/upload':
            name = os.path.basename(q.get('name', ['file'])[0])
            os.makedirs(os.path.join(A.out, 'guest'), exist_ok=True)
            open(os.path.join(A.out, 'guest', name), 'wb').write(body)
            return self._send(200, b'{}')
        self._send(404)


def find(like, id='', name='', pick='', timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        r = AG.ask('find', like=like, id=id, name=name, pick=pick)
        if r and r.get('w'): return r
        time.sleep(0.3)
    return None


def win(like, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        r = AG.ask('win', like=like)
        if r and r.get('w'): return r
        time.sleep(0.4)
    return None


def mid(r, fx=0.5, fy=0.5): return int(r['x'] + r['w'] * fx), int(r['y'] + r['h'] * fy)


def procs():
    r = AG.ask('procs'); return r.get('n') if r else None


def mark(what, **extra):
    t = round(time.monotonic() - T0, 2) if T0 else 0
    e = {'t': t, 'what': what, 'processes': procs(), 'wall': time.time()}
    e.update(extra); EVENTS.append(e)
    note(f'[{t:7.2f}] {what} processes {e["processes"]} {json.dumps(extra) if extra else ""}')
    json.dump(EVENTS, open(os.path.join(A.out, 'events.json'), 'w'), indent=1)


def shot(name):
    try: Q.cmd('screendump', filename=os.path.join(A.out, name), format='png')
    except Exception as ex: note(f'screendump {name}: {ex}')


# ------------------------------------------------------------------ the administrator prompt
def _luma_outside_middle(im):
    """Mean brightness of the screen outside its middle, where the prompt sits."""
    g = im.convert('L').resize((96, 54)); px = g.load(); tot = n = 0
    for y in range(54):
        for x in range(96):
            if 24 <= x < 72 and 12 <= y < 46: continue
            tot += px[x, y]; n += 1
    return tot / max(1, n)


def uac_yes(baseline, timeout=25):
    """The administrator prompt, answered Yes with the mouse, as the person running the tune does.
    Windows shows it with the screen dimmed behind it; its accent-coloured (default) button is No, and
    Yes is the plain button of the same size to its left. The accent button is found on a screenshot once
    the screen has dimmed (so the blue wallpaper is never taken for it), and Yes clicked beside it."""
    from PIL import Image
    base = _luma_outside_middle(Image.open(baseline))
    end = time.time() + timeout; n = 0
    while time.time() < end:
        path = os.path.join(A.out, 'uac.png'); shot('uac.png'); n += 1
        try: im = Image.open(path).convert('RGB')
        except Exception: time.sleep(0.5); continue
        dim = _luma_outside_middle(im)
        if base > 8 and dim > base * 0.8:
            time.sleep(0.4); continue
        w, h = im.size
        box = (int(w * 0.25), int(h * 0.25), int(w * 0.75), int(h * 0.95))
        crop = im.crop(box).resize(((box[2] - box[0]) // 2, (box[3] - box[1]) // 2))
        px = crop.load(); xs, ys = [], []
        for yy in range(crop.height):
            for xx in range(crop.width):
                r, g, b = px[xx, yy]
                if b > 150 and b - r > 90 and b - g > 40 and g > 60: xs.append(xx); ys.append(yy)
        note(f'prompt look {n}: brightness {dim:.0f} (before {base:.0f}), {len(xs)} accent pixels')
        if len(xs) > 300:
            # The accent button (No) is the widest solid run of accent colour; the link and the icon above
            # it are accent-coloured too, but thin. Its row, then its edges, back in screen pixels.
            rows = {}
            for xx, yy in zip(xs, ys): rows.setdefault(yy, []).append(xx)
            yy = max(rows, key=lambda k: len(rows[k]))
            run, best, prev = [], [], None
            for xx in sorted(rows[yy]):
                run = run + [xx] if prev is not None and xx - prev <= 2 else [xx]
                if len(run) > len(best): best = run
                prev = xx
            left, right = box[0] + best[0] * 2, box[0] + best[-1] * 2
            cy = box[1] + yy * 2
            bw = right - left
            yes_x = left - 12 - bw // 2
            r, g, b = im.getpixel((yes_x, cy))
            note(f'prompt: No spans {left}-{right} at y {cy}; Yes at {yes_x},{cy} (colour {r},{g},{b})')
            if min(r, g, b) < 200:
                note('prompt: the spot left of the accent button is not a light button; not clicking')
                return False
            pause(0.8, 1.3)
            click_at(yes_x, cy)
            note(f'prompt: Yes clicked at {yes_x},{cy}')
            return True
        time.sleep(0.5)
    note('prompt: not answered')
    return False


# ------------------------------------------------------------------ the recording
REC = None


def record_start():
    """The PC's screen is QEMU's window on this machine's virtual display; recorded where that window is."""
    global REC, T0
    import re
    env = dict(os.environ, DISPLAY=A.display)
    # QEMU's window grows from where it first opened, centred at the firmware's small size: moved to the corner.
    subprocess.run(['xdotool', 'search', '--name', 'QEMU', 'windowmove', '%@', '0', '0'], env=env, capture_output=True)
    time.sleep(1)
    geo = subprocess.run(['xwininfo', '-root', '-tree'], capture_output=True, text=True, env=env).stdout
    ox = oy = 0
    for line in geo.splitlines():
        m = re.search(r'(\d+)x(\d+)\+-?\d+\+-?\d+\s+\+(-?\d+)\+(-?\d+)', line)
        if m and 'qemu' in line.lower() and int(m.group(1)) >= W - 4 and int(m.group(2)) >= H - 4:
            ox, oy = max(0, int(m.group(3))), max(0, int(m.group(4))); note(f'screen window: {line.strip()[:160]}'); break
    else:
        note('screen window not found in xwininfo; recording from the corner')
    raw = os.path.join(A.out, 'screen.mkv')
    REC = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30',
                            '-video_size', f'{W}x{H}', '-i', f'{A.display}.0+{ox},{oy}', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21',
                            '-pix_fmt', 'yuv420p', '-y', raw], stdin=subprocess.PIPE, stderr=open(os.path.join(A.out, 'ffmpeg.txt'), 'w'))
    T0 = time.monotonic()
    note(f'recording {raw}')


def record_stop():
    if REC and REC.poll() is None:
        try: REC.stdin.write(b'q'); REC.stdin.flush()
        except Exception: pass
        try: REC.wait(120)
        except Exception: REC.kill()


# ------------------------------------------------------------------ the performance
TM_LAYOUT = {}   # where Performance and the Processes figure were, relative to Task Manager's window, the first time


def task_manager(what):
    press('ctrl', 'shift', 'esc')
    tm = win('Task Manager', 40)
    if not tm and TM_LAYOUT:
        # Task Manager reopens where it was; if the helper cannot answer in time, the places seen before are used.
        note('Task Manager not reported by the helper; using where it was before'); pause(3.0, 3.5)
        tm = dict(TM_LAYOUT['tm'])
    if not tm: note('Task Manager did not open'); return
    pause(1.2, 1.6)
    # Performance first (it opens on the process list, whose hundreds of rows make any search slow).
    perf = find('Task Manager', name='Performance', timeout=8)
    if perf:
        TM_LAYOUT.setdefault('perf', (perf['x'] - tm['x'] + perf['w'] // 2, perf['y'] - tm['y'] + perf['h'] // 2))
        click_at(*mid(perf))
    elif 'perf' in TM_LAYOUT:
        click_at(tm['x'] + TM_LAYOUT['perf'][0], tm['y'] + TM_LAYOUT['perf'][1])
    pause(1.6, 2.1)
    label = find('Task Manager', name='Processes', pick='rightmost', timeout=8)
    if label:
        spot = (label['x'] + label['w'] // 2 + 8, label['y'] + label['h'] // 2 + 30)
        TM_LAYOUT.setdefault('label', (spot[0] - tm['x'], spot[1] - tm['y']))
        move_to(*spot)
    elif 'label' in TM_LAYOUT:
        move_to(tm['x'] + TM_LAYOUT['label'][0], tm['y'] + TM_LAYOUT['label'][1])
    TM_LAYOUT.setdefault('tm', {'x': tm['x'], 'y': tm['y'], 'w': tm['w'], 'h': tm['h']})
    mark(what)
    drift(4.5)


def close_foreground():
    press('alt', 'f4'); pause(0.8, 1.1)


def performance():
    move_to(int(W * 0.58), int(H * 0.52), 700); pause(1.2, 1.6)

    # 1. The number before.
    mark('task-manager-open')
    task_manager('before-count')
    close_foreground()

    # 2. Start, "powershell", the one line.
    mark('start-menu')
    press('meta_l'); pause(0.9, 1.2)
    type_text('powershell', 1.1); pause(1.1, 1.5)
    press('ret')
    ps = win('*PowerShell*', 20)
    if not ps: raise RuntimeError('PowerShell did not open')
    pause(1.4, 1.8)
    click_at(*mid(ps, 0.5, 0.6)); pause(0.5, 0.8)
    mark('type-command')
    type_text('irm omnidx.net/go.ps1 | iex', 1.0, 'omnidx.ne')
    pause(0.6, 0.9)
    shot('before-prompt.png')
    press('ret')
    mark('command-entered')

    # 3. Windows asks for administrator rights; Yes.
    uac_yes(os.path.join(A.out, 'before-prompt.png'), 40)
    mark('uac-yes')
    # Coming back from the prompt, Windows sometimes opens Start; Esc, as anyone would.
    for _ in range(3):
        time.sleep(1.2)
        fg = (AG.ask('fg') or {}).get('title', '')
        if fg in ('Start', 'Search'):
            press('esc'); note(f'closed {fg} after the prompt')
        else:
            break

    # 4. The app.
    app = win('OmniDx Tune', 180)
    if not app: raise RuntimeError('the app window did not open')
    mark('app-open')
    pause(1.2, 1.6)
    app = win('OmniDx Tune', 5) or app
    if app['w'] < W - 40:
        double_click_at(app['x'] + app['w'] // 2, app['y'] + 14)   # maximized, as people do: the title bar
        pause(1.0, 1.4)
    end = time.time() + 240
    while time.time() < end:
        run = find('OmniDx Tune', id='BtnRun', timeout=5)
        if run and run.get('enabled'): break
        time.sleep(1)
    count = find('OmniDx Tune', id='CountText', timeout=5)
    mark('app-read', count=(count or {}).get('name', ''))
    if count: move_to(count['x'] + count['w'] // 2 + 6, count['y'] + count['h'] // 2 + 4); drift(2.4)
    if A.extreme:
        chk = find('OmniDx Tune', id='ChkExtreme', timeout=5)
        if chk: click_at(chk['x'] + 9, chk['y'] + 10); pause(0.8, 1.2); mark('extreme-ticked')
    kb = find('OmniDx Tune', id='KeyBox', timeout=5)
    click_at(*mid(kb, 0.3, 0.5)); pause(0.6, 0.9)
    press('ctrl', 'v')
    mark('key-pasted'); pause(1.0, 1.4)
    run = find('OmniDx Tune', id='BtnRun', timeout=5)
    click_at(*mid(run))
    mark('run')

    # 5. The run, watched.
    start = time.time(); next_look = 6; done = ''
    while time.time() - start < 1800:
        r = find('OmniDx Tune', id='ResultText', timeout=3)
        done = (r or {}).get('name', '')
        if done: break
        if time.time() - start > next_look:
            lb = find('OmniDx Tune', id='LogBox', timeout=2)
            if lb:
                move_to(*mid(lb, 0.3 + 0.4 * random.random(), 0.35 + 0.5 * random.random())); drift(1.5)
            next_look = time.time() - start + random.uniform(7, 16)
        time.sleep(0.6)
    mark('done', result=done)

    # 6. The report it opens by itself: read, then closed.
    rep = win('*OmniDx Tune report*', 30)
    if rep:
        pause(1.5, 2.0); mark('report')
        move_to(*mid(rep, 0.45, 0.45)); drift(3.5)
        wheel(-3); pause(1.4, 1.8); wheel(-3); drift(2.5)
        close_foreground()
    else:
        note('no report window')

    # 7. The number now, before any restart.
    pause(0.8, 1.2)
    mark('task-manager-again')
    task_manager('after-count')
    close_foreground()

    # 8. Restart, from the app's own button (it asks once more).
    rs = find('OmniDx Tune', id='BtnRestart', timeout=10)
    if not rs: raise RuntimeError('no Restart now button')
    click_at(*mid(rs)); pause(1.4, 1.9)
    mark('restart-asked')
    rs = find('OmniDx Tune', id='BtnRestart', timeout=5) or rs
    first_boot = AG.boot
    click_at(*mid(rs))
    mark('restart')

    # 9. The boot, the sign-in, and three minutes of Windows starting up.
    boot = AG.wait_boot(not_this=first_boot, timeout=900)
    if not boot: raise RuntimeError('the PC did not come back')
    mark('signed-in')
    POS[0], POS[1] = W // 2, H // 2   # where Windows puts the pointer at sign-in
    si = time.monotonic()
    while time.monotonic() - si < A.settle_after: time.sleep(2)
    mark('three-minutes')
    task_manager('after-restart-count')
    pause(1.0, 1.5)


# ------------------------------------------------------------------ OmniDx Edition
IDLE_DUMP = r"""
$p = @(Get-CimInstance Win32_Process); $n = @{}; foreach ($x in $p) { $n[[int]$x.ProcessId] = $x.Name }
$lines = foreach ($x in ($p | Sort-Object Name)) {
  $c = ("$($x.CommandLine)" -replace '\s+', ' '); if ($c.Length -gt 200) { $c = $c.Substring(0, 200) }
  '{0,-36} {1,6}  from {2,-30} {3}' -f $x.Name, $x.ProcessId, $n[[int]$x.ParentProcessId], $c
}
New-Item -ItemType Directory -Force -Path C:\film | Out-Null
$lines | Set-Content C:\film\processes-at-rest.txt -Encoding UTF8
tasklist /svc | Set-Content C:\film\services-at-rest.txt -Encoding UTF8
"""


def edition():
    """OmniDx Edition from a clean install: its setup at the first sign-in (with the tune in Extreme), the restart
    it ends with, then a look round as a new owner would: the welcome, the Hub, the desktop, Start, Windows + S,
    OmniDx Browser, Task Manager, Settings > About, Game Boost, the lock screen and the sign-in picture."""
    first_boot = AG.boot
    mark('setup-running')
    start = time.time(); i = 0
    while True:
        if AG.wait_boot(not_this=first_boot, timeout=60): break
        i += 1; shot(f'setup-{i:03d}.png'); nudge()
        if time.time() - start > 70 * 60: raise RuntimeError('no restart within 70 minutes')
    mark('restarted')
    POS[0], POS[1] = W // 2, H // 2
    # When Windows Update was waiting for a restart, setup put the tune off to this sign-in: it runs now and
    # restarts the PC again (and an update can ask for up to two more restarts first). The tour starts at the
    # sign-in where the Edition's welcome opens.
    boot = AG.boot; wait0 = time.time(); i = 0
    while not win('OmniDx Hub', 20):
        b = AG.wait_boot(not_this=boot, timeout=40)
        if b: boot = b; mark('restarted again'); continue
        i += 1; shot(f'after-{i:03d}.png'); nudge()
        if time.time() - wait0 > 75 * 60: note('no welcome within 75 minutes; looking round as it is'); break
    mark('welcome')
    si = time.monotonic()
    while time.monotonic() - si < A.settle_after:
        time.sleep(20); nudge()
    # At rest: the count the Edition promises to keep at 80 or under, then every process with the one that started
    # it and the services in each service host, so anything over is named. (This PC's own filming helper, a
    # PowerShell and its console, is two of them.) The listing asks WMI, which starts a process of its own: counted first.
    n = procs()
    mark('at-rest', processes_at_rest=n)
    note(f'at rest: {n} processes' + (' - OVER the 80 target' if n and n > 80 else ' - within the 80 target' if n else ''))
    AG.ask('ps', code=IDLE_DUMP, timeout=90)

    def page(name, wait=2.5): pause(wait, wait + 0.6); shot(name); mark(name.split('.')[0])

    def close(*likes):
        """Alt+F4 only on a window the tour opened: on the bare desktop it would offer to shut the PC down."""
        import fnmatch
        title = ((AG.ask('fg') or {}).get('title') or '')
        if any(fnmatch.fnmatch(title, l) for l in likes): press('alt', 'f4'); pause(0.8, 1.1)
        else: note(f'not closing "{title}"'); press('esc'); pause(0.4, 0.6)

    # The welcome the Hub shows once, at the first sign-in after setup.
    hub = win('OmniDx Hub', 30)
    page('e01-welcome.png')
    if hub:
        move_to(*mid(hub, 0.5, 0.62)); drift(2.0)
        go = find('OmniDx Hub', name='Start playing', timeout=6)
        if go: click_at(*mid(go))
        else: press('ctrl', '2')
        page('e02-hub-home.png', 4.0)
        for k, n in (('2', 'e03-hub-presets.png'), ('3', 'e04-hub-games.png'), ('4', 'e05-hub-tune.png'), ('5', 'e06-hub-about.png')):
            hub = win('OmniDx Hub', 5) or hub
            # The rail on the left: clicked where a person would, the keys as the fallback.
            y = hub['y'] + 44 + 18 + (int(k) - 1) * 46 + 20
            click_at(hub['x'] + 8 + 110, y)
            page(n, 2.0)
        close('OmniDx Hub')
    # The desktop and Start.
    move_to(int(W * 0.55), int(H * 0.45)); pause(1.0, 1.4)
    page('e07-desktop.png', 1.0)
    press('meta_l'); page('e08-start.png', 1.6)
    press('esc'); pause(0.8, 1.0)
    # Windows + S: OmniDx Search.
    press('meta_l', 's'); page('e09-search.png', 1.4)
    type_text('disp'); page('e10-search-display.png', 1.0)
    press('esc'); type_text('12*7+3'); page('e11-search-sum.png', 1.0)
    press('esc'); type_text('boost'); pause(0.8, 1.0); press('ret'); page('e12-search-boost.png', 1.2)
    press('esc'); type_text('omnidx browser'); pause(0.8, 1.2); press('ret')
    # OmniDx Browser: the new tab page, then two sites.
    b = win('*OmniDx Browser*', 30)
    page('e13-browser-newtab.png', 5.0)
    type_text('omnidx.net'); press('ret'); page('e14-browser-omnidx.png', 8.0)
    press('ctrl', 't'); pause(1.2, 1.6); type_text('youtube.com'); press('ret'); page('e15-browser-youtube.png', 10.0)
    close_foreground()
    # The Hub with Game Boost on.
    press('meta_l', 's'); pause(1.0, 1.3); type_text('omnidx hub'); pause(0.8, 1.0); press('ret')
    win('OmniDx Hub', 20); page('e16-hub-boost.png', 4.0)
    close('OmniDx Hub')
    press('meta_l', 's'); pause(1.0, 1.3); type_text('boost'); pause(0.7, 0.9); press('ret'); pause(0.8, 1.0); press('esc'); press('esc')
    # Task Manager: the count on OmniDx Edition.
    task_manager('edition-count'); shot('e17-task-manager.png')
    close('Task Manager')
    # Settings > About: OmniDx as the PC's maker.
    press('meta_l', 's'); pause(1.0, 1.3); type_text('about this pc'); pause(0.8, 1.0); press('ret')
    page('e18-settings-about.png', 9.0)
    close('Settings', '*About*')
    # The lock screen and the sign-in picture. A click lifts the lock screen; the password box is clicked before
    # typing (a key press left the keys on the network button last time, and the password went nowhere).
    press('meta_l', 'l'); page('e19-lock.png', 4.0)
    click_at(W // 2, int(H * 0.35)); page('e20-sign-in.png', 3.0)
    for _ in range(2): click_at(W // 2, int(H * 0.555)); pause(0.7, 0.9)
    type_text('film'); pause(0.4, 0.6); press('ret')
    pause(10, 12); page('e21-back.png', 2.0)


def main():
    global A, LOG, Q, W, H
    ap = argparse.ArgumentParser()
    ap.add_argument('--qmp', required=True); ap.add_argument('--out', required=True); ap.add_argument('--key', required=True)
    ap.add_argument('--display', default=':99'); ap.add_argument('--port', type=int, default=8099)
    ap.add_argument('--extreme', action='store_true')
    ap.add_argument('--edition', action='store_true', help='OmniDx Edition: its setup runs at the first sign-in; film it and look round after its restart')
    ap.add_argument('--settle-before', type=float, default=300, help='seconds after the first sign-in before filming')
    ap.add_argument('--settle-after', type=float, default=180, help='seconds after the sign-in that follows the restart')
    ap.add_argument('--eject', default='cdrom0,cdrom1')
    ap.add_argument('--boot-keys', type=float, default=0, help='seconds of key presses at power-on, for "Press any key to boot from CD"')
    A = ap.parse_args()
    os.makedirs(A.out, exist_ok=True)
    LOG = open(os.path.join(A.out, 'director-log.txt'), 'a')
    srv = ThreadingHTTPServer(('127.0.0.1', A.port), Handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
    Q = QMP(A.qmp)
    # The installer disc asks for a key press before it boots; later starts, with no key, go on to the disk.
    end = time.time() + A.boot_keys
    while time.time() < end:
        press('spc'); time.sleep(0.5)
    note('QMP connected; waiting for Windows to install and sign in')
    # Setup, watched: a screenshot every minute until the first sign-in. The pointer is nudged by a
    # pixel now and then, so the screen does not switch itself off while nobody is at the PC.
    i = 0; started = time.time()
    while AG.wait_boot(timeout=20) is None:
        nudge()
        if time.time() - started > 60 * (i + 1):
            i += 1; shot(f'install-{i:03d}.png')
        if time.time() - started > 55 * 60: note('no sign-in after 55 minutes'); shot('gave-up.png'); sys.exit(1)
    first = time.monotonic()
    for dev in A.eject.split(','):
        try: Q.cmd('eject', id=dev, force=True); note(f'ejected {dev}')
        except Exception as ex: note(f'eject {dev}: {ex}')
    s = AG.ask('screen') or {}
    W, H = int(s.get('w', 1920)), int(s.get('h', 1080))
    note(f'screen {W}x{H}; processes {procs()}')
    AG.ask('clip', text=A.key)
    if A.edition:
        record_start()
        try:
            edition()
        except Exception as ex:
            note(f'stopped: {ex}'); shot('stopped.png')
        finally:
            mark('end'); time.sleep(1); record_stop()
            for d in (r'C:\ProgramData\OmniDx\Edition', r'C:\OmniDx', r'C:\film'):
                try: AG.ask('upload', dir=d, timeout=120)
                except Exception as ex: note(f'collect {d}: {ex}')
            try: AG.ask('ps', code=r"Copy-Item $env:LOCALAPPDATA\OmniDx\edition-log.txt, $env:LOCALAPPDATA\OmniDx\signin-processes.txt C:\film\ -ErrorAction SilentlyContinue; Get-ChildItem C:\film | Out-String", timeout=20); AG.ask('upload', dir=r'C:\film', timeout=60)
            except Exception: pass
            json.dump(EVENTS, open(os.path.join(A.out, 'events.json'), 'w'), indent=1)
            try: Q.cmd('quit')
            except Exception: pass
        return
    # First sign-in: let the new PC settle, as it would have long before anyone films it. Windows that
    # open by themselves at first sign-in are closed before the camera rolls.
    k = 0
    while time.monotonic() - first < A.settle_before:
        time.sleep(30); nudge(); k += 1; shot(f'settle-{k:02d}.png')
        note(f'settling: processes {procs()}')
    wins = AG.ask('wins') or []
    note('windows before filming: ' + ' | '.join(f"{w.get('name')}" for w in wins if isinstance(w, dict)))
    AG.ask('ps', code="Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -notin 'explorer','powershell','conhost' } | ForEach-Object { [void]$_.CloseMainWindow() }")
    press('esc'); time.sleep(0.5); press('esc')   # Start is open at the first sign-in
    time.sleep(3)
    AG.ask('clip', text=A.key)
    record_start()
    time.sleep(3)
    try:
        performance()
    except Exception as ex:
        note(f'stopped: {ex}'); shot('stopped.png')
    finally:
        mark('end')
        time.sleep(1)
        record_stop()
        try:
            r = AG.ask('read', path=r'C:\OmniDx\after-restart.txt', timeout=10)
            if r: note('after-restart.txt: ' + r.get('text', '').replace('\n', ' | ')[:600])
            AG.ask('upload', dir=r'C:\OmniDx', timeout=120)
            AG.ask('upload', dir=r'C:\film', timeout=60)
        except Exception as ex:
            note(f'collect: {ex}')
        json.dump(EVENTS, open(os.path.join(A.out, 'events.json'), 'w'), indent=1)
        try: Q.cmd('quit')
        except Exception: pass


if __name__ == '__main__':
    main()
