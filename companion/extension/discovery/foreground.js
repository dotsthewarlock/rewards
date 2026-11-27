/* Shared foreground final-form adapter, adapted from v15 DOM/CAP.
 * No auto-fill, guessed choice, hidden value read, navigation or passive invocation.
 * Candidate: call only from an explicit review/authorization lifecycle.
 * The caller supplies canonical campaign metadata, not page-derived choices.
 */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy,T=globalThis.RewardsTransactions;
  const fail=reason=>({ok:false,reason});
  const label=el=>String(el?.value&&el.matches('input')?el.value:el?.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
  const one=nodes=>nodes.length===1?nodes[0]:null;
  const visibleNodes=(root,selector)=>[...root.querySelectorAll(selector)].filter(D.visible);
  function singleChoice(c,target){
    return c?.id===target.campaign&&c.origin===target.origin&&
      ['products','rewards','merchant'].every(key=>Array.isArray(c[key])&&c[key].length===1&&typeof c[key][0]==='string')&&
      Number.isSafeInteger(c.cents)&&c.cents>0;
  }
  function readFinal(doc,target){
    const id=D.identity(doc);
    if(id?.status!=='recognized'||id.stage!=='entry'||!id.signals.entryVisible||id.signals.success||
      id.origin!==target.origin||id.campaign!==target.campaign||doc.visibilityState!=='visible'||
      doc.getElementById('bsp'))return null;
    // Normal merchant validation and CAPTCHA are never bypassed. Ignore dormant
    // challenge frames, but not a visible challenge, dialog, or wizard error.
    if(visibleNodes(doc,'iframe[src*="/recaptcha/api2/bframe"],iframe[title*="recaptcha challenge" i],[role="dialog"],[aria-modal="true"],dialog[open],.modal.show').length||
      visibleNodes(id.root,'#target_errors,.form-error-inner').some(n=>n.textContent.trim()))return null;
    const form=one(visibleNodes(id.root,'form#new_workflow_data'));
    if(!form||form.method.toLowerCase()!=='post'||form.noValidate||!['','_self'].includes(form.target)||
       new URL(form.action,doc.location.href).origin!==target.origin||form.matches(':invalid'))return null;
    const step=one(visibleNodes(form,'.step_active'));
    if(!step)return null;
    const active=el=>D.visible(el)&&el.form===form&&(!el.closest('.step')||el.closest('.step')===step);
    // The actual submitted barcode must still be visibly reviewable. An
    // inactive/hidden barcode or inferred value from the queue is insufficient.
    const code=one([...form.querySelectorAll('#target_codes .serial-number_wrapper input:not([type="hidden"]),#target_codes input:not([type="hidden"]),input.wizard-serial-number')].filter(el=>active(el)&&['text','tel'].includes(el.type)));
    const email=one([...step.querySelectorAll('input#workflow_data_email,input[name="workflow_data[email]"]')].filter(active));
    const confirm=one([...step.querySelectorAll('input#workflow_data_email_confirmation,input[name="workflow_data[email_confirmation]"]')].filter(active));
    const terms=one([...step.querySelectorAll('input#workflow_data_terms_of_service,input[name="workflow_data[terms_of_service]"]')].filter(active));
    const submits=[...form.querySelectorAll('button,input')].filter(el=>el.form===form&&el.type==='submit'&&D.actionable(el));
    const submit=one(submits);
    if(!code||!L.barcode(code.value)||!email||!confirm||email===confirm||
      !D.actionable(email)||!D.actionable(confirm)||!L.normalizedEmail(email.value)||confirm.value!==email.value||
      !terms||terms.type!=='checkbox'||!terms.checked||terms.indeterminate||!D.actionable(terms)||
      !submit||!step.contains(submit)||submit.name!=='commit'||!['SUBMIT','SHOW & EMAIL CODE'].includes(label(submit))||
      ['formaction','formtarget','formmethod','formenctype','formnovalidate'].some(a=>submit.hasAttribute(a)))return null;
    if([...step.querySelectorAll('button,input,a')].some(el=>D.actionable(el)&&['NEXT','GET MY BONUS'].includes(label(el))))return null;
    return {root:id.root,form,step,code,email,confirm,terms,submit,barcode:code.value,address:email.value,url:doc.location.href,action:form.action};
  }
  const same=(a,b)=>!!a&&!!b&&Object.keys(a).every(k=>a[k]===b[k]);
  // Creates one immutable review and one one-shot authorization closure.
  // Construction/inspection never mutates the merchant page or persistent cache.
  function prepareFinal(doc,storage,locks,target,campaign,contextValid){
    try{
      if(!target||typeof contextValid!=='function'||!singleChoice(campaign,target)||!contextValid())return fail('unsupported-review');
      const initial=readFinal(doc,target);
      if(!initial)return fail('form-not-ready');
      const raw=L.readSnapshot(storage,target.campaign,['queue','active','lock','email']);
      const queue=L.decodeRows(raw.queue);
      const row=queue.find(r=>r.state==='queued');
      if(raw.active!==null||raw.lock!==null||queue.some(r=>['pending','processing'].includes(r.state))||
        !row||row.code!==initial.barcode||raw.email!==initial.address)return fail('review-conflict');
      const review=Object.freeze({origin:target.origin,campaign:target.campaign,documentToken:target.documentToken,
        attemptId:doc.defaultView.crypto.randomUUID(),queueId:row.id,code:row.code,product:campaign.products[0],
        reward:campaign.rewards[0],cardMerchant:campaign.merchant[0],valueRecent:(campaign.cents/100).toFixed(2),
        email:initial.address,terms:true});
      if(!T.validReview(review))return fail('invalid-review');
      const abort=new AbortController(),options={capture:true,signal:abort.signal};
      let used=false,invoking=false,cancelled=false;
      const cancel=()=>{cancelled=true;abort.abort();};
      const interrupt=()=>{if(!invoking)cancel();};
      // A native submission, user edit, hidden/restored page or history
      // transition invalidates the old review; do not intercept merchant events.
      for(const event of ['input','change','submit'])initial.form.addEventListener(event,interrupt,options);
      initial.submit.addEventListener('click',interrupt,options);
      doc.addEventListener('visibilitychange',interrupt,options);
      for(const event of ['pagehide','popstate','hashchange'])doc.defaultView.addEventListener(event,interrupt,options);
      const current=()=>!cancelled&&contextValid()===true&&same(initial,readFinal(doc,target));
      async function authorize(){
        if(used||cancelled)return fail('review-expired');
        used=true;
        try{
          if(!current())return fail('context-changed');
          return await T.startAttempt(storage,locks,review,current,()=>{
            if(!current())return false;
            invoking=true;
            // Invoke only the original, revalidated native submit control.
            // Native form constraints and site handlers still run normally.
            initial.submit.click();
            return true;
          });
        }finally{cancel();}
      }
      return {ok:true,review,authorize,cancel};
    }catch{return fail('review-unavailable');}
  }
  globalThis.RewardsForeground=Object.freeze({prepareFinal});
})();
