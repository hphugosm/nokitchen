# NoKitchen 1.3.1 verification

## Starting point

The existing project and the archived 1.3 source, donor impact, variety and verification reports were available. An isolated extraction of the original archive passed all 63 tests. Its donor and variety scripts reproduced the 297/378 opening week, the 310/305 receipt results, the two removed meals, and the 17-to-9 reduction in adjacent repetitions. The 1.2 migration test preserved the 35 physical lots and approved reservations. The catalog, parser and ordinary planner ranking are unchanged in this release. [Original evidence](verification-1.3.md)

## Decisions and arithmetic

TypeScript checking, the production build and all 75 tests across 14 suites passed. The release tests exercise an approved baseline, a coexisting newer draft, an unapproved baseline, an invalid incumbent, distinct recommendation keys and stale selections. Each alternative passes the common model validator. Coverage, lots and package claims are derived from allocations. Separate checks reconcile signed meal-level contributions with every ingredient and lot on all 16 boxes for both real delivery amounts and both alternatives. A lot-only change is distinguished from a removed meal. Across all households the variety tests check the separate category metrics, spacing, recipe variants, exact fixed slots and portions.

The actual receipt is recorded once. Switching the selected draft preserves the approved plan and reservations. The ordinary approval action replaces those reservations once. Tests cover reload, two receipts before recalculation, pending and completed 1.3 saves, migrated 1.2 inputs, and failed or malformed storage. [Measured results](results-1.3.1.md) · [Machine-readable output](decision-results-1.3.1.json)

## Browser and delivery

The normal Chromium workflow included the reference comparison, donor review, twelve offered versus eight delivered, household views and boxes, the isolated seven-step tour, narrow view, and storage failures. A second workflow started with an approval plus a newer variety draft, inspected the hypothetical 310-portion calculation and exact lost slots, received twelve pouches and switched the replacement draft in both directions. It checked persistence across reload and committed the selected plan through ordinary approval. The 390 px weekly layout and the separate 375 px box-trace check fit within the viewport.

The delivered HTML is 617,323 bytes with SHA-256 `58b961a3a2b6c5d13e020eea7a36cd0df12d60adde661569242c7e3505b4d32a`. Chromium 156.0.8078.79 completed the cold-start workflows using a loopback HTTP server. Cache was disabled, service workers blocked and request routing installed before first navigation in each clean context. Only the exact HTML document and its explicit reloads were permitted. The external network, remote fonts and other subresources were unavailable. Across all four browser scripts, six fresh contexts made ten document requests including reloads, with zero subresource or WebSocket attempts and zero browser errors. Chromium policy blocked direct file navigation. Safari was unavailable on this Linux host.

## Source archive check

A fresh extraction of the 166-file ZIP passed its integrity and path checks. The archive excludes installed dependencies, transient caches and credential files. All 57 local links in 21 Markdown documents resolved. Using Node.js 24.22.3 and npm 11.19.1, the locked dependencies installed from the available offline npm cache. Type checking and all 75 tests passed. The regenerated decision JSON, rebuilt standalone HTML and separately delivered HTML matched the corresponding packaged files byte for byte.

## Reproduce

Use the source commands in the README to run tests, generate the evidence and build the HTML. Use `npm run test:e2e` with the local development server and `npm run test:standalone` on the built file. The exported source ZIP includes the standalone, locked dependencies manifest, application source, fixtures, tests and documentation. Installing source dependencies needs a populated npm cache or network. The standalone runtime only needs the bundled HTML and a local HTTP server. [README](../README.md)
