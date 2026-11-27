import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, reduce, currentCache, makeProvider} from '../extension/core/model.js';
import {attemptIdentity} from '../extension/core/contracts.js';
import {campaigns} from '../extension/core/campaigns.js';
import {fixtureCode, tsv} from '../extension/core/codec.js';
const a=campaigns[0].id,b=campaigns[3].id;
const run=(s,...commands)=>commands.reduce(reduce,s);
function ready(s=initialState()) {
 return run(s,{type:'import',text:fixtureCode(1)},{type:'review'},{type:'reviewField',key:'terms',value:true});
}
function start(s=initialState()) {const v=ready(s);return reduce(v,{type:'authorize',attempt:attemptIdentity(v.review)});}
test('historical browsing cannot swallow an authorized result',()=>{
 let s=start(),attempt=attemptIdentity(s.review);
 s=run(s,{type:'view',id:b},{type:'navigate',screen:'rewards'},{type:'outcome',attempt,value:'success'});
 assert.equal(s.caches[a].queue[0].state,'complete');assert.equal(s.caches[a].rewards.length,1);assert.equal(s.caches[b].rewards.length,0);assert.equal(s.view,b);
});
test('session reset fences previous synthetic attempt',()=>{
 let s=start(),old=attemptIdentity(s.review);s=start(reduce(s,{type:'reset'}));
 assert.notEqual(s.review.generation,old.generation);s=reduce(s,{type:'outcome',attempt:old,value:'success'});assert.equal(s.phase,'running');assert.equal(currentCache(s).rewards.length,0);
});
test('clear requires explicit campaign and does not follow changed view',()=>{
 let s=run(initialState(),{type:'import',text:fixtureCode(1)},{type:'context',id:b},{type:'import',text:fixtureCode(2)},{type:'view',id:a});
 s=reduce(s,{type:'clear',key:'queue'});assert.equal(s.caches[a].queue.length,1);
 s=reduce(s,{type:'clear',key:'queue',campaign:'unknown'});assert.equal(s.caches[b].queue.length,1);
 s=reduce(s,{type:'clear',key:'queue',campaign:b});assert.equal(s.caches[a].queue.length,1);assert.equal(s.caches[b].queue.length,0);
});
test('provider owns seed and exposes recursively immutable snapshots',()=>{
 const seed=initialState(),p=makeProvider(seed);seed.caches[a].email='mutated';assert.equal(p.getSnapshot().caches[a].email,'demo@example.com');
 assert.throws(()=>{p.getSnapshot().caches[a].queue.push({});},TypeError);
 let emitted;p.subscribe(s=>{emitted=s;});p.dispatch({type:'import',text:fixtureCode(1)});assert.throws(()=>{emitted.caches[a].queue[0].state='complete';},TypeError);
});
test('campaign registry nested arrays cannot be modified',()=>{
 assert.throws(()=>campaigns[0].products.push('other'),TypeError);assert.throws(()=>{campaigns[0].cents=0;},TypeError);
});
test('TSV retains four columns and exact string credentials',()=>{
 const data=[{cardMerchant:' demo\tmerchant\r\nname ',valueRecent:'15.00',gcNumber:'00001234',gcPin:'0000'}];
 assert.equal(tsv(data),'demo merchant name\t15.00\t00001234\t0000');
});
test('attempt identity requires every field, including exact code and campaign',()=>{
 const s=ready(),identity=attemptIdentity(s.review);
 for(const key of Object.keys(identity)) {const invalid={...identity};delete invalid[key];assert.equal(reduce(s,{type:'authorize',attempt:invalid}).phase,'review');}
 assert.equal(reduce(s,{type:'authorize',attempt:{...identity,code:fixtureCode(2)}}).phase,'review');
 assert.equal(reduce(s,{type:'authorize',attempt:{...identity,campaign:b}}).phase,'review');
 assert.equal(reduce(s,{type:'authorize',attempt:identity}).phase,'running');
});
test('repeat synthetic result cannot duplicate capture',()=>{
 const s=start(),cmd={type:'outcome',attempt:attemptIdentity(s.review),value:'success'};const result=run(s,cmd,cmd);assert.equal(currentCache(result).rewards.length,1);
});

test('changed reward or product invalidates reviewed authority and terms',()=>{
 let s=run(initialState(),{type:'context',id:b},{type:'import',text:fixtureCode(1)},{type:'review'},{type:'reviewField',key:'product',value:0},{type:'reviewField',key:'reward',value:0},{type:'reviewField',key:'terms',value:true});
 const old=attemptIdentity(s.review);
 s=run(s,{type:'reviewField',key:'reward',value:1});
 assert.equal(s.review.terms,false);
 s=reduce(s,{type:'reviewField',key:'terms',value:true});
 assert.equal(reduce(s,{type:'authorize',attempt:old}).phase,'review');
 const latest=attemptIdentity(s.review);
 assert.equal(reduce(s,{type:'authorize',attempt:{...latest,reward:0}}).phase,'review');
 assert.equal(reduce(s,{type:'authorize',attempt:latest}).phase,'running');
 s=reduce(s,{type:'reviewField',key:'product',value:1});
 assert.equal(s.review.terms,false);
 assert.equal(reduce(s,{type:'authorize',attempt:latest}).phase,'review');
});
test('terms withdrawal and reacceptance invalidate stale review',()=>{
 let s=ready();const old=attemptIdentity(s.review);
 s=run(s,{type:'reviewField',key:'terms',value:false},{type:'reviewField',key:'terms',value:true});
 assert.equal(reduce(s,{type:'authorize',attempt:old}).phase,'review');
 assert.equal(reduce(s,{type:'authorize',attempt:attemptIdentity(s.review)}).phase,'running');
});
