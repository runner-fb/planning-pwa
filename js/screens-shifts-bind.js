  /* ---------- Créneaux ---------- */
  function renderCreneaux(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Créneaux n'est pas chargé."); return; }
    c.innerHTML = state.shiftId ? S.shiftForm({ data: d }, state.shiftId) : S.shifts({ data: d });
    wireCreneaux();
  }

  function wireCreneaux() {
    var S = window.ScreenShifts;
    if (!S) return;

    Array.prototype.forEach.call(document.querySelectorAll("[data-creneaux]"), function (b) {
      b.onclick = function () { state.shiftId = ""; render(); };
    });

    /* Création : on ouvre un formulaire vide. */
    Array.prototype.forEach.call(document.querySelectorAll("[data-new-shift]"), function (b) {
      b.onclick = function () { state.shiftId = "__new__"; render(); };
    });

    /* Ouverture d'une ligne existante. */
    Array.prototype.forEach.call(document.querySelectorAll("[data-shift]"), function (b) {
      b.onclick = function () { state.shiftId = String(b.dataset.shift || ""); render(); };
    });

    /* Suppression d'un créneau. */
    Array.prototype.forEach.call(document.querySelectorAll("[data-shift-remove]"), function (b) {
      b.onclick = function () {
        var s = (state.data.shifts || []).filter(function (x) { return x.id === state.shiftId; })[0];
        if (!s) return;
        if (!window.confirm("Supprimer le créneau " + (s.name || s.id) + " ?\nLes affectations liées ne sont pas modifiées.")) return;
        var row = Object.assign({}, s, { deleted: true, active: false });
        sendSave("shifts", row, s.version || 0, s)
          .then(function () {
            state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== s.id; });
            saveLocal();
            state.shiftId = "";
            notice("Créneau supprimé.", "success");
            render();
          })
          .catch(function (e) { notice(String(e.message || e), "error"); });
      };
    });

    /* Réinitialisation : on recharge les valeurs enregistrées. */
    Array.prototype.forEach.call(document.querySelectorAll("[data-shift-reset]"), function (b) {
      b.onclick = function () {
        notice("Champs rechargés depuis les données enregistrées.", "info");
        render();
      };
    });

    var form = $("#shiftForm");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        var row = S.readShift(form);
        if (!row.id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
        if (!/^\d{2}:\d{2}$/.test(row.start) || !/^\d{2}:\d{2}$/.test(row.end)) {
          notice("Horaires obligatoires.", "error");
          return;
        }
        var isNew = state.shiftId === "__new__";
        var old = isNew
          ? null
          : (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
        var existing = (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
        if (isNew && existing) { notice("Cet identifiant existe déjà.", "error"); return; }
        var full = old ? Object.assign({}, old, row) : row;
        full.version = old ? old.version || 0 : 0;
        sendSave("shifts", full, old ? old.version || 0 : 0, old)
          .then(function () {
            state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== full.id; }).concat([full]);
            saveLocal();
            state.shiftId = "";
            notice("Créneau enregistré.", "success");
            render();
          })
          .catch(function (err) { notice(String(err.message || err), "error"); });
      };
    }
  }

  /* ---------- Concerts ---------- */
  function renderConcerts(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Concerts n'est pas chargé."); return; }
    c.innerHTML = state.concertId ? S.concertForm({ data: d }, state.concertId) : S.concerts({ data: d });
    wireConcerts();
  }

  function wireConcerts() {
    var S = window.ScreenShifts;
    if (!S) return;

    Array.prototype.forEach.call(document.querySelectorAll("[data-concerts]"), function (b) {
      b.onclick = function () { state.concertId = ""; render(); };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-new-concert]"), function (b) {
      b.onclick = function () { state.concertId = "__new__"; render(); };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-concert]"), function (b) {
      b.onclick = function () { state.concertId = String(b.dataset.concert || ""); render(); };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-concert-remove]"), function (b) {
      b.onclick = function () {
        var k = (state.data.concerts || []).filter(function (x) { return x.id === state.concertId; })[0];
        if (!k) return;
        if (!window.confirm("Supprimer le concert " + (k.artist || k.id) + " ?")) return;
        var row = Object.assign({}, k, { deleted: true, active: false });
        sendSave("concerts", row, k.version || 0, k)
          .then(function () {
            state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== k.id; });
            saveLocal();
            state.concertId = "";
            notice("Concert supprimé.", "success");
            render();
          })
          .catch(function (e) { notice(String(e.message || e), "error"); });
      };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-concert-reset]"), function (b) {
      b.onclick = function () {
        notice("Champs rechargés depuis les données enregistrées.", "info");
        render();
      };
    });

    var form = $("#concertForm");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        var row = S.readConcert(form);
        if (!row.artist) { notice("Artiste obligatoire.", "error"); return; }
        var isNew = state.concertId === "__new__";
        var old = isNew
          ? null
          : (state.data.concerts || []).filter(function (x) { return x.id === state.concertId; })[0];
        var full = old ? Object.assign({}, old, row) : row;
        if (!full.id) full.id = "co-" + Transport.requestId().slice(0, 8);
        full.version = old ? old.version || 0 : 0;
        sendSave("concerts", full, old ? old.version || 0 : 0, old)
          .then(function () {
            state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== full.id; }).concat([full]);
            saveLocal();
            state.concertId = "";
            notice("Concert enregistré.", "success");
            render();
          })
          .catch(function (err) { notice(String(err.message || err), "error"); });
      };
    }
  }
