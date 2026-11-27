import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../extension/',import.meta.url));
const list=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);
test('native module imports are local, acyclic, and core never depends on UI or browser',()=>{
 const files=list(root), edges=new Map();
 for(const file of files){const text=fs.readFileSync(file,'utf8'),deps=[];
  for(const match of text.matchAll(/^\s*(?:import|export)\s+[^\n]*?\sfrom\s+['"]([^'"]+)['"]/gm)){
   assert.ok(match[1].startsWith('.'),`external import: ${file}`);const dest=path.resolve(path.dirname(file),match[1]);assert.ok(files.includes(dest),`missing module: ${dest}`);
   if(file.startsWith(path.join(root,'core')+path.sep))assert.ok(dest.startsWith(path.join(root,'core')+path.sep),'core imported outside core');deps.push(dest);
  }
  if(file.startsWith(path.join(root,'core')+path.sep))assert.doesNotMatch(text,/\b(?:document|window|chrome|navigator)\s*\./);
  edges.set(file,deps);
 }
 const done=new Set(),stack=new Set();function visit(f){assert.ok(!stack.has(f),`cycle: ${f}`);if(done.has(f))return;stack.add(f);for(const dep of edges.get(f))visit(dep);stack.delete(f);done.add(f);}for(const f of files)visit(f);
});
