import { useMemo } from 'react'
import { AlertCircle, ChevronDown, ClipboardList, Package, RefreshCw, Search } from 'lucide-react'
import { diagnosePlan } from '../domain/analysis'
import type { CandidateCheck, IngredientBalance } from '../domain/analysisTypes'
import { collectionForDay, DAYS, type Slot } from '../domain/types'
import {
  fmt,
  ingredientFor,
  PageTitle,
  PlanStatus,
  plural,
  pretty,
  slotIs,
  StaleBanner,
  useWork,
  type OpenMeal,
} from './shared'

export function useDiagnostics(enabled = true) {
  const { snapshot, plan, fingerprint } = useWork()
  return useMemo(
    () =>
      enabled && plan && plan.fingerprint === fingerprint ? diagnosePlan(snapshot, plan) : null,
    [enabled, snapshot, plan, fingerprint],
  )
}

export function SourceStamp({ fingerprint }: { fingerprint: string }) {
  return (
    <p className="source-stamp">
      Input fingerprint <code>{fingerprint}</code>
    </p>
  )
}

export function Remaining({ rows }: { rows: IngredientBalance[] }) {
  const { snapshot } = useWork()
  return (
    <details className="panel fold">
      <summary>
        <span>
          <Package size={18} />
          Remaining stock by ingredient
        </span>
        <ChevronDown size={16} />
      </summary>
      <p className="fold-note">
        Remaining physical stock includes lots that may be ineligible for a household or meal.
      </p>
      <div className="balance-list">
        {rows.map((row) => (
          <div key={row.ingredientId}>
            <span>{ingredientFor(snapshot, row.ingredientId).name}</span>
            <strong>
              {fmt(row.remaining)} {row.unit}
            </strong>
          </div>
        ))}
      </div>
    </details>
  )
}

