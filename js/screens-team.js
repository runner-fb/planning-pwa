/* Beauregard V2 — écran Équipe : liste, fiche, création, accès.
 * Points 8 à 11 du cahier des charges : fiche complète, création manuelle
 * depuis smartphone, suppression, génération des codes personnels en lot.
 */
(function (root) {
  "use strict";

  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s).replace(
      /[&<>"']/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      }
    );
  };
  var label = function (p) { return [p.firstName, p.lastName].filter(Boolean).join(" "); };

  var filter = "";

  function list(ctx) {
    var all = (ctx.data.people || []).filter(function (p) { return !p.deleted; });
    var people = all;
    var q = filter.trim().toLowerCase();
    if (q) {
      people = people.filter(function (p) {
        return (label(p) + " " + (p.phone || "") + " " + (p.email || "")).toLowerCase().indexOf(q) >= 0;
      });
    }
    people = people.slice().sort(function (a, b) {
      if ((a.role === "referent") !== (b.role === "referent")) return a.role === "referent" ? -1 : 1;
      return label(a).localeCompare(label(b), "fr");
    });

    var rows = people.map(function (p) {
      var flags = [];
      if (p.role === "referent") flags.push("Référent");
      if (p.status && p.status !== "Actif") flags.push(p.status);
      if (p.forbidC3) flags.push("C3 interdit");
      if (p.driverOnly) flags.push("Conducteur uniquement");
      if (p.priorityLoader) flags.push("PC");
      if (p.noLoader) flags.push("NC");
      if (p.firstYear) flags.push("1A");
      var sub = (p.phone || "sans téléphone") + " \u00b7 " + (p.email || "sans email");
      return '<button class="person-row" data-person="' + esc(p.id) + '">' +
        (p.photo ? '<img class="avatar" src="' + esc(p.photo) + '" alt="">' : '<span class="avatar">' + esc(label(p).slice(0, 1)) + "</span>") +
        '<span class="person-main"><b>' + esc(label(p)) + "</b><small>" + esc(sub) + "</small></span>" +
        '<span class="person-flags">' + esc(flags.join(" \u00b7 ")) + "</span>" +
        "</button>";
    }).join("");

    return '<div class="toolbar">' +
      '<input class="search" id="teamSearch" type="search" placeholder="Chercher un nom, un t\u00e9l\u00e9phone\u2026" value="' + esc(filter) + '">' +
      '<span class="badge">' + people.length + " / " + all.length + " fiche(s)</span>" +
      "</div>" +
      '<div class="toolbar">' +
      '<button class="button primary" data-team="new">Nouvelle fiche</button>' +
      '<button class="button secondary" data-team="access">Cr\u00e9er les acc\u00e8s</button>' +
      "</div>" +
      '<div class="card">' +
      (rows || '<div class="empty"><b>Aucune fiche</b>Aucune personne ne correspond \u00e0 cette recherche.</div>') +
      "</div>";
  }

  function checks(p) {
    var one = function (name, text, on) {
      return '<label class="check"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "><span>" + esc(text) + "</span></label>";
    };
    return '<div class="full contraintes"><div class="section-title">Contraintes et pr\u00e9f\u00e9rences</div>' +
      one("forbidC3", "C3 interdit (contrainte dure)", p.forbidC3) +
      one("driverOnly", "Conducteur uniquement (contrainte dure)", p.driverOnly) +
      one("priorityLoader", "Priorit\u00e9 Chargeur (PC)", p.priorityLoader) +
      one("noLoader", "Non-Chargeur (NC)", p.noLoader) +
      one("firstYear", "Premi\u00e8re ann\u00e9e (1A)", p.firstYear) +
      one("wednesday", "Mercredi autoris\u00e9", p.wednesday) +
      "</div>";
  }

  function sheet(ctx, id) {
    var p = (ctx.data.people || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return '<div class="empty"><b>Fiche introuvable</b>Elle a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9e.</div>';
    var acc = (ctx.data.access || []).filter(function (a) { return a.personId === id; })[0];

    return '<div class="toolbar"><button class="button secondary" data-team="back">\u2039 \u00c9quipe</button>' +
      '<span class="badge">' + esc(p.role === "referent" ? "R\u00e9f\u00e9rent" : "B\u00e9n\u00e9vole") + "</span></div>" +
      '<div class="card contact-head">' +
      (p.photo ? '<img class="avatar big" src="' + esc(p.photo) + '" alt="">' : '<span class="avatar big">' + esc(label(p).slice(0, 1)) + "</span>") +
      "<div><b>" + esc(label(p)) + "</b><small>" + esc(p.status || "Actif") + "</small></div></div>" +
      '<form id="personForm" class="form-grid">' +
      '<div><label>Nom<input name="lastName" value="' + esc(p.lastName) + '" required></label></div>' +
      '<div><label>Pr\u00e9nom<input name="firstName" value="' + esc(p.firstName) + '" required></label></div>' +
      '<div><label>T\u00e9l\u00e9phone<input name="phone" type="tel" value="' + esc(p.phone || "") + '"></label></div>' +
      '<div><label>Email<input name="email" type="email" value="' + esc(p.email || "") + '"></label></div>' +
      '<div><label>Statut<select name="status">' +
      ["Actif", "Absent", "D\u00e9sist\u00e9"].map(function (s) {
        return "<option" + ((p.status || "Actif") === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select></label></div>" +
      '<div><label>Bo\u00eete de vitesses<select name="gearbox">' +
      ["", "Manuelle", "Automatique", "Peu importe"].map(function (s) {
        return '<option value="' + esc(s) + '"' + ((p.gearbox || "") === s ? " selected" : "") + ">" + (s || "Non renseign\u00e9e") + "</option>";
      }).join("") + "</select></label></div>" +
      '<div class="full"><label class="check"><input type="checkbox" name="isReferent"' + (p.role === "referent" ? " checked" : "") + "><span>R\u00e9f\u00e9rent</span></label></div>" +
      checks(p) +
      '<div class="full"><label>Note interne<textarea name="internalNote" rows="3">' + esc(p.internalNote || "") + "</textarea></label></div>" +
      '<div class="full modal-actions">' +
      '<button type="button" class="button secondary" data-team="access-one">' +
      (acc && acc.hash ? "R\u00e9initialiser le code" : "Cr\u00e9er l\u2019acc\u00e8s") + "</button>" +
      '<button class="button primary">Enregistrer</button></div>' +
      "</form>" +
      '<div class="toolbar"><button class="button secondary" data-team="remove">Supprimer la fiche</button></div>' +
      '<div class="notice" data-type="info">' +
      (acc ? "Acc\u00e8s : " + (acc.hash ? "code cr\u00e9\u00e9" : "pas encore de code") + " \u00b7 " + esc(acc.active ? "actif" : "inactif")
           : "Aucun acc\u00e8s cr\u00e9\u00e9 pour cette personne.") + "</div>";
  }

  function blank() {
    return '<div class="toolbar"><button class="button secondary" data-team="back">\u2039 \u00c9quipe</button>' +
      '<span class="badge">Nouvelle fiche</span></div>' +
      '<form id="personForm" class="form-grid">' +
      '<div><label>Nom<input name="lastName" required></label></div>' +
      '<div><label>Pr\u00e9nom<input name="firstName" required></label></div>' +
      '<div><label>T\u00e9l\u00e9phone<input name="phone" type="tel"></label></div>' +
      '<div><label>Email<input name="email" type="email"></label></div>' +
      '<div><label>Statut<select name="status"><option>Actif</option><option>Absent</option><option>D\u00e9sist\u00e9</option></select></label></div>' +
      '<div><label>Bo\u00eete de vitesses<select name="gearbox"><option value="">Non renseign\u00e9e</option><option>Manuelle</option><option>Automatique</option><option>Peu importe</option></select></label></div>' +
      '<div class="full"><label class="check"><input type="checkbox" name="isReferent"><span>R\u00e9f\u00e9rent</span></label></div>' +
      checks({}) +
      '<div class="full"><label>Note interne<textarea name="internalNote" rows="3"></textarea></label></div>' +
      '<div class="full modal-actions"><button class="button primary">Cr\u00e9er la fiche</button></div>' +
      "</form>";
  }

  function readForm(form) {
    var f = form.elements;
    var get = function (n) { return f[n] ? f[n].value.trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    return {
      lastName: get("lastName"),
      firstName: get("firstName"),
      phone: get("phone"),
      email: get("email"),
      status: get("status") || "Actif",
      gearbox: get("gearbox"),
      role: on("isReferent") ? "referent" : "benevole",
      forbidC3: on("forbidC3"),
      driverOnly: on("driverOnly"),
      priorityLoader: on("priorityLoader"),
      noLoader: on("noLoader"),
      firstYear: on("firstYear"),
      wednesday: on("wednesday"),
      internalNote: get("internalNote")
    };
  }

  /* \u00c9cran de g\u00e9n\u00e9ration des codes : nom, pr\u00e9nom, code, copie.
   * Le code n'est affich\u00e9 qu'une fois (point 11 du CDC). */
  function accessResult(rows) {
    if (!rows || !rows.length)
      return '<div class="empty"><b>Aucun code g\u00e9n\u00e9r\u00e9</b>Toutes les personnes actives ont d\u00e9j\u00e0 un acc\u00e8s.</div>';
    var lines = rows.map(function (r) {
      return r.nom + " " + r.prenom + "\t" + r.code;
    }).join("\n");
    return '<div class="notice" data-type="success">' + rows.length + " code(s) g\u00e9n\u00e9r\u00e9(s). Note-les maintenant : ils ne seront plus affich\u00e9s.</div>" +
      '<div class="card"><table class="codes"><thead><tr><th>Nom</th><th>Pr\u00e9nom</th><th>Code</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr><td>" + esc(r.nom) + "</td><td>" + esc(r.prenom) + "</td><td><b>" + esc(r.code) + "</b></td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      '<div class="toolbar"><button class="button secondary" data-team="copy" data-payload="' + esc(lines) + '">Copier la liste</button>' +
      '<button class="button secondary" onclick="window.print()">Imprimer</button></div>';
  }

  root.ScreenTeam = {
    list: list,
    sheet: sheet,
    blank: blank,
    readForm: readForm,
    accessResult: accessResult,
    setFilter: function (v) { filter = v; }
  };
})(window);
