const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,40));
async function session(role='benevole',existingDB){
 const dom=new JSDOM(read('index.html').replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.scrollTo=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};w.indexedDB=existingDB||new IDBFactory();
 w.eval(read('tests/admin-ux-fixture.js'));Object.defineProperty(w.navigator,'onLine',{get:()=>false});
 const d=w.fixtureData;d.user={id:role==='referent'?'p3':'p1',name:'Test',role};
 d.publications=[{id:'pub',number:4,mode:'final'}];d.reads=[{id:'read',personId:d.user.id,messageId:'publication-pub'}];
 d.terrain=[{id:'change',personId:'p1',shiftId:'Je1',role:'Chargeur',note:'Relais',createdAt:'2026-11-12T11:00Z',acknowledged:false}];
 d.rotations=[{id:'rot',personId:'p1',shiftId:'Je1',role:'Conducteur',start:'12:00',end:'18:00'}];
 w.localStorage.setItem('planning_v2_bundle',JSON.stringify({uiVersion:3,version:7,role,data:d}));
 let calls=[];w.Transport.mutate=async(...args)=>{calls.push(args);return {}};
 for(const f of ['js/queue.js','js/screens-team.js','js/screens-shifts.js','js/admin-ux.js','js/terrain-state.js','js/handover.js','js/screens-handover.js','app.js'])w.eval(read(f));
 await tick();return {w,dom,d,calls,q:s=>w.document.querySelector(s)};
}
test('Le bénévole lit le changement, le planning reste intact et la lecture survit au redémarrage hors ligne',async()=>{
 let t=await session();try{
 t.w.navigate('myshifts');assert.match(t.q('#pageContent').textContent,/Changement terrain : Chargeur/);
 assert.equal(t.d.rotations[0].role,'Conducteur');t.q('[data-terrain-ack]').click();await tick();
 assert.equal((await t.w.Queue.list())[0].action,'ack');assert.equal(t.calls.length,0);
 assert.match(t.q('#terrainNotices').textContent,/envoi en attente/);assert.equal(t.d.terrain[0].acknowledged,false);
 const db=t.w.indexedDB;t.dom.window.close();t=await session('benevole',db);t.w.navigate('myshifts');
 assert.match(t.q('#terrainNotices').textContent,/envoi en attente/);assert.equal(t.q('[data-terrain-ack]'),null);
 }finally{t.dom.window.close();}
});
test('Le référent enregistre un changement durable sans annoncer une présence confirmée',async()=>{
 const t=await session('referent');try{
 t.w.navigate('terrain');t.q('#reliefPosts').click();const select=t.q('#terrainShift');select.value='Je1';select.dispatchEvent(new t.w.Event('change'));
 assert.match(t.q('#pageContent').textContent,/présence réelle/);
 t.q('#shiftChangeNote').value='Renfort';t.q('[data-drag-person="p1"]').click();t.q('[data-move-role="Conducteur"]').click();await tick();
 const queued=(await t.w.Queue.list()).find(r=>r.action==='save');assert.equal(queued.payload.row.role,'Conducteur');
 assert.match(t.q('#terrainNotices').textContent,/Changement en attente d’envoi/);assert.equal(t.calls.length,0);
 }finally{t.dom.window.close();}
});
