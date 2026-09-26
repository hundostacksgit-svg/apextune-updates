"""
Two PresentMon files for the bench's Windows check (.github/workflows/bench.yml): a stock run and a run with OmniDx
of the same made-up minute of a game, one in PresentMon 2's columns and one in 1.x's, each with other programs'
frames in it that the bench must not pick, and what bench.ps1 has to make of them, worked out here the same way.

    python3 tools/bench-fixture.py OUT_DIR

writes OUT_DIR/stock.csv, OUT_DIR/omnidx.csv and OUT_DIR/expected.json. Made-up numbers for a test, never for a card.
"""
import json, math, os, random, sys

V2 = ['Application', 'ProcessID', 'SwapChainAddress', 'PresentRuntime', 'SyncInterval', 'PresentFlags', 'AllowsTearing',
      'PresentMode', 'FrameType', 'CPUStartTime', 'MsCPUBusy', 'MsCPUWait', 'MsGPULatency', 'MsGPUTime', 'MsGPUBusy',
      'MsGPUWait', 'MsBetweenPresents', 'MsInPresentAPI', 'MsBetweenDisplayChange', 'MsUntilDisplayed']
V1 = ['Application', 'ProcessID', 'SwapChainAddress', 'Runtime', 'SyncInterval', 'PresentFlags', 'AllowsTearing',
      'PresentMode', 'Dropped', 'TimeInSeconds', 'msInPresentAPI', 'msBetweenPresents', 'msBetweenDisplayChange',
      'msUntilRenderComplete', 'msUntilDisplayed']


def frames(seed, base, jitter, spike_every, spike, seconds=60.0):
    rng = random.Random(seed)
    out, total = [], 0.0
    while total < seconds * 1000:
        ft = base * (1 + rng.gauss(0, jitter))
        if rng.random() < 1 / spike_every: ft *= spike * (0.8 + 0.4 * rng.random())
        ft = round(max(ft, 0.5), 4)
        out.append(ft); total += ft
    return out


def stats(ft):
    # bench.ps1's Get-Stats, line for line.
    n = len(ft); total = sum(ft); s = sorted(ft)
    pct = lambda p: s[min(n - 1, max(0, math.ceil(p * n) - 1))]
    median = pct(0.5)
    stut = sum(1 for x in ft if x > 2 * median)
    return {'frames': n, 'avg': round(n * 1000 / total, 1), 'low1': round(1000 / pct(0.99), 1), 'low01': round(1000 / pct(0.999), 1),
            'stuttersPerMin': round(stut / max(total / 60000, 0.01), 1)}


def write(path, cols, rows):
    with open(path, 'w', newline='') as f:
        f.write(','.join(cols) + '\r\n')
        for r in rows: f.write(','.join(str(r.get(c, 0)) for c in cols) + '\r\n')


def rows_for(app, pid, chain, ft, v1, mode='Hardware: Independent Flip'):
    t = 1.25; out = []
    for x in ft:
        t += x / 1000
        r = {'Application': app, 'ProcessID': pid, 'SwapChainAddress': chain, 'SyncInterval': 0, 'PresentFlags': 0, 'AllowsTearing': 1, 'PresentMode': mode}
        if v1: r.update({'Runtime': 'DXGI', 'Dropped': 0, 'TimeInSeconds': f'{t:.6f}', 'msBetweenPresents': f'{x:.4f}', 'msInPresentAPI': '0.0500', 'msBetweenDisplayChange': f'{x:.4f}', 'msUntilRenderComplete': '1.2000', 'msUntilDisplayed': '2.1000'})
        else: r.update({'PresentRuntime': 'DXGI', 'FrameType': 'Application', 'CPUStartTime': f'{t:.6f}', 'MsBetweenPresents': f'{x:.4f}', 'MsInPresentAPI': '0.0500', 'MsBetweenDisplayChange': f'{x:.4f}', 'MsUntilDisplayed': '2.1000', 'MsCPUBusy': f'{x * 0.6:.4f}', 'MsGPUTime': f'{x * 0.8:.4f}'})
        out.append(r)
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    runs = {'stock': dict(seed=1, base=7.2, jitter=0.09, spike_every=140, spike=3.1, v1=False),
            'omnidx': dict(seed=2, base=6.8, jitter=0.07, spike_every=420, spike=2.8, v1=True)}
    expected = {'game': 'Counter-Strike 2', 'exe': 'cs2.exe'}
    for label, k in runs.items():
        game = frames(k['seed'], k['base'], k['jitter'], k['spike_every'], k['spike'])
        # More frames than the game from things the bench must skip: Discord (on its list) and the game's own
        # launcher menu, a second swap chain of cs2.exe with fewer frames than the match.
        rows = rows_for('Discord.exe', 4120, '0x1A2B', frames(9, 2.0, 0.02, 10**9, 1), k['v1'], 'Composed: Flip')
        rows += rows_for('cs2.exe', 7788, '0x7F00', frames(5, 16.6, 0.01, 10**9, 1, seconds=3), k['v1'])
        rows += rows_for('cs2.exe', 7788, '0x7F10', game, k['v1'])
        write(os.path.join(out, f'{label}.csv'), V1 if k['v1'] else V2, rows)
        expected[label] = stats([float(f'{x:.4f}') for x in game])
    json.dump(expected, open(os.path.join(out, 'expected.json'), 'w'), indent=2)
    print(json.dumps(expected, indent=2))


if __name__ == '__main__':
    main()
