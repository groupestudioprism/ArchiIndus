/* État de l'application. Unités du dessin : millimètres. Axe Y vers le haut (convention des plans).
   view.x / view.y : position à l'écran (en pixels CSS) de l'origine du dessin ; view.scale : pixels par millimètre. */
const state = {
  units: 'mm',
  view: { x: 0, y: 0, scale: 0.1, placed: false },
};

const VIEW_LIMITS = { min: 0.002, max: 5 };
