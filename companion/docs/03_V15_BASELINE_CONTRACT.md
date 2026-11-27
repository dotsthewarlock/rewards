# Frozen v15 source contract and static risk register

**User-approved premise:** v15 works perfectly in the established bookmarklet workflow. Preserve that workflow; static observations are prospective risks for the new extension, not a claim of current user-facing failure. No code changes in this package.

## Source verification

- Canonical reference: `Redeem_Prepaid_Rewards.js`, extracted byte-for-byte from supplied `Redeem_Prepaid_Rewards_v15_2files.zip`.
- Version: `SCRIPT_VERSION = '15'`; slug regex `^CA\d{4}[A-Z][A-Z0-9]*$`.
- Size: 87,848 bytes; 2,073 lines.
- Git blob SHA-1: `6bea5e54bc8caa188600755c7dce952941909501`; SHA-256: `23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1`.
- `node --check` passed at source-refresh time. No runtime or browser tests executed. Original Markdown companion preserved byte-for-byte; verified it contains the JS source.
- Repository reference: https://github.com/dotsthewarlock/rewards/blob/main/redeem/Redeem_Prepaid_Rewards.js ; previous launcher: https://dotsthewarlock.github.io/rewards/redeem/Redeem_Prepaid_Rewards_loader.txt . Reverify repo revision and hosted bytes during V0.0. Local blob matches the identity recorded in prior handoff; this is not a fresh check of current remote branch.

## Existing integration and lifecycle

The audited repository loader fetches plain JS from GitHub Pages `/rewards/redeem/Redeem_Prepaid_Rewards.js` (hosted bytes not independently verified). Earlier Gist references are historical and not the current verified repository loader. Preserve the existing distribution. MV3 must package executable JS locally. Source ends with `UI.mount(); APPCTL.invoke();` (lines 2071–2072); `invoke` (1564–1580) mounts, pauses if already running, otherwise recovers, attempts clipboard import and runs. It is an explicit legacy wake/resume, not a safe passive initializer. Existing singleton calls its `invoke` at lines 109–113. Separate init, observation, capture/reconciliation and authorized execution in the extension wrapper; never invoke twice simply because navigation or injection occurs.

The current public API `window.__BS_REWARDS__` has `invoke`, `run`, `stop`, `currentSlug`, `viewSlug`, `queue.current/view`, `history.current/view`, `giftCards.current/view`, `version`. Preserve the legacy bookmarklet interface. Extension isolated-world state need not expose secrets through a page-world global; document environment differences. Existing logical areas: CFG/utilities, PAGE, STORE/SLUGS, SETTINGS, HIST, GIFTS, QUEUE, LOCK, DOM, CAP, UI, CLIP, APPCTL, bootstrap. Do not extract all at once.

## Historical functional contract

- Entry detection: `.bcr-redemption`, its `form#new_workflow_data`, and `.wizard-serial-number`. Success uses `.confirmation-block`, `.codes-container`, `.btn-claim-another-code` within `main.value-add.wizard` or `#main`. `body.dataset.slug` is authoritative for legacy promotion context; `data-project` or branding alone is not.
- `currentSlug` controls all live operations; `viewSlug` only reviews and explicitly clears selected cache. Namespaced storage plus browser origin separation. Unknown or changed identity halts execution.
- Existing UI: promotion cache selector, multiline 30-digit import, auto preference, email, optional clipboard, start/pause/resume, queue/history and gift drawers (reveal), TSV/CSV, confirmed clear controls, version and status. Limits 999 each for queue/history/gifts. The old UI is a functional regression reference only; R3 V0.1 prototypes the M3 side panel before production integration.
- Exact code strings, including leading zeroes; queue states queued/processing/pending/complete/error/duplicate. Preserve pre-submit recovery and submitted evidence; never advance unrelated item. Confirmed success requires explicitly labeled 30-digit Eligible Card matching the record and valid gift number/PIN in legacy parser. Never infer from current row. New reward or barcode formats require separate evidence and tests. Deduplicate by GC number+PIN; preserve source code linkage. Claim Another is a hard fresh-entry boundary.
- Export headers exactly `Card Merchant`, `Value Recent`, `GC Number`, `GC PIN` in order. Credentials are strings. Existing settings and caches remain compatible; do not auto-transfer sensitive records across origins. Legacy data is plaintext, not inherently encrypted. Audit spreadsheet formula and numeric-coercion risks without corrupting data.

