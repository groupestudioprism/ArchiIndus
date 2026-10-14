/* Document du projet : calques, objets, historique (annuler / rétablir), enregistrement local, import validé.
   Format : JSON versionné (schemaVersion 1). Toute modification passe par Doc.mutate (point de retour + notification). */
const LAYER_DEFAULTS = [
  { name: 'Fond de plan',   color: '#6B7280', group: 'divers' },
  { name: 'Eau potable',    color: '#0877B9', group: 'humide' },
  { name: 'Eaux usées',     color: '#8B5E34', group: 'humide' },
  { name: 'Eaux pluviales', color: '#169999', group: 'humide' },
  { name: 'Électricité',    color: '#E2861B', group: 'sec' },
  { name: 'Télécoms',       color: '#7C3AED', group: 'sec' },
  { name: 'Structures',     color: '#1B2433', group: 'structure' },
  { name: 'Équipements',    color: '#B3261E', group: 'equipement' },
  { name: 'Cotations',      color: '#4B5563', group: 'divers' },
];
const LAYER_GROUPS = ['humide', 'sec', 'structure', 'equipement', 'divers'];

/* Réseau : attribut optionnel `net` des lignes et polylignes ouvertes ou fermées : {dn (mm), mat, tag}. */
const NET_MATERIALS = ['PVC', 'PEHD', 'Fonte ductile', 'Acier', 'Acier galvanisé', 'Inox', 'Béton', 'Grès', 'Cuivre', 'Câble'];
const NET_DN_MAX = 5000;
function cleanNet(n) {
  if (!n || typeof n !== 'object') return null;
  const dn = Number(n.dn);
  if (!Number.isFinite(dn) || dn <= 0 || dn > NET_DN_MAX) return null;
  const s = (v) => (typeof v === 'string' ? v.trim().slice(0, 30) : '');
  return { dn: Math.round(dn * 10) / 10, mat: s(n.mat), tag: s(n.tag) };
}

/* Cartouche et format de feuille (export PDF). */
const SHEET_FORMATS = { A4: [297, 210], A3: [420, 297] };
const SHEET_DEFAULT = { format: 'A3', client: '', author: '', ref: '', rev: 'A' };
function cleanSheet(s) {
  const t = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  s = s && typeof s === 'object' ? s : {};
  return { format: SHEET_FORMATS[s.format] ? s.format : 'A3', client: t(s.client, 60), author: t(s.author, 60), ref: t(s.ref, 40), rev: t(s.rev, 10) || 'A' };
}

