import { useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { DAYS, type DonationOffer } from '../domain/types'
import { lotReason } from '../domain/feasibility'
import { fmt, ingredientFor, plural, useWork } from './shared'

export function DonorReply({ offer }: { offer: DonationOffer }) {
  const { plan, planLabel, snapshot } = useWork()
  const [copyState, setCopyState] = useState<{ text: string; status: string } | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const items = offer.receipt?.items ?? (offer.status === 'reviewed' ? offer.items : [])
  const contents = items
    .map(({ lot, unit }) => {
      const amount = fmt(lot.quantityBaseUnits) + ' ' + unit
      const name = ingredientFor(snapshot, lot.ingredientId).name
      return lot.packageCount === null
        ? name + ' (' + amount + ')'
        : plural(lot.packageCount, 'package') + ' of ' + name + ' (' + amount + ')'
    })
    .join(', ')
  const lines: string[] = []
  if (offer.status === 'received')
    lines.push('Thank you for the delivery. We recorded ' + contents + '.')
  else if (offer.status === 'reviewed')
    lines.push(
      'Thank you for offering ' +
        contents +
        '. We have reviewed the offer and will confirm the quantities when the delivery arrives.',
    )
  else {
    lines.push('Thank you for getting in touch. We are reviewing your donation offer.')
    const included = offer.document!.rows.filter((r) => r.excludedReason === null)
    if (included.some((r) => !r.ingredientId || !r.quantity || !r.unit || !r.basis))
      lines.push('Could you confirm the exact products and usable quantities shown on the labels?')
    else if (included.some((r) => r.storage === null || r.afterOpening === null))
      lines.push('Could you confirm the storage directions before and after opening?')
    else if (included.some((r) => !r.deliveryDate))
      lines.push('Which date would work for delivery?')
  }
  if (
    items.some(
      ({ lot }) =>
        lot.requiresCanOpener &&
        snapshot.households.some((h) =>
          DAYS.some(
            (_, day) => lotReason({ ...lot, received: true }, h, day)?.code === 'MISSING_TOOL',
          ),
        ),
    )
  )
    lines.push(
      'The cans need an opener, and some households do not have one listed. If pull-tab cans are available, those would be easier to use.',
    )
  if (offer.receipt && plan && (planLabel === 'Approved' || planLabel === 'Draft')) {
    const lots = new Set(offer.receipt.items.map((i) => i.lot.id))
    const allocations = plan.allocations.filter((a) =>
      a.reservations.some((r) => lots.has(r.lotId)),
    )
    const meal = allocations.find((a) => a.meal === 'dinner') ?? allocations[0]
    const recipe = snapshot.recipes.find((r) => r.id === meal?.recipeId)
    if (meal && recipe)
      lines.push(
        'Our ' +
          (planLabel === 'Approved' ? 'approved plan' : 'current draft') +
          ' includes some of this donation in ' +
          recipe.name +
          ' for ' +
          DAYS[meal.day] +
          ' ' +
          meal.meal +
          '.',
      )
  }
  const reply = lines.join(' ')
  async function copy() {
    try {
      await navigator.clipboard.writeText(reply)
      setCopyState({ text: reply, status: 'Reply copied.' })
    } catch {
      field.current?.focus()
      field.current?.select()
      setCopyState({
        text: reply,
        status: 'The draft is selected. Use your device’s Copy command.',
      })
    }
  }
  return (
    <section className="reply-panel" aria-label="Suggested donor reply">
      <h3>Suggested donor reply</h3>
      <p className="muted">Local draft based on the saved offer and this workspace’s plan.</p>
      <textarea ref={field} rows={4} readOnly value={reply} aria-label="Reply draft" />
      <div className="actions">
        <button className="button" onClick={copy}>
          <Copy size={15} />
          Copy Reply
        </button>
        {copyState?.text === reply && <span role="status">{copyState.status}</span>}
      </div>
    </section>
  )
}
