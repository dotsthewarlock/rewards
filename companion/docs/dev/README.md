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
