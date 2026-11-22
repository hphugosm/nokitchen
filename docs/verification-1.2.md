# NoKitchen 1.2 verification

## Reproduced before the change

The actual 1.1 project, recipe audit, release report, standalone HTML and source archive were present. The original sources passed 35 tests, type checking, a production build and both Chromium walkthroughs. The same 16 recipes and 20 methods remain in this release. The [recipe audit](recipe-audit.md) covers packaging, household restrictions, methods and preparation assumptions.

On the initial 378-portion week, the original heuristic assigned 241 and first-fit assigned 228. H03 received six fewer portions and H05 four fewer than first-fit. Adding only a can opener to H01 caused the old heuristic to assign 239, including 11 to H01 instead of 10. The original 241-portion allocation still passed validation with the tool. Monday receipt alone yielded 249 in a fresh greedy run, and adding the opener after that receipt yielded 253. The teaching and neutral cases reproduced 2 versus 1 and 2 versus 2 respectively. The [root-cause trace](root-cause-1.2.md) identifies the first different decision and downstream losses.

## Current selection

The [eight-scenario matrix](scenario-matrix-1.2.md) records the raw heuristic, independent reference, incumbent validity, winner, and effect on every household. Its [JSON](scenario-results-1.2.json) includes the context, timings, scores, slot changes and validator results. Run `npm run matrix` to reproduce it.

- Fresh week, with no incumbent. NoKitchen selected 241/378 and first-fit assigned 228/378. The 13-portion difference is 5.70% relative to the reference and 3.44 percentage points of demand. The same two households lost portions relative to first-fit.
- Opener only, starting at 241. Retaining the verified allocation and extending it both covered 241. Retention won the final tie-break. H01 stayed at 10/21. No household or assigned meal changed.
- Reviewed and received Monday offer, starting at 241. Extending the known plan covered 255 and preserved every old assignment. H01 gained two portions, H02 two, H03 three, H06 four and H08 three. H04, H05 and H07 stayed level. Adding an opener to this 255-portion draft retained it and all household allocations, including H01's 12/21. Fresh calculations without these incumbents gave 249 and 253 respectively.
- With the couscous lot reduced to zero, the old 241-portion allocation failed validation and the selector chose 222/378. H02 fell from 26 to 16. A microwave without the required container left the seed at 241. The teaching example still gave 2/2 versus 1/2, and the neutral example gave 2/2 for both.
- The initial rice-cooker preview raised H01 from 10 to 12 at the same system total of 241. It was shown as a trade-off with losses elsewhere. The action panel and approval review display the household and individual slot differences. With H01 resized from one to two people, the review showed the same Monday no-heat breakfast changing from one portion to two.

## Tests and timings

The integrated suite passed 45 tests plus TypeScript checking and a production build. Tests cover validation of each candidate, exact recipe and pack accounting, time windows, missing methods and tools, stock reductions, stability and rational ratio comparison. Application checks cover source identity, preview order, manual equivalence under equal context, nonmutating analyses, stale previews, idempotent receipt and approval, reservation replacement, multi-tab state, migration and storage failures.

Chromium 156 ran 21 calls per operation on the loaded dev app. The original release reported medians of 6.7 ms for planning, 9.0 ms for comparison and 29.2 ms for four variants. A fresh 1.1 reproduction here measured 8.2, 9.6 and 30.8 ms. Release 1.2 measured 12.7 ms for a fresh selection, 16.2 ms for a fresh comparison and 108.3 ms for four validated what-if branches using one captured incumbent. These figures exclude rendering and storage. Per-scenario Node timings appear in the matrix.

## Standalone and browser

The delivered NoKitchen-1.2.html has SHA-256 `ba81fb981507ccf5bd3214e99f9f1e3d825ad7133e993b5bc19455b110bf2803`. Each complete workflow ran in a separate pristine Chromium 156 context. Before its first navigation, the test disabled the cache and service workers and denied all network requests except top-level navigation to the exact loopback HTML. The static server served these bytes alone. Two initial loads and two deliberate reloads produced four HTML GETs in total. There were zero attempts to fetch assets, fonts, scripts, APIs or WebSockets and zero browser or console errors.

The walkthroughs exercised planning, comparison, shortages and exact packing, what-if actions, edit or proposal, review, receipt, approval and replacement, both portals, and tour navigation. The tour's Back, Restart, Exit, Finish and reload operations left ordinary approval and reservations intact. The standalone verifier first tried a completely offline file URL. Managed Chromium blocked that navigation with ERR_BLOCKED_BY_ADMINISTRATOR. Local HTTP is the verified opening method. Safari and Playwright WebKit were unavailable on this Linux host.

## Storage and migration

Independent Chromium sessions exercised denied reads, denied writes and a parseable save with a malformed candidate list. In each case an H01 household edit changed demand from 378 to 399, calculation and approval worked in memory and reload restored the seed. Session-only feedback remained visible at 320 px. Denied writes created no saved record. The damaged bytes retained the same SHA-256 across editing and approval. Unit tests also exercise invalid JSON and reset with malformed evidence.

A genuine 1.1 save was created using the archived HTML, the Monday receipt, an H01 opener and an approved 253-portion plan. A 1.2 load on the same origin showed the plan as out of date and kept its reservations. All eight households, 35 lots, offer states and all 32 reserved-lot balances matched. Recalculation retained the valid 253-portion allocation. Ordinary approval replaced the owner, and reload restored the replacement. The original v2 record remained byte-for-byte unchanged.

## Source distribution

The source build requires dependency installation. The standalone runtime needs only the HTML and a local static server. The archive includes the source, tests, scripts, README, release documentation, font licenses and the verified standalone. Run `python3 scripts/package-source.py output.zip` after building to reproduce the archive from the source tree.

A clean extraction passed archive integrity and relative-document-link checks. The archive contained 89 files and excluded installed dependencies, caches, private-key files and environment files. From that empty installation, `npm ci` installed the locked dependencies, type checking and all 45 tests passed, and the production build produced a standalone byte-identical to the one in the archive and the separate download. Both dev and preview servers returned HTTP 200. The Chromium bank, household and guided walkthroughs passed from the extracted source.

[Run instructions](../README.md) · [Changes in 1.2](changelog-1.2.md)
