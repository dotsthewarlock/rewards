import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/discovery/core.js';
import '../extension/discovery/legacy.js';
const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
const origin='https://getmybonus.ca',slug='CA1126VANW';
function valid(){
 return {schema:'rewards.structural/1',origin,campaign:slug,status:'recognized',stage:'entry',
 signals:{bodyMatch:true,pathMatch:true,entry:true,success:false,entryVisible:true,successVisible:false},
 controls:Object.fromEntries(Object.keys(D.selectors).map(k=>[k,{present:1,visible:1,actionable:0}])),labels:['Get My Bonus']};
}
test('strict known origin and report vocabulary; no extra fields accepted',()=>{
 const p=valid();assert.deepEqual(D.validate(p,origin),p);
 assert.equal(D.validate({...p,origin:'https://unrelated.invalid'},origin),null);
 assert.equal(D.validate({...p,campaign:'CA1126PZFT'},origin),null);
 assert.equal(D.validate({...p,arbitraryText:'DO-NOT-STORE'},origin),null);
 assert.equal(D.validate({...p,labels:['DO-NOT-STORE']},origin),null);
 assert.equal(D.validate({...p,controls:{...p.controls,serial:{present:1,visible:0,actionable:1}}},origin),null);
 assert.equal(D.validate({...p,status:'conflict'},origin),null);
});
test('legacy reader uses exact origin-local v15 keys without writes or credential transfer',()=>{
 const map=new Map([
 ['bs_rewards:'+slug+':queue',JSON.stringify([{code:'000000000000000000000000000001',state:'pending'},{code:'000000000000000000000000000002',state:'queued'}])],
 ['bs_rewards:'+slug+':history',JSON.stringify([{code:'000000000000000000000000000003'}])],
 ['bs_rewards:'+slug+':giftcards',JSON.stringify([{gcNumber:'SYNTHETIC-SECRET',gcPin:'0000'}])],
 ['bs_rewards:'+slug+':email','synthetic@example.invalid'],
 ['bs_rewards:'+slug+':auto','1']
 ]);
 const storage={getItem:k=>map.get(k)??null,setItem:()=>{throw Error('unexpected write');},removeItem:()=>{throw Error('unexpected deletion');}};
 const before=JSON.stringify([...map]);const result=L.summary(storage,slug);
 assert.equal(result.queue.pending,1);assert.equal(result.queue.queued,1);assert.equal(result.history,1);assert.equal(result.rewards,1);
 assert.equal(result.unresolved,true);assert.equal(result.emailConfigured,true);assert.equal(result.auto,true);
 assert.deepEqual(L.validate(result),result);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC-SECRET|example\.invalid|000000000000000000000000000001/);
 assert.equal(JSON.stringify([...map]),before);
 map.set('bs_rewards:'+slug+':queue','broken');
 assert.deepEqual(L.summary(storage,slug),{ok:false,reason:'unreadable-cache'});
 assert.equal(L.summary(storage,'not-a-slug').ok,false);
});
