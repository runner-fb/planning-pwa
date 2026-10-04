/* Beauregard V2 — test de vie.
 * Fichier autonome : aucune dépendance. Il affiche dans la page et dans la
 * console la trace de son exécution. Si tu ne vois RIEN, le fichier n'est
 * pas chargé du tout — et le problème n'est plus dans le code.
 */
(function () {
  "use strict";

  var born = new Date().toISOString();
  window.BEAUREGARD_ALIVE = born;

  function paint(text, color) {
    var bar = document.getElementById("aliveBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "aliveBar";
      bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;" +
        "padding:10px 14px;font:bold 13px system-ui;text-align:center;color:#fff;" +
        "background:" + (color || "#174d43") + ";";
      document.body.appendChild(bar);
    }
    bar.textContent = text;
  }

  paint("TEST DE VIE " + born.slice(11, 19) + " — clique ici", "#174d43");
  console.log("[BEAUREGARD] test de vie chargé à", born);

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "aliveBar") {
      paint("CLIC REÇU " + new Date().toISOString().slice(11, 19), "#0f5a4f");
      console.log("[BEAUREGARD] clic reçu");
    }
  });
})();
