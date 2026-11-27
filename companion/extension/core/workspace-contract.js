/* Platform-neutral command vocabulary; response validators stay with their domain owners.
 * No transport, DOM or authority. The trusted transport always verifies sender and current target.
 */
(() => {
 'use strict';
 const workspaceType='companion.workspace',observationType='companion.observation';
 const content=Object.freeze({inspect:'companion.inspect',revealReward:'companion.revealReward',exportRewards:'companion.exportRewards',
  previewImport:'companion.previewImport',editCache:'companion.editCache',reconcileSuccess:'companion.reconcileSuccess',
  prepareFinal:'companion.prepareFinal',authorizeFinal:'companion.authorizeFinal',cancelFinal:'companion.cancelFinal'});
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
 globalThis.RewardsWorkspaceContract=Object.freeze({workspaceType,observationType,operations,extensionOnly,has,isScoped,contentType,isContentType,sameTarget,message});
})();
