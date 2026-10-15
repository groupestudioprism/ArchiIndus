/* Moteur 3D d'ARCHIINDUS (Three.js r160, même version et même chargement qu'ARCHIPLAN : importmap + module ES).
   Reçoit des « solides » calculés par View3D.solids() (classic script) : réseaux (cylindres), murs / poutres / équipements (volumes extrudés),
   lignes. Lecture seule : orbite, zoom, vues, styles ; export GLB pour Archi Vision. Si Three.js ne se charge pas (hors ligne), l'application
   garde l'aperçu en fil de fer (View3D.show). Repère : plan (x, y, z haut) en mm → Three (x, z, −y) en m. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_SOLIDS = 20000;
let renderer = null, scene = null, camera = null, controls = null, canvas = null, root = null, grid = null, raf = 0, ro = null, siteGrp = null, siteData = null;
let style = 'shaded', box = new THREE.Box3(), last = { n: 0, capped: false };

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#ffffff';
const V = (x, y, z) => new THREE.Vector3(x / 1000, z / 1000, -y / 1000);
const Z_UP = new THREE.Matrix4().set(0.001, 0, 0, 0, 0, 0, 0.001, 0, 0, -0.001, 0, 0, 0, 0, 0, 1);
/* Matrice Three d'un repère local du plan (U, V, W, t en mm, plan x/y/z haut) → scène (m, Y vers le haut). */
function planMatrix(M) {
  const P = (x, y, z) => [x / 1000, z / 1000, -y / 1000];
  const U = P(M[0], M[1], M[2]), Vv = P(M[3], M[4], M[5]), W = P(M[6], M[7], M[8]), T = P(M[9], M[10], M[11]);
  return new THREE.Matrix4().set(U[0], Vv[0], W[0], T[0], U[1], Vv[1], W[1], T[1], U[2], Vv[2], W[2], T[2], 0, 0, 0, 1);
}

/* Couleur d'affichage : calque (Ombré), matériau (Matériaux) ou taux d'utilisation (Utilisation : vert < 0,7 < orange < 1 < rouge). */
function colorOf(s) {
  if (style === 'mat' && s.mcol) return s.mcol;
  if (style === 'util') { if (s.util == null) return '#C9CED4'; return s.util < 0.7 ? '#1E8E5A' : s.util < 1 ? '#E2861B' : '#B3261E'; }
  return s.col;
}
function mats(col) {
  const c = new THREE.Color(col);
  const base = { color: c, roughness: 0.62, metalness: 0.08 };
  if (style === 'wire') return new THREE.MeshBasicMaterial({ color: c, wireframe: true });
  if (style === 'xray') return new THREE.MeshStandardMaterial({ ...base, transparent: true, opacity: 0.28, depthWrite: false });
  return new THREE.MeshStandardMaterial(base);
}

function shapeOf(rings) {
  const sh = new THREE.Shape(rings[0].map((p) => new THREE.Vector2(p[0] / 1000, p[1] / 1000)));
  for (const h of rings.slice(1)) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0] / 1000, p[1] / 1000))));
  return sh;
}

