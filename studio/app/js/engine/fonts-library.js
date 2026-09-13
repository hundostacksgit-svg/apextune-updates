/*
 * The typeface library.
 *
 * Six system stacks becomes two hundred real typefaces, served from Google
 * Fonts. They are all open-licence (OFL or Apache), which is the part that
 * matters for anyone who exports a video and sells it: nothing here carries a
 * licence that says otherwise.
 *
 * Three things this file has to get right, in order of how badly each one
 * bites if it is wrong:
 *
 *   1. A font that has not finished loading does not exist as far as canvas is
 *      concerned. `fillText` in a font the browser does not have silently
 *      draws in something else, with no error and no warning — so a title can
 *      look right in the preview and come back in the wrong face in the
 *      export, and the person only finds out after waiting for a render. The
 *      exporter has to wait for every font in the project before it draws a
 *      single frame, which is what `preload` is for.
 *
 *   2. It has to work with no signal. Every typeface carries a real fallback
 *      chosen to look like it — a display face falls back to Impact, a script
 *      to cursive, a slab to a serif — so an offline editor renders something
 *      close rather than dropping two hundred fonts to the same system sans.
 *
 *   3. It must not fetch two hundred fonts. Each family is requested the first
 *      time something actually uses it, and never again.
 */

/* Fallbacks by shape, so an unavailable face lands on something like it. */
const FB = {
  sans: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif',
  serif: 'Georgia,"Times New Roman",Times,serif',
  slab: 'Rockwell,"Courier Bold",Georgia,serif',
  mono: 'ui-monospace,"SF Mono",Menlo,Consolas,"Courier New",monospace',
  display: 'Impact,"Haettenschweiler","Arial Narrow Bold",sans-serif',
  cond: '"Arial Narrow","Helvetica Neue Condensed",sans-serif',
  script: '"Segoe Script","Brush Script MT",cursive',
  hand: '"Comic Sans MS","Segoe Print",cursive',
};

/*
 * [family, group, fallback shape, weights]
 *
 * Weights are the ones actually requested. Asking for every weight of every
 * family would be megabytes; asking for one means a "bold" title is drawn by
 * the browser smearing a regular weight, which looks like a mistake. Four is
 * the honest middle.
 */
