/*
 * Edit templates.
 *
 * Each one is a function that reads what you have — how many clips, whether
 * there is music, what tempo, how long you want it — and returns a list of the
 * same operations the AI planner emits. So a template and an AI request go
 * through one code path, a template can be reviewed step by step before it
 * runs, and one Ctrl+Z undoes either.
 *
 * This file is also the style dictionary the planner uses. When someone types
 * "make it an anime edit", the planner finds the template whose tags match and
 * builds from it, which is why a phrase nobody anticipated still produces a
 * sensible edit instead of a shrug.
 */

import { TEMPLATE_PACKS } from './templates-library.js';

/* Cut lengths, in beats, for a given energy. Beats rather than seconds so the
   same template works at 90bpm and 170bpm without feeling different. */
const PACE_BEATS = { frantic: 1, fast: 2, medium: 4, slow: 8 };

/**
 * Should this template build the cut, or only style what is already there?
 *
 * Explicit beats implicit: if the caller said, that is the answer. Otherwise
 * an empty timeline is built (pressing a style with nothing on the timeline
 * must do something) and an edited one is left alone.
 */
function wantsRebuild(ctx) {
  if (ctx.rebuild !== undefined) return Boolean(ctx.rebuild);
  if (ctx.alwaysRebuild) return true;
  return !(ctx.onTimeline > 0);
}

/**
 * Wrap a step that changes the edit rather than the look.
 *
 * Removing silence, re-syncing to a track, re-laying-out — all of these move
 * or delete clips, and all of them belong on the same switch as the layout
 * itself. Returned as an empty list when styling, so the caller can spread it
 * unconditionally.
 */
function structural(ctx, step) {
  return wantsRebuild(ctx) ? [step] : [];
}

function beatsToSeconds(beats, bpm) {
  return (60 / (bpm || 120)) * beats;
}

/**
 * The structural half of a template: the canvas shape and the cut itself.
 *
 * This only runs when there is nothing to preserve, or when somebody asks for
 * it outright.
 *
 * A style is a look. "Anime AMV" means impact frames, chromatic hits and speed
 * lines — it does not mean "throw away the edit I just spent an hour on and
 * lay my clips out again". Rebuilding by default made every style unusable on
 * a real edit: you could not try one to see what it looked like, because
 * trying it destroyed the thing you were trying it on.
 *
 * So the rule is: an empty timeline gets built, an edited one gets styled.
 * Somebody who genuinely wants a template to construct the cut can still ask,
 * and templates that exist purely to cut — the beat-sync one — always do it,
 * because that is what they say they are.
 *
 * `prefer` is the template's natural shape. An explicit request always wins
 * over it — asking for "a cinematic edit in 9:16" must not quietly produce
 * 16:9 because that is what the template usually does.
 */
function foundation(ctx, { prefer, pace, targetDur, shuffle = false }) {
  if (!wantsRebuild(ctx)) return [];
  const steps = [];
  const ratio = ctx.wantRatio || prefer;
  if (ratio && ratio !== ctx.ratio) {
    steps.push({
      op: 'setRatio', args: { ratio },
      label: `Switch the canvas to ${ratio}`,
      detail: ratio === '9:16'
        ? 'Full-screen on a phone, which is what TikTok, Reels and Shorts want.'
        : `Everything is reframed to ${ratio}.`,
    });
  }

  if (ctx.hasMusic && ctx.bpm) {
    const every = PACE_BEATS[pace] ?? 4;
    steps.push({
      op: 'beatCut',
      args: { targetDur, every, shuffle },
      label: `Cut on the beat at ${ctx.bpm} BPM`,
      detail: `A cut every ${every === 1 ? 'beat' : `${every} beats`} — about ${
        beatsToSeconds(every, ctx.bpm).toFixed(2)}s a shot. The edit lands with the music instead of near it.`,
    });
  } else {
    const each = beatsToSeconds(PACE_BEATS[pace] ?? 4, 120);
    steps.push({
      op: 'layout',
      args: { targetDur, clipLength: each, shuffle, pickBest: true },
      label: targetDur
        ? `Build a ${Math.round(targetDur)}s cut from your clips`
        : `Lay the clips out at a ${pace} pace`,
      detail: `About ${each.toFixed(1)}s a shot, taking the most active part of each clip rather than the first few seconds.`,
    });
  }
  return steps;
}

