"""Synthetic preview only. No merchant access or credentials."""
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":360,"height":800})
    page.goto(Path(__file__).with_name("index.html").resolve().as_uri())
    page.get_by_role("button",name="Load demo codes").click()
    page.get_by_role("button",name="Add to queue").click()
    assert "3 ready" in page.locator("main").inner_text()
    page.get_by_role("button",name="Review & start queue").click()
    page.get_by_label("I reviewed the demo product, reward and terms").check()
    page.get_by_role("button",name="Authorize simulated claim").click()
    page.get_by_text("Demo outcomes (test controls)").click()
    page.get_by_role("button",name="Verified reward").click()
    page.get_by_role("button",name="Rewards",exact=True).click()
    assert "CAD $15.00" in page.locator("main").inner_text()
    print("import-review-verify-rewards PASS", flush=True)
    for theme in ("light","dark"):
        page.get_by_role("button",name="Settings",exact=True).click()
        page.get_by_label("Appearance").select_option(theme)
        for width in (320,360,400,480):
            page.set_viewport_size({"width":width,"height":800})
            for view in ("Queue","Rewards","Campaigns","Settings"):
                page.get_by_role("button",name=view,exact=True).click()
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),(theme,width,view)
            print(theme,width,"no horizontal overflow PASS",flush=True)
    browser.close()
