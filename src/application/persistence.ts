import { DONATION_RULE, MODEL_WEEK, type DonationChoice } from '../domain/donorTypes'
import { assertDocument } from './donorCommands'
import { offerItems } from '../integrations/donations/parser'
import { hash } from '../domain/fingerprint'
import { catalog, sampleOffers, seedHouseholds, seedLots } from '../data'
import { catalogFingerprint, snapshotFingerprint } from '../domain/fingerprint'
import { MEALS, type AllocationPlan, type StockLot } from '../domain/types'
import { assertHousehold, type Scenario } from './state'
import { decisionBaseline, reservedByLot, snapshotOf } from './selectors'
import { validateStockLot } from '../domain/validation'
import { validatePlan } from '../domain/engine'
import { donationDecision } from '../domain/selection'

export const STORAGE_KEY = 'nokitchen.scenario.v4'
export const V3_STORAGE_KEY = 'nokitchen.scenario.v3'
export const PREVIOUS_STORAGE_KEY = 'nokitchen.scenario.v2'
export const LEGACY_STORAGE_KEY = 'nokitchen.scenario.v1'

type SavedScenario = Omit<
  Scenario,
  'draft' | 'previousDraft' | 'approved' | 'schemaVersion' | 'receiptComparison'
> & {
  schemaVersion: 1 | 2 | 3 | 4
  receiptComparison?: {
    offerId: string
    revision: number
    beforeId: string
    afterId: string | null
    ruleId?: string
    beforeStatus?: AllocationPlan['status']
    sourceFingerprint?: string
    historicalBaselineId?: string
    selected?: DonationChoice | null
  } | null
  catalogFingerprint?: string
  plans: Record<string, AllocationPlan>
  draftId: string | null
  previousId: string | null
  approvedId: string | null
}

export function encodeScenario(state: Scenario): string {
  const { draft, previousDraft, approved, receiptComparison, ...inputs } = state
  const plans: Record<string, AllocationPlan> = {}
  for (const plan of [
    receiptComparison?.before,
    receiptComparison?.after,
    previousDraft,
    draft,
    approved,
  ]) {
    if (plan) plans[plan.id] = plan
  }
  const saved: SavedScenario = {
    ...inputs,
    receiptComparison: receiptComparison
      ? {
          offerId: receiptComparison.offerId,
          revision: receiptComparison.revision,
          beforeId: receiptComparison.before.id,
          afterId: receiptComparison.after?.id ?? null,
          ruleId: receiptComparison.ruleId,
          beforeStatus: receiptComparison.before.status,
          sourceFingerprint: receiptComparison.sourceFingerprint,
          historicalBaselineId: receiptComparison.historicalBaselineId,
          selected: receiptComparison.decision?.selected ?? null,
        }
      : null,
    catalogFingerprint: catalogFingerprint(catalog),
    plans,
    draftId: draft?.id ?? null,
    previousId: previousDraft?.id ?? null,
    approvedId: approved?.id ?? null,
  }
  return JSON.stringify(saved)
}

const ingredientIds = new Set(catalog.ingredients.map((ingredient) => ingredient.id))
function validLot(lot: StockLot) {
  return (
    typeof lot.id === 'string' &&
    lot.id.length > 0 &&
    typeof lot.received === 'boolean' &&
    typeof lot.requiresCanOpener === 'boolean' &&
    typeof lot.canRepack === 'boolean' &&
    validateStockLot(lot, ingredientIds).length === 0
  )
}

