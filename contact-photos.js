/* Photos personnelles : références du Sheet, images dans le cache du téléphone uniquement. */
(function(root){
  'use strict';
  var CACHE='runner-contact-photos-v2', pending=new Map(), attempted=new Set(), working=false, memory=new Map();
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function key(src){return new URL('./__contact_photo__/'+encodeURIComponent(src),document.baseURI).href;}
  function html(p){var initials=[p.firstName,p.lastName].filter(Boolean).map(function(x){return x.trim().slice(0,1);}).join('').toUpperCase();return '<span class="avatar photo-avatar" data-photo-person="'+esc(p.id)+'" data-photo-source="'+esc(p.photo)+'"><span>'+esc(initials||'?')+'</span></span>';}
  function display(src,data){document.querySelectorAll('[data-photo-source]').forEach(function(el){if(el.dataset.photoSource!==src||el.querySelector('img'))return;var img=document.createElement('img');img.alt='';img.src=data;img.onerror=function(){img.remove();};el.appendChild(img);});}
  async function saved(src){if(memory.has(src))return memory.get(src);if(!root.caches)return null;var cache=await caches.open(CACHE),hit=await cache.match(key(src));if(!hit)return null;var row=await hit.json();if(row.data){memory.set(src,row.data);display(src,row.data);}return row;}
  async function drain(){
    if(working||!navigator.onLine||!root.Transport||!Transport.token())return;
    working=true;
    try{while(pending.size&&navigator.onLine){var batch=Array.from(pending.values()).slice(0,6);batch.forEach(function(p){pending.delete(p.source);attempted.add(p.source);});var out=await Transport.read('contactPhotos',{personIds:batch.map(function(p){return p.id;})});for(var row of out.photos||[]){if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(row.data||''))continue;memory.set(row.source,row.data);display(row.source,row.data);if(root.caches){var cache=await caches.open(CACHE);await cache.put(key(row.source),new Response(JSON.stringify({data:row.data,at:Date.now()}),{headers:{'Content-Type':'application/json'}}));}}}}
    catch(e){/* Les initiales restent disponibles ; réessai au retour du réseau. */}
    finally{working=false;}
  }
  function mount(){document.querySelectorAll('[data-photo-source]').forEach(function(el){var src=el.dataset.photoSource;if(!src)return;if(memory.has(src)){display(src,memory.get(src));return;}saved(src).then(function(hit){if(!hit&&!attempted.has(src)){pending.set(src,{source:src,id:el.dataset.photoPerson});drain();}}).catch(function(){if(!attempted.has(src)){pending.set(src,{source:src,id:el.dataset.photoPerson});drain();}});});}
  window.addEventListener('online',function(){attempted.clear();mount();drain();});
  root.RunnerPhotos={html:html,mount:mount};
})(window);
