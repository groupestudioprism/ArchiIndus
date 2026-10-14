/* Test des règles Firestore ai* dans l'émulateur, avec le vrai CloudStore (src/engine/79-cloudstore.js).
   Lancer : npm install puis npm test (Java requis). Le fichier de règles testé = règles publiées + bloc proposé (build-rules.js).
   Limites : ce test ne prouve pas que les règles PUBLIÉES sont identiques à la copie utilisée (à comparer avant toute publication),
   ni le comportement du site et d'ArchiPlan au-delà des quelques contrôles de non-régression en fin de fichier. */
const fs = require('fs'), path = require('path');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const CODE = fs.readFileSync(path.resolve(__dirname, '../../src/engine/79-cloudstore.js'), 'utf8');
let checks = 0; const fails = [];
const ok = (c, m) => { checks++; if (!c) { fails.push(m); console.log('ÉCHEC :', m); } };

function storeFor(db, uid) {
  /* Même « realm » que le SDK (un contexte vm produirait des objets que Firestore refuse). Chaque appel évalue le fichier à neuf : état indépendant. */
  const store = new Function('firebase', 'TextEncoder', CODE + '\nreturn CloudStore;')(firebase, TextEncoder);
  store.bind(db, uid);
  return store;
}
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e && e.code ? e.code : String(e); } };
const denied = (c) => c === 'permission-denied' || c === 'app/quota-or-denied';
const proj = (n) => JSON.stringify({ schemaVersion: 1, name: 'p', pad: 'x'.repeat(n) });

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-archiindus',
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, '.generated/firestore.rules'), 'utf8') },
  });
  await env.clearFirestore();
  const prof = (extra = {}) => ({ firstName: 'T', lastName: 'T', email: 't@example.org', accountKind: 'individual', subscription: 'free', role: 'user', status: 'active', ...extra });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await d.doc('users/alice').set(prof());
    await d.doc('users/bob').set(prof());
    await d.doc('users/carol').set(prof({ status: 'suspended' }));
    await d.doc('users/root').set(prof({ role: 'admin' }));
    await d.doc('licenses/alice_archiindus').set({ userId: 'alice', productId: 'archiindus', licenseType: 'pro', status: 'active', expiresAt: null });
    await d.doc('licenses/bob_archiplan').set({ userId: 'bob', productId: 'archiplan', licenseType: 'pro', status: 'active', expiresAt: null });
  });
  const dbOf = (uid) => env.authenticatedContext(uid).firestore();
  const A = storeFor(dbOf('alice'), 'alice'), B = storeFor(dbOf('bob'), 'bob'), C = storeFor(dbOf('carol'), 'carol');
  const usageOf = async (uid) => { let v = null; await env.withSecurityRulesDisabled(async (c) => { const d = (await c.firestore().doc('aiUsage/' + uid).get()).data(); v = d ? d.bytes : null; }); return v; };
  const raw = async (uid, fn) => { const db = dbOf(uid); return code(fn(db)); };

  // --- cycle de vie d'un projet (titulaire)
  const d1 = proj(1000), s1 = A.byteLen(d1);
  const pid = await A.create('Plan A', d1);
  ok(typeof pid === 'string' && pid.length > 5, 'création du projet');
  ok(await usageOf('alice') === s1, `compteur = taille du projet (${await usageOf('alice')} / ${s1})`);
  const list = await A.list(); ok(list.length === 1 && list[0].id === pid && list[0].size === s1 && list[0].name === 'Plan A', 'liste des projets');
  const op = await A.open(pid); ok(op.data === d1 && op.meta.size === s1, 'ouverture : contenu identique');
  const d2 = proj(5000), s2 = A.byteLen(d2);
  ok(await code(A.save(pid, 'Plan A v2', d2, s1)) === 'ok', 'sauvegarde plus grande');
  ok(await usageOf('alice') === s2, 'compteur après sauvegarde');
  ok((await A.open(pid)).data === d2 && (await A.list())[0].name === 'Plan A v2', 'contenu et nom mis à jour');
  ok(await code(A.save(pid, 'Plan A v3', d2, s2)) === 'ok' && await usageOf('alice') === s2, 'renommage à taille égale : compteur inchangé');
  const d3 = proj(200), s3 = A.byteLen(d3);
  ok(await code(A.save(pid, 'Plan A v4', d3, s2)) === 'ok' && await usageOf('alice') === s3, 'sauvegarde plus petite : compteur diminue');
  ok(await code(A.remove(pid)) === 'ok' && await usageOf('alice') === 0 && (await A.list()).length === 0, 'suppression : projet retiré, compteur à zéro');
  ok(await code(A.remove(pid)) === 'ok', 'suppression d\'un projet déjà supprimé : sans erreur');

  // --- confidentialité et intégrité
  const pa = await A.create('Privé', proj(300));
  ok(['app/not-found', 'permission-denied'].includes(await code(B.open(pa))), 'un autre compte ne peut pas ouvrir un projet');
  ok(await raw('bob', (db) => db.collection('aiProjects').where('ownerUid', '==', 'alice').get()) === 'permission-denied', 'un autre compte ne peut pas lister les projets d\'autrui');
  ok(await raw('bob', (db) => db.doc('aiProjects/' + pa + '/content/main').get()) === 'permission-denied', 'contenu illisible par un autre compte');
  ok(await raw('bob', (db) => db.doc('aiProjects/' + pa).get()) === 'permission-denied', 'fiche de projet illisible par un autre compte');
  ok(await raw('bob', (db) => {
    const FV = firebase.firestore.FieldValue, b = db.batch(), r = db.collection('aiProjects').doc();
    b.set(r, { ownerUid: 'bob', name: 'sans compteur', size: 5000, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    b.set(r.collection('content').doc('main'), { data: 'z'.repeat(5000), updatedAt: FV.serverTimestamp() });
    return b.commit();
  }) === 'permission-denied', 'création d\'un projet sans mise à jour du compteur refusée');
  const anon = env.unauthenticatedContext().firestore();
  ok(await code(anon.doc('aiProjects/' + pa).get()) === 'permission-denied', 'anonyme : lecture refusée');
  ok(await raw('bob', (db) => { const b = db.batch(); const r = db.collection('aiProjects').doc(); b.set(r, { ownerUid: 'alice', name: 'x', size: 1, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); return b.commit(); }) === 'permission-denied', 'création au nom d\'un autre propriétaire refusée');
  ok(await raw('bob', (db) => { const b = db.batch(); const FV = firebase.firestore.FieldValue; b.update(db.doc('aiProjects/' + pa), { name: 'piraté', updatedAt: FV.serverTimestamp() }); return b.commit(); }) === 'permission-denied', 'modification par un autre compte refusée');
  ok(await raw('bob', (db) => db.doc('aiProjects/' + pa).delete()) === 'permission-denied', 'suppression par un autre compte refusée');
  ok(denied(await code(C.create('Suspendu', proj(100)))), 'compte désactivé : création refusée');
  const FVx = firebase.firestore.FieldValue;
  // compteur truqué : baisse sans suppression de projet
  ok(await raw('alice', (db) => db.doc('aiUsage/alice').set({ bytes: 0, lastPid: pa, updatedAt: FVx.serverTimestamp() })) === 'permission-denied', 'compteur truqué à la baisse refusé');
  // taille déclarée sans mise à jour du compteur
  ok(await raw('alice', (db) => { const b = db.batch(); b.update(db.doc('aiProjects/' + pa), { size: 900000, updatedAt: FVx.serverTimestamp() }); return b.commit(); }) === 'permission-denied', 'changement de taille sans compteur refusé');
  // contenu plus grand que la taille déclarée
  ok(await raw('alice', (db) => { const b = db.batch(); b.set(db.doc('aiProjects/' + pa + '/content/main'), { data: 'y'.repeat(50000), updatedAt: FVx.serverTimestamp() }); return b.commit(); }) === 'permission-denied', 'contenu supérieur à la taille déclarée refusé');
  // champs inconnus
  ok(await raw('alice', (db) => { const b = db.batch(); b.update(db.doc('aiProjects/' + pa), { admin: true, updatedAt: FVx.serverTimestamp() }); return b.commit(); }) === 'permission-denied', 'champ inconnu sur la fiche refusé');
  // changement de propriétaire
  ok(await raw('alice', (db) => { const b = db.batch(); b.update(db.doc('aiProjects/' + pa), { ownerUid: 'bob', updatedAt: FVx.serverTimestamp() }); return b.commit(); }) === 'permission-denied', 'transfert de propriété refusé');
  ok((await A.list()).length === 1 && await usageOf('alice') === A.byteLen(proj(300)), 'état intact après les tentatives');

  // --- quota : 10 Mo sans licence ArchiIndus (licence ArchiPlan sans effet), 50 Mo avec licence
  const big = proj(949000), sb = B.byteLen(big);
  let made = 0, last = 'ok';
  for (let i = 0; i < 12 && last === 'ok'; i++) { last = await code(B.create('Gros ' + i, big)); if (last === 'ok') made++; }
  ok(made === Math.floor(10000000 / sb) && denied(last), `sans licence : ${made} projets (${sb} o) puis refus (${last}), plafond 10 Mo`);
  ok(await usageOf('bob') === made * sb, 'compteur de bob cohérent');
  let madeA = 0; for (let i = 0; i < 12; i++) { if (await code(A.create('Gros ' + i, big)) === 'ok') madeA++; }
  ok(madeA === 12, `licence ArchiIndus active : ${madeA}/12 projets au-delà de 10 Mo`);
  // une baisse reste permise au-delà du quota
  const bl = await B.list();
  ok(await code(B.remove(bl[0].id)) === 'ok' && await usageOf('bob') === (made - 1) * sb, 'suppression possible quand le quota est atteint');

  // --- administrateur : lecture de la liste d'autrui (comme ArchiPlan)
  const R = storeFor(dbOf('root'), 'root');
  ok(await raw('root', (db) => db.collection('aiProjects').where('ownerUid', '==', 'bob').get()) === 'ok', 'administrateur : liste des projets d\'un compte');

  // --- non-régression minimale sur le fichier de règles commun
  ok(await raw('alice', (db) => db.doc('users/alice').get()) === 'ok', 'non-régression : lecture de son propre profil');
  ok(await raw('alice', (db) => db.doc('apUsage/alice').set({ bytes: 0, lastPid: '', updatedAt: FVx.serverTimestamp() })) === 'ok', 'non-régression : première création du compteur ArchiPlan');
  ok(await raw('alice', (db) => db.doc('licenses/alice_archiindus').set({ userId: 'alice', productId: 'archiindus', licenseType: 'pro', status: 'active', expiresAt: null })) !== 'ok', 'non-régression : un utilisateur ne peut pas s\'attribuer une licence');

  await env.cleanup();
  console.log(`\n${checks} contrôles, ${fails.length} échec(s)`);
  fails.forEach((f) => console.log(' -', f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Erreur du test :', e); process.exit(2); });