const CATALOGUE = [
  /* ---- Sans ---- */
  ['Inter', 'Sans', 'sans', '400;600;800'],
  ['Roboto', 'Sans', 'sans', '400;500;700;900'],
  ['Open Sans', 'Sans', 'sans', '400;600;800'],
  ['Lato', 'Sans', 'sans', '400;700;900'],
  ['Montserrat', 'Sans', 'sans', '400;600;800;900'],
  ['Poppins', 'Sans', 'sans', '400;600;800'],
  ['Nunito', 'Sans', 'sans', '400;700;900'],
  ['Nunito Sans', 'Sans', 'sans', '400;700;900'],
  ['Raleway', 'Sans', 'sans', '400;600;800'],
  ['Work Sans', 'Sans', 'sans', '400;600;800'],
  ['Rubik', 'Sans', 'sans', '400;600;800'],
  ['Manrope', 'Sans', 'sans', '400;600;800'],
  ['DM Sans', 'Sans', 'sans', '400;700'],
  ['Plus Jakarta Sans', 'Sans', 'sans', '400;600;800'],
  ['Outfit', 'Sans', 'sans', '400;600;800'],
  ['Figtree', 'Sans', 'sans', '400;600;800'],
  ['Sora', 'Sans', 'sans', '400;600;800'],
  ['Space Grotesk', 'Sans', 'sans', '400;600;700'],
  ['Urbanist', 'Sans', 'sans', '400;600;800'],
  ['Lexend', 'Sans', 'sans', '400;600;800'],
  ['Public Sans', 'Sans', 'sans', '400;700;900'],
  ['Source Sans 3', 'Sans', 'sans', '400;600;900'],
  ['IBM Plex Sans', 'Sans', 'sans', '400;600;700'],
  ['Noto Sans', 'Sans', 'sans', '400;700;900'],
  ['PT Sans', 'Sans', 'sans', '400;700'],
  ['Mulish', 'Sans', 'sans', '400;700;900'],
  ['Karla', 'Sans', 'sans', '400;700;800'],
  ['Cabin', 'Sans', 'sans', '400;600;700'],
  ['Quicksand', 'Sans', 'sans', '400;600;700'],
  ['Josefin Sans', 'Sans', 'sans', '400;600;700'],
  ['Barlow', 'Sans', 'sans', '400;600;800'],
  ['Assistant', 'Sans', 'sans', '400;600;800'],
  ['Heebo', 'Sans', 'sans', '400;700;900'],
  ['Hind', 'Sans', 'sans', '400;600;700'],
  ['Overpass', 'Sans', 'sans', '400;700;900'],
  ['Red Hat Display', 'Sans', 'sans', '400;700;900'],
  ['Epilogue', 'Sans', 'sans', '400;600;800'],
  ['Onest', 'Sans', 'sans', '400;600;800'],
  ['Geologica', 'Sans', 'sans', '400;600;800'],
  ['Instrument Sans', 'Sans', 'sans', '400;600;700'],

  /* ---- Condensed and narrow ---- */
  ['Oswald', 'Condensed', 'cond', '400;600;700'],
  ['Barlow Condensed', 'Condensed', 'cond', '400;600;800'],
  ['Fjalla One', 'Condensed', 'cond', '400'],
  ['Archivo Narrow', 'Condensed', 'cond', '400;600;700'],
  ['Roboto Condensed', 'Condensed', 'cond', '400;700'],
  ['Saira Condensed', 'Condensed', 'cond', '400;700;900'],
  ['Encode Sans Condensed', 'Condensed', 'cond', '400;700'],
  ['Yanone Kaffeesatz', 'Condensed', 'cond', '400;700'],
  ['Pathway Gothic One', 'Condensed', 'cond', '400'],
  ['News Cycle', 'Condensed', 'cond', '400;700'],
  ['Economica', 'Condensed', 'cond', '400;700'],
  ['Dosis', 'Condensed', 'cond', '400;600;800'],
  ['Teko', 'Condensed', 'cond', '400;600;700'],
  ['Khand', 'Condensed', 'cond', '400;600;700'],
  ['Rajdhani', 'Condensed', 'cond', '400;600;700'],

  /* ---- Display and poster ---- */
  ['Anton', 'Display', 'display', '400'],
  ['Bebas Neue', 'Display', 'display', '400'],
  ['Archivo Black', 'Display', 'display', '400'],
  ['Alfa Slab One', 'Display', 'display', '400'],
  ['Titan One', 'Display', 'display', '400'],
  ['Bungee', 'Display', 'display', '400'],
  ['Bungee Shade', 'Display', 'display', '400'],
  ['Bowlby One SC', 'Display', 'display', '400'],
  ['Luckiest Guy', 'Display', 'display', '400'],
  ['Chewy', 'Display', 'display', '400'],
  ['Bangers', 'Display', 'display', '400'],
  ['Passion One', 'Display', 'display', '400;700;900'],
  ['Fredoka', 'Display', 'display', '400;600;700'],
  ['Baloo 2', 'Display', 'display', '400;700;800'],
  ['Righteous', 'Display', 'display', '400'],
  ['Lilita One', 'Display', 'display', '400'],
  ['Ultra', 'Display', 'display', '400'],
  ['Shrikhand', 'Display', 'display', '400'],
  ['Rowdies', 'Display', 'display', '400;700'],
  ['Bree Serif', 'Display', 'serif', '400'],
  ['Paytone One', 'Display', 'display', '400'],
  ['Squada One', 'Display', 'display', '400'],
  ['Staatliches', 'Display', 'display', '400'],
  ['Russo One', 'Display', 'display', '400'],
  ['Black Ops One', 'Display', 'display', '400'],
  ['Bungee Inline', 'Display', 'display', '400'],
  ['Monoton', 'Display', 'display', '400'],
  ['Audiowide', 'Display', 'display', '400'],
  ['Orbitron', 'Display', 'display', '400;700;900'],
  ['Chakra Petch', 'Display', 'display', '400;600;700'],
  ['Syncopate', 'Display', 'display', '400;700'],
  ['Michroma', 'Display', 'display', '400'],
  ['Faster One', 'Display', 'display', '400'],
  ['Wallpoet', 'Display', 'display', '400'],
  ['Nosifer', 'Display', 'display', '400'],
  ['Creepster', 'Display', 'display', '400'],
  ['Eater', 'Display', 'display', '400'],
  ['Rubik Glitch', 'Display', 'display', '400'],
  ['Rubik Moonrocks', 'Display', 'display', '400'],
  ['Rubik Puddles', 'Display', 'display', '400'],
  ['Rubik Wet Paint', 'Display', 'display', '400'],
  ['Silkscreen', 'Display', 'display', '400;700'],
  ['Press Start 2P', 'Display', 'mono', '400'],
  ['VT323', 'Display', 'mono', '400'],
  ['Pixelify Sans', 'Display', 'display', '400;700'],
  ['Tourney', 'Display', 'display', '400;700;900'],
  ['Bruno Ace SC', 'Display', 'display', '400'],
  ['Unica One', 'Display', 'display', '400'],
  ['Megrim', 'Display', 'display', '400'],

  /* ---- Serif ---- */
  ['Playfair Display', 'Serif', 'serif', '400;700;900'],
  ['Merriweather', 'Serif', 'serif', '400;700;900'],
  ['Lora', 'Serif', 'serif', '400;600;700'],
  ['Libre Baskerville', 'Serif', 'serif', '400;700'],
  ['Cormorant Garamond', 'Serif', 'serif', '400;600;700'],
  ['EB Garamond', 'Serif', 'serif', '400;600;800'],
  ['Crimson Text', 'Serif', 'serif', '400;600;700'],
  ['Source Serif 4', 'Serif', 'serif', '400;600;900'],
  ['PT Serif', 'Serif', 'serif', '400;700'],
  ['Noto Serif', 'Serif', 'serif', '400;700;900'],
  ['Spectral', 'Serif', 'serif', '400;600;800'],
  ['Bitter', 'Serif', 'slab', '400;700;900'],
  ['Domine', 'Serif', 'serif', '400;600;700'],
  ['Cardo', 'Serif', 'serif', '400;700'],
  ['Vollkorn', 'Serif', 'serif', '400;600;900'],
  ['Literata', 'Serif', 'serif', '400;600;700'],
  ['Newsreader', 'Serif', 'serif', '400;600;700'],
  ['Fraunces', 'Serif', 'serif', '400;700;900'],
  ['Instrument Serif', 'Serif', 'serif', '400'],
  ['DM Serif Display', 'Serif', 'serif', '400'],
  ['Abril Fatface', 'Serif', 'display', '400'],
  ['Prata', 'Serif', 'serif', '400'],
  ['Marcellus', 'Serif', 'serif', '400'],
  ['Cinzel', 'Serif', 'serif', '400;700;900'],
  ['Cinzel Decorative', 'Serif', 'serif', '400;700;900'],
  ['Italiana', 'Serif', 'serif', '400'],
  ['Gilda Display', 'Serif', 'serif', '400'],
  ['Yeseva One', 'Serif', 'serif', '400'],
  ['Bodoni Moda', 'Serif', 'serif', '400;700;900'],
  ['Young Serif', 'Serif', 'serif', '400'],

  /* ---- Slab ---- */
  ['Roboto Slab', 'Slab', 'slab', '400;700;900'],
  ['Zilla Slab', 'Slab', 'slab', '400;600;700'],
  ['Josefin Slab', 'Slab', 'slab', '400;600;700'],
  ['Arvo', 'Slab', 'slab', '400;700'],
  ['Crete Round', 'Slab', 'slab', '400'],
  ['Rokkitt', 'Slab', 'slab', '400;700;900'],
  ['Kumbh Sans', 'Slab', 'sans', '400;700;900'],
  ['Podkova', 'Slab', 'slab', '400;600;800'],

  /* ---- Mono ---- */
  ['JetBrains Mono', 'Mono', 'mono', '400;700;800'],
  ['Fira Code', 'Mono', 'mono', '400;600;700'],
  ['Space Mono', 'Mono', 'mono', '400;700'],
  ['IBM Plex Mono', 'Mono', 'mono', '400;600;700'],
  ['Source Code Pro', 'Mono', 'mono', '400;600;900'],
  ['Roboto Mono', 'Mono', 'mono', '400;500;700'],
  ['Inconsolata', 'Mono', 'mono', '400;700;900'],
  ['Courier Prime', 'Mono', 'mono', '400;700'],
  ['DM Mono', 'Mono', 'mono', '400;500'],
  ['Share Tech Mono', 'Mono', 'mono', '400'],
  ['Major Mono Display', 'Mono', 'mono', '400'],
  ['Nova Mono', 'Mono', 'mono', '400'],

  /* ---- Script and handwriting ---- */
  ['Dancing Script', 'Script', 'script', '400;600;700'],
  ['Pacifico', 'Script', 'script', '400'],
  ['Lobster', 'Script', 'script', '400'],
  ['Great Vibes', 'Script', 'script', '400'],
  ['Satisfy', 'Script', 'script', '400'],
  ['Sacramento', 'Script', 'script', '400'],
  ['Parisienne', 'Script', 'script', '400'],
  ['Allura', 'Script', 'script', '400'],
  ['Tangerine', 'Script', 'script', '400;700'],
  ['Alex Brush', 'Script', 'script', '400'],
  ['Cookie', 'Script', 'script', '400'],
  ['Yellowtail', 'Script', 'script', '400'],
  ['Kaushan Script', 'Script', 'script', '400'],
  ['Courgette', 'Script', 'script', '400'],
  ['Marck Script', 'Script', 'script', '400'],
  ['Mrs Saint Delafield', 'Script', 'script', '400'],
  ['Petit Formal Script', 'Script', 'script', '400'],
  ['Pinyon Script', 'Script', 'script', '400'],
  ['Italianno', 'Script', 'script', '400'],
  ['Meddon', 'Script', 'script', '400'],

  ['Caveat', 'Handwriting', 'hand', '400;600;700'],
  ['Shadows Into Light', 'Handwriting', 'hand', '400'],
  ['Indie Flower', 'Handwriting', 'hand', '400'],
  ['Permanent Marker', 'Handwriting', 'hand', '400'],
  ['Architects Daughter', 'Handwriting', 'hand', '400'],
  ['Patrick Hand', 'Handwriting', 'hand', '400'],
  ['Gloria Hallelujah', 'Handwriting', 'hand', '400'],
  ['Amatic SC', 'Handwriting', 'hand', '400;700'],
  ['Rock Salt', 'Handwriting', 'hand', '400'],
  ['Nanum Pen Script', 'Handwriting', 'hand', '400'],
  ['Reenie Beanie', 'Handwriting', 'hand', '400'],
  ['Homemade Apple', 'Handwriting', 'hand', '400'],
  ['Just Another Hand', 'Handwriting', 'hand', '400'],
  ['Covered By Your Grace', 'Handwriting', 'hand', '400'],
  ['Kalam', 'Handwriting', 'hand', '400;700'],
  ['Gochi Hand', 'Handwriting', 'hand', '400'],
  ['Sriracha', 'Handwriting', 'hand', '400'],
  ['Neucha', 'Handwriting', 'hand', '400'],
  ['Caveat Brush', 'Handwriting', 'hand', '400'],
  ['Grape Nuts', 'Handwriting', 'hand', '400'],
];

