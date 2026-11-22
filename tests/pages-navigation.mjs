import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { begin } from './browser-flow.mjs'

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
for (const width of [1365, 390]) {
  const { session, page, button, reset, nav, end } = await begin(width)
  try {
    const direct = new URL('#/bank/recipes/H02', session.url).href
    await page.goto(direct)
    assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), version)
    await page.getByRole('heading', { name: 'Recipes', exact: true }).waitFor()
    await page.getByLabel('Demo household').waitFor()
    assert.equal(await page.getByLabel('Demo household').inputValue(), 'H02')
    await page.reload()
    assert.equal(page.url(), direct)
    assert.equal(await page.getByLabel('Demo household').inputValue(), 'H02')
    assert.equal(await page.locator('.record-grid article').count(), 40)
    await reset()
    await nav('Weekly plan')
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].map((font) => [font.family.replace(/['"]/g, ''), font.status])
    })
    for (const name of ['DM Sans', 'DM Serif Text'])
      assert.ok(fonts.some(([family, status]) => family === name && status === 'loaded'), name)
    if (width === 390) {
      const toggle = button('Open navigation')
      await toggle.focus()
      await page.keyboard.press('Enter')
      await button('Close navigation').waitFor()
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('aside')), true)
      await page.keyboard.press('Escape')
      await button('Close navigation').waitFor({ state: 'hidden' })
      assert.equal(await toggle.evaluate((el) => el === document.activeElement), true)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await nav('Donations')
    assert.equal(await page.getByRole('button', { name: 'Sync Inbox', exact: true }).count(), 0)
    assert.equal(await page.evaluate(() => localStorage.getItem('nokitchen.operator.scenario.v4')), null)
    console.log('PASS project deep link, reload, version, fonts, navigation and width ' + width + '.')
  } finally {
    await end()
  }
}
