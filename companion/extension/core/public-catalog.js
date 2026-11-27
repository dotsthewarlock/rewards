/* Public directory only. No merchant DOM, legacy storage, or workflow authority. */
(() => {
 'use strict';
 const D=globalThis.RewardsDiscovery;
 const origin='https://getmybonus.ca',source=origin+'/',limit=200,maxBytes=262144;
 const stamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s));
 const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const outcomes=['never','verified-directory','unavailable','restricted'];
 const empty=()=>({schema:'rewards.public-catalog/1',source,checkedAt:null,outcome:'never',entries:[]});
 function parseDirectory(html){
   if(typeof html!=='string'||html.length>maxBytes)return null;
   // Inert, deliberately narrow parser for the directory's quoted anchor hrefs.
   // Strip non-content regions; never evaluate scripts, decode arbitrary attributes,
   // follow links, infer dates/terms or retain the response.
   const content=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
   if(!/Select the qualifying offer to claim your bonus eGift card/i.test(content))return null;
   const found=new Map();
   for(const tag of content.matchAll(/<[a-z][a-z0-9:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)){
     if(!/^<a(?:\s|>)/i.test(tag[0]))continue;
     const attrs=tag[0].slice(2,-1);
     const hrefs=[];
     // Consume whole attributes, not href-like strings inside other attributes.
     const pattern=/\s+([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/gy;
     let pos=0;
     while(pos<attrs.length){
       if(/^\s*\/?\s*$/.test(attrs.slice(pos)))break;
       pattern.lastIndex=pos;
       const a=pattern.exec(attrs);
       if(!a){hrefs.length=0;break;}
       pos=pattern.lastIndex;
       if(a[1].toLowerCase()==='href')hrefs.push(a[2]??a[3]??null);
     }
     if(hrefs.length!==1||hrefs[0]===null)continue;
     const id=D.publicLink(hrefs[0],origin);
     if(id&&!found.has(id.key))found.set(id.key,id);
     if(found.size>limit)return null;
   }
   return found.size?[...found.values()]:null;
 }
 function validate(value){
   if(!exact(value,['schema','source','checkedAt','outcome','entries'])||value.schema!=='rewards.public-catalog/1'||value.source!==source||
     !outcomes.includes(value.outcome)||!(value.checkedAt===null||stamp(value.checkedAt))||
     !Array.isArray(value.entries)||value.entries.length>limit)return null;
   if(value.outcome==='never'?(value.checkedAt!==null||value.entries.length):!stamp(value.checkedAt))return null;
   const keys=new Set(),entries=[];
   for(const e of value.entries){
     if(!exact(e,['origin','campaign','key','url','firstSeen','lastSeen','listed']))return null;
     const id=D.publicLink(e.url,origin);
     if(!id||id.origin!==e.origin||id.campaign!==e.campaign||id.key!==e.key||keys.has(id.key)||
        !stamp(e.firstSeen)||!stamp(e.lastSeen)||e.firstSeen>e.lastSeen||e.lastSeen>value.checkedAt||
        typeof e.listed!=='boolean'||(e.listed&&(value.outcome!=='verified-directory'||e.lastSeen!==value.checkedAt)))return null;
     keys.add(id.key);
     entries.push({...id,firstSeen:e.firstSeen,lastSeen:e.lastSeen,listed:e.listed});
   }
   if(value.outcome==='verified-directory'&&!entries.some(e=>e.listed))return null;
   return {schema:'rewards.public-catalog/1',source,checkedAt:value.checkedAt,outcome:value.outcome,entries};
 }
 function merge(prior,ids,outcome,at){
   prior=validate(prior);
   if(!prior||!stamp(at)||prior.checkedAt>at||!outcomes.includes(outcome)||outcome==='never')return null;
   const rows=new Map(prior.entries.map(e=>[e.key,{...e,listed:false}]));
   if(outcome==='verified-directory'){
     if(!Array.isArray(ids)||!ids.length)return null;
     for(const candidate of ids){
       const id=D.publicLink(candidate?.url,origin);
       if(!id||id.key!==candidate.key)return null;
       rows.set(id.key,{...id,firstSeen:rows.get(id.key)?.firstSeen||at,lastSeen:at,listed:true});
     }
   }
   if(rows.size>limit)return null;
   return {schema:prior.schema,source,checkedAt:at,outcome,entries:[...rows.values()]};
 }
 async function retrieve(fetcher=fetch){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
     const r=await fetcher(source,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
     if([401,403,429,451].includes(r.status))return {outcome:'restricted'};
     if(!r.ok||r.url!==source||!/^text\/html(?:;|$)/i.test(r.headers.get('content-type')||'')||
       Number(r.headers.get('content-length'))>maxBytes||!r.body)return {outcome:'unavailable'};
     const reader=r.body.getReader(),decoder=new TextDecoder();let size=0,html='';
     try{
       while(true){
         const {done,value}=await reader.read();if(done)break;
         size+=value.byteLength;if(size>maxBytes)return {outcome:'unavailable'};
         html+=decoder.decode(value,{stream:true});
       }
       html+=decoder.decode();
     }finally{reader.cancel().catch(()=>{});}
     const ids=parseDirectory(html);
     if(ids)return {outcome:'verified-directory',ids};
     return {outcome:/captcha|access denied|please upgrade your browser|sign in to continue/i.test(html)?'restricted':'unavailable'};
   }catch{return {outcome:'unavailable'};}
   finally{clearTimeout(timer);controller.abort();}
 }
 globalThis.RewardsPublicCatalog=Object.freeze({source,empty,validate,parseDirectory,merge,retrieve});
})();
