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
    // webbing between adjacent finger bases: a U-shaped fillet so the gap does not read as a
    // hard-edged slot of ground between two cylinders
    const keys = ['index', 'middle', 'ring', 'pinky'];
    for (let i = 0; i < 3; i++) {
      const A = L.f[keys[i]], B = L.f[keys[i + 1]], nA = leftOf(A.angle), nB = leftOf(B.angle);
      // corners tucked 4px inside each finger and 8px below the knuckle line so no edge of the
      // fillet coincides with a finger edge (a coincident edge leaves an anti-aliasing speck)
      const a0 = step([A.mcp[0] - nA[0] * (A.w / 2 - 4), A.mcp[1] - nA[1] * (A.w / 2 - 4)], A.angle, -8);
      const b0 = step([B.mcp[0] + nB[0] * (B.w / 2 - 4), B.mcp[1] + nB[1] * (B.w / 2 - 4)], B.angle, -8);
      const a1 = step(a0, A.angle, 54), b1 = step(b0, B.angle, 54);
      const m = step([(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], (A.angle + B.angle) / 2, 6);
      el('path', { stroke: 'none', d: `M ${f1(a0)} L ${f1(a1)} Q ${f1(m)} ${f1(b1)} L ${f1(b0)} Z` }, g);
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
    el('feFlood', { 'flood-color': '#000', 'flood-opacity': 0.6 }, inner);
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

    // ---- scene + skin-realism defs (all ids prefixed h* so design pages never collide) ----
    // Full-canvas blur filters. userSpaceOnUse regions so thin strokes are not clipped by the
    // default bbox-relative filter region.
    const blur = (id, sd) => {
      const f = el('filter', { id, filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
      el('feGaussianBlur', { stdDeviation: sd }, f);
    };
    blur('hBlur1', 1.3); blur('hBlur3', 3); blur('hBlur6', 6); blur('hBlur10', 10); blur('hBlur16', 16); blur('hBlur24', 24); blur('hBlur40', 40);

    // Woven fabric grain for the trouser knee: two anisotropic noise fields multiplied so the
    // grain reads as warp x weft rather than as clouds.
    const weave = el('filter', { id: 'hWeave', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9 0.16', numOctaves: 2, seed: 3, result: 'warp' }, weave);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.16 0.9', numOctaves: 2, seed: 5, result: 'weft' }, weave);
    el('feBlend', { in: 'warp', in2: 'weft', mode: 'multiply', result: 'w' }, weave);
    el('feColorMatrix', { in: 'w', type: 'saturate', values: 0 }, weave);
    // Diagonal twill lines (denim / knit wale) over the weave.
    const twill = el('pattern', { id: 'hTwill', patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(-55)' }, d);
    el('rect', { width: 6, height: 2.2, fill: '#fff', opacity: 0.045 }, twill);
    el('rect', { y: 3.2, width: 6, height: 1.4, fill: '#000', opacity: 0.12 }, twill);
    // Broad fabric mottling (slubs, worn patches).
    const slub = el('filter', { id: 'hSlub', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.006, numOctaves: 3, seed: 13 }, slub);
    el('feColorMatrix', { type: 'saturate', values: 0 }, slub);
    // Broad skin mottling: uneven tone under the pores.
    const mottle = el('filter', { id: 'hMottle', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.014, numOctaves: 3, seed: 23 }, mottle);
    el('feColorMatrix', { type: 'saturate', values: 0 }, mottle);
    // Fuzz on the knit cuff.
    const fuzz = el('filter', { id: 'hFuzz', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.5 0.08', numOctaves: 2, seed: 41 }, fuzz);
    el('feColorMatrix', { type: 'saturate', values: 0 }, fuzz);

    // Knee: a soft lighter dome under the hand, lit from the upper left.
    const knee = el('radialGradient', { id: 'hKnee', gradientUnits: 'userSpaceOnUse', cx: 560, cy: 880, r: 640, fx: 470, fy: 760 }, d);
    el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.34 }, knee);
    el('stop', { offset: 0.5, 'stop-color': '#fff', 'stop-opacity': 0.13 }, knee);
    el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, knee);
    // Vignette: darker corners, strongest lower right (away from the light).
    const vig = el('radialGradient', { id: 'hVignette', gradientUnits: 'userSpaceOnUse', cx: 520, cy: 820, r: 900 }, d);
    el('stop', { offset: 0.35, 'stop-color': '#000', 'stop-opacity': 0 }, vig);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.62 }, vig);

    // Directional skin light: upper-left highlight fading to a dark lower-right / wrist falloff.
    const key = el('linearGradient', { id: 'hKeyLight', gradientUnits: 'userSpaceOnUse', x1: 380, y1: 640, x2: 900, y2: 1480 }, d);
    el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.20 }, key);
    el('stop', { offset: 0.42, 'stop-color': '#fff', 'stop-opacity': 0 }, key);
    el('stop', { offset: 0.5, 'stop-color': '#000', 'stop-opacity': 0 }, key);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.48 }, key);
    // Shadow the hoodie cuff throws up onto the wrist (kept under the ink, above y=1516).
    const cs = el('linearGradient', { id: 'hCuffShade', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 1512, x2: 0, y2: 1552 }, d);
    el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0 }, cs);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.55 }, cs);

    // Rim light / core shadow masks: the skin minus a copy of itself shifted away from (toward)
    // the light leaves a sliver along the lit (dark) silhouette edge.
    const rim = el('mask', { id: 'hRimMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    skinShapes(rim, '#fff');
    skinShapes(rim, '#000').setAttribute('transform', 'translate(11 13)');
    const core = el('mask', { id: 'hCoreMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    skinShapes(core, '#fff');
    skinShapes(core, '#000').setAttribute('transform', 'translate(-16 -18)');

    // Veins fade out toward the knuckles and the sides of the hand instead of ending in a cap.
    const vf = el('radialGradient', { id: 'hVeinFade', gradientUnits: 'userSpaceOnUse', cx: 600, cy: 1240, r: 300 }, d);
    el('stop', { offset: 0, 'stop-color': '#fff' }, vf);
    el('stop', { offset: 0.55, 'stop-color': '#fff', 'stop-opacity': 0.85 }, vf);
    el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, vf);
    const vm = el('mask', { id: 'hVeinMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1200, height: 1600 }, d);
    el('rect', { width: 1200, height: 1600, fill: 'url(#hVeinFade)' }, vm);

    // Ribbed knit for the cuff: one rib per 11px, a groove on the left of each rib.
    const rib = el('pattern', { id: 'hRib', patternUnits: 'userSpaceOnUse', width: 11, height: 11 }, d);
    el('rect', { width: 11, height: 11, fill: '#2a2a2a' }, rib);
    el('rect', { x: 3.5, width: 4.5, height: 11, fill: '#3b3b3b' }, rib);
    el('rect', { x: 6.5, width: 1.5, height: 11, fill: '#444' }, rib);
    el('rect', { width: 2.2, height: 11, fill: '#0f0f0f' }, rib);
    // Cylinder shading across the cuff (lit left of centre, falling off to both edges).
    const cyl = el('linearGradient', { id: 'hCuffCyl', gradientUnits: 'userSpaceOnUse', x1: 404, y1: 0, x2: 816, y2: 0 }, d);
    el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.62 }, cyl);
    el('stop', { offset: 0.22, 'stop-color': '#fff', 'stop-opacity': 0.07 }, cyl);
    el('stop', { offset: 0.48, 'stop-color': '#000', 'stop-opacity': 0.04 }, cyl);
    el('stop', { offset: 0.78, 'stop-color': '#000', 'stop-opacity': 0.34 }, cyl);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.72 }, cyl);
    return d;
  }

  // ---- scene: trouser knee -------------------------------------------------
  // The hand rests on a knee in dark streetwear. Dark woven fabric, a soft lighter dome where
  // the knee pushes up under the hand, a few loose folds, and darker corners.
  function ground(svg, opts) {
    const g = el('g', { id: 'hGround' }, svg);
    el('rect', { width: 1200, height: 1600, fill: opts.ground || '#2c2c2c' }, g);
    el('rect', { width: 1200, height: 1600, fill: 'url(#hKnee)' }, g);
    // folds: a dark trough with a lighter ridge on its lit (upper-left) side
    const fold = (d, w, dark, light) => {
      el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': w * 0.45, 'stroke-linecap': 'round', opacity: light,
        filter: 'url(#hBlur16)', transform: 'translate(-12 -14)' }, g);
      el('path', { d, fill: 'none', stroke: '#000', 'stroke-width': w, 'stroke-linecap': 'round', opacity: dark,
        filter: 'url(#hBlur16)' }, g);
    };
    fold('M -40 1120 C 90 1180 170 1300 210 1420 C 250 1520 300 1580 350 1640', 74, 0.5, 0.06);   // fold sweeping down the lower left
    fold('M 950 200 C 1010 430 1090 600 1165 740 C 1225 860 1270 990 1280 1120', 84, 0.45, 0.05); // fold down the right, well outside the pinky
    fold('M -40 430 C 200 310 420 260 640 250 C 860 240 1060 290 1240 390', 90, 0.38, 0.05);     // crease above the kneecap
    fold('M 20 980 C 90 840 170 740 300 670', 46, 0.3, 0.04);                                     // small fold left of the thumb
    fold('M 1000 1300 C 1080 1360 1140 1460 1200 1560', 40, 0.3, 0.03);                            // small fold lower right
    // weave + slubs
    el('rect', { width: 1200, height: 1600, filter: 'url(#hWeave)', opacity: 0.42, style: 'mix-blend-mode:overlay' }, g);
    el('rect', { width: 1200, height: 1600, fill: 'url(#hTwill)', opacity: 0.16 }, g);
    el('rect', { width: 1200, height: 1600, filter: 'url(#hSlub)', opacity: 0.22, style: 'mix-blend-mode:overlay' }, g);
    el('rect', { width: 1200, height: 1600, fill: 'url(#hVignette)' }, g);
    return g;
  }

  // Cast shadow of the hand on the fabric: a tight contact shadow plus a broad soft one
  // thrown down and to the right (light from the upper left).
  function castShadow(svg) {
    const g = el('g', { id: 'hShadow' }, svg);
    const broad = el('g', { filter: 'url(#hBlur40)', opacity: 0.62, transform: 'translate(34 44)' }, g);
    skinShapes(broad, '#000');
    const contact = el('g', { filter: 'url(#hBlur10)', opacity: 0.75, transform: 'translate(8 10)' }, g);
    skinShapes(contact, '#000');
    return g;
  }

  // Angle (degrees, 0 = up, + = leans right) of the segment a -> b, matching step().
  const segAngle = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI;
  // Unit normal pointing to the left of direction a (toward the light for an upright finger).
  const leftOf = a => [-Math.cos(rad(a)), -Math.sin(rad(a))];

  // ---- skin lighting ----------------------------------------------------------
  // Everything here is masked to the skin and sits under the ink. Moody key light from the
  // upper left: a broad key gradient, a rim along the lit silhouette, a core shadow along the
  // far edge, and cylinder shading on every finger segment.
  function skinLight(svg, L) {
    const g = el('g', { id: 'hSkinLight', mask: 'url(#skinMask)' }, svg);
    el('rect', { width: 1200, height: 1600, fill: 'url(#hKeyLight)' }, g);
    // fingers and thumb: lit left edge, shaded right edge
    const cyl = el('g', { filter: 'url(#hBlur10)' }, g);
    const shade = (a, b, w) => {
      const ang = segAngle(a, b), n = leftOf(ang);
      const off = (p, k) => [p[0] + n[0] * k, p[1] + n[1] * k];
      const [l1, l2] = [off(a, w * 0.27), off(b, w * 0.27)];
      const [d1, d2] = [off(a, -w * 0.33), off(b, -w * 0.33)];
      el('line', { x1: l1[0], y1: l1[1], x2: l2[0], y2: l2[1], stroke: '#fff', 'stroke-width': w * 0.30, 'stroke-linecap': 'round', opacity: 0.13 }, cyl);
      el('line', { x1: d1[0], y1: d1[1], x2: d2[0], y2: d2[1], stroke: '#000', 'stroke-width': w * 0.34, 'stroke-linecap': 'round', opacity: 0.30 }, cyl);
    };
    for (const k in L.f) {
      const F = L.f[k];
      shade(F.mcp, F.pip, F.w);
      shade(F.pip, F.dip, F.w * 0.92);
      shade(F.dip, step(F.dip, F.angle, F.len[2] - F.w * 0.5), F.w * 0.84);
    }
    const T = L.thumb;
    shade(T.cmc, T.mcp, T.w * 1.05);
    shade(T.mcp, T.ip, T.w * 0.95);
    shade(T.ip, [T.tip[0] + 12, T.tip[1] + 24], T.w * 0.86);
    // broad highlight along the index side and over the tops of the metacarpals
    const hi = el('g', { filter: 'url(#hBlur24)' }, g);
    el('ellipse', { cx: 505, cy: 960, rx: 70, ry: 200, fill: '#fff', opacity: 0.14, transform: 'rotate(-12 505 960)' }, hi);
    el('line', { x1: 465, y1: 845, x2: 735, y2: 865, stroke: '#fff', 'stroke-width': 80, 'stroke-linecap': 'round', opacity: 0.10 }, hi);
    // the hollow between the thumb and index metacarpals sits lower and darker
    el('ellipse', { cx: 420, cy: 1120, rx: 60, ry: 130, fill: '#000', opacity: 0.22, transform: 'rotate(28 420 1120)' }, hi);
    // rim light along the lit silhouette edge, core shadow along the far one
    const rimF = el('g', { filter: 'url(#hBlur6)', opacity: 0.42 }, g);
    skinShapes(el('g', { mask: 'url(#hRimMask)' }, rimF), '#fff');
    const coreF = el('g', { filter: 'url(#hBlur10)', opacity: 0.55 }, g);
    skinShapes(el('g', { mask: 'url(#hCoreMask)' }, coreF), '#000');
    return g;
  }

  // Pores and broad mottling, both masked to the skin.
  function skinTexture(svg) {
    const g = el('g', { id: 'hSkinTexture', mask: 'url(#skinMask)' }, svg);
    el('rect', { width: 1200, height: 1600, filter: 'url(#hMottle)', opacity: 0.16, style: 'mix-blend-mode:overlay' }, g);
    el('rect', { width: 1200, height: 1600, filter: 'url(#pores)', opacity: 0.18, style: 'mix-blend-mode:overlay' }, g);
    return g;
  }

  // ---- veins and tendons ------------------------------------------------------
  // Two/three lighter, slightly raised veins branching up the back of the hand between the
  // metacarpals, plus the faint extensor tendon ridges along each metacarpal. Low contrast.
  function veins(svg, L) {
    const g = el('g', { id: 'hVeins', mask: 'url(#skinMask)' }, svg);
    // tendons: a lit ridge and a shaded side along base -> mcp
    const tend = el('g', { filter: 'url(#hBlur10)' }, g);
    for (const k in L.f) {
      const F = L.f[k], w = F.bw[0];
      const a = step(F.base, segAngle(F.base, F.mcp), 40), b = step(F.mcp, segAngle(F.base, F.mcp), -30);
      el('line', { x1: a[0] - 4, y1: a[1] - 3, x2: b[0] - 4, y2: b[1] - 3, stroke: '#fff', 'stroke-width': w * 0.55, 'stroke-linecap': 'round', opacity: 0.075 }, tend);
      el('line', { x1: a[0] + 9, y1: a[1] + 4, x2: b[0] + 9, y2: b[1] + 4, stroke: '#000', 'stroke-width': w * 0.5, 'stroke-linecap': 'round', opacity: 0.10 }, tend);
    }
    // veins: a soft shadow under, a lighter body, a thin brighter crest
    const V = [
      ['M 548 1392 C 540 1300 532 1220 522 1140 C 514 1060 504 990 492 936', 12],   // index / middle gap
      ['M 526 1180 C 500 1140 486 1100 470 1064', 8],                                 // branch toward the thumb
      ['M 600 1395 C 604 1300 606 1220 613 1140 C 621 1060 634 990 646 930', 11],    // middle / ring gap
      ['M 613 1140 C 640 1122 664 1132 692 1168', 7],                                 // cross link
      ['M 658 1398 C 664 1310 676 1240 692 1168 C 710 1100 726 1030 744 968', 10],   // ring / pinky gap
      ['M 692 1168 C 722 1150 748 1132 778 1118', 7],                                 // branch toward the pinky
    ];
    const vg = el('g', { mask: 'url(#hVeinMask)' }, g);
    const under = el('g', { filter: 'url(#hBlur6)' }, vg), body = el('g', { filter: 'url(#hBlur3)' }, vg), crest = el('g', { filter: 'url(#hBlur3)' }, vg);
    for (const [d, w] of V) {
      el('path', { d, fill: 'none', stroke: '#000', 'stroke-width': w * 1.5, 'stroke-linecap': 'round', opacity: 0.12, transform: 'translate(5 5)' }, under);
      el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': w, 'stroke-linecap': 'round', opacity: 0.08 }, body);
      el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': w * 0.4, 'stroke-linecap': 'round', opacity: 0.06, transform: 'translate(-1.5 -1.5)' }, crest);
    }
    return g;
  }

  // ---- knuckle creases ----------------------------------------------------------
  // Short soft transverse creases over every finger joint (MCP, PIP, DIP) and both thumb
  // joints, placed on the landmark and rotated with the finger, with a lighter ridge on the
  // fingertip side so each knuckle reads as raised and a soft shadow on the wrist side.
  function creases(svg, L) {
    const g = el('g', { id: 'hCreases', mask: 'url(#skinMask)' }, svg);
    const lines = el('g', { filter: 'url(#hBlur1)', fill: 'none', stroke: '#000', 'stroke-linecap': 'round' }, g);
    const tone = el('g', { filter: 'url(#hBlur6)', fill: 'none', 'stroke-linecap': 'round' }, g);
    // p: joint, a: finger angle, w: skin width there, big: MCP (broader, more wrinkles)
    const joint = (p, a, w, big) => {
      const tf = `translate(${f1(p)}) rotate(${a.toFixed(1)})`;
      const hw = w * (big ? 0.47 : 0.44), n = big ? 4 : 3, gap = big ? 11 : 9;
      const G = el('g', { transform: tf }, lines);
      for (let i = 0; i < n; i++) {
        const y = (i - (n - 1) / 2) * gap, k = 1 - Math.abs(i - (n - 1) / 2) * 0.22;
        const h = hw * k, bow = -h * 0.22;          // arched toward the fingertip
        el('path', { d: `M ${-h} ${y} Q 0 ${y + bow} ${h} ${y}`, 'stroke-width': 3.4 * k, opacity: 0.40 * k }, G);
        // wrinkle highlight just below each crease
        el('path', { d: `M ${-h * 0.85} ${y + 3.5} Q 0 ${y + 3.5 + bow} ${h * 0.85} ${y + 3.5}`, stroke: '#fff', 'stroke-width': 1.8, opacity: 0.13 }, G);
      }
      const R = el('g', { transform: tf }, tone);
      const top = -(n - 1) / 2 * gap - hw * 0.35;
      el('path', { d: `M ${-hw * 0.9} ${top} Q 0 ${top - hw * 0.2} ${hw * 0.9} ${top}`, stroke: '#fff', 'stroke-width': hw * 0.34, opacity: 0.17 }, R);
      el('path', { d: `M ${-hw * 0.95} ${-top} Q 0 ${-top + hw * 0.18} ${hw * 0.95} ${-top}`, stroke: '#000', 'stroke-width': hw * 0.4, opacity: 0.15 }, R);
    };
    for (const k in L.f) {
      const F = L.f[k];
      joint(F.mcp, F.angle, F.w, true);
      joint(F.pip, F.angle, F.w * 0.92, false);
      joint(F.dip, F.angle, F.w * 0.84, false);
    }
    const T = L.thumb;
    joint(T.mcp, (segAngle(T.cmc, T.mcp) + segAngle(T.mcp, T.ip)) / 2, T.w, true);
    joint(T.ip, (segAngle(T.mcp, T.ip) + segAngle(T.ip, T.tip)) / 2, T.w * 0.9, false);
    return g;
  }

  // ---- hair ---------------------------------------------------------------------
  // Sparse short dark hairs on the proximal phalanges and the back of the hand near the
  // wrist. Seeded LCG so every render is identical.
  function hair(svg, L) {
    let s = 4242;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const g = el('g', { id: 'hHair', mask: 'url(#skinMask)', fill: 'none', stroke: '#050505', 'stroke-linecap': 'round' }, svg);
    // one hair at p, pointing in direction a (degrees, 0 = up), length len
    const strand = (p, a, len) => {
      const e = step(p, a, len), m = step(p, a + 40 * (rnd() - 0.5), len * 0.5);
      el('path', { d: `M ${f1(p)} Q ${f1(m)} ${f1(e)}`, 'stroke-width': 0.55 + rnd() * 0.45, opacity: 0.07 + rnd() * 0.12 }, g);
    };
    // proximal phalanges: hairs lie along the finger, leaning toward the pinky side
    for (const k in L.f) {
      const F = L.f[k];
      for (let i = 0; i < 26; i++) {
        const t = 0.10 + rnd() * 0.72, u = (rnd() - 0.5) * F.w * 0.72;
        const p = step(F.mcp, F.angle, F.len[0] * t), n = leftOf(F.angle);
        strand([p[0] - n[0] * u, p[1] - n[1] * u], F.angle + 20 + (rnd() - 0.5) * 70, 4 + rnd() * 7);
      }
    }
    const T = L.thumb, ta = segAngle(T.mcp, T.ip);
    for (let i = 0; i < 16; i++) {
      const t = 0.15 + rnd() * 0.7, u = (rnd() - 0.5) * T.w * 0.7;
      const p = step(T.mcp, ta, Math.hypot(T.ip[0] - T.mcp[0], T.ip[1] - T.mcp[1]) * t), n = leftOf(ta);
      strand([p[0] - n[0] * u, p[1] - n[1] * u], ta + 10 + (rnd() - 0.5) * 70, 4 + rnd() * 7);
    }
    // back of the hand near the wrist: hairs sweep up toward the pinky side
    for (let i = 0; i < 120; i++) {
      const x = 440 + rnd() * 350, y = 1100 + rnd() * 290;
      strand([x, y], 40 + (rnd() - 0.5) * 76, 5 + rnd() * 7);
    }
    for (let i = 0; i < 40; i++) {
      const x = 440 + rnd() * 380, y = 960 + rnd() * 150;
      strand([x, y], 35 + (rnd() - 0.5) * 80, 4 + rnd() * 6);
    }
    return g;
  }

  // ---- hoodie cuff ------------------------------------------------------------
  // Ribbed knit band crossing the forearm at the very bottom of the canvas. Its top edge is
  // at y=1548 in the centre (dipping to 1568 at the sides where it wraps round the arm), so
  // it stays clear of the wrist lettering, which ends around y=1535. Drawn after the ink
  // group because it is worn over the skin and its tattoos.
  const CUFF = 'M 404 1568 Q 610 1528 816 1568 L 822 1640 L 398 1640 Z';
  function cuff(svg) {
    const g = el('g', { id: 'hCuff' }, svg);
    // seats the cuff on the fabric with a soft shadow around it (offset so nothing lands above the edge)
    el('path', { d: CUFF, fill: '#000', opacity: 0.55, filter: 'url(#hBlur6)', transform: 'translate(6 14)' }, g);
    el('path', { d: CUFF, fill: 'url(#hRib)' }, g);
    el('path', { d: CUFF, filter: 'url(#hFuzz)', opacity: 0.35, style: 'mix-blend-mode:overlay' }, g);
    el('path', { d: CUFF, fill: 'url(#hCuffCyl)' }, g);
    // rolled top edge: a lit seam over a dark groove
    el('path', { d: 'M 404 1568 Q 610 1528 816 1568', fill: 'none', stroke: '#111', 'stroke-width': 3, transform: 'translate(0 6)' }, g);
    el('path', { d: 'M 404 1568 Q 610 1528 816 1568', fill: 'none', stroke: '#4a4a4a', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M 404 1568 Q 610 1528 816 1568', fill: 'none', stroke: '#6a6a6a', 'stroke-width': 1.2, opacity: 0.6, transform: 'translate(0 -1.5)' }, g);
    return g;
  }

  function build(svg, opts = {}) {
    const L = landmarks();
    svg.setAttribute('viewBox', '0 0 1200 1600');
    defs(svg, opts);

    // scene: dark trouser knee, hand shadow on it
    ground(svg, opts);
    castShadow(svg);
    // skin
    const skin = el('g', { filter: 'url(#innerShade)' }, svg);
    skinShapes(skin, 'url(#skinGrad)');
    skinLight(svg, L);
    skinTexture(svg);
    veins(svg, L);
    creases(svg, L);
    hair(svg, L);
    // shadow the cuff throws onto the wrist (under the ink so lettering is untouched)
    el('rect', { x: 0, y: 1500, width: 1200, height: 100, fill: 'url(#hCuffShade)', mask: 'url(#skinMask)' }, svg);

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

    // the hoodie cuff is worn over skin and ink alike
    cuff(svg);
    return { ...L, el, svg, under, mid, over, text, bonePath };
  }

  return { build, landmarks, el, step, bonePath };
})();
