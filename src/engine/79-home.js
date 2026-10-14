/* Page de connexion (Auth) et accueil « Mes projets » avec dossiers (Home), sur le modèle d'ArchiPlan (src/js/auth.js, cloud.js, home.css).
   Reprend : écran de connexion / création de compte / mot de passe oublié, accueil avec carte de stockage, dossiers imbriqués,
   projets, menus, déplacement, renommage, suppression, enregistrement automatique du projet ouvert.
   NON repris pour l'instant : partage par email ou lien, « Partagés avec moi », miniatures des projets, code PIN, vérification d'email.
   Aucun texte venant de l'utilisateur ou du serveur n'est inséré comme HTML : tout passe par textContent (fonction h). */

/* Nœud DOM sans enfants vides ; les chaînes sont du texte. */
const h = (tag, attrs = {}, ...kids) => el(tag, attrs, ...kids.flat().filter((k) => k != null && k !== false));
const svgIcon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };
const ICON = {
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  up: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  plan: 'M4 4h16v16H4zM4 10h16M10 4v16',
};
const icon = (k) => svgIcon(ICON[k]);

/* Boîtes de saisie / de confirmation basées sur Dlg (élément <dialog>). */
const Ask = {
  text(title, label, value = '', ok = 'Valider') {
    return new Promise((res) => {
      let done = false;
      const input = h('input', { class: 'fld', type: 'text', maxlength: 120, value, 'aria-label': label });
      const err = h('p', { class: 'err', role: 'alert' });
      const body = h('form', { novalidate: true }, h('label', { class: 'lbl' }, label, input), err);
      const fin = (v) => { if (!done) { done = true; res(v); } };
      const go = () => { const v = input.value.trim(); if (!v) { err.textContent = 'Saisissez un nom.'; input.focus(); return false; } fin(v); return true; };
      const dlg = Dlg.open(title, body, [{ label: ok, primary: true, run: () => go() ? undefined : false }]);
      body.addEventListener('submit', (e) => { e.preventDefault(); if (go()) dlg.close(); });
      dlg.addEventListener('close', () => fin(null));
      input.focus(); input.select();
    });
  },
  confirm(title, text, ok = 'Confirmer') {
    return new Promise((res) => {
      let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
      const dlg = Dlg.open(title, h('p', {}, text), [{ label: ok, primary: true, run: () => { fin(true); } }]);
      dlg.addEventListener('close', () => fin(false));
    });
  },
  info(title, text) { Dlg.open(title, h('p', {}, text)); },
};

