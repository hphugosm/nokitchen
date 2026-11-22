import { catalog, seedHouseholds, seedLots } from '../../src/data'
import type { PlanningSnapshot, StockLot } from '../../src/domain/types'

// Sufficient declared synthetic supplies for the stated batches only. No ordinary demo state is involved.
export function controlledVarietyCase(
  kind: 'restricted-pair' | 'equipped-single' | 'no-alternative',
): PlanningSnapshot {
  const restricted = kind !== 'equipped-single'
  const h = structuredClone(seedHouseholds.find((h) => h.id === (restricted ? 'H01' : 'H03'))!)
  const ids = restricted ? (kind === 'no-alternative' ? ['R06'] : ['R06', 'R08']) : ['R01', 'R03']
  const recipes = catalog.recipes.filter((r) => ids.includes(r.id))
  h.requestedSlots = [0, 1, 2, 3].map((day) => ({ day, meal: restricted ? 'lunch' : 'breakfast' }))
  const quantities = new Map<string, number>()
  for (const [index, r] of recipes.entries()) {
    const n = restricted && kind !== 'no-alternative' ? 2 : index === 0 ? 4 : 2
    for (const q of r.required)
      quantities.set(
        q.ingredientId,
        (quantities.get(q.ingredientId) ?? 0) + q.quantity * n * h.peopleCount,
      )
  }
  const lots: StockLot[] = [...quantities].map(([ingredientId, quantityBaseUnits]) => {
    const source = seedLots.find((l) => l.ingredientId === ingredientId)!
    const pullTab = restricted && ingredientId === 'ready_lentils'
    return {
      ...source,
      id: 'controlled-' + kind + '-' + ingredientId,
      availableFromDay: 0,
      usableThroughDay: 6,
      quantityBaseUnits,
      packageCount: source.canRepack ? null : quantityBaseUnits / source.packageSize,
      ...(pullTab ? { packageKind: 'pull_tab_can', requiresCanOpener: false } : {}),
      provenance: 'Synthetic controlled variety test supply',
    }
  })
  return { ...structuredClone(catalog), recipes, households: [h], lots, revision: 1 }
}
