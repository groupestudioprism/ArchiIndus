/* Point d'entrée. Le compte Studio Prism, le cloud et l'accueil sont gérés par le module commun aux apps du studio
   (src/js/auth.js, cloud.js, auth-end.js, repris d'ARCHIPLAN) : il affiche la connexion, le code PIN, l'accueil « Mes projets »,
   puis ouvre un projet dans le dessin par le pont window.APModel ci-dessous. */
document.addEventListener('DOMContentLoaded', () => {
  Tools.init();
  UI.init();
  Canvas2D.init();
  Cad.init();
  if (Doc.get().objects.length) Canvas2D.zoomExtents();

  /* Toute modification du document est signalée au cloud (enregistrement automatique du projet ouvert). */
  let quiet = false;
  Doc.on((reason) => { if (reason === 'change' && !quiet) window.dispatchEvent(new Event('ap:changed')); });

  const valid = (s) => { try { Doc.sanitize(typeof s === 'string' ? JSON.parse(s) : s); return true; } catch (e) { return false; } };
  const blank = (name) => ({ ...Doc.fresh(), name: String(name || 'Nouveau projet').slice(0, 80) });

  window.APModel = {
    get: () => JSON.stringify(Doc.get()),
    name: () => Doc.get().name,
    valid,
    blankJSON: (name) => JSON.stringify(blank(name)),
    sample: () => Sample.project(),
    /* Ouvre un projet (cloud, partagé, importé ou exemple) : document validé, historique vidé (un « annuler » ne peut pas
       écrire l'ancien projet dans le nouveau). Un contenu illisible donne un projet vide, sans toucher au cloud. */
    load(s) {
      let data;
      try { data = Doc.sanitize(s); } catch (e) { data = blank(s && s.name); }
      if (s && typeof s.name === 'string' && s.name.trim()) data.name = s.name.trim().slice(0, 80);
      quiet = true;
      try {
        if (state.sketch) state.sketch = 0;
        state.treeSel = null; state.compSel = 0;
        Tools.selection.clear();
        Doc.load(data);
        Canvas2D.zoomExtents();
        Workbench.refresh();
      } finally { quiet = false; }
    },
    /* Miniature de l'accueil : plan 2D, ou vue 3D si elle est affichée. */
    thumb() {
      try {
        const src = View3D.isOn() && window.Scene3D ? document.getElementById('cv3d') : document.getElementById('cv');
        if (View3D.isOn() && window.Scene3D) window.Scene3D.render(); else Canvas2D.draw();
        if (!src.width || !src.height) return '';
        const c = document.createElement('canvas'); c.width = 320; c.height = Math.max(120, Math.round(320 * src.height / src.width));
        const g = c.getContext('2d'); g.fillStyle = '#F2F7FA'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.72);
      } catch (e) { return ''; }
    },
    setUserLib() {},
  };
  window.dispatchEvent(new Event('ap:ready'));
  window.__apReady = true;
  /* intro : s'efface dès que l'application est prête (au plus tôt après le tracé du mot, sauf « réduire les animations ») */
  const sp = document.getElementById('splash');
  if (sp) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { sp.classList.add('done'); setTimeout(() => sp.remove(), 600); }, Math.max(reduce ? 200 : 0, (reduce ? 400 : 1800) - performance.now()));
  }
});
