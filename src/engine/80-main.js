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

/* ---------- bouton Réglages (module commun Studio Prism) ---------- */
(() => {
  const redraw = () => { Canvas2D.requestDraw(); };
  const snapRefresh = () => { const b = document.getElementById('snapBtn'); if (b) b.setAttribute('aria-pressed', String(state.snap.on)); const o = document.getElementById('orthoBtn'); if (o) o.setAttribute('aria-pressed', String(state.snap.ortho)); redraw(); };
  PrismSettings.init({
    app: 'ARCHIINDUS',
    theme: { get: () => document.documentElement.dataset.theme || 'light', set: (t) => { Theme.set(t === 'dark'); Canvas2D.draw(); if (View3D.isOn()) View3D.refresh(); } },
    scaleSel: '#top, #ribbon, #tree, #panel, #status, .menu, #skBar',
    onResize: () => window.dispatchEvent(new Event('resize')),
    sections: [
      { title: 'Affichage du dessin', fields: [
        { type: 'seg', label: 'Qualité d\'affichage', sub: 'Économie : dessin moins fin mais plus fluide sur tablette', options: [['auto', 'Auto'], ['eco', 'Économie'], ['std', 'Équilibrée'], ['high', 'Élevée']], get: () => AI_PREFS.gfx, set: (v) => { AI_PREFS.gfx = v; saveAiPrefs(); window.dispatchEvent(new Event('resize')); redraw(); } }] },
      { title: 'Grille et aimantation de base', fields: [
        { type: 'select', label: 'Pas de base de la grille', sub: 'La grille s\'élargit (×10) quand on dézoome', options: [[1, '1 mm'], [5, '5 mm'], [10, '10 mm'], [50, '50 mm'], [100, '100 mm'], [500, '500 mm'], [1000, '1 m']], get: () => AI_PREFS.base, set: (v) => { AI_PREFS.base = +v; saveAiPrefs(); redraw(); } },
        { type: 'switch', label: 'Afficher la grille', get: () => AI_PREFS.grid, set: (v) => { AI_PREFS.grid = v; saveAiPrefs(); redraw(); } },
        { type: 'switch', label: 'Aimantation (objets et grille) à l\'ouverture', sub: 'F3 l\'active ou la coupe pendant le travail', get: () => AI_PREFS.snap, set: (v) => { AI_PREFS.snap = v; saveAiPrefs(); state.snap.on = v; snapRefresh(); } },
        { type: 'switch', label: 'Ortho à l\'ouverture', sub: 'F8 pendant le travail', get: () => AI_PREFS.ortho, set: (v) => { AI_PREFS.ortho = v; saveAiPrefs(); state.snap.ortho = v; snapRefresh(); } }] },
      { title: 'Cotes', fields: [
        { type: 'seg', label: 'Unité', options: [['mm', 'mm'], ['cm', 'cm'], ['m', 'm']], get: () => AI_PREFS.dimUnit, set: (v) => { AI_PREFS.dimUnit = v; AI_PREFS.dimDec = v === 'm' ? 2 : v === 'cm' ? 1 : 0; saveAiPrefs(); redraw(); } },
        { type: 'seg', label: 'Décimales', options: [[0, '0'], [1, '1'], [2, '2'], [3, '3']], get: () => AI_PREFS.dimDec, set: (v) => { AI_PREFS.dimDec = v; saveAiPrefs(); redraw(); } }] }],
    shortcuts: () => { const seen = new Set(); return [...document.querySelectorAll('#app [title]')].map((b) => { const m = b.title.match(/^([^(]*?)\s*\(((?:F\d+|Ctrl\+\w+|Maj\+\w+|\w{1,3}))\)/); return m && !seen.has(m[2]) && seen.add(m[2]) ? [m[2], m[1].replace(/\s*:\s*$/, '')] : null; }).filter(Boolean).slice(0, 40); },
  });
})();
