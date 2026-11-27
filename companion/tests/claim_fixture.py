"""Shared synthetic success fixture; no real merchant traffic or credentials."""
import json
CODE = "012345678901234567890123456789"
OTHER = "000000000000000000000000000001"
URL = "https://getmybonus.ca/CA1126VANW/synthetic-success"
SLUG = "CA1126VANW"
def success_fixture():
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
<div class="codes-container"><div class="title">Bonus Code</div><div class="text">000012345678</div><div class="title">PIN</div><div class="text">0000</div></div></div>
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
