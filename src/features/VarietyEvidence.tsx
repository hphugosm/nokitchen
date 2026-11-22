import { useMemo } from 'react'
import { DAYS, type AllocationPlan, type PlanningSnapshot } from '../domain/types'
import {
  chronology,
  classifyVarietyEffect,
  varietyReport,
  type CategoryVariety,
} from '../domain/variety'
import { plural, pretty } from './shared'

const categories = { breakfast: 'Breakfast', main: 'Lunch and dinner' } as const
const categoryKeys = ['breakfast', 'main'] as const
const nameOf = (id: string) => pretty(id.replace(/[-_]/g, ' '))
const metrics = {
  slots: 'Filled slots',
  portions: 'Person-portions',
  distinctRecipes: 'Distinct recipes',
  distinctFamilies: 'Distinct families',
  maxFamilyFrequency: 'Most uses of one family',
  adjacent: 'Adjacent same-family meals',
} as const
function value(before: number | undefined, after: number) {
  return before === undefined ? String(after) : before + ' → ' + after
}

function Effects({
  name,
  before,
  after,
}: {
  name: string
  before: CategoryVariety
  after: CategoryVariety
}) {
  const effect = classifyVarietyEffect(before, after)
  const notes: string[] = []
  if (effect.broader)
    notes.push(
      'Broader family mix (' + before.distinctFamilies + ' → ' + after.distinctFamilies + ').',
    )
  if (effect.moreBalanced)
    notes.push(
      'More balanced at ' +
        plural(after.slots, 'filled slot') +
        ' (same-family pairs ' +
        before.familyCollisions +
        ' → ' +
        after.familyCollisions +
        ').',
    )
  if ((effect.broader || effect.moreBalanced) && !effect.sameFamilyMix) {
    const altered = Array.from(new Set([...before.familyIds, ...after.familyIds]))
      .filter((id) => before.familyFrequencies[id] !== after.familyFrequencies[id])
      .map(
        (id) =>
          nameOf(id) +
          ' ' +
          (before.familyFrequencies[id] ?? 0) +
          ' → ' +
          (after.familyFrequencies[id] ?? 0),
      )
    notes.push('Changed family counts include ' + altered.join(', ') + '.')
  }
  if (effect.betterSpacing)
    notes.push(
      'Better spacing of the same family mix (adjacent repetitions ' +
        before.adjacent +
        ' → ' +
        after.adjacent +
        ').',
    )
  if (effect.recipeVariants)
    notes.push(
      'Different recipe variants within ' + effect.variantFamilies.map(nameOf).join(', ') + '.',
    )
  if (effect.sameFamilyMix && effect.recipeVariants && !effect.betterSpacing)
    notes.push('Family frequencies stayed the same.')
  if (effect.reorderedFamilies.length)
    notes.push(
      'Existing recipes were reordered within ' +
        effect.reorderedFamilies.map(nameOf).join(', ') +
        '. Their counts stayed the same.',
    )
  if (!notes.length && effect.sameFamilyMix && before.adjacent === after.adjacent)
    notes.push('Family and recipe frequencies and the adjacent-repeat count held steady.')
  else if (!effect.sameFamilyMix && !effect.broader && !effect.moreBalanced)
    notes.push(
      'Family frequencies changed (' +
        before.distinctFamilies +
        ' → ' +
        after.distinctFamilies +
        ' distinct families).',
    )
  if (effect.sameFamilyMix && after.adjacent > before.adjacent)
    notes.push(
      'Adjacent repetitions rose from ' +
        before.adjacent +
        ' to ' +
        after.adjacent +
        ' with the same family frequencies.',
    )
  return (
    <p>
      <strong>{name}.</strong> {notes.join(' ')}
    </p>
  )
}

