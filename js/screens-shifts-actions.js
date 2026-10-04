  /* ---------- Créneaux ---------- */
  function renderCreneaux(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Créneaux n'est pas chargé."); return; }
    if (!state.shiftMode) { c.innerHTML = S.shifts({ data: d }); return; }
    c.innerHTML = S.shiftForm({ data: d }, state.shiftMode, state.shiftId);
  }

  /* Action unique pour les créneaux et concerts, appelée par la délégation
   * de js/screens-shifts-bind.js. L'état ne porte que le mode et l'id ;
   * le formulaire porte lui-même ces valeurs pour la soumission. */
  function scenesAction(b) {
    if (b.dataset.creneaux !== undefined) { state.shiftMode = ""; state.shiftId = ""; render(); return; }
    if (b.dataset.concerts !== undefined) { state.concertMode = ""; state.concertId = ""; render(); return; }
    if (b.dataset.newShift !== undefined) { state.shiftMode = "new"; state.shiftId = ""; render(); return; }
    if (b.dataset.newConcert !== undefined) { state.concertMode = "new"; state.concertId = ""; render(); return; }
    if (b.dataset.shift) { state.shiftMode = "edit"; state.shiftId = String(b.dataset.shift); render(); return; }
    if (b.dataset.concert) { state.concertMode = "edit"; state.concertId = String(b.dataset.concert); render(); return; }

    if (b.dataset.shiftReset !== undefined || b.dataset.concertReset !== undefined) {
      notice("Champs rechargés depuis les données enregistrées.", "info");
      render();
      return;
    }

    if (b.dataset.shiftRemove !== undefined) {
      var s = (state.data.shifts || []).filter(function (x) { return x.id === state.shiftId; })[0];
      if (!s) return;
      if (!window.confirm("Supprimer le créneau " + (s.name || s.id) + " ?")) return;
      var r1 = Object.assign({}, s, { deleted: true, active: false });
      sendSave("shifts", r1, s.version || 0, s).then(function () {
        state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== s.id; });
        saveLocal();
        state.shiftMode = "";
        state.shiftId = "";
        notice("Créneau supprimé.", "success");
        render();
      }).catch(function (e) { notice(String(e.message || e), "error"); });
      return;
    }

    if (b.dataset.concertRemove !== undefined) {
      var k = (state.data.concerts || []).filter(function (x) { return x.id === state.concertId; })[0];
      if (!k) return;
      if (!window.confirm("Supprimer le concert " + (k.artist || k.id) + " ?")) return;
      var r2 = Object.assign({}, k, { deleted: true, active: false });
      sendSave("concerts", r2, k.version || 0, k).then(function () {
        state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== k.id; });
        saveLocal();
        state.concertMode = "";
        state.concertId = "";
        notice("Concert supprimé.", "success");
        render();
      }).catch(function (e) { notice(String(e.message || e), "error"); });
      return;
    }
  }

  /* ---------- Concerts ---------- */
  function renderConcerts(c, d) {
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Concerts n'est pas chargé."); return; }
    if (!state.concertMode) { c.innerHTML = S.concerts({ data: d }); return; }
    c.innerHTML = S.concertForm({ data: d }, state.concertMode, state.concertId);
  }

  /* Enregistrement d'un créneau : appelé par le gestionnaire de soumission. */
  function saveShift(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    full.version = old ? old.version || 0 : 0;
    sendSave("shifts", full, old ? old.version || 0 : 0, old)
      .then(function () {
        state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== full.id; }).concat([full]);
        saveLocal();
        state.shiftMode = "";
        state.shiftId = "";
        notice("Créneau " + full.id + " enregistré.", "success");
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function saveConcert(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    if (!full.id) full.id = "co-" + Transport.requestId().slice(0, 8);
    full.version = old ? old.version || 0 : 0;
    sendSave("concerts", full, old ? old.version || 0 : 0, old)
      .then(function () {
        state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== full.id; }).concat([full]);
        saveLocal();
        state.concertMode = "";
        state.concertId = "";
        notice("Concert enregistré.", "success");
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); });
  }

  /* Magasin exposé au gestionnaire de soumission. */
  window.BeauregardStore = {
    find: function (k, id) {
      return ((state.data || {})[k] || []).filter(function (x) { return x.id === id; })[0] || null;
    },
    saveShift: saveShift,
    saveConcert: saveConcert
  };
