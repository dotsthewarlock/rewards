import {mountWorkspace} from './workspace.js';
import '../core/workspace-contract.js';
const W=globalThis.RewardsWorkspaceContract;
const request=(op,fields={})=>chrome.runtime.sendMessage(W.message(op,fields));
const {refresh}=mountWorkspace(document,request);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_,change,tab)=>{if(tab.active&&(change.status==='complete'||change.url))refresh();});
let refreshTimer=null;
chrome.runtime.onMessage.addListener(m=>{if(m?.type===W.observationType){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,250);}});

