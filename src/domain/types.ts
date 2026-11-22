import type { SelectionEvidence } from './policyTypes'
export const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const
export const MEALS = ['breakfast', 'lunch', 'dinner'] as const
export const COLLECTIONS = [0, 4] as const
export const TOOLS = [
  'can_opener',
  'knife',
  'cutting_board',
  'bowl',
  'spoon',
  'heatproof_bowl',
  'microwave_safe_container',
  'pot_with_lid',
  'strainer',
  'oven_safe_tray',
] as const
export const UTILITIES = ['electricity', 'potable_water'] as const
export type Meal = (typeof MEALS)[number]
export type Collection = (typeof COLLECTIONS)[number]
export type Tool = (typeof TOOLS)[number]
export type Utility = (typeof UTILITIES)[number]
export type Storage = 'ambient' | 'fridge' | 'freezer'
export type Unit = 'g' | 'ml' | 'each'
export type Review = 'demo' | 'needs_review'
export interface Appliance {
  id: string
  name: string
}
export interface Ingredient {
  aliases?: string[]
  edibleBasis?: string
  id: string
  name: string
  group: string
  unit: Unit
  allergens: string[] | null
  declaration: 'declared' | 'unknown' | 'contradictory'
  dietaryTags: string[]
  provenance: string
  reviewStatus: Review
  storage: Storage
}
export interface Amount {
  ingredientId: string
  quantity: number
}
export interface RecipeMethod {
  id: string
  name: string
  appliances: string[]
  tools: Tool[]
  utilities: Utility[]
  water: string
  steps: string[]
  minutes: number
}
export interface Recipe {
  familyId?: string
  provenance?: string
  id: string
  name: string
  mealTypes: Meal[]
  required: Amount[]
  optional: Amount[]
  methods: RecipeMethod[]
  reviewStatus: Review
}
export type PackageKind =
  'bulk' | 'pull_tab_can' | 'opener_can' | 'carton' | 'packet' | 'tub' | 'wrapped' | 'sealed'
export interface StockLot {
  packageKind?: PackageKind
  id: string
  ingredientId: string
  quantityBaseUnits: number
  availableFromDay: number
  usableThroughDay: number
  received: boolean
  sourceOfferId?: string
  storage: Storage
  afterOpening: Storage
  packageSize: number
  packageCount: number | null
  canRepack: boolean
  requiresCanOpener: boolean
  provenance: string
  reviewStatus: Review
}
export interface Household {
  id: string
  name: string
  peopleCount: number
  appliances: string[]
  burners: 0 | 1 | 2
  tools: Tool[]
  storage: ('fridge' | 'freezer')[]
  utilities: Utility[]
  allergens: string[]
  excludedIngredientIds: string[]
  dietaryPreferences: string[]
  collectionDays: Collection[]
  /** Omitted for an ordinary full week. A present list requests whole batches only in these slots. */
  requestedSlots?: { day: number; meal: Meal }[]
}
export interface Catalog {
  ingredients: Ingredient[]
  recipes: Recipe[]
  appliances: Appliance[]
}
export interface PlanningSnapshot extends Catalog {
  revision: number
  households: Household[]
  lots: StockLot[]
}
export interface Reservation extends Amount {
  lotId: string
}
export type ReasonCode =
  | 'UNASSIGNED'
  | 'MISSING_APPLIANCE'
  | 'MISSING_TOOL'
  | 'MISSING_UTILITY'
  | 'ALLERGEN_CONFLICT'
  | 'EXCLUDED_INGREDIENT'
  | 'INSUFFICIENT_STOCK'
  | 'UNAVAILABLE_BY_PICKUP'
  | 'EXPIRES_BEFORE_MEAL'
  | 'STORAGE_UNSUPPORTED'
  | 'PACK_SIZE_MISMATCH'
  | 'NEEDS_REVIEW'
export interface Reason {
  code: ReasonCode
  message: string
  ingredientId?: string
  missingQuantity?: number
  recipeId?: string
  methodId?: string
}
export interface Feasibility {
  feasible: boolean
  methodId?: string
  reservations: Reservation[]
  reasons: Reason[]
}
export interface Slot {
  householdId: string
  day: number
  meal: Meal
}
export interface Allocation extends Slot {
  recipeId: string
  methodId: string
  portions: number
  reservations: Reservation[]
}
export interface Unfilled extends Slot {
  requested: number
  reasons: Reason[]
}
export interface PackingItem extends Reservation {
  packages: number | null
}
export interface PackingList {
  householdId: string
  collectionDay: Collection
  items: PackingItem[]
  meals: Slot[]
}
export interface Metrics {
  requested: number
  allocated: number
  uncovered: number
  percent: number
}
export interface AllocationPlan {
  fingerprint: string
  strategy: 'nokitchen' | 'reference-first-fit' | 'family-aware' | 'meal-coverage-first'
  selection?: SelectionEvidence
  id: string
  revision: number
  schemaVersion: 1
  status: 'draft' | 'approved'
  allocations: Allocation[]
  unfilled: Unfilled[]
  packingLists: PackingList[]
  metrics: Metrics
}
export interface DonationItem {
  unit: Unit
  lot: StockLot
}
export interface DonationOffer {
  id: string
  source: 'fixture' | 'proposal' | 'paste'
  document?: import('./donorTypes').PastedOffer
  receipt?: {
    rows: import('./donorTypes').OfferRow[]
    items: DonationItem[]
    baselineId: string | null
    revision: number
  }
  sender: string
  email: string
  subject: string
  body: string
  items: DonationItem[]
  status: 'offered' | 'reviewed' | 'received'
}
export interface DonationSource {
  listOffers(): Promise<DonationOffer[]>
}
export const collectionForDay = (day: number): Collection => (day < 4 ? 0 : 4)
export const requestForSlot = (household: Household, day: number, meal: Meal): number =>
  !household.requestedSlots ||
  household.requestedSlots.some((slot) => slot.day === day && slot.meal === meal)
    ? household.peopleCount
    : 0
