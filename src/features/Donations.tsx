import { useRef, useState } from 'react'
import {
  Check,
  ClipboardCheck,
  ClipboardPaste,
  Inbox,
  Mail,
  PackageCheck,
  Plug,
} from 'lucide-react'
import { DAYS } from '../domain/types'
import { ComposeOffer, PastedOfferPanel } from './PasteOffer'
import { LiveDonations, sourceBlock, type InboxAccess } from './LiveDonations'
import './donation.css'
import { DonationImpact } from './DonationImpact'
import type { OfferImpact } from '../domain/donorTypes'
import { PlanActions } from './Policy'
import { Chip, Field, fmt, ingredientFor, PageTitle, pretty, useWork } from './shared'

export default function Donations() {
  const ui = useWork(),
    { sampleOffers, offers, snapshot, plan, previousDraft } = ui
  const operator = __OPERATOR_MODE__ && !ui.tour.active
  const [inbox, setInbox] = useState<InboxAccess | null>(null)
  const reviewAnchor = useRef<HTMLDivElement>(null)
  const [choice, setChoice] = useState('')
  const [composing, setComposing] = useState(false)
  const [preview, setPreview] = useState<OfferImpact | null>(null)
  const [previewError, setPreviewError] = useState('')
  const selected =
    sampleOffers.find((o) => o.id === choice) ??
    sampleOffers.filter((o) => o.document || o.source === 'proposal').at(-1) ??
    sampleOffers[0]
  const offer = offers.find((o) => o.id === selected?.id)
  const live = operator && offer?.document?.message.kind === 'agentboxd'
  const liveBlock = live
    ? sourceBlock(
        inbox?.view.messages.find((m) => m.offerId === offer.id),
        offer,
        inbox?.owner ?? null,
        ui.storageWarning,
      )
    : null
  function openLocalOffer(id: string) {
    setChoice(id)
    setComposing(false)
    setPreview(null)
    setPreviewError('')
    requestAnimationFrame(() => reviewAnchor.current?.focus())
  }
  return (
    <>
      <PageTitle
        title={operator ? 'Donations' : 'Demo donations'}
        subtitle="Review donor messages, preview their effect on meals and record the items that arrive."
      >
        {!composing && (
          <button className="button primary" onClick={() => setComposing(true)}>
            <ClipboardPaste />
            Paste donor offer
          </button>
        )}
      </PageTitle>
      {operator && <LiveDonations access={inbox} onAccess={setInbox} onOpen={openLocalOffer} />}
      {composing ? (
        <ComposeOffer
          onParsed={(id) => {
            setChoice(id)
            setComposing(false)
          }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <>
          <div ref={reviewAnchor} tabIndex={-1} className="panel filters">
            <Field label="Saved and sample offers">
              <select
                value={selected?.id ?? ''}
                onChange={(e) => {
                  setChoice(e.target.value)
                  setPreview(null)
                  setPreviewError('')
                }}
              >
                {sampleOffers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.subject}
                  </option>
                ))}
              </select>
            </Field>
            {!offer?.document && (
              <button
                className="button primary"
                disabled={!selected || Boolean(offer)}
                onClick={() => ui.loadOffer(selected.id)}
              >
                <Inbox />
                {offer ? 'Offer loaded' : 'Load sample offer'}
              </button>
            )}
          </div>
          {liveBlock ? (
            <section className="panel panel-body">
              <h2>{offer?.subject}</h2>
              <p className="note warning">{liveBlock}</p>
            </section>
          ) : offer?.document ? (
            <PastedOfferPanel
              key={offer.id + '-' + offer.document.version + '-' + offer.status}
              offer={offer}
            />
          ) : offer ? (
            <section className="panel">
              <div className="panel-head">
                <div className="record-head">
                  <span className="collection-icon clay">
                    <Mail />
                  </span>
                  <div>
                    <h2>{offer.subject}</h2>
                    <p>
                      {offer.source === 'proposal'
                        ? 'Local donation proposal'
                        : offer.sender + ' · ' + offer.email}
                    </p>
                  </div>
                </div>
                <Chip tone={offer.status === 'received' ? 'green' : 'amber'}>
                  {pretty(offer.status)}
                </Chip>
              </div>
              <div className="panel-body">
                <p className="email-body">{offer.body}</p>
                <div className="subsection">
                  <h3>Pre-filled demo data</h3>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {[
                            'Item',
                            'Offered quantity',
                            'Packaging',
                            'Pickup',
                            'Usable through',
                            'Storage',
                          ].map((x) => (
                            <th key={x}>{x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {offer.items.map(({ lot, unit }) => (
                          <tr key={lot.id}>
                            <td>
                              {ingredientFor(snapshot, lot.ingredientId)?.name ?? lot.ingredientId}
                            </td>
                            <td>
                              {fmt(lot.quantityBaseUnits)} {unit}
                            </td>
                            <td>
                              {lot.canRepack
                                ? 'Repackable'
                                : lot.packageCount + ' × ' + lot.packageSize + ' ' + unit}
                              {lot.requiresCanOpener ? ' · Opener required' : ''}
                            </td>
                            <td>{DAYS[lot.availableFromDay]}</td>
                            <td>{DAYS[lot.usableThroughDay]}</td>
                            <td>{pretty(lot.storage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className="meal-links">
                    <summary>Product and lot review</summary>
                    {offer.items.map(({ lot }) => {
                      const product = ingredientFor(snapshot, lot.ingredientId)
                      return (
                        <div className="lot-card" key={lot.id}>
                          <strong>{product.name}</strong>
                          <p>
                            {lot.provenance} · {pretty(lot.reviewStatus)}
                          </p>
                          <p>
                            Allergens:{' '}
                            {product.declaration === 'declared' && product.allergens !== null
                              ? product.allergens.map(pretty).join(', ') || 'None declared'
                              : 'Needs review'}
                            . After opening: {pretty(lot.afterOpening)}.
                          </p>
                        </div>
                      )
                    })}
                  </details>
                </div>
                <div className="actions">
                  {offer.status === 'offered' && (
                    <button className="button primary" onClick={() => ui.reviewOffer(offer.id)}>
                      <ClipboardCheck />
                      Mark reviewed
                    </button>
                  )}
                  {offer.status === 'reviewed' && (
                    <>
                      <button
                        className="button"
                        onClick={() => {
                          try {
                            setPreview(ui.previewPaste(offer.id))
                            setPreviewError('')
                          } catch (error) {
                            setPreviewError(
                              error instanceof Error
                                ? error.message
                                : 'Calculate a baseline plan first.',
                            )
                          }
                        }}
                      >
                        Preview impact
                      </button>
                      <button className="button primary" onClick={() => ui.receiveOffer(offer.id)}>
                        <PackageCheck />
                        Confirm received
                      </button>
                    </>
                  )}
                  {offer.status === 'received' && (
                    <>
                      <Chip tone="green">
                        <Check />
                        Added to inventory
                      </Chip>
                    </>
                  )}
                </div>
                {previewError && offer.status === 'reviewed' && (
                  <p className="note warning">{previewError}</p>
                )}
                {preview?.offerId === offer.id &&
                  offer.status === 'reviewed' &&
                  (preview.key === ui.impactKey(offer.id) ? (
                    <DonationImpact key={preview.key} impact={preview} actual={false} />
                  ) : (
                    <p className="note warning">
                      This preview is out of date. Run Preview impact again.
                    </p>
                  ))}
                {offer.status === 'received' && <PlanActions offerId={offer.id} />}
              </div>
            </section>
          ) : (
            <div className="panel empty-view">
              <Mail />
              <h2>Open a sample offer</h2>
              <p>Loading an offer lets you inspect its items before review and receipt.</p>
            </div>
          )}
          {plan && !offer?.document && (
            <div className="panel comparison">
              <div>
                <h2>Allocated portions</h2>
                <p>
                  {plan.revision === snapshot.revision
                    ? 'Current plan calculation'
                    : 'Previous calculation · out of date'}
                </p>
              </div>
              <div>
                <strong>{fmt(plan.metrics.allocated)}</strong>
                <span> / {fmt(plan.metrics.requested)} requested</span>
              </div>
              {previousDraft && previousDraft.revision !== plan.revision && (
                <p>
                  Previously {fmt(previousDraft.metrics.allocated)} allocated.{' '}
                  <button className="text-button" onClick={() => ui.navigate('bank', 'packing')}>
                    View packing changes
                  </button>
                </p>
              )}
            </div>
          )}
        </>
      )}
      {!operator && (
        <p className="integration-line">
          <Plug size={16} />
          Agentboxd not connected · Local text extraction
        </p>
      )}
    </>
  )
}
