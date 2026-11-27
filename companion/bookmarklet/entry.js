// Generated into a self-contained bookmarklet; this adapter is page-world only.
// No claim authority, data writes, passive recording or remote code loading.
function launchBookmarklet(markup,css){
 const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
 if(window.top!==window||!D.allowedOrigin(location.origin))return;
 const existing=document.getElementById('rewards-companion-dev');
 if(existing){if(existing.dataset.rewardsCompanion==='read-only')existing.remove();return;}
 const host=document.createElement('section');
 host.id='rewards-companion-dev';host.dataset.rewardsCompanion='read-only';
 host.setAttribute('aria-label','Rewards Companion development workspace');
 const root=host.attachShadow({mode:'open'}),style=document.createElement('style');
 style.textContent=css;
 const shell=document.createElement('div');shell.className='shell';shell.innerHTML=markup;
 const close=document.createElement('button');close.type='button';close.textContent='Close workspace';
 close.addEventListener('click',()=>host.remove());shell.prepend(close);
 root.append(style,shell);document.body.append(host);
 const documentToken=crypto.randomUUID();
 const inspect=()=>{
   const report=D.report(document),recognized=report?.status==='recognized';
   const target=recognized?{origin:report.origin,campaign:report.campaign,documentToken}:null;
   return {ok:true,report,target,summary:recognized?L.summary(localStorage,report.campaign):null,details:recognized?L.details(localStorage,report.campaign):null,diagnostics:{enabled:false,count:recognized?1:0}};
 };
 const request=async(op,fields={})=>{
   if(!host.isConnected)return {ok:false,reason:'workspace-closed'};
   const current=inspect();
   if(op==='inspect')return current;
   if(op==='exportRewards'||op==='previewImport'){
     const t=fields.target,c=current.target;
     if(!t||!c||t.origin!==c.origin||t.campaign!==c.campaign||t.documentToken!==c.documentToken)return {ok:false,reason:'context-changed'};
     if(op==='exportRewards')return L.exportRows(localStorage,c.campaign);
     const result=await L.previewImport(localStorage,c.campaign,fields.text);
     const now=inspect().target;
     return host.isConnected&&now?.origin===c.origin&&now?.campaign===c.campaign&&now?.documentToken===c.documentToken?result:{ok:false,reason:'context-changed'};
   }
   if(op==='exportDiagnostics'&&current.target)return {ok:true,export:{schema:'rewards.structural-export/1',records:[{at:new Date().toISOString(),report:current.report}]}};
   return {ok:false,reason:'unsupported-command'};
 };
 mountWorkspace(root,request,{recording:false});
}
