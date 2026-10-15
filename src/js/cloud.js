/* =====================================================================
   Cloud ARCHIINDUS : projets enregistrés automatiquement, dossiers (partagés ou non), partage par email ou par lien,
   quotas de stockage, bibliothèque personnelle.
   Firestore : aiProjects/{id} (+ content/main), aiFolders/{id} (pids : projets du dossier), aiShares/{cible}__{email}
   (cible = id du projet, ou F_{id} pour un dossier), aiGrants/{cible}__{uid} (accès par lien), aiUsage/{uid} (octets utilisés),
   aiLibrary/{uid} (matériaux, compositions, familles personnels).
   Offres : gratuit 10 Mo, licence 50 Mo, administrateur 1 Go ; 5 dossiers et 3 dossiers partagés. Le stockage d'un projet est
   compté chez son propriétaire, y compris quand un invité l'enregistre ou le crée dans un dossier partagé.
   Les règles Firestore imposent les droits et le quota côté serveur (compteur aiUsage mis à jour dans le même lot que le projet).
   ===================================================================== */
const APP_URL = location.origin + location.pathname;
const MAX_DATA = 950000;
const PLANS = {free:{label:'Gratuit', bytes:10e6}, pro:{label:'Licence ARCHIINDUS', bytes:50e6}, admin:{label:'Administrateur', bytes:1e9}};
const FOLDER_LIMITS = {priv:5, shared:3};
const planKey = () => access.level === 'admin' ? 'admin' : access.level === 'licensed' ? 'pro' : 'free';
const canCloud = () => !!me && access.level !== 'pending';
const fullAccess = () => access.level === 'admin' || access.level === 'licensed';
const emailKey = e => String(e || '').trim().toLowerCase();
const withTimeout = (p, ms, code = 'app/timeout') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({code}), ms))]);
async function sha256hex(s){ const h = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const randTok = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
const fullName = () => `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || me?.email || '';
const ms = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : (typeof t === 'number' ? t : Date.now());
const byteLen = s => new TextEncoder().encode(s || '').length; // taille réelle (UTF-8), celle que compte le quota
const mb = n => (n / 1e6).toLocaleString('fr-FR', {maximumFractionDigits:n < 1e7 ? 1 : 0}) + ' Mo';

/* ---------- Démo : même interface, données dans ce navigateur ---------- */
const DemoCloud = {
  db(){ const d = store.get('sp.demo.cloud') || {}; return {projects:{}, content:{}, folders:{}, shares:{}, grants:{}, libs:{}, ...d}; },
  put(d){ store.set('sp.demo.cloud', d); },
  uid(){ return me.uid; }, email(){ return emailKey(me.email); },
  quotaOf(uid){ return uid === this.uid() ? PLANS[planKey()].bytes : PLANS.pro.bytes; },
  usedBy(d, uid){ return Object.values(d.projects).filter(p => p.ownerUid === uid).reduce((s, p) => s + (p.size || 0), 0); },
  async usage(){ const d = this.db(); return {bytes:this.usedBy(d, this.uid())}; },
  async listMine(){ await sleep(120); const d = this.db(), u = this.uid();
    return {projects:Object.values(d.projects).filter(p => p.ownerUid === u), folders:Object.values(d.folders).filter(f => f.ownerUid === u)}; },
  folderRole(d, fid){ const f = d.folders[fid]; if (!f) return ''; if (f.ownerUid === this.uid()) return 'owner'; const s = d.shares['F_' + fid + '__' + this.email()]; if (s) return s.role;
    const g = d.grants['F_' + fid + '__' + this.uid()]; return g && f.linkMode !== 'off' && g.key === f.linkKey ? f.linkMode : ''; },
  roleOf(d, p){ if (p.ownerUid === this.uid()) return 'owner'; const s = d.shares[p.id + '__' + this.email()]; if (s) return s.role;
    const g = d.grants[p.id + '__' + this.uid()]; if (g && p.linkMode !== 'off' && g.key === p.linkKey) return p.linkMode;
    return p.folderId ? this.folderRole(d, p.folderId) : ''; },
  async listShared(){ await sleep(120); const d = this.db(), projects = [], folders = [], seenP = new Set(), seenF = new Set();
    const addF = (f, role, via) => { if (seenF.has(f.id)) return; seenF.add(f.id); folders.push({...f, role, via, projects:(f.pids || []).map(id => d.projects[id]).filter(Boolean).map(p => ({...p, role}))}); };
    const addP = (p, role, via) => { if (seenP.has(p.id)) return; seenP.add(p.id); projects.push({...p, role, via}); };
    Object.values(d.shares).filter(s => s.email === this.email()).forEach(s => { if (s.kind === 'folder'){ const f = d.folders[s.fid]; if (f) addF(f, s.role, 'email'); } else { const p = d.projects[s.pid]; if (p) addP(p, s.role, 'email'); } });
    Object.values(d.grants).filter(g => g.uid === this.uid()).forEach(g => { if (g.kind === 'folder'){ const f = d.folders[g.fid]; if (f && f.linkMode !== 'off' && f.linkKey === g.key) addF(f, f.linkMode, 'link'); } else { const p = d.projects[g.pid]; if (p && p.linkMode !== 'off' && p.linkKey === g.key) addP(p, p.linkMode, 'link'); } });
    return {projects, folders}; },
  async open(pid){ await sleep(100); const d = this.db(), p = d.projects[pid]; if (!p) throw {code:'app/not-found'};
    const role = this.roleOf(d, p); if (!role) throw {code:'permission-denied'}; return {meta:{...p}, data:d.content[pid] || window.APModel?.blankJSON() || '{}', role}; },
  checkQuota(d, ownerUid, delta){ if (delta > 0 && this.usedBy(d, ownerUid) + delta > this.quotaOf(ownerUid)) throw {code:'app/quota'}; },
  async create({name, folderId = '', data, thumb = ''}){ await sleep(100); const d = this.db(), id = randId('p'), now = Date.now();
    let owner = this.uid();
    if (folderId){ const f = d.folders[folderId]; if (!f) throw {code:'app/not-found'}; const r = this.folderRole(d, folderId); if (!(r === 'owner' || r === 'edit')) throw {code:'permission-denied'}; owner = f.ownerUid; }
    this.checkQuota(d, owner, byteLen(data));
    d.projects[id] = {id, ownerUid:owner, ownerEmail:owner === this.uid() ? this.email() : d.folders[folderId].ownerEmail, ownerName:owner === this.uid() ? fullName() : d.folders[folderId].ownerName, name, folderId, size:byteLen(data), thumb, linkMode:'off', linkKey:'', linkToken:'', linkPw:false, createdAt:now, updatedAt:now, updatedBy:this.uid(), updatedByName:fullName()};
    d.content[id] = data; if (folderId) d.folders[folderId].pids = [...(d.folders[folderId].pids || []), id]; this.put(d); return {...d.projects[id]}; },
  async save(pid, data, extra = {}){ await sleep(60); const d = this.db(), p = d.projects[pid]; if (!p) throw {code:'app/not-found'};
    const r = this.roleOf(d, p); if (!(r === 'owner' || r === 'edit')) throw {code:'permission-denied'};
    this.checkQuota(d, p.ownerUid, byteLen(data) - (p.size || 0));
    d.content[pid] = data; Object.assign(p, {size:byteLen(data), updatedAt:Date.now(), updatedBy:this.uid(), updatedByName:fullName()}, extra); this.put(d); },
  async update(pid, fields){ const d = this.db(), p = d.projects[pid]; if (!p || p.ownerUid !== this.uid()) throw {code:'permission-denied'}; Object.assign(p, fields, {updatedAt:Date.now()}); this.put(d); },
  async move(p, fid){ const d = this.db(), P = d.projects[p.id]; if (!P || P.ownerUid !== this.uid()) throw {code:'permission-denied'};
    if (P.folderId && d.folders[P.folderId]) d.folders[P.folderId].pids = (d.folders[P.folderId].pids || []).filter(x => x !== p.id);
    if (fid && d.folders[fid]) d.folders[fid].pids = [...(d.folders[fid].pids || []), p.id]; P.folderId = fid; P.updatedAt = Date.now(); this.put(d); },
  async remove(pid){ const d = this.db(), p = d.projects[pid]; if (p?.ownerUid !== this.uid()) throw {code:'permission-denied'};
    if (p.folderId && d.folders[p.folderId]) d.folders[p.folderId].pids = (d.folders[p.folderId].pids || []).filter(x => x !== pid);
    delete d.projects[pid]; delete d.content[pid];
    Object.keys(d.shares).forEach(k => d.shares[k].pid === pid && delete d.shares[k]); Object.keys(d.grants).forEach(k => d.grants[k].pid === pid && delete d.grants[k]); this.put(d); },
  async leave(item, kind){ const d = this.db(), key = kind === 'folder' ? 'F_' + item.id : item.id; delete d.shares[key + '__' + this.email()]; delete d.grants[key + '__' + this.uid()]; this.put(d); },
  async createFolder(name, parentId = ''){ const d = this.db(), id = randId('f'); d.folders[id] = {id, ownerUid:this.uid(), ownerEmail:this.email(), ownerName:fullName(), name, parentId, shared:false, pids:[], linkMode:'off', linkKey:'', linkToken:'', linkPw:false, createdAt:Date.now(), updatedAt:Date.now()}; this.put(d); return d.folders[id]; },
  async updateFolder(fid, fields){ const d = this.db(); Object.assign(d.folders[fid], fields, {updatedAt:Date.now()}); this.put(d); },
  async removeFolder(fid){ const d = this.db(), f = d.folders[fid]; if (!f) return;
    Object.values(d.projects).forEach(p => { if (p.ownerUid === this.uid() && p.folderId === fid){ p.folderId = f.parentId || ''; if (p.folderId && d.folders[p.folderId]) d.folders[p.folderId].pids = [...(d.folders[p.folderId].pids || []), p.id]; } });
    Object.values(d.folders).forEach(x => { if (x.parentId === fid) x.parentId = f.parentId || ''; });
    Object.keys(d.shares).forEach(k => d.shares[k].fid === fid && delete d.shares[k]); delete d.folders[fid]; this.put(d); },
  async listShares(target){ const key = target.kind === 'folder' ? 'F_' + target.id : target.id; return Object.values(this.db().shares).filter(s => (s.kind === 'folder' ? 'F_' + s.fid : s.pid) === key); },
  async addShare(target, email, role){ const d = this.db(), e = emailKey(email), folder = target.kind === 'folder';
    const key = (folder ? 'F_' + target.id : target.id) + '__' + e;
    d.shares[key] = folder ? {kind:'folder', fid:target.id, email:e, role, ownerUid:this.uid(), name:target.name, ownerName:fullName(), createdAt:Date.now()} : {kind:'project', pid:target.id, email:e, role, ownerUid:this.uid(), name:target.name, ownerName:fullName(), createdAt:Date.now()};
    if (folder){ d.folders[target.id].shared = true; target.shared = true; } this.put(d); },
  async removeShare(target, email){ const d = this.db(), key = (target.kind === 'folder' ? 'F_' + target.id : target.id) + '__' + emailKey(email); delete d.shares[key];
    if (target.kind === 'folder'){ const f = d.folders[target.id]; f.shared = f.linkMode !== 'off' || Object.values(d.shares).some(s => s.kind === 'folder' && s.fid === f.id); target.shared = f.shared; } this.put(d); },
  async setLink(target, mode, password){ const token = mode === 'off' ? '' : randTok(); const key = mode === 'off' ? '' : password ? await sha256hex(token + ':' + password) : token;
    const fields = {linkMode:mode, linkKey:key, linkToken:token, linkPw:!!password && mode !== 'off'};
    if (target.kind === 'folder'){ const d = this.db(); const f = d.folders[target.id]; Object.assign(f, fields); f.shared = mode !== 'off' || Object.values(d.shares).some(s => s.kind === 'folder' && s.fid === f.id); target.shared = f.shared; this.put(d); }
    else await this.update(target.id, fields); return token; },
  async claimLink(kind, id, token, password){ const d = this.db(), T = kind === 'folder' ? d.folders[id] : d.projects[id]; const key = password ? await sha256hex(token + ':' + password) : token;
    if (!T || T.linkMode === 'off' || T.linkKey !== key) throw {code:'permission-denied'};
    d.grants[(kind === 'folder' ? 'F_' : '') + id + '__' + this.uid()] = kind === 'folder' ? {kind, fid:id, uid:this.uid(), key, createdAt:Date.now()} : {kind:'project', pid:id, uid:this.uid(), key, createdAt:Date.now()}; this.put(d); },
  async isVerified(){ return true; },
  async loadLib(){ return this.db().libs[this.uid()] || null; },
  async saveLib(lib){ const d = this.db(); d.libs[this.uid()] = lib; this.put(d); },
};

/* ---------- Firebase ---------- */
const FirebaseCloud = {
  get db(){ return FirebaseAuth.db; },
  ts(){ return FirebaseAuth.ts(); },
  inc(n){ return firebase.firestore.FieldValue.increment(n); },
  aU(v){ return firebase.firestore.FieldValue.arrayUnion(v); }, aR(v){ return firebase.firestore.FieldValue.arrayRemove(v); },
  user(){ return FirebaseAuth.fa.currentUser; },
  uid(){ return this.user().uid; }, email(){ return emailKey(this.user().email); },
  P(pid){ return this.db.collection('aiProjects').doc(pid); },
  C(pid){ return this.P(pid).collection('content').doc('main'); },
  F(fid){ return this.db.collection('aiFolders').doc(fid); },
  U(uid){ return this.db.collection('aiUsage').doc(uid); },
  meta(d){ const x = d.data(); return {...x, id:d.id, updatedAt:ms(x.updatedAt), createdAt:ms(x.createdAt)}; },
  async usage(projects){
    const s = await this.U(this.uid()).get(); if (s.exists) return {bytes:s.data().bytes || 0};
    const bytes = (projects || []).reduce((a, p) => a + (p.size || 0), 0);
    await this.U(this.uid()).set({bytes, lastPid:'', updatedAt:this.ts()}); return {bytes};
  },
  async listMine(){
    const u = this.uid();
    const [p, f] = await Promise.all([this.db.collection('aiProjects').where('ownerUid', '==', u).get(), this.db.collection('aiFolders').where('ownerUid', '==', u).get()]);
    return {projects:p.docs.map(d => this.meta(d)), folders:f.docs.map(d => ({...d.data(), id:d.id}))};
  },
  async listShared(){
    const [s, g] = await Promise.all([this.db.collection('aiShares').where('email', '==', this.email()).get(), this.db.collection('aiGrants').where('uid', '==', this.uid()).get()]);
    const projects = [], folders = [], seenP = new Set(), seenF = new Set();
    const getP = async (pid, role, via, extra = {}) => { if (seenP.has(pid)) return null; seenP.add(pid); try { const d = await this.P(pid).get(); if (!d.exists) return null; const m = this.meta(d); return {...m, role:role === 'link' ? m.linkMode : role, via, ...extra}; } catch(e){ return extra.fallback || null; } };
    const getF = async (fid, role, via, name, ownerName) => {
      if (seenF.has(fid)) return; seenF.add(fid);
      try { const d = await this.F(fid).get(); if (!d.exists) return; const f = {...d.data(), id:fid}; const r = role === 'link' ? f.linkMode : role;
        const ps = (await Promise.all((f.pids || []).slice(0, 200).map(pid => getP(pid, r, 'folder', {folderName:f.name})))).filter(Boolean);
        folders.push({...f, role:r, via, projects:ps}); }
      catch(e){ folders.push({id:fid, name:name || 'Dossier partagé', ownerName:ownerName || '', role, via, projects:[], locked:true}); }
    };
    const jobs = [];
    s.docs.forEach(d => { const x = d.data();
      if (x.kind === 'folder') jobs.push(getF(x.fid, x.role, 'email', x.name, x.ownerName));
      else jobs.push(getP(x.pid, x.role, 'email', {fallback:{id:x.pid, name:x.name || 'Projet partagé', ownerName:x.ownerName || '', role:x.role, via:'email', locked:true, updatedAt:0}}).then(p => p && projects.push(p))); });
    g.docs.forEach(d => { const x = d.data(); if (x.kind === 'folder') jobs.push(getF(x.fid, 'link', 'link')); else jobs.push(getP(x.pid, 'link', 'link').then(p => p && projects.push(p))); });
    await Promise.all(jobs);
    return {projects, folders};
  },
  async roleOf(m){
    if (m.ownerUid === this.uid()) return 'owner';
    try { const s = await this.db.collection('aiShares').doc(m.id + '__' + this.email()).get(); if (s.exists) return s.data().role; } catch(e){}
    if (m.folderId){ try { const s = await this.db.collection('aiShares').doc('F_' + m.folderId + '__' + this.email()).get(); if (s.exists) return s.data().role; } catch(e){}
      try { const f = await this.F(m.folderId).get(); if (f.exists && f.data().linkMode !== 'off') return f.data().linkMode; } catch(e){} }
    return m.linkMode && m.linkMode !== 'off' ? m.linkMode : 'view';
  },
  async open(pid){
    const p = await this.P(pid).get(); if (!p.exists) throw {code:'app/not-found'};
    const m = this.meta(p); const [c, role] = await Promise.all([this.C(pid).get(), this.roleOf(m)]);
    return {meta:m, data:c.exists ? c.data().data : (window.APModel?.blankJSON() || '{}'), role};
  },
  async create({name, folderId = '', data, thumb = ''}){
    if (byteLen(data) > MAX_DATA) throw {code:'app/too-big'};
    let owner = this.uid(), oEmail = this.email(), oName = fullName();
    if (folderId){ const f = await this.F(folderId).get(); if (!f.exists) throw {code:'app/not-found'}; owner = f.data().ownerUid; oEmail = f.data().ownerEmail || ''; oName = f.data().ownerName || ''; }
    if (owner === this.uid()) await this.usage();
    const ref = this.db.collection('aiProjects').doc(), u = this.user();
    const meta = {ownerUid:owner, ownerEmail:oEmail, ownerName:oName.slice(0, 160), name:name.slice(0, 120), folderId, size:byteLen(data), thumb,
      linkMode:'off', linkKey:'', linkToken:'', linkPw:false, createdAt:this.ts(), updatedAt:this.ts(), updatedBy:u.uid, updatedByName:fullName().slice(0, 160)};
    const b = this.db.batch(); b.set(ref, meta); b.set(ref.collection('content').doc('main'), {data, updatedAt:this.ts()});
    b.set(this.U(owner), {bytes:this.inc(byteLen(data)), lastPid:ref.id, updatedAt:this.ts()}, {merge:true});
    if (folderId) b.update(this.F(folderId), {pids:this.aU(ref.id), updatedAt:this.ts()});
    try { await b.commit(); } catch(e){ throw e?.code === 'permission-denied' ? {code:'app/quota-or-denied'} : e; }
    return {...meta, id:ref.id, createdAt:Date.now(), updatedAt:Date.now()};
  },
  async save(pid, data, extra = {}, prevSize, ownerUid){
    if (byteLen(data) > MAX_DATA) throw {code:'app/too-big'};
    const delta = byteLen(data) - (prevSize ?? byteLen(data)), b = this.db.batch();
    b.set(this.C(pid), {data, updatedAt:this.ts()});
    b.update(this.P(pid), {size:byteLen(data), updatedAt:this.ts(), updatedBy:this.uid(), updatedByName:fullName().slice(0, 160), ...extra});
    if (delta !== 0) b.set(this.U(ownerUid || this.uid()), {bytes:this.inc(delta), lastPid:pid, updatedAt:this.ts()}, {merge:true});
    try { await b.commit(); } catch(e){ throw e?.code === 'permission-denied' ? {code:'app/quota-or-denied'} : e; }
  },
  async update(pid, fields){ await this.P(pid).update({...fields, updatedAt:this.ts()}); },
  async move(p, fid){
    const b = this.db.batch(); b.update(this.P(p.id), {folderId:fid, updatedAt:this.ts()});
    if (p.folderId) b.update(this.F(p.folderId), {pids:this.aR(p.id), updatedAt:this.ts()});
    if (fid) b.update(this.F(fid), {pids:this.aU(p.id), updatedAt:this.ts()});
    await b.commit();
  },
  async remove(pid){
    const pd = await this.P(pid).get(); if (!pd.exists) return; const p = pd.data();
    const sh = await this.db.collection('aiShares').where('ownerUid', '==', this.uid()).where('pid', '==', pid).get();
    const us = await this.U(this.uid()).get().catch(() => null);
    const b = this.db.batch(); sh.docs.forEach(d => b.delete(d.ref)); b.delete(this.C(pid)); b.delete(this.P(pid));
    if (us?.exists && (p.size || 0) > 0 && (us.data().bytes || 0) >= p.size) b.update(this.U(this.uid()), {bytes:this.inc(-p.size), lastPid:pid, updatedAt:this.ts()});
    if (p.folderId) b.update(this.F(p.folderId), {pids:this.aR(pid), updatedAt:this.ts()});
    await b.commit();
  },
  async leave(item, kind){
    const key = kind === 'folder' ? 'F_' + item.id : item.id;
    await Promise.all([this.db.collection('aiShares').doc(key + '__' + this.email()).delete().catch(() => {}), this.db.collection('aiGrants').doc(key + '__' + this.uid()).delete().catch(() => {})]);
  },
  async createFolder(name, parentId = ''){
    const ref = this.db.collection('aiFolders').doc();
    const f = {ownerUid:this.uid(), ownerEmail:this.email(), ownerName:fullName().slice(0, 160), name:name.slice(0, 80), parentId, shared:false, pids:[], linkMode:'off', linkKey:'', linkToken:'', linkPw:false, createdAt:this.ts(), updatedAt:this.ts()};
    await ref.set(f); return {...f, id:ref.id};
  },
  async updateFolder(fid, fields){ await this.F(fid).update({...fields, updatedAt:this.ts()}); },
  async removeFolder(fid, all){
    const f = all.folders.find(x => x.id === fid); const parent = f?.parentId || '';
    const sh = await this.db.collection('aiShares').where('ownerUid', '==', this.uid()).where('fid', '==', fid).get();
    const b = this.db.batch(); sh.docs.forEach(d => b.delete(d.ref));
    const moved = all.projects.filter(p => p.folderId === fid);
    moved.forEach(p => b.update(this.P(p.id), {folderId:parent, updatedAt:this.ts()}));
    if (parent && moved.length) b.update(this.F(parent), {pids:firebase.firestore.FieldValue.arrayUnion(...moved.map(p => p.id)), updatedAt:this.ts()});
    all.folders.filter(x => x.parentId === fid).forEach(x => b.update(this.F(x.id), {parentId:parent, updatedAt:this.ts()}));
    b.delete(this.F(fid)); await b.commit();
  },
  shareRef(target, email){ return this.db.collection('aiShares').doc((target.kind === 'folder' ? 'F_' + target.id : target.id) + '__' + emailKey(email)); },
  async listShares(target){
    const q = this.db.collection('aiShares').where('ownerUid', '==', this.uid());
    const s = await (target.kind === 'folder' ? q.where('fid', '==', target.id) : q.where('pid', '==', target.id)).get();
    return s.docs.map(d => d.data());
  },
  async addShare(target, email, role){
    const e = emailKey(email), base = {email:e, role, ownerUid:this.uid(), name:target.name.slice(0, 120), ownerName:fullName().slice(0, 160), createdAt:this.ts()};
    const b = this.db.batch();
    b.set(this.shareRef(target, e), target.kind === 'folder' ? {kind:'folder', fid:target.id, ...base} : {kind:'project', pid:target.id, ...base});
    if (target.kind === 'folder' && !target.shared) b.update(this.F(target.id), {shared:true, updatedAt:this.ts()});
    await b.commit(); if (target.kind === 'folder') target.shared = true;
  },
  async removeShare(target, email){
    await this.shareRef(target, email).delete();
    if (target.kind === 'folder'){ const rest = await this.listShares(target); const shared = rest.length > 0 || (target.linkMode && target.linkMode !== 'off'); if (!shared){ await this.updateFolder(target.id, {shared:false}); target.shared = false; } }
  },
  async setLink(target, mode, password){
    const token = mode === 'off' ? '' : randTok();
    const key = mode === 'off' ? '' : password ? await sha256hex(token + ':' + password) : token;
    const fields = {linkMode:mode, linkKey:key, linkToken:token, linkPw:!!password && mode !== 'off'};
    if (target.kind === 'folder'){ let shared = mode !== 'off'; if (!shared) shared = (await this.listShares(target)).length > 0; await this.updateFolder(target.id, {...fields, shared}); target.shared = shared; }
    else await this.update(target.id, fields);
    return token;
  },
  async claimLink(kind, id, token, password){
    const key = password ? await sha256hex(token + ':' + password) : token;
    const doc = kind === 'folder' ? {kind:'folder', fid:id, uid:this.uid(), key, createdAt:this.ts()} : {kind:'project', pid:id, uid:this.uid(), key, createdAt:this.ts()};
    await this.db.collection('aiGrants').doc((kind === 'folder' ? 'F_' : '') + id + '__' + this.uid()).set(doc);
  },
  async isVerified(){ const u = this.user(); if (u.emailVerified) return true; await u.reload(); if (u.emailVerified){ await u.getIdToken(true); return true; } return false; },
  async loadLib(){ const s = await this.db.collection('aiLibrary').doc(this.uid()).get(); if (!s.exists) return null; try { return JSON.parse(s.data().data || 'null'); } catch(e){ return null; } },
  async saveLib(lib){ const data = JSON.stringify(lib); if (byteLen(data) > 900000) throw {code:'app/too-big'}; await this.db.collection('aiLibrary').doc(this.uid()).set({data, updatedAt:this.ts()}); },
};
const Cloud = () => (Auth.mode === 'demo' ? DemoCloud : FirebaseCloud);

/* Bibliothèque personnelle (matériaux, composants, symboles), partagée avec le moteur */
let libTimer = 0;
window.APLib = {
  save(lib){ clearTimeout(libTimer); libTimer = setTimeout(async () => { try { await withTimeout(Cloud().saveLib(lib), 15000); } catch(e){ toastA(e?.code === 'app/too-big' ? 'Bibliothèque personnelle trop volumineuse' : 'Bibliothèque non synchronisée (hors ligne ?)'); } }, 800); },
};
async function loadUserLib(){ try { const lib = await withTimeout(Cloud().loadLib(), 12000); await withTimeout(modelReady, 20000); window.APModel.setUserLib(lib || {}); } catch(e){} }

/* ---------- Enregistrement automatique du projet ouvert ---------- */
const Save = {
  pid:null, role:'', meta:null, last:'', timer:0, first:0, busy:false, again:false, state:'', lastThumb:0, err:0,
  canWrite(){ return !!this.pid && (this.role === 'owner' || this.role === 'edit') && canCloud(); },
  begin(meta, role, data){ window.APCloudActive = true; this.pid = meta.id; this.meta = meta; this.role = role; this.last = data; this.lastThumb = 0; this.err = 0; clearTimeout(this.timer); this.first = 0;
    this.set(this.canWrite() ? 'saved' : 'ro'); },
  end(){ window.APCloudActive = false; clearTimeout(this.timer); this.pid = null; this.meta = null; this.role = ''; this.set(''); },
  changed(){
    if (!this.pid) return;
    if (!this.canWrite()){ this.set('ro'); return; }
    if (!this.first) this.first = Date.now();
    this.set('dirty'); clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), Date.now() - this.first > 12000 ? 0 : 1800);
  },
  async flush(force){
    if (!this.pid || !this.canWrite() || !window.APModel) return;
    if (this.busy){ this.again = true; return; }
    clearTimeout(this.timer); this.first = 0;
    const data = window.APModel.get(), pid = this.pid, meta = this.meta;
    const wantThumb = force || Date.now() - this.lastThumb > 45000;
    if (data === this.last && !wantThumb){ this.set('saved'); return; }
    if (byteLen(data) > MAX_DATA){ this.set('big'); return; }
    // quota connu localement : projets du compte en cours
    if (meta.ownerUid === me.uid && H.usage != null && byteLen(data) - (meta.size || 0) > 0 && H.usage + byteLen(data) - (meta.size || 0) > PLANS[planKey()].bytes){ this.set('quota'); return; }
    this.busy = true; this.set('saving');
    try {
      const extra = {}; if (!meta.linkMode){ extra.linkMode = 'off'; meta.linkMode = 'off'; }   // projets créés avant le partage (bloc ai* v1/v2) : champ requis par les règles
      if (wantThumb){ const t = window.APModel.thumb(); if (t && t.length < 88000) extra.thumb = t; }
      await withTimeout(Cloud().save(pid, data, extra, meta.size || 0, meta.ownerUid), 20000);
      if (this.pid === pid){ if (meta.ownerUid === me.uid && H.usage != null) H.usage += byteLen(data) - (meta.size || 0); meta.size = byteLen(data); this.last = data; this.err = 0; if (extra.thumb){ this.lastThumb = Date.now(); meta.thumb = extra.thumb; } this.set('saved'); }
    } catch(e){
      if (this.pid === pid){ this.err++; const c = e?.code; this.set(c === 'app/quota' || c === 'app/quota-or-denied' ? 'quota' : c === 'permission-denied' ? 'denied' : 'error'); if (!['permission-denied', 'app/quota', 'app/quota-or-denied'].includes(c)) this.timer = setTimeout(() => this.flush(), Math.min(60000, 5000 * this.err)); }
    } finally { this.busy = false; if (this.again){ this.again = false; this.flush(); } }
  },
  pending(){ return !!this.pid && this.canWrite() && (this.state === 'dirty' || this.state === 'saving' || this.state === 'error'); },
  set(s){
    this.state = s; const el = $a('#cloudState'); if (!el) return;
    const hm = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
    const T = {saved:`Enregistré · ${hm}`, saving:'Enregistrement…', dirty:'Modifications en cours…', error:'Hors ligne · nouvel essai…', denied:'Enregistrement refusé',
      big:'Projet trop volumineux pour le cloud', quota:'Espace cloud plein', ro:'Lecture seule'};
    el.hidden = !s; el.textContent = T[s] || ''; el.className = 'cs ' + s;
    el.title = s === 'ro' ? 'Ce projet vous est partagé en lecture : vos modifications ne sont pas enregistrées.' : s === 'quota' ? 'Le stockage du propriétaire est plein : libérez de la place ou passez à une licence ARCHIINDUS (50 Mo).' : '';
    if (s === 'quota' && !this.quotaWarned){ this.quotaWarned = true; toastA(this.meta?.ownerUid === me?.uid ? 'Votre espace cloud est plein : vos dernières modifications ne sont pas enregistrées.' : 'L\'espace cloud du propriétaire est plein : modifications non enregistrées.'); }
  },
};
window.addEventListener('ap:changed', () => Save.changed());
window.addEventListener('beforeunload', e => { if (Save.pending()){ Save.flush(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Save.pending()) Save.flush(); });

/* ---------- Pont avec le dessin ARCHIINDUS (moteur) ---------- */
let modelReady = window.APModel ? Promise.resolve() : new Promise(res => window.addEventListener('ap:ready', res, {once:true}));
async function openInModel(project, meta, role){
  await withTimeout(modelReady, 20000, 'app/engine');
  let s; try { s = typeof project === 'string' ? JSON.parse(project) : project; } catch(e){ s = {}; }
  if (Save.pending()) try { await withTimeout(Save.flush(true), 8000); } catch(e){}
  Save.end(); window.APCloudActive = !!meta; Save.quotaWarned = false;
  window.APModel.load({...s, name:meta ? meta.name : (s.name || 'Projet')});
  if (meta) Save.begin(meta, role, window.APModel.get()); else Save.end();
  const nm = $a('#projName'); if (nm){ nm.textContent = meta ? meta.name : (s.name || 'Projet d\'essai'); nm.title = meta ? (role === 'owner' ? 'Mon projet' : `Partagé par ${meta.ownerName || meta.ownerEmail || '—'}`) : ''; }
  ctx.where = 'app'; hideHome();
}
async function downloadText(filename, text){
  try { const dl = window.claude?.use ? await window.claude.use('downloads') : null; if (dl){ await dl.save({filename, data:text}); return; } } catch(e){ if (e?.code === 'declined') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'application/json'})); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const safeName = s => (String(s || 'projet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'projet').slice(0, 60);

/* ---------- Accueil ---------- */
const H = {tab:'mine', folder:'', sharedFolder:'', mine:null, shared:null, usage:null, loading:false, err:''};
const ago = t => { if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 60) return 'à l\'instant'; if (s < 3600) return `il y a ${Math.round(s / 60)} min`; if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'}); };
const kb = n => n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round((n || 0) / 1000)) + ' Ko';
const ROLE = {owner:'Propriétaire', edit:'Modification', view:'Lecture'};
const ICON = {
  folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  plan:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 38V14l16-8 16 8v24"/><path d="M8 38h32M18 38V24h12v14"/><path d="M8 14h32" opacity=".5"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};
const folderCounts = () => { const fs = H.mine?.folders || []; return {shared:fs.filter(f => f.shared).length, priv:fs.filter(f => !f.shared).length}; };

function showHome(){
  Save.flush(true); Save.end();
  ctx.where = 'home'; const h = $a('#home'); h.hidden = false; $a('#app').inert = true;
  const hb = $a('#homeBrand'); if (hb && !hb.querySelector('.brand-mark')){ const mk = document.querySelector('.top .brand-mark'); if (mk) hb.prepend(mk.cloneNode(true)); }
  const hu = $a('#homeUser'); hu.textContent = initials(); hu.title = fullName();
  const hour = new Date().getHours(); $a('#homeHello').textContent = `${hour < 18 && hour > 4 ? 'Bonjour' : 'Bonsoir'} ${me?.firstName || ''}`.trim();
  renderHome(); loadHome();
}
function hideHome(){ $a('#home').hidden = true; const app = $a('#app'); if (app) app.inert = false; }
async function loadHome(){
  H.loading = true; H.err = ''; renderHome();
  try {
    await accessReady;
    const [mine, shared] = await withTimeout(Promise.all([canCloud() ? Cloud().listMine() : Promise.resolve({projects:[], folders:[]}), Cloud().listShared()]), 15000);
    H.mine = mine; H.shared = shared;
    try { H.usage = (await withTimeout(Cloud().usage(mine.projects), 10000)).bytes; } catch(e){ H.usage = mine.projects.reduce((s, p) => s + (p.size || 0), 0); }
  } catch(e){ H.err = e?.code === 'app/timeout' ? 'Le cloud ne répond pas. Vérifiez votre connexion.' : errMsg(e); }
  H.loading = false; renderHome();
}
function renderQuota(){
  const q = $a('#homeQuota'); if (!q) return;
  const plan = PLANS[planKey()], used = H.usage ?? 0, pct = Math.min(100, used / plan.bytes * 100), fc = folderCounts();
  q.innerHTML = `<div class="q-h"><span>Mon cloud</span><b class="q-plan ${planKey()}">${esc(plan.label)}</b></div>
    <div class="q-num"><b>${used && used < 1e6 ? kb(used) : mb(used)}</b> / ${mb(plan.bytes)}</div>
    <div class="q-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%" class="${pct > 90 ? 'full' : pct > 70 ? 'mid' : ''}"></i></div>
    <dl class="q-dl"><dt>Projets</dt><dd>${H.mine?.projects.length ?? '—'}</dd><dt>Dossiers</dt><dd>${fc.priv} / ${FOLDER_LIMITS.priv}</dd><dt>Dossiers partagés</dt><dd>${fc.shared} / ${FOLDER_LIMITS.shared}</dd></dl>
    ${planKey() === 'free' ? `<button type="button" class="q-up" data-hact="upgrade">Passer à 50 Mo avec une licence</button>` : ''}`;
}
function crumbs(){
  const fs = H.mine?.folders || [], out = []; let f = fs.find(x => x.id === H.folder), guard = 0;
  while (f && guard++ < 20){ out.unshift(f); f = fs.find(x => x.id === f.parentId); }
  return out;
}
function cardHtml(p, shared){
  const thumb = p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ICON.plan;
  const sub = shared ? `${esc(p.ownerName || p.ownerEmail || '')} · ${ROLE[p.role] || 'Lecture'}` : `${ago(p.updatedAt)}${p.updatedBy && p.updatedBy !== me.uid && p.updatedByName ? ' par ' + esc(p.updatedByName) : ''} · ${kb(p.size)}`;
  const badges = !shared && (p.linkMode && p.linkMode !== 'off') ? `<span class="hb" title="Partagé par lien">${ICON.share}</span>` : '';
  return `<article class="hcard${p.locked ? ' locked' : ''}" data-open="${esc(p.id)}" data-shared="${shared ? 1 : ''}" tabindex="0" aria-label="Ouvrir ${esc(p.name)}">
    <div class="hthumb">${p.locked ? ICON.lock : thumb}${badges}</div>
    <div class="hmeta"><b title="${esc(p.name)}">${esc(p.name)}</b><span>${p.locked ? 'Confirmez votre email pour l\'ouvrir' : sub}</span></div>
    <button type="button" class="hdots" data-menu="${esc(p.id)}" data-shared="${shared ? 1 : ''}" aria-label="Gérer ${esc(p.name)}">${ICON.dots}</button></article>`;
}
function folderHtml(f, shared){
  const n = shared ? (f.projects || []).length : (H.mine?.projects || []).filter(p => p.folderId === f.id).length;
  const sub = shared ? `${esc(f.ownerName || '')} · ${ROLE[f.role] || 'Lecture'}` : `${n} projet${n > 1 ? 's' : ''}${f.shared ? ' · partagé' : ''}`;
  return `<div class="hfold${f.shared && !shared ? ' sh' : ''}${f.locked ? ' locked' : ''}" data-folder="${esc(f.id)}" data-shared="${shared ? 1 : ''}" tabindex="0">${f.locked ? ICON.lock : ICON.folder}<div><b>${esc(f.name)}</b><small>${f.locked ? 'Email à confirmer' : sub}</small></div>
    ${f.shared && !shared ? `<span class="hb2" title="Dossier partagé">${ICON.share}</span>` : ''}<button type="button" class="hdots" data-fmenu="${esc(f.id)}" data-shared="${shared ? 1 : ''}" aria-label="Gérer le dossier ${esc(f.name)}">${ICON.dots}</button></div>`;
}
/* Bandeau « offre gratuite » dans Mes projets (au lieu d'un écran à chaque ouverture) ; masquable */
function renderOffer(){
  const el = $a('#homeOffer'); if (!el) return;
  const hide = planKey() !== 'free' || access.level === 'pending' || !me || store.get('ai.offerHide.' + me.uid);
  el.hidden = !!hide; if (hide) return;
  el.innerHTML = `<div class="ho-in"><div><b>Offre gratuite</b><span>Tous les outils de modélisation, 10 Mo de cloud, 5 dossiers et 3 dossiers partagés. Les exports (PDF, DXF, STEP, IFC, Archi Vision, nomenclatures) demandent une licence ARCHIINDUS.</span></div>
    <div class="ho-a"><a class="ho-b" href="${OFFERS_URL}" target="_blank" rel="noopener">Voir les offres</a><button type="button" class="ho-b" data-hact="key">J'ai une clé de licence</button><button type="button" class="ho-x" data-hact="offer-hide" aria-label="Masquer">✕</button></div></div>`;
}
function renderHome(){
  const body = $a('#homeBody'); if (!body) return;
  $a('#homeTabs').querySelectorAll('[data-htab]').forEach(b => b.setAttribute('aria-selected', b.dataset.htab === H.tab));
  const lb = $a('#homeLic'); if (lb) lb.hidden = planKey() !== 'free' || access.level === 'pending';
  const inShared = H.tab === 'shared' && H.sharedFolder, sf = inShared ? (H.shared?.folders || []).find(f => f.id === H.sharedFolder) : null;
  const canCreate = canCloud() && (H.tab === 'mine' || (sf && sf.role === 'edit'));
  $a('#homeNewP').disabled = !canCreate; $a('#homeImport').disabled = !canCreate; $a('#homeNewF').disabled = !(canCloud() && H.tab === 'mine' && !curFolderShared());
  renderQuota(); renderOffer();
  const sub = $a('#homeSub'); if (sub) sub.textContent = H.tab === 'mine' ? 'Vos projets s\'enregistrent tout seuls dans le cloud Studio Prism.' : 'Les projets et dossiers que l\'on vous a partagés.';
  if (H.loading && !(H.tab === 'mine' ? H.mine : H.shared)){ body.innerHTML = `<div class="hgrid">${'<div class="hcard sk"><div class="hthumb"></div><div class="hmeta"><b></b><span></span></div></div>'.repeat(4)}</div>`; return; }
  if (H.err){ body.innerHTML = `<div class="hempty"><p>${esc(H.err)}</p><button type="button" class="ap-btn alt" data-hact="reload">Réessayer</button></div>`; return; }
  if (H.tab === 'mine'){
    const fs = (H.mine?.folders || []).filter(f => (f.parentId || '') === H.folder).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const ps = (H.mine?.projects || []).filter(p => (p.folderId || '') === H.folder).sort((a, b) => b.updatedAt - a.updatedAt);
    const cr = crumbs(), local = !H.folder ? localDraft() : null;
    let h = !H.folder ? '' : `<nav class="hcrumbs" aria-label="Dossiers"><button type="button" data-folder="">Mes projets</button>${cr.map(f => `<span>›</span><button type="button" data-folder="${esc(f.id)}">${esc(f.name)}</button>`).join('')}</nav>`;
    if (local) h += `<div class="hlocal"><div><b>Un projet est enregistré sur cet appareil</b><span>${esc(local.name || 'Sans titre')} · ${local.objects.length} objets</span></div><button type="button" class="ap-btn alt" data-hact="import-local">Enregistrer dans le cloud</button><button type="button" class="ap-link" data-hact="dismiss-local">Ignorer</button></div>`;
    if (fs.length) h += `<h2 class="hsec">Dossiers</h2><div class="hfolders">${fs.map(f => folderHtml(f, false)).join('')}</div>`;
    h += ps.length ? `<h2 class="hsec">${H.folder ? 'Projets du dossier' : 'Projets récents'}</h2><div class="hgrid">${ps.map(p => cardHtml(p, false)).join('')}</div>`
      : `<div class="hempty"><div class="hic">${ICON.plan}</div><h3>${H.folder ? 'Ce dossier est vide' : 'Aucun projet pour l\'instant'}</h3><p>Créez un projet : il s'enregistre tout seul dans le cloud, à chaque modification.</p><button type="button" class="ap-btn" data-hact="new">Nouveau projet</button></div>`;
    body.innerHTML = h;
  } else if (sf){
    const ps = (sf.projects || []).sort((a, b) => b.updatedAt - a.updatedAt);
    body.innerHTML = `<nav class="hcrumbs"><button type="button" data-sfolder="">Partagés avec moi</button><span>›</span><button type="button">${esc(sf.name)}</button></nav>
      <p class="hint">Dossier de ${esc(sf.ownerName || '—')} · ${ROLE[sf.role] || 'Lecture'}${sf.role === 'edit' ? ' : vous pouvez y créer des projets (stockés chez le propriétaire).' : '.'}</p>
      ${ps.length ? `<div class="hgrid">${ps.map(p => cardHtml(p, true)).join('')}</div>` : `<div class="hempty"><h3>Dossier vide</h3></div>`}`;
  } else {
    const fs = H.shared?.folders || [], ps = (H.shared?.projects || []).sort((a, b) => b.updatedAt - a.updatedAt), locked = fs.some(f => f.locked) || ps.some(p => p.locked);
    body.innerHTML = (locked ? `<div class="hlocal"><div><b>Confirmez votre adresse email</b><span>Les projets partagés ne s'ouvrent qu'avec un compte Studio Prism vérifié.</span></div><button type="button" class="ap-btn alt" data-hact="verify">Vérifier mon email</button></div>` : '')
      + (fs.length ? `<h2 class="hsec">Dossiers partagés</h2><div class="hfolders">${fs.map(f => folderHtml(f, true)).join('')}</div>` : '')
      + (ps.length ? `<h2 class="hsec">Projets partagés</h2><div class="hgrid">${ps.map(p => cardHtml(p, true)).join('')}</div>` : '')
      + (!fs.length && !ps.length ? `<div class="hempty"><div class="hic">${ICON.share}</div><h3>Rien de partagé avec vous</h3><p>Quand quelqu'un vous partage un projet ou un dossier ARCHIINDUS avec l'adresse ${esc(me.email)}, ou vous envoie un lien, il apparaît ici.</p></div>` : '');
  }
}
function localDraft(){
  try { if (store.get('ai.localDismissed.' + me.uid)) return null; const s = JSON.parse(localStorage.getItem('ai.doc.v1')); return s && Array.isArray(s.objects) && (s.objects.length || (s.features || []).length || (s.comps || []).length) && !s.isSample ? s : null; } catch(e){ return null; }
}
const curFolderShared = () => !!(H.mine?.folders || []).find(f => f.id === H.folder)?.shared;
const findP = (id, shared) => shared ? [...(H.shared?.projects || []), ...(H.shared?.folders || []).flatMap(f => f.projects || [])].find(p => p.id === id) : (H.mine?.projects || []).find(p => p.id === id);
async function openProject(p){
  if (p.locked) return verifyEmailFlow();
  showBusy(`Ouverture de « ${p.name} »…`);
  try { const r = await withTimeout(Cloud().open(p.id), 20000); hideBusy(); await openInModel(r.data, r.meta, r.role); toastA(r.role === 'owner' || r.role === 'edit' ? 'Enregistrement automatique activé' : 'Ouvert en lecture seule'); }
  catch(e){ hideBusy(); toastA(e?.code === 'app/engine' ? 'Le moteur 3D n\'est pas encore chargé. Réessayez.' : e?.code === 'permission-denied' ? 'Accès refusé à ce projet.' : errMsg(e)); }
}
function quotaBlock(size){ if (H.usage != null && H.usage + size > PLANS[planKey()].bytes){ show('licence', {reason:'quota'}); return true; } return false; }
async function newProject(name, data){
  if (!canCloud()) return;
  const folderId = H.tab === 'shared' ? H.sharedFolder : H.folder;
  const json = data || window.APModel.blankJSON(name);
  if (H.tab === 'mine' && quotaBlock(byteLen(json))) return;
  showBusy('Création du projet…');
  try { const m = await withTimeout(Cloud().create({name, folderId, data:json}), 20000); hideBusy();
    if (m.ownerUid === me.uid){ H.mine?.projects.push(m); if (H.usage != null) H.usage += byteLen(json); if (folderId){ const f = H.mine?.folders.find(x => x.id === folderId); if (f) f.pids = [...(f.pids || []), m.id]; } }
    await openInModel(data || window.APModel.blankJSON(name), m, m.ownerUid === me.uid ? 'owner' : 'edit'); }
  catch(e){ hideBusy(); toastA(e?.code === 'app/too-big' ? 'Projet trop volumineux pour le cloud.' : e?.code === 'app/quota' || e?.code === 'app/quota-or-denied' ? 'Espace cloud plein (ou accès refusé) : libérez de la place.' : e?.code === 'permission-denied' ? 'Création refusée.' : errMsg(e)); }
}
function showBusy(t){ const b = $a('#homeBusy'); b.querySelector('span').textContent = t; b.hidden = false; }
function hideBusy(){ $a('#homeBusy').hidden = true; }

