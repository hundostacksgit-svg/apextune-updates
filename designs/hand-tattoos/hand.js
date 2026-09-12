// Shared hand + skeleton generator for the three hand-tattoo layout references.
//
// Builds a top-down right hand (back of the hand, thumb on the left, wrist at the
// bottom) into a 1200x1600 SVG and returns the landmark coordinates every design
// hangs its artwork and lettering on. Everything is black, white and grey.
//
// Usage:  const H = HAND.build(document.querySelector('svg'), { negative: true });
//         H.f.index.mcp  -> [x, y] of the index knuckle, etc.

window.HAND = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const XL = 'http://www.w3.org/1999/xlink';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) {
      if (k === 'href') e.setAttributeNS(XL, 'xlink:href', attrs[k]);
      e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  };
  const rad = d => d * Math.PI / 180;
  // Walk from p by L pixels in direction a (degrees; 0 = straight up, + = leans right).
  const step = (p, a, L) => [p[0] + Math.sin(rad(a)) * L, p[1] - Math.cos(rad(a)) * L];
  const f1 = p => p.map(v => (+v).toFixed(1)).join(' ');

  // ---- anatomy -----------------------------------------------------------
  const FINGERS = {
    index:  { mcp: [455, 800], angle: -5, len: [215, 130, 105], w: 98,  bw: [36, 32, 26, 20] },
    middle: { mcp: [572, 775], angle:  0, len: [235, 145, 112], w: 102, bw: [38, 34, 28, 22] },
    ring:   { mcp: [685, 795], angle:  4, len: [220, 135, 108], w: 94,  bw: [34, 30, 25, 19] },
    pinky:  { mcp: [790, 850], angle:  9, len: [170, 105,  92], w: 80,  bw: [30, 26, 21, 16] },
  };
  const META_BASE = { index: [505, 1195], middle: [565, 1200], ring: [630, 1205], pinky: [690, 1215] };
  const THUMB = { cmc: [455, 1235], mcp: [320, 1020], ip: [235, 895], tip: [178, 800], w: 108 };
  const CARPALS = [
    [500, 1245, 30, 26, -10], [560, 1240, 28, 24, 5], [618, 1245, 27, 24, -5], [672, 1255, 28, 25, 12],
    [486, 1302, 31, 27, 8],   [548, 1298, 28, 25, -6], [608, 1302, 28, 25, 4],  [668, 1312, 27, 26, -10],
  ];

  function landmarks() {
    const f = {};
    for (const k in FINGERS) {
      const F = FINGERS[k];
      const pip = step(F.mcp, F.angle, F.len[0]);
      const dip = step(pip, F.angle, F.len[1]);
      const tip = step(dip, F.angle, F.len[2]);
      f[k] = { ...F, pip, dip, tip, base: META_BASE[k], total: F.len[0] + F.len[1] + F.len[2] };
    }
    return {
      f, thumb: THUMB, step,
      wrist: { cy: 1440, left: 430, right: 790, top: 1360 },
      back: { cx: 610, cy: 1020 },              // centre of the back of the hand
      W: 1200, H: 1600,
    };
  }

  // A long bone: pinched shaft, rounded flared heads. p1 = base, p2 = distal end.
  function bonePath(p1, p2, w, o = {}) {
    const r0 = (o.r0 ?? 1.0) * w / 2, r1 = (o.r1 ?? 1.12) * w / 2, a = (o.waist ?? 0.7) * w / 2;
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const P = (t, s) => [p1[0] + ux * L * t + nx * s, p1[1] + uy * L * t + ny * s];
    return `M ${f1(P(0, r0))} C ${f1(P(0.3, a))} ${f1(P(0.7, a))} ${f1(P(1, r1))} ` +
           `A ${r1} ${r1} 0 0 0 ${f1(P(1, -r1))} C ${f1(P(0.7, -a))} ${f1(P(0.3, -a))} ${f1(P(0, -r0))} ` +
           `A ${r0} ${r0} 0 0 0 ${f1(P(0, r0))} Z`;
  }

  // ---- skin --------------------------------------------------------------
  function skinShapes(parent, paint) {
    const L = landmarks();
    const g = el('g', { fill: paint, stroke: paint, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
    // palm + wrist + forearm stub
    el('path', { stroke: 'none', d:
      'M 436 1600 L 430 1400 C 404 1260 405 1050 406 830 C 406 800 430 780 455 790 L 572 765 L 685 785 ' +
      'C 740 800 790 830 800 850 C 830 860 842 900 846 950 C 850 1060 836 1260 792 1400 L 784 1600 Z' }, g);
    // thumb webbing
    el('path', { stroke: 'none', d: 'M 410 860 C 380 950 340 1000 290 1060 L 330 1120 L 420 1280 Z' }, g);
    // fingers: three stroked segments each, tapering toward the tip
    for (const k in L.f) {
      const F = L.f[k];
      const seg = (a, b, w) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': w }, g);
      seg(F.mcp, F.pip, F.w);
      seg(F.pip, F.dip, F.w * 0.92);
      seg(F.dip, step(F.dip, F.angle, F.len[2] - F.w * 0.42), F.w * 0.84);
    }
    const T = L.thumb;
    const tseg = (a, b, w) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': w }, g);
    tseg(T.cmc, T.mcp, T.w * 1.05);
    tseg(T.mcp, T.ip, T.w * 0.95);
    tseg(T.ip, [T.tip[0] + 12, T.tip[1] + 18], T.w * 0.86);
    return g;
  }

  // ---- skeleton ----------------------------------------------------------
  function skeleton(parent) {
    const L = landmarks();
    const g = el('g', { id: 'skel' }, parent);
    const bone = (p1, p2, w, o) => el('path', { d: bonePath(p1, p2, w, o), class: 'bone' }, g);
    for (const k in L.f) {
      const F = L.f[k];
      bone(F.base, F.mcp, F.bw[0], { r0: 1.05, r1: 1.18 });                  // metacarpal
      bone(F.mcp, F.pip, F.bw[1], { r0: 1.15, r1: 1.1 });                    // proximal phalanx
      bone(F.pip, F.dip, F.bw[2], { r0: 1.15, r1: 1.05 });                   // middle phalanx
      bone(F.dip, step(F.dip, F.angle, F.len[2] - F.bw[3] * 0.9), F.bw[3], { r0: 1.15, r1: 0.95 }); // distal
    }
    const T = L.thumb;
    bone(T.cmc, T.mcp, 40, { r0: 1.1, r1: 1.15 });
    bone(T.mcp, T.ip, 34, { r0: 1.15, r1: 1.1 });
    bone(T.ip, [T.tip[0] + 8, T.tip[1] + 14], 26, { r0: 1.15, r1: 0.95 });
    for (const [cx, cy, rx, ry, rot] of CARPALS)
      el('ellipse', { cx, cy, rx, ry, transform: `rotate(${rot} ${cx} ${cy})`, class: 'bone' }, g);
    bone([526, 1345], [520, 1640], 62, { r0: 1.42, r1: 0.9, waist: 0.62 });  // radius
    bone([692, 1355], [706, 1640], 46, { r0: 1.15, r1: 0.9, waist: 0.66 });  // ulna
    return g;
  }

  // ---- defs (gradients, filters, masks) ------------------------------------
  function defs(svg, opts) {
    const d = el('defs', {}, svg);
    const sg = el('radialGradient', { id: 'skinGrad', gradientUnits: 'userSpaceOnUse', cx: 600, cy: 980, r: 780 }, d);
    el('stop', { offset: 0, 'stop-color': opts.skinLight || '#5e5e5e' }, sg);
    el('stop', { offset: 0.65, 'stop-color': opts.skinMid || '#3f3f3f' }, sg);
    el('stop', { offset: 1, 'stop-color': opts.skinDark || '#262626' }, sg);

    const bg = el('linearGradient', { id: 'boneGrad', x1: 0, y1: 0, x2: 1, y2: 0.15 }, d);
    el('stop', { offset: 0, 'stop-color': '#ffffff' }, bg);
    el('stop', { offset: 0.45, 'stop-color': '#f1f1f1' }, bg);
    el('stop', { offset: 1, 'stop-color': '#b9b9b9' }, bg);

    const inner = el('filter', { id: 'innerShade', x: '-5%', y: '-5%', width: '110%', height: '110%' }, d);
    el('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: 14, result: 'core' }, inner);
    el('feGaussianBlur', { in: 'core', stdDeviation: 14, result: 'soft' }, inner);
    el('feComposite', { in: 'SourceAlpha', in2: 'soft', operator: 'out', result: 'edge' }, inner);
    el('feFlood', { 'flood-color': '#000', 'flood-opacity': 0.8 }, inner);
    el('feComposite', { in2: 'edge', operator: 'in', result: 'shadow' }, inner);
    const m = el('feMerge', {}, inner);
    el('feMergeNode', { in: 'SourceGraphic' }, m);
    el('feMergeNode', { in: 'shadow' }, m);

    const drop = el('filter', { id: 'handShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, d);
    el('feGaussianBlur', { stdDeviation: 22 }, drop);

    const dil = el('filter', { id: 'negDilate', x: '-20%', y: '-20%', width: '140%', height: '140%' }, d);
    el('feMorphology', { operator: 'dilate', radius: opts.negativeRadius ?? 18, result: 'fat' }, dil);
    el('feGaussianBlur', { in: 'fat', stdDeviation: opts.negativeBlur ?? 7 }, dil);

    const boneShade = el('filter', { id: 'boneShade', x: '-10%', y: '-10%', width: '120%', height: '120%' }, d);
    el('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: 4, result: 'core' }, boneShade);
    el('feGaussianBlur', { in: 'core', stdDeviation: 5, result: 'soft' }, boneShade);
    el('feComposite', { in: 'SourceAlpha', in2: 'soft', operator: 'out', result: 'edge' }, boneShade);
    el('feFlood', { 'flood-color': '#6a6a6a', 'flood-opacity': 0.55 }, boneShade);
    el('feComposite', { in2: 'edge', operator: 'in', result: 'shadow' }, boneShade);
    const m2 = el('feMerge', {}, boneShade);
    el('feMergeNode', { in: 'SourceGraphic' }, m2);
    el('feMergeNode', { in: 'shadow' }, m2);

    const pores = el('filter', { id: 'pores' }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.85, numOctaves: 2, seed: 7 }, pores);
    el('feColorMatrix', { type: 'saturate', values: 0 }, pores);

    const glow = el('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, d);
    el('feGaussianBlur', { stdDeviation: 6 }, glow);

    const wide = el('filter', { id: 'softWide', x: '-30%', y: '-30%', width: '160%', height: '160%' }, d);
    el('feGaussianBlur', { stdDeviation: 14 }, wide);

    const soft = el('filter', { id: 'soft', x: '-30%', y: '-30%', width: '160%', height: '160%' }, d);
    el('feGaussianBlur', { stdDeviation: 3 }, soft);

    const mask = el('mask', { id: 'skinMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    skinShapes(mask, '#fff');
    return d;
  }

  function build(svg, opts = {}) {
    const L = landmarks();
    svg.setAttribute('viewBox', '0 0 1200 1600');
    defs(svg, opts);

    // neutral grey ground
    el('rect', { width: 1200, height: 1600, fill: opts.ground || '#8a8a8a' }, svg);
    // cast shadow
    const sh = el('g', { filter: 'url(#handShadow)', opacity: 0.55, transform: 'translate(10 18)' }, svg);
    skinShapes(sh, '#000');
    // skin
    const skin = el('g', { filter: 'url(#innerShade)' }, svg);
    skinShapes(skin, 'url(#skinGrad)');
    // pores
    el('rect', { width: 1200, height: 1600, filter: 'url(#pores)', mask: 'url(#skinMask)', opacity: 0.16,
      style: 'mix-blend-mode:overlay' }, svg);

    // tattoo layer: everything after this is masked to the skin
    const ink = el('g', { id: 'ink', mask: 'url(#skinMask)' }, svg);
    const under = el('g', { id: 'under' }, ink);           // artwork that sits under the bones
    const sdefs = el('defs', {}, ink);
    skeleton(sdefs);
    if (opts.negative !== false)
      el('use', { href: '#skel', fill: '#050505', filter: 'url(#negDilate)', opacity: opts.negativeOpacity ?? 1 }, ink);
    const mid = el('g', { id: 'mid' }, ink);               // artwork over the black, under the bones
    const bones = el('g', { id: 'bones', filter: 'url(#boneShade)' }, ink);
    el('use', { href: '#skel', fill: 'url(#boneGrad)', stroke: '#8f8f8f', 'stroke-width': 1.2 }, bones);
    const over = el('g', { id: 'over' }, ink);             // artwork over the bones
    const text = el('g', { id: 'lettering' }, ink);        // lettering on top of everything
    return { ...L, el, svg, under, mid, over, text, bonePath };
  }

  return { build, landmarks, el, step, bonePath };
})();
