# Release verification

## Reproduced baseline and release calculations

The 1.0 source and standalone export were run before editing. All 22 existing tests, TypeScript checking, the build and the operating walkthrough passed. The baseline inventory check reconciled all 16 boxes and all 30 ingredient summaries against recipe requirements and reservation records. The baseline HTML could recalculate and approve after disconnection.

| Full-week scenario | 1.0 allocated | 1.1 allocated | Requested |
| --- | ---: | ---: | ---: |
| Initial seed | 241 | 241 | 378 |
| Monday tortilla-kit offer reviewed and received, then recalculated | 249 | 249 | 378 |
| Same Monday receipt plus an opener for H01 | 253 | 253 | 378 |

The audit corrected instructions and described package access while preserving fixture amounts and constraints. The seed still has 59 unfilled household meal slots and 137 uncovered model portions.

## Comparison and interventions

| Identical input pair | Simple reference | NoKitchen |
| --- | ---: | ---: |
| Full week | 228 / 378 | 241 / 378 |
| Two-household Monday teaching lunch | 1 / 2 | 2 / 2 |
| Neutral Monday teaching lunch | 2 / 2 | 2 / 2 |

On the full week, changes from reference to NoKitchen for H01 through H08 were +2, +2, −6, +5, −4, +2, +6 and +6 portions. These sum to +13. The lowest household coverage changed from 38.1% to 47.6%. Both strategies supplied at least one portion to every household in this seed.

On the original seed, H01’s can-opener preview changed its allocation from 10 to 11 and the system from 241 to 239. H04 lost one and H06 lost two. Independently previewing a rice cooker raised H01 to 12 with total coverage unchanged. The sandwich maker and the two-tortilla proposal both gave zero target and zero system gain. Tests also covered an appliance added without its required tools and a household making no requests.

## Timing

Chromium 156 ran 21 calls per calculation after loading the Vite application. The measured values below are medians for this machine and fixture, excluding rendering, browser storage and network access.

| Calculation | Median |
| --- | ---: |
| Original 1.0 planner, reproduced this session | 8.8 ms |
| Released 1.1 planner | 6.7 ms |
| Both planners plus comparison summaries | 9.0 ms |
| Baseline plus four independent H01 interventions and their deltas | 29.2 ms |

The earlier 1.0 report measured 6.4 ms for its seed. Repeated timings vary. Run `npm run measure` against a running Vite dev server to repeat the current measurements.

## Checks exercised

- All 35 automated tests across seven suites passed. They cover catalog integrity, every authored method, exact package access, stock conservation, both strategies, decision-time shortages, source identity, action independence, receipts, migration and tour checkpoints.
- TypeScript checking and the production build passed.
- Both browser walkthroughs passed on the development server and the production single-document export. They cover the ordinary planning lifecycle and the six guided steps, including actual proposal review/receipt and replacement approvals.
- An independent Chromium walkthrough checked the equipment path, the donation path, unfilled-slot arithmetic, per-household comparison deltas, H01’s pull-tab packages and the approved collection boxes. Restoring a previous step, restarting, finishing, exiting and reloading preserved the ordinary scenario’s saved bytes.
- The independent single-document check disconnected the browser after fetching the HTML. It reconnected only to reload the same document, then disconnected again. Those two HTML requests were the only HTTP requests. Both walkthroughs completed without runtime or console errors.
- The 1.1 application opened an actual saved 1.0 scenario containing a received Monday offer and an approved 249-portion plan. It retained the lots, receipt and reservations, marked the plan stale, and accepted a recalculated replacement. Reload restored the replacement and the original v1 storage entry remained byte-identical.
- The desktop views, comparison, decision detail and the 390 px household layout were visually inspected. The new bank views and diagnostic dialog were also checked at 320 px. No whole-page horizontal overflow was observed.

Run the browser checks with the local dev server active in another terminal:

```sh
npx playwright install chromium
npm run test:e2e
npm run measure
```

For the self-contained export, start `npm run preview` after the build and run the same browser walkthrough using NOKITCHEN_URL set to the served NoKitchen-1.1.html. The tests accept CHROMIUM_PATH or use the system Chromium when available.

The browser checks used Chromium over loopback HTTP. Native Safari and direct file opening were not verified in this Linux workspace. The synthetic food and appliance assumptions still need real-world validation.
