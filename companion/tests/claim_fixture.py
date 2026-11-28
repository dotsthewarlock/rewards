"""Shared synthetic success fixture; no real merchant traffic or credentials."""
import json
CODE = "012345678901234567890123456789"
OTHER = "000000000000000000000000000001"
URL = "https://getmybonus.ca/CA1126VANW/synthetic-success"
SLUG = "CA1126VANW"
FLAT = '<div class="title">Bonus Code</div><div class="text">000012345678</div><div class="title">PIN</div><div class="text">0000</div>'
NESTED = '<section><div><div class="title">Bonus Code:</div></div><div><span class="text">0000<span>12345678</span></span></div></section><section><div class="title">PIN</div><div><span class="text">0000</span></div></section>'
BAD_FIELDS = {
    "duplicate alias": NESTED+'<div class="title">Card PIN</div><div class="text">9999</div>',
    "duplicate value": FLAT.replace('<div class="title">PIN', '<div class="text">1234</div><div class="title">PIN'),
    "hidden label": FLAT.replace('class="title">PIN','class="title" hidden>PIN'),
    "hidden value": FLAT.replace('class="text">0000</div>','class="text" style="visibility:hidden">0000</div>'),
    "hidden value fragment": FLAT.replace('000012345678','0000<span hidden>12345678</span>'),
    "missing label": FLAT.replace('<div class="title">PIN</div>',''),
    "missing value": FLAT.replace('<div class="text">000012345678</div>',''),
    "unknown boundary": FLAT.replace('<div class="text">000012345678','<div class="title">Other</div><div class="text">000012345678'),
    "empty label": FLAT.replace('>Bonus Code<','><'),
    "nested markers": FLAT.replace('>Bonus Code<','><span class="text">Bonus Code</span><'),
}
def success_fixture(nested=False):
    review = dict(origin="https://getmybonus.ca",campaign=SLUG,
        documentToken="00000000-0000-0000-0000-000000000001",
        attemptId="00000000-0000-0000-0000-000000000002",queueId="fixture-row",
        code=CODE,product="$100 Vanilla prepaid card",reward="Walmart eGift Card",
        cardMerchant="Walmart",valueRecent="15.00",email="fixture@example.invalid",terms=True)
    active = dict(id="fixture-row",code=CODE,phase="submitted",ts=1,schema="rewards.pending/1",attempt=review)
    queue = [dict(id="fixture-row",code=CODE,state="pending",submitted=1),
             dict(id="next-row",code=OTHER,state="queued")]
    return f"""<!doctype html><html><body data-slug="{SLUG}">
<main class="value-add wizard"><section class="redemption-form">
<p id="eligible">Eligible Card: {OTHER}</p>
<div class="confirmation-block"><h3>You earned $15</h3><p class="h5">Walmart eGift Card</p>
<div class="codes-container">{NESTED if nested else FLAT}</div></div>
<button class="btn-claim-another-code">Claim Another</button></section></main>
<script>
localStorage.clear();
localStorage.setItem('bs_rewards:{SLUG}:active',JSON.stringify({json.dumps(active)}));
localStorage.setItem('bs_rewards:{SLUG}:queue',JSON.stringify({json.dumps(queue)}));
window.merchantActions=0;
document.querySelector('main').addEventListener('click',()=>window.merchantActions++);
window.before=JSON.stringify(Object.entries(localStorage).sort());
</script></body></html>"""
def assert_captured(page):
    data=page.evaluate("""()=>({active:localStorage.getItem('bs_rewards:CA1126VANW:active'),
      queue:JSON.parse(localStorage.getItem('bs_rewards:CA1126VANW:queue')),
      rewards:JSON.parse(localStorage.getItem('bs_rewards:CA1126VANW:giftcards')),
      history:JSON.parse(localStorage.getItem('bs_rewards:CA1126VANW:history')),
      clicks:window.merchantActions})""")
    assert data["active"] is None and data["clicks"] == 0
    assert [r["state"] for r in data["queue"]] == ["complete","queued"]
    assert len(data["rewards"]) == len(data["history"]) == 1
    assert data["rewards"][0]["sourceRedemptionCode"] == data["history"][0]["code"] == CODE
    assert data["rewards"][0]["gcNumber"] == "000012345678"
    assert data["rewards"][0]["gcPin"] == "0000"