function validSelection(plan: AllocationPlan): boolean {
  const evidence = plan.selection
  if (!evidence) return plan.strategy !== 'meal-coverage-first'
  const { context, candidates, fixedSlots, winner } = evidence
  const kinds = [
    'fresh-legacy',
    'retain',
    'extend',
    'improve-variety',
    'family-aware',
    'fresh-refined',
  ]
  const nonnegative = (value: number) => Number.isSafeInteger(value) && value >= 0
  return (
    !!context &&
    ['key', 'snapshotFingerprint', 'policyId', 'parametersId', 'engineVersion'].every(
      (k) => typeof context[k as keyof typeof context] === 'string',
    ) &&
    [context.incumbentDigest, context.incumbentEvidenceDigest].every(
      (d) => d === null || typeof d === 'string',
    ) &&
    (context.engineVersion !== '1.3.0' ||
      (['select', 'improve-variety'].includes(context.operation) &&
        typeof context.strategyId === 'string' &&
        typeof context.catalogRevision === 'string' &&
        typeof context.metricVersion === 'string' &&
        nonnegative(context.searchBudget))) &&
    kinds.includes(winner) &&
    typeof evidence.reason === 'string' &&
    typeof evidence.allocationDigest === 'string' &&
    Array.isArray(candidates) &&
    candidates.some((c) => c.kind === winner && c.valid) &&
    candidates.every(
      (c) =>
        kinds.includes(c.kind) &&
        typeof c.valid === 'boolean' &&
        Array.isArray(c.issues) &&
        c.issues.every((i) => typeof i === 'string') &&
        (c.valid
          ? c.score &&
            [c.score.total, c.score.changedAssigned, c.score.repeats].every(nonnegative) &&
            (c.score.variety === undefined ||
              (Array.isArray(c.score.variety) &&
                c.score.variety.length === 3 &&
                c.score.variety.every(nonnegative))) &&
            (c.score.minimum === null ||
              (nonnegative(c.score.minimum.allocated) &&
                nonnegative(c.score.minimum.requested) &&
                c.score.minimum.requested > 0))
          : c.score === null),
    ) &&
    (fixedSlots === undefined ||
      (Array.isArray(fixedSlots) &&
        fixedSlots.every(
          (s) =>
            s &&
            typeof s.householdId === 'string' &&
            Number.isInteger(s.day) &&
            s.day >= 0 &&
            s.day < 7 &&
            MEALS.includes(s.meal),
        )))
  )
}

