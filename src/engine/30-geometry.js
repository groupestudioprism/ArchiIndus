/* Géométrie 2D. Un point est [x, y] en millimètres.
   Objets : line {a,b} · poly {pts,closed} · circle {c,r} · dim {a,b,off,h} · text {p,text,h} · sym {c,k,s,rot,tag}. */
const G = {
  dist: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]),
  mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
  distPtSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  },
  /* Intersection de deux segments [a,b] et [c,d] ; null si parallèles ou disjoints. */
  segInter(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  },
};

const Geo = {
  clone: (o) => JSON.parse(JSON.stringify(o)),

  /* Segments d'un objet (pour les accroches et la distance). */
  segments(o) {
    if (o.type === 'line') return [[o.a, o.b]];
    if (o.type === 'poly') {
      const s = [];
      for (let i = 0; i + 1 < o.pts.length; i++) s.push([o.pts[i], o.pts[i + 1]]);
      if (o.closed && o.pts.length > 2) s.push([o.pts[o.pts.length - 1], o.pts[0]]);
      return s;
    }
    return [];
  },

  /* Géométrie d'une cote alignée : droite de cote décalée de `off` (positif = à gauche de a→b). */
  dimGeom(o) {
    const L = G.dist(o.a, o.b);
    const dir = L > 1e-9 ? [(o.b[0] - o.a[0]) / L, (o.b[1] - o.a[1]) / L] : [1, 0];
    const n = [-dir[1], dir[0]];
    return {
      L, dir, n,
      p1: [o.a[0] + n[0] * o.off, o.a[1] + n[1] * o.off],
      p2: [o.b[0] + n[0] * o.off, o.b[1] + n[1] * o.off],
    };
  },

  textWidth: (o) => o.text.length * o.h * 0.6,

  bbox(o) {
    let pts;
    if (o.type === 'line') pts = [o.a, o.b];
    else if (o.type === 'poly') pts = o.pts;
    else if (o.type === 'circle') pts = [[o.c[0] - o.r, o.c[1] - o.r], [o.c[0] + o.r, o.c[1] + o.r]];
    else if (o.type === 'dim') { const g = Geo.dimGeom(o); pts = [o.a, o.b, g.p1, g.p2]; }
    else if (o.type === 'sym') { const r = o.s * 0.71; pts = [[o.c[0] - r, o.c[1] - r], [o.c[0] + r, o.c[1] + r]]; }
    else pts = [o.p, [o.p[0] + Geo.textWidth(o), o.p[1] + o.h]];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const pad = o.st ? o.st.w / 2 * 3 : 0;   /* demi-largeur, angles vifs coupés à 3 × */
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  },

  /* Distance d'un point à un objet (mm). */
  dist(o, p) {
    switch (o.type) {
      case 'line': case 'poly': {
        let d = Infinity;
        for (const [a, b] of Geo.segments(o)) d = Math.min(d, G.distPtSeg(p, a, b));
        if (o.type === 'poly' && o.pts.length === 1) d = G.dist(p, o.pts[0]);
        return o.st ? Math.max(0, d - o.st.w / 2) : d;
      }
      case 'circle': return Math.abs(G.dist(p, o.c) - o.r);
      case 'sym': return Math.max(0, G.dist(p, o.c) - o.s * 0.5);
      case 'dim': {
        const g = Geo.dimGeom(o);
        return Math.min(G.distPtSeg(p, g.p1, g.p2), G.distPtSeg(p, o.a, g.p1), G.distPtSeg(p, o.b, g.p2));
      }
      case 'text': {
        const [x0, y0, x1, y1] = Geo.bbox(o);
        const dx = Math.max(x0 - p[0], 0, p[0] - x1), dy = Math.max(y0 - p[1], 0, p[1] - y1);
        return Math.hypot(dx, dy);
      }
    }
    return Infinity;
  },

  translate(o, dx, dy) {
    const mv = (p) => { p[0] += dx; p[1] += dy; };
    if (o.type === 'line' || o.type === 'dim') { mv(o.a); mv(o.b); }
    else if (o.type === 'poly') o.pts.forEach(mv);
    else if (o.type === 'circle' || o.type === 'sym') mv(o.c);
    else if (o.type === 'text') mv(o.p);
    return o;
  },

  /* Longueur (ou périmètre) en mm ; null si non applicable. */
  length(o) {
    if (o.type === 'line') return G.dist(o.a, o.b);
    if (o.type === 'poly') return Geo.segments(o).reduce((s, [a, b]) => s + G.dist(a, b), 0);
    if (o.type === 'circle') return 2 * Math.PI * o.r;
    if (o.type === 'dim') return G.dist(o.a, o.b);
    return null;
  },

  /* Surface en m² pour un contour fermé ou un cercle ; null sinon. */
  area(o) {
    if (o.type === 'circle') return Math.PI * o.r * o.r / 1e6;
    if (o.type === 'poly' && o.closed && o.pts.length > 2) {
      let s = 0;
      for (let i = 0; i < o.pts.length; i++) {
        const a = o.pts[i], b = o.pts[(i + 1) % o.pts.length];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s) / 2 / 1e6;
    }
    return null;
  },
};
