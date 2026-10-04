/* Beauregard V2 — file d'actions hors ligne.
 * Point 62 du cahier des charges : chaque action porte un identifiant unique,
 * sa cible, sa nouvelle valeur, son auteur et l'heure de l'appareil.
 * IndexedDB plutôt que localStorage : les photos et signatures de réception
 * y tiennent sans saturer le quota.
 */
(function (root) {
  "use strict";

  var DB = "beauregard-v2";
  var STORE = "queue";
  var VERSION = 1;
  var db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var s = d.createObjectStore(STORE, { keyPath: "id" });
          s.createIndex("at", "at");
          s.createIndex("collection", "collection");
        }
      };
      r.onsuccess = function () { db = r.result; resolve(db); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function tx(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode);
        var out = fn(t.objectStore(STORE));
        t.oncomplete = function () {
          resolve(out && out.result !== undefined ? out.result : out);
        };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "op-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  /* Auteur de l'action : la session locale, jamais le code en clair. */
  function author() {
    try {
      var raw = JSON.parse(localStorage.getItem("planning_v2_bundle") || "null");
      var u = (raw && raw.data && raw.data.user) || {};
      return { id: u.id || "", name: u.name || "", role: (raw && raw.role) || "" };
    } catch (e) {
      return { id: "", name: "", role: "" };
    }
  }

  function enqueue(action) {
    var a = author();
    var row = {
      id: uuid(),
      collection: String(action.collection || ""),
      entityId: String(action.entityId || ""),
      action: String(action.action || "save"),
      value: action.value === undefined ? null : action.value,
      baseVersion: Number(action.baseVersion || 0),
      baseRow: action.baseRow || null,
      payload: action.payload || null,
      authorId: a.id,
      authorName: a.name,
      authorRole: a.role,
      at: new Date().toISOString(),
      state: "pending",
      tries: 0,
      error: ""
    };
    return tx("readwrite", function (s) { s.put(row); return { result: row }; });
  }

  function list() {
    return tx("readonly", function (s) {
      var out = [];
      var r = s.openCursor();
      r.onsuccess = function () {
        var c = r.result;
        if (c) { out.push(c.value); c.continue(); }
      };
      return { get result() { return out; } };
    });
  }

  function count() {
    return list().then(function (rows) {
      return rows.filter(function (r) { return r.state === "pending"; }).length;
    });
  }

  function update(row) {
    return tx("readwrite", function (s) { s.put(row); return { result: row }; });
  }

  function remove(id) {
    return tx("readwrite", function (s) { s.delete(id); });
  }

  function clear() {
    return tx("readwrite", function (s) { s.clear(); });
  }

  /* Envoi vers le serveur. Un conflit renvoyé par le serveur n'est jamais
   * résolu ici : il est conservé pour arbitrage humain (point 62). */
  function flush() {
    if (!navigator.onLine) return Promise.resolve({ sent: 0, remaining: 0 });
    if (flush.running) return flush.running;

    flush.running = list()
      .then(function (rows) {
        var pending = rows.filter(function (r) { return r.state === "pending"; });
        if (!pending.length) return { sent: 0, remaining: 0 };

        var sent = 0;
        var chain = Promise.resolve();

        pending.forEach(function (row) {
          chain = chain.then(function () {
            var call;
            if (row.collection) {
              call = Transport.save(
                row.collection,
                row.value || {},
                row.baseVersion,
                row.baseRow
              );
            } else {
              call = Transport.mutate(row.action, row.payload || {});
            }

            return call
              .then(function (out) {
                if (out && out.conflict) {
                  row.state = "conflict";
                  row.error = String(out.conflict);
                  return update(row);
                }
                sent++;
                return remove(row.id);
              })
              .catch(function (e) {
                row.tries = (row.tries || 0) + 1;
                row.error = String((e && e.message) || e);
                /* Après trois essais, l'action reste visible et bloquée au lieu
                 * de disparaître en silence. */
                if (row.tries >= 3) row.state = "blocked";
                return update(row);
              });
          });
        });

        return chain.then(function () {
          return count().then(function (n) { return { sent: sent, remaining: n }; });
        });
      })
      .then(
        function (v) { flush.running = null; return v; },
        function (e) { flush.running = null; throw e; }
      );

    return flush.running;
  }

  root.Queue = {
    enqueue: enqueue,
    list: list,
    count: count,
    remove: remove,
    clear: clear,
    flush: flush
  };
})(window);
