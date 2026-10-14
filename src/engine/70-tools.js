/* Outils de dessin et de sélection : machine à états des clics, saisie de longueur au clavier, raccourcis, aperçus.
   Les objets créés vont sur le calque actif. Les calques masqués ou verrouillés ne sont ni modifiables ni sélectionnables. */
const Tools = (() => {
  const selection = new Set();
  const listeners = [];
  const NAMES = { select: 'Sélection', line: 'Ligne', poly: 'Polyligne', rect: 'Rectangle', circle: 'Cercle', dim: 'Cote', text: 'Texte', sym: 'Équipement', move: 'Déplacer', copy: 'Copier', pan: 'Main' };
  const HINTS = {
    select: 'Cliquer un objet, ou glisser pour une fenêtre (gauche → droite : objets entiers ; droite → gauche : objets touchés). Maj : ajouter.',
    line: 'Cliquer le point de départ, puis les points suivants. Clic droit ou Échap pour terminer. Taper une longueur (ex. 1500 ou 1500<45) puis Entrée.',
    poly: 'Cliquer les sommets. Entrée ou clic droit pour terminer, C pour fermer.',
    rect: 'Cliquer deux coins opposés.',
    circle: 'Cliquer le centre, puis un point du cercle (ou taper le rayon).',
    dim: 'Cliquer les deux points à coter, puis la position de la ligne de cote.',
    text: 'Cliquer l\'emplacement du texte, taper, Entrée pour valider.',
    sym: 'Choisir un symbole dans la bibliothèque du panneau, cliquer pour le poser. [ et ] : tourner de 15° · Échap : terminer.',
    move: 'Sélectionner d\'abord des objets. Cliquer le point de base, puis le point d\'arrivée.',
    copy: 'Sélectionner d\'abord des objets. Cliquer le point de base, puis chaque point d\'arrivée. Échap pour finir.',
    pan: 'Glisser pour déplacer la vue (aussi : barre d\'espace ou molette enfoncée).',
  };
  const KEYS = { v: 'select', l: 'line', p: 'poly', r: 'rect', c: 'circle', d: 'dim', t: 'text', e: 'sym', m: 'move', k: 'copy', h: 'pan' };
  const TYPED_TOOLS = ['line', 'poly', 'circle', 'move', 'copy'];

  let tool = 'select';
  let pts = [];
  let cur = null;       /* {p, kind} : point courant après accroche */
  let hoverObj = null;
  let box = null;       /* fenêtre de sélection {a, b} */
  let rawLast = [0, 0];
  let scrLast = [0, 0];
  let textBusy = false;

  const css = (n) => Canvas2D.css(n);
  const R6 = (p) => [+p[0].toFixed(6), +p[1].toFixed(6)];
  const notify = (reason) => { for (const f of listeners) f(reason); Canvas2D.requestDraw(); };
  const selectable = (o) => { const l = Doc.layer(o.layer); return !!l && l.visible && !l.locked; };

  function pick(p) {
    let best = null, bd = 8 / state.view.scale;
    for (const o of Doc.get().objects) {
      if (!selectable(o)) continue;
      const d = Geo.dist(o, p);
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  }

  function canCreate() {
    const l = Doc.activeLayer();
    if (!l) { Status.msg('Aucun calque actif.'); return false; }
    if (!l.visible || l.locked) { Status.msg(`Le calque « ${l.name} » est masqué ou verrouillé : choisissez un autre calque actif.`); return false; }
    return true;
  }

  const addObj = (o) => Doc.mutate(() => { Doc.add(o); });

  function snapPt(raw) {
    const orthoOk = ['line', 'poly', 'move', 'copy'].includes(tool) || (tool === 'dim' && pts.length === 1);
    const base = orthoOk && pts.length ? pts[pts.length - 1] : null;
    return Snap.find(raw, base);
  }

  function setTool(t) {
    if (!NAMES[t]) return;
    tool = t; pts = []; box = null; cur = null; hoverObj = null;
    Status.msg(NAMES[t] + ' : ' + HINTS[t], 9000);
    updateLive();
    notify('tool');
  }

  function finishPoly(close) {
    if (tool === 'poly' && pts.length >= (close ? 3 : 2)) addObj({ type: 'poly', pts: pts.map(R6), closed: !!close });
    pts = [];
    updateLive();
  }

  function click(c) {
    const p = R6(c.p);
    switch (tool) {
      case 'line':
        if (!canCreate()) return;
        if (!pts.length) { pts = [p]; return; }
        if (G.dist(pts[0], p) < 1e-6) return;
        addObj({ type: 'line', a: pts[0], b: p });
        pts = [p];
        break;
      case 'poly':
        if (!canCreate()) return;
        if (pts.length && G.dist(pts[pts.length - 1], p) < 1e-6) return;
        pts.push(p);
        break;
      case 'rect': {
        if (!canCreate()) return;
        if (!pts.length) { pts = [p]; return; }
        const a = pts[0];
        if (Math.abs(p[0] - a[0]) < 1e-6 || Math.abs(p[1] - a[1]) < 1e-6) return;
        addObj({ type: 'poly', pts: [a, [p[0], a[1]], p, [a[0], p[1]]], closed: true });
        pts = [];
        break;
      }
      case 'circle': {
        if (!canCreate()) return;
        if (!pts.length) { pts = [p]; return; }
        const r = G.dist(pts[0], p);
        if (r < 1e-6) return;
        addObj({ type: 'circle', c: pts[0], r: +r.toFixed(6) });
        pts = [];
        break;
      }
      case 'dim': {
        if (!canCreate()) return;
        if (pts.length < 2) {
          if (pts.length && G.dist(pts[0], p) < 1e-6) return;
          pts.push(p);
          return;
        }
        const [a, b] = pts;
        const L = G.dist(a, b);
        const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
        const off = (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
        addObj({ type: 'dim', a, b, off: +off.toFixed(6), h: 150 });
        pts = [];
        break;
      }
      case 'text':
        if (!canCreate()) return;
        askText(p);
        break;
      case 'sym': {
        if (!canCreate()) return;
        const cs = cleanSym({ ...state.sym });
        if (!cs) { Status.msg(`Dimension invalide : entrez une taille entre ${SYM_MIN} et ${SYM_MAX} mm.`, 6000); return; }
        addObj({ type: 'sym', c: p, ...cs });
        break;
      }
      case 'move': case 'copy': {
        if (!selection.size) { Status.msg('Sélectionnez d\'abord des objets avec l\'outil Sélection (V).'); return; }
        if (!pts.length) { pts = [p]; return; }
        const dx = p[0] - pts[0][0], dy = p[1] - pts[0][1];
        if (Math.hypot(dx, dy) < 1e-9) return;
        const ids = new Set(selection);
        if (tool === 'move') {
          Doc.mutate((d) => { for (const o of d.objects) if (ids.has(o.id)) Geo.translate(o, dx, dy); });
          pts = [];
        } else {
          Doc.mutate((d) => {
            const copies = [];
            for (const o of d.objects) {
              if (!ids.has(o.id)) continue;
              const c2 = Geo.clone(o);
              Geo.translate(c2, dx, dy);
              c2.id = d.nextId++;
              copies.push(c2);
            }
            d.objects.push(...copies);
          });
        }
        break;
      }
    }
    updateLive();
  }

  /* Saisie d'un texte : petit champ posé sur le dessin. */
  function askText(p) {
    const tb = $('#tbox');
    const s = Canvas2D.toScreen(p);
    tb.style.left = Math.max(4, s[0]) + 'px';
    tb.style.top = Math.max(4, s[1] - 34) + 'px';
    tb.value = '';
    tb.hidden = false;
    textBusy = true;
    const done = (ok) => {
      if (!textBusy) return;
      textBusy = false;
      const v = tb.value.trim();
      tb.hidden = true;
      tb.onkeydown = null; tb.onblur = null;
      if (ok && v) addObj({ type: 'text', p, text: v.slice(0, 500), h: 200 });
    };
    tb.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      else if (e.key === 'Escape') { e.preventDefault(); done(false); }
    };
    tb.onblur = () => done(false);
    tb.focus();
  }

  function down(raw, e) {
    if (textBusy) return;
    if (tool === 'select') {
      const hit = pick(raw);
      if (hit) {
        if (e.shiftKey) { if (selection.has(hit.id)) selection.delete(hit.id); else selection.add(hit.id); }
        else { selection.clear(); selection.add(hit.id); }
        notify('selection');
      } else {
        box = { a: raw, b: raw };
        if (!e.shiftKey && selection.size) { selection.clear(); notify('selection'); }
      }
      return;
    }
    cur = snapPt(raw);
    click(cur);
    Canvas2D.requestDraw();
  }

  function move(raw, e, scr) {
    rawLast = raw; scrLast = scr;
    if (tool === 'select') {
      cur = null;
      if (box) box.b = raw; else hoverObj = pick(raw);
    } else if (tool === 'pan') {
      cur = null;
    } else {
      cur = snapPt(raw);
    }
    updateLive();
    Canvas2D.requestDraw();
  }

  function up(raw) {
    if (!box) return;
    const b = box;
    box = null;
    const sc = state.view.scale;
    if (Math.abs(b.b[0] - b.a[0]) * sc > 3 || Math.abs(b.b[1] - b.a[1]) * sc > 3) {
      const win = b.b[0] >= b.a[0];   /* gauche → droite : fenêtre (objets entiers) ; sinon capture (objets touchés) */
      const x0 = Math.min(b.a[0], b.b[0]), x1 = Math.max(b.a[0], b.b[0]);
      const y0 = Math.min(b.a[1], b.b[1]), y1 = Math.max(b.a[1], b.b[1]);
      for (const o of Doc.get().objects) {
        if (!selectable(o)) continue;
        const bb = Geo.bbox(o);
        const inside = bb[0] >= x0 && bb[2] <= x1 && bb[1] >= y0 && bb[3] <= y1;
        const touch = !(bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1);
        if (win ? inside : touch) selection.add(o.id);
      }
      notify('selection');
    } else {
      Canvas2D.requestDraw();
    }
  }

  function cancelDrag() { box = null; Canvas2D.requestDraw(); }

  function rightClick() {
    if (tool === 'poly') finishPoly(false);
    else pts = [];
    updateLive();
    Canvas2D.requestDraw();
  }

  function escape() {
    if (pts.length || box) { pts = []; box = null; }
    else if (tool !== 'select') { setTool('select'); return; }
    else if (selection.size) { selection.clear(); notify('selection'); }
    updateLive();
    Canvas2D.requestDraw();
  }

  function wantsTyping() {
    return (TYPED_TOOLS.includes(tool) && pts.length >= 1) || (tool === 'dim' && pts.length === 1);
  }

  /* Saisie directe : « 1500 » (direction du curseur) ou « 1500<45 » (angle en degrés, sens trigonométrique). */
  function typed(str) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:[<;]\s*(-?\d+(?:[.,]\d+)?))?\s*$/.exec(str);
    if (!m || !wantsTyping()) {
      Status.msg('Saisie non reconnue : entrez une longueur en mm (ex. 1500) ou longueur<angle (ex. 1500<45).');
      return false;
    }
    const len = parseFloat(m[1].replace(',', '.'));
    if (!(len > 0)) { Status.msg('La longueur doit être supérieure à 0.'); return false; }
    const base = pts[pts.length - 1];
    let ang;
    if (m[2] !== undefined) ang = parseFloat(m[2].replace(',', '.')) * Math.PI / 180;
    else {
      const c = cur ? cur.p : rawLast;
      ang = (c[0] === base[0] && c[1] === base[1]) ? 0 : Math.atan2(c[1] - base[1], c[0] - base[0]);
    }
    const p = [base[0] + len * Math.cos(ang), base[1] + len * Math.sin(ang)];
    cur = { p, kind: 'typed' };
    click(cur);
    Canvas2D.requestDraw();
    return true;
  }

  function deleteSel() {
    if (!selection.size) return;
    const ids = new Set(selection);
    selection.clear();
    Doc.mutate((d) => { d.objects = d.objects.filter((o) => !ids.has(o.id)); });
    notify('selection');
  }

  function selectAll() {
    selection.clear();
    for (const o of Doc.get().objects) if (selectable(o)) selection.add(o.id);
    notify('selection');
  }

  function toggleOrtho() { state.snap.ortho = !state.snap.ortho; notify('mode'); }
  function toggleSnap() { state.snap.on = !state.snap.on; notify('mode'); }

  /* Retire de la sélection les objets supprimés ou devenus inaccessibles (calque masqué / verrouillé, annulation…). */
  function prune() {
    const objs = new Map(Doc.get().objects.map((o) => [o.id, o]));
    let changed = false;
    for (const id of [...selection]) {
      const o = objs.get(id);
      if (!o || !selectable(o)) { selection.delete(id); changed = true; }
    }
    if (changed) notify('selection');
  }

  /* --- Texte dynamique près du curseur --- */
  function liveText() {
    if (!cur || !pts.length) return '';
    const last = pts[pts.length - 1];
    const c = cur.p;
    const len = G.dist(last, c);
    switch (tool) {
      case 'line': case 'poly': {
        let ang = Math.atan2(c[1] - last[1], c[0] - last[0]) * 180 / Math.PI;
        if (ang < 0) ang += 360;
        return `L ${fmt(len)} mm · ${ang.toFixed(1)}°`;
      }
      case 'circle': return `R ${fmt(len)} mm`;
      case 'rect': return `${fmt(Math.abs(c[0] - pts[0][0]))} × ${fmt(Math.abs(c[1] - pts[0][1]))} mm`;
      case 'dim':
        if (pts.length === 1) return `L ${fmt(len)} mm`;
        return `Décalage ${fmt(Math.abs(dimOff(pts[0], pts[1], c)))} mm`;
      case 'move': case 'copy': return `Δx ${fmt(c[0] - pts[0][0])} · Δy ${fmt(c[1] - pts[0][1])} mm`;
    }
    return '';
  }

  function updateLive() {
    const live = $('#live');
    if (!live) return;
    const t = liveText();
    if (!t) { live.hidden = true; return; }
    live.textContent = t;
    live.hidden = false;
    live.style.left = (scrLast[0] + 16) + 'px';
    live.style.top = (scrLast[1] + 16) + 'px';
  }

  function dimOff(a, b, p) {
    const L = G.dist(a, b);
    if (L < 1e-9) return 0;
    return (p[0] - a[0]) * (-(b[1] - a[1]) / L) + (p[1] - a[1]) * ((b[0] - a[0]) / L);
  }

  /* --- Aperçus (fantômes) pendant la saisie --- */
  function preview(ctx) {
    const S = Canvas2D.toScreen;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    if (box) {
      const a = S(box.a), b = S(box.b);
      const win = box.b[0] >= box.a[0];
      ctx.strokeStyle = css('--accent');
      ctx.fillStyle = css(win ? '--accent-soft' : '--sel');
      ctx.globalAlpha = 0.25;
      ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      ctx.globalAlpha = 1;
      if (!win) ctx.setLineDash([3, 3]);
      ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      ctx.restore();
      return;
    }
    if (tool === 'sym' && cur) {
      const cs = cleanSym({ ...state.sym });
      if (cs) { ctx.setLineDash([]); ctx.globalAlpha = 0.75; Render.drawObject(ctx, { type: 'sym', c: cur.p, ...cs, tag: '' }, css('--accent'), 1.6); }
      ctx.restore(); return;
    }
    if (!cur || !pts.length) { ctx.restore(); return; }
    const c = cur.p;
    ctx.strokeStyle = css('--accent');
    ctx.fillStyle = css('--accent');
    switch (tool) {
      case 'line': case 'poly': {
        ctx.beginPath();
        pts.forEach((q, i) => { const s = S(q); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
        const e = S(c);
        ctx.lineTo(e[0], e[1]);
        ctx.stroke();
        break;
      }
      case 'rect': {
        const a = S(pts[0]), b = S(c);
        ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        break;
      }
      case 'circle': {
        const o = S(pts[0]);
        ctx.beginPath();
        ctx.arc(o[0], o[1], G.dist(pts[0], c) * state.view.scale, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'dim':
        if (pts.length === 1) {
          const a = S(pts[0]), b = S(c);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        } else {
          ctx.setLineDash([]);
          Render.drawObject(ctx, { type: 'dim', a: pts[0], b: pts[1], off: dimOff(pts[0], pts[1], c), h: 150 }, css('--accent'), 1.5);
        }
        break;
      case 'move': case 'copy': {
        const dx = c[0] - pts[0][0], dy = c[1] - pts[0][1];
        const a = S(pts[0]), b = S(c);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.globalAlpha = 0.7;
        for (const o of Doc.get().objects) {
          if (selection.has(o.id)) Render.drawObject(ctx, Geo.translate(Geo.clone(o), dx, dy), css('--accent'), 1.6);
        }
        break;
      }
    }
    ctx.restore();
  }

  /* --- Clavier --- */
  function onKey(e) {
    const t = e.target;
    const k = e.key;
    /* Les champs de saisie gardent leurs touches ; une case à cocher ou une pastille ne doivent pas bloquer les raccourcis. */
    const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'color', 'button'].includes(t.type)));
    if (typing) return;
    if (t && t.tagName === 'INPUT' && (k === ' ' || k === 'Enter')) return;
    if (t && t.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return;
    const mod = e.ctrlKey || e.metaKey;
    const low = k.length === 1 ? k.toLowerCase() : k;
    if (mod) {
      if (low === 'z' && !e.shiftKey) { e.preventDefault(); Doc.undo(); }
      else if (low === 'y' || (low === 'z' && e.shiftKey)) { e.preventDefault(); Doc.redo(); }
      else if (low === 'a') { e.preventDefault(); selectAll(); }
      return;
    }
    if (k === ' ') { e.preventDefault(); Canvas2D.setSpace(true); return; }
    if (k === 'Escape') { escape(); return; }
    if (k === 'Enter') { if (tool === 'poly') finishPoly(false); Canvas2D.requestDraw(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    if (k === 'F8') { e.preventDefault(); toggleOrtho(); return; }
    if (k === 'F3') { e.preventDefault(); toggleSnap(); return; }
    if (low === 'c' && tool === 'poly' && pts.length >= 3) { finishPoly(true); Canvas2D.requestDraw(); return; }
    if (tool === 'sym' && (k === '[' || k === ']')) { state.sym.rot = (state.sym.rot + (k === ']' ? 15 : -15) + 360) % 360; notify('sym'); return; }
    if (low === 'z') { Canvas2D.zoomExtents(); return; }
    if (KEYS[low]) { setTool(KEYS[low]); return; }
    if (wantsTyping() && /^[0-9.,<;]$/.test(k)) { e.preventDefault(); UI.focusCmd(k); }
  }

  function init() {
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', (e) => { if (e.key === ' ') Canvas2D.setSpace(false); });
    window.addEventListener('blur', () => Canvas2D.setSpace(false));
    Doc.on(() => prune());
  }

  return {
    init, selection, NAMES, HINTS,
    onChange: (f) => { listeners.push(f); },
    current: () => tool,
    hover: () => hoverObj,
    snapState: () => cur,
    setTool, down, move, up, cancelDrag, rightClick, preview, typed, wantsTyping, deleteSel, selectAll, toggleOrtho, toggleSnap,
  };
})();
