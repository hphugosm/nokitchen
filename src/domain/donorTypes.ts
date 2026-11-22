import type { PackageKind, Storage, Unit } from './types'
export const MODEL_WEEK = '2026-11-23'
export interface DonorMessage {
  kind: 'manual' | 'fixture' | 'agentboxd'
  externalId?: string
  inboxId?: string
  stagingId?: string
  receivedAt: string
  sender: string
  subject: string
  text: string
}
export interface OfferRow {
  id: string
  sourceText: string
  span: [number, number]
  line: number
  ingredientId: string | null
  match: 'matched' | 'ambiguous' | 'unknown' | 'operator'
  quantity: number | null
  unit: Unit | null
  packageCount: number | null
  packageSize: number | null
  basis: 'edible' | 'net' | 'drained' | null
  deliveryDate: string | null
  expiryDate: string | null
  expiryType: 'best-before' | 'use-by' | null
  packageKind: PackageKind | null
  storage: Storage | null
  afterOpening: Storage | null
  canRepack: boolean | null
  requiresCanOpener: boolean | null
  availableFromDay: number | null
  usableThroughDay: number | null
  excludedReason: string | null
  evidence: Record<string, string>
  edits: Record<string, string>
}
export interface PastedOffer {
  id: string
  version: number
  parserId: string
  catalogRevision: string
  weekStart: string
  message: DonorMessage
  rows: OfferRow[]
}
export const DONATION_RULE = 'approved-meals-first-v1' as const
export type DonationChoice = 'keep' | 'coverage'
export interface DonationDecision {
  baselineStatus: 'approved' | 'draft'
  baselineDigest: string
  ruleId: typeof DONATION_RULE
  recommended: DonationChoice
  selected: DonationChoice
  keep: import('./types').AllocationPlan | null
  coverage: import('./types').AllocationPlan
  keepIssues: string[]
}
export interface OfferImpact {
  decision: DonationDecision
  canChoose: boolean
  key: string
  offerId: string
  before: import('./types').AllocationPlan
  after: import('./types').AllocationPlan
  items: import('./types').DonationItem[]
  weekStart: string
}
