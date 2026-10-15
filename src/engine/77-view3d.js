/* Aperçu 3D en fil de fer, calculé à partir des objets des calques visibles (mêmes données que le plan, rien n'est dupliqué).
   Altitudes lues dans les propriétés techniques (en m, converties en mm) :
   - réseau : de l'altitude amont à l'altitude aval le long du tracé ; sinon −profondeur ; sinon 0.
   - mur : bande extrudée de la cote z (0 par défaut) sur la hauteur h (3000 mm par défaut) ; poutre : bande à la cote z (3000 mm par défaut).
   - équipement : symbole à la cote z (0) ; poteaux extrudés sur 3000 mm.
   Limites : fil de fer orthographique, sans faces, sans masquage ni sections réelles des profilés. Ce n'est pas un modèle 3D éditable. */
const View3D = (() => {
  const DEF_WALL_H = 3000, DEF_BEAM_Z = 3000, COL_H = 3000;

  function ring(pts, closed, z, out, col) {
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = pts[i], b = pts[(i + 1) % n]; out.push({ a: [a[0], a[1], z], b: [b[0], b[1], z], col }); }
  }
  /* Segments 3D d'un réseau : altitude interpolée selon la longueur cumulée. */
  function netSegs(o, col, out) {
    const pr = o.props || {}, pts = o.type === 'line' ? [o.a, o.b] : o.pts, closed = o.type === 'poly' && o.closed;
    const segs = [];
    for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) segs.push([pts[i], pts[(i + 1) % pts.length]]);
    const tot = segs.reduce((s, [a, b]) => s + G.dist(a, b), 0) || 1;
    const hasZ = typeof pr.zi === 'number' && typeof pr.zf === 'number';
    const zAt = (t) => (hasZ ? (pr.zi + (pr.zf - pr.zi) * t) * 1000 : typeof pr.depth === 'number' ? -pr.depth * 1000 : 0);
    let acc = 0;
    for (const [a, b] of segs) { const l = G.dist(a, b), z0 = zAt(acc / tot); acc += l; out.push({ a: [a[0], a[1], z0], b: [b[0], b[1], zAt(acc / tot)], col, thick: o.net.dn }); }
  }

  function model() {
    const out = [];
    for (const o of Doc.get().objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible) continue;
      const col = l.color, pr = o.props || {};
      if (o.net && (o.type === 'line' || o.type === 'poly')) { netSegs(o, col, out); continue; }
      if (o.st && (o.type === 'line' || o.type === 'poly')) {
        const pts = o.type === 'line' ? [o.a, o.b] : o.pts, closed = o.type === 'poly' && o.closed;
        const z0 = (typeof pr.z === 'number' ? pr.z : o.st.kind === 'poutre' ? DEF_BEAM_Z / 1000 : 0) * 1000;
        const h = o.st.kind === 'mur' ? (pr.h || DEF_WALL_H) : 0;
        for (const b of Sym.band(pts, closed, o.st.w)) {
          ring(b.pts, true, z0, out, col);
          if (h) { ring(b.pts, true, z0 + h, out, col); for (const p of b.pts) out.push({ a: [p[0], p[1], z0], b: [p[0], p[1], z0 + h], col }); }
        }
        if (o.st.kind === 'poutre') ring(pts, closed, z0, out, col);
        continue;
      }
      if (o.type === 'sym') {
        const z0 = (typeof pr.z === 'number' ? pr.z : 0) * 1000, h = o.k === 'poteau' || o.k === 'poteauRond' ? COL_H : 0;
        for (const e of Sym.world(o)) {
          const pts = e.type === 'line' ? [e.a, e.b] : e.type === 'circle' ? Array.from({ length: 24 }, (_, i) => [e.c[0] + e.r * Math.cos(i * Math.PI / 12), e.c[1] + e.r * Math.sin(i * Math.PI / 12)]) : e.pts;
          const closed = e.type === 'circle' || (e.type === 'poly' && e.closed);
          ring(pts, closed, z0, out, col);
          if (h) { ring(pts, closed, z0 + h, out, col); if (e.type !== 'line') for (const p of pts.filter((_, i) => i % 6 === 0)) out.push({ a: [p[0], p[1], z0], b: [p[0], p[1], z0 + h], col }); }
        }
        continue;
      }
      for (const e of Sym.expand(o)) {
        if (e.type === 'line') out.push({ a: [e.a[0], e.a[1], 0], b: [e.b[0], e.b[1], 0], col });
        else if (e.type === 'poly') ring(e.pts, e.closed, 0, out, col);
        else if (e.type === 'circle') ring(Array.from({ length: 36 }, (_, i) => [e.c[0] + e.r * Math.cos(i * Math.PI / 18), e.c[1] + e.r * Math.sin(i * Math.PI / 18)]), true, 0, out, col);
      }
    }
    return out;
  }


  /* ---- Solides pour le moteur 3D (Three.js) : mm, plan XY, Z vers le haut ----
     pipe {a,b,r}      réseau : cylindre de rayon DN/2 entre deux points 3D
     prism {rings,z0,z1} bande de mur / poutre ou empreinte d'équipement extrudée (rings[0] contour, les suivants trous)
     cyl {c,r,z0,z1}   empreinte circulaire extrudée
     line {pts}        arêtes, éléments à plat
     Hauteurs : mur h (propriété) ou 3000 ; poutre : hauteur nominale lue dans le nom du profilé (IPE 200 → 200 mm), sinon propriété h, sinon 200 ;
     équipement : 0,6 × sa taille (cuve, ballon, coffret : plus haut), poteaux 3000, semelle 400. Ce sont des volumes de principe, pas des modèles de fabricants. */
  const EQ_H = { cuve: 1.5, ballon: 1.2, coffret: 1.8, armoire: 1.6, regard: 0.2, chambre: 0.15, chambreRac: 0.15, candelabre: 0.3, semelle: 0, hydrant: 1.0 };
  const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  const beamDepth = (o) => { const m = /(?:IPE|HEA|HEB|HEM|UPN|IPN)\s*(\d{2,3})/i.exec(o.st.prof || ''); return m ? +m[1] : (o.props && o.props.h) || 200; };

  const matCol = (id) => (id && MATS[id] ? MATS[id].color : null);
  /* Matériau effectif d'un objet (saisi, sinon valeur par défaut selon sa nature) */
  function matIdOf(o) {
    if (o.mat) return o.mat;
    if (o.net) return MAT_DEFAULT.net[o.net.mat] || '';
    if (o.st) return o.st.kind === 'poutre' ? MAT_DEFAULT.poutre : MAT_DEFAULT.mur;
    if (o.type === 'sym' && (o.k === 'poteau' || o.k === 'poteauRond')) return MAT_DEFAULT.poteau;
    return '';
  }

  function solids() {
    const out = [], d = Doc.get();
    const consumed = new Set((d.features || []).filter((f) => !f.hide).map((f) => f.sk));
    for (const o of d.objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible) continue;
      const col = l.color, pr = o.props || {}, mcol = matCol(matIdOf(o));
      if (o.sk) {
        /* esquisse sans fonction : ses traits sont montrés sur leur plan (comme une esquisse visible dans l'arbre) */
        const sk = Model.sketch(o.sk); if (!sk || consumed.has(o.sk)) continue;
        const F = Model.frame(sk);
        for (const e of Sym.expand(o)) {
          if (e.type === 'line') out.push({ k: 'line', pts: [F.to3(...e.a), F.to3(...e.b)], col });
          else if (e.type === 'poly') out.push({ k: 'line', pts: e.pts.map((q) => F.to3(...q)).concat(e.closed ? [F.to3(...e.pts[0])] : []), col });
          else if (e.type === 'circle') out.push({ k: 'line', pts: Array.from({ length: 49 }, (_, i) => F.to3(e.c[0] + e.r * Math.cos(i * Math.PI / 24), e.c[1] + e.r * Math.sin(i * Math.PI / 24))), col });
        }
        continue;
      }
      if (o.net && (o.type === 'line' || o.type === 'poly')) { const sg = []; netSegs(o, col, sg); for (const s of sg) out.push({ k: 'pipe', a: s.a, b: s.b, r: o.net.dn / 2, col, mcol }); continue; }
      if (o.st && (o.type === 'line' || o.type === 'poly')) {
        const pts = o.type === 'line' ? [o.a, o.b] : o.pts, closed = o.type === 'poly' && o.closed;
        const beam = o.st.kind === 'poutre';
        const top = (typeof pr.z === 'number' ? pr.z : beam ? DEF_BEAM_Z / 1000 : 0) * 1000;
        const prof = beam ? Sections.find(o.st.prof) : null;
        const util = beam && typeof Analysis !== 'undefined' ? Analysis.beamUtil(o) : null;
        if (prof) {
          /* section réelle du profilé (I ou U, sans congés) balayée le long de chaque tronçon, dessus de poutre à la cote z */
          const ol = Sections.outline({ kind: 'prof', id: prof.id });
          for (const [a, b] of Geo.segments(o)) {
            const L = G.dist(a, b); if (L < 1e-6) continue;
            const W = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, 0], U = [-W[1], W[0], 0];
            out.push({ k: 'ext', outer: ol.outer, holes: [], w0: 0, w1: L, M: [...U, 0, 0, 1, ...W, a[0], a[1], top - prof.h / 2], col, mcol, util });
          }
          continue;
        }
        const bands = Sym.band(pts, closed, o.st.w).map((b) => b.pts);
        const hh = beam ? beamDepth(o) : (pr.h || DEF_WALL_H);
        const z0 = beam ? top - hh : top;
        const rings = closed && bands.length === 2 ? (area(bands[0]) >= area(bands[1]) ? [bands[0], bands[1]] : [bands[1], bands[0]]) : bands;
        out.push({ k: 'prism', rings, z0, z1: z0 + hh, col, mcol, util });
        continue;
      }
      if (o.type === 'sym') {
        const z0 = (typeof pr.z === 'number' ? pr.z : 0) * 1000;
        const h = o.k === 'poteau' || o.k === 'poteauRond' ? COL_H : (o.k in EQ_H ? EQ_H[o.k] : 0.6) * o.s;
        let base = null;
        const edges = [];
        for (const e of Sym.world(o)) {
          if (!base && e.type === 'circle') base = { k: 'cyl', c: e.c, r: e.r, z0, z1: z0 + (h || 50), col, mcol };
          else if (!base && e.type === 'poly' && e.closed && e.pts.length >= 3) base = { k: 'prism', rings: [e.pts], z0, z1: z0 + (h || 50), col, mcol };
          else if (e.type === 'line') edges.push([[e.a[0], e.a[1], z0 + h], [e.b[0], e.b[1], z0 + h]]);
          else if (e.type === 'poly') edges.push(e.pts.map((p) => [p[0], p[1], z0 + h]).concat(e.closed ? [[e.pts[0][0], e.pts[0][1], z0 + h]] : []));
        }
        if (base) out.push(base);
        for (const pts of edges) out.push({ k: 'line', pts, col });
        continue;
      }
      for (const e of Sym.expand(o)) {
        if (e.type === 'line') out.push({ k: 'line', pts: [[e.a[0], e.a[1], 0], [e.b[0], e.b[1], 0]], col });
        else if (e.type === 'poly') out.push({ k: 'line', pts: e.pts.map((p) => [p[0], p[1], 0]).concat(e.closed ? [[e.pts[0][0], e.pts[0][1], 0]] : []), col });
        else if (e.type === 'circle') out.push({ k: 'line', pts: Array.from({ length: 37 }, (_, i) => [e.c[0] + e.r * Math.cos(i * Math.PI / 18), e.c[1] + e.r * Math.sin(i * Math.PI / 18), 0]), col });
      }
    }
    /* fonctions 3D (esquisses extrudées ou révolutionnées) */
    for (const f of d.features || []) {
      const l = Doc.layer(f.layer); if (!l || !l.visible) continue;
      for (const s of Model.featureSolids(f, l.color)) out.push({ ...s, mcol: matCol(f.mat) });
    }
    /* composants d'assemblage (position résolue par les contraintes) */
    if (d.comps && d.comps.length) {
      const R = Model.resolve(d.comps);
      for (const c of d.comps) {
        const l = Doc.layer(c.layer); if (!l || !l.visible) continue;
        for (const s of Model.compSolids(c, R.pos.get(c.id), l.color)) out.push({ ...s, mcol: matCol(c.mat), sel: state.compSel === c.id });
      }
    }
    return out;
  }

  /* Projection orthographique : lacet (autour de Z) puis tangage. Renvoie [x écran, y écran (vers le bas), profondeur]. */
  function project(p, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = p[0] * cy - p[1] * sy, y1 = p[0] * sy + p[1] * cy;
    return [x1, -(p[2] * cp + y1 * sp), y1 * cp - p[2] * sp];
  }

  function show() {
    const segs = model();
    if (!segs.length) { Status.msg('Rien à afficher : le dessin est vide ou tous les calques sont masqués.'); return; }
    const cv = el('canvas', { class: 'v3d', 'aria-label': 'Aperçu 3D en fil de fer : glisser pour tourner, molette pour zoomer' });
    cv.width = 900; cv.height = 560;
    const st = { yaw: -0.6, pitch: 0.6, k: 1, ox: 0, oy: 0 };
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const s of segs) for (const p of [s.a, s.b]) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
    const c = mn.map((v, i) => (v + mx[i]) / 2), R = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
    const dark = Theme.isDark();
    function draw() {
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, sc = Math.min(W, H) * 0.8 / R * st.k;
      g.fillStyle = dark ? '#16191E' : '#FFFFFF'; g.fillRect(0, 0, W, H);
      g.lineCap = 'round';
      const P = (p) => { const q = project([p[0] - c[0], p[1] - c[1], p[2] - c[2]], st.yaw, st.pitch); return [W / 2 + st.ox + q[0] * sc, H / 2 + st.oy + q[1] * sc]; };
      /* repère : axes X (rouge), Y (vert), Z (bleu) au coin minimal */
      for (const s of segs) {
        const a = P(s.a), b = P(s.b);
        g.strokeStyle = s.col; g.lineWidth = s.thick ? Math.min(6, Math.max(1.5, s.thick * sc * 0.6)) : 1.3; g.globalAlpha = s.thick ? 0.85 : 1;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      g.globalAlpha = 1;
      const o = [mn[0], mn[1], mn[2]], ax = [[[R / 6, 0, 0], '#C0392B', 'X'], [[0, R / 6, 0], '#1E8E5A', 'Y'], [[0, 0, R / 6], '#0877B9', 'Z']];
      for (const [d, col, t] of ax) { const a = P(o), b = P([o[0] + d[0], o[1] + d[1], o[2] + d[2]]); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.font = '600 12px Inter, sans-serif'; g.fillText(t, b[0] + 4, b[1] - 4); }
    }
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) { st.ox += dx; st.oy += dy; } else { st.yaw += dx * 0.01; st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch + dy * 0.01)); }
      draw();
    });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); st.k = Math.max(0.1, Math.min(20, st.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); draw(); }, { passive: false });
    const views = el('div', { class: 'v3d-bar' },
      ...[['Isométrique', -0.6, 0.6], ['Dessus', 0, 1.5], ['Face', 0, 0], ['Côté', -Math.PI / 2, 0]].map(([n, y, p]) => {
        const b = el('button', { type: 'button', class: 'btn' }, n); b.addEventListener('click', () => { st.yaw = y; st.pitch = p; st.ox = st.oy = 0; st.k = 1; draw(); }); return b;
      }));
    const body = el('div', {}, views, cv, el('p', { class: 'mut small' }, `Aperçu 3D en fil de fer (${segs.length} segments), calques visibles. Glisser : tourner · Maj + glisser : déplacer · molette : zoom. Altitudes issues des propriétés techniques (m) ; sans altitude, réseaux à 0 ou à − profondeur, murs de 3 m, poutres à 3 m, poteaux de 3 m. Pas de faces ni de sections réelles : ce n'est pas un modèle 3D éditable.`));
    Dlg.open('Aperçu 3D', body);
    draw();
  }


  /* ---- Mode 3D de la fenêtre principale (Three.js) ; repli : aperçu fil de fer si le moteur n'est pas chargé ---- */
  let on = false, style = 'shaded';
  const isOn = () => on;
  function note(t) { const n = document.getElementById('v3dNote'); if (n) n.textContent = t; }
  function refresh() {
    if (!on || !window.Scene3D) return;
    const solidsNow = solids();
    const info = window.Scene3D.show(document.getElementById('cv3d'), solidsNow, { style });
    note(!solidsNow.length ? 'Rien à afficher : le dessin est vide ou tous les calques sont masqués.'
      : `Vue 3D en lecture seule : modifiez le dessin en mode Plan. Volumes de principe (murs ${DEF_WALL_H / 1000} m, poutres selon le profilé, équipements à hauteur type), calques visibles uniquement.${info.capped ? ` Affichage limité aux ${info.max} premiers éléments.` : ''}`);
  }
  function setMode(want) {
    if (want && !window.Scene3D) { Status.msg('Moteur 3D indisponible (Three.js non chargé, connexion nécessaire) : aperçu en fil de fer.', 7000); show(); return false; }
    on = !!want;
    document.getElementById('app').classList.toggle('m3d', on);
    document.getElementById('v3dView').hidden = !on;
    document.querySelectorAll('#top .modes [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === (on ? '3d' : '2d'))));
    if (on) { Tools.setTool('select'); refresh(); window.Scene3D.resume(); } else { if (window.Scene3D) window.Scene3D.hide(); Canvas2D.requestDraw(); }
    return true;
  }
  function setStyle(st) { style = st; document.querySelectorAll('#v3dStyle [data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === st))); if (on && window.Scene3D) window.Scene3D.setStyle(st, solids()); }
  async function exportGLB() {
    if (!window.Scene3D) { Status.msg('Export 3D indisponible : Three.js n\'a pas pu se charger (connexion nécessaire).', 7000); return; }
    const s = solids();
    if (!s.length) { Status.msg('Rien à exporter : le dessin est vide ou tous les calques sont masqués.'); return; }
    try {
      window.Scene3D.show(document.getElementById('cv3d'), s, { style: 'shaded' });
      const buf = await window.Scene3D.exportGLB();
      IO.download(`${IO.safeName(Doc.get().name)}.glb`, new Uint8Array(buf), 'model/gltf-binary');
      Status.msg('Modèle 3D envoyé vers vos téléchargements (.glb, mètres, Y vers le haut).');
    } catch (e) { Status.msg('Export 3D impossible : ' + (e && e.message ? e.message : e), 8000); }
  }

  return { model, solids, project, show, setMode, setStyle, refresh, isOn, exportGLB };
})();
