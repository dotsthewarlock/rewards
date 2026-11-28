import {esc,button,check,workspaceRecordList} from '../components.js';
// Pure Queue presentation. Commands are handled by the shared controller.
function finalReviewView(reviewed,editing){
 if(!reviewed)return '';
 const r=reviewed.review;
 return '<section class="surface stack review-data"><h3>Review exact claim</h3><p><strong>Product:</strong> '+esc(r.product)+'</p><p><strong>Reward:</strong> '+esc(r.reward)+' · CAD $'+esc(r.valueRecent)+'</p><p><strong>Barcode:</strong> <span class="mono">'+esc(r.code)+'</span></p><p><strong>Email:</strong> '+esc(r.email)+'</p><p>Merchant terms are checked on the page. Confirm that you reviewed them and this is your eligible purchased product.</p>'+check('finalConfirmed','I confirm the exact claim details and merchant terms',reviewed.confirmed,editing)+button('Authorize reviewed claim','authorizeFinal',{primary:true,disabled:editing||!reviewed.confirmed,extra:'data-value="'+esc(r.attemptId)+'"'})+button('Cancel review','cancelFinal',{disabled:editing})+'</section>';
}

export function workspaceQueueView({state,cp,draft='',preview=null,page=0,editing=false,reviewed=null,removal=null}){
 const r=state?.report,summary=state?.summary,details=state?.details;
 let body='';
   body='<h2>Queue</h2><p>Legacy cache management and reviewed foreground claims. Development candidate; live compatibility unverified.</p>';
   if(summary?.ok)body+='<section class="surface"><p>'+summary.queue.queued+' ready · '+summary.queue.complete+' complete · '+summary.queue.pending+' pending</p><p>'+summary.queue.duplicate+' duplicates · '+summary.queue.error+' errors</p><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p>'+(summary.unresolved?'<p class="warning">Existing unresolved or active state. No replay or advancement.</p>':'')+'</section>';
   else if(summary?.ok===false)body+='<p class="warning">Legacy cache could not be safely read. No data changed. Keep the original records and backups; do not reset, replay or switch versions. Inspect merchant confirmation or contact merchant support if an attempt may have occurred.</p>';
   if(summary?.ok&&state?.target){
     const block=details?.queueBlock;
     if(summary.unresolved||['locked','active','pending','processing'].includes(block)){
       const why={locked:'A stored lock is present.',active:'An active attempt record is present.',pending:'A pending queue record may represent a submission.',processing:'A processing queue record has not been resolved.'};
       body+='<section class="surface stack"><h3>Resolve existing attempt safely</h3><p>'+esc(why[block]||'Existing attempt evidence is unresolved.')+' The outcome is not established by this state.</p><p>Inspect the current merchant confirmation and your redemption confirmation email. If the exact outcome is unclear, contact merchant support. Absence of confirmation does not prove failure. Keep all evidence and backups; do not retry, clear records or switch versions.</p>'+
       (state.recovery&&r?.stage==='success'?'<p>Only the exact matching visible success can be captured below.</p>':'<p>No verified linked success is available here. Leave the attempt unresolved.</p>')+'</section>';
     }else if(block==='ambiguous')body+='<p class="warning">Queue removal unavailable: existing records or source links cannot be safely interpreted. Keep them intact.</p>';
     if(removal){
       const rows=removal.rows;
       return body+'<section class="surface stack"><h3>Confirm queue removal</h3><p>Remove '+rows.length+' reviewed unused queue '+(rows.length===1?'entry':'entries')+' from this campaign. '+removal.retained+' other entries will stay. This cannot undo a merchant submission; history and rewards are retained.</p><ul class="list">'+rows.map(row=>'<li>Entry '+(row.index+1)+' · <span class="mono">•••• '+esc(row.last4)+'</span></li>').join('')+'</ul>'+button('Confirm removal','confirmRemoval',{primary:true,disabled:editing})+button('Cancel removal','cancelRemoval',{disabled:editing})+'</section>';
     }
     if(r?.stage==='entry'&&!summary.unresolved&&summary.queue.queued>0&&summary.emailConfigured&&cp?.products.length===1&&cp.rewards.length===1){
       body+=reviewed?finalReviewView(reviewed,editing):'<section class="surface stack"><h3>Next redemption</h3><p>'+esc(r.labels?.includes('Get My Bonus')&&!r.controls.serial?.actionable?'Click Get My Bonus on the merchant page first.':r.controls.email?.actionable?'Fill the saved email, check the merchant details and terms, then review the final claim.':r.controls.serial?.actionable?'Fill the next ready barcode, then follow the merchant’s Next button.':'Follow the merchant’s visible steps; use field assistance when the barcode or email fields appear.')+'</p>'+button('Prepare next redemption','prepareNext',{primary:true,disabled:editing})+'<p class="muted">Fills only supported visible blank fields; leaves merchant choices, CAPTCHA, terms and Next to you. Never submits. Do not submit separately; review the final claim here.</p>'+button('Review final claim','prepareFinal',{primary:r.controls.submit.actionable===1,disabled:editing||r.controls.submit.actionable!==1})+'</section>';
     }
     if(r?.stage==='entry'&&cp&&(cp.products.length!==1||cp.rewards.length!==1))body+='<p class="warning">Multiple product or reward choices: this variant remains diagnostic-only for final claims. Queue import and saved data remain available.</p>';
     if(r?.stage==='success'&&summary.unresolved&&state.recovery)body+='<section class="surface stack"><h3>Unresolved reward</h3><p>Reviewed attempt ending '+esc(state.recovery.last4)+'. Inspect the matching merchant confirmation before capture. No claim will be submitted or advanced.</p>'+button('Capture matching reward','reconcileSuccess',{primary:true,disabled:editing,extra:'data-value="'+esc(state.recovery.attemptId)+'"'})+'</section>';
     body+='<section class="surface stack"><label for="importDraft">Redemption codes</label><textarea id="importDraft" maxlength="262144" autocomplete="off" spellcheck="false" placeholder="Paste 30-digit codes or receipt text">'+esc(draft)+'</textarea>'+'<div class="row">'+button('Paste from clipboard','pasteDraft',{disabled:editing})+button('Add to queue','addQueue',{primary:true,disabled:editing||summary.unresolved||!draft.trim()})+button('Preview','previewImport',{disabled:editing||!draft.trim()})+'</div><p class="muted">Close other v15 workspaces before editing. Adding codes never submits a claim.</p><p id="importResult" role="status">'+(preview?esc(preview):'')+'</p></section>';
     if(details?.ok){
       const canRemove=!editing&&!reviewed&&!summary.unresolved&&details.queueBlock===null&&!!details.queueSnapshot;
       body+='<section class="surface stack"><h3>Existing queue</h3>'+(details.queue.length?workspaceRecordList(details.queue,page,'queuePage',false,false,null,canRemove):'<p>No queued records.</p>')+
       (canRemove&&summary.queue.queued>0?button('Review safe removals','reviewRemoval',{extra:'data-value="all"'})+'<p class="muted">Only unused ready entries with no linked or duplicate evidence can be removed. All other records remain.</p>':'')+'</section>';
     }
   }

 return body;
}