const Doc = (() => {
  const KEY = 'ai.doc.v1';
  const MAX_HISTORY = 100;
  const MAX_OBJECTS = 100000;
  let data = fresh();
  let past = [], future = [];
  let timer = 0;
  let saveState = 'saved'; /* saved | pending | error */
  const subs = [];

  const snap = () => JSON.stringify(data);

  function fresh() {
    const layers = LAYER_DEFAULTS.map((l, i) => ({ id: i + 1, name: l.name, color: l.color, group: l.group, visible: true, locked: false }));
    return { schemaVersion: 1, name: 'Projet sans titre', units: 'mm', layers, objects: [], nextId: 1, nextLayerId: layers.length + 1, active: 1, sheet: { ...SHEET_DEFAULT } };
  }

  function emit(reason) { for (const f of subs) f(reason); }

  function schedule() {
    saveState = 'pending';
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, snap()); saveState = 'saved'; } catch (e) { saveState = 'error'; }
      emit('save');
    }, 500);
  }

  function changed() { schedule(); emit('change'); }

  function checkpoint() {
    past.push(snap());
    if (past.length > MAX_HISTORY) past.shift();
    future = [];
  }

  /* Validation stricte d'un projet (import de fichier ou lecture du stockage local). Lève une Error en français. */
  function sanitize(raw) {
    const bad = (m) => { throw new Error(m); };
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) bad('Fichier non reconnu : projet ArchiIndus (schemaVersion 1) attendu.');
    const num = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e9;
    const pt = (p) => (Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]) ? [p[0], p[1]] : null);
    if (!Array.isArray(raw.layers) || !raw.layers.length || raw.layers.length > 200) bad('Liste de calques invalide.');
    if (!Array.isArray(raw.objects) || raw.objects.length > MAX_OBJECTS) bad('Liste d\'objets invalide ou trop volumineuse.');

    const layers = [];
    const seenL = new Set();
    let maxL = 0;
    for (const l of raw.layers) {
      if (!l || typeof l !== 'object') bad('Calque invalide.');
      const id = Number.isInteger(l.id) && l.id > 0 && !seenL.has(l.id) ? l.id : 0;
      if (id) { seenL.add(id); maxL = Math.max(maxL, id); }
      layers.push({
        id,
        name: (typeof l.name === 'string' ? l.name.trim().slice(0, 60) : '') || 'Calque',
        color: typeof l.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color : '#6B7280',
        group: LAYER_GROUPS.includes(l.group) ? l.group : 'divers',
        visible: l.visible !== false,
        locked: l.locked === true,
      });
    }
    for (const l of layers) if (!l.id) l.id = ++maxL;
    const layerIds = new Set(layers.map((l) => l.id));

    const objects = [];
    const seenO = new Set();
    let maxO = 0;
    raw.objects.forEach((o, i) => {
      const where = `Objet n°${i + 1} invalide`;
      if (!o || typeof o !== 'object') bad(where + '.');
      const out = { type: o.type };
      switch (o.type) {
        case 'line': out.a = pt(o.a); out.b = pt(o.b); if (!out.a || !out.b) bad(where + ' (ligne).'); { const nt = cleanNet(o.net); if (nt) out.net = nt; } break;
        case 'poly':
          if (!Array.isArray(o.pts) || o.pts.length < 2 || o.pts.length > 100000) bad(where + ' (polyligne).');
          out.pts = o.pts.map(pt);
          if (out.pts.some((p) => !p)) bad(where + ' (polyligne).');
          out.closed = o.closed === true;
          { const nt = cleanNet(o.net); if (nt) out.net = nt; }
          break;
        case 'circle': out.c = pt(o.c); out.r = o.r; if (!out.c || !num(out.r) || !(out.r > 0)) bad(where + ' (cercle).'); break;
        case 'dim': out.a = pt(o.a); out.b = pt(o.b); out.off = o.off; out.h = num(o.h) && o.h > 0 ? o.h : 150; if (!out.a || !out.b || !num(out.off)) bad(where + ' (cote).'); break;
        case 'text':
          out.p = pt(o.p); out.text = typeof o.text === 'string' ? o.text.slice(0, 500) : '';
          out.h = num(o.h) && o.h > 0 ? o.h : 200;
          if (!out.p || !out.text) bad(where + ' (texte).');
          break;
        default: bad(where + ` (type « ${String(o.type).slice(0, 20)} » inconnu).`);
      }
      out.layer = layerIds.has(o.layer) ? o.layer : layers[0].id;
      let id = Number.isInteger(o.id) && o.id > 0 && !seenO.has(o.id) ? o.id : 0;
      if (id) { seenO.add(id); maxO = Math.max(maxO, id); }
      out.id = id;
      objects.push(out);
    });
    for (const o of objects) if (!o.id) o.id = ++maxO;

    return {
      schemaVersion: 1,
      name: (typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '') || 'Projet sans titre',
      units: 'mm',
      layers, objects,
      nextId: maxO + 1,
      nextLayerId: maxL + 1,
      active: layerIds.has(raw.active) ? raw.active : layers[0].id,
      sheet: cleanSheet(raw.sheet),
    };
  }

  return {
    get: () => data,
    on: (f) => { subs.push(f); },
    layer: (id) => data.layers.find((l) => l.id === id),
    activeLayer: () => data.layers.find((l) => l.id === data.active),
    saveState: () => saveState,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    sanitize,
    fresh: () => fresh(),

    /* Modifie le document : point de retour, puis fn(data), puis notification et enregistrement différé. */
    mutate(fn) { checkpoint(); fn(data); changed(); },

    /* À appeler dans mutate : ajoute un objet sur le calque actif. */
    add(o) {
      o.id = data.nextId++; o.layer = data.active;
      if (state.net.on && (o.type === 'line' || (o.type === 'poly' && !o.closed))) {
        const nt = cleanNet({ dn: state.net.dn, mat: state.net.mat, tag: '' });
        if (nt) o.net = nt;
      }
      data.objects.push(o);
      return o;
    },

    setActive(id) { if (data.active !== id && Doc.layer(id)) { data.active = id; changed(); } },

    undo() { if (!past.length) return false; future.push(snap()); data = JSON.parse(past.pop()); changed(); return true; },
    redo() { if (!future.length) return false; past.push(snap()); data = JSON.parse(future.pop()); changed(); return true; },

    /* Remplace tout le projet (nouveau / ouvrir) ; annulable. */
    replace(newData) { checkpoint(); data = newData; changed(); },

    /* Remplace tout le projet ET efface l'historique : on ne peut plus revenir au document précédent (utilisé pour les projets cloud,
       afin qu'un « annuler » ne puisse pas écrire un autre document dans le projet cloud qui vient d'être ouvert). */
    load(newData) { past.length = 0; future.length = 0; data = newData; changed(); },
    reset() { Doc.replace(fresh()); },

    /* Lecture du stockage local au démarrage ; retourne true si un projet a été restauré. */
    loadStored() {
      try {
        const s = localStorage.getItem(KEY);
        if (!s) return false;
        data = sanitize(JSON.parse(s));
        saveState = 'saved';
        emit('load');
        return true;
      } catch (e) { return false; }
    },
  };
})();
