# NoKitchen 1.4.1

NoKitchen helps a food bank answer a practical question. Given the food available, which requested meals can each household actually collect, store, open and cook? The bank reviews offers, confirms receipts and prepares a weekly draft. Households see the meals the bank has approved.

**Theme:** Projects for Social Good

Jump-Powered by Tým Trampolín

## Open the demo

The public GitHub Pages build runs entirely in the browser with synthetic households, stock and donor offers. It accepts pasted examples or manually entered offers. Each browser profile has its own saved demo week. **Start guided demo** opens an isolated session. **Reset demo** restores the ordinary demo in the current profile. [Guided demo](docs/guided-demo.md) · [Timed video walkthrough](docs/demo-script.md)

The source ZIP also contains **NoKitchen-1.4.1.html**. Open it in a browser that allows local files. If the browser blocks file navigation, run this command in the folder containing the HTML and open the loopback link. This serves the bundled scripts, styles, fonts and food catalog without internet or npm. A storage warning identifies session-only operation. [Loopback standalone](http://127.0.0.1:8080/NoKitchen-1.4.1.html)

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

## Follow a meal from donation to collection

1. On **Weekly plan**, inspect an assigned meal and a gap. **Approve plan** publishes the current allocation and reserves the stock. A household waiting for approval can still update **Kitchen settings**.
2. In **Donations**, choose **Paste donor offer**, **Packaged chickpeas**, then **Parse offer**. Review the package label and model dates. Select **Confirm the example product details**, **Save edits** and **Mark reviewed**. Inventory changes only when the bank confirms a receipt.
3. Select **Preview impact**. An existing approved plan defaults to **Keep existing meals**. An unapproved baseline defaults to **Reallocate for coverage**. Where the choices differ, inspect the gains, removed meals and lot quantities. Enter the actual delivery, confirm any differences, then **Confirm received** and **Recalculate**.
4. On **Weekly plan**, review the proposed replacement before approving it. A draft or an **Improve variety** run stays in the bank workspace. Households keep seeing the last approval that still passes current content checks. A conflicting restriction shows **Plan needs review** until the bank resolves it. Releasing the approval returns households to **Waiting for an approved plan**.
5. Select **Household**, choose H02, then **Fri** and **Dinner**. The meal lists the household batch, method, ingredients and collection. **Open Friday packing list** connects the meal to the approved box. **Stock details** exposes its exact lots.

## What this week demonstrates

Eight synthetic households with 18 people request 378 model portions in one week with Monday and Friday collection. The seed covers 297 portions in 134 household meals. A fresh run of the simple first-fit reference covers 286 portions. The catalog has 50 ingredients, 40 recipes, 44 methods and 21 meal families.

| Actual receipt from the 12-pouch offer | Keep existing meals | Reallocate for coverage | H02 Friday box, preserve / reallocate |
| --- | --- | --- | --- |
| Twelve 200 g pouches | 309 portions, 5 added meals, 0 removed | 310 portions, 8 added meals, 2 removed | 1,200 g / 800 g |
| Eight 200 g pouches | 305 portions, 3 added meals, 0 removed | Identical allocation | 400 g / 400 g |

Reallocation with twelve pouches removes H03’s Friday potato-and-bean dinner and H08’s Saturday banana-oatmeal breakfast, three portions each. The preserved plan adds a two-portion H02 Friday chickpea couscous dinner using two pouches. These results describe this synthetic week. The planner uses deterministic, bounded searches. Model portions measure requested meal coverage. Nutritional adequacy, global optimality and improvements for every household have not been established. [Computed results and household changes](docs/decision-results-1.4.1.json) · [Release verification](docs/verification-1.4.1.md) · [Planning rules](docs/data-model.md)

## Run or rebuild from source

Use Node.js 24 or newer and npm. Extract the source ZIP, enter **NoKitchen/**, then run the following commands. A fresh installation needs access to the npm registry or an already populated package cache. Start the app with `npm run dev`, or serve the production build with `npm run preview`. Each prints its local address.

```sh
npm ci
npm test
npm run build
npm run check:public
npm run evidence:decision
```

The build runs TypeScript, produces the static project in `dist/` and writes `dist/NoKitchen-1.4.1.html`. The public guard scans the expected files, compares an isolated build under private sentinels, and checks that intentionally contaminated test files are rejected.

```sh
npm run test:standalone
python3 scripts/package-source.py NoKitchen-MVP-1.4.1.zip --pages NoKitchen-Pages-1.4.1.zip
```

The standalone test starts fresh Chromium contexts with network restrictions before the first navigation. With `npm run dev` running, `npm run test:e2e` exercises bank/household publication, comparison, what-if, sample receipts, the tour and unavailable storage. Set `CHROMIUM_PATH` to an installed Chromium executable or install Playwright Chromium using `npx playwright install chromium`.

## Publish the public demo

Place the **contents of NoKitchen/** at the GitHub repository root so that `package.json` and `.github/workflows/pages.yml` are both at root level. In Pages settings choose GitHub Actions. Run the existing **Publish the public NoKitchen demo** workflow on the intended release commit. It publishes only the checked `dist/` tree. The public build needs no Agentboxd credentials. The separate Pages ZIP contains these static files at its root. [Pages workflow](.github/workflows/pages.yml)

After deployment, run the check below in the matching release checkout with `dist/` built. Supply the published HTTPS project root, including its trailing slash. The command compares remote bytes to the local build and runs synthetic Chromium sessions against the public site.

```sh
node scripts/verify-pages.mjs "$NOKITCHEN_URL"
```

## Private operator and historical evidence

The private operator uses a separate loopback Node service, server-side read-only Agentboxd credentials and a separate browser namespace. The operator can import donor mail into the same review and receipt workflow. The public site has no provider connection. Reply text can be copied for a human to send. Local tests use a synthetic HTTP provider. Actual retrieval requires a dedicated, configured inbox. No real inbox retrieval is claimed for this release. [Operator setup](docs/agentboxd-setup.md) · [Security boundaries](docs/agentboxd-security.md)

```sh
npm run build:operator
npm run test:live
npm run operator
```

The audited catalog, historical decision evidence and past release reports remain in the source archive. The catalog and earlier experiments can be regenerated with `npm run catalog:audit`, `npm run evidence:variety`, `npm run evidence:donor` and `npm run matrix`. Build the public distribution again after running historical generators that write additional files into `dist/`. [Catalog audit](docs/catalog-audit-1.3.md) · [Historical 1.4 verification](docs/verification-1.4.md) · [Release changes](docs/changelog-1.4.1.md)
