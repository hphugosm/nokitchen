import { describe, expect, it } from 'vitest'
import {
  assessRecipe,
  buildPackingLists,
  generatePlan,
  standaloneCapacity,
  validatePlan,
} from '../src/domain/engine'
import type {
  Household,
  Ingredient,
  PlanningSnapshot,
  Recipe,
  RecipeMethod,
  StockLot,
} from '../src/domain/types'

const ingredient = (id: string): Ingredient => ({
  id,
  name: id,
  group: 'Pantry',
  unit: 'g',
  allergens: [],
  declaration: 'declared',
  dietaryTags: [],
  provenance: 'Test label',
  reviewStatus: 'demo',
  storage: 'ambient',
})
const method: RecipeMethod = {
  id: 'cold',
  name: 'No heat',
  appliances: [],
  tools: ['bowl'],
  utilities: [],
  water: 'No added water.',
  steps: ['Serve in a bowl.'],
  minutes: 2,
}
function household(id: string, peopleCount: number): Household {
  return {
    id,
    name: id,
    peopleCount,
    appliances: [],
    burners: 0,
    tools: ['bowl'],
    storage: [],
    utilities: [],
    allergens: [],
    excludedIngredientIds: [],
    dietaryPreferences: [],
    collectionDays: [0, 4],
  }
}
function lot(
  id: string,
  ingredientId: string,
  quantityBaseUnits: number,
  changes: Partial<StockLot> = {},
): StockLot {
  return {
    id,
    ingredientId,
    quantityBaseUnits,
    received: true,
    availableFromDay: 0,
    usableThroughDay: 6,
    storage: 'ambient',
    afterOpening: 'ambient',
    canRepack: true,
    packageSize: 1,
    packageCount: null,
    requiresCanOpener: false,
    provenance: 'Test lot',
    reviewStatus: 'demo',
    ...changes,
  }
}
const recipe: Recipe = {
  id: 'meal',
  name: 'Test meal',
  mealTypes: ['breakfast', 'lunch', 'dinner'],
  required: [{ ingredientId: 'grain', quantity: 80 }],
  optional: [{ ingredientId: 'herbs', quantity: 1 }],
  methods: [method],
  reviewStatus: 'demo',
}
const snapshot = (): PlanningSnapshot => ({
  revision: 1,
  appliances: [
    { id: 'hob', name: 'Hob' },
    { id: 'microwave', name: 'Microwave' },
  ],
  recipes: [structuredClone(recipe)],
  ingredients: ['grain', 'herbs'].map(ingredient),
  lots: [lot('G1', 'grain', 240), lot('H1', 'herbs', 100)],
  households: [household('home-one', 3), household('home-two', 3)],
})
function check(s: PlanningSnapshot, day = 0) {
  return assessRecipe(s, s.households[0], s.recipes[0], day)
}