export function VarietyEvidence({
  snapshot,
  before,
  after,
  householdId,
  showMenu = true,
}: {
  snapshot: PlanningSnapshot
  before?: AllocationPlan | null
  after: AllocationPlan
  householdId: string
  showMenu?: boolean
}) {
  const report = useMemo(() => varietyReport(snapshot, after), [snapshot, after])
  const prior = useMemo(() => before && varietyReport(snapshot, before), [snapshot, before])
  const current = report.households.find((h) => h.householdId === householdId)!,
    previous = prior?.households.find((h) => h.householdId === householdId)
  const recipes = new Map(snapshot.recipes.map((r) => [r.id, r]))
  const oldMeals = before?.allocations.filter((a) => a.householdId === householdId) ?? []
  const newMeals = after.allocations.filter((a) => a.householdId === householdId)
  const slotKey = (a: (typeof newMeals)[number]) => a.day + '-' + a.meal
  const weeklyMeals = Array.from(
    new Map([...oldMeals, ...newMeals].map((a) => [slotKey(a), a])).values(),
  ).sort(chronology)
  const mealLabel = (a: (typeof newMeals)[number] | undefined) =>
    a ? (recipes.get(a.recipeId)?.name ?? a.recipeId) : 'Unfilled'
  return (
    <div className="variety-evidence">
      {previous && (
        <p className="muted">
          Baseline → selected plan. Counts are per household and meal category.
        </p>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Assigned meals</th>
              {Object.values(metrics).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categoryKeys.map((cat) => (
              <tr key={cat}>
                <th scope="row">{categories[cat]}</th>
                {(Object.keys(metrics) as (keyof typeof metrics)[]).map((field) => (
                  <td key={field}>{value(previous?.[cat][field], current[cat][field])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previous && (
        <div className="variety-effects">
          {categoryKeys.map((cat) => (
            <Effects key={cat} name={categories[cat]} before={previous[cat]} after={current[cat]} />
          ))}
        </div>
      )}
      <details className="meal-links">
        <summary>
          {showMenu ? 'Family frequencies and weekly meals' : 'Family and recipe frequencies'}
        </summary>
        {categoryKeys.map((cat) => {
          const old = previous?.[cat],
            next = current[cat],
            families = Array.from(new Set([...(old?.familyIds ?? []), ...next.familyIds])).sort()
          return (
            <div key={cat}>
              <h4>{categories[cat]}</h4>
              {families.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Family</th>
                        <th>Occurrences</th>
                        <th>Recipes and occurrences</th>
                      </tr>
                    </thead>
                    <tbody>
                      {families.map((f) => (
                        <tr key={f}>
                          <th scope="row">{nameOf(f)}</th>
                          <td>
                            {value(
                              old ? (old.familyFrequencies[f] ?? 0) : undefined,
                              next.familyFrequencies[f] ?? 0,
                            )}
                          </td>
                          <td>
                            {Array.from(
                              new Set([
                                ...(old?.recipesByFamily[f] ?? []),
                                ...(next.recipesByFamily[f] ?? []),
                              ]),
                            )
                              .sort()
                              .map((r) => (
                                <div key={r}>
                                  {recipes.get(r)?.name ?? r} ·{' '}
                                  {value(
                                    old ? (old.recipeFrequencies[r] ?? 0) : undefined,
                                    next.recipeFrequencies[r] ?? 0,
                                  )}
                                </div>
                              ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No allocated meals in this category.</p>
              )}
              <p className="muted">
                Same-family pairs · {value(old?.familyCollisions, next.familyCollisions)}.
              </p>
            </div>
          )
        })}
        {showMenu && (
          <>
            <h4>Weekly meal names</h4>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Day and meal</th>
                    {before && <th>Baseline recipe</th>}
                    <th>Selected recipe</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyMeals.map((a) => (
                    <tr key={slotKey(a)}>
                      <th scope="row">
                        {DAYS[a.day]} {a.meal}
                      </th>
                      {before && (
                        <td>{mealLabel(oldMeals.find((o) => slotKey(o) === slotKey(a)))}</td>
                      )}
                      <td>{mealLabel(newMeals.find((n) => slotKey(n) === slotKey(a)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
    </div>
  )
}
