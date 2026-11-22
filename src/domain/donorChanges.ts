import type { OfferRow } from './donorTypes'

export const rowFields = {
  ingredientId: 'Catalog product',
  quantity: 'Total usable quantity',
  unit: 'Canonical unit',
  basis: 'Quantity basis',
  packageCount: 'Sealed package count',
  packageSize: 'Usable quantity per package',
  packageKind: 'Package type',
  requiresCanOpener: 'Can opener required',
  canRepack: 'May repack',
  storage: 'Storage before opening',
  afterOpening: 'Storage after opening',
  deliveryDate: 'Delivery date',
  expiryType: 'Expiry label type',
  expiryDate: 'Label date',
  availableFromDay: 'Available from model day',
  usableThroughDay: 'Usable through model day',
  excludedReason: 'Exclusion reason',
} as const

/** Operator annotations can change without changing the delivered food. */
export function differences(reviewed: OfferRow[], actual: OfferRow[]) {
  const fields = Object.keys(rowFields) as (keyof typeof rowFields)[]
  return actual
    .flatMap((row) => {
      const original = reviewed.find((r) => r.id === row.id)
      if (!original) return [{ row: row.id, field: 'Item', before: 'Absent', after: 'Included' }]
      return fields.flatMap((k) =>
        original[k] !== row[k]
          ? [
              {
                row: row.id,
                field: rowFields[k],
                before: String(original[k] ?? 'Unknown'),
                after: String(row[k] ?? 'Unknown'),
              },
            ]
          : [],
      )
    })
    .concat(
      reviewed
        .filter((r) => !actual.some((a) => a.id === r.id))
        .map((r) => ({ row: r.id, field: 'Item', before: 'Included', after: 'Absent' })),
    )
}
