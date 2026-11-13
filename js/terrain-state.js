/* Terrain réel : ne modifie jamais les affectations du planning publié. */
(function(root){
  'use strict';
  function active(row){return row && !row.deleted && row.active!==false;}
  function time(row){return Date.parse(row.at || row.createdAt || '') || 0;}
  function history(rows){return (rows||[]).filter(active).map(function(row,index){return {row:row,index:index};}).sort(function(a,b){return time(a.row)-time(b.row)||a.index-b.index;}).map(function(x){return x.row;});}
  function latest(rows,personId,shiftId){return history(rows).filter(function(t){return t.personId===personId&&t.shiftId===shiftId;}).slice(-1)[0]||null;}
  function pending(rows,authorId){
    var result={changes:[],acks:{},reads:{},publications:{}};
    (rows||[]).filter(function(r){return r.authorId===authorId&&['pending','blocked','conflict'].includes(r.state);}).forEach(function(r){
      var p=r.payload||{};
      if(r.action==='save'&&p.collection==='terrain'&&p.row)result.changes.push(Object.assign({},p.row,{at:p.row.at||r.at,pendingState:r.state}));
      if(r.action==='ack'&&p.id)result.acks[p.id]=r.state;
      if(r.action==='read'&&p.messageId){result.reads[p.messageId]=r.state;if(p.messageId.indexOf('publication-')===0)result.publications[p.messageId.slice(12)]=r.state;}
    });
    return result;
  }
  function merge(server,queued){var ids=new Set((server||[]).map(function(r){return r.id;}));return history((server||[]).concat((queued||[]).filter(function(r){return !ids.has(r.id);})));}
  function label(row,acks){
    if(row.pendingState==='blocked')return 'Envoi bloqué';
    if(row.pendingState==='conflict')return 'Conflit à résoudre';
    if(row.pendingState)return 'Changement en attente d’envoi';
    if(row.acknowledged)return row.direct?'Informé directement':'Changement lu';
    var pendingAck=(acks||{})[row.id];
    if(pendingAck==='blocked')return 'Confirmation bloquée';
    if(pendingAck==='conflict')return 'Confirmation en conflit';
    if(pendingAck)return 'Lecture enregistrée · envoi en attente';
    return 'Lecture à confirmer';
  }
  var api={history:history,latest:latest,pending:pending,merge:merge,label:label};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RunnerTerrain=api;
})(typeof window==='object'?window:this);
