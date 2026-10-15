/* ============ Compositions et calculs : parois (thermique, inertie, acoustique, hygrométrie, carbone) et mécanique ============
   Parois : mêmes méthodes qu'ARCHIPLAN (src/engine/12-physics.js), simplifiées et indicatives (pré-dimensionnement) :
   - Résistance et coefficient U : EN ISO 6946 (sans ponts thermiques ni fixations).
   - Inertie : EN ISO 13786 (matrices de transfert, période 24 h) → déphasage, amortissement.
   - Acoustique : loi de masse expérimentale et système masse-ressort-masse.
   - Hygrométrie : méthode de Glaser (régime permanent, hiver).
   - Carbone : production (A1-A3) à partir des valeurs génériques de la bibliothèque.
   Mécanique (formules de la résistance des matériaux, élasticité linéaire, petites déformations) :
   - Flèche, moment et effort tranchant de poutres isostatiques ou bi-encastrées sous charge répartie et charge ponctuelle.
   - Flambement : charge critique d'Euler Ncr = π²EI/Lcr² et élancement réduit λ̄ (EN 1993-1-1 § 6.3.1.3).
   - Dilatation thermique : ΔL = α·L·ΔT.
   Ces résultats ne tiennent compte ni des coefficients partiels, ni du déversement, ni des assemblages : ils ne remplacent
   pas une note de calcul aux Eurocodes. */
