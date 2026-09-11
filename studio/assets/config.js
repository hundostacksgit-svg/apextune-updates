/*
 * One place for everything that changes between "my laptop" and "live".
 * The site and the app both import this, so a price or a payment link never
 * drifts between the two.
 *
 * Nothing secret belongs in this file — it ships to every visitor. Secrets
 * (Stripe keys, the AI key) live in the Worker in ../../server/.
 */

/* ------------------------------------------------------------------ *
 * Where the app talks to a server, if there is one.
 *
 * Leave apiBase empty and OmniDx Studio runs completely standalone: accounts,
 * projects and licences are held on the device, encrypted. Set it to your
 * deployed Worker URL and the same screens switch to real server accounts with
 * cross-device sync, verified licences and cloud AI.
 * ------------------------------------------------------------------ */
const DEFAULT_API_BASE = '';    // e.g. 'https://api.omnidx.net'

/* A person can point their own copy at their own Worker from the app's
   Settings panel without editing this file or rebuilding anything. What they
   set wins; the default below is what ships. */
function storedApiBase() {
  try { return localStorage.getItem('omnidx.studio.apiBase') || ''; } catch { return ''; }
}

export const API = {
  base: storedApiBase() || DEFAULT_API_BASE,
  aiPath: '/v1/ai/plan',
  transcribePath: '/v1/ai/transcribe',
};

/** Point this copy at a different backend. Empty string goes back to local. */
export function setApiBase(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  try {
    if (clean) localStorage.setItem('omnidx.studio.apiBase', clean);
    else localStorage.removeItem('omnidx.studio.apiBase');
  } catch { /* private mode — this session only */ }
  API.base = clean || DEFAULT_API_BASE;
  return API.base;
}

/* ------------------------------------------------------------------ *
 * Editions. Every one of them is a one-time purchase. There is no
 * subscription, no renewal and nothing to cancel: you pay once, you own that
 * edition, and future updates to it are included. The top single-person
 * edition sits under the $40 line by design, where a purchase is still a
 * decision someone makes alone without asking anyone.
 * ------------------------------------------------------------------ */
export const EDITIONS = {
  free: {
    id: 'free',
    name: 'Starter',
    tagline: 'The whole editor. Really.',
    once: 0,
    blurb: 'Every core editing tool, no watermark, no time limit, no account needed.',
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    tagline: 'For people posting every week.',
    once: 19.99,
    blurb: 'Unlocks the AI editor, auto-captions, the full filter library and 4K export.',
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    tagline: 'Everything, forever, on every device.',
    once: 39.99,
    blurb: 'Unlimited AI, scopes, ProRes, unlimited LUTs, 10 devices, and every future update.',
  },
  team: {
    id: 'team',
    name: 'Team',
    tagline: 'Three people, one project, one payment.',
    once: 69.99,
    seats: 3,
    /* The comparison shown next to the price is three individual Studio
       licences, because that is what a team of three would otherwise buy and
       it is a number anyone can check. A struck-out "was $120" for a price
       never actually charged is a fake reference price — the FTC treats that
       as deceptive in the US, and the EU's Omnibus rules require a prior price
       you genuinely charged in the last 30 days. This one is true. */
    compareTo: 119.97,
    compareLabel: '3 separate Studio licences',
    blurb: 'Everything in Studio for three people, with shared projects and a shared licence.',
  },
};

/* Feature -> minimum edition. The app reads this and nothing else, so moving
   one line here re-cuts the free/paid split across every screen at once. */
export const ENTITLEMENTS = {
  /* free */
  'timeline':        'free',
  'trim':            'free',
  'transitions':     'free',
  'text':            'free',
  'audio-mix':       'free',
  'audio-fx':        'free',
  'export-1080':     'free',
  'basic-filters':   'free',
  /* One-tap styles run entirely on the device and cost nothing to serve, so
     they are free. Gating them would have taken the best thing about the app
     away from everyone who has not paid yet — which is exactly backwards. */
  'templates':       'free',
  'autosave':        'free',
  'projects':        'free',

  /* Tone curves are free.
     A curve is how you learn what a grade is, and locking the one control
     that teaches colour behind a paywall trains people to think the app
     cannot do it. LUTs — somebody else's finished look, applied exactly —
     are the paid half of the same panel. */
  'curves':          'free',

  /* creator */
  'luts':            'creator',
  'ai-edit':         'creator',
  'ai-captions':     'creator',
  'audio-fx-pro':    'creator',
  'all-filters':     'creator',
  'export-4k':       'creator',
  'speed-ramp':      'creator',
  'keyframes':       'creator',
  'beat-sync':       'creator',
  'silence-cut':     'creator',
  'brand-kit':       'creator',

  /* studio */
  'ai-unlimited':    'studio',
  'bg-remove':       'studio',
  'voice-isolate':   'studio',
  'multicam':        'studio',
  'auto-reframe':    'studio',
  'cloud-sync':      'studio',
  'team-devices':    'studio',
  'prores':          'studio',
  'audio-repair':    'creator',
  'proxies':         'free',

  /* team */
  'shared-projects': 'team',
  'seats':           'team',
};

export const RANK = { free: 0, creator: 1, studio: 2, team: 3 };

/** How many devices each edition may be signed in on at once. */
export const DEVICE_LIMIT = { free: 2, creator: 3, studio: 10, team: 9 };

