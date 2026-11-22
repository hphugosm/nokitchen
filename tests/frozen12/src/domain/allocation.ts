import { allocationDigest, snapshotFingerprint } from './fingerprint'
import { ENGINE_VERSION, PARAMETERS_ID } from './policyTypes'
import type { Strategy } from './analysisTypes'
import { assess, byId, makeContext } from './feasibility'
import type { Assessment, Context } from './feasibility'
import { buildPackingLists, planMetrics, requestedPortions } from './packingLists'
import { DAYS, MEALS, requestForSlot } from './types'
import type {
  Allocation,
  AllocationPlan,
  Household,
  PlanningSnapshot,
  Reason,
  Recipe,
  Unfilled,
} from './types'

interface Candidate {
  recipe: Recipe
  assessment: Assessment
}

function closestExplanation(candidates: Candidate[]): Reason[] {
  if (!candidates.length)
    return [{ code: 'NEEDS_REVIEW', message: 'No catalog recipe is available for this meal type.' }]
  // Show one concrete alternative per unfilled slot. Gaps from alternatives cannot be added together.
  const hard = (c: Candidate) =>
    c.assessment.reasons.filter(
      (r) => !['INSUFFICIENT_STOCK', 'PACK_SIZE_MISMATCH'].includes(r.code),
    ).length
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(!a.assessment.methodId) - Number(!b.assessment.methodId) ||
      hard(a) - hard(b) ||
      a.assessment.reasons.length - b.assessment.reasons.length ||
      byId(a.recipe, b.recipe),
  )
  return ranked[0].assessment.reasons
}

type OnUnfilled = (ctx: Context, household: Household, slot: Unfilled, recipes: Recipe[]) => void

export function runPlanner(
  snapshot: PlanningSnapshot,
  strategy: Strategy,
  onUnfilled?: OnUnfilled,
): AllocationPlan {
  return allocate(snapshot, strategy, [], onUnfilled)
}

/** The caller validates all fixed allocations, their packing lists, and shared supply first. */
export function extendAssignments(snapshot: PlanningSnapshot, fixed: Allocation[]): AllocationPlan {
  return allocate(snapshot, 'nokitchen', fixed)
}

function allocate(
  snapshot: PlanningSnapshot,
  strategy: Strategy,
  fixed: Allocation[],
  onUnfilled?: OnUnfilled,
): AllocationPlan {
  const ctx = makeContext(snapshot)
  const households = [...snapshot.households].sort(byId)
  if (
    new Set(households.map((h) => h.id)).size !== households.length ||
    households.some((h) => !Number.isSafeInteger(h.peopleCount) || h.peopleCount < 1)
  ) {
    throw new Error('Households must have distinct IDs and positive integer sizes.')
  }
  if (new Set(snapshot.recipes.map((r) => r.id)).size !== snapshot.recipes.length)
    throw new Error('Recipe IDs must be distinct.')
  const allocations: Allocation[] = [...fixed]
  const unfilled: Unfilled[] = []
  const history = new Map(
    households.map((h) => [
      h.id,
      { portions: 0, requested: requestedPortions(h), uses: new Map<string, number>() },
    ]),
  )

  const occupied = new Set<string>()
  for (const a of fixed) {
    occupied.add([a.householdId, a.day, a.meal].join('|'))
    const progress = history.get(a.householdId)!
    progress.portions += a.portions
    progress.uses.set(a.recipeId, (progress.uses.get(a.recipeId) ?? 0) + 1)
    for (const line of a.reservations)
      ctx.remaining.set(line.lotId, ctx.remaining.get(line.lotId)! - line.quantity)
  }

  for (let day = 0; day < DAYS.length; day++)
    for (const [mealIndex, meal] of MEALS.entries()) {
      const recipes = snapshot.recipes.filter((r) => r.mealTypes.includes(meal)).sort(byId)
      const choices = (household: Household): Candidate[] =>
        recipes.map((recipe) => ({
          recipe,
          assessment: assess(ctx, household, recipe, day, requestForSlot(household, day, meal)),
        }))
      const offset = (day * MEALS.length + mealIndex) % Math.max(1, households.length)
      const requesting = households.filter(
        (h) => requestForSlot(h, day, meal) > 0 && !occupied.has([h.id, day, meal].join('|')),
      )
      const order =
        strategy === 'reference-first-fit'
          ? requesting
          : requesting
              .map((household) => {
                const progress = history.get(household.id)!
                return {
                  household,
                  coverage: progress.portions / progress.requested,
                  choices: choices(household).filter((c) => c.assessment.feasible).length,
                  rotated:
                    (households.indexOf(household) - offset + households.length) %
                    households.length,
                }
              })
              .sort(
                (a, b) => a.coverage - b.coverage || a.choices - b.choices || a.rotated - b.rotated,
              )
              .map((entry) => entry.household)

      for (const household of order) {
        const progress = history.get(household.id)!
        const portions = requestForSlot(household, day, meal)
        const slot = { householdId: household.id, day, meal }
        const candidates = choices(household) // Earlier households in this slot have already reserved their batches.
        const viable = candidates.filter((c) => c.assessment.feasible)
        if (strategy === 'nokitchen')
          viable.sort(
            (a, b) =>
              (progress.uses.get(a.recipe.id) ?? 0) - (progress.uses.get(b.recipe.id) ?? 0) ||
              a.assessment.earliest - b.assessment.earliest ||
              a.assessment.scarcity - b.assessment.scarcity ||
              byId(a.recipe, b.recipe),
          )
        const winner = viable[0]
        if (!winner) {
          const failure = { ...slot, requested: portions, reasons: closestExplanation(candidates) }
          unfilled.push(failure)
          onUnfilled?.(ctx, household, failure, recipes)
          continue
        }
        const { recipe, assessment } = winner
        for (const line of assessment.reservations)
          ctx.remaining.set(line.lotId, ctx.remaining.get(line.lotId)! - line.quantity)
        allocations.push({
          ...slot,
          recipeId: recipe.id,
          methodId: assessment.methodId!,
          portions,
          reservations: assessment.reservations,
        })
        progress.portions += portions
        progress.uses.set(recipe.id, (progress.uses.get(recipe.id) ?? 0) + 1)
      }
    }
  const fingerprint = snapshotFingerprint(snapshot)
  return {
    fingerprint,
    strategy,
    id: [
      fingerprint,
      ENGINE_VERSION,
      PARAMETERS_ID,
      strategy,
      allocationDigest({ allocations }),
    ].join(':'),
    revision: snapshot.revision,
    schemaVersion: 1,
    status: 'draft',
    allocations,
    unfilled,
    packingLists: buildPackingLists(snapshot, allocations),
    metrics: planMetrics(households, allocations),
  }
}

export function generatePlan(snapshot: PlanningSnapshot): AllocationPlan {
  return runPlanner(snapshot, 'nokitchen')
}
