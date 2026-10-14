"""Test du parcours compte Studio Prism et cloud dans le navigateur, avec un SDK Firebase SIMULÉ (tests/fake-firebase-compat.js).

Ce test vérifie l'interface et la logique du client (connexion, licence affichée, création de compte, projets cloud, messages d'erreur,
restauration de session). Il ne vérifie NI le vrai service Firebase, NI les règles de sécurité (voir tests/rules/ pour les règles).
Prérequis : python3 tools/build.py, `pip install playwright`, `playwright install chromium`.
"""
import json, pathlib, re, sys, tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FAKE = (ROOT / 'tests' / 'fake-firebase-compat.js').read_text(encoding='utf-8')
fails = []; checks = 0
def ok(cond, msg):
    global checks; checks += 1
    if not cond: fails.append(msg); print('ÉCHEC :', msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 800}, accept_downloads=True)
    pg = ctx.new_page(); errs = []; fb_reqs = []; blocked = []
    pg.on('pageerror', lambda e: errs.append('pageerror:' + str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    def route(r):
        u = r.request.url
        if u.startswith('file:'): return r.continue_()
        if u.startswith('https://www.gstatic.com/firebasejs/10.12.2/'):
            fb_reqs.append(u.rsplit('/', 1)[1])
            return r.fulfill(status=200, content_type='application/javascript', body=FAKE if u.endswith('firebase-app-compat.js') else '')
        blocked.append(u); return r.abort()
    pg.route('**/*', route)
    pg.goto((ROOT / 'index.html').as_uri()); pg.wait_for_timeout(300)
    S = lambda expr: pg.evaluate(expr)
    dlg = lambda: pg.inner_text('dialog[open]') if pg.locator('dialog[open]').count() else ''

    ok(fb_reqs == [], f'aucun chargement Firebase avant d\'ouvrir le compte {fb_reqs}')
    ok(pg.inner_text('#acct') == 'Compte', 'bouton Compte au départ')

    # --- connexion
    pg.click('#acct'); pg.wait_for_selector('dialog[open]')
    ok('Se connecter' in dlg() and 'Créer un compte' in dlg(), 'fenêtre de connexion')
    pg.fill('dialog input[aria-label="Email"]', 'alice@example.org'); pg.fill('dialog input[aria-label="Mot de passe"]', 'mauvais1')
    pg.click('dialog button[type=submit]'); pg.wait_for_timeout(200)
    ok('incorrect' in dlg() and S('Account.me()') is None, f'mauvais mot de passe refusé : {dlg()[-80:]!r}')
    pg.fill('dialog input[aria-label="Mot de passe"]', 'Passw0rd1'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(300)
    ok(pg.locator('dialog[open]').count() == 0 and S('Account.me().email') == 'alice@example.org', 'connexion réussie, fenêtre fermée')
    ok(pg.inner_text('#acct') == 'Alice', 'bouton Compte affiche le prénom')
    ok(S('window.__fb.cfg.projectId') == 'archivision-studioprism', f"projet Firebase utilisé : {S('window.__fb.cfg.projectId')}")
    ok(sorted(fb_reqs) == ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'], f'SDK chargé à la demande {fb_reqs}')
    ok(S('Account.access().level') == 'licensed', 'licence archiindus active détectée')

    # --- fenêtre du compte
    pg.click('#acct'); pg.wait_for_selector('dialog[open]'); pg.wait_for_timeout(200)
    t = dlg(); ok('Alice Martin' in t and 'alice@example.org' in t and 'Pro' in t and '0 / 50 Mo' in t.replace('\n', ' ').replace('\t', ' ') or '0 / 50' in t, f'fenêtre du compte {t[:200]!r}')
    pg.click('dialog >> text=Fermer')

    # --- cloud : enregistrer, mettre à jour, rouvrir, supprimer
    pg.evaluate("Doc.mutate(d=>{d.name='Réseau test';const o={type:'line',a:[0,0],b:[4000,0],net:{dn:110,mat:'PVC',tag:'EU-9'}};o.id=d.nextId++;o.layer=3;d.objects.push(o)})")
    pg.click('#cloud'); pg.wait_for_selector('dialog[open]'); pg.wait_for_timeout(200)
    ok('Aucun projet' in dlg() and 'Enregistrer ce projet dans le cloud' in dlg(), 'cloud vide au départ')
    pg.click('dialog >> text=Enregistrer ce projet dans le cloud'); pg.wait_for_timeout(300)
    docs = S('window.__fb.docs'); ids = [k for k in docs if re.fullmatch(r'aiProjects/[^/]+', k)]
    ok(len(ids) == 1 and docs[ids[0]]['ownerUid'] == 'u_alice' and docs[ids[0]]['name'] == 'Réseau test', f'fiche cloud créée {docs.get(ids[0]) if ids else docs.keys()}')
    size1 = docs[ids[0]]['size']; ok(docs[ids[0] + '/content/main']['data'].count('EU-9') == 1 and docs['aiUsage/u_alice']['bytes'] == size1 and docs['aiUsage/u_alice']['lastPid'] == ids[0].split('/')[1], 'contenu et compteur écrits dans le même lot')
    ok('Réseau test' in dlg() and 'Mettre à jour' in dlg(), 'liste rafraîchie, bouton Mettre à jour')
    pg.evaluate("Doc.mutate(d=>{const o={type:'line',a:[0,500],b:[4000,500]};o.id=d.nextId++;o.layer=3;d.objects.push(o)})")
    pg.click('dialog >> text=Mettre à jour le projet cloud'); pg.wait_for_timeout(300)
    docs = S('window.__fb.docs'); size2 = docs[ids[0]]['size']
    ok(size2 > size1 and docs['aiUsage/u_alice']['bytes'] == size2 and len([k for k in docs if k.startswith('aiProjects/') and k.count('/') == 1]) == 1, f'mise à jour : taille {size1}→{size2}, compteur cohérent')
    pg.click('dialog >> text=Fermer')
    pg.click('#new'); ok(S('Doc.get().objects.length') == 0, 'nouveau projet vide')
    pg.click('#cloud'); pg.wait_for_selector('dialog[open]'); pg.wait_for_timeout(200)
    pg.click('dialog >> text=Ouvrir'); pg.wait_for_timeout(300)
    ok(S('Doc.get().objects.length') == 2 and S('Doc.get().name') == 'Réseau test' and S('Doc.get().objects[0].net.tag') == 'EU-9', 'projet cloud rouvert (avec son réseau)')
    ok(pg.locator('dialog[open]').count() == 0, 'fenêtre fermée après ouverture')
    pg.keyboard.press('Control+z'); ok(S('Doc.get().objects.length') == 0, 'ouverture annulable (Ctrl+Z)'); pg.keyboard.press('Control+y')
    # suppression en deux temps
    pg.click('#cloud'); pg.wait_for_selector('dialog[open]'); pg.wait_for_timeout(200)
    pg.click('dialog >> text=Supprimer'); ok('Confirmer' in dlg(), 'suppression : confirmation demandée')
    ok(len([k for k in S('window.__fb.docs') if k.startswith('aiProjects/')]) == 2, 'rien supprimé avant confirmation')
    pg.click('dialog >> text=Confirmer'); pg.wait_for_timeout(300)
    docs = S('window.__fb.docs'); ok(not [k for k in docs if k.startswith('aiProjects/')] and docs['aiUsage/u_alice']['bytes'] == 0, 'projet supprimé, compteur à zéro')
    ok('Aucun projet' in dlg(), 'liste vide après suppression')
    # règles non publiées / accès refusé
    S('window.__fb.deny = true')
    pg.click('dialog >> text=Enregistrer ce projet dans le cloud'); pg.wait_for_timeout(300)
    ok('refusé' in pg.inner_text('#msg') and 'pas encore activé' in pg.inner_text('#msg'), f"message d'accès refusé : {pg.inner_text('#msg')!r}")
    ok(not [k for k in S('window.__fb.docs') if k.startswith('aiProjects/')], 'aucune écriture partielle après refus')
    S('window.__fb.deny = false'); pg.click('dialog >> text=Fermer')

    # --- restauration de session après rechargement
    pg.reload(); pg.wait_for_timeout(600)
    ok(pg.inner_text('#acct') == 'Alice' and S('Account.me().uid') == 'u_alice', 'session restaurée au rechargement')

    # --- déconnexion
    pg.click('#acct'); pg.wait_for_selector('dialog[open]'); pg.click('dialog >> text=Se déconnecter'); pg.wait_for_timeout(300)
    ok(pg.inner_text('#acct') == 'Compte' and S('Account.me()') is None, 'déconnexion')
    pg.click('#cloud'); pg.wait_for_selector('dialog[open]'); ok('Se connecter' in dlg(), 'Cloud sans compte : ouvre la connexion'); pg.keyboard.press('Escape')
    pg.reload(); pg.wait_for_timeout(500); ok(S('Account.me()') is None, 'pas de session après déconnexion + rechargement')

    # --- création de compte
    pg.click('#acct'); pg.wait_for_selector('dialog[open]'); pg.click('dialog >> text=Créer un compte')
    pg.fill('dialog input[aria-label="Prénom"]', 'Nora'); pg.fill('dialog input[aria-label="Nom"]', 'Test'); pg.fill('dialog input[aria-label="Email"]', 'nora@example.org')
    pg.fill('dialog input[aria-label="Mot de passe"]', 'court'); pg.check('dialog input[type=checkbox]'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(200)
    ok('trop faible' in dlg(), 'mot de passe faible refusé')
    pg.fill('dialog input[aria-label="Mot de passe"]', 'Passw0rd2'); pg.uncheck('dialog input[type=checkbox]'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(200)
    ok('acceptez les conditions' in dlg() and 'nora@example.org' not in S('window.__fb ? Object.keys(window.__fb.users) : []'), 'conditions non acceptées : pas de compte')
    pg.check('dialog input[type=checkbox]'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(300)
    prof = S("window.__fb.docs['users/' + window.__fb.users['nora@example.org'].uid]")
    ok(prof and prof['role'] == 'user' and prof['status'] == 'active' and prof['accountKind'] == 'individual' and prof['subscription'] == 'free' and prof['firstName'] == 'Nora' and 'termsAcceptedAt' in prof, f'profil Studio Prism par défaut {prof}')
    ok(pg.inner_text('#acct') == 'Nora' and S('Account.access().level') == 'free', 'compte créé et connecté, offre gratuite')
    pg.click('#acct'); pg.wait_for_selector('dialog[open]'); pg.wait_for_timeout(200); ok('Gratuite' in dlg() and '/ 10 Mo' in dlg(), f'licence gratuite, quota 10 Mo : {dlg()[:160]!r}')
    pg.click('dialog >> text=Se déconnecter'); pg.wait_for_timeout(200)
    # email déjà utilisé
    pg.click('#acct'); pg.wait_for_selector('dialog[open]'); pg.click('dialog >> text=Créer un compte')
    pg.fill('dialog input[aria-label="Prénom"]', 'X'); pg.fill('dialog input[aria-label="Email"]', 'alice@example.org'); pg.fill('dialog input[aria-label="Mot de passe"]', 'Passw0rd2'); pg.check('dialog input[type=checkbox]'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(200)
    ok('existe déjà' in dlg(), 'email déjà utilisé signalé'); pg.keyboard.press('Escape')

    # --- compte désactivé
    pg.click('#acct'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[aria-label="Email"]', 'carol@example.org'); pg.fill('dialog input[aria-label="Mot de passe"]', 'Passw0rd1'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(300)
    ok('désactivé' in dlg() and S('Account.me()') is None, 'compte désactivé refusé');
    # --- mot de passe oublié
    pg.click('dialog >> text=Mot de passe oublié'); pg.fill('dialog input[aria-label="Email"]', 'inconnu@example.org'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(200)
    ok('Si un compte existe' in dlg() and S('window.__fb.resets') == ['inconnu@example.org'], 'réinitialisation : même message pour un email inconnu'); pg.keyboard.press('Escape')

    # --- données hostiles : prénom contenant du HTML
    pg.click('#acct'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[aria-label="Email"]', 'eve@example.org'); pg.fill('dialog input[aria-label="Mot de passe"]', 'Passw0rd1'); pg.click('dialog button[type=submit]'); pg.wait_for_timeout(300)
    ok(S('window.__x') is None and pg.locator('#acct img').count() == 0 and '<img' in pg.inner_text('#acct'), 'prénom hostile affiché comme texte, aucun HTML exécuté')
    pg.click('#acct'); pg.wait_for_selector('dialog[open]'); pg.wait_for_timeout(200); ok(pg.locator('dialog img').count() == 0 and 'Gratuite' in dlg(), 'fenêtre du compte : pas de HTML injecté, offre gratuite')
    pg.click('dialog >> text=Fermer')

    ok(not [u for u in blocked if 'gstatic' in u and 'firebasejs' in u], 'aucune requête Firebase inattendue')
    ok(all('googleapis.com/identitytoolkit' not in u and 'firestore.googleapis' not in u for u in blocked), f'aucune requête vers les services Google {[u for u in blocked if "google" in u][:3]}')
    print('erreurs page :', errs); ok(not errs, f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
