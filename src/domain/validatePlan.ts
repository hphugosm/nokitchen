import { snapshotFingerprint } from './fingerprint'
import { fixedReasons, lotReason, makeContext, methodReasons } from './feasibility'
import { buildPackingLists, packingEvidence, planMetrics } from './packingLists'
import { collectionForDay, DAYS, MEALS, requestForSlot } from './types'
import type { AllocationPlan, PlanningSnapshot, Slot } from './types'

export function validatePlan(snapshot: PlanningSnapshot, plan: AllocationPlan): string[] {
  const errors = validatePlanContent(snapshot, plan)
  if (plan.fingerprint !== snapshotFingerprint(snapshot) || plan.revision !== snapshot.revision)
    errors.unshift('Plan inputs are out of date.')
  return errors
}

// An existing approval can still be carried out after an input change. Audit its actual
// assignments and packing lists without rewriting the historical revision or fingerprint.
export function validatePlanContent(snapshot: PlanningSnapshot, plan: AllocationPlan): string[] {
  if (plan.schemaVersion !== 1) return ['Unsupported plan schema.']
  const errors: string[] = []
  const ctx = makeContext(snapshot)
  const households = new Map(snapshot.households.map((h) => [h.id, h]))
  const recipes = new Map(snapshot.recipes.map((r) => [r.id, r]))
  const slots = new Set<string>()
  const quantities = new Map<string, number>()
  const slotKey = (s: Slot) => [s.householdId, s.day, s.meal].join('|')
  function checkSlot(slot: Slot, portions: number) {
    const key = slotKey(slot)
    const household = households.get(slot.householdId)
    if (slots.has(key)) errors.push('Duplicate meal slot ' + key)
    slots.add(key)
    if (
      !household ||
      portions <= 0 ||
      !Number.isInteger(slot.day) ||
      slot.day < 0 ||
      slot.day >= DAYS.length ||
      !MEALS.includes(slot.meal) ||
      requestForSlot(household, slot.day, slot.meal) !== portions
    )
      errors.push('Invalid household meal slot or batch size ' + key)
    return household
  }

  for (const a of plan.allocations) {
    const household = checkSlot(a, a.portions)
    const recipe = recipes.get(a.recipeId)
    const method = recipe?.methods.find((m) => m.id === a.methodId)
    if (
      !household ||
      !recipe ||
      !method ||
      recipe.reviewStatus !== 'demo' ||
      !recipe.mealTypes.includes(a.meal) ||
      !recipe.required.length ||
      !household.collectionDays.includes(collectionForDay(a.day))
    ) {
      errors.push('Invalid recipe, method or collection for ' + slotKey(a))
      continue
    }
    errors.push(...methodReasons(ctx, household, method).map((r) => r.message))
    const expected = new Map(
      recipe.required.map((line) => [line.ingredientId, line.quantity * a.portions]),
    )
    errors.push(...fixedReasons(ctx, household, recipe, a.day).map((r) => r.message))
    const supplied = new Map<string, number>()
    for (const line of a.reservations) {
      const lot = ctx.lotsById.get(line.lotId)
      if (
        !lot ||
        lot.ingredientId !== line.ingredientId ||
        !expected.has(line.ingredientId) ||
        !Number.isSafeInteger(line.quantity) ||
        line.quantity <= 0 ||
        (!lot.canRepack && line.quantity % lot.packageSize !== 0)
      ) {
        errors.push('Invalid reservation on ' + line.lotId)
        continue
      }
      const failure = lotReason(lot, household, a.day)
      if (failure) errors.push(failure.message)
      supplied.set(line.ingredientId, (supplied.get(line.ingredientId) ?? 0) + line.quantity)
      quantities.set(lot.id, (quantities.get(lot.id) ?? 0) + line.quantity)
    }
    for (const [id, amount] of expected) {
      if (supplied.get(id) !== amount)
        errors.push('Reservation does not cover the exact batch of ' + id + ' in ' + slotKey(a))
    }
  }
  for (const u of plan.unfilled) {
    checkSlot(u, u.requested)
    if (!u.reasons.length) errors.push('Unexplained empty meal slot ' + slotKey(u))
  }
  for (const h of households.values())
    for (let day = 0; day < DAYS.length; day++)
      for (const meal of MEALS) {
        if (
          requestForSlot(h, day, meal) > 0 &&
          !slots.has(slotKey({ householdId: h.id, day, meal }))
        )
          errors.push('Missing meal slot ' + [h.id, day, meal].join('|'))
      }
  for (const [id, quantity] of quantities) {
    if (quantity > ctx.lotsById.get(id)!.quantityBaseUnits)
      errors.push('Reservations exceed on-hand stock for ' + id)
  }
  const metrics = planMetrics(snapshot.households, plan.allocations)
  if (
    Object.entries(metrics).some(([key, val]) => plan.metrics[key as keyof typeof metrics] !== val)
  )
    errors.push('Coverage totals do not match the allocations.')
  if (plan.allocations.every((a) => a.reservations.every((r) => ctx.lotsById.has(r.lotId)))) {
    const expected = buildPackingLists(snapshot, plan.allocations)
    if (
      JSON.stringify(packingEvidence(plan.packingLists)) !==
      JSON.stringify(packingEvidence(expected))
    )
      errors.push('Packing lists do not reconcile with meal reservations.')
  }
  return errors
}
