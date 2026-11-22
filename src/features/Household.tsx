import { HouseholdVariety } from './Variety'
import { useState } from 'react'
import { ChevronRight, Package, Save, Users } from 'lucide-react'
import { COLLECTIONS, DAYS, MEALS, TOOLS, UTILITIES, type Household } from '../domain/types'
import { PackingBox } from './Packing'
import {
  applianceNames,
  Chip,
  Field,
  HouseholdSelect,
  MealIcon,
  PageTitle,
  personCount,
  PlanStatus,
  plural,
  pretty,
  StaleBanner,
  useWork,
  type OpenMeal,
} from './shared'

export type HouseholdView = 'schedule' | 'boxes' | 'settings'
function Checks<T extends string>({
  title,
  choices,
  values,
  onChange,
}: {
  title: string
  choices: { id: T; name: string }[]
  values: T[]
  onChange: (values: T[]) => void
}) {
  return (
    <fieldset className="check-field">
      <legend>{title}</legend>
      <div>
        {choices.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              checked={values.includes(c.id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...values, c.id] : values.filter((id) => id !== c.id))
              }
            />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
function Settings({ household }: { household: Household }) {
  const { snapshot, saveHousehold, notice } = useWork(),
    [h, setH] = useState<Household>(() => structuredClone(household)),
    [people, setPeople] = useState(String(household.peopleCount)),
    [error, setError] = useState(false)
  const set = <K extends keyof Household>(key: K, value: Household[K]) =>
    setH((old) => ({ ...old, [key]: value }))
  const choices = <T extends string>(ids: readonly T[]) =>
    ids.map((id) => ({ id, name: pretty(id) }))
  const allergenOptions = [
    ...new Set([...snapshot.ingredients.flatMap((i) => i.allergens ?? []), ...h.allergens]),
  ].sort()
  return (
    <form
      className="panel settings"
      onSubmit={(e) => {
        e.preventDefault()
        setError(!saveHousehold({ ...h, peopleCount: Number(people) }))
      }}
    >
      <div className="panel-head">
        <div>
          <h2>Kitchen settings</h2>
          <p>Changing these settings may put your meals on hold for food bank review.</p>
        </div>
      </div>
      <div className="panel-body">
        <Field label="Number of people">
          <input
            type="number"
            min="1"
            step="1"
            required
            value={people}
            onChange={(e) => setPeople(e.target.value)}
          />
        </Field>
        <Checks
          title="Cooking equipment"
          choices={snapshot.appliances}
          values={h.appliances}
          onChange={(appliances) =>
            setH((old) => ({
              ...old,
              appliances,
              burners: appliances.includes('hob') ? old.burners || 1 : 0,
            }))
          }
        />
        {h.appliances.includes('hob') && (
          <Field label="Hob burners">
            <select
              value={h.burners}
              onChange={(e) => set('burners', Number(e.target.value) as 1 | 2)}
            >
              <option value="1">1 burner</option>
              <option value="2">2 burners</option>
            </select>
          </Field>
        )}
        <Checks
          title="Cold storage"
          choices={choices(['fridge', 'freezer'] as const)}
          values={h.storage}
          onChange={(v) => set('storage', v)}
        />
        <Checks
          title="Utilities"
          choices={choices(UTILITIES)}
          values={h.utilities}
          onChange={(v) => set('utilities', v)}
        />
        <Checks
          title="Kitchen tools"
          choices={choices(TOOLS)}
          values={h.tools}
          onChange={(v) => set('tools', v)}
        />
        <Checks
          title="Allergen restrictions"
          choices={choices(allergenOptions)}
          values={h.allergens}
          onChange={(v) => set('allergens', v)}
        />
        <details className="meal-links">
          <summary>Excluded ingredients ({h.excludedIngredientIds.length})</summary>
          <Checks
            title="Foods to exclude"
            choices={snapshot.ingredients}
            values={h.excludedIngredientIds}
            onChange={(v) => set('excludedIngredientIds', v)}
          />
        </details>
        {error && (
          <div role="alert" className="note warning">
            {notice?.text ?? 'Check the household settings.'}
          </div>
        )}
        <button className="button primary" type="submit">
          <Save />
          Save changes
        </button>
      </div>
    </form>
  )
}
export default function HouseholdPortal({
  view,
  openMeal,
}: {
  view: HouseholdView
  openMeal: OpenMeal
}) {
  const ui = useWork(),
    { snapshot, plan, householdId } = ui,
    h = snapshot.households.find((h) => h.id === householdId)!
  const allocations = (plan?.allocations ?? []).filter((a) => a.householdId === h.id),
    unfilled = (plan?.unfilled ?? []).filter((a) => a.householdId === h.id)
  const [day, setDay] = useState(0)
  return (
    <>
      <PageTitle
        title={h.name}
        subtitle={
          personCount(h.peopleCount) +
          ' · ' +
          (applianceNames(snapshot, h).join(', ') || 'No cooking appliance')
        }
        badge={<PlanStatus />}
      >
        <HouseholdSelect value={h.id} onChange={ui.selectHousehold} />
      </PageTitle>
      <StaleBanner />
      {view === 'settings' ? (
        <Settings key={h.id + '-' + snapshot.revision} household={h} />
      ) : !plan ? null : view === 'boxes' ? (
        <div className="packing-grid">
          {COLLECTIONS.map((d) => (
            <PackingBox householdId={h.id} day={d} openMeal={openMeal} key={d} />
          ))}
        </div>
      ) : (
        <>
          <section className="panel household-plan">
            <div className="panel-head">
              <div>
                <h2>Meal schedule</h2>
                <p>{plural(allocations.length, 'meal')} planned for your household this week</p>
              </div>
              <Chip>
                <Users />
                {personCount(h.peopleCount)}
              </Chip>
            </div>
            <div className="panel-body">
              <div className="day-picker" role="group" aria-label="Select meal day">
                {DAYS.map((d, i) => (
                  <button key={d} aria-pressed={day === i} onClick={() => setDay(i)}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <h3>{DAYS[day]} meals</h3>
                {(day === 0 || day === 4) && (
                  <Chip tone="green">
                    <Package />
                    Collection day
                  </Chip>
                )}
              </div>
              {MEALS.map((meal) => {
                const slot = { householdId: h.id, day, meal },
                  a = allocations.find((a) => a.day === day && a.meal === meal),
                  missing = unfilled.find((a) => a.day === day && a.meal === meal),
                  recipe = snapshot.recipes.find((r) => r.id === a?.recipeId),
                  method = recipe?.methods.find((m) => m.id === a?.methodId)
                return (
                  <button
                    className={'house-meal ' + (a ? '' : 'unfilled')}
                    key={meal}
                    disabled={!a && !missing}
                    onClick={() => openMeal(slot)}
                  >
                    <div className="meal-symbol">
                      <MealIcon meal={meal} size={22} />
                    </div>
                    <span>
                      <small>{pretty(meal)}</small>
                      <strong>
                        {recipe?.name ?? (missing ? 'Meal not covered yet' : 'No meal requested')}
                      </strong>
                      <span>
                        {a
                          ? plural(a.portions, 'portion') + ' · ' + method?.name
                          : missing
                            ? 'Your approved plan has no meal for this slot.'
                            : ''}
                      </span>
                    </span>
                    <ChevronRight />
                  </button>
                )
              })}
            </div>
          </section>
          <HouseholdVariety />
        </>
      )}
    </>
  )
}
