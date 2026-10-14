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

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const size = () => ({ w: cv.width / dpr, h: cv.height / dpr });
  const toWorld = (sx, sy) => [(sx - state.view.x) / state.view.scale, (state.view.y - sy) / state.view.scale];
  const toScreen = (p) => [p[0] * state.view.scale + state.view.x, state.view.y - p[1] * state.view.scale];
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  /* Pas de la grille fine (mm) : 10 mm, multiplié par 10 tant qu'il serait inférieur à 10 pixels. */
  function gridStep() {
    let step = 10;
    while (step * state.view.scale < 10) step *= 10;
    return step;
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
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
    gridLines(step, css('--grid-minor'), w, h);
    gridLines(step * 10, css('--grid-major'), w, h);

    ctx.strokeStyle = css('--accent');
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(vy) + 0.5); ctx.lineTo(w, Math.round(vy) + 0.5);
    ctx.moveTo(Math.round(vx) + 0.5, 0); ctx.lineTo(Math.round(vx) + 0.5, h);
    ctx.stroke();
    ctx.globalAlpha = 1;

    Render.scene(ctx, w, h);
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

  function onDown(e) {
    const [sx, sy] = local(e);
    if (e.button === 1 || (e.button === 0 && (space || Tools.current() === 'pan'))) {
      pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('drag');
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      cv.setPointerCapture(e.pointerId);
      Tools.down(toWorld(sx, sy), e);
    } else if (e.button === 2) {
      Tools.rightClick();
    }
  }

  function onMove(e) {
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
    if (pan && pan.id === e.pointerId) {
      pan = null;
      cv.classList.remove('drag');
      return;
    }
    if (e.button === 0) Tools.up(toWorld(...local(e)), e);
  }

  function onCancel(e) {
    if (pan && pan.id === e.pointerId) { pan = null; cv.classList.remove('drag'); }
    Tools.cancelDrag();
  }

  function onWheel(e) {
    e.preventDefault();
    const [sx, sy] = local(e);
    const before = toWorld(sx, sy);
    const f = Math.exp(-e.deltaY * 0.0015);
    state.view.scale = clamp(state.view.scale * f, VIEW_LIMITS.min, VIEW_LIMITS.max);
    state.view.x = sx - before[0] * state.view.scale;
    state.view.y = sy + before[1] * state.view.scale;
    requestDraw();
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
