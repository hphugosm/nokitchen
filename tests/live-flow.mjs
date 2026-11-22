// Exercise the built UI against its real operator server. Only the external provider is synthetic.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import {
  fixture,
  instruction,
  offerSubject,
  publicSite,
  root,
  syntheticText,
  unsafeSubject,
} from './live-http-fixture.mjs'

const executablePath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
const catalog = JSON.parse(
  await readFile(join(root, 'docs/catalog-compatibility-1.3.json'), 'utf8'),
)
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const browser = await chromium.launch({ executablePath, headless: true })
const owner = (s) => s.plans[s.approvedId]
const draft = (s) => s.plans[s.draftId]
const slot = (a) => a.householdId + '/' + a.day + '/' + a.meal
const sum = (a, fn) => a.reduce((n, x) => n + fn(x), 0)
function tools(p, operator = true) {
  const button = (name) => p.getByRole('button', { name, exact: true })
  const click = (name) => button(name).click()
  const nav = async (name) => {
    if (await button('Open navigation').isVisible()) await click('Open navigation')
    await p.getByRole('navigation').getByRole('button', { name, exact: true }).click()
  }
  const read = () =>
    p.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)),
      operator ? 'nokitchen.operator.scenario.v4' : 'nokitchen.scenario.v4',
    )
  const notice = (t) => p.locator('.toast').filter({ hasText: t }).waitFor()
  const dismiss = async () => {
    if (await p.locator('.toast button').isVisible()) await p.locator('.toast button').click()
  }
  return { button, click, nav, read, notice, dismiss }
}

async function pages() {
  const site = await publicSite(),
    context = await browser.newContext({
      viewport: { width: 1200, height: 850 },
      serviceWorkers: 'block',
    })
  const page = await context.newPage(),
    failures = [],
    requests = []
  page.setDefaultTimeout(9000)
  page.on('pageerror', () => failures.push('page error'))
  await context.route('**/*', async (route) => {
    const request = route.request(),
      target = new URL(request.url())
    const safe =
      target.origin === site.origin &&
      target.pathname.startsWith('/NoKitchen-demo/') &&
      request.method() === 'GET' &&
      !request.headers().authorization
    if (!safe) {
      failures.push('unexpected public network operation')
      await route.abort()
      return
    }
    requests.push(target.pathname)
    await route.continue()
  })
  await context.routeWebSocket('**/*', (ws) => {
    failures.push('WebSocket')
    ws.close()
  })
  try {
    const { nav, click } = tools(page, false)
    await page.goto(site.url)
    await page.getByRole('heading', { name: 'Weekly plan', exact: true }).waitFor()
    await page.getByText('Demo Mode — Simulated data', { exact: true }).first().waitFor()
    await nav('Demo donations')
    assert.equal(await page.getByRole('button', { name: 'Sync Inbox', exact: true }).count(), 0)
    await click('Paste donor offer')
    await click('Packaged chickpeas')
    await click('Parse offer')
    await page.getByRole('button', { name: 'Confirm example label and window' }).waitFor()
    await nav('Recipes')
    await page.locator('.record-grid article').first().waitFor()
    assert.equal(await page.locator('.record-grid article').count(), 40)
    await click('Household')
    await page.getByRole('heading', { name: 'Meal schedule', exact: true }).waitFor()
    assert.equal(
      await page.evaluate(() => localStorage.getItem('nokitchen.operator.scenario.v4')),
      null,
    )
    assert.deepEqual(failures, [])
    assert(
      requests.some((path) => path.endsWith('.js')) &&
        requests.some((path) => path.endsWith('.css')),
    )
    return { publicPagesRequests: requests.length, publicApiRequests: 0, relativeProjectPath: true }
  } finally {
    await context.close()
    await site.close()
  }
}

