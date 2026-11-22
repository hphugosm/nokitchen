import { COLLECTIONS, collectionForDay, DAYS, MEALS, requestForSlot } from './types'
import type { Allocation, Household, Metrics, PackingList, PlanningSnapshot } from './types'
import { byId } from './feasibility'

export function requestedPortions(household: Household): number {
  return DAYS.reduce(
    (week, _day, day) =>
      week + MEALS.reduce((total, meal) => total + requestForSlot(household, day, meal), 0),
    0,
  )
}

export function planMetrics(households: Household[], allocations: Allocation[]): Metrics {
  const requested = households.reduce((sum, household) => sum + requestedPortions(household), 0)
  const allocated = allocations.reduce((sum, allocation) => sum + allocation.portions, 0)
  return {
    requested,
    allocated,
    uncovered: requested - allocated,
    percent: requested ? Math.round((100 * allocated) / requested) : 0,
  }
}

export function buildPackingLists(
  snapshot: PlanningSnapshot,
  allocations: Allocation[],
): PackingList[] {
  const lots = new Map(snapshot.lots.map((lot) => [lot.id, lot]))
  const lists: PackingList[] = []
  for (const household of [...snapshot.households].sort(byId)) {
    for (const collectionDay of COLLECTIONS) {
      const meals = allocations
        .filter((a) => a.householdId === household.id && collectionForDay(a.day) === collectionDay)
        .sort((a, b) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal))
      const quantities = new Map<string, number>()
      for (const meal of meals)
        for (const line of meal.reservations) {
          quantities.set(line.lotId, (quantities.get(line.lotId) ?? 0) + line.quantity)
        }
      const items = [...quantities]
        .sort(([a], [b]) => byId({ id: a }, { id: b }))
        .map(([lotId, quantity]) => {
          const lot = lots.get(lotId)
          if (!lot) throw new Error('Packing list references unknown lot ' + lotId)
          return {
            lotId,
            ingredientId: lot.ingredientId,
            quantity,
            packages: lot.canRepack ? null : quantity / lot.packageSize,
          }
        })
      lists.push({
        householdId: household.id,
        collectionDay,
        items,
        meals: meals.map(({ householdId, day, meal }) => ({ householdId, day, meal })),
      })
    }
  }
  return lists
}

// A packing list is a set of household boxes, each containing exact lot claims and meal links.
// Presentation order and JSON property insertion order do not change its accounting evidence.
export function packingEvidence(lists: PackingList[]) {
  const byFields = (a: unknown, b: unknown) => {
    const left = JSON.stringify(a),
      right = JSON.stringify(b)
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (!Array.isArray(lists)) return null
  return lists
    .map((box) => ({
      householdId: box?.householdId,
      collectionDay: box?.collectionDay,
      items: Array.isArray(box?.items)
        ? box.items
            .map((i) => ({
              lotId: i?.lotId,
              ingredientId: i?.ingredientId,
              quantity: i?.quantity,
              packages: i?.packages,
            }))
            .sort(byFields)
        : null,
      meals: Array.isArray(box?.meals)
        ? box.meals
            .map((s) => ({
              householdId: s?.householdId,
              day: s?.day,
              meal: s?.meal,
            }))
            .sort(byFields)
        : null,
    }))
    .sort(byFields)
}