/* Boîte de dialogue */
function eyes(root){
  root.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = root.querySelector('#' + b.dataset.eye); if (!i) return; const on = i.type === 'password'; i.type = on ? 'text' : 'password'; i.classList.add('pw'); b.textContent = on ? 'Masquer' : 'Afficher'; b.setAttribute('aria-label', on ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); i.focus(); });
}
function dlg(html, wire){
  const d = $a('#apDlg'); d.querySelector('.dlg-card').innerHTML = html; d.hidden = false;
  d.querySelectorAll('[data-dlg="close"]').forEach(b => b.onclick = closeDlg);
  const f = d.querySelector('input:not([type=checkbox]),select'); if (f) setTimeout(() => f.focus(), 40);
  wire && wire(d);
}
function closeDlg(){ $a('#apDlg').hidden = true; }
$a('#apDlg').addEventListener('click', e => { if (e.target.id === 'apDlg') closeDlg(); });
function askText(title, label, value, okLabel, onOk){
  dlg(`<h3>${esc(title)}</h3><form id="dlgF"><label class="ap-field"><span>${esc(label)}</span><span class="ap-in"><input id="dlgIn" maxlength="120" value="${esc(value || '')}"></span></label><p class="ap-err" id="dlgErr"></p>
    <div class="dlg-acts"><button type="button" class="ap-btn alt" data-dlg="close">Annuler</button><button class="ap-btn" type="submit">${esc(okLabel)}</button></div></form>`, d => {
    const i = d.querySelector('#dlgIn'); i.select();
    d.querySelector('#dlgF').onsubmit = async e => { e.preventDefault(); const v = i.value.trim(); if (!v) return d.querySelector('#dlgErr').textContent = 'Indiquez un nom.';
      const b = d.querySelector('[type=submit]'); busy(b, true); try { await onOk(v); closeDlg(); } catch(err){ busy(b, false); d.querySelector('#dlgErr').textContent = err?.message && !err.code ? err.message : errMsg(err); } };
  });
}
function confirmDlg(title, text, okLabel, onOk){
  dlg(`<h3>${esc(title)}</h3><p class="dlg-p">${text}</p><p class="ap-err" id="dlgErr"></p><div class="dlg-acts"><button type="button" class="ap-btn alt" data-dlg="close">Annuler</button><button type="button" class="ap-btn danger" id="dlgOk">${esc(okLabel)}</button></div>`, d => {
    d.querySelector('#dlgOk').onclick = async e => { busy(e.currentTarget, true); try { await onOk(); closeDlg(); } catch(err){ busy(e.currentTarget, false); d.querySelector('#dlgErr').textContent = errMsg(err); } };
  });
}
function moveDlg(p){
  const fs = H.mine.folders, path = f => { const n = []; let x = f, g = 0; while (x && g++ < 20){ n.unshift(x.name); x = fs.find(y => y.id === x.parentId); } return n.join(' › '); };
  const opts = [{id:'', label:'Mes projets (racine)'}, ...fs.map(f => ({id:f.id, label:path(f) + (f.shared ? ' · partagé' : '')})).sort((a, b) => a.label.localeCompare(b.label, 'fr'))];
  dlg(`<h3>Déplacer « ${esc(p.name)} »</h3><div class="dlg-list">${opts.map(o => `<button type="button" data-to="${esc(o.id)}" class="${(p.folderId || '') === o.id ? 'cur' : ''}">${ICON.folder}<span>${esc(o.label)}</span></button>`).join('')}</div>
    <div class="dlg-acts"><button type="button" class="ap-btn alt" data-dlg="close">Annuler</button></div>`, d => {
    d.querySelectorAll('[data-to]').forEach(b => b.onclick = async () => { const to = b.dataset.to; if (to === (p.folderId || '')) return closeDlg();
      try { await Cloud().move(p, to); const old = fs.find(f => f.id === p.folderId); if (old) old.pids = (old.pids || []).filter(x => x !== p.id); const nf2 = fs.find(f => f.id === to); if (nf2) nf2.pids = [...(nf2.pids || []), p.id];
        p.folderId = to; closeDlg(); renderHome(); toastA(nf2?.shared ? 'Projet déplacé dans un dossier partagé : il devient visible par ses invités' : 'Projet déplacé'); } catch(e){ toastA(errMsg(e)); } });
  });
}
function linkUrl(t){ return t.linkToken ? `${APP_URL}#/${t.kind === 'folder' ? 'd' : 'p'}/${encodeURIComponent(t.id)}?k=${t.linkToken}${t.linkPw ? '&pw=1' : ''}` : ''; }
async function shareDlg(target){
  // target : projet ({kind:'project', …}) ou dossier ({kind:'folder', …})
  const folder = target.kind === 'folder';
  if (folder && !target.shared){
    const fc = folderCounts();
    if (fc.shared >= FOLDER_LIMITS.shared) return dlg(`<h3>Limite atteinte</h3><p class="dlg-p">Vous avez déjà ${FOLDER_LIMITS.shared} dossiers partagés. Arrêtez le partage d'un autre dossier pour partager celui-ci.</p><div class="dlg-acts"><button class="ap-btn" data-dlg="close">Compris</button></div>`);
    if ((H.mine?.folders || []).some(f => f.parentId === target.id)) return dlg(`<h3>Dossier non partageable</h3><p class="dlg-p">Un dossier partagé ne peut pas contenir de sous-dossiers. Déplacez ou supprimez d'abord ses sous-dossiers.</p><div class="dlg-acts"><button class="ap-btn" data-dlg="close">Compris</button></div>`);
  }
  let shares = []; try { shares = await Cloud().listShares(target); } catch(e){}
  const render = () => `<h3>Partager ${folder ? 'le dossier' : ''} « ${esc(target.name)} »</h3>
    <p class="dlg-p">${folder ? 'Les invités voient tous les projets du dossier. Avec le droit « Modification », ils peuvent aussi y créer des projets : tout reste stocké sur votre espace cloud.' : 'Les invités ouvrent le projet avec leur compte Studio Prism vérifié.'} Leurs droits dépendent aussi de leur propre offre : sans licence, un invité ne peut pas exporter.</p>
    <form id="shF" class="dlg-row"><input id="shEmail" type="email" placeholder="email@exemple.fr" autocomplete="off" aria-label="Email de la personne"><select id="shRole" aria-label="Droits"><option value="view">Lecture</option><option value="edit">Modification</option></select><button class="ap-btn" type="submit">Inviter</button></form>
    <p class="ap-err" id="dlgErr"></p>
    <ul class="dlg-people">${shares.length ? shares.map(s => `<li><span class="av">${esc(s.email.charAt(0).toUpperCase())}</span><span class="em">${esc(s.email)}</span>
      <select data-role="${esc(s.email)}" aria-label="Droits de ${esc(s.email)}"><option value="view"${s.role === 'view' ? ' selected' : ''}>Lecture</option><option value="edit"${s.role === 'edit' ? ' selected' : ''}>Modification</option></select>
      <a class="ap-link" href="mailto:${esc(s.email)}?subject=${encodeURIComponent(`${folder ? 'Dossier' : 'Projet'} ARCHIINDUS partagé : ${target.name}`)}&body=${encodeURIComponent(`Bonjour,\n\nJe vous ai partagé ${folder ? 'le dossier' : 'le projet'} ARCHIINDUS « ${target.name} ». Ouvrez-le avec votre compte Studio Prism (${s.email}) :\n${APP_URL}\n\n${fullName()}`)}" title="Prévenir par email">Prévenir</a>
      <button type="button" class="ap-link danger" data-rm="${esc(s.email)}" aria-label="Retirer ${esc(s.email)}">Retirer</button></li>`).join('') : '<li class="none">Personne pour l\'instant.</li>'}</ul>
    <div class="dlg-sec"><b>Accès par lien</b>
      <div class="dlg-row"><select id="lkMode" aria-label="Accès par lien"><option value="off"${target.linkMode === 'off' || !target.linkMode ? ' selected' : ''}>Désactivé</option><option value="view"${target.linkMode === 'view' ? ' selected' : ''}>Toute personne avec le lien · Lecture</option><option value="edit"${target.linkMode === 'edit' ? ' selected' : ''}>Toute personne avec le lien · Modification</option></select></div>
      <label class="ap-check"><input type="checkbox" id="lkPwOn"${target.linkPw ? ' checked' : ''}><span>Protéger par un mot de passe</span></label>
      <div class="dlg-row" id="lkPwRow"${target.linkPw ? '' : ' hidden'}><span class="ap-in"><input id="lkPw" type="password" placeholder="${target.linkPw ? 'Nouveau mot de passe (vide = garder le lien actuel)' : 'Mot de passe du lien'}" autocomplete="new-password"><button type="button" class="ap-eye" data-eye="lkPw" aria-label="Afficher le mot de passe">Afficher</button></span></div>
      <div class="dlg-row"><input id="lkUrl" readonly value="${esc(linkUrl(target))}" placeholder="Aucun lien actif" aria-label="Lien de partage"><button type="button" class="ap-btn alt" id="lkCopy"${target.linkToken ? '' : ' disabled'}>Copier</button></div>
      <div class="dlg-row"><button type="button" class="ap-btn" id="lkApply">Appliquer</button></div>
      <p class="dlg-p small">Changer le mode ou le mot de passe crée un nouveau lien : l'ancien cesse de fonctionner. Les personnes ayant le lien doivent être connectées avec un compte Studio Prism vérifié.</p></div>
    <div class="dlg-acts"><button type="button" class="ap-btn alt" data-dlg="close">Terminé</button></div>`;
  const wire = d => {
    const err = t => d.querySelector('#dlgErr').textContent = t || '';
    d.querySelector('#shF').onsubmit = async e => {
      e.preventDefault(); const em = d.querySelector('#shEmail').value.trim().toLowerCase(), role = d.querySelector('#shRole').value;
      if (!emailOK(em) || em.includes('/')) return err('Entrez une adresse email valide.');
      if (em === emailKey(me.email)) return err('C\'est votre propre adresse.');
      try { await Cloud().addShare(target, em, role); shares = shares.filter(s => s.email !== em).concat([{email:em, role}]); dlg(render(), wire); renderHome(); toastA(`Partagé avec ${em}`); } catch(x){ err(errMsg(x)); }
    };
    d.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => { try { await Cloud().addShare(target, s.dataset.role, s.value); shares.find(x => x.email === s.dataset.role).role = s.value; toastA('Droits modifiés'); } catch(x){ err(errMsg(x)); } });
    d.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { try { await Cloud().removeShare(target, b.dataset.rm); shares = shares.filter(s => s.email !== b.dataset.rm); dlg(render(), wire); renderHome(); } catch(x){ err(errMsg(x)); } });
    eyes(d);
    const pwOn = d.querySelector('#lkPwOn'); pwOn.onchange = () => d.querySelector('#lkPwRow').hidden = !pwOn.checked;
    d.querySelector('#lkCopy').onclick = async () => { const u = d.querySelector('#lkUrl').value; if (!u) return; try { await navigator.clipboard.writeText(u); toastA('Lien copié'); } catch(e){ d.querySelector('#lkUrl').select(); document.execCommand('copy'); toastA('Lien copié'); } };
    d.querySelector('#lkApply').onclick = async e => {
      const mode = d.querySelector('#lkMode').value, pw = pwOn.checked ? d.querySelector('#lkPw').value : '';
      if (mode !== 'off' && pwOn.checked && !pw && !(target.linkPw && target.linkMode === mode)) return err('Choisissez le mot de passe du lien.');
      if (mode !== 'off' && pwOn.checked && !pw && target.linkPw && target.linkMode === mode) return err('');
      if (pw && pw.length < 4) return err('Mot de passe trop court (4 caractères minimum).');
      busy(e.currentTarget, true, 'Création du lien…');
      try { const tok = await Cloud().setLink(target, mode, pw); Object.assign(target, {linkMode:mode, linkToken:tok, linkPw:!!pw && mode !== 'off'}); dlg(render(), wire); renderHome(); toastA(mode === 'off' ? 'Lien désactivé' : 'Nouveau lien prêt à copier'); }
      catch(x){ busy(e.currentTarget, false); err(errMsg(x)); }
    };
  };
  dlg(render(), wire);
}

