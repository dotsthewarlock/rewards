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
  // Queue removal is a separate, ephemeral review of exact origin-local evidence.
  // Neither the raw snapshot nor full codes leave this core.
  const removalNames=['queue','history','giftcards','active','lock'];
  const queueSnapshots=new WeakMap(),removalReviews=new WeakMap();
  const sameRaw=(a,b)=>removalNames.every(k=>a[k]===b[k]);
  const occupied=value=>value!==null&&value!=='null';
  const shaHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const knownHash=value=>shaHash(value)||typeof value==='string'&&/^fallback_[a-f0-9]{1,8}_\d{30}$/.test(value)&&legacyFallback(value.slice(-30))===value;
  function queueSnapshot(storage,slug,scope,raw){
    let entry=queueSnapshots.get(storage);
    if(!entry||entry.slug!==slug||entry.scope!==scope||!sameRaw(entry.raw,raw)){
      entry={slug,scope,raw,token:crypto.randomUUID()};
      queueSnapshots.set(storage,entry);removalReviews.delete(storage);
    }
    return entry.token;
  }
  function removalBlock(raw,queue,history,gifts){
    if(occupied(raw.lock))return 'locked';
    if(occupied(raw.active))return 'active';
    if(queue.some(r=>r.state==='pending'))return 'pending';
    if(queue.some(r=>r.state==='processing'))return 'processing';
    if(queue.some(r=>!states.includes(r.state)||!barcode(r.code))||
       history.some(r=>!(barcode(r.code)||knownHash(r.h))||(Object.hasOwn(r,'code')&&!barcode(r.code))||(Object.hasOwn(r,'h')&&!knownHash(r.h)))||
       gifts.some(r=>!barcode(r.sourceRedemptionCode)))return 'ambiguous';
    return null;
  }
  // The exact original v15 and Companion new-import shape only. Previously
  // attempted, duplicate, completed, requeued or extended rows are retained.
  const freshFields=['id','code','state','note','created','updated'];
  function pristine(row){
    return row.state==='queued'&&row.note===''&&barcode(row.code)&&
      (selectionToken(row.id)||typeof row.id==='string'&&/^\d{1,16}_[a-z0-9]{1,32}$/.test(row.id))&&
      Object.keys(row).length===freshFields.length&&freshFields.every(k=>Object.hasOwn(row,k))&&
      Number.isSafeInteger(row.created)&&row.created>=0&&Number.isSafeInteger(row.updated)&&row.updated===row.created;
  }
  async function eligibleRemoval(queue,history,gifts,index){
    const rows=[];
    for(let i=0;i<queue.length;i++){
      const row=queue[i];
      if((index!==null&&index!==i)||!pristine(row)||
         queue.some((r,j)=>j!==i&&(r.id===row.id||r.code===row.code))||
         gifts.some(r=>r.sourceRedemptionCode===row.code))continue;
      if(history.length){
        const match=await historyMatches(history,row.code);
        // SHA-only records cannot be excluded using a fallback digest.
        if(history.some(r=>shaHash(r.h))&&!shaHash(match.hash))throw Error('unverified-history');
        if(match.rows.length)continue;
      }
      rows.push({index:i,last4:row.code.slice(-4)});
    }
    return rows;
  }
  // Masked view records are for the foreground workspace, never diagnostics.
  function details(storage,slug,scope=null){
    try{
      const evidence=readSnapshot(storage,slug,removalNames);
      const queueRows=decodeRows(evidence.queue),historyRows=decodeRows(evidence.history),giftRows=decodeRows(evidence.giftcards);
      const queue=queueRows.map(r=>({last4:last4(r.code),state:states.includes(r.state)?r.state:'other'}));
      const history=historyRows.map(r=>({last4:last4(r.code)||(typeof r.last4==='string'&&/^\d{4}$/.test(r.last4)?r.last4:null)}));
      // Foreground view only: no full card number, PIN, source code or arbitrary note.
      const raw=evidence.giftcards;
      const rewards=giftRows.map(r=>({
        last4:typeof r.gcNumber==='string'&&/^[A-Za-z0-9 -]{8,128}$/.test(r.gcNumber)&&r.gcNumber.replace(/[ -]/g,'').length>=8?r.gcNumber.replace(/[ -]/g,'').slice(-4):null,
        value:typeof r.valueRecent==='string'&&/^\d{1,7}\.\d{2}$/.test(r.valueRecent)?r.valueRecent:null
      }));
      return {ok:true,queue,history,rewards,rewardSnapshot:rewardSnapshot(storage,slug,raw),queueSnapshot:queueSnapshot(storage,slug,scope,evidence),queueBlock:removalBlock(evidence,queueRows,historyRows,giftRows)};
    }catch{queueSnapshots.delete(storage);removalReviews.delete(storage);return {ok:false,reason:'unreadable-cache'};}
  }
  function validateDetails(input){
    const suffix=x=>x===null||(typeof x==='string'&&/^\d{4}$/.test(x));
    const rows=(value,keys)=>Array.isArray(value)&&count(value.length)&&value.every(r=>r&&typeof r==='object'&&Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k))&&suffix(r.last4));
    const rewards=input?.rewards;
    if(input?.ok!==true||Object.keys(input).length!==7||!selectionToken(input.rewardSnapshot)||!selectionToken(input.queueSnapshot)||![null,'locked','active','pending','processing','ambiguous'].includes(input.queueBlock)||!rows(input.queue,['last4','state'])||
       !rows(input.history,['last4'])||input.queue.some(r=>![...states,'other'].includes(r.state))||
       !Array.isArray(rewards)||!count(rewards.length)||rewards.some(r=>!r||Object.keys(r).length!==2||
       !(r.last4===null||typeof r.last4==='string'&&/^[A-Za-z0-9]{4}$/.test(r.last4))||
       !(r.value===null||typeof r.value==='string'&&/^\d{1,7}\.\d{2}$/.test(r.value))))return null;
    return {ok:true,queue:input.queue.map(r=>({last4:r.last4,state:r.state})),history:input.history.map(r=>({last4:r.last4})),rewards:rewards.map(r=>({last4:r.last4,value:r.value})),rewardSnapshot:input.rewardSnapshot,queueSnapshot:input.queueSnapshot,queueBlock:input.queueBlock};
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
  const editReasons=Object.freeze(['context-changed','legacy-busy','edit-busy','lock-unavailable','invalid-input','unreadable-cache','cache-changed','edit-outcome-unknown','stale-selection','removal-not-safe']);
  const failEdit=reason=>({ok:false,reason});
  const normalizedEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())?value.trim():null;
  function validEdit(op,value){
    if(op==='importQueue')return typeof value==='string'&&value.length<=262144;
    if(op==='saveEmail')return normalizedEmail(value)!==null;
    if(op==='saveClipboard')return typeof value==='boolean';
    const record=value&&typeof value==='object'&&!Array.isArray(value);
    if(op==='previewRemoval')return !!record&&Object.keys(value).length===2&&selectionToken(value.snapshot)&&(value.index===null||validSelection(value.snapshot,value.index));
    if(op==='removeQueue')return !!record&&Object.keys(value).length===2&&selectionToken(value.token)&&value.confirmed===true;
    if(op==='cancelRemoval')return !!record&&Object.keys(value).length===1&&selectionToken(value.token);
    return false;
  }
  async function editCache(storage,locks,slug,op,value,contextValid,scope=null){
    if(!validSlug(slug)||!validEdit(op,value)||typeof contextValid!=='function')return failEdit('invalid-input');
    const selected=removalReviews.get(storage);
    const matches=selected&&selected.slug===slug&&selected.scope===scope&&selected.token===value?.token;
    if(op==='cancelRemoval'){
      if(matches)removalReviews.delete(storage);
      return {ok:true};
    }
    if(op==='removeQueue'&&!matches)return failEdit('stale-selection');
    // One-shot confirmation, including failure. A new review is required.
    removalReviews.delete(storage);
    if(!locks||typeof locks.request!=='function')return failEdit('lock-unavailable');
    let attempted=false;
    try{
      return await locks.request(editLock,{mode:'exclusive',ifAvailable:true},async lock=>{
        if(!lock)return failEdit('edit-busy');
        if(!contextValid())return failEdit('context-changed');
        if(op==='previewRemoval'||op==='removeQueue'){
          const raw=readSnapshot(storage,slug,removalNames);
          const queue=decodeRows(raw.queue),history=decodeRows(raw.history),gifts=decodeRows(raw.giftcards);
          const block=removalBlock(raw,queue,history,gifts);
          if(block)return failEdit(block==='ambiguous'?'removal-not-safe':'legacy-busy');
          if(op==='previewRemoval'){
            if(queueSnapshot(storage,slug,scope,raw)!==value.snapshot)return failEdit('stale-selection');
            const rows=await eligibleRemoval(queue,history,gifts,value.index);
            if(!contextValid())return failEdit('context-changed');
            if(!unchanged(storage,slug,raw))return failEdit('cache-changed');
            if(!rows.length)return failEdit('removal-not-safe');
            const token=crypto.randomUUID();
            removalReviews.set(storage,{slug,scope,token,raw,indices:rows.map(r=>r.index)});
            return {ok:true,token,rows,retained:queue.length-rows.length};
          }
          if(!sameRaw(selected.raw,raw))return failEdit('stale-selection');
          const indices=new Set(selected.indices);
          const next=JSON.stringify(queue.filter((_,i)=>!indices.has(i)));
          if(!contextValid())return failEdit('context-changed');
          if(!unchanged(storage,slug,raw))return failEdit('cache-changed');
          attempted=true;checkedWrite(storage,key(slug,'queue'),next);
          if(!contextValid()||!unchanged(storage,slug,{...raw,queue:next}))return failEdit('edit-outcome-unknown');
          return {ok:true,removed:indices.size};
        }
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
    if(op==='previewRemoval'){
      if(input?.ok!==true||Object.keys(input).length!==4||!selectionToken(input.token)||!Array.isArray(input.rows)||
         !input.rows.length||!count(input.rows.length)||!count(input.retained)||input.rows.length+input.retained>999||
         input.rows.some((r,i)=>!r||Object.keys(r).length!==2||!validSelection(input.token,r.index)||
           typeof r.last4!=='string'||!/^\d{4}$/.test(r.last4)||(i>0&&r.index<=input.rows[i-1].index)))return null;
      return {ok:true,token:input.token,rows:input.rows.map(r=>({index:r.index,last4:r.last4})),retained:input.retained};
    }
    if(op==='removeQueue')return input?.ok===true&&Object.keys(input).length===2&&count(input.removed)&&input.removed>0?{ok:true,removed:input.removed}:null;
    return input?.ok===true&&Object.keys(input).length===1?{ok:true}:null;
  }
  globalThis.RewardsLegacy=Object.freeze({summary,validate,exportRows,validateExport,details,validateDetails,validSelection,revealReward,validateReveal,parseBarcodes,planQueueImport,previewImport,validatePreview,editLock,validEdit,editCache,validateEdit,key,barcode,validSlug,decodeRows,readSnapshot,unchanged,checkedWrite,historyHash,historyMatcher,historyMatches,normalizedEmail});
})();
