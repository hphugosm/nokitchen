import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join, resolve, sep, extname } from 'node:path'
import { Agentboxd, configuration, OperatorError } from './provider.ts'
import { MailStore } from './staging.ts'
import { Inbox } from './inbox.ts'
import { Pairing } from './pairing.ts'

const dataDirectory = (env: NodeJS.ProcessEnv) =>
  resolve(env.NOKITCHEN_DATA_DIR || join(homedir(), '.nokitchen', 'operator'))

export function configuredInbox(env: NodeJS.ProcessEnv): Inbox {
  try {
    const config = configuration(env)
    if (!config) return new Inbox(null, null)
    const root = dataDirectory(env)
    const store = new MailStore(root, JSON.stringify([config.base, config.inbox]))
    return new Inbox(new Agentboxd(config), store)
  } catch (e) {
    return new Inbox(
      null,
      null,
      e instanceof OperatorError ? e.message : 'Private staging storage could not be opened.',
    )
  }
}
const staticRoot = fileURLToPath(new URL('../dist-operator/', import.meta.url))
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}
async function payload(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new OperatorError(415, 'Use an application/json request.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 2048) throw new OperatorError(413, 'The local request is too large.')
    chunks.push(chunk)
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error()
    return v
  } catch {
    throw new OperatorError(400, 'Enter a valid JSON object.')
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function serve(
  req: IncomingMessage,
  res: ServerResponse,
  inbox: Inbox,
  root: string,
  pairing: Pairing,
) {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('cross-origin-resource-policy', 'same-origin')
  res.setHeader(
    'content-security-policy',
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  )
  const host = '127.0.0.1:' + req.socket.localPort
  if (
    req.socket.remoteAddress !== '127.0.0.1' ||
    req.headers.host !== host ||
    (req.headers.origin !== undefined && req.headers.origin !== 'http://' + host)
  )
    throw new OperatorError(403, 'Only the local operator origin can access this application.')
  const path = req.url ?? ''
  if (req.method === 'GET' && path.startsWith('/open/')) {
    const cookie = pairing.redeem(path.slice(6))
    if (!cookie)
      throw new OperatorError(
        401,
        'Use the current operator-link.txt from the private data directory.',
      )
    res.writeHead(303, { 'set-cookie': cookie, location: '/' })
    res.end()
    return
  }
  if (!pairing.authenticated(req.headers.cookie)) {
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html lang="en"><title>NoKitchen operator sign-in</title><main><h1>Open the private operator link</h1><p>Open operator-link.txt in your private NoKitchen data directory and visit its local address in this browser.</p></main></html>',
      )
      return
    }
    throw new OperatorError(401, 'Open the current private operator link to sign in.')
  }
  if (path.startsWith('/api/')) {
    if (
      req.headers['x-nokitchen-operator'] !== '1' ||
      (req.headers['sec-fetch-site'] !== undefined &&
        req.headers['sec-fetch-site'] !== 'same-origin') ||
      (req.method === 'POST' && req.headers.origin !== 'http://' + host)
    )
      throw new OperatorError(403, 'Open the local operator application to use the private inbox.')
    if (req.method === 'GET' && path === '/api/inbox') return json(res, 200, inbox.view())
    if (req.method !== 'POST') throw new OperatorError(405, 'This request method is unavailable.')
    const body = await payload(req)
    if (path === '/api/inbox/sync' && !Object.keys(body).length)
      return json(res, 200, await inbox.sync())
    const m = path.match(/^\/api\/inbox\/messages\/([a-f0-9]{64})\/(import|stage)$/)
    if (!m) throw new OperatorError(404, 'Unknown operator endpoint.')
    if (typeof body.ledgerId !== 'string' || !uuid.test(body.ledgerId))
      throw new OperatorError(400, 'A valid operator ledger is required.')
    if (m[2] === 'import' && Object.keys(body).length === 1)
      return json(res, 200, await inbox.import(m[1], body.ledgerId))
    if (
      m[2] === 'stage' &&
      Object.keys(body).length === 2 &&
      (body.stage === 'reviewed' || body.stage === 'received')
    ) {
      inbox.stage(m[1], body.ledgerId, body.stage)
      return json(res, 200, { ok: true })
    }
    throw new OperatorError(400, 'Invalid operator command.')
  }
  if (req.method !== 'GET' && req.method !== 'HEAD')
    throw new OperatorError(405, 'This request method is unavailable.')
  const route = path.split('?')[0]
  const asset =
    route === '/' || route === '/index.html'
      ? 'index.html'
      : /^\/assets\/[a-zA-Z0-9_-]+\.(css|js|woff2|png|svg)$/.test(route)
        ? route.slice(1)
        : null
  if (!asset) throw new OperatorError(404, 'Asset not found.')
  let file: Buffer
  try {
    const dir = await realpath(root),
      resolved = await realpath(join(dir, asset))
    if (!resolved.startsWith(dir + sep)) throw Error()
    file = await readFile(resolved)
  } catch {
    throw new OperatorError(404, 'Operator build unavailable. Build the private application first.')
  }
  res.writeHead(200, { 'content-type': mime[extname(asset)], 'content-length': file.length })
  res.end(req.method === 'HEAD' ? undefined : file)
}

export function operatorServer(inbox: Inbox, directory: string, root = staticRoot) {
  const pairing = new Pairing(directory)
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 12_000, headersTimeout: 8_000 },
    (req, res) => {
      serve(req, res, inbox, root, pairing).catch((e) => {
        if (res.destroyed || res.writableEnded) return
        if (e instanceof OperatorError && e.retryAt > 0)
          res.setHeader('retry-after', Math.max(1, Math.ceil((e.retryAt - Date.now()) / 1000)))
        json(res, e instanceof OperatorError ? e.status : 500, {
          error:
            e instanceof OperatorError
              ? e.message
              : 'The local operator request could not be completed.',
        })
      })
    },
  )
  server.on('listening', () => {
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('A loopback TCP port is required.')
    try {
      pairing.start(address.port)
    } catch {
      server.close()
      throw Error('Could not write the private sign-in link. Check the local data directory.')
    }
  })
  server.on('close', () => inbox.close())
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077)
  const port = Number(process.env.NOKITCHEN_PORT ?? 4314)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Choose a valid local operator port.')
  const server = operatorServer(configuredInbox(process.env), dataDirectory(process.env))
  server.on('error', () => {
    console.error('Could not start the local operator service. Check the configured port.')
    process.exitCode = 1
  })
  server.listen(port, '127.0.0.1', () =>
    console.log(
      'NoKitchen operator on http://127.0.0.1:' +
        port +
        '. Open operator-link.txt in the private data directory to sign in.',
    ),
  )
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close())
}
