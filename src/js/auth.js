(() => {
'use strict';
/* =====================================================================
   Compte Studio Prism — un seul compte pour ARCHIINDUS, Archi Vision et les prochaines apps.
   FIREBASE_CONFIG = null  → mode démo : comptes enregistrés dans ce navigateur, emails simulés.
   Coller ici la configuration web du projet Firebase « Studio Prism » pour activer les vrais comptes.
   La page doit alors être hébergée sur un domaine autorisé dans Firebase (Firebase Hosting, par ex.).
   ===================================================================== */
const FIREBASE_CONFIG = null;
const FIREBASE_VERSION = '10.12.2';
const APP_ID = 'archiindus';
/* Licence : document licenses/{uid}_archiindus du site Studio Prism (ajouté par un administrateur depuis Administration → Utilisateurs).
   Sans licence active (statut « active » et non expirée) : offre gratuite (cloud 10 Mo, partage, tous les outils ; exports réservés aux licences).
   Un administrateur a tous les droits. */
const LICENSE_PRODUCT = 'archiindus';
const SITE_URL = 'https://groupestudioprism.github.io/Studio-Prism/';
const OFFERS_URL = SITE_URL + '#/produits/' + LICENSE_PRODUCT;
const ACCOUNT_URL = SITE_URL + '#/compte';
const DELETE_URL = SITE_URL + 'compte-suppression.html';
const LIC_LABEL = {free:'Gratuite', pro:'Pro', pro_entreprise:'Pro Entreprise', trial:'Essai', demo:'Démo', education:'Éducation', standard:'Standard'};
const licLabel = t => LIC_LABEL[t] || String(t || '—').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
window.SPAccess = Object.freeze({level:'pending', canSave:false, canExport:false});
const PIN_LEN = 6, PIN_TRIES = 5;

const $a = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} },
};
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const randB64 = n => b64(crypto.getRandomValues(new Uint8Array(n)));
const randId = p => p + randB64(9).replace(/[^a-z0-9]/gi, '').slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pbkdf2(secret, saltB64, iter = 150000){
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:unb64(saltB64), iterations:iter}, key, 256);
  return b64(bits);
}

/* Profil mémorisé sur l'appareil : l'écran du code PIN s'affiche sans attendre le réseau ; le profil est revérifié en arrière-plan. */
const profCache = {
  key: uid => 'sp.prof.' + uid,
  get(uid){ return store.get(this.key(uid)); },
  set(uid, v){ store.set(this.key(uid), {...(this.get(uid) || {}), ...v, at:Date.now()}); },
};

/* ---------- Mode démo : même interface que Firebase, données dans ce navigateur ---------- */
const DemoAuth = {
  mode:'demo', resetMode:'code', canGoogle:false,
  users(){ return store.get('sp.demo.users') || {}; },
  norm(u){ return u ? {uid:u.uid, email:u.email, firstName:u.firstName, lastName:u.lastName, verified:true} : null; },
  async init(){ await sleep(120); const s = store.get('sp.demo.session'); return this.norm(s && Object.values(this.users()).find(x => x.uid === s.uid)); },
  async signIn(email, pw){
    await sleep(300); const u = this.users()[email.trim().toLowerCase()];
    if (!u || await pbkdf2(pw, u.salt) !== u.pw) throw {code:'auth/invalid-credential'};
    store.set('sp.demo.session', {uid:u.uid}); return this.norm(u);
  },
  async signUp({firstName, lastName, email, password}){
    await sleep(300); const users = this.users(), k = email.trim().toLowerCase();
    if (users[k]) throw {code:'auth/email-already-in-use'};
    const salt = randB64(16);
    users[k] = {uid:randId('demo_'), email:email.trim(), firstName, lastName, salt, pw:await pbkdf2(password, salt), createdAt:Date.now()};
    store.set('sp.demo.users', users); store.set('sp.demo.session', {uid:users[k].uid});
    const p = store.get('sp.demo.profiles') || {}; p[users[k].uid] = {firstName, lastName, apps:{[APP_ID]:true}}; store.set('sp.demo.profiles', p);
    return this.norm(users[k]);
  },
  async sendReset(email){
    await sleep(300); const k = email.trim().toLowerCase();
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    const r = store.get('sp.demo.resets') || {}; r[k] = {code, exp:Date.now() + 15*60e3}; store.set('sp.demo.resets', r);
    return {mode:'code', code, exists:!!this.users()[k]};
  },
  async confirmReset(email, code, pw){
    await sleep(300); const k = email.trim().toLowerCase(), r = store.get('sp.demo.resets') || {};
    if (!r[k] || r[k].code !== code.trim() || r[k].exp < Date.now()) throw {code:'auth/invalid-action-code'};
    const users = this.users(); if (!users[k]) throw {code:'auth/invalid-action-code'};
    users[k].salt = randB64(16); users[k].pw = await pbkdf2(pw, users[k].salt); store.set('sp.demo.users', users);
    delete r[k]; store.set('sp.demo.resets', r);
  },
  async signOut(){ store.del('sp.demo.session'); },
  async reload(u){ return u; },
  async resendVerification(){},
  async getProfile(u){ return (store.get('sp.demo.profiles') || {})[u.uid] || null; },
  async getPin(uid){ await sleep(80); return (store.get('sp.demo.pins') || {})[uid] || null; },
  async setPin(uid, r){ await sleep(80); const a = store.get('sp.demo.pins') || {}; a[uid] = r; store.set('sp.demo.pins', a); },
  // Démo : licence fictive active ; un email contenant « decouverte » montre le mode découverte.
  async getAccess(u){
    await sleep(200); const info = {accountKind:'individual', subscription:'free', role:'user', companyName:''};
    const keyed = (store.get('sp.demo.keys') || {})[u.uid];
    if (/decouverte/i.test(u.email || '') && !keyed) return {level:'discovery', info, license:null};
    return {level:'licensed', info, license:{type:keyed ? 'pro' : 'demo', status:'active', expiresAt:null, expired:false}};
  },
  // Démo : toute clé au bon format commençant par ARCH active une licence Pro d'un an.
  async redeemKey(u, raw){
    await sleep(300); const n = normKey(raw); if (n.length < 12 || n.length > 40) throw {code:'app/key-format'}; if (!n.startsWith('ARCH')) throw {code:'app/key-unknown'};
    const all = store.get('sp.demo.keys') || {}; all[u.uid] = n; store.set('sp.demo.keys', all); return {productName:'ARCHIINDUS', licenseType:'pro', durationDays:365, orgName:''};
  },
  async findClient(email){ await sleep(250); const c = (store.get('sp.demo.clients') || {})[email.trim().toLowerCase()]; return c ? {...c} : null; },
  async requestCompany(){ throw {code:'app/demo-only'}; },
  async saveClient(u, fiche, existingId){
    await sleep(300); const all = store.get('sp.demo.clients') || {}, k = u.email.toLowerCase();
    const id = existingId || randId('cli_');
    all[k] = {...(all[k] || {}), ...fiche, id, uid:u.uid, emailLower:k, updatedAt:Date.now()}; store.set('sp.demo.clients', all);
    const p = store.get('sp.demo.profiles') || {};
    p[u.uid] = {...(p[u.uid] || {}), clientId:id, clientDone:true, firstName:fiche.firstName, lastName:fiche.lastName, apps:{...(p[u.uid]?.apps || {}), [APP_ID]:true}};
    store.set('sp.demo.profiles', p); return id;
  },
};
// Fiche d'exemple (fictive) : créez un compte avec cet email pour voir le rattachement à une fiche existante
if (!store.get('sp.demo.clients')) store.set('sp.demo.clients', {'client.exemple@studioprism.fr':{id:'cli_exemple', emailLower:'client.exemple@studioprism.fr', firstName:'Camille', lastName:'Exemple', company:'Atelier Exemple (fiche fictive)', profile:'Architecte ou maître d\'œuvre', phone:'06 00 00 00 00', address:'1 rue du Plan', postalCode:'75000', city:'Paris', country:'France', source:'devis'}});

