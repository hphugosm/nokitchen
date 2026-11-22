import { AlertCircle, ClipboardList, Package } from 'lucide-react'
import { collectionForDay, DAYS, type Slot } from '../domain/types'
import { packageDescription } from '../domain/audit'
import { SlotEvidence } from './Needs'
import {
  Chip,
  fmt,
  ingredientFor,
  MethodInfo,
  Modal,
  PlanStatus,
  plural,
  pretty,
  Reasons,
  slotIs,
  StaleBanner,
  StockDetails,
  useWork,
} from './shared'
export function MealDetail({
  slot,
  onClose,
  onBox,
}: {
  slot: Slot
  onClose: () => void
  onBox: (slot: Slot) => void
}) {
  const ui = useWork(),
    { snapshot, plan } = ui
  if (ui.mode === 'household' && !plan)
    return (
      <Modal title="Meal details" onClose={onClose}>
        <StaleBanner />
      </Modal>
    )
  const allocation = plan?.allocations.find((a) => slotIs(a, slot))
  const unfilled = plan?.unfilled.find((u) => slotIs(u, slot))
  const household = snapshot.households.find((h) => h.id === slot.householdId)!
  const recipe = snapshot.recipes.find((r) => r.id === allocation?.recipeId),
    method = recipe?.methods.find((m) => m.id === allocation?.methodId)
  const amounts = new Map<string, number>()
  for (const res of allocation?.reservations ?? [])
    amounts.set(res.ingredientId, (amounts.get(res.ingredientId) ?? 0) + res.quantity)
  return (
    <Modal
      title={recipe?.name ?? (ui.mode === 'household' ? 'Meal not covered yet' : 'Unfilled meal')}
      sub={household.name + ' · ' + DAYS[slot.day] + ' · ' + pretty(slot.meal)}
      onClose={onClose}
    >
      <div className="chips">
        <PlanStatus />
        {allocation && (
          <Chip>
            <ClipboardList />
            {plural(allocation.portions, 'portion')}
          </Chip>
        )}
        {recipe && <Chip>Demo recipe</Chip>}
      </div>
      {ui.planLabel === 'Out of date' && (
        <div className="note warning">
          <AlertCircle />
          Historical plan. Recalculate before using this meal.
        </div>
      )}
      {allocation && recipe && method ? (
        <>
          <div className="subsection">
            <h3>
              <Package />
              Ingredients in the {DAYS[collectionForDay(slot.day)]} box
            </h3>
            <ul className="pack-items">
              {[...amounts].map(([id, q]) => (
                <li key={id}>
                  <div className="pack-row">
                    <span>{ingredientFor(snapshot, id).name}</span>
                    <strong>
                      {fmt(q)} {ingredientFor(snapshot, id).unit}
                    </strong>
                  </div>
                  {allocation.reservations
                    .filter((line) => line.ingredientId === id)
                    .map((line) => {
                      const lot = snapshot.lots.find((l) => l.id === line.lotId)
                      if (!lot)
                        return (
                          <small key={line.lotId}>{line.lotId} · Historical lot unavailable</small>
                        )
                      return (
                        <small key={lot.id}>
                          {ui.mode === 'bank' && lot.id + ' · '}
                          {lot.canRepack
                            ? fmt(line.quantity) +
                              ' ' +
                              ingredientFor(snapshot, id).unit +
                              ' measured'
                            : plural(line.quantity / lot.packageSize, 'package') +
                              ' × ' +
                              lot.packageSize +
                              ' ' +
                              ingredientFor(snapshot, id).unit}{' '}
                          · {packageDescription(lot)} · Store {pretty(lot.storage).toLowerCase()}{' '}
                          before opening
                        </small>
                      )
                    })}
                </li>
              ))}
            </ul>
            {ui.mode === 'household' && <StockDetails lines={allocation.reservations} />}
            <button className="button" onClick={() => onBox(slot)}>
              <Package />
              Open {DAYS[collectionForDay(slot.day)]} packing list
            </button>
          </div>
          <MethodInfo method={method} />
        </>
      ) : ui.mode === 'household' ? (
        <>
          <p>Your approved plan has no meal for this slot.</p>
          {unfilled && (
            <details className="meal-links">
              <summary>Reasons recorded at approval</summary>
              <Reasons reasons={unfilled.reasons} />
            </details>
          )}
        </>
      ) : (
        <SlotEvidence slot={slot} />
      )}
    </Modal>
  )
}
