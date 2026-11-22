import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { latestImpact } from '../src/application/donorCommands'
import { decodeScenario, encodeScenario } from '../src/application/persistence'
import {
  displayedPlan,
  householdPublication,
  reservedByLot,
  scenarioName,
  snapshotOf,
} from '../src/application/selectors'
import { applyAction, createSeed, type Scenario } from '../src/application/state'
import type { WorkspaceUI } from '../src/application/uiContract'
import { comparePlanChanges } from '../src/domain/selection'
import { collectionForDay, type Slot } from '../src/domain/types'
import { validatePlan, validatePlanContent } from '../src/domain/validatePlan'
import HouseholdPortal from '../src/features/Household'
import { MealDetail } from '../src/features/MealDetail'
import { PackingBox } from '../src/features/Packing'
import { WorkContext } from '../src/features/shared'
import { reviewedPouches } from './fixtures/pouchReceipt'

const approve = (s: Scenario) => applyAction(s, { type: 'approve', planId: s.draft!.id })
const reload = (s: Scenario) => decodeScenario(encodeScenario(s))
const noop = () => {}

// Exercise the actual household components with the publication result they receive in main.tsx.
function householdViews(s: Scenario, slot: Slot) {
  const context: Partial<WorkspaceUI> = {
    ...householdPublication(s),
    mode: 'household',
    householdId: slot.householdId,
    snapshot: snapshotOf(s),
    approved: s.approved,
    previousDraft: null,
    selectHousehold: noop,
  }
  const render = (child: ReactElement) =>
    renderToStaticMarkup(
      createElement(WorkContext.Provider, { value: context as WorkspaceUI }, child),
    )
  return {
    schedule: render(createElement(HouseholdPortal, { view: 'schedule', openMeal: noop })),
    settings: render(createElement(HouseholdPortal, { view: 'settings', openMeal: noop })),
    meal: render(createElement(MealDetail, { slot, onClose: noop, onBox: noop })),
    box: render(
      createElement(PackingBox, {
        householdId: slot.householdId,
        day: collectionForDay(slot.day),
        openMeal: noop,
      }),
    ),
  }
}

