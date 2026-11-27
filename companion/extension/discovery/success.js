/* Adapted from v15 DOM.successGiftCard. Explicit read only, never used by
 * discovery/diagnostic collection. No capture or merchant action here.
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
  globalThis.RewardsSuccess=Object.freeze({readSuccess});
})();
