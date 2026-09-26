/*
 * Audio metering, in dB.
 *
 * A bar that fills from nothing to full is not a meter — it tells you a sound
 * is happening. What an editor needs to know is whether the mix is going to
 * clip, and whether it is loud enough to survive the loudness normalisation
 * every platform applies. Both of those are questions about decibels.
 *
 * Three things separate a real meter from a progress bar:
 *
 *   • A DECIBEL SCALE. Audio is logarithmic. Half the amplitude is −6 dB, not
 *     "50%", and on a linear bar every useful level between −20 and 0 is
 *     crammed into the last fifth of the travel where nothing can be judged.
 *
 *   • PEAK HOLD. A clip lasts one sample. On a bar that follows the signal you
 *     will never see it — the peak that ruined the export happened between two
 *     repaints. The hold marker stays at the highest recent value and falls
 *     back slowly, so a transient is still on screen a second later.
 *
 *   • ZONES. Green to −18, amber to −6, red above. Those boundaries are not
 *     decoration: −18 dBFS is where broadcast asks you to sit, and anything
 *     over −1 is asking the encoder to make a decision you will not like.
 */

/** Amplitude (0..1) to decibels full scale. Silence is floored, not −Infinity. */
export function toDb(amp) {
  return amp > 1e-5 ? 20 * Math.log10(amp) : -90;
}

export const METER_FLOOR = -54;     // below this there is nothing worth drawing

/** Where a level sits on the meter, 0 at the floor and 1 at 0 dBFS. */
export function dbToPos(db) {
  return Math.max(0, Math.min(1, (db - METER_FLOOR) / (0 - METER_FLOOR)));
}

/*
 * A fader's travel is not its gain.
 *
 * Mapped so that unity sits about three-quarters up, which is where every
 * mixing desk puts it — that leaves fine control over the range people
 * actually work in and a little headroom above, instead of squeezing
 * everything useful into the top centimetre.
 */
export function faderToGain(pos) {
  if (pos <= 0) return 0;
  const db = pos >= 0.75
    ? (pos - 0.75) / 0.25 * 12               // 0 to +12 dB above unity
    : (pos / 0.75) * 54 - 54;                // −54 dB up to unity
  return 10 ** (db / 20);
}

export function gainToFader(gain) {
  if (gain <= 0) return 0;
  const db = toDb(gain);
  return db >= 0 ? 0.75 + Math.min(1, db / 12) * 0.25
    : Math.max(0, (db + 54) / 54) * 0.75;
}

/** A gain as the number a person reads off a desk. */
export function gainLabel(gain) {
  if (gain <= 0.0001) return '−∞';
  const db = toDb(gain);
  return `${db > 0 ? '+' : db > -0.05 ? '' : '−'}${Math.abs(db).toFixed(1)}`;
}

/**
 * One channel's meter state, held across frames so peaks can be remembered.
 *
 * Decay rates are in dB per second and are the numbers that make a meter feel
 * right: the bar falls fast enough to track a mix, the peak marker slowly
 * enough that you can actually look at it.
 */
export class MeterState {
  constructor() {
    this.level = METER_FLOOR;
    this.peak = METER_FLOOR;
    /*
     * −Infinity, not 0.
     *
     * "Never clipped" and "clipped at time zero" are different facts, and zero
     * conflates them: `performance.now()` starts at zero on page load, so for
     * the first 1.8 seconds of the app's life a meter that had never seen a
     * sample reported that it was clipping. Rare, brief, and exactly the kind
     * of thing that teaches somebody to ignore the warning.
     */
    this.clipped = -Infinity;      // when a clip was last seen, as a timestamp
    this.last = performance.now();
  }

  /** Feed it an amplitude; it returns itself for chaining. */
  push(amp, now = performance.now()) {
    const dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const db = toDb(amp);

    // Rise instantly, fall at a rate — a meter that eases upward under-reads
    // exactly the transients it exists to catch.
    this.level = db > this.level ? db : Math.max(METER_FLOOR, this.level - 40 * dt);
    this.peak = db > this.peak ? db : Math.max(this.level, this.peak - 12 * dt);

    // Anything at or above −0.1 dBFS is going to be clipped by something
    // downstream. Latched for a while, because a warning you miss is no
    // warning at all.
    if (db >= -0.1) this.clipped = now;
    return this;
  }

  get isClipping() { return performance.now() - this.clipped < 1800; }
}

/**
 * Draw a vertical meter.
 *
 * Stereo when given two levels, mono when given one — a mono meter drawn as
 * two identical bars implies a stereo image that is not there.
 */
export function drawMeter(ctx, x, y, w, h, states, { scale = true } = {}) {
  ctx.clearRect(x, y, w, h);
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(x, y, w, h);

  const scaleW = scale ? 20 : 0;
  const barsX = x + scaleW;
  const barsW = w - scaleW;
  const gap = 1;
  const each = (barsW - gap * (states.length - 1)) / states.length;

  if (scale) {
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const db of [0, -6, -18, -36, -54]) {
      const yy = y + h - dbToPos(db) * h;
      ctx.strokeStyle = db === 0 ? 'rgba(255,90,90,.45)' : 'rgba(255,255,255,.10)';
      ctx.beginPath();
      ctx.moveTo(barsX, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.32)';
      ctx.fillText(String(db), barsX - 3, yy);
    }
  }

  states.forEach((st, i) => {
    const bx = barsX + i * (each + gap);
    const top = y + h - dbToPos(st.level) * h;

    // The bar is drawn as its zones rather than one colour that changes, so a
    // loud signal shows green underneath amber underneath red — which is the
    // history of the level, not just where it is now.
    const zones = [
      [METER_FLOOR, -18, '#3ddc84'],
      [-18, -6, '#ffd60a'],
      [-6, 0, '#ff453a'],
    ];
    for (const [lo, hi, colour] of zones) {
      const from = Math.max(lo, METER_FLOOR);
      const to = Math.min(hi, st.level);
      if (to <= from) continue;
      const yTop = y + h - dbToPos(to) * h;
      const yBot = y + h - dbToPos(from) * h;
      ctx.fillStyle = colour;
      ctx.fillRect(bx, yTop, each, yBot - yTop);
    }
    void top;

    // Peak hold.
    if (st.peak > METER_FLOOR + 0.5) {
      const py = y + h - dbToPos(st.peak) * h;
      ctx.fillStyle = st.peak >= -0.1 ? '#ff453a' : 'rgba(255,255,255,.85)';
      ctx.fillRect(bx, Math.max(y, py - 1), each, 2);
    }
  });

  // A clip indicator across the top, latched. Losing it between repaints is
  // how somebody exports a distorted mix without ever seeing a warning.
  if (states.some((s) => s.isClipping)) {
    ctx.fillStyle = '#ff453a';
    ctx.fillRect(barsX, y, barsW, 3);
  }
}