describe('model-week allocation', () => {
  it('shares the final full batch across all recipes and households, without issuing optional ingredients', () => {
    const s = snapshot()
    s.recipes.push({ ...s.recipes[0], id: 'same-grain' })
    for (const r of s.recipes) expect(standaloneCapacity(s, s.households[0], r, 0)).toBe(3)
    const plan = generatePlan(s)
    expect(plan.allocations).toHaveLength(1)
    expect(plan.allocations[0].portions).toBe(3)
    expect(plan.allocations[0].reservations).toEqual([
      { lotId: 'G1', ingredientId: 'grain', quantity: 240 },
    ])
    expect(plan.metrics).toEqual({ requested: 126, allocated: 3, uncovered: 123, percent: 2 })
    expect(plan.unfilled).toHaveLength(41)
    expect(validatePlan(s, plan)).toEqual([])
  })
  it('leaves the ledger intact after a failed recipe and reports the actual gap', () => {
    const s = snapshot()
    const incomplete = {
      ...s.recipes[0],
      id: 'incomplete',
      required: [...s.recipes[0].required, { ingredientId: 'beans', quantity: 80 }],
    }
    s.ingredients.push(ingredient('beans'))
    s.recipes.unshift(incomplete)
    s.lots.push(lot('B1', 'beans', 120))
    const result = check(s)
    expect(result.reservations).toEqual([])
    expect(result.reasons).toContainEqual(
      expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        ingredientId: 'beans',
        missingQuantity: 120,
      }),
    )
    expect(generatePlan(s).allocations[0]).toMatchObject({
      recipeId: 'meal',
      reservations: [{ lotId: 'G1', quantity: 240 }],
    })
  })
  it('treats method requirements as conjunctions and selects an explicitly compatible alternative', () => {
    const s = snapshot()
    const h = s.households[0]
    h.tools.push('microwave_safe_container')
    h.appliances.push('microwave')
    h.utilities.push('electricity')
    s.recipes[0].methods = [
      {
        ...method,
        id: 'one',
        appliances: ['hob'],
        tools: ['pot_with_lid'],
        utilities: ['electricity'],
      },
      {
        ...method,
        id: 'two',
        appliances: ['microwave'],
        tools: ['microwave_safe_container'],
        utilities: ['electricity'],
      },
    ]
    expect(check(s)).toMatchObject({ feasible: true, methodId: 'two' })
    h.tools = []
    h.utilities = []
    expect(new Set(check(s).reasons.map((r) => r.code))).toEqual(
      new Set(['MISSING_APPLIANCE', 'MISSING_TOOL', 'MISSING_UTILITY']),
    )
  })
  it('rejects allergen conflicts, exclusions and uncertain product declarations', () => {
    const s = snapshot()
    s.ingredients[0].allergens = ['milk']
    s.households[0].allergens = ['milk']
    expect(check(s).reasons[0].code).toBe('ALLERGEN_CONFLICT')
    s.households[0].allergens = []
    s.households[0].excludedIngredientIds = ['grain']
    expect(check(s).reasons[0].code).toBe('EXCLUDED_INGREDIENT')
    s.households[0].excludedIngredientIds = []
    for (const declaration of ['unknown', 'contradictory'] as const) {
      s.ingredients[0].declaration = declaration
      expect(check(s).reasons[0].code).toBe('NEEDS_REVIEW')
    }
    s.ingredients[0].declaration = 'declared'
    s.ingredients[0].allergens = null
    expect(check(s).feasible).toBe(false)
  })
  it('respects collection windows, inclusive expiry, and household storage through the meal', () => {
    const s = snapshot()
    Object.assign(s.lots[0], {
      availableFromDay: 4,
      usableThroughDay: 5,
      storage: 'freezer',
      afterOpening: 'freezer',
    })
    s.households[0].storage = ['fridge']
    expect(check(s, 3).reasons.map((r) => r.code)).toContain('UNAVAILABLE_BY_PICKUP')
    expect(check(s, 4).reasons.map((r) => r.code)).toContain('STORAGE_UNSUPPORTED')
    s.households[0].storage.push('freezer')
    expect(check(s, 5).feasible).toBe(true)
    expect(check(s, 6).reasons.map((r) => r.code)).toContain('EXPIRES_BEFORE_MEAL')
    const plan = generatePlan(s)
    expect(plan.allocations.map((a) => a.day)).toEqual([4])
    s.households[0].collectionDays = [0]
    expect(check(s, 4).feasible).toBe(false)
  })
  it('checks opener and review at the lot, excludes offers, and uses sealed ambient packages in full', () => {
    const s = snapshot()
    s.lots[0] = lot('tin', 'grain', 240, {
      canRepack: false,
      packageSize: 80,
      packageCount: 3,
      requiresCanOpener: true,
      afterOpening: 'fridge',
    })
    expect(check(s).reasons.map((r) => r.code)).toContain('MISSING_TOOL')
    s.lots.push({ ...s.lots[0], id: 'pull-tab', requiresCanOpener: false })
    expect(check(s).reservations.map((line) => line.lotId)).toEqual(['pull-tab'])
    s.lots[s.lots.length - 1].received = false
    expect(check(s).feasible).toBe(false)
    s.lots[0].requiresCanOpener = false
    s.lots[0].reviewStatus = 'needs_review'
    expect(check(s).reasons.map((r) => r.code)).toContain('NEEDS_REVIEW')
    s.lots[0].reviewStatus = 'demo'
    s.lots[0].packageCount = 4
    expect(check(s).reasons.map((r) => r.code)).toContain('NEEDS_REVIEW')
    s.lots[0].canRepack = true
    expect(check(s).reasons.map((r) => r.code)).toContain('NEEDS_REVIEW')
    s.lots[0].packageCount = null
    s.lots[0].availableFromDay = -1
    expect(check(s).reasons.map((r) => r.code)).toContain('NEEDS_REVIEW')
    s.lots[0].availableFromDay = 0
    Object.assign(s.lots[0], { requiresCanOpener: 'false' })
    expect(check(s).reasons.map((r) => r.code)).toContain('NEEDS_REVIEW')
  })
  it('finds exact heterogeneous package combinations, and distinguishes indivisibility from a quantity gap', () => {
    const s = snapshot()
    s.households[0].peopleCount = 1
    s.recipes[0].required[0].quantity = 10
    s.lots = [
      lot('a', 'grain', 6, {
        canRepack: false,
        packageSize: 6,
        packageCount: 1,
        usableThroughDay: 2,
      }),
      lot('b', 'grain', 10, { canRepack: false, packageSize: 5, packageCount: 2 }),
    ]
    expect(check(s).reservations).toEqual([{ lotId: 'b', ingredientId: 'grain', quantity: 10 }])
    s.recipes[0].required[0].quantity = 4
    expect(check(s).reasons[0].code).toBe('PACK_SIZE_MISMATCH')
    expect(standaloneCapacity(s, s.households[0], s.recipes[0], 0)).toBe(4)
    s.lots = [lot('pack', 'grain', 120, { canRepack: false, packageSize: 60, packageCount: 2 })]
    s.recipes[0].required[0].quantity = 40
    expect(standaloneCapacity(s, s.households[0], s.recipes[0], 0)).toBe(3)
    expect(check(s).feasible).toBe(false)
  })
  it('rotates ties, gives fewer-choice households priority and rotates recipes where feasible', () => {
    const s = snapshot()
    s.recipes[0].mealTypes = ['lunch']
    expect(generatePlan(s).allocations[0].householdId).toBe('home-two')
    s.recipes.push({
      ...s.recipes[0],
      id: 'herb',
      required: [{ ingredientId: 'herbs', quantity: 1 }],
    })
    s.households[0].excludedIngredientIds.push('herbs')
    expect(generatePlan(s).allocations[0].householdId).toBe('home-one')
    s.households = [s.households[1]]
    s.lots[0].quantityBaseUnits = 10000
    const plan = generatePlan(s)
    expect(new Set(plan.allocations.slice(0, 2).map((a) => a.recipeId)).size).toBe(2)
  })
  it('is deterministic and leaves its snapshot unchanged, including after planning repeatedly', () => {
    const s = snapshot()
    const original = structuredClone(s)
    expect(generatePlan(s)).toEqual(generatePlan(s))
    expect(s).toEqual(original)
  })
  it('reconciles collection links, exact package counts and reservations and rejects tampering', () => {
    const s = snapshot()
    s.households = [s.households[0]]
    s.lots[0] = lot('tin', 'grain', 480, { canRepack: false, packageSize: 80, packageCount: 6 })
    s.lots.push({
      ...s.lots[0],
      id: 'fri',
      availableFromDay: 4,
      quantityBaseUnits: 240,
      packageCount: 3,
    })
    const plan = generatePlan(s)
    const boxes = buildPackingLists(s, plan.allocations)
    expect(
      boxes.map((b) => b.items.map((item) => [item.lotId, item.quantity, item.packages])),
    ).toEqual([[['tin', 480, 6]], [['fri', 240, 3]]])
    expect(boxes.flatMap((b) => b.meals)).toHaveLength(3)
    expect(validatePlan(s, plan)).toEqual([])
    plan.packingLists[0].items[0].quantity -= 1
    expect(validatePlan(s, plan)).toContain(
      'Packing lists do not reconcile with meal reservations.',
    )
    plan.allocations[0].reservations[0].lotId = 'fri'
    expect(
      validatePlan(s, plan).some((message) =>
        message.includes('unavailable for the Monday collection'),
      ),
    ).toBe(true)
    plan.allocations[0].reservations[0].quantity = 241
    expect(validatePlan(s, plan)).toContain('Invalid reservation on fri')
  })
})
