const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../js/terrain-state.js');
test('Une lecture tardive ne remet pas un ancien changement en tête',()=>{
 const old={id:'old',personId:'p',shiftId:'s',createdAt:'2026-11-12T10:00Z',updatedAt:'2026-11-12T14:00Z',version:20};
 const next={id:'next',personId:'p',shiftId:'s',createdAt:'2026-11-12T11:00Z',version:10};
 assert.equal(T.latest([next,old],'p','s').id,'next');
});
test('La file conserve les changements bloqués et isole les comptes',()=>{
 const rows=[{authorId:'p',action:'save',state:'blocked',at:'2026-11-12T10:00Z',payload:{collection:'terrain',row:{id:'t',role:'Chargeur'}}},{authorId:'other',action:'ack',state:'pending',payload:{id:'t'}},{authorId:'p',action:'ack',state:'pending',payload:{id:'mine'}}];
 const state=T.pending(rows,'p');assert.equal(state.changes[0].pendingState,'blocked');assert.deepEqual(state.acks,{mine:'pending'});
 assert.equal(T.label(state.changes[0]),'Envoi bloqué');
 assert.equal(T.label({id:'mine'},state.acks),'Lecture enregistrée · envoi en attente');
});
test('Une confirmation serveur remplace la copie locale sans modifier la source',()=>{
 const server=[{id:'t',acknowledged:true,direct:true}],before=JSON.stringify(server);
 assert.equal(T.merge(server,[{id:'t',pendingState:'pending'}]).length,1);
 assert.equal(T.label(T.merge(server,[{id:'t'}])[0]),'Informé directement');
 assert.equal(JSON.stringify(server),before);
});