def exercise_legacy_maintenance(playwright):
    from pathlib import Path
    from hashlib import sha256
    import subprocess
    base=Path(__file__).resolve().parents[1]
    source=base/"maintenance/Redeem_Prepaid_Rewards_v15.1.js"
    data=source.read_bytes()
    baseline=base.parent/"redeem/Redeem_Prepaid_Rewards_v15.js"
    assert sha256(baseline.read_bytes()).hexdigest()=="23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1"
    print("Legacy candidate SHA256 "+sha256(data).hexdigest()+" blob "+subprocess.check_output(["git","hash-object",str(source)],cwd=base).decode().strip(),flush=True)
    script=data.decode()
    browser=playwright.chromium.launch()
    try:
        context=browser.new_context()
        context.route("**/*",lambda route:route.fulfill(status=200,content_type="text/html",body=success_fixture()) if route.request.url==URL else route.abort())
        page=context.new_page()
        prefix="bs_rewards:"+SLUG+":"
        def setup(fields=FLAT,eligible=CODE,disable=False):
            page.goto(URL)
            page.locator(".codes-container").evaluate("(el,html)=>el.innerHTML=html",fields)
            page.locator("#eligible").evaluate("(el,text)=>el.textContent=text",eligible if eligible.startswith("Eligible") else "Eligible Card: "+eligible)
            page.evaluate("""([p,disabled])=>{const a=JSON.parse(localStorage.getItem(p+'active'));delete a.schema;delete a.attempt;localStorage.setItem(p+'active',JSON.stringify(a));document.querySelector('.btn-claim-another-code').disabled=disabled;}""",[prefix,disable])
        def run():
            page.evaluate(script)
            page.wait_for_function("(p)=>window.__BS_REWARDS__?.version==='15.1'&&localStorage.getItem(p+'lock')===null",arg=prefix,timeout=12000)
        def cache():
            return page.evaluate("""p=>Object.fromEntries(['giftcards','history','queue','active'].map(n=>[n,JSON.parse(localStorage.getItem(p+n)||'null')]))""",prefix)
        def stopped():
            assert page.evaluate("window.merchantActions") == 0
        for fields in (FLAT,NESTED):
            setup(fields,disable=True)
            run()
            assert_captured(page)
            run() # exact repeat is idempotent
            assert_captured(page)
        for name,fields in BAD_FIELDS.items():
            setup(fields)
            before=cache()
            run()
            assert cache()==before,name
            stopped()
        for eligible in (OTHER,"Eligible Card:","Eligible Card: "+CODE+" Eligible Card: "+OTHER,"Eligible Card: "+CODE+" Eligible Card:"):
            setup(NESTED,eligible)
            before=cache()
            run()
            assert cache()==before
            stopped()
        for conflict in ("same-credential-other-source","same-source-other-credential","history-other-source"):
            setup(NESTED)
            page.evaluate("""([p,mode,code,other])=>{const key='000012345678|0000';if(mode==='history-other-source'){localStorage.setItem(p+'history',JSON.stringify([{code:other,giftKey:key}]));return;} const row={key,cardMerchant:'Walmart',valueRecent:'15.00',gcNumber:'000012345678',gcPin:'0000',sourceRedemptionCode:other,slug:'CA1126VANW',ts:1};if(mode==='same-source-other-credential'){row.sourceRedemptionCode=code;row.gcPin='9999';row.key='000012345678|9999';}localStorage.setItem(p+'giftcards',JSON.stringify([row]));}""",[prefix,conflict,CODE,OTHER])
            before=cache()
            run()
            assert cache()==before,conflict
            stopped()
        for field in ("giftcards","history","queue","active"):
            for mode in ("throw","ignore"):
                setup(NESTED)
                page.evaluate("""([p,field,mode])=>{const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;window.restoreFault=()=>{Storage.prototype.setItem=set;Storage.prototype.removeItem=remove};Storage.prototype.setItem=function(k,v){if(k===p+field){if(mode==='throw')throw Error('synthetic quota');return;}return set.call(this,k,v)};Storage.prototype.removeItem=function(k){if(k===p+field){if(mode==='throw')throw Error('synthetic quota');return;}return remove.call(this,k)};}""",[prefix,field,mode])
                run()
                partial=cache()
                assert partial["active"] is not None,(field,mode)
                assert partial["queue"][1]["state"]=="queued",(field,mode)
                assert partial["queue"][0]["state"]==("complete" if field=="active" else "pending"),(field,mode)
                stopped()
                page.evaluate("window.restoreFault();document.querySelector('.btn-claim-another-code').disabled=true")
                run()
                assert_captured(page)
        print("Legacy v15.1 real synthetic bootstrap: flat/nested, exact strings, ambiguity, wrong/missing source, conflicts, all four thrown/ignored writes, exact retry and no advancement on failure PASS",flush=True)
    finally:
        browser.close()
