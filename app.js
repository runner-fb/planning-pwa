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
    referent: [["Accueil", "home"], ["Planning", "planning"], ["Équipe", "team"], ["Véhicules", "vehicles"]],
    admin: [
      ["Tableau de bord", "dashboard"], ["Préparation", "setup"], ["Bénévoles", "team"], ["Concerts", "concerts"],
      ["Véhicules", "vehicles"], ["Planning", "planning"], ["Messages", "messages"], ["Contacts", "contacts"]
    ],
    vehicles: [["Accueil", "home"], ["Véhicules", "vehicles"]]
  };

  var META = {
    dashboard: ["PILOTAGE DE L’ÉDITION", "Tableau de bord", "Avancement réel, indicateurs et prochaines actions."],
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
    form: ["DISPONIBILITÉS", "Mon formulaire", "Choix de créneaux et concerts."],
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
    syncError: "", personId: "", shiftMode: "", shiftId: "", concertMode: "", concertId: "", open: ""
  };
  var CACHE_KEY = "planning_v2_bundle";
  var BOOT = window.Boot || null;
  var writeBusy = false;

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
    } else if (state.syncError) {
      text = "Synchronisation échouée · " + state.syncError; kind = "bad";
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
    if ((state.role !== "admin" && ["setup", "creneaux"].indexOf(key) >= 0) || (state.role === "benevole" && ["team", "vehicles", "terrain"].indexOf(key) >= 0)) { notice("Accès réservé à l’organisation.", "error"); return; }
    state.page = key;
    if (key === "form" && navigator.onLine && !(state.data.forms || []).some(function(f){return f.personId === state.user.id;})) {
      onlineAction("formStart", {personId:state.user.id}).catch(function(e){notice(e.message,"error");});
    }
    state.open = "";
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
    if (p === "dashboard") return renderAdminDashboard(c, d);
    if (p === "home") return renderHome(c, d);
    if (p === "team") return renderTeam(c, d);
    if (p === "creneaux") return renderCreneaux(c, d);
    if (p === "concerts") return renderConcerts(c, d);
    if (p === "myshifts") return renderMyShifts(c, d);
    if (p === "planning") return renderPlanning(c, d);
    if (p === "contacts") return renderContacts(c, d);
    if (p === "terrain") return renderTerrain(c, d);
    if (p === "form") return renderVolunteerForm(c, d);
    if (p === "messages") return renderMessages(c, d);
    if (p === "vehicles") return renderVehicles(c, d);
    if (p === "setup") return renderSetup(c, d);
    c.innerHTML = empty("Module en préparation", "Cet écran sera branché à l'étape suivante.");
  }

  /* ---------- Équipe ---------- */
  function renderTeam(c, d) {
    var T = window.ScreenTeam;
    if (!T) { c.innerHTML = empty("Écran indisponible", "Le module Équipe n'est pas chargé."); return; }
    c.innerHTML = state.personId ? T.sheet({ data: d, role: state.role }, state.personId) : T.list({ data: d, role: state.role });
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
        c.innerHTML = T.list({ data: state.data || {}, role: state.role });
        wireTeam();
        var again = $("#teamSearch");
        if (again) { again.focus(); }
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
        if (act === "access" || act === "access-one") { if (b.disabled) return; b.disabled = true; }
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
      form.onsubmit = function (e) { e.preventDefault(); if (writeBusy) return; savePerson(form); };
    }
  }

  function openPersonForm() {
    if (state.role !== "admin") return;
    var c = $("#pageContent");
    c.innerHTML = window.ScreenTeam.blank();
    state.personId = "";
    wireTeam();
  }

  function savePerson(form) {
    var data = window.ScreenTeam.readForm(form);
    if (!data.lastName || !data.firstName) { notice("Nom et prénom obligatoires.", "error"); return; }

    if (state.role !== "admin") {
      var original = (state.data.people || []).find(function(p){return p.id===state.personId;});
      if (!original) { notice("Création réservée à l’Admin.", "error"); return; }
      ["lastName","firstName","phone","email","role"].forEach(function(k){data[k]=original[k];});
    }
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

    writeBusy = true;
    sendSave("people", row, baseVersion, base)
      .then(function (out) {
        row = out && out.row ? out.row : row;
        notice(out && out.queued ? "Fiche gardée hors ligne." : "Fiche enregistrée.", "success");
        state.data.people = (state.data.people || []).filter(function (x) { return x.id !== row.id; }).concat([row]);
        saveLocal();
        state.personId = row.id;
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); })
      .then(function () { writeBusy = false; });
  }

  function removePerson() {
    if (state.role !== "admin") return;
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
      .catch(function (e) { notice(String(e.message || e), "error"); wireTeam(); });
  }

  function accessRow(personId, code, alreadyShown) {
    var p = (state.data.people || []).filter(function (x) { return x.id === personId; })[0];
    if (!p) return { nom: personId, prenom: "(fiche locale inconnue)", code: code || "", alreadyShown: !!alreadyShown };
    return { nom: p.lastName, prenom: p.firstName, code: code || "", alreadyShown: !!alreadyShown };
  }

  function createAccessOne(id) {
    if (state.role !== "admin") return;
    var target = String(id || state.personId || "");
    if (!target) { notice("Aucune fiche sélectionnée.", "error"); return; }

    Transport.mutate("access", { personId: target })
      .then(function (out) {
        var pid = (out && out.personId) || target;
        rememberAccess(pid);
        var code = (out && out.code) || "";
        var shown = !!(out && out.codeAlreadyShown);
        var c = $("#pageContent");
        c.innerHTML = window.ScreenTeam.accessResult([accessRow(pid, code, shown)]);
        wireTeam();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); render(); });
  }

  function createAccessBatch() {
    if (state.role !== "admin") return;
    var people = (state.data.people || []).filter(function (p) { return !p.deleted && p.status !== "Désisté"; });
    if (!people.length) { notice("Aucune personne active.", "error"); return; }
    if (!window.confirm("Créer les accès pour " + people.length + " personne(s) ?\nLes codes existants seront remplacés.")) return;

    var rows = [], failures = [];
    var chain = Promise.resolve();
    people.forEach(function (p) {
      chain = chain.then(function () {
        return Transport.mutate("access", { personId: p.id }).then(function (out) {
          var pid = (out && out.personId) || p.id;
          rememberAccess(pid);
          rows.push(accessRow(pid, (out && out.code) || "", !!(out && out.codeAlreadyShown)));
        }).catch(function (e) { failures.push(personLabel(p.id) + " : " + String(e.message || e)); });
      });
    });
    chain.then(function () {
      var c = $("#pageContent");
      c.innerHTML = window.ScreenTeam.accessResult(rows);
      wireTeam();
      if (failures.length) notice("Accès non créés : " + failures.join(" ; "), "error");
    });
  }

  function rememberAccess(id) {
    state.data.access = (state.data.access || []).filter(function (a) { return a.personId !== id; }).concat([{ personId: id, hasCode: true, active: true }]); saveLocal();
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
    if (state.role !== "admin") { c.innerHTML = empty("Accès réservé", "Gestion des shifts réservée à l’admin."); return; }
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Créneaux n'est pas chargé."); return; }
    if (!state.shiftMode) { c.innerHTML = S.shifts({ data: d }); return; }
    c.innerHTML = S.shiftForm({ data: d }, state.shiftMode, state.shiftId);
  }

  /* ---------- Concerts ---------- */
  function renderConcerts(c, d) {
    if (state.role !== "admin") { c.innerHTML = concertPanel(d, true); wireNav(); return; }
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Concerts n'est pas chargé."); return; }
    if (!state.concertMode) { c.innerHTML = S.concerts({ data: d }); return; }
    c.innerHTML = S.concertForm({ data: d }, state.concertMode, state.concertId);
  }

  /* ---------- Action déléguée des créneaux et concerts ---------- */
  function scenesAction(b) {
    if (state.role !== "admin") return;
    if (b.dataset.creneaux !== undefined) { if (!state.shiftMode) { go(state.role === "admin" ? "setup" : "team"); return; } state.shiftMode = ""; state.shiftId = ""; render(); return; }
    if (b.dataset.concerts !== undefined) { if (!state.concertMode) { go("setup"); return; } state.concertMode = ""; state.concertId = ""; render(); return; }
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

    /* Meme regle que pour les concerts : suppression reelle par id.
     * On n'envoie jamais active:false pour simuler une suppression. */
    sendRemove("shifts", s.id).then(function () {
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

    /* Suppression reelle : le serveur retire la ligne par son id et
     * renumeroie la programmation. On ne simule rien avec active:false. */
    sendRemove("concerts", k.id).then(function () {
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
    sendSave("shifts", full, old ? old.version || 0 : 0, old).then(function (out) {
      /* Le serveur est la source de verite : il calcule `day`, `order`,
       * `c3` et le libelle. Sa reponse remplace la copie locale, sinon
       * un creneau cree sans date garde une date vide et se retrouve
       * dans un groupe separe. */
      var definitif = (out && out.row) ? out.row : full;
      state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== definitif.id; }).concat([definitif]);
      saveLocal();
      state.shiftMode = "";
      state.shiftId = "";
      notice("Créneau " + full.id + " enregistré.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); }).then(function () { writeBusy = false; });
  }

  function saveConcert(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    if (!full.id) full.id = "co-" + Transport.requestId().slice(0, 8);
    full.version = old ? old.version || 0 : 0;
    sendSave("concerts", full, old ? old.version || 0 : 0, old).then(function (out) {
      /* Le serveur renvoie la ligne definitive, avec sa `date` deduite
       * du jour choisi. C'est ELLE qu'on garde : sans ca, un concert
       * cree arrive avec date vide et forme un second groupe « Mercredi »
       * a cote du vrai groupe « Mercredi 30/06 ». */
      var definitif = (out && out.row) ? out.row : full;
      state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== definitif.id; }).concat([definitif]);
      saveLocal();
      state.concertMode = "";
      state.concertId = "";
      notice("Concert enregistré.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); }).then(function () { writeBusy = false; });
  }

  /* ------------------------------------------------------------------
   * ÉCOUTEUR UNIQUE DES CRÉNEAUX ET CONCERTS
   * Un seul écouteur, posé sur #pageContent qui existe en permanence.
   * Il n'est jamais posé sur un bouton : les boutons sont recréés à
   * chaque render(), un gestionnaire posé dessus ne survivrait pas.
   * L'enregistrement ne dépend pas de l'événement submit.
   * ------------------------------------------------------------------ */

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

    if (b.dataset.saveShift !== undefined) { if (!writeBusy) handleShiftSave(); return; }
    if (b.dataset.saveConcert !== undefined) { if (!writeBusy) handleConcertSave(); return; }
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

    if (!f.reportValidity()) return;
    var row = S.readShift(f, { data: state.data });
    if (!row.id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
    if (!row.start || !row.end) { notice("Horaires obligatoires.", "error"); return; }
    row.name = S.slotLabel(row.start, row.end, row.id);

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var existant = (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
    if (isNew && existant) { notice("Cet identifiant existe déjà.", "error"); return; }

    var old = isNew ? null : (state.data.shifts || []).filter(function (x) { return x.id === current; })[0];
    writeBusy = true;
    saveShift(row, old);
  }

  /* Enregistrement d'un concert : même principe. */
  function handleConcertSave() {
    var f = document.getElementById("concertForm");
    var S = window.ScreenShifts;
    if (!f || !S) { notice("Formulaire Concerts indisponible.", "error"); return; }

    if (!f.reportValidity()) return;
    var con = S.readConcert(f);
    if (!con.artist) { notice("Artiste obligatoire.", "error"); return; }
    if (!con.start || !con.end) { notice("Horaires obligatoires.", "error"); return; }

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var old = isNew ? null : (state.data.concerts || []).filter(function (x) { return x.id === current; })[0];
    writeBusy = true;
    saveConcert(con, old);
  }

  /* Installation de l'écouteur, une seule fois, dès que #pageContent existe. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePageContent);
  } else {
    wirePageContent();
  }

  /* ------------------------------------------------------------------
   * PRÉPARATION — LES GRANDES LIGNES DE L'ÉDITION
   *
   * Quatre blocs dépliables. Chaque bloc s'enregistre SEUL : on n'envoie
   * que ses champs, jamais la configuration entière. L'action serveur
   * "config" accepte les modifications partielles.
   *
   * DEUX NOMENCLATURES, UNE SEULE RÈGLE :
   *   en LECTURE  → les propriétés reçues dans le bundle :
   *                 year, name, phase, date_debut, date_fin,
   *                 vehiclesPlanned, reserveA, quotaMin, quotaMax,
   *                 formOpen, appOpen
   *   en ÉCRITURE → les clés de la feuille CONFIG_EDITION :
   *                 annee, nom_edition, phase, date_debut, date_fin,
   *                 vehicules_prevus, reserve_a, quota_min, quota_max,
   *                 formulaire_ouvert, app_ouverte
   * C'est asymétrique, et c'est voulu : le backend traduit à la lecture.
   * ------------------------------------------------------------------ */
  var PHASES = ["Préparation", "Migration à contrôler", "Test", "Active", "Formulaire ouvert", "Validé", "Réouvert", "Publié", "Archive"];

  /* Une date ISO pour un champ type=date : les dix premiers caractères. */
  function isoJour(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  /* Enregistrement d'UN bloc. On n'envoie que ses champs, sous les clés
   * attendues par la feuille CONFIG_EDITION. */
  function saveSetupBloc(id) {
    var host = document.getElementById("pageContent");
    if (!host) return;
    var ouvert = host.querySelector(".acc-body");
    if (!ouvert) { notice("Ouvre un bloc avant d'enregistrer.", "error"); return; }

    var champs = ouvert.querySelectorAll("input, select");
    var get = function (nom) {
      for (var i = 0; i < champs.length; i++) if (champs[i].name === nom) return champs[i];
      return null;
    };
    var val = function (nom) { var e = get(nom); return e ? String(e.value).trim() : ""; };
    var on = function (nom) { var e = get(nom); return !!(e && e.checked); };

    var charge = {};
    if (id === "edition") {
      var annee = val("annee");
      var d1 = val("date_debut"), d2 = val("date_fin");
      if (!/^\d{4}$/.test(annee)) { notice("L\u2019année doit comporter 4 chiffres.", "error"); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) {
        notice("Les deux dates sont obligatoires.", "error"); return;
      }
      if (d1 >= d2) { notice("Le premier jour doit précéder le dernier.", "error"); return; }
      charge = { annee: Number(annee), nom_edition: val("nom_edition"), date_debut: d1, date_fin: d2 };
    } else if (id === "planning") {
      var vp = Number(val("vehicules_prevus")), qmin = Number(val("quota_min")), qmax = Number(val("quota_max"));
      if (!isFinite(vp) || vp < 0) { notice("Nombre de véhicules invalide.", "error"); return; }
      if (!isFinite(qmin) || !isFinite(qmax) || qmin < 0 || qmax > 100) { notice("Quotas hors limites (0 à 100).", "error"); return; }
      if (qmin > qmax) { notice("Le quota minimal dépasse le maximal.", "error"); return; }
      charge = { vehicules_prevus: vp, quota_min: qmin, quota_max: qmax, reserve_a: on("reserve_a") };
    } else if (id === "ouvertures") {
      var close = val("date_cloture");
      if (close && !isFinite(new Date(close).getTime())) { notice("Date de clôture invalide.", "error"); return; }
      charge = { formulaire_ouvert: on("formulaire_ouvert"), app_ouverte: on("app_ouverte"), date_cloture: close ? new Date(close).toISOString() : "", equipe_verifiee: on("equipe_verifiee"), creneaux_verifies: on("creneaux_verifies"), concerts_verifies: on("concerts_verifies") };
    } else {
      return;
    }

    notice("Enregistrement\u2026", "info");
    Transport.mutate("config", charge)
      .then(function (out) {
        if (out && out.config) state.data.config = Object.assign({}, state.data.config, out.config);
        else if (out && out.year !== undefined) state.data.config = out;
        saveLocal();
        notice("Enregistré.", "success");
        syncNow();
      })
      .catch(function (e) { notice(String((e && e.message) || e), "error"); });
  }

  function renderSetup(c, d) {
    var cfg = d.config || {};
    var n = function (k) { return (d[k] || []).filter(function (x) { return !x.deleted; }).length; };
    var withCode = (d.access || []).filter(function (a) { return a.hasCode; }).length;
    var ouvre = function (id) { return state.open === id; };


    var entete = function (id, titre, resume) {
      return '<button type="button" class="acc-head" data-setup="' + id + '" aria-expanded="' + (ouvre(id) ? "true" : "false") + '">' +
        '<span class="acc-title">' + esc(titre) + "</span>" +
        '<span class="acc-sub">' + esc(resume) + "</span>" +
        '<span class="acc-arrow">' + (ouvre(id) ? "\u25B4" : "\u25BE") + "</span>" +
        "</button>";
    };

    var bloc = function (id, titre, resume, corps) {
      return '<article class="card acc">' + entete(id, titre, resume) +
        (ouvre(id) ? '<div class="acc-body">' + corps + "</div>" : "") + "</article>";
    };

    /* ---------- 1. ÉDITION ---------- */
    var blocEdition =
      '<div class="form-grid">' +
      '<div><label>Année<input name="annee" type="number" min="2000" max="2100" step="1" inputmode="numeric" value="' + esc(cfg.year || "") + '"></label></div>' +
      '<div><label>Nom de l\u2019édition<input name="nom_edition" value="' + esc(cfg.name || "") + '"></label></div>' +
      '<div><label>Premier jour<input name="date_debut" type="date" value="' + esc(isoJour(cfg.date_debut)) + '"></label></div>' +
      '<div><label>Dernier jour<input name="date_fin" type="date" value="' + esc(isoJour(cfg.date_fin)) + '"></label></div>' +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="edition">Enregistrer l\u2019édition</button></div>' +
      "</div>";

    /* ---------- 2. PARAMÈTRES PLANNING ---------- */
    var blocPlanning =
      '<div class="form-grid">' +
      '<div><label>Véhicules prévus<input name="vehicules_prevus" type="number" min="0" step="1" inputmode="numeric" value="' + esc(cfg.vehiclesPlanned || 0) + '"></label></div>' +
      '<div><label>Part Conducteur minimale (%)<input name="quota_min" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(cfg.quotaMin || 0) + '"></label></div>' +
      '<div><label>Part Conducteur maximale (%)<input name="quota_max" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(cfg.quotaMax || 0) + '"></label></div>' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="reserve_a"' + (cfg.reserveA === false ? "" : " checked") + "><span>Véhicule A réservé aux référents</span></label>" +
      "</div>" +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="planning">Enregistrer les paramètres</button></div>' +
      "</div>";

    /* ---------- 3. OUVERTURES ---------- */
    var closeDate = cfg.closeAt ? new Date(cfg.closeAt) : null;
    var validClose = closeDate && isFinite(closeDate.getTime());
    var localClose = validClose ? new Date(closeDate.getTime() - closeDate.getTimezoneOffset() * 60000).toISOString().slice(0,16) : "";
    var blocOuvertures =
      '<div class="form-grid">' +
      (cfg.closeAt && !validClose ? '<p class="full" role="alert">La date de clôture enregistrée est invalide. Renseigne une nouvelle date avant d’ouvrir le formulaire.</p>' : '') +
      '<div class="full"><label>Clôture du formulaire<input type="datetime-local" name="date_cloture" value="' + esc(localClose) + '"></label></div>' +
      '<div class="full contraintes">' +
      [ ["equipe_verifiee", "teamChecked", "Équipe vérifiée"], ["creneaux_verifies", "shiftsChecked", "Créneaux vérifiés"], ["concerts_verifies", "concertsChecked", "Concerts vérifiés"] ].map(function (x) { return '<label class="check"><input type="checkbox" name="' + x[0] + '"' + (cfg[x[1]] ? " checked" : "") + '><span>' + x[2] + '</span></label>'; }).join("") +
      '<label class="check"><input type="checkbox" name="formulaire_ouvert"' + (cfg.formOpen ? " checked" : "") + "><span>Formulaire ouvert aux bénévoles</span></label>" +
      '<label class="check"><input type="checkbox" name="app_ouverte"' + (cfg.appOpen ? " checked" : "") + "><span>Application terrain ouverte</span></label>" +
      "</div>" +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="ouvertures">Enregistrer le formulaire</button></div>' +
      "</div>";

    /* ---------- 4. ÉTAT DE LA PRÉPARATION ---------- */
    var blocsEtat = [
      ["Équipe", n("people") + " fiche(s)", n("people") ? "good" : "bad"],
      ["Créneaux", n("shifts") + " créneau(x)", n("shifts") ? "good" : "bad"],
      ["Concerts", n("concerts") + " concert(s)", n("concerts") ? "good" : "bad"],
      ["Missions", n("missions") + " mission(s)", n("missions") ? "good" : ""],
      ["Véhicules prévus", cfg.vehiclesPlanned ? cfg.vehiclesPlanned + " véhicule(s)" : "à renseigner", cfg.vehiclesPlanned ? "good" : "bad"],
      ["Accès", withCode + " code(s) créé(s)", withCode ? "good" : "bad"],
      ["Formulaire", cfg.formOpen ? "ouvert" : "fermé", cfg.formOpen ? "good" : ""]
    ];
    var corpsEtat = blocsEtat.map(function (b) { return listRow(b[0], b[1], "", b[2]); }).join("") +
      "";

    c.innerHTML =
      '<div class="hero-card"><div><p class="eyebrow">' + esc(cfg.year || "") + "</p><h2>" +
      esc(cfg.name || "Beauregard") + "</h2><p>" + esc(cfg.phase || "Préparation") + "</p></div>" +
      '<span class="hero-date">V' + esc(state.version) + "</span></div>" +

      bloc("edition", "Édition", cfg.year ? "Année " + cfg.year : "à renseigner", blocEdition) +
      bloc("planning", "Paramètres véhicules", cfg.vehiclesPlanned ? cfg.vehiclesPlanned + " véhicule(s)" : "à renseigner", blocPlanning) +
      bloc("shifts", "Paramètres shifts", n("shifts") + " créneau(x) · normaux, brunch et journées annexes", '<button class="button primary" data-page="creneaux">Gérer tous les shifts</button>') +
      bloc("ouvertures", "Formulaire", (cfg.formOpen ? "Formulaire ouvert" : "Formulaire fermé"), blocOuvertures + formTracking(d)) +
      bloc("etat", "État de la préparation", "compteurs et accès", corpsEtat) +

      resetPanel() +
      card("État de l\u2019appareil",
        listRow("Version des données", "V" + state.version, "", "") +
        listRow("Modifications en attente", String(state.pending), state.pending ? "À envoyer" : "Aucune", state.pending ? "bad" : "good") +
        listRow("Réseau", navigator.onLine ? "En ligne" : "Hors ligne", "", "") +
        '<button class="button secondary" id="retryQueue">Réessayer les actions bloquées</button>' + '<div id="queueDetails"></div>');
    if (window.Queue) Queue.list().then(function (rows) {
      var target = $("#queueDetails"); if (!target) return;
      target.innerHTML = rows.filter(function (r) { return r.authorId === (state.user && state.user.id); }).map(function (r) { return listRow(r.action + " · " + (r.collection || ""), r.error || "En attente", r.state); }).join("");
    }).catch(function () {
      var target = $("#queueDetails");
      if (target) target.textContent = "Stockage hors ligne indisponible sur cet appareil. Les actions en attente ne peuvent pas être vérifiées.";
    });
    wireManagement();
    var retry = $("#retryQueue"); if (retry) retry.onclick = function () { Queue.retryBlocked().then(function () { syncNow(); }).catch(function (e) { notice("Impossible de relancer les actions : " + String(e.message || e), "error"); }); };

    /* Les boutons sont recréés à chaque rendu : les écouteurs sont posés
     * sur le conteneur, jamais sur les boutons eux-mêmes. */
    var host = document.getElementById("pageContent");
    if (host) {
      Array.prototype.forEach.call(host.querySelectorAll("[data-setup]"), function (b) {
        b.onclick = function () {
          var id = String(b.dataset.setup || "");
          state.open = state.open === id ? "" : id;
          render();
        };
      });
      Array.prototype.forEach.call(host.querySelectorAll("[data-setup-save]"), function (b) {
        b.onclick = function () { saveSetupBloc(String(b.dataset.setupSave || "")); };
      });
    }
    wireNav();
  }

  /* Tableau de bord : indicateurs calculés à partir du bundle, sans modifier les données. */
  function renderAdminDashboard(c,d) {
    if(state.role!=='admin'){go('home');return;}
    var cfg=d.config||{}, people=activeRows(d,'people').filter(function(p){return p.status!=='Désisté';});
    var shifts=activeRows(d,'shifts'), concerts=activeRows(d,'concerts');
    var forms=activeRows(d,'forms'), answered=people.filter(function(p){return forms.some(function(f){return f.personId===p.id&&f.status==='Reçu';});}).length;
    var sims=activeRows(d,'simulations'), assignments=activeRows(d,'assignments');
    var pubs=activeRows(d,'publications');
    var formSent=people.filter(function(p){return (d.deliveries||[]).some(function(x){return x.personId===p.id&&x.kind==='form'&&x.status!=='Échec';});}).length;
    var hasSim=sims.length>0, hasPublished=pubs.length>0;
    var steps=[
      {title:'Préparation',detail:people.length+' bénévoles · '+shifts.length+' shifts · '+concerts.length+' concerts',done:people.length>0&&shifts.length>0&&concerts.length>0,page:'setup'},
      {title:'Formulaires',detail:answered+' / '+people.length+' réponses reçues · '+formSent+' envois signalés',done:people.length>0&&answered===people.length,page:'setup'},
      {title:'Simulation',detail:hasSim?sims.length+' simulation(s) enregistrée(s)':'Aucune simulation enregistrée',done:hasSim,page:'planning'},
      {title:'Contrôles',detail:'À vérifier dans le planning (pas de validation automatique)',done:false,page:'planning'},
      {title:'Publication',detail:hasPublished?pubs.length+' publication(s) enregistrée(s)':'Aucune publication enregistrée',done:hasPublished,page:'planning'}
    ];
    var done=steps.filter(function(x){return x.done;}).length;
    function tile(n,label){return '<div style="border:1px solid var(--border,#dce1e8);border-radius:12px;padding:16px;min-width:0"><div style="font-size:clamp(22px,3vw,30px);font-weight:750">'+esc(n)+'</div><div class="muted">'+esc(label)+'</div></div>';}
    var next=steps.find(function(x){return !x.done;});
    c.innerHTML='<section class="card"><h2>'+esc(cfg.name||'Beauregard')+' '+esc(cfg.year||'')+'</h2><p class="muted">Organisation Runner · Vue d’ensemble de la préparation</p>'+
      '<h3>'+done+' étape(s) sur 5 renseignée(s)</h3><div style="height:10px;border-radius:20px;background:#e2e8f0;overflow:hidden"><div style="height:100%;width:'+(done*20)+'%;background:#26815a"></div></div>'+
      '<p class="muted">Indicateur de suivi, non une validation officielle. Les contrôles restent à effectuer dans le planning.</p></section>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin:14px 0">'+
      tile(people.length,'Bénévoles actifs')+tile(answered+' / '+people.length,'Réponses reçues')+tile(shifts.length,'Shifts créés')+tile(sims.length,'Simulations')+tile(assignments.length,'Affectations officielles')+tile(concerts.length,'Concerts')+'</div>'+
      '<section class="card"><h2>Étapes de préparation</h2>'+steps.map(function(x,i){return '<button type="button" class="person-row" data-page="'+x.page+'" style="width:100%;text-align:left;display:flex;align-items:center;gap:12px;padding:14px 8px"><span aria-hidden="true" style="font-size:22px;color:'+(x.done?'#23814e':'#8a94a3')+'">'+(x.done?'✓':'○')+'</span><span class="person-main" style="flex:1"><b>'+(i+1)+'. '+esc(x.title)+'</b><small>'+esc(x.detail)+'</small></span><span aria-hidden="true">›</span></button>';}).join('')+'</section>'+
      (next?'<section class="card"><h2>Prochaine action</h2><p>'+esc(next.title)+' : '+esc(next.detail)+'</p><button class="button primary" data-page="'+next.page+'">Accéder à cette étape →</button></section>':'')+
      '<section class="card"><h2>Accès rapide</h2><div class="toolbar"><button class="button secondary" data-page="team">Bénévoles</button><button class="button secondary" data-page="creneaux">Shifts</button><button class="button secondary" data-page="concerts">Concerts</button><button class="button secondary" data-page="vehicles">Véhicules</button><button class="button secondary" data-page="planning">Planning</button></div></section>';
    wireNav();
  }

  /* ---------- Préparation : suite des écrans ---------- */
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

  function renderContacts(c,d) {
    var people=activeRows(d,'people').slice().sort(function(a,b){return String(a.firstName).localeCompare(String(b.firstName),'fr');}), refs=people.filter(function(p){return p.role==='referent';}), others=people.filter(function(p){return p.role!=='referent';});
    function call(p){return p.phone?'<a class="button secondary" href="tel:'+esc(String(p.phone).replace(/[^+0-9]/g,''))+'" aria-label="Appeler '+esc([p.firstName,p.lastName].join(' '))+'">☎</a>':'';}
    c.innerHTML=card('Référents','<div class="contact-ref-grid">'+refs.map(function(p){return '<div class="contact-ref">'+photo(p)+'<b>'+esc(p.firstName)+'</b>'+call(p)+'</div>';}).join('')+'</div>')+'<input class="search" id="contactSearch" type="search" placeholder="Rechercher un bénévole…" aria-label="Rechercher un bénévole">'+card('Bénévoles',others.map(function(p){var assignments=activeRows(d,'assignments').filter(function(a){return a.personId===p.id;});return '<div class="contact-compact" data-contact-name="'+esc([p.firstName,p.lastName].join(' ').toLowerCase())+'"><details><summary>'+photo(p)+'<b>'+esc([p.firstName,p.lastName].join(' '))+'</b></summary>'+assignments.map(function(a){var s=shift(a.shiftId)||{};return listRow(s.date||'',s.name||'Créneau','');}).join('')+(assignments.length?'':'<p>Aucun créneau publié.</p>')+(p.email?'<a class="button secondary" href="mailto:'+esc(p.email)+'">Écrire</a>':'')+'</details>'+call(p)+'</div>';}).join(''));
    var search=$('#contactSearch');if(search)search.oninput=function(){var q=search.value.toLowerCase().trim();Array.prototype.forEach.call(document.querySelectorAll('[data-contact-name]'),function(row){row.hidden=row.dataset.contactName.indexOf(q)<0;});};
  }

  /* Rôles, préparation et suivi terrain. Toutes les écritures sensibles sont
     contrôlées une seconde fois par Apps Script. */
  function activeRows(d, k) { return (d[k] || []).filter(function (x) { return !x.deleted && x.active !== false; }); }
  function options(rows, selected, label) { return rows.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + esc(label(x)) + '</option>'; }).join(''); }
  function photo(p) { return p.photo ? '<img class="avatar" src="' + esc(p.photo) + '" alt="">' : '<span class="avatar">' + esc((p.firstName || '?').slice(0, 1)) + '</span>'; }
  function field(f, key) { return f.elements[key] ? f.elements[key].value.trim() : ''; }
  function checkedIds(selector) { return Array.prototype.map.call(document.querySelectorAll(selector + ':checked'), function (x) { return x.value; }); }
  function onlineAction(action, payload) {
    if (!navigator.onLine) return Promise.reject(new Error('Connexion nécessaire pour cette action.'));
    return Transport.mutate(action, payload, Transport.requestId()).then(function (out) {
      if (out && out.conflict) throw new Error('Une autre modification existe : synchronise et recommence.');
      return Transport.sync(0, state.role).then(function (data) {
        state.data = mergeBundle(data); state.version = data.version || state.version; saveLocal(); render(); return out;
      });
    });
  }
  function submitTask(button, task) {
    if (button && button.disabled) return;
    if (button) button.disabled = true;
    return Promise.resolve().then(task).catch(function (e) { notice(String(e.message || e), 'error'); }).then(function () { if (button) button.disabled = false; });
  }
  function putRow(collection, row) {
    var old = (state.data[collection] || []).find(function (x) { return x.id === row.id; });
    return onlineAction('save', {collection: collection, row: Object.assign({}, old || {}, row), baseVersion: old ? old.version : 0, baseRow: old || null});
  }
  function period(row) {
    // Les horaires avant 06 h appartiennent à la nuit du jour du festival.
    function stamp(time, extra) {
      var date = new Date(row.date + 'T12:00:00Z'); if (!isFinite(date.getTime())) return Infinity; date.setUTCDate(date.getUTCDate() + extra);
      var day = date.toISOString().slice(0, 10), target = Date.parse(day + 'T' + time + ':00Z'), guess = target;
      for (var n = 0; n < 3; n++) {
        var parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
        var p = {}; parts.forEach(function (v) { p[v.type] = v.value; });
        guess += target - Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');
      }
      return guess;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '') || !/^\d{2}:\d{2}$/.test(row.start || '') || !/^\d{2}:\d{2}$/.test(row.end || '')) return [Infinity, Infinity];
    var extra = row.start < '06:00' ? 1 : 0;
    return [stamp(row.start, extra), stamp(row.end, extra + (row.end <= row.start ? 1 : 0))];
  }
  function concertPanel(d, all) {
    var rows = activeRows(d, 'concerts').sort(function (a,b) { return period(a)[0] - period(b)[0]; });
    var now = Date.now(), current = rows.filter(function (x) { var p=period(x); return p[0]<=now && now<p[1]; });
    var next = rows.find(function (x) { return period(x)[0]>now; });
    function row(x) { return listRow(x.artist || x.name || 'Concert', (x.date || '') + ' · ' + (x.scene || x.stage || ''), x.start+'–'+x.end); }
    return card('Concerts', (all ? rows.map(row).join('') : '<h3>En cours</h3>' + (current.map(row).join('') || '<p>Aucun concert en cours.</p>') + '<h3>Suivant</h3>' + (next ? row(next) : '<p>Aucun concert à venir.</p>') + '<details><summary>Tous les concerts</summary>' + rows.map(row).join('') + '</details>') || '<p>Programmation à venir.</p>');
  }
  function renderHome(c,d) {
    var ref = state.role === 'referent', now=Date.now(), ids=(d.assignments||[]).filter(function(a){return a.personId===(state.user||{}).id;}).map(function(a){return a.shiftId;});
    var shifts=activeRows(d,'shifts').filter(function(s){return ref || ids.indexOf(s.id)>=0;}).sort(function(a,b){return period(a)[0]-period(b)[0];});
    var current=shifts.filter(function(s){var p=period(s);return p[0]<=now&&p[1]>now;}), next=shifts.find(function(s){return period(s)[0]>now;});
    function slot(s){return '<button class="person-row" '+(ref?'data-terrain-shift="'+esc(s.id)+'"':'data-page="myshifts"')+'><span class="person-main"><b>'+esc(s.name)+'</b><small>'+esc(s.date+' · '+s.start+'–'+s.end)+'</small></span><span aria-hidden="true">›</span></button>';}
    var msgs=activeRows(d,'messages').slice(-3).reverse();
    c.innerHTML=card('Créneau en cours',current.map(slot).join('')||'<p>Aucun créneau en cours.</p>')+card('À venir',next?slot(next):'<p>Aucun créneau à venir.</p>')+
      card('Messages',msgs.map(function(m){return listRow(m.title,m.body,m.priority||'Info');}).join('')+'<button class="button secondary" data-page="messages">'+(ref?'Envoyer / gérer les messages':'Tous les messages')+'</button>')+
      concertPanel(d,false)+(d.config && d.config.formOpen && state.role!=='vehicles'?'<button class="button primary" data-page="form">Mon formulaire de disponibilités</button>':'')+
      (ref?'<button class="button secondary" data-page="contacts">Contacts</button><button class="button secondary" data-page="concerts">Tous les concerts</button>':'');
    wireManagement(); wireNav();
  }
  function formTracking(d) {
    return '<section class="form-tracking"><h3>Envoi et réponses</h3><p>« Envoyé » signifie accepté par le service mail, sans confirmation de réception.</p><div class="toolbar"><button class="button secondary" id="selectUnanswered">Sélectionner les non-répondants</button><button class="button primary" id="sendForms">Envoyer aux personnes cochées</button></div>'+activeRows(d,'people').map(function(p){
      var f=(d.forms||[]).find(function(x){return x.personId===p.id;}), reports=(d.deliveries||[]).filter(function(x){return x.personId===p.id&&x.kind==='form';}).sort(function(a,b){return String(b.at).localeCompare(String(a.at));}), last=reports[0];
      return '<label class="check"><input type="checkbox" name="formRecipient" value="'+esc(p.id)+'" data-answered="'+(f&&f.status==='Reçu'?'yes':'no')+'"><span><b>'+esc([p.firstName,p.lastName].join(' '))+'</b><br>'+esc(last?last.status+(last.error?' · '+last.error:''):'Non envoyé')+' · '+esc(f&&f.status==='Reçu'?'Répondu':f?'Commencé':'Sans réponse')+'</span></label>';
    }).join('')+'</section>';
  }
  function resetPanel() { return '<details class="card"><summary>Remise à zéro de l’édition</summary><p>Efface concerts, affectations, rotations, formulaires, messages, véhicules et suivis. Conserve les fiches bénévoles et les horaires des shifts. Les accès seront à recréer.</p><p>Les dossiers archivés dans Drive ne sont pas supprimés.</p><label>Recopie REMISE A ZERO<input id="resetConfirm" autocomplete="off"></label><button class="button danger" id="resetEdition">Remettre l’édition à zéro</button></details>'; }
  /* Simulations : consultation et calcul uniquement, jamais d'application automatique. */
  /* Simulations : vue par jour / colonnes de shifts. Brouillon local uniquement. */
  function simulationDraft(sim) {
    var key='bg_sim_draft_'+sim.id;
    if (!state.simDrafts) state.simDrafts={};
    if (!state.simDrafts[sim.id]) {
      var rows=null;
      try { rows=JSON.parse(localStorage.getItem(key)||'null'); } catch(e) {}
      state.simDrafts[sim.id]=Array.isArray(rows)?rows:(sim.assignments||[]).map(function(a){return Object.assign({},a);});
    }
    return state.simDrafts[sim.id];
  }
  function simShiftOrder(sh) {
    var id=String(sh.id||'');
    var match=id.match(/(\d+)$/);
    return match?Number(match[1]):999;
  }
  function simChoiceInfo(d, personId, sh, sim) {
    var forms=(sim&&sim.snapshot&&Array.isArray(sim.snapshot.forms))?sim.snapshot.forms:(d.forms||[]);
    var f=forms.filter(function(x){return x.personId===personId&&!x.deleted;})[0];
    var issues=[], color='red', info=[], concerts=[];
    if (!f) issues.push('Réponse au formulaire absente');
    var ch=f&&(f.choices||[]).find(function(x){return String(x.date||'').slice(0,10)===String(sh.date||'').slice(0,10);});
    var first=ch?String(ch.first||ch.choix_1||'').trim():'', second=ch?String(ch.second||ch.choix_2||'').trim():'';
    info.push('C1 : '+(first||'—')+' · C2 : '+(second||'—'));
    if(f&&!ch) issues.push('Aucun choix pour cette journée');
    if(ch){
      if(sh.id!==first&&sh.id!==second) issues.push('Shift '+sh.id+' hors des choix C1/C2');
      var work=ch.work===true||ch.work==='oui'||ch.contrainte_pro==='oui';
      var confirmed=ch.confirmWork===true||ch.confirmWork==='oui'||ch.confirmation_pro==='oui';
      if(work){
        info.push('Contrainte professionnelle'+(confirmed?' (confirmée)':''));
        if(!confirmed) issues.push('Contrainte professionnelle non confirmée');
      }
    }
    var wished=(f&&Array.isArray(f.concerts))?f.concerts:[];
    var catalogue=(sim&&sim.snapshot&&Array.isArray(sim.snapshot.concerts))?sim.snapshot.concerts:(d.concerts||[]);
    wished.forEach(function(id){
      var concert=catalogue.find(function(x){return String(x.id)===String(id);});
      if(!concert){return;} // Sans date vérifiable, ne pas attribuer un conflit à une journée arbitraire.
      // Les souhaits de concerts ne concernent que leur journée de festival.
      // Comparer les dates métier, sans reporter un concert du vendredi sur le jeudi.
      var jourConcert=String(concert.date||'').slice(0,10);
      var jourShift=String(sh.date||'').slice(0,10);
      if(!jourConcert||jourConcert!==jourShift)return;
      var label=concert.artist||concert.name||concert.id;
      var a=period(sh), b=period(concert);
      if(!isFinite(a[0])||!isFinite(a[1])||!isFinite(b[0])||!isFinite(b[1])){
        issues.push('Horaires non vérifiables : '+label);
        concerts.push(label+' (horaires inconnus)');
      }else if(a[0]<b[1]&&b[0]<a[1]){
        issues.push('Conflit concert : '+label);
        concerts.push(label+' (conflit)');
      }else concerts.push(label+' (compatible)');
    });
    if(concerts.length)info.push('Concerts : '+concerts.join(', '));
    if(!issues.length) color=sh.id===first?'green':sh.id===second?'orange':'red';
    var palette={green:{bg:'#d8f5df',border:'#27834a',fg:'#124f2c'},orange:{bg:'#ffe5bf',border:'#c67812',fg:'#754300'},red:{bg:'#ffe0df',border:'#bf3939',fg:'#781b1b'}};
    return {color:color,style:palette[color],lines:info,reasons:issues};
  }
  function renderSimulations(d) {
    var sims=activeRows(d,'simulations').slice().reverse();
    var html='<p class="muted">Vue par journée : sur mobile, utilise les flèches gauche/droite sous chaque fiche ; sur ordinateur, glisse la fiche ou utilise « Déplacer ici ». Aucun changement du planning officiel.</p>'+
      '<button type="button" class="button primary" id="runSimulation">Lancer une simulation</button>';
    if(!sims.length)return card('Simulations',html+'<p>Aucune simulation enregistrée.</p>');
    html+=sims.map(function(sim,idx){
      var assignments=simulationDraft(sim), shifts=activeRows(d,'shifts');
      var dates={};
      shifts.forEach(function(sh){if(sh.date)dates[sh.date]=true;});
      assignments.forEach(function(a){var sh=shift(a.shiftId);if(sh&&sh.date)dates[sh.date]=true;});
      var days=Object.keys(dates).sort().map(function(date){
        var cols=shifts.filter(function(sh){return sh.date===date;}).sort(function(a,b){return simShiftOrder(a)-simShiftOrder(b)||String(a.start||'').localeCompare(String(b.start||''));});
        var ids=cols.map(function(sh){return sh.id;});
        assignments.forEach(function(a){var sh=shift(a.shiftId);if(sh&&sh.date===date&&ids.indexOf(a.shiftId)<0){cols.push(sh);ids.push(sh.id);}});
        cols.sort(function(a,b){return simShiftOrder(a)-simShiftOrder(b)||String(a.start||'').localeCompare(String(b.start||''));});
        var total=assignments.filter(function(a){var sh=shift(a.shiftId);return sh&&sh.date===date;}).length;
        var label=new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
        var columns=cols.map(function(sh){
          var members=assignments.filter(function(a){return a.shiftId===sh.id;});
          return '<section class="sim-shift-column" data-sim-target="'+esc(sim.id)+'" data-sim-shift="'+esc(sh.id)+'" data-sim-date="'+esc(date)+'" style="flex:0 0 210px;min-width:210px;border:1px solid #d0d6dd;border-radius:10px;padding:10px;background:var(--card,#fff)">'+
            '<h3>'+esc(sh.id)+' <small>('+members.length+')</small></h3>'+
            '<p class="muted">'+esc((sh.start||'')+' – '+(sh.end||''))+'</p>'+
            '<button type="button" class="button secondary" data-sim-target="'+esc(sim.id)+'" data-sim-shift="'+esc(sh.id)+'" data-sim-date="'+esc(date)+'" style="width:100%;margin-bottom:8px">Déplacer ici</button>'+
            members.map(function(a){
              var check=simChoiceInfo(d,a.personId,sh,sim);
              var index=cols.findIndex(function(x){return x.id===sh.id;});
              var arrow=function(delta, label, symbol){
                var dest=cols[index+delta];
                return '<button type="button" class="button secondary" data-sim-arrow="'+delta+'" data-sim-person-id="'+esc(a.personId)+'" data-sim-source-id="'+esc(sh.id)+'" data-sim-id="'+esc(sim.id)+'" data-sim-day="'+esc(date)+'" data-sim-destination="'+esc(dest?dest.id:'')+'" '+(!dest?'disabled ':'')+'aria-label="'+esc(label+(dest?' vers '+dest.id:''))+'" style="flex:1;min-height:40px;padding:7px">'+symbol+'</button>';
              };
              return '<div style="margin:4px 0;background:'+check.style.bg+';border:2px solid '+check.style.border+';border-radius:8px;padding:4px;color:'+check.style.fg+'">'+
                '<button type="button" class="button secondary" draggable="true" data-sim-person="'+esc(a.personId)+'" data-sim-source="'+esc(sh.id)+'" data-sim-id="'+esc(sim.id)+'" data-sim-date="'+esc(date)+'" style="display:block;width:100%;text-align:left;white-space:normal;background:transparent;color:inherit;border:0">'+
                '<b>'+esc(personLabel(a.personId))+'</b>'+
                check.lines.map(function(line){return '<small style="display:block;margin-top:4px;font-weight:400">'+esc(line)+'</small>';}).join('')+
                (check.reasons.length?'<small style="display:block;margin-top:5px;font-weight:700">⚠ '+esc(check.reasons.join(' ; '))+'</small>':'')+'</button>'+
                '<div style="display:flex;gap:6px;margin-top:5px">'+arrow(-1,'Déplacer à gauche','←')+arrow(1,'Déplacer à droite','→')+'</div></div>';
            }).join('')+'</section>';
        }).join('');
        return '<details class="sim-day" '+(state.simOpenDay===sim.id+'|'+date?'open':'')+'><summary>'+esc(label)+' — '+total+' affectation(s), '+cols.length+' shifts</summary>'+
          '<div style="display:flex;gap:10px;overflow-x:auto;padding:12px 0;align-items:stretch">'+columns+'</div></details>';
      }).join('');
      return '<details class="sim-result" '+(idx===0?'open':'')+'><summary>'+esc(sim.name||'Simulation')+' — '+assignments.length+' affectation(s)'+(sim.stale?' (périmée)':'')+'</summary>'+
        '<p class="muted" id="simSelection-'+esc(sim.id)+'">Les déplacements sont sauvegardés sur cet appareil uniquement, pas dans le serveur.</p>'+
        '<button type="button" class="button secondary" data-sim-reset="'+esc(sim.id)+'">Annuler les déplacements locaux</button>'+days+'</details>';
    }).join('');
    return card('Simulations',html);
  }
  function wireSimulationMoves(){
    var host=$('#pageContent');
    if(!host)return;
    Array.prototype.forEach.call(host.querySelectorAll('.sim-day'),function(d){
      d.addEventListener('toggle',function(){if(d.open){var sim=d.closest('.sim-result');var id=sim&&sim.querySelector('[data-sim-reset]');state.simOpenDay=(id?id.dataset.simReset:'')+'|'+(d.querySelector('[data-sim-date]')||{}).dataset.simDate;}});
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-sim-person]'),function(b){
      b.onclick=function(){
        state.simPick={id:b.dataset.simId,personId:b.dataset.simPerson,source:b.dataset.simSource,date:b.dataset.simDate};
        Array.prototype.forEach.call(host.querySelectorAll('[data-sim-person]'),function(x){x.style.outline='';});
        b.style.outline='3px solid #16a34a';
        var msg=document.getElementById('simSelection-'+state.simPick.id);
        if(msg)msg.textContent=personLabel(state.simPick.personId)+' sélectionné : clique sur « Déplacer ici » dans une autre colonne.';
      };
      b.addEventListener('dragstart',function(e){
        state.simPick={id:b.dataset.simId,personId:b.dataset.simPerson,source:b.dataset.simSource,date:b.dataset.simDate};
        if(e.dataTransfer)e.dataTransfer.setData('text/plain',b.dataset.simPerson);
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('.sim-shift-column'),function(b){
      function move(){
        var pick=state.simPick;
        if(!pick||pick.id!==b.dataset.simTarget||pick.date!==b.dataset.simDate){notice('Sélectionne un bénévole de cette journée.','error');return;}
        if(pick.source===b.dataset.simShift){notice('Ce bénévole est déjà dans ce shift.','info');return;}
        var sim=activeRows(state.data,'simulations').find(function(x){return x.id===pick.id;});
        if(!sim)return;
        var rows=simulationDraft(sim);
        var row=rows.find(function(a){return a.personId===pick.personId&&a.shiftId===pick.source;});
        if(!row){notice('Affectation introuvable.','error');return;}
        if(rows.some(function(a){return a.personId===pick.personId&&a.shiftId===b.dataset.simShift;})){notice('Ce bénévole est déjà affecté à ce shift.','error');return;}
        row.shiftId=b.dataset.simShift;
        try{localStorage.setItem('bg_sim_draft_'+sim.id,JSON.stringify(rows));}catch(e){notice('Déplacement local non sauvegardé : stockage indisponible.','error');}
        state.simOpenDay=sim.id+'|'+pick.date;
        state.simPick=null;
        render();
        notice('Bénévole déplacé dans le brouillon. Planning officiel inchangé.','success');
      }
      b.moveSim=move;
      var button=b.querySelector('button[data-sim-target]');
      if(button)button.onclick=move;
      b.addEventListener('dragover',function(e){
        var pick=state.simPick;
        if(!pick||pick.id!==b.dataset.simTarget||pick.date!==b.dataset.simDate)return;
        e.preventDefault();
        if(e.dataTransfer)e.dataTransfer.dropEffect='move';
        b.style.outline='3px dashed #268a9d';
      });
      b.addEventListener('dragleave',function(e){
        if(!e.relatedTarget||!b.contains(e.relatedTarget))b.style.outline='';
      });
      b.addEventListener('drop',function(e){
        e.preventDefault();e.stopPropagation();b.style.outline='';move();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-sim-arrow]'),function(button){
      button.onclick=function(e){
        e.preventDefault();e.stopPropagation();
        var dest=button.dataset.simDestination;
        if(!dest)return;
        state.simPick={id:button.dataset.simId,personId:button.dataset.simPersonId,source:button.dataset.simSourceId,date:button.dataset.simDay};
        var target=Array.prototype.find.call(host.querySelectorAll('.sim-shift-column'),function(col){
          return col.dataset.simTarget===state.simPick.id&&col.dataset.simDate===state.simPick.date&&col.dataset.simShift===dest;
        });
        if(target&&target.moveSim)target.moveSim();
        else notice('Créneau de destination introuvable.','error');
      };
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-sim-reset]'),function(b){
      b.onclick=function(){
        if(!window.confirm('Annuler tous les déplacements locaux de cette simulation ?'))return;
        var id=b.dataset.simReset,sim=activeRows(state.data,'simulations').find(function(x){return x.id===id;});
        if(!sim)return;
        if(!state.simDrafts)state.simDrafts={};
        state.simDrafts[id]=(sim.assignments||[]).map(function(a){return Object.assign({},a);});
        try{localStorage.removeItem('bg_sim_draft_'+id);}catch(e){}
        state.simPick=null;render();
      };
    });
  }
  function renderPlanning(c,d) {
    var admin=state.role==='admin', rows=activeRows(d,'assignments');
    c.innerHTML=(admin?renderSimulations(d):'')+(admin?card('Créer / modifier une affectation','<form id="assignmentForm" class="form-grid"><input type="hidden" name="id"><label>Bénévole<select name="personId">'+options(activeRows(d,'people'),' ',function(p){return [p.firstName,p.lastName].join(' ');})+'</select></label><label>Shift<select name="shiftId">'+options(activeRows(d,'shifts'),' ',function(s){return s.date+' · '+s.name;})+'</select></label><button class="button primary">Enregistrer l’affectation</button></form>')+'<p class="notice">Brouillon admin. Les autres rôles consultent uniquement la dernière version publiée.</p><div class="toolbar"><button class="button secondary" data-plan="rotations">Calculer les rotations</button><button class="button secondary" data-plan="checks">Contrôler le planning</button><button class="button secondary" data-plan="validate">Valider le planning</button><button class="button primary" data-plan="publish">Publier le planning</button><button class="button secondary" data-plan="reopen">Réouvrir les modifications</button></div>':'')+
      card(admin?'Affectations de travail':'Planning publié',rows.map(function(a){var s=shift(a.shiftId)||{};return listRow(personLabel(a.personId),(s.date||'')+' · '+(s.name||''),'')+(admin?'<div class="toolbar"><button class="button secondary" data-assignment-edit="'+esc(a.id)+'">Modifier</button><button class="button danger" data-assignment-remove="'+esc(a.id)+'">Retirer</button></div>':'');}).join('')||'<p>Aucune affectation.</p>');
    if(admin && state.planningChecks) c.innerHTML += card('Contrôles',state.planningChecks.map(function(x){return listRow(x.message || x.title || x.type || 'Contrôle',x.detail || x.description || '',x.level)+(x.level==='orange'?'<button class="button secondary" data-accept-check="'+esc(x.id)+'">Accepter cette alerte</button>':'');}).join('') || '<p>Aucune anomalie détectée.</p>');
    wireManagement();
    if(admin)wireSimulationMoves();
  }
  function renderMessages(c,d) {
    var can=state.role==='admin'||state.role==='referent', msgs=activeRows(d,'messages');
    c.innerHTML=(can?'<article class="card"><h2>Rédiger un message</h2><form id="messageForm" class="form-grid"><input type="hidden" name="id"><label>Titre<input name="title" required></label><label>Priorité<select name="priority"><option>Info</option><option>Urgent</option></select></label><label class="full">Message<textarea name="body" rows="4" required></textarea></label><label class="full">Destinataires<select name="target"><option value="all">Toute l’équipe</option>'+options(activeRows(d,'people'),'',function(p){return [p.firstName,p.lastName].join(' ');})+'</select></label><p class="full muted">Le message sera visible dans l’application des destinataires.</p><button class="button primary">Envoyer / enregistrer</button></form></article>':'')+
      msgs.slice().reverse().map(function(m){return card(m.title,'<p class="message-body">'+esc(m.body)+'</p>'+(can?'<button class="button secondary" data-message-edit="'+esc(m.id)+'">Modifier</button>':'')+((d.reads||[]).some(function(r){return r.messageId===m.id&&r.personId===(state.user||{}).id;})?'<span class="badge good">Lu</span>':'<button class="button secondary" data-message-read="'+esc(m.id)+'">J’ai lu</button>'));}).join('');
    wireManagement();
  }
  function renderTerrain(c,d) {
    if (state.role!=='referent'&&state.role!=='admin') {c.innerHTML=empty('Accès réservé','Suivi terrain réservé aux référents.');return;}
    var sid=state.terrainShift||'', members=activeRows(d,'assignments').filter(function(a){return a.shiftId===sid;}).map(function(a){return (d.people||[]).find(function(p){return p.id===a.personId;});}).filter(Boolean);
    c.innerHTML=card('Changement de poste','<form id="terrainForm" class="form-grid"><label>Shift<select name="shiftId" id="terrainShift">'+options(activeRows(d,'shifts'),sid,function(s){return s.date+' · '+s.name;})+'</select></label><label>Bénévole<select name="personId">'+options(members,'',function(p){return [p.firstName,p.lastName].join(' ');})+'</select></label><label>Nouveau poste<select name="role"><option>Conducteur</option><option>Chargeur</option></select></label><label>Motif<textarea name="note" required></textarea></label><button class="button primary">Enregistrer le changement</button></form>')+
      card('Historique du shift',activeRows(d,'terrain').filter(function(t){return t.shiftId===sid;}).map(function(t){return listRow(personLabel(t.personId),t.role+' · '+(t.note||''),t.acknowledged?'Confirmé':'À confirmer');}).join('')||'<p>Aucun changement.</p>');wireManagement();
  }
  function receptionDetails(r) {
    var labels={plate:'Immatriculation',make:'Marque',model:'Modèle',color:'Couleur',type:'Type',driverName:'Conducteur',operatorName:'Opérateur',mileage:'Kilométrage',fuel:'Carburant',notes:'Observations'};
    function media(url,label){return url && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(url)?'<figure><img class="reception-evidence" src="'+esc(url)+'" alt="'+esc(label)+'"><figcaption>'+esc(label)+'</figcaption></figure>':'';}
    return Object.keys(labels).map(function(k){return listRow(labels[k],r[k]===undefined?'Non renseigné':String(r[k]),'');}).join('')+
      media(r.odometerPhoto,'Photo du compteur')+media(r.fuelPhoto,'Photo de la jauge')+
      (r.damages||[]).map(function(x){return listRow(x.zone||'Dommage',(x.type||'')+' · '+(x.description||''),x.status||'')+media(x.photo,'Photo du dommage');}).join('')+
      [r.signature1,r.signature2].filter(Boolean).map(function(x){return listRow('Signé par',x.name||'',x.at||'');}).join('');
  }
  function renderVehicles(c,d) {
    var rows=activeRows(d,'vehicles'), v=(d.vehicles||[]).find(function(x){return x.id===state.vehicleId&&!x.deleted;});
    if(!v) {c.innerHTML=(state.role==='vehicles'?'<a class="button primary" href="./reception.html">Réception / retour véhicule</a>':'')+(d.vehicles||[]).filter(function(x){return !x.deleted;}).map(function(x){return '<button class="card person-row" data-vehicle="'+esc(x.id)+'"><span class="person-main"><b>'+esc(x.plate||'Véhicule')+'</b><small>'+esc([x.make,x.model].filter(Boolean).join(' '))+'</small></span><span class="badge">'+(x.active===false?'HS':'En service')+'</span></button>';}).join('');if(!c.innerHTML)c.innerHTML=empty('Aucun véhicule','Les véhicules reçus apparaîtront ici.');wireManagement();return;}
    var manager=state.role==='admin'||state.role==='referent';
    c.innerHTML='<button class="button secondary" id="vehiclesBack">‹ Tous les véhicules</button>'+card(v.plate,[['Marque',v.make],['Modèle',v.model],['Type',v.type],['Couleur',v.color],['État',v.active===false?'Hors service':'En service'],['Essence',v.fuelAlert?'Plein à faire':'Aucune alerte']].map(function(x){return listRow(x[0],x[1]||'Non renseigné','');}).join(''))+
      card('Pannes et essence',(d.incidents||[]).filter(function(i){return i.vehicleId===v.id&&!i.deleted;}).map(function(i){return listRow(i.type,i.description||'',i.status)+(manager&&i.status!=='Clos'?'<button class="button secondary" data-incident-close="'+esc(i.id)+'">'+(i.type==='Plein à faire'?'Plein effectué':'Clore l’incident')+'</button>':'');}).join('')||'<p>Aucun signalement.</p>')+
      (manager?'<form id="incidentForm" class="form-grid"><input type="hidden" name="vehicleId" value="'+esc(v.id)+'"><label>Signalement<select name="type"><option>Panne</option><option>Plein à faire</option><option>Autre</option></select></label><label>Description<textarea name="description"></textarea></label><button class="button primary">Enregistrer le signalement</button></form>':'')+
      card('Réceptions et retours — consultation',(d.receptions||[]).filter(function(r){return r.vehicleId===v.id||String(r.plate).replace(/[^A-Z0-9]/gi,'').toUpperCase()===String(v.plate).replace(/[^A-Z0-9]/gi,'').toUpperCase();}).map(function(r){return '<details><summary>'+esc((r.direction||'Réception')+' · '+(r.status||'')+' · '+(r.createdAt||r.at||''))+'</summary>'+receptionDetails(r)+(r.pdfUrl&&/^https:\/\//.test(r.pdfUrl)?'<a class="button secondary" target="_blank" rel="noopener" href="'+esc(r.pdfUrl)+'">Voir le constat PDF</a>':'')+'</details>';}).join('')||'<p>Aucun constat disponible.</p>');wireManagement();
  }
  function renderVolunteerForm(c,d) {
    var p=(d.people||[]).find(function(p){return p.id===(state.user||{}).id;});
    if(!p){c.innerHTML=empty('Formulaire personnel','Ouvre une session bénévole pour répondre.');return;}
    var old=(d.forms||[]).find(function(f){return f.personId===p.id;})||{}, slots=activeRows(d,'shifts').filter(function(s){return !s.brunch&&(s.day!=='mercredi'||p.wednesday);}), dates=Array.from(new Set(slots.map(function(s){return s.date;}))).sort();
    c.innerHTML='<form id="volunteerForm" class="form-grid"><h2 class="full">Mes disponibilités</h2>'+dates.map(function(date,i){var choice=(old.choices||[]).find(function(c){return c.date===date;})||{}, rows=slots.filter(function(s){return s.date===date;});return '<fieldset class="full" data-choice-date="'+esc(date)+'"><legend>'+esc(date)+'</legend><label>Premier choix<select name="first'+i+'">'+options(rows,choice.first,function(s){return s.name;})+'</select></label><label>Second choix<select name="second'+i+'"><option value="">Choisir</option>'+options(rows,choice.second,function(s){return s.name;})+'</select></label><label class="check"><input type="checkbox" name="work'+i+'"'+(choice.work?' checked':'')+'>Contrainte professionnelle : je confirme ne pouvoir proposer qu’un seul choix</label></fieldset>';}).join('')+'<fieldset class="full"><legend>Concerts souhaités (3 maximum)</legend>'+activeRows(d,'concerts').map(function(x){return '<label class="check"><input type="checkbox" name="favoriteConcert" value="'+esc(x.id)+'"'+((old.concerts||[]).indexOf(x.id)>=0?' checked':'')+'>'+esc(x.artist+' · '+x.date+' · '+x.start)+'</label>';}).join('')+'</fieldset><label class="full">Note du formulaire<textarea name="note">'+esc(old.note||'')+'</textarea></label><label class="check full"><input type="checkbox" name="confirmOrange"'+(old.confirmOrange?' checked':'')+'>J’accepte les chevauchements de concerts de 30 minutes maximum</label><button class="button primary">Envoyer ma réponse</button></form>';wireManagement();
  }
  function wireManagement() {
    function clicks(selector, fn) {Array.prototype.forEach.call(document.querySelectorAll(selector),function(b){b.onclick=function(){return fn(b);};});}
    clicks('[data-terrain-shift]',function(b){state.terrainShift=b.dataset.terrainShift;go('terrain');});
    clicks('[data-vehicle]',function(b){state.vehicleId=b.dataset.vehicle;render();});
    var back=$('#vehiclesBack');if(back)back.onclick=function(){state.vehicleId='';render();};
    var select=$('#selectUnanswered');if(select)select.onclick=function(){Array.prototype.forEach.call(document.querySelectorAll('[name="formRecipient"]'),function(x){x.checked=x.dataset.answered==='no';});};
    var sendForms=$('#sendForms');if(sendForms)sendForms.onclick=function(){var ids=checkedIds('[name="formRecipient"]');if(!ids.length){notice('Coche au moins une personne.','error');return;}if(!window.confirm('Envoyer le formulaire par e-mail aux '+ids.length+' personnes sélectionnées ?'))return;submitTask(sendForms,function(){return onlineAction('sendForms',{people:ids}).then(function(){notice('Envoi traité. Consulte le suivi pour les éventuels échecs.','success');});});};
    var reset=$('#resetEdition');if(reset)reset.onclick=function(){if($('#resetConfirm').value!=='REMISE A ZERO'){notice('Recopie REMISE A ZERO pour confirmer.','error');return;}submitTask(reset,function(){return (window.Queue?Queue.list():Promise.resolve([])).then(function(rows){if(rows.length)throw Error('Vide ou résous les actions hors ligne avant la remise à zéro.');if(!window.confirm('Effacer les données de l’édition ? Fiches bénévoles et horaires seront conservés.'))return;return onlineAction('resetEdition',{confirm:'REMISE A ZERO'});});});};
    clicks('[data-message-read]',function(b){submitTask(b,function(){return onlineAction('read',{messageId:b.dataset.messageRead});});});
    clicks('[data-message-edit]',function(b){var m=(state.data.messages||[]).find(function(m){return m.id===b.dataset.messageEdit;}),f=$('#messageForm');if(!f||!m)return;['id','title','body','priority'].forEach(function(k){f.elements[k].value=m[k]|| (k==='priority'?'Info':'');});f.elements.target.value=m.targets&&m.targets.all?'all':((m.targets||{}).people||[])[0]||'all';f.scrollIntoView({block:'start'});});
    var message=$('#messageForm');if(message)message.onsubmit=function(e){e.preventDefault();submitTask(message.querySelector('button'),function(){var target=field(message,'target');return putRow('messages',{id:field(message,'id')||Transport.requestId(),title:field(message,'title'),body:field(message,'body'),priority:field(message,'priority'),urgent:field(message,'priority')==='Urgent',targets:target==='all'?{all:true}:{people:[target]},active:true});});};
    clicks('[data-assignment-edit]',function(b){var a=(state.data.assignments||[]).find(function(a){return a.id===b.dataset.assignmentEdit;}),f=$('#assignmentForm');if(a&&f){['id','personId','shiftId'].forEach(function(k){f.elements[k].value=a[k]||'';});f.scrollIntoView({block:'start'});}});
    clicks('[data-assignment-remove]',function(b){if(window.confirm('Retirer cette affectation du planning de travail ?'))submitTask(b,function(){return onlineAction('remove',{collection:'assignments',id:b.dataset.assignmentRemove});});});
    var assignment=$('#assignmentForm');if(assignment)assignment.onsubmit=function(e){e.preventDefault();submitTask(assignment.querySelector('button'),function(){return putRow('assignments',{id:field(assignment,'id')||Transport.requestId(),personId:field(assignment,'personId'),shiftId:field(assignment,'shiftId')});});};
    var runSimulation = $('#runSimulation');
    if (runSimulation) runSimulation.onclick = function () {
      if (!window.confirm('Lancer un calcul de simulation ? Aucune affectation ne sera appliquée automatiquement.')) return;
      submitTask(runSimulation, function () {
        return onlineAction('simulate', {name:'Simulation ' + new Date().toLocaleString('fr-FR')})
          .then(function () { notice('Simulation calculée. Consulte les résultats ci-dessus.', 'success'); });
      });
    };
    clicks('[data-plan]',function(b){var action=b.dataset.plan,payload={};if(action==='checks'){submitTask(b,function(){return Transport.mutate('planningChecks',{},Transport.requestId()).then(function(out){state.planningChecks=out.checks;render();});});return;}if(action==='publish'&&!window.confirm('Publier ce planning et lancer les e-mails de publication ?'))return;if(action==='reopen'){payload.reason=window.prompt('Motif de réouverture :');if(!payload.reason)return;}submitTask(b,function(){return onlineAction(action,payload);});});
    clicks('[data-accept-check]',function(b){submitTask(b,function(){return onlineAction('acceptCheck',{id:b.dataset.acceptCheck});});});
    var terrain=$('#terrainForm');if(terrain)terrain.onsubmit=function(e){e.preventDefault();submitTask(terrain.querySelector('button'),function(){return putRow('terrain',{id:Transport.requestId(),personId:field(terrain,'personId'),shiftId:field(terrain,'shiftId'),role:field(terrain,'role'),note:field(terrain,'note'),status:'Modification'});});};
    var ts=$('#terrainShift');if(ts)ts.onchange=function(){state.terrainShift=ts.value;render();};
    var incident=$('#incidentForm');if(incident)incident.onsubmit=function(e){e.preventDefault();submitTask(incident.querySelector('button'),function(){return onlineAction('incident',{vehicleId:field(incident,'vehicleId'),type:field(incident,'type'),description:field(incident,'description')});});};
    clicks('[data-incident-close]',function(b){submitTask(b,function(){return onlineAction('closeIncident',{id:b.dataset.incidentClose});});});
    var vf=$('#volunteerForm');if(vf)vf.onsubmit=function(e){e.preventDefault();var old=(state.data.forms||[]).find(function(f){return f.personId===state.user.id;})||{};var choices=Array.prototype.map.call(vf.querySelectorAll('[data-choice-date]'),function(x,i){var work=vf.elements['work'+i].checked;return {date:x.dataset.choiceDate,first:field(vf,'first'+i),second:work?'':field(vf,'second'+i),work:work,confirmWork:work};});var data=Object.assign({},old,{personId:state.user.id,choices:choices,concerts:checkedIds('[name="favoriteConcert"]'),note:field(vf,'note'),confirmOrange:vf.elements.confirmOrange.checked});submitTask(vf.querySelector('button'),function(){return onlineAction('formSubmit',data).then(function(){notice('Réponse enregistrée.','success');});});};
  }

  function start() {
    hideBoot();
    var l = $("#loginScreen"); if (l) l.classList.add("hidden");
    var s = $("#appShell"); if (s) s.classList.remove("hidden");
    var rl = $("#roleLabel"); if (rl) rl.textContent = ROLE[state.role] || "Bénévole";
    var ul = $("#userLabel"); if (ul) ul.textContent = (state.user && state.user.name) || "Mon espace";
    var ua = $("#userAvatar");
    if (ua) ua.textContent = String((state.user && state.user.name) || "B").trim().slice(0, 1).toUpperCase();
    if (state.role === "admin") state.page = "dashboard";
    else state.page = "home";
    nav();
    setTitle();
    render();
    syncBadge();
    wirePageContent();
  }

  /* ---------- Envoi ---------- */
  function send(action, data, okMessage) {
    var opId = Transport.requestId();
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ action: action, payload: data, opId: opId }).then(function () {
        notice("Action enregistrée hors ligne. Elle partira au retour du réseau.", "info");
        return refreshPending();
      });
    }
    return Transport.mutate(action, data, opId).then(function (out) {
      if (okMessage) notice(okMessage, "success");
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && ((e && e.name === "TypeError") || msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        return Queue.enqueue({ action: action, payload: data, opId: opId }).then(function () {
          notice("Réseau instable : action gardée et envoyée plus tard.", "info");
          return refreshPending();
        });
      }
      notice(msg, "error");
      throw e;
    });
  }

  /* ------------------------------------------------------------------
   * SUPPRESSION RÉELLE
   *
   * Une suppression n'est PAS une sauvegarde avec active:false. Elle
   * envoie l'action "remove" et la seule clé qui identifie la ligne :
   * son id. Jamais la date, le jour, l'artiste ou un rang de tableau.
   *
   * Le serveur fait le reste : recherche par id, retrait, renumérotation
   * de la journée, réécriture de la feuille.
   * ------------------------------------------------------------------ */
  function sendRemove(collection, id) {
    var opId = Transport.requestId();
    var cible = String(id || "");
    if (!cible) {
      return Promise.reject(new Error("Suppression impossible : identifiant manquant."));
    }

    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ opId: opId, collection: collection, action: "remove", entityId: cible, payload: { collection: collection, id: cible } })
        .then(function () {
          notice("Suppression enregistrée hors ligne. Envoi au retour du réseau.", "info");
          return refreshPending();
        });
    }

    return Transport.mutate("remove", { collection: collection, id: cible }, opId)
      .then(function (out) { return out; })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        if (window.Queue && ((e && e.name === "TypeError") || msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
          return Queue.enqueue({ opId: opId, collection: collection, action: "remove", entityId: cible, payload: { collection: collection, id: cible } })
            .then(function () {
              notice("Réseau instable : suppression gardée pour envoi.", "info");
              return refreshPending();
            });
        }
        throw e;
      });
  }

  function sendSave(collection, row, baseVersion, baseRow) {
    var opId = Transport.requestId();
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ opId: opId, collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
        .then(function () { notice("Enregistré hors ligne. Envoi au retour du réseau.", "info"); return refreshPending().then(function () { return { queued: true, row: row }; }); });
    }
    return Transport.save(collection, row, baseVersion, baseRow, opId).then(function (out) {
      if (out && out.conflict) {
        notice("Conflit détecté : une autre personne a modifié cette fiche.", "error");
        throw new Error("Conflit détecté. La fiche n’a pas été enregistrée : synchronise avant de reprendre.");
      }
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && ((e && e.name === "TypeError") || msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        return Queue.enqueue({ opId: opId, collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
          .then(function () { notice("Réseau instable : fiche gardée pour envoi.", "info"); return refreshPending().then(function () { return { queued: true, row: row }; }); });
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
    state.open = "";
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    Transport.setToken("");
    state.syncError = "";
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
      var conflicts = (rows || []).filter(function (x) { return x.state === "conflict" && x.authorId === (state.user && state.user.id); });
      if (conflicts.length) notice(conflicts.length + " modification(s) en conflit à arbitrer.", "error");
    }).catch(function () {});
  }

  function syncNow() {
    if (!state.user || !state.role) return Promise.resolve();
    if (!navigator.onLine) { syncBadge(); return; }
    return Transport.sync(state.version, state.role).then(function (bundle) {
      state.data = mergeBundle(bundle);
      state.syncError = "";
      state.version = (bundle && bundle.version) || state.version;
      return flushQueue().then(function () { return Transport.sync(state.version, state.role); }).then(function (next) {
        state.data = mergeBundle(next); state.version = next.version || state.version;
        return Queue.list();
      }).then(function (rows) {
        rows.filter(function (r) { return r.authorId === (state.user && state.user.id) && (r.state === "pending" || r.state === "blocked"); }).forEach(function (r) {
          if (!r.collection) return;
          if (r.action === "remove") state.data[r.collection] = (state.data[r.collection] || []).filter(function (x) { return x.id !== r.entityId; });
          else state.data[r.collection] = (state.data[r.collection] || []).filter(function (x) { return x.id !== (r.value || {}).id; }).concat([r.value]);
        });
        saveLocal(); if (!document.querySelector("#pageContent form, .acc-body .form-grid")) render();
      });
    }).then(function () { return refreshPending(); })
      .catch(function (e) {
        if (e && e.message === "SESSION_EXPIRED") { Transport.setToken(""); window.logout(); return; }
        state.syncError = String((e && e.message) || e);
        syncBadge(); notice(state.syncError, "error");
      });
  }

  var sn = $("#syncNow");
  if (sn) sn.onclick = function () { syncNow(); };
  window.addEventListener("online", function () { syncNow(); });
  window.addEventListener("offline", function () { syncBadge(); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function () {});

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
