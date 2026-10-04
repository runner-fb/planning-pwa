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
      b.onclick = function () { state.shiftId = ""; go("setup"); };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-shift]"), function (b) {
      b.onclick = function () {
        state.shiftId = b.dataset.shift === "new" ? "" : b.dataset.shift;
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
        var old = (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
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
      b.onclick = function () { state.concertId = ""; go("setup"); };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-concert]"), function (b) {
      b.onclick = function () {
        state.concertId = b.dataset.concert === "new" ? "" : b.dataset.concert;
        render();
      };
    });

    var form = $("#concertForm");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        var row = S.readConcert(form);
        if (!row.artist) { notice("Artiste obligatoire.", "error"); return; }
        var old = (state.data.concerts || []).filter(function (x) { return x.id === state.concertId; })[0];
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