function shapeMM(outer, holes) {
  const sh = new THREE.Shape(outer.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes || []) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  return sh;
}
function buildSolids(solids, minR) {
  const g = new THREE.Group();
  const edgeMat = (col) => new THREE.LineBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.55) });
  let n = 0;
  for (const s of solids) {
    if (n++ >= MAX_SOLIDS) break;
    const col = s.sel ? css('--sel') || '#E2861B' : colorOf(s);
    let obj = null;
    if (s.k === 'pipe') {
      const a = V(...s.a), b = V(...s.b), len = a.distanceTo(b);
      if (len < 1e-6) continue;
      const r = Math.max(s.r / 1000, minR);
      const grp = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14, 1), mats(col));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      grp.add(m);
      const j = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mats(col)); j.position.copy(b); grp.add(j);
      obj = grp;
    } else if (s.k === 'prism') {
      if (!s.rings.length || s.rings[0].length < 3 || s.z1 <= s.z0) continue;
      const geo = new THREE.ExtrudeGeometry(shapeOf(s.rings), { depth: (s.z1 - s.z0) / 1000, bevelEnabled: false });
      const grp = new THREE.Group(), m = new THREE.Mesh(geo, mats(col));
      m.rotation.x = -Math.PI / 2; m.position.y = s.z0 / 1000; grp.add(m);
      if (style !== 'wire') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat(col)); e.rotation.x = -Math.PI / 2; e.position.y = s.z0 / 1000; grp.add(e); }
      obj = grp;
    } else if (s.k === 'ext') {
      /* extrusion dans un repère local (u, v) → w, en mm ; la matrice place le volume (esquisse sur plan, profilé le long d'un tronçon) */
      if (!s.outer || s.outer.length < 3 || s.w1 <= s.w0) continue;
      const geo = new THREE.ExtrudeGeometry(shapeMM(s.outer, s.holes), { depth: s.w1 - s.w0, bevelEnabled: false, curveSegments: 24 });
      geo.translate(0, 0, s.w0);
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false;
      grp.matrix.copy(planMatrix(s.M));
      const m = new THREE.Mesh(geo, mats(col)); grp.add(m);
      if (style !== 'wire') grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat(col)));
      obj = grp;
    } else if (s.k === 'rev') {
      /* révolution : profil (r, h) en mm autour de l'axe local Y, repère (X, Y, Z, O) dans le plan */
      if (!s.prof || s.prof.length < 3) continue;
      const pts = s.prof.concat([s.prof[0]]).map(([r, h]) => new THREE.Vector2(Math.max(0, r), h));
      const geo = new THREE.LatheGeometry(pts, 48, 0, s.ang);
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false;
      grp.matrix.copy(planMatrix([...s.X, ...s.Y, ...s.Z, ...s.O]));
      grp.add(new THREE.Mesh(geo, mats(col)));
      obj = grp;
    } else if (s.k === 'mesh') {
      /* corps calculé par le noyau OpenCascade : triangles et arêtes vraies (mm, z vers le haut) */
      const M = s.mesh, geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(M.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(M.nrm, 3));
      geo.setIndex(new THREE.BufferAttribute(M.idx, 1));
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.matrix.copy(Z_UP);
      const m = new THREE.Mesh(geo, mats(col)); m.userData.faces = M.faces; m.userData.key = s.key; m.userData.fids = s.fids; grp.add(m);
      if (style !== 'wire' && M.edges.length) { const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(M.edges, 3)); grp.add(new THREE.LineSegments(eg, edgeMat(col))); }
      obj = grp;
    } else if (s.k === 'cyl') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r / 1000, s.r / 1000, (s.z1 - s.z0) / 1000, 28), mats(col));
      m.position.copy(V(s.c[0], s.c[1], (s.z0 + s.z1) / 2));
      obj = m;
    } else if (s.k === 'line') {
      const geo = new THREE.BufferGeometry().setFromPoints(s.pts.map((p) => V(...p)));
      obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(col) }));
    }
    if (!obj) continue;
    if (s.tf) {
      /* composant : la pièce est décrite autour de son origine ; on applique sa position et sa rotation */
      /* rotation dans le plan (autour de Z) = rotation autour de Y dans la scène ; même sens (vu de dessus) */
      const holder = new THREE.Group(); holder.position.copy(V(...s.tf.pos)); holder.rotation.y = (s.tf.rot || 0) * Math.PI / 180;
      holder.add(obj); g.add(holder);
    } else g.add(obj);
    const tagPick = (o) => { o.traverse((x) => { if (x.isMesh) { if (s.cid) x.userData.cid = s.cid; if (s.fid) x.userData.fid = s.fid; if (s.oid) x.userData.oid = s.oid; if (s.key) x.userData.key = s.key; if (s.fids) x.userData.fids = s.fids; } }); };
    tagPick(obj);
    if (s.cid) obj.userData.cid = s.cid;
    if (s.fid) obj.userData.fid = s.fid;
  }
  last = { n: Math.min(n, MAX_SOLIDS), capped: solids.length > MAX_SOLIDS };
  return g;
}


