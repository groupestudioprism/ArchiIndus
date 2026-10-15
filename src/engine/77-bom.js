/* Nomenclature : quantités calculées à partir des objets des calques VISIBLES (comme les exports SVG, DXF et PDF).
   - Réseaux (objets avec attribut net) : regroupés par calque, matériau et DN ; longueurs en mètres, tronçons = segments.
   - Équipements et poteaux (objets sym) : par calque, type et dimension, avec nombre et repères.
   - Structures (murs et poutres, attribut st) : par calque, type, profilé ou matériau et largeur ; longueurs en mètres, tronçons = segments.
   - Autres éléments : par calque, lignes et polylignes (nombre et longueur), cercles, surface des contours fermés.
   Les cotes et les textes ne sont pas comptés. */
const BOM = (() => {
  const GROUP_ORDER = { humide: 0, sec: 1, cvc: 2, metal: 3, gc: 4, structure: 5, equipement: 6, divers: 7 };
  const GROUP_NAME = { humide: 'Réseau humide', sec: 'Réseau sec', cvc: 'CVC et fluides', metal: 'Construction métallique', gc: 'Génie civil', structure: 'Structure', equipement: 'Équipement', divers: 'Divers' };

  function compute() {
    const d = Doc.get();
    const nets = new Map(), others = new Map(), syms = new Map(), structs = new Map(), techs = [];
    for (const o of d.objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible || o.sk) continue;
      if (o.props && Props.kindOf(o)) {
        const len = o.type === 'sym' ? null : (Geo.length(o) || 0) / 1000, sl = Props.slope(o);
        const what = o.net ? `Réseau DN${o.net.dn}${o.net.mat ? ' ' + o.net.mat : ''}` : o.st ? Sym.stLabel({ ...o.st, tag: '' }) : SYMBOLS[o.k].label;
        techs.push({ layer: l.name, group: l.group, what, tag: (o.net ? o.net.tag : o.st ? o.st.tag : o.tag) || '', length: len, slope: sl, data: Props.summary(o) });
      }
      if (o.net) {
        const key = `${l.id}|${o.net.mat}|${o.net.dn}`;
        let r = nets.get(key);
        if (!r) { r = { layer: l.name, group: l.group, mat: o.net.mat, dn: o.net.dn, objects: 0, segments: 0, length: 0, tags: new Set() }; nets.set(key, r); }
        r.objects++;
        r.segments += Geo.segments(o).length;
        r.length += (Geo.length(o) || 0) / 1000;
        if (o.net.tag) r.tags.add(o.net.tag);
      } else if (o.type === 'sym') {
        const key = `${l.id}|${o.k}|${o.s}`;
        let r = syms.get(key);
        if (!r) { r = { layer: l.name, group: l.group, label: SYMBOLS[o.k].label, size: o.s, count: 0, tags: new Set() }; syms.set(key, r); }
        r.count++;
        if (o.tag) r.tags.add(o.tag);
      } else if (o.st) {
        const key = `${l.id}|${o.st.kind}|${o.st.prof}|${o.st.w}`;
        let r = structs.get(key);
        if (!r) { r = { layer: l.name, group: l.group, kind: ST_KINDS[o.st.kind].label, prof: o.st.prof, w: o.st.w, objects: 0, segments: 0, length: 0, tags: new Set() }; structs.set(key, r); }
        r.objects++;
        r.segments += Geo.segments(o).length;
        r.length += (Geo.length(o) || 0) / 1000;
        if (o.st.tag) r.tags.add(o.st.tag);
      } else if (o.type === 'line' || o.type === 'poly' || o.type === 'circle') {
        let r = others.get(l.id);
        if (!r) { r = { layer: l.name, group: l.group, lines: 0, circles: 0, length: 0, area: 0 }; others.set(l.id, r); }
        if (o.type === 'circle') r.circles++; else r.lines++;
        r.length += (Geo.length(o) || 0) / 1000;
        r.area += Geo.area(o) || 0;
      }
    }
    /* composants d'assemblage : regroupés par pièce, paramètres et matériau ; fonctions 3D : volume et masse */
    const parts = new Map(), vols = [];
    for (const c of d.comps || []) {
      const l = Doc.layer(c.layer); if (!l || !l.visible) continue;
      const P = PARTS[c.part.t], desc = P.fields.map(([k, lab, kind]) => (kind === 'num' ? `${k} ${c.part[k]}` : String(c.part[k]))).join(' · ');
      const key = `${c.part.t}|${desc}|${c.mat}`;
      let r = parts.get(key);
      const V = Model.partVolume(c.part), m = matOf(c.mat);
      if (!r) { r = { label: P.label, desc, mat: m ? m.nom : c.mat, count: 0, unit: V && m ? V / 1e9 * m.rho : null }; parts.set(key, r); }
      r.count++;
    }
    for (const f of d.features || []) {
      const l = Doc.layer(f.layer); if (!l || !l.visible || f.hide) continue;
      const V = Model.featureVolume(f), m = matOf(f.mat);
      vols.push({ name: f.name, mat: m ? m.nom : '—', V: V / 1e9, mass: m ? V / 1e9 * m.rho : null });
    }
    const byGroup = (a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || a.layer.localeCompare(b.layer, 'fr');
    return {
      nets: [...nets.values()].sort((a, b) => byGroup(a, b) || b.dn - a.dn || a.mat.localeCompare(b.mat, 'fr')).map((r) => ({ ...r, tags: [...r.tags].sort() })),
      syms: [...syms.values()].sort((a, b) => byGroup(a, b) || a.label.localeCompare(b.label, 'fr') || a.size - b.size).map((r) => ({ ...r, tags: [...r.tags].sort() })),
      structs: [...structs.values()].sort((a, b) => byGroup(a, b) || a.kind.localeCompare(b.kind, 'fr') || a.prof.localeCompare(b.prof, 'fr') || a.w - b.w).map((r) => ({ ...r, tags: [...r.tags].sort() })),
      others: [...others.values()].sort(byGroup),
      techs: techs.sort(byGroup),
      parts: [...parts.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr') || a.desc.localeCompare(b.desc, 'fr')),
      vols,
    };
  }

  const f2 = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function netRow(r) { return [r.layer, r.mat || '—', String(r.dn), r.tags.join(', ') || '—', String(r.segments), f2(r.length)]; }
  function otherRow(r) { return [r.layer, GROUP_NAME[r.group] || r.group, String(r.lines), String(r.circles), f2(r.length), f2(r.area)]; }
  const symRow = (r) => [r.layer, r.label, String(r.size), r.tags.join(', ') || '—', String(r.count)];
  const stRow = (r) => [r.layer, r.kind, r.prof || '—', String(r.w), r.tags.join(', ') || '—', String(r.segments), f2(r.length)];
  const SYM_HEAD = ['Calque', 'Type', 'Dimension (mm)', 'Repères', 'Quantité'], SYM_NUM = [2, 4];
  const ST_HEAD = ['Calque', 'Type', 'Profilé / matériau', 'Largeur (mm)', 'Repères', 'Tronçons', 'Longueur (m)'], ST_NUM = [3, 5, 6];
  const TECH_HEAD = ['Calque', 'Objet', 'Repère', 'Longueur (m)', 'Pente (%)', 'Données techniques'], TECH_NUM = [3, 4];
  const techRow = (r) => [r.layer, r.what, r.tag || '—', r.length === null ? '—' : f2(r.length), r.slope === null ? '—' : f2(r.slope), r.data];
  const PART_HEAD = ['Composant', 'Paramètres (mm)', 'Matériau', 'Quantité', 'Masse unitaire (kg)', 'Masse totale (kg)'], PART_NUM = [3, 4, 5];
  const partRow = (r) => [r.label, r.desc, r.mat, String(r.count), r.unit == null ? '—' : f2(r.unit), r.unit == null ? '—' : f2(r.unit * r.count)];
  const VOL_HEAD = ['Fonction 3D', 'Matériau', 'Volume (m³)', 'Masse (kg)'], VOL_NUM = [2, 3];
  const volRow = (r) => [r.name, r.mat, f2(r.V), r.mass == null ? '—' : f2(r.mass)];
  const isEmpty = (b) => !(b.parts || []).length && !(b.vols || []).length && !b.nets.length && !b.others.length && !b.syms.length && !b.structs.length;
  const NET_HEAD = ['Calque', 'Matériau', 'DN (mm)', 'Repères', 'Tronçons', 'Longueur (m)'];
  const OTHER_HEAD = ['Calque', 'Groupe', 'Lignes / polylignes', 'Cercles', 'Longueur (m)', 'Surface fermée (m²)'];
  const NET_NUM = [2, 4, 5], OTHER_NUM = [2, 3, 4, 5];

  function totals(b) {
    return { netLength: b.nets.reduce((s, r) => s + r.length, 0), netSegments: b.nets.reduce((s, r) => s + r.segments, 0) };
  }

  function table(caption, head, rows, numCols, foot) {
    const t = el('table', { class: 'tbl' }, el('caption', {}, caption));
    t.append(el('thead', {}, el('tr', {}, ...head.map((h, i) => el('th', { class: numCols.includes(i) ? 'n' : '', scope: 'col' }, h)))));
    t.append(el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c, i) => el('td', { class: numCols.includes(i) ? 'n' : '' }, c))))));
    if (foot) t.append(el('tfoot', {}, el('tr', {}, ...foot.map((c, i) => el('td', { class: numCols.includes(i) ? 'n' : '' }, c)))));
    return t;
  }

  function show() {
    const b = compute();
    const body = el('div');
    if (isEmpty(b)) {
      body.append(el('p', { class: 'mut' }, 'Rien à compter : le dessin est vide ou tous les calques sont masqués.'));
    } else {
      body.append(el('p', { class: 'mut small' }, 'Calques visibles uniquement. Les cotes et les textes ne sont pas comptés. Longueurs mesurées sur le dessin (mm → m), sans coefficient de coupe ni raccords.'));
      if (b.nets.length) {
        const t = totals(b);
        body.append(table('Réseaux', NET_HEAD, b.nets.map(netRow), NET_NUM, ['Total', '', '', '', String(t.netSegments), f2(t.netLength)]));
      } else body.append(el('p', { class: 'mut' }, 'Aucun réseau défini (sélectionner des lignes ou polylignes, puis « Appliquer comme réseau »).'));
      if (b.syms.length) body.append(table('Équipements et poteaux', SYM_HEAD, b.syms.map(symRow), SYM_NUM, ['Total', '', '', '', String(b.syms.reduce((a, r) => a + r.count, 0))]));
      if (b.structs.length) body.append(table('Structures (murs et poutres)', ST_HEAD, b.structs.map(stRow), ST_NUM, ['Total', '', '', '', '', String(b.structs.reduce((a, r) => a + r.segments, 0)), f2(b.structs.reduce((a, r) => a + r.length, 0))]));
      if (b.parts.length) body.append(table('Composants d\'assemblage', PART_HEAD, b.parts.map(partRow), PART_NUM, ['Total', '', '', String(b.parts.reduce((a, r) => a + r.count, 0)), '', f2(b.parts.reduce((a, r) => a + (r.unit || 0) * r.count, 0))]));
      if (b.vols.length) body.append(table('Volumes des fonctions 3D', VOL_HEAD, b.vols.map(volRow), VOL_NUM, ['Total', '', f2(b.vols.reduce((a, r) => a + r.V, 0)), f2(b.vols.reduce((a, r) => a + (r.mass || 0), 0))]));
      if (b.techs.length) body.append(table('Propriétés techniques renseignées', TECH_HEAD, b.techs.map(techRow), TECH_NUM));
      if (b.others.length) body.append(table('Autres éléments par calque', OTHER_HEAD, b.others.map(otherRow), OTHER_NUM));
    }
    Dlg.open('Nomenclature', body, [{ label: 'Exporter CSV', run: () => { exportCSV(); return false; } }]);
  }

  /* CSV pour Excel en français : séparateur « ; », virgule décimale, UTF-8 avec BOM. */
  function exportCSV() {
    const b = compute();
    if (isEmpty(b)) { Status.msg('Rien à exporter : le dessin est vide ou tous les calques sont masqués.'); return; }
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [];
    if (b.nets.length) {
      lines.push(q('Réseaux'), NET_HEAD.map(q).join(';'));
      for (const r of b.nets) lines.push(netRow(r).map(q).join(';'));
      const t = totals(b);
      lines.push(['Total', '', '', '', t.netSegments, f2(t.netLength)].map(q).join(';'), '');
    }
    if (b.syms.length) {
      lines.push(q('Équipements et poteaux'), SYM_HEAD.map(q).join(';'));
      for (const r of b.syms) lines.push(symRow(r).map(q).join(';'));
      lines.push(['Total', '', '', '', b.syms.reduce((a, r) => a + r.count, 0)].map(q).join(';'), '');
    }
    if (b.structs.length) {
      lines.push(q('Structures (murs et poutres)'), ST_HEAD.map(q).join(';'));
      for (const r of b.structs) lines.push(stRow(r).map(q).join(';'));
      lines.push(['Total', '', '', '', '', b.structs.reduce((a, r) => a + r.segments, 0), f2(b.structs.reduce((a, r) => a + r.length, 0))].map(q).join(';'), '');
    }
    if (b.parts.length) {
      lines.push(q('Composants d\'assemblage'), PART_HEAD.map(q).join(';'));
      for (const r of b.parts) lines.push(partRow(r).map(q).join(';'));
      lines.push('');
    }
    if (b.vols.length) {
      lines.push(q('Volumes des fonctions 3D'), VOL_HEAD.map(q).join(';'));
      for (const r of b.vols) lines.push(volRow(r).map(q).join(';'));
      lines.push('');
    }
    if (b.techs.length) {
      lines.push(q('Propriétés techniques renseignées'), TECH_HEAD.map(q).join(';'));
      for (const r of b.techs) lines.push(techRow(r).map(q).join(';'));
      lines.push('');
    }
    if (b.others.length) {
      lines.push(q('Autres éléments par calque'), OTHER_HEAD.map(q).join(';'));
      for (const r of b.others) lines.push(otherRow(r).map(q).join(';'));
    }
    IO.download(`${IO.safeName(Doc.get().name)}-nomenclature.csv`, '\ufeff' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    Status.msg('Nomenclature envoyée vers vos téléchargements (CSV, séparateur « ; »).');
  }

  return { PART_HEAD, PART_NUM, partRow, VOL_HEAD, VOL_NUM, volRow, TECH_HEAD, TECH_NUM, techRow, compute, show, exportCSV, netRow, otherRow, symRow, stRow, SYM_HEAD, SYM_NUM, ST_HEAD, ST_NUM, isEmpty, NET_HEAD, OTHER_HEAD, NET_NUM, OTHER_NUM, totals, f2, GROUP_NAME };
})();
