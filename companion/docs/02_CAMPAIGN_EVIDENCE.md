# Campaign evidence and compatibility registry

**As-of evidence:** Nov 26–27, 2026, as reported by the supplied PWA/Companion handoff. This is a preserved historical evidence digest, not newly verified live inventory, a full DOM fixture or extension acceptance. Dates and links below are from that handoff. Campaign-specific facts are not global adapter rules. No Shell campaign or unrelated balance checker is in scope.

### 2.2 Live evidence

All four campaign pages were successfully inspected using the connected Chrome tab reader on November 26–27, 2026. The tool exposed extracted document content, simplified element markup, link targets, labels and hidden input presence. It did not provide complete DOM attributes, script source, computed visibility, network activity, or reliable runtime state. The four pages were not tested by submitting claims.

Earlier direct web retrieval was unreliable. The text `Please upgrade your browser` appears even in the successfully extracted Chrome pages, so it is not proof of a browser incompatibility or blocking condition. The presence of inputs for inactive wizard steps in a text extraction does not prove their current visibility or actionability. CardPointers extension messages and OneTrust cookie-consent controls were present in browser extraction and are not part of the redemption workflow.

The record below is a sanitized evidence digest, not raw HTML. Session-specific hidden values were observed, including different values between two tabs for the same promotion. Their semantics are unverified. Do not reuse, store, export, or synthesize those values. Do not use the evidence digest as a substitute for actual DOM fixtures.

### 2.3 Evidence levels

Use these labels consistently in diagnostics, campaign registry records and release notes:

| Level | Meaning |
|---|---|
| E0 — reported | Screenshot, user report, or unverified prior statement |
| E1 — extracted | Official page content or structural hints read from a real browser tab |
| E2 — structural | Sanitized full-enough DOM snapshot with tested selectors and active-state observations |
| E3 — fixture-tested | Synthetic or redacted fixtures pass deterministic automated tests |
| E4 — live accepted | Ordinary user-authorized real claim completes, reward matches the intended purchased product, and recovery/export behavior is verified |

Do not automatically promote E1 evidence to E2 or E4. Track campaign-specific confidence and date of verification.

## 3. Campaign inventory (verified links and extracted terms)

All amounts CAD. Purchase dates below are inclusive and refer to 2026 unless explicitly stated otherwise. Campaign deadlines are published dates, not guaranteed stock or bonus availability. Preserve the exact campaign ID including final letters; notably Walmart is `CA1126VANW`, not `CA1126VAN`.

| Retailer / campaign | Origin and campaign ID | Qualifying purchase | Reward | Purchase window | Claim deadline |
|---|---|---|---|---|---|
| Walmart Canada | `https://getmybonus.ca` / `CA1126VANW` | $100 Vanilla prepaid card | $15 Walmart eGift Card | Nov 26–29 | Nov 30 |
| On the Run / Parkland | `https://prepaidrewards.ca` / `CA1126PKIZ` | $75 Vanilla Visa prepaid card | $15 Zift Zillions of Gifts eGift Card | Nov 20–Dec 7 | Dec 8 |
| Dollar Tree / potential Avondale | `https://bonusrewards.ca` / `CA1126DTZFT` | $50 yellow Zift Have Fun gift card only | $10 Zift Zillions of Gifts eGift Card | Nov 2–Dec 31 | Jan 2, 2027 |
| Petro-Canada | `https://cardbonuses.com` / `CA1126PZFT` | $50 Zift Merry Christmas or Have Fun | Choice: $10 Zift Have Fun or $10 Petro-Canada eGift Card | Nov 17–Jan 12, 2027 | Jan 13, 2027 |

### 3.1 Direct links

