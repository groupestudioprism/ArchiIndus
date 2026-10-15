/* ============ Sections : profilés acier laminés (catalogues normalisés) et sections paramétriques ============
   Profilés I et U : dimensions et caractéristiques des catalogues de profilés laminés à chaud (série européenne :
   IPE, HEA, HEB selon EN 10365 / Euronorm 19-57 et 53-62 ; UPN). Valeurs tabulées en cm, cm², cm⁴, cm³, kg/m.
     h, b, tw, tf, r (mm) · A (cm²) · m (kg/m) · Iy, Iz (cm⁴, axe fort / faible) · Wy (cm³, module élastique axe fort)
   Sections paramétriques calculées : tube rond (CHS), tube rectangulaire (RHS, angles vifs : légère surestimation),
   rectangle plein (béton, bois), rond plein. Les caractéristiques sont recalculées en mm (A mm², I mm⁴, W mm³). */
const PROFILES = {};
function PR(id, fam, h, b, tw, tf, r, A, m, Iy, Wy, Iz) { PROFILES[id] = { id, fam, h, b, tw, tf, r, A, m, Iy, Wy, Iz }; }
// IPE
PR('IPE 100', 'IPE', 100, 55, 4.1, 5.7, 7, 10.3, 8.1, 171.0, 34.2, 15.92);
PR('IPE 120', 'IPE', 120, 64, 4.4, 6.3, 7, 13.2, 10.4, 317.8, 52.96, 27.67);
PR('IPE 140', 'IPE', 140, 73, 4.7, 6.9, 7, 16.4, 12.9, 541.2, 77.32, 44.92);
PR('IPE 160', 'IPE', 160, 82, 5.0, 7.4, 9, 20.1, 15.8, 869.3, 108.7, 68.31);
PR('IPE 180', 'IPE', 180, 91, 5.3, 8.0, 9, 23.9, 18.8, 1317, 146.3, 100.9);
PR('IPE 200', 'IPE', 200, 100, 5.6, 8.5, 12, 28.5, 22.4, 1943, 194.3, 142.4);
PR('IPE 220', 'IPE', 220, 110, 5.9, 9.2, 12, 33.4, 26.2, 2772, 252.0, 204.9);
PR('IPE 240', 'IPE', 240, 120, 6.2, 9.8, 15, 39.1, 30.7, 3892, 324.3, 283.6);
PR('IPE 270', 'IPE', 270, 135, 6.6, 10.2, 15, 45.9, 36.1, 5790, 428.9, 419.9);
PR('IPE 300', 'IPE', 300, 150, 7.1, 10.7, 15, 53.8, 42.2, 8356, 557.1, 603.8);
PR('IPE 330', 'IPE', 330, 160, 7.5, 11.5, 18, 62.6, 49.1, 11770, 713.1, 788.1);
PR('IPE 360', 'IPE', 360, 170, 8.0, 12.7, 18, 72.7, 57.1, 16270, 903.6, 1043);
PR('IPE 400', 'IPE', 400, 180, 8.6, 13.5, 21, 84.5, 66.3, 23130, 1156, 1318);
// HEA
PR('HEA 160', 'HEA', 152, 160, 6.0, 9.0, 15, 38.8, 30.4, 1673, 220.1, 615.6);
PR('HEA 200', 'HEA', 190, 200, 6.5, 10.0, 18, 53.8, 42.3, 3692, 388.6, 1336);
PR('HEA 240', 'HEA', 230, 240, 7.5, 12.0, 21, 76.8, 60.3, 7763, 675.1, 2769);
// HEB
PR('HEB 160', 'HEB', 160, 160, 8.0, 13.0, 15, 54.3, 42.6, 2492, 311.5, 889.2);
PR('HEB 200', 'HEB', 200, 200, 9.0, 15.0, 18, 78.1, 61.3, 5696, 569.6, 2003);
PR('HEB 240', 'HEB', 240, 240, 10.0, 17.0, 21, 106.0, 83.2, 11260, 938.3, 3923);
// UPN
PR('UPN 160', 'UPN', 160, 65, 7.5, 10.5, 10.5, 24.0, 18.8, 925.0, 116.0, 85.3);

