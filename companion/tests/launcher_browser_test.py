"""Synthetic launcher tests only. No external requests or merchant code execution."""
import hashlib
import faulthandler
import time
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
maintenance={"version":"15.1","path":"companion/launcher/releases/15.1/Redeem_Prepaid_Rewards_v15.1.js","sha256":"a4f4a98f047e33bd2eb1d9db575e63dd1fbad9839fbb1044e6c0d7f43049a798"}
maintenance_bytes=(project.parent/maintenance["path"]).read_bytes()
assert hashlib.sha256(maintenance_bytes).hexdigest()==maintenance["sha256"]
assert hashlib.sha1(b"blob "+str(len(maintenance_bytes)).encode()+b"\0"+maintenance_bytes).hexdigest()=="6a317f92e182df7e9fbd183ef13bb0cc04362294"
maintenance_source=maintenance_bytes.decode("utf-8")
correction={"version":"15.2","path":"companion/launcher/releases/15.2/Redeem_Prepaid_Rewards_v15.2.js","sha256":"e50fe1b7e1a7d41f6954af47c5126fdb2b5900c23546af4999586e5975a396c4"}
correction_bytes=(project.parent/correction["path"]).read_bytes()
assert hashlib.sha256(correction_bytes).hexdigest()==correction["sha256"]
assert hashlib.sha1(b"blob "+str(len(correction_bytes)).encode()+b"\0"+correction_bytes).hexdigest()=="31ec102fa43b427ba332338671b7a17de12c83ed"
correction_source=correction_bytes.decode("utf-8")
manifest=dict(schema=1,stable=stable,dev=entry("dev"))
# Verify production pins locally; do not execute either real reward script.
published=json.loads((project/"launcher/channels.json").read_text())
assert published["stable"] in (stable,maintenance,correction)
for key in ("stable","dev"):
    c=published[key]
    assert hashlib.sha256((project.parent/c["path"]).read_bytes()).hexdigest()==c["sha256"]