| Campaign | Redemption | Terms | FAQ | Support |
|---|---|---|---|---|
| Walmart | [Open](https://getmybonus.ca/CA1126VANW/en) | [Terms](https://getmybonus.ca/CA1126VANW/en/terms) | [FAQ](https://getmybonus.ca/CA1126VANW/en/faq) | [Support](https://getmybonus.ca/CA1126VANW/en/contact) |
| On the Run | [Open](https://prepaidrewards.ca/CA1126PKIZ) | [Terms](https://prepaidrewards.ca/CA1126PKIZ/terms) | [FAQ](https://prepaidrewards.ca/CA1126PKIZ/faq) | [Support](https://prepaidrewards.ca/CA1126PKIZ/contact) |
| Dollar Tree / Avondale candidate | [Open](https://bonusrewards.ca/CA1126DTZFT) | [Terms](https://bonusrewards.ca/CA1126DTZFT/terms) | [FAQ](https://bonusrewards.ca/CA1126DTZFT/faq) | [Support](https://bonusrewards.ca/CA1126DTZFT/en/contact) |
| Petro-Canada | [Open](https://cardbonuses.com/CA1126PZFT) | [Terms](https://cardbonuses.com/CA1126PZFT/terms) | [FAQ](https://cardbonuses.com/CA1126PZFT/faq) | [Support](https://cardbonuses.com/CA1126PZFT/contact) |

Additional official resources: [On the Run participating locations](https://ontherunstores.com/cardrewardparticipatinglocations); [Zift redemption website](https://zillionsgift.ca/). The latter is for spending the received Zift reward, not for claiming the initial promotion. Keep those workflows separate.

### 3.2 Retailer eligibility and unresolved questions

- Walmart: in-store at participating Walmart Canada locations; terms refer to Vanilla Visa and Mastercard issuers but qualifying purchase is stated as a $100 Vanilla prepaid card. Verify accepted specific product variants before labeling them supported.
- On the Run: in-store participating locations only, with an official store-list link. Product is specifically $75 Vanilla Visa.
- Dollar Tree: in-store participating locations only; total bonus inventory capped at 3,000 units. The official banner image filename is `DT-Avondale_ZIFT_IPP_Digital_Banners_Nov_promotional_site_EN_Less.jpg`. This supports an inference that Avondale Food Stores may participate, but official terms and FAQ do not explicitly name participating chains or enumerate stores. Dollar Tree was identified from supplied promotional signage; do not represent the filename as conclusive proof of Avondale eligibility.
- Petro-Canada: participating locations in-store only; the two Zift variants explicitly stated in terms. Confirm user-selected bonus before submission; do not select a default silently.
- Dollar Tree campaign FAQ was independently extracted from the actual browser tab. It states eligibility depends on denomination, purchase date and purchase location; each product is redeemable once. It directs users back to the terms for any claim-count cap. No explicit per-person limit was observed in the terms reviewed. Absence of an explicit limit is not proof of unlimited claims.
- Other participating retailers are unknown. Identical card packaging at another retailer is not proof of eligibility. Do not attempt test claims with unpurchased or invented barcodes to discover eligibility. Ask support for a complete retailer list if necessary.
- No live remaining inventory was verified, including the 3,000-unit cap. Promotion existence and promotion availability are distinct fields.

## 4. Ingested wizard evidence

All four pages display InComm Payments copyright/branding, the same basic multi-stage redemption form and common consent controls. Each exposes welcome, barcode/code entry, email and email confirmation, terms checkbox, submit control, photo upload and one or more dialog templates. This supports a common adapter hypothesis, not a guarantee of identical selectors or runtime behavior.

| Observed component | Walmart | On the Run | Dollar Tree | Petro-Canada |
|---|---|---|---|---|
| Welcome action | Get My Bonus | Get My Bonus | Get My Bonus | Get My Bonus |
| Bonus selection stage | Not observed | Not observed | Not observed | Choose your bonus; two choices |
| Barcode heading | Add your Code | Add your barcode | Add Your Code | Add Your Barcode |
| Barcode entry | Text input | Text input | Text input | Text input |
| Barcode assistance | Photo / Where is my barcode? | Same | Same | Same |
| Email fields | Two | Two | Two | Two |
| Terms checkbox | Present | Present | Present | Present |
| Final button label | Show & Email Code | Submit | Submit | Submit |
| Additional dialog text | Where did you purchase your gift card? | Which product did you purchase? | Which product did you purchase? | Which product did you purchase? |
| Hidden inputs | Present | Present | Present | Present |
| Success-page structure | Not observed live | Not observed live | Not observed live | Not observed live |

### 4.1 Structural fingerprint hints from assets

These filenames were observed in the official browser extraction. They are useful for diagnosis and human identification but are not stable selectors or proof of eligibility.

- Walmart banner: `WM_Vanilla_IPP_Digital_Banners_Nov_promotional_site_EN_Less.jpg`; barcode help image: `Generic_Vanilla_with_Markup_30_digits_249.png`.
- On the Run banner: `Parkland_Vanilla_-_ZIFT_IPP_Digital_Banners_promotional_site_EN_Less.jpg`; help image: `Generic_CR80_with_30d_IAB_Markup_700p.png`.
- Dollar Tree banner: `DT-Avondale_ZIFT_IPP_Digital_Banners_Nov_promotional_site_EN_Less.jpg`; physical-card image uses a hashed filename.
- Petro-Canada banner: `Petro_ZIFT_IPP_Digital_Banners_Nov_promotional_site_EN_Less.jpg`; two product images and explicit reward labels.

The 30-digit hints for Walmart and On the Run are not a verified global barcode requirement for every Zift card. Preserve barcode values as strings, including leading zeros. Validate each supported format with legitimate examples and campaign-specific evidence.

### 4.2 What is still missing

- Actual `body.dataset.slug` and structural attributes for each current campaign.
- Complete scoped selectors, accessible labels, input names, validation attributes, active-step transitions, and modal behavior.
- Whether `Submit` controls have `name="commit"` in the current pages.
- Whether a product or purchase-location dialog is active in ordinary use and what selection is required.
- Exact Petro bonus control roles, semantics and state transitions.
- Success-page and error-page DOM shapes, reward credential labels, optional PIN behavior, server-reported Eligible Card identifier and navigation lifecycle.
- Real behavior of expired, already-claimed, not-eligible, unavailable-stock, rate-limited, challenged, interrupted and ambiguous claims. Collect only when naturally encountered through legitimate use or synthetic test fixtures; do not provoke production anti-abuse controls.
- Exact browser policy, CSP, extension permission and navigation constraints on the user's Chromebook.

## Initial registry policy

Record normalized HTTPS origin and exact campaign ID, entry/terms/FAQ/support URLs, retailer evidence and uncertainty, qualifying products, reward options, purchase window and claim date (calendar dates unless time zone published), cap vs remaining availability, evidence level, verification date, capability hints and support status. Use integer cents, strings for identifiers and no invented eligibility or live inventory. All four current campaigns start at E1, diagnostic-only until their relevant adapter/extension path is verified. A regex match is not support proof. The older `cardreward.ca / CA1026CK1` is a historical entry fixture candidate; the prior handoff described structural selectors but no raw HTML is available here. Do not reconstruct authentic success HTML from textual evidence.

## Source provenance

Preserved from `Redeem_Prepaid_Rewards_PWA_Companion_Handoff_2026-11-27(1).md`, sections 2.2–4.2 (prior browser extraction). This file replaces those sections as active project reference. No independent November 27 re-inspection was performed for this source refresh.

## Revision 2 structural export

Private source `InComm_Diagnostics_2026-11-27T06-22-10-497Z.json`, schema incomm-diagnostics-export/1, listener 0.1.0. Parsed 61 snapshots, 77 events, zero dropped reported. See 06_V00_STATUS_AND_EVIDENCE.md for aggregate evidence. All snapshots match expected body slug and entry detection; every campaign has name=commit on the submit input. Active step markers observed, but the collector reports some inactive step descendants as visible. Entry structure is E2 candidate evidence, not E3/E4 or verified actionability. No success snapshots. Keep raw export private pending redaction audit. This supersedes earlier absence of structural snapshots and unverified submit-name/body-slug statements, but not remaining workflow uncertainties.

## R3 status
Original listener source now included in its unchanged ZIP; audit pending. The R2 structural export findings remain valid. See 06 for latest evidence and private export hash.
