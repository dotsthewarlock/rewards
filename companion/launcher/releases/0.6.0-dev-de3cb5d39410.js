(()=>{
"use strict";
const globalThis=Object.create(null);
/* Pure origin/campaign identity and exact public links. No DOM, data access or execution authority. */
(() => {
  'use strict';
  const origins = Object.freeze({
    'https://getmybonus.ca':'CA1126VANW',
    'https://prepaidrewards.ca':'CA1126PKIZ',
    'https://bonusrewards.ca':'CA1126DTZFT',
    'https://cardbonuses.com':'CA1126PZFT',
    'https://cardreward.ca':'CA1026CK1'
  });
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
  globalThis.RewardsIdentity=Object.freeze({origins,allowedOrigin,slug,publicIdentity,publicLink});
})();

/* Adapted from original InCommCore fingerprint/labels and frozen v15 PAGE.
 * Read-only. Fixed structural vocabulary: no raw values, arbitrary text, URLs or identifiers.
 * The same classic script loads in the isolated content world, worker and Node tests.
 */
(() => {
  'use strict';
  const {origins,allowedOrigin,slug,publicIdentity,publicLink}=globalThis.RewardsIdentity;
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
    'Gift Card Number','Card Number','PIN','Gift Card PIN','Card PIN',
    'Welcome!','Add your Code','Add your barcode','Where is my barcode?',
    'Zift Zillions of Gifts Have Fun','Petro Canada $10 eGift Card','Petro-Canada $10 eGift Card',
    'Enter your email','Enter email address where your code will be sent','Take a photo of your barcode',
    'Barcode Photo','Upload Photo','Choose File...','Cancel','Terms and Conditions',
    'Confirmation','Success','Congratulations!','Error','Close','Choisissez votre prime','Suivant','Retour','Soumettre']);
  const normalize=s=>typeof s==='string'?s.trim().toUpperCase():'';
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
    if(id.root)for(const el of [...id.root.querySelectorAll('button,input[type="submit"],input[type="button"],a,label,h1,h2,h3,h4,h5,h6,.title,[role="button"],[role="heading"],[role="option"]')].slice(0,limit)){
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

/* Frozen v15 origin/slug keys, strict reads and explicit cache edits. Never migrate, recover or write on mount. */
(() => {
  'use strict';
  const states=Object.freeze(['queued','processing','pending','complete','error','duplicate']);
  const key=(slug,name)=>'bs_rewards:'+slug+':'+name;
  // Adapted from v15 STORE, QUEUE.addCodes, and HIST.has. Strict reads do
  // not silently replace malformed data with an empty cache.
  const validSlug=slug=>typeof slug==='string'&&globalThis.RewardsIdentity.slug(slug)===slug;
  const barcode=code=>typeof code==='string'&&/^\d{30}$/.test(code);
  const last4=code=>barcode(code)?code.slice(-4):null;
  const count=x=>Number.isInteger(x)&&x>=0&&x<=999;
  function readRows(storage,slug,name){
    if(!validSlug(slug))throw Error('invalid-campaign');
    return decodeRows(storage.getItem(key(slug,name)));
  }
  function decodeRows(raw){
    const rows=raw===null?[]:JSON.parse(raw);
    if(!Array.isArray(rows)||rows.length>999||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('invalid-cache');
    return rows;
  }
  function summary(storage,slug){
    if(!globalThis.RewardsIdentity.slug(slug)||globalThis.RewardsIdentity.slug(slug)!==slug)
      return {ok:false,reason:'invalid-campaign'};
    try{
      const queue=readRows(storage,slug,'queue'),history=readRows(storage,slug,'history'),gifts=readRows(storage,slug,'giftcards');
      const counts=Object.fromEntries([...states,'other'].map(s=>[s,0]));
      for(const row of queue)counts[states.includes(row.state)?row.state:'other']++;
      const bool=name=>['1','true'].includes(storage.getItem(key(slug,name)));
      const activeRaw=storage.getItem(key(slug,'active'));
      let active=false;
      if(activeRaw!==null){
        const row=JSON.parse(activeRaw);
        if(!row||typeof row!=='object'||Array.isArray(row))throw Error('invalid-cache');
        active=true;
      }
      return {ok:true,queue:counts,history:history.length,rewards:gifts.length,
        emailConfigured:!!storage.getItem(key(slug,'email')),clipboard:bool('clipboard'),auto:bool('auto'),
        unresolved:active||counts.pending>0||counts.processing>0};
    }catch{return {ok:false,reason:'unreadable-cache'};}
  }
  function validate(input){
    if(!input||typeof input!=='object')return null;
    if(input.ok===false)return ['invalid-campaign','unreadable-cache'].includes(input.reason)?{ok:false,reason:input.reason}:null;
    const keys=['ok','queue','history','rewards','emailConfigured','clipboard','auto','unresolved'];
    if(input.ok!==true||Object.keys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k)))return null;
    const countKeys=[...states,'other'];
    const count=x=>Number.isInteger(x)&&x>=0&&x<=999;
    if(!input.queue||Object.keys(input.queue).length!==countKeys.length||countKeys.some(k=>!count(input.queue[k]))||
      countKeys.reduce((n,k)=>n+input.queue[k],0)>999||!count(input.history)||!count(input.rewards)||
      ['emailConfigured','clipboard','auto','unresolved'].some(k=>typeof input[k]!=='boolean'))return null;
    return {ok:true,queue:Object.fromEntries(countKeys.map(k=>[k,input.queue[k]])),history:input.history,rewards:input.rewards,
      emailConfigured:input.emailConfigured,clipboard:input.clipboard,auto:input.auto,unresolved:input.unresolved};
  }
  // Explicit export only. No migration, recovery, writes, or diagnostic records.
  const fields=Object.freeze(['cardMerchant','valueRecent','gcNumber','gcPin']);
  function exportRows(storage,slug){
    if(typeof slug!=='string'||globalThis.RewardsIdentity.slug(slug)!==slug)return {ok:false,reason:'invalid-campaign'};
    try{
      const rows=readRows(storage,slug,'giftcards');
      if(rows.some(row=>fields.some(k=>typeof row[k]!=='string'||row[k].length>4096)))throw Error('invalid-cache');
      return {ok:true,rows:rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))};
    }catch{return {ok:false,reason:'unreadable-cache'};}
  }
  function validateExport(input){
    if(input?.ok!==true||!Array.isArray(input.rows)||input.rows.length>999)return null;
    if(input.rows.some(row=>!row||Object.keys(row).length!==fields.length||fields.some(k=>typeof row[k]!=='string'||row[k].length>4096)))return null;
    return {ok:true,rows:input.rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))};
  }
  // Opaque selection binds an index to exact cache bytes for one document
  // Never persist the token or cache snapshot, or include either in diagnostics.
  const rewardSnapshots=new WeakMap();
  const selectionToken=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
  function rewardSnapshot(storage,slug,raw){
    let current=rewardSnapshots.get(storage);
    if(!current||current.slug!==slug||current.raw!==raw){
      current={slug,raw,token:crypto.randomUUID()};
      rewardSnapshots.set(storage,current);
    }
    return current.token;
  }
  function validSelection(snapshot,index){return selectionToken(snapshot)&&Number.isInteger(index)&&index>=0&&index<999;}
  function revealReward(storage,slug,snapshot,index){
    const failure={ok:false,reason:'stale-selection'};
    if(!validSlug(slug)||!validSelection(snapshot,index))return failure;
    try{
      const raw=storage.getItem(key(slug,'giftcards'));
      if(rewardSnapshot(storage,slug,raw)!==snapshot)return failure;
      const row=decodeRows(raw)[index];
      if(!row||fields.some(k=>typeof row[k]!=='string'||row[k].length>4096))return failure;
      return {ok:true,snapshot,index,row:Object.fromEntries(fields.map(k=>[k,row[k]]))};
    }catch{return failure;}
  }
  function validateReveal(input,snapshot,index){
    if(input?.ok!==true||Object.keys(input).length!==4||input.snapshot!==snapshot||input.index!==index||!validSelection(snapshot,index))return null;
    const row=input.row;
    if(!row||Object.keys(row).length!==fields.length||fields.some(k=>typeof row[k]!=='string'||row[k].length>4096))return null;
    return {ok:true,snapshot,index,row:Object.fromEntries(fields.map(k=>[k,row[k]]))};
  }
  // Masked view records are for the foreground workspace, never diagnostics.
  function details(storage,slug){
    try{
      const queue=readRows(storage,slug,'queue').map(r=>({last4:last4(r.code),state:states.includes(r.state)?r.state:'other'}));
      const history=readRows(storage,slug,'history').map(r=>({last4:last4(r.code)||(typeof r.last4==='string'&&/^\d{4}$/.test(r.last4)?r.last4:null)}));
      // Foreground view only: no full card number, PIN, source code or arbitrary note.
      const raw=storage.getItem(key(slug,'giftcards'));
      const rewards=decodeRows(raw).map(r=>({
        last4:typeof r.gcNumber==='string'&&/^[A-Za-z0-9 -]{8,128}$/.test(r.gcNumber)&&r.gcNumber.replace(/[ -]/g,'').length>=8?r.gcNumber.replace(/[ -]/g,'').slice(-4):null,
        value:typeof r.valueRecent==='string'&&/^\d{1,7}\.\d{2}$/.test(r.valueRecent)?r.valueRecent:null
      }));
      return {ok:true,queue,history,rewards,rewardSnapshot:rewardSnapshot(storage,slug,raw)};
    }catch{return {ok:false,reason:'unreadable-cache'};}
  }
  function validateDetails(input){
    const suffix=x=>x===null||(typeof x==='string'&&/^\d{4}$/.test(x));
    const rows=(value,keys)=>Array.isArray(value)&&count(value.length)&&value.every(r=>r&&typeof r==='object'&&Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k))&&suffix(r.last4));
    const rewards=input?.rewards;
    if(input?.ok!==true||Object.keys(input).length!==5||!selectionToken(input.rewardSnapshot)||!rows(input.queue,['last4','state'])||
       !rows(input.history,['last4'])||input.queue.some(r=>![...states,'other'].includes(r.state))||
       !Array.isArray(rewards)||!count(rewards.length)||rewards.some(r=>!r||Object.keys(r).length!==2||
       !(r.last4===null||typeof r.last4==='string'&&/^[A-Za-z0-9]{4}$/.test(r.last4))||
       !(r.value===null||typeof r.value==='string'&&/^\d{1,7}\.\d{2}$/.test(r.value))))return null;
    return {ok:true,queue:input.queue.map(r=>({last4:r.last4,state:r.state})),history:input.history.map(r=>({last4:r.last4})),rewards:rewards.map(r=>({last4:r.last4,value:r.value})),rewardSnapshot:input.rewardSnapshot};
  }
  function parseBarcodes(text){
    if(typeof text!=='string'||text.length>262144)throw Error('input-too-large');
    return text.match(/\b\d{30}\b/g)||[];
  }
  // Retain v15 hash-only history matching, including its exact fallback format.
  function legacyFallback(code){
    let h=2166136261;
    for(let i=0;i<code.length;i++){h^=code.charCodeAt(i);h=Math.imul(h,16777619);}
    return 'fallback_'+(h>>>0).toString(16)+'_'+code;
  }
  async function historyHash(code){
    try{
      if(typeof crypto!=='undefined'&&crypto.subtle){
        const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
        return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
      }
    }catch{}
    return legacyFallback(code);
  }
  async function historyMatches(history,code){
    const hash=await historyHash(code),fallback=legacyFallback(code);
    return {hash,rows:history.filter(row=>row.code===code||row.h===hash||row.h===fallback)};
  }
  function historyMatcher(history){
    const codes=new Set(history.filter(r=>barcode(r.code)).map(r=>r.code));
    const hashes=new Set(history.filter(r=>typeof r.h==='string').map(r=>r.h));
    return async code=>codes.has(code)||hashes.has(legacyFallback(code))||(hashes.size>0&&hashes.has(await historyHash(code)));
  }
  function readSnapshot(storage,slug,names){
    if(!validSlug(slug))throw Error('invalid-campaign');
    return Object.fromEntries(names.map(name=>[name,storage.getItem(key(slug,name))]));
  }
  function unchanged(storage,slug,raw){
    return Object.keys(raw).every(name=>storage.getItem(key(slug,name))===raw[name]);
  }
  function checkedWrite(storage,k,value){
    if(value===null)storage.removeItem(k);else storage.setItem(k,value);
    if(storage.getItem(k)!==value)throw Error('readback');
  }
  // Pure plan: exact strings and v15 duplicate/999 semantics. No IDs, timestamps,
  // merchant interactions, storage writes, or claim authorization.
  async function planQueueImport(queue,history,text){
    const candidates=parseBarcodes(text);
    const known=new Set(queue.filter(r=>r.state!=='error'&&barcode(r.code)).map(r=>r.code));
    const inHistory=historyMatcher(history);
    const additions=[];
    let queued=0,duplicates=0;
    for(const code of candidates.slice(0,Math.max(0,999-queue.length))){
      const historical=await inHistory(code);
      const duplicate=historical||known.has(code);
      additions.push({code,state:duplicate?'duplicate':'queued',note:historical?'Already in redemption history':duplicate?'Already in queue':''});
      known.add(code);
      if(duplicate)duplicates++;else queued++;
    }
    return {additions,queued,duplicates,overflow:candidates.length-additions.length,recognized:candidates.length};
  }
  async function previewImport(storage,slug,text){
    try{
      const queue=readRows(storage,slug,'queue'),history=readRows(storage,slug,'history');
      // Draft previews are non-mutating; do not authorize a subsequent write.
      const {queued,duplicates,overflow,recognized}=await planQueueImport(queue,history,text);
      return {ok:true,queued,duplicates,overflow,recognized};
    }catch{return {ok:false,reason:'import-unavailable'};}
  }
  function validatePreview(input){
    if(input?.ok!==true||Object.keys(input).length!==5||
       !['queued','duplicates','overflow','recognized'].every(k=>Number.isInteger(input[k])&&input[k]>=0&&input[k]<=9000)||
       input.queued+input.duplicates>999||input.queued+input.duplicates+input.overflow!==input.recognized)return null;
    const {queued,duplicates,overflow,recognized}=input;
    return {ok:true,queued,duplicates,overflow,recognized};
  }
  // Origin-scoped Web Lock shared by both new distributions. The frozen v15
  // does not participate in Web Locks: users must not run it concurrently.
  // Check its activity markers and compare the relevant raw cache before edits.
  const editLock='bs_rewards:companion:data-v1';
  const editReasons=Object.freeze(['context-changed','legacy-busy','edit-busy','lock-unavailable','invalid-input','unreadable-cache','cache-changed','edit-outcome-unknown']);
  const failEdit=reason=>({ok:false,reason});
  const normalizedEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())?value.trim():null;
  function validEdit(op,value){
    if(op==='importQueue')return typeof value==='string'&&value.length<=262144;
    if(op==='saveEmail')return normalizedEmail(value)!==null;
    if(op==='saveClipboard')return typeof value==='boolean';
    return false;
  }
  async function editCache(storage,locks,slug,op,value,contextValid){
    if(!validSlug(slug)||!validEdit(op,value)||typeof contextValid!=='function')return failEdit('invalid-input');
    if(!locks||typeof locks.request!=='function')return failEdit('lock-unavailable');
    let attempted=false;
    try{
      return await locks.request(editLock,{mode:'exclusive',ifAvailable:true},async lock=>{
        if(!lock)return failEdit('edit-busy');
        if(!contextValid())return failEdit('context-changed');
        const indexKey='bs_rewards:slug_index_v1';
        const field=op==='importQueue'?'queue':op==='saveEmail'?'email':'clipboard';
        const names=[...new Set(['queue','history','active','lock',field])];
        const keys=[...names.map(name=>key(slug,name)),indexKey];
        const raw=Object.fromEntries(keys.map(k=>[k,storage.getItem(k)]));
        const queue=decodeRows(raw[key(slug,'queue')]),history=decodeRows(raw[key(slug,'history')]);
        const occupied=name=>raw[key(slug,name)]!==null&&raw[key(slug,name)]!=='null';
        if(occupied('active')||occupied('lock')||queue.some(r=>['pending','processing'].includes(r.state)))return failEdit('legacy-busy');
        if(queue.some(r=>!states.includes(r.state)||!barcode(r.code)))return failEdit('unreadable-cache');
        const index=raw[indexKey]===null?[]:JSON.parse(raw[indexKey]);
        if(!Array.isArray(index)||index.some(s=>typeof s!=='string'||!globalThis.RewardsIdentity.slug(s)))return failEdit('unreadable-cache');
        let next,result={ok:true};
        if(op==='importQueue'){
          const plan=await planQueueImport(queue,history,value);
          const {queued,duplicates,overflow,recognized}=plan;
          result={ok:true,queued,duplicates,overflow,recognized};
          if(!plan.additions.length)return result;
          const now=Date.now();
          next=JSON.stringify([...queue,...plan.additions.map(r=>({id:crypto.randomUUID(),...r,created:now,updated:now}))]);
        }else next=op==='saveEmail'?normalizedEmail(value):value?'1':'0';
        if(!contextValid())return failEdit('context-changed');
        if(keys.some(k=>storage.getItem(k)!==raw[k]))return failEdit('cache-changed');
        // Register the slug first, preserving every existing entry. A partial
        // index-only update is harmless. Never roll back over another writer.
        const write=(k,v)=>{attempted=true;checkedWrite(storage,k,v);};
        if(!index.includes(slug))write(indexKey,JSON.stringify([...index,slug]));
        if(!contextValid()||names.some(name=>storage.getItem(key(slug,name))!==raw[key(slug,name)]))return failEdit(attempted?'edit-outcome-unknown':'cache-changed');
        write(key(slug,field),next);
        return result;
      });
    }catch{return failEdit(attempted?'edit-outcome-unknown':'unreadable-cache');}
  }
  function validateEdit(input,op){
    if(input?.ok===false&&Object.keys(input).length===2&&editReasons.includes(input.reason))return failEdit(input.reason);
    if(op==='importQueue')return validatePreview(input);
    return input?.ok===true&&Object.keys(input).length===1?{ok:true}:null;
  }
  globalThis.RewardsLegacy=Object.freeze({summary,validate,exportRows,validateExport,details,validateDetails,validSelection,revealReward,validateReveal,parseBarcodes,planQueueImport,previewImport,validatePreview,editLock,validEdit,editCache,validateEdit,key,barcode,validSlug,decodeRows,readSnapshot,unchanged,checkedWrite,historyHash,historyMatcher,historyMatches,normalizedEmail});
})();