export function decodeScenario(raw: string): Scenario {
  const saved: SavedScenario = JSON.parse(raw)
  if (
    ![1, 2, 3, 4].includes(saved.schemaVersion) ||
    !Number.isSafeInteger(saved.revision) ||
    saved.revision < 1 ||
    !Array.isArray(saved.households) ||
    saved.households.length !== seedHouseholds.length ||
    !seedHouseholds.every((seed) => saved.households.some((current) => current.id === seed.id)) ||
    !Array.isArray(saved.lots) ||
    !saved.lots.every(validLot) ||
    new Set(saved.lots.map((lot) => lot.id)).size !== saved.lots.length ||
    (saved.schemaVersion === 4 &&
      (!['expanded', 'migrated'].includes(saved.seedKind) ||
        (saved.varietyNote !== null && typeof saved.varietyNote !== 'string'))) ||
    !saved.offerStatus ||
    !saved.plans
  )
    throw Error('Invalid scenario format.')
  const migration =
    saved.schemaVersion !== 4 ||
    saved.catalogFingerprint !== catalogFingerprint(catalog) ||
    (saved.receiptComparison?.ruleId !== undefined &&
      saved.receiptComparison.ruleId !== DONATION_RULE)
  const proposals = saved.schemaVersion === 1 ? [] : saved.proposals
  const weekStart = saved.schemaVersion < 4 ? MODEL_WEEK : saved.weekStart
  if (weekStart !== MODEL_WEEK || !Array.isArray(proposals))
    throw Error('Invalid saved model week or proposals.')
  for (const offer of proposals) {
    if (
      typeof offer.id !== 'string' ||
      !Array.isArray(offer.items) ||
      !['proposal', 'paste'].includes(offer.source)
    )
      throw Error('Invalid saved proposal.')
    if (offer.source === 'paste') {
      const doc = offer.document
      if (!doc || doc.id !== offer.id || !saved.offerStatus[offer.id])
        throw Error('Missing saved donor source.')
      assertDocument(doc, weekStart)
      if (
        saved.offerStatus[offer.id] !== 'offered' &&
        hash(offerItems(doc, catalog)) !== hash(offer.items)
      )
        throw Error('The saved reviewed items do not match the offer.')
      if (saved.offerStatus[offer.id] === 'received') {
        if (!offer.receipt || !Number.isSafeInteger(offer.receipt.revision))
          throw Error('Missing saved receipt.')
        const actual = { ...doc, rows: offer.receipt.rows }
        assertDocument(actual, weekStart)
        const expectedItems = offerItems(actual, catalog).map((item) => ({
          ...item,
          lot: { ...item.lot, received: true },
        }))
        if (hash(expectedItems) !== hash(offer.receipt.items))
          throw Error('The saved receipt rows do not match the received items.')
      }
    } else if (!offer.items.length) throw Error('Empty saved stock proposal.')
    if (
      !offer.items.every(
        (item) =>
          validLot(item.lot) &&
          !item.lot.received &&
          item.lot.sourceOfferId === offer.id &&
          catalog.ingredients.find((i) => i.id === item.lot.ingredientId)?.unit === item.unit,
      )
    )
      throw Error('Invalid saved lot proposal.')
  }
  const knownOffers = [...sampleOffers, ...proposals]
  if (new Set(knownOffers.map((o) => o.id)).size !== knownOffers.length)
    throw Error('Duplicate saved proposal.')
  for (const household of saved.households) assertHousehold(household)
  for (const [id, status] of Object.entries(saved.offerStatus)) {
    const offer = knownOffers.find((entry) => entry.id === id)
    if (!offer || !['offered', 'reviewed', 'received'].includes(status ?? ''))
      throw Error('Invalid saved offer.')
    if (
      status === 'received' &&
      !(offer.receipt?.items ?? offer.items).every((item) =>
        saved.lots.some((lot) => lot.id === item.lot.id && lot.sourceOfferId === id),
      )
    ) {
      throw Error('Incomplete saved receipt.')
    }
  }

  const restore = (id: string | null, status: 'approved' | 'draft'): AllocationPlan | null => {
    if (id === null) return null
    const plan = saved.plans[id]
    if (
      !plan ||
      plan.schemaVersion !== 1 ||
      plan.id !== id ||
      !Number.isSafeInteger(plan.revision) ||
      plan.revision > saved.revision ||
      !Array.isArray(plan.allocations) ||
      !Array.isArray(plan.packingLists) ||
      !Array.isArray(plan.unfilled) ||
      !plan.metrics ||
      !validSelection(plan)
    ) {
      throw Error('Invalid saved plan.')
    }
    return {
      ...plan,
      status,
      fingerprint: plan.fingerprint ?? 'legacy-1.0',
      strategy: plan.strategy ?? 'nokitchen',
    }
  }
  const approved = restore(saved.approvedId, 'approved')
  for (const [id, quantity] of Object.entries(reservedByLot(approved))) {
    const lot = saved.lots.find((entry) => entry.id === id)
    if (!lot || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > lot.quantityBaseUnits)
      throw Error('Invalid saved reservations.')
  }
  const scenario: Scenario = {
    schemaVersion: 4,
    weekStart,
    seedKind: saved.schemaVersion < 4 ? 'migrated' : saved.seedKind,
    varietyNote: saved.schemaVersion < 4 ? null : saved.varietyNote,
    receiptComparison: null,
    revision: saved.revision + (migration ? 1 : 0),
    households: saved.households,
    lots:
      saved.schemaVersion === 1
        ? saved.lots.map((lot) => {
            // Old saves omitted packaging labels. Only recover a known label when the corresponding
            // fixture has the identical ingredient, opening requirement and package specification.
            const known = [
              ...seedLots,
              ...sampleOffers.flatMap((o) => o.items.map((i) => i.lot)),
            ].find((l) => l.id === lot.id)
            if (
              lot.packageKind ||
              !known?.packageKind ||
              known.ingredientId !== lot.ingredientId ||
              known.canRepack !== lot.canRepack ||
              known.requiresCanOpener !== lot.requiresCanOpener ||
              known.packageSize !== lot.packageSize
            )
              return lot
            return { ...lot, packageKind: known.packageKind }
          })
        : saved.lots,
    proposals,
    offerStatus: saved.offerStatus,
    draft: restore(saved.draftId, 'draft'),
    approved,
    previousDraft: restore(saved.previousId, 'draft'),
  }
  // Completed 1.3 comparisons lack ownership evidence. Keep their ordinary draft and physical receipt.
  // A pending 1.3 receipt still has its pre-recalculation owner and original inventory available.
  const entry = saved.receiptComparison
  const legacyPending = entry && entry.ruleId === undefined && entry.afterId === null
  if (
    !migration &&
    entry?.revision === scenario.revision &&
    (entry.ruleId === DONATION_RULE || legacyPending)
  ) {
    const offer = knownOffers.find((o) => o.id === entry.offerId)
    const recorded = restore(entry.beforeId, entry.beforeStatus ?? 'draft')
    const before = legacyPending ? (approved ?? recorded) : recorded
    const after = restore(entry.afterId, 'draft')
    const historicalBaselineId =
      legacyPending && recorded?.id !== before?.id ? recorded?.id : entry.historicalBaselineId
    if (
      !before ||
      !offer ||
      saved.offerStatus[entry.offerId] !== 'received' ||
      (!legacyPending && !['approved', 'draft'].includes(entry.beforeStatus ?? '')) ||
      (historicalBaselineId !== undefined &&
        (typeof historicalBaselineId !== 'string' || before.status !== 'approved')) ||
      (offer.receipt &&
        (offer.receipt.revision !== entry.revision ||
          offer.receipt.baselineId !== (historicalBaselineId ?? before.id)))
    )
      throw Error('Invalid saved donation baseline.')
    const snapshot = snapshotOf(scenario),
      incoming = new Set((offer.receipt?.items ?? offer.items).map((i) => i.lot.id))
    const sourceFingerprint = snapshotFingerprint({
      ...snapshot,
      revision: snapshot.revision - 1,
      lots: snapshot.lots.filter((l) => !incoming.has(l.id)),
    })
    if (!legacyPending && entry.sourceFingerprint !== sourceFingerprint)
      throw Error('The saved donation source does not match the receipt.')
    const decision = after ? donationDecision(snapshot, before) : null
    if (decision) {
      if (
        !entry.selected ||
        !['keep', 'coverage'].includes(entry.selected) ||
        decision[entry.selected]?.id !== after!.id ||
        hash(decision[entry.selected]) !== hash(after)
      )
        throw Error('The saved alternative does not match its validated donation calculation.')
      decision.selected = entry.selected
    } else if (!legacyPending && entry.selected !== null)
      throw Error('Missing calculated donation alternative.')
    scenario.receiptComparison = {
      offerId: offer.id,
      revision: entry.revision,
      before,
      after,
      sourceFingerprint,
      ruleId: DONATION_RULE,
      decision,
      ...(historicalBaselineId ? { historicalBaselineId } : {}),
    }
  }
  for (const plan of [scenario.draft, scenario.approved]) {
    if (
      plan?.revision === scenario.revision &&
      (plan.fingerprint !== snapshotFingerprint(snapshotOf(scenario)) ||
        validatePlan(snapshotOf(scenario), plan).length)
    ) {
      throw Error('Invalid saved allocation.')
    }
  }
  if (scenario.draft?.revision === scenario.revision && !decisionBaseline(scenario))
    throw Error('Invalid saved planning context.')
  return scenario
}
