"""Compte Studio Prism dans ARCHIINDUS (module commun aux apps du studio, en mode démo : comptes et cloud simulés dans le navigateur).

Contrôle : création d'un compte Particulier, choix Particulier / Entreprise, bouton « Afficher » des mots de passe, fiche client,
code PIN (création, verrouillage au rechargement, déverrouillage), accueil « Mes projets », projet cloud créé et enregistré tout seul,
réouverture, mode découverte (exports réservés aux licences), menu du compte (suppression sur le site Studio Prism).
Le vrai Firebase n'est pas utilisé : les règles Firestore sont contrôlées par tools/check_rules.py et tests/rules/.
Usage : python3 tests/e2e_compte.py
"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from helpers import App

with App(gl=False, login=True) as app:
    pg, ok = app.page, app.ok
    E = pg.evaluate
    pg.wait_for_selector('#auth:not([hidden]) #apCard', timeout=15000)
    ok(pg.is_visible('#auth') and 'Bon retour' in pg.inner_text('#apCard'), 'écran de connexion Studio Prism au démarrage')
    ok(pg.locator('#app').evaluate('a => a.inert'), 'le dessin est inaccessible tant que l\'on n\'est pas connecté')
    # « Afficher » le mot de passe
    pg.fill('#ap-pw', 'secret12')
    pg.click('#apCard >> text=Afficher'); ok(E("document.getElementById('ap-pw').type") == 'text', 'bouton « Afficher » : mot de passe visible')
    # création de compte
    pg.click('text=Créer un compte'); pg.wait_for_selector('#ap-first')
    radios = pg.inner_text('#apCard')
    ok('Particulier' in radios and 'Entreprise' in radios, 'inscription : comptes Particulier et Entreprise distincts')
    pg.fill('#ap-first', 'Paul'); pg.fill('#ap-last', 'Essai'); pg.fill('#ap-email', 'paul.decouverte@essai.fr'); pg.fill('#ap-pw', 'Motdepasse1'); pg.fill('#ap-pw2', 'Motdepasse1'); pg.check('#ap-cgu')
    pg.click('#apCard button[type=submit]'); pg.wait_for_selector('#ap-phone', timeout=10000)
    ok('fiche client' in pg.inner_text('#apCard').lower(), 'fiche client demandée après la création du compte')
    pg.fill('#ap-phone', '0600000000'); pg.fill('#ap-address', '1 rue de l\'Essai'); pg.fill('#ap-zip', '50000'); pg.fill('#ap-city', 'Saint-Lô')
    pg.click('#apCard button[type=submit]'); pg.wait_for_selector('#apPinNew', timeout=10000)
    pg.click('#apPinNew'); pg.wait_for_timeout(200)
    for k in '258036': pg.keyboard.press(k)
    pg.wait_for_timeout(400)
    for k in '258036': pg.keyboard.press(k)
    pg.wait_for_timeout(1200)
    if pg.is_visible('#apSkip'): pg.click('#apSkip'); pg.wait_for_timeout(800)
    ok(pg.is_visible('#home') and 'Paul' in pg.inner_text('#homeHello'), 'code PIN créé, accueil « Mes projets » affiché')
    ok(E("window.SPAccess.level") == 'discovery' and not E("window.SPAccess.canExport"), 'compte sans licence : mode découverte, exports fermés')
    # nouveau projet cloud
    pg.click('#homeNewP'); pg.wait_for_timeout(200); pg.keyboard.press('Control+a'); pg.keyboard.type('Station Nord'); pg.keyboard.press('Enter')
    pg.wait_for_function("!document.getElementById('app').inert", timeout=10000)
    ok(E("Doc.get().name") == 'Station Nord' and E("window.APCloudActive") is True, 'projet cloud créé et ouvert dans le dessin')
    ok(pg.is_visible('#userBtn') and pg.inner_text('#userBtn').strip() == 'PE', 'pastille du compte (initiales)')
    E("Doc.mutate((d) => { d.objects.push({id: d.nextId++, type: 'line', a: [0, 0], b: [5000, 0], layer: 2, net: {dn: 110, mat: 'PEHD', tag: 'AEP'}}); })")
    pg.wait_for_function("document.getElementById('cloudState').textContent.startsWith('Enregistré')", timeout=15000)
    saved = E("Object.values(JSON.parse(localStorage.getItem('sp.demo.cloud')).content).map((c) => JSON.parse(c).objects.length)")
    ok(saved == [1], f'enregistrement automatique dans le cloud ({saved})')
    # export bloqué en mode découverte
    E("document.getElementById('exportBtn').click()"); pg.click('#dxf'); pg.wait_for_timeout(500)
    ok(pg.is_visible('#auth') and 'licence' in pg.inner_text('#apCard').lower(), 'export en mode découverte : écran de licence ARCHIINDUS')
    # clé de licence : déblocage des exports
    pg.fill('#apKey', 'ARCH-TEST-1234-5678'); pg.click('#apKeyF button[type=submit]'); pg.wait_for_timeout(1200)
    ok(E("window.SPAccess.canExport") is True, 'clé de licence activée : exports débloqués')
    pg.click('#apCard [data-act="toapp"]'); pg.wait_for_timeout(400)
    with pg.expect_download() as dl:
        E("document.getElementById('exportBtn').click()"); pg.click('#dxf')
    ok(dl.value.suggested_filename.endswith('.dxf'), 'export DXF possible avec la licence')
    # verrouillage par code PIN au rechargement
    pg.reload(); pg.wait_for_function('window.__apReady === true'); pg.wait_for_selector('#apDots', timeout=10000)
    ok('code PIN' in pg.inner_text('#apCard'), 'rechargement : code PIN demandé')
    for k in '111111': pg.keyboard.press(k)
    pg.wait_for_timeout(600)
    ok(pg.is_visible('#apDots') and 'incorrect' in pg.inner_text('#apCard').lower(), 'code PIN faux refusé')
    for k in '258036': pg.keyboard.press(k)
    pg.wait_for_timeout(1500)
    ok(pg.is_visible('#home') and 'Station Nord' in pg.inner_text('#homeBody'), 'code PIN juste : accueil avec le projet')
    pg.click('#homeBody article.hcard[aria-label="Ouvrir Station Nord"]')
    pg.wait_for_function("!document.getElementById('app').inert && Doc.get().name === 'Station Nord'", timeout=20000)
    ok(E("Doc.get().objects.length") == 1 and E("Doc.get().objects[0].net.tag") == 'AEP', 'projet rouvert depuis le cloud : contenu intact')
    # menu du compte
    pg.click('#userBtn'); pg.wait_for_selector('#userMenu:not([hidden])')
    um = pg.inner_text('#userMenu')
    ok('Ma licence ARCHIINDUS' in um and 'Code PIN et sécurité' in um and 'Supprimer mon compte' in um, 'menu du compte : licence, PIN, suppression')
    pg.click('#userMenu [data-um="delete"]'); pg.wait_for_timeout(300)
    ok('site Studio Prism' in pg.inner_text('#apDlg'), 'suppression du compte : renvoi vers le site Studio Prism (toutes les apps)')
    sys.exit(app.report())
