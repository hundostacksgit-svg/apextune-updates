/*
 * The result, as an image worth posting.
 *
 * A text report is what you send to a mechanic. It is not what anybody puts on
 * a story. This draws the same finding as a 1080x1920 card -- the score, the
 * code, what caused it and what to do -- with the domain on it, so a scan a
 * customer already wanted to show someone carries the app with it.
 *
 * Everything is drawn on a canvas rather than screenshotted, so it looks the
 * same on every phone and works with no network.
 */
import { verdict } from './report.js';
import { describe, severity } from './obd/dtc.js';
import { repairFor, misfireCylinder } from './obd/repairs.js';
import { toast } from './ui.js';

const W = 1080, H = 1920;
const C = {
  bg: '#0b0c10', panel: '#15181f', line: '#262b36',
  text: '#e9ecf2', dim: '#a3abbb', faint: '#6f7889',
  accent: '#ff9e2b', accent2: '#ff4a3a',
  ok: '#31d07a', warn: '#ffc043', bad: '#ff5a4d',
};
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif';
const font = (px, weight = 700) => `${weight} ${px}px ${SANS}`;

/** Split `text` into lines that fit `max` px, ellipsising past `limit` lines. */
function wrapLines(g, text, max, limit = 99) {
  const words = String(text).split(/\s+/);
  let line = '', lines = [];
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > max && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > limit) {
    lines = lines.slice(0, limit);
    // Trim the last line so the ellipsis itself still fits inside `max`.
    while (lines[limit - 1] && g.measureText(`${lines[limit - 1]}...`).width > max) {
      lines[limit - 1] = lines[limit - 1].replace(/\s*\S+$/, '');
    }
    lines[limit - 1] += '...';
  }
  return lines;
}

function drawLines(g, lines, x, y, lineHeight) {
  for (const l of lines) { g.fillText(l, x, y); y += lineHeight; }
  return y;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Small caps section label. */
function label(g, text, x, y) {
  g.save();
  g.fillStyle = C.faint;
  g.font = font(30, 800);
  g.letterSpacing = '4px';
  g.fillText(text.toUpperCase(), x, y);
  g.restore();
}

function ring(g, cx, cy, r, score, tone) {
  g.save();
  g.lineWidth = 30;
  g.lineCap = 'round';
  g.strokeStyle = '#1e222b';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();

  const grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, C[tone] || C.accent);
  grad.addColorStop(1, tone === 'ok' ? '#7be3a8' : C.accent2);
  g.strokeStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (score / 100));
  g.stroke();

  g.textAlign = 'center';
  g.fillStyle = C.text;
  g.font = font(168, 800);
  g.fillText(String(score), cx, cy + 42);
  g.fillStyle = C.faint;
  g.font = font(36, 700);
  g.fillText('OUT OF 100', cx, cy + 108);
  g.restore();
}

/** The one finding worth putting on a card: worst code, or worst failed test. */
function headline(r) {
  if (r.kind === 'car') {
    const codes = [...(r.data?.dtc?.stored || []), ...(r.data?.dtc?.permanent || [])];
    if (!codes.length) return null;
    const rank = { critical: 0, major: 1, minor: 2 };
    const code = [...codes].sort((a, b) => (rank[severity(a)] ?? 3) - (rank[severity(b)] ?? 3))[0];
    const desc = describe(code);
    const cyl = misfireCylinder(code);
    // describe() usually names the cylinder itself; only add it when it doesn't.
    return { code, rep: repairFor(code),
             desc: cyl && !/cylinder/i.test(desc) ? `${desc} (cylinder ${cyl})` : desc };
  }
  const bad = (r.data?.tests || []).filter((t) => t.state === 'bad' || t.state === 'warn');
  return bad.length ? { tests: bad.slice(0, 4) } : null;
}

