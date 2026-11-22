import { catalog, sampleOffers, seedHouseholds, seedLots } from '../data'
import { catalogFingerprint, snapshotFingerprint } from '../domain/fingerprint'
import { MEALS, type AllocationPlan, type StockLot } from '../domain/types'
import { assertHousehold, type Scenario } from './state'
import { decisionBaseline, reservedByLot, snapshotOf } from './selectors'
import { validateStockLot } from '../domain/validation'
import { validatePlan } from '../domain/engine'

export const STORAGE_KEY = 'nokitchen.scenario.v3'
export const PREVIOUS_STORAGE_KEY = 'nokitchen.scenario.v2'
export const LEGACY_STORAGE_KEY = 'nokitchen.scenario.v1'

type SavedScenario = Omit<Scenario, 'draft' | 'previousDraft' | 'approved' | 'schemaVersion'> & {
  schemaVersion: 1 | 2 | 3
  catalogFingerprint?: string
  plans: Record<string, AllocationPlan>
  draftId: string | null
  previousId: string | null
  approvedId: string | null
}

export function encodeScenario(state: Scenario): string {
  const { draft, previousDraft, approved, ...inputs } = state
  const plans: Record<string, AllocationPlan> = {}
  for (const plan of [draft, previousDraft, approved]) {
    if (plan) plans[plan.id] = plan
  }
  const saved: SavedScenario = {
    ...inputs,
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
  const kinds = ['fresh-legacy', 'retain', 'extend']
  const nonnegative = (value: number) => Number.isSafeInteger(value) && value >= 0
  return (
    !!context &&
    ['key', 'snapshotFingerprint', 'policyId', 'parametersId', 'engineVersion'].every(
      (k) => typeof context[k as keyof typeof context] === 'string',
    ) &&
    [context.incumbentDigest, context.incumbentEvidenceDigest].every(
      (d) => d === null || typeof d === 'string',
    ) &&
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
    ![1, 2, 3].includes(saved.schemaVersion) ||
    !Number.isSafeInteger(saved.revision) ||
    saved.revision < 1 ||
    !Array.isArray(saved.households) ||
    saved.households.length !== seedHouseholds.length ||
    !seedHouseholds.every((seed) => saved.households.some((current) => current.id === seed.id)) ||
    !Array.isArray(saved.lots) ||
    !saved.lots.every(validLot) ||
    new Set(saved.lots.map((lot) => lot.id)).size !== saved.lots.length ||
    !saved.offerStatus ||
    !saved.plans
  )
    throw Error('Invalid scenario format.')
  const migration =
    saved.schemaVersion !== 3 || saved.catalogFingerprint !== catalogFingerprint(catalog)
  const proposals = saved.schemaVersion === 1 ? [] : saved.proposals
  if (
    !Array.isArray(proposals) ||
    proposals.some(
      (offer) =>
        typeof offer.id !== 'string' ||
        offer.source !== 'proposal' ||
        !offer.items?.length ||
        !offer.items.every(
          (item) =>
            validLot(item.lot) &&
            !item.lot.received &&
            item.lot.sourceOfferId === offer.id &&
            catalog.ingredients.find((i) => i.id === item.lot.ingredientId)?.unit === item.unit,
        ),
    )
  )
    throw Error('Invalid saved proposal.')
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
      !offer.items.every((item) =>
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
    schemaVersion: 3,
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
