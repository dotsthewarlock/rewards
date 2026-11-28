"""Synthetic removal fixtures shared by the real packaged browser suites."""
from hashlib import sha256
import json

PREFIX = "bs_rewards:CA1126VANW:"
LOCK = "bs_rewards:companion:data-v1"

def row(n, code=None, **extra):
    return dict(id=f"00000000-0000-0000-0000-{n:012d}", code=code or f"{n:030d}",
                state="queued", note="", created=100, updated=100) | extra

# Two different exact codes have identical masked endings; review must bind the
# selected position rather than the suffix. History is hash-only.
ROWS = [
    row(1), row(2, "1"+"0"*28+"1"), row(3),
    row(4), row(5), row(6), row(7, f"{6:030d}", state="duplicate"),
    row(8, state="error", note="Previous attempt"),
    row(9, submitted=123), row(10, updated=101),
    row(11, state="complete"),
]
SAFE = [0, 1, 2]
HISTORY = [{"h": sha256(ROWS[3]["code"].encode()).hexdigest(), "last4": "0004"}]
GIFTS = [{"cardMerchant": "Fixture", "valueRecent": "10.00", "gcNumber": "PRIVATE_FIXTURE_CARD",
          "gcPin": "0000", "sourceRedemptionCode": ROWS[4]["code"]}]

def snapshot(page):
    return page.evaluate("Object.fromEntries(Object.entries(localStorage))")

def seed(page, rows=ROWS, history=HISTORY, gifts=GIFTS, active=None, lock=None):
    page.evaluate("""([prefix,rows,history,gifts,active,lock])=>{
      for(const [name,value] of Object.entries({queue:rows,history,giftcards:gifts,active,lock})){
        if(value===null)localStorage.removeItem(prefix+name);
        else localStorage.setItem(prefix+name,JSON.stringify(value));
      }
      localStorage.setItem(prefix+'email','fixture@example.invalid');
      localStorage.setItem(prefix+'clipboard','1');
      localStorage.setItem('bs_rewards:CA1126PZFT:queue','[]');
    }""", [PREFIX, rows, history, gifts, active, lock])
    return snapshot(page)

def assert_removed(page, before, indices):
    after = snapshot(page)
    key = PREFIX+"queue"
    assert {k:v for k,v in before.items() if k!=key} == {k:v for k,v in after.items() if k!=key}
    original = json.loads(before[key])
    assert json.loads(after[key]) == [r for i,r in enumerate(original) if i not in indices]

def hold_lock(page):
    page.evaluate("""name=>new Promise(resolve=>navigator.locks.request(name,()=>new Promise(release=>{
      window.releaseQueueLock=release;resolve();
    })))""", LOCK)

# Faults are installed only in the synthetic browser fixture, never in the
# production code. Use the actual distribution's execution world.
FAULT = """mode=>{
  const original=Storage.prototype.setItem;
  globalThis.restoreQueueWrite=()=>{Storage.prototype.setItem=original;delete globalThis.restoreQueueWrite;};
  Storage.prototype.setItem=function(key,value){
    if(key==='bs_rewards:CA1126VANW:queue'){
      if(mode==='throw')throw new Error('synthetic write failure');
      if(mode==='readback')return;
    }
    return original.call(this,key,value);
  };
}"""

def isolated_world(ctx, page):
    session = ctx.new_cdp_session(page)
    worlds = []
    session.on("Runtime.executionContextCreated", lambda event: worlds.append(event["context"]))
    session.send("Runtime.enable")
    for world in worlds:
        if world.get("auxData", {}).get("isDefault"):
            continue
        result = session.send("Runtime.evaluate", {"contextId": world["id"],
            "expression": "typeof globalThis.RewardsLegacy==='object' && globalThis.__rewardsDiscoveryLoaded===true",
            "returnByValue": True})
        if result.get("result", {}).get("value") is True:
            return session, world["id"]
    session.detach()
    raise AssertionError("packaged MV3 isolated world not found")

def fault_in_world(session, context_id, expression):
    result = session.send("Runtime.evaluate", {"contextId": context_id, "expression": expression,
                                                  "returnByValue": True})
    assert "exceptionDetails" not in result, result
