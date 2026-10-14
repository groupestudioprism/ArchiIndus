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

/* Boîte de dialogue modale (élément <dialog>). `body` est un nœud ; `actions` : [{ label, run }] — run() retourne false pour garder la boîte ouverte. */
const Dlg = {
  open(title, body, actions = []) {
    const dlg = el('dialog', { class: 'dlg', 'aria-label': title });
    const close = el('button', { type: 'button', class: 'ibs', 'aria-label': 'Fermer' }, '✕');
    const foot = el('div', { class: 'dlg-f' });
    for (const a of actions) {
      const b = el('button', { type: 'button', class: 'btn' + (a.primary ? ' pri' : '') }, a.label);
      b.addEventListener('click', () => { if (a.run() !== false) dlg.close(); });
      foot.append(b);
    }
    const done = el('button', { type: 'button', class: 'btn' }, 'Fermer');
    foot.append(done);
    close.addEventListener('click', () => dlg.close());
    done.addEventListener('click', () => dlg.close());
    dlg.append(el('div', { class: 'dlg-h' }, el('b', {}, title), close), el('div', { class: 'dlg-b' }, body), foot);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  },
};

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
