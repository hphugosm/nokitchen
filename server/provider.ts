import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'
import type { InboxEntry } from '../src/operator/contract.ts'

export class OperatorError extends Error {
  status: number
  retryAt: number
  constructor(status: number, message: string, retryAt = 0) {
    super(message)
    this.status = status
    this.retryAt = retryAt
  }
}
export class ProviderReadError extends OperatorError {
  remoteStatus: number
  constructor(remoteStatus: number, status: number, message: string) {
    super(status, message)
    this.remoteStatus = remoteStatus
  }
}
const invalidProvider = () =>
  new OperatorError(502, 'Agentboxd returned an invalid or oversized response.')
export type Envelope = Pick<
  InboxEntry,
  | 'messageId'
  | 'inboxId'
  | 'sender'
  | 'subject'
  | 'receivedAt'
  | 'preview'
  | 'attachments'
  | 'providerStatus'
  | 'available'
>
export interface ProviderMessage {
  entry: Envelope
  text: string
}
export interface ProviderConfig {
  inbox: string
  base: string
  key: string
}
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
export function configuration(env: NodeJS.ProcessEnv): ProviderConfig | null {
  const inbox = env.AGENTBOXD_INBOX_ID?.trim(),
    key = env.AGENTBOXD_API_KEY?.trim()
  if (!inbox || !key) return null
  const invalid = () => new OperatorError(503, 'Check the local provider base URL and inbox ID.')
  let base: URL
  try {
    base = new URL(env.AGENTBOXD_BASE_URL?.trim() || 'https://api.agentboxd.com')
  } catch {
    throw invalid()
  }
  const allowed =
    base.origin === 'https://api.agentboxd.com' ||
    (base.protocol === 'http:' && base.hostname === '127.0.0.1')
  if (
    !allowed ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !idPattern.test(inbox) ||
    /[\s\x00-\x1f]/.test(key)
  )
    throw invalid()
  return { base: base.origin, inbox, key }
}

const asObject = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalidProvider()
  return v as Record<string, unknown>
}
const clean = (value: unknown, limit: number) =>
  typeof value === 'string'
    ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, limit)
    : ''
const label = (value: unknown, limit: number) => clean(value, limit).replace(/\s+/g, ' ').trim()

// Parse as inert data. Ignore embedded resources, attribute URLs, code and hidden markup.
function htmlText(html: string): string {
  if (html.length > 128_000) return ''
  const root = parseFragment(html)
  const stack: (DefaultTreeAdapterTypes.ChildNode | string)[] = [...root.childNodes].reverse()
  const output: string[] = []
  const omit = new Set([
    'script',
    'style',
    'template',
    'noscript',
    'head',
    'svg',
    'math',
    'iframe',
    'object',
    'canvas',
    'audio',
    'video',
  ])
  const blocks = new Set([
    'br',
    'p',
    'div',
    'section',
    'article',
    'li',
    'tr',
    'h1',
    'h2',
    'h3',
    'h4',
    'blockquote',
  ])
  while (stack.length) {
    const n = stack.pop()!
    if (typeof n === 'string') {
      output.push(n)
      continue
    }
    if (n.nodeName === '#text' && 'value' in n) {
      output.push(n.value)
      continue
    }
    if (
      !('tagName' in n) ||
      omit.has(n.tagName) ||
      n.attrs.some((a) => a.name === 'hidden' || (a.name === 'aria-hidden' && a.value === 'true'))
    )
      continue
    if (blocks.has(n.tagName)) {
      output.push('\n')
      stack.push('\n')
    }
    for (let i = n.childNodes.length - 1; i >= 0; i--) stack.push(n.childNodes[i])
  }
  return output
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n(?: *\n)* */g, '\n')
    .trim()
}

function readMessage(raw: unknown, inbox: string, detailId?: string): ProviderMessage {
  const m = asObject(raw)
  if (
    typeof m.id !== 'string' ||
    !idPattern.test(m.id) ||
    m.inbox_id !== inbox ||
    m.direction !== 'inbound' ||
    (detailId && m.id !== detailId)
  )
    throw invalidProvider()
  const date = typeof m.received_at === 'string' ? m.received_at : m.created_at
  if (typeof date !== 'string' || date.length > 64 || !Number.isFinite(Date.parse(date)))
    throw invalidProvider()
  const screening =
    m.screening && typeof m.screening === 'object'
      ? (m.screening as { state?: unknown }).state
      : undefined
  const permitted =
    (screening === 'screened' || screening === 'released') && !m.withheld && m.status === 'received'
  const entry: Envelope = {
    messageId: m.id,
    inboxId: inbox,
    sender: label(m.from, 320),
    receivedAt: new Date(date).toISOString(),
    subject: 'Content unavailable',
    providerStatus:
      screening === 'held' ? 'Held' : screening === 'pending' ? 'Pending screening' : 'Unavailable',
    available: false,
    attachments: [],
    preview: '',
  }
  if (!permitted) return { entry, text: '' }
  entry.subject = label(m.subject, 240) || '(No subject)'
  entry.attachments = (Array.isArray(m.attachments) ? m.attachments : [])
    .slice(0, 32)
    .map((raw) => {
      const a = asObject(raw)
      return {
        name: label(a.filename, 180) || 'Unnamed attachment',
        contentType: label(a.content_type, 100) || undefined,
        size:
          Number.isSafeInteger(a.size_bytes) && Number(a.size_bytes) >= 0
            ? Number(a.size_bytes)
            : undefined,
      }
    })
  const source =
    typeof m.text === 'string' && m.text.trim()
      ? m.text
      : typeof m.html === 'string'
        ? htmlText(m.html)
        : ''
  if (source.length > 16_000 || (detailId && m.body_truncated === true)) {
    entry.providerStatus = 'Body exceeds the import limit'
    return { entry, text: '' }
  }
  const text = clean(source, 16_000)
  if (!text.trim()) {
    entry.providerStatus = 'No importable text'
    return { entry, text: '' }
  }
  const reason =
    m.screening && typeof m.screening === 'object'
      ? (m.screening as { reason?: unknown }).reason
      : null
  const noScan =
    reason === 'ai_off'
      ? 'AI screening off'
      : reason === 'not_available'
        ? 'screening unavailable'
        : reason === 'not_applicable'
          ? 'screening not applicable'
          : null
  entry.available = true
  entry.providerStatus =
    screening === 'released' ? 'Released' : noScan ? 'Readable · ' + noScan : 'Screened'
  entry.preview = label(text, 240)
  return { entry, text }
}

