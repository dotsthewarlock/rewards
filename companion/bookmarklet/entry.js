// Generated into a self-contained bookmarklet; this adapter is page-world only.
// Explicit foreground review only; no passive recording or remote code loading.
function launchBookmarklet(markup,css){
 const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy,W=globalThis.RewardsWorkspaceContract;
 if(window.top!==window||!D.allowedOrigin(location.origin))return;
 const existing=document.getElementById('rewards-companion-dev');
 if(existing){if(existing.dataset.rewardsCompanion==='read-only'){existing.dispatchEvent(new Event('rewards-companion-close'));existing.remove();}return;}
 const host=document.createElement('section');
 host.id='rewards-companion-dev';host.dataset.rewardsCompanion='read-only';
 host.setAttribute('aria-label','Rewards Companion development workspace');
 const root=host.attachShadow({mode:'open'}),style=document.createElement('style');
 style.textContent=css;
 const shell=document.createElement('div');shell.className='shell';shell.innerHTML=markup;
 const close=document.createElement('button');close.type='button';close.textContent='Close workspace';
 close.addEventListener('click',()=>{host.dispatchEvent(new Event('rewards-companion-close'));host.remove();});shell.prepend(close);
 root.append(style,shell);document.body.append(host);
 const epoch=W.contextEpoch(()=>crypto.randomUUID());let prepared=null;
 const clearPrepared=()=>{prepared?.cancel();prepared=null;};
 host.addEventListener('rewards-companion-close',clearPrepared);
 close.addEventListener('click',clearPrepared);
 window.addEventListener('pagehide',()=>{host.dispatchEvent(new Event('rewards-companion-close'));host.remove();},{once:true});
 const syncContext=()=>{const id=D.identity(document);if(epoch.sync(id))clearPrepared();return id;};
 const inspect=()=>{
   syncContext();const report=D.report(document),recognized=report?.status==='recognized';
   const target=recognized?{origin:report.origin,campaign:report.campaign,documentToken:epoch.token}:null;
   return {ok:true,report,target,summary:recognized?L.summary(localStorage,report.campaign):null,details:recognized?L.details(localStorage,report.campaign,epoch.token):null,recovery:recognized&&report.stage==='success'?globalThis.RewardsTransactions.pendingSelection(localStorage,report.campaign):null,diagnostics:{enabled:false,count:recognized?1:0}};
 };
 const request=async(op,fields={})=>{
   if(!host.isConnected)return {ok:false,reason:'workspace-closed'};
   const current=inspect();
   if(op==='inspect')return current;
   if(W.isScoped(op)){
     const t=fields.target,c=current.target;
     if(!W.sameTarget(t,c))return {ok:false,reason:'context-changed'};
     if(op==='prepareNext'){
       clearPrepared();
       const valid=()=>host.isConnected&&!!syncContext()&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
       return globalThis.RewardsForeground.prepareNext(document,localStorage,navigator.locks,c,valid);
     }
     if(op==='prepareFinal'){
       clearPrepared();
       const valid=()=>host.isConnected&&!!syncContext()&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
       const binding=globalThis.RewardsForeground.prepareFinal(document,localStorage,navigator.locks,c,valid);
       if(!binding.ok)return binding;
       prepared=binding;
       return {ok:true,review:binding.review};
     }
     if(op==='cancelFinal'){if(prepared?.review.attemptId===fields.attemptId)clearPrepared();return {ok:true};}
     if(op==='authorizeFinal'){
       if(fields.confirmed!==true||!prepared||prepared.review.attemptId!==fields.attemptId)return {ok:false,reason:'review-expired'};
       const binding=prepared;prepared=null;
       return binding.authorize();
     }
     if(op==='revealReward')return L.revealReward(localStorage,c.campaign,fields.snapshot,fields.index);
     if(op==='exportRewards')return L.exportRows(localStorage,c.campaign);
     if(op==='reconcileSuccess'){
       const current=()=>host.isConnected&&!!syncContext()&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
       return globalThis.RewardsSuccess.reconcileVisible(document,localStorage,navigator.locks,c,fields.attemptId,current);
     }
     if(op==='editCache'){
       clearPrepared();
       const current=()=>{
         const now=syncContext();
         return host.isConnected&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp')&&now?.status==='recognized'&&now.origin===c.origin&&now.campaign===c.campaign;
       };
       return L.editCache(localStorage,navigator.locks,c.campaign,fields.edit,fields.value,current,c.documentToken);
     }
     const result=await L.previewImport(localStorage,c.campaign,fields.text);
     const now=inspect().target;
     return host.isConnected&&now?.origin===c.origin&&now?.campaign===c.campaign&&now?.documentToken===c.documentToken?result:{ok:false,reason:'context-changed'};
   }
   if(op==='exportDiagnostics'&&current.target)return {ok:true,export:{schema:'rewards.structural-export/1',provenance:{distribution:'bookmarklet',scope:'current-document',evidence:'structural-only',exportedAt:new Date().toISOString()},records:[{at:new Date().toISOString(),report:current.report}]}};
   return {ok:false,reason:'unsupported-command'};
 };
 mountWorkspace(root,request,{recording:false});
}