/** A DOM-safe id from a family name: "Press Start 2P" -> "pressStart2P". */
function idOf(family) {
  const parts = family.split(/\s+/);
  return parts[0].toLowerCase() + parts.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

export const WEB_FONTS = CATALOGUE.map(([family, group, fb, weights]) => ({
  id: idOf(family),
  name: family,
  family,
  group,
  weights,
  web: true,
  // Quoted, because a family with a space in it is otherwise parsed as two
  // families and silently ignored.
  stack: `"${family}",${FB[fb]}`,
}));

export const FONT_GROUPS_WEB = WEB_FONTS.reduce((acc, f) => {
  (acc[f.group] ||= []).push(f);
  return acc;
}, {});

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

const requested = new Map();     // family -> Promise<boolean>
const arrived = new Set();      // families confirmed present, by id

/**
 * Ask for one family, once.
 *
 * Resolves true when the browser has the face and canvas will really draw in
 * it, and false when it could not be fetched — offline, blocked, or the name
 * is wrong. False is not an error to throw on: the stack still renders in the
 * fallback, which is why every entry has one chosen to look like it.
 */
export function loadFont(id) {
  const font = WEB_FONTS.find((f) => f.id === id);
  if (!font) return Promise.resolve(false);
  if (requested.has(font.family)) return requested.get(font.family);

  const p = (async () => {
    try {
      const href = `https://fonts.googleapis.com/css2?family=${
        encodeURIComponent(font.family).replace(/%20/g, '+')}:wght@${font.weights}&display=swap`;
      /*
       * Wait for the stylesheet to be parsed before asking for the face.
       *
       * Appending a <link> starts a fetch; it does not finish one. Until that
       * stylesheet is parsed there is no @font-face rule for the family, so
       * `document.fonts.load` matches nothing and resolves with an empty list
       * — reporting "this font could not be loaded" for a font that was merely
       * still on its way. On a fast connection you would rarely catch it; on a
       * slow one every font would look unavailable.
       */
      let link = document.querySelector(`link[data-font="${CSS.escape(font.family)}"]`);
      if (!link) {
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.font = font.family;
        const parsed = new Promise((resolve) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', resolve, { once: true });
        });
        document.head.appendChild(link);
        await parsed;
      }
      /*
       * The stylesheet arriving is not the font arriving. `document.fonts.load`
       * is what actually fetches the face and settles once it is usable, and
       * it is the only thing canvas cares about — measuring or drawing before
       * it resolves silently uses a fallback.
       *
       * Each weight is asked for separately, because loading one weight of a
       * family does not load the others, and a bold title in a family where
       * only the regular arrived comes out synthetically smeared.
       */
      const weights = font.weights.split(';');
      const got = await Promise.all(weights.map((wt) =>
        document.fonts.load(`${wt} 32px "${font.family}"`).catch(() => [])));
      const ok = got.some((faces) => faces.length > 0);
      if (ok) arrived.add(font.id);
      return ok;
    } catch {
      return false;
    }
  })();

  requested.set(font.family, p);
  return p;
}

