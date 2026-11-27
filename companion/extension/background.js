'use strict';
importScripts('core/identity.js','discovery/core.js','core/legacy.js','core/registry.js','core/transactions.js','core/public-catalog.js');
const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy,T=globalThis.RewardsTransactions,R=globalThis.RewardsCampaigns;
const configure=()=>chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);
configure();
// Optional defense in depth; content scripts never access diagnostic storage.
try{Promise.resolve(chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'})).catch(()=>{});}catch{}

const originOf=url=>{try{return new URL(url).origin;}catch{return null;}};
const indexURL=chrome.runtime.getURL('index.html');
let recordingTail=Promise.resolve();
const serial=job=>{const result=recordingTail.then(job);recordingTail=result.catch(()=>{});return result;};
// Snapshot schema remains unchanged. Timeline entries are a bounded additive local index.
const diagnosticReasons=Object.freeze(['initial','structure-change','document-restored','recording-enabled','control-interaction','selection-change','manual-capture']);
const eventLimit=2000;
const validTime=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x);
// Chrome storage does not preserve dictionary insertion order. Verify exact JSON
// structure and values, including array order; never discard extra properties.
function sameStoredValue(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)&&a.length!==b.length)return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameStoredValue(a[k],b[k]));
}
async function diagnostics(){
  const x=await chrome.storage.local.get({diagnosticsEnabled:false,structuralRecords:[],structuralEvents:[]});
  const records=[],indices=new Map();
  if(Array.isArray(x.structuralRecords))for(const [index,row] of x.structuralRecords.slice(0,500).entries()){
    const report=D.validate(row?.report,row?.report?.origin);
    if(report?.status==='recognized'&&Object.keys(row).length===2&&Object.hasOwn(row,'at')&&validTime(row.at)){
      indices.set(index,records.length);records.push({at:row.at,report});
    }
  }
  const events=[];
  if(Array.isArray(x.structuralEvents))for(const event of x.structuralEvents.slice(0,eventLimit)){
    if(!event||Object.keys(event).length!==4||!validTime(event.at)||!validTime(event.snapshotAt)||
       !diagnosticReasons.includes(event.reason)||!Number.isInteger(event.snapshot)||!indices.has(event.snapshot))continue;
    const snapshot=indices.get(event.snapshot);
    if(records[snapshot].at!==event.snapshotAt)continue;
    events.push({at:event.at,snapshotAt:event.snapshotAt,snapshot,reason:event.reason});
  }
  const blocked=!Array.isArray(x.structuralRecords)||x.structuralRecords.length!==records.length||records.length>=500||
    !Array.isArray(x.structuralEvents)||x.structuralEvents.length!==events.length||events.length>=eventLimit;
  return {enabled:x.diagnosticsEnabled===true,records,events,blocked};
}
async function record(report,reason='structure-change'){
  return serial(async()=>{
    const data=await diagnostics();
    if(!data.enabled||report.status!=='recognized')return reason==='manual-capture'?{ok:false,reason:'diagnostics-disabled-or-unrecognized'}:{ok:true};
    const clean=D.validate(report,report.origin);
    if(!clean||!diagnosticReasons.includes(reason))return {ok:false,reason:'invalid-report'};
    if(data.blocked)return {ok:false,reason:'diagnostics-retention-blocked'};
    const records=[...data.records],sig=JSON.stringify(clean),at=new Date().toISOString();
    let snapshot=records.findIndex(row=>JSON.stringify(row.report)===sig);
    if(snapshot<0){snapshot=records.length;records.push({at,report:clean});}
    const events=[...data.events,{at,snapshotAt:records[snapshot].at,snapshot,reason}];
    try{
      await chrome.storage.local.set({structuralRecords:records,structuralEvents:events});
      const readback=await chrome.storage.local.get(['structuralRecords','structuralEvents']);
      if(!sameStoredValue(readback.structuralRecords,records)||!sameStoredValue(readback.structuralEvents,events))
        return {ok:false,reason:'diagnostics-write-unverified'};
      return {ok:true};
    }catch{return {ok:false,reason:'diagnostics-write-unverified'};}
  });
}
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function recoverySelection(value){
  return value&&Object.keys(value).length===2&&uuid(value.attemptId)&&typeof value.last4==='string'&&/^\d{4}$/.test(value.last4)?{attemptId:value.attemptId,last4:value.last4}:null;
}
async function inspectTab(tabId){
  const tab=await chrome.tabs.get(tabId);
  const origin=originOf(tab.url);
  if(!D.allowedOrigin(origin))return {ok:true,report:null,summary:null};
  try{
    const result=await chrome.tabs.sendMessage(tabId,{type:'companion.inspect'},{frameId:0});
    const current=await chrome.tabs.get(tabId);
    if(current.url!==tab.url)return {ok:false,reason:'navigation-changed'};
    const report=D.validate(result?.report,origin);
    if(!report)return {ok:false,reason:'unverified-report'};
    const target=report.status==='recognized'&&uuid(result.documentToken)?{tabId,origin,campaign:report.campaign,documentToken:result.documentToken}:null;
    return {ok:true,report,target,summary:report.status==='recognized'?L.validate(result.summary):null,details:report.status==='recognized'?L.validateDetails(result.details):null,recovery:target&&report.stage==='success'?recoverySelection(result.recovery):null};
  }catch{return {ok:false,reason:'content-not-ready'};}
}
async function activeTab(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0];}
// Explicit manual evidence capture. It cannot grant any workflow authority.
async function captureDiagnostics(target){
  const tab=await activeTab();
  if(!target||tab?.id!==target.tabId||originOf(tab?.url)!==target.origin)return {ok:false,reason:'context-changed'};
  const inspection=await inspectTab(tab.id),current=await activeTab(),t=inspection.target;
  if(!t||current?.id!==tab.id||current.url!==tab.url||t.documentToken!==target.documentToken||
     t.origin!==target.origin||t.campaign!==target.campaign)return {ok:false,reason:'context-changed'};
  return record(inspection.report,'manual-capture');
}
async function scopedOperation(target,type,fields,validate,write=false){
  if(!target||!Number.isInteger(target.tabId)||!D.allowedOrigin(target.origin)||D.slug(target.campaign)!==target.campaign||typeof target.documentToken!=='string')return {ok:false,reason:'invalid-target'};
  const tab=await activeTab();
  if(tab?.id!==target.tabId||originOf(tab.url)!==target.origin)return {ok:false,reason:'context-changed'};
  const unavailable=()=>({ok:false,reason:write?'edit-outcome-unknown':'context-changed'});
  try{
    const result=await chrome.tabs.sendMessage(tab.id,{type,origin:target.origin,campaign:target.campaign,documentToken:target.documentToken,...fields},{frameId:0});
    const current=await activeTab();
    if(current?.id!==tab.id||current.url!==tab.url)return unavailable();
    const check=await inspectTab(tab.id);
    const finalTab=await activeTab();
    if(finalTab?.id!==tab.id||finalTab.url!==tab.url||check.target?.documentToken!==target.documentToken||check.target?.campaign!==target.campaign||check.target?.origin!==target.origin)return unavailable();
    if(type==='companion.revealReward'&&check.details?.rewardSnapshot!==fields.snapshot)return unavailable();
    return validate(result)||unavailable();
  }catch{return unavailable();}
}
const revealTab=(target,snapshot,index)=>L.validSelection(snapshot,index)?scopedOperation(target,'companion.revealReward',{snapshot,index},r=>L.validateReveal(r,snapshot,index)):{ok:false,reason:'invalid-selection'};
const exportTab=target=>scopedOperation(target,'companion.exportRewards',{},L.validateExport);
const previewTab=(target,text)=>typeof text==='string'&&text.length<=262144?scopedOperation(target,'companion.previewImport',{text},L.validatePreview):{ok:false,reason:'invalid-input'};
const editTab=(target,op,value)=>L.validEdit(op,value)?scopedOperation(target,'companion.editCache',{op,value},result=>L.validateEdit(result,op),true):{ok:false,reason:'invalid-input'};
const reconcileTab=(target,attemptId)=>uuid(attemptId)?scopedOperation(target,'companion.reconcileSuccess',{attemptId},result=>
  result?.ok===true&&result.status==='complete'?{ok:true,status:'complete'}:
  result?.ok===false?{ok:false,reason:'reconciliation-blocked'}:null,true):{ok:false,reason:'invalid-target'};
