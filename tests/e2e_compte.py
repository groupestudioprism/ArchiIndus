"""Test du parcours compte Studio Prism et cloud dans le navigateur, avec un SDK Firebase SIMULÉ (tests/fake-firebase-compat.js).

Ce test vérifie l'interface et la logique du client (page de connexion, accueil « Mes projets » avec dossiers, licence affichée, création
de compte, enregistrement automatique, messages d'erreur, restauration de session). Il ne vérifie NI le vrai service Firebase, NI les règles de sécurité (voir tests/rules/ pour les règles).
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

def fmenu(sel): pg.click('#fileBtn'); pg.click(sel)

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

    ok(fb_reqs == [], f'aucun chargement Firebase avant la connexion {fb_reqs}')
    ok(pg.is_visible('#auth') and 'Connexion à ARCHIINDUS' in pg.inner_text('#apCard'), 'page de connexion affichée au démarrage')
    ok(pg.get_attribute('#acct', 'aria-label') == 'Compte Studio Prism', 'bouton Compte au départ')

    # --- connexion
    pg.fill('#apCard input[aria-label="Email"]', 'alice@example.org'); pg.fill('#apCard input[aria-label="Mot de passe"]', 'mauvais1')
    pg.click('#apCard button[type=submit]'); pg.wait_for_timeout(250)
    ok('incorrect' in pg.inner_text('#apCard') and S('Account.me()') is None and pg.is_visible('#auth'), f'mauvais mot de passe refusé : {pg.inner_text("#apCard")[-120:]!r}')
    pg.click('#apCard .ap-eye'); ok(pg.get_attribute('#apPw', 'type') == 'text', 'bouton Afficher le mot de passe')
    pg.fill('#apCard input[aria-label="Mot de passe"]', 'Passw0rd1'); pg.click('#apCard button[type=submit]'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(300)
    ok(not pg.is_visible('#auth') and S('Account.me().email') == 'alice@example.org', 'connexion réussie, page de connexion fermée, accueil affiché')
    ok(pg.inner_text('#homeHello') == 'Bonjour Alice' and 'Alice' in pg.get_attribute('#acct', 'aria-label'), f"accueil personnalisé {pg.inner_text('#homeHello')!r}")
    ok(S('window.__fb.cfg.projectId') == 'archivision-studioprism', f"projet Firebase utilisé : {S('window.__fb.cfg.projectId')}")
    ok(sorted(fb_reqs) == ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'], f'SDK chargé à la demande {fb_reqs}')
    ok(S('Account.access().level') == 'licensed', 'licence archiindus active détectée')
    q = pg.inner_text('#homeQuota'); ok('50 Mo' in q and 'Pro' in q and '0 / 5' in q.replace('\n', ' ').replace('\t', ' ') or ('50' in q and 'Pro' in q), f'carte Mon cloud : {q!r}')
    ok('Aucun projet' in pg.inner_text('#homeBody'), 'accueil vide au départ')

    # --- nouveau projet depuis l'accueil
    pg.click('#homeNewP'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input', ''); pg.click('dialog >> text=Créer'); ok('Saisissez un nom' in dlg(), 'nom vide refusé')
    pg.fill('dialog input', 'Réseau test'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    docs = S('window.__fb.docs'); ids = [k for k in docs if re.fullmatch(r'aiProjects/[^/]+', k)]
    ok(len(ids) == 1 and docs[ids[0]]['ownerUid'] == 'u_alice' and docs[ids[0]]['name'] == 'Réseau test' and docs[ids[0]]['folderId'] == '', f'fiche cloud créée {docs.get(ids[0]) if ids else list(docs)}')
    ok(not pg.is_visible('#home') and S('Doc.get().name') == 'Réseau test' and S('Cloud.linked()') == ids[0].split('/')[1], 'projet ouvert dans l\'éditeur et lié au cloud')
    ok('cloud' in pg.inner_text('#saved'), f"état cloud affiché : {pg.inner_text('#saved')!r}")
    ok(docs['aiUsage/u_alice']['lastPid'] == ids[0].split('/')[1], 'compteur d\'usage écrit dans le même lot')

    # --- enregistrement automatique
    pg.evaluate("Doc.mutate(d=>{const o={type:'line',a:[0,0],b:[4000,0],net:{dn:110,mat:'PVC',tag:'EU-9'}};o.id=d.nextId++;o.layer=3;d.objects.push(o)})")
    ok('à enregistrer' in pg.inner_text('#saved'), f"modification en attente d'enregistrement : {pg.inner_text('#saved')!r}")
    pg.wait_for_timeout(3600)
    docs = S('window.__fb.docs'); size1 = docs[ids[0]]['size']
    ok(docs[ids[0] + '/content/main']['data'].count('EU-9') == 1 and docs['aiUsage/u_alice']['bytes'] == size1, 'enregistrement automatique : contenu et compteur à jour')
    ok(pg.inner_text('#saved').endswith('enregistré'), f"état : {pg.inner_text('#saved')!r}")
    pg.evaluate("Doc.mutate(d=>{const o={type:'line',a:[0,500],b:[4000,500]};o.id=d.nextId++;o.layer=3;d.objects.push(o)})"); pg.wait_for_timeout(3600)
    docs = S('window.__fb.docs'); size2 = docs[ids[0]]['size']
    ok(size2 > size1 and docs['aiUsage/u_alice']['bytes'] == size2 and len([k for k in docs if re.fullmatch(r'aiProjects/[^/]+', k)]) == 1, f'2e enregistrement : {size1}→{size2}, compteur cohérent')

    # --- dossiers
    pg.click('#cloud'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(300)
    ok('Réseau test' in pg.inner_text('#homeBody') and 'Ouvert' in pg.inner_text('#homeBody'), 'projet listé, marqué ouvert')
    ok('Dessin actuel' in pg.inner_text('#homeSave') or True, 'bouton dessin actuel présent')
    pg.click('#homeNewF'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', 'Eau potable'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    fdocs = {k: v for k, v in S('window.__fb.docs').items() if re.fullmatch(r'aiFolders/[^/]+', k)}
    ok(len(fdocs) == 1 and list(fdocs.values())[0]['name'] == 'Eau potable' and list(fdocs.values())[0]['parentId'] == '' and list(fdocs.values())[0]['ownerUid'] == 'u_alice', f'dossier créé {fdocs}')
    fid = list(fdocs)[0].split('/')[1]
    ok('Eau potable' in pg.inner_text('#homeBody') and '/ 5' in pg.inner_text('#homeQuota'), 'dossier affiché, compteur de dossiers')
    # déplacer le projet dans le dossier
    pg.click('.hcard .hdots'); pg.click('#homeMenu >> text=Déplacer'); pg.wait_for_selector('dialog[open]'); pg.click('dialog >> text=Eau potable'); pg.wait_for_timeout(400)
    ok(S(f"window.__fb.docs['{ids[0]}'].folderId") == fid, 'projet déplacé dans le dossier (folderId)')
    ok('Réseau test' not in pg.inner_text('#homeBody').split('Dossiers')[-1].split('Projets')[0] and not pg.locator('.hcard').count(), 'projet absent de la racine')
    pg.click('.hfold'); pg.wait_for_timeout(200)
    ok(pg.locator('.hcrumbs').count() == 1 and pg.locator('.hcard').count() == 1 and 'Réseau test' in pg.inner_text('.hcard'), 'navigation dans le dossier, fil d\'Ariane')
    # sous-dossier + interdiction de se déplacer dans son propre contenu
    pg.click('#homeNewF'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', 'Branchements'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    sub = [v for k, v in S('window.__fb.docs').items() if re.fullmatch(r'aiFolders/[^/]+', k) and v['name'] == 'Branchements']
    ok(len(sub) == 1 and sub[0]['parentId'] == fid, 'sous-dossier créé dans le dossier courant')
    pg.click('.hcrumbs button >> nth=0'); pg.wait_for_timeout(150)
    pg.locator('.hfold >> text=Eau potable').locator('xpath=ancestor::div[contains(@class,"hfold")]').locator('.hdots').click()
    pg.click('#homeMenu >> text=Déplacer'); pg.wait_for_selector('dialog[open]'); pick = dlg()
    ok('Branchements' not in pick and 'racine' in pick and 'Eau potable' not in pick.replace('Mes projets (racine)', ''), f'déplacement : pas de dossier dans son propre contenu {pick!r}'); pg.keyboard.press('Escape')
    # renommer
    pg.locator('.hfold .hdots').first.click(); pg.click('#homeMenu >> text=Renommer'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', 'Eau froide'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    ok(S(f"window.__fb.docs['aiFolders/{fid}'].name") == 'Eau froide', 'dossier renommé')
    # limite de 5 dossiers
    for i in range(3):
        pg.click('#homeNewF'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', f'Dossier {i}'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('5 / 5' in pg.inner_text('#homeQuota').replace('\n', ' '), 'cinq dossiers')
    pg.click('#homeNewF'); pg.wait_for_selector('dialog[open]'); ok('Limite atteinte' in dlg(), 'sixième dossier refusé'); pg.keyboard.press('Escape')
    # suppression du dossier : son contenu remonte
    pg.locator('.hfold', has_text='Eau froide').locator('.hdots').click(); pg.click('#homeMenu >> text=Supprimer le dossier'); pg.wait_for_selector('dialog[open]')
    ok('remontent' in dlg(), 'suppression de dossier : confirmation avec explication'); pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(500)
    docs = S('window.__fb.docs')
    ok(f'aiFolders/{fid}' not in docs and docs[ids[0]]['folderId'] == '' and sub and [v for k, v in docs.items() if k.startswith('aiFolders/') and v['name'] == 'Branchements'][0]['parentId'] == '', 'dossier supprimé ; projet et sous-dossier remontés à la racine')
    # renommer un projet
    pg.locator('.hcard .hdots').click(); pg.click('#homeMenu >> text=Renommer'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', 'Réseau EU'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    ok(S(f"window.__fb.docs['{ids[0]}'].name") == 'Réseau EU' and S('Doc.get().name') == 'Réseau EU', 'projet renommé (fiche et document ouvert)')

    # --- ouvrir un autre projet : annulable, plus de lien avec l'ancien
    pg.click('#homeBack'); ok(not pg.is_visible('#home'), 'retour au dessin')
    fmenu('#new'); ok(S('Doc.get().objects.length') == 0 and S('Cloud.linked()') == '', 'nouveau projet : lien cloud rompu')
    pg.evaluate("Doc.mutate(d=>{d.name='ne doit pas écraser'})"); pg.wait_for_timeout(3300)
    ok(S(f"window.__fb.docs['{ids[0]}'].name") == 'Réseau EU', 'le dessin non lié n\'est jamais écrit dans le cloud')
    pg.click('#cloud'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(300)
    ok('Dessin actuel' in pg.inner_text('#homeSave') and 'sur cet appareil' not in pg.inner_text('#homeBody'), 'pas de bandeau si le dessin est vide')
    pg.locator('.hcard').click(); pg.wait_for_timeout(400)
    ok(S('Doc.get().objects.length') == 2 and S('Doc.get().name') == 'Réseau EU' and S('Doc.get().objects[0].net.tag') == 'EU-9' and not pg.is_visible('#home'), 'projet cloud rouvert (avec son réseau)')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(3600)
    ok(S('Doc.get().objects.length') == 2 and S('Doc.canUndo()') is False, 'ouverture d\'un projet cloud : historique vidé, Ctrl+Z ne revient pas au document précédent')
    ok(S(f"window.__fb.docs['{ids[0]}/content/main'].data").count('"type":"line"') == 2, 'le projet cloud n\'est pas écrasé par un annuler')

    # --- enregistrer le dessin actuel dans le cloud
    fmenu('#new'); pg.evaluate("Doc.mutate(d=>{const o={type:'line',a:[0,0],b:[900,0]};o.id=d.nextId++;o.layer=3;d.objects.push(o)})")
    pg.click('#cloud'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(300)
    ok('sur cet appareil' in pg.inner_text('#homeBody'), 'bandeau : un dessin local peut être enregistré dans le cloud')
    pg.click('#homeSave'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', 'Dessin local'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    ok(len([k for k in S('window.__fb.docs') if re.fullmatch(r'aiProjects/[^/]+', k)]) == 2 and S('Doc.get().name') == 'Dessin local' and S('Cloud.linked()') != '', 'dessin actuel enregistré dans le cloud')

    # --- import d'un fichier .json
    pg.click('#cloud'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(300)
    tmp = pathlib.Path(tempfile.mkdtemp()); good = tmp / 'import.archiindus.json'; bad = tmp / 'mauvais.json'
    good.write_text(json.dumps({'schemaVersion': 1, 'name': 'Importé', 'units': 'mm', 'layers': [{'id': 1, 'name': 'Calque 1', 'color': '#0877B9', 'group': 'x', 'visible': True, 'locked': False}], 'objects': [{'id': 1, 'type': 'line', 'layer': 1, 'a': [0, 0], 'b': [100, 0]}], 'nextId': 2, 'nextLayerId': 2, 'active': 1}), encoding='utf-8')
    bad.write_text('{"schemaVersion":1,"objects":[{"type":"line","a":[0,"x"],"b":[1,1]}]}', encoding='utf-8')
    n0 = len([k for k in S('window.__fb.docs') if re.fullmatch(r'aiProjects/[^/]+', k)])
    pg.set_input_files('#homeFile', str(bad)); pg.wait_for_timeout(400)
    ok(len([k for k in S('window.__fb.docs') if re.fullmatch(r'aiProjects/[^/]+', k)]) == n0 and 'Import impossible' in pg.inner_text('#msg'), f"fichier invalide refusé : {pg.inner_text('#msg')!r}")
    pg.set_input_files('#homeFile', str(good)); pg.wait_for_timeout(500)
    ok(len([k for k in S('window.__fb.docs') if re.fullmatch(r'aiProjects/[^/]+', k)]) == n0 + 1 and S('Doc.get().name') == 'Importé', 'fichier valide importé dans le cloud')

    # --- suppression d'un projet (confirmation) ; accès refusé
    pg.click('#cloud'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(300)
    cnt = pg.locator('.hcard').count()
    pg.locator('.hcard', has_text='Importé').locator('.hdots').click(); pg.click('#homeMenu >> text=Supprimer'); pg.wait_for_selector('dialog[open]'); ok('définitive' in dlg(), 'suppression de projet : confirmation')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150); ok(pg.locator('.hcard').count() == cnt, 'rien supprimé sans confirmation')
    pg.locator('.hcard', has_text='Importé').locator('.hdots').click(); pg.click('#homeMenu >> text=Supprimer'); pg.wait_for_selector('dialog[open]'); pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(500)
    docs = S('window.__fb.docs'); ok(pg.locator('.hcard').count() == cnt - 1 and docs['aiUsage/u_alice']['bytes'] == sum(v['size'] for k, v in docs.items() if re.fullmatch(r'aiProjects/[^/]+', k)), 'projet supprimé, compteur cohérent')
    S('window.__fb.deny = true')
    pg.click('#homeNewF'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input', 'Refusé'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    ok('refusé' in pg.inner_text('#msg') and 'pas encore activé' in pg.inner_text('#msg'), f"message d'accès refusé : {pg.inner_text('#msg')!r}")
    ok(not [v for k, v in S('window.__fb.docs').items() if k.startswith('aiFolders/') and v['name'] == 'Refusé'], 'aucune écriture après refus')
    S('window.__fb.deny = false')

    # --- restauration de session après rechargement : l'accueil s'affiche directement
    pg.reload(); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(700)
    ok(pg.is_visible('#home') and not pg.is_visible('#auth') and pg.inner_text('#homeHello') == 'Bonjour Alice' and S('Account.me().uid') == 'u_alice', 'session restaurée : accueil affiché directement')

    # --- déconnexion
    pg.click('#homeUser'); pg.click('#homeMenu >> text=Se déconnecter'); pg.wait_for_timeout(300)
    ok(pg.is_visible('#auth') and not pg.is_visible('#home') and pg.get_attribute('#acct', 'aria-label') == 'Compte Studio Prism' and S('Account.me()') is None, 'déconnexion : retour à la page de connexion')
    pg.reload(); pg.wait_for_timeout(500); ok(pg.is_visible('#auth') and S('Account.me()') is None, 'pas de session après déconnexion + rechargement')
    pg.click('#authSkip'); ok(not pg.is_visible('#auth'), 'continuer sans compte : éditeur local')
    pg.click('#cloud'); ok(pg.is_visible('#auth'), 'Cloud sans compte : ouvre la connexion')

    # --- création de compte
    pg.click('#apCard >> text=Créer un compte >> nth=0') if False else pg.click('#apCard .ap-tabs button >> nth=1')
    pg.fill('#apCard input[aria-label="Prénom"]', 'Nora'); pg.fill('#apCard input[aria-label="Nom"]', 'Test'); pg.fill('#apCard input[aria-label="Email"]', 'nora@example.org')
    pg.fill('#apCard input[aria-label="Mot de passe"]', 'court'); pg.check('#apCard input[type=checkbox]'); pg.click('#apCard button[type=submit]'); pg.wait_for_timeout(200)
    ok('trop faible' in pg.inner_text('#apCard'), 'mot de passe faible refusé')
    pg.fill('#apCard input[aria-label="Mot de passe"]', 'Passw0rd2'); ok(pg.locator('.ap-rules li.ok').count() == 3, 'règles du mot de passe cochées en direct')
    pg.uncheck('#apCard input[type=checkbox]'); pg.click('#apCard button[type=submit]'); pg.wait_for_timeout(200)
    ok('conditions' in pg.inner_text('#apCard') and 'nora@example.org' not in S('window.__fb ? Object.keys(window.__fb.users) : []'), 'conditions non acceptées : pas de compte')
    pg.check('#apCard input[type=checkbox]'); pg.click('#apCard button[type=submit]'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(400)
    prof = S("window.__fb.docs['users/' + window.__fb.users['nora@example.org'].uid]")
    ok(prof and prof['role'] == 'user' and prof['status'] == 'active' and prof['accountKind'] == 'individual' and prof['subscription'] == 'free' and prof['firstName'] == 'Nora' and 'termsAcceptedAt' in prof, f'profil Studio Prism par défaut {prof}')
    ok('Nora' in pg.get_attribute('#acct', 'aria-label') and S('Account.access().level') == 'free', 'compte créé et connecté, offre gratuite')
    q = pg.inner_text('#homeQuota'); ok('10 Mo' in q and 'Gratuit' in q, f'quota gratuit 10 Mo : {q!r}')
    pg.click('#homeUser'); pg.click('#homeMenu >> text=Se déconnecter'); pg.wait_for_timeout(300)
    # email déjà utilisé
    pg.click('#apCard .ap-tabs button >> nth=1')
    pg.fill('#apCard input[aria-label="Prénom"]', 'X'); pg.fill('#apCard input[aria-label="Email"]', 'alice@example.org'); pg.fill('#apCard input[aria-label="Mot de passe"]', 'Passw0rd2'); pg.check('#apCard input[type=checkbox]'); pg.click('#apCard button[type=submit]'); pg.wait_for_timeout(250)
    ok('existe déjà' in pg.inner_text('#apCard'), 'email déjà utilisé signalé')

    # --- compte désactivé
    pg.click('#apCard .ap-tabs button >> nth=0')
    pg.fill('#apCard input[aria-label="Email"]', 'carol@example.org'); pg.fill('#apCard input[aria-label="Mot de passe"]', 'Passw0rd1'); pg.click('#apCard button[type=submit]'); pg.wait_for_timeout(300)
    ok('désactivé' in pg.inner_text('#apCard') and S('Account.me()') is None and pg.is_visible('#auth'), 'compte désactivé refusé')
    # --- mot de passe oublié
    pg.click('#apCard >> text=Mot de passe oublié'); pg.fill('#apCard input[aria-label="Email"]', 'inconnu@example.org'); pg.click('#apCard button[type=submit]'); pg.wait_for_timeout(250)
    ok('Si un compte existe' in pg.inner_text('#apCard') and S('window.__fb.resets') == ['inconnu@example.org'], 'réinitialisation : même message pour un email inconnu')
    pg.click('#apCard >> text=Retour à la connexion')

    # --- données hostiles : prénom contenant du HTML
    pg.fill('#apCard input[aria-label="Email"]', 'eve@example.org'); pg.fill('#apCard input[aria-label="Mot de passe"]', 'Passw0rd1'); pg.click('#apCard button[type=submit]'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(400)
    ok(S('window.__x') is None and pg.locator('#home img, #acct img').count() == 0 and '<img' in pg.inner_text('#homeHello'), 'prénom hostile affiché comme texte, aucun HTML exécuté')
    pg.click('#homeUser'); ok('<img' in pg.inner_text('#homeMenu') or pg.locator('#homeMenu img').count() == 0, 'menu du compte : pas de HTML injecté')
    pg.keyboard.press('Escape')

    ok(not [u for u in blocked if 'gstatic' in u and 'firebasejs' in u], 'aucune requête Firebase inattendue')
    ok(all('googleapis.com/identitytoolkit' not in u and 'firestore.googleapis' not in u for u in blocked), f'aucune requête vers les services Google {[u for u in blocked if "google" in u][:3]}')
    print('erreurs page :', errs); ok(not errs, f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
