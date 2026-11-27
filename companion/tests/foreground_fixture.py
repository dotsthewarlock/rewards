"""Synthetic native final-submit fixture; no actual merchant request or credential.
No production transport calls prepareFinal yet. This exercises shared adapter/core.
"""
from pathlib import Path
from claim_fixture import CODE, OTHER, SLUG

URL = "https://getmybonus.ca/CA1126VANW/synthetic-final"
FIXTURE = f"""<!doctype html><html><body data-slug="{SLUG}">
<main class="bcr-redemption"><form id="new_workflow_data" method="post" action="/synthetic-only">
<div class="step step_active" id="final">
<div id="target_codes"><div class="serial-number_wrapper"><input class="wizard-serial-number" type="text" value="{CODE}" required></div></div>
<input type="email" id="workflow_data_email" value="fixture@example.invalid" required>
<input type="email" id="workflow_data_email_confirmation" value="fixture@example.invalid" required>
<input type="checkbox" id="workflow_data_terms_of_service" checked required>
<input name="commit" type="submit" value="Show &amp; Email Code">
</div></form></main><button id="review">Review</button><button id="authorize">Authorize</button>
<script>
localStorage.clear();
const prefix='bs_rewards:{SLUG}:';
localStorage.setItem(prefix+'queue',JSON.stringify([
 {{id:'fixture-row',code:'{CODE}',state:'queued'}},
 {{id:'next-row',code:'{OTHER}',state:'queued'}}]));
localStorage.setItem(prefix+'email','fixture@example.invalid');
window.submits=0;
window.pendingAtClick=false;
document.querySelector('[name=commit]').addEventListener('click',()=>{{
 const a=JSON.parse(localStorage.getItem(prefix+'active')||'null');
 const q=JSON.parse(localStorage.getItem(prefix+'queue'));
 window.pendingAtClick=a?.attempt?.code==='{CODE}'&&q[0].state==='pending'&&q[1].state==='queued';
}});
document.querySelector('form').addEventListener('submit',event=>{{event.preventDefault();window.submits++;}});
window.before=JSON.stringify(Object.entries(localStorage).sort());
</script></body></html>"""

# Fixture-only explicit user controls, not a production message/API.
BIND = """()=>{
 const target={origin:location.origin,campaign:'CA1126VANW',documentToken:crypto.randomUUID()};
 window.contextValid=true;
 window.fixtureLocks=navigator.locks;
 document.querySelector('#review').addEventListener('click',event=>{
   if(!event.isTrusted)return;
   window.binding?.cancel?.();
   window.binding=RewardsForeground.prepareFinal(document,localStorage,window.fixtureLocks,target,()=>window.contextValid);
   window.reviewStatus=window.binding.ok;
 });
 document.querySelector('#authorize').addEventListener('click',async event=>{
   if(!event.isTrusted)return;
   window.outcome=window.binding?.ok?await window.binding.authorize():{ok:false};
 });
}"""