function validatePrepared(result,target){
  if(result?.ok===false)return {ok:false,reason:'form-not-ready'};
  const r=result?.review,choice=R.singleChoice(target.campaign,target.origin);
  if(result?.ok!==true||!choice||!T.validReview(r)||r.origin!==target.origin||r.campaign!==target.campaign||
    r.documentToken!==target.documentToken||Object.keys(choice).some(k=>r[k]!==choice[k]))return null;
  return {ok:true,review:T.exactReview(r)};
}
const prepareTab=target=>scopedOperation(target,'companion.prepareFinal',{},result=>validatePrepared(result,target));
const cancelTab=(target,attemptId)=>uuid(attemptId)?scopedOperation(target,'companion.cancelFinal',{attemptId},r=>r?.ok===true?{ok:true}:null):{ok:false};
const authorizeTab=(target,attemptId,confirmed)=>uuid(attemptId)&&confirmed===true?
  scopedOperation(target,'companion.authorizeFinal',{attemptId,confirmed:true},r=>
    r?.ok===true&&r.status==='pending'?{ok:true,status:'pending'}:r?.ok===false?{ok:false,reason:'authorization-blocked'}:null,true):{ok:false,reason:'invalid-review'};
// Manual public retrieval, separate storage and single flight. No tab or cache access.
const C=globalThis.RewardsPublicCatalog,catalogKey='publicCampaignCatalogV1';
async function readCatalog(){
  const data=await chrome.storage.local.get(catalogKey);
  return Object.hasOwn(data,catalogKey)?C.validate(data[catalogKey]):C.empty();
}
let catalogFlight=null;
function refreshCatalog(){
  if(catalogFlight)return catalogFlight;
  catalogFlight=C.refreshStored(readCatalog,value=>chrome.storage.local.set({[catalogKey]:value})).finally(()=>{catalogFlight=null;});
  return catalogFlight;
}
async function handle(m,sender){
  if(sender.id!==chrome.runtime.id)return {ok:false,reason:'untrusted-sender'};
  if(m?.type==='companion.observation'){
    if(!Number.isInteger(sender.tab?.id)||sender.frameId!==0||!sender.documentId||
       (sender.documentLifecycle&&sender.documentLifecycle!=='active')||originOf(sender.tab.url)!==originOf(sender.url))return {ok:false,reason:'untrusted-source'};
    const report=D.validate(m.report,originOf(sender.url));
    if(!report)return {ok:false,reason:'invalid-report'};
    await chrome.action.setBadgeText({tabId:sender.tab.id,text:report.status==='recognized'?'●':'?'}).catch(()=>{});
    await chrome.action.setTitle({tabId:sender.tab.id,title:report.status==='recognized'?'Rewards Companion: recognized':'Rewards Companion: diagnostic-only'}).catch(()=>{});
    return record(report,m.reason===undefined?'structure-change':m.reason);
  }
  if(m?.type!=='companion.workspace'||sender.url!==indexURL)return {ok:false,reason:'untrusted-command'};
  if(m.op==='getCatalog'){
    const catalog=await readCatalog();
    return catalog?{ok:true,catalog}:{ok:false,reason:'catalog-storage-invalid'};
  }
  if(m.op==='refreshCatalog')return refreshCatalog();
  if(m.op==='inspect'){
    const tab=await activeTab(),data=await diagnostics();
    return {...(tab?.id!==undefined?await inspectTab(tab.id):{ok:true,report:null,summary:null}),diagnostics:{enabled:data.enabled,count:data.records.length,eventCount:data.events.length,blocked:data.blocked}};
  }
  if(m.op==='setDiagnostics'&&typeof m.enabled==='boolean'){
    await serial(()=>chrome.storage.local.set({diagnosticsEnabled:m.enabled}));
    if(m.enabled){const tab=await activeTab();if(tab?.id!==undefined){const result=await inspectTab(tab.id);if(result.report?.status==='recognized')await record(result.report,'recording-enabled');}}
    return {ok:true};
  }
  if(m.op==='revealReward')return revealTab(m.target,m.snapshot,m.index);
  if(m.op==='exportRewards')return exportTab(m.target);
  if(m.op==='previewImport')return previewTab(m.target,m.text);
  if(m.op==='editCache')return editTab(m.target,m.edit,m.value);
  if(m.op==='reconcileSuccess')return reconcileTab(m.target,m.attemptId);
  if(m.op==='prepareFinal')return prepareTab(m.target);
  if(m.op==='cancelFinal')return cancelTab(m.target,m.attemptId);
  if(m.op==='authorizeFinal')return authorizeTab(m.target,m.attemptId,m.confirmed);
  if(m.op==='captureDiagnostics')return captureDiagnostics(m.target);
  if(m.op==='exportDiagnostics'){
    const {records,events,blocked}=await diagnostics();
    return {ok:true,export:{schema:'rewards.structural-export/1',provenance:{distribution:'mv3',scope:'retained-structural-observations',evidence:'structural-only',version:chrome.runtime.getManifest().version,exportedAt:new Date().toISOString(),recordingBlocked:blocked,eventCoverage:'since-timeline-enabled'},records,events}};
  }
  return {ok:false,reason:'unsupported-command'};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(!['companion.observation','companion.workspace'].includes(m?.type))return;
  handle(m,sender).then(reply,()=>reply({ok:false,reason:'operation-failed'}));return true;
});
chrome.tabs.onUpdated.addListener((id,change)=>{
  if(change.status==='loading')chrome.action.setBadgeText({tabId:id,text:''}).catch(()=>{});
});
