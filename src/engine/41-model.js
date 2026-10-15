/* ============ Modèle 3D paramétrique : esquisses sur plans, fonctions (extrusion, révolution), composants d'assemblage ============
   Principe des modeleurs volumiques (SolidWorks, Inventor) : on dessine une ESQUISSE 2D sur un plan (Dessus, Face, Droite, décalé
   d'une cote), puis on lui applique une FONCTION 3D (bossage extrudé, révolution). Les fonctions restent liées à l'esquisse :
   modifier l'esquisse ou la profondeur régénère le volume. L'ASSEMBLAGE place des composants (pièces paramétriques de la
   bibliothèque) avec une position, une rotation et des contraintes simples (fixe, posé sur, axe aligné, décalage).
   Données du projet (toutes facultatives, format schemaVersion 1) :
     objects[].sk  id de l'esquisse qui contient l'objet (absent : plan général)
     sketches[]    {id, name, plane: 'top'|'front'|'right', off (mm)}
     features[]    {id, type: 'extrude'|'revolve', name, sk, d (mm), dir: '+'|'-'|'mid', ang (°), axis (id d'une ligne), mat, layer, hide}
     comps[]       {id, name, part: {t, …paramètres}, pos: [x, y, z] (mm), rot (° autour de Z), mat, layer, fix, mate: {t, ref, d}}
   Repère du plan : x vers l'est, y vers le nord, z vers le haut, en mm. */
const PLANES = {
  top: { label: 'Dessus', U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1], axes: 'X · Y', norm: 'Z' },
  front: { label: 'Face', U: [1, 0, 0], V: [0, 0, 1], W: [0, -1, 0], axes: 'X · Z', norm: '−Y' },
  right: { label: 'Droite', U: [0, 1, 0], V: [0, 0, 1], W: [1, 0, 0], axes: 'Y · Z', norm: 'X' },
};
const FEATURE_TYPES = { extrude: 'Bossage extrudé', revolve: 'Révolution' };
const MATE_TYPES = { '': 'Libre', fix: 'Fixe', sur: 'Posé sur', axe: 'Axe aligné (même centre en plan)', decal: 'Décalage' };

/* Pièces paramétriques de la bibliothèque d'assemblage. p : paramètres (mm). geo(p) → solides locaux ; bb(p) → boîte locale [x0,y0,z0,x1,y1,z1]. */
const PARTS = {
  profil: { label: 'Profilé acier', icon: 'I', fam: 'Charpente métallique',
    def: { prof: 'HEA 200', L: 6000, orient: 'v' }, mat: 'S355',
    fields: [['prof', 'Profilé', 'prof'], ['L', 'Longueur (mm)', 'num', 100, 60000], ['orient', 'Orientation', 'sel', { v: 'Verticale (poteau)', x: 'Horizontale suivant X', y: 'Horizontale suivant Y' }]] },
  platine: { label: 'Platine percée', icon: '▣', fam: 'Assemblages',
    def: { Lx: 300, Ly: 300, e: 20, dt: 22, m: 50 }, mat: 'S235',
    fields: [['Lx', 'Longueur X (mm)', 'num', 20, 3000], ['Ly', 'Longueur Y (mm)', 'num', 20, 3000], ['e', 'Épaisseur (mm)', 'num', 2, 200], ['dt', 'Ø des trous (mm)', 'num', 0, 100], ['m', 'Pince des trous (mm)', 'num', 5, 500]] },
  dalle: { label: 'Dalle / massif', icon: '▭', fam: 'Génie civil',
    def: { Lx: 6000, Ly: 4000, e: 200 }, mat: 'C25',
    fields: [['Lx', 'Longueur X (mm)', 'num', 50, 200000], ['Ly', 'Longueur Y (mm)', 'num', 50, 200000], ['e', 'Épaisseur (mm)', 'num', 20, 5000]] },
  massif: { label: 'Massif de fondation', icon: '▦', fam: 'Génie civil',
    def: { Lx: 1200, Ly: 1200, e: 600 }, mat: 'C25',
    fields: [['Lx', 'Longueur X (mm)', 'num', 100, 20000], ['Ly', 'Longueur Y (mm)', 'num', 100, 20000], ['e', 'Hauteur (mm)', 'num', 100, 5000]] },
  cuve: { label: 'Cuve cylindrique', icon: '◯', fam: 'Fluides',
    def: { D: 2000, H: 3000, e: 8 }, mat: 'inox304',
    fields: [['D', 'Diamètre (mm)', 'num', 100, 30000], ['H', 'Hauteur (mm)', 'num', 100, 40000], ['e', 'Épaisseur de virole (mm)', 'num', 1, 100]] },
  regard: { label: 'Regard béton', icon: '⊡', fam: 'Réseaux humides',
    def: { Lx: 1000, Ly: 1000, H: 1500, e: 150 }, mat: 'C25',
    fields: [['Lx', 'Intérieur X (mm)', 'num', 300, 5000], ['Ly', 'Intérieur Y (mm)', 'num', 300, 5000], ['H', 'Hauteur (mm)', 'num', 300, 10000], ['e', 'Épaisseur des parois (mm)', 'num', 50, 500]] },
  pompe: { label: 'Groupe motopompe', icon: '⊕', fam: 'Fluides',
    def: { L: 1200, l: 500, H: 700 }, mat: 'fonteGS',
    fields: [['L', 'Longueur (mm)', 'num', 200, 10000], ['l', 'Largeur (mm)', 'num', 100, 5000], ['H', 'Hauteur (mm)', 'num', 100, 5000]] },
  gardecorps: { label: 'Garde-corps', icon: '⊓', fam: 'Serrurerie',
    def: { L: 3000, H: 1100, ent: 1000, D: 42.4 }, mat: 'acierGalva',
    fields: [['L', 'Longueur (mm)', 'num', 300, 30000], ['H', 'Hauteur (mm)', 'num', 500, 2000], ['ent', 'Entraxe des montants (mm)', 'num', 300, 3000], ['D', 'Ø des tubes (mm)', 'num', 20, 100]] },
};

