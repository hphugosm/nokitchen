import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Eye, HandHeart, Plus } from 'lucide-react'
import { evaluateActions } from '../domain/analysis'
import { DAYS } from '../domain/types'
import type { ActionResult, ChosenAction } from '../domain/analysisTypes'
import { Chip, HouseholdSelect, ingredientFor, PageTitle, plural, Reasons, useWork } from './shared'
import { HouseholdChanges, MealChanges, signed } from './Effects'
import { SourceStamp } from './Needs'
import { PlanActions, SelectionDetails } from './Policy'

const groups: Record<ActionResult['group'], string> = {
  helps: 'Helps the target with no household coverage loss',
  tradeoff: 'Helps the target with a trade-off elsewhere',
  no_gain: 'No observed gain',
  system_change: 'System changes with no target gain',
  invalid: 'Invalid scenario',
}

interface Preview {
  sourceName: string
  choice: ChosenAction
  result: ActionResult
}
export default function WhatIf() {
  const ui = useWork(),
    { snapshot, householdId, fingerprint, tour, decisionBaseline, decisionContext, scenarioName } =
      ui
  const report = useMemo(
    () =>
      decisionContext?.snapshotFingerprint === fingerprint &&
      decisionBaseline?.fingerprint === fingerprint
        ? evaluateActions(snapshot, householdId, undefined, decisionBaseline)
        : null,
    [snapshot, householdId, decisionBaseline, decisionContext?.key, fingerprint],
  )
  const [opened, setOpened] = useState<Preview | null>(null),
    [applied, setApplied] = useState<string | null>(null)
  const previewArea = useRef<HTMLElement>(null)
  useEffect(() => {
    if (opened) {
      previewArea.current?.scrollIntoView({ block: 'start' })
      previewArea.current?.focus({ preventScroll: true })
    }
  }, [opened])
  if (!report || !decisionContext || report.context.key !== decisionContext.key) {
    return (
      <>
        <PageTitle title="What would help?" subtitle={scenarioName} />
        <div className="panel empty-view">
          <AlertCircle />
          <h2>A current decision baseline is needed</h2>
          <p>Recalculate this scenario before comparing changes.</p>
          <button className="button primary" onClick={ui.recalculate}>
            Recalculate
          </button>
        </div>
      </>
    )
  }
  const owner = snapshot.households.find((h) => h.id === householdId)!
  const current = opened?.choice.targetHouseholdId === householdId ? opened : null
  const stale =
    current &&
    (current.choice.fingerprint !== fingerprint ||
      current.choice.contextKey !== decisionContext.key)
  const select = (r: ActionResult) => {
    const choice = {
      contextKey: report.context.key,
      fingerprint: report.fingerprint,
      targetHouseholdId: householdId,
      action: r.action,
    }
    setOpened({ choice, result: r, sourceName: scenarioName })
    setApplied(null)
  }
  function apply() {
    if (!current || stale || current.result.error) return
    setOpened(current)
    if (ui.applyPreview(current.choice)) {
      setApplied(current.choice.action.id)
      if (current.choice.action.kind === 'donation') ui.navigate('bank', 'donations', householdId)
    }
  }
  return (
    <>
      <PageTitle
        title="What would help?"
        subtitle="Test one change at a time against the same weekly plan."
      />
      <div className="panel filters">
        <HouseholdSelect
          value={householdId}
          onChange={(id) => {
            setOpened(null)
            setApplied(null)
            ui.selectHousehold(id)
          }}
        />
        <p className="muted">
          <strong>{scenarioName}</strong>
          <br />
          Meal coverage first tests each change against the same current allocation.
        </p>
      </div>
      {
        <>
          <div className="section-heading">
            <h2>Tested changes</h2>
            <Chip>{plural(report.results.length, 'scenario')}</Chip>
          </div>
          {(Object.keys(groups) as ActionResult['group'][]).map((group) => {
            const rows = report.results.filter((r) => r.group === group)
            if (!rows.length) return null
            return (
              <section className="panel action-group" key={group}>
                <h3>{groups[group]}</h3>
                {rows.map((r) => (
                  <div className="action-row" key={r.action.id}>
                    <div>
                      <strong>{r.action.label}</strong>
                      <small>
                        {owner.name} {signed(r.targetAfter - r.targetBefore)} portions · All
                        households {signed(r.totalAfter - r.totalBefore)}
                      </small>
                    </div>
                    <button
                      className="button"
                      onClick={() => select(r)}
                      aria-label={'Preview ' + r.action.label}
                    >
                      <Eye />
                      Preview change
                    </button>
                  </div>
                ))}
              </section>
            )
          })}
        </>
      }
      {current && (
        <section ref={previewArea} tabIndex={-1} className="panel preview-panel" aria-live="polite">
          <div className="panel-head">
            <div>
              <h2>{current.result.action.label}</h2>
              <p>
                {owner.name} · {current.sourceName} · Meal coverage first
              </p>
            </div>
            <Chip tone={stale ? 'terra' : 'neutral'}>
              {stale ? 'Out of date' : current.result.error ? 'Invalid scenario' : 'Preview'}
            </Chip>
          </div>
          <div className="panel-body">
            {stale && (
              <div className="note warning">
                <AlertCircle />
                {applied === current.choice.action.id
                  ? 'This preview records the inputs before the change. The selected draft below uses the updated inputs.'
                  : 'The inputs or prior allocation have changed. Select a current preview before applying a change.'}
              </div>
            )}
            {current.result.action.kind === 'donation' && (
              <p>
                {current.result.action.lot.quantityBaseUnits}{' '}
                {ingredientFor(snapshot, current.result.action.lot.ingredientId).unit} of{' '}
                {ingredientFor(snapshot, current.result.action.lot.ingredientId).name}. Available
                from {DAYS[current.result.action.lot.availableFromDay]}, usable through{' '}
                {DAYS[current.result.action.lot.usableThroughDay]}.
              </p>
            )}
            {current.result.error && (
              <div className="note warning">
                <AlertCircle />
                {current.result.error}
              </div>
            )}
            {current.result.selection && (
              <>
                <p className="assignment-effect">
                  {current.result.assignmentsRetained
                    ? current.result.filled.length
                      ? 'Existing assignments retained and extended.'
                      : 'Existing assignments retained.'
                    : 'Existing assignments changed.'}
                </p>
                <SelectionDetails selection={current.result.selection} />
              </>
            )}
            <div className="action-scores">
              <div>
                <span>{owner.name} portions</span>
                <strong>
                  {current.result.targetBefore} → {current.result.targetAfter}
                </strong>
                <small>
                  {current.result.targetPercentBefore === null ||
                  current.result.targetPercentAfter === null
                    ? 'No meals requested'
                    : current.result.targetPercentBefore.toFixed(2) +
                      '% → ' +
                      current.result.targetPercentAfter.toFixed(2) +
                      '% coverage'}
                </small>
              </div>
              <div>
                <span>All household portions</span>
                <strong>
                  {current.result.totalBefore} → {current.result.totalAfter}
                </strong>
              </div>
            </div>
            <h3>Effect on every household</h3>
            <HouseholdChanges snapshot={snapshot} rows={current.result.deltas} />
            <MealChanges changes={current.result} />
            <details className="meal-links">
              <summary>Blockers remaining for {owner.name}</summary>
              {current.result.remainingBlockers.length ? (
                <Reasons reasons={current.result.remainingBlockers} />
              ) : (
                <p>No remaining blockers were reported.</p>
              )}
            </details>
            {
              <div className="actions">
                <button
                  className="button primary"
                  disabled={
                    !!stale || !!current.result.error || applied === current.choice.action.id
                  }
                  onClick={apply}
                >
                  {current.choice.action.kind === 'donation' ? <HandHeart /> : <Plus />}
                  {current.choice.action.kind === 'donation'
                    ? 'Create donation proposal'
                    : 'Apply equipment change'}
                </button>
              </div>
            }
            {applied === current.choice.action.id && current.choice.action.kind !== 'donation' && (
              <div className="actions workflow-actions">
                <PlanActions />
              </div>
            )}
            <SourceStamp fingerprint={current.choice.fingerprint} />
            <p className="source-stamp">
              Source decision context <code>{current.choice.contextKey}</code>
            </p>
          </div>
        </section>
      )}
      {!current && (
        <p className="muted">
          Select a preview to inspect gained, lost, and changed meals and remaining blockers.
        </p>
      )}
      <SourceStamp fingerprint={report.fingerprint} />
    </>
  )
}