/* Platform-neutral command vocabulary; response validators stay with their domain owners.
 * No transport, DOM or authority. The trusted transport always verifies sender and current target.
 */
(() => {
 'use strict';
 const workspaceType='companion.workspace',observationType='companion.observation';
 const content=Object.freeze({inspect:'companion.inspect',revealReward:'companion.revealReward',exportRewards:'companion.exportRewards',
  previewImport:'companion.previewImport',editCache:'companion.editCache',reconcileSuccess:'companion.reconcileSuccess',
  prepareFinal:'companion.prepareFinal',authorizeFinal:'companion.authorizeFinal',cancelFinal:'companion.cancelFinal'});
 const scoped=Object.freeze(Object.keys(content).filter(op=>op!=='inspect'));
 const extensionOnly=Object.freeze(['getCatalog','refreshCatalog','setDiagnostics','captureDiagnostics']);
 const operations=Object.freeze([...Object.keys(content),...extensionOnly,'exportDiagnostics']);
 const has=op=>typeof op==='string'&&operations.includes(op);
 const isScoped=op=>scoped.includes(op);
 const contentType=op=>Object.hasOwn(content,op)?content[op]:null;
 const isContentType=type=>Object.values(content).includes(type);
 const sameTarget=(a,b)=>!!a&&!!b&&a.origin===b.origin&&a.campaign===b.campaign&&a.documentToken===b.documentToken&&a.tabId===b.tabId;
 function message(op,fields={}){
  if(!has(op))throw Error('unsupported-command');
  return {...fields,type:workspaceType,op};
 }
 // A target epoch fences exact recognized root and stage replacement even
 // within the same document/URL. Token creation is supplied by the adapter.
 function contextEpoch(makeToken){
  let token=makeToken(),scope=null,initialized=false;
  function sync(id){
   const next=id?.status==='recognized'?[id.root,id.origin,id.campaign,id.stage]:null;
   const changed=initialized&&(scope===null?next!==null:next===null||scope.some((v,i)=>v!==next[i]));
   if(changed)token=makeToken();
   scope=next;initialized=true;return changed;
  }
  function reset(){token=makeToken();scope=null;initialized=false;}
  return Object.freeze({get token(){return token;},sync,reset});
 }
 globalThis.RewardsWorkspaceContract=Object.freeze({contextEpoch,workspaceType,observationType,operations,extensionOnly,has,isScoped,contentType,isContentType,sameTarget,message});
})();

