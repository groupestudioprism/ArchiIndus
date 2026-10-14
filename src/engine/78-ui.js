/* Interface : rail d'outils, panneau des calques, propriétés de la sélection, boutons d'en-tête, barre d'état, saisie de longueur. */
const UI = (() => {
  const TYPE_LABEL = { line: 'Ligne', poly: 'Polyligne', circle: 'Cercle', dim: 'Cote', text: 'Texte' };
  const GROUP_LABEL = { humide: 'Réseau humide', sec: 'Réseau sec', structure: 'Structure', equipement: 'Équipement', divers: 'Divers' };
  const cmd = $('#cmd');

  /* --- Saisie de longueur --- */
  function hideCmd() { cmd.hidden = true; cmd.blur(); }
  function focusCmd(ch) { cmd.hidden = false; cmd.value = ch; cmd.focus(); }

  function bindCmd() {
    cmd.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (Tools.typed(cmd.value)) { cmd.value = ''; hideCmd(); }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cmd.value = '';
        hideCmd();
      }
    });
    cmd.addEventListener('blur', () => { if (!cmd.value) cmd.hidden = true; });
  }

  /* --- Calques --- */
  function renderLayers() {
    const box = $('#layers');
    box.textContent = '';
    const d = Doc.get();
    const counts = new Map();
    d.objects.forEach((o) => counts.set(o.layer, (counts.get(o.layer) || 0) + 1));
    for (const l of d.layers) {
      const id = l.id;
      const row = el('div', { class: 'ly' + (id === d.active ? ' on' : '') });
      const radio = el('input', { type: 'radio', name: 'activeLayer', 'aria-label': `Calque actif : ${l.name}`, title: 'Calque actif (les nouveaux objets y sont dessinés)', checked: id === d.active });
      radio.addEventListener('change', () => Doc.setActive(id));
      const vis = el('input', { type: 'checkbox', 'aria-label': `Visible : ${l.name}`, title: 'Visible', checked: l.visible });
      vis.addEventListener('change', () => Doc.mutate((dd) => { dd.layers.find((x) => x.id === id).visible = vis.checked; }));
      const lock = el('input', { type: 'checkbox', class: 'lk', 'aria-label': `Verrouillé : ${l.name}`, title: 'Verrouillé (objets non modifiables)', checked: l.locked });
      lock.addEventListener('change', () => Doc.mutate((dd) => { dd.layers.find((x) => x.id === id).locked = lock.checked; }));
      const col = el('input', { type: 'color', value: l.color, 'aria-label': `Couleur : ${l.name}`, title: GROUP_LABEL[l.group] || '' });
      col.addEventListener('change', () => Doc.mutate((dd) => { dd.layers.find((x) => x.id === id).color = col.value; }));
      const name = el('input', { type: 'text', value: l.name, maxlength: 60, 'aria-label': 'Nom du calque' });
      name.addEventListener('change', () => {
        const v = name.value.trim().slice(0, 60);
        if (!v) { name.value = l.name; return; }
        Doc.mutate((dd) => { dd.layers.find((x) => x.id === id).name = v; });
      });
      const n = counts.get(id) || 0;
      const del = el('button', { type: 'button', class: 'ib', title: n ? 'Calque non vide : impossible à supprimer' : 'Supprimer le calque', 'aria-label': `Supprimer le calque ${l.name}`, disabled: n > 0 || d.layers.length <= 1 }, '✕');
      del.addEventListener('click', () => Doc.mutate((dd) => {
        dd.layers = dd.layers.filter((x) => x.id !== id);
        if (dd.active === id) dd.active = dd.layers[0].id;
      }));
      row.append(radio, vis, lock, col, name, del);
      box.append(row);
    }
  }

  function addLayer() {
    Doc.mutate((d) => {
      const id = d.nextLayerId++;
      d.layers.push({ id, name: `Calque ${id}`, color: '#0877B9', group: 'divers', visible: true, locked: false });
      d.active = id;
    });
  }

  /* --- Propriétés de la sélection --- */
  function renderProps() {
    const box = $('#props');
    box.textContent = '';
    const objs = Doc.get().objects.filter((o) => Tools.selection.has(o.id));
    if (!objs.length) { box.append(el('p', { class: 'mut' }, 'Aucune sélection.')); return; }
    const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
    const dl = el('dl', { class: 'kv' });
    if (objs.length === 1) {
      const o = objs[0];
      dl.append(...kv('Type', TYPE_LABEL[o.type] || o.type));
      const len = Geo.length(o);
      if (len !== null) dl.append(...kv(o.type === 'circle' || (o.type === 'poly' && o.closed) ? 'Périmètre' : 'Longueur', fmt(len) + ' mm'));
      if (o.type === 'circle') dl.append(...kv('Rayon', fmt(o.r) + ' mm'));
      const ar = Geo.area(o);
      if (ar !== null) dl.append(...kv('Surface', ar.toFixed(3) + ' m²'));
      if (o.type === 'text') dl.append(...kv('Texte', o.text));
    } else {
      dl.append(...kv('Objets', String(objs.length)));
    }
    box.append(dl);
    const sel = el('select', { 'aria-label': 'Calque des objets sélectionnés' });
    const same = objs.every((o) => o.layer === objs[0].layer);
    if (!same) sel.append(el('option', { value: '' }, '— plusieurs calques —'));
    for (const l of Doc.get().layers) sel.append(el('option', { value: l.id, selected: same && l.id === objs[0].layer }, l.name));
    sel.addEventListener('change', () => {
      const lid = Number(sel.value);
      if (!lid) return;
      const ids = new Set(objs.map((o) => o.id));
      Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) o.layer = lid; });
    });
    box.append(el('label', { class: 'lbl' }, 'Calque', sel));
    const del = el('button', { type: 'button', class: 'btn danger' }, 'Supprimer');
    del.addEventListener('click', () => Tools.deleteSel());
    box.append(del);
  }

  /* --- En-tête, rail, barre d'état --- */
  function refreshChrome() {
    $('#undo').disabled = !Doc.canUndo();
    $('#redo').disabled = !Doc.canRedo();
    const pn = $('#pname');
    if (document.activeElement !== pn) pn.value = Doc.get().name;
    const s = Doc.saveState();
    $('#saved').textContent = s === 'saved' ? 'enregistré dans ce navigateur' : s === 'pending' ? 'enregistrement…' : 'enregistrement local impossible';
    $('#saved').classList.toggle('err', s === 'error');
    document.title = `${Doc.get().name} · ARCHIINDUS`;
  }

  function refreshTools() {
    const t = Tools.current();
    document.querySelectorAll('.tool').forEach((b) => {
      const on = b.dataset.tool === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#hint').textContent = `${Tools.NAMES[t]} : ${Tools.HINTS[t]}`;
    $('#cv').style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
  }

  function refreshModes() {
    $('#snapBtn').textContent = 'Accroches : ' + (state.snap.on ? 'oui' : 'non');
    $('#snapBtn').setAttribute('aria-pressed', String(state.snap.on));
    $('#orthoBtn').textContent = 'Ortho : ' + (state.snap.ortho ? 'oui' : 'non');
    $('#orthoBtn').setAttribute('aria-pressed', String(state.snap.ortho));
  }

  function init() {
    bindCmd();
    document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => { Tools.setTool(b.dataset.tool); b.blur(); }));
    $('#theme').addEventListener('click', () => { Theme.toggle(); Canvas2D.draw(); });
    $('#undo').addEventListener('click', () => Doc.undo());
    $('#redo').addEventListener('click', () => Doc.redo());
    $('#new').addEventListener('click', () => { Doc.reset(); Tools.selection.clear(); Canvas2D.zoomExtents(); Status.msg('Nouveau projet. Ctrl+Z pour revenir au précédent.'); });
    $('#open').addEventListener('click', () => $('#file').click());
    $('#file').addEventListener('change', (e) => { IO.openFile(e.target.files[0]); e.target.value = ''; });
    $('#save').addEventListener('click', () => IO.saveJSON());
    $('#svg').addEventListener('click', () => IO.exportSVG());
    $('#dxf').addEventListener('click', () => IO.exportDXF());
    $('#addLayer').addEventListener('click', addLayer);
    $('#snapBtn').addEventListener('click', () => Tools.toggleSnap());
    $('#orthoBtn').addEventListener('click', () => Tools.toggleOrtho());
    $('#fitBtn').addEventListener('click', () => Canvas2D.zoomExtents());
    $('#pname').addEventListener('change', (e) => {
      const v = e.target.value.trim().slice(0, 80) || 'Projet sans titre';
      Doc.mutate((d) => { d.name = v; });
    });
    $('#pname').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

    Doc.on(() => { renderLayers(); renderProps(); refreshChrome(); Canvas2D.requestDraw(); });
    Tools.onChange((reason) => {
      if (reason === 'selection') renderProps();
      else if (reason === 'tool') refreshTools();
      else if (reason === 'mode') refreshModes();
    });
    renderLayers(); renderProps(); refreshChrome(); refreshTools(); refreshModes();
  }

  return { init, focusCmd };
})();
