import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ttl = 12 * 60 * 60 * 1000
const secret = () => randomBytes(32).toString('hex')
export class Pairing {
  private directory: string
  private port = 0
  private link = ''
  private sessions = new Map<string, number>()
  constructor(directory: string) {
    this.directory = directory
  }
  start(port: number) {
    this.port = port
    this.rotate()
  }
  private rotate() {
    const token = secret()
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const tmp = join(this.directory, '.operator-link-' + randomBytes(8).toString('hex'))
    writeFileSync(tmp, 'http://127.0.0.1:' + this.port + '/open/' + token + '\n', {
      mode: 0o600,
      flag: 'wx',
    })
    renameSync(tmp, join(this.directory, 'operator-link.txt'))
    this.link = token
  }
  redeem(candidate: string): string | null {
    if (
      !this.link ||
      candidate.length !== 64 ||
      !/^[a-f0-9]+$/.test(candidate) ||
      !timingSafeEqual(Buffer.from(candidate), Buffer.from(this.link))
    )
      return null
    this.rotate()
    const now = Date.now()
    for (const [session, expires] of this.sessions)
      if (expires <= now) this.sessions.delete(session)
    if (this.sessions.size >= 64) this.sessions.delete(this.sessions.keys().next().value!)
    const session = secret()
    this.sessions.set(session, now + ttl)
    return (
      this.cookieName() +
      '=' +
      session +
      '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' +
      ttl / 1000
    )
  }
  private cookieName() {
    return 'nokitchen_operator_' + this.port
  }
  authenticated(cookie: string | undefined) {
    const prefix = this.cookieName() + '='
    const value = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(prefix))
      ?.slice(prefix.length)
    return !!value && (this.sessions.get(value) ?? 0) > Date.now()
  }
}
