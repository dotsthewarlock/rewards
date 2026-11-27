import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../extension/'+p,import.meta.url));
const manifest=JSON.parse(read('manifest.json'));
const icons={
  16:'5595474cec6bf8b4791cbeafd939b2e8e50bfd604e744a7214a39aa83c859e99',
  32:'d304d2af2dbc5b05d6067b138604a83506c8949c653f01420bd60a971f24c914',
  48:'27442222c4cd9c50d12069f515ac93b4c533e5d3c8865c7832bab8b5eaf4c0be',
  128:'9339499a7e965797a1a953db98d82ad483a918235d4898cc8c1e98fbf35f49ed'
};
test('all four packaged toolbar icons match the original InComm archive byte-for-byte',()=>{
 for(const [size,hash] of Object.entries(icons)){
  const asset=manifest.icons[size];
  assert.equal(manifest.action.default_icon[size],asset);
  const bytes=read(asset);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
  assert.equal(bytes.readUInt32BE(16),Number(size));
  assert.equal(bytes.readUInt32BE(20),Number(size));
 }
});
test('side panel references packaged local assets and exposes landmark and status semantics',()=>{
 const html=read(manifest.side_panel.default_path).toString();
 for(const [,asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  assert.match(asset,/^(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+$/i);
  assert.ok(read(asset).length);
 }
 assert.match(html,/<html lang="en">/);
 assert.match(html,/<nav[^>]+aria-label="Workspace"/);
 assert.match(html,/<main[^>]+tabindex="-1"/);
 assert.match(html,/role="status" aria-live="polite"/);
});
const css=read('ui/tokens.css').toString();
const tokens=block=>Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})(?=[;}])/gi)].map(m=>[m[1],m[2]]));
function luminance(hex){
 let h=hex.slice(1);
 if(h.length===3)h=[...h].map(c=>c+c).join('');
 const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
test('light and dark semantic color pairs meet static WCAG contrast thresholds',()=>{
 const light=tokens(css.match(/:root\s*\{([^}]+)\}/)[1]+'}');
 const dark=tokens(css.match(/:root\[data-theme=dark\]\{([^}]+)\}/)[1]+'}');
 const automatic=tokens(css.match(/:root:not\(\[data-theme=light\]\)\{([^}]+)\}/)[1]+'}');
 assert.deepEqual(automatic,dark);
 for(const [theme,t] of Object.entries({light,dark})){
  for(const [fg,bg,min] of [
   ['text','surface',4.5],['text','container',4.5],
   ['muted','surface',4.5],['muted','container',4.5],
   ['on-primary','primary',4.5],['on-selected','selected',4.5],
   ['on-error','error-bg',4.5],['success','surface',4.5],
   ['error','surface',4.5],['primary','surface',4.5],['primary','container',4.5],
   ['focus','surface',3],['focus','container',3],
   ['outline','surface',3],['outline','container',3]
  ]){
   assert.ok(t[fg]&&t[bg],theme+' missing '+fg+'/'+bg);
   const ratio=contrast(t[fg],t[bg]);
   assert.ok(ratio>=min,theme+' '+fg+'/'+bg+' '+ratio.toFixed(2)+' < '+min);
  }
 }
});
