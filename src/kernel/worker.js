/* Noyau géométrique d'ARCHIINDUS : OpenCascade (B-rep) compilé pour le navigateur, via la bibliothèque replicad.
   Tourne dans un Web Worker (module) : la reconstruction du modèle ne bloque jamais l'interface.
   Unités : millimètres, repère du plan (x vers l'est, y vers le nord, z vers le haut).

   Messages reçus (postMessage) → réponse {id, ok, …} ou {id, ok:false, error}
     init   {bases:[{rep, oc}]}          charge replicad et OpenCascade (premier emplacement qui répond)
     build  {features, extra}            reconstruit l'arbre de création → corps (maillages, arêtes, propriétés de masse)
     export {format:'step'|'stl'}        exporte les corps (et les volumes « extra ») du dernier build
     interf {clear}                      interférences 2 à 2 entre corps et volumes « extra » (volume commun, jeu minimal)
     views  {key, views:[…]}             mise en plan : projections (arêtes vues et cachées) d'un corps, en chemins SVG
   Fonctions (features) : extrude (bossage), cut (enlèvement), revolve (révolution, ajout ou enlèvement), fillet (congé),
   chamfer (chanfrein), shell (coque), pattern (répétition linéaire ou circulaire d'une fonction), mirror (symétrie),
   sweep (balayage d'un profil le long d'un chemin 3D). */
let R = null;
let last = { bodies: [], extra: [] };

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

async function init(bases) {
  let lastErr = null;
  for (const b of bases) {
    try {
      const ocMod = await import(b.oc + 'replicad_single.js');
      const rep = await import(b.rep + 'replicad.js');
      const OC = await ocMod.default({ locateFile: () => b.oc + 'replicad_single.wasm' });
      rep.setOC(OC);
      R = rep;
      return { from: b.label || b.oc };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('noyau introuvable');
}

/* ---------- esquisses → formes 2D ---------- */
function loopDrawing(l) {
  if (l.circle) return R.drawCircle(l.circle.r).translate(l.circle.c[0], l.circle.c[1]);
  const p = l.pts;
  let d = R.draw(p[0]);
  for (let i = 1; i < p.length; i++) d = d.lineTo(p[i]);
  return d.close();
}
function regionDrawing(r) {
  let d = loopDrawing(r.outer);
  for (const h of r.holes) d = d.cut(loopDrawing(h));
  return d;
}
const plane = (F, w = 0) => new R.Plane(V.add(F.t, V.mul(F.W, w)), F.U, F.W);

/* outil d'une fonction (solide à ajouter ou à enlever) */
function toolOf(f) {
  if (f.type === 'extrude' || f.type === 'cut') {
    let out = null;
    for (const r of f.regions) {
      const s = regionDrawing(r).sketchOnPlane(plane(f.F, f.w0)).extrude(f.w1 - f.w0);
      out = out ? out.fuse(s) : s;
    }
    return out;
  }
  if (f.type === 'revolve') {
    let out = null;
    for (const r of f.regions) {
      const s = regionDrawing(r).sketchOnPlane(plane(f.F)).revolve(f.axisDir, { origin: f.axisO, angle: f.ang });
      out = out ? out.fuse(s) : s;
    }
    return out;
  }
  return null;
}

/* chemin à coudes arrondis (rayon de cintrage) : segments droits raccordés par des arcs */
function filletPath(path, rad) {
  const out = [];
  let start = path[0];
  for (let i = 1; i + 1 < path.length; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const u = V.norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]), w = V.norm([c[0] - b[0], c[1] - b[1], c[2] - b[2]]);
    const cos = u[0] * w[0] + u[1] * w[1] + u[2] * w[2], th = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (th < 1e-3 || Math.PI - th < 1e-3) continue;
    const t = rad / Math.tan(th / 2);
    const la = V.len([a[0] - b[0], a[1] - b[1], a[2] - b[2]]), lc = V.len([c[0] - b[0], c[1] - b[1], c[2] - b[2]]);
    const tt = Math.min(t, la * 0.49, lc * 0.49);
    const p1 = V.add(b, V.mul(u, tt)), p2 = V.add(b, V.mul(w, tt));
    if (V.len([p1[0] - start[0], p1[1] - start[1], p1[2] - start[2]]) > 1e-6) out.push(R.makeLine(start, p1));
    out.push(R.makeThreePointArc(p1, arcMid(b, u, w, tt, th), p2));
    start = p2;
  }
  const end = path[path.length - 1];
  out.push(R.makeLine(start, end));
  return out;
}
function arcMid(b, u, w, t, th) {
  const bis = V.norm(V.add(u, w));
  const r = t * Math.tan(th / 2);
  const dc = r / Math.sin(th / 2);           // distance du sommet au centre de l'arc
  return V.add(b, V.mul(bis, dc - r));
}

