import { expect, it } from 'vitest'
import { catalog, sampleOffers, seedHouseholds, seedLots } from '../src/data'
import { auditRecipe, packageDescription } from '../src/domain/audit'
import { assessRecipe, buildPackingLists, generatePlan, validatePlan } from '../src/domain/engine'
import type { Allocation, Household, PlanningSnapshot } from '../src/domain/types'

function seed(): PlanningSnapshot {
  return structuredClone({ ...catalog, households: seedHouseholds, lots: seedLots, revision: 1 })
}

it('demonstrates every authored method with a real household and exactly its required ingredients and packages', () => {
  const s = seed()
  for (const recipe of s.recipes) {
    expect(auditRecipe(s, recipe).passed, recipe.id).toBe(true)
    for (const method of recipe.methods) {
      // Specify the method explicitly so another method cannot hide a broken one.
      const only = { ...recipe, methods: [method] }
      const cases = s.households.flatMap((h) =>
        [0, 4].map((day) => ({ h, day, result: assessRecipe(s, h, only, day) })),
      )
      const witness = cases.find((c) => c.result.feasible)
      expect(witness, method.id).toBeDefined()
      const { h, day, result } = witness!
      const allocation: Allocation = {
        householdId: h.id,
        day,
        meal: recipe.mealTypes[0],
        recipeId: recipe.id,
        methodId: method.id,
        portions: h.peopleCount,
        reservations: result.reservations,
      }
      const list = buildPackingLists(s, [allocation]).find(
        (b) => b.householdId === h.id && b.collectionDay === day,
      )!
      const totals = new Map<string, number>()
      for (const item of list.items) {
        totals.set(item.ingredientId, (totals.get(item.ingredientId) ?? 0) + item.quantity)
        const lot = s.lots.find((l) => l.id === item.lotId)!
        expect(item.packages).toBe(lot.canRepack ? null : item.quantity / lot.packageSize)
        if (!lot.canRepack) expect(Number.isInteger(item.packages)).toBe(true)
      }
      expect(totals).toEqual(
        new Map(recipe.required.map((a) => [a.ingredientId, a.quantity * h.peopleCount])),
      )
      const withoutTool = { ...h, tools: h.tools.filter((t) => t !== method.tools[0]) }
      expect(assessRecipe(s, withoutTool, only, day).reasons.map((r) => r.code)).toContain(
        'MISSING_TOOL',
      )
    }
  }
})

it('keeps H01 on actual no-opener lots and never issues an inaccessible can to complete an undersized batch', () => {
  const s = seed()
  const r07 = s.recipes.find((r) => r.id === 'R07')!
  const h01 = s.households.find((h) => h.id === 'H01')!
  const donorLot = sampleOffers[0].items.find(
    (item) => item.lot.ingredientId === 'ready_beans',
  )!.lot
  const pull = { ...donorLot, received: true, packageCount: 1, quantityBaseUnits: 200 }
  const standard = {
    ...s.lots.find((lot) => lot.id === 'LOT-011')!,
    packageCount: 1,
    quantityBaseUnits: 200,
  }
  s.recipes = [r07]
  s.lots = [
    pull,
    standard,
    ...s.lots.filter((l) => ['tortilla', 'sweetcorn'].includes(l.ingredientId)),
  ]
  s.households = [
    {
      ...h01,
      requestedSlots: [
        { day: 0, meal: 'lunch' },
        { day: 0, meal: 'dinner' },
      ],
    },
  ]
  const closed = generatePlan(s)
  expect(closed.allocations).toHaveLength(1)
  expect(closed.unfilled).toHaveLength(1)
  expect(
    closed.allocations[0].reservations.filter((r) => r.ingredientId === 'ready_beans'),
  ).toEqual([{ lotId: pull.id, ingredientId: 'ready_beans', quantity: 200 }])
  expect(validatePlan(s, closed)).toEqual([])
  const twoPerson = assessRecipe(s, { ...h01, peopleCount: 2 }, r07, 0)
  expect(twoPerson.feasible).toBe(false)
  expect(twoPerson.reservations).toEqual([])
  expect(twoPerson.reasons).toContainEqual(
    expect.objectContaining({ ingredientId: 'ready_beans', missingQuantity: 200 }),
  )
  const equipped: Household = { ...s.households[0], tools: [...h01.tools, 'can_opener'] }
  const changed = { ...s, households: [equipped] }
  const open = generatePlan(changed)
  expect(open.allocations).toHaveLength(2)
  expect(
    open.allocations
      .flatMap((a) => a.reservations)
      .filter((r) => r.ingredientId === 'ready_beans')
      .map((r) => r.lotId)
      .sort(),
  ).toEqual([standard.id, pull.id].sort())
  expect(validatePlan(changed, open)).toEqual([])
})

it('keeps undeclared lids generic and routes internally contradictory access declarations to review', () => {
  const s = seed()
  const r07 = s.recipes.find((r) => r.id === 'R07')!
  const beans = s.lots.find((l) => l.id === 'LOT-011')!
  expect(packageDescription({ ...beans, packageKind: undefined, requiresCanOpener: false })).toBe(
    'Sealed package · No can opener required',
  )
  beans.packageKind = 'pull_tab_can'
  const report = auditRecipe(s, r07)
  expect(report.findings).toContainEqual(
    expect.objectContaining({
      code: 'LOT_REVIEW',
      severity: 'review',
      recipeId: 'R07',
      ingredientId: 'ready_beans',
      lotId: beans.id,
    }),
  )
  expect(packageDescription(beans)).toContain('need review')
  expect(assessRecipe(s, s.households[2], r07, 0).reasons.map((r) => r.code)).toContain(
    'NEEDS_REVIEW',
  )
  const product = s.ingredients.find((i) => i.id === 'tortilla')!
  product.declaration = 'unknown'
  product.allergens = null
  const finding = auditRecipe(s, r07).findings.find((f) => f.code === 'PRODUCT_REVIEW')
  expect(finding).toMatchObject({ severity: 'blocker', recipeId: 'R07', ingredientId: 'tortilla' })
})
