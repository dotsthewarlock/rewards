# Discovery, safety and acceptance specification

**Revision:** 2026-11-27 | Applies to desktop extension development. Evidence and implementation status must remain separate. Use only synthetic test data and sanitized legitimate observations. Never exercise production security controls for test purposes.

## Discovery modes and data contract

## 7. Discovery-first diagnostics design

Prioritize reliable discovery of relevant campaign assets and page variants over minimizing initial diagnostic implementation size. Minimize runtime work and data collection after detection; do not turn the extension into a general browsing logger. Use an adaptive mode model:

| Mode | Activation | Behavior |
|---|---|---|
| Dormant | Unsupported or irrelevant page | No sensitive collection, no merchant interaction; no persistent background scanning |
| Discovery | Explicitly authorized known or candidate merchant page | Read-only structural recognition, confidence assessment, origin/campaign detection |
| Recording | User-enabled supported page | Capture sanitized stage transitions and structural evidence; incremental persistence of diagnostic observations |
| Deep diagnostics | Explicit user request for a specific campaign/tab | More detailed redacted element metadata and bounded mutation summaries; no raw credential values or request bodies |
| Assisted workflow | Verified supported campaign and explicit user authorization | Foreground form assistance subject to review gates and normal site controls |

Unknown domains or uncertain fingerprints should remain read-only and request user review. A single string, regex match or banner filename must never authorize submission. Use independent evidence categories (origin allowlist, campaign ID, expected provider structure, stage/action semantics) and record conflicts rather than averaging them away. Asset discovery means structural references and campaign metadata, not gathering secret tokens or attempting hidden endpoints.

### 7.1 Diagnostic record shape (proposal, illustrative)

```json
{
  "schema": "rewards.diagnostic.v1",
  "capturedAt": "2026-11-27T00:00:00Z",
  "origin": "https://bonusrewards.ca",
  "campaignId": "CA1126DTZFT",
  "adapterVersion": "development",
  "mode": "discovery",
  "evidenceLevel": "E1",
  "stage": "unknown",
  "observed": {
    "provider": "InComm Payments",
    "controls": ["Get My Bonus", "Submit"],
    "emailFieldCount": 2,
    "hiddenFieldsPresent": true,
    "productDialogTemplatePresent": true
  },
  "unverified": ["activeStage", "submitName", "successParser"],
  "events": [],
  "redaction": {"valuesExcluded": true, "queryExcluded": true}
}
```

No actual captured timestamp is asserted by this illustrative object. In real records use UTC timestamps, normalized origin/campaign identity, redacted path metadata and bounded event counts. Do not store query parameters, URL fragments, arbitrary HTML text, account identifiers, real barcode/card/PIN/email values, cookie data, hidden form values or CAPTCHA tokens. Be careful that labels, error messages and accessibility text can themselves contain credentials; redact before persistence/export. Avoid raw HAR files, screenshots of live reward credentials, full-page dumps or unbounded network interception.

For selectors, collect tag/type, safe ID/class/name patterns, accessible labels, scoped ancestry and computed actionability without including input values. Distinguish template presence from visible active state. Incrementally persist sanitized observations on meaningful stage changes; deduplicate identical snapshots and cap retention. Diagnostics must be read-only and independently usable without running a claim.

The V0.0 harness may implement only the minimal read-only probe. The full listener and diagnostic export integration are V0.2; original listener source now available for read-only audit. Use scoped observers on meaningful stage changes; debounce/deduplicate/cap retention, teardown on page departure, and do not store arbitrary mutation text. Allowlist safe structural tokens, redact at collection boundary, and test exported records for leakage. Hidden-field presence or count only, never values. Keep diagnostic capture independent from claim execution. Use extension-local diagnostics storage, not public telemetry. Unknown campaigns read-only; all automated actions require supported identity and a reviewed foreground session.

### Native diagnostic refinement (bounded corrective assignment)
The 2026-11-27 native structural export is summarized in native-acceptance.md. Retain the existing shared structural core, scoped passive recorder, explicit manual capture, allowlisted labels/counts, deduplicated snapshots and ordered events, extension-local validated serialized storage/readback, 500/2000 retention limits and no automatic deletion. No second listener, raw DOM/network capture, credentials, arbitrary text, per-user telemetry, new host access or database/migration. Bookmarklet remains current-document only; MV3 retained timeline is not equivalent to continuous or complete event coverage.

