import {csv,tsv} from '../core/codec.js';
import {campaignById} from '../core/campaigns.js';
import {esc,button,check} from './components.js';
// Platform-neutral workspace. The transport owns identity, persistence and authorization.
export function mountWorkspace(root,request,{recording=true}={}){
const $=id=>root.getElementById(id);
let screen='queue',state=null,serial=0;
const alive=()=>!root.host||root.host.isConnected;
function render(){
 const r=state?.report,summary=state?.summary,cp=campaignById(r?.campaign);
 $('context').innerHTML='<section class="surface"><strong>'+esc(cp?.name||'No recognized campaign')+'</strong><p>'+esc(r? r.status+' · '+r.stage : state?.ok===false?'Connection unavailable':'Open a supported merchant tab')+'</p></section>';
 $('navigation').innerHTML=['queue','rewards','campaigns','settings'].map(x=>button(x[0].toUpperCase()+x.slice(1),'navigate',{extra:'data-value="'+x+'" '+(screen===x?'aria-current="page"':'')})).join('');
 let body='';
 if(screen==='queue'){
   body='<h2>Queue</h2><p>Read-only legacy cache. No claim authority is enabled.</p>';
   if(summary?.ok)body+='<section class="surface"><p>'+summary.queue.queued+' ready · '+summary.queue.complete+' complete · '+summary.queue.pending+' pending</p><p>'+summary.queue.duplicate+' duplicates · '+summary.queue.error+' errors</p><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p>'+(summary.unresolved?'<p class="warning">Existing unresolved or active state. No replay or advancement.</p>':'')+'</section>';
   else if(summary?.ok===false)body+='<p class="warning">Legacy cache could not be safely read. No data changed.</p>';
 }else if(screen==='rewards'){
   body='<h2>Rewards</h2><p>'+(summary?.ok?summary.rewards+' legacy gift-card records · '+summary.history+' redemption history records':'No connected cache')+'</p><p>Export includes the stored card numbers and PINs. Keep the file private.</p>' + button('Download CSV','rewardCSV',{disabled:!summary?.rewards||!state?.target}) + button('Copy TSV','rewardTSV',{disabled:!summary?.rewards||!state?.target}) + '';
 }else if(screen==='campaigns'){
   body='<h2>Campaigns</h2>'+(cp?'<section class="surface"><strong>'+esc(cp.name)+'</strong><p>'+esc(cp.products.join(' / '))+'</p><p>'+esc(cp.rewards.join(' / '))+'</p><p>Published claim deadline: '+esc(cp.deadline)+'</p></section>':'<p>No recognized campaign metadata.</p>')+'<p>Recognition is structural evidence only, not verified eligibility or stock.</p>';
 }else{
   body='<h2>Settings</h2><section class="surface stack"><h3>Diagnostics</h3>'+(recording?check('diagnosticsEnabled','Record sanitized structural observations',!!state?.diagnostics?.enabled)+'<p>'+(state?.diagnostics?.count||0)+'/500 distinct records</p>':'<p>Current document only. Background recording requires the extension.</p>')+button('Export diagnostics','export',{disabled:!state?.diagnostics?.count})+'<p>Read-only, scoped to recognized pages. No credentials, raw text or URLs.</p></section>';
 }
 $('workspace').innerHTML='<section class="stack">'+body+button('Refresh connection','refresh')+'</section>';
}
async function refresh(){
 const n=++serial;
 try{const s=await request('inspect');if(n!==serial||!alive())return;state=s;}
 catch{if(n!==serial||!alive())return;state={ok:false};}
 render();
}
root.addEventListener('click',async e=>{
 const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
 if(target.dataset.action==='navigate'){screen=target.dataset.value;render();$('workspace').focus();}
 if(target.dataset.action==='refresh')await refresh();
 if(['rewardCSV','rewardTSV'].includes(target.dataset.action)){
   const selected=state?.target,n=serial;
   try{
     const r=await request('exportRewards',{target:selected});
     if(!r.ok||n!==serial||screen!=='rewards'||!alive())throw Error();
     if(target.dataset.action==='rewardTSV')await navigator.clipboard.writeText(tsv(r.rows));
     else{
       const url=URL.createObjectURL(new Blob(['\uFEFF',csv(r.rows)],{type:'text/csv;charset=utf-8'}));
       const a=document.createElement('a');a.href=url;a.download='rewards-'+selected.campaign+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
     }
     $('announcement').textContent='Reward export completed.';
   }catch{$('announcement').textContent='Export unavailable. Refresh the current campaign and try again.';}
 }
 if(target.dataset.action==='export'){
   try{const r=await request('exportDiagnostics');if(!r.ok||!alive())throw Error();
     const url=URL.createObjectURL(new Blob([JSON.stringify(r.export,null,2)],{type:'application/json'}));
     const a=document.createElement('a');a.href=url;a.download='rewards-structural-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
     $('announcement').textContent='Diagnostic export requested.';
   }catch{$('announcement').textContent='Export failed.';}
 }
});
root.addEventListener('change',async e=>{if(e.target.id==='diagnosticsEnabled'){try{await request('setDiagnostics',{enabled:e.target.checked});}catch{}await refresh();}});
render();refresh();
return {refresh};
}
