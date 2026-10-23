/** Beauregard V2.1 — déployer avec Domain.gs. POST iframe conservé. */
const BUILD = "2.1.0-rc5",
  ORIGIN = "https://runner-fb.github.io";
const COLLECTIONS = [
  "people",
  "access",
  "shifts",
  "missions",
  "concerts",
  "forms",
  "simulations",
  "assignments",
  "rotations",
  "arbitrations",
  "terrain",
  "vehicles",
  "receptions",
  "incidents",
  "messages",
  "reads",
  "publications",
  "conflicts",
  "amendments",
  "deliveries",
];
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Beauregard V2")
    .addItem("Installer / vérifier V2.1", "setupV2")
    .addItem("Définir le code Admin", "setV2AdminCode")
    .addToUi();
}
function setupV2() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw Error("Ouvre Apps Script depuis DonnéesBG_V2");
  const p = PropertiesService.getScriptProperties();
  p.setProperty("V2_SPREADSHEET_ID", ss.getId());
  if (!p.getProperty("V2_SALT"))
    p.setProperty("V2_SALT", Utilities.getUuid() + Utilities.getUuid());
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!p.getProperty("BG_STATE_GENERATION")) {
      const s = empty_();
      const old = ss.getSheetByName("BENEVOLES");
      if (old && old.getLastRow() > 1) migrate_(ss, s);
      save_(s);
    }
  } finally {
    lock.releaseLock();
  }
  SpreadsheetApp.getUi().alert(
    "V2.1 initialisée sans modifier la V1. Définis le code Admin, puis déploie une nouvelle version.",
  );
}
function setV2AdminCode() {
  const ui = SpreadsheetApp.getUi(),
    r = ui.prompt(
      "Code Admin",
      "12 caractères minimum",
      ui.ButtonSet.OK_CANCEL,
    );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const code = r.getResponseText();
  if (code.length < 12) throw Error("12 caractères minimum");
  const p = PropertiesService.getScriptProperties();
  p.setProperty("V2_ADMIN_HASH", hash_(code));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const s = load_();
    s.sessions = s.sessions.filter((x) => x.role !== "admin");
    save_(s);
  } finally {
    lock.releaseLock();
  }
}
function empty_() {
  const s = {
    version: 0,
    config: {
      id: "edition",
      year: 2027,
      name: "Beauregard",
      phase: "Préparation",
      formOpen: false,
      appOpen: false,
      vehicleAccess: false,
      vehiclesPlanned: 0,
      reserveA: true,
      quotaMin: 40,
      quotaMax: 60,
      validated: false,
      appUrl: "https://runner-fb.github.io/planning-pwa/",
      emailMessage: "Bonjour {Prénom}, ton planning est disponible.",
      checksAccepted: [],
    },
    sessions: [],
    access: [],
    uploads: [],
    ops: [],
    audit: [],
  };
  COLLECTIONS.forEach((k) => (s[k] = []));
  return s;
}
function ss_() {
  const id =
    PropertiesService.getScriptProperties().getProperty("V2_SPREADSHEET_ID");
  if (!id) throw Error("Exécute setupV2");
  return SpreadsheetApp.openById(id);
}
function chargerConfigEdition_(s) {
  const sh = ss_().getSheetByName("CONFIG_EDITION");
  if (!sh || sh.getLastRow() < 2) return s;

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function (x) {
    return String(x || "").trim().toLowerCase();
  });

  let iCle = headers.indexOf("cle");
  if (iCle < 0) iCle = headers.indexOf("champ");

  const iValeur = headers.indexOf("valeur");

  if (iCle < 0 || iValeur < 0) {
    throw Error(
      "CONFIG_EDITION : colonnes cle/champ et valeur introuvables"
    );
  }

  const cfg = {};

  for (let i = 1; i < values.length; i++) {
    const cle = String(values[i][iCle] || "")
      .trim()
      .toLowerCase();

    if (!cle) continue;

    const brut = values[i][iValeur];

    const valeur =
      brut instanceof Date
        ? Utilities.formatDate(brut, "Europe/Paris", "yyyy-MM-dd")
        : brut == null
          ? ""
          : String(brut).trim();

    cfg[cle] = valeur;
  }

  s.config = s.config || {};

  /*
   * CONFIG_EDITION est ici la référence du calendrier.
   *
   * On ne recharge PAS phase, formOpen, appOpen, quotas, etc.
   * car ces valeurs peuvent être modifiées par l'application.
   */
  if (cfg.date_debut) {
    s.config.date_debut = cfg.date_debut.slice(0, 10);
  }

  if (cfg.date_fin) {
    s.config.date_fin = cfg.date_fin.slice(0, 10);
  }

  // Le calendrier sera reconstruit avec les nouvelles bornes.
  delete s.config.jours;

  return s;
}

function mettreAJourConfigEdition_(modifications) {
  const sh = ss_().getSheetByName("CONFIG_EDITION");

  if (!sh) {
    throw Error("Onglet CONFIG_EDITION introuvable");
  }

  if (sh.getLastRow() < 2) {
    throw Error("CONFIG_EDITION est vide");
  }

  const values = sh.getDataRange().getValues();

  const headers = values[0].map(function (x) {
    return String(x || "").trim().toLowerCase();
  });

  let iCle = headers.indexOf("cle");

  if (iCle < 0) {
    iCle = headers.indexOf("champ");
  }

  const iValeur = headers.indexOf("valeur");

  if (iCle < 0 || iValeur < 0) {
    throw Error(
      "CONFIG_EDITION : colonnes cle/champ et valeur introuvables"
    );
  }

  const lignes = {};

  for (let i = 1; i < values.length; i++) {
    const cle = String(values[i][iCle] || "")
      .trim()
      .toLowerCase();

    if (cle) {
      lignes[cle] = i + 1;
    }
  }

  Object.keys(modifications).forEach(function (cle) {
    if (!Object.prototype.hasOwnProperty.call(lignes, cle)) {
      const row = Array(headers.length).fill(""); row[iCle] = cle; row[iValeur] = modifications[cle];
      sh.appendRow(row); return;
    }

    sh.getRange(
      lignes[cle],
      iValeur + 1
    ).setValue(modifications[cle]);
  });
}
/* Générations immuables. Le pointeur est changé uniquement après écriture complète. */
function load_() {
  const p = PropertiesService.getScriptProperties(),
    g = p.getProperty("BG_STATE_GENERATION");
  if (!g) throw Error("Exécute setupV2 pour initialiser V2.1");
  const sh = ss_().getSheetByName("BG_ETAT_V2");
  if (!sh) throw Error("Stockage absent");
  const rows = sh
    .getDataRange()
    .getValues()
    .filter((r) => String(r[0]) === g)
    .sort((a, b) => a[1] - b[1]);
  if (!rows.length) throw Error("État introuvable");
const state = JSON.parse(rows.map((r) => r[2]).join(""));
  state.uploads = state.uploads || [];
  state.ops = state.ops || [];
  return state;
}
function save_(s) {
  s.version++;
  const ss = ss_();
  let sh = ss.getSheetByName("BG_ETAT_V2");
  if (!sh) {
    sh = ss.insertSheet("BG_ETAT_V2");
    sh.appendRow(["generation", "fragment", "json"]);
    sh.hideSheet();
  }
  const g = Utilities.getUuid(),
    json = JSON.stringify(s),
    rows = [];
  for (let i = 0; i < json.length; i += 35000)
    rows.push([g, i / 35000, json.slice(i, i + 35000)]);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  SpreadsheetApp.flush();
  const p = PropertiesService.getScriptProperties(),
    previous = p.getProperty("BG_STATE_GENERATION");
  p.setProperty("BG_STATE_GENERATION", g);
  if (previous) p.setProperty("BG_PREVIOUS_GENERATION", previous);
  syncVehicleAccess_(s);
  const all = sh.getDataRange().getValues();
  for (let i = all.length - 1; i > 0; i--)
    if (String(all[i][0]) !== g && String(all[i][0]) !== previous)
      sh.deleteRow(i + 1);
}
function hash_(v) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    (PropertiesService.getScriptProperties().getProperty("V2_SALT") || "") +
      "|" +
      v,
    Utilities.Charset.UTF_8,
  )
    .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"))
    .join("");
}
function now_() {
  return new Date().toISOString();
}
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (!p.api) {
      return ContentService.createTextOutput(
        "Beauregard V2 API en ligne. " + BUILD
      );
    }
    if (p.api === "ping") {
      return jsonResponse_({ ok: true, build: BUILD, at: now_() });
    }
    var r = {
      action: String(p.api),
      token: String(p.token || ""),
      opId: String(p.opId || ""),
      requestId: String(p.requestId || ""),
      data: JSON.parse(p.data || "{}")
    };
    return jsonResponse_({ ok: true, requestId: r.requestId, data: dispatch_(r) });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      requestId: String(p.requestId || ""),
      error: String(err && err.message ? err.message : err)
    });
  }
}

