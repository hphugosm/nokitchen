import { describe, expect, it } from 'vitest'
import { createSeed, applyAction } from '../src/application/state'
import { snapshotOf, displayedPlan, reservedByLot } from '../src/application/selectors'
import { encodeScenario, decodeScenario } from '../src/application/persistence'
import { applyHypothesis, suggestActions } from '../src/domain/analysis'
import { planningOptions } from '../src/domain/policyTypes'
import { allocationDigest, contextFor, snapshotFingerprint } from '../src/domain/fingerprint'
import { selectPlan } from '../src/domain/selection'

describe('1.1 commands and source identity', () => {
  it('preserves legacy edits, receipts and reservations and safely invalidates old calculations', () => {
    let state = createSeed()
    state = applyAction(state, {
      type: 'household',
      household: { ...state.households[0], peopleCount: 3 },
    })
    for (const step of ['load', 'review', 'receive'] as const)
      state = applyAction(state, { type: 'offer', id: 'OFFER-01', step })
    state = applyAction(state, { type: 'recalculate' })
    state = applyAction(state, { type: 'approve', planId: state.draft!.id })
    const serialized = JSON.parse(encodeScenario(state))
    serialized.schemaVersion = 1
    delete serialized.catalogFingerprint
    delete serialized.proposals
    for (const lot of serialized.lots) delete lot.packageKind
    for (const plan of Object.values(serialized.plans) as Record<string, unknown>[]) {
      delete plan.fingerprint
      delete plan.strategy
    }
    const migrated = decodeScenario(JSON.stringify(serialized))
    expect(migrated.households).toEqual(state.households)
    expect(migrated.offerStatus).toEqual(state.offerStatus)
    expect(migrated.lots.map((l) => [l.id, l.quantityBaseUnits])).toEqual(
      state.lots.map((l) => [l.id, l.quantityBaseUnits]),
    )
    expect(reservedByLot(migrated.approved)).toEqual(reservedByLot(state.approved))
    expect(displayedPlan(migrated).planLabel).toBe('Out of date')
    expect(() => applyAction(migrated, { type: 'approve', planId: migrated.draft!.id })).toThrow(
      /out of date/,
    )
    expect(decodeScenario(encodeScenario(migrated))).toEqual(migrated)
    const updated = JSON.parse(encodeScenario(state))
    updated.catalogFingerprint = 'old-catalog'
    expect(displayedPlan(decodeScenario(JSON.stringify(updated))).planLabel).toBe('Out of date')
  })

  it('applies the same equipment change as a manual household edit and blocks obsolete previews', () => {
    const state = createSeed(),
      base = snapshotOf(state),
      targetHouseholdId = 'H01'
    const action = suggestActions(base, targetHouseholdId).find((a) => a.kind === 'can_opener')!
    const chosen = {
      action,
      targetHouseholdId,
      fingerprint: snapshotFingerprint(base),
      contextKey: contextFor(base, planningOptions(state.draft)).key,
    }
    const applied = applyAction(state, { type: 'preview', chosen })
    const manual = applyAction(state, {
      type: 'household',
      household: { ...state.households[0], tools: [...state.households[0].tools, 'can_opener'] },
    })
    expect(applied).toEqual(applyAction(manual, { type: 'recalculate' }))
    expect(applied.draft).toEqual(
      selectPlan(applyHypothesis(base, targetHouseholdId, action), planningOptions(state.draft)),
    )
    expect(applied.draft!.metrics.allocated).toBeGreaterThanOrEqual(state.draft!.metrics.allocated)

    expect(applied.approved).toBeNull()
    expect(() => applyAction(applied, { type: 'preview', chosen })).toThrow(/out of date/)
  })

  it('stores proposals separately until reviewed receipt and recreates the preview exactly', () => {
    const seed = createSeed(),
      base = snapshotOf(seed),
      householdId = 'H01'
    const action = suggestActions(base, householdId).find((a) => a.kind === 'donation')!
    if (action.kind !== 'donation') throw Error('Expected a donation action.')
    const chosen = {
      action,
      targetHouseholdId: householdId,
      fingerprint: snapshotFingerprint(base),
      contextKey: contextFor(base, planningOptions(seed.draft)).key,
    }
    const expected = applyHypothesis(base, householdId, action)
    const proposal = applyAction(seed, { type: 'preview', chosen })
    expect(proposal.lots).toBe(seed.lots)
    expect(proposal.draft).toBe(seed.draft)
    expect(proposal.proposals).toHaveLength(1)
    expect(applyAction(proposal, { type: 'preview', chosen })).toBe(proposal)
    const id = proposal.proposals[0].id
    expect(() => applyAction(proposal, { type: 'offer', id, step: 'receive' })).toThrow(/Review/)
    const reviewed = applyAction(decodeScenario(encodeScenario(proposal)), {
      type: 'offer',
      id,
      step: 'review',
    })
    const received = applyAction(reviewed, { type: 'offer', id, step: 'receive' })
    expect(snapshotOf(received)).toEqual(expected)
    expect(applyAction(received, { type: 'offer', id, step: 'receive' })).toBe(received)
    expect(received.approved).toBeNull()
    const draft = applyAction(received, { type: 'recalculate' }).draft!
    expect(allocationDigest(draft)).toBe(
      allocationDigest(selectPlan(expected, planningOptions(seed.draft))),
    )
    expect(draft.selection?.context.strategyId).toBe('approved-meals-first-v1/draft/coverage')
  })
})

it('keeps the packing evidence used for incumbent validation in the decision identity', () => {
  const state = createSeed()
  const opener = suggestActions(snapshotOf(state), 'H01').find((a) => a.kind === 'can_opener')!
  const snapshot = applyHypothesis(snapshotOf(state), 'H01', opener)
  const original = state.draft!
  const damaged = structuredClone(original)
  damaged.packingLists[0].items[0].quantity++
  const good = selectPlan(snapshot, planningOptions(original)),
    bad = selectPlan(snapshot, planningOptions(damaged))
  expect(good.selection.candidates.find((c) => c.kind === 'retain')?.valid).toBe(true)
  expect(bad.selection.candidates.find((c) => c.kind === 'retain')?.valid).toBe(false)
  expect(good.selection.context.incumbentDigest).toEqual(bad.selection.context.incumbentDigest)
  expect(good.selection.context.key).not.toEqual(bad.selection.context.key)
})

it('rejects a preview on the same snapshot after its baseline allocation changes', () => {
  const seed = createSeed()
  const snapshot = snapshotOf(seed),
    original = seed.draft!
  const chosen = {
    action: suggestActions(snapshot, 'H01', original)[0],
    targetHouseholdId: 'H01',
    fingerprint: snapshotFingerprint(snapshot),
    contextKey: contextFor(snapshot, planningOptions(original)).key,
  }
  const improved = applyAction(seed, { type: 'improveVariety', planId: original.id })
  expect(improved.draft!.selection?.allocationDigest).not.toEqual(
    original.selection?.allocationDigest,
  )
  expect(() => applyAction(improved, { type: 'preview', chosen })).toThrow(/out of date/)
})
