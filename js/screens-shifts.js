/* Beauregard V2 — écran Créneaux et Concerts.
 *
 * LE JOUR EST UNE DATE, PAS UN LIBELLÉ.
 * La feuille CRENEAUX porte une colonne `date` (2027-06-29, 2027-06-30, …).
 * C'était la cause du message « Date invalide » : le formulaire n'envoyait
 * qu'un libellé de jour (« mardi ») et le serveur n'avait aucune date à lire.
 *
 * Conséquences, toutes voulues :
 *   - plus de table DAY_ORDER ni de dayRank : la date ordonne d'elle-même ;
 *   - plus de liste déroulante « Jour » : un sélecteur de date donne le
 *     jour ET le rang, et survit au décalage des jours d'une année sur l'autre ;
 *   - `jour` reste envoyé (calculé depuis la date) car le planning et le
 *     terrain s'appuient dessus ;
 *   - `ordre` est calculé : rang de la date, puis heure de début dans la
 *     journée. C'est ce qui produit l'ordre 1..19 de la feuille.
 *
 * Signature des formulaires : (ctx, mode, id)
 *   mode = "new"  → création, fiche vide
 *   mode = "edit" → modification de la fiche d'identifiant id
 *
 * Les boutons « Enregistrer » sont en type="button" avec data-save-shift /
 * data-save-concert : l'enregistrement ne dépend plus de l'événement submit.
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

  var DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

  var dayKey = function (s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };

  var dayTitle = function (d) { d = dayKey(d); return d ? d.charAt(0).toUpperCase() + d.slice(1) : ""; };

  /* ---------- DATES ---------- */

  var pad = function (n) { return String(n).padStart(2, "0"); };

  /* "2027-06-30" ou Date → "2027-06-30". Renvoie "" si non exploitable. */
  var isoDate = function (v) {
    var s = String(v || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  };

  /* "2027-06-30" → "mercredi". Accepte aussi un libellé déjà écrit. */
  var dateToDay = function (v) {
    var s = String(v || "").trim();
    var k = dayKey(s);
    if (DAY_NAMES.indexOf(k) >= 0) return k;
    var iso = isoDate(s);
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return DAY_NAMES[d.getDay()];
  };

  /* Affichage d'un jour : « Mardi 30/06 ». */
  var dayDisplay = function (v) {
    var iso = isoDate(v);
    if (!iso) { var d0 = dateToDay(v); return d0 ? dayTitle(d0) : "Jour non renseigné"; }
    var p = iso.split("-");
    return dayTitle(dateToDay(iso)) + " " + p[2] + "/" + p[1];
  };

  /* Clé de regroupement : la date si on l'a, sinon le libellé de jour. */
  var dayKeyOf = function (row) {
    var iso = isoDate(row && row.date);
    if (iso) return iso;
    var d = dateToDay(row && row.day);
    return d || "autre";
  };

  var isFallbackKey = function (k) { return DAY_NAMES.indexOf(k) >= 0; };

  var mins = function (t) {
    var p = String(t || "").split(":");
    return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
  };

  /* Tri : la date d'abord (les clés non-date passent à la fin), puis l'heure. */
  var byDayThenTime = function (a, b) {
    var ka = dayKeyOf(a), kb = dayKeyOf(b);
    var fa = isFallbackKey(ka) || ka === "autre", fb = isFallbackKey(kb) || kb === "autre";
    if (fa !== fb) return fa ? 1 : -1;
    var d = ka.localeCompare(kb);
    if (d) return d;
    return mins(a.start) - mins(b.start);
  };

  /* Rang d'une date dans l'édition, pour calculer `ordre`.
   * Les jours d'un festival sont consécutifs : le rang du jour dans la série
   * suffit, puis l'heure de début départage deux créneaux du même jour. */
  var orderFor = function (ctx, date, start) {
    var iso = isoDate(date);
    if (!iso) return 0;
    var dates = {};
    (ctx.data.shifts || []).forEach(function (s) {
      var k = isoDate(s.date);
      if (k) dates[k] = true;
    });
    /* La date saisie fait partie de l'édition, même si elle est nouvelle. */
    dates[iso] = true;
    var sorted = Object.keys(dates).sort();
    var index = sorted.indexOf(iso);
    if (index < 0) index = sorted.length;
    var dayRank = index * 100; /* 100 créneaux par jour : largement suffisant. */
    var slot = 0;
    var sameDay = (ctx.data.shifts || []).filter(function (s) {
      return isoDate(s.date) === iso && s.id;
    });
    sameDay.forEach(function (s) {
      if (mins(s.start) < mins(start)) slot++;
    });
    return dayRank + slot + 1;
  };

  var crossesMidnight = function (a, b) { return mins(b) <= mins(a); };

  var duration = function (a, b) {
    var d = mins(b) - mins(a);
    if (d <= 0) d += 1440;
    var h = Math.floor(d / 60), mn = d % 60;
    return (h ? h + "h" : "") + (mn ? String(mn).padStart(2, "0") : h ? "" : "0h");
  };

  var hhmmFr = function (t) {
    var p = String(t || "").split(":");
    if (p.length < 2 || !p[0]) return "";
    return p[0].padStart(2, "0") + "h" + (p[1] || "00").padStart(2, "0");
  };

  var slotLabel = function (start, end, id) {
    var a = hhmmFr(start), b = hhmmFr(end), k = String(id || "").trim();
    if (!a || !b) return "";
    return a + " - " + b + (k ? " (" + k + ")" : "");
  };

  /* ---------- CRÉNEAUX ---------- */
  function shifts(ctx) {
    var list = (ctx.data.shifts || []).slice().sort(byDayThenTime);

    var byDay = {};
    list.forEach(function (s) {
      var d = dayKeyOf(s);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(s);
    });

    var blocks = Object.keys(byDay)
      .sort(function (a, b) {
        var fa = isFallbackKey(a) || a === "autre", fb = isFallbackKey(b) || b === "autre";
        if (fa !== fb) return fa ? 1 : -1;
        return a.localeCompare(b);
      })
      .map(function (day) {
        var rows = byDay[day].map(function (s) {
          var badges = [];
          if (s.c3) badges.push("C3");
          if (s.brunch) badges.push("Brunch");
          if (s.active === false) badges.push("Inactif");
          var total = Number(s.effectif || s.target || 0);
          return '<button class="person-row" data-shift="' + esc(s.id) + '">' +
            '<span class="shift-time"><b>' + esc(s.start || "—") + "</b><small>" + esc(s.end || "") + "</small></span>" +
            '<span class="person-main"><b>' + esc(slotLabel(s.start, s.end, s.id) || s.name || s.id) + "</b><small>" +
            esc(duration(s.start, s.end)) + " · " + total + " personne(s)" +
            (crossesMidnight(s.start, s.end) ? " · passe minuit" : "") + "</small></span>" +
            '<span class="person-flags">' + esc(badges.join(" · ")) + "</span>" +
            "</button>";
        }).join("");
        return '<div class="section-title">' + esc(dayDisplay(day)) + '</div><div class="card">' + rows + "</div>";
      })
      .join("");

    return '<div class="toolbar">' +
      '<button class="button secondary" data-creneaux="back">\u2039 Retour</button>' +
      '<span class="badge">' + list.length + " créneau(x)</span>" +
      '<button class="button primary" data-new-shift="1">Nouveau créneau</button>' +
      "</div>" +
      (blocks || '<div class="empty"><b>Aucun créneau</b>Crée le premier créneau de l\u2019édition.</div>');
  }

  function shiftForm(ctx, mode, id) {
    var isNew = mode === "new";
    var s = isNew
      ? { start: "", end: "", effectif: 0, vehicles: 0, active: true, date: "" }
      : ((ctx.data.shifts || []).filter(function (x) { return x.id === id; })[0] || {});

    var dateValue = isoDate(s.date);

    return '<div class="toolbar"><button class="button secondary" data-creneaux="back">\u2039 Créneaux</button>' +
      '<span class="badge">' + (isNew ? "Nouveau créneau" : "Modifier le créneau") + "</span></div>" +
      '<form id="shiftForm" data-mode="' + (isNew ? "new" : "edit") + '" data-id="' + esc(s.id || "") + '" class="form-grid">' +
      '<div><label>Identifiant<input name="id" value="' + esc(s.id || "") + '"' +
      (isNew ? ' placeholder="ex. Ma3"' : " readonly") + "></label></div>" +
      '<div><label>Libellé (automatique)<input name="name" value="' +
      esc(slotLabel(s.start, s.end, s.id)) + '" readonly placeholder="se construit avec les horaires"></label></div>' +
      '<div><label>Date<input name="date" type="date" value="' + esc(dateValue) + '" required></label></div>' +
      '<div><label>Jour (déduit de la date)<input name="dayshow" value="' +
      esc(dateValue ? dayDisplay(dateValue) : "") + '" readonly placeholder="se déduit de la date"></label></div>' +
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
      '<button type="button" class="button primary" data-save-shift="1">Enregistrer</button></div>' +
      "</form>" +
      (isNew ? "" :
        '<div class="danger-zone">' +
        '<button type="button" class="button secondary" data-shift-reset="1">Réinitialiser les champs</button>' +
        '<button type="button" class="button danger" data-shift-remove="1">Supprimer ce créneau</button>' +
        "</div>");
  }

  function readShift(form, ctx) {
    var f = form.elements;
    var get = function (n) { return f[n] ? String(f[n].value).trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    var date = get("date");
    var start = get("start");
    return {
      id: get("id"),
      name: slotLabel(start, get("end"), get("id")),
      date: date,
      day: dateToDay(date) || "",
      start: start,
      end: get("end"),
      effectif: Number(get("target")) || 0,
      vehicles: Number(get("vehicles")) || 0,
      ordre: ctx ? orderFor(ctx, date, start) : 0,
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
      var d = dayKeyOf(c);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(c);
    });

    var blocks = Object.keys(byDay)
      .sort(function (a, b) {
        var fa = isFallbackKey(a) || a === "autre", fb = isFallbackKey(b) || b === "autre";
        if (fa !== fb) return fa ? 1 : -1;
        return a.localeCompare(b);
      })
      .map(function (day) {
        var rows = byDay[day].map(function (c) {
          return '<button class="person-row" data-concert="' + esc(c.id) + '">' +
            (c.photo
              ? '<img class="concert-thumb" src="' + esc(c.photo) + '" alt="">'
              : '<span class="shift-time"><b>' + esc(c.start || "—") + "</b><small>" + esc(c.end || "") + "</small></span>") +
            '<span class="person-main"><b>' + esc(c.artist || c.id) + "</b><small>" +
            esc((c.start || "—") + "–" + (c.end || "")) + " · " + esc(c.scene || "scène non précisée") + "</small></span>" +
            '<span class="person-flags">' + (c.active === false ? "Inactif" : "") + "</span>" +
            "</button>";
        }).join("");
        return '<div class="section-title">' + esc(dayDisplay(day)) + '</div><div class="card">' + rows + "</div>";
      })
      .join("");

    return '<div class="toolbar">' +
      '<button class="button secondary" data-concerts="back">\u2039 Retour</button>' +
      '<span class="badge">' + list.length + " concert(s)</span>" +
      '<button class="button primary" data-new-concert="1">Nouveau concert</button>' +
      "</div>" +
      (blocks || '<div class="empty"><b>Aucun concert</b>La programmation se configure avant l\u2019ouverture du formulaire.</div>');
  }

  function concertForm(ctx, mode, id) {
    var isNew = mode === "new";
    var c = isNew
      ? { active: true, date: "" }
      : ((ctx.data.concerts || []).filter(function (x) { return x.id === id; })[0] || {});

    var dateValue = isoDate(c.date);

    return '<div class="toolbar"><button class="button secondary" data-concerts="back">\u2039 Concerts</button>' +
      '<span class="badge">' + (isNew ? "Nouveau concert" : "Modifier le concert") + "</span></div>" +
      '<form id="concertForm" data-mode="' + (isNew ? "new" : "edit") + '" data-id="' + esc(c.id || "") + '" class="form-grid">' +
      (c.photo ? '<img class="concert-photo" src="' + esc(c.photo) + '" alt="">' : "") +
      '<div class="full"><label>Artiste<input name="artist" value="' + esc(c.artist || "") + '" required></label></div>' +
      '<div><label>Date<input name="date" type="date" value="' + esc(dateValue) + '" required></label></div>' +
      '<div><label>Jour (déduit de la date)<input name="dayshow" value="' +
      esc(dateValue ? dayDisplay(dateValue) : "") + '" readonly placeholder="se déduit de la date"></label></div>' +
      '<div><label>Scène<input name="scene" value="' + esc(c.scene || "") + '"></label></div>' +
      '<div><label>Début<input name="start" type="time" value="' + esc(c.start || "") + '" required></label></div>' +
      '<div><label>Fin<input name="end" type="time" value="' + esc(c.end || "") + '" required></label></div>' +
      '<div class="full"><label>Photo (adresse)<input name="photo" value="' + esc(c.photo || "") + '"></label></div>' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="active"' + (c.active === false ? "" : " checked") + "><span>Concert actif</span></label>" +
      "</div>" +
      '<div class="full modal-actions">' +
      '<button type="button" class="button secondary" data-concerts="back">Annuler</button>' +
      '<button type="button" class="button primary" data-save-concert="1">Enregistrer</button></div>' +
      "</form>" +
      (isNew ? "" :
        '<div class="danger-zone">' +
        '<button type="button" class="button secondary" data-concert-reset="1">Réinitialiser les champs</button>' +
        '<button type="button" class="button danger" data-concert-remove="1">Supprimer ce concert</button>' +
        "</div>");
  }

  function readConcert(form) {
    var f = form.elements;
    var get = function (n) { return f[n] ? String(f[n].value).trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    var date = get("date");
    return {
      artist: get("artist"),
      date: date,
      day: dateToDay(date) || "",
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
    readConcert: readConcert,
    slotLabel: slotLabel,
    isoDate: isoDate,
    dateToDay: dateToDay,
    dayDisplay: dayDisplay
  };
})(window);
