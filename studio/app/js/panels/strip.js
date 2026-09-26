/*
 * The channel strip section of the Audio panel, and the loudness check.
 *
 * Two things every mix needs and neither of which the app had: something to
 * shape a voice with, and a straight answer to "is this the right loudness for
 * where I am posting it".
 *
 * The loudness half is the one that changes outcomes. Every platform
 * normalises now and quietly turns anything louder than its target down — so a
 * mix mastered loud does not play loud, it plays turned down with the dynamics
 * squashed for nothing. Nobody can hear that happening; they can only be told.
 */

import { esc, slider, group, toast } from '../ui.js';
import { S, actions } from '../main.js';
import { newStrip, EQ_BANDS, describeStrip, stripIsFlat, warmStrip } from '../engine/audio-strip.js';
import { TARGETS, targetById, normalisationFor, formatLufs } from '../engine/loudness.js';
import * as licence from '../licence.js';

let measuring = false;
let reading = null;          // the last loudness measurement, for the panel
let targetId = 'youtube';

export function loudnessTarget() { return targetById(targetId); }
export function lastReading() { return reading; }

function selectedClip() {
  const sel = [...S.sel];
  return sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
}

function stripOf(clip) { return clip.strip || (clip.strip = newStrip()); }

/* ------------------------------------------------------------------ */
/* the strip                                                           */
/* ------------------------------------------------------------------ */

