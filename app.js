/* Beauregard V2 — app.js (socle, Équipe, Créneaux, Concerts)
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
    referent: [["Accueil", "home"], ["Équipe", "team"], ["Véhicules", "vehicles"], ["Planning", "planning"], ["Messages", "messages"], ["Contacts", "contacts"], ["Outils", "tools"]],
    admin: [
      ["Équipe", "team"], ["Préparation", "setup"], ["Créneaux", "creneaux"], ["Concerts", "concerts"],
      ["Formulaires", "forms"], ["Simulations", "simulations"], ["Planning", "planning"],
      ["Arbitrages", "arbitrations"], ["Rotations", "rotations"], ["Contrôles", "checks"],
      ["Validation", "validation"], ["Publication", "publication"], ["Terrain", "terrain"],
      ["Véhicules", "vehicles"], ["Messages", "messages"], ["Contacts", "contacts"]
    ],
    vehicles: [["Accueil", "home"], ["Véhicules", "vehicles"]]
  };

  var META = {
    home: ["MON FESTIVAL", "Accueil", "L'essentiel de ton engagement, disponible hors ligne."],
    myshifts: ["MON ENGAGEMENT", "Mes créneaux", "Tes missions, tes rôles et tes horaires."],
    planning: ["ORGANISATION", "Planning général", "Les affectations publiées, sans donnée privée."],
    contacts: ["CARNET D'ÉQUIPE", "Contacts", "Les personnes utiles pendant le festival."],
    team: ["ÉQUIPE", "Bénévoles", "Fiches, contraintes et accès de l'édition."],
    vehicles: ["LOGISTIQUE", "Véhicules", "Parc, états des lieux et incidents."],
    messages: ["INFORMATIONS", "Messages", "Consignes et actualités de l'équipe."],
    tools: ["ESPACE RÉFÉRENT", "Outils", "Accès aux modules de suivi."],
    setup: ["CYCLE DE L'ÉDITION", "Préparation", "Paramètres et progression de l'édition."],
    creneaux: ["CYCLE DE L'ÉDITION", "Créneaux & missions", "Horaires, effectifs et journées de l'édition."],
    concerts: ["PROGRAMMATION", "Concerts", "Artistes, scènes et horaires de passage."],
    forms: ["INSCRIPTIONS", "Formulaires", "Ouverture et suivi des disponibilités."],
    simulations: ["AFFECTATIONS", "Simulations", "Construire puis comparer les propositions."],
    arbitrations: ["DÉCISIONS", "Arbitrages", "Traiter les points à décider."],
    rotations: ["ÉQUILIBRE", "Rotations", "Répartition Conducteur / Chargeur."],
    checks: ["QUALITÉ", "Contrôles", "Repérer et résoudre les anomalies."],
    validation: ["AVANT PUBLICATION", "Validation", "Dernières vérifications du planning."],
    publication: ["MISE EN LIGNE", "Publication", "Publier la version retenue."],
    terrain: ["PENDANT LE FESTIVAL", "Suivi terrain", "Créneaux et changements sur place."]
  };

  var COLLECTIONS = [
    "people", "access", "shifts", "missions", "concerts", "forms", "simulations",
    "assignments", "rotations", "arbitrations", "terrain", "vehicles",
    "receptions", "incidents", "messages", "reads", "publications",
    "conflicts", "amendments", "deliveries"
  ];

  var state = {
    user: null, role: "", data: null, page: "home", version: 0, pending: 0,
    personId: "", shiftMode: "", shiftId: "", concertMode: "", concertId: ""
  };
  var CACHE_KEY = "planning_v2_bundle";
  var BOOT = window.Boot || null;

  function bootDone() { if (BOOT && BOOT.done) BOOT.done(); else hideBoot(); }
  function bootFail(m) { if (BOOT && BOOT.fail) BOOT.fail(m); else { hideBoot(); showLogin(); } }
  function bootSkip() { if (BOOT && BOOT.skip) BOOT.skip(); else hideBoot(); }
  function hideBoot() { var b = $("#bootScreen"); if (b) b.classList.add("hidden"); }
  function showLogin() { var l = $("#loginScreen"); if (l) l.classList.remove("hidden"); }

  function saveLocal() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), version: state.version, role: state.role, data: state.data }));
    } catch (e) {}
  }
  function readLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return raw && raw.data ? raw : null;
    } catch (e) { return null; }
  }

  var keyOf = function (k, row) {
    if (!row) return "";
    return k === "access" ? row.personId : row.id;
  };

  function mergeBundle(bundle) {
    if (!bundle) return state.data || {};
    var current = state.data || {};

    if (bundle.full === true || !current.config) {
      var fresh = { config: bundle.config || current.config || {}, user: bundle.user || current.user || {} };
      COLLECTIONS.forEach(function (k) { fresh[k] = bundle[k] || []; });
      return fresh;
    }

    var next = { config: bundle.config || current.config, user: bundle.user || current.user };
    COLLECTIONS.forEach(function (k) {
      var received = bundle[k];
      var hasIds = bundle.ids && Object.prototype.hasOwnProperty.call(bundle.ids, k);
      if (received === undefined && !hasIds) { next[k] = current[k] || []; return; }

      var byKey = {};
      (current[k] || []).forEach(function (row) { var id = keyOf(k, row); if (id) byKey[id] = row; });
      (received || []).forEach(function (row) { var id = keyOf(k, row); if (id) byKey[id] = row; });
      if (hasIds) {
        var keep = {};
        (bundle.ids[k] || []).forEach(function (id) { if (byKey[id]) keep[id] = byKey[id]; });
        byKey = keep;
      }
      next[k] = Object.keys(byKey).map(function (id) { return byKey[id]; });
    });
    return next;
  }

  function notice(msg, type) {
    var n = $("#appNotice");
    if (!n) return;
    n.textContent = msg;
    n.classList.remove("hidden");
    n.dataset.type = type || "info";
    clearTimeout(notice.t);
    notice.t = setTimeout(function () { n.classList.add("hidden"); }, 6500);
  }

  function syncBadge() {
    var el = $("#connectionText");
    if (!el) return;
    var text, kind;
    if (!navigator.onLine) {
      text = state.pending ? "Hors ligne · " + state.pending + " modification(s) en attente" : "Hors ligne · données disponibles";
      kind = "offline";
    } else if (state.pending) {
      text = state.pending + " modification(s) en attente";
      kind = "busy";
    } else {
      text = "En ligne · à jour";
      kind = "ok";
    }
    el.textContent = text;
    if (el.parentElement) el.parentElement.dataset.kind = kind;
  }

  function refreshPending() {
    if (!window.Queue) return Promise.resolve(0);
    return Queue.count().then(function (n) { state.pending = n; syncBadge(); return n; }).catch(function () { return 0; });
  }

  function setTitle() {
    var m = META[state.page] || META.home;
    $("#pageEyebrow").textContent = m[0];
    $("#pageTitle").textContent = m[1];
    $("#pageSubtitle").textContent = m[2];
    $("#pageCrumb").textContent = m[1];
    document.title = m[1] + " — Beauregard";
  }

  function nav() {
    var items = NAV[state.role] || NAV.benevole;
    var make = function (it) {
      return '<button class="nav-link ' + (state.page === it[1] ? "active" : "") +
        '" data-page="' + it[1] + '"><span class="nav-icon">' + (ICON[it[0]] || "•") +
        "</span><span>" + esc(it[0]) + "</span></button>";
    };
    var primary = items.slice(0, 4);
    var extra = items.slice(4);
    var dn = $("#desktopNav");
    if (dn) dn.innerHTML = items.map(make).join("");
    var mn = $("#mobileNav");
    if (mn) {
      mn.innerHTML = primary.map(make).join("") +
        (extra.length ? '<button class="nav-more" id="navMore" aria-expanded="false" aria-label="Plus de fonctions">' +
          '<span class="nav-icon">\u203A</span><span>Plus</span></button>' : "");
      var more = $("#navMore");
      if (more) more.onclick = toggleMore;
    }
    wireNav();
  }

  function toggleMore() {
    var items = (NAV[state.role] || NAV.benevole).slice(4);
    var more = $("#navMore");
    if (!more) return;
    var open = more.getAttribute("aria-expanded") === "true";
    var existing = $("#navDrawer");
    if (existing) existing.remove();
    if (open) { more.setAttribute("aria-expanded", "false"); return; }
    var drawer = document.createElement("div");
    drawer.id = "navDrawer";
    drawer.className = "nav-drawer";
    drawer.innerHTML = items.map(function (it) {
      return '<button class="nav-drawer-link" data-page="' + it[1] + '"><span class="nav-icon">' +
        (ICON[it[0]] || "•") + "</span><span>" + esc(it[0]) + "</span></button>";
    }).join("");
    $("#appShell").appendChild(drawer);
    more.setAttribute("aria-expanded", "true");
    wireNav();
  }

  function wireNav() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-page]"), function (b) {
      b.onclick = function () { go(b.dataset.page); };
    });
  }

  function go(key) {
    var drawer = $("#navDrawer");
    if (drawer) drawer.remove();
    var more = $("#navMore");
    if (more) more.setAttribute("aria-expanded", "false");
    state.page = key;
    if (key !== "team") state.personId = "";
    if (key !== "creneaux") { state.shiftMode = ""; state.shiftId = ""; }
    if (key !== "concerts") { state.concertMode = ""; state.concertId = ""; }
    nav();
    setTitle();
    render();
  }

  function card(title, body) {
    return '<article class="card"><h2>' + esc(title) + "</h2>" + body + "</article>";
  }
  function empty(title, text) {
    return '<div class="empty"><b>' + esc(title) + "</b>" + esc(text) + "</div>";
  }
  function listRow(main, sub, badge, kind) {
    return '<div class="list-row"><div class="list-main"><b>' + esc(main) + "</b>" +
      (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" +
      (badge ? '<span class="badge ' + (kind || "") + '">' + esc(badge) + "</span>" : "") + "</div>";
  }
  function personLabel(id) {
    var p = ((state.data && state.data.people) || []).filter(function (x) { return x.id === id; })[0];
    return p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "—";
  }
  function shift(id) {
    return ((state.data && state.data.shifts) || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  function render() {
    var c = $("#pageContent");
    if (!c) return;
    var d = state.data || {};
    var p = state.page;
    if (p === "home") return renderHome(c, d);
    if (p === "team") return renderTeam(c, d);
    if (p === "creneaux") return renderCreneaux(c, d);
    if (p === "concerts") return renderConcerts(c, d);
    if (p === "myshifts") return renderMyShifts(c, d);
    if (p === "planning") return renderPlanning(c, d);
    if (p === "contacts") return renderContacts(c, d);
    if (p === "messages") return renderMessages(c, d);
    if (p === "vehicles") return renderVehicles(c, d);
    if (p === "setup") return renderSetup(c, d);
    c.innerHTML = empty("Module en préparation", "Cet écran sera branché à l'étape suivante.");
  }

  /* ---------- Équipe ---------- */
  function renderTeam(c, d) {
    var T = window.ScreenTeam;
    if (!T) { c.innerHTML = empty("Écran indisponible", "Le module Équipe n'est pas chargé."); return; }
    c.innerHTML = state.personId ? T.sheet({ data: d }, state.personId) : T.list({ data: d });
    wireTeam();
  }

  function wireTeam() {
    var T = window.ScreenTeam;
    if (!T) return;

    var search = $("#teamSearch");
    if (search) {
      search.oninput = function () {
        T.setFilter(search.value);
        var c = $("#pageContent");
        c.innerHTML = T.list({ data: state.data || {} });
        wireTeam();
        var again = $("#teamSearch");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      };
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-person]"), function (b) {
      b.onclick = function () {
        state.personId = String(b.dataset.person || "");
        render();
      };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-team]"), function (b) {
      b.onclick = function () {
        var act = b.dataset.team;
        if (act === "back") { state.personId = ""; render(); return; }
        if (act === "new") { openPersonForm(); return; }
        if (act === "remove") { removePerson(); return; }
        if (act === "access-one") { createAccessOne(b.dataset.id || state.personId); return; }
        if (act === "access") { createAccessBatch(); return; }
        if (act === "copy") { copyCodes(b.dataset.payload || ""); return; }
      };
    });

    var form = $("#personForm");
    if (form) {
      form.onsubmit = function (e) { e.preventDefault(); savePerson(form); };
    }
  }

  function openPersonForm() {
    var c = $("#pageContent");
    c.innerHTML = window.ScreenTeam.blank();
    state.personId = "";
    wireTeam();
  }

  function savePerson(form) {
    var data = window.ScreenTeam.readForm(form);
    if (!data.lastName || !data.firstName) { notice("Nom et prénom obligatoires.", "error"); return; }

    var row = data, base = null, baseVersion = 0;
    if (state.personId) {
      var old = (state.data.people || []).filter(function (x) { return x.id === state.personId; })[0];
      if (old) {
        row = Object.assign({}, old, data);
        row.id = old.id;
        base = old;
        baseVersion = old.version || 0;
      }
    } else {
      row.id = "p-" + Transport.requestId().slice(0, 8);
    }

    sendSave("people", row, baseVersion, base)
      .then(function () {
        notice("Fiche enregistrée.", "success");
        state.data.people = (state.data.people || []).filter(function (x) { return x.id !== row.id; }).concat([row]);
        saveLocal();
        state.personId = row.id;
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function removePerson() {
    var id = state.personId;
    if (!id) return;
    var p = (state.data.people || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!window.confirm("Supprimer la fiche de " + personLabel(id) + " ?\nLa personne sera retirée de la base active.")) return;
    var row = Object.assign({}, p, { deleted: true });
    sendSave("people", row, p.version || 0, p)
      .then(function () {
        state.data.people = (state.data.people || []).filter(function (x) { return x.id !== id; });
        saveLocal();
        state.personId = "";
        notice("Fiche supprimée.", "success");
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function accessRow(personId, code, alreadyShown) {
    var p = (state.data.people || []).filter(function (x) { return x.id === personId; })[0];
    if (!p) return { nom: personId, prenom: "(fiche locale inconnue)", code: code || "", alreadyShown: !!alreadyShown };
    return { nom: p.lastName, prenom: p.firstName, code: code || "", alreadyShown: !!alreadyShown };
  }

  function createAccessOne(id) {
    var target = String(id || state.personId || "");
    if (!target) { notice("Aucune fiche sélectionnée.", "error"); return; }

    Transport.mutate("access", { personId: target })
      .then(function (out) {
        var pid = (out && out.personId) || target;
        var code = (out && out.code) || "";
        var shown = !!(out && out.codeAlreadyShown);
        var c = $("#pageContent");
        c.innerHTML = window.ScreenTeam.accessResult([accessRow(pid, code, shown)]);
        wireTeam();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function createAccessBatch() {
    var people = (state.data.people || []).filter(function (p) { return !p.deleted && p.status !== "Désisté"; });
    if (!people.length) { notice("Aucune personne active.", "error"); return; }
    if (!window.confirm("Créer les accès pour " + people.length + " personne(s) ?\nLes codes existants seront remplacés.")) return;

    var rows = [];
    var chain = Promise.resolve();
    people.forEach(function (p) {
      chain = chain.then(function () {
        return Transport.mutate("access", { personId: p.id }).then(function (out) {
          var pid = (out && out.personId) || p.id;
          rows.push(accessRow(pid, (out && out.code) || "", !!(out && out.codeAlreadyShown)));
        }).catch(function () {});
      });
    });
    chain.then(function () {
      var c = $("#pageContent");
      c.innerHTML = window.ScreenTeam.accessResult(rows);
      wireTeam();
    });
  }

  function copyCodes(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { notice("Liste copiée.", "success"); },
        function () { notice("Copie impossible sur cet appareil.", "error"); }
      );
    } else {
      notice("Copie impossible sur cet appareil.", "error");
    }
  }

  /* ---------- Créneaux ---------- */
  function renderCreneaux(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Créneaux n'est pas chargé."); return; }
    if (!state.shiftMode) { c.innerHTML = S.shifts({ data: d }); return; }
    c.innerHTML = S.shiftForm({ data: d }, state.shiftMode, state.shiftId);
  }

  /* ---------- Concerts ---------- */
  function renderConcerts(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Concerts n'est pas chargé."); return; }
    if (!state.concertMode) { c.innerHTML = S.concerts({ data: d }); return; }
    c.innerHTML = S.concertForm({ data: d }, state.concertMode, state.concertId);
  }

  /* ---------- Action déléguée des créneaux et concerts ---------- */
  function scenesAction(b) {
    if (b.dataset.creneaux !== undefined) { state.shiftMode = ""; state.shiftId = ""; render(); return; }
    if (b.dataset.concerts !== undefined) { state.concertMode = ""; state.concertId = ""; render(); return; }
    if (b.dataset.newShift !== undefined) { state.shiftMode = "new"; state.shiftId = ""; render(); return; }
    if (b.dataset.newConcert !== undefined) { state.concertMode = "new"; state.concertId = ""; render(); return; }
    if (b.dataset.shift) { state.shiftMode = "edit"; state.shiftId = String(b.dataset.shift); render(); return; }
    if (b.dataset.concert) { state.concertMode = "edit"; state.concertId = String(b.dataset.concert); render(); return; }
    if (b.dataset.shiftReset !== undefined || b.dataset.concertReset !== undefined) {
      notice("Champs rechargés depuis les données enregistrées.", "info");
      render();
      return;
    }
    if (b.dataset.shiftRemove !== undefined) { removeShift(); return; }
    if (b.dataset.concertRemove !== undefined) { removeConcert(); return; }
  }

  function removeShift() {
    var s = (state.data.shifts || []).filter(function (x) { return x.id === state.shiftId; })[0];
    if (!s) return;
    if (!window.confirm("Supprimer le créneau " + (s.name || s.id) + " ?")) return;
    var row = Object.assign({}, s, { deleted: true, active: false });
    sendSave("shifts", row, s.version || 0, s).then(function () {
      state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== s.id; });
      saveLocal();
      state.shiftMode = "";
      state.shiftId = "";
      notice("Créneau supprimé.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function removeConcert() {
    var k = (state.data.concerts || []).filter(function (x) { return x.id === state.concertId; })[0];
    if (!k) return;
    if (!window.confirm("Supprimer le concert " + (k.artist || k.id) + " ?")) return;
    var row = Object.assign({}, k, { deleted: true, active: false });
    sendSave("concerts", row, k.version || 0, k).then(function () {
      state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== k.id; });
      saveLocal();
      state.concertMode = "";
      state.concertId = "";
      notice("Concert supprimé.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function saveShift(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    full.version = old ? old.version || 0 : 0;
    sendSave("shifts", full, old ? old.version || 0 : 0, old).then(function () {
      state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== full.id; }).concat([full]);
      saveLocal();
      state.shiftMode = "";
      state.shiftId = "";
      notice("Créneau " + full.id + " enregistré.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function saveConcert(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    if (!full.id) full.id = "co-" + Transport.requestId().slice(0, 8);
    full.version = old ? old.version || 0 : 0;
    sendSave("concerts", full, old ? old.version || 0 : 0, old).then(function () {
      state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== full.id; }).concat([full]);
      saveLocal();
      state.concertMode = "";
      state.concertId = "";
      notice("Concert enregistré.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  /* ---------- Écouteur unique des créneaux et concerts ----------
   * Un seul écouteur, posé sur #pageContent qui existe en permanence.
   * Il n'est jamais posé sur un bouton : les boutons sont recréés à
   * chaque render(), un gestionnaire posé dessus ne survivrait pas.
   * L'enregistrement ne dépend pas de l'événement submit. */

  var SELECTEUR_ACTIONS = [
    "[data-creneaux]", "[data-concerts]",
    "[data-new-shift]", "[data-new-concert]",
    "[data-shift]", "[data-concert]",
    "[data-shift-reset]", "[data-concert-reset]",
    "[data-shift-remove]", "[data-concert-remove]",
    "[data-save-shift]", "[data-save-concert]"
  ].join(",");

  function actionsListener(e) {
    var b = e.target && e.target.closest ? e.target.closest(SELECTEUR_ACTIONS) : null;
    if (!b) return;
    var host = document.getElementById("pageContent");
    if (host && !host.contains(b)) return;
    e.preventDefault();

    if (b.dataset.saveShift !== undefined) { handleShiftSave(); return; }
    if (b.dataset.saveConcert !== undefined) { handleConcertSave(); return; }
    scenesAction(b);
  }

  function wirePageContent() {
    var host = document.getElementById("pageContent");
    if (!host) return;
    if (host.dataset.wired === "1") return;
    host.dataset.wired = "1";
    host.addEventListener("click", actionsListener);
  }

  /* Enregistrement d'un créneau : le mode est lu DANS le formulaire. */
  function handleShiftSave() {
    var f = document.getElementById("shiftForm");
    var S = window.ScreenShifts;
    if (!f || !S) { notice("Formulaire Créneaux indisponible.", "error"); return; }

    var row = S.readShift(f, { data: state.data });
    if (!row.id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
    if (!row.date) { notice("La date est obligatoire : elle definit le jour et l'ordre du creneau.", "error"); return; }
    if (!row.start || !row.end) { notice("Horaires obligatoires.", "error"); return; }
    row.name = S.slotLabel(row.start, row.end, row.id);

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var existant = (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
    if (isNew && existant) { notice("Cet identifiant existe déjà.", "error"); return; }

    var old = isNew ? null : (state.data.shifts || []).filter(function (x) { return x.id === current; })[0];
    saveShift(row, old);
  }

  /* Enregistrement d'un concert : même principe. */
  function handleConcertSave() {
    var f = document.getElementById("concertForm");
    var S = window.ScreenShifts;
    if (!f || !S) { notice("Formulaire Concerts indisponible.", "error"); return; }

    var con = S.readConcert(f);
    if (!con.artist) { notice("Artiste obligatoire.", "error"); return; }
    if (!con.start || !con.end) { notice("Horaires obligatoires.", "error"); return; }

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var old = isNew ? null : (state.data.concerts || []).filter(function (x) { return x.id === current; })[0];
    saveConcert(con, old);
  }

  /* Installation de l'écouteur, une seule fois, dès que #pageContent existe. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePageContent);
  } else {
    wirePageContent();
  }

  /* ---------- Préparation ---------- */
  function renderSetup(c, d) {
    var cfg = d.config || {};
    var n = function (k) { return (d[k] || []).filter(function (x) { return !x.deleted; }).length; };
    var withCode = (d.access || []).filter(function (a) { return a.hasCode; }).length;
    var blocks = [
      ["Équipe", n("people") + " fiche(s)"],
      ["Créneaux", n("shifts") + " créneau(x)"],
      ["Concerts", n("concerts") + " concert(s)"],
      ["Missions", n("missions") + " mission(s)"],
      ["Véhicules prévus", cfg.vehiclesPlanned ? cfg.vehiclesPlanned + " véhicule(s)" : "à renseigner"],
      ["Accès", withCode + " code(s) créé(s)"],
      ["Formulaire", cfg.formOpen ? "ouvert" : "fermé"]
    ];
    c.innerHTML =
      '<div class="hero-card"><div><p class="eyebrow">' + esc(cfg.year || "") + "</p><h2>" +
      esc(cfg.name || "Beauregard") + "</h2><p>" + esc(cfg.phase || "Préparation") + "</p></div>" +
      '<span class="hero-date">V' + esc(state.version) + "</span></div>" +
      '<div class="toolbar">' +
      '<button class="button secondary" data-page="team">Équipe</button>' +
      '<button class="button secondary" data-page="creneaux">Créneaux</button>' +
      '<button class="button secondary" data-page="concerts">Concerts</button>' +
      "</div>" +
      card("État de la préparation", blocks.map(function (b) { return listRow(b[0], b[1], "", ""); }).join("")) +
      card("État de l'appareil",
        listRow("Version des données", "V" + state.version, "", "") +
        listRow("Modifications en attente", String(state.pending), state.pending ? "À envoyer" : "Aucune", state.pending ? "bad" : "good") +
        listRow("Réseau", navigator.onLine ? "En ligne" : "Hors ligne", "", ""));
    wireNav();
  }

  /* ---------- Autres écrans ---------- */
  function renderHome(c, d) {
    var cfg = d.config || {};
    var uid = state.user && state.user.id;
    var next = (d.assignments || [])
      .filter(function (a) { return a.personId === uid; })
      .map(function (a) { return shift(a.shiftId); })
      .filter(Boolean)
      .sort(function (a, b) { return String(a.date + a.start).localeCompare(String(b.date + b.start)); })[0];
    var lab = $("#editionLabel");
    if (lab) lab.textContent = (cfg.name || "Beauregard") + " " + (cfg.year || "");
    var msgs = (d.messages || []).slice(0, 3);
    c.innerHTML =
      '<div class="hero-card"><div><p class="eyebrow">' + esc(cfg.year || "BEAUREGARD") + "</p>" +
      "<h2>" + esc(cfg.name || "Beauregard") + "</h2><p>" + esc(cfg.phase || "Préparation") + "</p></div>" +
      '<span class="hero-date">V' + esc(state.version) + "</span></div>" +
      '<div class="grid two" style="margin-top:16px">' +
      card("Prochain rendez-vous", next
        ? listRow(next.name, next.date + " · " + next.start + "–" + next.end, "Publié", "good")
        : "<p>Ton planning apparaîtra dès sa publication.</p>") +
      card("À lire", msgs.length
        ? msgs.map(function (m) { return listRow(m.title, m.body, m.priority || "Info", m.priority === "Urgent" ? "bad" : ""); }).join("")
        : "<p>Aucun message actif.</p>") +
      "</div>";
  }

  function renderMyShifts(c, d) {
    var uid = state.user && state.user.id;
    var rots = (d.rotations || []).filter(function (r) { return r.personId === uid; });
    var rows = (d.assignments || [])
      .filter(function (a) { return a.personId === uid; })
      .map(function (a) {
        var s = shift(a.shiftId) || {};
        var mine = rots.filter(function (r) { return r.shiftId === a.shiftId; });
        var body = mine.length ? mine.map(function (r) { return r.start + "–" + r.end + " · " + r.role; }).join(" · ") : "Rôle à confirmer";
        return '<article class="card"><h2>' + esc(s.name || "Créneau") + '</h2><p class="muted">' +
          esc(s.date || "") + " · " + esc((s.start || "") + "–" + (s.end || "")) + "</p><p>" + esc(body) + "</p></article>";
      }).join("");
    c.innerHTML = rows || empty("Aucun créneau publié", "Ton planning personnel s'affichera ici.");
  }

  function renderPlanning(c, d) {
    var rows = (d.assignments || []).map(function (a) {
      var s = shift(a.shiftId) || {};
      return listRow(personLabel(a.personId), (s.date || "") + " · " + (s.name || ""), s.start ? s.start + "–" + s.end : "");
    });
    c.innerHTML = rows.length
      ? '<article class="card"><h2>Planning publié</h2>' + rows.join("") + "</article>"
      : empty("Planning non publié", "Le planning collectif apparaîtra après publication.");
  }

  function renderContacts(c, d) {
    var refs = [], others = [];
    (d.people || []).forEach(function (p) {
      if (p.deleted) return;
      (p.role === "referent" ? refs : others).push(p);
    });
    var block = function (list) {
      return list.map(function (p) {
        var lbl = [p.firstName, p.lastName].filter(Boolean).join(" ");
        return '<article class="card contact-card"><div class="contact-head">' +
          (p.photo ? '<img class="avatar" src="' + esc(p.photo) + '" alt="">' : '<span class="avatar">' + esc(lbl.slice(0, 1)) + "</span>") +
          "<div><b>" + esc(lbl) + "</b><small>" + esc(p.role === "referent" ? "Référent" : "Bénévole") + "</small></div></div>" +
          '<div class="contact-actions">' +
          (p.phone ? '<a class="button secondary" href="tel:' + esc(p.phone) + '">Appeler</a>' : "") +
          (p.email ? '<a class="button secondary" href="mailto:' + esc(p.email) + '">Écrire</a>' : "") +
          "</div></article>";
      }).join("");
    };
    var html = (refs.length ? '<div class="section-title">Référents</div>' + block(refs) : "") +
      (others.length ? '<div class="section-title">Équipe</div>' + block(others) : "");
    c.innerHTML = html || empty("Aucun contact", "Les fiches d'équipe apparaîtront ici.");
  }

  function renderMessages(c, d) {
    var msgs = d.messages || [];
    c.innerHTML = msgs.length
      ? msgs.map(function (m) {
          return '<article class="card"><h2>' + esc(m.title) + "</h2><p>" + esc(m.body) + "</p>" +
            (m.priority === "Urgent" ? '<button class="button primary" data-read="' + esc(m.id) + '">J\'ai lu</button>' : "") + "</article>";
        }).join("")
      : empty("Aucun message", "Les consignes de l'équipe apparaîtront ici.");
    Array.prototype.forEach.call(document.querySelectorAll("[data-read]"), function (b) {
      b.onclick = function () {
        send("read", { messageId: b.dataset.read }, "Message marqué comme lu.").then(function () { render(); });
      };
    });
  }

  function renderVehicles(c, d) {
    var v = d.vehicles || [];
    c.innerHTML = v.length
      ? v.map(function (x) {
          return '<article class="card"><h2>' + esc(x.plate || "Véhicule") + "</h2><p>" + esc(x.make || "") + "</p>" +
            '<span class="badge ' + (x.active === false ? "bad" : "good") + '">' + (x.active === false ? "HS" : "En service") + "</span></article>";
        }).join("")
      : empty("Aucun véhicule", "Les véhicules reçus apparaîtront ici.");
  }

  function start() {
    hideBoot();
    var l = $("#loginScreen"); if (l) l.classList.add("hidden");
    var s = $("#appShell"); if (s) s.classList.remove("hidden");
    var rl = $("#roleLabel"); if (rl) rl.textContent = ROLE[state.role] || "Bénévole";
    var ul = $("#userLabel"); if (ul) ul.textContent = (state.user && state.user.name) || "Mon espace";
    var ua = $("#userAvatar");
    if (ua) ua.textContent = String((state.user && state.user.name) || "B").trim().slice(0, 1).toUpperCase();
    if (state.role === "admin") state.page = "team";
    nav();
    setTitle();
    render();
    syncBadge();
    wirePageContent();
  }

  /* ---------- Envoi ---------- */
  function send(action, data, okMessage) {
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ action: action, payload: data }).then(function () {
        notice("Action enregistrée hors ligne. Elle partira au retour du réseau.", "info");
        return refreshPending();
      });
    }
    return Transport.mutate(action, data).then(function (out) {
      if (okMessage) notice(okMessage, "success");
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && (msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        return Queue.enqueue({ action: action, payload: data }).then(function () {
          notice("Réseau instable : action gardée et envoyée plus tard.", "info");
          return refreshPending();
        });
      }
      notice(msg, "error");
      throw e;
    });
  }

  function sendSave(collection, row, baseVersion, baseRow) {
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
        .then(function () { notice("Enregistré hors ligne. Envoi au retour du réseau.", "info"); return refreshPending(); });
    }
    return Transport.save(collection, row, baseVersion, baseRow).then(function (out) {
      if (out && out.conflict) {
        notice("Conflit détecté : une autre personne a modifié cette fiche.", "error");
        if (window.Queue) return Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow });
      }
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && (msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        return Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
          .then(function () { notice("Réseau instable : fiche gardée pour envoi.", "info"); return refreshPending(); });
      }
      throw e;
    });
  }

  var loginForm = $("#loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#loginError");
      err.textContent = "Connexion…";
      if (BOOT && BOOT.start) BOOT.start();
      Transport.login($("#accessCode").value, ($("#operatorName") || {}).value || "")
        .then(function (out) {
          if (!out || !out.user) throw new Error("Réponse de connexion incomplète.");
          state.user = out.user;
          state.role = out.user.role || "benevole";
          err.textContent = "";
          return Transport.sync(0, state.role);
        })
        .then(function (bundle) {
          state.data = mergeBundle(bundle);
          state.version = (bundle && bundle.version) || 0;
          saveLocal();
          bootDone();
          start();
          return refreshPending();
        })
        .then(function () { return flushQueue(); })
        .catch(function (x) {
          var msg = (x && x.message) || "Connexion impossible";
          err.textContent = msg;
          bootFail(msg);
        });
    });
  }

  window.logout = function () {
    try { Transport.logout().catch(function () {}); } catch (e) {}
    state.user = null; state.data = null; state.personId = "";
    state.shiftMode = ""; state.shiftId = ""; state.concertMode = ""; state.concertId = "";
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    if (window.Queue) Queue.clear().catch(function () {});
    var s = $("#appShell"); if (s) s.classList.add("hidden");
    showLogin();
    var ac = $("#accessCode"); if (ac) ac.value = "";
  };

  window.navigate = go;

  function flushQueue() {
    if (!window.Queue) return Promise.resolve();
    return Queue.flush().then(function (r) {
      state.pending = (r && r.remaining) || 0;
      syncBadge();
      if (r && r.sent) notice(r.sent + " modification(s) envoyée(s).", "success");
      return Queue.list();
    }).then(function (rows) {
      var conflicts = (rows || []).filter(function (x) { return x.state === "conflict"; });
      if (conflicts.length) notice(conflicts.length + " modification(s) en conflit à arbitrer.", "error");
    }).catch(function () {});
  }

  function syncNow() {
    if (!navigator.onLine) { syncBadge(); return; }
    Transport.sync(state.version, state.role).then(function (bundle) {
      state.data = mergeBundle(bundle);
      state.version = (bundle && bundle.version) || state.version;
      saveLocal();
      render();
      return flushQueue();
    }).then(function () { return refreshPending(); })
      .catch(function (e) {
        if (e && e.message === "SESSION_EXPIRED") { Transport.setToken(""); window.logout(); return; }
        syncBadge();
      });
  }

  var sn = $("#syncNow");
  if (sn) sn.onclick = function () { syncNow(); };
  window.addEventListener("online", function () { syncNow(); });
  window.addEventListener("offline", function () { syncBadge(); });

  try {
    if (window.Transport && Transport.token()) {
      var local = readLocal();
      if (local) {
        state.data = local.data;
        state.role = local.role;
        state.version = local.version;
        state.user = { id: (local.data.user || {}).id, name: (local.data.user || {}).name, role: local.role };
        bootSkip();
        start();
        refreshPending().then(function () { if (navigator.onLine) syncNow(); });
      } else {
        bootSkip();
        showLogin();
      }
    } else {
      bootSkip();
      showLogin();
    }
  } catch (e) {
    bootFail(String(e.message || e));
  }
})();