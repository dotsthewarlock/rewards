"""Native isolated-world discovery against synthetic route fulfillment, never a real merchant."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/"extension"
fixture="""<!doctype html><html><body data-slug="CA1126VANW">
<main class="bcr-redemption"><form id="new_workflow_data">
<div class="step step_active"><input class="wizard-serial-number" value="SYNTHETIC_SECRET">
<button type="button">Get My Bonus</button></div>
<div class="step"><input id="workflow_data_email" value="SECRET@example.invalid">
<input name="commit" type="submit" value="Submit"></div>
<input type="hidden" value="PRIVATE_TEST_TOKEN"><span id="PIN-123">DO-NOT-STORE</span>
</form></main><script>
window.clicks=0;document.addEventListener('click',()=>window.clicks++);
document.addEventListener('submit',e=>{e.preventDefault();window.clicks++});
localStorage.setItem('bs_rewards:CA1126VANW:queue',JSON.stringify([{code:'000000000000000000000000000001',state:'pending'}]));
localStorage.setItem('bs_rewards:CA1126VANW:giftcards',JSON.stringify([{cardMerchant:'Fixture',valueRecent:'10.00',gcNumber:'TEST_SECRET_CARD',gcPin:'0000'}]));
localStorage.setItem('bs_rewards:CA1126VANW:auto','1');
window.before=JSON.stringify(Object.entries(localStorage).sort());
</script></body></html>"""
with TemporaryDirectory() as profile, sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context(profile,channel="chromium",headless=True,args=[f"--disable-extensions-except={root}",f"--load-extension={root}"])
    try:
        worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker",timeout=15000)
        ext_id=worker.url.split("/")[2]
        # All HTTPS traffic in this context is synthetic; no live requests or credentials.
        ctx.route("https://**/*",lambda route:route.fulfill(status=200,content_type="text/html",body=fixture) if route.request.url.startswith("https://getmybonus.ca/CA1126VANW") else route.abort())
        page=ctx.new_page()
        worker.evaluate("chrome.storage.local.set({diagnosticsEnabled:true})")
        page.goto("https://getmybonus.ca/CA1126VANW/en?token=QUERY_SECRET")
        tab=worker.evaluate("async()=> (await chrome.tabs.query({})).find(t=>t.url?.startsWith('https://getmybonus.ca/')).id")
        report=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const result=await inspectTab(id);if(result.report)return result;await new Promise(r=>setTimeout(r,100));}throw Error('no content report')}""",tab)
        assert report["report"]["status"]=="recognized"
        assert report["report"]["stage"]=="entry"
        assert report["report"]["controls"]["submit"]["actionable"]==0
        assert report["report"]["controls"]["hidden"]["visible"]==0
        assert report["summary"]["queue"]["pending"]==1 and report["summary"]["unresolved"]
        assert report["summary"]["rewards"]==1
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
        assert page.locator(".wizard-serial-number").input_value()=="SYNTHETIC_SECRET"
        assert page.evaluate("typeof globalThis.RewardsDiscovery")== "undefined"
        print("isolated read-only recognition, active vs inactive control and v15 cache PASS",flush=True)
        records=worker.evaluate("""async()=>{for(let i=0;i<50;i++){const data=await diagnostics();if(data.records.length)return data.records;await new Promise(r=>setTimeout(r,100));}throw Error('no persisted diagnostics')}""")
        import json
        text=json.dumps(records)
        for secret in ("SYNTHETIC_SECRET","PRIVATE_TEST_TOKEN","SECRET@example.invalid","PIN-123","DO-NOT-STORE","TEST_SECRET_CARD","QUERY_SECRET","000000000000000000000000000001"):
            assert secret not in text
        page.bring_to_front()
        exported=worker.evaluate("(target)=>exportTab(target)",report["target"])
        assert exported=={"ok":True,"rows":[{"cardMerchant":"Fixture","valueRecent":"10.00","gcNumber":"TEST_SECRET_CARD","gcPin":"0000"}]}
        stale=dict(report["target"],documentToken="00000000-0000-0000-0000-000000000000")
        assert not worker.evaluate("(target)=>exportTab(target)",stale)["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
        print("explicit reward export, stale context rejected, original cache unchanged PASS",flush=True)
        before=len(records)
        page.evaluate("document.body.dataset.slug='CA1126PZFT'")
        page.wait_for_timeout(600)
        conflict=worker.evaluate("(id)=>inspectTab(id)",tab)
        assert conflict["report"]["status"]=="conflict" and conflict["summary"] is None
        assert worker.evaluate("async()=> (await diagnostics()).records.length")==before
        assert not worker.evaluate("(target)=>exportTab(target)",report["target"])["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
        print("sanitized diagnostics persisted; conflict blocks cache read and recording PASS",flush=True)
    finally:ctx.close()
