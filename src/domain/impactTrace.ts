import { slotKey, slotOnly } from './selection'
import { chronology } from './variety'
import {
  collectionForDay,
  type Allocation,
  type AllocationPlan,
  type Collection,
  type DonationItem,
  type Meal,
  type PlanningSnapshot,
  type Slot,
} from './types'

type ChangeKind = 'filled' | 'removed' | 'changed' | 'unchanged'
export interface AssignmentChange extends Slot {
  kind: ChangeKind
  before: Allocation | null
  after: Allocation | null
}

// Lots are part of what the bank promises. Ignore incidental reservation array order.
function claims(a: Allocation) {
  const quantities = new Map<string, number>()
  for (const line of a.reservations) {
    const id = JSON.stringify([line.ingredientId, line.lotId])
    quantities.set(id, (quantities.get(id) ?? 0) + line.quantity)
  }
  return quantities
}
function sameAssignment(a: Allocation, b: Allocation) {
  if (a.recipeId !== b.recipeId || a.methodId !== b.methodId || a.portions !== b.portions)
    return false
  const left = claims(a),
    right = claims(b)
  return (
    left.size === right.size && [...left].every(([key, quantity]) => right.get(key) === quantity)
  )
}

export function assignmentChanges(
  before: AllocationPlan,
  after: AllocationPlan,
): AssignmentChange[] {
  const original = new Map(before.allocations.map((a) => [slotKey(a), a]))
  const next = new Map(after.allocations.map((a) => [slotKey(a), a]))
  return [...new Set([...original.keys(), ...next.keys()])]
    .map((key) => {
      const a = original.get(key) ?? null,
        b = next.get(key) ?? null
      const kind: ChangeKind = !a
        ? 'filled'
        : !b
          ? 'removed'
          : sameAssignment(a, b)
            ? 'unchanged'
            : 'changed'
      return { ...slotOnly((a ?? b)!), before: a, after: b, kind }
    })
    .sort((a, b) => a.householdId.localeCompare(b.householdId, 'en') || chronology(a, b))
}

interface BoxContribution {
  day: number
  meal: Meal
  recipeId: string
  methodId: string
  portions: number
  lotId: string
  source: string
  before: number
  after: number
  delta: number
  beforePackages: number | null
  afterPackages: number | null
}

/** Tie the ingredient total printed on each box to the actual meal reservations behind it. */
export function boxIngredientTrace(
  snapshot: PlanningSnapshot,
  before: AllocationPlan,
  after: AllocationPlan,
  householdId: string,
  collectionDay: Collection,
  ingredientId: string,
  incomingItems: DonationItem[] = [],
) {
  const lots = new Map([...snapshot.lots, ...incomingItems.map((i) => i.lot)].map((l) => [l.id, l]))
  const lines = new Map<string, BoxContribution>()
  function read(plan: AllocationPlan, side: 'before' | 'after') {
    const box = plan.packingLists.find(
      (b) => b.householdId === householdId && b.collectionDay === collectionDay,
    )
    const items = new Map(
      (box?.items ?? []).filter((i) => i.ingredientId === ingredientId).map((i) => [i.lotId, i]),
    )
    for (const a of plan.allocations) {
      if (a.householdId !== householdId || collectionForDay(a.day) !== collectionDay) continue
      for (const r of a.reservations) {
        if (r.ingredientId !== ingredientId) continue
        const key = JSON.stringify([a.day, a.meal, a.recipeId, a.methodId, a.portions, r.lotId])
        const lot = lots.get(r.lotId),
          boxed = items.get(r.lotId)
        const line = lines.get(key) ?? {
          day: a.day,
          meal: a.meal,
          recipeId: a.recipeId,
          methodId: a.methodId,
          portions: a.portions,
          lotId: r.lotId,
          source: [lot?.sourceOfferId, lot?.provenance].filter(Boolean).join(' · ') || r.lotId,
          before: 0,
          after: 0,
          delta: 0,
          beforePackages: null,
          afterPackages: null,
        }
        line[side] += r.quantity
        if (boxed?.packages) {
          const packSize = boxed.quantity / boxed.packages
          const field = side === 'before' ? 'beforePackages' : 'afterPackages'
          line[field] = line[side] / packSize
        }
        lines.set(key, line)
      }
    }
    return [...items.values()].reduce((sum, item) => sum + item.quantity, 0)
  }
  const oldQuantity = read(before, 'before'),
    newQuantity = read(after, 'after')
  const changes = [...lines.values()]
    .map((line) => {
      // For sealed packages a missing contribution corresponds to zero packages on that side.
      if (!line.before && line.afterPackages !== null) line.beforePackages = 0
      if (!line.after && line.beforePackages !== null) line.afterPackages = 0
      return { ...line, delta: line.after - line.before }
    })
    .filter((line) => line.delta || line.beforePackages !== line.afterPackages)
    .sort(
      (a, b) =>
        chronology(a, b) ||
        a.recipeId.localeCompare(b.recipeId, 'en') ||
        a.lotId.localeCompare(b.lotId, 'en'),
    )
  return {
    before: oldQuantity,
    after: newQuantity,
    delta: newQuantity - oldQuantity,
    lines: changes,
  }
}
