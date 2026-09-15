/*
 * The promo composition: scenes positioned for one moment in time.
 *
 * A video here is a list of scenes (videos.js), each a few beats long. This
 * file builds every scene's DOM once, then exposes window.seek(t), which sets
 * every element for the frame at t seconds: which scene is on, where each word
 * is in its pop, where the cursor is, how far the counter has counted. The
 * renderer (render.mjs) calls seek for each frame and screenshots it, so the
 * output is exact and repeatable — no screen recording, no dropped frames, no
 * "the machine was busy".
 *
 * Scene durations are in beats of the music, so every cut lands on a beat of
 * the beat the app's own beatmaker made. Cheap trick, and the reason the
 * videos feel edited instead of assembled.
 */
import { VIDEOS, STILLS, DROP_TONES } from './videos.js';

const q = new URLSearchParams(location.search);
const FMT = q.get('fmt') || 'tiktok';
const SIZES = { tiktok: [1080, 1920], yt: [1920, 1080], feed: [1080, 1350], thumb: [1280, 720] };
const [W, H] = SIZES[FMT] || SIZES.tiktok;
const VERT = H > W;
const A = '/promo-assets';
const ALL = [...VIDEOS, ...STILLS];
const spec = ALL.find((v) => v.id === q.get('video')) || VIDEOS[0];

const stage = document.getElementById('stage');
stage.className = `fmt-${FMT}`;
stage.style.width = `${W}px`;
stage.style.height = `${H}px`;

/* ---------------------------------------------------------------- helpers */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p) => { const c = 1.70158, d = c + 1; return 1 + d * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const lerp = (a, b, p) => a + (b - a) * p;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const money = (n) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
/** The one entrance used everywhere: rise, scale up with a little overshoot, fade in. */
function pop(node, p, { y = 40, from = 0.6 } = {}) {
  node.style.opacity = p;
  node.style.transform = `translateY(${(1 - p) * y}px) scale(${lerp(from, 1, outBack(p))})`;
}
/** Interpolate a keyframe list [{at, ...fields}] at local time l; holds before the first and after the last. */
function keyAt(keys, l, fields) {
  if (!keys || !keys.length) return null;
  if (l <= keys[0].at) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (l < b.at) {
      const p = inOut(prog(l, a.at, b.at));
      const o = { at: l };
      for (const f of fields) o[f] = lerp(a[f] ?? 0, b[f] ?? 0, p);
      return o;
    }
  }
  return keys[keys.length - 1];
}
const CURSOR_SVG = '<svg viewBox="0 0 24 24" width="56" height="56"><path d="M5 3l14 8.2-6.3 1.3 3.6 7.2-2.7 1.3-3.6-7.3L5 17.4z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/* ---------------------------------------------------------------- music, or a voice */
/*
 * A narrated tour has no music and takes its timing from the speech instead:
 * voice.mjs says each line, measures it, and writes the start and length of
 * every scene here. The picture then holds for exactly as long as the
 * sentence about it, which is the whole reason these read like a tour rather
 * than a slideshow with a voice laid over it.
 */
const VOICE = spec.voice ? await fetch(`${A}/voice/${spec.id}.json`).then((r) => r.json()).catch(() => null) : null;
const music = spec.music
  ? await fetch(`${A}/music/${spec.music}.json`).then((r) => r.json()).catch(() => ({ bpm: 120, beats: [] }))
  : { bpm: 120, beats: [] };
/* The audio-repair scene draws measurements, not a drawing of measurements:
   this file is written by running the app's own audio-repair.js over a
   deliberately awful recording. Missing is fine — no scene needs it. */
const AUDIO = await fetch(`${A}/audio-repair.json`).then((r) => r.json()).catch(() => null);
/*
 * Where the controls are in each screenshot, measured by shots.mjs at the
 * instant it took them. A scene says `on: 'plan'` and the cursor goes to the
 * middle of the thing that was actually on screen — so a layout change moves
 * the cursor with it instead of leaving it pointing at empty chrome.
 */
const MARKS = await fetch(`${A}/shots/shots.json`).then((r) => r.json()).catch(() => ({}));
const BPM = music.bpm || 120;
const BEAT = 60 / BPM;
const BEATS = music.beats && music.beats.length ? music.beats : Array.from({ length: 600 }, (_, i) => i * BEAT);
let pulseNow = 0;
function pulseAt(t) {
  /* Nothing is playing, so nothing pulses. Scenes that scale on the beat sit
     still instead of throbbing to a track that is not there. */
  if (!spec.music) return 0;
  let last = -Infinity;
  for (const b of BEATS) { if (b <= t + 1e-6) last = b; else break; }
  return Math.exp(-5 * ((t - last) / BEAT));
}

/* ---------------------------------------------------------------- timing */
/*
 * The cold open: lead with the thing, not the claim about it.
 *
 * Twelve videos posted, and every one of their covers was a line of text on the
 * same gradient — so the profile grid read as twelve adverts and each video's
 * first frame gave a scroller nothing to look at. The hook scenes are good
 * writing and they are still in here; they just do not go first. This lifts the
 * first scene that shows something real to the front, and the words land second,
 * once somebody is already watching.
 *
 * Not applied to the narrated tours: their scene order is the order the voice
 * was recorded in, and moving a scene would put the wrong sentence over it.
 */