const RS = {
  mur: { si: 0.13, se: 0.04, label: 'Mur (flux horizontal)' },
  toiture: { si: 0.10, se: 0.04, label: 'Toiture (flux ascendant)' },
  plancherBas: { si: 0.17, se: 0.04, label: 'Plancher bas (flux descendant)' },
  terrePlein: { si: 0.17, se: 0.00, label: 'Dallage sur terre-plein (approché)' },
};
/* Compositions types d'ARCHIINDUS (bâtiments d'activité, ouvrages). Murs : extérieur → intérieur ; planchers et toitures : haut → bas. */
const COMPOS = {
  'BARD-SP': { nom: 'Bardage simple peau acier (75/100)', kind: 'wall', layers: [['bardageAcier', 0.00075]] },
  'BARD-DP': { nom: 'Bardage double peau acier + laine de roche 120', kind: 'wall', layers: [['bardageAcier', 0.00075], ['airFV', 0.02], ['laineRocheD', 0.12], ['bardageAcier', 0.00075]] },
  'SANDW-PIR80': { nom: 'Panneau sandwich PIR 80 (parements acier)', kind: 'wall', layers: [['bardageAcier', 0.0005], ['PIR', 0.08], ['bardageAcier', 0.0004]] },
  'SANDW-LR100': { nom: 'Panneau sandwich laine de roche 100 (coupe-feu)', kind: 'wall', layers: [['bardageAcier', 0.0006], ['laineRocheD', 0.10], ['bardageAcier', 0.0005]] },
  'VOILE-BA20': { nom: 'Voile béton armé 20', kind: 'wall', layers: [['C25', 0.20]] },
  'VOILE-BA20-ITE': { nom: 'Voile BA 20 + ITE laine de roche 140 sous bardage', kind: 'wall', layers: [['bardageAcier', 0.00075], ['airFV', 0.03], ['laineRocheD', 0.14], ['C25', 0.20]] },
  'MUR-PARP20': { nom: 'Parpaing 20 enduit deux faces', kind: 'wall', layers: [['enduit', 0.015], ['parpaing', 0.20], ['enduit', 0.015]] },
  'MUR-PARP20-DOUB': { nom: 'Parpaing 20 + doublage laine 100 + BA13 (locaux sociaux)', kind: 'wall', layers: [['enduit', 0.015], ['parpaing', 0.20], ['laineVerre', 0.10], ['ba13', 0.013]] },
  'DAL-IND': { nom: 'Dallage industriel BA 20 + résine, sur hérisson', kind: 'slab', ctx: 'terrePlein', layers: [['resine', 0.003], ['C30', 0.20], ['paraVapeur', 0.0002], ['gravier', 0.20]] },
  'DAL-IND-ISO': { nom: 'Dallage industriel isolé : BA 18 + XPS 80', kind: 'slab', ctx: 'terrePlein', layers: [['resine', 0.003], ['C30', 0.18], ['XPS', 0.08], ['gravier', 0.20]] },
  'DALLE-BA20': { nom: 'Plancher dalle BA 20 + chape', kind: 'slab', ctx: 'plancherBas', layers: [['chape', 0.05], ['C25', 0.20]] },
  'TOIT-BAC-PIR': { nom: 'Toiture bac acier + PIR 120 + étanchéité', kind: 'roof', ctx: 'toiture', layers: [['bitume', 0.006], ['PIR', 0.12], ['paraVapeur', 0.0002], ['bacAcier', 0.00075]] },
  'TOIT-SANDW': { nom: 'Toiture panneau sandwich PIR 100', kind: 'roof', ctx: 'toiture', layers: [['bacAcier', 0.0005], ['PIR', 0.10], ['bacAcier', 0.0004]] },
  'TOIT-FIBRO': { nom: 'Couverture fibres-ciment (non isolée)', kind: 'roof', ctx: 'toiture', layers: [['fibroCiment', 0.0065]] },
};
const PHYS_T = 86400;
const Cx = {
  m: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], a: (a, b) => [a[0] + b[0], a[1] + b[1]], s: (a, b) => [a[0] - b[0], a[1] - b[1]],
  abs: (a) => Math.hypot(a[0], a[1]), arg: (a) => Math.atan2(a[1], a[0]), div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
};
const Phys = (() => {
  const mm2 = (A, B) => [[Cx.a(Cx.m(A[0][0], B[0][0]), Cx.m(A[0][1], B[1][0])), Cx.a(Cx.m(A[0][0], B[0][1]), Cx.m(A[0][1], B[1][1]))],
    [Cx.a(Cx.m(A[1][0], B[0][0]), Cx.m(A[1][1], B[1][0])), Cx.a(Cx.m(A[1][0], B[0][1]), Cx.m(A[1][1], B[1][1]))]];
  const mat = (id) => matOf(id) || { nom: id, rho: 1000, lambda: 1, c: 1000, mu: 10, gwp: 0 };
  const layerR = (m, e) => (m.R != null ? m.R : e / m.lambda);
  const sdOf = (m, e) => (m.R != null ? e : m.mu * e);
  const psat = (t) => (t >= 0 ? 610.5 * Math.exp(17.269 * t / (237.3 + t)) : 610.5 * Math.exp(21.875 * t / (265.5 + t)));

  function thermal(layers, ctx = 'mur') {
    const rs = RS[ctx] || RS.mur; let R = rs.si + rs.se; const parts = [];
    for (const [id, e] of layers) { const r = layerR(mat(id), e); parts.push(r); R += r; }
    return { R, Rp: R - rs.si - rs.se, U: 1 / R, si: rs.si, se: rs.se, parts };
  }
  function dynamic(layers, ctx = 'mur') {
    const rs = RS[ctx] || RS.mur, res = (r) => [[[1, 0], [-r, 0]], [[0, 0], [1, 0]]];
    let Z = res(rs.si);
    for (const [id, e] of layers) {
      const m = mat(id); let L;
      if (m.R != null || e <= 0) L = res(m.R != null ? m.R : 0);
      else {
        const d = Math.sqrt(m.lambda * PHYS_T / (Math.PI * m.rho * m.c)), x = e / d;
        const ch = Math.cosh(x), sh = Math.sinh(x), co = Math.cos(x), si = Math.sin(x);
        const z11 = [ch * co, sh * si], k12 = -d / (2 * m.lambda), z12 = [k12 * (sh * co + ch * si), k12 * (ch * si - sh * co)];
        const k21 = -m.lambda / d, z21 = [k21 * (sh * co - ch * si), k21 * (sh * co + ch * si)];
        L = [[z11, z12], [z21, z11]];
      }
      Z = mm2(L, Z);
    }
    Z = mm2(res(rs.se), Z);
    const Y12 = Cx.div([-1, 0], Z[0][1]), U = thermal(layers, ctx).U;
    let dt = PHYS_T / (2 * Math.PI) * Cx.arg(Y12) / 3600; dt = ((-dt % 24) + 24) % 24;
    return { Y12: Cx.abs(Y12), f: Cx.abs(Y12) / U, phase: dt };
  }
  function acoustic(layers) {
    let m = 0; const leaves = []; let cur = 0, cav = 0, gap = 0;
    const soft = (id) => ['laineRoche', 'laineRocheD', 'laineVerre', 'airNV', 'airFV'].includes(id);
    for (const [id, e] of layers) {
      const mt = mat(id), ms = (mt.R != null ? 0 : mt.rho) * e; m += ms;
      if (soft(id)) { if (cur > 0) { leaves.push(cur); cur = 0; } gap += e; cav = Math.max(cav, gap); } else { cur += ms; gap = 0; }
    }
    if (cur > 0) leaves.push(cur);
    const law = (mm) => (mm >= 150 ? 37.5 * Math.log10(mm) - 42 : Math.max(0, 12.4 * Math.log10(Math.max(mm, 1)) + 12.6));
    let Rw = law(m), f0 = null, kind = 'Paroi simple (loi de masse)';
    if (leaves.length >= 2 && cav >= 0.02) {
      const m1 = leaves[0], m2 = leaves[leaves.length - 1];
      f0 = 60 * Math.sqrt((1 / m1 + 1 / m2) / cav);
      const raw = 20 * Math.log10(Math.max(1, 100 / f0)) + 8 + 8 * Math.log10(cav / 0.05 + 1);
      const bonus = Math.max(0, Math.min(m1 + m2 > 150 ? 12 : 22, (m1 + m2 > 150 ? 0.5 : 1) * raw));
      Rw = law(m1 + m2) + bonus; kind = 'Double paroi (masse-ressort-masse)';
    }
    return { m, Rw: Math.round(Math.max(0, Rw)), f0, kind };
  }
  function glaser(layers, ctx = 'mur', cond = { ti: 20, hi: 0.5, te: -5, he: 0.8 }) {
    const th = thermal(layers, ctx), pi = cond.hi * psat(cond.ti), pe = cond.he * psat(cond.te);
    let sdTot = 0; for (const [id, e] of layers) sdTot += sdOf(mat(id), e);
    /* parcours de l'intérieur vers l'extérieur : murs décrits de l'extérieur vers l'intérieur, toitures et planchers du haut vers le bas
       (intérieur en bas pour une toiture, en haut pour un plancher bas ou un dallage) */
    const inner = ctx === 'mur' || ctx === 'toiture' ? layers.slice().reverse() : layers.slice();
    const pts = []; let Rc = th.si, sdc = 0;
    const T = (R) => cond.ti - (cond.ti - cond.te) * R / th.R;
    pts.push({ t: T(Rc), ps: psat(T(Rc)), p: pi });
    for (const [id, e] of inner) { const m = mat(id); Rc += layerR(m, e); sdc += sdOf(m, e); const t = T(Rc); pts.push({ t, ps: psat(t), p: pi - (pi - pe) * (sdTot ? sdc / sdTot : 0) }); }
    const risk = pts.filter((q) => q.p > q.ps * 1.0001).length;
    return { pts, risk, sdTot };
  }
  /* Bilan complet d'une composition */
  function report(layers, ctx = 'mur') {
    const th = thermal(layers, ctx), dyn = dynamic(layers, ctx), ac = acoustic(layers), gl = glaser(layers, ctx);
    let mass = 0, T = 0, co2 = 0;
    for (const [id, e] of layers) { const m = mat(id), mm = (m.R != null ? 0 : m.rho) * e; mass += mm; T += e; co2 += mm * (m.gwp || 0); }
    return { th, dyn, ac, gl, mass, T, co2 };
  }
  const composOf = (id) => COMPOS[id] || null;
  const thickness = (id) => { const c = COMPOS[id]; return c ? c.layers.reduce((s, [, e]) => s + e, 0) * 1000 : 0; };
  return { thermal, dynamic, acoustic, glaser, report, composOf, thickness, psat };
})();

