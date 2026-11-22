import { assessRecipe, standaloneCapacity } from '../domain/engine'
import { makeContext, methodReasons } from '../domain/feasibility'
import type {
  AllocationPlan,
  Household,
  Ingredient,
  Meal,
  PlanningSnapshot,
  Recipe,
} from '../domain/types'

/** Kitchen suitability excludes food, packaging, dates and stock. A complete batch uses the full assessor. */
export function catalogRows(
  snapshot: PlanningSnapshot,
  household: Household,
  day: number,
  plan: AllocationPlan | null,
  meal?: Meal,
) {
  const context = makeContext(snapshot)
  const assigned = new Map<string, number>()
  const week = new Map<string, number>()
  for (const slot of plan?.allocations ?? []) {
    if (slot.householdId !== household.id || (meal && slot.meal !== meal)) continue
    week.set(slot.recipeId, (week.get(slot.recipeId) ?? 0) + slot.portions)
    if (slot.day === day) {
      assigned.set(slot.recipeId, (assigned.get(slot.recipeId) ?? 0) + slot.portions)
    }
  }
  return snapshot.recipes.map((recipe) => ({
    recipe,
    kitchenMethods: recipe.methods
      .filter((m) => methodReasons(context, household, m).length === 0)
      .map((m) => m.id),
    batch: assessRecipe(snapshot, household, recipe, day),
    capacity: standaloneCapacity(snapshot, household, recipe, day),
    weekPortions: week.get(recipe.id) ?? 0,
    allocated: assigned.get(recipe.id) ?? 0,
  }))
}

export function declaredDiets(recipe: Recipe, ingredients: Ingredient[]): string[] | null {
  const required = recipe.required.map((a) => ingredients.find((i) => i.id === a.ingredientId))
  if (
    required.some(
      (i) =>
        !i ||
        i.reviewStatus !== 'demo' ||
        i.declaration !== 'declared' ||
        !i.allergens ||
        !i.dietaryTags.length,
    )
  )
    return null
  const items = required as Ingredient[]
  return ['vegan', 'vegetarian', 'pescatarian'].filter((tag) =>
    items.every(
      (i) =>
        i.dietaryTags.includes(tag) ||
        (tag === 'pescatarian' && i.dietaryTags.includes('vegetarian')),
    ),
  )
}
