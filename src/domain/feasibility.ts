import { methodMetadataIssues } from './methodMetadata'
import { packageMetadataConsistent } from '../data/packageMetadata'
import type { CandidateCheck, IngredientCheck } from './analysisTypes'
import { collectionForDay, DAYS } from './types'
import type {
  Feasibility,
  Household,
  Ingredient,
  PlanningSnapshot,
  Reason,
  Recipe,
  RecipeMethod,
  Reservation,
  StockLot,
} from './types'

export const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0
const title = (id: string) => id.replaceAll('_', ' ')
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

export interface Context {
  ingredients: Map<string, Ingredient>
  applianceNames: Map<string, string>
  lotsByIngredient: Map<string, StockLot[]>
  lotsById: Map<string, StockLot>
  remaining: Map<string, number>
}

function uniqueIndex<T extends { id: string }>(records: T[]): Map<string, T> {
  const result = new Map(records.map((record) => [record.id, record]))
  if (result.size !== records.length)
    throw new Error('Duplicate record IDs in the planning snapshot.')
  return result
}

export function makeContext(snapshot: PlanningSnapshot): Context {
  const lotsByIngredient = new Map<string, StockLot[]>()
  const lotsById = uniqueIndex(snapshot.lots)
  for (const lot of snapshot.lots) {
    const group = lotsByIngredient.get(lot.ingredientId) ?? []
    group.push(lot)
    lotsByIngredient.set(lot.ingredientId, group)
  }
  for (const group of lotsByIngredient.values())
    group.sort((a, b) => a.usableThroughDay - b.usableThroughDay || byId(a, b))
  return {
    ingredients: uniqueIndex(snapshot.ingredients),
    applianceNames: new Map(
      [...uniqueIndex(snapshot.appliances)].map(([id, appliance]) => [id, appliance.name]),
    ),
    lotsByIngredient,
    lotsById,
    remaining: new Map(
      snapshot.lots.map((lot) => [lot.id, lot.received ? lot.quantityBaseUnits : 0]),
    ),
  }
}

export function methodReasons(ctx: Context, household: Household, method: RecipeMethod): Reason[] {
  const metadata = methodMetadataIssues(method)
  if (metadata.length)
    return metadata.map((message) => ({ code: 'NEEDS_REVIEW', message, methodId: method.id }))
  const reasons: Reason[] = []
  for (const appliance of method.appliances) {
    if (!ctx.applianceNames.has(appliance)) {
      reasons.push({
        code: 'NEEDS_REVIEW',
        message: 'The preparation method references an unknown appliance.',
      })
    } else if (
      !household.appliances.includes(appliance) ||
      (appliance === 'hob' && household.burners < 1)
    ) {
      reasons.push({
        code: 'MISSING_APPLIANCE',
        message: `${method.name} requires ${ctx.applianceNames.get(appliance)}.`,
      })
    }
  }
  for (const utility of method.utilities) {
    if (!household.utilities.includes(utility))
      reasons.push({
        code: 'MISSING_UTILITY',
        message: `${method.name} requires ${title(utility)}.`,
      })
  }
  for (const tool of method.tools) {
    if (!household.tools.includes(tool))
      reasons.push({ code: 'MISSING_TOOL', message: `${method.name} requires a ${title(tool)}.` })
  }
  return reasons.map((reason) => ({ ...reason, methodId: method.id }))
}

export function ingredientReasons(ctx: Context, household: Household, id: string): Reason[] {
  const ingredient = ctx.ingredients.get(id)
  if (
    !ingredient ||
    ingredient.reviewStatus !== 'demo' ||
    ingredient.declaration !== 'declared' ||
    !Array.isArray(ingredient.allergens) ||
    !ingredient.provenance?.trim() ||
    !ingredient.name?.trim() ||
    !['g', 'ml', 'each'].includes(ingredient.unit) ||
    !['ambient', 'fridge', 'freezer'].includes(ingredient.storage) ||
    !Array.isArray(ingredient.dietaryTags)
  ) {
    return [
      {
        code: 'NEEDS_REVIEW',
        ingredientId: id,
        message: `The product declaration for ${ingredient?.name ?? title(id)} needs review.`,
      },
    ]
  }
  const conflict = ingredient.allergens.filter((allergen) => household.allergens.includes(allergen))
  const reasons: Reason[] = []
  if (conflict.length)
    reasons.push({
      code: 'ALLERGEN_CONFLICT',
      ingredientId: id,
      message: `${ingredient.name} declares ${conflict.join(', ')}, restricted by this household.`,
    })
  if (household.excludedIngredientIds.includes(id))
    reasons.push({
      code: 'EXCLUDED_INGREDIENT',
      ingredientId: id,
      message: `This household excludes ${ingredient.name}.`,
    })
  return reasons
}

