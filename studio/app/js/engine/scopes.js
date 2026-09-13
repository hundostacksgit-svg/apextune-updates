/*
 * Video scopes: parade, waveform, vectorscope and histogram.
 *
 * These are the instruments a grade is actually judged on, and the reason is
 * that eyes lie. A monitor that runs warm makes every shot look warm, so you
 * correct toward blue and everything you deliver is blue. A scope does not
 * care what your screen is doing — it reads the numbers in the file.
 *
 * Drawn the way broadcast scopes are drawn, because the conventions carry
 * meaning that a prettier arrangement would throw away:
 *
 *   • PARADE puts red, green and blue side by side across the frame's width.
 *     A neutral image has the three at the same height, so "is my white
 *     balance off" becomes a thing you can see rather than argue about.
 *   • WAVEFORM stacks luminance against horizontal position. Clipping is a
 *     flat line pressed against the top, crushed blacks a flat line on the
 *     bottom, and neither is visible in a picture on a bright screen.
 *   • VECTORSCOPE plots hue as angle and saturation as distance from centre.
 *     The skin-tone line at 123° is on it because faces landing on that line
 *     is most of what colour correction is for.
 *   • HISTOGRAM counts how many pixels sit at each brightness.
 *
 * Cost: every scope reads the frame once, at a capped size, and writes into a
 * canvas of its own. That is one getImageData per repaint regardless of how
 * many scopes are showing.
 */

/* How much of the frame to actually read. A scope is a statistical summary —
   sampling one pixel in four changes nothing about the shape it draws and
   makes it affordable to repaint while playing. */
const SAMPLE_W = 256;

export const SCOPES = [
  { id: 'parade', name: 'RGB parade' },
  { id: 'waveform', name: 'Waveform' },
  { id: 'vector', name: 'Vectorscope' },
  { id: 'histogram', name: 'Histogram' },
];

/** Read the source frame down to a size a scope can chew through. */
function readFrame(src) {
  if (!src?.width) return null;
  const w = Math.min(SAMPLE_W, src.width);
  const h = Math.max(1, Math.round((src.height / src.width) * w));
  const cv = readFrame.cv || (readFrame.cv = document.createElement('canvas'));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  try { return { data: ctx.getImageData(0, 0, w, h).data, w, h }; }
  catch { return null; }
}

/* ------------------------------------------------------------------ *
 * Graticules
 * ------------------------------------------------------------------ */

/**
 * The reference lines, drawn before the trace.
 *
 * Labelled in IRE, the scale grading is actually discussed in: 0 is black,
 * 100 is white, and the numbers people say out loud ("lift the blacks to 5",
 * "keep faces around 60") are positions on this axis. A scope without them is
 * a pretty shape you cannot act on.
 */
function grid(ctx, x, y, w, h, { labels = true } = {}) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.fillStyle = 'rgba(255,255,255,.34)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const ire of [0, 25, 50, 75, 100]) {
    const yy = Math.round(y + h - (ire / 100) * h) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
    if (labels) ctx.fillText(String(ire), x - 4, yy);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * The scopes
 * ------------------------------------------------------------------ */

/**
 * Parade: the three channels side by side.
 *
 * Each column of the trace is one column of the picture, so a bright patch on
 * the left of the shot shows on the left of each channel. That correspondence
 * is what makes a parade diagnostic rather than decorative — you can point at
 * a spike and say which part of the frame it is.
 */
function drawParade(ctx, frame, W, H, pad) {
  const { data, w, h } = frame;
  const gw = (W - pad - 6) / 3;
  const bins = 128;
  // One accumulation buffer per channel: [column][brightness bin].
  const acc = [new Uint16Array(bins * bins), new Uint16Array(bins * bins), new Uint16Array(bins * bins)];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const col = Math.min(bins - 1, Math.floor((x / w) * bins));
      for (let c = 0; c < 3; c++) {
        const v = Math.min(bins - 1, Math.floor((data[i + c] / 255) * bins));
        acc[c][col * bins + v]++;
      }
    }
  }

  const colours = ['rgba(255,60,60,', 'rgba(60,235,120,', 'rgba(70,150,255,'];
  for (let c = 0; c < 3; c++) {
    const x0 = pad + c * (gw + 3);
    grid(ctx, x0, 6, gw, H - 18, { labels: c === 0 });
    const cellW = gw / bins;
    const cellH = (H - 18) / bins;
    for (let col = 0; col < bins; col++) {
      for (let v = 0; v < bins; v++) {
        const n = acc[c][col * bins + v];
        if (!n) continue;
        // Square root, not linear: a single enormous spike in the blacks
        // otherwise flattens the rest of the trace into invisibility, which is
        // exactly where the detail you are looking for lives.
        const a = Math.min(1, Math.sqrt(n / 12) * 0.55);
        ctx.fillStyle = colours[c] + a.toFixed(3) + ')';
        ctx.fillRect(x0 + col * cellW, 6 + (H - 18) - (v + 1) * cellH, Math.max(1, cellW), Math.max(1, cellH));
      }
    }
  }
}

