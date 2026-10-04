/* Beauregard V2 — écran Créneaux et Concerts.
 * Points 19, 23 et 26 du cahier des charges : aucun créneau codé en dur,
 * tout est modifiable par l'Admin depuis le smartphone.
 *
 * L'ordre d'affichage se déduit du jour puis de l'heure de début : aucun
 * numéro d'ordre n'est demandé à l'utilisateur.
 *
 * Créneau : jour, libellé, début, fin, effectif cible, véhicules, actif, C3,
 * brunch. Concert : artiste, jour, début, fin, scène, actif, photo.
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

  var DAY_ORDER = ["mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "lundi"];

  var dayRank = function (s) {
    var i = DAY_ORDER.indexOf(String(s || "").toLowerCase());
    return i < 0 ? 99 : i;
  };

  var mins = function (t) {
    var p = String(t || "").split(":");
    return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
  };

  /* Un créneau qui passe minuit a une fin inférieure à son début. */
  var crossesMidnight = function (a, b) { return mins(b) <= mins(a); };

  var duration = function (a, b) {
    var d = mins(b) - mins(a);
    if (d <= 0) d += 1440;
    var h = Math.floor(d / 60), mn = d % 60;
    return (h ? h + "h" : "") + (mn ? String(mn).padStart(2, "0") : h ? "" : "0h");
  };

  var dayTitle = function (d) { return d.charAt(0).toUpperCase() + d.slice(1); };

  /* Ordre : le jour du festival, puis l'heure de début. Rien à saisir. */
  var byDayThenTime = function (a, b) {
    var d = dayRank(a.day) - dayRank(b.day);
    if (d) return d;
    return String(a.start || "").localeCompare(String(b.start || ""));
  };

  /* ---------- CRÉNEAUX ---------- */
  function shifts(ctx) {
    var list = (ctx.data.shifts || []).slice().sort(byDayThenTime);

    var byDay = {};
    list.forEach(function (s) {
      var d = String(s.day || "autre");
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(s);
    });

    var blocks = Object.keys(byDay)
      .sort(function (a, b) { return dayRank(a) - dayRank(b); })
      .map(function (day) {
        var rows = byDay[day].map(function (s) {
          var badges = [];
          if (s.c3) badges.push("C3");
          if (s.brunch) badges.push("Brunch");
          if (s.active === false) badges.push("Inactif");
          var total = Number(s.effectif || s.target || 0);
          return '<button class="person-row" data-shift="' + esc(s.id) + '">' +
            '<span class="shift-time"><b>' + esc(s.start || "—") + "</b><small>" + esc(s.end || "") + "</small></span>" +
            '<span class="person-main"><b>' + esc(s.name || s.id) + "</b><small>" +
            esc(duration(s.start, s.end)) + " · " + total + " personne(s)" +
            (crossesMidnight(s.start, s.end) ? " · passe minuit" : "") + "</small></span>" +
            '<span class="person-flags">' + esc(badges.join(" · ")) + "</span>" +
            "</button>";
        }).join("");
        return '<div class="section-title">' + esc(dayTitle(day)) + '</div><div class="card">' + rows + "</div>";
      })
      .join("");

    return '<div class="toolbar">' +
      '<button class="button secondary" data-creneaux="back">\u2039 Retour</button>' +
      '<span class="badge">' + list.length + " créneau(x)</span>" +
      '<button class="button primary" data-shift="new">Nouveau créneau</button>' +
      "</div>" +
      (blocks || '<div class="empty"><b>Aucun créneau</b>Crée le premier créneau de l\u2019édition.</div>');
  }

  function shiftForm(ctx, id) {
    var s = (ctx.data.shifts || []).filter(function (x) { return x.id === id; })[0];
    var isNew = !s;
    if (isNew) s = { start: "", end: "", effectif: 0, active: true };

    var dayOptions = DAY_ORDER.map(function (d) {
      var sel = String(s.day || "").toLowerCase() === d ? " selected" : "";
      return '<option value="' + d + '"' + sel + ">" + dayTitle(d) + "</option>";
    }).join("");

    return '<div class="toolbar"><button class="button secondary" data-creneaux="back">\u2039 Créneaux</button>' +
      '<span class="badge">' + (isNew ? "Nouveau créneau" : "Modifier le créneau") + "</span></div>" +
      '<form id="shiftForm" class="form-grid">' +
      '<div><label>Identifiant<input name="id" value="' + esc(s.id || "") + '"' +
      (isNew ? ' placeholder="ex. Ma1"' : " readonly") + "></label></div>" +
      '<div><label>Libellé<input name="name" value="' + esc(s.name || "") + '" required placeholder="ex. 09h00 - 17h00 (Ma1)"></label></div>' +
      '<div><label>Jour<select name="day">' + dayOptions + "</select></label></div>" +
      '<div><label>Effectif cible<input name="target" type="number" min="0" value="' + esc(s.effectif || s.target || 0) + '"></label></div>' +
      '<div><label>Début<input name="start" type="time" value="' + esc(s.start || "") + '" required></label></div>' +
      '<div><label>Fin<input name="end" type="time" value="' + esc(s.end || "") + '" required></label></div>' +
      '<div><label>Véhicules prévus<input name="vehicles" type="number" min="0" value="' + esc(s.vehicles || 0) + '"></label></div>' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="active"' + (s.active === false ? "" : " checked") + "><span>Créneau actif</span></label>" +
      '<label class="check"><input type="checkbox" name="c3"' + (s.c3 ? " checked" : "") + "><span>C3 (créneau de nuit)</span></label>" +
      '<label class="check"><input type="checkbox" name="brunch"' + (s.brunch ? " checked" : "") + "><span>Brunch (hors planning principal)</span></label>" +
      "</div>" +
      '<div class="full modal-actions">' +
      '<button type="button" class="button secondary" data-creneaux="back">Annuler</button>' +
      '<button class="button primary">Enregistrer</button></div>' +
      "</form>";
  }

  function readShift(form) {
    var f = form.elements;
    var get = function (n) { return f[n] ? f[n].value.trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    return {
      id: get("id"),
      name: get("name"),
      day: get("day"),
      start: get("start"),
      end: get("end"),
      effectif: Number(get("target")) || 0,
      vehicles: Number(get("vehicles")) || 0,
      active: on("active"),
      c3: on("c3"),
      brunch: on("brunch")
    };
  }

  /* ---------- CONCERTS ---------- */
  function concerts(ctx) {
    var list = (ctx.data.concerts || []).slice().sort(byDayThenTime);

    var byDay = {};
    list.forEach(function (c) {
      var d = String(c.day || "autre");
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(c);
    });

    var blocks = Object.keys(byDay)
      .sort(function (a, b) { return dayRank(a) - dayRank(b); })
      .map(function (day) {
        var rows = byDay[day].map(function (c) {
          return '<button class="person-row" data-concert="' + esc(c.id) + '">' +
            '<span class="shift-time"><b>' + esc(c.start || "—") + "</b><small>" + esc(c.end || "") + "</small></span>" +
            '<span class="person-main"><b>' + esc(c.artist || c.id) + "</b><small>" +
            esc(c.scene || "scène non précisée") + "</small></span>" +
            '<span class="person-flags">' + (c.active === false ? "Inactif" : "") + "</span>" +
            "</button>";
        }).join("");
        return '<div class="section-title">' + esc(dayTitle(day)) + '</div><div class="card">' + rows + "</div>";
      })
      .join("");

    return '<div class="toolbar">' +
      '<button class="button secondary" data-concerts="back">\u2039 Retour</button>' +
      '<span class="badge">' + list.length + " concert(s)</span>" +
      '<button class="button primary" data-concert="new">Nouveau concert</button>' +
      "</div>" +
      (blocks || '<div class="empty"><b>Aucun concert</b>La programmation se configure avant l\u2019ouverture du formulaire.</div>');
  }

  function concertForm(ctx, id) {
    var c = (ctx.data.concerts || []).filter(function (x) { return x.id === id; })[0];
    var isNew = !c;
    if (isNew) c = { active: true };

    var dayOptions = DAY_ORDER.map(function (d) {
      var sel = String(c.day || "").toLowerCase() === d ? " selected" : "";
      return '<option value="' + d + '"' + sel + ">" + dayTitle(d) + "</option>";
    }).join("");

    return '<div class="toolbar"><button class="button secondary" data-concerts="back">\u2039 Concerts</button>' +
      '<span class="badge">' + (isNew ? "Nouveau concert" : "Modifier le concert") + "</span></div>" +
      '<form id="concertForm" class="form-grid">' +
      '<div class="full"><label>Artiste<input name="artist" value="' + esc(c.artist || "") + '" required></label></div>' +
      '<div><label>Jour<select name="day">' + dayOptions + "</select></label></div>" +
      '<div><label>Scène<input name="scene" value="' + esc(c.scene || "") + '"></label></div>' +
      '<div><label>Début<input name="start" type="time" value="' + esc(c.start || "") + '" required></label></div>' +
      '<div><label>Fin<input name="end" type="time" value="' + esc(c.end || "") + '" required></label></div>' +
      '<div class="full"><label>Photo (adresse)<input name="photo" value="' + esc(c.photo || "") + '"></label></div>' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="active"' + (c.active === false ? "" : " checked") + "><span>Concert actif</span></label>" +
      "</div>" +
      '<div class="full modal-actions">' +
      '<button type="button" class="button secondary" data-concerts="back">Annuler</button>' +
      '<button class="button primary">Enregistrer</button></div>' +
      "</form>";
  }

  function readConcert(form) {
    var f = form.elements;
    var get = function (n) { return f[n] ? f[n].value.trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    return {
      artist: get("artist"),
      day: get("day"),
      scene: get("scene"),
      start: get("start"),
      end: get("end"),
      photo: get("photo"),
      active: on("active")
    };
  }

  root.ScreenShifts = {
    shifts: shifts,
    shiftForm: shiftForm,
    readShift: readShift,
    concerts: concerts,
    concertForm: concertForm,
    readConcert: readConcert
  };
})(window);
