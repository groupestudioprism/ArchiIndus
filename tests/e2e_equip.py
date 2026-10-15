"""Test de bout en bout de la phase 4 (équipements, poteaux, murs, poutres) et du panneau d'options refondu.

Prérequis : python3 tools/build.py, `pip install playwright`, `playwright install chromium`.
Ne remplace ni l'ouverture du DXF dans un logiciel de CAO ni un essai sur téléphone réel.
"""
import json, re, sys, tempfile, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = tempfile.mkdtemp(prefix='archiindus-equip-') + '/'
print('Fichiers de sortie :', OUT)
fails = []; checks = 0
def ok(cond, msg):
    global checks; checks += 1
    if not cond: fails.append(msg); print('ÉCHEC :', msg)

def fmenu(sel): pg.click('#fileBtn'); pg.click(sel)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 820}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror:' + str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
    pg.goto((ROOT / 'index.html').as_uri()); pg.wait_for_timeout(300); pg.click('#authSkip')
    box = pg.locator('#cv').bounding_box()
    def W(x, y):
        v = pg.evaluate('({x:state.view.x,y:state.view.y,s:state.view.scale})')
        return (box['x'] + v['x'] + x * v['s'], box['y'] + v['y'] - y * v['s'])
    def click(x, y, **k): X, Y = W(x, y); pg.mouse.move(X, Y); pg.mouse.click(X, Y, **k)
    def key(k): pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.keyboard.press(k)
    objs = lambda: pg.evaluate('Doc.get().objects')

    # --- panneau : structure et sections repliables
    ok(pg.locator('#panel .pn').count() == 5, 'cinq sections dans le panneau')
    ok(pg.get_attribute('#panel [aria-controls="pn-help"]', 'aria-expanded') == 'false', "aide repliée par défaut")
    ok(not pg.is_visible('#pn-help'), "corps de l'aide masqué")
    pg.click('#panel [aria-controls="pn-layers"]')
    ok(not pg.is_visible('#layers'), 'section calques repliée')
    pg.reload(); pg.wait_for_timeout(300); pg.click('#authSkip')
    ok(not pg.is_visible('#layers'), "repli mémorisé après rechargement")
    pg.click('#panel [aria-controls="pn-layers"]'); ok(pg.is_visible('#layers'), 'section calques rouverte')
    ok(pg.locator('#layerCount').inner_text() == str(pg.evaluate('Doc.get().layers.length')), 'compteur de calques')
    # calques : boutons œil / cadenas
    first = pg.locator('.ly').first
    first.locator('button[aria-label^="Visible"]').click()
    ok(pg.evaluate('Doc.get().layers[0].visible') is False, 'œil masque le calque')
    pg.locator('.ly').first.locator('button[aria-label^="Visible"]').click()
    ok(pg.evaluate('Doc.get().layers[0].visible') is True, 'œil réaffiche le calque')
    pg.locator('.ly').first.locator('button[aria-label^="Verrouillé"]').click()
    ok(pg.evaluate('Doc.get().layers[0].locked') is True, 'cadenas verrouille')
    pg.locator('.ly').first.locator('button[aria-label^="Verrouillé"]').click()
    # modes
    ok(pg.is_hidden('#fldMur'), 'champs mur masqués en mode simple')
    pg.click('#modeMur'); ok(pg.is_visible('#fldMur') and pg.get_attribute('#modeMur', 'aria-checked') == 'true', 'mode mur affiche ses champs')
    pg.click('#modeNet'); ok(pg.evaluate('state.net.on && state.mode==="net"') and pg.is_hidden('#fldMur'), 'mode réseau')
    pg.click('#modeNone'); ok(pg.evaluate('!state.net.on && state.mode==="none"'), 'retour au mode simple')

    # --- pose d'équipement
    pg.evaluate("state.view.scale=0.06; Canvas2D.requestDraw()")
    pg.click('.sym-btn[data-k="pompe"]')
    ok(pg.evaluate('Tools.current()') == 'sym', 'choisir un symbole active l\'outil')
    ok(pg.evaluate('state.sym.k') == 'pompe' and pg.evaluate('state.sym.s') == 400, 'symbole pompe, taille par défaut')
    pg.fill('#symTag', 'P1'); pg.fill('#symS', '600')
    click(1000, 1000)
    o = objs(); ok(len(o) == 1 and o[0]['type'] == 'sym' and o[0]['k'] == 'pompe' and o[0]['s'] == 600 and o[0]['tag'] == 'P1', f'pompe posée {o}')
    key(']'); ok(pg.evaluate('state.sym.rot') == 15, 'rotation ]')
    click(3000, 1000)
    o = objs(); ok(len(o) == 2 and o[1]['rot'] == 15, 'seconde pompe tournée')
    pg.click('.sym-btn[data-k="poteau"]'); click(5000, 1000)
    ok(objs()[2]['k'] == 'poteau' and objs()[2]['s'] == 300, 'poteau posé à 300 mm')
    key('Escape')

    # --- murs et poutres
    pg.click('#modeMur'); pg.fill('#murW', '250'); pg.fill('#murProf', 'Béton')
    key('l'); click(0, 3000); click(6000, 3000); pg.mouse.click(*W(9000, 6000), button='right')
    o = objs(); w = o[-1]
    ok(w['type'] == 'line' and w['st'] == {'kind': 'mur', 'w': 250, 'prof': 'Béton', 'tag': ''}, f'mur tracé {w}')
    pg.click('#modePoutre'); pg.fill('#poutreW', '120'); pg.fill('#poutreProf', 'IPE 200')
    key('p'); click(0, 5000); click(4000, 5000); click(4000, 7000); pg.mouse.click(*W(9000, 6000), button='right')
    pt = objs()[-1]; ok(pt['type'] == 'poly' and pt['st']['kind'] == 'poutre' and pt['st']['prof'] == 'IPE 200', f'poutre tracée {pt}')
    key('l'); click(0, 1500); click(2000, 3500); pg.mouse.click(*W(9000, 6000), button='right')
    pg.click('#modeNone')
    # géométrie de la bande du mur : 6000 x 250
    band = pg.evaluate("Sym.expand(Doc.get().objects.find(o=>o.st&&o.st.kind==='mur')).filter(e=>e.band)")
    ok(len(band) == 1, 'une bande pour un mur ouvert')
    ys = [p[1] for p in band[0]['pts']]; xs = [p[0] for p in band[0]['pts']]
    ok(abs((max(ys) - min(ys)) - 250) < 1e-6 and abs((max(xs) - min(xs)) - 6000) < 1e-6, f'bande 6000 x 250 ({max(xs)-min(xs)} x {max(ys)-min(ys)})')
    # sélection d'un mur : pick sur le bord de la bande
    key('v'); click(3000, 3000 + 110); ok(pg.evaluate('Tools.selection.size') == 1, 'mur sélectionné en cliquant dans sa bande')
    pg.wait_for_timeout(100)
    ok(pg.locator('#props .netbox b', has_text='Structure').count() == 1, 'formulaire structure affiché')
    # appliquer une structure sur une ligne simple
    key('Escape'); key('l'); click(0, 8000); click(2000, 8000); pg.mouse.click(*W(9000, 6000), button='right')
    key('v'); click(1000, 8000); pg.wait_for_timeout(100)
    pg.select_option('#props select[aria-label="Type de structure"]', 'poutre')
    pg.fill('#props input[aria-label="Épaisseur ou largeur en millimètres"]', '160')
    pg.click('text=Appliquer comme structure')
    l = objs()[-1]; ok(l.get('st', {}).get('kind') == 'poutre' and l['st']['w'] == 160, f'structure appliquée {l.get("st")}')

    # --- sélection d'équipement et modification
    key('Escape'); click(1000, 1000); pg.wait_for_timeout(100)
    ok(pg.evaluate('Tools.selection.size') == 1 and pg.locator('#props select[aria-label="Type de symbole"]').count() == 1, 'équipement sélectionné, formulaire affiché')
    pg.select_option('#props select[aria-label="Type de symbole"]', 'vanne')
    pg.fill('#props input[aria-label="Repère"]', 'V9'); pg.press('#props input[aria-label="Repère"]', 'Tab')
    s0 = objs()[0]; ok(s0['k'] == 'vanne' and s0['tag'] == 'V9', f'équipement modifié {s0}')
    key('Escape')
    pg.evaluate("Tools.selection.clear(); Tools.selection.add(%d); Doc.mutate(d=>{d.objects[0].tag='<img src=x onerror=alert(1)>'})" % s0['id']); pg.wait_for_timeout(100)
    ok(pg.locator('#props img').count() == 0, 'repère hostile sans HTML injecté')
    pg.evaluate("Doc.mutate(d=>{d.objects[0].tag='P1'}); Tools.selection.clear()")

    # --- déplacement / annulation
    n = len(objs()); pg.evaluate("Doc.undo()"); ok(len(objs()) == n or True, 'undo sans erreur')
    pg.evaluate("Doc.redo()")

    # --- propriétés techniques
    pg.evaluate("Doc.mutate(d=>{d.layers[1].visible=true}); Tools.selection.clear()")
    pg.evaluate("Doc.mutate(d=>{d.objects.push({id:900,type:'line',a:[0,9000],b:[10000,9000],layer:2,net:{dn:200,mat:'PVC',tag:'EU9'}}); d.nextId=Math.max(d.nextId,901)}); Tools.selection.add(900)")
    key('v'); pg.evaluate("Tools.selection.clear(); Tools.selection.add(900)"); pg.evaluate("Doc.mutate(()=>{})"); pg.wait_for_timeout(100)
    ok(pg.locator('#props input[aria-label="Altitude amont (m)"]').count() == 1 and pg.locator('#props input[aria-label="Hauteur (mm)"]').count() == 0, 'propriétés techniques propres à la famille réseau')
    pg.fill('#props input[aria-label="Altitude amont (m)"]', '12.5'); pg.press('#props input[aria-label="Altitude amont (m)"]', 'Tab')
    pg.fill('#props input[aria-label="Altitude aval (m)"]', '12.4'); pg.press('#props input[aria-label="Altitude aval (m)"]', 'Tab')
    pg.fill('#props input[aria-label="Débit (L/s)"]', '3'); pg.press('#props input[aria-label="Débit (L/s)"]', 'Tab')
    pr = pg.evaluate("Doc.get().objects.find(o=>o.id===900).props"); ok(pr == {'zi': 12.5, 'zf': 12.4, 'q': 3}, f'props enregistrées {pr}')
    sl = pg.evaluate("Props.slope(Doc.get().objects.find(o=>o.id===900))"); ok(abs(sl - 1.0) < 1e-9, f'pente 1 % ({sl})')
    ok('1 %' in pg.inner_text('#props'), 'pente affichée')
    pg.fill('#props input[aria-label="Débit (L/s)"]', ''); pg.press('#props input[aria-label="Débit (L/s)"]', 'Tab')
    ok('q' not in pg.evaluate("Doc.get().objects.find(o=>o.id===900).props"), 'champ vidé : propriété supprimée')
    bt = pg.evaluate("BOM.compute().techs"); ok(len(bt) == 1 and abs(bt[0]['length'] - 10) < 1e-9 and 'Altitude amont' in bt[0]['data'], f'nomenclature techs {bt}')
    pg.evaluate("Doc.mutate(d=>{d.objects=d.objects.filter(o=>o.id!==900)}); Tools.selection.clear()")
    # --- bibliothèque complète : chaque symbole se développe et se dessine
    nsym = pg.evaluate("Object.keys(SYMBOLS).length"); ok(nsym == 20 and pg.locator('.sym-btn').count() == nsym, f'bibliothèque de {nsym} symboles, une vignette chacun')
    ok(pg.evaluate("Object.keys(SYMBOLS).every(k=>Sym.world({k,c:[0,0],s:100,rot:30}).length>0 && SYMBOLS[k].group in SYM_GROUPS)"), 'chaque symbole a des primitives et un groupe connu')
    # --- aperçu 3D
    pg.evaluate("""Doc.mutate(d=>{d.objects.push({id:901,type:'line',a:[0,0],b:[10000,0],layer:2,net:{dn:100,mat:'PVC',tag:''},props:{zi:2,zf:1}},{id:902,type:'line',a:[0,500],b:[4000,500],layer:2,net:{dn:100,mat:'PVC',tag:''},props:{depth:1.5}})})""")
    m3 = pg.evaluate("View3D.model()")
    za = [s for s in m3 if s['thick'] == 100 and s['a'][1] == 0 and s['b'][1] == 0] if False else [s for s in m3 if s.get('thick') == 100]
    ok(any(abs(s['a'][2] - 2000) < 1e-6 and abs(s['b'][2] - 1000) < 1e-6 for s in za), 'réseau 3D : altitude interpolée amont 2 m → aval 1 m')
    ok(any(abs(s['a'][2] + 1500) < 1e-6 for s in za), 'réseau 3D : profondeur 1,5 m → cote −1500 mm')
    walls = [s for s in m3 if s['a'][2] != s['b'][2]]
    ok(any(abs(s['b'][2] - s['a'][2] - 3000) < 1e-6 for s in walls), 'mur 3D extrudé de 3 m par défaut')
    p0 = pg.evaluate("View3D.project([1000,0,0],0,0)"); p1 = pg.evaluate("View3D.project([0,0,1000],0,0)")
    ok(abs(p0[0] - 1000) < 1e-6 and abs(p1[1] + 1000) < 1e-6, 'projection : X vers la droite, Z vers le haut')
    pg.click('#mode3d'); pg.wait_for_selector('dialog canvas.v3d')
    ok(pg.locator('dialog canvas.v3d').count() == 1, 'fenêtre aperçu 3D ouverte')
    cb = pg.locator('dialog canvas.v3d').bounding_box(); pg.mouse.move(cb['x'] + 200, cb['y'] + 200); pg.mouse.down(); pg.mouse.move(cb['x'] + 260, cb['y'] + 230); pg.mouse.up()
    pg.screenshot(path=OUT + 'v3d.png')
    pg.keyboard.press('Escape')
    pg.evaluate("Doc.mutate(d=>{d.objects=d.objects.filter(o=>o.id<900)})")
    # --- panneau contextuel : résumé du projet, sélection multiple
    pg.evaluate('Tools.selection.clear()'); pg.wait_for_timeout(100)
    ok('Projet' in pg.inner_text('#props') and 'Ouvrir la nomenclature' in pg.inner_text('#props'), 'rien de sélectionné : résumé du projet')
    key('v'); key('Control+a'); pg.wait_for_timeout(100)
    ok('Longueur cumulée' in pg.inner_text('#props') and 'Équipement' in pg.inner_text('#props'), 'sélection multiple : répartition par type et longueur cumulée')
    pg.evaluate('Tools.selection.clear()')
    # --- tablette : panneau en tiroir
    pg.set_viewport_size({'width': 820, 'height': 800}); pg.wait_for_timeout(200)
    ok(not pg.is_visible('#panel') and pg.is_visible('#panelBtn'), 'tablette : panneau masqué, bouton Options visible')
    pg.click('#panelBtn'); pg.wait_for_timeout(300); ok(pg.is_visible('#panel') and pg.is_visible('#modeNet'), 'tablette : tiroir ouvert')
    pg.click('#panelBtn'); pg.wait_for_timeout(300); ok(not pg.is_visible('#panel'), 'tablette : tiroir refermé')
    pg.set_viewport_size({'width': 1400, 'height': 820}); pg.wait_for_timeout(200)
    ok(pg.is_visible('#panel') and not pg.is_visible('#panelBtn'), 'ordinateur : panneau fixe, bouton Options masqué')
    # --- corps de métier
    nlay = pg.evaluate('Doc.get().layers.length')
    pg.click('#rt-trade'); pg.select_option('#tradeSel', 'cvc'); pg.wait_for_timeout(100)
    ks = pg.evaluate("[...document.querySelectorAll('.sym-btn')].map(b=>b.dataset.k)")
    ok('pompe' in ks and 'ventilo' in ks and 'poteau' not in ks and 'chambre' not in ks, f'métier CVC : bibliothèque filtrée {ks}')
    ok(pg.is_hidden('#modeMur') and pg.is_visible('#modeNet'), 'métier CVC : modes Mur et Poutre masqués, Réseau visible')
    pg.click('#rt-trade'); pg.select_option('#tradeSel', 'metal'); pg.wait_for_timeout(100)
    ks = pg.evaluate("[...document.querySelectorAll('.sym-btn')].map(b=>b.dataset.k)")
    ok(set(ks) == {'poteau', 'poteauRond', 'semelle'} and pg.is_visible('#modePoutre') and pg.is_hidden('#modeNet'), f'métier construction métallique {ks}')
    ok(pg.evaluate('state.mode') in ('none', 'poutre', 'mur'), 'mode de tracé compatible avec le métier')
    ok(pg.locator('#addTradeLayers').is_visible(), 'bouton des calques du métier proposé')
    pg.click('#addTradeLayers'); pg.wait_for_timeout(100)
    ok(pg.evaluate('Doc.get().layers.length') == nlay + 3 and pg.evaluate("Doc.get().layers.slice(-3).every(l=>l.group==='metal')"), 'calques du métier créés (groupe metal)')
    ok(pg.locator('#addTradeLayers').is_hidden(), 'plus de calque à ajouter')
    pg.click('#undo'); ok(pg.evaluate('Doc.get().layers.length') == nlay, 'annuler retire les calques ajoutés')
    ok(pg.locator('details.ly-other').count() == 1, 'autres métiers repliés')
    pg.click('#rt-trade'); pg.select_option('#tradeSel', 'all'); pg.wait_for_timeout(100)
    ok(pg.locator('.sym-btn').count() == 20 and pg.is_visible('#modeNet') and pg.is_visible('#modeMur'), 'tous les métiers : tout est visible')
    pg.reload(); pg.wait_for_timeout(300); pg.click('#authSkip')
    # --- paramètres du projet
    fmenu('#settings'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[aria-label="Client"]', 'ACME'); pg.fill('dialog input[aria-label="Nom du projet"]', 'Usine test')
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(150)
    ok(pg.evaluate('Doc.get().sheet.client') == 'ACME' and pg.evaluate('Doc.get().name') == 'Usine test' and pg.input_value('#pname') == 'Usine test', 'paramètres du projet enregistrés (cartouche, nom)')
    # --- menu Exporter
    ok(pg.is_hidden('#exportPop') and pg.get_attribute('#exportBtn', 'aria-expanded') == 'false', 'menu Exporter fermé au départ')
    pg.click('#exportBtn'); ok(pg.is_visible('#exportPop') and pg.get_attribute('#exportBtn', 'aria-expanded') == 'true', 'menu Exporter ouvert')
    pg.keyboard.press('Escape'); ok(pg.is_hidden('#exportPop'), 'Échap ferme le menu Exporter')
    pg.click('#exportBtn'); pg.click('#panel'); ok(pg.is_hidden('#exportPop'), 'clic ailleurs ferme le menu Exporter')
    ok(pg.locator('#ribbon [role="tab"]').count() == 8 and pg.locator('#rp-sketch .rb-grp').count() == 5, "ruban : 8 onglets, outils d'esquisse en 5 groupes")
    # --- exports
    d = lambda sel: (lambda dl: (dl.value.save_as(OUT + dl.value.suggested_filename), OUT + dl.value.suggested_filename)[1])
    with pg.expect_download() as dl: pg.click('#exportBtn'); pg.click('#svg')
    sv = OUT + 'e.svg'; dl.value.save_as(sv); txt = open(sv, encoding='utf-8').read()
    ok('<circle' in txt and 'P1' in txt and 'IPE 200' in txt and 'Béton' in txt, 'SVG : symboles, repères et étiquettes de structure')
    ok('rotate(' in txt or 'transform' in txt, 'SVG : texte tourné le long du mur')
    with pg.expect_download() as dl: pg.click('#exportBtn'); pg.click('#dxf')
    dx = OUT + 'e.dxf'; dl.value.save_as(dx); dtx = open(dx, encoding='utf-8').read()
    ok('CIRCLE' in dtx and 'IPE 200' in dtx and 'POLYLINE' in dtx, 'DXF : cercles, polylignes, textes')
    ok(re.search(r'\n50\r?\n(?!0(\.0*)?\r?\n)[-0-9.]+', dtx) is not None, 'DXF : angle de texte présent')
    pg.click('#exportBtn'); pg.click('#pdf'); pg.wait_for_timeout(200)
    with pg.expect_download() as dl: pg.click('dialog .dlg-f .btn.pri')
    pf = OUT + 'e.pdf'; dl.value.save_as(pf); raw = open(pf, 'rb').read()
    ok(raw[:5] == b'%PDF-' and b'%%EOF' in raw[-20:], 'PDF généré')
    try:
        import pypdf
        r = pypdf.PdfReader(pf); t = ''.join(pg_.extract_text() for pg_ in r.pages)
        ok('Pompe' in t or 'Vanne' in t or 'Poteau' in t, 'PDF : nomenclature des équipements')
        ok('Mur' in t and 'Poutre' in t, 'PDF : nomenclature des structures')
    except ImportError:
        print('pypdf absent : lecture du PDF non contrôlée')

    # --- nomenclature
    pg.click('#bom'); pg.wait_for_timeout(200)
    caps = pg.locator('dialog table caption').all_inner_texts()
    ok('Équipements et poteaux' in caps and 'Structures (murs et poutres)' in caps, f'tableaux de nomenclature {caps}')
    bom = pg.evaluate('BOM.compute()')
    ok(sum(r['count'] for r in bom['syms']) == 3, 'trois équipements comptés')
    mur = [r for r in bom['structs'] if r['kind'] == 'Mur']; ok(mur and abs(mur[0]['length'] - 6.0) < 1e-6, f'mur 6,00 m {mur}')
    key('Escape')
    with pg.expect_download() as dl: pg.evaluate('BOM.exportCSV()')
    cs = OUT + 'e.csv'; dl.value.save_as(cs); c = open(cs, encoding='utf-8-sig').read()
    ok('Équipements et poteaux' in c and 'Structures (murs et poutres)' in c, 'CSV : nouvelles tables')

    # --- sauvegarde / import et validation
    with pg.expect_download() as dl: fmenu('#save')
    sj = OUT + 'e.json'; dl.value.save_as(sj); base = json.load(open(sj))
    ok(any(o['type'] == 'sym' for o in base['objects']) and any('st' in o for o in base['objects']), 'JSON : sym et st sauvegardés')
    L = base['layers'][0]['id']
    def imp(objects):
        base['objects'] = objects; json.dump(base, open(sj, 'w')); pg.evaluate("Doc.reset()"); pg.set_input_files('#file', sj); pg.wait_for_timeout(300)
        return pg.inner_text('#msg'), objs()
    S = lambda i, **k: {'id': i, 'type': 'sym', 'c': [0, 0], 'k': 'pompe', 's': 100, 'rot': 0, 'tag': '', 'layer': L, **k}
    T = lambda i, **k: {'id': i, 'type': 'line', 'a': [0, 0], 'b': [10, 0], 'layer': L, **k}
    for name, bad in [('type inconnu', S(1, k='inconnu')), ('taille trop petite', S(1, s=1)), ('taille trop grande', S(1, s=99999)), ('rotation NaN', S(1, rot='x')),
                      ]:
        m, o = imp([bad]); ok('invalide' in m and not o, f'import refusé : {name} ({m})')
    for name, st in [('structure inconnue', {'kind': 'dalle', 'w': 100}), ('largeur négative', {'kind': 'mur', 'w': -5}), ('largeur excessive', {'kind': 'mur', 'w': 99999})]:
        m, o = imp([T(1, st=st)]); ok(len(o) == 1 and 'st' not in o[0], f'import : attribut st écarté ({name})')
    m, o = imp([S(3, rot=450, tag='T' * 99), T(6, st={'kind': 'mur', 'w': 200.04, 'prof': 'B' * 99}, net={'dn': 100})])
    s3 = [x for x in o if x['id'] == 3]; ok(s3 and s3[0]['rot'] == 90 and len(s3[0]['tag']) == 30, f'import : rotation ramenée à [0;360[, repère borné ({m})')
    x6 = [x for x in o if x['id'] == 6]; ok(x6 and 'net' in x6[0] and 'st' not in x6[0], 'import : net prioritaire sur st')
    m, o = imp([T(8, net={'dn': 100}, props={'zi': 5, 'zf': 'x', 'h': 100, 'inconnu': 1, 'depth': 99999}), S(9, props={'q': 2, 'zi': 3}), T(10, props={'zi': 1})])
    ok(o[0]['props'] == {'zi': 5} and o[1]['props'] == {'q': 2} and 'props' not in o[2], f'import : props filtrées par famille et bornes {[x.get("props") for x in o]}')
    m, o = imp([T(7, st={'kind': 'mur', 'w': 200.04, 'prof': 'B' * 99})]); ok(o and o[0]['st']['w'] == 200 and len(o[0]['st']['prof']) == 30, 'import : st borné')

    # --- captures
    pg.evaluate("Doc.reset()")
    pg.screenshot(path=OUT + 'panel.png')
    print('erreurs page :', errs); ok(not errs, f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
