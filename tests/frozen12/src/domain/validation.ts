import { methodMetadataIssues } from './methodMetadata'
import { packageMetadataConsistent } from '../data/packageMetadata'
import { catalog, sampleOffers, seedHouseholds, seedLots } from '../data'
import { COLLECTIONS, DAYS, MEALS, TOOLS, UTILITIES, requestForSlot } from './types'
import type { Household, Ingredient, PlanningSnapshot, Recipe, Review, StockLot } from './types'

const nonnegative = (value: number) => Number.isSafeInteger(value) && value >= 0
const positive = (value: number) => Number.isSafeInteger(value) && value > 0
const stores = ['ambient', 'fridge', 'freezer']

function checkIds(records: { id: string }[], group: string, errors: string[]): Set<string> {
  const ids = new Set<string>()
  for (const record of records) {
    if (!record.id || ids.has(record.id))
      errors.push(group + ' has an empty or duplicate ID: ' + record.id)
    ids.add(record.id)
  }
  return ids
}

function checkRefs(
  refs: readonly string[],
  allowed: ReadonlySet<string>,
  owner: string,
  errors: string[],
) {
  if (new Set(refs).size !== refs.length) errors.push(owner + ' repeats a reference.')
  for (const id of refs)
    if (!allowed.has(id)) errors.push(owner + ' references unknown ' + id + '.')
}

export function recipeAllergens(
  recipe: Recipe,
  ingredients: Ingredient[],
): { allergens: string[]; reviewStatus: Review } {
  const declarations = new Set<string>()
  let reviewStatus = recipe.reviewStatus
  for (const amount of recipe.required) {
    const ingredient = ingredients.find((item) => item.id === amount.ingredientId)
    if (
      !ingredient ||
      ingredient.reviewStatus !== 'demo' ||
      ingredient.declaration !== 'declared' ||
      !Array.isArray(ingredient.allergens)
    ) {
      reviewStatus = 'needs_review'
    } else {
      for (const allergen of ingredient.allergens) declarations.add(allergen)
    }
  }
  return { allergens: [...declarations].sort(), reviewStatus }
}

export function validateStockLot(lot: StockLot, ingredientIds: ReadonlySet<string>): string[] {
  const errors: string[] = []
  if (!packageMetadataConsistent(lot))
    errors.push('Package type contradicts repacking or opening declarations')
  if (!ingredientIds.has(lot.ingredientId)) errors.push('Unknown ingredient ' + lot.ingredientId)
  if (typeof lot.received !== 'boolean') errors.push('Missing receipt declaration')
  if (!nonnegative(lot.quantityBaseUnits) || !positive(lot.packageSize))
    errors.push('Invalid quantity or package size')
  if (
    !lot.canRepack &&
    (lot.packageCount === null ||
      !nonnegative(lot.packageCount) ||
      lot.quantityBaseUnits !== lot.packageCount * lot.packageSize)
  ) {
    errors.push('Whole-package quantity must equal package count times usable package size')
  }
  if (lot.canRepack && lot.packageCount !== null)
    errors.push('A measured lot cannot have a separate package count')
  if (
    !nonnegative(lot.availableFromDay) ||
    !nonnegative(lot.usableThroughDay) ||
    lot.usableThroughDay < lot.availableFromDay
  )
    errors.push('Invalid availability window')
  if (!stores.includes(lot.storage) || !stores.includes(lot.afterOpening))
    errors.push('Unknown storage requirement')
  if (!lot.provenance?.trim() || !['demo', 'needs_review'].includes(lot.reviewStatus))
    errors.push('Incomplete lot review information')
  return errors.map((message) => lot.id + ': ' + message + '.')
}

function checkHousehold(
  household: Household,
  ingredientIds: Set<string>,
  deviceIds: Set<string>,
  errors: string[],
) {
  const { id } = household
  if (!positive(household.peopleCount))
    errors.push(id + ' needs a positive whole number of people.')
  checkRefs(household.appliances, deviceIds, id, errors)
  checkRefs(household.tools, new Set(TOOLS), id, errors)
  checkRefs(household.excludedIngredientIds, ingredientIds, id, errors)
  checkRefs(household.storage, new Set(['fridge', 'freezer']), id, errors)
  checkRefs(household.utilities, new Set(UTILITIES), id, errors)
  if (
    household.appliances.includes('hob')
      ? ![1, 2].includes(household.burners)
      : household.burners !== 0
  )
    errors.push(id + ' has an invalid hob burner count.')
  if (
    household.collectionDays.some((day) => !COLLECTIONS.includes(day)) ||
    new Set(household.collectionDays).size !== household.collectionDays.length
  ) {
    errors.push(id + ' has invalid collection days.')
  }
}

