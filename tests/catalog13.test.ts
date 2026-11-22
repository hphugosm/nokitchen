import { expect, it } from 'vitest'
import { catalog, seedHouseholds, seedLots } from '../src/data'
import { catalogRows, declaredDiets } from '../src/data/catalogCompatibility'
import { assessRecipe, validatePlan } from '../src/domain/engine'
import { planningOptions } from '../src/domain/policyTypes'
import { selectPlan } from '../src/domain/selection'
import {
  catalog as frozen,
  seedHouseholds as priorHouseholds,
  seedLots as priorLots,
} from './frozen12/src/data'

const snapshot = () =>
  structuredClone({
    ...catalog,
    households: seedHouseholds,
    lots: seedLots,
    revision: 0,
  })

it('preserves the old ingredients, amounts, methods, household setups and opening lots', () => {
  expect(seedHouseholds).toEqual(priorHouseholds)
  expect(catalog.appliances).toEqual(frozen.appliances)
  for (const { provenance, ...prior } of frozen.ingredients) {
    expect(catalog.ingredients.find((i) => i.id === prior.id)).toMatchObject(prior)
  }
  for (const prior of frozen.recipes)
    expect(catalog.recipes.find((r) => r.id === prior.id)).toMatchObject(prior)
  expect(seedLots.filter((l) => !l.id.startsWith('N13-'))).toEqual(priorLots)
})

it('counts meals and shared families once, and gives each new product required use and a usable declaration', () => {
  const required = new Set(catalog.recipes.flatMap((r) => r.required.map((q) => q.ingredientId)))
  expect(catalog.ingredients).toHaveLength(50)
  expect(catalog.recipes).toHaveLength(40)
  expect(catalog.recipes.filter((r) => r.mealTypes.includes('breakfast'))).toHaveLength(10)
  expect(
    catalog.recipes.filter((r) => r.mealTypes.includes('lunch') || r.mealTypes.includes('dinner')),
  ).toHaveLength(30)
  expect(catalog.appliances).toHaveLength(6)
  expect(new Set(catalog.recipes.map((r) => r.familyId))).toHaveLength(21)
  expect(catalog.recipes.find((r) => r.id === 'R01')!.familyId).toEqual(
    catalog.recipes.find((r) => r.id === 'R21')!.familyId,
  )
  for (const recipe of catalog.recipes) {
    expect(recipe.provenance).toMatch(/synthetic/)
    expect(recipe.familyId).toBeTruthy()
  }
  const priorIds = new Set(frozen.ingredients.map((i) => i.id))
  const added = catalog.ingredients.filter((i) => !priorIds.has(i.id))
  expect(added).toHaveLength(20)
  const lots = seedLots.filter((l) => l.id.startsWith('N13-'))
  expect(lots).toHaveLength(22)
  for (const i of added) {
    expect(required.has(i.id), i.name).toBe(true)
    expect(lots.some((l) => l.ingredientId === i.id && l.packageKind && l.received)).toBe(true)
  }
  for (const i of catalog.ingredients) {
    expect(i.aliases!.length).toBeGreaterThanOrEqual(2)
    expect(i.edibleBasis?.length).toBeGreaterThan(10)
    expect(i.provenance).toMatch(/Synthetic/)
    expect(i.declaration).toBe('declared')
    expect(i.allergens).not.toBeNull()
  }
})

it('distinguishes methods, whole batches and joint assigned recipes in both limited kitchens', () => {
  const s = snapshot()
  const plan = selectPlan(s, planningOptions())
  expect(validatePlan(s, plan)).toEqual([])
  for (const household of s.households.slice(0, 2)) {
    for (const day of [0, 4]) {
      const rows = catalogRows(s, household, day, plan)
      const possible = rows.filter((r) => r.batch.feasible)
      const families = (breakfast: boolean) =>
        new Set(
          possible
            .filter((r) => r.recipe.mealTypes.includes('breakfast') === breakfast)
            .map((r) => r.recipe.familyId),
        )
      expect(families(true).size).toBeGreaterThanOrEqual(2)
      expect(families(false).size).toBeGreaterThanOrEqual(4)
      expect(possible.every((r) => r.kitchenMethods.length > 0)).toBe(true)
      expect(rows.filter((r) => r.allocated > 0).every((r) => r.batch.feasible)).toBe(true)
      const lunch = catalogRows(s, household, day, plan, 'lunch')
      expect(lunch.reduce((n, r) => n + r.allocated, 0)).toBe(
        plan.allocations
          .filter((a) => a.householdId === household.id && a.meal === 'lunch' && a.day === day)
          .reduce((n, a) => n + a.portions, 0),
      )
      expect(lunch.reduce((n, r) => n + r.weekPortions, 0)).toBe(
        plan.allocations
          .filter((a) => a.householdId === household.id && a.meal === 'lunch')
          .reduce((n, a) => n + a.portions, 0),
      )
    }
  }
  const data = catalogRows(s, s.households[0], 0, plan)
  const yogurt = data.find((r) => r.recipe.id === 'R03')!
  expect(yogurt.kitchenMethods).toContain('R03-cold')
  expect(yogurt.batch.feasible).toBe(false)
  const dip = s.recipes.find((r) => r.id === 'R28')!
  expect(assessRecipe(s, s.households[0], dip, 0).feasible).toBe(false)
  expect(assessRecipe(s, s.households[0], dip, 4).reservations).toContainEqual({
    lotId: 'LOT-012',
    ingredientId: 'ready_beans',
    quantity: 200,
  })
})

it('requires received ready-rice packs and declared allergens, independently of method availability', () => {
  const s = snapshot()
  const h = s.households[0]
  const rice = s.recipes.find((r) => r.id === 'R26')!
  const hummus = s.recipes.find((r) => r.id === 'R24')!
  expect(assessRecipe(s, h, rice, 0).feasible).toBe(true)
  for (const l of s.lots.filter((l) => l.ingredientId === 'ready_rice' && l.availableFromDay === 0))
    l.received = false
  expect(assessRecipe(s, h, rice, 0).feasible).toBe(false)
  expect(assessRecipe(s, h, rice, 4).feasible).toBe(true)
  expect(assessRecipe(s, { ...h, allergens: ['sesame'] }, hummus, 0).feasible).toBe(false)
  expect(declaredDiets(hummus, s.ingredients)).toContain('vegan')
  const item = s.ingredients.find((i) => i.id === 'hummus')!
  item.declaration = 'unknown'
  item.allergens = null
  expect(declaredDiets(hummus, s.ingredients)).toBeNull()
  expect(assessRecipe(s, h, hummus, 0).feasible).toBe(false)
})
