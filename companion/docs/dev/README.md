# Development cycle records

Purpose: durable, AI-readable architect/developer handoffs and engineering audit trail. These records are historical evidence, not a competing roadmap or authority.

- One concise Markdown record per meaningful engineering cycle, material decision or release checkpoint; use YYYY-MM-DD_Vx.y_topic.md (append a sequence only if needed).
- Record implementation commit/branch, scope, significant decisions and trade-offs, tests with actual outcomes and CI links, unverified assumptions, blockers, next action, and release/rollback status as applicable.
- Keep AGENTS.md canonical for instructions and companion/README.md canonical for current state. Link to records rather than duplicating their contents. Git history and CI logs supply detailed diffs/test output.
- Do not record routine micro-iterations, verbose transcripts, raw diagnostic exports, real credentials or personal data. Correct factual errors transparently; do not rewrite historical results to imply later acceptance.
- Records are not routine approval gates. Keep internal engineering autonomous; request only genuinely required user intervention or separate authorization.

## Index
- [2026-11-27 — V0.2 shared-core convergence](2026-11-27_V0.2_shared-core.md): verified read-only shared workspace and bookmarklet build; actual redemption convergence still pending.
