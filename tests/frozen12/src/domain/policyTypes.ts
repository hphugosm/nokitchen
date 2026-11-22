import type { AllocationPlan, Slot } from './types'
import type { HouseholdDelta, RecipeChange } from './analysisTypes'

export const ENGINE_VERSION = '1.2.0' as const
export const POLICY_ID = 'meal-coverage-first' as const
export const PARAMETERS_ID = 'total-minimum-stability-repetition-v1' as const
export interface PlanningOptions {
  engineVersion: typeof ENGINE_VERSION
  policyId: typeof POLICY_ID
  incumbentPlan: AllocationPlan | null
}
export const planningOptions = (incumbentPlan: AllocationPlan | null = null): PlanningOptions => ({
  engineVersion: ENGINE_VERSION,
  policyId: POLICY_ID,
  incumbentPlan,
})
export interface PlanningContext {
  key: string
  snapshotFingerprint: string
  engineVersion: string
  policyId: string
  parametersId: string
  incumbentDigest: string | null
  incumbentEvidenceDigest: string | null
}
export type CandidateKind = 'fresh-legacy' | 'retain' | 'extend'
export interface CandidateScore {
  total: number
  minimum: { allocated: number; requested: number } | null
  changedAssigned: number
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
