import { MEALS } from './types'
import type { Allocation, AllocationPlan, Meal, PlanningSnapshot, Recipe } from './types'

export type VarietyScore = [number, number, number]
export type MealCategory = 'breakfast' | 'main'
export interface CategoryVariety {
  slots: number
  portions: number
  distinctRecipes: number
  distinctFamilies: number
  recipeIds: string[]
  familyIds: string[]
  familyFrequencies: Record<string, number>
  recipeFrequencies: Record<string, number>
  recipesByFamily: Record<string, string[]>
  maxFamilyFrequency: number
  adjacent: number
  familyCollisions: number
  recipeCollisions: number
}
export interface HouseholdVariety {
  householdId: string
  breakfast: CategoryVariety
  main: CategoryVariety
  score: VarietyScore
}
export const familyOf = (recipe: Recipe) => recipe.familyId ?? 'unclassified'
export const categoryOf = (meal: Meal): MealCategory =>
  meal === 'breakfast' ? 'breakfast' : 'main'
export function compareVariety(a: VarietyScore, b: VarietyScore): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}
export const chronology = (
  a: Pick<Allocation, 'day' | 'meal'>,
  b: Pick<Allocation, 'day' | 'meal'>,
) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal)
export function categoryHistory() {
  return {
    families: new Map<string, number>(),
    recipes: new Map<string, number>(),
    lastFamily: null as string | null,
    slots: 0,
    portions: 0,
    familyCollisions: 0,
    adjacent: 0,
    recipeCollisions: 0,
  }
}
type History = ReturnType<typeof categoryHistory>

// Adding an item to a bucket of size n creates exactly n new pairs.
export function marginalVariety(h: History, family: string, recipeId: string): VarietyScore {
  return [
    h.families.get(family) ?? 0,
    Number(h.lastFamily === family),
    h.recipes.get(recipeId) ?? 0,
  ]
}
export function recordMeal(h: History, family: string, recipeId: string, portions: number) {
  const [familyPairs, nextTo, recipePairs] = marginalVariety(h, family, recipeId)
  h.families.set(family, familyPairs + 1)
  h.recipes.set(recipeId, recipePairs + 1)
  h.familyCollisions += familyPairs
  h.adjacent += nextTo
  h.recipeCollisions += recipePairs
  h.slots++
  h.portions += portions
  h.lastFamily = family
}

export function categoryVariety(
  slots: ReadonlyArray<Pick<Allocation, 'recipeId' | 'portions'>>,
  families: Map<string, string>,
): CategoryVariety {
  const h = categoryHistory()
  // The caller orders the assigned slots chronologically. Empty requests do not interrupt the sequence.
  const recipesByFamily = new Map<string, string[]>()
  for (const a of slots) {
    const family = families.get(a.recipeId) ?? 'unclassified'
    recordMeal(h, family, a.recipeId, a.portions)
    const variants = recipesByFamily.get(family)
    if (variants) variants.push(a.recipeId)
    else recipesByFamily.set(family, [a.recipeId])
  }
  return {
    slots: h.slots,
    portions: h.portions,
    distinctRecipes: h.recipes.size,
    distinctFamilies: h.families.size,
    recipeIds: [...h.recipes.keys()].sort(),
    familyIds: [...h.families.keys()].sort(),
    familyFrequencies: Object.fromEntries(h.families),
    recipeFrequencies: Object.fromEntries(h.recipes),
    recipesByFamily: Object.fromEntries(recipesByFamily),
    maxFamilyFrequency: Math.max(0, ...h.families.values()),
    adjacent: h.adjacent,
    familyCollisions: h.familyCollisions,
    recipeCollisions: h.recipeCollisions,
  }
}
export const categoryScore = (c: CategoryVariety): VarietyScore => [
  c.familyCollisions,
  c.adjacent,
  c.recipeCollisions,
]

export function varietyReport(
  snapshot: PlanningSnapshot,
  plan: Pick<AllocationPlan, 'allocations'>,
): { score: VarietyScore; households: HouseholdVariety[] } {
  const families = new Map(snapshot.recipes.map((r) => [r.id, familyOf(r)]))
  const score: VarietyScore = [0, 0, 0]
  const households = snapshot.households.map((h) => {
    const slots = plan.allocations.filter((a) => a.householdId === h.id).sort(chronology)
    const breakfast = categoryVariety(
      slots.filter((a) => categoryOf(a.meal) === 'breakfast'),
      families,
    )
    const main = categoryVariety(
      slots.filter((a) => categoryOf(a.meal) === 'main'),
      families,
    )
    const householdScore: VarietyScore = [
      breakfast.familyCollisions + main.familyCollisions,
      breakfast.adjacent + main.adjacent,
      breakfast.recipeCollisions + main.recipeCollisions,
    ]
    for (let i = 0; i < 3; i++) score[i] += householdScore[i]
    return { householdId: h.id, breakfast, main, score: householdScore }
  })
  return { score, households }
}

export function classifyVarietyEffect(before: CategoryVariety, after: CategoryVariety) {
  const addedFamilies = after.familyIds.filter((id) => !before.familyIds.includes(id))
  const removedFamilies = before.familyIds.filter((id) => !after.familyIds.includes(id))
  const sameFamilyMix =
    !addedFamilies.length &&
    !removedFamilies.length &&
    before.familyIds.every((id) => before.familyFrequencies[id] === after.familyFrequencies[id])
  const variantFamilies = before.familyIds.filter((family) => {
    const prior = before.recipesByFamily[family],
      next = after.recipesByFamily[family]
    if (!next) return false
    // A different variant or distribution in a shared family is a separate effect
    // from moving otherwise identical meals apart. Proportional growth alone is neither.
    return [...new Set([...prior, ...next])].some(
      (id) =>
        (before.recipeFrequencies[id] ?? 0) * next.length !==
        (after.recipeFrequencies[id] ?? 0) * prior.length,
    )
  })
  const reorderedFamilies = before.familyIds.filter((family) => {
    const prior = before.recipesByFamily[family],
      next = after.recipesByFamily[family]
    return (
      next &&
      prior.length === next.length &&
      !variantFamilies.includes(family) &&
      prior.some((id, index) => id !== next[index])
    )
  })
  return {
    broader: after.distinctFamilies > before.distinctFamilies,
    moreBalanced: after.slots === before.slots && after.familyCollisions < before.familyCollisions,
    betterSpacing: sameFamilyMix && after.adjacent < before.adjacent,
    recipeVariants: variantFamilies.length > 0,
    sameFamilyMix,
    addedFamilies,
    removedFamilies,
    variantFamilies,
    reorderedFamilies,
  }
}
