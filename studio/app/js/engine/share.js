/*
 * Getting a finished video off this device and onto a platform.
 *
 * What is actually possible, and what is not
 * -----------------------------------------
 * Posting straight to TikTok or YouTube from a web page — the app holding your
 * account and pushing the file itself — needs OAuth, a reviewed developer
 * application on each platform, and a server to hold the secrets. None of those
 * can live in a page that runs on your machine with no backend, and none of
 * them can be faked. An app that claimed to do it would either be lying or
 * quietly shipping your video through somebody else's server.
 *
 * What *is* possible is better than it sounds, and on a phone it is the same
 * number of taps:
 *
 *   • Phones and most tablets have the Web Share API with file support. One
 *     press opens the system share sheet with the video attached, and every
 *     app installed on the device is in that list — TikTok, YouTube, Instagram,
 *     Messages, AirDrop. The file never leaves the device on its way there.
 *
 *   • Desktops mostly do not. There the honest flow is the file plus a direct
 *     link to the platform's own upload page, which is where a desktop upload
 *     happens anyway.
 *
 * So this module offers whichever of those the device can actually do, and says
 * plainly which one it is rather than showing a button that might not work.
 */

/* Where each platform takes an upload, for the desktop path. */
export const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', icon: '🎵', url: 'https://www.tiktok.com/tiktokstudio/upload',
    note: 'Vertical, up to 10 minutes.' },
  { id: 'youtube', name: 'YouTube', icon: '▶️', url: 'https://www.youtube.com/upload',
    note: 'Shorts if it is vertical and under 3 minutes.' },
  { id: 'instagram', name: 'Instagram', icon: '📸', url: 'https://www.instagram.com/',
    note: 'Reels upload is phone-only on Instagram.' },
  { id: 'x', name: 'X', icon: '𝕏', url: 'https://x.com/compose/post',
    note: 'Up to 2 minutes 20 on a free account.' },
];

/**
 * Can this device hand a video file to another app?
 *
 * Tested with the actual file, because support is per-file-type, not a blanket
 * capability — `navigator.share` existing tells you nothing about whether it
 * will take an mp4. Checking properly is the difference between a share button
 * that works and one that throws when pressed.
 */
export function canShareFile(file) {
  try {
    return Boolean(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

/** A File the share sheet will accept, from an exported blob. */
export function toFile(blob, name) {
  return new File([blob], name, { type: blob.type || 'video/mp4' });
}

/**
 * Open the system share sheet.
 *
 * @returns 'shared' | 'cancelled' | 'unsupported'
 *
 * A cancel is not an error and must not be reported as one — people open the
 * sheet, change their mind, and close it, and an app that shows them a failure
 * for that looks broken.
 */
export async function shareFile(file, { title, text } = {}) {
  if (!canShareFile(file)) return 'unsupported';
  try {
    await navigator.share({ files: [file], title, text });
    return 'shared';
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

/**
 * What to suggest for a finished video, given its shape.
 *
 * Ordered by where it would actually do well: a 9:16 video leads with TikTok,
 * a 16:9 one leads with YouTube. Suggesting a vertical video to YouTube first
 * is the kind of small wrongness that makes a tool feel like it is not paying
 * attention.
 */
export function suggestFor(width, height, seconds) {
  const vertical = height > width;
  const order = vertical ? ['tiktok', 'youtube', 'instagram', 'x'] : ['youtube', 'x', 'instagram', 'tiktok'];
  return order.map((id) => {
    const p = PLATFORMS.find((x) => x.id === id);
    const warnings = [];
    if (id === 'tiktok' && !vertical) warnings.push('TikTok will letterbox a landscape video.');
    if (id === 'youtube' && vertical && seconds <= 180) warnings.push('This will post as a Short.');
    if (id === 'youtube' && vertical && seconds > 180) warnings.push('Over 3 minutes, so it posts as a normal video, not a Short.');
    if (id === 'x' && seconds > 140) warnings.push('Longer than 2:20 — a free X account will reject it.');
    if (id === 'instagram') warnings.push('Instagram has no web upload for Reels; use the share sheet on a phone.');
    return { ...p, warnings };
  });
}
