/* ============ Poste CAO : fonctions volumiques (noyau OpenCascade), équations, propriétés de masse, interférences, mise en plan,
   exports STEP / STL, sélection dans la vue 3D, esquisse sur face, barre contextuelle, barre de raccourcis (touche S),
   arbre de création avec barre de retour arrière et réorganisation des fonctions. ============
   Les fonctions sont stockées dans Doc.features (ordre = ordre de reconstruction) ; Model.kernelInput les traduit pour le noyau. */
const Cad = (() => {
  const nf = (v, dg = 0) => (v == null || !Number.isFinite(v) ? '—' : fmtFR(v, dg, dg));
  const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  const feats = () => Doc.get().features || [];
  const featById = (id) => feats().find((f) => f.id === id) || null;
  const refresh = () => Workbench.refresh();

  /* ---------- champ numérique acceptant une formule ---------- */
  function numField(label, f0, key, def, unit = 'mm', hint = '') {
    const cur = f0 && f0.ex && f0.ex[key] ? '=' + f0.ex[key] : String(f0 && f0[key] != null ? +(+f0[key]).toFixed(6) : def);
    const inp = el('input', { class: 'fld fx', type: 'text', inputmode: 'decimal', value: cur, 'aria-label': `${label} (${unit})`, 'data-k': key, spellcheck: 'false', autocomplete: 'off' });
    const out = el('small', { class: 'fx-v', 'aria-live': 'polite' });
    const show = () => {
      try { const r = Expr.evalText(inp.value, Doc.get().vars); out.textContent = r.expr ? `= ${nf(r.v, 3)} ${unit}` : ''; out.classList.remove('bad'); }
      catch (e) { out.textContent = e.message; out.classList.add('bad'); }
    };
    inp.addEventListener('input', show); show();
    return { node: el('label', { class: 'lbl' }, `${label} (${unit})`, inp, out, hint ? el('span', { class: 'mut small' }, hint) : ''), key,
      read() { const r = Expr.evalText(inp.value, Doc.get().vars); return r; } };
  }
  /* applique les champs lus à la fonction f (valeur + formule éventuelle) ; lève une Error avec le libellé fautif */
  function readFields(fields, f) {
    const vals = {};
    for (const fd of fields) {
      let r; try { r = fd.read(); } catch (e) { throw new Error(`${fd.node.firstChild.textContent} : ${e.message}`); }
      const [a, b] = FEATURE_NUM[fd.key];
      if (!(r.v >= a && r.v <= b)) throw new Error(`${fd.node.firstChild.textContent} : entre ${a} et ${b}`);
      vals[fd.key] = r;
    }
    for (const [k, r] of Object.entries(vals)) {
      f[k] = k === 'n' ? Math.round(r.v) : r.v;
      if (r.expr) { f.ex = f.ex || {}; f.ex[k] = r.expr; } else if (f.ex) { delete f.ex[k]; if (!Object.keys(f.ex).length) delete f.ex; }
    }
  }
  const sel = (label, opts, cur, attrs = {}) => el('label', { class: 'lbl' }, label, el('select', { 'aria-label': label, ...attrs }, ...Object.entries(opts).map(([v, t]) => el('option', { value: v, selected: String(v) === String(cur) }, t))));
  const check = (label, on, attrs = {}) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', ...attrs, checked: !!on }), el('span', {}, label));
  const featOpts = (filter, none) => { const o = none ? { 0: none } : {}; for (const f of feats()) if (!filter || filter(f)) o[f.id] = `${f.name}`; return o; };
  const matSelect = (cur) => { const s = el('select', { 'aria-label': 'Matériau' }, el('option', { value: '' }, '— aucun —')); for (const cat of MAT_CATS) { const og = el('optgroup', { label: cat }); for (const [id, m] of Object.entries(MATS)) if (m.cat === cat) og.append(el('option', { value: id, selected: id === cur }, m.nom)); if (og.childNodes.length) s.append(og); } return s; };

  /* ---------- création / modification d'une fonction ---------- */
  function dialog(type, edit) {
    const d = Doc.get(), sks = d.sketches || [];
    if (SKETCH_FEATURES.includes(type) && !sks.length) { Status.msg('Créez d\'abord une esquisse (onglet Esquisse → Nouvelle esquisse) avec un contour fermé.', 7000); return; }
    if (['fillet', 'chamfer', 'shell', 'pattern', 'mirror'].includes(type) && !feats().length) { Status.msg('Commencez par un bossage extrudé : cette fonction modifie un corps existant.', 7000); return; }
    const f0 = edit || { type, d: 1000, dir: '+', ang: 360, r: 5, t: 3, n: 3, step: 500, off: 0, e: 0, bend: 0, sel: 'all', face: 'top', kind: 'lin', ax: 'x', plane: 'YZ', mat: '', layer: d.active,
      sk: state.sketch || (state.treeSel && state.treeSel.t === 's' ? state.treeSel.id : sks.length ? sks[sks.length - 1].id : 0) };
    const body = el('div', { class: 'frm' }), fields = [], extra = {};
    if (SKETCH_FEATURES.includes(type)) {
      extra.sk = el('select', { 'aria-label': 'Esquisse' }, ...sks.map((s) => el('option', { value: s.id, selected: s.id === f0.sk }, `${s.name} · ${PLANES[s.plane].label} · ${Model.loops(s.id).length} contour(s)`)));
      body.append(el('label', { class: 'lbl' }, 'Esquisse', extra.sk));
    }
    if (type === 'extrude' || type === 'cut') {
      const fd = numField('Profondeur', f0, 'd', 1000); fields.push(fd); body.append(fd.node);
      body.append(extra.dir = sel('Sens', { '+': 'Sens de la normale', '-': 'Sens opposé', mid: 'Plan milieu (symétrique)' }, f0.dir));
      if (type === 'cut') body.append(extra.through = check('À travers tout (perçage débouchant)', f0.through));
      else body.append(extra.newBody = check('Nouveau corps (ne pas fusionner)', f0.newBody));
    }
    if (type === 'revolve') {
      extra.axis = el('select', { 'aria-label': 'Ligne d\'axe' });
      const fill = () => { extra.axis.textContent = ''; const ls = d.objects.filter((o) => o.sk === +extra.sk.value && o.type === 'line'); for (const o of ls) extra.axis.append(el('option', { value: o.id, selected: o.id === f0.axis }, `Ligne #${o.id} (${fmt(G.dist(o.a, o.b))} mm)`)); if (!ls.length) extra.axis.append(el('option', { value: '' }, '— aucune ligne dans l\'esquisse —')); };
      extra.sk.addEventListener('change', fill); fill();
      body.append(el('label', { class: 'lbl' }, 'Ligne d\'axe (dans l\'esquisse)', extra.axis));
      const fd = numField('Angle', f0, 'ang', 360, '°'); fields.push(fd); body.append(fd.node);
      body.append(extra.op = sel('Opération', { add: 'Ajout de matière', cut: 'Enlèvement de matière' }, f0.op || 'add'));
      body.append(extra.newBody = check('Nouveau corps (ne pas fusionner)', f0.newBody));
    }
    if (type === 'fillet' || type === 'chamfer') {
      const fd = numField(type === 'fillet' ? 'Rayon' : 'Distance', f0, 'r', 5); fields.push(fd); body.append(fd.node);
      body.append(extra.sel = sel('Arêtes', EDGE_SEL, f0.sel));
      body.append(extra.target = sel('Corps', featOpts((f) => f.type === 'extrude' || f.type === 'revolve' || f.type === 'pipe', 'Dernier corps'), f0.target || 0));
    }
    if (type === 'shell') {
      const fd = numField('Épaisseur', f0, 't', 3); fields.push(fd); body.append(fd.node);
      body.append(extra.face = sel('Face retirée (ouverture)', FACE_SEL, f0.face));
    }
    if (type === 'pattern') {
      body.append(extra.src = sel('Fonction à répéter', featOpts((f) => (edit ? f.id !== edit.id : true) && ['extrude', 'cut', 'revolve', 'pipe'].includes(f.type)), f0.src || ''));
      body.append(extra.kind = sel('Type', { lin: 'Linéaire (suivant un axe)', circ: 'Circulaire (autour d\'un axe)' }, f0.kind));
      body.append(extra.ax = sel('Axe', { x: 'X', y: 'Y', z: 'Z' }, f0.ax));
      const n = numField('Nombre d\'occurrences (original compris)', f0, 'n', 3, 'u.'); fields.push(n); body.append(n.node);
      const st = numField('Pas (linéaire)', f0, 'step', 500); fields.push(st); body.append(st.node);
      const an = numField('Angle total (circulaire)', f0, 'ang', 360, '°'); fields.push(an); body.append(an.node);
      extra.o = el('input', { class: 'fld', type: 'text', value: (f0.o || [0, 0, 0]).join(' ; '), 'aria-label': 'Centre de rotation x ; y ; z en millimètres' });
      body.append(el('label', { class: 'lbl' }, 'Centre (circulaire) x ; y ; z (mm)', extra.o));
    }
    if (type === 'mirror') {
      body.append(extra.src = sel('Fonction à symétriser', featOpts((f) => (edit ? f.id !== edit.id : true) && ['extrude', 'cut', 'revolve', 'pipe'].includes(f.type), 'Corps entier (dernier corps)'), f0.src || 0));
      body.append(extra.plane = sel('Plan de symétrie', { YZ: 'Plan Y·Z (x = constante)', XZ: 'Plan X·Z (y = constante)', XY: 'Plan X·Y (z = constante)' }, f0.plane));
      const of = numField('Position du plan', f0, 'off', 0); fields.push(of); body.append(of.node);
    }
    if (type === 'pipe') {
      const fd = numField('Rayon extérieur', f0, 'r', 50); fields.push(fd); body.append(fd.node);
      const e = numField('Épaisseur de paroi (0 = plein)', f0, 'e', 0); fields.push(e); body.append(e.node);
      const b = numField('Rayon de cintrage des coudes (0 = coudes vifs)', f0, 'bend', 0); fields.push(b); body.append(b.node);
    }
    extra.mat = matSelect(f0.mat); body.append(el('label', { class: 'lbl' }, 'Matériau', extra.mat));
    const lay = el('select', { 'aria-label': 'Calque' }, ...d.layers.map((l) => el('option', { value: l.id, selected: l.id === f0.layer }, l.name)));
    body.append(el('label', { class: 'lbl' }, 'Calque', lay));
    const help = {
      extrude: 'Contours fermés de l\'esquisse : polylignes fermées, rectangles, cercles. Un contour intérieur fait un trou.',
      cut: 'Enlève la matière de tous les corps traversés : perçages, rainures, lumières. « À travers tout » perce de part en part.',
      revolve: 'Une ligne de l\'esquisse sert d\'axe ; les contours fermés d\'un seul côté de cette ligne tournent autour.',
      fillet: 'Arrondit les arêtes choisies. Un rayon trop grand pour l\'arête la plus courte est refusé par le noyau.',
      chamfer: 'Casse les arêtes choisies à 45°.',
      shell: 'Évide le corps en gardant une paroi d\'épaisseur constante, ouvert sur la face choisie.',
      pattern: 'Recopie une fonction (bossage, enlèvement, révolution, tuyau) suivant un axe ou autour d\'un axe.',
      mirror: 'Recopie une fonction, ou le corps entier, par symétrie.',
      pipe: 'Balaye une section circulaire le long du réseau sélectionné dans le plan (altitudes amont et aval comprises).',
    }[type];
    body.append(el('p', { class: 'mut small' }, help, ' Les champs acceptent des formules : =L/2, =2*R+10 (variables : onglet Fonctions 3D → Équations).'));
    Dlg.open(`${edit ? 'Modifier : ' : ''}${FEATURE_TYPES[type]}`, body, [{ label: edit ? 'Appliquer' : 'Créer la fonction', primary: true, run: () => {
      const tmp = {};
      try { readFields(fields, tmp); } catch (e) { Status.msg(e.message, 7000); return false; }
      if (SKETCH_FEATURES.includes(type)) {
        const n = Model.loops(+extra.sk.value, type === 'revolve' ? +extra.axis.value : 0).length;
        if (!n) { Status.msg('Aucun contour fermé dans cette esquisse : dessinez une polyligne fermée, un rectangle ou un cercle.', 7000); return false; }
        if (type === 'revolve' && !(+extra.axis.value)) { Status.msg('Choisissez une ligne d\'axe.', 6000); return false; }
      }
      if ((type === 'pattern') && !(+extra.src.querySelector('select').value)) { Status.msg('Choisissez la fonction à répéter.', 6000); return false; }
      let o3 = null;
      if (type === 'pattern') { o3 = extra.o.value.split(/[;\s]+/).filter(Boolean).map((x) => Number(x.replace(',', '.'))); if (o3.length !== 3 || !o3.every(Number.isFinite)) { Status.msg('Centre : trois nombres x ; y ; z.', 6000); return false; } }
      let fid = edit ? edit.id : 0;
      Doc.mutate((dd) => {
        dd.features = dd.features || [];
        let f = edit ? dd.features.find((x) => x.id === edit.id) : null;
        if (!f) {
          fid = dd.nextF++; f = { id: fid, type, name: `${FEATURE_TYPES[type]} ${fid}`, hide: false };
          /* insertion à la barre de retour arrière si elle est placée, sinon à la fin */
          if (dd.rollback != null) { dd.features.splice(dd.rollback, 0, f); dd.rollback++; } else dd.features.push(f);
        }
        if (f.ex) f.ex = { ...f.ex };
        readFields(fields, f);
        f.mat = extra.mat.value; f.layer = +lay.value;
        if (extra.sk) f.sk = +extra.sk.value;
        if (extra.dir) f.dir = extra.dir.querySelector('select').value;
        if (extra.through) f.through = extra.through.querySelector('input').checked;
        if (extra.newBody) f.newBody = extra.newBody.querySelector('input').checked;
        if (extra.axis) f.axis = +extra.axis.value;
        if (extra.op) f.op = extra.op.querySelector('select').value;
        if (extra.sel) f.sel = extra.sel.querySelector('select').value;
        if (extra.target) f.target = +extra.target.querySelector('select').value;
        if (extra.face) f.face = extra.face.querySelector('select').value;
        if (extra.src) f.src = +extra.src.querySelector('select').value;
        if (extra.kind) f.kind = extra.kind.querySelector('select').value;
        if (extra.ax) f.ax = extra.ax.querySelector('select').value;
        if (extra.plane) f.plane = extra.plane.querySelector('select').value;
        if (o3) f.o = o3;
        if (type === 'pipe' && !f.obj && edit) f.obj = edit.obj;
        Model.applyExpr(dd);
      });
      after(fid);
    } }]);
  }
  /* après création ou modification : sélection, vue 3D, reconstruction et compte rendu */
  function after(fid) {
    state.sketch = 0; state.treeSel = { t: 'f', id: fid }; Tools.selection.clear();
    if (window.Scene3D) { Workbench.setTab('model'); View3D.setMode(true); }
    refresh();
    Kernel.update().then((r) => {
      const f = featById(fid); if (!f) return;
      const err = Kernel.errorOf(fid);
      if (err) Status.msg(`${f.name} : ${err}`, 10000);
      else if (r) { const b = Kernel.bodyOfFeature(fid); Status.msg(`${f.name} : ${b ? `corps « ${b.name} », volume ${nf(b.props.volume / 1e9, 4)} m³` : 'appliquée'}.`, 6000); }
      Workbench.renderTree(); UI.renderProps();
    });
  }

  /* Tuyauterie 3D : une fonction « tuyau » par réseau sélectionné dans le plan (section suivant le DN). */
  function pipesFromSelection() {
    const ids = new Set(Tools.selection), d = Doc.get();
    const nets = d.objects.filter((o) => ids.has(o.id) && o.net && (o.type === 'line' || o.type === 'poly'));
    if (!nets.length) { Status.msg('Sélectionnez dans le plan un ou plusieurs réseaux (lignes ou polylignes avec un DN), puis « Tuyauterie 3D ».', 8000); return; }
    let last = 0;
    Doc.mutate((dd) => {
      for (const o of nets) {
        const dn = o.net.dn, id = dd.nextF++;
        dd.features.push({ id, type: 'pipe', name: `Tuyau ${o.net.tag || '#' + o.id} DN${dn}`, obj: o.id, r: dn / 2, e: Math.max(1, Math.round(dn / 25 * 10) / 10), bend: o.type === 'poly' && o.pts.length > 2 ? 1.5 * dn : 0, mat: o.mat || '', layer: o.layer, hide: false });
        last = id;
      }
    });
    Status.msg(`${nets.length} tuyau(x) créé(s) : section suivant le DN, paroi DN/25, coudes à 1,5 × DN (modifiables).`, 7000);
    after(last);
  }

  /* ---------- équations (variables du projet) ---------- */
  function varsDialog() {
    const rows = el('tbody');
    const rowOf = (v) => {
      const n = el('input', { class: 'fld', type: 'text', value: v.n || '', 'aria-label': 'Nom', maxlength: 31, spellcheck: 'false' });
      const e = el('input', { class: 'fld fx', type: 'text', value: v.e || '', 'aria-label': 'Formule', spellcheck: 'false' });
      const note = el('input', { class: 'fld', type: 'text', value: v.note || '', 'aria-label': 'Remarque', maxlength: 80 });
      const val = el('td', { class: 'n' }), del = el('button', { type: 'button', class: 'ibs', 'aria-label': 'Supprimer la variable', title: 'Supprimer' }, '✕');
      const tr = el('tr', {}, el('td', {}, n), el('td', {}, e), val, el('td', {}, note), el('td', {}, del));
      del.addEventListener('click', () => { tr.remove(); upd(); });
      for (const i of [n, e]) i.addEventListener('input', upd);
      return tr;
    };
    const read = () => [...rows.children].map((tr) => { const i = tr.querySelectorAll('input'); return { n: i[0].value.trim(), e: i[1].value.trim().replace(/^=\s*/, ''), note: i[2].value.trim() }; });
    function upd() {
      const vs = read().filter((v) => v.n), { vals, errs } = Expr.solve(vs), seen = new Set();
      [...rows.children].forEach((tr) => {
        const i = tr.querySelectorAll('input'), n = i[0].value.trim(), c = tr.children[2];
        let msg = '';
        if (n && !Expr.validName(n)) msg = 'nom invalide';
        else if (n && seen.has(n)) msg = 'nom en double';
        else if (errs.has(n)) msg = errs.get(n);
        seen.add(n);
        c.textContent = msg || (vals.has(n) ? nf(vals.get(n), 4) : '');
        c.classList.toggle('bad', !!msg);
      });
    }
    for (const v of Doc.get().vars || []) rows.append(rowOf(v));
    const add = el('button', { type: 'button', class: 'btn' }, '+ Variable');
    add.addEventListener('click', () => { rows.append(rowOf({ n: '', e: '' })); upd(); rows.lastChild.querySelector('input').focus(); });
    upd();
    const usedBy = feats().filter((f) => f.ex).map((f) => `${f.name} : ${Object.entries(f.ex).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
    Dlg.open('Équations · variables du projet', el('div', {},
      el('table', { class: 'tbl vars' }, el('thead', {}, el('tr', {}, el('th', {}, 'Nom'), el('th', {}, 'Formule'), el('th', { class: 'n' }, 'Valeur'), el('th', {}, 'Remarque'), el('th', {}))), rows), add,
      el('p', { class: 'mut small' }, 'Exemples : L = 1200 · H = L/3 · R = sqrt(L^2 + H^2)/10. Dans les fonctions, tapez =L/2 dans un champ : la valeur suit la variable. Fonctions : sqrt, abs, min, max, round, sin, cos, tan (degrés), pi.'),
      usedBy.length ? el('details', {}, el('summary', {}, `Champs pilotés (${usedBy.length})`), el('ul', { class: 'small' }, ...usedBy.map((t) => el('li', {}, t)))) : ''),
    [{ label: 'Appliquer', primary: true, run: () => {
      const vs = read().filter((v) => v.n || v.e);
      const names = new Set();
      for (const v of vs) {
        if (!Expr.validName(v.n)) { Status.msg(`Nom de variable invalide : « ${v.n || '(vide)'} ». Lettres, chiffres, _ (31 caractères).`, 7000); return false; }
        if (names.has(v.n)) { Status.msg(`Variable « ${v.n} » en double.`, 6000); return false; }
        if (!v.e) { Status.msg(`Formule vide pour « ${v.n} ».`, 6000); return false; }
        names.add(v.n);
      }
      const { errs } = Expr.solve(vs);
      if (errs.size) { const [n, m] = [...errs][0]; Status.msg(`Variable « ${n} » : ${m}`, 8000); return false; }
      Doc.mutate((dd) => { dd.vars = vs; Model.applyExpr(dd); });
      const bad = Object.entries(state.exprErr || {});
      Status.msg(bad.length ? `Équations appliquées, ${bad.length} champ(s) en erreur : ${bad[0][1]}` : `Équations appliquées (${vs.length} variable(s)).`, 7000);
      refresh();
    } }]);
  }

  /* ---------- propriétés de masse ---------- */
  async function massDialog() {
    const d = Doc.get(), body = el('div', {}, el('p', { class: 'mut' }, 'Calcul par le noyau OpenCascade…'));
    const dlg = Dlg.open('Propriétés de masse', body);
    const rowsOut = [];
    let r = null;
    if ((d.features || []).length) r = await Kernel.update();
    body.textContent = '';
    let M = 0, Mx = 0, My = 0, Mz = 0;
    const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...['Élément', 'Matériau', 'Volume (dm³)', 'Masse (kg)', 'Centre de gravité x ; y ; z (mm)', 'Surface (m²)'].map((h, i) => el('th', { class: i > 1 ? 'n' : '' }, h)))));
    const tb = el('tbody'); t.append(tb);
    if (r) for (const b of r.bodies) {
      const m = matOf(b.mat), mass = m ? b.props.volume / 1e9 * m.rho : null;
      if (mass) { M += mass; Mx += mass * b.props.cog[0]; My += mass * b.props.cog[1]; Mz += mass * b.props.cog[2]; }
      rowsOut.push({ b, mass, rho: m ? m.rho : null });
      tb.append(el('tr', {}, el('td', {}, b.name), el('td', {}, m ? m.nom : '— (densité inconnue)'), el('td', { class: 'n' }, nf(b.props.volume / 1e6, 3)), el('td', { class: 'n' }, mass ? nf(mass, 2) : '—'),
        el('td', { class: 'n' }, b.props.cog.map((v) => nf(v, 1)).join(' ; ')), el('td', { class: 'n' }, nf(b.props.area / 1e6, 4))));
    }
    /* composants d'assemblage : volumes analytiques */
    if (d.comps && d.comps.length) {
      const R = Model.resolve(d.comps);
      for (const c of d.comps) {
        const V = Model.partVolume(c.part), m = matOf(c.mat), mass = V && m ? V / 1e9 * m.rho : null, bx = Model.worldBox(c, R.pos.get(c.id));
        const cg = [(bx[0] + bx[3]) / 2, (bx[1] + bx[4]) / 2, (bx[2] + bx[5]) / 2];
        if (mass) { M += mass; Mx += mass * cg[0]; My += mass * cg[1]; Mz += mass * cg[2]; }
        tb.append(el('tr', {}, el('td', {}, `${c.name} (composant)`), el('td', {}, m ? m.nom : '—'), el('td', { class: 'n' }, V ? nf(V / 1e6, 3) : '—'), el('td', { class: 'n' }, mass ? nf(mass, 2) : '—'), el('td', { class: 'n' }, cg.map((v) => nf(v, 0)).join(' ; ') + ' *'), el('td', { class: 'n' }, '—')));
      }
    }
    if (!tb.children.length) { body.append(el('p', {}, 'Aucun corps ni composant : créez une fonction 3D ou insérez un composant.')); return; }
    tb.append(el('tr', { class: 'lot' }, el('td', { colspan: 3 }, 'Ensemble'), el('td', { class: 'n' }, nf(M, 2)), el('td', { class: 'n' }, M ? [Mx / M, My / M, Mz / M].map((v) => nf(v, 1)).join(' ; ') : '—'), el('td', {})));
    body.append(el('div', { class: 'tbl-wrap' }, t));
    /* inerties du corps sélectionné ou du premier */
    const one = rowsOut.find((x) => state.treeSel && state.treeSel.t === 'f' && x.b.fids.includes(state.treeSel.id)) || rowsOut[0];
    if (one && one.b.props.inertia && one.rho) {
      const I = one.b.props.inertia.map((row) => row.map((v) => v * one.rho * 1e-15));   /* mm⁵ × kg/m³ → kg·m² */
      body.append(el('h3', { class: 'h3' }, `Matrice d'inertie de « ${one.b.name} » au centre de gravité (kg·m²)`),
        el('table', { class: 'tbl mono' }, el('tbody', {}, ...I.map((row, i) => el('tr', {}, el('th', {}, 'XYZ'[i]), ...row.map((v) => el('td', { class: 'n' }, nf(v, 5))))))));
    }
    body.append(el('p', { class: 'mut small' }, 'Corps : volumes, centres de gravité et surfaces exacts (OpenCascade) ; inertie intégrée sur un maillage fin. * Composants : centre de la boîte englobante. Masses : masse volumique du matériau affecté (bibliothèque).'));
    return dlg;
  }

  /* ---------- interférences ---------- */
  function interfDialog() {
    const clear = el('input', { class: 'fld', type: 'number', min: 0, max: 10000, step: 'any', value: 0, 'aria-label': 'Jeu minimal en millimètres' });
    const out = el('div', { class: 'tbl-wrap' });
    const run = async () => {
      out.textContent = 'Calcul des volumes communs…';
      try {
        const r = await Kernel.interferences(Number(clear.value) || 0);
        out.textContent = '';
        if (!r.hits.length) { out.append(el('p', { class: 'ok' }, `Aucune interférence entre les ${r.n} volumes contrôlés${Number(clear.value) ? ` (jeu minimal ${clear.value} mm respecté)` : ''}.`)); return; }
        out.append(el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'Élément A'), el('th', {}, 'Élément B'), el('th', { class: 'n' }, 'Volume commun (cm³)'), el('th', { class: 'n' }, 'Jeu (mm)'))),
          el('tbody', {}, ...r.hits.map((h) => el('tr', { class: h.vol > 0 ? 'bad' : '' }, el('td', {}, h.an), el('td', {}, h.bn), el('td', { class: 'n' }, h.vol > 0 ? nf(h.vol / 1000, 2) : '—'), el('td', { class: 'n' }, h.gap != null ? nf(h.gap, 1) : '0'))))));
        out.append(el('p', { class: 'mut small' }, `${r.hits.length} conflit(s) sur ${r.n} volumes : corps 3D, composants d'assemblage, réseaux, murs, poutres et équipements des calques visibles.`));
      } catch (e) { out.textContent = 'Calcul impossible : ' + e.message; }
    };
    const b = el('button', { type: 'button', class: 'btn pri' }, 'Détecter');
    b.addEventListener('click', run);
    Dlg.open('Détection des interférences', el('div', {}, el('div', { class: 'row2b' }, el('label', { class: 'lbl' }, 'Jeu minimal à respecter (mm, 0 = contact seul)', clear), b), out));
    run();
  }

  /* ---------- exports volumiques ---------- */
  async function exportCAD(fmt) {
    if (!Lic.need()) return;
    const d = Doc.get();
    if (!(d.features || []).length && !(d.comps || []).length && !d.objects.some((o) => o.net || o.st)) { Status.msg('Rien à exporter en 3D.'); return; }
    Status.msg(`Export ${fmt.toUpperCase()} : calcul par le noyau OpenCascade…`, 20000);
    try {
      const bytes = await Kernel.exportFile(fmt, true);
      IO.download(`${IO.safeName(d.name)}.${fmt === 'step' ? 'step' : 'stl'}`, bytes, fmt === 'step' ? 'application/step' : 'model/stl');
      Status.msg(`Fichier ${fmt.toUpperCase()} envoyé vers vos téléchargements (mm) : corps 3D, composants, réseaux et structures des calques visibles.`, 8000);
    } catch (e) { Status.msg('Export impossible : ' + e.message, 9000); }
  }

  /* ---------- mise en plan (vues 2D issues du modèle 3D) ---------- */
  async function drawingDialog() {
    const r = await Kernel.update();
    if (!r || !r.bodies.length) { Status.msg('Mise en plan : créez d\'abord un corps 3D (fonctions 3D).', 7000); return; }
    const bsel = el('select', { 'aria-label': 'Corps' }, ...r.bodies.map((b) => el('option', { value: b.key }, b.name)));
    const sc = el('select', { 'aria-label': 'Échelle' }, ...SCALES.map((x) => el('option', { value: x, selected: x === fitScale(r.bodies[0]) }, x)));
    bsel.addEventListener('change', () => { sc.value = fitScale(r.bodies.find((b) => b.key === bsel.value)); });
    const hid = el('input', { type: 'checkbox', checked: true });
    const zone = el('div', { class: 'mp-zone' }, 'Projection…');
    let svgText = '';
    const draw = async () => {
      zone.textContent = 'Projection des arêtes vues et cachées…';
      try {
        const v = await Kernel.views(bsel.value, ['front', 'top', 'left']);
        svgText = sheetSVG(v, r.bodies.find((b) => b.key === bsel.value), sc.value, hid.checked);
        zone.innerHTML = svgText;   /* SVG produit par l'app (chemins du noyau, textes échappés) */
      } catch (e) { zone.textContent = 'Projection impossible : ' + e.message; }
    };
    for (const x of [bsel, sc, hid]) x.addEventListener('change', draw);
    Dlg.open('Mise en plan', el('div', {}, el('div', { class: 'row3' }, el('label', { class: 'lbl' }, 'Corps', bsel), el('label', { class: 'lbl' }, 'Échelle', sc), el('label', { class: 'chk' }, hid, el('span', {}, 'Arêtes cachées en pointillés'))), zone,
      el('p', { class: 'mut small' }, 'Projection européenne : vue de face, vue de dessus en dessous, vue de gauche à droite. Les vues sont recalculées depuis le modèle à chaque ouverture ; encombrements cotés automatiquement, échelle proposée pour tenir sur un A3.')),
    [{ label: 'Télécharger (SVG)', primary: true, run: () => { if (!svgText || !Lic.need()) return false; IO.download(`${IO.safeName(Doc.get().name)}-mise-en-plan.svg`, svgText, 'image/svg+xml'); return false; } }]);
    draw();
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* Feuille A3 paysage, projection européenne : vue de face en haut à gauche, vue de dessus en dessous, vue de gauche à droite.
     Les chemins du noyau sont déjà en coordonnées SVG (y vers le bas) ; leur boîte est donnée en coordonnées du modèle. */
  const SCALES = ['5:1', '2:1', '1:1', '1:2', '1:5', '1:10', '1:20', '1:25', '1:50', '1:100', '1:200', '1:500'];
  function fitScale(b) {
    const bx = b.props.bbox, L = bx[3] - bx[0], P = bx[4] - bx[1], Hh = bx[5] - bx[2];
    for (const sc of SCALES) { const [n, dd] = sc.split(':').map(Number), k = n / dd; if ((L + P) * k + 20 <= 360 && (Hh + P) * k + 20 <= 220) return sc; }
    return '1:500';
  }
  function sheetSVG(v, b, scale, hidden) {
    const [n, dd] = scale.split(':').map(Number), k = n / dd;   /* mm papier par mm réel */
    const W = 420, H = 297, bx = b.props.bbox, L = bx[3] - bx[0], P = bx[4] - bx[1], Hh = bx[5] - bx[2];
    const gap = 20, x0 = 30, y0 = 28;
    const place = (vw, ox, oy) => {
      const [[a0, b0], [a1, b1]] = vw.box || [[0, 0], [0, 0]], tr = `translate(${ox - a0 * k} ${oy + b1 * k}) scale(${k})`;
      const vis = vw.visible.map((d) => `<path d="${d}"/>`).join(''), hd = hidden ? vw.hidden.map((d) => `<path d="${d}"/>`).join('') : '';
      return { g: `<g transform="${tr}"><g class="v">${vis}</g><g class="h">${hd}</g></g>`, w: (a1 - a0) * k, h: (b1 - b0) * k };
    };
    const fr = place(v.front, x0, y0), tp = place(v.top, x0, y0 + fr.h + gap), lf = place(v.left, x0 + fr.w + gap, y0);
    const dim = (x1, y1, x2, y2, txt, vert) => {
      const off = 7;
      return vert ? `<g class="d"><line x1="${x1 - off}" y1="${y1}" x2="${x1 - off}" y2="${y2}"/><line x1="${x1 - off - 1.5}" y1="${y1}" x2="${x1 - 1}" y2="${y1}"/><line x1="${x1 - off - 1.5}" y1="${y2}" x2="${x1 - 1}" y2="${y2}"/><text x="${x1 - off - 1.5}" y="${(y1 + y2) / 2}" transform="rotate(-90 ${x1 - off - 1.5} ${(y1 + y2) / 2})" text-anchor="middle">${txt}</text></g>`
        : `<g class="d"><line x1="${x1}" y1="${y1 - off}" x2="${x2}" y2="${y1 - off}"/><line x1="${x1}" y1="${y1 - off - 1.5}" x2="${x1}" y2="${y1 - 1}"/><line x1="${x2}" y1="${y1 - off - 1.5}" x2="${x2}" y2="${y1 - 1}"/><text x="${(x1 + x2) / 2}" y="${y1 - off - 1.5}" text-anchor="middle">${txt}</text></g>`;
    };
    const dims = dim(x0, y0, x0 + fr.w, y0, nf(L, 1)) + dim(x0, y0, x0, y0 + fr.h, nf(Hh, 1), true) + dim(x0, y0 + fr.h + gap, x0, y0 + fr.h + gap + tp.h, nf(P, 1), true);
    const lab = (x, y, t) => `<text x="${x}" y="${y}" class="lb">${t}</text>`;
    const labels = lab(x0, y0 + fr.h + 5, 'FACE') + lab(x0, y0 + fr.h + gap + tp.h + 5, 'DESSUS') + lab(x0 + fr.w + gap, y0 + lf.h + 5, 'GAUCHE');
    const d = Doc.get(), s = d.sheet || {};
    const sym = `<g class="c" transform="translate(${W - 222} ${H - 40})"><path d="M0 4h8l6-4v16l-6-4H0zM18 8h12" fill="none"/><circle cx="28" cy="8" r="6" fill="none"/><circle cx="28" cy="8" r="2.5" fill="none"/></g>`;
    const cart = `<g class="c"><rect x="${W - 200}" y="${H - 44}" width="190" height="34"/><line x1="${W - 200}" y1="${H - 28}" x2="${W - 10}" y2="${H - 28}"/>
      <text x="${W - 196}" y="${H - 33}" class="t">${esc(d.name)} · ${esc(b.name)}</text><text x="${W - 196}" y="${H - 21}">ARCHIINDUS · Studio Prism · échelle ${scale} · cotes en mm</text><text x="${W - 196}" y="${H - 14}">${esc(s.client || '')} ${esc(s.ref || '')} · indice ${esc(s.rev || 'A')} · ${new Date().toLocaleDateString('fr-FR')}</text></g>`;
    const big = fr.w + gap + lf.w > W - 40 || fr.h + gap + tp.h > H - 60;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" class="mp-sheet"><style>.v path{fill:none;stroke:#111;stroke-width:${0.35 / k}}.h path{fill:none;stroke:#777;stroke-width:${0.18 / k};stroke-dasharray:${2 / k} ${1 / k}}.d line{stroke:#0877B9;stroke-width:.2}.d text,.c text,.lb{font:3px sans-serif;fill:#0877B9}.lb{fill:#111;font-weight:700;letter-spacing:.3px}.c rect,.c line,.c path,.c circle{fill:none;stroke:#111;stroke-width:.35}.c text{fill:#111}.c .t{font-weight:700;font-size:4px}.warn{font:4px sans-serif;fill:#B3261E}</style>
      <rect x="5" y="5" width="${W - 10}" height="${H - 10}" fill="#fff" stroke="#111" stroke-width=".5"/>${fr.g}${tp.g}${lf.g}${dims}${labels}${sym}${cart}${big ? `<text x="12" y="${H - 12}" class="warn">Les vues dépassent la feuille : choisissez une échelle plus petite.</text>` : ''}</svg>`;
  }

  /* ---------- arbre : fonctions, barre de retour arrière, réorganisation ---------- */
  const ICON = { extrude: 'M4 9l8-4 8 4-8 4zM4 9v8l8 4 8-4V9M12 13v8', cut: 'M4 9l8-4 8 4-8 4zM4 9v8l8 4 8-4V9M9 11l6 3', revolve: 'M12 3v18M6 8a6 2.5 0 1 0 12 0M6 16a6 2.5 0 0 0 12 0M6 8v8M18 8v8',
    fillet: 'M4 20V10a6 6 0 0 1 6-6h10', chamfer: 'M4 20V9l5-5h11', shell: 'M4 7l8-4 8 4v10l-8 4-8-4zM8 9v6l4 2 4-2V9', pattern: 'M3 8h4v8H3zM10 8h4v8h-4zM17 8h4v8h-4z',
    mirror: 'M12 3v18M4 7l5 5-5 5zM20 7l-5 5 5 5z', pipe: 'M3 7h9a5 5 0 0 1 5 5v9M3 11h9a1 1 0 0 1 1 1v9' };
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
  let dragId = 0;
  function moveFeature(id, to) {
    Doc.mutate((dd) => {
      const i = dd.features.findIndex((f) => f.id === id); if (i < 0) return;
      const [f] = dd.features.splice(i, 1);
      dd.features.splice(Math.max(0, Math.min(dd.features.length, to > i ? to - 1 : to)), 0, f);
    });
    Kernel.update(); refresh();
  }
  function setRollback(n) {
    Doc.mutate((dd) => { dd.rollback = n == null || n >= dd.features.length ? null : Math.max(0, n); });
    Status.msg(Doc.get().rollback == null ? 'Barre de retour arrière en fin d\'arbre : toutes les fonctions sont calculées.' : `Retour arrière : seules les ${Doc.get().rollback} premières fonctions sont calculées ; une nouvelle fonction s'insère ici.`, 7000);
    refresh();
  }
  function renderFeatures(T) {
    const d = Doc.get(), ts = state.treeSel || {}, list = d.features || [], rb = d.rollback == null ? list.length : d.rollback;
    const bar = () => {
      const r = el('div', { class: 'tr-rb', role: 'separator', tabindex: 0, draggable: 'true', title: 'Barre de retour arrière : glisser pour ne calculer que les fonctions au-dessus (flèches ↑ ↓ au clavier)', 'aria-label': 'Barre de retour arrière' }, el('span', {}, 'Retour arrière'));
      r.addEventListener('dragstart', (e) => { dragId = -1; e.dataTransfer.setData('text/plain', 'rb'); e.dataTransfer.effectAllowed = 'move'; });
      r.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); setRollback(Math.max(0, rb - 1)); } if (e.key === 'ArrowDown') { e.preventDefault(); setRollback(rb + 1); } });
      return r;
    };
    list.forEach((f, i) => {
      if (i === rb) T.append(bar());
      const err = Kernel.errorOf(f.id) || (state.exprErr && Object.entries(state.exprErr).find(([k]) => k.startsWith(`f${f.id}:`)) || [])[1];
      const r = el('div', { class: 'tr-row sub' + (ts.t === 'f' && ts.id === f.id ? ' on' : '') + (f.hide || i >= rb ? ' dim' : '') + (err ? ' err' : ''), role: 'treeitem', tabindex: 0, draggable: 'true', 'aria-selected': String(ts.t === 'f' && ts.id === f.id), 'data-fid': f.id, title: err ? `Erreur : ${err}` : f.name });
      r.append(svg(ICON[f.type] || ICON.extrude), el('span', { class: 'tr-l' }, f.name));
      if (err) r.append(el('em', { class: 'tr-b bad' }, '!'));
      else if (f.ex) r.append(el('em', { class: 'tr-b' }, 'ƒ'));
      const eye = el('button', { type: 'button', class: 'ibs tg' + (f.hide ? '' : ' on'), 'aria-pressed': String(!f.hide), 'aria-label': `Afficher : ${f.name}`, title: f.hide ? 'Activer' : 'Supprimer temporairement (désactiver)' });
      eye.append(svg('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'));
      eye.addEventListener('click', (e) => { e.stopPropagation(); Doc.mutate((dd) => { const x = dd.features.find((y) => y.id === f.id); x.hide = !x.hide; }); refresh(); });
      r.append(eye);
      r.addEventListener('click', () => { state.treeSel = { t: 'f', id: f.id }; refresh(); });
      r.addEventListener('dblclick', () => dialog(f.type, f));
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') dialog(f.type, f); if (e.key === ' ') { e.preventDefault(); state.treeSel = { t: 'f', id: f.id }; refresh(); } });
      r.addEventListener('contextmenu', (e) => { e.preventDefault(); state.treeSel = { t: 'f', id: f.id }; refresh(); ctxBar({ fid: f.id }, e.clientX, e.clientY); });
      r.addEventListener('dragstart', (e) => { dragId = f.id; e.dataTransfer.setData('text/plain', String(f.id)); e.dataTransfer.effectAllowed = 'move'; });
      r.addEventListener('dragover', (e) => { e.preventDefault(); r.classList.add('drop'); });
      r.addEventListener('dragleave', () => r.classList.remove('drop'));
      r.addEventListener('drop', (e) => { e.preventDefault(); r.classList.remove('drop'); if (dragId === -1) setRollback(i); else if (dragId && dragId !== f.id) moveFeature(dragId, i); dragId = 0; });
      T.append(r);
    });
    if (rb >= list.length && list.length) {
      const end = bar(); end.classList.add('end'); T.append(end);
    }
    const tail = el('div', { class: 'tr-drop', 'aria-hidden': 'true' });
    tail.addEventListener('dragover', (e) => e.preventDefault());
    tail.addEventListener('drop', (e) => { e.preventDefault(); if (dragId === -1) setRollback(null); else if (dragId) moveFeature(dragId, list.length); dragId = 0; });
    T.append(tail);
  }

  /* propriétés d'une fonction (panneau de droite) */
  function featurePanel(f) {
    const b = Kernel.bodyOfFeature(f.id), err = Kernel.errorOf(f.id), m = b ? matOf(b.mat) : matOf(f.mat);
    /* sans noyau (hors ligne) : volume approché de la fonction seule (extrusion, révolution) */
    const vApprox = !b && (f.type === 'extrude' || (f.type === 'revolve' && f.op !== 'cut')) ? Model.featureVolume(f) : null;
    const quick = [];
    const nk = { extrude: ['d'], cut: ['d'], revolve: ['ang'], fillet: ['r'], chamfer: ['r'], shell: ['t'], pattern: ['n', 'step'], mirror: ['off'], pipe: ['r', 'e', 'bend'] }[f.type] || [];
    const lab = { d: ['Profondeur', 'mm'], ang: ['Angle', '°'], r: [f.type === 'pipe' ? 'Rayon extérieur' : f.type === 'chamfer' ? 'Distance' : 'Rayon', 'mm'], t: ['Épaisseur', 'mm'], n: ['Occurrences', 'u.'], step: ['Pas', 'mm'], off: ['Position du plan', 'mm'], e: ['Paroi', 'mm'], bend: ['Rayon de cintrage', 'mm'] };
    for (const k of nk) {
      const fd = numField(lab[k][0], f, k, f[k], lab[k][1]);
      fd.node.querySelector('input').addEventListener('change', () => {
        let ok = true;
        Doc.mutate((dd) => { const x = dd.features.find((y) => y.id === f.id); try { readFields([fd], x); Model.applyExpr(dd); } catch (e) { ok = false; Status.msg(e.message, 6000); } });
        if (ok) { Kernel.update(); refresh(); }
      });
      quick.push(fd.node);
    }
    const btn = (t, fn, cls = 'btn wide') => { const x = el('button', { type: 'button', class: cls }, t); x.addEventListener('click', fn); return x; };
    const i = feats().findIndex((x) => x.id === f.id);
    return el('div', {},
      el('dl', { class: 'kv' }, ...kv('Type', FEATURE_TYPES[f.type]), ...(f.sk ? kv('Esquisse', (Model.sketch(f.sk) || {}).name || '—') : []),
        ...kv('Corps', b ? b.name : vApprox != null ? '— (noyau non chargé : valeurs approchées)' : '—'),
        ...kv(b ? 'Volume du corps' : 'Volume', b ? `${nf(b.props.volume / 1e9, 5)} m³` : vApprox != null ? `${nf(vApprox / 1e9, 5)} m³` : '—'),
        ...kv('Masse', m && (b || vApprox != null) ? `${nf((b ? b.props.volume : vApprox) / 1e9 * m.rho, 0)} kg (${m.nom})` : '—')),
      err ? el('p', { class: 'note bad' }, `Erreur du noyau : ${err}`) : '',
      ...quick,
      btn('Modifier la fonction…', () => dialog(f.type, f)),
      f.sk ? btn('Éditer l\'esquisse', () => Workbench.enterSketch(f.sk)) : '',
      el('div', { class: 'row2b' }, btn('Monter', () => moveFeature(f.id, i - 1), 'btn'), btn('Descendre', () => moveFeature(f.id, i + 2), 'btn')),
      btn('Placer le retour arrière après', () => setRollback(i + 1), 'btn wide'),
      btn('Supprimer la fonction', () => removeFeature(f.id), 'btn danger'));
  }
  function removeFeature(id) {
    const f = featById(id); if (!f) return;
    const deps = feats().filter((x) => x.src === id || x.target === id);
    Doc.mutate((dd) => {
      const i = dd.features.findIndex((x) => x.id === id);
      dd.features.splice(i, 1);
      for (const x of dd.features) { if (x.src === id) x.src = 0; if (x.target === id) x.target = 0; }
      if (dd.rollback != null && i < dd.rollback) dd.rollback--;
      if (dd.rollback != null && dd.rollback >= dd.features.length) dd.rollback = null;
    });
    state.treeSel = null; refresh(); Kernel.update();
    Status.msg(`« ${f.name} » supprimée${deps.length ? ` ; ${deps.length} fonction(s) qui en dépendaient sont à revoir` : ''} (Ctrl+Z pour annuler).`, 7000);
  }

  /* ---------- sélection dans la vue 3D, esquisse sur face, vue normale ---------- */
  let lastPick = null;
  function onPick(e) {
    const p = e.detail || {};
    lastPick = p;
    hideCtx();
    if (p.fids && p.fids.length) { state.treeSel = { t: 'f', id: p.fids[p.fids.length - 1] }; state.compSel = 0; Tools.selection.clear(); }
    else if (p.cid) { state.treeSel = { t: 'c', id: p.cid }; state.compSel = p.cid; Tools.selection.clear(); }
    else if (p.oid) { state.treeSel = null; state.compSel = 0; if (!p.shift) Tools.selection.clear(); Tools.selection.add(p.oid); }
    else { state.treeSel = null; state.compSel = 0; Tools.selection.clear(); refresh(); return; }
    refresh(); UI.renderProps();
    ctxBar(p, p.x, p.y);
  }
  function sketchOnFace(p) {
    if (!p || !p.normal || !p.point) { Status.msg('Double-cliquez sur une face plane d\'un corps pour y créer une esquisse.', 6000); return; }
    if (p.planar === false) { Status.msg('Cette face n\'est pas plane : choisissez une face plane pour l\'esquisse.', 6000); return; }
    const n = p.normal, ref = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    /* axe U horizontal (sur une face verticale) ou suivant X (sur une face horizontale) */
    let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [-n[1], n[0], 0];
    const lu = Math.hypot(...u) || 1; u = u.map((x) => x / lu);
    void ref;
    let id = 0;
    Doc.mutate((d) => { id = d.nextSk++; d.sketches.push({ id, name: `Esquisse ${id} (face)`, plane: 'custom', off: 0, o: p.point.map((x) => +x.toFixed(4)), u, n, face: p.face, body: p.key }); });
    faceRefFor(id);
    Workbench.enterSketch(id);
    Status.msg('Esquisse sur la face : le contour de la face est rappelé en pointillés (accroches actives). Dessinez puis « Bossage » ou « Enlèvement ».', 9000);
  }
  /* contour de la face (bords du maillage de la face) ramené dans le repère de l'esquisse : repère 2D d'aide au dessin */
  function faceRefFor(skId) {
    const s = Model.sketch(skId), kr = Kernel.result();
    state.faceRef = null;
    if (!s || s.plane !== 'custom' || !kr || s.face == null) return;
    const b = kr.bodies.find((x) => x.key === s.body) || kr.bodies[0]; if (!b) return;
    const g = b.mesh.faces.find((x) => x[2] === s.face); if (!g) return;
    const F = Model.frame(s), idx = b.mesh.idx, P = b.mesh.pos, cnt = new Map();
    for (let t = g[0]; t < g[0] + g[1]; t += 3) for (const [a, c] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { const k = a < c ? `${a}_${c}` : `${c}_${a}`; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const to2 = (i) => { const v = [P[i * 3] - F.t[0], P[i * 3 + 1] - F.t[1], P[i * 3 + 2] - F.t[2]]; return [v[0] * F.U[0] + v[1] * F.U[1] + v[2] * F.U[2], v[0] * F.V[0] + v[1] * F.V[1] + v[2] * F.V[2]]; };
    const segs = [];
    for (const [k, n] of cnt) if (n === 1) { const [a, c] = k.split('_').map(Number); segs.push([to2(a), to2(c)]); }
    state.faceRef = { sk: skId, segs };
  }

  /* barre contextuelle près du curseur (comme la barre contextuelle de SolidWorks) */
  let ctxEl = null;
  function hideCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function ctxBar(p, x, y) {
    hideCtx();
    const acts = [];
    const fid = p.fid || (p.fids && p.fids[p.fids.length - 1]) || (state.treeSel && state.treeSel.t === 'f' ? state.treeSel.id : 0);
    const f = fid ? featById(fid) : null;
    if (f) {
      acts.push(['Modifier', () => dialog(f.type, f)]);
      if (f.sk) acts.push(['Esquisse', () => Workbench.enterSketch(f.sk)]);
      acts.push(['Congé', () => dialog('fillet')], ['Désactiver', () => { Doc.mutate((dd) => { const z = dd.features.find((w) => w.id === f.id); z.hide = true; }); refresh(); }], ['Supprimer', () => removeFeature(f.id)]);
    }
    if (p.normal) { acts.push(['Vue normale', () => window.Scene3D && window.Scene3D.viewNormal(p.normal)]); if (p.planar !== false) acts.push(['Esquisse sur la face', () => sketchOnFace(p)]); }
    if (p.cid && !f) acts.push(['Dupliquer', () => Workbench.run('cDup')], ['Fixer', () => Workbench.run('mFix')], ['Supprimer', () => Workbench.run('cDel')]);
    if (!acts.length || x == null) return;
    ctxEl = el('div', { class: 'ctxbar', role: 'toolbar', 'aria-label': 'Actions sur la sélection' });
    for (const [t, fn] of acts) { const b = el('button', { type: 'button' }, t); b.addEventListener('click', () => { hideCtx(); fn(); }); ctxEl.append(b); }
    document.body.append(ctxEl);
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x + 14)) + 'px';
    ctxEl.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y - r.height - 14)) + 'px';
  }

  /* barre de raccourcis (touche S) : commandes favorites sous le curseur */
  let mouse = [innerWidth / 2, innerHeight / 2], sbar = null;
  const SBAR = [['Ligne', () => Tools.setTool('line')], ['Rectangle', () => Tools.setTool('rect')], ['Cercle', () => Tools.setTool('circle')], ['Cote', () => Tools.setTool('dim')],
    ['Ajuster', () => Tools.setTool('trim')], ['Décaler', () => Tools.setTool('offset')], ['Esquisse', () => Workbench.run('skNew')], ['Bossage', () => dialog('extrude')],
    ['Enlèvement', () => dialog('cut')], ['Congé', () => dialog('fillet')], ['Équations', varsDialog], ['Tout voir', () => Workbench.run('vFit')]];
  function shortcutBar() {
    if (sbar) { sbar.remove(); sbar = null; return; }
    sbar = el('div', { class: 'sbar', role: 'menu', 'aria-label': 'Barre de raccourcis' });
    SBAR.forEach(([t, fn], i) => { const b = el('button', { type: 'button', role: 'menuitem' }, el('kbd', {}, String((i + 1) % 10 || 0)), t); b.addEventListener('click', () => { sbar.remove(); sbar = null; fn(); }); sbar.append(b); });
    document.body.append(sbar);
    const r = sbar.getBoundingClientRect();
    sbar.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, mouse[0] - r.width / 2)) + 'px';
    sbar.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, mouse[1] - 20)) + 'px';
    sbar.querySelector('button').focus();
  }

  function init() {
    window.addEventListener('ai:pick3d', onPick);
    window.addEventListener('ai:dbl3d', (e) => sketchOnFace(e.detail));
    document.addEventListener('pointermove', (e) => { mouse = [e.clientX, e.clientY]; }, { passive: true });
    document.addEventListener('pointerdown', (e) => {
      if (ctxEl && !ctxEl.contains(e.target) && e.target.id !== 'cv3d') hideCtx();
      if (sbar && !sbar.contains(e.target)) { sbar.remove(); sbar = null; }
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target, typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(t.type)));
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (sbar && /^[0-9]$/.test(e.key)) { e.preventDefault(); const i = (+e.key + 9) % 10; const b = sbar.querySelectorAll('button')[i]; if (b) b.click(); return; }
      if (e.key === 'Escape') { hideCtx(); if (sbar) { sbar.remove(); sbar = null; } }
      if (e.key.toLowerCase() === 's' && !e.repeat) { e.preventDefault(); shortcutBar(); }
    });
    Kernel.on(() => { Workbench.renderTree(); if (state.sketch) faceRefFor(state.sketch); });
  }

  return { init, dialog, pipesFromSelection, varsDialog, massDialog, interfDialog, exportCAD, drawingDialog, renderFeatures, featurePanel, removeFeature, sketchOnFace, faceRefFor, shortcutBar, ctxBar, setRollback, moveFeature, lastPick: () => lastPick };
})();