describe('publication of approved household instructions', () => {
  it('keeps the schedule, recipe and box on the same reservation owner until replacement approval', () => {
    const owner = approve(createSeed())
    const varied = applyAction(owner, { type: 'improveVariety', planId: owner.draft!.id })
    // Choose a changed Monday meal so the initial schedule view, recipe and collection box all differ.
    const slot = comparePlanChanges(owner.approved!, varied.draft!).changed.find(
      (c) => c.day === 0 && c.fromRecipeId !== c.toRecipeId,
    )!
    expect(slot).toBeDefined()
    expect(displayedPlan(varied)).toEqual({ plan: varied.draft, planLabel: 'Draft' })
    const originalViews = householdViews(owner, slot)
    expect(originalViews.meal).toContain(
      snapshotOf(owner).recipes.find((r) => r.id === slot.fromRecipeId)!.name,
    )
    for (const s of [varied, reload(varied)]) {
      expect(householdPublication(s).plan).toEqual(owner.approved)
      expect(reservedByLot(s.approved)).toEqual(reservedByLot(owner.approved))
      expect(householdViews(s, slot)).toEqual(originalViews)
    }

    const replaced = approve(varied)
    expect(householdPublication(replaced).plan).toBe(replaced.approved)
    expect(replaced.approved!.id).toBe(varied.draft!.id)
    expect(reservedByLot(replaced.approved)).toEqual(reservedByLot(varied.draft))
    const next = householdViews(replaced, slot)
    const newRecipe = snapshotOf(replaced).recipes.find((r) => r.id === slot.toRecipeId)!.name
    for (const view of ['schedule', 'meal', 'box'] as const) {
      expect(next[view]).not.toEqual(originalViews[view])
      expect(next[view]).toContain(newRecipe)
      expect(next[view]).not.toContain('Changes since previous plan')
    }
  })

  it('keeps the approved 297 portions through receipt, recalculation and both replacement choices', () => {
    const { reviewed, id, receive } = reviewedPouches(true)
    const original = reviewed.approved!
    const received = applyAction(reviewed, {
      type: 'offer',
      id,
      step: 'receive',
      expectedVersion: 1,
    })
    const planned = receive(12)
    const switched = applyAction(planned, {
      type: 'chooseDonationCandidate',
      offerId: id,
      key: latestImpact(planned)!.key,
      choice: 'coverage',
    })
    expect(original.metrics.allocated).toBe(297)
    expect(planned.draft!.metrics.allocated).toBe(309)
    expect(switched.draft!.metrics.allocated).toBe(310)
    for (const s of [received, planned, switched, reload(switched)]) {
      expect(validatePlan(snapshotOf(s), original)).toContain('Plan inputs are out of date.')
      expect(validatePlanContent(snapshotOf(s), original)).toEqual([])
      expect(householdPublication(s)).toEqual({ plan: original, planLabel: 'Approved' })
      expect(reservedByLot(s.approved)).toEqual(reservedByLot(original))
    }
    expect(householdPublication(approve(switched)).plan!.metrics.allocated).toBe(310)
  })

  it('blocks instructions invalidated by a new allergen, keeps settings and reservations, and restores them on reapproval', () => {
    const owner = approve(createSeed())
    const snapshot = snapshotOf(owner)
    const meal = owner.approved!.allocations.find((a) =>
      a.reservations.some(
        (r) => snapshot.ingredients.find((i) => i.id === r.ingredientId)!.allergens?.length,
      ),
    )!
    const allergen = meal.reservations.flatMap(
      (r) => snapshot.ingredients.find((i) => i.id === r.ingredientId)!.allergens ?? [],
    )[0]
    const home = owner.households.find((h) => h.id === meal.householdId)!
    const edited = applyAction(owner, {
      type: 'household',
      household: { ...home, allergens: [...home.allergens, allergen] },
    })
    const recalculated = applyAction(edited, { type: 'recalculate' })
    expect(validatePlanContent(snapshotOf(edited), owner.approved!).length).toBeGreaterThan(0)
    for (const s of [edited, recalculated, reload(recalculated)]) {
      expect(householdPublication(s)).toEqual({ plan: null, planLabel: 'Needs review' })
      expect(reservedByLot(s.approved)).toEqual(reservedByLot(owner.approved))
      const views = householdViews(s, meal)
      for (const view of [views.schedule, views.box, views.meal]) {
        expect(view).toContain('Plan needs review')
        expect(view).not.toMatch(/house-meal|class="steps"|class="pack-items"|SlotEvidence/)
      }
      expect(views.settings).toContain('Save changes')
    }
    const replacement = approve(recalculated)
    expect(validatePlan(snapshotOf(replacement), replacement.approved!)).toEqual([])
    expect(householdPublication(replacement).plan).toBe(replacement.approved)
  })

  it('waits before first approval and after release; settings stay usable with no visible draft meals or boxes', () => {
    const seed = createSeed()
    const released = applyAction(approve(seed), { type: 'release' })
    for (const s of [seed, released, reload(released)]) {
      expect(s.draft).not.toBeNull()
      expect(householdPublication(s)).toEqual({ plan: null, planLabel: 'Waiting for approval' })
      const views = householdViews(s, seed.draft!.allocations[0])
      for (const view of [views.schedule, views.box, views.meal]) {
        expect(view).toContain('Waiting for an approved plan')
        expect(view).not.toMatch(/house-meal|class="steps"|class="pack-items"/)
      }
      expect(views.settings).toContain('Save changes')
    }
  })

  it('revalidates schema, lot claims and packing evidence independently of snapshot identity', () => {
    const s = approve(createSeed())
    const plan = s.approved!
    const snapshot = snapshotOf(s)
    expect(validatePlanContent(snapshot, { ...plan, schemaVersion: 99 as 1 })).not.toEqual([])
    expect(validatePlanContent(snapshot, { ...plan, packingLists: [] })).not.toEqual([])
    const corrupt = structuredClone(plan)
    corrupt.allocations[0].reservations[0].quantity += 1
    expect(validatePlanContent(snapshot, corrupt)).not.toEqual([])
  })

  it('labels stock from actual received quantities, including a partial receipt and a subsequent manual edit', () => {
    expect(scenarioName(createSeed())).toBe('Demo week')
    const { receive, id } = reviewedPouches(true)
    const partial = receive(8)
    expect(scenarioName(partial)).toContain('received')
    expect(scenarioName(partial)).not.toContain('edited inventory')
    const lot = partial.lots.find((l) => l.sourceOfferId === id)!
    const edited = applyAction(partial, {
      type: 'stock',
      lotId: lot.id,
      quantity: lot.quantityBaseUnits + lot.packageSize,
    })
    expect(scenarioName(edited)).toContain('edited inventory')
  })
})
