import { packingEvidence } from './packingLists'
import { PARAMETERS_ID, type PlanningContext, type PlanningOptions } from './policyTypes'
import type { AllocationPlan, Catalog, PlanningSnapshot } from './types'

// A versioned content identity for local consistency checks. Canonicalize object keys so
// restoring equivalent records from JSON preserves identity. Array order is retained.
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, ordered(v)]),
    )
  return value
}
function hash(value: unknown): string {
  const input = JSON.stringify(ordered(value))
  let a = 2166136261,
    b = 5381
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    a = Math.imul(a ^ char, 16777619)
    b = Math.imul(b, 33) ^ char
  }
  return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36)
}
export function catalogFingerprint(catalog: Catalog): string {
  return 'catalog-1.2-' + hash([catalog.ingredients, catalog.recipes, catalog.appliances])
}
export function snapshotFingerprint(snapshot: PlanningSnapshot): string {
  return (
    'wk12-' +
    hash([catalogFingerprint(snapshot), snapshot.revision, snapshot.households, snapshot.lots])
  )
}

export function allocationDigest(plan: Pick<AllocationPlan, 'allocations'>): string {
  const records = plan.allocations
    .map((a) => [
      a.householdId,
      a.day,
      a.meal,
      a.recipeId,
      a.methodId,
      a.portions,
      a.reservations.map((r) => [r.lotId, r.ingredientId, r.quantity]).sort(compareRecords),
    ])
    .sort(compareRecords)
  return 'alloc-' + hash(records)
}
function compareRecords(a: unknown, b: unknown): number {
  const x = JSON.stringify(a),
    y = JSON.stringify(b)
  return x < y ? -1 : x > y ? 1 : 0
}
export function contextFor(snapshot: PlanningSnapshot, options: PlanningOptions): PlanningContext {
  const source = {
    snapshotFingerprint: snapshotFingerprint(snapshot),
    policyId: options.policyId,
    engineVersion: options.engineVersion,
    parametersId: PARAMETERS_ID,
    incumbentDigest: options.incumbentPlan ? allocationDigest(options.incumbentPlan) : null,
    incumbentEvidenceDigest: options.incumbentPlan
      ? hash([
          options.incumbentPlan.schemaVersion,
          packingEvidence(options.incumbentPlan.packingLists),
        ])
      : null,
  }
  return { ...source, key: 'ctx12-' + hash(source) }
}