/* ---------------------------------------------------------------- Connexion */
const Auth = (() => {
  const root = () => $('#auth');
  const card = () => $('#apCard');
  let mode = 'in';

  function pwField(id, auto) {
    const input = h('input', { id, type: 'password', autocomplete: auto, maxlength: 200, required: true, 'aria-label': 'Mot de passe' });
    const eye = h('button', { type: 'button', class: 'ap-eye', 'aria-pressed': 'false' }, 'Afficher');
    eye.addEventListener('click', () => { const on = input.type === 'password'; input.type = on ? 'text' : 'password'; eye.textContent = on ? 'Masquer' : 'Afficher'; eye.setAttribute('aria-pressed', String(on)); });
    return { input, wrap: h('div', { class: 'ap-in' }, input, eye) };
  }
  const field = (label, input) => h('label', { class: 'ap-field' }, h('span', {}, label), input.wrap || h('div', { class: 'ap-in' }, input));

  function render() {
    const c = card(); c.textContent = '';
    const err = h('p', { class: 'ap-err', role: 'alert' });
    const note = h('p', { class: 'ap-note ok', hidden: true });
    const tabs = h('div', { class: 'ap-tabs', role: 'tablist' },
      ...[['in', 'Connexion'], ['up', 'Créer un compte']].map(([m, t]) => {
        const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === m || (mode === 'reset' && m === 'in')) }, t);
        b.addEventListener('click', () => { mode = m; render(); });
        return b;
      }));
    const email = h('input', { type: 'email', autocomplete: 'email', maxlength: 160, required: true, 'aria-label': 'Email' });
    const form = h('form', { class: 'ap-form', novalidate: true });
    const go = h('button', { type: 'submit', class: 'ap-btn' }, mode === 'in' ? 'Se connecter' : mode === 'up' ? 'Créer mon compte' : 'Envoyer le lien');
    let fn, ln, pw, terms;
    if (mode === 'up') {
      fn = h('input', { type: 'text', autocomplete: 'given-name', maxlength: 80, required: true, 'aria-label': 'Prénom' });
      ln = h('input', { type: 'text', autocomplete: 'family-name', maxlength: 80, 'aria-label': 'Nom' });
      form.append(h('div', { class: 'ap-grid2' }, field('Prénom', fn), field('Nom', ln)));
    }
    form.append(field('Email', email));
    if (mode !== 'reset') {
      pw = pwField('apPw', mode === 'up' ? 'new-password' : 'current-password');
      form.append(field('Mot de passe', pw));
    }
    if (mode === 'up') {
      const rules = [['8 caractères minimum', (v) => v.length >= 8], ['une lettre', (v) => /[A-Za-z]/.test(v)], ['un chiffre', (v) => /\d/.test(v)]];
      const items = rules.map(([t]) => h('li', {}, t));
      pw.input.addEventListener('input', () => rules.forEach(([, f], i) => items[i].classList.toggle('ok', f(pw.input.value))));
      terms = h('input', { type: 'checkbox' });
      form.append(h('ul', { class: 'ap-rules' }, ...items), h('label', { class: 'ap-check' }, terms, h('span', {}, 'J\'accepte les conditions d\'utilisation de Studio Prism.')));
    }
    if (mode === 'in') {
      const forgot = h('button', { type: 'button', class: 'ap-link' }, 'Mot de passe oublié ?');
      forgot.addEventListener('click', () => { mode = 'reset'; render(); });
      form.append(h('div', { class: 'ap-row' }, forgot));
    }
    form.append(err, note, go);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.textContent = ''; note.hidden = true; go.disabled = true;
      try {
        if (mode === 'in') await Account.signIn(email.value, pw.input.value);
        else if (mode === 'up') {
          if (!fn.value.trim()) throw { code: 'app/form', message: 'Renseignez votre prénom.' };
          if (!terms.checked) throw { code: 'app/form', message: 'Vous devez accepter les conditions d\'utilisation pour créer un compte.' };
          await Account.signUp({ firstName: fn.value.trim().slice(0, 80), lastName: ln.value.trim().slice(0, 80), email: email.value, password: pw.input.value });
        } else {
          if (!email.value.trim()) throw { code: 'app/form', message: 'Saisissez votre adresse email.' };
          await Account.sendReset(email.value);
          note.textContent = 'Si un compte existe pour cette adresse, un lien de réinitialisation vient d\'être envoyé. Pensez à regarder vos courriers indésirables.'; note.hidden = false;
          go.disabled = false; return;
        }
        api.hide(); Home.open();
      } catch (e) { err.textContent = e && e.code === 'app/form' ? e.message : Account.errMsg(e); go.disabled = false; }
    });
    const skip = h('button', { type: 'button', class: 'ap-btn alt', id: 'authSkip' }, 'Continuer sans compte');
    skip.addEventListener('click', () => api.hide());
    const back = mode === 'reset' ? h('button', { type: 'button', class: 'ap-link' }, '‹ Retour à la connexion') : null;
    if (back) back.addEventListener('click', () => { mode = 'in'; render(); });
    c.append(...[
      h('h2', {}, mode === 'up' ? 'Créer votre compte Studio Prism' : mode === 'reset' ? 'Mot de passe oublié' : 'Connexion à ARCHIINDUS'),
      h('p', { class: 'ap-sub' }, mode === 'up' ? 'Un seul compte pour toutes les apps du studio. Il est gratuit ; la licence ArchiIndus se règle ensuite avec Studio Prism.'
        : mode === 'reset' ? 'Saisissez l\'email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.'
          : 'Utilisez votre compte Studio Prism, le même que pour ArchiPlan et le site.'),
      mode === 'reset' ? null : tabs, form, back,
      h('div', { class: 'ap-or' }, 'ou'), skip,
      h('p', { class: 'ap-mode' }, 'Sans compte, le dessin reste enregistré dans ce navigateur uniquement.')].filter(Boolean));
    (mode === 'up' ? fn : email).focus();
  }

  const api = {
    show(m = 'in') { mode = m; root().hidden = false; render(); },
    hide() { root().hidden = true; },
    visible: () => !root().hidden,
  };
  return api;
})();

