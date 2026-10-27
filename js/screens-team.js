/* Beauregard V2 — écran Équipe : liste, fiche, création, accès.
 * Points 8 à 11 du cahier des charges : fiche complète, création manuelle
 * depuis smartphone, suppression, génération des codes personnels.
 *
 * Le serveur ne transmet JAMAIS le hash d'accès : il envoie seulement
 * `hasCode` et `active`. L'écran s'appuie donc sur hasCode.
 * L'écran de codes comporte toujours un bouton de retour.
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
  var label = function (p) { return [p.firstName, p.lastName].filter(Boolean).join(" "); };

  var filter = "";

  function list(ctx) {
    var all = (ctx.data.people || []).filter(function (p) { return !p.deleted; });
    var people = all;
    var q = filter.trim().toLowerCase();
    if (q) {
      people = people.filter(function (p) {
        return (label(p) + " " + (p.phone || "") + " " + (p.email || "")).toLowerCase().indexOf(q) >= 0;
      });
    }
    people = people.slice().sort(function (a, b) {
      if ((a.role === "referent") !== (b.role === "referent")) return a.role === "referent" ? -1 : 1;
      return label(a).localeCompare(label(b), "fr");
    });

    var access=ctx.data.access||[],hasCode={};access.forEach(function(a){if(a.hasCode)hasCode[a.personId]=true;});
    var stats=ctx.data.responseStats,received=stats&&Array.isArray(stats.receivedIds)?new Set(stats.receivedIds.map(String)):null;
    function answered(p){if(received)return received.has(String(p.id));return (ctx.data.forms||[]).some(function(f){return !f.deleted&&f.personId===p.id&&(f.submittedAt||/^(reçu|recu|validé|valide)$/i.test(f.status||''));});}
    var volunteers=all.filter(function(p){return p.role!=='referent'&&p.status!=='Désisté'&&p.active!==false;}),filled=volunteers.filter(answered).length;
    var rows=people.map(function(p){var flags=(p.role==='referent'?'<span>Référent</span>':'')+'<span>'+ (hasCode[p.id]?'Accès créé':'Sans accès')+'</span>'+(p.role==='referent'?'':'<span class="'+(answered(p)?'form-received':'')+'">'+(answered(p)?'Formulaire reçu':'Formulaire non reçu')+'</span>');return '<article class="team-card"><button type="button" class="person-row team-person" data-person="'+esc(p.id)+'">'+root.RunnerPhotos.html(p)+'<span class="person-main"><b>'+esc(label(p))+'</b></span><span class="team-flags">'+flags+'</span></button><div class="team-actions">'+(p.phone?'<a class="contact-icon" href="tel:'+esc(String(p.phone).replace(/[^+0-9]/g,''))+'" aria-label="Appeler '+esc(label(p))+'" title="Appeler">☎</a>':'')+(p.email?'<a class="contact-icon" href="mailto:'+esc(p.email)+'" aria-label="Envoyer un mail à '+esc(label(p))+'" title="Mail">✉</a>':'')+'</div></article>';}).join('');
    return '<div class="team-search"><input class="search" id="teamSearch" type="search" placeholder="Chercher un nom, un téléphone…" value="'+esc(filter)+'"><div class="team-stats"><span>'+people.length+' / '+all.length+' fiches</span><span>'+all.filter(function(p){return hasCode[p.id];}).length+' accès créés</span><span>'+filled+' / '+volunteers.length+' formulaires bénévoles</span></div></div>'+(ctx.role==='admin'?'<div class="toolbar"><button class="button primary" data-team="new">Nouvelle fiche</button><button class="button secondary" data-team="access">Créer les accès</button></div>':'')+'<div class="card team-list">'+(rows||'<p>Aucune personne ne correspond à cette recherche.</p>')+'</div>';
  }

  function checks(p) {
    var one = function (name, text, on) {
      return '<label class="check"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "><span>" + esc(text) + "</span></label>";
    };
    return '<div class="full contraintes"><div class="section-title">Contraintes et pr\u00e9f\u00e9rences</div>' +
      one("forbidC3", "C3 interdit (contrainte dure)", p.forbidC3) +
      one("driverOnly", "Conducteur uniquement (contrainte dure)", (p.driverOnly || p.noLoader)) +
      one("priorityLoader", "Priorit\u00e9 Chargeur (PC)", p.priorityLoader) +
      one("firstYear", "Premi\u00e8re ann\u00e9e (1A)", p.firstYear) +
      one("wednesday", "Mercredi présent", p.wednesday) +
      "</div>";
  }

  function formSection(ctx,p,reply){
    var d=ctx.data, published=!!(window.AdminUX&&AdminUX.latest(d)), assigned=(d.assignments||[]).filter(function(a){return !a.deleted&&a.personId===p.id;}), shifts=d.shifts||[];
    function name(id){var sh=shifts.find(function(x){return x.id===id;});return sh?(sh.name+' · '+sh.start+'–'+sh.end):'Non renseigné';}
    function interval(x){var date=x.date;if(!date||!x.start||!x.end)return null;var start=Number(x.start.slice(0,2))*60+Number(x.start.slice(3,5)),end=Number(x.end.slice(0,2))*60+Number(x.end.slice(3,5)),base=Date.parse(date+'T00:00:00Z');if(start<360)start+=1440;if(end<=start)end+=1440;return [base+start*60000,base+end*60000];}
    var choices=(reply.choices||[]).map(function(c){var actual=assigned.filter(function(a){return shifts.some(function(sh){return sh.id===a.shiftId&&sh.date===c.date;});});var first=actual.some(function(a){return a.shiftId===c.first;}),second=actual.some(function(a){return a.shiftId===c.second;});var text=first?'Premier choix respecté':second?'Second choix respecté':'Choix non respecté';return '<div class="form-preference '+(published?(first?'choice-good':second?'choice-second':'choice-bad'):'')+'"><b>'+esc(c.date)+'</b><p>1. '+esc(name(c.first))+'</p><p>2. '+esc(name(c.second))+'</p>'+(c.work?'<p>Contrainte professionnelle</p>':'')+(published?'<small>'+text+'</small>':'')+'</div>';}).join('');
    var concerts=(reply.concerts||[]).map(function(id){var concert=(d.concerts||[]).find(function(x){return x.id===id;});if(!concert)return '';var ci=interval(concert), conflicts=assigned.some(function(a){var sh=shifts.find(function(x){return x.id===a.shiftId;}),si=sh&&interval(sh);return ci&&si&&ci[0]<si[1]&&si[0]<ci[1];});return '<p class="form-preference '+(published?(conflicts?'choice-bad':'choice-good'):'')+'">'+esc((concert.artist||concert.name)+' · '+concert.date+' · '+concert.start)+(published?' — '+(conflicts?'Chevauchement avec un créneau':'Concert disponible'):'')+'</p>';}).join('');
    return '<section class="full form-replies"><h3>Formulaire · lecture seule</h3>'+choices+concerts+'<h4>Note du formulaire</h4><p>'+esc(reply.note||reply.notes||'Aucune note transmise')+'</p></section>';
  }
  function sheet(ctx, id) {
    var p = (ctx.data.people || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return '<div class="empty"><b>Fiche introuvable</b>Elle a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9e.</div>' +
      '<div class="toolbar"><button class="button secondary" data-team="back">\u2039 \u00c9quipe</button></div>';
    var locked = ctx.role !== "admin" ? " disabled" : "";
    var formReply = (ctx.data.forms || []).find(function (x) { return x.personId === id; }) || {};
    var acc = (ctx.data.access || []).filter(function (a) { return a.personId === id; })[0];
    /* Le serveur ne transmet jamais le hash : seulement hasCode. */
    var codeOk = !!(acc && (acc.hasCode || acc.hash));

    var html = '<div class="toolbar"><button class="button secondary" data-team="back">\u2039 \u00c9quipe</button>' +
      '<span class="badge">' + esc(p.role === "referent" ? "R\u00e9f\u00e9rent" : "B\u00e9n\u00e9vole") + "</span>" +
      (codeOk ? '<span class="badge good">Acc\u00e8s cr\u00e9\u00e9</span>' : '<span class="badge bad">Sans acc\u00e8s</span>') +
      "</div>" +
      '<div class="card contact-head">' +
      root.RunnerPhotos.html(p) +
      "<div><b>" + esc(label(p)) + "</b><small>" + esc(p.status || "Actif") + "</small></div></div>" +
      '<form id="personForm" class="form-grid">' +
      '<div><label>Nom<input name="lastName" value="' + esc(p.lastName) + '" required></label></div>' +
      '<div><label>Pr\u00e9nom<input name="firstName" value="' + esc(p.firstName) + '" required></label></div>' +
      '<div><label>T\u00e9l\u00e9phone<input name="phone" type="tel" value="' + esc(p.phone || "") + '"></label></div>' +
      '<div><label>Email<input name="email" type="email" value="' + esc(p.email || "") + '"></label></div>' +
      '<div><label>Bo\u00eete de vitesses<select name="gearbox">' +
      ["", "Manuelle", "Automatique", "Peu importe"].map(function (s) {
        return '<option value="' + esc(s) + '"' + ((p.gearbox || "") === s ? " selected" : "") + ">" + (s || "Non renseign\u00e9e") + "</option>";
      }).join("") + "</select></label></div>" +
      '<div class="full"><label class="check"><input type="checkbox" name="isReferent"' + (p.role === "referent" ? " checked" : "") + "><span>R\u00e9f\u00e9rent</span></label></div>" +
      checks(p) +
      formSection(ctx,p,formReply) +
      '<div><label>Statut<select name="status">' +
      ["Actif", "Absent", "D\u00e9sist\u00e9"].map(function (s) {
        return "<option" + ((p.status || "Actif") === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select></label></div>" +
      '<div class="full"><label>Note interne<textarea name="internalNote" rows="3">' + esc(p.internalNote || "") + "</textarea></label></div>" +
      '<div class="full modal-actions">' +
      (ctx.role === "admin" ? '<button type="button" class="button secondary" data-team="access-one" data-id="' + esc(p.id) + '">' +
      (codeOk ? "R\u00e9initialiser le code" : "Cr\u00e9er l\u2019acc\u00e8s") + "</button>" : "") +
      '<button class="button primary">Enregistrer</button></div>' +
      "</form>" +
      (ctx.role === "admin" ? '<div class="toolbar"><button class="button secondary" data-team="remove">Supprimer la fiche</button></div>' : "") +
      '<div class="notice" data-type="info">' +
      (acc ? "Acc\u00e8s : " + (codeOk ? "code cr\u00e9\u00e9" : "pas encore de code") + " \u00b7 " + esc(acc.active ? "actif" : "inactif")
           : "Aucun acc\u00e8s cr\u00e9\u00e9 pour cette personne.") + "</div>";
    if (locked) html = html.replace(/name="(lastName|firstName|phone|email|isReferent|gearbox|forbidC3|driverOnly|priorityLoader|firstYear|wednesday)"/g, '$& disabled');
    return html;
  }

  function blank() {
    return '<div class="toolbar"><button class="button secondary" data-team="back">\u2039 \u00c9quipe</button>' +
      '<span class="badge">Nouvelle fiche</span></div>' +
      '<form id="personForm" class="form-grid">' +
      '<div><label>Nom<input name="lastName" required></label></div>' +
      '<div><label>Pr\u00e9nom<input name="firstName" required></label></div>' +
      '<div><label>T\u00e9l\u00e9phone<input name="phone" type="tel"></label></div>' +
      '<div><label>Email<input name="email" type="email"></label></div>' +
      '<div><label>Statut<select name="status"><option>Actif</option><option>Absent</option><option>D\u00e9sist\u00e9</option></select></label></div>' +
      '<div><label>Bo\u00eete de vitesses<select name="gearbox"><option value="">Non renseign\u00e9e</option><option>Manuelle</option><option>Automatique</option><option>Peu importe</option></select></label></div>' +
      '<div class="full"><label class="check"><input type="checkbox" name="isReferent"><span>R\u00e9f\u00e9rent</span></label></div>' +
      checks({}) +
      '<div class="full"><label>Note interne<textarea name="internalNote" rows="3"></textarea></label></div>' +
      '<div class="full modal-actions"><button class="button primary">Cr\u00e9er la fiche</button></div>' +
      "</form>";
  }

  function readForm(form) {
    var f = form.elements;
    var get = function (n) { return f[n] ? f[n].value.trim() : ""; };
    var on = function (n) { return !!(f[n] && f[n].checked); };
    return {
      lastName: get("lastName"),
      firstName: get("firstName"),
      phone: get("phone"),
      email: get("email"),
      status: get("status") || "Actif",
      gearbox: get("gearbox"),
      role: on("isReferent") ? "referent" : "benevole",
      forbidC3: on("forbidC3"),
      driverOnly: on("driverOnly"),
      priorityLoader: on("priorityLoader"),
      noLoader: on("driverOnly"),
      firstYear: on("firstYear"),
      wednesday: on("wednesday"),
      internalNote: get("internalNote")
    };
  }

  /* \u00c9cran de g\u00e9n\u00e9ration des codes : nom, pr\u00e9nom, code, copie.
   * Le code n'est affich\u00e9 qu'une fois (point 11 du CDC).
   * Un bouton de retour encadre toujours l'\u00e9cran : jamais de cul-de-sac.
   */
  function accessResult(rows) {
    var back = '<div class="toolbar">' +
      '<button class="button secondary" data-team="back">\u2039 Retour \u00e0 l\u2019\u00e9quipe</button>' +
      "</div>";

    if (!rows || !rows.length)
      return back + '<div class="empty"><b>Aucun code g\u00e9n\u00e9r\u00e9</b>Toutes les personnes actives ont d\u00e9j\u00e0 un acc\u00e8s.</div>';

    var fresh = rows.filter(function (r) { return !r.alreadyShown && r.code; });
    var old = rows.filter(function (r) { return r.alreadyShown || !r.code; });

    var head =
      (fresh.length
        ? '<div class="notice" data-type="success">' + fresh.length + " code(s) g\u00e9n\u00e9r\u00e9(s). Note-les maintenant : ils ne seront plus affich\u00e9s.</div>"
        : "") +
      (old.length
        ? '<div class="notice" data-type="info">' + old.length + " acc\u00e8s existaient d\u00e9j\u00e0 : leur code n\u2019est plus affichable. Utilise \u00ab R\u00e9initialiser le code \u00bb pour en obtenir un nouveau.</div>"
        : "");

    var table = fresh.length
      ? '<div class="card"><table class="codes"><thead><tr><th>Nom</th><th>Pr\u00e9nom</th><th>Code</th></tr></thead><tbody>' +
        fresh.map(function (r) {
          return "<tr><td>" + esc(r.nom) + "</td><td>" + esc(r.prenom) + "</td><td><b>" + esc(r.code) + "</b></td></tr>";
        }).join("") +
        "</tbody></table></div>"
      : "";

    var lines = fresh.map(function (r) { return r.nom + " " + r.prenom + "\t" + r.code; }).join("\n");
    var tools = fresh.length
      ? '<div class="toolbar">' +
        '<button class="button secondary" data-team="copy" data-payload="' + esc(lines) + '">Copier la liste</button>' +
        '<button class="button secondary" onclick="window.print()">Imprimer</button>' +
        "</div>"
      : "";

    return back + head + table + tools + back;
  }

  root.ScreenTeam = {
    list: list,
    sheet: sheet,
    blank: blank,
    readForm: readForm,
    accessResult: accessResult,
    setFilter: function (v) { filter = v; }
  };
})(window);
