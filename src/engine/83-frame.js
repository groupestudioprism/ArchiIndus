/* ============ Calcul de structure filaire (méthode des déplacements, 6 degrés de liberté par nœud) et liste de débit ============
   Barres : profilés de l'assemblage (poteaux, traverses, sablières…) et poutres du plan ayant un profilé (IPE, HEA…).
   Nœuds : extrémités des barres, fusionnées à moins d'une tolérance (excentrements de pose compris, par ex. une traverse
   posée sur un poteau) ; une barre qui passe sur un nœud y est coupée. Appuis : nœuds les plus bas (encastrés ou articulés).
   Charges : poids propre et charge répartie verticale sur les barres horizontales.
   Vérifications INDICATIVES : contrainte élastique N/A + M/W, flambement (courbe b, longueur de barre), flèche relative.
   Ni coefficients partiels, ni combinaisons, ni déversement, ni assemblages : ce n'est pas une note de calcul aux Eurocodes. */
const Frame = (() => {
  const nf = (v, dg = 0) => (v == null || !Number.isFinite(v) ? '—' : fmtFR(v, dg, dg));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ---------- barres du modèle ---------- */
  function members() {
    const d = Doc.get(), out = [];
    if (d.comps && d.comps.length) {
      const R = Model.resolve(d.comps);
      for (const c of d.comps) {
        if (c.part.t !== 'profil') continue;
        const l = Doc.layer(c.layer); if (l && !l.visible) continue;
        const p = PROFILES[c.part.prof]; if (!p) continue;
        const pos = R.pos.get(c.id), th = c.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        const rz = (v) => [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2]];
        let dir, web;
        if (c.part.orient === 'v') { dir = [0, 0, 1]; web = rz([0, 1, 0]); }
        else if (c.part.orient === 'x') { dir = rz([1, 0, 0]); web = [0, 0, 1]; }
        else { dir = rz([0, 1, 0]); web = [0, 0, 1]; }
        out.push({ key: 'c' + c.id, cid: c.id, name: c.name, prof: p, mat: c.mat || 'S235', a: pos.slice(), b: [pos[0] + dir[0] * c.part.L, pos[1] + dir[1] * c.part.L, pos[2] + dir[2] * c.part.L], web });
      }
    }
    for (const o of d.objects) {
      if (!o.st || o.st.kind !== 'poutre') continue;
      const l = Doc.layer(o.layer); if (!l || !l.visible) continue;
      const p = Sections.find(o.st.prof); if (!p) continue;
      const z = ((o.props && typeof o.props.z === 'number' ? o.props.z : 3) * 1000) - p.h / 2;
      Geo.segments(o).forEach(([a, b], i) => out.push({ key: `o${o.id}.${i}`, oid: o.id, name: `${o.st.tag || 'Poutre'} #${o.id}${i ? '.' + i : ''}`, prof: p, mat: objMatId(o) || 'S235', a: [a[0], a[1], z], b: [b[0], b[1], z], web: [0, 0, 1], q: o.props && o.props.ql }));
    }
    return out.filter((m) => len(sub(m.b, m.a)) > 1);
  }

  /* ---------- nœuds : fusion et découpe des barres ---------- */
  function topology(ms, tol) {
    const nodes = [];
    const nodeAt = (p) => { for (let i = 0; i < nodes.length; i++) if (len(sub(nodes[i], p)) <= tol) return i; nodes.push(p.slice()); return nodes.length - 1; };
    for (const m of ms) { m.na = nodeAt(m.a); m.nb = nodeAt(m.b); }
    /* barre traversant un nœud (à moins de tol de son axe) : coupée en ce nœud */
    const els = [];
    for (const m of ms) {
      const A = nodes[m.na], B = nodes[m.nb], ax = sub(B, A), L = len(ax), u = unit(ax);
      const mid = [];
      nodes.forEach((p, i) => {
        if (i === m.na || i === m.nb) return;
        const t = dot(sub(p, A), u);
        if (t <= tol || t >= L - tol) return;
        const q = [A[0] + u[0] * t, A[1] + u[1] * t, A[2] + u[2] * t];
        if (len(sub(p, q)) <= tol) mid.push({ i, t });
      });
      mid.sort((x, y) => x.t - y.t);
      const chain = [m.na, ...mid.map((x) => x.i), m.nb];
      for (let k = 0; k + 1 < chain.length; k++) els.push({ m, n1: chain[k], n2: chain[k + 1] });
    }
    return { nodes, els };
  }

  /* ---------- matrices ---------- */
  function localK(E, G, A, Iz, Iy, J, L) {
    const k = Array.from({ length: 12 }, () => new Float64Array(12));
    const s = (i, j, v) => { k[i][j] += v; if (i !== j) k[j][i] += v; };
    const EA = E * A / L, GJ = G * J / L;
    s(0, 0, EA); s(6, 6, EA); s(0, 6, -EA);
    s(3, 3, GJ); s(9, 9, GJ); s(3, 9, -GJ);
    const z12 = 12 * E * Iz / L ** 3, z6 = 6 * E * Iz / L ** 2, z4 = 4 * E * Iz / L, z2 = 2 * E * Iz / L;
    s(1, 1, z12); s(7, 7, z12); s(1, 7, -z12); s(1, 5, z6); s(1, 11, z6); s(5, 7, -z6); s(7, 11, -z6); s(5, 5, z4); s(11, 11, z4); s(5, 11, z2);
    const y12 = 12 * E * Iy / L ** 3, y6 = 6 * E * Iy / L ** 2, y4 = 4 * E * Iy / L, y2 = 2 * E * Iy / L;
    s(2, 2, y12); s(8, 8, y12); s(2, 8, -y12); s(2, 4, -y6); s(2, 10, -y6); s(4, 8, y6); s(8, 10, y6); s(4, 4, y4); s(10, 10, y4); s(4, 10, y2);
    return k;
  }
  /* repère local : x = axe de la barre, y = âme (axe fort : flexion dans le plan x-y), z = x × y */
  function frameOf(a, b, web) {
    const x = unit(sub(b, a));
    let y = sub(web, x.map((v) => v * dot(web, x)));
    if (len(y) < 1e-6) { const ref = Math.abs(x[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]; y = sub(ref, x.map((v) => v * dot(ref, x))); }
    y = unit(y);
    return [x, y, cross(x, y)];
  }
  const toLocal = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];

  /* résolution K u = F (Gauss avec pivot partiel, matrice pleine) */
  function solve(K, F) {
    const n = F.length, A = K.map((r) => Float64Array.from(r)), b = Float64Array.from(F);
    for (let c = 0; c < n; c++) {
      let p = c, mx = Math.abs(A[c][c]);
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > mx) { mx = Math.abs(A[r][c]); p = r; }
      if (mx < 1e-9) return null;
      if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; const Ar = A[r], Ac = A[c]; for (let k = c; k < n; k++) Ar[k] -= f * Ac[k]; b[r] -= f * b[c]; }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
    return x;
  }

  /* ---------- calcul ---------- */
  function run(opt = {}) {
    const ms = members();
    if (!ms.length) return { error: 'Aucune barre : insérez des profilés (onglet Assemblage → Insérer → Profilé, ou « Bâtiment ») ou tracez des poutres avec un profilé (IPE, HEA…).' };
    const tol = opt.tol || Math.max(50, ...ms.map((m) => m.prof.h)) * 0.75;
    const { nodes, els } = topology(ms, tol);
    const nd = nodes.length * 6;
    if (nd > 3000) return { error: `Modèle trop grand pour le calcul dans le navigateur (${nodes.length} nœuds, 500 maximum).` };
    const zmin = Math.min(...nodes.map((p) => p[2]));
    const sup = nodes.map((p, i) => (p[2] <= zmin + tol ? i : -1)).filter((i) => i >= 0);
    const fixed = new Set();
    for (const i of sup) for (let k = 0; k < (opt.pinned ? 3 : 6); k++) fixed.add(i * 6 + k);
    if (opt.pinned) for (const i of sup) fixed.add(i * 6 + 5);   /* rotation propre bloquée pour éviter une barre libre en torsion */
    const K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
    const data = [];
    for (const e of els) {
      const m = e.m, mat = matOf(m.mat) || matOf('S235'), E = mat.E || 210000, G = mat.G || E / 2.6, p = m.prof;
      const A = p.A * 100, Iz = p.Iy * 1e4, Iy = p.Iz * 1e4, J = (2 * p.b * p.tf ** 3 + (p.h - 2 * p.tf) * p.tw ** 3) / 3;
      const a = nodes[e.n1], b = nodes[e.n2], L = len(sub(b, a)), R = frameOf(a, b, m.web);
      const kl = localK(E, G, A, Iz, Iy, J, L);
      /* charges réparties (N/mm) : poids propre + charge saisie sur les barres horizontales (vers −Z) */
      const horiz = Math.abs(unit(sub(b, a))[2]) < 0.2;
      const qg = [0, 0, -(p.m * 9.81 / 1000 + (horiz ? (m.q != null ? m.q : opt.q || 0) : 0))];
      const ql = toLocal(R, qg);
      const fe = new Float64Array(12);
      fe[0] = fe[6] = ql[0] * L / 2;
      fe[1] = fe[7] = ql[1] * L / 2; fe[5] = ql[1] * L * L / 12; fe[11] = -ql[1] * L * L / 12;
      fe[2] = fe[8] = ql[2] * L / 2; fe[4] = -ql[2] * L * L / 12; fe[10] = ql[2] * L * L / 12;
      /* assemblage : K_g = Tᵀ k T, F_g = Tᵀ fe */
      const dofs = [];
      for (const n of [e.n1, e.n2]) for (let k = 0; k < 6; k++) dofs.push(n * 6 + k);
      const T = (v12) => { const o = new Float64Array(12); for (let blk = 0; blk < 4; blk++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[blk * 3 + i] += R[i][j] * v12[blk * 3 + j]; return o; };
      const Tt = (v12) => { const o = new Float64Array(12); for (let blk = 0; blk < 4; blk++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[blk * 3 + j] += R[i][j] * v12[blk * 3 + i]; return o; };
      const kg = [];
      for (let c = 0; c < 12; c++) { const col = new Float64Array(12); col[c] = 1; const tc = T(col); const kc = kl.map((row) => row.reduce((s, v, j) => s + v * tc[j], 0)); kg.push(Tt(Float64Array.from(kc))); }
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) K[dofs[i]][dofs[j]] += kg[j][i];
      const fg = Tt(fe); for (let i = 0; i < 12; i++) F[dofs[i]] += fg[i];
      data.push({ e, m, L, R, kl, fe, ql, dofs, T, A, Iz, Iy, E, mat, p });
    }
    /* réduction aux degrés de liberté libres */
    const free = []; for (let i = 0; i < nd; i++) if (!fixed.has(i)) free.push(i);
    const Kf = free.map((i) => free.map((j) => K[i][j])), Ff = free.map((i) => F[i]);
    const uf = solve(Kf, Ff);
    if (!uf) return { error: 'Structure instable (mécanisme) : une barre n\'est pas reliée, ou les appuis ne bloquent pas la structure. Vérifiez les contraintes « posé sur » et les jonctions.' };
    const u = new Float64Array(nd); free.forEach((i, k) => { u[i] = uf[k]; });
    /* réactions et contrôle d'équilibre */
    let Rz = 0, Wtot = 0;
    for (const i of sup) { let r = -F[i * 6 + 2]; for (let j = 0; j < nd; j++) r += K[i * 6 + 2][j] * u[j]; Rz += r; }
    for (const x of data) Wtot += -x.ql.reduce((s, v, i) => s + v * x.R[i][2], 0) * x.L;
    /* efforts et vérifications par barre */
    const res = new Map();
    for (const x of data) {
      const ul = x.T(Float64Array.from(x.dofs.map((g) => u[g])));
      const f = new Float64Array(12); for (let i = 0; i < 12; i++) { let s = -x.fe[i]; for (let j = 0; j < 12; j++) s += x.kl[i][j] * ul[j]; f[i] = s; }
      const N = -f[0];  /* traction > 0 */
      let Mz = 0, My = 0;
      for (let k = 0; k <= 20; k++) { const t = x.L * k / 20; Mz = Math.max(Mz, Math.abs(-f[5] + f[1] * t + x.ql[1] * t * t / 2)); My = Math.max(My, Math.abs(-f[4] - f[2] * t - x.ql[2] * t * t / 2)); }
      const V = Math.max(Math.abs(f[1]), Math.abs(f[7]), Math.abs(f[2]), Math.abs(f[8]));
      const fy = x.mat.fy || 235, Wz = x.p.Wy * 1e3, Wy = x.Iy / (x.p.b / 2);
      const sig = Math.abs(N) / x.A + Mz / Wz + My / Wy;
      let chi = 1, ub = 0;
      if (N < 0) {
        const Ncr = Math.PI ** 2 * x.E * Math.min(x.Iz, x.Iy) / x.L ** 2, lam = Math.sqrt(x.A * fy / Ncr), phi = 0.5 * (1 + 0.34 * (lam - 0.2) + lam * lam);
        chi = Math.min(1, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lam * lam))));
        ub = -N / (chi * x.A * fy) + Mz / (Wz * fy) + My / (Wy * fy);
      }
      /* flèche locale à mi-portée (interpolation d'Hermite + charge répartie, barre bi-encastrée) */
      const v = 0.5 * ul[1] + 0.125 * x.L * ul[5] + 0.5 * ul[7] - 0.125 * x.L * ul[11] - (ul[1] + ul[7]) / 2 + x.ql[1] * x.L ** 4 / (384 * x.E * x.Iz);
      const w = 0.5 * ul[2] - 0.125 * x.L * ul[4] + 0.5 * ul[8] + 0.125 * x.L * ul[10] - (ul[2] + ul[8]) / 2 + x.ql[2] * x.L ** 4 / (384 * x.E * x.Iy);
      const defl = Math.hypot(v, w);
      const util = Math.max(sig / fy, ub);
      const prev = res.get(x.m.key);
      const r = { key: x.m.key, cid: x.m.cid, oid: x.m.oid, name: x.m.name, prof: x.p.id, mat: x.mat.nom, L: (prev ? prev.L : 0) + x.L, N: prev && Math.abs(prev.N) > Math.abs(N) ? prev.N : N,
        V: Math.max(V, prev ? prev.V : 0), M: Math.max(Mz, prev ? prev.M : 0), My: Math.max(My, prev ? prev.My : 0), sig: Math.max(sig, prev ? prev.sig : 0), chi: Math.min(chi, prev ? prev.chi : 1),
        util: Math.max(util, prev ? prev.util : 0), defl: Math.max(defl, prev ? prev.defl : 0), span: Math.max(x.L, prev ? prev.span : 0) };
      res.set(x.m.key, r);
    }
    let umax = 0, unode = -1;
    nodes.forEach((p, i) => { const d = Math.hypot(u[i * 6], u[i * 6 + 1], u[i * 6 + 2]); if (d > umax) { umax = d; unode = i; } });
    return { nodes, els, sup, members: [...res.values()], umax, unode, Rz, Wtot, tol, pinned: !!opt.pinned };
  }

  function dialog() {
    const q = el('input', { class: 'fld', type: 'number', min: 0, max: 1000, step: 'any', value: state.frameQ != null ? state.frameQ : 2, 'aria-label': 'Charge répartie sur les barres horizontales en kilonewtons par mètre' });
    const sup = el('select', { 'aria-label': 'Appuis' }, el('option', { value: 'fix' }, 'Pieds encastrés'), el('option', { value: 'pin', selected: state.framePinned }, 'Pieds articulés'));
    const out = el('div');
    const go = () => {
      state.frameQ = Number(q.value) || 0; state.framePinned = sup.value === 'pin';
      const r = run({ q: state.frameQ, pinned: state.framePinned });
      out.textContent = '';
      if (r.error) { out.append(el('p', { class: 'note bad' }, r.error)); state.frameUtil = null; return; }
      state.frameUtil = new Map(r.members.filter((m) => m.cid).map((m) => [m.cid, m.util]));
      const worst = r.members.reduce((a, b) => (b.util > a.util ? b : a), r.members[0]);
      out.append(el('dl', { class: 'kv' },
        el('dt', {}, 'Modèle'), el('dd', {}, `${r.members.length} barres, ${r.els.length} éléments, ${r.nodes.length} nœuds, ${r.sup.length} appuis (${r.pinned ? 'articulés' : 'encastrés'})`),
        el('dt', {}, 'Équilibre vertical'), el('dd', {}, `charges ${nf(r.Wtot / 1000, 2)} kN · réactions ${nf(r.Rz / 1000, 2)} kN`),
        el('dt', {}, 'Déplacement maximal'), el('dd', {}, `${nf(r.umax, 1)} mm`),
        el('dt', {}, 'Barre la plus sollicitée'), el('dd', { class: worst.util > 1 ? 'bad' : '' }, `${worst.name} : taux ${nf(worst.util * 100, 0)} %`)));
      const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...['Barre', 'Profilé', 'L (m)', 'N (kN)', 'V (kN)', 'M fort (kN·m)', 'M faible (kN·m)', 'σ (MPa)', 'χ', 'Flèche', 'Taux'].map((h, i) => el('th', { class: i > 1 ? 'n' : '' }, h)))));
      const tb = el('tbody');
      for (const m of r.members.sort((a, b) => b.util - a.util)) {
        const fl = m.defl > 0.01 ? `L/${nf(m.span / m.defl, 0)}` : '—';
        tb.append(el('tr', { class: m.util > 1 ? 'bad' : m.util > 0.7 ? 'warn' : '' }, el('td', {}, m.name), el('td', {}, m.prof), el('td', { class: 'n' }, nf(m.L / 1000, 2)), el('td', { class: 'n' }, nf(m.N / 1000, 1)), el('td', { class: 'n' }, nf(m.V / 1000, 1)),
          el('td', { class: 'n' }, nf(m.M / 1e6, 2)), el('td', { class: 'n' }, nf(m.My / 1e6, 2)), el('td', { class: 'n' }, nf(m.sig, 0)), el('td', { class: 'n' }, nf(m.chi, 2)), el('td', { class: 'n' }, fl), el('td', { class: 'n' }, nf(m.util * 100, 0) + ' %')));
      }
      t.append(tb); out.append(el('div', { class: 'tbl-wrap' }, t));
      out.append(el('p', { class: 'mut small' }, `Calcul élastique linéaire au 1er ordre (6 ddl/nœud), poids propre + ${nf(state.frameQ, 2)} kN/m sur les barres horizontales (ou la charge « ql » d'une poutre du plan). Jonctions automatiques à ${nf(r.tol, 0)} mm. Taux = max(σ/fy ; N/(χ·A·fy) + M/(W·fy)), flambement courbe b sur la longueur de l'élément. Indicatif : ni coefficients partiels, ni combinaisons, ni déversement, ni assemblages.`));
      if (View3D.isOn()) View3D.setStyle('util');
    };
    for (const x of [q, sup]) x.addEventListener('change', go);
    Dlg.open('Calcul de structure filaire', el('div', {}, el('div', { class: 'row2b' }, el('label', { class: 'lbl' }, 'Charge sur les barres horizontales (kN/m)', q), el('label', { class: 'lbl' }, 'Appuis', sup)), out),
      [{ label: 'Voir les taux en 3D', run: () => { View3D.setMode(true); View3D.setStyle('util'); } }]);
    go();
  }

  /* ---------- liste de débit (mécano-soudure) ---------- */
  function cutRows() {
    const groups = new Map();
    for (const m of members()) {
      const L = Math.round(len(sub(m.b, m.a)));
      const k = `${m.prof.id}|${L}|${m.mat}`;
      const g = groups.get(k) || { prof: m.prof.id, L, mat: m.mat, n: 0, kgm: m.prof.m, names: [] };
      g.n++; g.names.push(m.name); groups.set(k, g);
    }
    return [...groups.values()].sort((a, b) => a.prof.localeCompare(b.prof) || b.L - a.L);
  }
  function cutList() {
    const rows = cutRows();
    if (!rows.length) { Status.msg('Aucun profilé : insérez des profilés ou générez un bâtiment (onglet Assemblage).', 7000); return; }
    let tot = 0, totL = 0;
    const tb = el('tbody');
    rows.forEach((g, i) => { const mass = g.kgm * g.L / 1000 * g.n; tot += mass; totL += g.L * g.n; tb.append(el('tr', {}, el('td', {}, String(i + 1)), el('td', {}, g.prof), el('td', {}, (matOf(g.mat) || { nom: g.mat }).nom), el('td', { class: 'n' }, nf(g.L, 0)), el('td', { class: 'n' }, String(g.n)), el('td', { class: 'n' }, nf(g.kgm, 1)), el('td', { class: 'n' }, nf(mass, 1)), el('td', { class: 'small' }, g.names.slice(0, 4).join(', ') + (g.names.length > 4 ? '…' : '')))); });
    tb.append(el('tr', { class: 'lot' }, el('td', { colspan: 3 }, 'Total'), el('td', { class: 'n' }, nf(totL / 1000, 2) + ' m'), el('td', {}), el('td', {}), el('td', { class: 'n' }, nf(tot, 1) + ' kg'), el('td', {})));
    Dlg.open('Liste de débit des profilés', el('div', {}, el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...['Rep.', 'Profilé', 'Matière', 'Longueur (mm)', 'Qté', 'kg/m', 'Masse (kg)', 'Éléments'].map((h, i) => el('th', { class: i > 2 && i < 7 ? 'n' : '' }, h)))), tb)),
      el('p', { class: 'mut small' }, 'Longueurs d\'axe, coupes droites (sans onglets ni grugeages), arrondies au millimètre. Profilés de l\'assemblage et poutres du plan ayant un profilé.')),
    [{ label: 'Exporter CSV', run: () => { if (!Lic.need()) return false; const out = [['Rep.', 'Profilé', 'Matière', 'Longueur (mm)', 'Quantité', 'kg/m', 'Masse (kg)']]; rows.forEach((g, i) => out.push([i + 1, g.prof, (matOf(g.mat) || { nom: g.mat }).nom, g.L, g.n, nf(g.kgm, 2), nf(g.kgm * g.L / 1000 * g.n, 2)])); IO.download(`${IO.safeName(Doc.get().name)}-debit.csv`, '﻿' + out.map((r) => r.join(';')).join('\r\n'), 'text/csv'); return false; } }]);
  }

  return { members, topology, run, dialog, cutRows, cutList, localK, solve };
})();
