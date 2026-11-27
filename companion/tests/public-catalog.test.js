import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/discovery/core.js';
import '../extension/core/public-catalog.js';
const D=globalThis.RewardsDiscovery,C=globalThis.RewardsPublicCatalog;
const origin='https://getmybonus.ca',source=origin+'/';
const slugs=['CA1126WG1','CA1126WXB','CA1126VANW','CA1226WUDC','CA1226WGT','CA1226WG1'];
// Synthetic HTML using only public directory identities recorded in campaign-monitoring.md.
const heading='<h2>Select the qualifying offer to claim your bonus eGift card</h2>';
const html=heading+slugs.map(s=>'<a href="/'+s+'/en">Offer</a>').join('');
const a='2026-11-27T17:00:00.000Z',b='2026-11-28T17:00:00.000Z';
test('exact public identity is independent of supported workflow mapping',()=>{
 const ids=slugs.map(s=>D.publicIdentity(origin,s));
 assert.equal(new Set(ids.map(i=>i.key)).size,6);
 assert.notEqual(D.publicIdentity('https://cardreward.ca',slugs[0]).key,ids[0].key);
 assert.equal(D.origins[origin],'CA1126VANW');
 for(const bad of ['ca1126wg1',' CA1126WG1','CA1126WG1 ','US1126WG1','CA1126WG1/'])assert.equal(D.publicIdentity(origin,bad),null);
 for(const bad of ['http://getmybonus.ca','https://getmybonus.ca.evil.invalid','https://getmybonus.ca/'])assert.equal(D.publicIdentity(bad,slugs[0]),null);
});
test('directory accepts only literal same-origin canonical links, excludes inert and fake attributes',()=>{
 const extra='<script>const x="<a href=/CA1126ZZ/en>";</script><!-- <a href="/CA1126ZZ/en"> -->'+
 '<template><a href="/CA1126ZZ/en">X</a></template><a title=" href=\x27/CA1126ZZ/en\x27">X</a>'+
 '<a href="//evil.invalid/CA1126ZZ/en">X</a><a href="/CA1126ZZ/en?x=1">X</a>'+
 '<a href="/CA1126WG1/fr">Duplicate</a>';
 assert.deepEqual(C.parseDirectory(html+extra).map(i=>i.campaign),slugs);
 assert.equal(C.parseDirectory('<a href="/CA1126ZZ/en">X</a>'),null);
 assert.equal(C.parseDirectory(heading+'<a href="/CA1126ZZ/en/terms">X</a>'),null);
});
test('failure and disappearance retain last observations without inferring expiration or terms',()=>{
 const initial=C.merge(C.empty(),C.parseDirectory(html),'verified-directory',a);
 assert.deepEqual(C.validate(initial),initial);
 for(const outcome of ['unavailable','restricted','rate-limited','checking']){
   const stale=C.merge(initial,null,outcome,b);
   assert.equal(stale.entries.length,6);
   assert.ok(stale.entries.every(e=>!e.listed&&e.firstSeen===a&&e.lastSeen===a));
   assert.deepEqual(C.validate(stale),stale);
 }
 const partial=C.merge(initial,C.parseDirectory(heading+'<a href="/CA1126WG1/en">Offer</a>'),'verified-directory',b);
 assert.equal(partial.entries.length,6);
 assert.equal(partial.entries.filter(e=>e.listed).length,1);
 assert.equal(partial.entries[0].firstSeen,a);
 assert.equal(partial.entries[0].lastSeen,b);
 assert.equal(C.validate({...initial,entries:[...initial.entries,initial.entries[0]]}),null);
 assert.deepEqual(Object.keys(initial).sort(),['schema','source','checkedAt','outcome','entries'].sort());
 assert.equal(initial.schema,'rewards.public-catalog/1');
 for(const row of initial.entries)assert.deepEqual(Object.keys(row).sort(),['origin','campaign','key','url','firstSeen','lastSeen','listed'].sort());
 assert.doesNotMatch(JSON.stringify(initial.entries),/eligible|reward|private|stock/i);
});
test('privacy boundary rejects extra fields and never merges private or arbitrary input',()=>{
 const initial=C.merge(C.empty(),C.parseDirectory(html),'verified-directory',a);
 for(const field of ['reward','email','gcNumber','gcPin','rawHtml','queue','terms','stock']){
   const contaminated={...initial,entries:[{...initial.entries[0],[field]:'PRIVATE_FIXTURE'},...initial.entries.slice(1)]};
   assert.equal(C.validate(contaminated),null);
   assert.equal(C.merge(contaminated,null,'unavailable',b),null);
 }
 assert.equal(C.validate({...initial,private:'PRIVATE_FIXTURE'}),null);
 assert.equal(C.validate({...initial,outcome:'restricted'}),null);
 const enriched=C.parseDirectory(html+'<a href="/CA1126WG1/en" title="PRIVATE_FIXTURE">PRIVATE_FIXTURE</a>');
 assert.doesNotMatch(JSON.stringify(C.merge(C.empty(),enriched,'verified-directory',a)),/PRIVATE_FIXTURE/);
});
function response(body,status=200,url=source,headers={'content-type':'text/html'}){
 const r=new Response(body,{status,headers});Object.defineProperty(r,'url',{value:url});return r;
}
test('manual retrieval performs one bounded credential-free GET and rejects redirects/blocks',async()=>{
 let calls=0;
 const result=await C.retrieve(async(url,options)=>{
   calls++;assert.equal(url,source);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');
   assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
   return response(html);
 });
 assert.equal(calls,1);assert.equal(result.outcome,'verified-directory');assert.equal(result.ids.length,6);
 assert.equal((await C.retrieve(async()=>response('denied',403))).outcome,'restricted');
 assert.equal((await C.retrieve(async()=>response('Please upgrade your browser'))).outcome,'restricted');
 assert.equal((await C.retrieve(async()=>response(html,200,'https://evil.invalid/'))).outcome,'unavailable');
 assert.equal((await C.retrieve(async()=>response('x'.repeat(262145)))).outcome,'unavailable');
 assert.equal((await C.retrieve(async()=>{throw Error('network');})).outcome,'unavailable');
});

