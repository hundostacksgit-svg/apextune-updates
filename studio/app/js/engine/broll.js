/*
 * B-roll matching: which of your own clips belongs over this moment.
 *
 * Every version of this feature I have seen elsewhere quietly means one of two
 * things — a stock library you are being upsold, or shuffle with a nicer name.
 * This is neither. It ranks footage you already imported, against what is
 * actually happening at the playhead, and tells you why each one came up. If
 * the reason is not convincing you can ignore it, which is the difference
 * between a suggestion and a slot machine.
 *
 * What "what is actually happening" means, concretely:
 *   - the caption line under the playhead, if there is one, read for words
 *     that imply a kind of picture;
 *   - how loud and how busy the moment is;
 *   - the shape of the canvas;
 *   - what is already on screen, which the cutaway should not duplicate.
 *
 * Everything is scored off measurements taken once at import (engine/tags.js),
 * so asking for a suggestion is instant and costs no decoding.
 */

import { activeAt, clipsOn, mediaById, addTrack, addClip } from './project.js';

/*
 * Words that imply a picture.
 *
 * Deliberately small and deliberately English. A thousand-word table would be
 * a thousand chances to be confidently wrong about a language nobody checked,
 * and the honest failure mode — "nothing in the words suggested a picture, so
 * this is ranked on the sound alone" — is one the panel can say out loud.
 */
const CUES = [
  /*
   * Plurals are spelled out on every countable noun here, and that is not
   * fussiness — \bfriend\b does not match "friends", because there is no word
   * boundary between d and s. "All of my friends were there" matched nothing
   * at all until this was written properly, and the failure is silent: you get
   * a suggestion ranked on sound alone and no sign that the words were ignored.
   */
  { words: /\b(runs?|running|ran|races?|racing|fast|rush(es)?|chas(e|es|ing)|sprints?|speed|quick|hurry)\b/i,
    want: { energy: 0.55 }, why: 'the line is about speed' },
  { words: /\b(calm|slow|quiet|still|peace(ful)?|rest|relax|gentle|soft)\b/i,
    want: { energy: 0.04 }, why: 'the line is a calm one' },
  { words: /\b(night|dark|evening|midnight|late|shadows?|sleep)\b/i,
    want: { bright: 0.2 }, why: 'the line is set at night' },
  { words: /\b(morning|sun|sunny|bright|day|daylight|light|summer)\b/i,
    want: { bright: 0.68 }, why: 'the line is a bright one' },
  { words: /\b(outside|outdoors|streets?|city|roads?|parks?|sky|beach|mountains?|fields?|gardens?|walk(ing)?)\b/i,
    want: { tag: 'Outdoors' }, why: 'the line is outdoors' },
  { words: /\b(inside|indoors|rooms?|home|house|kitchen|office|desk|studio|bed)\b/i,
    want: { tag: 'Indoors' }, why: 'the line is indoors' },
  { words: /\b(colou?rs?|colou?rful|vivid|neon|rainbow|paint)\b/i,
    want: { tag: 'Colourful' }, why: 'the line is about colour' },
  { words: /\b(faces?|people|persons?|friends?|him|her|them|everyone|crowds?|teams?|family|families)\b/i,
    want: { face: true }, why: 'the line is about people' },
  { words: /\b(details?|close|closer|tiny|small|hands?|eyes?)\b/i,
    want: { tag: 'Close-up' }, why: 'the line asks for something close' },
  /* "everything" and "all of" were in here and had to come out: "everything
     was quiet" is not a request for a wide shot, and "all of my friends" was
     being read as one instead of as people. A cue word has to be about the
     picture, not merely common. */
  { words: /\b(wide|whole|views?|landscapes?|horizon|scenery|far away|skyline)\b/i,
    want: { tag: 'Wide shot' }, why: 'the line asks for something wide' },
];

/*
 * How well a measurement suits what was asked for — but not symmetrically.
 *
 * Asking for calm pictures and getting a *calmer* one than you asked for is
 * not a miss; asking for calm and getting a skate run is. Same for light: a
 * night line suits a darker clip fine and a brighter one badly. Scored with a
 * plain absolute distance, a locked-off shot loses to a mildly busy one when
 * the target is 0.1, purely because 0.17 happens to be nearer the number —
 * which is arithmetic, not judgement. Overshooting away from what was asked
 * costs double; undershooting past it is nearly free.
 */
function fit(value, target, span, middle) {
  const d = value - target;
  const away = (target < middle && d > 0) || (target > middle && d < 0);
  return 1 - Math.min(1, (Math.abs(d) * (away ? 2 : 0.55)) / span);
}

/* Words from a file name, for matching against what is being said. Somebody
   who names a clip "kitchen-wide.mp4" has already told you what is in it. */
function nameWords(name) {
  return (name || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z]+/)
    .filter((w) => w.length > 3);
}

/** The caption line covering a moment, if there is one. */
export function lineAt(project, t) {
  return (project.captions || []).find((c) => t >= c.start && t < c.start + (c.dur ?? 2)) || null;
}

/**
 * What this moment wants, and how it was worked out.
 *
 * Returned together on purpose: the panel shows the reasoning, and a
 * suggestion whose reasoning you cannot see is one you cannot disagree with.
 */