/* ------------------------------------------------------------------- Accueil */
const Home = (() => {
  const FOLDER_LIMIT = 5;                       /* dossiers par compte, comme les dossiers privés d'ArchiPlan */
  const S = { folder: '', projects: [], folders: [], usage: null, loading: false, err: '' };
  const root = () => $('#home');
  const fmtSize = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Mo' : Math.max(1, Math.round(n / 1000)) + ' Ko');
  const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const byName = (a, b) => a.name.localeCompare(b.name, 'fr');
  const folderOf = (id) => S.folders.find((f) => f.id === id);
  const crumbs = () => { const out = []; let f = folderOf(S.folder), n = 0; while (f && n++ < 20) { out.unshift(f); f = folderOf(f.parentId); } return out; };
  const descendants = (fid) => { const out = new Set([fid]); let grow = true; while (grow) { grow = false; for (const f of S.folders) if (!out.has(f.id) && out.has(f.parentId)) { out.add(f.id); grow = true; } } return out; };
  const busy = (t) => { const b = $('#homeBusy'); if (t) { b.querySelector('span').textContent = t; b.hidden = false; } else b.hidden = true; };
  const toast = (t, ms) => Status.msg(t, ms);

  async function load() {
    S.loading = true; S.err = ''; render();
    try {
      const [projects, folders] = await Promise.all([CloudStore.list(), CloudStore.folders()]);
      S.projects = projects; S.folders = folders;
      if (S.folder && !folderOf(S.folder)) S.folder = '';
      try { S.usage = (await CloudStore.usage(projects)).bytes; } catch (e) { S.usage = projects.reduce((a, p) => a + p.size, 0); }
    } catch (e) { S.err = Account.errMsg(e); }
    S.loading = false; render();
  }

  /* --- Menus --- */
  function openMenu(anchor, items) {
    return new Promise((res) => {
      const m = $('#homeMenu'); m.textContent = '';
      const close = (v) => { m.hidden = true; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); res(v); };
      const away = (e) => { if (!m.contains(e.target)) close(null); };
      const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
      for (const it of items) {
        if (it === '-') { m.append(h('hr')); continue; }
        const b = h('button', { type: 'button', class: it.danger ? 'danger' : '' }, h('b', {}, it.t), it.s ? h('span', {}, it.s) : null);
        b.addEventListener('click', () => close(it.k));
        m.append(b);
      }
      m.hidden = false;
      const r = anchor.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
      m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
      m.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - hh - 8)) + 'px';
      setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); }, 0);
      const first = m.querySelector('button'); if (first) first.focus();
    });
  }

  /* --- Choix d'un dossier de destination --- */
  function pickFolder(title, excluded, current) {
    return new Promise((res) => {
      let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
      const list = h('div', { class: 'pick' });
      const dlg = Dlg.open(title, list);
      const add = (id, label, depth) => {
        const b = h('button', { type: 'button', class: id === current ? 'cur' : '', style: `padding-left:${10 + depth * 18}px` }, icon('folder'), label);
        b.addEventListener('click', () => { fin(id); dlg.close(); });
        list.append(b);
      };
      add('', 'Mes projets (racine)', 0);
      const walk = (pid, depth) => S.folders.filter((f) => f.parentId === pid && !excluded.has(f.id)).sort(byName).forEach((f) => { add(f.id, f.name, depth); walk(f.id, depth + 1); });
      walk('', 1);
      dlg.addEventListener('close', () => fin(undefined));
    });
  }

  /* --- Actions --- */
  const quotaFull = (extra) => {
    if (S.usage != null && S.usage + extra > Account.quota()) {
      Ask.info('Espace cloud plein', `Votre espace (${(Account.quota() / 1e6).toLocaleString('fr-FR')} Mo) est plein. Supprimez des projets, ou demandez une licence ArchiIndus à Studio Prism pour disposer de plus de place.`);
      return true;
    }
    return false;
  };
  const failMsg = (e) => e && e.code === 'app/too-big' ? 'Projet trop volumineux pour le cloud (950 Ko maximum).' : Account.errMsg(e);

  async function newProject() {
    const name = await Ask.text('Nouveau projet', 'Nom du projet', 'Projet sans titre', 'Créer'); if (!name) return;
    if (quotaFull(2000)) return;
    busy('Création du projet…');
    try { const d = Doc.sanitize({ ...Doc.fresh(), name }); await Cloud.createAndOpen(name, d, S.folder); busy(); api.close(); toast(`Projet « ${name} » créé. Il s'enregistre tout seul dans le cloud.`); }
    catch (e) { busy(); toast(failMsg(e), 9000); }
  }
  async function saveCurrent() {
    const d = JSON.parse(JSON.stringify(Doc.get()));
    const name = await Ask.text('Enregistrer dans le cloud', 'Nom du projet', d.name, 'Enregistrer'); if (!name) return;
    const size = CloudStore.byteLen(JSON.stringify({ ...d, name }));
    if (quotaFull(size)) return;
    busy('Enregistrement…');
    try { const id = await CloudStore.create(name, JSON.stringify({ ...d, name }), S.folder); Cloud.forget(); await Cloud.openProject(id); busy(); api.close(); toast('Projet enregistré dans le cloud.'); }
    catch (e) { busy(); toast(failMsg(e), 9000); }
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('Fichier trop volumineux (20 Mo maximum).', 8000); return; }
    let data;
    try { data = Doc.sanitize(JSON.parse(await file.text())); }
    catch (e) { toast('Import impossible : ' + (e instanceof SyntaxError ? 'ce fichier n\'est pas du JSON valide.' : e.message), 9000); return; }
    if (quotaFull(CloudStore.byteLen(JSON.stringify(data)))) return;
    busy('Import du projet…');
    try { await Cloud.createAndOpen(data.name, data, S.folder); busy(); api.close(); toast(`Projet « ${data.name} » importé dans le cloud.`); }
    catch (e) { busy(); toast(failMsg(e), 9000); }
  }

  async function newFolder() {
    if (S.folders.length >= FOLDER_LIMIT) { Ask.info('Limite atteinte', `Vous avez déjà ${FOLDER_LIMIT} dossiers. Supprimez-en un pour en créer un autre.`); return; }
    const name = await Ask.text('Nouveau dossier', 'Nom du dossier', '', 'Créer'); if (!name) return;
    try { await CloudStore.createFolder(name, S.folder); await load(); } catch (e) { toast(failMsg(e), 9000); }
  }

  async function openProject(p) {
    busy(`Ouverture de « ${p.name} »…`);
    try { await Cloud.openProject(p.id); busy(); api.close(); toast(`Projet « ${p.name} » ouvert depuis le cloud. Enregistrement automatique activé.`); }
    catch (e) { busy(); toast(e instanceof SyntaxError ? 'Projet cloud illisible.' : e && e.message && !e.code ? 'Projet cloud invalide : ' + e.message : failMsg(e), 9000); }
  }

  async function projectMenu(p, btn) {
    const k = await openMenu(btn, [{ k: 'open', t: 'Ouvrir' }, { k: 'rename', t: 'Renommer' }, { k: 'move', t: 'Déplacer…' }, '-', { k: 'del', t: 'Supprimer', s: 'Définitif', danger: true }]);
    if (!k) return;
    try {
      if (k === 'open') await openProject(p);
      else if (k === 'rename') { const n = await Ask.text('Renommer le projet', 'Nouveau nom', p.name, 'Renommer'); if (!n) return; await CloudStore.rename(p.id, n); if (Cloud.linked() === p.id) Doc.mutate((x) => { x.name = n; }); await load(); }
      else if (k === 'move') { const f = await pickFolder('Déplacer le projet', new Set(), p.folderId); if (f === undefined) return; await CloudStore.move(p.id, f); await load(); }
      else if (k === 'del') {
        if (!(await Ask.confirm('Supprimer le projet', `Supprimer « ${p.name} » du cloud ? Cette action est définitive.`, 'Supprimer'))) return;
        await CloudStore.remove(p.id); if (Cloud.linked() === p.id) Cloud.forget(); toast(`« ${p.name} » supprimé du cloud.`); await load();
      }
    } catch (e) { toast(failMsg(e), 9000); }
  }

  async function folderMenu(f, btn) {
    const k = await openMenu(btn, [{ k: 'open', t: 'Ouvrir' }, { k: 'rename', t: 'Renommer' }, { k: 'move', t: 'Déplacer…' }, '-', { k: 'del', t: 'Supprimer le dossier', s: 'Son contenu remonte d\'un niveau', danger: true }]);
    if (!k) return;
    try {
      if (k === 'open') { S.folder = f.id; render(); }
      else if (k === 'rename') { const n = await Ask.text('Renommer le dossier', 'Nouveau nom', f.name, 'Renommer'); if (!n) return; await CloudStore.renameFolder(f.id, n); await load(); }
      else if (k === 'move') { const t = await pickFolder('Déplacer le dossier', descendants(f.id), f.parentId); if (t === undefined) return; await CloudStore.moveFolder(f.id, t); await load(); }
      else if (k === 'del') {
        if (!(await Ask.confirm('Supprimer le dossier', `Supprimer le dossier « ${f.name} » ? Ses projets et sous-dossiers ne sont pas supprimés : ils remontent d'un niveau.`, 'Supprimer le dossier'))) return;
        await CloudStore.removeFolder(f.id, f.parentId, S.projects.filter((p) => p.folderId === f.id).map((p) => p.id), S.folders.filter((x) => x.parentId === f.id).map((x) => x.id));
        if (S.folder === f.id) S.folder = f.parentId; toast(`Dossier « ${f.name} » supprimé.`); await load();
      }
    } catch (e) { toast(failMsg(e), 9000); }
  }

  /* --- Affichage --- */
  const dots = () => { const b = h('button', { type: 'button', class: 'hdots', 'aria-label': 'Actions', 'aria-haspopup': 'true' }); b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>'; return b; };   /* HTML statique, sans donnée utilisateur */

  function folderCard(f) {
    const n = S.projects.filter((p) => p.folderId === f.id).length + S.folders.filter((x) => x.parentId === f.id).length;
    const d = dots();
    const c = h('div', { class: 'hfold', tabindex: '0', role: 'button', 'aria-label': `Dossier ${f.name}` }, icon('folder'), h('div', {}, h('b', {}, f.name), h('small', {}, n ? `${n} élément${n > 1 ? 's' : ''}` : 'Vide')), d);
    const open = () => { S.folder = f.id; render(); };
    c.addEventListener('click', (e) => { if (!d.contains(e.target)) open(); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === c) open(); });
    d.addEventListener('click', (e) => { e.stopPropagation(); folderMenu(f, d); });
    return c;
  }
  function projectCard(p) {
    const d = dots();
    const thumb = h('div', { class: 'hthumb' }, icon('plan'));
    const mine = Cloud.linked() === p.id;
    const c = h('div', { class: 'hcard', tabindex: '0', role: 'button', 'aria-label': `Projet ${p.name}` }, thumb, h('div', { class: 'hmeta' }, h('b', {}, p.name), h('span', {}, `${mine ? 'Ouvert · ' : ''}${fmtDate(p.updatedAt)} · ${fmtSize(p.size)}`)), d);
    c.addEventListener('click', (e) => { if (!d.contains(e.target)) openProject(p); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === c) openProject(p); });
    d.addEventListener('click', (e) => { e.stopPropagation(); projectMenu(p, d); });
    return c;
  }

  function renderQuota() {
    const q = $('#homeQuota'); q.textContent = '';
    const acc = Account.access(), lvl = acc ? acc.level : 'free', cap = Account.quota(), used = S.usage;
    const pct = used == null ? 0 : Math.min(100, Math.round(used / cap * 100));
    q.append(
      h('div', { class: 'q-h' }, 'Mon cloud', h('span', { class: 'q-plan ' + (lvl === 'licensed' ? 'pro' : lvl === 'admin' ? 'admin' : '') }, lvl === 'admin' ? 'Admin' : lvl === 'licensed' ? 'Licence' : 'Gratuit')),
      h('p', { class: 'q-num' }, h('b', {}, used == null ? '—' : (used / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Mo'), ` utilisés sur ${(cap / 1e6).toLocaleString('fr-FR')} Mo`),
      h('div', { class: 'q-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('i', { class: pct >= 100 ? 'full' : pct >= 80 ? 'mid' : '', style: `width:${pct}%` })),
      h('dl', { class: 'q-dl' }, h('dt', {}, 'Projets'), h('dd', {}, String(S.projects.length)), h('dt', {}, 'Dossiers'), h('dd', {}, `${S.folders.length} / ${FOLDER_LIMIT}`), h('dt', {}, 'Licence ArchiIndus'), h('dd', {}, Account.licenseText())));
  }

  function render() {
    const me = Account.me(); if (!me) return;
    $('#homeHello').textContent = `Bonjour ${me.firstName || ''}`.trim();
    const ini = ((me.firstName || '?').charAt(0) + (me.lastName || '').charAt(0)).toUpperCase();
    $('#homeUser').textContent = ini || '?';
    $('#homeUser').title = me.email;
    renderQuota();
    $('#homeNewF').disabled = S.loading || !!S.err;
    $('#homeNewP').disabled = S.loading || !!S.err; $('#homeImport').disabled = S.loading || !!S.err; $('#homeSave').disabled = S.loading || !!S.err;
    const body = $('#homeBody'); body.textContent = '';
    if (S.loading && !S.projects.length && !S.folders.length) { body.append(h('div', { class: 'hgrid' }, ...[1, 2, 3, 4].map(() => h('div', { class: 'hcard sk' }, h('div', { class: 'hthumb' }), h('div', { class: 'hmeta' }, h('b'), h('span')))))); return; }
    if (S.err) { const r = h('button', { type: 'button', class: 'ap-btn alt' }, 'Réessayer'); r.addEventListener('click', load); body.append(h('div', { class: 'hempty' }, h('p', {}, S.err), r)); return; }
    if (S.folder) {
      const cr = h('nav', { class: 'hcrumbs', 'aria-label': 'Dossiers' });
      const root_ = h('button', { type: 'button' }, 'Mes projets'); root_.addEventListener('click', () => { S.folder = ''; render(); }); cr.append(root_);
      for (const f of crumbs()) { const b = h('button', { type: 'button' }, f.name); b.addEventListener('click', () => { S.folder = f.id; render(); }); cr.append(h('span', {}, '›'), b); }
      body.append(cr);
    }
    if (!S.folder && !Cloud.linked() && Doc.get().objects.length) {
      const b = h('button', { type: 'button', class: 'ap-btn alt' }, 'Enregistrer dans le cloud'); b.addEventListener('click', saveCurrent);
      body.append(h('div', { class: 'hlocal' }, h('div', {}, h('b', {}, 'Un dessin est ouvert sur cet appareil'), h('span', {}, `${Doc.get().name} · ${Doc.get().objects.length} objet${Doc.get().objects.length > 1 ? 's' : ''}, enregistré dans ce navigateur uniquement`)), b));
    }
    const fs = S.folders.filter((f) => f.parentId === S.folder).sort(byName);
    const ps = S.projects.filter((p) => p.folderId === S.folder).sort((a, b) => b.updatedAt - a.updatedAt);
    if (fs.length) body.append(h('h2', { class: 'hsec' }, 'Dossiers'), h('div', { class: 'hfolders' }, ...fs.map(folderCard)));
    if (ps.length) body.append(h('h2', { class: 'hsec' }, S.folder ? 'Projets du dossier' : 'Projets récents'), h('div', { class: 'hgrid' }, ...ps.map(projectCard)));
    else {
      const b = h('button', { type: 'button', class: 'ap-btn' }, 'Nouveau projet'); b.addEventListener('click', newProject);
      body.append(h('div', { class: 'hempty' }, h('div', { class: 'hic' }, icon('plan')), h('h3', {}, S.folder ? 'Ce dossier ne contient aucun projet' : 'Aucun projet pour l\'instant'), h('p', {}, 'Créez un projet : il s\'enregistre tout seul dans le cloud, à chaque modification.'), b));
    }
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    $('#homeNewP').addEventListener('click', newProject);
    $('#homeNewF').addEventListener('click', newFolder);
    $('#homeSave').addEventListener('click', saveCurrent);
    $('#homeImport').addEventListener('click', () => $('#homeFile').click());
    $('#homeFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; importFile(f); });
    $('#homeBack').addEventListener('click', () => api.close());
    $('#homeUser').addEventListener('click', async (e) => {
      const me = Account.me();
      const k = await openMenu(e.currentTarget, [{ k: 'acct', t: 'Mon compte', s: me ? me.email : '' }, { k: 'edit', t: 'Retour au dessin' }, '-', { k: 'out', t: 'Se déconnecter', danger: true }]);
      if (k === 'acct') Account.open(); else if (k === 'edit') api.close();
      else if (k === 'out') { await Account.signOut(); api.close(); Auth.show(); }
    });
  }

  const api = {
    open() {
      if (!Account.me()) { Auth.show(); return; }
      bind(); root().hidden = false; S.folder = ''; load();
    },
    close() { root().hidden = true; $('#homeMenu').hidden = true; },
    visible: () => !root().hidden,
    /* Affiche tout de suite l'écran d'accueil pendant que la session est restaurée (évite un flash de l'éditeur). */
    pending() { bind(); root().hidden = false; $('#homeHello').textContent = 'Connexion…'; $('#homeBody').textContent = ''; $('#homeBody').append(h('div', { class: 'hgrid' }, ...[1, 2, 3, 4].map(() => h('div', { class: 'hcard sk' }, h('div', { class: 'hthumb' }), h('div', { class: 'hmeta' }, h('b'), h('span')))))); },
    state: S,
  };
  Account.on(() => { if (!Account.me() && api.visible()) { api.close(); } });
  return api;
})();
