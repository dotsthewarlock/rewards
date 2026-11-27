// Test-only transport: shares real pure cache/transaction modules; no browser
// transport, merchant DOM, network, localStorage or persisted user data.
import '../core/identity.js';
import '../core/legacy.js';
import '../core/registry.js';
import '../core/transactions.js';
import '../core/workspace-contract.js';
const L=globalThis.RewardsLegacy,T=globalThis.RewardsTransactions,C=globalThis.RewardsCampaigns,W=globalThis.RewardsWorkspaceContract;
export const fixtureCode=n=>String(n).padStart(30,'0');
export function makeSandbox(){
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 let held=false;
 const locks={async request(name,options,fn){if(held)return fn(null);held=true;try{return await fn({name});}finally{held=false;}}};
 let scenario='entry',token=crypto.randomUUID(),review=null,submissions=0,enabled=false,events=0;
 const campaign=()=>scenario==='multiple'?C.byId('CA1126PZFT'):C.byId('CA1126VANW');
 for(const c of C.campaigns)storage.setItem(L.key(c.id,'email'),'fixture@example.invalid');
 const target=()=>['entry','success','multiple'].includes(scenario)?{origin:campaign().origin,campaign:campaign().id,documentToken:token}:null;
 const current=t=>W.sameTarget(target(),t);
 const blocked=reason=>({ok:false,reason});
 function report(){const c=campaign();return scenario==='disconnected'?null:{status:scenario==='unknown'?'unknown':'recognized',campaign:c.id,origin:c.origin,stage:scenario==='success'?'success':'entry',controls:{submit:{actionable:scenario==='entry'?1:0,present:1,visible:1},form:{present:1,visible:1,actionable:0}}};}
 async function request(op,f={}){
  const t=target(),slug=t?.campaign;
  if(op==='inspect')return {ok:true,target:t,report:report(),summary:t?L.summary(storage,slug):null,details:t?L.details(storage,slug):null,recovery:t&&scenario==='success'?T.pendingSelection(storage,slug):null,diagnostics:{enabled,count:events?1:0,eventCount:events,blocked:false}};
  if(op==='getCatalog'||op==='refreshCatalog')return {ok:true,catalog:{outcome:'never',entries:[]}};
  if(op==='setDiagnostics'){enabled=f.enabled===true;return {ok:true};}
  if(op==='exportDiagnostics')return {ok:true,export:{schema:'synthetic-only',events}};
  if(!current(f.target))return blocked('context-changed');
  if(op==='captureDiagnostics'){if(!enabled)return blocked('recording-disabled');events++;return {ok:true};}
  if(op==='previewImport')return L.previewImport(storage,slug,f.text);
  if(op==='editCache'){review=null;return L.editCache(storage,locks,slug,f.edit,f.value,()=>current(t));}
  if(op==='exportRewards')return L.exportRows(storage,slug);
  if(op==='revealReward')return L.revealReward(storage,slug,f.snapshot,f.index);
  if(op==='cancelFinal'){if(review?.attemptId===f.attemptId)review=null;return {ok:true};}
  if(op==='prepareFinal'){
   const row=L.decodeRows(storage.getItem(L.key(slug,'queue'))).find(r=>r.state==='queued'),choice=C.singleChoice(slug,t.origin),email=storage.getItem(L.key(slug,'email'));
   if(scenario!=='entry'||!row||!choice||L.summary(storage,slug).unresolved)return blocked('review-unavailable');
   review=Object.freeze({...t,...choice,attemptId:crypto.randomUUID(),queueId:row.id,code:row.code,email,terms:true});
   return {ok:true,review};
  }
  if(op==='authorizeFinal'){
   if(f.confirmed!==true||review?.attemptId!==f.attemptId)return blocked('review-expired');
   const selected=review;review=null;
   return T.startAttempt(storage,locks,selected,()=>current(t)&&scenario==='entry',()=>{submissions++;return true;});
  }
  if(op==='reconcileSuccess'){
   const a=JSON.parse(storage.getItem(L.key(slug,'active'))||'null')?.attempt;
   if(scenario!=='success'||!a)return blocked('success-unavailable');
   return T.reconcileSuccess(storage,locks,t,f.attemptId,{cardMerchant:a.cardMerchant,valueRecent:a.valueRecent,gcNumber:'DEMO-'+a.code.slice(-4),gcPin:'0000',sourceRedemptionCode:a.code},()=>current(t)&&scenario==='success');
  }
  return blocked('unsupported-command');
 }
 return {request,setScenario(value){scenario=value;token=crypto.randomUUID();review=null;},get submissions(){return submissions;}};
}
