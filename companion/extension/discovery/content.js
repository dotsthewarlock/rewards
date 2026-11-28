/* Passive top-frame listener. Adapted from InComm listener lifecycle; no merchant mutations or credential reads. */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy,W=globalThis.RewardsWorkspaceContract;
  if(window.top!==window||!D.allowedOrigin(location.origin)||globalThis.__rewardsDiscoveryLoaded)return;
  globalThis.__rewardsDiscoveryLoaded=true;
  const epoch=W.contextEpoch(()=>crypto.randomUUID());
  let prepared=null;
  const clearPrepared=()=>{prepared?.cancel();prepared=null;};
  let observer=null,timer=null,expiry=null,last='',generation=0,root=null,ancestors=[],stopped=false;
  function syncContext(){
    const id=D.identity(document);
    if(epoch.sync(id)){clearPrepared();last='';generation++;}
    return id;
  }
  function disconnect(){observer?.disconnect();observer=null;clearTimeout(timer);timer=null;clearTimeout(expiry);expiry=null;root=null;ancestors=[];}
  function schedule(){
    if(stopped||timer)return;
    timer=setTimeout(()=>{timer=null;capture();},180);
  }
  function bind(id){
    const nextRoot=id?.root||null,nextAncestors=[document,document.documentElement,document.body].filter(Boolean);
    // Shallow ancestor observation catches replacement/reparenting of a nested
    // wizard without scanning unrelated page subtrees.
    for(let n=nextRoot?.parentElement;n&&n!==document.body&&n!==document.documentElement&&nextAncestors.length<128;n=n.parentElement)nextAncestors.push(n);
    if(observer&&root===nextRoot&&ancestors.length===nextAncestors.length&&ancestors.every((n,i)=>n===nextAncestors[i]))return;
    observer?.disconnect();clearTimeout(expiry);root=nextRoot;ancestors=nextAncestors;
    if(!document.body)return;
    observer=new MutationObserver(schedule);
    for(const n of ancestors)if(n!==document.body)observer.observe(n,{childList:true});
    observer.observe(document.body,{attributes:true,attributeFilter:['data-slug'],childList:true});
    if(root){
      observer.observe(root,{subtree:true,childList:true,attributes:true,characterData:true,
        attributeFilter:['class','style','hidden','disabled','readonly','aria-hidden','aria-disabled','aria-modal','data-step']});

    }else{
      observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','id','data-slug']});
      expiry=setTimeout(()=>{observer?.disconnect();observer=null;},45000);
    }
  }
  async function capture(reason='structure-change',force=false){
    if(stopped)return;
    const id=syncContext(),report=D.report(document);
    if(!report)return;
    // Loss of recognition terminates recording scope; bounded discovery remains.
    bind(report.status==='recognized'?id:null);
    const sig=JSON.stringify(report);
    if(sig===last&&!force)return;
    last=sig;
    const seq=++generation;
    try{
      const response=await chrome.runtime.sendMessage({type:W.observationType,report,reason});
      if(!response?.ok&&seq===generation)last='';
    }catch{if(seq===generation)last='';}
  }
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||sender.tab||!W.isContentType(m?.type))return;
    const id=stopped?null:syncContext(),report=D.report(document);
    const recognized=!stopped&&report?.status==='recognized';
    if(recognized)bind(id);
    if(m.type!==W.contentType('inspect')){
      if(!recognized||m.documentToken!==epoch.token||m.campaign!==report.campaign||m.origin!==report.origin)return reply({ok:false,reason:'context-changed'});
      if(m.type===W.contentType('prepareNext')){
        clearPrepared();
        const current=()=>!stopped&&!!syncContext()&&m.documentToken===epoch.token&&document.visibilityState==='visible'&&!document.getElementById('bsp');
        globalThis.RewardsForeground.prepareNext(document,localStorage,navigator.locks,
          {origin:m.origin,campaign:m.campaign,documentToken:m.documentToken},current).then(reply,()=>reply({ok:false,reason:'fields-unverified'}));
        return true;
      }
      if(m.type===W.contentType('prepareFinal')){
        clearPrepared();
        const current=()=>!stopped&&!!syncContext()&&m.documentToken===epoch.token&&document.visibilityState==='visible'&&!document.getElementById('bsp');
        const binding=globalThis.RewardsForeground.prepareFinal(document,localStorage,navigator.locks,
          {origin:m.origin,campaign:m.campaign,documentToken:m.documentToken},current);
        if(!binding.ok)return reply(binding);
        prepared=binding;
        return reply({ok:true,review:binding.review});
      }
      if(m.type===W.contentType('cancelFinal')){
        if(prepared?.review.attemptId===m.attemptId)clearPrepared();
        return reply({ok:true});
      }
      if(m.type===W.contentType('authorizeFinal')){
        if(m.confirmed!==true||!prepared||prepared.review.attemptId!==m.attemptId)return reply({ok:false,reason:'review-expired'});
        const binding=prepared;prepared=null;
        binding.authorize().then(reply,()=>reply({ok:false,reason:'pending-unknown'}));
        return true;
      }
      if(m.type===W.contentType('revealReward'))return reply(L.revealReward(localStorage,report.campaign,m.snapshot,m.index));
      if(m.type===W.contentType('exportRewards'))return reply(L.exportRows(localStorage,report.campaign));
      if(m.type===W.contentType('reconcileSuccess')){
        const current=()=>!stopped&&!!syncContext()&&m.documentToken===epoch.token&&document.visibilityState==='visible'&&!document.getElementById('bsp');
        globalThis.RewardsSuccess.reconcileVisible(document,localStorage,navigator.locks,
          {origin:m.origin,campaign:m.campaign,documentToken:m.documentToken},m.attemptId,current).then(reply,()=>reply({ok:false,reason:'reconciliation-blocked'}));
        return true;
      }
      if(m.type===W.contentType('editCache')){
        clearPrepared();
        // The original v15 overlay is a compatibility warning, not a cooperative lock.
        const current=()=>{
          const now=stopped?null:syncContext();
          return !stopped&&m.documentToken===epoch.token&&document.visibilityState==='visible'&&!document.getElementById('bsp')&&now?.status==='recognized'&&now.origin===m.origin&&now.campaign===m.campaign;
        };
        L.editCache(localStorage,navigator.locks,report.campaign,m.op,m.value,current,m.documentToken).then(reply,()=>reply({ok:false,reason:'edit-outcome-unknown'}));
        return true;
      }
      L.previewImport(localStorage,report.campaign,m.text).then(result=>{
        const now=stopped?null:syncContext();
        reply(!stopped&&m.documentToken===epoch.token&&now?.status==='recognized'&&now.origin===m.origin&&now.campaign===m.campaign?result:{ok:false,reason:'context-changed'});
      },()=>reply({ok:false,reason:'import-unavailable'}));
      return true;
    }
    reply({report,documentToken:stopped?null:epoch.token,summary:recognized?L.summary(localStorage,report.campaign):null,details:recognized?L.details(localStorage,report.campaign,epoch.token):null,recovery:recognized&&report.stage==='success'?globalThis.RewardsTransactions.pendingSelection(localStorage,report.campaign):null});
  });
  // Observe only trusted, actionable controls inside the recognized wizard.
  // Record fixed event reasons; never read entered values or arbitrary labels.
  function observeInteraction(event,selector,reason){
    if(stopped||!event.isTrusted)return;
    const el=event.target?.closest?.(selector),id=D.identity(document);
    if(id?.status==='recognized'&&el&&id.root.contains(el)&&D.actionable(el))capture(reason,true);
  }
  document.addEventListener('click',e=>observeInteraction(e,'button,input[type="button"],input[type="submit"],a,[role="button"]','control-interaction'),true);
  document.addEventListener('change',e=>observeInteraction(e,'input[type="checkbox"],input[type="radio"],select','selection-change'),true);
  window.addEventListener('pagehide',()=>{stopped=true;clearPrepared();disconnect();last='';generation++;});
  window.addEventListener('pageshow',()=>{if(stopped){epoch.reset();stopped=false;capture('document-restored');}});
  capture('initial');
})();
