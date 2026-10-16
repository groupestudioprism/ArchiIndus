/* ============ Réglages Studio Prism (module commun ARCHITRAFIC · ARCHIPLAN · ARCHIINDUS) ============
   Petit bouton ⚙ dans la barre du haut et sur l'accueil, à côté du compte. Les réglages d'interface (thème, taille,
   molette, animations) sont partagés entre les apps Studio Prism de cet appareil ; chaque app ajoute ses propres sections
   (qualité graphique, grille, cotes…) par PrismSettings.init({...}). Même fichier copié tel quel dans chaque app. */
const PrismSettings = (() => {
  const KEY = 'prism.ui', DEF = {theme:'', scale:1, wheel:1, inv:false, motion:true};
  let P = {...DEF}; try { P = {...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch(e){}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch(e){} };
  let C = null, dlg = null;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';

  function applyTheme(){ if (!C?.theme) return; if (P.theme === 'auto') C.theme.set(mq.matches ? 'dark' : 'light'); }
  mq.addEventListener?.('change', applyTheme);
  function applyUI(){
    const r = document.documentElement;
    r.style.setProperty('--prism-ui', P.scale); r.classList.toggle('prism-big', P.scale > 1); r.classList.toggle('prism-still', !P.motion);
  }
  function css(){
    if (document.getElementById('prismSetCss')) return;
    const s = document.createElement('style'); s.id = 'prismSetCss';
    s.textContent = `
.prism-gear{display:inline-grid;place-items:center}.prism-gear svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}
.prism-set-bg{position:fixed;inset:0;z-index:9000;background:rgba(10,16,28,.38);display:grid;place-items:center;padding:16px}
.prism-set{width:min(560px,100%);max-height:min(86vh,760px);display:flex;flex-direction:column;background:var(--panel,#fff);color:var(--ink,#141a24);border:1px solid var(--line,#dde3ec);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:14px/1.45 var(--f-body,system-ui,sans-serif);overflow:hidden}
.prism-set header{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--line,#dde3ec)}
.prism-set header h3{margin:0;font:700 18px var(--f-display,inherit);flex:1}.prism-set header small{display:block;color:var(--mut,#6b7686);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.prism-set .x{width:34px;height:34px;border:1px solid var(--line,#dde3ec);border-radius:9px;background:transparent;color:inherit;font-size:18px;cursor:pointer}
.prism-set .bd{overflow:auto;padding:6px 18px 18px}
.prism-set h4{margin:16px 0 6px;font:700 11px var(--f-body,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#6b7686)}
.prism-set .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--line,#dde3ec) 60%,transparent)}
.prism-set .row>span{min-width:0}.prism-set .row>span small{display:block;color:var(--mut,#6b7686);font-size:12px}
.prism-set .seg{display:inline-flex;flex-wrap:wrap;gap:4px;background:color-mix(in srgb,var(--line,#dde3ec) 55%,transparent);padding:3px;border-radius:10px;flex:none}
.prism-set .seg button{border:0;background:transparent;color:inherit;font:600 12.5px var(--f-body,inherit);padding:6px 10px;border-radius:8px;cursor:pointer;min-height:30px}
.prism-set .seg button.on{background:var(--panel,#fff);box-shadow:0 1px 3px rgba(0,0,0,.18);color:var(--accent,#0B57D0)}
.prism-set select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line,#dde3ec);background:var(--panel,#fff);color:inherit}
.prism-set .sw{position:relative;width:42px;height:24px;flex:none}.prism-set .sw input{opacity:0;position:absolute;inset:0;margin:0;cursor:pointer}
.prism-set .sw i{position:absolute;inset:0;border-radius:12px;background:var(--line,#ccd);transition:background .15s}.prism-set .sw i::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}
.prism-set .sw input:checked+i{background:var(--accent,#0B57D0)}.prism-set .sw input:checked+i::after{left:21px}
.prism-set table{width:100%;border-collapse:collapse;font-size:13px}.prism-set td{padding:4px 0;border-bottom:1px solid color-mix(in srgb,var(--line,#dde3ec) 50%,transparent)}
.prism-set kbd{display:inline-block;min-width:22px;text-align:center;font:600 12px ui-monospace,monospace;padding:2px 6px;border:1px solid var(--line,#dde3ec);border-bottom-width:2px;border-radius:6px;background:var(--chip,#f3f5f9)}
.prism-set .btnl{border:1px solid var(--line,#dde3ec);background:transparent;color:inherit;font:600 13px var(--f-body,inherit);padding:7px 12px;border-radius:9px;cursor:pointer}
.prism-set .meta{color:var(--mut,#6b7686);font-size:12px}
html.prism-still *,html.prism-still *::before,html.prism-still *::after{transition-duration:0s!important;animation-duration:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}
@media (max-width:560px){.prism-set .row{flex-direction:column;align-items:flex-start}}
${C?.scaleSel ? `${C.scaleSel}{zoom:var(--prism-ui,1)}` : ''}`;
    document.head.appendChild(s);
  }
  function gearBtns(){
    for (const id of C.anchors || ['userBtn', 'homeUser']){
      const a = document.getElementById(id); if (!a || a.previousElementSibling?.classList.contains('prism-gear')) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ib prism-gear'; b.title = 'Réglages'; b.setAttribute('aria-label', 'Réglages'); b.innerHTML = GEAR;
      b.onclick = e => { e.stopPropagation(); open(); }; a.parentNode.insertBefore(b, a);
    }
  }
  const seg = (k, val, opts) => `<span class="seg" data-k="${k}">${opts.map(([v, n]) => `<button type="button" data-v="${h(v)}" class="${String(val) === String(v) ? 'on' : ''}">${h(n)}</button>`).join('')}</span>`;
  const sw = (k, on) => `<label class="sw"><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}><i></i></label>`;
  const row = (label, sub, ctl) => `<div class="row"><span>${h(label)}${sub ? `<small>${h(sub)}</small>` : ''}</span>${ctl}</div>`;
  function field(f, i, j){
    const k = `f${i}_${j}`, v = f.get();
    if (f.type === 'seg') return row(f.label, f.sub, seg(k, v, f.options));
    if (f.type === 'switch') return row(f.label, f.sub, sw(k, v));
    if (f.type === 'select') return row(f.label, f.sub, `<select data-k="${k}">${f.options.map(([o, n]) => `<option value="${h(o)}"${String(o) === String(v) ? ' selected' : ''}>${h(n)}</option>`).join('')}</select>`);
    return '';
  }
  function render(){
    const cur = P.theme || C.theme?.get?.() || 'light', S = C.sections || [], K = C.shortcuts?.() || [];
    dlg.innerHTML = `<div class="prism-set" role="dialog" aria-modal="true" aria-label="Réglages"><header><div style="flex:1"><small>${h(C.app)}</small><h3>Réglages</h3></div><button class="x" type="button" aria-label="Fermer">×</button></header><div class="bd">
      <h4>Affichage</h4>
      ${C.theme ? row('Thème', P.theme === 'auto' ? 'Suit le réglage de l\'appareil' : '', seg('theme', cur, [['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Auto']])) : ''}
      ${row('Taille de l\'interface', 'Boutons, menus et textes ; la vue 3D n\'est pas agrandie', seg('scale', P.scale, [[1, 'Normale'], [1.15, 'Grande'], [1.3, 'Très grande']]))}
      ${row('Animations', 'Désactiver pour les appareils lents ou par confort', sw('motion', P.motion))}
      <h4>Souris et zoom</h4>
      ${row('Vitesse du zoom à la molette', '', seg('wheel', P.wheel, [[0.6, 'Lente'], [1, 'Normale'], [1.6, 'Rapide']]))}
      ${row('Inverser le sens du zoom', '', sw('inv', P.inv))}
      ${S.map((s, i) => `<h4>${h(s.title)}</h4>${s.fields.map((f, j) => field(f, i, j)).join('')}`).join('')}
      ${K.length ? `<h4>Raccourcis clavier</h4><table>${K.map(([k, n]) => `<tr><td>${k.split('+').map(x => `<kbd>${h(x)}</kbd>`).join(' + ')}</td><td>${h(n)}</td></tr>`).join('')}</table>` : ''}
      <h4>À propos</h4>
      <div class="row"><span>${h(C.app)}<small>Mise à jour du ${h(new Date(document.lastModified).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}))}</small></span>${C.clearCache ? '<button type="button" class="btnl" data-k="cache">Vider le cache local</button>' : ''}</div>
      ${C.clearCache ? `<p class="meta">${h(C.cacheNote || 'Efface les données téléchargées gardées sur cet appareil (elles seront rechargées). Vos projets ne sont pas touchés.')}</p>` : ''}
    </div></div>`;
    dlg.querySelector('.x').onclick = close;
    dlg.querySelectorAll('.seg').forEach(g => g.onclick = e => { const b = e.target.closest('button'); if (!b) return; set(g.dataset.k, b.dataset.v); });
    dlg.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => set(c.dataset.k, c.checked));
    dlg.querySelectorAll('select').forEach(c => c.onchange = () => set(c.dataset.k, c.value));
    const cb = dlg.querySelector('[data-k="cache"]'); if (cb) cb.onclick = async () => { cb.disabled = true; cb.textContent = 'Nettoyage…'; try { await C.clearCache(); cb.textContent = 'Cache vidé ✓'; } catch(e){ cb.textContent = 'Échec'; } };
  }
  function set(k, v){
    if (k === 'theme'){ P.theme = v; save(); if (v === 'auto') applyTheme(); else C.theme.set(v); }
    else if (k === 'scale'){ P.scale = +v; save(); applyUI(); C.onResize?.(); }
    else if (k === 'wheel'){ P.wheel = +v; save(); }
    else if (k === 'inv'){ P.inv = !!v; save(); }
    else if (k === 'motion'){ P.motion = !!v; save(); applyUI(); }
    else { const [i, j] = k.slice(1).split('_').map(Number), f = C.sections[i].fields[j]; f.set(f.type === 'seg' && typeof f.get() === 'number' ? +v : v); }
    render();
  }
  function open(){ if (!dlg){ dlg = document.createElement('div'); dlg.className = 'prism-set-bg'; dlg.onclick = e => { if (e.target === dlg) close(); }; document.body.appendChild(dlg); }
    dlg.hidden = false; render(); document.addEventListener('keydown', esc, true); }
  function close(){ if (dlg) dlg.hidden = true; document.removeEventListener('keydown', esc, true); }
  function esc(e){ if (e.key === 'Escape'){ e.stopPropagation(); close(); } }
  return {
    init(cfg){ C = cfg; css(); applyUI(); applyTheme(); gearBtns(); },
    /* thème choisi ailleurs dans l'app (menu Calques, bouton lune…) : on quitte le mode Auto */
    themeChanged(){ if (P.theme === 'auto'){ P.theme = ''; save(); } },
    wheel:() => ({k:P.wheel || 1, inv:!!P.inv}), open, prefs:() => ({...P})
  };
})();
window.PrismSettings = PrismSettings;