/* ---------- site réel (relief, bâtiments, voirie) : même principe qu'ARCHITRAFFIC (30-world.js), simplifié ---------- */
function disposeGrp(g) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
function buildSite(S) {
  const g = new THREE.Group(); g.name = 'Site';
  const H = (x, y) => Site.H(x, y);   // Site : constante globale du script classique (portée lexicale globale partagée avec le module)
  const P3 = (x, y, z) => new THREE.Vector3(x, z, -y);
  /* terrain */
  const n = Math.min(S.elev.N, 161), st = S.size / (n - 1), pos = [], idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -S.size / 2 + i * st, y = -S.size / 2 + j * st; pos.push(x, H(x, y) - 0.03, -y); }
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, d, a, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
  const terr = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xC9CDB4, roughness: 1, metalness: 0 })); terr.name = 'Terrain'; g.add(terr);
  /* voirie : rubans posés sur le relief */
  const rp = [];
  for (const r of S.W.roads) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue;
      const nx = -(b[1] - a[1]) / L * r.w / 2, ny = (b[0] - a[0]) / L * r.w / 2;
      const q = [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]].map(([x, y]) => P3(x, y, H(x, y) + (r.foot ? 0.04 : 0.06)));
      rp.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
  }
  if (rp.length) { const rg = new THREE.BufferGeometry().setFromPoints(rp); rg.computeVertexNormals(); const m = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x6E737A, roughness: 0.95, side: THREE.DoubleSide })); m.name = 'Voirie'; g.add(m); }
  /* bâtiments : emprises extrudées à leur hauteur (toits plats), posées au point le plus bas du terrain */
  const geos = [];
  for (const b of S.W.bld) {
    const p = Math.sign(areaXY(b.p)) < 0 ? b.p.slice().reverse() : b.p;
    const zb = Math.min(...p.map((q) => H(q[0], q[1]))) - 0.3;
    try {
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(p.map((q) => new THREE.Vector2(q[0], q[1]))), { depth: b.h + 0.3, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); geo.translate(0, zb, 0); geos.push(geo);
    } catch (e) { /* emprise dégénérée : ignorée */ }
  }
  if (geos.length) { const merged = mergeGeometries(geos.map((x) => x.index ? x.toNonIndexed() : x)); geos.forEach((x) => x.dispose()); const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0xE7E3DA, roughness: 0.9 })); m.name = 'Bâtiments'; g.add(m); }
  return g;
}
const areaXY = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };

function extentOf(solids) {
  const b = new THREE.Box3();
  for (const s of solids) {
    const o = s.tf ? s.tf.pos : [0, 0, 0];
    const add = (x, y, z) => b.expandByPoint(V(x + o[0], y + o[1], z + o[2]));
    if (s.k === 'pipe') { add(...s.a); add(...s.b); }
    else if (s.k === 'prism') { for (const p of s.rings[0]) { add(p[0], p[1], s.z0); add(p[0], p[1], s.z1); } }
    else if (s.k === 'cyl') { add(s.c[0] - s.r, s.c[1] - s.r, s.z0); add(s.c[0] + s.r, s.c[1] + s.r, s.z1); }
    else if (s.k === 'line') for (const p of s.pts) add(...p);
    else if (s.k === 'ext') { const M = s.M; for (const [u, v] of s.outer) for (const w of [s.w0, s.w1]) add(M[9] + u * M[0] + v * M[3] + w * M[6], M[10] + u * M[1] + v * M[4] + w * M[7], M[11] + u * M[2] + v * M[5] + w * M[8]); }
    else if (s.k === 'mesh') { const P = s.mesh.pos; for (let i = 0; i < P.length; i += 3 * Math.max(1, Math.floor(P.length / 3000))) add(P[i], P[i + 1], P[i + 2]); }
    else if (s.k === 'rev') { const R = Math.max(...s.prof.map((q) => q[0])), H = Math.max(...s.prof.map((q) => Math.abs(q[1]))); add(s.O[0] - R - H, s.O[1] - R - H, s.O[2] - R - H); add(s.O[0] + R + H, s.O[1] + R + H, s.O[2] + R + H); }
  }
  return b;
}

function lights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(30, 60, 20); scene.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-40, 30, -30); scene.add(d2);
}