const Sections = (() => {
  /* Profil désigné dans un texte libre (« IPE 200 », « ipe200 », « HEA200 »). */
  function find(txt) {
    const m = /\b(IPE|HEA|HEB|UPN)\s*(\d{2,3})\b/i.exec(String(txt || ''));
    return m ? PROFILES[`${m[1].toUpperCase()} ${m[2]}`] || null : null;
  }
  /* Caractéristiques en mm d'une section : {kind, A, Iy, Iz, Wy, h, b, m (kg/m pour l'acier), label} */
  function props(sec, rho = 7850) {
    if (!sec) return null;
    if (sec.kind === 'prof') { const p = PROFILES[sec.id]; if (!p) return null; return { kind: 'prof', label: p.id, h: p.h, b: p.b, A: p.A * 100, Iy: p.Iy * 1e4, Iz: p.Iz * 1e4, Wy: p.Wy * 1e3, m: p.m, tab: true }; }
    if (sec.kind === 'chs') { const D = sec.D, d = D - 2 * sec.t, A = Math.PI / 4 * (D * D - d * d), I = Math.PI / 64 * (D ** 4 - d ** 4); return { kind: 'chs', label: `Tube Ø${D}×${sec.t}`, h: D, b: D, A, Iy: I, Iz: I, Wy: I / (D / 2), m: A * 1e-6 * rho }; }
    if (sec.kind === 'rhs') { const { h, b, t } = sec, A = b * h - (b - 2 * t) * (h - 2 * t), Iy = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12, Iz = (h * b ** 3 - (h - 2 * t) * (b - 2 * t) ** 3) / 12; return { kind: 'rhs', label: `Tube ${h}×${b}×${t}`, h, b, A, Iy, Iz, Wy: Iy / (h / 2), m: A * 1e-6 * rho }; }
    if (sec.kind === 'rect') { const { h, b } = sec, A = b * h, Iy = b * h ** 3 / 12, Iz = h * b ** 3 / 12; return { kind: 'rect', label: `Section ${b}×${h}`, h, b, A, Iy, Iz, Wy: Iy / (h / 2), m: A * 1e-6 * rho }; }
    if (sec.kind === 'round') { const D = sec.D, A = Math.PI * D * D / 4, I = Math.PI * D ** 4 / 64; return { kind: 'round', label: `Rond Ø${D}`, h: D, b: D, A, Iy: I, Iz: I, Wy: I / (D / 2), m: A * 1e-6 * rho }; }
    return null;
  }
  /* Inertie géométrique d'un I sans congés (contrôle des valeurs tabulées : la valeur tabulée doit être un peu supérieure). */
  const iGeom = (p) => (p.b * p.h ** 3 - (p.b - p.tw) * (p.h - 2 * p.tf) ** 3) / 12;
  /* Contour d'un profilé (mm, centré, axe fort horizontal) : I ou U, sans congés ; rectangle ; cercle (polygone 32 côtés). */
  function outline(sec) {
    if (sec.kind === 'prof') {
      const p = PROFILES[sec.id]; if (!p) return null;
      const h = p.h / 2, b = p.b / 2, w = p.tw / 2, f = p.tf;
      if (p.fam === 'UPN') return { outer: [[-b, -h], [b, -h], [b, -h + f], [-b + p.tw, -h + f], [-b + p.tw, h - f], [b, h - f], [b, h], [-b, h]], holes: [] };
      return { outer: [[-b, -h], [b, -h], [b, -h + f], [w, -h + f], [w, h - f], [b, h - f], [b, h], [-b, h], [-b, h - f], [-w, h - f], [-w, -h + f], [-b, -h + f]], holes: [] };
    }
    const circ = (r, n = 32) => Array.from({ length: n }, (_, i) => [r * Math.cos(i * 2 * Math.PI / n), r * Math.sin(i * 2 * Math.PI / n)]);
    if (sec.kind === 'chs') return { outer: circ(sec.D / 2), holes: [circ(sec.D / 2 - sec.t).reverse()] };
    if (sec.kind === 'round') return { outer: circ(sec.D / 2), holes: [] };
    const rect = (b, h) => [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];
    if (sec.kind === 'rhs') return { outer: rect(sec.b, sec.h), holes: [rect(sec.b - 2 * sec.t, sec.h - 2 * sec.t).reverse()] };
    if (sec.kind === 'rect') return { outer: rect(sec.b, sec.h), holes: [] };
    return null;
  }
  const list = () => Object.keys(PROFILES);
  return { find, props, iGeom, outline, list };
})();
