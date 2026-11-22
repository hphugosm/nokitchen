import { planningOptions } from './policyTypes'
import { selectPlan, slotKey, slotOnly } from './selection'
import type { Context } from './feasibility'
import type { Household, Recipe, Unfilled } from './types'
import { runPlanner } from './allocation'
import { byId, inspectMethods, makeContext } from './feasibility'
import { allocationDigest, snapshotFingerprint } from './fingerprint'
import { requestedPortions } from './packingLists'
import type { AllocationPlan, PlanningSnapshot, Slot } from './types'
import type {
  CandidateCheck,
  HouseholdCoverage,
  HouseholdDelta,
  IngredientBalance,
  PlanDiagnostics,
  PlannerComparison,
  PlannerSummary,
  SlotDiagnosis,
} from './analysisTypes'

export { slotKey, slotOnly } from './selection'

export function coverageRows(
  snapshot: PlanningSnapshot,
  plan: AllocationPlan,
): HouseholdCoverage[] {
  return snapshot.households
    .map((h) => {
      const requested = requestedPortions(h)
      const allocated = plan.allocations
        .filter((a) => a.householdId === h.id)
        .reduce((n, a) => n + a.portions, 0)
      const missing = plan.unfilled.filter((a) => a.householdId === h.id)
      const coveragePercent = requested ? (100 * allocated) / requested : null
      return {
        householdId: h.id,
        allocated,
        requested,
        uncovered: requested - allocated,
        coveragePercent,
        percent: Math.round(coveragePercent ?? 0),
        unfilledSlots: missing.length,
        unfilledDays: [...new Set(missing.map((u) => u.day))].sort((a, b) => a - b),
      }
    })
    .sort(
      (a, b) =>
        (a.coveragePercent ?? Infinity) - (b.coveragePercent ?? Infinity) ||
        byId({ id: a.householdId }, { id: b.householdId }),
    )
}

function balances(snapshot: PlanningSnapshot, plan: AllocationPlan): IngredientBalance[] {
  const left = new Map(snapshot.ingredients.map((i) => [i.id, 0]))
  for (const lot of snapshot.lots)
    if (lot.received) {
      left.set(lot.ingredientId, (left.get(lot.ingredientId) ?? 0) + lot.quantityBaseUnits)
    }
  for (const a of plan.allocations)
    for (const line of a.reservations) {
      left.set(line.ingredientId, left.get(line.ingredientId)! - line.quantity)
    }
  return snapshot.ingredients.map((i) => ({
    ingredientId: i.id,
    unit: i.unit,
    remaining: left.get(i.id)!,
  }))
}

// Rank independently assessed alternatives; equipment-blocked methods remain available for inspection.
function alternativeOrder(a: CandidateCheck, b: CandidateCheck): number {
  const fixedCount = (c: CandidateCheck) =>
    c.reasons.filter(
      (r) =>
        [
          'MISSING_APPLIANCE',
          'MISSING_UTILITY',
          'ALLERGEN_CONFLICT',
          'EXCLUDED_INGREDIENT',
          'NEEDS_REVIEW',
        ].includes(r.code) ||
        (r.code === 'MISSING_TOOL' && !r.ingredientId),
    ).length
  return (
    fixedCount(a) - fixedCount(b) ||
    a.reasons.length - b.reasons.length ||
    byId({ id: a.recipeId }, { id: b.recipeId }) ||
    byId({ id: a.methodId }, { id: b.methodId })
  )
}

export function diagnosePlan(snapshot: PlanningSnapshot, plan: AllocationPlan): PlanDiagnostics {
  if (plan.fingerprint !== snapshotFingerprint(snapshot))
    throw new Error('This plan is out of date. Recalculate before inspecting unmet meals.')
  const unfilled: SlotDiagnosis[] = []
  const inspect = (ctx: Context, h: Household, slot: Unfilled, recipes: Recipe[]) => {
    const checks = recipes.map((recipe) => inspectMethods(ctx, h, recipe, slot.day, slot.requested))
    unfilled.push({
      ...slotOnly(slot),
      requested: slot.requested,
      noCompatibleRecipe: !checks.some((c) => c.compatible),
      candidates: checks.flatMap((c) => c.candidates).sort(alternativeOrder),
    })
  }
  const residual =
    plan.strategy === 'meal-coverage-first' && plan.selection?.winner !== 'fresh-legacy'
  if (residual) {
    const ctx = makeContext(snapshot)
    for (const a of plan.allocations)
      for (const r of a.reservations)
        ctx.remaining.set(r.lotId, ctx.remaining.get(r.lotId)! - r.quantity)
    for (const u of plan.unfilled) {
      inspect(
        ctx,
        snapshot.households.find((h) => h.id === u.householdId)!,
        u,
        snapshot.recipes.filter((r) => r.mealTypes.includes(u.meal)),
      )
    }
  } else {
    const replay = runPlanner(
      snapshot,
      plan.strategy === 'reference-first-fit' ? 'reference-first-fit' : 'nokitchen',
      inspect,
    )
    if (
      allocationDigest(replay) !== allocationDigest(plan) ||
      replay.unfilled.length !== plan.unfilled.length ||
      new Set([...replay.unfilled, ...plan.unfilled].map(slotKey)).size !== plan.unfilled.length
    )
      throw new Error('The plan does not match a replay of its allocation decisions.')
  }
  return {
    fingerprint: plan.fingerprint,
    planId: plan.id,
    context: residual ? 'Based on stock remaining after this plan' : 'At the allocation decision',
    households: coverageRows(snapshot, plan),
    unfilled,
    remaining: balances(snapshot, plan),
  }
}

export function householdDeltas(
  before: HouseholdCoverage[],
  after: HouseholdCoverage[],
): HouseholdDelta[] {
  const previous = new Map(before.map((h) => [h.householdId, h]))
  return after
    .map((row) => {
      const old = previous.get(row.householdId)!
      return {
        householdId: row.householdId,
        before: old.allocated,
        after: row.allocated,
        delta: row.allocated - old.allocated,
        percentagePoints:
          row.coveragePercent === null || old.coveragePercent === null
            ? null
            : row.coveragePercent - old.coveragePercent,
      }
    })
    .sort((a, b) => byId({ id: a.householdId }, { id: b.householdId }))
}

function summary(snapshot: PlanningSnapshot, plan: AllocationPlan): PlannerSummary {
  const households = coverageRows(snapshot, plan)
  return {
    plan,
    households,
    remaining: balances(snapshot, plan),
    lowestCoverage: households[0]?.coveragePercent ?? null,
    zeroHouseholds: households.filter((h) => h.requested > 0 && h.allocated === 0).length,
  }
}

export function comparePlanners(snapshot: PlanningSnapshot): PlannerComparison {
  const reference = summary(snapshot, runPlanner(snapshot, 'reference-first-fit'))
  const selected = selectPlan(snapshot, planningOptions())
  const nokitchen = summary(snapshot, selected)
  return {
    context: selected.selection.context,
    fingerprint: nokitchen.plan.fingerprint,
    reference,
    nokitchen,
    deltas: householdDeltas(reference.households, nokitchen.households),
  }
}
