import type { StockLot, Storage } from '../domain/types'

interface Schedule {
  from?: number
  through?: number
  storage?: Storage
  afterOpening?: Storage
  opener?: boolean
  packageKind?: StockLot['packageKind']
}

const warehouse = 'Synthetic opening inventory, measured in usable content'

function makeLot(
  id: string,
  ingredientId: string,
  quantity: number,
  size: number,
  count: number | null,
  schedule: Schedule,
): StockLot {
  return {
    id,
    ingredientId,
    quantityBaseUnits: quantity,
    packageSize: size,
    packageCount: count,
    canRepack: count === null,
    packageKind: schedule.packageKind ?? (count === null ? 'bulk' : 'sealed'),
    availableFromDay: schedule.from ?? 0,
    usableThroughDay: schedule.through ?? 6,
    received: true,
    storage: schedule.storage ?? 'ambient',
    afterOpening: schedule.afterOpening ?? schedule.storage ?? 'ambient',
    requiresCanOpener: schedule.opener ?? false,
    provenance: warehouse,
    reviewStatus: 'demo',
  }
}

function measured(
  id: string,
  ingredient: string,
  quantity: number,
  schedule: Schedule = {},
): StockLot {
  return makeLot(id, ingredient, quantity, 1, null, schedule)
}

export function sealedLot(
  id: string,
  ingredient: string,
  size: number,
  count: number,
  schedule: Schedule = {},
): StockLot {
  return makeLot(id, ingredient, size * count, size, count, schedule)
}

// Weighed dry stock, oil and produce are explicitly suitable for portioning in
// this model. Sealed packs move whole. All listed canned masses are drained.
export const seedLots: StockLot[] = [
  measured('LOT-001', 'oats', 2300),
  measured('LOT-002', 'instant_couscous', 2800),
  measured('LOT-003', 'dry_rice', 3600),
  measured('LOT-004', 'dry_pasta', 2000),
  measured('LOT-005', 'bread', 3900, { through: 3 }),
  measured('LOT-006', 'bread', 1800, { from: 4 }),
  sealedLot('LOT-007', 'tortilla', 1, 38),
  measured('LOT-008', 'potato', 10600),
  sealedLot('LOT-009', 'crackers', 60, 22),
  sealedLot('LOT-010', 'ready_chickpeas', 200, 19, { afterOpening: 'fridge' }),
  sealedLot('LOT-011', 'ready_beans', 200, 29, {
    opener: true,
    afterOpening: 'fridge',
    packageKind: 'opener_can',
  }),
  sealedLot('LOT-012', 'ready_beans', 200, 8, {
    from: 4,
    afterOpening: 'fridge',
    packageKind: 'pull_tab_can',
  }),
  sealedLot('LOT-013', 'ready_lentils', 200, 25, {
    opener: true,
    afterOpening: 'fridge',
    packageKind: 'opener_can',
  }),
  sealedLot('LOT-014', 'sweetcorn', 100, 18, { afterOpening: 'fridge' }),
  sealedLot('LOT-015', 'canned_tuna', 100, 15, { afterOpening: 'fridge' }),
  sealedLot('LOT-016', 'uht_milk', 200, 31, { afterOpening: 'fridge' }),
  sealedLot('LOT-017', 'yogurt', 150, 21, { storage: 'fridge', through: 4 }),
  sealedLot('LOT-018', 'cheese', 40, 16, { storage: 'fridge' }),
  measured('LOT-019', 'carrot', 1800),
  measured('LOT-020', 'tomato', 5400),
  measured('LOT-021', 'cucumber', 3400),
  measured('LOT-022', 'apple', 2600),
  measured('LOT-023', 'banana', 4300),
  sealedLot('LOT-024', 'frozen_vegetables', 150, 18, { storage: 'freezer' }),
  measured('LOT-025', 'raisins', 420),
  sealedLot('LOT-026', 'passata', 200, 17, { afterOpening: 'fridge' }),
  measured('LOT-027', 'oil', 850),
  sealedLot('LOT-028', 'peanut_butter', 25, 28),
  measured('LOT-029', 'salt', 65),
  measured('LOT-030', 'dried_herbs', 45),
  measured('LOT-031', 'cinnamon', 35),
  sealedLot('LOT-032', 'vegetable_soup', 300, 18, { afterOpening: 'fridge' }),
  // Expanded scenario only: these 22 lines are explicit, finite receipts. A catalog entry
  // alone contributes no stock. Quantities of loose produce denote edible yield.
  sealedLot('N13-001', 'ready_rice', 150, 9, {
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
  measured('N13-002', 'potato_flakes', 440),
  measured('N13-003', 'red_lentils', 700),
  sealedLot('N13-004', 'ready_beetroot', 100, 9, {
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
  sealedLot('N13-005', 'hummus', 50, 10, {
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
  sealedLot('N13-006', 'sardines', 100, 5, {
    packageKind: 'pull_tab_can',
    afterOpening: 'fridge',
  }),
  measured('N13-007', 'sweet_potato', 1400),
  sealedLot('N13-008', 'ready_peas', 100, 10, {
    packageKind: 'pull_tab_can',
    afterOpening: 'fridge',
  }),
  measured('N13-009', 'cabbage', 800),
  measured('N13-010', 'bell_pepper', 1100),
  measured('N13-011', 'onion', 600),
  measured('N13-012', 'spinach', 480, { storage: 'fridge', through: 3 }),
  measured('N13-013', 'pear', 1400),
  measured('N13-014', 'orange', 1200),
  measured('N13-015', 'dried_apricots', 200),
  sealedLot('N13-016', 'sunflower_spread', 25, 8, { packageKind: 'packet' }),
  sealedLot('N13-017', 'jam', 20, 8, {
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
  sealedLot('N13-018', 'oat_drink', 200, 10, {
    packageKind: 'carton',
    afterOpening: 'fridge',
  }),
  sealedLot('N13-019', 'apple_puree', 100, 8, {
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
  measured('N13-020', 'rice_cereal', 700),
  sealedLot('N13-021', 'ready_rice', 150, 4, {
    from: 4,
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
  sealedLot('N13-022', 'hummus', 50, 4, {
    from: 4,
    packageKind: 'packet',
    afterOpening: 'fridge',
  }),
]
