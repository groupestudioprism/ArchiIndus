/* État de l'affichage. Unités du dessin : millimètres. Axe Y vers le haut (convention des plans).
   view.x / view.y : position à l'écran (en pixels CSS) de l'origine du dessin ; view.scale : pixels par millimètre. */
/* préférences de l'appareil (bouton Réglages) : grille et aimantation de base, cotes, qualité d'affichage */
const AI_PREFS = (() => { const d = { base: 10, grid: true, snap: true, ortho: false, dimUnit: 'mm', dimDec: 0, gfx: 'auto' }; try { return { ...d, ...JSON.parse(localStorage.getItem('ai.prefs') || '{}') }; } catch (e) { return d; } })();
const saveAiPrefs = () => { try { localStorage.setItem('ai.prefs', JSON.stringify(AI_PREFS)); } catch (e) { /* stockage indisponible */ } };
const AI_LOWPOW = (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) || /iPad|Android|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const aiDprCap = () => ({ eco: 1, std: 1.5, high: 3 })[AI_PREFS.gfx === 'auto' ? (AI_LOWPOW ? 'eco' : 'high') : AI_PREFS.gfx] || 3;
const state = {
  units: 'mm',
  view: { x: 0, y: 0, scale: 0.1, placed: false },
  snap: { on: AI_PREFS.snap, ortho: AI_PREFS.ortho },
  /* Tracé en réseau : si `on`, les lignes et polylignes ouvertes créées reçoivent {dn, mat} (voir Doc.add). */
  net: { on: false, dn: 100, mat: '' },
  /* Mode de tracé des lignes et polylignes : 'none' | 'net' (réseau) | 'mur' | 'poutre' (attribut st). net.on reste égal à (mode === 'net'). */
  mode: 'none',
  st: { w: { mur: 200, poutre: 150 }, prof: { mur: '', poutre: '' } },
  /* Symbole à poser (outil « Équipements ») : voir SYMBOLS. */
  sym: { k: 'pompe', s: 400, rot: 0, tag: '' },
  /* Esquisse en cours d'édition (id) ; 0 : plan général. */
  sketch: 0,
  /* distance de l'outil Décaler (mm) */
  ofs: 500,
};

const VIEW_LIMITS = { min: 0.002, max: 5 };