const SHOWS_SOMETHING = ['app', 'wipe', 'sound', 'timeline', 'typing'];
function coldOpen(list) {
  const i = list.findIndex((s) => SHOWS_SOMETHING.includes(s.type));
  if (i <= 0) return list;
  return [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
}
const ordered = q.get('cold') === '1' && !spec.voice ? coldOpen(spec.scenes || []) : (spec.scenes || []);

let at = 0;
const scenes = ordered.map((s, index) => {
  const line = VOICE?.lines?.[index];
  const dur = line ? line.dur : (s.dur ?? (s.beats ?? 4) * BEAT);
  const o = { ...s, index, start: line ? line.start : at, dur };
  at = o.start + dur;
  return o;
});
/* The tail after the last word, so the end card is not cut off mid-breath. */
window.DURATION = VOICE ? VOICE.total : at;

/* ---------------------------------------------------------------- ground + chrome */
const bg = el('div', null, '<div class="blob a"></div><div class="blob b"></div><div class="vignette"></div>');
bg.id = 'bg';
const blobA = bg.querySelector('.a'), blobB = bg.querySelector('.b');
const layer = el('div');
const flash = el('div'); flash.id = 'flash';
const cap = el('div'); cap.id = 'cap'; const capBox = el('div', 'box'); cap.appendChild(capBox);
const wm = el('div', null, `<img src="${A}/mark.svg" alt=""><span><b>omnidx</b>.net</span>`); wm.id = 'wm';
/* A small mark in the top-left rather than the banner across the top: it has
   to be readable for a minute without sitting on the picture, and the top
   left is the one corner TikTok puts nothing of its own in. */
if (spec.wm === 'corner') wm.classList.add('corner');
/* A whole-video look, not a per-scene one: `style: 'native'` drops the studio
   ground and moves the caption to where a phone would put it. */
if (spec.style) stage.classList.add(spec.style);
stage.append(bg, layer, flash, cap, wm);
if (spec.noWatermark) wm.style.display = 'none';

/* ---------------------------------------------------------------- layout of the device frame */
function deviceBox(s) {
  /* Edge to edge, no frame: what a screen recording looks like when somebody
     posts one, as against a product shot sitting in a rounded rectangle. */
  if (s.bleed) return { sw: W, sh: H, top: 0, pad: 0, bleed: true };
  const phone = s.frame === 'phone';
  if (FMT === 'yt' || FMT === 'thumb') {
    const sh = FMT === 'yt' ? 810 : 560;
    const sw = phone ? Math.round(sh * 390 / 844) : Math.round(sh * 1.6);
    return { sw, sh, top: FMT === 'yt' ? 104 : 90, pad: 12 };
  }
  const sw = phone ? 440 : (W - 100 - 32);
  let sh;
  if (phone) sh = Math.round(sw * 844 / 390);
  else sh = s.box === 'tall' ? (FMT === 'feed' ? 900 : 960) : s.box === 'square' ? sw : Math.round(sw / 1.6);
  const bandTop = FMT === 'feed' ? 190 : 300, bandBottom = FMT === 'feed' ? 1130 : 1320;
  const top = Math.round((bandTop + bandBottom) / 2 - (sh + 32) / 2);
  return { sw, sh, top, pad: 16 };
}

/* ---------------------------------------------------------------- scene builders */
const BUILD = {
  /* Big words, one at a time. Also the "statement" scene: same thing, smaller. */
  hook(s) {
    const root = el('div', `hook ${s.size || 'xl'}`);
    const lines = el('div', 'lines'); root.appendChild(lines);
    const words = [];
    s.lines.forEach((text, li) => {
      const line = el('div', 'line' + ((s.grad || []).includes(li) ? ' grad' : '') + ((s.mint || []).includes(li) ? ' mint' : ''));
      text.split(' ').forEach((w) => { const span = el('span', 'w', w); line.appendChild(span); words.push(span); });
      lines.appendChild(line);
    });
    let sub = null;
    if (s.sub) { sub = el('div', 'sub', s.sub); root.appendChild(sub); }
    const step = s.stagger ?? Math.min(0.14, (s.dur * 0.45) / Math.max(1, words.length));
    return { el: root, update(l) {
      words.forEach((w, k) => pop(w, prog(l, 0.05 + k * step, 0.05 + k * step + 0.3), { y: 50, from: 0.5 }));
      if (sub) pop(sub, prog(l, 0.2 + words.length * step, 0.65 + words.length * step), { y: 30, from: 0.9 });
    } };
  },

  /* The real editor in a frame: a view that pans and zooms, a cursor, a spotlight. */
  app(s) {
    const root = el('div', 'app');
    const box = deviceBox(s);
    const device = el('div', 'device' + (s.frame === 'phone' ? ' phone' : '') + (s.bleed ? ' bleed' : ''));
    device.style.top = `${box.top}px`; device.style.padding = `${box.pad}px`;
    const screen = el('div', 'screen'); screen.style.width = `${box.sw}px`; screen.style.height = `${box.sh}px`;
    const img = el('img', 'shot'); img.src = `${A}/shots/${s.shot}.png`;
    const spot = el('div', 'spot' + (s.spotBelow ? ' below' : '')); const lbl = el('div', 'lbl'); spot.appendChild(lbl);
    const ripple = el('div', 'ripple');
    const cur = el('div', 'cursor', CURSOR_SVG);
    screen.append(img, spot, ripple, cur); device.appendChild(screen); root.appendChild(device);
    let tag = null;
    if (s.tag) {
      tag = el('div', 'tag', s.tag); root.appendChild(tag);
      /* Above the frame when there is room under the watermark; otherwise beside
         a phone, or in the frame's top-right corner — never below, where the
         caption lives. A corner watermark is a small pill in the top-left, so
         the middle of that band is free and the tag can sit above the frame
         rather than on top of the editor's own chrome. */
      const above = box.top - 84;
      const wmBottom = FMT === 'yt' || spec.wm === 'corner' ? 0 : (FMT === 'feed' ? 170 : 300);
      if (above > wmBottom) tag.style.top = `${above}px`;
      else if (s.frame === 'phone') { tag.style.top = `${box.top + 24}px`; tag.style.left = `calc(50% + ${box.sw / 2 + box.pad + 18}px)`; tag.style.transform = 'none'; tag.style.fontSize = '24px'; tag.style.padding = '9px 18px'; }
      else { tag.style.top = `${box.top + box.pad + 16}px`; tag.style.left = 'auto'; tag.style.right = `${(W - box.sw) / 2 + 4}px`; tag.style.transform = 'none'; }
    }
    /* `on: '<mark>'` anywhere a coordinate is wanted: the cursor goes to the
       middle of that control, a spotlight takes its box, and a view centres on
       it. An unknown mark says so and falls back to whatever was written by
       hand, because a silently mis-aimed cursor is the failure worth shouting
       about. */
    const markOf = (name) => {
      const b = MARKS[s.shot]?.[name];
      if (!b) console.warn(`comp: no mark "${name}" in ${s.shot}`);
      return b;
    };
    const centre = (k) => {
      if (!k.on) return k;
      const b = markOf(k.on);
      return b ? { ...k, x: b.x + b.w / 2, y: b.y + b.h / 2 } : k;
    };
    const views = (Array.isArray(s.view) ? s.view : [{ at: 0, ...(s.view || { cx: 0.5, cy: 0.5, w: 1 }) }])
      .map((v) => {
        if (!v.on) return v;
        const b = markOf(v.on);
        return b ? { ...v, cx: b.x + b.w / 2, cy: b.y + b.h / 2 } : v;
      });
    const cursors = (s.cursor || []).map(centre);
    const spots = (s.spots || (s.spot ? [s.spot] : [])).map((sp) => {
      if (!sp.on) return sp;
      const b = markOf(sp.on);
      if (!b) return sp;
      const pad = sp.pad ?? 0.008;
      return { ...sp, x: b.x - pad, y: b.y - pad * 1.6, w: b.w + pad * 2, h: b.h + pad * 3.2 };
    });
    return { el: root, update(l) {
      const asp = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 1.6;
      const v = keyAt(views, l, ['cx', 'cy', 'w']);
      const imgW = Math.max(box.sw / Math.max(0.05, v.w), box.sh * asp);
      const imgH = imgW / asp;
      let left = box.sw / 2 - v.cx * imgW, top = box.sh / 2 - v.cy * imgH;
      left = imgW <= box.sw ? (box.sw - imgW) / 2 : clamp(left, box.sw - imgW, 0);
      top = imgH <= box.sh ? (box.sh - imgH) / 2 : clamp(top, box.sh - imgH, 0);
      img.style.width = `${imgW}px`;
      img.style.transform = `translate(${left}px, ${top}px)`;
      const px = (x) => left + x * imgW, py = (y) => top + y * imgH;
      /* cursor */
      if (cursors.length) {
        const c = keyAt(cursors, l, ['x', 'y']);
        const fade = prog(l, cursors[0].at - 0.3, cursors[0].at);
        let scale = 1;
        ripple.style.opacity = 0;
        for (const k of cursors) if (k.click && l >= k.at && l < k.at + 0.45) {
          const p = prog(l, k.at, k.at + 0.45);
          scale = p < 0.25 ? lerp(1, 0.82, Math.sin(p / 0.25 * Math.PI)) : 1;
          ripple.style.opacity = (1 - p) * 0.9;
          ripple.style.transform = `translate(${px(k.x)}px, ${py(k.y)}px) scale(${lerp(0.3, 1.5, outCubic(p))})`;
        }
        cur.style.opacity = fade;
        cur.style.transform = `translate(${px(c.x)}px, ${py(c.y)}px) scale(${scale})`;
      } else cur.style.opacity = 0;
      /* spotlight */
      let shown = null;
      for (const sp of spots) if (l >= sp.at && (sp.until == null || l < sp.until)) shown = sp;
      if (shown) {
        const p = prog(l, shown.at, shown.at + 0.35);
        /* A spotlight with an `until` fades out rather than vanishing: cutting
           it to nothing on one frame reads as a dropped frame, not as a label
           that has finished saying its piece. */
        const out = shown.until == null ? 1 : 1 - prog(l, shown.until - 0.35, shown.until);
        spot.style.opacity = p * out;
        spot.style.left = `${px(shown.x)}px`; spot.style.top = `${py(shown.y)}px`;
        spot.style.width = `${shown.w * imgW}px`; spot.style.height = `${shown.h * imgH}px`;
        spot.style.transform = `scale(${lerp(1.12, 1, outCubic(p))})`;
        lbl.textContent = shown.label || '';
        lbl.style.display = shown.label ? '' : 'none';
      } else spot.style.opacity = 0;
      if (tag) { const p = prog(l, 0.1, 0.5); tag.style.opacity = p; }
      /* A full-bleed shot does not fly in. A screen recording is either on or
         it is not, and an entrance animation is the tell that it is an advert. */
      const pd = s.bleed ? 1 : prog(l, 0, 0.45);
      device.style.opacity = pd;
      device.style.transform = s.bleed ? 'translateX(-50%)'
        : `translateX(-50%) translateY(${(1 - pd) * 40}px) scale(${lerp(0.96, 1, outCubic(pd))})`;
    } };
  },

  /* The two ways to pay, side by side, with the subscription's bill counting up. */
  price(s) {
    const root = el('div', 'price');
    const o = { name: 'Subscription editors', price: 22.99, years: 3, note: 'and it never stops', ...(s.other || {}) };
    const u = { name: 'OmniDx Studio · Creator', price: '$19.99', label: 'once', checks: ['No subscription. Ever.', 'Every update free, forever.', 'Every device you own.'], ...(s.ours || {}) };
    const other = el('div', 'pc other', `<div class="pl">${o.name}</div><div class="pv">${money(o.price)}<span>/month</span><i class="strike"></i></div>
      <div class="pt">${o.years} years = <b class="cnt">$0.00</b></div><div class="pn">${o.note}</div>`);
    const vs = el('div', 'vs', 'vs');
    const ours = el('div', 'pc ours', `<div class="pl">${u.name}</div><div class="pv">${u.price}<span>${u.label}</span></div>
      <div class="pt">${o.years} years = <b>${u.price}</b></div><ul class="chk">${u.checks.map((c) => `<li>${c}</li>`).join('')}</ul>`);
    root.append(other, vs, ours);
    const cnt = other.querySelector('.cnt'), strike = other.querySelector('.strike'), lis = [...ours.querySelectorAll('li')];
    const total = o.price * o.years * 12;
    return { el: root, update(l) {
      const p1 = outCubic(prog(l, 0, 0.5)); other.style.opacity = p1; other.style.transform = `translateX(${(1 - p1) * -140}px)`;
      const p2 = outCubic(prog(l, 0.3, 0.8)); ours.style.opacity = p2; ours.style.transform = `translateX(${(1 - p2) * 140}px)`;
      vs.style.opacity = prog(l, 0.5, 0.8);
      cnt.textContent = money(total * outCubic(prog(l, 0.9, 2.6)));
      strike.style.width = `${outCubic(prog(l, 2.8, 3.2)) * 106}%`;
      lis.forEach((li, k) => pop(li, prog(l, 3.0 + k * 0.28, 3.4 + k * 0.28), { y: 24, from: 0.85 }));
    } };
  },

  /*
   * A question from the feed, and the answer.
   *
   * The format that travels furthest from an account nobody has heard of,
   * because it does not look like an advert — it looks like somebody
   * answering. The question has to be a real objection asked the way people
   * type, lower case and unpunctuated: a tidy one reads as invented, and a
   * question nobody would ask reads as an advert wearing a costume.
   */
  comment(s) {
    const root = el('div', 'cmt' + (s.small ? ' sm' : ''));
    const bubble = el('div', 'bubble', `<span class="av"></span>
      <div><div class="who">${s.who || 'a comment'}</div><p class="q">${s.q}</p>
      ${s.badge ? `<span class="badge">${s.badge}</span>` : ''}</div>`);
    /*
     * The answer arrives in chunks, not words: it carries markup, and splitting
     * a string on spaces cuts a tag in half and colours one word by accident.
     * A chunk is a clause, which is the beat you want anyway.
     */
    const ans = el('div', 'ans');
    const parts = (Array.isArray(s.a) ? s.a : [s.a]).map((chunk, i, all) => {
      const span = el('span', 'w', chunk + (i < all.length - 1 ? ' ' : ''));
      ans.appendChild(span);
      return span;
    });
    root.append(bubble, ans);
    /* After the question has been read, not with it. */
    const gap = s.read ?? 1.1;
    const step = Math.min(0.6, (s.dur ? (s.dur - gap - 0.8) : 2) / Math.max(1, parts.length));
    return { el: root, update(l) {
      pop(bubble, prog(l, 0.05, 0.45), { y: 34, from: 0.9 });
      parts.forEach((w, k) => pop(w, prog(l, gap + k * step, gap + 0.36 + k * step), { y: 26, from: 0.85 }));
    } };
  },

  /*
   * The slow half. One frame, a push in, and a number getting worse.
   *
   * The reference holds a single shot for six seconds before it cuts anything,
   * and the drop only hits because of how long that wait was. Copying the cuts
   * without copying the wait produces a montage that starts loud and stays
   * there, which is the thing that makes an edit feel cheap.
   */
  tension(s) {
    const root = el('div', 'tension');
    const plate = el('div', 'plate');
    /*
     * The names are set in our own typeface and greyed back. Naming what people
     * already pay for is ordinary comparison and needs nobody's permission;
     * drawing their marks would be a different thing entirely, and is not what
     * makes this land — the list does.
     */
    const names = s.names || [];
    /*
     * The big slot counts, or it states a figure — never both.
     *
     * `count` makes it tick through a number of months and says nothing about
     * money, which is the version that survives the house rule that no number
     * goes on screen unless the pricing page carries it. A monthly price for
     * somebody else's editor is not on our pricing page and is not ours to
     * assert; the length of time somebody has been renting one is not a claim
     * about anybody.
     */
    const counting = Boolean(s.count);
    plate.innerHTML = `<div class="per">${s.per || 'every month'}</div>
      ${names.length ? `<div class="names">${names.map((n, i) =>
        `<div class="name${i === names.length - 1 ? ' last' : ''}">${n}</div>`).join('')}</div>` : ''}
      <div class="amt${counting ? ' count' : ''}">${counting ? `${s.count.pre || ''} 1` : (s.amount || '')}</div>
      <div class="sub">${s.sub || 'forever'}</div>
      ${counting ? '' : '<div class="tick">$0.00</div>'}`;
    const veil = el('div', 'veil');
    root.append(plate, veil);
    const tick = plate.querySelector('.tick');
    const nameEls = [...plate.querySelectorAll('.name')];
    const amt = plate.querySelector('.amt');
    /* What the bill reaches by the time the drop lands. */
    const total = s.total ?? 22.99 * 60;
    /* The last beat before the cut: everything is blown out of the frame, so the
       drop arrives into a hole rather than over the top of a still picture. */
    const blowAt = (s.dur || 6) - (s.blow ?? 0.34);
    return { el: root, update(l) {
      const p = s.dur ? l / s.dur : 0;
      /* A push that accelerates: slow enough to be uncomfortable, then gone. */
      const blow = prog(l, blowAt, s.dur || 6);
      plate.style.transform = `scale(${lerp(1, 1.16, p * p) * lerp(1, 1.7, outCubic(blow))})`;
      plate.style.filter = `saturate(${lerp(1, 0.45, p)}) brightness(${lerp(1, 0.78, p)}) blur(${blow * 26}px)`;
      plate.style.opacity = String(1 - blow);
      veil.style.opacity = String(outCubic(p) * 0.9);
      if (counting) {
        /*
         * Accelerating, and it lands on the last number with time to read it.
         *
         * An ease-out reached sixty at the halfway mark and then sat there for
         * three seconds, which is the opposite of the feeling — the months are
         * supposed to pile up faster the longer this goes on. Slightly
         * accelerating instead, arriving at 0.88 of the scene, so the final
         * number holds for about four tenths of a second before the blowout
         * blurs it.
         */
        const n = Math.max(1, Math.round(1 + (s.count.to - 1) * Math.min(1, p / 0.88) ** 1.3));
        amt.textContent = `${s.count.pre || ''} ${n}`.trim();
      } else if (tick) {
        tick.textContent = money(total * outCubic(Math.min(1, p * 1.25)));
        tick.style.opacity = String(prog(l, 0.5, 1.2));
      }
      /* One name at a time, each landing harder than the last. */
      const step = s.nameStep ?? 0.95;
      nameEls.forEach((n, i) => pop(n, prog(l, 0.35 + i * step, 0.75 + i * step), { y: 40, from: 0.72 }));
      if (amt) pop(amt, prog(l, counting ? 0.35 : 0.35 + nameEls.length * step,
        counting ? 0.85 : 0.85 + nameEls.length * step), { y: 30, from: 0.8 });
    } };
  },

  /*
   * The drop: somebody else's cut list, our pictures.
   *
   * `cuts` comes out of dissect.mjs — the measured times from the reference —
   * so the section lands where the track lands rather than where a guess put
   * it. One cell per cut, all built up front and only the live one shown, which
   * is what keeps a thirty-two cut section renderable frame by frame.
   */
  drop(s) {
    const root = el('div', 'drop');
    const flash = el('div', 'flash');
    /*
     * Why every other cut is graded differently.
     *
     * The first rebuild lost six of its thirty-one cuts — dissecting the render
     * found them missing — and measuring the crops explained it: every shot in
     * this app is dark chrome, mean luma 9 to 60 out of 255, so two consecutive
     * panels differ by less than the scene detector's threshold however hard the
     * picture moves. The reference does not have this problem because it is four
     * differently-coloured cars. This is the same lever done on purpose: one cut
     * crushed and cool, the next lifted and warm, alternating all the way down.
     * It guarantees a delta on every cut no matter what is in frame, and it is
     * what a phonk edit does anyway.
     */
    const TONES = DROP_TONES;
    /*
     * A frame says which way it goes, because only the frame knows.
     *
     * Alternating on the cut index looks like it should work and does not: the
     * frame list is shorter than the cut list and cycles through it, so the same
     * picture comes up warm on one pass and cool on the next, and two cuts meet
     * in the middle. The tone belongs to the picture — a dark panel goes darker,
     * a lit one goes brighter — and videos.js pins it from the measured luma.
     * The index fallback is for a drop scene that has not been measured yet; it
     * is better than nothing and worse than measuring.
     */
    const toneOf = (i, f) => TONES[f.tone] || (i % 2 ? TONES.warm : TONES.cool);
    const cells = (s.cuts || []).map((c, i) => {
      const f = (s.frames || [])[i % Math.max(1, (s.frames || []).length)] || {};
      /* A cut that is the mark rather than a screenshot: the arrival. It takes
         the same punch and shake as every other cut, so it reads as part of the
         montage instead of as a card dropped into the middle of one. */
      if (f.mark) {
        const cell = el('div', 'cell markcard');
        const mk = el('img', 'mk'); mk.src = `${A}/mark.svg`;
        const wm = el('div', 'wm', '<b>omnidx</b>.net');
        cell.append(mk, wm);
        root.appendChild(cell);
        return { cell, mark: true, mk, wm, c, f, punchy: c.dur <= (s.impactUnder ?? 0.12), seed: i * 37.7 };
      }
      const cell = el('div', 'cell');
      const img = el('img', 'shot'); img.src = `${A}/shots/${f.shot || 'editor'}.png`;
      /* The split copies only exist on the cuts that use them: three images a
         cell across thirty-two cells is a lot of decoding for an effect that
         fires eight times. */
      const punchy = c.dur <= (s.impactUnder ?? 0.12);
      const gr = punchy ? el('img', 'shot ghost r') : null;
      const gc = punchy ? el('img', 'shot ghost c') : null;
      if (gr) { gr.src = img.src; gc.src = img.src; }
      const grade = el('div', 'grade');
      const lbl = el('div', 'lbl', f.label || '');
      cell.append(img, ...(gr ? [gr, gc] : []), grade, lbl);
      root.appendChild(cell);
      return { cell, img, gr, gc, lbl, c, f, punchy, tone: toneOf(i, f), seed: i * 37.7 };
    });
    root.appendChild(flash);

    return { el: root, update(l) {
      let lit = 0;
      for (const k of cells) {
        const on = l >= k.c.at && l < k.c.at + k.c.dur;
        k.cell.style.display = on ? '' : 'none';
        if (!on) continue;
        if (k.mark) {
          const p = k.c.dur ? (l - k.c.at) / k.c.dur : 1;
          const settle = outBack(Math.min(1, p * 2.2));
          const amp = (1 - Math.min(1, p * 2.6)) * 18;
          const dx = Math.sin(l * 71 + k.seed) * amp;
          k.mk.style.transform = `translateX(${dx}px) scale(${lerp(2.6, 1, settle)}) rotate(${lerp(-12, 0, settle)}deg)`;
          k.wm.style.transform = `translateX(${dx}px) scale(${lerp(1.8, 1, settle)})`;
          const split = (1 - Math.min(1, p * 2.2)) * 26;
          k.wm.style.textShadow = split > 0.4
            ? `${split}px 0 rgba(255,60,80,.9), ${-split}px 0 rgba(0,220,255,.9)` : 'none';
          lit = Math.max(lit, 1 - Math.min(1, p * 2.4));
          continue;
        }
        const asp = (k.img.naturalWidth && k.img.naturalHeight) ? k.img.naturalWidth / k.img.naturalHeight : 1.6;
        const v = { cx: k.f.cx ?? 0.5, cy: k.f.cy ?? 0.5, w: k.f.w ?? 0.55 };
        /* Fill the frame, then crop to the region worth looking at. */
        const imgW = Math.max(W / Math.max(0.05, v.w), H * asp);
        const imgH = imgW / asp;
        const p = k.c.dur ? (l - k.c.at) / k.c.dur : 1;

        /* The punch: lands big and settles inside the first third of the cut. */
        const settle = outCubic(Math.min(1, p * 2.6));
        const scale = lerp(k.f.push ?? 1.16, 1, settle);
        /* The shake decays with it, and is deterministic — a random one would
           make every render of the same frame different. */
        const amp = (1 - settle) * (k.punchy ? 26 : 13);
        const dx = Math.sin(l * 71 + k.seed) * amp;
        const dy = Math.cos(l * 63 + k.seed) * amp;
        const left = W / 2 - v.cx * imgW + dx;
        const top = H / 2 - v.cy * imgH + dy;

        const place = (node, off) => {
          node.style.width = `${imgW}px`;
          node.style.transform = `translate(${left + off}px, ${top}px) scale(${scale})`;
        };
        /* The tone rides on top of the punch grade rather than replacing it: the
           punch still opens hot and settles, it just settles somewhere else. */
        k.img.style.filter = `saturate(${lerp(1.5, 1.12, settle) * k.tone.s}) contrast(${lerp(1.25, 1.06, settle)})`
          + ` brightness(${k.tone.b}) hue-rotate(${k.tone.h}deg) blur(${(1 - settle) * (k.punchy ? 7 : 3.2)}px)`;
        place(k.img, 0);
        if (k.gr) {
          const split = (1 - settle) * 30;
          place(k.gr, split); place(k.gc, -split);
          k.gr.style.opacity = k.gc.style.opacity = String((1 - settle) * 0.75);
        }
        pop(k.lbl, prog(p, 0.02, 0.3), { y: 30, from: 0.86 });
        if (k.punchy) lit = Math.max(lit, 1 - Math.min(1, p * 1.6));
      }
      flash.style.opacity = String(lit * 0.55);
    } };
  },

  /*
   * The last hit.
   *
   * The end card the rest of the set uses is a poster — logo, price, hashtags,
   * five seconds. Dropped onto the end of an edit like this it reads as the
   * advert arriving after the video finished. This is the same information
   * arriving as the final impact instead.
   */
  slam(s) {
    const root = el('div', 'slam');
    const mark = el('img', 'mark'); mark.src = `${A}/mark.svg`;
    const url = el('div', 'url', '<b>omnidx</b>.net');
    const kick = el('div', 'kick', s.kick || '$19.99 once. no subscription.');
    const flash = el('div', 'flash');
    root.append(mark, url, kick, flash);
    return { el: root, update(l) {
      /* Everything lands on the first frame and settles — nothing fades in,
         because a fade here is the thing that makes it feel like an advert. */
      const a = outBack(prog(l, 0, 0.42));
      /* And then it keeps moving. A frame that freezes for three seconds after
         nine seconds of cuts reads as the video having ended early; a slow push
         that never quite stops holds the last beat instead. */
      const drift = 1 + (s.dur ? l / s.dur : 0) * 0.07;
      mark.style.opacity = String(prog(l, 0, 0.12));
      mark.style.transform = `scale(${lerp(2.2, 1, a) * drift}) rotate(${lerp(-9, 0, a)}deg)`;
      const b = outBack(prog(l, 0.14, 0.6));
      url.style.opacity = String(prog(l, 0.14, 0.26));
      /* The wordmark arrives split and pulls itself together, which is the same
         move the drop makes eight times — the end belongs to the same edit. */
      const split = (1 - outCubic(prog(l, 0.14, 0.75))) * 22;
      url.style.transform = `scale(${lerp(1.5, 1, b) * drift})`;
      url.style.textShadow = split > 0.4
        ? `${split}px 0 rgba(255,60,80,.85), ${-split}px 0 rgba(0,220,255,.85)`
        : 'none';
      pop(kick, prog(l, 0.55, 0.95), { y: 26, from: 0.9 });
      flash.style.opacity = String(Math.max(0, 1 - l / 0.16) * 0.8);
    } };
  },

  /* A title, a number that climbs, and chips that arrive on the beat. */
  list(s) {
    const root = el('div', 'list' + (s.big ? ' big' : ''));
    const head = el('div', 'head');
    let num = null;
    if (s.count != null) { num = el('div', 'num', '0'); head.appendChild(num); }
    head.appendChild(el('div', 'ttl' + (s.title.length > 22 ? ' small' : ''), s.title));
    const grid = el('div', 'grid');
    const chips = s.items.map((it) => {
      const [ic, txt] = Array.isArray(it) ? it : [null, it];
      const c = el('div', 'chip' + ((s.hot || []).includes(txt) ? ' hot' : ''), (ic ? `<span class="ic">${ic}</span>` : '') + `<span>${txt}</span>`);
      grid.appendChild(c);
      return c;
    });
    root.append(head, grid);
    const step = (s.stepBeats ?? 0.5) * BEAT, t0 = 0.35;
    const countEnd = Math.min(s.dur - 0.5, t0 + chips.length * step + 0.4);
    return { el: root, update(l) {
      pop(head, prog(l, 0, 0.4), { y: 30, from: 0.9 });
      chips.forEach((c, k) => pop(c, prog(l, t0 + k * step, t0 + k * step + 0.3), { y: 30, from: 0.5 }));
      if (num) num.textContent = (s.prefix || '') + Math.round(s.count * outCubic(prog(l, 0.2, countEnd))) + (s.suffix || '');
    } };
  },

  /* The AI editor, typed live, then its plan. */
  typing(s) {
    const root = el('div', 'typing');
    const card = el('div', 'card', `<div class="hd"><i>✨</i> AI editor <span class="pill">runs on your device</span></div>
      <div class="ta"><span class="txt"></span><span class="caret"></span></div><div class="btn">✨ Plan the edit</div><ul class="steps"></ul><div class="do">Do it</div>`);
    root.appendChild(card);
    const txt = card.querySelector('.txt'), caret = card.querySelector('.caret'), btn = card.querySelector('.btn'), ul = card.querySelector('.steps'), doBtn = card.querySelector('.do');
    const lis = (s.steps || []).map((st) => { const li = el('li', null, st); ul.appendChild(li); return li; });
    const cps = s.cps ?? 30, tStart = 0.35, tType = s.prompt.length / cps, tEnd = tStart + tType;
    const tPress = tEnd + 0.4, tSteps = tPress + 0.6, gap = s.stepGap ?? 0.32;
    return { el: root, update(l) {
      pop(card, prog(l, 0, 0.4), { y: 40, from: 0.92 });
      txt.textContent = s.prompt.slice(0, Math.floor(clamp((l - tStart) / tType) * s.prompt.length));
      caret.style.opacity = l < tPress && Math.floor(l * 3) % 2 === 0 ? 1 : 0;
      const pp = prog(l, tPress, tPress + 0.3);
      btn.style.transform = `scale(${l >= tPress && l < tPress + 0.3 ? lerp(1, 0.95, Math.sin(pp * Math.PI)) : 1})`;
      btn.style.opacity = l > tPress + 0.3 ? 0.55 : 1;
      lis.forEach((li, k) => pop(li, prog(l, tSteps + k * gap, tSteps + k * gap + 0.3), { y: 20, from: 0.9 }));
      const pd = prog(l, tSteps + lis.length * gap + 0.2, tSteps + lis.length * gap + 0.5);
      doBtn.style.opacity = pd; doBtn.style.boxShadow = `0 0 ${40 * pd}px rgba(49,217,167,.5)`;
    } };
  },

  /* A timeline being cut on the beat. */
  timeline(s) {
    const root = el('div', 'tl');
    const card = el('div', 'card');
    const ruler = el('div', 'ruler');
    for (let i = 0; i <= 10; i++) { const m = el('i', null, `${i * 2}s`); m.style.left = `${2 + i * 9.6}%`; ruler.appendChild(m); }
    const beatsRow = el('div', 'beats');
    const lanes = el('div'); lanes.style.position = 'relative';
    const track = (name, cls) => { const t = el('div', 'track'); t.appendChild(el('div', 'name', name)); const lane = el('div', 'lane' + (cls ? ' ' + cls : '')); t.appendChild(lane); lanes.appendChild(t); return lane; };
    const vText = track('Text'), vMain = track('Video 1'), aMain = track('Audio 1');
    const title = el('div', 'clip title', '<span class="nm">T  Summer reel</span>'); title.style.left = '12%'; title.style.width = '34%'; vText.appendChild(title);
    const clips = [['sunset', 26], ['city', 22], ['forest', 30], ['studio', 20]];
    let x = 0;
    for (const [name, w] of clips) {
      const c = el('div', 'clip', `<img src="${A}/footage/${name}-preview.png" alt=""><span class="nm">${name}.mp4</span>`);
      c.style.left = `${x}%`; c.style.width = `${w - 0.6}%`; vMain.appendChild(c); x += w;
    }
    const wave = el('div', 'wave');
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 140; i++) { const b = el('i'); const beat = i % 7 === 0; b.style.height = `${(beat ? 70 : 18) + rnd() * (beat ? 30 : 40)}%`; wave.appendChild(b); }
    aMain.appendChild(wave);
    const head = el('div', 'head'); lanes.appendChild(head);
    const tflash = el('div', 'flash');
    card.append(ruler, beatsRow, lanes, tflash); root.appendChild(card);
    let note = null; if (s.note) { note = el('div', 'note', s.note); root.appendChild(note); }
    const x0 = 2, x1 = 98;
    const beatsIn = BEATS.filter((b) => b >= s.start - 1e-6 && b < s.start + s.dur - 0.05).map((b) => b - s.start);
    const dots = beatsIn.map((b) => { const d = el('b'); d.style.left = `${lerp(x0, x1, b / s.dur)}%`; beatsRow.appendChild(d); return d; });
    const every = s.every ?? 1;
    const cuts = beatsIn.filter((_, i) => i % every === 0 && i > 0).map((b) => { const c = el('div', 'cut'); c.style.left = `${lerp(x0, x1, b / s.dur)}%`; vMain.appendChild(c); return { c, b }; });
    return { el: root, update(l) {
      pop(card, prog(l, 0, 0.4), { y: 30, from: 0.94 });
      const xf = lerp(x0, x1, l / s.dur);
      const laneW = vMain.clientWidth || 800;
      head.style.left = `${130 + laneW * xf / 100}px`;
      dots.forEach((d, i) => d.classList.toggle('hit', l >= beatsIn[i]));
      let fl = 0;
      for (const { c, b } of cuts) { const p = prog(l, b, b + 0.3); c.style.opacity = l >= b ? 1 : 0; fl = Math.max(fl, (1 - p) * (l >= b ? 0.35 : 0)); }
      tflash.style.opacity = fl;
      if (note) pop(note, prog(l, 0.4, 0.8), { y: 20, from: 0.85 });
    } };
  },

  /* Before and after, revealed by a wipe.
     One picture with two filters (a grade), or — with `pair` — two different
     pictures, which is how the eraser and the background remover are shown:
     both frames come out of the app, so the wipe is the actual result. */
  wipe(s) {
    const root = el('div', 'wipe');
    const frame = el('div', 'frame');
    const one = s.pair ? `${A}/footage/${s.pair}-before.png` : `${A}/footage/${s.shot || 'sunset'}-preview.png`;
    const two = s.pair ? `${A}/footage/${s.pair}-after.png` : one;
    const before = el('img'); before.src = one; if (!s.pair) before.style.filter = s.before || 'saturate(.35) contrast(.85) brightness(.9)';
    const after = el('img'); after.src = two; if (!s.pair) after.style.filter = s.after || 'saturate(1.35) contrast(1.12)';
    const line = el('div', 'line');
    const lb1 = el('div', 'lb before', (s.labels || [])[0] || 'Before'), lb2 = el('div', 'lb after', (s.labels || [])[1] || 'After');
    frame.append(before, after, line, lb1, lb2);
    /* The tap that starts it: a finger goes down on the thing, and the wipe
       leaves from where it landed. Nothing else in the shot is touched. */
    let tap = null, tapRing = null, tapLbl = null;
    if (s.tap) {
      tap = el('div', 'tap'); tap.style.left = `${s.tap.x * 100}%`; tap.style.top = `${s.tap.y * 100}%`;
      tapRing = el('div', 'ring'); tapLbl = el('div', 'tlbl', s.tap.label || 'tap');
      tap.append(tapRing, tapLbl); frame.appendChild(tap);
    }
    root.appendChild(frame);
    const at = s.tap ? (s.tap.at ?? 0.9) : 0;
    const start = s.tap ? at + 0.9 : 0.5;
    const end = s.dur - 0.4;
    return { el: root, update(l) {
      pop(frame, prog(l, 0, 0.4), { y: 30, from: 0.94 });
      if (tap) {
        /* Down, a ring that leaves, then it stays lit long enough to be read
           before the wipe takes over. */
        const down = prog(l, at, at + 0.16), gone = prog(l, at + 1.05, at + 1.4);
        tap.style.opacity = down * (1 - gone);
        tap.style.transform = `translate(-50%, -50%) scale(${lerp(1.5, 1, outBack(down))})`;
        const r = prog(l, at, at + 0.6);
        tapRing.style.transform = `scale(${lerp(0.3, 2.6, outCubic(r))})`;
        tapRing.style.opacity = (1 - r) * 0.9;
      }
      const p = prog(l, start, end);
      const x = lerp(6, 94, inOut(p));
      after.style.clipPath = `inset(0 ${100 - x}% 0 0)`;
      line.style.left = `${x}%`;
      line.style.opacity = l >= start - 0.05 ? 1 : 0;
      /* Each label belongs to the half of the picture it is standing on, so
         neither one names a frame that is not on screen yet. */
      lb2.style.opacity = prog(l, start, start + 0.35);
      lb1.style.opacity = 1 - prog(l, end - 0.7, end - 0.2);
    } };
  },

  /* Audio repair, drawn: the same three seconds before and after the app's
     repair pass, with a sweep that fills the clean one in as it goes. Every
     number on screen is measured, and comes in from audio-repair.json. */
  sound(s) {
    const root = el('div', 'sound');
    const D = AUDIO || { before: [0], after: [0], floorBefore: 0.1, floorAfter: 0.02, clicks: [], seconds: 3 };
    const card = el('div', 'card'); root.appendChild(card);

    const panel = (cls, label, env, floor, marks) => {
      const wrap = el('div', `pan ${cls}`);
      wrap.appendChild(el('div', 'plbl', label));
      const box = el('div', 'wv');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1000 300'); svg.setAttribute('preserveAspectRatio', 'none');
      /* The noise floor, as a band you can see the height of. */
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      band.setAttribute('class', 'floor'); band.setAttribute('x', '0'); band.setAttribute('width', '1000');
      const fh = Math.max(1.5, floor * 290);
      band.setAttribute('y', String(150 - fh)); band.setAttribute('height', String(fh * 2));
      svg.appendChild(band);
      const step = 1000 / env.length, bw = Math.max(1.6, step * 0.62);
      const bars = env.map((v, k) => {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('class', 'bar'); r.setAttribute('x', String(k * step + (step - bw) / 2)); r.setAttribute('width', String(bw));
        svg.appendChild(r); return { r, v };
      });
      box.appendChild(svg);
      /* The clicks, pinned where they are in the recording. */
      const pins = (marks || []).map((t) => { const e = el('div', 'pin', '✕'); e.style.left = `${(t / D.seconds) * 100}%`; box.appendChild(e); return e; });
      wrap.appendChild(box);
      const note = el('div', 'fnote'); wrap.appendChild(note);
      return { wrap, bars, pins, note, box };
    };

    const A1 = panel('bad', (s.labels || [])[0] || 'straight off the phone', D.before, D.floorBefore, D.clicks);
    const A2 = panel('good', (s.labels || [])[1] || 'after one pass', D.after, D.floorAfter, null);
    A1.note.innerHTML = s.noteBefore || 'hiss · 60Hz hum · clicks · wandering level';
    const dB = (D.floorBefore > 0 && D.floorAfter > 0) ? 20 * Math.log10(D.floorAfter / D.floorBefore) : 0;
    A2.note.innerHTML = s.noteAfter || `hum gone · noise floor <b>${dB.toFixed(0)} dB</b> · clicks repaired · level evened`;
    const sweep = el('div', 'sweep');
    card.append(A1.wrap, sweep, A2.wrap);

    /* Inside the card, not under it: the caption band starts at a fixed height
       and a row floating between the two would land in it. */
    const chips = el('div', 'chips'); card.appendChild(chips);
    const chipEls = (s.chips || ['60Hz hum', 'hiss', 'clicks', 'wandering level']).map((c) => { const e = el('span', null, `${c} <i>✓</i>`); chips.appendChild(e); return e; });

    const t0 = 0.55, t1 = Math.max(t0 + 0.6, s.dur - 1.5);
    return { el: root, update(l) {
      pop(card, prog(l, 0, 0.4), { y: 34, from: 0.94 });
      const p = inOut(prog(l, t0, t1));
      /* The dirty bars are full height from the start; the clean ones grow in
         behind the sweep, so you watch the repair happen rather than cut to it. */
      A1.bars.forEach((b, k) => {
        const passed = clamp((p * A1.bars.length - k) / 6);
        b.r.setAttribute('height', String(Math.max(1, b.v * 290)));
        b.r.setAttribute('y', String(150 - b.v * 145));
        b.r.style.opacity = String(lerp(1, 0.28, passed));
      });
      A2.bars.forEach((b, k) => {
        const passed = clamp((p * A2.bars.length - k) / 6);
        const hgt = Math.max(1, b.v * 290 * passed);
        b.r.setAttribute('height', String(hgt)); b.r.setAttribute('y', String(150 - hgt / 2));
      });
      A1.pins.forEach((e, k) => {
        const x = (D.clicks[k] / D.seconds);
        e.style.opacity = String(prog(l, 0.35 + k * 0.06, 0.6 + k * 0.06) * (1 - clamp((p - x) * 6)));
      });
      sweep.style.left = `calc(30px + (100% - 60px) * ${p.toFixed(4)})`;
      sweep.style.opacity = String(prog(l, t0 - 0.15, t0) * (1 - prog(l, t1, t1 + 0.25)));
      A2.wrap.style.setProperty('--fill', String(p));
      chipEls.forEach((e, k) => pop(e, prog(l, t1 - 0.5 + k * 0.16, t1 - 0.2 + k * 0.16), { y: 22, from: 0.7 }));
    } };
  },

  /* The end card: the mark, the address, the price, the tags. */
  end(s) {
    const root = el('div', 'end');
    const mark = el('img', 'mark'); mark.src = `${A}/mark.svg`;
    const url = el('div', 'url', '<b>omnidx</b>.net');
    const line = el('div', 'line', s.line || 'Free to start. <b>$19.99 once</b> for everything in Creator.');
    const tags = el('div', 'tags');
    const tagEls = (s.tags || []).map((t) => { const e = el('span', null, t); tags.appendChild(e); return e; });
    const bio = el('div', 'bio', s.bio || 'link in bio ↑');
    if (FMT === 'yt') { const col = el('div', 'col'); col.append(url, line, tags, bio); root.append(mark, col); }
    else root.append(mark, url, line, tags, bio);
    return { el: root, update(l) {
      const p0 = prog(l, 0, 0.5);
      mark.style.opacity = p0;
      mark.style.transform = `scale(${lerp(0.5, 1, outBack(p0)) * (1 + pulseNow * 0.05)})`;
      pop(url, prog(l, 0.2, 0.6), { y: 40, from: 0.9 });
      pop(line, prog(l, 0.5, 0.9), { y: 30, from: 0.95 });
      tagEls.forEach((e, k) => pop(e, prog(l, 0.8 + k * 0.1, 1.1 + k * 0.1), { y: 20, from: 0.7 }));
      pop(bio, prog(l, 1.4, 1.8), { y: 24, from: 0.8 });
    } };
  },

  /* A YouTube thumbnail: still. */
  thumb(s) {
    const root = el('div', 'thumb', `<div class="txt"><div class="big">${s.big}</div><div class="small">${s.small || ''}</div></div>
      <div class="device"><img src="${A}/shots/${s.shot || 'editor'}.png" alt=""></div>`);
    return { el: root, update() {} };
  },
};
BUILD.statement = (s) => BUILD.hook({ size: 'md', ...s });

