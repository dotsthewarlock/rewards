import {csv,tsv} from '../core/codec.js';
import {campaignById} from '../core/campaigns.js';
import {esc,button,check} from './components.js';
// Platform-neutral workspace. The transport owns identity, persistence and authorization.
export function mountWorkspace(root,request,{recording=true}={}){
const $=id=>root.getElementById(id);
let screen='queue',state=null,serial=0,draft='',preview=null,page=0,historyPage=0,rewardPage=0,browseTab='cards',browseSearch='',inputVersion=0,emailDraft='',editing=false,reviewed=null;
let catalog=null,catalogBusy=false,catalogError=false;
let revealedReward=null,revealEpoch=0,revealTimer=null;
function hideReward(){revealEpoch++;clearTimeout(revealTimer);revealTimer=null;const shown=!!revealedReward;revealedReward=null;return shown;}
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
 const items=rows.slice(current*25,current*25+25).map(r=>{
   const revealed=rewards&&revealedReward?.index===r.index;
   return '<li class="row spread"><span class="mono">'+(r.last4===null?'Unavailable':'•••• '+esc(r.last4))+'</span>'+
     (rewards?'<span>'+(r.value===null?'Value unavailable':'CAD $'+esc(r.value))+'</span>'+button(revealed?'Hide':'Reveal','toggleReward',{extra:'data-value="'+r.index+'" aria-label="'+(revealed?'Hide':'Reveal')+' reward '+(r.index+1)+'" aria-expanded="'+!!revealed+'"'})+
       (revealed?'<div class="full stack"><span>Merchant: '+esc(revealedReward.merchant)+'</span><span class="mono">Card: '+esc(revealedReward.number)+'</span><span class="mono">PIN: '+esc(revealedReward.pin)+'</span></div>':'')
       :history?'':'<span>'+esc(stateLabel[r.state])+'</span>')+'</li>';
 }).join('');
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
async function loadCatalog(refreshPublic=false){
 if(!recording||catalogBusy)return;
 catalogBusy=true;catalogError=false;render();
 try{
   const result=await request(refreshPublic?'refreshCatalog':'getCatalog');
   if(result?.ok)catalog=result.catalog;else {catalogError=true;const saved=await request('getCatalog');if(saved?.ok)catalog=saved.catalog;}
 }catch{catalogError=true;}
 catalogBusy=false;
 if(alive()&&screen==='campaigns'){
   render();
   if(refreshPublic){
     root.querySelector('[data-action="refreshCatalog"]')?.focus({preventScroll:true});
     $('announcement').textContent=catalogError?'Catalog unavailable. Existing records retained.':'Public directory check finished.';
   }
 }
}
function catalogView(){
 if(!recording)return '<p>Public directory refresh requires the extension.</p>';
 const c=catalog;
 const restricted=c?.outcome==='restricted';
 const rateLimited=c?.outcome==='rate-limited',interrupted=c?.outcome==='checking';
 const age=Date.now()-Date.parse(c?.checkedAt);
 const current=!catalogBusy&&!catalogError&&c?.outcome==='verified-directory'&&age>=0&&age<=86400000;
 return '<section class="surface stack"><h3>Canadian public catalog</h3><p>Manual directory check only. No claims, verified terms or stock inferred.</p>'+
 button('Refresh public directory','refreshCatalog',{disabled:catalogBusy||restricted||rateLimited||interrupted})+
 '<p role="status">'+esc(catalogBusy?'Checking…':catalogError?'Catalog unavailable; prior evidence retained.':restricted?'Access restricted. Further checks stopped.':rateLimited?'Rate limited. Further checks stopped.':interrupted?'Previous check interrupted or unverified. Further checks stopped.':c?.checkedAt?(current?'Directory checked ':'Stale or unavailable · last check ')+c.checkedAt:'Not yet checked')+'</p>'+
 (c?.entries?.length?'<ul class="list">'+c.entries.map(e=>'<li><strong>'+esc(e.campaign)+'</strong><p>'+esc(current&&e.listed?'Listed at last check':'Previously seen · stale')+' · Terms, availability and workflow compatibility unknown</p><p>Last seen: '+esc(e.lastSeen)+'</p></li>').join('')+'</ul>':'<p>No observed identities stored.</p>')+
 '<a href="https://getmybonus.ca/" target="_blank" rel="noopener noreferrer">Official directory</a></section>';
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
     body+='<section class="surface stack"><label for="importDraft">Redemption codes</label><textarea id="importDraft" maxlength="262144" autocomplete="off" spellcheck="false" placeholder="Paste 30-digit codes or receipt text">'+esc(draft)+'</textarea>'+'<div class="row">'+button('Paste from clipboard','pasteDraft',{disabled:editing})+button('Add to queue','addQueue',{primary:true,disabled:editing||summary.unresolved||!draft.trim()})+button('Preview','previewImport',{disabled:editing||!draft.trim()})+'</div><p class="muted">Close other v15 workspaces before editing. Adding codes never submits a claim.</p><p id="importResult" role="status">'+(preview?esc(preview):'')+'</p></section>';
     if(details?.ok)body+='<section class="surface"><h3>Existing queue</h3>'+(details.queue.length?maskedList(details.queue,page,'queuePage'):'<p>No queued records.</p>')+'</section>';
   }
 }else if(screen==='rewards'){
   body='<h2>Rewards</h2><p>'+(summary?.ok?summary.rewards+' legacy gift-card records · '+summary.history+' redemption history records':'No connected cache')+'</p><p>Reveal and export show private saved reward details. Reveal displays one current record for 30 seconds. Keep the workspace and exports private.</p>' + button('Download CSV','rewardCSV',{disabled:!summary?.rewards||!state?.target}) + button('Copy TSV','rewardTSV',{disabled:!summary?.rewards||!state?.target}) + '';
   if(details?.ok){
     const cards=browseTab==='cards',rows=cards?details.rewards.map((r,index)=>({...r,index})):details.history;
     const filtered=rows.filter(r=>!browseSearch||r.last4?.toUpperCase().includes(browseSearch.toUpperCase()));
     body+='<section class="surface stack"><div class="row" role="group" aria-label="Browse records">'+
       button('Saved rewards','browseTab',{extra:'data-value="cards" aria-pressed="'+cards+'"',primary:cards})+
       button('Redemption history','browseTab',{extra:'data-value="history" aria-pressed="'+!cards+'"',primary:!cards})+
       '</div><label for="browseSearch">Find by ending digits or characters</label><input id="browseSearch" type="text" maxlength="4" autocomplete="off" value="'+esc(browseSearch)+'"><p role="status">'+filtered.length+' of '+rows.length+' records</p>'+
       (filtered.length?maskedList(filtered,cards?rewardPage:historyPage,cards?'rewardPage':'historyPage',!cards,cards):'<p>No matching records.</p>')+'</section>';
   }
 }else if(screen==='campaigns'){
   body='<h2>Campaigns</h2>'+(cp?'<section class="surface"><strong>'+esc(cp.name)+'</strong><p>'+esc(cp.products.join(' / '))+'</p><p>'+esc(cp.rewards.join(' / '))+'</p><p>Published claim deadline: '+esc(cp.deadline)+'</p></section>':'<p>No recognized campaign metadata.</p>')+'<p>Recognition is structural evidence only, not verified eligibility or stock.</p>'+catalogView();
 }else{
   body='<h2>Settings</h2>';
   if(summary?.ok&&state?.target)body+='<section class="surface stack"><h3>Legacy preferences</h3><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p><label for="emailDraft">New redemption email</label><input id="emailDraft" type="email" maxlength="254" autocomplete="off" value="'+esc(emailDraft)+'">'+button('Save email','saveEmail',{disabled:editing||summary.unresolved||!emailDraft.trim()})+check('clipboardPreference','Saved clipboard preference',summary.clipboard,editing||summary.unresolved)+'<p class="muted">Preferences do not authorize claims. Keep legacy v15 closed while editing.</p></section>';
   if(r?.controls)body+='<section class="surface stack"><h3>Current structural evidence</h3><p>Observed counts only; not proof of eligibility or compatibility.</p><ul class="list">'+[['Form','form'],['Barcode field','serial'],['Active step','activeStep'],['Submit controls','submit']].filter(([,key])=>r.controls[key]).map(([name,key])=>'<li><strong>'+esc(name)+'</strong><p>'+r.controls[key].present+' present · '+r.controls[key].visible+' visible · '+r.controls[key].actionable+' actionable</p></li>').join('')+'</ul></section>';
   body+='<section class="surface stack"><h3>Diagnostics</h3>'+(recording?check('diagnosticsEnabled','Record sanitized structural observations',!!state?.diagnostics?.enabled)+'<p>'+(state?.diagnostics?.count||0)+'/500 distinct records · '+(state?.diagnostics?.eventCount||0)+'/2000 events</p>'+(state?.diagnostics?.blocked?'<p class="warning">Recording paused: retention limit or invalid existing records. Export valid records; existing storage is preserved.</p>':'') +button('Capture current evidence','captureDiagnostics',{disabled:!state?.target||!state?.diagnostics?.enabled||!!state?.diagnostics?.blocked})+'<p class="muted">No automatic deletion. Turning recording off retains earlier observations.</p>':'<p>Current document only. Background recording requires the extension.</p>')+button('Export diagnostics','export',{disabled:!state?.diagnostics?.count})+'<p>Read-only, scoped to recognized pages. No credentials, raw text or full URLs. Evidence is structural, not verified live eligibility.</p></section>';
 }
 $('workspace').innerHTML='<section class="stack">'+body+button('Refresh connection','refresh')+'</section>';
 if(field&&$(field)){const el=$(field);el.focus({preventScroll:true});if(selection)el.setSelectionRange(...selection);}
 else if(action){
   const next=[...root.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.value===value&&!el.disabled);
   if(next)next.focus({preventScroll:true});
 }
}
async function refresh(){
 if(hideReward())render();
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
 if(target.dataset.action==='navigate'){hideReward();discardReview();screen=target.dataset.value;render();$('workspace').focus();if(screen==='campaigns')await loadCatalog();}
 if(target.dataset.action==='refreshCatalog'&&e.isTrusted&&screen==='campaigns')await loadCatalog(true);
 if(target.dataset.action==='refresh'){discardReview();await refresh();}
 if(target.dataset.action==='queuePage'){page=Number(target.dataset.value);render();$('workspace').focus();}
 if(target.dataset.action==='historyPage'){historyPage=Number(target.dataset.value);render();$('workspace').focus();}
 if(target.dataset.action==='rewardPage'){hideReward();rewardPage=Number(target.dataset.value);render();$('workspace').focus();}
 if(target.dataset.action==='browseTab'){hideReward();browseTab=target.dataset.value;browseSearch='';rewardPage=0;historyPage=0;render();}
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
 if(target.dataset.action==='pasteDraft'){
   if(!e.isTrusted||editing||screen!=='queue'||!state?.target)return;
   const n=serial,v=inputVersion,selected=state.target;
   try{
     const text=await navigator.clipboard.readText();
     if(n!==serial||v!==inputVersion||screen!=='queue'||!alive()||!sameTarget(selected,state?.target))return;
     if(!text.trim()||text.length>262144||draft.length+text.length+1>262144)throw Error();
     draft+=(draft?'\n':'')+text;inputVersion++;preview=null;render();$('importDraft').focus();
     $('announcement').textContent='Clipboard added to draft. Review or preview before adding to queue.';
   }catch{if(n===serial&&v===inputVersion&&screen==='queue'&&alive()){$('importDraft')?.focus();$('announcement').textContent='Clipboard unavailable or too large. Paste directly into Redemption codes.';}}
   return;
 }
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
 if(target.dataset.action==='toggleReward'){
   if(!e.isTrusted||screen!=='rewards'||browseTab!=='cards'||!state?.target)return;
   const index=Number(target.dataset.value),snapshot=state.details?.rewardSnapshot,expected=state.details?.rewards?.[index],selected=state.target,n=serial;
   if(!expected||!snapshot||!Number.isInteger(index))return;
   const wasShown=revealedReward?.index===index;
   hideReward();render();
   if(wasShown)return;
   const epoch=revealEpoch;
   try{
     const result=await request('revealReward',{target:selected,snapshot,index});
     if(epoch!==revealEpoch||n!==serial||screen!=='rewards'||browseTab!=='cards'||!alive()||document.hidden||!sameTarget(selected,state?.target))return;
     if(!result?.ok||result.snapshot!==snapshot||result.index!==index||state.details?.rewardSnapshot!==snapshot||!result.row)throw Error();
     const row=result.row;
     revealedReward={index,merchant:row.cardMerchant,number:row.gcNumber,pin:row.gcPin};
     revealTimer=setTimeout(()=>{if(hideReward()&&alive()&&screen==='rewards')render();},30000);
     render();$('announcement').textContent='One saved reward revealed temporarily.';
   }catch{if(epoch===revealEpoch&&alive())$('announcement').textContent='Reveal unavailable. Refresh the current campaign.';}
   return;
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
 if(target.dataset.action==='captureDiagnostics'){
   if(!e.isTrusted||!state?.target||!state?.diagnostics?.enabled||state?.diagnostics?.blocked)return;
   const selected=state.target;target.disabled=true;
   let result;try{result=await request('captureDiagnostics',{target:selected});}catch{}
   if(!alive())return;
   await refresh();
   if(alive())$('announcement').textContent=result?.ok?'Current structural evidence recorded.':'Capture not confirmed. Check the current campaign and recording status.';
   return;
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
   hideReward();browseSearch=e.target.value;rewardPage=0;historyPage=0;render();return;
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
const visibility=()=>{if(document.hidden&&hideReward()&&alive())render();};
document.addEventListener('visibilitychange',visibility);
root.host?.addEventListener('rewards-companion-close',()=>{hideReward();document.removeEventListener('visibilitychange',visibility);},{once:true});
render();refresh();
return {refresh};
}