/* Menus ⋮ */
const hm = () => $a('#homeMenu');
function openMenu(anchor, items){
  const m = hm(); m.innerHTML = items.map(i => i === '-' ? '<hr>' : `<button type="button" data-mi="${i.k}" class="${i.danger ? 'danger' : ''}"${i.off ? ' disabled' : ''}><b>${esc(i.t)}</b>${i.s ? `<span>${esc(i.s)}</span>` : ''}</button>`).join('');
  m.hidden = false; const r = anchor.getBoundingClientRect();
  m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 12) + 'px';
  m.style.left = Math.max(12, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 12)) + 'px';
  return new Promise(res => { m.onclick = e => { const b = e.target.closest('[data-mi]'); if (!b) return; m.hidden = true; res(b.dataset.mi); }; menuCancel = () => res(null); });
}
let menuCancel = null;
document.addEventListener('click', e => { const m = hm(); if (m && !m.hidden && !m.contains(e.target) && !e.target.closest('[data-menu],[data-fmenu]')){ m.hidden = true; menuCancel && menuCancel(); } });

async function projectMenu(btn, p, shared){
  const full = fullAccess();
  const items = shared ? [
    {k:'open', t:'Ouvrir'},
    {k:'copy', t:'Faire une copie', s:'Dans mes projets (mon stockage)', off:p.locked},
    '-', {k:'leave', t:'Retirer de ma liste', danger:true, off:p.via === 'folder'}] : [
    {k:'open', t:'Ouvrir'}, {k:'rename', t:'Renommer'}, {k:'dup', t:'Dupliquer', s:'Crée une copie de sauvegarde'},
    {k:'backup', t:'Télécharger une sauvegarde', s:full ? 'Fichier .json, à garder sur votre appareil' : 'Licence ARCHIINDUS requise'}, {k:'move', t:'Déplacer vers…'},
    {k:'share', t:'Partager…', s:p.linkMode && p.linkMode !== 'off' ? 'Lien actif' : ''}, '-', {k:'del', t:'Supprimer', danger:true}];
  const k = await openMenu(btn, items); if (!k) return;
  if (k === 'open') return openProject(p);
  if (k === 'rename') return askText('Renommer le projet', 'Nom du projet', p.name, 'Renommer', async v => { await Cloud().update(p.id, {name:v}); p.name = v; renderHome(); });
  if (k === 'dup' || k === 'copy') return askText(k === 'dup' ? 'Dupliquer le projet' : 'Faire une copie', 'Nom de la copie', `${p.name} (${k === 'dup' ? 'sauvegarde du ' + new Date().toLocaleDateString('fr-FR') : 'copie'})`, 'Créer la copie', async v => {
    const r = await Cloud().open(p.id); if (H.usage != null && H.usage + byteLen(r.data) > PLANS[planKey()].bytes) throw {code:'app/quota'};
    const m = await Cloud().create({name:v, folderId:k === 'dup' ? (p.folderId || '') : '', data:r.data, thumb:p.thumb || ''});
    H.mine?.projects.push(m); if (H.usage != null) H.usage += byteLen(r.data); renderHome(); toastA('Copie créée');
  });
  if (k === 'backup'){
    if (!full) return show('licence', {reason:'export'});
    try { const r = await Cloud().open(p.id); await downloadText(`${safeName(p.name)}-${new Date().toISOString().slice(0, 10)}.archiindus.json`, r.data); toastA('Sauvegarde téléchargée'); } catch(e){ toastA(errMsg(e)); }
    return;
  }
  if (k === 'move') return moveDlg(p);
  if (k === 'share') return shareDlg({...p, kind:'project'}).then(() => {});
  if (k === 'del') return confirmDlg('Supprimer le projet', `« <b>${esc(p.name)}</b> » sera supprimé définitivement, pour vous et pour les personnes avec qui il est partagé. Pensez à télécharger une sauvegarde si besoin.`, 'Supprimer', async () => {
    await Cloud().remove(p.id); H.mine.projects = H.mine.projects.filter(x => x.id !== p.id); if (H.usage != null) H.usage = Math.max(0, H.usage - (p.size || 0)); renderHome(); toastA('Projet supprimé');
  });
  if (k === 'leave') return confirmDlg('Retirer de ma liste', `Vous n'aurez plus accès à « <b>${esc(p.name)}</b> », sauf si on vous le partage à nouveau.`, 'Retirer', async () => {
    await Cloud().leave(p, 'project'); H.shared.projects = H.shared.projects.filter(x => x.id !== p.id); renderHome();
  });
}
async function folderMenu(btn, f, shared){
  if (shared){
    const k = await openMenu(btn, [{k:'open', t:'Ouvrir'}, '-', {k:'leave', t:'Retirer de ma liste', danger:true}]); if (!k) return;
    if (k === 'open'){ H.sharedFolder = f.id; return renderHome(); }
    return confirmDlg('Retirer de ma liste', `Vous n'aurez plus accès au dossier « <b>${esc(f.name)}</b> ».`, 'Retirer', async () => { await Cloud().leave(f, 'folder'); H.shared.folders = H.shared.folders.filter(x => x.id !== f.id); renderHome(); });
  }
  const k = await openMenu(btn, [{k:'open', t:'Ouvrir'}, {k:'rename', t:'Renommer'}, {k:'share', t:'Partager…', s:f.shared ? 'Dossier partagé' : `${folderCounts().shared} / ${FOLDER_LIMITS.shared} dossiers partagés`}, '-', {k:'del', t:'Supprimer le dossier', s:'Son contenu remonte d\'un niveau', danger:true}]); if (!k) return;
  if (k === 'open'){ H.folder = f.id; return renderHome(); }
  if (k === 'rename') return askText('Renommer le dossier', 'Nom du dossier', f.name, 'Renommer', async v => { await Cloud().updateFolder(f.id, {name:v}); f.name = v; renderHome(); });
  if (k === 'share') return shareDlg(Object.assign(f, {kind:'folder'}));
  if (k === 'del') return confirmDlg('Supprimer le dossier', `Le dossier « <b>${esc(f.name)}</b> » sera supprimé${f.shared ? ' et ses invités perdront l\'accès' : ''}. Les projets et sous-dossiers qu'il contient ne sont pas supprimés : ils remontent d'un niveau.`, 'Supprimer le dossier', async () => {
    await Cloud().removeFolder(f.id, H.mine); const parent = f.parentId || '';
    H.mine.projects.forEach(p => { if (p.folderId === f.id) p.folderId = parent; }); H.mine.folders.forEach(x => { if (x.parentId === f.id) x.parentId = parent; });
    H.mine.folders = H.mine.folders.filter(x => x.id !== f.id); if (H.folder === f.id) H.folder = parent; renderHome();
  });
}
async function verifyEmailFlow(){
  dlg(`<h3>Confirmez votre adresse email</h3><p class="dlg-p">Pour ouvrir un projet partagé, votre compte Studio Prism doit être vérifié. Ouvrez le lien reçu à <b>${esc(me.email)}</b>, puis touchez « J'ai confirmé ».</p><p class="ap-err" id="dlgErr"></p>
    <div class="dlg-acts"><button type="button" class="ap-btn alt" id="vfSend">Renvoyer l'email</button><button type="button" class="ap-btn" id="vfOk">J'ai confirmé</button></div>`, d => {
    d.querySelector('#vfSend').onclick = async e => { busy(e.currentTarget, true, 'Envoi…'); try { await Auth.resendVerification(); busy(e.currentTarget, false); toastA('Email envoyé'); } catch(x){ busy(e.currentTarget, false); d.querySelector('#dlgErr').textContent = errMsg(x); } };
    d.querySelector('#vfOk').onclick = async e => { busy(e.currentTarget, true, 'Vérification…'); try { if (await Cloud().isVerified()){ closeDlg(); toastA('Email confirmé'); loadHome(); } else { busy(e.currentTarget, false); d.querySelector('#dlgErr').textContent = 'Pas encore confirmé. Ouvrez le lien reçu par email, puis réessayez.'; } } catch(x){ busy(e.currentTarget, false); d.querySelector('#dlgErr').textContent = errMsg(x); } };
  });
}