/* ------------------------------------------------------------------ */
/* the templates                                                       */
/* ------------------------------------------------------------------ */

export const TEMPLATES = [

  {
    id: 'anime-amv',
    name: 'Anime AMV',
    emoji: '⚔️',
    tier: 'free',
    blurb: 'Beat-slammed cuts, zoom punches, chromatic hits, impact frames and speed lines.',
    wants: 'Two or more clips and a track with a strong beat.',
    tags: ['anime', 'amv', 'weeb', 'manga', 'edit', 'hard', 'slam', 'impact', 'otaku', 'naruto', 'jjk', 'demon slayer'],
    build(ctx) {
      const pace = ctx.pace || 'fast';
      const steps = foundation(ctx, { prefer: '9:16', pace, targetDur: ctx.targetDur, shuffle: ctx.shuffle });

      steps.push({
        op: 'beatZoom', args: { amount: 0.16, hold: 0.14 },
        label: 'Punch in on every beat',
        detail: 'A quick scale-up that settles before the next hit. Keyframed, so you can soften or remove it per shot.',
      });
      steps.push({
        op: 'addEffect',
        args: { effect: 'rgbSplit', params: { amount: 22, pulse: 70 }, scope: 'all' },
        label: 'Chromatic split, pulsing on the beat',
        detail: 'Hard on the hit, gone by the next one. This is the thing that reads as "edited" more than any other effect.',
      });
      steps.push({
        op: 'addEffect',
        args: { effect: 'motionBlur', params: { amount: 55, samples: 6 }, scope: 'all' },
        label: 'Motion blur through the movement',
        detail: 'Sampled from the actual push and shake, so fast frames smear the way film does instead of looking like stills.',
      });
      steps.push({
        op: 'impactFrames',
        args: { every: 4, style: 'invert', length: 0.07 },
        label: 'Impact frames on the big hits',
        detail: 'One or two inverted frames on every fourth beat — the slam an anime cut lands on.',
      });
      steps.push({
        op: 'addEffect',
        args: { effect: 'speedLines', params: { amount: 60, length: 55, colour: '#ffffff', spin: 45 }, scope: 'accent', every: 4 },
        label: 'Speed lines on the accent shots',
        detail: 'Drawn, not an overlay file, so they scale to any resolution and take any colour.',
      });
      steps.push({
        op: 'applyLook', args: { look: 'punch', strength: 0.85 },
        label: 'Punchy grade',
        detail: 'Contrast and saturation up. Anime source is already graded, so this is a nudge rather than a rework.',
      });
      steps.push({
        op: 'addTransitions', args: { type: 'zoomPunch', dur: 0.14 },
        label: 'Zoom-punch the cuts',
        detail: 'Short enough that it reads as an impact rather than a transition.',
      });
      if (ctx.hasMusic) {
        steps.push({
          op: 'fitMusic', args: { fadeOut: 0.6, duck: false },
          label: 'Fit the track to the edit',
          detail: 'Trimmed to length with a short fade, no ducking — the music is the point here.',
        });
      }
      return steps;
    },
  },

  {
    id: 'velocity',
    name: 'Velocity edit',
    emoji: '🌀',
    tier: 'free',
    blurb: 'Speed ramps into every cut, zoom blur on the acceleration, heavy glow.',
    wants: 'A few clips with movement in them.',
    tags: ['velocity', 'speed ramp', 'ramp', 'smooth', 'flow', 'transition edit', 'fast'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'fast', targetDur: ctx.targetDur });
      steps.push({
        op: 'speedRamp', args: { peak: 2.6, floor: 0.55, curve: 'ease' },
        label: 'Ramp the speed into every cut',
        detail: 'Each shot slows at its start and accelerates into the next one. Real time remapping, not a speed dropdown.',
      });
      steps.push({
        op: 'addEffect',
        args: { effect: 'zoomBlur', params: { amount: 45 }, scope: 'all' },
        label: 'Zoom blur on the acceleration',
        detail: 'Radial smear from the centre, which is what sells the speed.',
      });
      steps.push({
        op: 'addEffect',
        args: { effect: 'motionBlur', params: { amount: 70, samples: 8 }, scope: 'all' },
        label: 'Heavy motion blur',
        detail: 'Eight samples per frame. It costs some preview speed and it is what makes a velocity edit look expensive.',
      });
      steps.push({
        op: 'addEffect',
        args: { effect: 'glow', params: { amount: 35, radius: 22, threshold: 55 }, scope: 'all' },
        label: 'Bloom on the highlights',
        detail: 'Only the bright parts, so the frame glows rather than going milky.',
      });
      steps.push({
        op: 'addTransitions', args: { type: 'whip', dur: 0.2 },
        label: 'Whip between shots',
        detail: 'Blurred pan, which hides the cut completely.',
      });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 0.8, duck: false }, label: 'Fit the track', detail: 'Trimmed with a fade.' });
      return steps;
    },
  },

  {
    id: 'phonk',
    name: 'Phonk / drift',
    emoji: '🏎️',
    tier: 'free',
    blurb: 'Dark grade, VHS wobble, hard shake, strobe on the drop.',
    wants: 'Clips with motion, and a phonk track.',
    tags: ['phonk', 'drift', 'car', 'jdm', 'dark', 'grimy', 'sped up', 'brazilian'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'fast', targetDur: ctx.targetDur });
      steps.push({ op: 'applyLook', args: { look: 'crush', strength: 1 },
        label: 'Crushed-black grade', detail: 'Deep shadows and lifted contrast — the phonk look.' });
      steps.push({ op: 'addEffect', args: { effect: 'vhsWobble', params: { amount: 35, bands: 22 }, scope: 'all' },
        label: 'VHS wobble', detail: 'Horizontal band displacement, like a worn tape.' });
      steps.push({ op: 'addEffect', args: { effect: 'shake', params: { amount: 45, speed: 26, rotate: 35 }, scope: 'all' },
        label: 'Hand-held shake', detail: 'Scaled up slightly so the shake never shows the frame edge.' });
      steps.push({ op: 'addEffect', args: { effect: 'rgbSplit', params: { amount: 30, pulse: 60 }, scope: 'all' },
        label: 'Chromatic split on the beat', detail: 'Pulses with the track.' });
      steps.push({ op: 'addEffect', args: { effect: 'scanlines', params: { amount: 30, gap: 4, curve: 35 }, scope: 'all' },
        label: 'Scanlines and screen curve', detail: 'Pushes it further from "phone video".' });
      steps.push({ op: 'addTransitions', args: { type: 'glitch', dur: 0.18 },
        label: 'Glitch the cuts', detail: 'Band displacement plus a chromatic split on the join.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 0.5, duck: false }, label: 'Fit the track', detail: 'Trimmed with a short fade.' });
      return steps;
    },
  },

  {
    id: 'aesthetic',
    name: 'Aesthetic / dreamy',
    emoji: '🌸',
    tier: 'free',
    blurb: 'Slow dissolves, soft glow, light leaks, pastel grade, letterbox.',
    wants: 'Any footage. Photos work well.',
    tags: ['aesthetic', 'dreamy', 'soft', 'pretty', 'vibe', 'calm', 'pastel', 'film', 'nostalgic', 'memories'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'slow', targetDur: ctx.targetDur });
      steps.push({ op: 'applyLook', args: { look: 'pastel', strength: 0.9 },
        label: 'Pastel grade', detail: 'Lifted blacks, softened contrast.' });
      steps.push({ op: 'addEffect', args: { effect: 'glow', params: { amount: 45, radius: 26, threshold: 35 }, scope: 'all' },
        label: 'Soft bloom', detail: 'Diffusion, the way a promist filter behaves.' });
      steps.push({ op: 'addEffect', args: { effect: 'lightLeak', params: { amount: 40, colour: '#ffb37a', move: 25 }, scope: 'all' },
        label: 'Drifting light leak', detail: 'Moves slowly across the frame so it never looks pasted on.' });
      steps.push({ op: 'kenBurns', args: { amount: 0.1 },
        label: 'Slow push on the stills', detail: 'A still on screen for three seconds looks broken; a gentle zoom fixes it.' });
      steps.push({ op: 'addEffect', args: { effect: 'letterbox', params: { amount: 10 }, scope: 'all' },
        label: 'Letterbox bars', detail: 'Reads as film without changing the export ratio.' });
      steps.push({ op: 'addTransitions', args: { type: 'blurDissolve', dur: 0.8 },
        label: 'Blur dissolves', detail: 'Long and soft.' });
      steps.push({ op: 'fadeEnds', args: { dur: 0.8 }, label: 'Fade in and out', detail: 'Most of a second at each end.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 1.6, duck: true }, label: 'Fit the music', detail: 'Long fade, ducked under any voice.' });
      return steps;
    },
  },

  {
    id: 'talking-head',
    name: 'Talking head cleanup',
    emoji: '🎙️',
    tier: 'free',
    blurb: 'Cuts the dead air, punches in when you speak, adds captions.',
    wants: 'One clip of someone talking.',
    tags: ['talking', 'podcast', 'vlog talking', 'jump cut', 'silence', 'youtuber', 'explain', 'tutorial', 'face cam'],
    build(ctx) {
      /*
       * Lay the clips out first when there is nothing on the timeline.
       *
       * This template is built around removing silences, which only means
       * something once there is something to remove — so on an empty timeline
       * it produced a plan that did nothing at all. A talking-head cut wants
       * the takes in order at a slow pace, not shuffled and not chopped to a
       * beat, which is what it asks for here.
       */
      const steps = [...foundation(ctx, {
        prefer: ctx.wantRatio || ctx.ratio,
        pace: 'slow',
        targetDur: ctx.targetDur,
        shuffle: false,
      })];
      // Deleting every pause rewrites the edit, so it belongs with the layout
      // rather than with the look. Styling an edit that has already had its
      // silences cut — or one that was cut by hand on purpose — must not go
      // back through and cut it again.
      steps.push(...structural(ctx, {
        op: 'removeSilence', args: { minLen: 0.3, pad: 0.06 },
        label: 'Cut out the silences',
        detail: 'Every pause longer than a third of a second goes and the timeline closes up. This is the jump-cut look, done in one press.',
      }));
      steps.push({
        op: 'autoZoomSpeech', args: { amount: 0.09, alternate: true },
        label: 'Punch in and out as you talk',
        detail: 'Alternating framing on each cut so a run of jump cuts does not look like one static shot chopped up.',
      });
      steps.push({
        op: 'captions', args: { style: ctx.captionStyle || 'tiktok' },
        label: 'Add captions',
        detail: 'Timed to where the speech actually is.',
      });
      steps.push({
        op: 'applyLook', args: { look: 'soft', strength: 0.6 },
        label: 'Gentle skin grade',
        detail: 'Softens contrast slightly and warms it. Subtle on purpose.',
      });
      return steps;
    },
  },

  {
    id: 'cinematic',
    name: 'Cinematic',
    emoji: '🎬',
    tier: 'free',
    blurb: 'Teal and orange, long dissolves, letterbox, slow push.',
    wants: 'Landscape or travel footage.',
    tags: ['cinematic', 'film', 'movie', 'trailer', 'travel', 'moody', 'epic', 'drone'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '16:9', pace: ctx.pace || 'slow', targetDur: ctx.targetDur });
      steps.push({ op: 'applyLook', args: { look: 'cinematic', strength: 1 },
        label: 'Teal and orange grade', detail: 'Split-toned shadows and highlights, per clip so you can change any one shot.' });
      steps.push({ op: 'addEffect', args: { effect: 'letterbox', params: { amount: 12 }, scope: 'all' },
        label: 'Cinemascope bars', detail: '2.39-ish framing without changing the export size.' });
      steps.push({ op: 'kenBurns', args: { amount: 0.08 }, label: 'Slow push', detail: 'Barely perceptible, and it stops static shots feeling dead.' });
      steps.push({ op: 'addTransitions', args: { type: 'dissolve', dur: 0.9 }, label: 'Long dissolves', detail: 'Nearly a second.' });
      steps.push({ op: 'fadeEnds', args: { dur: 1 }, label: 'Fade in and out', detail: 'A second at each end.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 2, duck: true }, label: 'Fit the music', detail: 'Long fade, ducked under voice.' });
      return steps;
    },
  },

  {
    id: 'gaming',
    name: 'Gaming highlights',
    emoji: '🎮',
    tier: 'free',
    blurb: 'Fast cuts, zoom on the kills, glow, big impact text.',
    wants: 'Gameplay clips.',
    tags: ['gaming', 'game', 'fps', 'kill', 'clutch', 'highlight', 'montage', 'fortnite', 'warzone', 'valorant'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'fast', targetDur: ctx.targetDur });
      steps.push({ op: 'beatZoom', args: { amount: 0.12, hold: 0.12 }, label: 'Zoom on the beat', detail: 'Quick punch-in on each hit.' });
      steps.push({ op: 'applyLook', args: { look: 'vivid', strength: 0.9 }, label: 'Vivid grade', detail: 'Games are already saturated; this pushes it to read on a phone.' });
      steps.push({ op: 'addEffect', args: { effect: 'glow', params: { amount: 30, radius: 16, threshold: 60 }, scope: 'all' },
        label: 'Highlight glow', detail: 'Only the brightest parts — muzzle flashes and UI.' });
      steps.push({ op: 'addEffect', args: { effect: 'shake', params: { amount: 25, speed: 30, rotate: 15 }, scope: 'accent', every: 3 },
        label: 'Shake on the accents', detail: 'Every third shot, so it stays an accent rather than a headache.' });
      steps.push({ op: 'addTransitions', args: { type: 'zoomPunch', dur: 0.15 }, label: 'Punch the cuts', detail: 'Short and hard.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 0.6, duck: false }, label: 'Fit the track', detail: 'Trimmed with a fade.' });
      return steps;
    },
  },

  {
    id: 'product',
    name: 'Product / ad',
    emoji: '🛍️',
    tier: 'free',
    blurb: 'Clean cuts, bright grade, a hook on the front, a call to action at the end.',
    wants: 'Product shots, and a line to say.',
    tags: ['product', 'ad', 'advert', 'commercial', 'brand', 'shop', 'promo', 'launch', 'ecom', 'dropship'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'medium', targetDur: ctx.targetDur || 20 });
      steps.push({ op: 'applyLook', args: { look: 'punch', strength: 0.7 }, label: 'Clean bright grade', detail: 'Contrast up, colour honest — a product has to look like itself.' });
      steps.push({ op: 'kenBurns', args: { amount: 0.08 }, label: 'Slow push on the stills', detail: 'Keeps a static product shot alive.' });
      steps.push({
        op: 'addTitle',
        args: { content: ctx.hookText || 'Watch this', preset: 'hook', at: 0, dur: 2 },
        label: 'Hook on the first two seconds',
        detail: 'Inside the safe area, so no platform button covers it. Change the words in the Text panel.',
      });
      steps.push({
        op: 'addTitle',
        args: { content: ctx.ctaText || 'Link in bio', preset: 'endcard', at: -2.4, dur: 2.4 },
        label: 'Call to action at the end',
        detail: 'The last two and a half seconds.',
      });
      steps.push({ op: 'addTransitions', args: { type: 'dissolve', dur: 0.25 }, label: 'Quick dissolves', detail: 'Clean, not flashy.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 1, duck: true }, label: 'Fit the music', detail: 'Ducked under any voice-over.' });
      return steps;
    },
  },

  {
    id: 'meme',
    name: 'Meme cut',
    emoji: '💀',
    tier: 'free',
    blurb: 'Hard cuts, zoom punches, impact frames, big outlined text.',
    wants: 'Anything funny.',
    tags: ['meme', 'funny', 'shitpost', 'brainrot', 'edit meme', 'comedy', 'reaction'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'frantic', targetDur: ctx.targetDur });
      steps.push({ op: 'beatZoom', args: { amount: 0.22, hold: 0.1 }, label: 'Hard zoom punches', detail: 'Bigger than tasteful, which is the point.' });
      steps.push({ op: 'impactFrames', args: { every: 2, style: 'white', length: 0.05 }, label: 'White flash frames', detail: 'Every other beat.' });
      steps.push({ op: 'addEffect', args: { effect: 'rgbSplit', params: { amount: 40, pulse: 80 }, scope: 'all' },
        label: 'Heavy chromatic split', detail: 'Slammed on the beat.' });
      steps.push({ op: 'addTitle', args: { content: ctx.hookText || 'POV:', preset: 'headline', at: 0, dur: 1.8 },
        label: 'Big outlined text', detail: 'Change the words in the Text panel.' });
      steps.push({ op: 'addTransitions', args: { type: 'zoomPunch', dur: 0.1 }, label: 'Slam the cuts', detail: 'As short as it goes.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 0.3, duck: false }, label: 'Fit the track', detail: 'Barely any fade.' });
      return steps;
    },
  },

  {
    id: 'sports',
    name: 'Sports / highlight',
    emoji: '🏀',
    tier: 'free',
    blurb: 'Speed ramps into the moment, slow-mo on the play, punchy grade.',
    wants: 'Action footage.',
    tags: ['sports', 'football', 'soccer', 'basketball', 'gym', 'workout', 'lift', 'training', 'highlight reel'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'fast', targetDur: ctx.targetDur });
      steps.push({ op: 'speedRamp', args: { peak: 2, floor: 0.4, curve: 'ease' },
        label: 'Ramp into slow motion', detail: 'Fast into the moment, slow through it. Best on footage shot at 60fps or higher.' });
      steps.push({ op: 'applyLook', args: { look: 'punch', strength: 1 }, label: 'Punchy grade', detail: 'Contrast and saturation up.' });
      steps.push({ op: 'addEffect', args: { effect: 'motionBlur', params: { amount: 50, samples: 6 }, scope: 'all' },
        label: 'Motion blur', detail: 'Smooths the ramp so the speed change reads as motion, not stutter.' });
      steps.push({ op: 'addTransitions', args: { type: 'whip', dur: 0.18 }, label: 'Whip between plays', detail: 'Hides the cut.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 0.8, duck: false }, label: 'Fit the track', detail: 'Trimmed with a fade.' });
      return steps;
    },
  },

  {
    id: 'sync-only',
    name: 'Just sync to my music',
    emoji: '🎵',
    tier: 'free',
    blurb: 'Keeps your clips and your order — only re-times the cuts onto the beat.',
    wants: 'Clips already on the timeline, and a music track.',
    tags: ['sync', 'sync to music', 'sync to the beat', 'to the audio', 'match the music', 'time to music', 'on beat', 'keep my order'],
    build(ctx) {
      const steps = [{
        op: 'syncToTrack',
        args: { every: PACE_BEATS[ctx.pace || 'medium'] ?? 4, keepOrder: true, trim: true },
        label: `Re-time your cuts onto the beat${ctx.bpm ? ` (${ctx.bpm} BPM)` : ''}`,
        detail: 'Your clips, your order, your content — each one is trimmed or extended so its cut lands exactly on a beat. Nothing is replaced.',
      }];
      if (ctx.hasMusic) {
        steps.push({ op: 'fitMusic', args: { fadeOut: 1, duck: false },
          label: 'Fit the track to the finished length', detail: 'Trimmed with a fade at the end.' });
      }
      return steps;
    },
  },

  {
    id: 'listicle',
    name: 'Top 5 / listicle',
    emoji: '🔢',
    tier: 'free',
    blurb: 'One number per clip, counting down, with a bar under each.',
    wants: 'One clip per item.',
    tags: ['listicle', 'top 5', 'top 10', 'countdown', 'ranking', 'tier list', 'best of'],
    build(ctx) {
      const steps = foundation(ctx, { prefer: '9:16', pace: ctx.pace || 'medium', targetDur: ctx.targetDur });
      steps.push({
        op: 'numberClips', args: { countdown: true, preset: 'counter' },
        label: 'Number each clip, counting down',
        detail: 'One big number per shot, animated in. Edit any of them in the Text panel.',
      });
      steps.push({ op: 'applyLook', args: { look: 'vivid', strength: 0.7 }, label: 'Vivid grade', detail: 'Reads well at feed size.' });
      steps.push({ op: 'addTransitions', args: { type: 'slideLeft', dur: 0.25 }, label: 'Slide between items', detail: 'Reads as a list.' });
      if (ctx.hasMusic) steps.push({ op: 'fitMusic', args: { fadeOut: 1, duck: true }, label: 'Fit the music', detail: 'Ducked under voice.' });
      return steps;
    },
  },
];

