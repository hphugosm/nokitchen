import { useState } from 'react'
import { packageDescription } from '../domain/audit'
import { Package, Printer, Truck } from 'lucide-react'
import {
  COLLECTIONS,
  DAYS,
  type AllocationPlan,
  type Collection,
  type PackingItem,
} from '../domain/types'
import {
  Field,
  fmt,
  HouseholdSelect,
  ingredientFor,
  MealIcon,
  PageTitle,
  PlanStatus,
  plural,
  StaleBanner,
  useWork,
  type OpenMeal,
} from './shared'

function groupItems(items: PackingItem[]) {
  const result = new Map<string, { total: number; lots: PackingItem[] }>()
  for (const item of items) {
    const group = result.get(item.ingredientId) ?? { total: 0, lots: [] }
    group.total += item.quantity
    group.lots.push(item)
    result.set(item.ingredientId, group)
  }
  return result
}
function listFor(plan: AllocationPlan | null, id: string, day: Collection) {
  return plan?.packingLists.find((l) => l.householdId === id && l.collectionDay === day)
}
export function PackingBox({
  householdId,
  day,
  openMeal,
}: {
  householdId: string
  day: Collection
  openMeal: OpenMeal
}) {
  const { snapshot, plan, previousDraft } = useWork(),
    list = listFor(plan, householdId, day),
    oldList = listFor(previousDraft, householdId, day)
  const h = snapshot.households.find((h) => h.id === householdId)!
  const items = groupItems(list?.items ?? []),
    old = groupItems(oldList?.items ?? [])
  const changes = [...new Set([...items.keys(), ...old.keys()])]
    .map((id) => ({
      id,
      delta: (items.get(id)?.total ?? 0) - (old.get(id)?.total ?? 0),
    }))
    .filter((x) => x.delta !== 0)
  return (
    <article className="panel packing-box">
      <div className="panel-head">
        <div className="record-head">
          <span className={'collection-icon ' + (day === 4 ? 'clay' : '')}>
            <Truck />
          </span>
          <div>
            <h2>{DAYS[day]} box</h2>
            <p>
              {h.name} · {day === 0 ? 'Monday–Thursday' : 'Friday–Sunday'} meals
            </p>
          </div>
        </div>
        <PlanStatus />
      </div>
      <div className="panel-body">
        {items.size ? (
          <>
            <ul className="pack-items">
              {[...items].map(([id, v]) => (
                <li key={id}>
                  <div className="pack-row">
                    <span>{ingredientFor(snapshot, id).name}</span>
                    <strong>
                      {fmt(v.total)} {ingredientFor(snapshot, id).unit}
                    </strong>
                  </div>
                  <small>
                    {v.lots
                      .map(
                        (l) =>
                          packageDescription(snapshot.lots.find((lot) => lot.id === l.lotId)!) +
                          ' · ' +
                          l.lotId +
                          ' · ' +
                          (l.packages !== null
                            ? plural(l.packages, 'package') +
                              ' × ' +
                              l.quantity / l.packages +
                              ' ' +
                              ingredientFor(snapshot, id).unit
                            : fmt(l.quantity) +
                              ' ' +
                              ingredientFor(snapshot, id).unit +
                              ' repacked'),
                      )
                      .join(' / ')}
                  </small>
                </li>
              ))}
            </ul>
            <details className="meal-links">
              <summary>Meals in this box ({list!.meals.length})</summary>
              <div>
                {list!.meals.map((slot) => {
                  const a = plan!.allocations.find(
                    (a) =>
                      a.householdId === slot.householdId &&
                      a.day === slot.day &&
                      a.meal === slot.meal,
                  )
                  const r = snapshot.recipes.find((r) => r.id === a?.recipeId)
                  return (
                    <button key={slot.day + slot.meal} onClick={() => openMeal(slot)}>
                      <MealIcon meal={slot.meal} />
                      <span>
                        {DAYS[slot.day]} {slot.meal}
                        <strong>{r?.name}</strong>
                      </span>
                    </button>
                  )
                })}
              </div>
            </details>
          </>
        ) : (
          <div className="empty-view">
            <Package />
            No meals are packed for this collection.
          </div>
        )}
        {previousDraft && plan && previousDraft.revision !== plan.revision && (
          <details className="meal-links">
            <summary>Changes since previous plan ({changes.length})</summary>
            {changes.length ? (
              <ul className="lined-list">
                {changes.map((c) => (
                  <li key={c.id}>
                    {ingredientFor(snapshot, c.id).name}
                    <strong>
                      {c.delta > 0 ? '+' : ''}
                      {fmt(c.delta)} {ingredientFor(snapshot, c.id).unit}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Ingredient quantities are unchanged.</p>
            )}
          </details>
        )}
      </div>
    </article>
  )
}
export function Packing({
  openMeal,
  initialCollection,
}: {
  openMeal: OpenMeal
  initialCollection?: Collection
}) {
  const { householdId, selectHousehold } = useWork(),
    [day, setDay] = useState(initialCollection === undefined ? 'both' : String(initialCollection))
  return (
    <>
      <PageTitle
        title="Packing lists"
        subtitle="Prepare exact quantities for each household’s collection."
      >
        <button className="button" onClick={() => window.print()}>
          <Printer />
          Print lists
        </button>
      </PageTitle>
      <StaleBanner />
      <div className="filters panel">
        <HouseholdSelect value={householdId} onChange={selectHousehold} />
        <Field label="Collection">
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="both">Both collections</option>
            {COLLECTIONS.map((d) => (
              <option key={d} value={String(d)}>
                {DAYS[d]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="packing-grid">
        {COLLECTIONS.filter((d) => day === 'both' || d === Number(day)).map((d) => (
          <PackingBox key={d} householdId={householdId} day={d} openMeal={openMeal} />
        ))}
      </div>
    </>
  )
}
