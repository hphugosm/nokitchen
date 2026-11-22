# NoKitchen 1.4

NoKitchen plans a synthetic food-bank week using the stock each household can collect, store, open and prepare. In **Food bank**, paste an offer, review its label and quantities, preview the possible impact and record the actual delivery. The resulting draft shows which meals and collection boxes will change. In **Household**, open a meal to see its exact ingredients, method and collection.

Jump-Powered by Tým Trampolín

## Choose a deployment

| Mode | How to open it | Data and connectivity |
| --- | --- | --- |
| Public demo | Serve the static Pages build or standalone HTML | Synthetic week, sample offers, household and bank tools. All planning runs in the browser. |
| Private operator | Open the local sign-in link after starting the Node service | One inbox-scoped Agentboxd connection, imported donor text, actual receipt confirmation and traceable collection boxes. |

Both modes use the same offer parser, review, receipt validation, allocation engine and approval command. The operator view also provides a locally generated donor reply to copy. For a real mailbox, configure the two read permissions and a dedicated operator browser. [Agentboxd setup and email-to-dinner walkthrough](docs/agentboxd-setup.md) · [Security](docs/agentboxd-security.md)

## Publish the public demo

Run `npm ci`, `npm run build` and `npm run check:public`. Deploy only `dist/` or extract the supplied Pages ZIP at the static site root. Relative asset paths work beneath a project subdirectory. To publish from a GitHub repository, select GitHub Actions in its Pages settings and manually run **Publish the public NoKitchen demo**. The workflow builds, checks and uploads the static files. No repository secrets are required. Private operator files and configuration belong on the operator machine.

## Open the standalone

The archive includes **NoKitchen-1.4.html** alongside this README. From the directory containing the HTML, start a loopback server and open [the standalone app](http://127.0.0.1:8080/NoKitchen-1.4.html).

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

No internet connection or npm installation is needed for this runtime. Scripts, styles, fonts, licenses and food data are bundled. Direct file opening is subject to browser policy. Each origin has separate browser storage. A visible warning identifies session-only operation if storage fails.

## Try the workflow

1. Select **Start guided demo** on the weekly plan. It opens an independent household week. Back restores the entry state of a step. Exit, Finish or reload returns to the ordinary workspace.
2. In **Demo donations**, choose **Paste donor offer** and **Packaged chickpeas**, or enter your own supported text. Inspect extracted values beside their source phrases. Resolve the product, amount, package, dates and model window. Exclude any unmatched line with a reason. **Mark reviewed** leaves physical stock unchanged.
3. Choose **Preview impact**. For an existing approval the bank sees **Keep existing meals** first. For an unapproved draft it sees **Reallocate for coverage** first. Compare the two when they differ. Select a removed meal to inspect that household’s day or open a collection box for the signed ingredient and lot changes.
4. Enter the actual delivery and confirm any differences. Choose **Confirm received** and **Recalculate**. Switch the replacement draft in the donation or weekly approval view. Only **Approve plan** commits its reservations.
5. On **Weekly plan**, use **Improve variety** and choose a household. Compare breakfast and main meals, then open **Family frequencies and weekly meals** for recipe names and counts. The action keeps the original filled slots and portion counts.

## Read the results

The expanded opening week has 50 ingredients, 40 recipes, 44 methods, 21 recipe families and 54 explicitly entered lots. Eight households with 18 people request 378 portions. The seed covers 297. The earlier 1.2 week had a different catalog and stock. A frozen copy of the 1.2 fixtures and planner remains available for regression.

With twelve received 200 g chickpea pouches, keeping a valid approved plan covers 309 portions and adds five household meals. Reallocation covers 310, adding eight meals and removing two. With eight actually received, both choices cover 305 and keep the 134 original meals. [Household results, removed meals and box reconciliation](docs/results-1.3.1.md)

| Evidence | Contents |
| --- | --- |
| [Release verification](docs/verification-1.4.md) and [computed 1.4 regression results](docs/decision-results-1.4.json) | Public build, private transport, receipt safety and end-to-end delivery checks |
| [1.3.1 decisions and variety](docs/decision-results-1.3.1.json) and [verification](docs/verification-1.3.1.md) | Both candidates, both baseline statuses, meal-level changes and household frequencies |
| [Catalog audit](docs/catalog-audit-1.3.md) and [compatibility matrix](docs/catalog-compatibility-1.3.md) | Ingredients, family decisions, method checks, independent batch feasibility and joint weekly use |
| [Historical 1.3 coverage and variety](docs/variety-results-1.3.md) and [JSON](docs/variety-results-1.3.json) | Frozen 1.2, expanded 1.3, and identical-slot before/after scores |
| [Historical 1.3 donor impact JSON](docs/donor-impact-1.3.json) | Independent branches for twelve offered and twelve or eight received, exact lots, household changes and boxes |
| [Parser guide](docs/donor-parser-1.3.md) and [ingestion boundary](docs/future-agentboxd.md) | Supported patterns, unresolved fields, reviewed receipts and disconnected provider |
| [Guided demo](docs/guided-demo.md), [release verification](docs/verification-1.3.1.md) and [changelog](docs/changelog-1.3.1.md) | Operating instructions, delivery checks and known limits |

## Run from source

Use Node.js 24 or newer and npm. Install dependencies, then open the local address printed by Vite. Fresh dependency installation requires network access or a populated npm package cache.

```sh
npm ci
npm run dev
```

The production build writes `dist/NoKitchen-1.4.html`. The preview command serves the built project.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Browser checks use local Chromium, or use `npx playwright install chromium` to install a browser. Set `CHROMIUM_PATH` for a custom executable. With the dev server running, `npm run test:e2e` drives the bank, household, donor and tour workflows and storage failures. `NOKITCHEN_URL` overrides its address. After building, `npm run test:standalone` creates fresh browser contexts and denies external requests before loading the final HTML.

```sh
npm run evidence:decision
npm run catalog:audit
npm run evidence:variety
npm run evidence:donor
npm run matrix
python3 scripts/package-source.py NoKitchen-MVP-1.4.zip --pages NoKitchen-Pages-1.4.zip
```

The decision command regenerates the current synthetic regression measurements. The catalog command checks the retained 1.3 catalog. The variety and donor commands run the earlier experiments with the explicit coverage alternative and write their output to `dist/legacy-evidence/`. The original 1.3 reports remain in `docs/`. The matrix command runs the frozen 1.2 code. The ZIP includes source, tests, documents, the frozen regression fixture and the standalone. Existing saved weeks migrate without the 22 new seed lots. The explicit **Reset demo** action loads the expanded stock.

## Run the private service and tests

```sh
npm run build:operator
npm run operator
```

With the public and operator builds present, `npm run test:live` drives a loopback Agentboxd HTTP fixture, including two independent receipt branches. It uses synthetic identities. To verify a real inbox, follow the test-message steps in the setup guide. The source archive includes the backend and tests. Its bundled standalone is the public demo.

## Scope

The planner models a single Monday–Sunday week with Monday and Friday pickup. All meal and package declarations are synthetic. The local parser needs human confirmation of unresolved facts. The deterministic variety search is bounded. The private service reads a configured Agentboxd inbox. All outbound replies require separate operator action in an email client. The planner uses fixed rules and synthetic product declarations. Hosted operator accounts and nutritional certification are outside this release. [Domain model](docs/data-model.md)
