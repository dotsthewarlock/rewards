import {mountWorkspace} from '../ui/workspace.js';
import {makeSandbox,fixtureCode} from './provider.js';
const sandbox=makeSandbox(),workspace=mountWorkspace(document,sandbox.request);
const count=document.getElementById('simulationCount');
document.getElementById('scenario').addEventListener('change',async e=>{sandbox.setScenario(e.target.value);await workspace.refresh();});
function draft(n){
 const nav=document.querySelector('[data-action="navigate"][data-value="queue"]');nav.click();
 const field=document.getElementById('importDraft');if(!field)return;
 field.value=Array.from({length:n},(_,i)=>fixtureCode(i+1)).join('\n');
 field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();
}
document.getElementById('sample').addEventListener('click',()=>draft(3));
document.getElementById('large').addEventListener('click',()=>draft(999));
document.addEventListener('click',()=>{queueMicrotask(()=>{count.textContent=sandbox.submissions+' simulated submissions';});});