export function validateCatalog(snapshot: PlanningSnapshot): string[] {
  const errors: string[] = []
  const ingredientIds = checkIds(snapshot.ingredients, 'Ingredients', errors)
  const deviceIds = checkIds(snapshot.appliances, 'Devices', errors)
  checkIds(snapshot.recipes, 'Recipes', errors)
  checkIds(snapshot.households, 'Households', errors)
  checkIds(snapshot.lots, 'Stock lots', errors)
  checkIds(
    snapshot.recipes.flatMap((recipe) => recipe.methods),
    'Recipe methods',
    errors,
  )
  for (const ingredient of snapshot.ingredients) {
    if (
      !ingredient.name?.trim() ||
      !ingredient.provenance?.trim() ||
      !['g', 'ml', 'each'].includes(ingredient.unit) ||
      !stores.includes(ingredient.storage) ||
      !Array.isArray(ingredient.dietaryTags)
    )
      errors.push(ingredient.id + ' has incomplete product metadata.')
    if (
      ingredient.reviewStatus !== 'needs_review' &&
      (ingredient.reviewStatus !== 'demo' ||
        ingredient.declaration !== 'declared' ||
        !Array.isArray(ingredient.allergens))
    ) {
      errors.push(
        ingredient.id + ' has an unknown or contradictory product declaration and needs review.',
      )
    }
  }
  for (const recipe of snapshot.recipes) {
    const amounts = [...recipe.required, ...recipe.optional]
    checkRefs(
      amounts.map((item) => item.ingredientId),
      ingredientIds,
      recipe.id,
      errors,
    )
    checkRefs(recipe.mealTypes, new Set(MEALS), recipe.id, errors)
    if (
      !recipe.required.length ||
      amounts.some((item) => !positive(item.quantity)) ||
      !recipe.mealTypes.length ||
      !recipe.methods.length
    ) {
      errors.push(recipe.id + ' needs valid quantities, meal slots and methods.')
    }
    for (const method of recipe.methods) {
      checkRefs(method.appliances, deviceIds, method.id, errors)
      checkRefs(method.tools, new Set(TOOLS), method.id, errors)
      checkRefs(method.utilities, new Set(UTILITIES), method.id, errors)
      errors.push(...methodMetadataIssues(method))
    }
  }
  for (const household of snapshot.households)
    checkHousehold(household, ingredientIds, deviceIds, errors)
  for (const lot of snapshot.lots) errors.push(...validateStockLot(lot, ingredientIds))
  return errors
}

export function validateSeed(): string[] {
  const snapshot = { ...catalog, households: seedHouseholds, lots: seedLots, revision: 0 }
  const errors = validateCatalog(snapshot)
  for (const [name, length, expected] of [
    ['ingredients', catalog.ingredients.length, 30],
    ['recipes', catalog.recipes.length, 16],
    ['devices', catalog.appliances.length, 6],
    ['households', seedHouseholds.length, 8],
  ] as const) {
    if (length !== expected) errors.push('Expected ' + expected + ' ' + name + ' in the seed.')
  }
  if (seedHouseholds.reduce((sum, household) => sum + household.peopleCount, 0) !== 18)
    errors.push('The seed must contain 18 people.')
  const requested = seedHouseholds.flatMap((household) =>
    DAYS.flatMap((_, day) => MEALS.map((meal) => requestForSlot(household, day, meal))),
  )
  if (requested.reduce((total, amount) => total + amount, 0) !== 378)
    errors.push('Initial weekly demand must be 378.')
  checkIds(sampleOffers, 'Sample offers', errors)
  const proposedLots = sampleOffers.flatMap((offer) => offer.items.map((item) => item.lot))
  checkIds([...seedLots, ...proposedLots], 'Received and proposed lots', errors)
  const ingredientIds = new Set(catalog.ingredients.map((item) => item.id))
  for (const offer of sampleOffers) {
    if (
      !offer.items.length ||
      offer.status !== 'offered' ||
      !/@example\.(org|com|net)$/.test(offer.email)
    )
      errors.push(offer.id + ' is not a complete sample offer.')
    for (const { unit, lot } of offer.items) {
      errors.push(...validateStockLot(lot, ingredientIds))
      if (
        lot.sourceOfferId !== offer.id ||
        lot.received ||
        unit !== catalog.ingredients.find((item) => item.id === lot.ingredientId)?.unit
      ) {
        errors.push(lot.id + ' has inconsistent offer data.')
      }
    }
  }
  const stocked = new Set(
    seedLots
      .filter((lot) => lot.received && lot.quantityBaseUnits > 0)
      .map((lot) => lot.ingredientId),
  )
  for (const id of ingredientIds)
    if (!stocked.has(id)) errors.push('No initial stock for ' + id + '.')
  return errors
}
