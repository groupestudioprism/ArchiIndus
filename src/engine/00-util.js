'use strict';
/* Outils communs : sélection d'éléments, thème clair / sombre. */
const $ = (sel, root = document) => root.querySelector(sel);

const Theme = {
  KEY: 'ai.theme',
  isDark() { return document.documentElement.dataset.theme === 'dark'; },
  set(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem(this.KEY, dark ? 'dark' : 'light'); } catch (e) { /* stockage indisponible : le thème reste valable pour la session */ }
  },
  toggle() { this.set(!this.isDark()); },
};