/* ---------- Firebase : même projet et mêmes règles que le site Studio Prism (users/{uid}) + fiche ARCHIINDUS (clientProfiles/{uid}) ---------- */
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej({code:'auth/network-request-failed'}); document.head.appendChild(s); }); }
const FirebaseAuth = {
  mode:'firebase', resetMode:'link', canGoogle:false,
  async boot(){
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    // app d'abord (les deux autres en dépendent), puis Authentication et Firestore en parallèle (préchargés dans <head>)
    await loadScript(base + 'firebase-app-compat.js');
    await Promise.all([loadScript(base + 'firebase-auth-compat.js'), loadScript(base + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(FIREBASE_CONFIG);
    this.fa = firebase.auth(); this.fa.languageCode = 'fr';
    this.fa.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});   // session gardée après fermeture du navigateur
    this.db = firebase.firestore();
    // Réseaux d'entreprise, antivirus ou proxys qui bloquent le flux temps réel : bascule automatique (évite les attentes de plusieurs minutes)
    try { this.db.settings({experimentalAutoDetectLongPolling:true, merge:true}); } catch(e){}
    this.ts = () => firebase.firestore.FieldValue.serverTimestamp();
  },
  norm(u){ if (!u) return null; const [f, ...l] = (u.displayName || '').split(' '); return {uid:u.uid, email:u.email, firstName:f || '', lastName:l.join(' '), verified:u.emailVerified}; },
  userRef(uid){ return this.db.collection('users').doc(uid); },
  // Profil par défaut, identique à celui du site (js/auth.js) : Particulier / free / user / active.
  defaultProfile(u, extra = {}){
    const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
    let words = (u.displayName || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) words = (u.email || '').split('@')[0].split(/[._+-]+/).filter(Boolean).map(cap);
    return {firstName:(extra.firstName || words[0] || 'Utilisateur').slice(0, 80), lastName:(extra.lastName ?? words.slice(1).join(' ')).slice(0, 80),
      email:u.email, accountKind:'individual', subscription:'free', role:'user', status:'active',
      createdAt:this.ts(), updatedAt:this.ts(), lastLogin:this.ts(), ...(extra.terms ? {termsAcceptedAt:this.ts()} : {})};
  },
  // Lit (ou crée) le profil Studio Prism ; refuse un compte désactivé, comme le site.
  async readProfile(u){
    const ref = this.userRef(u.uid); let snap = await ref.get(); this.existedBefore = snap.exists;
    if (!snap.exists && await this.wasDeleted(u)){ await this.purgeDeleted(u); throw {code:'app/account-deleted'}; }
    // profil absent : jamais recréé automatiquement (un compte supprimé ne doit pas « revenir » tout seul) ; seule l'inscription le crée
    if (!snap.exists){ await this.fa.signOut().catch(() => {}); throw {code:'app/account-deleted'}; }
    const d = snap.data();
    if (d.status === 'suspended'){ await this.fa.signOut(); throw {code:'app/suspended'}; }
    if (d.status === 'pending'){ await this.fa.signOut(); throw {code:'app/pending'}; }   // compte Entreprise pas encore validé par Studio Prism
    if (d.status !== 'active') throw {code:'app/profile-invalid'};
    return d;
  },
  // Compte supprimé depuis l'administration (trace deletedAccounts/{uid}, écrite par le site) : le profil ne doit jamais être recréé.
  async wasDeleted(u){ try { return (await this.db.collection('deletedAccounts').doc(u.uid).get()).exists; } catch(e){ return false; } },
  // Sans serveur, l'administration ne peut pas supprimer le compte de connexion d'un autre : la personne le supprime elle-même ici, à sa
  // connexion (connexion récente exigée par Firebase). L'adresse email est ainsi libérée pour une nouvelle inscription, comme sur le site.
  async purgeDeleted(u){ try { await u.delete(); } catch(e){ await this.fa.signOut().catch(() => {}); } },
  async after(user){
    const d = await this.readProfile(user);
    this.userRef(user.uid).update({lastLogin:this.ts()}).catch(() => {});
    return {...this.norm(user), firstName:d.firstName || '', lastName:d.lastName || ''};
  },
  // Ouverture rapide : la session locale suffit pour afficher l'écran du code PIN ; le profil est vérifié en arrière-plan (this.verifying).
  async init(){
    await withTimeout(this.boot(), 20000);
    const u = await withTimeout(new Promise(res => { const un = this.fa.onAuthStateChanged(x => { un(); res(x); }); }), 12000);
    if (!u) return null;
    const n = this.norm(u), c = profCache.get(u.uid) || {};
    this.verifying = withTimeout(this.after(u), 15000);
    this.verifying.then(v => profCache.set(u.uid, {firstName:v.firstName, lastName:v.lastName})).catch(() => {});
    return {...n, firstName:c.firstName || n.firstName, lastName:c.lastName ?? n.lastName};
  },
  // Code PIN du compte (haché PBKDF2, jamais en clair) : userSecrets/{uid}, lisible par le seul titulaire.
  async getPin(uid){ const s = await this.db.collection('userSecrets').doc(uid).get(); return s.exists ? s.data() : null; },
  async setPin(uid, r){ await this.db.collection('userSecrets').doc(uid).set({pinHash:r.pinHash, pinSalt:r.pinSalt, pinIter:r.pinIter, updatedAt:this.ts()}); },
  async signIn(e, p){ const c = await this.fa.signInWithEmailAndPassword(e.trim(), p); try { return await this.after(c.user); } catch(err){ if (err.code !== 'app/suspended') await this.fa.signOut().catch(() => {}); throw err; } },
  async signInGoogle(){ const c = await this.fa.signInWithPopup(new firebase.auth.GoogleAuthProvider()); return this.after(c.user); },
  async signUp({firstName, lastName, email, password, kind, company}){
    let c, reused = false;
    try { c = await this.fa.createUserWithEmailAndPassword(email.trim(), password); }
    catch(err){
      if (err?.code !== 'auth/email-already-in-use') throw err;
      // Adresse encore prise par un compte supprimé par l'administration : avec le bon mot de passe, on libère l'adresse et on recrée.
      let old = null; try { old = (await this.fa.signInWithEmailAndPassword(email.trim(), password)).user; } catch(e){ throw err; }
      // profil absent = compte supprimé (par l'administration ou par la personne), avec ou sans trace de suppression
      const gone = !(await this.userRef(old.uid).get().catch(() => null))?.exists;
      if (!gone){ await this.fa.signOut().catch(() => {}); throw err; }
      // Firebase refuse parfois de supprimer l'ancien compte de connexion : on le reprend alors avec un profil neuf (même compte).
      try { await old.delete(); c = await this.fa.createUserWithEmailAndPassword(email.trim(), password); }
      catch(e2){ c = {user:old}; reused = true; }
    }
    try {
      const b = this.db.batch(), prof = this.defaultProfile(c.user, {firstName, lastName, terms:true});
      if (kind === 'company' && company){
        // compte Entreprise : fiche entreprise + profil « en attente » (validé à la main par l'administration, comme sur le site)
        const cref = this.db.collection('companies').doc();
        b.set(cref, {name:company.name.slice(0, 120), email:company.email, ownerUid:c.user.uid, userRange:company.range, userLimit:company.limit, subscription:'free', createdAt:this.ts(), updatedAt:this.ts()});
        Object.assign(prof, {accountKind:'company', status:'pending', companyId:cref.id, companyName:company.name.slice(0, 120), companyEmail:company.email, companyUserRange:company.range, companyUserLimit:company.limit});
        if (company.job) prof.jobTitle = company.job.slice(0, 80);
      }
      b.set(this.userRef(c.user.uid), prof);
      if (reused) b.delete(this.db.collection('deletedAccounts').doc(c.user.uid));   // compte repris : la trace de suppression disparaît
      await b.commit();
    } catch(err){ if (reused) await this.fa.signOut().catch(() => {}); else await c.user.delete().catch(() => this.fa.signOut().catch(() => {})); throw err; }  // pas de compte à moitié créé
    c.user.updateProfile({displayName:`${firstName} ${lastName}`.trim()}).catch(() => {});
    c.user.sendEmailVerification().catch(() => {});
    this.existedBefore = false;
    if (kind === 'company'){ await this.fa.signOut().catch(() => {}); throw {code:'app/pending-signup'}; }   // pas de connexion avant la validation
    return {...this.norm(c.user), firstName, lastName, verified:true};
  },
  async sendReset(email){ try { await this.fa.sendPasswordResetEmail(email.trim()); } catch(e){ if (e?.code !== 'auth/user-not-found') throw e; } return {mode:'link'}; },
  async signOut(){ await this.fa.signOut(); },
  async reload(){ await this.fa.currentUser.reload(); return this.norm(this.fa.currentUser); },
  async resendVerification(){ await this.fa.currentUser.sendEmailVerification(); },
  // Droits ARCHIINDUS : administrateur actif → tout ; sinon licence licenses/{uid}_archiindus active et non expirée.
  async getAccess(u){
    const p = await this.liveProfile(u);
    const info = {accountKind:p.accountKind || 'individual', subscription:p.subscription || 'free', role:p.role || 'user', companyName:p.companyName || '', orgName:p.orgName || ''};
    try { const f = await this.db.collection('clientProfiles').doc(u.uid).get(); info.siret = f.exists ? (f.data().siret || '') : ''; } catch(e){ info.siret = ''; }
    let lic = null;
    try { const s = await this.db.collection('licenses').doc(`${u.uid}_${LICENSE_PRODUCT}`).get(); lic = s.exists ? s.data() : null; }
    catch(e){ if (e?.code !== 'permission-denied') throw e; }   // pas de licence : les règles refusent la lecture d'un document absent
    const exp = lic?.expiresAt?.toDate ? lic.expiresAt.toDate() : null, now = new Date();
    const license = lic ? {type:lic.licenseType, status:lic.status, expiresAt:exp ? exp.getTime() : null, expired:!!exp && exp <= now} : null;
    if (p.role === 'admin' && p.status === 'active') return {level:'admin', info, license};
    return {level: license && license.status === 'active' && !license.expired ? 'licensed' : 'discovery', info, license};
  },
  // Activation d'une clé de licence (même procédure que la page « Activer une clé » du site, vérifiée par les règles Firestore).
  async redeemKey(u, raw){
    const n = normKey(raw); if (n.length < 12 || n.length > 40) throw {code:'app/key-format'};
    const id = await sha256hex(n), kref = this.db.collection('licenseKeys').doc(id), ks = await kref.get();
    if (!ks.exists) throw {code:'app/key-unknown'};
    const k = ks.data();
    if (k.status === 'redeemed') throw {code:k.redeemedBy === u.uid ? 'app/key-mine' : 'app/key-used'};
    if (k.status !== 'available') throw {code:'app/key-revoked'};
    if (k.expiresAt && k.expiresAt.toMillis() < Date.now()) throw {code:'app/key-expired'};
    const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp, lref = this.db.collection('licenses').doc(`${u.uid}_${k.productId}`);
    let prev = null; try { const ls = await lref.get(); prev = ls.exists ? ls.data() : null; } catch(e){}
    const b = this.db.batch(), now = FV.serverTimestamp();
    b.update(kref, {status:'redeemed', redeemedBy:u.uid, redeemedEmail:String(u.email || '').toLowerCase(), redeemedAt:now, updatedAt:now});
    b.set(lref, {userId:u.uid, productId:k.productId, productName:k.productName, licenseType:k.licenseType, status:'active', activatedAt:now,
      expiresAt:k.expiresAt || (k.durationDays ? TS.fromMillis(Date.now() + k.durationDays * 864e5) : null), keyId:id, orgId:k.orgId || '',
      createdAt:prev?.createdAt || now, updatedAt:now});
    if (k.orgId) b.update(this.userRef(u.uid), {orgId:k.orgId, orgName:k.orgName, orgKeyId:id, orgRole:k.role || '', orgClass:k.classe || '', updatedAt:now});
    await b.commit(); return k;
  },
  // Profil Studio Prism encore valable ? Sinon le compte n'a plus rien à faire dans l'app (supprimé, désactivé, en attente).
  // Surveillance du profil pendant la session (suppression, désactivation, mise en attente par l'administration)
  watch(uid, cb){ try { return this.userRef(uid).onSnapshot(s => cb(s.exists ? s.data() : null), () => {}); } catch(e){ return () => {}; } },
  async liveProfile(u){
    const snap = await this.userRef(u.uid).get();
    if (!snap.exists){ if (await this.wasDeleted(u)){ await this.purgeDeleted(u); throw {code:'app/account-deleted'}; } throw {code:'app/profile-missing'}; }
    const d = snap.data();
    if (d.status === 'suspended') throw {code:'app/suspended'};
    if (d.status === 'pending') throw {code:'app/pending'};
    if (d.status !== 'active') throw {code:'app/profile-invalid'};
    return d;
  },
  async getProfile(u){
    const p = await this.liveProfile(u);
    let fiche = null; try { const s = await this.db.collection('clientProfiles').doc(u.uid).get(); fiche = s.exists ? s.data() : null; } catch(e){}
    return {firstName:p.firstName, lastName:p.lastName, clientDone:!!fiche, kind:p.accountKind || 'individual', companyName:p.companyName || ''};
  },
  // « Fiche déjà présente » = compte Studio Prism créé avant (sur le site) : on reprend ses informations.
  async findClient(){
    const uid = this.fa.currentUser.uid; const p = (await this.userRef(uid).get()).data() || {};
    let f = null; try { const s = await this.db.collection('clientProfiles').doc(uid).get(); f = s.exists ? s.data() : null; } catch(e){}
    if (!f && !this.existedBefore) return null;
    return {...(f || {}), firstName:p.firstName, lastName:p.lastName, company:f?.company || p.companyName || '', id:uid, uid:f ? uid : undefined};
  },
  // Particulier → Entreprise : fiche entreprise créée et compte remis « en attente » dans le même lot (validation par l'administration).
  async requestCompany(u, co){
    const cref = this.db.collection('companies').doc(), b = this.db.batch();
    b.set(cref, {name:co.name.slice(0, 120), email:co.email, ownerUid:u.uid, userRange:co.range, userLimit:co.limit, subscription:'free', createdAt:this.ts(), updatedAt:this.ts()});
    const up = {accountKind:'company', status:'pending', companyId:cref.id, companyName:co.name.slice(0, 120), companyEmail:co.email, companyUserRange:co.range, companyUserLimit:co.limit, updatedAt:this.ts()};
    if (co.job) up.jobTitle = co.job.slice(0, 80);
    b.update(this.userRef(u.uid), up);
    await b.commit();
  },
  async saveClient(u, fiche){
    const ref = this.db.collection('clientProfiles').doc(u.uid), snap = await ref.get();
    const keep = ['phone', 'profile', 'company', 'address', 'postalCode', 'city', 'country'];
    const data = {}; keep.forEach(k => data[k] = String(fiche[k] || '').slice(0, k === 'address' ? 200 : 120));
    data.siret = String(fiche.siret || '').replace(/\s/g, '').slice(0, 14);   // SIRET (facultatif) : usage commercial d'une licence Pro
    data.updatedAt = this.ts(); data.createdAt = snap.exists ? snap.data().createdAt : this.ts();
    await ref.set(data);
    const p = (await this.userRef(u.uid).get()).data() || {};
    if (p.firstName !== fiche.firstName || p.lastName !== fiche.lastName)
      await this.userRef(u.uid).update({firstName:fiche.firstName.slice(0, 80), lastName:fiche.lastName.slice(0, 80), updatedAt:this.ts()});
    return u.uid;
  },
};
const Auth = FIREBASE_CONFIG ? FirebaseAuth : DemoAuth;

const normKey = raw => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ERR = {
  'app/key-format':'Clé invalide : vérifiez la saisie (lettres et chiffres, au moins 12 caractères).', 'app/key-unknown':'Cette clé n\'existe pas. Vérifiez la saisie.',
  'app/key-used':'Cette clé a déjà été activée par un autre compte.', 'app/key-mine':'Cette clé est déjà activée sur votre compte.', 'app/key-revoked':'Cette clé a été désactivée. Contactez Studio Prism.', 'app/key-expired':'Cette clé a expiré.',
  'auth/invalid-credential':'Email ou mot de passe incorrect.',
  'auth/wrong-password':'Email ou mot de passe incorrect.',
  'auth/user-not-found':'Email ou mot de passe incorrect.',
  'auth/invalid-email':'Cette adresse email n\'est pas valide.',
  'auth/email-already-in-use':'Un compte Studio Prism existe déjà avec cet email. Connectez-vous, ou utilisez « Mot de passe oublié ». Si ce compte a été supprimé par Studio Prism, recréez-le avec le même mot de passe qu\'avant (ou choisissez-en un nouveau avec « Mot de passe oublié », puis recréez le compte).',
  'auth/weak-password':'Mot de passe trop faible : 8 caractères minimum, avec une lettre et un chiffre.',
  'auth/too-many-requests':'Trop de tentatives. Patientez quelques minutes, puis réessayez.',
  'auth/network-request-failed':'Connexion impossible. Vérifiez votre réseau, puis réessayez.',
  'auth/popup-closed-by-user':'Connexion Google annulée.',
  'auth/popup-blocked':'La fenêtre Google a été bloquée. Autorisez les fenêtres pour ce site, puis réessayez.',
  'auth/invalid-action-code':'Code incorrect ou expiré. Demandez un nouveau code.',
  'app/suspended':'Ce compte Studio Prism est désactivé. Contactez Studio Prism pour le faire réactiver.',
  'app/account-deleted':'Ce compte a été supprimé par Studio Prism. Pour revenir, créez un compte avec la même adresse email et le même mot de passe (mot de passe oublié ? Utilisez d\'abord « Mot de passe oublié »).',
  'app/profile-missing':'Ce compte Studio Prism n\'existe plus ou n\'a pas pu être créé. S\'il a été supprimé par Studio Prism, contactez-nous ; sinon réessayez dans un instant.',
  'app/demo-only':'Indisponible en mode démo.',
  'app/pending-signup':'Demande envoyée : votre compte Entreprise doit être vérifié par Studio Prism. Vous pourrez vous connecter dès sa validation.',
  'app/pending':'Votre compte entreprise est en attente de validation par Studio Prism. Vous pourrez vous connecter dès qu\'il sera validé.',
  'app/profile-invalid':'Votre profil Studio Prism est incomplet. Contactez Studio Prism.',
  'permission-denied':'Accès refusé. Vérifiez que votre email est bien confirmé.',
  'app/timeout':'Le service Studio Prism met trop de temps à répondre. Vérifiez votre connexion, puis réessayez.',
  'app/not-found':'Ce projet n\'existe plus.',
  'app/too-big':'Projet trop volumineux pour le cloud.',
  'app/engine':'Le moteur 3D n\'est pas encore chargé. Réessayez dans un instant.',
  'unavailable':'Connexion au cloud impossible pour le moment. Réessayez dans un instant.',
};
const errMsg = e => ERR[e?.code] || 'Une erreur est survenue. Réessayez dans un instant.';

/* ---------- Verrouillage de l'appareil : code PIN chiffré + biométrie (passkey) ---------- */
const Lock = {
  key: uid => 'sp.lock.' + uid,
  get(uid){ return store.get(this.key(uid)); },
  set(uid, v){ store.set(this.key(uid), v); },
  clear(uid){ store.del(this.key(uid)); },
  async setPin(uid, pin){ const salt = randB64(16); const prev = this.get(uid) || {}; const rec = {...prev, declined:false, salt, iter:200000, pin:await pbkdf2(pin, salt, 200000), failed:0}; delete rec.rpin; this.set(uid, rec); return rec; },
  async check(uid, pin){ const l = this.get(uid); if (!l?.pin) return false; const ok = await pbkdf2(pin, l.salt, l.iter) === l.pin; l.failed = ok ? 0 : (l.failed || 0) + 1; this.set(uid, l); return ok; },
};
const Bio = {
  label(){
    const ua = navigator.userAgent, p = navigator.platform || '';
    if (/iPhone|iPad|iPod/.test(ua) || (p === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'Face ID ou Touch ID';
    if (/Mac/.test(p)) return 'Touch ID';
    if (/Android/.test(ua)) return 'l\'empreinte ou la reconnaissance faciale';
    if (/Win/.test(p)) return 'Windows Hello';
    return 'la biométrie de l\'appareil';
  },
  async available(){ try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch(e){ return false; } },
  async enroll(u){
    const cred = await navigator.credentials.create({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)), rp:{name:'ARCHIINDUS · Studio Prism'},
      user:{id:enc.encode(u.uid).slice(0, 64), name:u.email, displayName:`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email},
      pubKeyCredParams:[{type:'public-key', alg:-7}, {type:'public-key', alg:-257}],
      authenticatorSelection:{authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged'},
      timeout:60000, attestation:'none'}});
    return b64(cred.rawId);
  },
  async verify(credId){
    const a = await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)), allowCredentials:[{type:'public-key', id:unb64(credId)}], userVerification:'required', timeout:60000}});
    return !!a;
  },
};

/* ---------- Interface ---------- */
const PROFILES = ['Particulier', 'Architecte ou maître d\'œuvre', 'Artisan ou entreprise du bâtiment', 'Bureau d\'études', 'Industrie ou atelier', 'Étudiant ou enseignant', 'Autre'];
let me = null, view = {}, current = '', pinBuf = '', pinHandler = null, pinBusy = false, bioOK = false;
const ctx = {onboarding:false, email:''};
const root = () => $a('#auth'), card = () => $a('#apCard');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const initials = () => ((me?.firstName || '').charAt(0) + (me?.lastName || '').charAt(0) || (me?.email || '?').charAt(0)).toUpperCase();
const emailOK = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const phoneOK = p => /^\+?[\d\s().-]{8,20}$/.test(p.trim()) && (p.match(/\d/g) || []).length >= 8;
const pwRules = p => ({len:p.length >= 8, let:/[A-Za-zÀ-ÿ]/.test(p), num:/\d/.test(p)});
const weakPin = p => /^(\d)\1+$/.test(p) || '01234567890'.includes(p) || '09876543210'.includes(p);

/* Particulier / entreprise. Un particulier utilise les apps pour un usage personnel, non commercial. Vendre des plans, des études
   ou des prestations réalisés avec les apps est un usage commercial : il demande une licence Pro avec un numéro SIRET (activité
   déclarée : micro-entrepreneur, profession libérale…) ou un compte Entreprise avec la licence Pro Entreprise. */
const TIERS = [['1', '1 compte', 1], ['2-10', '2 à 10 comptes', 10], ['11-25', '11 à 25 comptes', 25], ['26-50', '26 à 50 comptes', 50], ['51-100', '51 à 100 comptes', 100], ['100+', 'Plus de 100 comptes', null]];
const siretOK = raw => { const d = String(raw || '').replace(/\s/g, ''); if (!/^\d{14}$/.test(d)) return false; if (d.startsWith('356000000')) return true;
  let sum = 0; for (let i = 0; i < 14; i++){ let n = +d[13 - i]; if (i % 2){ n *= 2; if (n > 9) n -= 9; } sum += n; } return sum % 10 === 0; };
const PRO_TYPES = ['pro', 'pro_entreprise'];
function usageOf(a = access){
  const i = a.info || {}, l = a.license, lt = l && l.status === 'active' && !l.expired ? l.type : '';
  if (a.level === 'admin') return {commercial:true, label:'Usage commercial autorisé (compte administrateur).'};
  const ent = lt === 'pro_entreprise' || i.subscription === 'pro_entreprise';
  if (ent && (i.accountKind === 'company' || i.orgName)) return {commercial:true, label:'Usage commercial autorisé : licence Pro Entreprise de votre entreprise.'};
  if (i.accountKind === 'company') return {commercial:false, label:'Compte Entreprise sans licence Pro Entreprise : usage commercial non inclus.'};
  if (lt === 'pro' || i.subscription === 'pro') return {commercial:false, label:'Licence Pro : toutes les fonctions, pour un usage personnel. Vendre ce que vous réalisez avec l\'app est réservé aux entreprises (licence Pro Entreprise).'};
  return {commercial:false, label:'Compte Particulier : usage personnel uniquement. Vendre ce que vous réalisez avec l\'app est réservé aux entreprises (licence Pro Entreprise).'};
}
const field = (id, label, type = 'text', attrs = '', val = '') =>
  `<label class="ap-field" for="${id}"><span>${label}</span><span class="ap-in"><input id="${id}" name="${id}" type="${type}" value="${esc(val)}" ${attrs}>${type === 'password' ? `<button type="button" class="ap-eye" data-eye="${id}" aria-label="Afficher le mot de passe">Afficher</button>` : ''}</span></label>`;
const note = (t, cls = '') => t ? `<p class="ap-note ${cls}">${t}</p>` : '';
const rulesList = () => `<ul class="ap-rules" id="apRules"><li data-r="len">8 caractères</li><li data-r="let">une lettre</li><li data-r="num">un chiffre</li></ul>`;
const tabs = a => `<div class="ap-tabs" role="tablist"><button type="button" role="tab" aria-selected="${a === 'login'}" data-go="login">Se connecter</button><button type="button" role="tab" aria-selected="${a === 'signup'}" data-go="signup">Créer un compte</button></div>`;
const steps = (i, force) => (force || ctx.onboarding) ? `<ol class="ap-steps" aria-label="Étape ${i + 1} sur 3">${['Compte', 'Fiche client', 'Sécurité'].map((n, k) => `<li class="${k < i ? 'done' : k === i ? 'cur' : ''}"><i aria-hidden="true"><b>${k + 1}</b></i>${n}</li>`).join('')}</ol>` : '';
const google = () => Auth.canGoogle ? `<div class="ap-or">ou</div><button type="button" class="ap-btn alt" id="apGoogle">Continuer avec Google</button>` : '';
const pinPad = () => `<div class="ap-dots" id="apDots" aria-label="Code PIN">${'<i></i>'.repeat(PIN_LEN)}</div><p class="ap-err ap-pin-err" id="apErr" role="alert">${esc(view.err || '')}</p><div class="ap-pad">${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}<span></span><button type="button" data-k="0">0</button><button type="button" data-k="del" aria-label="Effacer le dernier chiffre">⌫</button></div>`;
const errBox = () => `<p class="ap-err" id="apErr" role="alert">${esc(view.err || '')}</p>`;
function setErr(t){ const e = $a('#apErr'); if (e) e.textContent = t || ''; }
function busy(btn, on, label){ if (!btn) return; if (on){ btn.dataset.l = btn.textContent; btn.textContent = label || 'Patientez…'; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } }
let tt; function toastA(msg){ const t = $a('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2800); }

const SCREENS = {
  loading:() => `<div class="ap-center" style="padding:48px 0"><div class="ap-spin" aria-hidden="true"></div><p class="ap-sub">${esc(view.text || 'Connexion à votre compte Studio Prism…')}</p><div class="ap-slow" id="apSlow" hidden></div></div>`,

  neterr:() => `<h2>Service injoignable</h2><p class="ap-sub">Impossible de joindre Studio Prism pour charger votre compte. Vérifiez votre connexion (ou un bloqueur de contenu), puis réessayez.</p>
    <button class="ap-btn" type="button" id="apRetry">Réessayer</button>
    <div class="ap-links"><button type="button" class="ap-link" data-act="logout">Se déconnecter</button></div>`,

  login:() => `${tabs('login')}<h2>Bon retour</h2><p class="ap-sub">Votre compte Studio Prism vous connecte à ARCHIINDUS, à Archi Vision et aux prochaines apps du studio.</p>
    ${note(view.msg, view.msgCls)}
    <form class="ap-form" id="apForm" novalidate>
      ${field('ap-email', 'Email', 'email', 'autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required', ctx.email)}
      ${field('ap-pw', 'Mot de passe', 'password', 'autocomplete="current-password" required')}
      <div class="ap-row"><button type="button" class="ap-link" data-go="reset">Mot de passe oublié ?</button></div>
      ${errBox()}
      <button class="ap-btn" type="submit">Se connecter</button>
    </form>${google()}`,

  signup:() => `${tabs('signup')}${steps(0, true)}<h2>Créer votre compte</h2><p class="ap-sub">Un seul compte pour toutes les apps Studio Prism.</p>
    <form class="ap-form" id="apForm" novalidate>
      <fieldset class="ap-kind"><legend>Vous créez un compte</legend>
        <label class="ap-kopt"><input type="radio" name="ap-kind" value="individual" checked><span><b>Particulier</b><small>Usage personnel, non commercial. Pour vendre vos réalisations : licence Pro avec un numéro SIRET.</small></span></label>
        <label class="ap-kopt"><input type="radio" name="ap-kind" value="company"><span><b>Entreprise</b><small>Société, bureau d'études, collectivité… Le compte est vérifié par Studio Prism avant la première connexion.</small></span></label>
      </fieldset>
      <div id="ap-co" hidden><p class="ap-note">L’inscription d’une entreprise se fait sur le site Studio Prism, par son <b>représentant</b> ou par le <b>responsable d’une agence, d’un service ou d’une branche</b>, avec le numéro SIRET et les licences souhaitées. Studio Prism vérifie la demande, puis délivre les clés de licence ; vous pourrez ensuite ajouter vos collaborateurs.</p>
        <a class="ap-btn" href="${SITE_URL}#/compte/inscription" target="_blank" rel="noopener">Inscrire mon entreprise sur le site Studio Prism</a>
        <p class="ap-note">Collaborateur d’une entreprise déjà inscrite ? Créez un compte <b>Particulier</b> ci-dessus, puis saisissez la clé de licence que votre responsable vous a transmise.</p></div>
      <div class="ap-grid2">${field('ap-first', 'Prénom', 'text', 'autocomplete="given-name" required')}${field('ap-last', 'Nom', 'text', 'autocomplete="family-name" required')}</div>
      ${field('ap-email', 'Email', 'email', 'autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required', ctx.email)}
      ${field('ap-pw', 'Mot de passe', 'password', 'autocomplete="new-password" required')}
      ${rulesList()}
      ${field('ap-pw2', 'Confirmer le mot de passe', 'password', 'autocomplete="new-password" required')}
      <label class="ap-check"><input type="checkbox" id="ap-cgu"><span>J'accepte les conditions d'utilisation et la politique de confidentialité de Studio Prism.</span></label>
      ${errBox()}
      <button class="ap-btn" type="submit">Créer mon compte</button>
    </form>${google()}`,

  reset:() => `<h2>Mot de passe oublié</h2><p class="ap-sub">Indiquez l'email de votre compte. Nous vous envoyons ${Auth.resetMode === 'link' ? 'un lien' : 'un code à 6 chiffres'} pour choisir un nouveau mot de passe.</p>
    <form class="ap-form" id="apForm" novalidate>
      ${field('ap-email', 'Email', 'email', 'autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required', ctx.email)}
      ${errBox()}
      <button class="ap-btn" type="submit">${Auth.resetMode === 'link' ? 'Envoyer le lien' : 'Envoyer le code'}</button>
    </form>
    <div class="ap-links"><button type="button" class="ap-link" data-go="login">Retour à la connexion</button></div>`,

  'reset-sent':() => `<h2>Vérifiez votre boîte mail</h2>
    ${note(`Si un compte Studio Prism existe pour <b>${esc(ctx.email)}</b>, un email vient de partir. Ouvrez le lien qu'il contient, choisissez un nouveau mot de passe, puis revenez vous connecter.`, 'ok')}
    <p class="ap-sub" style="margin:0">Rien reçu après quelques minutes ? Regardez dans les courriers indésirables, ou renvoyez l'email.</p>
    <button class="ap-btn" type="button" data-go="login">Retour à la connexion</button>
    <div class="ap-links"><button type="button" class="ap-link" data-go="reset">Renvoyer l'email</button></div>`,

  'reset-code':() => `<h2>Choisir un nouveau mot de passe</h2>
    <div class="ap-mail"><header>Mode démo · aperçu de l'email envoyé à ${esc(ctx.email)}<br>De : Studio Prism &lt;no-reply@studioprism.fr&gt; · Objet : votre code de réinitialisation</header>
    <div>${view.exists ? `Bonjour,<br>Voici votre code pour choisir un nouveau mot de passe :<span class="code">${esc(view.code)}</span>Il est valable 15 minutes. Si vous n'avez rien demandé, ignorez cet email.` : `Aucun email envoyé : aucun compte n'utilise cette adresse dans ce navigateur. Le vrai service ne l'indiquera pas, pour ne pas révéler quels emails ont un compte.`}</div></div>
    <form class="ap-form" id="apForm" novalidate>
      ${field('ap-code', 'Code reçu par email', 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" required')}
      ${field('ap-pw', 'Nouveau mot de passe', 'password', 'autocomplete="new-password" required')}
      ${rulesList()}
      ${field('ap-pw2', 'Confirmer le mot de passe', 'password', 'autocomplete="new-password" required')}
      ${errBox()}
      <button class="ap-btn" type="submit">Changer le mot de passe</button>
    </form>
    <div class="ap-links"><button type="button" class="ap-link" data-go="login">Annuler</button></div>`,

  verify:() => `${steps(0)}<h2>Confirmez votre email</h2><p class="ap-sub">Nous avons envoyé un lien d'activation à <b>${esc(me.email)}</b>. Cliquez dessus, puis revenez ici pour continuer.</p>
    ${note(view.msg, view.msgCls)}${errBox()}
    <button class="ap-btn" type="button" id="apVerified">J'ai confirmé mon email</button>
    <div class="ap-links"><button type="button" class="ap-link" id="apResend">Renvoyer l'email</button><button type="button" class="ap-link" data-act="logout">Se déconnecter</button></div>`,

  client:() => { const c = view.fiche || {}; const ed = view.edit; return `${ed ? '' : steps(1)}<h2>Votre fiche client</h2>
    <p class="ap-sub">${ed ? 'Ces informations sont partagées entre les apps Studio Prism.' : 'Quelques informations pour vos devis, vos commandes et le suivi de vos projets.'}</p>
    ${view.found ? note('Nous avons retrouvé vos informations Studio Prism. Vérifiez-les et complétez votre fiche.', 'ok') : ''}
    <div class="ap-acct">${me.kind === 'company' ? `Compte <b>Entreprise</b>${me.companyName ? ' · ' + esc(me.companyName) : ''}` : `Compte <b>Particulier</b> · usage personnel, non commercial <a class="ap-link" href="${ACCOUNT_URL}" target="_blank" rel="noopener">Vous êtes une entreprise ? Faites la demande sur le site</a>`}</div>
    <form class="ap-form" id="apForm" novalidate>
      ${field('ap-email', 'Email du compte', 'email', 'readonly', me.email)}
      <div class="ap-grid2">${field('ap-first', 'Prénom', 'text', 'autocomplete="given-name" required', c.firstName || me.firstName || '')}${field('ap-last', 'Nom', 'text', 'autocomplete="family-name" required', c.lastName || me.lastName || '')}</div>
      ${field('ap-phone', 'Téléphone', 'tel', 'autocomplete="tel" inputmode="tel" required', c.phone || '')}
      <label class="ap-field" for="ap-prof"><span>Vous êtes</span><span class="ap-in"><select id="ap-prof">${PROFILES.map(p => `<option${p === c.profile ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></span></label>
      ${field('ap-company', 'Société <small>(facultatif)</small>', 'text', 'autocomplete="organization"', c.company || me.companyName || '')}
<input type="hidden" id="ap-siret" value="${esc(c.siret || '')}">
      ${field('ap-address', 'Adresse <small>(facultatif)</small>', 'text', 'autocomplete="street-address"', c.address || '')}
      <div class="ap-grid2">${field('ap-zip', 'Code postal', 'text', 'autocomplete="postal-code" inputmode="numeric"', c.postalCode || '')}${field('ap-city', 'Ville', 'text', 'autocomplete="address-level2"', c.city || '')}</div>
      ${field('ap-country', 'Pays', 'text', 'autocomplete="country-name"', c.country || 'France')}
      ${errBox()}
      <button class="ap-btn" type="submit">${ed ? 'Enregistrer' : 'Enregistrer et continuer'}</button>
    </form>${ed ? '<div class="ap-links"><button type="button" class="ap-link" data-act="toapp">Annuler</button></div>' : ''}`; },

  'to-company':() => `<h2>Passer en compte Entreprise</h2><p class="ap-sub">Votre compte devient un compte Entreprise. Studio Prism vérifie les informations avant de le réactiver : vous serez déconnecté en attendant la validation. Vos projets sont conservés.</p>
    <form class="ap-form" id="apForm" novalidate>
      ${field('ap-coname', 'Nom de l\'entreprise', 'text', 'autocomplete="organization" maxlength="120"', me.companyName || '')}
      <div class="ap-grid2">${field('ap-coemail', 'Email de l\'entreprise <small>(facultatif)</small>', 'email', 'inputmode="email" autocapitalize="off" maxlength="160"')}${field('ap-cojob', 'Votre fonction <small>(facultatif)</small>', 'text', 'autocomplete="organization-title" maxlength="80"')}</div>
      <label class="ap-field" for="ap-cotier"><span>Nombre de comptes nécessaires</span><span class="ap-in"><select id="ap-cotier"><option value="">Choisir…</option>${TIERS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></span></label>
      ${errBox()}
      <button class="ap-btn" type="submit">Envoyer la demande</button>
    </form><div class="ap-links"><button type="button" class="ap-link" id="apBack">Retour à ma fiche</button></div>`,
  licence:() => { const ls = licSummary(), full = access.level === 'admin' || access.level === 'licensed', i = access.info || {};
    const acct = [i.orgName ? `Établissement · ${esc(i.orgName)}` : i.accountKind === 'company' ? `Entreprise${i.companyName ? ' · ' + esc(i.companyName) : ''}` : 'Particulier', i.subscription ? 'abonnement Studio Prism ' + esc(licLabel(i.subscription)) : ''].filter(Boolean).join(' · ');
    const lead = view.reason === 'export' ? '<p class="ap-sub">L\'export est réservé aux comptes disposant d\'une licence ARCHIINDUS active.</p>'
      : view.reason === 'welcome' ? '<p class="ap-sub">Bienvenue ! Votre compte gratuit vous donne accès à tous les outils et à 10 Mo de cloud.</p>' : view.reason === 'quota' ? '<p class="ap-sub">Votre espace cloud est plein. Une licence ARCHIINDUS le porte à 50 Mo.</p>' : '';
    return `<h2>${esc(ls.title)}</h2>${lead}
    <div class="ap-lic ${ls.cls}"><b>${esc(ls.short)}</b>${esc(ls.text)}${acct ? `<br><span style="color:#5B6B7F">${acct}</span>` : ''}${access.offline ? '<br><span style="color:#5B6B7F">Hors ligne : derniers droits connus.</span>' : ''}</div>
    ${access.level !== 'pending' ? (u => `<p class="ap-note ${u.commercial ? 'ok' : 'warn'}">${esc(u.label)}</p>`)(usageOf()) : ''}
    ${full ? '<ul class="ap-list"><li>Cloud : 50 Mo de projets (1 Go pour un administrateur), 5 dossiers et 3 dossiers partagés.</li><li>Tous les exports : PDF, DXF, STEP, STL, IFC, Archi Vision (.glb), nomenclatures, sauvegardes.</li></ul>' : `<ul class="ap-list"><li>Offre gratuite : tous les outils de dessin, de modélisation 3D, de calcul et de simulation, à l'écran.</li><li>Cloud de 10 Mo, 5 dossiers et 3 dossiers partagés ; partage de projets.</li><li>Les exports (PDF, DXF, STEP, IFC, Archi Vision, nomenclatures, sauvegardes) demandent une licence ARCHIINDUS, à obtenir sur le site Studio Prism et activée sur ce même compte.</li></ul>
    <a class="ap-btn" href="${OFFERS_URL}" target="_blank" rel="noopener" style="text-decoration:none">Voir les offres ARCHIINDUS</a>`}
    <details class="ap-key"${full ? '' : ' open'}><summary>J'ai une clé de licence</summary><form id="apKeyF" novalidate><label class="ap-field"><span>Clé reçue de Studio Prism ou de votre établissement</span><span class="ap-in"><input id="apKey" autocomplete="off" autocapitalize="characters" placeholder="ARCH-XXXX-XXXX-XXXX" style="font-family:var(--f-mono,monospace);letter-spacing:.05em"></span></label><p class="ap-err" id="apKeyErr"></p><button class="ap-btn alt" type="submit">Activer la clé</button></form></details>
    <div class="ap-links"><button type="button" class="ap-link" id="apLicCheck">Vérifier à nouveau</button><a class="ap-link" href="${ACCOUNT_URL}" target="_blank" rel="noopener">Mon compte Studio Prism</a><button type="button" class="ap-link" data-act="toapp">${full ? 'Retour' : 'Continuer avec l\'offre gratuite'}</button></div>`; },

  'pin-offer':() => `${steps(2)}<h2>Protéger l'accès sur cet appareil</h2>
    <p class="ap-sub">Avec un code PIN, ARCHIINDUS s'ouvre sans retaper votre mot de passe, et personne d'autre ne peut l'ouvrir sur cet appareil.</p>
    <ul class="ap-list"><li>Un seul code pour votre compte : il vous sera demandé sur vos autres appareils et pour confirmer une suppression de compte.</li>
    <li>Il est enregistré chiffré (haché), jamais en clair, et n'est jamais envoyé par email ni par SMS.</li>
    ${bioOK ? `<li>Empreinte ou visage : facultatif, vous pourrez l'activer ensuite.</li>` : ''}
    <li>Code oublié : reconnectez-vous avec votre mot de passe, puis choisissez-en un nouveau.</li></ul>
    <button class="ap-btn" type="button" id="apPinNew">Créer un code PIN</button>
    <div class="ap-links"><button type="button" class="ap-link" id="apSkip">Pas maintenant</button></div>`,

  'pin-setup':() => `${view.settings || view.reset ? '' : steps(2)}<div class="ap-center"><h2>${view.stage === 2 ? 'Confirmez votre code PIN' : view.reset ? 'Choisissez un nouveau code PIN' : 'Choisissez un code PIN'}</h2>
    <p class="ap-sub">${view.stage === 2 ? 'Saisissez le même code une seconde fois.' : `${PIN_LEN} chiffres, faciles à retenir pour vous, difficiles à deviner pour les autres.`}</p></div>
    ${pinPad()}${view.settings ? '<div class="ap-links"><button type="button" class="ap-link" data-go="security">Annuler</button></div>' : ''}`,

  'bio-offer':() => `${view.settings ? '' : steps(2)}<h2>Utiliser ${Bio.label()} ?</h2>
    <p class="ap-sub">Facultatif : déverrouillez ARCHIINDUS en un geste sur cet appareil. Votre code PIN reste toujours disponible.</p>${errBox()}
    <button class="ap-btn" type="button" id="apBio">Activer ${Bio.label()}</button>
    <button class="ap-btn alt" type="button" id="apSkip" style="margin-top:10px">${view.settings ? 'Annuler' : 'Non merci, le code PIN suffit'}</button>`,

  lock:() => { const l = Lock.get(me.uid) || {}; return `<div class="ap-center"><div class="ap-avatar" aria-hidden="true">${esc(initials())}</div>
    <h2>Bonjour ${esc(me.firstName || '')}</h2><p class="ap-sub">Saisissez votre code PIN pour ouvrir ARCHIINDUS.</p></div>
    ${pinPad()}
    ${l.bio && bioOK ? `<button class="ap-btn alt" type="button" id="apBio">Utiliser ${Bio.label()}</button>` : ''}
    <div class="ap-links"><button type="button" class="ap-link" id="apForgot">Code PIN oublié ?</button><button type="button" class="ap-link" data-act="logout">Changer de compte</button></div>`; },

  security:() => { const l = Lock.get(me.uid) || {}, has = !!(l.pin || l.rpin); return `<h2>Code PIN et sécurité</h2>
    <p class="ap-sub">Le code PIN est celui de votre compte Studio Prism : le même sur tous vos appareils, et demandé pour confirmer une suppression de compte. Votre mot de passe reste valable partout.</p>${note(view.msg, 'ok')}
    <div class="ap-sec">
      <div><b>Code PIN du compte</b><p>${l.pin ? 'Demandé à chaque ouverture d\'ARCHIINDUS sur cet appareil.' : has ? 'Non demandé sur cet appareil : l\'app s\'ouvre directement tant que vous restez connecté.' : 'Aucun code PIN pour l\'instant.'}</p>
        <span class="acts2">${has ? '<button type="button" class="ap-chip-btn" data-sec="pin">Modifier</button>' : '<button type="button" class="ap-chip-btn" data-sec="pin">Créer</button>'}${l.pin ? '<button type="button" class="ap-chip-btn danger" data-sec="pin-off">Ne plus le demander ici</button>' : l.rpin ? '<button type="button" class="ap-chip-btn" data-sec="pin-on">Le demander ici</button>' : ''}</span></div>
      ${bioOK ? `<div><b>${cap(Bio.label())} <small style="font-weight:500;color:#5B6B7F">· facultatif</small></b><p>${l.bio ? 'Activé sur cet appareil. Le code PIN reste disponible.' : l.pin ? 'Désactivé : seul le code PIN est demandé.' : 'Demandez d\'abord le code PIN sur cet appareil.'}</p>
        <span class="acts2">${l.bio ? '<button type="button" class="ap-chip-btn danger" data-sec="bio-off">Désactiver</button>' : l.pin ? '<button type="button" class="ap-chip-btn" data-sec="bio-on">Activer</button>' : ''}</span></div>`
      : '<div><b>Biométrie</b><p>Non disponible sur cet appareil ou dans ce navigateur.</p></div>'}
    </div>
    <button class="ap-btn" type="button" data-act="toapp">Retour à ARCHIINDUS</button>`; },
};

let loadSeq = 0;
const WIRE = {
  loading(){
    const id = ++loadSeq, still = () => current === 'loading' && loadSeq === id;
    setTimeout(() => { if (still()){ const sl = $a('#apSlow'); sl.hidden = false; sl.textContent = 'La connexion est plus lente que d\'habitude…'; } }, 6000);
    setTimeout(() => { if (!still()) return; const sl = $a('#apSlow'); sl.hidden = false;
      sl.innerHTML = 'Toujours rien ? Votre réseau, un VPN ou un bloqueur de contenu empêche peut-être la connexion à Studio Prism.<button class="ap-btn alt" type="button" id="apRetry">Réessayer</button>';
      $a('#apRetry').onclick = () => location.reload(); }, 15000);
  },
  neterr(){ $a('#apRetry').onclick = () => location.reload(); },
  login(){
    $a('#apForm').onsubmit = async e => {
      e.preventDefault(); const em = $a('#ap-email').value, pw = $a('#ap-pw').value; ctx.email = em.trim();
      if (!emailOK(em)) return setErr('Entrez une adresse email valide.');
      if (!pw) return setErr('Entrez votre mot de passe.');
      const b = $a('#apForm .ap-btn'); busy(b, true, 'Connexion…');
      try { const u = await Auth.signIn(em, pw); ctx.onboarding = false; await afterLogin(u); }
      catch(err){ busy(b, false); setErr(errMsg(err)); }
    };
  },
  signup(){
    wireRules();
    card().querySelectorAll('[name="ap-kind"]').forEach(r => r.onchange = () => { const co = ($a('[name="ap-kind"]:checked') || {}).value === 'company'; $a('#ap-co').hidden = !co; $a('#apForm').classList.toggle('ap-co-mode', co); });
    $a('#apForm').onsubmit = async e => {
      e.preventDefault();
      const firstName = $a('#ap-first').value.trim(), lastName = $a('#ap-last').value.trim(), email = $a('#ap-email').value, password = $a('#ap-pw').value;
      const kind = ($a('[name="ap-kind"]:checked') || {}).value || 'individual'; let company = null;
      if (kind === 'company') return setErr('L\'inscription d\'une entreprise se fait sur le site Studio Prism (bouton ci-dessus).');
      if (kind === 'company'){
        const t = TIERS.find(x => x[0] === $a('#ap-cotier').value), ce = $a('#ap-coemail').value.trim();
        company = {name:$a('#ap-coname').value.trim(), email:(ce || email).trim().toLowerCase(), job:$a('#ap-cojob').value.trim(), range:t && t[0], limit:t ? t[2] : null};
        if (!company.name) return setErr('Indiquez le nom de l\'entreprise.');
        if (ce && !emailOK(ce)) return setErr('L\'email de l\'entreprise n\'est pas valide.');
        if (!t) return setErr('Choisissez le nombre de comptes nécessaires.');
      }
      ctx.email = email.trim(); const r = pwRules(password);
      if (!firstName || !lastName) return setErr('Indiquez votre prénom et votre nom.');
      if (!emailOK(email)) return setErr('Entrez une adresse email valide.');
      if (!(r.len && r.let && r.num)) return setErr('Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.');
      if (password !== $a('#ap-pw2').value) return setErr('Les deux mots de passe ne correspondent pas.');
      if (!$a('#ap-cgu').checked) return setErr('Acceptez les conditions d\'utilisation pour créer votre compte.');
      const b = $a('#apForm .ap-btn'); busy(b, true, 'Création du compte…');
      try { const u = await Auth.signUp({firstName, lastName, email, password, kind, company}); ctx.onboarding = true; await afterLogin(u); }
      catch(err){ busy(b, false); if (err?.code === 'app/pending-signup') return show('login', {msg:errMsg(err), msgCls:'ok'}); setErr(errMsg(err)); }
    };
  },
  reset(){
    $a('#apForm').onsubmit = async e => {
      e.preventDefault(); const em = $a('#ap-email').value; ctx.email = em.trim();
      if (!emailOK(em)) return setErr('Entrez une adresse email valide.');
      const b = $a('#apForm .ap-btn'); busy(b, true, 'Envoi…');
      try { const r = await Auth.sendReset(em); r.mode === 'link' ? show('reset-sent') : show('reset-code', {code:r.code, exists:r.exists}); }
      catch(err){ if (err?.code === 'auth/user-not-found') return show('reset-sent'); busy(b, false); setErr(errMsg(err)); }
    };
  },
  'reset-code'(){
    wireRules();
    $a('#apForm').onsubmit = async e => {
      e.preventDefault(); const code = $a('#ap-code').value, pw = $a('#ap-pw').value, r = pwRules(pw);
      if (!/^\d{6}$/.test(code.trim())) return setErr('Le code contient 6 chiffres.');
      if (!(r.len && r.let && r.num)) return setErr('Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.');
      if (pw !== $a('#ap-pw2').value) return setErr('Les deux mots de passe ne correspondent pas.');
      const b = $a('#apForm .ap-btn'); busy(b, true, 'Enregistrement…');
      try { await Auth.confirmReset(ctx.email, code, pw); show('login', {msg:'Mot de passe modifié. Connectez-vous avec le nouveau.', msgCls:'ok'}); }
      catch(err){ busy(b, false); setErr(errMsg(err)); }
    };
  },
  verify(){
    $a('#apVerified').onclick = async e => { busy(e.currentTarget, true, 'Vérification…'); try { const u = await Auth.reload(me); if (u.verified) return afterLogin(u); busy(e.currentTarget, false); setErr('Votre email n\'est pas encore confirmé. Ouvrez le lien reçu, puis réessayez.'); } catch(err){ busy(e.currentTarget, false); setErr(errMsg(err)); } };
    $a('#apResend').onclick = async () => { try { await Auth.resendVerification(); show('verify', {msg:'Email renvoyé.', msgCls:'ok'}); } catch(err){ setErr(errMsg(err)); } };
  },
  client(){
    const tc = $a('#apToCo'); if (tc) tc.onclick = () => show('to-company', {back:view});
    $a('#apForm').onsubmit = async e => {
      e.preventDefault(); const v = id => $a(id).value.trim();
      const fiche = {siret:v('#ap-siret').replace(/\s/g, ''), firstName:v('#ap-first'), lastName:v('#ap-last'), phone:v('#ap-phone'), profile:$a('#ap-prof').value, company:v('#ap-company'), address:v('#ap-address'), postalCode:v('#ap-zip'), city:v('#ap-city'), country:v('#ap-country')};
      if (!fiche.firstName || !fiche.lastName) return setErr('Indiquez votre prénom et votre nom.');
      if (!phoneOK(fiche.phone)) return setErr('Entrez un numéro de téléphone valide, par exemple 06 12 34 56 78.');

      const b = $a('#apForm .ap-btn'); busy(b, true, 'Enregistrement…');
      try {
        await Auth.saveClient(me, fiche, view.clientId); me.firstName = fiche.firstName; me.lastName = fiche.lastName;
        view.edit ? enterApp('Fiche client enregistrée') : afterClient();
      } catch(err){ busy(b, false); setErr(errMsg(err)); }
    };
  },
  licence(){
    card().querySelectorAll('[data-act="fiche"]').forEach(b => b.onclick = () => openClient(true));
    $a('#apKeyF').onsubmit = async e => { e.preventDefault(); const b = e.currentTarget.querySelector('button'), err = $a('#apKeyErr'); err.textContent = ''; busy(b, true, 'Activation…');
      try { const k = await Auth.redeemKey(me, $a('#apKey').value); await refreshAccess(); show('licence', {}); toastA(`Clé activée : ${k.productName} ${licLabel(k.licenseType)}${k.orgName ? ' · ' + k.orgName : ''}`); }
      catch(x){ busy(b, false); err.textContent = errMsg(x); } };
    $a('#apLicCheck').onclick = async e => { busy(e.currentTarget, true, 'Vérification…'); await refreshAccess(); show('licence', {reason:view.reason === 'export' ? 'export' : ''}); toastA(access.level === 'discovery' ? 'Toujours aucune licence active' : 'Licence active : ARCHIINDUS est débloqué'); };
  },
  'to-company'(){
    $a('#apBack').onclick = () => show('client', view.back || {edit:true});
    $a('#apForm').onsubmit = async e => {
      e.preventDefault();
      const t = TIERS.find(x => x[0] === $a('#ap-cotier').value), ce = $a('#ap-coemail').value.trim();
      const co = {name:$a('#ap-coname').value.trim(), email:(ce || me.email).toLowerCase(), job:$a('#ap-cojob').value.trim(), range:t && t[0], limit:t ? t[2] : null};
      if (!co.name) return setErr('Indiquez le nom de l\'entreprise.');
      if (ce && !emailOK(ce)) return setErr('L\'email de l\'entreprise n\'est pas valide.');
      if (!t) return setErr('Choisissez le nombre de comptes nécessaires.');
      const b = $a('#apForm .ap-btn'); busy(b, true, 'Envoi de la demande…');
      try { await Auth.requestCompany(me, co); kickOut({code:'app/pending'}); }
      catch(err){ busy(b, false); setErr(errMsg(err)); }
    };
  },
  'pin-offer'(){
    $a('#apPinNew').onclick = () => show('pin-setup', {stage:1});
    $a('#apSkip').onclick = () => { Lock.set(me.uid, {declined:true}); enterApp(`Bienvenue ${me.firstName || ''}`.trim()); };
  },
  'pin-setup'(){
    pinHandler = async pin => {
      if (view.stage !== 2){
        if (weakPin(pin)){ shake(); return setErr('Évitez les suites et les répétitions (123456, 000000…).'); }
        return show('pin-setup', {...view, stage:2, first:pin, err:''});
      }
      if (pin !== view.first) return show('pin-setup', {settings:view.settings, reset:view.reset, stage:1, err:'Les deux codes ne correspondent pas. Recommencez.'});
      const rec = await Lock.setPin(me.uid, pin); ctx.forcePinReset = false;
      try { await withTimeout(Auth.setPin(me.uid, {pinHash:rec.pin, pinSalt:rec.salt, pinIter:rec.iter}), 10000); }
      catch(e){ Lock.set(me.uid, {...rec, unsynced:true}); toastA('Code enregistré sur cet appareil ; il sera lié à votre compte dès que possible.'); }
      if (view.settings) return show('security', {msg:'Code PIN enregistré pour votre compte.'});
      if (view.reset) return afterClient(true);
      if (bioOK) return show('bio-offer');
      enterApp('Code PIN activé');
    };
  },
  'bio-offer'(){
    $a('#apBio').onclick = async e => {
      busy(e.currentTarget, true, 'En attente de l\'appareil…');
      try { const id = await Bio.enroll(me); Lock.set(me.uid, {...(Lock.get(me.uid) || {}), bio:id}); view.settings ? show('security', {msg:'Biométrie activée.'}) : enterApp('Déverrouillage biométrique activé'); }
      catch(err){ busy(e.currentTarget, false); setErr('L\'activation n\'a pas abouti. Vous pourrez réessayer depuis « Sécurité de cet appareil ».'); }
    };
    $a('#apSkip').onclick = () => view.settings ? show('security') : enterApp('Code PIN activé');
  },
  lock(){
    pinHandler = async pin => {
      if (await Lock.check(me.uid, pin)) return afterLogin(me, true);
      const left = PIN_TRIES - (Lock.get(me.uid)?.failed || 0);
      if (left <= 0){ Lock.clear(me.uid); ctx.email = me.email; ctx.forcePinReset = true; await Auth.signOut(); me = null; return show('login', {msg:'Trop de codes incorrects. Pour votre sécurité, reconnectez-vous avec votre mot de passe, puis choisissez un nouveau code PIN.', msgCls:'warn'}); }
      shake(); setErr(`Code incorrect. ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`);
    };
    const l = Lock.get(me.uid) || {}, bb = $a('#apBio');
    const tryBio = async silent => { try { if (await Bio.verify(l.bio)) afterLogin(me, true); } catch(e){ if (!silent) setErr('Déverrouillage annulé. Utilisez votre code PIN.'); } };
    if (bb){ bb.onclick = () => tryBio(false); if (!view.noAuto) afterIntro().then(() => current === 'lock' && tryBio(true)); }   // biométrie demandée seulement après l'intro et le chargement
    $a('#apForgot').onclick = async () => { Lock.clear(me.uid); ctx.email = me.email; ctx.forcePinReset = true; await Auth.signOut(); me = null; show('login', {msg:'Reconnectez-vous avec votre mot de passe. Vous choisirez ensuite un nouveau code PIN.'}); };
  },
  security(){
    card().querySelectorAll('[data-sec]').forEach(b => b.onclick = () => {
      const l = Lock.get(me.uid) || {}, k = b.dataset.sec;
      if (k === 'pin') show('pin-setup', {stage:1, settings:true});
      else if (k === 'pin-off'){ Lock.set(me.uid, {declined:true, rpin:l.pin, rsalt:l.salt, riter:l.iter}); show('security', {msg:'Le code PIN ne sera plus demandé sur cet appareil.'}); }
      else if (k === 'pin-on'){ Lock.set(me.uid, {...l, declined:false, pin:l.rpin, salt:l.rsalt, iter:l.riter, failed:0, rpin:undefined}); show('security', {msg:'Le code PIN sera demandé à chaque ouverture.'}); }
      else if (k === 'bio-on') show('bio-offer', {settings:true});
      else if (k === 'bio-off'){ delete l.bio; Lock.set(me.uid, l); show('security', {msg:'Biométrie désactivée.'}); }
    });
  },
};

function wireRules(){
  const pw = $a('#ap-pw'), ul = $a('#apRules'); if (!pw || !ul) return;
  pw.addEventListener('input', () => { const r = pwRules(pw.value); ul.querySelectorAll('li').forEach(li => li.classList.toggle('ok', !!r[li.dataset.r])); });
}
let splashT = 0;
/* attend la fin complète de l'intro (écran d'accueil animé retiré) et du chargement du moteur, pour ne pas saccader l'animation */
function afterIntro(){ return new Promise(res => { const t0 = performance.now(); const tick = () => { const sp = $a('#splash'), ready = window.__apReady === true || performance.now() - t0 > 15000;
  if ((!sp || sp.classList.contains('done')) && ready) setTimeout(res, sp ? 700 : 250); else setTimeout(tick, 120); }; tick(); }); }
function hideSplashSoon(){ // l'écran de compte n'attend pas le moteur 3D
  if (splashT) return; const sp = $a('#splash'); if (!sp) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  splashT = setTimeout(() => { sp.classList.add('done'); setTimeout(() => sp.remove(), 600); }, Math.max(0, (reduce ? 600 : 2900) - performance.now()));
}
function show(name, opts = {}){
  if (name !== 'loading') hideSplashSoon();
  current = name; view = opts; pinBuf = ''; pinHandler = null;
  const r = root(); r.hidden = false; const app = $a('#app'); if (app) app.inert = true; const hh = $a('#home'); if (hh) hh.inert = true;
  card().innerHTML = SCREENS[name]() + (Auth.mode === 'demo' && name !== 'loading' ? '<p class="ap-mode">Mode démo · comptes enregistrés dans ce navigateur, emails simulés</p>' : '');
  card().querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  card().querySelectorAll('[data-act="toapp"]').forEach(b => b.onclick = () => enterApp());
  card().querySelectorAll('[data-act="logout"]').forEach(b => b.onclick = signOutAll);
  card().querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = $a('#' + b.dataset.eye); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; i.classList.add('pw'); b.textContent = on ? 'Masquer' : 'Afficher'; b.setAttribute('aria-label', on ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); });
  card().querySelectorAll('.ap-pad button').forEach(b => b.onclick = () => pinKey(b.dataset.k));
  const g = $a('#apGoogle'); if (g) g.onclick = async () => { busy(g, true, 'Ouverture de Google…'); try { const u = await Auth.signInGoogle(); await afterLogin(u); } catch(err){ busy(g, false); setErr(errMsg(err)); } };
  (WIRE[name] || (() => {}))();
  r.scrollTop = 0;
  if (matchMedia('(min-width: 861px)').matches){ const f = card().querySelector('input:not([readonly]):not([type="checkbox"])'); if (f && !f.value) setTimeout(() => f.focus({preventScroll:true}), 60); }
}
function dots(){ document.querySelectorAll('#apDots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length)); }
function shake(){ const d = $a('#apDots'); if (!d) return; d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
async function pinKey(k){
  if (!pinHandler || pinBusy) return;
  if (k === 'del') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < PIN_LEN) pinBuf += k;
  dots();
  if (pinBuf.length === PIN_LEN){ const v = pinBuf, h = pinHandler; pinBusy = true; await sleep(140); try { await h(v); } finally { pinBusy = false; } if (pinHandler === h){ pinBuf = ''; dots(); } }
}

async function afterLogin(u, unlocked){
  me = {...me, ...u}; startWatchP();
  const cached = profCache.get(me.uid);
  let prof = null;
  if (unlocked && cached?.clientDone){
    prof = cached;   // déjà vérifié sur cet appareil : on ouvre tout de suite, et on rafraîchit en arrière-plan
    const uid = me.uid; Auth.getProfile(me).then(p => p && profCache.set(uid, {firstName:p.firstName, lastName:p.lastName, clientDone:!!p.clientDone})).catch(e => { if (isGone(e) && me?.uid === uid) kickOut(e); });
    syncPin();
  } else {
    show('loading', {text:'Chargement de votre compte…'});
    try { prof = await withTimeout(Auth.getProfile(me), 12000); if (prof) profCache.set(me.uid, {firstName:prof.firstName, lastName:prof.lastName, clientDone:!!prof.clientDone}); }
    catch(e){ if (isGone(e)) return kickOut(e); prof = cached || null; if (!prof) return show('neterr'); }
    await syncPin();
  }
  if (prof?.firstName){ me.firstName = prof.firstName; me.lastName = prof.lastName || ''; }
  if (prof?.kind){ me.kind = prof.kind; me.companyName = prof.companyName || ''; }
  if (!prof?.clientDone) return openClient(false);
  return afterClient(unlocked);
}
/* Code PIN du compte : enregistré (haché) sur le compte, repris sur chaque appareil après connexion par mot de passe. */
async function syncPin(){
  if (!me || ctx.forcePinReset) return; const uid = me.uid;
  try {
    const l = Lock.get(uid) || {};
    if (l.unsynced && l.pin){ await withTimeout(Auth.setPin(uid, {pinHash:l.pin, pinSalt:l.salt, pinIter:l.iter}), 8000); delete l.unsynced; Lock.set(uid, l); return; }
    const r = await withTimeout(Auth.getPin(uid), 8000); if (!r || me?.uid !== uid) return;
    const cur = Lock.get(uid) || {};
    if (cur.declined && !cur.pin) Lock.set(uid, {...cur, rpin:r.pinHash, rsalt:r.pinSalt, riter:r.pinIter});
    else if (cur.pin !== r.pinHash) Lock.set(uid, {...cur, declined:false, pin:r.pinHash, salt:r.pinSalt, iter:r.pinIter, failed:0});
  } catch(e){}
}
function afterClient(unlocked){
  if (ctx.forcePinReset) return show('pin-setup', {stage:1, reset:true});
  const l = Lock.get(me.uid);
  if (!l) return show('pin-offer');
  enterApp(unlocked ? '' : `Bienvenue ${me.firstName || ''}`.trim());
}
async function openClient(edit){
  show('loading', {text:'Recherche de votre fiche client…'});
  let fiche = null; try { fiche = await Auth.findClient(me.email); } catch(e){}
  const mine = fiche && (!fiche.uid || fiche.uid === me.uid) ? fiche : null;
  show('client', {edit, fiche:mine, found:!!mine && !mine.uid, clientId:mine?.id});
}
/* ---------- Droits ARCHIINDUS (licence) ---------- */
let access = {level:'pending'}, accessReady = Promise.resolve(access);
const accessKey = uid => `sp.access.${uid}`;
function publishAccess(a){
  access = a; const full = a.level === 'admin' || a.level === 'licensed';
  const us = a.level === 'pending' ? {commercial:false} : usageOf(a);
  window.SPAccess = Object.freeze({level:a.level, canSave:a.level !== 'pending', canExport:full, commercial:!!us.commercial, needSiret:!!us.needSiret});
  window.dispatchEvent(new CustomEvent('sp:access', {detail:window.SPAccess}));
  const b = $a('#licBadge'); if (b) b.hidden = full || a.level === 'pending' || !me;
  const ubd = $a('#userBtn'); if (ubd) ubd.classList.toggle('disc', a.level === 'discovery');
  if (ctx.where === 'home' && !$a('#home').hidden) renderHome();
  if (Save.pid) Save.set(Save.canWrite() ? 'saved' : 'ro');
}
/* Compte supprimé, désactivé ou en attente : on ferme tout et on oublie ce que l'appareil gardait de ce compte (nom, droits, code PIN). */
const GONE = ['app/account-deleted', 'app/profile-missing', 'app/suspended', 'app/pending', 'app/profile-invalid'];
const isGone = e => GONE.includes(e?.code);
let unwatchP = null;
function stopWatchP(){ if (unwatchP){ try { unwatchP(); } catch(x){} } unwatchP = null; }
function startWatchP(){
  stopWatchP(); if (!me || !Auth.watch) return; const uid = me.uid;
  unwatchP = Auth.watch(uid, d => {
    if (me?.uid !== uid) return;
    const code = !d ? 'app/account-deleted' : d.status === 'suspended' ? 'app/suspended' : d.status === 'pending' ? 'app/pending' : d.status !== 'active' ? 'app/profile-invalid' : '';
    if (code) kickOut({code});
  });
}
async function kickOut(e){
  stopWatchP();
  const uid = me?.uid;
  try { Save.end(); } catch(x){}
  ctx.where = ''; const h = $a('#home'); if (h) h.hidden = true; window.APCloudActive = false;
  if (uid){ store.del(profCache.key(uid)); Lock.clear(uid); store.del(accessKey(uid)); }
  try { sessionStorage.removeItem('at.pendingLink'); } catch(x){}
  me = null; try { await Auth.signOut(); } catch(x){}
  const ub = $a('#userBtn'); if (ub) ub.hidden = true; const um = $a('#userMenu'); if (um) um.hidden = true;
  publishAccess({level:'pending'});
  show('login', {err:errMsg(e)});
}
async function refreshAccess(){
  if (!me) return access;
  const who = me;
  try {
    const a = await Auth.getAccess(who);
    if (me?.uid !== who.uid) return access;                       // déconnecté ou changé de compte entre-temps
    store.set(accessKey(who.uid), {...a, at:Date.now()}); publishAccess(a);
  } catch(e){
    if (me?.uid !== who.uid) return access;
    if (isGone(e)){ kickOut(e); return access; }
    // Hors ligne : on garde les droits vérifiés il y a moins de 7 jours, sinon mode découverte.
    const c = store.get(accessKey(who.uid));
    publishAccess(c && Date.now() - c.at < 7 * 864e5 ? {...c, offline:true} : {level:'discovery', info:null, license:null, offline:true});
  }
  return access;
}
const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'});
function licSummary(a = access){
  const l = a.license;
  if (a.level === 'admin') return {cls:'ok', short:'Administrateur · tous les droits', title:'Accès administrateur', text:'Votre compte Studio Prism est administrateur : ARCHIINDUS est entièrement débloqué.'};
  if (a.level === 'licensed') return {cls:'ok', short:`Licence ${licLabel(l.type)}${l.expiresAt ? ' · jusqu\'au ' + fmtDate(l.expiresAt) : ''}`,
    title:`Licence ARCHIINDUS ${licLabel(l.type)}`, text:l.expiresAt ? `Active jusqu'au ${fmtDate(l.expiresAt)}.` : 'Active, sans date de fin.'};
  if (a.level === 'pending') return {cls:'', short:'Vérification de la licence…', title:'Vérification…', text:''};
  const why = !l ? 'Aucune licence ARCHIINDUS n\'est associée à votre compte Studio Prism.'
    : l.expired ? `Votre licence ${licLabel(l.type)} a expiré le ${fmtDate(l.expiresAt)}.`
    : l.status === 'suspended' ? `Votre licence ${licLabel(l.type)} est suspendue.` : `Votre licence ${licLabel(l.type)} n'est pas active.`;
  return {cls:'warn', short:'Offre gratuite · 10 Mo de cloud, sans export', title:'Offre gratuite', text:why};
}
/* Rappel avant un export, une fois par session, pour un compte sans droit d'usage commercial. */
let usageShown = false;
window.SPLicense = {prompt(reason){ if (me) show('licence', {reason}); },
  usage(){ if (usageShown || !me || window.SPAccess?.commercial || window.SPAccess?.level === 'pending') return; usageShown = true; const u = usageOf();
    dlg(`<h3>Usage de cet export</h3><p class="dlg-p">${esc(u.label)}</p><p class="dlg-p">Un usage personnel reste libre : vous pouvez exporter vos fichiers. Les vendre, ou les remettre à un client dans le cadre d'une prestation, n'est pas couvert par votre licence actuelle.</p><div class="dlg-acts"><button type="button" class="ap-btn" data-dlg="close">Compris</button></div>`); }};

function enterApp(msg){
  root().hidden = true; const app = $a('#app'); if (app) app.inert = false; const hh = $a('#home'); if (hh) hh.inert = false; ctx.onboarding = false;
  const ub = $a('#userBtn'); if (ub){ ub.hidden = false; ub.textContent = initials(); ub.title = `${me.firstName || ''} ${me.lastName || ''}`.trim() || me.email; }
  if (msg) toastA(msg);
  const wasPending = access.level === 'pending';
  accessReady = refreshAccess();
  if (ctx.libFor !== me.uid){ ctx.libFor = me.uid; loadUserLib(); }
  accessReady.then(() => { if (typeof renderHome === 'function') renderHome(); });   // l'offre gratuite est présentée dans « Mes projets » (bandeau), sans écran intermédiaire
  // Après le code PIN : l'accueil (mes projets) ; retour direct à la maquette si on y était (verrouillage, réglages…)
  if (ctx.where === 'app'){ const hh = $a('#home'); if (hh) hh.inert = false; return; }
  showHome();
  if (ctx.pendingLink) accessReady.then(() => openPendingLink());
}
async function signOutAll(){
  stopWatchP();
  try { if (Save.pending()) await withTimeout(Save.flush(true), 8000); } catch(e){}
  Save.end(); ctx.where = ''; H.mine = H.shared = null; H.folder = ''; H.tab = 'mine'; $a('#home').hidden = true; window.APCloudActive = false;
  ctx.email = me?.email || ctx.email; try { await Auth.signOut(); } catch(e){}
  me = null; ctx.discShown = false; ctx.libFor = ''; try { window.APModel?.setUserLib({}); } catch(e){} const ub = $a('#userBtn'); if (ub) ub.hidden = true; $a('#userMenu').hidden = true;
  publishAccess({level:'pending'});
  show('login', {msg:'Vous êtes déconnecté.'});
}

