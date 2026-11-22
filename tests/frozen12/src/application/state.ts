import { catalog, sampleOffers, seedHouseholds, seedLots } from '../data'
import { applyHypothesis } from '../domain/analysis'
import type { ChosenAction } from '../domain/analysisTypes'
import { planningOptions } from '../domain/policyTypes'
import { selectPlan } from '../domain/selection'
import { contextFor, snapshotFingerprint } from '../domain/fingerprint'
import { validatePlan } from '../domain/engine'
import { validateStockLot } from '../domain/validation'
import { MEALS, TOOLS, UTILITIES } from '../domain/types'
import type { AllocationPlan, DonationOffer, Household, StockLot } from '../domain/types'
import { decisionBaseline, reservedByLot, snapshotOf } from './selectors'

export interface Scenario {
  schemaVersion: 3
  revision: number
  households: Household[]
  lots: StockLot[]
  proposals: DonationOffer[]
  offerStatus: Partial<Record<string, DonationOffer['status']>>
  draft: AllocationPlan | null
  previousDraft: AllocationPlan | null
  approved: AllocationPlan | null
}

export function createSeed(): Scenario {
  const fresh: Scenario = {
    schemaVersion: 3,
    revision: 1,
    households: structuredClone(seedHouseholds),
    lots: structuredClone(seedLots),
    proposals: [],
    offerStatus: {},
    draft: null,
    previousDraft: null,
    approved: null,
  }
  return { ...fresh, draft: selectPlan(snapshotOf(fresh), planningOptions()) }
}

export type Action =
  | { type: 'recalculate' }
  | { type: 'approve'; planId: string | undefined }
  | { type: 'release' }
  | { type: 'household'; household: Household }
  | { type: 'stock'; lotId: string; quantity: number }
  | { type: 'offer'; id: string; step: 'load' | 'review' | 'receive' }
  | { type: 'preview'; chosen: ChosenAction }
  | { type: 'reset' }

export function assertHousehold(household: Household) {
  if (
    !Number.isSafeInteger(household.peopleCount) ||
    household.peopleCount < 1 ||
    !Number.isSafeInteger(household.peopleCount * 21 * 300)
  ) {
    throw Error('Enter a positive whole number of people within the supported range.')
  }
  function check(values: string[], allowed: readonly string[], field: string) {
    if (
      !Array.isArray(values) ||
      values.some((value) => !allowed.includes(value)) ||
      new Set(values).size !== values.length
    ) {
      throw Error('Check the selected ' + field + '.')
    }
  }
  if (
    !Array.isArray(household.collectionDays) ||
    household.collectionDays.some((day) => day !== 0 && day !== 4) ||
    !Array.isArray(household.dietaryPreferences) ||
    household.dietaryPreferences.some((p) => typeof p !== 'string') ||
    (household.requestedSlots !== undefined &&
      (!Array.isArray(household.requestedSlots) ||
        household.requestedSlots.some(
          (s) =>
            !s || !Number.isInteger(s.day) || s.day < 0 || s.day > 6 || !MEALS.includes(s.meal),
        )))
  )
    throw Error('Invalid collection days, preferences or meal requests.')
  check(
    household.appliances,
    catalog.appliances.map((a) => a.id),
    'devices',
  )
  check(household.utilities, UTILITIES, 'utilities')
  check(household.tools, TOOLS, 'tools')
  check(household.storage, ['fridge', 'freezer'], 'storage')
  check(
    household.excludedIngredientIds,
    catalog.ingredients.map((i) => i.id),
    'excluded ingredients',
  )
  check(
    household.allergens,
    catalog.ingredients.flatMap((i) => i.allergens ?? []),
    'allergen restrictions',
  )
  if (
    household.appliances.includes('hob')
      ? ![1, 2].includes(household.burners)
      : household.burners !== 0
  ) {
    throw Error('Select one or two burners for a hob, or zero without a hob.')
  }
}

function updateOffer(state: Scenario, id: string, step: 'load' | 'review' | 'receive'): Scenario {
  const offer = [...sampleOffers, ...state.proposals].find((item) => item.id === id)
  if (!offer) throw Error('Sample offer not found.')
  const status = state.offerStatus[id]
  if (step === 'load') {
    return status ? state : { ...state, offerStatus: { ...state.offerStatus, [id]: 'offered' } }
  }
  if (!status) throw Error('Load the sample offer first.')
  if (status === 'received') return state
  if (step === 'review') {
    return status === 'reviewed'
      ? state
      : { ...state, offerStatus: { ...state.offerStatus, [id]: 'reviewed' } }
  }
  if (status !== 'reviewed') throw Error('Review the structured offer before confirming receipt.')
  const existing = new Set(state.lots.map((lot) => lot.id))
  const ingredientIds = new Set(catalog.ingredients.map((ingredient) => ingredient.id))
  const lots = offer.items.map(({ unit, lot }) => {
    const ingredient = catalog.ingredients.find((item) => item.id === lot.ingredientId)
    if (
      !ingredient ||
      ingredient.unit !== unit ||
      ingredient.reviewStatus !== 'demo' ||
      ingredient.declaration !== 'declared' ||
      !Array.isArray(ingredient.allergens) ||
      lot.reviewStatus !== 'demo' ||
      lot.quantityBaseUnits < 1 ||
      validateStockLot(lot, ingredientIds).length > 0 ||
      existing.has(lot.id)
    ) {
      throw Error(
        'The offer contains an unresolved product, quantity, or lot. Receipt requires review.',
      )
    }
    existing.add(lot.id)
    return { ...lot, received: true, sourceOfferId: id }
  })
  return {
    ...state,
    revision: state.revision + 1,
    lots: [...state.lots, ...lots],
    offerStatus: { ...state.offerStatus, [id]: 'received' },
  }
}

