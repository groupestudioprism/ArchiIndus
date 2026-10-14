"""Test de bout en bout des phases 3 et 5 : réseaux (DN, matériau, repère), nomenclature, exports SVG / DXF / PDF.

Prérequis : python3 tools/build.py, `pip install playwright pypdf`, `playwright install chromium`.
Contrôles PDF : structure (qpdf --check si disponible), pypdf (pages, texte), et rendu PNG (pdftoppm) à regarder à la main.
Ce test ne remplace ni l'ouverture du DXF dans un logiciel de CAO, ni la lecture du PDF dans plusieurs lecteurs.
"""
import json, re, shutil, subprocess, sys, tempfile, pathlib, xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = tempfile.mkdtemp(prefix='archiindus-reseaux-') + '/'
print('Fichiers de sortie :', OUT)
fails = []; checks = 0
def ok(cond, msg):
    global checks; checks += 1
    if not cond: fails.append(msg); print('ÉCHEC :', msg)
def near(a, b, t=1e-3): return abs(a - b) <= t

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 800}, accept_downloads=True)
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
    objs = lambda: pg.evaluate('Doc.get().objects')

    # --- tracé en réseau depuis le panneau
    pg.evaluate("Doc.mutate(d=>{d.active=2})")
    pg.check('#netOn'); pg.fill('#netDn', '160'); pg.fill('#netMat', 'PEHD'); pg.press('#netMat', 'Tab')
    ok(pg.evaluate('state.net.on && state.net.dn===160 && state.net.mat==="PEHD"'), 'réglages de tracé en réseau pris en compte')
    pg.keyboard.press('Escape')
    pg.keyboard.press('l'); click(0, 0); click(6000, 0); pg.mouse.click(*W(9000, 5000), button='right')
    o = objs(); ok(len(o) == 1 and o[0].get('net') == {'dn': 160, 'mat': 'PEHD', 'tag': ''}, f'ligne tracée avec net {o}')
    pg.uncheck('#netOn')
    ok(pg.evaluate('state.net.on') is False, 'tracé en réseau désactivé')
    pg.keyboard.press('l'); click(0, 2000); click(3000, 2000); pg.mouse.click(*W(9000, 5000), button='right')
    o = objs(); ok(len(o) == 2 and 'net' not in o[1], 'ligne suivante sans net')
    pg.keyboard.press('Escape')

    # --- propriétés : repère + DN sur la sélection
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape'); pg.keyboard.press('z'); pg.wait_for_timeout(100); pg.keyboard.press('v'); click(3000, 0)
    ok(pg.evaluate('Tools.selection.size') == 1, 'sélection du réseau')
    ok('DN160' in pg.inner_text('#props'), 'propriété Réseau affichée')
    pg.fill('#props input[aria-label="Repère"]', 'EP-01')
    pg.fill('#props input[aria-label="Diamètre nominal en millimètres"]', '200')
    pg.click('#props >> text=Appliquer comme réseau')
    o = objs(); ok(o[0]['net'] == {'dn': 200, 'mat': 'PEHD', 'tag': 'EP-01'}, f'repère et DN appliqués {o[0].get("net")}')
    pg.fill('#props input[aria-label="Diamètre nominal en millimètres"]', '-5')
    pg.click('#props >> text=Appliquer comme réseau')
    ok(objs()[0]['net']['dn'] == 200 and 'invalide' in pg.inner_text('#msg'), 'DN négatif refusé')
    pg.keyboard.press('Control+z'); ok(objs()[0]['net'] == {'dn': 160, 'mat': 'PEHD', 'tag': ''}, 'annuler restaure l\'état précédent')
    pg.keyboard.press('Control+y')
    ok(objs()[0]['net']['dn'] == 200, 'rétablir')

    # --- jeu de données : autres réseaux, éléments hors réseau
    pg.evaluate("""Doc.mutate(d=>{
      const add=(o,l)=>{o.id=d.nextId++;o.layer=l;d.objects.push(o)};
      add({type:'poly',pts:[[0,3000],[4000,3000],[4000,6000]],closed:false,net:{dn:100,mat:'PVC',tag:'EU-01'}},3);
      add({type:'poly',pts:[[5000,3000],[8000,3000]],closed:false,net:{dn:100,mat:'PVC',tag:'EU-02'}},3);
      add({type:'poly',pts:[[7000,-2000],[10000,-2000],[10000,-500],[7000,-500]],closed:true},7);
      add({type:'circle',c:[12000,2000],r:500},8);
      add({type:'text',p:[100,-800],text:'Poste de relevage é',h:200},8);
      add({type:'dim',a:[0,0],b:[6000,0],off:-700,h:150},9);
    })""")
    bom = pg.evaluate('BOM.compute()')
    n = {(r['layer'], r['dn']): r for r in bom['nets']}
    ok(len(bom['nets']) == 2, f"2 groupes de réseaux {[(r['layer'], r['dn'], r['mat']) for r in bom['nets']]}")
    ok(near(n[('Eau potable', 200)]['length'], 6.0) and n[('Eau potable', 200)]['segments'] == 1, 'longueur DN200 = 6 m')
    ok(near(n[('Eaux usées', 100)]['length'], 10.0, 1e-6), f"longueur DN100 = 10 m ({n[('Eaux usées', 100)]['length']})")
    ok(n[('Eaux usées', 100)]['segments'] == 3 and n[('Eaux usées', 100)]['tags'] == ['EU-01', 'EU-02'], 'tronçons et repères DN100')
    oth = {r['layer']: r for r in bom['others']}
    ok(near(oth['Structures']['area'], 4.5) and oth['Équipements']['circles'] == 1, f'autres éléments {oth}')
    ok('Cotations' not in oth and 'Équipements' in oth, 'cotes et textes non comptés')

    # --- fenêtre Nomenclature
    pg.click('#bom'); pg.wait_for_selector('dialog[open]')
    txt = pg.inner_text('dialog'); ok('PEHD' in txt and 'EU-01, EU-02' in txt and '6,00' in txt and '10,00' in txt, f'tableau de nomenclature {txt[:200]!r}')
    with pg.expect_download() as d: pg.click('dialog >> text=Exporter CSV')
    cp = OUT + 'nomenclature.csv'; d.value.save_as(cp)
    raw = open(cp, 'rb').read(); ok(raw[:3] == b'\xef\xbb\xbf', 'CSV : BOM UTF-8')
    csvt = raw.decode('utf-8-sig'); ok('"Calque";"Matériau";"DN (mm)"' in csvt and '"PEHD"' in csvt and '"6,00"' in csvt, 'CSV : colonnes et décimales françaises')
    pg.click('dialog >> text=Fermer'); pg.wait_for_timeout(100); ok(pg.locator('dialog[open]').count() == 0, 'fenêtre fermée')

    # --- SVG
    with pg.expect_download() as d: pg.click('#svg')
    sp = OUT + 'sortie.svg'; d.value.save_as(sp)
    root = ET.parse(sp).getroot(); ns = '{http://www.w3.org/2000/svg}'
    halos = [e for e in root.iter(ns + 'polyline') if e.get('data-dn')]
    ok(len(halos) == 3 and sorted(e.get('stroke-width') for e in halos) == ['100', '100', '200'], f'SVG : 3 bandes de réseau {[e.get("stroke-width") for e in halos]}')
    ok(any('EP-01 · DN200' in (t.text or '') for t in root.iter(ns + 'text')), 'SVG : étiquette EP-01 · DN200')

    # --- DXF (structure + largeur de polyligne)
    with pg.expect_download() as d: pg.click('#dxf')
    dp = OUT + 'sortie.dxf'; d.value.save_as(dp)
    L = open(dp, encoding='ascii', newline='').read().split('\r\n'); L = L[:-1] if L and L[-1] == '' else L
    pairs = list(zip(L[0::2], L[1::2]))
    ok(len(L) % 2 == 0 and all(re.fullmatch(r'\s*-?\d+', c) for c, _ in pairs) and pairs[-1] == ('0', 'EOF'), 'DXF : structure valide')
    widths = []
    for i, (c, v) in enumerate(pairs):
        if (c, v) == ('0', 'POLYLINE'):
            j = i + 1
            while pairs[j][0] != '0':
                if pairs[j][0] == '40': widths.append(float(pairs[j][1]))
                j += 1
    ok(sorted(widths) == [100.0, 100.0, 200.0], f'DXF : largeurs de polyligne {widths}')
    ok(any(c == '1' and v in ('EP-01 - DN200', 'EU-01 - DN100') for c, v in pairs), 'DXF : texte de repère')
    ok(all(ord(ch) < 128 for ch in ''.join(L)), 'DXF : ASCII pur')

    # --- PDF
    pg.click('#pdf'); pg.wait_for_selector('dialog[open]')
    pg.fill('dialog input[aria-label="Client"]', 'Société Éxemple (test)'); pg.fill('dialog input[aria-label="Référence"]', 'AI-2026-001')
    with pg.expect_download() as d: pg.click('dialog >> text=Exporter le PDF')
    pp = OUT + 'sortie.pdf'; d.value.save_as(pp)
    ok(pg.evaluate('Doc.get().sheet.client') == 'Société Éxemple (test)', 'cartouche enregistré dans le projet')
    data = open(pp, 'rb').read(); ok(data.startswith(b'%PDF-1.4') and data.rstrip().endswith(b'%%EOF'), 'PDF : en-tête et fin')
    if shutil.which('qpdf'):
        r = subprocess.run(['qpdf', '--check', pp], capture_output=True, text=True)
        ok(r.returncode == 0 and 'No syntax or stream encoding errors' in r.stdout, f'qpdf --check : {r.stdout.strip()[-120:]} {r.stderr.strip()[:200]}')
    from pypdf import PdfReader
    rd = PdfReader(pp); ok(len(rd.pages) >= 2, f'PDF : {len(rd.pages)} feuilles (dessin + nomenclature)')
    mb = rd.pages[0].mediabox; ok(near(float(mb.width), 420 * 72 / 25.4, 0.1) and near(float(mb.height), 297 * 72 / 25.4, 0.1), f'PDF : A3 paysage {mb}')
    t0 = rd.pages[0].extract_text(); t1 = rd.pages[1].extract_text()
    ok('EP-01' in t0 and 'DN200' in t0 and 'AI-2026-001' in t0 and 'Échelle' in t0 and 'Projet sans titre' in t0, f'PDF : texte du dessin et du cartouche {t0[:160]!r}')
    ok('Société Éxemple (test)' in t0, 'PDF : accents conservés dans le cartouche')
    m = re.search(r'1:(\d+)', t0); ok(bool(m) and int(m.group(1)) in (20, 25, 50, 75, 100), f'PDF : échelle normalisée {m.group(0) if m else None}')
    ok('Nomenclature' in t1 and 'PEHD' in t1 and '6,00' in t1, f'PDF : nomenclature {t1[:120]!r}')
    if shutil.which('pdftoppm'):
        subprocess.run(['pdftoppm', '-r', '60', '-png', pp, OUT + 'pdf'], check=True)
        print('Rendu PDF :', sorted(f.name for f in pathlib.Path(OUT).glob('pdf*.png')))

    # --- persistance et import validé
    pg.wait_for_timeout(700); pg.reload(); pg.wait_for_timeout(400); pg.click('#authSkip')
    ok(objs()[0].get('net', {}).get('tag') == 'EP-01', 'réseau restauré après rechargement')
    bad = OUT + 'bad.json'
    base = pg.evaluate('JSON.parse(JSON.stringify(Doc.get()))')
    base['objects'] = [{'id': 1, 'type': 'line', 'a': [0, 0], 'b': [10, 0], 'layer': 1, 'net': {'dn': -5, 'mat': 'x'}},
                       {'id': 2, 'type': 'line', 'a': [0, 0], 'b': [10, 0], 'layer': 1, 'net': {'dn': 99999}},
                       {'id': 3, 'type': 'line', 'a': [0, 0], 'b': [10, 0], 'layer': 1, 'net': {'dn': 50.04, 'mat': 'M' * 99, 'tag': '<b>x</b>'}}]
    base['sheet'] = {'format': 'A0', 'client': 'C' * 500}
    json.dump(base, open(bad, 'w'))
    pg.set_input_files('#file', bad); pg.wait_for_timeout(300)
    o = objs(); ok(len(o) == 3 and 'net' not in o[0] and 'net' not in o[1] and o[2]['net']['dn'] == 50 and len(o[2]['net']['mat']) == 30, f'import : net invalide écarté, valide borné {[x.get("net") for x in o]}')
    sh = pg.evaluate('Doc.get().sheet'); ok(sh['format'] == 'A3' and len(sh['client']) == 60, f'import : cartouche borné {sh["format"]}')
    # un texte hostile du repère ne devient jamais du HTML
    pg.evaluate("Tools.selection.clear(); Tools.selection.add(3); Doc.mutate(d=>{d.objects[2].net.tag='<img src=x onerror=alert(1)>'})")
    pg.wait_for_timeout(100); ok(pg.locator('#props img').count() == 0, 'repère hostile : aucun HTML injecté')

    print('erreurs page :', errs); ok(not errs, f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
