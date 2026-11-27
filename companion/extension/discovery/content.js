/* Passive top-frame listener. Adapted from InComm listener lifecycle; no merchant mutations or credential reads. */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
  if(window.top!==window||!D.allowedOrigin(location.origin)||globalThis.__rewardsDiscoveryLoaded)return;
  globalThis.__rewardsDiscoveryLoaded=true;
  const documentToken=crypto.randomUUID();
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
    if(sender.id!==chrome.runtime.id||sender.tab||!['companion.inspect','companion.exportRewards','companion.previewImport','companion.editCache'].includes(m?.type))return;
    const report=D.report(document);
    const recognized=!stopped&&report?.status==='recognized';
    if(m.type!=='companion.inspect'){
      if(!recognized||m.documentToken!==documentToken||m.campaign!==report.campaign||m.origin!==report.origin)return reply({ok:false,reason:'context-changed'});
      if(m.type==='companion.exportRewards')return reply(L.exportRows(localStorage,report.campaign));
      if(m.type==='companion.editCache'){
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
    reply({report,documentToken,summary:recognized?L.summary(localStorage,report.campaign):null,details:recognized?L.details(localStorage,report.campaign):null});
  });
  window.addEventListener('pagehide',()=>{stopped=true;disconnect();last='';generation++;});
  window.addEventListener('pageshow',()=>{if(stopped){stopped=false;capture();}});
  capture();
})();
