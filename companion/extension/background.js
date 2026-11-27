'use strict';
importScripts('discovery/core.js','discovery/legacy.js');
const D=globalThis.RewardsDiscovery,L=globalThis.RewardsLegacy;
const configure=()=>chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);
configure();

const originOf=url=>{try{return new URL(url).origin;}catch{return null;}};
const indexURL=chrome.runtime.getURL('index.html');
let recordingTail=Promise.resolve();
const serial=job=>{const result=recordingTail.then(job);recordingTail=result.catch(()=>{});return result;};
async function diagnostics(){
  const x=await chrome.storage.local.get({diagnosticsEnabled:false,structuralRecords:[]});
  const records=Array.isArray(x.structuralRecords)?x.structuralRecords.filter(row=>row&&D.validate(row.report,row.report?.origin)):[];
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
    return {ok:true,report,summary:report.status==='recognized'?L.validate(result.summary):null};
  }catch{return {ok:false,reason:'content-not-ready'};}
}
async function handle(m,sender){
  if(sender.id!==chrome.runtime.id)return {ok:false,reason:'untrusted-sender'};
  if(m?.type==='companion.observation'){
    if(!Number.isInteger(sender.tab?.id)||sender.frameId!==0||!sender.documentId||
       originOf(sender.tab.url)!==originOf(sender.url))return {ok:false,reason:'untrusted-source'};
    const report=D.validate(m.report,originOf(sender.url));
    if(!report)return {ok:false,reason:'invalid-report'};
    await chrome.action.setBadgeText({tabId:sender.tab.id,text:report.status==='recognized'?'●':'?'}).catch(()=>{});
    await chrome.action.setTitle({tabId:sender.tab.id,title:report.status==='recognized'?'Rewards Companion: recognized (read-only)':'Rewards Companion: diagnostic-only'}).catch(()=>{});
    return record(report);
  }
  if(m?.type!=='companion.workspace'||sender.url!==indexURL)return {ok:false,reason:'untrusted-command'};
  if(m.op==='inspect'){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    return {...(tab?.id!==undefined?await inspectTab(tab.id):{ok:true,report:null,summary:null}),diagnostics:{enabled:(await diagnostics()).enabled,count:(await diagnostics()).records.length}};
  }
  if(m.op==='setDiagnostics'&&typeof m.enabled==='boolean'){
    await serial(()=>chrome.storage.local.set({diagnosticsEnabled:m.enabled}));return {ok:true};
  }
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
