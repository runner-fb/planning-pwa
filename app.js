/* Beauregard V2 — app.js (socle)
 * Dialogue repris de la V1 : Transport = fetch GET JSON.
 * Actions serveur réelles : login, sync, save, mutate, documents…
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
    Accueil: "\u2302",
    "Mes créneaux": "\u25A6",
    Planning: "\u25A4",
    Contacts: "\u2663",
    Équipe: "\u2659",
    Véhicules: "\u25B0",
    Messages: "\u2709",
    Outils: "\u2699",
    Préparation: "\u25F7",
    Formulaires: "\u25A7",
    Simulations: "\u27F3",
    Arbitrages: "\u25C7",
    Rotations: "\u21BB",
    Contrôles: "\u2713",
    Validation: "\u25C9",
    Publication: "\u2197",
    Terrain: "\u2316"
  };

  var NAV = {
    benevole: [["Accueil", "home"], ["Mes créneaux", "myshifts"], ["Planning", "planning"], ["Contacts", "contacts"]],
    referent: [["Accueil", "home"], ["Équipe", "team"], ["Véhicules", "vehicles"], ["Planning", "planning"], ["Messages", "messages"], ["Contacts", "contacts"], ["Outils", "tools"]],
    admin: [["Préparation", "setup"], ["Formulaires", "forms"], ["Simulations", "simulations"], ["Planning", "planning"], ["Arbitrages", "arbitrations"], ["Rotations", "rotations"], ["Contrôles", "checks"], ["Validation", "validation"], ["Publication", "publication"], ["Terrain", "terrain"], ["Véhicules", "vehicles"], ["Messages", "messages"], ["Contacts", "contacts"]],
    vehicles: [["Accueil", "home"], ["Véhicules", "vehicles"]]
  };

  var META = {
    home: ["MON FESTIVAL", "Accueil", "L'essentiel de ton engagement, disponible hors ligne."],
    myshifts: ["MON ENGAGEMENT", "Mes créneaux", "Tes missions, tes rôles et tes horaires."],
    planning: ["ORGANISATION", "Planning général", "Les affectations publiées, sans donnée privée."],
    contacts: ["CARNET D'ÉQUIPE", "Contacts", "Les personnes utiles pendant le festival."],
    team: ["ÉQUIPE", "Bénévoles", "Référents et équipe de l'édition."],
    vehicles: ["LOGISTIQUE", "Véhicules", "Parc, états des lieux et incidents."],
    messages: ["INFORMATIONS", "Messages", "Consignes et actualités de l'équipe."],
    tools: ["ESPACE RÉFÉRENT", "Outils", "Accès aux modules de suivi."],
    setup: ["CYCLE DE L'ÉDITION", "Préparation", "Paramètres et progression de l'édition."],
    forms: ["INSCRIPTIONS", "Formulaires", "Ouverture et suivi des disponibilités."],
    simulations: ["AFFECTATIONS", "Simulations", "Construire puis comparer les propositions."],
    arbitrations: ["DÉCISIONS", "Arbitrages", "Traiter les points à décider."],
    rotations: ["ÉQUILIBRE", "Rotations", "Répartition Conducteur / Chargeur."],
    checks: ["QUALITÉ", "Contrôles", "Repérer et résoudre les anomalies."],
    validation: ["AVANT PUBLICATION", "Validation", "Dernières vérifications du planning."],
    publication: ["MISE EN LIGNE", "Publication", "Publier la version retenue."],
    terrain: ["PENDANT LE FESTIVAL", "Suivi terrain", "Créneaux et changements sur place."]
  };

  var state = { user: null, role: "", data: null, page: "home", version: 0 };
  var CACHE_KEY = "planning_v2_bundle";

  function saveLocal() {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), version: state.version, role: state.role, data: state.data })
      );
    } catch (e) {}
  }

  function readLocal(expectedRole) {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!raw || !raw.data) return null;
      if (expectedRole && raw.role && raw.role !== expectedRole) return null;
      return raw;
    } catch (e) {
      return null;
    }
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

  function syncBadge(text, kind) {
    var el = $("#connectionText");
    if (el) el.textContent = text;
    var pill = el && el.parentElement;
    if (pill) pill.dataset.kind = kind || "";
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
    $("#desktopNav").innerHTML = items.map(make).join("");
    $("#mobileNav").innerHTML =
      primary.map(make).join("") +
      (extra.length
        ? '<button class="nav-more" id="navMore" aria-expanded="false" aria-label="Plus de fonctions">' +
          '<span class="nav-icon">\u203A</span><span>Plus</span></button>'
        : "");
    var more = $("#navMore");
    if (more) more.onclick = toggleMore;
    wireNav();
  }

  function toggleMore() {
    var items = (NAV[state.role] || NAV.benevole).slice(4);
    var more = $("#navMore");
    var open = more.getAttribute("aria-expanded") === "true";
    var existing = $("#navDrawer");
    if (existing) existing.remove();
    if (open) {
      more.setAttribute("aria-expanded", "false");
      return;
    }
    var drawer = document.createElement("div");
    drawer.id = "navDrawer";
    drawer.className = "nav-drawer";
    drawer.innerHTML = items
      .map(function (it) {
        return '<button class="nav-drawer-link" data-page="' + it[1] + '">' +
          '<span class="nav-icon">' + (ICON[it[0]] || "•") + "</span><span>" + esc(it[0]) + "</span></button>";
      })
      .join("");
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

  function person(id) {
    var p = ((state.data && state.data.people) || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return { label: "—", photo: "" };
    p.label = [p.firstName, p.lastName].filter(Boolean).join(" ");
    return p;
  }

  function shift(id) {
    return ((state.data && state.data.shifts) || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  function render() {
    var c = $("#pageContent");
    var d = state.data || {};
    if (state.page === "home") return renderHome(c, d);
    if (state.page === "myshifts") return renderMyShifts(c, d);
    if (state.page === "planning") return renderPlanning(c, d);
    if (state.page === "contacts") return renderContacts(c, d);
    if (state.page === "messages") return renderMessages(c, d);
    if (state.page === "vehicles") return renderVehicles(c, d);
    c.innerHTML = empty("Module en préparation", "Cette partie sera branchée à l'étape suivante.");
  }

  function renderHome(c, d) {
    var cfg = d.config || {};
    var uid = state.user && state.user.id;
    var mine = (d.assignments || []).filter(function (a) { return a.personId === uid; });
    var next = mine
      .map(function (a) { return shift(a.shiftId); })
      .filter(Boolean)
      .sort(function (a, b) { return String(a.date + a.start).localeCompare(String(b.date + b.start)); })[0];
    $("#editionLabel").textContent = (cfg.name || "Beauregard") + " " + (cfg.year || "");
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
        var body = mine.length
          ? mine.map(function (r) { return r.start + "–" + r.end + " · " + r.role; }).join(" · ")
          : "Rôle à confirmer";
        return '<article class="card"><h2>' + esc(s.name || "Créneau") + "</h2><p class=\"muted\">" +
          esc(s.date || "") + " · " + esc((s.start || "") + "–" + (s.end || "")) + "</p><p>" + esc(body) + "</p></article>";
      })
      .join("");
    c.innerHTML = rows || empty("Aucun créneau publié", "Ton planning personnel s'affichera ici.");
  }

  function renderPlanning(c, d) {
    var rows = (d.assignments || []).map(function (a) {
      var s = shift(a.shiftId) || {};
      return listRow(person(a.personId).label, (s.date || "") + " · " + (s.name || ""), s.start ? s.start + "–" + s.end : "");
    });
    c.innerHTML = rows.length
      ? '<article class="card"><h2>Planning publié</h2>' + rows.join("") + "</article>"
      : empty("Planning non publié", "Le planning collectif apparaîtra après publication.");
  }

  function renderContacts(c, d) {
    var refs = [];
    var others = [];
    (d.people || []).forEach(function (p) {
      if (p.deleted || (p.role !== "referent" && !p.phone)) return;
      (p.role === "referent" ? refs : others).push(p);
    });
    var block = function (list) {
      return list.map(function (p) {
        var label = [p.firstName, p.lastName].filter(Boolean).join(" ");
        return '<article class="card contact-card"><div class="contact-head">' +
          (p.photo ? '<img class="avatar" src="' + esc(p.photo) + '" alt="">' : '<span class="avatar">' + esc(label.slice(0, 1)) + "</span>") +
          "<div><b>" + esc(label) + "</b><small>" + esc(p.role === "referent" ? "Référent" : "Bénévole") + "</small></div></div>" +
          '<div class="contact-actions">' +
          (p.phone ? '<a class="button secondary" href="tel:' + esc(p.phone) + '">Appeler</a>' : "") +
          (p.email ? '<a class="button secondary" href="mailto:' + esc(p.email) + '">Écrire</a>' : "") +
          "</div></article>";
      }).join("");
    };
    c.innerHTML =
      (refs.length ? '<div class="section-title">Référents</div>' + block(refs) : "") +
      (others.length ? '<div class="section-title">Équipe</div>' + block(others) : "") ||
      empty("Aucun contact", "Les fiches d'équipe apparaîtront ici.");
  }

  function renderMessages(c, d) {
    var msgs = d.messages || [];
    c.innerHTML = msgs.length
      ? msgs.map(function (m) {
          return '<article class="card"><h2>' + esc(m.title) + "</h2><p>" + esc(m.body) +
            "</p>" + (m.priority === "Urgent" ? '<button class="button primary" data-read="' + esc(m.id) + '">J\'ai lu</button>' : "") + "</article>";
        }).join("")
      : empty("Aucun message", "Les consignes de l'équipe apparaîtront ici.");
    Array.prototype.forEach.call(document.querySelectorAll("[data-read]"), function (b) {
      b.onclick = function () {
        Transport.read("read", { messageId: b.dataset.read })
          .then(function () { notice("Message marqué comme lu.", "success"); })
          .catch(function (e) { notice(e.message, "error"); });
      };
    });
  }

  function renderVehicles(c, d) {
    var v = d.vehicles || [];
    c.innerHTML = v.length
      ? v.map(function (x) {
          return '<article class="card"><h2>' + esc(x.plate || "Véhicule") + "</h2><p>" +
            esc([x.make, x.model].filter(Boolean).join(" ")) + "</p>" +
            '<span class="badge ' + (x.active === false ? "bad" : "good") + '">' + (x.active === false ? "HS" : "En service") + "</span></article>";
        }).join("")
      : empty("Aucun véhicule", "Les véhicules reçus apparaîtront ici.");
  }

  function start() {
    $("#loginScreen").classList.add("hidden");
    $("#appShell").classList.remove("hidden");
    $("#roleLabel").textContent = ROLE[state.role] || "Bénévole";
    $("#userLabel").textContent = (state.user && state.user.name) || "Mon espace";
    $("#userAvatar").textContent = String((state.user && state.user.name) || "B").trim().slice(0, 1).toUpperCase();
    nav();
    setTitle();
    render();
  }

  var loginForm = $("#loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#loginError");
      err.textContent = "Connexion…";
      Transport.login($("#accessCode").value, "")
        .then(function (out) {
          state.user = out.user;
          state.role = out.user.role;
          err.textContent = "";
          return Transport.sync(0, state.role).then(function (bundle) {
            state.data = bundle;
            state.version = bundle.version || 0;
            saveLocal();
            syncBadge("En ligne · à jour", "ok");
            start();
          });
        })
        .catch(function (x) {
          err.textContent = x.message || "Connexion impossible";
        });
    });
  }

  window.logout = function () {
    Transport.logout().catch(function () {}).then(function () {
      state.user = null;
      state.data = null;
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      $("#appShell").classList.add("hidden");
      $("#loginScreen").classList.remove("hidden");
      $("#accessCode").value = "";
    });
  };

  window.navigate = go;

  function syncNow() {
    syncBadge("Synchronisation…", "busy");
    Transport.sync(state.version, state.role)
      .then(function (bundle) {
        state.data = bundle;
        state.version = bundle.version || state.version;
        saveLocal();
        syncBadge("En ligne · à jour", "ok");
        render();
      })
      .catch(function (e) {
        if (e.message === "SESSION_EXPIRED") {
          Transport.setToken("");
          window.logout();
          return;
        }
        syncBadge("Hors ligne · données disponibles", "offline");
      });
  }

  window.addEventListener("online", function () { if (state.role) syncNow(); });
  window.addEventListener("offline", function () { syncBadge("Hors ligne · données disponibles", "offline"); });

  if (Transport.token()) {
    var local = readLocal("");
    if (local) {
      state.data = local.data;
      state.role = local.role;
      state.version = local.version;
      state.user = { id: (local.data.user || {}).id, name: (local.data.user || {}).name, role: local.role };
      start();
      if (navigator.onLine) syncNow();
      else syncBadge("Hors ligne · données disponibles", "offline");
    }
  }
})();
