/* Adapted from v15 DOM.successGiftCard. Explicit read only, never used by
 * discovery/diagnostic collection. Explicit reconciliation only; no merchant actions.
 */
(() => {
  'use strict';
  const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
  const norm=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
  const visibleText=(el,strict=false)=>{
    if(!D.visible(el))return '';
    const walker=el.ownerDocument.createTreeWalker(el,4);
    const parts=[];
    let node,n=0;
    while((node=walker.nextNode())){
      if(++n>3000)throw Error('text-limit');
      if(D.visible(node.parentElement))parts.push(node.nodeValue);
      else if(strict)throw Error('hidden-field-text');
    }
    return norm(parts.join(strict?'':' '));
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
      // Descendant order supports both flat and wrapped label/value layouts.
      // Every title is a boundary, including unknown labels; never borrow a
      // value across it or accept multiple/nested/hidden credential markers.
      const fields={};
      let field=null,hasTitle=false;
      for(const marker of containers[0].querySelectorAll('.title,.text')){
        if(!D.visible(marker)||marker.parentElement.closest('.title,.text')||
          marker.classList.contains('title')===marker.classList.contains('text'))return fail('ambiguous-fields');
        if(marker.classList.contains('title')){
          hasTitle=true;
          field=aliases[visibleText(marker,true).replace(/:$/,'').toUpperCase()]||null;
          if(field){
            if(Object.hasOwn(fields,field))return fail('ambiguous-fields');
            fields[field]='';
          }
        }else{
          if(!hasTitle)return fail('ambiguous-fields');
          if(!field)continue;
          if(fields[field])return fail('ambiguous-fields');
          const value=visibleText(marker,true);
          if(!value)return fail('incomplete-reward');
          fields[field]=value;
        }
      }
      const form=root.closest('.redemption-form');
      const context=form&&id.root.contains(form)?form:id.root;
      const contextText=visibleText(context);
      const labels=[...contextText.matchAll(/\bEligible\s+Card\s*:/gi)];
      const matches=[...contextText.matchAll(/\bEligible\s+Card\s*:\s*(\d{30})\b/gi)].map(m=>m[1]);
      if(labels.length!==1||matches.length!==1||matches[0]!==expectedCode)return fail('eligible-card-mismatch');
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
