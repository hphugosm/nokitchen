import { coverageRows, diagnosePlan } from './comparison'
import { planningOptions } from './policyTypes'
import { contextFor } from './fingerprint'
import { selectPlan, comparePlanChanges } from './selection'
import { validatePlan } from './validatePlan'
import { byId, ingredientReasons, lotReason, makeContext, methodReasons } from './feasibility'
import { collectionForDay, DAYS } from './types'
import type { AllocationPlan, Household, PlanningSnapshot, StockLot } from './types'
import type { ActionAnalysis, ActionResult, TestedAction } from './analysisTypes'

function targetHousehold(snapshot: PlanningSnapshot, id: string): Household {
  const target = snapshot.households.find((h) => h.id === id)
  if (!target) throw new Error('Select a household from this scenario.')
  return target
}

function changedHousehold(
  snapshot: PlanningSnapshot,
  h: Household,
  action: Exclude<TestedAction, { kind: 'donation' }>,
): Household {
  if (action.kind === 'can_opener') {
    if (h.tools.includes('can_opener')) throw new Error('This household already has a can opener.')
    return { ...h, tools: [...h.tools, 'can_opener'] }
  }
  if (
    !snapshot.appliances.some((a) => a.id === action.applianceId) ||
    h.appliances.includes(action.applianceId)
  ) {
    throw new Error('Select an available appliance this household does not already have.')
  }
  return {
    ...h,
    appliances: [...h.appliances, action.applianceId],
    burners: action.applianceId === 'hob' ? 1 : h.burners,
  }
}

export function applyHypothesis(
  snapshot: PlanningSnapshot,
  householdId: string,
  action: TestedAction,
): PlanningSnapshot {
  const h = targetHousehold(snapshot, householdId)
  if (action.kind === 'donation') {
    const { lot } = action
    const known = snapshot.ingredients.find((i) => i.id === lot.ingredientId)
    if (
      !known ||
      !lot.id ||
      !lot.sourceOfferId ||
      !lot.received ||
      lot.quantityBaseUnits <= 0 ||
      snapshot.lots.some((l) => l.id === lot.id || l.sourceOfferId === lot.sourceOfferId) ||
      ingredientReasons(
        makeContext(snapshot),
        { ...h, allergens: [], excludedIngredientIds: [] },
        lot.ingredientId,
      ).length ||
      lotReason(lot, h, lot.availableFromDay)?.code === 'NEEDS_REVIEW'
    )
      throw new Error('The proposed lot is invalid or already present.')
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      lots: [...snapshot.lots, structuredClone(lot)],
    }
  }
  const next = changedHousehold(snapshot, h, action)
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    households: snapshot.households.map((row) => (row.id === h.id ? next : row)),
  }
}

function stockAction(
  snapshot: PlanningSnapshot,
  h: Household,
  base: AllocationPlan,
): TestedAction | undefined {
  const ctx = makeContext(snapshot)
  const unmet = base.unfilled.filter((s) => s.householdId === h.id)
  for (const slot of unmet)
    for (const gap of slot.reasons) {
      if (gap.code !== 'INSUFFICIENT_STOCK' || !gap.ingredientId || !gap.missingQuantity) continue
      const product = ctx.ingredients.get(gap.ingredientId)
      if (!product || ingredientReasons(ctx, h, product.id).length) continue
      const templates = ctx.lotsByIngredient.get(product.id) ?? []
      for (const template of templates) {
        if (lotReason(template, h, slot.day)) continue
        const unitSize = template.canRepack ? 1 : template.packageSize
        const quantity = Math.ceil(gap.missingQuantity / unitSize) * unitSize
        const pickup = collectionForDay(slot.day)
        const offerId = ['proposal', h.id, template.id, quantity, pickup].join('-')
        const lot: StockLot = {
          ...template,
          id: offerId + '-lot',
          sourceOfferId: offerId,
          availableFromDay: pickup,
          quantityBaseUnits: quantity,
          packageCount: template.canRepack ? null : quantity / unitSize,
          received: true,
          provenance: 'Hypothetical supply matching demo lot ' + template.id,
        }
        if (snapshot.lots.some((l) => l.id === lot.id)) continue
        return {
          kind: 'donation',
          id: offerId,
          label:
            'Propose ' +
            quantity +
            ' ' +
            product.unit +
            ' of ' +
            product.name +
            ' for ' +
            DAYS[pickup] +
            ' collection',
          lot,
        }
      }
    }
}

