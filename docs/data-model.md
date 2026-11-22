# Data model and planning rules

## One model week

Monday is day 0 and Sunday is day 6. Monday collection supplies days 0–3, Friday collection days 4–6. Breakfast, lunch and dinner each request one model portion per person. Changing the number of people changes subsequent demand. The household starts with zero ingredients. Changing the selected day only navigates the schedule.

## Catalog and stock

Ingredient IDs identify specific synthetic product variants. Each has one integer base unit (g, ml or each), food group, storage, dietary tags, provenance and a declared allergen list. A declared empty list describes that fixture label only. Unknown declarations or review failures block automatic allocation. Recipe allergens are derived from their required ingredients. Optional salt, herbs and cinnamon are omitted from the allocation and the box.

Every recipe contains its required per-portion amounts and one or more authored methods. Each method has an explicit list of appliances, tools and utilities, an instruction for water, a demo preparation time and original steps. All requirements of one method must hold together. Appliance IDs are catalog references, so additional devices can be introduced with authored methods. The appliance does not supply a pot, a container or a utility by implication.

A stock lot supplies one ingredient. Its available-from and usable-through days are inclusive. Storage covers the time between pickup and the meal. A fridge and freezer satisfy different requirements. Household pantry storage for ambient products and suitable bank storage for all received lots are assumed. Sealed ambient items that need cold storage after opening are opened and used in full at preparation. For repacked goods, the post-opening requirement applies during household storage.

All canned-solid weights are edible drained content. A sealed lot has one stock pool, expressed as package count times usable pack size. Whole packages can be combined across eligible lots to meet the batch exactly. A fixture marked repackable may be measured in integer base units. Opening tools belong to individual lots. Neither unused portions of opened packs nor cooked leftovers carry over to later meals.

## Original stock design

The fixed quantities are listed in `src/data/stock.ts`. The fixture has measured grains, produce and oil, and recipe-sized sealed packs such as 200 g of beans, 150 g of yogurt, and 200 ml of milk. Stock levels permit several competing recipes but run short during the week. Fresh bread has separate early and Friday lots. Monday beans require an opener and the Friday bean lot uses a pull tab. Refrigerated yogurt expires partway through the week. Frozen vegetables exercise the difference between a fridge and freezer.

The Monday offer was sized by running the actual heuristic on several small top-ups. Fourteen tortillas, fourteen 200 g packs of beans and fourteen 100 g packs of corn improved the original fresh heuristic by eight allocated portions. Replanning from the 241-portion seed in 1.2 extends it by fourteen. Joint coverage depends on how complete batches for competing households fit the stock. A separate fixture offers nine soup cartons and nine packets of crackers available on Friday.

## Fresh legacy heuristic

1. Build a working ledger from received stock and process days and meal types in a fixed order.
2. In each meal slot, rank households by their share of weekly demand covered so far, then by the number of feasible recipes at the start of that slot. Rotate the stable household-ID order by day and meal for the remaining ties.
3. Reassess recipe candidates against the remaining ledger for each household. Check product declarations, exclusions, methods, storage, pickup, expiry, opener and exact package availability. Reserve only after the entire batch fits.
4. Prefer recipes the household has received fewer times. Next prefer the earliest usable-through date among the lots that would be used, then the smaller sum of batch-to-eligible-stock fractions, then stable IDs. The fractions compare scarcity without adding grams and milliliters. Lot selection tries the earliest expiry with stable lot IDs and checks that the rest of the batch can still be packed.
5. Record an unfilled slot when no recipe fits. The displayed candidate provides specific reasons and gaps in that ingredient’s own units. Other recipes can compete for the same ingredients, so these gaps do not form a minimal shopping list.

Standalone capacity examines one recipe against the received pool for a chosen day and household. The full-batch compatibility result separately checks whether that household's requested size fits. Weekly coverage comes from the joint plan’s lot reservations. The heuristic can leave usable ingredients behind. Device capacity, parallel cooking time and nutritional adequacy are outside the model.

## Plan and reservation lifecycle

