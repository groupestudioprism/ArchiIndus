/* Point d'entrée. */
document.addEventListener('DOMContentLoaded', () => {
  Tools.init();
  Doc.loadStored();
  UI.init();
  Canvas2D.init();
  if (Doc.get().objects.length) Canvas2D.zoomExtents();
});