function suggestions(
  snapshot: PlanningSnapshot,
  h: Household,
  base: AllocationPlan,
): TestedAction[] {
  const actions: TestedAction[] = []
  if (!h.tools.includes('can_opener'))
    actions.push({
      kind: 'can_opener',
      id: 'equipment-' + h.id + '-can-opener',
      label: 'Add a can opener',
    })
  const options = snapshot.appliances.filter((a) => !h.appliances.includes(a.id)).sort(byId)
  const missingMeals = new Set(
    base.unfilled.filter((s) => s.householdId === h.id).map((s) => s.meal),
  )
  const methods = snapshot.recipes
    .filter((r) => r.mealTypes.some((m) => missingMeals.has(m)))
    .flatMap((r) => r.methods)
  const ctx = makeContext(snapshot)
  const ranked = options
    .map((appliance) => {
      const matching = methods.filter((m) => m.appliances.includes(appliance.id))
      const withDevice: Household = {
        ...h,
        appliances: [...h.appliances, appliance.id],
        burners: appliance.id === 'hob' ? 1 : h.burners,
      }
      return {
        appliance,
        methods: matching.length,
        unlocked: matching.filter((m) => methodReasons(ctx, withDevice, m).length === 0).length,
      }
    })
    .filter((a) => a.methods > 0)
    .sort(
      (a, b) => b.unlocked - a.unlocked || b.methods - a.methods || byId(a.appliance, b.appliance),
    )
  for (const { appliance } of ranked.slice(0, 2))
    actions.push({
      kind: 'appliance',
      id: 'equipment-' + h.id + '-' + appliance.id,
      applianceId: appliance.id,
      label: 'Add ' + (appliance.id === 'hob' ? 'a one-burner electric hob' : appliance.name),
    })
  const donation = stockAction(snapshot, h, base)
  if (donation) actions.push(donation)
  return actions
}

export function suggestActions(
  snapshot: PlanningSnapshot,
  householdId: string,
  baselinePlan?: AllocationPlan,
): TestedAction[] {
  if (baselinePlan && validatePlan(snapshot, baselinePlan).length)
    throw Error('Recalculate the baseline before suggesting changes.')
  return suggestions(
    snapshot,
    targetHousehold(snapshot, householdId),
    baselinePlan ?? selectPlan(snapshot, planningOptions()),
  )
}

export function evaluateActions(
  snapshot: PlanningSnapshot,
  householdId: string,
  actions?: TestedAction[],
  baselinePlan?: AllocationPlan,
): ActionAnalysis {
  const h = targetHousehold(snapshot, householdId)
  const base = baselinePlan ?? selectPlan(snapshot, planningOptions())
  if (baselinePlan && validatePlan(snapshot, base).length)
    throw new Error(
      'The captured baseline is out of date or invalid. Recalculate before previewing changes.',
    )
  const options = planningOptions(base)
  const context = contextFor(snapshot, options)
  const before = coverageRows(snapshot, base).find((row) => row.householdId === h.id)!
  const totalBefore = base.metrics.allocated
  const results = (actions ?? suggestions(snapshot, h, base)).map((action): ActionResult => {
    try {
      const input = applyHypothesis(snapshot, householdId, action)
      const next = selectPlan(input, options)
      const changes = comparePlanChanges(base, next)
      const after = coverageRows(input, next).find((row) => row.householdId === h.id)!
      const targetDelta = after.allocated - before.allocated
      const losses = changes.deltas.some((row) => row.delta < 0)
      const group =
        targetDelta > 0
          ? losses
            ? 'tradeoff'
            : 'helps'
          : changes.deltas.some((row) => row.delta !== 0)
            ? 'system_change'
            : 'no_gain'
      const active = diagnosePlan(input, next).unfilled.filter((slot) => slot.householdId === h.id)
      let check = active[0]?.candidates[0]
      if (action.kind === 'appliance') {
        const matches = (recipeId: string, methodId: string) =>
          input.recipes
            .find((r) => r.id === recipeId)
            ?.methods.find((m) => m.id === methodId)
            ?.appliances.includes(action.applianceId)
        check =
          active.flatMap((s) => s.candidates).find((c) => matches(c.recipeId, c.methodId)) ?? check
      }
      return {
        action,
        group,
        selection: next.selection,
        assignmentsRetained:
          next.selection.winner === 'retain' || next.selection.winner === 'extend',
        targetBefore: before.allocated,
        targetAfter: after.allocated,
        targetPercentBefore: before.coveragePercent,
        targetPercentAfter: after.coveragePercent,
        totalBefore,
        totalAfter: next.metrics.allocated,
        ...changes,
        remainingBlockers: check?.reasons ?? [],
      }
    } catch (error) {
      return {
        action,
        group: 'invalid',
        selection: null,
        assignmentsRetained: false,
        error: error instanceof Error ? error.message : 'Invalid proposed change.',
        targetBefore: before.allocated,
        targetAfter: before.allocated,
        totalBefore,
        totalAfter: totalBefore,
        targetPercentBefore: before.coveragePercent,
        targetPercentAfter: before.coveragePercent,
        ...comparePlanChanges(base, base),
        remainingBlockers: [],
      }
    }
  })
  return { context, fingerprint: base.fingerprint, targetHouseholdId: h.id, results }
}
