import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import '../extension/core/workspace-contract.js';
const root=fileURLToPath(new URL('../extension/',import.meta.url));
const list=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);
test('native module imports and classic provider dependencies are local, acyclic and directionally bounded',()=>{
 const files=list(root),sources=new Map(files.map(file=>[file,fs.readFileSync(file,'utf8')])),edges=new Map(),providers=new Map();
 const within=(file,dir)=>file.startsWith(path.join(root,dir)+path.sep);
 for(const [file,source] of sources)for(const m of source.matchAll(/globalThis\.(Rewards\w+)\s*=\s*Object\.freeze/g)){
  assert.ok(!providers.has(m[1]),'duplicate classic provider '+m[1]);providers.set(m[1],file);
 }
 for(const [file,source] of sources){
  const deps=new Set();
  function add(dest){
   assert.ok(files.includes(dest),'missing module: '+dest);
   if(dest===file)return;
   if(within(file,'core'))assert.ok(within(dest,'core'),'core dependency outside core: '+file+' -> '+dest);
   if(within(file,'ui'))assert.ok(within(dest,'core')||within(dest,'ui'),'UI dependency outside presentation/core: '+file+' -> '+dest);
   if(within(file,'discovery'))assert.ok(within(dest,'core')||within(dest,'discovery'),'DOM adapter dependency outside adapter/core: '+file+' -> '+dest);
   deps.add(dest);
  }
  for(const m of source.matchAll(/^\s*(?:import|export)\s+[^\n]*?\sfrom\s+['"]([^'"]+)['"]/gm)){
   assert.ok(m[1].startsWith('.'),'external import: '+file);add(path.resolve(path.dirname(file),m[1]));
  }
  for(const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)){
   assert.ok(m[1].startsWith('.'),'external import: '+file);add(path.resolve(path.dirname(file),m[1]));
  }
  for(const m of source.matchAll(/\bimportScripts\(([^)]+)\)/g)){
   for(const q of m[1].matchAll(/['"]([^'"]+)['"]/g))add(path.resolve(path.dirname(file),q[1]));
  }
  for(const m of source.matchAll(/globalThis\.(Rewards\w+)/g)){
   assert.ok(providers.has(m[1]),'missing classic provider '+m[1]+' in '+file);add(providers.get(m[1]));
  }
  if(within(file,'core'))assert.doesNotMatch(source,/\b(?:document|window|chrome|navigator)\s*\./);
  edges.set(file,[...deps]);
 }
 const done=new Set(),stack=new Set();
 function visit(f){assert.ok(!stack.has(f),'cycle: '+f);if(done.has(f))return;stack.add(f);for(const dep of edges.get(f))visit(dep);stack.delete(f);done.add(f);}
 for(const f of files)visit(f);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 for(const entry of manifest.content_scripts){
  const ordered=entry.js.map(p=>path.resolve(root,p));
  assert.equal(new Set(ordered).size,ordered.length);
  for(const [i,file] of ordered.entries())for(const dep of edges.get(file)||[])assert.ok(ordered.indexOf(dep)>=0&&ordered.indexOf(dep)<i,'content dependency order: '+file+' -> '+dep);
 }
 const worker=path.resolve(root,manifest.background.service_worker),workerSrc=sources.get(worker);
 const ordered=[...workerSrc.match(/importScripts\(([^)]+)\)/)[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>path.resolve(root,m[1]));
 for(const [i,file] of ordered.entries())for(const dep of edges.get(file)||[])assert.ok(ordered.indexOf(dep)>=0&&ordered.indexOf(dep)<i,'worker dependency order: '+file+' -> '+dep);
});
test('shared command contract preserves operation names, exact target equality and platform capability distinctions',()=>{
 const W=globalThis.RewardsWorkspaceContract;
 assert.deepEqual(W.operations,['inspect','revealReward','exportRewards','previewImport','editCache','reconcileSuccess','prepareNext','prepareFinal','authorizeFinal','cancelFinal','getCatalog','refreshCatalog','setDiagnostics','captureDiagnostics','exportDiagnostics']);
 for(const op of W.operations){
  assert.ok(W.has(op));assert.equal(W.message(op,{type:'unexpected',op:'unexpected'}).type,'companion.workspace');
  assert.equal(W.message(op,{type:'unexpected',op:'unexpected'}).op,op);
  const type=W.contentType(op);
  if(type){assert.equal(type,'companion.'+op);assert.ok(W.isContentType(type));assert.equal(W.isScoped(op),op!=='inspect');}
  else assert.equal(W.isScoped(op),false);
 }
 assert.equal(W.has('constructor'),false);assert.equal(W.contentType('constructor'),null);
 assert.throws(()=>W.message('unknown'));
 const target={tabId:1,origin:'https://getmybonus.ca',campaign:'CA1126VANW',documentToken:'fixture'};
 assert.ok(W.sameTarget(target,{...target}));
 for(const key of Object.keys(target))assert.equal(W.sameTarget(target,{...target,[key]:undefined}),false);
 const {tabId,...bookmarklet}=target;assert.ok(W.sameTarget(bookmarklet,{...bookmarklet}));assert.equal(W.sameTarget(target,bookmarklet),false);
 assert.deepEqual(W.extensionOnly,['getCatalog','refreshCatalog','setDiagnostics','captureDiagnostics']);
});


test('target epoch changes on exact root, identity, stage and lifecycle transitions, not equivalent reports',()=>{
 const W=globalThis.RewardsWorkspaceContract;
 let n=0;const epoch=W.contextEpoch(()=>String(++n)),root={},id={status:'recognized',root,origin:'https://getmybonus.ca',campaign:'CA1126VANW',stage:'entry'};
 assert.equal(epoch.sync(id),false);const first=epoch.token;
 assert.equal(epoch.sync({...id}),false);assert.equal(epoch.token,first);
 assert.equal(epoch.sync({...id,root:{}}),true);assert.notEqual(epoch.token,first);
 const next=epoch.token;assert.equal(epoch.sync({...id,status:'conflict'}),true);assert.notEqual(epoch.token,next);
 assert.equal(epoch.sync(null),false);
 assert.equal(epoch.sync(id),true);assert.equal(epoch.sync({...id,stage:'success'}),true);
 const before=epoch.token;epoch.reset();assert.notEqual(epoch.token,before);assert.equal(epoch.sync(id),false);
});
