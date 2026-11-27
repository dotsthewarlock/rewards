// Historical synthetic behavior contract; never packaged or used by the workspace.
import {campaigns,campaignById} from '../../extension/core/campaigns.js';
import {parseCodes} from './fixture-codec.js';
import {matchesAttempt, immutable} from './contracts.js';
import {reducePresentation} from './presentation.js';
// Pure synthetic reducer. No browser API, timing, storage, or network.
export const freshCache=()=>({queue:[],history:[],rewards:[],email:'demo@example.com',serial:true,clipboard:false});
export function initialState(generation=0){return {live:campaigns[0].id,view:campaigns[0].id,connection:'recognized',screen:'queue',caches:Object.fromEntries(campaigns.map(c=>[c.id,freshCache()])),phase:'ready',review:null,active:null,generation,notice:'Load demo codes to begin.',diagnostics:true,captures:0,theme:'system',nav:'top'};}
export const currentCache=s=>s.caches[s.live];
export const viewedCache=s=>s.caches[s.view];
export const counts=c=>Object.fromEntries(['queued','processing','pending','complete','error','duplicate'].map(x=>[x,c.queue.filter(r=>r.state===x).length]));
export const busy=s=>['running','awaiting','unresolved','capture-error'].includes(s.phase);
export const canReview=s=>s.connection==='recognized'&&s.live===s.view&&!busy(s)&&currentCache(s).queue.some(x=>x.state==='queued')&&!currentCache(s).queue.some(x=>x.state==='pending');
const invalidate=s=>{s.review=null;s.generation++;};
function pending(s,phase='unresolved'){const r=currentCache(s).queue.find(r=>r.id===s.active);if(r)r.state='pending';s.phase=phase;invalidate(s);}
function interrupt(s){if(s.phase==='running'){pending(s);s.notice='Simulated submission outcome unknown. Later items blocked.';}else if(s.phase==='awaiting'||s.phase==='review'){s.phase='paused';invalidate(s);}}
function verified(s){const c=currentCache(s),r=c.queue.find(r=>r.id===s.active),v=s.review,cp=campaignById(s.live);if(c.rewards.length>=999||c.history.length>=999){pending(s,'capture-error');return false;}if(!r||r.state!=='processing'||!v||v.code!==r.code||v.campaign!==s.live)return false;const card={cardMerchant:cp.merchant[v.reward],valueRecent:(cp.cents/100).toFixed(2),gcNumber:'DEMO-'+r.code.slice(-4),gcPin:'0000',sourceRedemptionCode:r.code,slug:s.live};c.rewards.push(card);c.history.push({code:r.code,last4:r.code.slice(-4),state:'complete'});r.state='complete';s.active=null;s.phase=c.serial&&c.queue.some(x=>x.state==='queued')?'ready':'paused';invalidate(s);s.notice='Simulated reward verified and saved. Review each next claim.';return true;}
export function reduce(previous,command){const s=structuredClone(previous),a=command,c=currentCache(s);
 if(!a || typeof a.type!=='string')return s;
 if(reducePresentation(s,a)){
  if(a.type==='view'&&s.view!==previous.view&&s.phase==='review'){invalidate(s);s.phase='paused';}
  return s;
 }
 switch(a.type){
 case 'context':if(campaignById(a.id)&&!busy(s)){invalidate(s);s.live=a.id;s.view=a.id;s.phase=currentCache(s).queue.some(x=>x.state==='pending')?'unresolved':'ready';s.active=currentCache(s).queue.find(x=>x.state==='pending')?.id??null;s.notice='Simulated active campaign changed.';}break;
 case 'connection':if(['recognized','unknown','disconnected'].includes(a.value)){interrupt(s);invalidate(s);s.connection=a.value;}break;
 case 'import':{if(s.view!==s.live||busy(s))break;const {codes,invalid}=parseCodes(a.text);let added=0,dupes=0,overflow=0;for(const code of codes){if(c.queue.length>=999){overflow++;continue;}const duplicate=c.queue.some(x=>x.code===code&&x.state!=='error')||c.history.some(x=>x.code===code);c.queue.push({id:c.queue.length+1,code,state:duplicate?'duplicate':'queued'});duplicate?dupes++:added++;}if(s.phase==='review'){s.phase='ready';invalidate(s);}s.notice=`${added} queued · ${dupes} duplicates · ${invalid} rejected · ${overflow} over limit`;break;}
 case 'email':if(s.view===s.live&&!busy(s)&&/^[a-z0-9._+-]+@example\.com$/i.test(a.value)){c.email=a.value;invalidate(s);if(s.phase==='review')s.phase='ready';s.notice='Demo email saved.';}else s.notice='Use a synthetic @example.com email.';break;
 case 'preference':if(s.view===s.live&&!busy(s)&&['serial','clipboard'].includes(a.key))c[a.key]=!!a.value;break;
 case 'review':if(canReview(s)){const r=c.queue.find(x=>x.state==='queued'),cp=campaignById(s.live);s.phase='review';s.review={id:r.id,code:r.code,campaign:s.live,generation:++s.generation,email:c.email,product:cp.products.length===1?0:null,reward:cp.rewards.length===1?0:null,terms:false};}break;
 case 'reviewField': {
  if (s.phase !== 'review' || !s.review || s.view !== s.live) break;
  const cp = campaignById(s.live);
  const valid = a.key === 'terms' ? typeof a.value === 'boolean' :
    ['product','reward'].includes(a.key) && Number.isInteger(a.value) &&
    a.value >= 0 && a.value < (a.key === 'product' ? cp.products.length : cp.rewards.length);
  if (valid && s.review[a.key] !== a.value) {
    s.review[a.key] = a.value;
    if (a.key !== 'terms') s.review.terms = false;
    s.review.generation = ++s.generation;
  }
  break;
 }
 case 'cancelReview':if(s.phase==='review'){invalidate(s);s.phase='ready';}break;
 case 'authorize':{const v=s.review;if(s.phase!=='review'||!canReview(s)||!v||!matchesAttempt(v,a.attempt)||v.campaign!==s.live||v.email!==c.email||v.product===null||v.reward===null||!v.terms)break;const r=c.queue.find(x=>x.id===v.id&&x.code===v.code&&x.state==='queued');if(!r)break;r.state='processing';s.active=r.id;s.phase='running';s.notice='Authorized demo attempt. No merchant request.';break;}
 case 'outcome':if(s.phase==='running'&&s.connection==='recognized'&&matchesAttempt(s.review,a.attempt)&&s.review.campaign===s.live&&s.review.id===s.active){if(a.value==='success')verified(s);else if(a.value==='unknown')pending(s);else if(a.value==='capture-error')pending(s,'capture-error');else if(a.value==='captcha'){c.queue.find(x=>x.id===s.active).state='queued';s.active=null;s.phase='awaiting';invalidate(s);}else if(a.value==='error'){const r=c.queue.find(x=>x.id===s.active);r.state='error';s.active=null;s.phase='paused';invalidate(s);s.notice='Simulated definitive rejection. Review before continuing.';}}break;
 case 'pause':interrupt(s);break;
 case 'manualDone':if(s.phase==='awaiting'&&s.connection==='recognized'){s.phase='paused';s.notice='Demo manual step completed. Review again.';}break;
 case 'diagnostics':s.diagnostics=!!a.value;break;
 case 'capture':if(s.connection==='recognized')s.captures++;break;
 case 'clearDiagnostics':s.captures=0;break;
 case 'clear':if(campaignById(a.campaign)&&!busy(s)&&s.phase!=='review'&&!s.caches[a.campaign].queue.some(x=>x.state==='pending')){const target=s.caches[a.campaign];if(a.key==='queue')target.queue=[];if(a.key==='history')target.history=[];if(a.key==='rewards')target.rewards=[];if(a.key==='all')s.caches[a.campaign]=freshCache();}break;
 case 'reset':return initialState(s.generation+1);
 }if(s.diagnostics&&s.connection==='recognized'&&(s.live!==previous.live||s.connection!==previous.connection||s.phase!==previous.phase))s.captures++;return s;}
export function makeProvider(seed=initialState()){
 let state=immutable(structuredClone(seed));
 const listeners=new Set();
 return {
  getSnapshot:()=>state,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  dispatch(command){state=immutable(reduce(state,command));for(const fn of listeners)fn(state);}
 };
}
