# NoKitchen 1.3.1 results

The expanded synthetic week beginning 23 November 2026 has 134 filled household meal slots and 297 of 378 requested person-portions. The 50 ingredients, 40 recipes, 44 methods and 21 families are those of the 1.3 release. The measurements below come from running the application commands. [Reproducible results](decision-results-1.3.1.json)

## Receipt decisions from the same plan

Each row starts with the same 134 assignments. Twelve sealed 200 g pouches were reviewed. The eight-pouch branch records an explicitly confirmed difference at receipt. The draft before receipt and its approved copy have identical allocations in this experiment.

| Actually received | Valid alternative | Portions | Filled slots | Newly filled | Become unfilled | Changed existing | Unchanged existing | H02 Friday chickpeas |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 12 pouches | Keep existing meals | 309/378 | 139 | 5 | 0 | 0 | 134 | 0 → 1,200 g |
| 12 pouches | Reallocate for coverage | 310/378 | 140 | 8 | 2 | 28 | 104 | 0 → 800 g |
| 8 pouches | Both produce identical commitments | 305/378 | 137 | 3 | 0 | 0 | 134 | 0 → 400 g |

The approved-plan recommendation keeps every validated slot, batch, method and lot commitment and extends it from the residual stock. The unapproved-draft recommendation uses the ordinary coverage-first selector. Each alternative passed the full common validator. Hypothetical inspection, receipt, recalculation and selecting a draft leave the approved reservation owner intact. The bank uses **Approve plan** to replace it. The optimization is bounded.

| Household | Portion change, keep 12 | Reallocate 12 | Either, actual 8 |
| --- | ---: | ---: | ---: |
| H01 | 0 | +1 | 0 |
| H02 | +6 | +4 | +2 |
| H03 | 0 | +3 | 0 |
| H04 | 0 | 0 | 0 |
| H05 | 0 | 0 | 0 |
| H06 | 0 | 0 | 0 |
| H07 | 0 | +2 | 0 |
| H08 | +6 | +3 | +6 |

Compared with the approval, the 310-portion draft would leave **H03 Friday dinner, Potato with beans (3 portions)**, and **H08 Saturday breakfast, Banana oatmeal (3 portions)** unfilled. Both households gain three portions over the week. Of the 28 other changed assignments, 27 change recipe or method and one changes only the ingredient lot.

In H02’s Friday collection box, each changed chickpea meal is a two-person **Chickpea couscous bowl** using two sealed 200 g pouches. With twelve received, the preserving plan adds Friday dinner, Saturday lunch and Saturday dinner. The redistributing plan adds Friday dinner and Saturday lunch. With eight received, both add only Friday dinner. For this ingredient the baseline box is empty, every positive line traces to the recorded incoming lot and there are no negative lines. Other box ingredients can gain and lose stock from different lots. The box detail itemizes both signs. [Meal quantities, packages and lot provenance](decision-results-1.3.1.json)

## Improve variety on the initial week

All 134 filled slots kept their original portion counts, covering 297/378. Fifteen assigned meals changed recipe or method. Breakfast is measured separately from lunch and dinner. Adjacency follows the ordered sequence of filled meals in each category, skipping empty requests.

| Household | Category | Slots / portions | Distinct recipes | Distinct families | Maximum uses of one family | Adjacent repeats |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | Breakfast | 6 / 6 | 4 → 4 | 4 → 4 | 3 → 3 | 0 → 0 |
| H01 | Main meals | 9 / 9 | 6 → 7 | 6 → 6 | 2 → 2 | 0 → 0 |
| H02 | Breakfast | 7 / 14 | 4 → 4 | 4 → 4 | 4 → 4 | 2 → 1 |
| H02 | Main meals | 9 / 18 | 6 → 6 | 4 → 4 | 3 → 3 | 1 → 0 |
| H07 | Breakfast | 7 / 14 | 4 → 4 | 4 → 4 | 3 → 3 | 1 → 1 |
| H07 | Main meals | 13 / 26 | 7 → 7 | 5 → 5 | 8 → 8 | 5 → 2 |

- **H01 covers 15/21 portions.** During fresh planning, a single refinement had already reduced adjacent breakfast repeats from one to zero while keeping exactly three open sandwiches, one cereal bowl, one fruit salad and one muesli. The later **Improve variety** action keeps those breakfasts. It replaces one of two *Tuna cucumber wraps* with a *Crunchy cabbage and hummus wrap*. Main meals still include two wraps, two pulse salads, two rice bowls, one open sandwich, one cracker plate and one stuffed vegetable dish.
- **H02 covers 32/42 and H07 covers 40/42 portions.** Both improve spacing with identical counts of every recipe and family. H02’s combined adjacent repeats fall from three to one and H07’s from six to three. H07 still receives eight toasties.
- Across the week adjacent repeats fall from 17 to 9 and same-recipe pairs from 67 to 66. No category gains a family. H04’s main meals become more balanced across the same seven families as soups fall from three to two and stews rise from one to two. This lowers system family pairs from 102 to 101. H05 and H08 retain their measured scores. No household’s documented variety score worsens.

The weekly UI shows all eight households’ metrics, frequencies and meal names. The results file records every household and both baseline approval states. Run `npm run evidence:decision` from the source directory to regenerate it.
