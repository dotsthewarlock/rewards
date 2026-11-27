/* Passive top-frame listener. Adapted from InComm listener lifecycle; no merchant mutations or credential reads. */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
  if(window.top!==window||!D.allowedOrigin(location.origin)||globalThis.__rewardsDiscoveryLoaded)return;
  globalThis.__rewardsDiscoveryLoaded=true;
  let documentToken=crypto.randomUUID(),prepared=null;
  const clearPrepared=()=>{prepared?.cancel();prepared=null;};
  let observer=null,timer=null,expiry=null,last='',generation=0,root=null,stopped=false;
  function disconnect(){observer?.disconnect();observer=null;clearTimeout(timer);timer=null;clearTimeout(expiry);expiry=null;root=null;}
  function schedule(){
    if(stopped||timer)return;
    timer=setTimeout(()=>{timer=null;capture();},180);
  }
  function bind(id){
    const nextRoot=id?.root||null;
    if(observer&&root===nextRoot)return;
    observer?.disconnect();clearTimeout(expiry);root=nextRoot;
    if(!document.body)return;
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{attributes:true,attributeFilter:['data-slug'],childList:true});
    if(root){
      observer.observe(root,{subtree:true,childList:true,attributes:true,characterData:true,
        attributeFilter:['class','style','hidden','disabled','readonly','aria-hidden','aria-disabled','aria-modal','data-step']});
      if(root.parentElement&&root.parentElement!==document.body)observer.observe(root.parentElement,{childList:true});
    }else{
      observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','id','data-slug']});
      expiry=setTimeout(()=>{observer?.disconnect();observer=null;},45000);
    }
  }
  async function capture(){
    if(stopped)return;
    const report=D.report(document),id=D.identity(document);
    if(!report)return;
    // Loss of recognition terminates recording scope; bounded discovery remains.
    bind(report.status==='recognized'?id:null);
    const sig=JSON.stringify(report);
    if(sig===last)return;
    last=sig;
    const seq=++generation;
    try{
      const response=await chrome.runtime.sendMessage({type:'companion.observation',report});
      if(!response?.ok&&seq===generation)last='';
    }catch{if(seq===generation)last='';}
  }
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||sender.tab||!['companion.inspect','companion.revealReward','companion.exportRewards','companion.previewImport','companion.editCache','companion.reconcileSuccess','companion.prepareFinal','companion.authorizeFinal','companion.cancelFinal'].includes(m?.type))return;
    const report=D.report(document);
    const recognized=!stopped&&report?.status==='recognized';
    if(m.type!=='companion.inspect'){
      if(!recognized||m.documentToken!==documentToken||m.campaign!==report.campaign||m.origin!==report.origin)return reply({ok:false,reason:'context-changed'});
      if(m.type==='companion.prepareFinal'){
        clearPrepared();
        const current=()=>!stopped&&m.documentToken===documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
        const binding=globalThis.RewardsForeground.prepareFinal(document,localStorage,navigator.locks,
          {origin:m.origin,campaign:m.campaign,documentToken},current);
        if(!binding.ok)return reply(binding);
        prepared=binding;
        return reply({ok:true,review:binding.review});
      }
      if(m.type==='companion.cancelFinal'){
        if(prepared?.review.attemptId===m.attemptId)clearPrepared();
        return reply({ok:true});
      }
      if(m.type==='companion.authorizeFinal'){
        if(m.confirmed!==true||!prepared||prepared.review.attemptId!==m.attemptId)return reply({ok:false,reason:'review-expired'});
        const binding=prepared;prepared=null;
        binding.authorize().then(reply,()=>reply({ok:false,reason:'pending-unknown'}));
        return true;
      }
      if(m.type==='companion.revealReward')return reply(L.revealReward(localStorage,report.campaign,m.snapshot,m.index));
      if(m.type==='companion.exportRewards')return reply(L.exportRows(localStorage,report.campaign));
      if(m.type==='companion.reconcileSuccess'){
        const current=()=>!stopped&&m.documentToken===documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
        globalThis.RewardsSuccess.reconcileVisible(document,localStorage,navigator.locks,
          {origin:m.origin,campaign:m.campaign,documentToken},m.attemptId,current).then(reply,()=>reply({ok:false,reason:'reconciliation-blocked'}));
        return true;
      }
      if(m.type==='companion.editCache'){
        clearPrepared();
        // The original v15 overlay is a compatibility warning, not a cooperative lock.
        const current=()=>{
          const now=D.report(document);
          return !stopped&&document.visibilityState==='visible'&&!document.getElementById('bsp')&&now?.status==='recognized'&&now.origin===m.origin&&now.campaign===m.campaign;
        };
        L.editCache(localStorage,navigator.locks,report.campaign,m.op,m.value,current).then(reply,()=>reply({ok:false,reason:'edit-outcome-unknown'}));
        return true;
      }
      L.previewImport(localStorage,report.campaign,m.text).then(result=>{
        const now=D.report(document);
        reply(!stopped&&now?.status==='recognized'&&now.origin===m.origin&&now.campaign===m.campaign?result:{ok:false,reason:'context-changed'});
      },()=>reply({ok:false,reason:'import-unavailable'}));
      return true;
    }
    reply({report,documentToken,summary:recognized?L.summary(localStorage,report.campaign):null,details:recognized?L.details(localStorage,report.campaign):null,recovery:recognized&&report.stage==='success'?globalThis.RewardsTransactions.pendingSelection(localStorage,report.campaign):null});
  });
  window.addEventListener('pagehide',()=>{stopped=true;clearPrepared();disconnect();last='';generation++;});
  window.addEventListener('pageshow',()=>{if(stopped){documentToken=crypto.randomUUID();stopped=false;capture();}});
  capture();
})();
