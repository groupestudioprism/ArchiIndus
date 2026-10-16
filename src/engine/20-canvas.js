/* Canevas 2D : grille adaptative, axes, déplacement (molette enfoncée, barre d'espace ou outil Main), zoom à la molette
   centré sur le curseur. Les clics gauches sont confiés aux outils (Tools). Le dessin des objets est confié à Render. */
const Canvas2D = (() => {
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const coordsEl = $('#coords');
  const zoomEl = $('#zoom');
  let dpr = 1;
  let pan = null;
  let space = false;
  let raf = 0;

  /* couleurs du thème lues une fois puis mémorisées ; relues dès que le thème, la classe ou le style de la page change */
  const cssCache = new Map();
  const css = (name) => { let v = cssCache.get(name); if (v === undefined) { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); cssCache.set(name, v); } return v; };
  new MutationObserver(() => cssCache.clear()).observe(document.documentElement, { attributes: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => cssCache.clear());
  const size = () => ({ w: cv.width / dpr, h: cv.height / dpr });
  const toWorld = (sx, sy) => [(sx - state.view.x) / state.view.scale, (state.view.y - sy) / state.view.scale];
  const toScreen = (p) => [p[0] * state.view.scale + state.view.x, state.view.y - p[1] * state.view.scale];
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  /* Pas de la grille fine (mm) : 10 mm, multiplié par 10 tant qu'il serait inférieur à 10 pixels. */
  function gridStep() {
    let step = AI_PREFS.base || 10;
    while (step * state.view.scale < 10) step *= 10;
    return step;
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, aiDprCap());
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    if (!state.view.placed && r.width > 0) {
      state.view.x = 60;
      state.view.y = r.height - 60;
      state.view.placed = true;
    }
    draw();
  }

  function gridLines(step, color, w, h) {
    const { x: vx, y: vy, scale: s } = state.view;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor((0 - vx) / s / step) * step;
    const x1 = Math.ceil((w - vx) / s / step) * step;
    for (let x = x0; x <= x1; x += step) {
      const sx = Math.round(x * s + vx) + 0.5;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
    }
    const y0 = Math.floor((vy - h) / s / step) * step;
    const y1 = Math.ceil(vy / s / step) * step;
    for (let y = y0; y <= y1; y += step) {
      const sy = Math.round(vy - y * s) + 0.5;
      ctx.moveTo(0, sy); ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  function draw() {
    const { w, h } = size();
    const { x: vx, y: vy, scale: s } = state.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setLineDash([]);
    ctx.fillStyle = css('--vp');
    ctx.fillRect(0, 0, w, h);

    const step = gridStep();
    if (AI_PREFS.grid) { gridLines(step, css('--grid-minor'), w, h); gridLines(step * 10, css('--grid-major'), w, h); }

    ctx.strokeStyle = css('--accent');
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(vy) + 0.5); ctx.lineTo(w, Math.round(vy) + 0.5);
    ctx.moveTo(Math.round(vx) + 0.5, 0); ctx.lineTo(Math.round(vx) + 0.5, h);
    ctx.stroke();
    ctx.globalAlpha = 1;

    Render.scene(ctx, w, h);
    drawGesture();
    zoomEl.textContent = `1 m = ${Math.round(1000 * s)} px`;
  }

  function requestDraw() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  /* Ajuste la vue à tous les objets visibles (ou à une vue par défaut si le dessin est vide). */
  function zoomExtents() {
    const { w, h } = size();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of Doc.get().objects) {
      const l = Doc.layer(o.layer);
      if (!l || !l.visible) continue;
      const b = Geo.bbox(o);
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 10000; y1 = 6000; }
    const bw = Math.max(x1 - x0, 100), bh = Math.max(y1 - y0, 100);
    const s = clamp(Math.min((w - 120) / bw, (h - 120) / bh), VIEW_LIMITS.min, VIEW_LIMITS.max);
    state.view.scale = s;
    state.view.x = (w - bw * s) / 2 - x0 * s;
    state.view.y = (h + bh * s) / 2 + y0 * s;
    draw();
  }

  /* ---- écran tactile : deux doigts = zoom + déplacement (l'outil en cours est suspendu) ---- */
  const touches = new Map();
  let pinch = null;
  function pinchStart() {
    const [p, q] = [...touches.values()];
    pinch = { d: Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s: state.view.scale, vx: state.view.x, vy: state.view.y };
    Tools.cancelDrag();
  }
  function pinchMove() {
    const [p, q] = [...touches.values()];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const s1 = clamp(pinch.s * d / pinch.d, VIEW_LIMITS.min, VIEW_LIMITS.max);
    const w = [(pinch.m[0] - pinch.vx) / pinch.s, (pinch.vy - pinch.m[1]) / pinch.s];   /* point du dessin sous le centre initial */
    state.view.scale = s1;
    state.view.x = m[0] - w[0] * s1;
    state.view.y = m[1] + w[1] * s1;
    requestDraw();
  }
  /* ---- gestes de souris (clic droit glissé) : comme les gestes de SolidWorks ---- */
  let gest = null;
  const GESTURES = { n: ['fit', 'Tout voir'], s: ['select', 'Sélection'], w: ['line', 'Ligne'], e: ['rect', 'Rectangle'], nw: ['circle', 'Cercle'], ne: ['dim', 'Cote'], sw: ['poly', 'Polyligne'], se: ['trim', 'Ajuster'] };
  function gestureDir(dx, dy) {
    const a = Math.atan2(-dy, dx) * 180 / Math.PI, k = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'];
    return k[((Math.round(a / 45) % 8) + 8) % 8];
  }
  function drawGesture() {
    if (!gest || !gest.on) return;
    const k = gestureDir(gest.x - gest.x0, gest.y - gest.y0), g = GESTURES[k];
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(gest.x0, gest.y0); ctx.lineTo(gest.x, gest.y); ctx.stroke();
    ctx.font = '600 12px Inter, sans-serif'; const t = g[1], w = ctx.measureText(t).width + 16;
    ctx.fillStyle = css('--panel'); ctx.strokeStyle = css('--accent');
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gest.x + 10, gest.y - 12, w, 24, 8) : ctx.rect(gest.x + 10, gest.y - 12, w, 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css('--ink'); ctx.fillText(t, gest.x + 18, gest.y + 4);
    ctx.restore();
  }

  function onDown(e) {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, local(e));
      if (touches.size === 2) { pinchStart(); try { try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur déjà relâché */ } } catch (x) { /* capture refusée */ } return; }
      if (touches.size > 2) return;
    }
    const [sx, sy] = local(e);
    if (e.button === 1 || (e.button === 0 && (space || Tools.current() === 'pan'))) {
      pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur déjà relâché */ }
      cv.classList.add('drag');
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur déjà relâché */ }
      Tools.down(toWorld(sx, sy), e);
    } else if (e.button === 2) {
      gest = { x0: sx, y0: sy, x: sx, y: sy, on: false, id: e.pointerId };
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur déjà relâché */ }
    }
  }

  function onMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) { touches.set(e.pointerId, local(e)); if (pinch && touches.size === 2) { pinchMove(); return; } }
    if (gest && gest.id === e.pointerId) { const [gx, gy] = local(e); gest.x = gx; gest.y = gy; if (Math.hypot(gx - gest.x0, gy - gest.y0) > 24) gest.on = true; requestDraw(); return; }
    const [sx, sy] = local(e);
    const w = toWorld(sx, sy);
    coordsEl.textContent = `x : ${Math.round(w[0])} mm · y : ${Math.round(w[1])} mm`;
    if (pan && pan.id === e.pointerId) {
      state.view.x = pan.vx + (e.clientX - pan.sx);
      state.view.y = pan.vy + (e.clientY - pan.sy);
      requestDraw();
      return;
    }
    Tools.move(w, e, [sx, sy]);
  }

  function onUp(e) {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (pinch) { if (touches.size < 2) pinch = null; return; } }
    if (gest && gest.id === e.pointerId) {
      const g = gest; gest = null;
      if (g.on) { const [cmd, label] = GESTURES[gestureDir(g.x - g.x0, g.y - g.y0)]; if (cmd === 'fit') zoomExtents(); else Tools.setTool(cmd); Status.msg(`Geste : ${label}.`); }
      else Tools.rightClick();
      requestDraw();
      return;
    }
    if (pan && pan.id === e.pointerId) {
      pan = null;
      cv.classList.remove('drag');
      return;
    }
    if (e.button === 0) Tools.up(toWorld(...local(e)), e);
  }

  function onCancel(e) {
    touches.delete(e.pointerId); if (touches.size < 2) pinch = null; gest = null;
    if (pan && pan.id === e.pointerId) { pan = null; cv.classList.remove('drag'); }
    Tools.cancelDrag();
  }

  /* Zoom à la molette maîtrisé (même réglage qu'ARCHIPLAN) : un cran ≈ 4 %, petits mouvements du pavé tactile proportionnels, plafonné. */
  function onWheel(e) {
    e.preventDefault();
    const [sx, sy] = local(e);
    const before = toWorld(sx, sy);
    let dl = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    { const W = (window.PrismSettings?.wheel?.() || {k:1, inv:false}); dl *= W.k * (W.inv ? -1 : 1); }
    if (!dl || !Number.isFinite(dl)) return;
    if (e.ctrlKey) dl *= 2.5;
    const n = Math.max(-1.5, Math.min(1.5, dl / 100));
    // même pas par cran qu'avant (×0,96), mais appliqué en glissement sur ≈ 150 ms autour du curseur : plus de saccade
    wz.pend = Math.max(-1.2, Math.min(1.2, wz.pend + n * Math.log(0.96))); wz.sx = sx; wz.sy = sy;
    if (!wz.raf) { wz.last = 0; wz.raf = requestAnimationFrame(wheelTick); }
  }
  const wz = { pend: 0, sx: 0, sy: 0, raf: 0, last: 0 };
  function wheelTick(now) {
    const dt = Math.min(50, now - (wz.last || now)); wz.last = now;
    if (Math.abs(wz.pend) < 1e-4) { wz.pend = 0; wz.raf = 0; return; }
    const part = Math.abs(wz.pend) < 2e-3 ? wz.pend : wz.pend * (1 - Math.exp(-dt / 55));   /* fin du glissement : on applique le reste, le pas par cran est exact */ wz.pend -= part;
    const before = toWorld(wz.sx, wz.sy);
    state.view.scale = clamp(state.view.scale * Math.exp(part), VIEW_LIMITS.min, VIEW_LIMITS.max);
    state.view.x = wz.sx - before[0] * state.view.scale;
    state.view.y = wz.sy + before[1] * state.view.scale;
    requestDraw(); wz.raf = requestAnimationFrame(wheelTick);
  }

  function init() {
    /* Sans cela, le clic du navigateur reprend le focus et annule aussitôt la saisie de texte ou de longueur. */
    cv.addEventListener('mousedown', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', resize);
    resize();
  }

  return {
    init, draw, requestDraw, toWorld, toScreen, gridStep, zoomExtents, size, css,
    setSpace(v) { space = v; cv.style.cursor = v ? 'grab' : ''; },
  };
})();
