/* Compte Studio Prism, licence ArchiIndus et projets cloud (interface). Reprend les mécanismes d'ArchiPlan (src/js/auth.js, cloud.js) :
   même projet Firebase COMMUN (AI_FIREBASE.common), mêmes collections users/{uid} et licenses/{uid}_{produit}, SDK « compat » chargé à la demande.
   Rien n'est chargé depuis le réseau tant que l'utilisateur n'ouvre pas le compte, sauf s'il s'est déjà connecté sur cet appareil.
   NON repris pour l'instant : code PIN et verrouillage, fiche client, Face ID, accès par lien. Aucune fonction n'est bloquée par la licence :
   elle est seulement affichée (les règles d'accès à ArchiIndus restent à définir).
   Les écritures cloud échouent tant que le bloc de règles ai* n'est pas publié (voir firebase/firestore.ai.rules.proposed). */
const Account = (() => {
  const BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const PRODUCT = 'archiindus';
  const SITE_URL = 'https://groupestudioprism.github.io/Studio-Prism/';
  const FLAG = 'ai.acct';
  const QUOTA = { free: 10e6, licensed: 50e6, admin: 1e9 };            /* mêmes valeurs que aiQuota() dans le bloc de règles proposé */
  const LIC_LABEL = { free: 'Gratuite', pro: 'Pro', pro_entreprise: 'Pro Entreprise', trial: 'Essai', demo: 'Démo', education: 'Éducation', standard: 'Standard' };
  const licLabel = (t) => LIC_LABEL[t] || String(t || '—').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const ERR = {
    'auth/invalid-credential': 'Email ou mot de passe incorrect.', 'auth/wrong-password': 'Email ou mot de passe incorrect.', 'auth/user-not-found': 'Email ou mot de passe incorrect.',
    'auth/invalid-email': 'Cette adresse email n\'est pas valide.',
    'auth/email-already-in-use': 'Un compte Studio Prism existe déjà avec cet email. Connectez-vous, ou utilisez « Mot de passe oublié ».',
    'auth/weak-password': 'Mot de passe trop faible : 8 caractères minimum, avec une lettre et un chiffre.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes, puis réessayez.',
    'auth/network-request-failed': 'Connexion impossible. Vérifiez votre réseau, puis réessayez.',
    'app/suspended': 'Ce compte Studio Prism est désactivé. Contactez Studio Prism pour le faire réactiver.',
    'app/profile-missing': 'Le profil Studio Prism n\'a pas pu être lu ou créé. Réessayez dans un instant.',
    'app/profile-invalid': 'Votre profil Studio Prism est incomplet. Contactez Studio Prism.',
  };
  const errMsg = (e) => ERR[e && e.code] || CloudStore.explain(e);

  let fa = null, db = null, me = null, access = null, booting = null;
  const subs = [];
  const notify = () => subs.forEach((f) => f());
  const flag = (on) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch (e) { /* stockage indisponible */ } };

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej({ code: 'auth/network-request-failed' });
      document.head.appendChild(s);
    });
  }

  function boot() {
    if (booting) return booting;
    booting = (async () => {
      await loadScript(BASE + 'firebase-app-compat.js');
      await Promise.all([loadScript(BASE + 'firebase-auth-compat.js'), loadScript(BASE + 'firebase-firestore-compat.js')]);
      firebase.initializeApp(AI_FIREBASE.common);
      fa = firebase.auth(); fa.languageCode = 'fr';
      fa.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      db = firebase.firestore();
      try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) { /* réglage non critique */ }
    })();
    booting.catch(() => { booting = null; });
    return booting;
  }

  const ts = () => firebase.firestore.FieldValue.serverTimestamp();
  const userRef = (uid) => db.collection('users').doc(uid);

  /* Profil par défaut identique à celui du site et d'ArchiPlan : particulier / gratuit / utilisateur / actif. */
  function defaultProfile(u, extra = {}) {
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
    let words = (u.displayName || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) words = (u.email || '').split('@')[0].split(/[._+-]+/).filter(Boolean).map(cap);
    return {
      firstName: (extra.firstName || words[0] || 'Utilisateur').slice(0, 80), lastName: (extra.lastName ?? words.slice(1).join(' ')).slice(0, 80),
      email: u.email, accountKind: 'individual', subscription: 'free', role: 'user', status: 'active',
      createdAt: ts(), updatedAt: ts(), lastLogin: ts(), ...(extra.terms ? { termsAcceptedAt: ts() } : {}),
    };
  }

  async function readProfile(u) {
    const ref = userRef(u.uid);
    let snap = await ref.get();
    if (!snap.exists) { try { await ref.set(defaultProfile(u)); } catch (e) { /* lecture ci-dessous */ } snap = await ref.get(); if (!snap.exists) throw { code: 'app/profile-missing' }; }
    const d = snap.data();
    if (d.status === 'suspended') { await fa.signOut(); throw { code: 'app/suspended' }; }
    if (d.status !== 'active') throw { code: 'app/profile-invalid' };
    return d;
  }

  /* Droits : administrateur actif → tout ; sinon licence licenses/{uid}_archiindus active et non expirée. */
  async function readAccess(u, p) {
    let lic = null;
    try { const s = await db.collection('licenses').doc(`${u.uid}_${PRODUCT}`).get(); lic = s.exists ? s.data() : null; }
    catch (e) { if (!e || e.code !== 'permission-denied') throw e; }   /* absence de licence : les règles refusent la lecture d'un document absent */
    const exp = lic && lic.expiresAt && lic.expiresAt.toDate ? lic.expiresAt.toDate() : null;
    const license = lic ? { type: lic.licenseType, status: lic.status, expiresAt: exp ? exp.getTime() : null, expired: !!exp && exp <= new Date() } : null;
    if (p.role === 'admin' && p.status === 'active') return { level: 'admin', license };
    return { level: license && license.status === 'active' && !license.expired ? 'licensed' : 'free', license };
  }

  async function after(user) {
    const p = await readProfile(user);
    userRef(user.uid).update({ lastLogin: ts() }).catch(() => {});
    const [f, ...l] = (user.displayName || '').split(' ');
    me = { uid: user.uid, email: user.email, firstName: p.firstName || f || '', lastName: p.lastName ?? l.join(' ') };
    access = await readAccess(user, p);
    CloudStore.bind(db, user.uid);
    flag(true);
    notify();
    return me;
  }

  const strongPw = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

  const api = {
    me: () => me,
    access: () => access,
    on: (f) => { subs.push(f); },
    licLabel, errMsg, QUOTA,
    licenseText() {
      if (!access) return '—';
      if (access.level === 'admin') return 'Administrateur';
      const l = access.license;
      if (access.level === 'licensed') return licLabel(l.type) + (l.expiresAt ? ' · jusqu\'au ' + new Date(l.expiresAt).toLocaleDateString('fr-FR') : '');
      return l && l.expired ? 'Expirée (' + licLabel(l.type) + ')' : 'Gratuite (aucune licence ArchiIndus)';
    },
    quota: () => (access ? QUOTA[access.level === 'licensed' ? 'licensed' : access.level] : QUOTA.free),

    /* Au démarrage : ne charge Firebase que si une session a déjà été ouverte sur cet appareil. */
    async restore() {
      let on = false;
      try { on = localStorage.getItem(FLAG) === '1'; } catch (e) { /* stockage indisponible */ }
      if (!on) return;
      try {
        await boot();
        const u = await new Promise((res) => { const un = fa.onAuthStateChanged((x) => { un(); res(x); }); });
        if (u) await after(u); else flag(false);
      } catch (e) { /* hors ligne : l'application reste utilisable sans compte */ }
    },

    async signIn(email, password) {
      await boot();
      const c = await fa.signInWithEmailAndPassword(String(email).trim(), password);
      try { return await after(c.user); } catch (e) { if (!e || e.code !== 'app/suspended') await fa.signOut().catch(() => {}); throw e; }
    },

    async signUp({ firstName, lastName, email, password }) {
      if (!strongPw(password)) throw { code: 'auth/weak-password' };
      await boot();
      const c = await fa.createUserWithEmailAndPassword(String(email).trim(), password);
      try { await userRef(c.user.uid).set(defaultProfile(c.user, { firstName, lastName, terms: true })); }
      catch (e) { await c.user.delete().catch(() => fa.signOut().catch(() => {})); throw e; }   /* pas de compte à moitié créé */
      c.user.updateProfile({ displayName: `${firstName} ${lastName}`.trim() }).catch(() => {});
      c.user.sendEmailVerification().catch(() => {});
      return after(c.user);
    },

    async sendReset(email) {
      await boot();
      try { await fa.sendPasswordResetEmail(String(email).trim()); } catch (e) { if (!e || e.code !== 'auth/user-not-found') throw e; }   /* même réponse, compte existant ou non */
    },

    async signOut() {
      if (fa) await fa.signOut().catch(() => {});
      me = null; access = null; CloudStore.unbind(); Cloud.forget(); flag(false); notify();
    },

    /* --- Interface --- */
    open() { return me ? accountDialog() : loginDialog(); },
  };

  function field(label, attrs) {
    const input = el('input', { class: 'fld', ...attrs, 'aria-label': label });
    return [el('label', { class: 'lbl' }, label, input), input];
  }

  function loginDialog(mode = 'in') {
    const body = el('div');
    const dlg = Dlg.open('Compte Studio Prism', body);
    const render = (m) => {
      body.textContent = '';
      const err = el('p', { class: 'err', role: 'alert' });
      const info = el('p', { class: 'mut small' });
      const [lE, email] = field('Email', { type: 'email', autocomplete: 'email', maxlength: 160 });
      const [lP, pw] = field('Mot de passe', { type: 'password', autocomplete: m === 'up' ? 'new-password' : 'current-password', maxlength: 200 });
      const go = el('button', { type: 'submit', class: 'btn pri wide' }, m === 'in' ? 'Se connecter' : m === 'up' ? 'Créer mon compte' : 'Envoyer le lien');
      const form = el('form', { novalidate: true });
      let fn = null, ln = null, terms = null;
      if (m === 'up') {
        const [lF, f1] = field('Prénom', { type: 'text', autocomplete: 'given-name', maxlength: 80 });
        const [lL, l1] = field('Nom', { type: 'text', autocomplete: 'family-name', maxlength: 80 });
        fn = f1; ln = l1;
        form.append(el('div', { class: 'frm' }, lF, lL));
      }
      form.append(lE);
      if (m !== 'reset') form.append(lP);
      if (m === 'up') {
        terms = el('input', { type: 'checkbox' });
        form.append(el('p', { class: 'mut small' }, 'Mot de passe : 8 caractères minimum, avec une lettre et un chiffre.'),
          el('label', { class: 'chk' }, terms, 'J\'accepte les conditions d\'utilisation de Studio Prism.'));
      }
      form.append(err, info, go);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        err.textContent = ''; info.textContent = '';
        go.disabled = true;
        try {
          if (m === 'in') { await api.signIn(email.value, pw.value); }
          else if (m === 'up') {
            if (!fn.value.trim() || !terms.checked) throw { code: 'app/form', message: 'Renseignez votre prénom et acceptez les conditions.' };
            await api.signUp({ firstName: fn.value.trim().slice(0, 80), lastName: ln.value.trim().slice(0, 80), email: email.value, password: pw.value });
          } else {
            await api.sendReset(email.value);
            info.textContent = 'Si un compte existe pour cet email, un lien de réinitialisation vient d\'être envoyé.';
            go.disabled = false; return;
          }
          dlg.close(); Status.msg(`Connecté : ${me.email}`);
        } catch (e) { err.textContent = e && e.code === 'app/form' ? e.message : errMsg(e); go.disabled = false; }
      });
      const link = (txt, to) => { const b = el('button', { type: 'button', class: 'lnk' }, txt); b.addEventListener('click', () => render(to)); return b; };
      body.append(el('p', { class: 'mut small' }, 'Un seul compte Studio Prism pour ArchiPlan, ArchiVision, ArchiIndus et le site.'), form,
        el('div', { class: 'lnks' }, ...(m === 'in' ? [link('Créer un compte', 'up'), link('Mot de passe oublié', 'reset')] : [link('J\'ai déjà un compte', 'in')])));
    };
    render(mode);
    return dlg;
  }

  function accountDialog() {
    const body = el('div');
    const used = el('dd', {}, '…');
    const kv = (k, v) => [el('dt', {}, k), typeof v === 'string' ? el('dd', {}, v) : v];
    body.append(el('dl', { class: 'kv' }, ...kv('Nom', `${me.firstName} ${me.lastName}`.trim() || '—'), ...kv('Email', me.email), ...kv('Licence ArchiIndus', api.licenseText()),
      ...kv('Stockage cloud', used)));
    const quotaTxt = ` / ${(api.quota() / 1e6).toLocaleString('fr-FR')} Mo`;
    CloudStore.usageBytes().then((b) => { used.textContent = (b / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + quotaTxt; })
      .catch(() => { used.textContent = 'indisponible'; });
    body.append(el('p', { class: 'mut small' }, 'Les licences se gèrent sur le site Studio Prism : l\'attribution d\'une licence ArchiIndus est faite par un administrateur.'),
      el('p', {}, el('a', { href: SITE_URL + '#/compte', target: '_blank', rel: 'noopener' }, 'Ouvrir mon compte sur le site Studio Prism')));
    return Dlg.open('Mon compte', body, [
      { label: 'Projets cloud', run: () => { Cloud.show(); } },
      { label: 'Se déconnecter', run: () => { api.signOut().then(() => Status.msg('Déconnecté.')); } },
    ]);
  }

  return api;
})();

