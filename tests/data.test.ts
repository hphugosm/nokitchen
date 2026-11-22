import { expect, it } from 'vitest'
import { catalog, sampleOffers, seedHouseholds, seedLots } from '../src/data'
import { recipeAllergens, validateCatalog, validateSeed } from '../src/domain/validation'
import { DAYS, MEALS, requestForSlot } from '../src/domain/types'

const snapshot = { ...catalog, households: seedHouseholds, lots: seedLots, revision: 0 }

it('validates the initial scenario and keeps every proposed receipt out of opening inventory', () => {
  expect(validateSeed()).toEqual([])
  const receivedIds = new Set(seedLots.map((lot) => lot.id))
  for (const offer of sampleOffers)
    for (const { lot } of offer.items) {
      expect(lot.received).toBe(false)
      expect(receivedIds.has(lot.id)).toBe(false)
    }
  expect(sampleOffers[1].items.every(({ lot }) => lot.availableFromDay === 4)).toBe(true)
})

it('derives demand from the people actually requesting meals', () => {
  const edited = seedHouseholds.map((household) =>
    household.id === 'H02' ? { ...household, peopleCount: 3 } : household,
  )
  const total = edited.reduce(
    (sum, household) =>
      sum +
      DAYS.reduce(
        (daily, _, day) =>
          daily + MEALS.reduce((n, meal) => n + requestForSlot(household, day, meal), 0),
        0,
      ),
    0,
  )
  expect(total).toBe(399)
  expect(validateCatalog({ ...snapshot, households: edited })).toEqual([])
})

it('detects a mismatched tin count, a missing tool for microwave cooking, and an unknown ingredient', () => {
  const changed = structuredClone(snapshot)
  const sealed = changed.lots.find((lot) => !lot.canRepack)!
  sealed.quantityBaseUnits += 1
  changed.recipes[0].methods[0].tools = ['spoon']
  changed.recipes[1].required[0].ingredientId = 'unknown_food'
  const errors = validateCatalog(changed).join(' ')
  expect(errors).toContain('Whole-package')
  expect(errors).toContain('microwave-safe')
  expect(errors).toContain('unknown_food')
})

it('derives recipe allergen declarations and flags uncertainty even when another declaration is known', () => {
  const bread = catalog.recipes.find((recipe) => recipe.id === 'R02')!
  expect(recipeAllergens(bread, catalog.ingredients)).toEqual({
    allergens: ['gluten', 'peanut'],
    reviewStatus: 'demo',
  })
  const changed = structuredClone(snapshot)
  const peanut = changed.ingredients.find((ingredient) => ingredient.id === 'peanut_butter')!
  peanut.allergens = null
  peanut.declaration = 'unknown'
  expect(recipeAllergens(bread, changed.ingredients)).toEqual({
    allergens: ['gluten'],
    reviewStatus: 'needs_review',
  })
  expect(validateCatalog(changed).join(' ')).toContain('needs review')
  peanut.reviewStatus = 'needs_review'
  expect(validateCatalog(changed)).toEqual([])
})

it('represents alternative cooking methods and the fixtures needed to distinguish them', () => {
  const h02 = seedHouseholds.find((h) => h.id === 'H02')!
  const r04 = catalog.recipes.find((r) => r.id === 'R04')!
  const r11 = catalog.recipes.find((r) => r.id === 'R11')!
  expect(h02.appliances).toEqual(['kettle'])
  expect(r04.methods[0].tools.every((tool) => h02.tools.includes(tool))).toBe(true)
  expect(r04.methods[0].water).toContain('packet')
  expect(r11.methods.map((method) => method.appliances)).toEqual([['hob'], ['rice_cooker']])
  expect(
    seedLots
      .filter((lot) => lot.ingredientId === 'ready_beans')
      .map((lot) => lot.requiresCanOpener)
      .sort(),
  ).toEqual([false, true])
})
