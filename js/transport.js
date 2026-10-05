/* Beauregard V2 — transport unique GitHub ↔ Apps Script.
 * Reprend le mécanisme de la V1 : fetch GET, tous les paramètres dans l'URL,
 * réponse JSON via ContentService.MimeType.JSON côté serveur.
 * Aucun iframe, aucun postMessage, aucun POST expérimental.
 */
(function (root) {
  "use strict";

  var TOKEN_KEY = "planning_session_token";
  var DEFAULT_TIMEOUT = 60000;

  // En cas de panne temporaire Apps Script :
  // tentative initiale + 2 nouvelles tentatives.
  var MAX_RETRIES = 2;
  var RETRY_DELAYS = [800, 1800];

  function base_() {
    var cfg = root.BEAUREGARD_CONFIG || {};
    return String(cfg.API_URL || "").trim();
  }

  function token_() {
    try {
      return root.localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken_(value) {
    try {
      if (value) root.localStorage.setItem(TOKEN_KEY, value);
      else root.localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function uuid_() {
    if (root.crypto && root.crypto.randomUUID) {
      return root.crypto.randomUUID();
    }

    return (
      "op-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2)
    );
  }

  function wait_(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /*
   * On ne retente QUE les erreurs qui peuvent raisonnablement
   * être temporaires.
   *
   * On ne retente donc PAS :
   * - Code invalide
   * - Accès désactivé
   * - Rôle interdit
   * - Erreur métier Apps Script
   * - Réponse incohérente
   */
  function retryable_(e) {
    if (!e) return false;

    // Timeout
    if (e.name === "AbortError") {
      return true;
    }

    // Erreur réseau fetch
    if (e.name === "TypeError") {
      return true;
    }

    var message = String(e.message || e);

    var match = message.match(/^HTTP_(\d{3})$/);

    if (!match) {
      return false;
    }

    var status = Number(match[1]);

    // 404 Google Apps Script temporaire observé
    if (status === 404) return true;

    // Timeout HTTP
    if (status === 408) return true;

    // Trop de requêtes
    if (status === 429) return true;

    // Erreurs serveur
    if (status >= 500) return true;

    return false;
  }

  /*
   * Un appel logique = un requestId unique.
   *
   * IMPORTANT :
   * le même requestId et le même opId sont conservés
   * pendant toutes les tentatives.
   *
   * Ainsi, si Apps Script a bien exécuté une mutation mais
   * que la réponse Google s'est perdue, la nouvelle tentative
   * ne doit pas créer une deuxième opération.
   */
  function call_(action, data, options) {
    var opts = options || {};
    var base = base_();

    if (!base) {
      return Promise.reject(
        new Error(
          "Le lien Apps Script n'est pas configuré (config.js)."
        )
      );
    }

    var requestId = uuid_();

    var url = new URL(base);

    url.searchParams.set("api", action);
    url.searchParams.set("requestId", requestId);

    if (!opts.public) {
      url.searchParams.set("token", token_());
    }

    if (opts.opId) {
      url.searchParams.set("opId", opts.opId);
    }

    url.searchParams.set(
      "data",
      JSON.stringify(data || {})
    );

    function attempt_(attempt) {
      var controller =
        root.AbortController &&
        new root.AbortController();

      var timer = setTimeout(function () {
        if (controller) {
          controller.abort();
        }
      }, opts.timeout || DEFAULT_TIMEOUT);

      return fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller
          ? controller.signal
          : undefined,
      })

        .then(function (response) {
          if (!response.ok) {
            throw new Error(
              "HTTP_" + response.status
            );
          }

          return response
            .json()
            .catch(function () {
              throw new Error(
                "Réponse non JSON : vérifier le déploiement Apps Script et ses droits d'accès."
              );
            });
        })

        .then(function (out) {
          if (
            out.requestId &&
            out.requestId !== requestId
          ) {
            throw new Error(
              "Réponse serveur incohérente"
            );
          }

          if (!out.ok) {
            throw new Error(
              out.error || "Erreur serveur"
            );
          }

          return out.data;
        })

        .then(
          function (value) {
            clearTimeout(timer);
            return value;
          },

          function (e) {
            clearTimeout(timer);

            /*
             * Panne temporaire :
             * on retente automatiquement.
             */
            if (
              retryable_(e) &&
              attempt < MAX_RETRIES
            ) {
              var delay =
                RETRY_DELAYS[attempt] || 1800;

              return wait_(delay).then(
                function () {
                  return attempt_(
                    attempt + 1
                  );
                }
              );
            }

            /*
             * Toutes les tentatives ont échoué.
             */
            if (
              e &&
              e.name === "AbortError"
            ) {
              throw new Error(
                "Le serveur ne répond pas après plusieurs tentatives. L'action en attente est conservée."
              );
            }

            throw e;
          }
        );
    }

    return attempt_(0);
  }

  root.Transport = {
    call: call_,
    token: token_,
    setToken: setToken_,
    requestId: uuid_,

    ping: function () {
      return call_(
        "ping",
        {},
        { public: true }
      );
    },

    login: function (code, operator) {
      return call_(
        "login",
        {
          code: String(code || "")
            .trim()
            .toUpperCase(),

          operator:
            operator || "",
        },
        {
          public: true,
        }
      ).then(function (out) {
        if (out && out.token) {
          setToken_(out.token);
        }

        return out;
      });
    },

    logout: function () {
      return call_(
        "logout",
        {},
        {}
      ).then(function (out) {
        setToken_("");
        return out;
      });
    },

    sync: function (since, role) {
      return call_(
        "sync",
        {
          since: since || 0,
          role: role || "",
        },
        {}
      );
    },

    save: function (
      collection,
      row,
      baseVersion,
      baseRow
    ) {
      return call_(
        "save",
        {
          collection: collection,
          row: row,
          baseVersion: baseVersion,
          baseRow: baseRow,
          clientAt:
            new Date().toISOString(),
        },
        {
          opId: uuid_(),
        }
      );
    },

    mutate: function (action, data) {
      return call_(
        action,
        data,
        {
          opId: uuid_(),
        }
      );
    },

    read: function (action, data) {
      return call_(
        action,
        data,
        {}
      );
    },
  };
})(window);