test('malformed, ambiguous and inert content cannot establish public identity',()=>{
 for(const bad of [
   '<!-- unclosed <a href="/CA1126ZZ/en">X</a>',
   '<script>unclosed <a href="/CA1126ZZ/en">X</a>',
   '<template><template></template><a href="/CA1126ZZ/en">X</a>',
   '<a href="/CA1126ZZ/en" href="/CA1126AA/en">X</a>',
   '<a href="/CA1126ZZ/en"><a href="/CA1126AA/en">X</a></a>',
   '<base href="https://example.invalid/">',
   '<a href="/CA1126ZZ/en" title="unterminated>',
   '<a href="/CA1126ZZ/en">unclosed'
 ])assert.equal(C.parseDirectory(html+bad),null,bad);
 const inert='<template><template></template><a href="/CA1126ZZ/en">X</a></template>'+
   '<textarea><a href="/CA1126ZZ/en">X</a></textarea>'+
   '<div hidden><a href="/CA1126ZZ/en">X</a></div>'+
   '<svg><a href="/CA1126ZZ/en">X</a></svg>';
 assert.deepEqual(C.parseDirectory(html+inert).map(x=>x.campaign),slugs);
 assert.equal(C.parseDirectory('<div title="Select the qualifying offer to claim your bonus eGift card"></div><a href="/CA1126ZZ/en">X</a>'),null);
});
test('explicit restriction precedes otherwise valid directory links; rate limiting distinct',async()=>{
 for(const marker of ['Access denied','Please upgrade your browser','Verify you are human','Complete the CAPTCHA','<form id="challenge-form"></form>']){
   assert.equal((await C.retrieve(async()=>response(html+marker))).outcome,'restricted');
 }
 assert.equal((await C.retrieve(async()=>response(html,429))).outcome,'rate-limited');
});
test('durable stale intent fences retrieval and interrupted or failed persistence',async()=>{
 const initial=C.merge(C.empty(),C.parseDirectory(html),'verified-directory',a);
 let data=structuredClone(initial),calls=0,writes=0;
 const load=async()=>structuredClone(data),now=()=>b;
 const fetcher=async()=>{calls++;assert.equal(data.outcome,'checking');assert.ok(data.entries.every(e=>!e.listed));return {outcome:'restricted'};};
 const save=async value=>{writes++;if(writes===2)throw Error('synthetic write failure');data=structuredClone(value);};
 assert.equal((await C.refreshStored(load,save,fetcher,now)).ok,false);
 assert.equal(data.outcome,'checking');assert.equal(data.entries[0].lastSeen,a);
 assert.equal((await C.refreshStored(load,save,fetcher,now)).catalog.outcome,'checking');
 assert.equal(calls,1);
 data=structuredClone(initial);writes=0;
 assert.equal((await C.refreshStored(load,async()=>{},fetcher,now)).ok,false);
 assert.equal(calls,1);assert.deepEqual(data,initial);
 const goodSave=async value=>{data=structuredClone(value);};
 assert.equal((await C.refreshStored(load,goodSave,fetcher,now)).catalog.outcome,'restricted');
 assert.equal((await C.refreshStored(load,goodSave,fetcher,now)).catalog.outcome,'restricted');assert.equal(calls,2);
 data=structuredClone(initial);
 const unavailable=await C.refreshStored(load,goodSave,async()=>{throw Error('network');},now);
 assert.equal(unavailable.catalog.outcome,'unavailable');assert.ok(unavailable.catalog.entries.every(e=>!e.listed&&e.lastSeen===a));
 data=structuredClone(initial);
 assert.equal((await C.refreshStored(load,goodSave,async()=>({outcome:'rate-limited'}),now)).catalog.outcome,'rate-limited');
 assert.equal((await C.refreshStored(load,goodSave,fetcher,now)).catalog.outcome,'rate-limited');assert.equal(calls,2);
});
