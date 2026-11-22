import { describe, it, expect } from 'vitest'
import { catalog, seedHouseholds, seedLots } from '../src/data'
import { selectPlan, improveVariety, comparePlanChanges, slotKey } from '../src/domain/selection'
import { runPlanner, validatePlan } from '../src/domain/engine'
import { diagnosePlan } from '../src/domain/comparison'
import { familyAwarePlan } from '../src/domain/allocation'
import { planningOptions, SEARCH_BUDGET, METRIC_VERSION } from '../src/domain/policyTypes'
import { contextFor, snapshotFingerprint } from '../src/domain/fingerprint'
import { varietyReport, compareVariety } from '../src/domain/variety'
import { controlledVarietyCase } from './fixtures/varietyCases'
import type { AllocationPlan, PlanningSnapshot } from '../src/domain/types'

function assertCoverage(s: PlanningSnapshot, a: AllocationPlan, b: AllocationPlan) {
  const slots = (p: AllocationPlan) => p.allocations.map((x) => [slotKey(x), x.portions]).sort()
  expect(slots(a)).toEqual(slots(b))
  const delta = comparePlanChanges(a, b)
  expect(delta.filled).toEqual([])
  expect(delta.lost).toEqual([])
  expect(delta.deltas.every((h) => h.delta === 0)).toBe(true)
  const before = varietyReport(s, a),
    after = varietyReport(s, b)
  expect(compareVariety(after.score, before.score)).toBeLessThan(0)
  for (const [i, h] of before.households.entries())
    expect(compareVariety(after.households[i].score, h.score)).toBeLessThanOrEqual(0)
  expect(validatePlan(s, b)).toEqual([])
}
describe('fixed-coverage household variety', () => {
  it('counts family and exact pairs and adjacent repetitions across lunch/dinner and across unfilled gaps', () => {
    const s = controlledVarietyCase('restricted-pair'),
      plan = runPlanner(s, 'reference-first-fit')
    // Use a known shape only for this metric unit test. A and B are variants in one family.
    const rA = s.recipes[0],
      rB = s.recipes[1]
    s.recipes = s.recipes.map((r) => ({ ...r, familyId: 'one-family' }))
    const h = plan.allocations[0]
    const slots = [
      { ...h, day: 0, meal: 'lunch' as const, recipeId: rA.id },
      { ...h, day: 1, meal: 'dinner' as const, recipeId: rB.id },
      { ...h, day: 5, meal: 'lunch' as const, recipeId: rA.id },
      { ...h, day: 5, meal: 'breakfast' as const, recipeId: rA.id },
    ]
    const report = varietyReport(s, { allocations: slots.reverse() })
    expect(report.households[0].main).toMatchObject({
      slots: 3,
      portions: 3,
      distinctRecipes: 2,
      distinctFamilies: 1,
      maxFamilyFrequency: 3,
      adjacent: 2,
      familyCollisions: 3,
      recipeCollisions: 1,
    })
    expect(report.households[0].main.recipeIds).toEqual([rA.id, rB.id].sort())
    expect(report.households[0].main.familyIds).toEqual(['one-family'])
    expect(report.score).toEqual([3, 2, 1])
  })
  it('reorders a restricted kitchen’s fully reserved AABB week by a genuine two-batch exchange', () => {
    const s = controlledVarietyCase('restricted-pair'),
      base = runPlanner(s, 'reference-first-fit')
    expect(base.allocations.map((a) => a.recipeId)).toEqual(['R06', 'R06', 'R08', 'R08'])
    expect(s.households[0].appliances).toEqual([])
    expect(s.households[0].tools).not.toContain('can_opener')
    const result = improveVariety(s, base)
    expect(result.improved).toBe(true)
    expect(result.reason).toMatch(/1 paired/)
    assertCoverage(s, base, result.plan)
    expect(varietyReport(s, result.plan).households[0].main.adjacent).toBe(0)
  })
  it('uses a validated single replacement in an equipped kitchen and leaves an approved starting plan untouched', () => {
    const s = controlledVarietyCase('equipped-single'),
      base = runPlanner(s, 'reference-first-fit')
    base.status = 'approved'
    const old = structuredClone(base),
      source = structuredClone(s)
    const result = improveVariety(s, base)
    expect(result.improved).toBe(true)
    expect(result.plan.status).toBe('draft')
    expect(varietyReport(s, base).households[0].breakfast.distinctFamilies).toBe(1)
    expect(varietyReport(s, result.plan).households[0].breakfast.distinctFamilies).toBe(2)
    expect(result.reason).toMatch(/0 paired/)
    expect(s).toEqual(source)
    expect(base).toEqual(old)
    assertCoverage(s, base, result.plan)
  })
  it('keeps the plan when stock is protected or the fixed requests cannot gain variety', () => {
    const s = controlledVarietyCase('no-alternative'),
      base = runPlanner(s, 'reference-first-fit')
    // A second household in the same fixture needs all the tuna for its reserved wraps.
    const paired = controlledVarietyCase('restricted-pair')
    s.recipes.push(paired.recipes.find((r) => r.id === 'R08')!)
    const other = structuredClone(s.households[0])
    other.id = 'H02'
    other.excludedIngredientIds = ['ready_lentils']
    other.requestedSlots = [{ day: 0, meal: 'lunch' }]
    s.households.push(other)
    const extra = paired.lots
      .filter((l) => ['tortilla', 'canned_tuna'].includes(l.ingredientId))
      .map((l) => ({
        ...l,
        quantityBaseUnits: l.quantityBaseUnits / 2,
        packageCount: l.packageCount === null ? null : l.packageCount / 2,
      }))
    s.lots.push(...extra)
    s.lots.find((l) => l.ingredientId === 'cucumber')!.quantityBaseUnits += 100
    const locked = runPlanner(s, 'reference-first-fit'),
      before = structuredClone(locked)
    expect(locked.allocations.find((a) => a.householdId === 'H02')?.recipeId).toBe('R08')
    const result = improveVariety(s, locked)
    expect(result.improved).toBe(false)
    expect(result.plan).toBe(locked)
    expect(before).toEqual(locked)
    expect(validatePlan(s, result.plan)).toEqual([])
    expect(improveVariety(s, base).reason).toMatch(/out of date/)
  })
  it('improves restricted households in the actual expanded seed at identical slots and records every planning dimension', () => {
    const s = { ...catalog, households: seedHouseholds, lots: seedLots, revision: 1 }
    const base = selectPlan(s),
      raw = runPlanner(s, 'nokitchen'),
      family = familyAwarePlan(s)
    expect(base.metrics.allocated).toBe(Math.max(raw.metrics.allocated, family.metrics.allocated))
    expect(base.selection.winner).toBe('fresh-refined')
    assertCoverage(s, raw, base)
    expect(comparePlanChanges(raw, base).changed.length).toBeGreaterThan(0)
    expect(comparePlanChanges(raw, base).changed.length).toBeLessThanOrEqual(2)
    const h01 = (p: AllocationPlan) =>
      varietyReport(s, p).households.find((h) => h.householdId === 'H01')!.score
    expect(compareVariety(h01(base), h01(raw))).toBeLessThan(0)
    expect(diagnosePlan(s, base).context).toContain('remaining')
    expect(diagnosePlan(s, family).context).toBe('At the allocation decision')
    expect(selectPlan(s)).toEqual(base)
    const result = improveVariety(s, base)
    expect(result.improved).toBe(true)
    assertCoverage(s, base, result.plan)
    const before = varietyReport(s, base),
      after = varietyReport(s, result.plan)
    expect(
      ['H01', 'H02'].some(
        (id) =>
          compareVariety(
            after.households.find((h) => h.householdId === id)!.score,
            before.households.find((h) => h.householdId === id)!.score,
          ) < 0,
      ),
    ).toBe(true)
    expect(improveVariety(s, base)).toEqual(result)
    expect(result.plan.selection?.context).toMatchObject({
      operation: 'improve-variety',
      strategyId: 'improve-variety',
      metricVersion: METRIC_VERSION,
      searchBudget: SEARCH_BUDGET,
    })
    expect(result.plan.selection?.context.key).not.toBe(contextFor(s, planningOptions(base)).key)
    const stable = selectPlan(s, planningOptions(base))
    expect(stable.metrics.allocated).toBe(base.metrics.allocated)
    expect(comparePlanChanges(base, stable).changed).toHaveLength(0)
    const edited = structuredClone(s)
    edited.recipes[0].familyId = 'another-family'
    expect(snapshotFingerprint(s)).not.toBe(snapshotFingerprint(edited))
  })
})
