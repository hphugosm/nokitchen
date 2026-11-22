// A server claim may succeed while a browser save fails. Retry the same claim after reload.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { fixture, offerSubject } from './live-http-fixture.mjs'

const service = await fixture()
let browser
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  })
  const page = await browser.newPage({ viewport: { width: 1350, height: 820 } })
  const key = 'nokitchen.operator.scenario.v4'
  const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key)
  await service.pair(page)
  await page.getByRole('button', { name: 'Approve plan', exact: true }).click()
  await page.getByRole('button', { name: 'Plan approved', exact: true }).waitFor()
  const seed = await read()
  await page.getByRole('navigation').getByRole('button', { name: 'Donations', exact: true }).click()
  await page.getByRole('button', { name: 'Sync Inbox', exact: true }).click()
  const review = page
    .getByRole('article', { name: offerSubject })
    .getByRole('button', { name: 'Review Donation', exact: true })
  await review.waitFor()
  await page.evaluate((k) => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === k) throw new DOMException('Test write failure', 'QuotaExceededError')
      return write.call(this, name, value)
    }
  }, key)
  await review.click()
  await page
    .locator('.toast')
    .filter({ hasText: /private change was not saved/ })
    .waitFor()
  assert.deepEqual(await read(), seed)
  await page.reload()
  await review.click()
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).proposals.length === 1, key)
  const imported = await read()
  assert.deepEqual(imported.lots, seed.lots)
  assert.deepEqual(imported.plans[imported.approvedId], seed.plans[seed.approvedId])
  assert.equal(imported.proposals[0].document.message.externalId, 'msg-chickpeas')
  await page.getByRole('button', { name: 'Sync Inbox', exact: true }).click()
  await page
    .getByRole('article', { name: offerSubject })
    .getByRole('button', { name: 'Open offer', exact: true })
    .waitFor()
  assert.equal((await read()).proposals.length, 1)
  console.log(
    'PASS private write failure after durable source claim, original inventory and approval preserved, same-ledger retry after reload imports one pending offer.',
  )
} finally {
  await browser?.close()
  await service.close()
}
