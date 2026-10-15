/* ============ Poste de travail : ruban à onglets, arbre de création, esquisses, fonctions 3D, assemblage, matériaux ============
   Organisation inspirée des modeleurs (SolidWorks, Inventor, Revit) : un RUBAN d'onglets en haut (Esquisse, Fonctions 3D,
   Assemblage, Métiers, Site, Matériaux, Analyse, Affichage), l'ARBRE DE CRÉATION à gauche (plans, esquisses, fonctions,
   composants), les PROPRIÉTÉS à droite. Les commandes du ruban appellent les mêmes fonctions que les raccourcis clavier. */
const Workbench = (() => {
  const I = {
    select: 'M5 3l13 8-6 1.5L9 19z', move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
    copy: 'M8 8h12v12H8zM4 16V4h12', line: 'M5 19L19 5M4 20h2M18 4h2', poly: 'M4 18l5-9 5 6 6-10', rect: 'M4 6h16v12H4z',
    circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', dim: 'M4 8v8M20 8v8M4 12h16M7 10l-3 2 3 2M17 10l3 2-3 2', text: 'M5 6h14M12 6v13M9 19h6',
    sym: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM10 8.5l5 3.5-5 3.5z', pan: 'M7 11V6a1.5 1.5 0 0 1 3 0v5M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V13M16 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L7 14',
    skNew: 'M4 20h4L18 10l-4-4L4 16zM13 7l4 4M3 3h6M3 3v6', skExit: 'M10 17l-5-5 5-5M5 12h10a4 4 0 0 1 0 8h-2',
    extrude: 'M4 9l8-4 8 4-8 4zM4 9v8l8 4 8-4V9M12 13v8M12 3v3M10 4.5L12 3l2 1.5', revolve: 'M12 3v18M6 8a6 2.5 0 1 0 12 0M6 16a6 2.5 0 0 0 12 0M6 8v8M18 8v8',
    top: 'M3 10l9-5 9 5-9 5z', front: 'M6 4h12v16H6z', right: 'M8 4l9 3v14l-9-3z',
    insert: 'M4 4h16v16H4zM12 8v8M8 12h8', dup: 'M8 8h12v12H8zM4 16V4h12', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    fix: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z', sur: 'M4 21h16M7 21v-5h10v5M9 16V9h6v7', axe: 'M12 2v20M5 8h14M7 16h10', decal: 'M4 12h12M12 6l6 6-6 6M4 5v14', free: 'M6 6l12 12M18 6L6 18',
    building: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6', site: 'M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    reload: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    matLib: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4', compo: 'M4 4h3v16H4zM9 4h6v16H9zM17 4h3v16h-3z', brush: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
    ana: 'M3 20h18M4 8c4 7 12 7 16 0M4 8V5M20 8V5', util: 'M4 19h4v-8H4zM10 19h4V5h-4zM16 19h4v-5h-4z', plan: 'M4 4h16v16H4zM4 12h16M12 4v16', cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', theme: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z', tree: 'M4 5h6M4 12h6M4 19h6M14 4h6v4h-6zM14 16h6v4h-6zM7 5v14', panel: 'M4 5h16v14H4zM14 5v14',
    net: 'M3 12h18M7 9v6M17 9v6', mur: 'M3 8h18v8H3z', poutre: 'M3 7h18M3 17h18M12 7v10', none: 'M5 19L19 5', snap: 'M12 3v4M12 17v4M3 12h4M17 12h4M9 9h6v6H9z', ortho: 'M5 19V5M5 19h14',
  };
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
  const TOOLS = [['select', 'Sélection', 'V'], ['move', 'Déplacer', 'M'], ['copy', 'Copier', 'K'], ['line', 'Ligne', 'L'], ['poly', 'Polyligne', 'P'], ['rect', 'Rectangle', 'R'], ['circle', 'Cercle', 'C'], ['dim', 'Cote', 'D'], ['text', 'Texte', 'T'], ['sym', 'Équipement', 'E'], ['pan', 'Main', 'H']];
  const tool = (t) => { const [, label, key] = TOOLS.find((x) => x[0] === t); return { tool: t, label, key, icon: I[t], title: `${label} (${key})` }; };
  const cmd = (id, label, icon, title) => ({ id, label, icon, title: title || label });
  const TABS = [
    { id: 'sketch', label: 'Esquisse', groups: [
      { label: 'Esquisse', items: [cmd('skNew', 'Nouvelle esquisse', I.skNew, 'Créer une esquisse sur un plan (Dessus, Face, Droite)'), cmd('skExit', 'Quitter', I.skExit, 'Quitter l\'esquisse : revenir au plan général')] },
      { label: 'Sélection et modification', items: [tool('select'), tool('move'), tool('copy')] },
      { label: 'Dessin', items: [tool('line'), tool('poly'), tool('rect'), tool('circle')] },
      { label: 'Annotation', items: [tool('dim'), tool('text')] },
      { label: 'Aides au dessin', items: [cmd('rbSnap', 'Accroches', I.snap, 'Accroches aux objets (F3)'), cmd('rbOrtho', 'Ortho', I.ortho, 'Mode ortho (F8)'), cmd('rbFit', 'Tout voir', I.fit, 'Tout voir (Z)')] },
    ] },
    { id: 'model', label: 'Fonctions 3D', groups: [
      { label: 'Fonctions', items: [cmd('ftExtrude', 'Bossage extrudé', I.extrude, 'Extruder les contours fermés d\'une esquisse'), cmd('ftRevolve', 'Révolution', I.revolve, 'Faire tourner un contour autour d\'une ligne d\'axe de l\'esquisse')] },
      { label: 'Plans de référence', items: [cmd('pTop', 'Dessus', I.top, 'Nouvelle esquisse sur le plan de dessus (X · Y)'), cmd('pFront', 'Face', I.front, 'Nouvelle esquisse sur le plan de face (X · Z)'), cmd('pRight', 'Droite', I.right, 'Nouvelle esquisse sur le plan de droite (Y · Z)')] },
    ] },
    { id: 'asm', label: 'Assemblage', groups: [
      { label: 'Composants', items: [cmd('cIns', 'Insérer', I.insert, 'Insérer un composant de la bibliothèque'), cmd('cDup', 'Dupliquer', I.dup, 'Dupliquer le composant sélectionné'), cmd('cDel', 'Supprimer', I.trash, 'Supprimer le composant sélectionné')] },
      { label: 'Contraintes', items: [cmd('mFix', 'Fixe', I.fix, 'Fixer le composant à sa position'), cmd('mSur', 'Posé sur', I.sur, 'Poser le composant sur un autre'), cmd('mAxe', 'Axe aligné', I.axe, 'Centrer le composant sur un autre (en plan)'), cmd('mDecal', 'Décalage', I.decal, 'Placer le composant à une distance d\'un autre'), cmd('mFree', 'Libre', I.free, 'Retirer la contrainte')] },
      { label: 'Génération', items: [cmd('gBld', 'Bâtiment', I.building, 'Générer la structure d\'un bâtiment d\'activité (portiques, massifs, dallage, bardage)')] },
    ] },
    { id: 'trade', label: 'Métiers', groups: [
      { label: 'Corps de métier', items: [{ html: 'trade' }] },
      { label: 'Tracé métier', items: [cmd('tmNone', 'Simple', I.none), cmd('tmNet', 'Réseau', I.net), cmd('tmMur', 'Mur', I.mur), cmd('tmPoutre', 'Poutre', I.poutre)] },
      { label: 'Équipements', items: [tool('sym')] },
    ] },
    { id: 'site', label: 'Site', groups: [
      { label: 'Lieu du projet', items: [cmd('sSet', 'Adresse', I.site, 'Choisir l\'adresse du projet : relief, bâtiments et voirie réels'), cmd('sReload', 'Mettre à jour', I.reload, 'Recharger les données du site'), cmd('sShow', 'Afficher', I.eye, 'Afficher ou masquer le site en 3D')] },
    ] },
    { id: 'mat', label: 'Matériaux', groups: [
      { label: 'Bibliothèques', items: [cmd('mLib', 'Matériaux', I.matLib, 'Bibliothèque des matériaux : mécanique, thermique, carbone'), cmd('cLib', 'Compositions', I.compo, 'Compositions de parois : U, inertie, acoustique, condensation, carbone')] },
      { label: 'Affectation', items: [cmd('mApply', 'Appliquer', I.brush, 'Appliquer un matériau à la sélection'), cmd('cApply', 'Composition', I.compo, 'Appliquer une composition aux murs sélectionnés')] },
    ] },
    { id: 'ana', label: 'Analyse', groups: [
      { label: 'Calculs', items: [cmd('aRun', 'Déformations', I.ana, 'Flèches, contraintes, flambement, dilatation')] },
      { label: 'Affichage 3D', items: [cmd('aUtil', 'Taux de travail', I.util, 'Colorer la 3D selon le taux de travail des poutres')] },
    ] },
    { id: 'view', label: 'Affichage', groups: [
      { label: 'Vue', items: [cmd('vPlan', 'Plan', I.plan, 'Vue en plan (2D)'), cmd('v3d', '3D', I.cube, 'Vue 3D'), cmd('vFit', 'Tout voir', I.fit)] },
      { label: 'Interface', items: [cmd('vTree', 'Arbre', I.tree, 'Afficher ou masquer l\'arbre de création'), cmd('vTheme', 'Thème', I.theme, 'Thème clair ou sombre')] },
    ] },
  ];
  let curTab = 'sketch';
  try { const t = localStorage.getItem('ai.rtab'); if (TABS.some((x) => x.id === t)) curTab = t; } catch (e) { /* stockage indisponible */ }

  /* ---------- construction du ruban ---------- */
  function build() {
    const rb = $('#ribbon'); rb.textContent = '';
    const tabs = el('div', { class: 'rb-tabs', role: 'tablist', 'aria-label': 'Onglets du ruban' });
    for (const t of TABS) {
      const b = el('button', { type: 'button', role: 'tab', 'data-rtab': t.id, 'aria-selected': String(t.id === curTab), id: `rt-${t.id}`, 'aria-controls': `rp-${t.id}` }, t.label);
      b.addEventListener('click', () => setTab(t.id, true));
      tabs.append(b);
    }
    const modes = $('#top .modes'); if (modes) tabs.append(modes);
    rb.append(tabs);
    for (const t of TABS) {
      const p = el('div', { class: 'rb-panel', role: 'tabpanel', id: `rp-${t.id}`, 'aria-labelledby': `rt-${t.id}`, hidden: t.id !== curTab });
      for (const g of t.groups) {
        const items = el('div', { class: 'rb-items' });
        for (const it of g.items) {
          if (it.html === 'trade') { items.append(el('label', { class: 'rb-sel' }, el('span', {}, 'Métier'), el('select', { id: 'tradeSel', 'aria-label': 'Corps de métier' }))); continue; }
          const b = el('button', { type: 'button', class: 'rb-btn' + (it.tool ? ' tool' : ''), title: it.title, 'aria-pressed': it.tool ? 'false' : null });
          if (it.tool) b.dataset.tool = it.tool; else b.dataset.cmd = it.id;
          b.append(svg(it.icon), el('span', {}, it.label));
          if (it.key) b.append(el('kbd', {}, it.key));
          if (!it.tool) b.addEventListener('click', () => run(it.id));
          items.append(b);
        }
        p.append(el('div', { class: 'rb-grp', role: 'group', 'aria-label': g.label }, items, el('span', { class: 'rb-lbl' }, g.label)));
      }
      rb.append(p);
    }
    $('#treeClose').addEventListener('click', () => toggleTree(false));

    $('#skBarExit').addEventListener('click', exitSketch);
    /* arbre affiché par défaut sur les grands écrans (≥ 1440 px) ; ailleurs, bouton « Arbre » à gauche des onglets */
    let pref = null; try { pref = localStorage.getItem('ai.tree'); } catch (e) { /* stockage indisponible */ }
    $('#app').classList.toggle('no-tree', pref === '0' || (pref === null && window.innerWidth < 1440));
    const tb = el('button', { type: 'button', class: 'rb-tree', id: 'treeBtn', title: 'Afficher ou masquer l\'arbre de création', 'aria-label': 'Arbre de création' }); tb.append(svg(I.tree));
    tb.addEventListener('click', () => toggleTree()); tabs.prepend(tb);
  }
  function setTab(id, user) {
    curTab = id;
    try { localStorage.setItem('ai.rtab', id); } catch (e) { /* stockage indisponible */ }
    document.querySelectorAll('#ribbon [data-rtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rtab === id)));
    document.querySelectorAll('#ribbon .rb-panel').forEach((p) => { p.hidden = p.id !== `rp-${id}`; });
    if (user) {
      /* comme dans les modeleurs : l'esquisse se fait en plan, les fonctions et l'assemblage se voient en 3D */
      if (id === 'sketch' && View3D.isOn()) View3D.setMode(false);
      if ((id === 'model' || id === 'asm' || id === 'site') && !View3D.isOn() && window.Scene3D && !state.sketch) View3D.setMode(true);
    }
  }
  function toggleTree(on) {
    const app = $('#app'); const show = on === undefined ? app.classList.contains('no-tree') : on;
    app.classList.toggle('no-tree', !show);
    try { localStorage.setItem('ai.tree', show ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
    Canvas2D.requestDraw();
  }

  /* ---------- commandes ---------- */
  function run(id) {
    switch (id) {
      case 'skNew': return newSketchDialog();
      case 'skExit': return exitSketch();
      case 'rbSnap': return Tools.toggleSnap();
      case 'rbOrtho': return Tools.toggleOrtho();
      case 'rbFit': case 'vFit': return View3D.isOn() && window.Scene3D ? window.Scene3D.view('iso') : Canvas2D.zoomExtents();
      case 'ftExtrude': return featureDialog('extrude');
      case 'ftRevolve': return featureDialog('revolve');
      case 'pTop': return newSketch('top'); case 'pFront': return newSketch('front'); case 'pRight': return newSketch('right');
      case 'cIns': return insertDialog();
      case 'cDup': return dupComp();
      case 'cDel': return delComp();
      case 'mFix': return mate('fix'); case 'mSur': return mate('sur'); case 'mAxe': return mate('axe'); case 'mDecal': return mate('decal'); case 'mFree': return mate('');
      case 'gBld': return buildingDialog();
      case 'tmNone': case 'tmNet': case 'tmMur': case 'tmPoutre': { const m = { tmNone: 'none', tmNet: 'net', tmMur: 'mur', tmPoutre: 'poutre' }[id]; const b = document.querySelector(`#panel .seg [data-mode="${m}"]`); if (b && !b.hidden) b.click(); else Status.msg('Mode non proposé pour le métier choisi.'); return; }
      case 'sSet': return Site.dialog();
      case 'sReload': return Site.load(true);
      case 'sShow': return Site.toggle();
      case 'mLib': return matLibDialog();
      case 'cLib': return compoDialog();
      case 'mApply': return applyMatDialog();
      case 'cApply': return compoDialog(true);
      case 'aRun': return Analysis.show();
      case 'aUtil': if (!View3D.isOn()) View3D.setMode(true); return View3D.setStyle('util');
      case 'vPlan': return View3D.setMode(false);
      case 'v3d': return View3D.setMode(true);
      case 'vTree': return toggleTree();
      case 'vTheme': return $('#theme').click();
    }
  }

  /* ---------- esquisses ---------- */
  function newSketch(plane, off = 0, name = '') {
    let id = 0;
    Doc.mutate((d) => { d.sketches = d.sketches || []; id = d.nextSk++; d.sketches.push({ id, name: name || `Esquisse ${id}`, plane, off }); });
    enterSketch(id);
    Status.msg(`Esquisse ${id} sur le plan ${PLANES[plane].label} (${PLANES[plane].axes}) : dessinez des contours fermés, puis « Bossage extrudé » ou « Révolution ».`, 7000);
    return id;
  }
  function newSketchDialog() {
    const plane = el('select', { 'aria-label': 'Plan de l\'esquisse' }, ...Object.entries(PLANES).map(([k, p]) => el('option', { value: k }, `${p.label} (${p.axes}, normale ${p.norm})`)));
    const off = el('input', { class: 'fld', type: 'number', step: 'any', value: 0, 'aria-label': 'Décalage du plan en millimètres' });
    const name = el('input', { class: 'fld', type: 'text', maxlength: 60, placeholder: 'ex. Socle', 'aria-label': 'Nom de l\'esquisse' });
    Dlg.open('Nouvelle esquisse', el('div', {}, el('div', { class: 'frm' }, el('label', { class: 'lbl' }, 'Plan', plane), el('label', { class: 'lbl' }, 'Décalage du plan (mm)', off), el('label', { class: 'lbl' }, 'Nom', name)),
      el('p', { class: 'mut small' }, 'Le plan Dessus est le plan du sol (vue de dessus). Face : plan vertical X · Z vu depuis le sud. Droite : plan vertical Y · Z vu depuis l\'est. Le décalage déplace le plan le long de sa normale.')),
    [{ label: 'Créer l\'esquisse', primary: true, run: () => { const o = Number(off.value) || 0; newSketch(plane.value, o, name.value.trim().slice(0, 60)); } }]);
  }
  function enterSketch(id) {
    const s = Model.sketch(id); if (!s) return;
    state.sketch = id; Tools.selection.clear(); state.treeSel = { t: 's', id };
    if (View3D.isOn()) View3D.setMode(false);
    setTab('sketch');
    refresh(); Canvas2D.requestDraw();
  }
  function exitSketch() {
    if (!state.sketch) return;
    state.sketch = 0; Tools.selection.clear(); refresh(); Canvas2D.requestDraw();
    Status.msg('Retour au plan général.');
  }

  /* ---------- fonctions 3D ---------- */
  const matSelect = (cur, allowNone = true) => {
    const s = el('select', { 'aria-label': 'Matériau' });
    if (allowNone) s.append(el('option', { value: '' }, '— selon la nature de l\'objet —'));
    for (const cat of MAT_CATS) { const og = el('optgroup', { label: cat }); for (const [id, m] of Object.entries(MATS)) if (m.cat === cat) og.append(el('option', { value: id, selected: id === cur }, m.nom)); if (og.childNodes.length) s.append(og); }
    return s;
  };
  const layerSelect = (cur) => el('select', { 'aria-label': 'Calque' }, ...Doc.get().layers.map((l) => el('option', { value: l.id, selected: l.id === cur }, l.name)));
  function featureDialog(type, edit) {
    const d = Doc.get(), sks = d.sketches || [];
    if (!sks.length) { Status.msg('Créez d\'abord une esquisse (onglet Esquisse → Nouvelle esquisse) avec un contour fermé.', 7000); return; }
    const f0 = edit || { type, sk: state.sketch || (state.treeSel && state.treeSel.t === 's' ? state.treeSel.id : sks[sks.length - 1].id), d: 1000, dir: '+', ang: 360, axis: 0, mat: '', layer: d.active };
    const sk = el('select', { 'aria-label': 'Esquisse' }, ...sks.map((s) => el('option', { value: s.id, selected: s.id === f0.sk }, `${s.name} · ${PLANES[s.plane].label}${s.off ? ` (${s.off} mm)` : ''} · ${Model.loops(s.id).length} contour(s)`)));
    const depth = el('input', { class: 'fld', type: 'number', min: 1, max: 1e6, step: 'any', value: f0.d, 'aria-label': 'Profondeur en millimètres' });
    const dir = el('select', { 'aria-label': 'Sens' }, ...[['+', 'Sens de la normale'], ['-', 'Sens opposé'], ['mid', 'Plan milieu (symétrique)']].map(([v, t]) => el('option', { value: v, selected: v === f0.dir }, t)));
    const ang = el('input', { class: 'fld', type: 'number', min: 1, max: 360, step: 'any', value: f0.ang, 'aria-label': 'Angle en degrés' });
    const axis = el('select', { 'aria-label': 'Ligne d\'axe' });
    const fillAxis = () => { axis.textContent = ''; const lines = d.objects.filter((o) => o.sk === +sk.value && o.type === 'line'); for (const o of lines) axis.append(el('option', { value: o.id, selected: o.id === f0.axis }, `Ligne #${o.id} (${fmt(G.dist(o.a, o.b))} mm)`)); if (!lines.length) axis.append(el('option', { value: '' }, '— aucune ligne dans l\'esquisse —')); };
    sk.addEventListener('change', fillAxis); fillAxis();
    const mat = matSelect(f0.mat), lay = layerSelect(f0.layer);
    const rows = type === 'extrude' ? [el('label', { class: 'lbl' }, 'Profondeur (mm)', depth), el('label', { class: 'lbl' }, 'Sens', dir)] : [el('label', { class: 'lbl' }, 'Ligne d\'axe (dans l\'esquisse)', axis), el('label', { class: 'lbl' }, 'Angle (°)', ang)];
    Dlg.open(`${edit ? 'Modifier : ' : ''}${FEATURE_TYPES[type]}`, el('div', {}, el('div', { class: 'frm' }, el('label', { class: 'lbl' }, 'Esquisse', sk), ...rows, el('label', { class: 'lbl' }, 'Matériau', mat), el('label', { class: 'lbl' }, 'Calque', lay)),
      el('p', { class: 'mut small' }, type === 'extrude' ? 'Contours fermés de l\'esquisse : polylignes fermées, rectangles, cercles. Un contour intérieur à un autre fait un trou.' : 'Dessinez dans l\'esquisse une ligne qui servira d\'axe et un contour fermé d\'un seul côté de cette ligne.')),
    [{ label: edit ? 'Appliquer' : 'Créer la fonction', primary: true, run: () => {
      const skId = +sk.value, n = Model.loops(skId, type === 'revolve' ? +axis.value : 0).length;
      if (!n) { Status.msg('Aucun contour fermé dans cette esquisse : dessinez une polyligne fermée, un rectangle ou un cercle.', 7000); return false; }
      const dv = Number(depth.value), av = Number(ang.value);
      if (type === 'extrude' && !(dv > 0 && dv <= 1e6)) { Status.msg('Profondeur invalide (1 à 1 000 000 mm).', 6000); return false; }
      if (type === 'revolve' && (!(+axis.value) || !(av > 0 && av <= 360))) { Status.msg('Choisissez une ligne d\'axe et un angle entre 1 et 360°.', 6000); return false; }
      let fid = edit ? edit.id : 0;
      Doc.mutate((dd) => {
        dd.features = dd.features || [];
        let f = edit ? dd.features.find((x) => x.id === edit.id) : null;
        if (!f) { fid = dd.nextF++; f = { id: fid, type, name: `${FEATURE_TYPES[type]} ${fid}`, hide: false }; dd.features.push(f); }
        Object.assign(f, { sk: skId, d: type === 'extrude' ? dv : f.d || 1000, dir: dir.value, mat: mat.value, layer: +lay.value });
        if (type === 'revolve') { f.ang = av; f.axis = +axis.value; }
      });
      state.sketch = 0; state.treeSel = { t: 'f', id: fid }; Tools.selection.clear();
      if (window.Scene3D) { setTab('model'); View3D.setMode(true); }
      refresh();
      Status.msg(`${FEATURE_TYPES[type]} : ${n} contour(s), volume ${fmtV(Model.featureVolume(Doc.get().features.find((x) => x.id === fid)))}.`, 6000);
    } }]);
  }
  const fmtV = (mm3) => `${(mm3 / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} m³`;
  const massOf = (mm3, matId) => { const m = matOf(matId); return m && mm3 ? mm3 / 1e9 * m.rho : null; };

  /* ---------- assemblage ---------- */
  function insertDialog() {
    const fams = {};
    for (const [k, p] of Object.entries(PARTS)) (fams[p.fam] = fams[p.fam] || []).push([k, p]);
    const body = el('div');
    const dlg = Dlg.open('Insérer un composant', body);
    for (const [fam, list] of Object.entries(fams)) {
      body.append(el('p', { class: 'sym-g' }, fam));
      const g = el('div', { class: 'part-grid' });
      for (const [k, p] of list) {
        const b = el('button', { type: 'button', class: 'part-btn', 'data-part': k }, el('b', {}, p.icon), el('span', {}, p.label), el('small', {}, matOf(p.mat) ? matOf(p.mat).nom : ''));
        b.addEventListener('click', () => { dlg.close(); addComp(k); });
        g.append(b);
      }
      body.append(g);
    }
    body.append(el('p', { class: 'mut small' }, 'Les composants sont des pièces paramétriques : leurs dimensions, leur position et leurs contraintes se modifient dans le panneau Propriétés ; la 3D se met à jour immédiatement.'));
  }
  function addComp(t, params = {}, pos, extra = {}) {
    let id = 0;
    Doc.mutate((d) => {
      d.comps = d.comps || []; id = d.nextC++;
      const part = Model.cleanPart({ t, ...PARTS[t].def, ...params });
      d.comps.push({ id, name: `${PARTS[t].label} ${id}`, part, pos: pos || [0, 0, 0], rot: 0, mat: PARTS[t].mat, layer: d.active, fix: false, mate: { t: '', ref: 0, d: [0, 0, 0] }, ...extra });
    });
    state.treeSel = { t: 'c', id }; state.compSel = id;
    if (window.Scene3D && !View3D.isOn()) { setTab('asm'); View3D.setMode(true); }
    refresh();
    return id;
  }
  const selComp = () => { const t = state.treeSel; return t && t.t === 'c' ? (Doc.get().comps || []).find((c) => c.id === t.id) : null; };
  function dupComp() {
    const c = selComp(); if (!c) { Status.msg('Sélectionnez un composant dans l\'arbre.'); return; }
    let id = 0;
    Doc.mutate((d) => { id = d.nextC++; const n = JSON.parse(JSON.stringify(c)); n.id = id; n.name = `${c.name} (copie)`; n.pos = [c.pos[0] + 500, c.pos[1] + 500, c.pos[2]]; n.fix = false; n.mate = { t: '', ref: 0, d: [0, 0, 0] }; d.comps.push(n); });
    state.treeSel = { t: 'c', id }; state.compSel = id; refresh();
  }
  function delComp() {
    const c = selComp(); if (!c) { Status.msg('Sélectionnez un composant dans l\'arbre.'); return; }
    Doc.mutate((d) => { d.comps = d.comps.filter((x) => x.id !== c.id); for (const x of d.comps) if (x.mate.ref === c.id) x.mate = { t: '', ref: 0, d: [0, 0, 0] }; });
    state.treeSel = null; state.compSel = 0; refresh();
    Status.msg(`Composant « ${c.name} » supprimé (Ctrl+Z pour annuler).`);
  }
  function mate(t) {
    const c = selComp(); if (!c) { Status.msg('Sélectionnez un composant dans l\'arbre, puis choisissez la contrainte.'); return; }
    if (t === 'fix' || t === '') { Doc.mutate((d) => { const x = d.comps.find((y) => y.id === c.id); x.fix = t === 'fix'; if (t === '') x.mate = { t: '', ref: 0, d: [0, 0, 0] }; }); refresh(); return; }
    const others = Doc.get().comps.filter((x) => x.id !== c.id);
    if (!others.length) { Status.msg('Il faut un autre composant comme référence.'); return; }
    const ref = el('select', { 'aria-label': 'Composant de référence' }, ...others.map((x) => el('option', { value: x.id, selected: x.id === c.mate.ref }, x.name)));
    const dz = (k, lab) => el('label', { class: 'lbl' }, lab, el('input', { class: 'fld', type: 'number', step: 'any', value: c.mate.d[k] || 0, 'data-k': k }));
    const fields = t === 'sur' ? [dz(2, 'Écart vertical (mm)')] : t === 'axe' ? [dz(0, 'Décalage X (mm)'), dz(1, 'Décalage Y (mm)')] : [dz(0, 'ΔX (mm)'), dz(1, 'ΔY (mm)'), dz(2, 'ΔZ (mm)')];
    const box = el('div', { class: 'frm' }, el('label', { class: 'lbl' }, 'Référence', ref), ...fields);
    Dlg.open(`Contrainte : ${MATE_TYPES[t]}`, box, [{ label: 'Appliquer', primary: true, run: () => {
      const dv = [0, 0, 0]; box.querySelectorAll('input[data-k]').forEach((i) => { dv[+i.dataset.k] = Number(i.value) || 0; });
      Doc.mutate((d) => { const x = d.comps.find((y) => y.id === c.id); x.mate = { t, ref: +ref.value, d: dv }; x.fix = false; });
      const R = Model.resolve(Doc.get().comps); if (R.warn.length) Status.msg('Contraintes circulaires : certaines sont ignorées.', 7000);
      refresh();
    } }]);
  }
  /* Générateur de bâtiment d'activité : portiques (poteaux + traverses), sablières, massifs, dallage, bardage. Tout est créé en un seul
     « annuler » et reste modifiable (composants paramétriques liés par des contraintes « posé sur »). */
  function buildingDialog() {
    const F = (k, lab, v, mn, mx, st = 'any') => el('label', { class: 'lbl' }, lab, el('input', { class: 'fld', type: 'number', min: mn, max: mx, step: st, value: v, 'data-k': k }));
    const profSel = (k, lab, v, fam) => el('label', { class: 'lbl' }, lab, el('select', { 'data-k': k }, ...Sections.list().filter((p) => fam.includes(PROFILES[p].fam)).map((p) => el('option', { value: p, selected: p === v }, p))));
    const compo = el('select', { 'data-k': 'compo' }, el('option', { value: '' }, 'Aucun bardage'), ...Object.entries(COMPOS).filter(([, c]) => c.kind === 'wall').map(([k, c]) => el('option', { value: k, selected: k === 'BARD-DP' }, c.nom)));
    const box = el('div', { class: 'frm' }, F('L', 'Longueur (m, suivant X)', 30, 4, 300), F('B', 'Largeur (m, suivant Y)', 18, 4, 100), F('H', 'Hauteur des poteaux (m)', 7, 2.5, 30), F('e', 'Entraxe des portiques (m)', 6, 3, 15),
      profSel('pc', 'Poteaux', 'HEA 240', ['HEA', 'HEB']), profSel('pt', 'Traverses', 'IPE 400', ['IPE']), profSel('ps', 'Sablières', 'IPE 200', ['IPE']),
      F('ds', 'Dallage : épaisseur (mm, 0 = sans)', 200, 0, 1000), F('fm', 'Massifs : côté (mm, 0 = sans)', 1200, 0, 5000), el('label', { class: 'lbl' }, 'Bardage périphérique', compo));
    Dlg.open('Générer un bâtiment d\'activité', el('div', {}, box, el('p', { class: 'mut small' }, 'Structure de principe : portiques à traverse droite, sans pente de toiture, sans contreventement ni pannes. Les poteaux sont posés sur leurs massifs, les traverses et les sablières sur les poteaux (contraintes « posé sur ») : modifier la hauteur d\'un poteau remonte la charpente. Vérifiez le dimensionnement avec l\'onglet Analyse et un bureau d\'études.')),
    [{ label: 'Générer', primary: true, run: () => {
      const v = {}; box.querySelectorAll('[data-k]').forEach((i) => { v[i.dataset.k] = i.tagName === 'SELECT' ? i.value : Number(i.value); });
      if (!(v.L >= 4 && v.B >= 4 && v.H >= 2.5 && v.e >= 3)) { Status.msg('Dimensions invalides.', 6000); return false; }
      generateBuilding(v); return true;
    } }]);
  }
  function generateBuilding(v) {
    const L = v.L * 1000, B = v.B * 1000, H = v.H * 1000, n = Math.max(2, Math.round(L / (v.e * 1000)) + 1), step = L / (n - 1);
    const pc = PROFILES[v.pc], pt = PROFILES[v.pt], ps = PROFILES[v.ps];
    Doc.mutate((d) => {
      d.comps = d.comps || [];
      const lay = (name, grp, col) => { let l = d.layers.find((x) => x.name === name); if (!l) { l = { id: d.nextLayerId++, name, color: col, group: grp, visible: true, locked: false }; d.layers.push(l); } return l.id; };
      const lStruct = lay('Charpente métallique', 'metal', '#1B2433'), lGC = lay('Fondations', 'gc', '#6B5B4B'), lDal = lay('Voiles et dalles', 'gc', '#8A8F98');
      const add = (t, params, pos, extra) => { const id = d.nextC++; d.comps.push({ id, name: `${PARTS[t].label} ${id}`, part: Model.cleanPart({ t, ...PARTS[t].def, ...params }), pos, rot: 0, mat: PARTS[t].mat, layer: lStruct, fix: false, mate: { t: '', ref: 0, d: [0, 0, 0] }, ...extra }); return id; };
      if (v.ds > 0) add('dalle', { Lx: L + 400, Ly: B + 400, e: v.ds }, [L / 2, B / 2, -v.ds], { name: 'Dallage', layer: lDal, fix: true, mat: 'C30' });
      for (let i = 0; i < n; i++) {
        const x = i * step, cols = [];
        for (const y of [0, B]) {
          let base = 0;
          if (v.fm > 0) base = add('massif', { Lx: v.fm, Ly: v.fm, e: 600 }, [x, y, -600 - (v.ds || 0)], { name: `Massif ${i + 1}${y ? 'B' : 'A'}`, layer: lGC, fix: true });
          cols.push(add('profil', { prof: v.pc, L: H, orient: 'v' }, [x, y, 0], { name: `Poteau ${i + 1}${y ? 'B' : 'A'}`, mat: 'S355', mate: base ? { t: 'sur', ref: base, d: [0, 0, v.ds || 0] } : { t: '', ref: 0, d: [0, 0, 0] } }));
        }
        add('profil', { prof: v.pt, L: B, orient: 'y' }, [x, 0, H + pt.h / 2], { name: `Traverse ${i + 1}`, mat: 'S355', mate: { t: 'sur', ref: cols[0], d: [0, 0, 0] } });
      }
      for (const y of [0, B]) add('profil', { prof: v.ps, L, orient: 'x' }, [0, y, H + ps.h / 2], { name: `Sablière ${y ? 'B' : 'A'}`, mat: 'S275', mate: { t: 'sur', ref: d.comps.find((c) => c.name === `Poteau 1${y ? 'B' : 'A'}`).id, d: [0, 0, 0] } });
      if (v.compo) {
        const c = COMPOS[v.compo], w = Phys.thickness(v.compo), off = Math.max(pc.h, pc.b) / 2 + w / 2;
        const o = { type: 'poly', pts: [[-off, -off], [L + off, -off], [L + off, B + off], [-off, B + off]], closed: true, id: d.nextId++, layer: lay('Bardage', 'metal', '#9AA6B1'), st: { kind: 'mur', w: Math.max(1, Math.round(w * 10) / 10), prof: c.nom.slice(0, 30), tag: 'Bardage', comp: v.compo }, props: { h: H + pt.h } };
        d.objects.push(o);
      }
    });
    Status.msg(`Bâtiment généré : ${n} portiques, ${n * 2} poteaux ${v.pc}, traverses ${v.pt}, ${v.L} × ${v.B} m.`, 7000);
    if (window.Scene3D) { setTab('asm'); View3D.setMode(true); }
    refresh(); Canvas2D.zoomExtents();
  }

  /* ---------- matériaux ---------- */
  const nf = (v, dg = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: dg, minimumFractionDigits: dg }));
  function matLibDialog() {
    const q = el('input', { class: 'fld', type: 'search', placeholder: 'Rechercher (acier, béton, PE…)', 'aria-label': 'Rechercher un matériau' });
    const wrap = el('div', { class: 'tbl-wrap' });
    const draw = () => {
      wrap.textContent = '';
      const k = q.value.trim().toLowerCase();
      const head = ['Matériau', 'ρ (kg/m³)', 'E (MPa)', 'ν', 'fy / fk (MPa)', 'fu (MPa)', 'α (10⁻⁶/K)', 'λ (W/m·K)', 'CO₂ (kg/kg)', 'Source'];
      const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...head.map((h, i) => el('th', { class: i && i < 9 ? 'n' : '', scope: 'col' }, h)))));
      const tb = el('tbody');
      for (const cat of MAT_CATS) {
        const rows = Object.entries(MATS).filter(([id, m]) => m.cat === cat && (!k || (m.nom + ' ' + id + ' ' + cat).toLowerCase().includes(k)));
        if (!rows.length) continue;
        tb.append(el('tr', { class: 'lot' }, el('td', { colspan: 10 }, cat)));
        for (const [, m] of rows) tb.append(el('tr', {}, el('td', {}, el('i', { class: 'swatch', style: `background:${m.color}` }), m.nom), el('td', { class: 'n' }, nf(m.rho)), el('td', { class: 'n' }, nf(m.E)), el('td', { class: 'n' }, nf(m.nu, 2)),
          el('td', { class: 'n' }, nf(m.fy != null ? m.fy : m.fk)), el('td', { class: 'n' }, nf(m.fu)), el('td', { class: 'n' }, m.alpha ? nf(m.alpha * 1e6, 1) : '—'), el('td', { class: 'n' }, m.R != null ? `R ${m.R}` : nf(m.lambda, 3)), el('td', { class: 'n' }, nf(m.gwp, 2)), el('td', { class: 'small' }, m.src || '')));
      }
      t.append(tb); wrap.append(t);
    };
    q.addEventListener('input', draw); draw();
    Dlg.open('Bibliothèque des matériaux', el('div', {}, q, wrap, el('p', { class: 'mut small' }, 'Valeurs caractéristiques ou nominales (Eurocodes, normes produits) et valeurs typiques signalées comme telles : à remplacer par les fiches techniques des produits retenus. fy : limite d\'élasticité (acier), fk : résistance caractéristique en compression (béton) ou en flexion (bois).')));
  }
  function compoDialog(apply) {
    const list = el('select', { size: 8, 'aria-label': 'Compositions' }, ...Object.entries(COMPOS).map(([k, c]) => el('option', { value: k }, `${c.nom}`)));
    const det = el('div', { class: 'compo-det' });
    const show = () => {
      det.textContent = '';
      const c = COMPOS[list.value]; if (!c) return;
      const ctx = c.ctx || 'mur', r = Phys.report(c.layers, ctx);
      det.append(el('table', { class: 'tbl' }, el('caption', {}, c.kind === 'wall' ? 'Couches (extérieur → intérieur)' : 'Couches (haut → bas)'),
        el('thead', {}, el('tr', {}, el('th', {}, 'Matériau'), el('th', { class: 'n' }, 'Épaisseur (mm)'), el('th', { class: 'n' }, 'R (m²·K/W)'))),
        el('tbody', {}, ...c.layers.map(([id, e], i) => el('tr', {}, el('td', {}, el('i', { class: 'swatch', style: `background:${(matOf(id) || {}).color}` }), (matOf(id) || { nom: id }).nom), el('td', { class: 'n' }, nf(e * 1000, e < 0.01 ? 2 : 0)), el('td', { class: 'n' }, nf(r.th.parts[i], 3)))))));
      const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
      det.append(el('dl', { class: 'kv' }, ...kv('Épaisseur', `${nf(r.T * 1000, 1)} mm`), ...kv('Coefficient U (EN ISO 6946)', `${nf(r.th.U, 3)} W/(m²·K)`), ...kv('Résistance R', `${nf(r.th.Rp, 2)} m²·K/W`),
        ...kv('Masse surfacique', `${nf(r.mass, 1)} kg/m²`), ...kv('Déphasage (EN ISO 13786)', `${nf(r.dyn.phase, 1)} h`), ...kv('Indice d\'affaiblissement Rw', `≈ ${r.ac.Rw} dB (${r.ac.kind.toLowerCase()})`),
        ...kv('Condensation (Glaser, hiver)', r.gl.risk ? `risque à ${r.gl.risk} interface(s)` : 'pas de condensation'), ...kv('Carbone (A1-A3)', `${nf(r.co2, 1)} kg CO₂e/m²`)));
    };
    list.addEventListener('change', show); list.value = Object.keys(COMPOS)[1]; show();
    const acts = apply ? [{ label: 'Appliquer aux murs sélectionnés', primary: true, run: () => applyCompo(list.value) }] : [];
    Dlg.open('Compositions de parois', el('div', { class: 'compo' }, list, det, el('p', { class: 'mut small' }, 'Méthodes simplifiées et indicatives (comme ArchiPlan) : EN ISO 6946 sans ponts thermiques, EN ISO 13786, loi de masse, méthode de Glaser, carbone de production générique.')), acts);
  }
  function applyCompo(id) {
    const c = COMPOS[id]; if (!c) return false;
    if (c.kind !== 'wall') { Status.msg('Seules les compositions de mur s\'appliquent aux murs tracés.', 6000); return false; }
    const ids = new Set(Tools.selection);
    const targets = Doc.get().objects.filter((o) => ids.has(o.id) && (o.type === 'line' || o.type === 'poly'));
    if (!targets.length) { Status.msg('Sélectionnez des lignes ou polylignes (murs) dans le plan.', 6000); return false; }
    const w = Math.max(1, Math.round(Phys.thickness(id) * 10) / 10);
    Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id) && (o.type === 'line' || o.type === 'poly')) { delete o.net; o.st = { kind: 'mur', w, prof: c.nom.slice(0, 30), tag: (o.st && o.st.tag) || '', comp: id }; } });
    Status.msg(`Composition « ${c.nom} » appliquée à ${targets.length} mur(s), épaisseur ${nf(w, 1)} mm.`, 6000);
    return true;
  }
  function applyMatDialog() {
    const ids = new Set(Tools.selection), t = state.treeSel;
    const objs = Doc.get().objects.filter((o) => ids.has(o.id) && (o.net || o.st || o.type === 'sym'));
    const target = objs.length ? `${objs.length} objet(s) du plan` : t && t.t === 'c' ? 'le composant sélectionné' : t && t.t === 'f' ? 'la fonction sélectionnée' : '';
    if (!target) { Status.msg('Sélectionnez un réseau, une structure, un équipement, un composant ou une fonction 3D.', 7000); return; }
    const s = matSelect('', false);
    Dlg.open('Appliquer un matériau', el('div', { class: 'frm' }, el('p', { class: 'mut' }, `Cible : ${target}.`), el('label', { class: 'lbl' }, 'Matériau', s)), [{ label: 'Appliquer', primary: true, run: () => {
      Doc.mutate((d) => {
        if (objs.length) { for (const o of d.objects) if (ids.has(o.id) && (o.net || o.st || o.type === 'sym')) o.mat = s.value; }
        else if (t.t === 'c') { const c = d.comps.find((x) => x.id === t.id); if (c) c.mat = s.value; }
        else { const f = d.features.find((x) => x.id === t.id); if (f) f.mat = s.value; }
      });
    } }]);
  }

  /* ---------- arbre de création ---------- */
  function row(icon, label, opts = {}) {
    const r = el('div', { class: 'tr-row' + (opts.on ? ' on' : '') + (opts.dim ? ' dim' : '') + (opts.sub ? ' sub' : ''), role: 'treeitem', tabindex: 0, 'aria-selected': String(!!opts.on) });
    r.append(svg(icon), el('span', { class: 'tr-l' }, label));
    if (opts.badge) r.append(el('em', { class: 'tr-b' }, opts.badge));
    if (opts.eye !== undefined) { const b = el('button', { type: 'button', class: 'ibs tg' + (opts.eye ? ' on' : ''), 'aria-pressed': String(opts.eye), 'aria-label': `Afficher : ${label}`, title: opts.eye ? 'Masquer' : 'Afficher' }); b.append(svg(I.eye)); b.addEventListener('click', (e) => { e.stopPropagation(); opts.onEye(); }); r.append(b); }
    if (opts.click) { r.addEventListener('click', opts.click); r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.click(); } }); }
    if (opts.dbl) r.addEventListener('dblclick', opts.dbl);
    return r;
  }
  function renderTree() {
    const T = $('#treeBody'); if (!T) return;
    T.textContent = '';
    const d = Doc.get(), ts = state.treeSel || {};
    const sec = (t) => T.append(el('p', { class: 'tr-sec' }, t));
    T.append(row(I.cube, d.name, { badge: d.site ? 'site' : '' }));
    sec('Origine et plans');
    for (const [k, p] of Object.entries(PLANES)) T.append(row(I[k], `Plan ${p.label}`, { sub: true, badge: p.axes, click: () => newSketch(k) }));
    T.append(row(I.plan, 'Plan général (2D)', { sub: true, on: !state.sketch && !ts.t, click: () => { exitSketch(); state.treeSel = null; if (View3D.isOn()) View3D.setMode(false); refresh(); } }));
    sec(`Esquisses (${(d.sketches || []).length})`);
    for (const s of d.sketches || []) {
      const n = d.objects.filter((o) => o.sk === s.id).length;
      T.append(row(I.skNew, s.name, { sub: true, on: state.sketch === s.id || (ts.t === 's' && ts.id === s.id), badge: `${PLANES[s.plane].label} · ${n}`, click: () => { state.treeSel = { t: 's', id: s.id }; refresh(); }, dbl: () => enterSketch(s.id) }));
    }
    if (!(d.sketches || []).length) T.append(el('p', { class: 'tr-empty' }, 'Aucune esquisse. Cliquez un plan pour en créer une.'));
    sec(`Fonctions 3D (${(d.features || []).length})`);
    for (const f of d.features || []) T.append(row(f.type === 'revolve' ? I.revolve : I.extrude, f.name, { sub: true, dim: f.hide, on: ts.t === 'f' && ts.id === f.id, badge: (Model.sketch(f.sk) || {}).name, eye: !f.hide, onEye: () => Doc.mutate((dd) => { const x = dd.features.find((y) => y.id === f.id); x.hide = !x.hide; }), click: () => { state.treeSel = { t: 'f', id: f.id }; refresh(); } }));
    sec(`Composants (${(d.comps || []).length})`);
    for (const c of d.comps || []) T.append(row(I.insert, c.name, { sub: true, on: ts.t === 'c' && ts.id === c.id, badge: c.fix ? 'fixe' : c.mate.t ? MATE_TYPES[c.mate.t].split(' ')[0].toLowerCase() : '', click: () => { state.treeSel = { t: 'c', id: c.id }; state.compSel = c.id; refresh(); } }));
    sec('Site');
    T.append(row(I.site, d.site ? d.site.label.split(',')[0] : 'Non défini', { sub: true, badge: d.site ? `${d.site.size} m` : '', click: () => Site.dialog() }));
  }

  /* ---------- panneau Propriétés (élément de l'arbre sélectionné) ---------- */
  function panel() {
    const t = state.treeSel; if (!t) return null;
    const d = Doc.get(), kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
    if (t.t === 's') {
      const s = Model.sketch(t.id); if (!s) return null;
      const name = el('input', { class: 'fld', type: 'text', maxlength: 60, value: s.name, 'aria-label': 'Nom de l\'esquisse' });
      const off = el('input', { class: 'fld', type: 'number', step: 'any', value: s.off, 'aria-label': 'Décalage du plan en millimètres' });
      const upd = () => Doc.mutate((dd) => { const x = dd.sketches.find((y) => y.id === s.id); x.name = name.value.trim().slice(0, 60) || x.name; const v = Number(off.value); if (Number.isFinite(v)) x.off = v; });
      name.addEventListener('change', upd); off.addEventListener('change', upd);
      const edit = el('button', { type: 'button', class: 'btn wide' }, state.sketch === s.id ? 'Quitter l\'esquisse' : 'Éditer l\'esquisse');
      edit.addEventListener('click', () => (state.sketch === s.id ? exitSketch() : enterSketch(s.id)));
      const ext = el('button', { type: 'button', class: 'btn wide' }, 'Bossage extrudé…'); ext.addEventListener('click', () => featureDialog('extrude'));
      const del = el('button', { type: 'button', class: 'btn danger' }, 'Supprimer l\'esquisse');
      del.addEventListener('click', () => { Doc.mutate((dd) => { dd.objects = dd.objects.filter((o) => o.sk !== s.id); dd.features = dd.features.filter((f) => f.sk !== s.id); dd.sketches = dd.sketches.filter((x) => x.id !== s.id); }); if (state.sketch === s.id) state.sketch = 0; state.treeSel = null; refresh(); });
      return el('div', {}, el('dl', { class: 'kv' }, ...kv('Esquisse', `${PLANES[s.plane].label} (${PLANES[s.plane].axes})`), ...kv('Objets', String(d.objects.filter((o) => o.sk === s.id).length)), ...kv('Contours fermés', String(Model.loops(s.id).length))),
        el('label', { class: 'lbl' }, 'Nom', name), el('label', { class: 'lbl' }, 'Décalage du plan (mm)', off), edit, ext, del);
    }
    if (t.t === 'f') {
      const f = (d.features || []).find((x) => x.id === t.id); if (!f) return null;
      const V = Model.featureVolume(f), mid = f.mat || '', M = massOf(V, mid);
      const name = el('input', { class: 'fld', type: 'text', maxlength: 60, value: f.name, 'aria-label': 'Nom de la fonction' });
      name.addEventListener('change', () => Doc.mutate((dd) => { const x = dd.features.find((y) => y.id === f.id); x.name = name.value.trim().slice(0, 60) || x.name; }));
      const quick = el('input', { class: 'fld', type: 'number', step: 'any', min: 1, max: f.type === 'revolve' ? 360 : 1e6, value: f.type === 'revolve' ? f.ang : f.d, 'aria-label': f.type === 'revolve' ? 'Angle en degrés' : 'Profondeur en millimètres' });
      quick.addEventListener('change', () => { const v = Number(quick.value); if (!(v > 0) || v > (f.type === 'revolve' ? 360 : 1e6)) { Status.msg('Valeur invalide.'); renderProps(); return; } Doc.mutate((dd) => { const x = dd.features.find((y) => y.id === f.id); if (f.type === 'revolve') x.ang = v; else x.d = v; }); });
      const edit = el('button', { type: 'button', class: 'btn wide' }, 'Modifier la fonction…'); edit.addEventListener('click', () => featureDialog(f.type, f));
      const esk = el('button', { type: 'button', class: 'btn wide' }, 'Éditer l\'esquisse'); esk.addEventListener('click', () => enterSketch(f.sk));
      const del = el('button', { type: 'button', class: 'btn danger' }, 'Supprimer la fonction');
      del.addEventListener('click', () => { Doc.mutate((dd) => { dd.features = dd.features.filter((x) => x.id !== f.id); }); state.treeSel = null; refresh(); });
      return el('div', {}, el('dl', { class: 'kv' }, ...kv('Type', FEATURE_TYPES[f.type]), ...kv('Esquisse', (Model.sketch(f.sk) || {}).name || '—'), ...kv('Volume', fmtV(V)), ...kv('Matériau', mid ? matOf(mid).nom : '—'), ...kv('Masse', M ? `${nf(M, 1)} kg` : '—')),
        el('label', { class: 'lbl' }, 'Nom', name), el('label', { class: 'lbl' }, f.type === 'revolve' ? 'Angle (°)' : 'Profondeur (mm)', quick), edit, esk, del);
    }
    if (t.t === 'c') {
      const c = (d.comps || []).find((x) => x.id === t.id); if (!c) return null;
      const R = Model.resolve(d.comps), pos = R.pos.get(c.id), wb = Model.worldBox(c, pos), V = Model.partVolume(c.part), M = V ? massOf(V, c.mat) : null;
      const patch = (fn) => Doc.mutate((dd) => { const x = dd.comps.find((y) => y.id === c.id); if (x) fn(x); });
      const box = el('div', { class: 'netbox' }, el('b', {}, PARTS[c.part.t].label));
      for (const [k, lab, kind, mn, mx] of PARTS[c.part.t].fields) {
        let inp;
        if (kind === 'num') { inp = el('input', { class: 'fld', type: 'number', min: mn, max: mx, step: 'any', value: c.part[k], 'aria-label': lab }); inp.addEventListener('change', () => { const v = Number(inp.value); if (!(v >= mn && v <= mx)) { Status.msg(`${lab} : entre ${mn} et ${mx}.`, 5000); renderProps(); return; } patch((x) => { x.part[k] = v; }); }); }
        else if (kind === 'prof') { inp = el('select', { 'aria-label': lab }, ...Sections.list().map((p) => el('option', { value: p, selected: p === c.part[k] }, p))); inp.addEventListener('change', () => patch((x) => { x.part[k] = inp.value; })); }
        else { inp = el('select', { 'aria-label': lab }, ...Object.entries(mn).map(([v, tx]) => el('option', { value: v, selected: v === c.part[k] }, tx))); inp.addEventListener('change', () => patch((x) => { x.part[k] = inp.value; })); }
        box.append(el('label', { class: 'lbl' }, lab, inp));
      }
      const name = el('input', { class: 'fld', type: 'text', maxlength: 60, value: c.name, 'aria-label': 'Nom du composant' });
      name.addEventListener('change', () => patch((x) => { x.name = name.value.trim().slice(0, 60) || x.name; }));
      const P = (i, lab) => { const inp = el('input', { class: 'fld', type: 'number', step: 'any', value: Math.round(c.pos[i] * 10) / 10, 'aria-label': lab, disabled: c.fix }); inp.addEventListener('change', () => { const v = Number(inp.value); if (Number.isFinite(v)) patch((x) => { x.pos[i] = v; }); }); return el('label', { class: 'lbl' }, lab, inp); };
      const rot = el('input', { class: 'fld', type: 'number', step: 15, value: c.rot, 'aria-label': 'Rotation en degrés', disabled: c.fix });
      rot.addEventListener('change', () => { const v = Number(rot.value); if (Number.isFinite(v)) patch((x) => { x.rot = ((v % 360) + 360) % 360; }); });
      const mat = matSelect(c.mat, false); mat.addEventListener('change', () => patch((x) => { x.mat = mat.value; }));
      const lay = layerSelect(c.layer); lay.addEventListener('change', () => patch((x) => { x.layer = +lay.value; }));
      const mt = c.fix ? 'Fixe' : c.mate.t ? `${MATE_TYPES[c.mate.t]} : ${((d.comps || []).find((x) => x.id === c.mate.ref) || {}).name || '?'}` : 'Libre';
      const dup = el('button', { type: 'button', class: 'btn wide' }, 'Dupliquer'); dup.addEventListener('click', dupComp);
      const del = el('button', { type: 'button', class: 'btn danger' }, 'Supprimer'); del.addEventListener('click', delComp);
      return el('div', {}, el('dl', { class: 'kv' }, ...kv('Contrainte', mt), ...kv('Position résolue', `${nf(pos[0])} ; ${nf(pos[1])} ; ${nf(pos[2])} mm`), ...kv('Encombrement', `${nf(wb[3] - wb[0])} × ${nf(wb[4] - wb[1])} × ${nf(wb[5] - wb[2])} mm`), ...kv('Volume', V ? fmtV(V) : '—'), ...kv('Masse', M ? `${nf(M, 1)} kg` : '—')),
        el('label', { class: 'lbl' }, 'Nom', name), box, el('div', { class: 'row2b' }, P(0, 'X (mm)'), P(1, 'Y (mm)')), el('div', { class: 'row2b' }, P(2, 'Z (mm)'), el('label', { class: 'lbl' }, 'Rotation (°)', rot)),
        c.mate.t && !c.fix ? el('p', { class: 'mut small' }, 'La contrainte recalcule la position : les champs X, Y, Z servent de point de départ.') : '',
        el('label', { class: 'lbl' }, 'Matériau', mat), el('label', { class: 'lbl' }, 'Calque', lay), dup, del);
    }
    return null;
  }
  const renderProps = () => { if (typeof UI !== 'undefined') UI.renderProps(); };

  function refresh() {
    renderTree();
    const s = state.sketch ? Model.sketch(state.sketch) : null;
    $('#skBar').hidden = !s;
    if (s) $('#skBarTxt').textContent = `Édition de « ${s.name} » · plan ${PLANES[s.plane].label} (${PLANES[s.plane].axes})${s.off ? ` décalé de ${s.off} mm` : ''}`;
    document.querySelectorAll('#ribbon [data-cmd="skExit"]').forEach((b) => { b.disabled = !s; });
    renderProps();
    if (View3D.isOn()) View3D.refresh();
  }
  return { build, setTab, refresh, renderTree, panel, run, newSketch, enterSketch, exitSketch, addComp, generateBuilding, applyCompo, toggleTree, current: () => curTab };
})();
