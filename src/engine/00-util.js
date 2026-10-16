'use strict';
/* Nombres à la française : un formateur par précision, réutilisé (toLocaleString en recrée un à chaque appel, très lent
   quand on dessine des centaines de cotes à chaque image) */
const FMT_FR = new Map();
/* appareil tactile sans souris ni pavé (téléphone, tablette) */
const MQ_COARSE = matchMedia('(pointer: coarse)'), MQ_FINE = matchMedia('(any-pointer: fine)');
const touchOnly = () => MQ_COARSE.matches && !MQ_FINE.matches;
function fmtFR(v, min, max){ const k = min * 100 + max; let f = FMT_FR.get(k); if (!f) FMT_FR.set(k, f = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:min, maximumFractionDigits:max})); return f.format(v); }
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

/* Droits liés à la licence ARCHIINDUS (module commun du compte : window.SPAccess, window.SPLicense).
   Les exports demandent une licence active (ou un compte administrateur), comme dans ARCHIPLAN ; sinon l'écran de licence s'ouvre. */
const Lic = {
  canExport() { return !!(window.SPAccess && window.SPAccess.canExport); },
  need(what = 'export') {
    if (this.canExport()) return true;
    if (window.SPLicense && window.SPLicense.prompt) window.SPLicense.prompt(what);
    else Status.msg('Export réservé aux comptes avec une licence ARCHIINDUS active.', 7000);
    return false;
  },
};