function Candidate({
  check,
  expanded,
  context,
}: {
  check: CandidateCheck
  expanded: boolean
  context: string
}) {
  const { snapshot } = useWork(),
    recipe = snapshot.recipes.find((r) => r.id === check.recipeId)!,
    method = recipe.methods.find((m) => m.id === check.methodId)!
  return (
    <details className="candidate" open={expanded}>
      <summary>
        <span>
          <strong>{recipe.name}</strong>
          <small>{method.name}</small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="candidate-body">
        <ul className="blocker-reasons">
          {check.reasons.map((r, i) => (
            <li key={i}>{r.message}</li>
          ))}
        </ul>
        <div className="table-scroll">
          <table className="data-table diagnostic-table">
            <caption>Family batch · {context}</caption>
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Required</th>
                <th>Eligible</th>
                <th>Missing</th>
                <th>Used elsewhere</th>
              </tr>
            </thead>
            <tbody>
              {check.ingredients.map((q) => (
                <tr key={q.ingredientId}>
                  <th scope="row">{ingredientFor(snapshot, q.ingredientId).name}</th>
                  <td>
                    {fmt(q.required)} {q.unit}
                  </td>
                  <td>
                    {fmt(q.eligible)} {q.unit}
                  </td>
                  <td className={q.missing ? 'loss' : ''}>
                    {fmt(q.missing)} {q.unit}
                  </td>
                  <td>
                    {fmt(q.allocatedElsewhere)} {q.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}

export function SlotEvidence({ slot }: { slot: Slot }) {
  const diagnostics = useDiagnostics(),
    d = diagnostics?.unfilled.find((s) => slotIs(slot, s))
  if (!d || !diagnostics)
    return (
      <div className="note warning">
        <AlertCircle />
        Recalculate for current blocker and stock details.
      </div>
    )
  return (
    <div className="diagnostic-detail">
      <h3>Why this meal was unfilled</h3>
      <p>
        {plural(d.requested, 'portion')} requested · {DAYS[collectionForDay(d.day)]} pickup ·{' '}
        {DAYS[d.day]} {d.meal}
      </p>
      <p>
        {d.noCompatibleRecipe
          ? 'The catalog has no compatible method for this request under the fixed requirements.'
          : 'The planner did not assign a whole-household batch in this slot.'}
      </p>
      <h4>Candidate alternatives</h4>
      <p className="muted">{diagnostics.context}. Each alternative shows its own requirements.</p>
      {d.candidates.slice(0, 3).map((c, i) => (
        <Candidate
          key={c.recipeId + c.methodId}
          check={c}
          expanded={i === 0}
          context={diagnostics.context}
        />
      ))}
      {d.candidates.length > 3 && (
        <details className="meal-links">
          <summary>More alternatives ({d.candidates.length - 3})</summary>
          <div>
            {d.candidates.slice(3).map((c) => (
              <Candidate
                key={c.recipeId + c.methodId}
                check={c}
                expanded={false}
                context={diagnostics.context}
              />
            ))}
          </div>
        </details>
      )}
      <SourceStamp fingerprint={diagnostics.fingerprint} />
    </div>
  )
}

export function NeedsLink() {
  const { plan, navigate, planLabel } = useWork()
  if (!plan) return null
  return (
    <div className="needs-link">
      <span className="collection-icon clay">
        <Search />
      </span>
      <div>
        <h3>{plural(plan.unfilled.length, 'household meal slot')} unfilled</h3>
        <p>
          {planLabel === 'Out of date'
            ? 'Previous plan · Recalculate to inspect current blockers.'
            : 'Review household coverage and trace a shortage to its meal.'}
        </p>
      </div>
      <button className="button" onClick={() => navigate('bank', 'needs')}>
        Explore unmet needs
      </button>
    </div>
  )
}

export default function Needs({ openMeal }: { openMeal: OpenMeal }) {
  const ui = useWork(),
    d = useDiagnostics(),
    plan = ui.plan
  return (
    <>
      <PageTitle
        title="Unmet needs"
        subtitle="Find the households with the lowest coverage and inspect their unfilled meals."
        badge={<PlanStatus />}
      />
      <StaleBanner />
      {!d || !plan ? (
        <div className="panel empty-view">
          <ClipboardList />
          <h2>Current plan needed</h2>
          <button className="button primary" onClick={ui.recalculate}>
            <RefreshCw />
            Recalculate
          </button>
        </div>
      ) : (
        <>
          <div className="insight-totals">
            {[
              ['Requested', plan.metrics.requested],
              ['Allocated', plan.metrics.allocated],
              ['Uncovered', plan.metrics.uncovered],
              ['Coverage', fmt(plan.metrics.percent) + '%'],
            ].map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Coverage by household</h2>
                <p>Lowest coverage first. Expand a household to inspect its meal slots.</p>
              </div>
            </div>
            {d.households.map((row) => {
              const h = ui.snapshot.households.find((h) => h.id === row.householdId)!,
                slots = d.unfilled.filter((s) => s.householdId === h.id)
              return (
                <details className="need-row" key={h.id}>
                  <summary>
                    <span>
                      <strong>{h.name}</strong>
                      <small>
                        {row.requested
                          ? fmt(row.coveragePercent ?? 0) + '% covered'
                          : 'No meals requested'}
                      </small>
                    </span>
                    <span>
                      {row.allocated} / {row.requested} portions
                    </span>
                    <span>{row.uncovered} uncovered</span>
                    <span>{plural(row.unfilledSlots, 'unfilled slot')}</span>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="need-slot-list">
                    {row.unfilledDays.map((day) => (
                      <div key={day}>
                        <strong>{DAYS[day]}</strong>
                        {slots
                          .filter((s) => s.day === day)
                          .map((s) => (
                            <button key={s.meal} className="button" onClick={() => openMeal(s)}>
                              {pretty(s.meal)} · {plural(s.requested, 'portion')}
                            </button>
                          ))}
                      </div>
                    ))}
                    {slots.length === 0 && <p>This household has no unfilled requests.</p>}
                  </div>
                </details>
              )
            })}
          </section>
          <Remaining rows={d.remaining} />
          <SourceStamp fingerprint={d.fingerprint} />
        </>
      )}
    </>
  )
}
