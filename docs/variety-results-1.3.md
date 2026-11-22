# NoKitchen 1.3 coverage and variety

## Three separate calculations

The frozen version 1.2 run used its archived 30-ingredient, 16-recipe catalog, inventory and planning code. It reproduced 241 / 378 portions for the selected seed and 228 / 378 for first fit. Opener-only raw and selected results were 239 and 241. The Monday fixture raised selected allocation to 255 from a raw 249, adding 7 household meal slots. The opener after receipt kept 255. Removing couscous stock gave 222.

The expanded synthetic week contains 50 ingredients, 40 recipes, 44 methods, 21 families and 54 lots. The legacy greedy candidate covered 297 portions and the family-aware candidate covered 293. The selected fresh-refined candidate covered 297 of 378. These expanded totals include the additional inventory and recipes.

For a fresh plan, one bounded refinement of the leading validated candidate can compete. Its source was fresh-legacy. At identical filled slots and portion counts, the system score changed from 102 / 18 / 67 to 102 / 17 / 67. Restricted household H01 improved from 6 / 1 / 6 to 6 / 0 / 6. This initial refinement accepts at most one single or paired move. Ordinary recalculation with an incumbent prioritizes the stability of previously assigned meals.

The fixed-slot experiment kept that same 1.3 snapshot, households, requests, equipment, assigned slots and portion counts. The system score changed from 102 / 17 / 67 to 101 / 9 / 66. The pass changed 15 recipes or methods. It removed zero filled meals.

| Household | Portions held fixed | Breakfast families | Main families | Score before → after |
|---|---:|---:|---:|---|
| H01 | 15 | 4 → 4 | 6 → 6 | 6 / 0 / 6 → 6 / 0 / 5 |
| H02 | 32 | 4 → 4 | 4 → 4 | 13 / 3 / 9 → 13 / 1 / 9 |
| H03 | 42 | 4 → 4 | 6 → 6 | 5 / 2 / 4 → 5 / 0 / 4 |
| H04 | 21 | 4 → 4 | 7 → 7 | 16 / 2 / 11 → 15 / 2 / 11 |
| H05 | 72 | 4 → 4 | 6 → 6 | 15 / 2 / 8 → 15 / 2 / 8 |
| H06 | 30 | 4 → 4 | 5 → 5 | 7 / 1 / 4 → 7 / 0 / 4 |
| H07 | 40 | 4 → 4 | 5 → 5 | 33 / 6 / 20 → 33 / 3 / 20 |
| H08 | 45 | 3 → 3 | 6 → 6 | 7 / 1 / 5 → 7 / 1 / 5 |

## Metric and search

The three integer scores in each row are family collisions, adjacent same-family meals and exact-recipe collisions. Lower wins lexicographically. Each family or recipe used n times contributes n × (n − 1) / 2 pairs. Breakfast forms one sequence. Lunch and dinner together form a second chronological sequence. Unfilled slots are omitted, so a gap never resets adjacency. We sum over both sequences of each household, then sum over households. These software measures describe repetition.

The family-aware fresh candidate ranks feasible recipes by the marginal increase in that score before expiry, scarcity and recipe ID. Ordinary selection still ranks total portions, minimum household coverage and incumbent stability first. Explicit Improve variety holds the original filled slots and portion counts fixed. It tests single slots and same-household pairs using temporary ledgers, a shortlist of three alternative recipes per side plus a direct swap, two passes and at most 240 atomic feasibility trials shared across households. Within the tested moves, lower household score precedes fewer changed assignments. Every accepted move and the resulting draft pass the full plan validator. A bounded search can miss other feasible improvements.

## Reviewed chickpea delivery

The pasted example offered twelve sealed pouches with 200 g edible contents each. The operator confirmed ambient storage before opening, refrigeration after opening, whole-package issue, opener-free access and the Monday–Sunday model window. Review and preview changed no physical stock. Receipt added 2400 g. Recalculation matched the preview and kept the prior approval active.

Coverage changed from 297 to 310 of 378 portions. Uncovered portions changed from 81 to 68. 8 slots were newly filled, 2 were lost and 27 other assignments changed recipes or methods. The JSON records each household delta and both exact collection boxes for the example meal.

Example meal: H01, Sunday breakfast, Peanut butter and banana bread (1 model portion). After receipt, explicit variety improvement kept 310 portions and changed the system score from 110 / 20 / 75 to 108 / 11 / 75.

## Controlled checks

| Test household and supplies | Portions held fixed | Score before → after |
|---|---:|---|
| restricted-pair | 4 | 2 / 2 / 2 → 2 / 0 / 2 |
| equipped-single | 12 | 6 / 3 / 6 → 2 / 0 / 2 |
| no-alternative | 4 | 6 / 3 / 6 → 6 / 3 / 6 |

The restricted-pair control uses the unmodified H01 kitchen and explicitly supplied opener-free lentils. Two salads followed by two wraps exhaust both ingredient sets, so only a paired exchange can improve their order. The equipped control uses H03’s existing microwave and fridge, with enough alternate breakfast ingredients for single replacements. The last control supplies one feasible recipe and correctly reports no improvement.

Run `node scripts/variety-results.mjs` to regenerate this report and its [machine-readable evidence](variety-results-1.3.json).