/* Liens de partage : #/p/<projet>?k=<jeton>&pw=1 · #/d/<dossier>?k=… */
function readLinkFromUrl(){
  const m = location.hash.match(/^#\/([pd])\/([\w-]{4,60})(?:\?(.*))?$/); if (!m) return null;
  const q = new URLSearchParams(m[3] || ''); return {kind:m[1] === 'd' ? 'folder' : 'project', pid:decodeURIComponent(m[2]), token:q.get('k') || '', pw:q.get('pw') === '1'};
}
async function openPendingLink(){
  const L = ctx.pendingLink; if (!L) return false; ctx.pendingLink = null;
  try { sessionStorage.removeItem('ai.pendingLink'); history.replaceState(null, '', location.pathname + location.search); } catch(e){}
  const folder = L.kind === 'folder';
  const tryOpen = async () => {
    if (folder){ await loadHome(); const f = (H.shared?.folders || []).find(x => x.id === L.pid); if (!f) throw {code:'permission-denied'}; H.tab = 'shared'; H.sharedFolder = f.id; renderHome(); toastA(`Dossier « ${f.name} » ouvert`); return; }
    const r = await withTimeout(Cloud().open(L.pid), 20000); await openInModel(r.data, r.meta, r.role); toastA(r.role === 'owner' || r.role === 'edit' ? 'Projet partagé ouvert · enregistrement automatique' : 'Projet partagé ouvert en lecture seule');
  };
  showBusy(folder ? 'Ouverture du dossier partagé…' : 'Ouverture du projet partagé…');
  try { await tryOpen(); hideBusy(); return true; }
  catch(e){
    hideBusy();
    if (e?.code === 'app/not-found'){ toastA('Ce projet n\'existe plus.'); return false; }
    if (!(await Cloud().isVerified().catch(() => false))){ verifyEmailFlow(); return false; }
    if (!L.token){ toastA('Vous n\'avez pas accès. Demandez à son propriétaire de vous le partager.'); return false; }
    const claim = async pw => { await Cloud().claimLink(L.kind, L.pid, L.token, pw); await tryOpen(); };
    if (!L.pw){ try { await claim(''); return true; } catch(x){ toastA('Ce lien n\'est plus valide. Demandez un nouveau lien.'); return false; } }
    dlg(`<h3>${folder ? 'Dossier' : 'Projet'} protégé</h3><p class="dlg-p">Ce lien est protégé par un mot de passe. Saisissez celui que le propriétaire vous a communiqué.</p>
      <form id="dlgF"><label class="ap-field"><span>Mot de passe du lien</span><span class="ap-in"><input id="dlgIn" type="password" autocomplete="off"><button type="button" class="ap-eye" data-eye="dlgIn" aria-label="Afficher le mot de passe">Afficher</button></span></label><p class="ap-err" id="dlgErr"></p>
      <div class="dlg-acts"><button type="button" class="ap-btn alt" data-dlg="close">Annuler</button><button class="ap-btn" type="submit">Ouvrir</button></div></form>`, d => {
      eyes(d);
      d.querySelector('#dlgF').onsubmit = async ev => { ev.preventDefault(); const b = d.querySelector('[type=submit]'); busy(b, true, 'Vérification…');
        try { await claim(d.querySelector('#dlgIn').value); closeDlg(); } catch(x){ busy(b, false); d.querySelector('#dlgErr').textContent = 'Mot de passe incorrect, ou lien qui n\'est plus valide.'; } };
    });
    return false;
  }
}

/* Câblage de l'accueil */
$a('#homeTabs').addEventListener('click', e => { const b = e.target.closest('[data-htab]'); if (!b) return; H.tab = b.dataset.htab; H.sharedFolder = ''; renderHome(); });
$a('#homeNewP').addEventListener('click', () => askText('Nouveau projet', 'Nom du projet', 'Nouveau projet', 'Créer', async v => { closeDlg(); await newProject(v); }));
$a('#homeNewF').addEventListener('click', () => {
  if (folderCounts().priv >= FOLDER_LIMITS.priv) return dlg(`<h3>Limite atteinte</h3><p class="dlg-p">Vous avez déjà ${FOLDER_LIMITS.priv} dossiers (non partagés). Supprimez-en un ou partagez-en un (jusqu'à ${FOLDER_LIMITS.shared} dossiers partagés).</p><div class="dlg-acts"><button class="ap-btn" data-dlg="close">Compris</button></div>`);
  askText('Nouveau dossier', 'Nom du dossier', 'Nouveau dossier', 'Créer', async v => { const f = await Cloud().createFolder(v, H.folder); H.mine.folders.push(f); renderHome(); });
});
$a('#homeImport').addEventListener('click', () => $a('#homeFile').click());
$a('#homeSample').addEventListener('click', async () => { try { await openInModel(window.APModel?.sample() || {}, null, ''); $a('#projName').textContent = 'Exemple · non enregistré'; } catch(x){ toastA('Le moteur 3D n\'est pas encore chargé. Réessayez.'); } });
$a('#homeFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
  rd.onload = async () => { e.target.value = ''; try { const s = JSON.parse(rd.result); if (!window.APModel.valid(s)) throw 0; await newProject(s.name || f.name.replace(/\.(archiindus\.)?json$/i, ''), JSON.stringify(s)); } catch(x){ toastA('Ce fichier n\'est pas un projet ARCHIINDUS valide.'); } };
  rd.readAsText(f);
});
$a('#homeLic').addEventListener('click', () => show('licence'));
$a('#homeQuota').addEventListener('click', e => { if (e.target.closest('[data-hact="upgrade"]')) show('licence'); });
$a('#homeOffer').addEventListener('click', e => { const a = e.target.closest('[data-hact]'); if (!a) return; if (a.dataset.hact === 'key') show('licence'); if (a.dataset.hact === 'offer-hide'){ store.set('ai.offerHide.' + me.uid, 1); renderOffer(); } });
$a('#homeBody').addEventListener('click', async e => {
  const t = e.target;
  const pm = t.closest('[data-menu]'); if (pm){ e.stopPropagation(); const p = findP(pm.dataset.menu, !!pm.dataset.shared); if (p) projectMenu(pm, p, !!pm.dataset.shared); return; }
  const fm = t.closest('[data-fmenu]'); if (fm){ e.stopPropagation(); const sh = !!fm.dataset.shared; const f = (sh ? H.shared.folders : H.mine.folders).find(x => x.id === fm.dataset.fmenu); if (f) folderMenu(fm, f, sh); return; }
  const sfo = t.closest('[data-sfolder]'); if (sfo){ H.sharedFolder = sfo.dataset.sfolder; return renderHome(); }
  const fo = t.closest('[data-folder]'); if (fo){ if (fo.dataset.shared){ const f = H.shared.folders.find(x => x.id === fo.dataset.folder); if (f?.locked) return verifyEmailFlow(); H.sharedFolder = fo.dataset.folder; } else H.folder = fo.dataset.folder; return renderHome(); }
  const op = t.closest('[data-open]'); if (op){ const p = findP(op.dataset.open, !!op.dataset.shared); if (p) openProject(p); return; }
  const a = t.closest('[data-hact]'); if (!a) return;
  const k = a.dataset.hact;
  if (k === 'reload') loadHome();
  else if (k === 'new') $a('#homeNewP').click();
  else if (k === 'verify') verifyEmailFlow();
  else if (k === 'import-local'){ const s = localDraft(); if (s){ await newProject(s.name && s.name !== 'Nouveau projet' ? s.name : 'Projet importé', JSON.stringify(s)); if (Save.pid) try { localStorage.removeItem('ai.doc.v1'); } catch(e){} } }
  else if (k === 'dismiss-local'){ store.set('ai.localDismissed.' + me.uid, true); renderHome(); }
});
$a('#homeBody').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.matches('[data-open]') || e.target.matches('[data-folder]'))) e.target.click(); });
$a('#homeBtn').addEventListener('click', () => showHome());
if (!FIREBASE_CONFIG) window.__apT = {PLANS, H, renderHome, FOLDER_LIMITS}; // démo : accès pour les tests
