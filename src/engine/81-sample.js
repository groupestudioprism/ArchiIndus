/* Projet d'exemple (accueil → « Exemple ») : petite station de pompage d'eaux usées, avec réseaux gravitaires et en charge,
   regards, pompes, vannes, local technique (assemblage) et une pièce 3D (socle de pompe usiné). Rien n'est enregistré dans le cloud
   tant que l'utilisateur ne le crée pas comme projet. Valeurs de démonstration, sans dimensionnement réel. */
const Sample = (() => {
  function project() {
    const d = Doc.fresh();
    d.name = 'Exemple · station de pompage';
    d.isSample = true;
    let id = 1;
    const add = (o) => { o.id = id++; d.objects.push(o); return o; };
    /* altitudes en m par rapport à la cote 0 du projet (terrain fini) ; calques : 3 Eaux usées, 2 Eau potable, 5 Électricité, 7 Structures, 8 Équipements, 9 Cotations */
    add({ type: 'poly', pts: [[0, 0], [18000, 0], [18000, 6000], [32000, 6000]], closed: false, layer: 3, net: { dn: 200, mat: 'PVC', tag: 'EU1' }, props: { zi: -1.20, zf: -1.65 } });
    add({ type: 'line', a: [32000, 6000], b: [40000, 6000], layer: 3, net: { dn: 250, mat: 'PVC', tag: 'EU2' }, props: { zi: -1.70, zf: -1.80 } });
    add({ type: 'poly', pts: [[44000, 6000], [52000, 6000], [52000, 20000], [70000, 20000]], closed: false, layer: 3, net: { dn: 110, mat: 'PEHD', tag: 'REF1' }, props: { zi: -2.20, zf: -0.90, pr: 3.5, q: 12 } });
    add({ type: 'poly', pts: [[-4000, 14000], [30000, 14000], [30000, 24000]], closed: false, layer: 2, net: { dn: 63, mat: 'PEHD', tag: 'AEP' }, props: { depth: 1.0, pr: 4 } });
    add({ type: 'line', a: [36000, 2000], b: [36000, -6000], layer: 5, net: { dn: 90, mat: 'Câble', tag: 'BT' }, props: { depth: 0.8 } });
    for (const [x, y, t] of [[0, 0, 'R1'], [18000, 0, 'R2'], [18000, 6000, 'R3'], [32000, 6000, 'R4']]) add({ type: 'sym', c: [x, y], k: 'regard', s: 1000, rot: 0, tag: t, layer: 8, props: { z: -2 } });
    add({ type: 'sym', c: [40500, 12500], k: 'pompe', s: 600, rot: 0, tag: 'P1', layer: 8 });
    add({ type: 'sym', c: [43500, 12500], k: 'pompe', s: 600, rot: 0, tag: 'P2', layer: 8 });
    add({ type: 'sym', c: [47000, 6000], k: 'vanne', s: 400, rot: 0, tag: 'V1', layer: 8 });
    add({ type: 'sym', c: [49000, 6000], k: 'clapet', s: 400, rot: 0, tag: 'C1', layer: 8 });
    add({ type: 'sym', c: [36000, 2000], k: 'armoire', s: 800, rot: 0, tag: 'AE', layer: 8 });
    add({ type: 'poly', pts: [[37500, 9500], [46500, 9500], [46500, 16000], [37500, 16000]], closed: true, layer: 7, st: { kind: 'mur', w: 200, prof: 'Parpaing', tag: 'Local' }, props: { h: 3200 } });
    add({ type: 'dim', a: [0, 0], b: [18000, 0], off: -1800, h: 300, layer: 9 });
    add({ type: 'text', p: [38000, 17000], text: 'Local technique', h: 400, layer: 9 });
    /* pièce 3D : socle de pompe (esquisse sur le plan de dessus, extrusion, perçages, congés) */
    d.sketches = [{ id: 1, name: 'Socle', plane: 'top', off: 0 }, { id: 2, name: 'Perçages', plane: 'top', off: 250 }];
    add({ type: 'poly', pts: [[60000, -6000], [61200, -6000], [61200, -5200], [60000, -5200]], closed: true, layer: 7, sk: 1 });
    for (const [x, y] of [[60120, -5880], [61080, -5880], [61080, -5320], [60120, -5320]]) add({ type: 'circle', c: [x, y], r: 11, layer: 7, sk: 2 });
    d.features = [
      { id: 1, type: 'extrude', name: 'Socle', sk: 1, d: 250, dir: '+', mat: 'C25', layer: 7, hide: false },
      { id: 2, type: 'cut', name: 'Perçages Ø22', sk: 2, d: 300, dir: '-', through: true, mat: '', layer: 7, hide: false },
      { id: 3, type: 'chamfer', name: 'Chanfrein', target: 0, r: 20, sel: 'top', mat: '', layer: 7, hide: false },
    ];
    d.comps = [
      { id: 1, name: 'Radier du local', part: { t: 'dalle', Lx: 9400, Ly: 6900, e: 250 }, pos: [42000, 12750, -250], rot: 0, mat: 'C25', layer: 7, fix: true, mate: { t: '', ref: 0, d: [0, 0, 0] } },
      { id: 2, name: 'Bâche de pompage', part: { t: 'cuve', D: 3000, H: 3500, e: 10 }, pos: [42000, 6000, -3500], rot: 0, mat: 'inox304', layer: 8, fix: true, mate: { t: '', ref: 0, d: [0, 0, 0] } },
    ];
    d.nextId = id; d.nextSk = 3; d.nextF = 4; d.nextC = 3;
    return d;
  }
  return { project };
})();
