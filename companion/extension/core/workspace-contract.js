/* Platform-neutral command vocabulary; response validators stay with their domain owners.
 * No transport, DOM or authority. The trusted transport always verifies sender and current target.
 */
(() => {
 'use strict';
 const workspaceType='companion.workspace',observationType='companion.observation';
 const content=Object.freeze({inspect:'companion.inspect',revealReward:'companion.revealReward',exportRewards:'companion.exportRewards',
  previewImport:'companion.previewImport',editCache:'companion.editCache',reconcileSuccess:'companion.reconcileSuccess',
  prepareNext:'companion.prepareNext',prepareFinal:'companion.prepareFinal',authorizeFinal:'companion.authorizeFinal',cancelFinal:'companion.cancelFinal'});
 const scoped=Object.freeze(Object.keys(content).filter(op=>op!=='inspect'));
 const extensionOnly=Object.freeze(['getCatalog','refreshCatalog','setDiagnostics','captureDiagnostics']);
 const operations=Object.freeze([...Object.keys(content),...extensionOnly,'exportDiagnostics']);
 const has=op=>typeof op==='string'&&operations.includes(op);
 const isScoped=op=>scoped.includes(op);
 const contentType=op=>Object.hasOwn(content,op)?content[op]:null;
 const isContentType=type=>Object.values(content).includes(type);
 const sameTarget=(a,b)=>!!a&&!!b&&a.origin===b.origin&&a.campaign===b.campaign&&a.documentToken===b.documentToken&&a.tabId===b.tabId;
 function message(op,fields={}){
  if(!has(op))throw Error('unsupported-command');
  return {...fields,type:workspaceType,op};
 }
 // A target epoch fences exact recognized root and stage replacement even
 // within the same document/URL. Token creation is supplied by the adapter.
 function contextEpoch(makeToken){
  let token=makeToken(),scope=null,initialized=false;
  function sync(id){
   const next=id?.status==='recognized'?[id.root,id.origin,id.campaign,id.stage]:null;
   const changed=initialized&&(scope===null?next!==null:next===null||scope.some((v,i)=>v!==next[i]));
   if(changed)token=makeToken();
   scope=next;initialized=true;return changed;
  }
  function reset(){token=makeToken();scope=null;initialized=false;}
  return Object.freeze({get token(){return token;},sync,reset});
 }
 globalThis.RewardsWorkspaceContract=Object.freeze({contextEpoch,workspaceType,observationType,operations,extensionOnly,has,isScoped,contentType,isContentType,sameTarget,message});
})();
