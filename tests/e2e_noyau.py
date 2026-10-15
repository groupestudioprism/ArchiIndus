"""Noyau géométrique OpenCascade et poste CAO d'ARCHIINDUS (Playwright, Chromium sans interface, WebGL logiciel).

Contrôle : chargement du noyau (copie publiée avec l'app), bossage / enlèvement / congé / chanfrein / coque / répétition / symétrie /
révolution, volumes exacts, équations (formules et variables), barre de retour arrière, réorganisation, sélection dans la vue 3D,
esquisse sur une face (double-clic), barre contextuelle, cube de vue, coupe, propriétés de masse (inertie), interférences, mise en plan,
exports STEP / STL, tuyauterie 3D depuis un réseau, barre de raccourcis (touche S).
Prérequis : python3 tools/build.py ; Three.js r160 local (THREE_DIR=…/node_modules/three).
Usage : python3 tests/e2e_noyau.py
"""
import math, pathlib, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from helpers import App, THREE

if not (THREE / 'build/three.module.js').exists():
    print('THREE_DIR introuvable : test non exécuté.'); sys.exit(2)
OUT = tempfile.mkdtemp(prefix='archiindus-noyau-') + '/'
print('Fichiers de sortie :', OUT)


def near(a, b, rel=1e-6):
    return a is not None and abs(a - b) <= rel * max(1, abs(b))


