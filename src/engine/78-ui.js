/* Interface : rail d'outils, panneau des calques, propriétés de la sélection, boutons d'en-tête, barre d'état, saisie de longueur. */
const UI = (() => {
  const TYPE_LABEL = { line: 'Ligne', poly: 'Polyligne', circle: 'Cercle', dim: 'Cote', text: 'Texte', sym: 'Équipement' };
  const GROUP_LABEL = { humide: 'Réseau humide', sec: 'Réseau sec', cvc: 'CVC et fluides', metal: 'Construction métallique', gc: 'Génie civil', structure: 'Structure', equipement: 'Équipement', divers: 'Divers' };
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
    const b = el('button', { type: 'button', class: 'ibs tg' + (on ? ' on' : ''), 'aria-pressed': String(on), 'aria-label': label, title });
    b.append(icon(on ? names[0] : names[1]));
    b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
    return b;
  }

  function layerRow(l, d, counts) {
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
      const del = el('button', { type: 'button', class: 'ibs del', title: n ? 'Calque non vide : impossible à supprimer' : 'Supprimer le calque', 'aria-label': `Supprimer le calque ${l.name}`, disabled: n > 0 || d.layers.length <= 1 });
      del.append(icon('trash'));
      del.addEventListener('click', () => Doc.mutate((dd) => {
        dd.layers = dd.layers.filter((x) => x.id !== id);
        if (dd.active === id) dd.active = dd.layers[0].id;
      }));
      row.append(pick, col, name, cnt, vis, lock, del);
      return row;
  }

  function renderLayers() {
    const box = $('#layers');
    box.textContent = '';
    const d = Doc.get();
    const counts = new Map();
    d.objects.forEach((o) => counts.set(o.layer, (counts.get(o.layer) || 0) + 1));
    $('#layerCount').textContent = String(d.layers.length);
    const tr = Trades.current();
    /* Calques rangés par métier : Général d'abord, puis chaque métier. Avec un métier choisi, les autres métiers sont repliés. */
    const order = ['', ...Object.keys(TRADES)];
    const buckets = new Map(order.map((k) => [k, []]));
    for (const l of d.layers) buckets.get(Trades.ofGroup(l.group))?.push(l);
    const title = (k) => (k ? TRADES[k].short : 'Général');
    const others = [];
    for (const k of order) {
      const list = buckets.get(k);
      if (!list.length) continue;
      const mine = tr === 'all' || !k || k === tr || list.some((l) => Trades.layerIn(l, tr) && TRADES[tr] && TRADES[tr].groups.includes(l.group));
      if (!mine) { others.push([k, list]); continue; }
      if (tr === 'all' ? buckets.size > 1 : true) box.append(el('p', { class: 'ly-h' }, title(k), el('em', {}, String(list.length))));
      for (const l of list) box.append(layerRow(l, d, counts));
    }
    if (others.length) {
      const det = el('details', { class: 'ly-other' }, el('summary', {}, `Autres métiers (${others.reduce((n, [, l]) => n + l.length, 0)})`));
      for (const [k, list] of others) { det.append(el('p', { class: 'ly-h' }, title(k), el('em', {}, String(list.length)))); for (const l of list) det.append(layerRow(l, d, counts)); }
      if (others.some(([, list]) => list.some((l) => l.id === d.active))) det.open = true;
      box.append(det);
    }
    const miss = TRADES[tr] ? Trades.missingLayers(tr, d.layers) : [];
    const add = $('#addTradeLayers');
    add.hidden = !miss.length;
    add.textContent = miss.length ? `+ Calques ${TRADES[tr].short.toLowerCase()} (${miss.length})` : '';
  }

  /* --- Métier : sélecteur, filtres de la bibliothèque, des modes de tracé et des calques --- */
  function applyTrade() {
    const tr = Trades.current();
    const sel = $('#tradeSel'); if (sel.value !== tr) sel.value = tr;
    document.querySelectorAll('#panel .seg [data-mode]').forEach((b) => { b.hidden = !Trades.modeAllowed(b.dataset.mode, tr); });
    if (!Trades.modeAllowed(state.mode, tr)) setMode(TRADES[tr].mode);
    const mats = TRADES[tr] && TRADES[tr].mats ? TRADES[tr].mats : NET_MATERIALS;
    const dl = $('#netMats'); dl.textContent = ''; for (const m of mats) dl.append(el('option', { value: m }));
    const d = Doc.get(), act = Doc.layer(d.active);
    if (TRADES[tr] && act && !Trades.layerIn(act, tr)) { const first = d.layers.find((l) => TRADES[tr].groups.includes(l.group)); if (first) Doc.setActive(first.id); }
    renderLayers(); renderLib();
  }
  function bindTrade() {
    const sel = $('#tradeSel');
    sel.append(el('option', { value: 'all' }, 'Tous les métiers'));
    for (const [id, t] of Object.entries(TRADES)) sel.append(el('option', { value: id }, t.label));
    sel.append(el('optgroup', { label: 'À venir (pas encore d\'outils)' }, ...TRADES_SOON.map((n) => el('option', { value: '', disabled: true }, n))));
    sel.value = Trades.current();
    sel.addEventListener('change', () => { if (Trades.set(sel.value)) { applyTrade(); Status.msg(sel.value === 'all' ? 'Tous les métiers affichés.' : `Métier : ${TRADES[sel.value].label}.`); } });
    $('#addTradeLayers').addEventListener('click', () => {
      const tr = Trades.current();
      Doc.mutate((dd) => { for (const [n, c] of Trades.missingLayers(tr, dd.layers)) { const id = dd.nextLayerId++; dd.layers.push({ id, name: n, color: c, group: TRADES[tr].groups[0], visible: true, locked: false }); } });
    });
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
          delete o.st; const pc = Props.clean(o.props, 'net'); if (pc) o.props = pc; else delete o.props;
        }
      });
    });
    const box = el('div', { class: 'netbox' }, el('b', {}, 'Réseau'),
      el('label', { class: 'lbl' }, 'DN (mm)', dn), el('label', { class: 'lbl' }, 'Matériau', mat), el('label', { class: 'lbl' }, 'Repère', tag), apply);
    if (objs.some((o) => o.net)) {
      const rm = el('button', { type: 'button', class: 'btn wide' }, 'Retirer le réseau');
      rm.addEventListener('click', () => Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) { delete o.net; delete o.props; } }));
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
    const tr = Trades.current();
    grid.textContent = '';
    const add = (title, keys) => {
      if (!keys.length) return;
      grid.append(el('p', { class: 'sym-g' }, title));
      const list = el('div', { class: 'sym-list' });
      for (const k of keys) {
        const def = SYMBOLS[k];
        const b = el('button', { type: 'button', class: 'sym-btn', 'data-k': k, title: `${def.label} (${def.size} mm)`, 'aria-label': def.label, 'aria-pressed': 'false' });
        b.append(thumb(k), el('span', {}, def.label));
        b.addEventListener('click', () => { state.sym.k = k; state.sym.s = def.size; state.sym.tag = ''; Tools.setTool('sym'); renderLib(); });
        list.append(b);
      }
      grid.append(list);
    };
    const keys = Object.keys(SYMBOLS).filter((k) => Trades.symbolIn(k, tr));
    if (tr === 'all') for (const [gid, gname] of Object.entries(SYM_GROUPS)) add(gname, keys.filter((k) => SYMBOLS[k].group === gid));
    else add(TRADES[tr].short, keys);
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
      Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) { o.st = { ...c, tag: objs.length === 1 ? c.tag : (o.st?.tag || '') }; delete o.net; const pc = Props.clean(o.props, 'st'); if (pc) o.props = pc; else delete o.props; } });
    });
    const box = el('div', { class: 'netbox' }, el('b', {}, 'Structure'), el('label', { class: 'lbl' }, 'Type', kind), lw, lp, el('label', { class: 'lbl' }, 'Repère', tag), apply);
    if (objs.some((o) => o.st)) {
      const rm = el('button', { type: 'button', class: 'btn wide' }, 'Retirer la structure');
      rm.addEventListener('click', () => Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) { delete o.st; delete o.props; } }));
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

  /* Rien de sélectionné : résumé du projet (calques visibles uniquement, comme la nomenclature). */
  function projectSummary() {
    const d = Doc.get(), b = BOM.compute();
    const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
    const dl = el('dl', { class: 'kv' });
    dl.append(...kv('Projet', d.name), ...kv('Unité', 'millimètres'), ...kv('Objets', String(d.objects.length)), ...kv('Calques', String(d.layers.length)));
    const net = b.nets.reduce((a, r) => a + r.length, 0), st = b.structs.reduce((a, r) => a + r.length, 0), eq = b.syms.reduce((a, r) => a + r.count, 0);
    if (net) dl.append(...kv('Réseaux', BOM.f2(net) + ' m'));
    if (st) dl.append(...kv('Murs et poutres', BOM.f2(st) + ' m'));
    if (eq) dl.append(...kv('Équipements', String(eq)));
    const box = el('div', {}, dl);
    if (!d.objects.length) box.append(el('p', { class: 'mut small' }, 'Dessin vide. Choisissez un outil à gauche, ou posez un équipement depuis la bibliothèque ci-dessus.'));
    else box.append(el('p', { class: 'mut small' }, 'Cliquez un objet pour modifier ses propriétés. Maj + clic ajoute à la sélection ; Ctrl+A sélectionne tout.'));
    const bom = el('button', { type: 'button', class: 'btn wide' }, 'Ouvrir la nomenclature');
    bom.addEventListener('click', () => BOM.show());
    box.append(bom);
    return box;
  }

  /* --- Propriétés techniques (même famille d'objets) : champ vide = propriété supprimée ; appliqué à la sortie du champ --- */
  function propsForm(objs) {
    const kind = Props.kindOf(objs[0]);
    if (!kind || !objs.every((o) => Props.kindOf(o) === kind)) return null;
    const ids = new Set(objs.map((o) => o.id));
    const box = el('div', { class: 'netbox' }, el('b', {}, 'Propriétés techniques'));
    const grid = el('div', { class: 'row2b' });
    for (const k of Props.keys(kind)) {
      const d = PROP_DEFS[k];
      const vals = objs.map((o) => o.props && typeof o.props[k] === 'number' ? o.props[k] : null);
      const same = vals.every((v) => v === vals[0]);
      const inp = el('input', { class: 'fld', type: 'number', min: d.min, max: d.max, step: 'any', 'aria-label': `${d.label} (${d.unit})`, value: same && vals[0] !== null ? vals[0] : '', placeholder: same ? '' : '(différent)' });
      inp.addEventListener('change', () => {
        const raw = inp.value.trim(), v = Number(raw);
        if (raw && (!Number.isFinite(v) || v < d.min || v > d.max)) { Status.msg(`${d.label} : valeur entre ${d.min} et ${d.max} ${d.unit}.`, 6000); renderProps(); return; }
        Doc.mutate((dd) => { for (const o of dd.objects) if (ids.has(o.id)) { const p = { ...(o.props || {}) }; if (raw) p[k] = v; else delete p[k]; const pc = Props.clean(p, kind); if (pc) o.props = pc; else delete o.props; } });
      });
      grid.append(el('label', { class: 'lbl' }, `${d.label} (${d.unit})`, inp));
    }
    box.append(grid);
    if (objs.length === 1) { const sl = Props.slopeStr(objs[0]); if (sl) box.append(el('p', { class: 'mut small' }, `Pente moyenne : ${sl} (calculée sur la longueur tracée).`)); }
    return box;
  }

  /* --- Propriétés de la sélection --- */
  function renderProps() {
    const box = $('#props');
    box.textContent = '';
    const objs = Doc.get().objects.filter((o) => Tools.selection.has(o.id));
    if (!objs.length) { box.append(Workbench.panel() || projectSummary()); return; }
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
      const by = new Map();
      for (const o of objs) by.set(o.type, (by.get(o.type) || 0) + 1);
      for (const [t, n] of by) dl.append(...kv(TYPE_LABEL[t] || t, String(n)));
      const tot = objs.reduce((a, o) => a + ((o.type === 'line' || o.type === 'poly') ? (Geo.length(o) || 0) : 0), 0);
      if (tot > 0) dl.append(...kv('Longueur cumulée', fmt(tot / 1000) + ' m'));
    }
    box.append(dl);
    if (objs.every((o) => o.type === 'line' || o.type === 'poly')) { box.append(netForm(objs)); box.append(stForm(objs)); }
    if (objs.length === 1 && objs[0].type === 'sym') box.append(symForm(objs[0]));
    { const pf = propsForm(objs); if (pf) box.append(pf); }
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
    $('#snapBtn').title = 'Accroches aux objets et à la grille (F3) : ' + (state.snap.on ? 'activées' : 'désactivées');
    $('#snapBtn').setAttribute('aria-pressed', String(state.snap.on));
    $('#orthoBtn').title = 'Mode ortho (F8) : ' + (state.snap.ortho ? 'activé' : 'désactivé');
    $('#orthoBtn').setAttribute('aria-pressed', String(state.snap.ortho));
  }

  /* Paramètres du projet : nom, format de feuille et cartouche (communs avec l'export PDF), informations de contenu. */
  function projectDialog() {
    const d = Doc.get(), sh = cleanSheet(d.sheet);
    const name = el('input', { class: 'fld', type: 'text', maxlength: 80, value: d.name, 'aria-label': 'Nom du projet' });
    const fmtSel = el('select', { 'aria-label': 'Format de feuille' }, ...Object.keys(SHEET_FORMATS).map((k) => el('option', { value: k, selected: k === sh.format }, `${k} paysage`)));
    const f = (label, key, max) => { const i = el('input', { class: 'fld', type: 'text', maxlength: max, value: sh[key], 'aria-label': label }); return [el('label', { class: 'lbl' }, label, i), i]; };
    const [l1, client] = f('Client', 'client', 60), [l2, author] = f('Dessiné par', 'author', 60), [l3, ref] = f('Référence', 'ref', 40), [l4, rev] = f('Indice', 'rev', 10);
    const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
    const info = el('dl', { class: 'kv' }, ...kv('Unité', 'millimètres'), ...kv('Objets', String(d.objects.length)), ...kv('Calques', String(d.layers.length)), ...kv('Format du fichier', 'schemaVersion 1'));
    const body = el('div', {}, el('div', { class: 'frm' }, el('label', { class: 'lbl' }, 'Nom du projet', name), el('label', { class: 'lbl' }, 'Format de feuille', fmtSel), l1, l2, l3, l4), el('h3', { class: 'pn-t', style: 'margin:14px 0 6px' }, 'Informations'), info,
      el('p', { class: 'mut small' }, 'Le cartouche est repris dans l\'export PDF.'));
    Dlg.open('Paramètres du projet', body, [{ label: 'Enregistrer', primary: true, run: () => {
      const v = cleanSheet({ format: fmtSel.value, client: client.value, author: author.value, ref: ref.value, rev: rev.value });
      const n = name.value.trim().slice(0, 80) || 'Projet sans titre';
      Doc.mutate((dd) => { dd.sheet = v; dd.name = n; });
    } }]);
  }

  /* Menus déroulants de la barre haute (Fichier, Exporter) : sous le bouton, fermés par Échap, clic ailleurs ou choix d'une entrée. */
  function bindMenu(btnSel, menuSel) {
    const btn = $(btnSel), pop = $(menuSel);
    const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = !pop.hidden;
      document.querySelectorAll('#top ~ .menu[role="menu"]').forEach((m) => { m.hidden = true; });
      document.querySelectorAll('#top [aria-haspopup]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (wasOpen) return;
      const r = btn.getBoundingClientRect();
      pop.style.top = r.bottom + 6 + 'px'; pop.hidden = false;
      pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      pop.querySelector('button').focus();
    });
    pop.addEventListener('click', close);
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { close(); btn.focus(); e.stopPropagation(); } }, true);
  }

  function init() {
    Workbench.build();
    bindCmd();
    bindSections();
    bindModeFields();
    bindLib();
    bindTrade();
    applyTrade();
    document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => { Tools.setTool(b.dataset.tool); b.blur(); }));
    const toggleTheme = () => { Theme.toggle(); Canvas2D.draw(); if (View3D.isOn()) View3D.refresh(); };
    $('#theme').addEventListener('click', toggleTheme);
    $('#themeMenu').addEventListener('click', toggleTheme);
    $('#bomMenu').addEventListener('click', () => BOM.show());
    $('#undo').addEventListener('click', () => Doc.undo());
    $('#redo').addEventListener('click', () => Doc.redo());
    $('#new').addEventListener('click', () => { Cloud.forget(); Doc.reset(); Tools.selection.clear(); Canvas2D.zoomExtents(); Status.msg('Nouveau projet. Ctrl+Z pour revenir au précédent.'); });
    $('#open').addEventListener('click', () => $('#file').click());
    $('#file').addEventListener('change', (e) => { IO.openFile(e.target.files[0]); e.target.value = ''; });
    $('#save').addEventListener('click', () => IO.saveJSON());
    document.querySelectorAll('.modes [data-mode]').forEach((b) => b.addEventListener('click', () => View3D.setMode(b.dataset.mode === '3d')));
    $('#glb').addEventListener('click', () => View3D.exportGLB());
    document.querySelectorAll('#v3dStyle [data-style]').forEach((b) => b.addEventListener('click', () => View3D.setStyle(b.dataset.style)));
    document.querySelectorAll('#v3dCams [data-cam]').forEach((b) => b.addEventListener('click', () => window.Scene3D && window.Scene3D.view(b.dataset.cam)));
    bindMenu('#fileBtn', '#fileMenu');
    bindMenu('#exportBtn', '#exportPop');
    $('#csv').addEventListener('click', () => BOM.exportCSV());
    $('#settings').addEventListener('click', projectDialog);
    $('#panelBtn').addEventListener('click', () => { const o = $('#app').classList.toggle('pn-open'); $('#panelBtn').setAttribute('aria-expanded', String(o)); });
    $('#svg').addEventListener('click', () => IO.exportSVG());
    $('#dxf').addEventListener('click', () => IO.exportDXF());
    $('#pdf').addEventListener('click', () => PDF.dialog());
    $('#acct').addEventListener('click', () => Account.open());
    $('#cloud').addEventListener('click', () => Home.open());
    Cloud.on(refreshChrome);
    const acctIcon = $('#acct').innerHTML;
    Account.on(() => { const m = Account.me(); $('#acct').classList.toggle('on', !!m); $('#acct').setAttribute('aria-label', m ? `Compte de ${m.firstName || m.email}` : 'Compte Studio Prism'); if (m) $('#acct').textContent = (m.firstName || m.email || '?').trim().charAt(0).toUpperCase(); else $('#acct').innerHTML = acctIcon; $('#acct').title = m ? `${m.email} · Compte Studio Prism` : 'Compte Studio Prism'; });
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

    Doc.on(() => { renderLayers(); renderProps(); refreshChrome(); Workbench.renderTree(); Canvas2D.requestDraw(); if (View3D.isOn()) View3D.refresh(); });
    Tools.onChange((reason) => {
      if (reason === 'selection') { if (Tools.selection.size) { state.treeSel = null; state.compSel = 0; Workbench.renderTree(); } renderProps(); }
      else if (reason === 'tool') { refreshTools(); renderLib(); }
      else if (reason === 'sym') renderLib();
      else if (reason === 'mode') refreshModes();
    });
    renderLayers(); renderProps(); refreshChrome(); refreshTools(); refreshModes(); Workbench.refresh();
  }

  return { init, focusCmd, renderProps };
})();
