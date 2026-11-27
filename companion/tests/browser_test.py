"""Synthetic package tests in a permitted independent Chromium environment."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1] / "extension"
with TemporaryDirectory() as profile, sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        profile, channel="chromium", headless=True, viewport={"width":360,"height":800},
        args=[f"--disable-extensions-except={root}", f"--load-extension={root}"])
    try:
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker",timeout=15000)
        ext_id = worker.url.split("/")[2]
        assert worker.evaluate("chrome.runtime.getManifest().permissions") == ["sidePanel","storage"]
        worker.evaluate("async () => { for (let i=0;i<30;i++){if ((await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick) return true;await new Promise(r=>setTimeout(r,100));}throw new Error('toolbar behavior not configured'); }")
        assert worker.evaluate("async () => (await chrome.sidePanel.getOptions({})).path") == "index.html"
        print("MV3 loaded; native side panel configuration PASS",flush=True)
        page = ctx.new_page()
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(f"chrome-extension://{ext_id}/prototype.html")
        button=lambda name:page.get_by_role("button",name=name,exact=True)
        main=page.locator("main")
        button("Load demo codes").focus()
        page.keyboard.press("Enter")
        assert page.locator("#codes").evaluate("el => el === document.activeElement")
        button("Add to queue").focus()
        page.keyboard.press("Enter")
        expect(main).to_contain_text("3 ready")
        button("Review & start queue").click()
        expect(button("Authorize simulated claim")).to_be_disabled()
        page.get_by_label("I reviewed the demo product, reward and terms").check()
        button("Authorize simulated claim").click()
        page.get_by_text("Demo outcomes (test controls)").click()
        button("Verified reward").click()
        button("Rewards").click()
        expect(main).to_contain_text("CAD $15.00")
        expect(main).to_contain_text("1 verified demo rewards")
        print("keyboard import, reviewed claim, synthetic capture PASS",flush=True)
        button("Reveal").click()
        expect(main).to_contain_text("DEMO-0001")
        with page.expect_download() as dl:
            button("Export CSV").click()
        data=Path(dl.value.path()).read_text(encoding="utf-8-sig")
        assert data.splitlines()[0]=='"Card Merchant","Value Recent","GC Number","GC PIN"'
        assert '"DEMO-0001","0000"' in data
        print("explicit reveal and CSV contract PASS",flush=True)
        button("Queue").click()
        button("Review & start queue").click()
        page.get_by_label("I reviewed the demo product, reward and terms").check()
        button("Authorize simulated claim").click()
        page.get_by_text("Demo outcomes (test controls)").click()
        button("Timeout / unknown outcome").click()
        expect(main).to_contain_text("Later claims are blocked")
        expect(button("Add to queue")).to_be_disabled()
        print("unknown outcome blocks later items PASS",flush=True)
        for theme in ("light","dark"):
            button("Settings").click()
            page.get_by_label("Appearance").select_option(theme)
            for width in (320,360,400,480):
                page.set_viewport_size({"width":width,"height":800})
                for view in ("Queue","Rewards","Campaigns","Settings"):
                    button(view).click()
                    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),(theme,width,view)
                    assert page.evaluate("Array.from(document.querySelectorAll('nav button')).every(el=>el.getBoundingClientRect().height>=48)")
                print(theme,width,"no horizontal overflow PASS",flush=True)
        assert not errors, errors
        page.reload()
        expect(main).to_contain_text("0 ready")
        assert not errors, errors
        print("reload is inert; no script errors PASS",flush=True)
        page.goto(f"chrome-extension://{ext_id}/index.html")
        expect(page.locator("main")).to_contain_text("Legacy cache management")
        expect(page.get_by_role("button",name="Authorize simulated claim")).to_have_count(0)
        for theme in ("light","dark"):
            page.emulate_media(color_scheme=theme)
            for width in (320,360,400,480):
                page.set_viewport_size({"width":width,"height":800})
                for view in ("Queue","Rewards","Campaigns","Settings"):
                    button(view).focus()
                    page.keyboard.press("Enter")
                    assert page.locator("main").evaluate("el=>el===document.activeElement")
                    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),(theme,width,view)
        print("production-facing workspace keyboard navigation and responsive widths PASS",flush=True)
        print("production-facing workspace contains no demo claim controls PASS",flush=True)
    finally:
        ctx.close()
