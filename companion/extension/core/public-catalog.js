/* Public directory only. No merchant DOM, legacy storage, or workflow authority. */
(() => {
 'use strict';
 const D=globalThis.RewardsDiscovery;
 const origin='https://getmybonus.ca',source=origin+'/',limit=200,maxBytes=262144;
 const stamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s));
 const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const outcomes=['never','verified-directory','unavailable','restricted','rate-limited','checking'];
 const stopped=c=>['restricted','rate-limited','checking'].includes(c?.outcome);
 const empty=()=>({schema:'rewards.public-catalog/1',source,checkedAt:null,outcome:'never',entries:[]});
 // Narrow sequential tokenizer, not a general HTML parser. Fail closed on
 // ambiguous syntax; never scan inside quoted attributes or inert/raw regions.
 const tagPattern=/<(?:\/[a-z][a-z0-9:-]*\s*|[a-z][a-z0-9:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*)>/iy;
 const attrPattern=/\s+([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/gy;
 const rawTags=new Set(['script','style','title','textarea','xmp','iframe','noembed','noframes','noscript']);
 const opaqueTags=new Set(['template','svg','math','select','object']);
 const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
 const restricted=html=>/\b(?:access denied|please upgrade your browser|sign in to continue|verify (?:that )?you are human|complete (?:the )?(?:captcha|security check)|automated access (?:is )?(?:prohibited|denied))\b|(?:id|class)\s*=\s*["'][^"']*(?:challenge-form|cf-chl|captcha-challenge)|\/recaptcha\/api2\/bframe/i.test(html);
 function parseDirectory(html){
   if(typeof html!=='string'||html.length>maxBytes||restricted(html))return null;
   const found=new Map(),opaque=[];
   let pos=0,visibleText='',anchor=false;
   while(pos<html.length){
     const next=html.indexOf('<',pos),stop=next<0?html.length:next;
     if(!opaque.length)visibleText+=' '+html.slice(pos,stop);
     pos=stop;
     if(pos===html.length)break;
     if(html.startsWith('<!--',pos)){
       const close=html.indexOf('-->',pos+4);
       if(close<0||html.slice(pos+4,close).includes('<!--'))return null;
       pos=close+3;continue;
     }
     const doctype=/^<!doctype\s+html\s*>/i.exec(html.slice(pos,pos+40));
     if(doctype){pos+=doctype[0].length;continue;}
     tagPattern.lastIndex=pos;
     const token=tagPattern.exec(html)?.[0];
     if(!token)return null;
     pos=tagPattern.lastIndex;
     const match=/^<(\/?)([a-z][a-z0-9:-]*)/i.exec(token);
     const closing=!!match[1],name=match[2].toLowerCase();
     if(closing){
       if(opaque.length){
         if(opaque.at(-1)!==name)return null;
         opaque.pop();
       }else if(name==='a'){
         if(!anchor)return null;anchor=false;
       }
       continue;
     }
     const attrs=token.slice(match[0].length,-1),values=new Map();
     let i=0;
     while(i<attrs.length){
       if(/^\s*\/?\s*$/.test(attrs.slice(i)))break;
       attrPattern.lastIndex=i;
       const a=attrPattern.exec(attrs);
       if(!a)return null;
       i=attrPattern.lastIndex;
       const key=a[1].toLowerCase();
       if(values.has(key))return null;
       values.set(key,a[2]??a[3]??a[4]??null);
     }
     const selfClosing=/\/\s*>$/.test(token);
     if(name==='base'||name==='plaintext')return null;
     if(rawTags.has(name)){
       if(selfClosing)return null;
       const close=new RegExp('</'+name+'\\s*>','ig');
       close.lastIndex=pos;
       if(!close.exec(html))return null;
       pos=close.lastIndex;continue;
     }
     const hidden=values.has('hidden')||values.has('inert')||values.get('aria-hidden')?.toLowerCase()==='true'||
       /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(values.get('style')||'');
     if(opaque.length||opaqueTags.has(name)||hidden){
       if(!voidTags.has(name)){
         if(selfClosing&&name!=='svg'&&name!=='math')return null;
         if(!selfClosing)opaque.push(name);
       }
       continue;
     }
     if(name!=='a')continue;
     if(anchor||selfClosing)return null;
     anchor=true;
     const href=values.get('href');
     const id=D.publicLink(href,origin);
     if(id&&!found.has(id.key))found.set(id.key,id);
     if(found.size>limit)return null;
   }
   if(opaque.length||anchor||!/Select the qualifying offer to claim your bonus eGift card/i.test(visibleText.replace(/\s+/g,' ')))return null;
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
     if([401,403,451].includes(r.status))return {outcome:'restricted'};
     if(r.status===429)return {outcome:'rate-limited'};
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
     if(restricted(html)||/\bCAPTCHA\b/i.test(html.replace(/<[^>]*>/g,' ')))return {outcome:'restricted'};
     const ids=parseDirectory(html);
     return ids?{outcome:'verified-directory',ids}:{outcome:'unavailable'};
   }catch{return {outcome:'unavailable'};}
   finally{clearTimeout(timer);controller.abort();}
 }
 // Persist a stale intent before network access. If completion cannot be
 // saved/read back, a persisted checking state blocks another retrieval.
 async function refreshStored(load,save,fetchDirectory=retrieve,now=()=>new Date().toISOString()){
   const failure=reason=>({ok:false,reason});
   try{
     const prior=validate(await load());
     if(!prior)return failure('catalog-storage-invalid');
     if(stopped(prior))return {ok:true,catalog:prior};
     const pending=merge(prior,null,'checking',now());
     if(!pending)return failure('catalog-clock-invalid');
     async function persist(value){
       await save(value);
       const read=validate(await load());
       return JSON.stringify(read)===JSON.stringify(value);
     }
     if(!await persist(pending))return failure('catalog-storage-unverified');
     let result;
     try{result=await fetchDirectory();}catch{result={outcome:'unavailable'};}
     const at=now(),checkedAt=stamp(at)&&at>=pending.checkedAt?at:pending.checkedAt;
     const outcome=['verified-directory','restricted','rate-limited','unavailable'].includes(result?.outcome)?result.outcome:'unavailable';
     const next=merge(pending,result?.ids,outcome,checkedAt)||merge(pending,null,'unavailable',checkedAt);
     if(!next||!await persist(next))return failure('catalog-storage-unverified');
     return {ok:true,catalog:next};
   }catch{return failure('catalog-storage-unverified');}
 }
 globalThis.RewardsPublicCatalog=Object.freeze({source,empty,validate,parseDirectory,merge,retrieve,refreshStored,stopped});
})();
