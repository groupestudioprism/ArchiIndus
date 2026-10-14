"""Test de la vue 3D (Three.js r160) : modes Plan / 3D, solides, rendu WebGL, vues, styles, export GLB.

Prérequis : python3 tools/build.py ; Playwright + Chromium ; une copie locale de Three.js r160 :
  mkdir /tmp/three && cd /tmp/three && npm init -y && npm i three@0.160.0   puis   THREE_DIR=/tmp/three/node_modules/three python3 tests/e2e_3d.py
(la page charge Three.js depuis jsDelivr ; le test sert les mêmes fichiers depuis le disque). Rendu WebGL logiciel (SwiftShader) : pas de test GPU réel.
"""
import os, sys, json, tempfile, pathlib, re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
THREE = pathlib.Path(os.environ.get('THREE_DIR', '/tmp/claude-0/three/node_modules/three'))
if not (THREE / 'build/three.module.js').exists():
    print('THREE_DIR introuvable : test 3D non exécuté.'); sys.exit(2)
OUT = tempfile.mkdtemp(prefix='archiindus-3d-') + '/'
print('Fichiers de sortie :', OUT)
fails = []; checks = 0
def ok(c, m):
    global checks; checks += 1
    if not c: fails.append(m); print('ÉCHEC :', m)