/* One canonical campaign registry for classic and module consumers.
 * Historical R3 02/06 metadata; not live stock or compatibility proof.
 */
(() => {
  'use strict';
  const campaigns=Object.freeze([
 {id:'CA1126VANW',name:'Walmart Canada',origin:'https://getmybonus.ca',path:'/CA1126VANW/en',products:['$100 Vanilla prepaid card'],rewards:['Walmart eGift Card'],merchant:['Walmart'],cents:1500,purchase:'Nov 26–29, 2026',deadline:'Nov 30, 2026',observations:8,dialog:'Purchase location'},
 {id:'CA1126PKIZ',name:'On the Run / Parkland',origin:'https://prepaidrewards.ca',path:'/CA1126PKIZ',products:['$75 Vanilla Visa prepaid card'],rewards:['Zift Zillions of Gifts eGift Card'],merchant:['Zift Zillions of Gifts'],cents:1500,purchase:'Nov 20–Dec 7, 2026',deadline:'Dec 8, 2026',observations:14,dialog:'Purchased product'},
 {id:'CA1126DTZFT',name:'Dollar Tree',origin:'https://bonusrewards.ca',path:'/CA1126DTZFT',products:['$50 yellow Zift Have Fun gift card'],rewards:['Zift Zillions of Gifts eGift Card'],merchant:['Zift Zillions of Gifts'],cents:1000,purchase:'Nov 2–Dec 31, 2026',deadline:'Jan 2, 2027',observations:18,dialog:'Purchased product',note:'Avondale participation inferred, not confirmed. Total cap 3,000; remaining stock unknown.'},
 {id:'CA1126PZFT',name:'Petro-Canada',origin:'https://cardbonuses.com',path:'/CA1126PZFT',products:['$50 Zift Merry Christmas','$50 Zift Have Fun'],rewards:['Zift Have Fun eGift Card','Petro-Canada eGift Card'],merchant:['Zift Have Fun','Petro-Canada'],cents:1000,purchase:'Nov 17, 2026–Jan 12, 2027',deadline:'Jan 13, 2027',observations:21,dialog:'Purchased product and reward choice'}
].map(c=>Object.freeze({...c,products:Object.freeze(c.products),rewards:Object.freeze(c.rewards),merchant:Object.freeze(c.merchant)})));
  const byId=id=>campaigns.find(c=>c.id===id);
  function singleChoice(id,origin){
    const c=byId(id);
    if(!c||c.origin!==origin||c.products.length!==1||c.rewards.length!==1||c.merchant.length!==1||
       !Number.isSafeInteger(c.cents)||c.cents<=0)return null;
    return {product:c.products[0],reward:c.rewards[0],cardMerchant:c.merchant[0],valueRecent:(c.cents/100).toFixed(2)};
  }
  globalThis.RewardsCampaigns=Object.freeze({campaigns,byId,singleChoice});
})();

/* Shared v15-compatible transaction persistence. Fixture-verified before
 * integration. This module does not discover, click, fill or submit merchant
 * controls; the foreground adapter must bind the reviewed UI and native action.
 */
