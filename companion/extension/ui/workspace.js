import {csv,tsv} from '../core/codec.js';
import {campaignById} from '../core/campaigns.js';
import {esc,button,check} from './components.js';
// Platform-neutral workspace. The transport owns identity, persistence and authorization.
export function mountWorkspace(root,request,{recording=true}={}){
const $=id=>root.getElementById(id);
let screen='queue',state=null,serial=0,draft='',preview=null,page=0,historyPage=0,rewardPage=0,browseTab='cards',browseSearch='',inputVersion=0,emailDraft='',editing=false,reviewed=null;
const editMessage={
 'context-changed':'Campaign changed or legacy workspace is open. Refresh before editing.',
 'legacy-busy':'Existing pending, active or locked state. Inspect it before editing. Do not retry an unresolved claim or open legacy v15 while a new attempt is unresolved.',
 'edit-busy':'Another companion edit is in progress. Refresh before retrying.',
 'lock-unavailable':'Safe storage ownership is unavailable in this browser.',
 'invalid-input':'Check the entered value.',
 'unreadable-cache':'Existing cache could not be safely read. No edit was attempted.',
 'cache-changed':'Cache changed during review. Refresh before editing.',
 'edit-outcome-unknown':'Save outcome uncertain. Refresh and inspect the cache before retrying.'
};
const sameTarget=(a,b)=>!!a&&!!b&&a.origin===b.origin&&a.campaign===b.campaign&&a.documentToken===b.documentToken&&a.tabId===b.tabId;
const stateLabel={queued:'Ready',processing:'Processing',pending:'Pending',complete:'Complete',error:'Error',duplicate:'Duplicate',other:'Unknown'};
function maskedList(rows,index,action,history=false,rewards=false){
 const total=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(index,total-1);
 const items=rows.slice(current*25,current*25+25).map(r=>'<li class="row spread"><span class="mono">'+(r.last4===null?'Unavailable':'•••• '+esc(r.last4))+'</span>'+(rewards?'<span>'+ (r.value===null?'Value unavailable':'CAD $'+esc(r.value))+'</span>':history?'':'<span>'+esc(stateLabel[r.state])+'</span>')+'</li>').join('');
 return '<ul class="list">'+items+'</ul>'+(total>1?'<div class="row spread">'+button('Previous',action,{disabled:current===0,extra:'data-value="'+(current-1)+'"'})+'<span>'+(current+1)+'/'+total+'</span>'+button('Next',action,{disabled:current===total-1,extra:'data-value="'+(current+1)+'"'})+'</div>':'');
}
const alive=()=>!root.host||root.host.isConnected;
function discardReview(){
 const old=reviewed;reviewed=null;
 if(old)Promise.resolve(request('cancelFinal',{target:old.target,attemptId:old.review.attemptId})).catch(()=>{});
}
function finalReviewView(){
 if(!reviewed)return '';
 const r=reviewed.review;
 return '<section class="surface stack review-data"><h3>Review exact claim</h3><p><strong>Product:</strong> '+esc(r.product)+'</p><p><strong>Reward:</strong> '+esc(r.reward)+' · CAD $'+esc(r.valueRecent)+'</p><p><strong>Barcode:</strong> <span class="mono">'+esc(r.code)+'</span></p><p><strong>Email:</strong> '+esc(r.email)+'</p><p>Merchant terms are checked on the page. Confirm that you reviewed them and this is your eligible purchased product.</p>'+check('finalConfirmed','I confirm the exact claim details and merchant terms',reviewed.confirmed,editing)+button('Authorize reviewed claim','authorizeFinal',{primary:true,disabled:editing||!reviewed.confirmed,extra:'data-value="'+esc(r.attemptId)+'"'})+button('Cancel review','cancelFinal',{disabled:editing})+'</section>';
}
function render(){
 const focus=root.activeElement;
 const field=['importDraft','emailDraft','browseSearch'].includes(focus?.id)?focus.id:null;
 const selection=['importDraft','browseSearch'].includes(field)?[focus.selectionStart,focus.selectionEnd]:null;
 const action=focus?.dataset?.action,value=focus?.dataset?.value;
 const r=state?.report,summary=state?.summary,details=state?.details,cp=campaignById(r?.campaign);
 $('context').innerHTML='<section class="surface"><strong>'+esc(cp?.name||'No recognized campaign')+'</strong><p>'+esc(r? r.status+' · '+r.stage : state?.ok===false?'Connection unavailable':'Open a supported merchant tab')+'</p></section>';
 $('navigation').innerHTML=['queue','rewards','campaigns','settings'].map(x=>button(x[0].toUpperCase()+x.slice(1),'navigate',{extra:'data-value="'+x+'" '+(screen===x?'aria-current="page"':'')})).join('');
 let body='';
 if(screen==='queue'){
   body='<h2>Queue</h2><p>Legacy cache management and reviewed foreground claims. Development candidate; live compatibility unverified.</p>';
   if(summary?.ok)body+='<section class="surface"><p>'+summary.queue.queued+' ready · '+summary.queue.complete+' complete · '+summary.queue.pending+' pending</p><p>'+summary.queue.duplicate+' duplicates · '+summary.queue.error+' errors</p><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p>'+(summary.unresolved?'<p class="warning">Existing unresolved or active state. No replay or advancement.</p>':'')+'</section>';
   else if(summary?.ok===false)body+='<p class="warning">Legacy cache could not be safely read. No data changed.</p>';
   if(summary?.ok&&state?.target){
     if(r?.stage==='entry'&&!summary.unresolved&&summary.queue.queued>0&&summary.emailConfigured&&cp?.products.length===1&&cp.rewards.length===1){
       body+=reviewed?finalReviewView():'<section class="surface stack"><h3>Review merchant form</h3><p>Complete the native merchant steps and terms, leaving the final form visible. Do not submit separately. Unknown layouts and choices remain blocked.</p>'+button('Review final claim','prepareFinal',{primary:true,disabled:editing||r.controls.submit.actionable!==1})+'</section>';
     }
     if(r?.stage==='success'&&summary.unresolved&&state.recovery)body+='<section class="surface stack"><h3>Unresolved reward</h3><p>Reviewed attempt ending '+esc(state.recovery.last4)+'. Inspect the matching merchant confirmation before capture. No claim will be submitted or advanced.</p>'+button('Capture matching reward','reconcileSuccess',{primary:true,disabled:editing,extra:'data-value="'+esc(state.recovery.attemptId)+'"'})+'</section>';
     body+='<section class="surface stack"><label for="importDraft">Redemption codes</label><textarea id="importDraft" maxlength="262144" autocomplete="off" spellcheck="false" placeholder="Paste 30-digit codes or receipt text">'+esc(draft)+'</textarea>'+'<div class="row">'+button('Add to queue','addQueue',{primary:true,disabled:editing||summary.unresolved||!draft.trim()})+button('Preview','previewImport',{disabled:editing||!draft.trim()})+'</div><p class="muted">Close other v15 workspaces before editing. Adding codes never submits a claim.</p><p id="importResult" role="status">'+(preview?esc(preview):'')+'</p></section>';
     if(details?.ok)body+='<section class="surface"><h3>Existing queue</h3>'+(details.queue.length?maskedList(details.queue,page,'queuePage'):'<p>No queued records.</p>')+'</section>';
   }
 }else if(screen==='rewards'){
   body='<h2>Rewards</h2><p>'+(summary?.ok?summary.rewards+' legacy gift-card records · '+summary.history+' redemption history records':'No connected cache')+'</p><p>Export includes the stored card numbers and PINs. Keep the file private.</p>' + button('Download CSV','rewardCSV',{disabled:!summary?.rewards||!state?.target}) + button('Copy TSV','rewardTSV',{disabled:!summary?.rewards||!state?.target}) + '';
   if(details?.ok){
     const cards=browseTab==='cards',rows=cards?details.rewards:details.history;
     const filtered=rows.filter(r=>!browseSearch||r.last4?.toUpperCase().includes(browseSearch.toUpperCase()));
     body+='<section class="surface stack"><div class="row" role="group" aria-label="Browse records">'+
       button('Saved rewards','browseTab',{extra:'data-value="cards" aria-pressed="'+cards+'"',primary:cards})+
       button('Redemption history','browseTab',{extra:'data-value="history" aria-pressed="'+!cards+'"',primary:!cards})+
       '</div><label for="browseSearch">Find by ending digits or characters</label><input id="browseSearch" type="text" maxlength="4" autocomplete="off" value="'+esc(browseSearch)+'"><p role="status">'+filtered.length+' of '+rows.length+' records</p>'+
       (filtered.length?maskedList(filtered,cards?rewardPage:historyPage,cards?'rewardPage':'historyPage',!cards,cards):'<p>No matching records.</p>')+'</section>';
   }
 }else if(screen==='campaigns'){
   body='<h2>Campaigns</h2>'+(cp?'<section class="surface"><strong>'+esc(cp.name)+'</strong><p>'+esc(cp.products.join(' / '))+'</p><p>'+esc(cp.rewards.join(' / '))+'</p><p>Published claim deadline: '+esc(cp.deadline)+'</p></section>':'<p>No recognized campaign metadata.</p>')+'<p>Recognition is structural evidence only, not verified eligibility or stock.</p>';
 }else{
   body='<h2>Settings</h2>';
   if(summary?.ok&&state?.target)body+='<section class="surface stack"><h3>Legacy preferences</h3><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p><label for="emailDraft">New redemption email</label><input id="emailDraft" type="email" maxlength="254" autocomplete="off" value="'+esc(emailDraft)+'">'+button('Save email','saveEmail',{disabled:editing||summary.unresolved||!emailDraft.trim()})+check('clipboardPreference','Saved clipboard preference',summary.clipboard,editing||summary.unresolved)+'<p class="muted">Preferences do not authorize claims. Keep legacy v15 closed while editing.</p></section>';
   body+='<section class="surface stack"><h3>Diagnostics</h3>'+(recording?check('diagnosticsEnabled','Record sanitized structural observations',!!state?.diagnostics?.enabled)+'<p>'+(state?.diagnostics?.count||0)+'/500 distinct records</p>':'<p>Current document only. Background recording requires the extension.</p>')+button('Export diagnostics','export',{disabled:!state?.diagnostics?.count})+'<p>Read-only, scoped to recognized pages. No credentials, raw text or URLs.</p></section>';
 }
 $('workspace').innerHTML='<section class="stack">'+body+button('Refresh connection','refresh')+'</section>';
 if(field&&$(field)){const el=$(field);el.focus({preventScroll:true});if(selection)el.setSelectionRange(...selection);}
 else if(action){
   const next=[...root.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.value===value&&!el.disabled);
   if(next)next.focus({preventScroll:true});
 }
}
async function refresh(){
 const n=++serial;
 try{const s=await request('inspect');if(n!==serial||!alive())return;if(reviewed&&(!sameTarget(reviewed.target,s?.target)||JSON.stringify(state?.report)!==JSON.stringify(s?.report)||JSON.stringify(state?.details)!==JSON.stringify(s?.details)||s?.summary?.unresolved))discardReview();if(!sameTarget(state?.target,s?.target)){draft='';emailDraft='';preview=null;page=0;historyPage=0;rewardPage=0;browseSearch='';inputVersion++;}else if(JSON.stringify(state?.details)!==JSON.stringify(s?.details))preview=null;state=s;}
 catch{if(n!==serial||!alive())return;discardReview();state={ok:false};draft='';emailDraft='';preview=null;inputVersion++;}
 render();
}
async function edit(op,value){
 if(editing||!state?.target||state.summary?.unresolved)return;
 discardReview();
 const selected=state.target,version=inputVersion;
 editing=true;render();
 let result;
 try{result=await request('editCache',{target:selected,edit:op,value});}catch{result={ok:false,reason:'edit-outcome-unknown'};}
 editing=false;
 if(!alive())return;
 if(sameTarget(selected,state?.target)&&result?.ok){
   if(op==='importQueue'&&version===inputVersion){if(result.overflow===0)draft='';preview=null;inputVersion++;}
   if(op==='saveEmail'&&emailDraft===value)emailDraft='';
 }
 await refresh();
 if(!alive())return;
 $('announcement').textContent=result?.ok?(op==='importQueue'?result.queued+' added · '+result.duplicates+' duplicates · '+result.overflow+' over limit':'Preference saved.'):(editMessage[result?.reason]||'Edit outcome uncertain. Refresh and review before retrying.');
}
root.addEventListener('click',async e=>{
 const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
 if(target.dataset.action==='navigate'){discardReview();screen=target.dataset.value;render();$('workspace').focus();}
 if(target.dataset.action==='refresh'){discardReview();await refresh();}
 if(target.dataset.action==='queuePage'){page=Number(target.dataset.value);render();$('workspace').focus();}
 if(target.dataset.action==='historyPage'){historyPage=Number(target.dataset.value);render();$('workspace').focus();}
 if(target.dataset.action==='rewardPage'){rewardPage=Number(target.dataset.value);render();$('workspace').focus();}
 if(target.dataset.action==='browseTab'){browseTab=target.dataset.value;browseSearch='';rewardPage=0;historyPage=0;render();}
 if(target.dataset.action==='prepareFinal'){
   if(!e.isTrusted||editing||!state?.target||state.summary?.unresolved)return;
   discardReview();const selected=state.target,n=serial;
   editing=true;render();
   let result;try{result=await request('prepareFinal',{target:selected});}catch{}
   editing=false;
   if(!alive()||n!==serial||!sameTarget(selected,state?.target)||screen!=='queue'){
     if(result?.ok)Promise.resolve(request('cancelFinal',{target:selected,attemptId:result.review.attemptId})).catch(()=>{});
     if(alive())render();return;
   }
   if(result?.ok)reviewed={target:selected,review:result.review,confirmed:false};
   render();
   $('announcement').textContent=result?.ok?'Review the exact claim before authorizing.':'Final form not verified. Check the visible barcode, saved email, terms, native controls and any required choices.';
   return;
 }
 if(target.dataset.action==='cancelFinal'){discardReview();render();$('announcement').textContent='Review cancelled. No claim submitted.';return;}
 if(target.dataset.action==='authorizeFinal'){
   if(!e.isTrusted||editing||!reviewed?.confirmed||!sameTarget(reviewed.target,state?.target)||target.dataset.value!==reviewed.review.attemptId)return;
   const selected=reviewed;reviewed=null;editing=true;render();
   let result;try{result=await request('authorizeFinal',{target:selected.target,attemptId:selected.review.attemptId,confirmed:true});}catch{}
   editing=false;
   if(!alive())return;
   await refresh();if(!alive())return;
   $('announcement').textContent=result?.ok&&result.status==='pending'?'Submission attempted. Await a verified merchant outcome; do not replay.':'Submission not confirmed. Inspect the merchant page and queue before any new authorization; do not retry an unresolved claim.';
   return;
 }
 if(target.dataset.action==='reconcileSuccess'){
   if(editing||!state?.target||state.report?.stage!=='success'||!state.summary?.unresolved||
      !state.recovery||target.dataset.value!==state.recovery.attemptId)return;
   const selected=state.target,attemptId=state.recovery.attemptId;editing=true;render();
   let result;
   try{result=await request('reconcileSuccess',{target:selected,attemptId});}catch{}
   editing=false;
   if(!alive())return;
   await refresh();
   if(!alive())return;
   $('announcement').textContent=result?.ok&&result.status==='complete'?'Matching reward captured. No further claim started.':'Capture not confirmed. Keep the unresolved record and inspect the merchant confirmation; do not retry the claim.';
   return;
 }
 if(target.dataset.action==='addQueue'){await edit('importQueue',draft);return;}
 if(target.dataset.action==='saveEmail'){await edit('saveEmail',emailDraft);return;}
 if(target.dataset.action==='previewImport'){
   const n=serial,v=inputVersion,selected=state?.target,text=draft;
   if(!selected||!text.trim())return;
   target.disabled=true;
   $('importResult').textContent='Checking existing queue and history…';
   let result;
   try{result=await request('previewImport',{target:selected,text});}catch{}
   if(n!==serial||v!==inputVersion||screen!=='queue'||!alive())return;
   preview=result?.ok?result.queued+' ready · '+result.duplicates+' duplicates · '+result.overflow+' over limit · '+result.recognized+' recognized':'Preview unavailable. Refresh the current campaign.';
   $('importResult').textContent=preview;
   target.disabled=false;
 }
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
root.addEventListener('input',e=>{
 if(e.target.id==='browseSearch'){
   browseSearch=e.target.value;rewardPage=0;historyPage=0;render();return;
 }
 if(e.target.id==='emailDraft'){
   emailDraft=e.target.value;
   const save=root.querySelector('[data-action="saveEmail"]');if(save)save.disabled=editing||!!state?.summary?.unresolved||!emailDraft.trim();
   return;
 }
 if(e.target.id!=='importDraft')return;
 draft=e.target.value;inputVersion++;preview=null;
 $('importResult').textContent='';
 const control=root.querySelector('[data-action="previewImport"]');if(control)control.disabled=editing||!draft.trim();
 const add=root.querySelector('[data-action="addQueue"]');if(add)add.disabled=editing||!!state?.summary?.unresolved||!draft.trim();
});
root.addEventListener('change',async e=>{if(e.target.id==='finalConfirmed'){if(reviewed&&e.isTrusted){reviewed.confirmed=e.target.checked;const submit=root.querySelector('[data-action="authorizeFinal"]');if(submit)submit.disabled=editing||!reviewed.confirmed;}return;}if(e.target.id==='clipboardPreference'){await edit('saveClipboard',e.target.checked);return;}if(e.target.id==='diagnosticsEnabled'){try{await request('setDiagnostics',{enabled:e.target.checked});}catch{}await refresh();}});
render();refresh();
return {refresh};
}
