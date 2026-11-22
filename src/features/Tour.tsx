import { ArrowLeft, ArrowRight, Check, Compass, Eye, Package, RotateCcw, X } from 'lucide-react'
import { useWork, type OpenMeal } from './shared'
const steps = [
  [
    'Start with the household week',
    'Inspect an assigned meal and the household’s breakfast and main-meal variety.',
  ],
  [
    'Paste a donor offer',
    'Open Paste donor offer. Load the guided example and extract its rows. Save the proposal to continue.',
  ],
  [
    'Review the product and dates',
    'Review each source line. Confirm missing package, storage and model-week fields against the example’s product facts. Save your edits and mark the offer reviewed.',
  ],
  [
    'Preview the delivery',
    'Choose Preview impact to compare the same baseline with and without the proposed lots. The stock is still hypothetical.',
  ],
  [
    'Record the actual receipt',
    'Check the actual delivery, confirm receipt and recalculate. Inspect the changed meals and the exact contents of a collection box.',
  ],
  [
    'Improve variety at fixed coverage',
    'Choose Improve variety. Inspect the recipe and household changes. Filled slots and family portion counts stay fixed.',
  ],
  [
    'Approve and inspect the box',
    'Approve the draft, inspect a meal in the household schedule and open its collection boxes.',
  ],
]
export function TourPanel({
  completed,
  openMeal,
  openBoxes,
}: {
  completed: boolean
  openMeal: OpenMeal
  openBoxes: () => void
}) {
  const ui = useWork(),
    { tour } = ui
  if (!tour.active) return null
  const step = tour.step,
    final = step === 6
  const slot = ui.plan?.allocations.find((a) => a.householdId === ui.householdId)
  return (
    <section className="tour-coach" aria-label="Guided demo">
      <div className="tour-line">
        <div>
          <Compass />
          <strong>Guided demo</strong>
          <span>Step {step + 1} of 7</span>
        </div>
        <div className="tour-controls">
          <button onClick={tour.restart}>
            <RotateCcw />
            Restart
          </button>
          <button onClick={tour.exit}>
            <X />
            Exit
          </button>
        </div>
      </div>
      <div className="tour-body">
        <div>
          <h2>{steps[step][0]}</h2>
          <p>{steps[step][1]}</p>
        </div>
        <div className="actions">
          {(step === 0 || (final && tour.canAdvance)) && slot && (
            <button className="button" onClick={() => openMeal(slot)}>
              <Eye />
              Inspect assigned meal
            </button>
          )}
          {final && tour.canAdvance && (
            <button className="button" onClick={openBoxes}>
              <Package />
              Open collection boxes
            </button>
          )}
        </div>
      </div>
      <div className="tour-bottom">
        <small>Isolated demo · {ui.weekStart} · Agentboxd not connected</small>
        <div className="actions">
          <button className="button" onClick={tour.back} disabled={step === 0}>
            <ArrowLeft />
            Back
          </button>
          <button
            className="button primary"
            onClick={final ? tour.exit : tour.next}
            disabled={!tour.canAdvance || (final && !completed)}
          >
            {final ? 'Finish tour' : 'Next'}
            {final ? <Check /> : <ArrowRight />}
          </button>
        </div>
      </div>
    </section>
  )
}