function doPost(e) {
  let requestId = "";
  try {
    const r = JSON.parse(e.parameter.payload || "{}");
    requestId = String(r.requestId || "");
    return reply_({ ok: true, requestId, data: dispatch_(r) });
  } catch (e) {
    return reply_({ ok: false, requestId, error: String(e.message || e) });
  }
}
function reply_(data) {
  const safe = JSON.stringify(data).replace(/</g, "\\u003c");
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>window.top.postMessage(' +
      safe +
      "," +
      JSON.stringify(ORIGIN) +
      ");</script>",
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function audit_(s, u, action, data) {
  s.audit.push({
    id: Utilities.getUuid(),
    author: u.id,
    role: u.role,
    action,
    at: now_(),
    details: data,
  });
}
function user_(s, token) {
  const u = s.sessions.find((x) => x.tokenHash === hash_(token));
  if (!u || u.revoked || Date.parse(u.expires) < Date.now())
    throw Error("SESSION_EXPIRED");
  if (u.role === "vehicles" && !s.config.vehicleAccess)
    throw Error("Accès Véhicules fermé");
  if (u.personId && !s.people.some((p) => p.id === u.personId && BG.active(p)))
    throw Error("Accès désactivé");
  if (u.personId) {
    const current = s.people.find((p) => p.id === u.personId);
    u.role = current.role === "referent" ? "referent" : "benevole";
  }
  u.lastSync = now_();
  return u;
}
function role_(u, roles) {
  if (!roles.includes(u.role)) throw Error("Accès refusé");
}
function dispatch_(r) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
  let s = load_();

  chargerConfigEdition_(s);
synchroniserCreneauxDepuisSheet_(s);
synchroniserConcertsDepuisSheet_(s);

  if (r.action === "login") {
      const code = String(r.data?.code || "");
            const cache = CacheService.getScriptCache();
      const prefix = hash_(code.slice(0, 2).toUpperCase()).slice(0, 12);
      const key = "tries:" + prefix + ":" + hash_(code).slice(0, 12);
      const globalKey = "tries:total:" + prefix;
      const tries = Number(cache.get(key) || 0);
      const total = Number(cache.get(globalKey) || 0);
      if (tries >= 6 || total >= 30)
        throw Error("Trop de tentatives. Attends 10 minutes.");

      let u;
      if (
        hash_(code) ===
        PropertiesService.getScriptProperties().getProperty("V2_ADMIN_HASH")
      )
        u = { id: "ADMIN", role: "admin", name: "Organisation" };
      else if (
        s.config.vehicleAccess &&
        s.vehicleHash &&
        hash_(code) === s.vehicleHash
      )
        u = {
          id: "VEH-" + Utilities.getUuid(),
          role: "vehicles",
          name: String(r.data.operator || "").trim(),
        };
      else {
        const a = s.access.find((x) => (x.hash === hash_(code) || x.hash === hash_(code.toUpperCase())) && x.active);
        const p =
          a && s.people.find((x) => x.id === a.personId && BG.active(x));
        if (p)
          u = {
            id: p.id,
            personId: p.id,
            role: p.role === "referent" ? "referent" : "benevole",
            name: BG.label(p),
          };
      }
            if (!u || !u.name) {
        cache.put(key, String(tries + 1), 600);
        cache.put(globalKey, String(total + 1), 600);
        throw Error("Code invalide ou nom opérateur manquant");
      }
      cache.remove(key);
      cache.remove(globalKey);

      const token = Utilities.getUuid() + Utilities.getUuid();
      s.sessions.push({
        ...u,
        idSession: Utilities.getUuid(),
        tokenHash: hash_(token),
        created: now_(),
        lastSync: now_(),
        expires: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      save_(s);
      return { user: u, token, build: BUILD };
    }
    const u = user_(s, r.token),
      d = r.data || {};
    if (r.action === "vehicleIdentity") return vehicleIdentity_(s,u);
    if (r.action === "sync") {
      save_(s);
      const view = view_(s, u),
        since =
          d.role === u.role && Number(d.since) <= s.version
            ? Number(d.since) || 0
            : 0;
      view.ids = {};
      view.full = since === 0 || d.role !== u.role || Number(d.since) > s.version;
      for (const k of COLLECTIONS) {
        view.ids[k] = view[k].map((x) => k === "access" ? x.personId : x.id);
        view[k] = view[k].filter((x) => k === "access" || (x.version || 0) > since);
      }
      return {
        ...view,
        responseStats: u.role === "admin" ? statistiquesReponsesSheet_(s) : undefined,
        version: s.version,
        reset: since > s.version,
        build: BUILD,
      };
    }
    if (r.action === "documents") {
      role_(u, ["admin", "referent", "benevole"]);
      return docs_(s, u, d);
    }
    if (r.action === "planningPdf") {
      role_(u, ["admin", "referent", "benevole"]);
      return downloadPlanning_(s, u, d);
    }
    if (r.action === "previewEmail") {
      role_(u, ["admin"]);
      return emailPreview_(s, d.personId, d.message);
    }
    if (r.action === "sessions") {
      role_(u, ["admin"]);
      return s.sessions
        .filter((x) => !x.revoked)
        .map((x) => ({
          id: x.idSession,
          name: x.name,
          personId: x.personId,
          role: x.role,
          lastSync: x.lastSync,
          created: x.created,
        }));
    }
    const id = String(r.opId || "");
    if (!id) throw Error("Identifiant opération requis");
    const done = s.ops.find((x) => x.id === id);
    if (done) {
      if (done.author !== u.id) throw Error("Identifiant déjà utilisé");
      return done.result;
    }
    let result = mutate_(s, u, r.action, d, id);
    const storedResult = BG.clone(result);
    delete storedResult.code;
    if (result.code) storedResult.codeAlreadyShown = true;
    if (result.code) result.codeAlreadyShown = false;
    s.ops.push({ id, author: u.id, result: storedResult, at: now_() });
    audit_(s, u, r.action, { opId: id });
    save_(s);
    return result;
  } finally {
    lock.releaseLock();
  }
}
function touch_(s, row) {
  row.createdAt = row.createdAt || now_();
  row.version = s.version + 1;
  row.updatedAt = now_();
  return row;
}
function upsert_(s, k, row) {
  touch_(s, row);
  const i = s[k].findIndex((x) => x.id === row.id);
  if (i < 0) s[k].push(row);
  else s[k][i] = row;
  return row;
}
function targeting_(s, m, u) {
  if (u.role === "admin" || u.role === "referent") return true;
  const t = m.targets || {};
  if (t.all) return true;
  if ((t.people || []).includes(u.id)) return true;
  const pp = published_(s).assignments || [];
  if (
    pp.some((a) => a.personId === u.id && (t.shifts || []).includes(a.shiftId))
  )
    return true;
  const roles = (published_(s).rotations || [])
    .filter((r) => r.personId === u.id)
    .map((r) => r.role);
  return roles.some((x) => (t.roles || []).includes(x));
}
function published_(s) {
  return (
    s.publications.filter((x) => !x.deleted).at(-1)?.snapshot || {
      assignments: [],
      rotations: [],
    }
  );
}
function view_(s, u) {
  const out = {
      config: { ...s.config },
      user: { id: u.id, role: u.role, name: u.name },
    },
    pub = published_(s);
  COLLECTIONS.forEach((k) => (out[k] = []));
    if (u.role === "admin") {
    COLLECTIONS.forEach((k) => (out[k] = s[k]));
    /* Les hash d'accès ne sortent jamais du serveur : le client n'a besoin
       que de savoir si un code existe et s'il est actif. */
    out.access = s.access.map((a) => ({
      personId: a.personId,
      active: a.active,
      hasCode: !!a.hash,
      id: a.personId,
      version: a.version || s.version,
    }));
    return out;
  }

  delete out.config.emailMessage;
  delete out.config.checksAccepted;
    if (u.role === "vehicles") {
    ["vehicles", "receptions", "amendments"].forEach((k) => (out[k] = s[k]));
    out.access = s.access.map((a) => ({
      personId: a.personId,
      active: a.active,
      hasCode: !!a.hash,
      id: a.personId,
      version: a.version || s.version,
    }));
    return out;
  }

  out.people = s.people.map((p) =>
    u.role === "referent"
      ? p
      : {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          photo: p.photo,
          phone: p.phone,
          email: p.email,
          role: p.role,
          vehicleControl: p.id === u.id ? p.vehicleControl === true : undefined,
          wednesday: p.id === u.id ? p.wednesday : undefined,
          version: p.version,
          deleted: p.deleted,
        },
  );
  out.shifts = s.shifts;
  out.missions = s.missions;
  out.concerts = s.concerts;
  out.forms = s.forms.filter(
    (f) => u.role === "referent" || f.personId === u.id,
  );
  out.assignments = pub.assignments.map((a) =>
    u.role === "referent"
      ? a
      : {
          id: a.id,
          personId: a.personId,
          shiftId: a.shiftId,
          missionId: a.missionId,
          rank: a.personId === u.id ? a.rank : undefined,
          publicReason: a.personId === u.id ? a.publicReason : undefined,
          version: a.version,
          deleted: a.deleted,
        },
  );
  out.rotations = pub.rotations.filter(
    (r) => u.role === "referent" || r.personId === u.id,
  );
  out.arbitrations = s.arbitrations
    .filter((a) => u.role === "referent" || a.personId === u.id)
    .map((a) =>
      u.role === "referent" ? a : { ...a, internalReason: undefined },
    );
      out.access = s.access.map((a) => ({
    personId: a.personId,
    active: a.active,
    hasCode: !!a.hash,
    id: a.personId,
    version: a.version || s.version,
  }));

  out.vehicles = s.vehicles.map((v) => ({
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
    active: v.active,
    version: v.version,
    deleted: v.deleted,
  }));
  out.terrain = s.terrain.filter(
    (t) => u.role === "referent" || t.personId === u.id,
  );
  out.publications = s.publications.filter(p=>!p.deleted && (p.mode === "draft" || !Array.isArray(p.affectedIds) || p.affectedIds.includes(String(u.id)))).map(p=>({id:p.id,number:p.number,mode:p.mode||"final",changeType:p.changeType||"initial",at:p.at,affectedIds:undefined,version:p.version}));
  out.messages = s.messages.filter((m) => BG.active(m) && (!m.from || Date.parse(m.from) <= Date.now()) && (!m.to || Date.parse(m.to) >= Date.now()) && targeting_(s, m, u));
  out.reads = s.reads.filter(
    (r) => u.role === "referent" || r.personId === u.id,
  );
  out.incidents = s.incidents.filter(
    (i) => u.role === "referent" || i.personId === u.id,
  );
  if (u.role === "referent") { out.vehicles = s.vehicles; out.receptions = s.receptions; out.amendments = s.amendments; }
  return out;
}
function requireEditable_(s, k) {
  if (
    s.config.validated &&
    [
      "people",
      "shifts",
      "missions",
      "concerts",
      "assignments",
      "rotations",
      "arbitrations",
    ].includes(k)
  )
    throw Error("Planning validé : réouverture motivée requise");
}
const EDIT = {
  people: ["admin", "referent"],
  shifts: ["admin"],

  missions: ["admin"],
  concerts: ["admin"],

  assignments: ["admin"],
  rotations: ["admin"],
  arbitrations: ["admin", "referent"],
  terrain: ["admin", "referent"],
  vehicles: ["admin", "referent"],
  messages: ["admin", "referent"],
};

/* ------------------------------------------------------------------
 * CALENDRIER DU FESTIVAL
 *
 * Une journée de festival va du matin au petit matin. Un créneau qui
 * commence à 01:00 le samedi appartient à la soirée du VENDREDI : c'est
 * le jour choisi qui fait foi, jamais l'horloge.
 *
 * L'ordre de la semaine est mardi -> lundi, l'ordre réel du festival.
 * ------------------------------------------------------------------ */

const JOURS = ["mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "lundi"];

function jourIndex_(v) {
  const k = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const i = JOURS.indexOf(k);
  return i < 0 ? 99 : i;
}

/* ------------------------------------------------------------------
 * CALENDRIER DE L'ÉDITION
 *
 * Les jours se construisent depuis les bornes de CONFIG_EDITION :
 *   date_debut  2027-06-29  (un mardi)
 *   date_fin    2027-07-04  (un dimanche)
 *
 * Aucune date n'est codée en dur : la saison suivante n'a qu'à changer
 * ses deux bornes dans la feuille. Le calendrier couvre date_debut ->
 * date_fin PLUS le lundi qui suit, pour que la journée du dimanche soir
 * — celle qui se termine au petit matin — ait son lendemain.
 * ------------------------------------------------------------------ */
function calendrierEdition_(s) {
  if (s.config && s.config.jours) return s.config.jours;

  const debut = String((s.config && (s.config.dateDebut || s.config.date_debut)) || "").slice(0, 10);
  const fin = String((s.config && (s.config.dateFin || s.config.date_fin)) || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) return null;

  const noms = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const table = {};

  const d = new Date(debut + "T12:00:00");
  const borne = new Date(fin + "T12:00:00");
  if (d.getDay() === 3) d.setDate(d.getDate() - 1);
  /* Un jour de plus : le lundi qui suit la fin du festival. */
  borne.setDate(borne.getDate() + 1);

  while (d <= borne) {
    table[Utilities.formatDate(d, "Europe/Paris", "yyyy-MM-dd")] = noms[d.getDay()];
    d.setDate(d.getDate() + 1);
  }

  s.config.jours = table;
  return table;
}


/* Jour d'une date, d'après le calendrier de l'édition.
 * `s.config.jours` est la table remplie à la création de la saison :
 *   { "2027-06-29": "mardi", "2027-06-30": "mercredi", ... }
 * Si elle manque, on retombe sur le vrai jour de la semaine — ce qui
 * marche déjà pour les dates 2027 actuelles. */
function jourDeDate_(s, valeur) {
  const iso = String(valeur || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";

    const table = calendrierEdition_(s);
  if (table) return table[iso] && jourIndex_(table[iso]) !== 99 ? String(table[iso]).toLowerCase() : "";

  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  return ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][d.getDay()];
}
function dateDuJourEdition_(s, jour) {
  const voulu = String(jour || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!voulu) return "";

  const table = calendrierEdition_(s);
  if (!table) return "";

  for (const iso in table) {
    if (!Object.prototype.hasOwnProperty.call(table, iso)) continue;

    if (
      String(table[iso] || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim() === voulu
    ) {
      return iso;
    }
  }

  return "";
}
/* L'ordre d'un créneau : sa journée d'abord (mardi = 1), puis son
 * rang selon l'heure de début dans cette journée.
 *   2027-06-29 (mardi), 09:00  -> 1 * 100 + 1 = 101
 *   2027-06-30 (mercredi), 15:30 -> 2 * 100 + 1 = 201  */
function ordreCreneau_(s, date, start) {
  const iso = String(date || "").slice(0, 10);
  const rang = jourIndex_(jourDeDate_(s, iso));
  if (rang === 99) return 0;

  let avant = 0;
  for (const x of s.shifts || []) {
    if (x.deleted) continue;
    if (String(x.date || "").slice(0, 10) !== iso) continue;
    if (minutesConcert_(x.start) < minutesConcert_(start)) avant++;
  }
  return rang * 100 + avant + 1;
}

/* C3 : le DERNIER créneau de chaque journée.
 * Ce n'est pas « passe minuit » — Je2 finit à 00:00 sans être C3.
 * Un seul C3 par jour, celui qui commence le plus tard. */
function estDernierCreneau_(s, id, date, start) {
  const iso = String(date || "").slice(0, 10);
  let maxDebut = "";
  for (const x of s.shifts || []) {
    if (x.deleted) continue;
    if (String(x.id || "") === String(id || "")) continue;
    if (String(x.date || "").slice(0, 10) !== iso) continue;
    const deb = String(x.start || "");
    if (!maxDebut || minutesConcert_(deb) > minutesConcert_(maxDebut)) maxDebut = deb;
  }
  return !maxDebut || minutesConcert_(start) >= minutesConcert_(maxDebut);
}

/* Renumérote une journée entière : ordre et C3 de tous ses créneaux.
 * Appelée après une suppression, sinon le créneau qui suit le dernier
 * supprimé reste sans C3. */
function renumJournee_(s, date) {
  const iso = String(date || "").slice(0, 10);
  const rang = jourIndex_(jourDeDate_(s, iso));
  if (rang === 99) return;

  const duJour = (s.shifts || [])
    .filter((x) => !x.deleted && String(x.date || "").slice(0, 10) === iso)
    .sort((a, b) => minutesConcert_(a.start) - minutesConcert_(b.start) || String(a.id).localeCompare(String(b.id)));

  duJour.forEach((x, n) => {
    const order = rang * 100 + n + 1;
    const runner = duJour.filter((r) => !r.brunch && r.active !== false);
    const c3 = runner.length > 1 && runner.at(-1).id === x.id;
    if (x.order !== order || x.c3 !== c3) {
      x.order = order; x.c3 = c3; touch_(s, x);
    }
  });
}

/* ------------------------------------------------------------------
 * CONCERTS : mercredi -> dimanche, enchaînés dans la soirée.
 * ------------------------------------------------------------------ */
const JOURS_CONCERT = ["mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/* Rang d'un concert : jour puis heure de début.
 *   2027-06-30 (mercredi), 18:45 -> 0 * 100 + 1 = 1
 *   2027-07-01 (jeudi),    17:00 -> 1 * 100 + 1 = 101 */
/*
 * Convertit une heure réelle en heure de "journée festival".
 *
 * La journée ne s'arrête pas à minuit :
 * 18:45 -> 18:45
 * 23:00 -> 23:00
 * 00:30 -> 24:30
 * 01:00 -> 25:00
 * 05:59 -> 29:59
 *
 * À partir de 06:00, on considère qu'une nouvelle journée commence.
 */
function minutesConcert_(heure) {
  const m = String(heure || "").match(/^(\d{2}):(\d{2})$/);

  if (!m) return 99999;

  let h = Number(m[1]);
  const min = Number(m[2]);

  if (h < 6) {
    h += 24;
  }

  return h * 60 + min;
}


/*
 * Calcule l'ordre d'un concert dans sa journée festival.
 */
function ordreConcert_(s, id, date, start) {
  const iso = String(date || "").slice(0, 10);

  const rangJour = JOURS_CONCERT.indexOf(
    String(jourDeDate_(s, iso) || "").toLowerCase()
  );

  if (rangJour < 0) return 0;

  const heureCible = minutesConcert_(start);

  let avant = 0;

  for (const x of s.concerts || []) {
    if (x.deleted) continue;

    if (String(x.id || "") === String(id || "")) {
      continue;
    }

    if (String(x.date || "").slice(0, 10) !== iso) {
      continue;
    }

    if (minutesConcert_(x.start) < heureCible) {
      avant++;
    }
  }

  return rangJour * 100 + avant + 1;
}


/*
 * Renumérote toute la programmation.
 *
 * L'ordre est :
 * mercredi -> dimanche
 *
 * et, dans chaque journée :
 * après-midi -> soirée -> nuit -> petit matin.
 *
 * Exemple :
 * 18:45
 * 20:45
 * 23:00
 * 01:00
 *
 * et non :
 * 01:00
 * 18:45
 * 20:45
 * 23:00
 */
function renumConcerts_(s) {
  const parJour = {};

  (s.concerts || []).forEach(function (c) {
    if (c.deleted) return;

    const iso = String(c.date || "").slice(0, 10);

    if (!parJour[iso]) {
      parJour[iso] = [];
    }

    parJour[iso].push(c);
  });

  Object.keys(parJour).forEach(function (iso) {
    const rangJour = JOURS_CONCERT.indexOf(
      String(jourDeDate_(s, iso) || "").toLowerCase()
    );

    if (rangJour < 0) return;

    parJour[iso]
      .sort(function (a, b) {
        const diff =
          minutesConcert_(a.start) -
          minutesConcert_(b.start);

        /*
         * Si deux concerts commencent exactement à la même heure,
         * on conserve un ordre stable grâce à l'ordre existant,
         * puis à l'identifiant.
         */
        if (diff !== 0) {
          return diff;
        }

        const ordreA = Number(a.order) || 0;
        const ordreB = Number(b.order) || 0;

        if (ordreA !== ordreB) {
          return ordreA - ordreB;
        }

        return String(a.id || "").localeCompare(
          String(b.id || "")
        );
      })
      .forEach(function (c, n) {
        const nouvelOrdre =
          rangJour * 100 + n + 1;

        /*
         * On ne touche la ligne que si l'ordre a réellement changé.
         * Cela évite d'augmenter inutilement sa version à chaque sync.
         */
        if (Number(c.order) !== nouvelOrdre) {
          c.order = nouvelOrdre;
          touch_(s, c);
        }
      });
  });
}

function lireCreneauxSheet_() {
  const sh = ss_().getSheetByName("CRENEAUX");
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function (x) {
    return String(x || "").trim().toLowerCase();
  });

  function col(nom) {
    return headers.indexOf(nom);
  }

  const iId = col("creneau_id");
  const iLibelle = col("libelle");
  const iJour = col("jour");
  const iDate = col("date");
  const iDebut = col("debut");
  const iFin = col("fin");
  const iEffectif = col("effectif_cible");
  const iVehicules = col("vehicules");
  const iC3 = col("c3");
  const iBrunch = col("brunch");
  const iOrdre = col("ordre");
  const iActif = col("actif");

  if (iId < 0) {
    throw Error("CRENEAUX : colonne creneau_id introuvable");
  }

  function valeurDate(v) {
    if (!v) return "";

    if (v instanceof Date) {
      return Utilities.formatDate(
        v,
        "Europe/Paris",
        "yyyy-MM-dd"
      );
    }

    return String(v).trim().slice(0, 10);
  }

  function valeurHeure(v) {
    if (!v) return "";

    if (v instanceof Date) {
      return Utilities.formatDate(
        v,
        "Europe/Paris",
        "HH:mm"
      );
    }

    return String(v).trim().slice(0, 5);
  }

  const result = [];

  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][iId] || "").trim();
    if (!id) continue;

    result.push({
      id: id,

      name:
        iLibelle >= 0
          ? String(values[i][iLibelle] || "").trim()
          : "",

      day:
        iJour >= 0
          ? String(values[i][iJour] || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim()
          : "",

      date:
        iDate >= 0
          ? valeurDate(values[i][iDate])
          : "",

      start:
        iDebut >= 0
          ? valeurHeure(values[i][iDebut])
          : "",

      end:
        iFin >= 0
          ? valeurHeure(values[i][iFin])
          : "",

      target:
        iEffectif >= 0
          ? Number(values[i][iEffectif]) || 0
          : 0,

      vehicles:
        iVehicules >= 0
          ? Number(values[i][iVehicules]) || 0
          : 0,

      c3:
        iC3 >= 0
          ? BG.yes(values[i][iC3])
          : false,

      brunch:
        iBrunch >= 0
          ? BG.yes(values[i][iBrunch])
          : false,

      order:
        iOrdre >= 0
          ? Number(values[i][iOrdre]) || 0
          : 0,

      active:
        iActif >= 0
          ? BG.yes(values[i][iActif])
          : true
    });
  }

  return result;
}


function ecrireCreneauxSheet_(s) {
  const sh = ss_().getSheetByName("CRENEAUX");

  if (!sh) {
    throw Error("Onglet CRENEAUX introuvable");
  }

  const headers = [
    "creneau_id",
    "libelle",
    "jour",
    "date",
    "debut",
    "fin",
    "effectif_cible",
    "vehicules",
    "c3",
    "brunch",
    "ordre",
    "actif"
  ];

  const shifts = (s.shifts || [])
    .filter(function (x) {
      return !x.deleted;
    })
    .slice()
    .sort(function (a, b) {
      const da = String(a.date || "");
      const db = String(b.date || "");

      if (da !== db) {
        return da.localeCompare(db);
      }

      return minutesConcert_(a.start) - minutesConcert_(b.start);
    });

  const rows = shifts.map(function (x) {
    return [
      x.id || "",
      x.name || "",
      x.day || "",
      x.date || "",
      x.start || "",
      x.end || "",
      Number(x.target) || 0,
      Number(x.vehicles) || 0,
      x.c3 ? "oui" : "non",
      x.brunch ? "oui" : "non",
      Number(x.order) || 0,
      x.active === false ? "non" : "oui"
    ];
  });

  sh.clearContents();

  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length)
      .setValues(rows);
  }

  s.sheetSync = s.sheetSync || {};
  s.sheetSync.shifts = s.sheetSync.shifts || {};

  (s.shifts || []).forEach(function (x) {
    if (x && x.id && !x.deleted) {
      s.sheetSync.shifts[String(x.id)] = true;
    }
  });
}


