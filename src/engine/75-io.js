/* Fichiers : projet JSON (enregistrer / ouvrir), export SVG, export DXF (R12, ASCII).
   Les cotes sont éclatées en lignes et texte dans les exports SVG et DXF. */
const IO = (() => {
  const safeName = (s) => String(s).replace(/[^\w\- .]/g, '_').trim().slice(0, 60) || 'projet';

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function saveJSON() {
    const d = Doc.get();
    download(`${safeName(d.name)}.archiindus.json`, JSON.stringify(d, null, 1), 'application/json');
    Status.msg('Projet envoyé vers vos téléchargements (.archiindus.json).');
  }

  async function openFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { Status.msg('Fichier trop volumineux (20 Mo maximum).', 8000); return; }
    try {
      const data = Doc.sanitize(JSON.parse(await file.text()));
      Cloud.forget();
      Doc.replace(data);
      Tools.selection.clear();
      Canvas2D.zoomExtents();
      Status.msg(`Projet « ${data.name} » ouvert (${data.objects.length} objets).`);
    } catch (e) {
      Status.msg('Ouverture impossible : ' + (e instanceof SyntaxError ? 'ce fichier n\'est pas du JSON valide.' : e.message), 9000);
    }
  }

  /* Objets visibles, avec leur calque. */
  function visibleObjects() {
    const out = [];
    for (const o of Doc.get().objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible) continue;
      if (Sym.isComposite(o)) for (const e of Sym.expand(o)) out.push({ ...e, layer: o.layer });   /* symboles, murs, poutres : éléments vectoriels simples */
      else out.push(o);
    }
    return out;
  }

  /* Cote éclatée : lignes (repère monde) + libellé lisible (angle en degrés, jamais à l'envers). */
  function dimExplode(o) {
    const g = Geo.dimGeom(o);
    const sgn = Math.sign(o.off) || 1;
    const e1 = [g.p1[0] + g.n[0] * sgn * 80, g.p1[1] + g.n[1] * sgn * 80];
    const e2 = [g.p2[0] + g.n[0] * sgn * 80, g.p2[1] + g.n[1] * sgn * 80];
    const t = [g.dir[0] + g.n[0], g.dir[1] + g.n[1]];
    const tl = Math.hypot(t[0], t[1]) || 1;
    const tk = [t[0] / tl * 60, t[1] / tl * 60];
    const lines = [[o.a, e1], [o.b, e2], [g.p1, g.p2]];
    for (const p of [g.p1, g.p2]) lines.push([[p[0] - tk[0], p[1] - tk[1]], [p[0] + tk[0], p[1] + tk[1]]]);
    let deg = Math.atan2(g.dir[1], g.dir[0]) * 180 / Math.PI;
    if (deg > 90 || deg < -90) deg += 180;
    return { lines, mid: G.mid(g.p1, g.p2), deg, str: fmt(g.L), h: o.h || 150 };
  }

  /* Étiquette d'un réseau : milieu du plus long tronçon, angle lisible, texte « repère · DN ». */
  function netLabelInfo(o) {
    let best = null, bl = 0;
    for (const [a, b] of Geo.segments(o)) { const l = G.dist(a, b); if (l > bl) { bl = l; best = [a, b]; } }
    if (!best) return null;
    let deg = Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) * 180 / Math.PI;
    if (deg > 90 || deg < -90) deg += 180;
    return { mid: G.mid(best[0], best[1]), deg, str: (o.net.tag ? o.net.tag + ' · ' : '') + 'DN' + o.net.dn, h: 120 };
  }

  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function exportSVG() {
    const objs = visibleObjects();
    if (!objs.length) { Status.msg('Rien à exporter : le dessin est vide ou tous les calques sont masqués.'); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of objs) { const b = Geo.bbox(o); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const m = Math.max(x1 - x0, y1 - y0) * 0.05 + 200;
    const X = (v) => +v.toFixed(3), Y = (v) => +(-v).toFixed(3);
    const line = (a, b) => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`;
    const out = [];
    for (const l of Doc.get().layers) {
      const items = objs.filter((o) => o.layer === l.id);
      if (!l.visible || !items.length) continue;
      const g = [`<g data-layer="${xmlEsc(l.name)}" fill="none" stroke="${l.color}" stroke-width="1.5" font-family="Arial, Helvetica, sans-serif">`];
      for (const o of items) {
        if ((o.type === 'line' || o.type === 'poly') && o.net) {
          /* bande à la largeur réelle du diamètre (mm), puis axe et étiquette */
          const pts = (o.type === 'line' ? [o.a, o.b] : o.pts).map((p) => X(p[0]) + ',' + Y(p[1])).join(' ');
          g.push(`<${o.closed ? 'polygon' : 'polyline'} points="${pts}" stroke-width="${o.net.dn}" stroke-opacity="0.26" stroke-linecap="round" stroke-linejoin="round" style="vector-effect:none" data-dn="${o.net.dn}"/>`);
          const nl = netLabelInfo(o);
          if (nl) g.push(`<text transform="translate(${X(nl.mid[0])},${Y(nl.mid[1])}) rotate(${+(-nl.deg).toFixed(3)})" text-anchor="middle" y="${-(o.net.dn / 2 + nl.h * 0.25)}" font-size="${nl.h}" fill="${l.color}" stroke="none">${xmlEsc(nl.str)}</text>`);
        }
        if (o.type === 'line') g.push(line(o.a, o.b));
        else if (o.type === 'poly') g.push(`<${o.closed ? 'polygon' : 'polyline'} points="${o.pts.map((p) => X(p[0]) + ',' + Y(p[1])).join(' ')}"/>`);
        else if (o.type === 'circle') g.push(`<circle cx="${X(o.c[0])}" cy="${Y(o.c[1])}" r="${X(o.r)}"/>`);
        else if (o.type === 'text') g.push(`<text x="${X(o.p[0])}" y="${Y(o.p[1])}"${o.deg ? ` transform="rotate(${+(-o.deg).toFixed(3)} ${X(o.p[0])} ${Y(o.p[1])})"` : ''} font-size="${o.h}" fill="${l.color}" stroke="none">${xmlEsc(o.text)}</text>`);
        else if (o.type === 'dim') {
          const d = dimExplode(o);
          for (const [a, b] of d.lines) g.push(line(a, b));
          g.push(`<text transform="translate(${X(d.mid[0])},${Y(d.mid[1])}) rotate(${+(-d.deg).toFixed(3)})" text-anchor="middle" y="${-d.h * 0.2}" font-size="${d.h}" fill="${l.color}" stroke="none">${d.str}</text>`);
        }
      }
      g.push('</g>');
      out.push(g.join('\n'));
    }
    const w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X(x0 - m)} ${Y(y1 + m)} ${X(w)} ${X(h)}" width="${X(w)}mm" height="${X(h)}mm">\n`
      + `<title>${xmlEsc(Doc.get().name)}</title>\n`
      + `<style>line,polyline,polygon,circle{vector-effect:non-scaling-stroke}</style>\n`
      + `<rect x="${X(x0 - m)}" y="${Y(y1 + m)}" width="${X(w)}" height="${X(h)}" fill="#ffffff"/>\n`
      + out.join('\n') + '\n</svg>\n';
    download(`${safeName(Doc.get().name)}.svg`, svg, 'image/svg+xml');
    Status.msg('Export SVG envoyé vers vos téléchargements (unité : mm).');
  }

  /* --- DXF R12 (ASCII). Non accentué : les noms et textes sont translittérés. Couleurs : indice AutoCAD le plus proche. --- */
  const ACI = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [7, 0, 0, 0], [8, 128, 128, 128]];
  const aciOf = (hex) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    let best = 7, bd = Infinity;
    for (const [i, cr, cg, cb] of ACI) { const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  const ascii = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');

  function exportDXF() {
    const objs = visibleObjects();
    if (!objs.length) { Status.msg('Rien à exporter : le dessin est vide ou tous les calques sont masqués.'); return; }
    const L = [];
    const w = (code, v) => { L.push(String(code), String(v)); };
    const nf = (v) => v.toFixed(6);
    const names = new Map();
    const used = new Set(['0']);
    for (const l of Doc.get().layers) {
      let n = ascii(l.name).toUpperCase().replace(/[^A-Z0-9_$-]/g, '_').slice(0, 28) || 'CALQUE';
      while (used.has(n)) n += '_';
      used.add(n);
      names.set(l.id, n);
    }
    w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'TABLES');
    w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1);
    w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, nf(0));
    w(0, 'ENDTAB');
    w(0, 'TABLE'); w(2, 'LAYER'); w(70, Doc.get().layers.length);
    for (const l of Doc.get().layers) { w(0, 'LAYER'); w(2, names.get(l.id)); w(70, 0); w(62, aciOf(l.color)); w(6, 'CONTINUOUS'); }
    w(0, 'ENDTAB');
    w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES');
    const line = (ly, a, b) => { w(0, 'LINE'); w(8, ly); w(10, nf(a[0])); w(20, nf(a[1])); w(30, nf(0)); w(11, nf(b[0])); w(21, nf(b[1])); w(31, nf(0)); };
    const text = (ly, p, h, str, rot) => { w(0, 'TEXT'); w(8, ly); w(10, nf(p[0])); w(20, nf(p[1])); w(30, nf(0)); w(40, nf(h)); w(1, ascii(str)); w(50, nf(rot)); };
    for (const o of objs) {
      const ly = names.get(o.layer);
      if (o.type === 'line' && !o.net) line(ly, o.a, o.b);
      else if (o.type === 'circle') { w(0, 'CIRCLE'); w(8, ly); w(10, nf(o.c[0])); w(20, nf(o.c[1])); w(30, nf(0)); w(40, nf(o.r)); }
      else if (o.type === 'poly' || (o.type === 'line' && o.net)) {
        /* un réseau devient une POLYLINE de largeur constante égale au DN (mm) ; son repère est ajouté en texte */
        const pts = o.type === 'line' ? [o.a, o.b] : o.pts;
        w(0, 'POLYLINE'); w(8, ly); w(66, 1); w(10, nf(0)); w(20, nf(0)); w(30, nf(0)); w(70, o.closed ? 1 : 0);
        if (o.net) { w(40, nf(o.net.dn)); w(41, nf(o.net.dn)); }
        for (const p of pts) { w(0, 'VERTEX'); w(8, ly); w(10, nf(p[0])); w(20, nf(p[1])); w(30, nf(0)); }
        w(0, 'SEQEND'); w(8, ly);
        const nl = o.net && netLabelInfo(o);
        if (nl) {
          const th = nl.deg * Math.PI / 180;
          const u = [Math.cos(th), Math.sin(th)], up = [-Math.sin(th), Math.cos(th)];
          const str = nl.str.replace(' · ', ' - ');
          const wd = str.length * nl.h * 0.6, off = o.net.dn / 2 + nl.h * 0.25;
          text(ly, [nl.mid[0] - u[0] * wd / 2 + up[0] * off, nl.mid[1] - u[1] * wd / 2 + up[1] * off], nl.h, str, nl.deg);
        }
      } else if (o.type === 'text') text(ly, o.p, o.h, o.text, o.deg || 0);
      else if (o.type === 'dim') {
        const d = dimExplode(o);
        for (const [a, b] of d.lines) line(ly, a, b);
        const th = d.deg * Math.PI / 180;
        const u = [Math.cos(th), Math.sin(th)], up = [-Math.sin(th), Math.cos(th)];
        const wd = d.str.length * d.h * 0.6;
        text(ly, [d.mid[0] - u[0] * wd / 2 + up[0] * d.h * 0.25, d.mid[1] - u[1] * wd / 2 + up[1] * d.h * 0.25], d.h, d.str, d.deg);
      }
    }
    w(0, 'ENDSEC'); w(0, 'EOF');
    download(`${safeName(Doc.get().name)}.dxf`, L.join('\r\n') + '\r\n', 'application/dxf');
    Status.msg('Export DXF envoyé vers vos téléchargements (unité : mm, cotes éclatées).');
  }

  return { saveJSON, openFile, exportSVG, exportDXF, download, safeName, visibleObjects, dimExplode, netLabelInfo };
})();
