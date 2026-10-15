"""Test de bout en bout du poste de conception : ruban, arbre, esquisses sur plans, fonctions 3D (extrusion, révolution),
assemblage (composants, contraintes, générateur de bâtiment), matériaux et compositions, analyse (flèche, flambement, dilatation),
site réel (réponses IGN / OpenStreetMap SIMULÉES : aucun appel réseau réel), export GLB avec lieu.

Prérequis : python3 tools/build.py ; Playwright + Chromium ; Three.js r160 local (voir tests/e2e_3d.py, THREE_DIR).
Rendu WebGL logiciel (SwiftShader). Les services IGN et Overpass ne sont pas contactés : seul le traitement de leurs réponses est testé.
"""
import os, sys, json, math, struct, tempfile, pathlib, re
from playwright.sync_api import sync_playwright
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from helpers import enter

ROOT = pathlib.Path(__file__).resolve().parent.parent
THREE = pathlib.Path(os.environ.get('THREE_DIR', '/tmp/claude-0/three/node_modules/three'))
if not (THREE / 'build/three.module.js').exists():
    print('THREE_DIR introuvable : test non exécuté.'); sys.exit(2)
OUT = tempfile.mkdtemp(prefix='archiindus-cao-') + '/'
print('Fichiers de sortie :', OUT)
fails = []; checks = 0
def ok(c, m):
    global checks; checks += 1
    if not c: fails.append(m); print('ÉCHEC :', m)
def near(a, b, t=1e-6): return abs(a - b) <= t * max(1, abs(b))

