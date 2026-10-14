/* Export PDF vectoriel, sans bibliothèque : feuille A3 ou A4 paysage, dessin à une échelle normalisée (1:N),
   cartouche, puis pages de nomenclature. Polices Helvetica standard du PDF (encodage WinAnsi) : les caractères
   hors Latin-1 sont remplacés par « ? ». Largeur du texte : estimation (0,52 × corps), suffisante pour centrer.
   Le résultat doit être vérifié visuellement dans un lecteur PDF avant diffusion. */
const PDF = (() => {
  const MM = 72 / 25.4;
  const SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
  const MARGIN = 10, CART_W = 170, CART_H = 36, STRIP = 40;

  const num = (v) => (+v).toFixed(3).replace(/\.?0+$/, '') || '0';
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => num(c / 255)).join(' '); };
  const enc = (s) => {
    let o = '';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      o += (c >= 32 && c < 127) || (c >= 160 && c < 256) ? ch : (c === 0x2013 || c === 0x2014 ? '-' : c === 0x2019 ? "'" : c === 0x2026 ? '...' : '?');
    }
    return o;
  };
  const esc = (s) => enc(s).replace(/[\\()]/g, '\\$&');

  /* Page : opérations de dessin en millimètres, origine en bas à gauche. */
  function page(w, h) {
    const ops = [];
    const P = {
      w, h, ops,
      color(hex) { ops.push(`${rgb(hex)} RG ${rgb(hex)} rg`); },
      width(mm) { ops.push(`${num(Math.max(mm, 0.05) * MM)} w`); },
      alpha(on) { ops.push(on ? '/GS1 gs' : '/GS0 gs'); },
      cap(round) { ops.push(round ? '1 J 1 j' : '0 J 0 j'); },
      path(pts, closed) {
        pts.forEach((p, i) => ops.push(`${num(p[0] * MM)} ${num(p[1] * MM)} ${i ? 'l' : 'm'}`));
        ops.push(closed ? 's' : 'S');
      },
      line(a, b) { P.path([a, b], false); },
      rect(x, y, rw, rh) { ops.push(`${num(x * MM)} ${num(y * MM)} ${num(rw * MM)} ${num(rh * MM)} re S`); },
      circle(c, r) {
        const k = 0.5522847498 * r, x = c[0], y = c[1], m = (v) => num(v * MM);
        ops.push(`${m(x + r)} ${m(y)} m`,
          `${m(x + r)} ${m(y + k)} ${m(x + k)} ${m(y + r)} ${m(x)} ${m(y + r)} c`,
          `${m(x - k)} ${m(y + r)} ${m(x - r)} ${m(y + k)} ${m(x - r)} ${m(y)} c`,
          `${m(x - r)} ${m(y - k)} ${m(x - k)} ${m(y - r)} ${m(x)} ${m(y - r)} c`,
          `${m(x + k)} ${m(y - r)} ${m(x + r)} ${m(y - k)} ${m(x + r)} ${m(y)} c S`);
      },
      /* Texte : (x, y) = point d'ancrage sur la ligne de base ; size en mm ; align : 'l' | 'c' | 'r' ; deg : rotation. */
      text(x, y, str, size, o = {}) {
        const sz = Math.max(size, 0.8) * MM;
        const wd = enc(str).length * sz * (o.bold ? 0.56 : 0.52) / MM;
        const dx = o.align === 'c' ? -wd / 2 : o.align === 'r' ? -wd : 0;
        const th = (o.deg || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
        const px = x + dx * c, py = y + dx * s;
        ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${num(sz)} Tf ${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(px * MM)} ${num(py * MM)} Tm (${esc(str)}) Tj ET`);
      },
    };
    return P;
  }

  const today = () => new Date().toLocaleDateString('fr-FR');

  function frame(P, sheet, name, no, total, scaleLabel) {
    P.alpha(false); P.cap(false); P.color('#111827');
    P.width(0.7); P.rect(MARGIN, MARGIN, P.w - 2 * MARGIN, P.h - 2 * MARGIN);
    const x0 = P.w - MARGIN - CART_W, y0 = MARGIN, y1 = y0 + CART_H;
    P.width(0.5); P.rect(x0, y0, CART_W, CART_H);
    P.width(0.3);
    const r1 = y1 - 14, r2 = r1 - 11;
    P.line([x0, r1], [x0 + CART_W, r1]);
    P.line([x0, r2], [x0 + CART_W, r2]);
    const cols = [0, 62, 112, 146, CART_W];
    for (const c of cols.slice(1, -1)) { P.line([x0 + c, r2], [x0 + c, r1]); P.line([x0 + c, y0], [x0 + c, r2]); }
    P.color('#071B55');
    P.text(x0 + 3, y1 - 6, name.length > 44 ? name.slice(0, 43) + '...' : name, 5, { bold: true });
    P.text(x0 + 3, y1 - 11.2, 'ARCHIINDUS · Studio Prism', 2.6);
    P.color('#4B5563');
    const cell = (cx, y, label, value) => {
      P.color('#4B5563'); P.text(x0 + cx + 1.5, y + 7.2, label, 2);
      P.color('#111827'); P.text(x0 + cx + 1.5, y + 2.6, value, 3.4, { bold: true });
    };
    cell(cols[0], r1 - 11, 'Client', sheet.client || '—');
    cell(cols[1], r1 - 11, 'Dessiné par', sheet.author || '—');
    cell(cols[2], r1 - 11, 'Référence', sheet.ref || '—');
    cell(cols[3], r1 - 11, 'Indice', sheet.rev || 'A');
    cell(cols[0], y0, 'Échelle', scaleLabel);
    cell(cols[1], y0, 'Format', sheet.format + ' paysage');
    cell(cols[2], y0, 'Date', today());
    cell(cols[3], y0, 'Feuille', `${no} / ${total}`);
  }

  /* --- Feuille de dessin --- */
  function drawingPage(sheet, name, PW, PH) {
    const objs = IO.visibleObjects();
    if (!objs.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of objs) {
      const b = Geo.bbox(o), pad = o.net ? o.net.dn / 2 : 0;
      x0 = Math.min(x0, b[0] - pad); y0 = Math.min(y0, b[1] - pad); x1 = Math.max(x1, b[2] + pad); y1 = Math.max(y1, b[3] + pad);
    }
    const aw = PW - 2 * (MARGIN + 5), ah = PH - 2 * MARGIN - STRIP - 10;
    const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
    const N = SCALES.find((n) => w / n <= aw && h / n <= ah) || SCALES[SCALES.length - 1];
    const ox = MARGIN + 5 + (aw - w / N) / 2 - x0 / N;
    const oy = MARGIN + STRIP + 5 + (ah - h / N) / 2 - y0 / N;
    const T = (p) => [ox + p[0] / N, oy + p[1] / N];
    const P = page(PW, PH);
    P.cap(true);
    for (const l of Doc.get().layers) {
      if (!l.visible) continue;
      const items = objs.filter((o) => o.layer === l.id);
      if (!items.length) continue;
      P.color(l.color); P.alpha(false);
      for (const o of items) {
        if ((o.type === 'line' || o.type === 'poly') && o.net) {
          P.alpha(true); P.width(Math.max(o.net.dn / N, 0.5)); P.cap(true);
          P.path((o.type === 'line' ? [o.a, o.b] : o.pts).map(T), !!o.closed);
          P.alpha(false);
        }
        P.width(0.25);
        if (o.type === 'line') P.line(T(o.a), T(o.b));
        else if (o.type === 'poly') P.path(o.pts.map(T), !!o.closed);
        else if (o.type === 'circle') P.circle(T(o.c), o.r / N);
        else if (o.type === 'text') P.text(...T(o.p), o.text, o.h / N);
        else if (o.type === 'dim') {
          const d = IO.dimExplode(o);
          P.width(0.18);
          for (const [a, b] of d.lines) P.line(T(a), T(b));
          const m = T(d.mid), th = d.deg * Math.PI / 180;
          P.text(m[0] - Math.sin(th) * d.h / N * 0.25, m[1] + Math.cos(th) * d.h / N * 0.25, d.str, d.h / N, { align: 'c', deg: d.deg });
        }
        if (o.net) {
          const nl = IO.netLabelInfo(o);
          if (nl) {
            const m = T(nl.mid), th = nl.deg * Math.PI / 180, off = o.net.dn / N / 2 + nl.h / N * 0.25;
            P.text(m[0] - Math.sin(th) * off, m[1] + Math.cos(th) * off, nl.str, Math.max(nl.h / N, 2), { align: 'c', deg: nl.deg });
          }
        }
      }
    }
    return { P, scaleLabel: N === 1 ? '1:1' : `1:${N}` };
  }

  /* --- Pages de nomenclature --- */
  function bomPages(sheet, name, PW, PH) {
    const b = BOM.compute();
    if (!b.nets.length && !b.others.length) return [];
    const aw = PW - 2 * (MARGIN + 5);
    const specs = {
      net: { head: BOM.NET_HEAD, num: BOM.NET_NUM, frac: [0.26, 0.17, 0.09, 0.28, 0.09, 0.11] },
      other: { head: BOM.OTHER_HEAD, num: BOM.OTHER_NUM, frac: [0.30, 0.18, 0.14, 0.10, 0.14, 0.14] },
    };
    const items = [];
    if (b.nets.length) {
      items.push({ t: 'title', text: 'Nomenclature : réseaux' }, { t: 'head', s: specs.net });
      b.nets.forEach((r) => items.push({ t: 'row', s: specs.net, cells: BOM.netRow(r) }));
      const t = BOM.totals(b);
      items.push({ t: 'row', s: specs.net, bold: true, cells: ['Total', '', '', '', String(t.netSegments), BOM.f2(t.netLength)] });
    }
    if (b.others.length) {
      items.push({ t: 'title', text: 'Nomenclature : autres éléments par calque' }, { t: 'head', s: specs.other });
      b.others.forEach((r) => items.push({ t: 'row', s: specs.other, cells: BOM.otherRow(r) }));
    }
    const RH = 6.2, top = PH - MARGIN - 12, bottom = MARGIN + STRIP + 4;
    const perPage = Math.floor((top - bottom) / RH);
    const pages = [];
    let cur = null, used = 0, lastHead = null;
    const fresh = () => { cur = page(PW, PH); cur.cap(false); used = 0; pages.push(cur); };
    const colX = (s) => { let x = MARGIN + 5; return s.frac.map((f) => { const r = [x, f * aw]; x += f * aw; return r; }); };
    for (const it of items) {
      if (it.t === 'title' && cur && used > 0) used += 1;            /* ligne vide avant une nouvelle table */
      const need = it.t === 'title' ? 2 : 1;
      if (!cur || used + need > perPage) { fresh(); if (it.t === 'row' && lastHead) { used = emit({ t: 'head', s: lastHead }, used); } }
      used = emit(it, used);
    }
    function emit(it, u) {
      const y = top - (u + 1) * RH + 1.6;
      if (it.t === 'title') { cur.color('#071B55'); cur.text(MARGIN + 5, y, it.text, 4.6, { bold: true }); return u + 2; }
      const cx = colX(it.s);
      if (it.t === 'head') {
        lastHead = it.s;
        cur.color('#4B5563'); cur.width(0.3); cur.line([MARGIN + 5, y - 1.6], [MARGIN + 5 + aw, y - 1.6]);
        it.s.head.forEach((h, i) => { const num = it.s.num.includes(i); cur.text(num ? cx[i][0] + cx[i][1] - 1.5 : cx[i][0] + 1.5, y, h, 2.8, { bold: true, align: num ? 'r' : 'l' }); });
        return u + 1;
      }
      cur.color('#111827'); cur.width(0.12); cur.line([MARGIN + 5, y - 1.6], [MARGIN + 5 + aw, y - 1.6]);
      it.cells.forEach((c, i) => { const num = it.s.num.includes(i); cur.text(num ? cx[i][0] + cx[i][1] - 1.5 : cx[i][0] + 1.5, y, c, 3.2, { bold: !!it.bold, align: num ? 'r' : 'l' }); });
      return u + 1;
    }
    return pages;
  }

  /* --- Assemblage du fichier --- */
  function assemble(pages, title) {
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offs = [];
    const obj = (n, body) => { offs[n] = out.length; out += `${n} 0 obj\n${body}\nendobj\n`; };
    const nObj = 6 + pages.length * 2;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${7 + 2 * i} 0 R`).join(' ')}] >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, '<< /GS0 << /Type /ExtGState /CA 1 /ca 1 >> /GS1 << /Type /ExtGState /CA 0.26 /ca 0.26 >> >>');
    obj(6, `<< /Title (${esc(title)}) /Producer (ARCHIINDUS Studio Prism) >>`);
    pages.forEach((P, i) => {
      const content = P.ops.join('\n');
      obj(7 + 2 * i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(P.w * MM)} ${num(P.h * MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /ExtGState 5 0 R >> /Contents ${8 + 2 * i} 0 R >>`);
      obj(8 + 2 * i, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const xref = out.length;
    out += `xref\n0 ${nObj + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= nObj; n++) out += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${nObj + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  function build() {
    const d = Doc.get();
    const sheet = cleanSheet(d.sheet);
    const [PW, PH] = SHEET_FORMATS[sheet.format];
    const dp = drawingPage(sheet, d.name, PW, PH);
    if (!dp) return null;
    const bp = bomPages(sheet, d.name, PW, PH);
    const total = 1 + bp.length;
    frame(dp.P, sheet, d.name, 1, total, dp.scaleLabel);
    bp.forEach((P, i) => frame(P, sheet, d.name, i + 2, total, '—'));
    return { bytes: assemble([dp.P, ...bp], d.name), pages: total, scale: dp.scaleLabel };
  }

  function exportPDF() {
    const r = build();
    if (!r) { Status.msg('Rien à exporter : le dessin est vide ou tous les calques sont masqués.'); return; }
    IO.download(`${IO.safeName(Doc.get().name)}.pdf`, r.bytes, 'application/pdf');
    Status.msg(`PDF envoyé vers vos téléchargements (${r.pages} feuille${r.pages > 1 ? 's' : ''}, échelle ${r.scale}).`);
  }

  /* Boîte de dialogue : format et cartouche, puis export. */
  function dialog() {
    const s = cleanSheet(Doc.get().sheet);
    const fld = (label, key, max) => {
      const i = el('input', { class: 'fld', type: 'text', maxlength: max, value: s[key], 'aria-label': label });
      return [el('label', { class: 'lbl' }, label, i), i];
    };
    const fmtSel = el('select', { 'aria-label': 'Format de feuille' }, ...Object.keys(SHEET_FORMATS).map((k) => el('option', { value: k, selected: k === s.format }, `${k} paysage`)));
    const [l1, client] = fld('Client', 'client', 60), [l2, author] = fld('Dessiné par', 'author', 60), [l3, ref] = fld('Référence', 'ref', 40), [l4, rev] = fld('Indice', 'rev', 10);
    const body = el('div', {}, el('p', { class: 'mut small' }, 'Le dessin est mis à l\'échelle normalisée la plus grande qui tient sur la feuille. Les calques masqués ne sont pas imprimés. Vérifiez le PDF dans un lecteur avant diffusion.'),
      el('div', { class: 'frm' }, el('label', { class: 'lbl' }, 'Format', fmtSel), l4, l1, l2, l3));
    Dlg.open('Export PDF', body, [{
      label: 'Exporter le PDF', primary: true,
      run: () => {
        const v = cleanSheet({ format: fmtSel.value, client: client.value, author: author.value, ref: ref.value, rev: rev.value });
        Doc.mutate((dd) => { dd.sheet = v; });
        exportPDF();
      },
    }]);
  }

  return { build, exportPDF, dialog, SCALES };
})();