Prioritize small diagnostic improvements demonstrated by this export: use existing generated workspace build identity to add **exporter** version/full SHA/distribution where known (otherwise explicit unknown), not retroactively identify retained captures; label historical/mixed capture provenance unknown. Use existing structural fields/labels in a readable current stage/control summary; manual capture remains explicit, recognized, recording-enabled, target-fenced and persisted/read-back, not a force bypass. Explain fixed non-sensitive blocking/capture reasons (e.g. inactive/hidden barcode, disabled submit, unrecognized or changed context, retention/storage failure) without duplicating transaction validators, reading hidden values, exporting transaction details or inferring outcomes. Container presence is not actual error; any proposed extra signal must be bounded boolean/enum from existing scoped observation, with a concrete diagnostic question. Distinguish snapshot first-observed time from event observation time; generic interaction does not identify a particular action or user, repeated success does not prove linked redemption. Recording-blocked describes current retention/validity, not absence of historical missed writes; show known failure/unknown honestly, don't manufacture completeness. Preserve existing raw records, old exports and validation/readback; no schema overhaul or automatic retention clearing. Verify both packaged transports/UI with existing synthetic suites (including old-format retention, repeat observations, capture failure, exact exporter identity, no secret leakage and no change to authority). Defer session correlation, richer selectors, export segmentation, storage optimization or deep inspection tooling unless a specific remaining problem requires them; manual read-only metadata inspection first.

Separate read-only architecture assessment of the authentic staged wizard gap: determine whether exact earlier visible barcode binding can remain demonstrably linked to the actual final submission through legitimate transitions without reading hidden values, guessing from queue, bypassing merchant checks or weakening stale/ownership fences. A remembered value alone is not proof of what will be submitted. Use synthetic fixtures of observed visibility changes, safe metadata inspection if already available, and return smallest defensible design or fail-closed blocker. Any change to transaction authority or final authorization predicate requires Master review before implementation. No live claims, device updates or native recovery clearance.
 
## Transaction boundaries for new extension behavior

- Auto-mount and observe are independent of Start/Resume. User-reviewed authorization is not inferred from existing auto preference, clipboard, reload or worker wake. Final claim is explicitly authorized for the intended purchased product, exact barcode, reward, email and terms. No automatic replay of unknown outcome; preserve pending evidence and block later items until resolved.
- Match origin, campaign, document/tab, exact source barcode and transaction/run generation. One active authorized attempt per campaign; fail closed on ownership conflict. Cancel stale async continuations and recheck before any action.
- Record pending intent durably at submit boundary, distinguishing attempted vs not attempted. Capture explicitly labeled success and required reward credentials, persist/read back exact source linkage before completion or Claim Another. Missing/mismatched evidence, write failure, challenge, rate limit, disabled action or unknown stage blocks advancement.
- CAPTCHA remains manual. No hidden submission, security workaround, guessed eligibility, credential enumeration, arbitrary product/location selection, background redemption or artificial errors to discover limits.
- No fixture should contain real codes, card/PIN, email, tokens, session values, request bodies, raw HTML dumps or screenshots with credentials. A synthetic success fixture is useful for logic, but not proof of actual success-page structure.

## V0.0 compatibility decision gate

| Test | Expected outcome |
|---|---|
| Baseline blob + parse check | Exact supplied hash; syntax valid |
| Repository and loader | Record actual tree, branch/revision and hosted loader status; no production edit |
| MV3 package | Manifest valid; local code only, minimal known-host scopes, no unnecessary permissions |
| Content script execution | Isolated-world DOM access verified, UI mounts on safe test page, no unintended run |
| Page identification | Known entry recognized only with matching evidence; unsupported/unknown pages non-mutating |
| Storage | Existing origin/slug data accessible and unchanged on mount; synthetic reads/writes only in fixtures |
| Clipboard | Gesture/permission outcomes documented; denial safe; no background import |
| Reinjection / navigation | One UI per document, no duplicate invoke, reload restores state without implicit claim |
| Background lifecycle | No reliance on continuous worker; no unexpected execution on restart |
| Device acceptance | Actual Chromebook test result if authorized and feasible; otherwise explicitly pending |

Report actual pass/fail/blocked/not run for every test, commands, environment and evidence. A parse check alone is not compatibility. Stop at decision gate; no production publish.

## Later regression and acceptance matrix

## 11. Test strategy and acceptance matrix

Use synthetic fixtures and sanitized legitimate DOM observations. Never use live card credentials in repositories, tests, issue descriptions, CI logs or screenshots. Tests must not submit real claims.

