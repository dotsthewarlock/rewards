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

test('explicit legacy export preserves leading zeros and whitelists columns; malformed records fail closed',()=>{
 const raw=JSON.stringify([{cardMerchant:'Fixture',valueRecent:'10.00',gcNumber:'000123',gcPin:'0000',sourceRedemptionCode:'private'}]);
 const storage={getItem:k=>k==='bs_rewards:'+slug+':giftcards'?raw:null};
 const result=L.exportRows(storage,slug);
 assert.deepEqual(result,{ok:true,rows:[{cardMerchant:'Fixture',valueRecent:'10.00',gcNumber:'000123',gcPin:'0000'}]});
 assert.deepEqual(L.validateExport(result),result);
 assert.equal(L.validateExport({ok:true,rows:[{...result.rows[0],extra:'private'}]}),null);
 assert.equal(L.exportRows({getItem:()=>JSON.stringify([{gcNumber:123}])},slug).ok,false);
});

test('real v15 parser preserves 30-digit strings embedded in receipt text and rejects longer tokens',()=>{
 const a='012345678901234567890123456789',b='987654321098765432109876543210';
 assert.deepEqual(L.parseBarcodes('Receipt: '+a+'\n'+b+' ; '+a+'0 abc'+a),[a,b]);
 assert.throws(()=>L.parseBarcodes('x'.repeat(262145)));
});
test('queue plan matches v15 duplicates, hash-only history, error retries and capacity without mutation',async()=>{
 const a='000000000000000000000000000001',b='000000000000000000000000000002',c='000000000000000000000000000003';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const queue=[{id:'old',code:a,state:'error'}],history=[{h:hash,last4:'0002'}];
 const before=JSON.stringify({queue,history});
 const plan=await L.planQueueImport(queue,history,[a,b,c,c].join('\n'));
 assert.deepEqual(plan.additions.map(r=>[r.code,r.state]),[[a,'queued'],[b,'duplicate'],[c,'queued'],[c,'duplicate']]);
 assert.equal(plan.additions[1].note,'Already in redemption history');
 assert.equal(JSON.stringify({queue,history}),before);
 const capped=await L.planQueueImport(Array.from({length:998},()=>({code:c,state:'queued'})),[],a+'\n'+b);
 assert.equal(capped.queued,1);assert.equal(capped.overflow,1);
});
test('legacy detail packet is masked, bounded and rejects injected fields; preview is non-mutating',async()=>{
 const a='012345678901234567890123456789';
 const map=new Map([['bs_rewards:'+slug+':queue',JSON.stringify([{code:a,state:'queued',note:'SECRET'}])],['bs_rewards:'+slug+':history',JSON.stringify([{h:'SECRET_HASH',last4:'1234'}])]]);
 const store={getItem:k=>map.get(k)??null,setItem(){throw Error('unexpected write');}};
 const before=JSON.stringify([...map]),d=L.details(store,slug);
 assert.deepEqual(d,{ok:true,queue:[{last4:'6789',state:'queued'}],history:[{last4:'1234'}],rewards:[],rewardSnapshot:d.rewardSnapshot});
 assert.ok(L.validSelection(d.rewardSnapshot,0));
 assert.deepEqual(L.validateDetails(d),d);
 assert.equal(L.validateDetails({...d,queue:[{last4:'6789',state:'queued',code:a}]}),null);
 const p=await L.previewImport(store,slug,a);
 assert.deepEqual(p,{ok:true,queued:0,duplicates:1,overflow:0,recognized:1});
 assert.deepEqual(L.validatePreview(p),p);
 assert.equal(L.validatePreview({...p,recognized:2}),null);
 assert.equal(JSON.stringify([...map]),before);
});