export function applyAction(state: Scenario, action: Action): Scenario {
  switch (action.type) {
    case 'preview': {
      const { fingerprint, targetHouseholdId, action: change } = action.chosen
      const base = snapshotOf(state)
      const incumbent = decisionBaseline(state)
      if (
        !incumbent ||
        snapshotFingerprint(base) !== fingerprint ||
        contextFor(base, planningOptions(incumbent)).key !== action.chosen.contextKey
      )
        throw Error('This preview is out of date. Analyze the current inputs again.')
      const projected = applyHypothesis(base, targetHouseholdId, change)
      if (change.kind !== 'donation') {
        const household = projected.households.find((entry) => entry.id === targetHouseholdId)
        if (!household) throw Error('Select a current household.')
        const edited = applyAction(state, { type: 'household', household })
        return {
          ...edited,
          previousDraft: incumbent,
          draft: selectPlan(snapshotOf(edited), planningOptions(incumbent)),
        }
      }
      const lot = projected.lots.find((entry) => entry.id === change.lot.id)
      const ingredient = base.ingredients.find((entry) => entry.id === lot?.ingredientId)
      if (!lot?.sourceOfferId || !ingredient) throw Error('The proposed lot is incomplete.')
      const id = lot.sourceOfferId
      if (state.proposals.some((offer) => offer.id === id)) return state
      if (sampleOffers.some((offer) => offer.id === id))
        throw Error('This offer ID is already in use.')
      const proposal: DonationOffer = {
        id,
        source: 'proposal',
        sender: 'Local planning proposal',
        email: '',
        status: 'offered',
        subject: change.label,
        body: 'Proposed supply from the scenario preview. Review the package and receipt day before confirming delivery.',
        items: [{ unit: ingredient.unit, lot: { ...lot, received: false } }],
      }
      return {
        ...state,
        proposals: [...state.proposals, proposal],
        offerStatus: { ...state.offerStatus, [id]: 'offered' },
      }
    }
    case 'reset':
      return createSeed()
    case 'recalculate': {
      if (decisionBaseline(state)) return state
      const incumbent = state.draft ?? state.approved
      const draft = selectPlan(snapshotOf(state), planningOptions(incumbent))
      return { ...state, draft, previousDraft: incumbent }
    }
    case 'approve': {
      const draft = decisionBaseline(state)
      if (
        !draft ||
        draft.revision !== state.revision ||
        draft.fingerprint !== snapshotFingerprint(snapshotOf(state)) ||
        draft.id !== action.planId
      )
        throw Error('This draft is out of date. Recalculate before approving.')
      if (state.approved?.id === draft.id && state.approved.revision === state.revision)
        return state
      const issues = validatePlan(snapshotOf(state), draft)
      if (issues.length) throw Error('Approval failed. ' + issues[0])
      return { ...state, approved: { ...draft, status: 'approved' } }
    }
    case 'release':
      return state.approved ? { ...state, approved: null, revision: state.revision + 1 } : state
    case 'stock': {
      const lot = state.lots.find((item) => item.id === action.lotId)
      if (!lot) throw Error('Lot not found.')
      const quantity = action.quantity
      if (!Number.isSafeInteger(quantity) || quantity < 0)
        throw Error('Enter a nonnegative whole quantity in the ingredient’s base unit.')
      const reserved = reservedByLot(state.approved)[lot.id] ?? 0
      if (quantity < reserved)
        throw Error(
          'This plan reserves ' +
            reserved +
            ' base units from the lot. Release the approved plan before reducing stock below that amount.',
        )
      if (!lot.canRepack && quantity % lot.packageSize !== 0)
        throw Error('Sealed lots can only be edited in whole packages of ' + lot.packageSize + '.')
      if (quantity === lot.quantityBaseUnits) return state
      const replacement = {
        ...lot,
        quantityBaseUnits: quantity,
        packageCount: lot.canRepack ? null : quantity / lot.packageSize,
      }
      return {
        ...state,
        revision: state.revision + 1,
        lots: state.lots.map((item) => (item.id === lot.id ? replacement : item)),
      }
    }
    case 'household': {
      const updated = structuredClone(action.household)
      const original = state.households.find((item) => item.id === updated.id)
      if (!original) throw Error('Household not found.')
      assertHousehold(updated)
      updated.name = original.name
      updated.collectionDays = original.collectionDays
      if (JSON.stringify(original) === JSON.stringify(updated)) return state
      return {
        ...state,
        revision: state.revision + 1,
        households: state.households.map((item) => (item.id === updated.id ? updated : item)),
      }
    }
    case 'offer':
      return updateOffer(state, action.id, action.step)
  }
}
