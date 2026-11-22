import { useMemo, useState } from 'react'
import { Utensils } from 'lucide-react'
import { VarietyEvidence } from './VarietyEvidence'
import { varietyReport } from '../domain/variety'
import { plural, useWork } from './shared'

export function WeeklyVariety() {
  const ui = useWork()
  const [household, setHousehold] = useState(ui.householdId)
  const prior = ui.plan?.selection?.winner === 'improve-variety' ? ui.previousDraft : null
  return (
    <section className="panel variety-panel" aria-label="Weekly meal variety">
      <div className="panel-head">
        <div>
          <h2>Meal variety</h2>
          <p>Try different recipes while keeping every household’s assigned meals and portions.</p>
        </div>
        <button className="button" disabled={!ui.decisionBaseline} onClick={ui.improveVariety}>
          <Utensils />
          Improve variety
        </button>
      </div>
      <div className="panel-body">
        {ui.varietyNote && (
          <p className="note" role="status">
            {ui.varietyNote}
          </p>
        )}
        <label className="variety-select">
          Variety for{' '}
          <select value={household} onChange={(e) => setHousehold(e.target.value)}>
            {ui.snapshot.households.map((h) => (
              <option value={h.id} key={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {ui.plan && (
          <VarietyEvidence
            snapshot={ui.snapshot}
            before={prior}
            after={ui.plan}
            householdId={household}
          />
        )}
        <p className="muted">
          A meal type groups similar recipes, such as porridges. Lunch and dinner are counted
          together in serving order, skipping unfilled meals.
        </p>
      </div>
    </section>
  )
}
export function HouseholdVariety() {
  const { snapshot, plan, householdId } = useWork()
  const row = useMemo(
    () =>
      plan && varietyReport(snapshot, plan).households.find((h) => h.householdId === householdId),
    [snapshot, plan, householdId],
  )
  if (!row) return null
  return (
    <p className="household-variety">
      <strong>This week’s variety</strong> ·{' '}
      {plural(row.breakfast.distinctFamilies, 'breakfast type')} and{' '}
      {plural(row.main.distinctFamilies, 'main-meal type')}.
      {row.main.maxFamilyFrequency > 1 && (
        <>
          {' '}
          The most frequent main-meal type appears {row.main.maxFamilyFrequency} times. Meal
          choices depend on your kitchen, collection days and shared stock.
        </>
      )}
    </p>
  )
}
