/* Pure presentation helpers. No requests and no change to the transport. */
(function(root){
  'use strict';
  function active(d,k){return (d[k]||[]).filter(x=>!x.deleted&&x.active!==false);}
  function people(d){return active(d,'people').filter(p=>p.status!=='Désisté');}
  function latest(d){return active(d,'publications').slice().sort((a,b)=>Number(b.number||0)-Number(a.number||0))[0];}
  function signature(d){
    return JSON.stringify(['assignments','rotations'].map(k=>active(d,k).map(x=>[x.personId,x.shiftId,x.missionId||'',x.role||'',x.start||'',x.end||''].join('|')).sort()));
  }
  function checkSignature(d){
    var clean=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['version','updatedAt','createdAt'].includes(k)));
    var c=d.config||{};return JSON.stringify(['people','shifts','concerts','forms','assignments','rotations','arbitrations'].map(k=>active(d,k).map(clean)))+JSON.stringify([c.quotaMin,c.quotaMax,c.vehiclesPlanned,c.reserveA]);
  }
  function steps(d,checksCurrent){
    var c=d.config||{}, ps=people(d), ids=d.responseStats&&d.responseStats.receivedIds;
    var received=Array.isArray(ids)?ps.filter(p=>ids.map(String).includes(String(p.id))).length:null;
    var access=ps.filter(p=>(d.access||[]).some(a=>a.personId===p.id&&a.hasCode&&a.active)).length;
    var pub=latest(d),published=!!(pub&&pub.mode!=='draft'&&signature(pub.snapshot||{})===signature(d)&&c.validated);
    return [
      {page:'setup',label:'Édition',done:!!(c.name&&c.date_debut&&c.date_fin&&c.date_debut<c.date_fin),detail:'Nom et dates du festival'},
      {page:'vehicles',label:'Besoins véhicules',done:Number(c.vehiclesPlanned)>0,detail:(c.vehiclesPlanned||0)+' véhicule(s) prévu(s)'},
      {page:'creneaux',label:'Créneaux',done:!!(active(d,'shifts').length&&c.shiftsChecked),detail:active(d,'shifts').length+' créneaux · '+(c.shiftsChecked?'vérifiés':'à vérifier')},
      {page:'concerts',label:'Concerts',done:!!c.concertsChecked,detail:active(d,'concerts').length+' concerts · '+(c.concertsChecked?'vérifiés':'à vérifier')},
      {page:'team',label:'Équipe et accès',done:!!(ps.length&&c.teamChecked&&access===ps.length),detail:ps.length+' bénévoles · '+access+' accès actifs'},
      {page:'forms',label:'Disponibilités',done:received!==null&&ps.length>0&&received===ps.length,detail:received===null?'Réponses à actualiser':received+' / '+ps.length+' réponses'},
      {page:'simulations',label:'Simulation',done:active(d,'simulations').some(s=>!s.stale),detail:'Construire et ajuster les affectations'},
      {page:'planning',label:'Contrôle et validation',done:!!c.validated,detail:c.validated?'Planning validé':checksCurrent?'Contrôles disponibles · validation à effectuer':'Contrôles à effectuer'},
      {page:'planning',label:'Publication',done:published,detail:published?'Version '+pub.number+' publiée':pub?'Modifications ou validation à vérifier':'Aucune version finale publiée'}
    ];
  }
  function diff(d){
    var pub=latest(d),before=(pub&&pub.snapshot&&pub.snapshot.assignments||[]).filter(x=>!x.deleted),after=active(d,'assignments');
    var key=x=>[x.personId,x.shiftId,x.missionId||''].join('|');
    return {added:after.filter(a=>!before.some(b=>key(a)===key(b))),removed:before.filter(a=>!after.some(b=>key(a)===key(b)))};
  }
  function formMail(c,p){
    var date='à définir';
    if(c.closeAt&&Number.isFinite(Date.parse(c.closeAt))){
      var parts=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(c.closeAt));
      var v={};parts.forEach(x=>v[x.type]=x.value);date=v.day+'/'+v.month+'/'+v.year+' '+v.hour+':'+v.minute;
    }
    return 'Bonjour '+(p.firstName||'{Prénom}')+',\nLe formulaire est ouvert jusqu’au '+date+'.\nTon code personnel déjà reçu reste valable.\nLe premier accès télécharge les données nécessaires au hors ligne.\nAndroid : menu du navigateur > Installer l’application.\niPhone : Safari > Partager > Sur l’écran d’accueil.\n\n'+(c.appUrl||'');
  }
  function parseCSV(text){
    text=text.replace(/^\uFEFF/,'');
    var first=text.split(/\r?\n/)[0],sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
    var rows=[],row=[],cell='',quoted=false;
    for(var i=0;i<text.length;i++){var c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quoted)throw Error('Guillemets non fermés dans le CSV.');
    row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
    if(rows.length<2)throw Error('Le CSV doit contenir les en-têtes et au moins une personne.');
    var norm=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    var headers=rows.shift().map(norm), aliases={lastName:['nom','lastname'],firstName:['prenom','firstname'],email:['email','mail','courriel'],phone:['telephone','tel','phone'],role:['role'],gearbox:['boitedevitesses','gearbox'],mandatoryGroupId:['groupe','mandatorygroupid']};
    var indices={};Object.keys(aliases).forEach(k=>indices[k]=headers.findIndex(h=>aliases[k].includes(h)));
    if(indices.lastName<0||indices.firstName<0)throw Error('Colonnes Nom et Prénom obligatoires.');
    return rows.map((r,i)=>{var p={status:'Actif'};Object.keys(indices).forEach(k=>p[k]=indices[k]<0?'':String(r[indices[k]]||'').trim());if(!p.lastName||!p.firstName)throw Error('Nom ou prénom manquant à la ligne '+(i+2));if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw Error('Email invalide à la ligne '+(i+2));var role=norm(p.role);if(role&&!['referent','benevole'].includes(role))throw Error('Rôle inconnu à la ligne '+(i+2));p.role=role==='referent'?'referent':'benevole';if(p.gearbox&&!['Manuelle','Automatique','Peu importe'].includes(p.gearbox))throw Error('Boîte de vitesses invalide à la ligne '+(i+2));return p;});
  }
  var api={active,people,latest,signature,checkSignature,steps,diff,formMail,parseCSV};
  root.AdminUX=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
