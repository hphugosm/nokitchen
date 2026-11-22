import { selectPlan } from '../src/domain/selection'
import { planningOptions } from '../src/domain/policyTypes'
import { describe, expect, it } from 'vitest'
import { catalog, seedHouseholds, seedLots } from './frozen12/src/data'
import {
  applyHypothesis,
  comparePlanners,
  diagnosePlan,
  evaluateActions,
  suggestActions,
  teachingScenario,
} from '../src/domain/analysis'
import { runPlanner, validatePlan } from '../src/domain/engine'
import { snapshotFingerprint } from '../src/domain/fingerprint'
import type { PlanningSnapshot, Slot } from '../src/domain/types'

function seed(): PlanningSnapshot {
  return structuredClone({ ...catalog, households: seedHouseholds, lots: seedLots, revision: 1 })
}
const key = (s: Slot) => [s.householdId, s.day, s.meal].join('/')
describe('compatible planner comparison and actual decision diagnostics', () => {
  it('uses the same recipes, constraints, lot ordering and one lunch request per household for both strategies', () => {
    const source = seed()
    const snap = teachingScenario(source, 'teaching')
    const p = comparePlanners(snap)
    expect(p.reference.plan.allocations.map((a) => [a.householdId, a.recipeId])).toEqual([
      ['H01', 'R05'],
    ])
    expect(p.nokitchen.plan.allocations.map((a) => [a.householdId, a.recipeId])).toEqual([
      ['H02', 'R05'],
      ['H01', 'R11'],
    ])
    for (const summary of [p.reference, p.nokitchen]) {
      expect(summary.plan.fingerprint).toBe(p.fingerprint)
      expect(summary.plan.metrics.requested).toBe(2)
      expect(validatePlan(snap, summary.plan)).toEqual([])
    }
    expect(p.reference.zeroHouseholds).toBe(1)
    expect(p.reference.lowestCoverage).toBe(0)
    expect(p.nokitchen.lowestCoverage).toBe(100)
    const equal = comparePlanners(teachingScenario(source, 'neutral'))
    expect(equal.reference.plan.metrics.allocated).toBe(2)
    expect(equal.nokitchen.plan.metrics.allocated).toBe(2)
    expect(equal.nokitchen.plan.id).not.toBe(equal.reference.plan.id)
    expect(source).toEqual(seed())
  })
  it('shows eligible quantities and stock consumed elsewhere at the actual decision, including method-specific requirements', () => {
    const snap = teachingScenario(seed(), 'teaching')
    const reference = runPlanner(snap, 'reference-first-fit')
    const diagnostics = diagnosePlan(snap, reference)
    expect(diagnostics.fingerprint).toBe(snapshotFingerprint(snap))
    expect(diagnostics.unfilled).toHaveLength(1)
    const missing = diagnostics.unfilled[0]
    expect(missing).toMatchObject({
      householdId: 'H02',
      day: 0,
      meal: 'lunch',
      requested: 1,
      noCompatibleRecipe: false,
    })
    const couscous = missing.candidates.find((c) => c.recipeId === 'R05')!
    expect(couscous.ingredients.find((i) => i.ingredientId === 'instant_couscous')).toEqual({
      ingredientId: 'instant_couscous',
      unit: 'g',
      required: 80,
      eligible: 0,
      missing: 80,
      allocatedElsewhere: 80,
    })
    const rice = missing.candidates.filter((c) => c.recipeId === 'R11')
    expect(rice).toHaveLength(2)
    for (const candidate of rice) {
      expect(candidate.reasons).toContainEqual(
        expect.objectContaining({ code: 'MISSING_APPLIANCE', methodId: candidate.methodId }),
      )
      expect(candidate.ingredients.every((i) => i.required === i.eligible && i.missing === 0)).toBe(
        true,
      )
    }
    // A compatible hob method must not inherit the rice-cooker method's equipment failure.
    snap.recipes = snap.recipes.filter((r) => r.id === 'R11')
    snap.households = [snap.households[0]]
    snap.lots.find((l) => l.ingredientId === 'dry_rice')!.quantityBaseUnits = 50
    const shortage = diagnosePlan(snap, runPlanner(snap, 'nokitchen')).unfilled[0]
    expect(shortage.noCompatibleRecipe).toBe(false)
    const hob = shortage.candidates.find((c) => c.methodId.endsWith('hob'))!
    expect(hob.reasons.map((r) => r.code)).toEqual(['INSUFFICIENT_STOCK'])
    expect(hob.ingredients.find((i) => i.ingredientId === 'dry_rice')).toMatchObject({
      required: 80,
      eligible: 50,
      missing: 30,
    })
  })
  it('excludes unknown product and inaccessible lots and separates zero demand from zero coverage', () => {
    const snap = teachingScenario(seed(), 'teaching')
    snap.recipes = snap.recipes.filter((r) => r.id === 'R05')
    snap.households[0].requestedSlots = []
    const lot = snap.lots.find((l) => l.ingredientId === 'ready_chickpeas')!
    lot.availableFromDay = 4
    lot.usableThroughDay = 6
    const product = snap.ingredients.find((i) => i.id === 'tomato')!
    product.declaration = 'unknown'
    const plan = runPlanner(snap, 'nokitchen')
    const d = diagnosePlan(snap, plan)
    expect(validatePlan(snap, plan)).toEqual([])
    expect(plan.metrics.requested).toBe(1)
    expect(d.households.map((h) => [h.householdId, h.coveragePercent, h.unfilledSlots])).toEqual([
      ['H02', 0, 1],
      ['H01', null, 0],
    ])
    const c = d.unfilled[0].candidates[0]
    expect(d.unfilled[0].noCompatibleRecipe).toBe(true)
    for (const id of ['ready_chickpeas', 'tomato'])
      expect(c.ingredients.find((i) => i.ingredientId === id)?.eligible).toBe(0)
    expect(c.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['NEEDS_REVIEW', 'UNAVAILABLE_BY_PICKUP']),
    )
    expect(comparePlanners(snap).nokitchen.zeroHouseholds).toBe(1)
  })
  it('rejects outdated plan explanations even for a catalog-only change and reconciles every signed difference', () => {
    const snap = seed(),
      copy = structuredClone(snap)
    const c = comparePlanners(snap)
    for (const p of [c.reference, c.nokitchen]) {
      expect(validatePlan(snap, p.plan)).toEqual([])
      expect(p.households.reduce((n, h) => n + h.uncovered, 0)).toBe(p.plan.metrics.uncovered)
      expect(p.households.reduce((n, h) => n + h.unfilledSlots, 0)).toBe(p.plan.unfilled.length)
      for (const row of p.remaining) {
        const received = snap.lots
          .filter((l) => l.ingredientId === row.ingredientId && l.received)
          .reduce((n, l) => n + l.quantityBaseUnits, 0)
        const used = p.plan.allocations
          .flatMap((a) => a.reservations)
          .filter((r) => r.ingredientId === row.ingredientId)
          .reduce((n, l) => n + l.quantity, 0)
        expect(row.remaining).toBe(received - used)
        expect(row.unit).toBe(snap.ingredients.find((i) => i.id === row.ingredientId)!.unit)
      }
    }
    expect(c.deltas.reduce((n, h) => n + h.delta, 0)).toBe(
      c.nokitchen.plan.metrics.allocated - c.reference.plan.metrics.allocated,
    )
    expect(c.deltas.some((h) => h.delta < 0)).toBe(true)
    expect(snap).toEqual(copy)
    snap.recipes[0].methods[0].steps.push('Synthetic catalog revision.')
    expect(() => diagnosePlan(snap, c.nokitchen.plan)).toThrow(/out of date/)
    expect(validatePlan(snap, c.reference.plan)).toContain('Plan inputs are out of date.')
  })
})

