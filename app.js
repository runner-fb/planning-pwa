/* Beauregard V2 — app.js (socle, Équipe, Créneaux, Concerts, Préparation)
 * Transport = fetch GET JSON, repris de la V1.
 * Queue = file d'actions hors ligne (IndexedDB, point 62 du cahier des charges).
 *
 * Synchronisation : le serveur renvoie un paquet complet au premier appel,
 * puis seulement les éléments modifiés. L'application FUSIONNE ces paquets.
 *
 * Créneaux et Concerts : un seul écouteur de clic, posé sur #pageContent qui
 * existe en permanence. Il n'est jamais posé sur les boutons eux-mêmes :
 * les boutons sont détruits et recréés à chaque render().
 * L'enregistrement ne dépend plus de l'événement submit.
 *
 * SUPPRESSION : une action "remove", jamais un active:false.
 * La ligne est retirée par son id, rien d'autre.
 *
 * PRÉPARATION : quatre blocs dépliables, chacun s'enregistrant seul.
 * Voir renderSetup et saveSetupBloc pour la double nomenclature
 * lecture (bundle) / écriture (feuille CONFIG_EDITION).
 */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s).replace(
      /[&<>"']/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      }
    );
  };

  var ROLE = { benevole: "Bénévole", referent: "Référent", admin: "Organisation", vehicles: "Véhicules" };

  var ICON = {
    Accueil: "\u2302", "Mes créneaux": "\u25A6", Planning: "\u25A4", Contacts: "\u2663",
    Équipe: "\u2659", Véhicules: "\u25B0", Messages: "\u2709", Outils: "\u2699",
    "Préparation": "\u25F7", "Créneaux": "\u25F4", "Concerts": "\u266B",
    Formulaires: "\u25A7", Simulations: "\u27F3", Arbitrages: "\u25C7",
    Rotations: "\u21BB", Contrôles: "\u2713", Validation: "\u25C9", Publication: "\u2197", Terrain: "\u2316"
  };

  var NAV = {
    benevole: [["Accueil", "home"], ["Mes créneaux", "myshifts"], ["Planning", "planning"], ["Contacts", "contacts"]],
    referent: [["Équipe", "team"], ["Créneaux", "creneaux"], ["Planning", "planning"], ["Véhicules", "vehicles"], ["Messages", "messages"], ["Contacts", "contacts"]],
    admin: [
      ["Préparation", "setup"], ["Bénévoles", "team"], ["Concerts", "concerts"],
      ["Véhicules", "vehicles"], ["Messages", "messages"], ["Contacts", "contacts"]
    ],
    vehicles: [["Accueil", "home"], ["Véhicules", "vehicles"]]
  };

  var META = {