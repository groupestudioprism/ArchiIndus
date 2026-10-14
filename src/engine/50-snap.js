/* Accroches aux objets : extrémité, centre, milieu, intersection, puis grille. Mode orthogonal (horizontal / vertical).
   Priorité : extrémité > centre > milieu > intersection > grille. Tolérance : 10 pixels. */
const Snap = {
  KINDS: { end: 'Extrémité', center: 'Centre', mid: 'Milieu', inter: 'Intersection', grid: 'Grille', ortho: 'Orthogonal', free: 'Libre', typed: 'Saisie' },

  /* raw : point libre [x, y] ; base : point précédent (pour l'ortho) ou null. Retourne {p, kind}. */
  find(raw, base) {
    if (state.snap.ortho && base) {
      const horiz = Math.abs(raw[0] - base[0]) >= Math.abs(raw[1] - base[1]);
      const step = Canvas2D.gridStep();
      const r = (v) => (state.snap.on ? Math.round(v / step) * step : v);
      return { p: horiz ? [r(raw[0]), base[1]] : [base[0], r(raw[1])], kind: 'ortho' };
    }
    if (!state.snap.on) return { p: [raw[0], raw[1]], kind: 'free' };

    const tl = 10 / state.view.scale;
    const ends = [], mids = [], centers = [], segs = [];
    for (const o of Doc.get().objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible) continue;
      if (o.type === 'line') { ends.push(o.a, o.b); mids.push(G.mid(o.a, o.b)); segs.push([o.a, o.b]); }
      else if (o.type === 'poly') {
        ends.push(...o.pts);
        for (const [a, b] of Geo.segments(o)) { mids.push(G.mid(a, b)); segs.push([a, b]); }
      } else if (o.type === 'circle' || o.type === 'sym') centers.push(o.c);
    }
    const nearest = (list) => {
      let best = null, bd = tl;
      for (const p of list) { const d = G.dist(p, raw); if (d <= bd) { bd = d; best = p; } }
      return best;
    };
    let p = nearest(ends);
    if (p) return { p: [p[0], p[1]], kind: 'end' };
    p = nearest(centers);
    if (p) return { p: [p[0], p[1]], kind: 'center' };
    p = nearest(mids);
    if (p) return { p: [p[0], p[1]], kind: 'mid' };
    if (segs.length <= 300) {
      const inters = [];
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const x = G.segInter(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
          if (x) inters.push(x);
        }
      }
      p = nearest(inters);
      if (p) return { p: [p[0], p[1]], kind: 'inter' };
    }
    const step = Canvas2D.gridStep();
    const g = [Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step];
    if (G.dist(g, raw) <= tl) return { p: g, kind: 'grid' };
    return { p: [raw[0], raw[1]], kind: 'free' };
  },
};
