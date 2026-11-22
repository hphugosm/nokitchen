import { reportStage } from './operator/client'
import { useProcessingStatus } from './operator/useProcessingStatus'
import { AgentboxdDonationSource } from './integrations/donations/AgentboxdDonationSource'
import { parseOffer } from './integrations/donations/parser'
import { previewPaste, impactKey, latestImpact } from './application/donorCommands'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import Workspace from './features/Workspace'
import {
  clearNotice as clearOrdinaryNotice,
  errorNotice,
  dispatch as ordinaryDispatch,
  getView,
  subscribe,
} from './application/store'
import { guidedDemo } from './application/tour'
import { planningOptions } from './domain/policyTypes'
import { contextFor, snapshotFingerprint } from './domain/fingerprint'
import { currentHash, listenToRoute, readRoute, setRoute } from './application/router'
import {
  decisionBaseline,
  reviewForApproval,
  scenarioName,
  displayedPlan,
  householdPublication,
  snapshotOf,
} from './application/selectors'
import { FixtureDonationSource } from './integrations/donations/FixtureDonationSource'
import type { DonationOffer } from './domain/types'
import type { WorkspaceUI } from './application/uiContract'

function App() {
  const ordinary = useSyncExternalStore(subscribe, getView)
  const guided = useSyncExternalStore(guidedDemo.subscribe, guidedDemo.get)
  const { scenario, notice } = guided ?? ordinary
  const operatorWarning = useProcessingStatus(
    ordinary.scenario,
    !!guided || !!ordinary.storageWarning,
  )
  const dispatch = guided ? guidedDemo.dispatch : ordinaryDispatch
  const clearNotice = guided ? guidedDemo.clearNotice : clearOrdinaryNotice
  const hash = useSyncExternalStore(listenToRoute, currentHash)
  const route = guided?.route ?? readRoute(hash)
  const [samples, setSamples] = useState<DonationOffer[]>([])
  useEffect(() => {
    void new FixtureDonationSource().listOffers().then(setSamples)
  }, [])
  const snapshot = useMemo(() => snapshotOf(scenario), [scenario])
  const navigate: WorkspaceUI['navigate'] = (
    mode,
    view = route.bankView,
    id = route.householdId,
  ) =>
    guided
      ? guidedDemo.navigate({ mode, bankView: view, householdId: id })
      : setRoute(mode, view, id)
  const fingerprint = useMemo(() => snapshotFingerprint(snapshot), [snapshot])
  const baseline = useMemo(() => decisionBaseline(scenario), [scenario])
  const decisionContext = useMemo(
    () => (baseline ? contextFor(snapshot, planningOptions(baseline)) : null),
    [snapshot, baseline],
  )
  const display = useMemo(
    () => (route.mode === 'household' ? householdPublication(scenario) : displayedPlan(scenario)),
    [route.mode, scenario],
  )
  const approvalReview = useMemo(() => reviewForApproval(scenario), [scenario])
  const receiptImpact = useMemo(() => latestImpact(scenario), [scenario])
  const availableOffers = [...samples, ...scenario.proposals]
  const offers = availableOffers.flatMap((offer) => {
    const status = scenario.offerStatus[offer.id]
    return status ? [{ ...offer, status }] : []
  })
  return (
    <Workspace
      key={guided ? 'guided' : 'ordinary'}
      fingerprint={fingerprint}
      weekStart={scenario.weekStart}
      operatorWarning={operatorWarning}
      importMail={(mail) => {
        if (!__OPERATOR_MODE__ || guided || ordinary.storageWarning) return false
        const message = new AgentboxdDonationSource(mail).obtain()
        const doc = parseOffer(message, snapshot, scenario.weekStart, mail.entry.offerId)
        return ordinaryDispatch(
          { type: 'savePaste', doc, expectedVersion: null },
          'Email imported for review. Stock is unchanged.',
        )
      }}
      savePaste={(doc, expectedVersion) =>
        dispatch({ type: 'savePaste', doc, expectedVersion }, 'Offer saved for review.')
      }
      previewPaste={(id) => previewPaste(scenario, id)}
      impactKey={(id) => impactKey(scenario, id)}
      latestImpact={receiptImpact}
      chooseDonationCandidate={(offerId, key, choice) =>
        dispatch(
          { type: 'chooseDonationCandidate', offerId, key, choice },
          'Replacement draft selected. Review it before approving.',
        )
      }
      improveVariety={() =>
        dispatch(
          { type: 'improveVariety', planId: scenario.draft?.id ?? '' },
          'Variety search complete.',
        )
      }
      varietyNote={baseline ? scenario.varietyNote : null}
      decisionBaseline={baseline}
      decisionContext={decisionContext}
      approvalReview={approvalReview}
      storageWarning={guided ? null : ordinary.storageWarning}
      scenarioName={(guided ? 'Guided demo · ' : '') + scenarioName(scenario)}
      tour={{
        active: !!guided,
        canAdvance: guidedDemo.canAdvance(),
        markPreview: guidedDemo.markPreview,
        step: guided?.step ?? 0,
        visit: guided?.visit ?? 0,
        initialPlan: guided?.initialPlan ?? null,
        start: guidedDemo.start,
        restart: guidedDemo.start,
        back: guidedDemo.back,
        exit: guidedDemo.exit,
        next: guidedDemo.next,
      }}
      applyPreview={(chosen) =>
        dispatch(
          { type: 'preview', chosen },
          chosen.action.kind === 'donation'
            ? 'Proposal created. Review and confirm receipt in Donations.'
            : 'Equipment applied. Review the new draft before approval.',
        )
      }
      {...route}
      {...display}
      snapshot={snapshot}
      draft={scenario.draft}
      approved={scenario.approved}
      previousDraft={route.mode === 'bank' ? scenario.previousDraft : null}
      sampleOffers={availableOffers}
      offers={offers}
      navigate={navigate}
      selectHousehold={(id) => navigate(route.mode, route.bankView, id)}
      recalculate={() => {
        dispatch({ type: 'recalculate' }, 'Draft recalculated from received stock.')
      }}
      approve={() => {
        dispatch(
          { type: 'approve', planId: scenario.draft?.id },
          'Plan approved. Stock is reserved for this week.',
        )
      }}
      release={() => {
        dispatch(
          { type: 'release' },
          'Reservations released. Recalculate to create a current draft.',
        )
      }}
      reset={async () => {
        try {
          if (__OPERATOR_MODE__ && !guided) {
            const receipts = scenario.proposals.filter(
              (o) =>
                o.document?.message.kind === 'agentboxd' &&
                scenario.offerStatus[o.id] === 'received',
            )
            // Report any outstanding physical receipts before the operator clears this ledger.
            for (const offer of receipts) {
              const id = offer.document!.message.stagingId!
              await reportStage(id, 'reviewed')
              await reportStage(id, 'received')
            }
            if (
              !dispatch(
                { type: 'reset', acknowledgedMail: receipts.map((o) => o.id) },
                'Initial demo restored.',
              )
            )
              return
          } else if (!dispatch({ type: 'reset' }, 'Initial demo restored.')) return
          navigate('bank', 'overview', 'H01')
        } catch {
          errorNotice(
            Error(
              'Reset paused. Reconnect the local inbox so existing receipts can be recorded before clearing this workspace.',
            ),
          )
        }
      }}
      saveHousehold={(household) =>
        dispatch(
          { type: 'household', household },
          'Household saved. Recalculate to see the updated plan.',
        )
      }
      editStock={(lotId, quantity) =>
        dispatch({ type: 'stock', lotId, quantity }, 'Stock quantity saved.')
      }
      loadOffer={(id) => {
        dispatch({ type: 'offer', id, step: 'load' }, 'Sample offer loaded.')
      }}
      reviewOffer={(id, expectedVersion) => {
        dispatch(
          { type: 'offer', id, step: 'review', expectedVersion },
          'Offer reviewed. Confirm receipt when the goods arrive.',
        )
      }}
      receiveOffer={(id, actualRows, confirmDifferences, expectedVersion) => {
        dispatch(
          { type: 'offer', id, step: 'receive', actualRows, confirmDifferences, expectedVersion },
          'Receipt recorded. Recalculate to compare coverage.',
        )
      }}
      notice={notice}
      clearNotice={clearNotice}
    />
  )
}

createRoot(document.getElementById('root')!).render(<App />)
