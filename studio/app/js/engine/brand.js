/*
 * Brand kits.
 *
 * Set your colours, your typeface and your logo once; put them on any video in
 * one press. The entire value is consistency — a channel where every video has
 * the same title font and the same lower-third colour reads as a channel, and
 * one where they drift reads as somebody learning an editor in public.
 *
 * Kept on the device. A brand kit is a logo file and a few hex codes, which is
 * not something that needs a server, and the logo never leaves the machine.
 */

import * as store from '../store.js';
import { FONT_BY_ID } from './titles.js';

const KEY = 'omnidx.studio.brand.v1';

export function emptyKit() {
  return {
    id: `kit_${Date.now().toString(36)}`,
    name: 'My brand',
    colours: {
      primary: '#3b82f6',
      secondary: '#f59e0b',
      text: '#ffffff',
      outline: '#000000',
    },
    font: 'sans',
    titleWeight: 800,
    logo: null,          // a data URL, small, stored with the kit
    logoCorner: 'br',
    logoSize: 12,        // percent of frame width
    logoOpacity: 85,
    lowerThird: true,
  };
}

export function loadKits() {
  try {
    const raw = localStorage.getItem(KEY);
    const kits = raw ? JSON.parse(raw) : [];
    return Array.isArray(kits) ? kits : [];
  } catch { return []; }
}

export function saveKits(kits) {
  try { localStorage.setItem(KEY, JSON.stringify(kits)); return true; }
  catch { return false; }
}

export function saveKit(kit) {
  const kits = loadKits();
  const i = kits.findIndex((k) => k.id === kit.id);
  if (i >= 0) kits[i] = kit; else kits.push(kit);
  return saveKits(kits) ? kit : null;
}

export function deleteKit(id) {
  return saveKits(loadKits().filter((k) => k.id !== id));
}

/**
 * Shrink a logo before it is stored.
 *
 * A brand kit lives in localStorage, which is a few megabytes for the whole
 * origin — shared with the project index and every other preference. A 4MB PNG
 * dropped in here would not merely fail to save, it would take the quota down
 * with it and break saving for everything else. 512px wide is more than any
 * watermark needs at 4K.
 */
export async function prepareLogo(file) {
  if (!file) return null;
  if (!/^image\//.test(file.type || '') && !/\.(png|jpe?g|webp|svg)$/i.test(file.name || '')) {
    throw new Error('A logo needs to be an image — PNG with a transparent background works best.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That image could not be read.'));
      el.src = url;
    });
    const max = 512;
    const scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
    const w = Math.max(1, Math.round((img.width || max) * scale));
    const h = Math.max(1, Math.round((img.height || max) * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    // PNG, not JPEG: a logo without transparency is a white box on the corner
    // of every video, which is the single most common way this goes wrong.
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The operations that put a kit on a project.
 *
 * Returned as the same step list the AI planner and the templates emit, so a
 * brand kit is reviewable step by step before it runs and one undo takes it
 * all off again — rather than being a special path that mutates the project
 * behind everyone's back.
 */
export function stepsFor(kit, ctx = {}) {
  const steps = [];
  if (!kit) return steps;

  const font = FONT_BY_ID[kit.font] ? kit.font : 'sans';
  steps.push({
    op: 'brandText',
    args: { font, weight: kit.titleWeight || 800, colour: kit.colours.text,
      outline: kit.colours.outline },
    label: `Put every title in ${FONT_BY_ID[font]?.name || font}`,
    detail: 'Existing titles change typeface and colour; their words and timing are untouched.',
  });

  if (kit.logo) {
    steps.push({
      op: 'brandLogo',
      args: { logo: kit.logo, corner: kit.logoCorner, size: kit.logoSize, opacity: kit.logoOpacity },
      label: 'Add the logo',
      detail: `In the ${
        { tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' }[kit.logoCorner] || 'corner'
      }, at ${kit.logoSize}% of the frame width, for the whole video.`,
    });
  }

  // Only where a look is not already chosen. A brand tint that overwrites the
  // grade somebody spent twenty minutes on is a brand kit nobody presses twice.
  if (kit.colours.primary && !ctx.hasGrade) {
    steps.push({
      op: 'applyLook', args: { look: 'none', strength: 1 },
      label: 'Leave the grade alone',
      detail: 'Your clips already have a look, so the kit does not touch colour.',
      skip: true,
    });
  }
  return steps.filter((s) => !s.skip);
}

/**
 * Draw a kit's logo onto a frame. Used by the renderer through an effect.
 */
export function drawLogo(ctx, w, h, { image, corner = 'br', size = 12, opacity = 85, margin = 4 }) {
  if (!image?.width) return;
  const tw = (w * size) / 100;
  const th = (image.height / image.width) * tw;
  const m = (Math.min(w, h) * margin) / 100;
  const x = corner === 'tl' || corner === 'bl' ? m : w - tw - m;
  const y = corner === 'tl' || corner === 'tr' ? m : h - th - m;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity / 100));
  ctx.drawImage(image, x, y, tw, th);
  ctx.restore();
}

void store;