function synchroniserCreneauxDepuisSheet_(s) {
  const sheetShifts = lireCreneauxSheet_();

  s.shifts = s.shifts || [];
  s.sheetSync = s.sheetSync || {};
  s.sheetSync.shifts = s.sheetSync.shifts || {};

  const sync = s.sheetSync.shifts;

  const jsonParId = {};
  const sheetParId = {};

  s.shifts.forEach(function (x) {
    if (x && x.id) {
      jsonParId[String(x.id)] = x;
    }
  });

  sheetShifts.forEach(function (x) {
    if (x && x.id) {
      sheetParId[String(x.id)] = x;
    }
  });

  /*
   * AJOUTS ET MODIFICATIONS DU SHEET
   */
  sheetShifts.forEach(function (x) {
    const id = String(x.id);
    const existant = jsonParId[id];

    if (existant) {
      const changed = Object.keys(x).some((key) => !["order", "c3"].includes(key) && JSON.stringify(existant[key]) !== JSON.stringify(x[key]));
      const derived = { order: existant.order, c3: existant.c3 };
      Object.assign(existant, x, derived);
      if (changed) { touch_(s, existant); invalidatePlanning_(s); }
    } else {
      touch_(s, x); s.shifts.push(x); jsonParId[id] = x;
      invalidatePlanning_(s);
    }

    sync[id] = true;
  });

  /*
   * SUPPRESSIONS MANUELLES DU SHEET
   *
   * On ne supprime du JSON que les créneaux dont on sait
   * qu'ils existaient déjà dans CRENEAUX.
   */
  const idsSupprimes = [];

  Object.keys(sync).forEach(function (id) {
    if (
      sync[id] &&
      jsonParId[id] &&
      !sheetParId[id]
    ) {
      idsSupprimes.push(id);
    }
  });

  if (idsSupprimes.length) {
    invalidatePlanning_(s);
    s.shifts = s.shifts.filter(function (x) {
      return !idsSupprimes.includes(String(x.id));
    });

    idsSupprimes.forEach(function (id) {
      delete sync[id];
    });
  }

  /*
   * NETTOYAGE
   */
  Object.keys(sync).forEach(function (id) {
    const existeJson = s.shifts.some(function (x) {
      return String(x.id) === id;
    });

    const existeSheet = !!sheetParId[id];

    if (!existeJson && !existeSheet) {
      delete sync[id];
    }
  });

  /*
   * Le serveur reste maître du jour, de l'ordre et du C3.
   */
  (s.shifts || []).forEach(function (x) {
    if (x.deleted) return;

    x.day = jourDeDate_(s, x.date);

    if (!x.day) {
      throw Error(
        "CRENEAUX : date hors calendrier pour " + x.id
      );
    }
  });

  const dates = [
    ...new Set(
      (s.shifts || [])
        .filter(function (x) {
          return !x.deleted;
        })
        .map(function (x) {
          return String(x.date || "").slice(0, 10);
        })
        .filter(Boolean)
    )
  ];

  dates.forEach(function (date) {
    renumJournee_(s, date);
  });

  return s;
}

function lireConcertsSheet_() {
  const sh = ss_().getSheetByName("CONCERTS");
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function (x) {
    return String(x || "").trim().toLowerCase();
  });

  function col(nom) {
    return headers.indexOf(nom);
  }

  const iId = col("concert_id");
  const iArtiste = col("artiste");
  const iJour = col("jour");
  const iDate = col("date");
  const iDebut = col("debut");
  const iFin = col("fin");
  const iScene = col("scene");
  const iOrdre = col("ordre");
  const iActif = col("actif");
  const iPhoto = col("photo");

  if (iId < 0) {
    throw Error("CONCERTS : colonne concert_id introuvable");
  }

  function valeurDate(v) {
    if (!v) return "";

    if (v instanceof Date) {
      return Utilities.formatDate(
        v,
        "Europe/Paris",
        "yyyy-MM-dd"
      );
    }

    return String(v).trim().slice(0, 10);
  }

  function valeurHeure(v) {
    if (!v) return "";

    if (v instanceof Date) {
      return Utilities.formatDate(
        v,
        "Europe/Paris",
        "HH:mm"
      );
    }

    return String(v).trim().slice(0, 5);
  }

  const result = [];

  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][iId] || "").trim();
    if (!id) continue;

    result.push({
      id: id,
      artist: iArtiste >= 0
        ? String(values[i][iArtiste] || "").trim()
        : "",

      day: iJour >= 0
        ? String(values[i][iJour] || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim()
        : "",

      date: iDate >= 0
        ? valeurDate(values[i][iDate])
        : "",

      start: iDebut >= 0
        ? valeurHeure(values[i][iDebut])
        : "",

      end: iFin >= 0
        ? valeurHeure(values[i][iFin])
        : "",

      scene: iScene >= 0
        ? String(values[i][iScene] || "").trim()
        : "",

      order: iOrdre >= 0
        ? Number(values[i][iOrdre]) || 0
        : 0,

      active: iActif >= 0
        ? BG.yes(values[i][iActif])
        : true,

      photo: iPhoto >= 0
        ? String(values[i][iPhoto] || "").trim()
        : ""
    });
  }

  return result;
}


function ecrireConcertsSheet_(s) {
  const sh = ss_().getSheetByName("CONCERTS");
  if (!sh) {
    throw Error("Onglet CONCERTS introuvable");
  }

  const headers = [
    "concert_id",
    "artiste",
    "jour",
    "date",
    "debut",
    "fin",
    "scene",
    "ordre",
    "actif",
    "photo"
  ];

  const concerts = (s.concerts || []).slice().sort(function (a, b) {
  const ja = jourIndex_(a.day);
  const jb = jourIndex_(b.day);

  if (ja !== jb) return ja - jb;

  const diff =
    minutesConcert_(a.start) -
    minutesConcert_(b.start);

  if (diff !== 0) return diff;

  return Number(a.order || 0) - Number(b.order || 0);
});

  const rows = concerts.map(function (c) {
    return [
      c.id || "",
      c.artist || "",
      c.day || "",
      c.date || "",
      c.start || "",
      c.end || "",
      c.scene || c.stage || "",
      Number(c.order) || 0,
      c.active === false ? "non" : "oui",
      c.photo || ""
    ];
  });

  sh.clearContents();

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length)
      .setValues(rows);
  }
  s.sheetSync = s.sheetSync || {};
s.sheetSync.concerts = s.sheetSync.concerts || {};

(s.concerts || []).forEach(function (c) {
  if (c && c.id) {
    s.sheetSync.concerts[String(c.id)] = true;
  }
});
}

function synchroniserConcertsDepuisSheet_(s) {
  const sheetConcerts = lireConcertsSheet_();

  s.concerts = s.concerts || [];
  s.sheetSync = s.sheetSync || {};
  s.sheetSync.concerts = s.sheetSync.concerts || {};

  const sync = s.sheetSync.concerts;

  const jsonParId = {};
  const sheetParId = {};

  s.concerts.forEach(function (c) {
    if (c && c.id) {
      jsonParId[String(c.id)] = c;
    }
  });

  sheetConcerts.forEach(function (c) {
    if (c && c.id) {
      sheetParId[String(c.id)] = c;
    }
  });

  /*
   * 1. AJOUTS ET MODIFICATIONS DU SHEET
   *
   * Tout concert présent dans CONCERTS est injecté dans l'état.
   */
  sheetConcerts.forEach(function (c) {
    const id = String(c.id);
    const existant = jsonParId[id];

    if (existant) {
      const changed = Object.keys(c).some((key) => key !== "order" && JSON.stringify(existant[key]) !== JSON.stringify(c[key]));
      Object.assign(existant, c);
      if (changed) { touch_(s, existant); invalidatePlanning_(s); }
    } else {
      touch_(s, c); s.concerts.push(c); jsonParId[id] = c;
      invalidatePlanning_(s);
    }

    sync[id] = true;
  });

  /*
   * 2. SUPPRESSIONS MANUELLES DU SHEET
   *
   * Un concert est considéré comme supprimé du Sheet uniquement si :
   *
   * - il existe encore dans le JSON ;
   * - il n'existe plus dans CONCERTS ;
   * - ET il avait déjà été vu dans CONCERTS lors d'une synchro précédente.
   *
   * Cela évite de supprimer accidentellement un nouveau concert créé
   * dans l'application avant son écriture dans le Sheet.
   */
  const idsSupprimes = [];

  Object.keys(sync).forEach(function (id) {
    if (sync[id] && jsonParId[id] && !sheetParId[id]) {
      idsSupprimes.push(id);
    }
  });

  if (idsSupprimes.length) {
    invalidatePlanning_(s);
    s.concerts = s.concerts.filter(function (c) {
      return !idsSupprimes.includes(String(c.id));
    });

    idsSupprimes.forEach(function (id) {
      delete sync[id];
    });
  }

  /*
   * 3. NETTOYAGE DE LA MÉMOIRE DE SYNCHRONISATION
   */
  Object.keys(sync).forEach(function (id) {
    const existeJson = s.concerts.some(function (c) {
      return String(c.id) === id;
    });

    const existeSheet = !!sheetParId[id];

    if (!existeJson && !existeSheet) {
      delete sync[id];
    }
  });

  /*
   * 4. Recalcul de l'ordre après les éventuelles modifications.
   */
  renumConcerts_(s);

  return s;
}