(() => {
  'use strict';
  const D=globalThis.RewardsIdentity,L=globalThis.RewardsLegacy;
  const schema='rewards.pending/1';
  const names=['queue','history','giftcards','active','lock','email'];
  const states=['queued','processing','pending','complete','error','duplicate'];
  const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
  const bounded=(s,n=200)=>typeof s==='string'&&s.length>0&&s.length<=n&&s===s.trim();
  const money=s=>typeof s==='string'&&/^\d+(?:\.\d{2})$/.test(s)&&Number(s)>0;
  const norm=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
  const fail=reason=>({ok:false,reason});
  function validReview(r){
    return !!r&&D.allowedOrigin(r.origin)&&D.origins[r.origin]===r.campaign&&uuid(r.documentToken)&&uuid(r.attemptId)&&
      bounded(r.queueId,128)&&L.barcode(r.code)&&bounded(r.product)&&bounded(r.reward)&&bounded(r.cardMerchant)&&money(r.valueRecent)&&
      typeof r.email==='string'&&L.normalizedEmail(r.email)===r.email&&r.terms===true;
  }
  function exactReview(r){
    const {origin,campaign,documentToken,attemptId,queueId,code,product,reward,cardMerchant,valueRecent,email,terms}=r;
    return {origin,campaign,documentToken,attemptId,queueId,code,product,reward,cardMerchant,valueRecent,email,terms};
  }
  const occupied=x=>x!==null&&x!=='null';
  function cache(storage,slug){
    const raw=L.readSnapshot(storage,slug,names);
    const queue=L.decodeRows(raw.queue),history=L.decodeRows(raw.history),gifts=L.decodeRows(raw.giftcards);
    if(queue.some(r=>!states.includes(r.state)||!L.barcode(r.code)))throw Error('invalid-cache');
    return {raw,queue,history,gifts};
  }
  function current(storage,slug,raw,contextValid,review){
    return contextValid(review)===true&&L.unchanged(storage,slug,raw);
  }
  function save(storage,slug,raw,name,value){
    const next=value===null?null:JSON.stringify(value);
    L.checkedWrite(storage,L.key(slug,name),next);
    raw[name]=next;
  }
  async function owned(locks,fn){
    if(!locks||typeof locks.request!=='function')return fail('lock-unavailable');
    try{return await locks.request(L.editLock,{mode:'exclusive',ifAvailable:true},lock=>lock?fn():fail('busy'));}
    catch{return fail('operation-unknown');}
  }
  // Call only from a new explicit final user authorization. No automatic
  // retries, no resume of persisted intent, and no callback before readback.
  async function startAttempt(storage,locks,review,contextValid,invokeOnce){
    if(!validReview(review)||typeof contextValid!=='function'||typeof invokeOnce!=='function')return fail('invalid-review');
    const r=Object.freeze(exactReview(review));
    return owned(locks,async()=>{
      let attempted=false;
      try{
        if(contextValid(r)!==true)return fail('context-changed');
        const {raw,queue,history,gifts}=cache(storage,r.campaign);
        if(occupied(raw.active)||occupied(raw.lock)||queue.some(row=>['pending','processing'].includes(row.state)))return fail('unresolved');
        const matches=queue.filter(row=>row.id===r.queueId);
        if(matches.length!==1||matches[0].code!==r.code||matches[0].state!=='queued'||raw.email!==r.email)return fail('review-changed');
        if(history.length>=999||gifts.length>=999)return fail('capacity');
        if(gifts.some(row=>row.sourceRedemptionCode===r.code)||await L.historyMatcher(history)(r.code))return fail('duplicate');
        if(queue.some(row=>row.id!==r.queueId&&row.code===r.code&&!['error','duplicate'].includes(row.state)))return fail('duplicate');
        if(!current(storage,r.campaign,raw,contextValid,r))return fail('context-changed');
        const ts=Date.now();
        // v15-compatible pending fields. "submitted" denotes conservative
        // possible submission from this point, not proof a click happened.
        const active={id:r.queueId,code:r.code,phase:'submitted',ts,schema,attempt:r};
        attempted=true;save(storage,r.campaign,raw,'active',active);
        if(!current(storage,r.campaign,raw,contextValid,r))return fail('pending-unknown');
        save(storage,r.campaign,raw,'queue',queue.map(row=>row.id===r.queueId?{...row,state:'pending',note:'Awaiting verified outcome',submitted:ts,updated:ts}:row));
        if(!current(storage,r.campaign,raw,contextValid,r))return fail('pending-unknown');
        // A synchronous native action supplied by the foreground adapter.
        // Any error/false result remains unresolved, never auto-requeued.
        return invokeOnce(r)===true?{ok:true,status:'pending'}:fail('pending-unknown');
      }catch{return fail(attempted?'pending-unknown':'unreadable-cache');}
    });
  }
  function giftKey(card){
    return norm(card.gcNumber).replace(/\s+/g,'').toUpperCase()+'|'+norm(card.gcPin).replace(/\s+/g,'').toUpperCase();
  }
  function validCard(card,r){
    return !!card&&card.sourceRedemptionCode===r.code&&norm(card.cardMerchant).toUpperCase()===norm(r.cardMerchant).toUpperCase()&&
      card.valueRecent===r.valueRecent&&bounded(card.gcNumber,512)&&bounded(card.gcPin,128);
  }
  function activeAttempt(raw){
    const a=JSON.parse(raw.active||'null');
    if(!a||a.schema!==schema||a.phase!=='submitted'||!validReview(a.attempt)||a.id!==a.attempt.queueId||a.code!==a.attempt.code)return null;
    return a.attempt;
  }
  // A masked selection for the foreground workspace only, not diagnostics.
  function pendingSelection(storage,slug){
    try{
      const r=activeAttempt({active:storage.getItem(L.key(slug,'active'))});
      return r?.campaign===slug?{attemptId:r.attemptId,last4:r.code.slice(-4)}:null;
    }catch{return null;}
  }
  // Explicit reconciliation of a visible, exact linked success. Recovery is
  // idempotent: gift -> history -> queue -> clear intent; never navigate.
  async function reconcileSuccess(storage,locks,target,attemptId,card,contextValid){
    if(!target||!D.allowedOrigin(target.origin)||D.origins[target.origin]!==target.campaign||!uuid(target.documentToken)||!uuid(attemptId)||typeof contextValid!=='function')return fail('invalid-target');
    const t=Object.freeze({origin:target.origin,campaign:target.campaign,documentToken:target.documentToken,attemptId});
    const observed=Object.freeze({cardMerchant:card?.cardMerchant,valueRecent:card?.valueRecent,gcNumber:card?.gcNumber,gcPin:card?.gcPin,sourceRedemptionCode:card?.sourceRedemptionCode});
    return owned(locks,async()=>{
      let attempted=false;
      try{
        if(contextValid(t)!==true)return fail('context-changed');
        const {raw,queue,history,gifts}=cache(storage,t.campaign);
        const r=activeAttempt(raw);
        if(!r||r.attemptId!==attemptId||r.origin!==t.origin||r.campaign!==t.campaign||occupied(raw.lock))return fail('unresolved');
        if(!validCard(observed,r))return fail('reward-mismatch');
        const matches=queue.filter(row=>row.id===r.queueId);
        if(matches.length!==1||matches[0].code!==r.code||!['pending','complete'].includes(matches[0].state)||
          queue.some(row=>row.id!==r.queueId&&['pending','processing'].includes(row.state)))return fail('queue-conflict');
        const k=giftKey(observed),sameGift=gifts.filter(row=>giftKey(row)===k),sameSource=gifts.filter(row=>row.sourceRedemptionCode===r.code);
        if(gifts.some(row=>row.key===k&&giftKey(row)!==k))return fail('reward-conflict');
        if(sameGift.length>1||sameSource.length>1||sameGift.some(row=>!validCard(row,r)||(row.key&&row.key!==k)||row.slug!==r.campaign)||sameSource.some(row=>giftKey(row)!==k))return fail('reward-conflict');
        const {hash,rows:matchedHistory}=await L.historyMatches(history,r.code);
        if(matchedHistory.length>1||matchedHistory.some(row=>row.giftKey!==k||(row.code&&row.code!==r.code)))return fail('history-conflict');
        if(matches[0].state==='complete'&&(!sameGift.length||!matchedHistory.length))return fail('queue-conflict');
        if((!sameGift.length&&gifts.length>=999)||(!matchedHistory.length&&history.length>=999))return fail('capacity');
         if(!current(storage,t.campaign,raw,contextValid,t))return fail('context-changed');
        const ts=Date.now();
        const write=(name,value)=>{
          if(!current(storage,t.campaign,raw,contextValid,t))throw Error('context-changed');
          attempted=true;save(storage,t.campaign,raw,name,value);
        };
        if(!sameGift.length)write('giftcards',[...gifts,{key:k,cardMerchant:norm(observed.cardMerchant),valueRecent:observed.valueRecent,gcNumber:norm(observed.gcNumber),gcPin:norm(observed.gcPin),sourceRedemptionCode:r.code,slug:r.campaign,ts}]);
        if(!matchedHistory.length)write('history',[...history,{h:hash,code:r.code,last4:r.code.slice(-4),ts,giftKey:k}]);
        if(matches[0].state!=='complete')write('queue',queue.map(row=>row.id===r.queueId?{...row,state:'complete',note:'Verified reward captured',updated:ts}:row));
        write('active',null);
        return {ok:true,status:'complete'};
      }catch{return fail(attempted?'capture-unknown':'unreadable-cache');}
    });
  }
  globalThis.RewardsTransactions=Object.freeze({validReview,exactReview,startAttempt,reconcileSuccess,pendingSelection});
})();

