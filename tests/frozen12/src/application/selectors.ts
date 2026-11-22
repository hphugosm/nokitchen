import { catalog, seedHouseholds, seedLots, sampleOffers } from '../data'
import { contextFor, allocationDigest } from '../domain/fingerprint'
import { planningOptions, type ApprovalReview } from '../domain/policyTypes'
import { comparePlanChanges } from '../domain/selection'
import type { AllocationPlan, PlanningSnapshot } from '../domain/types'
import type { Scenario } from './state'
import type { WorkspaceUI } from './uiContract'

export function snapshotOf(state: Scenario): PlanningSnapshot {
  return { ...catalog, revision: state.revision, households: state.households, lots: state.lots }
}

export function reservedByLot(plan: AllocationPlan | null): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const allocation of plan?.allocations ?? []) {
    for (const line of allocation.reservations) {
      totals[line.lotId] = (totals[line.lotId] ?? 0) + line.quantity
    }
  }
  return totals
}

export function displayedPlan(state: Scenario): Pick<WorkspaceUI, 'plan' | 'planLabel'> {
  const current = decisionBaseline(state)
  if (current) {
    if (state.approved?.id === current.id) return { plan: state.approved, planLabel: 'Approved' }
    return { plan: current, planLabel: 'Draft' }
  }
  const plan = state.draft ?? state.approved
  return { plan, planLabel: plan ? 'Out of date' : 'No plan' }
}

export function decisionBaseline(state: Scenario): AllocationPlan | null {
  const draft = state.draft
  if (
    !draft ||
    draft.revision !== state.revision ||
    draft.strategy !== 'meal-coverage-first' ||
    !draft.selection
  )
    return null
  const expected = contextFor(snapshotOf(state), planningOptions(state.previousDraft))
  const context = draft.selection.context
  return !!context &&
    Object.entries(expected).every(
      ([key, value]) => context[key as keyof typeof expected] === value,
    ) &&
    draft.fingerprint === expected.snapshotFingerprint &&
    draft.selection.allocationDigest === allocationDigest(draft)
    ? draft
    : null
}

export function scenarioName(state: Scenario): string {
  const receipts = [...sampleOffers, ...state.proposals].filter(
    (o) => state.offerStatus[o.id] === 'received',
  )
  const profilesChanged = JSON.stringify(seedHouseholds) !== JSON.stringify(state.households)
  const expectedLots = [...seedLots, ...receipts.flatMap((o) => o.items.map((i) => i.lot))]
  const editedStock =
    state.lots.length !== expectedLots.length ||
    state.lots.some((l) => {
      const original = expectedLots.find((s) => s.id === l.id)
      return (
        !original ||
        original.quantityBaseUnits !== l.quantityBaseUnits ||
        original.reviewStatus !== l.reviewStatus
      )
    })
  const notes = receipts.map((o) =>
    o.id === 'OFFER-01'
      ? 'Monday tortilla donation received'
      : o.id === 'OFFER-02'
        ? 'Friday soup donation received'
        : o.subject + ' received',
  )
  if (editedStock) notes.push('edited inventory')
  if (profilesChanged) {
    const h = state.households.find((h) => h.id === 'H01')
    notes.push(
      h?.tools.includes('can_opener')
        ? 'updated households (H01 has an opener)'
        : 'updated households',
    )
  }
  return notes.length ? 'Full week · ' + notes.join(' · ') : 'Initial full week'
}

export function reviewForApproval(state: Scenario): ApprovalReview | null {
  const draft = decisionBaseline(state)
  const prior = state.approved ?? state.previousDraft
  if (!draft || !prior || prior.id === draft.id) return null
  return {
    ...comparePlanChanges(prior, draft),
    basis: state.approved ? 'Active approved plan' : 'Previous draft',
    before: prior.metrics.allocated,
    after: draft.metrics.allocated,
    beforeDigest: allocationDigest(prior),
  }
}
