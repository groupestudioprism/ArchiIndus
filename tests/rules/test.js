/* Règles Firestore communes de Studio Prism, testées dans l'émulateur (Java requis) : bloc ARCHIINDUS (ai*), et non-régression des blocs
   ARCHIPLAN (ap*) et ARCHITRAFIC (at*) qui partagent le même fichier.
   Les écritures reproduisent exactement celles de src/js/cloud.js (FirebaseCloud) : fiche + contenu + compteur dans le même lot.
   Lancer : npm install puis npm test (lancé aussi par l'intégration continue GitHub, .github/workflows/tests.yml). */
const fs = require('fs'), path = require('path');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

let checks = 0; const fails = [];
const ok = (c, m) => { checks++; if (!c) { fails.push(m); console.log('ÉCHEC :', m); } else console.log('ok :', m); };
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e && e.code ? e.code : String(e); } };
const FV = () => firebase.firestore.FieldValue;
const byteLen = (s) => Buffer.byteLength(s, 'utf8');

/* même charge utile que FirebaseCloud.create / save / addShare (src/js/cloud.js), préfixe de collection paramétrable */
function cloud(db, uid, email, P) {
  const ts = () => FV().serverTimestamp();
  return {
    async usage() { const r = db.collection(P + 'Usage').doc(uid); const s = await r.get(); if (!s.exists) await r.set({ bytes: 0, lastPid: '', updatedAt: ts() }); },
    async create(name, data, folderId = '') {
      await this.usage();
      const ref = db.collection(P + 'Projects').doc();
      const meta = { ownerUid: uid, ownerEmail: email, ownerName: 'Test', name, folderId, size: byteLen(data), thumb: '', linkMode: 'off', linkKey: '', linkToken: '', linkPw: false, createdAt: ts(), updatedAt: ts(), updatedBy: uid, updatedByName: 'Test' };
      const b = db.batch(); b.set(ref, meta); b.set(ref.collection('content').doc('main'), { data, updatedAt: ts() });
      b.set(db.collection(P + 'Usage').doc(uid), { bytes: FV().increment(byteLen(data)), lastPid: ref.id, updatedAt: ts() }, { merge: true });
      if (folderId) b.update(db.collection(P + 'Folders').doc(folderId), { pids: FV().arrayUnion(ref.id), updatedAt: ts() });
      await b.commit(); return ref.id;
    },
    async save(pid, data, prev, owner = uid) {
      const delta = byteLen(data) - prev, b = db.batch();
      b.set(db.collection(P + 'Projects').doc(pid).collection('content').doc('main'), { data, updatedAt: ts() });
      b.update(db.collection(P + 'Projects').doc(pid), { size: byteLen(data), updatedAt: ts(), updatedBy: uid, updatedByName: 'Test' });
      if (delta) b.set(db.collection(P + 'Usage').doc(owner), { bytes: FV().increment(delta), lastPid: pid, updatedAt: ts() }, { merge: true });
      await b.commit();
    },
    open: (pid) => db.collection(P + 'Projects').doc(pid).collection('content').doc('main').get(),
    async folder(name) { const ref = db.collection(P + 'Folders').doc(); await ref.set({ ownerUid: uid, ownerEmail: email, ownerName: 'Test', name, parentId: '', shared: false, pids: [], linkMode: 'off', linkKey: '', linkToken: '', linkPw: false, createdAt: ts(), updatedAt: ts() }); return ref.id; },
    share(pid, to, role) { return db.collection(P + 'Shares').doc(pid + '__' + to).set({ kind: 'project', pid, email: to, role, ownerUid: uid, name: 'Projet', ownerName: 'Test', createdAt: ts() }); },
    lib: (data) => db.collection(P + 'Library').doc(uid).set({ data, updatedAt: ts() }),
  };
}

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-studioprism', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '.generated/firestore.rules'), 'utf8') } });
  await env.clearFirestore();
  const prof = (extra = {}) => ({ firstName: 'T', lastName: 'T', email: 't@example.org', accountKind: 'individual', subscription: 'free', role: 'user', status: 'active', ...extra });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await d.doc('users/alice').set(prof({ email: 'alice@ex.fr' }));
    await d.doc('users/bob').set(prof({ email: 'bob@ex.fr' }));
    await d.doc('users/carol').set(prof({ status: 'suspended' }));
    await d.doc('licenses/alice_archiindus').set({ userId: 'alice', productId: 'archiindus', licenseType: 'pro', status: 'active', expiresAt: null });
  });
  const ctx = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
  const A = cloud(ctx('alice', 'alice@ex.fr'), 'alice', 'alice@ex.fr', 'ai'), B = cloud(ctx('bob', 'bob@ex.fr'), 'bob', 'bob@ex.fr', 'ai');
  const usage = async (P, uid) => { let v = null; await env.withSecurityRulesDisabled(async (c) => { const s = await c.firestore().doc(P + 'Usage/' + uid).get(); v = s.exists ? s.data().bytes : null; }); return v; };

  /* ---- ARCHIINDUS : cycle de vie, compteur, confidentialité */
  const d1 = JSON.stringify({ schemaVersion: 1, pad: 'x'.repeat(2000) });
  let pid = null;
  ok(await code(A.create('Station', d1).then((x) => { pid = x; })) === 'ok', 'ai : création d\'un projet (fiche + contenu + compteur dans le même lot)');
  ok(await usage('ai', 'alice') === byteLen(d1), 'ai : compteur de stockage = taille du projet');
  const d2 = d1 + 'y'.repeat(500);
  ok(await code(A.save(pid, d2, byteLen(d1))) === 'ok' && await usage('ai', 'alice') === byteLen(d2), 'ai : enregistrement, compteur mis à jour');
  ok(await code(B.open(pid)) === 'permission-denied', 'ai : contenu illisible par un autre compte');
  ok(await code(ctx('bob', 'bob@ex.fr').collection('aiProjects').doc(pid).update({ name: 'piraté', updatedAt: FV().serverTimestamp() })) === 'permission-denied', 'ai : modification par un autre compte refusée');
  ok(await code((async () => { const db = ctx('bob', 'bob@ex.fr'), r = db.collection('aiProjects').doc(), b = db.batch(); b.set(r, { ownerUid: 'bob', name: 'x', folderId: '', size: 5000, linkMode: 'off', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() }); b.set(r.collection('content').doc('main'), { data: 'z'.repeat(5000), updatedAt: FV().serverTimestamp() }); await b.commit(); })()) === 'permission-denied', 'ai : création sans compteur refusée');
  const C = cloud(ctx('carol', 'c@ex.fr'), 'carol', 'c@ex.fr', 'ai');
  ok(await code(C.create('x', '{}')) === 'permission-denied', 'ai : compte désactivé refusé');

  /* ---- quotas : 10 Mo sans licence (bob), 50 Mo avec licence ARCHIINDUS (alice) */
  await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc('aiUsage/bob').set({ bytes: 9990000, lastPid: '', updatedAt: new Date() }); await c.firestore().doc('aiUsage/alice').set({ bytes: 49990000, lastPid: '', updatedAt: new Date() }); });
  ok(await code(B.create('gros', 'x'.repeat(20000))) === 'permission-denied', 'ai : quota de 10 Mo sans licence (dépassement refusé)');
  ok(await code(B.create('petit', 'x'.repeat(5000))) === 'ok', 'ai : écriture sous le quota acceptée');
  ok(await code(A.create('gros', 'x'.repeat(5000))) === 'ok', 'ai : licence ARCHIINDUS active → quota de 50 Mo');
  ok(await code(A.create('trop', 'x'.repeat(20000))) === 'permission-denied', 'ai : quota de 50 Mo dépassé refusé');

  /* ---- partage par email (email vérifié requis), dossiers, bibliothèque */
  ok(await code(A.share(pid, 'bob@ex.fr', 'view')) === 'ok', 'ai : partage d\'un projet par email');
  ok(await code(B.open(pid)) === 'ok', 'ai : projet partagé lisible par l\'invité');
  ok(await code(cloud(ctx('bob', 'bob@ex.fr', false), 'bob', 'bob@ex.fr', 'ai').open(pid)) === 'permission-denied', 'ai : invité à l\'email non vérifié refusé');
  ok(await code(B.save(pid, d2 + 'z', byteLen(d2), 'alice')) === 'permission-denied', 'ai : invité en lecture seule ne peut pas enregistrer');
  let fid = null;
  ok(await code(A.folder('Dossier').then((x) => { fid = x; })) === 'ok', 'ai : création d\'un dossier');
  ok(await code(B.lib('{}')) === 'ok' && await code(ctx('alice', 'alice@ex.fr').collection('aiLibrary').doc('bob').get()) === 'permission-denied', 'ai : bibliothèque personnelle privée');
  void fid;

  /* ---- non-régression : ARCHIPLAN (ap*) et ARCHITRAFIC (at*) dans le même fichier */
  for (const P of ['ap', 'at']) {
    const X = cloud(ctx('bob', 'bob@ex.fr'), 'bob', 'bob@ex.fr', P);
    let p2 = null;
    ok(await code(X.create('Projet', '{"els":[]}').then((x) => { p2 = x; })) === 'ok', `${P} : création d'un projet (bloc présent et inchangé)`);
    ok(await code(cloud(ctx('alice', 'alice@ex.fr'), 'alice', 'alice@ex.fr', P).open(p2)) === 'permission-denied', `${P} : projet privé illisible par un autre compte`);
  }
  await env.cleanup();
  console.log(`\n${checks} contrôles, ${fails.length} échec(s)`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
