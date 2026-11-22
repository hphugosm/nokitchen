import { useCallback, useEffect, useRef, useState } from 'react'
import { Inbox, Mail, Paperclip, RefreshCw } from 'lucide-react'
import { getInbox, importMail, ledgerId, syncInbox } from '../operator/client'
import type { InboxEntry, InboxView } from '../operator/contract'
import type { DonationOffer } from '../domain/types'
import { Chip, pretty, useWork } from './shared'

export interface InboxAccess {
  view: InboxView
  owner: string | null
}
export function sourceBlock(
  entry: InboxEntry | undefined,
  offer: DonationOffer | undefined,
  owner: string | null,
  storageWarning: string | null,
) {
  if (!entry)
    return 'The local inbox has not verified this message. Refresh the inbox before continuing.'
  if (!owner || (storageWarning && offer?.status !== 'received'))
    return 'Live donations need writable local storage for this workspace.'
  if (entry.owner && entry.owner !== owner)
    return 'This message belongs to another local workspace.'
  const source = offer?.document?.message
  if (
    offer &&
    (source?.kind !== 'agentboxd' ||
      source.externalId !== entry.messageId ||
      source.inboxId !== entry.inboxId ||
      source.stagingId !== entry.id)
  )
    return 'The saved offer has different source identifiers. Open the matching workspace.'
  if (entry.stage === 'received' && (!offer?.receipt || offer.status !== 'received'))
    return 'The inbox has a final receipt for this message. This workspace has no matching receipt.'
  if (offer?.status === 'received') return null
  if (!entry.available) return 'This message is unavailable for import at the provider.'
  return null
}
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'The local inbox could not be reached.'
function dateLabel(stamp: string) {
  const date = new Date(stamp)
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function LiveDonations({
  access,
  onAccess,
  onOpen,
}: {
  access: InboxAccess | null
  onAccess: (access: InboxAccess | null) => void
  onOpen: (id: string) => void
}) {
  const ui = useWork()
  const mounted = useRef(false),
    sequence = useRef(0),
    pending = useRef(false)
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState('')
  const [backendError, setBackendError] = useState('')
  const lastKnownSync = useRef<string | null>(null)
  const publish = useCallback(
    (view: InboxView) => {
      let owner: string | null = null
      try {
        owner = ledgerId()
      } catch {
        /* The local ledger cannot accept an import without durable storage. */
      }
      lastKnownSync.current = view.lastSync
      onAccess({ view, owner })
      setBackendError('')
    },
    [onAccess],
  )
  const reload = useCallback(async () => {
    const request = ++sequence.current
    try {
      const state = await getInbox()
      if (mounted.current && request === sequence.current) publish(state)
    } catch (e) {
      if (mounted.current && request === sequence.current) {
        onAccess(null)
        setBackendError(errorText(e))
      }
    }
  }, [publish, onAccess])
  useEffect(() => {
    mounted.current = true
    void reload()
    window.addEventListener('nokitchen-inbox-updated', reload)
    return () => {
      mounted.current = false
      sequence.current++
      window.removeEventListener('nokitchen-inbox-updated', reload)
    }
  }, [reload])
  async function sync() {
    if (pending.current) return
    pending.current = true
    setBusy('sync')
    setError('')
    try {
      const result = await syncInbox()
      if (mounted.current) {
        sequence.current++
        publish(result)
      }
    } catch (e) {
      if (mounted.current) {
        setError(errorText(e))
        await reload()
      }
    } finally {
      pending.current = false
      if (mounted.current) setBusy(null)
    }
  }
  async function review(entry: InboxEntry, local: DonationOffer | undefined) {
    if (pending.current || sourceBlock(entry, local, access?.owner ?? null, ui.storageWarning))
      return
    if (local) {
      onOpen(entry.offerId)
      return
    }
    pending.current = true
    setBusy(entry.id)
    setError('')
    try {
      const mail = await importMail(entry.id)
      if (!mounted.current) return
      const claimed = mail.entry
      if (
        claimed.id !== entry.id ||
        claimed.offerId !== entry.offerId ||
        claimed.inboxId !== entry.inboxId ||
        claimed.messageId !== entry.messageId ||
        claimed.owner !== access?.owner
      )
        throw Error('The message or its workspace changed. Sync the inbox and reopen it.')
      const blocked = sourceBlock(claimed, undefined, access?.owner ?? null, ui.storageWarning)
      if (blocked) throw Error(blocked)
      if (ui.importMail(mail)) onOpen(claimed.offerId)
    } catch (e) {
      if (mounted.current) setError(errorText(e))
    } finally {
      pending.current = false
      if (mounted.current) {
        setBusy(null)
        void reload()
      }
    }
  }
  const view = access?.view
  const lastSync = view?.lastSync ?? lastKnownSync.current
  const connection = backendError ? 'Error' : (view?.connection ?? 'Loading')
  const statusLabel = connection === 'Unchecked' ? 'Not checked' : connection
  return (
    <section className="panel live-inbox" aria-label="Live Donations — Powered by Agentboxd">
      <div className="panel-head">
        <div className="record-head">
          <span className="collection-icon">
            <Inbox />
          </span>
          <div>
            <h2>Live Donations — Powered by Agentboxd</h2>
            <p>{view?.address ?? 'Private operator inbox'}</p>
          </div>
        </div>
        <button
          className="button primary"
          disabled={!!busy || view?.connection === 'Unconfigured'}
          onClick={sync}
        >
          <RefreshCw size={16} />
          Sync Inbox
        </button>
      </div>
      <div className="panel-body">
        <div className="inbox-status">
          <Chip
            tone={
              connection === 'Connected' ? 'green' : connection === 'Error' ? 'terra' : 'neutral'
            }
          >
            {statusLabel}
          </Chip>
          <span>
            Last sync ·{' '}
            {lastSync ? <time dateTime={lastSync}>{dateLabel(lastSync)}</time> : 'Never'}
          </span>
          {busy === 'sync' && <span role="status">Synchronizing…</span>}
        </div>
        {connection === 'Unconfigured' && (
          <p className="muted">
            Configure an inbox ID and read-only key on the local server. Restart it and reload this
            page to connect.
          </p>
        )}
        {view?.hasMore && (
          <p className="note">
            More message history is available. Choose Sync Inbox to load the next page of older
            messages.
          </p>
        )}
        {connection === 'Unchecked' && (
          <p className="muted">Sync the inbox to check the provider connection.</p>
        )}
        {(backendError || view?.error) && (
          <p role="alert" className="note warning">
            {backendError || view?.error}
          </p>
        )}
        {error && error !== view?.error && error !== backendError && (
          <p role="alert" className="note warning">
            {error}
          </p>
        )}
        {ui.operatorWarning && (
          <p role="status" className="note warning">
            {ui.operatorWarning}
          </p>
        )}
        {view && !access?.owner && !ui.storageWarning && (
          <p className="note warning">
            Local storage is unavailable. Live offers need a durable workspace.
          </p>
        )}
        {view?.messages.length ? (
          <div className="inbox-messages">
            {view.messages.map((entry) => {
              const local = ui.offers.find((o) => o.id === entry.offerId)
              const blocked = sourceBlock(entry, local, access?.owner ?? null, ui.storageWarning)
              const subject = entry.subject.trim() || 'Untitled donation message'
              return (
                <article className="inbox-message" key={entry.id} aria-label={subject}>
                  <div className="inbox-message-head">
                    <div>
                      <h3>{subject}</h3>
                      <p>
                        {entry.sender || 'Unknown sender'} ·{' '}
                        <time dateTime={entry.receivedAt}>{dateLabel(entry.receivedAt)}</time>
                      </p>
                    </div>
                    <Chip
                      tone={
                        entry.stage === 'received'
                          ? 'green'
                          : entry.stage === 'new'
                            ? 'neutral'
                            : 'amber'
                      }
                    >
                      {pretty(entry.stage)}
                    </Chip>
                  </div>
                  {entry.available && (
                    <p className="inbox-preview">
                      {entry.preview || 'No plain-text preview available.'}
                    </p>
                  )}
                  <div className="inbox-message-foot">
                    <span>Source · Agentboxd · {entry.providerStatus}</span>
                    <button
                      className="button"
                      disabled={!!busy || !!blocked}
                      onClick={() => review(entry, local)}
                    >
                      <Mail size={15} />
                      {local?.status === 'received'
                        ? 'Open receipt'
                        : local
                          ? 'Open offer'
                          : 'Review Donation'}
                    </button>
                  </div>
                  {blocked ? (
                    <p className="inbox-note">{blocked}</p>
                  ) : local ? (
                    <p className="inbox-note">
                      Already imported · Local offer {pretty(local.status).toLowerCase()}.
                    </p>
                  ) : entry.stage !== 'new' ? (
                    <p className="inbox-note">
                      Previously imported. Opening uses the existing offer ID.
                    </p>
                  ) : null}
                  <details className="meal-links">
                    <summary>
                      Message details
                      {entry.attachments.length
                        ? ' · ' +
                          entry.attachments.length +
                          ' attachment' +
                          (entry.attachments.length === 1 ? '' : 's')
                        : ''}
                    </summary>
                    <div>
                      <dl className="context-data">
                        <dt>Inbox ID</dt>
                        <dd>{entry.inboxId}</dd>
                        <dt>Provider message ID</dt>
                        <dd>{entry.messageId}</dd>
                        <dt>Local offer ID</dt>
                        <dd>{entry.offerId}</dd>
                      </dl>
                      {entry.attachments.length > 0 && (
                        <ul className="mail-attachments">
                          {entry.attachments.map((a, i) => (
                            <li key={i}>
                              <Paperclip size={14} />
                              {a.name || 'Unnamed attachment'}
                              {a.contentType ? ' · ' + a.contentType : ''}
                              {typeof a.size === 'number'
                                ? ' · ' + a.size.toLocaleString() + ' bytes'
                                : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </article>
              )
            })}
          </div>
        ) : view?.connection === 'Connected' ? (
          <div className="inbox-empty">
            <Inbox size={24} />
            <strong>No incoming donation messages</strong>
            <p>Sync again after a donor’s email arrives.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
