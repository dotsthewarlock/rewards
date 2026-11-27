/* Frozen v15 origin/slug keys. Read-only compatibility; never migrate, recover or write on mount. */
(() => {
  'use strict';
  const states=Object.freeze(['queued','processing','pending','complete','error','duplicate']);
  const key=(slug,name)=>'bs_rewards:'+slug+':'+name;
  function summary(storage,slug){
    if(!globalThis.RewardsDiscovery.slug(slug)||globalThis.RewardsDiscovery.slug(slug)!==slug)
      return {ok:false,reason:'invalid-campaign'};
    try{
      const array=name=>{
        const raw=storage.getItem(key(slug,name));
        if(raw===null)return [];
        const rows=JSON.parse(raw);
        if(!Array.isArray(rows)||rows.length>999||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))
          throw Error('invalid-cache');
        return rows;
      };
      const queue=array('queue'),history=array('history'),gifts=array('giftcards');
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
    if(typeof slug!=='string'||globalThis.RewardsDiscovery.slug(slug)!==slug)return {ok:false,reason:'invalid-campaign'};
    try{
      const raw=storage.getItem(key(slug,'giftcards'));
      const rows=raw===null?[]:JSON.parse(raw);
      if(!Array.isArray(rows)||rows.length>999||rows.some(row=>!row||fields.some(k=>typeof row[k]!=='string'||row[k].length>4096)))throw Error('invalid-cache');
      return {ok:true,rows:rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))};
    }catch{return {ok:false,reason:'unreadable-cache'};}
  }
  function validateExport(input){
    if(input?.ok!==true||!Array.isArray(input.rows)||input.rows.length>999)return null;
    if(input.rows.some(row=>!row||Object.keys(row).length!==fields.length||fields.some(k=>typeof row[k]!=='string'||row[k].length>4096)))return null;
    return {ok:true,rows:input.rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))};
  }
  globalThis.RewardsLegacy=Object.freeze({summary,validate,exportRows,validateExport});
})();
