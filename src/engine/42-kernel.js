/* Pont avec le noyau géométrique (OpenCascade dans un Web Worker, src/kernel/worker.js inséré par tools/build.py).
   Chargé à la demande (première fonction 3D, mode 3D ou export STEP) : environ 7 Mo compressés, mis en cache par le navigateur.
   Emplacements essayés dans l'ordre : copie publiée avec l'app (kernel/vendor/), puis le CDN jsDelivr (mêmes versions).
   Sans noyau (hors ligne, navigateur trop ancien), l'app garde l'affichage approché (extrusions et révolutions sans booléens). */
const Kernel = (() => {
  const VER = { rep: '1.1.0', oc: '1.1.0' };
  let worker = null, ready = null, seq = 0, status = 'off', info = '', last = null, lastKey = '', pending = null, again = false, busy = false;
  const calls = new Map(), subs = [];
  const emit = () => subs.forEach((f) => { try { f(status); } catch (e) { /* abonné défaillant */ } });

  function bases() {
    const cfg = window.AI_KERNEL || {};
    const out = [];
    try {
      if (location.protocol.startsWith('http')) {
        const v = new URL(cfg.vendor || 'kernel/vendor/', location.href).href;
        out.push({ label: 'app', rep: v + 'replicad/', oc: v + 'occt/' });
      }
    } catch (e) { /* adresse locale */ }
    out.push({ label: 'cdn', rep: `https://cdn.jsdelivr.net/npm/replicad@${VER.rep}/dist/`, oc: `https://cdn.jsdelivr.net/npm/replicad-opencascadejs@${VER.oc}/dist/` });
    return out;
  }

  function call(op, data = {}, transfer = []) {
    if (!worker) return Promise.reject(new Error('noyau non démarré'));
    const id = ++seq;
    return new Promise((res, rej) => { calls.set(id, { res, rej }); worker.postMessage({ id, op, ...data }, transfer); });
  }

  /* Démarre le noyau (une seule fois). Résout true si prêt, false sinon (l'app continue sans lui). */
  function start() {
    if (ready) return ready;
    const cfg = window.AI_KERNEL;
    if (!cfg || !cfg.src || typeof Worker === 'undefined') { status = 'error'; info = 'noyau absent de cette version'; emit(); return (ready = Promise.resolve(false)); }
    status = 'loading'; emit();
    ready = (async () => {
      try {
        const url = URL.createObjectURL(new Blob([cfg.src], { type: 'text/javascript' }));
        worker = new Worker(url, { type: 'module', name: 'noyau-archiindus' });
        worker.onmessage = (ev) => { const m = ev.data, c = calls.get(m.id); if (!c) return; calls.delete(m.id); if (m.ok) c.res(m); else c.rej(new Error(m.error)); };
        worker.onerror = (e) => { status = 'error'; info = e.message || 'erreur du noyau'; emit(); };
        const r = await Promise.race([call('init', { bases: bases() }), new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), 90000))]);
        status = 'ready'; info = r.from; emit();
        return true;
      } catch (e) {
        status = 'error'; info = e.message || String(e); emit();
        return false;
      }
    })();
    return ready;
  }

  /* Volumes « extra » : composants d'assemblage et éléments du plan (réseaux, murs, poutres), pour interférences et STEP. */
  function extras(d) {
    const out = [];
    if (d.comps && d.comps.length) {
      const R = Model.resolve(d.comps);
      for (const c of d.comps) {
        const l = Doc.layer(c.layer); if (!l || !l.visible) continue;
        Model.compSolids(c, R.pos.get(c.id), '').forEach((s, i) => out.push({ key: `c${c.id}.${i}`, grp: 'c' + c.id, name: c.name, mat: c.mat, desc: s }));
      }
    }
    for (const s of View3D.planSolids()) out.push({ key: `o${s.oid}.${s.i}`, grp: 'o' + s.oid, name: s.name, mat: s.mat, desc: s });
    return out;
  }

  /* Reconstruit si l'arbre a changé. Les demandes rapprochées sont regroupées : seule la dernière version est calculée. */
  async function update(opts = {}) {
    const d = Doc.get();
    const features = Model.kernelInput(d);
    const extra = opts.extra ? extras(d) : [];
    const key = JSON.stringify([features, opts.extra ? extra.map((x) => x.desc) : 0]);
    if (key === lastKey && last) return last;
    if (!(await start())) return null;
    if (busy) { again = true; pending = opts; return null; }
    busy = true;
    try {
      const r = await call('build', { features, extra });
      lastKey = key; last = { bodies: r.bodies, errors: r.errors, ms: r.ms, withExtra: !!opts.extra };
      return last;
    } catch (e) { info = e.message; last = null; lastKey = ''; return null; }
    finally {
      busy = false;
      emit();
      if (again) { again = false; const o = pending; pending = null; update(o || {}); }
    }
  }

  return {
    on: (f) => { subs.push(f); },
    status: () => status,
    info: () => info,
    start,
    update,
    result: () => last,
    body: (key) => (last ? last.bodies.find((b) => b.key === key) : null),
    bodyOfFeature: (fid) => (last ? last.bodies.find((b) => b.fids.includes(fid)) : null),
    errorOf: (fid) => (last ? (last.errors.find((e) => e.fid === fid) || {}).msg || '' : ''),
    needsKernel: (d) => (d.features || []).some((f) => !f.hide && f.type !== 'extrude' && !(f.type === 'revolve' && f.op !== 'cut')) || (d.features || []).length > 0,
    async exportFile(format, withExtra) {
      if (!(await start())) throw new Error('noyau géométrique indisponible (connexion nécessaire au premier chargement)');
      await update({ extra: withExtra });
      const r = await call('export', { format, withExtra });
      return new Uint8Array(r.buf);
    },
    async interferences(clear = 0) {
      if (!(await start())) throw new Error('noyau géométrique indisponible');
      await update({ extra: true });
      return call('interf', { clear });
    },
    async views(key, list) {
      if (!(await start())) throw new Error('noyau géométrique indisponible');
      await update();
      return (await call('views', { key, views: list })).views;
    },
  };
})();
