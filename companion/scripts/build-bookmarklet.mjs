import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const classic=['discovery/core.js','discovery/legacy.js'];
// Explicit acyclic dependency order. Only the project's current named ESM syntax is supported.
// Fail closed on unrecognized syntax; no runtime loader or remote executable dependency.
const modules=['core/contracts.js','core/campaigns.js','core/codec.js','ui/components.js','ui/workspace.js'];
function flatten(name){
 const original=read('extension/'+name);
 const source=original.replace(/^import \{[A-Za-z0-9_,\s]+\} from '\.[^'\n]+';\r?$/gm,'').replace(/^export (?=(?:async )?(?:const|function)\b)/gm,'');
 if(/^\s*(?:import|export)\b/m.test(source))throw Error('Unsupported module syntax in '+name);
 return source;
}
export function buildBookmarklet(){
 const html=read('extension/index.html');
 const markup=html.match(/<body>([\s\S]*?)<script type="module"/)?.[1];
 if(!markup)throw Error('Workspace markup not found');
 const tokens=read('extension/ui/tokens.css').replaceAll(':root',':host');
 const styles=read('extension/ui/components.css').replace(/(^|})body(?=[.{])/g,'$1.shell');
 const css=tokens+'\n'+styles+'\n:host{all:initial;position:fixed!important;right:8px!important;top:8px!important;width:min(420px,calc(100vw - 16px))!important;max-height:calc(100vh - 16px)!important;overflow:auto!important;z-index:2147483647!important;display:block!important;background:var(--surface);color:var(--text);border:1px solid var(--outline);border-radius:16px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 20px #0004}:host .shell{padding-top:4px}:host .shell>button{margin-left:12px}';
 // Keep the discovery exports lexical to this bundle, not on the merchant window.
 const js=['(()=>{','"use strict";','const globalThis=Object.create(null);',...classic.map(p=>read('extension/'+p)),...modules.map(flatten),read('bookmarklet/entry.js'),'launchBookmarklet('+JSON.stringify(markup)+','+JSON.stringify(css)+');','})();'].join('\n');
 new vm.Script(js,{filename:'bookmarklet.js'});
 return {js,url:'javascript:'+encodeURIComponent(js)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {js,url}=buildBookmarklet(),out=path.join(base,'.build');
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'bookmarklet.js'),js);
 fs.writeFileSync(path.join(out,'bookmarklet.txt'),url+'\n');
 console.log('Built self-contained development bookmarklet; '+Buffer.byteLength(url)+' URL bytes');
}
