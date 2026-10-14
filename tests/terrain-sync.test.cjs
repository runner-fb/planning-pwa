const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const {IDBFactory}=require(process.env.IDB_PATH||'fake-indexeddb');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,30));
async function session(role='benevole'){
 const dom=new JSDOM(read('index.html').replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.scrollTo=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};w.indexedDB=new IDBFactory();
 w.eval(read('tests/admin-ux-fixture.js'));let online=false;Object.defineProperty(w.navigator,'onLine',{get:()=>online});
 const d=w.fixtureData;d.user={id:role==='referent'?'p3':'p1',name:'Test',role};d.publications=[{id:'pub',number:4,mode:'final'}];
 d.messages=[{id:'m1',title:'Consigne',body:'Test',active:true}];
 w.localStorage.setItem('planning_v2_bundle',JSON.stringify({version:7,lastSyncAt:1000,role,data:d}));
 let calls=[],syncs=[];w.Transport.mutate=async(a,p,id)=>{calls.push({a,p,id});return {}};
 w.Transport.sync=async v=>{syncs.push(v);return {version:v+1,full:false,config:d.config}};
 w.eval(read('js/queue.js'));for(const f of ['js/screens-team.js','js/screens-shifts.js','js/admin-ux.js','app.js'])w.eval(read(f));await tick();
 return {w,dom,calls,syncs,online:v=>online=v,q:s=>w.document.querySelector(s)};
}
(async()=>{
 let t=await session(),{w,q}=t;
 q('#pubAckCheck').checked=true;q('#pubAckCheck').dispatchEvent(new w.Event('change'));q('#pubAckConfirm').click();await tick();
 assert(!q('#pubAckConfirm'));assert.equal((await w.Queue.list()).length,1);assert.equal(t.calls.length,0);
 w.navigate('home');assert(!q('#pubAckConfirm'));assert.match(q('#mobileConnectionText').textContent,/Planning V4.*Données V7/);
 w.navigate('messages');q('[data-message-read]').click();await tick();assert.equal((await w.Queue.list()).length,2);
 w.navigate('messages');assert.match(q('#pageContent').textContent,/envoi en attente/);
 w.navigate('syncstatus');await tick();assert.equal(q('#pendingActions').children.length,2);
 t.online(true);q('#syncChanges').click();q('#syncChanges').click();await tick();await tick();
 assert.equal(t.calls.length,2);assert.deepEqual(t.syncs,[7]);assert.equal((await w.Queue.list()).length,0);
 assert.match(q('#mobileConnectionText').textContent,/Données V8/);
 assert.equal(JSON.parse(w.localStorage.getItem('planning_v2_bundle')).data.people.length,3,'delta retains unchanged data');
 // A broken network stops the queue after the first error and retains stable operation IDs.
 await w.Queue.enqueue({action:'incident',payload:{description:'A'},opId:'stable-a'});await w.Queue.enqueue({action:'incident',payload:{description:'B'},opId:'stable-b'});
 let attempts=[];w.Transport.mutate=async(a,p,id)=>{attempts.push(id);throw new w.TypeError('Failed to fetch')};
 await w.Queue.flush();assert.deepEqual(attempts,['stable-a']);assert.equal((await w.Queue.list()).length,2);
 w.Transport.mutate=async(a,p,id)=>{attempts.push(id);return {}};await w.Queue.flush();assert.deepEqual(attempts,['stable-a','stable-a','stable-b']);
 // Conflicts stay visible, are not silently retried or lost.
 await w.Queue.enqueue({action:'save',payload:{},opId:'conflict'});w.Transport.mutate=async()=>({conflict:'Version différente'});await w.Queue.flush();assert.equal((await w.Queue.list())[0].state,'conflict');
 // Isolation between accounts.
 const cache=JSON.parse(w.localStorage.getItem('planning_v2_bundle'));cache.data.user.id='other';w.localStorage.setItem('planning_v2_bundle',JSON.stringify(cache));assert.equal(await w.Queue.count(),0);
 t.dom.window.close();
 t=await session('referent');w=t.w;q=t.q;q('#pubLater').click();w.navigate('terrain');
 const form=q('#terrainForm');form.elements.note.value='Changement de poste';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal((await w.Queue.list())[0].payload.collection,'terrain');assert.equal(t.calls.length,0);assert(form.querySelector('button').disabled);
 t.dom.window.close();console.log('PASS: durable terrain queue, offline acknowledgement, pending UI, FIFO, stable retry IDs, conflict retention, account isolation, single delta sync and local version.');
})().catch(e=>{console.error(e);process.exitCode=1;process.exit(1)});
