/* ============ Site réel du projet (même système qu'ARCHITRAFFIC) : adresse, relief NGF, bâtiments, voirie ============
   Sources publiques et libres, chargées pour la seule zone du projet (France) :
   - Géoplateforme IGN (data.geopf.fr) : géocodage, altitudes RGE ALTI® en NGF-IGN69, bâtiments BD TOPO® (hauteurs). Licence Ouverte Etalab 2.0.
   - OpenStreetMap (Overpass) : voirie, bâtiments en repli, eau. ODbL.
   Repère : l'origine du projet (0, 0) est le point d'adresse, x vers l'est, y vers le nord ; la cote 0 du projet est l'altitude NGF du
   terrain au point d'adresse. Le site est un décor de contexte en 3D (lecture seule) : il n'entre ni dans la nomenclature ni dans les exports 2D.
   Les données sont mises en cache sur l'appareil 30 jours (IndexedDB). Code repris d'ARCHITRAFFIC (src/engine/10-geo.js), simplifié. */
const Site = (() => {
  const GEO_SEARCH = 'https://data.geopf.fr/geocodage/search';
  const GEO_ALTI = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
  const WMS_R = 'https://data.geopf.fr/wms-r', WFS_URL = 'https://data.geopf.fr/wfs/ows';
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const DATA_VER = 1, SIZES = [500, 1000, 1600];
  let data = null, show = true, token = 0, status = '', lastErr = '';

  async function fetchJSON(url, ms = 15000, opt = {}) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { ...opt, signal: c.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function search(q) {
    const j = await fetchJSON(`${GEO_SEARCH}?${new URLSearchParams({ q, limit: '7' })}`);
    return (j.features || []).map((f) => { const p = f.properties || {}, [lon, lat] = (f.geometry && f.geometry.coordinates) || []; return { label: p.label || p.name || q, lon, lat, context: p.context || '' }; })
      .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat));
  }
  /* projection locale équirectangulaire autour de l'origine (< 1 cm d'écart sur 1 km) */
  function proj(lat0, lon0) { const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540; return { lat0, lon0, toXY: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * ky], toLL: (x, y) => [lon0 + x / kx, lat0 + y / ky] }; }
  const bounds = (P, size) => { const h = size / 2, [w, s] = P.toLL(-h, -h), [e, n] = P.toLL(h, h); return { w, s, e, n }; };
  async function elevBIL(B, N) {
    const p = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES', STYLES: '', CRS: 'EPSG:4326', BBOX: `${B.s},${B.w},${B.n},${B.e}`, WIDTH: String(N), HEIGHT: String(N), FORMAT: 'image/x-bil;bits=32' });
    const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
    try {
      const r = await fetch(`${WMS_R}?${p}`, { signal: c.signal }); if (!r.ok) throw new Error('bil ' + r.status);
      const buf = await r.arrayBuffer(); if (buf.byteLength !== N * N * 4) throw new Error('bil size');
      const dv = new DataView(buf), z = new Float32Array(N * N); let ok = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = dv.getFloat32(((N - 1 - j) * N + i) * 4, true); const g = v > -500 && v < 6000; z[j * N + i] = g ? v : NaN; if (g) ok++; }
      if (ok < N * N * 0.5) throw new Error('bil nodata');
      return z;
    } finally { clearTimeout(t); }
  }
  async function elevREST(P, size, N) {
    const pts = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push(P.toLL(-size / 2 + size * i / (N - 1), -size / 2 + size * j / (N - 1)));
    const z = new Float32Array(pts.length), B = 150;
    for (let k = 0; k < pts.length; k += B) {
      const ch = pts.slice(k, k + B);
      const j = await fetchJSON(`${GEO_ALTI}?${new URLSearchParams({ lon: ch.map((p) => p[0].toFixed(6)).join('|'), lat: ch.map((p) => p[1].toFixed(6)).join('|'), resource: 'ign_rge_alti_wld', delimiter: '|', zonly: 'true', indent: 'false' })}`);
      (j.elevations || []).forEach((v, i) => { const e = typeof v === 'number' ? v : v && v.z; z[k + i] = e == null || e < -900 ? NaN : e; });
    }
    return z;
  }
  function fillNaN(z, N) {
    const ok = [...z].filter(Number.isFinite).sort((a, b) => a - b), med = ok.length ? ok[ok.length >> 1] : 0;
    for (let k = 0; k < z.length; k++) if (!Number.isFinite(z[k])) z[k] = med;
    return z;
  }
  async function overpass(q) {
    let err;
    for (const url of OVERPASS) {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 60000);
      try { const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: c.signal }); if (!r.ok) throw new Error('overpass ' + r.status); return await r.json(); }
      catch (e) { err = e; } finally { clearTimeout(t); }
    }
    throw err || new Error('overpass');
  }
  async function bdtopo(B) {
    const p = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:batiment', OUTPUTFORMAT: 'application/json', COUNT: '5000', PROPERTYNAME: 'geometrie,hauteur,nombre_d_etages,usage_1', BBOX: `${B.s},${B.w},${B.n},${B.e},urn:ogc:def:crs:EPSG::4326` });
    return (await fetchJSON(`${WFS_URL}?${p}`, 45000)).features || [];
  }
  const ringArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
  /* du brut au « monde » : bâtiments (BD TOPO, sinon OSM), voirie, eau */
  function parse(raw, P, size) {
    const W = { bld: [], roads: [], water: [] }, half = size / 2 + 40;
    const inside = (q) => Math.abs(q[0]) < half && Math.abs(q[1]) < half;
    for (const e of (raw.osm && raw.osm.elements) || []) {
      if (e.type !== 'way' || !e.geometry) continue;
      const pts = e.geometry.map((g) => P.toXY(g.lon, g.lat)), T = e.tags || {};
      if (pts.length < 2) continue;
      if (T.highway && !/^(proposed|construction|abandoned)$/.test(T.highway)) {
        const foot = /^(footway|path|cycleway|steps|pedestrian|track|bridleway)$/.test(T.highway);
        const w = parseFloat(T.width) > 1.5 ? parseFloat(T.width) : foot ? 2 : /^(motorway|trunk|primary)$/.test(T.highway) ? 9 : /^(service|living_street)$/.test(T.highway) ? 4 : 6.5;
        W.roads.push({ pts, w, foot, name: T.name || '' });
      } else if (T.building && !(raw.bdt && raw.bdt.length) && pts.length >= 4) {
        const p = pts.slice(0, -1); if (Math.abs(ringArea(p)) > 3 && inside(p[0])) W.bld.push({ p, h: parseFloat(T.height) > 0 ? parseFloat(T.height) : +T['building:levels'] > 0 ? T['building:levels'] * 3 + 1 : 6 });
      } else if (T.natural === 'water' && pts.length >= 4) W.water.push({ p: pts.slice(0, -1) });
    }
    for (const f of raw.bdt || []) {
      const g = f.geometry, Pp = f.properties || {}; if (!g) continue;
      const rings = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const r of rings) {
        const swap = Math.abs(r[0][0][0] - P.lon0) + Math.abs(r[0][0][1] - P.lat0) > Math.abs(r[0][0][1] - P.lon0) + Math.abs(r[0][0][0] - P.lat0);
        const p = r[0].map((c) => (swap ? P.toXY(c[1], c[0]) : P.toXY(c[0], c[1]))).slice(0, -1);
        if (p.length < 3 || Math.abs(ringArea(p)) < 3 || !inside(p[0])) continue;
        const h = +Pp.hauteur > 0 ? Math.min(+Pp.hauteur, 250) : +Pp.nombre_d_etages > 0 ? Pp.nombre_d_etages * 3 + 0.8 : 6;
        W.bld.push({ p, h, use: String(Pp.usage_1 || '') });
      }
    }
    return W;
  }
  /* cache IndexedDB (30 jours) */
  const IDB = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { try { const r = indexedDB.open('archiindus-site', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
    async get(k) { try { const db = await this.open(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { /* cache facultatif */ } },
  };
  /* altitude du terrain (m, relative à l'origine) au point (x, y) en mètres */
  function H(x, y) {
    if (!data) return 0;
    const E = data.elev, N = E.N, S = data.size, st = S / (N - 1);
    let fi = (x + S / 2) / st, fj = (y + S / 2) / st; fi = clamp(fi, 0, N - 1.0001); fj = clamp(fj, 0, N - 1.0001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, z = (a, b) => E.z[b * N + a];
    return ((z(i, j) * (1 - u) + z(i + 1, j) * u) * (1 - v) + (z(i, j + 1) * (1 - u) + z(i + 1, j + 1) * u) * v) - data.z0;
  }
  async function load(force = false) {
    const s = Doc.get().site;
    if (!s) { data = null; status = ''; if (window.Scene3D && Scene3D.setSite) Scene3D.setSite(null); return; }
    const tok = ++token, size = s.size || 500, P = proj(s.lat, s.lon), key = `site|${DATA_VER}|${s.lat.toFixed(5)}|${s.lon.toFixed(5)}|${size}`;
    let raw = force ? null : await IDB.get(key);
    if (raw && Date.now() - raw.at > 30 * 864e5) raw = null;
    try {
      if (!raw) {
        status = 'loading'; Status.msg('Chargement du site : relief (IGN RGE ALTI®), bâtiments (IGN BD TOPO®), voirie (OpenStreetMap)…', 20000);
        const B = bounds(P, size + 80), bb = `(${B.s},${B.w},${B.n},${B.e})`;
        raw = { at: Date.now(), src: {} };
        const osmP = overpass(`[out:json][timeout:50];(way["highway"]${bb};way["building"]${bb};way["natural"="water"]${bb};);out body geom qt;`).then((j) => { raw.osm = j; raw.src.osm = 'OpenStreetMap'; }).catch(() => { raw.osm = { elements: [] }; });
        const bdtP = bdtopo(bounds(P, size + 40)).then((f) => { raw.bdt = f; }).catch(() => { raw.bdt = []; });
        const N = clamp(Math.round(size / 6) + 1, 61, 161);
        let z, n = N;
        try { z = await elevBIL(bounds(P, size), N); raw.src.elev = 'IGN RGE ALTI® (WMS)'; }
        catch (e) { n = 41; z = await elevREST(P, size, n); raw.src.elev = 'IGN RGE ALTI® (calcul altimétrique)'; }
        raw.elev = { N: n, z: Array.from(fillNaN(z, n), (v) => Math.round(v * 100) / 100) };
        await Promise.all([osmP, bdtP]);
        if (tok !== token) return;
        IDB.set(key, raw);
      }
      const z = Float32Array.from(raw.elev.z), N = raw.elev.N, mid = Math.floor(N / 2);
      data = { size, P, z0: z[mid * N + mid], elev: { N, z }, W: parse(raw, P, size), src: { ...raw.src, bld: raw.bdt && raw.bdt.length ? 'IGN BD TOPO®' : 'OpenStreetMap', at: raw.at } };
      status = 'ok';
      if (window.Scene3D && Scene3D.setSite) Scene3D.setSite(show ? data : null);
      Status.msg(`Site chargé : ${data.W.bld.length} bâtiments, ${data.W.roads.length} voies, altitude NGF ${data.z0.toFixed(2)} m au point d'origine.`, 7000);
      Workbench.renderTree();
    } catch (e) {
      status = 'error'; lastErr = String(e && e.message || e);
      if (tok === token) Status.msg('Impossible de charger le site : vérifiez la connexion, puis « Mettre à jour » (onglet Site).', 9000);
    }
  }
  function dialog() {
    const s = Doc.get().site;
    const q = el('input', { class: 'fld', type: 'search', placeholder: 'Adresse, rue, commune…', value: s ? s.label : '', 'aria-label': 'Adresse du projet', autocomplete: 'off' });
    const res = el('div', { class: 'addr-list', role: 'listbox', 'aria-label': 'Résultats' });
    const size = el('select', { 'aria-label': 'Taille de la zone' }, ...SIZES.map((v) => el('option', { value: v, selected: (s ? s.size : 500) === v }, `${v} × ${v} m${v === 500 ? ' (conseillé)' : ''}`)));
    let pick = s ? { ...s } : null, t = 0;
    const run = async () => {
      const v = q.value.trim(); if (v.length < 3) { res.textContent = ''; return; }
      res.textContent = 'Recherche…';
      try {
        const L = await search(v); res.textContent = '';
        if (!L.length) { res.textContent = 'Aucun résultat : précisez la commune.'; return; }
        for (const r of L) { const b = el('button', { type: 'button', class: 'addr', role: 'option' }, el('b', {}, r.label), el('small', {}, r.context)); b.addEventListener('click', () => { pick = { label: r.label, lat: r.lat, lon: r.lon }; q.value = r.label; res.querySelectorAll('.addr').forEach((x) => x.classList.toggle('on', x === b)); }); res.append(b); }
      } catch (e) { res.textContent = 'Service d\'adresses injoignable : vérifiez la connexion.'; }
    };
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 320); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    const acts = [{ label: 'Charger le site', primary: true, run: () => {
      if (!pick) { Status.msg('Choisissez une adresse dans la liste.', 5000); return false; }
      Doc.mutate((d) => { d.site = { label: pick.label.slice(0, 160), lat: pick.lat, lon: pick.lon, size: +size.value }; });
      show = true; load(false); if (window.Scene3D && !View3D.isOn()) View3D.setMode(true);
    } }];
    if (s) acts.push({ label: 'Retirer le site', run: () => { Doc.mutate((d) => { d.site = null; }); data = null; if (window.Scene3D && Scene3D.setSite) Scene3D.setSite(null); Workbench.renderTree(); } });
    Dlg.open('Lieu du projet', el('div', {}, q, res, el('label', { class: 'lbl' }, 'Zone chargée autour de l\'adresse', size),
      el('p', { class: 'mut small' }, 'Même système qu\'ARCHITRAFFIC : relief en altitudes NGF (IGN RGE ALTI®), bâtiments et hauteurs (IGN BD TOPO®), voirie (OpenStreetMap). L\'origine du projet est placée au point d\'adresse et la cote 0 à l\'altitude du terrain en ce point. Données mises en cache sur cet appareil pendant 30 jours.')), acts);
    setTimeout(() => q.focus(), 40);
  }
  function toggle() {
    if (!data) { Status.msg(Doc.get().site ? 'Site en cours de chargement ou indisponible.' : 'Aucun site : onglet Site → Adresse.'); return; }
    show = !show; if (window.Scene3D && Scene3D.setSite) Scene3D.setSite(show ? data : null);
    Status.msg(show ? 'Site affiché.' : 'Site masqué.');
  }
  const lieu = () => { const s = Doc.get().site; return s ? { latitude: s.lat, longitude: s.lon, altitude: data ? data.z0 : null, adresse: s.label } : null; };
  return { search, load, dialog, toggle, H, lieu, data: () => data, visible: () => show, status: () => status, lastError: () => lastErr };
})();
