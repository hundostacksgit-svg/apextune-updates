"""
An original music bed for a vertical cut, made here from nothing: a soft
four-chord progression, a kick and a hat at 100 BPM, and a pop on each
moment given (a number appearing). Numpy only; writes a 48 kHz stereo WAV.

    python3 tools/promo/film/bed.py out.wav 42.5 --pops 3.1,39.8 --whoosh 5.0,12.2
"""
import sys, wave, argparse
import numpy as np

SR = 48000
BPM = 100
BEAT = 60 / BPM

def env(n, a, d, sr=SR):
    t = np.arange(n) / sr
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(d, 1e-4))

def tone(freqs, dur, amp, rng, detune=0.004):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for f in freqs:
        for k, d in enumerate((-detune, 0, detune)):
            ph = rng.random() * 2 * np.pi
            # a soft saw from a few harmonics, rounded off
            for h in range(1, 7):
                out += np.sin(2 * np.pi * f * (1 + d) * h * t + ph * h) / (h ** 1.6) * (0.8 if k != 1 else 1.0)
    out *= amp / max(1, len(freqs) * 3)
    return out

def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR); y = np.zeros_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s; y[i] = s
    return y

def mtof(m): return 440 * 2 ** ((m - 69) / 12)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('dur', type=float)
    ap.add_argument('--pops', default=''); ap.add_argument('--whoosh', default='')
    a = ap.parse_args()
    rng = np.random.default_rng(7)
    n = int(a.dur * SR) + SR
    mix = np.zeros((2, n))
    def add(sig, t0, pan=0.0, gain=1.0):
        i = int(t0 * SR); j = min(n, i + len(sig))
        if i >= n or j <= i: return
        l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
        mix[0, i:j] += sig[: j - i] * l * gain; mix[1, i:j] += sig[: j - i] * r * gain

    chords = [[50, 57, 60, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60]]  # Dm, Bb, C, Am
    bar = BEAT * 4
    bars = int(a.dur / bar) + 2
    for b in range(bars):
        c = chords[b % 4]
        pad = tone([mtof(m) for m in c], bar + 0.4, 0.22, rng)
        pad *= env(len(pad), 0.25, 3.0)
        pad = lowpass(pad, 1400)
        add(pad, b * bar, -0.15); add(pad, b * bar + 0.012, 0.15)
        bass = tone([mtof(c[0] - 12)], bar, 0.35, rng, 0.0) * env(int(bar * SR), 0.01, 1.2)
        add(lowpass(bass, 400), b * bar)
        for s in range(4):
            t0 = b * bar + s * BEAT
            if b == 0 and s < 2: continue  # the bed comes in after the first two beats
            kn = int(0.35 * SR); kt = np.arange(kn) / SR
            kick = np.sin(2 * np.pi * (48 + 90 * np.exp(-kt * 30)) * kt) * np.exp(-kt * 9) * 0.55
            add(kick, t0)
            hn = int(0.06 * SR)
            hat = rng.standard_normal(hn) * env(hn, 0.001, 0.018) * 0.07
            hat = hat - lowpass(hat, 6000)
            add(hat, t0 + BEAT / 2, 0.3)
    for p in [float(x) for x in a.pops.split(',') if x]:
        pn = int(0.25 * SR); pt = np.arange(pn) / SR
        pop = np.sin(2 * np.pi * (880 + 600 * np.exp(-pt * 40)) * pt) * np.exp(-pt * 18) * 0.35
        add(pop, p, 0.0)
    for w in [float(x) for x in a.whoosh.split(',') if x]:
        wn = int(0.5 * SR)
        noise = rng.standard_normal(wn)
        shape = np.sin(np.linspace(0, np.pi, wn)) ** 2
        add(lowpass(noise, 2500) * shape * 0.18, w - 0.25)
    # duck the bed a touch under the pops, then a gentle limiter and fades
    peak = np.max(np.abs(mix)) or 1
    mix = np.tanh(mix / peak * 1.4) * 0.85
    fade = int(0.8 * SR); total = int(a.dur * SR)
    mix = mix[:, :total]
    mix[:, :int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
    mix[:, -fade:] *= np.linspace(1, 0, fade)
    data = (mix.T * 32767).astype('<i2').tobytes()
    with wave.open(a.out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data)

if __name__ == '__main__':
    main()
