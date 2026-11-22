import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportedMail, InboxEntry, ProcessStage } from '../src/operator/contract.ts'
import { OperatorError, type Envelope, type ProviderMessage } from './provider.ts'

interface Row {
  id: string
  envelope: string
  owner: string | null
  stage: ProcessStage
  claimed: string | null
}
interface Checkpoint {
  address: string
  last_sync: string
  cursor: string | null
}
const stageNumber = { new: 0, imported: 1, reviewed: 2, received: 3 }

export class MailStore {
  private db: DatabaseSync
  private scope: string
  constructor(directory: string, scope: string) {
    mkdirSync(directory, { mode: 0o700, recursive: true })
    const file = join(directory, 'inbox.sqlite')
    closeSync(openSync(file, 'a', 0o600))
    chmodSync(file, 0o600)
    this.db = new DatabaseSync(file)
    this.scope = scope
    this.db.exec(`PRAGMA busy_timeout=2500;
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, scope TEXT NOT NULL, external_id TEXT NOT NULL, envelope TEXT NOT NULL,
        owner TEXT, stage TEXT NOT NULL DEFAULT 'new', claimed TEXT,
        UNIQUE(scope,external_id)
      );
      CREATE TABLE IF NOT EXISTS sweep_seen(scope TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS checkpoints(scope TEXT PRIMARY KEY,address TEXT NOT NULL,last_sync TEXT NOT NULL,cursor TEXT);`)
  }
  close() {
    this.db.close()
  }
  private transaction<T>(f: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = f()
      this.db.exec('COMMIT')
      return value
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  checkpoint(): Checkpoint | undefined {
    return this.db
      .prepare('SELECT address,last_sync,cursor FROM checkpoints WHERE scope=?')
      .get(this.scope) as unknown as Checkpoint | undefined
  }
  private id(messageId: string) {
    return createHash('sha256')
      .update(JSON.stringify([this.scope, messageId]))
      .digest('hex')
  }
  resetCursor(expected: string | null) {
    this.db
      .prepare('UPDATE checkpoints SET cursor=NULL WHERE scope=? AND cursor IS ?')
      .run(this.scope, expected)
  }
  savePage(
    address: string,
    rows: Envelope[],
    cursor: string | null,
    previousCursor: string | null,
  ) {
    this.transaction(() => {
      if ((this.checkpoint()?.cursor ?? null) !== previousCursor)
        throw new OperatorError(409, 'The inbox page changed in another session. Sync again.')
      if (!previousCursor) this.db.prepare('DELETE FROM sweep_seen WHERE scope=?').run(this.scope)
      const seen = this.db.prepare('INSERT OR IGNORE INTO sweep_seen(scope,id) VALUES(?,?)')
      const insert = this.db
        .prepare(`INSERT INTO messages(id,scope,external_id,envelope) VALUES(?,?,?,?)
        ON CONFLICT(scope,external_id) DO UPDATE SET envelope=excluded.envelope`)
      for (const env of rows) {
        const id = this.id(env.messageId)
        insert.run(id, this.scope, env.messageId, JSON.stringify(env))
        seen.run(this.scope, id)
      }
      if (!cursor) {
        const missing = this.db
          .prepare(
            'SELECT id,envelope FROM messages WHERE scope=? AND id NOT IN (SELECT id FROM sweep_seen WHERE scope=?)',
          )
          .all(this.scope, this.scope)
        for (const row of missing) {
          const env = JSON.parse(String(row.envelope)) as Envelope
          this.update(String(row.id), {
            ...env,
            subject: 'Content unavailable',
            preview: '',
            attachments: [],
            available: false,
            providerStatus: 'Unavailable',
          })
        }
      }
      const count = this.db
        .prepare('SELECT count(*) AS total FROM messages WHERE scope=?')
        .get(this.scope)!
      if (Number(count.total) > 5000)
        throw new OperatorError(
          507,
          'The local staging limit was reached. Use a dedicated donation inbox.',
        )
      this.db
        .prepare(
          `INSERT INTO checkpoints(scope,address,last_sync,cursor) VALUES(?,?,?,?)
        ON CONFLICT(scope) DO UPDATE SET address=excluded.address,last_sync=excluded.last_sync,cursor=excluded.cursor`,
        )
        .run(this.scope, address, new Date().toISOString(), cursor)
    })
  }
  private row(id: string): Row {
    const r = this.db
      .prepare('SELECT id,envelope,owner,stage,claimed FROM messages WHERE scope=? AND id=?')
      .get(this.scope, id)
    if (!r) throw new OperatorError(404, 'This inbox message was not found.')
    return r as unknown as Row
  }
  private entry(row: Row, env: Envelope = JSON.parse(row.envelope)): InboxEntry {
    return { ...env, id: row.id, offerId: 'ab-' + row.id, owner: row.owner, stage: row.stage }
  }
  entries(): InboxEntry[] {
    const rows = this.db
      .prepare('SELECT id,envelope,owner,stage FROM messages WHERE scope=?')
      .all(this.scope) as unknown as Row[]
    return rows
      .map((r) => this.entry(r))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id))
  }
  checkImport(id: string, ledger: string) {
    const entry = this.entry(this.row(id))
    if (entry.stage === 'received')
      throw new OperatorError(409, 'This donation already has a final receipt.')
    if (entry.owner && entry.owner !== ledger)
      throw new OperatorError(409, 'This message belongs to another operator ledger.')
    if (!entry.available)
      throw new OperatorError(
        409,
        'This message has no readable donation body. Sync again after its status changes.',
      )
    return entry
  }
  update(id: string, env: Envelope) {
    this.db
      .prepare('UPDATE messages SET envelope=? WHERE scope=? AND id=?')
      .run(JSON.stringify(env), this.scope, id)
  }
  claim(id: string, ledger: string, detail: ProviderMessage): ImportedMail {
    return this.transaction(() => {
      this.checkImport(id, ledger)
      const row = this.row(id)
      if (row.claimed) {
        const original = JSON.parse(row.claimed) as ProviderMessage
        if (
          original.text !== detail.text ||
          original.entry.sender !== detail.entry.sender ||
          original.entry.subject !== detail.entry.subject ||
          original.entry.receivedAt !== detail.entry.receivedAt
        )
          throw new OperatorError(
            409,
            'The provider message changed after import. Keep the previously captured offer.',
          )
        return { entry: this.entry(row, original.entry), text: original.text }
      }
      this.db
        .prepare(
          "UPDATE messages SET owner=?,stage='imported',claimed=?,envelope=? WHERE scope=? AND id=?",
        )
        .run(ledger, JSON.stringify(detail), JSON.stringify(detail.entry), this.scope, id)
      return { entry: this.entry(this.row(id)), text: detail.text }
    })
  }
  stage(id: string, ledger: string, next: 'reviewed' | 'received') {
    this.transaction(() => {
      const row = this.row(id)
      if (row.owner !== ledger)
        throw new OperatorError(
          409,
          'Only the ledger that imported this message can report its progress.',
        )
      if (stageNumber[next] <= stageNumber[row.stage]) return
      if (stageNumber[next] !== stageNumber[row.stage] + 1)
        throw new OperatorError(409, 'Mark the locally reviewed offer before recording a receipt.')
      this.db
        .prepare('UPDATE messages SET stage=? WHERE scope=? AND id=?')
        .run(next, this.scope, id)
    })
  }
}
