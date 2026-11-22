import { ArrowRight } from 'lucide-react'
import type { AssignmentChange } from '../domain/impactTrace'
import type { OfferImpact } from '../domain/donorTypes'
import { collectionForDay, DAYS, type DonationOffer } from '../domain/types'
import { fmt, ingredientFor, plural, useWork } from './shared'

export function EmailDinner({
  impact,
  offer,
  changes,
  onInspect,
}: {
  impact: OfferImpact
  offer: DonationOffer
  changes: AssignmentChange[]
  onInspect: (change: AssignmentChange, ingredientId: string) => void
}) {
  const { snapshot } = useWork()
  const incoming = new Set(impact.items.map((i) => i.lot.id))
  const used = changes.filter((c) => c.after?.reservations.some((r) => incoming.has(r.lotId)))
  const dinner =
    used.find((c) => c.kind === 'filled' && c.meal === 'dinner') ??
    used.find((c) => c.kind === 'filled') ??
    used.find((c) => c.meal === 'dinner') ??
    used[0]
  if (!dinner?.after)
    return (
      <p className="note">
        The food is recorded in inventory. This receipt plan has no meal using those lots.
      </p>
    )
  const allocation = dinner.after,
    recipe = snapshot.recipes.find((r) => r.id === allocation.recipeId)!,
    method = recipe.methods.find((m) => m.id === allocation.methodId)!
  const source = offer.document!.message
  const lines = allocation.reservations.filter((r) => incoming.has(r.lotId))
  return (
    <section className="email-dinner" aria-label="From email to dinner">
      <h3>From email to dinner</h3>
      <p>
        <strong>{recipe.name}</strong> ·{' '}
        {snapshot.households.find((h) => h.id === dinner.householdId)?.name} · {DAYS[dinner.day]}{' '}
        {dinner.meal}
      </p>
      <p>
        {dinner.kind === 'filled' ? 'Newly filled meal' : 'Meal using received stock'} ·{' '}
        {plural(allocation.portions, 'person-portion')} · {method.name} ·{' '}
        {DAYS[collectionForDay(dinner.day)]} collection.
      </p>
      <ul>
        {lines.map((r) => (
          <li key={r.lotId}>
            {ingredientFor(snapshot, r.ingredientId).name} · {fmt(r.quantity)}{' '}
            {ingredientFor(snapshot, r.ingredientId).unit} · {r.lotId}
          </li>
        ))}
      </ul>
      <p className="source-stamp">
        Agentboxd · Inbox {source.inboxId} · Message {source.externalId}
      </p>
      <button className="button" onClick={() => onInspect(dinner, lines[0].ingredientId)}>
        Inspect donated meal <ArrowRight size={15} />
      </button>
    </section>
  )
}
