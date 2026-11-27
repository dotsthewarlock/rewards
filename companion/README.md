# Rewards Companion
Current: synthetic V0.1, not a redemption extension or release. See AGENTS.md for current authority. R3 reference details remain in docs/02–05. Original archives and private diagnostics stay separate. The v15 production bookmarklet and scanner are unchanged.
## Roadmap (internal checkpoints)
- V0.0: source/static verified; native fixture compatibility and hosted bytes pending.
- V0.1: batch-first M3 workspace, synthetic model and targeted hardening. 28 local regressions passed; independent preview browser test passed on commit f50808f (run 45972713409). Native MV3 package browser test and UX accessibility tasks next.
- V0.2: incremental v15 + listener functional integration; privacy, durable persistence, identity and explicit authorization prerequisites before enabling execution.
- V0.3: evidence-driven campaign variations; unknowns diagnostic-only.
- V0.4: failure injection, concurrency, recovery, simplification.
- V0.5: functional/UX parity, WCAG 2.2 AA, consolidated actual Chromebook and separately authorized ordinary live acceptance.
- V0.6: deterministic release candidate, permission/privacy checks and rollback.
- V1.0: verified stable GitHub release; original listener remains until parity and data preservation verified.
## Source
extension/ is the actual synthetic MV3 package. core/ contains pure model, presentation commands, immutable campaign registry and data codecs; ui/ contains view projections, semantic components, local M3 tokens and event adapter. Browser shell has only sidePanel permission, no merchant access. Mock state is in-memory. No real claims or storage migration. tests/ contains original regression tests and the independent browser checks. No runtime dependencies.
## Test
Run npm test from this directory (Node 22). GitHub Actions tests the actual source package with pinned Ubuntu 24.04 and Playwright. Real toolbar-click UX and Chromebook acceptance are not implied by loading a chrome-extension page. Do not install a prototype just to test it; consolidate user testing at the meaningful integrated beta.