def serve(route):
    u = route.request.url
    if u.startswith('file:'): return route.continue_()
    m = re.match(r'https://cdn\.jsdelivr\.net/npm/three@0\.160\.0/(.*)', u)
    if m and (THREE / m.group(1)).exists():
        return route.fulfill(path=str(THREE / m.group(1)), content_type='text/javascript', headers={'access-control-allow-origin': '*'})
    return route.abort()

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1400, 'height': 820}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror:' + str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'GPU stall' not in m.text else None)
    pg.route('**/*', serve)
    pg.goto((ROOT / 'index.html').as_uri()); pg.wait_for_timeout(500); pg.click('#authSkip')
    pg.wait_for_function('window.Scene3D && window.Scene3D.ready', timeout=15000)
    ok(True, 'Three.js chargé')
    # scène de test : réseau en pente, mur, poutre, pompe, poteau
    pg.evaluate("""Doc.mutate(d=>{
      d.objects.push({id:1,type:'line',a:[0,0],b:[10000,0],layer:2,net:{dn:200,mat:'PVC',tag:'EU1'},props:{zi:2,zf:1}},
        {id:2,type:'line',a:[0,3000],b:[8000,3000],layer:7,st:{kind:'mur',w:250,prof:'Béton',tag:''}},
        {id:3,type:'poly',pts:[[0,5000],[6000,5000],[6000,7000]],closed:false,layer:7,st:{kind:'poutre',w:150,prof:'IPE 300',tag:''},props:{z:4}},
        {id:4,type:'sym',c:[2000,1500],k:'pompe',s:600,rot:0,tag:'P1',layer:8},
        {id:5,type:'sym',c:[5000,1500],k:'poteau',s:300,rot:0,tag:'',layer:7},
        {id:6,type:'sym',c:[7000,1500],k:'cuve',s:1500,rot:0,tag:'',layer:8}); d.nextId=7})""")
    sol = pg.evaluate('View3D.solids()')
    kinds = {}
    for s in sol: kinds[s['k']] = kinds.get(s['k'], 0) + 1
    ok(kinds.get('pipe') == 1 and kinds.get('prism', 0) == 3 and kinds.get('cyl', 0) == 2, f'solides {kinds}')
    pipe = [s for s in sol if s['k'] == 'pipe'][0]; ok(pipe['r'] == 100 and pipe['a'][2] == 2000 and pipe['b'][2] == 1000, 'tuyau : rayon DN/2, altitudes 2 m → 1 m')
    mur = [s for s in sol if s['k'] == 'prism' and abs(s['z1'] - s['z0'] - 3000) < 1e-6]; ok(len(mur) >= 1, 'mur extrudé de 3 m')
    pou = [s for s in sol if s['k'] == 'prism' and abs(s['z1'] - s['z0'] - 300) < 1e-6]; ok(len(pou) == 1 and abs(pou[0]['z1'] - 4000) < 1e-6, 'poutre IPE 300 : hauteur 300 mm, dessus à 4 m')
    # bascule en 3D
    pg.click('#mode3d'); pg.wait_for_timeout(800)
    ok(pg.is_visible('#cv3d') and pg.is_hidden('#cv') and pg.get_attribute('#mode3d', 'aria-pressed') == 'true', 'mode 3D : canevas 3D visible, plan masqué')
    st = pg.evaluate('Scene3D.stats()'); ok(st['objects'] > 8 and not st['capped'], f'scène construite {st}')
    shot = OUT + 'v3d-iso.png'; pg.screenshot(path=shot)
    # le rendu n'est pas vide : lecture des pixels du canevas
    px = pg.evaluate("""(()=>{const c=document.getElementById('cv3d');const t=document.createElement('canvas');t.width=c.width;t.height=c.height;const x=t.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,t.width,t.height).data;const bg=[d[0],d[1],d[2]];let n=0;for(let i=0;i<d.length;i+=4){if(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2])>30)n++}return n})()""")
    ok(px > 2000, f'rendu non vide ({px} pixels différents du fond)')
    for cam in ['top', 'front', 'right', 'iso']:
        pg.click(f'#v3dCams [data-cam="{cam}"]'); pg.wait_for_timeout(150)
    pg.click('#v3dCams [data-cam="top"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'v3d-top.png')
    for stl in ['wire', 'xray', 'shaded']:
        pg.click(f'#v3dStyle [data-style="{stl}"]'); pg.wait_for_timeout(150)
        ok(pg.get_attribute(f'#v3dStyle [data-style="{stl}"]', 'aria-pressed') == 'true', f'style {stl}')
    pg.click('#v3dStyle [data-style="xray"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'v3d-xray.png'); pg.click('#v3dStyle [data-style="shaded"]')
    # orbite à la souris
    cb = pg.locator('#cv3d').bounding_box(); pg.mouse.move(cb['x'] + 600, cb['y'] + 300); pg.mouse.down(); pg.mouse.move(cb['x'] + 700, cb['y'] + 340, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    # synchro avec le dessin : un masquage de calque met la scène à jour
    n0 = pg.evaluate('Scene3D.stats().objects'); pg.evaluate("Doc.mutate(d=>{d.layers.find(l=>l.id===2).visible=false})"); pg.wait_for_timeout(200)
    ok(pg.evaluate('Scene3D.stats().objects') < n0, 'masquer un calque met la 3D à jour')
    pg.evaluate("Doc.mutate(d=>{d.layers.find(l=>l.id===2).visible=true})"); pg.wait_for_timeout(200)
    ok('lecture seule' in pg.inner_text('#v3dNote'), 'mention « lecture seule » affichée')
    # export GLB
    pg.click('#exportBtn')
    with pg.expect_download() as dl: pg.click('#glb')
    gp = OUT + 'm.glb'; dl.value.save_as(gp); raw = open(gp, 'rb').read()
    ok(raw[:4] == b'glTF' and int.from_bytes(raw[4:8], 'little') == 2 and int.from_bytes(raw[8:12], 'little') == len(raw), f'GLB valide (en-tête glTF v2, {len(raw)} octets)')
    jl = int.from_bytes(raw[12:16], 'little'); js = json.loads(raw[20:20 + jl]); ok(len(js.get('meshes', [])) > 8 and js['asset']['version'] == '2.0', f'GLB : {len(js.get("meshes", []))} maillages')
    # retour au plan
    pg.click('#mode2d'); pg.wait_for_timeout(200)
    ok(pg.is_visible('#cv') and pg.is_hidden('#cv3d'), 'retour au mode Plan')
    # sans Three.js : repli
    pg2 = ctx.new_page(); pg2.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
    pg2.goto((ROOT / 'index.html').as_uri()); pg2.wait_for_timeout(500); pg2.click('#authSkip')
    pg2.evaluate("Doc.mutate(d=>{d.objects.push({id:1,type:'line',a:[0,0],b:[1000,0],layer:1})})")
    pg2.click('#mode3d'); pg2.wait_for_timeout(300)
    ok(pg2.locator('dialog canvas.v3d').count() == 1 and pg2.get_attribute('#mode2d', 'aria-pressed') == 'true', 'hors ligne : repli sur l\'aperçu fil de fer, mode Plan conservé')
    print('erreurs page :', errs); ok(not errs, f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
