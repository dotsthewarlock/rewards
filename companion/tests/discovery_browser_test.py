"""Native isolated-world discovery against synthetic route fulfillment, never a real merchant."""
from pathlib import Path
import os
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect
from claim_fixture import CODE, URL, success_fixture, assert_captured
from foreground_fixture import exercise_final, URL as FINAL_URL, FIXTURE as FINAL_FIXTURE, show_linked_success, assert_final_captured
root=Path(os.environ.get("COMPANION_EXTENSION_DIR",Path(__file__).resolve().parents[1]/"extension")).resolve()
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
        # Exercise the actual extension workspace sender with the merchant fixture active.
        # A regular extension tab is not the native side-panel surface; the trusted
        # click/reveal UI lifecycle remains covered by the connected bookmarklet suite.
        panel=ctx.new_page()
        try:
            panel.goto(f"chrome-extension://{ext_id}/index.html")
            page.bring_to_front()
            expect(panel.locator("#context")).to_contain_text("Walmart Canada",timeout=15000)
            expect(panel.locator("main")).to_contain_text("1 pending")
            connected=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'inspect'})")
            assert connected["target"]["tabId"]==tab
            assert "TEST_SECRET_CARD" not in json.dumps(connected["details"])
            selection=connected["details"]["rewardSnapshot"]
            row=panel.evaluate("([t,s])=>chrome.runtime.sendMessage({type:'companion.workspace',op:'revealReward',target:t,snapshot:s,index:0})",[connected["target"],selection])
            assert row=={"ok":True,"snapshot":selection,"index":0,"row":exported["rows"][0]}
            assert not panel.evaluate("([t,s])=>chrome.runtime.sendMessage({type:'companion.workspace',op:'revealReward',target:t,snapshot:s,index:0})",[connected["target"],snapshot])["ok"]
            expect(panel.locator("main")).not_to_contain_text("TEST_SECRET_CARD")
            diagnostic_export=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'exportDiagnostics'})")
            assert diagnostic_export["export"]["provenance"]["distribution"]=="mv3"
            assert diagnostic_export["export"]["provenance"]["evidence"]=="structural-only"
            assert "TEST_SECRET_CARD" not in json.dumps(diagnostic_export)
            assert diagnostic_export["export"]["records"]==records
            assert diagnostic_export["export"]["events"][0]["snapshot"]==0
            assert diagnostic_export["export"]["events"][0]["reason"]=="initial"
            # Manual capture is bound to current recognized context, enabled recording and trusted workspace sender.
            capture=panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'captureDiagnostics',target:t})",connected["target"])
            assert capture=={"ok":True},capture
            captured=worker.evaluate("async()=>await diagnostics()")
            assert captured["records"]==records
            assert len(captured["events"])==len(diagnostic_export["export"]["events"])+1
            assert captured["events"][-1]["reason"]=="manual-capture"
            assert not panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'captureDiagnostics',target:t})",stale)["ok"]
            worker.evaluate("chrome.storage.local.set({diagnosticsEnabled:false})")
            denied=panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'captureDiagnostics',target:t})",connected["target"])
            assert denied=={"ok":False,"reason":"diagnostics-disabled-or-unrecognized"},denied
            assert worker.evaluate("async()=> (await diagnostics()).events")==captured["events"]
            worker.evaluate("chrome.storage.local.set({diagnosticsEnabled:true})")
            assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
            print("Manual evidence capture, stale target and recording opt-in PASS",flush=True)
            # Exercise the actual index sender and trusted manual click against a
            # worker-local synthetic response, never the public network.
            worker.evaluate("""()=>{globalThis.catalogFetchCalls=0;globalThis.catalogMode='ok';
              globalThis.fetch=async(url,opts)=>{
                if(url!=='https://getmybonus.ca/'||opts.method!=='GET'||opts.credentials!=='omit'||opts.redirect!=='error')throw Error('unexpected request');
                catalogFetchCalls++;
                const html='<h2>Select the qualifying offer to claim your bonus eGift card</h2>'+
                  ['CA1126WG1','CA1126WXB','CA1126VANW','CA1226WUDC','CA1226WGT','CA1226WG1'].map(s=>'<a href="/'+s+'/en">PRIVATE_FIXTURE</a>').join('');
                const r=new Response(catalogMode==='ok'?html:catalogMode==='restricted'?html+'<p>Access denied</p>':'<p>Temporary error</p>',{status:200,headers:{'content-type':'text/html'}});
                Object.defineProperty(r,'url',{value:url});return r;
              };}""")
            panel.locator('[data-action="navigate"][data-value="campaigns"]').click()
            expect(panel.locator("main")).to_contain_text("Not yet checked")
            assert worker.evaluate("catalogFetchCalls")==0
            panel.get_by_role("button",name="Refresh public directory").click()
            expect(panel.locator("main")).to_contain_text("CA1226WG1",timeout=10000)
            catalog=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'getCatalog'})")["catalog"]
            assert len(catalog["entries"])==6 and catalog["outcome"]=="verified-directory"
            assert "PRIVATE_FIXTURE" not in json.dumps(catalog)
            assert "TEST_SECRET_CARD" not in json.dumps(catalog)
            assert worker.evaluate("catalogFetchCalls")==1
            assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
            worker.evaluate("catalogMode='unavailable'")
            panel.get_by_role("button",name="Refresh public directory").click()
            expect(panel.locator("main")).to_contain_text("Previously seen · stale")
            expect(panel.locator("main")).not_to_contain_text("Listed at last check")
            failed=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'getCatalog'})")["catalog"]
            assert failed["outcome"]=="unavailable" and len(failed["entries"])==6
            assert all(not e["listed"] for e in failed["entries"])
            worker.evaluate("catalogMode='restricted'")
            panel.get_by_role("button",name="Refresh public directory").click()
            expect(panel.locator("main")).to_contain_text("Access restricted")
            expect(panel.get_by_role("button",name="Refresh public directory")).to_be_disabled()
            stopped=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'refreshCatalog'})")["catalog"]
            assert stopped["outcome"]=="restricted" and len(stopped["entries"])==6
            assert all(not e["listed"] for e in stopped["entries"])
            assert worker.evaluate("catalogFetchCalls")==3
            assert worker.evaluate("async()=> (await chrome.storage.local.get('publicCampaignCatalogV1')).publicCampaignCatalogV1")==stopped
            assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
            print("M1 manual catalog transport, privacy, restricted stop and unchanged legacy state PASS",flush=True)
            # Invalid existing observations must not be silently discarded by recording.
            original=worker.evaluate("async()=> (await chrome.storage.local.get('structuralRecords')).structuralRecords")
            worker.evaluate("rows=>chrome.storage.local.set({structuralRecords:[...rows,{invalid:true}]})",original)
            assert worker.evaluate("async()=> (await diagnostics()).blocked")
            variant=dict(report["report"],labels=[])
            assert not worker.evaluate("r=>record(r)",variant)["ok"]
            assert worker.evaluate("async()=> (await chrome.storage.local.get('structuralRecords')).structuralRecords")==original+[{"invalid":True}]
            worker.evaluate("rows=>chrome.storage.local.set({structuralRecords:Array.from({length:500},()=>rows[0])})",original)
            assert worker.evaluate("async()=> (await diagnostics()).blocked")
            assert not worker.evaluate("r=>record(r)",variant)["ok"]
            assert worker.evaluate("async()=> (await chrome.storage.local.get('structuralRecords')).structuralRecords.length")==500
            worker.evaluate("rows=>chrome.storage.local.set({structuralRecords:rows})",original)
            print("Connected MV3 index workspace, actual sender validation and read-only single-row response PASS",flush=True)
        finally:
            panel.close()
            page.bring_to_front()
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
        # Timeline retains return-to-earlier-state without duplicating the snapshot.
        initial=report["report"]
        variant=dict(initial,labels=[])
        old=worker.evaluate("async()=>await diagnostics()")
        assert not old["blocked"], "unexpected retention or timeline validation block"
        # Reproduce the former verifier against the actual Chrome storage round-trip.
        # Temporary fixture key only; compare canonical expected records with the raw value.
        probe=worker.evaluate("""async r=>{
          const data=await diagnostics(),at=new Date().toISOString(),records=[...data.records,{at,report:RewardsDiscovery.validate(r,r.origin)}];
          const events=[...data.events,{at,snapshotAt:at,snapshot:records.length-1,reason:'structure-change'}];
          await chrome.storage.local.set({diagnosticReadbackFixture:{records,events}});
          const stored=(await chrome.storage.local.get('diagnosticReadbackFixture')).diagnosticReadbackFixture;
          await chrome.storage.local.remove('diagnosticReadbackFixture');
          return {oldReason:JSON.stringify(stored.records)!==JSON.stringify(records)||JSON.stringify(stored.events)!==JSON.stringify(events)?'diagnostics-write-unverified':'ok',
            exact:sameStoredValue(stored.records,records)&&sameStoredValue(stored.events,events)};
        }""",variant)
        print("Former verifier on Chrome round-trip:",probe,flush=True)
        assert probe["exact"], probe
        for packet,reason in [(variant,"structure-change"),(initial,"control-interaction")]:
            response=worker.evaluate("([r,reason])=>record(r,reason)",[packet,reason])
            assert response["ok"], response
        timeline=worker.evaluate("async()=>await diagnostics()")
        assert len(timeline["records"])==len(old["records"])+1
        assert len(timeline["events"])==len(old["events"])+2
        assert timeline["events"][-1]["snapshot"]==0
        assert timeline["events"][-1]["reason"]=="control-interaction"
        assert not worker.evaluate("r=>record(r,'SECRET_EVENT')",initial)["ok"]
        assert "SECRET_EVENT" not in json.dumps(worker.evaluate("async()=>await diagnostics()"))
        assert worker.evaluate("""()=>sameStoredValue({b:[1,{z:2,a:3}],a:0},{a:0,b:[1,{a:3,z:2}]})&&
          !sameStoredValue({a:[1,2]},{a:[2,1]})&&!sameStoredValue({a:1},{a:'1'})&&
          !sameStoredValue({a:1},{a:1,extra:true})&&!sameStoredValue([null],[])&&
          !sameStoredValue({a:null},{a:0})""")
        # Mismatched snapshot linkage must block and preserve all existing data.
        worker.evaluate("async events=>chrome.storage.local.set({structuralEvents:events})",timeline["events"]+[dict(timeline["events"][-1],snapshot=999)])
        assert worker.evaluate("async()=> (await diagnostics()).blocked")
        response=worker.evaluate("r=>record(r)",initial)
        assert response=={"ok":False,"reason":"diagnostics-retention-blocked"}, response
        assert len(worker.evaluate("async()=> (await chrome.storage.local.get('structuralEvents')).structuralEvents"))==len(timeline["events"])+1
        worker.evaluate("async events=>chrome.storage.local.set({structuralEvents:events})",timeline["events"])
        assert not worker.evaluate("async()=> (await diagnostics()).blocked")
        print("bounded deduplicated diagnostic timeline retains repeated states and fixed reasons PASS",flush=True)
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
        for script in ("core/identity.js","discovery/core.js","core/legacy.js","discovery/success.js"):
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