const testLock={request:async(name,options,fn)=>{
 assert.equal(name,L.editLock);assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});return fn({});
}};
function editableStore(){
 const map=new Map([['bs_rewards:'+slug+':queue',JSON.stringify([{id:'legacy',code:'000000000000000000000000000001',state:'queued',note:'preserve',created:7}])],['bs_rewards:slug_index_v1',JSON.stringify(['CA1026CK1'])]]);
 let writes=0;
 return {map,get writes(){return writes;},getItem:k=>map.get(k)??null,setItem(k,v){writes++;map.set(k,v);}};
}
test('explicit cache import and preferences retain v15 keys, fields and leading zeros',async()=>{
 const storage=editableStore(),a='000000000000000000000000000001',b='012345678901234567890123456789';
 const result=await L.editCache(storage,testLock,slug,'importQueue',a+'\n'+b,()=>true);
 assert.deepEqual(result,{ok:true,queued:1,duplicates:1,overflow:0,recognized:2});
 const queue=JSON.parse(storage.getItem('bs_rewards:'+slug+':queue'));
 assert.deepEqual(queue[0],{id:'legacy',code:a,state:'queued',note:'preserve',created:7});
 assert.equal(queue[1].state,'duplicate');assert.equal(queue[2].code,b);assert.equal(queue[2].state,'queued');
 assert.equal(typeof queue[2].id,'string');assert.ok(Number.isInteger(queue[2].created));
 assert.deepEqual(JSON.parse(storage.getItem('bs_rewards:slug_index_v1')),['CA1026CK1',slug]);
 assert.deepEqual(await L.editCache(storage,testLock,slug,'saveEmail','test@example.invalid',()=>true),{ok:true});
 assert.equal(storage.getItem('bs_rewards:'+slug+':email'),'test@example.invalid');
 assert.deepEqual(await L.editCache(storage,testLock,slug,'saveClipboard',true,()=>true),{ok:true});
 assert.equal(storage.getItem('bs_rewards:'+slug+':clipboard'),'1');
 assert.equal(storage.getItem('bs_rewards:'+slug+':active'),null);
 assert.equal(storage.getItem('bs_rewards:'+slug+':auto'),null);
});
test('edit gate fails closed on pending, active, legacy locks, unavailable locks or stale context',async()=>{
 for(const name of ['active','lock','queue']){
  const s=editableStore();
  s.map.set('bs_rewards:'+slug+':'+name,name==='queue'?JSON.stringify([{code:'000000000000000000000000000001',state:'pending'}]):'{}');
  assert.equal((await L.editCache(s,testLock,slug,'saveClipboard',true,()=>true)).reason,'legacy-busy');
  assert.equal(s.writes,0);
 }
 const s=editableStore();
 assert.equal((await L.editCache(s,null,slug,'saveClipboard',true,()=>true)).reason,'lock-unavailable');
 assert.equal((await L.editCache(s,{request:async(n,o,f)=>f(null)},slug,'saveClipboard',true,()=>true)).reason,'edit-busy');
 assert.equal((await L.editCache(s,testLock,slug,'saveClipboard',true,()=>false)).reason,'context-changed');
 assert.equal(s.writes,0);
 s.map.set('bs_rewards:slug_index_v1','bad');
 assert.equal((await L.editCache(s,testLock,slug,'saveClipboard',true,()=>true)).reason,'unreadable-cache');
 assert.equal(s.writes,0);
});
test('edit rechecks stale cache and never reports success after storage failure or readback mismatch',async()=>{
 const s=editableStore();let calls=0;
 const result=await L.editCache(s,testLock,slug,'saveEmail','test@example.invalid',()=>{
  if(++calls===2)s.map.set('bs_rewards:'+slug+':history','[]');return true;
 });
 assert.equal(result.reason,'cache-changed');assert.equal(s.writes,0);
 const broken=editableStore();broken.setItem=()=>{throw Error('quota');};
 assert.equal((await L.editCache(broken,testLock,slug,'saveClipboard',true,()=>true)).reason,'edit-outcome-unknown');
 const wrong=editableStore();wrong.setItem=()=>{};
 assert.equal((await L.editCache(wrong,testLock,slug,'saveClipboard',true,()=>true)).reason,'edit-outcome-unknown');
});

test('email preference validation matches the v15 redemption validator',()=>{
 assert.equal(L.validEdit('saveEmail','fixture@example'),false);
 assert.equal(L.validEdit('saveEmail','fixture@example.invalid'),true);
 assert.equal(L.validEdit('saveEmail',null),false);
});

test('masked reward browsing never includes full reward credentials or arbitrary metadata',()=>{
 const storage={getItem:k=>k===L.key(slug,'giftcards')?JSON.stringify([{gcNumber:'1234567890123456',gcPin:'0000',valueRecent:'10.00',note:'PRIVATE_FIXTURE'},{gcNumber:'short',gcPin:'0123',valueRecent:'invalid'}]):null};
 const d=L.details(storage,slug);
 assert.deepEqual(d.rewards,[{last4:'3456',value:'10.00'},{last4:null,value:null}]);
 assert.deepEqual(L.validateDetails(d),d);
 assert.doesNotMatch(JSON.stringify(d.rewards),/1234567890123456|PRIVATE_FIXTURE|0000|0123/);
 assert.equal(L.validateDetails({...d,rewards:[{last4:'3456',value:'10.00',extra:'PRIVATE_FIXTURE'}]}),null);
});

test('individual reveal binds exact snapshot, rejects masked collisions after reorder or replacement, keeps bulk export separate',()=>{
 const first={cardMerchant:'Fixture A',valueRecent:'10.00',gcNumber:'SYNTHETICA1234',gcPin:'test-A'};
 const second={cardMerchant:'Fixture B',valueRecent:'10.00',gcNumber:'SYNTHETICB1234',gcPin:'test-B'};
 let raw=JSON.stringify([first,second]);
 const storage={getItem:k=>k===L.key(slug,'giftcards')?raw:null,setItem(){throw Error('read-only');}};
 const d=L.details(storage,slug);
 assert.deepEqual(d.rewards,[{last4:'1234',value:'10.00'},{last4:'1234',value:'10.00'}]);
 assert.equal(L.details(storage,slug).rewardSnapshot,d.rewardSnapshot);
 const one=L.revealReward(storage,slug,d.rewardSnapshot,1);
 assert.deepEqual(one,{ok:true,snapshot:d.rewardSnapshot,index:1,row:second});
 assert.deepEqual(L.validateReveal(one,d.rewardSnapshot,1),one);
 assert.equal(L.validateReveal({...one,rows:[first,second]},d.rewardSnapshot,1),null);
 assert.equal(L.validateReveal(one,d.rewardSnapshot,0),null);
 assert.deepEqual(L.exportRows(storage,slug).rows,[first,second]);
 raw=JSON.stringify([second,first]);
 assert.equal(L.revealReward(storage,slug,d.rewardSnapshot,1).ok,false);
 const fresh=L.details(storage,slug);
 assert.notEqual(fresh.rewardSnapshot,d.rewardSnapshot);
 assert.deepEqual(L.revealReward(storage,slug,fresh.rewardSnapshot,1).row,first);
 raw=JSON.stringify([second,{...first,gcPin:'changed'}]);
 assert.equal(L.revealReward(storage,slug,fresh.rewardSnapshot,1).ok,false);
 assert.equal(L.revealReward(storage,slug,fresh.rewardSnapshot,999).ok,false);
});