/* ---------------- Mécanique ---------------- */
const Mech = (() => {
  const SUPPORTS = {
    simple: { label: 'Sur deux appuis simples', fq: 5 / 384, Mq: 1 / 8, Vq: 1 / 2, fP: 1 / 48, MP: 1 / 4, VP: 1 / 2, Pwhere: 'à mi-portée' },
    encastre: { label: 'Encastrée aux deux extrémités', fq: 1 / 384, Mq: 1 / 12, Vq: 1 / 2, fP: 1 / 192, MP: 1 / 8, VP: 1 / 2, Pwhere: 'à mi-portée' },
    console: { label: 'Console (encastrée à une extrémité)', fq: 1 / 8, Mq: 1 / 2, Vq: 1, fP: 1 / 3, MP: 1, VP: 1, Pwhere: 'en bout' },
  };
  /* Poutre : L (mm), q (kN/m = N/mm, charge répartie totale), P (kN), E (MPa), I (mm⁴), W (mm³), fy (MPa).
     f (mm) = kq·q·L⁴/(E·I) + kP·P·L³/(E·I) ; M (kN·m) ; V (kN) ; σ = M/W (MPa). */
  function beam({ L, q = 0, P = 0, support = 'simple', E, I, W, fy }) {
    const s = SUPPORTS[support] || SUPPORTS.simple, Pn = P * 1000;
    const f = s.fq * q * L ** 4 / (E * I) + s.fP * Pn * L ** 3 / (E * I);
    const M = (s.Mq * q * L * L + s.MP * Pn * L) / 1e6;          /* N·mm → kN·m */
    const V = (s.Vq * q * L + s.VP * Pn) / 1000;                   /* N → kN */
    const sigma = W ? M * 1e6 / W : null;
    return { f, M, V, sigma, ratio: sigma != null && fy ? sigma / fy : null, Lf: f > 0 ? L / f : Infinity, support: s.label };
  }
  /* Flambement (Euler) : Lcr (mm) ; Ncr (kN) ; λ = Lcr/i ; λ̄ = λ/λ1 avec λ1 = π√(E/fy). */
  function euler({ E, I, A, Lcr, fy }) {
    const Ncr = Math.PI ** 2 * E * I / (Lcr * Lcr) / 1000, i = Math.sqrt(I / A), lam = Lcr / i;
    const lam1 = fy ? Math.PI * Math.sqrt(E / fy) : null;
    return { Ncr, i, lam, lamBar: lam1 ? lam / lam1 : null, Npl: fy ? A * fy / 1000 : null };
  }
  /* Dilatation thermique : α (1/K), L (mm), ΔT (K) → ΔL (mm) */
  const dilat = (alpha, L, dT) => alpha * L * dT;
  return { SUPPORTS, beam, euler, dilat };
})();
