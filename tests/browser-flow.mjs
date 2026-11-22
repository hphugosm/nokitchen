import assert from 'node:assert/strict'
import { workflowBrowser } from '../scripts/verify-standalone.mjs'

export async function begin(width = 1380) {
  const session = await workflowBrowser({ width, height: 900 }),
    page = session.page,
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.setDefaultTimeout(8500)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const click = (name) => button(name).click()
  const nav = async (name) => {
    const menu = button('Open navigation')
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
  }
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('nokitchen.scenario.v4')))
  const notice = async (part) => page.locator('.toast').filter({ hasText: part }).waitFor()
  const draft = (s) => s.plans[s.draftId]
  const reset = async () => {
    const menu = button('Open navigation')
    if (await menu.isVisible()) await menu.click()
    await click('Reset demo')
    await page.getByRole('dialog').getByRole('button', { name: 'Reset demo' }).click()
    await notice('Initial demo restored')
  }
  const end = async () => {
    try {
      assert.deepEqual(errors, [])
    } finally {
      await session.close()
    }
  }
  return { page, session, button, click, nav, read, notice, draft, reset, end }
}
