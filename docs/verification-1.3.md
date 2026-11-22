# Release verification · NoKitchen 1.3

## Starting point

The working 1.2 source, root-cause report, scenario matrix, verification report, HTML and source ZIP were inspected before editing. All 45 original tests passed, including review and receipt idempotence, approval and reservation replacement, stale input protection, preview/manual equivalence, exact packing and storage failure. The frozen 1.2 inputs and code reproduce the 241/378 seed versus 228 reference, 239 raw versus 241 selected after an opener, 249 raw versus 255 selected after Monday receipt, 255 after the subsequent opener, and 222 after removal of the couscous lot. The donation extension added seven whole-household meals and 14 portions. [Frozen matrix](scenario-matrix-1.2.md)

## Expanded catalog and planning

There are 50 ingredients, 40 recipes (10 breakfasts and 30 mains), 44 methods and 21 families. The expanded fixture contains 54 physical lots, including 22 new synthetic lots. Every added ingredient is required by at least one dish. All 44 methods have a whole-household batch witness with exact stock and tool requirements. For Monday and Friday, opening stock independently supports five breakfast and six main-meal families for H01, and six and eight for H02. Actual weekly allocation is measured separately. [Catalog and compatibility audit](catalog-audit-1.3.md)

The fresh legacy candidate reached 297 portions, and the raw family-aware candidate reached 293. Refining the leading candidate kept 297 and eliminated H01’s adjacent same-family repeat. A separate **Improve variety** on that draft retained all 134 filled slots and all 297 person-portions. It changed 15 assignments. System family-pair collisions fell from 102 to 101, adjacent same-family meals from 17 to 9, and exact-recipe collisions from 67 to 66. H02’s adjacent repeats fell from three to one. H05 and H08 retained their scores. Tests also exercise an H01 pair exchange, an equipped household with interchangeable meals and a case that has no alternative within the search. [Household results and search definition](variety-results-1.3.md)

## Pasted offer to collection boxes

The model week starts 2026-11-23. An offered twelve sealed pouches of 200 g edible chickpeas projected 310 portions from an actual 297-portion baseline. The operator confirmed storage and the Monday–Sunday model window. Extraction, saving, review and impact preview left physical stock unchanged.

- Receiving all 2,400 g and recalculating matched the projection at 310/378. Eight household slots were newly filled, two formerly filled slots were lost and 27 other assignments changed. Every household kept or increased its total portions. H02’s Friday box gained 800 g of chickpeas, H07’s Monday box 400 g and H08’s Friday box 1,200 g.
- A separate branch received eight pouches, 1,600 g, after explicit difference confirmation. The actual draft covered 305/378, with three newly filled slots and zero lost or changed earlier assignments. H02’s Friday box gained two pouches and H08’s Friday box six. Repeating receipt after reload left stock unchanged.
- On the eight-pouch branch, an independent check recalculated ingredient quantity × household size, whole-package claims, opening tools, cold storage, collection dates and lot totals. It reconciled all 16 boxes in the seed, after receipt and after the subsequent variety pass. That pass kept all 137 filled slots and 305 portions. Approval changed the reservation owner only on the ordinary approval command.

[Quantities, household changes and boxes for both deliveries](donor-impact-1.3.json) · [Independent ledger evidence](verification-evidence-1.3.json)

## Runtime, migration and delivery

TypeScript checking, the production build and 63 tests in 12 suites passed. The Chromium workflows covered an edited actual delivery, quantity differences, review, approval, preview, changed meals and boxes, both portals and the seven-step guided demo. They also exercised Back, Restart, Exit, Finish, reload, narrow layouts and failed storage. A separate browser run parsed a previously unseen Czech UHT milk offer and excluded an unknown product with a reason.

A genuine 1.2 browser session received the Monday donation, added the H01 opener and approved 255 portions. Release 1.3 kept all 35 lots, eight household profiles, receipts, exact reservations across 32 lots and all boxes. Migration and recalculation added no expanded stock. Canceling reset kept 35 lots. Explicit reset then loaded 54 including the 22 expanded lots. The original v3 storage record kept the same SHA-256. Denied reads, denied writes and malformed data left an in-memory session with visible feedback.

The delivered HTML has SHA-256 `5d5ca7d33db2076df70e41f0e2540d9e2295e94f567e6c005098ab91bdf64c1e`. The cold test used Chromium 156.0.8078.79 with the cache disabled and service workers blocked before first navigation. Only the exact loopback HTML document was permitted. Five fresh contexts completed the ordinary, tour and three storage-failure cases. The server received seven document GETs including two deliberate reloads. There were zero subresource or WebSocket attempts and zero browser errors. Chromium policy blocked direct file opening. Local HTTP is the supported, tested method.

## Clean source archive

The source ZIP contains 153 files, including the standalone and the frozen regression fixture. From a new extraction, npm installed the locked dependencies using the available local cache. Type checking, all 63 tests, production build, the three Chromium workflows, and dev and preview startup passed. The variety evidence regenerated byte for byte. The rebuilt HTML, the HTML at the archive root and the separate 594,565-byte delivery had the same SHA-256 shown above. All 45 relative Markdown links resolved. The package excluded dependency directories, transient caches and credential files.

## Limits

The no-appliance and kettle compatibility counts describe specific synthetic labels, lots and portions. A bounded search can leave repetitions or find no improvement. Intake supports a limited English/Czech grammar, requires manual resolution of ambiguous products and quantities, and leaves model dates and product safety decisions to the operator. Agentboxd/Homingbox is disconnected. The release uses no real email, AI or nutrition certification. Safari was unavailable on this Linux host.

[Build, launch and packaging commands](../README.md) · [1.3 changelog](changelog-1.3.md)
