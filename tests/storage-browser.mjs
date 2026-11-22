import assert from 'node:assert/strict'
import { begin } from './browser-flow.mjs'
for (const failure of ['read', 'write', 'malformed']) {
  const { page, session, click, end } = await begin(390)
  try {
    await page.addInitScript((mode) => {
      if (mode === 'read')
        Object.defineProperty(Storage.prototype, 'getItem', {
          value() {
            throw Error('Read denied')
          },
        })
      if (mode === 'write')
        Object.defineProperty(Storage.prototype, 'setItem', {
          value() {
            throw Error('Write denied')
          },
        })
      if (mode === 'malformed')
        localStorage.setItem('nokitchen.scenario.v4', '{ preserve the original ')
    }, failure)
    await page.goto(session.url)
    await click('Approve plan')
    await page
      .locator('.storage-warning')
      .getByText(/Session only/)
      .waitFor()
    assert.match(await page.locator('.toast').innerText(), /in this tab only/)
    assert.ok(await page.getByRole('button', { name: 'Plan approved', exact: true }).isDisabled())
    if (failure === 'malformed')
      assert.equal(
        await page.evaluate(() => localStorage.getItem('nokitchen.scenario.v4')),
        '{ preserve the original ',
      )
  } finally {
    await end()
  }
}
console.log(
  'PASS denied reads, denied writes and malformed storage in narrow Chromium; in-memory approval, visible warning, original bytes preserved.',
)
