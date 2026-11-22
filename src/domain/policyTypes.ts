import type { AllocationPlan, Slot } from './types'
import type { HouseholdDelta, RecipeChange } from './analysisTypes'

export const ENGINE_VERSION = '1.3.0' as const
export const POLICY_ID = 'meal-coverage-first' as const
export const PARAMETERS_ID = 'total-minimum-stability-family-v2-fresh-one' as const
export const CATALOG_REVISION = 'catalog-families-1.3'
export const METRIC_VERSION = 'family-collisions-v1'
export const SEARCH_BUDGET = 240
export type Operation = 'select' | 'improve-variety'
export interface PlanningOptions {
  operation: Operation
  strategyId: string
  engineVersion: typeof ENGINE_VERSION
  policyId: typeof POLICY_ID
  incumbentPlan: AllocationPlan | null
}
export const planningOptions = (
  incumbentPlan: AllocationPlan | null = null,
  operation: Operation = 'select',
  strategyId: string = operation,
): PlanningOptions => ({
  operation,
  strategyId,
  engineVersion: ENGINE_VERSION,
  policyId: POLICY_ID,
  incumbentPlan,
})
export interface PlanningContext {
  operation: Operation
  strategyId: string
  catalogRevision: string
  metricVersion: string
  searchBudget: number
  key: string
  snapshotFingerprint: string
  engineVersion: string
  policyId: string
  parametersId: string
  incumbentDigest: string | null
  incumbentEvidenceDigest: string | null
}
export type CandidateKind =
  'fresh-legacy' | 'retain' | 'extend' | 'family-aware' | 'fresh-refined' | 'improve-variety'
export interface CandidateScore {
  total: number
  minimum: { allocated: number; requested: number } | null
  changedAssigned: number
  variety?: [number, number, number]
  repeats: number
}
export interface CandidateEvidence {
  kind: CandidateKind
  valid: boolean
  score: CandidateScore | null
  issues: string[]
  allocationDigest: string | null
}
export interface SelectionEvidence {
  context: PlanningContext
  winner: CandidateKind
  reason: string
  allocationDigest: string
  candidates: CandidateEvidence[]
  /** Original assignments held fixed while evaluating a preserve-and-extend candidate. */
  fixedSlots?: Slot[]
}
export type SelectedPlan = AllocationPlan & { selection: SelectionEvidence }
export interface PlanChange {
  deltas: HouseholdDelta[]
  filled: Slot[]
  lost: Slot[]
  changed: RecipeChange[]
}
export interface ApprovalReview extends PlanChange {
  basis: 'Active approved plan' | 'Previous draft'
  before: number
  after: number
  beforeDigest: string
}
