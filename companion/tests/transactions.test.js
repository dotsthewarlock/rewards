import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/discovery/core.js';
import '../extension/discovery/legacy.js';
import '../extension/core/transactions.js';
const L=globalThis.RewardsLegacy,T=globalThis.RewardsTransactions;
const slug='CA1126VANW',code='012345678901234567890123456789',other='000000000000000000000000000001';
const review={origin:'https://getmybonus.ca',campaign:slug,documentToken:'00000000-0000-0000-0000-000000000001',attemptId:'00000000-0000-0000-0000-000000000002',queueId:'row-1',code,product:'$100 Vanilla prepaid card',reward:'Walmart eGift Card',cardMerchant:'Walmart',valueRecent:'15.00',email:'fixture@example.invalid',terms:true};
const target={origin:review.origin,campaign:slug,documentToken:'00000000-0000-0000-0000-000000000003'};
const card={cardMerchant:'Walmart',valueRecent:'15.00',gcNumber:'000012345678',gcPin:'0000',sourceRedemptionCode:code};
const key=n=>L.key(slug,n);
const lock={request:async(n,o,f)=>{assert.equal(n,L.editLock);return f({});}};
function store(){
 const map=new Map([[key('queue'),JSON.stringify([{id:'row-1',code,state:'queued',created:7},{id:'row-2',code:other,state:'queued',created:8}])],[key('email'),review.email]]);
 return {map,getItem:k=>map.get(k)??null,setItem(k,v){map.set(k,v);},removeItem(k){map.delete(k);}};
}
const read=(s,n)=>JSON.parse(s.getItem(key(n))||'null');
const start=(s,fn=()=>true,ctx=()=>true,r=review)=>T.startAttempt(s,lock,r,ctx,fn);
const reconcile=(s,c=card,ctx=()=>true,id=review.attemptId)=>T.reconcileSuccess(s,lock,target,id,c,ctx);
test('one fresh reviewed invocation only after durable pending intent and queue readback',async()=>{
 const s=store();let calls=0;
 assert.deepEqual(await start(s,()=>{calls++;assert.equal(read(s,'queue')[0].state,'pending');assert.equal(read(s,'active').attempt.code,code);return true;}),{ok:true,status:'pending'});
 assert.equal((await start(s,()=>{calls++;return true;})).reason,'unresolved');
 assert.equal(calls,1);assert.equal(read(s,'queue')[1].state,'queued');
});
test('unreviewed or stale authorization, changed email, duplicate and capacity do not invoke',async()=>{
 for(const change of [{terms:false},{code:other},{queueId:'row-2'},{email:'wrong@example.invalid'},{documentToken:'stale'}]){
  const s=store();assert.equal((await start(s,()=>{throw Error('must not invoke')},()=>true,{...review,...change})).ok,false);assert.equal(s.getItem(key('active')),null);
 }
 const s=store();s.map.set(key('history'),JSON.stringify([{code}]));
 assert.equal((await start(s,()=>{throw Error('must not invoke')})).reason,'duplicate');
 const full=store();full.map.set(key('giftcards'),JSON.stringify(Array.from({length:999},()=>({gcNumber:'fixture'}))));
 assert.equal((await start(full)).reason,'capacity');
});
test('each failed or mismatched pending write prevents invocation; no automatic rollback',async()=>{
 for(const field of ['active','queue'])for(const mode of ['throw','mismatch']){
  const s=store(),set=s.setItem.bind(s);s.setItem=(k,v)=>{if(k===key(field)){if(mode==='throw')throw Error('quota');return;}set(k,v);};
  let calls=0;assert.equal((await start(s,()=>{calls++;return true;})).ok,false);assert.equal(calls,0);
  if(field==='queue')assert.equal(read(s,'active').attempt.attemptId,review.attemptId);
 }
 const s=store();let checks=0,calls=0;
 assert.equal((await start(s,()=>{calls++;return true;},()=>++checks<3)).reason,'pending-unknown');
 assert.equal(calls,0);assert.ok(read(s,'active'));
});
test('failed or uncertain callback remains pending and blocks replay',async()=>{
 const s=store();let calls=0;
 assert.equal((await start(s,()=>{calls++;throw Error('unknown')})).reason,'pending-unknown');
 assert.equal(read(s,'queue')[0].state,'pending');
 assert.equal((await start(s,()=>{calls++;return true;})).reason,'unresolved');
 assert.equal(calls,1);
});
test('exact linked success only; no unrelated reward or queue advancement',async()=>{
 const s=store();await start(s);
 for(const bad of [{...card,sourceRedemptionCode:other},{...card,valueRecent:'10.00'},{...card,cardMerchant:'Other'},{...card,gcPin:''}]){
  assert.equal((await reconcile(s,bad)).reason,'reward-mismatch');
  assert.equal(s.getItem(key('giftcards')),null);assert.equal(read(s,'queue')[0].state,'pending');
 }
 assert.equal((await reconcile(s,card,()=>true,'00000000-0000-0000-0000-000000000004')).reason,'unresolved');
 assert.deepEqual(await reconcile(s),{ok:true,status:'complete'});
 assert.equal(read(s,'giftcards')[0].sourceRedemptionCode,code);
 assert.equal(read(s,'giftcards')[0].gcPin,'0000');
 assert.equal(read(s,'history')[0].giftKey,read(s,'giftcards')[0].key);
 assert.equal(read(s,'queue')[0].state,'complete');assert.equal(read(s,'queue')[1].state,'queued');assert.equal(s.getItem(key('active')),null);
 assert.equal((await reconcile(s)).ok,false);assert.equal(read(s,'giftcards').length,1);
});
test('capture failures at each write preserve intent and permit exact idempotent recovery',async()=>{
 for(const field of ['giftcards','history','queue','active']){
  const s=store();await start(s);const set=s.setItem.bind(s),remove=s.removeItem.bind(s);
  s.setItem=(k,v)=>{if(k===key(field))throw Error('quota');set(k,v);};
  s.removeItem=k=>{if(k===key(field))throw Error('quota');remove(k);};
  assert.equal((await reconcile(s)).ok,false);assert.ok(read(s,'active'));
  s.setItem=set;s.removeItem=remove;
  assert.deepEqual(await reconcile(s),{ok:true,status:'complete'});
  assert.equal(read(s,'giftcards').length,1);assert.equal(read(s,'history').length,1);
  assert.equal(read(s,'queue')[1].state,'queued');assert.equal(s.getItem(key('active')),null);
 }
});
test('credential/source or history linkage conflict cannot overwrite captured records',async()=>{
 const s=store();await start(s);
 s.map.set(key('giftcards'),JSON.stringify([{...card,sourceRedemptionCode:other,slug}]));
 assert.equal((await reconcile(s)).reason,'reward-conflict');assert.equal(read(s,'giftcards')[0].sourceRedemptionCode,other);
 s.map.delete(key('giftcards'));s.map.set(key('history'),JSON.stringify([{code,giftKey:'different'}]));
 assert.equal((await reconcile(s)).reason,'history-conflict');assert.equal(read(s,'history')[0].giftKey,'different');
});

