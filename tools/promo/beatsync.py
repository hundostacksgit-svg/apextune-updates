#!/usr/bin/env python3
"""
Find the beat in any song, so a video can be cut to it.

Give it the audio you want to post with and it writes tools/promo/beatmap.json:
the tempo, the time of every beat, which beats start a bar, how loud each beat
is, and where the drop lands. beatcut.html reads that file and builds every cut,
every text hit and every flash from it, so the edit lands on the music instead
of near it.

    python3 tools/promo/beatsync.py song.mp3

Only needs ffmpeg and numpy. If the detected tempo is wrong -- which happens on
half-time trap beats, where hearing 75 and 150 are both defensible -- pass the
right one and it will only solve for where the beats sit:

    python3 tools/promo/beatsync.py song.mp3 --bpm 150
"""
import argparse, json, os, subprocess, sys
import numpy as np

SR = 22050
N_FFT = 1024
HOP = 256
FPS = SR / HOP                      # onset-envelope frames per second
# An analysis frame reports on the window centred half an FFT after it starts,
# so frame -> time has to add that back or every beat lands ~23ms early.
CENTER_FRAMES = N_FFT / (2 * HOP)


def decode(path):
    """Audio file -> mono float32 at SR, via ffmpeg."""
    if not os.path.exists(path):
        sys.exit(f"no such file: {path}")
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le',
           '-ac', '1', '-ar', str(SR), '-']
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        sys.exit(f"ffmpeg could not read {path}:\n{p.stderr.decode(errors='replace')}")
    x = np.frombuffer(p.stdout, dtype='<f4').astype(np.float64)
    if x.size < SR:
        sys.exit("that file is under a second of audio")
    return x


