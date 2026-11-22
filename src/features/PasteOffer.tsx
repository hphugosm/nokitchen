import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ClipboardCheck,
  FileText,
  PackageCheck,
  Pencil,
  Save,
  Scale,
} from 'lucide-react'
import type { DonationOffer } from '../domain/types'
import type { OfferImpact, OfferRow } from '../domain/donorTypes'
import {
  ExampleMessageSource,
  ManualMessageSource,
  sampleMessages,
} from '../integrations/donations/messages'
import { offerItems, parseOffer } from '../integrations/donations/parser'
import { DonorRows, differences } from './DonorRows'
import { DonationImpact } from './DonationImpact'
import { Chip, Field, pretty, useWork } from './shared'
import { DonorReply } from './DonorReply'
import { PlanActions } from './Policy'

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
function newOfferId() {
  if (globalThis.crypto.randomUUID) return 'paste-' + globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return (
    'paste-' +
    [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
      '-',
    )
  )
}
export function ComposeOffer({
  onParsed,
  onCancel,
}: {
  onParsed: (id: string) => void
  onCancel: () => void
}) {
  const ui = useWork(),
    [text, setText] = useState(''),
    [sender, setSender] = useState(''),
    [subject, setSubject] = useState(''),
    [example, setExample] = useState<string | null>(null),
    [error, setError] = useState('')
  const duplicate =
    !!text.trim() &&
    ui.offers.some((o) => o.document && normalize(o.document.message.text) === normalize(text))
  async function parse() {
    try {
      const fixture = sampleMessages.find((e) => e.id === example && e.text === text)
      const now = new Date().toISOString()
      const source = fixture
        ? new ExampleMessageSource(fixture, now)
        : new ManualMessageSource({ text, sender, subject }, now)
      const message = { ...(await source.obtain()), sender, subject }
      const id = newOfferId(),
        doc = parseOffer(message, ui.snapshot, ui.weekStart, id)
      if (ui.savePaste(doc, null)) onParsed(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The message could not be parsed.')
    }
  }
  return (
    <section className="panel paste-compose">
      <div className="panel-head">
        <div>
          <h2>Paste donor offer</h2>
          <p>Local text extraction · Model week starts {ui.weekStart} (Monday).</p>
        </div>
      </div>
      <div className="panel-body">
        <p>Choose an example or paste a new message.</p>
        <div className="option-set">
          {sampleMessages.map((e) => (
            <button
              key={e.id}
              aria-pressed={example === e.id}
              onClick={() => {
                setText(e.text)
                setExample(e.id)
                setSubject(e.name)
                setSender('Demo donor')
                setError('')
              }}
            >
              {e.name}
            </button>
          ))}
        </div>
        <div className="donor-grid">
          <Field label="Donor label (optional)">
            <input maxLength={120} value={sender} onChange={(e) => setSender(e.target.value)} />
          </Field>
          <Field label="Subject (optional)">
            <input maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        </div>
        <Field label="Donor message">
          <textarea
            rows={5}
            value={text}
            maxLength={16000}
            onChange={(e) => {
              setText(e.target.value)
              setExample(null)
              setError('')
            }}
            placeholder="One item or package group per line"
          />
        </Field>
        {duplicate && (
          <p className="note warning">
            <AlertCircle />A saved offer has the same text. Parsing again creates a separate offer.
          </p>
        )}
        {error && (
          <p className="note warning" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="button primary" disabled={!text.trim()} onClick={parse}>
            <FileText />
            Parse offer
          </button>
          <button className="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}

export function PastedOfferPanel({ offer }: { offer: DonationOffer }) {
  const ui = useWork(),
    doc = offer.document!,
    receipt = offer.receipt
  const [rows, setRows] = useState<OfferRow[]>(() => structuredClone(receipt?.rows ?? doc.rows)),
    [editing, setEditing] = useState(false),
    [impact, setImpact] = useState<OfferImpact | null>(null),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState('')
  const offered = offer.status === 'offered',
    reviewed = offer.status === 'reviewed',
    received = offer.status === 'received'
  const editProposal = offered || editing
  const changed = JSON.stringify(rows) !== JSON.stringify(doc.rows)
  const diff = differences(doc.rows, rows)
  const invalid = useMemo(() => {
    try {
      offerItems({ ...doc, rows }, ui.snapshot)
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : 'Check the included rows.'
    }
  }, [doc, rows, ui.snapshot])
  const previewCurrent =
    !!impact && reviewed && !diff.length && !editing && impact.key === ui.impactKey(offer.id)
  const live = __OPERATOR_MODE__ && !ui.tour.active && doc.message.kind === 'agentboxd'
  const sample = doc.message.kind === 'fixture' && doc.message.externalId === 'pouches'
  function updateRows(value: OfferRow[]) {
    setRows(value)
    setConfirm(false)
    setError('')
  }
  function save() {
    if (ui.savePaste({ ...doc, rows }, doc.version)) {
      setEditing(false)
      setImpact(null)
    }
  }
  function preview() {
    try {
      const value = ui.previewPaste(offer.id)
      setImpact(value)
      setError('')
      if (ui.tour.active) ui.tour.markPreview(offer.id, value.key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update the baseline and review before previewing.')
    }
  }
  return (
    <>
      <section className="panel paste-record">
        <div className="panel-head">
          <div>
            <h2>{offer.subject || 'Pasted donor offer'}</h2>
            <p>
              {live && 'Agentboxd email · '}
              {offer.sender || 'Local donor'} · Local text extraction · Model week {doc.weekStart}
            </p>
          </div>
          <Chip tone={received ? 'green' : 'amber'}>{pretty(offer.status)}</Chip>
        </div>
        <div className="panel-body">
          <details className="meal-links">
            <summary>Original message and source</summary>
            <div>
              <p className="email-body">{doc.message.text}</p>
              {live && (
                <dl className="context-data">
                  <dt>Source</dt>
                  <dd>Agentboxd</dd>
                  <dt>Inbox ID</dt>
                  <dd>{doc.message.inboxId}</dd>
                  <dt>Provider message ID</dt>
                  <dd>{doc.message.externalId}</dd>
                </dl>
              )}
              <p className="source-stamp">
                {doc.message.kind} · {doc.parserId} · {doc.catalogRevision} ·{' '}
                {doc.message.receivedAt} · Offer {doc.id} · Revision {doc.version}
              </p>
            </div>
          </details>
          {!received ? (
            <>
              <h3>{editProposal ? 'Review extracted items' : 'Actual delivery'}</h3>
              <p className="muted">
                {editProposal
                  ? 'Mark reviewed confirms that each incoming label matches its selected catalog product. Exclude rows with unresolved or conflicting declarations until clarified.'
                  : 'The receipt starts with the reviewed quantities and package facts. Edit them to match the delivery.'}
              </p>
              {sample && editProposal && (
                <div className="fixture-facts">
                  <strong>Synthetic label for this example</strong>
                  <p>
                    Store sealed pouches at ambient temperature and refrigerate after opening. The
                    demo bank confirms Monday–Sunday as the model window for this lot.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      updateRows(
                        rows.map((r) =>
                          r.id !== 'row-1'
                            ? r
                            : {
                                ...r,
                                storage: 'ambient',
                                afterOpening: 'fridge',
                                availableFromDay: 0,
                                usableThroughDay: 6,
                                edits: {
                                  ...r.edits,
                                  storage: 'Operator confirmed synthetic pouch label: ambient',
                                  afterOpening: 'Operator confirmed synthetic pouch label: fridge',
                                  availableFromDay:
                                    'Operator confirmed Monday collection availability',
                                  usableThroughDay: 'Operator confirmed Sunday model limit',
                                },
                              },
                        ),
                      )
                    }
                  >
                    Confirm the example product details
                  </button>
                </div>
              )}
              <DonorRows
                rows={rows}
                onChange={updateRows}
                catalog={ui.snapshot}
                weekStart={doc.weekStart}
              />
              {editProposal ? (
                <div className="actions">
                  <button className="button" disabled={!changed} onClick={save}>
                    <Save />
                    Save edits
                  </button>
                  {offered && (
                    <button
                      className="button primary"
                      disabled={changed || !!invalid}
                      onClick={() => ui.reviewOffer(offer.id, doc.version)}
                    >
                      <ClipboardCheck />
                      Mark reviewed
                    </button>
                  )}
                  {editing && (
                    <button
                      className="button"
                      onClick={() => {
                        setRows(structuredClone(doc.rows))
                        setEditing(false)
                      }}
                    >
                      Cancel editing
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="actions">
                    <button
                      className="button"
                      disabled={!!diff.length}
                      onClick={() => setEditing(true)}
                    >
                      <Pencil />
                      Edit reviewed proposal
                    </button>
                    <button
                      className="button"
                      disabled={!!diff.length || !!invalid}
                      onClick={preview}
                    >
                      <Scale />
                      Preview impact
                    </button>
                  </div>
                  {!ui.impactKey(offer.id) && (
                    <p className="note warning">
                      Recalculate the weekly plan for a current preview baseline.{' '}
                      <button className="text-button" onClick={ui.recalculate}>
                        Recalculate
                      </button>
                    </p>
                  )}
                  {diff.length > 0 && (
                    <div className="receipt-diff">
                      <h3>Differences from reviewed offer</h3>
                      <ul>
                        {diff.map((d) => (
                          <li key={d.row + d.field}>
                            {d.row} · {d.field} · {d.before} → {d.after}
                          </li>
                        ))}
                      </ul>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={confirm}
                          onChange={(e) => setConfirm(e.target.checked)}
                        />
                        I confirm these actual delivery differences
                      </label>
                    </div>
                  )}
                  <button
                    className="button primary"
                    disabled={!!invalid || (diff.length > 0 && !confirm)}
                    onClick={() =>
                      ui.receiveOffer(offer.id, rows, diff.length > 0 && confirm, doc.version)
                    }
                  >
                    <PackageCheck />
                    Confirm received
                  </button>
                </>
              )}
              {error && (
                <div role="alert" className="note warning">
                  {error}
                </div>
              )}
              {changed && editProposal && (
                <p className="muted">
                  Save edits before review. Updated fields require a new review and impact preview.
                </p>
              )}
              {!rows.some((r) => r.excludedReason === null) && (
                <p className="note warning">At least one item must be included.</p>
              )}
            </>
          ) : (
            <>
              <h3>Received stock</h3>
              <p>Receipt recorded once. Recalculate the week to inspect the actual effect.</p>
              <ul className="donor-lots">
                {receipt?.items.map((i) => (
                  <li key={i.lot.id}>
                    {ui.snapshot.ingredients.find((p) => p.id === i.lot.ingredientId)?.name} ·{' '}
                    {i.lot.quantityBaseUnits} {i.unit} · {i.lot.id}
                  </li>
                ))}
              </ul>
              {receipt && (
                <details className="meal-links">
                  <summary>Final delivery and excluded rows</summary>
                  <div>
                    {receipt.rows.map((r) => (
                      <div className="audit-finding" key={r.id}>
                        <strong>{r.sourceText}</strong>
                        <p>
                          {r.excludedReason
                            ? 'Excluded · ' + r.excludedReason
                            : [
                                r.quantity + ' ' + r.unit,
                                r.basis,
                                r.packageKind,
                                r.deliveryDate,
                                r.expiryType,
                                r.expiryDate,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                        {Object.keys(r.edits).length > 0 && (
                          <small>{Object.values(r.edits).join(' · ')}</small>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
          {live && <DonorReply offer={offer} />}
          {received && <PlanActions offerId={offer.id} />}
        </div>
      </section>
      {previewCurrent && <DonationImpact key={impact!.key} impact={impact!} actual={false} />}
      {impact && !previewCurrent && !received && (
        <p className="note warning">
          <AlertCircle />
          Impact preview out of date. Review current entries and run Preview impact again.
        </p>
      )}
    </>
  )
}
