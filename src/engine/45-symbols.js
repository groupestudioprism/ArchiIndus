/* Équipements, poteaux (objets « sym ») et structures linéaires murs / poutres (attribut « st » des lignes et polylignes).
   Tout est dessiné avec des éléments vectoriels simples (lignes, polylignes, cercles, textes) : Sym.expand(o) convertit un objet en ces
   éléments, utilisés tels quels par le rendu, l'export SVG, DXF et PDF. Les symboles sont des schémas de principe (vue en plan) : ils ne
   remplacent pas un symbole normalisé du bureau d'études.
   Primitives d'un symbole, dans un carré de côté 1 centré sur l'origine, axe Y vers le haut :
     ['L', x1, y1, x2, y2] · ['C', cx, cy, r] · ['P', [x, y, x, y, …], fermé] */
const SYM_MIN = 10, SYM_MAX = 5000;
const SQ = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
const SYMBOLS = {
  pompe:      { label: 'Pompe', group: 'equip', size: 400, tag: 'P', prims: [['C', 0, 0, 0.5], ['P', [-0.25, -0.3, 0.35, 0, -0.25, 0.3], true]] },
  vanne:      { label: 'Vanne', group: 'equip', size: 300, tag: 'V', prims: [['P', [-0.5, -0.3, 0.5, 0.3, 0.5, -0.3, -0.5, 0.3], true], ['L', 0, 0, 0, 0.5], ['L', -0.15, 0.5, 0.15, 0.5]] },
  clapet:     { label: 'Clapet anti-retour', group: 'equip', size: 300, tag: 'CL', prims: [['P', [-0.35, -0.35, 0.35, 0, -0.35, 0.35], true], ['L', 0.42, -0.35, 0.42, 0.35], ['L', -0.5, 0, -0.35, 0], ['L', 0.35, 0, 0.5, 0]] },
  regard:     { label: 'Regard / avaloir', group: 'equip', size: 800, tag: 'R', prims: [['P', SQ, true], ['L', -0.5, -0.5, 0.5, 0.5], ['L', -0.5, 0.5, 0.5, -0.5]] },
  cuve:       { label: 'Cuve / réservoir', group: 'equip', size: 2000, tag: 'B', prims: [['C', 0, 0, 0.5], ['C', 0, 0, 0.38]] },
  compteur:   { label: 'Compteur', group: 'equip', size: 300, tag: 'CPT', prims: [['P', SQ, true], ['C', 0, 0, 0.3]] },
  coffret:    { label: 'Coffret électrique', group: 'equip', size: 600, tag: 'CE', prims: [['P', [-0.5, -0.35, 0.5, -0.35, 0.5, 0.35, -0.5, 0.35], true], ['L', -0.5, -0.35, 0.5, 0.35]] },
  moteur:     { label: 'Moteur', group: 'equip', size: 500, tag: 'M', prims: [['C', 0, 0, 0.5], ['P', [-0.28, -0.2, -0.28, 0.2, 0, -0.05, 0.28, 0.2, 0.28, -0.2], false]] },
  ventilo:    { label: 'Ventilateur', group: 'equip', size: 500, tag: 'VT', prims: [['C', 0, 0, 0.5], ['L', -0.35, -0.35, 0.35, 0.35], ['L', -0.35, 0.35, 0.35, -0.35]] },
  echangeur:  { label: 'Échangeur', group: 'equip', size: 800, tag: 'EC', prims: [['P', [-0.5, -0.35, 0.5, -0.35, 0.5, 0.35, -0.5, 0.35], true], ['P', [-0.4, 0, -0.2, 0.25, 0, -0.25, 0.2, 0.25, 0.4, 0], false]] },
  filtre:     { label: 'Filtre', group: 'equip', size: 300, tag: 'F', prims: [['L', -0.5, 0, 0.5, 0], ['P', [-0.3, -0.3, 0.3, -0.3, 0, 0.3], true], ['L', -0.15, -0.12, 0.15, -0.12]] },
  ballon:     { label: 'Ballon / bouteille', group: 'equip', size: 1000, tag: 'BA', prims: [['P', [-0.3, -0.5, 0.3, -0.5, 0.3, 0.5, -0.3, 0.5], true], ['L', -0.3, 0.25, 0.3, 0.25], ['L', -0.3, -0.25, 0.3, -0.25]] },
  hydrant:    { label: 'Poteau incendie', group: 'equip', size: 500, tag: 'PI', prims: [['C', 0, 0, 0.5], ['L', 0, -0.5, 0, 0.5], ['L', -0.5, 0, 0.5, 0], ['C', 0, 0, 0.15]] },
  chambre:    { label: 'Chambre de tirage', group: 'sec', size: 800, tag: 'CT', prims: [['P', SQ, true], ['L', -0.5, 0, 0.5, 0], ['L', 0, -0.5, 0, 0.5]] },
  chambreRac: { label: 'Chambre de raccordement', group: 'sec', size: 1000, tag: 'CR', prims: [['P', SQ, true], ['P', [-0.35, -0.35, 0.35, -0.35, 0.35, 0.35, -0.35, 0.35], true], ['C', 0, 0, 0.12]] },
  candelabre: { label: 'Candélabre', group: 'sec', size: 400, tag: 'EP', prims: [['C', 0, 0, 0.2], ['L', -0.5, 0, -0.2, 0], ['L', 0.2, 0, 0.5, 0], ['L', 0, -0.5, 0, -0.2], ['L', 0, 0.2, 0, 0.5]] },
  armoire:    { label: 'Armoire / borne', group: 'sec', size: 600, tag: 'AR', prims: [['P', [-0.5, -0.3, 0.5, -0.3, 0.5, 0.3, -0.5, 0.3], true], ['P', [-0.2, -0.1, 0.2, -0.1, 0.2, 0.1, -0.2, 0.1], true]] },
  poteau:     { label: 'Poteau carré', group: 'struct', size: 300, tag: 'PO', prims: [['P', SQ, true], ['L', -0.5, -0.5, 0.5, 0.5], ['L', -0.5, 0.5, 0.5, -0.5]] },
  poteauRond: { label: 'Poteau rond', group: 'struct', size: 300, tag: 'PO', prims: [['C', 0, 0, 0.5], ['L', -0.5, 0, 0.5, 0], ['L', 0, -0.5, 0, 0.5]] },
  semelle:    { label: 'Semelle', group: 'struct', size: 1200, tag: 'S', prims: [['P', SQ, true], ['P', [-0.3, -0.3, 0.3, -0.3, 0.3, 0.3, -0.3, 0.3], true]] },
};
const SYM_GROUPS = { equip: 'Équipements et fluides', sec: 'Réseaux secs', struct: 'Structure' };

