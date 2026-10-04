/* Beauregard V2 — contrôle final de la chaîne de chargement.
 * Ce script est chargé EN DERNIER, après app.js, avec defer. S'il constate
 * un module absent, c'est qu'un script précédent a échoué.
 */
(function () {
  "use strict";

  function bar() { return document.getElementById("aliveBar"); }
  function say(t, c) {
    var b = bar();
    if (!b) return;
    b.textContent = t;
    if (c) b.style.background = c;
  }

  var want = ["Boot", "Queue", "Transport", "ScreenTeam", "ScreenShifts", "BeauregardShifts"];
  var missing = want.filter(function (n) { return !window[n]; });

  /* Marqueur de passage : si cette ligne n'apparaît pas dans la console,
   * ce script lui-même n'a pas été exécuté. */
  console.log("[BEAUREGARD] chaîne terminée ; absents :", missing.join(", ") || "aucun");
  window.BEAUREGARD_CHAIN = missing.length ? ("absents:" + missing.join(",")) : "ok";

  if (missing.length) say("FIN — ABSENT : " + missing.join(", "), "#9b1c1c");
  else say("FIN — tous les modules sont chargés", "#0f5a4f");

  /* Marque chaque échec de chargement de script, quelle qu'en soit la cause. */
  window.addEventListener("error", function (e) {
    if (e && e.target && e.target.tagName === "SCRIPT") {
      say("SCRIPT EN ERREUR : " + (e.target.src || "?"), "#9b1c1c");
    }
    if (e && e.message) say("ERREUR JS : " + e.message, "#9b1c1c");
  }, true);
})();