# ---- réponses simulées des services du site
LAT, LON = 45.75, 4.85
KX, KY = 111320 * math.cos(LAT * math.pi / 180), 110540
def ll(x, y): return [LON + x / KX, LAT + y / KY]
N = 84
BIL = b''.join(struct.pack('<f', 200.0 + 0.01 * i) for j in range(N) for i in range(N))   # pente douce vers l'est
calls = {'search': 0, 'bil': 0, 'wfs': 0, 'overpass': 0}
def serve(route):
    u = route.request.url
    if u.startswith('file:'): return route.continue_()
    m = re.match(r'https://cdn\.jsdelivr\.net/npm/three@0\.160\.0/(.*)', u)
    if m and (THREE / m.group(1)).exists():
        return route.fulfill(path=str(THREE / m.group(1)), content_type='text/javascript', headers={'access-control-allow-origin': '*'})
    H = {'access-control-allow-origin': '*'}
    if u.startswith('https://data.geopf.fr/geocodage/search'):
        calls['search'] += 1
        return route.fulfill(status=200, headers=H, content_type='application/json', body=json.dumps({'features': [{'properties': {'label': '1 Rue de l\'Essai 69000 Lyon', 'context': '69, Rhône'}, 'geometry': {'coordinates': [LON, LAT]}}]}))
    if u.startswith('https://data.geopf.fr/wms-r'):
        calls['bil'] += 1
        return route.fulfill(status=200, headers=H, content_type='application/octet-stream', body=BIL)
    if u.startswith('https://data.geopf.fr/wfs'):
        calls['wfs'] += 1
        ring = [ll(30, 0), ll(50, 0), ll(50, 10), ll(30, 10), ll(30, 0)]
        return route.fulfill(status=200, headers=H, content_type='application/json', body=json.dumps({'features': [{'geometry': {'type': 'Polygon', 'coordinates': [ring]}, 'properties': {'hauteur': 12, 'usage_1': 'Industriel'}}]}))
    if 'overpass' in u:
        calls['overpass'] += 1
        g = [{'lon': c[0], 'lat': c[1]} for c in (ll(-100, -20), ll(100, -20))]
        return route.fulfill(status=200, headers=H, content_type='application/json', body=json.dumps({'elements': [{'type': 'way', 'id': 1, 'tags': {'highway': 'residential', 'name': 'Rue de l\'Essai'}, 'geometry': g}]}))
    return route.abort()

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1600, 'height': 900}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror:' + str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'GPU stall' not in m.text else None)
    pg.route('**/*', serve)
    enter(pg)
    pg.wait_for_function('window.Scene3D && window.Scene3D.ready', timeout=15000)
    E = pg.evaluate
    box = pg.locator('#cv').bounding_box()
    def W(x, y):
        v = E('({x:state.view.x,y:state.view.y,s:state.view.scale})')
        return (box['x'] + v['x'] + x * v['s'], box['y'] + v['y'] - y * v['s'])
    def click(x, y, **k): X, Y = W(x, y); pg.mouse.move(X, Y); pg.mouse.click(X, Y, **k)
    def key(k): E('document.activeElement && document.activeElement.blur()'); pg.keyboard.press(k)

    # ---------- ruban et arbre
    ok(pg.locator('#ribbon [role="tab"]').count() == 9, 'ruban : 9 onglets')
    ok(pg.is_visible('#tree') and pg.locator('#treeBody .tr-row').count() >= 6, 'arbre de création visible (écran ≥ 1440 px)')
    pg.click('#treeBtn'); ok(not pg.is_visible('#tree'), 'arbre masqué par son bouton'); pg.click('#treeBtn'); ok(pg.is_visible('#tree'), 'arbre réaffiché')
    pg.click('#rt-mat'); ok(pg.is_visible('#rp-mat') and not pg.is_visible('#rp-sketch'), 'changement d\'onglet du ruban')
    pg.click('#rt-sketch')

    # ---------- esquisse sur le plan de face : rectangle + cercle (trou)
    pg.click('[data-cmd="skNew"]'); pg.wait_for_selector('dialog[open]')
    pg.select_option('dialog select[aria-label="Plan de l\'esquisse"]', 'front'); pg.fill('dialog input[aria-label="Nom de l\'esquisse"]', 'Socle')
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(150)
    ok(E('state.sketch') == 1 and E('Model.sketch(1).plane') == 'front', 'esquisse 1 sur le plan de face, en édition')
    ok(pg.is_visible('#skBar') and 'Socle' in pg.inner_text('#skBar'), 'bandeau d\'édition d\'esquisse')
    E("state.view.scale=0.08; Canvas2D.requestDraw()")
    key('r'); click(0, 0); click(4000, 2000)
    key('c'); click(2000, 1000); click(2500, 1000)
    key('Escape')
    o = E('Doc.get().objects')
    ok(len(o) == 2 and all(x.get('sk') == 1 for x in o), f'objets dessinés dans l\'esquisse {[x.get("sk") for x in o]}')
    R = E('Model.loops(1)'); ok(len(R) == 1 and len(R[0]['holes']) == 1, 'un contour avec un trou')
    area = E('Model.regionArea(Model.loops(1)[0])'); ok(near(area, 4000 * 2000 - math.pi * 500 ** 2, 2e-3), f'aire du profil {area}')
    # hors de l'esquisse, les objets du plan de face ne sont pas dans la vue en plan
    pg.click('[data-cmd="skExit"]'); ok(E('state.sketch') == 0, 'quitter l\'esquisse')
    ok(E('Doc.get().objects.every(o=>!Model.visible2D(o))'), 'esquisse de face masquée en vue de dessus')
    ok(E('IO.visibleObjects().length') == 0, 'esquisse de face absente des exports du plan')

    # ---------- bossage extrudé
    pg.click('#rt-model'); pg.click('[data-cmd="ftExtrude"]'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[aria-label="Profondeur (mm)"]', '3000')
    pg.select_option('dialog select[aria-label="Matériau"]', 'C25')
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(500)
    f = E('Doc.get().features')
    ok(len(f) == 1 and f[0]['type'] == 'extrude' and f[0]['d'] == 3000 and f[0]['mat'] == 'C25', f'fonction créée {f}')
    vol = E('Model.featureVolume(Doc.get().features[0])'); ok(near(vol, area * 3000, 1e-9), f'volume = aire × profondeur ({vol})')
    ok(pg.is_visible('#cv3d'), 'passage automatique en 3D après la fonction')
    sol = [s for s in E('View3D.solids()') if s['k'] == 'ext']
    ok(len(sol) == 1 and sol[0]['M'][6:9] == [0, -1, 0] and sol[0]['w1'] == 3000, 'solide extrudé sur le plan de face (normale −Y)')
    ok(E('Scene3D.stats().objects') >= 1, 'volume dans la scène 3D')
    ok('Bossage extrudé 1' in pg.inner_text('#treeBody'), 'fonction listée dans l\'arbre')
    pg.locator('#treeBody .tr-row', has_text='Bossage extrudé 1').click(); pg.wait_for_timeout(100)
    mtxt = re.sub(r'\s', '', pg.inner_text('#props')); mexp = int((4000 * 2000 - 24 * 500 ** 2 * math.sin(2 * math.pi / 48)) * 3000 / 1e9 * 2500)   # cercle → polygone de 48 côtés (comme la 3D)
    ok('Masse' in pg.inner_text('#props') and str(mexp) in mtxt, f'propriétés de la fonction : masse du béton {mexp} kg ({mtxt[-80:]})')
    pg.fill('#props input[aria-label="Profondeur (mm)"]', '1500'); pg.press('#props input[aria-label="Profondeur (mm)"]', 'Tab'); pg.wait_for_timeout(100)
    ok(E('Doc.get().features[0].d') == 1500, 'profondeur modifiée depuis le panneau')
    E('Doc.undo()'); ok(E('Doc.get().features[0].d') == 3000, 'annuler la modification')

    # ---------- révolution : esquisse de dessus avec axe + rectangle
    pg.click('#rt-sketch'); E("Workbench.newSketch('top')"); E("state.view.scale=0.08; Canvas2D.requestDraw()")
    key('l'); click(10000, 0); click(10000, 2000); pg.mouse.click(*W(14000, 4000), button='right')
    key('r'); click(10500, 0); click(11000, 2000)
    key('Escape')
    sk2 = E('state.sketch')
    pg.click('#rt-model'); pg.click('[data-cmd="ftRevolve"]'); pg.wait_for_selector('dialog[open]')
    pg.select_option('dialog select[aria-label="Esquisse"]', str(sk2)); pg.wait_for_timeout(50)
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(400)
    fr = E('Doc.get().features[1]'); ok(fr and fr['type'] == 'revolve' and fr['ang'] == 360 and fr['axis'] > 0, f'révolution créée {fr}')
    vr = E('Model.featureVolume(Doc.get().features[1])'); exp = math.pi * (1000 ** 2 - 500 ** 2) * 2000
    ok(near(vr, exp, 1e-6), f'volume de révolution (Guldin) = π(R²−r²)h ({vr} / {exp})')
    ok(any(s['k'] == 'rev' for s in E('View3D.solids()')), 'solide de révolution')

    # ---------- assemblage : composants et contraintes
    pg.click('#rt-asm'); pg.click('[data-cmd="cIns"]'); pg.wait_for_selector('dialog[open]')
    pg.click('dialog .part-btn[data-part="massif"]'); pg.wait_for_timeout(200)
    pg.click('[data-cmd="cIns"]'); pg.wait_for_selector('dialog[open]'); pg.click('dialog .part-btn[data-part="profil"]'); pg.wait_for_timeout(200)
    c = E('Doc.get().comps'); ok(len(c) == 2 and c[1]['part']['prof'] == 'HEA 200', 'deux composants insérés')
    pg.click('[data-cmd="mSur"]'); pg.wait_for_selector('dialog[open]'); pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(200)
    pos = E('[...Model.resolve(Doc.get().comps).pos.get(2)]'); ok(near(pos[2], 600), f'poteau posé sur le massif (z = 600) {pos}')
    pg.locator('#treeBody .tr-row', has_text='Massif de fondation 1').click(); pg.wait_for_timeout(100)
    pg.fill('#props input[aria-label="Hauteur (mm)"]', '900'); pg.press('#props input[aria-label="Hauteur (mm)"]', 'Tab'); pg.wait_for_timeout(150)
    ok(near(E('[...Model.resolve(Doc.get().comps).pos.get(2)]')[2], 900), 'massif rehaussé : le poteau suit (contrainte « posé sur »)')
    pg.locator('#treeBody .tr-row', has_text='Profilé acier 2').click(); pg.wait_for_timeout(50)
    pg.click('[data-cmd="mAxe"]'); pg.wait_for_selector('dialog[open]'); pg.fill('dialog input[data-k="0"]', '250'); pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(150)
    pos = E('[...Model.resolve(Doc.get().comps).pos.get(2)]'); ok(near(pos[0], 250) and near(pos[1], 0), f'axe aligné avec décalage X 250 {pos}')
    ok(E("View3D.solids().filter(s=>s.cid).length") == 2, 'solides des composants')
    # cycle de contraintes : ignoré, sans erreur
    E("Doc.mutate(d=>{d.comps[0].mate={t:'sur',ref:2,d:[0,0,0]}})"); ok(len(E('Model.resolve(Doc.get().comps).warn')) >= 1, 'contraintes circulaires détectées')
    E('Doc.undo()')

    # ---------- générateur de bâtiment
    pg.click('[data-cmd="gBld"]'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[data-k="L"]', '24'); pg.fill('dialog input[data-k="B"]', '15'); pg.fill('dialog input[data-k="e"]', '6')
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(600)
    comps = E('Doc.get().comps'); names = [x['name'] for x in comps]
    nP = sum(1 for n in names if n.startswith('Poteau')); nT = sum(1 for n in names if n.startswith('Traverse'))
    ok(nP == 10 and nT == 5 and 'Dallage' in names and sum(1 for n in names if re.match(r'Massif \d+[AB]$', n)) == 10, f'bâtiment : 5 portiques, 10 poteaux sur massifs, dallage ({nP}, {nT})')
    R = E('Object.fromEntries(Model.resolve(Doc.get().comps).pos)')
    p1 = [x for x in comps if x['name'] == 'Poteau 1A'][0]; t1 = [x for x in comps if x['name'] == 'Traverse 1'][0]
    ok(near(R[str(p1['id'])][2], 0), f'poteau 1A posé sur son massif à la cote 0 (dessus du dallage) {R[str(p1["id"])]}')
    ok(near(R[str(t1['id'])][2], 7000 + 400 / 2), f'traverse IPE 400 posée en tête de poteau (7 m) {R[str(t1["id"])]}')
    bard = [o for o in E('Doc.get().objects') if o.get('st', {}).get('comp') == 'BARD-DP']
    ok(len(bard) == 1 and bard[0]['props']['h'] == 7400, 'bardage double peau périphérique, hauteur jusqu\'au dessus des traverses')
    ok(E('Analysis.columns().length') == 11, 'poteaux du bâtiment (10) et poteau isolé analysés au flambement')
    bp = E('BOM.compute().parts'); hea = [r for r in bp if 'HEA 240' in r['desc']]
    ok(hea and hea[0]['count'] == 10 and abs(hea[0]['unit'] - 60.3 * 7) < 1, f'nomenclature : 10 poteaux HEA 240 de 7 m, {hea[0]["unit"] if hea else None} kg chacun')
    E('Doc.undo()'); ok(sum(1 for x in E('Doc.get().comps') if x['name'].startswith('Poteau')) == 0, 'un seul « annuler » retire tout le bâtiment')

    # ---------- matériaux, profilés, compositions (valeurs de référence)
    bv = E('BOM.compute().vols'); ok(len(bv) == 2 and abs(bv[0]['V'] - (4000 * 2000 - 24 * 500 ** 2 * math.sin(2 * math.pi / 48)) * 3000 / 1e9) < 1e-9, f'nomenclature : volumes des fonctions 3D {bv}')
    ok(E("Object.keys(MATS).length") >= 45, 'bibliothèque de matériaux')
    s355 = E("MATS.S355"); ok(s355['E'] == 210000 and s355['fy'] == 355 and s355['fu'] == 490 and s355['nu'] == 0.3, 'S355 (EN 1993-1-1 tableau 3.1)')
    ok(E("MATS.C25.E") == 31000 and E("MATS.C25.fk") == 25 and E("MATS.C25.ft") == 2.6, 'C25/30 (EN 1992-1-1 tableau 3.1)')
    chk = E("""Sections.list().filter(id=>PROFILES[id].fam!=='UPN').map(id=>{const p=PROFILES[id];const ig=Sections.iGeom(p)/1e4;const A=(2*p.b*p.tf+(p.h-2*p.tf)*p.tw)/100+(4-Math.PI)*p.r*p.r/100;return [id,p.Iy/ig,p.A/A,p.m/(0.785*p.A),p.Wy/(p.Iy/(p.h/20))]})""")
    bad = [c for c in chk if not (1.0 <= c[1] <= 1.07 and 0.99 <= c[2] <= 1.01 and 0.99 <= c[3] <= 1.01 and 0.995 <= c[4] <= 1.005)]
    ok(not bad, f'catalogue de profilés cohérent (aire, masse, inertie, module) {bad}')
    U = E("Phys.report(COMPOS['BARD-DP'].layers,'mur').th.U"); ok(abs(U - 1 / (0.13 + 0.04 + 0.09 + 0.12 / 0.038 + 2 * 0.00075 / 50)) < 1e-9, f'U du bardage double peau (EN ISO 6946) {U}')
    pg.click('#rt-mat'); pg.click('[data-cmd="mLib"]'); pg.wait_for_selector('dialog[open]')
    ok(pg.locator('dialog .tbl tbody tr').count() > 45, 'tableau de la bibliothèque des matériaux')
    pg.fill('dialog input[type="search"]', 'inox'); pg.wait_for_timeout(100); ok(pg.locator('dialog .tbl tbody tr:not(.lot)').count() == 2, 'recherche dans la bibliothèque')
    pg.click('dialog .dlg-h .ibs')
    pg.click('[data-cmd="cLib"]'); pg.wait_for_selector('dialog[open]'); ok('Coefficient U' in pg.inner_text('dialog') and 'Glaser' in pg.inner_text('dialog'), 'fiche de composition (U, condensation)'); pg.keyboard.press('Escape')

    # ---------- analyse : poutre IPE 200, 5 m, 10 kN/m (+ poids propre)
    E("Doc.mutate(d=>{d.objects.push({id:900,type:'line',a:[0,-20000],b:[5000,-20000],layer:7,st:{kind:'poutre',w:100,prof:'IPE 200',tag:'P1'},props:{ql:10}})})")
    r = E("(()=>{const r=Analysis.beamOf(Doc.get().objects.find(o=>o.id===900));return {f:r.f,M:r.M,s:r.sigma,q:r.q}})()")
    q = 10 + 22.4 * 9.81 / 1000
    ok(near(r['q'], q) and near(r['f'], 5 * q * 5000 ** 4 / (384 * 210000 * 1943e4), 1e-9) and near(r['M'], q * 25 / 8, 1e-9) and near(r['s'], q * 25 / 8 * 1e6 / 194300, 1e-9), f'poutre : flèche, moment, contrainte {r}')
    E("Doc.mutate(d=>{d.objects.push({id:901,type:'line',a:[0,-25000],b:[100000,-25000],layer:2,net:{dn:110,mat:'PEHD',tag:'R1'},props:{dt:30}})})")
    dl = E("Analysis.pipes()[0].dL"); ok(near(dl, 200e-6 * 100000 * 30, 1e-9), f'dilatation PEHD 100 m, 30 K = 600 mm ({dl})')
    pg.click('#rt-ana'); pg.click('[data-cmd="aRun"]'); pg.wait_for_selector('dialog[open]')
    ok('Poutres' in pg.inner_text('dialog') and 'Dilatation' in pg.inner_text('dialog') and 'IPE 200' in pg.inner_text('dialog'), 'fenêtre d\'analyse')
    pg.keyboard.press('Escape')
    pg.click('[data-cmd="aUtil"]'); pg.wait_for_timeout(300); ok(pg.get_attribute('#v3dStyle [data-style="util"]', 'aria-pressed') == 'true' if pg.locator('#v3dStyle [data-style="util"]').count() else True, 'style « taux de travail »')

    # ---------- site réel (réponses simulées)
    pg.click('#rt-site'); pg.click('[data-cmd="sSet"]'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[aria-label="Adresse du projet"]', '1 rue de l\'essai lyon'); pg.wait_for_selector('dialog .addr', timeout=5000)
    pg.click('dialog .addr'); pg.click('dialog .dlg-f .btn.pri')
    try: pg.wait_for_function('Site.status()==="ok"', timeout=15000)
    except Exception: print('statut site :', E('Site.status()'), E('Site.lastError()'), pg.inner_text('#msg'), calls)
    sd = E("(()=>{const s=Site.data();return {b:s.W.bld.length,r:s.W.roads.length,z0:s.z0,h:s.W.bld[0].h}})()")
    ok(sd['b'] == 1 and sd['r'] == 1 and sd['h'] == 12, f'site : 1 bâtiment BD TOPO (12 m), 1 voie {sd}')
    ok(abs(sd['z0'] - (200 + 0.01 * (N // 2))) < 1e-3, f'altitude NGF à l\'origine lue dans la grille {sd["z0"]}')
    ok(abs(E('Site.H(100,0)') - 0.01 * 100 / (500 / (N - 1))) < 0.02, 'relief interpolé (pente vers l\'est)')
    pg.wait_for_timeout(500)
    st = E('Scene3D.stats()'); ok(set(['Terrain', 'Voirie', 'Bâtiments']) <= set(st['site']), f'site dans la scène 3D {st["site"]}')
    ok(E('Doc.get().site.lat') == LAT and 'Essai' in pg.inner_text('#treeBody'), 'site enregistré dans le projet et dans l\'arbre')
    pg.screenshot(path=OUT + 'site.png')
    # export GLB : lieu au format ARCHIPLAN (lu par ARCHITRAFFIC)
    pg.click('#exportBtn')
    with pg.expect_download() as dl_: pg.click('#glb')
    gp = OUT + 'm.glb'; dl_.value.save_as(gp); raw = open(gp, 'rb').read()
    jl = int.from_bytes(raw[12:16], 'little'); js = json.loads(raw[20:20 + jl])
    ex = js['scenes'][0].get('extras', {})
    ok(ex.get('archiplan', {}).get('lieu', {}).get('latitude') == LAT and abs(ex['archiplan']['lieu']['altitude'] - sd['z0']) < 1e-6, f'GLB : lieu (latitude, altitude NGF) pour ARCHITRAFFIC {ex}')
    ok(not any(n.get('name') in ('Terrain', 'Bâtiments', 'Voirie') for n in js.get('nodes', [])), 'GLB : le site de contexte n\'est pas exporté')
    # ---------- enregistrement / réouverture : tout est conservé ; import invalide filtré
    pg.click('#fileBtn')
    with pg.expect_download() as dl_: pg.click('#save')
    sj = OUT + 'p.json'; dl_.value.save_as(sj); data = json.load(open(sj))
    ok(len(data['sketches']) == 2 and len(data['features']) == 2 and len(data['comps']) == 2 and data['site']['lon'] == LON, 'JSON : esquisses, fonctions, composants, site')
    data['features'].append({'id': 99, 'type': 'trou-noir', 'sk': 1}); data['features'].append({'id': 98, 'type': 'extrude', 'sk': 77})
    data['comps'].append({'id': 50, 'part': {'t': 'inconnu'}}); data['comps'].append({'id': 51, 'part': {'t': 'profil', 'prof': 'IPE 999', 'L': -5}, 'pos': [0, 0, 'x']})
    data['objects'][0]['sk'] = 555; data['site']['lat'] = 999
    json.dump(data, open(sj, 'w')); pg.set_input_files('#file', sj); pg.wait_for_timeout(400)
    d2 = E('Doc.get()')
    ok(len(d2['features']) == 2 and len(d2['comps']) == 3, f"import : fonctions et composants invalides écartés {[f['type'] for f in d2['features']]} {len(d2['comps'])}")
    c51 = [x for x in d2['comps'] if x['id'] == 51][0]; ok(c51['part']['prof'] == 'HEA 200' and c51['part']['L'] == 6000 and c51['pos'] == [0, 0, 0], 'import : paramètres de pièce bornés')
    ok('sk' not in d2['objects'][0] and d2['site'] is None, 'import : esquisse inconnue et site invalide retirés')

    pg.click('#mode2d'); pg.wait_for_timeout(200)
    print('appels simulés :', calls)
    print('erreurs page :', errs); ok(not errs, f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