/** Draw the card onto a canvas and return it. */
export function drawCard(r) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const v = verdict(r.score);

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  // A warm bloom behind the score, so the card is not a flat rectangle.
  const glow = g.createRadialGradient(W / 2, 620, 60, W / 2, 620, 780);
  glow.addColorStop(0, 'rgba(255,158,43,.16)');
  glow.addColorStop(1, 'rgba(255,158,43,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // ---- wordmark ----
  g.textAlign = 'center';
  g.fillStyle = C.accent;
  g.beginPath(); g.arc(W / 2 - 152, 148, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.text;
  g.font = font(64, 800);
  g.fillText('OmniDx', W / 2 + 22, 170);

  g.fillStyle = C.faint;
  g.font = font(34, 700);
  g.letterSpacing = '6px';
  g.fillText(String(r.title || 'DIAGNOSTIC').toUpperCase(), W / 2, 250);
  g.letterSpacing = '0px';

  // ---- score ----
  ring(g, W / 2, 620, 200, r.score, v.tone);
  g.fillStyle = C[v.tone] || C.text;
  g.font = font(82, 800);
  g.fillText(v.label, W / 2, 950);

  // ---- the finding ----
  const h = headline(r);
  const x = 90, w = W - 180, pad = 44;
  const inner = w - pad * 2;
  const TOP = 1030, BOTTOM = 1700;      // the footer starts just below BOTTOM
  let y = TOP;

  g.textAlign = 'left';
  if (h?.code) {
    /*
     * Measure and draw with the same code path. Sizing a panel by one set of
     * numbers and filling it using another is how text ends up hanging off the
     * bottom of a card, so `run` does both: called with draw=false it only
     * returns the height it would need.
     */
    const run = (top, cl, fl, draw) => {
      let ty = top + 130;
      if (draw) {
        g.fillStyle = C.accent; g.font = font(104, 800);
        g.fillText(h.code, x + pad, ty);
      }
      g.font = font(42, 600);
      const desc = wrapLines(g, h.desc, inner, 2);
      ty += 70;
      if (draw) { g.fillStyle = C.text; g.font = font(42, 600); }
      ty = draw ? drawLines(g, desc, x + pad, ty, 54) : ty + desc.length * 54;

      g.font = font(38, 500);
      const cause = h.rep?.causes?.length ? wrapLines(g, h.rep.causes[0], inner, cl) : [];
      if (cause.length) {
        if (draw) label(g, 'Most likely cause', x + pad, ty + 36);
        ty += 90;
        if (draw) { g.fillStyle = C.dim; g.font = font(38, 500); }
        ty = draw ? drawLines(g, cause, x + pad, ty, 48) : ty + cause.length * 48;
      }
      const fix = h.rep?.fix?.length ? wrapLines(g, h.rep.fix[0], inner, fl) : [];
      if (fix.length) {
        if (draw) label(g, 'Start here', x + pad, ty + 30);
        ty += 82;
        if (draw) { g.fillStyle = C.dim; g.font = font(38, 500); }
        ty = draw ? drawLines(g, fix, x + pad, ty, 48) : ty + fix.length * 48;
      }
      return ty - 48 + pad;            // last baseline, plus room under it
    };

    // Show the fullest guidance that still fits; give up lines before clipping.
    let cl = 2, fl = 2, height = 0;
    for (const [c, f] of [[2, 2], [2, 1], [1, 1]]) {
      height = run(y, c, f, false) - y;
      cl = c; fl = f;
      if (y + height <= BOTTOM) break;
    }

    g.fillStyle = C.panel;
    roundRect(g, x, y, w, height, 28);
    g.fill();
    g.strokeStyle = C.line; g.lineWidth = 3; g.stroke();
    run(y, cl, fl, true);
  } else if (h?.tests) {
    for (const t of h.tests) {
      g.font = font(40, 600);
      const lines = wrapLines(g, t.detail ? `${t.name} — ${t.detail}` : t.name, w - 130, 2);
      const height = 48 + lines.length * 46;
      if (y + height > BOTTOM) break;
      g.fillStyle = C.panel;
      roundRect(g, x, y, w, height, 20); g.fill();
      g.fillStyle = t.state === 'bad' ? C.bad : C.warn;
      g.beginPath(); g.arc(x + 46, y + height / 2, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = C.text;
      g.font = font(40, 600);
      drawLines(g, lines, x + 88, y + height / 2 - (lines.length - 1) * 23 + 14, 46);
      y += height + 20;
    }
  } else {
    g.font = font(38, 500);
    const lines = wrapLines(g, 'Everything the scan could check came back clean.', inner, 2);
    const height = 92 + 60 + lines.length * 48;
    g.fillStyle = C.panel;
    roundRect(g, x, y, w, height, 28); g.fill();
    g.strokeStyle = C.line; g.lineWidth = 3; g.stroke();
    g.fillStyle = C.ok;
    g.font = font(56, 800);
    g.fillText('No faults found', x + pad, y + 92);
    g.fillStyle = C.dim;
    g.font = font(38, 500);
    drawLines(g, lines, x + pad, y + 160, 48);
  }

  // ---- footer ----
  g.textAlign = 'center';
  g.fillStyle = C.faint;
  g.font = font(36, 600);
  g.fillText(new Date(r.ts || Date.now()).toLocaleDateString(), W / 2, 1770);
  g.fillStyle = C.text;
  g.font = font(48, 800);
  g.fillText('Scan yours at omnidx.net', W / 2, 1846);
  return cv;
}

const blobOf = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

/**
 * Hand the card to the share sheet, and fall back to a download when there is
 * no share sheet -- which is every desktop browser.
 */
export async function shareCard(r) {
  let blob;
  try {
    blob = await blobOf(drawCard(r));
  } catch {
    toast('Could not build the card', 'bad');
    return;
  }
  if (!blob) { toast('Could not build the card', 'bad'); return; }

  const name = `omnidx-${r.kind || 'scan'}-${r.score}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: r.title || 'OmniDx' });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;   // user closed the sheet
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Card saved to your downloads', 'ok');
}
