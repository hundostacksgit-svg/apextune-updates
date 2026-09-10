/*
 * Optional cloud brain.
 *
 * The local planner in planner.js handles the phrasings people actually use,
 * and it runs offline. This adds free-form language on top: when a Worker is
 * configured, the request and a description of the media go to a language
 * model, which replies with the same plan shape apply.js already understands.
 *
 * Three rules this file exists to keep:
 *   1. Only the text and a summary of the media leave the device — never the
 *      footage, never the audio, never a frame.
 *   2. If the model returns anything that isn't a valid plan, we fall straight
 *      back to the local planner rather than showing an error.
 *   3. The user is told which of the two produced the plan they're looking at.
 */

import { API } from '../../../assets/config.js';
import { OPERATIONS } from './apply.js';
import { plan as localPlan } from './planner.js';

export function available() {
  return Boolean(API.base);
}

/** What we're willing to send: names, lengths and shapes. No pixels. */
function describeMedia(project) {
  return project.media.map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind,
    duration: Number((m.duration || 0).toFixed(2)),
    width: m.width,
    height: m.height,
    hasAudio: Boolean(m.hasAudio),
  }));
}

/**
 * Ask for a plan. Always resolves — a failure here is not worth interrupting
 * someone mid-edit for, it just means the local planner answers instead.
 */
export async function askForPlan(prompt, project, context) {
  if (!available()) {
    return { ...localPlan(prompt, context), source: 'local' };
  }

  try {
    const res = await fetch(API.base + API.aiPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        media: describeMedia(project),
        timeline: {
          ratio: project.settings.ratio,
          fps: project.settings.fps,
          clipCount: project.clips.length,
          duration: Number(context.duration?.toFixed?.(2) ?? 0),
        },
        beats: context.beats ? { bpm: context.beats.bpm } : null,
        operations: OPERATIONS,
      }),
      signal: AbortSignal.timeout?.(25000),
    });
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    const data = await res.json();
    const cleaned = validate(data);
    if (!cleaned) throw new Error('the reply was not a usable plan');
    return { ...cleaned, source: 'cloud' };
  } catch (err) {
    const fallback = localPlan(prompt, context);
    fallback.warnings = [
      ...(fallback.warnings || []),
      `The cloud planner was unavailable (${err.message}), so this plan came from the built-in one.`,
    ];
    return { ...fallback, source: 'local' };
  }
}

/**
 * Nothing from the network is trusted. Unknown operations are dropped rather
 * than passed to apply.js, and every field is coerced to the type we expect.
 */
function validate(data) {
  if (!data || !Array.isArray(data.steps)) return null;
  const steps = data.steps
    .filter((s) => s && typeof s.op === 'string' && OPERATIONS.includes(s.op))
    .slice(0, 20)
    .map((s) => ({
      op: s.op,
      args: (s.args && typeof s.args === 'object' && !Array.isArray(s.args)) ? s.args : {},
      label: String(s.label || s.op).slice(0, 140),
      detail: String(s.detail || '').slice(0, 300),
    }));
  if (!steps.length) return null;
  return {
    steps,
    summary: String(data.summary || `${steps.length} steps.`).slice(0, 300),
    warnings: Array.isArray(data.warnings) ? data.warnings.map((w) => String(w).slice(0, 240)).slice(0, 5) : [],
    intent: data.intent && typeof data.intent === 'object' ? data.intent : {},
  };
}

/** Transcription, when the Worker offers it. Returns caption cues or null. */
export async function transcribe(blob, { language } = {}) {
  if (!API.base) return null;
  const form = new FormData();
  form.append('audio', blob, 'audio.webm');
  if (language) form.append('language', language);
  const res = await fetch(API.base + API.transcribePath, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}).`);
  const data = await res.json();
  if (!Array.isArray(data.cues)) return null;
  return data.cues
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && typeof c.text === 'string')
    .map((c) => ({ start: c.start, end: c.end, text: c.text.slice(0, 220) }));
}
