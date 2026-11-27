/* Shared v15-compatible transaction persistence. Fixture-verified before
 * integration. This module does not discover, click, fill or submit merchant
 * controls; the foreground adapter must bind the reviewed UI and native action.
 */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
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
      L.normalizedEmail(r.email)===r.email&&r.terms===true;
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
        if(await L.historyMatcher(history)(r.code))return fail('duplicate');
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
  // Explicit reconciliation of a visible, exact linked success. Recovery is
  // idempotent: gift -> history -> queue -> clear intent; never navigate.
  async function reconcileSuccess(storage,locks,target,attemptId,card,contextValid){
    if(!target||!D.allowedOrigin(target.origin)||D.origins[target.origin]!==target.campaign||!uuid(target.documentToken)||!uuid(attemptId)||typeof contextValid!=='function')return fail('invalid-target');
    const t=Object.freeze({origin:target.origin,campaign:target.campaign,documentToken:target.documentToken,attemptId});
    return owned(locks,async()=>{
      let attempted=false;
      try{
        if(contextValid(t)!==true)return fail('context-changed');
        const {raw,queue,history,gifts}=cache(storage,t.campaign);
        const r=activeAttempt(raw);
        if(!r||r.attemptId!==attemptId||r.origin!==t.origin||r.campaign!==t.campaign||occupied(raw.lock))return fail('unresolved');
        if(!validCard(card,r))return fail('reward-mismatch');
        const matches=queue.filter(row=>row.id===r.queueId);
        if(matches.length!==1||matches[0].code!==r.code||!['pending','complete'].includes(matches[0].state)||
          queue.some(row=>row.id!==r.queueId&&['pending','processing'].includes(row.state)))return fail('queue-conflict');
        const k=giftKey(card),sameGift=gifts.filter(row=>giftKey(row)===k),sameSource=gifts.filter(row=>row.sourceRedemptionCode===r.code);
        if(sameGift.length>1||sameSource.length>1||sameGift.some(row=>!validCard(row,r)||(row.key&&row.key!==k)||row.slug!==r.campaign)||sameSource.some(row=>giftKey(row)!==k))return fail('reward-conflict');
        const matchedHistory=[];
        for(const row of history)if(await L.historyMatcher([row])(r.code))matchedHistory.push(row);
        if(matchedHistory.length>1||matchedHistory.some(row=>row.giftKey!==k||(row.code&&row.code!==r.code)))return fail('history-conflict');
        if(matches[0].state==='complete'&&(!sameGift.length||!matchedHistory.length))return fail('queue-conflict');
        if((!sameGift.length&&gifts.length>=999)||(!matchedHistory.length&&history.length>=999))return fail('capacity');
        const hash=matchedHistory.length?null:await L.historyHash(r.code);
        if(!current(storage,t.campaign,raw,contextValid,t))return fail('context-changed');
        const ts=Date.now();
        const write=(name,value)=>{
          if(!current(storage,t.campaign,raw,contextValid,t))throw Error('context-changed');
          attempted=true;save(storage,t.campaign,raw,name,value);
        };
        if(!sameGift.length)write('giftcards',[...gifts,{key:k,cardMerchant:norm(card.cardMerchant),valueRecent:card.valueRecent,gcNumber:norm(card.gcNumber),gcPin:norm(card.gcPin),sourceRedemptionCode:r.code,slug:r.campaign,ts}]);
        if(!matchedHistory.length)write('history',[...history,{h:hash,code:r.code,last4:r.code.slice(-4),ts,giftKey:k}]);
        if(matches[0].state!=='complete')write('queue',queue.map(row=>row.id===r.queueId?{...row,state:'complete',note:'Verified reward captured',updated:ts}:row));
        write('active',null);
        return {ok:true,status:'complete'};
      }catch{return fail(attempted?'capture-unknown':'unreadable-cache');}
    });
  }
  globalThis.RewardsTransactions=Object.freeze({validReview,startAttempt,reconcileSuccess});
})();
