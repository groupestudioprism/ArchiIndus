/* Couche de données du cloud ArchiIndus (Firestore, SDK « compat »), sans interface : voir firebase/firestore.ai.rules.proposed.
   Schéma, sur le modèle d'ArchiPlan (préfixe ai au lieu de ap) :
     aiProjects/{id}               {ownerUid, name, size, createdAt, updatedAt}
     aiProjects/{id}/content/main  {data (JSON du projet, en chaîne), updatedAt}
     aiUsage/{uid}                 {bytes, lastPid, updatedAt} : octets utilisés, mis à jour dans le MÊME LOT que la fiche.
   Les règles Firestore imposent droits et quota côté serveur. Tant que le bloc ai* n'est pas publié dans le projet commun
   (archivision-studioprism), toute écriture est refusée : l'application l'indique (voir CloudStore.explain).
   Ce fichier ne dépend ni du DOM ni de Doc : il peut être chargé tel quel dans le test des règles (tests/rules/). */
const CloudStore = (() => {
  const MAX_DATA = 950000;                 /* octets (UTF-8) : plafond du contenu d'un projet ; les règles acceptent 1 000 000 */
  const byteLen = (s) => new TextEncoder().encode(s || '').length;
  let db = null, uid = '';

  const FV = () => firebase.firestore.FieldValue;
  const ts = () => FV().serverTimestamp();
  const P = (pid) => db.collection('aiProjects').doc(pid);
  const C = (pid) => P(pid).collection('content').doc('main');
  const U = (u) => db.collection('aiUsage').doc(u);
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
  const meta = (d) => { const x = d.data(); return { id: d.id, name: x.name, size: x.size || 0, createdAt: ms(x.createdAt), updatedAt: ms(x.updatedAt) }; };
  const need = () => { if (!db || !uid) throw { code: 'app/not-signed-in' }; };
  /* Le refus d'une écriture peut venir des droits, du quota, ou de règles non publiées : on ne sait pas lequel. */
  /* Lire un projet absent est refusé par les règles (resource nul) : même résultat que « introuvable ou pas à vous ». */
  const missing = (e) => { if (e && e.code === 'permission-denied') return { exists: false }; throw e; };
  const wrap = (e) => { throw e && e.code === 'permission-denied' ? { code: 'app/quota-or-denied' } : e; };

  return {
    MAX_DATA, byteLen,
    bind(firestore, userId) { db = firestore; uid = userId || ''; },
    unbind() { db = null; uid = ''; },

    /* Compteur de l'utilisateur ; s'il n'existe pas, il est créé (somme des projets existants), comme ArchiPlan. */
    async usage(projects) {
      need();
      const s = await U(uid).get();
      if (s.exists) return { bytes: s.data().bytes || 0 };
      const bytes = (projects || []).reduce((a, p) => a + (p.size || 0), 0);
      try { await U(uid).set({ bytes, lastPid: '', updatedAt: ts() }); } catch (e) { wrap(e); }
      return { bytes };
    },

    /* Lecture seule du compteur (0 s'il n'existe pas encore) : n'écrit jamais. */
    async usageBytes() {
      need();
      const s = await U(uid).get();
      return s.exists ? (s.data().bytes || 0) : 0;
    },

    async list() {
      need();
      const s = await db.collection('aiProjects').where('ownerUid', '==', uid).get();
      return s.docs.map(meta).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async open(pid) {
      need();
      const p = await P(pid).get().catch(missing);
      if (!p.exists) throw { code: 'app/not-found' };
      const c = await C(pid).get().catch(missing);
      if (!c.exists) throw { code: 'app/not-found' };
      return { meta: meta(p), data: c.data().data };
    },

    async create(name, data) {
      need();
      const size = byteLen(data);
      if (size > MAX_DATA) throw { code: 'app/too-big' };
      await this.usage();
      const ref = db.collection('aiProjects').doc();
      const b = db.batch();
      b.set(ref, { ownerUid: uid, name: String(name).slice(0, 120) || 'Projet', size, createdAt: ts(), updatedAt: ts() });
      b.set(C(ref.id), { data, updatedAt: ts() });
      b.set(U(uid), { bytes: FV().increment(size), lastPid: ref.id, updatedAt: ts() }, { merge: true });
      try { await b.commit(); } catch (e) { wrap(e); }
      return ref.id;
    },

    /* prevSize : taille enregistrée sur la fiche avant cette sauvegarde. */
    async save(pid, name, data, prevSize) {
      need();
      const size = byteLen(data);
      if (size > MAX_DATA) throw { code: 'app/too-big' };
      const delta = size - (prevSize || 0);
      const b = db.batch();
      b.set(C(pid), { data, updatedAt: ts() });
      b.update(P(pid), { name: String(name).slice(0, 120) || 'Projet', size, updatedAt: ts() });
      if (delta !== 0) b.set(U(uid), { bytes: FV().increment(delta), lastPid: pid, updatedAt: ts() }, { merge: true });
      try { await b.commit(); } catch (e) { wrap(e); }
    },

    async remove(pid) {
      need();
      const pd = await P(pid).get().catch(missing);
      if (!pd.exists) return;
      const size = pd.data().size || 0;
      const us = await U(uid).get().catch(() => null);
      const b = db.batch();
      b.delete(C(pid));
      b.delete(P(pid));
      if (us && us.exists && size > 0 && (us.data().bytes || 0) >= size) b.update(U(uid), { bytes: FV().increment(-size), lastPid: pid, updatedAt: ts() });
      try { await b.commit(); } catch (e) { wrap(e); }
    },

    /* Message en français pour une erreur du cloud. */
    explain(e) {
      const c = e && e.code;
      return c === 'app/not-signed-in' ? 'Connectez-vous à votre compte Studio Prism pour utiliser le cloud.'
        : c === 'app/too-big' ? 'Projet trop volumineux pour le cloud (950 Ko maximum). Utilisez « Enregistrer » pour garder un fichier.'
        : c === 'app/not-found' ? 'Projet introuvable ou inaccessible avec ce compte.'
        : c === 'app/quota-or-denied' || c === 'permission-denied' ? 'Enregistrement cloud refusé : espace plein, droits insuffisants, ou le service cloud ArchiIndus n\'est pas encore activé sur le serveur.'
        : c === 'unavailable' || c === 'auth/network-request-failed' ? 'Connexion impossible. Vérifiez votre réseau, puis réessayez.'
        : 'Erreur du cloud : ' + (e && e.message ? e.message : String(c || e));
    },
  };
})();