/* Projets cloud : enregistrer le projet courant, rouvrir, supprimer. Le lien « projet courant ↔ projet cloud » n'est gardé qu'en mémoire. */
const Cloud = (() => {
  let cur = null;                         /* { id, size } du projet cloud lié au document affiché */
  const fmtSize = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Mo' : Math.max(1, Math.round(n / 1000)) + ' Ko');
  const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  function show() {
    if (!Account.me()) { Account.open(); return; }
    const body = el('div');
    const list = el('div');
    body.append(el('p', { class: 'mut small' }, 'Projets enregistrés sur votre compte Studio Prism (950 Ko maximum par projet). Ctrl+Z annule l\'ouverture d\'un projet.'), list);
    const dlg = Dlg.open('Projets cloud', body, [{ label: cur ? 'Mettre à jour le projet cloud' : 'Enregistrer ce projet dans le cloud', primary: true, run: () => { save(); return false; } }]);

    async function refresh() {
      const pb = dlg.querySelector('.dlg-f .btn.pri'); if (pb) pb.textContent = cur ? 'Mettre à jour le projet cloud' : 'Enregistrer ce projet dans le cloud';
      list.textContent = '';
      list.append(el('p', { class: 'mut' }, 'Chargement…'));
      let items;
      try { items = await CloudStore.list(); } catch (e) { list.textContent = ''; list.append(el('p', { class: 'err' }, Account.errMsg(e))); return; }
      list.textContent = '';
      if (!items.length) { list.append(el('p', { class: 'mut' }, 'Aucun projet dans le cloud.')); return; }
      const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'Nom'), el('th', { class: 'n' }, 'Taille'), el('th', {}, 'Modifié'), el('th', {}, ''))));
      const tb = el('tbody');
      for (const p of items) {
        const open = el('button', { type: 'button', class: 'btn' }, 'Ouvrir');
        const del = el('button', { type: 'button', class: 'btn danger' }, 'Supprimer');
        open.addEventListener('click', () => openProject(p.id, dlg));
        let armed = 0;
        del.addEventListener('click', async () => {
          if (!armed) { armed = setTimeout(() => { armed = 0; del.textContent = 'Supprimer'; }, 4000); del.textContent = 'Confirmer ?'; return; }
          clearTimeout(armed); del.disabled = true;
          try { await CloudStore.remove(p.id); if (cur && cur.id === p.id) cur = null; Status.msg(`« ${p.name} » supprimé du cloud.`); } catch (e) { Status.msg(Account.errMsg(e), 8000); }
          refresh();
        });
        tb.append(el('tr', {}, el('td', {}, p.name), el('td', { class: 'n' }, fmtSize(p.size)), el('td', {}, fmtDate(p.updatedAt)), el('td', {}, el('div', { class: 'grp' }, open, del))));
      }
      t.append(tb); list.append(t);
    }

    async function save() {
      const d = Doc.get(), data = JSON.stringify(d);
      try {
        if (cur) { await CloudStore.save(cur.id, d.name, data, cur.size); cur.size = CloudStore.byteLen(data); }
        else { const id = await CloudStore.create(d.name, data); cur = { id, size: CloudStore.byteLen(data) }; }
        Status.msg(`« ${d.name} » enregistré dans le cloud.`);
      } catch (e) { Status.msg(Account.errMsg(e), 9000); }
      refresh();
    }
    refresh();
    return dlg;
  }

  async function openProject(id, dlg) {
    try {
      const r = await CloudStore.open(id);
      const data = Doc.sanitize(JSON.parse(r.data));
      Doc.replace(data); Tools.selection.clear(); Canvas2D.zoomExtents();
      cur = { id, size: r.meta.size };
      dlg.close();
      Status.msg(`Projet « ${data.name} » ouvert depuis le cloud (${data.objects.length} objets).`);
    } catch (e) { Status.msg(e instanceof SyntaxError ? 'Projet cloud illisible.' : e && e.message && !e.code ? 'Projet cloud invalide : ' + e.message : Account.errMsg(e), 9000); }
  }

  return { show, forget() { cur = null; } };
})();
