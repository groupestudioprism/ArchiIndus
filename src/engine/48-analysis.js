/* ============ Analyse : poutres (flèche, contrainte), poteaux (flambement), réseaux (dilatation) ============
   Applique les formules de Mech (14-physics.js) aux objets du projet :
   - Poutre (attribut st de type poutre) : chaque tronçon est vu comme une travée isostatique (ou selon l'appui choisi),
     charge = charge répartie saisie (propriété « Charge répartie », kN/m) + poids propre du profilé.
     Section : profilé du catalogue (IPE, HEA, HEB, UPN) lu dans le champ « Profilé », sinon rectangle largeur × hauteur.
   - Poteau (composant « Profilé acier » vertical) : flambement d'Euler autour de l'axe faible, longueur de flambement = longueur
     (poteau bi-articulé), élancement réduit λ̄.
   - Réseau : dilatation ΔL = α·L·ΔT avec l'écart de température saisi (propriété « Écart de température »).
   Résultats indicatifs de pré-dimensionnement (ELS / contrainte élastique sans coefficients partiels) : ils ne remplacent pas
   une vérification aux Eurocodes par un ingénieur structure. */
function objMatId(o) {
  if (o.mat) return o.mat;
  if (o.net) return MAT_DEFAULT.net[o.net.mat] || '';
  if (o.st) return o.st.kind === 'poutre' ? MAT_DEFAULT.poutre : MAT_DEFAULT.mur;
  if (o.type === 'sym' && (o.k === 'poteau' || o.k === 'poteauRond')) return MAT_DEFAULT.poteau;
  return '';
}
const Analysis = (() => {
  const cfg = { support: 'simple', lim: 200 };
  /* Section et matériau d'une poutre */
  function beamSection(o) {
    const m = matOf(objMatId(o)) || matOf('S235');
    const pr = Sections.find(o.st.prof);
    const sec = pr ? Sections.props({ kind: 'prof', id: pr.id }) : Sections.props({ kind: 'rect', b: o.st.w, h: (o.props && o.props.h) || 200 }, m.rho);
    return { sec, m, mat: objMatId(o) || 'S235' };
  }
  function beamOf(o) {
    if (!o.st || o.st.kind !== 'poutre') return null;
    const { sec, m, mat } = beamSection(o);
    if (!sec || !m.E) return null;
    const g = sec.m * 9.81 / 1000;                       /* poids propre kN/m */
    const ql = (o.props && o.props.ql) || 0;
    const q = ql + g;
    let worst = null;
    for (const [a, b] of Geo.segments(o)) {
      const L = G.dist(a, b); if (L < 1) continue;
      const r = Mech.beam({ L, q, support: cfg.support, E: m.E, I: sec.Iy, W: sec.Wy, fy: m.fy || m.fk });
      r.L = L; r.fRatio = r.f / (L / cfg.lim);
      if (!worst || Math.max(r.ratio || 0, r.fRatio) > Math.max(worst.ratio || 0, worst.fRatio)) worst = r;
    }
    if (!worst) return null;
    return { o, sec, mat, m, g, ql, q, ...worst, util: Math.max(worst.ratio || 0, worst.fRatio) };
  }
  const beamUtil = (o) => { const r = beamOf(o); return r ? r.util : null; };
  function columns() {
    const out = [], d = Doc.get();
    if (!d.comps) return out;
    for (const c of d.comps) {
      if (c.part.t !== 'profil' || c.part.orient !== 'v') continue;
      const sec = Sections.props({ kind: 'prof', id: c.part.prof }), m = matOf(c.mat) || matOf('S355');
      if (!sec || !m.E) continue;
      const r = Mech.euler({ E: m.E, I: sec.Iz, A: sec.A, Lcr: c.part.L, fy: m.fy });
      out.push({ c, sec, m, ...r });
    }
    return out;
  }
  function pipes() {
    const out = [];
    for (const o of Doc.get().objects) {
      if (!o.net || !o.props || typeof o.props.dt !== 'number') continue;
      const m = matOf(objMatId(o)); if (!m || !m.alpha) continue;
      const L = Geo.length(o) || 0;
      out.push({ o, m, L, dL: Mech.dilat(m.alpha, L, o.props.dt) });
    }
    return out;
  }
  const beams = () => Doc.get().objects.map(beamOf).filter(Boolean);

  const f1 = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : fmtFR(v, d, d));
  function show() {
    const body = el('div');
    body.append(el('p', { class: 'mut small' }, 'Pré-dimensionnement indicatif (élasticité linéaire, sans coefficients partiels, sans déversement ni vérification des assemblages). Ne remplace pas une note de calcul aux Eurocodes.'));
    const sup = el('select', { 'aria-label': 'Conditions d\'appui des poutres' }, ...Object.entries(Mech.SUPPORTS).map(([k, s]) => el('option', { value: k, selected: k === cfg.support }, s.label)));
    const lim = el('select', { 'aria-label': 'Limite de flèche' }, ...[150, 200, 250, 300, 400, 500].map((v) => el('option', { value: v, selected: v === cfg.lim }, `L/${v}`)));
    const rerun = () => { cfg.support = sup.value; cfg.lim = +lim.value; dlg.close(); show(); if (View3D.isOn()) View3D.refresh(); };
    sup.addEventListener('change', rerun); lim.addEventListener('change', rerun);
    body.append(el('div', { class: 'frm' }, el('label', { class: 'lbl' }, 'Appuis des poutres', sup), el('label', { class: 'lbl' }, 'Flèche admissible (choix de l\'utilisateur)', lim)));
    const B = beams();
    const T = (cap, head, rows, num) => { const t = el('table', { class: 'tbl' }, el('caption', {}, cap), el('thead', {}, el('tr', {}, ...head.map((h, i) => el('th', { class: num.includes(i) ? 'n' : '', scope: 'col' }, h))))); t.append(el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c, i) => el('td', { class: num.includes(i) ? 'n' : '' }, c)))))); return t; };
    if (B.length) body.append(T('Poutres (tronçon le plus sollicité)', ['Poutre', 'Section', 'Matériau', 'Portée (m)', 'q totale (kN/m)', 'Flèche (mm)', 'L/f', 'M (kN·m)', 'σ (MPa)', 'σ/fy', 'Taux'],
      B.map((r) => [r.o.st.tag || `#${r.o.id}`, r.sec.label, r.m.nom, f1(r.L / 1000, 2), f1(r.q, 2), f1(r.f, 1), r.Lf === Infinity ? '∞' : f1(r.Lf, 0), f1(r.M, 2), f1(r.sigma, 0), f1(r.ratio, 2), `${Math.round(r.util * 100)} %`]), [3, 4, 5, 6, 7, 8, 9, 10]));
    else body.append(el('p', { class: 'mut' }, 'Aucune poutre : tracez en mode « Poutre » ou appliquez une structure de type poutre à une ligne.'));
    const C = columns();
    if (C.length) body.append(T('Poteaux (composants profilés verticaux) : flambement d\'Euler, axe faible, Lcr = L', ['Poteau', 'Profilé', 'Matériau', 'L (m)', 'Ncr (kN)', 'Npl (kN)', 'λ', 'λ̄'],
      C.map((r) => [r.c.name, r.sec.label, r.m.nom, f1(r.c.part.L / 1000, 2), f1(r.Ncr, 0), f1(r.Npl, 0), f1(r.lam, 0), f1(r.lamBar, 2)]), [3, 4, 5, 6, 7]));
    const P = pipes();
    if (P.length) body.append(T('Dilatation des réseaux (ΔL = α·L·ΔT)', ['Réseau', 'Matériau', 'α (10⁻⁶/K)', 'L (m)', 'ΔT (K)', 'ΔL (mm)'],
      P.map((r) => [r.o.net.tag || `DN${r.o.net.dn}`, r.m.nom, f1(r.m.alpha * 1e6, 1), f1(r.L / 1000, 2), f1(r.o.props.dt, 0), f1(r.dL, 1)]), [2, 3, 4, 5]));
    body.append(el('p', { class: 'mut small' }, 'Formules : flèche 5qL⁴/384EI (appuis simples), qL⁴/384EI (encastrée), qL⁴/8EI (console) ; M = qL²/8, qL²/12, qL²/2 ; σ = M/Wel ; Ncr = π²EI/Lcr² ; λ̄ = λ/(π√(E/fy)). Taux = max(σ/fy ; f/flèche admissible).'));
    const dlg = Dlg.open('Analyse : déformations et contraintes', body);
  }
  return { cfg, beamOf, beamUtil, beams, columns, pipes, show };
})();
