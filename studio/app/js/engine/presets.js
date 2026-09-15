/*
 * Presets: one tap, one clip, a whole treatment.
 *
 * The app already had three libraries and none of them was this one.
 *
 *   A **look** is a grade. Contrast, saturation, a split tone. It is one
 *   thing and it does not know what an effect is.
 *
 *   An **effect** is one effect, at its default settings. Useful, and about
 *   as useful as a single guitar pedal — the sound people actually want is
 *   four of them in an order somebody worked out.
 *
 *   A **template** builds a whole edit. It cuts, it paces, it fits music. It
 *   is the wrong tool when you have one shot that needs to look like a
 *   nineteen-eighties camcorder tape and the rest of the edit is fine.
 *
 * A preset is the missing middle: a grade, a stack of effects with their
 * parameters tuned to each other, a transform, and a channel strip, saved
 * together under a name and applied to whatever is selected. It is what
 * Premiere calls an effect preset and what everybody else calls "that one
 * where it goes all crunchy".
 *
 * Two things make it worth building rather than telling people to stack
 * effects themselves:
 *
 *  - The parameters are the whole point. Scanlines at 40 with a chroma shift
 *    at 8 and a tape wobble at 12 reads as VHS; the same three effects at
 *    their defaults read as a mess. Tuning is the work, and the work is what
 *    a preset carries.
 *
 *  - You can save your own. A preset made from a clip you already got right
 *    is the only one guaranteed to suit your footage, and everything here
 *    handles the built-in library and somebody's own the same way.
 */

import { uid } from '../ui.js';
import { makeEffect, EFFECTS } from './effects.js';
import { LOOK_BY_ID } from './filters.js';
import { newStrip } from './audio-strip.js';
import * as store from '../store.js';
import { PRESET_PACKS } from './presets-library.js';

export { PRESET_PACKS };

/* ------------------------------------------------------------------ */
/* the library                                                          */
/* ------------------------------------------------------------------ */

/*
 * User presets live beside the built-in ones and are never merged into them.
 *
 * Kept separate so "Reset to the shipped library" stays possible, so a name
 * clash is a clash between two listed things rather than one quietly winning,
 * and so deleting is only ever allowed on the half somebody made.
 */
let userPresets = [];
let loaded = false;

export async function loadUserPresets() {
  if (loaded) return userPresets;
  try {
    userPresets = (await store.pref('presets')) || [];
  } catch {
    userPresets = [];          // private mode, or a database that will not open
  }
  loaded = true;
  return userPresets;
}

async function saveUserPresets() {
  try { await store.pref('presets', userPresets); }
  catch { /* nothing to do about it; they last the session */ }
}

/** Everything, built-in first, each tagged with where it came from. */
export function allPresets() {
  return [
    ...PRESET_PACKS.map((p) => ({ ...p, mine: false })),
    ...userPresets.map((p) => ({ ...p, mine: true })),
  ];
}

export function presetById(id) {
  return allPresets().find((p) => p.id === id) || null;
}

/** Group -> presets, in declaration order, with "Mine" first when it exists. */
export function presetGroups() {
  const out = {};
  if (userPresets.length) out.Mine = userPresets.map((p) => ({ ...p, mine: true }));
  for (const p of PRESET_PACKS) (out[p.group] ||= []).push({ ...p, mine: false });
  return out;
}

/* ------------------------------------------------------------------ */
/* applying                                                             */
/* ------------------------------------------------------------------ */

/*
 * What a preset is allowed to touch, and what it must leave alone.
 *
 * Never: where the clip sits, how long it is, its in point, its speed, its
 * transitions, its keyframes, its masks. Those are the edit — somebody spent
 * time on them and a preset called "Neon Night" has no business changing when
 * a shot starts. A preset that moved clips would be a template, and there is
 * already a library of those.
 *
 * Position and scale are the one borderline case and they are included,
 * because a punch-in is part of several of these looks and leaving it out
 * makes them land wrong. Rotation and crop are left alone: those are framing
 * decisions, not treatment.
 */
export function applyPreset(clip, preset, { replace = true } = {}) {
  if (!clip || !preset?.apply) return clip;
  const a = preset.apply;

  if (a.look !== undefined || a.color) {
    clip.color = { ...clip.color };
    if (a.look !== undefined) {
      clip.color.look = a.look;
      clip.color.strength = a.strength ?? 1;
    }
    for (const [k, v] of Object.entries(a.color || {})) clip.color[k] = v;
    if (a.wheels) clip.color.wheels = structuredClone(a.wheels);
    if (a.curves) clip.color.curves = structuredClone(a.curves);
  }

  if (a.effects) {
    /*
     * Replace rather than append, by default.
     *
     * Two presets stacked is almost never what somebody meant — they tried
     * one, did not like it, and tried another. Appending leaves the first one
     * underneath and the result looks like neither. Holding the option to
     * append is there for the case where it is deliberate.
     */
    const made = a.effects
      .map((spec) => {
        const inst = makeEffect(spec.id);
        if (!inst) return null;            // an effect this build does not have
        inst.params = { ...inst.params, ...(spec.params || {}) };
        if (spec.on === false) inst.on = false;
        return inst;
      })
      .filter(Boolean);
    clip.effects = replace ? made : [...(clip.effects || []), ...made];
  }

  if (a.transform) {
    clip.transform = { ...clip.transform };
    for (const k of ['scale', 'x', 'y', 'opacity', 'blend']) {
      if (a.transform[k] !== undefined) clip.transform[k] = a.transform[k];
    }
  }

  if (a.strip) clip.strip = { ...newStrip(), ...structuredClone(a.strip) };
  if (a.audioFx !== undefined) clip.audioFx = a.audioFx ? structuredClone(a.audioFx) : null;
  if (a.volume !== undefined) clip.volume = a.volume;

  clip.presetId = preset.id;
  return clip;
}

