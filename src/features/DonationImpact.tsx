import { useMemo, useRef, useState } from 'react'
import { Package } from 'lucide-react'
import { comparePlanChanges } from '../domain/selection'
import { assignmentChanges, type AssignmentChange } from '../domain/impactTrace'
import { packageDescription } from '../domain/audit'
import {
  COLLECTIONS,
  collectionForDay,
  DAYS,
  MEALS,
  type Allocation,
  type AllocationPlan,
  type Meal,
  type PlanningSnapshot,
} from '../domain/types'
import type { DonationChoice, OfferImpact } from '../domain/donorTypes'
import { HouseholdChanges, signed } from './Effects'
import { DonationOptions } from './DonationDecision'
import { VarietyEvidence } from './VarietyEvidence'
import { BoxTrace, type RevealBox } from './BoxTrace'
import { EmailDinner } from './EmailDinner'
import { fmt, ingredientFor, plural, pretty, useWork } from './shared'

function mealNames(snapshot: PlanningSnapshot, meal: Allocation) {
  const recipe = snapshot.recipes.find((r) => r.id === meal.recipeId)!
  return {
    recipe: recipe.name,
    method: recipe.methods.find((m) => m.id === meal.methodId)?.name ?? meal.methodId,
  }
}
function lotOnly(c: AssignmentChange) {
  return (
    c.kind === 'changed' &&
    c.before?.recipeId === c.after?.recipeId &&
    c.before?.methodId === c.after?.methodId &&
    c.before?.portions === c.after?.portions
  )
}
function describeChange(snapshot: PlanningSnapshot, c: AssignmentChange) {
  const describe = (a: Allocation | null) => {
    if (!a) return 'Unfilled'
    const names = mealNames(snapshot, a)
    return [names.recipe, names.method, plural(a.portions, 'portion')].join(' · ')
  }
  return lotOnly(c)
    ? describe(c.after) + ' · Lot commitments changed'
    : describe(c.before) + ' → ' + describe(c.after)
}
function MealDescription({
  allocation,
  empty = 'Unfilled',
}: {
  allocation?: Allocation | null
  empty?: string
}) {
  const { snapshot } = useWork()
  if (!allocation) return <span>{empty}</span>
  const names = mealNames(snapshot, allocation)
  return (
    <>
      <strong>{names.recipe}</strong>
      <small>
        {names.method} · {plural(allocation.portions, 'portion')}
      </small>
    </>
  )
}
function Batch({
  a,
  label,
  incoming,
}: {
  a?: Allocation | null
  label: string
  incoming?: OfferImpact['items']
}) {
  const { snapshot } = useWork()
  const method = a
    ? snapshot.recipes.find((r) => r.id === a.recipeId)?.methods.find((m) => m.id === a.methodId)
    : null
  return (
    <div>
      <h4>{label}</h4>
      <MealDescription allocation={a} />
      {method && (
        <p className="batch-appliances">
          Required appliances ·{' '}
          {method.appliances
            .map((id) => snapshot.appliances.find((x) => x.id === id)?.name ?? id)
            .join(', ') || 'None'}
        </p>
      )}
      {a && (
        <ul>
          {a.reservations.map((r) => {
            const lot =
              snapshot.lots.find((l) => l.id === r.lotId) ??
              incoming?.find((i) => i.lot.id === r.lotId)?.lot
            return (
              <li key={r.lotId}>
                {ingredientFor(snapshot, r.ingredientId).name} · {fmt(r.quantity)}{' '}
                {ingredientFor(snapshot, r.ingredientId).unit} · {r.lotId}
                {lot && !lot.canRepack && (
                  <small>
                    {plural(r.quantity / lot.packageSize, 'package')} × {lot.packageSize}{' '}
                    {ingredientFor(snapshot, r.ingredientId).unit} · {packageDescription(lot)}
                  </small>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function DonationImpact({
  impact,
  actual,
  showOptions = true,
}: {
  impact: OfferImpact
  actual: boolean
  showOptions?: boolean
}) {
  const ui = useWork(),
    { snapshot } = ui
  const [previewChoice, setPreviewChoice] = useState<DonationChoice | null>(null)
  const selected = actual
    ? impact.decision.selected
    : (previewChoice ?? impact.decision.recommended)
  const plan = impact.decision[selected] ?? impact.after
  const compare = useMemo(() => comparePlanChanges(impact.before, plan), [impact.before, plan])
  const all = useMemo(() => assignmentChanges(impact.before, plan), [impact.before, plan])
  const removed = all.filter((c) => c.kind === 'removed'),
    added = all.filter((c) => c.kind === 'filled'),
    changed = all.filter((c) => c.kind === 'changed')
  const [chosen, setChosen] = useState(''),
    [chosenDay, setDay] = useState<number | null>(null),
    [chosenMeal, setMeal] = useState<Meal | null>(null)
  const householdId = chosen || removed[0]?.householdId || added[0]?.householdId || ui.householdId
  const here = all.filter((c) => c.householdId === householdId)
  const first =
    here.find((c) => c.kind === 'removed') ?? here.find((c) => c.kind !== 'unchanged') ?? here[0]
  const day = chosenDay ?? first?.day ?? 0,
    dayRows = here.filter((c) => c.day === day)
  const slot =
    dayRows.find((c) => c.meal === chosenMeal) ??
    dayRows.find((c) => c.kind === 'removed') ??
    dayRows.find((c) => c.kind !== 'unchanged') ??
    dayRows[0]
  const dayRef = useRef<HTMLDivElement>(null)
  const [reveal, setReveal] = useState<RevealBox | null>(null)
  function showDay(c: AssignmentChange) {
    setChosen(c.householdId)
    setDay(c.day)
    setMeal(c.meal)
    requestAnimationFrame(() => dayRef.current?.focus({ preventScroll: false }))
  }
  const offer = ui.offers.find((o) => o.id === impact.offerId),
    sourceRows = (actual ? offer?.receipt?.rows : offer?.document?.rows) ?? []
  const actualApproved = actual && ui.approved?.id === plan.id
  const removedLabel = actualApproved
    ? 'Became unfilled'
    : actual
      ? 'Removed in this draft'
      : 'Would become unfilled'
  const afterLabel = actualApproved
    ? 'Approved replacement'
    : actual
      ? 'Receipt draft'
      : 'If received'
  function choose(c: DonationChoice) {
    if (actual) ui.chooseDonationCandidate(impact.offerId, impact.key, c)
    else setPreviewChoice(c)
  }
  const empty = (p: AllocationPlan, meal: Meal) =>
    p.unfilled.some((s) => s.householdId === householdId && s.day === day && s.meal === meal)
      ? 'Unfilled'
      : 'No request'
  return (
    <section
      className="panel donor-impact"
      aria-label={actual ? 'Actual receipt impact' : 'If received as entered'}
    >
      <div className="panel-head">
        <div>
          <h2>{actual ? 'Actual receipt impact' : 'If received as entered'}</h2>
          <p>
            {actual
              ? 'Receipt comparison using the recorded lots.'
              : 'Hypothetical receipt using the reviewed offer.'}{' '}
            Model week of {impact.weekStart}.
          </p>
        </div>
      </div>
      <div className="panel-body">
        {showOptions && (
          <DonationOptions impact={impact} actual={actual} selected={selected} onSelect={choose} />
        )}
        {impact.before.revision < plan.revision - 1 && (
          <p className="note">
            The captured baseline predates other input changes or receipts. The comparison includes
            those changes along with this delivery.
          </p>
        )}
        <h3>{actual ? 'Stock actually received' : 'Assumed receipts'}</h3>
        <ul className="donor-lots">
          {impact.items.map(({ lot, unit }) => (
            <li key={lot.id}>
              <strong>
                {ingredientFor(snapshot, lot.ingredientId).name} · {fmt(lot.quantityBaseUnits)}{' '}
                {unit}
              </strong>
              <span>
                {packageDescription(lot)} ·{' '}
                {sourceRows.find((r) => impact.offerId + '-' + r.id === lot.id)?.deliveryDate ??
                  DAYS[lot.availableFromDay]}{' '}
                delivery · {DAYS[lot.availableFromDay]} availability through{' '}
                {DAYS[lot.usableThroughDay]} · {lot.id}
              </span>
            </li>
          ))}
        </ul>
        <div className="action-scores">
          <div>
            <span>Allocated portions</span>
            <strong>
              {impact.before.metrics.allocated} → {plan.metrics.allocated}
            </strong>
          </div>
          <div>
            <span>Uncovered portions</span>
            <strong>
              {impact.before.metrics.uncovered} → {plan.metrics.uncovered}
            </strong>
          </div>
          <div>
            <span>Filled household meal slots</span>
            <strong>
              {impact.before.allocations.length} → {plan.allocations.length}
            </strong>
          </div>
        </div>
        <p className="slot-totals">
          <strong>Net slot change {signed(added.length - removed.length)}</strong> · {added.length}{' '}
          newly filled · {removed.length} become unfilled · {changed.length} changed ·{' '}
          {all.filter((c) => c.kind === 'unchanged').length} unchanged.
        </p>
        <p className="muted">
          Changed assignments include recipe, method, portion or lot changes.
          {changed.some(lotOnly) && (
            <> {plural(changed.filter(lotOnly).length, 'slot')} with a lot-only change.</>
          )}
        </p>
        {removed.length > 0 && (
          <div className="removed-meals">
            <h3>{removedLabel}</h3>
            <ul>
              {removed.map((c) => (
                <li key={c.householdId + c.day + c.meal}>
                  <button className="text-button" onClick={() => showDay(c)}>
                    {snapshot.households.find((h) => h.id === c.householdId)?.name} · {DAYS[c.day]}{' '}
                    {c.meal}
                  </button>
                  <span>
                    {' '}
                    {mealNames(snapshot, c.before!).recipe} ·{' '}
                    {plural(c.before!.portions, 'portion')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {__OPERATOR_MODE__ &&
          actual &&
          !ui.tour.active &&
          offer?.document?.message.kind === 'agentboxd' && (
            <EmailDinner
              impact={impact}
              offer={offer}
              changes={all}
              onInspect={(c, ingredientId) => {
                setReveal({
                  householdId: c.householdId,
                  day: collectionForDay(c.day),
                  ingredientId,
                })
                showDay(c)
              }}
            />
          )}
        <h3>Household effects</h3>
        <HouseholdChanges
          snapshot={snapshot}
          rows={compare.deltas}
          slots={compare}
          lossLabel={removedLabel}
        />
        {(
          [
            ['Newly filled meals', added],
            ['Changed filled meals', changed],
          ] as const
        ).map(([title, rows]) => (
          <details className="meal-links" key={title}>
            <summary>
              {title} ({rows.length})
            </summary>
            {rows.length ? (
              <ul>
                {rows.map((c) => (
                  <li key={c.householdId + c.day + c.meal}>
                    <button className="text-button" onClick={() => showDay(c)}>
                      {snapshot.households.find((h) => h.id === c.householdId)?.name} ·{' '}
                      {DAYS[c.day]} {c.meal}
                    </button>
                    {' · '}
                    {describeChange(snapshot, c)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None in this comparison.</p>
            )}
          </details>
        ))}
        <div className="subsection household-impact-day" ref={dayRef} tabIndex={-1}>
          <h3>Inspect meals and collection boxes</h3>
          <div className="donor-grid">
            <label className="field">
              <span>Impact household</span>
              <select
                value={householdId}
                onChange={(e) => {
                  setChosen(e.target.value)
                  setDay(null)
                  setMeal(null)
                }}
              >
                {snapshot.households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Impact day</span>
              <select
                value={day}
                onChange={(e) => {
                  setDay(Number(e.target.value))
                  setMeal(null)
                }}
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h4>
            {snapshot.households.find((h) => h.id === householdId)?.name} · {DAYS[day]}
          </h4>
          <div className="table-scroll">
            <table className="data-table impact-day-table">
              <thead>
                <tr>
                  <th>Day’s meals</th>
                  <th>Baseline</th>
                  <th>{afterLabel}</th>
                  <th>Slot change</th>
                </tr>
              </thead>
              <tbody>
                {MEALS.map((meal) => {
                  const row = dayRows.find((r) => r.meal === meal)
                  return (
                    <tr key={meal}>
                      <th scope="row">{pretty(meal)}</th>
                      <td>
                        <MealDescription
                          allocation={row?.before}
                          empty={empty(impact.before, meal)}
                        />
                      </td>
                      <td>
                        <MealDescription allocation={row?.after} empty={empty(plan, meal)} />
                      </td>
                      <td>
                        {row
                          ? {
                              filled: 'Newly filled',
                              removed: removedLabel,
                              changed: lotOnly(row) ? 'Lot commitments changed' : 'Changed',
                              unchanged: 'Unchanged',
                            }[row.kind]
                          : 'No allocation in either plan'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {slot && (
            <>
              <label className="field">
                <span>Inspect meal</span>
                <select value={slot.meal} onChange={(e) => setMeal(e.target.value as Meal)}>
                  {dayRows.map((c) => (
                    <option key={c.meal} value={c.meal}>
                      {DAYS[c.day]} {c.meal}
                    </option>
                  ))}
                </select>
              </label>
              <div className="donor-batch">
                <Batch a={slot.before} label="Baseline quantities" />
                <Batch a={slot.after} label={afterLabel + ' quantities'} incoming={impact.items} />
              </div>
            </>
          )}
          <details className="meal-links">
            <summary>Meal variety by household</summary>
            <VarietyEvidence
              snapshot={snapshot}
              before={impact.before}
              after={plan}
              householdId={householdId}
              showMenu={false}
            />
          </details>
          {COLLECTIONS.map((d) => (
            <BoxTrace
              key={householdId + d}
              impact={impact}
              plan={plan}
              householdId={householdId}
              day={d}
              reveal={reveal?.householdId === householdId && reveal.day === d ? reveal : null}
            />
          ))}
          {actual && (
            <button
              className="button"
              onClick={() => ui.navigate('household', undefined, householdId)}
            >
              <Package />
              Open household plan
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
