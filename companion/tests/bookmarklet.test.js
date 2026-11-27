import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildBookmarklet} from '../scripts/build-bookmarklet.mjs';
test('bookmarklet build is deterministic, parseable, self-contained, and carries common workspace',()=>{
 const a=buildBookmarklet(),b=buildBookmarklet();
 assert.deepEqual(a,b);
 assert.equal(decodeURIComponent(a.url.slice('javascript:'.length)),a.js);
 assert.doesNotThrow(()=>new vm.Script(a.js));
 assert.match(a.js,/function mountWorkspace/);
 assert.match(a.js,/function exportRows/);
 assert.match(a.js,/function identity/);
 assert.doesNotMatch(a.js,/\bchrome\.runtime\b|\bfetch\s*\(|\beval\s*\(|DEMO-0001/);
});
test('unsupported origin exits without accessing document or storage',()=>{
 const window={};window.top=window;
 const {js}=buildBookmarklet();
 assert.doesNotThrow(()=>vm.runInNewContext(js,{window,location:{origin:'https://unrelated.invalid'}}));
});
