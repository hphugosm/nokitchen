# The H01 can-opener regression

## Reproduction on version 1.1

The archived 1.1 planner assigned 241 of 378 requested portions in the untouched week. Giving H01 a can opener and running the same greedy algorithm from scratch assigned 239. The archived source ZIP used for the trace had SHA-256 `638ae5a34b70380ed9cb3ab0ecb0529497f2fcd12513736f6ae74b686b46aa1f`.

We compared the input records and confirmed the same 32 lots, lot IDs, quantities, packaging, available and usable-through days. Recipes, methods, household sizes, requests, restrictions, storage, collection days and all other household records matched. Both scenarios had zero approved reservations and zero offers. The household command changed H01's tools and advanced the input revision from 1 to 2. There was no donation in this experiment.

We ran the 1.1 validator three times. The original plan on the original inputs, the fresh 239-portion plan on the edited inputs, and the original 241-portion plan on the edited inputs all passed. For the third check we changed only the source revision and fingerprint in a diagnostic copy. Its allocations, methods, family sizes, exact sealed packages, reservations, packing lists, quantities and dates stayed intact. The feasible solution with 241 portions still existed.

| Household | Before | Fresh with opener | Change |
|---|---:|---:|---:|
| H01 | 10 | 11 | +1 |
| H02 | 26 | 26 | 0 |
| H03 | 36 | 36 | 0 |
| H04 | 18 | 17 | −1 |
| H05 | 52 | 52 | 0 |
| H06 | 22 | 20 | −2 |
| H07 | 38 | 38 | 0 |
| H08 | 39 | 39 | 0 |
| All | 241 | 239 | −2 |

## First divergence and downstream meals

We recorded household order, feasible recipe IDs, reservations and remaining lot balances during the archived planner's original decision loop. Monday breakfast was identical.

1. At Monday lunch H01 initially had one choice, R08 tuna cucumber wraps. The opener made R06 lentil salad and R07 bean and corn tortilla available. H01 now tied H06 at three choices and the rotating order put H06 first. The rest of the lunch order was unchanged.
2. H06 took R06 in both runs. H01 changed from R08 to R06 because R06 used earlier-expiring bread. Its new batch took 200 g of lentils from LOT-013, 100 g cucumber, 100 g tomato and 60 g bread. Its former batch had used two tortillas, 100 g tuna and 100 g cucumber. The recipe rank also considers previous use, then scarcity after expiry.
3. H01 switched to R07 at Monday and Wednesday dinner. Each batch used 200 g of opener-required beans from LOT-011. At H06's Wednesday dinner decision, LOT-011 had 200 g left in the edited run versus 400 g in the original. H06's two-person R11 needed 400 g. H06 lost that entire meal.
4. H01 lost Thursday breakfast when only 40 g of bread remained, below its 80 g R02 requirement. It gained Thursday lunch and Friday breakfast, for a net gain of one portion. H04's meal mix also changed, including R10 pasta on Thursday lunch, Friday dinner and Saturday dinner. At Sunday lunch H04 had zero passata versus 200 g in the original ledger. Its former R10 batch was no longer available and no other batch fit.

These are consequences of changed greedy ordering, recipe choices, and finite shared lots. The can opener expanded local eligibility. The greedy rerun discarded a feasible weekly allocation and found a lower-scoring one.

## The 1.2 selection rule

**Meal coverage first** compares fully validated candidates on the same received-stock snapshot. A cold start uses the original deterministic greedy planner. When supplied, the incumbent is checked again against the edited inputs, including slot requests, methods, restrictions, exact lot reservations, packing and shared-stock conservation. Its unfilled requests and plan totals are rederived. An invalid incumbent is excluded together with its extension.

A valid incumbent also produces an extension candidate. The planner reserves every fixed assignment once, including its exact lots, and initializes coverage and recipe-use counts from those assignments. It visits only unfilled requests and allocates further whole batches from the remaining ledger.

Selection maximizes total allocated portions, then the lowest positive-demand household coverage using exact fractions. Next it minimizes previously assigned slots lost or changed in recipe, method or family portion count. Finally it minimizes repeated household recipes. Each use of a recipe for the same household after its first weekly occurrence counts as one repeat. Exact ties use the stable IDs in the order retain, extend, fresh. The simple reference planner remains an independent cold-start comparison.

In the opener-only reproduction the candidates have 239, 241 and 241 portions for fresh, retain and extend. The selected plan keeps all 241 original portions and gives H01 the same 10. This guarantees total coverage at least as high as a supplied incumbent **when it passes revalidation**. A different feasible trade-off can still move meals between households. Candidate totals and the changes affecting individual households remain visible.
