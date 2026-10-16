/* ============ Réseaux : profil en long, calcul hydraulique, conflits entre réseaux ============
   Méthodes indicatives (pré-dimensionnement) : Manning-Strickler à pleine section pour les écoulements gravitaires,
   Darcy-Weisbach avec la formule explicite de Swamee-Jain (approximation de Colebrook-White) pour les réseaux en charge.
   Les résultats ne remplacent pas une note de calcul hydraulique validée (débits de pointe, remplissage partiel, coups de bélier…). */
const Networks = (() => {
  const nf = (v, dg = 0) => (v == null || !Number.isFinite(v) ? '—' : fmtFR(v, dg, dg));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* coefficient de Strickler K (m^(1/3)/s) et rugosité absolue k (mm), valeurs usuelles de projet (réseau en service) */
  const ROUGH = [
    [/pvc|pehd|pe\b|polyéthylène|polypropylène|pp\b/i, 90, 0.1],
    [/fonte/i, 80, 0.1],
    [/inox|cuivre/i, 95, 0.015],
    [/acier/i, 80, 0.15],
    [/grès/i, 85, 0.25],
    [/béton/i, 70, 0.5],
  ];
  function rough(mat) { for (const [re, K, k] of ROUGH) if (re.test(mat || '')) return { K, k }; return { K: 75, k: 0.25 }; }
  const nets = () => Doc.get().objects.filter((o) => o.net && (o.type === 'line' || o.type === 'poly') && Doc.layer(o.layer) && Doc.layer(o.layer).visible);
  const label = (o) => `${o.net.tag || '#' + o.id} · DN${nf(o.net.dn)}${o.net.mat ? ' ' + o.net.mat : ''}`;
  const isPressure = (o) => o.props && typeof o.props.pr === 'number' && o.props.pr > 0;

  /* ---------- hydraulique ---------- */
  function calc(o) {
    const D = o.net.dn / 1000, A = Math.PI * D * D / 4, L = (Geo.length(o) || 0) / 1000, r = rough(o.net.mat), q = o.props && typeof o.props.q === 'number' ? o.props.q / 1000 : null;
    if (isPressure(o)) {
      const nu = 1.004e-6;
      if (!q) return { kind: 'charge', L, D, A, note: 'débit (q) à saisir dans les propriétés' };
      const V = q / A, Re = V * D / nu, eps = r.k / 1000;
      const f = Re < 2300 ? 64 / Re : 0.25 / Math.log10(eps / (3.7 * D) + 5.74 / Math.pow(Re, 0.9)) ** 2;
      const J = f / D * V * V / (2 * 9.81);   /* m/m */
      const dz = typeof o.props.zi === 'number' && typeof o.props.zf === 'number' ? o.props.zf - o.props.zi : 0;
      return { kind: 'charge', L, D, A, q, V, Re, f, J, dH: J * L, hmt: J * L + dz, warn: V > 2.5 ? 'vitesse élevée (> 2,5 m/s)' : V < 0.3 ? 'vitesse faible (< 0,3 m/s : dépôts)' : '' };
    }
    const sp = Props.slope(o);
    if (sp == null || !Number.isFinite(sp)) return { kind: 'gravitaire', L, D, A, note: 'altitudes amont et aval à saisir' };
    const I = sp / 100;
    if (I <= 0) return { kind: 'gravitaire', L, D, A, I, warn: 'contre-pente ou pente nulle' };
    const Rh = D / 4, Qps = r.K * A * Math.pow(Rh, 2 / 3) * Math.sqrt(I), Vps = Qps / A;
    const out = { kind: 'gravitaire', L, D, A, I, K: r.K, Qps, Vps };
    if (q) out.rate = q / Qps;
    const ws = [];
    if (I < 0.005) ws.push('pente < 0,5 %');
    if (Vps < 0.7) ws.push('vitesse à pleine section < 0,7 m/s (autocurage douteux)');
    if (out.rate > 1) ws.push('débit supérieur au débit capable');
    else if (out.rate > 0.7) ws.push('remplissage > 70 %');
    out.warn = ws.join(' ; ');
    return out;
  }
  function hydroDialog() {
    const list = nets();
    if (!list.length) { Status.msg('Aucun réseau visible : tracez des lignes en mode « Réseau » (DN, matériau).', 7000); return; }
    const grav = list.filter((o) => !isPressure(o)), pres = list.filter(isPressure);
    const body = el('div');
    if (grav.length) {
      body.append(el('h3', { class: 'h3' }, `Réseaux gravitaires (${grav.length})`));
      body.append(el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ...['Réseau', 'L (m)', 'Pente (%)', 'K', 'Q capable (L/s)', 'V pleine section (m/s)', 'Q projet (L/s)', 'Remplissage', 'Alerte'].map((h, i) => el('th', { class: i && i < 8 ? 'n' : '' }, h)))),
        el('tbody', {}, ...grav.map((o) => { const r = calc(o); return el('tr', { class: r.warn ? 'warn' : '' }, el('td', {}, label(o)), el('td', { class: 'n' }, nf(r.L, 1)), el('td', { class: 'n' }, r.I != null ? nf(r.I * 100, 2) : '—'), el('td', { class: 'n' }, r.K || '—'),
          el('td', { class: 'n' }, r.Qps ? nf(r.Qps * 1000, 1) : '—'), el('td', { class: 'n' }, r.Vps ? nf(r.Vps, 2) : '—'), el('td', { class: 'n' }, o.props && o.props.q != null ? nf(o.props.q, 2) : '—'),
          el('td', { class: 'n' }, r.rate != null ? nf(r.rate * 100, 0) + ' %' : '—'), el('td', { class: 'small' }, r.warn || r.note || '')); })))));
    }
    if (pres.length) {
      body.append(el('h3', { class: 'h3' }, `Réseaux en charge (${pres.length})`));
      body.append(el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ...['Réseau', 'L (m)', 'Q (L/s)', 'V (m/s)', 'Reynolds', 'λ', 'J (m/km)', 'Pertes ΔH (m)', 'HMT ≈ (m)', 'Alerte'].map((h, i) => el('th', { class: i && i < 9 ? 'n' : '' }, h)))),
        el('tbody', {}, ...pres.map((o) => { const r = calc(o); return el('tr', { class: r.warn ? 'warn' : '' }, el('td', {}, label(o)), el('td', { class: 'n' }, nf(r.L, 1)), el('td', { class: 'n' }, r.q ? nf(r.q * 1000, 2) : '—'), el('td', { class: 'n' }, r.V ? nf(r.V, 2) : '—'),
          el('td', { class: 'n' }, r.Re ? nf(r.Re, 0) : '—'), el('td', { class: 'n' }, r.f ? nf(r.f, 4) : '—'), el('td', { class: 'n' }, r.J ? nf(r.J * 1000, 2) : '—'), el('td', { class: 'n' }, r.dH != null ? nf(r.dH, 2) : '—'),
          el('td', { class: 'n' }, r.hmt != null ? nf(r.hmt, 2) : '—'), el('td', { class: 'small' }, r.warn || r.note || '')); })))));
    }
    body.append(el('p', { class: 'mut small' }, 'Gravitaire : Manning-Strickler à pleine section (Rh = D/4, K selon le matériau). En charge (pression saisie) : Darcy-Weisbach, λ par Swamee-Jain (Colebrook-White), eau à 20 °C ; HMT = pertes linéaires + dénivelé, sans pertes singulières. Débit, pression et altitudes : propriétés techniques du réseau. Résultats indicatifs.'));
    Dlg.open('Calcul hydraulique', body, [{ label: 'Exporter CSV', run: () => { if (Lic.need()) exportHydro(list); return false; } }]);
  }
  function exportHydro(list) {
    const rows = [['Réseau', 'Type', 'L (m)', 'DN (mm)', 'Pente (%)', 'Q capable (L/s)', 'V (m/s)', 'Q projet (L/s)', 'J (m/km)', 'Pertes (m)', 'Alerte']];
    for (const o of list) { const r = calc(o); rows.push([label(o), r.kind, nf(r.L, 2), nf(o.net.dn), r.I != null ? nf(r.I * 100, 3) : '', r.Qps ? nf(r.Qps * 1000, 2) : '', nf(r.V || r.Vps, 2), o.props && o.props.q != null ? nf(o.props.q, 2) : '', r.J ? nf(r.J * 1000, 3) : '', r.dH != null ? nf(r.dH, 3) : '', r.warn || r.note || '']); }
    IO.download(`${IO.safeName(Doc.get().name)}-hydraulique.csv`, '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  }

  /* ---------- profil en long ---------- */
  function profileOf(o) {
    const path = Model.netPath(o), S = typeof Site !== 'undefined' && Site.data ? Site.data() : null;
    const z0 = S ? S.z0 : null, hasZ = o.props && typeof o.props.zi === 'number' && typeof o.props.zf === 'number';
    const pts = []; let pk = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) pk += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) / 1000;
      const fe = hasZ ? path[i][2] / 1000 : null;
      let tn = null; if (S) { try { tn = z0 + Site.H(path[i][0] / 1000, path[i][1] / 1000); } catch (e) { tn = null; } }
      pts.push({ pk, x: path[i][0], y: path[i][1], fe, tn, prof: fe != null && tn != null ? tn - fe : o.props && typeof o.props.depth === 'number' ? o.props.depth : null });
    }
    /* terrain échantillonné tous les ~2 m entre sommets */
    const tnLine = [];
    if (S) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000, n = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k <= n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; try { tnLine.push([pts[i - 1].pk + L * t, z0 + Site.H(x / 1000, y / 1000)]); } catch (e) { /* hors emprise */ } }
    }
    return { pts, tnLine, hasZ, site: !!S };
  }
  function profileSVG(o, P) {
    const W = 900, H = 340, m = { l: 60, r: 20, t: 20, b: 110 };
    const L = P.pts[P.pts.length - 1].pk || 1;
    const zs = [...P.pts.map((p) => p.fe), ...P.pts.map((p) => p.tn), ...P.tnLine.map((q) => q[1])].filter((v) => v != null);
    if (!zs.length) return null;
    let z0 = Math.min(...zs), z1 = Math.max(...zs); const pad = Math.max(0.5, (z1 - z0) * 0.15); z0 -= pad; z1 += pad;
    const X = (pk) => m.l + (W - m.l - m.r) * pk / L, Y = (z) => m.t + (H - m.t - m.b) * (1 - (z - z0) / (z1 - z0));
    let g = `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="none" stroke="#C9D3DC"/>`;
    const step = Math.pow(10, Math.floor(Math.log10((z1 - z0) / 4)));
    for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(z)}" y2="${Y(z)}" stroke="#EEF2F5"/><text x="${m.l - 6}" y="${Y(z) + 4}" text-anchor="end" class="ax">${nf(z, step < 1 ? 1 : 0)}</text>`;
    if (P.tnLine.length) g += `<polyline points="${P.tnLine.map((q) => `${X(q[0])},${Y(q[1])}`).join(' ')}" fill="none" stroke="#7A6A4F" stroke-width="1.6"/>`;
    const fe = P.pts.filter((p) => p.fe != null);
    if (fe.length) {
      const r = o.net.dn / 1000;
      g += `<polyline points="${fe.map((p) => `${X(p.pk)},${Y(p.fe)}`).join(' ')}" fill="none" stroke="#0877B9" stroke-width="2.2"/>`;
      g += `<polyline points="${fe.map((p) => `${X(p.pk)},${Y(p.fe + r)}`).join(' ')}" fill="none" stroke="#0877B9" stroke-width="1" stroke-dasharray="4 3"/>`;
    }
    P.pts.forEach((p, i) => {
      g += `<line x1="${X(p.pk)}" x2="${X(p.pk)}" y1="${m.t}" y2="${H - m.b}" stroke="#A9B6C2" stroke-dasharray="2 3"/>`;
      if (i && fe.length > 1 && P.pts[i - 1].fe != null && p.fe != null) { const sl = (P.pts[i - 1].fe - p.fe) / Math.max(1e-6, p.pk - P.pts[i - 1].pk) * 100; g += `<text x="${(X(p.pk) + X(P.pts[i - 1].pk)) / 2}" y="${H - m.b + 16}" text-anchor="middle" class="sl">${nf(sl, 2)} %</text>`; }
    });
    /* cartouche de données sous le profil */
    const rows = [['PK (m)', (p) => nf(p.pk, 2)], ['TN (m)', (p) => nf(p.tn, 2)], ['Fil d\'eau (m)', (p) => nf(p.fe, 2)], ['Profondeur (m)', (p) => nf(p.prof, 2)]];
    rows.forEach(([t, fn], k) => {
      const y = H - m.b + 34 + k * 18;
      g += `<text x="${m.l - 6}" y="${y}" text-anchor="end" class="hd">${esc(t)}</text>`;
      for (const p of P.pts) g += `<text x="${X(p.pk)}" y="${y}" text-anchor="middle" class="v">${fn(p)}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="prof-svg" role="img" aria-label="Profil en long ${esc(label(o))}"><style>.ax,.v,.hd,.sl{font:11px Inter,sans-serif;fill:#3C4863}.hd{font-weight:600}.sl{fill:#0877B9}</style>${g}</svg>`;
  }
  function profileDialog() {
    const sel = Doc.get().objects.filter((o) => Tools.selection.has(o.id) && o.net && (o.type === 'line' || o.type === 'poly'));
    const list = sel.length ? sel : nets();
    if (!list.length) { Status.msg('Sélectionnez un réseau (ligne ou polyligne en mode Réseau) pour son profil en long.', 7000); return; }
    const pick = el('select', { 'aria-label': 'Réseau' }, ...list.map((o) => el('option', { value: o.id }, label(o))));
    const zone = el('div', { class: 'prof-zone' }), info = el('p', { class: 'mut small' });
    let svgText = '';
    const draw = () => {
      const o = list.find((x) => x.id === +pick.value), P = profileOf(o);
      svgText = profileSVG(o, P) || '';
      zone.innerHTML = svgText || '<p>Rien à tracer : saisissez les altitudes amont et aval du réseau (propriétés techniques), ou choisissez l\'adresse du projet (onglet Site) pour le terrain naturel.</p>';
      info.textContent = `${P.hasZ ? 'Fil d\'eau : altitudes amont et aval interpolées le long du tracé.' : 'Pas d\'altitudes amont / aval : fil d\'eau non tracé.'} ${P.site ? 'Terrain naturel : relief IGN du site (pas de 2 m).' : 'Pas de site : terrain naturel non tracé (onglet Site → Adresse).'} Pointillés : génératrice supérieure (fil d'eau + DN).`;
    };
    pick.addEventListener('change', draw); draw();
    Dlg.open('Profil en long', el('div', {}, el('label', { class: 'lbl' }, 'Réseau', pick), zone, info),
      [{ label: 'Télécharger (SVG)', primary: true, run: () => { if (svgText && Lic.need()) IO.download(`${IO.safeName(Doc.get().name)}-profil.svg`, svgText, 'image/svg+xml'); return false; } }]);
  }

  /* ---------- conflits entre réseaux (distance entre génératrices en 3D) ---------- */
  function segDist(p1, q1, p2, q2) {
    const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]], d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]], r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    let s, t;
    if (a < 1e-9 && e < 1e-9) { s = t = 0; }
    else if (a < 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else {
      const c = dot(d1, r);
      if (e < 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else {
        const b = dot(d1, d2), den = a * e - b * b;
        s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
    }
    const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
    return { d: Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]), at: [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2] };
  }
  function clashes(clear) {
    const L = nets().map((o) => ({ o, path: Model.netPath(o), r: o.net.dn / 2 })), out = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      /* réseaux raccordés bout à bout (regard, piquage) : pas un conflit */
      const pi = L[i].path, pj = L[j].path, tolc = L[i].r + L[j].r + 1;
      if ([pi[0], pi[pi.length - 1]].some((p) => pj.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tolc)) || [pj[0], pj[pj.length - 1]].some((p) => pi.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tolc))) continue;
      let best = null;
      for (let a = 1; a < L[i].path.length; a++) for (let b = 1; b < L[j].path.length; b++) {
        const r = segDist(L[i].path[a - 1], L[i].path[a], L[j].path[b - 1], L[j].path[b]);
        const gap = r.d - L[i].r - L[j].r;
        if (!best || gap < best.gap) best = { gap, at: r.at };
      }
      if (best && best.gap < clear) out.push({ a: L[i].o, b: L[j].o, gap: best.gap, at: best.at });
    }
    return out.sort((x, y) => x.gap - y.gap);
  }
  function clashDialog() {
    const clear = el('input', { class: 'fld', type: 'number', min: 0, max: 5000, step: 10, value: 200, 'aria-label': 'Distance minimale entre génératrices en millimètres' });
    const out = el('div', { class: 'tbl-wrap' });
    const run = () => {
      const hits = clashes(Number(clear.value) || 0);
      out.textContent = '';
      if (!hits.length) { out.append(el('p', { class: 'ok' }, `Aucun conflit : tous les réseaux visibles sont à plus de ${clear.value} mm les uns des autres (génératrices, altitudes comprises).`)); return; }
      const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'Réseau A'), el('th', {}, 'Réseau B'), el('th', { class: 'n' }, 'Distance (mm)'), el('th', {}, 'Lieu'), el('th', {}))));
      const tb = el('tbody'); t.append(tb);
      for (const h of hits) {
        const go = el('button', { type: 'button', class: 'btn' }, 'Voir');
        go.addEventListener('click', () => { Tools.selection.clear(); Tools.selection.add(h.a.id); Tools.selection.add(h.b.id); if (View3D.isOn()) View3D.setMode(false); const s = Canvas2D.size(); state.view.scale = Math.max(state.view.scale, 0.05); state.view.x = s.w / 2 - h.at[0] * state.view.scale; state.view.y = s.h / 2 + h.at[1] * state.view.scale; Canvas2D.requestDraw(); UI.renderProps(); });
        tb.append(el('tr', { class: h.gap < 0 ? 'bad' : 'warn' }, el('td', {}, label(h.a)), el('td', {}, label(h.b)), el('td', { class: 'n' }, h.gap < 0 ? `${nf(h.gap, 0)} (interpénétration)` : nf(h.gap, 0)),
          el('td', { class: 'small' }, `x ${nf(h.at[0] / 1000, 2)} m · y ${nf(h.at[1] / 1000, 2)} m · z ${nf(h.at[2] / 1000, 2)} m`), el('td', {}, go)));
      }
      out.append(t, el('p', { class: 'mut small' }, `${hits.length} conflit(s). Distance mesurée entre génératrices (axe 3D − DN/2), altitudes issues des propriétés (amont/aval ou profondeur).`));
    };
    clear.addEventListener('change', run);
    Dlg.open('Conflits entre réseaux', el('div', {}, el('label', { class: 'lbl' }, 'Distance minimale à respecter (mm)', clear), out));
    run();
  }

  return { calc, hydroDialog, profileOf, profileSVG, profileDialog, clashes, clashDialog, segDist };
})();