export function lotReason(lot: StockLot, household: Household, day: number): Reason | undefined {
  const pickup = collectionForDay(day)
  const base = { ingredientId: lot.ingredientId }
  if (
    !packageMetadataConsistent(lot) ||
    lot.reviewStatus !== 'demo' ||
    !lot.provenance?.trim() ||
    !whole(lot.quantityBaseUnits) ||
    typeof lot.received !== 'boolean' ||
    typeof lot.canRepack !== 'boolean' ||
    typeof lot.requiresCanOpener !== 'boolean' ||
    (lot.canRepack && lot.packageCount !== null) ||
    !whole(lot.packageSize) ||
    lot.packageSize === 0 ||
    !whole(lot.availableFromDay) ||
    !whole(lot.usableThroughDay) ||
    lot.usableThroughDay < lot.availableFromDay ||
    !(['ambient', 'fridge', 'freezer'] as string[]).includes(lot.storage) ||
    !(['ambient', 'fridge', 'freezer'] as string[]).includes(lot.afterOpening) ||
    (!lot.canRepack &&
      (lot.packageCount === null ||
        !whole(lot.packageCount) ||
        lot.packageCount * lot.packageSize !== lot.quantityBaseUnits))
  ) {
    return {
      ...base,
      code: 'NEEDS_REVIEW',
      message: `Lot ${lot.id} has unreviewed or inconsistent product data.`,
    }
  }
  if (!lot.received || lot.availableFromDay > pickup)
    return {
      ...base,
      code: 'UNAVAILABLE_BY_PICKUP',
      message: `Lot ${lot.id} is unavailable for the ${DAYS[pickup]} collection.`,
    }
  if (lot.usableThroughDay < day)
    return {
      ...base,
      code: 'EXPIRES_BEFORE_MEAL',
      message: `Lot ${lot.id} expires before the ${DAYS[day]} meal.`,
    }
  const requiredStorage = [lot.storage, ...(lot.canRepack ? [lot.afterOpening] : [])]
  for (const storage of requiredStorage) {
    if (storage !== 'ambient' && !household.storage.includes(storage))
      return {
        ...base,
        code: 'STORAGE_UNSUPPORTED',
        message: `Lot ${lot.id} needs a ${storage} from collection to preparation.`,
      }
  }
  if (lot.requiresCanOpener && !household.tools.includes('can_opener'))
    return { ...base, code: 'MISSING_TOOL', message: `Lot ${lot.id} requires a can opener.` }
}

interface Supply {
  lot: StockLot
  available: number
  step: number
}

// Prefer earlier-dated lots, but backtrack if their package sizes cannot fill the exact batch.
function takeExactly(supplies: Supply[], target: number): Reservation[] | null {
  const suffixStock = Array(supplies.length + 1).fill(0) as number[]
  const suffixStep = [...suffixStock]
  for (let i = supplies.length - 1; i >= 0; i--) {
    suffixStock[i] = suffixStock[i + 1] + supplies[i].available
    suffixStep[i] = gcd(suffixStep[i + 1], supplies[i].step)
  }
  const failed = new Set<string>()
  const result: Reservation[] = []
  function fill(i: number, remaining: number): boolean {
    if (remaining === 0) return true
    if (i === supplies.length || remaining > suffixStock[i] || remaining % suffixStep[i] !== 0)
      return false
    const key = i + '-' + remaining
    if (failed.has(key)) return false
    const { lot, available, step } = supplies[i]
    const maximum = Math.floor(Math.min(available, remaining) / step) * step
    const minimum = Math.max(0, remaining - suffixStock[i + 1])
    for (let quantity = maximum; quantity >= minimum; quantity -= step) {
      if (fill(i + 1, remaining - quantity)) {
        if (quantity > 0) result.push({ lotId: lot.id, ingredientId: lot.ingredientId, quantity })
        return true
      }
    }
    failed.add(key)
    return false
  }
  return fill(0, target) ? result.reverse() : null
}

