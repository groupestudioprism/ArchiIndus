/* Outils d'édition 2D type CAO : transformations (rotation, échelle, symétrie), décalage, ajustement et prolongement.
   Toutes les fonctions travaillent en millimètres, sur des copies : l'appelant les place dans Doc.mutate. */
const Edit2D = (() => {
  const EPS = 1e-7;
  /* Transformation affine p → [a·x + b·y + e, c·x + d·y + f] appliquée à un objet. */
  function affine(o, M) {
    const [a, b, c, d, e, f] = M, det = a * d - b * c, k = Math.sqrt(Math.abs(det));
    const tp = (p) => { const x = p[0], y = p[1]; p[0] = +(a * x + b * y + e).toFixed(6); p[1] = +(c * x + d * y + f).toFixed(6); };
    const ang = Math.atan2(c, a) * 180 / Math.PI;
    if (o.type === 'line') { tp(o.a); tp(o.b); }
    else if (o.type === 'poly') o.pts.forEach(tp);
    else if (o.type === 'circle') { tp(o.c); o.r = +(o.r * k).toFixed(6); }
    else if (o.type === 'dim') { tp(o.a); tp(o.b); o.off = +(o.off * k * Math.sign(det || 1)).toFixed(6); o.h = Math.max(1, o.h * k); }
    else if (o.type === 'text') { tp(o.p); o.h = Math.max(1, o.h * k); }
    else if (o.type === 'sym') { tp(o.c); o.s = Math.min(SYM_MAX, Math.max(SYM_MIN, o.s * k)); o.rot = (((det < 0 ? 180 - o.rot : o.rot) + ang) % 360 + 360) % 360; }
    if (o.st && k !== 1) o.st.w = Math.max(1, Math.round(o.st.w * k * 10) / 10);
    return o;
  }
  const rotM = (c, th) => { const cs = Math.cos(th), sn = Math.sin(th); return [cs, -sn, sn, cs, c[0] - cs * c[0] + sn * c[1], c[1] - sn * c[0] - cs * c[1]]; };
  const scaleM = (c, k) => [k, 0, 0, k, c[0] * (1 - k), c[1] * (1 - k)];
  /* symétrie par rapport à la droite (p, q) */
  function mirrorM(p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1;
    const a = (dx * dx - dy * dy) / L2, b = 2 * dx * dy / L2;
    return [a, b, b, -a, p[0] - a * p[0] - b * p[1], p[1] - b * p[0] + a * p[1]];
  }

  /* ---------- décalage ---------- */
  const unit = (a, b) => { const L = G.dist(a, b) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  function lineInter(p, r, q, s) {   /* droites p + t·r et q + u·s */
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
    return [p[0] + t * r[0], p[1] + t * r[1]];
  }
  /* Polyligne décalée de dist (positif : à gauche du sens de parcours), raccords en onglet. */
  function offsetPts(pts, closed, dist) {
    const n = pts.length, segs = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n], u = unit(a, b), nn = [-u[1], u[0]];
      segs.push({ a: [a[0] + nn[0] * dist, a[1] + nn[1] * dist], b: [b[0] + nn[0] * dist, b[1] + nn[1] * dist], u });
    }
    const out = [];
    if (closed) {
      for (let i = 0; i < segs.length; i++) { const s0 = segs[(i - 1 + segs.length) % segs.length], s1 = segs[i]; out.push(lineInter(s0.a, s0.u, s1.a, s1.u) || s1.a); }
    } else {
      out.push(segs[0].a);
      for (let i = 1; i < segs.length; i++) out.push(lineInter(segs[i - 1].a, segs[i - 1].u, segs[i].a, segs[i].u) || segs[i].a);
      out.push(segs[segs.length - 1].b);
    }
    return out.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  }
  /* côté du point p par rapport à un objet : +1 à gauche (ou à l'extérieur d'un cercle), −1 sinon */
  function sideOf(o, p) {
    if (o.type === 'circle') return G.dist(p, o.c) >= o.r ? 1 : -1;
    let best = null, bd = Infinity;
    for (const [a, b] of Geo.segments(o)) { const d = G.distPtSeg(p, a, b); if (d < bd) { bd = d; best = [a, b]; } }
    if (!best) return 1;
    const [a, b] = best;
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0 ? 1 : -1;
  }
  function offset(o, dist, p) {
    const s = sideOf(o, p), c = Geo.clone(o);
    delete c.id;
    if (o.type === 'circle') { const r = o.r + s * dist; if (r <= 1e-6) return null; c.r = +r.toFixed(6); return c; }
    if (o.type === 'line') { const u = unit(o.a, o.b), nn = [-u[1] * s * dist, u[0] * s * dist]; c.a = [o.a[0] + nn[0], o.a[1] + nn[1]]; c.b = [o.b[0] + nn[0], o.b[1] + nn[1]]; return c; }
    if (o.type === 'poly') { c.pts = offsetPts(o.pts, o.closed, s * dist); return c; }
    return null;
  }

  /* ---------- ajuster / prolonger ---------- */
  /* Paramètres t (0..1 le long de [a,b], ou au-delà si `ext`) où le segment coupe les autres objets visibles. */
  function cuts(a, b, skipId, ext) {
    const ts = [], r = [b[0] - a[0], b[1] - a[1]], L2 = r[0] * r[0] + r[1] * r[1];
    if (L2 < EPS) return ts;
    for (const o of Doc.get().objects) {
      if (o.id === skipId) continue;
      const l = Doc.layer(o.layer); if (!l || !l.visible || !Model.visible2D(o) || o.type === 'text' || o.type === 'dim') continue;
      if (o.type === 'circle' || o.type === 'sym') {
        const R = o.type === 'circle' ? o.r : o.s * 0.5, f = [a[0] - o.c[0], a[1] - o.c[1]];
        const B = 2 * (f[0] * r[0] + f[1] * r[1]), C = f[0] * f[0] + f[1] * f[1] - R * R, D = B * B - 4 * L2 * C;
        if (D >= 0) for (const sg of [-1, 1]) { const t = (-B + sg * Math.sqrt(D)) / (2 * L2); if (ext || (t > EPS && t < 1 - EPS)) ts.push(t); }
        continue;
      }
      for (const [c, d] of Geo.segments(o)) {
        const s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
        if (u < -EPS || u > 1 + EPS) continue;
        if (ext || (t > EPS && t < 1 - EPS)) ts.push(t);
      }
    }
    return ts.sort((x, y) => x - y);
  }
  const at = (a, b, t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(6), +(a[1] + (b[1] - a[1]) * t).toFixed(6)];
  const paramOn = (p, a, b) => { const r = [b[0] - a[0], b[1] - a[1]], L2 = r[0] * r[0] + r[1] * r[1] || 1; return ((p[0] - a[0]) * r[0] + (p[1] - a[1]) * r[1]) / L2; };

  /* Ajuster : retire le morceau de l'objet (ligne ou polyligne) situé sous le clic, entre deux intersections.
     Renvoie la liste des objets qui remplacent l'original (vide : objet entièrement retiré), ou null si rien à couper. */
  function trim(o, p) {
    if (o.type === 'line') {
      const ts = cuts(o.a, o.b, o.id, false), t = paramOn(p, o.a, o.b);
      if (!ts.length) return null;
      const lo = ts.filter((x) => x < t).pop(), hi = ts.find((x) => x > t);
      const out = [];
      if (lo !== undefined) out.push({ ...Geo.clone(o), a: o.a.slice(), b: at(o.a, o.b, lo) });
      if (hi !== undefined) out.push({ ...Geo.clone(o), a: at(o.a, o.b, hi), b: o.b.slice() });
      out.forEach((x) => delete x.id);
      return out;
    }
    if (o.type === 'poly' && !o.closed) {
      /* segment touché, puis ses coupures ; la polyligne est scindée en deux morceaux au plus */
      const segs = Geo.segments(o); let k = 0, bd = Infinity;
      segs.forEach(([a, b], i) => { const d = G.distPtSeg(p, a, b); if (d < bd) { bd = d; k = i; } });
      const [a, b] = segs[k], ts = cuts(a, b, o.id, false), t = paramOn(p, a, b);
      if (!ts.length) return null;
      const lo = ts.filter((x) => x < t).pop(), hi = ts.find((x) => x > t), out = [];
      if (lo !== undefined) { const pts = o.pts.slice(0, k + 1).concat([at(a, b, lo)]); if (pts.length >= 2) out.push({ ...Geo.clone(o), pts }); }
      if (hi !== undefined) { const pts = [at(a, b, hi)].concat(o.pts.slice(k + 1)); if (pts.length >= 2) out.push({ ...Geo.clone(o), pts }); }
      out.forEach((x) => delete x.id);
      return out;
    }
    return null;
  }
  /* Prolonger : allonge l'extrémité la plus proche du clic jusqu'au premier objet rencontré. */
  function extend(o, p) {
    let a, b, end;
    if (o.type === 'line') { end = G.dist(p, o.a) < G.dist(p, o.b) ? 'a' : 'b'; [a, b] = end === 'a' ? [o.b, o.a] : [o.a, o.b]; }
    else if (o.type === 'poly' && !o.closed) { const n = o.pts.length; end = G.dist(p, o.pts[0]) < G.dist(p, o.pts[n - 1]) ? 0 : n - 1; [a, b] = end === 0 ? [o.pts[1], o.pts[0]] : [o.pts[n - 2], o.pts[n - 1]]; }
    else return null;
    const t = cuts(a, b, o.id, true).find((x) => x > 1 + EPS);
    if (t === undefined) return null;
    const q = at(a, b, t), c = Geo.clone(o);
    if (o.type === 'line') c[end] = q; else c.pts[end] = q;
    return c;
  }

  return { affine, rotM, scaleM, mirrorM, offset, offsetPts, trim, extend, cuts };
})();