const Model = (() => {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const area2 = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
  const circle = (c, r, n = 48) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos(i * 2 * Math.PI / n), c[1] + r * Math.sin(i * 2 * Math.PI / n)]);

  /* ---------- validation (appelée par Doc.sanitize) ---------- */
  function clean(raw, objects, layerIds, firstLayer) {
    const sketches = [], features = [], comps = [];
    const seenS = new Set();
    for (const s of Array.isArray(raw.sketches) ? raw.sketches.slice(0, 500) : []) {
      if (!s || !Number.isInteger(s.id) || s.id <= 0 || seenS.has(s.id) || !PLANES[s.plane]) continue;
      seenS.add(s.id);
      sketches.push({ id: s.id, name: str(s.name, 60) || `Esquisse ${s.id}`, plane: s.plane, off: num(s.off) && Math.abs(s.off) < 1e7 ? s.off : 0 });
    }
    for (const o of objects) if (o.sk !== undefined && !seenS.has(o.sk)) delete o.sk;
    const objIds = new Set(objects.map((o) => o.id));
    const seenF = new Set();
    for (const f of Array.isArray(raw.features) ? raw.features.slice(0, 2000) : []) {
      if (!f || !Number.isInteger(f.id) || f.id <= 0 || seenF.has(f.id) || !FEATURE_TYPES[f.type] || !seenS.has(f.sk)) continue;
      seenF.add(f.id);
      const out = { id: f.id, type: f.type, name: str(f.name, 60) || `${FEATURE_TYPES[f.type]} ${f.id}`, sk: f.sk,
        d: num(f.d) && f.d > 0 && f.d <= 1e6 ? f.d : 1000, dir: ['+', '-', 'mid'].includes(f.dir) ? f.dir : '+',
        mat: cleanMatId(f.mat), layer: layerIds.has(f.layer) ? f.layer : firstLayer, hide: f.hide === true };
      if (f.type === 'revolve') { out.ang = num(f.ang) && f.ang > 0 && f.ang <= 360 ? f.ang : 360; out.axis = Number.isInteger(f.axis) && objIds.has(f.axis) ? f.axis : 0; }
      features.push(out);
    }
    const seenC = new Set();
    for (const c of Array.isArray(raw.comps) ? raw.comps.slice(0, 5000) : []) {
      if (!c || !Number.isInteger(c.id) || c.id <= 0 || seenC.has(c.id) || !c.part || !PARTS[c.part.t]) continue;
      seenC.add(c.id);
      const part = cleanPart(c.part);
      const pos = Array.isArray(c.pos) && c.pos.length === 3 && c.pos.every((v) => num(v) && Math.abs(v) < 1e8) ? c.pos.slice() : [0, 0, 0];
      const m = c.mate && typeof c.mate === 'object' && MATE_TYPES[c.mate.t] !== undefined ? c.mate : { t: '' };
      comps.push({ id: c.id, name: str(c.name, 60) || `${PARTS[part.t].label} ${c.id}`, part, pos, rot: num(c.rot) ? ((c.rot % 360) + 360) % 360 : 0,
        mat: cleanMatId(c.mat) || PARTS[part.t].mat, layer: layerIds.has(c.layer) ? c.layer : firstLayer, fix: c.fix === true,
        mate: { t: m.t || '', ref: Number.isInteger(m.ref) ? m.ref : 0, d: Array.isArray(m.d) && m.d.length === 3 && m.d.every(num) ? m.d.slice() : [0, 0, 0] } });
    }
    for (const c of comps) if (c.mate.t && c.mate.t !== 'fix' && !seenC.has(c.mate.ref)) c.mate = { t: '', ref: 0, d: [0, 0, 0] };
    const site = raw.site && num(raw.site.lat) && num(raw.site.lon) && Math.abs(raw.site.lat) <= 90 && Math.abs(raw.site.lon) <= 180
      ? { label: str(raw.site.label, 160), lat: raw.site.lat, lon: raw.site.lon, size: [500, 1000, 1600].includes(raw.site.size) ? raw.site.size : 500 } : null;
    return { sketches, features, comps, site };
  }
  function cleanPart(p) {
    const P = PARTS[p.t], out = { t: p.t };
    for (const [k, , kind, mn, mx] of P.fields) {
      const v = p[k], d = P.def[k];
      if (kind === 'num') out[k] = num(v) && v >= mn && v <= mx ? v : d;
      else if (kind === 'prof') out[k] = typeof v === 'string' && PROFILES[v] ? v : d;
      else out[k] = typeof v === 'string' && Object.prototype.hasOwnProperty.call(P.fields.find((f) => f[0] === k)[3], v) ? v : d;
    }
    return out;
  }

  /* ---------- esquisses ---------- */
  const sketch = (id) => (Doc.get().sketches || []).find((s) => s.id === id) || null;
  const planeOf = (o) => { if (!o.sk) return 'top'; const s = sketch(o.sk); return s ? s.plane : 'top'; };
  /* Visibilité dans la vue 2D : esquisse active → ses objets seulement (et le plan général en grisé si l'esquisse est en Dessus) ;
     sans esquisse active → plan général et esquisses du plan Dessus. */
  function visible2D(o) {
    const cur = state.sketch;
    if (cur) { if (o.sk === cur) return true; const s = sketch(cur); return !!s && s.plane === 'top' && planeOf(o) === 'top'; }
    return planeOf(o) === 'top';
  }
  const faded2D = (o) => !!state.sketch && o.sk !== state.sketch;
  /* Repère d'une esquisse : point (u, v) → (x, y, z) */
  function frame(s) {
    const P = PLANES[s.plane], t = mul3(P.W, s.off);
    return { U: P.U, V: P.V, W: P.W, t, to3: (u, v, w = 0) => add3(add3(add3(t, mul3(P.U, u)), mul3(P.V, v)), mul3(P.W, w)) };
  }
  /* Contours fermés d'une esquisse (polylignes fermées, cercles) en (u, v), regroupés en contour extérieur + trous. */
  function loops(skId, exclude = 0) {
    const out = [];
    for (const o of Doc.get().objects) {
      if (o.sk !== skId || o.id === exclude) continue;
      if (o.type === 'poly' && o.closed && o.pts.length >= 3) out.push({ id: o.id, pts: o.pts.map((p) => [p[0], p[1]]) });
      else if (o.type === 'circle') out.push({ id: o.id, pts: circle(o.c, o.r) });
    }
    for (const l of out) { l.a = Math.abs(area2(l.pts)); if (area2(l.pts) < 0) l.pts.reverse(); }
    out.sort((a, b) => b.a - a.a);
    const regions = [];
    for (const l of out) {
      const host = regions.find((r) => inPoly(l.pts[0][0], l.pts[0][1], r.outer) && !r.holes.some((h) => inPoly(l.pts[0][0], l.pts[0][1], h)));
      if (host) host.holes.push(l.pts.slice().reverse()); else regions.push({ outer: l.pts, holes: [], ids: [l.id] });
    }
    return regions;
  }
  const regionArea = (r) => Math.abs(area2(r.outer)) - r.holes.reduce((s, h) => s + Math.abs(area2(h)), 0);
  /* Centre de gravité d'une région (contour moins trous), pour la règle de Guldin / Pappus. */
  function regionCentroid(r) {
    const mom = (P) => { let A = 0, cx = 0, cy = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], k = p[0] * q[1] - q[0] * p[1]; A += k / 2; cx += (p[0] + q[0]) * k / 6; cy += (p[1] + q[1]) * k / 6; } return A < 0 ? [-A, -cx, -cy] : [A, cx, cy]; };
    let [A, cx, cy] = mom(r.outer);
    for (const h of r.holes) { const [a, x, y] = mom(h); A -= a; cx -= x; cy -= y; }
    return A > 0 ? [cx / A, cy / A] : r.outer[0];
  }

  /* ---------- fonctions 3D → solides ---------- */
  function featureSolids(f, col) {
    const s = sketch(f.sk); if (!s || f.hide) return [];
    const F = frame(s), out = [];
    if (f.type === 'extrude' || f.type === 'cut') {
      const w0 = f.dir === '+' ? 0 : f.dir === '-' ? -f.d : -f.d / 2, w1 = w0 + f.d;
      for (const r of loops(f.sk)) out.push({ k: 'ext', outer: r.outer, holes: r.holes, w0, w1, M: [...F.U, ...F.V, ...F.W, ...F.t], col, cut: f.type === 'cut', fid: f.id });
    } else if (f.type === 'revolve') {
      const ax = Doc.get().objects.find((o) => o.id === f.axis && o.sk === f.sk && o.type === 'line');
      if (!ax) return [];
      const A2 = [ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]], L = Math.hypot(A2[0], A2[1]); if (L < 1e-9) return [];
      const a = [A2[0] / L, A2[1] / L];
      for (const r of loops(f.sk, ax.id)) {
        const side = Math.sign(a[0] * (r.outer[0][1] - ax.a[1]) - a[1] * (r.outer[0][0] - ax.a[0])) || 1;
        const R2 = [-a[1] * side, a[0] * side];
        const prof = r.outer.map((p) => { const d = [p[0] - ax.a[0], p[1] - ax.a[1]]; return [Math.max(0, d[0] * R2[0] + d[1] * R2[1]), d[0] * a[0] + d[1] * a[1]]; });
        const O = F.to3(ax.a[0], ax.a[1]), A3 = add3(mul3(F.U, a[0]), mul3(F.V, a[1])), R3 = add3(mul3(F.U, R2[0]), mul3(F.V, R2[1]));
        out.push({ k: 'rev', prof, ang: f.ang * Math.PI / 180, X: cross(A3, R3), Y: A3, Z: R3, O, col, fid: f.id });
      }
    }
    return out;
  }
  /* Volume (mm³) d'une fonction : extrusion = aire × profondeur ; révolution = règle de Guldin (θ · aire · distance du centre de gravité à l'axe). */
  function featureVolume(f) {
    const s = sketch(f.sk); if (!s) return 0;
    if (f.type === 'extrude' || f.type === 'cut') return loops(f.sk).reduce((v, r) => v + regionArea(r), 0) * f.d;
    const ax = Doc.get().objects.find((o) => o.id === f.axis && o.type === 'line'); if (!ax) return 0;
    const A2 = [ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]], L = Math.hypot(A2[0], A2[1]); if (L < 1e-9) return 0;
    let V = 0;
    for (const r of loops(f.sk, ax.id)) { const c = regionCentroid(r), dist = Math.abs(A2[0] * (c[1] - ax.a[1]) - A2[1] * (c[0] - ax.a[0])) / L; V += f.ang * Math.PI / 180 * regionArea(r) * dist; }
    return V;
  }

  /* ---------- pièces de la bibliothèque : solides locaux, boîte, volume ---------- */
  const TOP = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const rectP = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  function partGeo(p) {
    const out = [];
    switch (p.t) {
      case 'profil': {
        const ol = Sections.outline({ kind: 'prof', id: p.prof }); if (!ol) break;
        if (p.orient === 'v') out.push({ k: 'ext', outer: ol.outer, holes: ol.holes, w0: 0, w1: p.L, M: TOP });
        else if (p.orient === 'x') out.push({ k: 'ext', outer: ol.outer.map(([u, v]) => [u, v]), holes: [], w0: 0, w1: p.L, M: [0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0] });
        else out.push({ k: 'ext', outer: ol.outer, holes: [], w0: 0, w1: p.L, M: [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0] });
        break;
      }
      case 'platine': {
        const holes = p.dt > 0 ? [[p.m, p.m], [p.Lx - p.m, p.m], [p.Lx - p.m, p.Ly - p.m], [p.m, p.Ly - p.m]].map((c) => circle([c[0] - p.Lx / 2, c[1] - p.Ly / 2], p.dt / 2, 24).reverse()) : [];
        out.push({ k: 'ext', outer: rectP(-p.Lx / 2, -p.Ly / 2, p.Lx / 2, p.Ly / 2), holes, w0: 0, w1: p.e, M: TOP });
        break;
      }
      case 'dalle': case 'massif': out.push({ k: 'ext', outer: rectP(-p.Lx / 2, -p.Ly / 2, p.Lx / 2, p.Ly / 2), holes: [], w0: 0, w1: p.e, M: TOP }); break;
      case 'cuve': out.push({ k: 'cyl', c: [0, 0], r: p.D / 2, z0: 0, z1: p.H }); break;
      case 'regard': {
        const X = p.Lx / 2 + p.e, Y = p.Ly / 2 + p.e;
        out.push({ k: 'ext', outer: rectP(-X, -Y, X, Y), holes: [], w0: 0, w1: p.e, M: TOP });
        out.push({ k: 'ext', outer: rectP(-X, -Y, X, Y), holes: [rectP(-p.Lx / 2, -p.Ly / 2, p.Lx / 2, p.Ly / 2).reverse()], w0: p.e, w1: p.H, M: TOP });
        break;
      }
      case 'pompe': {
        out.push({ k: 'ext', outer: rectP(-p.L / 2, -p.l / 2, p.L / 2, p.l / 2), holes: [], w0: 0, w1: p.H * 0.12, M: TOP });
        const r = Math.min(p.l, p.H) * 0.38;
        out.push({ k: 'ext', outer: circle([0, p.H * 0.12 + r], r, 32), holes: [], w0: -p.L * 0.45, w1: p.L * 0.05, M: [0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0] });
        out.push({ k: 'cyl', c: [p.L * 0.27, 0], r: r * 1.1, z0: p.H * 0.12, z1: p.H });
        break;
      }
      case 'gardecorps': {
        const n = Math.max(2, Math.ceil(p.L / p.ent) + 1), r = p.D / 2;
        for (let i = 0; i < n; i++) out.push({ k: 'cyl', c: [i * p.L / (n - 1), 0], r, z0: 0, z1: p.H });
        for (const z of [p.H, p.H / 2]) out.push({ k: 'ext', outer: circle([0, z], r, 16), holes: [], w0: 0, w1: p.L, M: [0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0] });
        break;
      }
    }
    return out;
  }
  /* Boîte englobante locale d'une pièce [x0, y0, z0, x1, y1, z1] */
  function partBox(p) {
    switch (p.t) {
      case 'profil': { const pr = PROFILES[p.prof] || { h: 200, b: 200 }; if (p.orient === 'v') return [-pr.b / 2, -pr.h / 2, 0, pr.b / 2, pr.h / 2, p.L];
        if (p.orient === 'x') return [0, -pr.b / 2, -pr.h / 2, p.L, pr.b / 2, pr.h / 2]; return [-pr.b / 2, 0, -pr.h / 2, pr.b / 2, p.L, pr.h / 2]; }
      case 'platine': return [-p.Lx / 2, -p.Ly / 2, 0, p.Lx / 2, p.Ly / 2, p.e];
      case 'dalle': case 'massif': return [-p.Lx / 2, -p.Ly / 2, 0, p.Lx / 2, p.Ly / 2, p.e];
      case 'cuve': return [-p.D / 2, -p.D / 2, 0, p.D / 2, p.D / 2, p.H];
      case 'regard': return [-p.Lx / 2 - p.e, -p.Ly / 2 - p.e, 0, p.Lx / 2 + p.e, p.Ly / 2 + p.e, p.H];
      case 'pompe': return [-p.L / 2, -p.l / 2, 0, p.L / 2, p.l / 2, p.H];
      case 'gardecorps': return [-p.D / 2, -p.D / 2, 0, p.L + p.D / 2, p.D / 2, p.H + p.D / 2];
    }
    return [0, 0, 0, 0, 0, 0];
  }
  /* Volume de matière (mm³) d'une pièce */
  function partVolume(p) {
    switch (p.t) {
      case 'profil': { const pr = PROFILES[p.prof]; return pr ? pr.A * 100 * p.L : 0; }
      case 'platine': return p.Lx * p.Ly * p.e - 4 * Math.PI * (p.dt / 2) ** 2 * p.e * (p.dt > 0 ? 1 : 0);
      case 'dalle': case 'massif': return p.Lx * p.Ly * p.e;
      case 'cuve': { const r = p.D / 2, ri = r - p.e; return Math.PI * (r * r - ri * ri) * p.H + 2 * Math.PI * r * r * p.e; }
      case 'regard': { const X = p.Lx + 2 * p.e, Y = p.Ly + 2 * p.e; return X * Y * p.e + (X * Y - p.Lx * p.Ly) * (p.H - p.e); }
      case 'pompe': return null;
      case 'gardecorps': { const n = Math.max(2, Math.ceil(p.L / p.ent) + 1), t = Math.min(3.2, p.D / 10), A = Math.PI / 4 * (p.D ** 2 - (p.D - 2 * t) ** 2); return A * (n * p.H + 2 * p.L); }
    }
    return 0;
  }

  /* ---------- assemblage : contraintes, placement ---------- */
  /* Position résolue de chaque composant (les contraintes sont appliquées dans l'ordre des dépendances ; un cycle est ignoré et signalé). */
  function resolve(comps) {
    const byId = new Map(comps.map((c) => [c.id, c])), out = new Map(), warn = [];
    const visit = (c, stack) => {
      if (out.has(c.id)) return out.get(c.id);
      if (stack.has(c.id)) { warn.push(c.id); return c.pos; }
      stack.add(c.id);
      let pos = c.pos.slice();
      const m = c.mate, ref = m && m.t && m.t !== 'fix' ? byId.get(m.ref) : null;
      if (ref && !c.fix) {
        const rp = visit(ref, stack), rb = worldBox(ref, rp), mb = partBox(c.part);
        if (m.t === 'sur') pos = [pos[0], pos[1], rb[5] - mb[2] + (m.d[2] || 0)];
        else if (m.t === 'axe') pos = [(rb[0] + rb[3]) / 2 - (mb[0] + mb[3]) / 2 + (m.d[0] || 0), (rb[1] + rb[4]) / 2 - (mb[1] + mb[4]) / 2 + (m.d[1] || 0), pos[2]];
        else if (m.t === 'decal') pos = add3(rp, m.d);
      }
      stack.delete(c.id);
      out.set(c.id, pos);
      return pos;
    };
    for (const c of comps) visit(c, new Set());
    return { pos: out, warn };
  }
  /* Boîte englobante dans le plan (rotation autour de Z incluse) */
  function worldBox(c, pos) {
    const b = partBox(c.part), th = c.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of [[b[0], b[1]], [b[3], b[1]], [b[3], b[4]], [b[0], b[4]]]) { const X = pos[0] + x * cs - y * sn, Y = pos[1] + x * sn + y * cs; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    return [x0, y0, pos[2] + b[2], x1, y1, pos[2] + b[5]];
  }
  /* Empreinte au sol (pour le plan 2D) : rectangle de la boîte locale tourné */
  function footprint(c, pos) {
    const b = partBox(c.part), th = c.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    return [[b[0], b[1]], [b[3], b[1]], [b[3], b[4]], [b[0], b[4]]].map(([x, y]) => [pos[0] + x * cs - y * sn, pos[1] + x * sn + y * cs]);
  }
  /* Solides d'un composant, avec sa transformation (position résolue + rotation) */
  function compSolids(c, pos, col) {
    return partGeo(c.part).map((s) => ({ ...s, col, tf: { pos, rot: c.rot }, cid: c.id }));
  }

  return { clean, cleanPart, sketch, planeOf, visible2D, faded2D, frame, loops, regionArea, regionCentroid, featureSolids, featureVolume,
    partGeo, partBox, partVolume, resolve, worldBox, footprint, compSolids, area2 };
})();
