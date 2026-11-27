import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HOUR,DAY,HISTORY_LIMIT,nextDue,retryAfterAt,createSchedule,validateSchedule,plan,begin,settle} from '../extension/core/monitor-plan.js';
const C=globalThis.RewardsPublicCatalog,D=globalThis.RewardsDiscovery;
const at=Date.UTC(2026,10,15,12),iso=n=>new Date(n).toISOString();
const ids=['CA1126WG1','CA1126VANW'].map(s=>D.publicLink('/'+s+'/en','https://getmybonus.ca'));
const observed=(before,now,rows=ids,outcome='verified-directory')=>C.merge(before,outcome==='verified-directory'?rows:null,outcome,iso(now));
const clone=x=>JSON.parse(JSON.stringify(x));
test('cadence uses independent explicit windows and UTC month boundary, not slug inference',()=>{
 assert.equal(nextDue('directory',at),at+DAY);
 assert.equal(nextDue('campaign',at),at+DAY);
 assert.equal(nextDue('campaign',at,{purchaseStart:at+7*DAY}),at+12*HOUR);
 assert.equal(nextDue('campaign',at,{purchaseEnd:at+DAY,claimEnd:at+10*DAY}),at+4*HOUR);
 assert.equal(nextDue('campaign',at,{purchaseEnd:at-1,claimEnd:at+DAY}),at+4*HOUR);
 assert.equal(nextDue('campaign',at,{purchaseEnd:at-1,claimEnd:at-1}),null);
 assert.equal(nextDue('campaign',at,{purchaseEnd:at-1}),at+4*HOUR);
 assert.equal(nextDue('campaign',at,{purchaseStart:at+1,purchaseEnd:at-1}),null);
 assert.equal(nextDue('campaign',at,{purchaseEnd:'2026-11-15'}),null);
 const month=Date.UTC(2026,11,1);
 assert.equal(nextDue('directory',month-80*HOUR),month-72*HOUR);
 assert.equal(nextDue('directory',month-72*HOUR),month-68*HOUR);
 assert.equal(nextDue('directory',month+48*HOUR),month+52*HOUR);
 assert.equal(nextDue('directory',month+96*HOUR),month+120*HOUR);
});
test('persisted due, opt-in, sleep coalescing and stale completion fencing',()=>{
 let c=observed(C.empty(),at),s=createSchedule(c,at);
 assert.equal(s.dueAt,at+DAY);
 assert.equal(plan(s,c,at+DAY).status,'disabled');
 assert.equal(plan(s,c,at+HOUR,true).status,'waiting');
 const wake=at+20*DAY;
 assert.equal(plan(clone(s),c,wake,true).status,'due');
 assert.equal(plan(s,c,at-1,true).status,'clock-regressed');
 const p=begin(s,c,wake,true);
 assert.equal(p.attempt,1);
 assert.equal(plan(clone(p),c,wake+DAY,true).status,'interrupted');
 assert.equal(begin(clone(p),c,wake+DAY,true),null);
 const newer=observed(c,wake);
 assert.equal(plan(s,newer,wake,true).status,'catalog-changed');
 assert.equal(settle(p,2,c,newer,wake),null);
 assert.equal(settle(p,1,c,newer,wake-1),null);
 s=settle(clone(p),1,c,newer,wake);c=newer;
 assert.equal(s.dueAt,wake+DAY);
 assert.equal(plan(s,c,wake,true).status,'waiting');
 assert.equal(settle(s,1,c,c,wake),null);
});
test('denial, rate limits and unknown interruptions cannot become due or reset themselves',()=>{
 for(const [outcome,reason] of [['restricted','access-denied'],['rate-limited','rate-limited'],['checking','interrupted'],['unavailable','unknown']]){
   const c=observed(C.empty(),at,ids,outcome),s=createSchedule(c,at);
   assert.equal(plan(clone(s),c,at+365*DAY,true).status,reason);
   assert.equal(begin(s,c,at+365*DAY,true),null);
   assert.equal(plan(s,observed(c,at+DAY),at+DAY,true).status,reason);
 }
 const c=observed(C.empty(),at),p=begin(createSchedule(c,at),c,at+DAY,true);
 const limited=observed(c,at+DAY,ids,'rate-limited');
 const s=settle(p,p.attempt,c,limited,at+DAY,{transient:true,retryAfter:'7200'});
 assert.equal(s.retryNotBefore,at+DAY+2*HOUR);
 assert.equal(plan(s,limited,at+100*DAY,true).status,'rate-limited');
 assert.equal(retryAfterAt('7200',at),at+2*HOUR);
 assert.equal(retryAfterAt(new Date(at+HOUR).toUTCString(),at),at+HOUR);
 for(const bad of ['-1','1.5','tomorrow','',null,'999999999999999999'])assert.equal(retryAfterAt(bad,at),null);
 assert.equal(settle(p,p.attempt,c,limited,at+DAY).retryNotBefore,null);
});
test('only explicitly classified transient failures get capped backoff; generic failure stops',()=>{
 let c=observed(C.empty(),at),s=createSchedule(c,at);
 const p=begin(s,c,s.dueAt,true),failed=observed(c,p.clock,ids,'unavailable');
 assert.equal(settle(p,p.attempt,c,failed,p.clock).stop,'unknown');
 for(let n=1;n<=5;n++){
   const pending=begin(s,c,s.dueAt,true),after=observed(c,pending.clock,ids,'unavailable');
   s=settle(pending,pending.attempt,c,after,pending.clock,{transient:true});c=after;
   assert.equal(s.failures,n);
   if(n<5)assert.equal(s.dueAt,s.clock+2**(n-1)*HOUR);
   else assert.equal(s.stop,'retry-budget');
 }
 assert.equal(plan(s,c,at+100*DAY,true).status,'retry-budget');
});
test('success resets explicit transient backoff and retains bounded public changes without altering catalog',()=>{
 let c=observed(C.empty(),at),s=createSchedule(c,at);
 let p=begin(s,c,s.dueAt,true),after=observed(c,p.clock,ids,'unavailable');
 s=settle(p,p.attempt,c,after,p.clock,{transient:true});c=after;
 p=begin(s,c,s.dueAt,true);after=observed(c,p.clock,[ids[0]]);
 s=settle(p,p.attempt,c,after,p.clock);c=after;
 assert.equal(s.failures,0);assert.deepEqual(s.history[0].missing,[ids[1].key]);
 for(let i=0;i<40;i++){
   p=begin(s,c,s.dueAt,true);after=observed(c,p.clock,i%2?[ids[0]]:ids);
   const snapshot=clone(after);s=settle(p,p.attempt,c,after,p.clock);c=after;
   assert.deepEqual(c,snapshot);assert.equal(c.entries.length,2);
 }
 assert.equal(s.history.length,HISTORY_LIMIT);
 assert.deepEqual(validateSchedule(clone(s)),s);
 assert.equal(validateSchedule({...s,private:'PRIVATE_FIXTURE'}),null);
 assert.equal(validateSchedule({...s,history:[{at:s.clock,added:['PRIVATE_FIXTURE'],missing:[]}]}),null);
 assert.equal(validateSchedule({...s,dueAt:null}),null);
 assert.equal(validateSchedule({...s,retryNotBefore:s.clock}),null);
});
test('offline planner has no runtime imports, package inclusion or alarm permission',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const manifest=JSON.parse(read('extension/manifest.json'));
 assert.ok(!manifest.permissions.includes('alarms'));
 for(const file of ['extension/background.js','extension/ui/workspace.js','bookmarklet/entry.js','scripts/build-bookmarklet.mjs','scripts/package-development.py'])
   assert.doesNotMatch(read(file),/monitor-plan/);
 assert.doesNotMatch(read('extension/core/monitor-plan.js'),/\b(?:fetch|setTimeout|setInterval|chrome\.alarms)\s*\(/);
});
