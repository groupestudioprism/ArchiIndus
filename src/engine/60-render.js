/* Dessin des objets, de la sélection, des aperçus et des repères d'accroche. */
const Render = (() => {
  const css = (n) => Canvas2D.css(n);

  /* En thème sombre, les couleurs de calque trop foncées sont éclaircies pour rester lisibles. */
  function shade(hex) {
    if (!Theme.isDark()) return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.45) return hex;
    const k = 0.65;
    r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k);
    return `rgb(${r},${g},${b})`;
  }

  function strokePath(ctx, pts, closed) {
    const S = Canvas2D.toScreen;
    ctx.beginPath();
    pts.forEach((p, i) => { const s = S(p); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  function drawDim(ctx, o, col, lw) {
    const S = Canvas2D.toScreen;
    const sc = state.view.scale;
    const g = Geo.dimGeom(o);
    if (g.L < 1e-9) return;
    const sgn = Math.sign(o.off) || 1;
    const nS = [g.n[0], -g.n[1]];                 /* normale en repère écran */
    const dS = [g.dir[0], -g.dir[1]];             /* direction en repère écran */
    const ext = 80 * sc;                          /* dépassement des traits de repère : 80 mm */
    const a = S(o.a), b = S(o.b), p1 = S(g.p1), p2 = S(g.p2);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(p1[0] + nS[0] * sgn * ext, p1[1] + nS[1] * sgn * ext);
    ctx.moveTo(b[0], b[1]); ctx.lineTo(p2[0] + nS[0] * sgn * ext, p2[1] + nS[1] * sgn * ext);
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
    const t = [dS[0] + nS[0], dS[1] + nS[1]];
    const tl = Math.hypot(t[0], t[1]) || 1;
    const tk = [t[0] / tl * 6, t[1] / tl * 6];    /* traits obliques de 6 px */
    for (const p of [p1, p2]) { ctx.moveTo(p[0] - tk[0], p[1] - tk[1]); ctx.lineTo(p[0] + tk[0], p[1] + tk[1]); }
    ctx.stroke();
    let ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    const px = clamp((o.h || 150) * sc, 9, 48);
    ctx.save();
    ctx.translate((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
    ctx.rotate(ang);
    ctx.font = `600 ${px}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(g.L), 0, -3);
    ctx.restore();
  }

  function drawObject(ctx, o, col, lw) {
    const S = Canvas2D.toScreen;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
    switch (o.type) {
      case 'line': strokePath(ctx, [o.a, o.b], false); break;
      case 'poly': strokePath(ctx, o.pts, o.closed); break;
      case 'circle': {
        const c = S(o.c);
        ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(o.r * state.view.scale, 0.5), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'dim': drawDim(ctx, o, col, Math.max(1, lw - 0.4)); break;
      case 'text': {
        const p = S(o.p);
        ctx.font = `500 ${clamp(o.h * state.view.scale, 9, 400)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(o.text, p[0], p[1]);
        break;
      }
    }
  }

  function marker(ctx, c) {
    if (!c || ['free', 'grid', 'ortho', 'typed'].includes(c.kind)) return;
    const s = Canvas2D.toScreen(c.p);
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = css('--sel'); ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.kind === 'end') ctx.rect(s[0] - 5, s[1] - 5, 10, 10);
    else if (c.kind === 'center') ctx.arc(s[0], s[1], 5.5, 0, Math.PI * 2);
    else if (c.kind === 'mid') { ctx.moveTo(s[0], s[1] - 6); ctx.lineTo(s[0] + 6, s[1] + 5); ctx.lineTo(s[0] - 6, s[1] + 5); ctx.closePath(); }
    else { ctx.moveTo(s[0] - 5, s[1] - 5); ctx.lineTo(s[0] + 5, s[1] + 5); ctx.moveTo(s[0] + 5, s[1] - 5); ctx.lineTo(s[0] - 5, s[1] + 5); }
    ctx.stroke();
    ctx.restore();
  }

  function scene(ctx) {
    const d = Doc.get();
    const byLayer = new Map();
    for (const o of d.objects) {
      if (!byLayer.has(o.layer)) byLayer.set(o.layer, []);
      byLayer.get(o.layer).push(o);
    }
    for (const l of d.layers) {
      if (!l.visible) continue;
      const col = shade(l.color);
      for (const o of byLayer.get(l.id) || []) drawObject(ctx, o, col, 1.6);
    }
    const selCol = css('--sel');
    for (const o of d.objects) {
      if (Tools.selection.has(o.id)) drawObject(ctx, o, selCol, 2.6);
    }
    const h = Tools.hover();
    if (h && !Tools.selection.has(h.id)) drawObject(ctx, h, css('--accent'), 2.4);
    Tools.preview(ctx);
    marker(ctx, Tools.snapState());
  }

  return { scene, drawObject };
})();
