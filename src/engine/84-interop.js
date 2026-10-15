/* ============ Échanges : export IFC4 (réseaux, équipements, structures, corps 3D) et import DXF ============
   IFC4 (ISO 16739), fichier STEP texte, unités en millimètres, axe Z vers le haut :
     réseaux        → IfcPipeSegment (fluides) ou IfcCableSegment (câbles, réseaux secs), un élément par tronçon, profil circulaire extrudé
     équipements    → IfcFlowTerminal / IfcBuildingElementProxy (volume de principe)
     murs           → IfcWall (bande extrudée) ; poutres et profilés → IfcBeam / IfcColumn (profil en I : IfcIShapeProfileDef)
     corps 3D       → IfcBuildingElementProxy en IfcTriangulatedFaceSet (maillage du noyau OpenCascade)
   Les matériaux sont associés par IfcRelAssociatesMaterial ; les propriétés techniques (DN, débit, pression…) dans un jeu Pset_ArchiIndus.
   Import DXF (ASCII, R12 à 2018) : LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC (polyligne), TEXT, MTEXT ; calques recréés. */
const Interop = (() => {
  /* ---------- IFC ---------- */
  function ifcWriter() {
    const lines = []; let n = 0;
    const add = (s) => { n++; lines.push(`#${n}=${s};`); return `#${n}`; };
    return { add, lines };
  }
  const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7E]/g, (c) => { const h = c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'); return `\\X2\\${h}\\X0\\`; })}'`;
  const real = (v) => { const s = (+v).toFixed(4).replace(/\.?0+$/, ''); return s.includes('.') ? s : s + '.'; };
  const pt3 = (p) => `(${real(p[0])},${real(p[1])},${real(p[2] || 0)})`;
  /* identifiant global IFC (22 caractères, base 64 propre à l'IFC) */
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const guid = () => { const b = crypto.getRandomValues(new Uint8Array(16)); let s = B64[b[0] >> 6]; for (let i = 0; i < 21; i++) s += B64[(b[1 + (i % 15)] + i * 7) & 63]; return s.slice(0, 22); };

  function exportIFC() {
    const d = Doc.get(), W = ifcWriter(), A = W.add;
    const now = new Date(), ts = Math.floor(now.getTime() / 1000);
    const person = A(`IFCPERSON($,$,'Studio Prism',$,$,$,$,$)`), org = A(`IFCORGANIZATION($,'Studio Prism',$,$,$)`), po = A(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
    const app = A(`IFCAPPLICATION(${org},'2','ARCHIINDUS','ARCHIINDUS')`), own = A(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,${ts},${po},${app},${ts})`);
    const origin = A('IFCCARTESIANPOINT((0.,0.,0.))'), dz = A('IFCDIRECTION((0.,0.,1.))'), dx = A('IFCDIRECTION((1.,0.,0.))');
    const wcs = A(`IFCAXIS2PLACEMENT3D(${origin},${dz},${dx})`);
    const ctx = A(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
    const body = A(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
    const mm = A('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), m2 = A('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), m3 = A('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), rad = A('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
    const units = A(`IFCUNITASSIGNMENT((${mm},${m2},${m3},${rad}))`);
    const proj = A(`IFCPROJECT('${guid()}',${own},${str(d.name)},$,$,$,$,(${ctx}),${units})`);
    const lp0 = A(`IFCLOCALPLACEMENT($,${wcs})`);
    const site = A(`IFCSITE('${guid()}',${own},${str(d.site ? d.site.label : 'Site')},$,$,${lp0},$,$,.ELEMENT.,$,$,$,$,$)`);
    const lp1 = A(`IFCLOCALPLACEMENT(${lp0},${wcs})`);
    const bld = A(`IFCBUILDING('${guid()}',${own},${str(d.name)},$,$,${lp1},$,$,.ELEMENT.,$,$,$)`);
    const lp2 = A(`IFCLOCALPLACEMENT(${lp1},${wcs})`);
    const st = A(`IFCBUILDINGSTOREY('${guid()}',${own},'Niveau 0',$,$,${lp2},$,$,.ELEMENT.,0.)`);
    A(`IFCRELAGGREGATES('${guid()}',${own},$,$,${proj},(${site}))`);
    A(`IFCRELAGGREGATES('${guid()}',${own},$,$,${site},(${bld}))`);
    A(`IFCRELAGGREGATES('${guid()}',${own},$,$,${bld},(${st}))`);
    const elems = [], matRel = new Map();
    const matOfId = new Map();
    const ifcMat = (id) => { if (!id) return null; if (!matOfId.has(id)) { const m = matOf(id); matOfId.set(id, A(`IFCMATERIAL(${str(m ? m.nom : id)},$,$)`)); } return matOfId.get(id); };
    /* placement local : point + axe Z (direction d'extrusion) + axe X ; renvoie une IfcLocalPlacement */
    const lplace = (p, zdir, xdir) => {
      const o = A(`IFCCARTESIANPOINT(${pt3(p)})`), z = A(`IFCDIRECTION(${pt3(zdir)})`), x = A(`IFCDIRECTION(${pt3(xdir)})`);
      const ax = A(`IFCAXIS2PLACEMENT3D(${o},${z},${x})`);
      return A(`IFCLOCALPLACEMENT(${lp2},${ax})`);
    };
    const shape = (item, kind = 'SweptSolid') => A(`IFCPRODUCTDEFINITIONSHAPE($,$,(${A(`IFCSHAPEREPRESENTATION(${body},'Body','${kind}',(${item}))`)}))`);
    const extrude = (profile, depth) => A(`IFCEXTRUDEDAREASOLID(${profile},${A(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)},${dz},${real(depth)})`);
    const perp = (v) => { const r = Math.abs(v[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; const c = [v[1] * r[2] - v[2] * r[1], v[2] * r[0] - v[0] * r[2], v[0] * r[1] - v[1] * r[0]]; const l = Math.hypot(...c); return c.map((x) => x / l); };
    const pset = (el, props) => {
      const ps = Object.entries(props).filter(([, v]) => v != null && v !== '').map(([k, v]) => A(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${typeof v === 'number' ? `IFCREAL(${real(v)})` : `IFCLABEL(${str(v)})`},$)`));
      if (!ps.length) return;
      const set = A(`IFCPROPERTYSET('${guid()}',${own},'Pset_ArchiIndus',$,(${ps.join(',')}))`);
      A(`IFCRELDEFINESBYPROPERTIES('${guid()}',${own},$,$,(${el}),${set})`);
    };
    const reg = (el, matId) => { elems.push(el); const m = ifcMat(matId); if (m) { if (!matRel.has(m)) matRel.set(m, []); matRel.get(m).push(el); } };
    let count = { pipe: 0, cable: 0, equip: 0, wall: 0, beam: 0, column: 0, body: 0 };

    /* réseaux : un segment extrudé par tronçon */
    for (const o of d.objects) {
      const l = Doc.layer(o.layer); if (!l || !l.visible || o.sk) continue;
      if (o.net && (o.type === 'line' || o.type === 'poly')) {
        const path = Model.netPath(o), cable = /câble/i.test(o.net.mat) || ['sec'].includes(l.group);
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i], v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...v); if (L < 1) continue;
          const u = v.map((x) => x / L), prof = A(`IFCCIRCLEPROFILEDEF(.AREA.,$,${A(`IFCAXIS2PLACEMENT2D(${A('IFCCARTESIANPOINT((0.,0.))')},$)`)},${real(o.net.dn / 2)})`);
          const name = `${o.net.tag || 'Réseau'} DN${o.net.dn}${path.length > 2 ? ` (${i})` : ''}`;
          const e = A(`${cable ? 'IFCCABLESEGMENT' : 'IFCPIPESEGMENT'}('${guid()}',${own},${str(name)},${str(l.name)},$,${lplace(a, u, perp(u))},${shape(extrude(prof, L))},$,${cable ? '.CABLESEGMENT.' : '.RIGIDSEGMENT.'})`);
          reg(e, o.mat || objMatId(o)); pset(e, { DN: o.net.dn, Materiau: o.net.mat, Repere: o.net.tag, Debit_Ls: o.props && o.props.q, Pression_bar: o.props && o.props.pr, Pente_pourcent: Props.slope(o) });
          count[cable ? 'cable' : 'pipe']++;
        }
      } else if (o.st && (o.type === 'line' || o.type === 'poly')) {
        const pr = o.props || {}, beam = o.st.kind === 'poutre', P = beam ? Sections.find(o.st.prof) : null;
        if (beam) {
          const z = (typeof pr.z === 'number' ? pr.z : 3) * 1000 - (P ? P.h / 2 : 100);
          for (const [a, b] of Geo.segments(o)) {
            const L = G.dist(a, b); if (L < 1) continue; const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, 0];
            const prof = P ? A(`IFCISHAPEPROFILEDEF(.AREA.,${str(P.id)},$,${real(P.b)},${real(P.h)},${real(P.tw)},${real(P.tf)},${real(P.r || 0)},$,$)`) : A(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${real(o.st.w)},${real(200)})`);
            const e = A(`IFCBEAM('${guid()}',${own},${str(`${o.st.tag || 'Poutre'} ${o.st.prof || ''}`.trim())},$,$,${lplace([a[0], a[1], z], u, [-u[1], u[0], 0])},${shape(extrude(prof, L))},$,.BEAM.)`);
            reg(e, objMatId(o)); count.beam++;
          }
        } else {
          const h = pr.h || 3000, z0 = (typeof pr.z === 'number' ? pr.z : 0) * 1000;
          for (const bnd of Sym.band(o.type === 'line' ? [o.a, o.b] : o.pts, o.type === 'poly' && o.closed, o.st.w)) {
            const pts = bnd.pts.map((p) => A(`IFCCARTESIANPOINT((${real(p[0])},${real(p[1])}))`));
            const poly = A(`IFCPOLYLINE((${[...pts, pts[0]].join(',')}))`), prof = A(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`);
            const e = A(`IFCWALL('${guid()}',${own},${str(o.st.tag || 'Mur')},$,$,${lplace([0, 0, z0], [0, 0, 1], [1, 0, 0])},${shape(extrude(prof, h))},$,.STANDARD.)`);
            reg(e, objMatId(o)); count.wall++;
          }
        }
      } else if (o.type === 'sym') {
        const s = SYMBOLS[o.k] || {}, pr = o.props || {}, z0 = (typeof pr.z === 'number' ? pr.z : 0) * 1000, h = Math.max(50, (o.k === 'poteau' || o.k === 'poteauRond' ? 3000 : o.s * 0.6));
        const prof = /rond|cuve|ballon|regard/i.test(o.k) ? A(`IFCCIRCLEPROFILEDEF(.AREA.,$,${A(`IFCAXIS2PLACEMENT2D(${A('IFCCARTESIANPOINT((0.,0.))')},$)`)},${real(o.s / 2)})`) : A(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${A(`IFCAXIS2PLACEMENT2D(${A('IFCCARTESIANPOINT((0.,0.))')},$)`)},${real(o.s)},${real(o.s)})`);
        const th = o.rot * Math.PI / 180, plc = lplace([o.c[0], o.c[1], z0], [0, 0, 1], [Math.cos(th), Math.sin(th), 0]);
        const col = s.group === 'struct';
        const e = col ? A(`IFCCOLUMN('${guid()}',${own},${str(`${s.label || o.k} ${o.tag || ''}`.trim())},$,$,${plc},${shape(extrude(prof, h))},$,.COLUMN.)`)
          : A(`IFCFLOWTERMINAL('${guid()}',${own},${str(`${s.label || o.k} ${o.tag || ''}`.trim())},${str(s.label || o.k)},$,${plc},${shape(extrude(prof, h))},$)`);
        reg(e, objMatId(o)); pset(e, { Repere: o.tag, Debit_Ls: pr.q, Pression_bar: pr.pr, Temperature_C: pr.t }); count[col ? 'column' : 'equip']++;
      }
    }
    /* composants profilés de l'assemblage */
    if (d.comps && d.comps.length) {
      const R = Model.resolve(d.comps);
      for (const c of d.comps) {
        const l = Doc.layer(c.layer); if (l && !l.visible) continue;
        if (c.part.t !== 'profil') continue;
        const P = PROFILES[c.part.prof]; if (!P) continue;
        const pos = R.pos.get(c.id), th = c.rot * Math.PI / 180, rz = (v) => [v[0] * Math.cos(th) - v[1] * Math.sin(th), v[0] * Math.sin(th) + v[1] * Math.cos(th), v[2]];
        const dir = c.part.orient === 'v' ? [0, 0, 1] : rz(c.part.orient === 'x' ? [1, 0, 0] : [0, 1, 0]);
        const x = c.part.orient === 'v' ? rz([1, 0, 0]) : [-dir[1], dir[0], 0];
        const prof = A(`IFCISHAPEPROFILEDEF(.AREA.,${str(P.id)},$,${real(P.b)},${real(P.h)},${real(P.tw)},${real(P.tf)},${real(P.r || 0)},$,$)`);
        const vert = c.part.orient === 'v';
        const e = A(`${vert ? 'IFCCOLUMN' : 'IFCBEAM'}('${guid()}',${own},${str(c.name)},${str(P.id)},$,${lplace(pos, dir, x)},${shape(extrude(prof, c.part.L))},$,${vert ? '.COLUMN.' : '.BEAM.'})`);
        reg(e, c.mat); count[vert ? 'column' : 'beam']++;
      }
    }
    /* corps 3D du noyau : faces triangulées */
    const kr = Kernel.status() === 'ready' ? Kernel.result() : null;
    if (kr) for (const b of kr.bodies) {
      const P = b.mesh.pos, I = b.mesh.idx, pts = [];
      for (let i = 0; i < P.length; i += 3) pts.push(`(${real(P[i])},${real(P[i + 1])},${real(P[i + 2])})`);
      const tri = []; for (let i = 0; i < I.length; i += 3) tri.push(`(${I[i] + 1},${I[i + 1] + 1},${I[i + 2] + 1})`);
      const pl = A(`IFCCARTESIANPOINTLIST3D((${pts.join(',')}),$)`), fs = A(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${tri.join(',')}),$)`);
      const e = A(`IFCBUILDINGELEMENTPROXY('${guid()}',${own},${str(b.name)},'Corps 3D',$,${lplace([0, 0, 0], [0, 0, 1], [1, 0, 0])},${shape(fs, 'Tessellation')},$,.ELEMENT.)`);
      reg(e, b.mat); pset(e, { Volume_m3: b.props.volume / 1e9 }); count.body++;
    }
    if (!elems.length) { Status.msg('Rien à exporter en IFC : aucun réseau, équipement, mur, poutre, profilé ni corps 3D visible.', 7000); return null; }
    A(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${own},$,$,(${elems.join(',')}),${st})`);
    for (const [m, list] of matRel) A(`IFCRELASSOCIATESMATERIAL('${guid()}',${own},$,$,(${list.join(',')}),${m})`);
    const head = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
      `FILE_NAME(${str(IO.safeName(d.name) + '.ifc')},'${now.toISOString().slice(0, 19)}',('Studio Prism'),('Studio Prism'),'ARCHIINDUS','ARCHIINDUS','');`, "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;'];
    const text = head.concat(W.lines, ['ENDSEC;', 'END-ISO-10303-21;']).join('\n') + '\n';
    IO.download(`${IO.safeName(d.name)}.ifc`, text, 'application/x-step');
    Status.msg(`IFC4 exporté : ${count.pipe} tronçon(s) de tuyauterie, ${count.cable} de câble, ${count.equip} équipement(s), ${count.wall} mur(s), ${count.beam} poutre(s), ${count.column} poteau(x), ${count.body} corps 3D (mm).`, 9000);
    return { text, count };
  }

  /* ---------- import DXF ---------- */
  function parseDXF(text) {
    const L = text.split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i].trim(), 10), L[i + 1]]);
    let units = 4, sec = '', i = 0;
    const ents = [], layers = new Map();
    while (i < pairs.length) {
      const [c, v] = pairs[i];
      if (c === 0 && v.trim() === 'SECTION') { sec = (pairs[i + 1] || [0, ''])[1].trim(); i += 2; continue; }
      if (sec === 'HEADER' && c === 9 && v.trim() === '$INSUNITS') { units = parseInt((pairs[i + 1] || [0, '4'])[1], 10); i += 2; continue; }
      if (sec === 'TABLES' && c === 0 && v.trim() === 'LAYER') {
        let j = i + 1, name = '', col = 7; while (j < pairs.length && pairs[j][0] !== 0) { if (pairs[j][0] === 2) name = pairs[j][1].trim(); if (pairs[j][0] === 62) col = Math.abs(parseInt(pairs[j][1], 10)); j++; }
        if (name) layers.set(name, col); i = j; continue;
      }
      if (sec === 'ENTITIES' && c === 0) {
        const type = v.trim(); const g = []; let j = i + 1;
        while (j < pairs.length && pairs[j][0] !== 0) { g.push(pairs[j]); j++; }
        const e = { type, g };
        if (type === 'POLYLINE') { e.verts = []; while (j < pairs.length && pairs[j][1].trim() === 'VERTEX') { const vg = []; j++; while (j < pairs.length && pairs[j][0] !== 0) { vg.push(pairs[j]); j++; } e.verts.push(vg); } if (j < pairs.length && pairs[j][1].trim() === 'SEQEND') { j++; while (j < pairs.length && pairs[j][0] !== 0) j++; } }
        ents.push(e); i = j; continue;
      }
      i++;
    }
    return { units, ents, layers };
  }
  const ACI = { 1: '#E11D21', 2: '#D4A600', 3: '#1E8E5A', 4: '#169999', 5: '#0877B9', 6: '#9C27B0', 7: '#1B2433', 8: '#6B7280', 9: '#9AA3AD' };
  function importDXFText(text, name) {
    const P = parseDXF(text), k = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }[P.units] || 1;
    const f = (g, code, def = 0) => { const x = g.find((p) => p[0] === code); return x ? parseFloat(x[1]) : def; };
    const s = (g, code) => { const x = g.find((p) => p[0] === code); return x ? x[1].trim() : ''; };
    const out = [];
    for (const e of P.ents) {
      const ly = s(e.g, 8) || '0';
      if (e.type === 'LINE') out.push({ ly, o: { type: 'line', a: [f(e.g, 10) * k, f(e.g, 20) * k], b: [f(e.g, 11) * k, f(e.g, 21) * k] } });
      else if (e.type === 'CIRCLE') out.push({ ly, o: { type: 'circle', c: [f(e.g, 10) * k, f(e.g, 20) * k], r: f(e.g, 40) * k } });
      else if (e.type === 'ARC') {
        const c = [f(e.g, 10) * k, f(e.g, 20) * k], r = f(e.g, 40) * k; let a0 = f(e.g, 50) * Math.PI / 180, a1 = f(e.g, 51) * Math.PI / 180; if (a1 <= a0) a1 += 2 * Math.PI;
        const n = Math.max(4, Math.ceil((a1 - a0) / (Math.PI / 24)));
        out.push({ ly, o: { type: 'poly', closed: false, pts: Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(a0 + (a1 - a0) * i / n), c[1] + r * Math.sin(a0 + (a1 - a0) * i / n)]) } });
      } else if (e.type === 'LWPOLYLINE') {
        const pts = []; let cur = null;
        for (const [c, v] of e.g) { if (c === 10) { cur = [parseFloat(v) * k, 0]; pts.push(cur); } else if (c === 20 && cur) cur[1] = parseFloat(v) * k; }
        if (pts.length >= 2) out.push({ ly, o: { type: 'poly', closed: (f(e.g, 70) & 1) === 1, pts } });
      } else if (e.type === 'POLYLINE' && e.verts) {
        const pts = e.verts.map((vg) => [f(vg, 10) * k, f(vg, 20) * k]);
        if (pts.length >= 2) out.push({ ly, o: { type: 'poly', closed: (f(e.g, 70) & 1) === 1, pts } });
      } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
        const t = s(e.g, 1).replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').slice(0, 500);
        if (t) out.push({ ly, o: { type: 'text', p: [f(e.g, 10) * k, f(e.g, 20) * k], text: t, h: Math.max(1, f(e.g, 40, 2.5) * k) } });
      }
    }
    const ok = out.filter((x) => { const nums = JSON.stringify(x.o).match(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi) || []; return nums.every((v) => Math.abs(+v) < 1e9) && (x.o.type !== 'circle' || x.o.r > 0); });
    if (!ok.length) throw new Error('aucune entité reconnue (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT, MTEXT)');
    let layersAdded = 0;
    Doc.mutate((d) => {
      const map = new Map();
      for (const x of ok) {
        if (!map.has(x.ly)) {
          let l = d.layers.find((y) => y.name === `DXF ${x.ly}`.slice(0, 60));
          if (!l && d.layers.length < 200) { l = { id: d.nextLayerId++, name: `DXF ${x.ly}`.slice(0, 60), color: ACI[P.layers.get(x.ly)] || '#6B7280', group: 'divers', visible: true, locked: false }; d.layers.push(l); layersAdded++; }
          map.set(x.ly, l ? l.id : d.layers[0].id);
        }
        const o = { ...x.o, id: d.nextId++, layer: map.get(x.ly) };
        if (state.sketch) o.sk = state.sketch;
        d.objects.push(o);
      }
    });
    Canvas2D.zoomExtents();
    Status.msg(`DXF « ${name} » importé : ${ok.length} objet(s), ${layersAdded} calque(s) « DXF … » (unité du fichier : ${{ 1: 'pouce', 2: 'pied', 4: 'mm', 5: 'cm', 6: 'm' }[P.units] || 'mm supposé'}). Arcs convertis en polylignes.`, 9000);
    return ok.length;
  }
  function importDXFDialog() {
    const inp = el('input', { type: 'file', accept: '.dxf,application/dxf,image/vnd.dxf' });
    inp.addEventListener('change', async () => {
      const file = inp.files[0]; if (!file) return;
      if (file.size > 30 * 1024 * 1024) { Status.msg('Fichier DXF trop volumineux (30 Mo maximum).', 7000); return; }
      const buf = new Uint8Array(await file.arrayBuffer());
      let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      if (/\$DWGCODEPAGE[\s\S]{0,40}ANSI_1252/.test(text.slice(0, 20000)) || text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
      try { importDXFText(text, file.name); } catch (e) { Status.msg('Import DXF impossible : ' + e.message, 9000); }
    });
    inp.click();
  }

  return { exportIFC, parseDXF, importDXFText, importDXFDialog };
})();
