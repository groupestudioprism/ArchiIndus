"""Outils métier et échanges d'ARCHIINDUS (Playwright, Chromium sans interface).

Contrôle : calcul hydraulique (Manning-Strickler, Darcy-Weisbach), conflits entre réseaux, profil en long, calcul de structure
filaire sur un bâtiment généré (équilibre des réactions), liste de débit, export IFC4 (relu par IfcOpenShell s'il est installé),
import DXF (accents Windows-1252, arcs, polylignes, unités), outils 2D (décaler, ajuster, prolonger, symétrie, rotation, échelle),
gestes de souris, zoom molette maîtrisé, pincement à deux doigts.
Usage : python3 tests/e2e_metiers.py
"""
import math, pathlib, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from helpers import App

OUT = tempfile.mkdtemp(prefix='archiindus-metiers-') + '/'
print('Fichiers de sortie :', OUT)


def near(a, b, rel=1e-3):
    return a is not None and abs(a - b) <= rel * max(1, abs(b))


with App(gl=False) as app:
    pg, ok = app.page, app.ok
    E = pg.evaluate

    # ---------- hydraulique
    E("""Doc.mutate((d) => {
      d.objects.push({id: d.nextId++, type: 'line', a: [0, 0], b: [50000, 0], layer: 3, net: {dn: 300, mat: 'PVC', tag: 'G1'}, props: {zi: -1.0, zf: -1.5, q: 30}});
      d.objects.push({id: d.nextId++, type: 'line', a: [0, 5000], b: [100000, 5000], layer: 2, net: {dn: 150, mat: 'PEHD', tag: 'C1'}, props: {zi: 0, zf: 10, pr: 4, q: 15}});
    })""")
    g = E("Networks.calc(Doc.get().objects[0])")
    D, I, K = 0.3, 0.01, 90
    Q = K * math.pi * D * D / 4 * (D / 4) ** (2 / 3) * math.sqrt(I)
    ok(near(g['Qps'], Q, 1e-6) and near(g['rate'], 0.03 / Q, 1e-6), f'gravitaire : débit capable Manning-Strickler ({g["Qps"] * 1000:.1f} L/s) et remplissage')
    c = E("Networks.calc(Doc.get().objects[1])")
    Dc, q = 0.15, 0.015; A = math.pi * Dc * Dc / 4; V = q / A; Re = V * Dc / 1.004e-6
    f = 0.25 / math.log10(0.1e-3 / (3.7 * Dc) + 5.74 / Re ** 0.9) ** 2; J = f / Dc * V * V / 19.62
    ok(near(c['V'], V, 1e-9) and near(c['J'], J, 1e-9) and near(c['hmt'], J * 100 + 10, 1e-9), f'en charge : Darcy-Weisbach / Swamee-Jain, HMT = pertes + dénivelé ({c["hmt"]:.2f} m)')
    E("Workbench.run('nHydro')"); pg.wait_for_selector('dialog[open]')
    ht = pg.inner_text('dialog[open]')
    ok('G1 · DN300 PVC' in ht and 'Réseaux en charge (1)' in ht, 'dialogue hydraulique : réseaux gravitaires et en charge')
    with pg.expect_download() as dl: pg.click('dialog >> text=Exporter CSV')
    ok('Q capable' in open(dl.value.path(), encoding='utf-8-sig').read(), 'hydraulique : export CSV')
    E("document.querySelectorAll('dialog[open]').forEach((x) => x.close())")

    # ---------- conflits : un réseau croise G1 à 150 mm au-dessus
    E("""Doc.mutate((d) => { d.objects.push({id: d.nextId++, type: 'line', a: [20000, -3000], b: [20000, 3000], layer: 5, net: {dn: 90, mat: 'Câble', tag: 'BT'}, props: {zi: -0.875, zf: -0.875}}); })""")
    cl = E("Networks.clashes(200).map((h) => [h.a.net.tag, h.b.net.tag, Math.round(h.gap)])")
    # axe G1 à x = 20 m : z = −1,2 m ; génératrice haute −1,05 ; câble Ø90 d'axe −0,875 : génératrice basse −0,92 → jeu 130 mm
    ok(cl == [['G1', 'BT', 130]], f'conflit détecté : câble à 130 mm au-dessus de G1 ({cl})')
    ok(E("Networks.clashes(100).length") == 0, 'aucun conflit sous le seuil de 100 mm')

    # ---------- profil en long
    pr = E("Networks.profileOf(Doc.get().objects[0])")
    ok(len(pr['pts']) == 2 and near(pr['pts'][1]['pk'], 50) and near(pr['pts'][1]['fe'], -1.5), 'profil en long : PK et fils d\'eau')
    E(f"Tools.selection.clear(); Tools.selection.add(Doc.get().objects[0].id); Workbench.run('nProfile')"); pg.wait_for_selector('dialog[open] .prof-svg')
    ok('1,00 %' in pg.inner_text('dialog[open]'), 'profil en long : pente affichée (1,00 %)')
    E("document.querySelectorAll('dialog[open]').forEach((x) => x.close())")

    # ---------- structure : bâtiment généré, calcul filaire, liste de débit
    E("Workbench.generateBuilding({L: 18, B: 12, H: 6, e: 6, pc: 'HEA 200', pt: 'IPE 300', ps: 'IPE 200', ds: 0, fm: 0, compo: ''})")
    r = E("(() => { const r = Frame.run({q: 3}); return r.error ? r : {n: r.members.length, nodes: r.nodes.length, sup: r.sup.length, Rz: r.Rz, W: r.Wtot, umax: r.umax, worst: Math.max(...r.members.map((m) => m.util))}; })()")
    ok('error' not in r and r['n'] == 14, f'structure : 8 poteaux, 4 traverses, 2 sablières ({r})')
    ok('error' not in r and near(r['Rz'], r['W'], 1e-6), f'équilibre vertical : réactions = charges ({r.get("Rz", 0) / 1000:.2f} kN)')
    ok('error' not in r and r['sup'] == 8 and 0 < r['worst'] < 2, 'appuis en pied de poteaux, taux de travail calculés')
    E("Workbench.run('sFrame')"); pg.wait_for_selector('dialog[open] .tbl')
    ok('Traverse' in pg.inner_text('dialog[open]') and E("state.frameUtil && state.frameUtil.size") == 14, 'dialogue de calcul : tableau des barres et taux pour la 3D')
    E("document.querySelectorAll('dialog[open]').forEach((x) => x.close())")
    rows = E("Frame.cutRows()")
    tot = sum(g['n'] for g in rows)
    ok(tot == 14 and any(g['prof'] == 'IPE 300' and g['L'] == 12000 and g['n'] == 4 for g in rows), f'liste de débit : 4 traverses IPE 300 de 12 m ({rows[:2]})')

    # ---------- IFC4
    with pg.expect_download() as dl: E("Interop.exportIFC()")
    p = OUT + 'm.ifc'; dl.value.save_as(p); t = open(p, encoding='ascii').read()
    ok(t.startswith('ISO-10303-21;') and "FILE_SCHEMA(('IFC4'));" in t and 'IFCPIPESEGMENT' in t and 'IFCCABLESEGMENT' in t and 'IFCCOLUMN' in t, 'IFC4 : tuyaux, câbles, poteaux')
    try:
        import ifcopenshell
        f = ifcopenshell.open(p)
        ok(len(f.by_type('IfcPipeSegment')) == 2 and len(f.by_type('IfcColumn')) == 8 and len(f.by_type('IfcBeam')) == 6, f'IFC relu par IfcOpenShell : {len(f.by_type("IfcPipeSegment"))} tuyaux, {len(f.by_type("IfcColumn"))} poteaux, {len(f.by_type("IfcBeam"))} poutres')
        try:
            import ifcopenshell.geom
            s = ifcopenshell.geom.settings()
            shp = ifcopenshell.geom.create_shape(s, f.by_type('IfcPipeSegment')[0])
            ok(len(shp.geometry.verts) > 0, 'IFC : géométrie du tuyau reconstruite par IfcOpenShell')
        except Exception as e:
            ok(False, f'IFC : géométrie illisible ({e})')
    except ImportError:
        print('IfcOpenShell absent : relecture IFC non faite')

    # ---------- import DXF (Windows-1252, mètres)
    dxf = '\r\n'.join(['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '9', '$DWGCODEPAGE', '3', 'ANSI_1252', '0', 'ENDSEC',
                       '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '0', 'LAYER', '2', 'Bâti', '62', '5', '0', 'ENDTAB', '0', 'ENDSEC',
                       '0', 'SECTION', '2', 'ENTITIES',
                       '0', 'LINE', '8', 'Bâti', '10', '0', '20', '0', '11', '10', '21', '0',
                       '0', 'LWPOLYLINE', '8', 'Bâti', '90', '4', '70', '1', '10', '0', '20', '0', '10', '5', '20', '0', '10', '5', '20', '5', '10', '0', '20', '5',
                       '0', 'ARC', '8', 'Bâti', '10', '0', '20', '0', '40', '2', '50', '0', '51', '90',
                       '0', 'CIRCLE', '8', '0', '10', '1', '20', '1', '40', '0.5',
                       '0', 'TEXT', '8', 'Bâti', '10', '1', '20', '2', '40', '0.25', '1', 'Réservoir élevé',
                       '0', 'ENDSEC', '0', 'EOF', ''])
    n0 = E("Doc.get().objects.length")
    E("(t) => Interop.importDXFText(t, 'essai.dxf')", dxf.encode('cp1252').decode('cp1252'))
    objs = E(f"Doc.get().objects.slice({n0})")
    ok(len(objs) == 5, f'DXF : 5 entités importées ({len(objs)})')
    ok(near(objs[0]['b'][0], 10000), 'DXF : unité mètre convertie en millimètres')
    ok(any(o['type'] == 'text' and o['text'] == 'Réservoir élevé' for o in objs), 'DXF : texte accentué conservé')
    arc = next(o for o in objs if o['type'] == 'poly' and not o['closed'])
    ok(near(arc['pts'][-1][1], 2000) and near(arc['pts'][0][0], 2000), 'DXF : arc converti en polyligne (quart de cercle R2 m)')
    ok('DXF Bâti' in [l['name'] for l in E("Doc.get().layers")], 'DXF : calque « DXF Bâti » créé')
    # export DXF : accents en Windows-1252
    E("Doc.mutate((d) => { d.objects.push({id: d.nextId++, type: 'text', p: [0, -2000], text: 'Électricité générale', h: 300, layer: 1}); })")
    with pg.expect_download() as dl: E("IO.exportDXF()")
    raw = open(dl.value.path(), 'rb').read()
    ok('Électricité générale'.encode('cp1252') in raw and b'ANSI_1252' in raw, 'export DXF : accents conservés (Windows-1252)')

    # ---------- outils 2D
    E("View3D.setMode(false)"); E("Doc.mutate((d) => { d.objects = []; })"); E("Canvas2D.zoomExtents(); state.view.scale = 0.1; state.view.x = 300; state.view.y = 420; Canvas2D.requestDraw()")
    box = pg.locator('#cv').bounding_box()
    def W(x, y):
        v = E('({x:state.view.x,y:state.view.y,s:state.view.scale})')
        return (box['x'] + v['x'] + x * v['s'], box['y'] + v['y'] - y * v['s'])
    def click(x, y, **k): X, Y = W(x, y); pg.mouse.move(X, Y); pg.mouse.click(X, Y, **k)
    def key(k): E('document.activeElement && document.activeElement.blur()'); pg.keyboard.press(k)
    E("Doc.mutate((d) => { d.objects.push({id: 1, type: 'line', a: [0, 0], b: [4000, 0], layer: 1}, {id: 2, type: 'line', a: [2000, -1000], b: [2000, 1000], layer: 1}, {id: 3, type: 'line', a: [3000, 2000], b: [3000, 1500], layer: 1}); d.nextId = 4; })")
    key('o'); E("Tools.typed('600')"); click(1000, 0); click(1000, 300)
    o = E("Doc.get().objects.find((x) => x.id === 4)")
    ok(o and o['a'] == [0, 600] and o['b'] == [4000, 600], f'décaler : copie à 600 mm du côté cliqué ({o})')
    key('a'); click(3000, 0)
    ls = sorted([x['a'] + x['b'] for x in E("Doc.get().objects.filter((x) => x.type === 'line' && x.a[1] === 0 && x.b[1] === 0)")])
    ok(ls == [[0, 0, 2000, 0]], f'ajuster : morceau droit de la ligne retiré à l\'intersection ({ls})')
    key('x'); click(3000, 1550)
    l3 = E("Doc.get().objects.find((x) => x.id === 3)")
    ok(l3 and near(l3['b'][1], 600), f'prolonger : ligne prolongée jusqu\'à la ligne décalée ({l3})')
    E("Tools.selection.clear(); Tools.selection.add(3)"); key('i'); click(0, 0); click(0, 1000)
    m = E("Doc.get().objects[Doc.get().objects.length - 1]")
    ok(m['a'] == [-3000, 2000], f'symétrie : copie miroir par rapport à l\'axe x = 0 ({m})')
    E(f"Tools.selection.clear(); Tools.selection.add({m['id']})"); key('q'); click(0, 0); E("Tools.typed('90')")
    m2 = E(f"Doc.get().objects.find((x) => x.id === {m['id']})")
    ok(near(m2['a'][0], -2000) and near(m2['a'][1], -3000), f'rotation de 90° saisie au clavier ({m2})')
    key('u'); click(0, 0); E("Tools.typed('0,5')")
    m3 = E(f"Doc.get().objects.find((x) => x.id === {m['id']})")
    ok(near(m3['a'][0], -1000) and near(m3['a'][1], -1500), f'échelle 0,5 saisie au clavier ({m3})')
    key('Escape'); key('Escape')

    # ---------- gestes (clic droit glissé) et zoom molette
    X, Y = W(1000, 1000)
    pg.mouse.move(X, Y); pg.mouse.down(button='right'); pg.mouse.move(X - 80, Y, steps=6); pg.mouse.up(button='right')
    ok(E("Tools.current()") == 'line', 'geste vers la gauche : outil Ligne')
    pg.mouse.move(X, Y); pg.mouse.down(button='right'); pg.mouse.move(X, Y + 80, steps=6); pg.mouse.up(button='right')
    ok(E("Tools.current()") == 'select', 'geste vers le bas : Sélection')
    s0 = E("state.view.scale"); pg.mouse.move(X, Y); pg.mouse.wheel(0, -100); pg.wait_for_timeout(100)
    ok(near(E("state.view.scale") / s0, 1 / 0.96, 1e-6), 'molette : un cran = 4 % de zoom')
    pg.mouse.wheel(0, -1000); pg.wait_for_timeout(100)
    ok(E("state.view.scale") / s0 < 1.12, 'molette : grand écart plafonné à 1,5 cran')
    # pincement à deux doigts (événements tactiles simulés)
    s1 = E("state.view.scale")
    E("""([x, y]) => { const cv = document.getElementById('cv'); const ev = (t, id, px) => cv.dispatchEvent(new PointerEvent(t, {pointerId: id, pointerType: 'touch', clientX: px, clientY: y, bubbles: true, button: 0, buttons: t === 'pointerup' ? 0 : 1}));
      ev('pointerdown', 11, x - 50); ev('pointerdown', 12, x + 50); ev('pointermove', 11, x - 100); ev('pointermove', 12, x + 100); ev('pointerup', 11, x - 100); ev('pointerup', 12, x + 100); }""", [X, Y])
    ok(near(E("state.view.scale") / s1, 2, 1e-6), 'pincement à deux doigts : zoom ×2')
    sys.exit(app.report())
