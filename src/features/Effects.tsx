import type { HouseholdDelta } from '../domain/analysisTypes'
import type { PlanChange } from '../domain/policyTypes'
import { DAYS, type PlanningSnapshot, type Slot } from '../domain/types'
import { plural, useWork } from './shared'
export function signed(n: number) {
  const value = n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n > 0 ? '+' + value : value
}
export function HouseholdChanges({
  rows,
  snapshot,
  before = 'Before',
  after = 'After',
  lossLabel = 'Lost meals',
  slots,
}: {
  rows: HouseholdDelta[]
  snapshot: PlanningSnapshot
  before?: string
  after?: string
  lossLabel?: string
  slots?: Pick<PlanChange, 'filled' | 'lost'>
}) {
  return (
    <div className="table-scroll">
      <table className="data-table comparison-table">
        <thead>
          <tr>
            <th>Household</th>
            <th>{before}</th>
            <th>{after}</th>
            <th>Portion change</th>
            <th>Coverage change</th>
            {slots && (
              <>
                <th>Gained meals</th>
                <th>{lossLabel}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.householdId}>
              <th scope="row">{snapshot.households.find((h) => h.id === r.householdId)?.name}</th>
              <td>{r.before}</td>
              <td>{r.after}</td>
              <td className={r.delta < 0 ? 'loss' : r.delta > 0 ? 'gain' : ''}>
                {signed(r.delta)}
              </td>
              <td>
                {r.percentagePoints === null
                  ? 'No meals requested'
                  : signed(r.percentagePoints) + ' pp'}
              </td>
              {slots && (
                <>
                  <td>{slots.filled.filter((s) => s.householdId === r.householdId).length}</td>
                  <td
                    className={
                      slots.lost.some((s) => s.householdId === r.householdId) ? 'loss' : ''
                    }
                  >
                    {slots.lost.filter((s) => s.householdId === r.householdId).length}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SlotChanges({ title, slots }: { title: string; slots: Slot[] }) {
  const { snapshot } = useWork()
  return (
    <details className="meal-links">
      <summary>
        {title} ({slots.length})
      </summary>
      {slots.length ? (
        <ul>
          {slots.map((s) => (
            <li key={s.householdId + s.day + s.meal}>
              {snapshot.households.find((h) => h.id === s.householdId)?.name} · {DAYS[s.day]}{' '}
              {s.meal}
            </li>
          ))}
        </ul>
      ) : (
        <p>None in this scenario.</p>
      )}
    </details>
  )
}
function describeAssignment(
  snapshot: PlanningSnapshot,
  recipeId: string,
  methodId?: string,
  portions?: number,
) {
  const recipe = snapshot.recipes.find((entry) => entry.id === recipeId)
  const method = recipe?.methods.find((entry) => entry.id === methodId)
  return [
    recipe?.name ?? recipeId,
    method?.name ?? methodId,
    portions === undefined ? undefined : plural(portions, 'portion'),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function MealChanges({
  changes,
}: {
  changes: Pick<PlanChange, 'filled' | 'lost' | 'changed'>
}) {
  const { snapshot } = useWork()
  return (
    <>
      <SlotChanges title="Newly filled meals" slots={changes.filled} />
      <SlotChanges title="Lost meals" slots={changes.lost} />
      <details className="meal-links">
        <summary>Changed assigned meals ({changes.changed.length})</summary>
        {changes.changed.length ? (
          <ul>
            {changes.changed.map((c) => (
              <li key={c.householdId + c.day + c.meal}>
                <strong>
                  {snapshot.households.find((h) => h.id === c.householdId)?.name ?? c.householdId} ·{' '}
                  {DAYS[c.day]} {c.meal}
                </strong>
                <p>
                  Before ·{' '}
                  {describeAssignment(snapshot, c.fromRecipeId, c.fromMethodId, c.fromPortions)}
                </p>
                <p>
                  After · {describeAssignment(snapshot, c.toRecipeId, c.toMethodId, c.toPortions)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No assigned meal changed recipe, method, or portion count.</p>
        )}
      </details>
    </>
  )
}
