/* Point d'entrée. */
document.addEventListener('DOMContentLoaded', () => {
  $('#theme').addEventListener('click', () => { Theme.toggle(); Canvas2D.draw(); });
  Canvas2D.init();
});
