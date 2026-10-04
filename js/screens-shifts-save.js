/* Beauregard V2 — enregistrement des créneaux et concerts.
 *
 * FICHIER AUTONOME : ne dépend ni de ScreenShifts, ni de l'ordre des scripts,
 * ni de l'événement submit. Il capte le CLIC sur le bouton Enregistrer, lit le
 * formulaire directement, et envoie au serveur.
 *
 * Cause du bug précédent : le formulaire partait en GET et rechargeait la page
 * avec les valeurs dans l'URL, preuve qu'aucun écouteur de submit ne tournait.
 * Un écouteur de clic délégué ne peut pas être contourné de la même façon.
 */
(function (root) {
  "use strict";

  var esc = function (s) { return String(s === undefined || s === null ? "" : s); };

  function notice(msg, type) {
    var n = document.getElementById("appNotice");
    if (!n) return;
    n.textContent = msg;
    n.classList.remove("hidden");
    n.dataset.type = type || "info";
    clearTimeout(notice.t);
    notice.t = setTimeout(function () { n.classList.add("hidden"); }, 7000);
  }

  function v(form, name) {
    var el = form.elements[name];
    return el ? String(el.value || "").trim() : "";
  }
  function c(form, name) {
    var el = form.elements[name];
    return !!(el && el.checked);
  }

  /* « 09:00 » + « 17:00 » + « Ma1 »  →  « 09h00 - 17h00 (Ma1) » */
  function hhmmFr(t) {
    var p = String(t || "").split(":");
    if (p.length < 2 || !p[0]) return "";
    return p[0].padStart(2, "0") + "h" + (p[1] || "00").padStart(2, "0");
  }
  function slotLabel(a, b, id) {
    var x = hhmmFr(a), y = hhmmFr(b);
    if (!x || !y) return "";
    return x + " - " + y + (id ? " (" + id + ")" : "");
  }

  /* Accès au transport et à la file, exposés par app.js. */
  function send(collection, row, baseVersion, baseRow, done) {
    var T = root.Transport;
    if (!T) { notice("Transport indisponible : recharge la page.", "error"); return; }

    var call = T.save(collection, row, baseVersion, baseRow);
    call.then(function (out) {
      if (out && out.conflict) {
        notice("Conflit détecté : une autre personne a modifié cette ligne.", "error");
        return;
      }
      done(out);
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (root.Queue && (msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        root.Queue.enqueue({ collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
          .then(function () {
            notice("Hors ligne : enregistrement gardé, envoi au retour du réseau.", "info");
          });
        return;
      }
      notice("Échec de l'enregistrement : " + msg, "error");
    });
  }

  /* Mise à jour du cache local et retour à l'application. */
  function finish(collection, row) {
    try {
      var raw = JSON.parse(localStorage.getItem("planning_v2_bundle") || "null");
      if (raw && raw.data) {
        var list = (raw.data[collection] || []).filter(function (x) { return x.id !== row.id; });
        list.push(row);
        raw.data[collection] = list;
        localStorage.setItem("planning_v2_bundle", JSON.stringify(raw));
      }
    } catch (e) {}
    if (typeof root.beauregardRender === "function") root.beauregardRender();
    else if (root.navigate) root.navigate("creneaux");
  }

  function submitShift(form) {
    var id = v(form, "id");
    if (!id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
    var start = v(form, "start"), end = v(form, "end");
    if (!start || !end) { notice("Horaires obligatoires.", "error"); return; }

    var row = {
      id: id,
      name: slotLabel(start, end, id),
      day: v(form, "day"),
      start: start,
      end: end,
      effectif: Number(v(form, "target")) || 0,
      vehicles: Number(v(form, "vehicles")) || 0,
      active: c(form, "active"),
      c3: c(form, "c3"),
      brunch: c(form, "brunch")
    };

    var mode = form.getAttribute("data-mode");
    var currentId = form.getAttribute("data-id") || "";
    var prev = null;
    try {
      var raw = JSON.parse(localStorage.getItem("planning_v2_bundle") || "null");
      prev = ((raw && raw.data && raw.data.shifts) || []).filter(function (x) { return x.id === currentId; })[0] || null;
    } catch (e) {}
    if (mode === "new" && prev) { notice("Cet identifiant existe déjà.", "error"); return; }

    var baseVersion = prev ? prev.version || 0 : 0;
    row.version = baseVersion;
    send("shifts", row, baseVersion, prev, function () {
      notice("Créneau " + id + " enregistré.", "success");
      finish("shifts", row);
    });
  }

  function submitConcert(form) {
    var artist = v(form, "artist");
    if (!artist) { notice("Artiste obligatoire.", "error"); return; }
    var start = v(form, "start"), end = v(form, "end");
    if (!start || !end) { notice("Horaires obligatoires.", "error"); return; }

    var mode = form.getAttribute("data-mode");
    var currentId = form.getAttribute("data-id") || "";
    var prev = null;
    try {
      var raw = JSON.parse(localStorage.getItem("planning_v2_bundle") || "null");
      prev = ((raw && raw.data && raw.data.concerts) || []).filter(function (x) { return x.id === currentId; })[0] || null;
    } catch (e) {}

    var row = {
      id: (mode === "new" || !currentId) ? "co-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : currentId,
      artist: artist,
      day: v(form, "day"),
      scene: v(form, "scene"),
      start: start,
      end: end,
      photo: v(form, "photo"),
      active: c(form, "active")
    };
    var baseVersion = prev ? prev.version || 0 : 0;
    row.version = baseVersion;
    send("concerts", row, baseVersion, prev, function () {
      notice("Concert " + artist + " enregistré.", "success");
      finish("concerts", row);
    });
  }

  /* Écouteur de clic unique, capté sur le document : il voit tout, même les
   * boutons recréés à chaque rendu. Aucune dépendance à submit. */
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var enc = t.closest("#shiftForm button.primary, #shiftForm button[type='submit']");
    if (enc) {
      e.preventDefault();
      submitShift(t.closest("#shiftForm"));
      return;
    }
    var conc = t.closest("#concertForm button.primary, #concertForm button[type='submit']");
    if (conc) {
      e.preventDefault();
      submitConcert(t.closest("#concertForm"));
    }
  }

  /* On bloque aussi la soumission native : si l'événement part malgré tout,
   * la page ne doit JAMAIS se recharger avec les valeurs dans l'URL. */
  function onSubmit(e) {
    var f = e.target;
    if (f && (f.id === "shiftForm" || f.id === "concertForm")) e.preventDefault();
  }

  if (!root.BeauregardShifts) {
    root.BeauregardShifts = true;
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
  }
})(window);
