"""Native isolated-world discovery against synthetic route fulfillment, never a real merchant."""
from pathlib import Path
import os
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect
from claim_fixture import CODE, URL, success_fixture, assert_captured
from queue_removal_fixture import ROWS, FAULT, seed, snapshot as queue_snapshot, assert_removed, hold_lock, isolated_world, fault_in_world
from foreground_fixture import exercise_final, URL as FINAL_URL, FIXTURE as FINAL_FIXTURE, WORKFLOW_FIXTURE, show_linked_success, assert_final_captured, HIDDEN_BARCODE_FIXTURE, enter_hidden_barcode, inactive_barcode, hidden_final
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
            expect(panel.locator("main")).to_contain_text("Absence of confirmation does not prove failure")
            expect(panel.get_by_role("button",name="Review safe removals")).to_have_count(0)
            expect(panel.get_by_role("button",name="Capture matching reward")).to_have_count(0)
            connected=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'inspect'})")
            if os.environ.get("COMPANION_EXTENSION_DIR") and os.environ.get("GITHUB_SHA"):
                panel.evaluate("document.querySelector('[data-value=settings]').click()")
                expect(panel.locator("main")).to_contain_text("0.6.0 Preview")
                panel.get_by_text("Version details",exact=True).evaluate("el=>el.click()")
                expect(panel.locator("main")).to_contain_text(os.environ["GITHUB_SHA"])
                expect(panel.get_by_role("link",name="Check for updates")).to_have_attribute("rel","noopener noreferrer")
                panel.evaluate("document.querySelector('[data-value=queue]').click()")
            assert not panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'prepareNext',target:t})",connected["target"])["ok"]
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
            # Old snapshots without events remain valid and are not backfilled.
            original=worker.evaluate("async()=>await diagnostics()")
            worker.evaluate("()=>chrome.storage.local.set({structuralEvents:[]})")
            legacy=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'exportDiagnostics'})")["export"]
            assert legacy["records"]==original["records"] and legacy["events"]==[]
            assert legacy["provenance"]["captureBuild"]=="unknown-or-mixed" and legacy["provenance"]["coverageComplete"] is False
            worker.evaluate("events=>chrome.storage.local.set({structuralEvents:events})",original["events"])
            # Actual persisted preference, exact readback, and failed preference
            # writes through the real workspace sender. No production test hooks.
            def preference(enabled):
                return panel.evaluate("enabled=>chrome.runtime.sendMessage({type:'companion.workspace',op:'setDiagnostics',enabled})",enabled)
            assert preference(False)=={"ok":True,"enabled":False,"capture":None}
            assert worker.evaluate("async()=> (await chrome.storage.local.get('diagnosticsEnabled')).diagnosticsEnabled") is False
            assert worker.evaluate("async()=> (await diagnostics()).records")==original["records"]
            worker.evaluate("""()=>{const s=chrome.storage.local,old=s.set;
              globalThis.restoreDiagnosticSet=()=>{s.set=old;delete globalThis.restoreDiagnosticSet};
              s.set=async value=>{if(Object.hasOwn(value,'diagnosticsEnabled'))return;return old.call(s,value)};}""")
            try:
                assert preference(True)=={"ok":False,"reason":"diagnostics-preference-unverified"}
                assert worker.evaluate("async()=> (await diagnostics()).enabled") is False
            finally:
                worker.evaluate("restoreDiagnosticSet()")
            enabled=preference(True)
            assert enabled=={"ok":True,"enabled":True,"capture":"recorded"},enabled
            assert worker.evaluate("async()=> (await chrome.storage.local.get('diagnosticsEnabled')).diagnosticsEnabled") is True
            saved=worker.evaluate("async()=>await diagnostics()")
            for mode in ("throw","readback"):
                worker.evaluate("""mode=>{const s=chrome.storage.local,old=s.set;
                  globalThis.restoreDiagnosticSet=()=>{s.set=old;delete globalThis.restoreDiagnosticSet};
                  s.set=async value=>{if(Object.hasOwn(value,'structuralRecords')){if(mode==='throw')throw Error('synthetic storage failure');return;}return old.call(s,value)};}""",mode)
                try:
                    failed=panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'captureDiagnostics',target:t})",connected["target"])
                    assert failed=={"ok":False,"reason":"diagnostics-write-unverified"},failed
                    assert worker.evaluate("async()=>await diagnostics()")==saved
                finally:
                    worker.evaluate("restoreDiagnosticSet()")
            observed=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'inspect'})")
            assert observed["diagnostics"]["issue"]=="diagnostics-write-unverified"
            # User-facing export comes from the actual generated workspace marker.
            panel.evaluate("document.querySelector('#navigation [data-value=settings]').click()")
            panel.get_by_role("button",name="Refresh connection").evaluate("el=>el.click()")
            expect(panel.locator("main")).to_contain_text("Recording is on.")
            expect(panel.locator("main")).to_contain_text("Problem observed during this worker session")
            with panel.expect_download() as dl:
                panel.get_by_role("button",name="Export diagnostics").click()
            packet=json.loads(Path(dl.value.path()).read_text())
            assert packet["provenance"]["exporter"]=={"distribution":"mv3","version":"0.6.0" if os.environ.get("COMPANION_EXTENSION_DIR") and os.environ.get("GITHUB_SHA") else None,"commit":os.environ.get("GITHUB_SHA") if os.environ.get("COMPANION_EXTENSION_DIR") else None}
            assert packet["provenance"]["snapshotTime"]=="first-observed" and packet["provenance"]["eventTime"]=="observation"
            assert packet["provenance"]["captureBuild"]=="unknown-or-mixed"
            assert packet["records"]==saved["records"] and packet["events"]==saved["events"]
            for secret in ("SYNTHETIC_SECRET","PRIVATE_TEST_TOKEN","SECRET@example.invalid","TEST_SECRET_CARD","QUERY_SECRET","000000000000000000000000000001"):
                assert secret not in json.dumps(packet)
            # Real settings toggle feedback and persisted preference on panel reload.
            toggle=panel.get_by_label("Record page changes")
            toggle.uncheck()
            expect(panel.locator("#announcement")).to_contain_text("Recording off — preference saved and verified")
            panel.reload()
            panel.get_by_role("button",name="Settings",exact=True).click()
            expect(panel.get_by_label("Record page changes")).not_to_be_checked()
            worker.evaluate("""()=>{const s=chrome.storage.local,old=s.set;
              globalThis.restoreDiagnosticSet=()=>{s.set=old;delete globalThis.restoreDiagnosticSet};
              s.set=async value=>{if(Object.hasOwn(value,'diagnosticsEnabled'))return;return old.call(s,value)};}""")
            try:
                panel.get_by_label("Record page changes").click()
                expect(panel.locator("#announcement")).to_contain_text("Recording preference could not be verified in storage")
                expect(panel.get_by_label("Record page changes")).not_to_be_checked()
            finally:
                worker.evaluate("restoreDiagnosticSet()")
            panel.get_by_label("Record page changes").check()
            expect(panel.locator("#announcement")).to_contain_text("Recording on — preference saved and verified")
            page.bring_to_front()
            assert worker.evaluate("async()=> (await diagnostics()).enabled") is True
            # Read failure is distinct from off, empty evidence or a successful capture.
            worker.evaluate("""()=>{const s=chrome.storage.local,old=s.get;
              globalThis.restoreDiagnosticGet=()=>{s.get=old;delete globalThis.restoreDiagnosticGet};
              s.get=async keys=>{if(keys&&Object.hasOwn(keys,'structuralRecords'))throw Error('synthetic read failure');return old.call(s,keys)};}""")
            try:
                failed=panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'inspect'})")
                assert failed["diagnostics"]["enabled"] is None and failed["diagnostics"]["count"] is None
                assert failed["diagnostics"]["issue"]=="diagnostics-storage-unavailable"
                assert panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'captureDiagnostics',target:t})",connected["target"])=={"ok":False,"reason":"diagnostics-storage-unavailable"}
                assert panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'exportDiagnostics'})")=={"ok":False,"reason":"diagnostics-storage-unavailable"}
            finally:
                worker.evaluate("restoreDiagnosticGet()")
            assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.clicks===0")
            print("Packaged MV3 diagnostic export identity, old records, time/coverage semantics, persisted preference, storage fault/readback and UI feedback PASS",flush=True)
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
        # Actual packaged content/worker and trusted workspace sender; the
        # extension tab is not a native side panel. Shared trusted-click UI
        # confirmation and keyboard behavior are exercised in the bookmarklet.
        removal_panel=ctx.new_page()
        try:
            removal_panel.goto(f"chrome-extension://{ext_id}/index.html")
            page.bring_to_front()
            def inspect_removal():
                return removal_panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'inspect'})")
            def command(t, edit, value):
                return removal_panel.evaluate("([target,edit,value])=>chrome.runtime.sendMessage({type:'companion.workspace',op:'editCache',target,edit,value})",[t,edit,value])
            def preview_removal(index=None, state=None):
                state=state or inspect_removal()
                return command(state["target"],"previewRemoval",{"snapshot":state["details"]["queueSnapshot"],"index":index})
            def confirm(t, review, confirmed=True):
                return command(t,"removeQueue",{"token":review["token"],"confirmed":confirmed})
            before=seed(page)
            state=inspect_removal()
            t=state["target"]
            assert state["details"]["queueBlock"] is None
            assert "PRIVATE_FIXTURE_CARD" not in json.dumps(state["details"])
            assert ROWS[1]["code"] not in json.dumps(state["details"])
            one=preview_removal(1,state)
            assert one["ok"] and one["rows"]==[{"index":1,"last4":"0001"}] and one["retained"]==len(ROWS)-1,one
            assert queue_snapshot(page)==before
            assert not confirm(t,one,False)["ok"]
            assert command(t,"cancelRemoval",{"token":one["token"]})=={"ok":True}
            assert not confirm(t,one)["ok"] and queue_snapshot(page)==before
            one=preview_removal(1)
            assert confirm(t,one)=={"ok":True,"removed":1}
            assert_removed(page,before,[1])
            assert not confirm(t,one)["ok"]
            before=queue_snapshot(page)
            bulk=preview_removal()
            assert bulk["rows"]==[{"index":0,"last4":"0001"},{"index":1,"last4":"0003"}],bulk
            assert confirm(t,bulk)=={"ok":True,"removed":2}
            assert_removed(page,before,[0,1])
            assert not preview_removal()["ok"]
            # Stale UI snapshot and stale confirmation after same-suffix reorder.
            before=seed(page)
            state=inspect_removal()
            one=preview_removal(1,state)
            changed=seed(page,[ROWS[1],ROWS[0],*ROWS[2:]])
            assert not confirm(t,one)["ok"] and queue_snapshot(page)==changed
            assert not preview_removal(1,state)["ok"] and queue_snapshot(page)==changed
            before=seed(page)
            one=preview_removal(1)
            stale=dict(t,documentToken="00000000-0000-0000-0000-000000000000")
            assert not confirm(stale,one)["ok"] and queue_snapshot(page)==before
            assert command(t,"cancelRemoval",{"token":one["token"]})=={"ok":True}
            # Real page-world lock competes with the extension's isolated world.
            one=preview_removal(1)
            hold_lock(page)
            assert confirm(t,one)=={"ok":False,"reason":"edit-busy"}
            assert queue_snapshot(page)==before
            page.evaluate("window.releaseQueueLock()")
            page.wait_for_timeout(100)
            assert not confirm(t,one)["ok"] and queue_snapshot(page)==before
            # Fault-inject only the exact loaded extension content world.
            cdp, world=isolated_world(ctx,page)
            try:
                for mode in ("throw","readback"):
                    one=preview_removal(1)
                    assert one["ok"],one
                    fault_in_world(cdp,world,"("+FAULT+")("+json.dumps(mode)+")")
                    try:
                        assert confirm(t,one)=={"ok":False,"reason":"edit-outcome-unknown"}
                        assert queue_snapshot(page)==before
                        assert not confirm(t,one)["ok"]
                    finally:
                        fault_in_world(cdp,world,"globalThis.restoreQueueWrite()")
            finally:
                cdp.detach()
            for opts,reason in [
                ({"rows":[dict(ROWS[0],state="pending"),*ROWS[1:]]},"pending"),
                ({"rows":[dict(ROWS[0],state="processing"),*ROWS[1:]]},"processing"),
                ({"active":{"id":ROWS[0]["id"],"phase":"submitted","code":ROWS[0]["code"]}},"active"),
                ({"lock":{"owner":"legacy-fixture"}},"locked"),
                ({"gifts":[{"gcNumber":"UNKNOWN_LINK"}]},"ambiguous"),
            ]:
                before=seed(page,**opts)
                state=inspect_removal()
                assert state["details"]["queueBlock"]==reason,state
                assert not preview_removal(None,state)["ok"]
                assert state["recovery"] is None and queue_snapshot(page)==before
            before=seed(page)
            state=inspect_removal()
            one=preview_removal(1,state)
            page.locator("main.bcr-redemption").evaluate("el=>el.replaceWith(el.cloneNode(true))")
            assert not confirm(state["target"],one)["ok"] and queue_snapshot(page)==before
            assert inspect_removal()["target"]["documentToken"]!=state["target"]["documentToken"]
            assert page.evaluate("window.clicks===0")
            print("Packaged MV3 queue removal: trusted sender, exact single/bulk, cancellation, stale selection/document, linked retention, ownership, write/readback uncertainty, masked unresolved blocking PASS",flush=True)
        finally:
            removal_panel.close()
            page.bring_to_front()
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
        result=worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt_id])
        assert result=={"ok":True,"status":"complete"},result
        assert_captured(page)
        assert not worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt_id])["ok"]
        assert_captured(page)
        print("MV3 explicit linked reconciliation, mismatch, stale target and replay rejected PASS",flush=True)
        exercise_final(page,ctx,root)
        # Same-node visible -> inactive -> hidden transition, with silent value
        # mutation. No predicate changes or actual submissions are allowed.
        ctx.route(FINAL_URL,lambda route:route.fulfill(status=200,content_type="text/html",body=HIDDEN_BARCODE_FIXTURE))
        page.goto(FINAL_URL)
        page.bring_to_front()
        enter_hidden_barcode(page)
        current=lambda:worker.evaluate("id=>inspectTab(id)",tab)
        visible=current()
        assert visible["report"]["controls"]["serial"]=={"present":1,"visible":1,"actionable":1}
        inactive_barcode(page)
        inactive=current()
        assert inactive["report"]["controls"]["serial"]=={"present":1,"visible":1,"actionable":0}
        hidden_final(page)
        hidden=current()
        assert hidden["report"]["controls"]["serial"]=={"present":1,"visible":0,"actionable":0}
        assert hidden["report"]["controls"]["submit"]["actionable"]==1
        assert not worker.evaluate("t=>prepareTab(t)",hidden["target"])["ok"]
        page.evaluate("window.fixtureBarcode.value='987654321098765432109876543210'")
        changed=current()
        assert changed["report"]==hidden["report"] and changed["target"]==hidden["target"]
        assert not worker.evaluate("t=>prepareTab(t)",changed["target"])["ok"]
        assert CODE not in json.dumps(changed["report"]) and "987654321098765432109876543210" not in json.dumps(changed["report"])
        assert page.evaluate("window.submits===0 && JSON.stringify(Object.entries(localStorage).sort())===window.before")
        print("MV3 same-node hidden barcode counterexample: visible/inactive/hidden evidence, silent value change, existing final gate rejects PASS",flush=True)
        ctx.route(FINAL_URL,lambda route:route.fulfill(status=200,content_type="text/html",body=WORKFLOW_FIXTURE))
        page.goto(FINAL_URL)
        page.bring_to_front()
        inspect=lambda:worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.target)return r;await new Promise(r=>setTimeout(r,100));}throw Error('no target')}""",tab)
        target=inspect()["target"]
        untouched=lambda:page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":False,"reason":"manual-stage"}
        assert untouched()
        page.locator("#start").click()
        target=inspect()["target"]
        code=page.locator(".wizard-serial-number")
        code.fill("999999999999999999999999999999")
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":False,"reason":"field-conflict"}
        assert code.input_value()=="999999999999999999999999999999" and untouched()
        code.fill("")
        code.evaluate("el=>el.disabled=true")
        assert not worker.evaluate("t=>prepareNextTab(t)",target)["ok"] and code.input_value()=="" and untouched()
        code.evaluate("el=>el.disabled=false")
        # A visible challenge, ambiguous field, existing attempt, duplicate history
        # or origin-wide lock blocks assistance without form or cache mutation.
        page.locator("#barcode-step").evaluate("el=>el.insertAdjacentHTML('beforeend','<div role=dialog id=blocker>Manual verification required</div>')")
        assert not worker.evaluate("t=>prepareNextTab(t)",target)["ok"] and code.input_value()=="" and untouched()
        page.locator("#blocker").evaluate("el=>el.remove()")
        code.evaluate("el=>{const copy=el.cloneNode(true);copy.id='ambiguous';el.after(copy)}")
        assert not worker.evaluate("t=>prepareNextTab(t)",target)["ok"] and untouched()
        page.locator("#ambiguous").evaluate("el=>el.remove()")
        page.evaluate("localStorage.setItem(prefix+'active',JSON.stringify({phase:'submitted'}))")
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":False,"reason":"legacy-busy"}
        assert code.input_value()=="" and page.evaluate("!!localStorage.getItem(prefix+'active') && window.submits===0")
        page.evaluate("localStorage.removeItem(prefix+'active')")
        page.evaluate("(code)=>localStorage.setItem(prefix+'history',JSON.stringify([{code}]))",CODE)
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":False,"reason":"queue-not-ready"}
        assert code.input_value()=="" and page.evaluate("!!localStorage.getItem(prefix+'history') && window.submits===0")
        page.evaluate("localStorage.removeItem(prefix+'history')")
        page.evaluate("""()=>new Promise(resolve=>navigator.locks.request('bs_rewards:companion:data-v1',()=>new Promise(release=>{window.releasePrep=release;resolve()})))""")
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":False,"reason":"edit-busy"}
        page.evaluate("window.releasePrep()")
        assert code.input_value()=="" and untouched()
        stale=dict(target,documentToken="00000000-0000-0000-0000-000000000000")
        assert not worker.evaluate("t=>prepareNextTab(t)",stale)["ok"] and code.input_value()=="" and untouched()
        prep_panel=ctx.new_page()
        try:
            prep_panel.goto(f"chrome-extension://{ext_id}/index.html")
            page.bring_to_front()
            assert prep_panel.evaluate("t=>chrome.runtime.sendMessage({type:'companion.workspace',op:'prepareNext',target:t})",target)=={"ok":True,"barcode":True,"email":False}
        finally:
            prep_panel.close()
            page.bring_to_front()
        assert code.input_value()==CODE and untouched()
        page.locator("#next").click()
        target=inspect()["target"]
        # A merchant rerender during the first field's event must stop the remaining
        # writes, with no implicit rollback or submission.
        page.locator("#workflow_data_email").evaluate("el=>el.addEventListener('input',()=>{const c=document.querySelector('#workflow_data_email_confirmation');c.replaceWith(c.cloneNode(true))},{once:true})")
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":False,"reason":"fields-unverified"}
        assert page.locator("#workflow_data_email_confirmation").input_value()=="" and untouched()
        # User has inspected the partial visible result; a fresh explicit click is safe.
        target=inspect()["target"]
        assert worker.evaluate("t=>prepareNextTab(t)",target)=={"ok":True,"barcode":True,"email":True}
        assert page.locator("#workflow_data_email").input_value()=="fixture@example.invalid"
        assert page.locator("#workflow_data_email_confirmation").input_value()=="fixture@example.invalid"
        assert not page.locator("#workflow_data_terms_of_service").is_checked() and untouched()
        assert not worker.evaluate("t=>prepareTab(t)",target)["ok"]
        page.locator("#workflow_data_terms_of_service").check()
        assert untouched()
        print("MV3 staged workflow: manual stages, exact field assistance, conflict/disabled/stale stops and no implicit submission PASS",flush=True)
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
        assert recovered["target"]["documentToken"]!=target["documentToken"]
        assert not worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt])["ok"]
        target=recovered["target"]
        assert worker.evaluate("([t,a])=>reconcileTab(t,a)",[target,attempt])=={"ok":True,"status":"complete"}
        assert_final_captured(page)
        assert not worker.evaluate("t=>prepareTab(t)",target)["ok"]
        print("MV3 actual shared transport: exact review, explicit authorization, pending intent, linked capture, no replay/advance PASS",flush=True)
        # Same URL and exact structural report, but a deeply nested wizard is replaced.
        lifecycle_url="https://getmybonus.ca/CA1126VANW/lifecycle-fixture"
        lifecycle_html="""<!doctype html><html><body data-slug="CA1126VANW"><div id="outer"><div id="ancestor"><div id="inner">
        <main class="bcr-redemption"><form id="new_workflow_data"><div class="step step_active"><input class="wizard-serial-number"><button type="button">Get My Bonus</button></div></form></main>
        </div></div></div><script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);document.addEventListener('submit',e=>{e.preventDefault();window.clicks++});</script></body></html>"""
        ctx.route(lifecycle_url,lambda route:route.fulfill(status=200,content_type="text/html",body=lifecycle_html))
        page.goto(lifecycle_url)
        page.bring_to_front()
        first=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.target&&r.report?.labels.includes('Get My Bonus'))return r;await new Promise(r=>setTimeout(r,100));}throw Error('no lifecycle target')}""",tab)
        page.wait_for_timeout(400)
        old_count=worker.evaluate("async()=> (await diagnostics()).events.length")
        page.locator("#ancestor").evaluate("el=>el.replaceWith(el.cloneNode(true))")
        page.wait_for_timeout(600)
        # Assert actual observer capture before any inspect can rebind it.
        assert worker.evaluate("async()=> (await diagnostics()).events.length")>old_count
        changed=worker.evaluate("id=>inspectTab(id)",tab)
        assert changed["report"]==first["report"]
        assert changed["target"]["documentToken"]!=first["target"]["documentToken"]
        assert not worker.evaluate("([t,text])=>previewTab(t,text)",[first["target"],CODE])["ok"]
        # Pagehide/pageshow invalidates even a same-document restored page.
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))")
        assert worker.evaluate("id=>inspectTab(id)",tab).get("target") is None
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
        restored=worker.evaluate("id=>inspectTab(id)",tab)
        assert restored["target"]["documentToken"]!=changed["target"]["documentToken"]
        assert not worker.evaluate("([t,text])=>previewTab(t,text)",[changed["target"],CODE])["ok"]
        # Real independent tabs share the origin's Web Lock; no synthetic merchant action.
        page.evaluate("""()=>new Promise(resolve=>navigator.locks.request('bs_rewards:companion:data-v1',()=>new Promise(release=>{window.releaseLifecycleLock=release;resolve()})))""")
        second=ctx.new_page()
        second.goto(lifecycle_url)
        second.bring_to_front()
        other_tab=worker.evaluate("async id=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].id",tab)
        second_state=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.target)return r;await new Promise(r=>setTimeout(r,100));}throw Error('no second target')}""",other_tab)
        assert worker.evaluate("t=>editTab(t,'saveClipboard',true)",second_state["target"])=={"ok":False,"reason":"edit-busy"}
        page.evaluate("window.releaseLifecycleLock()")
        second.wait_for_timeout(100)
        assert worker.evaluate("t=>editTab(t,'saveClipboard',true)",second_state["target"])=={"ok":True}
        second.evaluate("""code=>{const p='bs_rewards:CA1126VANW:';localStorage.setItem(p+'queue',JSON.stringify([{id:'fixture-pending',code,state:'pending'}]));localStorage.setItem(p+'active',JSON.stringify({phase:'submitted',fixture:true}));}""",CODE)
        saved=second.evaluate("JSON.stringify(Object.entries(localStorage).sort())")
        old_target=second_state["target"]
        second.reload()
        second.bring_to_front()
        reloaded=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.target)return r;await new Promise(r=>setTimeout(r,100));}throw Error('no reload target')}""",other_tab)
        assert reloaded["target"]["documentToken"]!=old_target["documentToken"] and reloaded["summary"]["unresolved"]
        assert not worker.evaluate("t=>editTab(t,'saveClipboard',false)",reloaded["target"])["ok"]
        assert second.evaluate("JSON.stringify(Object.entries(localStorage).sort())")==saved
        assert second.evaluate("window.clicks===0")
        # Persisted diagnostic timeline and unresolved site data survive actual
        # Chromium profile close/reopen; recording off means no new events.
        prefs_panel=ctx.new_page()
        prefs_panel.goto(f"chrome-extension://{ext_id}/index.html")
        assert prefs_panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'setDiagnostics',enabled:false})")=={"ok":True,"enabled":False,"capture":None}
        prefs_panel.close()
        worker.evaluate("async()=>{await recordingTail;}")
        persisted=worker.evaluate("async()=>await diagnostics()")
        assert not persisted["enabled"]
        for p0 in ctx.pages:
            p0.goto("about:blank")
            p0.close()
        ctx.close()
        ctx=p.chromium.launch_persistent_context(profile,channel="chromium",headless=True,args=[f"--disable-extensions-except={root}",f"--load-extension={root}"])
        worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker",timeout=15000)
        ctx.route("https://**/*",lambda route:route.fulfill(status=200,content_type="text/html",body=lifecycle_html) if route.request.url==lifecycle_url else route.abort())
        assert worker.evaluate("async()=>await diagnostics()")==persisted
        again=ctx.new_page()
        again.goto(lifecycle_url)
        again.bring_to_front()
        new_tab=worker.evaluate("async()=> (await chrome.tabs.query({active:true,currentWindow:true}))[0].id")
        after=worker.evaluate("""async id=>{for(let i=0;i<50;i++){const r=await inspectTab(id);if(r.target)return r;await new Promise(r=>setTimeout(r,100));}throw Error('no restart target')}""",new_tab)
        assert after["summary"]["unresolved"]
        assert again.evaluate("JSON.stringify(Object.entries(localStorage).sort())")==saved
        assert again.evaluate("window.clicks===0")
        assert worker.evaluate("async()=>await diagnostics()")==persisted
        print("Nested root replacement, same-document restoration, two-tab ownership, reload and browser restart persistence PASS",flush=True)
        # Verify the ON preference across a full browser restart as well as OFF.
        # No recognized merchant tab is open while enabling; no initial capture.
        again.close()
        prefs_panel=ctx.new_page()
        prefs_panel.goto(f"chrome-extension://{worker.url.split('/')[2]}/index.html")
        assert prefs_panel.evaluate("()=>chrome.runtime.sendMessage({type:'companion.workspace',op:'setDiagnostics',enabled:true})")=={"ok":True,"enabled":True,"capture":None}
        on_state=worker.evaluate("async()=>await diagnostics()")
        assert on_state==dict(persisted,enabled=True)
        for p0 in ctx.pages:
            p0.goto("about:blank")
            p0.close()
        ctx.close()
        ctx=p.chromium.launch_persistent_context(profile,channel="chromium",headless=True,args=[f"--disable-extensions-except={root}",f"--load-extension={root}"])
        worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker",timeout=15000)
        assert worker.evaluate("async()=>await diagnostics()")==on_state
        print("Both recording preference states survive full profile restart; earlier observations retained PASS",flush=True)
    finally:ctx.close()
