"""Exercise the generated shared workspace on a synthetic page, never a merchant."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from claim_fixture import CODE, URL, success_fixture, assert_captured
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
    page.evaluate(script)
    host=page.locator("#rewards-companion-dev")
    expect(host).to_contain_text("Legacy cache management")
    expect(host).to_contain_text("1 pending")
    expect(host).to_contain_text("•••• 0001")
    host.get_by_label("Redemption codes").fill("Receipt: 000000000000000000000000000001\n012345678901234567890123456789")
    host.get_by_role("button",name="Preview").click()
    expect(host.locator("#importResult")).to_contain_text("1 ready · 1 duplicates")
    assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.merchantActions===0")
    assert page.evaluate("typeof globalThis.RewardsDiscovery")== "undefined"
    host.get_by_role("button",name="Rewards",exact=True).click()
    with page.expect_download() as dl:
        host.get_by_role("button",name="Download CSV").click()
    assert '"TEST_SECRET_CARD","0000"' in Path(dl.value.path()).read_text(encoding="utf-8-sig")
    page.evaluate("document.body.dataset.slug='CA1126PZFT'")
    host.get_by_role("button",name="Download CSV").click()
    expect(host.locator("#announcement")).to_contain_text("Export unavailable")
    host.get_by_role("button",name="Refresh connection").click()
    expect(host).to_contain_text("conflict")
    host.get_by_role("button",name="Settings",exact=True).click()
    expect(host).to_contain_text("Background recording requires the extension")
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
    assert not errors,errors
    browser.close()
    print("Shared bookmarklet workspace, explicit cache edits, read-only mount, stale identity and no merchant actions PASS")
