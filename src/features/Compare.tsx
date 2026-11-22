import { useMemo, useState } from 'react'
import { ListOrdered, Scale, Sprout } from 'lucide-react'
import { comparePlanners, teachingScenario } from '../domain/analysis'
import type { ComparisonExample, PlannerSummary } from '../domain/analysisTypes'
import { HouseholdChanges, signed } from './Effects'
import { SelectionDetails } from './Policy'
import { fmt, PageTitle, plural, useWork } from './shared'
import { SourceStamp } from './Needs'

function Summary({
  title,
  result,
  reference,
}: {
  title: string
  result: PlannerSummary
  reference?: boolean
}) {
  const { metrics } = result.plan,
    Icon = reference ? ListOrdered : Sprout
  return (
    <section className={'panel strategy ' + (!reference ? 'highlight' : '')}>
      <div className="strategy-title">
        <Icon />
        <h2>{title}</h2>
      </div>
      <p>
        {reference
          ? 'First compatible recipe in stable household and recipe order.'
          : 'Meal coverage first ranks valid candidates. This independent comparison starts with fresh inputs and no incumbent.'}
      </p>
      <div className="strategy-score">
        <strong>{metrics.allocated}</strong>
        <span> / {metrics.requested} portions allocated</span>
      </div>
      <dl className="method-data">
        <dt>Uncovered portions</dt>
        <dd>{metrics.uncovered}</dd>
        <dt>Coverage</dt>
        <dd>{fmt(metrics.percent)}%</dd>
        <dt>Lowest household coverage</dt>
        <dd>
          {result.lowestCoverage === null ? 'No meals requested' : fmt(result.lowestCoverage) + '%'}
        </dd>
        <dt>Households receiving no portions</dt>
        <dd>{result.zeroHouseholds}</dd>
      </dl>
    </section>
  )
}

const examples: { id: ComparisonExample; name: string }[] = [
  { id: 'current', name: 'Current week' },
  { id: 'teaching', name: 'Teaching example' },
  { id: 'neutral', name: 'Neutral example' },
]
export default function Compare({ onTeachingViewed }: { onTeachingViewed: () => void }) {
  const { snapshot, scenarioName } = useWork(),
    [example, setExample] = useState<ComparisonExample>('current')
  const scene = useMemo(
    () => (example === 'current' ? snapshot : teachingScenario(snapshot, example)),
    [snapshot, example],
  )
  const report = useMemo(() => comparePlanners(scene), [scene])
  const first = report.reference,
    second = report.nokitchen
  const difference = second.plan.metrics.allocated - first.plan.metrics.allocated
  const relativeChange = first.plan.metrics.allocated
    ? (100 * difference) / first.plan.metrics.allocated
    : null
  const coverageChange = first.plan.metrics.requested
    ? (100 * difference) / first.plan.metrics.requested
    : null
  return (
    <>
      <PageTitle
        title="Compare planners"
        subtitle="Run two planning policies on the same received stock and household requests."
      />
      <div className="panel scenario-picker">
        <h3>Comparison scenario</h3>
        <div className="option-set">
          {examples.map((x) => (
            <button
              key={x.id}
              aria-pressed={example === x.id}
              onClick={() => {
                setExample(x.id)
                if (x.id === 'teaching') onTeachingViewed()
              }}
            >
              {x.name}
            </button>
          ))}
        </div>
        <p>
          {example === 'current'
            ? scenarioName +
              ' · Both planners start fresh from the same stock and requests. This comparison has no incumbent allocation.'
            : example === 'teaching'
              ? 'Teaching comparison inputs only. Two households request Monday lunch. One can use a kettle and hob; the other has a kettle only.'
              : 'Neutral comparison inputs only. Both kitchens have suitable supplies for their Monday lunch.'}
        </p>
      </div>
      <div className="strategy-grid">
        <Summary reference title="Simple reference planner" result={first} />
        <Summary title="NoKitchen planner" result={second} />
      </div>
      <div className="note">
        <Scale />
        <span>
          {difference === 0
            ? 'Both planners allocated the same total number of portions.'
            : (difference > 0 ? 'NoKitchen' : 'The simple reference planner') +
              ' allocated ' +
              plural(Math.abs(difference), 'more portion', 'more portions') +
              ' on these inputs.'}
          {relativeChange !== null && coverageChange !== null && (
            <span>
              {' '}
              NoKitchen change from reference: {signed(relativeChange)}% relative and{' '}
              {signed(coverageChange)} percentage points of {first.plan.metrics.requested} requested
              portions.
            </span>
          )}
        </span>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Household effects</h2>
            <p>
              Changes from the simple reference planner to NoKitchen. Coverage change is in
              percentage points.
            </p>
          </div>
        </div>
        <HouseholdChanges
          rows={report.deltas}
          snapshot={scene}
          before="Reference"
          after="NoKitchen"
        />
      </section>
      {example !== 'current' && (
        <div className="panel teaching-ledger">
          <div className="panel-head">
            <h2>Monday lunch assignments</h2>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Household</th>
                  <th>Reference</th>
                  <th>NoKitchen</th>
                </tr>
              </thead>
              <tbody>
                {scene.households.map((h) => (
                  <tr key={h.id}>
                    <th>{h.name}</th>
                    {[first, second].map((p) => {
                      const a = p.plan.allocations.find((a) => a.householdId === h.id)
                      return (
                        <td key={p.plan.strategy}>
                          {scene.recipes.find((r) => r.id === a?.recipeId)?.name ?? 'Unfilled'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <details className="panel fold">
        <summary>Remaining stock by ingredient</summary>
        <p className="fold-note">
          Remaining physical stock includes lots that may be ineligible for a household or meal.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Reference remaining</th>
                <th>NoKitchen remaining</th>
              </tr>
            </thead>
            <tbody>
              {first.remaining.map((row) => (
                <tr key={row.ingredientId}>
                  <th>{scene.ingredients.find((i) => i.id === row.ingredientId)?.name}</th>
                  <td>
                    {fmt(row.remaining)} {row.unit}
                  </td>
                  <td>
                    {fmt(
                      second.remaining.find((i) => i.ingredientId === row.ingredientId)
                        ?.remaining ?? 0,
                    )}{' '}
                    {row.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {second.plan.selection && <SelectionDetails selection={second.plan.selection} />}
      <SourceStamp fingerprint={report.fingerprint} />
      <p className="source-stamp">
        Fresh comparison context <code>{report.context.key}</code>
      </p>
    </>
  )
}