test('null email and an existing linked reward independently block new submission',async()=>{
 const s=store();s.map.delete(key('email'));
 assert.equal((await start(s,()=>{throw Error('must not invoke')},()=>true,{...review,email:null})).reason,'invalid-review');
 const duplicate=store();duplicate.map.set(key('giftcards'),JSON.stringify([{...card,slug}]));
 assert.equal((await start(duplicate,()=>{throw Error('must not invoke')})).reason,'duplicate');
 assert.equal(duplicate.getItem(key('active')),null);
});
test('capture snapshots observed credentials before async ownership and rejects inconsistent stored keys',async()=>{
 const s=store();await start(s);
 const mutable={...card};
 const changingLock={request:async(n,o,f)=>{mutable.gcPin='9999';return f({});}};
 assert.deepEqual(await T.reconcileSuccess(s,changingLock,target,review.attemptId,mutable,()=>true),{ok:true,status:'complete'});
 assert.equal(read(s,'giftcards')[0].gcPin,'0000');
 const conflict=store();await start(conflict);
 conflict.map.set(key('giftcards'),JSON.stringify([{...card,gcPin:'9999',key:'000012345678|0000',sourceRedemptionCode:other,slug}]));
 assert.equal((await reconcile(conflict)).reason,'reward-conflict');
});