/**
 * Seats on a shared licence. Only Team has more than one, and three means
 * three — see server/worker.js, where it is enforced rather than suggested.
 */
export const SEATS = { free: 1, creator: 1, studio: 1, team: 3 };

/**
 * AI actions included with each edition, counted per calendar month.
 *
 * Starter is zero on purpose. Every AI request costs real money to serve, and
 * a free tier that spends it is a free tier that eventually gets switched off
 * — which is worse for everyone than saying plainly, up front, that the AI
 * editor is the thing you buy. Everything that runs on the device stays free:
 * the timeline, the filters, the templates, the effects, the audio tools.
 */
export const AI_QUOTA = { free: 0, creator: 200, studio: Infinity, team: Infinity };

/* ------------------------------------------------------------------ *
 * Taking the money.
 *
 * Order of preference, and the app walks down it until something is set:
 *   1. checkout[edition]  — a hosted Stripe/Square link. Takes cards, Apple
 *      Pay, Google Pay, Cash App Pay, PayPal (Stripe) — and pays out to the
 *      Cash App account and routing numbers. This is the one to use.
 *   2. paypal[edition]    — a PayPal.me / hosted button, for buyers who will
 *      only ever pay by PayPal.
 *   3. cashAppUrl         — the fallback that works with zero setup.
 *
 * docs/STUDIO-PAYMENTS.md explains the payout wiring end to end.
 * ------------------------------------------------------------------ */
export const PAY = {
  cashtag: '$Ahmirp1961',
  cashAppUrl: 'https://cash.app/$Ahmirp1961',

  /* Live Square payment links. Created in this order, so they map in this
     order: Creator $19.99, Studio $39.99, Team $69.99. */
  checkout: {
    creator: 'https://square.link/u/xm9VtiGc',
    studio: 'https://square.link/u/sxi62gva',
    team: 'https://square.link/u/i8zrHwkn',
  },

  paypal: {
    creator: '',                  // e.g. 'https://www.paypal.com/ncp/payment/xxxx'
    studio: '',
    team: '',
  },

  /* Shown on the checkout screen so buyers know what they can pay with. Keep
     this honest: list only what your live checkout link actually accepts. */
  methods: ['Card', 'Apple Pay', 'Google Pay', 'Cash App Pay', 'PayPal', 'Klarna'],

  /* Shown wherever a buyer might need to reach a human — the footer, the
     pricing page, the account screen, the activation receipt and the in-app
     licence dialogs. Unlocking is automatic now, so this is no longer the
     critical path it was; it is the backstop for the cases automation cannot
     reach, like a fourth device or a refund. */
  supportEmail: 'ahmirpierce36@gmail.com',
};

/** The link a buy button should open for an edition. One-time payment. */
export function buyUrl(edition) {
  return PAY.checkout[edition] || PAY.paypal[edition] || PAY.cashAppUrl;
}

/** Formatted price, e.g. "$39.99". Always a one-time figure. */
export function priceOf(edition) {
  const e = EDITIONS[edition];
  if (!e) return '';
  if (e.once === 0) return 'Free';
  return `$${e.once.toFixed(2)}`;
}

/* ------------------------------------------------------------------ *
 * Downloads.
 *
 * Installers are served from this domain, not from a code-hosting site. A
 * visitor who wants the app should get the app, not a repository page with a
 * list of files and a wall of release notes.
 *
 * Set `file` for a platform and its button becomes a direct download of that
 * file. Leave it empty and the page says so plainly and offers the install that
 * does work today — adding the web app to the home screen, which is instant on
 * every platform and needs no build at all.
 *
 * Paths are relative to studio/download/, so dropping a built installer into
 * studio/download/files/ and naming it here is the whole job. See
 * docs/STUDIO-BUILD.md for producing them — they have to be built on each OS,
 * which is why they cannot simply be committed.
 * ------------------------------------------------------------------ */
export const DOWNLOADS = {
  mac:     { file: '', version: '', size: '', label: 'macOS',          note: 'Apple silicon & Intel · macOS 11 or newer' },
  windows: { file: '', version: '', size: '', label: 'Windows',        note: 'Windows 10 & 11 · 64-bit' },
  linux:   { file: '', version: '', size: '', label: 'Linux',          note: 'AppImage · deb · rpm' },
  ios:     { file: '', version: '', size: '', label: 'iPhone & iPad',  note: 'iOS 16.4 or newer', install: 'safari' },
  android: { file: '', version: '', size: '', label: 'Android',        note: 'Android 10 or newer', install: 'prompt' },
  web:     { file: '', version: '', size: '', label: 'Browser',        note: 'Chrome, Edge, Safari, Firefox', install: 'prompt' },
};

/**
 * The direct download URL for a platform, or '' when there is not one yet.
 *
 * A bare filename is served from studio/download/files/. A full URL is used as
 * given, which is the escape hatch for builds too large for this host — an
 * Electron installer sits right on the 100 MB limit GitHub Pages enforces, and
 * silently failing to serve it would be worse than pointing somewhere else.
 */
export function downloadUrl(os) {
  const d = DOWNLOADS[os];
  if (!d || !d.file) return '';
  return /^https?:\/\//.test(d.file) ? d.file : `files/${d.file}`;
}

export const SITE = {
  name: 'OmniDx Studio',
  domain: 'omnidx.net',
  version: '1.0.0',
};