async function boundedJson(response: Response, max: number): Promise<unknown> {
  if (!response.body || Number(response.headers.get('content-length') || 0) > max) {
    await response.body?.cancel()
    throw invalidProvider()
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) {
        await reader.cancel()
        throw invalidProvider()
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (e) {
    if (e instanceof OperatorError) throw e
    throw invalidProvider()
  }
}
export class Agentboxd {
  config: ProviderConfig
  private http: typeof fetch
  private retryAt = 0
  constructor(config: ProviderConfig, http: typeof fetch = fetch) {
    this.config = config
    this.http = http
  }
  private async get(path: string, max: number) {
    if (this.retryAt > Date.now())
      throw new OperatorError(
        429,
        'Agentboxd is rate limiting requests. Try again after the indicated wait.',
        this.retryAt,
      )
    const timeout = AbortSignal.timeout(6_000)
    try {
      const response = await this.http(this.config.base + path, {
        method: 'GET',
        headers: { authorization: 'Bearer ' + this.config.key, accept: 'application/json' },
        redirect: 'error',
        signal: timeout,
      })
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status === 429) {
          const retry = response.headers.get('retry-after') ?? ''
          const seconds = /^\d+$/.test(retry)
            ? Number(retry)
            : Math.ceil((Date.parse(retry) - Date.now()) / 1000)
          const delay = Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 86400)) : 60
          this.retryAt = Date.now() + delay * 1000
          throw new OperatorError(
            429,
            'Agentboxd rate limit. Try syncing again in ' + delay + ' seconds.',
            this.retryAt,
          )
        }
        if (response.status === 401 || response.status === 403)
          throw new ProviderReadError(
            response.status,
            502,
            'Agentboxd denied access. Check the inbox-scoped key and read permissions.',
          )
        if (response.status === 404 || response.status === 409)
          throw new ProviderReadError(
            response.status,
            response.status,
            'The provider item is unavailable or withheld.',
          )
        throw new ProviderReadError(
          response.status,
          502,
          'Agentboxd could not complete this read. Try again later.',
        )
      }
      return await boundedJson(response, max)
    } catch (e) {
      if (timeout.aborted) throw new OperatorError(504, 'Agentboxd timed out. Try again later.')
      if (e instanceof OperatorError) throw e
      throw new OperatorError(502, 'Could not reach the configured Agentboxd service.')
    }
  }
  async address() {
    const inbox = asObject(
      await this.get('/v1/inboxes/' + encodeURIComponent(this.config.inbox), 64_000),
    )
    if (
      inbox.id !== this.config.inbox ||
      inbox.kind === 'identity' ||
      typeof inbox.address !== 'string' ||
      !inbox.address.trim()
    )
      throw invalidProvider()
    return label(inbox.address, 320)
  }
  async page(cursor: string | null) {
    const query = new URLSearchParams({ direction: 'inbound', limit: '25' })
    if (cursor) query.set('cursor', cursor)
    const p = asObject(
      await this.get(
        '/v1/inboxes/' + encodeURIComponent(this.config.inbox) + '/messages?' + query,
        12_000_000,
      ),
    )
    if (
      !Array.isArray(p.data) ||
      p.data.length > 25 ||
      !(
        p.next_cursor === null ||
        (typeof p.next_cursor === 'string' &&
          p.next_cursor.length > 0 &&
          p.next_cursor.length <= 2048)
      )
    )
      throw invalidProvider()
    return { rows: p.data.map((m) => readMessage(m, this.config.inbox).entry), next: p.next_cursor }
  }
  async detail(id: string) {
    if (!idPattern.test(id)) throw invalidProvider()
    return readMessage(
      await this.get('/v1/messages/' + encodeURIComponent(id), 512_000),
      this.config.inbox,
      id,
    )
  }
}
