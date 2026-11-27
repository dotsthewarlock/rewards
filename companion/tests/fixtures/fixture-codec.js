// Synthetic allowlist only. Legacy shape remains a 30 digit string.
export const fixtureCode = n => String(n).padStart(30,'0');
export const isFixtureCode = s => /^0{26}[0-9]{4}$/.test(s) && Number(s)>0;
export function parseCodes(raw) {
 const tokens=String(raw).trim().split(/\s+/).filter(Boolean);
 return {codes:tokens.filter(isFixtureCode),invalid:tokens.filter(x=>!isFixtureCode(x)).length};
}
