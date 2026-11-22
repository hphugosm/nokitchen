import assert from 'node:assert/strict'
import { begin } from './browser-flow.mjs'
import { verifyRecording } from './recording.mjs'

const { page, session, click, nav, read, notice, draft, reset, end } = await begin()
const options = () => page.getByRole('region', { name: 'Donation plan options' })
const choose = (name) => options().getByRole('button', { name, exact: true })
const selected = (name) => choose(name).getAttribute('aria-pressed')
const owner = (s) => s.plans[s.approvedId]
const narrow = async () =>
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
const impact = (actual) =>
  page.getByRole('region', {
    name: actual ? 'Actual receipt impact' : 'If received as entered',
    exact: true,
  })
async function chickpeaBox(region, expected) {
  await region.getByLabel('Impact household').selectOption('H02')
  const box = region
    .locator('details.box-trace')
    .filter({ has: page.getByText('Friday collection box · exact contents', { exact: true }) })
  if ((await box.getAttribute('open')) === null) await box.locator('summary').first().click()
  const content = await box.innerText()
  assert.match(content, new RegExp('0 g → ' + expected + ' g'))
  assert.match(content, /Friday dinner/i)
  assert.match(content, /Chickpea couscous bowl/)
  assert.match(content, /400 g · 2 packages/)
}
try {
  await page.goto(session.url)
  await reset()
  await click('Approve plan')
  await notice('Plan approved')
  const base = await read()
  await click('Improve variety')
  await notice('Variety search complete')
  const varied = await read()
  assert.notEqual(varied.draftId, base.approvedId)
  await page.getByLabel('Variety for').selectOption('H07')
  const weekly = page.getByRole('region', { name: 'Weekly meal variety' })
  assert.match(await weekly.innerText(), /Better spacing of the same meal types/)
  await weekly.getByText('Meal types and weekly meals', { exact: true }).click()
  assert.match(await weekly.innerText(), /Toastie[\s\S]*8 → 8/)
  await nav('Donations')
  for (const name of [
    'Paste donor offer',
    'Packaged chickpeas',
    'Parse offer',
    'Confirm the example product details',
    'Save edits',
    'Mark reviewed',
  ])
    await click(name)
  await notice('Offer reviewed')
  const reviewed = await read()
  await click('Preview impact')
  const preview = impact(false)
  await preview.waitFor()
  assert.match(await options().innerText(), /Approved plan/)
  assert.match(await options().innerText(), /newer draft/)
  assert.equal(await selected('Keep existing meals'), 'true')
  await choose('Reallocate for coverage').click()
  await preview.getByRole('heading', { name: 'Would become unfilled' }).waitFor()
  assert.match(await preview.innerText(), /297 → 310/)
  const losses = preview.locator('.removed-meals')
  assert.match(await losses.innerText(), /Potato with beans · 3 portions/)
  assert.match(await losses.innerText(), /Banana oatmeal · 3 portions/)
  await losses.getByRole('button', { name: /Saturday breakfast/i }).click()
  assert.equal(await preview.getByLabel('Impact household').inputValue(), 'H08')
  assert.equal(await preview.getByLabel('Impact day').inputValue(), '5')
  const breakfast = preview
    .locator('.impact-day-table tr')
    .filter({ has: page.getByRole('rowheader', { name: 'Breakfast' }) })
  assert.match(
    await breakfast.innerText(),
    /Banana oatmeal[\s\S]*Unfilled[\s\S]*Would become unfilled/,
  )
  await chickpeaBox(preview, '800')
  assert.deepEqual(await read(), reviewed)
  await click('Confirm received')
  await notice('Receipt recorded')
  await click('Recalculate')
  await notice('Draft recalculated')
  const preserved = await read(),
    originalApproval = owner(base)
  await click('Recalculate')
  assert.deepEqual(await read(), preserved)
  assert.deepEqual(owner(preserved), originalApproval)
  assert.equal(draft(preserved).metrics.allocated, 309)
  assert.equal(await selected('Keep existing meals'), 'true')
  await chickpeaBox(impact(true), '1[ ,\u00a0\u202f]?200')
  await nav('Weekly plan')
  await page.setViewportSize({ width: 390, height: 844 })
  await choose('Reallocate for coverage').click()
  await notice('Replacement draft selected')
  await page.waitForFunction((prior) => {
    const s = JSON.parse(localStorage.getItem('nokitchen.scenario.v4'))
    return s.draftId !== prior
  }, preserved.draftId)
  const redistributed = await read()
  assert.deepEqual(owner(redistributed), originalApproval)
  assert.equal(draft(redistributed).metrics.allocated, 310)
  const review = page.getByRole('region', { name: 'Changes before approval' })
  assert.match(await review.innerText(), /Potato with beans/)
  assert.match(await review.innerText(), /Banana oatmeal/)
  await impact(true).getByRole('heading', { name: 'Removed in this draft' }).waitFor()
  await narrow()
  await page.reload()
  assert.equal(await selected('Reallocate for coverage'), 'true')
  assert.deepEqual(await read(), redistributed)
  await choose('Keep existing meals').click()
  await notice('Replacement draft selected')
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('nokitchen.scenario.v4')).draftId === id, preserved.draftId)
  assert.equal((await read()).draftId, preserved.draftId)
  assert.deepEqual(owner(await read()), originalApproval)
  await choose('Reallocate for coverage').click()
  await notice('Replacement draft selected')
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('nokitchen.scenario.v4')).draftId === id, redistributed.draftId)
  await click('Approve plan')
  await notice('Plan approved')
  const approved = await read()
  assert.equal(approved.approvedId, redistributed.draftId)
  assert.deepEqual(owner(approved).allocations, draft(redistributed).allocations)
  assert.deepEqual(approved.lots, preserved.lots)
  await page.reload()
  assert.deepEqual(await read(), approved)
  await narrow()
  console.log(
    'PASS approved versus newer draft, variety breakdown, read-only preview, exact removals/day, H02 lots and packages, 309/310 choices before approval, narrow layout, persistent choice and approved replacement.',
  )
} finally {
  await end()
}

await verifyRecording()
