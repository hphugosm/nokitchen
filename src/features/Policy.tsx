import { CheckCheck, ChevronDown, RefreshCw, Scale } from 'lucide-react'
import { DonationOptions, donationChoiceLabels } from './DonationDecision'
import { DonationImpact } from './DonationImpact'
import { assignmentChanges } from '../domain/impactTrace'
import { DAYS } from '../domain/types'
import { DONATION_RULE } from '../domain/donorTypes'
import type { CandidateKind, SelectionEvidence } from '../domain/policyTypes'
import { HouseholdChanges, MealChanges } from './Effects'
import { plural, useWork } from './shared'

const policy = 'Meal coverage first'
const candidateNames: Record<CandidateKind, string> = {
  'improve-variety': 'Improve variety at fixed coverage',
  'fresh-refined': 'Fresh plan with a variety improvement',
  'family-aware': 'Family-aware fresh plan',
  'fresh-legacy': 'Fresh NoKitchen heuristic',
  retain: 'Retain validated assignments',
  extend: 'Preserve and extend assignments',
}

export function SelectionDetails({ selection }: { selection: SelectionEvidence }) {
  const context = selection.context
  const preserving =
    context.strategyId === DONATION_RULE + '/approved/keep' ||
    context.strategyId === DONATION_RULE + '/draft/keep'
  const name = preserving ? 'Keep existing meals' : policy
  return (
    <details className="selection-details">
      <summary>
        <span>
          <Scale size={16} />
          Why this plan?
        </span>
        <ChevronDown size={15} />
      </summary>
      <div>
        <p>
          <strong>{name}</strong> selected <strong>{candidateNames[selection.winner]}</strong>.{' '}
          {selection.reason}
        </p>
        <p className="muted">
          {preserving
            ? 'Only valid retaining and preserving extensions are eligible for this option.'
            : context.operation === 'improve-variety'
              ? 'Variety improves at fixed slots and portions. Each household keeps or improves its variety score.'
              : 'Valid candidates are ranked by covered portions, lowest household coverage, stability, variety, then stable candidate ID.'}
        </p>
        <div className="table-scroll">
          <table className="data-table policy-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Validation</th>
                <th>Portions</th>
                <th>Lowest household coverage</th>
                <th>Changed assignments</th>
                <th>Variety score¹</th>
              </tr>
            </thead>
            <tbody>
              {selection.candidates.map((c) => (
                <tr key={c.kind}>
                  <th>
                    {candidateNames[c.kind]}
                    {c.kind === selection.winner && <small>Selected</small>}
                  </th>
                  <td>
                    {c.valid ? 'Valid' : 'Excluded'}
                    {c.issues.length > 0 && <p>{c.issues.join(' ')}</p>}
                  </td>
                  <td>{c.score?.total ?? '—'}</td>
                  <td>
                    {c.score?.minimum
                      ? c.score.minimum.allocated + ' / ' + c.score.minimum.requested
                      : '—'}
                  </td>
                  <td>{c.score?.changedAssigned ?? '—'}</td>
                  <td>{c.score?.variety?.join(' / ') ?? c.score?.repeats ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          ¹ Matching meal-type pairs / consecutive meals of the same type / matching recipe pairs.
          Lower is better.
        </p>
        <dl className="context-data">
          <dt>Operation / metric</dt>
          <dd>
            {context.operation} / {context.metricVersion}
          </dd>
          <dt>Engine / parameters</dt>
          <dd>
            {context.engineVersion} / {context.parametersId}
          </dd>
          <dt>Snapshot</dt>
          <dd>{context.snapshotFingerprint}</dd>
          <dt>Incumbent allocation</dt>
          <dd>{context.incumbentDigest ?? 'None · fresh calculation'}</dd>
          <dt>Decision context</dt>
          <dd>{context.key}</dd>
          <dt>Selected allocation</dt>
          <dd>{selection.allocationDigest}</dd>
        </dl>
      </div>
    </details>
  )
}
export function PolicySummary() {
  const { plan, scenarioName, planLabel, latestImpact } = useWork()
  const decision = latestImpact?.after.id === plan?.id ? latestImpact?.decision : null
  return (
    <div className="policy-summary">
      <div>
        <Scale />
        <strong>{decision ? 'Donation plan selection' : policy}</strong>
        <span>{scenarioName}</span>
      </div>
      {plan?.selection && (
        <p>
          {decision
            ? (planLabel === 'Out of date' ? 'Previous option' : 'Selected option') +
              ' · ' +
              donationChoiceLabels[decision.selected]
            : plan.selection.context.operation === 'improve-variety'
              ? 'Compares meal variety while keeping each household’s assigned slots and portions.'
              : 'Prioritizes covered meal portions. At equal coverage, favors the least-covered household and more stable meal choices.'}
        </p>
      )}
    </div>
  )
}
function useReceiptReview(offerId?: string) {
  const ui = useWork(),
    draft = ui.draft
  const current = !!draft && draft.fingerprint === ui.fingerprint && ui.planLabel !== 'Out of date'
  const impact =
    ui.latestImpact && (ui.bankView === 'overview' || ui.latestImpact.offerId === offerId)
      ? ui.latestImpact
      : null
  const receiptChoice = current && impact?.after.id === draft?.id ? impact : null
  return { ui, current, impact, receiptChoice }
}

export function ReceiptAnalysis({ offerId }: { offerId?: string }) {
  const { impact, receiptChoice } = useReceiptReview(offerId)
  if (!impact) return null
  return <DonationImpact key={impact.offerId} impact={impact} actual showOptions={!receiptChoice} />
}

export function PlanActions({ offerId }: { offerId?: string } = {}) {
  const { ui, current, impact, receiptChoice } = useReceiptReview(offerId)
  const review = current && ui.planLabel !== 'Approved' ? ui.approvalReview : null
  const alreadyCompared =
    receiptChoice && review?.beforeDigest === receiptChoice.decision.baselineDigest
  return (
    <div className={'plan-actions ' + (review || impact ? 'with-review' : '')}>
      {receiptChoice && (
        <DonationOptions
          impact={receiptChoice}
          actual
          selected={receiptChoice.decision.selected}
          onSelect={(c) => ui.chooseDonationCandidate(receiptChoice.offerId, receiptChoice.key, c)}
        />
      )}
      {review && (
        <section aria-label="Changes before approval" className="review-panel">
          <h2>Changes before approval</h2>
          <p>
            Compared with {review.basis.toLowerCase()}. Allocated portions change from{' '}
            <strong>{review.before}</strong> to <strong>{review.after}</strong>.
          </p>
          <p>
            {plural(review.filled.length, 'newly filled meal')} ·{' '}
            {plural(review.lost.length, 'lost meal')} ·{' '}
            {plural(review.changed.length, 'changed assigned meal')}. A household may lose a
            meal even when its weekly portion count holds steady.
          </p>
          <HouseholdChanges
            rows={review.deltas}
            snapshot={ui.snapshot}
            slots={review}
            before={alreadyCompared ? 'Baseline portions' : 'Previous portions'}
            after={alreadyCompared ? 'Selected draft' : 'Draft portions'}
            lossLabel={alreadyCompared ? 'Would become unfilled' : 'Lost meals'}
          />
          {alreadyCompared &&
            assignmentChanges(receiptChoice.before, receiptChoice.after)
              .filter((c) => c.kind === 'removed')
              .map((c) => (
                <p className="loss" key={c.householdId + c.day + c.meal}>
                  Would become unfilled ·{' '}
                  {ui.snapshot.households.find((h) => h.id === c.householdId)?.name} ·{' '}
                  {DAYS[c.day]} {c.meal} ·{' '}
                  {ui.snapshot.recipes.find((r) => r.id === c.before!.recipeId)?.name} ·{' '}
                  {plural(c.before!.portions, 'portion')}
                </p>
              ))}
          <MealChanges changes={review} />
        </section>
      )}
      {!offerId && ui.planLabel === 'Draft' && (
        <p className="publication-note">
          Approve this draft to publish meals to the household portal.
        </p>
      )}
      <div className="actions">
        <button className="button" onClick={ui.recalculate}>
          <RefreshCw />
          Recalculate
        </button>
        <button
          className="button primary"
          disabled={!current || ui.planLabel === 'Approved'}
          onClick={ui.approve}
        >
          <CheckCheck />
          {ui.planLabel === 'Approved' ? 'Plan approved' : 'Approve plan'}
        </button>
      </div>
      {offerId && <ReceiptAnalysis offerId={offerId} />}
    </div>
  )
}
