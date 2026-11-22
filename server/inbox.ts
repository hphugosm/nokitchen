import type { InboxView } from '../src/operator/contract.ts'
import { Agentboxd, OperatorError, ProviderReadError } from './provider.ts'
import { MailStore } from './staging.ts'

export class Inbox {
  private provider: Agentboxd | null
  private store: MailStore | null
  private connection: InboxView['connection']
  private error: string | null
  private syncing: Promise<InboxView> | null = null
  constructor(
    provider: Agentboxd | null,
    store: MailStore | null,
    configurationError: string | null = null,
  ) {
    this.provider = provider
    this.store = store
    this.error = configurationError
    this.connection = configurationError ? 'Error' : provider ? 'Unchecked' : 'Unconfigured'
  }
  view(): InboxView {
    const checkpoint = this.store?.checkpoint()
    return {
      connection: this.connection,
      hasMore: !!checkpoint?.cursor,
      error: this.error,
      lastSync: checkpoint?.last_sync ?? null,
      address: checkpoint?.address ?? null,
      messages: this.store?.entries() ?? [],
    }
  }
  private ready() {
    if (!this.provider || !this.store)
      throw new OperatorError(
        503,
        this.error ?? 'Configure the provider key and inbox in the local server environment.',
      )
    return { provider: this.provider, store: this.store }
  }
  async sync(): Promise<InboxView> {
    if (this.syncing) return this.syncing
    const { provider, store } = this.ready()
    this.syncing = (async () => {
      try {
        const address = await provider.address(),
          visited = new Set<string>()
        let cursor = store.checkpoint()?.cursor ?? null
        for (let i = 0; i < 5; i++) {
          if (cursor) visited.add(cursor)
          let page
          try {
            page = await provider.page(cursor)
          } catch (e) {
            if (cursor && e instanceof ProviderReadError && e.remoteStatus === 400)
              store.resetCursor(cursor)
            throw e
          }
          if (page.next && visited.has(page.next)) {
            store.resetCursor(cursor)
            throw new OperatorError(
              502,
              'Agentboxd repeated a page cursor. Retry synchronization later.',
            )
          }
          store.savePage(address, page.rows, page.next, cursor)
          if (!page.next) break
          cursor = page.next
        }
        this.connection = 'Connected'
        this.error = null
        return this.view()
      } catch (e) {
        this.connection = 'Error'
        this.error =
          e instanceof OperatorError
            ? e.message
            : 'Could not stage the inbox. Check private storage and retry.'
        throw e
      } finally {
        this.syncing = null
      }
    })()
    return this.syncing
  }
  async import(id: string, ledger: string) {
    const { provider, store } = this.ready()
    const listed = store.checkImport(id, ledger)
    try {
      const detail = await provider.detail(listed.messageId)
      if (!detail.entry.available) {
        store.update(id, detail.entry)
        throw new OperatorError(
          409,
          'The provider no longer offers an importable body for this message.',
        )
      }
      return store.claim(id, ledger, detail)
    } catch (e) {
      if (e instanceof ProviderReadError && (e.remoteStatus === 404 || e.remoteStatus === 409))
        store.update(id, {
          ...listed,
          subject: 'Content unavailable',
          attachments: [],
          preview: '',
          available: false,
          providerStatus: 'Unavailable',
        })
      if (e instanceof OperatorError && (e.status >= 500 || e.status === 429)) {
        this.connection = 'Error'
        this.error = e.message
      }
      throw e
    }
  }
  stage(id: string, ledger: string, stage: 'reviewed' | 'received') {
    this.ready().store.stage(id, ledger, stage)
  }
  close() {
    this.store?.close()
  }
}
