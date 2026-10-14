/* Interface : rail d'outils, panneau des calques, propriétés de la sélection, boutons d'en-tête, barre d'état, saisie de longueur. */
const UI = (() => {
  const TYPE_LABEL = { line: 'Ligne', poly: 'Polyligne', circle: 'Cercle', dim: 'Cote', text: 'Texte', sym: 'Équipement' };
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
  const ICON = {
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.7A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
    s.innerHTML = ICON[name];
    return s;
  }
  function toggleBtn(on, names, label, title, run) {
    const b = el('button', { type: 'button', class: 'ib tg' + (on ? ' on' : ''), 'aria-pressed': String(on), 'aria-label': label, title });
    b.append(icon(on ? names[0] : names[1]));
    b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
    return b;
  }

  function renderLayers() {
    const box = $('#layers');
    box.textContent = '';
    const d = Doc.get();
    const counts = new Map();
    d.objects.forEach((o) => counts.set(o.layer, (counts.get(o.layer) || 0) + 1));
    $('#layerCount').textContent = String(d.layers.length);
    for (const l of d.layers) {
      const id = l.id, act = id === d.active, n = counts.get(id) || 0;
      const row = el('div', { class: 'ly' + (act ? ' on' : '') + (l.visible ? '' : ' off'), role: 'group', 'aria-label': `Calque ${l.name}` });
      const pick = el('button', { type: 'button', class: 'ly-pick', 'aria-pressed': String(act), 'aria-label': `Calque actif : ${l.name}`, title: act ? 'Calque actif' : 'Définir comme calque actif (les nouveaux objets y sont dessinés)' });
      pick.addEventListener('click', () => Doc.setActive(id));
      const col = el('input', { type: 'color', class: 'ly-col', value: l.color, 'aria-label': `Couleur : ${l.name}`, title: 'Couleur · ' + (GROUP_LABEL[l.group] || '') });
      col.addEventListener('change', () => Doc.mutate((dd) => { dd.layers.find((x) => x.id === id).color = col.value; }));
      const name = el('input', { type: 'text', class: 'ly-name', value: l.name, maxlength: 60, 'aria-label': 'Nom du calque' });
      name.addEventListener('change', () => {
        const v = name.value.trim().slice(0, 60);
        if (!v) { name.value = l.name; return; }
        Doc.mutate((dd) => { dd.layers.find((x) => x.id === id).name = v; });
      });
      const cnt = el('span', { class: 'ly-n', title: `${n} objet${n > 1 ? 's' : ''}` }, String(n));
      const vis = toggleBtn(l.visible, ['eye', 'eyeOff'], `Visible : ${l.name}`, l.visible ? 'Masquer le calque' : 'Afficher le calque', () => Doc.mutate((dd) => { const x = dd.layers.find((y) => y.id === id); x.visible = !x.visible; }));
      const lock = toggleBtn(l.locked, ['lock', 'unlock'], `Verrouillé : ${l.name}`, l.locked ? 'Déverrouiller (objets modifiables)' : 'Verrouiller (objets non modifiables)', () => Doc.mutate((dd) => { const x = dd.layers.find((y) => y.id === id); x.locked = !x.locked; }));
      lock.classList.add('lk');
      const del = el('button', { type: 'button', class: 'ib del', title: n ? 'Calque non vide : impossible à supprimer' : 'Supprimer le calque', 'aria-label': `Supprimer le calque ${l.name}`, disabled: n > 0 || d.layers.length <= 1 });
      del.append(icon('trash'));
      del.addEventListener('click', () => Doc.mutate((dd) => {
        dd.layers = dd.layers.filter((x) => x.id !== id);
        if (dd.active === id) dd.active = dd.layers[0].id;
      }));
      row.append(pick, col, name, cnt, vis, lock, del);
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

  /* --- Sections repliables du panneau (état mémorisé dans ce navigateur) --- */
  function bindSections() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('ai.panel') || '{}') || {}; } catch (e) { saved = {}; }
    document.querySelectorAll('#panel .pn').forEach((sec) => {
      const btn = sec.querySelector('.pn-h button'), body = sec.querySelector('.pn-b'), key = sec.dataset.sec;
      const set = (open) => { btn.setAttribute('aria-expanded', String(open)); body.hidden = !open; sec.classList.toggle('closed', !open); };
      set(key in saved ? !!saved[key] : btn.getAttribute('aria-expanded') === 'true');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        set(open); saved[key] = open;
        try { localStorage.setItem('ai.panel', JSON.stringify(saved)); } catch (e) { /* stockage indisponible : sans conséquence */ }
      });
    });
  }

  /* --- Mode de tracé : simple / réseau / mur / poutre --- */
  const MODE_HINT = {
    none: 'Les lignes et polylignes sont tracées sans attribut.',
    net: 'Les lignes et polylignes ouvertes reçoivent un diamètre (DN) et un matériau.',
    mur: 'Les lignes et polylignes deviennent des murs : bande d\'épaisseur réelle autour de l\'axe tracé.',
    poutre: 'Les lignes et polylignes deviennent des poutres : axe tracé et largeur du profilé.',
  };
  function setMode(m) {
    state.mode = m; state.net.on = m === 'net';
    document.querySelectorAll('#panel .seg [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
    $('#fldNet').hidden = m !== 'net'; $('#fldMur').hidden = m !== 'mur'; $('#fldPoutre').hidden = m !== 'poutre';
    $('#modeHint').textContent = MODE_HINT[m];
  }
  function bindModeFields() {
    for (const m of NET_MATERIALS) $('#netMats').append(el('option', { value: m }));
    for (const v of ST_KINDS.mur.ex) $('#stMur').append(el('option', { value: v }));
    for (const v of ST_KINDS.poutre.ex) $('#stPoutre').append(el('option', { value: v }));
    document.querySelectorAll('#panel .seg [data-mode]').forEach((b) => b.addEventListener('click', () => {
      setMode(b.dataset.mode);
      Status.msg(b.dataset.mode === 'none' ? 'Tracé simple.' : `Tracé en mode ${b.textContent.toLowerCase()}.`);
    }));
    const wOk = (v) => Number.isFinite(v) && v > 0;
    const sync = () => {
      const dn = Number($('#netDn').value);
      state.net.dn = wOk(dn) && dn <= NET_DN_MAX ? dn : state.net.dn;
      state.net.mat = $('#netMat').value.trim().slice(0, 30);
      for (const [k, w, p] of [['mur', '#murW', '#murProf'], ['poutre', '#poutreW', '#poutreProf']]) {
        const v = Number($(w).value);
        if (wOk(v) && v <= ST_W_MAX) state.st.w[k] = v;
        state.st.prof[k] = $(p).value.trim().slice(0, 30);
      }
    };
    ['#netDn', '#netMat', '#murW', '#murProf', '#poutreW', '#poutreProf'].forEach((id) => { $(id).addEventListener('change', sync); $(id).addEventListener('input', sync); });
    $('#netDn').value = state.net.dn; $('#murW').value = state.st.w.mur; $('#poutreW').value = state.st.w.poutre;
    setMode(state.mode);
  }

  /* --- Bibliothèque d'équipements et de poteaux --- */
  function thumb(k) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-0.62 -0.62 1.24 1.24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'sym-svg');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'scale(1,-1)'); g.setAttribute('fill', 'none'); g.setAttribute('stroke', 'currentColor');
    g.setAttribute('stroke-width', '0.07'); g.setAttribute('stroke-linejoin', 'round'); g.setAttribute('stroke-linecap', 'round');
    for (const e of Sym.world({ k, c: [0, 0], s: 1, rot: 0 })) {
      let n;
      if (e.type === 'line') { n = document.createElementNS(NS, 'line'); n.setAttribute('x1', e.a[0]); n.setAttribute('y1', e.a[1]); n.setAttribute('x2', e.b[0]); n.setAttribute('y2', e.b[1]); }
      else if (e.type === 'circle') { n = document.createElementNS(NS, 'circle'); n.setAttribute('cx', e.c[0]); n.setAttribute('cy', e.c[1]); n.setAttribute('r', e.r); }
      else { n = document.createElementNS(NS, e.closed ? 'polygon' : 'polyline'); n.setAttribute('points', e.pts.map((q) => q.join(',')).join(' ')); }
      g.append(n);
    }
    svg.append(g);
    return svg;
  }

  function renderLib() {
    const grid = $('#symGrid');
    if (!grid.childNodes.length) {
      for (const [gid, gname] of Object.entries(SYM_GROUPS)) {
        grid.append(el('p', { class: 'sym-g' }, gname));
        const list = el('div', { class: 'sym-list' });
        for (const [k, def] of Object.entries(SYMBOLS)) {
          if (def.group !== gid) continue;
          const b = el('button', { type: 'button', class: 'sym-btn', 'data-k': k, title: `${def.label} (${def.size} mm)`, 'aria-label': def.label, 'aria-pressed': 'false' });
          b.append(thumb(k), el('span', {}, def.label));
          b.addEventListener('click', () => {
            state.sym.k = k; state.sym.s = def.size; state.sym.tag = '';
            Tools.setTool('sym'); renderLib();
          });
          list.append(b);
        }
        grid.append(list);
      }
    }
    grid.querySelectorAll('.sym-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === state.sym.k && Tools.current() === 'sym')));
    const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    set('#symS', state.sym.s); set('#symRot', state.sym.rot); set('#symTag', state.sym.tag);
  }

  function bindLib() {
    const sync = () => {
      const s = Number($('#symS').value), r = Number($('#symRot').value);
      if (Number.isFinite(s) && s >= SYM_MIN && s <= SYM_MAX) state.sym.s = s;
      if (Number.isFinite(r)) state.sym.rot = ((r % 360) + 360) % 360;
      state.sym.tag = $('#symTag').value.trim().slice(0, 30);
      Canvas2D.requestDraw();
    };
    ['#symS', '#symRot', '#symTag'].forEach((id) => { $(id).addEventListener('input', sync); $(id).addEventListener('change', sync); });
    renderLib();
  }

  /* --- Structure : mur ou poutre appliqué à la sélection --- */
  function stForm(objs) {
    const ids = new Set(objs.map((o) => o.id));
    const cur = objs.every((o) => o.st && o.st.kind === objs[0].st?.kind) ? objs[0].st : null;
    const kind = el('select', { 'aria-label': 'Type de structure' }, ...Object.entries(ST_KINDS).map(([k, v]) => el('option', { value: k, selected: (cur ? cur.kind : 'mur') === k }, v.label)));
    const w = el('input', { class: 'fld', type: 'number', min: 1, max: ST_W_MAX, step: 'any', 'aria-label': 'Épaisseur ou largeur en millimètres', value: cur ? cur.w : ST_KINDS.mur.wDef });
    const prof = el('input', { class: 'fld', type: 'text', maxlength: 30, 'aria-label': 'Matériau ou profilé', value: cur ? cur.prof : '' });
    const tag = el('input', { class: 'fld', type: 'text', maxlength: 30, 'aria-label': 'Repère de structure', value: objs.length === 1 ? (objs[0].st?.tag || '') : '', disabled: objs.length > 1, placeholder: objs.length > 1 ? '(un seul objet)' : 'ex. M1' });
    const lw = el('label', { class: 'lbl' }, ST_KINDS[kind.value].wLabel, w), lp = el('label', { class: 'lbl' }, ST_KINDS[kind.value].pLabel, prof);
    kind.addEventListener('change', () => {
      const k = ST_KINDS[kind.value];
      lw.firstChild.nodeValue = k.wLabel; lp.firstChild.nodeValue = k.pLabel; w.value = k.wDef;
      prof.setAttribute('list', kind.value === 'mur' ? 'stMur' : 'stPoutre');
    });
    prof.setAttribute('list', kind.value === 'mur' ? 'stMur' : 'stPoutre');
    const apply = el('button', { type: 'button', class: 'btn wide' }, 'Appliquer comme structure');
    apply.addEventListener('click', () => {
      const c = cleanSt({ kind: kind.value, w: Number(w.value), prof: prof.value, tag: objs.length === 1 ? tag.value : '' });
      if (!c) { Status.msg(`Largeur invalide : entrez une valeur entre 1 et ${ST_W_MAX} mm.`, 6000); return; }
      Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) { o.st = { ...c, tag: objs.length === 1 ? c.tag : (o.st?.tag || '') }; delete o.net; } });
    });
    const box = el('div', { class: 'netbox' }, el('b', {}, 'Structure'), el('label', { class: 'lbl' }, 'Type', kind), lw, lp, el('label', { class: 'lbl' }, 'Repère', tag), apply);
    if (objs.some((o) => o.st)) {
      const rm = el('button', { type: 'button', class: 'btn wide' }, 'Retirer la structure');
      rm.addEventListener('click', () => Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) delete o.st; }));
      box.append(rm);
    }
    return box;
  }

  /* --- Équipement sélectionné : type, taille, rotation, repère (appliqués immédiatement) --- */
  function symForm(o) {
    const id = o.id;
    const patch = (f) => Doc.mutate((d) => { const x = d.objects.find((y) => y.id === id); if (x) f(x); });
    const kind = el('select', { 'aria-label': 'Type de symbole' }, ...Object.entries(SYMBOLS).map(([k, v]) => el('option', { value: k, selected: k === o.k }, v.label)));
    kind.addEventListener('change', () => patch((x) => { x.k = kind.value; }));
    const num = (label, key, min, max, step) => {
      const i = el('input', { class: 'fld', type: 'number', min, max, step, 'aria-label': label, value: o[key] });
      i.addEventListener('change', () => { const v = Number(i.value); if (!Number.isFinite(v) || v < min || v > max) { i.value = o[key]; Status.msg(`${label} : valeur entre ${min} et ${max}.`, 5000); return; } patch((x) => { x[key] = key === 'rot' ? ((v % 360) + 360) % 360 : v; }); });
      return i;
    };
    const tag = el('input', { class: 'fld', type: 'text', maxlength: 30, 'aria-label': 'Repère', value: o.tag || '' });
    tag.addEventListener('change', () => patch((x) => { x.tag = tag.value.trim().slice(0, 30); }));
    return el('div', { class: 'netbox' }, el('b', {}, 'Équipement'), el('label', { class: 'lbl' }, 'Type', kind),
      el('div', { class: 'row2b' }, el('label', { class: 'lbl' }, 'Taille (mm)', num('Taille en millimètres', 's', SYM_MIN, SYM_MAX, 'any')), el('label', { class: 'lbl' }, 'Rotation (°)', num('Rotation en degrés', 'rot', 0, 360, 15))),
      el('label', { class: 'lbl' }, 'Repère', tag));
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
      if (o.type === 'sym') dl.append(...kv('Symbole', SYMBOLS[o.k].label), ...kv('Taille', fmt(o.s) + ' mm'), ...kv('Rotation', o.rot + ' °'), ...(o.tag ? kv('Repère', o.tag) : []));
      if (o.st) dl.append(...kv(ST_KINDS[o.st.kind].label, `${o.st.w} mm${o.st.prof ? ' · ' + o.st.prof : ''}${o.st.tag ? ' · ' + o.st.tag : ''}`));
      if (o.net) dl.append(...kv('Réseau', `DN${o.net.dn}${o.net.mat ? ' · ' + o.net.mat : ''}${o.net.tag ? ' · ' + o.net.tag : ''}`));
    } else {
      dl.append(...kv('Objets', String(objs.length)));
    }
    box.append(dl);
    if (objs.every((o) => o.type === 'line' || o.type === 'poly')) { box.append(netForm(objs)); box.append(stForm(objs)); }
    if (objs.length === 1 && objs[0].type === 'sym') box.append(symForm(objs[0]));
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
    bindSections();
    bindModeFields();
    bindLib();
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
      else if (reason === 'tool') { refreshTools(); renderLib(); }
      else if (reason === 'sym') renderLib();
      else if (reason === 'mode') refreshModes();
    });
    renderLayers(); renderProps(); refreshChrome(); refreshTools(); refreshModes();
  }

  return { init, focusCmd };
})();
