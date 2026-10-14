/* Nomenclature : quantités calculées à partir des objets des calques VISIBLES (comme les exports SVG, DXF et PDF).
   - Réseaux (objets avec attribut net) : regroupés par calque, matériau et DN ; longueurs en mètres, tronçons = segments.
   - Autres éléments : par calque, lignes et polylignes (nombre et longueur), cercles, surface des contours fermés.
   Les cotes et les textes ne sont pas comptés. */
const BOM = (() => {
  const GROUP_ORDER = { humide: 0, sec: 1, structure: 2, equipement: 3, divers: 4 };
  const GROUP_NAME = { humide: 'Réseau humide', sec: 'Réseau sec', structure: 'Structure', equipement: 'Équipement', divers: 'Divers' };

  function compute() {
    const d = Doc.get();
    const nets = new Map(), others = new Map();
    for (const o of d.objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible) continue;
      if (o.net) {
        const key = `${l.id}|${o.net.mat}|${o.net.dn}`;
        let r = nets.get(key);
        if (!r) { r = { layer: l.name, group: l.group, mat: o.net.mat, dn: o.net.dn, objects: 0, segments: 0, length: 0, tags: new Set() }; nets.set(key, r); }
        r.objects++;
        r.segments += Geo.segments(o).length;
        r.length += (Geo.length(o) || 0) / 1000;
        if (o.net.tag) r.tags.add(o.net.tag);
      } else if (o.type === 'line' || o.type === 'poly' || o.type === 'circle') {
        let r = others.get(l.id);
        if (!r) { r = { layer: l.name, group: l.group, lines: 0, circles: 0, length: 0, area: 0 }; others.set(l.id, r); }
        if (o.type === 'circle') r.circles++; else r.lines++;
        r.length += (Geo.length(o) || 0) / 1000;
        r.area += Geo.area(o) || 0;
      }
    }
    const byGroup = (a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || a.layer.localeCompare(b.layer, 'fr');
    return {
      nets: [...nets.values()].sort((a, b) => byGroup(a, b) || b.dn - a.dn || a.mat.localeCompare(b.mat, 'fr')).map((r) => ({ ...r, tags: [...r.tags].sort() })),
      others: [...others.values()].sort(byGroup),
    };
  }

  const f2 = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function netRow(r) { return [r.layer, r.mat || '—', String(r.dn), r.tags.join(', ') || '—', String(r.segments), f2(r.length)]; }
  function otherRow(r) { return [r.layer, GROUP_NAME[r.group] || r.group, String(r.lines), String(r.circles), f2(r.length), f2(r.area)]; }
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
    if (!b.nets.length && !b.others.length) {
      body.append(el('p', { class: 'mut' }, 'Rien à compter : le dessin est vide ou tous les calques sont masqués.'));
    } else {
      body.append(el('p', { class: 'mut small' }, 'Calques visibles uniquement. Les cotes et les textes ne sont pas comptés. Longueurs mesurées sur le dessin (mm → m), sans coefficient de coupe ni raccords.'));
      if (b.nets.length) {
        const t = totals(b);
        body.append(table('Réseaux', NET_HEAD, b.nets.map(netRow), NET_NUM, ['Total', '', '', '', String(t.netSegments), f2(t.netLength)]));
      } else body.append(el('p', { class: 'mut' }, 'Aucun réseau défini (sélectionner des lignes ou polylignes, puis « Appliquer comme réseau »).'));
      if (b.others.length) body.append(table('Autres éléments par calque', OTHER_HEAD, b.others.map(otherRow), OTHER_NUM));
    }
    Dlg.open('Nomenclature', body, [{ label: 'Exporter CSV', run: () => { exportCSV(); return false; } }]);
  }

  /* CSV pour Excel en français : séparateur « ; », virgule décimale, UTF-8 avec BOM. */
  function exportCSV() {
    const b = compute();
    if (!b.nets.length && !b.others.length) { Status.msg('Rien à exporter : le dessin est vide ou tous les calques sont masqués.'); return; }
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [];
    if (b.nets.length) {
      lines.push(q('Réseaux'), NET_HEAD.map(q).join(';'));
      for (const r of b.nets) lines.push(netRow(r).map(q).join(';'));
      const t = totals(b);
      lines.push(['Total', '', '', '', t.netSegments, f2(t.netLength)].map(q).join(';'), '');
    }
    if (b.others.length) {
      lines.push(q('Autres éléments par calque'), OTHER_HEAD.map(q).join(';'));
      for (const r of b.others) lines.push(otherRow(r).map(q).join(';'));
    }
    IO.download(`${IO.safeName(Doc.get().name)}-nomenclature.csv`, '\ufeff' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    Status.msg('Nomenclature envoyée vers vos téléchargements (CSV, séparateur « ; »).');
  }

  return { compute, show, exportCSV, netRow, otherRow, NET_HEAD, OTHER_HEAD, NET_NUM, OTHER_NUM, totals, f2, GROUP_NAME };
})();