async function connectionStates() {
  for (const configured of [false, true]) {
    const operator = await fixture(configured),
      context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(9000)
    try {
      const { nav, click, read, notice } = tools(page)
      await operator.pair(page)
      await click('Approve plan')
      await notice('Plan approved')
      const before = await read()
      await nav('Donations')
      const inbox = page.getByRole('region', { name: 'Live Donations — Powered by Agentboxd' })
      if (!configured) {
        await inbox.getByText('Unconfigured', { exact: true }).waitFor()
        assert.equal(await inbox.getByText('Connected', { exact: true }).count(), 0)
        assert.equal(operator.counters.inbox, 0)
      } else {
        for (const status of [401, 503]) {
          operator.failProvider(status)
          const done = page.waitForResponse((r) => r.url().endsWith('/api/inbox/sync'))
          await click('Sync Inbox')
          assert(!(await done).ok())
          await inbox.getByText('Error', { exact: true }).waitFor()
          assert.equal(await inbox.getByText('Connected', { exact: true }).count(), 0)
          assert.deepEqual(await read(), before)
        }
        operator.failProvider(0)
        await click('Sync Inbox')
        await inbox.getByText('Connected', { exact: true }).waitFor()
        assert.deepEqual(await read(), before)
      }
    } finally {
      await context.close()
      await operator.close()
    }
  }
  return {
    unconfigured: true,
    invalidCredentials: true,
    providerOutage: true,
    recoveredOnRetry: true,
  }
}

