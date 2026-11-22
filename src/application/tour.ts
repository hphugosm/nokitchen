import { applyAction, createSeed, type Action, type Scenario } from './state'
import { decisionBaseline } from './selectors'
import { impactKey } from './donorCommands'
import type { Route } from './router'
import type { AllocationPlan } from '../domain/types'
import type { WorkspaceUI } from './uiContract'
import { comparePlanChanges } from '../domain/selection'

interface TourFrame {
  step: number
  scenario: Scenario
  route: Route
  offerId: string | null
  previewKey: string | null
  varietyPlanId: string | null
}
interface LiveTour extends TourFrame {
  visit: number
  initialPlan: AllocationPlan
  notice: WorkspaceUI['notice']
}
function routeFor(step: number, householdId: string): Route {
  return {
    mode: 'bank',
    bankView: step >= 1 && step <= 4 ? 'donations' : 'overview',
    householdId,
  }
}

/** A tour owns its seed, commands and Back checkpoints. It never writes ordinary browser storage. */
export class TourSession {
  private live: LiveTour | null = null
  private entries: TourFrame[] = []
  private serial = 0
  private listeners = new Set<() => void>()
  get = () => this.live
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private show(live: LiveTour | null) {
    this.live = live
    this.listeners.forEach((f) => f())
  }
  start = () => {
    const scenario = createSeed()
    const frame: TourFrame = {
      step: 0,
      scenario,
      route: routeFor(0, 'H01'),
      offerId: null,
      previewKey: null,
      varietyPlanId: null,
    }
    this.entries = [frame]
    this.show({ ...frame, visit: ++this.serial, initialPlan: scenario.draft!, notice: null })
  }
  exit = () => {
    this.entries = []
    this.show(null)
  }
  navigate = (route: Route) => {
    if (this.live) this.show({ ...this.live, route })
  }
  clearNotice = () => {
    if (this.live) this.show({ ...this.live, notice: null })
  }
  markPreview = (id: string, key: string) => {
    const l = this.live
    if (l && l.offerId === id && key && impactKey(l.scenario, id) === key)
      this.show({ ...l, previewKey: key })
  }
  canAdvance = () => {
    const l = this.live
    if (!l) return false
    const s = l.scenario,
      id = l.offerId
    switch (l.step) {
      case 0:
        return true
      case 1:
        return !!id && s.proposals.some((o) => o.id === id && o.source === 'paste')
      case 2:
        return !!id && s.offerStatus[id] === 'reviewed'
      case 3:
        return !!id && !!l.previewKey && l.previewKey === impactKey(s, id)
      case 4:
        return (
          !!id &&
          s.offerStatus[id] === 'received' &&
          !!s.receiptComparison?.after &&
          !!decisionBaseline(s)
        )
      case 5:
        return !!l.varietyPlanId && decisionBaseline(s)?.id === l.varietyPlanId
      case 6:
        return !!l.varietyPlanId && s.approved?.id === l.varietyPlanId && !!decisionBaseline(s)
      default:
        return false
    }
  }
  dispatch = (action: Action, success: string): boolean => {
    const l = this.live
    if (!l) return false
    try {
      const scenario = applyAction(l.scenario, action)
      const offerId = action.type === 'savePaste' ? action.doc.id : l.offerId
      const varietyPlanId = action.type === 'improveVariety' ? scenario.draft!.id : l.varietyPlanId
      const route =
        l.step === 6 && action.type === 'approve' && scenario.approved?.id === varietyPlanId
          ? { ...l.route, mode: 'household' as const }
          : l.route
      this.show({
        ...l,
        offerId,
        varietyPlanId,
        scenario,
        route,
        notice: { text: success, error: false },
      })
      return true
    } catch (error) {
      this.show({
        ...l,
        notice: {
          text: error instanceof Error ? error.message : 'Could not apply this change.',
          error: true,
        },
      })
      return false
    }
  }
  next = () => {
    const l = this.live
    if (!l || !this.canAdvance() || l.step === 6) return
    const step = l.step + 1,
      s = l.scenario
    const delta =
      step === 6 && s.draft && s.receiptComparison
        ? comparePlanChanges(s.receiptComparison.before, s.draft)
        : null
    const target =
      delta?.deltas.filter((h) => h.delta > 0).sort((a, b) => b.delta - a.delta)[0]?.householdId ??
      delta?.changed[0]?.householdId ??
      l.route.householdId
    const frame: TourFrame = {
      step,
      scenario: s,
      offerId: l.offerId,
      previewKey: l.previewKey,
      varietyPlanId: l.varietyPlanId,
      route: routeFor(step, target),
    }
    this.entries[step] = frame
    this.show({ ...frame, visit: ++this.serial, initialPlan: l.initialPlan, notice: null })
  }
  back = () => {
    const l = this.live
    if (!l || !l.step) return
    const frame = this.entries[l.step - 1]
    this.entries.length = frame.step + 1
    this.show({ ...frame, visit: ++this.serial, initialPlan: l.initialPlan, notice: null })
  }
}
export const guidedDemo = new TourSession()