/* Adapted from v15 DOM.successGiftCard. Explicit read only, never used by
 * discovery/diagnostic collection. Explicit reconciliation only; no merchant actions.
 */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
  const norm=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
  const visibleText=el=>{
    if(!D.visible(el))return '';
    const walker=el.ownerDocument.createTreeWalker(el,4);
    const parts=[];
    let node,n=0;
    while((node=walker.nextNode())){
      if(++n>3000)throw Error('text-limit');
      if(D.visible(node.parentElement))parts.push(node.nodeValue);
    }
    return norm(parts.join(' '));
  };
  const fail=reason=>({ok:false,reason});
  const aliases=Object.freeze({'BONUS CODE':'number','GIFT CARD NUMBER':'number','CARD NUMBER':'number','CODE':'number','PIN':'pin','GIFT CARD PIN':'pin','CARD PIN':'pin'});
  function readSuccess(doc,expectedCode){
    if(!L.barcode(expectedCode))return fail('invalid-code');
    try{
      const id=D.identity(doc);
      if(id?.status!=='recognized'||id.stage!=='success'||!id.signals.successVisible)return fail('unrecognized-success');
      const roots=[...id.root.querySelectorAll('.confirmation-block')].filter(D.visible);
      if(roots.length!==1)return fail('ambiguous-confirmation');
      const root=roots[0],containers=[...root.querySelectorAll('.codes-container')].filter(D.visible);
      if(containers.length!==1)return fail('ambiguous-fields');
      const fields={},children=[...containers[0].children];
      for(let i=0;i<children.length;i++){
        const label=children[i];
        if(!label.classList.contains('title')||!D.visible(label))continue;
        const field=aliases[visibleText(label).replace(/:$/,'').toUpperCase()];
        if(!field)continue;
        if(Object.hasOwn(fields,field))return fail('ambiguous-fields');
        let value='';
        for(let j=i+1;j<children.length;j++){
          if(children[j].classList.contains('title'))break;
          if(children[j].classList.contains('text')&&D.visible(children[j])){value=visibleText(children[j]);break;}
        }
        fields[field]=value;
      }
      const form=root.closest('.redemption-form');
      const context=form&&id.root.contains(form)?form:id.root;
      const matches=[...visibleText(context).matchAll(/\bEligible\s+Card\s*:\s*(\d{30})\b/gi)].map(m=>m[1]);
      if(matches.length!==1||matches[0]!==expectedCode)return fail('eligible-card-mismatch');
      const product=visibleText(root.querySelector('.h5'));
      const cardMerchant=product.replace(/\s+E?GIFT\s*CARD.*$/i,'').trim()||norm(doc.body?.dataset?.project);
      const amounts=[...visibleText(root.querySelector('h3')).matchAll(/\$\s*(\d+(?:\.\d{1,2})?)(?![\d.])/g)];
      const amount=amounts.length===1?Number(amounts[0][1]):NaN;
      if(!cardMerchant||cardMerchant.length>200||!Number.isFinite(amount)||amount<=0||
        !fields.number||fields.number.length>512||!fields.pin||fields.pin.length>128)return fail('incomplete-reward');
      return {ok:true,card:{cardMerchant,valueRecent:amount.toFixed(2),gcNumber:fields.number,gcPin:fields.pin,sourceRedemptionCode:matches[0]}};
    }catch{return fail('unreadable-success');}
  }
  // Both distributions use this explicit action. Never auto-capture on mount,
  // infer an attempt from a visible card, or advance the merchant wizard.
  async function reconcileVisible(doc,storage,locks,target,attemptId,contextValid){
    const T=globalThis.RewardsTransactions;
    if(!T||typeof contextValid!=='function'||!target)return fail('reconciliation-blocked');
    try{
      const id=D.identity(doc),url=doc.location.href;
      if(id?.status!=='recognized'||id.stage!=='success'||id.origin!==target.origin||
        id.campaign!==target.campaign||!contextValid())return fail('context-changed');
      const activeKey=L.key(target.campaign,'active'),activeRaw=storage.getItem(activeKey);
      const active=JSON.parse(activeRaw||'null');
      const attempt=active?.attempt;
      if(!T.validReview(attempt)||attempt.attemptId!==attemptId||active.schema!=='rewards.pending/1'||attempt.origin!==target.origin||
        attempt.campaign!==target.campaign)return fail('reconciliation-blocked');
      const observed=readSuccess(doc,attempt.code);
      if(!observed.ok)return fail('reconciliation-blocked');
      const fingerprint=JSON.stringify(observed.card);
      const current=()=>{
        if(!contextValid()||doc.location.href!==url||storage.getItem(activeKey)!==activeRaw)return false;
        const now=D.identity(doc);
        if(now?.status!=='recognized'||now.stage!=='success'||now.root!==id.root||
          now.origin!==target.origin||now.campaign!==target.campaign)return false;
        const result=readSuccess(doc,attempt.code);
        return result.ok&&JSON.stringify(result.card)===fingerprint;
      };
      // Core verifies ownership, exact durable intent and source linkage again,
      // and checks this live fingerprint before each critical cache write.
      return await T.reconcileSuccess(storage,locks,target,attemptId,observed.card,current);
    }catch{return fail('reconciliation-blocked');}
  }
  globalThis.RewardsSuccess=Object.freeze({readSuccess,reconcileVisible});
})();

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
  globalThis.RewardsForeground=Object.freeze({prepareFinal});
})();


const campaigns=globalThis.RewardsCampaigns.campaigns;
const campaignById=globalThis.RewardsCampaigns.byId;
const money = cents => `CAD $${(cents/100).toFixed(2)}`;

