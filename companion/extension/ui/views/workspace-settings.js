import {esc,button,check} from '../components.js';
// Fixed, user-readable explanations of observations, not claim validators.
export function diagnosticMessage(reason){
 const messages={
  'context-changed':'The merchant tab or page changed. Return to it, refresh the connection and try capture again.',
  'diagnostics-disabled-or-unrecognized':'Recording is off or the current page is not recognized. Check the merchant tab and recording setting.',
  'diagnostics-retention-blocked':'Recording is blocked by the storage limit or invalid existing evidence. Existing storage is kept; export the valid records.',
  'diagnostics-write-unverified':'Evidence could not be confirmed in storage. It may be saved in part or not at all; do not assume capture succeeded.',
  'diagnostics-storage-unavailable':'Saved diagnostic evidence could not be read. Its current state is unknown.',
  'diagnostics-preference-unverified':'Recording preference could not be verified in storage. Check the displayed setting before relying on it.',
  'invalid-report':'The observation could not be validated. It was not accepted as evidence.'
 };
 return messages[reason]||'The result could not be confirmed. Refresh the connection and check the current status.';
}
function currentEvidence(r){
 if(!r||r.status!=='recognized')return '<p>'+esc(r?.status==='conflict'?'The campaign identity conflicts with the page.':r?'This page is not recognized for recording.':'No recognized merchant page is connected.')+'</p><p>Open the supported merchant tab and refresh the connection. Do not force an unsupported page.</p>';
 const c=r.controls||{},barcode=c.serial,submit=c.submit;
 const stage=r.stage==='success'?'Confirmation page observed':submit?.actionable?'Submit control available':c.email?.actionable||c.confirmEmail?.actionable?'Email entry observed':barcode?.actionable?'Barcode entry observed':r.labels?.includes('Get My Bonus')?'Welcome step observed':'Redemption page observed';
 let body='<p><strong>'+esc(stage)+'</strong> · '+esc(r.campaign)+'</p><p>These are observations, not proof that a claim is ready or successful.</p>';
 if(r.stage==='entry'){
   if(!barcode?.present)body+='<p>Barcode field not found.</p>';
   else if(!barcode.visible)body+='<p>Barcode field is hidden. Final review cannot verify a hidden barcode.</p>';
   else if(!barcode.actionable)body+='<p>Barcode field is visible but inactive or disabled.</p>';
   if(!submit?.present)body+='<p>Submit control not found.</p>';
   else if(!submit.visible)body+='<p>Submit control is hidden.</p>';
   else if(!submit.actionable)body+='<p>Submit control is visible but unavailable.</p>';
 }
 if(c.errors?.present)body+='<p>An error container exists; this does not mean an error occurred.</p>';
 if(c.dialog?.visible)body+='<p>A dialog is visible. Follow the merchant instructions; do not bypass it.</p>';
 const controls=[['Form','form'],['Barcode field','serial'],['Active step','activeStep'],['Email field','email'],['Confirm email','confirmEmail'],['Terms control','terms'],['Submit controls','submit'],['Confirmation','confirmation'],['Claim another','another'],['Error containers','errors'],['Dialog','dialog']];
 body+='<details><summary>Observed control counts</summary><ul class="list">'+controls.filter(([,k])=>c[k]).map(([name,k])=>'<li><strong>'+esc(name)+'</strong><p>'+c[k].present+' present · '+c[k].visible+' visible · '+c[k].actionable+' available for interaction</p></li>').join('')+'</ul>'+(r.labels?.length?'<p>Recognized labels: '+esc(r.labels.join(' · '))+'</p>':'')+'</details>';
 return body;
}
export function workspaceSettingsView({state,emailDraft='',editing=false,recording=true,build=null,diagnosticBusy=false}){
 const r=state?.report,summary=state?.summary;
 let body='';
   body='<h2>Settings</h2>';
   const d=state?.diagnostics,known=typeof d?.enabled==='boolean';
   body+='<section class="surface stack"><h3>Diagnostics</h3><p><strong>Capture evidence when a step changes or something stops.</strong></p>'+
     (recording?check('diagnosticsEnabled','Record sanitized structural observations',d?.enabled===true,diagnosticBusy)+
       '<p>'+(!known?'Recording setting unknown.':d.enabled?'Recording is on.':'Recording is off.')+' The preference is saved in this extension across restarts; turning it off keeps earlier observations.</p>'+
       (Number.isInteger(d?.count)?'<p>'+d.count+'/500 distinct records · '+d.eventCount+'/2000 events</p>':'<p>Saved evidence count unknown.</p>')+
       (d?.blocked?'<p class="warning">'+esc(diagnosticMessage('diagnostics-retention-blocked'))+'</p>':'')+
       (d?.issue?'<p class="warning">Problem observed during this worker session: '+esc(diagnosticMessage(d.issue))+'</p>':'')+
       button('Capture current evidence','captureDiagnostics',{primary:true,disabled:diagnosticBusy||!state?.target||d?.enabled!==true||!!d?.blocked})+
       '<p>For manual capture, keep the recognized merchant tab active, turn recording on, then capture. Wait for confirmation that evidence was saved.</p>':
       '<p>Current document only. Background recording requires the extension. Export the current page before moving to another step; no retained recorder.</p>')+
     button('Export diagnostics','export',{disabled:diagnosticBusy||!d?.count})+
     '<p>Read-only structural evidence, without credentials or full URLs. Recording does not guarantee complete coverage or disable claim controls.</p>'+
     '<details id="diagnosticInstructions"><summary>How to collect useful evidence</summary><p>Use ordinary merchant steps only when already authorized. For passive observation during legitimate v15 use, enable extension recording and leave Companion form, queue and claim actions alone while v15 runs. Do not run both redemption workflows or switch versions while an outcome is unresolved.</p><p>Capture at the visible step or stop, then export the saved evidence. Distinct records show the first observed time; timeline events show observation times, not proof of a specific action or claim. Older captures may have unknown or mixed build identities; the export identifies the running exporter only.</p><p>Keep any redacted screenshot privately if needed. Do not paste credentials, screenshots or arbitrary page data into diagnostics. Do not create a claim just to test recording.</p></details></section>';
   body+='<section class="surface stack"><h3>Current structural evidence</h3>'+currentEvidence(r)+'</section>';
   if(summary?.ok&&state?.target)body+='<section class="surface stack"><h3>Legacy preferences</h3><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p><label for="emailDraft">New redemption email</label><input id="emailDraft" type="email" maxlength="254" autocomplete="off" value="'+esc(emailDraft)+'">'+button('Save email','saveEmail',{disabled:editing||summary.unresolved||!emailDraft.trim()})+check('clipboardPreference','Saved clipboard preference',summary.clipboard,editing||summary.unresolved)+'<p class="muted">Preferences do not authorize claims. Keep legacy v15 closed while editing.</p></section>';
   body+='<section class="surface stack"><h3>About Rewards Companion</h3><p>'+esc(build?build.version+' Preview · testing only':'Local / unverified build')+'</p><details><summary>Version details</summary><p>'+esc(build?build.distribution+' · development · '+build.commit:'Exact packaged build identity unavailable.')+'</p></details><a href="https://dotsthewarlock.github.io/rewards/companion/launcher/" target="_blank" rel="noopener noreferrer">Check for updates</a><p class="muted">Compare the exact version on the official page. No automatic updates or switching.</p></section>';
 return body;
}
