import {attemptIdentity} from '../core/contracts.js';
import {campaigns,campaignById,money} from '../core/campaigns.js';
import {makeProvider,viewedCache,busy} from '../core/model.js';
import {fixtureCode,csv,tsv} from '../core/codec.js';
import {esc,button} from './components.js';
import {queueView} from './views/queue.js';
import {rewardsView} from './views/rewards.js';
import {campaignsView} from './views/campaigns.js';
import {settingsView} from './views/settings.js';
const provider=makeProvider(),$=id=>document.getElementById(id),state=()=>provider.getSnapshot();
const local={draft:'',filter:'all',page:0,revealed:null,rewardReveal:null,rewardTab:'cards',search:''};
const resetView=()=>Object.assign(local,{page:0,revealed:null,rewardReveal:null,filter:'all',search:''});
let feedback='';
const announce=text=>{feedback=text;$('announcement').textContent=text;};
function render(){const s=state(),c=campaignById(s.live),v=campaignById(s.view),prev=document.activeElement,focusId=prev?.id,focusAction=prev?.dataset.action,focusData=prev?.dataset.id,focusValue=prev?.dataset.value;
 document.documentElement.dataset.theme=s.theme;document.body.classList.toggle('bottom',s.nav==='bottom');
 if(s.nav==='bottom')$('footer').before($('navigation'));else $('workspace').before($('navigation'));
 $('context').innerHTML=`<div class="surface"><div class="row spread"><strong>${esc(c.name)}</strong><span class="muted">${s.connection==='recognized'?'Demo recognized':s.connection==='unknown'?'Unknown page':'Disconnected'}</span></div><p>${esc(c.products.join(' / '))} · ${money(c.cents)} expected</p><p class="muted">Claim by ${esc(c.deadline)} · ${s.phase==='ready'?'Ready for demo':esc(s.phase)}</p><label for="cacheView">View campaign cache</label><select id="cacheView">${campaigns.map(x=>`<option value="${x.id}" ${x.id===v.id?'selected':''}>${esc(x.name)}${x.id===c.id?' (active)':''}</option>`).join('')}</select>${s.view!==s.live?'<p class="warning">Historical cache: operational actions disabled.</p>':''}</div>`;
 $('navigation').innerHTML=['queue','rewards','campaigns','settings'].map(x=>button(x[0].toUpperCase()+x.slice(1),'navigate',{extra:`data-value="${x}" ${s.screen===x?'aria-current="page"':''}`})).join('');
 $('workspace').innerHTML=({queue:queueView,rewards:rewardsView,campaigns:campaignsView,settings:settingsView}[s.screen])(s,local);
 $('announcement').textContent=feedback||s.notice;$('footer').textContent=`Prototype 0.1.0 · Diagnostic preference ${s.diagnostics?'on':'off'} · No merchant connection`;
 // Restore focus after state projection. On disappearing control, move to workspace.
 const target=focusId?$(focusId):focusAction?[...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===focusAction&&el.dataset.id===focusData&&el.dataset.value===focusValue):null;
 if(target&&!target.disabled)target.focus({preventScroll:true});else if(focusId||focusAction)$('workspace').focus({preventScroll:true});
}
const dispatch=(type,fields={})=>{feedback='';provider.dispatch({type,...fields});};provider.subscribe(render);
function confirmScope(message,fn){const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>Confirm demo deletion</h2><p>${esc(message)}</p><form method="dialog" class="row"><button value="cancel" autofocus>Cancel</button><button class="primary" value="confirm">Confirm</button></form>`;document.body.append(dialog);const returnTo=document.activeElement;dialog.addEventListener('close',()=>{const confirmed=dialog.returnValue==='confirm';dialog.remove();if(confirmed)fn();else returnTo?.focus();},{once:true});dialog.showModal();}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Demo download requested.');}
function syntheticDiagnostics(){return JSON.stringify({schema:'demo-only/1',snapshotCount:state().captures,synthetic:true},null,2);}
function navigate(screen){resetView();dispatch('navigate',{screen});$('workspace').focus();}
document.addEventListener('input',e=>{if(e.target.id==='codes')local.draft=e.target.value;});
document.addEventListener('change',e=>{const x=e.target;switch(x.id){case 'cacheView':resetView();local.draft='';dispatch('view',{id:x.value});break;case 'filter':local.filter=x.value;local.page=0;render();break;case 'serial':dispatch('preference',{key:'serial',value:x.checked});break;case 'clipboardPref':dispatch('preference',{key:'clipboard',value:x.checked});break;case 'terms':dispatch('reviewField',{key:'terms',value:x.checked});break;case 'product':case 'reward':dispatch('reviewField',{key:x.id,value:Number(x.value)});break;case 'theme':case 'connection':dispatch(x.id,{value:x.value});break;case 'navPosition':dispatch('nav',{value:x.value});break;case 'diagnosticsPref':dispatch('diagnostics',{value:x.checked});break;}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const {action,value,id,key}=b.dataset,s=state();switch(action){
 case 'navigate':navigate(value);break;
 case 'sample':local.draft=[1,2,3,2].map(fixtureCode).join('\n')+'\ninvalid';render();$('codes').focus();break;
 case 'clipboard':dispatch('import',{text:[4,5].map(fixtureCode).join('\n')});announce('Simulated clipboard import. '+state().notice);break;
 case 'import':{const raw=local.draft;local.draft='';dispatch('import',{text:raw});break;}
 case 'email':dispatch('email',{value:$('email').value});break;
 case 'review':case 'cancelReview':case 'pause':case 'manualDone':dispatch(action);break;
 case 'authorize':dispatch(action,{attempt:attemptIdentity(s.review)});break;
 case 'outcome':dispatch(action,{value,attempt:attemptIdentity(s.review)});break;
 case 'keep':announce('Kept unresolved. Later claims remain blocked.');break;
 case 'prev':local.page=Math.max(0,local.page-1);local.revealed=null;local.rewardReveal=null;render();break;
 case 'next':local.page++;local.revealed=null;local.rewardReveal=null;render();break;
 case 'revealQueue':local.revealed=local.revealed===Number(id)?null:Number(id);render();break;
 case 'revealReward':local.rewardReveal=local.rewardReveal===Number(id)?null:Number(id);render();break;
 case 'rewardTab':resetView();local.rewardTab=value;render();break;
 case 'search':local.search=$('search').value;local.page=0;local.rewardReveal=null;render();break;
 case 'cached':resetView();local.draft='';dispatch('view',{id});navigate('queue');break;
 case 'context':resetView();local.draft='';dispatch('context',{id});navigate('queue');break;
 case 'diagnosticLink':navigate('settings');$('diagnostics').scrollIntoView();break;
 case 'copy':try{await navigator.clipboard.writeText(tsv(viewedCache(s).rewards));announce('Copied synthetic TSV.');}catch{announce('Clipboard denied. Use CSV export instead.');}break;
 case 'csv':download('demo_gift_cards_'+s.view+'.csv','\uFEFF'+csv(viewedCache(s).rewards),'text/csv;charset=utf-8');break;
 case 'capture':dispatch(action);announce('Synthetic snapshot recorded.');break;
 case 'diagnosticExport':download('demo_diagnostics.json',syntheticDiagnostics(),'application/json');break;
 case 'clearDiagnostics':confirmScope('Delete only demo diagnostic counters?',()=>dispatch(action));break;
 case 'clear':confirmScope(`Clear ${key} in ${s.view}? Only synthetic records are affected.`,()=>{resetView();dispatch('clear',{key,campaign:s.view});});break;
 case 'large':dispatch('import',{text:Array.from({length:999},(_,i)=>fixtureCode(i+1)).join('\n')});navigate('queue');break;
 case 'reset':confirmScope('Reset all synthetic session data?',()=>{resetView();local.draft='';dispatch('reset');});break;
 }});
render();