const exportHeaders=Object.freeze(['Card Merchant','Value Recent','GC Number','GC PIN']);
function rewardRows(rows) {return rows.map(r=>[r.cardMerchant,r.valueRecent,r.gcNumber,r.gcPin]);}
function tsv(rows){return rewardRows(rows).map(r=>r.map(value=>String(value??'').replace(/[\t\r\n]+/g,' ').trim()).join('\t')).join('\n');}
function csv(rows){return [exportHeaders,...rewardRows(rows)].map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');}

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,{primary=false,disabled=false,extra='',cls=''}={})=>`<button type="button" class="${primary?'primary ':''}${cls}" data-action="${esc(action)}" ${disabled?'disabled':''} ${extra}>${esc(label)}</button>`;
const options=(values,selected)=>values.map((v,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(v)}</option>`).join('');
const check=(id,label,checked,disabled=false)=>`<label class="check"><input type="checkbox" id="${id}" ${checked?'checked':''} ${disabled?'disabled':''}>${esc(label)}</label>`;
const masked=s=>`•••• ${esc(s.slice(-4))}`;

const stateLabel={queued:'Ready',processing:'Processing',pending:'Pending',complete:'Complete',error:'Error',duplicate:'Duplicate',other:'Unknown'};
function workspaceRecordList(rows,index,action,history=false,rewards=false,revealedReward=null){
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


// Pure Queue presentation. Commands are handled by the shared controller.
function finalReviewView(reviewed,editing){
 if(!reviewed)return '';
 const r=reviewed.review;
 return '<section class="surface stack review-data"><h3>Review exact claim</h3><p><strong>Product:</strong> '+esc(r.product)+'</p><p><strong>Reward:</strong> '+esc(r.reward)+' · CAD $'+esc(r.valueRecent)+'</p><p><strong>Barcode:</strong> <span class="mono">'+esc(r.code)+'</span></p><p><strong>Email:</strong> '+esc(r.email)+'</p><p>Merchant terms are checked on the page. Confirm that you reviewed them and this is your eligible purchased product.</p>'+check('finalConfirmed','I confirm the exact claim details and merchant terms',reviewed.confirmed,editing)+button('Authorize reviewed claim','authorizeFinal',{primary:true,disabled:editing||!reviewed.confirmed,extra:'data-value="'+esc(r.attemptId)+'"'})+button('Cancel review','cancelFinal',{disabled:editing})+'</section>';
}

function workspaceQueueView({state,cp,draft='',preview=null,page=0,editing=false,reviewed=null}){
 const r=state?.report,summary=state?.summary,details=state?.details;
 let body='';
   body='<h2>Queue</h2><p>Legacy cache management and reviewed foreground claims. Development candidate; live compatibility unverified.</p>';
   if(summary?.ok)body+='<section class="surface"><p>'+summary.queue.queued+' ready · '+summary.queue.complete+' complete · '+summary.queue.pending+' pending</p><p>'+summary.queue.duplicate+' duplicates · '+summary.queue.error+' errors</p><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p>'+(summary.unresolved?'<p class="warning">Existing unresolved or active state. No replay or advancement.</p>':'')+'</section>';
   else if(summary?.ok===false)body+='<p class="warning">Legacy cache could not be safely read. No data changed.</p>';
   if(summary?.ok&&state?.target){
     if(r?.stage==='entry'&&!summary.unresolved&&summary.queue.queued>0&&summary.emailConfigured&&cp?.products.length===1&&cp.rewards.length===1){
       body+=reviewed?finalReviewView(reviewed,editing):'<section class="surface stack"><h3>Review merchant form</h3><p>Complete the native merchant steps and terms, leaving the final form visible. Do not submit separately. Unknown layouts and choices remain blocked.</p>'+button('Review final claim','prepareFinal',{primary:true,disabled:editing||r.controls.submit.actionable!==1})+'</section>';
     }
     if(r?.stage==='entry'&&cp&&(cp.products.length!==1||cp.rewards.length!==1))body+='<p class="warning">Multiple product or reward choices: this variant remains diagnostic-only for final claims. Queue import and saved data remain available.</p>';
     if(r?.stage==='success'&&summary.unresolved&&state.recovery)body+='<section class="surface stack"><h3>Unresolved reward</h3><p>Reviewed attempt ending '+esc(state.recovery.last4)+'. Inspect the matching merchant confirmation before capture. No claim will be submitted or advanced.</p>'+button('Capture matching reward','reconcileSuccess',{primary:true,disabled:editing,extra:'data-value="'+esc(state.recovery.attemptId)+'"'})+'</section>';
     body+='<section class="surface stack"><label for="importDraft">Redemption codes</label><textarea id="importDraft" maxlength="262144" autocomplete="off" spellcheck="false" placeholder="Paste 30-digit codes or receipt text">'+esc(draft)+'</textarea>'+'<div class="row">'+button('Paste from clipboard','pasteDraft',{disabled:editing})+button('Add to queue','addQueue',{primary:true,disabled:editing||summary.unresolved||!draft.trim()})+button('Preview','previewImport',{disabled:editing||!draft.trim()})+'</div><p class="muted">Close other v15 workspaces before editing. Adding codes never submits a claim.</p><p id="importResult" role="status">'+(preview?esc(preview):'')+'</p></section>';
     if(details?.ok)body+='<section class="surface"><h3>Existing queue</h3>'+(details.queue.length?workspaceRecordList(details.queue,page,'queuePage'):'<p>No queued records.</p>')+'</section>';
   }

 return body;
}


// Only masked records by default. The controller supplies one temporary reveal.
function workspaceRewardsView({state,browseTab='cards',browseSearch='',rewardPage=0,historyPage=0,revealedReward=null}){
 const summary=state?.summary,details=state?.details;
 let body='';
   body='<h2>Rewards</h2><p>'+(summary?.ok?summary.rewards+' legacy gift-card records · '+summary.history+' redemption history records':'No connected cache')+'</p><p>Pending claims are not counted as captured rewards. Existing legacy records are not independently verified. Reveal and export show private saved reward details. Reveal displays one current record for 30 seconds. Keep the workspace and exports private.</p>' + button('Download CSV','rewardCSV',{disabled:!summary?.rewards||!state?.target}) + button('Copy TSV','rewardTSV',{disabled:!summary?.rewards||!state?.target}) + '';
   if(details?.ok){
     const cards=browseTab==='cards',rows=cards?details.rewards.map((r,index)=>({...r,index})):details.history;
     const filtered=rows.filter(r=>!browseSearch||r.last4?.toUpperCase().includes(browseSearch.toUpperCase()));
     body+='<section class="surface stack"><div class="row" role="group" aria-label="Browse records">'+
       button('Saved rewards','browseTab',{extra:'data-value="cards" aria-pressed="'+cards+'"',primary:cards})+
       button('Redemption history','browseTab',{extra:'data-value="history" aria-pressed="'+!cards+'"',primary:!cards})+
       '</div><label for="browseSearch">Find by ending digits or characters</label><input id="browseSearch" type="text" maxlength="4" autocomplete="off" value="'+esc(browseSearch)+'"><p role="status">'+filtered.length+' of '+rows.length+' records</p>'+
       (filtered.length?workspaceRecordList(filtered,cards?rewardPage:historyPage,cards?'rewardPage':'historyPage',!cards,cards,revealedReward):'<p>No matching records.</p>')+'</section>';
   }

 return body;
}


// Catalog state is rendered, never retrieved or promoted to workflow authority.
function catalogView({recording,catalog,catalogBusy,catalogError,now}){
 if(!recording)return '<p>Public directory refresh requires the extension.</p>';
 const c=catalog;
 const restricted=c?.outcome==='restricted';
 const rateLimited=c?.outcome==='rate-limited',interrupted=c?.outcome==='checking';
 const age=now-Date.parse(c?.checkedAt);
 const current=!catalogBusy&&!catalogError&&c?.outcome==='verified-directory'&&age>=0&&age<=86400000;
 return '<section class="surface stack"><h3>Canadian public catalog</h3><p>Manual directory check only. No claims, verified terms or stock inferred.</p>'+
 button('Refresh public directory','refreshCatalog',{disabled:catalogBusy||restricted||rateLimited||interrupted})+
 '<p role="status">'+esc(catalogBusy?'Checking…':catalogError?'Catalog unavailable; prior evidence retained.':restricted?'Access restricted. Further checks stopped.':rateLimited?'Rate limited. Further checks stopped.':interrupted?'Previous check interrupted or unverified. Further checks stopped.':c?.checkedAt?(current?'Directory checked ':'Stale or unavailable · last check ')+c.checkedAt:'Not yet checked')+'</p>'+
 (c?.entries?.length?'<ul class="list">'+c.entries.map(e=>'<li><strong>'+esc(e.campaign)+'</strong><p>'+esc(current&&e.listed?'Listed at last check':'Previously seen · stale')+' · Terms, availability and workflow compatibility unknown</p><p>Last seen: '+esc(e.lastSeen)+'</p></li>').join('')+'</ul>':'<p>No observed identities stored.</p>')+
 '<a href="https://getmybonus.ca/" target="_blank" rel="noopener noreferrer">Official directory</a></section>';
}

function workspaceCampaignsView({cp,recording=true,catalog=null,catalogBusy=false,catalogError=false,now=Date.now()}){
 let body='';
   body='<h2>Campaigns</h2>'+(cp?'<section class="surface"><strong>'+esc(cp.name)+'</strong><p>'+esc(cp.products.join(' / '))+'</p><p>'+esc(cp.rewards.join(' / '))+'</p><p>Published claim deadline: '+esc(cp.deadline)+'</p>'+(cp.note?'<p>'+esc(cp.note)+'</p>':'')+'</section>':'<p>No recognized campaign metadata.</p>')+'<p>Recognition is structural evidence only, not verified eligibility or stock.</p>'+catalogView({recording,catalog,catalogBusy,catalogError,now});

 return body;
}


function workspaceSettingsView({state,emailDraft='',editing=false,recording=true}){
 const r=state?.report,summary=state?.summary;
 let body='';
   body='<h2>Settings</h2>';
   if(summary?.ok&&state?.target)body+='<section class="surface stack"><h3>Legacy preferences</h3><p>Email '+(summary.emailConfigured?'saved':'not configured')+'</p><label for="emailDraft">New redemption email</label><input id="emailDraft" type="email" maxlength="254" autocomplete="off" value="'+esc(emailDraft)+'">'+button('Save email','saveEmail',{disabled:editing||summary.unresolved||!emailDraft.trim()})+check('clipboardPreference','Saved clipboard preference',summary.clipboard,editing||summary.unresolved)+'<p class="muted">Preferences do not authorize claims. Keep legacy v15 closed while editing.</p></section>';
   if(r?.controls)body+='<section class="surface stack"><h3>Current structural evidence</h3><p>Observed counts only; not proof of eligibility or compatibility.</p><ul class="list">'+[['Form','form'],['Barcode field','serial'],['Active step','activeStep'],['Submit controls','submit']].filter(([,key])=>r.controls[key]).map(([name,key])=>'<li><strong>'+esc(name)+'</strong><p>'+r.controls[key].present+' present · '+r.controls[key].visible+' visible · '+r.controls[key].actionable+' actionable</p></li>').join('')+'</ul></section>';
   body+='<section class="surface stack"><h3>Diagnostics</h3>'+(recording?check('diagnosticsEnabled','Record sanitized structural observations',!!state?.diagnostics?.enabled)+'<p>'+(state?.diagnostics?.count||0)+'/500 distinct records · '+(state?.diagnostics?.eventCount||0)+'/2000 events</p>'+(state?.diagnostics?.blocked?'<p class="warning">Recording paused: retention limit or invalid existing records. Export valid records; existing storage is preserved.</p>':'') +button('Capture current evidence','captureDiagnostics',{disabled:!state?.target||!state?.diagnostics?.enabled||!!state?.diagnostics?.blocked})+'<p class="muted">No automatic deletion. Turning recording off retains earlier observations.</p>':'<p>Current document only. Background recording requires the extension.</p>')+button('Export diagnostics','export',{disabled:!state?.diagnostics?.count})+'<p>Read-only, scoped to recognized pages. No credentials, raw text or full URLs. Evidence is structural, not verified live eligibility.</p></section>';
 return body;
}









// Platform-neutral workspace. The transport owns identity, persistence and authorization.
function mountWorkspace(root,request,{recording=true}={}){
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
const {sameTarget}=globalThis.RewardsWorkspaceContract;
const alive=()=>!root.host||root.host.isConnected;
function discardReview(){
 const old=reviewed;reviewed=null;
 if(old)Promise.resolve(request('cancelFinal',{target:old.target,attemptId:old.review.attemptId})).catch(()=>{});
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
function render(){
 const focus=root.activeElement;
 const field=['importDraft','emailDraft','browseSearch'].includes(focus?.id)?focus.id:null;
 const selection=['importDraft','browseSearch'].includes(field)?[focus.selectionStart,focus.selectionEnd]:null;
 const action=focus?.dataset?.action,value=focus?.dataset?.value;
 const r=state?.report,cp=campaignById(r?.campaign);
 $('context').innerHTML='<section class="surface"><strong>'+esc(cp?.name||'No recognized campaign')+'</strong><p>'+esc(r? r.status+' · '+r.stage : state?.ok===false?'Connection unavailable':'Open a supported merchant tab')+'</p></section>';
 $('navigation').innerHTML=['queue','rewards','campaigns','settings'].map(x=>button(x[0].toUpperCase()+x.slice(1),'navigate',{extra:'data-value="'+x+'" '+(screen===x?'aria-current="page"':'')})).join('');
 const body=screen==='queue'?workspaceQueueView({state,cp,draft,preview,page,editing,reviewed}):
   screen==='rewards'?workspaceRewardsView({state,browseTab,browseSearch,rewardPage,historyPage,revealedReward}):
   screen==='campaigns'?workspaceCampaignsView({cp,recording,catalog,catalogBusy,catalogError}):
   workspaceSettingsView({state,emailDraft,editing,recording});
 $('workspace').innerHTML='<section class="stack">'+body+button('Refresh connection','refresh')+'</section>';
 if(field&&$(field)){const el=$(field);el.focus({preventScroll:true});if(selection)el.setSelectionRange(...selection);}
 else if(action){
   const next=[...root.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.value===value&&!el.disabled);
   if(next)next.focus({preventScroll:true});else $('workspace').focus({preventScroll:true});
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

// Generated into a self-contained bookmarklet; this adapter is page-world only.
// Explicit foreground review only; no passive recording or remote code loading.
function launchBookmarklet(markup,css){
 const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy,W=globalThis.RewardsWorkspaceContract;
 if(window.top!==window||!D.allowedOrigin(location.origin))return;
 const existing=document.getElementById('rewards-companion-dev');
 if(existing){if(existing.dataset.rewardsCompanion==='read-only'){existing.dispatchEvent(new Event('rewards-companion-close'));existing.remove();}return;}
 const host=document.createElement('section');
 host.id='rewards-companion-dev';host.dataset.rewardsCompanion='read-only';
 host.setAttribute('aria-label','Rewards Companion development workspace');
 const root=host.attachShadow({mode:'open'}),style=document.createElement('style');
 style.textContent=css;
 const shell=document.createElement('div');shell.className='shell';shell.innerHTML=markup;
 const close=document.createElement('button');close.type='button';close.textContent='Close workspace';
 close.addEventListener('click',()=>{host.dispatchEvent(new Event('rewards-companion-close'));host.remove();});shell.prepend(close);
 root.append(style,shell);document.body.append(host);
 const epoch=W.contextEpoch(()=>crypto.randomUUID());let prepared=null;
 const clearPrepared=()=>{prepared?.cancel();prepared=null;};
 host.addEventListener('rewards-companion-close',clearPrepared);
 close.addEventListener('click',clearPrepared);
 window.addEventListener('pagehide',()=>{host.dispatchEvent(new Event('rewards-companion-close'));host.remove();},{once:true});
 const syncContext=()=>{const id=D.identity(document);if(epoch.sync(id))clearPrepared();return id;};
 const inspect=()=>{
   syncContext();const report=D.report(document),recognized=report?.status==='recognized';
   const target=recognized?{origin:report.origin,campaign:report.campaign,documentToken:epoch.token}:null;
   return {ok:true,report,target,summary:recognized?L.summary(localStorage,report.campaign):null,details:recognized?L.details(localStorage,report.campaign):null,recovery:recognized&&report.stage==='success'?globalThis.RewardsTransactions.pendingSelection(localStorage,report.campaign):null,diagnostics:{enabled:false,count:recognized?1:0}};
 };
 const request=async(op,fields={})=>{
   if(!host.isConnected)return {ok:false,reason:'workspace-closed'};
   const current=inspect();
   if(op==='inspect')return current;
   if(W.isScoped(op)){
     const t=fields.target,c=current.target;
     if(!W.sameTarget(t,c))return {ok:false,reason:'context-changed'};
     if(op==='prepareFinal'){
       clearPrepared();
       const valid=()=>host.isConnected&&!!syncContext()&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
       const binding=globalThis.RewardsForeground.prepareFinal(document,localStorage,navigator.locks,c,valid);
       if(!binding.ok)return binding;
       prepared=binding;
       return {ok:true,review:binding.review};
     }
     if(op==='cancelFinal'){if(prepared?.review.attemptId===fields.attemptId)clearPrepared();return {ok:true};}
     if(op==='authorizeFinal'){
       if(fields.confirmed!==true||!prepared||prepared.review.attemptId!==fields.attemptId)return {ok:false,reason:'review-expired'};
       const binding=prepared;prepared=null;
       return binding.authorize();
     }
     if(op==='revealReward')return L.revealReward(localStorage,c.campaign,fields.snapshot,fields.index);
     if(op==='exportRewards')return L.exportRows(localStorage,c.campaign);
     if(op==='reconcileSuccess'){
       const current=()=>host.isConnected&&!!syncContext()&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp');
       return globalThis.RewardsSuccess.reconcileVisible(document,localStorage,navigator.locks,c,fields.attemptId,current);
     }
     if(op==='editCache'){
       clearPrepared();
       const current=()=>{
         const now=syncContext();
         return host.isConnected&&epoch.token===c.documentToken&&document.visibilityState==='visible'&&!document.getElementById('bsp')&&now?.status==='recognized'&&now.origin===c.origin&&now.campaign===c.campaign;
       };
       return L.editCache(localStorage,navigator.locks,c.campaign,fields.edit,fields.value,current);
     }
     const result=await L.previewImport(localStorage,c.campaign,fields.text);
     const now=inspect().target;
     return host.isConnected&&now?.origin===c.origin&&now?.campaign===c.campaign&&now?.documentToken===c.documentToken?result:{ok:false,reason:'context-changed'};
   }
   if(op==='exportDiagnostics'&&current.target)return {ok:true,export:{schema:'rewards.structural-export/1',provenance:{distribution:'bookmarklet',scope:'current-document',evidence:'structural-only',exportedAt:new Date().toISOString()},records:[{at:new Date().toISOString(),report:current.report}]}};
   return {ok:false,reason:'unsupported-command'};
 };
 mountWorkspace(root,request,{recording:false});
}

launchBookmarklet("<header><h1>Rewards Companion</h1><p class=\"demo\">V0.6 development candidate · Foreground review</p><div id=\"context\"></div></header><nav id=\"navigation\" aria-label=\"Workspace\"></nav><main id=\"workspace\" tabindex=\"-1\"></main><p id=\"announcement\" role=\"status\" aria-live=\"polite\"></p><footer>Development candidate: synthetic acceptance only; do not use live without separate authorization. Use only one companion generation at a time.</footer>",":host {color-scheme:light;--surface:#faf8ff;--container:#eeedf5;--high:#e3e3ed;--text:#191b23;--muted:#444754;--primary:#2756a0;--on-primary:#fff;--selected:#d8e3ff;--on-selected:#102d60;--outline:#6d707e;--error:#a51b24;--error-bg:#ffdadc;--on-error:#6d0a13;--success:#16613c;--focus:#2756a0;--radius:16px;font:14px/1.5 system-ui,sans-serif}\n@media(prefers-color-scheme:dark){:host:not([data-theme=light]){color-scheme:dark;--surface:#15171f;--container:#222530;--high:#303441;--text:#e7e9f3;--muted:#c3c6d4;--primary:#b0c6ff;--on-primary:#002b62;--selected:#324a78;--on-selected:#e3eaff;--outline:#a1a5b6;--error:#ffb4bb;--error-bg:#75232b;--on-error:#fff1f1;--success:#8ddbaf;--focus:#b0c6ff}}\n:host[data-theme=dark]{color-scheme:dark;--surface:#15171f;--container:#222530;--high:#303441;--text:#e7e9f3;--muted:#c3c6d4;--primary:#b0c6ff;--on-primary:#002b62;--selected:#324a78;--on-selected:#e3eaff;--outline:#a1a5b6;--error:#ffb4bb;--error-bg:#75232b;--on-error:#fff1f1;--success:#8ddbaf;--focus:#b0c6ff}\n\n*{box-sizing:border-box}.shell{margin:0;color:var(--text);background:var(--surface);overflow-wrap:anywhere}header,main,footer,#announcement{padding:12px 16px}header{padding-bottom:4px}h1{font-size:22px;margin:0;font-weight:600}h2{font-size:20px;margin:0 0 8px}h3{font-size:16px;margin:0 0 8px}p{margin:4px 0}small,.muted{color:var(--muted);font-size:13px}.demo{font-size:12px;color:var(--muted);font-weight:600}nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;padding:4px 8px;border-bottom:1px solid var(--outline)}nav button{font-size:12px;padding:6px 2px;border:0;border-radius:12px;background:transparent;min-width:0}nav button[aria-current=page]{background:var(--selected);color:var(--on-selected);font-weight:650}button,select,input,textarea{font:inherit;color:inherit;max-width:100%;min-width:0}button,select,input:not([type=checkbox]),textarea{min-height:48px}button{cursor:pointer;border:1px solid var(--outline);border-radius:24px;background:transparent;padding:8px 14px;font-weight:550}button.primary{background:var(--primary);color:var(--on-primary);border-color:transparent}button.text{border:0;color:var(--primary);padding:8px}button:disabled{opacity:.55;cursor:not-allowed}button:hover:not(:disabled){box-shadow:inset 0 0 0 100px #80808014}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}input:not([type=checkbox]),textarea,select{width:100%;background:var(--surface);border:1px solid var(--outline);border-radius:8px;padding:8px 12px}textarea{resize:vertical;min-height:76px}label{display:block;font-weight:550;margin:4px 0}label.check{display:flex;gap:12px;align-items:center;min-height:48px;margin:0}input[type=checkbox]{width:24px;height:24px;flex:none;accent-color:var(--primary)}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.row>*{min-width:0}.grow{flex:1 1 130px}.spread{justify-content:space-between}.stack{display:grid;gap:12px}.surface{background:var(--container);padding:12px;border-radius:var(--radius)}.warning{background:var(--error-bg);color:var(--on-error);padding:12px;border-radius:12px}.status{font-weight:600}.ok{color:var(--success)}.full{width:100%}.mono{font-family:ui-monospace,monospace;overflow-wrap:anywhere}.list{list-style:none;padding:0;margin:0}.list li{padding:8px 0;border-bottom:1px solid var(--outline);min-height:48px}.list li:last-child{border-bottom:0}progress{width:100%;height:8px;accent-color:var(--primary)}summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font-weight:600}details{border-top:1px solid var(--outline);padding:4px 0}.details-body{padding:8px 0}.inline{display:inline}.subhead{font-weight:600;color:var(--muted)}#announcement{font-size:13px;min-height:44px;margin:0;color:var(--muted)}footer{border-top:1px solid var(--outline);font-size:12px;color:var(--muted)}.shell.bottom{display:flex;flex-direction:column;min-height:100dvh}.shell.bottom nav{order:4;border-top:1px solid var(--outline);border-bottom:0}.shell.bottom footer{order:5}.shell.bottom main{flex:1}.shell.bottom #announcement{order:3}dialog{max-width:calc(100% - 32px);width:360px;background:var(--surface);color:var(--text);border:1px solid var(--outline);border-radius:20px;padding:20px}dialog::backdrop{background:#0007}.error{color:var(--error)}@media(max-width:340px){header,main,footer,#announcement{padding-inline:12px}nav{padding-inline:4px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}\n\n.review-data{overflow-wrap:anywhere;min-width:0}.review-data .mono{white-space:normal;overflow-wrap:anywhere}\n\n.stack{grid-template-columns:minmax(0,1fr)}.stack>*{min-width:0}.mono{overflow-wrap:anywhere}\n\n/* Links and replacement-focus targets use the same verified semantic tokens. */\na{color:var(--primary);text-decoration:underline}a:focus-visible,main:focus-visible{outline:3px solid var(--focus);outline-offset:2px}textarea::placeholder,input::placeholder{color:var(--muted);opacity:1}\n\n:host{all:initial;position:fixed!important;right:8px!important;top:8px!important;width:min(420px,calc(100vw - 16px))!important;max-height:calc(100vh - 16px)!important;overflow:auto!important;z-index:2147483647!important;display:block!important;background:var(--surface);color:var(--text);border:1px solid var(--outline);border-radius:16px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 20px #0004}:host .shell{padding-top:4px}:host .shell>button{margin-left:12px}");
})();