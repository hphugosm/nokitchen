// Inspect the files that Pages will publish. Findings identify a class, never a matched value.
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv, promisify } from 'node:util'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const keys = [
  'AGENTBOXD_API_KEY',
  'AGENTBOXD_INBOX_ID',
  'AGENTBOXD_BASE_URL',
  'NOKITCHEN_PRIVATE_EMAIL_SENTINEL',
  'NOKITCHEN_PRIVATE_BODY_SENTINEL',
  'VITE_AGENTBOXD_API_KEY',
  'VITE_AGENTBOXD_INBOX_ID',
  'VITE_AGENTBOXD_BASE_URL',
]
const rules = [
  /\b(?:AGENTBOXD_API_KEY|AGENTBOXD_INBOX_ID|AGENTBOXD_BASE_URL|NOKITCHEN_DATA_DIR)\b/i,
  /(?:\/api\/inbox\b|api\.agentboxd\.com|\/v1\/(?:messages|inboxes)\b|X-NoKitchen-Operator|nokitchen_operator_|nokitchen\.operator\.ledger)/i,
  /(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|\[::1\])\b/i,
  /(?:src\/operator\/|dist-operator\/|NOKITCHEN_PRIVATE_(?:BODY|EMAIL)_SENTINEL)/i,
  /(?:fixture-private-donor@fixtures\.invalid|nk-private-mail-fixture-v14)/i,
]
const allowed =
  /^(?:index\.html|NoKitchen-1\.4\.html|assets\/[\w.-]+\.(?:js(?:\.map)?|css(?:\.map)?|woff2))$/
const fingerprint = (data) => createHash('sha256').update(data).digest('hex')

async function settings() {
  const sources = [process.env]
  for (const name of ['.env', '.env.local', '.env.operator', '.env.operator.local']) {
    try {
      sources.push(parseEnv(await readFile(join(root, name), 'utf8')))
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error('Could not inspect a local environment file safely.')
    }
  }
  return [...new Set(sources.flatMap((source) => keys.map((key) => source[key]).filter(Boolean)))]
}

function checkContent(bytes, values) {
  const text = bytes.toString('utf8')
  for (const value of values) {
    const variants = [
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
      Buffer.from(value).toString('base64'),
    ]
    if (variants.some((v) => v && text.includes(v)))
      throw Error('A configured private value appeared in public output.')
  }
  if (rules.some((r) => r.test(text)))
    throw Error('Private configuration, endpoint, or inbox fixture appeared in public output.')
}

async function scan(dir, values) {
  const manifest = new Map()
  async function visit(prefix) {
    for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
      const name = prefix + entry.name
      checkContent(Buffer.from(name), values)
      if (entry.isSymbolicLink()) throw Error('Public output contains a symbolic link.')
      if (entry.isDirectory() && name === 'assets') {
        await visit(name + '/')
        continue
      }
      if (!entry.isFile() || !allowed.test(name))
        throw Error('Public output includes a file outside the static release layout.')
      const bytes = await readFile(join(dir, name))
      checkContent(bytes, values)
      manifest.set(name, fingerprint(bytes))
    }
  }
  if (!(await lstat(dir)).isDirectory()) throw Error('Expected a static build directory.')
  await visit('')
  if (!manifest.has('index.html') || !manifest.has('NoKitchen-1.4.html'))
    throw Error('The public build is missing its Pages entry or standalone.')
  return manifest
}

async function prove(dir, manifest, configured) {
  const tmp = await mkdtemp(join(tmpdir(), 'nokitchen-public-'))
  try {
    const token = () => randomBytes(32).toString('hex')
    const sentinels = {
      AGENTBOXD_API_KEY: 'qa_key_' + token(),
      AGENTBOXD_INBOX_ID: 'qa_inbox_' + token(),
      AGENTBOXD_BASE_URL: 'https://' + token() + '.invalid',
      NOKITCHEN_PRIVATE_EMAIL_SENTINEL: 'qa-' + token() + '@example.invalid',
      NOKITCHEN_PRIVATE_BODY_SENTINEL: 'qa_body_' + token(),
      VITE_AGENTBOXD_API_KEY: 'qa_client_' + token(),
    }
    const out = join(tmp, 'dist')
    const env = { ...process.env, ...sentinels }
    try {
      await run(
        process.execPath,
        [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out],
        { cwd: root, env },
      )
      await run(process.execPath, [join(root, 'scripts/offline.mjs'), out], { cwd: root, env })
    } catch {
      throw Error('Isolated public proof build failed. No private configuration was logged.')
    }
    const values = [...configured, ...Object.values(sentinels)]
    const proof = await scan(out, values)
    if (
      proof.size !== manifest.size ||
      [...proof].some(([path, hash]) => manifest.get(path) !== hash)
    )
      throw Error(
        'The challenged public build differs from the delivery. Rebuild the public release and retry.',
      )
    // Plant an actual secret in each relevant public file class, outside the release directory.
    const probes = [
      ['index.html', sentinels.AGENTBOXD_API_KEY],
      ['assets/test.js', sentinels.AGENTBOXD_INBOX_ID],
      ['assets/test.js.map', sentinels.NOKITCHEN_PRIVATE_BODY_SENTINEL],
      ['assets/font.woff2', sentinels.NOKITCHEN_PRIVATE_EMAIL_SENTINEL],
      ['assets/endpoint.js', '/api/inbox/sync'],
      ['private/inbox.sqlite', 'fixture'],
    ]
    for (const [path, content] of probes) {
      const full = join(out, path)
      await mkdir(join(full, '..'), { recursive: true })
      const original = path === 'index.html' ? await readFile(full) : null
      await writeFile(full, content)
      let rejected = false
      try {
        await scan(out, values)
      } catch {
        rejected = true
      }
      if (!rejected) throw Error('The public guard failed to reject a synthetic contamination.')
      if (original) await writeFile(full, original)
      else if (path.startsWith('private/')) await rm(join(out, 'private'), { recursive: true })
      else await rm(full)
    }
    console.log(
      'An isolated build with six private sentinels matched every delivered byte. All six contamination probes were rejected.',
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

const args = process.argv.slice(2)
const dir = resolve(args.find((arg) => !arg.startsWith('--')) || join(root, 'dist'))
try {
  const configured = await settings()
  const manifest = await scan(dir, configured)
  console.log(
    'Public release checked: ' +
      manifest.size +
      ' static files, ' +
      [...manifest.keys()].filter((p) => p.endsWith('.map')).length +
      ' source maps. Supplied backend configuration values were checked without printing them.',
  )
  if (args.includes('--prove')) await prove(dir, manifest, configured)
} catch (error) {
  // An OS error can contain a path originating from untrusted content.
  console.error(
    error.code
      ? 'Public release inspection failed while accessing the static build.'
      : error.message,
  )
  process.exitCode = 1
}