/** Waveform: luminance against horizontal position. */
function drawWaveform(ctx, frame, W, H, pad) {
  const { data, w, h } = frame;
  const bins = 160;
  const acc = new Uint16Array(bins * bins);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      const col = Math.min(bins - 1, Math.floor((x / w) * bins));
      acc[col * bins + Math.min(bins - 1, Math.floor(lum * bins))]++;
    }
  }
  const gw = W - pad - 6;
  grid(ctx, pad, 6, gw, H - 18);
  const cellW = gw / bins, cellH = (H - 18) / bins;
  for (let col = 0; col < bins; col++) {
    for (let v = 0; v < bins; v++) {
      const n = acc[col * bins + v];
      if (!n) continue;
      const a = Math.min(1, Math.sqrt(n / 10) * 0.5);
      ctx.fillStyle = `rgba(150,235,170,${a.toFixed(3)})`;
      ctx.fillRect(pad + col * cellW, 6 + (H - 18) - (v + 1) * cellH, Math.max(1, cellW), Math.max(1, cellH));
    }
  }
}

/**
 * Vectorscope: hue as angle, saturation as radius.
 *
 * The six colour targets and the skin-tone line are drawn first. That line at
 * 123 degrees is the single most used reference in colour correction —
 * faces of every complexion fall along it, differing in how far out they sit,
 * not in direction. Getting a face onto that line is most of what a
 * correction pass is doing.
 */
function drawVector(ctx, frame, W, H) {
  const { data, w, h } = frame;
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) / 2 - 10;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  for (const k of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke();
  }
  // The primaries and secondaries, where a colour bar signal would land.
  const targets = [
    ['R', 103.5, '#ff4040'], ['Mg', 60.9, '#ff4dff'], ['B', 192.2, '#5a7dff'],
    ['Cy', 283.5, '#4de0e0'], ['G', 240.9, '#4dff70'], ['Yl', 347.2, '#ffe04d'],
  ];
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, deg, colour] of targets) {
    const a = (deg * Math.PI) / 180;
    const tx = cx + Math.cos(a) * r * 0.75, ty = cy - Math.sin(a) * r * 0.75;
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(tx - 4, ty - 4, 8, 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillText(label, cx + Math.cos(a) * r * 0.9, cy - Math.sin(a) * r * 0.9);
  }
  // Skin tone.
  const skin = (123 * Math.PI) / 180;
  ctx.strokeStyle = 'rgba(255,200,150,.5)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(skin) * r, cy - Math.sin(skin) * r);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  for (let i = 0; i < data.length; i += 4) {
    const R = data[i] / 255, G = data[i + 1] / 255, B = data[i + 2] / 255;
    // Rec.709 chroma. U and V are what a vectorscope plots, not RGB.
    const luma = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const u = (B - luma) * 0.5389;
    const v = (R - luma) * 0.6350;
    const x = cx + u * r * 2.2;
    const y = cy - v * r * 2.2;
    ctx.fillStyle = 'rgba(140,255,190,.16)';
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  void h; void w;
}

/** Histogram: how many pixels at each brightness, per channel. */
function drawHistogram(ctx, frame, W, H, pad) {
  const { data } = frame;
  const bins = 128;
  const acc = [new Uint32Array(bins), new Uint32Array(bins), new Uint32Array(bins)];
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) acc[c][Math.min(bins - 1, Math.floor((data[i + c] / 255) * bins))]++;
  }
  let peak = 1;
  for (const ch of acc) for (const v of ch) if (v > peak) peak = v;

  const gw = W - pad - 6, gh = H - 18;
  grid(ctx, pad, 6, gw, gh);
  const colours = ['rgba(255,70,70,.62)', 'rgba(70,235,130,.62)', 'rgba(80,150,255,.62)'];
  ctx.globalCompositeOperation = 'lighter';
  for (let c = 0; c < 3; c++) {
    ctx.fillStyle = colours[c];
    ctx.beginPath();
    ctx.moveTo(pad, 6 + gh);
    for (let i = 0; i < bins; i++) {
      const v = Math.sqrt(acc[c][i] / peak) * gh;
      ctx.lineTo(pad + (i / (bins - 1)) * gw, 6 + gh - v);
    }
    ctx.lineTo(pad + gw, 6 + gh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draw one scope from a source canvas.
 *
 * Returns false when there was nothing to read, so a caller can leave the last
 * good trace up instead of flashing an empty box between frames.
 */
export function drawScope(dest, source, kind = 'parade') {
  const ctx = dest.getContext('2d');
  const W = dest.width, H = dest.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, W, H);

  const frame = readFrame(source);
  if (!frame) return false;

  const pad = 22;                       // room for the IRE labels
  if (kind === 'waveform') drawWaveform(ctx, frame, W, H, pad);
  else if (kind === 'vector') drawVector(ctx, frame, W, H);
  else if (kind === 'histogram') drawHistogram(ctx, frame, W, H, pad);
  else drawParade(ctx, frame, W, H, pad);
  return true;
}
