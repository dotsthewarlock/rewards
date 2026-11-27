"""Native isolated-world discovery against synthetic route fulfillment, never a real merchant."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
from claim_fixture import CODE, URL, success_fixture, assert_captured
from foreground_fixture import exercise_final, URL as FINAL_URL, FIXTURE as FINAL_FIXTURE, show_linked_success, assert_final_captured
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
        assert report["details"]["queue"]==[{"last4":"0001","state":"pending"}]
        assert report["details"]["rewards"]==[{"last4":None,"value":"10.00"}]
        assert "TEST_SECRET_CARD" not in json.dumps(report["details"])
        snapshot=report["details"]["rewardSnapshot"]
        one=worker.evaluate("([t,s])=>revealTab(t,s,0)",[report["target"],snapshot])
        assert one=={"ok":True,"snapshot":snapshot,"index":0,"row":exported["rows"][0]}
        assert not worker.evaluate("([t,s])=>revealTab(t,s,0)",[stale,snapshot])["ok"]
        page.evaluate("""()=>{const k='bs_rewards:CA1126VANW:giftcards';window.originalGift=localStorage.getItem(k);const rows=JSON.parse(window.originalGift);rows[0].gcPin='CHANGED_FIXTURE';localStorage.setItem(k,JSON.stringify(rows))}""")
        assert not worker.evaluate("([t,s])=>revealTab(t,s,0)",[report["target"],snapshot])["ok"]
        page.evaluate("localStorage.setItem('bs_rewards:CA1126VANW:giftcards',window.originalGift)")
        assert not worker.evaluate("([t,s])=>revealTab(t,s,0)",[report["target"],snapshot])["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
        print("MV3 connected single-record reveal transport, stale document and changed cache rejected PASS",flush=True)
        draft="Receipt: 000000000000000000000000000001\n012345678901234567890123456789"
        preview=worker.evaluate("([target,text])=>previewTab(target,text)",[report["target"],draft])
        assert preview=={"ok":True,"queued":1,"duplicates":1,"overflow":0,"recognized":2}
        assert not worker.evaluate("([target,text])=>previewTab(target,text)",[stale,draft])["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
        print("explicit reward export, masked queue, import preview, stale context rejected, original cache unchanged PASS",flush=True)
        before=len(records)
        page.evaluate("document.body.dataset.slug='CA1126PZFT'")
        page.wait_for_timeout(600)
        conflict=worker.evaluate("(id)=>inspectTab(id)",tab)
        assert conflict["report"]["status"]=="conflict" and conflict["summary"] is None
        assert worker.evaluate("async()=> (await diagnostics()).records.length")==before
        assert not worker.evaluate("(target)=>exportTab(target)",report["target"])["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
        print("sanitized diagnostics persisted; conflict blocks cache read and recording PASS",flush=True)
        # Explicit edits only after replacing the fixture's pending row with ready.
        page.evaluate("""()=>{document.body.dataset.slug='CA1126VANW';localStorage.setItem('bs_rewards:CA1126VANW:queue',JSON.stringify([{id:'legacy',code:'000000000000000000000000000001',state:'queued'}]));}""")
        page.bring_to_front()
        fresh=worker.evaluate("(id)=>inspectTab(id)",tab)
        assert fresh["report"]["status"]=="recognized"
        target=fresh["target"]
        page.evaluate("""()=>new Promise(resolve=>{navigator.locks.request('bs_rewards:companion:data-v1',()=>new Promise(release=>{window.releaseEditLock=release;resolve()}))})""")
        blocked=worker.evaluate("t=>editTab(t,'saveClipboard',true)",target)
        assert blocked=={"ok":False,"reason":"edit-busy"},blocked
        page.evaluate("window.releaseEditLock()")
        page.wait_for_timeout(100)
        edited=worker.evaluate("([t,text])=>editTab(t,'importQueue',text)",[target,"012345678901234567890123456789"])
        assert edited=={"ok":True,"queued":1,"duplicates":0,"overflow":0,"recognized":1},edited
        rows=page.evaluate("JSON.parse(localStorage.getItem('bs_rewards:CA1126VANW:queue'))")
        assert rows[0]["id"]=="legacy" and rows[1]["code"]=="012345678901234567890123456789"
        assert worker.evaluate("t=>editTab(t,'saveEmail','fixture@example.invalid')",target)=={"ok":True}
        assert page.evaluate("localStorage.getItem('bs_rewards:CA1126VANW:email')")=="fixture@example.invalid"
        assert page.evaluate("window.clicks===0 && !localStorage.getItem('bs_rewards:CA1126VANW:active')")
        print("MV3 explicit cache edits and origin-shared page-world lock PASS",flush=True)
        # Candidate success parser, evaluated only in this synthetic document.
        # There is no production call path and no authentic success evidence yet.
        success_code="012345678901234567890123456789"
        page.set_content(f"""<!doctype html><html><body data-slug="CA1126VANW">
