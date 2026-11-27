# Script Loader L1–L3 deployment handoff — 2026-11-27

Scope: isolated launcher stream only. Preflight main fa91fff736f89ea6597ad4595eae0d6221cb084c; companion-dev 5f739fbbea8e481de0bbd5e9deba4fb53fdbbe76 (unchanged). Supplied staged tree 336c0e5ae1e1caad6e7fd98f4117e2766b197f31 inspected and corrected on launcher-dev. No merge of the companion-dev tree into main.

- Initial M3 browser implementation 27dba4467b65fd7787f3bd280dc05605c8972022, CI 46070141336 SUCCESS, 15 synthetic scenarios.
- Final implementation ab266341894be74f5ec3d6718b3a6ccfd527e7c7, CI 46070448883 SUCCESS: JavaScript syntax, 3 grouped deterministic publication tests, 15 synthetic browser scenarios. Main fast-forwarded with expected old SHA, no force.
- Main Pages deployment 46070566448 and main hosted verification 46070567263 both SUCCESS at exact implementation commit. Hosted job 140746457894 fetched and matched all seven public files, including unchanged original loader, at 2026-11-27T21:29:36Z. Main browser and publication suite also passed.
- Seven changed files: companion/launcher/loader.js, launcher README, native-acceptance supplement, publication helper, two synthetic tests and read-only launcher CI workflow. Bootstrap, channels, immutable release, original redeem/ and scan/ trees unchanged.
- Dev candidate remains 0.6.0-dev-de3cb5d39410, exact CI 46049375697 artifact 15223189210; local archive independently rechecked SHA256 0d698b40f7b32f26261865243d4bdb68ab70b6214a33f17dddfd87eeda3badec, 6 internal hashes, 28 extension files. CI artifact expires; no new candidate or permanent extension ZIP was published in this cycle. Publication helper's real GitHub CLI prepare/activate flow awaits a subsequent eligible Dev promotion; synthetic gates passed.
- Optional Test selector is supported but no Test pointer or artifact is published. Read-only manifest label is not a sandbox.
- Local Chromium could launch but administrator-blocked synthetic navigation; local Pages DNS unavailable. GitHub CI used instead; no native or live acceptance inferred. Exclusive launcher scope isolated by new branch and expected-SHA ref writes; no independent proof of other user sessions.
- No stable promotion, live claim, data migration, new write-enabled workflow, shared engine modification or extension startup change. Preserve original fallback and no concurrent generations with unresolved submissions.
- Consolidated native supplement: companion/launcher/native-acceptance.md; use existing Companion native checklist and separate E4 authorization. Integrate launcher-only changes and this record into canonical companion-dev documentation when Companion development ownership permits.

Verified public HTTPS SHA-256 (exactly matched Git source):
- bootstrap.txt: c4e0820eef012ee59d857926139c5ca5db65a9204821fb58a897f64c9d3ebd2c
- loader.js: e64a55e1169c8e25c49f275d419762f940a4008d7b629bdace93f23e72b78ea6
- channels.json: b9a9eefbbc2a8fd0241f8a39fe9b85bc259f6fe7d7900cb197e1ba857ba099a9
- Stable v15: 23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1
- Dev source: 895c9b38f9954b1604a455816ae3fee9e9e20ce39cf50d726fe9b8cbfecb81ec

Original loader text SHA-256: 55f463bc77c8dbb8b8a2b590fee814c7a05160f2ac0e983848be7ee752e82bb4. Original current v15 JS equals versioned v15 hash above.

Session complete: L1 and L3 implemented, tested and deployed; L2 publication helper implemented and synthetic gates passed, first real new Dev promotion not yet performed. Main and companion-dev remain separate. Next: focused architect review, consolidate native acceptance, and exercise real gated promotion at next eligible functional Dev checkpoint. No routine approval gate. Permanent stable release, native/live acceptance and full GitHub Release assets remain open.