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
 * Editions. Three of them, and the top one is $39.99 by design: it sits
 * under the $40 line where a purchase still feels like a decision someone
 * makes alone, without asking anyone.
 * ------------------------------------------------------------------ */
export const EDITIONS = {
  free: {
    id: 'free',
    name: 'Starter',
    tagline: 'The whole editor. Really.',
    once: 0,
    monthly: 0,
    blurb: 'Every core editing tool, no watermark, no time limit, no account needed.',
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    tagline: 'For people posting every week.',
    once: 19.99,
    monthly: 2.99,
    blurb: 'AI editing, auto-captions, the full filter library and 4K export.',
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    tagline: 'Everything, forever, on every device.',
    once: 39.99,
    monthly: 4.99,
    blurb: 'Unlimited AI, scopes, unlimited LUTs, 10 devices, and every future update.',
  },
  team: {
    id: 'team',
    name: 'Team',
    tagline: 'Three people, one project, one payment.',
    once: 69.99,
    monthly: 8.99,
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
  'export-1080':     'free',
  'basic-filters':   'free',
  /* One-tap styles run entirely on the device and cost nothing to serve, so
     they are free. Gating them would have taken the best thing about the app
     away from everyone who has not paid yet — which is exactly backwards. */
  'templates':       'free',
  'autosave':        'free',
  'projects':        'free',

  /* creator */
  'ai-edit':         'creator',
  'ai-captions':     'creator',
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

/** Monthly AI actions. Free gets a real taste, not a teaser. */
export const AI_QUOTA = { free: 5, creator: 200, studio: Infinity, team: Infinity };

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

  checkout: {
    creator: '',                  // e.g. 'https://buy.stripe.com/xxxx'
    studio: '',
    team: '',
    creatorMonthly: '',
    studioMonthly: '',
    teamMonthly: '',
  },

  paypal: {
    creator: '',                  // e.g. 'https://www.paypal.com/ncp/payment/xxxx'
    studio: '',
    team: '',
  },

  /* Shown on the checkout screen so buyers know what they can pay with. Keep
     this honest: list only what your live checkout link actually accepts. */
  methods: ['Card', 'Apple Pay', 'Google Pay', 'Cash App Pay', 'PayPal', 'Klarna'],

  supportEmail: '',
};

/** The link a buy button should open for an edition and billing period. */
export function buyUrl(edition, period = 'once') {
  const key = period === 'monthly' ? `${edition}Monthly` : edition;
  return PAY.checkout[key] || PAY.paypal[edition] || PAY.cashAppUrl;
}

/** Formatted price, e.g. "$39.99" or "$4.99/mo". */
export function priceOf(edition, period = 'once') {
  const e = EDITIONS[edition];
  if (!e) return '';
  if (e.once === 0) return 'Free';
  return period === 'monthly' ? `$${e.monthly.toFixed(2)}/mo` : `$${e.once.toFixed(2)}`;
}

export const SITE = {
  name: 'OmniDx Studio',
  domain: 'omnidx.net',
  version: '1.0.0',
};