The revision identifies the inputs for a calculation. A generated draft contains one assignment or explanation per slot, exact lot-level reservations as a preview, coverage and packing lists. Each list groups claims by household, collection and lot, with references back to the meals that need them.

Approval checks the plan against the same inputs and replaces the active reservation owner atomically. Received stock stays physical stock. Edits and new receipts advance the input revision, leaving any earlier approved reservations in place and marking old results out of date. Release clears the owner, preserves physical quantities, and invalidates the prior draft. Replanning the week uses the full received pool for replacement. There is no collection, consumption or dispatch ledger.

## Selection and decision support

**Meal coverage first** compares fully validated candidates by total portions, minimum positive-demand household coverage (integer cross-multiplication), and fewer changes to assigned incumbent slots. It then compares family collisions, adjacent same-family assignments and exact-recipe collisions, followed by stable candidate ID. Breakfast is one chronological sequence per household. Lunch and dinner share another. Empty slots are skipped. Each family or recipe used n times contributes n(n−1)/2 pairs.

Fresh planning compares the legacy and family-aware candidates and permits a single successful local refinement of the leading plan. In ordinary replanning, a valid incumbent and a preserve-and-extend candidate join the two fresh heuristics. For an explicit **Improve variety** action, fixed slots and their individual portion counts are hard constraints. Search tries single meals and pairs within one household on temporary ledgers. Successful moves must improve the household’s score and pass exact package and shared-stock validation. At the end every household must keep or improve its own score. Full details and controls are in the [variety report](variety-results-1.3.md).

The complete decision identity covers catalog/family content, model version, received lots, households and time windows, operation, policy and parameters, strategy, metric, search budget, plus explicit incumbent allocation and packing evidence. Reference comparisons run first-fit from identical inputs with no incumbent or historical reuse. The eight original 1.2 experiments use the code and data under `tests/frozen12`.

## Donor offers and storage

The visible model calendar starts 2026-11-23. A manual message and its source spans, edits, date types and unresolved values stay on the offer. Review materializes proposed lots. A hypothetical projection uses the exact proposed lots on a temporary ledger. Its single comparison baseline is the active approved plan when present, otherwise the displayed draft. Actual receipt validates the actual row payload, differences and shared lot rules. It adds all included lots once under a durable offer ID and captures the pre-delivery baseline. Recalculation uses actual quantities and retains the prior approval until replacement. Under `approved-meals-first-v1`, a valid approval defaults to the revalidated retaining or preserve-and-extend candidate. An unapproved draft defaults to ordinary coverage-first selection. Invalid preserving candidates expose their validation reason. The result identity includes the captured baseline digest and status, recommendation rule, candidate kind, stock snapshot, planner and policy context. Preview and actual receipt have separate analysis keys. Choosing an alternative changes the draft only. A compact comparison keeps the immediately applicable receipt’s before/after plans and exact box changes available across reload.

Schema 4 stores mutable inputs and plan records keyed by ID. Migration reads earlier storage keys, copies physical lots, recorded receipts, household edits and approved reservations, and marks derived plans stale. Expanded seed stock is loaded only for a fresh installation or an explicit reset. Denied reads or writes and malformed saves fall back to an in-memory session with a visible warning. The old bytes remain available. The tour uses separate in-memory checkpoints.

## Private operator import in 1.4

The private staging database identifies mail by provider origin, inbox and provider message ID. After an operator claims a readable message, its inbox ID, message ID and immutable source text enter the same local offer document used for manual review. An explicit package count may be known even when the missing size or edible basis prevents receipt. Agentboxd lots carry the source message and ordinary offer IDs. Approval and allocation continue to use the existing local domain commands. [Private operator setup](agentboxd-setup.md)

## Household publication in 1.4.1

The bank may inspect or compare a draft while another allocation owns the approved reservations. Household meal schedules, preparation instructions and collection boxes share one publication decision. A household without an approval can edit its settings while waiting. When the current rules, restrictions and lots still admit the full approved allocation, households continue to see it across draft changes and safe stock additions. A failed content check blocks meal and box instructions and requests bank review. Only explicit approval publishes a replacement and moves its reservations. [Decision evidence](decision-results-1.4.1.json)