const built = scenes.map((s) => {
  const b = BUILD[s.type](s);
  b.el.classList.add('scene');
  layer.appendChild(b.el);
  return { s, ...b };
});

/*
 * A caption that wraps to a second line grows upwards, and the app frame above
 * it has a fixed bottom edge — so a long caption lands on top of the editor.
 * Shrink it until it is one line instead of policing the copy: at the floor it
 * is still the biggest thing on screen, and a caption that already fits keeps
 * the size it has always had, so nothing else in the set moves.
 *
 * offsetHeight, not the bounding rect: the caption is mid-pop when this runs
 * and a scale transform would report a height that has nothing to do with the
 * text.
 */
const CAP_MAX = 58, CAP_MIN = 42;
function fitCaption() {
  for (let size = CAP_MAX; ; size -= 2) {
    capBox.style.fontSize = `${size}px`;
    if (size <= CAP_MIN || capBox.offsetHeight <= size * 1.15 + 56) return;
  }
}

/* ---------------------------------------------------------------- the frame */
let current = null, capKey = null, capAt = 0;
window.seek = function seek(t) {
  t = clamp(t, 0, Math.max(0, window.DURATION - 1e-4));
  let cur = built[0];
  for (const b of built) if (t >= b.s.start) cur = b;
  if (cur !== current) { built.forEach((b) => b.el.classList.toggle('on', b === cur)); current = cur; }
  const s = cur.s, l = t - s.start;
  pulseNow = pulseAt(t);
  stage.style.setProperty('--pulse', pulseNow.toFixed(3));
  blobA.style.transform = `translate(${Math.sin(t * 0.35) * 140}px, ${Math.cos(t * 0.27) * 110}px)`;
  blobB.style.transform = `translate(${Math.cos(t * 0.3) * -120}px, ${Math.sin(t * 0.22) * -100}px)`;
  cur.update(l, t);
  flash.style.opacity = s.index > 0 && !s.noflash ? Math.max(0, 1 - l / 0.14) * 0.7 : 0;
  /* the caption: one per scene, or a list of [beatOffset, text] */
  let text = s.cap || null, since = 0;
  if (s.caps) for (const [b, tx] of s.caps) if (l >= b * BEAT) { text = tx; since = b * BEAT; }
  const key = `${s.index}:${text}`;
  if (key !== capKey) { capKey = key; capAt = since; capBox.innerHTML = text || ''; fitCaption(); }
  if (text) { cap.style.display = ''; pop(capBox, prog(l, capAt, capAt + 0.28), { y: 24, from: 0.85 }); }
  else cap.style.display = 'none';
};

/* ---------------------------------------------------------------- ready */
await Promise.all(['800 50px Inter', '600 50px Inter', '500 40px Inter', '800 50px Sora', '700 30px Inter'].map((f) => document.fonts.load(f).catch(() => {})));
await Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = () => i.decode().then(r, r); i.onerror = r; }))));
window.seek(Number(q.get('t') || 0));
window.READY = true;
