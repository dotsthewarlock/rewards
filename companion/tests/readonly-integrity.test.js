import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/discovery/core.js';
import '../extension/discovery/legacy.js';
const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
const slug='CA1126VANW',origin='https://getmybonus.ca';
function readonly(entries){
 const map=new Map(entries.map(([name,value])=>[L.key(slug,name),value]));
 return {getItem:k=>map.get(k)??null,setItem(){throw Error('read-only');},removeItem(){throw Error('read-only');}};
}
test('read-only cache summary preserves interrupted active-only and queue-only state',()=>{
 const row=JSON.stringify([{state:'queued'}]);
 const active=JSON.stringify({phase:'submitted',note:'SYNTHETIC_PRIVATE'});
 for(const entries of [[['active',active]],[['queue',row],['active',active]],
   [['queue',JSON.stringify([{state:'processing'}])]],
   [['queue',JSON.stringify([{state:'pending'}])]]]){
  const s=readonly(entries),result=L.summary(s,slug);
  assert.equal(result.ok,true);
  assert.equal(result.unresolved,true);
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE|submitted/);
  for(const [name,value] of entries)assert.equal(s.getItem(L.key(slug,name)),value);
 }
 assert.equal(L.summary(readonly([['queue',row]]),slug).unresolved,false);
});
test('malformed legacy cache cannot be presented as a clean empty cache',()=>{
 for(const [field,value] of [['queue','{'],['history','{}'],['giftcards','[null]'],['active','[]'],['active','null']]){
  const s=readonly([[field,value]]);
  assert.deepEqual(L.summary(s,slug),{ok:false,reason:'unreadable-cache'});
  assert.equal(s.getItem(L.key(slug,field)),value);
 }
});
test('read-only structural packet rejects nested extra metadata, duplicates and impossible counts',()=>{
 const packet={schema:'rewards.structural/1',origin,campaign:slug,status:'recognized',stage:'entry',
  signals:{bodyMatch:true,pathMatch:true,entry:true,success:false,entryVisible:true,successVisible:false},
  controls:Object.fromEntries(Object.keys(D.selectors).map(k=>[k,{present:0,visible:0,actionable:0}])),
  labels:['Get My Bonus']};
 assert.deepEqual(D.validate(packet,origin),packet);
 for(const change of [
  {signals:{...packet.signals,raw:'SYNTHETIC_PRIVATE'}},
  {controls:{...packet.controls,form:{present:1,visible:1,actionable:0,value:'SYNTHETIC_PRIVATE'}}},
  {controls:{...packet.controls,form:{present:1001,visible:0,actionable:0}}},
  {controls:{...packet.controls,form:{present:1,visible:2,actionable:0}}},
  {labels:['Get My Bonus','Get My Bonus']},
  {labels:['SYNTHETIC_PRIVATE']},
  {campaign:null}
 ])assert.equal(D.validate({...packet,...change},origin),null);
});
