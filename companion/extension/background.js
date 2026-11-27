'use strict';
importScripts('discovery/core.js','discovery/legacy.js');
const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
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
async function diagnostics(){
  const x=await chrome.storage.local.get({diagnosticsEnabled:false,structuralRecords:[]});
  const records=[];
  if(Array.isArray(x.structuralRecords))for(const row of x.structuralRecords.slice(0,500)){
    const report=D.validate(row?.report,row?.report?.origin);
    if(report?.status==='recognized'&&typeof row.at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.at))records.push({at:row.at,report});
  }
  return {enabled:x.diagnosticsEnabled===true,records};
}
async function record(report){
  return serial(async()=>{
    const data=await diagnostics();
    if(!data.enabled||report.status!=='recognized')return {ok:true};
    const sig=JSON.stringify(report);
    if(data.records.some(row=>JSON.stringify(row.report)===sig))return {ok:true};
    if(data.records.length>=500)return {ok:false,reason:'diagnostics-limit'};
    const records=[...data.records,{at:new Date().toISOString(),report}];
    await chrome.storage.local.set({structuralRecords:records});
    return {ok:true};
  });
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
    const target=report.status==='recognized'&&typeof result.documentToken==='string'&&/^[a-f0-9-]{36}$/.test(result.documentToken)?{tabId,origin,campaign:report.campaign,documentToken:result.documentToken}:null;
    return {ok:true,report,target,summary:report.status==='recognized'?L.validate(result.summary):null};
  }catch{return {ok:false,reason:'content-not-ready'};}
}
async function activeTab(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0];}
async function exportTab(target){
  if(!target||!Number.isInteger(target.tabId)||!D.allowedOrigin(target.origin)||D.slug(target.campaign)!==target.campaign||typeof target.documentToken!=='string')return {ok:false,reason:'invalid-target'};
  const tab=await activeTab();
  if(tab?.id!==target.tabId||originOf(tab.url)!==target.origin)return {ok:false,reason:'context-changed'};
  const result=await chrome.tabs.sendMessage(tab.id,{type:'companion.exportRewards',origin:target.origin,campaign:target.campaign,documentToken:target.documentToken},{frameId:0});
  const current=await activeTab();
  if(current?.id!==tab.id||current.url!==tab.url)return {ok:false,reason:'context-changed'};
  return L.validateExport(result)||{ok:false,reason:'cache-unavailable'};
}
async function handle(m,sender){
  if(sender.id!==chrome.runtime.id)return {ok:false,reason:'untrusted-sender'};
  if(m?.type==='companion.observation'){
    if(!Number.isInteger(sender.tab?.id)||sender.frameId!==0||!sender.documentId||
       (sender.documentLifecycle&&sender.documentLifecycle!=='active')||originOf(sender.tab.url)!==originOf(sender.url))return {ok:false,reason:'untrusted-source'};
    const report=D.validate(m.report,originOf(sender.url));
    if(!report)return {ok:false,reason:'invalid-report'};
    await chrome.action.setBadgeText({tabId:sender.tab.id,text:report.status==='recognized'?'●':'?'}).catch(()=>{});
    await chrome.action.setTitle({tabId:sender.tab.id,title:report.status==='recognized'?'Rewards Companion: recognized (read-only)':'Rewards Companion: diagnostic-only'}).catch(()=>{});
    return record(report);
  }
  if(m?.type!=='companion.workspace'||sender.url!==indexURL)return {ok:false,reason:'untrusted-command'};
  if(m.op==='inspect'){
    const tab=await activeTab(),data=await diagnostics();
    return {...(tab?.id!==undefined?await inspectTab(tab.id):{ok:true,report:null,summary:null}),diagnostics:{enabled:data.enabled,count:data.records.length}};
  }
  if(m.op==='setDiagnostics'&&typeof m.enabled==='boolean'){
    await serial(()=>chrome.storage.local.set({diagnosticsEnabled:m.enabled}));
    if(m.enabled){const tab=await activeTab();if(tab?.id!==undefined){const result=await inspectTab(tab.id);if(result.report?.status==='recognized')await record(result.report);}}
    return {ok:true};
  }
  if(m.op==='exportRewards')return exportTab(m.target);
  if(m.op==='exportDiagnostics'){
    const {records}=await diagnostics();
    return {ok:true,export:{schema:'rewards.structural-export/1',records}};
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
