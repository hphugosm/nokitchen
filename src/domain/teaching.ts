import { TOOLS, UTILITIES } from './types'
import type { Household, PlanningSnapshot, Recipe, StockLot } from './types'

export function teachingScenario(
  source: PlanningSnapshot,
  example: 'teaching' | 'neutral',
): PlanningSnapshot {
  const recipes = ['R05', 'R11'].map((id) => {
    const recipe = source.recipes.find((r) => r.id === id)
    if (!recipe) throw new Error('The teaching example needs recipe ' + id + '.')
    return structuredClone(recipe)
  })
  const cook = (id: string, name: string, appliances: string[]): Household => ({
    id,
    name,
    appliances,
    peopleCount: 1,
    burners: appliances.includes('hob') ? 1 : 0,
    tools: [...TOOLS],
    storage: ['fridge', 'freezer'],
    utilities: [...UTILITIES],
    allergens: [],
    excludedIngredientIds: [],
    dietaryPreferences: [],
    collectionDays: [0],
    requestedSlots: [{ day: 0, meal: 'lunch' }],
  })
  const lots = recipes.flatMap((r: Recipe) =>
    r.required.map(({ ingredientId, quantity }): StockLot => {
      // Quantities come from the ordinary authored recipes. Only stock in this teaching scenario is invented.
      const product = source.ingredients.find((i) => i.id === ingredientId)
      if (!product) throw new Error('Teaching product missing: ' + ingredientId)
      const isCan = ingredientId === 'ready_beans' || ingredientId === 'ready_chickpeas'
      const count = r.id === 'R05' && example === 'neutral' ? 2 : 1
      return {
        id: 'example-' + example + '-' + r.id + '-' + ingredientId,
        ingredientId,
        quantityBaseUnits: count * quantity,
        packageCount: isCan ? count : null,
        packageSize: isCan ? quantity : 1,
        canRepack: !isCan,
        packageKind: isCan ? 'pull_tab_can' : 'bulk',
        requiresCanOpener: false,
        received: true,
        storage: product.storage,
        afterOpening: isCan ? 'fridge' : product.storage,
        availableFromDay: 0,
        usableThroughDay: 0,
        provenance: 'Synthetic teaching example',
        reviewStatus: 'demo',
      }
    }),
  )
  const ingredients = structuredClone(
    source.ingredients.filter((i) =>
      recipes.some((r) => [...r.required, ...r.optional].some((a) => a.ingredientId === i.id)),
    ),
  )
  return {
    revision: 1,
    appliances: structuredClone(source.appliances),
    recipes,
    ingredients,
    lots,
    households: [
      cook('H01', 'Flexible kitchen', ['kettle', 'hob']),
      cook('H02', 'Kettle only', ['kettle']),
    ],
  }
}