/**
 * Make sure every font a set of text needs is really here before drawing.
 *
 * The exporter calls this before its first frame. Without it an export can
 * come back in a different typeface from the preview — the fonts finish
 * loading somewhere in the middle of the render, so the first few seconds are
 * in the fallback and the rest is not, which is worse than either.
 *
 * Never rejects and never blocks forever: a font that will not load must not
 * be able to stop an export.
 */
export async function preloadFonts(ids, { timeout = 8000 } = {}) {
  const wanted = [...new Set((ids || []).filter(Boolean))];
  if (!wanted.length) return { loaded: [], missing: [] };

  const results = await Promise.all(wanted.map(async (id) => {
    if (!WEB_FONTS.some((f) => f.id === id)) return [id, true];   // a system stack
    const ok = await Promise.race([
      loadFont(id),
      new Promise((r) => setTimeout(() => r(false), timeout)),
    ]);
    return [id, ok];
  }));

  return {
    loaded: results.filter(([, ok]) => ok).map(([id]) => id),
    missing: results.filter(([, ok]) => !ok).map(([id]) => id),
  };
}

/**
 * Has this family already been fetched and confirmed?
 *
 * Answered from what we actually loaded, not from `document.fonts.check`.
 *
 * `check` is not the question it looks like. Given a family with no matching
 * @font-face rule it returns **true** — the spec has it assume an unknown name
 * is a system font that is therefore already available. So it says true for
 * every typeface in this library before any of them are fetched, and for names
 * that are pure nonsense. Trusting it meant the picker skipped the fetch for
 * every font, every time, and nothing ever loaded.
 *
 * `document.fonts.load` resolving with at least one FontFace is the real
 * signal, and that is what this records.
 */
export function isLoaded(id) {
  if (!WEB_FONTS.some((f) => f.id === id)) return true;   // a system stack
  return arrived.has(id);
}