/* ---------- caméra, vues, cube de vue ---------- */
let framed = false, dirty = true, hover = null, hoverMats = null, picked = null, onPick = null, section = null, cube = null;
function frame() {
  const bx = box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-40, -5, -40), new THREE.Vector3(40, 20, 40)) : box;
  const c = bx.getCenter(new THREE.Vector3()), r = Math.max(bx.getSize(new THREE.Vector3()).length() / 2, 0.05);
  controls.target.copy(c);
  const dist = r / Math.sin((camera.fov * Math.PI / 180) / 2) * 0.95;
  camera.near = Math.max(dist / 2000, 0.0005); camera.far = Math.max(dist * 60, siteGrp ? 8000 : 0); camera.updateProjectionMatrix();
  controls.minDistance = Math.max(r / 500, 0.002); controls.maxDistance = Math.max(dist * 20, 50);
  return { c, dist };
}
const DIRS = { iso: [1, 0.8, 1], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], front: [0, 0.0001, 1], back: [0, 0.0001, -1], right: [1, 0.0001, 0], left: [-1, 0.0001, 0],
  isoNE: [1, 0.8, -1], isoNW: [-1, 0.8, -1], isoSW: [-1, 0.8, 1] };
function setView(name) {
  const { c, dist } = frame();
  const d = new THREE.Vector3(...(DIRS[name] || DIRS.iso)).normalize();
  camera.position.copy(c).addScaledVector(d, dist);
  camera.up.set(0, 1, 0); if (name === 'top') camera.up.set(0, 0, -1); if (name === 'bottom') camera.up.set(0, 0, 1);
  controls.update(); dirty = true;
}
/* vue normale à une direction (face sélectionnée) */
function viewNormal(n) {
  const { c, dist } = frame();
  camera.position.copy(c).addScaledVector(n.clone().normalize(), dist);
  camera.up.set(0, 1, 0); if (Math.abs(n.y) > 0.99) camera.up.set(0, 0, -Math.sign(n.y));
  controls.update(); dirty = true;
}

/* Cube de vue (comme le ViewCube) : six faces cliquables, orienté comme la caméra */
function buildCube() {
  const wrap = document.createElement('div'); wrap.className = 'vcube'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Cube de vue : cliquer une face pour orienter la vue');
  const body = document.createElement('div'); body.className = 'vc-body';
  const F = [['top', 'Dessus', 'rotateX(90deg)'], ['bottom', 'Dessous', 'rotateX(-90deg)'], ['front', 'Face', ''], ['back', 'Arrière', 'rotateY(180deg)'], ['right', 'Droite', 'rotateY(90deg)'], ['left', 'Gauche', 'rotateY(-90deg)']];
  for (const [k, t, tr] of F) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vc-f'; b.dataset.view = k; b.textContent = t; b.title = `Vue ${t.toLowerCase()}`;
    b.style.transform = `${tr} translateZ(28px)`;
    b.addEventListener('click', (e) => { e.stopPropagation(); setView(k); });
    body.append(b);
  }
  const home = document.createElement('button'); home.type = 'button'; home.className = 'vc-home'; home.title = 'Vue isométrique'; home.setAttribute('aria-label', 'Vue isométrique'); home.textContent = '⌂';
  home.addEventListener('click', () => setView('iso'));
  wrap.append(body, home);
  canvas.parentElement.append(wrap);
  cube = body;
}
function syncCube() {
  if (!cube) return;
  const m = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse), e = m.elements;
  /* CSS : y vers le bas */
  cube.style.transform = `translateZ(-60px) matrix3d(${e[0]},${-e[1]},${e[2]},0,${-e[4]},${e[5]},${-e[6]},0,${e[8]},${-e[9]},${e[10]},0,0,0,0,1)`;
}