describe('independent tested changes', () => {
  it('preserves ordinary inputs, matches a manual edit and separates every newly filled, lost and changed recipe', () => {
    const snap = seed(),
      original = structuredClone(snap)
    const options = suggestActions(snap, 'H01')
    const analysis = evaluateActions(snap, 'H01', options)
    const reversed = evaluateActions(snap, 'H01', [...options].reverse())
    expect(reversed.results.reverse()).toEqual(analysis.results)
    expect(snap).toEqual(original)
    const baseline = selectPlan(snap, planningOptions())
    const baseSlots = new Map(baseline.allocations.map((a) => [key(a), a.recipeId]))
    for (const result of analysis.results) {
      expect(result.error).toBeUndefined()
      expect(result.deltas.reduce((sum, row) => sum + row.delta, 0)).toBe(
        result.totalAfter - result.totalBefore,
      )
      const next = applyHypothesis(snap, 'H01', result.action)
      const plan = selectPlan(next, planningOptions(baseline))
      expect(validatePlan(next, plan)).toEqual([])
      const nextSlots = new Map(plan.allocations.map((a) => [key(a), a.recipeId]))
      expect(result.filled.map(key)).toEqual([...nextSlots.keys()].filter((k) => !baseSlots.has(k)))
      expect(result.lost.map(key)).toEqual([...baseSlots.keys()].filter((k) => !nextSlots.has(k)))
      for (const c of result.changed) {
        expect(c.fromRecipeId).toBe(baseSlots.get(key(c)))
        expect(c.toRecipeId).toBe(nextSlots.get(key(c)))
        expect(c.fromRecipeId).not.toBe(c.toRecipeId)
      }
    }
    const result = analysis.results.find((r) => r.action.kind === 'can_opener')!
    expect(result.group).toBe('no_gain')
    expect(result.targetAfter).toBe(result.targetBefore)
    expect(result.totalAfter).toBe(result.totalBefore)
    const redistribution = analysis.results.find(
      (r) => r.action.kind === 'appliance' && r.action.applianceId === 'rice_cooker',
    )!
    expect(redistribution.group).toBe('tradeoff')
    expect(redistribution.deltas.some((d) => d.delta < 0)).toBe(true)
    const manual = seed()
    manual.households[0].tools.push('can_opener')
    manual.revision++
    expect(selectPlan(manual, planningOptions(baseline))).toEqual(
      selectPlan(applyHypothesis(snap, 'H01', result.action), planningOptions(baseline)),
    )
    const appliance = evaluateActions(snap, 'H01', [
      { id: 'test-hob', label: 'Add a one-burner hob', kind: 'appliance', applianceId: 'hob' },
    ]).results[0]
    expect(appliance.group).toBe('no_gain')
    expect(appliance.remainingBlockers).toContainEqual(
      expect.objectContaining({ code: 'MISSING_TOOL' }),
    )
    const deviceOnly = applyHypothesis(snap, 'H01', appliance.action)
    expect(deviceOnly.households[0].tools).toEqual(snap.households[0].tools)
    expect(deviceOnly.households[0].utilities).toEqual(snap.households[0].utilities)
  })
  it('uses one stable complete proposal lot and represents invalid or already applied changes explicitly', () => {
    const snap = seed(),
      options = suggestActions(snap, 'H01')
    const proposal = options.find((a) => a.kind === 'donation')!
    expect(proposal.lot.sourceOfferId).toBeTruthy()
    const preview = applyHypothesis(snap, 'H01', proposal)
    expect(preview.lots.slice(-1)).toEqual([proposal.lot])
    expect(snap.lots.some((l) => l.id === proposal.lot.id)).toBe(false)
    const invalid = evaluateActions(preview, 'H01', [proposal]).results[0]
    expect(invalid.group).toBe('invalid')
    expect(invalid.error).toMatch(/already present/)
  })
})
