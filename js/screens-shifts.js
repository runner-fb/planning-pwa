/* Beauregard V2 — écran Créneaux et Concerts.
 *
 * LE JOUR SE CHOISIT, LA DATE S'EN DÉDUIT.
 * Une journée de festival va du matin au petit matin : un créneau qui
 * commence à 01:00 le samedi appartient à la soirée du VENDREDI. C'est
 * le jour choisi qui fait foi, jamais l'horloge — aucun décalage à
 * appliquer. L'ordre de la semaine est celui du festival : mardi → lundi.
 *
 * LE FORMULAIRE N'ENVOIE QUE CE QUI EST SAISI.
 * Le serveur (Code.gs) attend : id, day, date, start, end, target,
 * vehicles, active, brunch. `ordre`, `c3` et le libellé sont CALCULÉS
 * côté serveur : le formulaire ne les envoie pas et ne les affiche pas.
 *
 * Le champ de saisie est `target` dans le formulaire et dans le serveur.
 * `effectif` n'existe que pour l'affichage (rétrocompatibilité).
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

  /* ---------- JOURS DU FESTIVAL ----------
   * L'ordre est celui du festival : mardi -> lundi.
   * Une journee va du matin au petit matin : un creneau qui commence
   * a 01:00 le samedi appartient a la soiree du VENDREDI. C'est le jour
   * choisi qui fait foi, jamais l'horloge : aucun decalage a appliquer.
   * Le jour se CHOISIT ; la date s'en DEDUIT (calendrier de l'edition). */
  var JOURS = ["mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "lundi"];

  var jourKey = function (v) {
    return String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };

  var jourOptions = function (s) {
    var courant = jourKey((s && (s.day || s.jour)) || "");
    return JOURS.map(function (j) {
      return '<option value="' + j + '"' + (j === courant ? " selected" : "") + ">" +
        j.charAt(0).toUpperCase() + j.slice(1) + "</option>";
    }).join("");
  };

  /* Date du jour choisi. Le calendrier de l'edition vit dans
   * config.jours = { "2027-06-29": "mardi", ... }, rempli a la creation
   * de la saison. A defaut, on reprend la date deja portee par un creneau
   * de ce jour : ce qui fonctionne avec les donnees 2027 actuelles. */
  var dateDuJour = function (ctx, jour) {
    var k = jourKey(jour);
    if (JOURS.indexOf(k) < 0) return "";

    var cfg = (ctx && ctx.data && ctx.data.config) || {};
    var table = cfg.jours || cfg.calendrier || null;
    if (table) {
      for (var iso in table) {
        if (jourKey(table[iso]) === k) return isoDate(iso);
      }
    }

    var connu = "";
    ((ctx && ctx.data && ctx.data.shifts) || []).forEach(function (s) {
      if (jourKey(s.day || s.jour) === k) {
        var d = isoDate(s.date);
        if (d && (!connu || d < connu)) connu = d;
      }
    });
    return connu;
  };

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
          var total = Number(s.target || s.effectif || 0);
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
      ? { start: "", end: "", target: 0, vehicles: 0, active: true, date: "" }
      : ((ctx.data.shifts || []).filter(function (x) { return x.id === id; })[0] || {});

    return '<div class="toolbar"><button class="button secondary" data-creneaux="back">\u2039 Créneaux</button>' +
      '<span class="badge">' + (isNew ? "Nouveau créneau" : "Modifier le créneau") + "</span></div>" +
      '<form id="shiftForm" data-mode="' + (isNew ? "new" : "edit") + '" data-id="' + esc(s.id || "") + '" class="form-grid">' +
      /* --- Le créneau : ce qu'il est et quand il a lieu --- */
      '<div><label>Identifiant<input name="id" value="' + esc(s.id || "") + '"' +
      (isNew ? ' placeholder="ex. Ma3"' : " readonly") + "></label></div>" +
      '<div><label>Jour<select name="day">' + jourOptions(s) + "</select></label></div>" +
      '<div><label>Début<input name="start" type="time" value="' + esc(s.start || "") + '" required></label></div>' +
      '<div><label>Fin<input name="end" type="time" value="' + esc(s.end || "") + '" required></label></div>' +
      /* --- Le besoin : combien de monde, combien de véhicules --- */
      '<div><label>Effectif cible<input name="target" type="number" min="0" step="1" inputmode="numeric" value="' + esc(s.target || s.effectif || 0) + '"></label></div>' +
      '<div><label>Véhicules prévus<input name="vehicles" type="number" min="0" step="1" inputmode="numeric" value="' + esc(s.vehicles || 0) + '"></label></div>' +
      /* --- Options --- */
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="active"' + (s.active === false ? "" : " checked") + "><span>Créneau actif</span></label>" +
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

  /* Lecture du formulaire : SEULEMENT ce qui est saisi.
   * Le jour est choisi, la date s'en deduit. `ordre`, `c3` et le libelle
   * se calculent cote serveur : ils ne sont ni affiches, ni envoyes. */
  function readShift(form, ctx) {
    var f = form.elements;
    var get = function (n) { return f[n] ? String(f[n].value).trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    var jour = jourKey(get("day"));
    return {
      id: get("id"),
      day: jour,
      date: dateDuJour(ctx, jour),
      start: get("start"),
      end: get("end"),
      target: Number(get("target")) || 0,
      effectif: Number(get("target")) || 0,
      vehicles: Number(get("vehicles")) || 0,
      active: on("active"),
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

  /* Même principe : seuls les champs saisis partent au serveur. */
  function readConcert(form) {
    var f = form.elements;
    var get = function (n) { return f[n] ? String(f[n].value).trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    var date = get("date");
    return {
      artist: get("artist"),
      date: date,
      jour: dateToDay(date) || "",
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
    dayDisplay: dayDisplay,
    JOURS: JOURS,
    dateDuJour: dateDuJour
  };
})(window);
