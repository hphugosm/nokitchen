import type { ApprovalReview, PlanningContext } from '../domain/policyTypes'
import type { AllocationPlan, DonationOffer, Household, PlanningSnapshot } from '../domain/types'
import type { ChosenAction } from '../domain/analysisTypes'
export interface TourControls {
  active: boolean
  chosenApproved: boolean
  step: number
  visit: number
  chosen: ChosenAction | null
  initialPlan: AllocationPlan | null
  start: () => void
  exit: () => void
  restart: () => void
  back: () => void
  next: () => void
  choose: (action: ChosenAction) => void
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
  planLabel: 'Draft' | 'Approved' | 'Out of date' | 'No plan'
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
  reviewOffer: (id: string) => void
  receiveOffer: (id: string) => void
  notice: { text: string; error: boolean } | null
  clearNotice: () => void
}
