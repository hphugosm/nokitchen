# NoKitchen 1.4 verification

## Test scope

The archived 1.3.1 baseline passed 75 tests in 14 suites. Release 1.4 passed all 83 tests in 16 suites and both builds passed TypeScript checking. The 1.4 integration uses the existing 50 ingredients, 40 recipes, 44 preparation methods, 21 meal families and eight households. Running the application calculations reproduced 297 of 378 person-portions across 134 filled slots. Improve Variety preserved the filled slots and portions while reducing adjacent same-family repetitions from 17 to 9. [Computed decision results](decision-results-1.4.json)

All operator browser tests used Chromium 156.0.8078.79, the production operator bundle, the actual loopback Node server, its one-time sign-in, its SQLite staging store, the shared donor parser and ordinary browser persistence. The remote Agentboxd service was replaced by a local synthetic HTTP provider following the documented API. No real provider credentials or private inbox were used. Real delivery to an Agentboxd inbox and retrieval with a live scoped key remain unverified. No GitHub Pages deployment was performed. [Provider setup](agentboxd-setup.md) · [Security and deployment boundaries](agentboxd-security.md)

## From an email to H02's Friday dinner

Both browser runs began with an approval for all 134 opening assignments. The synthetic donor offered 12 sealed pouches of ready-to-eat chickpeas, each containing 200 g edible contents. The parser extracted the package count and mass from the original message. An operator confirmed ambient storage before opening, refrigeration after opening and the Monday–Sunday model window. Imports, review and the hypothetical preview preserved the previous approval, reservations and physical stock.

| Actual delivery | Viewport | Added to stock | Keep existing meals | Reallocate for coverage | H02 Friday box on the kept plan |
| --- | --- | ---: | ---: | ---: | ---: |
| 12 pouches | 1390 px | 2,400 g | 309/378, 139 slots | 310/378, 140 slots | 1,200 g, 6 donated pouches |
| 8 pouches | 390 px | 1,600 g | 305/378, 137 slots | Same commitments | 400 g, 2 donated pouches |

The 12-pouch keep option added five slots and preserved every original assignment. The coverage option added eight slots and removed two, for a net gain of six. In the eight-pouch run, the operator recorded a smaller delivery and confirmed the difference. The reviewed offer kept its original 2,400 g figure. The resulting plan added three slots. Each run committed the keep option via **Approve plan**. Changing options before approval preserved the original reservation owner.

**Inspect donated meal** opened H02's newly filled Friday dinner. The two-person *Chickpea couscous bowl* uses 160 g instant couscous, 400 g drained chickpeas, 200 g tomato and 20 ml oil. The kettle heats potable water separately. The method also requires a heatproof bowl, knife, board and spoon. Both runs followed the stable provider message to the actual received lot, then opened the household recipe and Friday packing list. The test independently summed the recipe's required quantities times two and the donated lot's reservations across all meals in that box. At 390 px, the inbox, editor, preview, receipt impact, recipe and packing list fit the viewport.

## Provider errors, deduplication and private content

- Before import, synchronization staged two screened synthetic messages from two provider pages. An instruction-like message remained literal text. Its markup did not create DOM elements, its unknown rows remained pending and stock stayed unchanged. An attachment was listed by metadata.
- A first import deliberately encountered a provider detail error. It created zero new local offers and changed zero inventory. Retrying the same message created one offer, preserving its inbox ID, provider message ID and original text. An additional Chromium test failed browser storage after a successful server claim and verified recovery after reload.
- Unconfigured, denied-credential and provider-outage scenarios displayed their corresponding states. Recovery on the next successful sync preserved the approval. The fixture rejected every provider operation except the documented read calls. Browser requests carried no provider authorization header or key. The copied reply came from the local text template.
- Restarting the backend required re-pairing the same browser. Sync and reopening the receipt preserved the committed inventory and reservations. A second browser ledger with a valid operator session could see that the message was already claimed and could not import it as another donation. An unpaired request carrying the operator header was denied.
- The backend tests exercise provider response handling, pagination, content limits, screening, durable claims and local session/host/origin rules. Separate browser checks cover read/write denial and malformed prior state. [Test source](../tests/agentboxd.test.ts) · [Live browser workflows](../tests/live-flow.mjs) · [Interrupted local write](../tests/private-storage.mjs)

## Delivered files

The public page was served under a project subpath from static files only. A fresh Chromium profile requested the entry HTML, JavaScript and CSS. Opening the food bank, household view, catalog and sample donor parser made zero operator API, provider or WebSocket requests. The standalone cold test starts each browser context with service workers blocked, caching disabled and a request allowlist installed before the first navigation. Chromium's policy on this host denied direct file navigation. A loopback fallback served only the final HTML file. Across six profiles, the four workflows made ten HTML navigations including reloads and zero subresource or WebSocket requests. These workflows covered the guided demo, simulated donations, receipt policy choices, approval, household packing, mobile layout and storage failures.

The public scan covers every delivered file. On this release it found four files and zero source maps. It checks the actual values of any supplied backend configuration, a fixed private-email fixture marker, operator endpoint/header strings and the release file layout. An isolated build with six fresh high-entropy sentinels produced identical bytes. Deliberately placing private values into an HTML file, JavaScript, a map and a binary asset, or adding a private endpoint or database file, made all six negative controls fail the guard. The manual Pages workflow uploads only the checked `dist` directory. [Artifact check](../scripts/check-public.mjs) · [Pages workflow](../.github/workflows/pages.yml)

The standalone HTML is 621,949 bytes with SHA-256 `b071bdfde59dd7159a005384ab6f25bba53315ea2b143b5b8e27087f90743b34`. The source archive contains 190 entries. Its clean extraction installed the locked dependencies from the local npm cache, passed all 83 tests, regenerated identical decision evidence, rebuilt both modes and completed the live-mock browser and storage-recovery workflows. All four rebuilt static files matched the Pages archive byte for byte. The separately delivered HTML matched the copy in both archives. All 73 relative documentation links resolved.

## Reproduce

Use Node.js 24 and Chromium. Run the following commands from the extracted project root.

```sh
npm ci
npm test
npm run build
npm run check:public
npm run build:operator
npm run test:live
npm run test:standalone
npm run evidence:decision
```

`test:live` creates and removes its own temporary store, synthetic provider and paired operator process. The public browser test creates its own static server. `CHROMIUM_PATH` can select an installed Chromium executable. Starting the regular development server also enables `npm run test:e2e`.
