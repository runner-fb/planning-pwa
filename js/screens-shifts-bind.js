/* Beauregard V2 — câblage des écrans Créneaux et Concerts.
 *
 * DÉLÉGATION D'ÉVÉNEMENTS : un seul écouteur posé sur #pageContent capte le
 * clic de n'importe quel bouton à l'intérieur — y compris ceux recréés à
 * chaque render(). Un handler posé sur un nœud détruit ne survit pas : c'est
 * ce qui rendait le bouton « Nouveau » inopérant.
 *
 * Ce fichier ne fait que brancher les clics ; les fonctions de rendu vivent
 * toujours dans app.js.
 */
(function (root) {
  "use strict";

  var wired = false;

  /* Marqueurs pris en charge par la délégation. */
  var SELECTOR = [
    "[data-new-shift]",
    "[data-new-concert]",
    "[data-shift]",
    "[data-concert]",
    "[data-shift-remove]",
    "[data-concert-remove]",
    "[data-shift-reset]",
    "[data-concert-reset]",
    "[data-creneaux]",
    "[data-concerts]"
  ].join(",");

  function handler(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var b = target.closest(SELECTOR);
    if (!b) return;
    e.preventDefault();
    if (root.BeauregardShiftAction) root.BeauregardShiftAction(b);
  }

  /* Appelée une fois au démarrage : le conteneur ne change jamais, donc
   * l'écouteur reste valable pour tous les rendus suivants. */
  function wire() {
    if (wired) return;
    var host = document.getElementById("pageContent");
    if (!host) { setTimeout(wire, 120); return; }
    wired = true;
    host.addEventListener("click", handler);
  }

  root.ScreenShiftsBind = { wire: wire };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})(window);