function mutate_(s, u, action, d, op) {
  if (action === "planningChecks") { role_(u, ["admin"]); return {checks:controlesPlanningV2_({...s, assignments:s.assignments.filter(BG.active), rotations:s.rotations.filter(BG.active)})}; }
  if (action === "sendForms") {
    role_(u, ["admin"]);
    checkFormOpening_(s, s.config);
    if (!s.config.formOpen) throw Error("Ouvre et enregistre le formulaire avant envoi");
    const ids = [...new Set(d.people || [])];
    if (!ids.length || ids.some(id => !s.people.some(p => p.id === id && BG.active(p)))) throw Error("Destinataires invalides");
    const count = notifyOpen_(s, "form", ids);
    installReminder_();
    return { count };
  }
  if (action === "resetEdition") {
    role_(u, ["admin"]);
    if (d.confirm !== "REMISE A ZERO") throw Error("Confirmation manquante");
    // Les générations précédentes restent archivées par save_ ; aucun fichier Drive n’est supprimé.
    const keep = new Set(["people", "shifts"]);
    COLLECTIONS.forEach(k => { if (!keep.has(k)) s[k] = []; });
    s.people = s.people.filter(p => !p.deleted).map(p => touch_(s, {...p, status:"Actif", wednesday:false}));
    s.shifts = s.shifts.filter(x => !x.deleted).map(x => touch_(s, {...x, checked:false}));
    s.sessions = s.sessions.filter(x => x.tokenHash === u.tokenHash);
    s.vehicleHash = ""; s.uploads = [];
    s.config = {...s.config, epoch:Utilities.getUuid(), phase:"Préparation", formOpen:false, appOpen:false,
      vehicleAccess:false, validated:false, closeAt:"", teamChecked:false, shiftsChecked:false,
      concertsChecked:false, checksAccepted:[], vehiclesPlanned:0};
    mettreAJourConfigEdition_({phase:"Préparation", formulaire_ouvert:"Non", app_ouverte:"Non", date_cloture:"", vehicules_prevus:0});
    ecrireConcertsSheet_(s); ecrireCreneauxSheet_(s);
    return {reset:true};
  }
  if (action === "mediaInit") return mediaInit_(s, u, d);
  if (action === "mediaChunk") return mediaChunk_(s, u, d);
  if (action === "logout") {
    s.sessions = s.sessions.filter((x) => x.tokenHash !== u.tokenHash);
    return { ok: true };
  }
    if (action === "remove") {
  const k = d.collection;

  role_(u, EDIT[k] || []);
  requireEditable_(s, k);
  if (k === "people" && u.role !== "admin") throw Error("Suppression réservée à l’Admin");

  if (!s[k] || !Array.isArray(s[k])) {
    throw Error("Collection inconnue : " + k);
  }

  const id = String((d.row && d.row.id) || d.id || "").trim();

  if (!id) {
    throw Error("Identifiant manquant");
  }

  const i = s[k].findIndex(function (x) {
    return String(x.id) === id;
  });

  if (i < 0) {
    throw Error("Élément introuvable : " + id);
  }

  const elementSupprime = s[k][i];

  const dateSupprimee =
    k === "shifts"
      ? String(elementSupprime.date || "").slice(0, 10)
      : "";

  /*
   * IMPORTANT :
   * une suppression se fait exclusivement par ID.
   * On ne valide ni la date, ni le jour, ni les horaires.
   */
  s[k].splice(i, 1);
  invalidatePlanning_(s);

  if (k === "shifts" && dateSupprimee) {
  renumJournee_(s, dateSupprimee);
  ecrireCreneauxSheet_(s);
}

  if (k === "concerts") {
    renumConcerts_(s);

    /*
     * Le JSON vient d'être modifié :
     * on répercute immédiatement l'état dans CONCERTS.
     */
    ecrireConcertsSheet_(s);
  }

  return {
    ok: true,
    id: id,
    collection: k,
    recalcul: dateSupprimee || null
  };
}
  if (action === "save") {
    const k = d.collection;
    role_(u, EDIT[k] || []);
    requireEditable_(s, k);
    const old = s[k].find((x) => x.id === d.row.id);
    if (k === "people" && u.role !== "admin") {
      if (!old) throw Error("Création réservée à l’Admin");
      const allowed = new Set(["status", "gearbox", "forbidC3", "driverOnly", "noLoader", "priorityLoader", "firstYear", "wednesday", "internalNote"]);
      for (const key of Object.keys(d.row)) {
        if (key === "vehicleControl" && !!d.row[key] === !!old[key]) continue;
        if (!allowed.has(key) && JSON.stringify(d.row[key]) !== JSON.stringify(old[key]))
          throw Error("Champ réservé à l’Admin : " + key);
      }
    }
    if (old && Number(d.baseVersion) !== old.version) {
      const base = d.baseRow;
      const ignored = new Set([
        "id",
        "version",
        "updatedAt",
        "createdAt",
        "author",
        "pending",
      ]);
      const changed = base
        ? Object.keys(d.row).filter(
            (key) =>
              !ignored.has(key) &&
              JSON.stringify(d.row[key]) !== JSON.stringify(base[key]),
          )
        : [];
      const compatible =
        base &&
        base.id === old.id &&
        base.version === Number(d.baseVersion) &&
        changed.every(
          (key) =>
            JSON.stringify(old[key]) === JSON.stringify(base[key]) ||
            JSON.stringify(old[key]) === JSON.stringify(d.row[key]),
        );
      if (compatible) {
        d.row = {
          ...old,
          ...Object.fromEntries(changed.map((key) => [key, d.row[key]])),
        };
      } else {
        const c = upsert_(s, "conflicts", {
          id: op,
          collection: k,
          entityId: old.id,
          current: old,
          proposed: d.row,
          author: u.id,
          clientAt: d.clientAt,
          status: "À arbitrer",
        });
        return { conflict: c.id };
      }
    }
    const row = {
  ...old,
  ...d.row,
  id: old?.id || d.row.id || op,
  author: u.id,
  createdAt: old?.createdAt || now_(),
};

/* Pour les concerts, le jour choisi par l'utilisateur est la source
 * de vérité. La date réelle est déterminée par le calendrier de
 * l'édition côté serveur.
 *
 * On le fait AVANT validateRow_(), puisque celle-ci exige une date ISO.
 */
if (k === "concerts" || k === "shifts") {
  row.day = String(row.day || row.jour || jourDeDate_(s, row.date) || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!(k === "concerts" ? JOURS_CONCERT : JOURS).includes(row.day))
    throw Error("Jour invalide");

  row.date = dateDuJourEdition_(s, row.day);

  if (!row.date)
    throw Error("Impossible de déterminer la date du " + row.day);
}

validateRow_(s, k, row);
    if (k === "concerts") { row.scene = String(row.scene || row.stage || ""); delete row.stage; }
    if (k === "people") {
      if (u.role !== "admin" && String(row.mandatoryGroupId || "") !== String(old?.mandatoryGroupId || ""))
        throw Error("Seul l’Admin peut modifier un groupe indivisible");
      row.mandatoryGroupId = String(row.mandatoryGroupId || "").trim();
      if (row.mandatoryGroupId && !/^[a-zA-Z0-9_-]{1,48}$/.test(row.mandatoryGroupId))
        throw Error("Identifiant de groupe invalide (lettres, chiffres, tiret, souligné)");
      if (u.role !== "admin" && ((!old && row.role === "referent") || (old && row.role !== old.role))) throw Error("Seul l’Admin peut attribuer le rôle Référent");
      if (u.role !== "admin" && !!row.vehicleControl !== !!old?.vehicleControl) throw Error("Seul l’Admin peut autoriser le contrôle véhicule");
      row.vehicleControl = row.vehicleControl === true;
      row.driverOnly = !!(row.driverOnly || row.noLoader); row.noLoader = row.driverOnly;
      if (!row.firstName || !row.lastName)
        throw Error("Nom et prénom obligatoires");
      if (!["benevole", "referent"].includes(row.role))
        throw Error("Rôle invalide");
      if (row.deleted) s.sessions = s.sessions.filter((x) => x.personId !== row.id);
    }
            if (k === "shifts" || k === "missions" || k === "concerts") {
      if (
        !row.date ||
        !/^\d\d:\d\d$/.test(row.start) ||
        !/^\d\d:\d\d$/.test(row.end)
      )
        throw Error("Date et horaires obligatoires");
      if (
        k === "shifts" &&
        (!Number.isInteger(Number(row.target)) || Number(row.target) < 0)
      )
        throw Error("Effectif invalide");

      /* --- LE JOUR SE DÉDUIT DE LA DATE, POUR LES DEUX ---
       * Créneaux comme concerts : le jour n'est pas saisi.
       * Un concert qui finit à 00:15 le mercredi appartient bien
       * à la soirée du mercredi — la date est celle du jour choisi. */
      if (k === "shifts") {
  row.day = jourDeDate_(s, row.date);
  if (!row.day) throw Error("Date hors calendrier de l'édition");
}

if (k === "concerts") {
  const jourVerifie = jourDeDate_(s, row.date);

  if (!jourVerifie || jourVerifie !== row.day)
    throw Error("Incohérence entre le jour et la date du concert");
}

      /* --- Créneau : libellé, ordre et C3 en plus. ---
       * Ces trois-là ne concernent QUE les créneaux : l'ordre d'un
       * concert suit la programmation, pas son rang dans la journée. */
      if (k === "shifts") {
        const hhmm = (t) => String(t).replace(/^(\d\d):(\d\d)$/, "$1h$2");
        row.name =
          hhmm(row.start) + " - " + hhmm(row.end) +
          (row.id ? " (" + row.id + ")" : "");

        row.order = ordreCreneau_(s, row.date, row.start);
        row.c3 = estDernierCreneau_(s, row.id, row.date, row.start);
      }

      /* --- Concert : son ordre propre. ---
       * Les concerts vont du mercredi au dimanche et s'enchaînent
       * dans la soirée. L'ordre suit le jour puis l'heure de début,
       * comme la feuille CONCERTS (1, 2, 3...). */
            if (k === "concerts") {
        const rangJour = JOURS_CONCERT.indexOf(
          String(row.day || "").toLowerCase()
        );
        if (rangJour < 0)
          throw Error("Un concert se joue du mercredi au dimanche");
        row.order = ordreConcert_(s, row.id, row.date, row.start);
      }
    }

    if (k === "vehicles") {
      if (old && old.active !== row.active) {
        const shift = s.shifts.find(
          (x) =>
            x.date ===
              Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd") &&
            BG.interval(x)[0] <= parisHour_() * 60 &&
            BG.interval(x)[1] > parisHour_() * 60,
        );
        const p = s.people.find((x) => x.id === row.driverId);
        if (!p) throw Error("Conducteur à désigner");
        if (!row.active && p.driverOnly)
          throw Error(
            "Conducteur uniquement : arbitrer le remplacement avant passage Chargeur",
          );
        if (shift)
          upsert_(s, "terrain", {
            id: op + "-terrain",
            personId: p.id,
            shiftId: shift.id,
            role: row.active ? "Conducteur" : "Chargeur",
            status: "Modification",
            note: row.active
              ? "Véhicule remis en service"
              : "Véhicule hors service",
            acknowledged: false,
            author: u.id,
          });
      }
      if (!old) throw Error("Un véhicule réel est créé lors de sa réception");
      if (
        row.letter === "A" &&
        row.active &&
        parisHour_() >= 19 &&
        parisHour_() < 22
      )
        throw Error("Véhicule A indisponible entre 19 h et 22 h");
    }
    if (k === "terrain") {
      if (!["Conducteur", "Chargeur"].includes(row.role)) throw Error("Poste invalide");
      if (!published_(s).assignments.some(a => a.personId === row.personId && a.shiftId === row.shiftId && !a.deleted))
        throw Error("Bénévole non affecté à ce shift publié");
      if (
        !s.people.some((p) => p.id === row.personId) ||
        !s.shifts.some((x) => x.id === row.shiftId)
      )
        throw Error("Personne ou créneau inconnu");
      row.acknowledged = false;
      row.notificationId = op;
      if (
        row.role === "Chargeur" &&
        s.people.find((p) => p.id === row.personId)?.driverOnly
      )
        throw Error("Conducteur uniquement : passage Chargeur interdit");
    }
    if (k === "assignments") {
      if (s.assignments.some(a => a.id !== row.id && BG.active(a) && a.personId === row.personId && a.shiftId === row.shiftId))
        throw Error("Cette affectation existe déjà");
      const chosen = s.shifts.find(x => x.id === row.shiftId);
      if (chosen && s.assignments.some(a => a.id !== row.id && BG.active(a) && a.personId === row.personId && BG.overlap(chosen, s.shifts.find(x => x.id === a.shiftId) || {}) > 0))
        throw Error("Chevauchement avec une autre affectation");
    }
    if (k === "messages") {
      if (!row.title || !row.body) throw Error("Titre et message obligatoires");
      if (!row.targets) throw Error("Cible obligatoire");
    }
    if (
      [
        "people",
        "shifts",
        "missions",
        "concerts",
        "assignments",
        "rotations",
        "arbitrations",
      ].includes(k)
    ) {
      s.config.checksAccepted = [];
      s.simulations.forEach((x) => {
        x.stale = true;
        touch_(s, x);
      });
    }
const savedRow = upsert_(s, k, row);

/*
 * Maintenant seulement l'élément existe réellement dans l'état.
 * On peut donc recalculer correctement les ordres.
 */
if (k === "shifts") {
  const dateCible = String(savedRow.date || "").slice(0, 10);
  const dateOrigine = old
    ? String(old.date || "").slice(0, 10)
    : "";

  if (dateOrigine && dateOrigine !== dateCible) {
    renumJournee_(s, dateOrigine);
  }

  if (dateCible) {
    renumJournee_(s, dateCible);
  }

  ecrireCreneauxSheet_(s);
}

if (k === "concerts") {
  /*
   * Le concert vient d'être ajouté ou modifié dans l'état.
   * On recalcule l'ordre de toute la programmation puis
   * on répercute immédiatement l'état dans l'onglet CONCERTS.
   */
  renumConcerts_(s);
  ecrireConcertsSheet_(s);
}

return { row: savedRow };
  }
  if (action === "resolveConflict") {
    role_(u, ["admin"]);
    const c = s.conflicts.find((x) => x.id === d.id);
    if (!c || c.status !== "À arbitrer") throw Error("Conflit absent");
    requireEditable_(s, c.collection);
    if (!["proposed", "current"].includes(d.use))
      throw Error("Décision invalide");
    if (d.use === "proposed") {
      const current = s[c.collection].find((x) => x.id === c.entityId);
      const applied = mutate_(
        s,
        u,
        "save",
        {
          collection: c.collection,
          row: { ...c.proposed, id: c.entityId },
          baseVersion: current?.version,
        },
        op + "-resolution",
      );
      if (applied.conflict) throw Error("Le conflit a changé");
    }
    s.config.checksAccepted = [];
    c.status = "Résolu";
    c.resolvedBy = u.id;
    touch_(s, c);
    return { ok: true };
  }
  if (action === "config") {
  role_(u, ["admin"]);

  if (s.config.validated) {
    throw Error(
      "Planning validé : réouverture motivée requise"
    );
  }

  const correspondance = {
    annee: "year",
    nom_edition: "name",
    phase: "phase",
    date_debut: "date_debut",
    date_fin: "date_fin",
    vehicules_prevus: "vehiclesPlanned",
    reserve_a: "reserveA",
    quota_min: "quotaMin",
    quota_max: "quotaMax",
    formulaire_ouvert: "formOpen",
    app_ouverte: "appOpen",
    date_cloture: "closeAt",
    equipe_verifiee: "teamChecked",
    creneaux_verifies: "shiftsChecked",
    concerts_verifies: "concertsChecked"
  };

  const autorisees = Object.keys(correspondance);
  const modifications = {};

  Object.keys(d || {}).forEach(function (cle) {
    if (autorisees.indexOf(cle) < 0) {
      throw Error(
        "Paramètre de configuration inconnu : " + cle
      );
    }

    modifications[cle] = d[cle];
  });

  if (!Object.keys(modifications).length) {
    throw Error("Aucune configuration à modifier");
  }

  /*
   * On construit la configuration finale avant de modifier
   * quoi que ce soit afin de valider l'ensemble.
   */
  const annee =
    modifications.annee !== undefined
      ? Number(modifications.annee)
      : Number(s.config.year);

  const dateDebut =
    modifications.date_debut !== undefined
      ? String(modifications.date_debut).trim()
      : String(s.config.date_debut || "").slice(0, 10);

  const dateFin =
    modifications.date_fin !== undefined
      ? String(modifications.date_fin).trim()
      : String(s.config.date_fin || "").slice(0, 10);

  const quotaMin =
    modifications.quota_min !== undefined
      ? Number(modifications.quota_min)
      : Number(s.config.quotaMin);

  const quotaMax =
    modifications.quota_max !== undefined
      ? Number(modifications.quota_max)
      : Number(s.config.quotaMax);

  const vehicules =
    modifications.vehicules_prevus !== undefined
      ? Number(modifications.vehicules_prevus)
      : Number(s.config.vehiclesPlanned);

  /*
   * VALIDATIONS
   */

  if (
    !Number.isInteger(annee) ||
    annee < 1000 ||
    annee > 9999
  ) {
    throw Error("Année invalide");
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateDebut) ||
    !Number.isFinite(Date.parse(dateDebut))
  ) {
    throw Error("Date de début invalide");
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateFin) ||
    !Number.isFinite(Date.parse(dateFin))
  ) {
    throw Error("Date de fin invalide");
  }

  if (dateDebut >= dateFin) {
    throw Error(
      "La date de début doit précéder la date de fin"
    );
  }

  if (
    !Number.isFinite(quotaMin) ||
    !Number.isFinite(quotaMax) ||
    quotaMin < 0 ||
    quotaMax < 0 || quotaMin > 100 || quotaMax > 100 ||
    quotaMin > quotaMax
  ) {
    throw Error("Quotas invalides");
  }

  if (
    !Number.isInteger(vehicules) ||
    vehicules < 0
  ) {
    throw Error(
      "Nombre de véhicules invalide"
    );
  }

  if (modifications.date_cloture !== undefined) {
    const close = String(modifications.date_cloture || "");
    if (close && !Number.isFinite(Date.parse(close))) throw Error("Date de clôture invalide");
    modifications.date_cloture = close;
  }
  const nextOpen = modifications.formulaire_ouvert !== undefined ? BG.yes(modifications.formulaire_ouvert) : s.config.formOpen;
  if (nextOpen) {
    const cfg = { ...s.config };
    for (const key of Object.keys(modifications)) cfg[correspondance[key]] = ["equipe_verifiee", "creneaux_verifies", "concerts_verifies"].includes(key) ? BG.yes(modifications[key]) : modifications[key];
    checkFormOpening_(s, cfg);
  }
  /*
   * Normalisation des valeurs destinées au Sheet.
   */

  if (modifications.annee !== undefined) {
    modifications.annee = annee;
  }

  if (modifications.date_debut !== undefined) {
    modifications.date_debut = dateDebut;
  }

  if (modifications.date_fin !== undefined) {
    modifications.date_fin = dateFin;
  }

  if (modifications.vehicules_prevus !== undefined) {
    modifications.vehicules_prevus = vehicules;
  }

  if (modifications.quota_min !== undefined) {
    modifications.quota_min = quotaMin;
  }

  if (modifications.quota_max !== undefined) {
    modifications.quota_max = quotaMax;
  }

  if (modifications.reserve_a !== undefined) {
    modifications.reserve_a =
      BG.yes(modifications.reserve_a) ? "oui" : "non";
  }

  if (modifications.formulaire_ouvert !== undefined) {
    modifications.formulaire_ouvert =
      BG.yes(modifications.formulaire_ouvert)
        ? "oui"
        : "non";
  }

  for (const key of ["equipe_verifiee", "creneaux_verifies", "concerts_verifies"]) {
    if (modifications[key] !== undefined) modifications[key] = BG.yes(modifications[key]) ? "oui" : "non";
  }
  if (modifications.app_ouverte !== undefined) {
    modifications.app_ouverte =
      BG.yes(modifications.app_ouverte)
        ? "oui"
        : "non";
  }

  /*
   * Écriture ciblée dans CONFIG_EDITION.
   */
  mettreAJourConfigEdition_(modifications);

  /*
   * Mise à jour de s.config.
   */
  Object.keys(modifications).forEach(function (cle) {
    const champ = correspondance[cle];
    let valeur = modifications[cle];

    if (cle === "annee") {
      valeur = Number(valeur);
    } else if (
      cle === "vehicules_prevus" ||
      cle === "quota_min" ||
      cle === "quota_max"
    ) {
      valeur = Number(valeur);
    } else if (
      cle === "reserve_a" ||
      cle === "formulaire_ouvert" ||
      cle === "app_ouverte" || cle === "equipe_verifiee" || cle === "creneaux_verifies" || cle === "concerts_verifies"
    ) {
      valeur = BG.yes(valeur);
    }

    s.config[champ] = valeur;
  });

  /*
   * Si les bornes du calendrier changent, on force sa
   * reconstruction au prochain appel.
   */
  if (
    modifications.date_debut !== undefined ||
    modifications.date_fin !== undefined
  ) {
    delete s.config.jours;
    invalidatePlanning_(s);
  }

  s.config.checksAccepted = [];

  return {
    ok: true,
    config: {
      year: s.config.year,
      name: s.config.name,
      phase: s.config.phase,
      date_debut: s.config.date_debut,
      date_fin: s.config.date_fin,
      vehiclesPlanned: s.config.vehiclesPlanned,
      reserveA: s.config.reserveA,
      quotaMin: s.config.quotaMin,
      quotaMax: s.config.quotaMax,
      formOpen: s.config.formOpen,
      appOpen: s.config.appOpen,
    closeAt: s.config.closeAt || "",
    teamChecked: !!s.config.teamChecked, shiftsChecked: !!s.config.shiftsChecked, concertsChecked: !!s.config.concertsChecked
    }
  };
}
  if (action === "access") {
    role_(u, ["admin"]);
    const p = s.people.find((x) => x.id === d.personId);
    if (!p || !BG.active(p)) throw Error("Personne absente");
    const strip = (x) =>
      String(x)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z]/g, "")
        .toUpperCase()
        .slice(0, 2)
        .padEnd(2, "X");
    let code;
    do {
      const bytes = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        Utilities.getUuid(),
      );
      const number = ((bytes[0] & 255) * 256 + (bytes[1] & 255)) % 10000;
      code =
        strip(p.lastName) +
        strip(p.firstName) +
        String(number).padStart(4, "0");
    } while (s.access.some((a) => a.hash === hash_(code)));
    s.access = s.access.filter((a) => a.personId !== p.id);
    s.access.push({ personId: p.id, hash: hash_(code), active: true, version: s.version + 1 });
    s.sessions = s.sessions.filter((a) => a.personId !== p.id);
    /* Le résultat de l'opération ne contient jamais le code. */ if (d.send) {
      if (!p.email) throw Error("Email manquant");
      MailApp.sendEmail(
        p.email,
        "Ton accès Beauregard",
        "Bonjour " +
          p.firstName +
          ",\nTon code personnel : " +
          code +
          "\n" +
          s.config.appUrl +
          "\nClôture : " +
          s.config.closeAt +
          "\nLe premier chargement télécharge les données hors ligne.\nAndroid : menu du navigateur > Installer. iPhone : Safari > Partager > Sur l’écran d’accueil.",
      );
      return { sent: true };
    }
    return { code, personId: p.id, shownOnce: true };
  }
  if (action === "revoke") {
    role_(u, ["admin"]);
    s.sessions = s.sessions.filter((x) =>
      d.sessionId ? x.idSession !== d.sessionId : x.personId !== d.personId,
    );
    return { ok: true };
  }
  if (action === "adminCode") {
    role_(u, ["admin"]);
    if (
      hash_(d.old) !==
      PropertiesService.getScriptProperties().getProperty("V2_ADMIN_HASH")
    )
      throw Error("Ancien code incorrect");
    if (d.next !== d.confirm || String(d.next).length < 12)
      throw Error("Nouveau code invalide");
    PropertiesService.getScriptProperties().setProperty(
      "V2_ADMIN_HASH",
      hash_(d.next),
    );
    s.sessions = s.sessions.filter((x) => x.role !== "admin");
    return { ok: true };
  }
  if (action === "vehicleCode") {
    role_(u, ["admin"]);
    if (String(d.code).length < 8) throw Error("8 caractères minimum");
    s.vehicleHash = hash_(d.code);
    s.config.vehicleAccess = !!d.enabled;
    s.sessions = s.sessions.filter((x) => x.role !== "vehicles");
    return { ok: true };
  }
  if (action === "openForm") {
    role_(u, ["admin"]);
    if (
      !s.config.teamChecked ||
      !s.config.shiftsChecked ||
      !s.config.concertsChecked ||
      !s.config.closeAt ||
      Date.parse(s.config.closeAt) <= Date.now()
    )
      throw Error("Contrôle équipe, créneaux, concerts et clôture requis");
    if (
      s.people
        .filter(BG.active)
        .some(
          (p) =>
            p.role !== "referent" &&
            !s.access.some((a) => a.personId === p.id && a.active),
        )
    )
      throw Error("Crée les accès avant ouverture");
    s.config.formOpen = true;
    s.config.phase = "Formulaire ouvert";
    installReminder_();
    notifyOpen_(s, "form");
    return { ok: true };
  }
  if (action === "formStart") {
    role_(u, ["benevole", "referent", "admin"]);
    if (!s.config.formOpen || !Number.isFinite(Date.parse(s.config.closeAt)) || Date.now() >= Date.parse(s.config.closeAt))
      throw Error("Formulaire fermé");
    const personId = u.role === "benevole" ? u.id : d.personId || u.id;
    const f = s.forms.find((x) => x.personId === personId);
    return {
      row: upsert_(s, "forms", {
        ...f,
        id: personId,
        personId,
        startedAt: f?.startedAt || now_(),
        status: f?.status || "En cours",
      }),
    };
  }
  if (action === "formSubmit") {
    role_(u, ["benevole", "referent", "admin"]);
    const pid = u.role === "benevole" ? u.id : d.personId,
      old = s.forms.find((x) => x.personId === pid);
    const close = Date.parse(s.config.closeAt),
      grace =
        old &&
        Date.parse(old.startedAt) < close &&
        Date.now() <= close + 1800000;
    if (
      u.role === "benevole" &&
      (!s.config.formOpen || !Number.isFinite(close) || (Date.now() > close && !grace))
    )
      throw Error("Délai de réponse dépassé");
    const p = s.people.find((x) => x.id === pid);
    if (!p) throw Error("Personne absente");
    const f = {
      ...d,
      id: pid,
      personId: pid,
      status: "Reçu",
      submittedAt: now_(),
    };
    const issues = BG.formIssues(s, p, f);
    if (issues.length) throw Error(issues.join("\n"));
    return { row: upsert_(s, "forms", f) };
  }
  if (action === "simulate") {
    role_(u, ["admin"]);
    const simulationState = simulationDepuisReponsesSheet_(s);
    const result = simulationPlacementOfficeV6_(simulationState);
    const snapshot = {
      config: s.config,
      people: s.people,
      shifts: s.shifts,
      forms: simulationState.forms,
      concerts: s.concerts,
      missions: s.missions,
    };
    return {
      row: upsert_(s, "simulations", {
        id: op,
        name: d.name || "Simulation " + (s.simulations.length + 1),
        at: now_(),
        snapshot: BG.clone(snapshot),
        ...result,
        stale: false,
      }),
    };
  }
  if (action === "useSimulation") {
    role_(u, ["admin"]);
    requireEditable_(s, "assignments");
    const sim = s.simulations.find((x) => x.id === d.id);
    if (!sim) throw Error("Simulation absente");
    if (sim.stale) throw Error("Simulation périmée : relance le calcul");
    // Transport GET : n'envoyer que les déplacements manuels, jamais le planning complet.
    // Compatibilité conservée avec les anciennes versions qui transmettent assignments.
    let selected = Array.isArray(d.assignments) ? d.assignments : (sim.assignments || []).map(a => ({...a}));
    if (!Array.isArray(d.assignments) && Array.isArray(d.moves)) {
      if (d.moves.length > 2000) throw Error("Trop de déplacements");
      const seen = new Set();
      const shiftMap = new Map(s.shifts.filter(BG.active).map(x => [String(x.id), x]));
      for (const move of d.moves) {
        const pid = String(move.personId || ""), sid = String(move.shiftId || "");
        const dest = shiftMap.get(sid);
        if (!pid || !dest || seen.has(pid + "|" + dest.date)) throw Error("Déplacement invalide ou en doublon");
        seen.add(pid + "|" + dest.date);
        const matching = selected.filter(a => String(a.personId) === pid && shiftMap.get(String(a.shiftId))?.date === dest.date);
        if (matching.length !== 1) throw Error("Déplacement introuvable ou ambigu pour " + pid);
        matching[0].shiftId = sid;
        matching[0].rank = 4;
        matching[0].placementOffice = true;
        matching[0].internalReason = matching[0].internalReason || "Déplacement manuel administrateur";
        matching[0].publicReason = matching[0].publicReason || "Ajustement du planning";
      }
    }
    const validPeople = new Set(s.people.filter(BG.active).map(x => String(x.id)));
    const validShifts = new Set(s.shifts.filter(BG.active).map(x => String(x.id)));
    if (selected.length > 2000 || selected.some(a => !validPeople.has(String(a.personId)) || !validShifts.has(String(a.shiftId)))) throw Error("Affectations de simulation invalides");
    // Contrôle serveur : impossible de séparer un groupe obligatoire par un déplacement manuel.
    const mandatory = new Map();
    s.people.filter(BG.active).forEach(p => {
      if (!p.mandatoryGroupId) return;
      const g=String(p.mandatoryGroupId);
      if(!mandatory.has(g)) mandatory.set(g,[]);
      mandatory.get(g).push(String(p.id));
    });
    for(const [group,ids] of mandatory){
      if(ids.length<2)continue;
      for(const date of [...new Set(s.shifts.filter(BG.active).map(x=>x.date))]){
        const groupShifts=ids.map(id=>selected.filter(a=>String(a.personId)===id && s.shifts.some(x=>String(x.id)===String(a.shiftId)&&x.date===date)).map(a=>String(a.shiftId)));
        if(groupShifts.some(x=>x.length!==groupShifts[0].length||x.join('|')!==groupShifts[0].join('|')))
          throw Error('Groupe indivisible '+group+' séparé le '+date+' : déplace tous ses membres ensemble');
      }
    }
    s.assignments.forEach((x) => {
      x.deleted = true;
      touch_(s, x);
    });
    selected.forEach((a, i) => upsert_(s, "assignments", {
      personId: a.personId, shiftId: a.shiftId, missionId: a.missionId || "",
      rank: a.rank || "", internalReason: a.internalReason || "", publicReason: a.publicReason || "", placementOffice: !!a.placementOffice, id: op + "-" + i, simulationId: sim.id
    }));
    s.rotations.forEach((x) => {
      x.deleted = true;
      touch_(s, x);
    });
    s.config.checksAccepted = [];
    return { ok: true };
  }
  if (action === "rotations") {
    role_(u, ["admin"]);
    requireEditable_(s, "rotations");
    const work = {
      ...s,
      assignments: s.assignments.filter(BG.active),
      rotations: s.rotations.filter(BG.active),
    };
    const rr = BG.rotations(work, work.assignments, work.rotations);
    s.rotations.forEach((x) => {
      x.deleted = true;
      touch_(s, x);
    });
    rr.forEach((r) => upsert_(s, "rotations", r));
    s.config.checksAccepted = [];
    return { ok: true };
  }
  if (action === "acceptCheck") {
    role_(u, ["admin", "referent"]);
    const issue = controlesPlanningV2_({
      ...s,
      assignments: s.assignments.filter(BG.active),
      rotations: s.rotations.filter(BG.active),
    }).find((x) => x.id === d.id);
    if (!issue || issue.level !== "orange")
      throw Error("Seules les alertes orange sont acceptables");
    s.config.checksAccepted.push({ id: d.id, author: u.id, at: now_() });
    return { ok: true };
  }
  if (action === "validate") {
    role_(u, ["admin"]);
    const checks = controlesPlanningV2_({
      ...s,
      assignments: s.assignments.filter(BG.active),
      rotations: s.rotations.filter(BG.active),
    });
    if (
      checks.some(
        (x) =>
          x.level === "red" ||
          !s.config.checksAccepted.some((a) => a.id === x.id),
      )
    )
      throw Error("Contrôles bloquants ou orange non acceptés");
    if (!s.assignments.some(BG.active)) throw Error("Planning vide");
    s.config.validated = true;
    s.config.phase = "Validé";
    return { ok: true };
  }
  if (action === "reopen") {
    role_(u, ["admin"]);
    if (!String(d.reason || "").trim()) throw Error("Motif obligatoire");
    s.config.validated = false;
    s.config.phase = "Réouvert";
    s.config.checksAccepted = [];
    audit_(s, u, "reouverture", { reason: d.reason });
    return { ok: true };
  }
  if (action === "publish") {
    role_(u,["admin"]);
    const mode = d.mode === "draft" ? "draft" : "final";
    if (!s.config.validated) throw Error("Validation du planning requise avant toute publication");
    const previous = s.publications.filter(x => !x.deleted && x.mode !== "draft").at(-1);
    const number = s.publications.filter(x=>!x.deleted).length + 1;
    const snapshot = BG.clone({
      assignments:s.assignments.filter(BG.active),rotations:s.rotations.filter(BG.active),
      people:s.people.filter(BG.active),shifts:s.shifts.filter(BG.active),
      concerts:s.concerts.filter(BG.active),arbitrations:s.arbitrations.filter(BG.active)
    });
    const sig = (a) => JSON.stringify((a||[]).map(x=>[String(x.shiftId),String(x.missionId||""),String(x.rank||"")]).sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))));
    const oldAssignments = previous?.snapshot?.assignments || [];
    const allIds = snapshot.people.map(p=>String(p.id));
    const affectedIds = !previous ? allIds : allIds.filter(id=>sig(oldAssignments.filter(a=>String(a.personId)===id))!==sig(snapshot.assignments.filter(a=>String(a.personId)===id)));
    const changeType = previous ? (d.changeType === "targeted" ? "targeted" : "general") : "initial";
    if (d.changeType === "targeted" && !previous) throw Error("Aucun planning final précédent");
    if (d.changeType === "targeted" && !String(d.reason||"").trim()) throw Error("Motif de correction obligatoire");
    if (d.changeType === "targeted" && affectedIds.length === 0) throw Error("Aucun changement d'affectation détecté");
    const pub = upsert_(s,"publications",{id:op,number,at:now_(),mode,changeType,
      reason:String(d.reason||""),affectedIds:mode==="draft"?[]:affectedIds,
      message:d.message||s.config.emailMessage||"",snapshot});
    if(mode==="final"){
      installDeliveryWorker_();
      s.config.phase="Publié";
      upsert_(s,"messages",{id:"publication-"+op,
        title:changeType==="initial"?"Ton planning est disponible !":"Ton planning a changé",
        body:changeType==="initial"?"Ton planning définitif est disponible.":"Une nouvelle version de ton planning est disponible.",
        targets:{people:affectedIds},active:true,urgent:true,publicationId:op});
      queuePublication_(s,pub);
    } else s.config.phase="Brouillon publié";
    audit_(s,u,"publication",{number,mode,changeType,affectedIds,reason:d.reason||""});
    return {number,mode,affectedCount:affectedIds.length,emailsQueued:mode==="final"};
  }
  if (action === "sendPublication") {
    role_(u, ["admin"]);
    const pub = s.publications.at(-1);
    if (!pub) throw Error("Aucune publication");
    installDeliveryWorker_();
    return { count: queuePublication_(s, pub, true) };
  }
  if (action === "appOpen") {
    role_(u, ["admin"]);
    s.config.appOpen = !!d.open;
    if (d.open) notifyOpen_(s, "app");
    return { ok: true };
  }
  if (action === "read") {
    role_(u, ["benevole", "referent", "admin"]);
    const m = s.messages.find((x) => x.id === d.messageId);
    if (!m || !targeting_(s, m, u)) throw Error("Message inaccessible");
    return {
      row: upsert_(s, "reads", {
        id: m.id + "-" + u.id,
        messageId: m.id,
        personId: u.id,
        at: now_(),
      }),
    };
  }
  if (action === "ack") {
    role_(u, ["benevole", "referent", "admin"]);
    const row = s.terrain.find((x) => x.id === d.id);
    if (!row || (u.role === "benevole" && row.personId !== u.id))
      throw Error("Modification inaccessible");
    row.acknowledged = true;
    row.ackBy = u.id;
    row.ackAt = now_();
    row.direct = u.role !== "benevole";
    touch_(s, row);
    return { ok: true };
  }
  if (action === "incident") {
    role_(u, ["benevole", "referent", "admin"]);
    if (d.type !== "Plein à faire" && !String(d.description || "").trim())
      throw Error("Description obligatoire");
    const vehicle = s.vehicles.find((v) => v.id === d.vehicleId);
    if (!vehicle) throw Error("Véhicule inconnu");
    if (d.type === "Plein à faire") {
      vehicle.fuelAlert = true;
      touch_(s, vehicle);
      const existing = s.incidents.find(
        (i) =>
          i.vehicleId === vehicle.id &&
          i.type === "Plein à faire" &&
          i.status !== "Clos",
      );
      if (existing) return { id: existing.id };
    }
    return {
      row: upsert_(s, "incidents", {
        ...d,
        id: op,
        personId: u.id,
        status: "Ouvert",
        at: now_(),
      }),
    };
  }
  if (action === "closeIncident") {
    role_(u, ["admin", "referent"]);
    const i = s.incidents.find((x) => x.id === d.id);
    if (!i) throw Error("Incident inconnu");
    i.status = "Clos";
    i.closedAt = now_();
    touch_(s, i);
    if (i.type === "Plein à faire") {
      const v = s.vehicles.find((v) => v.id === i.vehicleId);
      v.fuelAlert = false;
      touch_(s, v);
    }
    return { ok: true };
  }
  if (action === "reception") {
    role_(u, ["vehicles", "admin"]);
    const old = s.receptions.find((x) => x.id === d.row.id);
    if (old?.signature1) throw Error("Dossier signé : contenu verrouillé");
    if (old && old.version !== Number(d.baseVersion || 0))
      throw Error(
        "Dossier modifié sur un autre appareil : synchronise avant de reprendre",
      );
    if (old && old.operatorId !== u.id)
      throw Error("Dossier en cours chez un autre opérateur");
    const row = {
      ...d.row,
      id: old?.id || d.row.id || op,
      operatorId: u.id,
      operatorName: u.name,
    };
    delete row.signature1;
    delete row.signature2;
    row.status = "En cours";
    if (
      s.receptions.some(
        (x) =>
          x.operatorId === u.id && x.id !== row.id && x.status === "En cours",
      )
    )
      throw Error("Termine le dossier actif");
    return { row: upsert_(s, "receptions", row) };
  }
  if (action === "sign") {
    role_(u, ["vehicles", "admin"]);
    const r = s.receptions.find((x) => x.id === d.id);
    if (!r || r.operatorId !== u.id) throw Error("Dossier inaccessible");
    if (r.signature2) throw Error("Dossier définitivement verrouillé");
    if (!d.name || !String(d.image || "").startsWith("data:image/png;base64,"))
      throw Error("Nom et tracé obligatoires");
    const issues = BG.validateReception(r);
    if (issues.length) throw Error(issues.join("\n"));
    const signature = {
      name: d.name,
      image: d.image,
      at: now_(),
      operator: u.name,
    };
    if (!r.signature1) r.signature1 = signature;
    else {
      r.signature2 = signature;
      r.status = "Terminé";
      const norm = BG.plate(r.plate);
      let v = s.vehicles.find((x) => BG.plate(x.plate) === norm);
      if (v && r.direction === "Prise en charge")
        throw Error("Doublon de réception : arbitrage Admin nécessaire");
      if (!v) {
        v = {
          id: "v-" + r.id,
          plate: r.plate,
          make: r.make,
          model: r.model,
          type: r.type,
          color: r.color,
          active: true,
        };
        upsert_(s, "vehicles", v);
      }
      r.vehicleId = v.id;
    }
    touch_(s, r);
    return { row: r };
  }
  if (action === "cancelSignature") {
    role_(u, ["vehicles", "admin"]);
    const r = s.receptions.find((x) => x.id === d.id);
    if (!r || r.operatorId !== u.id || r.signature2 || !d.reason)
      throw Error("Annulation impossible");
    delete r.signature1;
    touch_(s, r);
    audit_(s, u, "annulation-signature", { id: r.id, reason: d.reason });
    return { ok: true };
  }
  if (action === "amendment") {
    role_(u, ["admin"]);
    const r = s.receptions.find((x) => x.id === d.receptionId);
    if (!r?.signature2 || !d.reason || !d.text)
      throw Error("Dossier signé, motif et correction requis");
    const amendment = {
      id: op,
      receptionId: r.id,
      text: d.text,
      reason: d.reason,
      author: u.name,
      at: now_(),
    };
    amendment.pdfUrl = amendmentPdf_(s, r, amendment);
    return { row: upsert_(s, "amendments", amendment) };
  }
  if (action === "pdfReception") {
    role_(u, ["vehicles", "admin"]);
    const r = s.receptions.find((x) => x.id === d.id);
    if (!r?.signature2) throw Error("Deux signatures requises");
    return receptionPdf_(s, r);
  }
  if (action === "newEdition") throw Error("Utilise la remise à zéro depuis Préparation");
  throw Error("Action inconnue : " + action);
}
function parisHour_() {
  return Number(Utilities.formatDate(new Date(), "Europe/Paris", "H"));
}
function emailPreview_(s, id, message) {
  const p = s.people.find((x) => x.id === id);
  if (!p) throw Error("Bénévole inconnu");
  const text = String(message || s.config.emailMessage || "Bonjour {Prénom}")
    .replace(/\{Prénom\}/g, p.firstName)
    .replace(/\{Nom\}/g, p.lastName);
  return { to: p.email, text: text + "\n\n" + s.config.appUrl };
}
function escape_(x) {
  return String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function folder_(parent, name) {
  const i = parent.getFoldersByName(name);
  return i.hasNext() ? i.next() : parent.createFolder(name);
}
function receptionPdf_(s, r) {
  if (r.pdfUrl) return { url: r.pdfUrl };
  const folder = receptionFolder_(s, r);
  const filename = BG.plate(r.plate) + "_" + r.id + "_SIGNE.pdf",
    existing = folder.getFilesByName(filename);
  if (existing.hasNext()) {
    r.pdfUrl = existing.next().getUrl();
    touch_(s, r);
    return { url: r.pdfUrl };
  }
  const esc = escape_,
    img = (x, label) =>
      x
        ? '<figure><img style="max-width:100%;max-height:260px" src="' +
          esc(x) +
          '"><figcaption>' +
          esc(label) +
          "</figcaption></figure>"
        : "";
  const original =
    r.direction === "Retour"
      ? s.receptions.find(
          (x) =>
            x.direction === "Prise en charge" &&
            x.signature2 &&
            BG.plate(x.plate) === BG.plate(r.plate),
        )
      : null;
  const comparison =
    r.direction === "Retour"
      ? "<h2>Comparaison départ / retour</h2>" +
        (original
          ? "<p>Départ : " +
            esc(original.mileage) +
            " km — " +
            esc(original.fuel) +
            "</p><p>Retour : " +
            esc(r.mileage) +
            " km — " +
            esc(r.fuel) +
            "</p>" +
            (Number(r.mileage) < Number(original.mileage)
              ? "<p><b>Alerte : kilométrage inférieur au départ.</b></p>"
              : "")
          : "<p>Prise en charge initiale indisponible.</p>")
      : "";
  const damages = ["Avant", "Arrière", "Gauche", "Droite", "Intérieur"]
    .map(
      (zone) =>
        "<section><h2>" +
        esc(zone) +
        "</h2>" +
        BG.vehicleSvg(r.type, zone, r.damages) +
        (r.damages || [])
          .filter((x) => x.zone === zone)
          .map(
            (x, i) =>
              "<p><b>" +
              (i + 1) +
              ". " +
              esc(x.type) +
              " — " +
              esc(x.status) +
              "</b><br>" +
              esc(x.description || "") +
              "</p>" +
              img(x.photo, "Photo du dommage " + (i + 1)),
          )
          .join("") +
        "</section>",
    )
    .join("");
  const video =
    (r.media || [])
      .filter((x) => String(x.mime).startsWith("video/"))
      .map(
        (x) =>
          '<p>Vidéo : <a href="' + esc(x.url) + '">' + esc(x.name) + "</a></p>",
      )
      .join("") ||
    (r.video
      ? "<p>Vidéo enregistrée localement, transfert en attente lors de la création de cet original.</p>"
      : "");
  const html =
    '<html><head><meta charset="utf-8"><style>body{font:12px Arial;color:#18443d}section{page-break-inside:avoid}figure{margin:10px 0}svg{display:block}h1{font-size:22px}h2{font-size:16px}p{line-height:1.5}</style></head><body><h1>Beauregard — ' +
    esc(r.direction) +
    "</h1><p>Dossier " +
    esc(r.id) +
    " · édition " +
    esc(s.config.year) +
    "</p><h2>" +
    esc(r.plate + " · " + r.make + " " + r.model) +
    "</h2><p>" +
    esc(r.type + " · " + (r.color || "")) +
    "</p><p>Compteur : " +
    esc(r.mileage) +
    " km · Carburant : " +
    esc(r.fuel) +
    "</p>" +
    img(r.odometerPhoto, "Compteur") +
    img(r.fuelPhoto, "Jauge") +
    comparison +
    damages +
    "<h2>Remarques</h2><p>" +
    esc(r.notes || "Aucune") +
    "</p>" +
    video +
    "<section><h2>Signatures</h2><p>Loueur : " +
    esc(r.signature1.name + " · " + r.signature1.at) +
    "</p>" +
    img(r.signature1.image, "Signature loueur") +
    "<p>Locataire : " +
    esc(r.signature2.name + " · " + r.signature2.at) +
    "</p>" +
    img(r.signature2.image, "Signature locataire") +
    "</section></body></html>";
  const blob = Utilities.newBlob(html, "text/html")
    .getAs("application/pdf")
    .setName(filename);
  r.pdfUrl = folder.createFile(blob).getUrl();
  touch_(s, r);
  return { url: r.pdfUrl };
}
function amendmentPdf_(s, r, a) {
  const folder = receptionFolder_(s, r),
    name = BG.plate(r.plate) + "_AVENANT_" + a.id + ".pdf",
    existing = folder.getFilesByName(name);
  if (existing.hasNext()) return existing.next().getUrl();
  const original = receptionPdf_(s, r).url,
    esc = escape_;
  const html =
    '<html><head><meta charset="utf-8"></head><body><h1>Avenant administratif — Beauregard</h1><p>Dossier ' +
    esc(r.id) +
    " · " +
    esc(r.plate) +
    "</p><p>Auteur : " +
    esc(a.author) +
    " · " +
    esc(a.at) +
    "</p><h2>Motif</h2><p>" +
    esc(a.reason) +
    "</p><h2>Correction</h2><p>" +
    esc(a.text) +
    '</p><p>Ce document distinct ne modifie ni le PDF original ni ses signatures.</p><p><a href="' +
    esc(original) +
    '">État des lieux original signé</a></p></body></html>';
  return folder
    .createFile(
      Utilities.newBlob(html, "text/html")
        .getAs("application/pdf")
        .setName(name),
    )
    .getUrl();
}

function docs_(s, u, d) {
  const pub = published_(s);
  const own = d.kind === "individuel",
    pid = u.role === "benevole" ? u.id : d.personId;
  const assignments = own
    ? pub.assignments.filter((a) => a.personId === pid)
    : pub.assignments;
  const rows = assignments.map((a) => {
    const p = s.people.find((x) => x.id === a.personId) || {},
      slot = s.shifts.find((x) => x.id === a.shiftId) || {};
    return {
      name: BG.label(p),
      date: slot.date,
      slot: slot.name,
      start: slot.start,
      end: slot.end,
      ...(own
        ? {
            choice: a.rank,
            reason: a.publicReason,
            rotations: pub.rotations.filter(
              (r) => r.personId === pid && r.shiftId === a.shiftId,
            ),
          }
        : {}),
    };
  });
  return { rows, version: s.publications.at(-1)?.number || 0 };
}
/* Import contrôlé de la structure V2 précédente, sans effacer ses onglets. */
function migrate_(ss, s) {
  const read = (name) => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    const [headers, ...rr] = sh.getDataRange().getValues();
    return rr
      .filter((r) => r.some((x) => x !== "" && x !== null))
      .map((r) =>
        Object.fromEntries(
          headers.map((h, i) => [
            String(h),
            r[i] instanceof Date ? r[i].toISOString() : r[i],
          ]),
        ),
      );
  };
  /* Une valeur, quel que soit le nom de colonne employé. */
  const pick = (r, names) => {
    for (const n of names) {
      const v = r[n];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return "";
  };
  const date = (x) => String(x || "").slice(0, 10),
    time = (x) =>
      String(x || "").includes("T")
        ? String(x).slice(11, 16)
        : String(x || "").slice(0, 5);

  for (const p of read("BENEVOLES"))
    s.people.push({
      id: String(p.benevole_id || Utilities.getUuid()),
      firstName: p.prenom,
      lastName: p.nom,
      phone: String(p.telephone || ""),
      email: p.email || "",
      photo: String(p.photo || ""),
      role: p.role === "referent" ? "referent" : "benevole",
      status: String(p.statut || "Actif"),
      gearbox: String(pick(p, ["boite_vitesse", "boite"]) || ""),
      forbidC3: BG.yes(p.c3_interdit),
      priorityLoader: BG.yes(p.priorite_chargeur),
      noLoader: BG.yes(p.non_chargeur),
      driverOnly: BG.yes(p.conducteur_uniquement),
      wednesday: BG.yes(p.mercredi_autorise),
      firstYear: BG.yes(p.premiere_annee),
      internalNote: p.note_interne || "",
      version: 1,
    });

  for (const a of read("ACCES"))
    s.access.push({
      personId: String(a.benevole_id),
      hash: String(a.code_hash),
      active: BG.yes(a.actif),
    });
  /* ------------------------------------------------------------------
   * CONFIG_EDITION : feuille clé / valeur.
   *   annee       | 2027
   *   date_debut  | 2027-06-29
   *   date_fin    | 2027-07-04
   * On la transporte dans s.config, où calendrierEdition_ la lira
   * pour construire la table des jours de l'édition.
   * ------------------------------------------------------------------ */
  if (!s.config) s.config = {};
  for (const r of read("CONFIG_EDITION")) {
    const cle = String(r.cle || "").trim();
    if (!cle) continue;
    const v = String(r.valeur == null ? "" : r.valeur).trim();

    if (cle === "annee") s.config.year = Number(v) || 0;
    else if (cle === "nom_edition") s.config.name = v;
    else if (cle === "phase") s.config.phase = v;
    else if (cle === "date_debut") s.config.date_debut = v.slice(0, 10);
    else if (cle === "date_fin") s.config.date_fin = v.slice(0, 10);
    else if (cle === "vehicules_prevus") s.config.vehiclesPlanned = Number(v) || 0;
    else if (cle === "reserve_a") s.config.reserveA = BG.yes(v);
    else if (cle === "quota_min") s.config.quotaMin = Number(v) || 0;
    else if (cle === "quota_max") s.config.quotaMax = Number(v) || 0;
    else if (cle === "formulaire_ouvert") s.config.formOpen = BG.yes(v);
    else if (cle === "app_ouverte") s.config.appOpen = BG.yes(v);
  }

  for (const r of read("CRENEAUX"))
    s.shifts.push({
      id: String(r.creneau_id),
      name: String(pick(r, ["libelle", "mission_principale"]) || r.jour || ""),
      date: date(r.date),
      day: String(r.jour || "").toLowerCase(),
      start: time(pick(r, ["debut", "heure_debut"])),
      end: time(pick(r, ["fin", "heure_fin"])),
      target: Number(pick(r, ["effectif_cible", "capacite_benevoles"])) || 0,
      vehicles: Number(r.vehicules) || 0,
      c3: BG.yes(r.c3),
      brunch: BG.yes(r.brunch),
      order: Number(r.ordre) || 0,
      active: BG.yes(r.actif),
      checked: false,
      version: 1,
    });

  for (const r of read("MISSIONS"))
    s.missions.push({
      id: String(r.mission_id),
      type: String(r.type || "Complémentaire"),
      date: date(r.date),
      day: String(r.jour || "").toLowerCase(),
      name: String(r.libelle || ""),
      start: time(r.debut),
      end: time(r.fin),
      target: Number(r.effectif_cible) || 0,
      order: Number(r.ordre) || 0,
      active: BG.yes(r.actif),
      version: 1,
    });

  for (const r of read("CONCERTS"))
    s.concerts.push({
      id: String(r.concert_id),
      artist: r.artiste,
      scene: String(r.scene || ""),
      date: date(r.date),
      day: String(r.jour || "").toLowerCase(),
      start: time(pick(r, ["debut", "heure_debut"])),
      end: time(pick(r, ["fin", "heure_fin"])),
      order: Number(r.ordre) || 0,
      photo: String(r.photo || ""),
      active: BG.yes(r.actif),
      version: 1,
    });

  for (const r of read("VEHICULES"))
    s.vehicles.push({
      id: String(r.vehicule_id),
      plate: String(pick(r, ["immatriculation", "immat"]) || ""),
      make: String(pick(r, ["marque_modele", "marque"]) || ""),
      model: "",
      type: String(r.type || ""),
      color: String(r.couleur || ""),
      gearbox: String(pick(r, ["boite_vitesse", "boite"]) || ""),
      order: Number(r.ordre) || 0,
      active: BG.yes(r.actif) && !BG.yes(r.desactive),
      fuelAlert: BG.yes(r.plein_a_faire),
      letter: String(r.vehicule_id || "") === "A" ? "A" : "",
      version: 1,
    });

  for (const m of read("MESSAGES"))
    s.messages.push({
      id: String(m.message_id),
      title: String(m.titre || ""),
      body: String(m.contenu || ""),
      targets: { all: String(m.cible || "").toLowerCase() === "tous" },
      priority: String(m.priorite || "Normal"),
      from: String(m.debut || ""),
      to: String(m.fin || ""),
      active: BG.yes(m.actif),
      author: String(m.auteur || ""),
      version: 1,
    });


  const imported = read("CHOIX_CRENEAUX");
  for (const p of s.people) {
    const choices = imported.filter((c) => String(c.benevole_id) === p.id);
    if (!choices.length) continue;
    const byDate = {};
    for (const c of choices) {
      const slot = s.shifts.find((x) => x.id === String(c.creneau_id));
      if (!slot) continue;
      if (!byDate[slot.date]) byDate[slot.date] = { date: slot.date };
      byDate[slot.date][Number(c.rang) === 2 ? "second" : "first"] = slot.id;
    }
    s.forms.push({
      id: p.id,
      personId: p.id,
      status: "À contrôler",
      choices: Object.values(byDate),
      concerts: [],
      partners: [],
      missions: [],
      version: 1,
    });
  }

  s.config.migrationNote =
    "Données importées : équipe, accès, créneaux, missions, concerts, véhicules, choix à contrôler.";
  s.config.appOpen = false;
  s.config.formOpen = false;
  s.config.phase = "Migration à contrôler";
}

function planningPdf_(s, kind, personId) {
  const saved = published_(s);
  s = {
    ...s,
    people: saved.people || s.people,
    shifts: saved.shifts || s.shifts,
    concerts: saved.concerts || s.concerts,
    arbitrations: saved.arbitrations || s.arbitrations,
  };
  const pub = published_(s),
    esc = escape_;
  let title = "Planning collectif",
    html = "";
  if (kind === "individuel") {
    const p = s.people.find((x) => x.id === personId);
    title = "Planning individuel — " + BG.label(p);
    html = pub.assignments
      .filter((a) => a.personId === personId)
      .map((a) => {
        const slot = s.shifts.find((x) => x.id === a.shiftId) || {};
        return (
          "<h2>" +
          esc(slot.date + " · " + slot.name) +
          "</h2><p>" +
          esc(slot.start + "–" + slot.end) +
          "</p><p>" +
          esc(
            a.rank === 1
              ? "Choix 1 respecté"
              : a.rank === 2
                ? "Choix 2 respecté"
                : "Affectation arbitrée par les Référents",
          ) +
          "</p><p>" +
          esc(a.publicReason || "") +
          "</p>" +
          pub.rotations
            .filter((r) => r.personId === personId && r.shiftId === a.shiftId)
            .map(
              (r) =>
                "<p>" + esc(r.start + "–" + r.end + " · " + r.role) + "</p>",
            )
            .join("") +
          s.arbitrations
            .filter((r) => r.personId === personId && r.shiftId === a.shiftId)
            .map(
              (r) =>
                "<p>" +
                esc(
                  (s.concerts.find((c) => c.id === r.concertId)?.artist ||
                    "Concert") +
                    " : " +
                    r.status +
                    " · " +
                    (r.publicReason || ""),
                ) +
                "</p>",
            )
            .join("")
        );
      })
      .join("");
  } else {
    title = kind === "operationnel" ? "Planning opérationnel Référent" : title;
    html = s.shifts
      .filter(BG.active)
      .map((slot) => {
        const aa = pub.assignments.filter((a) => a.shiftId === slot.id);
        let body =
          "<h2>" +
          esc(
            slot.date + " · " + slot.name + " · " + slot.start + "–" + slot.end,
          ) +
          "</h2>";
        if (kind === "operationnel") {
          const rr = pub.rotations.filter((r) => r.shiftId === slot.id),
            boundaries = [...new Set(rr.flatMap((r) => BG.interval(r)))].sort(
              (a, b) => a - b,
            );
          for (let i = 0; i < boundaries.length - 1; i++) {
            const start = boundaries[i],
              end = boundaries[i + 1];
            body += "<h3>" + BG.hh(start) + "–" + BG.hh(end) + "</h3>";
            for (const role of ["Conducteur", "Chargeur"]) {
              const names = rr
                .filter(
                  (r) =>
                    r.role === role &&
                    BG.interval(r)[0] <= start &&
                    BG.interval(r)[1] >= end,
                )
                .map((r) =>
                  BG.label(s.people.find((p) => p.id === r.personId) || {}),
                );
              body +=
                "<p><b>" +
                role +
                "s</b> : " +
                esc(names.join(", ") || "Aucun") +
                "</p>";
            }
          }
        } else
          body +=
            "<p>" +
            esc(
              aa
                .map((a) =>
                  BG.label(s.people.find((p) => p.id === a.personId) || {}),
                )
                .join(", "),
            ) +
            "</p>";
        return (
          '<section style="page-break-after:always">' + body + "</section>"
        );
      })
      .join("");
  }
  const content =
    '<html><head><meta charset="utf-8"><style>body{font:12px Arial;color:#18443d}h1{font-size:22px}h2{font-size:17px}h3{font-size:14px}p{line-height:1.5}</style></head><body><h1>' +
    esc(title) +
    "</h1><p>" +
    esc(s.config.name) +
    " · V" +
    (s.publications.at(-1)?.number || 0) +
    "</p>" +
    html +
    "</body></html>";
  return Utilities.newBlob(content, "text/html")
    .getAs("application/pdf")
    .setName(
      kind +
        "_" +
        (personId || "collectif") +
        "_V" +
        (s.publications.at(-1)?.number || 0) +
        ".pdf",
    );
}
function downloadPlanning_(s, u, d) {
  const kind = d.kind || "collectif";
  if (!["individuel", "collectif", "operationnel"].includes(kind))
    throw Error("Type inconnu");
  if (kind === "operationnel") role_(u, ["admin", "referent"]);
  const pid = u.role === "benevole" ? u.id : d.personId || u.id;
  const pdf = planningPdf_(s, kind, pid);
  return {
    name: pdf.getName(),
    mime: "application/pdf",
    base64: Utilities.base64Encode(pdf.getBytes()),
  };
}
function editionMail_(s, p, kind, message, code) {
  const closure = s.config.closeAt
    ? Utilities.formatDate(
        new Date(s.config.closeAt),
        "Europe/Paris",
        "dd/MM/yyyy HH:mm",
      )
    : "à définir";
  let text = (message || "Bonjour {Prénom},")
    .replace(/\{Prénom\}/g, p.firstName)
    .replace(/\{Nom\}/g, p.lastName);
  if (kind === "form")
    text +=
      "\nLe formulaire est ouvert jusqu’au " +
      closure +
      ".\n" +
      (code
        ? "Ton nouveau code personnel : " + code + "\n"
        : "Ton code personnel déjà reçu reste valable.\n") +
      "Le premier accès télécharge les données nécessaires au hors ligne.\nAndroid : menu du navigateur > Installer l’application.\niPhone : Safari > Partager > Sur l’écran d’accueil.";
  if (kind === "app")
    text += "\nTon espace opérationnel Beauregard est ouvert.";
  return text + "\n\n" + s.config.appUrl;
}
function notifyOpen_(s, kind, people) {
  const id = Utilities.getUuid();
  const recipients = s.people.filter(BG.active).filter(p => !people || people.includes(p.id));
  for (const p of recipients) {
    const report = { id: id + "-" + p.id, personId: p.id, kind, at: now_() };
    try {
      if (!p.email) throw Error("Adresse manquante");
      MailApp.sendEmail(
        p.email,
        kind === "form"
          ? "Beauregard — formulaire ouvert"
          : "Beauregard — application ouverte",
        editionMail_(s, p, kind, "Bonjour {Prénom},"),
      );
      report.status = "Envoyé";
    } catch (e) {
      report.status = "Échec";
      report.error = e.message;
    }
    upsert_(s, "deliveries", report);
  }
  upsert_(s, "messages", {
    id: "opening-" + id,
    title:
      kind === "form"
        ? "Le formulaire est ouvert"
        : "Ton espace opérationnel est ouvert",
    body: "Retrouve les informations de ton édition.",
    targets: { all: true },
    active: true,
    urgent: false,
  });
  return recipients.length;
}
function installReminder_() {
  if (
    !ScriptApp.getProjectTriggers().some(
      (t) => t.getHandlerFunction() === "reminderJ2",
    )
  )
    ScriptApp.newTrigger("reminderJ2").timeBased().everyHours(1).create();
}
function reminderJ2() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const s = load_(),
      close = Date.parse(s.config.closeAt);
    if (
      !s.config.formOpen ||
      !close ||
      Date.now() < close - 48 * 3600000 ||
      Date.now() >= close ||
      s.config.remindedFor === s.config.closeAt
    )
      return;
    for (const p of s.people.filter(
      (p) =>
        BG.active(p) &&
        p.role !== "referent" &&
        !s.forms.some((f) => f.personId === p.id && f.status === "Reçu"),
    )) {
      const id = "J2-" + s.config.closeAt + "-" + p.id;
      if (s.deliveries.some((r) => r.id === id && r.status === "Envoyé"))
        continue;
      try {
        MailApp.sendEmail(
          p.email,
          "Beauregard — pense à ton formulaire",
          editionMail_(
            s,
            p,
            "form",
            "Bonjour {Prénom}, il reste deux jours pour envoyer ton formulaire.",
          ),
        );
        upsert_(s, "deliveries", {
          id,
          personId: p.id,
          kind: "Relance J-2",
          status: "Envoyé",
          at: now_(),
        });
      } catch (e) {
        upsert_(s, "deliveries", {
          id,
          personId: p.id,
          kind: "Relance J-2",
          status: "Échec",
          error: e.message,
          at: now_(),
        });
      }
    }
    s.config.remindedFor = s.config.closeAt;
    save_(s);
  } finally {
    lock.releaseLock();
  }
}
function receptionFolder_(s, r) {
  let f = DriveApp.getRootFolder();
  for (const name of [
    "Beauregard",
    String(s.config.year),
    "Véhicules",
    BG.plate(r.plate) + " - " + r.make + " " + r.model,
    r.direction === "Retour" ? "Retour" : "Prise en charge",
  ])
    f = folder_(f, name);
  return f;
}
function mediaInit_(s, u, d) {
  role_(u, ["vehicles", "admin"]);
  const r = s.receptions.find((r) => r.id === d.receptionId);
  if (!r || (u.role !== "admin" && r.operatorId !== u.id))
    throw Error("Dossier inaccessible");
  if (r.signature2) throw Error("Dossier signé : aucun média supplémentaire");
  if (!Number.isFinite(d.size) || d.size <= 0 || !d.name || !d.mime)
    throw Error("Média invalide");
  s.uploads = s.uploads || [];
  const old = s.uploads.find((x) => x.id === d.id);
  if (old) return { id: old.id, next: old.next || 0, url: old.url || null };
  const folder = receptionFolder_(s, r);
  const res = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "post",
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        "X-Upload-Content-Type": d.mime,
        "X-Upload-Content-Length": String(d.size),
      },
      contentType: "application/json",
      payload: JSON.stringify({ name: d.name, parents: [folder.getId()] }),
      muteHttpExceptions: true,
    },
  );
  if (res.getResponseCode() !== 200)
    throw Error("Initialisation transfert Drive : " + res.getResponseCode());
  const h = res.getAllHeaders();
  const location = h.Location || h.location;
  if (!location || !String(location).startsWith("https://www.googleapis.com/"))
    throw Error("Adresse de transfert Drive invalide");
  s.uploads.push({
    id: d.id,
    receptionId: r.id,
    author: u.id,
    location,
    size: d.size,
    mime: d.mime,
    name: d.name,
    next: 0,
  });
  return { id: d.id, next: 0 };
}
function mediaChunk_(s, u, d) {
  role_(u, ["vehicles", "admin"]);
  const x = (s.uploads || []).find((x) => x.id === d.id);
  if (!x || (x.author !== u.id && u.role !== "admin"))
    throw Error("Transfert inaccessible");
  if (x.url) return { complete: true, url: x.url, next: x.size };
  const reception = s.receptions.find((r) => r.id === x.receptionId);
  if (!reception || reception.signature2) throw Error("Dossier signé ou absent");
  if (d.offset !== x.next) return { next: x.next };
  const bytes = Utilities.base64Decode(d.base64);
  if (
    bytes.length > 262144 ||
    bytes.length === 0 ||
    d.offset + bytes.length > x.size
  )
    throw Error("Fragment invalide");
  const result = UrlFetchApp.fetch(x.location, {
    method: "put",
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      "Content-Range":
        "bytes " +
        d.offset +
        "-" +
        (d.offset + bytes.length - 1) +
        "/" +
        x.size,
    },
    contentType: x.mime,
    payload: bytes,
    muteHttpExceptions: true,
  });
  const code = result.getResponseCode();
  if (code === 308) {
    const h = result.getAllHeaders(),
      range = h.Range || h.range;
    const m = String(range || "").match(/bytes=0-(\d+)/);
    x.next = m ? Number(m[1]) + 1 : d.offset + bytes.length;
    return { next: x.next };
  }
  if (code === 200 || code === 201) {
    const file = JSON.parse(result.getContentText());
    x.fileId = file.id;
    x.url = "https://drive.google.com/file/d/" + file.id + "/view";
    x.next = x.size;
    delete x.location;
    const r = s.receptions.find((r) => r.id === x.receptionId);
    r.media = r.media || [];
    r.media.push({
      id: x.id,
      name: x.name,
      mime: x.mime,
      url: x.url,
      size: x.size,
      at: now_(),
    });
    touch_(s, r);
    return { next: x.next, complete: true, url: x.url };
  }
  throw Error(
    "Transfert Drive interrompu (" + code + "). Le média reste sur l’appareil.",
  );
}

