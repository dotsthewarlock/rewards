/* Adapted from original InCommCore fingerprint/labels and frozen v15 PAGE.
 * Read-only. Fixed structural vocabulary: no raw values, arbitrary text, URLs or identifiers.
 * The same classic script loads in the isolated content world, worker and Node tests.
 */
(() => {
  'use strict';
  const origins = Object.freeze({
    'https://getmybonus.ca':'CA1126VANW',
    'https://prepaidrewards.ca':'CA1126PKIZ',
    'https://bonusrewards.ca':'CA1126DTZFT',
    'https://cardbonuses.com':'CA1126PZFT',
    'https://cardreward.ca':'CA1026CK1'
  });
  const selectors = Object.freeze({
    form:'form#new_workflow_data', serial:'.wizard-serial-number',
    activeStep:'.step_active', codes:'#target_codes', email:'#workflow_data_email',
    confirmEmail:'#workflow_data_email_confirmation', terms:'#workflow_data_terms_of_service',
    submit:'input[name="commit"],button[name="commit"]', confirmation:'.confirmation-block',
    rewardFields:'.codes-container', another:'.btn-claim-another-code',
    errors:'#target_errors,.form-error-inner', dialog:'[role="dialog"],[aria-modal="true"]',
    hidden:'input[type="hidden"]'
  });
  const vocabulary=Object.freeze(['Get My Bonus','Next','Back','Show & Email Code','Submit',
    'Choose your bonus','Which product did you purchase?','Where did you purchase your gift card?',
    'Claim Another','Claim Another Code','Claim Another Bonus','Eligible Card','Bonus Code',
    'Gift Card Number','Card Number','PIN','Gift Card PIN','Card PIN']);
  const normalize=s=>typeof s==='string'?s.trim().toUpperCase():'';
  const slug=s=>/^CA\d{4}[A-Z][A-Z0-9]*$/.test(normalize(s))&&s.length<=40?normalize(s):null;
  const allowedOrigin=o=>typeof o==='string'&&Object.hasOwn(origins,o);
  // Public identity is exact and independent of the frozen workflow allowlist.
  // No case folding, URL normalization, guessed slugs or mutable metadata.
  function publicIdentity(origin,campaign){
    if(!allowedOrigin(origin)||typeof campaign!=='string'||slug(campaign)!==campaign)return null;
    return Object.freeze({origin,campaign,key:origin+'/'+campaign});
  }
  function publicLink(href,origin){
    if(!allowedOrigin(origin)||typeof href!=='string')return null;
    const path=href.startsWith('/')&&!href.startsWith('//')?href:
      href.startsWith(origin+'/')?href.slice(origin.length):'';
    const match=/^\/(CA\d{4}[A-Z][A-Z0-9]*)(?:\/(?:en|fr))?\/?$/.exec(path);
    if(!match)return null;
    const id=publicIdentity(origin,match[1]);
    return id?{...id,url:origin+path}:null;
  }
  const qs=(r,s)=>r?.querySelector(s)||null;
  function visible(el){
    if(!el?.isConnected||!el.getClientRects().length||el.closest('[hidden],[inert],[aria-hidden="true"],input[type="hidden"]'))return false;
    for(let n=el;n&&n.nodeType===1;n=n.parentElement){
      const style=n.ownerDocument.defaultView.getComputedStyle(n);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
    }
    return true;
  }
  function actionable(el){
    if(!visible(el)||!el.matches('input,button,select,textarea,a,[role="button"]')||
       el.matches(':disabled,[readonly],[aria-disabled="true"]')||el.closest('[aria-disabled="true"]'))return false;
    const step=el.closest('.step');
    return (!step||step.classList.contains('step_active'))&&el.ownerDocument.defaultView.getComputedStyle(el).pointerEvents!=='none';
  }
  function identity(doc){
    const url=new URL(doc.location.href),origin=url.origin;
    if(!allowedOrigin(origin))return null;
    const expected=origins[origin],body=slug(doc.body?.dataset?.slug||''),path=slug(url.pathname.split('/').filter(Boolean)[0]||'');
    const entryRoot=qs(doc,'.bcr-redemption'),form=qs(entryRoot,selectors.form);
    const entry=!!(form&&qs(form,selectors.serial));
    const successRoot=qs(doc,'main.value-add.wizard')||qs(doc,'#main');
    const confirmation=qs(successRoot,selectors.confirmation);
    const success=!!(confirmation&&qs(confirmation,selectors.rewardFields)&&qs(successRoot,selectors.another));
    const entryVisible=entry&&visible(form),successVisible=success&&visible(confirmation);
    const conflict=!!((body&&body!==expected)||(path&&path!==expected));
    let stage='unknown',root=null;
    if(entry&&success){
      if(entryVisible&&!successVisible){stage='entry';root=entryRoot;}
      else if(successVisible&&!entryVisible){stage='success';root=successRoot;}
      else stage='ambiguous';
    }else if(entry){stage='entry';root=entryRoot;}
    else if(success){stage='success';root=successRoot;}
    const status=conflict?'conflict':body===expected&&root?'recognized':'candidate';
    return {origin,campaign:body===expected&&!conflict?expected:null,status,stage,root,
      signals:{bodyMatch:body===expected,pathMatch:path===expected,entry,success,entryVisible,successVisible}};
  }
  const limit=1000;
  function report(doc){
    const id=identity(doc);
    if(!id)return null;
    const controls={};
    for(const [key,selector] of Object.entries(selectors)){
      // Scope to the recognized wizard, never arbitrary page nodes.
      const nodes=id.root?[...id.root.querySelectorAll(selector)].slice(0,limit):[];
      controls[key]={present:nodes.length,visible:nodes.filter(visible).length,actionable:nodes.filter(actionable).length};
    }
    const found=new Set();
    if(id.root)for(const el of [...id.root.querySelectorAll('button,input[type="submit"],input[type="button"],a,label,h1,h2,h3,h4,.title,[role="button"],[role="heading"]')].slice(0,limit)){
      if(!visible(el))continue;
      const raw=el.matches('input')?el.getAttribute('value'):el.textContent;
      const match=vocabulary.find(x=>normalize(x)===normalize((raw||'').replace(/:$/,'')));
      if(match)found.add(match);
    }
    return {schema:'rewards.structural/1',origin:id.origin,campaign:id.campaign,status:id.status,stage:id.stage,
      signals:id.signals,controls,labels:vocabulary.filter(x=>found.has(x))};
  }
  const exact=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  function validate(input,origin){
    if(!allowedOrigin(origin)||!exact(input,['schema','origin','campaign','status','stage','signals','controls','labels'])||
      input.schema!=='rewards.structural/1'||input.origin!==origin||
      (input.campaign!==null&&input.campaign!==origins[origin])||
      !['recognized','candidate','conflict'].includes(input.status)||
      !['entry','success','unknown','ambiguous'].includes(input.stage))return null;
    const sig=['bodyMatch','pathMatch','entry','success','entryVisible','successVisible'];
    if(!exact(input.signals,sig)||sig.some(k=>typeof input.signals[k]!=='boolean'))return null;
    if(input.status==='recognized'&&(input.campaign!==origins[origin]||!input.signals.bodyMatch||
      !['entry','success'].includes(input.stage)||!input.signals[input.stage]))return null;
    if(input.status==='conflict'&&input.campaign!==null)return null;
    if(!exact(input.controls,Object.keys(selectors)))return null;
    const controls={};
    for(const k of Object.keys(selectors)){
      const v=input.controls[k];
      if(!exact(v,['present','visible','actionable'])||Object.values(v).some(x=>!Number.isInteger(x)||x<0||x>limit)||
        v.actionable>v.visible||v.visible>v.present)return null;
      controls[k]={present:v.present,visible:v.visible,actionable:v.actionable};
    }
    if(!Array.isArray(input.labels)||input.labels.length>vocabulary.length||
       input.labels.some(x=>!vocabulary.includes(x))||new Set(input.labels).size!==input.labels.length)return null;
    // Rebuild a fixed-schema packet instead of trusting sender-owned objects.
    return {schema:'rewards.structural/1',origin,campaign:input.campaign,status:input.status,stage:input.stage,
      signals:Object.fromEntries(sig.map(k=>[k,input.signals[k]])),controls,labels:vocabulary.filter(x=>input.labels.includes(x))};
  }
  globalThis.RewardsDiscovery=Object.freeze({origins,selectors,vocabulary,allowedOrigin,slug,publicIdentity,publicLink,identity,report,validate,visible,actionable});
})();