faulthandler.dump_traceback_later(180, exit=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROMIUM_EXECUTABLE") or None)
    context=browser.new_context(viewport={"width":320,"height":480})
    page=context.new_page()
    page.set_default_timeout(10000)
    page.set_default_navigation_timeout(10000)
    scenarios=iter(["discovery, duplicate invocation and Escape","preview launch","hash mismatch","cancel delayed download","active workspace guard","workspace appears during download","download retry","manifest retry","invalid preview URL","invalid stable pin","stable mismatch","stable exact-byte interception","read-only test","ineligible test","host removal","dark appearance","help, privacy and keyboard","test disclosure","cancel and fresh reinvocation","diagnostic retry","launched focus","responsive layout 320","responsive layout 360","responsive layout 400","responsive layout 480","forced colors","remember Preview after verified launch","returning Preview both actions and explicit Open","neutral returning cancel preserves previous identity","same-semver changed build","unavailable preference","malformed preference","blocked storage","failed verification preserves preference","Test preference isolation","retry changed pointer","remember Regular after verified launch","returning Regular both actions and neutral focus","cancel delayed selection preserves preference","oversized preference","retry unchanged pointer","cross-origin preference isolation","same release ID different source hash","failed retry invalidates stale choices","maintenance staged not selectable","activated neutral maintenance and fallback","maintenance previous verification","maintenance exact-byte fallback","maintenance corrupt pin","maintenance wrong bytes","maintenance missing source","maintenance cancelled","maintenance retry pointer rollback","legacy retry pointer rollback","v15.2 staged inactive with prior pin","v15.2 exact neutral open","v15.2 previous verification after rollback","v15.2 original fallback","v15.2 wrong pin","v15.2 wrong bytes","v15.2 missing source","v15.2 cancel","v15.2 retry rollback to v15.1","v15.2 legacy retry rollback to v15"])
    scenario_count=0
    page.route("**/*",lambda r:r.fulfill(status=200,content_type="text/html",body='<button id="original">Original</button>') if r.request.url=="https://fixture.invalid/" else r.abort())
    def setup(m=manifest,body=source,delay=False,busy=False,fail=False,manifest_fail=False,stable_positive=False,retain=False,stored=None,blocked=False):
        global scenario_count
        scenario_count+=1
        print(f"START {scenario_count}: {next(scenarios)}",flush=True)
        page.goto("https://fixture.invalid/")
        page.evaluate("""([loader,bootstrap,m,body,delay,busy,fail,manifestFail,root,base,stablePositive,stableSource,maintenanceSource,correctionSource,retain,stored,blocked])=>{
          const key='rewards.companion.launcher.preference.v1';
          if(!retain)localStorage.removeItem(key);
          if(stored!==null)localStorage.setItem(key,stored);
          if(blocked){const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k===key)throw Error('blocked');return get.call(this,k);};Storage.prototype.setItem=function(k,v){if(k===key)throw Error('blocked');return set.call(this,k,v);};}
          window.fixtureManifest=m;
          window.launches=0;window.calls=[];window.errors=[];window.fail=fail;window.manifestFail=manifestFail;
          window.alert=s=>errors.push(s);
          // Positive Stable test checks real bytes and the exact final invocation;
          // intercept only those bytes at eval, never run v15 or a merchant workflow.
          {const nativeEval=window.eval;window.eval=s=>{if(s===stableSource||s===maintenanceSource||s===correctionSource){window.launches++;return;}return (0,nativeEval)(s);};}
          if(busy)document.body.insertAdjacentHTML('beforeend','<div id="bsp"></div>');
          window.fetch=async(url,o)=>{calls.push(url);
            if(o.cache!=='no-store'||o.credentials!=='omit'||o.redirect!=='error'||o.referrerPolicy!=='no-referrer')throw Error('unsafe fetch');
            if(url===root+base+'loader.js')return new Response(loader);
            if(url===root+base+'channels.json'){if(window.manifestFail)throw Error('offline');return new Response(JSON.stringify(window.fixtureManifest));}
            if(delay)await new Promise(r=>setTimeout(r,400));
            if(window.fail)throw Error('offline');return new Response(body);
          };
          document.querySelector('#original').focus();
          window.run=()=> (0,eval)(bootstrap);window.run();
        }""",[loader,bootstrap,m,body,delay,busy,fail,manifest_fail,root,base,stable_positive,stable_source,maintenance_source,correction_source,retain,stored,blocked])
    def button(name):return page.get_by_role("button",name=name,exact=True)
    def gone():
        page.get_by_role("dialog").wait_for(state="detached")
        page.wait_for_function("!window[Symbol.for('rewards.companion.launcher')]")
    def check(n):assert page.evaluate("launches")==n
    def ready(version="15"):
        button("Open Regular · v"+version).wait_for()
        page.wait_for_function("document.activeElement?.shadowRoot?.activeElement?.id==='loader-title'")
        assert button("Open Regular · v"+version).is_enabled()
        assert page.get_by_role("button",name="Open Preview",exact=False).count() or button("Preview unavailable").is_visible()
        assert page.get_by_role("button",name="Change version").count()==0
    started=time.perf_counter()
    setup();ready()
    print(f"Synthetic navigation-to-ready: {(time.perf_counter()-started)*1000:.1f} ms",flush=True)
    assert page.get_by_role("dialog").bounding_box()["width"]<=320
    assert not page.get_by_text("More testing options").is_visible()
    page.evaluate("() => { void window.run(); }");assert page.get_by_role("dialog").count()==1
    assert len(page.evaluate("calls"))==2
    regular=button("Open Regular · v15");preview=button("Open Preview · 0.6.0 · 0123456789ab")
    assert regular.evaluate("(e)=>getComputedStyle(e).backgroundColor")==preview.evaluate("(e)=>getComputedStyle(e).backgroundColor")
    assert regular.bounding_box()["height"]==preview.bounding_box()["height"]
    page.keyboard.press("Enter");check(0);assert len(page.evaluate("calls"))==2
    page.keyboard.press("Escape");gone();assert page.evaluate("document.activeElement.id")=="original";check(0)
    setup();button("Open Preview · 0.6.0 · 0123456789ab").click();gone();page.wait_for_function("launches===1");assert len(page.evaluate("calls"))==3
    setup(body="window.launches=99");button("Open Preview · 0.6.0 · 0123456789ab").click();page.get_by_text("Could not safely check",exact=False).wait_for();check(0);button("Cancel").click();gone()
    setup(delay=True);button("Open Preview · 0.6.0 · 0123456789ab").click();page.evaluate("() => { void window.run(); }");button("Cancel").click();gone();page.wait_for_timeout(500);check(0);assert len(page.evaluate("calls"))==3
    setup(busy=True);page.wait_for_function("calls.length===1&&!window[Symbol.for('rewards.companion.launcher')]");assert page.evaluate("errors.length")==0;check(0)
    setup(delay=True);button("Open Preview · 0.6.0 · 0123456789ab").click();page.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=bsp></div>')");gone();check(0)
    setup(fail=True);button("Open Preview · 0.6.0 · 0123456789ab").click();button("Retry").wait_for();check(0);page.evaluate("window.fail=false");button("Retry").click();gone();page.wait_for_function("launches===1")
    setup(manifest_fail=True);button("Retry").wait_for();page.evaluate("window.manifestFail=false");button("Retry").click();ready();button("Cancel").click();gone()
    setup(m={**manifest,"dev":{**manifest["dev"],"path":"https://other.invalid/x"}});button("Preview unavailable").wait_for();assert button("Preview unavailable").is_disabled();button("Cancel").click();gone()
    setup(m={**manifest,"stable":{**stable,"sha256":"0"*64}});page.get_by_text("Could not find available versions. Nothing opened.").wait_for();assert button("Regular unavailable").is_disabled() and button("Preview unavailable").is_disabled();button("Cancel").click();gone()
    setup();button("Open Regular · v15").click();page.get_by_text("Could not safely check",exact=False).wait_for();assert page.evaluate("calls[2]")==root+stable["path"];check(0);button("Cancel").click();gone()
    setup(body=stable_source,stable_positive=True);ready();page.keyboard.press("Enter");check(0);page.keyboard.press("Tab");assert button("Open Regular · v15").evaluate("(e)=>e.getRootNode().activeElement===e");page.keyboard.press("Enter");gone();page.wait_for_function("launches===1");assert page.evaluate("calls")==[root+base+"loader.js",root+base+"channels.json",root+stable["path"]];assert page.evaluate("errors.length")==0
    setup(m={**manifest,"test":{**entry("test"),"mode":"read-only","purpose":"Synthetic diagnostics"}});page.get_by_text("More testing options").click();button("Test · 0.6.0").click();gone();page.wait_for_function("launches===1")
    setup(m={**manifest,"test":{**entry("test"),"mode":"write","purpose":"Not eligible"}});ready();assert not page.get_by_text("More testing options").is_visible();button("Cancel").click();gone()
    setup(delay=True);button("Open Preview · 0.6.0 · 0123456789ab").click();page.evaluate("document.activeElement.remove()");gone();page.wait_for_timeout(500);check(0)
    page.emulate_media(color_scheme="dark");setup();ready();assert page.get_by_role("dialog").evaluate("(e)=>getComputedStyle(e).backgroundColor")=="rgb(33, 35, 43)";page.keyboard.press("Escape");gone()
    # Targeted UX/lifecycle regressions, preserving the original scenarios.
    page.emulate_media(color_scheme="light")
    setup();ready()
    assert not page.get_by_text(manifest["dev"]["version"],exact=False).is_visible()
    page.get_by_text("Help & version details",exact=True).click()
    assert page.get_by_text(manifest["dev"]["version"],exact=False).is_visible()
    link=page.get_by_role("link",name="Report a problem")
    assert link.bounding_box()["height"]>=48
    assert page.get_by_text("Help & version details",exact=True).bounding_box()["height"]>=48
    assert link.get_attribute("href")=="https://github.com/dotsthewarlock/rewards/issues/new"
    assert link.get_attribute("rel")=="noopener noreferrer"
    assert link.get_attribute("referrerpolicy")=="no-referrer"
    assert page.get_by_text("Reports are public",exact=False).is_visible()
    assert len(page.evaluate("calls"))==2
    page.get_by_text("Help & version details",exact=True).click()
    button("Open Regular · v15").focus()
    assert page.get_by_role("status").inner_text()=="Choose a version."
    page.keyboard.press("Tab");assert button("Open Preview · 0.6.0 · 0123456789ab").evaluate("(e)=>e.getRootNode().activeElement===e")
    page.keyboard.press("Shift+Tab");assert button("Open Regular · v15").evaluate("(e)=>e.getRootNode().activeElement===e")
    page.keyboard.press("Escape");gone();check(0)
    setup(m={**manifest,"test":{**entry("test"),"mode":"read-only","purpose":"Synthetic diagnostics"}});ready()
    page.get_by_text("More testing options").click()
    assert page.get_by_text("Synthetic diagnostics",exact=True).is_visible()
    page.get_by_text("Help & version details",exact=True).click()
    assert page.get_by_text(entry("test")["version"],exact=False).is_visible()
    assert page.get_by_text("More testing options").evaluate("(e)=>getComputedStyle(e).display")=="list-item"
    page.keyboard.press("Escape");gone()
    setup(delay=True);button("Open Preview · 0.6.0 · 0123456789ab").click()
    assert page.get_by_role("status").inner_text()=="Opening Preview..."
    button("Cancel").click();gone()
    # A fresh bootstrap promise stays pending until the dialog closes. Do not
    # return it to Playwright evaluate, which would await the entire lifecycle.
    started=time.perf_counter()
    page.evaluate("() => { window.reinvokeSettled=false; window.run().then(()=>{window.reinvokeSettled=true;}); }")
    ready();assert page.evaluate("reinvokeSettled") is False
    print(f"Synthetic reinvoke-to-ready: {(time.perf_counter()-started)*1000:.1f} ms",flush=True)
    page.wait_for_timeout(500);check(0)
    assert page.get_by_role("status").inner_text()=="Choose a version."
    started=time.perf_counter()
    page.keyboard.press("Escape");gone();page.wait_for_function("reinvokeSettled===true")
    print(f"Synthetic Escape-to-bootstrap-settled: {(time.perf_counter()-started)*1000:.1f} ms",flush=True)
    setup(fail=True);button("Open Preview · 0.6.0 · 0123456789ab").click();button("Retry").wait_for()
    assert page.get_by_role("status").inner_text().startswith("Could not download Preview.")
    assert not page.get_by_text("Check failed: download (Preview).",exact=True).is_visible()
    page.get_by_text("Help & version details",exact=True).click()
    assert page.get_by_text("Check failed: download (Preview).",exact=True).is_visible()
    button("Retry").focus()
    assert button("Retry").evaluate("(e)=>e.getRootNode().activeElement===e")
    page.evaluate("window.fail=false");button("Retry").click();gone();page.wait_for_function("launches===1")
    focus_source="window.launches++;const b=document.createElement('button');b.id='launched-focus';document.body.append(b);b.focus();"
    focus_manifest={**manifest,"dev":{**manifest["dev"],"sha256":hashlib.sha256(focus_source.encode()).hexdigest()}}
    setup(m=focus_manifest,body=focus_source);button("Open Preview · 0.6.0 · 0123456789ab").click();gone()
    assert page.evaluate("document.activeElement.id")=="launched-focus"
    for width in (320,360,400,480):
        page.set_viewport_size({"width":width,"height":480})
        setup();ready()
        dialog=page.get_by_role("dialog")
        assert dialog.bounding_box()["width"]<=width
        assert dialog.evaluate("(e)=>e.scrollWidth<=e.clientWidth")
        assert button("Open Regular · v15").bounding_box()["height"]>=48
        assert button("Open Preview · 0.6.0 · 0123456789ab").bounding_box()["height"]==button("Open Regular · v15").bounding_box()["height"]
        assert button("Cancel").bounding_box()["height"]>=48
        page.get_by_text("Help & version details",exact=True).click()
        assert dialog.evaluate("(e)=>e.scrollWidth<=e.clientWidth")
        assert page.get_by_role("link",name="Report a problem").bounding_box()["height"]>=48
        page.keyboard.press("Escape");gone()
    page.set_viewport_size({"width":320,"height":480})
    page.emulate_media(forced_colors="active");setup();ready()
    page.keyboard.press("Tab");assert button("Open Regular · v15").evaluate("(e)=>e.getRootNode().activeElement===e")
    assert button("Open Regular · v15").evaluate("(e)=>getComputedStyle(e).outlineStyle")=="solid"
    page.keyboard.press("Tab");assert button("Open Preview · 0.6.0 · 0123456789ab").evaluate("(e)=>e.getRootNode().activeElement===e")
    assert button("Open Preview · 0.6.0 · 0123456789ab").evaluate("(e)=>getComputedStyle(e).outlineStyle")=="solid"
    page.keyboard.press("Escape");gone()
    page.emulate_media(forced_colors="none")
    key="rewards.companion.launcher.preference.v1"
    remembered_dev=json.dumps(dict(schema=1,channel="dev",version=manifest["dev"]["version"],sha256=manifest["dev"]["sha256"]))
    def saved():return page.evaluate("(key)=>localStorage.getItem(key)",key)
    def pref():return json.loads(saved()) if saved() else None
    def preview_ready():
        ready()
        assert page.get_by_role("button",name="Open Preview",exact=False).is_enabled()
        page.keyboard.press("Enter");check(0)
    setup();ready();assert saved() is None
    button("Open Preview · 0.6.0 · 0123456789ab").click();gone();check(1)
    assert pref()==json.loads(remembered_dev)
    setup(retain=True);preview_ready();assert button("Open Regular · v15").is_visible()
    assert len(page.evaluate("calls"))==2;check(0)
    button("Open Preview · 0.6.0 · 0123456789ab").click();gone();check(1)
    setup(retain=True);preview_ready();ready()
    assert button("Open Preview · 0.6.0 · 0123456789ab").is_visible()
    button("Cancel").click();gone();assert pref()==json.loads(remembered_dev);check(0)
    changed={**manifest,"dev":{**manifest["dev"],"version":"0.6.0-dev-abcdef012345","path":base+"releases/0.6.0-dev-abcdef012345.js"}}
    setup(m=changed,retain=True);preview_ready()
    assert "different Preview version" in page.get_by_role("status").inner_text()
    assert page.get_by_text(changed["dev"]["version"],exact=False).is_visible()
    assert page.get_by_text("Previously verified on this site: Preview "+manifest["dev"]["version"],exact=False).is_visible()
    assert pref()==json.loads(remembered_dev);check(0);button("Open Preview · 0.6.0 · abcdef012345").click();gone();check(1)
    assert pref()["version"]==changed["dev"]["version"]
    setup(m={"schema":1,"stable":stable},retain=True);ready()
    assert "previously verified Preview is unavailable" in page.get_by_role("status").inner_text()
    assert button("Preview unavailable").is_disabled();check(0);button("Cancel").click();gone()
    assert pref()["version"]==changed["dev"]["version"]
    setup(stored='{"schema":1,"channel":"dev","version":"javascript:wrong","sha256":"bad"}');ready()
    assert button("Open Preview · 0.6.0 · 0123456789ab").is_visible();check(0);button("Cancel").click();gone()
    setup(blocked=True,stored=remembered_dev);ready()
    button("Open Preview · 0.6.0 · 0123456789ab").click();gone();check(1)
    setup(stored=remembered_dev,body="window.launches=99");preview_ready()
    button("Open Preview · 0.6.0 · 0123456789ab").click();button("Retry").wait_for();check(0)
    assert button("Open Preview · 0.6.0 · 0123456789ab").is_disabled() and button("Open Regular · v15").is_disabled()
    assert pref()==json.loads(remembered_dev);button("Cancel").click();gone()
    setup(stored=remembered_dev,m={**manifest,"test":{**entry("test"),"mode":"read-only","purpose":"Synthetic diagnostics"}})
    preview_ready();assert page.get_by_text("More testing options").is_visible()
    page.get_by_text("More testing options").click()
    button("Test · 0.6.0").click();gone();check(1);assert pref()==json.loads(remembered_dev)
    setup(stored=remembered_dev,fail=True);preview_ready();button("Open Preview · 0.6.0 · 0123456789ab").click();button("Retry").wait_for()
    page.evaluate("(value)=>{window.fixtureManifest=value;window.fail=false;}",changed)
    button("Retry").click();page.get_by_text("The selected version changed or is unavailable.",exact=False).wait_for()
    ready();assert button("Open Preview · 0.6.0 · abcdef012345").is_enabled();check(0);assert pref()==json.loads(remembered_dev)
    assert page.evaluate("calls.length")==4
    button("Cancel").click();gone()
    setup(body=stable_source,stable_positive=True);ready();button("Open Regular · v15").click();gone();check(1)
    assert pref()["channel"]=="stable" and pref()["sha256"]==stable["sha256"]
    setup(retain=True);ready();assert button("Open Preview · 0.6.0 · 0123456789ab").is_visible();check(0)
    button("Cancel").click();gone();assert pref()["channel"]=="stable"
    setup(stored=remembered_dev,delay=True);preview_ready();ready()
    button("Open Regular · v15").click();button("Cancel").click();gone();page.wait_for_timeout(500);check(0)
    assert pref()==json.loads(remembered_dev)
    setup(stored="x"*257);ready();check(0);button("Cancel").click();gone()
    setup(stored=remembered_dev,fail=True);preview_ready();button("Open Preview · 0.6.0 · 0123456789ab").click();button("Retry").wait_for()
    page.evaluate("window.fail=false");button("Retry").click();gone();check(1)
    assert page.evaluate("calls").count(root+base+"channels.json")==2
    setup(retain=True);preview_ready();button("Cancel").click();gone()
    isolated=page.context.new_page();isolated.route("**/*",lambda route:route.fulfill(content_type="text/html",body="<p>Other origin</p>") if route.request.url=="https://other.invalid/" else route.abort())
    isolated.goto("https://other.invalid/");assert isolated.evaluate("(key)=>localStorage.getItem(key)",key) is None;isolated.close()
    replacement="window.launches += 1; // different bytes"
    hash_changed={**manifest,"dev":{**manifest["dev"],"sha256":hashlib.sha256(replacement.encode()).hexdigest()}}
    setup(stored=remembered_dev,m=hash_changed,body=replacement);preview_ready()
    assert page.get_by_text("Source fingerprint changed.",exact=False).is_visible();check(0)
    assert pref()==json.loads(remembered_dev)
    button("Open Preview · 0.6.0 · 0123456789ab").click();gone();check(1)
    assert pref()["sha256"]==hash_changed["dev"]["sha256"]
    setup(stored=remembered_dev,fail=True);preview_ready();button("Open Preview · 0.6.0 · 0123456789ab").click();button("Retry").wait_for()
    page.evaluate("window.manifestFail=true;window.fail=false")
    button("Retry").click();page.get_by_text("Could not find available versions. Nothing opened.",exact=True).wait_for()
    assert button("Preview unavailable").is_disabled()
    assert button("Regular unavailable").is_disabled();check(0)
    assert pref()==json.loads(remembered_dev)
    page.evaluate("window.manifestFail=false")
    button("Retry").click();gone();check(1)
    assert page.evaluate("calls").count(root+base+"channels.json")==3
    activated={**manifest,"stable":maintenance}
    fallback=button("Open original v15 (legacy fallback)")
    setup();ready();assert not fallback.is_visible()
    assert not page.get_by_text("Within Regular, v15.1 is recommended",exact=False).is_visible()
    button("Cancel").click();gone();check(0)
    setup(m=activated,body=maintenance_source);ready("15.1")
    regular=button("Open Regular · v15.1");preview=button("Open Preview · 0.6.0 · 0123456789ab")
    assert fallback.is_visible() and fallback.is_enabled()
    assert regular.bounding_box()["height"]==preview.bounding_box()["height"]
    assert regular.evaluate("(e)=>getComputedStyle(e).backgroundColor")==preview.evaluate("(e)=>getComputedStyle(e).backgroundColor")
    assert page.get_by_text("Within Regular, v15.1 is recommended",exact=False).is_visible()
    page.keyboard.press("Enter");check(0);assert len(page.evaluate("calls"))==2
    regular.click();gone();check(1);assert page.evaluate("calls[2]")==root+maintenance["path"]
    assert pref()==dict(schema=1,channel="stable",version="15.1",sha256=maintenance["sha256"])
    setup(retain=True);ready();assert "different Regular version" in page.get_by_role("status").inner_text()
    assert page.get_by_text("Previously verified on this site: Regular 15.1",exact=False).is_visible()
    assert not fallback.is_visible();button("Cancel").click();gone();check(0)
    setup(m=activated,body=stable_source);ready("15.1");fallback.click();gone();check(1)
    assert page.evaluate("calls[2]")==root+stable["path"]
    assert pref()==dict(schema=1,channel="stable",version="15",sha256=stable["sha256"])
    setup(m={**activated,"stable":{**maintenance,"sha256":"0"*64}})
    button("Retry").wait_for();assert button("Regular unavailable").is_disabled() and not fallback.is_visible();check(0)
    button("Cancel").click();gone()
    setup(m=activated,body=stable_source);ready("15.1");regular.click();button("Retry").wait_for()
    assert "Could not safely check" in page.get_by_role("status").inner_text()
    assert fallback.is_disabled() and saved() is None;check(0);button("Cancel").click();gone()
    setup(m=activated,fail=True);ready("15.1");regular.click();button("Retry").wait_for()
    assert fallback.is_disabled() and saved() is None;check(0);button("Cancel").click();gone()
    setup(m=activated,body=maintenance_source,delay=True);ready("15.1");regular.click();button("Cancel").click();gone()
    page.wait_for_timeout(500);check(0);assert saved() is None
    setup(m=activated,fail=True);ready("15.1");regular.click();button("Retry").wait_for()
    page.evaluate("(m)=>{window.fixtureManifest=m;window.fail=false;}",manifest)
    button("Retry").click();ready();assert not fallback.is_visible();check(0);assert len(page.evaluate("calls"))==4
    button("Cancel").click();gone()
    setup(m=activated,fail=True);ready("15.1");fallback.click();button("Retry").wait_for()
    page.evaluate("(m)=>{window.fixtureManifest=m;window.fail=false;}",manifest)
    button("Retry").click();ready();assert not fallback.is_visible();check(0);assert len(page.evaluate("calls"))==4
    button("Cancel").click();gone()
    prior_active={**manifest,"stable":maintenance}
    corrected={**manifest,"stable":correction}
    setup(m=prior_active);ready("15.1")
    assert button("Open Regular · v15.2").count()==0 and fallback.is_visible()
    button("Cancel").click();gone();check(0)
    setup(m=corrected,body=correction_source);ready("15.2")
    regular2=button("Open Regular · v15.2")
    assert regular2.bounding_box()["height"]==preview.bounding_box()["height"] and fallback.is_visible()
    assert regular2.evaluate("(e)=>getComputedStyle(e).backgroundColor")==preview.evaluate("(e)=>getComputedStyle(e).backgroundColor")
    assert page.get_by_text("Within Regular, v15.2 is recommended",exact=False).is_visible()
    page.keyboard.press("Enter");check(0);assert len(page.evaluate("calls"))==2
    regular2.click();gone();check(1);assert page.evaluate("calls[2]")==root+correction["path"]
    assert pref()==dict(schema=1,channel="stable",version="15.2",sha256=correction["sha256"])
    setup(m=prior_active,body=maintenance_source,retain=True);ready("15.1")
    assert page.get_by_text("Previously verified on this site: Regular 15.2",exact=False).is_visible()
    check(0);button("Open Regular · v15.1").click();gone();check(1)
    assert pref()["version"]=="15.1"
    setup(m=corrected,body=stable_source);ready("15.2");fallback.click();gone();check(1)
    assert page.evaluate("calls[2]")==root+stable["path"] and pref()["version"]=="15"
    setup(m={**corrected,"stable":{**correction,"path":maintenance["path"]}})
    button("Retry").wait_for();assert button("Regular unavailable").is_disabled() and not fallback.is_visible()
    check(0);button("Cancel").click();gone()
    setup(m=corrected,body=maintenance_source);ready("15.2");regular2.click();button("Retry").wait_for()
    assert "Could not safely check" in page.get_by_role("status").inner_text() and fallback.is_disabled()
    assert saved() is None;check(0);button("Cancel").click();gone()
    setup(m=corrected,fail=True);ready("15.2");regular2.click();button("Retry").wait_for()
    assert fallback.is_disabled() and saved() is None;check(0);button("Cancel").click();gone()
    setup(m=corrected,body=correction_source,delay=True);ready("15.2");regular2.click();button("Cancel").click();gone()
    page.wait_for_timeout(500);check(0);assert saved() is None
    setup(m=corrected,fail=True);ready("15.2");regular2.click();button("Retry").wait_for()
    page.evaluate("(m)=>{window.fixtureManifest=m;window.fail=false;}",prior_active)
    button("Retry").click();ready("15.1");check(0);assert len(page.evaluate("calls"))==4
    assert fallback.is_enabled();button("Cancel").click();gone()
    setup(m=corrected,fail=True);ready("15.2");fallback.click();button("Retry").wait_for()
    page.evaluate("(m)=>{window.fixtureManifest=m;window.fail=false;}",manifest)
    button("Retry").click();ready();assert not fallback.is_visible();check(0);assert len(page.evaluate("calls"))==4
    button("Cancel").click();gone()
    assert scenario_count==64 and next(scenarios,None) is None
    # Distribution page is read-only; all requests remain synthetic.
    print("Distribution page: current, missing, invalid, offline and retry",flush=True)
    distribution=browser.new_page(viewport={"width":320,"height":480})
    distribution.set_default_timeout(10000)
    address=root+base
    document=(project/"launcher/index.html").read_text()
    selection=published
    evidence=json.loads((project.parent/Path(published['dev']['package']).parent/'publication.json').read_text())
    good_evidence=evidence
    available=True
    evidence_available=True
    requests=[]
    def distribution_route(route):
        url=route.request.url;requests.append(url)
        if url==address:route.fulfill(content_type="text/html",body=document)
        elif url==address+"channels.json" and available:route.fulfill(content_type="application/json",body=json.dumps(selection))
        elif url==root+str(Path(published["dev"]["package"]).parent)+"/publication.json" and evidence_available:route.fulfill(content_type="application/json",body=json.dumps(evidence))
        else:route.abort()
    distribution.route("**/*",distribution_route)
    def open_distribution():
        distribution.goto(address)
        distribution.wait_for_function("document.querySelector('#status').textContent!=='Checking available versions…'")
    open_distribution()
    download=distribution.get_by_role("link",name="Download Preview package")
    assert download.get_attribute("href")==root+published["dev"]["package"]
    assert distribution.get_by_role("link",name="Get the bookmarklet").get_attribute("href")=="bootstrap.txt"
    assert distribution.locator("#regular").inner_text().startswith("Regular (Stable) · version "+published["stable"]["version"])
    assert download.bounding_box()["height"]>=48
    assert distribution.evaluate("document.documentElement.scrollWidth<=innerWidth")
    distribution.get_by_text("About & version details",exact=True).click()
    assert distribution.get_by_text("Preview: "+published["dev"]["version"]+" · Full source ID: "+evidence["commit"],exact=True).is_visible()
    assert distribution.get_by_text("Package SHA-256: "+published["dev"]["packageSha256"],exact=True).is_visible()
    assert distribution.evaluate("document.documentElement.scrollWidth<=innerWidth")
    assert set(requests)<={address,address+"channels.json",root+str(Path(published["dev"]["package"]).parent)+"/publication.json",address+"favicon.ico","https://dotsthewarlock.github.io/favicon.ico"}
    selection={**published,"dev":{**published["dev"],"package":"https://other.invalid/download.zip"}}
    open_distribution();assert not download.is_visible();assert download.count()==0
    flat={**published["dev"],"path":base+"releases/"+published["dev"]["version"]+".js"}
    selection={**published,"dev":flat};evidence={**good_evidence,"candidate":flat}
    open_distribution();assert not download.is_visible()
    evidence=good_evidence
    selection={"schema":1,"stable":published["stable"]}
    open_distribution();assert distribution.get_by_text("Preview is unavailable.",exact=True).is_visible()
    selection={**published,"schema":2}
    open_distribution();assert distribution.get_by_role("button",name="Try again").is_visible()
    selection=published;available=False
    open_distribution();assert distribution.get_by_role("button",name="Try again").is_visible()
    assert not download.is_visible()
    available=True
    distribution.get_by_role("button",name="Try again").click()
    download.wait_for();assert download.get_attribute("href")==root+published["dev"]["package"]
    # Keep historical comparison fixtures explicit after eventual maintenance activation.
    selection={**published,"stable":stable}
    print("Neutral D3 comparison: explicit distribution/channel, exact identity, no persistence and provenance",flush=True)
    old_preferences='{"extension":"dev","bookmarklet":"stable"}'
    distribution.evaluate("(value)=>localStorage.setItem('rewards.companion.distribution.preferences.v1',value)",old_preferences)
    open_distribution()
    distribution.get_by_text("Check your version",exact=True).click()
    dist=distribution.get_by_label("How do you open Rewards Companion?")
    running=distribution.get_by_label("Version you are using")
    target=distribution.get_by_label("Compare with")
    compare=distribution.get_by_role("button",name="Compare versions")
    result=distribution.locator("#comparison-result")
    assert dist.input_value()=="" and target.input_value()=="" and target.is_disabled() and compare.is_disabled()
    dist.select_option("extension")
    assert target.input_value()=="" and compare.is_disabled()
    assert target.locator('option[value="stable"]').is_disabled()
    assert "Regular is not available" in distribution.locator("#comparison-note").inner_text()
    running.select_option("dev")
    assert target.input_value()=="" and compare.is_disabled()
    distribution.get_by_label("Version number").fill(published["dev"]["version"].split("-dev-")[0])
    distribution.get_by_label("Full source ID from version details").fill(good_evidence["commit"])
    target.select_option("dev")
    request_count=len(requests)
    compare.click()
    assert result.inner_text()=="Your exact Preview build matches the published Preview."
    distribution.get_by_label("Full source ID from version details").fill(good_evidence["commit"][:12]+("a" if good_evidence["commit"][12:]!="a"*28 else "b")*28)
    assert "Exact comparison unavailable" in result.inner_text()
    compare.click();assert "does not establish which build is newer" in result.inner_text()
    distribution.get_by_label("Full source ID from version details").fill("bad")
    compare.click();assert "Exact comparison unavailable" in result.inner_text()
    dist.select_option("bookmarklet")
    assert target.input_value()=="" and running.input_value()=="unknown" and compare.is_disabled()
    running.select_option("dev")
    assert distribution.get_by_label("Full source ID from version details").input_value()==""
    target.select_option("dev")
    running.select_option("stable")
    assert target.input_value()=="" and compare.is_disabled()
    target.select_option("stable");compare.click()
    assert "matches the published Regular" in result.inner_text()
    target.select_option("dev");compare.click()
    assert "different release" in result.inner_text()
    assert len(requests)==request_count
    assert distribution.evaluate("localStorage.getItem('rewards.companion.distribution.preferences.v1')")==old_preferences
    assert distribution.evaluate("localStorage.length")==1
    open_distribution();distribution.get_by_text("Check your version",exact=True).click()
    assert dist.input_value()=="" and target.input_value()=="" and compare.is_disabled()
    for invalid in ({**good_evidence,"commit":"a"*40},{**good_evidence,"run":True},
                    {**good_evidence,"candidate":{**good_evidence["candidate"],"packageSha256":"0"*64}},
                    {**good_evidence,"previousDev":{**good_evidence["previousDev"],"path":"https://other.invalid/x"}}):
        evidence=invalid;open_distribution();assert not download.is_visible()
        assert distribution.get_by_role("button",name="Try again").is_visible()
        distribution.get_by_text("Check your version",exact=True).click()
        dist.select_option("extension");running.select_option("dev")
        assert target.locator('option[value="dev"]').is_disabled() and compare.is_disabled()
        assert "Preview could not be checked" in distribution.locator("#comparison-note").inner_text()
    evidence=good_evidence;evidence_available=False
    open_distribution();assert not download.is_visible()
    distribution.get_by_text("Check your version",exact=True).click()
    dist.select_option("bookmarklet");running.select_option("stable");target.select_option("stable");compare.click()
    evidence_available=True;distribution.get_by_role("button",name="Try again").click();download.wait_for()
    assert target.input_value()=="" and compare.is_disabled()
    assert distribution.evaluate("document.documentElement.scrollWidth<=innerWidth")
    # An exact active maintenance pin changes only the explicit Regular choices.
    selection={**published,"stable":maintenance}
    open_distribution();download.wait_for()
    assert "recommended within Regular" in distribution.locator("#regular").inner_text()
    distribution.get_by_text("Check your version",exact=True).click()
    assert dist.input_value()=="" and target.input_value()=="" and compare.is_disabled()
    dist.select_option("bookmarklet");running.select_option("stable");target.select_option("stable");compare.click()
    assert "Regular v15.1 is a different release" in result.inner_text()
    target.select_option("legacy");compare.click();assert "matches the available legacy fallback" in result.inner_text()
    running.select_option("maintenance");assert target.input_value()=="" and compare.is_disabled()
    target.select_option("stable");compare.click();assert "matches the published Regular" in result.inner_text()
    dist.select_option("extension");assert target.input_value()=="" and target.locator('option[value="legacy"]').is_disabled()
    assert target.locator('option[value="stable"]').is_disabled()
    selection={**published,"stable":{**maintenance,"path":stable["path"]}}
    open_distribution();assert not download.is_visible()
    assert distribution.get_by_role("button",name="Try again").is_visible()
    selection={**published,"stable":stable}
    open_distribution();download.wait_for();distribution.get_by_text("Check your version",exact=True).click()
    dist.select_option("bookmarklet");running.select_option("maintenance")
    assert target.locator('option[value="legacy"]').is_disabled()
    target.select_option("stable");compare.click();assert "Regular v15 is a different release" in result.inner_text()
    print("v15.1 neutral official comparison and rollback PASS",flush=True)
    selection={**published,"stable":correction}
    open_distribution();download.wait_for();distribution.get_by_text("Check your version",exact=True).click()
    assert dist.input_value()=="" and target.input_value()=="" and compare.is_disabled()
    dist.select_option("bookmarklet");running.select_option("maintenance");target.select_option("stable");compare.click()
    assert "Regular v15.2 is a different release" in result.inner_text()
    running.select_option("correction");target.select_option("stable");compare.click()
    assert "matches the published Regular" in result.inner_text()
    running.select_option("stable");target.select_option("legacy");compare.click()
    assert "matches the available legacy fallback" in result.inner_text()
    dist.select_option("extension");assert target.input_value()=="" and target.locator('option[value="legacy"]').is_disabled()
    selection={**published,"stable":{**correction,"sha256":"0"*64}}
    open_distribution();assert not download.is_visible() and distribution.get_by_role("button",name="Try again").is_visible()
    selection={**published,"stable":maintenance}
    open_distribution();download.wait_for();distribution.get_by_text("Check your version",exact=True).click()
    dist.select_option("bookmarklet");running.select_option("correction");target.select_option("stable");compare.click()
    assert "Regular v15.1 is a different release" in result.inner_text()
    print("v15.2 neutral official comparison and prior-pin rollback PASS",flush=True)
    selection=published
    # No storage reads, writes or removal, even when legacy preferences exist.
    distribution.add_init_script("""window.storageAccesses=0;
      for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=function(){window.storageAccesses++;throw Error('blocked');};""")
    open_distribution();download.wait_for()
    distribution.get_by_text("Check your version",exact=True).click()
    assert dist.input_value()=="" and target.input_value()=="" and compare.is_disabled()
    dist.select_option("extension");running.select_option("dev")
    assert target.input_value()=="" and compare.is_disabled()
    distribution.get_by_label("Version number").fill(published["dev"]["version"].split("-dev-")[0])
    distribution.get_by_label("Full source ID from version details").fill(good_evidence["commit"])
    target.select_option("dev");compare.click()
    assert result.inner_text()=="Your exact Preview build matches the published Preview."
    assert distribution.evaluate("storageAccesses")==0
    print("Neutral selection and exact build comparison/provenance scenarios PASS",flush=True)
    distribution.emulate_media(color_scheme="dark",forced_colors="active")
    assert distribution.evaluate("document.documentElement.scrollWidth<=innerWidth")
    distribution.close()
    print("Distribution page scenarios PASS",flush=True)
    print("Homepage discoverability",flush=True)
    homepage=browser.new_page(viewport={"width":320,"height":480})
    homepage.route("**/*",lambda route:route.fulfill(content_type="text/html",body=(project.parent/"index.html").read_text()) if route.request.url==root else route.abort())
    homepage.goto(root)
    assert homepage.get_by_role("link",name="Get Rewards Companion").get_attribute("href")=="companion/launcher/"
    assert homepage.get_by_role("link",name="Bookmarklet launcher").is_visible()
    assert homepage.locator("#options tr").count()==48
    homepage.locator("#search").fill("Amazon");assert homepage.locator("#count").inner_text()=="0 of 48 merchants"
    homepage.close()
    print("Homepage discoverability PASS",flush=True)
    browser.close()
faulthandler.cancel_dump_traceback_later()
print("64 synthetic scenario executions PASS",flush=True)