export function wantAt(project, t, { beats = null } = {}) {
  const want = { vertical: (project.settings?.ratio || '9:16') === '9:16' };
  const why = [];
  const tags = [];

  const line = lineAt(project, t);
  if (line?.text) {
    for (const cue of CUES) {
      if (!cue.words.test(line.text)) continue;
      if (cue.want.tag) tags.push(cue.want.tag);
      else Object.assign(want, cue.want);
      why.push(cue.why);
    }
  }

  /*
   * Failing that, the music decides.
   *
   * A fast track wants busy pictures and a slow one wants still ones; that is
   * not subtle and it is not wrong. Only used when the words said nothing, so
   * a calm line over a fast track still gets calm pictures — what is being
   * said beats what is playing under it.
   */
  if (want.energy === undefined && beats?.bpm) {
    want.energy = beats.bpm > 128 ? 0.5 : beats.bpm > 96 ? 0.26 : 0.1;
    why.push(`the music is ${Math.round(beats.bpm)} BPM`);
  }

  // A cutaway is a cutaway: by default, away from the face already on screen.
  if (want.face === undefined) {
    const onScreen = activeAt(project, t).some((c) => {
      const m = mediaById(project, c.mediaId);
      return m?.stats?.skin > 0.1;
    });
    if (onScreen) { want.noFace = true; why.push('there is already a face on screen'); }
  }

  return { want, tags, why, line };
}

/**
 * Rank the project's own footage for a moment.
 *
 * Never invents anything and never reaches off the device. Returns an empty
 * list rather than filler when nothing scores — "none of your clips suit this"
 * is a real answer and a useful one.
 */
export function suggestFor(project, t, { beats = null, limit = 5, minDur = 0.6 } = {}) {
  const { want, tags, why, line } = wantAt(project, t, { beats });

  // What is already here, so a suggestion is never the shot it would cover.
  const here = new Set(activeAt(project, t).map((c) => c.mediaId));
  // And how much each file is leaned on already, so one clip is not the answer
  // to every moment in the edit.
  const used = new Map();
  for (const c of project.clips) used.set(c.mediaId, (used.get(c.mediaId) || 0) + 1);

  const out = [];
  for (const m of project.media) {
    if (m.kind === 'audio' || m.missing) continue;
    if ((m.duration || 0) < minDur) continue;
    if (here.has(m.id)) continue;

    const reasons = [];
    let score = 0;

    if (m.stats) {
      if (want.energy !== undefined) {
        const f = fit(m.stats.motion, want.energy, 0.45, 0.3);
        score += f * 1.4;
        if (f > 0.68) reasons.push(want.energy > 0.3 ? 'plenty of movement' : 'nice and still');
      }
      if (want.bright !== undefined) {
        const f = fit(m.stats.lum, want.bright, 0.45, 0.5);
        score += f;
        if (f > 0.7) reasons.push(want.bright > 0.45 ? 'bright' : 'dark');
      }
      if (want.face) {
        score += m.stats.skin > 0.09 ? 1.2 : -0.5;
        if (m.stats.skin > 0.09) reasons.push('somebody in it');
      }
      if (want.noFace) {
        score += m.stats.skin < 0.06 ? 0.9 : -0.7;
        if (m.stats.skin < 0.06) reasons.push('no face to clash with the one on screen');
      }
      if (want.vertical !== undefined) {
        const fits = Boolean(m.stats.portrait) === want.vertical;
        score += fits ? 0.5 : -0.25;
        if (fits && want.vertical) reasons.push('shot vertical');
      }
    } else {
      // Untagged footage is not excluded, only ranked below what is known —
      // it is still the person's own clip and may be exactly right.
      score += 0.2;
      reasons.push('not analysed yet');
    }

    for (const tag of tags) {
      if (m.tags?.includes(tag)) { score += 1.1; reasons.push(tag.toLowerCase()); }
    }

    /*
     * What the file is called.
     *
     * Worth as much as a tag, because it is often better than one: measurement
     * can tell you a shot is indoors and still, and only the name can tell you
     * it is the kitchen. People name footage for themselves and this is the
     * one place that effort pays off.
     */
    if (line?.text) {
      const said = new Set(nameWords(line.text));
      const hit = nameWords(m.name).filter((w) => said.has(w));
      if (hit.length) {
        score += Math.min(1.6, hit.length * 1.1);
        reasons.push(`named “${hit[0]}”`);
      }
    }

    // A file already used four times is not a fresh cutaway.
    const times = used.get(m.id) || 0;
    score -= Math.min(1.2, times * 0.4);
    if (times) reasons.push(`used ${times}× already`);

    out.push({ media: m, score, reasons });
  }

  out.sort((a, b) => b.score - a.score);
  return { want, why, line, list: out.slice(0, limit).filter((s) => s.score > 0.15) };
}

/**
 * Drop a suggestion in as an overlay above whatever is playing.
 *
 * Above, always: a cutaway that replaced the clip under it would be a
 * destructive edit dressed up as a suggestion, and the whole point is that you
 * can drag it off again and be exactly where you were. The sound underneath
 * keeps playing, because the take under a cutaway is usually the one talking.
 */
export function insertBroll(project, mediaId, at, length = 1.6) {
  const m = mediaById(project, mediaId);
  if (!m) return null;

  const span = Math.max(0.3, Math.min(length, m.duration || length));

  /*
   * Reuse an overlay layer that is free here rather than stacking a new one
   * per cutaway. Six suggestions accepted in a row should be six clips on one
   * or two layers, not a timeline six tracks tall.
   */
  const videoTracks = project.tracks.filter((t) => t.kind === 'video');
  const base = videoTracks[videoTracks.length - 1];
  let target = null;
  for (const track of videoTracks) {
    if (track === base) continue;
    const clash = clipsOn(project, track.id)
      .some((c) => at < c.start + c.dur - 0.001 && at + span > c.start + 0.001);
    if (!clash) { target = track; break; }
  }
  if (!target) target = addTrack(project, 'video', `B-roll ${videoTracks.length}`);

  const clip = addClip(project, {
    mediaId, trackId: target.id, start: at, dur: span, in: 0,
  });
  clip.volume = 0;                     // the take underneath is the one talking
  clip.label = 'B-roll';
  return clip;
}
