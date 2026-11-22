import { differences } from '../domain/donorChanges'
import { catalog, sampleOffers } from '../data'
import {
  catalogFingerprint,
  contextFor,
  hash,
  snapshotFingerprint,
  allocationDigest,
} from '../domain/fingerprint'
import { selectPlan, donationOptions, donationDecision } from '../domain/selection'
import type { DonationItem, DonationOffer } from '../domain/types'
import {
  DONATION_RULE,
  type DonationChoice,
  type OfferImpact,
  type OfferRow,
  type PastedOffer,
} from '../domain/donorTypes'
import { validatePlan } from '../domain/validatePlan'
import { validateStockLot } from '../domain/validation'
import { offerItems } from '../integrations/donations/parser'
import { snapshotOf } from './selectors'
import type { Scenario } from './state'

const safeId = (id: string) =>
  typeof id === 'string' && /^[\w-]{1,128}$/u.test(id) && !Object.hasOwn(Object.prototype, id)
const byId = (s: Scenario, id: string) => [...sampleOffers, ...s.proposals].find((o) => o.id === id)
const productIds = new Set(catalog.ingredients.map((i) => i.id))

export function assertDocument(doc: PastedOffer, weekStart: string) {
  if (
    !safeId(doc.id) ||
    doc.weekStart !== weekStart ||
    !Number.isSafeInteger(doc.version) ||
    doc.version < 1 ||
    !doc.message ||
    !['manual', 'fixture', 'agentboxd'].includes(doc.message.kind) ||
    ![
      doc.message.text,
      doc.message.sender,
      doc.message.subject,
      doc.message.receivedAt,
      doc.parserId,
      doc.catalogRevision,
    ].every((x) => typeof x === 'string') ||
    !doc.message.text.trim() ||
    !Array.isArray(doc.rows) ||
    !doc.rows.length ||
    new Set(doc.rows.map((r) => r.id)).size !== doc.rows.length
  )
    throw Error('Invalid donor message or model week.')
  if (
    doc.message.kind === 'agentboxd' &&
    (!safeId(doc.message.stagingId ?? '') ||
      !doc.message.externalId ||
      !doc.message.inboxId ||
      doc.message.text.length > 16000)
  )
    throw Error('Imported mail must identify its original inbox and message.')
  for (const row of doc.rows) {
    const [start, end] = row.span
    if (
      !safeId(row.id) ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > doc.message.text.length ||
      doc.message.text.slice(start, end) !== row.sourceText ||
      !Number.isInteger(row.line) ||
      row.line < 1 ||
      !row.edits ||
      !row.evidence ||
      ![...Object.values(row.edits), ...Object.values(row.evidence)].every(
        (v) => typeof v === 'string',
      )
    )
      throw Error('The donor text and its extracted line must be preserved.')
  }
}

function assertSourceRows(original: PastedOffer, candidate: PastedOffer) {
  const source = (d: PastedOffer) =>
    d.rows.map((r) => [r.id, r.line, r.span, r.sourceText, r.evidence])
  if (
    original.parserId !== candidate.parserId ||
    hash(source(original)) !== hash(source(candidate))
  )
    throw Error('Keep each extracted source row and use an exclusion reason for items left out.')
}

function replaceOffer(state: Scenario, offer: DonationOffer): DonationOffer[] {
  return state.proposals.map((o) => (o.id === offer.id ? offer : o))
}

export function savePaste(state: Scenario, doc: PastedOffer, expected: number | null): Scenario {
  assertDocument(doc, state.weekStart)
  if (doc.catalogRevision !== catalogFingerprint(catalog))
    throw Error('The catalog changed. Extract this offer again.')
  const prior = byId(state, doc.id)
  if (doc.message.kind === 'agentboxd' && expected === null) {
    const existing = state.proposals.find((o) => {
      const m = o.document?.message
      return (
        m?.kind === 'agentboxd' &&
        m.inboxId === doc.message.inboxId &&
        m.externalId === doc.message.externalId
      )
    })
    if (existing) {
      if (existing.id !== doc.id || hash(existing.document!.message) !== hash(doc.message))
        throw Error('This provider message already belongs to a different saved offer.')
      return state
    }
  }
  if (
    (prior &&
      (prior.source !== 'paste' || !prior.document || prior.document.version !== expected)) ||
    (!prior && expected !== null)
  )
    throw Error('The offer changed. Reopen the current version before editing.')
  if (
    prior &&
    (state.offerStatus[doc.id] === 'received' ||
      hash(prior.document!.message) !== hash(doc.message))
  )
    throw Error('The original message and received offers cannot be rewritten.')
  if (prior) assertSourceRows(prior.document!, doc)
  if (prior && hash(prior.document!.rows) === hash(doc.rows)) return state
  const document = structuredClone({ ...doc, version: (expected ?? 0) + 1 })
  const offer: DonationOffer = {
    id: doc.id,
    document,
    source: 'paste',
    items: [],
    status: 'offered',
    email: '',
    sender: doc.message.sender,
    subject: doc.message.subject || 'Pasted donor offer',
    body: doc.message.text,
  }
  return {
    ...state,
    proposals: prior ? replaceOffer(state, offer) : [...state.proposals, offer],
    offerStatus: { ...state.offerStatus, [doc.id]: 'offered' },
  }
}

