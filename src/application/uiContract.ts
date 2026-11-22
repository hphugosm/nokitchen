import type { PastedOffer, OfferRow, OfferImpact, DonationChoice } from '../domain/donorTypes'
import type { ApprovalReview, PlanningContext } from '../domain/policyTypes'
import type { AllocationPlan, DonationOffer, Household, PlanningSnapshot } from '../domain/types'
import type { ChosenAction } from '../domain/analysisTypes'
export interface TourControls {
  markPreview: (id: string, key: string) => void
  canAdvance: boolean
  active: boolean
  step: number
  visit: number
  initialPlan: AllocationPlan | null
  start: () => void
  exit: () => void
  restart: () => void
  back: () => void
  next: () => void
}
export type BankView =
  | 'needs'
  | 'compare'
  | 'whatif'
  | 'overview'
  | 'inventory'
  | 'households'
  | 'recipes'
  | 'donations'
  | 'packing'
export interface WorkspaceUI {
  weekStart: string
  operatorWarning: string | null
  importMail: (mail: import('../operator/contract').ImportedMail) => boolean
  savePaste: (doc: PastedOffer, expectedVersion: number | null) => boolean
  previewPaste: (id: string) => OfferImpact
  impactKey: (id: string) => string
  chooseDonationCandidate: (offerId: string, key: string, choice: DonationChoice) => boolean
  latestImpact: OfferImpact | null
  improveVariety: () => void
  varietyNote: string | null
  decisionBaseline: AllocationPlan | null
  decisionContext: PlanningContext | null
  approvalReview: ApprovalReview | null
  scenarioName: string
  storageWarning: string | null
  fingerprint: string
  tour: TourControls
  applyPreview: (chosen: ChosenAction) => boolean
  snapshot: PlanningSnapshot
  draft: AllocationPlan | null
  approved: AllocationPlan | null
  plan: AllocationPlan | null
  planLabel:
    'Draft' | 'Approved' | 'Out of date' | 'No plan' | 'Waiting for approval' | 'Needs review'
  previousDraft: AllocationPlan | null
  offers: DonationOffer[]
  sampleOffers: DonationOffer[]
  mode: 'bank' | 'household'
  bankView: BankView
  householdId: string
  navigate: (mode: 'bank' | 'household', view?: BankView, householdId?: string) => void
  selectHousehold: (id: string) => void
  recalculate: () => void
  approve: () => void
  release: () => void
  reset: () => void
  saveHousehold: (value: Household) => boolean
  editStock: (lotId: string, quantity: number) => boolean
  loadOffer: (id: string) => void
  reviewOffer: (id: string, expectedVersion?: number) => void
  receiveOffer: (
    id: string,
    actualRows?: OfferRow[],
    confirmDifferences?: boolean,
    expectedVersion?: number,
  ) => void
  notice: { text: string; error: boolean } | null
  clearNotice: () => void
}
