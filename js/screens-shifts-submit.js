/* Beauregard V2 — gestion des formulaires Créneaux et Concerts.
 *
 * CAUSE DU BUG « Enregistrer me renvoie à l'accueil » : le gestionnaire lisait
 * state.shiftId APRÈS la soumission, alors que cet état est réinitialisé au
 * changement de page. Le code croyait modifier une ligne existante, envoyait
 * un objet vide, et le rendu retombait ailleurs.
 *
 * CORRECTION : l'identifiant de création vit DANS le formulaire
 * (`data-mode="new"` et `data-id`), pas dans l'état global. Un seul écouteur
 * de soumission, en phase de capture, pour les deux formulaires.
 */
(function (root) {
  "use strict";

  function notice(msg, type) {
    var n = document.getElementById("appNotice");
    if (!n) return;
    n.textContent = msg;
    n.classList.remove("hidden");
    n.dataset.type = type || "info";
    clearTimeout(notice.t);
    notice.t = setTimeout(function () { n.classList.add("hidden"); }, 6500);
  }

  function onSubmit(e) {
    var f = e.target;
    if (!f || !f.id) return;
    if (f.id !== "shiftForm" && f.id !== "concertForm") return;

    e.preventDefault();
    e.stopPropagation();

    var S = root.ScreenShifts;
    var api = root.BeauregardStore;
    if (!S || !api) { notice("Module indisponible : recharge la page.", "error"); return; }

    /* Le mode vient du formulaire lui-même, pas d'un état global volatil. */
    var isNew = f.getAttribute("data-mode") === "new";
    var currentId = f.getAttribute("data-id") || "";

    if (f.id === "shiftForm") {
      var row = S.readShift(f);
      if (!row.id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
      if (!row.start || !row.end) { notice("Horaires obligatoires.", "error"); return; }
      row.name = S.slotLabel(row.start, row.end, row.id);

      var existing = api.find("shifts", row.id);
      if (isNew && existing) { notice("Cet identifiant existe déjà.", "error"); return; }
      api.saveShift(row, isNew ? null : api.find("shifts", currentId));
      return;
    }

    var con = S.readConcert(f);
    if (!con.artist) { notice("Artiste obligatoire.", "error"); return; }
    if (!con.start || !con.end) { notice("Horaires obligatoires.", "error"); return; }
    api.saveConcert(con, isNew ? null : api.find("concerts", currentId));
  }

  function wire() {
    if (wire.done) return;
    wire.done = true;
    /* Phase de capture : ce gestionnaire passe avant tout autre écouteur. */
    document.addEventListener("submit", onSubmit, true);
  }

  root.ScreenShiftsSubmit = { wire: wire };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(window);