/* Structures linéaires : attribut `st` {kind, w (mm), prof, tag}. mur : w = épaisseur, prof = matériau ; poutre : w = largeur, prof = profilé. */
const ST_KINDS = { mur: { label: 'Mur', wDef: 200, wLabel: 'Épaisseur (mm)', pLabel: 'Matériau', ex: ['Béton', 'Parpaing', 'Brique', 'Béton armé', 'Acier'] }, poutre: { label: 'Poutre', wDef: 150, wLabel: 'Largeur (mm)', pLabel: 'Profilé', ex: ['IPE 160', 'IPE 200', 'IPE 240', 'IPE 300', 'HEA 160', 'HEA 200', 'HEB 200', 'UPN 160', 'Béton 20x40'] } };
const ST_W_MAX = 5000;
function cleanSym(o) {
  const def = SYMBOLS[o.k];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!def || !num(o.s) || o.s < SYM_MIN || o.s > SYM_MAX || !num(o.rot)) return null;
  const s = (v) => (typeof v === 'string' ? v.trim().slice(0, 30) : '');
  return { k: o.k, s: Math.round(o.s * 10) / 10, rot: ((Math.round(o.rot * 10) / 10) % 360 + 360) % 360, tag: s(o.tag) };
}
function cleanSt(n) {
  if (!n || typeof n !== 'object' || !ST_KINDS[n.kind]) return null;
  const w = Number(n.w);
  if (!Number.isFinite(w) || w <= 0 || w > ST_W_MAX) return null;
  const s = (v) => (typeof v === 'string' ? v.trim().slice(0, 30) : '');
  return { kind: n.kind, w: Math.round(w * 10) / 10, prof: s(n.prof), tag: s(n.tag) };
}