/* ---------- survol et sélection dans la vue 3D ---------- */
const rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hitAt(cx, cy) {
  if (!root) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  rc.setFromCamera(ndc, camera);
  const hits = rc.intersectObject(root, true).filter((h) => h.object.isMesh && (!section || section.plane.distanceToPoint(h.point) >= 0));
  return hits[0] || null;
}
function setHover(o) {
  if (hover === o) return;
  if (hover && hoverMats) { hover.material = hoverMats; }
  hover = o; hoverMats = null;
  if (o && o.material && o.material.isMaterial && !o.material.wireframe) {
    hoverMats = o.material; const m = o.material.clone(); if (m.emissive) { m.emissive = new THREE.Color(css('--accent') || '#0877B9'); m.emissiveIntensity = 0.35; } o.material = m;
  }
  canvas.style.cursor = o ? 'pointer' : '';
  dirty = true;
}
function pickInfo(h) {
  if (!h) return null;
  const o = h.object, u = o.userData, out = { cid: u.cid || 0, fid: u.fid || 0, oid: u.oid || 0, key: u.key || '', fids: u.fids || null };
  if (u.faces && h.faceIndex != null) {
    const tri = h.faceIndex * 3; const g = u.faces.find((f) => tri >= f[0] && tri < f[0] + f[1]);
    if (g) out.face = g[2];
    /* point et normale dans le repère du plan (mm, z haut) */
    const n = h.face.normal.clone(), p = o.worldToLocal(h.point.clone());
    out.point = [p.x, p.y, p.z]; out.normal = [n.x, n.y, n.z];
    if (g) { const idx = o.geometry.index.array, pos = o.geometry.attributes.position.array, nr = o.geometry.attributes.normal.array; let planar = true;
      for (let t = g[0]; t < g[0] + g[1]; t += 3 * Math.max(1, Math.floor(g[1] / 30))) { const k = idx[t] * 3; if (Math.abs(nr[k] * n.x + nr[k + 1] * n.y + nr[k + 2] * n.z) < 0.999) { planar = false; break; } }
      out.planar = planar; }
  }
  return out;
}
let down = null;
function bindPick() {
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const h = hitAt(e.clientX, e.clientY); setHover(h ? h.object : null);
  });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || down.b !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const info = pickInfo(hitAt(e.clientX, e.clientY));
    window.dispatchEvent(new CustomEvent('ai:pick3d', { detail: { ...(info || {}), shift: e.shiftKey, x: e.clientX, y: e.clientY } }));
  });
  canvas.addEventListener('dblclick', (e) => {
    const h = hitAt(e.clientX, e.clientY); if (!h) return;
    const info = pickInfo(h); window.dispatchEvent(new CustomEvent('ai:dbl3d', { detail: info }));
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  /* zoom à la molette maîtrisé (même réglage qu'ARCHIPLAN) : pas fixe, plafonné, centré sur le curseur */
  const STEP = 0.96, pl = new THREE.Plane(), v = new THREE.Vector3(), w = new THREE.Vector3();
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault(); ev.stopImmediatePropagation();
    let d = ev.deltaY * (ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1);
    if (!d || !isFinite(d)) return;
    if (ev.ctrlKey) d *= 2.5;
    const n = Math.max(-1.5, Math.min(1.5, d / 100)), f = Math.pow(STEP, Math.abs(n)), zin = n < 0;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const dist = camera.position.distanceTo(controls.target);
    const nd = Math.max(controls.minDistance, Math.min(controls.maxDistance, zin ? dist * f : dist / f));
    camera.getWorldDirection(w); pl.setFromNormalAndCoplanarPoint(w, controls.target);
    const hit = () => { rc.setFromCamera(ndc, camera); return rc.ray.intersectPlane(pl, new THREE.Vector3()); };
    const p0 = hit();
    v.subVectors(camera.position, controls.target).setLength(nd); camera.position.copy(controls.target).add(v); camera.updateMatrixWorld();
    const p1 = p0 && hit();
    if (p0 && p1) { v.subVectors(p0, p1); camera.position.add(v); controls.target.add(v); }
    controls.update(); dirty = true;
  }, { capture: true, passive: false });
}

/* ---------- coupe dynamique (plan de section) ---------- */
function setSection(axis, t) {
  if (!renderer) return;
  if (!axis) { section = null; renderer.clippingPlanes = []; dirty = true; return; }
  const b = box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)) : box;
  const n = axis === 'x' ? new THREE.Vector3(-1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, -1, 0);
  const lo = axis === 'x' ? b.min.x : axis === 'y' ? -b.max.z : b.min.y, hi = axis === 'x' ? b.max.x : axis === 'y' ? -b.min.z : b.max.y;
  const pos = lo + (hi - lo) * t;
  const plane = axis === 'y' ? new THREE.Plane(n, pos) : new THREE.Plane(n, pos);
  section = { axis, t, plane };
  renderer.clippingPlanes = [plane]; dirty = true;
}