interface Requirement {
  ingredient: Ingredient
  perPortion: number
  supplies: Supply[]
  available: number
  blocked: Reason[]
}
interface PreparedRecipe {
  method?: RecipeMethod
  reasons: Reason[]
  requirements: Requirement[]
}

export function fixedReasons(
  ctx: Context,
  household: Household,
  recipe: Recipe,
  day: number,
): Reason[] {
  const reasons: Reason[] = []
  if (
    recipe.reviewStatus !== 'demo' ||
    !recipe.required.length ||
    !recipe.methods.length ||
    new Set(recipe.methods.map((m) => m.id)).size !== recipe.methods.length ||
    recipe.required.some((a) => !whole(a.quantity) || a.quantity === 0) ||
    new Set(recipe.required.map((a) => a.ingredientId)).size !== recipe.required.length
  ) {
    reasons.push({
      code: 'NEEDS_REVIEW',
      message: `${recipe.name} has an incomplete or unreviewed recipe record.`,
    })
  }
  if (
    !Number.isInteger(day) ||
    day < 0 ||
    day >= DAYS.length ||
    !household.collectionDays.includes(collectionForDay(day))
  ) {
    reasons.push({
      code: 'UNAVAILABLE_BY_PICKUP',
      message: 'There is no household collection covering this meal.',
    })
  }
  for (const amount of recipe.required)
    reasons.push(...ingredientReasons(ctx, household, amount.ingredientId))
  return reasons
}

function prepare(ctx: Context, household: Household, recipe: Recipe, day: number): PreparedRecipe {
  const reasons = fixedReasons(ctx, household, recipe, day)
  const methods = [...recipe.methods]
    .sort(byId)
    .map((method) => ({ method, reasons: methodReasons(ctx, household, method) }))
  const method = methods.find((item) => !item.reasons.length)?.method
  if (!method) reasons.push(...methods.flatMap((item) => item.reasons))
  if (reasons.length) return { method, reasons, requirements: [] }
  const requirements = recipe.required.map((amount) =>
    requirementFor(ctx, household, day, amount.ingredientId, amount.quantity),
  )
  return { method, reasons, requirements }
}

function requirementFor(
  ctx: Context,
  household: Household,
  day: number,
  ingredientId: string,
  quantity: number,
): Requirement {
  const supplies: Supply[] = []
  const blocked: Reason[] = []
  for (const lot of ctx.lotsByIngredient.get(ingredientId) ?? []) {
    const remaining = ctx.remaining.get(lot.id) ?? 0
    if (remaining === 0 && lot.received) continue
    const reason = lotReason(lot, household, day)
    if (reason) blocked.push(reason)
    else if (remaining > 0)
      supplies.push({ lot, available: remaining, step: lot.canRepack ? 1 : lot.packageSize })
  }
  return {
    ingredient: ctx.ingredients.get(ingredientId)!,
    perPortion: quantity,
    supplies,
    blocked,
    available: supplies.reduce((sum, entry) => sum + entry.available, 0),
  }
}

export interface Assessment extends Feasibility {
  earliest: number
  scarcity: number
}
function assessPrepared(
  prepared: PreparedRecipe,
  recipe: Recipe,
  portions: number,
  ctx: Context,
): Assessment {
  const reasons = [...prepared.reasons]
  const reservations: Reservation[] = []
  let earliest = Infinity
  let scarcity = 0
  if (!whole(portions) || portions <= 0)
    reasons.push({
      code: 'NEEDS_REVIEW',
      message: 'The portion request must be a positive integer.',
    })
  if (!reasons.length)
    for (const { ingredient, perPortion, supplies, available, blocked } of prepared.requirements) {
      const needed = perPortion * portions
      if (!Number.isSafeInteger(needed)) {
        reasons.push({
          code: 'NEEDS_REVIEW',
          ingredientId: ingredient.id,
          message: 'The batch quantity is outside the supported integer range.',
        })
        continue
      }
      if (needed > available) {
        const missingQuantity = needed - available
        reasons.push(
          {
            code: 'INSUFFICIENT_STOCK',
            ingredientId: ingredient.id,
            missingQuantity,
            message: `${recipe.name} needs ${needed} ${ingredient.unit} of ${ingredient.name}. ${available} ${ingredient.unit} eligible, short ${missingQuantity} ${ingredient.unit}.`,
          },
          ...blocked,
        )
        continue
      }
      const exact = takeExactly(supplies, needed)
      if (!exact) {
        reasons.push({
          code: 'PACK_SIZE_MISMATCH',
          ingredientId: ingredient.id,
          message: `${recipe.name} needs exactly ${needed} ${ingredient.unit} of ${ingredient.name}. The available packages cannot fill that amount.`,
        })
      } else {
        reservations.push(...exact)
        for (const claim of exact)
          earliest = Math.min(earliest, ctx.lotsById.get(claim.lotId)!.usableThroughDay)
        scarcity += needed / available
      }
    }
  return {
    feasible: !reasons.length,
    methodId: prepared.method?.id,
    reservations: reasons.length ? [] : reservations,
    reasons: reasons.map((reason) => ({ ...reason, recipeId: recipe.id })),
    earliest,
    scarcity,
  }
}