const Sym = (() => {
  /* Primitives d'un symbole transformées en repère monde (taille s, rotation rot en degrés). */
  function world(o) {
    const def = SYMBOLS[o.k], th = o.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    const T = (x, y) => [o.c[0] + (x * cs - y * sn) * o.s, o.c[1] + (x * sn + y * cs) * o.s];
    const out = [];
    for (const p of def.prims) {
      if (p[0] === 'L') out.push({ type: 'line', a: T(p[1], p[2]), b: T(p[3], p[4]) });
      else if (p[0] === 'C') out.push({ type: 'circle', c: T(p[1], p[2]), r: p[3] * o.s });
      else { const pts = []; for (let i = 0; i < p[1].length; i += 2) pts.push(T(p[1][i], p[1][i + 1])); out.push({ type: 'poly', pts, closed: p[2] }); }
    }
    return out;
  }

  /* Contour d'une polyligne épaissie de w (mm) : angles vifs coupés au-delà de 3 × la demi-largeur. Ouverte : un polygone ; fermée : deux anneaux. */
  function band(pts0, closed, w) {
    const pts = [];
    for (const p of pts0) if (!pts.length || G.dist(pts[pts.length - 1], p) > 1e-6) pts.push(p);
    if (closed && pts.length > 1 && G.dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    const n = pts.length, h = w / 2;
    if (n < 2) return [];
    const normal = (a, b) => { const L = G.dist(a, b) || 1; return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; };
    const side = (sgn) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const prev = i > 0 || closed ? pts[(i - 1 + n) % n] : null, next = i < n - 1 || closed ? pts[(i + 1) % n] : null;
        const n1 = prev ? normal(prev, pts[i]) : null, n2 = next ? normal(pts[i], next) : null;
        let nv;
        if (!n1) nv = n2; else if (!n2) nv = n1; else nv = [n1[0] + n2[0], n1[1] + n2[1]];
        let m = Math.hypot(nv[0], nv[1]);
        if (m < 1e-9) { nv = n1 || n2; m = 1; }                      /* demi-tour : on garde la normale du tronçon */
        const u = [nv[0] / m, nv[1] / m];
        const dot = n1 && n2 ? u[0] * n1[0] + u[1] * n1[1] : 1;
        const len = Math.min(h / Math.max(dot, 1e-6), 3 * h);
        out.push([pts[i][0] + sgn * u[0] * len, pts[i][1] + sgn * u[1] * len]);
      }
      return out;
    };
    const L = side(1), R = side(-1);
    return closed ? [{ pts: L, closed: true }, { pts: R, closed: true }] : [{ pts: L.concat(R.reverse()), closed: true }];
  }

  const stLabel = (st) => (st.tag ? st.tag + ' · ' : '') + ST_KINDS[st.kind].label + (st.prof ? ' ' + (st.kind === 'mur' ? 'e' + st.w + ' ' + st.prof : st.prof) : (st.kind === 'mur' ? ' e' + st.w : ''));

  /* Texte posé le long du plus long tronçon, centré, lisible (jamais à l'envers). */
  function alongText(pts, closed, str, h, off) {
    let best = null, bl = 0;
    for (const [a, b] of Geo.segments({ type: 'poly', pts, closed })) { const l = G.dist(a, b); if (l > bl) { bl = l; best = [a, b]; } }
    if (!best) return null;
    let deg = Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) * 180 / Math.PI;
    if (deg > 90 || deg < -90) deg += 180;
    const th = deg * Math.PI / 180, u = [Math.cos(th), Math.sin(th)], up = [-Math.sin(th), Math.cos(th)], m = G.mid(best[0], best[1]);
    const wd = str.length * h * 0.6;
    return { type: 'text', p: [m[0] - u[0] * wd / 2 + up[0] * off, m[1] - u[1] * wd / 2 + up[1] * off], text: str, h, deg: +deg.toFixed(3) };
  }

  /* Éléments de dessin d'un objet « sym » ou d'une ligne / polyligne « st » (sinon : l'objet lui-même). */
  function expand(o) {
    if (o.type === 'sym') {
      const out = world(o);
      if (o.tag) {
        const h = Math.max(o.s * 0.22, 80), wd = o.tag.length * h * 0.6;
        out.push({ type: 'text', p: [o.c[0] - wd / 2, o.c[1] - o.s * 0.5 - h * 1.4], text: o.tag, h });
      }
      return out;
    }
    if (o.st && (o.type === 'line' || o.type === 'poly')) {
      const pts = o.type === 'line' ? [o.a, o.b] : o.pts, closed = o.type === 'poly' && o.closed;
      const out = band(pts, closed, o.st.w).map((b) => ({ type: 'poly', pts: b.pts, closed: true, band: true }));
      if (o.st.kind === 'poutre') out.push(o.type === 'line' ? { type: 'line', a: o.a, b: o.b } : { type: 'poly', pts: o.pts, closed });
      const lab = alongText(pts, closed, stLabel(o.st), 120, o.st.w / 2 + 40);
      if (lab) out.push(lab);
      return out;
    }
    return [o];
  }

  const isComposite = (o) => o.type === 'sym' || !!(o.st && (o.type === 'line' || o.type === 'poly'));
  return { expand, band, world, stLabel, isComposite };
})();