| Test area | Minimum acceptance |
|---|---|
| Identity | All four known slugs recognized when actual structure supports them; conflicting origin/slug, unknown page and unrelated extension overlays rejected for actions |
| Discovery | Read-only mode causes no clicks, submits or value changes; hidden templates distinguished from active controls; no token/credential leakage in exported diagnostics |
| Registry | Correct amounts/dates/links; Avondale labeled inferred; inventory cap distinct from remaining stock; no invented eligibility |
| Wizard | Fixtures for each observed campaign variant, explicit Petro choice, alternate final labels, product/location dialogs, disabled/hidden controls, terms review |
| Input | Exact string preservation, supported barcode schema, wrong product or conflicting barcode blocks action, no invented PINs |
| Submit gate | Import, reload, navigation, clipboard event and stale messages cannot trigger a claim; user-reviewed confirmation required |
| Persistence | Inject quota/write/readback failures; no false success, no Claim Another, no advancement or loss of captured data |
| Reconciliation | Exact source-to-reward match; stale/mismatched success cannot complete the current item; ambiguous submission blocks until manually resolved |
| Concurrency | Two tabs, stale locks, duplicate messages, pause/resume, worker restarts and reloads cannot cause double execution or lost records |
| Timing | Bounded transitions, cancellation fencing, no blind retries; challenge/rate-limit/unknown states halt or pause appropriately |
| Export | Stable column compatibility, strings/leading zeros, verified source linkage, explicit transfer, malformed packet rejection |
| Migration | Read-only dry run, correct origin/campaign counts, no overwrite of conflicting confirmed records, original data retained |
| Distribution | Version/hash consistency, clean build, no remote executable extension code, no secrets in artifacts |

Retain v15 as historical reference and make fixture-based parity comparisons for proven non-risky behavior. Do not treat v15's ambiguous retries or swallowed persistence failures as desired parity. Add regression tests for every defect in Section 5.1.

Supplement with legacy acceptance: exact 30-digit leading-zero strings; earlier alphabetic and alphanumeric suffix slugs (including CA1026CK1); active vs hidden controls; conflicting barcode not overwritten; pre-submit crash recovery; same code pending precedence; stale/mismatched success never completes unrelated item; Claim Another wait for fresh entry; full navigation/reinvocation; separate slug and origin caches; non-current cache review never redirects live writes; legacy migration idempotence; stable export headers; old singleton/version diagnostics; empty queue/invalid email/disabled button bounded safe stop; UI with 999 items. Test storage failure at every critical write and readback; simulate two tabs and cancellation at each transition. No real purchases or claims for tests.

## Fixture and evidence requirements

Use `node:test` or existing repo tooling for pure logic, a DOM harness for selectors, and Chromium/Playwright or equivalent for browser behavior. Deterministic fake timing and synthetic storage failures. Record source provenance and capture date for each fixture, with E1/E2/E3/E4 status per campaign; synthetic fixtures never substitute for real structural observation. Authentic sanitized success snapshots remain missing. E4 acceptance requires separately authorized ordinary legitimate use and exact reward linkage, durable capture and recovery/export verification. If campaigns expire before live acceptance, defer to future equivalent promotions, not manufactured claims. No deployment approval is implied by passing tests.

## Reporting template (each milestone)

- Repo/branch/commit or exact file paths and hashes; scope implemented versus deferred.
- Commands and environment; tests passed/failed/blocked/not run; sanitized fixture provenance and per-campaign evidence level.
- Behavior changes versus frozen baseline, reasons, explicit user approvals where applicable, risks and rollback.
- Outstanding blockers and next decision gate; no unsupported compatibility claims.

The old handoffs supplied the diagnostic mode model, test matrix and safety requirements; this file consolidates those under the current desktop-first sequence, not the earlier PWA-first or rewrite-first plan.

## Revision 2 gate additions

V0.0: reported native Chrome ERR_FILE_NOT_FOUND is P0. Validate manifest asset references and packaged HTML dependencies, install from freshly extracted stable directory, verify toolbar popup and side panel only if declared, repeat native fixture checks and record observed results. Missing-file root cause remains unconfirmed until reproduced. V0.0.2 candidate adds a local fixture-only popup with no new permissions; static checks do not prove device acceptance. Original harness runtime blocked by policy. V0.2: reuse supplied listener v0.1.0 source after audit of redaction, permissions, retention, capture scope, visibility/actionability and persistence before integration. Do not assume export proves source-level privacy. Exclude raw diagnostic export from public repository. V1.0 additionally requires M3 UX acceptance per 05_M3_UX_CONTRACT.md.

## R3 gate amendment
0.0.2 popup verified by screenshot only; 0.0.3 icon candidate has 7 recorded static passes, native runtime pending. Read 06. V0.1 is synthetic M3 UX foundation; V0.2 functional integration includes audited listener and required safety prerequisites; all previous transaction and privacy requirements remain. See 05 for accessibility and UX acceptance.
