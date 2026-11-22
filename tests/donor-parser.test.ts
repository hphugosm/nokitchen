import { describe, expect, it } from 'vitest'
import { catalog } from '../src/data'
import { MODEL_WEEK, type DonorMessage, type OfferRow } from '../src/domain/donorTypes'
import { parseOffer, rowIssues, offerItems } from '../src/integrations/donations/parser'
import { sampleMessages } from '../src/integrations/donations/messages'
const message = (text: string): DonorMessage => ({
  text,
  sender: 'Example donor',
  subject: '',
  receivedAt: '2026-11-21T08:00:00Z',
  kind: 'manual',
})
const parse = (s: string) => parseOffer(message(s), catalog, MODEL_WEEK, 'test-offer')
const confirm = (r: OfferRow): OfferRow => ({
  ...r,
  storage: 'ambient',
  afterOpening: 'fridge',
  availableFromDay: 0,
  usableThroughDay: 6,
})
describe('local donor text and receipt validation', () => {
  it('parses unseen multiline content with Czech units, exact offsets and normalized quantities', () => {
    const doc = parse('  3 x 0,25 kg ovesné vločky\r\nDry rice 2 kilograms')
    expect(
      doc.rows.map((r) => [
        r.ingredientId,
        r.packageCount,
        r.packageSize,
        r.quantity,
        r.unit,
        r.line,
      ]),
    ).toEqual([
      ['oats', 3, 250, 750, 'g', 1],
      ['dry_rice', null, null, 2000, 'g', 2],
    ])
    for (const r of doc.rows) expect(doc.message.text.slice(...r.span)).toBe(r.sourceText)
  })
  it('retains separate lot dates and explicit inheritance only across a continued package group', () => {
    const rows = parse(sampleMessages[2].text).rows
    expect(rows.map((r) => [r.ingredientId, r.quantity, r.expiryDate, r.expiryType])).toEqual([
      ['dry_pasta', 3000, '2027-02-01', 'best-before'],
      ['dry_pasta', 2000, '2027-03-01', 'best-before'],
    ])
    expect(parse('rice 2 kg\nblue soap 200 ml').rows.map((r) => [r.match, r.ingredientId])).toEqual(
      [
        ['ambiguous', null],
        ['unknown', null],
      ],
    )
  })
  it('never resolves a range, a relative date, or generic rice as a particular product', () => {
    const rows = parse(sampleMessages[1].text).rows
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.quantity === null && r.deliveryDate === null)).toBe(true)
    expect(rows[1].match).toBe('ambiguous')
    expect(rowIssues(rows[1], catalog, MODEL_WEEK).length).toBeGreaterThan(0)
  })
  it('leaves total weight separate from size per pack and refuses unknown, negated or gross facts', () => {
    expect(
      parse('12 sealed pouches of dry pasta, 2400 g net total across all pouches').rows[0],
    ).toMatchObject({ quantity: 2400, packageCount: 12, packageSize: null })
    expect(parse('3 packets of dry pasta, 500 g').rows[0]).toMatchObject({
      quantity: null,
      packageCount: 3,
      packageSize: null,
    })
    expect(
      parse('4 cans of ready-to-eat chickpeas, 200 g drained each. These are not ring-pull cans.')
        .rows[0],
    ).toMatchObject({ quantity: 800, packageKind: null, requiresCanOpener: null })
    expect(
      parse('4 cans of chickpeas, 200 g gross each. Drained weight unspecified.').rows[0].basis,
    ).toBeNull()
    expect(parse('12 x 400 g gross chickpeas').rows[0]).toMatchObject({
      quantity: null,
      packageSize: null,
    })
    expect(parse('dry pasta 1,000 g').rows[0].quantity).toBeNull()
    expect(parse('dry pasta 0.125 kg').rows[0].quantity).toBe(125)
    expect(parse('3x200g dry pasta').rows[0].quantity).toBe(600)
    expect(parse('2.5 x 300 g dry pasta').rows[0].quantity).toBeNull()
    expect(
      parse(
        'spinach. Before opening: ambient or fridge. After opening: fridge; after opening: freezer.',
      ).rows[0],
    ).toMatchObject({ storage: null, afterOpening: null })
    for (const text of [
      '10 to 15 kg of bread',
      'Between 10 and 15 kg of bread',
      '-3 x 500 g dry pasta',
      'At least 12 x 200 g pasta',
    ]) {
      const rows = parse(text).rows
      expect(rows).toHaveLength(1)
      expect(rows[0].quantity).toBeNull()
    }
  })
  it('requires an explicit model window and both storage facts; preserves usable content, dates, package and source', () => {
    const d = parse(sampleMessages[0].text)
    expect(d.rows[0]).toMatchObject({
      ingredientId: 'ready_chickpeas',
      quantity: 2400,
      packageSize: 200,
      packageCount: 12,
      basis: 'edible',
      storage: null,
      afterOpening: null,
      availableFromDay: null,
      deliveryDate: MODEL_WEEK,
      expiryType: 'best-before',
    })
    expect(() => offerItems(d, catalog)).toThrow()
    d.rows = d.rows.map(confirm)
    expect(offerItems(d, catalog)[0].lot).toMatchObject({
      quantityBaseUnits: 2400,
      packageSize: 200,
      packageCount: 12,
      received: false,
      sourceOfferId: d.id,
    })
    for (const patch of [
      { packageCount: 11 },
      { unit: 'ml' },
      { storage: null },
      { expiryDate: '2026-02-30' },
      { deliveryDate: '2026-11-24' },
      { requiresCanOpener: true },
      { basis: 'net' },
      { usableThroughDay: 8 },
    ] as Partial<OfferRow>[]) {
      expect(() => offerItems({ ...d, rows: [{ ...d.rows[0], ...patch }] }, catalog)).toThrow()
    }
  })
  it('preserves exclusions and rejects an all-excluded offer, duplicate IDs and source tampering', () => {
    const doc = parse(sampleMessages[0].text + '\nAn unknown product')
    doc.rows[0] = confirm(doc.rows[0])
    doc.rows[1].excludedReason = 'Unidentified'
    expect(offerItems(doc, catalog)).toHaveLength(1)
    expect(() => offerItems({ ...doc, rows: [doc.rows[1]] }, catalog)).toThrow()
    expect(() => offerItems({ ...doc, rows: [doc.rows[0], doc.rows[0]] }, catalog)).toThrow()
    expect(() =>
      offerItems({ ...doc, rows: [{ ...doc.rows[0], sourceText: 'different' }] }, catalog),
    ).toThrow()
  })
})
