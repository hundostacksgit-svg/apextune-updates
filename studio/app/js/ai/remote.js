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
import { OPERATIONS, OP_SPEC } from './apply.js';
import { TEMPLATES } from '../engine/templates.js';
import { plan as localPlan } from './planner.js';

export function available() {
  return Boolean(API.base);
}

/* ------------------------------------------------------------------ */
/* staying up when the server is not                                   */
/* ------------------------------------------------------------------ */
/*
 * The local planner is always there, so a Worker outage should cost a few
 * seconds and nothing else. Two things make that true:
 *
 *   Retries with backoff, but only for failures worth retrying. A 402 (out of
 *   quota) or a 400 (bad request) will fail identically the second time; a 502
 *   or a dropped connection usually will not.
 *
 *   A circuit breaker. After three consecutive failures we stop trying for two
 *   minutes and go straight to the local planner. Without it, a server that is
 *   down makes every single request wait for a timeout first, which turns one
 *   outage into an app that feels broken.
 */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const BREAKER_AFTER = 3;
const BREAKER_FOR = 2 * 60 * 1000;

let consecutiveFailures = 0;
let openedAt = 0;

function breakerOpen() {
  if (consecutiveFailures < BREAKER_AFTER) return false;
  if (Date.now() - openedAt > BREAKER_FOR) {
    // Let one request through to see whether it is back.
    consecutiveFailures = BREAKER_AFTER - 1;
    return false;
  }
  return true;
}

function noteFailure() {
  consecutiveFailures++;
  if (consecutiveFailures === BREAKER_AFTER) openedAt = Date.now();
}

function noteSuccess() { consecutiveFailures = 0; }

/** Health, for the settings panel. Never throws. */
export async function health() {
  if (!API.base) return { configured: false };
  try {
    const res = await fetch(`${API.base}/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout?.(8000),
    });
    if (!res.ok) return { configured: true, up: false, status: res.status };
    return { configured: true, up: true, ...(await res.json()) };
  } catch (err) {
    return { configured: true, up: false, error: err.message };
  }
}

async function postWithRetry(path, body, { attempts = 3, timeout = 25000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(API.base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout?.(timeout),
      });
      if (res.ok) { noteSuccess(); return res; }
      if (!RETRYABLE.has(res.status)) {
        noteSuccess();     // the server answered; it just said no
        throw new Error(`server returned ${res.status}`);
      }
      lastError = new Error(`server returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    // 1s, then 2s. Long enough for a redeploy or a cold start, short enough
    // that nobody sits watching a spinner.
    if (attempt < attempts - 1) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  noteFailure();
  throw lastError || new Error('no response');
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

  if (breakerOpen()) {
    const fallback = localPlan(prompt, context);
    fallback.warnings = [
      ...(fallback.warnings || []),
      'The cloud planner has been unreachable, so this plan came from the built-in one. '
      + 'It will try the server again in a couple of minutes.',
    ];
    return { ...fallback, source: 'local' };
  }

  try {
    const res = await postWithRetry(API.aiPath, {
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
        // The spec and the style list go with the request so the model writes
        // arguments that work rather than plausible-looking ones, and knows
        // which named styles already exist instead of inventing a worse one.
      spec: OP_SPEC,
      styles: TEMPLATES.map((t) => ({ id: t.id, name: t.name, blurb: t.blurb, tags: t.tags })),
    });
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
    questions: Array.isArray(data.questions) ? data.questions.map((q) => String(q).slice(0, 240)).slice(0, 3) : [],
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