<main class="value-add wizard"><section class="redemption-form">
<p>Eligible Card: {success_code}</p><p hidden>Eligible Card: 000000000000000000000000000001</p>
<div class="confirmation-block"><h3>You earned $15</h3><p class="h5">Walmart eGift Card</p>
<div class="codes-container"><div class="title">Bonus Code</div><div class="text">000012345678</div><div class="title">PIN</div><div class="text">0000</div></div></div>
<button class="btn-claim-another-code">Claim Another</button></section></main></body></html>""")
        for script in ("discovery/core.js","discovery/legacy.js","discovery/success.js"):
            page.evaluate((root/script).read_text())
        captured=page.evaluate("code=>RewardsSuccess.readSuccess(document,code)",success_code)
        assert captured=={"ok":True,"card":{"cardMerchant":"Walmart","valueRecent":"15.00","gcNumber":"000012345678","gcPin":"0000","sourceRedemptionCode":success_code}},captured
        assert not page.evaluate("()=>RewardsSuccess.readSuccess(document,'000000000000000000000000000001')")["ok"]
        assert "000012345678" not in json.dumps(page.evaluate("RewardsDiscovery.report(document)"))
        page.locator(".codes-container").evaluate("el=>el.insertAdjacentHTML('beforeend','<div class=title>Card PIN</div><div class=text>1234</div>')")
        assert not page.evaluate("code=>RewardsSuccess.readSuccess(document,code)",success_code)["ok"]
        print("candidate v15 success parsing, exact eligible linkage, hidden and ambiguous fields PASS",flush=True)
        # Real extension transport, synthetic durable intent. No merchant clicks.
        ctx.route(URL,lambda route:route.fulfill(status=200,content_type="text/html",body=success_fixture()))
        page.goto(URL)
        page.bring_to_front()
        recovered=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.report?.stage==='success'&&r.target)return r;await new Promise(r=>setTimeout(r,100));}throw Error('no success target')}""",tab)
        target=recovered["target"]
        attempt_id=recovered["recovery"]["attemptId"]
        assert recovered["recovery"]["last4"]==CODE[-4:]
        assert recovered["summary"]["unresolved"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before")
        assert not worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt_id])["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before")
        page.locator("#eligible").evaluate("(el,code)=>el.textContent='Eligible Card: '+code",CODE)
        stale=dict(target,documentToken="00000000-0000-0000-0000-000000000000")
        assert not worker.evaluate("([t,a])=>reconcileTab(t,a)",[stale,attempt_id])["ok"]
        assert not worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,"00000000-0000-0000-0000-000000000099"])["ok"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before")
        assert worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt_id])=={"ok":True,"status":"complete"}
        assert_captured(page)
        assert not worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt_id])["ok"]
        assert_captured(page)
        print("MV3 explicit linked reconciliation, mismatch, stale target and replay rejected PASS",flush=True)
        exercise_final(page,ctx,root)
        page.goto(FINAL_URL)
        page.bring_to_front()
        final=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.target&&r.report?.controls.submit.actionable===1)return r;await new Promise(r=>setTimeout(r,100));}throw Error('no final target')}""",tab)
        target=final["target"]
        prepared=worker.evaluate("t=>prepareTab(t)",target)
        assert prepared["ok"] and prepared["review"]["code"]==CODE
        attempt=prepared["review"]["attemptId"]
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
        assert not worker.evaluate("([t,a])=>authorizeTab(t,a,false)",[target,attempt])["ok"]
        assert not worker.evaluate("([t,a])=>authorizeTab(t,a,true)",[target,"00000000-0000-0000-0000-000000000099"])["ok"]
        assert worker.evaluate("([t,a])=>authorizeTab(t,a,true)",[target,attempt])=={"ok":True,"status":"pending"}
        assert page.evaluate("window.submits===1&&window.pendingAtClick")
        assert not worker.evaluate("([t,a])=>authorizeTab(t,a,true)",[target,attempt])["ok"]
        show_linked_success(page)
        recovered=worker.evaluate("t=>inspectTab(t)",tab)
        assert recovered["recovery"]["attemptId"]==attempt
        assert worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt])=={"ok":True,"status":"complete"}
        assert_final_captured(page)
        assert not worker.evaluate("t=>prepareTab(t)",target)["ok"]
        print("MV3 actual shared transport: exact review, explicit authorization, pending intent, linked capture, no replay/advance PASS",flush=True)
    finally:ctx.close()
