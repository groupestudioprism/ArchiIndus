/* Moteur 3D d'ARCHIINDUS (Three.js r160, même version et même chargement qu'ARCHIPLAN : importmap + module ES).
   Reçoit des « solides » calculés par View3D.solids() (classic script) : réseaux (cylindres), murs / poutres / équipements (volumes extrudés),
   lignes. Lecture seule : orbite, zoom, vues, styles ; export GLB pour Archi Vision. Si Three.js ne se charge pas (hors ligne), l'application
   garde l'aperçu en fil de fer (View3D.show). Repère : plan (x, y, z haut) en mm → Three (x, z, −y) en m. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const MAX_SOLIDS = 20000;
let renderer = null, scene = null, camera = null, controls = null, canvas = null, root = null, grid = null, raf = 0, ro = null;
let style = 'shaded', box = new THREE.Box3(), last = { n: 0, capped: false };

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#ffffff';
const V = (x, y, z) => new THREE.Vector3(x / 1000, z / 1000, -y / 1000);

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

function buildSolids(solids, minR) {
  const g = new THREE.Group();
  const edgeMat = (col) => new THREE.LineBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.55) });
  let n = 0;
  for (const s of solids) {
    if (n++ >= MAX_SOLIDS) break;
    if (s.k === 'pipe') {
      const a = V(...s.a), b = V(...s.b), len = a.distanceTo(b);
      if (len < 1e-6) continue;
      const r = Math.max(s.r / 1000, minR);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14, 1), mats(s.col));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
      const j = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mats(s.col)); j.position.copy(b); g.add(j);
    } else if (s.k === 'prism') {
      if (!s.rings.length || s.rings[0].length < 3 || s.z1 <= s.z0) continue;
      const geo = new THREE.ExtrudeGeometry(shapeOf(s.rings), { depth: (s.z1 - s.z0) / 1000, bevelEnabled: false });
      const m = new THREE.Mesh(geo, mats(s.col));
      m.rotation.x = -Math.PI / 2; m.position.y = s.z0 / 1000;
      g.add(m);
      if (style !== 'wire') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat(s.col)); e.rotation.x = -Math.PI / 2; e.position.y = s.z0 / 1000; g.add(e); }
    } else if (s.k === 'cyl') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r / 1000, s.r / 1000, (s.z1 - s.z0) / 1000, 28), mats(s.col));
      m.position.copy(V(s.c[0], s.c[1], (s.z0 + s.z1) / 2));
      g.add(m);
    } else if (s.k === 'line') {
      const geo = new THREE.BufferGeometry().setFromPoints(s.pts.map((p) => V(...p)));
      g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(s.col) })));
    }
  }
  last = { n: Math.min(n, MAX_SOLIDS), capped: solids.length > MAX_SOLIDS };
  return g;
}

function extentOf(solids) {
  const b = new THREE.Box3();
  const add = (x, y, z) => b.expandByPoint(V(x, y, z));
  for (const s of solids) {
    if (s.k === 'pipe') { add(...s.a); add(...s.b); }
    else if (s.k === 'prism') { for (const p of s.rings[0]) { add(p[0], p[1], s.z0); add(p[0], p[1], s.z1); } }
    else if (s.k === 'cyl') { add(s.c[0] - s.r, s.c[1] - s.r, s.z0); add(s.c[0] + s.r, s.c[1] + s.r, s.z1); }
    else if (s.k === 'line') for (const p of s.pts) add(...p);
  }
  return b;
}

function lights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(30, 60, 20); scene.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-40, 30, -30); scene.add(d2);
}

function frame() {
  if (box.isEmpty()) { camera.position.set(8, 8, 8); controls.target.set(0, 0, 0); controls.update(); return; }
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
  controls.target.copy(c);
  const dist = r / Math.sin((camera.fov * Math.PI / 180) / 2) * 0.95;
  camera.near = Math.max(dist / 1000, 0.01); camera.far = dist * 40; camera.updateProjectionMatrix();
  return { c, dist };
}

function setView(name) {
  const f = frame(); if (!f) return;
  const { c, dist } = f;
  const dirs = { iso: [1, 0.8, 1], top: [0, 1, 0.0001], front: [0, 0.0001, 1], right: [1, 0.0001, 0] };
  const d = new THREE.Vector3(...(dirs[name] || dirs.iso)).normalize();
  camera.position.copy(c).addScaledVector(d, dist);
  camera.up.set(0, 1, 0); if (name === 'top') camera.up.set(0, 0, -1);
  controls.update(); render();
}

function render() { if (renderer) renderer.render(scene, camera); }
function loop() { raf = requestAnimationFrame(loop); controls.update(); render(); }

function size() {
  if (!renderer) return;
  const r = canvas.parentElement.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); render();
}

function build(solids) {
  if (root) { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  box = extentOf(solids);
  const ext = box.isEmpty() ? 10 : box.getSize(new THREE.Vector3()).length();
  root = buildSolids(solids, Math.max(ext / 900, 0.004));
  scene.add(root);
  if (grid) scene.remove(grid);
  const sz = Math.max(10, Math.ceil(ext * 1.5));
  grid = new THREE.GridHelper(sz, Math.min(100, sz), new THREE.Color(css('--grid-major')), new THREE.Color(css('--grid-minor')));
  const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  grid.position.set(c.x, box.isEmpty() ? 0 : Math.min(box.min.y, 0), c.z);
  scene.add(grid);
}

const Scene3D = {
  ready: true,
  /* Affiche (ou met à jour) la vue 3D dans le canevas donné. Renvoie des informations d'état pour l'interface. */
  show(cv, solids, opts = {}) {
    canvas = cv;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.08;
      lights();
      ro = new ResizeObserver(size); ro.observe(canvas.parentElement);
    }
    if (opts.style) style = opts.style;
    scene.background = new THREE.Color(css('--vp'));
    build(solids);
    size(); setView('iso');
    if (!raf) loop();
    return { count: last.n, capped: last.capped, max: MAX_SOLIDS };
  },
  hide() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
  resume() { if (renderer && !raf) { loop(); size(); } },
  view: setView,
  setStyle(st, solids) { style = st; if (renderer) { build(solids); render(); } },
  /* Export GLB (binaire glTF 2.0) de la scène courante : même géométrie que l'affichage. */
  async exportGLB() {
    if (!root) throw new Error('Aucune scène 3D à exporter.');
    const ex = new GLTFExporter();
    const tmp = new THREE.Scene(); tmp.add(root.clone(true));
    return new Promise((res, rej) => ex.parse(tmp, (buf) => res(buf), (e) => rej(e), { binary: true }));
  },
  stats() { return { objects: root ? root.children.length : 0, ...last }; },
  screenshot() { render(); return canvas.toDataURL('image/png'); },
};
window.Scene3D = Scene3D;
window.dispatchEvent(new Event('scene3d-ready'));
