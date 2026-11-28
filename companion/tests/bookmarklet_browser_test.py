"""Exercise the generated shared workspace on a synthetic page, never a merchant."""
from pathlib import Path
import os
import json
from playwright.sync_api import sync_playwright, expect
from claim_fixture import CODE, URL, success_fixture, assert_captured
from queue_removal_fixture import ROWS, PREFIX, FAULT, seed, snapshot, assert_removed, hold_lock
from foreground_fixture import URL as FINAL_URL, FIXTURE as FINAL_FIXTURE, WORKFLOW_FIXTURE, show_linked_success, assert_final_captured, HIDDEN_BARCODE_FIXTURE, enter_hidden_barcode, inactive_barcode, hidden_final
root=Path(__file__).resolve().parents[1]
script=(root/".build/bookmarklet.js").read_text()
fixture="""<!doctype html><html><body data-slug="CA1126VANW"><main class="bcr-redemption"><form id="new_workflow_data"><div class="step step_active"><input class="wizard-serial-number" value="SYNTHETIC_SECRET"><button type="button">Get My Bonus</button></div></form></main><script>
window.merchantActions=0;document.querySelector('form').addEventListener('click',()=>window.merchantActions++);
localStorage.setItem('bs_rewards:CA1126VANW:queue',JSON.stringify([{code:'000000000000000000000000000001',state:'pending'}]));
localStorage.setItem('bs_rewards:CA1126VANW:giftcards',JSON.stringify([{cardMerchant:'Fixture',valueRecent:'10.00',gcNumber:'TEST_SECRET_CARD',gcPin:'0000'}]));
window.before=JSON.stringify(Object.entries(localStorage).sort());
</script></body></html>"""
with sync_playwright() as p:
    browser=p.chromium.launch()
    ctx=browser.new_context(accept_downloads=True,viewport={"width":360,"height":800})
    ctx.route("https://**/*",lambda route:route.fulfill(status=200,content_type="text/html",body=fixture) if route.request.url.startswith("https://getmybonus.ca/CA1126VANW") else route.abort())
    page=ctx.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto("https://getmybonus.ca/CA1126VANW/en")
    page.clock.install()
    page.evaluate(script)
    host=page.locator("#rewards-companion-dev")
    expect(host).to_contain_text("Legacy cache management")
    expect(host).to_contain_text("1 pending")
    expect(host).to_contain_text("Absence of confirmation does not prove failure")
    expect(host.get_by_role("button",name="Review safe removals")).to_have_count(0)
    expect(host.get_by_role("button",name="Capture matching reward")).to_have_count(0)
    expect(host).to_contain_text("•••• 0001")
    ctx.grant_permissions(["clipboard-read","clipboard-write"],origin="https://getmybonus.ca")
    page.evaluate("navigator.clipboard.writeText('Receipt: 000000000000000000000000000001\\n012345678901234567890123456789')")
    host.get_by_role("button",name="Paste from clipboard").click()
    expect(host.get_by_label("Redemption codes")).to_have_value("Receipt: 000000000000000000000000000001\n012345678901234567890123456789")
    host.get_by_role("button",name="Preview").click()
    expect(host.locator("#importResult")).to_contain_text("1 ready · 1 duplicates")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.merchantActions===0")
    assert page.evaluate("typeof globalThis.RewardsDiscovery")== "undefined"
    host.get_by_role("button",name="Rewards",exact=True).click()
    expect(host).to_contain_text("CAD $10.00")
    expect(host).not_to_contain_text("TEST_SECRET_CARD")
    host.get_by_role("button",name="Reveal reward 1").focus()
    page.keyboard.press("Enter")
    expect(host).to_contain_text("TEST_SECRET_CARD")
    host.get_by_role("button",name="Hide reward 1").click()
    expect(host).not_to_contain_text("TEST_SECRET_CARD")
    page.evaluate("""()=>{const k='bs_rewards:CA1126VANW:giftcards';window.originalGift=localStorage.getItem(k);const rows=JSON.parse(window.originalGift);rows[0].gcPin='CHANGED_FIXTURE';localStorage.setItem(k,JSON.stringify(rows))}""")
    host.get_by_role("button",name="Reveal reward 1").click()
    expect(host.locator("#announcement")).to_contain_text("Reveal unavailable")
    expect(host).not_to_contain_text("CHANGED_FIXTURE")
    page.evaluate("localStorage.setItem('bs_rewards:CA1126VANW:giftcards',window.originalGift)")
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Reveal reward 1").click()
    expect(host).to_contain_text("TEST_SECRET_CARD")
    page.clock.fast_forward(31000)
    expect(host).not_to_contain_text("TEST_SECRET_CARD")
    host.get_by_role("button",name="Reveal reward 1").click()
    expect(host).to_contain_text("TEST_SECRET_CARD")
    host.get_by_role("button",name="Settings",exact=True).click()
    host.get_by_role("button",name="Rewards",exact=True).click()
    expect(host).not_to_contain_text("TEST_SECRET_CARD")
    host.get_by_label("Find by ending digits or characters").fill("zzzz")
    expect(host).to_contain_text("0 of 1 records")
    host.get_by_label("Find by ending digits or characters").fill("")
    host.get_by_role("button",name="Redemption history",exact=True).click()
    expect(host).to_contain_text("No matching records.")
    host.get_by_role("button",name="Saved rewards",exact=True).click()
    expect(host).to_contain_text("1 of 1 records")
    for width in (320,360,400,480):
        page.set_viewport_size({"width":width,"height":800})
        for view in ("Queue","Rewards","Campaigns","Settings"):
            host.get_by_role("button",name=view,exact=True).click()
            assert host.evaluate("el=>el.scrollWidth<=el.clientWidth+1"),(width,view)
    host.get_by_role("button",name="Rewards",exact=True).click()
    with page.expect_download() as dl:
        host.get_by_role("button",name="Download CSV").click()
    assert '"TEST_SECRET_CARD","0000"' in Path(dl.value.path()).read_text(encoding="utf-8-sig")
    host.get_by_role("button",name="Settings",exact=True).click()
    expect(host).to_contain_text("Current document only")
    expect(host.get_by_label("Record page changes")).to_have_count(0)
    with page.expect_download() as dl:
        host.get_by_role("button",name="Export diagnostics").click()
    packet=json.loads(Path(dl.value.path()).read_text())
    assert packet["provenance"]["exporter"]=={"distribution":"bookmarklet","version":"0.6.0" if os.environ.get("GITHUB_SHA") else None,"commit":os.environ.get("GITHUB_SHA")}
    assert packet["provenance"]["snapshotTime"]=="current-observation" and packet["provenance"]["captureBuild"]=="current-exporter"
    assert packet["provenance"]["scope"]=="current-document" and packet["provenance"]["coverageComplete"] is False
    assert len(packet["records"])==1 and "events" not in packet
    assert packet["records"][0]["at"]==packet["provenance"]["exportedAt"]
    assert "SYNTHETIC_SECRET" not in json.dumps(packet) and "TEST_SECRET_CARD" not in json.dumps(packet)
    assert "000000000000000000000000000001" not in json.dumps(packet)
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.merchantActions===0")
    host.get_by_role("button",name="Rewards",exact=True).click()
    page.evaluate("document.body.dataset.slug='CA1126PZFT'")
    host.get_by_role("button",name="Download CSV").click()
    expect(host.locator("#announcement")).to_contain_text("Export unavailable")
    host.get_by_role("button",name="Refresh connection").click()
    expect(host).to_contain_text("conflict")
    host.get_by_role("button",name="Settings",exact=True).click()
    expect(host).to_contain_text("Background recording requires the extension")
    if os.environ.get("GITHUB_SHA"):
        expect(host).to_contain_text("0.6.0 Preview")
        host.get_by_text("Version details",exact=True).click()
        expect(host).to_contain_text(os.environ["GITHUB_SHA"])
        expect(host.get_by_role("link",name="Check for updates")).to_have_attribute("rel","noopener noreferrer")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.merchantActions===0")
    # No writes in the earlier read-only journey. Now enable a ready fixture.
    page.evaluate("""()=>{document.body.dataset.slug='CA1126VANW';localStorage.setItem('bs_rewards:CA1126VANW:queue',JSON.stringify([{id:'legacy',code:'000000000000000000000000000001',state:'queued'}]));}""")
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Queue",exact=True).click()
    host.get_by_label("Redemption codes").fill("012345678901234567890123456789")
    host.get_by_role("button",name="Add to queue").click()
    expect(host.locator("#announcement")).to_contain_text("1 added")
    rows=page.evaluate("JSON.parse(localStorage.getItem('bs_rewards:CA1126VANW:queue'))")
    assert rows[0]["id"]=="legacy" and rows[1]["code"]=="012345678901234567890123456789"
    host.get_by_role("button",name="Settings",exact=True).click()
    host.get_by_label("New redemption email").fill("fixture@example.invalid")
    host.get_by_role("button",name="Save email").click()
    expect(host.locator("#announcement")).to_contain_text("Preference saved")
    assert page.evaluate("localStorage.getItem('bs_rewards:CA1126VANW:email')")=="fixture@example.invalid"
    assert page.evaluate("window.merchantActions===0 && !localStorage.getItem('bs_rewards:CA1126VANW:active')")
    # The actual generated bookmarklet, real trusted user clicks and keyboard.
    def refresh_queue():
        host.get_by_role("button",name="Refresh connection").click()
    def review_entry(index, suffix):
        host.get_by_role("button",name=f"Review removal of queue entry {index+1} ending {suffix}").click()
        expect(host).to_contain_text("Confirm queue removal")
    def review_bulk():
        host.get_by_role("button",name="Review safe removals").click()
        expect(host).to_contain_text("Confirm queue removal")
    def confirm_remove():
        host.get_by_role("button",name="Confirm removal").click()
    before=seed(page)
    host.get_by_role("button",name="Queue",exact=True).click()
    refresh_queue()
    expect(host.get_by_role("button",name="Review safe removals")).to_be_visible()
    # Same last four digits but exact position. Keyboard activation and explicit cancellation.
    entry=host.get_by_role("button",name="Review removal of queue entry 2 ending 0001")
    entry.focus()
    page.keyboard.press("Enter")
    expect(host).to_contain_text("Confirm queue removal")
    expect(host).to_contain_text("Entry 2")
    expect(host).not_to_contain_text(ROWS[1]["code"])
    expect(host).not_to_contain_text("PRIVATE_FIXTURE_CARD")
    assert snapshot(page)==before
    cancel=host.get_by_role("button",name="Cancel removal")
    cancel.focus()
    page.keyboard.press("Enter")
    expect(host.locator("#announcement")).to_contain_text("Removal cancelled")
    expect(host.get_by_role("button",name="Confirm removal")).to_have_count(0)
    assert snapshot(page)==before
    assert host.locator("#workspace").evaluate("el=>el.getRootNode().activeElement===el")
    review_entry(1,"0001")
    confirm_remove()
    expect(host.locator("#announcement")).to_contain_text("1 queue entry removed")
    assert_removed(page,before,[1])
    before=snapshot(page)
    review_bulk()
    expect(host).to_contain_text("Remove 2 reviewed unused queue entries")
    expect(host).to_contain_text("8 other entries will stay")
    confirm_remove()
    expect(host.locator("#announcement")).to_contain_text("2 queue entries removed")
    assert_removed(page,before,[0,1])
    host.get_by_role("button",name="Review safe removals").click()
    expect(host.locator("#announcement")).to_contain_text("No demonstrably unused entries")
    # Review is fenced against exact raw storage changes, even same suffix.
    before=seed(page)
    refresh_queue()
    review_entry(1,"0001")
    changed=seed(page,[ROWS[1],ROWS[0],*ROWS[2:]])
    confirm_remove()
    expect(host.locator("#announcement")).to_contain_text("Selection expired")
    assert snapshot(page)==changed
    # The displayed selection snapshot is stale before opening review.
    before=seed(page)
    host.get_by_role("button",name="Review removal of queue entry 2 ending 0001").click()
    expect(host.locator("#announcement")).to_contain_text("Selection expired")
    assert snapshot(page)==before
    refresh_queue()
    review_entry(1,"0001")
    hold_lock(page)
    confirm_remove()
    expect(host.locator("#announcement")).to_contain_text("Another companion edit")
    assert snapshot(page)==before
    page.evaluate("window.releaseQueueLock()")
    page.wait_for_timeout(100)
    for mode in ("throw","readback"):
        refresh_queue()
        review_entry(1,"0001")
        page.evaluate(FAULT,mode)
        try:
            confirm_remove()
            expect(host.locator("#announcement")).to_contain_text("Save outcome uncertain")
            assert snapshot(page)==before
            expect(host.get_by_role("button",name="Confirm removal")).to_have_count(0)
        finally:
            page.evaluate("globalThis.restoreQueueWrite()")
    for opts,message in [
        ({"rows":[dict(ROWS[0],state="pending"),*ROWS[1:]]},"A pending queue record"),
        ({"rows":[dict(ROWS[0],state="processing"),*ROWS[1:]]},"A processing queue record"),
        ({"active":{"id":ROWS[0]["id"],"phase":"submitted","code":ROWS[0]["code"]}},"An active attempt record"),
        ({"lock":{"owner":"legacy-fixture"}},"A stored lock"),
        ({"gifts":[{"gcNumber":"UNKNOWN_LINK"}]},"source links cannot be safely interpreted"),
    ]:
        before=seed(page,**opts)
        refresh_queue()
        expect(host).to_contain_text(message)
        expect(host.get_by_role("button",name="Review safe removals")).to_have_count(0)
        expect(host.get_by_role("button",name="Capture matching reward")).to_have_count(0)
        expect(host).not_to_contain_text(ROWS[0]["code"])
        assert snapshot(page)==before
    before=seed(page)
    refresh_queue()
    review_entry(1,"0001")
    page.locator("main.bcr-redemption").evaluate("el=>el.replaceWith(el.cloneNode(true))")
    confirm_remove()
    expect(host.locator("#announcement")).to_contain_text("Campaign changed")
    assert snapshot(page)==before
    refresh_queue()
    review_bulk()
    for width in (320,360,480):
        page.set_viewport_size({"width":width,"height":800})
        assert host.evaluate("el=>el.scrollWidth<=el.clientWidth+1")
    host.get_by_role("button",name="Cancel removal").click()
    assert snapshot(page)==before and page.evaluate("window.merchantActions===0")
    print("Packaged bookmarklet queue removal: real click/keyboard, exact single/bulk, cancel, stale selection/document, linked retention, ownership, write/readback uncertainty, privacy and responsive unresolved guidance PASS",flush=True)
    page.evaluate(script)
    expect(host).to_have_count(0)
    ctx.route(URL,lambda route:route.fulfill(status=200,content_type="text/html",body=success_fixture()))
    page.goto(URL)
    page.evaluate(script)
    expect(host).to_contain_text("Unresolved reward")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before")
    host.get_by_role("button",name="Capture matching reward").click()
    expect(host.locator("#announcement")).to_contain_text("Capture not confirmed")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before")
    page.locator("#eligible").evaluate("(el,code)=>el.textContent='Eligible Card: '+code",CODE)
    # Same document and barcode, changed durable attempt. Stale reviewed action must not capture.
    page.evaluate("""()=>{const k='bs_rewards:CA1126VANW:active',r=JSON.parse(localStorage.getItem(k));r.attempt.attemptId='00000000-0000-0000-0000-000000000099';localStorage.setItem(k,JSON.stringify(r));window.before=JSON.stringify(Object.entries(localStorage).sort());}""")
    host.get_by_role("button",name="Capture matching reward").click()
    expect(host.locator("#announcement")).to_contain_text("Capture not confirmed")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before")
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Capture matching reward").click()
    expect(host.locator("#announcement")).to_contain_text("Matching reward captured")
    assert_captured(page)
    expect(host.get_by_role("button",name="Capture matching reward")).to_have_count(0)
    ctx.route(FINAL_URL,lambda route:route.fulfill(status=200,content_type="text/html",body=FINAL_FIXTURE))
    page.goto(FINAL_URL)
    page.evaluate(script)
    host.get_by_role("button",name="Review final claim").click()
    expect(host).to_contain_text(CODE)
    expect(host).to_contain_text("fixture@example.invalid")
    expect(host.get_by_role("button",name="Authorize reviewed claim")).to_be_disabled()
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
    host.get_by_label("I confirm the exact claim details and merchant terms").check()
    # Same-URL replacement with identical form invalidates the old review.
    page.locator("main.bcr-redemption").evaluate("el=>el.replaceWith(el.cloneNode(true))")
    host.get_by_role("button",name="Authorize reviewed claim").click()
    expect(host.locator("#announcement")).to_contain_text("Submission not confirmed")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
    # Actual generated bookmarklet: earlier barcode node remains hidden at final.
    ctx.route(FINAL_URL,lambda route:route.fulfill(status=200,content_type="text/html",body=HIDDEN_BARCODE_FIXTURE))
    page.goto(FINAL_URL)
    page.evaluate(script)
    enter_hidden_barcode(page)
    host.get_by_role("button",name="Settings",exact=True).click()
    host.get_by_role("button",name="Refresh connection").click()
    expect(host).to_contain_text("Barcode entry observed")
    inactive_barcode(page)
    host.get_by_role("button",name="Refresh connection").click()
    expect(host).to_contain_text("Barcode field is visible but inactive or disabled")
    hidden_final(page)
    host.get_by_role("button",name="Refresh connection").click()
    expect(host).to_contain_text("Barcode field is hidden")
    expect(host).to_contain_text("Submit control available")
    with page.expect_download() as dl:
        host.get_by_role("button",name="Export diagnostics").click()
    packet=json.loads(Path(dl.value.path()).read_text())
    assert packet["records"][0]["report"]["controls"]["serial"]=={"present":1,"visible":0,"actionable":0}
    assert CODE not in json.dumps(packet)
    host.get_by_role("button",name="Queue",exact=True).click()
    host.get_by_role("button",name="Review final claim").click()
    expect(host.get_by_role("button",name="Authorize reviewed claim")).to_have_count(0)
    page.evaluate("window.fixtureBarcode.value='987654321098765432109876543210'")
    host.get_by_role("button",name="Review final claim").click()
    expect(host.get_by_role("button",name="Authorize reviewed claim")).to_have_count(0)
    assert page.evaluate("window.submits===0 && JSON.stringify(Object.entries(localStorage).sort())===window.before")
    print("Packaged bookmarklet diagnostic identity/current-document export and hidden barcode counterexample PASS",flush=True)
    # Start from a real synthetic welcome stage, not a prefilled final form.
    ctx.route(FINAL_URL,lambda route:route.fulfill(status=200,content_type="text/html",body=WORKFLOW_FIXTURE))
    page.reload()
    page.evaluate(script)
    host.get_by_role("button",name="Prepare next redemption").click()
    expect(host.locator("#announcement")).to_contain_text("Complete the current merchant step manually")
    page.locator("#start").press("Enter")
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Prepare next redemption").click()
    expect(host.locator("#announcement")).to_contain_text("Barcode ready")
    assert page.locator(".wizard-serial-number").input_value()==CODE
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
    page.locator("#next").press("Enter")
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Prepare next redemption").click()
    expect(host.locator("#announcement")).to_contain_text("Barcode and email ready")
    assert page.locator("#workflow_data_email").input_value()=="fixture@example.invalid"
    assert page.locator("#workflow_data_email_confirmation").input_value()=="fixture@example.invalid"
    assert not page.locator("#workflow_data_terms_of_service").is_checked()
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
    page.locator("#workflow_data_terms_of_service").press("Space")
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Review final claim").click()
    host.get_by_label("I confirm the exact claim details and merchant terms").check()
    host.get_by_role("button",name="Authorize reviewed claim").click()
    expect(host.locator("#announcement")).to_contain_text("Submission attempted")
    assert page.evaluate("window.submits===1&&window.pendingAtClick")
    expect(host.get_by_role("button",name="Authorize reviewed claim")).to_have_count(0)
    show_linked_success(page)
    host.get_by_role("button",name="Refresh connection").click()
    host.get_by_role("button",name="Capture matching reward").click()
    expect(host.locator("#announcement")).to_contain_text("Matching reward captured")
    assert_final_captured(page)
    expect(host.get_by_role("button",name="Review final claim")).to_have_count(0)
    assert not errors,errors
    browser.close()
    print("Bookmarklet actual foreground UI: exact review, explicit confirmation, pending intent, linked capture PASS")
    print("Shared bookmarklet workspace, explicit cache edits, read-only mount, stale identity and no merchant actions PASS")
