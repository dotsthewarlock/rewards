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