/* tuyau balayé : section circulaire (ou annulaire) le long d'un chemin, coudes de rayon donné */
function pipeTool(f) {
  const path = f.path;
  const segs = f.bend > 0 && path.length > 2 ? filletPath(path, f.bend) : path.slice(1).map((p, i) => R.makeLine(path[i], p));
  const spine = R.assembleWire(segs);
  const d0 = V.norm([path[1][0] - path[0][0], path[1][1] - path[0][1], path[1][2] - path[0][2]]);
  const ref = Math.abs(d0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const x = V.norm([ref[1] * d0[2] - ref[2] * d0[1], ref[2] * d0[0] - ref[0] * d0[2], ref[0] * d0[1] - ref[1] * d0[0]]);
  const pl = new R.Plane(path[0], x, d0);
  const outer = R.drawCircle(f.r).sketchOnPlane(pl).wire;
  let solid = R.genericSweep(outer, spine, { frenet: true }, false);
  if (f.ri > 0 && f.ri < f.r) {
    const inner = R.drawCircle(f.ri).sketchOnPlane(pl).wire;
    solid = solid.cut(R.genericSweep(inner, spine, { frenet: true }, false));
  }
  return solid;
}

/* ---------- arêtes et faces visées par congé / chanfrein / coque ---------- */
function bbox(s) { const b = s.boundingBox; return { min: b.bounds[0], max: b.bounds[1] }; }
function edgeFilter(sel, s) {
  const bb = bbox(s), eps = 1e-3;
  switch (sel) {
    case 'vert': return (e) => e.inDirection('Z');
    case 'horiz': return (e) => e.parallelTo('XY');
    case 'top': return (e) => e.inPlane('XY', bb.max[2]);
    case 'bottom': return (e) => e.inPlane('XY', bb.min[2]);
    case 'topbottom': return (e) => e.either([(f) => f.inPlane('XY', bb.max[2]), (f) => f.inPlane('XY', bb.min[2])]);
    default: return undefined;   // toutes les arêtes
  }
}
function faceFilter(sel, s) {
  const bb = bbox(s);
  switch (sel) {
    case 'bottom': return (f) => f.inPlane('XY', bb.min[2]);
    case 'front': return (f) => f.inPlane('XZ', bb.min[1]);
    case 'back': return (f) => f.inPlane('XZ', bb.max[1]);
    case 'left': return (f) => f.inPlane('YZ', bb.min[0]);
    case 'right': return (f) => f.inPlane('YZ', bb.max[0]);
    default: return (f) => f.inPlane('XY', bb.max[2]);   // dessus
  }
}

/* transformation d'un outil pour la répétition / la symétrie */
function placed(tool, f, i) {
  if (f.kind === 'circ') return tool.clone().rotate(f.ang * i / (f.full ? f.n : Math.max(1, f.n - 1)), f.o, f.axis);
  return tool.clone().translate(V.mul(V.norm(f.dir), f.step * i));
}

/* message lisible pour une erreur d'OpenCascade (les exceptions C++ arrivent sans texte) */
function explain(e, f) {
  const m = String(e && e.message ? e.message : e);
  if (/WebAssembly|Exception|StdFail|Standard_/.test(m)) {
    if (f.type === 'fillet' || f.type === 'chamfer') return `${f.type === 'fillet' ? 'congé' : 'chanfrein'} impossible : rayon trop grand pour les arêtes visées, ou arêtes déjà arrondies (essayez une valeur plus petite ou d'autres arêtes)`;
    if (f.type === 'shell') return 'coque impossible : épaisseur trop grande, ou forme avec des congés trop petits';
    if (f.type === 'pipe') return 'balayage impossible : rayon de cintrage trop grand pour les longueurs droites';
    return 'opération géométrique impossible avec ces valeurs';
  }
  return m.slice(0, 200);
}

/* ---------- reconstruction de l'arbre ---------- */
function build(features) {
  const bodies = [];          // {key, shape, mat, layer, name, fids}
  const tools = new Map();    // fid → {tool, mode}
  const errors = [];
  const cur = () => bodies[bodies.length - 1];
  const ownerOf = (fid) => bodies.find((x) => x.fids.includes(fid)) || cur();
  /* mode : 'cut' (tous les corps, ou le corps courant), 'new' (nouveau corps), 'add' (fusion avec le corps visé, sinon le dernier) */
  const apply = (tool, mode, f, into) => {
    if (!tool) return;
    if (mode === 'cut') {
      if (!bodies.length) throw new Error('aucun corps à enlever : commencez par un bossage');
      const targets = f.bodies === 'cur' ? [cur()] : bodies;
      for (const b of targets) b.shape = b.shape.cut(tool);
      for (const b of targets) if (!b.fids.includes(f.id)) b.fids.push(f.id);
    } else {
      /* ajout : fusion avec le corps visé, sinon avec le corps que l'outil touche (comme les modeleurs) ; ne touche rien → nouveau corps */
      let b = mode === 'new' ? null : into;
      if (!b && mode !== 'new') { const tb = bbox(tool); b = [...bodies].reverse().find((x) => { const xb = bbox(x.shape); return [0, 1, 2].every((k) => tb.min[k] <= xb.max[k] + 1e-3 && xb.min[k] <= tb.max[k] + 1e-3); }) || null; }
      if (!b) bodies.push({ key: 'b' + f.id, shape: tool, mat: f.mat, layer: f.layer, name: f.bodyName || f.name, fids: [f.id] });
      else { b.shape = b.shape.fuse(tool); if (!b.fids.includes(f.id)) b.fids.push(f.id); }
    }
  };
  for (const f of features) {
    try {
      if (f.type === 'extrude' || f.type === 'cut' || f.type === 'revolve') {
        if (!f.regions || !f.regions.length) throw new Error('aucun contour fermé dans l\'esquisse');
        const tool = toolOf(f);
        const mode = f.type === 'cut' || f.op === 'cut' ? 'cut' : f.newBody ? 'new' : 'add';
        tools.set(f.id, { tool, mode });
        apply(tool, mode, f);
      } else if (f.type === 'pipe') {
        const tool = pipeTool(f);
        tools.set(f.id, { tool, mode: f.newBody === false ? 'add' : 'new' });
        apply(tool, f.newBody === false ? 'add' : 'new', f);
      } else if (f.type === 'fillet' || f.type === 'chamfer') {
        const b = f.target ? bodies.find((x) => x.fids.includes(f.target)) || cur() : cur();
        if (!b) throw new Error('aucun corps');
        const flt = edgeFilter(f.sel, b.shape);
        b.shape = f.type === 'fillet' ? b.shape.fillet(f.r, flt) : b.shape.chamfer(f.r, flt);
        b.fids.push(f.id);
      } else if (f.type === 'shell') {
        const b = cur(); if (!b) throw new Error('aucun corps');
        b.shape = b.shape.shell(f.t, faceFilter(f.face, b.shape));
        b.fids.push(f.id);
      } else if (f.type === 'pattern') {
        const src = tools.get(f.src);
        if (!src) throw new Error('fonction à répéter introuvable (elle doit être avant la répétition)');
        const into = src.mode === 'cut' ? null : ownerOf(f.src);
        for (let i = 1; i < f.n; i++) apply(placed(src.tool, f, i), src.mode === 'new' ? 'add' : src.mode, f, into);
      } else if (f.type === 'mirror') {
        const pl = f.plane || 'YZ', o = f.o || [0, 0, 0];
        if (f.src) {
          const src = tools.get(f.src); if (!src) throw new Error('fonction à symétriser introuvable');
          apply(src.tool.clone().mirror(pl, o), src.mode === 'new' ? 'add' : src.mode, f, src.mode === 'cut' ? null : ownerOf(f.src));
        } else {
          const b = cur(); if (!b) throw new Error('aucun corps');
          b.shape = b.shape.fuse(b.shape.clone().mirror(pl, o)); b.fids.push(f.id);
        }
      }
    } catch (e) {
      errors.push({ fid: f.id, msg: explain(e, f) });
    }
  }
  return { bodies, errors };
}

/* volumes « extra » (composants d'assemblage, réseaux, structures du plan) : servent aux interférences et à l'export STEP */
function extraShape(d) {
  let s = null;
  if (d.k === 'ext') {
    const F = { U: d.M.slice(0, 3), W: d.M.slice(6, 9), t: d.M.slice(9, 12) };
    const r = { outer: { pts: d.outer }, holes: (d.holes || []).map((h) => ({ pts: h })) };
    s = regionDrawing(r).sketchOnPlane(plane(F, d.w0)).extrude(d.w1 - d.w0);
  } else if (d.k === 'cyl') {
    s = R.drawCircle(d.r).translate(d.c[0], d.c[1]).sketchOnPlane(new R.Plane([0, 0, d.z0], [1, 0, 0], [0, 0, 1])).extrude(d.z1 - d.z0);
  } else if (d.k === 'prism') {
    const r = { outer: { pts: d.rings[0] }, holes: d.rings.slice(1).map((h) => ({ pts: h })) };
    s = regionDrawing(r).sketchOnPlane(new R.Plane([0, 0, d.z0], [1, 0, 0], [0, 0, 1])).extrude(d.z1 - d.z0);
  } else if (d.k === 'pipe') {
    const ax = [d.b[0] - d.a[0], d.b[1] - d.a[1], d.b[2] - d.a[2]], L = V.len(ax);
    if (L < 1e-6) return null;
    const n = V.norm(ax), ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const x = V.norm([ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]]);
    s = R.drawCircle(d.r).sketchOnPlane(new R.Plane(d.a, x, n)).extrude(L);
  } else if (d.k === 'rev') {
    const P = d.prof.concat([d.prof[0]]);
    let dr = R.draw([P[0][0], P[0][1]]); for (let i = 1; i < P.length - 1; i++) dr = dr.lineTo([P[i][0], P[i][1]]); dr = dr.close();
    s = dr.sketchOnPlane(new R.Plane(d.O, d.Z, d.X)).revolve(d.Y, { origin: d.O, angle: d.ang * 180 / Math.PI });
  }
  if (s && d.tf) { if (d.tf.rot) s = s.rotate(d.tf.rot, [0, 0, 0], [0, 0, 1]); s = s.translate(d.tf.pos); }
  return s;
}

