/* Beauregard V2 â€” app.js (socle, Ã‰quipe, CrÃ©neaux, Concerts, PrÃ©paration)
 * Transport = fetch GET JSON, repris de la V1.
 * Queue = file d'actions hors ligne (IndexedDB, point 62 du cahier des charges).
 *
 * Synchronisation : le serveur renvoie un paquet complet au premier appel,
 * puis seulement les Ã©lÃ©ments modifiÃ©s. L'application FUSIONNE ces paquets.
 *
 * CrÃ©neaux et Concerts : un seul Ã©couteur de clic, posÃ© sur #pageContent qui
 * existe en permanence. Il n'est jamais posÃ© sur les boutons eux-mÃªmes :
 * les boutons sont dÃ©truits et recrÃ©Ã©s Ã  chaque render().
 * L'enregistrement ne dÃ©pend plus de l'Ã©vÃ©nement submit.
 *
 * SUPPRESSION : une action "remove", jamais un active:false.
 * La ligne est retirÃ©e par son id, rien d'autre.
 *
 * PRÃ‰PARATION : quatre blocs dÃ©pliables, chacun s'enregistrant seul.
 * Voir renderSetup et saveSetupBloc pour la double nomenclature
 * lecture (bundle) / Ã©criture (feuille CONFIG_EDITION).
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

  var ROLE = { benevole: "BÃ©nÃ©vole", referent: "RÃ©fÃ©rent", admin: "Organisation", vehicles: "VÃ©hicules" };

  var ICON = {
    Accueil: "\u2302", "Mes crÃ©neaux": "\u25A6", Planning: "\u25A4", Contacts: "\u2663",
    Ã‰quipe: "\u2659", VÃ©hicules: "\u25B0", Messages: "\u2709", Outils: "\u2699",
    "PrÃ©paration": "\u25F7", "CrÃ©neaux": "\u25F4", "Concerts": "\u266B",
    Formulaires: "\u25A7", Simulations: "\u27F3", Arbitrages: "\u25C7",
    Rotations: "\u21BB", ContrÃ´les: "\u2713", Validation: "\u25C9", Publication: "\u2197", Terrain: "\u2316"
  };

  var NAV = {
    benevole: [["Accueil", "home"], ["Mes crÃ©neaux", "myshifts"], ["Planning", "planning"], ["Contacts", "contacts"]],
        referent: [["Équipe", "team"], ["Créneaux", "creneaux"], ["Planning", "planning"], ["Véhicules", "vehicles"], ["Messages", "messages"], ["Contacts", "contacts"]],
    admin: [
      [["Préparation", "setup"], ["Bénévoles", "team"], ["Concerts", "concerts"],
      ["Véhicules", "vehicles"], ["Messages", "messages"], ["Contacts", "contacts"]
    ],

    vehicles: [["Accueil", "home"], ["VÃ©hicules", "vehicles"]]
  };

  var META = {
    home: ["MON FESTIVAL", "Accueil", "L'essentiel de ton engagement, disponible hors ligne."],
    myshifts: ["MON ENGAGEMENT", "Mes crÃ©neaux", "Tes missions, tes rÃ´les et tes horaires."],
    planning: ["ORGANISATION", "Planning gÃ©nÃ©ral", "Les affectations publiÃ©es, sans donnÃ©e privÃ©e."],
    contacts: ["CARNET D'Ã‰QUIPE", "Contacts", "Les personnes utiles pendant le festival."],
    team: ["Ã‰QUIPE", "BÃ©nÃ©voles", "Fiches, contraintes et accÃ¨s de l'Ã©dition."],
    vehicles: ["LOGISTIQUE", "VÃ©hicules", "Parc, Ã©tats des lieux et incidents."],
    messages: ["INFORMATIONS", "Messages", "Consignes et actualitÃ©s de l'Ã©quipe."],
    tools: ["ESPACE RÃ‰FÃ‰RENT", "Outils", "AccÃ¨s aux modules de suivi."],
    setup: ["CYCLE DE L'Ã‰DITION", "PrÃ©paration", "ParamÃ¨tres et progression de l'Ã©dition."],
    creneaux: ["CYCLE DE L'Ã‰DITION", "CrÃ©neaux & missions", "Horaires, effectifs et journÃ©es de l'Ã©dition."],
    concerts: ["PROGRAMMATION", "Concerts", "Artistes, scÃ¨nes et horaires de passage."],
    forms: ["INSCRIPTIONS", "Formulaires", "Ouverture et suivi des disponibilitÃ©s."],
    simulations: ["AFFECTATIONS", "Simulations", "Construire puis comparer les propositions."],
    arbitrations: ["DÃ‰CISIONS", "Arbitrages", "Traiter les points Ã  dÃ©cider."],
    rotations: ["Ã‰QUILIBRE", "Rotations", "RÃ©partition Conducteur / Chargeur."],
    checks: ["QUALITÃ‰", "ContrÃ´les", "RepÃ©rer et rÃ©soudre les anomalies."],
    validation: ["AVANT PUBLICATION", "Validation", "DerniÃ¨res vÃ©rifications du planning."],
    publication: ["MISE EN LIGNE", "Publication", "Publier la version retenue."],
    terrain: ["PENDANT LE FESTIVAL", "Suivi terrain", "CrÃ©neaux et changements sur place."]
  };

  var COLLECTIONS = [
    "people", "access", "shifts", "missions", "concerts", "forms", "simulations",
    "assignments", "rotations", "arbitrations", "terrain", "vehicles",
    "receptions", "incidents", "messages", "reads", "publications",
    "conflicts", "amendments", "deliveries"
  ];

  var state = {
    user: null, role: "", data: null, page: "home", version: 0, pending: 0,
    personId: "", shiftMode: "", shiftId: "", concertMode: "", concertId: "", open: ""
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
      text = state.pending ? "Hors ligne Â· " + state.pending + " modification(s) en attente" : "Hors ligne Â· donnÃ©es disponibles";
      kind = "offline";
    } else if (state.pending) {
      text = state.pending + " modification(s) en attente";
      kind = "busy";
    } else {
      text = "En ligne Â· Ã  jour";
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
    document.title = m[1] + " â€” Beauregard";
  }

  function nav() {
    var items = NAV[state.role] || NAV.benevole;
    var make = function (it) {
      return '<button class="nav-link ' + (state.page === it[1] ? "active" : "") +
        '" data-page="' + it[1] + '"><span class="nav-icon">' + (ICON[it[0]] || "â€¢") +
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
        (ICON[it[0]] || "â€¢") + "</span><span>" + esc(it[0]) + "</span></button>";
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
    return p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "â€”";
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
    c.innerHTML = empty("Module en prÃ©paration", "Cet Ã©cran sera branchÃ© Ã  l'Ã©tape suivante.");
  }

  /* ---------- Ã‰quipe ---------- */
  function renderTeam(c, d) {
    var T = window.ScreenTeam;
    if (!T) { c.innerHTML = empty("Ã‰cran indisponible", "Le module Ã‰quipe n'est pas chargÃ©."); return; }
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
    if (!data.lastName || !data.firstName) { notice("Nom et prÃ©nom obligatoires.", "error"); return; }

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
        notice("Fiche enregistrÃ©e.", "success");
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
    if (!window.confirm("Supprimer la fiche de " + personLabel(id) + " ?\nLa personne sera retirÃ©e de la base active.")) return;
    var row = Object.assign({}, p, { deleted: true });
    sendSave("people", row, p.version || 0, p)
      .then(function () {
        state.data.people = (state.data.people || []).filter(function (x) { return x.id !== id; });
        saveLocal();
        state.personId = "";
        notice("Fiche supprimÃ©e.", "success");
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
    if (!target) { notice("Aucune fiche sÃ©lectionnÃ©e.", "error"); return; }

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
    var people = (state.data.people || []).filter(function (p) { return !p.deleted && p.status !== "DÃ©sistÃ©"; });
    if (!people.length) { notice("Aucune personne active.", "error"); return; }
    if (!window.confirm("CrÃ©er les accÃ¨s pour " + people.length + " personne(s) ?\nLes codes existants seront remplacÃ©s.")) return;

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
        function () { notice("Liste copiÃ©e.", "success"); },
        function () { notice("Copie impossible sur cet appareil.", "error"); }
      );
    } else {
      notice("Copie impossible sur cet appareil.", "error");
    }
  }

  /* ---------- CrÃ©neaux ---------- */
  function renderCreneaux(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Ã‰cran indisponible", "Le module CrÃ©neaux n'est pas chargÃ©."); return; }
    if (!state.shiftMode) { c.innerHTML = S.shifts({ data: d }); return; }
    c.innerHTML = S.shiftForm({ data: d }, state.shiftMode, state.shiftId);
  }

  /* ---------- Concerts ---------- */
  function renderConcerts(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Ã‰cran indisponible", "Le module Concerts n'est pas chargÃ©."); return; }
    if (!state.concertMode) { c.innerHTML = S.concerts({ data: d }); return; }
    c.innerHTML = S.concertForm({ data: d }, state.concertMode, state.concertId);
  }

  /* ---------- Action dÃ©lÃ©guÃ©e des crÃ©neaux et concerts ---------- */
  function scenesAction(b) {
    if (b.dataset.creneaux !== undefined) { state.shiftMode = ""; state.shiftId = ""; render(); return; }
    if (b.dataset.concerts !== undefined) { state.concertMode = ""; state.concertId = ""; render(); return; }
    if (b.dataset.newShift !== undefined) { state.shiftMode = "new"; state.shiftId = ""; render(); return; }
    if (b.dataset.newConcert !== undefined) { state.concertMode = "new"; state.concertId = ""; render(); return; }
    if (b.dataset.shift) { state.shiftMode = "edit"; state.shiftId = String(b.dataset.shift); render(); return; }
    if (b.dataset.concert) { state.concertMode = "edit"; state.concertId = String(b.dataset.concert); render(); return; }
    if (b.dataset.shiftReset !== undefined || b.dataset.concertReset !== undefined) {
      notice("Champs rechargÃ©s depuis les donnÃ©es enregistrÃ©es.", "info");
      render();
      return;
    }
    if (b.dataset.shiftRemove !== undefined) { removeShift(); return; }
    if (b.dataset.concertRemove !== undefined) { removeConcert(); return; }
  }

  function removeShift() {
    var s = (state.data.shifts || []).filter(function (x) { return x.id === state.shiftId; })[0];
    if (!s) return;
    if (!window.confirm("Supprimer le crÃ©neau " + (s.name || s.id) + " ?")) return;

    /* Meme regle que pour les concerts : suppression reelle par id.
     * On n'envoie jamais active:false pour simuler une suppression. */
    sendRemove("shifts", s.id).then(function () {
      state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== s.id; });
      saveLocal();
      state.shiftMode = "";
      state.shiftId = "";
      notice("CrÃ©neau supprimÃ©.", "success");
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
      notice("Concert supprimÃ©.", "success");
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
      notice("CrÃ©neau " + full.id + " enregistrÃ©.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function saveConcert(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    if (!full.id) full.id = "co-" + Transport.requestId().slice(0, 8);
    full.version = old ? old.version || 0 : 0;
    sendSave("concerts", full, old ? old.version || 0 : 0, old).then(function (out) {
      /* Le serveur renvoie la ligne definitive, avec sa `date` deduite
       * du jour choisi. C'est ELLE qu'on garde : sans ca, un concert
       * cree arrive avec date vide et forme un second groupe Â« Mercredi Â»
       * a cote du vrai groupe Â« Mercredi 30/06 Â». */
      var definitif = (out && out.row) ? out.row : full;
      state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== definitif.id; }).concat([definitif]);
      saveLocal();
      state.concertMode = "";
      state.concertId = "";
      notice("Concert enregistrÃ©.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  /* ------------------------------------------------------------------
   * Ã‰COUTEUR UNIQUE DES CRÃ‰NEAUX ET CONCERTS
   * Un seul Ã©couteur, posÃ© sur #pageContent qui existe en permanence.
   * Il n'est jamais posÃ© sur un bouton : les boutons sont recrÃ©Ã©s Ã 
   * chaque render(), un gestionnaire posÃ© dessus ne survivrait pas.
   * L'enregistrement ne dÃ©pend pas de l'Ã©vÃ©nement submit.
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

  /* Enregistrement d'un crÃ©neau : le mode est lu DANS le formulaire. */
  function handleShiftSave() {
    var f = document.getElementById("shiftForm");
    var S = window.ScreenShifts;
    if (!f || !S) { notice("Formulaire CrÃ©neaux indisponible.", "error"); return; }

    var row = S.readShift(f, { data: state.data });
    if (!row.id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
    if (!row.start || !row.end) { notice("Horaires obligatoires.", "error"); return; }
    row.name = S.slotLabel(row.start, row.end, row.id);

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var existant = (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
    if (isNew && existant) { notice("Cet identifiant existe dÃ©jÃ .", "error"); return; }

    var old = isNew ? null : (state.data.shifts || []).filter(function (x) { return x.id === current; })[0];
    saveShift(row, old);
  }

  /* Enregistrement d'un concert : mÃªme principe. */
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

  /* Installation de l'Ã©couteur, une seule fois, dÃ¨s que #pageContent existe. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePageContent);
  } else {
    wirePageContent();
  }

  /* ------------------------------------------------------------------
   * PRÃ‰PARATION â€” LES GRANDES LIGNES DE L'Ã‰DITION
   *
   * Quatre blocs dÃ©pliables. Chaque bloc s'enregistre SEUL : on n'envoie
   * que ses champs, jamais la configuration entiÃ¨re. L'action serveur
   * "config" accepte les modifications partielles.
   *
   * DEUX NOMENCLATURES, UNE SEULE RÃˆGLE :
   *   en LECTURE  â†’ les propriÃ©tÃ©s reÃ§ues dans le bundle :
   *                 year, name, phase, date_debut, date_fin,
   *                 vehiclesPlanned, reserveA, quotaMin, quotaMax,
   *                 formOpen, appOpen
   *   en Ã‰CRITURE â†’ les clÃ©s de la feuille CONFIG_EDITION :
   *                 annee, nom_edition, phase, date_debut, date_fin,
   *                 vehicules_prevus, reserve_a, quota_min, quota_max,
   *                 formulaire_ouvert, app_ouverte
   * C'est asymÃ©trique, et c'est voulu : le backend traduit Ã  la lecture.
   * ------------------------------------------------------------------ */
  var PHASES = ["PrÃ©paration", "Test", "Active", "Archive"];

  /* Une date ISO pour un champ type=date : les dix premiers caractÃ¨res. */
  function isoJour(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  /* Enregistrement d'UN bloc. On n'envoie que ses champs, sous les clÃ©s
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
      if (!/^\d{4}$/.test(annee)) { notice("L\u2019annÃ©e doit comporter 4 chiffres.", "error"); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) {
        notice("Les deux dates sont obligatoires.", "error"); return;
      }
      if (d1 >= d2) { notice("Le premier jour doit prÃ©cÃ©der le dernier.", "error"); return; }
      charge = { annee: Number(annee), nom_edition: val("nom_edition"), phase: val("phase"), date_debut: d1, date_fin: d2 };
    } else if (id === "planning") {
      var vp = Number(val("vehicules_prevus")), qmin = Number(val("quota_min")), qmax = Number(val("quota_max"));
      if (!isFinite(vp) || vp < 0) { notice("Nombre de vÃ©hicules invalide.", "error"); return; }
      if (!isFinite(qmin) || !isFinite(qmax) || qmin < 0 || qmax > 100) { notice("Quotas hors limites (0 Ã  100).", "error"); return; }
      if (qmin > qmax) { notice("Le quota minimal dÃ©passe le maximal.", "error"); return; }
      charge = { vehicules_prevus: vp, quota_min: qmin, quota_max: qmax, reserve_a: on("reserve_a") };
    } else if (id === "ouvertures") {
      charge = { formulaire_ouvert: on("formulaire_ouvert"), app_ouverte: on("app_ouverte") };
    } else {
      return;
    }

    notice("Enregistrement\u2026", "info");
    Transport.mutate("config", charge)
      .then(function (out) {
        if (out && out.config) state.data.config = out.config;
        else if (out && out.year !== undefined) state.data.config = out;
        saveLocal();
        notice("EnregistrÃ©.", "success");
        syncNow();
      })
      .catch(function (e) { notice(String((e && e.message) || e), "error"); });
  }

  function renderSetup(c, d) {
    var cfg = d.config || {};
    var n = function (k) { return (d[k] || []).filter(function (x) { return !x.deleted; }).length; };
    var withCode = (d.access || []).filter(function (a) { return a.hasCode; }).length;
    var ouvre = function (id) { return state.open === id; };

    var phaseOptions = PHASES.map(function (p) {
      return '<option value="' + esc(p) + '"' + (String(cfg.phase || "") === p ? " selected" : "") + ">" + esc(p) + "</option>";
    }).join("");

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

    /* ---------- 1. Ã‰DITION ---------- */
    var blocEdition =
      '<div class="form-grid">' +
      '<div><label>AnnÃ©e<input name="annee" type="number" min="2000" max="2100" step="1" inputmode="numeric" value="' + esc(cfg.year || "") + '"></label></div>' +
      '<div><label>Nom de l\u2019Ã©dition<input name="nom_edition" value="' + esc(cfg.name || "") + '"></label></div>' +
      '<div><label>Phase<select name="phase"><option value="">\u2014</option>' + phaseOptions + "</select></label></div>" +
      '<div><label>Premier jour<input name="date_debut" type="date" value="' + esc(isoJour(cfg.date_debut)) + '"></label></div>' +
      '<div><label>Dernier jour<input name="date_fin" type="date" value="' + esc(isoJour(cfg.date_fin)) + '"></label></div>' +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="edition">Enregistrer l\u2019Ã©dition</button></div>' +
      "</div>";

    /* ---------- 2. PARAMÃˆTRES PLANNING ---------- */
    var blocPlanning =
      '<div class="form-grid">' +
      '<div><label>VÃ©hicules prÃ©vus<input name="vehicules_prevus" type="number" min="0" step="1" inputmode="numeric" value="' + esc(cfg.vehiclesPlanned || 0) + '"></label></div>' +
      '<div><label>Part Conducteur minimale (%)<input name="quota_min" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(cfg.quotaMin || 0) + '"></label></div>' +
      '<div><label>Part Conducteur maximale (%)<input name="quota_max" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(cfg.quotaMax || 0) + '"></label></div>' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="reserve_a"' + (cfg.reserveA === false ? "" : " checked") + "><span>VÃ©hicule A rÃ©servÃ© aux rÃ©fÃ©rents</span></label>" +
      "</div>" +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="planning">Enregistrer les paramÃ¨tres</button></div>' +
      "</div>";

    /* ---------- 3. OUVERTURES ---------- */
    var blocOuvertures =
      '<div class="form-grid">' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="formulaire_ouvert"' + (cfg.formOpen ? " checked" : "") + "><span>Formulaire ouvert aux bÃ©nÃ©voles</span></label>" +
      '<label class="check"><input type="checkbox" name="app_ouverte"' + (cfg.appOpen ? " checked" : "") + "><span>Application terrain ouverte</span></label>" +
      "</div>" +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="ouvertures">Enregistrer les ouvertures</button></div>' +
      "</div>";

    /* ---------- 4. Ã‰TAT DE LA PRÃ‰PARATION ---------- */
    var blocsEtat = [
      ["Ã‰quipe", n("people") + " fiche(s)", n("people") ? "good" : "bad"],
      ["CrÃ©neaux", n("shifts") + " crÃ©neau(x)", n("shifts") ? "good" : "bad"],
      ["Concerts", n("concerts") + " concert(s)", n("concerts") ? "good" : "bad"],
      ["Missions", n("missions") + " mission(s)", n("missions") ? "good" : ""],
      ["VÃ©hicules prÃ©vus", cfg.vehiclesPlanned ? cfg.vehiclesPlanned + " vÃ©hicule(s)" : "Ã  renseigner", cfg.vehiclesPlanned ? "good" : "bad"],
      ["AccÃ¨s", withCode + " code(s) crÃ©Ã©(s)", withCode ? "good" : "bad"],
      ["Formulaire", cfg.formOpen ? "ouvert" : "fermÃ©", cfg.formOpen ? "good" : ""]
    ];
    var corpsEtat = blocsEtat.map(function (b) { return listRow(b[0], b[1], "", b[2]); }).join("") +
      '<div class="toolbar" style="margin-top:12px">' +
      '<button type="button" class="button secondary" data-page="team">Ã‰quipe</button>' +
      '<button type="button" class="button secondary" data-page="creneaux">CrÃ©neaux</button>' +
      '<button type="button" class="button secondary" data-page="concerts">Concerts</button>' +
      "</div>";

    c.innerHTML =
      '<div class="hero-card"><div><p class="eyebrow">' + esc(cfg.year || "") + "</p><h2>" +
      esc(cfg.name || "Beauregard") + "</h2><p>" + esc(cfg.phase || "PrÃ©paration") + "</p></div>" +
      '<span class="hero-date">V' + esc(state.version) + "</span></div>" +

      bloc("edition", "Ã‰dition", cfg.year ? "AnnÃ©e " + cfg.year : "Ã  renseigner", blocEdition) +
      bloc("planning", "ParamÃ¨tres planning", cfg.vehiclesPlanned ? cfg.vehiclesPlanned + " vÃ©hicule(s)" : "Ã  renseigner", blocPlanning) +
      bloc("ouvertures", "Ouvertures", (cfg.formOpen ? "Formulaire ouvert" : "Formulaire fermÃ©"), blocOuvertures) +
      bloc("etat", "Ã‰tat de la prÃ©paration", "compteurs et accÃ¨s", corpsEtat) +

      card("Ã‰tat de l\u2019appareil",
        listRow("Version des donnÃ©es", "V" + state.version, "", "") +
        listRow("Modifications en attente", String(state.pending), state.pending ? "Ã€ envoyer" : "Aucune", state.pending ? "bad" : "good") +
        listRow("RÃ©seau", navigator.onLine ? "En ligne" : "Hors ligne", "", ""));

    /* Les boutons sont recrÃ©Ã©s Ã  chaque rendu : les Ã©couteurs sont posÃ©s
     * sur le conteneur, jamais sur les boutons eux-mÃªmes. */
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

  /* ---------- PrÃ©paration : suite des Ã©crans ---------- */
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
      "<h2>" + esc(cfg.name || "Beauregard") + "</h2><p>" + esc(cfg.phase || "PrÃ©paration") + "</p></div>" +
      '<span class="hero-date">V' + esc(state.version) + "</span></div>" +
      '<div class="grid two" style="margin-top:16px">' +
      card("Prochain rendez-vous", next
        ? listRow(next.name, next.date + " Â· " + next.start + "â€“" + next.end, "PubliÃ©", "good")
        : "<p>Ton planning apparaÃ®tra dÃ¨s sa publication.</p>") +
      card("Ã€ lire", msgs.length
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
        var body = mine.length ? mine.map(function (r) { return r.start + "â€“" + r.end + " Â· " + r.role; }).join(" Â· ") : "RÃ´le Ã  confirmer";
        return '<article class="card"><h2>' + esc(s.name || "CrÃ©neau") + '</h2><p class="muted">' +
          esc(s.date || "") + " Â· " + esc((s.start || "") + "â€“" + (s.end || "")) + "</p><p>" + esc(body) + "</p></article>";
      }).join("");
    c.innerHTML = rows || empty("Aucun crÃ©neau publiÃ©", "Ton planning personnel s'affichera ici.");
  }

  function renderPlanning(c, d) {
    var rows = (d.assignments || []).map(function (a) {
      var s = shift(a.shiftId) || {};
      return listRow(personLabel(a.personId), (s.date || "") + " Â· " + (s.name || ""), s.start ? s.start + "â€“" + s.end : "");
    });
    c.innerHTML = rows.length
      ? '<article class="card"><h2>Planning publiÃ©</h2>' + rows.join("") + "</article>"
      : empty("Planning non publiÃ©", "Le planning collectif apparaÃ®tra aprÃ¨s publication.");
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
          "<div><b>" + esc(lbl) + "</b><small>" + esc(p.role === "referent" ? "RÃ©fÃ©rent" : "BÃ©nÃ©vole") + "</small></div></div>" +
          '<div class="contact-actions">' +
          (p.phone ? '<a class="button secondary" href="tel:' + esc(p.phone) + '">Appeler</a>' : "") +
          (p.email ? '<a class="button secondary" href="mailto:' + esc(p.email) + '">Ã‰crire</a>' : "") +
          "</div></article>";
      }).join("");
    };
    var html = (refs.length ? '<div class="section-title">RÃ©fÃ©rents</div>' + block(refs) : "") +
      (others.length ? '<div class="section-title">Ã‰quipe</div>' + block(others) : "");
    c.innerHTML = html || empty("Aucun contact", "Les fiches d'Ã©quipe apparaÃ®tront ici.");
  }

  function renderMessages(c, d) {
    var msgs = d.messages || [];
    c.innerHTML = msgs.length
      ? msgs.map(function (m) {
          return '<article class="card"><h2>' + esc(m.title) + "</h2><p>" + esc(m.body) + "</p>" +
            (m.priority === "Urgent" ? '<button class="button primary" data-read="' + esc(m.id) + '">J\'ai lu</button>' : "") + "</article>";
        }).join("")
      : empty("Aucun message", "Les consignes de l'Ã©quipe apparaÃ®tront ici.");
    Array.prototype.forEach.call(document.querySelectorAll("[data-read]"), function (b) {
      b.onclick = function () {
        send("read", { messageId: b.dataset.read }, "Message marquÃ© comme lu.").then(function () { render(); });
      };
    });
  }

  function renderVehicles(c, d) {
    var v = d.vehicles || [];
    c.innerHTML = v.length
      ? v.map(function (x) {
          return '<article class="card"><h2>' + esc(x.plate || "VÃ©hicule") + "</h2><p>" + esc(x.make || "") + "</p>" +
            '<span class="badge ' + (x.active === false ? "bad" : "good") + '">' + (x.active === false ? "HS" : "En service") + "</span></article>";
        }).join("")
      : empty("Aucun vÃ©hicule", "Les vÃ©hicules reÃ§us apparaÃ®tront ici.");
  }

  function start() {
    hideBoot();
    var l = $("#loginScreen"); if (l) l.classList.add("hidden");
    var s = $("#appShell"); if (s) s.classList.remove("hidden");
    var rl = $("#roleLabel"); if (rl) rl.textContent = ROLE[state.role] || "BÃ©nÃ©vole";
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
        notice("Action enregistrÃ©e hors ligne. Elle partira au retour du rÃ©seau.", "info");
        return refreshPending();
      });
    }
    return Transport.mutate(action, data).then(function (out) {
      if (okMessage) notice(okMessage, "success");
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && (msg === "Failed to fetch" || msg.indexOf("ne rÃ©pond pas") >= 0)) {
        return Queue.enqueue({ action: action, payload: data }).then(function () {
          notice("RÃ©seau instable : action gardÃ©e et envoyÃ©e plus tard.", "info");
          return refreshPending();
        });
      }
      notice(msg, "error");
      throw e;
    });
  }

  /* ------------------------------------------------------------------
   * SUPPRESSION RÃ‰ELLE
   *
   * Une suppression n'est PAS une sauvegarde avec active:false. Elle
   * envoie l'action "remove" et la seule clÃ© qui identifie la ligne :
   * son id. Jamais la date, le jour, l'artiste ou un rang de tableau.
   *
   * Le serveur fait le reste : recherche par id, retrait, renumÃ©rotation
   * de la journÃ©e, rÃ©Ã©criture de la feuille.
   * ------------------------------------------------------------------ */
  function sendRemove(collection, id) {
    var cible = String(id || "");
    if (!cible) {
      return Promise.reject(new Error("Suppression impossible : identifiant manquant."));
    }

    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ collection: collection, action: "remove", entityId: cible, payload: { collection: collection, id: cible } })
        .then(function () {
          notice("Suppression enregistrÃ©e hors ligne. Envoi au retour du rÃ©seau.", "info");
          return refreshPending();
        });
    }

    return Transport.mutate("remove", { collection: collection, id: cible })
      .then(function (out) { return out; })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        if (window.Queue && (msg === "Failed to fetch" || msg.indexOf("ne rÃ©pond pas") >= 0)) {
          return Queue.enqueue({ collection: collection, action: "remove", entityId: cible, payload: { collection: collection, id: cible } })
            .then(function () {
              notice("RÃ©seau instable : suppression gardÃ©e pour envoi.", "info");
              return refreshPending();
            });
        }
        throw e;
      });
  }

  function sendSave(collection, row, baseVersion, baseRow) {
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
        .then(function () { notice("EnregistrÃ© hors ligne. Envoi au retour du rÃ©seau.", "info"); return refreshPending(); });
    }
    return Transport.save(collection, row, baseVersion, baseRow).then(function (out) {
      if (out && out.conflict) {
        notice("Conflit dÃ©tectÃ© : une autre personne a modifiÃ© cette fiche.", "error");
        if (window.Queue) return Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow });
      }
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && (msg === "Failed to fetch" || msg.indexOf("ne rÃ©pond pas") >= 0)) {
        return Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
          .then(function () { notice("RÃ©seau instable : fiche gardÃ©e pour envoi.", "info"); return refreshPending(); });
      }
      throw e;
    });
  }

  var loginForm = $("#loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#loginError");
      err.textContent = "Connexionâ€¦";
      if (BOOT && BOOT.start) BOOT.start();
      Transport.login($("#accessCode").value, ($("#operatorName") || {}).value || "")
        .then(function (out) {
          if (!out || !out.user) throw new Error("RÃ©ponse de connexion incomplÃ¨te.");
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
      if (r && r.sent) notice(r.sent + " modification(s) envoyÃ©e(s).", "success");
      return Queue.list();
    }).then(function (rows) {
      var conflicts = (rows || []).filter(function (x) { return x.state === "conflict"; });
      if (conflicts.length) notice(conflicts.length + " modification(s) en conflit Ã  arbitrer.", "error");
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
