/* Moteur partagé navigateur / Apps Script : relève réelle, sans modifier le prévu. */
var RunnerHandover = (function () {
  'use strict';
  var MIN=60000;
  function active(r){return r&&!r.deleted&&r.active!==false;}
  function period(r){
    function stamp(t,extra){var d=new Date(r.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+extra);var target=Date.parse(d.toISOString().slice(0,10)+'T'+t+':00Z'),guess=target;
      for(var i=0;i<3;i++){var p={};new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).forEach(function(x){p[x.type]=x.value;});guess+=target-Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');}return guess;}
    if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||!/^\d{2}:\d{2}$/.test(r.start||'')||!/^\d{2}:\d{2}$/.test(r.end||''))return [Infinity,Infinity];
    var extra=r.start<'06:00'?1:0;return [stamp(r.start,extra),stamp(r.end,extra+(r.end<=r.start?1:0))];
  }
  function ordered(rows){return (rows||[]).filter(active).map(function(r,i){return {r:r,i:i};}).sort(function(a,b){return (Date.parse(a.r.at||a.r.createdAt)||0)-(Date.parse(b.r.at||b.r.createdAt)||0)||a.i-b.i;}).map(function(x){return x.r;});}
  function latest(d,pid,sid){return ordered(d.terrain).filter(function(r){return r.personId===pid&&r.shiftId===sid;}).slice(-1)[0]||null;}
  function planned(d,pid,sid,at){var sh=(d.shifts||[]).find(function(s){return s.id===sid;}),rs=(d.rotations||[]).filter(function(r){return active(r)&&r.personId===pid&&r.shiftId===sid;}).sort(function(a,b){return period(Object.assign({date:sh.date},a))[0]-period(Object.assign({date:sh.date},b))[0];});
    return rs.find(function(r){var t=period(Object.assign({date:sh.date},r));return t[0]<=at&&at<t[1];})||rs.find(function(r){return period(Object.assign({date:sh.date},r))[0]>=at;})||rs[rs.length-1]||{};}
  function personState(d,pid,sid,at){var last=latest(d,pid,sid),relief=ordered(d.terrain).filter(function(r){return r.kind==='relief'&&r.personId===pid&&r.shiftId===sid;}).slice(-1)[0],plan=planned(d,pid,sid,at);
    return {personId:pid,shiftId:sid,head:last?last.id:'',role:last&&last.role||plan.role||'À affecter',vehicleId:relief?relief.vehicleId||'':plan.vehicleId||'',presence:relief?relief.presence:'Attendu',lateUntil:relief&&relief.lateUntil||'',at:relief&&relief.at||'',pending:!!(last&&last.pendingState)};}
  function members(d,sid){return Array.from(new Set((d.assignments||[]).filter(function(a){return active(a)&&a.shiftId===sid;}).map(function(a){return a.personId;}).concat((d.terrain||[]).filter(function(t){return active(t)&&t.kind==='relief'&&t.shiftId===sid;}).map(function(t){return t.personId;}))));}
  function boundary(d,now){var shifts=(d.shifts||[]).filter(active).sort(function(a,b){return period(a)[0]-period(b)[0];}), candidates=shifts.filter(function(s){var t=period(s);return now>=t[0]-30*MIN&&now<t[1];});
    var to=candidates[candidates.length-1];if(!to)return null;var begin=period(to)[0],from=shifts.filter(function(s){return s.id!==to.id&&period(s)[0]<begin&&period(s)[1]>=begin-30*MIN;}).slice(-1)[0]||null;return {from:from,to:to};}
  function colour(state,start,now){if(state.presence==='Absent')return {kind:'red',label:'Absent'};if(state.presence==='Parti')return {kind:'neutral',label:'Parti'};if(state.presence==='Présent')return {kind:'green',label:'Présent'};
    var deadline=state.lateUntil?Date.parse(state.lateUntil):start+15*MIN;
    if(now>=deadline)return {kind:'red',label:state.presence==='En retard'?'Retard dépassé':'Arrivée non confirmée'};
    if(state.presence==='En retard')return {kind:'orange',label:'Retard validé'};
    return now>=start-30*MIN?{kind:'orange',label:'Attendu · relève imminente'}:{kind:'neutral',label:'Prévu'};}
  function vehicleHead(d,id){return id?ordered(d.terrain).filter(function(t){return t.kind==='relief'&&t.vehicleId===id;}).map(function(t){return t.id;}).slice(-1)[0]||'':'';}
  function expectations(d,p){var e={};[[p.personId,p.shiftId],[p.outgoingId,p.fromShiftId],[p.incomingId,p.shiftId]].filter(function(x){return x[0]&&x[1];}).forEach(function(x){e[x[1]+'/'+x[0]]=(latest(d,x[0],x[1])||{}).id||'';});if(p.vehicleId)e['vehicle/'+p.vehicleId]=vehicleHead(d,p.vehicleId);return e;}
  function prepare(d,u,p,op){
    if(!u||!['admin','referent'].includes(u.role))throw Error('Action réservée aux référents.');
    if(!p||!['arrival','late','absent','depart','handover'].includes(p.type))throw Error('Action de relève inconnue.');
    if(!op||typeof op!=='string')throw Error('Identifiant d’action manquant.');
    var at=Date.parse(p.at);if(!Number.isFinite(at))throw Error('Heure de relève invalide.');
    var target=(d.shifts||[]).find(function(s){return active(s)&&s.id===p.shiftId;});if(!target)throw Error('Créneau inconnu.');
    var span=period(target);if(at<span[0]-30*MIN||at>span[1]+6*60*MIN)throw Error('Cette action concerne uniquement la relève en temps réel.');
    var expected=expectations(d,p);Object.keys(expected).forEach(function(k){if(!p.expected||p.expected[k]!==expected[k])throw Error('Conflit de relève : état modifié sur un autre appareil. Actualise puis arbitre cette action.');});
    function person(id,sid,external){var who=(d.people||[]).find(function(x){return active(x)&&x.id===id&&x.status!=='Désisté'&&x.status!=='Absent';});if(!who)throw Error('Personne absente ou indisponible.');if(!members(d,sid).includes(id)&&!external)throw Error('Personne non affectée à ce créneau.');return who;}
    function row(id,sid,next){var current=personState(d,id,sid,at);return Object.assign({id:op+'-'+id+'-'+sid,kind:'relief',personId:id,shiftId:sid,role:current.role,vehicleId:current.vehicleId,presence:current.presence,lateUntil:current.lateUntil,at:new Date(at).toISOString(),author:u.id,action:p.type,note:String(p.note||'').slice(0,1000),acknowledged:false,notificationId:op},next);}
    if(p.type!=='handover'){
      person(p.personId,p.shiftId,false);var state=personState(d,p.personId,p.shiftId,at),status={arrival:'Présent',late:'En retard',absent:'Absent',depart:'Parti'}[p.type];
      if(state.presence==='Parti')throw Error('Départ déjà enregistré.');
      if(p.type==='late'&&(!p.note||!Number.isFinite(Date.parse(p.lateUntil))||Date.parse(p.lateUntil)<=at||Date.parse(p.lateUntil)>span[1]))throw Error('Précise le motif et une heure d’arrivée avant la fin du créneau.');
      return [row(p.personId,p.shiftId,{presence:status,lateUntil:p.type==='late'?p.lateUntil:'',departedAt:p.type==='depart'?p.at:'',lastRole:state.role})];
    }
    if(p.outgoingId===p.incomingId)throw Error('Choisis deux personnes différentes.');
    var source=(d.shifts||[]).find(function(s){return active(s)&&s.id===p.fromShiftId;});if(!source||source.id===target.id||period(source)[0]>=span[0]||period(source)[1]<span[0]-30*MIN)throw Error('Les créneaux ne forment pas une relève.');
    person(p.outgoingId,p.fromShiftId,false);var incoming=person(p.incomingId,p.shiftId,!!p.external),out=personState(d,p.outgoingId,p.fromShiftId,at),inc=personState(d,p.incomingId,p.shiftId,at);
    if(out.presence==='Absent')throw Error('Le sortant est signalé absent.');
    if(ordered(d.terrain).some(function(t){return t.action==='handover'&&t.personId===p.outgoingId&&t.shiftId===p.fromShiftId&&t.presence==='Parti';}))throw Error('Ce sortant a déjà été relevé.');
    if(inc.presence==='Parti'||inc.presence==='Absent')throw Error('L’arrivant est absent ou déjà parti.');
    if(ordered(d.terrain).some(function(t){return t.action==='handover'&&t.personId===p.incomingId&&t.shiftId===p.shiftId&&t.presence==='Présent';}))throw Error('Cet arrivant a déjà pris une relève.');
    if(!['Conducteur','Chargeur'].includes(out.role))throw Error('Le poste du sortant doit être défini avant la relève.');
    if(out.role==='Chargeur'&&incoming.driverOnly)throw Error('Conducteur uniquement : passage Chargeur interdit.');
    if(inc.presence==='Présent'&&inc.vehicleId&&inc.vehicleId!==p.vehicleId)throw Error('L’arrivant conduit déjà un autre véhicule.');
    var incomingPlan=planned(d,p.incomingId,p.shiftId,at),promoted=out.role==='Conducteur'&&incomingPlan.role!=='Conducteur';
    if(promoted&&incoming.role!=='referent'&&at<span[0]+15*MIN)throw Error('Avant +15 minutes, seul un conducteur prévu ou un référent peut assurer cette conduite.');
    if((p.external||promoted)&&!String(p.note||'').trim())throw Error('Indique le motif de ce remplacement.');
    if(out.role==='Conducteur'){
      var vehicle=(d.vehicles||[]).find(function(v){return active(v)&&v.id===p.vehicleId;});if(!vehicle)throw Error('Choisis un véhicule en service.');
      if(out.vehicleId&&out.vehicleId!==p.vehicleId)throw Error('Le véhicule ne correspond pas au sortant.');
      var hour=Number(new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(new Date(at)));if(vehicle.letter==='A'&&hour>=19&&hour<22)throw Error('Véhicule A réservé entre 19 h et 22 h.');
      (d.shifts||[]).filter(active).forEach(function(sh){members(d,sh.id).forEach(function(id){var st=personState(d,id,sh.id,at);if(id!==p.outgoingId&&id!==p.incomingId&&st.vehicleId===p.vehicleId&&st.role==='Conducteur'&&st.presence==='Présent')throw Error('Ce véhicule est déjà conduit par une autre personne.');});});
    }
    (d.shifts||[]).filter(active).forEach(function(sh){if(sh.id!==p.shiftId){var st=personState(d,p.incomingId,sh.id,at);if(st.presence==='Présent'&&st.role==='Conducteur'&&st.vehicleId)throw Error('L’arrivant conduit déjà un véhicule sur un autre créneau.');}});
    var vehicleId=out.role==='Conducteur'?p.vehicleId:'';
    return [row(p.outgoingId,p.fromShiftId,{presence:'Parti',vehicleId:vehicleId,departedAt:out.presence==='Parti'?out.at:p.at,lastRole:out.role,replacedBy:p.incomingId}),row(p.incomingId,p.shiftId,{presence:'Présent',role:out.role,vehicleId:vehicleId,arrivedAt:p.at,lateUntil:'',replaces:p.outgoingId,temporary:!!p.external||promoted})];
  }
  return {period:period,latest:latest,state:personState,members:members,boundary:boundary,colour:colour,expectations:expectations,prepare:prepare};
})();
if(typeof module==='object'&&module.exports)module.exports=RunnerHandover;

/* Appelé au début de mutate_ dans Code.gs ; le verrou et la sauvegarde restent ceux de l'API existante. */
function runnerRelief_(s,u,d,op){
  role_(u,["admin","referent"]);
  const pub=published_(s),input={...s,assignments:pub.assignments||[],rotations:pub.rotations||[]};
  const rows=RunnerHandover.prepare(input,u,d,op);
  rows.forEach(row=>upsert_(s,"terrain",row));
  return {ok:true,rows:rows};
}