export function stripMarkup(clip) {
  if (!clip) {
    return group('Channel strip',
      '<p class="tiny muted" style="margin:0">Select one clip to shape its sound.</p>',
      false, 'data-min="expert"');
  }
  const st = clip.strip || newStrip();
  const locked = !licence.can('audio-fx-pro');

  return group('Channel strip', `
    <p class="tiny muted" style="margin:0 0 9px">
      EQ, compression and pan — the things nobody notices when they are right.
      <span class="muted">${esc(describeStrip(st))}</span>
    </p>

    ${locked ? `<div class="note pro tiny">The channel strip is in
      ${esc(licence.requires('audio-fx-pro')?.name || 'Creator')}.
      <button class="btn btn-sm" data-act="upgrade-strip" style="margin-top:8px">See what's included</button>
    </div>` : `
    <label class="tl-toggle" style="width:100%;justify-content:space-between">
      <span>Use the strip on this clip</span>
      <input type="checkbox" id="st-on" ${st.on ? 'checked' : ''}>
    </label>

    ${st.on ? `
      <div class="st-h">Equaliser</div>
      ${(st.eq || []).map((band, i) => {
        const def = EQ_BANDS.find((b) => b.id === band.id) || {};
        return `
        <div class="st-band">
          <label class="st-bandhead">
            <input type="checkbox" data-eqon="${i}" ${band.on !== false ? 'checked' : ''}>
            <span>${esc(def.label || band.id)}</span>
            <span class="muted tiny">${band.type === 'highpass' ? 'filter'
              : `${band.gain > 0 ? '+' : ''}${Math.round(band.gain)}dB`} @ ${
              band.freq >= 1000 ? `${(band.freq / 1000).toFixed(1)}k` : Math.round(band.freq)}Hz</span>
          </label>
          ${band.on !== false ? `
            ${slider({ key: `eq.${i}.freq`, label: 'Frequency', value: band.freq,
              min: band.type === 'highpass' ? 20 : 40, max: band.type === 'highshelf' ? 18000 : 12000,
              step: 1, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}kHz` : `${Math.round(v)}Hz`) })}
            ${band.type === 'highpass' ? '' : slider({ key: `eq.${i}.gain`, label: 'Gain',
              value: band.gain, min: -18, max: 18, step: 0.5,
              fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB` })}
            ${band.type === 'peaking' ? slider({ key: `eq.${i}.q`, label: 'How narrow',
              value: band.q, min: 0.3, max: 8, step: 0.1, fmt: (v) => v.toFixed(1) }) : ''}
          ` : ''}
        </div>`;
      }).join('')}

      <div class="st-h">Compressor</div>
      <label class="tl-toggle" style="width:100%;justify-content:space-between">
        <span>Even out the loud and quiet parts</span>
        <input type="checkbox" id="st-comp" ${st.comp.on ? 'checked' : ''}>
      </label>
      ${st.comp.on ? `
        ${slider({ key: 'comp.threshold', label: 'Starts working at', value: st.comp.threshold,
          min: -60, max: 0, step: 0.5, fmt: (v) => `${v.toFixed(1)}dB` })}
        ${slider({ key: 'comp.ratio', label: 'How hard', value: st.comp.ratio,
          min: 1, max: 20, step: 0.5, fmt: (v) => `${v.toFixed(1)}:1` })}
        ${slider({ key: 'comp.attack', label: 'How fast it grabs', value: st.comp.attack,
          min: 0.0005, max: 0.2, step: 0.0005, fmt: (v) => `${(v * 1000).toFixed(1)}ms` })}
        ${slider({ key: 'comp.release', label: 'How fast it lets go', value: st.comp.release,
          min: 0.02, max: 1.5, step: 0.01, fmt: (v) => `${(v * 1000).toFixed(0)}ms` })}
        ${slider({ key: 'comp.makeup', label: 'Level it back up', value: st.comp.makeup,
          min: 0, max: 24, step: 0.5, fmt: (v) => `+${v.toFixed(1)}dB` })}
        <p class="tiny muted" style="margin:6px 0 0">
          A compressor only turns the loud parts down, so the whole clip ends up quieter —
          <b>level it back up</b> is how you get it back.
        </p>` : ''}

      <div class="st-h">Position and level</div>
      ${slider({ key: 'pan', label: 'Left and right', value: st.pan, min: -1, max: 1, step: 0.01,
        fmt: (v) => (Math.abs(v) < 0.005 ? 'centre'
          : `${Math.abs(Math.round(v * 100))}% ${v < 0 ? 'left' : 'right'}`) })}
      ${slider({ key: 'gain', label: 'Trim', value: st.gain, min: -24, max: 12, step: 0.5,
        fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB` })}
    ` : ''}`}
  `, Boolean(clip.strip && !stripIsFlat(clip.strip)), 'data-min="expert"');
}

/* ------------------------------------------------------------------ */
/* loudness                                                            */
/* ------------------------------------------------------------------ */

export function loudnessMarkup() {
  const t = targetById(targetId);
  return group('Loudness', `
    <p class="tiny muted" style="margin:0 0 9px">
      Every platform turns anything louder than its target down. Mastering louder than
      this does not play louder — it plays turned down, with the dynamics squashed for nothing.
    </p>
    <select class="tp-select" id="ld-target" style="width:100%">
      ${TARGETS.map((x) => `<option value="${esc(x.id)}" ${x.id === targetId ? 'selected' : ''}>
        ${esc(x.name)} — ${x.lufs} LUFS</option>`).join('')}
    </select>
    <p class="tiny muted" style="margin:6px 0 10px">${esc(t.note)}</p>

    <button class="btn btn-sm btn-full" id="ld-check" ${measuring ? 'disabled' : ''}>
      ${measuring ? 'Measuring…' : 'Measure my mix'}</button>

    ${reading ? `
      <div class="note ${Math.abs(reading.lufs - reading.target.lufs) < 1 ? 'ok' : 'info'}"
           style="margin-top:10px">
        <b>${esc(formatLufs(reading.lufs))}</b>
        <span class="tiny"> · true peak ${reading.peak > -100 ? `${reading.peak.toFixed(1)} dBTP` : 'silent'}</span>
        <br>
        <span class="tiny">${esc(verdict(reading))}</span>
      </div>
      ${Math.abs(reading.gainDb) > 0.1 ? `
        <button class="btn btn-sm btn-full" id="ld-apply" style="margin-top:9px">
          ${reading.gainDb > 0 ? 'Turn the mix up' : 'Turn the mix down'}
          ${reading.gainDb > 0 ? '+' : ''}${reading.gainDb.toFixed(1)}dB
        </button>
        <p class="tiny muted" style="margin:7px 0 0">
          Applied to every clip's volume at once, so the balance you set between them
          is untouched. One undo takes it back off.
        </p>` : ''}
    ` : ''}
  `, false, 'data-min="intermediate"');
}

function verdict(r) {
  if (r.silent) return 'There is no sound on the timeline to measure.';
  const off = r.lufs - r.target.lufs;
  if (Math.abs(off) < 1) return `That is right for ${r.target.name}. Nothing to do.`;
  if (r.limited) {
    /* No mention of a limiter: there isn't one, and pointing at a control that
       does not exist is worse than saying nothing. The compressor is the tool
       that actually helps here. */
    return `${Math.abs(off).toFixed(1)} LU too quiet, but the peaks are already near the ceiling — `
      + `it can only come up ${r.gainDb.toFixed(1)}dB before clipping. Use the compressor on the `
      + `loudest clips to make room for the rest.`;
  }
  return off > 0
    ? `${off.toFixed(1)} LU louder than ${r.target.name} wants, so it will be turned down there.`
    : `${Math.abs(off).toFixed(1)} LU quieter than ${r.target.name} wants, so it will sound weak beside everything else.`;
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

export function handleStripInput(e, { live = false, refresh } = {}) {
  const clip = selectedClip();
  if (!clip) return false;

  if (e.target.id === 'st-on') {
    stripOf(clip).on = e.target.checked;
    actions.commit(e.target.checked ? 'Channel strip on' : 'Channel strip off');
    refresh?.();
    return true;
  }
  if (e.target.id === 'st-comp') {
    const st = stripOf(clip);
    st.comp.on = e.target.checked;
    warmStrip(st);
    actions.commit(e.target.checked ? 'Compressor on' : 'Compressor off');
    refresh?.();
    return true;
  }
  const eqOn = e.target.closest('[data-eqon]');
  if (eqOn) {
    const st = stripOf(clip);
    st.eq[Number(eqOn.dataset.eqon)].on = e.target.checked;
    actions.commit('EQ band');
    refresh?.();
    return true;
  }
  if (e.target.id === 'ld-target') {
    targetId = e.target.value;
    reading = null;                 // a reading against the old target is a lie
    refresh?.();
    return true;
  }

  const key = e.target.dataset.k;
  if (!key) return false;
  const st = stripOf(clip);
  const value = Number(e.target.value);

  if (key.startsWith('eq.')) {
    const [, i, field] = key.split('.');
    st.eq[Number(i)][field] = value;
  } else if (key.startsWith('comp.')) {
    st.comp[key.slice(5)] = value;
    // The threshold, ratio and knee change what the node adds on its own, so
    // the correction has to be re-measured before the next build.
    if (!live) warmStrip(st);
  } else if (key === 'pan' || key === 'gain') {
    st[key] = value;
  } else return false;

  if (!live) actions.commit('Adjust the sound', `strip:${key}`);
  return true;
}

export async function handleStripClick(e, refresh) {
  if (e.target.closest('[data-act="upgrade-strip"]')) {
    licence.gate('audio-fx-pro', () => {}, { what: 'The channel strip' });
    return true;
  }

  if (e.target.closest('#ld-check')) {
    if (measuring) return true;
    measuring = true;
    refresh?.();
    try {
      const { renderAudio } = await import('../engine/audio-render.js');
      const { duration } = await import('../engine/project.js');
      const total = duration(S.project);
      if (total < 0.2) { toast('Put something on the timeline first', 'bad'); return true; }
      /*
       * Measured on the real mix, rendered offline through the real graph.
       *
       * Anything cheaper — summing the clip volumes, guessing from the
       * waveform peaks — would be a different number from the one the file
       * will have, which is worse than no number at all.
       */
      const buf = await renderAudio(S.project, { duration: total });
      const target = targetById(targetId);
      reading = { ...normalisationFor(buf, target), target };
    } catch (err) {
      toast(err.message || 'Could not measure the mix', 'bad', 5000);
    } finally {
      measuring = false;
      refresh?.();
    }
    return true;
  }

  if (e.target.closest('#ld-apply')) {
    if (!reading || !Math.abs(reading.gainDb)) return true;
    const factor = 10 ** (reading.gainDb / 20);
    for (const clip of S.project.clips) {
      // Clamped, because a volume above about four is where the mix starts
      // clipping inside the graph rather than at the file.
      clip.volume = Math.max(0, Math.min(4, (clip.volume ?? 1) * factor));
    }
    actions.commit(`Loudness to ${reading.target.name}`);
    toast(`Mix moved ${reading.gainDb > 0 ? 'up' : 'down'} ${Math.abs(reading.gainDb).toFixed(1)}dB — measure again to confirm`,
      'ok', 4600);
    reading = null;
    refresh?.();
    return true;
  }
  return false;
}
