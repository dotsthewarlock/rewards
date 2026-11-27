# Development records — compact handoff contract
Historical evidence, not current policy. AGENTS.md and companion/README.md govern. Git diff is change detail; CI is test detail. One record per meaningful cycle/checkpoint, material decision or session handoff; no transcript, daily diary, repeated roadmap or routine micro-iteration. Prefer ~150–350 words (more only if material evidence warrants); link rather than copy. Never include credentials, raw private diagnostics or personal data.

## Record format
- Base → implementation SHA (branch); relevant diff paths/symbols; milestone/scope completed vs remaining.
- Evidence: command/environment as needed, CI link, actual pass/fail/blocked/not run, important limitations. Distinguish synthetic/native/live. Link fixture provenance if changed.
- Material decisions/assumptions only: choice + why/alternative or trade-off + affected contract + evidence/confidence + unresolved risk/revisit trigger. Include meaningful prevention vs recovery choices, compatibility/UX deviations and authorization boundaries. No inference that an assumption is approved.
- Next: highest-priority action; real blockers, minimum user action if required, release/rollback status if changed. At session end explicitly state complete/deployed, checkpoint/incomplete, or blocked; user intervention yes/no; remote handoff saved/failed; exact SHA and CI status. Verify the remote record and update README. End with a copyable Markdown architect handoff (button where supported): short commit/record link and status when saved; full sanitized fallback handoff when save fails. Do not require re-upload or paste of records already on GitHub.
- Architect review: compare from last reviewed SHA, inspect affected risk/contract boundaries and actual evidence; record brief verified/needs correction/deferred outcome, rationale, next focus. Change AGENTS/README/contract only where decision or current status changes. If nothing material changed, a short review note or commit reference suffices; no approval gate. Preserve historical records; append or correct transparently.

## Records
- [V0.2 shared-core checkpoint (2026-11-27)](2026-11-27_V0.2_shared-core.md): read-only shared workspace/build and verified limitations.
- [Authority reconciliation (2026-11-27)](2026-11-27_authority.md): one-time architect source audit, compact review contract.

- [V0.2 cache and transaction boundary (2026-11-27)](2026-11-27_V0.2_cache-transaction.md): verified shared edits, fixture-tested persistence and exact capture candidates.

- [V0.2 reconciliation architect review (2026-11-27)](2026-11-27_V0.2_reconciliation-review.md): verified transport/capture, permission preflight and session handoff contract.

- [V0.2 foreground authorization developer handoff (2026-11-27)](2026-11-27_V0.2_foreground.md): verified exact attempt binding, native final-form transport, source audit and remaining gates.

- [V0.2 foreground architect review (2026-11-27)](2026-11-27_V0.2_foreground-review.md): verified final-form fixture integration, remaining evidence/recovery gaps and stream convention.

- [V0.2 incomplete session review (2026-11-27)](2026-11-27_V0.2_blocked-session-review.md): unchanged implementation head, reported execution restriction and updated handoff interface.

- [V0.2 independent verification developer handoff (2026-11-27)](2026-11-27_V0.2_independent-verification.md): static accessibility/packaging, read-only integrity, recovery guidance and CI status.

- [V0.2 independent verification architect review (2026-11-27)](2026-11-27_V0.2_independent-review.md): CI retry and handoff verified, next independent UX/acceptance priorities.

- [V0.2 workspace parity developer handoff (2026-11-27)](2026-11-27_V0.2_workspace-parity.md): masked browse, explicit reveal, shared UI accessibility/diagnostics and acceptance evidence.

- [V0.2 workspace parity architect review (2026-11-27)](2026-11-27_V0.2_workspace-review.md): final CI verified, single-record privacy/stale-selection correction, stream navigation convention.

- [V0.2 single-record reveal developer handoff (2026-11-27)](2026-11-27_V0.2_single-record-reveal.md): snapshot-bound single-row privacy, stale rejection, connected MV3 sender and expiry acceptance.

- [V0.2 single-record reveal architect review (2026-11-27)](2026-11-27_V0.2_single-record-review.md): privacy correction accepted, consolidated remaining independent work.

- [V0.2 consolidated development package (2026-11-27)](2026-11-27_V0.2_development-package.md): clipboard draft, diagnostic retention/provenance, deterministic artifact and rollback, native acceptance checklist.

- [V0.2 package and monitoring roadmap architect review (2026-11-27)](2026-11-27_V0.2_package-monitoring-review.md): consolidated checkpoint, verified package CI, separate Canadian monitoring enhancement.

- [V0.3/M1 public catalog developer checkpoint (2026-11-27)](2026-11-27_V0.3_M1_catalog.md): exact identity, manual catalog, privacy correction, synthetic CI and downloaded package verification.

- [V0.3/M1 catalog architect review (2026-11-27)](2026-11-27_V0.3_M1_review.md): verified synthetic checkpoint; targeted parser, restriction precedence and stale-state corrections before scheduling.

- [V0.3/M1 catalog hardening developer checkpoint (2026-11-27)](2026-11-27_V0.3_M1_hardening.md): parser ambiguity, restriction precedence, rate-limit distinction, stale intent and persistence verification.

- [V0.3/M1 hardening architect review (2026-11-27)](2026-11-27_V0.3_M1_hardening-review.md): synthetic corrections accepted, native evidence outstanding, isolated M2 planning gate.

- [V0.3/M2 offline scheduling developer checkpoint (2026-11-27)](2026-11-27_V0.3_M2_offline.md): pure due-time/state planning, synthetic lifecycle and recovery boundaries, unchanged runtime package verification.
