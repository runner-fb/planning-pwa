/* Beauregard V2 — diagnostic.
 * Affiche à l'écran ce qui se charge et ce qui échoue, sur la barre posée
 * par js/alive.js. Aucune dépendance : ce fichier ne fait que constater.
 */
(function () {
  "use strict";

  function bar() { return document.getElementById("aliveBar"); }
  function say(text, color) {
    var b = bar();
    if (!b) return;
    b.textContent = text;
    if (color) b.style.background = color;
  }

  var modules = ["ScreenTeam", "ScreenShifts", "BeauregardShifts", "Transport", "Queue", "Boot"];
  var missing = modules.filter(function (m) { return !window[m]; });

  setTimeout(function () {
    if (missing.length) {
      say("MANQUANT : " + missing.join(", "), "#9b1c1c");
      console.log("[BEAUREGARD] modules absents :", missing);
      return;
    }
    say("tous les modules chargés", "#0f5a4f");
    console.log("[BEAUREGARD] tous les modules sont chargés");
  }, 1200);

  /* Trace chaque clic sur un bouton d'action, pour voir s'il est capté. */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest("button");
    if (!b) return;
    var marks = [];
    if (b.dataset.newShift !== undefined) marks.push("new-shift");
    if (b.dataset.newConcert !== undefined) marks.push("new-concert");
    if (b.dataset.shift) marks.push("shift=" + b.dataset.shift);
    if (b.dataset.concert) marks.push("concert=" + b.dataset.concert);
    if (b.classList.contains("primary")) marks.push("primary");
    if (marks.length) say("CLIC : " + marks.join(" / "), "#a16207");
  }, true);
})();
