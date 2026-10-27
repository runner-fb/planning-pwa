/* Beauregard V2 — app.js (socle, Équipe, Créneaux, Concerts, Préparation)
 * Transport = fetch GET JSON, repris de la V1.
 * Queue = file d'actions hors ligne (IndexedDB, point 62 du cahier des charges).
 *
 * Synchronisation : le serveur renvoie un paquet complet au premier appel,
 * puis seulement les éléments modifiés. L'application FUSIONNE ces paquets.
 *
 * Créneaux et Concerts : un seul écouteur de clic, posé sur #pageContent qui
 * existe en permanence. Il n'est jamais posé sur les boutons eux-mêmes :
 * les boutons sont détruits et recréés à chaque render().
 * L'enregistrement ne dépend plus de l'événement submit.
 *
 * SUPPRESSION : une action "remove", jamais un active:false.
 * La ligne est retirée par son id, rien d'autre.
 *
 * PRÉPARATION : quatre blocs dépliables, chacun s'enregistrant seul.
 * Voir renderSetup et saveSetupBloc pour la double nomenclature
 * lecture (bundle) / écriture (feuille CONFIG_EDITION).
 */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s).replace(
      /[&<>"']/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      }
    );
  };

  var ROLE = { benevole: "Bénévole", referent: "Référent", admin: "Organisation", vehicles: "Véhicules" };

  var ICON = {
    Accueil: "\u2302", "Mes créneaux": "\u25A6", Planning: "\u25A4", Contacts: "\u2663",
    Équipe: "\u2659", Véhicules: "\u25B0", Messages: "\u2709", Outils: "\u2699",
    "Préparation": "\u25F7", "Créneaux": "\u25F4", "Concerts": "\u266B",
    Formulaires: "\u25A7", Simulations: "\u27F3", Arbitrages: "\u25C7",
    Rotations: "\u21BB", Contrôles: "\u2713", Validation: "\u25C9", Publication: "\u2197", Terrain: "\u2316"
  };

  /* Navigation par parcours : les entrées pointent uniquement vers des écrans existants. */
  var NAV_GROUPS = {
    admin: [
      {title:"Pilotage",items:[["Tableau de bord","dashboard"]]},
      {title:"Préparer",items:[["Édition","setup"],["Véhicules","vehicles"],["Bénévoles","team"],["Créneaux","creneaux"],["Concerts","concerts"],["Formulaire","forms"]]},
      {title:"Organiser",items:[["Simulation","simulations"],["Planning final","planning"]]},
      {title:"Communiquer",items:[["Messages","messages"],["Contacts","contacts"]]}
    ],
    referent:[{title:"Mon festival",items:[["Accueil","home"],["Planning","planning"]]},{title:"Mon équipe",items:[["Équipe","team"],["Véhicules","vehicles"],["Contacts","contacts"]]}],
    benevole:[{title:"Mon festival",items:[["Accueil","home"],["Mes créneaux","myshifts"],["Planning","planning"],["Contacts","contacts"]]}],
    vehicles:[{title:"Logistique",items:[["Accueil","home"],["Véhicules","vehicles"]]}]
  };
  ['referent','benevole'].forEach(function(role){NAV_GROUPS[role].push({title:'Sur cet appareil',items:[['Synchronisation','syncstatus']]});});
  NAV_GROUPS.referent[1].items.push(['Terrain','terrain']);
  var NAV = Object.keys(NAV_GROUPS).reduce(function(out,role){
    out[role] = NAV_GROUPS[role].reduce(function(rows,g){return rows.concat(g.items);},[]);
    return out;
  },{});
  var NAV_MOBILE = {
    admin: [["Accueil", "dashboard"], ["Préparer", "prepare"], ["Organiser", "simulations"]],
    referent: [["Accueil", "home"], ["Shift", "terrain"], ["Planning", "planning"], ["Équipe", "team"], ["Véhicules", "vehicles"]],
    benevole: [["Accueil", "home"], ["Mes créneaux", "myshifts"], ["Planning", "planning"], ["Contacts", "contacts"]],
    vehicles: [["Accueil", "home"], ["Véhicules", "vehicles"]]
  };

  var META = {
    syncstatus: ['SUR CET APPAREIL','Synchronisation','Version locale et actions à envoyer.'],
    prepare: ["PRÉPARER", "Préparer l’édition", "Les étapes avant de construire le planning."],
    dashboard: ["PILOTAGE DE L’ÉDITION", "Tableau de bord", "Avancement réel, indicateurs et prochaines actions."],
    home: ["MON FESTIVAL", "Accueil", "L'essentiel de ton engagement, disponible hors ligne."],
    myshifts: ["MON ENGAGEMENT", "Mes créneaux", "Tes missions, tes rôles et tes horaires."],
    planning: ["ORGANISER", "Planning final", "Publication, modifications et prise de connaissance."],
    contacts: ["CARNET D'ÉQUIPE", "Contacts", "Les personnes utiles pendant le festival."],
    team: ["ÉQUIPE", "Bénévoles", "Fiches, contraintes, groupes et accès de l'édition."],
    vehicles: ["LOGISTIQUE", "Véhicules", "Parc, états des lieux et incidents."],
    messages: ["INFORMATIONS", "Messages", "Consignes et actualités de l'équipe."],
    tools: ["ESPACE RÉFÉRENT", "Outils", "Accès aux modules de suivi."],
    setup: ["PRÉPARER", "Édition", "Paramètres, état et remise à zéro."],
    creneaux: ["CYCLE DE L'ÉDITION", "Créneaux", "Horaires, effectifs et journées de l'édition."],
    concerts: ["PROGRAMMATION", "Concerts", "Artistes, scènes et horaires de passage."],
    forms: ["PRÉPARER", "Formulaire", "Ouverture, envois et réponses depuis Sheets."],
    simulations: ["ORGANISER", "Simulation", "Une seule simulation en cours, à contrôler avant publication."],
    arbitrations: ["DÉCISIONS", "Arbitrages", "Traiter les points à décider."],
    rotations: ["ÉQUILIBRE", "Rotations", "Répartition Conducteur / Chargeur."],
    checks: ["QUALITÉ", "Contrôles", "Repérer et résoudre les anomalies."],
    validation: ["AVANT PUBLICATION", "Validation", "Dernières vérifications du planning."],
    publication: ["MISE EN LIGNE", "Publication", "Publier la version retenue."],
    form: ["DISPONIBILITÉS", "Mon formulaire", "Choix de créneaux et concerts."],
    terrain: ["PENDANT LE FESTIVAL", "Suivi terrain", "Créneaux et changements sur place."]
  };

  var COLLECTIONS = [
    "people", "access", "shifts", "missions", "concerts", "forms", "simulations",
    "assignments", "rotations", "arbitrations", "terrain", "vehicles",
    "receptions", "incidents", "messages", "reads", "publications",
    "conflicts", "amendments", "deliveries"
  ];

  var state = {
    user: null, role: "", data: null, page: "home", version: 0, pending: 0,
    syncError: "", lastSyncAt: 0, syncing: false, personId: "", shiftMode: "", shiftId: "", concertMode: "", concertId: "", open: ""
  };
  var CACHE_KEY = "planning_v2_bundle";
  var BOOT = window.Boot || null;
  var writeBusy = false;

  function bootDone() { if (BOOT && BOOT.done) BOOT.done(); else hideBoot(); }
  function bootFail(m) { if (BOOT && BOOT.fail) BOOT.fail(m); else { hideBoot(); showLogin(); } }
  function bootSkip() { if (BOOT && BOOT.skip) BOOT.skip(); else hideBoot(); }
  function hideBoot() { var b = $("#bootScreen"); if (b) b.classList.add("hidden"); }
  function showLogin() { var l = $("#loginScreen"); if (l) l.classList.remove("hidden"); }

  function saveLocal() {
    if(state.testMode)return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), uiVersion: 3, version: state.version, lastSyncAt: state.lastSyncAt, role: state.role, authRole: state.authRole || state.role, data: state.data }));
    } catch (e) { throw new Error("Stockage local indisponible : les données ne sont pas garanties après fermeture."); }
  }
  function readLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return raw && raw.data ? raw : null;
    } catch (e) { return null; }
  }

  var keyOf = function (k, row) {
    if (!row) return "";
    return k === "access" ? row.personId : row.id;
  };

  function mergeBundle(bundle) {
    if (!bundle) return state.data || {};
    var current = state.data || {};

    if (bundle.full === true || !current.config) {
      var fresh = { config: bundle.config || current.config || {}, user: bundle.user || current.user || {} };
      COLLECTIONS.forEach(function (k) { fresh[k] = bundle[k] || []; });
      if (bundle.responseStats) fresh.responseStats = bundle.responseStats;
      return fresh;
    }

    var next = { config: bundle.config || current.config, user: bundle.user || current.user, responseStats: bundle.responseStats || current.responseStats || null };
    COLLECTIONS.forEach(function (k) {
      var received = bundle[k];
      var hasIds = bundle.ids && Object.prototype.hasOwnProperty.call(bundle.ids, k);
      if (received === undefined && !hasIds) { next[k] = current[k] || []; return; }

      var byKey = {};
      (current[k] || []).forEach(function (row) { var id = keyOf(k, row); if (id) byKey[id] = row; });
      (received || []).forEach(function (row) { var id = keyOf(k, row); if (id) byKey[id] = row; });
      if (hasIds) {
        var keep = {};
        (bundle.ids[k] || []).forEach(function (id) { if (byKey[id]) keep[id] = byKey[id]; });
        byKey = keep;
      }
      next[k] = Object.keys(byKey).map(function (id) { return byKey[id]; });
    });
    return next;
  }

  function notice(msg,type){
    var n=$('#appNotice'),t=$('#noticeText');if(!n)return;
    (t||n).textContent=msg;n.dataset.type=type||'info';n.classList.remove('hidden');
    clearTimeout(notice.t);
    if(type==='success')notice.t=setTimeout(function(){n.classList.add('hidden');},10000);
  }

  function syncBadge() {
    var el = $("#connectionText");
    if (!el) return;
    var text, kind;
    if (!navigator.onLine) {
      text = state.pending ? "Hors ligne · " + state.pending + " modification(s) en attente" : "Hors ligne · données disponibles";
      kind = "offline";
    } else if (state.syncing) {
      text = "Synchronisation en cours · consultation disponible"; kind = "busy";
    } else if (state.syncError) {
      text = "Synchronisation échouée · " + state.syncError; kind = "bad";
    } else if (state.pending) {
      text = state.pending + " modification(s) en attente";
      kind = "busy";
    } else {
      text = "Réseau disponible";
      kind = "ok";
    }
    if(state.role){
      text=!navigator.onLine?'Hors ligne':state.syncing?'↻ Synchronisation…':state.syncError?'⚠ Échec de synchronisation':state.lastSyncAt?'✓ Synchronisé · '+new Date(state.lastSyncAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Synchronisation nécessaire';
      if(state.pending)text+=' · '+state.pending+' envoi'+(state.pending>1?'s':'')+' en attente';
    }else{
      var pub=state.data&&AdminUX.latest(state.data);
      text+=' · '+(pub?'Planning V'+pub.number:'Publication non renseignée')+' · Données V'+state.version;
      text+=state.lastSyncAt?' · Synchro réussie le '+new Date(state.lastSyncAt).toLocaleString('fr-FR'):' · Synchronisation non vérifiée';
    }
    var detail=$('#volunteerSyncDetails');
    if(!detail&&$('#mobileSyncStatus')){detail=document.createElement('button');detail.id='volunteerSyncDetails';detail.className='quiet-button';detail.textContent='Détails';detail.onclick=function(){go('syncstatus');};$('#mobileSyncStatus').appendChild(detail);}
    if(detail)detail.hidden=!(state.pending||state.syncError);
    if(state.testMode)text='Mode test · données locales · '+new Date(appNow()).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    el.textContent = text;
    var mobile=$("#mobileConnectionText");if(mobile)mobile.textContent=text;
    var status=$("#mobileSyncStatus");if(status)status.dataset.kind=kind;
    if (el.parentElement) el.parentElement.dataset.kind = kind;
  }

  function refreshPending() {
    if (!window.Queue) return Promise.resolve(0);
    return Queue.list().then(function(rows){state.retryablePending=rows.filter(function(r){return r.authorId===(state.user||{}).id&&r.state==='pending';}).length;state.pendingReads={};state.pendingMessageReads={};fleetPending={};rows.filter(function(r){return r.authorId===(state.user||{}).id&&['pending','blocked','conflict'].includes(r.state);}).forEach(function(r){var p=r.payload||{};if(r.action==='incident'&&p.vehicleId)fleetPending[p.vehicleId]=Object.assign({},fleetPending[p.vehicleId],p.type==='Plein à faire'?{fuel:true}:{panne:true});if(r.action==='vehicleAvailability')fleetPending[p.vehicleId]=Object.assign({},fleetPending[p.vehicleId],{active:p.active});});rows.filter(function(r){return r.authorId===(state.user||{}).id&&r.action==='read'&&r.state==='pending';}).forEach(function(r){var id=(r.payload||{}).messageId||'';state.pendingMessageReads[id]=true;if(id.indexOf('publication-')===0)state.pendingReads[id.slice(12)]=true;});return Queue.count();}).then(function (n) { state.pending = n; syncBadge(); return n; }).catch(function (e) {state.syncError='File locale inaccessible : '+e.message;syncBadge();throw e;});
  }

  function selfPersonId(){
    if((state.authRole||state.role)!=='admin')return (state.user||{}).id;
    var matches=((state.data||{}).people||[]).filter(function(p){return !p.deleted&&String(p.firstName).trim().toLowerCase()==='anthony'&&String(p.lastName).trim().toLowerCase()==='bodereau';});
    return matches.length===1?matches[0].id:(state.user||{}).id;
  }
  function viewData(){
    var source=state.data||{},d=Object.assign({},source,{messages:(source.messages||[]).filter(function(m){return !isVehicleMessage(m)||state.role==='referent';})});if(state.authRole!=='admin'||state.role==='admin')return d;
    var pub=AdminUX.latest(d),snapshot=pub&&pub.snapshot||{},id=selfPersonId();
    var out=Object.assign({},d,{assignments:snapshot.assignments||[],rotations:snapshot.rotations||[]});
    if(state.role==='benevole')out.messages=(d.messages||[]).filter(function(m){var t=m.targets||{};return t.all||t.volunteers||(t.people||[]).includes(id)||(out.assignments||[]).some(function(a){return a.personId===id&&(t.shifts||[]).includes(a.shiftId);})||(out.rotations||[]).some(function(r){return r.personId===id&&(t.roles||[]).includes(r.role);});});
    return out;
  }
  function identityHeader(){
    var admin=(state.authRole||state.role)==='admin',label=$('#userLabel'),host=$('#identityExtras');
    if(!host){host=document.createElement('div');host.id='identityExtras';label.parentElement.insertBefore(host,label.nextSibling);}
    label.textContent=admin?'Anthony':(state.user||{}).name||'Mon espace';
    host.innerHTML=admin?'<div class="view-switch" role="group" aria-label="Choisir la vue">'+[['admin','Admin'],['referent','Référent'],['benevole','Bénévole'],['fleetadmin','Véhicules (admin)']].map(function(x){return '<button type="button" data-view-role="'+x[0]+'" aria-pressed="'+((state.adminVehicleView?'fleetadmin':state.role)===x[0])+'">'+x[1]+'</button>';}).join('')+'</div><div class="test-controls"><label><input id="testModeSwitch" type="checkbox" '+(state.testMode?'checked':'')+'> Version test</label>'+(state.testMode?'<button type="button" id="testClock" aria-label="Régler le jour et l’heure fictifs">◷</button>':'')+'</div>':state.role==='referent'?'<small>Référent</small>':'';
    document.body.classList.toggle('runner-header',admin||['referent','benevole'].includes(state.role));
    host.querySelectorAll('[data-view-role]').forEach(function(b){b.onclick=function(){if(!canLeave()||b.dataset.viewRole===(state.adminVehicleView?'fleetadmin':state.role))return;state.adminVehicleView=b.dataset.viewRole==='fleetadmin';state.role=state.adminVehicleView?'admin':b.dataset.viewRole;state.page=state.adminVehicleView?'vehicles':state.role==='admin'?'dashboard':'home';state.personId='';state.vehicleId='';saveLocal();nav();setTitle();syncBadge();render();};});
  }
  function isVehicleMessage(m){return m.audience==='referents'||String(m.id||'').indexOf('vehicle-alert-')===0;}
  function setTitle() {
    identityHeader();
    document.body.classList.toggle('volunteer-space',['benevole','referent'].includes(state.role));
    document.body.classList.toggle('admin-space',state.role==='admin');
    wireTestControls();
    document.body.classList.toggle('referent-space',state.role==='referent');
    document.body.dataset.currentPage=state.page;
    var m = META[state.page] || META.home;
    $("#pageEyebrow").textContent = m[0];
    $("#pageTitle").textContent = m[1];
    $("#pageSubtitle").textContent = m[2];
    $("#pageCrumb").textContent = m[1];
    document.title = m[1] + " — Beauregard";
  }

  function nav() {
    var groups = NAV_GROUPS[state.role] || NAV_GROUPS.benevole;
    var current = state.page;
    var make = function(it, cls) {
      var active = current === it[1];
      return '<button type="button" class="'+(cls||'nav-link')+(active?' active':'')+'" data-page="'+it[1]+'"'+
        (active?' aria-current="page"':'')+'><span class="nav-icon" aria-hidden="true">'+
        (ICON[it[0]] || (it[1]==='dashboard'?'⌂':it[1]==='setup'?'◷':it[1]==='creneaux'?'◴':'•'))+
        '</span><span>'+esc(it[0])+'</span></button>';
    };
    var dn = $("#desktopNav");
    if (dn) dn.innerHTML = groups.map(function(g){
      return '<div class="nav-group-label">'+esc(g.title)+'</div>'+g.items.map(function(it){return make(it);}).join('');
    }).join('');
    var mn = $("#mobileNav");
    if (mn) {
      var primary = NAV_MOBILE[state.role] || NAV_MOBILE.benevole;
      mn.innerHTML = primary.map(function(it){return make(it);}).join('')+
        (['benevole','referent'].includes(state.role)?'':'<button type="button" class="nav-more" id="navMore" aria-expanded="false" aria-controls="navDrawer" aria-label="Ouvrir toutes les rubriques"><span class="nav-icon" aria-hidden="true">☰</span><span>Menu</span></button>');
      var more = $("#navMore");
      if (more) more.onclick = toggleMore;
    }
    wireNav();
  }

  function closeNavDrawer() {
    var drawer = $("#navDrawer");
    if (drawer) drawer.remove();
    var more = $("#navMore");
    if (more) more.setAttribute('aria-expanded','false');
  }

  function toggleMore() {
    var more = $("#navMore");
    if (!more) return;
    if (more.getAttribute('aria-expanded') === 'true') {closeNavDrawer();more.focus();return;}
    closeNavDrawer();
    var groups = NAV_GROUPS[state.role] || NAV_GROUPS.benevole;
    var drawer = document.createElement('div');
    drawer.id = 'navDrawer';
    drawer.className = 'nav-drawer nav-drawer-v2';
    drawer.setAttribute('role','dialog');
    drawer.setAttribute('aria-label','Toutes les rubriques');
    drawer.innerHTML = '<div class="nav-drawer-head"><b>Navigation</b><button type="button" id="closeNavDrawer" aria-label="Fermer le menu">✕</button></div>'+
      groups.map(function(g){return '<div class="nav-drawer-section"><div class="nav-drawer-heading">'+esc(g.title)+'</div>'+g.items.map(function(it){
        return '<button type="button" class="nav-drawer-link'+(state.page===it[1]?' active':'')+'" data-page="'+it[1]+'"'+(state.page===it[1]?' aria-current="page"':'')+'><span class="nav-icon" aria-hidden="true">'+(ICON[it[0]]||'•')+'</span><span>'+esc(it[0])+'</span></button>';
      }).join('')+'</div>';}).join('');
    $("#appShell").appendChild(drawer);
    more.setAttribute('aria-expanded','true');
    $("#closeNavDrawer").onclick = function(){closeNavDrawer();more.focus();};
    wireNav();
    $("#closeNavDrawer").focus();
  }

  function installNavigationStyles() {
    if (document.getElementById('bg-nav-v2-style')) return;
    var style=document.createElement('style');
    style.id='bg-nav-v2-style';
    style.textContent = '.bg-day-fold>summary{cursor:pointer;font-weight:800;padding:12px 4px}.bg-day-fold>.card{margin-top:12px}.bg-day-fold>summary::marker{color:var(--primary)}#bg-busy-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:24px}.bg-busy-card{display:flex;flex-direction:column;align-items:center;gap:12px;padding:28px;border-radius:18px;background:var(--surface);color:var(--text);text-align:center;max-width:380px}.bg-busy-card small{color:var(--muted)}.bg-busy-spinner{height:42px;width:42px;border-radius:50%;border:4px solid var(--border);border-top-color:var(--primary);animation:bgspin .75s linear infinite}@keyframes bgspin{to{transform:rotate(360deg)}}'+
      '.desktop-nav .nav-group-label{padding:8px 12px 3px;margin-top:12px;font-size:11px;letter-spacing:.11em;text-transform:uppercase;opacity:.65;font-weight:800}'+
      '.desktop-nav .nav-link{min-height:42px;width:100%}.desktop-nav .nav-link:focus-visible,.nav-drawer-v2 button:focus-visible,.mobile-nav button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}'+
      '.nav-drawer-v2{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom,0px));max-height:min(72vh,650px);overflow-y:auto;overscroll-behavior:contain;background:var(--surface);border:1px solid var(--border);border-radius:18px;box-shadow:0 12px 38px #0005;padding:14px;z-index:90}'+
      '.nav-drawer-v2 .nav-drawer-head{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 10px;position:sticky;top:-14px;background:var(--surface);z-index:1}'+
      '.nav-drawer-v2 .nav-drawer-head button{border:0;border-radius:10px;padding:9px 14px;background:var(--background);color:var(--text);font:inherit}'+
      '.nav-drawer-v2 .nav-drawer-heading{font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:var(--muted);padding:14px 10px 5px}'+
      '.nav-drawer-v2 .nav-drawer-link.active{background:var(--background);color:var(--primary)}'+
      '.mobile-nav .nav-link,.mobile-nav .nav-more{min-width:0}'+
      '@media(min-width:900px){.nav-drawer-v2{display:none}.desktop-nav{overflow-y:auto;min-height:0}.side-rail{position:sticky;top:0;height:100vh;overflow:hidden}.side-bottom{flex-shrink:0}}';
    document.head.appendChild(style);
  }
  installNavigationStyles();
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && $("#navDrawer")){closeNavDrawer();var b=$("#navMore");if(b)b.focus();}});

  function wireNav() {
    Array.prototype.forEach.call(document.querySelectorAll("button[data-page], a[data-page]"), function (b) {
      b.onclick = function () { var section=b.dataset.openSetup; go(b.dataset.page); if(section && state.page === "setup") {state.open=section;render();var el=document.querySelector("[data-setup=\""+section+"\"]");if(el)el.scrollIntoView({block:"start",behavior:"smooth"});} };
    });
  }

  function go(key) {
    if(!canLeave())return;
    closeNavDrawer();
    if ((state.role !== "admin" && ["setup", "creneaux"].indexOf(key) >= 0) || (state.role === "benevole" && ["team", "terrain"].indexOf(key) >= 0)) { notice("Accès réservé à l’organisation.", "error"); return; }
    if(key!=='vehicles')state.adminVehicleView=false;
    state.page = key;

    if (key === "form" && navigator.onLine && !(state.data.forms || []).some(function(f){return f.personId === state.user.id;})) {
      onlineAction("formStart", {personId:selfPersonId()}).catch(function(e){notice(e.message,"error");});
    }
    state.open = "";
    if (key !== "team") state.personId = "";
    if (key !== "creneaux") { state.shiftMode = ""; state.shiftId = ""; }
    if (key !== "concerts") { state.concertMode = ""; state.concertId = ""; }
    nav();
    setTitle();
    render();
  }

  function card(title, body) {
    return '<article class="card"><h2>' + esc(title) + "</h2>" + body + "</article>";
  }
  function empty(title, text) {
    return '<div class="empty"><b>' + esc(title) + "</b>" + esc(text) + "</div>";
  }
  function listRow(main, sub, badge, kind) {
    return '<div class="list-row"><div class="list-main"><b>' + esc(main) + "</b>" +
      (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" +
      (badge ? '<span class="badge ' + (kind || "") + '">' + esc(badge) + "</span>" : "") + "</div>";
  }
  function personLabel(id) {
    var p = ((state.data && state.data.people) || []).filter(function (x) { return x.id === id; })[0];
    return p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "—";
  }
  function shift(id) {
    return ((state.data && state.data.shifts) || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  var viewMemory={}, renderedView='';
  function render() {
    var key=[state.testMode?'test':'real',state.role,state.page,state.personId||'',state.vehicleId||'',state.shiftMode,state.shiftId,state.concertMode,state.concertId,state.editFormPerson||''].join(':');
    if(renderedView){viewMemory[renderedView]={y:window.scrollY,open:Array.from(document.querySelectorAll('#pageContent details')).map(function(el){return el.open;})};}
    var memory=viewMemory[key];
    var oldScroll={};
    if(state.page==='simulations') document.querySelectorAll('.sim-day').forEach(function(el){var cols=el.querySelector('[data-sim-date]'),sc=el.querySelector('div');if(cols&&sc)oldScroll[cols.dataset.simDate]=sc.scrollLeft;});
    renderPage();
    renderedView=key;
    if(memory)document.querySelectorAll('#pageContent details').forEach(function(el,i){if(memory.open[i]!==undefined)el.open=memory.open[i];});
    requestAnimationFrame(function(){if(renderedView===key)window.scrollTo(0,memory?memory.y:0);});
    if(window.RunnerPhotos)RunnerPhotos.mount();
    var c=$('#pageContent');
    if(state.role==='admin'){
      if(state.page==='team'&&!state.personId&&c.querySelector('#teamSearch')) teamTools(c,state.data);
      if(state.data.config.validated&&['setup','vehicles','creneaux','concerts','team','forms'].includes(state.page)){c.insertAdjacentHTML('afterbegin','<aside class="notice">Le planning est validé. Pour modifier sa préparation, ouvre le planning et choisis « Rouvrir les modifications ». '+uxButton('Ouvrir le planning','planning')+'</aside>');wireNav();}
      
      if(state.page==='simulations')enhanceSimulation();
      if(['setup','vehicles','creneaux','concerts','team','forms'].includes(state.page)&&!state.personId&&!state.shiftMode&&!state.concertMode){
        c.insertAdjacentHTML('beforeend',nextStep(state.page));wireNav();
      }
      if(['creneaux','concerts'].includes(state.page)&&!state.shiftMode&&!state.concertMode){
        var b=document.createElement('button');b.className='button secondary';b.textContent=state.page==='creneaux'?'Marquer les créneaux vérifiés':'Marquer les concerts vérifiés';
        b.onclick=function(){var payload={};payload[state.page==='creneaux'?'creneaux_verifies':'concerts_verifies']=true;submitTask(b,function(){return onlineAction('config',payload);});};c.append(b);
      }
    }
    if(state.role==='admin'&&['setup','vehicles','team','forms'].includes(state.page)&&!state.personId&&!state.vehicleId&&!(state.page==='team'&&state.open)){c.insertAdjacentHTML('afterbegin',uxButton('‹ Préparer','prepare'));wireNav();}
    if(state.page==='simulations')document.querySelectorAll('.sim-day').forEach(function(el){var cols=el.querySelector('[data-sim-date]'),sc=el.querySelector('div');if(cols&&sc&&oldScroll[cols.dataset.simDate]!=null)sc.scrollLeft=oldScroll[cols.dataset.simDate];});
  }

  function renderPage() {
    var c = $("#pageContent");
    if (!c) return;
    var d = viewData();
    var p = state.page;
    if (p === "syncstatus") return renderSyncStatus(c);
    if (p === "prepare") return renderPreparation(c,d);
    if (p === "dashboard") return renderAdminDashboard(c, d);
    if (p === "home") {renderHome(c, d);return showPublicationPopup(d);}
    if (p === "team") return renderTeam(c, d);
    if (p === "creneaux") return renderCreneaux(c, d);
    if (p === "concerts") return renderConcerts(c, d);
    if (p === "myshifts") {renderMyShifts(c, d);return showPublicationPopup(d);}
    if (p === "planning") return renderPlanning(c, d);
    if (p === "simulations") return renderSimulationPage(c,d);
    if (p === "forms") return renderFormsPage(c,d);
    if (p === "contacts") return renderContacts(c, d);
    if (p === "terrain") return renderTerrain(c, d);
    if (p === "form") return renderVolunteerForm(c, d);
    if (p === "messages") return renderMessages(c, d);
    if (p === "vehicles") return renderVehicles(c, d);
    if (p === "setup") return renderSetup(c, d);
    c.innerHTML = empty("Module en préparation", "Cet écran sera branché à l'étape suivante.");
  }

  function showPublicationPopup(d){
    if(state.role==='admin'||state.role==='vehicles')return;
    var pubs=activeRows(d,'publications');
    var pending=pubs.filter(function(p){return p.mode!=='draft'&&(!p.affectedIds||p.affectedIds.indexOf((state.user||{}).id)>=0);}).filter(function(p){return !(d.reads||[]).some(function(r){return r.messageId==='publication-'+p.id&&r.personId===(state.user||{}).id;});});
    var pub=pending.sort(function(a,b){return Number(a.number||0)-Number(b.number||0);})[0];
    if(pub&&state.pendingReads&&state.pendingReads[pub.id])return;
    if(!pub){var draft=pubs.filter(function(p){return p.mode==='draft';}).sort(function(a,b){return Number(b.number||0)-Number(a.number||0);})[0];if(draft){try{if(sessionStorage.getItem('bg-draft-seen-'+draft.id)!=='1')pub=draft;}catch(e){pub=draft;}}}
    var root=$('#modalRoot');if(!pub||!root||root.querySelector('#pubAckModal'))return;
    var isDraft=pub.mode==='draft',change=pub.changeType==='targeted'||pub.changeType==='general';
    root.innerHTML='<div class="pub-ack-backdrop"><section class="pub-ack-panel" role="dialog" aria-modal="true" aria-labelledby="pubAckTitle"><h2 id="pubAckTitle">'+(isDraft?'Planning provisoire':change?'Ton planning a changé':'Ton planning est disponible !')+'</h2><p>'+(isDraft?'Voici une première version de ton planning. Elle peut encore changer.':change?'Une nouvelle version de ton planning a été publiée. Consulte les modifications.':'Le planning définitif de Beauregard vient d’être publié. Tu peux consulter tes jours, horaires et missions.')+'</p><label class="check"><input type="checkbox" id="pubAckCheck">J’ai pris connaissance '+(isDraft?'du caractère provisoire de mon planning.':change?'de la modification de mon planning.':'de la publication de mon planning.')+'</label><button type="button" class="button primary" id="pubAckConfirm" disabled>J’ai compris</button><p class="muted">Cette confirmation ne vaut pas acceptation de tes affectations.</p><button type="button" class="button secondary" id="pubLater">Consulter d’abord mon planning</button></section></div>';
    $('#pubLater').onclick=function(){root.innerHTML='';go('planning');};
    var checkbox=$('#pubAckCheck'),btn=$('#pubAckConfirm');checkbox.onchange=function(){btn.disabled=!checkbox.checked;};
    btn.onclick=function(){if(isDraft){try{sessionStorage.setItem('bg-draft-seen-'+pub.id,'1');}catch(e){}root.innerHTML='';return;}submitTask(btn,function(){return terrainAction('read',{messageId:'publication-'+pub.id}).then(function(){state.pendingReads=state.pendingReads||{};state.pendingReads[pub.id]=true;root.innerHTML='';});});};
  }
  (function(){var style=document.createElement('style');style.textContent='.pub-ack-backdrop{position:fixed;inset:0;z-index:1000;background:#0009;display:grid;place-items:center;padding:18px}.pub-ack-panel{width:min(100%,470px);max-height:90vh;overflow:auto;border-radius:20px;background:var(--surface);color:var(--text);padding:24px;box-shadow:0 20px 70px #0005}.pub-ack-panel .button{width:100%;margin-top:18px}.pub-ack-panel .check{margin-top:18px}';document.head.appendChild(style);})();
  /* ---------- Équipe ---------- */
  function renderTeam(c, d) {
    var T = window.ScreenTeam;
    if (!T) { c.innerHTML = empty("Écran indisponible", "Le module Équipe n'est pas chargé."); return; }
    c.innerHTML = state.personId ? T.sheet({ data: d, role: state.role }, state.personId) : T.list({ data: d, role: state.role });
    if (state.role === "admin" && state.personId) {
      var p = (d.people || []).find(function(x){return String(x.id)===String(state.personId);});
      var form = c.querySelector("#personForm");
      if (p && form) {
        var escGroup = function(v){return String(v||"").replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
        var groups = {};
        (d.people||[]).forEach(function(x){if(x.mandatoryGroupId && !x.deleted){(groups[x.mandatoryGroupId]||(groups[x.mandatoryGroupId]=[])).push([x.firstName,x.lastName].filter(Boolean).join(' '));}});
        var choices = Object.keys(groups).sort().map(function(id){return '<option value="'+escGroup(id)+'">'+escGroup(id)+' — '+escGroup(groups[id].join(', '))+'</option>';}).join('');
        var el = document.createElement('div');el.className='full card';
        el.innerHTML='<h3>Groupe indivisible · Administration</h3><p>Les membres d’un même groupe seront affectés ensemble sur chaque journée. Un groupe ne peut pas être séparé par la simulation.</p><label>Groupe existant<select id="groupChoice"><option value="">Aucun groupe / saisir un nouveau</option>'+choices+'</select></label><label>Identifiant du groupe<input name="mandatoryGroupId" id="mandatoryGroupId" maxlength="48" placeholder="Ex. groupe-dupont" value="'+escGroup(p.mandatoryGroupId||'')+'"></label><p class="muted">Pour créer un groupe, renseigne le même identifiant dans chaque fiche puis enregistre. Pour le dissoudre, vide ce champ sur toutes les fiches.</p>';
        var note = form.querySelector('textarea[name="internalNote"]');
        var anchor = note && note.closest('.full');if(anchor)form.insertBefore(el,anchor);else form.appendChild(el);
        var select=el.querySelector('#groupChoice');select.value=p.mandatoryGroupId||'';
        select.onchange=function(){el.querySelector('#mandatoryGroupId').value=select.value;};
      }
    }
    wireTeam();
  }

  function wireTeam() {
    var T = window.ScreenTeam;
    if (!T) return;
    if(window.RunnerPhotos)RunnerPhotos.mount();

    var search = $("#teamSearch");
    if (search) {
      search.oninput = function () {
        T.setFilter(search.value);
        var c = $("#pageContent");
        c.innerHTML = T.list({ data: state.data || {}, role: state.role });
        wireTeam();
        if(state.role==='admin')teamTools(c,state.data);
        var again = $("#teamSearch");
        if (again) { again.focus(); }
      };
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-person]"), function (b) {
      b.onclick = function () {
        state.personId = String(b.dataset.person || "");
        render();
      };
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-team]"), function (b) {
      b.onclick = function () {
        var act = b.dataset.team;
        if (act === "access" || act === "access-one") { if (b.disabled) return; b.disabled = true; }
        if (act === "back") { state.personId = ""; render(); return; }
        if (act === "new") { openPersonForm(); return; }
        if (act === "remove") { removePerson(); return; }
        if (act === "access-one") { createAccessOne(b.dataset.id || state.personId); return; }
        if (act === "access") { createAccessBatch(); return; }
        if (act === "copy") { copyCodes(b.dataset.payload || ""); return; }
      };
    });

    var form = $("#personForm");
    if (form) {
      form.onsubmit = function (e) { e.preventDefault(); if (writeBusy) return; savePerson(form); };
    }
  }

  function openPersonForm() {
    if (state.role !== "admin") return;
    var c = $("#pageContent");
    c.innerHTML = window.ScreenTeam.blank();
    state.personId = "";
    wireTeam();
  }

  function savePerson(form) {
    var data = window.ScreenTeam.readForm(form);
    if (state.role === "admin" && form.elements.mandatoryGroupId) data.mandatoryGroupId = form.elements.mandatoryGroupId.value.trim();
    if (!data.lastName || !data.firstName) { notice("Nom et prénom obligatoires.", "error"); return; }

    if (state.role !== "admin") {
      var original = (state.data.people || []).find(function(p){return p.id===state.personId;});
      if (!original) { notice("Création réservée à l’Admin.", "error"); return; }
      data=Object.assign({},original,{status:data.status,internalNote:data.internalNote});
    }
    var row = data, base = null, baseVersion = 0;
    if (state.personId) {
      var old = (state.data.people || []).filter(function (x) { return x.id === state.personId; })[0];
      if (old) {
        row = Object.assign({}, old, data);
        row.id = old.id;
        base = old;
        baseVersion = old.version || 0;
      }
    } else {
      row.id = "p-" + Transport.requestId().slice(0, 8);
    }

    writeBusy = true;
    sendSave("people", row, baseVersion, base)
      .then(function (out) {
        row = out && out.row ? out.row : row;
        markClean();
        notice(out && out.queued ? "Fiche gardée hors ligne." : "Fiche enregistrée.", "success");
        state.data.people = (state.data.people || []).filter(function (x) { return x.id !== row.id; }).concat([row]);
        saveLocal();
        state.personId = row.id;
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); })
      .then(function () { writeBusy = false; });
  }

  function removePerson() {
    if (state.role !== "admin") return;
    var id = state.personId;
    if (!id) return;
    var p = (state.data.people || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!window.confirm("Supprimer la fiche de " + personLabel(id) + " ?\nLa personne sera retirée de la base active.")) return;
    var row = Object.assign({}, p, { deleted: true });
    sendSave("people", row, p.version || 0, p)
      .then(function () {
        state.data.people = (state.data.people || []).filter(function (x) { return x.id !== id; });
        saveLocal();
        state.personId = "";
        notice("Fiche supprimée.", "success");
        render();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); wireTeam(); });
  }

  function accessRow(personId, code, alreadyShown) {
    var p = (state.data.people || []).filter(function (x) { return x.id === personId; })[0];
    if (!p) return { nom: personId, prenom: "(fiche locale inconnue)", code: code || "", alreadyShown: !!alreadyShown };
    return { nom: p.lastName, prenom: p.firstName, code: code || "", alreadyShown: !!alreadyShown };
  }

  function createAccessOne(id) {
    if (state.role !== "admin") return;
    var target = String(id || state.personId || "");
    if (!target) { notice("Aucune fiche sélectionnée.", "error"); return; }

    Transport.mutate("access", { personId: target })
      .then(function (out) {
        var pid = (out && out.personId) || target;
        rememberAccess(pid);
        var code = (out && out.code) || "";
        var shown = !!(out && out.codeAlreadyShown);
        var c = $("#pageContent");
        c.innerHTML = window.ScreenTeam.accessResult([accessRow(pid, code, shown)]);
        wireTeam();
      })
      .catch(function (e) { notice(String(e.message || e), "error"); render(); });
  }

  function createAccessBatch() {
    if (state.role !== "admin") return;
    var people = (state.data.people || []).filter(function (p) { return !p.deleted && p.status !== "Désisté" && !(state.data.access||[]).some(function(a){return a.personId===p.id&&a.hasCode&&a.active;}); });
    if (!people.length) { notice("Tous les bénévoles actifs ont déjà un accès.", "error"); return; }
    if (!window.confirm("Créer les accès pour " + people.length + " personne(s) ?\nSeuls les accès manquants seront créés.")) return;

    var rows = [], failures = [];
    var chain = Promise.resolve();
    people.forEach(function (p) {
      chain = chain.then(function () {
        return Transport.mutate("access", { personId: p.id }).then(function (out) {
          var pid = (out && out.personId) || p.id;
          rememberAccess(pid);
          rows.push(accessRow(pid, (out && out.code) || "", !!(out && out.codeAlreadyShown)));
        }).catch(function (e) { failures.push(personLabel(p.id) + " : " + String(e.message || e)); });
      });
    });
    chain.then(function () {
      var c = $("#pageContent");
      c.innerHTML = window.ScreenTeam.accessResult(rows);
      wireTeam();
      if (failures.length) notice("Accès non créés : " + failures.join(" ; "), "error");
    });
  }

  function rememberAccess(id) {
    state.data.access = (state.data.access || []).filter(function (a) { return a.personId !== id; }).concat([{ personId: id, hasCode: true, active: true }]); saveLocal();
  }

  function copyCodes(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { notice("Liste copiée.", "success"); },
        function () { notice("Copie impossible sur cet appareil.", "error"); }
      );
    } else {
      notice("Copie impossible sur cet appareil.", "error");
    }
  }

  function foldDaySections(container){
    // Le module historique renvoie un titre suivi d'une carte par journée.
    // On les regroupe sans toucher aux boutons ni aux écouteurs délégués.
    var titles=Array.prototype.slice.call(container.querySelectorAll('.section-title'));
    titles.forEach(function(t){
      var next=t.nextElementSibling;
      if(!next||!next.classList.contains('card'))return;
      var detail=document.createElement('details');detail.className='card bg-day-fold';
      var summary=document.createElement('summary');summary.textContent=t.textContent||'Journée';
      detail.appendChild(summary);next.parentNode.insertBefore(detail,t);detail.appendChild(next);t.remove();
    });
  }
  /* ---------- Créneaux ---------- */
  function renderCreneaux(c, d) {
    if (state.role !== "admin") { c.innerHTML = empty("Accès réservé", "Gestion des shifts réservée à l’admin."); return; }
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Créneaux n'est pas chargé."); return; }
    if (!state.shiftMode) { c.innerHTML = S.shifts({ data: d }); foldDaySections(c); return; }
    c.innerHTML = S.shiftForm({ data: d }, state.shiftMode, state.shiftId);
  }

  /* ---------- Concerts ---------- */
  function renderConcerts(c, d) {
    if (state.role !== "admin") { c.innerHTML = concertPanel(d, true); wireNav(); return; }
    var S = window.ScreenShifts;
    if (!S) { c.innerHTML = empty("Écran indisponible", "Le module Concerts n'est pas chargé."); return; }
    if (!state.concertMode) { c.innerHTML = S.concerts({ data: d }); foldDaySections(c); return; }
    c.innerHTML = S.concertForm({ data: d }, state.concertMode, state.concertId);
  }

  /* ---------- Action déléguée des créneaux et concerts ---------- */
  function scenesAction(b) {
    if (state.role !== "admin") return;
    if (b.dataset.creneaux !== undefined) { if (!state.shiftMode) { go(state.role === "admin" ? "prepare" : "team"); return; } state.shiftMode = ""; state.shiftId = ""; render(); return; }
    if (b.dataset.concerts !== undefined) { if (!state.concertMode) { go("prepare"); return; } state.concertMode = ""; state.concertId = ""; render(); return; }
    if (b.dataset.newShift !== undefined) { state.shiftMode = "new"; state.shiftId = ""; render(); return; }
    if (b.dataset.newConcert !== undefined) { state.concertMode = "new"; state.concertId = ""; render(); return; }
    if (b.dataset.shift) { state.shiftMode = "edit"; state.shiftId = String(b.dataset.shift); render(); return; }
    if (b.dataset.concert) { state.concertMode = "edit"; state.concertId = String(b.dataset.concert); render(); return; }
    if (b.dataset.shiftReset !== undefined || b.dataset.concertReset !== undefined) {
      notice("Champs rechargés depuis les données enregistrées.", "info");
      render();
      return;
    }
    if (b.dataset.shiftRemove !== undefined) { removeShift(); return; }
    if (b.dataset.concertRemove !== undefined) { removeConcert(); return; }
  }

  function removeShift() {
    var s = (state.data.shifts || []).filter(function (x) { return x.id === state.shiftId; })[0];
    if (!s) return;
    if (!window.confirm("Supprimer le créneau " + (s.name || s.id) + " ?")) return;

    /* Meme regle que pour les concerts : suppression reelle par id.
     * On n'envoie jamais active:false pour simuler une suppression. */
    sendRemove("shifts", s.id).then(function () {
      state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== s.id; });
      saveLocal();
      state.shiftMode = "";
      state.shiftId = "";
      notice("Créneau supprimé.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function removeConcert() {
    var k = (state.data.concerts || []).filter(function (x) { return x.id === state.concertId; })[0];
    if (!k) return;
    if (!window.confirm("Supprimer le concert " + (k.artist || k.id) + " ?")) return;

    /* Suppression reelle : le serveur retire la ligne par son id et
     * renumeroie la programmation. On ne simule rien avec active:false. */
    sendRemove("concerts", k.id).then(function () {
      state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== k.id; });
      saveLocal();
      state.concertMode = "";
      state.concertId = "";
      notice("Concert supprimé.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); });
  }

  function saveShift(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    full.version = old ? old.version || 0 : 0;
    sendSave("shifts", full, old ? old.version || 0 : 0, old).then(function (out) {
      /* Le serveur est la source de verite : il calcule `day`, `order`,
       * `c3` et le libelle. Sa reponse remplace la copie locale, sinon
       * un creneau cree sans date garde une date vide et se retrouve
       * dans un groupe separe. */
      var definitif = (out && out.row) ? out.row : full;
      state.data.shifts = (state.data.shifts || []).filter(function (x) { return x.id !== definitif.id; }).concat([definitif]);
      saveLocal();
      state.shiftMode = "";
      state.shiftId = "";
      markClean();
      notice("Créneau " + full.id + " enregistré.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); }).then(function () { writeBusy = false; });
  }

  function saveConcert(row, old) {
    var full = old ? Object.assign({}, old, row) : row;
    if (!full.id) full.id = "co-" + Transport.requestId().slice(0, 8);
    full.version = old ? old.version || 0 : 0;
    sendSave("concerts", full, old ? old.version || 0 : 0, old).then(function (out) {
      /* Le serveur renvoie la ligne definitive, avec sa `date` deduite
       * du jour choisi. C'est ELLE qu'on garde : sans ca, un concert
       * cree arrive avec date vide et forme un second groupe « Mercredi »
       * a cote du vrai groupe « Mercredi 30/06 ». */
      var definitif = (out && out.row) ? out.row : full;
      state.data.concerts = (state.data.concerts || []).filter(function (x) { return x.id !== definitif.id; }).concat([definitif]);
      saveLocal();
      state.concertMode = "";
      state.concertId = "";
      markClean();
      notice("Concert enregistré.", "success");
      render();
    }).catch(function (e) { notice(String(e.message || e), "error"); }).then(function () { writeBusy = false; });
  }

  /* ------------------------------------------------------------------
   * ÉCOUTEUR UNIQUE DES CRÉNEAUX ET CONCERTS
   * Un seul écouteur, posé sur #pageContent qui existe en permanence.
   * Il n'est jamais posé sur un bouton : les boutons sont recréés à
   * chaque render(), un gestionnaire posé dessus ne survivrait pas.
   * L'enregistrement ne dépend pas de l'événement submit.
   * ------------------------------------------------------------------ */

  var SELECTEUR_ACTIONS = [
    "[data-creneaux]", "[data-concerts]",
    "[data-new-shift]", "[data-new-concert]",
    "[data-shift]", "[data-concert]",
    "[data-shift-reset]", "[data-concert-reset]",
    "[data-shift-remove]", "[data-concert-remove]",
    "[data-save-shift]", "[data-save-concert]"
  ].join(",");

  function actionsListener(e) {
    var b = e.target && e.target.closest ? e.target.closest(SELECTEUR_ACTIONS) : null;
    if (!b) return;
    var host = document.getElementById("pageContent");
    if (host && !host.contains(b)) return;
    e.preventDefault();

    if (b.dataset.saveShift !== undefined) { if (!writeBusy) handleShiftSave(); return; }
    if (b.dataset.saveConcert !== undefined) { if (!writeBusy) handleConcertSave(); return; }
    scenesAction(b);
  }

  function wirePageContent() {
    var host = document.getElementById("pageContent");
    if (!host) return;
    if (host.dataset.wired === "1") return;
    host.dataset.wired = "1";
    host.addEventListener("click", actionsListener);
  }

  /* Enregistrement d'un créneau : le mode est lu DANS le formulaire. */
  function handleShiftSave() {
    var f = document.getElementById("shiftForm");
    var S = window.ScreenShifts;
    if (!f || !S) { notice("Formulaire Créneaux indisponible.", "error"); return; }

    if (!f.reportValidity()) return;
    var row = S.readShift(f, { data: state.data });
    if (!row.id) { notice("Identifiant obligatoire (ex. Ma1).", "error"); return; }
    if (!row.start || !row.end) { notice("Horaires obligatoires.", "error"); return; }
    row.name = S.slotLabel(row.start, row.end, row.id);

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var existant = (state.data.shifts || []).filter(function (x) { return x.id === row.id; })[0];
    if (isNew && existant) { notice("Cet identifiant existe déjà.", "error"); return; }

    var old = isNew ? null : (state.data.shifts || []).filter(function (x) { return x.id === current; })[0];
    writeBusy = true;
    saveShift(row, old);
  }

  /* Enregistrement d'un concert : même principe. */
  function handleConcertSave() {
    var f = document.getElementById("concertForm");
    var S = window.ScreenShifts;
    if (!f || !S) { notice("Formulaire Concerts indisponible.", "error"); return; }

    if (!f.reportValidity()) return;
    var con = S.readConcert(f);
    if (!con.artist) { notice("Artiste obligatoire.", "error"); return; }
    if (!con.start || !con.end) { notice("Horaires obligatoires.", "error"); return; }

    var isNew = f.getAttribute("data-mode") === "new";
    var current = f.getAttribute("data-id") || "";
    var old = isNew ? null : (state.data.concerts || []).filter(function (x) { return x.id === current; })[0];
    writeBusy = true;
    saveConcert(con, old);
  }

  /* Installation de l'écouteur, une seule fois, dès que #pageContent existe. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePageContent);
  } else {
    wirePageContent();
  }

  /* ------------------------------------------------------------------
   * PRÉPARATION — LES GRANDES LIGNES DE L'ÉDITION
   *
   * Quatre blocs dépliables. Chaque bloc s'enregistre SEUL : on n'envoie
   * que ses champs, jamais la configuration entière. L'action serveur
   * "config" accepte les modifications partielles.
   *
   * DEUX NOMENCLATURES, UNE SEULE RÈGLE :
   *   en LECTURE  → les propriétés reçues dans le bundle :
   *                 year, name, phase, date_debut, date_fin,
   *                 vehiclesPlanned, reserveA, quotaMin, quotaMax,
   *                 formOpen, appOpen
   *   en ÉCRITURE → les clés de la feuille CONFIG_EDITION :
   *                 annee, nom_edition, phase, date_debut, date_fin,
   *                 vehicules_prevus, reserve_a, quota_min, quota_max,
   *                 formulaire_ouvert, app_ouverte
   * C'est asymétrique, et c'est voulu : le backend traduit à la lecture.
   * ------------------------------------------------------------------ */
  var PHASES = ["Préparation", "Migration à contrôler", "Test", "Active", "Formulaire ouvert", "Validé", "Réouvert", "Publié", "Archive"];

  /* Une date ISO pour un champ type=date : les dix premiers caractères. */
  function isoJour(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  /* Enregistrement d'UN bloc. On n'envoie que ses champs, sous les clés
   * attendues par la feuille CONFIG_EDITION. */
  function saveSetupBloc(id) {
    var host = document.getElementById("pageContent");
    if (!host) return;
    var ouvert = host.querySelector(".acc-body");
    if (!ouvert) { notice("Ouvre un bloc avant d'enregistrer.", "error"); return; }

    var champs = ouvert.querySelectorAll("input, select");
    var get = function (nom) {
      for (var i = 0; i < champs.length; i++) if (champs[i].name === nom) return champs[i];
      return null;
    };
    var val = function (nom) { var e = get(nom); return e ? String(e.value).trim() : ""; };
    var on = function (nom) { var e = get(nom); return !!(e && e.checked); };

    var charge = {};
    if (id === "edition") {
      var annee = val("annee");
      var d1 = val("date_debut"), d2 = val("date_fin");
      if (!/^\d{4}$/.test(annee)) { notice("L\u2019année doit comporter 4 chiffres.", "error"); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) {
        notice("Les deux dates sont obligatoires.", "error"); return;
      }
      if (d1 >= d2) { notice("Le premier jour doit précéder le dernier.", "error"); return; }
      charge = { annee: Number(annee), nom_edition: val("nom_edition"), date_debut: d1, date_fin: d2 };
    } else if (id === "planning") {
      var vp = Number(val("vehicules_prevus")), qmin = Number(val("quota_min")), qmax = Number(val("quota_max"));
      if (!isFinite(vp) || vp < 0) { notice("Nombre de véhicules invalide.", "error"); return; }
      if (!isFinite(qmin) || !isFinite(qmax) || qmin < 0 || qmax > 100) { notice("Quotas hors limites (0 à 100).", "error"); return; }
      if (qmin > qmax) { notice("Le quota minimal dépasse le maximal.", "error"); return; }
      charge = { vehicules_prevus: vp, quota_min: qmin, quota_max: qmax, reserve_a: on("reserve_a") };
    } else if (id === "ouvertures") {
      var close = val("date_cloture");
      if (close && !isFinite(new Date(close).getTime())) { notice("Date de clôture invalide.", "error"); return; }
      charge = { formulaire_ouvert: on("formulaire_ouvert"), date_cloture: close ? new Date(close).toISOString() : "", equipe_verifiee: on("equipe_verifiee"), creneaux_verifies: on("creneaux_verifies"), concerts_verifies: on("concerts_verifies") };
    } else {
      return;
    }

    var button=ouvert.querySelector('[data-setup-save]');
    submitTask(button,function(){return onlineAction('config',charge).then(function(){notice('Paramètres enregistrés.','success');});});
  }

  function renderSetup(c, d) {
    var cfg = d.config || {};
    var n = function (k) { return (d[k] || []).filter(function (x) { return !x.deleted; }).length; };
    var withCode = (d.access || []).filter(function (a) { return a.hasCode; }).length;
    var ouvre = function (id) { return state.open === id; };


    var entete = function (id, titre, resume) {
      return '<button type="button" class="acc-head" data-setup="' + id + '" aria-expanded="' + (ouvre(id) ? "true" : "false") + '">' +
        '<span class="acc-title">' + esc(titre) + "</span>" +
        '<span class="acc-sub">' + esc(resume) + "</span>" +
        '<span class="acc-arrow">' + (ouvre(id) ? "\u25B4" : "\u25BE") + "</span>" +
        "</button>";
    };

    var bloc = function (id, titre, resume, corps) {
      return '<article class="card acc">' + entete(id, titre, resume) +
        (ouvre(id) ? '<div class="acc-body">' + corps + "</div>" : "") + "</article>";
    };

    /* ---------- 1. ÉDITION ---------- */
    var blocEdition =
      '<div class="form-grid">' +
      '<div><label>Année<input name="annee" type="number" min="2000" max="2100" step="1" inputmode="numeric" value="' + esc(cfg.year || "") + '"></label></div>' +
      '<div><label>Nom de l\u2019édition<input name="nom_edition" value="' + esc(cfg.name || "") + '"></label></div>' +
      '<div><label>Premier jour<input name="date_debut" type="date" value="' + esc(isoJour(cfg.date_debut)) + '"></label></div>' +
      '<div><label>Dernier jour<input name="date_fin" type="date" value="' + esc(isoJour(cfg.date_fin)) + '"></label></div>' +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="edition">Enregistrer l\u2019édition</button></div>' +
      "</div>";

    /* ---------- 2. PARAMÈTRES PLANNING ---------- */
    var blocPlanning =
      '<div class="form-grid">' +
      '<div><label>Véhicules prévus<input name="vehicules_prevus" type="number" min="0" step="1" inputmode="numeric" value="' + esc(cfg.vehiclesPlanned || 0) + '"></label></div>' +
      '<div><label>Part Conducteur minimale (%)<input name="quota_min" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(cfg.quotaMin || 0) + '"></label></div>' +
      '<div><label>Part Conducteur maximale (%)<input name="quota_max" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(cfg.quotaMax || 0) + '"></label></div>' +
      '<div class="full contraintes">' +
      '<label class="check"><input type="checkbox" name="reserve_a"' + (cfg.reserveA === false ? "" : " checked") + "><span>Véhicule A réservé aux référents</span></label>" +
      "</div>" +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="planning">Enregistrer les paramètres</button></div>' +
      "</div>";

    /* ---------- 3. OUVERTURES ---------- */
    var closeDate = cfg.closeAt ? new Date(cfg.closeAt) : null;
    var validClose = closeDate && isFinite(closeDate.getTime());
    var localClose = validClose ? new Date(closeDate.getTime() - closeDate.getTimezoneOffset() * 60000).toISOString().slice(0,16) : "";
    var blocOuvertures =
      '<div class="form-grid">' +
      (cfg.closeAt && !validClose ? '<p class="full" role="alert">La date de clôture enregistrée est invalide. Renseigne une nouvelle date avant d’ouvrir le formulaire.</p>' : '') +
      '<div class="full"><label>Clôture du formulaire<input type="datetime-local" name="date_cloture" value="' + esc(localClose) + '"></label></div>' +
      '<div class="full contraintes">' +
      [ ["equipe_verifiee", "teamChecked", "Équipe vérifiée"], ["creneaux_verifies", "shiftsChecked", "Créneaux vérifiés"], ["concerts_verifies", "concertsChecked", "Concerts vérifiés"] ].map(function (x) { return '<label class="check"><input type="checkbox" name="' + x[0] + '"' + (cfg[x[1]] ? " checked" : "") + '><span>' + x[2] + '</span></label>'; }).join("") +
      '<label class="check"><input type="checkbox" name="formulaire_ouvert"' + (cfg.formOpen ? " checked" : "") + "><span>Formulaire ouvert aux bénévoles</span></label>" +
      "</div>" +
      '<div class="full modal-actions"><button type="button" class="button primary" data-setup-save="ouvertures">Enregistrer le formulaire</button></div>' +
      "</div>";

    /* ---------- 4. ÉTAT DE LA PRÉPARATION ---------- */
    var blocsEtat = [
      ["Équipe", n("people") + " fiche(s)", n("people") ? "good" : "bad"],
      ["Créneaux", n("shifts") + " créneau(x)", n("shifts") ? "good" : "bad"],
      ["Concerts", n("concerts") + " concert(s)", n("concerts") ? "good" : "bad"],
      ["Missions", n("missions") + " mission(s)", n("missions") ? "good" : ""],
      ["Véhicules prévus", cfg.vehiclesPlanned ? cfg.vehiclesPlanned + " véhicule(s)" : "à renseigner", cfg.vehiclesPlanned ? "good" : "bad"],
      ["Accès", withCode + " code(s) créé(s)", withCode ? "good" : "bad"],
      ["Formulaire", cfg.formOpen ? "ouvert" : "fermé", cfg.formOpen ? "good" : ""]
    ];
    var corpsEtat = blocsEtat.map(function (b) { return listRow(b[0], b[1], "", b[2]); }).join("") +
      "";

    c.innerHTML =
      '<div class="hero-card"><div><p class="eyebrow">' + esc(cfg.year || "") + "</p><h2>" +
      esc(cfg.name || "Beauregard") + "</h2><p>" + esc(cfg.phase || "Préparation") + "</p></div>" +
      '<span class="hero-date">V' + esc(state.version) + "</span></div>" +

      bloc("edition", "Édition", cfg.year ? "Année " + cfg.year : "à renseigner", blocEdition) +
      bloc("ouvertures", "Formulaire", (cfg.formOpen ? "Formulaire ouvert" : "Formulaire fermé"), blocOuvertures + formTracking(d)) +
      bloc("etat", "État de la préparation", "compteurs et accès", corpsEtat) +

      card("Ouverture terrain", "<p>État : "+(cfg.appOpen?"ouvert":"fermé")+". L’ouverture peut envoyer un email d’information à l’équipe.</p>"+'<button class="button secondary" id="toggleTerrain">'+(cfg.appOpen?"Fermer l’espace terrain":"Ouvrir l’espace terrain et informer l’équipe")+'</button>') +
      resetPanel() +
      card("État de l\u2019appareil",
        listRow("Version des données", "V" + state.version, "", "") +
        listRow("Modifications en attente", String(state.pending), state.pending ? "À envoyer" : "Aucune", state.pending ? "bad" : "good") +
        listRow("Réseau", navigator.onLine ? "En ligne" : "Hors ligne", "", "") +
        '<button class="button secondary" id="retryQueue">Réessayer les actions bloquées</button>' + '<div id="queueDetails"></div>');
    if (window.Queue) Queue.list().then(function (rows) {
      var target = $("#queueDetails"); if (!target) return;
      target.innerHTML = rows.filter(function (r) { return r.authorId === (state.user && state.user.id); }).map(function (r) { return listRow(r.action + " · " + (r.collection || ""), r.error || "En attente", r.state); }).join("");
    }).catch(function () {
      var target = $("#queueDetails");
      if (target) target.textContent = "Stockage hors ligne indisponible sur cet appareil. Les actions en attente ne peuvent pas être vérifiées.";
    });
    if(state.page==="setup"){var fb=c.querySelector('[data-setup="ouvertures"]');if(fb)fb.closest('.card').remove();}
    wireManagement();
    var terrain=$('#toggleTerrain');if(terrain)terrain.onclick=function(){if(!canLeave())return;var open=!state.data.config.appOpen;if(!window.confirm(open?'Ouvrir l’espace terrain et informer toute l’équipe par email ?':'Fermer l’espace terrain ?'))return;submitTask(terrain,function(){return onlineAction('appOpen',{open:open});});};
    var retry = $("#retryQueue"); if (retry) retry.onclick = function () { Queue.retryBlocked().then(function () { syncNow(); }).catch(function (e) { notice("Impossible de relancer les actions : " + String(e.message || e), "error"); }); };

    /* Les boutons sont recréés à chaque rendu : les écouteurs sont posés
     * sur le conteneur, jamais sur les boutons eux-mêmes. */
    var host = document.getElementById("pageContent");
    if (host) {
      Array.prototype.forEach.call(host.querySelectorAll("[data-setup]"), function (b) {
        b.onclick = function () {
          var id = String(b.dataset.setup || "");
          state.open = state.open === id ? "" : id;
          render();
        };
      });
      Array.prototype.forEach.call(host.querySelectorAll("[data-setup-save]"), function (b) {
        b.onclick = function () { saveSetupBloc(String(b.dataset.setupSave || "")); };
      });
    }
    wireNav();
  }

  function renderFormsPage(c,d){
    var cfg=d.config||{},date=cfg.closeAt&&new Date(cfg.closeAt),value=date&&isFinite(date)?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';
    var ps=AdminUX.people(d).filter(function(p){return p.role!=='referent';});
    c.innerHTML=card('Formulaire','<form id="formSettings" class="form-grid"><label>Clôture des réponses<input name="closeAt" type="datetime-local" value="'+esc(value)+'" required></label><label class="check"><input name="formOpen" type="checkbox" '+(cfg.formOpen?'checked':'')+'>Ouvert aux bénévoles</label><div class="full"><p>Questions : deux choix de créneau par journée, concerts souhaités, contrainte professionnelle et note libre.</p><div class="toolbar">'+uxButton('Modifier les créneaux proposés','creneaux')+uxButton('Modifier les concerts proposés','concerts')+'</div></div><button class="button primary" type="submit">Enregistrer le formulaire</button></form>')+
      card('Consulter ou corriger une réponse','<label>Bénévole<select id="formPerson">'+options(ps,state.editFormPerson,function(p){return [p.firstName,p.lastName].join(' ');})+'</select></label><button class="button secondary" id="editFormReply">Ouvrir le formulaire</button><p class="muted">Une correction enregistrée est prise en compte dans la prochaine simulation.</p>')+
      '<details class="card"><summary>Aperçu des questions et du mail</summary><div id="formPreview">'+questionsPreview(d,ps[0]||{})+'</div><pre class="mail-preview">'+esc(AdminUX.formMail(cfg,ps[0]||{}))+'</pre></details>'+card('Envoi et suivi',formTracking(d));
    wireManagement();wireNav();$('#formSettings').onsubmit=function(e){e.preventDefault();var f=this,close=new Date(f.elements.closeAt.value);if(!f.reportValidity()||!isFinite(close))return;submitTask(f.querySelector('button[type=submit]'),function(){return onlineAction('config',{date_cloture:close.toISOString(),formulaire_ouvert:f.elements.formOpen.checked});});};
    $('#editFormReply').onclick=function(){if(!$('#formPerson').value)return;state.editFormPerson=$('#formPerson').value;go('form');};
    $('#formPerson').onchange=function(){var p=ps.find(function(x){return x.id===$('#formPerson').value;});$('#formPreview').innerHTML=questionsPreview(d,p||{});};
  }
  function renderSimulationPage(c,d){
    if(state.role!=='admin'){go('home');return;}
    var sim=activeRows(d,'simulations').slice().sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));})[0];
    c.innerHTML=organiseSteps('simulations')+renderSimulations(d)+(sim&&sim.stale?'<p class="notice">Cette simulation est périmée. Relance le calcul après les dernières modifications.</p>':'')+(sim&&!sim.stale?card('Appliquer au planning de travail','<p>Cette action applique la dernière simulation et les déplacements enregistrés à ton planning de travail. Elle ne publie rien.</p><button type="button" class="button primary" id="useLatestSimulation">Appliquer au planning de travail</button>'):'');
    wireManagement();wireSimulationMoves();wireNav();
    c.querySelectorAll('[data-sim-day-pick]').forEach(function(b){b.onclick=function(){state.simDay=b.dataset.simDayPick;render();};});
    var button=$('#useLatestSimulation');if(button)button.onclick=function(){
      if(!window.confirm('Appliquer cette simulation au planning de travail ?'))return;
      submitTask(button,function(){return onlineAction('useSimulation',{id:sim.id,moves:simulationDraft(sim).filter(function(a){return !(sim.assignments||[]).some(function(o){return String(o.personId)===String(a.personId)&&String(o.shiftId)===String(a.shiftId);});}).map(function(a){return {personId:a.personId,shiftId:a.shiftId};})}).then(function(){notice('Simulation appliquée. Contrôle maintenant le planning.','success');go('planning');});});
    };
  }
  /* Tableau de bord : indicateurs calculés à partir du bundle, sans modifier les données. */

  function personalAssignments(d){
    if(state.role==='benevole'&&!AdminUX.latest(d))return [];
    return activeRows(d,'assignments').filter(function(a){return a.personId===selfPersonId()&&shift(a.shiftId)&&shift(a.shiftId).active!==false;});
  }
  function shiftInfo(s,d){
    var parts=[];
    personalAssignments(d).filter(function(a){return a.shiftId===s.id;}).forEach(function(a){
      var m=activeRows(d,'missions').find(function(m){return m.id===a.missionId;});
      [a.post,a.role,a.mission,m&&(m.name||m.label),a.notes].filter(Boolean).forEach(function(t){if(parts.indexOf(t)<0)parts.push(t);});
    });
    activeRows(d,'rotations').filter(function(r){return r.personId===(state.user||{}).id&&r.shiftId===s.id;}).forEach(function(r){parts.push(r.start+'–'+r.end+' · '+r.role);});
    [s.post,s.location,s.description,s.notes].filter(Boolean).forEach(function(t){if(parts.indexOf(t)<0)parts.push(t);});
    return parts;
  }
  function shiftCard(s,d){
    return '<button class="person-row volunteer-shift" data-personal-shift="'+esc(s.id)+'"><span class="person-main"><b>'+esc(s.start+'–'+s.end)+'</b><small>'+esc(friendlyDay(s.date))+'</small><span>'+esc(s.name||s.id)+'</span><small>'+esc(shiftInfo(s,d).join(' · '))+'</small></span><span aria-hidden="true">›</span></button>';
  }
  function wirePersonalShifts(d){
    document.querySelectorAll('[data-personal-shift]').forEach(function(b){b.onclick=function(){var sh=shift(b.dataset.personalShift);if(!sh)return;var root=$('#modalRoot');root.innerHTML='<div class="pub-ack-backdrop"><section class="pub-ack-panel" role="dialog" aria-modal="true" aria-labelledby="shiftDetailTitle"><h2 id="shiftDetailTitle">'+esc(sh.name||sh.id)+'</h2><p>'+esc(friendlyDay(sh.date)+' · '+sh.start+'–'+sh.end)+'</p>'+shiftInfo(sh,d).map(function(t){return '<p>'+esc(t)+'</p>';}).join('')+'<h3>Composition du shift</h3>'+activeRows(d,'assignments').filter(function(a){return a.shiftId===sh.id;}).map(function(a){return listRow(personLabel(a.personId),activeRows(d,'rotations').filter(function(r){return r.shiftId===sh.id&&r.personId===a.personId;}).map(function(r){return r.start+'–'+r.end+' · '+r.role;}).join(' · '),'');}).join('')+'<button class="button secondary" id="closeShiftDetail">Fermer</button></section></div>';var close=$('#closeShiftDetail');function dismiss(){root.innerHTML='';document.removeEventListener('keydown',key);b.focus({preventScroll:true});}function key(e){if(e.key==='Escape')dismiss();if(e.key==='Tab'){e.preventDefault();close.focus();}}close.onclick=dismiss;document.addEventListener('keydown',key);close.focus();};});
  }
  function renderMyShifts(c,d){
    var ids=personalAssignments(d).map(function(a){return a.shiftId;});
    var rows=activeRows(d,'shifts').filter(function(s){return ids.indexOf(s.id)>=0;}).sort(function(a,b){return period(a)[0]-period(b)[0];});
    c.innerHTML=card('Mes créneaux',rows.map(function(s){return shiftCard(s,d);}).join('')||'<p>Aucun créneau publié.</p>');
    wirePersonalShifts(d);
  }

  function renderContacts(c,d) {
    var people=activeRows(d,'people').slice().sort(function(a,b){return String(a.firstName).localeCompare(String(b.firstName),'fr');}), refs=people.filter(function(p){return p.role==='referent';}), others=people.filter(function(p){return p.role!=='referent';});
    function call(p){return p.phone?'<a class="button secondary" href="tel:'+esc(String(p.phone).replace(/[^+0-9]/g,''))+'" aria-label="Appeler '+esc([p.firstName,p.lastName].join(' '))+'">☎</a>':'';}
    c.innerHTML=card('Référents','<div class="contact-ref-grid">'+refs.map(function(p){return '<div class="contact-ref">'+photo(p)+'<b>'+esc(p.firstName)+'</b>'+call(p)+'</div>';}).join('')+'</div>')+'<input class="search" id="contactSearch" type="search" placeholder="Rechercher un bénévole…" aria-label="Rechercher un bénévole">'+card('Bénévoles',others.map(function(p){var assignments=activeRows(d,'assignments').filter(function(a){return a.personId===p.id;});return '<div class="contact-compact" data-contact-name="'+esc([p.firstName,p.lastName].join(' ').toLowerCase())+'"><details><summary>'+photo(p)+'<b>'+esc([p.firstName,p.lastName].join(' '))+'</b></summary>'+assignments.map(function(a){var s=shift(a.shiftId)||{};return listRow(s.date||'',s.name||'Créneau','');}).join('')+(assignments.length?'':'<p>Aucun créneau publié.</p>')+(p.email?'<a class="button secondary" href="mailto:'+esc(p.email)+'">Écrire</a>':'')+'</details>'+call(p)+'</div>';}).join(''));
    var search=$('#contactSearch');if(search)search.oninput=function(){var q=search.value.toLowerCase().trim();Array.prototype.forEach.call(document.querySelectorAll('[data-contact-name]'),function(row){row.hidden=row.dataset.contactName.indexOf(q)<0;});};
  }

  /* Rôles, préparation et suivi terrain. Toutes les écritures sensibles sont
     contrôlées une seconde fois par Apps Script. */
  function activeRows(d, k) { return (d[k] || []).filter(function (x) { return !x.deleted && x.active !== false; }); }
  function options(rows, selected, label) { return rows.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + esc(label(x)) + '</option>'; }).join(''); }
  function photo(p){return window.RunnerPhotos.html(p);}
  function field(f, key) { return f.elements[key] ? f.elements[key].value.trim() : ''; }
  function checkedIds(selector) { return Array.prototype.map.call(document.querySelectorAll(selector + ':checked'), function (x) { return x.value; }); }
  function onlineAction(action, payload) {
    if (!state.testMode && !navigator.onLine) return Promise.reject(new Error('Connexion nécessaire pour cette action.'));
    return Transport.mutate(action, payload, Transport.requestId()).then(function (out) {
      if (out && out.conflict) throw new Error('Une autre modification existe : synchronise et recommence.');
      return syncNow().then(function () { markClean(); render(); return out; });
    });
  }
  var busyCount=0;
  function busyOverlay(active){
    busyCount=Math.max(0,busyCount+(active?1:-1));
    var el=document.getElementById('bg-busy-overlay');
    if(!el){el=document.createElement('div');el.id='bg-busy-overlay';el.setAttribute('role','status');el.setAttribute('aria-live','assertive');el.innerHTML='<div class="bg-busy-card"><span class="bg-busy-spinner" aria-hidden="true"></span><b>Enregistrement en cours…</b><small>Merci de patienter, ne ferme pas cette page.</small></div>';document.body.appendChild(el);}
    el.style.display=busyCount?'flex':'none';
    document.body.setAttribute('aria-busy',busyCount?'true':'false');
  }
  function submitTask(button, task) {
    if (button && button.disabled) return;
    if (button) button.disabled = true;
    busyOverlay(true);
    return Promise.resolve().then(task).then(function(out){if(out&&out.queued&&button){button.dataset.queued='true';button.textContent='Enregistré sur ce téléphone';var form=button.closest('form');if(form)form.addEventListener('input',function changed(){delete button.dataset.queued;button.disabled=false;button.textContent='Enregistrer';form.removeEventListener('input',changed);});}return out;}).catch(function (e) { notice(String(e.message || e), 'error'); }).then(function () { if (button) button.disabled = button.dataset.queued==='true'; busyOverlay(false); });
  }
  function putRow(collection, row) {
    var old = (state.data[collection] || []).find(function (x) { return x.id === row.id; });
    return onlineAction('save', {collection: collection, row: Object.assign({}, old || {}, row), baseVersion: old ? old.version : 0, baseRow: old || null});
  }
  function period(row) {
    // Les horaires avant 06 h appartiennent à la nuit du jour du festival.
    function stamp(time, extra) {
      var date = new Date(row.date + 'T12:00:00Z'); if (!isFinite(date.getTime())) return Infinity; date.setUTCDate(date.getUTCDate() + extra);
      var day = date.toISOString().slice(0, 10), target = Date.parse(day + 'T' + time + ':00Z'), guess = target;
      for (var n = 0; n < 3; n++) {
        var parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
        var p = {}; parts.forEach(function (v) { p[v.type] = v.value; });
        guess += target - Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');
      }
      return guess;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '') || !/^\d{2}:\d{2}$/.test(row.start || '') || !/^\d{2}:\d{2}$/.test(row.end || '')) return [Infinity, Infinity];
    var extra = row.start < '06:00' ? 1 : 0;
    return [stamp(row.start, extra), stamp(row.end, extra + (row.end <= row.start ? 1 : 0))];
  }
  function priorityClass(priority){var p=String(priority||'Info').toLowerCase();return /urgent|critique/.test(p)?'priority-urgent':/important|haut/.test(p)?'priority-important':/normal/.test(p)?'priority-normal':'priority-info';}
  function messageRow(m){return listRow(m.title,m.body,m.priority||'Info',priorityClass(m.priority));}
  function concertPanel(d, all) {
    var rows = activeRows(d, 'concerts').sort(function (a,b) { return period(a)[0] - period(b)[0]; });
    var now = appNow(), current = rows.filter(function (x) { var p=period(x); return p[0]<=now && now<p[1]; });
    var next = rows.find(function (x) { return period(x)[0]>now; });
    function row(x) {var src=String(x.photo||'').trim();if(!/^https:\/\//i.test(src))src='';return '<article class="concert-tile '+(period(x)[1]<=now?'concert-past':'')+'">'+(src?'<img class="concert-photo" src="'+esc(src)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">':'')+'<div class="concert-caption"><b>'+esc(x.artist||x.name||'Concert')+'</b><span>'+esc(x.start+'–'+x.end)+'</span><small>'+esc([x.scene||x.stage,x.description||x.notes].filter(Boolean).join(' · '))+'</small></div></article>'; }

    var today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date(appNow()));
    var days=Array.from(new Set(rows.map(function(x){return x.date;}))).sort(function(a,b){return (a<today)-(b<today)||a.localeCompare(b);});
    var grouped=days.map(function(day){var concerts=rows.filter(function(x){return x.date===day;}).sort(function(a,b){return (period(a)[1]<=now)-(period(b)[1]<=now)||period(a)[0]-period(b)[0];});return '<section class="concert-day"><h3>'+esc(friendlyDay(day))+'</h3>'+concerts.map(row).join('')+'</section>';}).join('');
    return card('Concerts', (all ? grouped : '<h3>En cours</h3>' + (current.map(row).join('') || '<p>Aucun concert en cours.</p>') + '<h3>Suivant</h3>' + (next ? row(next) : '<p>Aucun concert à venir.</p>') + '<details><summary>Tous les concerts</summary>' + grouped + '</details>') || '<p>Programmation à venir.</p>');
  }
  function durationText(ms){var minutes=Math.max(1,Math.ceil(ms/60000));return minutes<60?minutes+' min':Math.floor(minutes/60)+' h'+(minutes%60?' '+minutes%60+' min':'');}
  function renderHome(c,d) {
    var ref=state.role==='referent', now=appNow(), ids=personalAssignments(d).map(function(a){return a.shiftId;});
    var shifts=activeRows(d,'shifts').filter(function(s){return ref||ids.includes(s.id);}).sort(function(a,b){return period(a)[0]-period(b)[0];});
    var current=shifts.find(function(s){var p=period(s);return p[0]<=now&&now<p[1];}), next=shifts.find(function(s){return period(s)[0]>now;}), chosen=current||(!ref&&next), body='';
    if(current)body='<p><strong>'+esc(ref?'Changement de shift dans '+durationText(period(current)[1]-now):'En poste jusqu’à '+current.end)+'</strong></p>';
    else if(!ref&&next){
      var parisDay=function(t){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date(t));};
      var day=parisDay(period(next)[0]), today=parisDay(now), tomorrow=parisDay(now+86400000);
      body='<p><strong>Mon prochain créneau '+esc(day===today?'dans '+durationText(period(next)[0]-now):day===tomorrow?'demain':friendlyDay(day))+'</strong></p>';
    }else body='<p>'+(ref?'Aucun créneau en cours.':'Aucun créneau publié à venir.')+'</p>';
    if(chosen)body+=ref?'<button class="person-row" data-terrain-shift="'+esc(chosen.id)+'"><span>'+esc(chosen.name+' · '+chosen.start+'–'+chosen.end)+'</span><span>›</span></button>':shiftCard(chosen,d);
    var msgs=activeRows(d,'messages').slice(-3).reverse();
    c.innerHTML=card('Créneau en cours',body)+card('Messages',msgs.map(function(m){return messageRow(m);}).join('')+'<button class="button secondary" data-page="messages">'+(ref?'Envoyer / gérer les messages':'Tous les messages')+'</button>')+concertPanel(d,false)+(d.config&&d.config.formOpen&&state.role!=='vehicles'?'<button class="button primary" data-page="form">Mon formulaire de disponibilités</button>':'');
    if(state.role==='benevole')c.insertAdjacentHTML('beforeend','<button class="button secondary wide" data-page="vehicles">Véhicules</button>');
    wireManagement();wireNav();wirePersonalShifts(d);
  }
  /* Suivi unifié : seule REPONSES_FORMULAIRE décide si un bénévole a répondu.
     L'historique des envois (deliveries) reste totalement indépendant. */
  function formTracking(d) {
    var people=activeRows(d,'people').filter(function(p){return p.role!=='referent'&&p.status!=='Désisté';});
    var stats=d.responseStats||null;
    var ids=stats&&Array.isArray(stats.receivedIds)?stats.receivedIds:null;
    var answered=ids?new Set(ids.map(String)):null;
    var sent=0;
    var items=people.map(function(p){
      var reports=(d.deliveries||[]).filter(function(x){return String(x.personId)===String(p.id)&&x.kind==='form';}).sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));});
      var last=reports[0];
      var ok=answered?answered.has(String(p.id)):null;
      var sentOk=reports.some(function(x){return x.status!=='Échec';});
      if(sentOk)sent++;
      return {p:p,last:last,ok:ok,sentOk:sentOk};
    });
    var count=answered?items.filter(function(x){return x.ok;}).length:null;
    var status=count===null?'Réponses non synchronisées':count+' / '+people.length+' réponses reçues (Sheets)';
    return '<section class="form-tracking" id="formTracking"><h3>Envoi et réponses</h3>'+
      '<p class="muted">Les réponses proviennent uniquement de Google Sheets. L’état d’envoi est suivi séparément.</p>'+
      '<p role="status"><b>'+esc(status)+'</b> · '+sent+' envoi(s) signalé(s)</p>'+
      (answered?'':'<p role="alert">Suivi individuel indisponible. Actualise les données. Les réponses inconnues ne sont pas considérées comme manquantes.</p>')+
      '<div class="toolbar"><label for="formTrackingSearch">Rechercher un bénévole</label><input id="formTrackingSearch" type="search" placeholder="Nom ou prénom" autocomplete="off" style="min-width:180px;flex:1">'+
      '<label for="formTrackingFilter">Afficher</label><select id="formTrackingFilter"><option value="all">Tous</option><option value="unanswered">Sans réponse</option><option value="answered">Réponse reçue</option><option value="unsent">Non envoyés</option></select></div>'+
      '<div class="toolbar"><button type="button" class="button secondary" id="selectUnanswered"'+(answered?'':' disabled')+'>Cocher les non-répondants affichés</button><button type="button" class="button secondary" id="clearFormRecipients">Tout décocher</button><span id="formRecipientCount" aria-live="polite">0 sélectionné</span></div>'+
      '<div id="formTrackingRows" style="max-height:430px;overflow:auto;border:1px solid var(--border,#dce1e8);border-radius:12px">'+items.map(function(x){
        var p=x.p, label=[p.firstName,p.lastName].filter(Boolean).join(' ');
        var mail=x.last?(x.last.status+(x.last.error?' · '+x.last.error:'')):'Non envoyé';
        var answer=x.ok===null?'Réponse non synchronisée':(x.ok?'Réponse reçue':'Sans réponse');
        return '<label class="check form-track-row" data-name="'+esc(label.toLowerCase())+'" data-answer="'+(x.ok===null?'unknown':x.ok?'yes':'no')+'" data-sent="'+(x.sentOk?'yes':'no')+'" style="display:flex;gap:12px;align-items:center;padding:12px;border-bottom:1px solid var(--border,#e5e7eb);cursor:pointer">'+
          '<input type="checkbox" name="formRecipient" value="'+esc(p.id)+'" data-answered="'+(x.ok===null?'unknown':x.ok?'yes':'no')+'" aria-label="Sélectionner '+esc(label)+'">'+
          '<span style="min-width:0;flex:1"><b>'+esc(label)+'</b><small style="display:block">'+esc(mail)+' · '+esc(answer)+'</small></span></label>';
      }).join('')+'</div><p id="formTrackingEmpty" class="muted" hidden>Aucun bénévole pour ce filtre.</p>'+
      '<div class="toolbar" style="position:sticky;bottom:0;background:var(--surface,#fff);padding:10px 0"><button type="button" class="button primary" id="sendForms">Envoyer aux personnes cochées</button></div></section>';
  }
  function resetPanel() { return '<details class="card"><summary>Remise à zéro de l’édition</summary><p>Efface concerts, affectations, rotations, formulaires, messages, véhicules et suivis. Conserve les fiches bénévoles et les horaires des shifts. Les accès seront à recréer.</p><p>Les dossiers archivés dans Drive ne sont pas supprimés.</p><label>Recopie REMISE A ZERO<input id="resetConfirm" autocomplete="off"></label><button class="button danger" id="resetEdition">Remettre l’édition à zéro</button></details>'; }
  /* Simulations : consultation et calcul uniquement, jamais d'application automatique. */
  /* Simulations : vue par jour / colonnes de shifts. Brouillon local uniquement. */
  function simulationDraft(sim) {
    var key='bg_sim_draft_'+sim.id;
    if (!state.simDrafts) state.simDrafts={};
    if (!state.simDrafts[sim.id]) {
      var rows=null;
      try { rows=state.testMode?null:JSON.parse(localStorage.getItem(key)||'null'); } catch(e) {}
      state.simDrafts[sim.id]=Array.isArray(rows)?rows:(sim.assignments||[]).map(function(a){return Object.assign({},a);});
    }
    return state.simDrafts[sim.id];
  }
  function simShiftOrder(sh) {
    var id=String(sh.id||'');
    var match=id.match(/(\d+)$/);
    return match?Number(match[1]):999;
  }
  function simChoiceInfo(d, personId, sh, sim) {
    var forms=(sim&&sim.snapshot&&Array.isArray(sim.snapshot.forms))?sim.snapshot.forms:(d.forms||[]);
    var f=forms.filter(function(x){return x.personId===personId&&!x.deleted;})[0];
    var issues=[], color='red', info=[], concerts=[];
    if (!f) issues.push('Réponse au formulaire absente');
    var ch=f&&(f.choices||[]).find(function(x){return String(x.date||'').slice(0,10)===String(sh.date||'').slice(0,10);});
    var first=ch?String(ch.first||ch.choix_1||'').trim():'', second=ch?String(ch.second||ch.choix_2||'').trim():'';
    info.push('C1 : '+(first||'—')+' · C2 : '+(second||'—'));
    if(f&&!ch) issues.push('Aucun choix pour cette journée');
    if(ch){
      if(sh.id!==first&&sh.id!==second) issues.push('Shift '+sh.id+' hors des choix C1/C2');
      var work=ch.work===true||ch.work==='oui'||ch.contrainte_pro==='oui';
      var confirmed=ch.confirmWork===true||ch.confirmWork==='oui'||ch.confirmation_pro==='oui';
      if(work){
        info.push('Contrainte professionnelle'+(confirmed?' (confirmée)':''));
        if(!confirmed) issues.push('Contrainte professionnelle non confirmée');
      }
    }
    var wished=(f&&Array.isArray(f.concerts))?f.concerts:[];
    var catalogue=(sim&&sim.snapshot&&Array.isArray(sim.snapshot.concerts))?sim.snapshot.concerts:(d.concerts||[]);
    wished.forEach(function(id){
      var concert=catalogue.find(function(x){return String(x.id)===String(id);});
      if(!concert){return;} // Sans date vérifiable, ne pas attribuer un conflit à une journée arbitraire.
      // Les souhaits de concerts ne concernent que leur journée de festival.
      // Comparer les dates métier, sans reporter un concert du vendredi sur le jeudi.
      var jourConcert=String(concert.date||'').slice(0,10);
      var jourShift=String(sh.date||'').slice(0,10);
      if(!jourConcert||jourConcert!==jourShift)return;
      var label=concert.artist||concert.name||concert.id;
      var a=period(sh), b=period(concert);
      if(!isFinite(a[0])||!isFinite(a[1])||!isFinite(b[0])||!isFinite(b[1])){
        issues.push('Horaires non vérifiables : '+label);
        concerts.push(label+' (horaires inconnus)');
      }else if(a[0]<b[1]&&b[0]<a[1]){
        issues.push('Conflit concert : '+label);
        concerts.push(label+' (conflit)');
      }else concerts.push(label+' (compatible)');
    });
    if(concerts.length)info.push('Concerts : '+concerts.join(', '));
    if(!issues.length) color=sh.id===first?'green':sh.id===second?'orange':'red';
    var palette={green:{bg:'#d8f5df',border:'#27834a',fg:'#124f2c'},orange:{bg:'#ffe5bf',border:'#c67812',fg:'#754300'},red:{bg:'#ffe0df',border:'#bf3939',fg:'#781b1b'}};
    return {color:color,style:palette[color],lines:info,reasons:issues};
  }
  function renderSimulations(d) {
    var sims=activeRows(d,'simulations').slice().sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));}).slice(0,1);
    var html='<p class="muted">Vue par journée : sur mobile, utilise les flèches gauche/droite sous chaque fiche ; sur ordinateur, glisse la fiche ou utilise « Déplacer ici ». Aucun changement du planning officiel.</p>'+
      '<button type="button" class="button primary" id="runSimulation">Lancer une simulation</button><p class="muted">Vert : premier choix · Orange : second choix · Rouge : contrainte ou choix non respecté. Les motifs sont précisés sur chaque fiche.</p>';
    if(!sims.length)return card('Simulations',html+'<p>Aucune simulation enregistrée.</p>');
    html+=sims.map(function(sim,idx){
      var assignments=simulationDraft(sim), shifts=activeRows(d,'shifts');
      var dates={};
      shifts.forEach(function(sh){if(sh.date)dates[sh.date]=true;});
      assignments.forEach(function(a){var sh=shift(a.shiftId);if(sh&&sh.date)dates[sh.date]=true;});
      var simDates=Object.keys(dates).sort();if(!simDates.includes(state.simDay))state.simDay=simDates[0];
      var dayNav='<nav class="day-carousel" aria-label="Journées de simulation">'+simDates.map(function(date){return '<button type="button" class="day-chip" data-sim-day-pick="'+esc(date)+'" aria-pressed="'+(state.simDay===date)+'">'+esc(friendlyDay(date))+'</button>';}).join('')+'</nav>';
      var days=simDates.filter(function(date){return date===state.simDay;}).map(function(date){
        var cols=shifts.filter(function(sh){return sh.date===date;}).sort(function(a,b){return simShiftOrder(a)-simShiftOrder(b)||String(a.start||'').localeCompare(String(b.start||''));});
        var ids=cols.map(function(sh){return sh.id;});
        assignments.forEach(function(a){var sh=shift(a.shiftId);if(sh&&sh.date===date&&ids.indexOf(a.shiftId)<0){cols.push(sh);ids.push(sh.id);}});
        cols.sort(function(a,b){return simShiftOrder(a)-simShiftOrder(b)||String(a.start||'').localeCompare(String(b.start||''));});
        var total=assignments.filter(function(a){var sh=shift(a.shiftId);return sh&&sh.date===date;}).length;
        var label=new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
        var columns=cols.map(function(sh){
          var members=assignments.filter(function(a){return a.shiftId===sh.id;});
          return '<section class="sim-shift-column" data-sim-target="'+esc(sim.id)+'" data-sim-shift="'+esc(sh.id)+'" data-sim-date="'+esc(date)+'" style="flex:0 0 210px;min-width:210px;border:1px solid #d0d6dd;border-radius:10px;padding:10px;background:var(--card,#fff)">'+
            '<h3>'+esc(sh.id)+' <small>('+members.length+')</small></h3>'+
            '<p class="muted">'+esc((sh.start||'')+' – '+(sh.end||''))+'</p>'+
            '<button type="button" class="button secondary" data-sim-target="'+esc(sim.id)+'" data-sim-shift="'+esc(sh.id)+'" data-sim-date="'+esc(date)+'" style="width:100%;margin-bottom:8px">Déplacer ici</button>'+
            members.map(function(a){
              var check=simChoiceInfo(d,a.personId,sh,sim);
              var index=cols.findIndex(function(x){return x.id===sh.id;});
              var arrow=function(delta, label, symbol){
                var dest=cols[index+delta];
                return '<button type="button" class="button secondary" data-sim-arrow="'+delta+'" data-sim-person-id="'+esc(a.personId)+'" data-sim-source-id="'+esc(sh.id)+'" data-sim-id="'+esc(sim.id)+'" data-sim-day="'+esc(date)+'" data-sim-destination="'+esc(dest?dest.id:'')+'" '+(!dest?'disabled ':'')+'aria-label="'+esc(label+(dest?' vers '+dest.id:''))+'" style="flex:1;min-height:44px;padding:7px">'+symbol+'</button>';
              };
              return '<div style="margin:4px 0;background:'+check.style.bg+';border:2px solid '+check.style.border+';border-radius:8px;padding:4px;color:'+check.style.fg+'">'+
                '<button type="button" class="button secondary" draggable="true" data-sim-person="'+esc(a.personId)+'" data-sim-source="'+esc(sh.id)+'" data-sim-id="'+esc(sim.id)+'" data-sim-date="'+esc(date)+'" style="display:block;width:100%;text-align:left;white-space:normal;background:transparent;color:inherit;border:0">'+
                '<b>'+esc(personLabel(a.personId))+'</b>'+
                check.lines.map(function(line){return '<small style="display:block;margin-top:4px;font-weight:400">'+esc(line)+'</small>';}).join('')+
                (check.reasons.length?'<small style="display:block;margin-top:5px;font-weight:700">⚠ '+esc(check.reasons.join(' ; '))+'</small>':'')+'</button>'+
                '<div style="display:flex;gap:6px;margin-top:5px">'+arrow(-1,'Déplacer à gauche','←')+arrow(1,'Déplacer à droite','→')+'</div></div>';
            }).join('')+'</section>';
        }).join('');
        return '<details class="sim-day" open><summary>'+esc(label)+' — '+total+' affectation(s), '+cols.length+' shifts</summary>'+
          '<div class="simulation-columns" style="display:flex;gap:10px;overflow-x:auto;padding:12px 0;align-items:stretch">'+columns+'</div></details>';
      }).join('');
      return '<details class="sim-result" '+(idx===0?'open':'')+'><summary>'+esc(sim.name||'Simulation')+' — '+assignments.length+' affectation(s)'+(sim.stale?' (périmée)':'')+'</summary>'+
        '<p class="notice">Brouillon conservé sur cet appareil uniquement. Applique-le au planning de travail pour le transmettre au serveur.</p><p class="muted" id="simSelection-'+esc(sim.id)+'">Sélectionne une personne pour la déplacer.</p>'+
        '<button type="button" class="button secondary" data-sim-reset="'+esc(sim.id)+'">Annuler les déplacements locaux</button>'+dayNav+days+'</details>';
    }).join('');
    return card('Simulation',html);
  }
  function wireSimulationMoves(){
    var host=$('#pageContent');
    if(!host)return;
    Array.prototype.forEach.call(host.querySelectorAll('.sim-day'),function(d){
      d.addEventListener('toggle',function(){if(d.open){var sim=d.closest('.sim-result');var id=sim&&sim.querySelector('[data-sim-reset]');state.simOpenDay=(id?id.dataset.simReset:'')+'|'+(d.querySelector('[data-sim-date]')||{}).dataset.simDate;}});
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-sim-person]'),function(b){
      b.onclick=function(){
        state.simPick={id:b.dataset.simId,personId:b.dataset.simPerson,source:b.dataset.simSource,date:b.dataset.simDate};
        Array.prototype.forEach.call(host.querySelectorAll('[data-sim-person]'),function(x){x.style.outline='';});
        b.style.outline='3px solid #16a34a';
        var msg=document.getElementById('simSelection-'+state.simPick.id);
        if(msg)msg.textContent=personLabel(state.simPick.personId)+' sélectionné : clique sur « Déplacer ici » dans une autre colonne.';
      };
      b.addEventListener('dragstart',function(e){
        state.simPick={id:b.dataset.simId,personId:b.dataset.simPerson,source:b.dataset.simSource,date:b.dataset.simDate};
        if(e.dataTransfer)e.dataTransfer.setData('text/plain',b.dataset.simPerson);
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('.sim-shift-column'),function(b){
      function move(){
        var pick=state.simPick;
        if(!pick||pick.id!==b.dataset.simTarget||pick.date!==b.dataset.simDate){notice('Sélectionne un bénévole de cette journée.','error');return;}
        if(pick.source===b.dataset.simShift){notice('Ce bénévole est déjà dans ce shift.','info');return;}
        var sim=activeRows(state.data,'simulations').find(function(x){return x.id===pick.id;});
        if(!sim)return;
        if(sim.stale){notice('Cette simulation est périmée. Relance le calcul avant de la modifier.','error');return;}
        var rows=simulationDraft(sim);
        var row=rows.find(function(a){return a.personId===pick.personId&&a.shiftId===pick.source;});
        if(!row){notice('Affectation introuvable.','error');return;}
        if(rows.some(function(a){return a.personId===pick.personId&&a.shiftId===b.dataset.simShift;})){notice('Ce bénévole est déjà affecté à ce shift.','error');return;}
        if(!state.simUndo)state.simUndo={};if(!state.simUndo[sim.id])state.simUndo[sim.id]=[];
        state.simUndo[sim.id].push(rows.map(function(a){return Object.assign({},a);}));
        var person=(state.data.people||[]).find(function(p){return p.id===pick.personId;}),group=person&&person.mandatoryGroupId;
        if(group){var ids=(state.data.people||[]).filter(function(p){return p.mandatoryGroupId===group&&!p.deleted;}).map(function(p){return p.id;});rows.forEach(function(a){var sh=shift(a.shiftId);if(ids.includes(a.personId)&&sh&&sh.date===pick.date)a.shiftId=b.dataset.simShift;});}else row.shiftId=b.dataset.simShift;
        try{(state.testMode?function(){}:localStorage.setItem.bind(localStorage))('bg_sim_draft_'+sim.id,JSON.stringify(rows));}catch(e){notice('Déplacement local non sauvegardé : stockage indisponible.','error');}
        state.simOpenDay=sim.id+'|'+pick.date;
        state.simPick=null;
        render();
        notice(group?'Groupe déplacé ensemble dans le brouillon.':'Bénévole déplacé dans le brouillon.','success');
      }
      b.moveSim=move;
      var button=b.querySelector('button[data-sim-target]');
      if(button)button.onclick=move;
      b.addEventListener('dragover',function(e){
        var pick=state.simPick;
        if(!pick||pick.id!==b.dataset.simTarget||pick.date!==b.dataset.simDate)return;
        e.preventDefault();
        if(e.dataTransfer)e.dataTransfer.dropEffect='move';
        b.style.outline='3px dashed #268a9d';
      });
      b.addEventListener('dragleave',function(e){
        if(!e.relatedTarget||!b.contains(e.relatedTarget))b.style.outline='';
      });
      b.addEventListener('drop',function(e){
        e.preventDefault();e.stopPropagation();b.style.outline='';move();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-sim-arrow]'),function(button){
      button.onclick=function(e){
        e.preventDefault();e.stopPropagation();
        var dest=button.dataset.simDestination;
        if(!dest)return;
        state.simPick={id:button.dataset.simId,personId:button.dataset.simPersonId,source:button.dataset.simSourceId,date:button.dataset.simDay};
        var target=Array.prototype.find.call(host.querySelectorAll('.sim-shift-column'),function(col){
          return col.dataset.simTarget===state.simPick.id&&col.dataset.simDate===state.simPick.date&&col.dataset.simShift===dest;
        });
        if(target&&target.moveSim)target.moveSim();
        else notice('Créneau de destination introuvable.','error');
      };
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-sim-reset]'),function(b){
      b.onclick=function(){
        if(!window.confirm('Annuler tous les déplacements locaux de cette simulation ?'))return;
        var id=b.dataset.simReset,sim=activeRows(state.data,'simulations').find(function(x){return x.id===id;});
        if(!sim)return;
        if(!state.simDrafts)state.simDrafts={};
        state.simDrafts[id]=(sim.assignments||[]).map(function(a){return Object.assign({},a);});
        try{if(!state.testMode)localStorage.removeItem('bg_sim_draft_'+id);}catch(e){}
        state.simPick=null;if(state.simUndo)state.simUndo[id]=[];render();
      };
    });
  }
  function friendlyDay(date){
    var d=/^\d{4}-\d{2}-\d{2}$/.test(String(date))?new Date(date+'T12:00:00'):null;
    return d&&!isNaN(d.getTime())?new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d):String(date||'Date non renseignée');
  }
  function friendlyTime(t){var m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])+'h'+(m[2]==='00'?'':m[2]):'';}
  function friendlyShift(sh,count){
    var start=friendlyTime(sh.start),end=friendlyTime(sh.end),name=String(sh.name||'').trim();
    // Ne pas afficher deux horaires contradictoires : l'horaire structuré fait foi.
    var title=start&&end?start+' – '+end:(name||'Créneau sans horaire');
    var suffix=name&&!/\d{1,2}\s*h\s*\d*/i.test(name)&&!/^je\d+$/i.test(name)?' · '+name:'';
    return title+suffix+' · '+count+' bénévole'+(count>1?'s':'');
  }
  function describeCheck(x,i){
    var title=x.message||x.title||x.description||x.type||x.code||'';
    var details=x.detail||x.reason||x.explanation||'';
    if(!title||title==='Contrôle')title='Anomalie n°'+(i+1)+' — '+(x.level==='red'?'à corriger':x.level==='orange'?'à examiner':'à vérifier');
    if(!details){var parts=[];['personId','shiftId','date','type','code'].forEach(function(k){if(x[k]!=null&&x[k]!=='')parts.push(k+': '+x[k]);});details=parts.join(' · ')||'Le moteur n’a pas fourni de détail. Cette alerte ne peut pas être résolue sérieusement sans sa cause.';}
    return listRow(title,details,x.level==='red'?'Bloquant':x.level==='orange'?'À examiner':'Information',x.level);
  }

  function renderMessages(c,d) {
    var can=state.role==='admin'||state.role==='referent', msgs=activeRows(d,'messages');
    c.innerHTML=uxButton('‹ Accueil',state.role==='admin'?'dashboard':'home')+(can?'<article class="card"><h2>Rédiger un message</h2><form id="messageForm" class="form-grid"><input type="hidden" name="id"><label>Titre<input name="title" required></label><label>Priorité<select name="priority"><option>Info</option><option>Normal</option><option>Important</option><option>Urgent</option></select></label><label class="full">Message<textarea name="body" rows="4" required></textarea></label><fieldset class="full message-targets"><legend>Destinataires</legend>'+[['referents','Référents'],['volunteers','Tous les bénévoles'],['current','Créneaux en cours']].map(function(x){return '<label class="check"><input type="checkbox" name="targetGroup" value="'+x[0]+'">'+x[1]+'</label>';}).join('')+'<details><summary>Choisir des personnes</summary>'+activeRows(d,'people').map(function(p){return '<label class="check"><input type="checkbox" name="targetPerson" value="'+esc(p.id)+'">'+esc([p.firstName,p.lastName].join(' '))+'</label>';}).join('')+'</details></fieldset><p class="full muted">Le message sera visible dans l’application des destinataires.</p><button class="button primary">Envoyer / enregistrer</button></form></article>':'')+
      msgs.slice().reverse().map(function(m){return card(m.title,'<span class="badge '+priorityClass(m.priority)+'">'+esc(m.priority||'Info')+'</span><p class="message-body">'+esc(m.body)+'</p>'+(can&&!isVehicleMessage(m)?'<button class="button secondary" data-message-edit="'+esc(m.id)+'">Modifier</button>':'')+((d.reads||[]).some(function(r){return r.messageId===m.id&&r.personId===(state.user||{}).id;})?'<span class="badge good">Lu</span>':(state.pendingMessageReads&&state.pendingMessageReads[m.id]?'<span class="badge">Lecture enregistrée · envoi en attente</span>':'<button class="button secondary" data-message-read="'+esc(m.id)+'">J’ai lu</button>')));}).join('');
    wireManagement();wireNav();
  }
  var localTerrain=[];
  function renderTerrain(c,d){
    if(!AdminUX.latest(d)){c.innerHTML='<p>Le planning n’est pas encore publié.</p>';return;}
    var shifts=activeRows(d,'shifts').sort(function(a,b){return period(a)[0]-period(b)[0];}), now=appNow();
    var selected=shifts.find(function(s){return s.id===state.terrainShift;})||shifts.find(function(s){return period(s)[1]>now;})||shifts[shifts.length-1];
    if(!selected){c.innerHTML='<p>Aucun créneau disponible.</p>';return;}
    var sid=selected.id;state.terrainShift=sid;
    localTerrain=localTerrain.filter(function(t){return !activeRows(d,'terrain').some(function(x){return x.id===t.id;});});
    var history=activeRows(d,'terrain').concat(localTerrain).filter(function(t){return t.shiftId===sid;});
    var members=activeRows(d,'assignments').filter(function(a){return a.shiftId===sid;}).map(function(a){var p=(d.people||[]).find(function(p){return p.id===a.personId;});if(!p)return null;var changes=history.filter(function(t){return t.personId===p.id;}),change=changes[changes.length-1],rotations=activeRows(d,'rotations').filter(function(r){return r.personId===p.id&&r.shiftId===sid;}),rotation=rotations.find(function(r){return period(Object.assign({date:selected.date},r))[1]>now;})||rotations[0];return {p:p,role:change?change.role:rotation?rotation.role:'À affecter',change:change};}).filter(Boolean);
    c.innerHTML=card('Changement de shift','<label>Créneau<select id="terrainShift">'+options(shifts,sid,function(s){return friendlyDay(s.date)+' · '+s.start+'–'+s.end;})+'</select></label><p>'+esc(period(selected)[0]<=now&&now<period(selected)[1]?'Changement de shift dans '+durationText(period(selected)[1]-now):selected.start+'–'+selected.end)+'</p><p class="muted">Glisse la poignée vers un poste, ou sélectionne une personne puis son poste. Vert : confirmé · orange : à confirmer · rouge : absent.</p><label>Motif du changement<input id="shiftChangeNote" placeholder="Motif" required></label><div class="shift-board">'+['Conducteur','Chargeur','À affecter'].map(function(role){return '<section class="shift-column" data-drop-role="'+role+'"><h3>'+role+'</h3>'+members.filter(function(m){return m.role===role||role==='À affecter'&&!['Conducteur','Chargeur'].includes(m.role);}).map(function(m){var status=m.p.status==='Absent'||m.p.status==='Désisté'?'Absent':m.change&&!m.change.acknowledged?'À confirmer':'Confirmé';return '<button type="button" draggable="true" class="shift-person '+(status==='Absent'?'choice-bad':status==='À confirmer'?'choice-second':'choice-good')+'" data-drag-person="'+esc(m.p.id)+'"><span class="drag-handle" aria-label="Déplacer">⠿</span><span>'+esc(personLabel(m.p.id))+'<small>'+status+(m.p.driverOnly?' · Conducteur uniquement':'')+'</small></span></button>';}).join('')+(role==='À affecter'?'':'<button type="button" class="button secondary" data-move-role="'+role+'">Affecter ici</button>')+'</section>';}).join('')+'</div>')+card('Historique du shift',history.slice().reverse().map(function(t){return listRow(personLabel(t.personId),t.role+' · '+(t.note||''),t.acknowledged?'Confirmé':'À confirmer');}).join('')||'<p>Aucun changement.</p>');
    var picked='',moving=false;
    function move(id,role){if(moving||!id||!['Conducteur','Chargeur'].includes(role))return;var m=members.find(function(x){return x.p.id===id;});if(!m||m.role===role)return;if(role==='Chargeur'&&(m.p.driverOnly||m.p.noLoader)){notice('Conducteur uniquement : passage Chargeur interdit.','error');return;}var note=$('#shiftChangeNote');if(!note.value.trim()){note.reportValidity();return;}var row={id:Transport.requestId(),personId:id,shiftId:sid,role:role,note:note.value.trim(),status:'Modification',acknowledged:false};moving=true;terrainSave('terrain',row).then(function(){localTerrain.push(row);render();}).catch(function(e){notice(e.message,'error');}).finally(function(){moving=false;});}
    c.querySelectorAll('[data-drag-person]').forEach(function(el){el.onclick=function(){picked=el.dataset.dragPerson;c.querySelectorAll('.shift-person').forEach(function(x){x.classList.toggle('selected',x===el);});};el.ondragstart=function(e){picked=el.dataset.dragPerson;e.dataTransfer.setData('text/plain',picked);};var handle=el.querySelector('.drag-handle');handle.onpointerdown=function(e){if(e.pointerType==='mouse')return;e.preventDefault();picked=el.dataset.dragPerson;handle.setPointerCapture(e.pointerId);};handle.onpointermove=function(e){if(!handle.hasPointerCapture(e.pointerId))return;c.querySelectorAll('[data-drop-role]').forEach(function(x){var rect=x.getBoundingClientRect();x.classList.toggle('drag-over',e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom);});};handle.onpointerup=function(e){if(!handle.hasPointerCapture(e.pointerId))return;handle.releasePointerCapture(e.pointerId);var target=document.elementFromPoint(e.clientX,e.clientY),column=target&&target.closest('[data-drop-role]');c.querySelectorAll('.drag-over').forEach(function(x){x.classList.remove('drag-over');});if(column)move(picked,column.dataset.dropRole);};});
    c.querySelectorAll('[data-drop-role]').forEach(function(el){el.ondragover=function(e){e.preventDefault();};el.ondrop=function(e){e.preventDefault();move(e.dataTransfer.getData('text/plain'),el.dataset.dropRole);};});
    c.querySelectorAll('[data-move-role]').forEach(function(el){el.onclick=function(){if(!picked){notice('Sélectionne une personne.','info');return;}move(picked,el.dataset.moveRole);};});
    $('#terrainShift').onchange=function(){state.terrainShift=this.value;render();};
  }
  function receptionDetails(r) {
    var labels={plate:'Immatriculation',make:'Marque',model:'Modèle',color:'Couleur',type:'Type',driverName:'Conducteur',operatorName:'Opérateur',mileage:'Kilométrage',fuel:'Carburant',notes:'Observations'};
    function media(url,label){return url && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(url)?'<figure><img class="reception-evidence" src="'+esc(url)+'" alt="'+esc(label)+'"><figcaption>'+esc(label)+'</figcaption></figure>':'';}
    return Object.keys(labels).map(function(k){return listRow(labels[k],r[k]===undefined?'Non renseigné':String(r[k]),'');}).join('')+
      media(r.odometerPhoto,'Photo du compteur')+media(r.fuelPhoto,'Photo de la jauge')+
      (r.damages||[]).map(function(x){return listRow(x.zone||'Dommage',(x.type||'')+' · '+(x.description||''),x.status||'')+media(x.photo,'Photo du dommage');}).join('')+
      [r.signature1,r.signature2].filter(Boolean).map(function(x){return listRow('Signé par',x.name||'',x.at||'');}).join('');
  }
  function vehicleSettings(d){
    var cfg=d.config||{}, driver=Math.round((Number(cfg.quotaMin==null?40:cfg.quotaMin)+Number(cfg.quotaMax==null?60:cfg.quotaMax))/2);
    return card('Paramètres véhicules','<div class="form-grid"><label>Nombre de véhicules prévus<input id="vehiclePlanned" type="number" min="0" value="'+esc(cfg.vehiclesPlanned||0)+'"></label><div class="full"><label for="vehicleBalance">Répartition conduite / chargement</label><div style="display:flex;justify-content:space-between;gap:12px"><b>Conducteur <output id="vehicleDriverLabel">'+driver+'</output> %</b><b>Chargeur <output id="vehicleLoaderLabel">'+(100-driver)+'</output> %</b></div><input style="width:100%" id="vehicleBalance" type="range" min="0" max="100" step="5" value="'+driver+'" aria-label="Répartition conducteur chargeur"><small>Part cible des rotations en conduite. Vers la droite : plus de conduite ; vers la gauche : plus de chargement.</small></div><label class="check"><input id="vehicleReserve" type="checkbox" '+(cfg.reserveA===false?'':'checked')+'>Réserver le véhicule A aux référents</label><button type="button" class="button primary" id="saveVehicleSettings">Enregistrer les paramètres</button></div>');
  }
  function wireVehicleSettings(){
    var slider=$('#vehicleBalance');if(slider)slider.oninput=function(){var v=Number(slider.value);$('#vehicleDriverLabel').textContent=v;$('#vehicleLoaderLabel').textContent=100-v;};
    var btn=$('#saveVehicleSettings');if(btn)btn.onclick=function(){
      var n=Number($('#vehiclePlanned').value),driver=Number($('#vehicleBalance').value);
      if(!Number.isInteger(n)||n<0){notice('Indique un nombre de véhicules valide.','error');return;}
      // Le serveur conserve les deux champs historiques : ils reçoivent la même valeur cible.
      submitTask(btn,function(){return onlineAction('config',{vehicules_prevus:n,quota_min:driver,quota_max:driver,reserve_a:$('#vehicleReserve').checked}).then(function(){notice('Paramètres enregistrés.','success');});});
    };
  }
  var fleetPending={};
  function renderFleet(c,d){
    var ref=state.role==='referent';
    c.innerHTML=(ref?'':'<button class="button secondary" data-page="home">← Accueil</button>')+'<div class="fleet-list">'+(d.vehicles||[]).filter(function(v){return !v.deleted;}).map(function(v){var pending=fleetPending[v.id]||{},fuel=v.fuelAlert||pending.fuel,panne=v.breakdownAlert||pending.panne,active=pending.active===undefined?v.active!==false:pending.active;return '<article class="card fleet-card"><div class="fleet-heading"><span class="vehicle-letter">'+esc(v.letter||(/^[A-Z]$/.test(String(v.id))?v.id:'—'))+'</span><div><b>'+esc(v.plate||'Immatriculation non renseignée')+'</b>'+(v.letter==='A'?'<small>Référents</small>':'')+'<small>'+esc(v.gearbox||v.transmission||'Boîte non renseignée')+'</small></div></div><div class="fleet-actions"><button type="button" class="fleet-icon '+(fuel?'fuel-alert':'')+'" data-fleet="fuel" data-id="'+esc(v.id)+'" aria-label="Signaler un besoin d’essence" title="Besoin d’essence">⛽</button><button type="button" class="fleet-icon '+(panne?'fuel-alert':'')+'" data-fleet="breakdown" data-id="'+esc(v.id)+'" aria-label="Signaler une panne ou casse" title="Panne ou casse"><svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 16V9h12l7-7 2 2-6 7h5l4 4h4v5H2zm20-4v5h6l-4-5z" fill="currentColor"/><circle cx="8" cy="20" r="3"/><circle cx="25" cy="20" r="3"/></svg></button>'+(ref?'<button type="button" class="fleet-icon '+(active?'vehicle-on':'vehicle-off')+'" data-fleet="availability" data-id="'+esc(v.id)+'" aria-label="'+(active?'Désactiver':'Réactiver')+' le véhicule" title="'+(active?'En service':'Hors service')+'">'+(active?'✓':'✕')+'</button>':'')+'</div>'+(fuel?'<small class="fleet-alert-label">Besoin d’essence</small>':'')+(panne?'<small class="fleet-alert-label">Panne ou casse signalée</small>':'')+(Object.keys(pending).length?'<small>Envoi en attente</small>':'')+'</article>';}).join('')+'</div>';
    if(!(d.vehicles||[]).some(function(v){return !v.deleted;}))c.insertAdjacentHTML('beforeend','<p>Aucun véhicule reçu.</p>');wireNav();
    c.querySelectorAll('[data-fleet]').forEach(function(b){b.onclick=function(){var v=(d.vehicles||[]).find(function(x){return x.id===b.dataset.id;}),action=b.dataset.fleet,pending=fleetPending[v.id]||{};
      if(action==='fuel'&&(v.fuelAlert||pending.fuel)){notice('Le besoin d’essence est déjà signalé.','info');return;}
      var active=pending.active===undefined?v.active!==false:pending.active;
      adminModal(action==='fuel'?'Besoin d’essence ?':action==='breakdown'?'Panne ou casse':active?'Désactiver le véhicule ?':'Réactiver le véhicule ?', '<p>'+esc(v.plate)+'</p>'+(action==='breakdown'?'<label>Quelle panne ou casse ?<textarea id="fleetDescription" rows="3" required></textarea></label>':action==='fuel'?'<p>Les référents recevront un message dans l’application.</p>':''),'Confirmer',function(close,confirm){var description=action==='breakdown'?$('#fleetDescription').value.trim():'';if(action==='breakdown'&&!description){$('#fleetDescription').reportValidity();return;}submitTask(confirm,function(){return terrainAction(action==='availability'?'vehicleAvailability':'incident',action==='availability'?{vehicleId:v.id,active:!active,baseVersion:v.version||0}:{vehicleId:v.id,type:action==='fuel'?'Plein à faire':'Panne',description:description}).then(function(){fleetPending[v.id]=Object.assign({},pending,action==='availability'?{active:!active}:action==='fuel'?{fuel:true}:{panne:true});close();render();});});});
    };});
  }
  function renderVehicles(c,d) {
    if(['referent','benevole'].includes(state.role)){renderFleet(c,d);return;}
    if(state.role==='admin'&&!state.adminVehicleView){renderVehicleNeeds(c,d);return;}

    var rows=activeRows(d,'vehicles'), v=(d.vehicles||[]).find(function(x){return x.id===state.vehicleId&&!x.deleted;});
    if(!v) {c.innerHTML=(state.role==='admin'?vehicleSettings(d):'')+(state.role==='vehicles'?'<a class="button primary" href="./reception.html">Réception / retour véhicule</a>':'')+(d.vehicles||[]).filter(function(x){return !x.deleted;}).map(function(x){return '<button class="card person-row" data-vehicle="'+esc(x.id)+'"><span class="person-main"><b>'+esc(x.plate||'Véhicule')+'</b><small>'+esc([x.make,x.model].filter(Boolean).join(' '))+'</small></span><span class="badge">'+(x.active===false?'HS':'En service')+'</span></button>';}).join('');if(!c.innerHTML)c.innerHTML=empty('Aucun véhicule','Les véhicules reçus apparaîtront ici.');wireManagement();wireVehicleSettings();return;}
    var manager=state.role==='admin'||state.role==='referent';
    c.innerHTML=(state.role==='admin'?vehicleSettings(d):'')+'<button class="button secondary" id="vehiclesBack">‹ Tous les véhicules</button>'+card(v.plate,[['Marque',v.make],['Modèle',v.model],['Type',v.type],['Couleur',v.color],['État',v.active===false?'Hors service':'En service'],['Essence',v.fuelAlert?'Plein à faire':'Aucune alerte']].map(function(x){return listRow(x[0],x[1]||'Non renseigné','');}).join(''))+
      card('Pannes et essence',(d.incidents||[]).filter(function(i){return i.vehicleId===v.id&&!i.deleted;}).map(function(i){return listRow(i.type,i.description||'',i.status)+(manager&&i.status!=='Clos'?'<button class="button secondary" data-incident-close="'+esc(i.id)+'">'+(i.type==='Plein à faire'?'Plein effectué':'Clore l’incident')+'</button>':'');}).join('')||'<p>Aucun signalement.</p>')+
      (manager?'<form id="incidentForm" class="form-grid"><input type="hidden" name="vehicleId" value="'+esc(v.id)+'"><label>Signalement<select name="type"><option>Panne</option><option>Plein à faire</option><option>Autre</option></select></label><label>Description<textarea name="description"></textarea></label><button class="button primary">Enregistrer le signalement</button></form>':'')+
      card('Réceptions et retours — consultation',(d.receptions||[]).filter(function(r){return r.vehicleId===v.id||String(r.plate).replace(/[^A-Z0-9]/gi,'').toUpperCase()===String(v.plate).replace(/[^A-Z0-9]/gi,'').toUpperCase();}).map(function(r){return '<details><summary>'+esc((r.direction||'Réception')+' · '+(r.status||'')+' · '+(r.createdAt||r.at||''))+'</summary>'+receptionDetails(r)+(r.pdfUrl&&/^https:\/\//.test(r.pdfUrl)?'<a class="button secondary" target="_blank" rel="noopener" href="'+esc(r.pdfUrl)+'">Voir le constat PDF</a>':'')+'</details>';}).join('')||'<p>Aucun constat disponible.</p>');wireManagement();wireVehicleSettings();
  }
  function renderVolunteerForm(c,d) {
    var p=(d.people||[]).find(function(p){return p.id===(state.role==='admin'&&state.editFormPerson||selfPersonId());});
    if(!p){c.innerHTML=empty('Formulaire personnel','Ouvre une session bénévole pour répondre.');return;}
    var old=(d.forms||[]).find(function(f){return f.personId===p.id;})||{}, slots=activeRows(d,'shifts').filter(function(s){return !s.brunch&&(s.day!=='mercredi'||p.wednesday);}), dates=Array.from(new Set(slots.map(function(s){return s.date;}))).sort();
    c.innerHTML=(state.role==='admin'?uxButton('‹ Formulaire','forms'):'')+(!navigator.onLine?'<p class="notice">Ce formulaire se transmet en ligne avant le festival. Reconnecte-toi pour envoyer ta réponse.</p>':'')+'<form id="volunteerForm" class="form-grid"><h2 class="full">Mes disponibilités</h2>'+dates.map(function(date,i){var choice=(old.choices||[]).find(function(c){return c.date===date;})||{}, rows=slots.filter(function(s){return s.date===date;});return '<fieldset class="full" data-choice-date="'+esc(date)+'"><legend>'+esc(date)+'</legend><label>Premier choix<select name="first'+i+'">'+options(rows,choice.first,function(s){return s.name;})+'</select></label><label>Second choix<select name="second'+i+'"><option value="">Choisir</option>'+options(rows,choice.second,function(s){return s.name;})+'</select></label><label class="check"><input type="checkbox" name="work'+i+'"'+(choice.work?' checked':'')+'>Contrainte professionnelle : je confirme ne pouvoir proposer qu’un seul choix</label></fieldset>';}).join('')+'<fieldset class="full"><legend>Concerts souhaités (3 maximum)</legend>'+activeRows(d,'concerts').map(function(x){return '<label class="check"><input type="checkbox" name="favoriteConcert" value="'+esc(x.id)+'"'+((old.concerts||[]).indexOf(x.id)>=0?' checked':'')+'>'+esc(x.artist+' · '+x.date+' · '+x.start)+'</label>';}).join('')+'</fieldset><label class="full">Note du formulaire<textarea name="note">'+esc(old.note||'')+'</textarea></label><label class="check full"><input type="checkbox" name="confirmOrange"'+(old.confirmOrange?' checked':'')+'>J’accepte les chevauchements de concerts de 30 minutes maximum</label><button class="button primary">Envoyer ma réponse</button></form>';wireManagement();
  }
  function wireManagement() {
    function clicks(selector, fn) {Array.prototype.forEach.call(document.querySelectorAll(selector),function(b){b.onclick=function(){return fn(b);};});}
    clicks('[data-terrain-shift]',function(b){state.terrainShift=b.dataset.terrainShift;go('terrain');});
    clicks('[data-vehicle]',function(b){state.vehicleId=b.dataset.vehicle;render();});
    var back=$('#vehiclesBack');if(back)back.onclick=function(){state.vehicleId='';render();};
    var rows=Array.prototype.slice.call(document.querySelectorAll('.form-track-row'));
    var search=$('#formTrackingSearch'), filter=$('#formTrackingFilter'), countLabel=$('#formRecipientCount');
    function refreshTracking(){
      var q=String(search&&search.value||'').trim().toLocaleLowerCase('fr');
      var f=filter&&filter.value||'all', visible=0, selected=0;
      rows.forEach(function(row){
        var show=(!q||row.dataset.name.indexOf(q)>=0)&&(f==='all'||(f==='unanswered'&&row.dataset.answer==='no')||(f==='answered'&&row.dataset.answer==='yes')||(f==='unsent'&&row.dataset.sent==='no'));
        row.hidden=!show;row.style.display=show?'flex':'none';if(show)visible++;
        if(row.querySelector('input').checked)selected++;
      });
      if(countLabel){var hiddenSelected=rows.filter(function(r){return r.hidden&&r.querySelector('input').checked;}).length;countLabel.textContent=selected+' sélectionné(s)'+(hiddenSelected?' dont '+hiddenSelected+' masqué(s) par le filtre':'');}
      var none=$('#formTrackingEmpty');if(none)none.hidden=visible>0;
    }
    if(search)search.oninput=refreshTracking;
    if(filter)filter.onchange=refreshTracking;
    rows.forEach(function(row){row.querySelector('input').onchange=refreshTracking;});
    var select=$('#selectUnanswered');if(select)select.onclick=function(){rows.forEach(function(row){if(!row.hidden)row.querySelector('input').checked=row.dataset.answer==='no';});refreshTracking();};
    var clear=$('#clearFormRecipients');if(clear)clear.onclick=function(){rows.forEach(function(row){row.querySelector('input').checked=false;});refreshTracking();};
    refreshTracking();
    var sendForms=$('#sendForms');if(sendForms)sendForms.onclick=function(){reviewFormsSend(checkedIds('[name="formRecipient"]'),sendForms);};
    var reset=$('#resetEdition');if(reset)reset.onclick=function(){if($('#resetConfirm').value!=='REMISE A ZERO'){notice('Recopie REMISE A ZERO pour confirmer.','error');return;}submitTask(reset,function(){return (window.Queue?Queue.list():Promise.resolve([])).then(function(rows){if(rows.length)throw Error('Vide ou résous les actions hors ligne avant la remise à zéro.');if(!window.confirm('Effacer les données de l’édition ? Fiches bénévoles et horaires seront conservés.'))return;return onlineAction('resetEdition',{confirm:'REMISE A ZERO'});});});};
    clicks('[data-message-read]',function(b){submitTask(b,function(){return terrainAction('read',{messageId:b.dataset.messageRead});});});
    clicks('[data-message-edit]',function(b){var m=(state.data.messages||[]).find(function(m){return m.id===b.dataset.messageEdit;}),f=$('#messageForm');if(!f||!m)return;['id','title','body','priority'].forEach(function(k){f.elements[k].value=m[k]|| (k==='priority'?'Info':'');});f.querySelectorAll('[name=targetGroup],[name=targetPerson]').forEach(function(x){x.checked=x.name==='targetPerson'?((m.targets||{}).people||[]).includes(x.value):x.value==='referents'?!!(m.targets||{}).referents:x.value==='volunteers'?!!((m.targets||{}).volunteers||(m.targets||{}).all):false;});f.dataset.originalTargets=JSON.stringify(m.targets||{});f.dataset.targetsChanged='';f.querySelector('.message-targets').onchange=function(){f.dataset.targetsChanged='yes';};f.scrollIntoView({block:'start'});});
    var message=$('#messageForm');if(message)message.onsubmit=function(e){e.preventDefault();var groups=checkedIds('[name="targetGroup"]'),ids=checkedIds('[name="targetPerson"]'),targets={referents:groups.includes('referents'),volunteers:groups.includes('volunteers'),people:ids,shifts:groups.includes('current')?activeRows(viewData(),'shifts').filter(function(sh){var t=period(sh);return t[0]<=appNow()&&appNow()<t[1];}).map(function(sh){return sh.id;}):[]};
      if(message.dataset.originalTargets&&!message.dataset.targetsChanged)targets=JSON.parse(message.dataset.originalTargets);
      if(!targets.all&&!targets.referents&&!targets.volunteers&&!(targets.people||[]).length&&!(targets.shifts||[]).length){notice('Sélectionne au moins un destinataire. Aucun créneau n’est en cours si cette option est cochée seule.','error');return;}
      submitTask(message.querySelector('button[type=submit],button.primary'),function(){return terrainSave('messages',{id:field(message,'id')||Transport.requestId(),title:field(message,'title'),body:field(message,'body'),priority:field(message,'priority'),urgent:field(message,'priority')==='Urgent',targets:targets,active:true}).then(function(){markClean();render();});});};
    clicks('[data-assignment-edit]',function(b){var a=(state.data.assignments||[]).find(function(a){return a.id===b.dataset.assignmentEdit;}),f=$('#assignmentForm');if(a&&f){var panel=f.closest('details');if(panel)panel.open=true;['id','personId','shiftId'].forEach(function(k){f.elements[k].value=a[k]||'';});f.scrollIntoView({block:'start'});}});
    clicks('[data-assignment-remove]',function(b){if(window.confirm('Retirer cette affectation du planning de travail ?'))submitTask(b,function(){return onlineAction('remove',{collection:'assignments',id:b.dataset.assignmentRemove});});});
    var assignment=$('#assignmentForm');if(assignment)assignment.onsubmit=function(e){e.preventDefault();submitTask(assignment.querySelector('button'),function(){return putRow('assignments',{id:field(assignment,'id')||Transport.requestId(),personId:field(assignment,'personId'),shiftId:field(assignment,'shiftId')});});};
    var runSimulation = $('#runSimulation');
    if (runSimulation) runSimulation.onclick = function () {
      if (!window.confirm('Lancer une nouvelle simulation ? Les ajustements de la précédente ne sont pas repris. Le planning officiel reste inchangé.')) return;
      submitTask(runSimulation, function () {
        return onlineAction('simulate', {name:'Simulation ' + new Date().toLocaleString('fr-FR')})
          .then(function () { notice('Simulation calculée. Consulte les résultats ci-dessus.', 'success'); });
      });
    };
    clicks('[data-plan]',function(b){
      if(!canLeave())return;
      var action=b.dataset.plan;
      if(action==='publish'||action==='draft'||action==='targeted'){publicationReview(action==='draft'?'draft':'final');return;}
      if(action==='rotations'){submitTask(b,function(){return onlineAction('rotations',{}).then(function(){state.planningCheckKey='';state.planningChecks=null;notice('Postes répartis. Tu peux contrôler le planning.','success');render();});});return;}
      if(action==='checks'){
        submitTask(b,function(){return Transport.mutate('planningChecks',{},Transport.requestId()).then(function(out){state.planningChecks=out.checks||[];state.planningCheckKey=AdminUX.checkSignature(state.data);render();});});return;
      }
      var payload={};if(action==='reopen'){payload.reason=window.prompt('Motif de la correction ou de la réouverture :');if(!payload.reason)return;}
      submitTask(b,function(){return onlineAction(action,payload).then(function(){if(action==='reopen'){state.planningCheckKey='';state.planningChecks=null;}notice(action==='validate'?'Planning validé. Vérifie maintenant la publication.':'Planning rouvert. La version publiée reste consultable.','success');render();});});
    });
    clicks('[data-accept-check]',function(b){submitTask(b,function(){return onlineAction('acceptCheck',{id:b.dataset.acceptCheck});});});
    var terrain=$('#terrainForm');if(terrain)terrain.onsubmit=function(e){e.preventDefault();submitTask(terrain.querySelector('button'),function(){return terrainSave('terrain',{id:Transport.requestId(),personId:field(terrain,'personId'),shiftId:field(terrain,'shiftId'),role:field(terrain,'role'),note:field(terrain,'note'),status:'Modification'});});};
    var ts=$('#terrainShift');if(ts)ts.onchange=function(){state.terrainShift=ts.value;render();};
    var incident=$('#incidentForm');if(incident)incident.onsubmit=function(e){e.preventDefault();submitTask(incident.querySelector('button'),function(){return terrainAction('incident',{vehicleId:field(incident,'vehicleId'),type:field(incident,'type'),description:field(incident,'description')});});};
    clicks('[data-incident-close]',function(b){submitTask(b,function(){return terrainAction('closeIncident',{id:b.dataset.incidentClose});});});
    var vf=$('#volunteerForm');if(vf)vf.onsubmit=function(e){e.preventDefault();var formPerson=state.role==='admin'&&state.editFormPerson||selfPersonId();var old=(state.data.forms||[]).find(function(f){return f.personId===formPerson;})||{};var choices=Array.prototype.map.call(vf.querySelectorAll('[data-choice-date]'),function(x,i){var work=vf.elements['work'+i].checked;return {date:x.dataset.choiceDate,first:field(vf,'first'+i),second:work?'':field(vf,'second'+i),work:work,confirmWork:work};});var data=Object.assign({},old,{personId:formPerson,choices:choices,concerts:checkedIds('[name="favoriteConcert"]'),note:field(vf,'note'),confirmOrange:vf.elements.confirmOrange.checked});submitTask(vf.querySelector('button'),function(){return onlineAction(state.role==='admin'?'adminFormSubmit':'formSubmit',data).then(function(){notice('Réponse enregistrée.','success');});});};
  }

  function start() {
    hideBoot();
    var l = $("#loginScreen"); if (l) l.classList.add("hidden");
    var s = $("#appShell"); if (s) s.classList.remove("hidden");
    var rl = $("#roleLabel"); if (rl) rl.textContent = ROLE[state.role] || "Bénévole";
    var ul = $("#userLabel"); if (ul) ul.textContent = (state.user && state.user.name) || "Mon espace";
    var ua = $("#userAvatar");
    if (ua) ua.textContent = String((state.user && state.user.name) || "B").trim().slice(0, 1).toUpperCase();
    if (state.role === "admin") state.page = "dashboard";
    else state.page = "home";
    nav();
    setTitle();
    render();
    syncBadge();
    wirePageContent();
  }

  /* ---------- Envoi ---------- */
  function send(action, data, okMessage) {
    if(state.testMode)return demoAction(action,data);
    var opId = Transport.requestId();
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ action: action, payload: data, opId: opId }).then(function () {
        notice("Action enregistrée hors ligne. Elle partira au retour du réseau.", "info");
        return refreshPending();
      });
    }
    return Transport.mutate(action, data, opId).then(function (out) {
      if (okMessage) notice(okMessage, "success");
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && ((e && e.name === "TypeError") || msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        return Queue.enqueue({ action: action, payload: data, opId: opId }).then(function () {
          notice("Réseau instable : action gardée et envoyée plus tard.", "info");
          return refreshPending();
        });
      }
      notice(msg, "error");
      throw e;
    });
  }

  /* ------------------------------------------------------------------
   * SUPPRESSION RÉELLE
   *
   * Une suppression n'est PAS une sauvegarde avec active:false. Elle
   * envoie l'action "remove" et la seule clé qui identifie la ligne :
   * son id. Jamais la date, le jour, l'artiste ou un rang de tableau.
   *
   * Le serveur fait le reste : recherche par id, retrait, renumérotation
   * de la journée, réécriture de la feuille.
   * ------------------------------------------------------------------ */
  function sendRemove(collection, id) {
    if(state.testMode)return demoAction('remove',{collection:collection,id:id});
    var opId = Transport.requestId();
    var cible = String(id || "");
    if (!cible) {
      return Promise.reject(new Error("Suppression impossible : identifiant manquant."));
    }

    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ opId: opId, collection: collection, action: "remove", entityId: cible, payload: { collection: collection, id: cible } })
        .then(function () {
          notice("Suppression enregistrée hors ligne. Envoi au retour du réseau.", "info");
          return refreshPending();
        });
    }

    return Transport.mutate("remove", { collection: collection, id: cible }, opId)
      .then(function (out) { return out; })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        if (window.Queue && ((e && e.name === "TypeError") || msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
          return Queue.enqueue({ opId: opId, collection: collection, action: "remove", entityId: cible, payload: { collection: collection, id: cible } })
            .then(function () {
              notice("Réseau instable : suppression gardée pour envoi.", "info");
              return refreshPending();
            });
        }
        throw e;
      });
  }

  function sendSave(collection, row, baseVersion, baseRow) {
    if(state.testMode)return demoAction('save',{collection:collection,row:row});
    var opId = Transport.requestId();
    if (!navigator.onLine && window.Queue) {
      return Queue.enqueue({ opId: opId, collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
        .then(function () { notice("Enregistré hors ligne. Envoi au retour du réseau.", "info"); return refreshPending().then(function () { return { queued: true, row: row }; }); });
    }
    return Transport.save(collection, row, baseVersion, baseRow, opId).then(function (out) {
      if (out && out.conflict) {
        notice("Conflit détecté : une autre personne a modifié cette fiche.", "error");
        throw new Error("Conflit détecté. La fiche n’a pas été enregistrée : synchronise avant de reprendre.");
      }
      return out;
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (window.Queue && ((e && e.name === "TypeError") || msg === "Failed to fetch" || msg.indexOf("ne répond pas") >= 0)) {
        return Queue.enqueue({ opId: opId, collection: collection, action: "save", value: row, baseVersion: baseVersion, baseRow: baseRow })
          .then(function () { notice("Réseau instable : fiche gardée pour envoi.", "info"); return refreshPending().then(function () { return { queued: true, row: row }; }); });
      }
      throw e;
    });
  }

  // The rehearsal lives only in memory: production cache, transport and queue stay separate.
  var demoBackup=null;
  function appNow(){return state.testMode&&Number.isFinite(state.testClock)?state.testClock:Date.now();}
  function wireTestControls(){
    var toggle=$('#testModeSwitch'),clock=$('#testClock');
    if(toggle)toggle.onchange=function(){var enabled=this.checked;if(!canLeave()){this.checked=!enabled;return;}if(writeBusy||busyCount||syncFlight){this.checked=!enabled;notice('Attends la fin de l’enregistrement ou de la synchronisation.','info');return;}
      if(enabled){demoBackup={data:state.data,planDay:state.planDay,checks:state.planningChecks,checkKey:state.planningCheckKey};state.data=JSON.parse(JSON.stringify(state.data));state.testMode=true;state.testClock=Date.now();createDemoShifts();}
      else{state.data=demoBackup.data;state.planDay=demoBackup.planDay;state.planningChecks=demoBackup.checks;state.planningCheckKey=demoBackup.checkKey;state.testMode=false;demoBackup=null;}
      state.simDrafts={};state.simUndo={};state.personId='';state.vehicleId='';state.editFormPerson='';viewMemory={};renderedView='';localTerrain=[];fleetPending={};markClean();setTitle();syncBadge();render();if(!enabled)syncNow();
    };
    if(clock)clock.onclick=function(){var parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(appNow())).replace(' ','T');
      adminModal('Horloge fictive','<p>Heure de Paris, uniquement dans cette version test.</p><label>Jour et heure<input id="demoDate" type="datetime-local" value="'+esc(parts)+'" required></label>','Appliquer',function(close){var value=$('#demoDate').value;if(!value)return;var day=value.slice(0,10),time=value.slice(11,16),h=Number(time.slice(0,2));var date=new Date(day+'T12:00:00Z');if(h<6)date.setUTCDate(date.getUTCDate()-1);state.testClock=period({date:date.toISOString().slice(0,10),start:time,end:time})[0];close();syncBadge();render();});
    };
  }
  function createDemoShifts(){
    var d=state.data,date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date()),ps=activeRows(d,'people').filter(function(p){return p.status!=='Désisté';});
    d.shifts=[];d.assignments=[];d.rotations=[];d.simulations=[];d.publications=[];d.terrain=[];d.incidents=[];d.messages=[];d.reads=[];d.deliveries=[];d.forms=[];
    for(var day=0;day<3;day++){var dt=new Date(date+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+day);var iso=dt.toISOString().slice(0,10);[['08:00','14:00'],['14:00','20:00'],['20:00','02:00']].forEach(function(times,i){var id='demo-'+day+'-'+(i+1);d.shifts.push({id:id,date:iso,day:dt.toLocaleDateString('fr-FR',{weekday:'long',timeZone:'Europe/Paris'}),start:times[0],end:times[1],name:'Créneau fictif '+(i+1),target:Math.ceil(ps.length/3),active:true});ps.filter(function(p,n){return n%3===i;}).forEach(function(p,n){d.assignments.push({id:id+'-'+p.id,personId:p.id,shiftId:id});d.rotations.push({id:id+'-r-'+p.id,personId:p.id,shiftId:id,start:times[0],end:times[1],role:n%2?'Chargeur':'Conducteur'});});});}
    d.config=Object.assign({},d.config,{validated:false,formOpen:true,closeAt:new Date(Date.now()+604800000).toISOString()});d.responseStats={receivedIds:[]};
    d.publications=[{id:'demo-publication',number:1,mode:'draft',snapshot:{assignments:JSON.parse(JSON.stringify(d.assignments)),rotations:JSON.parse(JSON.stringify(d.rotations))}}];state.planDay=date;
  }
  function installDemoTransport(){
    var mutate=Transport.mutate,save=Transport.save;
    Transport.mutate=function(action,data,op){return state.testMode?demoAction(action,data):mutate.call(Transport,action,data,op);};
    Transport.save=function(collection,row,version,base,op){return state.testMode?demoAction('save',{collection:collection,row:row}):save.call(Transport,collection,row,version,base,op);};
  }
  function demoAction(action,p){return Promise.resolve().then(function(){
    if(!state.testMode||state.authRole!=='admin')throw Error('Mode test réservé à l’administrateur.');
    var d=state.data;p=p||{};var row;
    function put(k,value){value=Object.assign({},value,{id:value.id||'demo-'+Transport.requestId(),version:1});d[k]=(d[k]||[]).filter(function(x){return x.id!==value.id;}).concat([value]);return value;}
    if(action==='save'){row=put(p.collection,p.row);}
    else if(action==='remove'){d[p.collection]=(d[p.collection]||[]).filter(function(x){return x.id!==p.id;});}
    else if(action==='config'){var aliases={annee:'year',nom_edition:'name',vehicules_prevus:'vehiclesPlanned',quota_min:'quotaMin',quota_max:'quotaMax',reserve_a:'reserveA',date_cloture:'closeAt',formulaire_ouvert:'formOpen',equipe_verifiee:'teamChecked',creneaux_verifies:'shiftsChecked',concerts_verifies:'concertsChecked'};Object.keys(p).forEach(function(k){d.config[aliases[k]||k]=p[k];});}
    else if(action==='formSubmit'||action==='adminFormSubmit'){row=put('forms',Object.assign({},p,{id:p.personId,status:'Reçu',submittedAt:new Date(appNow()).toISOString()}));d.responseStats.receivedIds=Array.from(new Set(d.responseStats.receivedIds.concat([p.personId])));}
    else if(action==='formStart'){row=put('forms',{id:p.personId,personId:p.personId,status:'En cours'});}
    else if(action==='simulate'){row=put('simulations',{id:'demo-sim-'+Transport.requestId(),name:'Simulation fictive locale',at:new Date().toISOString(),assignments:JSON.parse(JSON.stringify(d.assignments)),rotations:JSON.parse(JSON.stringify(d.rotations)),snapshot:JSON.parse(JSON.stringify({people:d.people,shifts:d.shifts,forms:d.forms,config:d.config})),stale:false});}
    else if(action==='useSimulation'){var sim=d.simulations.find(function(x){return x.id===p.id;});if(!sim)throw Error('Simulation absente.');d.assignments=simulationDraft(sim).map(function(x){return Object.assign({},x);});d.rotations=(sim.rotations||[]).slice();d.config.validated=false;}
    else if(action==='rotations'){d.rotations=d.assignments.map(function(a,i){var sh=shift(a.shiftId);return {id:'demo-r-'+i,personId:a.personId,shiftId:a.shiftId,start:sh.start,end:sh.end,role:i%2?'Chargeur':'Conducteur'};});}
    else if(action==='planningChecks'){return {checks:[{id:'demo-not-production',level:'info',message:'Version test : les contrôles métier de production ne sont pas exécutés.'}]};}
    else if(action==='validate'){d.config.validated=true;}
    else if(action==='reopen'){d.config.validated=false;}
    else if(action==='publish'){row=put('publications',{id:'demo-pub-'+Transport.requestId(),number:(AdminUX.latest(d)||{number:0}).number+1,mode:p.mode||'final',snapshot:JSON.parse(JSON.stringify({assignments:d.assignments,rotations:d.rotations}))});}
    else if(action==='read'){row=put('reads',{id:'demo-read-'+p.messageId,personId:selfPersonId(),messageId:p.messageId});}
    else if(action==='vehicleAvailability'){var v=d.vehicles.find(function(x){return x.id===p.vehicleId;});if(!v)throw Error('Véhicule absent.');v.active=p.active;}
    else if(action==='assignVehicleLetter'){var v=d.vehicles.find(function(x){return x.id===p.vehicleId;});if(!v)throw Error('Véhicule absent.');d.vehicles.forEach(function(x){if(x.letter===p.letter)x.letter='';});v.letter=p.letter;}
    else if(action==='incident'){var v=d.vehicles.find(function(x){return x.id===p.vehicleId;});if(!v)throw Error('Véhicule absent.');v[p.type==='Plein à faire'?'fuelAlert':'breakdownAlert']=true;row=put('incidents',Object.assign({},p,{status:'Ouvert'}));put('messages',{id:'vehicle-alert-demo-'+row.id,title:p.type+' · '+v.plate,body:p.description||'Besoin d’essence',audience:'referents',targets:{referents:true},priority:'Important'});}
    else if(action==='closeIncident'){var incident=d.incidents.find(function(x){return x.id===p.id;});if(incident)incident.status='Clos';}
    else throw Error('Cette opération reste désactivée en version test. Aucun envoi réel effectué.');
    markClean();notice('Version test : modification locale uniquement.','info');return {row:row};
  });}
  function renderVehicleNeeds(c,d){
    var count=Math.max(0,Math.floor(Number(d.config.vehiclesPlanned)||0)),real=(d.vehicles||[]).filter(function(v){return !v.deleted;});
    c.innerHTML=vehicleSettings(d)+card('Véhicules prévus',Array.from({length:count},function(_,i){var letter=vehicleLetter(i),v=real.find(function(x){return x.letter===letter;});return '<div class="vehicle-need"><b>'+letter+(letter==='A'?' · Référents':'')+'</b><label>Véhicule reçu<select data-letter="'+letter+'"><option value="">En attente de prise en charge</option>'+real.filter(function(x){return !x.letter||x.letter===letter;}).map(function(x){return '<option value="'+esc(x.id)+'"'+(v&&v.id===x.id?' selected':'')+'>'+esc(x.plate+' · '+[x.make,x.model,x.gearbox].filter(Boolean).join(' '))+'</option>';}).join('')+'</select></label><button type="button" class="button secondary" data-assign-letter="'+letter+'">Associer</button>'+(v?'<small>'+esc([v.plate,v.make,v.model,v.gearbox].filter(Boolean).join(' · '))+'</small>':'')+'</div>';}).join('')||'<p>Renseigne le nombre de véhicules prévus.</p>');
    wireVehicleSettings();c.querySelectorAll('[data-assign-letter]').forEach(function(b){b.onclick=function(){var letter=b.dataset.assignLetter,select=c.querySelector('[data-letter="'+letter+'"]');if(!select.value){notice('Sélectionne un véhicule dont la prise en charge est enregistrée.','info');return;}submitTask(b,function(){return onlineAction('assignVehicleLetter',{letter:letter,vehicleId:select.value});});};});
  }
  function vehicleLetter(i){var out='';for(i++;i>0;i=Math.floor((i-1)/26))out=String.fromCharCode(65+(i-1)%26)+out;return out;}

  // Admin workflow: rendering only, existing server actions remain authoritative.
  function organiseSteps(page){return '<nav class="organise-steps" aria-label="Organiser le planning">'+uxButton('‹ Préparer','prepare')+'<button type="button" class="button '+(page==='simulations'?'primary':'secondary')+'" data-page="simulations">1. Simulation</button><button type="button" class="button '+(page==='planning'?'primary':'secondary')+'" data-page="planning">2. Planning et publication</button></nav>';}
  function uxButton(label, page) {return '<button type="button" class="button secondary" data-page="'+page+'">'+esc(label)+'</button>';}
  function checksCurrent(){return state.planningCheckKey===AdminUX.checkSignature(state.data||{});}
  function nextStep(page){
    var steps=AdminUX.steps(state.data||{},checksCurrent()),index=steps.findIndex(function(s){return s.page===page;});
    var next=steps[index+1];return next?'<aside class="workflow-next"><span>Étape suivante : '+esc(next.label)+'</span>'+uxButton('Continuer →',next.page)+'</aside>':'';
  }
  function renderPreparation(c,d){
    if(state.role!=='admin'){go('home');return;}
    var steps=AdminUX.steps(d,checksCurrent()).slice(0,6);
    c.innerHTML=card('Préparer l’édition','<p>Complète chaque rubrique, puis vérifie les questions et le mail avant l’envoi.</p>'+steps.map(function(s){return '<button class="workflow-row" data-page="'+s.page+'"><span class="badge '+(s.done?'good':'')+'">'+(s.done?'Prêt':'À compléter')+'</span><span><b>'+esc(s.label)+'</b><small>'+esc(s.detail)+'</small></span><span>›</span></button>';}).join(''));wireNav();
  }
  function renderAdminDashboard(c,d){
    var steps=AdminUX.steps(d,checksCurrent()),next=steps.find(function(s){return !s.done;}),done=steps.filter(function(s){return s.done;}).length;
    c.innerHTML=card('Prochaine action',next?'<h3>'+esc(next.label)+'</h3><p>'+esc(next.detail)+'</p><button class="button primary" data-page="'+next.page+'">Continuer la préparation →</button>':'<p>Le planning validé correspond à la dernière version finale publiée.</p>'+uxButton('Consulter le planning','planning'))+
      card((d.config.name||'Beauregard')+' '+(d.config.year||''),'<p>'+done+' étapes sur '+steps.length+' terminées</p><progress max="'+steps.length+'" value="'+done+'" aria-label="Avancement"></progress><p class="muted">Tu peux revenir sur chaque rubrique. Toute modification du planning nécessite un nouveau contrôle.</p>')+
      card('Parcours de l’administrateur',steps.map(function(s,i){return '<button class="workflow-row" data-page="'+s.page+'"><span class="step-number">'+(s.done?'✓':i+1)+'</span><span><b>'+esc(s.label)+'</b><small>'+esc(s.detail)+'</small></span><span class="badge '+(s.done?'good':'')+'">'+(s.done?'Terminé':'À faire')+'</span></button>';}).join(''));
    wireNav();
  }
  function adminModal(title,body,confirmLabel,onConfirm){
    var root=$('#modalRoot'),previous=document.activeElement;
    root.innerHTML='<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="uxDialogTitle" tabindex="-1"><div class="modal-head"><h2 id="uxDialogTitle">'+esc(title)+'</h2><button class="button secondary" id="uxClose" aria-label="Fermer">✕</button></div>'+body+'<div class="modal-actions"><button class="button secondary" id="uxCancel">Annuler</button>'+(confirmLabel?'<button class="button primary" id="uxConfirm">'+esc(confirmLabel)+'</button>':'')+'</div></section></div>';
    function close(){root.innerHTML='';if(previous&&previous.isConnected)previous.focus();}
    $('#uxClose').onclick=close;$('#uxCancel').onclick=close;
    var dialog=root.querySelector('.modal');dialog.focus();
    dialog.onkeydown=function(e){if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){var els=Array.from(dialog.querySelectorAll('button,input,select,textarea,a[href]')).filter(function(x){return !x.disabled;});var first=els[0],last=els[els.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    if(confirmLabel)$('#uxConfirm').onclick=function(){onConfirm(close,this);};
  }
  function questionsPreview(d,p){
    var slots=activeRows(d,'shifts').filter(function(s){return !s.brunch&&(s.day!=='mercredi'||p.wednesday);}),days=Array.from(new Set(slots.map(function(s){return s.date;}))).sort();
    return '<p>Questions de l’application pour <b>'+esc([p.firstName,p.lastName].filter(Boolean).join(' ')||'un bénévole')+'</b>. Le mercredi dépend de sa fiche. Aperçu sans enregistrement.</p>'+days.map(function(date){var rows=slots.filter(function(s){return s.date===date;}).sort(function(a,b){return simShiftOrder(a)-simShiftOrder(b);});return '<fieldset><legend>'+esc(friendlyDay(date))+'</legend><p><b>Premier choix</b> et <b>Second choix</b></p><ul>'+rows.map(function(s){return '<li>'+esc(s.id+' · '+s.start+'–'+s.end)+'</li>';}).join('')+'</ul><p>☐ Contrainte professionnelle : je confirme ne pouvoir proposer qu’un seul choix</p></fieldset>';}).join('')+'<h3>Concerts souhaités (3 maximum)</h3><ul>'+activeRows(d,'concerts').map(function(x){return '<li>'+esc(x.artist+' · '+friendlyDay(x.date)+' · '+x.start)+'</li>';}).join('')+'</ul><p><b>Note du formulaire</b> : texte libre</p><p>☐ J’accepte les chevauchements de concerts de 30 minutes maximum</p>';
  }
  function addFormPreviews(c,d){
    var box=document.createElement('article');box.className='card';
    var ps=AdminUX.people(d);box.innerHTML='<h2>1. Vérifier les questions et le mail</h2><label for="previewPerson">Voir l’exemple pour</label><select id="previewPerson">'+options(ps,'',function(p){return [p.firstName,p.lastName].join(' ');})+'</select><details><summary>Questions du formulaire</summary><div id="questionsPreview"></div></details><details><summary>Mail d’accompagnement</summary><p><b>Objet : Beauregard — formulaire ouvert</b></p><pre class="mail-preview" id="formMailPreview"></pre><p class="muted">Modèle du script Code.gs sauvegardé le 13 octobre 2026. Le déploiement actif n’a pas pu être comparé. Le bouton d’envoi utilise le mail du serveur ; cet aperçu ne le modifie pas.</p><p>Le code personnel doit avoir été transmis séparément : ce mail ne contient pas de nouveau code.</p></details>';
    c.prepend(box);function update(){var p=ps.find(function(p){return p.id===$('#previewPerson').value;})||{firstName:'{Prénom}'};$('#questionsPreview').innerHTML=questionsPreview(d,p);$('#formMailPreview').textContent=AdminUX.formMail(d.config||{},p);}$('#previewPerson').onchange=update;update();
  }
  function publicationReview(mode){
    if(!canLeave())return;
    var d=state.data,delta=AdminUX.diff(d),pub=AdminUX.latest(d),ps=AdminUX.people(d);
    var rows=function(list){return list.length?'<ul>'+list.map(function(a){return '<li>'+esc(personLabel(a.personId)+' — '+a.shiftId)+'</li>';}).join('')+'</ul>':'<p>Aucune.</p>';};
    adminModal(pub?'Vérifier la nouvelle publication':'Vérifier la première publication','<p>Version prévue : <b>'+((pub?Number(pub.number):0)+1)+'</b>. Les affectations et rotations du planning de travail seront publiées.</p><h3>Affectations ajoutées</h3>'+rows(delta.added)+'<h3>Affectations retirées</h3>'+rows(delta.removed)+'<p>Les rotations et postes du planning de travail sont également inclus.</p><h3>Destinataires</h3><p>Une publication peut notifier toute l’équipe. Les personnes ci-dessous sont les bénévoles actifs ; la portée définitive reste contrôlée par le serveur.</p><ul>'+ps.map(function(p){return '<li>'+esc(personLabel(p.id)+' — '+(p.email||'Adresse email manquante'))+'</li>';}).join('')+'</ul><label>Message de publication<textarea id="publicationMessage" rows="4">'+esc(d.config.emailMessage||'Bonjour {Prénom}, ton planning est disponible.')+'</textarea></label>'+(pub?'<label>Motif de la correction<textarea id="publicationReason" rows="2" required></textarea></label>':'')+(state.testMode?'<p>Version test : aucun email et aucune publication réelle.</p>':'<p>Les emails seront pris en charge après la publication. Vérifie ensuite leur état dans le suivi.</p>'),'Publier et notifier',function(close,b){var message=$('#publicationMessage').value,reason=pub?$('#publicationReason').value.trim():'';if(pub&&!reason){$('#publicationReason').reportValidity();return;}submitTask(b,function(){return onlineAction('publish',{mode:mode||'final',message:message,reason:reason,changeType:pub?'correction':'initial'}).then(function(){close();notice('Publication enregistrée. Consulte le suivi des envois.','success');});});});
  }
  function renderPlanning(c,d){
    if(['benevole','referent'].includes(state.role)&&!AdminUX.latest(d)){c.innerHTML='<p>Le planning n’est pas encore publié.</p>';return;}
    var admin=state.role==='admin',cfg=d.config||{},pub=AdminUX.latest(d),valid=!!cfg.validated,same=!!(pub&&AdminUX.signature(pub.snapshot||{})===AdminUX.signature(d));
    var checks=checksCurrent()?state.planningChecks:null,accepted=cfg.checksAccepted||[],blocking=checks&&checks.some(function(x){return x.level==='red'||x.level==='orange'&&!accepted.some(function(a){return a.id===x.id;});});
    var intro='';
    if(admin){
      var action=!activeRows(d,'assignments').length?uxButton('Construire une simulation','simulations'):!valid&&!activeRows(d,'rotations').length?'<button class="button primary" data-plan="rotations">Répartir les postes Conducteur / Chargeur</button>':valid?(pub&&same?'<button class="button primary" data-plan="reopen">Préparer une correction</button>':'<button class="button primary" data-plan="publish">Vérifier puis publier</button>'):checks&&!blocking?'<button class="button primary" data-plan="validate">Valider le planning</button>':'<button class="button primary" data-plan="checks">Contrôler le planning</button>';
      intro=card('Prochaine action','<p class="badge">'+(valid?(pub&&same?'Planning publié et validé':'Planning validé · publication à vérifier'):'Planning de travail · non validé')+'</p><p>Simulation → postes → contrôle → validation → publication</p>'+action+'<details><summary>Autres actions</summary><div class="toolbar">'+uxButton('Revenir à la simulation','simulations')+(valid?'<button class="button secondary" data-plan="reopen">Rouvrir les modifications</button>':'<button class="button secondary" data-plan="rotations">Recalculer les postes</button><button class="button secondary" data-plan="checks">Relancer les contrôles</button>')+'</div></details>');
      if(checks)intro+=card('Résultats des contrôles',checks.map(function(x,i){return describeCheck(x,i)+(x.level==='orange'&&x.id&&!accepted.some(function(a){return a.id===x.id;})?'<button class="button secondary" data-accept-check="'+esc(x.id)+'">Accepter cette alerte</button>':'');}).join('')||'<p>Aucune anomalie détectée. Tu peux valider le planning.</p>');
      if(!valid)intro+='<details class="card" id="assignmentEditor"><summary>Ajouter ou modifier une affectation</summary><form id="assignmentForm" class="form-grid"><input type="hidden" name="id"><label>Bénévole<select name="personId">'+options(AdminUX.people(d),'',function(p){return personLabel(p.id);})+'</select></label><label>Créneau<select name="shiftId">'+options(activeRows(d,'shifts'),'',function(s){return friendlyDay(s.date)+' · '+s.id+' · '+s.start+'–'+s.end;})+'</select></label><button class="button primary">Enregistrer l’affectation</button></form></details>';
    }
    var shifts=activeRows(d,'shifts').slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date))||(['benevole','referent'].includes(state.role)?period(a)[0]-period(b)[0]:simShiftOrder(a)-simShiftOrder(b));}),rows=activeRows(d,'assignments'),days=Array.from(new Set(shifts.map(function(s){return s.date;}))).sort();
    var dayPick=state.planDay&&days.includes(state.planDay)?state.planDay:(days.find(function(x){return x>=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date(appNow()));})||days[days.length-1]);
    state.planDay=dayPick;
    var board=days.map(function(date){var columns=shifts.filter(function(s){return s.date===date;});return '<details class="card plan-day'+(date!==dayPick?' mobile-day-hidden':'')+'" open><summary>'+esc(friendlyDay(date))+'</summary><div class="planning-columns">'+columns.map(function(s){var members=rows.filter(function(a){return a.shiftId===s.id;});return '<section class="planning-column"><header><h3>'+esc(['benevole','referent'].includes(state.role)?(s.name||s.id):s.id)+'</h3><p>'+esc(s.start+'–'+s.end)+'</p><span class="badge">'+members.length+(s.target?' / '+s.target:'')+' personnes</span></header>'+members.map(function(a){return '<article class="assignment-card"><b>'+esc(personLabel(a.personId))+'</b>'+activeRows(d,'rotations').filter(function(r){return r.personId===a.personId&&r.shiftId===s.id;}).map(function(r){return '<small>'+esc(r.start+'–'+r.end+' · '+r.role)+'</small>';}).join('')+(admin&&!valid?'<div class="toolbar"><button class="button secondary" data-assignment-edit="'+esc(a.id)+'">Modifier</button><button class="button danger" data-assignment-remove="'+esc(a.id)+'">Retirer</button></div>':'')+'</article>';}).join('')+(members.length?'':'<p class="muted">Aucune affectation</p>')+'</section>';}).join('')+'</div></details>';}).join('');
    var status='';if(admin&&pub){var audience=pub.affectedIds||(pub.snapshot&&pub.snapshot.people||AdminUX.people(d)).map(function(p){return p.id;}),read=audience.filter(function(id){return (d.reads||[]).some(function(r){return r.messageId==='publication-'+pub.id&&r.personId===id;});}),reports=(d.deliveries||[]).filter(function(r){return r.publicationId===pub.id;});status=card('Suivi de la version '+pub.number,'<p>'+read.length+' / '+audience.length+' prises de connaissance · '+reports.filter(function(r){return r.status==='Envoyé';}).length+' emails envoyés</p><p class="muted">Une prise de connaissance n’est pas une acceptation du planning.</p><details><summary>Voir le détail par personne</summary>'+audience.map(function(id){var r=reports.find(function(r){return r.personId===id;});return listRow(personLabel(id),(r?r.status:'Envoi non renseigné')+' · '+(read.includes(id)?'A pris connaissance':'Lecture en attente'),'');}).join('')+'</details>');}
    c.innerHTML=(admin?organiseSteps('planning'):'')+intro+(pub&&pub.mode==='draft'?'<p class="notice">Planning provisoire</p>':'')+(days.length?'<div class="planning-tools"><button class="quiet-button" id="printPlanning">Imprimer le planning</button></div><nav class="day-carousel" aria-label="Journées du planning">'+days.map(function(date){return '<button type="button" data-plan-day="'+esc(date)+'" aria-pressed="'+(date===dayPick)+'" class="day-chip'+(date===dayPick?' active':'')+'">'+esc(friendlyDay(date))+'</button>';}).join('')+'</nav>':days.length?'<label class="mobile-day-picker">Journée<select id="planningDay">'+days.map(function(date){return '<option value="'+esc(date)+'"'+(date===dayPick?' selected':'')+'>'+esc(friendlyDay(date))+'</option>';}).join('')+'</select></label>':'')+(board||empty('Aucun créneau','Prépare les créneaux avant de construire le planning.'))+status;
    var print=$('#printPlanning');if(print)print.onclick=function(){window.print();};
    document.querySelectorAll('[data-plan-day]').forEach(function(b){b.onclick=function(){state.planDay=b.dataset.planDay;render();};});
    var chosen=c.querySelector('.day-chip.active');if(chosen&&chosen.parentElement)chosen.parentElement.scrollLeft=Math.max(0,chosen.offsetLeft-chosen.parentElement.offsetLeft-30);
    wireManagement();wireNav();var daySelect=$('#planningDay');if(daySelect)daySelect.onchange=function(){state.planDay=this.value;render();};
  }
  var unsaved=false;
  function markClean(){unsaved=false;var b=$('#unsavedStatus');if(b)b.hidden=true;}
  function canLeave(){if(!unsaved)return true;if(!window.confirm('Des modifications ne sont pas enregistrées. Quitter et les abandonner ?'))return false;markClean();return true;}
  function installUX(){
    document.addEventListener('input',function(e){if(e.target.closest('#pageContent form, #pageContent .form-grid')&&!e.target.closest('#formTracking')){unsaved=true;var b=$('#unsavedStatus');if(b)b.hidden=false;}});
    document.addEventListener('change',function(e){if(e.target.closest('#pageContent form, #pageContent .form-grid')&&!e.target.closest('#formTracking')){unsaved=true;var b=$('#unsavedStatus');if(b)b.hidden=false;}});
    document.addEventListener('click',function(e){var b=e.target.closest('[data-team],[data-person],[data-creneaux],[data-concerts],[data-setup],[data-shift],[data-concert],[data-new-shift],[data-new-concert],#vehiclesBack');if(b&&unsaved&&!canLeave()){e.preventDefault();e.stopImmediatePropagation();}},true);
    window.addEventListener('beforeunload',function(e){if(unsaved||busyCount||writeBusy){e.preventDefault();e.returnValue='';}});
    var status=$('#mobileSyncStatus');if(status&&!$('#showSyncDetails')){status.insertAdjacentHTML('beforeend','<button id="showSyncDetails" class="quiet-button">Voir les envois</button>');$('#showSyncDetails').onclick=function(){go('syncstatus');};}
    var sync=$('#syncMobile');if(sync)sync.onclick=function(){syncNow();};
    var dismiss=$('#dismissNotice');if(dismiss)dismiss.onclick=function(){$('#appNotice').classList.add('hidden');};
  }
  function teamTools(c,d){
    var tools=document.createElement('article');tools.className='card';tools.innerHTML='<h2>Constituer l’équipe</h2><div class="toolbar"><button class="button secondary" id="importTeam">Importer un CSV</button><button class="button secondary" id="manageGroups">Gérer les groupes</button></div><p>'+AdminUX.people(d).filter(function(p){return !p.email;}).length+' fiche(s) sans email. Vérifie les coordonnées et les contraintes avant de créer les accès.</p><button class="button secondary" id="checkTeam">Marquer l’équipe vérifiée</button>';var anchor=c.querySelector('.team-list');if(anchor)anchor.before(tools);else c.append(tools);
    $('#checkTeam').onclick=function(){submitTask(this,function(){return onlineAction('config',{equipe_verifiee:true});});};
    $('#importTeam').onclick=function(){
      adminModal('Importer des bénévoles','<p>Ajout de nouvelles fiches uniquement. Les doublons sont ignorés. Colonnes : Nom, Prénom, Email, Téléphone ; facultatives : Rôle, Boîte de vitesses, Groupe.</p><input id="teamCSV" type="file" accept=".csv,text/csv"><div id="csvResult" role="status"></div>','Importer les nouvelles fiches',function(close,b){var data=state.csvImport||[];if(!data.length){notice('Choisis un CSV contenant de nouvelles fiches.','error');return;}submitTask(b,async function(){var done=0;try{for(var p of data){await putRow('people',p);done++;state.csvImport=data.slice(done);}close();notice(done+' fiches importées. Vérifie leurs contraintes.','success');}catch(e){$('#csvResult').textContent=done+' fiches ajoutées. '+e.message;throw e;}});});
      state.csvImport=[];$('#teamCSV').onchange=async function(){try{var f=this.files[0];if(!f)return;if(f.size>2*1024*1024)throw Error('CSV limité à 2 Mo.');var candidates=AdminUX.parseCSV(await f.text()),seen=new Set();var names=(state.data.people||[]).map(function(p){return (p.firstName+'|'+p.lastName).toLocaleLowerCase('fr');});state.csvImport=candidates.filter(function(p){var key=(p.firstName+'|'+p.lastName).toLocaleLowerCase('fr');if(names.includes(key)||seen.has(key)||(p.email&&(state.data.people||[]).some(function(x){return String(x.email||'').toLowerCase()===p.email.toLowerCase();})))return false;seen.add(key);p.id='p-'+Transport.requestId().slice(0,8);return true;});$('#csvResult').innerHTML='<p>'+state.csvImport.length+' nouvelles fiches · '+(candidates.length-state.csvImport.length)+' doublons ignorés</p><ul>'+state.csvImport.map(function(p){return '<li>'+esc(p.firstName+' '+p.lastName+' — '+(p.email||'Email manquant'))+'</li>';}).join('')+'</ul>';}catch(e){state.csvImport=[];$('#csvResult').textContent=e.message;}};
    };
    $('#manageGroups').onclick=function(){var ps=AdminUX.people(state.data),groups=Array.from(new Set(ps.map(function(p){return p.mandatoryGroupId;}).filter(Boolean)));adminModal('Gérer un groupe indivisible','<p>Choisis un groupe existant ou saisis un nom. Coche tous ses membres. Les personnes décochées seront retirées de ce groupe.</p><label>Groupe existant<select id="uxGroupSelect"><option value="">Nouveau groupe</option>'+groups.map(function(g){return '<option>'+esc(g)+'</option>';}).join('')+'</select></label><label>Nom du groupe<input id="uxGroupName" maxlength="48"></label><div class="group-members">'+ps.map(function(p){return '<label class="check"><input type="checkbox" name="uxGroupMember" value="'+esc(p.id)+'"><span>'+esc(personLabel(p.id))+(p.mandatoryGroupId?' · '+esc(p.mandatoryGroupId):'')+'</span></label>';}).join('')+'</div><p>Pour dissoudre un groupe existant, décoche tous ses membres puis enregistre.</p>','Enregistrer le groupe',function(close,b){var name=$('#uxGroupName').value.trim(),old=$('#uxGroupSelect').value,ids=checkedIds('[name="uxGroupMember"]');if(!name){notice('Indique le nom du groupe.','error');return;}if(!old&&groups.includes(name)){notice('Sélectionne ce groupe dans la liste avant de le modifier.','error');return;}var changes=ps.filter(function(p){return ids.includes(p.id)||old&&p.mandatoryGroupId===old;});submitTask(b,async function(){var done=0;try{for(var p of changes){await putRow('people',{id:p.id,mandatoryGroupId:ids.includes(p.id)?name:''});done++;}close();notice('Groupe mis à jour : '+ids.length+' membres.','success');}catch(e){notice(done+' fiches mises à jour avant interruption. '+e.message,'error');throw e;}});});$('#uxGroupSelect').onchange=function(){$('#uxGroupName').value=this.value;var g=this.value;document.querySelectorAll('[name="uxGroupMember"]').forEach(function(x){x.checked=!!g&&ps.find(function(p){return p.id===x.value;}).mandatoryGroupId===g;});};
    };
  }
  function reviewFormsSend(ids,button){
    if(!canLeave())return;
    if(!ids.length){notice('Coche au moins une personne.','error');return;}
    var ps=ids.map(function(id){return state.data.people.find(function(p){return p.id===id;});}).filter(Boolean);
    adminModal('Vérifier les destinataires','<p>'+ps.length+' personnes sélectionnées, y compris celles masquées par le filtre.</p><ul>'+ps.map(function(p){return '<li>'+esc(personLabel(p.id)+' — '+(p.email||'Email manquant'))+'</li>';}).join('')+'</ul><details><summary>Voir le mail pour '+esc(ps[0].firstName)+'</summary><pre class="mail-preview">'+esc(AdminUX.formMail(state.data.config,ps[0]))+'</pre><p>Modèle du script sauvegardé ; le serveur effectue l’envoi.</p></details>','Envoyer à ces personnes',function(close,b){submitTask(b,function(){return onlineAction('sendForms',{people:ids}).then(function(){close();notice('Envoi traité. Vérifie les éventuels échecs dans le suivi.','success');});});});
  }
  function enhanceSimulation(){
    if(state.role!=='admin')return;
    var host=$('#pageContent'),sim=activeRows(state.data,'simulations').slice().sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));})[0];if(!sim||!host.querySelector('[data-sim-reset]'))return;
    var undo=document.createElement('button');undo.className='button secondary';undo.textContent='Annuler le dernier déplacement';undo.disabled=!(state.simUndo&&state.simUndo[sim.id]&&state.simUndo[sim.id].length);host.querySelector('[data-sim-reset]').before(undo);
    undo.onclick=function(){var rows=state.simUndo[sim.id].pop();state.simDrafts[sim.id]=rows;try{(state.testMode?function(){}:localStorage.setItem.bind(localStorage))('bg_sim_draft_'+sim.id,JSON.stringify(rows));}catch(e){notice('Stockage indisponible : garde cette page ouverte.','error');}render();};
    host.querySelectorAll('[data-sim-person]').forEach(function(b){var select=document.createElement('select');select.className='sim-destination';select.setAttribute('aria-label','Déplacer '+personLabel(b.dataset.simPerson)+' vers un créneau');select.innerHTML='<option value="">Déplacer vers…</option>'+activeRows(state.data,'shifts').filter(function(s){return s.date===b.dataset.simDate;}).sort(function(a,b){return simShiftOrder(a)-simShiftOrder(b);}).map(function(s){var count=simulationDraft(sim).filter(function(a){return a.shiftId===s.id;}).length;return '<option value="'+esc(s.id)+'" '+(s.id===b.dataset.simSource?'disabled':'')+'>'+esc(s.id+' · '+s.start+'–'+s.end+' · '+count+' personnes')+'</option>';}).join('');b.parentElement.append(select);select.onchange=function(){if(!this.value)return;state.simPick={id:sim.id,personId:b.dataset.simPerson,source:b.dataset.simSource,date:b.dataset.simDate};var target=Array.from(host.querySelectorAll('.sim-shift-column')).find(function(x){return x.dataset.simShift===select.value;});if(target)target.moveSim();};});
  }

  installDemoTransport();
  installUX();

  var loginForm = $("#loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#loginError");
      err.textContent = "Connexion…";
      if (BOOT && BOOT.start) BOOT.start();
      Transport.login($("#accessCode").value, ($("#operatorName") || {}).value || "")
        .then(function (out) {
          if (!out || !out.user) throw new Error("Réponse de connexion incomplète.");
          state.user = out.user;
          state.authRole = out.user.role || "benevole";state.role=state.authRole;
          err.textContent = "";
          var cached=readLocal();
          if(cached&&cached.data&&cached.data.user&&cached.data.user.id===state.user.id){state.data=cached.data;if(state.authRole==='admin'&&['admin','referent','benevole'].includes(cached.role))state.role=cached.role;state.version=cached.uiVersion===3?cached.version:0;state.lastSyncAt=cached.lastSyncAt||0;bootDone();start();refreshPending().then(function(){if(navigator.onLine)syncNow();}).catch(function(){});return null;}else{state.data=null;state.version=0;}
          return Transport.sync(state.version,state.authRole||state.role);
        })
        .then(function (bundle) {
          if(!bundle)return;
          state.data = mergeBundle(bundle);
          state.version = (bundle && bundle.version) || 0;
          state.lastSyncAt=Date.now();saveLocal();
          bootDone();
          start();
          return refreshPending();
        })
        .then(function () { return flushQueue(); })
        .catch(function (x) {
          var msg = (x && x.message) || "Connexion impossible";
          err.textContent = msg;
          bootFail(msg);
        });
    });
  }

  window.logout = function () {
    if(!canLeave())return;
    if(state.pending&&!window.confirm('Des actions attendent encore leur envoi. La déconnexion supprimera les données de consultation ; les actions resteront liées à ce compte. Continuer ?'))return;
    clearTimeout(syncTimer);
    state.testMode=false;demoBackup=null;state.adminVehicleView=false;
    try { Transport.logout().catch(function () {}); } catch (e) {}
    state.user = null; state.data = null; state.personId = "";
    state.shiftMode = ""; state.shiftId = ""; state.concertMode = ""; state.concertId = "";
    state.open = "";state.planDay="";
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    Transport.setToken("");
    state.syncError = "";
    var s = $("#appShell"); if (s) s.classList.add("hidden");
    showLogin();
    var ac = $("#accessCode"); if (ac) ac.value = "";
  };

  window.navigate = go;

  function flushQueue() {
    if(state.testMode)return Promise.resolve();
    if (!window.Queue) return Promise.resolve();
    return Queue.flush().then(function (r) {
      state.pending = (r && r.remaining) || 0;
      syncBadge();
      if (r && r.sent) notice(r.sent + " modification(s) envoyée(s).", "success");
      return Queue.list();
    }).then(function (rows) {
      var conflicts = (rows || []).filter(function (x) { return x.state === "conflict" && x.authorId === (state.user && state.user.id); });
      if (conflicts.length) notice(conflicts.length + " modification(s) en conflit à arbitrer.", "error");
    }).catch(function () {});
  }

  var syncFlight=null,syncTimer=null,retryDelay=15000;
  function syncNow() {
    if(state.testMode){syncBadge();return Promise.resolve();}
    if(syncFlight)return syncFlight;
    if (!state.user || !state.role || !navigator.onLine) {syncBadge();return Promise.resolve();}
    clearTimeout(syncTimer);state.syncing=true;syncBadge();
    var userId=state.user.id;
    syncFlight=Promise.resolve().then(function(){return Queue.flush();}).then(function(result){
      if(result&&result.networkError)throw Error('Réseau instable : envois conservés, nouvelle tentative différée.');
      if(!state.user||state.user.id!==userId)throw Error('Session modifiée.');
      return Transport.sync(state.version,state.authRole||state.role);
    }).then(function(bundle){return Queue.list().then(function(rows){return {bundle:bundle,rows:rows};});}).then(function(packet){
      var bundle=packet.bundle;
      if(!state.user||state.user.id!==userId)return;
      var previous={data:state.data,version:state.version,at:state.lastSyncAt};
      state.data=mergeBundle(bundle);
      packet.rows.filter(function(r){return r.authorId===userId&&(r.state==='pending'||r.state==='blocked');}).forEach(function(r){
        if(!r.collection)return;
        if(r.action==='remove')state.data[r.collection]=(state.data[r.collection]||[]).filter(function(x){return x.id!==r.entityId;});
        else state.data[r.collection]=(state.data[r.collection]||[]).filter(function(x){return x.id!==(r.value||{}).id;}).concat([r.value]);
      });
      state.version=bundle.version||state.version;state.lastSyncAt=Date.now();
      try{saveLocal();}catch(e){state.data=previous.data;state.version=previous.version;state.lastSyncAt=previous.at;throw e;}
      state.syncError='';retryDelay=15000;
    }).catch(function(e){state.syncError=String(e.message||e);retryDelay=Math.min(retryDelay*2,300000);}).then(function(){
      return refreshPending();
    }).then(function(){
      state.syncing=false;syncFlight=null;syncBadge();
      if(!unsaved&&!document.querySelector('#pageContent form, .acc-body .form-grid'))render();
      if(state.retryablePending&&navigator.onLine)syncTimer=setTimeout(syncNow,retryDelay);
    },function(e){state.syncing=false;syncFlight=null;state.syncError=String(e.message||e);syncBadge();});
    return syncFlight;
  }

  function terrainAction(action,payload){
    if(state.testMode)return demoAction(action,payload).then(function(out){markClean();return out;});
    if(!window.Queue)return Promise.reject(Error('Stockage des actions indisponible.'));
    return Queue.enqueue({action:action,payload:payload,opId:Transport.requestId()}).then(function(){
      markClean();return refreshPending();
    }).then(function(){notice('Enregistré sur ce téléphone · en attente de confirmation d’envoi.','info');
      clearTimeout(syncTimer);if(navigator.onLine)syncTimer=setTimeout(syncNow,1500);
      return {queued:true};
    });
  }
  function terrainSave(collection,row){
    var old=(state.data[collection]||[]).find(function(x){return x.id===row.id;});
    return terrainAction('save',{collection:collection,row:Object.assign({},old||{},row),baseVersion:old?old.version:0,baseRow:old||null});
  }
  function renderSyncStatus(c){
    c.innerHTML=card('Version sur ce téléphone','<p>'+esc($('#mobileConnectionText').textContent)+'</p><p>Les horaires sont calculés avec l’horloge du téléphone. Après le premier téléchargement, seuls les changements sont demandés.</p><p id="offlineAvailability">Vérification des fichiers déjà présents…</p><button class="button primary" id="syncChanges">Synchroniser les changements</button>')+card('Actions à envoyer','<div id="pendingActions">Lecture du stockage local…</div><button class="button secondary" id="retryPending">Réessayer les actions bloquées</button>');
    $('#syncChanges').onclick=syncNow;
    var essential=['./index.html','./base.css','./theme.css','./themes/2027/theme.css?v=20261014-terrain','./js/queue.js?v=20261014-terrain','./js/transport.js','./js/admin-ux.js?v=20261014-terrain','./app.js?v=20261014-terrain'];
    if(window.caches)Promise.all(essential.map(function(url){return caches.match(new URL(url,document.baseURI).href);})).then(function(results){var el=$('#offlineAvailability');if(el)el.textContent=results.every(Boolean)&&readLocal()?'Données locales et fichiers essentiels présents sur cet appareil.':'Préparation locale incomplète : ouvrir l’application avec du réseau avant le festival.';}).catch(function(){var el=$('#offlineAvailability');if(el)el.textContent='Disponibilité hors réseau non vérifiable.';});
    else $('#offlineAvailability').textContent='Disponibilité hors réseau non vérifiable.';
    $('#retryPending').onclick=function(){Queue.retryBlocked().then(syncNow).catch(function(e){notice(e.message,'error');});};
    Queue.list().then(function(rows){var host=$('#pendingActions');if(!host)return;host.innerHTML=rows.filter(function(r){return r.authorId===(state.user||{}).id;}).map(function(r){return listRow(({read:'Confirmation de lecture',save:'Enregistrement',incident:'Signalement',closeIncident:'Clôture de signalement'})[r.action]||r.action,new Date(r.at).toLocaleString('fr-FR')+(r.error?' · '+r.error+(r.state==='conflict'?' · À faire arbitrer par l’organisation avant un nouvel envoi.':''):''),r.state==='pending'?'En attente':r.state==='conflict'?'Conflit à résoudre':'Envoi bloqué');}).join('')||'<p>Aucune action en attente.</p>';}).catch(function(e){notice(e.message,'error');});
  }

  function refreshClock(){if(state.user&&!unsaved&&['home','myshifts'].includes(state.page)&&!document.hidden)render();}
  setInterval(refreshClock,30000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshClock();});
  var sn = $("#syncNow");
  if (sn) sn.onclick = function () { syncNow(); };
  window.addEventListener("online", function () { syncNow(); });
  window.addEventListener("offline", function () { syncBadge(); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function () {});

  try {
    if (window.Transport && Transport.token()) {
      var local = readLocal();
      if (local) {
        state.data = local.data;
        state.authRole=local.authRole||(local.data.user||{}).role||local.role;state.role=local.role;
        state.version = local.uiVersion===3?local.version:0;state.lastSyncAt=local.lastSyncAt||0;
        state.user = { id: (local.data.user || {}).id, name: (local.data.user || {}).name, role: state.authRole };
        bootSkip();
        start();
        refreshPending().then(function(){if(navigator.onLine)syncNow();}).catch(function(){});
      } else {
        bootSkip();
        showLogin();
      }
    } else {
      bootSkip();
      showLogin();
    }
  } catch (e) {
    bootFail(String(e.message || e));
  }
})();
