/* Menu du compte dans l'en-tête de l'app */
const um = $a('#userMenu');
const openUM = e => {
  e.stopPropagation(); if (!um.hidden){ um.hidden = true; return; }
  $a('#umName').textContent = `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'Mon compte';
  $a('#umMail').textContent = me.email + (Auth.mode === 'demo' ? ' · mode démo' : '');
  $a('#umLock').hidden = !Lock.get(me.uid)?.pin;
  const ls = licSummary(), ul = $a('#umLic'); ul.className = 'lic ' + ls.cls; ul.textContent = ls.short;
  const r = e.currentTarget.getBoundingClientRect(); um.hidden = false;
  um.style.top = (r.bottom + 6) + 'px'; um.style.left = Math.max(16, Math.min(r.right - um.offsetWidth, innerWidth - um.offsetWidth - 16)) + 'px';
};
$a('#userBtn').addEventListener('click', openUM); $a('#homeUser').addEventListener('click', openUM);
document.addEventListener('click', e => { if (!um.hidden && !um.contains(e.target)) um.hidden = true; });
$a('#licBadge').addEventListener('click', () => show('licence'));
um.addEventListener('click', e => {
  const b = e.target.closest('[data-um]'); if (!b) return; um.hidden = true;
  ({fiche:() => openClient(true), licence:() => show('licence'), home:() => showHome(), security:() => show('security'), lock:() => show('lock', {noAuto:false}), logout:signOutAll, delete:deleteAccount, theme:() => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; if (window.APTheme) window.APTheme(t); else { document.documentElement.dataset.theme = t; try { localStorage.setItem('ap.theme', t); } catch(e){} } }})[b.dataset.um]();
});

/* Suppression du compte : sur le site Studio Prism (même compte), avec confirmation par mot de passe puis code PIN */
function deleteAccount(){
  if (Auth.mode === 'demo') return dlg(`<h3>Supprimer mon compte</h3><p class="dlg-p">Avec un vrai compte, ce bouton ouvre la page de suppression du site Studio Prism : votre mot de passe puis votre code PIN sont demandés.</p><div class="dlg-acts"><button type="button" class="ap-btn" data-dlg="close">Compris</button></div>`);
  confirmDlg('Supprimer mon compte Studio Prism', 'La suppression se fait sur le site Studio Prism, pour toutes les apps (ARCHIINDUS, Archi Vision…). Votre mot de passe puis votre code PIN vous seront demandés. Vos projets ARCHIINDUS seront supprimés avec le compte.', 'Continuer sur le site', async () => {
    try { if (Save.pending()) await withTimeout(Save.flush(true), 8000); } catch(e){}
    location.href = DELETE_URL + '?from=archiindus';
  });
}
window.APHome = {
  newProject(){ askText('Nouveau projet', 'Nom du projet', 'Nouveau projet', 'Créer', async v => { closeDlg(); await newProject(v); }); },
  /* fichier importé depuis le dessin alors qu'un projet cloud est ouvert : il devient un nouveau projet cloud */
  async importProject(name, json){ await newProject(String(name || 'Projet importé').slice(0, 80), json); },
};

/* Tant que l'écran de compte, l'accueil ou une fenêtre est affiché, le clavier ne pilote pas la maquette */
window.addEventListener('keydown', e => {
  if (!$a('#apDlg').hidden && e.key === 'Escape'){ closeDlg(); e.stopPropagation(); return; }
  if (root().hidden && $a('#home').hidden && $a('#apDlg').hidden) return;
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  if (pinHandler){
    if (/^\d$/.test(e.key)){ pinKey(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace'){ pinKey('del'); e.preventDefault(); }
  }
  e.stopPropagation();
}, true);

(async function start(){
  // Lien de partage (#/p/<projet>?k=…) : gardé pendant la connexion
  const L = readLinkFromUrl();
  try { if (L) sessionStorage.setItem('ai.pendingLink', JSON.stringify(L)); ctx.pendingLink = L || JSON.parse(sessionStorage.getItem('ai.pendingLink') || 'null'); } catch(e){ ctx.pendingLink = L; }
  show('loading');
  bioOK = await withTimeout(Bio.available(), 1500).catch(() => false);
  try {
    const u = await Auth.init();
    if (!u) return show('login');
    me = u; startWatchP();
    // Profil vérifié en arrière-plan : un compte désactivé entre-temps est déconnecté
    Auth.verifying?.then(v => { if (me?.uid === v.uid && v.firstName){ me.firstName = v.firstName; me.lastName = v.lastName; } })
      .catch(async e => { if (isGone(e) && me?.uid === u.uid) kickOut(e); });   // supprimé, désactivé ou en attente : déconnexion et oubli local
    if (Lock.get(u.uid)?.pin) return show('lock');
    return afterLogin(u);
  } catch(e){
    show('login', {err: e?.code === 'app/timeout' ? errMsg(e) : FIREBASE_CONFIG ? 'Le service de comptes ne répond pas. Vérifiez votre connexion, puis réessayez.' : errMsg(e)});
  }
})();
})();

