'use strict';
/* Outils communs : sélection d'éléments, création de nœuds, messages d'état, thème clair / sombre. */
const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v) => String(Math.round(v));

/* Crée un nœud DOM. Les textes passent par textContent / value : jamais d'HTML construit à partir de données utilisateur. */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) n.append(k);
  return n;
}

const Status = {
  t: 0,
  msg(text, ms = 4500) {
    const m = $('#msg');
    if (!m) return;
    m.textContent = text;
    clearTimeout(this.t);
    this.t = setTimeout(() => { m.textContent = ''; }, ms);
  },
};

const Theme = {
  KEY: 'ai.theme',
  isDark() { return document.documentElement.dataset.theme === 'dark'; },
  set(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem(this.KEY, dark ? 'dark' : 'light'); } catch (e) { /* stockage indisponible : le thème reste valable pour la session */ }
  },
  toggle() { this.set(!this.isDark()); },
};
