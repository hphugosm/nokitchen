// Drive only normal bank/household actions. Read the saved approval to independently derive
// the expected schedule, modal contents, lot quantities, and linked collection meals.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { begin, openStockDetails } from './browser-flow.mjs'

const catalog = JSON.parse(
  await readFile(new URL('../docs/catalog-compatibility-1.3.json', import.meta.url), 'utf8'),
)
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const capitalize = (word) => word[0].toUpperCase() + word.slice(1)
const sameSlot = (a, b) => a.householdId === b.householdId && a.day === b.day && a.meal === b.meal
const amount = (q, id) =>
  q.toLocaleString('en-US') + ' ' + catalog.ingredients.find((ingredient) => ingredient.id === id).unit

export async function verifyPublication() {
  const { page, session, click, nav, read, notice, reset, end } = await begin()
  const dialog = page.getByRole('dialog')
  const blockedScreen = async (message) => {
    for (const name of ['Meal schedule', 'Box contents']) {
      await nav(name)
      await page.getByRole('heading', { name: message }).waitFor()
      assert.equal(await page.locator('.house-meal, .packing-box, .household-plan').count(), 0)
    }
    await nav('Kitchen settings')
    await page.getByLabel('Number of people').waitFor()
  }
  const publishedViews = async (plan, meal) => {
    const recipe = catalog.recipes.find((r) => r.id === meal.recipeId)
    const method = recipe.methods.find((m) => m.id === meal.methodId)
    const collectionDay = meal.day < 4 ? 0 : 4
    const ownedBox = plan.packingLists.find(
      (box) => box.householdId === meal.householdId && box.collectionDay === collectionDay,
    )
    await page.getByLabel('Demo household').selectOption(meal.householdId)
    await nav('Meal schedule')
    await click(days[meal.day].slice(0, 3))
    const row = page.locator('.house-meal').filter({
      has: page.getByText(capitalize(meal.meal), { exact: true }),
    })
    assert.match(await row.innerText(), new RegExp(meal.portions + ' portions?'))
    assert.equal(await row.locator('strong').innerText(), recipe.name)
    await row.focus()
    await page.keyboard.press('Enter')
    await dialog.getByRole('heading', { name: recipe.name, exact: true }).waitFor()
    assert.ok((await dialog.innerText()).includes(method.name))
    await openStockDetails(dialog)
    const allLines = dialog.locator('.pack-items li')
    const expected = new Map()
    for (const r of meal.reservations) {
      expected.set(r.ingredientId, (expected.get(r.ingredientId) ?? 0) + r.quantity)
      assert.ok((await dialog.innerText()).includes(r.lotId))
    }
    assert.equal(await allLines.count(), expected.size)
    for (const [id, quantity] of expected) {
      const ingredient = catalog.ingredients.find((i) => i.id === id)
      const ingredientRow = allLines.filter({ has: page.getByText(ingredient.name, { exact: true }) })
      assert.equal(await ingredientRow.locator('strong').innerText(), amount(quantity, id))
    }
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await row.evaluate((el) => el === document.activeElement), true)
    await row.click()
    await click('Open ' + days[collectionDay] + ' packing list')
    const box = page.locator('article.packing-box').filter({
      has: page.getByRole('heading', { name: days[collectionDay] + ' box', exact: true }),
    })
    await openStockDetails(box)
    const sums = new Map()
    for (const item of ownedBox.items) {
      sums.set(item.ingredientId, (sums.get(item.ingredientId) ?? 0) + item.quantity)
      assert.ok((await box.innerText()).includes(item.lotId))
    }
    assert.equal(await box.locator('.pack-row').count(), sums.size)
    for (const [id, quantity] of sums) {
      const name = catalog.ingredients.find((i) => i.id === id).name
      const line = box.locator('.pack-row').filter({ has: page.getByText(name, { exact: true }) })
      assert.equal(await line.locator('strong').innerText(), amount(quantity, id))
    }
    await box.getByText(/^Meals in this box/).click()
    const linked = box.getByRole('button').filter({ hasText: days[meal.day] + ' ' + meal.meal })
    assert.ok((await linked.innerText()).includes(recipe.name))
    await linked.click()
    await dialog.getByRole('heading', { name: recipe.name, exact: true }).waitFor()
    await click('Close dialog')
    assert.equal(await linked.evaluate((el) => el === document.activeElement), true)
  }
  try {
    await page.goto(session.url)
    await reset()
    await click('Household')
    await blockedScreen('Waiting for an approved plan')
    await click('Food bank')
    await nav('Weekly plan')
    await click('Approve plan')
    await notice('Plan approved')
    const approvedState = await read()
    const approved = approvedState.plans[approvedState.approvedId]
    await click('Improve variety')
    await notice('Variety search complete')
    const variedState = await read()
    const replacement = variedState.plans[variedState.draftId]
    const changed = replacement.allocations.find((a) =>
      approved.allocations.some((b) => sameSlot(a, b) && a.recipeId !== b.recipeId),
    )
    assert.ok(changed, 'The fixture must distinguish the published and draft recipe')
    const previous = approved.allocations.find((a) => sameSlot(a, changed))
    assert.deepEqual(variedState.plans[variedState.approvedId], approved)
    await click('Household')
    await publishedViews(approved, previous)
    await page.reload()
    await publishedViews(approved, previous)
    await click('Food bank')
    await nav('Weekly plan')
    await click('Approve plan')
    await notice('Plan approved')
    const nextState = await read()
    assert.equal(nextState.approvedId, replacement.id)
    assert.deepEqual(nextState.plans[nextState.approvedId].allocations, replacement.allocations)
    await click('Household')
    await publishedViews(replacement, changed)
    await nav('Kitchen settings')
    const ingredient = catalog.ingredients.find((i) => i.id === changed.reservations[0].ingredientId)
    await page.getByText(/^Excluded ingredients \(/).click()
    await page.getByRole('checkbox', { name: ingredient.name, exact: true }).check()
    await click('Save changes')
    await notice('Household saved')
    await blockedScreen('Plan needs review')
    await page.reload()
    await blockedScreen('Plan needs review')
    assert.equal((await read()).approvedId, replacement.id)
    await click('Food bank')
    await nav('Weekly plan')
    await click('Release approved plan')
    await notice('Reservations released')
    await click('Household')
    await blockedScreen('Waiting for an approved plan')
    console.log('PASS household waiting, settings, old approval versus newer draft, recipe, lot quantities, linked box, keyboard Escape/focus, replacement, invalidation, release and reload.')
  } finally {
    await end()
  }
}