with App() as app:
    pg, ok = app.page, app.ok
    E = pg.evaluate
    E("""() => { Doc.mutate((d) => {
      d.sketches.push({id: 1, name: 'S1', plane: 'top', off: 0});
      d.objects.push({id: d.nextId++, type: 'poly', pts: [[0,0],[200,0],[200,100],[0,100]], closed: true, layer: 1, sk: 1});
      d.objects.push({id: d.nextId++, type: 'circle', c: [100, 50], r: 20, layer: 1, sk: 1});
      d.sketches.push({id: 2, name: 'S2', plane: 'top', off: 30});
      d.objects.push({id: d.nextId++, type: 'circle', c: [30, 12], r: 5, layer: 1, sk: 2});
      d.nextSk = 3; }); }""")
    st = app.wait_kernel()
    ok(st.startswith('ready'), f'noyau OpenCascade chargé ({st})')
    ok(st.endswith('app'), 'noyau servi par la copie publiée avec l\'app (kernel/vendor)')

    # ---------- bossage par le ruban (formule pilotée par une variable)
    E("Workbench.run('ftVars')"); pg.wait_for_selector('dialog[open]')
    pg.click('dialog >> text=+ Variable'); pg.fill('dialog .tbl.vars tbody tr:last-child input >> nth=0', 'E'); pg.fill('dialog .tbl.vars tbody tr:last-child input >> nth=1', '60/2')
    pg.wait_for_timeout(50)
    ok('30' in pg.inner_text('dialog .tbl.vars tbody'), 'équations : valeur calculée affichée (E = 60/2 = 30)')
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(100)
    ok(E("Doc.get().vars") == [{'n': 'E', 'e': '60/2', 'note': ''}], 'équations : variable enregistrée')
    E("Workbench.run('ftExtrude')"); pg.wait_for_selector('dialog[open]')
    pg.select_option('dialog select[aria-label="Esquisse"]', '1')
    pg.fill('dialog input[aria-label="Profondeur (mm)"]', '=E')
    ok('= 30' in pg.inner_text('dialog .fx-v'), 'champ formule : aperçu « = 30 mm »')
    pg.select_option('dialog select[aria-label="Matériau"]', 'S235')
    pg.click('dialog .dlg-f .btn.pri'); pg.wait_for_timeout(300)
    f1 = E("Doc.get().features[0]")
    ok(f1['type'] == 'extrude' and f1['d'] == 30 and f1.get('ex', {}).get('d') == 'E', f'bossage piloté par la formule =E ({f1})')
    r = app.rebuild()
    V0 = 200 * 100 * 30 - math.pi * 400 * 30
    ok(r and r['n'] == 1 and near(E("Kernel.result().bodies[0].props.volume"), V0), 'volume exact du bossage percé (rectangle − cercle)')
    # changer la variable : la profondeur suit
    E("Doc.mutate((d) => { d.vars[0].e = '40'; Model.applyExpr(d); })")
    ok(E("Doc.get().features[0].d") == 40, 'variable modifiée : la profondeur suit (40)')
    app.rebuild()
    ok(near(E("Kernel.result().bodies[0].props.volume"), V0 / 30 * 40), 'volume recalculé après changement de variable')
    E("Doc.mutate((d) => { d.vars[0].e = '30'; Model.applyExpr(d); })")

    # ---------- enlèvement traversant, répétition, congé, chanfrein
    E("""Doc.mutate((d) => {
      d.features.push({id: 2, type: 'cut', name: 'Perçage', sk: 2, d: 10, dir: '-', through: true, mat: '', layer: 1, hide: false});
      d.features.push({id: 3, type: 'pattern', name: 'Rép.', src: 2, kind: 'lin', ax: 'x', n: 4, step: 40, ang: 360, full: true, o: [0,0,0], mat: '', layer: 1, hide: false});
      d.features.push({id: 4, type: 'fillet', name: 'Congé', r: 5, sel: 'vert', target: 0, mat: '', layer: 1, hide: false});
      d.nextF = 5; })""")
    r = app.rebuild()
    V1 = V0 - 4 * math.pi * 25 * 30
    Vf = V1 - 4 * (25 - math.pi * 25 / 4) * 30
    vv = E("Kernel.result().bodies[0].props.volume")
    ok(r and not r['errors'] and near(vv, Vf, 1e-5), f'perçage traversant ×4 (répétition) + congés verticaux : volume exact ({r and r["errors"]} {vv} / {Vf})')
    E("Doc.mutate((d) => { d.features.push({id: 5, type: 'chamfer', name: 'Chanfrein', r: 50, sel: 'top', target: 0, mat: '', layer: 1, hide: false}); d.nextF = 6; })")
    r = app.rebuild()
    ok(r and any(e['fid'] == 5 and 'chanfrein impossible' in e['msg'] for e in r['errors']), 'chanfrein trop grand : erreur lisible sur la fonction')
    pg.click('#rt-model'); pg.wait_for_timeout(200)
    ok(pg.locator('#treeBody .tr-row.err', has_text='Chanfrein').count() == 1, 'arbre : fonction en erreur signalée')
    E("Doc.mutate((d) => { d.features.find((f) => f.id === 5).r = 1; })")
    r = app.rebuild(); ok(r and not r['errors'], 'chanfrein 1 mm accepté')
    vch = E("Kernel.result().bodies[0].props.volume")
    ok(vch < Vf and vch > Vf - 2000, f'chanfrein : volume légèrement réduit ({vch:.1f} < {Vf:.1f})')

    # ---------- barre de retour arrière et réorganisation
    E("Cad.setRollback(1)"); r = app.rebuild()
    ok(near(E("Kernel.result().bodies[0].props.volume"), V0), 'retour arrière après la 1re fonction : seul le bossage est calculé')
    ok(pg.locator('#treeBody .tr-row.dim').count() == 4, 'retour arrière : 4 fonctions grisées')
    E("Cad.setRollback(null)"); ok(E("Doc.get().rollback") is None, 'retour arrière remis en fin d\'arbre')
    E("Cad.moveFeature(5, 3)")
    ok([f['id'] for f in E("Doc.get().features")] == [1, 2, 3, 5, 4], 'réorganisation : chanfrein placé avant le congé')
    E("Cad.moveFeature(5, 5)")

    # ---------- coque sur un nouveau corps, symétrie, révolution
    E("""Doc.mutate((d) => {
      d.sketches.push({id: 3, name: 'S3', plane: 'top', off: 0});
      d.objects.push({id: d.nextId++, type: 'poly', pts: [[300,0],[360,0],[360,40],[300,40]], closed: true, layer: 1, sk: 3});
      d.features.push({id: 6, type: 'extrude', name: 'Boîte', sk: 3, d: 30, dir: '+', newBody: true, mat: 'S235', layer: 1, hide: false});
      d.features.push({id: 7, type: 'shell', name: 'Coque', t: 2, face: 'top', mat: '', layer: 1, hide: false});
      d.sketches.push({id: 4, name: 'S4', plane: 'front', off: 0});
      const ax = d.nextId++; d.objects.push({id: ax, type: 'line', a: [500, 0], b: [500, 50], layer: 1, sk: 4});
      d.objects.push({id: d.nextId++, type: 'poly', pts: [[510,0],[530,0],[530,50],[510,50]], closed: true, layer: 1, sk: 4});
      d.features.push({id: 8, type: 'revolve', name: 'Bague', sk: 4, ang: 360, axis: ax, op: 'add', newBody: true, mat: 'S235', layer: 1, hide: false});
      d.features.push({id: 9, type: 'mirror', name: 'Sym.', src: 8, plane: 'YZ', off: 650, mat: '', layer: 1, hide: false});
      d.nextSk = 5; d.nextF = 10; })""")
    r = app.rebuild()
    bs = E("Kernel.result().bodies.map((b) => ({n: b.name, v: b.props.volume}))")
    box = next((b for b in bs if b['n'] == 'Boîte'), None)
    vbox = 60 * 40 * 30 - 56 * 36 * 28
    ok(box and near(box['v'], vbox, 1e-6), f'coque 2 mm ouverte en dessus : volume exact ({box} / {vbox})')
    bag = next((b for b in bs if b['n'] == 'Bague'), None)
    ok(bag and near(bag['v'], 2 * math.pi * (30 ** 2 - 10 ** 2) * 50, 1e-6), f'révolution + symétrie : 2 bagues ({bag})')
    ok(len(bs) == 3 and not r['errors'], f'3 corps, aucune erreur ({r["errors"]})')

    # ---------- vue 3D : sélection, barre contextuelle, double-clic → esquisse sur face, cube de vue, coupe
    E("View3D.setMode(true)"); pg.wait_for_timeout(800)
    E("Scene3D.view('top')"); pg.wait_for_timeout(300)
    x, y = E("Scene3D.project([20, 80, 30])")
    pg.mouse.click(x, y); pg.wait_for_timeout(300)
    ts = E("state.treeSel")
    ok(ts and ts['t'] == 'f' and ts['id'] in (1, 2, 3, 4, 5), f'clic en 3D : fonction du corps sélectionnée dans l\'arbre ({ts})')
    ok(pg.is_visible('.ctxbar') and 'Modifier' in pg.inner_text('.ctxbar'), 'barre contextuelle près du curseur')
    info = E(f"Scene3D.pickAt({x}, {y})")
    ok(info and info.get('planar') and info['normal'][2] > 0.99, f'face pointée : plane, normale +Z ({info and info.get("normal")})')
    pg.mouse.dblclick(x, y); pg.wait_for_timeout(500)
    sk = E("Model.sketch(state.sketch)")
    ok(sk and sk['plane'] == 'custom' and near(sk['o'][2], 30, 1e-3), f'double-clic : esquisse sur la face du dessus (z = 30) {sk and sk.get("o")}')
    ok(E("state.faceRef && state.faceRef.segs.length") > 4, 'contour de la face rappelé dans l\'esquisse')
    # dessiner un rectangle dans l'esquisse sur face puis le bossage
    E("""() => { const s = state.sketch; Doc.mutate((d) => { d.objects.push({id: d.nextId++, type: 'poly', pts: [[150,10],[190,10],[190,40],[150,40]], closed: true, layer: 1, sk: s}); }); }""")
    skid = E("state.sketch")
    E(f"""Doc.mutate((d) => {{ d.features.push({{id: 10, type: 'extrude', name: 'Tenon', sk: {skid}, d: 10, dir: '+', mat: 'S235', layer: 1, hide: false}}); d.nextF = 11; }})""")
    E("Workbench.exitSketch()")
    r = app.rebuild()
    base = next(b for b in E("Kernel.result().bodies.map((b) => ({n: b.name, v: b.props.volume, z: b.props.bbox[5]}))") if b['n'] == 'Base' or b['n'] == 'Bossage extrudé 1')
    ok(near(base['z'], 40, 1e-3), f'tenon extrudé sur la face : hauteur du corps 40 mm ({base})')
    E("View3D.setMode(true)"); pg.wait_for_timeout(500)
    ok(pg.is_visible('.vcube .vc-f[data-view="top"]'), 'cube de vue affiché')
    pg.click('.vcube .vc-home'); pg.wait_for_timeout(300)
    c1 = E("Scene3D.stats().cam")
    pg.click('.vcube .vc-f[data-view="top"]', force=True); pg.wait_for_timeout(300)
    c2 = E("Scene3D.stats().cam")
    ok(c1 and c2 and c2[1] > c1[1] and abs(c2[0] - c1[0]) > 1e-6, f'cube de vue : clic sur « Dessus » après « ⌂ » (iso) : caméra au-dessus ({c1} → {c2})')
    E("Workbench.run('vSection')"); pg.wait_for_selector('dialog[open]')
    pg.select_option('dialog select[aria-label="Axe de coupe"]', 'z'); pg.fill('dialog input[aria-label="Position du plan de coupe"]', '0.3')
    pg.dispatch_event('dialog input[aria-label="Position du plan de coupe"]', 'input')
    ok(E("Scene3D.sectionState()") == {'axis': 'z', 't': 0.3}, 'coupe dynamique horizontale active')
    pg.click('dialog .dlg-f >> text=Retirer la coupe'); ok(E("Scene3D.sectionState()") is None, 'coupe retirée')
    pg.screenshot(path=OUT + 'vue3d.png')

    # ---------- propriétés de masse, interférences, mise en plan
    E("Workbench.run('aMass')"); pg.wait_for_function("document.querySelector('dialog[open] .tbl-wrap')", timeout=60000)
    mt = pg.inner_text('dialog[open]')
    ok('Matrice d\'inertie' in mt and 'Acier S235' in mt, 'propriétés de masse : masses par matériau et matrice d\'inertie')
    E("document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
    E("""Doc.mutate((d) => { d.sketches.push({id: 9, name: 'S9', plane: 'top', off: 0}); d.objects.push({id: d.nextId++, type: 'poly', pts: [[340,20],[400,20],[400,60],[340,60]], closed: true, layer: 1, sk: 9});
      d.features.push({id: 20, type: 'extrude', name: 'Bloc', sk: 9, d: 20, dir: '+', newBody: true, mat: 'S235', layer: 1, hide: false}); d.nextF = 21; d.nextSk = 10; })""")
    hits = E("(async () => (await Kernel.interferences(0)).hits.map((h) => [h.an, h.bn, Math.round(h.vol)]))()")
    ok(any({'Boîte', 'Bloc'} == {h[0], h[1]} and h[2] > 0 for h in hits), f'interférence détectée entre « Boîte » et « Bloc » ({hits})')
    E("Workbench.run('dDraw')"); pg.wait_for_function("document.querySelector('dialog[open] .mp-zone svg path')", timeout=60000)
    np_ = E("document.querySelectorAll('dialog[open] .mp-zone .v path').length")
    ok(np_ > 10 and 'FACE' in pg.inner_text('dialog[open] .mp-zone') and 'DESSUS' in pg.inner_text('dialog[open] .mp-zone'), f'mise en plan : vues projetées ({np_} chemins vus)')
    with pg.expect_download() as dl: pg.click('dialog >> text=Télécharger (SVG)')
    svg = open(dl.value.path(), encoding='utf-8').read()
    ok(svg.startswith('<svg') and 'class="h"' in svg, 'mise en plan : SVG téléchargé (arêtes vues et cachées)')
    E("document.querySelectorAll('dialog[open]').forEach((d) => d.close())")

    # ---------- exports STEP et STL
    with pg.expect_download(timeout=120000) as dl: E("Cad.exportCAD('step')")
    p = OUT + 'm.step'; dl.value.save_as(p); t = open(p, encoding='latin-1').read()
    ok(t.startswith('ISO-10303-21;') and 'MANIFOLD_SOLID_BREP' in t and 'END-ISO-10303-21;' in t, f'STEP : solides B-rep ({len(t)} octets)')
    with pg.expect_download(timeout=120000) as dl: E("Cad.exportCAD('stl')")
    b = open(dl.value.path(), 'rb').read()
    ntri = int.from_bytes(b[80:84], 'little') if len(b) > 84 else 0
    ok(len(b) == 84 + 50 * ntri and ntri > 100, f'STL binaire cohérent ({ntri} triangles)')

    # ---------- tuyauterie 3D depuis un réseau (coudes cintrés)
    oid = E("""(() => { let id = 0; Doc.mutate((d) => { id = d.nextId++; d.objects.push({id, type: 'poly', pts: [[0,1000],[2000,1000],[2000,3000]], closed: false, layer: 2, net: {dn: 100, mat: 'PEHD', tag: 'T1'}, props: {zi: 0, zf: 0}}); }); return id; })()""")
    E(f"Tools.selection.clear(); Tools.selection.add({oid}); Cad.pipesFromSelection()")
    pp = E("Doc.get().features.find((f) => f.type === 'pipe')")
    ok(pp and pp['r'] == 50 and pp['bend'] == 150 and pp['e'] == 4, f'tuyau créé : Ø100, paroi DN/25, cintrage 1,5 DN ({pp})')
    r = app.rebuild()
    pv = next((b['v'] for b in E("Kernel.result().bodies.map((b) => ({n: b.name, v: b.props.volume}))") if b['n'].startswith('Tuyau')), None)
    th = math.pi / 2; Lc = 2000 + 2000 - 2 * 150 + (150 * th - 0)  # longueur d'axe avec coude (rayon 150) : 2 droites raccourcies + arc
    Lc = (2000 - 150) * 2 + 150 * th
    vexp = math.pi * (50 ** 2 - 46 ** 2) * Lc
    ok(pv and near(pv, vexp, 2e-3), f'tuyau balayé avec coude cintré : volume ≈ section × longueur d\'axe ({pv} / {vexp:.0f})')

    # ---------- barre de raccourcis (S) et barre de l'arbre
    E("View3D.setMode(false)"); pg.mouse.move(600, 500)
    E("document.activeElement && document.activeElement.blur()"); pg.keyboard.press('s'); pg.wait_for_timeout(100)
    ok(pg.is_visible('.sbar') and 'Bossage' in pg.inner_text('.sbar'), 'touche S : barre de raccourcis sous le curseur')
    pg.keyboard.press('1'); pg.wait_for_timeout(100)
    ok(E("Tools.current()") == 'line' and not pg.is_visible('.sbar'), 'raccourci 1 : outil Ligne')
    pg.keyboard.press('Escape')
    sys.exit(app.report())
