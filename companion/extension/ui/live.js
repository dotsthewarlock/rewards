import {mountWorkspace} from './workspace.js';
const request=(op,fields={})=>chrome.runtime.sendMessage({type:'companion.workspace',op,...fields});
const {refresh}=mountWorkspace(document,request);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_,change,tab)=>{if(tab.active&&(change.status==='complete'||change.url))refresh();});
let refreshTimer=null;
chrome.runtime.onMessage.addListener(m=>{if(m?.type==='companion.observation'){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,250);}});

