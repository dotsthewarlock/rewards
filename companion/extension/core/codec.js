export const exportHeaders=Object.freeze(['Card Merchant','Value Recent','GC Number','GC PIN']);
export function rewardRows(rows) {return rows.map(r=>[r.cardMerchant,r.valueRecent,r.gcNumber,r.gcPin]);}
export function tsv(rows){return rewardRows(rows).map(r=>r.map(value=>String(value??'').replace(/[\t\r\n]+/g,' ').trim()).join('\t')).join('\n');}
export function csv(rows){return [exportHeaders,...rewardRows(rows)].map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');}