function validateRow_(s, k, row) {
  if (["assignments", "rotations", "arbitrations", "terrain"].includes(k)) {
    if (!s.people.some((p) => p.id === row.personId && BG.active(p)))
      throw Error("Personne inconnue ou indisponible");
    if (row.missionId) {
      if (!s.missions.some((m) => m.id === row.missionId && BG.active(m)))
        throw Error("Mission inconnue");
    } else if (!s.shifts.some((x) => x.id === row.shiftId && BG.active(x)))
      throw Error("Créneau inconnu");
  }
  if (["shifts", "missions", "concerts", "rotations"].includes(k)) {
    for (const t of [row.start, row.end])
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(t)))
        throw Error("Horaire invalide");
    if (row.start === row.end) throw Error("Début et fin identiques");
  }
  if (
    ["shifts", "missions", "concerts"].includes(k) &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isFinite(Date.parse(row.date)))
  )
    throw Error("Date invalide");
  if (k === "rotations" && !["Conducteur", "Chargeur"].includes(row.role))
    throw Error("Rôle invalide");
  if (
    k === "arbitrations" &&
    !s.concerts.some((c) => c.id === row.concertId && BG.active(c))
  )
    throw Error("Concert inconnu");
}
/* Envoi différé : la publication est durable avant le premier email. */
function installDeliveryWorker_() {
  if (
    !ScriptApp.getProjectTriggers().some(
      (t) => t.getHandlerFunction() === "deliverPublicationEmails",
    )
  )
    ScriptApp.newTrigger("deliverPublicationEmails")
      .timeBased()
      .everyMinutes(1)
      .create();
}
function queuePublication_(s, pub, retry = false) {
  let count = 0;
  for (const p of (pub.snapshot.people || s.people).filter(BG.active).filter(p=>!Array.isArray(pub.affectedIds)||pub.affectedIds.includes(String(p.id)))) {
    const id = pub.id + "-" + p.id,
      old = s.deliveries.find((x) => x.id === id);
    if (old && (!retry || old.status !== "Échec")) continue;
    upsert_(s, "deliveries", {
      id,
      publicationId: pub.id,
      personId: p.id,
      to: p.email,
      status: "À envoyer",
      at: now_(),
    });
    count++;
  }
  return count;
}
function deliverPublicationEmails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const s = load_();
    for (const item of s.deliveries.filter(
      (x) =>
        x.status === "En cours" &&
        Date.now() - Date.parse(x.startedAt) > 600000,
    )) {
      item.status = "À vérifier";
      item.error =
        "Envoi interrompu : vérifier la réception avant une relance manuelle";
      touch_(s, item);
    }
    const batch = s.deliveries
      .filter((x) => x.publicationId && x.status === "À envoyer")
      .slice(0, 4);
    for (const item of batch) {
      const pub = s.publications.find((x) => x.id === item.publicationId);
      if (!pub) continue;
      const copy = {
        ...s,
        publications: [pub],
        people: pub.snapshot.people || s.people,
      };
      try {
        if (!item.to) throw Error("Adresse manquante");
        const mail = emailPreview_(copy, item.personId, pub.message);
        const attachments = [
          planningPdf_(copy, "individuel", item.personId),
          planningPdf_(copy, "collectif"),
        ];
        item.status = "En cours";
        item.startedAt = now_();
        touch_(s, item);
        save_(s);
        MailApp.sendEmail({
          to: item.to,
          subject: "Beauregard — planning V" + pub.number,
          body: mail.text,
          attachments,
        });
        item.status = "Envoyé";
        item.at = now_();
        delete item.error;
      } catch (e) {
        item.status = item.status === "En cours" ? "À vérifier" : "Échec";
        item.error = String(e.message || e);
      }
      touch_(s, item);
      save_(s);
    }
    save_(s);
  } finally {
    lock.releaseLock();
  }
}

