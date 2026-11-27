/* M2 offline planning only. Not imported or packaged by either runtime.
 * Pure transitions; caller must persist/read back before any hypothetical work.
 * No alarm, storage API, external request, or recovery/reset authority.
 */
import './identity.js';
import './public-catalog.js';
const C=globalThis.RewardsPublicCatalog,D=globalThis.RewardsIdentity;
export const HOUR=3600000,DAY=24*HOUR,HISTORY_LIMIT=32;
const near=72*HOUR,maxTime=Date.UTC(9999,11,31),minTime=Date.UTC(2000,0,1);
const time=n=>Number.isSafeInteger(n)&&n>=minTime&&n<=maxTime;
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const plus=(n,delta)=>Math.min(maxTime,n+delta);
const stamp=v=>v===null?null:Date.parse(v);
const stopFor=outcome=>({restricted:'access-denied','rate-limited':'rate-limited',checking:'interrupted',unavailable:'unknown'})[outcome]||null;
const stops=['access-denied','rate-limited','interrupted','unknown','retry-budget'];
const outcomes=['never','verified-directory','unavailable','restricted','rate-limited','checking'];
// Only exact published instants supplied by a future verified metadata adapter.
// Unknown bounds remain null. No date parsing from slugs or assumed local zone.
export function nextDue(kind,at,dates={}){
 if(!time(at)||!['directory','campaign'].includes(kind))return null;
 const {purchaseStart=null,purchaseEnd=null,claimStart=null,claimEnd=null}=dates;
 const values=[purchaseStart,purchaseEnd,claimStart,claimEnd];
 if(values.some(v=>v!==null&&!time(v))||
    (purchaseStart!==null&&purchaseEnd!==null&&purchaseStart>purchaseEnd)||
    (claimStart!==null&&claimEnd!==null&&claimStart>claimEnd))return null;
 if(kind==='campaign'&&purchaseEnd!==null&&claimEnd!==null&&at>Math.max(purchaseEnd,claimEnd))return null;
 let interval=DAY;
 if(kind==='campaign'&&purchaseStart!==null&&at<purchaseStart)interval=12*HOUR;
 const boundaries=[purchaseEnd,claimEnd].filter(time);
 if(kind==='directory'){
   const d=new Date(at),y=d.getUTCFullYear(),m=d.getUTCMonth();
   boundaries.push(Date.UTC(y,m,1),Date.UTC(y,m+1,1));
 }
 let due=plus(at,interval);
 for(const boundary of boundaries){
   if(Math.abs(at-boundary)<=near)due=Math.min(due,plus(at,4*HOUR));
   else if(boundary>at)due=Math.min(due,boundary-near);
 }
 return due>at?due:null;
}
// Parse only explicit delta-seconds or canonical IMF-fixdate. A deadline is
// advisory evidence, never permission to resume a rate-limited/denied source.
export function retryAfterAt(value,at){
 if(!time(at)||typeof value!=='string')return null;
 if(/^\d{1,12}$/.test(value)){
   const n=at+Number(value)*1000;return time(n)?n:null;
 }
 const parsed=Date.parse(value);
 return time(parsed)&&new Date(parsed).toUTCString()===value?Math.max(at,parsed):null;
}
const keys=['schema','source','catalogAt','catalogOutcome','clock','dueAt','attempt','pendingAt','stop','failures','retryNotBefore','history'];
const identityKey=k=>typeof k==='string'&&D.publicLink(k,'https://getmybonus.ca')?.key===k;
function keyList(v){return Array.isArray(v)&&v.length<=200&&v.every(identityKey)&&new Set(v).size===v.length&&v.every((x,i)=>!i||v[i-1]<x);}
export function validateSchedule(s){
 if(!exact(s,keys)||s.schema!=='rewards.monitor-plan/1'||s.source!==C.source||
    !outcomes.includes(s.catalogOutcome)||!(s.catalogAt===null||time(s.catalogAt))||
    (s.catalogOutcome==='never')!==(s.catalogAt===null)||!time(s.clock)||
    (s.catalogAt!==null&&s.catalogAt>s.clock)||
    !(s.dueAt===null||time(s.dueAt))||!Number.isSafeInteger(s.attempt)||s.attempt<0||
    !(s.pendingAt===null||time(s.pendingAt))||!(s.stop===null||stops.includes(s.stop))||
    !Number.isInteger(s.failures)||s.failures<0||s.failures>5||
    !(s.retryNotBefore===null||time(s.retryNotBefore))||
    !Array.isArray(s.history)||s.history.length>HISTORY_LIMIT)return null;
 if(s.pendingAt!==null&&(s.pendingAt!==s.clock||s.attempt===0||s.stop!==null||s.dueAt!==null))return null;
 if(s.stop!==null&&(s.pendingAt!==null||s.dueAt!==null))return null;
 if(s.stop===null&&s.pendingAt===null&&(s.dueAt===null||s.dueAt<s.clock))return null;
 if(s.retryNotBefore!==null&&(s.stop!=='rate-limited'||s.retryNotBefore<s.clock))return null;
 const required=stopFor(s.catalogOutcome);
 if(required&&!(required==='unknown'&&s.failures>0&&(s.stop===null||s.stop==='retry-budget'))&&s.stop!==required)return null;
 if(s.failures===5&&s.stop!=='retry-budget')return null;
 if(s.stop==='retry-budget'&&s.failures!==5)return null;
 let previous=0;
 for(const event of s.history){
   if(!exact(event,['at','added','missing'])||!time(event.at)||event.at<=previous||event.at>s.clock||
     !keyList(event.added)||!keyList(event.missing)||!(event.added.length||event.missing.length)||
     event.added.some(k=>event.missing.includes(k)))return null;
   previous=event.at;
 }
 return structuredClone(s);
}
function catalogRecord(input){
 const c=C.validate(input);
 if(!c||c.checkedAt!==null&&!time(stamp(c.checkedAt)))return null;
 return c;
}
function sameCatalog(s,c){return !!c&&s.catalogAt===stamp(c.checkedAt)&&s.catalogOutcome===c.outcome;}
export function createSchedule(input,now){
 const c=catalogRecord(input);
 if(!c||!time(now)||stamp(c.checkedAt)>now)return null;
 const stop=stopFor(c.outcome);
 const due=stop?null:c.checkedAt===null?now:Math.max(now,nextDue('directory',stamp(c.checkedAt))??now);
 return validateSchedule({schema:'rewards.monitor-plan/1',source:C.source,catalogAt:stamp(c.checkedAt),catalogOutcome:c.outcome,
  clock:now,dueAt:due,attempt:0,pendingAt:null,stop,failures:0,retryNotBefore:null,history:[]});
}
// A persisted pending intent is NOT replayable on wake or restart. An external
// manual refresh invalidates the schedule rather than silently rebaselining.
export function plan(input,catalog,now,optedIn=false){
 const s=validateSchedule(input),c=catalogRecord(catalog);
 if(!s||!c||!time(now))return {status:'invalid'};
 if(s.stop)return {status:s.stop};
 if(s.pendingAt!==null)return {status:'interrupted'};
 if(!sameCatalog(s,c))return {status:'catalog-changed'};
 if(now<s.clock)return {status:'clock-regressed'};
 if(optedIn!==true)return {status:'disabled'};
 if(now<s.dueAt)return {status:'waiting',dueAt:s.dueAt};
 return {status:'due',dueAt:s.dueAt};
}
export function begin(input,catalog,now,optedIn=false){
 const s=validateSchedule(input);
 if(!s||plan(s,catalog,now,optedIn).status!=='due'||s.attempt===Number.MAX_SAFE_INTEGER)return null;
 return validateSchedule({...s,clock:now,dueAt:null,attempt:s.attempt+1,pendingAt:now});
}
function previousListed(c){
 const latest=c.entries.reduce((max,e)=>!max||e.lastSeen>max?e.lastSeen:max,null);
 return latest===null?[]:c.entries.filter(e=>e.lastSeen===latest).map(e=>e.key).sort();
}
function changes(history,before,after,at){
 const old=new Set(previousListed(before)),current=new Set(after.entries.filter(e=>e.listed).map(e=>e.key));
 const added=[...current].filter(k=>!old.has(k)).sort(),missing=[...old].filter(k=>!current.has(k)).sort();
 if(!added.length&&!missing.length)return history;
 return [...history,{at,added,missing}].slice(-HISTORY_LIMIT);
}
// Simulation only: settle requires the original catalog snapshot and the
// separately validated post-attempt catalog. Generic unavailable is ambiguous;
// only explicitly classified transient failures get bounded offline backoff.
export function settle(input,attempt,beforeInput,afterInput,now,{transient=false,retryAfter=null}={}){
 const s=validateSchedule(input),before=catalogRecord(beforeInput),after=catalogRecord(afterInput);
 if(!s||s.pendingAt===null||s.attempt!==attempt||!sameCatalog(s,before)||!after||
    !time(now)||now<s.clock||after.checkedAt===null||stamp(after.checkedAt)<s.pendingAt||stamp(after.checkedAt)>now||
    after.outcome==='never')return null;
 let stop=stopFor(after.outcome),failures=0,dueAt=null,retryNotBefore=null,history=s.history;
 if(after.outcome==='verified-directory'){
   dueAt=nextDue('directory',now);
   history=changes(history,before,after,now);
 }else if(after.outcome==='unavailable'&&transient===true){
   failures=Math.min(5,s.failures+1);
   stop=failures===5?'retry-budget':null;
   if(!stop)dueAt=plus(now,Math.min(DAY,2**(failures-1)*HOUR));
 }else if(after.outcome==='rate-limited'){
   retryNotBefore=retryAfterAt(retryAfter,now);
 }
 if(!stop&&dueAt===null)return null;
 return validateSchedule({...s,catalogAt:stamp(after.checkedAt),catalogOutcome:after.outcome,clock:now,dueAt,
   pendingAt:null,stop,failures,retryNotBefore,history});
}