/* ---------- maillage et propriétés ---------- */
function meshOf(shape, tol) {
  const m = shape.mesh({ tolerance: tol, angularTolerance: 0.25 });
  const e = shape.meshEdges({ tolerance: tol, angularTolerance: 0.25 });
  return {
    pos: new Float32Array(m.vertices), nrm: new Float32Array(m.normals), idx: new Uint32Array(m.triangles),
    faces: m.faceGroups.map((g) => [g.start, g.count, g.faceId]), edges: new Float32Array(e.lines), edgeGroups: e.edgeGroups.map((g) => [g.start, g.count, g.edgeId]),
  };
}
/* Propriétés de masse (densité 1) : volume et centre de gravité par OpenCascade ; matrice d'inertie au centre de gravité
   intégrée sur un maillage fin (méthode des tétraèdres, divergence) : gp_Mat n'est pas exposé par ce noyau compilé. */
function massProps(shape, m) {
  const p = R.measureShapeVolumeProperties(shape);
  const out = { volume: p.volume, cog: p.centerOfMass, area: R.measureArea(shape) };
  try { out.inertia = inertiaOf(m, out.cog); } catch (e) { /* inertie indisponible */ }
  try { p.delete(); } catch (e) { /* ramassé plus tard */ }
  const b = bbox(shape); out.bbox = [...b.min, ...b.max];
  return out;
}
function inertiaOf(m, c) {
  const P = m.pos, T = m.idx;
  let xx = 0, yy = 0, zz = 0, xy = 0, yz = 0, zx = 0, vol = 0;
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3, b = T[i + 1] * 3, d = T[i + 2] * 3;
    const ax = P[a] - c[0], ay = P[a + 1] - c[1], az = P[a + 2] - c[2];
    const bx = P[b] - c[0], by = P[b + 1] - c[1], bz = P[b + 2] - c[2];
    const dx = P[d] - c[0], dy = P[d + 1] - c[1], dz = P[d + 2] - c[2];
    const v = (ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx)) / 6;
    vol += v;
    const s2 = (u, w, t) => u * u + w * w + t * t + u * w + w * t + t * u;
    const sx = s2(ax, bx, dx), sy = s2(ay, by, dy), sz = s2(az, bz, dz);
    xx += v * (sy + sz) / 10; yy += v * (sx + sz) / 10; zz += v * (sx + sy) / 10;
    const pr = (u1, u2, u3, w1, w2, w3) => 2 * (u1 * w1 + u2 * w2 + u3 * w3) + u1 * w2 + u1 * w3 + u2 * w1 + u2 * w3 + u3 * w1 + u3 * w2;
    xy += v * pr(ax, bx, dx, ay, by, dy) / 20; yz += v * pr(ay, by, dy, az, bz, dz) / 20; zx += v * pr(az, bz, dz, ax, bx, dx) / 20;
  }
  const k = vol < 0 ? -1 : 1;
  return [[k * xx, -k * xy, -k * zx], [-k * xy, k * yy, -k * yz], [-k * zx, -k * yz, k * zz]];
}