function reinitialiserV2depuisOnglets() {
  const p = PropertiesService.getScriptProperties();
  p.deleteProperty("BG_STATE_GENERATION");
  p.deleteProperty("BG_PREVIOUS_GENERATION");
  setupV2();
}

function relancerMigration() {
  const p = PropertiesService.getScriptProperties();
  p.deleteProperty("BG_STATE_GENERATION");
  p.deleteProperty("BG_PREVIOUS_GENERATION");
  setupV2();
}


function invalidatePlanning_(s) {
  s.config.checksAccepted = [];
  s.config.validated = false;
  (s.simulations || []).forEach((x) => { if (!x.stale) { x.stale = true; touch_(s, x); } });
}
function checkFormOpening_(s, cfg) {
  if (!cfg.teamChecked || !cfg.shiftsChecked || !cfg.concertsChecked || !Number.isFinite(Date.parse(cfg.closeAt)) || Date.parse(cfg.closeAt) <= Date.now())
    throw Error("Vérifie équipe, créneaux, concerts et renseigne une clôture future avant ouverture");
  if (s.people.filter(BG.active).some((p) => p.role !== "referent" && !s.access.some((a) => a.personId === p.id && a.active)))
    throw Error("Crée les accès avant ouverture");
}

/* Vérification en lecture seule : travaille sur une copie, ne sauvegarde rien. */
function verifierRunnerV2() {
  const live = load_();
  const s = BG.clone(live);
  const date = "2027-07-01";
  const checks = [];
  const verify = (name, condition) => { checks.push({ name, ok: !!condition }); if (!condition) throw Error("Vérification échouée : " + name); };
  verify("Chevauchement après minuit", BG.overlap({date, start:"00:00", end:"04:00"}, {date, start:"01:00", end:"02:00"}) === 60);
  verify("Pas de faux chevauchement avant minuit", BG.overlap({date, start:"19:45", end:"00:00"}, {date, start:"01:00", end:"02:00"}) === 0);
  const test = empty_(); test.config.date_debut="2027-06-29";test.config.date_fin="2027-07-04";
  test.shifts=[{id:"Je2",date,start:"19:45",end:"00:00"},{id:"Je3",date,start:"00:00",end:"04:00"}];
  renumJournee_(test,date);
  verify("C3 de fin de soirée", test.shifts[1].c3 && !test.shifts[0].c3);
  verify("Jour choisi vers date", dateDuJourEdition_(test,"jeudi")===date);
  verify("Dates hors édition refusées", jourDeDate_(test,"2027-08-01")==="");
  verify("Stockage médias initialisé", Array.isArray(s.uploads));
  const result = { build:BUILD, checks, counts:{people:s.people.length,shifts:s.shifts.length,concerts:s.concerts.length,vehicles:s.vehicles.length,publications:s.publications.length}, readOnly:true };
  console.log(JSON.stringify(result));
  return result;
}