def exercise_final(page, ctx, root: Path):
    ctx.route(URL,lambda route:route.fulfill(status=200,content_type="text/html",body=FIXTURE))
    def setup():
        page.goto(URL)
        page.bring_to_front()
        for script in ("discovery/core.js","discovery/legacy.js","core/registry.js","core/transactions.js","discovery/foreground.js"):
            page.evaluate((root/script).read_text())
        page.evaluate(BIND)
    def untouched():
        assert page.evaluate("JSON.stringify(Object.entries(localStorage).sort())===window.before && window.submits===0")
    def review(expected):
        page.locator("#review").click()
        assert page.evaluate("window.reviewStatus") is expected
        untouched()
    def authorize():
        page.evaluate("window.outcome=undefined")
        page.locator("#authorize").click()
        page.wait_for_function("window.outcome!==undefined")
        return page.evaluate("window.outcome")
    # Required exact fields; optional/unknown choices and unsafe forms fail closed.
    for change in (
        "document.querySelector('.wizard-serial-number').value='"+OTHER+"'",
        "document.querySelector('.wizard-serial-number').hidden=true",
        "document.querySelector('#workflow_data_email_confirmation').value='other@example.invalid'",
        "document.querySelector('#workflow_data_terms_of_service').checked=false",
        "document.querySelector('[name=commit]').disabled=true",
        "document.querySelector('#final').insertAdjacentHTML('beforeend','<button type=submit>Other</button>')",
        "document.querySelector('#final').insertAdjacentHTML('beforeend','<div role=dialog>Choose a product</div>')",
        "document.querySelector('#final').insertAdjacentHTML('beforeend','<iframe title=\\\"recaptcha challenge\\\" style=\\\"width:100px;height:100px\\\"></iframe>')",
        "document.querySelector('form').action='https://unrelated.invalid/'",
        "document.body.insertAdjacentHTML('beforeend','<main class=\"value-add wizard\"><div class=\"confirmation-block\" hidden><div class=\"codes-container\"></div></div><button class=\"btn-claim-another-code\" hidden>Claim Another</button></main>')",
        "document.querySelector('#final').classList.remove('step_active')",
    ):
        setup()
        page.evaluate(change)
        review(False)
        assert not authorize()["ok"]
        untouched()
    # Values/control identity, cancellation and active target are rechecked
    # after review and immediately before durable intent/native click.
    for change in (
        "document.querySelector('#workflow_data_email').value='other@example.invalid'",
        "document.querySelector('[name=commit]').replaceWith(document.querySelector('[name=commit]').cloneNode(true))",
        "window.contextValid=false",
        "window.binding.cancel()",
        "window.dispatchEvent(new PageTransitionEvent('pagehide'))",
        "document.querySelector('#workflow_data_email').dispatchEvent(new Event('input',{bubbles:true}))",
    ):
        setup()
        review(True)
        page.evaluate(change)
        assert not authorize()["ok"]
        untouched()
    # Lock contention must consume review without writes or a click.
    setup()
    page.evaluate("""()=>new Promise(resolve=>navigator.locks.request('bs_rewards:companion:data-v1',()=>new Promise(release=>{window.release=release;resolve()})))""")
    review(True)
    assert not authorize()["ok"]
    untouched()
    page.evaluate("window.release()")
    assert not authorize()["ok"]
    untouched()
    # Explicit authorization on a prepared form invokes native action only
    # after both pending writes are durable. No later row or automatic replay.
    setup()
    review(True)
    r=page.evaluate("window.binding.review")
    assert r["code"]==CODE and r["email"]=="fixture@example.invalid" and r["terms"]
    assert r["queueId"]=="fixture-row" and r["reward"]=="Walmart eGift Card"
    assert authorize()=={"ok":True,"status":"pending"}
    assert page.evaluate("window.submits===1&&window.pendingAtClick")
    assert not authorize()["ok"]
    assert page.evaluate("window.submits===1")
    print("Shared foreground adapter: exact review, blockers, cancellation, lock, durable native submit and no replay PASS",flush=True)

def show_linked_success(page):
    # Same-document synthetic transition; preserve exact durable intent and workspace.
    page.locator("main.bcr-redemption").evaluate("""(el,code)=>el.outerHTML='<main class="value-add wizard"><section class="redemption-form"><p>Eligible Card: '+code+'</p><div class="confirmation-block"><h3>You earned $15</h3><p class="h5">Walmart eGift Card</p><div class="codes-container"><div class="title">Bonus Code</div><div class="text">000012345678</div><div class="title">PIN</div><div class="text">0000</div></div></div><button class="btn-claim-another-code">Claim Another</button></section></main>'""",CODE)

def assert_final_captured(page):
    result=page.evaluate("""()=>{const prefix='bs_rewards:CA1126VANW:',get=n=>JSON.parse(localStorage.getItem(prefix+n)||'null');return {active:get('active'),queue:get('queue'),history:get('history'),gifts:get('giftcards'),submits:window.submits}}""")
    assert result["active"] is None and result["submits"]==1
    assert [r["state"] for r in result["queue"]]==["complete","queued"]
    assert len(result["history"])==len(result["gifts"])==1
    assert result["history"][0]["code"]==result["gifts"][0]["sourceRedemptionCode"]==CODE
