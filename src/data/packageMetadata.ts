import type { StockLot } from '../domain/types'

const packageNames = {
  bulk: 'Measured bulk stock',
  pull_tab_can: 'Pull-tab can',
  opener_can: 'Opener-required can',
  carton: 'Carton',
  packet: 'Packet',
  tub: 'Tub',
  wrapped: 'Individually wrapped',
  sealed: 'Sealed package',
} as const

export function packageMetadataConsistent(lot: StockLot): boolean {
  if (typeof lot.canRepack !== 'boolean' || typeof lot.requiresCanOpener !== 'boolean') return false
  const kind = lot.packageKind
  // Old lots still have the original divisibility and opening fields. Never infer a lid design.
  if (kind === undefined) return true
  if (!Object.hasOwn(packageNames, kind) || (kind === 'bulk') !== lot.canRepack) return false
  if (kind === 'sealed') return true
  return lot.requiresCanOpener === (kind === 'opener_can')
}

export function packageDescription(lot: StockLot): string {
  if (!packageMetadataConsistent(lot)) return 'Package and opening details need review'
  const name = lot.packageKind
    ? packageNames[lot.packageKind]
    : lot.canRepack
      ? packageNames.bulk
      : packageNames.sealed
  return name + (lot.requiresCanOpener ? ' · Can opener required' : ' · No can opener required')
}
