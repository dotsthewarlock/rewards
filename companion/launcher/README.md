# Permanent bookmarklet bootstrap and hosted launcher

The launcher is independent of the extension. The saved URL in bootstrap.txt remains frozen. Update loader.js at the same Pages URL; do not ask the user to replace a bookmark. Preserve original redeem/ and scan/ assets and the independent v15 fallback. No live claims, extension installation, or stable promotion are authorized by this loader.

## Channels and deployment

Stable pins frozen v15 by SHA-256; changing Stable requires separately accepted V1.0 and an explicit contract revision. Dev is a verified coherent development checkpoint, not the newest commit and not live accepted. The currently pinned Dev source is exact de3cb5d394100851e2a4005dc9c1e0420311cc60, CI 46049375697, artifact 15223189210. Original publication fa91fff / Pages 46068118834. The first permanent-package publication retains this exact verified V0.6 source and build; same-version path migration must retain its source hash. No rebuild or version promotion is implied.

The optional Test selector is hidden unless the manifest provides a valid versioned Test artifact, a short purpose and read-only mode. Metadata is not a sandbox: before any Test pointer is published, independently verify the artifact cannot initiate live writes or claims. No automatic Test publication or arbitrary version browser. Remove an obsolete Test pointer, not immutable files.

## Gated Dev-only publication

Use an isolated, clean checkout of current main with the existing authorized GitHub CLI and Git credentials. Only choose a coherent checkpoint with recorded applicable safety, privacy and compatibility evidence. A green CI push alone is not promotion. The publication helper validates the exact companion-dev push run, successful workflow, matching nonexpired artifact, outer digest, inner checksums, package and extension metadata and forward ancestry. It validates bounded publication evidence (exact commit, numeric run/artifact identifiers and checkpoint; activation rechecks returned artifact identity). It also verifies the self-contained bookmark URL/source relationship, frozen bootstrap and both original v15 sources/loader, expected extension runtime membership, rollback baseline and all staged immutable assets. It never pushes, grants permissions or edits Stable. No new write-capable CI workflow.

1. Run `python companion/launcher/tools/publication.py prepare --commit <40-character SHA> --run <CI run ID> --checkpoint "<functional outcome and evidence>"`.
2. Commit only the new immutable version folder (bookmarklet source, exact outer development ZIP containing the corresponding extension package and self-contained bookmarklet, publication.json). Fast-forward push against the reviewed main head; do not force. Wait for Pages success.
3. On a clean checkout of the new current main, run `python companion/launcher/tools/publication.py activate --version <version>-dev-<sha12>`. This rechecks artifact metadata, local and hosted bytes, forward ancestry and the unchanged previous Dev pointer. It changes only channels.json. Commit and fast-forward push. On any conflict, stop and recheck rather than overwrite.
4. Verify Pages workflow and the separate Launcher verification hosted job. Record exact commit, CI, hashes, previous pointer and outcome. The last verified pointer remains active if preparation or preactivation verification fails. A postpublication discrepancy requires explicit rollback; no automatic channel switching.

Dev distribution ZIPs published this way are testing packages, not GitHub Release assets or stable acceptance. The existing CI artifact can expire; keep immutable published files. No promotion triggered automatically by a development push. GitHub Releases publication and stable acceptance remain separate.

## Loader lifecycle and trust

Native M3 dialog, one selected launch, scoped styles, system appearance. Repeated invocation with a known active page workspace is a no-op; bootstrap and UI single-flight guards prevent duplicate dialogs. Cancel aborts and fences pending work; retry is manual. A short-lived observer only detects removal of the dialog host and is disconnected on exit. The loader does not read credentials or merchant form values. It cannot prove no isolated-world extension or unresolved legacy attempt exists. Never run generations concurrently or switch with an unresolved submission. Stable invokes the established v15 behavior, which can start/resume processing; do not call it merely to test a dialog.

Same-site HTTPS, omitted credentials/referrer, rejected redirects, bounded fetch, exact SHA-256 before eval. Loader and manifest are mutable trust roots, not an independently signed update chain. CSP may block execution; do not circumvent. No remote executable extension code. Unknown/failed execution is not permission to retry a redemption.

## Verification and rollback

Initial isolated M3 browser verification: 27dba4467b65fd7787f3bd280dc05605c8972022 / run 46070141336, 15 synthetic scenarios passed. Later changes must pass the launcher browser and publication gate tests again. Main changes additionally run hosted-byte verification on GitHub Actions. Local runtime has administrator-blocked browser navigation and unavailable Pages DNS, so CI is the verification environment. Native Chromebook and live acceptance remain open.

Loader rollback: restore only loader.js from a known-good commit using a new fast-forward commit; keep bootstrap, artifacts and pointers intact. Dev rollback: explicitly restore a previously verified Dev pointer after checking hosted bytes and absence of unresolved attempts; never automatically roll back or alter Stable. Original v15 bookmark remains independent, not an authorization to switch tools mid-transaction.

Native acceptance: use the single [Companion native checklist](https://github.com/dotsthewarlock/rewards/blob/companion-dev/companion/docs/native-acceptance.md). No separate launcher live claim is required.


## L2.1 verified deployment

The original V0.6 package is now permanently versioned on GitHub Pages: [public package](https://dotsthewarlock.github.io/rewards/companion/launcher/releases/0.6.0-dev-de3cb5d39410/rewards-companion-0.6.0-dev-de3cb5d39410-development.zip), [provenance](https://dotsthewarlock.github.io/rewards/companion/launcher/releases/0.6.0-dev-de3cb5d39410/publication.json). Active main [653a763](https://github.com/dotsthewarlock/rewards/commit/653a7630d9a15a310633f063cad98bd6c8f207ca), [Pages 46071881490](https://github.com/dotsthewarlock/rewards/actions/runs/46071881490), [final verification 46071882218](https://github.com/dotsthewarlock/rewards/actions/runs/46071882218) succeeded; all ten hosted hashes matched. Same exact candidate/source, old flat artifact retained. See [L2.1 handoff](../docs/dev/2026-11-27_launcher-L2.1-handoff.md). Native/live acceptance and GitHub Release assets remain open; no stable promotion.

## UX refinement — automated architect acceptance

Implementation [9f6314a](https://github.com/dotsthewarlock/rewards/commit/9f6314af2d2b286cddf9689346c7e4c37d2f49ae); tested candidate [fc7b8e5](https://github.com/dotsthewarlock/rewards/commit/fc7b8e55a8a3280c591a1f8fd388a00c8c5312e0), [CI 46076748073](https://github.com/dotsthewarlock/rewards/actions/runs/46076748073) SUCCESS: 26 synthetic scenario executions, three publication tests and syntax. Stable remains default; Preview is Dev. Exact versions, bounded technical failure detail and optional public issue reporting live in collapsed Help & version details. Reporting opens the existing GitHub issue form without prefilling or sending launcher/merchant data; explicit privacy warning, no background reporting or infrastructure. Accepted for coordinated integration; not deployed. All protected blobs identical to pre-integration main 3f9fd6c. Native zoom/assistive technology, saved bookmark/CSP and native rollback remain in the consolidated checklist. [Acceptance and integration handshake](../docs/dev/2026-11-27_launcher-UX-checkpoint.md). L2.1 pointers and immutable assets unchanged.