function receiveLots(state: Scenario, id: string, items: DonationItem[]) {
  if (!items.length) throw Error('Include at least one reviewed item.')
  const existing = new Set(state.lots.map((l) => l.id))
  return items.map(({ unit, lot }) => {
    const ingredient = catalog.ingredients.find((i) => i.id === lot.ingredientId)
    if (
      !ingredient ||
      ingredient.unit !== unit ||
      ingredient.reviewStatus !== 'demo' ||
      ingredient.declaration !== 'declared' ||
      !Array.isArray(ingredient.allergens) ||
      lot.reviewStatus !== 'demo' ||
      lot.quantityBaseUnits <= 0 ||
      lot.received ||
      lot.sourceOfferId !== id ||
      existing.has(lot.id) ||
      validateStockLot(lot, productIds).length
    )
      throw Error(
        'Unresolved quantity, package, product declaration or duplicate lot. Check all rows.',
      )
    existing.add(lot.id)
    return { ...lot, received: true }
  })
}

export function updateOffer(
  state: Scenario,
  id: string,
  step: 'load' | 'review' | 'receive',
  actualRows?: OfferRow[],
  confirmDifferences = false,
  expectedVersion?: number,
): Scenario {
  const offer = byId(state, id)
  if (!offer) throw Error('Offer not found.')
  const status = state.offerStatus[id]
  if (step === 'load')
    return status ? state : { ...state, offerStatus: { ...state.offerStatus, [id]: 'offered' } }
  if (!status) throw Error('Load the offer first.')
  if (status === 'received') {
    if (actualRows && hash(actualRows) !== hash(offer.receipt?.rows))
      throw Error('This delivery already has a final recorded receipt.')
    return state
  }
  const doc = offer.document
  if (doc && expectedVersion !== doc.version)
    throw Error('The offer changed. Review the latest version.')
  if (step === 'review') {
    if (status === 'reviewed') return state
    const items = doc ? offerItems(doc, catalog) : offer.items
    receiveLots(state, id, items)
    return {
      ...state,
      proposals: doc
        ? replaceOffer(state, { ...offer, items, status: 'reviewed' })
        : state.proposals,
      offerStatus: { ...state.offerStatus, [id]: 'reviewed' },
    }
  }
  if (status !== 'reviewed') throw Error('Review the included items before confirming receipt.')
  if (actualRows && !doc) throw Error('This fixture has a fixed receipt.')
  const actual = doc ? { ...doc, rows: structuredClone(actualRows ?? doc.rows) } : null
  if (actual) {
    assertDocument(actual, state.weekStart)
    assertSourceRows(doc!, actual)
  }
  if (actual && !confirmDifferences && differences(doc!.rows, actual.rows).length > 0)
    throw Error('Confirm the differences between reviewed and actual delivery.')
  const items = actual ? offerItems(actual, catalog) : offer.items
  const lots = receiveLots(state, id, items)
  const revision = state.revision + 1
  const source = snapshotOf(state)
  const baseline = donationBaseline(state)
  const receipt = actual
    ? {
        rows: actual.rows,
        items: items.map((item, i) => ({ ...item, lot: lots[i] })),
        baselineId: baseline.id,
        revision,
      }
    : null
  return {
    ...state,
    revision,
    lots: [...state.lots, ...lots],
    offerStatus: { ...state.offerStatus, [id]: 'received' },
    proposals: receipt
      ? replaceOffer(state, { ...offer, receipt, status: 'received' })
      : state.proposals,
    receiptComparison: {
      offerId: id,
      revision,
      before: baseline,
      after: null,
      decision: null,
      ruleId: DONATION_RULE,
      sourceFingerprint: snapshotFingerprint(source),
    },
  }
}

