/* Canevas 2D de base : grille adaptative, axes, déplacement (glisser) et zoom (molette) centré sur le curseur.
   Aucun objet de dessin n'existe encore : seule la zone de travail est en place. */
const Canvas2D = (() => {
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const coordsEl = $('#coords');
  const zoomEl = $('#zoom');
  let dpr = 1;
  let drag = null;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const size = () => ({ w: cv.width / dpr, h: cv.height / dpr });

  /* écran (pixels CSS dans le canevas) -> dessin (mm) */
  const toWorld = (sx, sy) => ({
    x: (sx - state.view.x) / state.view.scale,
    y: (state.view.y - sy) / state.view.scale,
  });

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
    ctx.fillStyle = css('--vp');
    ctx.fillRect(0, 0, w, h);

    let step = 10; /* mm : pas de la grille fine, multiplié par 10 tant qu'il serait trop serré */
    while (step * s < 10) step *= 10;
    gridLines(step, css('--grid-minor'), w, h);
    gridLines(step * 10, css('--grid-major'), w, h);

    ctx.strokeStyle = css('--accent');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(vy) + 0.5); ctx.lineTo(w, Math.round(vy) + 0.5);
    ctx.moveTo(Math.round(vx) + 0.5, 0); ctx.lineTo(Math.round(vx) + 0.5, h);
    ctx.stroke();

    zoomEl.textContent = `1 m = ${Math.round(1000 * s)} px`;
  }

  function onDown(e) {
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('drag');
  }

  function onMove(e) {
    const r = cv.getBoundingClientRect();
    const p = toWorld(e.clientX - r.left, e.clientY - r.top);
    coordsEl.textContent = `x : ${Math.round(p.x)} mm · y : ${Math.round(p.y)} mm`;
    if (drag && drag.id === e.pointerId) {
      state.view.x = drag.vx + (e.clientX - drag.sx);
      state.view.y = drag.vy + (e.clientY - drag.sy);
      draw();
    }
  }

  function onUp(e) {
    if (drag && drag.id === e.pointerId) {
      drag = null;
      cv.classList.remove('drag');
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const before = toWorld(sx, sy);
    const f = Math.exp(-e.deltaY * 0.0015);
    state.view.scale = Math.min(VIEW_LIMITS.max, Math.max(VIEW_LIMITS.min, state.view.scale * f));
    state.view.x = sx - before.x * state.view.scale;
    state.view.y = sy + before.y * state.view.scale;
    draw();
  }

  function init() {
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', resize);
    resize();
  }

  return { init, draw, toWorld };
})();
