import type { PlanningContext, SelectionEvidence } from './policyTypes'
import type { AllocationPlan, Metrics, Reason, Slot, StockLot, Unit } from './types'

export type Strategy = 'nokitchen' | 'reference-first-fit' | 'family-aware'
export interface HouseholdCoverage extends Metrics {
  householdId: string
  coveragePercent: number | null
  unfilledSlots: number
  unfilledDays: number[]
}
export interface IngredientBalance {
  ingredientId: string
  unit: Unit
  remaining: number
}
export interface IngredientCheck {
  ingredientId: string
  unit: Unit
  required: number
  eligible: number
  missing: number
  /** Originally eligible stock committed to previous assignments before this decision. */
  allocatedElsewhere: number
}
export interface CandidateCheck {
  recipeId: string
  methodId: string
  ingredients: IngredientCheck[]
  reasons: Reason[]
}
export interface SlotDiagnosis extends Slot {
  requested: number
  candidates: CandidateCheck[]
  noCompatibleRecipe: boolean
}
export interface PlanDiagnostics {
  fingerprint: string
  planId: string
  context: 'At the allocation decision' | 'Based on stock remaining after this plan'
  households: HouseholdCoverage[]
  unfilled: SlotDiagnosis[]
  remaining: IngredientBalance[]
}
export interface PlannerSummary {
  plan: AllocationPlan
  households: HouseholdCoverage[]
  remaining: IngredientBalance[]
  lowestCoverage: number | null
  zeroHouseholds: number
}
export interface HouseholdDelta {
  householdId: string
  before: number
  after: number
  delta: number
  percentagePoints: number | null
}
export interface PlannerComparison {
  context: PlanningContext
  fingerprint: string
  reference: PlannerSummary
  nokitchen: PlannerSummary
  deltas: HouseholdDelta[]
}
interface ActionBase {
  id: string
  label: string
}
export type TestedAction =
  | (ActionBase & { kind: 'can_opener' })
  | (ActionBase & { kind: 'appliance'; applianceId: string })
  | (ActionBase & { kind: 'donation'; lot: StockLot })
export interface RecipeChange extends Slot {
  fromMethodId?: string
  toMethodId?: string
  fromPortions?: number
  toPortions?: number
  fromRecipeId: string
  toRecipeId: string
}
export interface ActionResult {
  action: TestedAction
  group: 'helps' | 'tradeoff' | 'system_change' | 'no_gain' | 'invalid'
  targetPercentBefore: number | null
  targetPercentAfter: number | null
  selection: SelectionEvidence | null
  assignmentsRetained: boolean
  error?: string
  targetBefore: number
  targetAfter: number
  totalBefore: number
  totalAfter: number
  deltas: HouseholdDelta[]
  filled: Slot[]
  lost: Slot[]
  changed: RecipeChange[]
  remainingBlockers: Reason[]
}
export interface ActionAnalysis {
  context: PlanningContext
  fingerprint: string
  targetHouseholdId: string
  results: ActionResult[]
}
export type ComparisonExample = 'current' | 'teaching' | 'neutral'
export interface ChosenAction {
  contextKey: string
  fingerprint: string
  targetHouseholdId: string
  action: TestedAction
}
