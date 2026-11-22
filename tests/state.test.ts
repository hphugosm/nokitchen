import { describe, expect, it } from 'vitest'
import { applyAction, createSeed, type Scenario } from '../src/application/state'
import { displayedPlan, reservedByLot, snapshotOf } from '../src/application/selectors'
import { decodeScenario, encodeScenario } from '../src/application/persistence'
import { validatePlan } from '../src/domain/engine'
import { FixtureDonationSource } from '../src/integrations/donations/FixtureDonationSource'

const approve = (s: Scenario) => applyAction(s, { type: 'approve', planId: s.draft?.id })
const recalculate = (s: Scenario) => applyAction(s, { type: 'recalculate' })
const withOffer = (s: Scenario, step: 'load' | 'review' | 'receive', id = 'OFFER-01') =>
  applyAction(s, { type: 'offer', id, step })

describe('Scenario lifecycle', () => {
  it('reserves only on approval, replaces a plan from the full pool and releases independently of stock', () => {
    const seed = createSeed()
    const stock = structuredClone(seed.lots)
    expect(recalculate(seed).lots).toEqual(stock)
    expect(reservedByLot(seed.approved)).toEqual({})
    const approved = approve(seed)
    expect(approve(approved)).toBe(approved)
    const [lotId, reserved] = Object.entries(reservedByLot(approved.approved))[0]
    expect(() => applyAction(approved, { type: 'stock', lotId, quantity: 0 })).toThrow(/reserves/)
    expect(reserved).toBeGreaterThan(0)
    const changed = applyAction(approved, {
      type: 'household',
      household: { ...approved.households[0], peopleCount: 3 },
    })
    expect(displayedPlan(changed).planLabel).toBe('Out of date')
    expect(() => approve(changed)).toThrow(/out of date/)
    const draft = recalculate(changed)
    expect(draft.draft!.metrics.requested).toBe(420)
    expect(draft.approved).toBe(approved.approved)
    expect(displayedPlan(draft).planLabel).toBe('Draft')
    const replacement = approve(draft)
    expect(replacement.approved!.id).toBe(draft.draft!.id)
    expect(reservedByLot(replacement.approved)).toEqual(reservedByLot(draft.draft))
    expect(validatePlan(snapshotOf(replacement), replacement.approved!)).toEqual([])
    expect(replacement.lots).toEqual(stock)
    const released = applyAction(replacement, { type: 'release' })
    expect(released.approved).toBeNull()
    expect(released.lots).toEqual(stock)
    expect(displayedPlan(released).planLabel).toBe('Out of date')
    expect(() => approve(released)).toThrow(/out of date/)
    expect(
      applyAction(released, { type: 'stock', lotId, quantity: 0 }).lots.find((l) => l.id === lotId)
        ?.quantityBaseUnits,
    ).toBe(0)
  })

  it('changes no stock until reviewed receipt, receives once, then produces real coverage and box changes', () => {
    const seed = createSeed()
    const offer = withOffer(seed, 'load')
    expect(withOffer(offer, 'load')).toBe(offer)
    expect(() => withOffer(offer, 'receive')).toThrow(/Review/)
    const reviewed = withOffer(offer, 'review')
    expect(reviewed.lots).toBe(seed.lots)
    expect(reviewed.revision).toBe(seed.revision)
    const received = withOffer(reviewed, 'receive')
    expect(displayedPlan(received).planLabel).toBe('Out of date')
    expect(withOffer(received, 'receive')).toBe(received)
    const revised = recalculate(decodeScenario(encodeScenario(received)))
    expect(revised.draft!.metrics.allocated).toBeGreaterThan(seed.draft!.metrics.allocated)
    expect(revised.previousDraft).toEqual(seed.draft)
    expect(revised.draft!.packingLists).not.toEqual(seed.draft!.packingLists)
    expect(validatePlan(snapshotOf(revised), revised.draft!)).toEqual([])
    const approved = approve(revised)
    expect(decodeScenario(encodeScenario(approved))).toEqual(approved)
    expect(applyAction(approved, { type: 'reset' })).toEqual(seed)
  })

  it('leaves all early allocations unchanged after the Friday-only offer', () => {
    const seed = createSeed()
    const received = withOffer(
      withOffer(withOffer(seed, 'load', 'OFFER-02'), 'review', 'OFFER-02'),
      'receive',
      'OFFER-02',
    )
    const revised = recalculate(received)
    expect(revised.draft!.allocations.filter((a) => a.day < 4)).toEqual(
      seed.draft!.allocations.filter((a) => a.day < 4),
    )
    expect(
      revised.draft!.allocations.some((a) =>
        a.reservations.some((r) => r.lotId.startsWith('OFFER-02')),
      ),
    ).toBe(true)
  })

  it('rejects fractional packages, invalid household sizes and unsupported saved versions', () => {
    const seed = createSeed()
    const sealed = seed.lots.find((lot) => !lot.canRepack && lot.packageSize > 1)!
    expect(() => applyAction(seed, { type: 'stock', lotId: sealed.id, quantity: 1 })).toThrow(
      /whole packages/,
    )
    expect(() =>
      applyAction(seed, {
        type: 'household',
        household: { ...seed.households[0], peopleCount: 0 },
      }),
    ).toThrow(/positive whole/)
    expect(() => decodeScenario('{"schemaVersion":0}')).toThrow()
  })
  it('loads isolated local donation fixture copies', async () => {
    const source = new FixtureDonationSource()
    const offers = await source.listOffers()
    expect(offers.length).toBeGreaterThanOrEqual(2)
    offers[0].status = 'received'
    expect((await source.listOffers())[0].status).toBe('offered')
  })
})