// Import non destructif des réponses de REPONSES_FORMULAIRE pour la simulation.
// Les formulaires enregistrés dans l'application restent inchangés.
function simulationDepuisReponsesSheet_(s) {
  const sh = ss_().getSheetByName("REPONSES_FORMULAIRE");
  if (!sh || sh.getLastRow() < 2) return s;
  const data = sh.getDataRange().getDisplayValues();
  const headers = data.shift().map(x => String(x).trim().toLowerCase());
  const required = ["benevole_id","date","choix_1","choix_2","contrainte_pro","confirmation_pro","concerts_ids","binomes_ids","missions_ids","confirmation_chevauchement","statut"];
  if (required.some(k => !headers.includes(k))) throw Error("REPONSES_FORMULAIRE : colonnes manquantes");
  const get = (r,k) => String(r[headers.indexOf(k)] || "").trim();
  const split = x => String(x || "").split(/[;,|]/).map(v => v.trim()).filter(Boolean);
  const accepted = new Set(["reçu","recu","validé","valide"]);
  const grouped = new Map();
  for (const row of data) {
    const id = get(row,"benevole_id"), date = get(row,"date");
    if (!id && !date) continue;
    if (!accepted.has(get(row,"statut").toLowerCase())) continue;
    if (!s.people.some(p => String(p.id) === id && BG.active(p))) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("REPONSES_FORMULAIRE : date invalide pour " + id);
    if (!grouped.has(id)) grouped.set(id, {id,personId:id,status:"Reçu",choices:[],concerts:[],partners:[],missions:[],confirmOrange:false,version:1});
    const f = grouped.get(id);
    if (f.choices.some(c => c.date === date)) throw Error("REPONSES_FORMULAIRE : doublon " + id + " / " + date);
    f.choices.push({date,first:get(row,"choix_1"),second:get(row,"choix_2"),work:BG.yes(get(row,"contrainte_pro")),confirmWork:BG.yes(get(row,"confirmation_pro"))});
    for (const [key,col] of [["concerts","concerts_ids"],["partners","binomes_ids"],["missions","missions_ids"]])
      for (const value of split(get(row,col))) if (!f[key].includes(value)) f[key].push(value);
    f.confirmOrange = f.confirmOrange || BG.yes(get(row,"confirmation_chevauchement"));
    f.note = get(row,"note_formulaire") || f.note || "";
    f.startedAt = get(row,"debut_formulaire") || f.startedAt;
    f.submittedAt = get(row,"envoi_formulaire") || f.submittedAt;
  }
  if (!grouped.size) return s;
  const forms = (s.forms || []).filter(f => !grouped.has(String(f.personId)));
  forms.push(...grouped.values());
  return {...s,forms};
}


