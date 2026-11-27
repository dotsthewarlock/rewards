import {campaignById} from '../core/campaigns.js';
import {esc,button,check} from './components.js';
const $=id=>document.getElementById(id);
let screen='queue',state=null,serial=0;
const request=(op,fields={})=>chrome.runtime.sendMessage({type:'companion.workspace',op,...fields});
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
   body='<h2>Rewards</h2><p>'+(summary?.ok?summary.rewards+' legacy gift-card records · '+summary.history+' redemption history records':'No connected cache')+'</p><p>Credential reveal and export integration pending. Existing bookmarklet retains this functionality.</p>';
 }else if(screen==='campaigns'){
   body='<h2>Campaigns</h2>'+(cp?'<section class="surface"><strong>'+esc(cp.name)+'</strong><p>'+esc(cp.products.join(' / '))+'</p><p>'+esc(cp.rewards.join(' / '))+'</p><p>Published claim deadline: '+esc(cp.deadline)+'</p></section>':'<p>No recognized campaign metadata.</p>')+'<p>Recognition is structural evidence only, not verified eligibility or stock.</p>';
 }else{
   body='<h2>Settings</h2><section class="surface stack"><h3>Diagnostics</h3>'+check('diagnosticsEnabled','Record sanitized structural observations',!!state?.diagnostics?.enabled)+'<p>'+(state?.diagnostics?.count||0)+'/500 distinct records</p>'+button('Export diagnostics','export',{disabled:!state?.diagnostics?.count})+'<p>Read-only, scoped to recognized pages. No credentials, raw text or URLs.</p></section>';
 }
 $('workspace').innerHTML='<section class="stack">'+body+button('Refresh connection','refresh')+'</section>';
}
async function refresh(){
 const n=++serial;
 try{const s=await request('inspect');if(n!==serial)return;state=s;}
 catch{if(n!==serial)return;state={ok:false};}
 render();
}
document.addEventListener('click',async e=>{
 const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
 if(target.dataset.action==='navigate'){screen=target.dataset.value;render();$('workspace').focus();}
 if(target.dataset.action==='refresh')await refresh();
 if(target.dataset.action==='export'){
   try{const r=await request('exportDiagnostics');if(!r.ok)throw Error();
     const url=URL.createObjectURL(new Blob([JSON.stringify(r.export,null,2)],{type:'application/json'}));
     const a=document.createElement('a');a.href=url;a.download='rewards-structural-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
     $('announcement').textContent='Diagnostic export requested.';
   }catch{$('announcement').textContent='Export failed.';}
 }
});
document.addEventListener('change',async e=>{if(e.target.id==='diagnosticsEnabled'){try{await request('setDiagnostics',{enabled:e.target.checked});}catch{}await refresh();}});
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_,change,tab)=>{if(tab.active&&(change.status==='complete'||change.url))refresh();});
let refreshTimer=null;
chrome.runtime.onMessage.addListener(m=>{if(m?.type==='companion.observation'){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,250);}});
render();refresh();
