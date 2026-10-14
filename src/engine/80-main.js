/* Point d'entrée. */
document.addEventListener('DOMContentLoaded', () => {
  Tools.init();
  Doc.loadStored();
  UI.init();
  Canvas2D.init();
  if (Doc.get().objects.length) Canvas2D.zoomExtents();
  /* Comme ArchiPlan : sans session, la page de connexion s'affiche d'abord (avec « Continuer sans compte ») ;
     avec une session mémorisée, l'accueil s'affiche pendant que la session est restaurée. */
  if (Account.remembered()) {
    Home.pending();
    Account.restore().then(() => { if (Account.me()) Home.open(); else { Home.close(); Auth.show(); } });
  } else Auth.show();
});