/* ---------- messages ---------- */
self.onmessage = async (ev) => {
  const { id, op } = ev.data || {};
  const reply = (o, tr) => self.postMessage({ id, ok: true, ...o }, tr || []);
  try {
    if (op === 'init') { const r = await init(ev.data.bases); return reply(r); }
    if (!R) throw new Error('noyau non chargé');
    if (op === 'build') {
      const t0 = performance.now();
      const { bodies, errors } = build(ev.data.features || []);
      const extra = [];
      for (const x of ev.data.extra || []) { try { const s = extraShape(x.desc); if (s) extra.push({ key: x.key, grp: x.grp, name: x.name, shape: s, mat: x.mat, desc: x.desc }); } catch (e) { errors.push({ key: x.key, msg: String(e.message || e).slice(0, 160) }); } }
      last = { bodies, extra };
      const out = [], tr = [];
      for (const b of bodies) {
        const sz = (() => { const bb = bbox(b.shape); return Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]); })();
        const m = meshOf(b.shape, Math.max(0.01, sz / 1500));
        tr.push(m.pos.buffer, m.nrm.buffer, m.idx.buffer, m.edges.buffer);
        const fine = meshOf(b.shape, Math.max(0.005, sz / 4000));
        out.push({ key: b.key, name: b.name, mat: b.mat, layer: b.layer, fids: b.fids, mesh: m, props: massProps(b.shape, fine) });
      }
      return reply({ bodies: out, errors, ms: Math.round(performance.now() - t0) }, tr);
    }
    if (op === 'export') {
      const all = [...last.bodies.map((b) => ({ shape: b.shape, name: b.name })), ...(ev.data.withExtra ? last.extra.map((x) => ({ shape: x.shape, name: x.name })) : [])];
      if (!all.length) throw new Error('rien à exporter');
      if (ev.data.format === 'step') { const blob = R.exportSTEP(all.map((x, i) => ({ shape: x.shape.clone(), name: (x.name || 'corps ' + (i + 1)).replace(/[^\w\- ]/g, '_') }))); const buf = await blob.arrayBuffer(); return reply({ buf }, [buf]); }
      if (ev.data.format === 'stl') {
        const s = all.length === 1 ? all[0].shape : R.makeCompound(all.map((x) => x.shape.clone()));   /* makeCompound consomme ses entrées : on passe des copies */
        const blob = s.blobSTL({ tolerance: 0.05, angularTolerance: 0.2, binary: true }); const buf = await blob.arrayBuffer(); return reply({ buf }, [buf]);
      }
      throw new Error('format inconnu');
    }
    if (op === 'interf') {
      const items = [...last.bodies.map((b) => ({ key: b.key, grp: b.key, name: b.name, shape: b.shape })), ...last.extra];
      const bbs = items.map((x) => bbox(x.shape));
      const clear = ev.data.clear || 0, hits = [];
      /* raccordements voulus, non signalés : tronçons d'un même objet, réseaux bout à bout, réseau qui débouche dans un équipement */
      const ends = (x) => (x.desc && x.desc.k === 'pipe' ? [x.desc.a, x.desc.b] : null);
      const near = (p, q, d) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= d;
      const inBox = (p, bb, m) => p[0] >= bb.min[0] - m && p[0] <= bb.max[0] + m && p[1] >= bb.min[1] - m && p[1] <= bb.max[1] + m && p[2] >= bb.min[2] - m && p[2] <= bb.max[2] + m;
      const linked = (i, j) => {
        const x = items[i], y = items[j];
        if (x.grp && x.grp === y.grp) return true;
        const ex = ends(x), ey = ends(y);
        if (ex && ey) return ex.some((p) => ey.some((q) => near(p, q, x.desc.r + y.desc.r + 1)));
        if (ex) return ex.some((p) => inBox(p, bbs[j], x.desc.r));
        if (ey) return ey.some((p) => inBox(p, bbs[i], y.desc.r));
        return false;
      };
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        if (linked(i, j)) continue;
        const a = bbs[i], b = bbs[j];
        if (a.max[0] + clear < b.min[0] || b.max[0] + clear < a.min[0] || a.max[1] + clear < b.min[1] || b.max[1] + clear < a.min[1] || a.max[2] + clear < b.min[2] || b.max[2] + clear < a.min[2]) continue;
        let vol = 0;
        try { const c = items[i].shape.intersect(items[j].shape); vol = R.measureVolume(c); } catch (e) { vol = 0; }
        if (vol > 1e-3) { hits.push({ a: items[i].key, b: items[j].key, an: items[i].name, bn: items[j].name, vol }); continue; }
        if (clear > 0) { let d = Infinity; try { d = R.measureDistanceBetween(items[i].shape, items[j].shape); } catch (e) { /* distance indisponible */ } if (d < clear) hits.push({ a: items[i].key, b: items[j].key, an: items[i].name, bn: items[j].name, vol: 0, gap: d }); }
      }
      return reply({ hits, n: items.length });
    }
    if (op === 'views') {
      const b = last.bodies.find((x) => x.key === ev.data.key) || last.bodies[0];
      if (!b) throw new Error('aucun corps');
      const out = {};
      for (const v of ev.data.views || ['front', 'top', 'right']) {
        const pr = R.drawProjection(b.shape, v);
        out[v] = { visible: pr.visible.toSVGPaths().flat(), hidden: pr.hidden.toSVGPaths().flat(), box: pr.visible.boundingBox ? [pr.visible.boundingBox.bounds[0], pr.visible.boundingBox.bounds[1]] : null };
      }
      return reply({ views: out });
    }
    throw new Error('opération inconnue : ' + op);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e).slice(0, 300) });
  }
};
