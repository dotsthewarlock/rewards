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
 assert.deepEqual(d,{ok:true,queue:[{last4:'6789',state:'queued'}],history:[{last4:'1234'}]});
 assert.deepEqual(L.validateDetails(d),d);
 assert.equal(L.validateDetails({...d,queue:[{last4:'6789',state:'queued',code:a}]}),null);
 const p=await L.previewImport(store,slug,a);
 assert.deepEqual(p,{ok:true,queued:0,duplicates:1,overflow:0,recognized:1});
 assert.deepEqual(L.validatePreview(p),p);
 assert.equal(L.validatePreview({...p,recognized:2}),null);
 assert.equal(JSON.stringify([...map]),before);
});
