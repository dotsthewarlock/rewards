"""Synthetic launcher tests only. No external requests or merchant code execution."""
import hashlib
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

project=Path(__file__).resolve().parents[1]
loader=(project/"launcher/loader.js").read_text()
bootstrap=(project/"launcher/bootstrap.txt").read_text().strip().removeprefix("javascript:")
root="https://dotsthewarlock.github.io/rewards/"
base="companion/launcher/"
source="window.launches += 1;"
def entry(grade):
    version="0.6.0-"+grade+"-0123456789ab"
    return dict(version=version,path=base+"releases/"+version+".js",sha256=hashlib.sha256(source.encode()).hexdigest())
stable=dict(version="15",path="redeem/Redeem_Prepaid_Rewards_v15.js",sha256="23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1")
stable_source=(project.parent/stable["path"]).read_bytes().decode("utf-8")
manifest=dict(schema=1,stable=stable,dev=entry("dev"))
# Verify production pins locally; do not execute either real reward script.
published=json.loads((project/"launcher/channels.json").read_text())
assert published["stable"]==stable
for key in ("stable","dev"):
    c=published[key]
    assert hashlib.sha256((project.parent/c["path"]).read_bytes()).hexdigest()==c["sha256"]

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROMIUM_EXECUTABLE") or None)
    page=browser.new_page(viewport={"width":320,"height":480})
    page.route("**/*",lambda r:r.fulfill(status=200,content_type="text/html",body='<button id="original">Original</button>') if r.request.url=="https://fixture.invalid/" else r.abort())
    def setup(m=manifest,body=source,delay=False,busy=False,fail=False,manifest_fail=False,stable_positive=False):
        page.goto("https://fixture.invalid/")
        page.evaluate("""([loader,bootstrap,m,body,delay,busy,fail,manifestFail,root,base,stablePositive,stableSource])=>{
          window.launches=0;window.calls=[];window.errors=[];window.fail=fail;window.manifestFail=manifestFail;
          window.alert=s=>errors.push(s);
          // Positive Stable test checks real bytes and the exact final invocation;
          // intercept only those bytes at eval, never run v15 or a merchant workflow.
          if(stablePositive){const nativeEval=window.eval;window.eval=s=>{if(s===stableSource){window.launches++;return;}return (0,nativeEval)(s);};}
          if(busy)document.body.insertAdjacentHTML('beforeend','<div id="bsp"></div>');
          window.fetch=async(url,o)=>{calls.push(url);
            if(o.cache!=='no-store'||o.credentials!=='omit'||o.redirect!=='error'||o.referrerPolicy!=='no-referrer')throw Error('unsafe fetch');
            if(url===root+base+'loader.js')return new Response(loader);
            if(url===root+base+'channels.json'){if(window.manifestFail)throw Error('offline');return new Response(JSON.stringify(m));}
            if(delay)await new Promise(r=>setTimeout(r,400));
            if(window.fail)throw Error('offline');return new Response(body);
          };
          document.querySelector('#original').focus();
          window.run=()=> (0,eval)(bootstrap);window.run();
        }""",[loader,bootstrap,m,body,delay,busy,fail,manifest_fail,root,base,stable_positive,stable_source])
    def button(name):return page.get_by_role("button",name=name,exact=True)
    def gone():
        page.get_by_role("dialog").wait_for(state="detached")
        page.wait_for_function("!window[Symbol.for('rewards.companion.launcher')]")
    def check(n):assert page.evaluate("launches")==n
    def ready():
        button("Stable · v15").wait_for()
        page.wait_for_function("document.activeElement?.shadowRoot?.activeElement?.textContent==='Stable · v15'")
    setup();ready()
    assert page.get_by_role("dialog").bounding_box()["width"]<=320
    assert not page.get_by_text("Testing builds").is_visible()
    page.evaluate("window.run()");assert page.get_by_role("dialog").count()==1
    assert len(page.evaluate("calls"))==2
    page.keyboard.press("Escape");gone();assert page.evaluate("document.activeElement.id")=="original";check(0)
    setup();button("Dev · 0.6.0").click();gone();page.wait_for_function("launches===1");assert len(page.evaluate("calls"))==3
    setup(body="window.launches=99");button("Dev · 0.6.0").click();page.get_by_text("Script integrity check failed; nothing launched.").wait_for();check(0);button("Cancel").click();gone()
    setup(delay=True);button("Dev · 0.6.0").click();page.evaluate("window.run()");button("Cancel").click();gone();page.wait_for_timeout(500);check(0);assert len(page.evaluate("calls"))==3
    setup(busy=True);page.wait_for_function("calls.length===1&&!window[Symbol.for('rewards.companion.launcher')]");assert page.evaluate("errors.length")==0;check(0)
    setup(delay=True);button("Dev · 0.6.0").click();page.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=bsp></div>')");gone();check(0)
    setup(fail=True);button("Dev · 0.6.0").click();button("Retry").wait_for();check(0);page.evaluate("window.fail=false");button("Retry").click();gone();page.wait_for_function("launches===1")
    setup(manifest_fail=True);button("Retry").wait_for();page.evaluate("window.manifestFail=false");button("Retry").click();ready();button("Cancel").click();gone()
    setup(m={**manifest,"dev":{**manifest["dev"],"path":"https://other.invalid/x"}});button("Dev unavailable").wait_for();assert button("Dev unavailable").is_disabled();button("Cancel").click();gone()
    setup(m={**manifest,"stable":{**stable,"sha256":"0"*64}});page.get_by_text("Invalid release manifest; nothing launched.").wait_for();assert button("Stable").is_disabled();button("Cancel").click();gone()
    setup();button("Stable · v15").click();page.get_by_text("Script integrity check failed; nothing launched.").wait_for();assert page.evaluate("calls[2]")==root+stable["path"];check(0);button("Cancel").click();gone()
    setup(body=stable_source,stable_positive=True);ready();page.keyboard.press("Enter");gone();page.wait_for_function("launches===1");assert page.evaluate("calls")==[root+base+"loader.js",root+base+"channels.json",root+stable["path"]];assert page.evaluate("errors.length")==0
    setup(m={**manifest,"test":{**entry("test"),"mode":"read-only","purpose":"Synthetic diagnostics"}});page.get_by_text("Testing builds").click();button("Test · 0.6.0").click();gone();page.wait_for_function("launches===1")
    setup(m={**manifest,"test":{**entry("test"),"mode":"write","purpose":"Not eligible"}});ready();assert not page.get_by_text("Testing builds").is_visible();button("Cancel").click();gone()
    setup(delay=True);button("Dev · 0.6.0").click();page.evaluate("document.activeElement.remove()");gone();page.wait_for_timeout(500);check(0)
    page.emulate_media(color_scheme="dark");setup();ready();assert page.get_by_role("dialog").evaluate("(e)=>getComputedStyle(e).backgroundColor")=="rgb(33, 35, 43)";page.keyboard.press("Escape");gone()
    browser.close()
print("16 synthetic launcher scenarios PASS")
