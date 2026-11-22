# NoKitchen 1.4.1 verification

## Household publication

On the original 1.4 checkpoint (`e10391b`), Chromium showed three clickable daily meal cells before the bank had approved anything. After approving the seed and selecting **Improve variety**, H02’s Monday breakfast switched from approved **Peanut butter and banana bread** to unapproved **Sweet couscous with raisins**. The bank still owned the original approval. The household view had used the same draft-oriented selector as the bank.

In 1.4.1 a household sees its validated approval. The integrated browser test exercised the exact two different breakfasts, their preparation methods, every reserved ingredient amount, every lot in the corresponding collection, and the return link from box to recipe. A new draft and reload retained the prior publication. Approving the replacement updated all three views. Excluding an ingredient in the replacement blocked both actionable views across reload while keeping settings available. Releasing the approval restored the waiting state. Escape and the close button returned keyboard focus to their launch controls. [Publication browser test](../tests/publication.mjs) · [Unit tests](../tests/household-publication.test.ts)

## Synthetic results

The model week starts 23 November 2026. The seed selected 297 of 378 requested portions across 134 household meal slots. A fresh first-fit reference on the same inputs reached 286. The selected seed, reference and tested donation candidates passed the common validator. Twelve sealed 200 g chickpea pouches were offered. Each actual delivery branch was calculated independently from the same reviewed offer and captured baseline.

| Actual pouches | Choice | Portions | Filled / removed / changed / unchanged slots | H02 Friday chickpeas |
| --- | --- | ---: | --- | ---: |
| 12 | Keep existing meals | 309 | 5 / 0 / 0 / 134 | 1,200 g |
| 12 | Reallocate for coverage | 310 | 8 / 2 / 28 / 104 | 800 g |
| 8 | Both choices identical | 305 | 3 / 0 / 0 / 134 | 400 g |

In the 310-portion allocation, H03 loses a three-portion Friday dinner and H08 loses a three-portion Saturday breakfast. With a prior approval, the default is **Keep existing meals**. With an unapproved baseline, the default is **Reallocate for coverage**. The JSON records both baselines, all household and slot changes, lot traces and validation results. [Generated evidence](decision-results-1.4.1.json)

## Browser and delivery checks

The ordinary workflow and the seven-step guided demo were exercised in Chromium 156.0.8078.79 on Linux. The recording path kept the whole 12-pouch receipt, approved the 309-portion plan and followed the delivered lot into H02’s two-portion kettle dinner and six-pouch Friday box. The tour began in the bank draft and ended with the published household meal and box. Back, Restart, Exit, Finish and reload preserved the ordinary saved scenario. [Recording test](../tests/recording.mjs) · [Guided test](../tests/guided.mjs)

The integrated release passed TypeScript and all 89 unit tests in 17 files. The public distribution contained the Pages HTML entry, one JavaScript bundle, one stylesheet and the standalone, with zero source maps. The isolated build under six synthetic private sentinels matched the release files byte for byte. The public guard rejected all six deliberately contaminated controls.

The production files were served locally under a project subpath and checked in fresh Chromium profiles at 1,365 and 390 pixels. The direct H02 recipe-catalog hash survived refresh, the version marker read 1.4.1, all 40 recipe cards rendered and both bundled font families loaded. The narrow navigation restored focus after Escape. The static GET allowlist observed zero external, private API or WebSocket attempts.

On this host Chromium refused direct file navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. The cold-start verifier served only the standalone HTML through loopback. Before first load it blocked service workers, disabled caching and denied requests except for navigation to that single document. The bank, comparison, what-if, donations, household publication, tour and storage workflows completed with 14 HTML-only GETs including reloads, and zero additional resource or WebSocket attempts. This run verifies the loopback delivery method. Direct file opening remains unverified here.

The production operator build passed its mock-provider end-to-end checks. At 1,390 pixels, twelve actually received pouches produced the 309/310 alternatives. The preserved plan traced 400 g from the received lot to H02’s Friday dinner and 1,200 g to its Friday box. At 390 pixels, eight actually received pouches produced 305 portions under both choices. Import retry and browser-storage write failure recovered. Restart produced zero duplicate receipts. The public subpath check observed zero operator API requests. These tests used the local Node operator and a synthetic HTTP provider. [Private workflow tests](../tests/live-flow.mjs) · [Storage recovery test](../tests/private-storage.mjs)

Run the following commands from the extracted `NoKitchen/` directory with Node 24, locked dependencies and Chromium. The standalone verifier reports the exact artifact hash, whether direct file navigation worked, and the observed network requests. The deployed-site command compares every public file to the built release, including its standalone, then drives unauthenticated desktop and mobile browser sessions under a static GET allowlist. It reports both the verified URL and the SHA of the checkout used in the comparison.

```sh
npm ci
npm test
npm run build
npm run check:public
npm run evidence:decision
npm run test:standalone
npm run build:operator
npm run test:live
node scripts/verify-pages.mjs "$NOKITCHEN_URL"
```

A separate private operator service implements read-only mail retrieval. Its automated exercises use synthetic HTTP responses. Real provider retrieval has not been verified for this release. Branded Safari was unavailable on this Linux host. The model covers one synthetic week and makes no nutrition or global optimality claim. [Operator boundaries](agentboxd-security.md) · [Timed video script](demo-script.md)
