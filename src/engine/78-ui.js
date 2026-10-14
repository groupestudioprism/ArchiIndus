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

  /* --- Réseau : attributs DN / matériau / repère de la sélection (lignes et polylignes) --- */
  function netForm(objs) {
    const ids = new Set(objs.map((o) => o.id));
    const common = (k) => (objs.every((o) => o.net && o.net[k] === objs[0].net?.[k]) ? objs[0].net[k] : '');
    const dn = el('input', { class: 'fld', type: 'number', min: 1, max: NET_DN_MAX, step: 'any', 'aria-label': 'Diamètre nominal en millimètres', value: common('dn') });
    const mat = el('input', { class: 'fld', type: 'text', list: 'netMats', maxlength: 30, 'aria-label': 'Matériau', value: common('mat') });
    const tag = el('input', { class: 'fld', type: 'text', maxlength: 30, 'aria-label': 'Repère', value: objs.length === 1 ? (objs[0].net?.tag || '') : '', disabled: objs.length > 1, placeholder: objs.length > 1 ? '(un seul objet)' : 'ex. EU-01' });
    const apply = el('button', { type: 'button', class: 'btn wide' }, 'Appliquer comme réseau');
    apply.addEventListener('click', () => {
      const v = Number(dn.value);
      if (!Number.isFinite(v) || v <= 0 || v > NET_DN_MAX) { Status.msg(`Diamètre invalide : entrez un DN entre 1 et ${NET_DN_MAX} mm.`, 6000); return; }
      Doc.mutate((d) => {
        for (const o of d.objects) {
          if (!ids.has(o.id)) continue;
          o.net = cleanNet({ dn: v, mat: mat.value, tag: objs.length === 1 ? tag.value : (o.net?.tag || '') });
        }
      });
    });
    const box = el('div', { class: 'netbox' }, el('b', {}, 'Réseau'),
      el('label', { class: 'lbl' }, 'DN (mm)', dn), el('label', { class: 'lbl' }, 'Matériau', mat), el('label', { class: 'lbl' }, 'Repère', tag), apply);
    if (objs.some((o) => o.net)) {
      const rm = el('button', { type: 'button', class: 'btn wide' }, 'Retirer le réseau');
      rm.addEventListener('click', () => Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) delete o.net; }));
      box.append(rm);
    }
    return box;
  }

  function bindNetDefaults() {
    const dl = $('#netMats');
    for (const m of NET_MATERIALS) dl.append(el('option', { value: m }));
    const on = $('#netOn'), dn = $('#netDn'), mat = $('#netMat');
    const sync = () => {
      const v = Number(dn.value);
      state.net.on = on.checked;
      state.net.dn = Number.isFinite(v) && v > 0 && v <= NET_DN_MAX ? v : state.net.dn;
      state.net.mat = mat.value.trim().slice(0, 30);
    };
    on.addEventListener('change', () => { sync(); Status.msg(on.checked ? `Tracé en réseau : DN${state.net.dn}.` : 'Tracé en réseau désactivé.'); });
    dn.addEventListener('change', sync);
    mat.addEventListener('change', sync);
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
      if (o.net) dl.append(...kv('Réseau', `DN${o.net.dn}${o.net.mat ? ' · ' + o.net.mat : ''}${o.net.tag ? ' · ' + o.net.tag : ''}`));
    } else {
      dl.append(...kv('Objets', String(objs.length)));
    }
    box.append(dl);
    if (objs.every((o) => o.type === 'line' || o.type === 'poly')) box.append(netForm(objs));
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
    $('#saved').textContent += Cloud.suffix();
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
    bindNetDefaults();
    document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => { Tools.setTool(b.dataset.tool); b.blur(); }));
    $('#theme').addEventListener('click', () => { Theme.toggle(); Canvas2D.draw(); });
    $('#undo').addEventListener('click', () => Doc.undo());
    $('#redo').addEventListener('click', () => Doc.redo());
    $('#new').addEventListener('click', () => { Cloud.forget(); Doc.reset(); Tools.selection.clear(); Canvas2D.zoomExtents(); Status.msg('Nouveau projet. Ctrl+Z pour revenir au précédent.'); });
    $('#open').addEventListener('click', () => $('#file').click());
    $('#file').addEventListener('change', (e) => { IO.openFile(e.target.files[0]); e.target.value = ''; });
    $('#save').addEventListener('click', () => IO.saveJSON());
    $('#svg').addEventListener('click', () => IO.exportSVG());
    $('#dxf').addEventListener('click', () => IO.exportDXF());
    $('#pdf').addEventListener('click', () => PDF.dialog());
    $('#acct').addEventListener('click', () => Account.open());
    $('#cloud').addEventListener('click', () => Home.open());
    Cloud.on(refreshChrome);
    Account.on(() => { const m = Account.me(); $('#acct').textContent = m ? (m.firstName || 'Compte') : 'Compte'; $('#acct').title = m ? `${m.email} · Compte Studio Prism` : 'Compte Studio Prism'; });
    $('#bom').addEventListener('click', () => BOM.show());
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
