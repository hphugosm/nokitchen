import { describe, expect, it } from 'vitest'
import { catalog, seedLots, seedHouseholds, sampleOffers } from './frozen12/src/data'
import { generatePlan, validatePlan } from '../src/domain/engine'
import {
  selectPlan,
  comparePlanChanges,
  compareCandidateScores,
  slotKey,
} from '../src/domain/selection'
import { allocationDigest, contextFor } from '../src/domain/fingerprint'
import { planningOptions, type CandidateScore } from '../src/domain/policyTypes'
import { evaluateActions, diagnosePlan } from '../src/domain/analysis'
import type { PlanningSnapshot, AllocationPlan } from '../src/domain/types'

const seed = (): PlanningSnapshot =>
  structuredClone({ ...catalog, lots: seedLots, households: seedHouseholds, revision: 1 })
describe('Meal coverage first', () => {
  it('revalidates the opener-only incumbent in full and blocks the reproduced 1.1 decline', () => {
    const source = seed(),
      old = selectPlan(source, planningOptions())
    const edited = structuredClone(source)
    edited.revision++
    edited.households[0].tools.push('can_opener')
    const next = selectPlan(edited, planningOptions(old))
    expect(old.metrics.allocated).toBe(241)
    expect(next.selection.candidates.find((c) => c.kind === 'fresh-legacy')?.score?.total).toBe(239)
    expect(next.metrics.allocated).toBeGreaterThanOrEqual(old.metrics.allocated)
    expect(next.selection.winner).toBe('retain')
    expect(next.selection.context.incumbentDigest).toBe(allocationDigest(old))
    expect(comparePlanChanges(old, next).deltas.every((d) => d.delta === 0)).toBe(true)
    expect(validatePlan(edited, next)).toEqual([])
    const diagnosis = diagnosePlan(edited, next)
    expect(diagnosis.context).toBe('Based on stock remaining after this plan')
    expect(diagnosis.unfilled).toHaveLength(next.unfilled.length)
  })
  it('extends the fixed, fully reserved assignments using only remaining stock when a suitable delivery arrives', () => {
    const source = seed(),
      old = selectPlan(source)
    const lots = sampleOffers[0].items.map((i) => ({ ...i.lot, received: true }))
    const expanded = { ...source, revision: 2, lots: [...source.lots, ...lots] }
    const next = selectPlan(expanded, planningOptions(old))
    expect(next.selection.winner).toBe('extend')
    expect(next.metrics.allocated).toBeGreaterThan(old.metrics.allocated)
    expect(validatePlan(expanded, next)).toEqual([])
    const assignments = new Map(next.allocations.map((a) => [slotKey(a), a]))
    for (const a of old.allocations) expect(assignments.get(slotKey(a))).toEqual(a)
    const change = comparePlanChanges(old, next)
    expect(change.lost).toEqual([])
    expect(change.changed).toEqual([])
    expect(change.filled.length).toBeGreaterThan(0)
    const withOpener = structuredClone(expanded)
    withOpener.revision++
    withOpener.households[0].tools.push('can_opener')
    const twice = selectPlan(withOpener, planningOptions(next))
    expect(twice.metrics.allocated).toBeGreaterThanOrEqual(next.metrics.allocated)
    expect(validatePlan(withOpener, twice)).toEqual([])
  })
  it('rejects both incumbent candidates on lost equipment, reduced stock, an exclusion, or corrected can access', () => {
    const original = seed(),
      old = selectPlan(original)
    const reductions = [
      (s: PlanningSnapshot) => {
        s.households.find((h) => h.id === 'H02')!.appliances = []
      },
      (s: PlanningSnapshot) => {
        s.lots.find((l) => l.ingredientId === 'tomato')!.quantityBaseUnits = 0
      },
      (s: PlanningSnapshot) => {
        s.households[0].excludedIngredientIds.push('canned_tuna')
      },
      (s: PlanningSnapshot) => {
        const l = s.lots.find((l) => l.ingredientId === 'canned_tuna')!
        l.packageKind = 'opener_can'
        l.requiresCanOpener = true
      },
      (s: PlanningSnapshot) => {
        const r = s.recipes.find((r) => r.id === 'R08')!
        r.required.push({ ...r.required[0] })
      },
    ]
    reductions.push(
      (s) => {
        s.lots.find((l) => l.id === 'LOT-013')!.availableFromDay = 4
      },
      (s) => {
        s.lots.find((l) => l.id === 'LOT-013')!.usableThroughDay = 0
      },
      (s) => {
        s.lots.find((l) => l.id === 'LOT-013')!.storage = 'freezer'
      },
      (s) => {
        s.lots.find((l) => l.id === 'LOT-013')!.reviewStatus = 'needs_review'
      },
      (s) => {
        const r = s.recipes.find((r) => r.id === 'R05')!
        r.methods[0].tools.push('pot_with_lid')
      },
      (s) => {
        const r = s.recipes.find((r) => r.id === 'R05')!
        r.methods[0].tools = r.methods[0].tools.filter((t) => t !== 'heatproof_bowl')
      },
    )
    for (const reduce of reductions) {
      const changed = structuredClone(original)
      changed.revision++
      reduce(changed)
      const next = selectPlan(changed, planningOptions(old))
      expect(next.selection.candidates.filter((c) => c.valid).map((c) => c.kind)).toEqual([
        'fresh-legacy',
        'family-aware',
      ])
      expect(
        next.selection.candidates.find((c) => c.kind === 'retain')?.issues.length,
      ).toBeGreaterThan(0)
      expect(validatePlan(changed, next)).toEqual([])
    }
    const equivalent = structuredClone(old)
    equivalent.packingLists.reverse()
    for (const box of equivalent.packingLists) {
      box.meals.reverse()
      box.items.reverse()
      box.items = box.items.map((i) => ({
        packages: i.packages,
        quantity: i.quantity,
        ingredientId: i.ingredientId,
        lotId: i.lotId,
      }))
    }
    expect(validatePlan(original, equivalent)).toEqual([])
    expect(selectPlan(original, planningOptions(equivalent)).selection.winner).toBe('retain')
    const damaged = structuredClone(old)
    damaged.packingLists[0].items[0].quantity++
    expect(selectPlan(original, planningOptions(damaged)).selection.winner).toBe('fresh-legacy')
  })
  it('uses exact minimum rates, prior-slot stability, repeat counts and a stable ID, in that order', () => {
    const score: CandidateScore = {
      total: 100,
      minimum: { allocated: 500, requested: 1000 },
      changedAssigned: 3,
      repeats: 6,
    }
    const contender = (over: Partial<CandidateScore>) => ({
      kind: 'fresh-legacy' as const,
      score: { ...score, ...over },
    })
    const retained = { kind: 'retain' as const, score }
    expect(
      compareCandidateScores(
        contender({ total: 101, minimum: { allocated: 0, requested: 1 } }),
        retained,
      ),
    ).toBeLessThan(0)
    expect(
      compareCandidateScores(
        contender({ minimum: { allocated: 501, requested: 1001 }, changedAssigned: 10 }),
        retained,
      ),
    ).toBeLessThan(0)
    expect(
      compareCandidateScores(contender({ changedAssigned: 2, repeats: 40 }), retained),
    ).toBeLessThan(0)
    expect(compareCandidateScores(contender({ repeats: 5 }), retained)).toBeLessThan(0)
    expect(compareCandidateScores(retained, contender({}))).toBeLessThan(0)
  })
  it('keeps history in every key, rejects stale baselines, and exposes losses in assigned meals even at unchanged totals', () => {
    const snap = seed(),
      base = selectPlan(snap),
      historical = selectPlan(snap, planningOptions(base))
    expect(base.id).not.toBe(historical.id)
    expect(historical).toEqual(selectPlan(snap, planningOptions(structuredClone(base))))
    const other = structuredClone(base)
    other.allocations[0].portions++
    expect(contextFor(snap, planningOptions(other)).key).not.toBe(
      contextFor(snap, planningOptions(base)).key,
    )
    const reordered = {
      ...base,
      allocations: [...base.allocations]
        .reverse()
        .map((a) => ({ ...a, reservations: [...a.reservations].reverse() })),
    }
    expect(allocationDigest(reordered)).toBe(allocationDigest(base))
    const edit = structuredClone(snap)
    edit.revision++
    edit.households[0].appliances.push('rice_cooker')
    expect(() => evaluateActions(edit, 'H01', [], base)).toThrow(/out of date/)
    const swap = selectPlan(edit, planningOptions(base)),
      changes = comparePlanChanges(base, swap)
    expect(swap.metrics.allocated).toBe(base.metrics.allocated)
    expect(changes.lost.length).toBeGreaterThan(0)
    expect(changes.deltas.reduce((n, r) => n + r.delta, 0)).toBe(0)
    const altered: AllocationPlan = structuredClone(base)
    altered.allocations[0].methodId += '-other'
    expect(comparePlanChanges(base, altered).changed[0]).toMatchObject({
      fromMethodId: base.allocations[0].methodId,
      toMethodId: altered.allocations[0].methodId,
    })
    expect(validatePlan(snap, generatePlan(snap))).toEqual([])
  })
})
