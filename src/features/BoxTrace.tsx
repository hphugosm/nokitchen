import { useEffect, useMemo, useRef, useState } from 'react'
import { boxIngredientTrace } from '../domain/impactTrace'
import { DAYS, type AllocationPlan, type Collection } from '../domain/types'
import type { OfferImpact } from '../domain/donorTypes'
import { fmt, ingredientFor, plural, useWork } from './shared'
import { signed } from './Effects'

export interface RevealBox {
  householdId: string
  day: Collection
  ingredientId: string
}
export function BoxTrace({
  impact,
  plan,
  householdId,
  day,
  reveal,
}: {
  impact: OfferImpact
  plan: AllocationPlan
  householdId: string
  day: Collection
  reveal?: RevealBox | null
}) {
  const { snapshot } = useWork()
  const [chosen, setChosen] = useState('')
  const disclosure = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (!reveal || !disclosure.current) return
    setChosen(reveal.ingredientId)
    disclosure.current.open = true
  }, [reveal])
  const items = (p: AllocationPlan) =>
    p.packingLists.find((l) => l.collectionDay === day && l.householdId === householdId)?.items ??
    []
  const old = items(impact.before),
    next = items(plan)
  const all = Array.from(new Map([...old, ...next].map((i) => [i.lotId, i])).values())
  const ingredients = Array.from(new Set(all.map((i) => i.ingredientId)))
  const initial = impact.items.map((i) => i.lot.ingredientId).find((id) => ingredients.includes(id))
  const id = ingredients.includes(chosen) ? chosen : (initial ?? ingredients[0])
  const trace = useMemo(
    () =>
      id
        ? boxIngredientTrace(snapshot, impact.before, plan, householdId, day, id, impact.items)
        : null,
    [snapshot, impact, plan, householdId, day, id],
  )
  const product = id ? ingredientFor(snapshot, id) : null
  return (
    <details ref={disclosure} className="meal-links box-trace">
      <summary>{DAYS[day]} collection box · exact contents</summary>
      {!trace || !product ? (
        <p>No items in either box.</p>
      ) : (
        <>
          <label className="field">
            <span>{DAYS[day]} ingredient trace</span>
            <select value={id} onChange={(e) => setChosen(e.target.value)}>
              {ingredients.map((i) => (
                <option key={i} value={i}>
                  {ingredientFor(snapshot, i).name}
                </option>
              ))}
            </select>
          </label>
          <p>
            <strong>
              {product.name} · {fmt(trace.before)} {product.unit} → {fmt(trace.after)}{' '}
              {product.unit}
            </strong>{' '}
            · Net {signed(trace.delta)} {product.unit}.
          </p>
          {trace.lines.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Meal and recipe</th>
                    <th>Lot and source</th>
                    <th>Before</th>
                    <th>Selected plan</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.lines.map((line) => {
                    const recipe = snapshot.recipes.find((r) => r.id === line.recipeId)!,
                      method = recipe.methods.find((m) => m.id === line.methodId)
                    const amount = (n: number, packages: number | null) =>
                      fmt(n) +
                      ' ' +
                      product.unit +
                      (packages === null ? '' : ' · ' + plural(packages, 'package'))
                    return (
                      <tr
                        key={JSON.stringify([
                          line.day,
                          line.meal,
                          line.recipeId,
                          line.methodId,
                          line.portions,
                          line.lotId,
                        ])}
                      >
                        <th scope="row">
                          {DAYS[line.day]} {line.meal}
                          <small>
                            {recipe.name} · {method?.name ?? line.methodId} ·{' '}
                            {plural(line.portions, 'portion')}
                          </small>
                        </th>
                        <td>
                          {line.lotId}
                          <small>{line.source}</small>
                        </td>
                        <td>{amount(line.before, line.beforePackages)}</td>
                        <td>{amount(line.after, line.afterPackages)}</td>
                        <td>
                          {signed(line.delta)} {product.unit}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Meal allocations for this ingredient are unchanged.</p>
          )}
          <details className="meal-links">
            <summary>All box items by lot</summary>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item / lot</th>
                    <th>Baseline</th>
                    <th>Selected plan</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((i) => (
                    <tr key={i.lotId}>
                      <th scope="row">
                        {ingredientFor(snapshot, i.ingredientId).name}
                        <small>{i.lotId}</small>
                      </th>
                      {[old, next].map((group, n) => {
                        const line = group.find((l) => l.lotId === i.lotId)
                        return (
                          <td key={n}>
                            {fmt(line?.quantity ?? 0)}{' '}
                            {ingredientFor(snapshot, i.ingredientId).unit}
                            {line
                              ? line.packages === null
                                ? ' · repacked'
                                : ' · ' + plural(line.packages, 'package')
                              : ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </details>
  )
}