function statistiquesReponsesSheet_(s) {
  const sh = ss_().getSheetByName("REPONSES_FORMULAIRE");
  if (!sh) throw Error("Feuille REPONSES_FORMULAIRE introuvable");
  if (sh.getLastRow() < 2) return {received:0,receivedIds:[]};
  const data = sh.getDataRange().getDisplayValues();
  const headers = data.shift().map(x => String(x).trim().toLowerCase());
  const idCol = headers.indexOf("benevole_id");
  const statusCol = headers.indexOf("statut");
  if (idCol < 0 || statusCol < 0) throw Error("REPONSES_FORMULAIRE : colonnes benevole_id ou statut manquantes");
  const active = new Set((s.people || []).filter(p => BG.active(p) && p.status !== "Désisté").map(p => String(p.id)));
  const received = new Set();
  for (const row of data) {
    const id = String(row[idCol] || "").trim();
    const status = String(row[statusCol] || "").trim().toLowerCase();
    if (active.has(id) && ["reçu","recu","validé","valide"].includes(status)) received.add(id);
  }
  return {received:received.size,receivedIds:Array.from(received).sort()};
}

/* Private integration with Vehicles. These tabs contain only authorized identities.
   They stay private: Vehicles reads them as the same Google account, not through a public feed. */
function vehicleEligible_(p){return !!p&&!p.deleted&&p.status!=='Désisté'&&p.status!=='Absent'}
function syncVehicleAccess_(s){
 const ss=ss_(),props=PropertiesService.getScriptProperties();
 for(const spec of [['BG_CONTROLEURS_VEHICULES',p=>p.vehicleControl===true],['BG_REFERENTS_VEHICULES',p=>p.role==='referent']]){
  const people=s.people.filter(p=>vehicleEligible_(p)&&spec[1](p)).map(p=>({id:p.id,first:String(p.firstName||'').trim(),last:String(p.lastName||'').trim()})).sort((a,b)=>a.id.localeCompare(b.id));
  const fingerprint=hash_(JSON.stringify(people)),key='VEHICLES_EXPORT_'+spec[0];let sheet=ss.getSheetByName(spec[0]);if(sheet&&props.getProperty(key)===fingerprint)continue;if(!sheet)sheet=ss.insertSheet(spec[0]);
  const safe=x=>/^[=+@-]/.test(x)?"'"+x:x;const values=[['id','prenom','nom'],...people.map(p=>[p.id,safe(p.first),safe(p.last)])];while(values.length<sheet.getLastRow())values.push(['','','']);sheet.getRange(1,1,values.length,3).setValues(values);props.setProperty(key,fingerprint);
 }
}
function vehicleIdentity_(s,u){const person=s.people.find(p=>p.id===(u.personId||u.id));if(!vehicleEligible_(person)||person.vehicleControl!==true)throw Error('Contrôle véhicule non autorisé');syncVehicleAccess_(s);const ticket=Utilities.getUuid()+Utilities.getUuid(),hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,ticket,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');const ss=ss_();let sh=ss.getSheetByName('BG_VEHICULES_LIAISONS');if(!sh){sh=ss.insertSheet('BG_VEHICULES_LIAISONS');sh.appendRow(['empreinte','identite']);}sh.appendRow([hash,JSON.stringify({personId:person.id,expires:Date.now()+600000,usedBy:null})]);return {ticket,url:'https://runner-fb.github.io/beauregard-vehicules/'};}
function configureVehicleIntegration(){const lock=LockService.getScriptLock();lock.waitLock(30000);try{syncVehicleAccess_(load_());}finally{lock.releaseLock();}}
