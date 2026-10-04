/* Beauregard V2 — bootstrap de l'écran de premier chargement.
 * Reprend le principe de la V1 : progression lisible pendant que les données
 * nécessaires au fonctionnement hors ligne sont téléchargées.
 * Aucune dépendance : ce script s'exécute avant app.js.
 */
(function (root) {
  "use strict";

  var STEPS = ["Édition", "Planning", "Équipe", "Concerts", "Notifications", "Finalisation"];
  var MESSAGES = [
    "Préparation de ton espace…",
    "Chargement de l'édition…",
    "Téléchargement du planning…",
    "Chargement de l'équipe…",
    "Récupération des concerts…",
    "Préparation des notifications…",
    "Finalisation…"
  ];

  var timer = null;

  function el(id) { return document.getElementById(id); }

  function setStep(index) {
    var steps = el("bootSteps");
    if (steps) {
      var items = steps.querySelectorAll("li");
      for (var i = 0; i < items.length; i++) {
        items[i].setAttribute("data-done", i <= index ? "true" : "false");
      }
    }
    var note = el("bootNote");
    if (note && MESSAGES[index + 1]) note.textContent = MESSAGES[index + 1];
    var bar = el("bootBar");
    if (bar) bar.style.width = Math.round(((index + 1) / STEPS.length) * 100) + "%";
  }

  root.Boot = {
    /* Appelé quand la synchronisation démarre réellement. */
    start: function () {
      var i = 0;
      setStep(0);
      clearInterval(timer);
      timer = setInterval(function () {
        i = Math.min(i + 1, STEPS.length - 1);
        setStep(i);
      }, 1400);
    },
    /* Appelé quand l'application peut s'ouvrir. */
    done: function () {
      clearInterval(timer);
      var title = el("bootTitle");
      var note = el("bootNote");
      if (title) title.textContent = "Données disponibles hors ligne";
      if (note) note.textContent = "Ouverture de l'application…";
      var bar = el("bootBar");
      if (bar) bar.style.width = "100%";
      setTimeout(function () {
        var boot = el("bootScreen");
        if (boot) boot.classList.add("hidden");
      }, 550);
    },
    /* Appelé si le premier chargement échoue : on laisse l'utilisateur entrer. */
    fail: function (message) {
      clearInterval(timer);
      var title = el("bootTitle");
      var note = el("bootNote");
      if (title) title.textContent = "Chargement incomplet";
      if (note) note.textContent = message || "Tu peux continuer : les données seront complétées à la prochaine connexion.";
      var boot = el("bootScreen");
      setTimeout(function () {
        if (boot) boot.classList.add("hidden");
        var login = el("loginScreen");
        if (login) login.classList.remove("hidden");
      }, 900);
    },
    /* Écran affiché quand une session locale existe déjà. */
    skip: function () {
      var boot = el("bootScreen");
      if (boot) boot.classList.add("hidden");
    },
    showLogin: function () {
      var login = el("loginScreen");
      if (login) login.classList.remove("hidden");
    }
  };
})(window);
