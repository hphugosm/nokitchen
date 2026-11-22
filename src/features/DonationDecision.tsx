import { useMemo } from 'react'
import { assignmentChanges } from '../domain/impactTrace'
import { allocationDigest } from '../domain/fingerprint'
import type { DonationChoice, OfferImpact } from '../domain/donorTypes'
import { plural, useWork } from './shared'

export const donationChoiceLabels: Record<DonationChoice, string> = {
  keep: 'Keep existing meals',
  coverage: 'Reallocate for coverage',
}
export function DonationOptions({
  impact,
  actual,
  selected,
  onSelect,
}: {
  impact: OfferImpact
  actual: boolean
  selected: DonationChoice
  onSelect: (choice: DonationChoice) => void
}) {
  const { decision, before } = impact
  const { draft, approved } = useWork()
  const isApproved = decision.baselineStatus === 'approved'
  const different = useMemo(
    () => decision.keep && allocationDigest(decision.keep) !== allocationDigest(decision.coverage),
    [decision],
  )
  const showBoth = !!different && (!actual || impact.canChoose)
  const choices: DonationChoice[] = showBoth ? ['keep', 'coverage'] : [selected]
  const baselineLabel = isApproved ? 'Approved plan' : 'Unapproved draft'
  const recommended =
    decision.recommended === 'keep' && isApproved
      ? 'Keep approved meals'
      : donationChoiceLabels[decision.recommended]
  const currentDraft = actual && draft?.id === impact.after.id && approved?.id !== impact.after.id
  return (
    <section className="donation-options" aria-label="Donation plan options">
      <h3>{actual ? 'Plan after receipt' : 'Compare hypothetical plans'}</h3>
      <p>
        <strong>{baselineLabel}</strong> is the common baseline ·{' '}
        {plural(before.allocations.length, 'filled slot')} ·{' '}
        {plural(before.metrics.allocated, 'person-portion')}.
        {isApproved && !actual && draft && draft.id !== before.id
          ? ' A newer draft also exists. Both options are measured against the captured approval.'
          : ''}
      </p>
      <p>
        <strong>Recommended: {recommended}</strong>.{' '}
        {decision.recommended === 'keep'
          ? 'The validated baseline keeps its meal and lot commitments. The bank can use residual stock for extra meals.'
          : !decision.keep
            ? 'The baseline could not be retained under the current constraints.'
            : 'The baseline is an unapproved draft. The ordinary coverage-first comparison applies.'}
      </p>
      {!decision.keep && (
        <p className="note warning">
          Preserving option unavailable. {decision.keepIssues.join(' ')}
        </p>
      )}
      <div className="donation-candidates">
        {choices.map((choice) => {
          const plan = decision[choice]!,
            changes = assignmentChanges(before, plan)
          const totals = (kind: (typeof changes)[number]['kind']) =>
            changes.filter((c) => c.kind === kind).length
          return (
            <div
              className={'donation-card' + (choice === selected ? ' selected' : '')}
              key={choice}
            >
              {showBoth ? (
                <button
                  className="button"
                  aria-pressed={choice === selected}
                  onClick={() => onSelect(choice)}
                >
                  {donationChoiceLabels[choice]}
                </button>
              ) : (
                <strong>{donationChoiceLabels[choice]}</strong>
              )}
              <p>
                {plural(plan.metrics.allocated, 'person-portion')} ·{' '}
                {plural(plan.allocations.length, 'filled slot')}
              </p>
              <small>
                {totals('filled')} newly filled · {totals('removed')} become unfilled ·{' '}
                {totals('changed')} changed
              </small>
            </div>
          )
        })}
      </div>
      {decision.keep && !different && (
        <p className="muted">Both approaches produced identical meals and lot commitments.</p>
      )}
      <p className="muted">
        {!actual
          ? 'These alternatives are hypothetical. Choosing one updates this preview.'
          : currentDraft
            ? approved
              ? 'This is a draft. The active household approval and its reservations stay in place until you choose Approve plan.'
              : 'This is an unapproved draft. Approve plan reserves the selected meals.'
            : approved?.id === impact.after.id
              ? 'The selected receipt plan has been approved.'
              : 'This comparison records the plan calculated at receipt. The current weekly plan may have changed.'}
      </p>
      <details className="meal-links">
        <summary>Baseline and recommendation rule</summary>
        <dl className="context-data">
          <dt>Baseline status</dt>
          <dd>{baselineLabel}</dd>
          <dt>Captured plan</dt>
          <dd>{before.id}</dd>
          <dt>Baseline allocation</dt>
          <dd>{decision.baselineDigest}</dd>
          <dt>Recommendation rule</dt>
          <dd>{decision.ruleId}</dd>
          <dt>Selected candidate</dt>
          <dd>{selected}</dd>
          <dt>Analysis context</dt>
          <dd>{impact.key}</dd>
        </dl>
      </details>
    </section>
  )
}