/*
 * The generated library folds in after the hand-written twelve.
 *
 * Order matters for two reasons. The originals stay at the top of the panel,
 * which is where people who already know this app expect them. And a hand-
 * written style wins an id collision, because projects and the AI both
 * reference styles by id — a generated one quietly taking over "anime-amv"
 * would change what an existing request does.
 */
const seen = new Set(TEMPLATES.map((t) => t.id));
TEMPLATES.push(...TEMPLATE_PACKS.filter((t) => !seen.has(t.id)));

/** Group -> styles, for browsing a library this size. */
export const TEMPLATE_GROUPS_ALL = TEMPLATES.reduce((acc, t) => {
  (acc[t.group || 'Originals'] ||= []).push(t);
  return acc;
}, {});

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/**
 * Which template best matches a phrase.
 *
 * Scored rather than first-match: "fast anime edit for my gaming clips"
 * should land on the anime template because the word carries more weight than
 * the subject matter, and a tie should not depend on declaration order.
 */
export function matchTemplate(text) {
  const s = String(text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const template of TEMPLATES) {
    let score = 0;
    for (const tag of template.tags) {
      if (!s.includes(tag)) continue;
      // A longer tag is a more specific match: "sync to the beat" beats "sync".
      score += 1 + tag.length / 10;
    }
    if (s.includes(template.name.toLowerCase())) score += 5;
    if (score > bestScore) { bestScore = score; best = template; }
  }
  return bestScore >= 1 ? { template: best, score: bestScore } : null;
}

/** Build a template's steps for the current project. */
export function buildTemplate(id, ctx) {
  const template = TEMPLATE_BY_ID[id];
  if (!template) return null;
  return {
    template,
    steps: template.build(ctx) || [],
    summary: `${template.name} — ${template.blurb}`,
  };
}