def envelopes(x):
    """
    Two onset curves: everything, and just the bottom end.

    The full-band curve is what tempo falls out of. The low-band curve is what
    decides where beat one sits, because a hi-hat produces just as much spectral
    flux as a kick and lands exactly between the beats -- lock phase to the full
    spectrum and half the time the edit cuts on the offbeat.
    """
    win = np.hanning(N_FFT)
    n = 1 + (len(x) - N_FFT) // HOP
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n, N_FFT), strides=(x.strides[0] * HOP, x.strides[0])) * win
    mag = np.abs(np.fft.rfft(frames, axis=1))
    logmag = np.log1p(mag * 8.0)
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / SR)
    low = freqs < 250.0

    def flux(m):
        # Only rising energy counts -- a note starting is an onset, a note ending is not.
        f = np.concatenate([[0.0], np.maximum(0.0, np.diff(m, axis=0)).sum(axis=1)])
        # Subtract a local average so a quiet verse and a loud chorus both register.
        k = int(FPS * 0.4) | 1
        loc = np.convolve(np.pad(f, k // 2, mode='edge'), np.ones(k) / k, mode='valid')[:len(f)]
        e = np.maximum(0.0, f - loc)
        return e / e.max() if e.max() > 0 else e

    return flux(logmag), flux(logmag[:, low])


def max_filter(e, w):
    """Loudest value within w frames, so a grid still scores a slightly late hit."""
    pad = np.pad(e, w, mode='constant')
    return np.max(np.stack([pad[i:i + len(e)] for i in range(2 * w + 1)]), axis=0)


def tempo_candidates(env, lo=55.0, hi=200.0):
    """Every tempo the autocorrelation finds plausible, plus its halves and doubles."""
    e = env - env.mean()
    ac = np.correlate(e, e, mode='full')[len(e) - 1:]
    lag_lo, lag_hi = int(FPS * 60.0 / hi), min(int(FPS * 60.0 / lo), len(ac) - 1)
    if lag_hi <= lag_lo + 2:
        return [120.0]
    seg = ac[lag_lo:lag_hi + 1]
    peaks = [i for i in range(1, len(seg) - 1) if seg[i] > seg[i - 1] and seg[i] >= seg[i + 1]]
    peaks.sort(key=lambda i: -seg[i])
    out = []
    for i in peaks[:8]:
        base = 60.0 * FPS / (lag_lo + i)
        # A track's beat and its half, double and triple all show up here. Which
        # one a person taps along to is not something autocorrelation can tell.
        for m in (0.25, 1 / 3, 0.5, 1.0, 2.0, 3.0, 4.0):
            v = base * m
            if lo <= v <= hi and not any(abs(v - o) < 0.6 for o in out):
                out.append(v)
    return out or [120.0]


def fit_grid(env, low, bpm, dur, span=3.0, step=0.02):
    """
    Solve for the tempo and the downbeat together, and say how well it fits.

    Autocorrelation can only see whole frames, and at 86 frames a second the
    nearest lag to 128bpm is 129.2 -- which sounds identical and drifts a third
    of a beat by the end of a 15-second video. So take a candidate as a starting
    point and search around it at a resolution the ear actually cares about.
    """
    envm, lowm = max_filter(env, 3), max_filter(low, 3)
    curve = envm + 1.5 * lowm
    cands = np.arange(bpm - span, bpm + span + 1e-9, step) if span > 0 else np.array([bpm])
    best = (-1.0, bpm, 0.0)
    for b in cands:
        if b <= 20:
            continue
        period = 60.0 / b
        k = np.arange(0.0, min(dur, 30.0), period)
        if len(k) < 4:
            continue
        offs = np.arange(0.0, period, 0.004)
        idx = np.clip(((offs[:, None] + k[None, :]) * FPS).astype(int), 0, len(curve) - 1)
        # Mean per beat, not total: otherwise double-time always wins by having
        # twice as many beats to add up.
        s = curve[idx].mean(axis=1)
        i = int(np.argmax(s))
        if s[i] > best[0]:
            best = (float(s[i]), float(b), float(offs[i]))
    return best


def choose_tempo(env, low, dur):
    """
    Pick the tempo whose grid actually lands on the hits.

    Autocorrelation on its own gets fooled by hi-hats -- a 75bpm track with four
    hats to the beat reads as 100. Laying each candidate grid over the low end
    and scoring it settles that, because only the real tempo puts a beat on
    every kick.
    """
    scored = []
    for c in tempo_candidates(env):
        sc, bpm, off = fit_grid(env, low, c, dur, span=1.5)
        # A pull toward tempos people count at -- deliberately weak, because it
        # is only here to break a tie. Half-tempo fits a grid exactly as well as
        # the real tempo does (every other beat still lands on a kick), so
        # something has to choose; but a track whose grid genuinely fits better
        # at 75 must be allowed to beat a worse-fitting 150.
        prior = np.exp(-0.5 * (np.log2(bpm / 120.0) / 1.15) ** 2)
        scored.append((sc * prior, bpm, off))
    scored.sort(reverse=True)
    return scored[0][1], scored[0][2]


def refine_phase(low, beats, period):
    """
    Nudge the whole grid onto the actual hits.

    Fitting scores a window around each beat, so a grid sitting a frame or two
    early scores the same as one sitting dead on. Measure how far each beat is
    from the nearest low-end peak and shift the grid by the median of those --
    the median, so one beat with no kick on it cannot drag the rest off.
    """
    w = max(1, int(period * 0.18 * FPS))
    deltas = []
    for t in beats:
        i = int(round(t * FPS - CENTER_FRAMES))
        a, b = max(0, i - w), min(len(low), i + w + 1)
        if b - a < 3:
            continue
        seg = low[a:b]
        if seg.max() <= 0:
            continue
        deltas.append(((a + int(np.argmax(seg))) + CENTER_FRAMES) / FPS - t)
    if not deltas:
        return 0.0
    shift = float(np.median(deltas))
    return shift if abs(shift) < period * 0.25 else 0.0


def selftest():
    """
    Build tracks whose tempo is known, then check the detector finds it.

    The three cases are the ones that break naive beat tracking: a plain
    four-on-the-floor, a syncopated 90, and a slow 75 with four hi-hats to the
    beat -- the last of which reads as 100 or 150 to anything that only looks at
    where energy repeats, because the hats repeat there too.
    """
    import tempfile, wave
    cases = [(128.0, 0.137, 2, False), (90.0, 0.311, 2, True),
             (150.0, 0.055, 1, False), (75.0, 0.900, 4, False)]
    ok = True
    for bpm, off, hats, sync in cases:
        sr, dur = 44100, 20.0
        n = int(sr * dur); x = np.zeros(n); per = 60.0 / bpm
        rng = np.random.default_rng(3)
        d = np.arange(int(sr * 0.2)) / sr
        kick = np.sin(2 * np.pi * np.cumsum(150 * np.exp(-d * 26) + 50) / sr) * np.exp(-d * 16)
        dh = np.arange(int(sr * 0.04)) / sr
        hat = rng.standard_normal(len(dh)) * np.exp(-dh * 110) * 0.3
        ds = np.arange(int(sr * 0.12)) / sr
        snare = (rng.standard_normal(len(ds)) * 0.5 + np.sin(2 * np.pi * 190 * ds)) * np.exp(-ds * 30) * 0.5
        def put(at, sig):
            i = int(at * sr)
            if 0 <= i < n:
                m = min(len(sig), n - i); x[i:i + m] += sig[:m]
        b, t = 0, off
        while t < dur:
            put(t, kick)
            if b % 2 == 1: put(t, snare)
            if sync and b % 4 == 2: put(t + per * 0.75, kick * 0.7)
            for j in range(hats): put(t + per * j / hats, hat)
            t += per; b += 1
        x = np.clip(x + np.sin(2 * np.pi * 60 * np.arange(n) / sr) * 0.06, -1, 1)
        f = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        w = wave.open(f.name, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 31000).astype('<i2').tobytes()); w.close()

        a = decode(f.name)
        env, low = envelopes(a)
        got, goff = choose_tempo(env, low, len(a) / SR)
        period = 60.0 / got
        beats = np.arange(goff, 15.0, period)
        beats = beats + refine_phase(low, beats, period)
        # Distance to the nearest true beat, so a grid that simply starts one
        # beat earlier than the track does still counts as correct.
        err = max(abs(((t - off + per / 2) % per) - per / 2) for t in beats)
        good = abs(got - bpm) < 1.5 and err < 0.06
        ok &= good
        print(f"  {'pass' if good else 'FAIL'}  {bpm:6.1f} bpm -> {got:7.2f}   "
              f"worst beat off by {err * 1000:5.1f}ms ({err * 30:.1f} frames at 30fps)")
        os.unlink(f.name)
    print("BEATSYNC OK" if ok else "BEATSYNC FAILED")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio', nargs='?', help='the song you want to post with')
    ap.add_argument('--selftest', action='store_true',
                    help='check the detector against tracks of known tempo')
    ap.add_argument('--bpm', type=float, help='force the tempo instead of detecting it')
    ap.add_argument('--start', type=float, default=0.0,
                    help='seconds to skip from the front of the track')
    ap.add_argument('--length', type=float, default=15.0,
                    help='how long the video should be (seconds)')
    ap.add_argument('-o', '--out', default=os.path.join(os.path.dirname(__file__), 'beatmap.json'))
    a = ap.parse_args()
    if a.selftest:
        sys.exit(selftest())
    if not a.audio:
        ap.error('give it an audio file, or --selftest')

    x = decode(a.audio)
    if a.start > 0:
        x = x[int(a.start * SR):]
    dur = len(x) / SR
    env, low = envelopes(x)
    if a.bpm:
        _, bpm, off = fit_grid(env, low, a.bpm, dur, span=0)
    else:
        bpm, off = choose_tempo(env, low, dur)
    period = 60.0 / bpm

    off += refine_phase(low, np.arange(off, min(dur, a.length + period), period), period)
    if off < 0:
        off += period
    beats = [round(t, 4) for t in np.arange(off, min(dur, a.length + period), period)]
    if len(beats) < 4:
        sys.exit(f"only found {len(beats)} beats -- is the clip long enough?")

    # Which beat starts the bar: whichever of the four phases is consistently loudest.
    idx = np.clip((np.array(beats) * FPS).astype(int), 0, len(env) - 1)
    strength = np.array([env[max(0, i - 2):i + 3].max() for i in idx])
    bar_phase = int(np.argmax([strength[p::4].mean() for p in range(4)]))

    # Loudness per beat, so the video can push harder in the loud parts.
    energy = []
    for t in beats:
        seg = x[int(t * SR):int((t + period) * SR)]
        energy.append(float(np.sqrt(np.mean(seg ** 2))) if seg.size else 0.0)
    energy = np.array(energy)
    energy = energy / energy.max() if energy.max() > 0 else energy

    # The drop is the biggest sustained jump in loudness, ignoring the intro.
    drop, jump = None, 0.0
    span = 4
    for i in range(span, len(energy) - span):
        if beats[i] < 1.0:
            continue
        d = energy[i:i + span].mean() - energy[i - span:i].mean()
        if d > jump:
            jump, drop = d, beats[i]

    out = {
        'source': os.path.basename(a.audio),
        'bpm': round(bpm, 2),
        'offset': round(off, 4),
        'period': round(period, 4),
        'start': a.start,
        'duration': round(min(dur, a.length), 3),
        'barPhase': bar_phase,
        'beats': beats,
        'strength': [round(float(s), 4) for s in strength],
        'energy': [round(float(e), 4) for e in energy],
        'drop': round(drop, 4) if drop is not None and jump > 0.08 else None,
    }
    with open(a.out, 'w') as f:
        json.dump(out, f, indent=1)

    print(f"{out['bpm']} bpm, first beat at {out['offset']:.3f}s, "
          f"{len(beats)} beats over {out['duration']:.1f}s")
    print(f"bar starts on beat {bar_phase + 1} of 4"
          + (f", drop at {out['drop']:.2f}s" if out['drop'] else ", no clear drop"))
    print(f"wrote {a.out}")


if __name__ == '__main__':
    main()
