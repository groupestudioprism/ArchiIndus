/* État de l'affichage. Unités du dessin : millimètres. Axe Y vers le haut (convention des plans).
   view.x / view.y : position à l'écran (en pixels CSS) de l'origine du dessin ; view.scale : pixels par millimètre. */
const state = {
  units: 'mm',
  view: { x: 0, y: 0, scale: 0.1, placed: false },
  snap: { on: true, ortho: false },
  /* Tracé en réseau : si `on`, les lignes et polylignes ouvertes créées reçoivent {dn, mat} (voir Doc.add). */
  net: { on: false, dn: 100, mat: '' },
  /* Mode de tracé des lignes et polylignes : 'none' | 'net' (réseau) | 'mur' | 'poutre' (attribut st). net.on reste égal à (mode === 'net'). */
  mode: 'none',
  st: { w: { mur: 200, poutre: 150 }, prof: { mur: '', poutre: '' } },
  /* Symbole à poser (outil « Équipements ») : voir SYMBOLS. */
  sym: { k: 'pompe', s: 400, rot: 0, tag: '' },
  /* Esquisse en cours d'édition (id) ; 0 : plan général. */
  sketch: 0,
};

const VIEW_LIMITS = { min: 0.002, max: 5 };