function donationBaseline(state: Scenario) {
  return state.approved ?? state.draft ?? selectPlan(snapshotOf(state))
}

export function impactKey(state: Scenario, id: string): string {
  const offer = byId(state, id)
  if (!offer || state.offerStatus[id] !== 'reviewed') return ''
  const baseline = donationBaseline(state)
  return hash([
    'hypothetical',
    DONATION_RULE,
    id,
    state.weekStart,
    baseline.id,
    baseline.status,
    contextFor(snapshotOf(state), donationOptions(baseline, 'coverage')),
    offer.document ?? offer.items,
  ])
}

export function previewPaste(state: Scenario, id: string): OfferImpact {
  const key = impactKey(state, id)
  if (!key) throw Error('Review the offer and calculate a baseline before previewing.')
  const offer = byId(state, id)!,
    before = donationBaseline(state)!
  const items = offer.document ? offerItems(offer.document, catalog) : offer.items
  const projected = {
    ...snapshotOf(state),
    revision: state.revision + 1,
    lots: [...state.lots, ...receiveLots(state, id, items)],
  }
  const decision = donationDecision(projected, before)
  return {
    key,
    offerId: id,
    before,
    decision,
    canChoose: false,
    after: decision[decision.selected]!,
    items,
    weekStart: state.weekStart,
  }
}

type Comparison = NonNullable<Scenario['receiptComparison']>
export function recalculateReceipt(state: Scenario, c: Comparison): Scenario {
  if (c.ruleId !== DONATION_RULE) throw Error('The donation recommendation rule has changed.')
  const decision = donationDecision(snapshotOf(state), c.before)
  const draft = decision[decision.selected]!
  return {
    ...state,
    draft,
    previousDraft: { ...c.before, status: 'draft' },
    varietyNote: null,
    receiptComparison: { ...c, after: draft, decision },
  }
}

export function latestImpact(state: Scenario): OfferImpact | null {
  const c = state.receiptComparison
  if (
    !c?.after ||
    !c.decision ||
    c.revision !== state.revision ||
    c.ruleId !== DONATION_RULE ||
    c.decision.ruleId !== DONATION_RULE ||
    c.after.fingerprint !== snapshotFingerprint(snapshotOf(state))
  )
    return null
  const offer = byId(state, c.offerId)
  if (!offer || state.offerStatus[c.offerId] !== 'received') return null
  const items =
    offer.receipt?.items ?? offer.items.map((i) => ({ ...i, lot: { ...i.lot, received: true } }))
  const d = c.decision
  const sameOwner =
    c.before.status === 'approved'
      ? state.approved?.id === c.before.id && allocationDigest(state.approved) === d.baselineDigest
      : !state.approved
  const canChoose =
    !!d.keep &&
    allocationDigest(d.keep) !== allocationDigest(d.coverage) &&
    sameOwner &&
    state.draft?.id === c.after.id
  const key = hash([
    'received',
    c.offerId,
    c.sourceFingerprint,
    c.ruleId,
    c.before.status,
    c.before.id,
    d.baselineDigest,
    d.keep?.id,
    d.coverage.id,
    d.selected,
    state.draft?.id,
    state.approved?.id,
    items,
    state.weekStart,
  ])
  return {
    key,
    offerId: c.offerId,
    before: c.before,
    after: c.after,
    decision: d,
    canChoose,
    items,
    weekStart: state.weekStart,
  }
}

export function chooseDonationCandidate(
  state: Scenario,
  id: string,
  key: string,
  choice: DonationChoice,
): Scenario {
  const impact = latestImpact(state)
  if (
    !impact ||
    impact.offerId !== id ||
    impact.key !== key ||
    !impact.canChoose ||
    !['keep', 'coverage'].includes(choice)
  )
    throw Error('This donation decision is out of date. Inspect the current draft.')
  const draft = impact.decision[choice]
  if (!draft) throw Error('The existing meals cannot be kept under the current constraints.')
  const issues = validatePlan(snapshotOf(state), draft)
  if (issues.length) throw Error('The donation alternative failed validation. ' + issues[0])
  if (choice === impact.decision.selected) return state
  return {
    ...state,
    draft,
    varietyNote: null,
    previousDraft: { ...impact.before, status: 'draft' },
    receiptComparison: {
      ...state.receiptComparison!,
      after: draft,
      decision: { ...impact.decision, selected: choice },
    },
  }
}
