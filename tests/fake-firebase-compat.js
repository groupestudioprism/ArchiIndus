/* SIMULATION LOCALE du SDK Firebase « compat » (app + auth + firestore), pour tester l'interface compte / cloud dans le navigateur
   sans réseau ni vrai compte. Ce n'est PAS Firebase : aucune règle de sécurité n'est évaluée ici (elles sont testées à l'émulateur,
   tests/rules/). Données gardées dans localStorage (clé fake.store) pour survivre à un rechargement de page.
   Pilotage depuis le test : window.__fb (cfg, deny, resets, store). Comptes d'essai : alice@example.org / Passw0rd1 (licence pro),
   carol@example.org / Passw0rd1 (compte désactivé), eve@example.org / Passw0rd1 (prénom hostile, sans licence). */
(() => {
  const KEY = 'fake.store', SES = 'fake.uid';
  const now = () => Date.now();
  const T = (ms) => ({ __t: ms ?? now() });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  let S = load();
  if (!S) {
    S = {
      users: { 'alice@example.org': { uid: 'u_alice', pw: 'Passw0rd1', displayName: 'Alice Martin' }, 'carol@example.org': { uid: 'u_carol', pw: 'Passw0rd1', displayName: 'Carol Dupont' }, 'eve@example.org': { uid: 'u_eve', pw: 'Passw0rd1', displayName: 'Eve X' } },
      docs: {
        'users/u_alice': { firstName: 'Alice', lastName: 'Martin', email: 'alice@example.org', accountKind: 'individual', subscription: 'free', role: 'user', status: 'active' },
        'users/u_carol': { firstName: 'Carol', lastName: 'Dupont', email: 'carol@example.org', accountKind: 'individual', subscription: 'free', role: 'user', status: 'suspended' },
        'users/u_eve': { firstName: '<img src=x onerror="window.__x=1">', lastName: 'Eve', email: 'eve@example.org', accountKind: 'individual', subscription: 'free', role: 'user', status: 'active' },
        'licenses/u_alice_archiindus': { userId: 'u_alice', productId: 'archiindus', licenseType: 'pro', status: 'active', expiresAt: null },
      },
    };
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ } };
  const fb = window.__fb = { cfg: null, deny: false, resets: [], get docs() { return S.docs; }, get users() { return S.users; } };
  const err = (code) => Promise.reject(Object.assign(new Error(code), { code }));
  const mat = (v) => (v && typeof v === 'object' && '__t' in v ? { toMillis: () => v.__t, toDate: () => new Date(v.__t) } : v);
  const view = (d) => { const o = {}; for (const k of Object.keys(d)) o[k] = mat(d[k]); return o; };
  const guarded = (path) => /^(aiProjects|aiUsage|aiFolders)/.test(path);

  /* valeurs spéciales : horodatage serveur, incrément */
  const FV = { serverTimestamp: () => ({ __sv: 'ts' }), increment: (n) => ({ __sv: 'inc', n }) };
  const apply = (prev, data, merge) => {
    const out = merge ? { ...(prev || {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      if (v && v.__sv === 'ts') out[k] = T();
      else if (v && v.__sv === 'inc') out[k] = ((prev && prev[k]) || 0) + v.n;
      else out[k] = v;
    }
    return out;
  };

  const docRef = (path) => ({
    path, id: path.split('/').pop(),
    collection: (n) => collRef(path + '/' + n),
    get: () => Promise.resolve({ id: path.split('/').pop(), exists: path in S.docs, data: () => (path in S.docs ? view(S.docs[path]) : undefined), ref: docRef(path) }),
    set: (d, o) => commit([{ op: 'set', path, d, merge: !!(o && o.merge) }]),
    update: (d) => commit([{ op: 'update', path, d }]),
    delete: () => commit([{ op: 'delete', path }]),
  });
  const collRef = (path) => ({
    doc: (id) => docRef(path + '/' + (id || 'auto' + Math.random().toString(36).slice(2, 12))),
    where: (f, op, v) => ({ get: () => Promise.resolve({ docs: Object.keys(S.docs).filter((p) => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1 && S.docs[p][f] === v).map((p) => ({ id: p.split('/').pop(), data: () => view(S.docs[p]), ref: docRef(p) })) }) }),
  });
  function commit(ops) {
    if (fb.deny && ops.some((o) => guarded(o.path))) return err('permission-denied');
    for (const o of ops) {
      if (o.op === 'update' && !(o.path in S.docs)) return err('not-found');
    }
    for (const o of ops) {
      if (o.op === 'delete') delete S.docs[o.path];
      else if (o.op === 'update') S.docs[o.path] = apply(S.docs[o.path], o.d, true);
      else S.docs[o.path] = apply(S.docs[o.path], o.d, o.merge);
    }
    save();
    return Promise.resolve();
  }
  const firestore = () => ({
    settings() {}, collection: (n) => collRef(n),
    batch() {
      const ops = [];
      return {
        set: (r, d, o) => ops.push({ op: 'set', path: r.path, d, merge: !!(o && o.merge) }),
        update: (r, d) => ops.push({ op: 'update', path: r.path, d }),
        delete: (r) => ops.push({ op: 'delete', path: r.path }),
        commit: () => commit(ops),
      };
    },
  });
  firestore.FieldValue = FV;
  firestore.Timestamp = { fromMillis: (ms) => T(ms) };

  let cur = null;
  const userObj = (email, rec) => ({
    uid: rec.uid, email, displayName: rec.displayName || '', emailVerified: false,
    updateProfile: (p) => { rec.displayName = p.displayName; save(); return Promise.resolve(); },
    sendEmailVerification: () => Promise.resolve(),
    delete: () => { delete S.users[email]; cur = null; localStorage.removeItem(SES); save(); return Promise.resolve(); },
  });
  const setCur = (email) => { cur = userObj(email, S.users[email]); try { localStorage.setItem(SES, email); } catch (e) { /* ignoré */ } return { user: cur }; };
  try { const e = localStorage.getItem(SES); if (e && S.users[e]) setCur(e); } catch (e) { /* ignoré */ }
  const auth = () => ({
    languageCode: '', get currentUser() { return cur; },
    setPersistence: () => Promise.resolve(),
    onAuthStateChanged(cb) { setTimeout(() => cb(cur), 0); return () => {}; },
    signInWithEmailAndPassword(e, p) { const r = S.users[e.toLowerCase()]; return r && r.pw === p ? Promise.resolve(setCur(e.toLowerCase())) : err('auth/invalid-credential'); },
    createUserWithEmailAndPassword(e, p) {
      const k = e.toLowerCase();
      if (S.users[k]) return err('auth/email-already-in-use');
      if (p.length < 6) return err('auth/weak-password');
      S.users[k] = { uid: 'u_' + Math.random().toString(36).slice(2, 10), pw: p, displayName: '' }; save();
      return Promise.resolve(setCur(k));
    },
    signOut() { cur = null; try { localStorage.removeItem(SES); } catch (e) { /* ignoré */ } return Promise.resolve(); },
    sendPasswordResetEmail(e) { fb.resets.push(e); return S.users[e.toLowerCase()] ? Promise.resolve() : err('auth/user-not-found'); },
  });
  auth.Auth = { Persistence: { LOCAL: 'local' } };

  window.firebase = { initializeApp(cfg) { fb.cfg = cfg; return {}; }, auth, firestore };
})();
