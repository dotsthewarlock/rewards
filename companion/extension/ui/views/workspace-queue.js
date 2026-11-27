import {esc,button,check,workspaceRecordList} from '../components.js';
// Pure Queue presentation. Commands are handled by the shared controller.
function finalReviewView(reviewed,editing){
 if(!reviewed)return '';
 const r=reviewed.review;
 return '<section class="surface stack review-data"><h3>Review exact claim</h3><p><strong>Product:</strong> '+esc(r.product)+'</p><p><strong>Reward:</strong> '+esc(r.reward)+' · CAD $'+esc(r.valueRecent)+'</p><p><strong>Barcode:</strong> <span class="mono">'+esc(r.code)+'</span></p><p><strong>Email:</strong> '+esc(r.email)+'</p><p>Merchant terms are checked on the page. Confirm that you reviewed them and this is your eligible purchased product.</p>'+check('finalConfirmed','I confirm the exact claim details and merchant terms',reviewed.confirmed,editing)+button('Authorize reviewed claim','authorizeFinal',{primary:true,disabled:editing||!reviewed.confirmed,extra:'data-value="'+esc(r.attemptId)+'"'})+button('Cancel review','cancelFinal',{disabled:editing})+'</section>';
}

export function workspaceQueueView({state,cp,draft='',preview=null,page=0,editing=false,reviewed=null}){
 const r=state?.report,summary=state?.summary,details=state?.details;
 let body='';
   body='<h2>Queue</h2><p>Legacy cache management and reviewed foreground claims. Development candidate; live compatibility unverified.</p>';
   if(summary?.ok)body+='<section class="surface"><p>'+summary.queue.queued+' ready · '+summary.queue.complete+' complete · '+summary.queue.pending+' pending</p><p>'+summary.queue.duplicate+' duplicates · '+summary.queue.error+' errors</p><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p>'+(summary.unresolved?'<p class="warning">Existing unresolved or active state. No replay or advancement.</p>':'')+'</section>';
   else if(summary?.ok===false)body+='<p class="warning">Legacy cache could not be safely read. No data changed.</p>';
   if(summary?.ok&&state?.target){
     if(r?.stage==='entry'&&!summary.unresolved&&summary.queue.queued>0&&summary.emailConfigured&&cp?.products.length===1&&cp.rewards.length===1){
       body+=reviewed?finalReviewView(reviewed,editing):'<section class="surface stack"><h3>Review merchant form</h3><p>Complete the native merchant steps and terms, leaving the final form visible. Do not submit separately. Unknown layouts and choices remain blocked.</p>'+button('Review final claim','prepareFinal',{primary:true,disabled:editing||r.controls.submit.actionable!==1})+'</section>';
     }
     if(r?.stage==='success'&&summary.unresolved&&state.recovery)body+='<section class="surface stack"><h3>Unresolved reward</h3><p>Reviewed attempt ending '+esc(state.recovery.last4)+'. Inspect the matching merchant confirmation before capture. No claim will be submitted or advanced.</p>'+button('Capture matching reward','reconcileSuccess',{primary:true,disabled:editing,extra:'data-value="'+esc(state.recovery.attemptId)+'"'})+'</section>';
     body+='<section class="surface stack"><label for="importDraft">Redemption codes</label><textarea id="importDraft" maxlength="262144" autocomplete="off" spellcheck="false" placeholder="Paste 30-digit codes or receipt text">'+esc(draft)+'</textarea>'+'<div class="row">'+button('Paste from clipboard','pasteDraft',{disabled:editing})+button('Add to queue','addQueue',{primary:true,disabled:editing||summary.unresolved||!draft.trim()})+button('Preview','previewImport',{disabled:editing||!draft.trim()})+'</div><p class="muted">Close other v15 workspaces before editing. Adding codes never submits a claim.</p><p id="importResult" role="status">'+(preview?esc(preview):'')+'</p></section>';
     if(details?.ok)body+='<section class="surface"><h3>Existing queue</h3>'+(details.queue.length?workspaceRecordList(details.queue,page,'queuePage'):'<p>No queued records.</p>')+'</section>';
   }

 return body;
}
