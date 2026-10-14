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
    remembered() { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } },
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
    open() { return me ? accountDialog() : Auth.show(); },
  };

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
      { label: 'Mes projets (cloud)', run: () => { Home.open(); } },
      { label: 'Se déconnecter', run: () => { api.signOut().then(() => Status.msg('Déconnecté.')); } },
    ]);
  }

  return api;
})();

/* Lien entre le document affiché et un projet cloud ; enregistrement automatique (comme ArchiPlan : « tout s'enregistre tout seul »).
   Le lien n'est gardé qu'en mémoire : après un rechargement, on rouvre le projet depuis « Mes projets ». */
const Cloud = (() => {
  const DELAY = 2500;
  let cur = null;                      /* { id, size } */
  let state = 'idle';                  /* idle | pending | saving | saved | error */
  let timer = 0, running = false, again = false;
  const subs = [];
  const set = (s) => { state = s; subs.forEach((f) => f()); };

  async function flush() {
    timer = 0;
    if (!cur) return;
    if (running) { again = true; return; }
    running = true; set('saving');
    const link = cur;
    try {
      const d = Doc.get(), data = JSON.stringify(d);
      await CloudStore.save(link.id, d.name, data, link.size);
      link.size = CloudStore.byteLen(data);
      set(again ? 'pending' : 'saved');
    } catch (e) { set('error'); Status.msg(Account.errMsg(e), 9000); }
    running = false;
    if (again && cur === link) { again = false; schedule(); }
  }
  function schedule() { if (!cur || !Account.me()) return; clearTimeout(timer); set('pending'); timer = setTimeout(flush, DELAY); }
  Doc.on((reason) => { if (reason === 'change') schedule(); });

  return {
    on: (f) => { subs.push(f); },
    linked: () => (cur ? cur.id : ''),
    state: () => (cur ? state : 'idle'),
    suffix() {
      if (!cur) return '';
      return ' · cloud : ' + ({ pending: 'à enregistrer…', saving: 'enregistrement…', saved: 'enregistré', error: 'ÉCHEC', idle: '' }[state] || '');
    },
    /* Détache le projet cloud ; une modification encore en attente est d'abord envoyée (rien ne se perd en changeant de projet). */
    forget() { if (cur && timer) { clearTimeout(timer); flush(); } clearTimeout(timer); timer = 0; cur = null; again = false; set('idle'); },
    /* Enregistre tout de suite (avant de quitter le projet). */
    async flushNow() { if (cur && timer) { clearTimeout(timer); await flush(); } },

    /* Crée un projet cloud à partir de data (objet validé) et l'affiche. */
    async createAndOpen(name, data, folderId = '') {
      data.name = name;
      const json = JSON.stringify(data);
      const id = await CloudStore.create(name, json, folderId);
      this.forget();
      Doc.load(data); Tools.selection.clear(); Canvas2D.zoomExtents();
      cur = { id, size: CloudStore.byteLen(json) }; set('saved');
      return id;
    },
    async openProject(id) {
      await this.flushNow();
      const r = await CloudStore.open(id);
      const data = Doc.sanitize(JSON.parse(r.data));
      data.name = r.meta.name || data.name;      /* le nom de la fiche fait foi (renommage depuis l'accueil) */
      this.forget();                       /* d'abord délier : le remplacement ne doit rien enregistrer dans un autre projet */
      Doc.load(data); Tools.selection.clear(); Canvas2D.zoomExtents();
      cur = { id, size: r.meta.size }; set('saved');
      return data;
    },
  };
})();
