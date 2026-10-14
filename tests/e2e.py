"""Test de bout en bout d'ArchiIndus dans Chromium sans interface (Playwright pour Python).

Prérequis : python3 tools/build.py (génère index.html), puis `pip install playwright` et `playwright install chromium`.
Usage     : python3 tests/e2e.py
Les requêtes réseau externes (polices Google) sont bloquées volontairement : le test ne dépend que du fichier local.
Le contrôle DXF vérifie seulement la STRUCTURE du fichier (paires code / valeur, sections, entités, ASCII) :
il ne remplace pas une ouverture dans un logiciel de CAO.
"""
import json, re, sys, xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright
import pathlib, tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=tempfile.mkdtemp(prefix='archiindus-e2e-')+'/'
print('Fichiers de sortie :',OUT)
fails=[]; checks=0
def ok(cond,msg):
    global checks; checks+=1
    if not cond: fails.append(msg); print('ÉCHEC :',msg)
def near(a,b,t=1e-3): return abs(a-b)<=t
def pteq(p,q,t=1e-3): return near(p[0],q[0],t) and near(p[1],q[1],t)

def fmenu(sel): pg.click('#fileBtn'); pg.click(sel)

with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':760}, accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append('pageerror:'+str(e)))
    pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    pg.route('**/*',lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
    pg.goto((ROOT/'index.html').as_uri()); pg.wait_for_timeout(300); pg.click('#authSkip')
    box=pg.locator('#cv').bounding_box()
    def W(x,y):
        v=pg.evaluate('({x:state.view.x,y:state.view.y,s:state.view.scale})')
        return (box['x']+v['x']+x*v['s'], box['y']+v['y']-y*v['s'])
    def click(x,y,**k): X,Y=W(x,y); pg.mouse.move(X,Y); pg.mouse.click(X,Y,**k)
    objs=lambda: pg.evaluate('Doc.get().objects')
    n=lambda: len(objs())

    ok(n()==0,'document vide au départ')
    # --- ligne
    pg.keyboard.press('l'); click(1000,1000); click(3000,1000); pg.mouse.click(*W(5000,3000),button='right')
    o=objs(); ok(len(o)==1 and o[0]['type']=='line' and pteq(o[0]['a'],[1000,1000]) and pteq(o[0]['b'],[3000,1000]),f'ligne par clics {o}')
    # --- saisie 1500<90
    pg.keyboard.press('l'); click(1000,2000); pg.keyboard.type('1500<90'); pg.keyboard.press('Enter')
    o=objs(); ok(n()==2 and pteq(o[1]['a'],[1000,2000]) and pteq(o[1]['b'],[1000,3500]),f'saisie longueur<angle {o[-1] if o else None}')
    pg.keyboard.press('Escape')
    # --- rectangle, cercle, cote, texte
    pg.keyboard.press('r'); click(4000,1000); click(5000,1800)
    o=objs(); ok(n()==3 and o[2]['type']=='poly' and o[2]['closed'] and len(o[2]['pts'])==4,'rectangle')
    pg.keyboard.press('c'); click(7000,1500); click(7500,1500)
    o=objs(); ok(n()==4 and o[3]['type']=='circle' and near(o[3]['r'],500),'cercle r=500')
    pg.keyboard.press('d'); click(1000,1000); click(3000,1000); click(2000,500)
    o=objs(); ok(n()==5 and o[4]['type']=='dim' and near(o[4]['off'],-500),f'cote {o[-1]}')
    pg.keyboard.press('t'); click(4000,2500); pg.keyboard.type('Pompe P1'); pg.keyboard.press('Enter')
    o=objs(); ok(n()==6 and o[5]['type']=='text' and o[5]['text']=='Pompe P1','texte')
    # --- accroches hors grille : extrémité et milieu
    pg.keyboard.press('l'); click(1000,4000); pg.keyboard.type('1234<0'); pg.keyboard.press('Enter'); pg.keyboard.press('Escape')
    ok(n()==7 and pteq(objs()[6]['b'],[2234,4000]),'ligne hors grille 1234<0')
    # vérif directe des accroches
    r=pg.evaluate("(()=>{const s=Snap.find([2234+20,4000+15],null);return s})()")
    ok(r['kind']=='end' and pteq(r['p'],[2234,4000]),f'accroche extrémité {r}')
    r=pg.evaluate("Snap.find([1617+20,4000+15],null)"); ok(r['kind']=='mid' and pteq(r['p'],[1617,4000]),f'accroche milieu {r}')
    r=pg.evaluate("Snap.find([7000+20,1500+10],null)"); ok(r['kind']=='center' and pteq(r['p'],[7000,1500]),f'accroche centre {r}')
    ok(pg.evaluate("G.segInter([0,0],[10,10],[0,10],[10,0])")==[5,5],'intersection de segments')
    r=pg.evaluate("(()=>{state.snap.ortho=true;const s=Snap.find([5000,1030],[1000,1000]);state.snap.ortho=false;return s})()"); ok(r['kind']=='ortho' and near(r['p'][1],1000),f'ortho {r}')
    # --- sélection / suppression / annuler
    pg.keyboard.press('v'); click(2000,1000)  # sur la ligne 1 (aussi sur la cote ? non, cote à y=500)
    sel=pg.evaluate('[...Tools.selection]'); ok(len(sel)==1,f'sélection par clic {sel}')
    ok('Ligne' in pg.inner_text('#props'),'panneau propriétés affiche Ligne')
    ok('2000' in pg.inner_text('#props'),'longueur 2000 mm affichée')
    pg.keyboard.press('Delete'); ok(n()==6,'suppression'); pg.keyboard.press('Control+z'); ok(n()==7,'annuler suppression'); pg.keyboard.press('Control+y'); ok(n()==6,'rétablir')
    pg.keyboard.press('Control+z'); ok(n()==7,'annuler à nouveau')
    # fenêtre de sélection (gauche→droite) autour du rectangle uniquement
    pg.keyboard.press('Escape')
    X0,Y0=W(3800,900); X1,Y1=W(5200,1900); pg.mouse.move(X0,Y0); pg.mouse.down(); pg.mouse.move(X1,Y1,steps=6); pg.mouse.up()
    sel=pg.evaluate('Doc.get().objects.filter(o=>Tools.selection.has(o.id)).map(o=>o.type)'); ok(sel==['poly'],f'fenêtre -> rectangle seul {sel}')
    # --- déplacer / copier le cercle
    pg.keyboard.press('Escape'); click(7500,1500)  # sur le cercle
    ok(pg.evaluate('Tools.selection.size')==1,'cercle sélectionné')
    pg.keyboard.press('m'); click(7000,1500); click(7000,2500)
    c=[o for o in objs() if o['type']=='circle'][0]; ok(pteq(c['c'],[7000,2500]),f'déplacer {c}')
    pg.keyboard.press('k'); click(7000,2500); click(8000,2500)
    cs=[o for o in objs() if o['type']=='circle']; ok(len(cs)==2 and pteq(cs[1]['c'],[8000,2500]),f'copier {cs}')
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    # --- calques
    nl=pg.evaluate('Doc.get().layers.length')
    pg.click('#addLayer'); ok(pg.evaluate('Doc.get().layers.length')==nl+1,'ajout de calque')
    act=pg.evaluate('Doc.get().active'); ok(act==pg.evaluate('Doc.get().layers.at(-1).id'),'nouveau calque actif')
    before=n(); pg.evaluate('Doc.mutate(d=>{d.layers.at(-1).locked=true})')
    pg.keyboard.press('l'); click(7000,4000); click(8000,4000); ok(n()==before,'dessin refusé sur calque verrouillé'); 
    ok('verrouillé' in pg.inner_text('#msg') or 'masqué' in pg.inner_text('#msg'),'message calque verrouillé')
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    pg.evaluate('Doc.mutate(d=>{d.layers.at(-1).locked=false;d.active=2})')
    pg.keyboard.press('l'); click(7000,4000); click(8000,4000); pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    ok(n()==before+1 and objs()[-1]['layer']==2,'dessin sur calque Eau potable (id 2)')
    # masquer un calque : objets non rendus mais conservés
    pg.evaluate('Doc.mutate(d=>{d.layers.find(l=>l.id===2).visible=false})'); ok(n()==before+1,'masquer ne supprime rien'); pg.evaluate('Doc.mutate(d=>{d.layers.find(l=>l.id===2).visible=true})')
    # --- thème + tout voir
    pg.keyboard.press('z'); pg.click('#theme'); pg.wait_for_timeout(150); pg.screenshot(path=OUT+'e2e_dark.png'); pg.click('#theme'); pg.wait_for_timeout(150); pg.screenshot(path=OUT+'e2e_light.png')
    total=n()
    # --- enregistrement local + rechargement
    pg.wait_for_timeout(800); ok(pg.inner_text('#saved').startswith('enregistré'),f"état d'enregistrement {pg.inner_text('#saved')}")
    pg.reload(); pg.wait_for_timeout(400); pg.click('#authSkip'); ok(n()==total,f'restauration après rechargement {n()} / {total}')
    # --- export / import JSON
    with pg.expect_download() as d: fmenu('#save')
    path=OUT+'sortie.archiindus.json'; d.value.save_as(path)
    saved=json.load(open(path)); ok(saved['schemaVersion']==1 and len(saved['objects'])==total,'JSON exporté cohérent')
    pg.keyboard.press('Escape'); fmenu('#new'); ok(n()==0,'nouveau projet vide'); pg.keyboard.press('Control+z'); ok(n()==total,'annuler « nouveau » restaure le projet')
    fmenu('#new'); pg.set_input_files('#file',path); pg.wait_for_timeout(300); ok(n()==total,f'import JSON {n()}')
    # import invalide
    bad=OUT+'mauvais.json'; open(bad,'w').write(json.dumps({'schemaVersion':1,'layers':[{'id':1,'name':'x'}],'objects':[{'type':'line','a':[0,0],'b':['a',1]}]}))
    pg.set_input_files('#file',bad); pg.wait_for_timeout(300); ok(n()==total and 'Ouverture impossible' in pg.inner_text('#msg'),f"import invalide refusé : {pg.inner_text('#msg')[:80]}")
    open(bad,'w').write('pas du json'); pg.set_input_files('#file',bad); pg.wait_for_timeout(300); ok('JSON' in pg.inner_text('#msg'),'JSON illisible refusé')
    # --- SVG
    with pg.expect_download() as d: pg.click('#exportBtn'); pg.click('#svg')
    sp=OUT+'sortie.svg'; d.value.save_as(sp)
    try:
        root=ET.parse(sp).getroot(); ns='{http://www.w3.org/2000/svg}'
        cnt={t:len(root.findall('.//'+ns+t)) for t in ['line','polygon','polyline','circle','text','g']}
        ok(root.tag==ns+'svg' and cnt['circle']==2 and cnt['polygon']==1 and cnt['text']>=2 and cnt['line']>=3,f'SVG bien formé {cnt}')
    except Exception as e: ok(False,f'SVG mal formé : {e}')
    # --- DXF (contrôle de structure uniquement)
    with pg.expect_download() as d: pg.click('#exportBtn'); pg.click('#dxf')
    dp=OUT+'sortie.dxf'; d.value.save_as(dp)
    L=open(dp,encoding='ascii',newline='').read().split('\r\n'); L=L[:-1] if L and L[-1]=='' else L
    ok(len(L)%2==0,'DXF : nombre de lignes pair (paires code/valeur)')
    pairs=list(zip(L[0::2],L[1::2])); codes_ok=all(re.fullmatch(r'\s*-?\d+',c) for c,_ in pairs); ok(codes_ok,'DXF : tous les codes de groupe sont numériques')
    ok(pairs[-1]==('0','EOF'),'DXF : se termine par EOF')
    secs=[v for c,v in pairs if c=='0' and v in('SECTION','ENDSEC')]; ok(secs.count('SECTION')==secs.count('ENDSEC')==3,f'DXF : 3 sections équilibrées {secs}')
    ents=[v for c,v in pairs if c=='0']; from collections import Counter; ce=Counter(ents); print('DXF entités :',dict(ce))
    ok(ce['CIRCLE']==2 and ce['POLYLINE']==1 and ce['SEQEND']==1 and ce['VERTEX']==4 and ce['TEXT']>=2 and ce['LINE']>=8,f'DXF : entités attendues {dict(ce)}')
    ok(all(ord(ch)<128 for ch in ''.join(L)),'DXF : ASCII pur')
    names=[v for (c,v),(c0,v0) in zip(pairs[1:],pairs) if c0=='0' and v0=='LAYER' and c=='2']; ok(len(names)==len(set(names))==nl+1,f'DXF : noms de calque uniques {names}')
    print('erreurs page :',errs); ok(not errs,f'aucune erreur JS {errs}')
    b.close()
print(f'\n{checks} contrôles, {len(fails)} échec(s)')
for f in fails: print(' -',f)
