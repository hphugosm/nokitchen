import { catalog, sampleOffers, seedHouseholds, seedLots } from '../data'
import { applyHypothesis } from '../domain/analysis'
import type { ChosenAction } from '../domain/analysisTypes'
import { planningOptions } from '../domain/policyTypes'
import {
  MODEL_WEEK,
  type OfferRow,
  type PastedOffer,
  type DonationDecision,
  type DonationChoice,
  DONATION_RULE,
} from '../domain/donorTypes'
import {
  savePaste,
  updateOffer,
  chooseDonationCandidate,
  recalculateReceipt,
} from './donorCommands'
import { improveVariety, selectPlan } from '../domain/selection'
import { contextFor, snapshotFingerprint } from '../domain/fingerprint'
import { validatePlan } from '../domain/engine'
import { MEALS, TOOLS, UTILITIES } from '../domain/types'
import type { AllocationPlan, DonationOffer, Household, StockLot } from '../domain/types'
import { decisionBaseline, reservedByLot, snapshotOf } from './selectors'

export interface Scenario {
  schemaVersion: 4
  weekStart: string
  seedKind: 'expanded' | 'migrated'
  receiptComparison: {
    offerId: string
    revision: number
    before: AllocationPlan
    after: AllocationPlan | null
    sourceFingerprint: string
    historicalBaselineId?: string
    ruleId: typeof DONATION_RULE
    decision: DonationDecision | null
  } | null
  varietyNote: string | null
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
    schemaVersion: 4,
    weekStart: MODEL_WEEK,
    seedKind: 'expanded',
    receiptComparison: null,
    varietyNote: null,
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
  | { type: 'chooseDonationCandidate'; offerId: string; key: string; choice: DonationChoice }
  | { type: 'improveVariety'; planId: string }
  | { type: 'savePaste'; doc: PastedOffer; expectedVersion: number | null }
  | { type: 'approve'; planId: string | undefined }
  | { type: 'release' }
  | { type: 'household'; household: Household }
  | { type: 'stock'; lotId: string; quantity: number }
  | {
      type: 'offer'
      id: string
      step: 'load' | 'review' | 'receive'
      actualRows?: OfferRow[]
      confirmDifferences?: boolean
      expectedVersion?: number
    }
  | { type: 'preview'; chosen: ChosenAction }
  | { type: 'reset'; acknowledgedMail?: string[] }

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
    case 'savePaste':
      return savePaste(state, action.doc, action.expectedVersion)
    case 'improveVariety': {
      const base = decisionBaseline(state)
      if (!base || base.id !== action.planId)
        throw Error('The draft changed. Recalculate before improving variety.')
      const result = improveVariety(snapshotOf(state), base)
      return result.improved
        ? { ...state, previousDraft: base, draft: result.plan, varietyNote: result.reason }
        : { ...state, varietyNote: result.reason }
    }
    case 'reset': {
      if (
        action.acknowledgedMail &&
        state.proposals.some(
          (o) =>
            o.document?.message.kind === 'agentboxd' &&
            state.offerStatus[o.id] === 'received' &&
            !action.acknowledgedMail!.includes(o.id),
        )
      ) {
        throw Error('Another delivery was recorded. Review the current workspace before resetting.')
      }
      return createSeed()
    }
    case 'chooseDonationCandidate':
      return chooseDonationCandidate(state, action.offerId, action.key, action.choice)
    case 'recalculate': {
      if (decisionBaseline(state)) return state
      const pending = state.receiptComparison
      const isReceipt = pending?.revision === state.revision && !pending.after
      if (isReceipt) return recalculateReceipt(state, pending)
      const incumbent = state.draft ?? state.approved
      const draft = selectPlan(snapshotOf(state), planningOptions(incumbent))
      return {
        ...state,
        draft,
        previousDraft:
          incumbent?.status === 'approved' ? { ...incumbent, status: 'draft' } : incumbent,
        varietyNote: null,
        receiptComparison: null,
      }
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
      return state.approved
        ? { ...state, approved: null, revision: state.revision + 1, receiptComparison: null }
        : state
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
        receiptComparison: null,
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
        receiptComparison: null,
        households: state.households.map((item) => (item.id === updated.id ? updated : item)),
      }
    }
    case 'offer':
      return updateOffer(
        state,
        action.id,
        action.step,
        action.actualRows,
        action.confirmDifferences,
        action.expectedVersion,
      )
  }
}
