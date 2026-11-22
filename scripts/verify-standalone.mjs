// Verify the delivered bytes with fresh profiles. The loopback fallback serves one HTML file only.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const executablePath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)

/** Use per-workflow profiles for ordinary dev E2E and the standalone cold-start test. */
export async function workflowBrowser(viewport) {
  const browser = await chromium.launch({ executablePath, headless: true })
  const guarded = process.env.NOKITCHEN_COLD === '1'
  const url = process.env.NOKITCHEN_URL || 'http://127.0.0.1:5173/'
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
  const page = await context.newPage()
  const blocked = []
  let documents = 0
  if (guarded) {
    const fileMode = url.startsWith('file:')
    if (fileMode) await context.setOffline(true)
    const client = await context.newCDPSession(page)
    await client.send('Network.enable')
    await client.send('Network.setCacheDisabled', { cacheDisabled: true })
    // Installed on an empty context, before the first navigation, including before scripts or fonts run.
    await context.route('**/*', async (route) => {
      const req = route.request()
      if (
        req.method() === 'GET' &&
        req.url().split('#')[0] === url &&
        req.isNavigationRequest() &&
        req.frame() === page.mainFrame()
      ) {
        documents++
        await route.continue()
      } else {
        blocked.push(req.method() + ' ' + req.resourceType())
        await route.abort('blockedbyclient')
      }
    })
    await context.routeWebSocket('**/*', (socket) => {
      blocked.push('WebSocket')
      socket.close()
    })
  }
  return {
    browser,
    page,
    url,
    async close() {
      await browser.close()
      if (guarded) {
        assert.deepEqual(blocked, [], 'The standalone tried to access another resource')
        console.log(
          'Cold profile: ' +
            documents +
            ' document navigation(s), zero subresource or WebSocket attempts.',
        )
      }
    },
  }
}

async function directFileProbe(fileUrl) {
  const browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block' })
  await context.route(/^https?:/, (route) => route.abort('blockedbyclient'))
  try {
    const page = await context.newPage()
    try {
      await page.goto(fileUrl)
    } catch (e) {
      // Only an observed browser policy denial licenses the HTTP fallback. A broken bundle fails normally.
      if (!String(e.message).includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw e
      return {
        available: false,
        reason: 'Chromium denied file navigation with ERR_BLOCKED_BY_ADMINISTRATOR.',
      }
    }
    await page.getByRole('heading', { name: 'Weekly plan', exact: true }).waitFor({ timeout: 8000 })
    await page.getByText('Demo Mode — Simulated data', { exact: true }).first().waitFor()
    return { available: true }
  } finally {
    await browser.close()
  }
}

async function main() {
  const path = resolve(process.argv[2] || resolve(root, 'dist/NoKitchen-1.4.html'))
  const html = await readFile(path)
  const fileUrl = pathToFileURL(path).href
  const direct = await directFileProbe(fileUrl)
  let server
  let url = fileUrl
  let served = 0
  const unexpected = []
  if (!direct.available) {
    const documentPath = '/' + encodeURIComponent(basename(path))
    server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== documentPath) {
        unexpected.push(req.method + ' unexpected path')
        res.writeHead(404)
        res.end()
        return
      }
      served++
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(html)
    })
    await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
    url = 'http://127.0.0.1:' + server.address().port + documentPath
  }
  try {
    console.log(
      'Artifact ' + basename(path) + ', SHA-256 ' + createHash('sha256').update(html).digest('hex'),
    )
    console.log(
      direct.available
        ? 'Cold file:// launch under offline emulation.'
        : direct.reason +
            ' Cold-start fallback permits only navigation to the loopback HTML document, including explicit reloads.',
    )
    for (const script of [
      'tests/walkthrough.mjs',
      'tests/donation-decision.mjs',
      'tests/guided.mjs',
      'tests/storage-browser.mjs',
    ]) {
      const { stdout, stderr } = await run(process.execPath, [script], {
        cwd: root,
        env: { ...process.env, NOKITCHEN_URL: url, NOKITCHEN_COLD: '1' },
      })
      process.stdout.write(stdout)
      process.stderr.write(stderr)
    }
    assert.deepEqual(unexpected, [])
    if (server)
      console.log(
        'Static server received ' +
          served +
          ' HTML GET requests including explicit reloads. No other requests reached the server.',
      )
  } finally {
    if (server) await new Promise((ok) => server.close(ok))
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
