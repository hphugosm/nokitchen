import { applyAction, createSeed } from '../../src/application/state'
import { catalog } from '../../src/data'
import { parseOffer } from '../../src/integrations/donations/parser'
import { sampleMessages } from '../../src/integrations/donations/messages'

/** The same reviewed offer and operator-confirmed window as the archived 1.3 experiment. */
export function reviewedPouches(approved: boolean) {
  const seed = createSeed()
  const source = approved ? applyAction(seed, { type: 'approve', planId: seed.draft!.id }) : seed
  const document = parseOffer(
    {
      kind: 'manual',
      text: sampleMessages[0].text,
      subject: 'Packaged chickpeas',
      sender: 'Synthetic donor',
      receivedAt: '2026-11-23T09:00:00Z',
    },
    catalog,
    seed.weekStart,
    'pasted-demo-chickpeas',
  )
  const row = document.rows[0]
  Object.assign(row, {
    storage: 'ambient',
    afterOpening: 'fridge',
    availableFromDay: 0,
    usableThroughDay: 6,
    edits: {
      storage: 'Confirmed sealed shelf-stable pouch label',
      afterOpening: 'Checked refrigeration label',
      availableFromDay: 'Confirmed on Monday',
      usableThroughDay: 'Confirmed through Sunday',
    },
  })
  const saved = applyAction(source, { type: 'savePaste', doc: document, expectedVersion: null })
  const reviewed = applyAction(saved, {
    type: 'offer',
    id: document.id,
    step: 'review',
    expectedVersion: 1,
  })
  function receive(count: 8 | 12) {
    const actual =
      count === 12
        ? row
        : {
            ...row,
            quantity: count * 200,
            packageCount: count,
            edits: {
              ...row.edits,
              quantity: 'Confirmed actual edible weight',
              packageCount: 'Counted at receipt',
            },
          }
    const received = applyAction(reviewed, {
      type: 'offer',
      id: document.id,
      step: 'receive',
      expectedVersion: 1,
      actualRows: [actual],
      confirmDifferences: count !== 12,
    })
    return applyAction(received, { type: 'recalculate' })
  }
  return { reviewed, id: document.id, receive }
}
