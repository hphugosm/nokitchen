import type { DonationItem, DonationOffer, StockLot } from '../domain/types'
import { ingredients } from './ingredients'
import { sealedLot } from './stock'

function proposedItem(offerId: string, lot: StockLot): DonationItem {
  const ingredient = ingredients.find((candidate) => candidate.id === lot.ingredientId)
  if (!ingredient) throw new Error('Unknown ingredient in offer ' + offerId)
  return {
    unit: ingredient.unit,
    lot: {
      ...lot,
      received: false,
      sourceOfferId: offerId,
      provenance: 'Synthetic offer and product label, ' + offerId,
    },
  }
}

export const sampleOffers: DonationOffer[] = [
  {
    id: 'OFFER-01',
    source: 'fixture',
    status: 'offered',
    sender: 'Orchard Street Pantry',
    email: 'pantry@example.org',
    subject: 'Monday top-up for tortilla kits',
    body: 'We can deliver a small box before Monday collection. It contains individually wrapped tortillas and pull-tab tins of ready-to-eat beans and sweetcorn. The quantities below are the usable contents listed on our sample labels.',
    items: [
      proposedItem(
        'OFFER-01',
        sealedLot('OFFER-01-1', 'tortilla', 1, 14, { packageKind: 'wrapped' }),
      ),
      proposedItem(
        'OFFER-01',
        sealedLot('OFFER-01-2', 'ready_beans', 200, 14, {
          afterOpening: 'fridge',
          packageKind: 'pull_tab_can',
        }),
      ),
      proposedItem(
        'OFFER-01',
        sealedLot('OFFER-01-3', 'sweetcorn', 100, 14, {
          afterOpening: 'fridge',
          packageKind: 'pull_tab_can',
        }),
      ),
    ],
  },
  {
    id: 'OFFER-02',
    source: 'fixture',
    status: 'offered',
    sender: 'Riverside Food Cooperative',
    email: 'cooperative@example.net',
    subject: 'Friday delivery of soup and crackers',
    body: 'Our van is available on Friday morning. We can bring sealed cartons of ready-to-heat vegetable soup and individual packets of crackers for Friday collection.',
    items: [
      proposedItem(
        'OFFER-02',
        sealedLot('OFFER-02-1', 'vegetable_soup', 300, 9, {
          from: 4,
          afterOpening: 'fridge',
          packageKind: 'carton',
        }),
      ),
      proposedItem(
        'OFFER-02',
        sealedLot('OFFER-02-2', 'crackers', 60, 9, { from: 4, packageKind: 'packet' }),
      ),
    ],
  },
]