async function live(width, delivered) {
  const operator = await fixture()
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage(),
    failures = [],
    secrets = [],
    observedRequests = []
  page.setDefaultTimeout(10000)
  page.on('pageerror', () => failures.push('page error'))
  await context.route('**/*', async (route) => {
    const r = route.request(),
      u = new URL(r.url())
    if (
      u.origin !== operator.origin ||
      r.headers().authorization ||
      operator.hasSecret(JSON.stringify(r.headers())) ||
      operator.hasSecret(r.url())
    ) {
      failures.push('unexpected outbound browser request')
      await route.abort()
      return
    }
    if (u.pathname.startsWith('/api/')) {
      if (r.headers()['x-nokitchen-operator'] !== '1')
        failures.push('missing operator request header')
      observedRequests.push(
        r.method() + ' ' + u.pathname.replace(/\/messages\/[^/]+/u, '/messages/[id]'),
      )
    }
    await route.continue()
  })
  await context.routeWebSocket('**/*', (ws) => {
    failures.push('WebSocket')
    ws.close()
  })
  page.on('response', (r) => {
    if (r.url().startsWith(operator.origin + '/api/'))
      secrets.push(
        r
          .body()
          .then((buf) => operator.hasSecret(buf.toString('utf8')))
          .catch(() => false),
      )
  })
  const layout = []
  async function measureLayout(phase) {
    const overflow = await page.evaluate(() => {
      if (document.documentElement.scrollWidth <= innerWidth) return null
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll('main *')]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .map((el) => el.tagName + '.' + el.className)
          .filter((s, i, a) => a.indexOf(s) === i)
          .slice(-7),
      }
    })
    if (overflow) layout.push({ phase, ...overflow })
  }
  const { nav, button, click, read, notice, dismiss } = tools(page)
  const card = (s) => page.getByRole('article', { name: s, exact: true })
  const inbox = page.getByRole('region', {
    name: 'Live Donations — Powered by Agentboxd',
    exact: true,
  })
  try {
    await operator.pair(page)
    await click('Approve plan')
    await notice('Plan approved')
    await dismiss()
    const seed = await read(),
      approved = owner(seed)
    assert.equal(approved.metrics.allocated, 297)
    assert.equal(approved.allocations.length, 134)
    await nav('Donations')
    await inbox.waitFor()
    await click('Sync Inbox')
    await card(offerSubject).waitFor()
    await inbox.getByText('Connected', { exact: true }).waitFor()
    await measureLayout('inbox')
    assert((await card(unsafeSubject).innerText()).includes(instruction))
    assert.equal(await page.locator('[data-untrusted-mail]').count(), 0)
    assert.deepEqual((await read()).lots, seed.lots)
    await card(unsafeSubject).getByRole('button', { name: 'Review Donation' }).click()
    await button('Mark reviewed').waitFor()
    assert(await button('Mark reviewed').isDisabled())
    let saved = await read()
    const unknown = saved.proposals.find((o) => o.subject === unsafeSubject)
    assert(unknown.document.rows.some((r) => r.ingredientId === null))
    assert(unknown.document.message.text.includes(instruction))
    assert.deepEqual(saved.lots, seed.lots)
    const importButton = card(offerSubject).getByRole('button', { name: 'Review Donation' })
    operator.failNextDetail()
    const failed = page.waitForResponse(
      (r) => r.url().endsWith('/import') && r.request().method() === 'POST',
    )
    await importButton.click()
    assert(!(await failed).ok())
    const failedState = await read()
    assert.equal(failedState.proposals.filter((o) => o.subject === offerSubject).length, 0)
    assert.deepEqual(failedState.lots, seed.lots)
    await importButton.click()
    const row = page.locator('fieldset.donor-item')
    await row.first().waitFor()
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('nokitchen.operator.scenario.v4')).proposals.length === 2,
    )
    saved = await read()
    const pending = saved.proposals.find((o) => o.subject === offerSubject),
      id = pending.id
    await measureLayout('editor')
    assert.equal(saved.proposals.filter((o) => o.subject === offerSubject).length, 1)
    assert.equal(pending.document.message.text, syntheticText)
    assert.equal(pending.document.message.kind, 'agentboxd')
    assert.equal(pending.document.message.externalId, 'msg-chickpeas')
    assert.equal(pending.document.message.inboxId, 'inbox-qa')
    assert.equal(pending.document.rows[0].packageCount, 12)
    assert.equal(pending.document.rows[0].quantity, 2400)
    assert(await button('Mark reviewed').isDisabled())
    assert.deepEqual(saved.lots, seed.lots)
    for (const [label, val] of [
      ['Storage before opening', 'ambient'],
      ['Storage after opening', 'fridge'],
      ['Available from model day', '0'],
      ['Usable through model day', '6'],
    ]) {
      await row.getByLabel(label, { exact: true }).selectOption(val)
    }
    await click('Save edits')
    await notice('Offer saved')
    await dismiss()
    await click('Mark reviewed')
    await notice('Offer reviewed')
    await dismiss()
    await click('Preview impact')
    const preview = page.getByRole('region', { name: 'If received as entered', exact: true })
    await preview.waitFor()
    await measureLayout('preview')
    assert.deepEqual((await read()).lots, seed.lots)
    assert.deepEqual(owner(await read()), approved)
    await click('Copy Reply')
    const reply = await page.evaluate(() => navigator.clipboard.readText())
    assert(reply.trim().length > 12 && !operator.hasSecret(reply))
    await dismiss()
    if (delivered !== 12) {
      await row.getByLabel('Sealed package count', { exact: true }).fill(String(delivered))
      await page.getByRole('button', { name: /Use package total/ }).click()
      assert(await button('Confirm received').isDisabled())
      await page
        .getByRole('checkbox', { name: /confirm these actual delivery differences/i })
        .check()
    }
    await click('Confirm received')
    await notice('Receipt recorded')
    await dismiss()
    const receipt = await read(),
      o = receipt.proposals.find((x) => x.id === id),
      lot = receipt.lots.at(-1)
    assert.equal(receipt.lots.length, seed.lots.length + 1)
    assert.deepEqual(receipt.lots.slice(0, -1), seed.lots)
    assert.deepEqual(owner(receipt), approved)
    assert.equal(lot.sourceOfferId, id)
    assert.equal(lot.packageCount, delivered)
    assert.equal(lot.quantityBaseUnits, delivered * 200)
    assert.equal(o.document.rows[0].quantity, 2400)
    assert.equal(o.receipt.rows[0].quantity, delivered * 200)
    await click('Recalculate')
    await notice('Draft recalculated')
    await dismiss()
    const actual = page.getByRole('region', { name: 'Actual receipt impact', exact: true })
    const trace = actual.getByRole('region', { name: 'From email to dinner' })
    await trace.getByRole('button', { name: 'Inspect donated meal' }).click()
    assert(
      (await trace.innerText()).includes('msg-chickpeas') &&
        (await trace.innerText()).includes(lot.id),
    )
    assert((await actual.getByLabel('Impact household').inputValue()) === 'H02')
    assert((await actual.innerText()).includes('Required appliances · Electric kettle'))
    await measureLayout('actual receipt')
    const preserved = await read()
    const kept = draft(preserved)
    assert.equal(kept.metrics.allocated, delivered === 12 ? 309 : 305)
    assert.deepEqual(owner(preserved), approved)
    await nav('Weekly plan')
    const choice = page.getByRole('button', { name: /Reallocate for coverage/ }).first()
    let max = kept
    if (delivered === 12) {
      await choice.click()
      await notice('Replacement draft selected')
      await dismiss()
      const alternative = await read()
      max = draft(alternative)
      assert.equal(max.metrics.allocated, 310)
      assert.deepEqual(owner(alternative), approved)
      await page
        .getByRole('button', { name: /Keep existing meals/ })
        .first()
        .click()
      await notice('Replacement draft selected')
      await dismiss()
    } else {
      assert.equal(await choice.count(), 0)
      assert(
        (await page.locator('.donation-options').innerText()).toLowerCase().includes('identical'),
      )
    }
    const current = await read()
    assert.deepEqual(draft(current).allocations, kept.allocations)
    await click('Approve plan')
    await notice('Plan approved')
    await dismiss()
    const final = await read(),
      replacement = owner(final)
    assert.deepEqual(replacement.allocations, kept.allocations)
    assert.deepEqual(final.lots, receipt.lots)
    const oldSlots = new Set(approved.allocations.map(slot))
    const added = replacement.allocations.filter((a) => !oldSlots.has(slot(a)))
    const uses = (a) => a.reservations.some((r) => r.lotId === lot.id)
    const meal =
      added.find((a) => a.householdId === 'H02' && a.meal === 'dinner' && uses(a)) ??
      added.find(uses)
    assert(meal, 'Expected a newly filled meal supplied by the actual receipt')
    const collect = meal.day < 4 ? 0 : 4
    const box = replacement.packingLists.find(
      (b) => b.householdId === meal.householdId && b.collectionDay === collect,
    )
    const item = box.items.find((i) => i.lotId === lot.id)
    const recipe = catalog.recipes.find((r) => r.id === meal.recipeId),
      method = recipe.methods.find((m) => m.id === meal.methodId)
    const household = final.households.find((h) => h.id === meal.householdId)
    assert.equal(meal.portions, household.peopleCount)
    for (const r of recipe.required)
      assert.equal(
        sum(
          meal.reservations.filter((q) => q.ingredientId === r.ingredientId),
          (q) => q.quantity,
        ),
        r.quantity * meal.portions,
      )
    const boxMeals = replacement.allocations.filter(
      (a) => a.householdId === meal.householdId && (a.day < 4 ? 0 : 4) === collect,
    )
    assert.equal(
      item.quantity,
      sum(
        boxMeals.flatMap((a) => a.reservations).filter((r) => r.lotId === lot.id),
        (r) => r.quantity,
      ),
    )
    assert.equal(item.packages, item.quantity / lot.packageSize)
    assert(
      sum(
        replacement.allocations.flatMap((a) => a.reservations).filter((r) => r.lotId === lot.id),
        (q) => q.quantity,
      ) <= lot.quantityBaseUnits,
    )
    await click('Household')
    await page.getByLabel('Demo household').selectOption(meal.householdId)
    await click(days[meal.day].slice(0, 3))
    await page
      .locator('.house-meal')
      .filter({
        has: page.getByText(meal.meal[0].toUpperCase() + meal.meal.slice(1), { exact: true }),
      })
      .click()
    const dialog = page.getByRole('dialog')
    assert(
      (await dialog.innerText()).includes(recipe.name) &&
        (await dialog.innerText()).includes(method.name) &&
        (await dialog.innerText()).includes(lot.id),
    )
    await measureLayout('recipe')
    await click('Open ' + days[collect] + ' packing list')
    const boxUI = page
      .locator('article.packing-box')
      .filter({ has: page.getByRole('heading', { name: days[collect] + ' box', exact: true }) })
    assert((await boxUI.innerText()).includes(lot.id))
    await measureLayout('packing list')
    await click('Food bank')
    await nav('Donations')
    await card(offerSubject).getByText('Received', { exact: true }).waitFor()
    await operator.restart()
    await operator.pair(page)
    await nav('Donations')
    await inbox.waitFor()
    await click('Sync Inbox')
    await card(offerSubject).getByRole('button', { name: 'Open receipt' }).click()
    await page.getByRole('heading', { name: 'Received stock', exact: true }).waitFor()
    const reloaded = await read()
    assert.deepEqual(reloaded, final)
    assert.equal(await card(offerSubject).count(), 1)
    assert.equal(await button('Confirm received').count(), 0)
    assert.equal(await page.evaluate(() => localStorage.getItem('nokitchen.scenario.v4')), null)
    const second = await browser.newContext({ viewport: { width: 1000, height: 800 } })
    await second.addCookies(await context.cookies())
    const other = await second.newPage()
    try {
      await other.goto(operator.origin)
      await tools(other).nav('Donations')
      const claimed = other.getByRole('article', { name: offerSubject, exact: true })
      await claimed.waitFor()
      assert(await claimed.getByRole('button', { name: 'Review Donation' }).isDisabled())
    } finally {
      await second.close()
    }
    assert.equal(operator.counters.invalid, 0)
    assert(operator.counters.pages >= 4 && operator.counters.detail >= 2)
    assert.deepEqual(failures, [])
    assert(!(await Promise.all(secrets)).some(Boolean))
    assert.deepEqual(layout, [], 'Page overflow by workflow phase')
    const selected = new Set(replacement.allocations.map(slot))
    return {
      width,
      offered: 12,
      received: delivered,
      usableGrams: lot.quantityBaseUnits,
      baseline: approved.metrics.allocated,
      preserve: kept.metrics.allocated,
      maximize: max.metrics.allocated,
      addedSlots: added.length,
      removedSlots: approved.allocations.filter((a) => !selected.has(slot(a))).length,
      household: meal.householdId,
      day: days[meal.day],
      meal: meal.meal,
      recipe: recipe.name,
      method: method.name,
      portions: meal.portions,
      receiptInMealGrams: sum(
        meal.reservations.filter((r) => r.lotId === lot.id),
        (r) => r.quantity,
      ),
      pickup: days[collect],
      receiptInBoxGrams: item.quantity,
      receiptInBoxPackages: item.packages,
      privateBrowserRequests: observedRequests.length,
      mockReadRequests: operator.counters,
      stockUnchangedThroughReview: true,
      duplicateStockAfterRestart: 0,
      failedImportRetriedOnce: true,
    }
  } finally {
    await context.close()
    await operator.close()
  }
}

try {
  console.log('Chromium ' + browser.version())
  if (!process.argv.includes('--operator-only')) console.log(JSON.stringify(await pages()))
  if (!process.argv.includes('--public-only') && !process.argv.includes('--narrow'))
    console.log(JSON.stringify(await connectionStates()))
  if (!process.argv.includes('--public-only'))
    for (const [w, n] of process.argv.includes('--narrow')
      ? [[390, 8]]
      : [
          [1390, 12],
          [390, 8],
        ])
      console.log(JSON.stringify(await live(w, n)))
} finally {
  await browser.close()
}
