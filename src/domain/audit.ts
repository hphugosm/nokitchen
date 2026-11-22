import { snapshotFingerprint } from './fingerprint'
import type { PlanningSnapshot, Recipe } from './types'
import { validateCatalog, validateStockLot } from './validation'

export { packageDescription } from '../data/packageMetadata'

export interface AuditFinding {
  code: string
  severity: 'blocker' | 'review' | 'info'
  recipeId: string
  methodId?: string
  ingredientId?: string
  lotId?: string
  evidence: string
  resolution: string
}

/** Checks records in the supplied snapshot. The manual review of the authored steps is in docs/recipe-audit.md. */
export function auditRecipe(snapshot: PlanningSnapshot, recipe: Recipe) {
  const findings: AuditFinding[] = []
  const amounts = [...recipe.required, ...recipe.optional]
  const ingredientIds = new Set(amounts.map((a) => a.ingredientId))
  const requiredIds = new Set(recipe.required.map((a) => a.ingredientId))
  const ingredients = snapshot.ingredients.filter((i) => ingredientIds.has(i.id))
  const lots = snapshot.lots.filter((lot) => ingredientIds.has(lot.ingredientId))
  function add(finding: Omit<AuditFinding, 'recipeId'>) {
    findings.push({ recipeId: recipe.id, ...finding })
  }

  const errors = validateCatalog({
    ...snapshot,
    recipes: [recipe],
    ingredients,
    households: [],
    lots: [],
  })
  for (const evidence of errors) {
    const method = recipe.methods.find((m) => evidence.startsWith(m.id + ' '))
    const ingredient = ingredients.find((i) => evidence.startsWith(i.id + ' '))
    add({
      code: 'INVALID_RECORD',
      severity: 'blocker',
      evidence,
      methodId: method?.id,
      ingredientId: ingredient?.id,
      resolution: 'Correct the referenced record and run the model checks again.',
    })
  }
  if (recipe.reviewStatus !== 'demo') {
    add({
      code: 'RECIPE_REVIEW',
      severity: 'blocker',
      evidence: 'The recipe is flagged for review.',
      resolution: 'Exclude the recipe until the review is complete.',
    })
  }
  for (const ingredient of ingredients) {
    if (
      ingredient.reviewStatus !== 'demo' ||
      ingredient.declaration !== 'declared' ||
      !Array.isArray(ingredient.allergens)
    ) {
      add({
        code: 'PRODUCT_REVIEW',
        severity: requiredIds.has(ingredient.id) ? 'blocker' : 'review',
        ingredientId: ingredient.id,
        evidence: 'The product has an unresolved review or allergen declaration.',
        resolution: requiredIds.has(ingredient.id)
          ? 'The method cannot use this required product pending review.'
          : 'Keep this optional product out of meal kits.',
      })
    }
  }
  for (const lot of lots) {
    const problems = validateStockLot(lot, ingredientIds)
    if (lot.reviewStatus !== 'demo') problems.push('The lot is flagged for review.')
    if (problems.length) {
      add({
        code: 'LOT_REVIEW',
        severity: 'review',
        ingredientId: lot.ingredientId,
        lotId: lot.id,
        evidence: problems.join(' '),
        resolution: 'Exclude this lot. Other eligible lots can still supply the ingredient.',
      })
    }
  }
  const passed = findings.length === 0
  if (passed) {
    add({
      code: 'MODEL_CHECKS',
      severity: 'info',
      evidence:
        'The recipe, its ingredient amounts, method requirements, product declarations and ' +
        lots.length +
        ' applicable lot records passed model checks.',
      resolution:
        'Family size, available stock, tools, package access, dates and household storage are checked for the selected meal.',
    })
  }
  return { recipeId: recipe.id, fingerprint: snapshotFingerprint(snapshot), passed, findings }
}