export function assess(
  ctx: Context,
  household: Household,
  recipe: Recipe,
  day: number,
  portions: number,
) {
  return assessPrepared(prepare(ctx, household, recipe, day), recipe, portions, ctx)
}

export function assessRecipe(
  snapshot: PlanningSnapshot,
  household: Household,
  recipe: Recipe,
  day: number,
  portions = household.peopleCount,
): Feasibility {
  const { feasible, methodId, reservations, reasons } = assess(
    makeContext(snapshot),
    household,
    recipe,
    day,
    portions,
  )
  return { feasible, methodId, reservations, reasons }
}

export function standaloneCapacity(
  snapshot: PlanningSnapshot,
  household: Household,
  recipe: Recipe,
  day: number,
): number {
  const ctx = makeContext(snapshot)
  const prepared = prepare(ctx, household, recipe, day)
  if (prepared.reasons.length) return 0
  let maxPortions = Infinity
  let step = 1
  for (const { available, supplies, perPortion } of prepared.requirements) {
    if (!available) return 0
    maxPortions = Math.min(maxPortions, Math.floor(available / perPortion))
    const lotStep = supplies.reduce((acc, entry) => gcd(acc, entry.step), 0)
    const portionStep = lotStep / gcd(perPortion, lotStep)
    step = (step / gcd(step, portionStep)) * portionStep
  }
  // Feasibility is not monotone: a sealed 200 g pack can supply two 100 g portions but not one.
  for (let portions = Math.floor(maxPortions / step) * step; portions > 0; portions -= step) {
    if (assessPrepared(prepared, recipe, portions, ctx).feasible) return portions
  }
  return 0
}

// Explain each authored method against the same ledger used for this decision.
// Opening stock that this household could have used is kept separate from eligible stock now.
export function inspectMethods(
  ctx: Context,
  household: Household,
  recipe: Recipe,
  day: number,
  portions: number,
) {
  const common = fixedReasons(ctx, household, recipe, day)
  const requirements: Requirement[] = []
  const ingredients: IngredientCheck[] = []
  for (const amount of recipe.required) {
    const ingredient = ctx.ingredients.get(amount.ingredientId)
    if (!ingredient) continue // A missing product has no known canonical unit; its review reason remains visible.
    const requirement = requirementFor(ctx, household, day, ingredient.id, amount.quantity)
    const excluded =
      !household.collectionDays.includes(collectionForDay(day)) ||
      ingredientReasons(ctx, household, ingredient.id).length > 0
    const eligible = excluded ? 0 : requirement.available
    const opening = excluded
      ? 0
      : (ctx.lotsByIngredient.get(ingredient.id) ?? [])
          .filter((lot) => !lotReason(lot, household, day))
          .reduce((sum, lot) => sum + lot.quantityBaseUnits, 0)
    const required = amount.quantity * portions
    ingredients.push({
      ingredientId: ingredient.id,
      unit: ingredient.unit,
      required,
      eligible,
      missing: Math.max(0, required - eligible),
      allocatedElsewhere: opening - eligible,
    })
    if (!excluded) requirements.push(requirement)
  }
  const stock = assessPrepared({ reasons: [], requirements }, recipe, portions, ctx)
  let compatible = false
  const candidates: CandidateCheck[] = [...recipe.methods].sort(byId).map((method) => {
    const hard = [...common, ...methodReasons(ctx, household, method)]
    if (!hard.length) compatible = true
    return {
      recipeId: recipe.id,
      methodId: method.id,
      ingredients,
      reasons: [...hard, ...stock.reasons].map((reason) => ({
        ...reason,
        recipeId: recipe.id,
        methodId: method.id,
      })),
    }
  })
  return { compatible, candidates }
}
