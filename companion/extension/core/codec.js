// Synthetic allowlist only. Legacy shape remains a 30 digit string.
export const fixtureCode = n => String(n).padStart(30,'0');
export const isFixtureCode = s => /^0{26}[0-9]{4}$/.test(s) && Number(s)>0;
export function parseCodes(raw) {
 const tokens=String(raw).trim().split(/\s+/).filter(Boolean);
 return {codes:tokens.filter(isFixtureCode),invalid:tokens.filter(x=>!isFixtureCode(x)).length};
}
export const exportHeaders=Object.freeze(['Card Merchant','Value Recent','GC Number','GC PIN']);
export function rewardRows(rows) {return rows.map(r=>[r.cardMerchant,r.valueRecent,r.gcNumber,r.gcPin]);}
export function tsv(rows){return rewardRows(rows).map(r=>r.map(value=>String(value??'').replace(/[\t\r\n]+/g,' ').trim()).join('\t')).join('\n');}
export function csv(rows){return [exportHeaders,...rewardRows(rows)].map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');}