## Storage keys and legacy migration

```
bs_rewards:<SLUG>:queue
bs_rewards:<SLUG>:history
bs_rewards:<SLUG>:giftcards
bs_rewards:<SLUG>:active
bs_rewards:<SLUG>:auto
bs_rewards:<SLUG>:email
bs_rewards:<SLUG>:clipboard
bs_rewards:<SLUG>:lock
bs_rewards:slug_index_v1
bs_rewards:legacy_migration_v1
bs_rewards:<SLUG>:tab_session  # sessionStorage
```

Legacy copies: `bs_bonus_email` -> email; `bs_clip` -> clipboard; `bs_hist` -> history; `bs_queue_v2` -> queue; `bs_active_v2` -> active; `bs_auto_redeem_v2` -> auto. Existing migration copies rather than deleting and tracks first receiving slug. See code for exact record shapes and migration semantics. No schema migration initially. If needed later: explicit read-only dry run, source origin/slug/counts, backup and idempotent versioned import, dedupe, reconcile pending, original retention and separate deletion. No old Auto-Redeem setting grants automatic new submission authority.

## Static risk register and handling

| Risk | Source anchors (v15) | Extension decision |
|---|---|---|
| P0 persistence failure may be swallowed | STORE.setJSON 235; HIST.save 359; GIFTS.save 419; QUEUE.save 497; captureSuccess 1627–1679 | Before new auto-capture/navigation path, require verified critical persistence/readback; halt without Claim Another on failure |
| P0 ambiguous submitted item replay | prepareItem 1582–1612 | Preserve legacy artifact; no implicit replay in new extension after refresh, timeout or worker restart; explicit review/reconciliation policy before retry |
| P0 stale success/next entry | captureSuccess/openNextRedemption 1627 onward; run 1955 onward | Preserve exact barcode association and fresh entry proof; no blind advancement |
| P1 cross-tab read/write lock, unfenced heartbeat; recovery before lock | 631–665; 1577; 1955–1962; initial recovery near 2048 | Do not expand transaction authority before single-flight and ownership tests; centralize/fence later as required |
| P1 stale singleton and async startup race | 109–113; 1955–1988 | Extension document lifecycle, duplicate injection guard; explicit reload diagnostic if needed |
| P1 unknown wizard variants, alternate submit labels, reward choice | DOM and APPCTL sections; campaign evidence | Do not guess; collect fixtures and require user review for selection; bounded transitions |
| P2 asynchronous clipboard import not awaited | 1577–1579 | User-initiated clipboard read separated from execution; permission test |
| P2 plaintext caches and global methods | storage/UI/public API | Keep legacy compatibility initially; restrict extension messages, logs and diagnostics; explicit migration only |

The browser cannot guarantee server-side exactly-once redemption. Design for one authorized active attempt, durable reconciliation, explicit ambiguity and operator intervention. Do not claim P0/P1 risks are already fixed. Broader refactoring is V0.4, but safeguards needed for new automatic behavior must precede enabling it. No silent change to legacy retry or success policy.

## Revision 2 clarification

Repository tree audited at main 0033e6f0366d4850ae13d83bea8fb934ac6d99e5; canonical and versioned v15 JS both match frozen blob. Current repository loader fetches GitHub Pages `/rewards/redeem/Redeem_Prepaid_Rewards.js`, not a Gist; hosted response unverified. Preserve current distribution. New diagnostic export confirms name=commit for all four campaigns, which v15 already recognizes; no label-specific patch justified by that evidence alone. v15 visual layout is not a permanent requirement: preserve functional regression contract and data compatibility; M3 design governs future UI.

## R3 precedence
Use 01 and 05 for current UX sequencing. Frozen JS remains unchanged.
