// Verify a *deployed* public URL against this checkout's built dist, then drive it in fresh profiles.
// The local project's package.json, index metadata, assets and standalone must describe the same release.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const base = new URL(process.argv[2] || process.env.NOKITCHEN_URL)
assert.ok(base.protocol === 'https:' && !base.username && !base.password, 'Use the public HTTPS URL')
assert.ok(base.pathname.endsWith('/') && !base.hash && !base.search, 'Use the project root with a trailing slash')
const dist = join(root, 'dist')
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const files = [base.href]
const hashes = {}
for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
  if (entry.isDirectory()) continue
  assert.ok(entry.isFile(), 'Only static files belong in the distribution')
  const path = join(entry.parentPath, entry.name)
  const name = relative(dist, path)
  const url = new URL(name, base).href
  const res = await fetch(url, { redirect: 'error', cache: 'no-store' })
  assert.equal(res.status, 200, name + ' HTTP status')
  hashes[name] = digest(await readFile(path))
  assert.equal(digest(Buffer.from(await res.arrayBuffer())), hashes[name], name + ' public bytes')
  files.push(url)
}
const index = await fetch(base, { redirect: 'error', cache: 'no-store' })
assert.equal(index.status, 200)
assert.equal(digest(Buffer.from(await index.arrayBuffer())), hashes['index.html'], 'Project root bytes')
const env = { ...process.env, NOKITCHEN_URL: base.href, NOKITCHEN_PUBLIC_FILES: JSON.stringify(files) }
for (const script of ['tests/pages-navigation.mjs', 'tests/walkthrough.mjs', 'tests/donation-decision.mjs', 'tests/guided.mjs']) {
  await new Promise((ok, fail) => {
    const child = execFile(process.execPath, [script], { cwd: root, env })
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.once('error', fail)
    child.once('exit', (code) => code === 0 ? ok() : fail(Error(script + ' exited ' + code)))
  })
}
let comparedCheckout = null
try {
  const top = await run('git', ['rev-parse', '--show-toplevel'], { cwd: root })
  if (resolve(top.stdout.trim()) === resolve(root)) {
    const head = await run('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root })
    comparedCheckout = head.stdout.trim()
  }
} catch {
  // Extracted source archives have no Git metadata. The mandatory byte and browser checks still apply.
}
console.log(JSON.stringify({ url: base.href, version, comparedCheckout, staticSHA256: hashes }))