function render() { if (renderer) { renderer.render(scene, camera); syncCube(); } }
function loop() { raf = requestAnimationFrame(loop); if (controls.update() || dirty) { render(); dirty = false; } }

function size() {
  if (!renderer) return;
  const r = canvas.parentElement.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); dirty = true;
}

function build(solids) {
  setHover(null);
  if (root) { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  box = extentOf(solids);
  const ext = box.isEmpty() ? 10 : box.getSize(new THREE.Vector3()).length();
  root = buildSolids(solids, Math.max(ext / 900, 0.004));
  scene.add(root);
  { const b2 = new THREE.Box3().setFromObject(root); if (!b2.isEmpty()) box = b2; }
  if (grid) scene.remove(grid);
  const sz = Math.max(10, Math.ceil(ext * 1.5));
  grid = new THREE.GridHelper(sz, Math.min(100, sz), new THREE.Color(css('--grid-major')), new THREE.Color(css('--grid-minor')));
  const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  grid.position.set(c.x, box.isEmpty() ? 0 : Math.min(box.min.y, 0), c.z);
  scene.add(grid);
  if (section) setSection(section.axis, section.t);
  dirty = true;
}

const Scene3D = {
  ready: true,
  /* Affiche (ou met à jour) la vue 3D. La caméra n'est cadrée qu'au premier affichage, ou sur demande (opts.fit). */
  show(cv, solids, opts = {}) {
    canvas = cv;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.localClippingEnabled = false;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enableZoom = false;
      controls.addEventListener('change', () => { dirty = true; });
      lights();
      ro = new ResizeObserver(size); ro.observe(canvas.parentElement);
      buildCube(); bindPick();
    }
    if (opts.style) style = opts.style;
    scene.background = new THREE.Color(css('--vp'));
    build(solids);
    if (siteData && !siteGrp) { siteGrp = buildSite(siteData); scene.add(siteGrp); }
    if (grid) grid.visible = !siteGrp;
    size();
    if (!framed || opts.fit) { setView(opts.view || 'iso'); framed = true; }
    if (!raf) loop();
    return { count: last.n, capped: last.capped, max: MAX_SOLIDS };
  },
  setSite(S) {
    siteData = S;
    if (!scene) return;
    if (siteGrp) { scene.remove(siteGrp); disposeGrp(siteGrp); siteGrp = null; }
    if (S) { siteGrp = buildSite(S); scene.add(siteGrp); if (grid) grid.visible = false; } else if (grid) grid.visible = true;
    dirty = true;
  },
  hide() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
  resume() { if (renderer && !raf) { loop(); size(); } },
  view: (name) => { if (renderer) setView(name); },
  viewNormal: (n) => { if (renderer) viewNormal(new THREE.Vector3(n[0], n[2], -n[1])); },
  setStyle(st, solids) { style = st; if (renderer) build(solids); },
  section: setSection,
  sectionState: () => (section ? { axis: section.axis, t: section.t } : null),
  render,
  /* Export GLB (binaire glTF 2.0) de la scène courante : même géométrie que l'affichage. */
  async exportGLB() {
    if (!root) throw new Error('Aucune scène 3D à exporter.');
    const ex = new GLTFExporter();
    const tmp = new THREE.Scene(); tmp.add(root.clone(true));
    const lieu = typeof Site !== 'undefined' && Site.lieu ? Site.lieu() : null;
    tmp.userData = { archiindus: { version: 2, unites: 'm', axe: 'Y vers le haut' }, ...(lieu ? { archiplan: { lieu } } : {}) };
    return new Promise((res, rej) => ex.parse(tmp, (buf) => res(buf), (e) => rej(e), { binary: true }));
  },
  stats() { return { objects: root ? root.children.length : 0, site: siteGrp ? siteGrp.children.map((c) => c.name) : [], ...last, cam: camera ? camera.position.toArray() : null }; },
  screenshot() { render(); return canvas.toDataURL('image/png'); },
  /* tests : simule un clic au point écran (x, y) */
  pickAt(x, y) { return pickInfo(hitAt(x, y)); },
  project(p) { const v = new THREE.Vector3(p[0] / 1000, p[2] / 1000, -p[1] / 1000).project(camera); const r = canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
};
window.Scene3D = Scene3D;
window.dispatchEvent(new Event('scene3d-ready'));
