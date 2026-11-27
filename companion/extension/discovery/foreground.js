/* Shared foreground final-form adapter, adapted from v15 DOM/CAP.
 * No auto-fill, guessed choice, hidden value read, navigation or passive invocation.
 * Candidate: call only from an explicit review/authorization lifecycle.
 * Product/reward metadata comes only from the shared canonical registry.
 */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy,T=globalThis.RewardsTransactions,R=globalThis.RewardsCampaigns;
  const fail=reason=>({ok:false,reason});
  const label=el=>String(el?.value&&el.matches('input')?el.value:el?.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
  const one=nodes=>nodes.length===1?nodes[0]:null;
  const visibleNodes=(root,selector)=>[...root.querySelectorAll(selector)].filter(D.visible);
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
    if(!code||code.matches(':disabled')||!L.barcode(code.value)||!email||!confirm||email===confirm||
      !['email','text'].includes(email.type)||!['email','text'].includes(confirm.type)||
      !D.actionable(email)||!D.actionable(confirm)||!L.normalizedEmail(email.value)||confirm.value!==email.value||
      !terms||terms.type!=='checkbox'||!terms.checked||terms.indeterminate||!D.actionable(terms)||
      !submit||!step.contains(submit)||submit.name!=='commit'||!['SUBMIT','SHOW & EMAIL CODE'].includes(label(submit))||
      ['formaction','formtarget','formmethod','formenctype','formnovalidate'].some(a=>submit.hasAttribute(a)))return null;
    if([...step.querySelectorAll('button,input,a')].some(el=>D.actionable(el)&&['NEXT','GET MY BONUS'].includes(label(el))))return null;
    // A visible control is not necessarily a successful native form field.
    // Check only names/metadata, never hidden values. Reject unnamed or
    // conflicting fields; disabled barcode evidence cannot prove submission.
    const reviewedControls=[code,email,confirm,terms,submit],all=[...form.elements];
    if(reviewedControls.some(el=>!el.name||all.filter(n=>n.name===el.name).length!==1))return null;
    return {root:id.root,form,step,code,email,confirm,terms,submit,barcode:code.value,address:email.value,
      url:doc.location.href,action:form.action,method:form.method,enctype:form.enctype,target:form.target,
      codeName:code.name,emailName:email.name,confirmName:confirm.name,termsName:terms.name,
      termsValue:terms.value,submitValue:submit.value,submitLabel:label(submit)};
  }
  const same=(a,b)=>!!a&&!!b&&Object.keys(a).every(k=>a[k]===b[k]);
  // Creates one immutable review and one one-shot authorization closure.
  // Construction/inspection never mutates the merchant page or persistent cache.
  function prepareFinal(doc,storage,locks,target,contextValid){
    try{
      const choice=target&&R.singleChoice(target.campaign,target.origin);
      if(!choice||typeof contextValid!=='function'||!contextValid())return fail('unsupported-review');
      const initial=readFinal(doc,target);
      if(!initial)return fail('form-not-ready');
      const raw=L.readSnapshot(storage,target.campaign,['queue','active','lock','email']);
      const queue=L.decodeRows(raw.queue);
      const row=queue.find(r=>r.state==='queued');
      if(raw.active!==null||raw.lock!==null||queue.some(r=>['pending','processing'].includes(r.state))||
        !row||row.code!==initial.barcode||raw.email!==initial.address)return fail('review-conflict');
      const review=Object.freeze({origin:target.origin,campaign:target.campaign,documentToken:target.documentToken,
        attemptId:doc.defaultView.crypto.randomUUID(),queueId:row.id,code:row.code,...choice,
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
  // Explicit, local field assistance only. Never click, submit, select, accept terms,
  // read hidden values, write cache, or establish final authorization.
  function assistanceFields(doc,target){
    const id=D.identity(doc);
    if(id?.status!=='recognized'||id.stage!=='entry'||!id.signals.entryVisible||id.signals.success||
       id.origin!==target.origin||id.campaign!==target.campaign||doc.visibilityState!=='visible'||doc.getElementById('bsp'))return null;
    if(visibleNodes(doc,'iframe[src*="/recaptcha/api2/bframe"],iframe[title*="recaptcha challenge" i],[role="dialog"],[aria-modal="true"],dialog[open],.modal.show').length||
       visibleNodes(id.root,'#target_errors,.form-error-inner').some(n=>n.textContent.trim()))return null;
    const form=one(visibleNodes(id.root,'form#new_workflow_data'));
    if(!form||form.method.toLowerCase()!=='post'||form.noValidate||!['','_self'].includes(form.target)||
       new URL(form.action,doc.location.href).origin!==target.origin)return null;
    const step=one(visibleNodes(form,'.step_active'));
    if(!step)return null;
    const active=el=>D.visible(el)&&el.form===form&&(!el.closest('.step')||el.closest('.step')===step);
    const group=selector=>[...form.querySelectorAll(selector)].filter(active);
    const code=group('#target_codes .serial-number_wrapper input:not([type="hidden"]),#target_codes input:not([type="hidden"]),input.wizard-serial-number');
    const email=group('input#workflow_data_email,input[name="workflow_data[email]"]');
    const confirm=group('input#workflow_data_email_confirmation,input[name="workflow_data[email_confirmation]"]');
    if(code.length>1||email.length>1||confirm.length>1||email.length!==confirm.length)return null;
    const fields=[...code.map(el=>({el,kind:'barcode'})),...email.map(el=>({el,kind:'email'})),...confirm.map(el=>({el,kind:'email'}))];
    if(new Set(fields.map(f=>f.el)).size!==fields.length||fields.some(({el,kind})=>
       !D.actionable(el)||!el.name||[...form.elements].filter(n=>n.name===el.name).length!==1||
       !(kind==='barcode'?['text','tel']:['text','email']).includes(el.type)))return null;
    return {root:id.root,form,step,fields};
  }
  async function prepareNext(doc,storage,locks,target,contextValid){
    if(!target||!R.singleChoice(target.campaign,target.origin)||typeof contextValid!=='function'||!contextValid())return fail('context-changed');
    if(!locks||typeof locks.request!=='function')return fail('lock-unavailable');
    let touched=false;
    try{
      const plan=assistanceFields(doc,target);
      if(!plan)return fail('fields-blocked');
      if(!plan.fields.length)return fail('manual-stage');
      const initialValues=plan.fields.map(f=>f.el.value);
      return await locks.request(L.editLock,{mode:'exclusive',ifAvailable:true},async lock=>{
        if(!lock)return fail('edit-busy');
        if(!contextValid())return fail('context-changed');
        const raw=L.readSnapshot(storage,target.campaign,['queue','history','active','lock','email']);
        const queue=L.decodeRows(raw.queue),row=queue.find(r=>r.state==='queued'),email=L.normalizedEmail(raw.email);
        if(raw.active!==null||raw.lock!==null||queue.some(r=>['pending','processing'].includes(r.state)))return fail('legacy-busy');
        if(!row||!L.barcode(row.code)||typeof row.id!=='string'||!row.id||!email||email!==raw.email||
           queue.some(r=>r!==row&&(r.code===row.code&&r.state!=='duplicate'&&r.state!=='error'||r.id===row.id))||
           await L.historyMatcher(L.decodeRows(raw.history))(row.code))return fail('queue-not-ready');
        if(!contextValid()||!L.unchanged(storage,target.campaign,raw))return fail('context-changed');
        const value=f=>f.kind==='barcode'?row.code:email;
        if(plan.fields.some(f=>f.el.value!==''&&f.el.value!==value(f)))return fail('field-conflict');
        const sameFields=()=>{const now=assistanceFields(doc,target);return contextValid()&&L.unchanged(storage,target.campaign,raw)&&
          now&&now.root===plan.root&&now.form===plan.form&&now.step===plan.step&&now.fields.length===plan.fields.length&&
          now.fields.every((f,i)=>f.el===plan.fields[i].el&&f.kind===plan.fields[i].kind&&
            (f.el.value===''||f.el.value===value(f)));};
        if(!sameFields()||plan.fields.some((f,i)=>f.el.value!==initialValues[i]))return fail('context-changed');
        for(const f of plan.fields){
          if(!sameFields())return fail(touched?'fields-unverified':'context-changed');
          if(f.el.value===value(f))continue;
          touched=true;
          const view=doc.defaultView;
          Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,'value').set.call(f.el,value(f));
          f.el.dispatchEvent(new view.Event('input',{bubbles:true}));
          if(!sameFields()||f.el.value!==value(f))return fail('fields-unverified');
          f.el.dispatchEvent(new view.Event('change',{bubbles:true}));
          if(!sameFields()||f.el.value!==value(f))return fail('fields-unverified');
        }
        if(!sameFields()||plan.fields.some(f=>f.el.value!==value(f)))return fail('fields-unverified');
        return {ok:true,barcode:plan.fields.some(f=>f.kind==='barcode'),email:plan.fields.some(f=>f.kind==='email')};
      });
    }catch{return fail(touched?'fields-unverified':'fields-blocked');}
  }
  globalThis.RewardsForeground=Object.freeze({prepareFinal,prepareNext});
})();