/** Take everything a preset would set back off a clip. */
export function clearPreset(clip) {
  if (!clip) return clip;
  clip.effects = [];
  clip.color = { ...clip.color, look: 'none', strength: 1 };
  clip.presetId = null;
  return clip;
}

/* ------------------------------------------------------------------ */
/* making one from a clip                                               */
/* ------------------------------------------------------------------ */

/**
 * Capture what a clip is doing, as a preset.
 *
 * Everything `applyPreset` can set and nothing else, so a preset made from a
 * clip and applied to the same clip is a no-op — which is the only sane
 * definition of "save this" and is worth the small amount of care it takes.
 */
export function presetFromClip(clip, name, { group = 'Mine', emoji = '⭐' } = {}) {
  if (!clip) return null;
  const apply = {};

  const colour = {};
  for (const k of ['exposure', 'contrast', 'saturation', 'temperature', 'tint',
    'highlights', 'shadows', 'vignette', 'grain', 'blur', 'sharpen']) {
    const v = clip.color?.[k];
    if (v) colour[k] = v;
  }
  if (Object.keys(colour).length) apply.color = colour;
  if (clip.color?.look && clip.color.look !== 'none') {
    apply.look = clip.color.look;
    apply.strength = clip.color.strength ?? 1;
  }
  if (clip.color?.wheels) apply.wheels = structuredClone(clip.color.wheels);
  if (clip.color?.curves) apply.curves = structuredClone(clip.color.curves);

  if (clip.effects?.length) {
    apply.effects = clip.effects.map((fx) => ({
      id: fx.id, params: { ...fx.params }, on: fx.on !== false,
    }));
  }

  const t = clip.transform || {};
  const transform = {};
  if (t.scale !== undefined && Math.abs(t.scale - 1) > 0.001) transform.scale = t.scale;
  if (t.x) transform.x = t.x;
  if (t.y) transform.y = t.y;
  if (t.opacity !== undefined && Math.abs(t.opacity - 1) > 0.001) transform.opacity = t.opacity;
  if (t.blend && t.blend !== 'normal') transform.blend = t.blend;
  if (Object.keys(transform).length) apply.transform = transform;

  if (clip.strip && clip.strip.on) apply.strip = structuredClone(clip.strip);
  if (clip.audioFx) apply.audioFx = structuredClone(clip.audioFx);

  return {
    id: uid('pr'),
    name: String(name || 'My preset').slice(0, 48),
    group,
    emoji,
    tier: 'free',
    blurb: describePreset({ apply }),
    tags: [],
    apply,
    madeAt: Date.now(),
  };
}

export async function saveUserPreset(preset) {
  if (!preset) return null;
  await loadUserPresets();
  userPresets = [preset, ...userPresets.filter((p) => p.id !== preset.id)];
  await saveUserPresets();
  return preset;
}

export async function deleteUserPreset(id) {
  await loadUserPresets();
  userPresets = userPresets.filter((p) => p.id !== id);
  await saveUserPresets();
}

export async function renameUserPreset(id, name) {
  await loadUserPresets();
  const p = userPresets.find((x) => x.id === id);
  if (p) { p.name = String(name || p.name).slice(0, 48); await saveUserPresets(); }
}

/* ------------------------------------------------------------------ */
/* describing                                                           */
/* ------------------------------------------------------------------ */

/**
 * A sentence saying what a preset actually does.
 *
 * Written from the preset rather than stored beside it, so it cannot go stale
 * and so a preset somebody saved gets one too — "3 effects, punchy grade,
 * scaled 104%" is more use on a thing you made yourself than a blank line.
 */
export function describePreset(preset) {
  const a = preset?.apply;
  if (!a) return '';
  const bits = [];

  const n = a.effects?.length || 0;
  if (n) {
    const names = a.effects.slice(0, 3)
      .map((e) => EFFECTS[e.id]?.name || e.id)
      .join(', ');
    bits.push(n > 3 ? `${names} +${n - 3} more` : names);
  }
  if (a.look && a.look !== 'none') {
    bits.push(`${LOOK_BY_ID[a.look]?.name || a.look} grade`);
  } else if (a.color && Object.keys(a.color).length) {
    bits.push('a graded pass');
  }
  if (a.wheels) bits.push('wheels');
  if (a.transform?.scale) bits.push(`${Math.round(a.transform.scale * 100)}% scale`);
  if (a.transform?.blend && a.transform.blend !== 'normal') bits.push(a.transform.blend);
  if (a.strip) bits.push('an audio strip');
  return bits.join(' · ');
}

/** Everything a preset will touch, for the "this will replace" warning. */
export function presetTouches(preset) {
  const a = preset?.apply || {};
  const out = [];
  if (a.effects?.length) out.push('effects');
  if (a.look !== undefined || a.color || a.wheels || a.curves) out.push('colour');
  if (a.transform) out.push('transform');
  if (a.strip || a.audioFx || a.volume !== undefined) out.push('audio');
  return out;
}

/* ------------------------------------------------------------------ */
/* searching                                                            */
/* ------------------------------------------------------------------ */

export function searchPresets(query) {
  const q = String(query || '').trim().toLowerCase();
  const all = allPresets();
  if (!q) return all;
  return all.filter((p) => {
    const hay = `${p.name} ${p.group} ${p.id} ${(p.tags || []).join(' ')} ${p.blurb || ''}`.toLowerCase();
    return hay.includes(q);
  });
}
